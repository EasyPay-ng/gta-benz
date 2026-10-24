// MetroVenture 3D — procedural district streaming (pure, no Three.js).
//
// Metro City used to stop at a hard invisible wall. This module describes the
// city *outside* the hand-built centre: a repeating 300 m cell grid whose roads
// line up with the authored street grid (every 75 m) and whose blocks are
// filled with deterministic, seed-stable buildings. `world.js` turns each cell
// into meshes on demand and drops them again when the player drives away, so the
// city keeps going in every direction forever.

export const CELL = 300;          // cell size in metres (4 × 4 city blocks)
export const ROAD_STEP = 75;      // matches the authored ROAD_LINES grid
export const ROAD_HALF = 7;       // half road width, matches the centre
export const CURB_Y = 0.1;        // pavement height
export const STREAM_RADIUS = 1;   // cells loaded around the player
export const CELL_SPAN = CELL;    // alias used by the renderer

/**
 * The hand-built centre: the original city, the university campus to the north
 * and the South Waterfront to the south. These cells are already authored, so
 * the streamer must never generate over them.
 */
export const CORE_CELLS = new Set(['0,-1', '0,0', '0,1']);

export function cellOf(v) {
  return Math.floor(Number(v) / CELL);
}

export function keyOf(i, j) {
  return `${i},${j}`;
}

export function isCoreCell(i, j) {
  return CORE_CELLS.has(keyOf(i, j));
}

export function boundsOf(i, j) {
  const minX = i * CELL - CELL / 2;
  const minZ = j * CELL - CELL / 2;
  return { minX, maxX: minX + CELL, minZ, maxZ: minZ + CELL };
}

export function roadCellOf(v) {
  return ((Math.floor(Number(v) / ROAD_STEP) * ROAD_STEP) % CELL + CELL) % CELL;
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------
export function hashSeed(...parts) {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 0x9e3779b9, 16777619);
  }
  return h >>> 0;
}

export function randFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
const FIRST_WORDS = [
  'Kestrel', 'Aster', 'Harbor', 'Beacon', 'Orchard', 'Lantern', 'Cedar', 'Ivory',
  'Copper', 'Meridian', 'Solace', 'Juniper', 'Basalt', 'Ember', 'Cobalt', 'Verdant',
  'Northgate', 'Silverline', 'Fairmount', 'Crescent', 'Marigold', 'Pioneer', 'Quarry',
  'Sable', 'Tidewater', 'Upland', 'Vantage', 'Willow', 'Zenith', 'Alcove',
];
const KIND_WORDS = {
  tower: ['Tower', 'Heights', 'Towers', 'Plaza', 'Spire'],
  shop: ['Market', 'Corner', 'Traders', 'Supply Co.', 'Store', 'Bazaar'],
  cafe: ['Café', 'Coffee House', 'Bakery', 'Deli'],
  office: ['Offices', 'Business Park', 'Chambers', 'Suites'],
};
const THEMES = ['corporate', 'residential', 'tech', 'hotel'];
const PALETTE = ['#c9d3dd', '#d8c9b4', '#bfc7b6', '#d6c3c9', '#c6cfd8', '#e0d3c0'];

/** A stable, readable building name for a cell index. */
export function buildingName(seed, kind) {
  const rand = randFrom(seed);
  const first = pick(rand, FIRST_WORDS);
  const tail = pick(rand, KIND_WORDS[kind] || KIND_WORDS.shop);
  return `${first} ${tail}`;
}

// ---------------------------------------------------------------------------
// One cell
// ---------------------------------------------------------------------------
const BLOCK = ROAD_STEP;             // one city block between two roads
const BUILD_HALF = (BLOCK / 2) - ROAD_HALF - 3.2; // half of the buildable frontage

/**
 * Everything the renderer needs to build one 300 m cell:
 *  - `roadsX` / `roadsZ`: road centre lines that belong to this cell
 *  - `buildings`: walkable shopfront boxes with a door facing the street
 *  - `trees`, `lamps`: dressing
 *
 * The same (i, j) always produces the same layout, so cells can be unloaded and
 * rebuilt later without the city changing shape.
 */
