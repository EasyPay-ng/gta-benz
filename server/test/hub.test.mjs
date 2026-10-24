// AccountHub unit tests — no wrangler, no WebSocket, no network.
//
// The hub's rules live in `src/account-hub.js` (a pure function over a storage
// object) and `src/saves.js`, so they can be exercised with a memory stub. That
// matters on the free plan: these are the tests that keep auth and cloud saves
// correct without spending a single Durable Object request.

import test from 'node:test';
import assert from 'node:assert/strict';

import { handleApi } from '../src/account-hub.js';
import { validateSave, nextSaveRecord, saveMeta, MAX_SAVE_BYTES } from '../src/saves.js';

/** Minimal Durable Object storage: get / put / delete / list({prefix}). */
function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  return {
    map,
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : undefined; },
    async put(key, value) { map.set(key, structuredClone(value)); },
    async delete(key) { return map.delete(key); },
    async list({ prefix = '' } = {}) {
      const out = new Map();
      for (const [k, v] of map) if (k.startsWith(prefix)) out.set(k, structuredClone(v));
      return out;
    },
  };
}

const api = (storage, method, path, { body, token, now } = {}) => handleApi({
  method,
  path,
  body: body ?? null,
  headers: token ? { authorization: `Bearer ${token}` } : {},
  storage,
  now,
});

const goodSave = (cash = 250) => ({ version: 10, cash, appearance: { name: 'Ada' }, buildings: [] });

