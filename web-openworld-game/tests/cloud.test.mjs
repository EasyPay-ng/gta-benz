import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CloudClient, httpOrigin, mapCloudError, saveEnvelope, shouldTakeCloudSave, syncLabel, cloudMessageFor,
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

test('Cloud: a newer cloud save wins over an older local one, and only then', () => {
  assert.equal(shouldTakeCloudSave({ updatedAt: 500 }, 100), true);
  assert.equal(shouldTakeCloudSave({ updatedAt: 100 }, 500), false);
  assert.equal(shouldTakeCloudSave(null, 0), false);
  assert.equal(shouldTakeCloudSave({ updatedAt: 0 }, 0), false);
});

test('Cloud: sync status reads like a sentence, including the bad endings', () => {
  assert.equal(syncLabel(null), 'Cloud save: idle');
  assert.equal(syncLabel({ ok: true, body: { meta: { revision: 7 } } }), 'Cloud save: revision 7');
  assert.equal(syncLabel({ ok: false, error: { quota: true } }), 'Cloud save: daily quota reached');
  assert.equal(syncLabel({ ok: false, error: { code: 'offline' } }), 'Cloud save: offline');
  assert.match(syncLabel({ ok: false, error: { code: 'bad_save', message: 'Nope.' } }), /Nope\./);
});
