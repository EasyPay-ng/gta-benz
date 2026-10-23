// MetroVenture 3D — pure 3D Architect Build & Furnish logic (no Three.js).
//
// Players can raise their own multi-storey structures anywhere in Metro City:
// floor slabs, walls (solid / windowed / doorway / glass), stairs, pillars,
// balcony railings and pitched roofs, then furnish the rooms with 3D sofas,
// beds, desks, TVs, bookshelves, lamps and palms. This module owns the catalog
// rules, grid snapping, placement validation, save serialisation, collision
// boxes and walkable surfaces — all unit-tested and free of DOM/WebGL.

import {
  BUILD_ITEMS, BUILD_COLORS, BUILD_STORY_H, BLOCK_SIZE, MAX_CUSTOM_BUILDS, WORLD_LIMIT,
} from './data.js';

export const STRUCTURE_GRID = 4.0;   // walls/floors tile on a 4 m architectural grid
export const FURNITURE_GRID = 0.5;   // furniture moves in 0.5 m nudges
export const STEP_UP = 0.45;         // max height the player can step up (stairs = 0.4 m)
export const WALL_HEIGHT = BUILD_STORY_H;
export const WALL_LENGTH = 4.0;
export const WALL_THICK = 0.22;
export const SLAB_THICK = 0.2;

export const ITEM_BY_ID = Object.fromEntries(BUILD_ITEMS.map((it) => [it.id, it]));

const WALL_TYPES = new Set(['wall_solid', 'wall_window', 'wall_door', 'glass_wall', 'railing']);
const FLOOR_TYPES = new Set(['floor_stone', 'floor_wood']);
const TALL_TYPES = new Set(['pillar', 'wall_solid', 'wall_window', 'wall_door', 'glass_wall']);

export function itemById(id) {
  return ITEM_BY_ID[id] || null;
}

export function isBlock(itemOrId) {
  const it = typeof itemOrId === 'string' ? itemById(itemOrId) : itemOrId;
  return !!it && it.cat === 'block';
}

export function isStructure(itemOrId) {
  const it = typeof itemOrId === 'string' ? itemById(itemOrId) : itemOrId;
  return !!it && it.cat === 'structure';
}

export function isFloorPiece(piece) {
  return FLOOR_TYPES.has(piece?.item);
}

export function gridFor(item) {
  if (!item) return FURNITURE_GRID;
  if (Number.isFinite(item.grid) && item.grid > 0) return item.grid;
  return item.cat === 'structure' ? STRUCTURE_GRID : FURNITURE_GRID;
}

export function snap(value, grid) {
  return Math.round(value / grid) * grid;
}

export function snapPlacement(item, x, z, y = 0) {
  const grid = gridFor(item);
  return {
    x: +snap(x, grid).toFixed(2),
    z: +snap(z, grid).toFixed(2),
    y: +(+y).toFixed(2),
  };
}

export function snapRotation(rot) {
  const step = Math.PI / 2;
  const n = ((Math.round((rot || 0) / step) % 4) + 4) % 4;
  return n * step;
}

