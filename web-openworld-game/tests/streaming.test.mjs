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

const Streaming = await import('../src/streaming.js');
const THREE = await import('three');
const { City } = await import('../src/world.js');

// ---------------------------------------------------------------------------
// 1. Cell layout is deterministic and lines up with the authored grid
// ---------------------------------------------------------------------------
test('Streaming: a cell is generated the same way every time it loads', () => {
  const a = Streaming.cellLayout(3, -2);
  const b = Streaming.cellLayout(3, -2);
  assert.equal(a.key, '3,-2');
  assert.deepEqual(a, b);
  assert.notEqual(Streaming.cellLayout(4, -2).seed, a.seed);
  assert.ok(a.buildings.length > 0, 'cells are populated');
  for (const building of a.buildings) {
    assert.ok(building.width > 6 && building.depth > 6, `${building.id} has a real footprint`);
    assert.ok(building.height >= 6, `${building.id} has height`);
    assert.ok(building.name.length > 3, `${building.id} has a name`);
    assert.ok(building.doorWidth >= 2.6 && building.doorWidth <= building.width - 4.2);
  }
});

test('Streaming: roads sit on the same 75 m grid as downtown and cover the cell', () => {
  for (const [i, j] of [[1, 0], [-1, 2], [4, 4], [-3, -5]]) {
    const cell = Streaming.cellLayout(i, j);
    for (const x of cell.roadsX) assert.equal(Math.abs(x % Streaming.ROAD_STEP), 0, 'roads snap to the grid');
    for (const z of cell.roadsZ) assert.equal(Math.abs(z % Streaming.ROAD_STEP), 0, 'roads snap to the grid');
    // the pavement line sets run right out to the cell edge so there is no lawn gap
    assert.equal(cell.padsX.at(-1), cell.bounds.maxX);
    assert.equal(cell.padsZ.at(-1), cell.bounds.maxZ);
    assert.equal(cell.padsX[0], cell.roadsX[0]);
    // neighbours share the boundary road without both drawing it
    const right = Streaming.cellLayout(i + 1, j);
    assert.equal(right.roadsX[0], cell.padsX.at(-1));
  }
  assert.equal(Streaming.isGridRoad(300, 7), true);
  assert.equal(Streaming.isGridRoad(-75, 0), true);
  assert.equal(Streaming.isGridRoad(312, 12), false);
});

test('Streaming: the authored centre is never regenerated', () => {
  assert.equal(Streaming.isCoreCell(0, 0), true);
  assert.equal(Streaming.isCoreCell(0, 1), true);
  assert.equal(Streaming.isCoreCell(0, -1), true);
  assert.equal(Streaming.isCoreCell(1, 0), false);
  const cell = Streaming.cellLayout(0, 0);
  assert.ok(cell.bounds.minX === -150 && cell.bounds.maxX === 150);
});

test('Streaming: cells are only dropped once the player is well clear', () => {
  const rec = { i: 2, j: 1, key: '2,1' };
  assert.equal(Streaming.shouldUnload(rec, 600, 300), false, 'still in the next ring: kept');
  assert.equal(Streaming.shouldUnload(rec, 1200, 300), false, 'one ring behind: still kept');
  assert.equal(Streaming.shouldUnload(rec, 1500, 300), true, 'three rings behind: dropped');
  const around = Streaming.cellsAround(150, 0, 1);
  assert.equal(around.length, 9);
  assert.ok(around.some((c) => c.key === '0,0'));
  assert.ok(around.some((c) => c.key === '1,0'));
});

test('Streaming: out-of-town addresses still read like city streets', () => {
  const name = Streaming.streetName(500, 500);
  assert.match(name, / & /);
  assert.equal(name, Streaming.streetName(500, 500));
  assert.notEqual(Streaming.streetName(500, 500), Streaming.streetName(1200, 900));
});

// ---------------------------------------------------------------------------
// 2. The city really does build itself outward
// ---------------------------------------------------------------------------
function snapshot(city) {
  return {
    colliders: city.colliders.length,
    enterables: city.enterables.length,
    propSpots: city.propSpots.length,
    doors: city.doors.length,
    zones: city.interiorZones.length,
    groups: city.streamRoot.children.length,
  };
}

