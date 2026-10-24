// AccountHub — the global identity + cloud-save service.
//
// One Durable Object owns *every* account and *every* cloud save, no matter
// which city district a player is standing in. That matters because the world
// is going to be sharded into district rooms later (Phase 2): a room must never
// own identity, or your wallet would vanish when you drive into the next cell.
//
// The routing logic lives in `handleApi`, a pure function over ({storage, …}),
// so it is unit-tested in Node with a memory storage stub — no wrangler, no
// WebSocket, no Cloudflare runtime needed. `account-hub-do.js` is the thin
// Durable Object wrapper that turns it into HTTP.
//
//   POST   /api/register {name, pin}
//   POST   /api/login    {name, pin}
//   POST   /api/logout   {token}            (Bearer header also accepted)
//   GET    /api/me                          -> account + save metadata
//   GET    /api/save                        -> the cloud save
//   PUT    /api/save    {save, baseRevision?}
//   DELETE /api/save                        -> wipe the cloud save
//   POST   /api/token    {token}            -> who is this token? (used by city rooms)
//   GET    /api/health
//
// Account rules (name + PIN, PBKDF2, lockout, token TTL) live in accounts.js;
// save rules (size, version, revisions) live in saves.js. This file only wires
// them together and never trusts the caller.

import {
  normalizeName,
  validPin,
  createAccount,
  verifyLogin,
  issueToken,
  resolveToken,
  revokeToken,
  accountCount,
} from './accounts.js';
import { validateSave, saveMeta, nextSaveRecord, MAX_SAVE_BODY_BYTES } from './saves.js';

const saveKey = (lower) => `save:${lower}`;

const AUTH_MESSAGES = {
  no_token: 'Sign in first.',
  unknown_token: 'That session has expired — sign in again.',
  bad_name: 'Names are 3–16 characters: letters, numbers, spaces, dots, dashes or underscores.',
  bad_pin: 'PINs are 4–32 letters or numbers.',
  name_taken: 'That name is already taken.',
  no_account: 'No account with that name yet — register instead.',
  locked: 'Too many wrong PINs. Wait a minute and try again.',
  slow_down: 'Slow down a moment.',
  bad_save: 'That save looks corrupted.',
  bad_version: 'That save is from a version we do not understand.',
  save_too_new: 'That save comes from a newer build of the game.',
  bad_cash: 'That save has an impossible cash value.',
  too_large: 'That save is too large.',
  revision_conflict: 'Your cloud save changed on another device — reload before saving.',
};

export function messageFor(code) {
  return AUTH_MESSAGES[code] || 'Something went wrong.';
}

/** What a client is allowed to know about another player's account. */
export function publicAccount(account) {
  if (!account) return null;
  return {
    name: account.name,
    nameLower: account.nameLower,
    playerId: account.playerId,
    createdAt: account.createdAt || 0,
  };
}

function header(headers, name) {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === lower) return v;
  }
  return '';
}

function tokenFrom(headers, body) {
  const bearer = String(header(headers, 'authorization') || '');
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim() || null;
  if (body && typeof body.token === 'string') return body.token;
  return null;
}

async function authenticate(storage, headers, body) {
  const token = tokenFrom(headers, body);
  if (!token) return { ok: false, code: 'no_token' };
  const res = await resolveToken(storage, token);
  if (!res.ok) return { ok: false, code: res.code };
  return { ok: true, account: res.account, token };
}

function fail(status, code, extra = {}) {
  return { status, body: { ok: false, code, message: messageFor(code), ...extra } };
}

function ok(body, status = 200) {
  return { status, body: { ok: true, ...body } };
}

/**
 * One HTTP request in, one response out.
 * @param {{method:string, path:string, headers?:object, body?:object|null, storage:object, now?:number}} req
 * @returns {Promise<{status:number, body:object}>}
 */
