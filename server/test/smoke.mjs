// Smoke test for the city server. No dependencies: Node 22 ships a global WebSocket.
//
//   npm run dev          # in one terminal (wrangler dev --port 8787)
//   npm test             # in another
//
// Override the target with SERVER_URL=ws://localhost:8787/ws?room=test npm test

import { RoomClock, CLOCK_SPEED, CLOCK_TICK_MS, formatClockPayload } from '../src/city-clock.js';

const URL = process.env.SERVER_URL || 'ws://127.0.0.1:8787/ws?room=test';
const ROOM_URL = URL.includes('room=') ? URL : `${URL}?room=test`;

let passed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

function client({ name, x = 0, z = 0, yaw = 0 }) {
  const ws = new WebSocket(ROOM_URL);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    msg.__at = Date.now();
    inbox.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(msg)) {
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('socket error')));
  });
  return {
    ws,
    inbox,
    ready,
    send: (obj) => ws.send(JSON.stringify(obj)),
    join: () => ws.send(JSON.stringify({ t: 'join', name, x, z, yaw, app: { skin: '#8d5524', shirt: '#3b82f6' } })),
    waitFor(pred, ms = 2500) {
      const found = inbox.find(pred);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${pred}`)), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      });
    },
    close: () => ws.close(1000, 'done'),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`\nMetroVenture city server smoke test → ${ROOM_URL}\n`);

// --- RoomClock unit checks (persistence + 30s tick + empty-room resume) ---
{
  const kv = new Map();
  const storage = {
    async get(k) { return kv.get(k); },
    async put(k, v) { kv.set(k, structuredClone(v)); },
  };
  const rc1 = new RoomClock(storage);
  const { clock: w0, nextTickAt } = await rc1.onJoin(1_000_000, true);
  check('RoomClock starts at Day 1 · 08:00', w0.day === 1 && w0.hhmm === '08:00', JSON.stringify(w0));
  check('RoomClock schedules next broadcast in 30 real s', nextTickAt === 1_000_000 + CLOCK_TICK_MS, String(nextTickAt));
  let broadcasted = null;
  await rc1.maybeTick(1_000_000 + CLOCK_TICK_MS, (msg) => { broadcasted = msg; });
  check('30 real s tick advances city time by 12 in-game min (08:12)', broadcasted?.t === 'clock' && broadcasted?.hhmm === '08:12', JSON.stringify(broadcasted));
  await rc1.onEmpty(1_000_000 + CLOCK_TICK_MS);
  // Simulate DO eviction and cold restart 2.5 real minutes later (1 hour in-game = 09:12)
  const rc2 = new RoomClock(storage);
  const { clock: wAfter } = await rc2.onJoin(1_000_000 + CLOCK_TICK_MS + 150_000, true);
  check('RoomClock resumes continuously across empty-room restart', wAfter.hhmm === '09:12' && wAfter.inGameMs > broadcasted.inGameMs, JSON.stringify(wAfter));
  check('formatClockPayload rolls Day counter cleanly', formatClockPayload(24 * 3_600_000 * 2 + 5 * 3_600_000).day === 3 && CLOCK_SPEED === 24);
}

const a = client({ name: 'Amara', x: 0, z: 0 });
await a.ready;
a.join();
const welcomeA = await a.waitFor((m) => m.t === 'welcome');
check('A gets a welcome with an id', typeof welcomeA.id === 'string' && welcomeA.id.startsWith('p_'), JSON.stringify(welcomeA));
check('welcome carries the 5 Hz tick', welcomeA.tick === 200);
check(
  'welcome includes authoritative city clock { inGameMs, day, hhmm }',
  welcomeA.clock
    && typeof welcomeA.clock.inGameMs === 'number'
    && welcomeA.clock.day >= 1
    && /^\d{2}:\d{2}$/.test(welcomeA.clock.hhmm),
  JSON.stringify(welcomeA.clock),
);

const b = client({ name: 'Bayo', x: 5, z: 0 });
await b.ready;
b.join();
const welcomeB = await b.waitFor((m) => m.t === 'welcome');
check('B is told about A on join', welcomeB.peers.some((p) => p.id === welcomeA.id && p.name === 'Amara'));
check(
  'B receives monotonic room clock >= A',
  welcomeB.clock && welcomeB.clock.inGameMs >= welcomeA.clock.inGameMs,
  `${welcomeA.clock?.inGameMs} -> ${welcomeB.clock?.inGameMs}`,
);

const joinForA = await a.waitFor((m) => m.t === 'join' && m.id === welcomeB.id);
check('A is told B joined', joinForA.name === 'Bayo' && joinForA.app.skin === '#8d5524');
check('server assigned distinct ids', welcomeA.id !== welcomeB.id);

// Movement relay: B walks, A should see it in a snapshot within a couple of ticks.
b.send({ t: 'pos', x: 12.5, z: -4.25, yaw: 1.2345, mv: 1, veh: null });
const snap = await a.waitFor(
  (m) => m.t === 'snap' && m.p?.some((row) => row[0] === welcomeB.id && Math.abs(row[1] - 12.5) < 0.01 && Math.abs(row[2] + 4.25) < 0.1),
);
const row = snap.p.find((r) => r[0] === welcomeB.id);
check('snapshot relays B position to A', Math.abs(row[1] - 12.5) < 0.01 && Math.abs(row[2] + 4.25) < 0.1);
check('snapshot includes movement flag', row[4] === 1);
check('snapshot is rounded, not raw floats', String(row[3]).length <= 5, String(row[3]));
check('snapshot excludes the recipient', !snap.p.some((r) => r[0] === welcomeA.id));

// Emote relay: B performs 'dance_a' and A receives it in row[6]
b.send({ t: 'pos', x: 12.5, z: -4.25, yaw: 1.23, mv: 0, veh: null, emote: 'dance_a' });
const emoteSnap = await a.waitFor(
  (m) => m.t === 'snap' && m.p?.some((r) => r[0] === welcomeB.id && r[6] === 'dance_a'),
);
check('snapshot relays active emote in row[6]', !!emoteSnap);

// Interest culling: move B far away and it should disappear from A's snapshot.
const beforeCull = a.inbox.length;
b.send({ t: 'pos', x: 300, z: 300, yaw: 0, mv: 0, veh: null });
await sleep(600);
const afterCull = a.inbox.slice(beforeCull).filter((m) => m.t === 'snap');
check(
  'far-away players are culled from snapshots',
  afterCull.length > 0 && afterCull.every((m) => !m.p.some((r) => r[0] === welcomeB.id)),
);

// Validation: out-of-bounds and junk input are clamped, not trusted.
b.send({ t: 'pos', x: 999999, z: -999999, yaw: 'nope', mv: 'yes' });
await sleep(400);
check('out-of-range coordinates are clamped', b.inbox.every((m) => m.t !== 'error'));

// Ping/pong (used by the client for an RTT readout).
a.send({ t: 'ping', ts: 1234 });
const pong = await a.waitFor((m) => m.t === 'pong');
check('ping is answered with the same ts', pong.ts === 1234 && typeof pong.now === 'number');

// Malformed input is rejected without killing the socket.
a.ws.send('not json at all');
const err = await a.waitFor((m) => m.t === 'error' && m.code === 'bad_json');
check('malformed frames get a bad_json error', !!err);
check('socket stays open after a bad frame', a.ws.readyState === WebSocket.OPEN);

// Rate limiting: 60 messages in a burst should trip the 30/s budget.
for (let i = 0; i < 60; i++) a.send({ t: 'ping', ts: i });
const limited = await a.waitFor((m) => m.t === 'error' && m.code === 'rate_limited', 3000);
check('burst traffic is rate limited', !!limited);

// Leave is broadcast to the room.
b.close();
const left = await a.waitFor((m) => m.t === 'leave' && m.id === welcomeB.id);
check('room is told when a player leaves', !!left);

a.close();
await sleep(250);

// Empty-room reconnect: clock persists and advances monotonically while room had 0 sockets.
const c = client({ name: 'Chioma', x: 0, z: 0 });
await c.ready;
c.join();
const welcomeC = await c.waitFor((m) => m.t === 'welcome');
check(
  'room clock stays monotonic across empty-room reconnect',
  welcomeC.clock && welcomeC.clock.inGameMs > welcomeA.clock.inGameMs,
  `${welcomeA.clock?.inGameMs} -> ${welcomeC.clock?.inGameMs}`,
);
c.close();
await sleep(150);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
process.exit(0);