test('Streaming: driving past the old edge builds walkable districts out there', () => {
  const city = new City(new THREE.Scene());
  assert.equal(city.streamCells.size, 0);
  assert.equal(city.isOnRoad(0, 0), true);
  // a spot 1.5 km away from downtown is dry land on the grid, not nothing
  assert.equal(city.groundY(1500, 0), 0);
  assert.ok(city.groundY(1512, 12) > 0, 'sidewalk height away from the roads');

  const loaded = city.updateStreaming(1500, 0, { budget: 9 });
  assert.ok(loaded.built > 0, 'cells were generated on demand');
  assert.ok(city.streamCells.size > 0);
  assert.ok(city.streamStats.buildings > 0);
  assert.ok(city.streamStats.cells === city.streamCells.size);

  const streamed = city.enterables.filter((b) => b.streamed);
  assert.ok(streamed.length >= 5, 'the new district has buildings');
  for (const b of streamed) {
    assert.ok(Math.abs(b.x - 1500) < 500 && Math.abs(b.z) < 500, 'built near the player, not downtown');
    assert.equal(b.floors, 0);
    assert.ok(b.themeId, 'streamed buildings are themed');
    // every generated building is enterable: a door, an interior and a zone
    assert.equal(city.doors.filter((d) => d.buildingId === b.id).length, 1);
    assert.ok(city.interiorFurniture[b.id], 'interior furniture exists');
    assert.ok(city.interiorZones.some((z) => b.x > z.minX && b.x < z.maxX && b.z > z.minZ && b.z < z.maxZ));
    assert.equal(city.buildingAt(b.x, b.z)?.building?.id, b.id);
    // the interior camera is capped by the 4.2 m shopfront ceiling, not the tower mass
    const ceiling = city.ceilingAt(b.x, b.z, b.baseY);
    assert.ok(b.shellH >= 4.2 && b.shellH <= b.height, `${b.id} has a shopfront shell under its mass`);
    assert.ok(Math.abs(ceiling - (b.baseY + b.shellH - 0.12)) < 0.01, `${b.id} has a single-room ceiling`);
  }
});

test('Streaming: leaving a district cleans up every trace of it', () => {
  const city = new City(new THREE.Scene());
  const empty = snapshot(city);
  // the ring of cells hugging downtown is legitimately built while you stand there
  for (let k = 0; k < 4; k++) city.updateStreaming(0, 0, { budget: 9 });
  const base = snapshot(city);
  assert.ok(base.enterables > empty.enterables, 'the city continues past the old edge');

  city.updateStreaming(1500, 1500, { budget: 9 });
  const far = snapshot(city);
  assert.ok(far.colliders > base.colliders);
  assert.ok(far.groups > 0);

  // drive all the way back downtown: only the ring hugging the city remains
  for (let k = 0; k < 4; k++) city.updateStreaming(0, 0, { budget: 9 });
  assert.deepEqual(snapshot(city), base, 'colliders, props, doors and zones all roll back');
  assert.equal(city.streamRoot.children.length, city.streamCells.size, 'no orphan groups');
});

test('Streaming: driving forever does not leak — the loaded set stays bounded', () => {
  const city = new City(new THREE.Scene());
  const base = snapshot(city);
  let peak = 0;
  for (let k = 0; k < 4; k++) city.updateStreaming(0, 0, { budget: 9 });
  const home = snapshot(city);
  for (let step = 0; step < 40; step++) {
    const x = step * 260;
    const z = Math.sin(step * 0.4) * 900;
    for (let k = 0; k < 6; k++) city.updateStreaming(x, z, { budget: 2 });
    peak = Math.max(peak, city.streamCells.size);
    assert.ok(city.colliders.length < home.colliders + 1200, `collider list stayed bounded at step ${step}`);
    assert.ok(city.enterables.length < home.enterables + 200, `enterables stayed bounded at step ${step}`);
    assert.equal(city.streamRoot.children.length, city.streamCells.size, 'no orphan groups');
  }
  assert.ok(peak <= 24, `never more than a few rings of cells loaded (${peak})`);

  // 10 km out, then straight back home: the city is exactly as it was
  city.updateStreaming(10000, -9000, { budget: 9 });
  for (let k = 0; k < 4; k++) city.updateStreaming(0, 0, { budget: 9 });
  assert.deepEqual(snapshot(city), home);

  // …and it still generates there afterwards
  const again = city.updateStreaming(10000, -9000, { budget: 9 });
  assert.ok(again.built > 0);
  assert.ok(city.enterables.some((b) => b.streamed && Math.abs(b.x - 10000) < 400));
});
