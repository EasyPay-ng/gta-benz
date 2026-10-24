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

function makeCanvas(w = 64, h = 64) {
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

// ---------------------------------------------------------------------------
// 1. Seat geometry: bodies rest on the furniture, not above it
// ---------------------------------------------------------------------------
test('Seats: every seating prop has real surface geometry', async () => {
  const Props = await import('../src/props.js');
  for (const type of ['sofa', 'armchair', 'chair', 'bench', 'bed', 'medbed', 'lounger']) {
    const seat = Props.seatFor(type);
    assert.ok(seat, `${type} has seat geometry`);
    assert.ok(seat.surface > 0.35 && seat.surface < 0.8, `${type} surface height is realistic`);
    assert.ok(['sit', 'lie'].includes(seat.pose), `${type} has a pose`);
    if (seat.pose === 'lie') assert.ok(seat.forward > 0.3, `${type} centres the body along its length`);
  }
  // mattress tops match the 3D meshes in world.js
  assert.equal(Props.seatFor('bed').surface, 0.63);
  assert.equal(Props.seatFor('medbed').surface, 0.67);
  assert.equal(Props.seatFor('sofa').surface, 0.57);
});

test('Seats: a lying body stays on the mattress and the head reaches the pillow', async () => {
  const THREE = await import('three');
  const { Character } = await import('../src/character.js');
  const Props = await import('../src/props.js');
  const c = new Character({ build: 'Balanced', skin: '#c68642', hair: 'buzz', shirt: '#b91c1c', pants: '#1d4ed8' });
  const seat = Props.seatFor('bed');
  c.seat = seat;
  c.setPose('lie');
  c.animate(0.016, 0);
  c.group.updateMatrixWorld(true);

  // measure only what is actually rendered (held props are hidden)
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  c.group.traverseVisible((o) => {
    if (!o.isMesh) return;
    tmp.setFromObject(o);
    box.union(tmp);
  });
  // body rests on the mattress surface (group origin), never floats above it
  assert.ok(box.min.y > -0.12 && box.min.y < 0.08, `body rests on the mattress (${box.min.y.toFixed(2)})`);
  assert.ok(box.max.y < 0.55, 'the body stays flat');
  // the figure spans the mattress: head near the pillows (-1.1), feet near the foot (1.1)
  assert.ok(box.min.z > -1.2 && box.min.z < -0.75, `head is up by the pillows (${box.min.z.toFixed(2)})`);
  assert.ok(box.max.z > 0.7 && box.max.z < 1.15, `feet stay on the bed (${box.max.z.toFixed(2)})`);

  const sofa = Props.seatFor('sofa');
  c.seat = sofa;
  c.setPose('sit');
  c.animate(0.016, 0);
  c.group.updateMatrixWorld(true);
  const sbox = new THREE.Box3();
  c.group.traverseVisible((o) => {
    if (!o.isMesh) return;
    tmp.setFromObject(o);
    sbox.union(tmp);
  });
  // hips on the cushion: the seat surface is the group origin, feet reach the floor
  assert.ok(sbox.min.y > -0.75 && sbox.min.y < -0.35, `feet hang down to the floor (${sbox.min.y.toFixed(2)})`);
  assert.ok(sbox.max.y < 1.3, 'the head is at seated height');
});

// ---------------------------------------------------------------------------
// 2. Every action animates (piano, pool, drinking, TV, gym …)
// ---------------------------------------------------------------------------
test('Animations: every interactive prop plays a scripted action', async () => {
  const Props = await import('../src/props.js');
  const { Character, ACTION_ITEMS } = await import('../src/character.js');
  for (const type of Object.keys(Props.PROP_INTERACTIONS)) {
    const action = Props.actionFor(type);
    assert.ok(action, `${type} has an animation id`);
    const c = new Character({ build: 'Balanced', skin: '#c68642', hair: 'buzz', shirt: '#fff', pants: '#333' });
    c.setPose(Props.interactionFor(type).pose);
    assert.equal(c.playAction(action, { duration: 4, loop: true }), true, `${type} starts its animation`);
    const before = c.body.children.map((o) => o.rotation.x);
    for (let i = 0; i < 12; i++) c.animate(0.05, 0);
    const after = c.body.children.map((o) => o.rotation.x);
    assert.ok(c.isActing(), `${type} keeps running`);
    assert.ok(before.some((v, i) => Math.abs(v - after[i]) > 1e-4) || c.legR.rotation.x !== 0 || c.armR.rotation.x !== 0,
      `${type} moves the rig`);
    if (ACTION_ITEMS[action]) assert.equal(c._heldKind, ACTION_ITEMS[action], `${type} holds the right prop`);
  }
});

test('Animations: piano & snooker cycles move hands and end cleanly', async () => {
  const { Character } = await import('../src/character.js');
  const c = new Character({ build: 'Balanced', skin: '#c68642', hair: 'buzz', shirt: '#fff', pants: '#333' });
  c.playAction('piano', { loop: true, duration: 6 });
  const samples = [];
  for (let i = 0; i < 20; i++) {
    c.animate(0.03, 0);
    samples.push(c.armL.rotation.x);
  }
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.01, 'piano hands move');

  c.playAction('pool', { loop: true, duration: 6 });
  const torso = [];
  for (let i = 0; i < 170; i++) {
    c.animate(0.03, 0);
    torso.push(c.torsoGroup.rotation.x);
  }
  assert.ok(Math.max(...torso) - Math.min(...torso) > 0.1, 'pool player leans in and stands up');
  assert.equal(c._heldKind, 'cue', 'the cue is in hand');

  // one-shot actions stop by themselves
  c.playAction('drink', { duration: 0.6 });
  for (let i = 0; i < 20; i++) c.animate(0.05, 0);
  assert.equal(c.isActing(), false, 'the drink animation finishes');
  assert.equal(c._heldKind, null, 'the glass is put down');

  // walking cancels an action
  c.playAction('piano', { loop: true });
  c.animate(0.05, 3.2);
  assert.equal(c.isActing(), false, 'movement cancels the animation');
});

