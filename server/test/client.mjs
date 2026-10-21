// End-to-end test for the *browser* NetClient against a running server.
//
// Works directly against the city server or through the dev proxy:
//   SERVER_URL=ws://127.0.0.1:8787/ws?room=client-test node test/client.mjs
//   SERVER_URL=ws://127.0.0.1:8080/ws?room=client-test node test/client.mjs
//
// Node 22 provides WebSocket and performance, so no browser or dependency is needed.

import { NetClient } from '../../web-openworld-game/src/net.js';

const URL = process.env.SERVER_URL || 'ws://127.0.0.1:8080/ws?room=client-test';

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name} ${detail}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3500) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await sleep(25);
  }
  return false;
}

const app = { skin: '#8d5524', shirt: '#3b82f6', pants: '#1f2937', hair: '#111111', hairStyle: 'short', build: 'Balanced' };
const stamp = Date.now() % 100000;

function makeClient(identity, hooks = {}) {
  const c = new NetClient({
    url: URL,
    identity,
    appearance: app,
    handlers: {
      onJoin: (p) => hooks.events?.push(`join:${p.id}`),
      onLeave: (id) => hooks.events?.push(`leave:${id}`),
      onStatus: (s) => hooks.events?.push(`status:${s}`),
      onAuth: (a) => hooks.events?.push(`auth:${a.name}`),
      onAuthError: (code) => hooks.errors?.push(code),
      onAuthRequired: () => hooks.authRequired?.push(true),
    },
  });
  hooks.created?.push(c);
  return c;
}

console.log(`\nNetClient end-to-end → ${URL}\n`);

// ---------------------------------------------------------------------------
// Guests (no account)
// ---------------------------------------------------------------------------
const events = [];
const a = makeClient({ mode: 'guest', name: 'Amara' }, { events });
a.connect();
check('guest reaches online', await until(() => a.connected));
check('guest is marked as a guest', a.account === false && a.name === 'Amara');
check('guest gets no saved position', a.restore === null);

// ---------------------------------------------------------------------------
// Accounts: register (via sign-in auto-create), token reuse, resume position
// ---------------------------------------------------------------------------
const authEvents = [];
const errors = [];
const name = `Ada${stamp}`;
const b = makeClient(null, { events: authEvents, errors });
b.connect();
check('no identity → client asks the UI for one', await until(() => b.status === 'auth_required'));

b.signIn(name, 'pin2468');
check('first sign-in creates the account', await until(() => b.connected && b.account === true), b.status);
check('sign-in reports the account name', authEvents.includes(`auth:${name}`));
check('a token is issued', typeof b.token === 'string' && b.token.length >= 32);

// Registering a taken name is refused explicitly.
const dupe = makeClient(null, { errors });
dupe.connect();
await until(() => dupe.status === 'auth_required');
dupe.register(name, 'different');
check('a taken name is reported, not silently overwritten', await until(() => errors.includes('name_taken')), errors.join(','));
dupe.disconnect();

// Wrong PIN on an existing account.
const c = makeClient(null, { events: authEvents, errors });
c.connect();
await until(() => c.status === 'auth_required');
c.signIn(name, 'wrongpin');
check('wrong PIN is rejected', await until(() => errors.includes('bad_pin')), errors.join(','));
check('a rejected PIN leaves you signed out', c.status === 'auth_required' || !c.connected);

// Correct PIN while the account is already online → explicit error, not a duplicate.
c.signIn(name, 'pin2468');
check('the same account cannot be online twice', await until(() => errors.includes('already_online')), errors.join(','));
b.disconnect();
await sleep(400);
c.signIn(name, 'pin2468');
check('correct PIN signs in once the other session is gone', await until(() => c.connected && c.account === true && c.name === name));

// Token reuse: an account that is not currently online rejoins with just the token.
const name2 = `Bayo${stamp}`;
const e = makeClient(null, { events: authEvents });
e.connect();
await until(() => e.status === 'auth_required');
e.signIn(name2, 'pin1357');
await until(() => e.connected);
const eToken = e.token;
e.disconnect();
await sleep(400);
const d = makeClient({ mode: 'token', token: eToken, name: name2 });
d.connect();
check('a stored token rejoins without a PIN', await until(() => d.connected && d.account === true && d.name === name2), d.status);

// Movement relay between A (guest) and B (account).
const ticker = setInterval(() => {
  a.update(1 / 60, { x: 0, z: 0, yaw: 0, moving: false, vehicle: null });
  d.update(1 / 60, { x: 6, z: 4, yaw: 1.2, moving: true, vehicle: 'sedan' });
  c.update(1 / 60, { x: 2, z: 2, yaw: 0, moving: false, vehicle: null });
  d.update(1 / 60, { x: 3, z: 3, yaw: 0, moving: false, vehicle: null });
}, 16);
await sleep(1400);
clearInterval(ticker);

const seenOnA = [...a.peers.values()].find((p) => p.name === name2);
check('peers are named from their account', !!seenOnA);
check('vehicle context is relayed', seenOnA?.veh === 'sedan', seenOnA?.veh);
check('positions are interpolated targets', (seenOnA?.tx || 0) > 0.5);

// Rate limiting on the client side: 60 fps ticks must not mean 60 msgs/s.
const rate = d.sendCount / 1.5;
check('client sends at ~10 Hz, not 60', rate <= 14, `${rate.toFixed(1)} msg/s`);
check('ping/pong produced an RTT', typeof a.rtt === 'number');

// Chat + appearance
a.say('hello city');
check('chat reaches other clients', await until(() => d.chat.some((m) => m.m === 'hello city')));
d.setAppearance({ ...app, shirt: '#22c55e' });
check('appearance changes propagate', await until(() => a.peers.get(d.id)?.app?.shirt === '#22c55e'));

// Position persistence: D logs off at a known spot, comes back there.
for (let i = 0; i < 12; i++) {
  d.update(1 / 60, { x: -42.5, z: 17.25, yaw: 0.5, moving: false, vehicle: null });
  await sleep(40);
}
const dToken = d.token;
const dName = d.name;
d.disconnect();
await sleep(400);
const resume = makeClient({ mode: 'token', token: dToken, name: dName });
resume.connect();
check('returning player gets their saved position back', await until(() => resume.connected));
check(
  'restore point matches where they left off',
  resume.restore && Math.abs(resume.restore.x + 42.5) < 1.5 && Math.abs(resume.restore.z - 17.25) < 1.5,
  JSON.stringify(resume.restore),
);

// Peer removal
const resumeId = resume.id;
resume.disconnect();
check('peer removal propagates', await until(() => !a.peers.has(resumeId)));
check('other clients stay online', a.connected && c.connected);

// Sign out revokes the token server-side.
const token = c.token;
c.signOut();
check('sign out clears local identity', c.token === null && c.status === 'offline');
await sleep(300);
const after = makeClient({ mode: 'token', token, name });
after.connect();
check('a signed-out token cannot be reused', await until(() => after.status === 'auth_required' || !after.connected));

a.disconnect();
e.disconnect();
after.disconnect();
await sleep(150);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('failures:', failures.join(', ')); process.exit(1); }
process.exit(0);
