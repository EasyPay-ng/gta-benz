// Tests for scripts/deploy.sh — the retry wrapper around `wrangler deploy`.
//
// The interesting behaviour is which failures get retried. Cloudflare's first-deploy
// race (code 10007, "This Worker does not exist") is transient and worth retrying
// because the upload already happened; an authentication error must fail immediately,
// otherwise a bad token looks like a flaky server for four attempts and then reports
// the wrong cause.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, chmod, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'deploy.sh');

/** Run the deploy script with a stub command and no real waiting. */
async function runDeploy({ stubBody, waits = '0 0 0' }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'mv-deploy-'));
  const stub = path.join(dir, 'stub-wrangler');
  const counter = path.join(dir, 'count');
  await writeFile(stub, `#!/usr/bin/env bash\nCOUNT_FILE="${counter}"\n${stubBody}\n`);
  await chmod(stub, 0o755);

  const outputFile = path.join(dir, 'github-output');
  await writeFile(outputFile, '');

  const result = await new Promise((resolve) => {
    execFile('bash', [SCRIPT], {
      env: { ...process.env, WRANGLER_CMD: stub, DEPLOY_WAITS: waits, GITHUB_OUTPUT: outputFile },
      timeout: 20_000,
    }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
  result.output = await readFile(outputFile, 'utf8').catch(() => '');
  result.attempts = (result.stdout.match(/deploy attempt/g) || []).length;
  return result;
}

test('deploy.sh: a transient 10007 is retried until the upload sticks', async () => {
  const res = await runDeploy({
    stubBody: `
n=$(cat "$COUNT_FILE" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$COUNT_FILE"
echo "Uploaded metroventure-city (1.07 sec)"
if [ "$n" -lt 3 ]; then
  echo "  This Worker does not exist on your account. [code: 10007]"
  exit 1
fi
echo "  https://metroventure-city.example.workers.dev"`,
  });
  assert.equal(res.code, 0, res.stdout + res.stderr);
  assert.equal(res.attempts, 3);
  assert.match(res.stdout, /Deployed on attempt 3/);
  assert.match(res.output, /^url=https:\/\/metroventure-city\.example\.workers\.dev$/m,
    'the URL is handed to the workflow as an output');
});

test('deploy.sh: an authentication error fails on the first attempt', async () => {
  const res = await runDeploy({
    stubBody: `echo "  Authentication error [code: 10000]"; exit 1`,
  });
  assert.equal(res.code, 1);
  assert.equal(res.attempts, 1, 'a bad token must not be retried four times');
  assert.match(res.stdout, /not the retryable first-deploy race/);
  assert.equal(res.output.trim(), '', 'no URL is reported for a failed deploy');
});

test('deploy.sh: a race that never clears gives up with an actionable message', async () => {
  const res = await runDeploy({
    stubBody: `echo "Uploaded metroventure-city (1.07 sec)"; echo "  This Worker does not exist on your account. [code: 10007]"; exit 1`,
    waits: '0 0',
  });
  assert.equal(res.code, 1);
  assert.equal(res.attempts, 3, '1 initial + 2 waits');
  assert.match(res.stdout, /Re-run all jobs/);
  assert.match(res.stdout, /not a\nproblem with the repo, the token, or the account|problem with the repo, the token, or the account/);
});

test('deploy.sh: a successful first attempt does not retry at all', async () => {
  const res = await runDeploy({
    stubBody: `echo "Uploaded metroventure-city (1.0 sec)"; echo "  https://metroventure-city.example.workers.dev"`,
  });
  assert.equal(res.code, 0);
  assert.equal(res.attempts, 1);
  assert.equal(res.output.trim(), 'url=https://metroventure-city.example.workers.dev');
});

test('deploy.sh: a deploy with no URL warns but still succeeds', async () => {
  const res = await runDeploy({ stubBody: `echo "Uploaded metroventure-city (1.0 sec)"` });
  assert.equal(res.code, 0);
  assert.match(res.stdout, /::warning::.*no workers\.dev URL/);
  assert.equal(res.output.trim(), '');
});
