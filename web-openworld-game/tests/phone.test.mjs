import test from 'node:test';
import assert from 'node:assert/strict';

const HOUR = 3600 * 1000;

// ---------------------------------------------------------------------------
// 1. Catalog & clock
// ---------------------------------------------------------------------------
test('Phone: app catalog has a home grid, a dock and unique icons', async () => {
  const P = await import('../src/phone.js');
  assert.ok(P.PHONE_APPS.length >= 10, `apps (${P.PHONE_APPS.length})`);
  const ids = P.PHONE_APPS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'app ids are unique');
  for (const a of P.PHONE_APPS) {
    assert.ok(a.name && a.icon && /^#[0-9a-f]{6}$/i.test(a.tone), `${a.id} has a name/icon/tone`);
    assert.ok(a.hint.length > 3);
  }
  for (const id of P.PHONE_DOCK) assert.ok(P.appById(id), `${id} is in the dock and the grid`);
  assert.equal(P.appById('nope'), null);
  // the apps the city already has must be reachable from the phone
  for (const id of ['garage', 'university', 'jobs', 'messages', 'wallet', 'map', 'build', 'settings']) {
    assert.ok(P.appById(id), `${id} app`);
  }
});

test('Phone: clock and virtual calendar', async () => {
  const P = await import('../src/phone.js');
  assert.deepEqual(P.clockParts(8 * HOUR), { hour: 8, minute: '00', suffix: 'AM', label: '8:00', full: '8:00AM' });
  assert.deepEqual(P.clockParts(19 * HOUR + 45 * 60000).full, '7:45PM');
  assert.equal(P.clockParts(0).full, '12:00AM');
  assert.equal(P.clockParts(12 * HOUR).full, '12:00PM');

  assert.equal(P.calendarFor(1).label, 'Friday 23 October');
  assert.equal(P.calendarFor(2).label, 'Saturday 24 October');
  assert.equal(P.calendarFor(8).label, 'Friday 30 October');
  const roll = P.calendarFor(31);
  assert.equal(roll.month, 'November', 'the calendar rolls into the next month');
  assert.ok(roll.dayOfMonth <= 30);
  assert.equal(P.calendarFor(0).label, P.calendarFor(1).label, 'day 0 clamps to day 1');
});

test('Phone: day phase pill and battery', async () => {
  const P = await import('../src/phone.js');
  assert.equal(P.phaseInfo(6 * HOUR).band, 'dawn');
  assert.equal(P.phaseInfo(12 * HOUR).label, 'Daylight');
  assert.equal(P.phaseInfo(18.5 * HOUR).band, 'dusk');
  assert.equal(P.phaseInfo(23 * HOUR).label, 'Night mode');
  assert.ok(P.batteryLevel(9 * HOUR) > 70);
  assert.ok(P.batteryLevel(3 * HOUR) < 70);
});

// ---------------------------------------------------------------------------
// 2. Home screen & inbox
// ---------------------------------------------------------------------------
test('Phone: home banner follows your live situation', async () => {
  const P = await import('../src/phone.js');
  const Eco = await import('../src/economy.js');
  const s = Eco.createInitialState();

  assert.equal(P.homeBanner(s, 0).title, 'Enrolment is open');

  s.activeJob = 'courier';
  assert.equal(P.homeBanner(s, 0).app, 'jobs');
  assert.match(P.homeBanner(s, 0).title, /Express Courier/);
  s.activeJob = null;

  s.leisure.hotel = { room: 201, nights: 2, roomType: 'standard' };
  const hotel = P.homeBanner(s, 0);
  assert.equal(hotel.app, 'wallet');
  assert.match(hotel.title, /Room 201/);
  s.leisure.hotel = null;

  assert.equal(P.homeBanner(s, 3).app, 'messages');
});

test('Phone: message threads ping only when something is live and clear when read', async () => {
  const P = await import('../src/phone.js');
  const Eco = await import('../src/economy.js');
  const s = Eco.createInitialState();

  const fresh = P.messagesFor(s);
  assert.equal(fresh.length, 5);
  assert.equal(P.unreadCount(s, new Set()), 0, 'nothing to read on a fresh save');

  s.activeJob = 'courier';
  s.leisure.hotel = { room: 201, nights: 1, roomType: 'standard' };
  const pending = P.messagesFor(s);
  assert.equal(P.unreadCount(s, new Set()), 2, 'the job and the hotel ping');
  assert.ok(pending.find((t) => t.id === 'dispatch').lines[0].text.includes('Express Courier'));

  const seen = new Set(['dispatch']);
  assert.equal(P.unreadCount(s, seen), 1);
  assert.equal(P.messagesFor(s, seen).find((t) => t.id === 'dispatch').unread, false);
  assert.equal(P.appBadges(s, seen).messages, 1);
});

