import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return nextResolve(new URL('../vendor/three.module.min.js', '${import.meta.url}').href, context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`);

function makeCanvas(w = 256, h = 256) {
  const data = new Uint8ClampedArray(w * h * 4);
  const noop = () => {};
  const grad = () => ({ addColorStop: noop });
  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '16px sans-serif',
    textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: noop, clearRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, rect: noop, roundRect: noop,
    clip: noop, arc: noop, ellipse: noop, fill: noop, stroke: noop, fillText: noop,
    save: noop, restore: noop, translate: noop, rotate: noop,
    createLinearGradient: grad, createRadialGradient: grad,
    createImageData: (iw, ih) => ({ data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih }),
    getImageData: (_x, _y, iw, ih) => ({ data: data.subarray(0, iw * ih * 4), width: iw, height: ih }),
    putImageData: noop,
  };
  return { width: w, height: h, getContext: () => ctx };
}
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {}) };

const fakeState = () => {
  const { createLeisureState } = globalThis.__props;
  return { cash: 1000, activeJob: 'courier', jobXP: { courier: 10 }, stats: { totalEarned: 0 }, leisure: createLeisureState() };
};

// ---------------------------------------------------------------------------
// 1. Rest, energy & wellbeing
// ---------------------------------------------------------------------------
test('Wellbeing: energy drains while moving, regenerates while seated, fitness boosts sprint', async () => {
  const P = await import('../src/props.js');
  globalThis.__props = P;
  const leisure = P.createLeisureState();
  assert.equal(leisure.energy, P.MAX_ENERGY);
  assert.equal(leisure.comfort, 78);

  P.tickLeisure(leisure, 10, { sprinting: true, moving: true });
  const afterSprint = leisure.energy;
  assert.ok(afterSprint < P.MAX_ENERGY, 'sprinting drains energy');
  P.tickLeisure(leisure, 10, { moving: true });
  assert.ok(leisure.energy < afterSprint, 'walking drains more');

  const seated = P.createLeisureState();
  seated.energy = 40;
  P.tickLeisure(seated, 30, { seated: true });
  assert.ok(seated.energy > 40, 'sitting restores energy');
  assert.ok(seated.comfort > 78, 'sitting restores comfort');

  const tired = P.createLeisureState();
  tired.energy = 4;
  assert.ok(P.sprintMultiplier(tired) < 0.8, 'exhaustion slows the sprint');
  const fit = P.createLeisureState();
  fit.fitness = 100;
  assert.ok(P.sprintMultiplier(fit) > 1.05, 'high fitness speeds up the sprint');

  assert.equal(P.wellbeingLabel(tired), 'Exhausted');
  assert.equal(P.wellbeingLabel(fit), 'Energised');

  // malformed saves are repaired
  const bad = P.normalizeLeisureState({ energy: 'nope', comfort: -50, fitness: 9999, cooldowns: { sofa: 'x' }, stats: { sits: 3 } });
  assert.equal(bad.energy, 100);
  assert.equal(bad.comfort, 0);
  assert.equal(bad.fitness, 100);
  assert.equal(bad.cooldowns.sofa, undefined);
  assert.equal(bad.stats.sits, 3);
  assert.equal(P.normalizeLeisureState(null).hotel, null);
});

test('Interactive furniture: sitting, sleeping, TV, study props, paid meals & cooldowns', async () => {
  const P = await import('../src/props.js');
  globalThis.__props = P;
  const state = fakeState();
  const now = 1_000_000;

  // every listed prop is interactable and has a verb + icon
  for (const id of ['sofa', 'armchair', 'chair', 'bench', 'bed', 'lounger', 'medbed', 'tvwall', 'bookshelf', 'desk',
    'labbench', 'kitchen', 'bar', 'pooltable', 'serverrack', 'piano', 'sculpture', 'planter', 'lamp', 'reception',
    'treadmill', 'gymbench', 'dumbbellrack', 'cinema_screen', 'artframe', 'counter', 'table']) {
    const def = P.interactionFor(id);
    assert.ok(def, `${id} is interactive`);
    assert.ok(def.verb.length > 3 && def.icon, `${id} has a verb & icon`);
    // screens use a seated pose to watch from but are never picked as a seat
    const wantsSeat = (def.pose === 'sit' || def.pose === 'lie') && !['tvwall', 'cinema_screen'].includes(id);
    assert.ok(P.isSeating(id) === wantsSeat, `${id} seating = ${wantsSeat}`);
  }

  // sofa: sit pose, comfort up, stat counted, cooldown armed
  const energy0 = state.leisure.energy;
  const sofa = P.useProp(state, 'sofa', { now });
  assert.equal(sofa.ok, true);
  assert.equal(sofa.pose, 'sit');
  assert.ok(state.leisure.comfort > 78, 'sofa restores comfort');
  assert.ok(state.leisure.energy >= energy0 === false || state.leisure.energy > 0);
  assert.equal(state.leisure.stats.sits, 1);
  assert.ok(P.cooldownLeft(state.leisure, 'sofa', now) > 0);

  // cooldown: still sits, but no fresh bonus
  const again = P.useProp(state, 'sofa', { now: now + 1000 });
  assert.equal(again.ok, true);
  assert.equal(again.fresh, false);
  assert.equal(state.leisure.stats.sits, 1, 'cooldown prevents farming the bonus');

  // bed: lie pose + energy restored
  state.leisure.energy = 20;
  const bed = P.useProp(state, 'bed', { now });
  assert.equal(bed.pose, 'lie');
  assert.ok(state.leisure.energy > 60);
  assert.equal(state.leisure.stats.naps, 1);

  // paid props: cannot afford → rejected, no side effects
  const broke = fakeState();
  broke.cash = 2;
  const rejected = P.useProp(broke, 'kitchen', { now });
  assert.equal(rejected.ok, false);
  assert.match(rejected.msg, /costs \$12/);
  assert.equal(broke.cash, 2);

  // kitchen: price charged, energy restored
  const rich = fakeState();
  rich.leisure.energy = 30;
  const cooked = P.useProp(rich, 'kitchen', { now });
  assert.ok(cooked.ok);
  assert.equal(rich.cash, 1000 - 12);
  assert.ok(rich.leisure.energy > 50);

  // server rack: freelance cash + job XP
  const it = fakeState();
  const hack = P.useProp(it, 'serverrack', { now });
  assert.ok(hack.ok);
  assert.equal(it.cash, 1045);
  assert.equal(it.stats.totalEarned, 45);
  assert.equal(it.jobXP.courier, 14);

  // study props flag the university hook
  assert.equal(P.useProp(fakeState(), 'bookshelf', { now }).study, true);
  assert.equal(P.useProp(fakeState(), 'desk', { now }).study, true);
  assert.equal(P.useProp(fakeState(), 'labbench', { now }).study, true);

  // every 3D Architect furniture piece maps onto an interactive prop
  for (const buildId of ['sofa', 'bed', 'desk', 'table', 'tv_stand', 'bookshelf', 'lamp', 'plant']) {
    const type = P.propTypeForBuild(buildId);
    assert.ok(type && P.isInteractable(type), `built ${buildId} is interactive`);
  }

  // service props open a counter instead of granting a bonus
  const svc = P.useProp(fakeState(), 'reception', { now });
  assert.equal(svc.service, true);
  assert.equal(P.useProp(fakeState(), 'nonsense', { now }).ok, false);
});

// ---------------------------------------------------------------------------
// 2. Doors
// ---------------------------------------------------------------------------
test('Doors: open/close swing animation, closed doors block, open doors clear the way', async () => {
  const P = await import('../src/props.js');
  globalThis.__props = P;
  const door = P.createDoorState({ id: 'd1', x: 10, z: -4, yaw: 0, width: 4, height: 3.4, label: 'Test Tower doors' });
  assert.equal(door.open, false);
  assert.equal(door.amount, 0);

  const closed = P.doorColliders([door], 0.1);
  assert.equal(closed.length, 1, 'closed door registers a collider');
  assert.ok(closed[0].minX <= 8 && closed[0].maxX >= 12, 'collider spans the doorway');

  const toggled = P.toggleDoorState(door);
  assert.equal(toggled.ok, true);
  assert.equal(door.open, true);
  assert.equal(P.doorIsOpen(door), false, 'still swinging');

  for (let i = 0; i < 20; i++) P.stepDoor(door, 0.05);
  assert.equal(door.amount, 1, 'swings fully open');
  assert.equal(P.doorColliders([door], 0.1).length, 0, 'open door is walkable');

  P.toggleDoorState(door);
  for (let i = 0; i < 20; i++) P.stepDoor(door, 0.05);
  assert.equal(door.amount, 0, 'swings fully shut');
  assert.equal(P.doorColliders([door], 0.1).length, 1);

  // elevation filtering: roof doors don't block the street
  assert.equal(P.doorColliders([door], 40).length, 0);

  const locked = P.createDoorState({ x: 0, z: 0, locked: true, label: 'Staff door' });
  assert.equal(P.toggleDoorState(locked).ok, false);

  assert.equal(P.doorDistance(door, 12, -4), 2);
  const normalized = P.normalizeDoors([{ x: 1, z: 2, width: 3 }, null, 'junk']);
  assert.equal(normalized.length, 1);
});

// ---------------------------------------------------------------------------
// 3. Public places & services
// ---------------------------------------------------------------------------
test('Public places: hotel stays, hospital, museum, gym, mall, cinema & library', async () => {
  const Places = await import('../src/publicPlaces.js');
  const P = await import('../src/props.js');
  globalThis.__props = P;

  assert.equal(Places.PUBLIC_PLACES.length, 6);
  const types = Places.PUBLIC_PLACES.map((p) => p.type).sort().join(',');
  assert.equal(types, 'gym,hospital,hotel,library,mall,museum');
  for (const place of Places.PUBLIC_PLACES) {
    assert.ok(place.width > 10 && place.depth > 10 && place.height > 5, `${place.name} has real dimensions`);
    assert.ok(place.services.length >= 1, `${place.name} has a service`);
    assert.ok(Places.placeById(place.id) === place);
  }

  // --- hotel ---
  const state = fakeState();
  const poor = fakeState();
  poor.cash = 10;
  assert.equal(Places.bookHotelRoom(poor, { roomType: 'standard', nights: 1 }).ok, false);
  assert.equal(Places.hotelStatus(state), null);

  const booked = Places.bookHotelRoom(state, { roomType: 'deluxe', nights: 2, day: 3 });
  assert.equal(booked.ok, true);
  assert.equal(state.cash, 1000 - 260 * 2);
  const status = Places.hotelStatus(state);
  assert.ok(status && status.room >= 900, 'deluxe room on the 9th floor');
  assert.equal(status.nightsLeft, 2);
  assert.equal(Places.bookHotelRoom(state, { roomType: 'standard' }).ok, false, 'cannot double-book');

  state.leisure.energy = 10;
  const sleep1 = Places.sleepHotelNight(state);
  assert.equal(sleep1.ok, true);
  assert.equal(sleep1.nightsLeft, 1);
  assert.ok(state.leisure.energy > 60, 'hotel sleep restores energy');
  const sleep2 = Places.sleepHotelNight(state);
  assert.equal(sleep2.nightsLeft, 0);
  assert.equal(Places.hotelStatus(state), null, 'last night checks you out');
  assert.equal(Places.sleepHotelNight(state).ok, false, 'cannot sleep without a booking');
  assert.equal(Places.checkoutHotel(state).ok, false);

  // --- hospital ---
  const patient = fakeState();
  patient.leisure.health = 20;
  const treat = Places.treatPatient(patient, { tier: 'emergency' });
  assert.ok(treat.ok);
  assert.equal(patient.cash, 1000 - 120);
  assert.ok(patient.leisure.health >= 80);
  assert.equal(Places.treatPatient(patient, { tier: 'bogus' }).ok, false);

  // --- museum ---
  const visitor = fakeState();
  const tour = Places.visitMuseum(visitor, { tier: 'guided' });
  assert.ok(tour.ok);
  assert.equal(visitor.cash, 1000 - 48);
  assert.equal(visitor.leisure.stats.visits, 1);

  // --- gym ---
  const athlete = fakeState();
  const gym = Places.buyGymOffer(athlete, { offer: 'pt' });
  assert.ok(gym.ok);
  assert.ok(athlete.leisure.fitness > 18 + 10);
  assert.equal(athlete.leisure.stats.workouts, 1);

  // --- mall & cinema ---
  const shopper = fakeState();
  shopper.leisure.energy = 30;
  assert.ok(Places.buyMeal(shopper, { meal: 'jollof' }).ok);
  assert.equal(shopper.cash, 1000 - 18);
  assert.ok(shopper.leisure.energy > 50);
  assert.ok(Places.watchMovie(shopper, { movie: 'chase' }).ok);
  assert.equal(shopper.leisure.stats.movies, 1);
  assert.equal(Places.buyMeal(shopper, { meal: 'nope' }).ok, false);

  // --- library ---
  const reader = fakeState();
  assert.ok(Places.borrowBook(reader).ok);
  assert.equal(reader.leisure.stats.reads, 1);
  assert.deepEqual(Places.servicesForPlace('grand_hotel').map((s) => s.id), ['hotel']);
  assert.deepEqual(Places.servicesForPlace('nope'), []);
});

// ---------------------------------------------------------------------------
// 4. World integration: district, doors, prop spots, service desks
// ---------------------------------------------------------------------------
test('World: South Waterfront district is built, walk-in and fully serviced', async () => {
  const THREE = await import('three');
  const { City, resolveCircle } = await import('../src/world.js');
  const Places = await import('../src/publicPlaces.js');
  const Props = await import('../src/props.js');
  globalThis.__props = Props;
  const city = new City(new THREE.Scene());

  // every public place is a walk-in building
  for (const place of Places.PUBLIC_PLACES) {
    const building = city.buildingById(place.id);
    assert.ok(building, `${place.name} is enterable`);
    assert.equal(building.name, place.name);
    assert.ok(city.serviceSpots.some((s) => s.placeId === place.id), `${place.name} has a service desk`);
    assert.ok(city.districtSpots.some((d) => d.id === place.id), `${place.name} has an entrance marker`);
  }

  // the district has its own streets & pavement
  assert.equal(city.groundY(0, 200), 0, 'avenue asphalt');
  assert.ok(city.groundY(-112.5, 211) > 0, 'hotel forecourt is raised pavement');
  assert.ok(city.groundY(-112.5, 170) > 0, 'north band pavement');
  assert.equal(city.isOnRoad(0, 186), true);
  assert.equal(city.isOnRoad(0, 234), false, 'the beach is not a road');

  // hotel: many storeys, real slabs, sky deck, lobby lift & door
  const hotel = city.buildingById('grand_hotel');
  assert.ok(hotel.floors >= 10, `hotel has many floors (${hotel.floors})`);
  const slabs = city.walkSurfaces.filter((s) => s.buildingId === 'grand_hotel');
  assert.equal(slabs.length, hotel.floors + 1);
  assert.ok(city.ceilingAt(hotel.x, hotel.z, hotel.baseY) > hotel.baseY + 2);
  assert.equal(city.ceilingAt(hotel.x, hotel.z, hotel.baseY + hotel.floors * 3.2), null, 'open sky deck');

  // every enterable building has at least one interactive door
  const withDoors = new Set(city.doors.map((d) => d.buildingId).filter(Boolean));
  for (const b of city.enterables) {
    if (b.kind === 'shop' && b.id.startsWith('lot-')) continue;
    assert.ok(withDoors.has(b.id), `${b.name} has a door`);
  }
  assert.ok(withDoors.has('mgu-rotunda') && withDoors.has('mgu-library') && withDoors.has('mgu-science'),
    'university halls have openable doors too');

  // a closed door blocks, an open door lets you through
  const tower = city.enterables.find((b) => b.kind === 'tower' && !b.civic);
  const door = city.doors.find((d) => d.buildingId === tower.id);
  assert.ok(door, 'tower has a door');
  const doorX = door.x;
  const doorZ = door.z;
  const closedCols = city.doorCollidersAt(0.1);
  assert.ok(closedCols.length > 10, 'every closed door blocks');
  assert.equal(resolveCircle(doorX, doorZ, 0.4, closedCols).hit, true, 'closed door stops the player');
  assert.equal(resolveCircle(doorX, doorZ, 0.4, city.colliderCache).hit, false, 'doorway itself is not a wall');

  // open the door through the interaction path
  const res = Props.toggleDoorState(door);
  assert.equal(res.ok, true);
  for (let i = 0; i < 24; i++) city.updateDoors(0.05);
  assert.equal(city.doorCollidersAt(0.1).length, closedCols.length - 1, 'open door no longer blocks');
  assert.equal(resolveCircle(doorX, doorZ, 0.4, city.doorCollidersAt(0.1)).hit, false);

  // interior walls still block (pick an axis-aligned tower so width maps to x)
  const straight = city.enterables.find((b) => b.kind === 'tower' && !b.civic && b.yaw === 0);
  assert.ok(straight, 'at least one tower faces the street squarely');
  assert.equal(resolveCircle(straight.x, straight.z, 0.4, city.colliderCache).hit, false, 'inside is open');
  assert.equal(resolveCircle(straight.x + straight.width / 2, straight.z, 0.4, city.colliderCache).hit, true, 'side wall is solid');

  // interactive furniture exists across shops, halls and the promenade
  const types = new Set(city.propSpots.map((s) => s.type));
  for (const t of ['reception', 'sofa', 'bookshelf', 'counter', 'treadmill', 'gymbench', 'cinema_screen', 'artframe', 'bench']) {
    assert.ok(types.has(t), `city registers ${t} interactions`);
  }
  assert.ok(city.propSpots.filter((s) => s.type === 'bench').length >= 4, 'park & promenade benches are sittable');

  // every registered spot is reachable (not inside a wall) and on a real floor
  for (const spot of city.propSpots) {
    assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.z) && Number.isFinite(spot.y));
    assert.ok(city.groundY(spot.x, spot.z) === spot.y || spot.y > 0.09, `${spot.type} has a valid floor height`);
  }

  // gym machines sit inside the gym hall
  const gym = city.buildingById('metro_gym');
  const gymSpots = city.propSpots.filter((s) => s.buildingId === 'metro_gym');
  assert.ok(gymSpots.length >= 6, 'gym is furnished with interactive equipment');
  assert.ok(gymSpots.some((s) => s.type === 'treadmill'));
  assert.ok(Math.abs(gym.x + 112.5) < 0.01 && Math.abs(gym.z - 170) < 0.01);

  // a player can actually walk the lobby: clear path from the door to the lift
  const lobbyDoor = city.doors.find((d) => d.buildingId === 'grand_hotel');
  assert.ok(lobbyDoor, 'hotel has a door');
  Props.toggleDoorState(lobbyDoor);
  for (let i = 0; i < 24; i++) city.updateDoors(0.05);
  const liftPoint = city.elevatorLanding(hotel);
  assert.ok(Math.abs(liftPoint.x - hotel.x) < hotel.width && Math.abs(liftPoint.z - hotel.z) < hotel.depth,
    'lift landing is inside the footprint');
  assert.ok(city.walkSurfaceAt(liftPoint.x, liftPoint.z, hotel.baseY + 0.1, 0.45) >= hotel.baseY, 'lift landing has a floor');
  assert.ok(city.ceilingAt(liftPoint.x, liftPoint.z, hotel.baseY) > hotel.baseY + 2, 'lobby has headroom');
  assert.equal(city.doorCollidersAt(hotel.baseY).some((c) => c.label === lobbyDoor.label), false, 'opened hotel door is walkable');

  // the downtown got denser
  const towers = city.enterables.filter((b) => b.kind === 'tower' && !b.civic);
  assert.ok(towers.length >= 16, `downtown has ${towers.length} walk-in towers`);
});