export function cellLayout(i, j) {
  const b = boundsOf(i, j);
  const seed = hashSeed('cell', i, j);
  const rand = randFrom(seed);

  // roads on the shared 75 m grid; half-open range so neighbours never overlap
  const roadsX = [];
  const roadsZ = [];
  for (let v = Math.ceil(b.minX / ROAD_STEP) * ROAD_STEP; v < b.maxX; v += ROAD_STEP) roadsX.push(v);
  for (let v = Math.ceil(b.minZ / ROAD_STEP) * ROAD_STEP; v < b.maxZ; v += ROAD_STEP) roadsZ.push(v);

  const buildings = [];
  const trees = [];
  const lamps = [];
  let n = 0;

  for (let bi = 0; bi < roadsX.length - 1; bi++) {
    for (let bj = 0; bj < roadsZ.length - 1; bj++) {
      const cx = roadsX[bi] + BLOCK / 2;
      const cz = roadsZ[bj] + BLOCK / 2;
      const roll = rand();

      if (roll < 0.18) {
        // a small park
        const count = 2 + Math.floor(rand() * 3);
        for (let t = 0; t < count; t++) {
          trees.push({
            x: +(cx + (rand() - 0.5) * (BUILD_HALF * 1.4)).toFixed(2),
            z: +(cz + (rand() - 0.5) * (BUILD_HALF * 1.4)).toFixed(2),
            scale: +(0.9 + rand() * 0.6).toFixed(2),
          });
        }
        continue;
      }
      if (roll > 0.94) continue; // empty lot / car park

      const tall = rand() < 0.28;
      const kind = tall ? 'tower' : (rand() < 0.28 ? 'office' : 'shop');
      const width = +(Math.min(BUILD_HALF * 2, 16 + rand() * 12)).toFixed(1);
      const depth = +(Math.min(BUILD_HALF * 2, 14 + rand() * 10)).toFixed(1);
      const height = tall ? +(22 + rand() * 34).toFixed(1) : +(6.5 + rand() * 7).toFixed(1);
      // doors face the street: +z or -z of the block
      const yaw = rand() < 0.5 ? 0 : Math.PI;
      const doorSide = yaw === 0 ? 1 : -1;
      const place = {
        id: `w${i}_${j}_${n}`,
        kind: tall ? 'tower-shell' : 'shop',
        name: buildingName(hashSeed(seed, 'name', n), kind),
        x: +(cx + (rand() - 0.5) * Math.max(0, BUILD_HALF * 2 - width)).toFixed(2),
        z: +(cz + (rand() - 0.5) * Math.max(0, BUILD_HALF * 2 - depth)).toFixed(2),
        width,
        depth,
        height,
        floors: 0,
        yaw,
        doorSide,
        doorWidth: +(Math.min(width - 4, 3.4 + rand() * 1.6)).toFixed(2),
        doorHeight: 3.1,
        themeId: pick(rand, THEMES),
        color: pick(rand, PALETTE),
        seed: hashSeed(seed, 'b', n),
      };
      buildings.push(place);
      n += 1;

      // street lamps on two corners of the block
      lamps.push({ x: +(cx - BUILD_HALF + 1.4).toFixed(2), z: +(roadsZ[bj] + ROAD_HALF + 1.6).toFixed(2) });
      if (rand() < 0.6) lamps.push({ x: +(roadsX[bi] + ROAD_HALF + 1.6).toFixed(2), z: +(cz + BUILD_HALF - 1.4).toFixed(2) });
    }
  }

  // a few roadside trees between buildings (never in the carriageway)
  for (let t = 0; t < 3; t++) {
    const x = +(b.minX + 12 + rand() * (CELL - 24)).toFixed(2);
    const z = +(b.minZ + 12 + rand() * (CELL - 24)).toFixed(2);
    const scale = +(0.9 + rand() * 0.5).toFixed(2);
    if (isGridRoad(x, z, ROAD_HALF + 1.6)) continue;
    trees.push({ x, z, scale });
  }

  // pavement spans the whole cell: the last block runs to the cell edge, where
  // the road itself is drawn by the neighbour (keeps streets from z-fighting)
  const padsX = [...roadsX, b.maxX];
  const padsZ = [...roadsZ, b.maxZ];

  return { i, j, key: keyOf(i, j), seed, bounds: b, roadsX, roadsZ, padsX, padsZ, buildings, trees, lamps };
}

// ---------------------------------------------------------------------------
// Queries used by the renderer / minimap
// ---------------------------------------------------------------------------
/** Cells that must be loaded for a player standing at (x, z). */
export function cellsAround(x, z, radius = STREAM_RADIUS) {
  const ci = cellOf(x);
  const cj = cellOf(z);
  const out = [];
  for (let dj = -radius; dj <= radius; dj++) {
    for (let di = -radius; di <= radius; di++) {
      out.push({ i: ci + di, j: cj + dj, key: keyOf(ci + di, cj + dj) });
    }
  }
  return out;
}

/** True when a cell is far enough away to be dropped. */
export function shouldUnload(rec, x, z, radius = STREAM_RADIUS + 1) {
  return Math.abs(rec.i - cellOf(x)) > radius || Math.abs(rec.j - cellOf(z)) > radius;
}

export function isGridRoad(x, z, half = ROAD_HALF) {
  const near = (v) => {
    const m = ((v % ROAD_STEP) + ROAD_STEP) % ROAD_STEP;
    return Math.min(m, ROAD_STEP - m) <= half;
  };
  return near(x) || near(z);
}

/** Street name for a coordinate outside the authored grid. */
const NAMES_X = ['Broad Ave', '2nd St', '3rd St', 'Kingsway', 'Central Ave', 'Market St'];
const NAMES_Z = ['Harbor Rd', 'Cedar Ave', 'Union St', 'Riverside', 'Vista Blvd', 'Orchard Way'];

export function streetName(x, z) {
  const ni = Math.abs(Math.round(x / ROAD_STEP)) % NAMES_X.length;
  const nj = Math.abs(Math.round(z / ROAD_STEP)) % NAMES_Z.length;
  return `${NAMES_X[ni]} & ${NAMES_Z[nj]}`;
}