export async function handleApi({ method, path, headers = {}, body = null, storage, now = Date.now() }) {
  const route = String(path || '/').replace(/\/+$/, '') || '/';
  const verb = String(method || 'GET').toUpperCase();

  // ---- health -------------------------------------------------------------
  if (route === '/api/health' && verb === 'GET') {
    return ok({
      service: 'metroventure-accounts',
      api: 1,
      accounts: await accountCount(storage),
      now,
    });
  }

  // ---- register / login ---------------------------------------------------
  if ((route === '/api/register' || route === '/api/login') && verb === 'POST') {
    const name = normalizeName(body?.name);
    if (!name) return fail(400, 'bad_name');
    if (!validPin(body?.pin)) return fail(400, 'bad_pin');

    const registering = route === '/api/register';
    const result = registering
      ? await createAccount(storage, name, body.pin, `u_${crypto.randomUUID().slice(0, 8)}`)
      : await verifyLogin(storage, name, body.pin);

    if (!result.ok) {
      const status = result.code === 'locked' ? 429 : result.code === 'bad_pin' ? 401 : 400;
      return fail(status, result.code, {
        attemptsLeft: result.attemptsLeft,
        retryAfter: result.retryAfter,
      });
    }

    const account = result.account;
    const token = await issueToken(storage, account);
    const record = await storage.get(saveKey(account.nameLower));
    return ok({
      created: registering,
      token,
      account: publicAccount(account),
      accounts: await accountCount(storage),
      save: saveMeta(record),
    });
  }

  // ---- token resolution (used by the city rooms on join) -------------------
  if (route === '/api/token' && verb === 'POST') {
    const token = tokenFrom(headers, body);
    if (!token) return fail(401, 'no_token');
    const res = await resolveToken(storage, token);
    if (!res.ok) return fail(401, res.code);
    return ok({ account: publicAccount(res.account) });
  }

  // ---- logout -------------------------------------------------------------
  if (route === '/api/logout' && verb === 'POST') {
    const auth = await authenticate(storage, headers, body);
    if (!auth.ok) return fail(401, auth.code);
    await revokeToken(storage, auth.token, auth.account);
    return ok({ loggedOut: true });
  }

  // ---- cloud save ---------------------------------------------------------
  if (route === '/api/save') {
    const auth = await authenticate(storage, headers, body);
    if (!auth.ok) return fail(401, auth.code);
    const key = saveKey(auth.account.nameLower);

    if (verb === 'GET') {
      const record = await storage.get(key);
      if (!record) return ok({ save: null, meta: null });
      return ok({ save: record.save, meta: saveMeta(record) });
    }

    if (verb === 'PUT' || verb === 'POST') {
      const payload = body?.save ?? null;
      const validated = validateSave(payload);
      if (!validated.ok) {
        const status = validated.code === 'too_large' ? 413 : 400;
        return fail(status, validated.code, { bytes: validated.bytes });
      }
      const previous = await storage.get(key);
      const built = nextSaveRecord(previous, validated, {
        baseRevision: body?.baseRevision ?? null,
        now,
      });
      if (!built.ok) {
        return {
          status: 409,
          body: {
            ok: false, code: built.code, message: messageFor(built.code),
            revision: built.revision, updatedAt: built.updatedAt,
          },
        };
      }
      await storage.put(key, built.record);
      return ok({ meta: saveMeta(built.record) });
    }

    if (verb === 'DELETE') {
      await storage.delete(key);
      return ok({ deleted: true, meta: null });
    }
  }

  // ---- me -----------------------------------------------------------------
  if (route === '/api/me' && verb === 'GET') {
    const auth = await authenticate(storage, headers, body);
    if (!auth.ok) return fail(401, auth.code);
    const record = await storage.get(saveKey(auth.account.nameLower));
    return ok({ account: publicAccount(auth.account), save: saveMeta(record) });
  }

  return { status: 404, body: { ok: false, code: 'not_found', message: 'Unknown endpoint.' } };
}

/** Wrap a handler result as a JSON response with CORS. */
export function respond(result, extraHeaders = {}) {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      ...extraHeaders,
    },
  });
}

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

export { MAX_SAVE_BODY_BYTES };