// ---------------------------------------------------------------------------
// 3. TV & cinema screens actually switch on and show content
// ---------------------------------------------------------------------------
test('TV: screens power on, show a live channel and switch off', async () => {
  const THREE = await import('three');
  const { City } = await import('../src/world.js');
  const city = new City(new THREE.Scene());
  // the mall's cinema screen is registered with its live display
  const screens = city.propSpots.filter((s) => s.screen);
  assert.ok(screens.length >= 1, 'the mall cinema screen is live');
  const cinema = screens.find((s) => s.type === 'cinema_screen');
  assert.ok(cinema, 'cinema screen found');
  const mesh = cinema.screen;
  assert.equal(city.isTVOn(mesh), false);
  const off = mesh.material;
  city.setTVOn(mesh, true);
  assert.equal(city.isTVOn(mesh), true);
  assert.ok(mesh.material !== off && mesh.material.map, 'screen switches to a live channel texture');
  city.update(1, 0.5);
  assert.ok(mesh.material.map.image && mesh.material.map.image.width > 0, 'channel canvas is being drawn');
  city.setTVOn(mesh, false);
  assert.equal(city.isTVOn(mesh), false);
  assert.ok(mesh.material === off, 'screen goes dark again');
});

test('TV: every television in the city — stations, showroom, apartments — can switch on', async () => {
  const THREE = await import('three');
  const { City } = await import('../src/world.js');
  const Props = await import('../src/props.js');
  const city = new City(new THREE.Scene());

  const TVs = city.propSpots.filter((s) => s.type === 'tvwall' || s.type === 'cinema_screen');
  assert.ok(TVs.length >= 3, `televisions placed in the city (${TVs.length})`);
  for (const spot of TVs) {
    assert.ok(spot.screen, `${spot.type} in ${spot.buildingId} carries a screen handle`);
    assert.equal(spot.screen.userData.screen, true, 'the mesh is tagged as a screen');
    assert.ok(spot.screen.isMesh && spot.screen.material, 'the screen is a real mesh with a material');
  }

  // the security station used to register its media wall without a screen
  const station = city.propSpots.find((s) => s.buildingId === 'station-security' && s.type === 'tvwall');
  assert.ok(station, 'City Security HQ has a media wall');
  assert.ok(station.screen, 'and it is wired up');

  // every tower apartment TV is wired too
  const tower = city.enterables.find((b) => b.kind === 'tower');
  let apartmentTv = 0;
  for (let lvl = 0; lvl <= tower.floors; lvl++) {
    const floor = city.setActiveInterior(tower.id, lvl);
    if (!floor) continue;
    for (const spot of floor.spots.filter((s) => s.type === 'tvwall')) {
      apartmentTv++;
      assert.ok(spot.screen, `${tower.name} L${lvl} TV can switch on`);
    }
    city.clearActiveInterior();
  }
  assert.ok(apartmentTv > 0, 'at least one apartment has a TV');

  // player-built TV stands route into the same "Watch TV" interaction
  assert.equal(Props.BUILD_PROP_MAP.tv_stand, 'tvwall');
  assert.equal(Props.isInteractable('tvwall'), true);
  assert.equal(Props.actionFor('tvwall'), 'tv');
});

