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
globalThis.document = {
  createElement(tag) { return tag === 'canvas' ? makeCanvas() : {}; },
};

// ---------------------------------------------------------------------------
// 1. Pure 3D Architect build logic
// ---------------------------------------------------------------------------
test('Build catalog: structure & furniture pieces, 4 m grid snapping, rotation & colour', async () => {
  const B = await import('../src/build.js');
  const { BUILD_ITEMS, BUILD_COLORS, MAX_CUSTOM_BUILDS } = await import('../src/data.js');

  assert.ok(BUILD_ITEMS.length >= 18, 'full structure + furniture catalog');
  assert.ok(BUILD_ITEMS.some((i) => i.id === 'wall_solid'));
  assert.ok(BUILD_ITEMS.some((i) => i.id === 'floor_wood'));
  assert.ok(BUILD_ITEMS.some((i) => i.id === 'stairs'));
  assert.ok(BUILD_ITEMS.some((i) => i.id === 'roof_gable'));
  assert.ok(BUILD_ITEMS.some((i) => i.id === 'bed'));
  assert.ok(BUILD_ITEMS.some((i) => i.id === 'tv_stand'));
  assert.ok(BUILD_COLORS.length >= 6);

  const wall = B.itemById('wall_solid');
  const sofa = B.itemById('sofa');
  assert.equal(B.gridFor(wall), B.STRUCTURE_GRID, 'structures snap on the 4 m grid');
  assert.equal(B.gridFor(sofa), B.FURNITURE_GRID, 'furniture snaps at 0.5 m');
  assert.deepEqual(B.snapPlacement(wall, 3.1, -5.9, 0.1), { x: 4, z: -4, y: 0.1 });
  assert.deepEqual(B.snapPlacement(sofa, 3.26, 1.24, 0.1), { x: 3.5, z: 1, y: 0.1 });

  // rotations snap to exact quarter turns
  assert.equal(B.rotQuarter(0), 0);
  assert.equal(B.rotQuarter(Math.PI / 2), 1);
  assert.equal(B.rotQuarter(Math.PI), 2);
  assert.equal(B.rotQuarter(-Math.PI / 2), 3);
  assert.equal(B.snapRotation(0.5), 0);            // 28° snaps down to 0
  assert.equal(B.snapRotation(0.9), Math.PI / 2);  // 52° snaps up to a quarter turn
  assert.equal(B.snapRotation(Math.PI / 2 + 0.1), Math.PI / 2);

  assert.ok(MAX_CUSTOM_BUILDS >= 500, 'generous piece budget');
});

test('Build placement: valid/invalid, duplicate guard, demolition & piece budget', async () => {
  const B = await import('../src/build.js');
  const build = B.createBuildState();

  const floor = B.addPiece(build, 'floor_wood', { x: 20, z: -20, y: 0.1, rot: 0 });
  assert.ok(floor.ok);
  assert.equal(build.pieces.length, 1);
  assert.equal(floor.piece.color, '#78350f', 'default item colour applied');
  assert.equal(floor.piece.rot, 0);

  const dup = B.addPiece(build, 'floor_wood', { x: 20.1, z: -20.1, y: 0.1, rot: 0 });
  assert.equal(dup.ok, false);
  assert.match(dup.msg, /already/i);

  const far = B.addPiece(build, 'floor_wood', { x: 9_000, z: 0, y: 0.1, rot: 0 });
  assert.equal(far.ok, false, 'out-of-city placements are rejected');

  const wall = B.addPiece(build, 'wall_solid', { x: 22, z: -20, y: 0.1, rot: Math.PI / 2 }, { color: '#991b1b' });
  assert.ok(wall.ok);
  assert.equal(wall.piece.color, '#991b1b');

  assert.equal(B.pieceCount(build), 2);
  const stats = B.summary(build);
  assert.equal(stats.structure, 2);
  assert.equal(stats.furniture, 0);

  const near = B.pieceNear(build, 21.9, -19.9, 0.1, 3);
  assert.ok(near && near.id === wall.piece.id, 'nearest piece found on the same storey');
  assert.equal(B.pieceNear(build, 21.9, -19.9, 20, 3), null, 'other storeys ignored');

  const removed = B.removePiece(build, wall.piece.id);
  assert.ok(removed.ok);
  assert.equal(B.pieceCount(build), 1);
  assert.equal(B.removePiece(build, 'nope').ok, false);
});

