// Name-based accounts for the city server.
//
// No email, no OAuth, no database: a display name plus a short PIN, stored per city
// in Durable Object storage. That is deliberate — the goal is *identity*, so that
// names are taken, vehicle keys and properties can belong to someone, and a returning
// player keeps their things. It is not a security boundary for anything valuable.
//
// Threat model, stated plainly:
//   ✓ stops two players using the same name
//   ✓ stops a passer-by from taking your name while you're away
//   ✗ someone who knows your PIN is you. There is no password reset, no email recovery
//   ✗ anyone who can read the storage can brute-force a 4-digit PIN offline
// When money, keys or real property matter, replace this with OAuth (see MULTIPLAYER.md).

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{2,15}$/;
const PIN_RE = /^[A-Za-z0-9]{4,32}$/;

// PBKDF2-SHA256. Deliberately modest: the Workers free plan allows ~10 ms CPU per
// invocation, and 100k iterations would blow that. Rate limiting (below) does the
// heavy lifting, and this is a game PIN, not a bank password.
export const PBKDF2_ITERATIONS = 10_000;
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 60_000;
export const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
export const MAX_TOKENS_PER_ACCOUNT = 5;

export function normalizeName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return NAME_RE.test(name) ? name : null;
}

export function validPin(raw) {
  return typeof raw === 'string' && PIN_RE.test(raw);
}

export function nameKey(name) {
  return String(name).toLowerCase();
}

// ---------------------------------------------------------------------------
// Crypto helpers (Web Crypto: available in Workers and Node 22)
// ---------------------------------------------------------------------------
const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 24) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return toHex(b.buffer);
}

export async function hashPin(pin, saltHex, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return toHex(bits);
}

// Constant-time-ish compare, so a wrong PIN doesn't leak its prefix by timing.
export function safeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Account store — all methods take a Durable Object `storage` instance
// ---------------------------------------------------------------------------
const acctKey = (nameLower) => `account:${nameLower}`;
const tokenKey = (token) => `token:${token}`;
const lockKey = (nameLower) => `lock:${nameLower}`;

export async function getAccount(storage, name) {
  return (await storage.get(acctKey(nameKey(name)))) || null;
}

/** @returns {{ok:true, account:object}|{ok:false, code:string}} */
export async function createAccount(storage, name, pin, playerId) {
  const clean = normalizeName(name);
  if (!clean) return { ok: false, code: 'bad_name' };
  if (!validPin(pin)) return { ok: false, code: 'bad_pin' };

  const existing = await getAccount(storage, clean);
  if (existing) return { ok: false, code: 'name_taken' };

  const salt = randomToken(16);
  const hash = await hashPin(pin, salt);
  const account = {
    name: clean,
    nameLower: nameKey(clean),
    playerId,
    salt,
    hash,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };
  await storage.put(acctKey(account.nameLower), account);
  return { ok: true, account };
}

/** @returns {{ok:true, account:object}|{ok:false, code:string, retryAfter?:number}} */
export async function verifyLogin(storage, name, pin) {
  const lower = nameKey(name);
  const lock = (await storage.get(lockKey(lower))) || { failures: 0, until: 0 };
  const now = Date.now();
  if (lock.until > now) return { ok: false, code: 'locked', retryAfter: Math.ceil((lock.until - now) / 1000) };

  const account = await storage.get(acctKey(lower));
  if (!account) return { ok: false, code: 'no_account' };

  const hash = await hashPin(pin, account.salt);
  if (!safeEqual(hash, account.hash)) {
    const failures = lock.failures + 1;
    const until = failures >= MAX_FAILURES ? now + LOCKOUT_MS : 0;
    await storage.put(lockKey(lower), { failures: until ? 0 : failures, until });
    return { ok: false, code: 'bad_pin', attemptsLeft: until ? 0 : MAX_FAILURES - failures };
  }

  await storage.delete(lockKey(lower));
  account.lastSeenAt = now;
  await storage.put(acctKey(lower), account);
  return { ok: true, account };
}

/** Issue a session token for an account. Old tokens are pruned beyond a small cap. */
export async function issueToken(storage, account) {
  const token = randomToken();
  const now = Date.now();
  const tokens = Array.isArray(account.tokens) ? account.tokens.filter((t) => t.expiresAt > now) : [];
  tokens.push({ token, expiresAt: now + TOKEN_TTL_MS, createdAt: now });
  while (tokens.length > MAX_TOKENS_PER_ACCOUNT) {
    const dropped = tokens.shift();
    await storage.delete(tokenKey(dropped.token));
  }
  account.tokens = tokens;
  await storage.put(acctKey(account.nameLower), account);
  await storage.put(tokenKey(token), { nameLower: account.nameLower, expiresAt: now + TOKEN_TTL_MS });
  return token;
}

/** @returns {{ok:true, account:object}|{ok:false, code:string}} */
export async function resolveToken(storage, token) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return { ok: false, code: 'unknown_token' };
  const rec = await storage.get(tokenKey(token));
  if (!rec) return { ok: false, code: 'unknown_token' };
  if (rec.expiresAt <= Date.now()) {
    await storage.delete(tokenKey(token));
    return { ok: false, code: 'unknown_token' };
  }
  const account = await storage.get(acctKey(rec.nameLower));
  if (!account) return { ok: false, code: 'unknown_token' };
  return { ok: true, account };
}

export async function revokeToken(storage, token, account) {
  if (token) await storage.delete(tokenKey(token));
  if (account?.tokens) {
    account.tokens = account.tokens.filter((t) => t.token !== token);
    await storage.put(acctKey(account.nameLower), account);
  }
}

/** Per-city counter so /health and the client can show how many names exist. */
export async function accountCount(storage) {
  const list = await storage.list({ prefix: 'account:' });
  return list.size;
}