test('TV: the picture is painted while on, changes channel, and stops when switched off', async () => {
  const THREE = await import('three');
  const { City } = await import('../src/world.js');
  const city = new City(new THREE.Scene());
  const spot = city.propSpots.find((s) => s.type === 'tvwall' && s.screen);
  const mesh = spot.screen;
  const tex = () => mesh.material.map;
  const version = () => (tex() ? tex().version : 0);

  city.setTVOn(mesh, true);
  const map = tex();
  assert.ok(map, 'a channel texture is attached');
  const v0 = version();
  for (let i = 0; i < 6; i++) city.update(2 + i * 0.2, 0.12);
  const v1 = version();
  assert.ok(v1 > v0, `the channel canvas repaints while on (${v0} → ${v1})`);

  // the channel rolls over every 16 s and keeps repainting
  const channel0 = city._tv.channel;
  for (let i = 0; i < 20; i++) city.update(20 + i * 1.1, 1.1);
  assert.notEqual(city._tv.channel, channel0, 'the channel changes while watching');

  // switching off stops the work and darkens the panel again
  city.setTVOn(mesh, false);
  const vOff = version();
  assert.equal(city.tvCount(), 0, 'no active screens');
  for (let i = 0; i < 8; i++) city.update(40 + i * 0.2, 0.2);
  assert.equal(version(), vOff, 'nothing repaints once the screen is off');
});

