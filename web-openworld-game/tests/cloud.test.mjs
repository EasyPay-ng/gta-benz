import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CloudClient, httpOrigin, mapCloudError, saveEnvelope, bootPolicy, syncLabel, cloudMessageFor,
  offlineAllowed, normalizeServerUrl, probeServer, classifyServerAddress, NO_SERVER_HINT,
} from '../src/cloud.js';

/** A fetch double that records requests and replays canned responses. */
function fakeFetch(responses = []) {
  const calls = [];
  const queue = [...responses];
  const fn = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const next = queue.shift() || { status: 200, json: { ok: true } };
    if (next.throws) throw next.throws;
    return {
      ok: (next.status || 200) < 400,
      status: next.status || 200,
      json: async () => next.json,
    };
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------------
// 1. Addressing & errors
// ---------------------------------------------------------------------------
test('Cloud: the WebSocket URL is turned into an HTTP API origin', () => {
  assert.equal(httpOrigin('ws://127.0.0.1:8787/ws?room=metro-1'), 'http://127.0.0.1:8787');
  assert.equal(httpOrigin('wss://city.example.com/ws'), 'https://city.example.com');
  assert.equal(httpOrigin('http://localhost:8080/ws?room=client-test'), 'http://localhost:8080');
  assert.equal(httpOrigin(''), null);
  assert.equal(httpOrigin(null), null);
});

test('Cloud: HTTP failures become codes the UI can act on', () => {
  assert.equal(mapCloudError(401, { code: 'bad_pin' }).code, 'bad_pin');
  assert.equal(mapCloudError(401, { code: 'bad_pin' }).message, cloudMessageFor('bad_pin'));
  assert.equal(mapCloudError(409, { code: 'revision_conflict' }).code, 'revision_conflict');

  const quota = mapCloudError(429, null);
  assert.equal(quota.quota, true);
  assert.equal(quota.code, 'quota');
  assert.match(quota.message, /00:00 UTC/);

  // Cloudflare's own quota error arrives as a bare 429 from the platform
  assert.equal(mapCloudError(429, { error: 'quota exceeded' }).quota, true);
  assert.equal(mapCloudError(503, null).code, 'network');
  assert.equal(mapCloudError(400, { code: 'bad_save' }).message, cloudMessageFor('bad_save'));
});

// ---------------------------------------------------------------------------
// 2. Accounts
// ---------------------------------------------------------------------------
test('Cloud: register posts the credentials and remembers the token', async () => {
  const f = fakeFetch([{ status: 200, json: { ok: true, token: 'tok_123', account: { name: 'Ada' }, accounts: 3, save: null } }]);
  const cloud = new CloudClient({ serverUrl: 'ws://127.0.0.1:8787/ws', fetchImpl: f });

  const res = await cloud.register('Ada', '1234');
  assert.equal(res.ok, true);
  assert.equal(cloud.token, 'tok_123');
  assert.equal(f.calls[0].url, 'http://127.0.0.1:8787/api/register');
  assert.deepEqual(f.calls[0].body, { name: 'Ada', pin: '1234' });
  assert.equal(f.calls[0].init.headers.authorization, undefined, 'no token on register');
});

test('Cloud: login failures carry the server code, and never store a token', async () => {
  const f = fakeFetch([{ status: 401, json: { ok: false, code: 'bad_pin', attemptsLeft: 3 } }]);
  const cloud = new CloudClient({ serverUrl: 'ws://127.0.0.1:8787/ws', fetchImpl: f });

  const res = await cloud.login('Ada', '0000');
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'bad_pin');
  assert.equal(res.error.attemptsLeft, 3);
  assert.equal(cloud.token, null);
});

test('Cloud: logout clears the local token even if the server is unreachable', async () => {
  const f = fakeFetch([{ throws: Object.assign(new Error('boom'), { name: 'TypeError' }) }]);
  const cloud = new CloudClient({ serverUrl: 'ws://127.0.0.1:8787/ws', fetchImpl: f, token: 'tok_123' });
  const res = await cloud.logout();
  assert.equal(res.ok, false);
  assert.equal(cloud.token, null);
  assert.equal(res.error.code, 'offline');
});

// ---------------------------------------------------------------------------
// 3. Cloud saves
// ---------------------------------------------------------------------------
test('Cloud: loading a save sends the bearer token and returns the blob', async () => {
  const f = fakeFetch([{ status: 200, json: { ok: true, save: { version: 10, cash: 42 }, meta: { revision: 4, updatedAt: 99 } } }]);
  const cloud = new CloudClient({ serverUrl: 'ws://127.0.0.1:8787/ws', fetchImpl: f, token: 'tok_123' });

  const res = await cloud.loadSave();
  assert.equal(res.ok, true);
  assert.equal(res.body.save.cash, 42);
  assert.equal(res.body.meta.revision, 4);
  assert.equal(f.calls[0].init.headers.authorization, 'Bearer tok_123');
  assert.equal(f.calls[0].init.method, 'GET');
});

