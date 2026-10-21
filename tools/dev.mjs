#!/usr/bin/env node
// One command to run the game *and* the city server locally.
//
//   npm run dev           game + multiplayer on http://localhost:8080
//   npm run dev:offline   game only (no /net.json -> single-player)
//
// Starts `wrangler dev` in server/ and the static+proxy dev server in tools/.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const offline = process.env.OFFLINE === '1' || process.argv.includes('--offline');
const children = [];

function run(name, cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...env } });
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`\n[${name}] exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) { try { c.kill('SIGTERM'); } catch { /* gone */ } }
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (!offline) {
  run('city-server', 'npx', ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1'], path.join(ROOT, 'server'));
}

run(
  'dev-server',
  process.execPath,
  [path.join(ROOT, 'tools', 'dev-server.mjs')],
  ROOT,
  offline ? { OFFLINE: '1' } : {},
);