// ---------------------------------------------------------------------------
// 4. All buildings are walk-in with real walls, windows, doors & a desk
// ---------------------------------------------------------------------------
test('Buildings: dealership & every fuel station are walk-in with doors and desks', async () => {
  const THREE = await import('three');
  const { City, resolveCircle } = await import('../src/world.js');
  const city = new City(new THREE.Scene());
  const ids = ['dealership', 'fuel-lagoon', 'fuel-harbor', 'fuel-metro'];
  for (const id of ids) {
    const b = city.buildingById(id);
    assert.ok(b, `${id} is enterable`);
    assert.equal(b.kind, 'shop');
    // you can stand inside, under a ceiling
    const inside = city.buildingAt(b.x, b.z);
    assert.ok(inside && inside.building.id === id, `${id} has an interior`);
    assert.ok(city.ceilingAt(b.x, b.z, b.baseY) > b.baseY + 2, `${id} has a roof`);
    // it has a working door
    const door = city.doors.find((d) => d.buildingId === id);
    assert.ok(door, `${id} has a door`);
    assert.equal(door.open, false);
    // and a service desk you can use
    const spot = city.serviceSpots.find((s) => s.placeId === id);
    assert.ok(spot, `${id} has a counter`);
    assert.ok(spot.prompt.length > 5);
  }
  // closed doors block the threshold, open ones don't
  const shop = city.buildingById('fuel-harbor');
  const door = city.doors.find((d) => d.buildingId === 'fuel-harbor');
  assert.ok(resolveCircle(door.x, door.z, 0.4, city.doorCollidersAt(door.y || 0.1)).hit, 'closed shop door blocks');
  const { toggleDoorState } = await import('../src/props.js');
  toggleDoorState(door);
  for (let i = 0; i < 24; i++) city.updateDoors(0.05);
  assert.equal(resolveCircle(door.x, door.z, 0.4, city.doorCollidersAt(door.y || 0.1)).hit, false, 'open shop door is walkable');
  void shop;

  // every skyline tower block now also has interior wall lining on its floors
  const tower = city.enterables.find((b) => b.kind === 'tower');
  const floor = city.setActiveInterior(tower.id, 0);
  assert.ok(floor, 'a tower floor can be dressed');
  let plaster = 0;
  let windows = 0;
  const PLASTER = new Set(['e7e2d9', 'ded3c4']);
  floor.group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (o.material.color && PLASTER.has(o.material.color.getHexString())) plaster++;
    if (o.material.emissive && o.material.emissive.getHex() === 0x4f7fa3) windows++;
  });
  assert.ok(plaster > 4, 'interior walls are real plaster panels');
  assert.ok(windows > 0, 'framed windows line the walls');
  city.clearActiveInterior();
});

test('Buildings: every walk-in city building is lined with plaster walls & framed windows', async () => {
  const THREE = await import('three');
  const { City } = await import('../src/world.js');

  // record every interior-lining call the city builder makes
  const proto = City.prototype;
  const orig = proto._interiorWalls;
  const calls = [];
  proto._interiorWalls = function (group, opts) {
    calls.push({ group, opts });
    return orig.call(this, group, opts);
  };
  const city = new City(new THREE.Scene());
  proto._interiorWalls = orig;

  city.root.updateMatrixWorld(true);
  const pts = calls.map(({ group }) => {
    group.updateWorldMatrix(true, false);
    return new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
  });

  // shops, stations and civic halls are lined eagerly; tower floors when you enter
  const shells = city.enterables.filter((b) => b.kind !== 'tower');
  assert.ok(shells.length >= 10, `ground-level buildings (${shells.length})`);
  for (const b of shells) {
    const reach = Math.max(b.width, b.depth) / 2 + 8;
    const lined = pts.some((p) => Math.hypot(p.x - b.x, p.z - b.z) <= reach);
    assert.ok(lined, `${b.name} (${b.id}) is lined, not a bare shell`);
  }

  const PLASTER = new Set(['e7e2d9', 'ded3c4']);
  let plaster = 0; let glass = 0; let skirting = 0;
  for (const { group } of calls) {
    group.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const hex = o.material.color?.getHexString?.();
      if (hex && PLASTER.has(hex)) plaster++;
      if (hex === '3f3f46') skirting++;
      if (o.material.emissive && o.material.emissive.getHex() === 0x4f7fa3) glass++;
    });
  }
  assert.ok(plaster > 40, `plaster wall panels (${plaster})`);
  assert.ok(skirting > 4, `skirting boards (${skirting})`);
  assert.ok(glass > 0, `framed window glass (${glass})`);
});