test('Build geometry: floors & stairs are walkable, walls block only their own storey', async () => {
  const B = await import('../src/build.js');
  const build = B.createBuildState();

  B.addPiece(build, 'floor_wood', { x: 0, z: 0, y: 0.1, rot: 0 });
  B.addPiece(build, 'floor_wood', { x: 4, z: 0, y: 3.3, rot: 0 });
  B.addPiece(build, 'stairs', { x: 8, z: 0, y: 0.1, rot: 0 });
  B.addPiece(build, 'wall_solid', { x: -2, z: 0, y: 0.1, rot: Math.PI / 2 });

  const surfaces = B.walkSurfaces(build);
  assert.equal(surfaces.length, 1 + 1 + 8, 'two floors + eight stair steps');
  assert.equal(B.supportAt(surfaces, 0, 0, 0.1, 0), 0.1);
  assert.equal(B.supportAt(surfaces, 4, 0, 3.3, 0), 3.3, 'second storey supports a body up there');
  assert.equal(B.supportAt(surfaces, 4, 0, 0.1, 0), 0, 'you cannot stand on a floor above your head');
  assert.equal(B.supportAt(surfaces, 100, 100, 0.1, 0), 0, 'no build → street ground');

  // climb the stairs one riser at a time
  let feet = 0.1;
  for (let i = 0; i < 8; i++) {
    const next = B.supportAt(surfaces, 8, -1.6 + i * 0.4 + 0.2, feet, 0);
    assert.ok(next > feet, `step ${i + 1} raises the walker`);
    assert.ok(next - feet <= B.STEP_UP + 0.001, `step ${i + 1} is within the step-up height`);
    feet = next;
  }
  assert.ok(Math.abs(feet - 3.3) < 0.001, 'stairs reach the upper storey');

  assert.equal(B.collidersNear(build, 0.1).length, 1, 'ground-floor wall blocks at ground level');
  assert.equal(B.collidersNear(build, 3.3).length, 0, 'the same wall does not block the storey above');
});

test('Build save migration: hostile/garbage build payloads normalise to safe pieces', async () => {
  const B = await import('../src/build.js');
  assert.deepEqual(B.normalizeBuildState(undefined), { pieces: [] });
  assert.deepEqual(B.normalizeBuildState({ pieces: 'nope' }), { pieces: [] });
  const clean = B.normalizeBuildState({
    pieces: [
      { item: 'wall_solid', x: 12, z: -8, y: 0.1, rot: 1.4, color: '#991b1b' },
      { item: 'not_a_piece', x: 1, z: 1, y: 0 },
      { item: 'sofa', x: 'NaN', z: 2, y: 0 },
      { item: 'sofa', x: 5000, z: 2, y: 0 },
      { item: 'lamp', x: 2, z: 2, y: 3.3 },
    ],
  });
  assert.equal(clean.pieces.length, 2);
  assert.equal(clean.pieces[0].item, 'wall_solid');
  assert.equal(clean.pieces[0].rot, Math.PI / 2, 'rotation snapped on load');
  assert.equal(clean.pieces[1].item, 'lamp');
  assert.ok(clean.pieces[1].id.startsWith('p'));
  assert.equal(B.describePiece(clean.pieces[1]), 'Warm Floor Lamp');
  assert.ok(B.serializeBuild(clean).pieces.length === 2);
});