export function rotQuarter(rot) {
  const n = Math.round((((rot || 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 2));
  return n % 4;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export function createBuildState() {
  return { pieces: [] };
}

let idCounter = 0;
export function nextPieceId() {
  idCounter += 1;
  return `p${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** Repair/validate a loaded (or hostile) save payload into a safe build state. */
export function normalizeBuildState(raw) {
  const pieces = Array.isArray(raw) ? raw : Array.isArray(raw?.pieces) ? raw.pieces : [];
  const out = [];
  for (const p of pieces) {
    if (!p || typeof p !== 'object') continue;
    const item = typeof p.item === 'string' ? itemById(p.item) : null;
    if (!item) continue;
    const x = Number(p.x); const z = Number(p.z); const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) continue;
    if (Math.abs(x) > WORLD_LIMIT + 40 || Math.abs(z) > WORLD_LIMIT + 40) continue;
    out.push({
      id: typeof p.id === 'string' && p.id.length <= 24 ? p.id : nextPieceId(),
      item: item.id,
      x: +x.toFixed(2),
      z: +z.toFixed(2),
      y: +y.toFixed(2),
      rot: snapRotation(p.rot),
      color: typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : item.defaultColor,
    });
    if (out.length >= MAX_CUSTOM_BUILDS) break;
  }
  return { pieces: out };
}

export function pieceCount(build) {
  return build?.pieces?.length || 0;
}

export function summary(build) {
  let structure = 0; let furniture = 0; let blocks = 0;
  for (const p of build?.pieces || []) {
    const it = itemById(p.item);
    if (!it) continue;
    if (it.cat === 'block') blocks += 1;
    else if (it.cat === 'structure') structure += 1;
    else furniture += 1;
  }
  const levels = new Set((build?.pieces || []).map((p) => Math.round(p.y / WALL_HEIGHT)));
  return {
    structure, furniture, blocks,
    total: structure + furniture + blocks,
    levels: Math.max(1, levels.size),
  };
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------
export function validatePlacement(build, item, p) {
  if (!item) return { ok: false, msg: 'Unknown building piece.' };
  if (!build || !Array.isArray(build.pieces)) return { ok: false, msg: 'Build state missing.' };
  if (build.pieces.length >= MAX_CUSTOM_BUILDS) {
    return { ok: false, msg: `Build limit reached (${MAX_CUSTOM_BUILDS} pieces). Demolish something first.` };
  }
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.y)) {
    return { ok: false, msg: 'Invalid placement position.' };
  }
  if (Math.abs(p.x) > WORLD_LIMIT || Math.abs(p.z) > WORLD_LIMIT) {
    return { ok: false, msg: 'That is outside the city limits.' };
  }
  if (p.y < -1 || p.y > 220) return { ok: false, msg: 'That height is out of reach.' };
  const dup = build.pieces.find((q) => q.item === item.id
    && Math.abs(q.x - p.x) < 0.26 && Math.abs(q.z - p.z) < 0.26 && Math.abs(q.y - p.y) < 0.26);
  if (dup) return { ok: false, msg: 'There is already a piece exactly there.' };
  return { ok: true };
}

export function addPiece(build, itemId, p, opts = {}) {
  const item = itemById(itemId);
  const placed = { x: p.x, y: p.y, z: p.z, rot: snapRotation(p.rot), color: opts.color || item?.defaultColor || BUILD_COLORS[0] };
  const check = validatePlacement(build, item, placed);
  if (!check.ok) return check;
  const piece = { id: nextPieceId(), item: item.id, ...placed };
  build.pieces.push(piece);
  return { ok: true, piece, msg: `${item.name} placed.` };
}

export function removePiece(build, id) {
  const i = build.pieces.findIndex((p) => p.id === id);
  if (i < 0) return { ok: false, msg: 'Nothing to demolish there.' };
  const [piece] = build.pieces.splice(i, 1);
  return { ok: true, piece, msg: `${itemById(piece.item)?.name || 'Piece'} demolished.` };
}

/** Nearest placed piece to a world point on the same storey (for demolish). */
export function pieceNear(build, x, z, y, maxDist = 2.6) {
  let best = null; let bd = Infinity;
  for (const p of build?.pieces || []) {
    if (Math.abs(p.y - y) > 1.6) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < maxDist && d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Geometry: turning plain pieces into collision AABBs & walkable surfaces
// ---------------------------------------------------------------------------
export function pieceAabb(piece) {
  const it = itemById(piece.item);
  if (!it) return null;
  const quarter = rotQuarter(piece.rot) % 2 === 1;
  let w = WALL_LENGTH; let d = WALL_LENGTH;
  if (it.cat === 'block') {
    w = BLOCK_SIZE; d = BLOCK_SIZE;
  } else if (it.cat === 'furniture') {
    const spec = FURNITURE_SIZE[piece.item] || { w: 1, d: 1 };
    w = quarter ? spec.d : spec.w;
    d = quarter ? spec.w : spec.d;
  } else if (WALL_TYPES.has(piece.item)) {
    w = quarter ? WALL_THICK : WALL_LENGTH;
    d = quarter ? WALL_LENGTH : WALL_THICK;
    if (piece.item === 'railing') { w = quarter ? 0.14 : WALL_LENGTH; d = quarter ? WALL_LENGTH : 0.14; }
  } else if (piece.item === 'pillar') {
    w = 0.6; d = 0.6;
  } else if (piece.item === 'stairs') {
    w = quarter ? 3.2 : WALL_LENGTH;
    d = quarter ? WALL_LENGTH : 3.2;
  } else if (piece.item === 'roof_gable') {
    w = WALL_LENGTH + 0.8; d = WALL_LENGTH + 0.8;
  }
  return { minX: piece.x - w / 2, maxX: piece.x + w / 2, minZ: piece.z - d / 2, maxZ: piece.z + d / 2 };
}

export const FURNITURE_SIZE = {
  sofa: { w: 2.6, d: 1.0, h: 0.95 },
  bed: { w: 2.0, d: 2.3, h: 0.7 },
  desk: { w: 2.0, d: 0.9, h: 1.3 },
  table: { w: 2.0, d: 1.2, h: 0.8 },
  tv_stand: { w: 2.4, d: 0.55, h: 1.7 },
  bookshelf: { w: 2.0, d: 0.5, h: 2.2 },
  lamp: { w: 0.5, d: 0.5, h: 1.7 },
  plant: { w: 0.9, d: 0.9, h: 1.6 },
};

/** Solid pieces that block a body whose feet are at `feetY`. */
export function collidersNear(build, feetY) {
  const out = [];
  for (const p of build?.pieces || []) {
    const it = itemById(p.item);
    if (!it) continue;
    const aabb = pieceAabb(p);
    if (!aabb) continue;
    if (it.cat === 'block') {
      // solid 1 m cube — you can stand on top but not walk through it
      if (feetY < p.y - 0.3 || feetY > p.y + BLOCK_SIZE - 0.06) continue;
    } else if (it.cat === 'furniture') {
      const spec = FURNITURE_SIZE[p.item];
      if (!spec) continue;
      if (feetY < p.y - 0.3 || feetY > p.y + spec.h) continue;
    } else if (TALL_TYPES.has(p.item)) {
      if (feetY < p.y - 0.3 || feetY > p.y + WALL_HEIGHT - 0.06) continue;
    } else if (p.item === 'railing') {
      if (feetY < p.y - 0.3 || feetY > p.y + 1.08) continue;
    } else if (p.item === 'stairs') {
      continue; // stairs are climbable
    } else if (p.item === 'roof_gable') {
      if (feetY < p.y - 0.3 || feetY > p.y + 1.8) continue;
    } else {
      continue; // floors are walkable, never solid
    }
    out.push(aabb);
  }
  return out;
}

/** Stair step surfaces (8 × 0.4 m risers) in world space. */
export function stairSteps(piece) {
  const quarter = rotQuarter(piece.rot);
  const steps = [];
  const W = WALL_LENGTH;
  const run = 0.4;
  // local space: steps ascend along +Z from -1.6 to +1.6
  for (let i = 0; i < 8; i++) {
    const lz = -1.6 + i * run + run / 2;
    const top = piece.y + (i + 1) * 0.4;
    let minX; let maxX; let minZ; let maxZ;
    if (quarter % 2 === 0) {
      minX = piece.x - W / 2; maxX = piece.x + W / 2;
      const zc = piece.z + (quarter === 0 ? lz : -lz);
      minZ = zc - run / 2; maxZ = zc + run / 2;
    } else {
      const xc = piece.x + (quarter === 1 ? -lz : lz);
      minX = xc - run / 2; maxX = xc + run / 2;
      minZ = piece.z - W / 2; maxZ = piece.z + W / 2;
    }
    steps.push({ minX, maxX, minZ, maxZ, y: +top.toFixed(2), kind: 'stair' });
  }
  return steps;
}

/** Every walkable built surface (floor slabs + climbing stairs). */
export function walkSurfaces(build) {
  const out = [];
  for (const p of build?.pieces || []) {
    if (FLOOR_TYPES.has(p.item)) {
      const aabb = pieceAabb(p);
      out.push({ ...aabb, y: p.y, kind: 'floor' });
    } else if (isBlock(p.item)) {
      // every block top is a surface you can stand (and stack) on
      const aabb = pieceAabb(p);
      out.push({ ...aabb, y: +(p.y + BLOCK_SIZE).toFixed(2), kind: 'block' });
    } else if (p.item === 'stairs') {
      out.push(...stairSteps(p));
    }
  }
  return out;
}

/** Highest walkable surface at (x,z) reachable from `feetY` (+ step-up). */
export function supportAt(surfaces, x, z, feetY, groundY = 0) {
  let best = groundY;
  const limit = feetY + STEP_UP;
  for (const s of surfaces) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    if (s.y > limit + 0.001) continue;
    if (s.y > best) best = s.y;
  }
  return best;
}

export function serializeBuild(build) {
  return { pieces: (build?.pieces || []).map(({ id, item, x, y, z, rot, color }) => ({ id, item, x, y, z, rot, color })) };
}

/** Compact one-line description used by the HUD. */
export function describePiece(piece) {
  const it = itemById(piece?.item);
  return it ? it.name : 'Unknown piece';
}