test('Seats: the desk seats you on its own chair, facing the monitor', async () => {
  const THREE = await import('three');
  const Props = await import('../src/props.js');
  const { City } = await import('../src/world.js');

  const seat = Props.seatFor('desk');
  assert.ok(seat, 'the desk has real seat geometry');
  assert.equal(seat.offset, true, 'the seat is offset onto the chair');
  assert.equal(seat.yawOffset, Math.PI, 'you face back toward the desk');
  assert.ok(seat.forward > 0.85, 'the chair stands clear of the desk collider');

  // for any desk rotation the seated body looks straight at the monitor
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const px = Math.sin(rot) * seat.forward;
    const pz = Math.cos(rot) * seat.forward;
    const yaw = rot + seat.yawOffset;
    const fx = Math.sin(yaw); const fz = Math.cos(yaw);
    const dx = -px; const dz = -pz;
    const dot = (fx * dx + fz * dz) / Math.hypot(dx, dz);
    assert.ok(dot > 0.99, `facing the desk at rot ${rot.toFixed(2)}`);
  }

  // the chair mesh is turned around so its backrest is behind the player,
  // not slicing through their chest
  const city = new City(new THREE.Scene());
  const deskGroup = city._addProp(new THREE.Group(), { type: 'desk', x: 0, z: 0, rot: 0 });
  const chair = deskGroup.children.find((c) => c.isGroup && Math.abs(c.position.z - seat.forward) < 0.02);
  assert.ok(chair, 'the desk is built with its chair');
  assert.equal(Math.round(chair.rotation.y / Math.PI), 1, 'the chair faces the desk');
});

test('TV: every screen has a seat facing it, or a clear spot to watch from', async () => {
  const THREE = await import('three');
  const { City } = await import('../src/world.js');
  const Props = await import('../src/props.js');
  const city = new City(new THREE.Scene());

  // screens are screens, not seats, and the cinema is still a "service" in the data
  assert.equal(Props.isScreen('tvwall'), true);
  assert.equal(Props.isScreen('cinema_screen'), true);
  assert.equal(Props.isScreen('sofa'), false);
  assert.equal(Props.isSeating('tvwall'), false, 'a TV is never chosen as a seat');
  assert.equal(Props.isSeating('cinema_screen'), false);
  assert.equal(Props.interactionFor('cinema_screen').service, true, 'the box office flag stays on the data');

  const screens = city.propSpots.filter((s) => Props.isScreen(s.type));
  assert.ok(screens.length >= 3);
  for (const spot of screens) {
    const cinema = spot.type === 'cinema_screen';
    const seats = city.propSpotsNear(spot.x, spot.z, spot.y, cinema ? 12 : 7)
      .filter((s2) => s2 !== spot && Props.isSeating(s2.type));
    // same scoring the game uses: nearest seat that actually faces the picture
    let best = null; let bestScore = Infinity;
    for (const s2 of seats) {
      const dx = spot.x - s2.x; const dz = spot.z - s2.z;
      const d = Math.hypot(dx, dz) || 1;
      const facing = (Math.sin(s2.rot || 0) * dx + Math.cos(s2.rot || 0) * dz) / d;
      const score = d * (1.7 - Math.max(0, facing));
      if (score < bestScore) { bestScore = score; best = { spot: s2, facing, d }; }
    }
    if (best) {
      assert.ok(best.facing > 0.85, `${spot.buildingId}: the chosen seat faces the screen (${best.facing.toFixed(2)})`);
      assert.ok(best.d <= (cinema ? 12 : 7), 'and it is in range');
    } else {
      // no furniture: the game stands you 2.1 m along the screen normal
      const ax = spot.x + Math.sin(spot.rot || 0) * 2.1;
      const az = spot.z + Math.cos(spot.rot || 0) * 2.1;
      const inside = city.buildingAt(ax, az);
      assert.ok(inside && inside.building.id === spot.buildingId,
        `${spot.buildingId}: the standing spot is inside the room`);
    }
  }

  // the mall cinema really does have rows to sit in
  const rows = city.propSpots.filter((s) => s.buildingId === 'metro_mall' && s.type === 'bench');
  assert.ok(rows.length >= 4, `cinema seating (${rows.length})`);
});
