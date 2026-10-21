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
async function until(fn, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await sleep(25);
  }
  return false;
}

function makeClient(name, appearance) {
  const c = new NetClient({
    url: URL,
    name,
    appearance,
    handlers: {
      onJoin: (p) => events.push(`join:${p.id}`),
      onLeave: (id) => events.push(`leave:${id}`),
      onStatus: (s) => events.push(`status:${s}`),
    },
  });
  return c;
}

const events = [];
const app = { skin: '#8d5524', shirt: '#3b82f6', pants: '#1f2937', hair: '#111111', hairStyle: 'short', build: 'Balanced' };

console.log(`\nNetClient end-to-end → ${URL}\n`);

const a = makeClient('Amara', app);
const b = makeClient('Bayo', { ...app, shirt: '#ef4444' });
a.connect();
check('A reaches online', await until(() => a.connected));
b.connect();
check('B reaches online', await until(() => b.connected));

check('A discovers B as a peer', await until(() => a.peers.size === 1));
check('B discovers A as a peer', await until(() => b.peers.size === 1));
const peerOfA = [...a.peers.values()][0];
check('handshake carries name and appearance', peerOfA.name === 'Bayo' && peerOfA.app?.shirt === '#ef4444', JSON.stringify(peerOfA));

// Drive both clients at 60 fps, walking B north-east.
let local = { x: 0, z: 0, yaw: 0, moving: false, vehicle: null };
const ticker = setInterval(() => {
  a.update(1 / 60, { x: 0, z: 0, yaw: 0, moving: false, vehicle: null });
  b.update(1 / 60, local);
  local = { ...local, z: local.z + 0.1, x: local.x + 0.05 };
}, 16);

await sleep(1200);
clearInterval(ticker);

const seen = [...a.peers.values()][0];
check('A receives B positions', seen && seen.tx > 1 && seen.tz > 1, JSON.stringify(seen));
check('A marks B visible', seen?.visible === true);
check('positions are interpolated targets, not the local player', seen?.tx !== 0);

// Outbound rate: B ticks at 60 fps but must only send ~10 msgs/s.
const rate = b.sendCount / 1.3;
check('client sends at ~10 Hz, not 60', rate <= 13, `${rate.toFixed(1)} msg/s`);
check('ping/pong produced an RTT', typeof a.rtt === 'number' && a.rtt >= 0, String(a.rtt));

// Chat relay.
b.say('hello city');
check('chat reaches the other client', await until(() => a.chat.some((m) => m.m === 'hello city')));
check('chat message is attributed', a.chat.at(-1).name === 'Bayo');

// Appearance change without reconnect.
b.setAppearance({ ...app, shirt: '#22c55e' });
check('appearance updates propagate', await until(() => a.peers.get(b.id)?.app?.shirt === '#22c55e'));

// Leaving.
const bId = b.id;
b.disconnect();
check('peer removal propagates', await until(() => !a.peers.has(bId)));
check('A stays online after B leaves', a.connected);

a.disconnect();
check('disconnect is final, no reconnect loop', a.status === 'offline' && a.ws === null);
check('status changes were reported', events.includes('status:online'));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('failures:', failures.join(', ')); process.exit(1); }
process.exit(0);