// ---------------------------------------------------------------------------
// 2. Pure multi-floor interior generator
// ---------------------------------------------------------------------------
test('Interiors: storey counts, themed floor plans, lift stops & collision footprints', async () => {
  const I = await import('../src/interiors.js');

  assert.equal(I.floorCountForHeight(12), 3);
  assert.equal(I.floorCountForHeight(62), 18);
  assert.equal(I.floorCountForHeight(3), I.MIN_TOWER_FLOORS);
  assert.ok(I.floorCountForHeight(900) === I.MAX_TOWER_FLOORS);

  assert.ok(I.TOWER_THEME_IDS.length >= 5);
  const building = {
    id: 'test-tower', x: 40, z: -40, width: 18, depth: 16, height: 40,
    baseY: 0.1, floors: 6, themeId: 'corporate', seed: 77, yaw: Math.PI / 2,
  };

  const stops = I.elevatorStops(building);
  assert.equal(stops.length, building.floors + 1, 'every floor + the sky deck');
  assert.equal(stops[0].level, 0);
  assert.match(stops[0].label, /Lobby/);
  assert.equal(stops[stops.length - 1].level, building.floors);
  assert.match(stops[stops.length - 1].label, /Sky Deck/);

  let propsSeen = 0;
  let collidersSeen = 0;
  for (let lv = 0; lv <= building.floors; lv++) {
    const layout = I.floorLayout(building, lv);
    assert.ok(layout.props.length >= 3, `floor ${lv} is furnished`);
    for (const p of layout.props) {
      propsSeen++;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
      assert.ok(Math.abs(p.x - building.x) <= building.width / 2, 'prop inside footprint (x)');
      assert.ok(Math.abs(p.z - building.z) <= building.depth / 2, 'prop inside footprint (z)');
      // lift alcove must stay clear
      const lift = I.elevatorPoint(building);
      assert.ok(Math.hypot(p.x - lift.x, p.z - lift.z) > 2.2, 'prop clear of the lift alcove');
    }
    collidersSeen += I.propColliders(layout).length;
    assert.ok(I.PROP_SPECS && typeof I.PROP_SPECS === 'object');
    assert.equal(I.floorLabel(building, lv), I.floorLabel(building, lv), 'labels are stable');
  }
  assert.ok(propsSeen > 30, 'multi-floor interiors have plenty of furniture');
  assert.ok(collidersSeen > 15, 'solid furniture registers collision boxes');

  assert.equal(I.floorLabel(building, 0).startsWith('Lobby'), true);
  assert.match(I.floorLabel(building, building.floors), /Sky Deck/);
  assert.match(I.floorLabel(building, 3), /^Floor 3 · /);

  // Deterministic layouts (same save → same rooms)
  const a = I.floorLayout(building, 4);
  const b = I.floorLayout(building, 4);
  assert.deepEqual(a.props, b.props);
});

// ---------------------------------------------------------------------------
// 3. World: every building is walk-in, towers have real multi-floor slabs
// ---------------------------------------------------------------------------
test('World: every skyline tower is walk-in with a lift, per-storey slabs & furnishing', async () => {
  const THREE = await import('three');
  const { City, resolveCircle } = await import('../src/world.js');
  const I = await import('../src/interiors.js');
  const city = new City(new THREE.Scene());

  const towers = city.enterables.filter((b) => b.kind === 'tower');
  assert.ok(towers.length >= 4, `skyline towers registered as enterable (${towers.length})`);
  assert.ok(city.walkSurfaces.length >= towers.length * 4, 'storey slabs registered as walkable');

  for (const b of towers) {
    assert.ok(b.floors >= 2, `${b.name} has multiple storeys`);
    assert.equal(b.floorHeight, I.FLOOR_HEIGHT);

    const cos = Math.cos(b.yaw); const sin = Math.sin(b.yaw);
    const doorX = b.x + (b.depth / 2) * sin;
    const doorZ = b.z + (b.depth / 2) * cos;
    const insideDoor = resolveCircle(doorX, doorZ, 0.38, city.colliderCache);
    assert.equal(insideDoor.hit, false, `${b.name}: the front doorway is open`);

    const wallX = b.x + 4.7 * cos + (b.depth / 2) * sin;
    const wallZ = b.z - 4.7 * sin + (b.depth / 2) * cos;
    const wallHit = resolveCircle(wallX, wallZ, 0.38, city.colliderCache);
    assert.equal(wallHit.hit, true, `${b.name}: the rest of the facade is solid`);

    const atDoor = city.buildingAt(doorX, doorZ);
    assert.ok(atDoor && atDoor.building.id === b.id, `${b.name}: buildingAt finds the doorway`);

    const slabs = city.walkSurfaces.filter((s) => s.buildingId === b.id);
    assert.equal(slabs.length, b.floors + 1, `${b.name}: one slab per storey + roof`);
    const midLevel = Math.min(3, b.floors - 1);
    const expectedY = b.baseY + midLevel * I.FLOOR_HEIGHT;
    const lift = city.elevatorLanding(b);
    assert.equal(city.walkSurfaceAt(lift.x, lift.z, expectedY, 0.45), expectedY, `${b.name}: floor ${midLevel} is walkable`);
    assert.equal(city.walkSurfaceAt(lift.x, lift.z, b.baseY, 0.45), b.baseY, 'lobby does not snap to upper floors');
    assert.ok(city.ceilingAt(lift.x, lift.z, expectedY) > expectedY + 2, 'indoor ceiling above each storey');
    assert.equal(city.ceilingAt(lift.x, lift.z, b.baseY + b.floors * I.FLOOR_HEIGHT), null, 'sky deck is open air');

    const landing = city.buildingAt(lift.x, lift.z);
    assert.ok(landing && landing.building.id === b.id, `${b.name}: lift landing is inside the tower`);

    // the lift landing must be clear of furniture on every storey
    for (let lv = 0; lv <= b.floors; lv++) {
      const layout = I.floorLayout(b, lv);
      for (const c of I.propColliders(layout)) {
        const inside = lift.x > c.minX - 0.45 && lift.x < c.maxX + 0.45 && lift.z > c.minZ - 0.45 && lift.z < c.maxZ + 0.45;
        assert.equal(inside, false, `${b.name}: lift landing stays clear on level ${lv}`);
      }
    }

    const dressed = city.setActiveInterior(b.id, midLevel);
    assert.ok(dressed.group.children.length > 8, `${b.name}: floor ${midLevel} is furnished in 3D`);
    assert.ok(dressed.colliders.length > 0, `${b.name}: floor ${midLevel} furniture collides`);
    assert.equal(city.interiorCollidersFor(b.id, midLevel), dressed.colliders);
    city.clearActiveInterior();
    assert.equal(city.activeInteriorColliders().length, 0);
  }
});