test('Cloud: saving sends the envelope and the revision it is based on', async () => {
  const f = fakeFetch([{ status: 200, json: { ok: true, meta: { revision: 5, bytes: 900 } } }]);
  const cloud = new CloudClient({ serverUrl: 'ws://127.0.0.1:8787/ws', fetchImpl: f, token: 'tok_123' });

  const res = await cloud.save({ version: 10, cash: 10 }, { baseRevision: 4 });
  assert.equal(res.ok, true);
  assert.equal(res.body.meta.revision, 5);
  assert.equal(f.calls[0].init.method, 'PUT');
  assert.deepEqual(f.calls[0].body, { save: { version: 10, cash: 10 }, baseRevision: 4 });
});

test('Cloud: a revision conflict is reported, not swallowed', async () => {
  const f = fakeFetch([{ status: 409, json: { ok: false, code: 'revision_conflict', revision: 9 } }]);
  const cloud = new CloudClient({ serverUrl: 'ws://127.0.0.1:8787/ws', fetchImpl: f, token: 'tok_123' });
  const res = await cloud.save({ version: 10, cash: 1 });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'revision_conflict');
});

test('Cloud: a used-up free quota reads as quota and offers no retry loop', async () => {
  const f = fakeFetch([{ status: 429, json: null }]);
  const cloud = new CloudClient({ serverUrl: 'ws://127.0.0.1:8787/ws', fetchImpl: f, token: 'tok_123' });
  const res = await cloud.save({ version: 10, cash: 1 });
  assert.equal(res.ok, false);
  assert.equal(res.error.quota, true);
  assert.equal(res.error.retryAfter, 0);
});

test('Cloud: an unreachable server degrades to offline instead of throwing', async () => {
  const cloud = new CloudClient({ serverUrl: 'ws://127.0.0.1:8787/ws', fetchImpl: null });
  const res = await cloud.loadSave();
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'offline');

  const aborting = new CloudClient({
    serverUrl: 'ws://127.0.0.1:8787/ws',
    fetchImpl: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; },
  });
  const timeout = await aborting.loadSave();
  assert.equal(timeout.error.code, 'network');
});

// ---------------------------------------------------------------------------
// 4. Envelope & merge policy
// ---------------------------------------------------------------------------
test('Cloud: the uploaded envelope keeps the save and drops runtime-only flags', () => {
  const state = {
    version: 10, cash: 500, groceries: { pantry: { milk: 2 } },
    modal: true, modalShop: 'x', phoneOpen: true, phoneApp: 'groceries', phoneSeen: {}, loginOpen: false, helpOpen: false,
  };
  const env = saveEnvelope(state);
  assert.equal(env.cash, 500);
  assert.deepEqual(env.groceries.pantry, { milk: 2 });
  assert.equal(env.modal, undefined);
  assert.equal(env.phoneOpen, undefined);
  assert.equal(env.helpOpen, undefined);
  assert.equal(saveEnvelope(null), null);
});

test('Cloud: a reachable server deletes the offline save instead of migrating it', () => {
  const online = bootPolicy('ws://127.0.0.1:8787/ws?room=metro-1', true);
  assert.equal(online.online, true);
  assert.equal(online.useCloud, true);
  assert.equal(online.purgeLocalSave, true, 'offline progress is wiped, not uploaded');

  // nothing local to delete → nothing to purge, but the cloud is still the save
  const clean = bootPolicy('wss://city.example.com/ws', false);
  assert.equal(clean.purgeLocalSave, false);
  assert.equal(clean.useCloud, true);

  // no server anywhere: the dev/offline harness keeps its local save
  const offline = bootPolicy(null, true, { allowOffline: true });
  assert.equal(offline.online, false);
  assert.equal(offline.blocked, false);
  assert.equal(offline.useCloud, false);
  assert.equal(offline.purgeLocalSave, false);

  // a URL that is not a server is not a server
  assert.equal(bootPolicy('', true).online, false);
});

test('Cloud: the public build is blocked without a server, localhost is not', () => {
  assert.equal(offlineAllowed('https://easypay-ng.github.io/gta-benz/'), false);
  assert.equal(offlineAllowed('https://gta-benz.example.com/?x=1'), false);
  assert.equal(offlineAllowed('http://localhost:8080/'), true);
  assert.equal(offlineAllowed('http://127.0.0.1:8080/?offline=1'), true);
  assert.equal(offlineAllowed('file:///home/me/gta-benz/web-openworld-game/index.html'), true);

  // GitHub Pages, no ?server= and no /net.json: there is no game to play
  const blocked = bootPolicy(null, true, { allowOffline: offlineAllowed('https://easypay-ng.github.io/gta-benz/') });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.online, false);
  assert.equal(blocked.purgeLocalSave, false, 'nothing is deleted while the world is unreachable');
});