// ---------------------------------------------------------------------------
// 3. App cards
// ---------------------------------------------------------------------------
test('Phone: garage rows expose condition, health and roadside quotes', async () => {
  const P = await import('../src/phone.js');
  const Eco = await import('../src/economy.js');
  const s = Eco.createInitialState();

  const rows = P.garageRows(s);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Rusty Hatchback');
  assert.equal(rows[0].health, 'Excellent');
  assert.equal(rows[0].repairCost, 0);
  assert.equal(rows[0].canRefuel, false);

  s.vehicles[0].cond.hp = 18;
  s.vehicles[0].cond.fuel = 0;
  const damaged = P.garageRows(s)[0];
  assert.equal(damaged.health, 'Critical');
  assert.ok(damaged.repairCost > 0, 'a damaged car has a roadside quote');
  assert.equal(damaged.canRefuel, true);

  s.vehicles[0].cond.hp = 0;
  assert.equal(P.garageRows(s)[0].wrecked, true);
});

test('Phone: university card tracks the enrolled course, credits and GPA', async () => {
  const P = await import('../src/phone.js');
  const Uni = await import('../src/university.js');
  const Eco = await import('../src/economy.js');
  const s = Eco.createInitialState();

  const empty = P.uniCard(s);
  assert.equal(empty.enrolled, false);
  assert.equal(empty.matricNo, 'MGU-2026-0101');

  const course = Uni.UNIVERSITY_COURSES[0];
  s.academic.activeCourseId = course.id;
  s.academic.enrolledIds = [course.id];
  s.academic.creditsByCourse = { [course.id]: Math.floor(course.creditsRequired / 2) };
  s.academic.gpa = 3.5;
  const card = P.uniCard(s);
  assert.equal(card.enrolled, true);
  assert.equal(card.code, course.code);
  assert.equal(card.title, course.title);
  assert.equal(card.degree, course.degreeAward);
  assert.equal(card.required, course.creditsRequired);
  assert.ok(card.progress > 0.4 && card.progress < 0.6);
  assert.equal(card.gpa, 3.5);
});

test('Phone: jobs card tracks rank, pay and startups', async () => {
  const P = await import('../src/phone.js');
  const Eco = await import('../src/economy.js');
  const s = Eco.createInitialState();

  const idle = P.jobCard(s);
  assert.equal(idle.clockedIn, false);
  assert.equal(idle.name, 'Unemployed');

  s.activeJob = 'courier';
  s.jobXP.courier = 400;
  const job = P.jobCard(s);
  assert.equal(job.clockedIn, true);
  assert.equal(job.name, 'Express Courier');
  assert.equal(job.pay, 220);
  assert.equal(job.rank.name, 'Pro');
  assert.ok(job.rank.progress > 0 && job.rank.progress < 1);
});

test('Phone: wallet, build and map cards', async () => {
  const P = await import('../src/phone.js');
  const Eco = await import('../src/economy.js');
  const s = Eco.createInitialState();
  s.stats.totalEarned = 1250;
  s.stats.tasksCompleted = 6;

  const w = P.walletCard(s);
  assert.equal(w.cash, s.cash);
  assert.equal(w.earned, 1250);
  assert.equal(w.tasks, 6);
  assert.equal(w.vehicles, 1);

  s.builds.pieces = [
    { id: 'a', item: 'block_stone', x: 0, y: 0, z: 0, rot: 0, color: '#ffffff' },
    { id: 'b', item: 'block_glass', x: 1, y: 0, z: 0, rot: 0, color: '#ffffff' },
    { id: 'c', item: 'wall_solid', x: 2, y: 0, z: 0, rot: 0, color: '#ffffff' },
  ];
  const b = P.buildCard(s);
  assert.equal(b.pieces, 3);
  assert.equal(b.blocks, 2);
  assert.equal(b.structures, 1);
  assert.ok(b.blockTypes >= 12);

  const near = P.nearbyPlaces(0, 0, 5);
  assert.equal(near.length, 5);
  for (let i = 1; i < near.length; i++) assert.ok(near[i].distance >= near[i - 1].distance, 'sorted by distance');
  assert.ok(near.every((p) => p.distance >= 0 && p.name && p.icon));
  const spawn = P.nearbyPlaces(-12.5, -15, 3);
  assert.ok(spawn[0].distance < 120, 'the spawn point has places nearby');
});