test('World: shops, stations, the boutique & startup lots are walk-in too', async () => {
  const THREE = await import('three');
  const { City, resolveCircle } = await import('../src/world.js');
  const city = new City(new THREE.Scene());

  const boutique = city.buildingById('boutique');
  assert.ok(boutique, 'Maison Verve is registered as a walk-in building');
  const bcos = Math.cos(boutique.yaw); const bsin = Math.sin(boutique.yaw);
  const bdoorX = boutique.x + (boutique.depth / 2) * bsin;
  const bdoorZ = boutique.z + (boutique.depth / 2) * bcos;
  assert.equal(resolveCircle(bdoorX, bdoorZ, 0.38, city.colliderCache).hit, false, 'boutique doors are open');
  assert.ok(city.interiorFurniture.boutique.length > 3, 'boutique has interior counters, rails & sofas');

  for (const id of ['station-courier', 'station-security', 'station-cab']) {
    const shop = city.buildingById(id);
    assert.ok(shop, `${id} is walk-in`);
    const cos = Math.cos(shop.yaw); const sin = Math.sin(shop.yaw);
    const dx = shop.x + (shop.depth / 2) * sin;
    const dz = shop.z + (shop.depth / 2) * cos;
    assert.equal(resolveCircle(dx, dz, 0.38, city.colliderCache).hit, false, `${id} reception is walkable`);
    assert.ok(city.interiorFurniture[id].length > 0, `${id} has interior furniture`);
  }
  assert.ok(city.indoorSpots.some((s) => s.type === 'boutique'));
  assert.ok(city.indoorSpots.filter((s) => s.type === 'station').length === 3);

  // Buying a startup lot turns it into a walk-in building with a themed interior
  city.updateLot('garage', { level: 1, storedProfit: 0, lifetimeProfit: 0, employees: [] });
  const garage = city.buildingById('lot-garage');
  assert.ok(garage, 'purchased garage becomes walk-in');
  const gcos = Math.cos(garage.yaw); const gsin = Math.sin(garage.yaw);
  const gdx = garage.x + (garage.depth / 2) * gsin;
  const gdz = garage.z + (garage.depth / 2) * gcos;
  assert.equal(resolveCircle(gdx, gdz, 0.38, city.colliderCache).hit, false, 'garage roller door is open');
  assert.ok(city.interiorFurniture['lot-garage'].length > 0, 'garage has a lift, benches & parts shelves');
  assert.ok(city.indoorSpots.some((s) => s.type === 'lot' && s.lot === 'garage'));

  // Vacating the lot removes the walk-in registration again
  city.updateLot('garage', null);
  assert.equal(city.buildingById('lot-garage'), null);
});