test('Cloud: a pasted server address becomes a dialable WebSocket URL', () => {
  assert.equal(normalizeServerUrl('wss://city.example.com/ws'), 'wss://city.example.com/ws');
  assert.equal(normalizeServerUrl('https://city.example.com/ws?room=metro-1'), 'wss://city.example.com/ws?room=metro-1');
  assert.equal(normalizeServerUrl('city.example.com/ws'), 'ws://city.example.com/ws');
  assert.equal(normalizeServerUrl('ws://127.0.0.1:8787/ws'), 'ws://127.0.0.1:8787/ws');
  assert.equal(normalizeServerUrl('   '), null);
  assert.equal(normalizeServerUrl('ftp://city.example.com/ws'), null);
  assert.equal(normalizeServerUrl(null), null);
});

test('Cloud: sync status reads like a sentence, including the bad endings', () => {
  assert.equal(syncLabel(null), 'Cloud save: idle');
  assert.equal(syncLabel({ ok: true, body: { meta: { revision: 7 } } }), 'Cloud save: revision 7');
  assert.equal(syncLabel({ ok: false, error: { quota: true } }), 'Cloud save: daily quota reached');
  assert.equal(syncLabel({ ok: false, error: { code: 'offline' } }), 'Cloud save: offline');
  assert.match(syncLabel({ ok: false, error: { code: 'bad_save', message: 'Nope.' } }), /Nope\./);
});

// ---------------------------------------------------------------------------
// 5. The offline gate
// ---------------------------------------------------------------------------
/** A WebSocket stand-in that behaves however the test asks it to. */
function fakeSocket(mode, log = []) {
  return class {
    constructor(url) {
      log.push(url);
      if (mode === 'throw') throw new Error('bad url');
      this.onopen = null;
      this.onerror = null;
      this.onclose = null;
      queueMicrotask(() => {
        if (mode === 'open') this.onopen?.();
        else if (mode === 'error') this.onerror?.();
      });
    }
    close() { /* no-op */ }
  };
}

test('Gate: a server is probed before it is saved, and a dead one is refused', async () => {
  const good = await probeServer('ws://127.0.0.1:8787/ws', { WebSocketImpl: fakeSocket('open') });
  assert.deepEqual(good, { ok: true, code: 'open' });

  const dead = await probeServer('ws://127.0.0.1:9/ws', { WebSocketImpl: fakeSocket('error') });
  assert.deepEqual(dead, { ok: false, code: 'unreachable' });

  const broken = await probeServer('ws://nope', { WebSocketImpl: fakeSocket('throw') });
  assert.deepEqual(broken, { ok: false, code: 'bad_url' });

  assert.deepEqual(await probeServer('ws://x', { WebSocketImpl: null }), { ok: false, code: 'unsupported' });
  assert.deepEqual(await probeServer('', { WebSocketImpl: fakeSocket('open') }), { ok: false, code: 'unsupported' });
});

test('Gate: a server that never answers times out instead of hanging the page', async () => {
  class Silent {
    constructor() { this.onopen = null; this.onerror = null; this.onclose = null; }
    close() { /* no-op */ }
  }
  const started = Date.now();
  const res = await probeServer('wss://silent.example.com/ws', { WebSocketImpl: Silent, timeoutMs: 60 });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'timeout');
  assert.ok(Date.now() - started < 1500, 'gave up quickly');
});

// ---------------------------------------------------------------------------
// 6. What did the player actually paste?
// ---------------------------------------------------------------------------
test('Gate: pasting the game link is called out instead of "nothing answered"', () => {
  const gameLink = 'wss://easypay-ng.github.io/gta-benz/?server=wss%3A%2F%2Fworker.workers.dev%2Fws';
  const verdict = classifyServerAddress(gameLink);
  assert.equal(verdict.kind, 'game_link');
  assert.match(verdict.message, /link to the game, not to a city server/);

  // the plain shared link is the same mistake
  assert.equal(classifyServerAddress('https://easypay-ng.github.io/gta-benz/?server=wss%3A%2F%2Fx').kind, 'game_link');
});

test('Gate: a static host is named, because it can never run the server', () => {
  const verdict = classifyServerAddress('wss://easypay-ng.github.io/ws');
  assert.equal(verdict.kind, 'static_host');
  assert.match(verdict.message, /cannot run a server/);
  assert.match(verdict.message, /Deploy the Worker/);

  assert.equal(classifyServerAddress('https://anything.netlify.app/ws').kind, 'static_host');
  assert.equal(classifyServerAddress('https://my-worker.workers.dev/ws').kind, 'server');
});

test('Gate: a real host without the /ws endpoint is told what is missing', () => {
  const verdict = classifyServerAddress('wss://my-worker.workers.dev');
  assert.equal(verdict.kind, 'no_ws_path');
  assert.match(verdict.message, /\/ws/);

  assert.equal(classifyServerAddress('wss://my-worker.workers.dev/ws').kind, 'server');
  assert.equal(classifyServerAddress('wss://my-worker.workers.dev/ws?room=metro-1').kind, 'server');
  assert.equal(classifyServerAddress('').kind, 'invalid');
  assert.equal(classifyServerAddress('not a url at all !!).').kind, 'invalid');
  assert.match(NO_SERVER_HINT, /workers\.dev\/ws\?room=/);
});