// ---------------------------------------------------------------------------
// 4. Screens render as pure strings
// ---------------------------------------------------------------------------
const HOUR_MS = 3600 * 1000;

async function makeVm(overrides = {}) {
  const P = await import('../src/phone.js');
  const Eco = await import('../src/economy.js');
  const state = Eco.createInitialState();
  const seen = new Set();
  return {
    Phone: P,
    vm: {
      state, now: 21 * HOUR_MS + 45 * 60000, seen,
      thread: null, player: { x: -12.5, z: -15 }, cameraFirst: false, muted: false,
      ...overrides,
    },
  };
}

function attrs(html, name) {
  const out = [];
  const re = new RegExp(`data-${name}="([^"]+)"`, 'g');
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

test('Phone UI: every screen renders real markup with valid targets', async () => {
  const View = await import('../src/phoneview.js');
  const { Phone, vm } = await makeVm();

  const home = View.homeHtml(vm);
  assert.match(home, /phone-clock/);
  assert.match(home, /9:45/);
  assert.match(home, /Friday 23 October/);
  assert.match(home, /Metro City/);
  assert.match(home, /Night mode/);
  const tiles = attrs(home, 'phone-app');
  assert.ok(tiles.length >= 14, `home grid + dock tiles (${tiles.length})`);
  for (const id of tiles) assert.ok(id === 'home' || Phone.appById(id), `${id} is a real app`);

  const known = new Set(['home', ...Phone.PHONE_APPS.map((a) => a.id)]);
  for (const app of Phone.PHONE_APPS) {
    const html = View.screenHtml(vm, app.id);
    assert.ok(html.length > 150, `${app.id} renders content`);
    assert.doesNotMatch(html, /undefined|NaN/, `${app.id} has no blank values`);
    for (const id of attrs(html, 'phone-app')) assert.ok(known.has(id), `${app.id} links to ${id}`);
    for (const act of attrs(html, 'phone-act')) {
      assert.ok(View.PHONE_ACTIONS.includes(act), `${app.id} uses known action ${act}`);
    }
  }

  const status = View.statusHtml(vm.now);
  assert.match(status, /9:45PM/);
  assert.match(status, /84%/);
});

test('Phone UI: messages list opens threads and live data flows into screens', async () => {
  const View = await import('../src/phoneview.js');
  const { Phone, vm } = await makeVm();
  vm.state.activeJob = 'courier';
  vm.state.leisure.hotel = { room: 201, nights: 2, roomType: 'standard' };

  const list = View.screenHtml(vm, 'messages');
  const threads = attrs(list, 'phone-thread');
  assert.equal(threads.length, 5);
  assert.match(list, /2 new/);

  const thread = View.screenHtml({ ...vm, thread: 'dispatch' }, 'messages');
  assert.match(thread, /phone-thread/);
  assert.match(thread, /Express Courier/);
  assert.match(thread, /phone-bubble me/);

  const jobs = View.screenHtml(vm, 'jobs');
  assert.match(jobs, /Express Courier/);
  assert.match(jobs, /Clock out/);

  const home = View.homeHtml(vm);
  assert.match(home, /shift is live/);
});

test('Phone UI: garage actions carry the vehicle id and the quote', async () => {
  const View = await import('../src/phoneview.js');
  const { vm } = await makeVm();
  vm.state.vehicles[0].cond.hp = 40;
  const html = View.screenHtml(vm, 'garage');
  assert.match(html, /data-phone-act="repair" data-veh="v1"/);
  assert.match(html, /data-phone-act="refuel" data-veh="v1"/);
  assert.match(html, /Worn/);
  assert.match(html, /Roadside repair \$/);
  assert.doesNotMatch(html, /disabled>[\s\S]*?Roadside repair/, 'a worn car can be repaired');
});

test('Phone UI: the map lists the nearest landmarks', async () => {
  const View = await import('../src/phoneview.js');
  const { vm } = await makeVm();
  const html = View.screenHtml(vm, 'map');
  assert.match(html, /You are here/);
  assert.match(html, /Express Courier Depot/);
  assert.match(html, /\d+ m/);
  assert.match(html, /Civic|Job HQ|Fuel|Dealer|Shop|Campus/);
});
