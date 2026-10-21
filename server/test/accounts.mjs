// Auth protocol tests: register / login / lockout / tokens / name ownership.
//
//   npm run dev            # city server on :8787
//   node test/accounts.mjs
//
// Each run uses a fresh room so accounts from earlier runs don't collide.

import {
  normalizeName,
  validPin,
  hashPin,
  safeEqual,
  createAccount,
  verifyLogin,
  issueToken,
  resolveToken,
  revokeToken,
  MAX_FAILURES,
} from '../src/accounts.js';

const URL = process.env.SERVER_URL || 'ws://127.0.0.1:8787/ws?room=acct-test';
const ROOM_URL = URL.includes('room=') ? `${URL.split('&')[0]}&room=auth-${Date.now()}` : `${URL}?room=auth-${Date.now()}`;

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name} ${detail}`); }
}

// ---------------------------------------------------------------------------
// Pure helpers (no network)
// ---------------------------------------------------------------------------
console.log('\naccounts.js helpers\n');
check('names are trimmed and validated', normalizeName('  Amara  ') === 'Amara');
check('names reject CSS/HTML-ish junk', normalizeName('<script>') === null);
check('names reject leading punctuation', normalizeName('-drop table') === null);
check('3-16 chars enforced', normalizeName('ab') === null && normalizeName('a'.repeat(17)) === null);
check('pins must be 4-32 alnum', validPin('1234') && validPin('abcd1234') && !validPin('12') && !validPin('12 34'));
check('spaces collapse in names', normalizeName('Ada   Lovelace') === 'Ada Lovelace');

const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const h1 = await hashPin('1234', salt);
const h2 = await hashPin('1234', salt);
check('hashing is deterministic for the same salt', h1 === h2);
check('different salt gives a different hash', (await hashPin('1234', 'ffffffffffffffffffffffffffffffff')) !== h1);
check('hash is 32 bytes of hex', /^[0-9a-f]{64}$/.test(h1));
check('safeEqual is correct', safeEqual(h1, h1) && !safeEqual(h1, h2.slice(0, -1) + (h2.endsWith('0') ? '1' : '0')));

// Tiny in-memory stand-in for Durable Object storage.
function memStorage() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.get(k); },
    async put(k, v) { map.set(k, structuredClone(v)); },
    async delete(k) { map.delete(k); },
    async list({ prefix = '' } = {}) {
      const out = new Map();
      for (const [k, v] of map) if (k.startsWith(prefix)) out.set(k, v);
      return out;
    },
  };
}

const store = memStorage();
const reg = await createAccount(store, 'Amara', '1234', 'u_test1');
check('account is created', reg.ok === true);
check('duplicate name is rejected, case-insensitively', (await createAccount(store, 'amara', '9999', 'u_x')).code === 'name_taken');
check('bad pin is rejected at creation', (await createAccount(store, 'Bayo', '1', 'u_x')).code === 'bad_pin');
check('correct pin logs in', (await verifyLogin(store, 'AMARA', '1234')).ok === true);
check('wrong pin is rejected', (await verifyLogin(store, 'Amara', '0000')).code === 'bad_pin');
check('unknown account is reported', (await verifyLogin(store, 'Nobody', '1234')).code === 'no_account');

// Lockout after repeated failures.
for (let i = 0; i < MAX_FAILURES; i++) await verifyLogin(store, 'Amara', 'nope');
const locked = await verifyLogin(store, 'Amara', '1234');
check('account locks after repeated failures', locked.code === 'locked' && locked.retryAfter > 0, JSON.stringify(locked));

// Tokens.
const acc = (await verifyLogin(store, 'Amara', '1234')).account || (await store.get('account:amara'));
const t1 = await issueToken(store, acc);
check('token resolves back to the account', (await resolveToken(store, t1)).account.nameLower === 'amara');
check('garbage tokens are rejected', (await resolveToken(store, 'zzzz')).code === 'unknown_token');
await revokeToken(store, t1, null);
check('revoked token stops working', (await resolveToken(store, t1)).code === 'unknown_token');

// ---------------------------------------------------------------------------
// Protocol over the wire
// ---------------------------------------------------------------------------
console.log('\nprotocol\n');

function client() {
  const ws = new WebSocket(ROOM_URL);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    inbox.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(msg)) { waiters[i].resolve(msg); waiters.splice(i, 1); }
    }
  });
  return {
    ws,
    inbox,
    ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }),
    send: (o) => ws.send(JSON.stringify(o)),
    waitFor(pred, ms = 3000) {
      const hit = inbox.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`timeout: ${pred}`)), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(timer); res(m); } });
      });
    },
    close() { ws.close(1000, 'done'); },
  };
}

const name = `Amara${Date.now() % 10000}`;
const a = client();
await a.ready;

a.send({ t: 'register', name, pin: 'hashpin99' });
const reg1 = await a.waitFor((m) => m.t === 'auth');
check('register returns ok, name, playerId and token', reg1.ok && reg1.name === name && reg1.token?.length >= 32 && /^u_/.test(reg1.playerId));
check('first registration is flagged as created', reg1.created === true);

a.send({ t: 'join', token: reg1.token, app: { shirt: '#3b82f6' } });
const welcome = await a.waitFor((m) => m.t === 'welcome');
check('join with token produces a welcome', welcome.you?.account === true && welcome.you.name === name);
check('welcome includes you + peers + tick', welcome.peers.length === 0 && welcome.tick === 200);

// A second device logs in with the same credentials.
const b = client();
await b.ready;
b.send({ t: 'login', name, pin: 'hashpin99' });
const login2 = await b.waitFor((m) => m.t === 'auth');
check('login returns a fresh token', login2.ok && login2.token !== reg1.token);
check('login is not flagged as created', login2.created === false);

b.send({ t: 'join', token: login2.token });
const dupe = await b.waitFor((m) => m.t === 'welcome' || (m.t === 'error' && m.code === 'already_online'));
check('the same account cannot be online twice', dupe.code === 'already_online', JSON.stringify(dupe));

// Wrong pin.
const c = client();
await c.ready;
c.send({ t: 'login', name, pin: 'wrongpin' });
const bad = await c.waitFor((m) => m.t === 'auth');
check('wrong pin is refused with attemptsLeft', bad.ok === false && bad.code === 'bad_pin' && bad.attemptsLeft >= 0, JSON.stringify(bad));

// Name taken.
c.send({ t: 'register', name: `  ${name.toUpperCase()}  `, pin: 'otherpin' });
const taken = await c.waitFor((m) => m.t === 'auth' && m.code === 'name_taken');
check('registration is case-insensitive on names', !!taken);

// Unknown token.
c.send({ t: 'join', token: 'deadbeef'.repeat(4) });
check('unknown token is rejected', (await c.waitFor((m) => m.t === 'error' && m.code === 'unknown_token')).code === 'unknown_token');

// Guests: no account, but still named, and collisions get a suffix.
c.send({ t: 'join', name, app: null });
const guest = await c.waitFor((m) => m.t === 'welcome');
check('a guest can play without an account', guest.you.account === false && guest.you.name !== name, JSON.stringify(guest.you));
check('guest names cannot impersonate a signed-in account', / \d+$/.test(guest.you.name) || guest.you.name !== name);

// Logging out revokes the token.
a.send({ t: 'logout' });
check('logout is acknowledged', (await a.waitFor((m) => m.t === 'auth' && m.loggedOut)).loggedOut === true);
const d = client();
await d.ready;
d.send({ t: 'join', token: reg1.token });
check('a logged-out token cannot rejoin', (await d.waitFor((m) => m.t === 'error' && m.code === 'unknown_token')).code === 'unknown_token');

for (const cl of [a, b, c, d]) cl.close();
await new Promise((r) => setTimeout(r, 200));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('failures:', failures.join(', ')); process.exit(1); }
process.exit(0);