// ---------------------------------------------------------------------------
// 1. Identity
// ---------------------------------------------------------------------------
test('Hub: register issues a token and an empty cloud save', async () => {
  const storage = memoryStorage();
  const res = await api(storage, 'POST', '/api/register', { body: { name: 'Amara', pin: '1234' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.created, true);
  assert.equal(res.body.account.name, 'Amara');
  assert.match(res.body.account.playerId, /^u_/);
  assert.ok(res.body.token.length >= 32);
  assert.equal(res.body.save, null);
  assert.equal(res.body.accounts, 1);
  assert.equal(res.body.account.salt, undefined, 'never leak the salt');
  assert.equal(res.body.account.hash, undefined, 'never leak the hash');
});

test('Hub: names are unique, validated, and PINs are enforced', async () => {
  const storage = memoryStorage();
  await api(storage, 'POST', '/api/register', { body: { name: 'Amara', pin: '1234' } });

  const dupe = await api(storage, 'POST', '/api/register', { body: { name: '  amara ', pin: '9999' } });
  assert.equal(dupe.body.ok, false);
  assert.equal(dupe.body.code, 'name_taken');

  const badName = await api(storage, 'POST', '/api/register', { body: { name: '<script>', pin: '1234' } });
  assert.equal(badName.body.code, 'bad_name');

  const badPin = await api(storage, 'POST', '/api/register', { body: { name: 'Benz', pin: '12' } });
  assert.equal(badPin.body.code, 'bad_pin');

  const noAccount = await api(storage, 'POST', '/api/login', { body: { name: 'Nobody', pin: '1234' } });
  assert.equal(noAccount.body.code, 'no_account');
});

test('Hub: wrong PINs lock the account out, and the right PIN still works afterwards', async () => {
  const storage = memoryStorage();
  await api(storage, 'POST', '/api/register', { body: { name: 'Tunde', pin: 'correct1' } });

  for (let i = 0; i < 5; i++) {
    const res = await api(storage, 'POST', '/api/login', { body: { name: 'Tunde', pin: 'wrong' } });
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, 'bad_pin');
  }
  const locked = await api(storage, 'POST', '/api/login', { body: { name: 'Tunde', pin: 'wrong' } });
  assert.equal(locked.body.code, 'locked');
  assert.equal(locked.status, 429);
  assert.ok(locked.body.retryAfter > 0);

  // even the right PIN waits out the lockout …
  const during = await api(storage, 'POST', '/api/login', { body: { name: 'Tunde', pin: 'correct1' } });
  assert.equal(during.body.code, 'locked');

  // … and once the lock expires the account works normally again
  storage.map.set('lock:tunde', { failures: 0, until: 0 });
  const good = await api(storage, 'POST', '/api/login', { body: { name: 'Tunde', pin: 'correct1' } });
  assert.equal(good.body.ok, true);
  assert.ok(good.body.token);
});

// ---------------------------------------------------------------------------
// 2. Tokens
// ---------------------------------------------------------------------------
test('Hub: a token identifies exactly one account and dies on logout', async () => {
  const storage = memoryStorage();
  const reg = await api(storage, 'POST', '/api/register', { body: { name: 'Ada', pin: 'abcd1234' } });
  const token = reg.body.token;

  const me = await api(storage, 'GET', '/api/me', { token });
  assert.equal(me.body.ok, true);
  assert.equal(me.body.account.name, 'Ada');

  const resolved = await api(storage, 'POST', '/api/token', { body: { token } });
  assert.equal(resolved.body.account.nameLower, 'ada');

  const out = await api(storage, 'POST', '/api/logout', { token });
  assert.equal(out.body.ok, true);

  const after = await api(storage, 'GET', '/api/me', { token });
  assert.equal(after.status, 401);
  assert.equal(after.body.code, 'unknown_token');

  const anon = await api(storage, 'GET', '/api/me', {});
  assert.equal(anon.body.code, 'no_token');
});

// ---------------------------------------------------------------------------
// 3. Cloud saves
// ---------------------------------------------------------------------------
test('Hub: a save round-trips and revisions prevent silent overwrites', async () => {
  const storage = memoryStorage();
  const reg = await api(storage, 'POST', '/api/register', { body: { name: 'Kemi', pin: '1234' } });
  const token = reg.body.token;

  const empty = await api(storage, 'GET', '/api/save', { token });
  assert.equal(empty.body.ok, true);
  assert.equal(empty.body.save, null);

  const first = await api(storage, 'PUT', '/api/save', { token, body: { save: goodSave(300), baseRevision: 0 } });
  assert.equal(first.body.ok, true);
  assert.equal(first.body.meta.revision, 1);
  assert.ok(first.body.meta.bytes > 0);

  const loaded = await api(storage, 'GET', '/api/save', { token });
  assert.equal(loaded.body.save.cash, 300);
  assert.equal(loaded.body.meta.revision, 1);

  // a client that saw revision 1 may write revision 2 …
  const second = await api(storage, 'PUT', '/api/save', { token, body: { save: goodSave(999), baseRevision: 1 } });
  assert.equal(second.body.meta.revision, 2);

  // … but a second device still holding revision 1 must not clobber it
  const conflict = await api(storage, 'PUT', '/api/save', { token, body: { save: goodSave(1), baseRevision: 1 } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'revision_conflict');
  assert.equal(conflict.body.revision, 2);

  const after = await api(storage, 'GET', '/api/save', { token });
  assert.equal(after.body.save.cash, 999);

  // a forced write (no baseRevision) always wins and bumps the revision
  const forced = await api(storage, 'PUT', '/api/save', { token, body: { save: goodSave(777) } });
  assert.equal(forced.body.meta.revision, 3);
});

test('Hub: saves are per account and can be wiped', async () => {
  const storage = memoryStorage();
  const a = await api(storage, 'POST', '/api/register', { body: { name: 'Ade', pin: '1234' } });
  const b = await api(storage, 'POST', '/api/register', { body: { name: 'Bola', pin: '1234' } });
  await api(storage, 'PUT', '/api/save', { token: a.body.token, body: { save: goodSave(111) } });
  await api(storage, 'PUT', '/api/save', { token: b.body.token, body: { save: goodSave(222) } });

  const sa = await api(storage, 'GET', '/api/save', { token: a.body.token });
  const sb = await api(storage, 'GET', '/api/save', { token: b.body.token });
  assert.equal(sa.body.save.cash, 111);
  assert.equal(sb.body.save.cash, 222);

  const wiped = await api(storage, 'DELETE', '/api/save', { token: a.body.token });
  assert.equal(wiped.body.ok, true);
  const gone = await api(storage, 'GET', '/api/save', { token: a.body.token });
  assert.equal(gone.body.save, null);
  const stillThere = await api(storage, 'GET', '/api/save', { token: b.body.token });
  assert.equal(stillThere.body.save.cash, 222);
});

test('Hub: bad saves are rejected before they touch storage', async () => {
  const storage = memoryStorage();
  const reg = await api(storage, 'POST', '/api/register', { body: { name: 'Ngozi', pin: '1234' } });
  const token = reg.body.token;

  const noSave = await api(storage, 'PUT', '/api/save', { token, body: {} });
  assert.equal(noSave.status, 400);
  assert.equal(noSave.body.code, 'bad_save');

  const future = await api(storage, 'PUT', '/api/save', { token, body: { save: { version: 99, cash: 1 } } });
  assert.equal(future.body.code, 'save_too_new');

  const negative = await api(storage, 'PUT', '/api/save', { token, body: { save: { version: 10, cash: -5 } } });
  assert.equal(negative.body.code, 'bad_cash');

  const huge = { version: 10, cash: 5, blob: 'x'.repeat(MAX_SAVE_BYTES + 1024) };
  const tooBig = await api(storage, 'PUT', '/api/save', { token, body: { save: huge } });
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.body.code, 'too_large');
  assert.equal(storage.map.has('save:ngozi'), false, 'nothing was written');
});

test('Hub: unauthenticated save access is refused', async () => {
  const storage = memoryStorage();
  const get = await api(storage, 'GET', '/api/save', {});
  assert.equal(get.status, 401);
  assert.equal(get.body.code, 'no_token');
  const put = await api(storage, 'PUT', '/api/save', { body: { save: goodSave() } });
  assert.equal(put.status, 401);
  assert.equal(put.body.code, 'no_token');
});

// ---------------------------------------------------------------------------
// 4. Save envelope rules
// ---------------------------------------------------------------------------
test('Saves: validation strips prototype keys and reports byte size', () => {
  const dirty = JSON.parse('{"version":10,"cash":5,"__proto__":{"polluted":true},"nested":{"constructor":"x","ok":1}}');
  const res = validateSave(dirty);
  assert.equal(res.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(res.save, '__proto__'), false, 'prototype key dropped');
  assert.equal(Object.prototype.polluted, undefined, 'global prototype untouched');
  assert.equal(Object.prototype.hasOwnProperty.call(res.save.nested, 'constructor'), false);
  assert.equal(res.save.nested.ok, 1);
  assert.ok(res.bytes > 0);
});

test('Saves: revisions increment and conflicts are explicit', () => {
  const validated = validateSave(goodSave(10));
  const fresh = nextSaveRecord(null, validated, { now: 1000 });
  assert.equal(fresh.record.revision, 1);
  assert.equal(fresh.record.updatedAt, 1000);

  const second = nextSaveRecord(fresh.record, validated, { now: 2000 });
  assert.equal(second.record.revision, 2);

  const stale = nextSaveRecord(second.record, validated, { baseRevision: 1, now: 3000 });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'revision_conflict');
  assert.equal(stale.revision, 2);

  assert.deepEqual(saveMeta(second.record), {
    revision: 2, updatedAt: 2000, bytes: validated.bytes, version: 10, playtimeMs: 0,
  });
});

test('Hub: unknown routes and health', async () => {
  const storage = memoryStorage();
  const health = await api(storage, 'GET', '/api/health', {});
  assert.equal(health.body.ok, true);
  assert.equal(health.body.service, 'metroventure-accounts');

  const nope = await api(storage, 'GET', '/api/nope', {});
  assert.equal(nope.status, 404);
  assert.equal(nope.body.code, 'not_found');

  const trailing = await api(storage, 'GET', '/api/health/', {});
  assert.equal(trailing.body.ok, true, 'trailing slash is tolerated');
});
