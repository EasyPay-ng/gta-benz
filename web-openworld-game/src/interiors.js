// MetroVenture 3D — pure multi-floor building interior logic (no Three.js).
//
// Every enterable building in the city is backed by this module: it decides how
// many storeys a tower has, what each floor is used for (lobby, offices,
// apartments, penthouses, boardrooms, server farms, sky decks…) and generates a
// deterministic furniture layout + collision boxes for each floor. The renderer
// in src/world.js turns these plain objects into 3D meshes, and game.js uses the
// same data for elevator stops, interior collision and the floor indicator HUD.

export const FLOOR_HEIGHT = 3.2;     // storey height (m)
export const MIN_TOWER_FLOORS = 2;
export const MAX_TOWER_FLOORS = 18;
export const ELEVATOR_SIZE = 3.0;    // lift alcove footprint (m)

// ---------------------------------------------------------------------------
// Random helpers (deterministic per building/floor so saves & tests agree)
// ---------------------------------------------------------------------------
export function hash32(...nums) {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    let v = Math.imul(Math.round((n || 0) * 1000) | 0, 374761393) >>> 0;
    h = Math.imul(h ^ v, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Building themes
// ---------------------------------------------------------------------------
export const TOWER_THEMES = {
  corporate: {
    id: 'corporate', name: 'Corporate Tower', short: 'Corporate',
    lobby: 'lobby_corporate',
    floors: ['office', 'office', 'meeting', 'office', 'executive'],
    roof: 'skydeck',
    accent: '#38bdf8',
  },
  residential: {
    id: 'residential', name: 'Residential Tower', short: 'Residential',
    lobby: 'lobby_residential',
    floors: ['apartment', 'apartment', 'studio', 'apartment', 'penthouse'],
    roof: 'roofgarden',
    accent: '#f472b6',
  },
  hotel: {
    id: 'hotel', name: 'Grand Hotel', short: 'Hotel',
    lobby: 'lobby_hotel',
    floors: ['hotel_room', 'hotel_room', 'hotel_room', 'suite', 'penthouse'],
    roof: 'skydeck',
    accent: '#fbbf24',
  },
  tech: {
    id: 'tech', name: 'Tech Tower', short: 'Tech',
    lobby: 'lobby_tech',
    floors: ['open_office', 'server_farm', 'meeting', 'open_office', 'lab'],
    roof: 'skydeck',
    accent: '#22d3ee',
  },
  medical: {
    id: 'medical', name: 'Medical Centre', short: 'Medical',
    lobby: 'lobby_clinic',
    floors: ['clinic', 'lab', 'office', 'ward', 'surgery'],
    roof: 'skydeck',
    accent: '#34d399',
  },
};

export const TOWER_THEME_IDS = Object.keys(TOWER_THEMES);

export function themeFor(id) {
  return TOWER_THEMES[id] || TOWER_THEMES.corporate;
}

/** Pick a stable theme for a building from its world coordinates. */
export function themeForSeed(seed) {
  const rand = mulberry(hash32(seed));
  const pick = rand();
  if (pick < 0.34) return 'corporate';
  if (pick < 0.6) return 'residential';
  if (pick < 0.78) return 'hotel';
  if (pick < 0.92) return 'tech';
  return 'medical';
}

/** Number of storeys a tower of `height` metres has (roof deck lives above). */
export function floorCountForHeight(height) {
  const raw = Math.floor((Math.max(0, height) - 1.0) / FLOOR_HEIGHT);
  return Math.max(MIN_TOWER_FLOORS, Math.min(MAX_TOWER_FLOORS, raw));
}

export function floorBaseY(baseY, level) {
  return baseY + Math.max(0, level) * FLOOR_HEIGHT;
}

export function levelForY(baseY, y, floors) {
  const lv = Math.round((y - baseY) / FLOOR_HEIGHT);
  return Math.max(0, Math.min(floors, lv));
}

// ---------------------------------------------------------------------------
// Floor archetypes: name + furniture props (local coordinates, origin = centre)
// ---------------------------------------------------------------------------
export const FLOOR_KINDS = {
  lobby_corporate: { name: 'Corporate Lobby', kind: 'lobby' },
  lobby_residential: { name: 'Residential Lobby', kind: 'lobby' },
  lobby_hotel: { name: 'Hotel Lobby', kind: 'lobby' },
  lobby_tech: { name: 'Innovation Lobby', kind: 'lobby' },
  lobby_clinic: { name: 'Clinic Reception', kind: 'lobby' },
  office: { name: 'Open-Plan Office', kind: 'office' },
  open_office: { name: 'Engineering Floor', kind: 'office' },
  meeting: { name: 'Boardroom', kind: 'meeting' },
  executive: { name: 'Executive Suite', kind: 'executive' },
  apartment: { name: 'Apartment', kind: 'apartment' },
  studio: { name: 'Studio Flat', kind: 'apartment' },
  penthouse: { name: 'Penthouse', kind: 'penthouse' },
  hotel_room: { name: 'Guest Room', kind: 'hotel_room' },
  suite: { name: 'Luxury Suite', kind: 'penthouse' },
  server_farm: { name: 'Server Farm', kind: 'server' },
  lab: { name: 'Research Lab', kind: 'lab' },
  clinic: { name: 'Consulting Room', kind: 'clinic' },
  ward: { name: 'Patient Ward', kind: 'ward' },
  surgery: { name: 'Operating Theatre', kind: 'lab' },
  skydeck: { name: 'Sky Deck', kind: 'roof' },
  roofgarden: { name: 'Roof Garden', kind: 'roof' },
};

// Footprint (w × d) used for collision, and solid height, for every furniture type.
export const PROP_SPECS = {
  reception:    { w: 4.6, d: 1.5, h: 1.15, collide: true,  label: 'reception desk' },
  sofa:         { w: 2.6, d: 0.95, h: 0.95, collide: true, label: 'sofa' },
  armchair:     { w: 1.1, d: 1.1, h: 0.95, collide: true, label: 'armchair' },
  desk:         { w: 1.9, d: 0.9, h: 1.25, collide: true, label: 'desk' },
  deskpair:     { w: 3.9, d: 0.9, h: 1.25, collide: true, label: 'desk pods' },
  chair:        { w: 0.62, d: 0.62, h: 0.95, collide: true, label: 'chair' },
  meetingtable: { w: 4.4, d: 1.7, h: 0.78, collide: true, label: 'boardroom table' },
  tvwall:       { w: 3.4, d: 0.35, h: 1.9, collide: true, label: 'media wall' },
  bookshelf:    { w: 2.4, d: 0.5, h: 2.3, collide: true, label: 'bookshelf' },
  planter:      { w: 0.9, d: 0.9, h: 1.5, collide: true, label: 'planter' },
  bar:          { w: 2.8, d: 0.8, h: 1.15, collide: true, label: 'bar' },
  kitchen:      { w: 3.4, d: 1.1, h: 1.0, collide: true, label: 'kitchen island' },
  bed:          { w: 2.1, d: 2.3, h: 0.65, collide: true, label: 'bed' },
  dinetable:    { w: 2.2, d: 1.2, h: 0.78, collide: true, label: 'dining table' },
  pooltable:    { w: 2.9, d: 1.6, h: 0.85, collide: true, label: 'pool table' },
  serverrack:   { w: 1.1, d: 1.1, h: 2.2, collide: true, label: 'server rack' },
  labbench:     { w: 3.2, d: 1.1, h: 0.95, collide: true, label: 'laboratory bench' },
  medbed:       { w: 1.2, d: 2.3, h: 0.75, collide: true, label: 'hospital bed' },
  lounger:      { w: 0.9, d: 1.9, h: 0.6, collide: true, label: 'sun lounger' },
  stairs_visual:{ w: 0.9, d: 0.9, h: 0.9, collide: false, label: 'decor' },
  treadmill:    { w: 1.25, d: 2.3, h: 1.45, collide: true, label: 'treadmill' },
  gymbench:     { w: 1.35, d: 2.1, h: 1.25, collide: true, label: 'weight bench' },
  dumbbellrack: { w: 2.3, d: 0.7, h: 1.55, collide: true, label: 'dumbbell rack' },
  cinema_screen:{ w: 8.0, d: 0.5, h: 4.4, collide: true, label: 'cinema screen' },
  artframe:     { w: 2.3, d: 0.35, h: 2.7, collide: true, label: 'artwork' },
  bench:        { w: 2.4, d: 0.65, h: 0.9, collide: true, label: 'bench' },
  counter:      { w: 3.0, d: 0.9, h: 1.15, collide: true, label: 'shop counter' },
  piano:        { w: 2.1, d: 1.4, h: 1.15, collide: true, label: 'grand piano' },
  sculpture:    { w: 1.1, d: 1.1, h: 2.1, collide: true, label: 'sculpture' },
};

/**
 * Deterministic furniture layout for one floor.
 * @param {{ themeId?: string, kindId: string, level: number, floors: number,
 *           width: number, depth: number, seed?: number }} q
 * @returns {{ kindId: string, name: string, kind: string, props: Array<{type:string,x:number,z:number,rot:number}> }}
 */
export function floorPlan(q) {
  const width = Math.max(8, q.width || 16);
  const depth = Math.max(8, q.depth || 16);
  const info = FLOOR_KINDS[q.kindId] || FLOOR_KINDS.office;
  const rand = mulberry(hash32(q.seed || 0, q.level || 0, width, depth, q.kindId?.length || 0));
  const hw = width / 2 - 2.2;
  const hd = depth / 2 - 2.2;
  const props = [];
  const add = (type, x, z, rot = 0) => {
    const spec = PROP_SPECS[type];
    if (!spec) return;
    const spanX = Math.cos(rot) === 0 ? spec.d : spec.w;
    const spanZ = Math.cos(rot) === 0 ? spec.w : spec.d;
    if (Math.abs(x) + spanX / 2 > width / 2 - 0.7) return;
    if (Math.abs(z) + spanZ / 2 > depth / 2 - 0.7) return;
    // keep the lift alcove (north-west corner), its landing step and the
    // front door corridor clear so the player never spawns inside furniture
    const coreX = -width / 2 + 1.6 + ELEVATOR_SIZE / 2;
    const coreZ = -depth / 2 + 1.6 + ELEVATOR_SIZE / 2;
    const landX = coreX + 2.5;
    if (Math.abs(x - coreX) < 2.6 && Math.abs(z - coreZ) < 2.6) return;
    if (Math.abs(x - landX) < spanX / 2 + 0.95 && Math.abs(z - coreZ) < spanZ / 2 + 0.95) return;
    if (q.level === 0 && Math.abs(x) < 2.6 && z > depth / 2 - 9) return;
    // no two props may overlap
    for (const p of props) {
      const s = PROP_SPECS[p.type];
      if (!s) continue;
      const psx = Math.cos(p.rot) === 0 ? s.d : s.w;
      const psz = Math.cos(p.rot) === 0 ? s.w : s.d;
      if (Math.abs(p.x - x) < (spanX + psx) / 2 - 0.05 && Math.abs(p.z - z) < (spanZ + psz) / 2 - 0.05) return;
    }
    props.push({ type, x: +x.toFixed(2), z: +z.toFixed(2), rot: +rot.toFixed(3) });
  };
  const jitter = (v) => v + (rand() - 0.5) * 0.4;

  switch (info.kind) {
    case 'lobby': {
      add('reception', 0, -hd * 0.45 + 1.6, 0);
      add('sofa', -hw * 0.55, hd * 0.35, 0);
      add('sofa', hw * 0.55, hd * 0.35, 0);
      add('armchair', -hw * 0.2, hd * 0.62, Math.PI);
      add('armchair', hw * 0.2, hd * 0.62, Math.PI);
      add('planter', -hw * 0.92, -hd * 0.72, 0);
      add('planter', hw * 0.92, -hd * 0.72, 0);
      add('sculpture', jitter(hw * 0.62), -hd * 0.1, 0);
      break;
    }
    case 'office': {
      add('deskpair', -hw * 0.35, -hd * 0.3, 0);
      add('deskpair', hw * 0.35, -hd * 0.3, 0);
      add('deskpair', -hw * 0.35, hd * 0.28, 0);
      add('deskpair', hw * 0.35, hd * 0.28, 0);
      add('chair', -hw * 0.35, -hd * 0.03, 0);
      add('chair', hw * 0.35, -hd * 0.03, 0);
      add('bookshelf', -hw * 0.92, hd * 0.72, Math.PI / 2);
      add('planter', hw * 0.92, hd * 0.75, 0);
      break;
    }
    case 'meeting': {
      add('meetingtable', 0, 0, 0);
      for (const dx of [-1.7, -0.6, 0.6, 1.7]) add('chair', dx, -1.5, 0);
      for (const dx of [-1.7, -0.6, 0.6, 1.7]) add('chair', dx, 1.5, 0);
      add('tvwall', 0, -hd * 0.9, 0);
      add('planter', -hw * 0.9, hd * 0.75, 0);
      break;
    }
    case 'executive': {
      add('desk', -hw * 0.35, -hd * 0.35, 0);
      add('chair', -hw * 0.35, -hd * 0.35 + 1.2, Math.PI);
      add('sofa', hw * 0.55, hd * 0.4, 0);
      add('bookshelf', hw * 0.9, -hd * 0.6, Math.PI / 2);
      add('sculpture', -hw * 0.85, hd * 0.7, 0);
      break;
    }
    case 'apartment': {
      add('bed', -hw * 0.55, -hd * 0.42, 0);
      add('sofa', hw * 0.5, hd * 0.25, 0);
      add('tvwall', hw * 0.5, -hd * 0.35, 0);
      add('kitchen', -hw * 0.35, hd * 0.62, 0);
      add('dinetable', hw * 0.55, hd * 0.62, 0);
      add('planter', hw * 0.9, -hd * 0.85, 0);
      break;
    }
    case 'penthouse': {
      add('sofa', -hw * 0.45, hd * 0.25, 0);
      add('tvwall', -hw * 0.45, hd * 0.68, 0);
      add('pooltable', hw * 0.5, -hd * 0.15, 0);
      add('bar', hw * 0.6, hd * 0.62, 0);
      add('piano', -hw * 0.62, -hd * 0.45, Math.PI / 4);
      add('planter', hw * 0.92, -hd * 0.85, 0);
      break;
    }
    case 'hotel_room': {
      add('bed', -hw * 0.55, -hd * 0.35, 0);
      add('desk', hw * 0.55, -hd * 0.55, 0);
      add('armchair', hw * 0.55, hd * 0.45, Math.PI);
      add('tvwall', hw * 0.55, -hd * 0.05, 0);
      break;
    }
    case 'server': {
      for (let i = 0; i < 4; i++) add('serverrack', -hw * 0.6 + i * 1.5, -hd * 0.45, 0);
      for (let i = 0; i < 4; i++) add('serverrack', -hw * 0.6 + i * 1.5, hd * 0.45, 0);
      add('desk', hw * 0.55, hd * 0.05, Math.PI / 2);
      break;
    }
    case 'lab': {
      add('labbench', -hw * 0.4, -hd * 0.35, 0);
      add('labbench', hw * 0.4, -hd * 0.35, 0);
      add('labbench', -hw * 0.4, hd * 0.35, 0);
      add('desk', hw * 0.5, hd * 0.6, 0);
      add('planter', -hw * 0.92, hd * 0.8, 0);
      break;
    }
    case 'clinic': {
      add('desk', -hw * 0.4, -hd * 0.3, 0);
      add('medbed', hw * 0.45, 0, 0);
      add('armchair', -hw * 0.6, hd * 0.55, Math.PI);
      add('planter', hw * 0.9, -hd * 0.8, 0);
      break;
    }
    case 'ward': {
      for (const dx of [-hw * 0.55, 0, hw * 0.55]) add('medbed', dx, -hd * 0.35, 0);
      add('desk', 0, hd * 0.55, 0);
      add('armchair', hw * 0.75, hd * 0.1, Math.PI / 2);
      break;
    }
    case 'roof': {
      add('lounger', -hw * 0.6, -hd * 0.2, 0);
      add('lounger', -hw * 0.6, hd * 0.2, 0);
      add('bar', hw * 0.45, -hd * 0.35, 0);
      add('planter', hw * 0.8, hd * 0.6, 0);
      add('planter', -hw * 0.85, hd * 0.65, 0);
      add('dinetable', hw * 0.4, hd * 0.35, 0);
      break;
    }
    default: {
      add('deskpair', 0, 0, 0);
      add('planter', hw * 0.85, hd * 0.8, 0);
    }
  }
  return { kindId: q.kindId, name: info.name, kind: info.kind, props };
}

/** Pick the archetype used on a given level of a themed tower. */
export function kindForLevel(themeId, level, floors) {
  const theme = themeFor(themeId);
  if (level <= 0) return theme.lobby;
  if (level >= floors) return theme.roof;
  const idx = (level - 1) % theme.floors.length;
  return theme.floors[idx];
}

/** Elevator stops: every floor plus the rooftop deck. */
export function elevatorStops(building) {
  const theme = themeFor(building.themeId);
  const floors = building.floors || floorCountForHeight(building.height);
  const out = [{ level: 0, label: `Lobby · ${FLOOR_KINDS[theme.lobby]?.name || 'Lobby'}`, short: 'L' }];
  for (let lv = 1; lv < floors; lv++) {
    const kindId = kindForLevel(building.themeId, lv, floors);
    out.push({ level: lv, label: `Floor ${lv} · ${FLOOR_KINDS[kindId]?.name || 'Office'}`, short: String(lv) });
  }
  out.push({ level: floors, label: `Sky Deck · ${FLOOR_KINDS[theme.roof]?.name || 'Roof'}`, short: 'R' });
  return out;
}

export function floorLabel(building, level) {
  const floors = building.floors || floorCountForHeight(building.height);
  const theme = themeFor(building.themeId);
  if (level <= 0) return `Lobby · ${FLOOR_KINDS[theme.lobby]?.name || 'Lobby'}`;
  if (level >= floors) return `Sky Deck · ${FLOOR_KINDS[theme.roof]?.name || 'Roof'}`;
  const kindId = kindForLevel(building.themeId, level, floors);
  return `Floor ${level} · ${FLOOR_KINDS[kindId]?.name || 'Office'}`;
}

/** Full world-space layout for one floor of a building (used for meshes + collision). */
export function floorLayout(building, level) {
  const floors = building.floors || floorCountForHeight(building.height);
  const kindId = kindForLevel(building.themeId, level, floors);
  const plan = floorPlan({
    themeId: building.themeId, kindId, level, floors,
    width: building.width, depth: building.depth, seed: building.seed || 1,
  });
  const cx = building.x;
  const cz = building.z;
  const rot = building.yaw || 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const props = plan.props.map((p) => {
    // rotate the local prop position into world space (buildings face the road)
    const wx = cx + p.x * cos + p.z * sin;
    const wz = cz - p.x * sin + p.z * cos;
    return { ...p, x: +wx.toFixed(2), z: +wz.toFixed(2), worldRot: p.rot + rot };
  });
  return { ...plan, level, y: floorBaseY(building.baseY || 0, level), props };
}

/** AABB collision boxes for a floor's furniture, in world space. */
export function propColliders(layout) {
  const out = [];
  for (const p of layout.props) {
    const spec = PROP_SPECS[p.type];
    if (!spec || !spec.collide) continue;
    const quarter = Math.abs(Math.round(p.worldRot / (Math.PI / 2))) % 2 === 1;
    const w = quarter ? spec.d : spec.w;
    const d = quarter ? spec.w : spec.d;
    out.push({ minX: p.x - w / 2, maxX: p.x + w / 2, minZ: p.z - d / 2, maxZ: p.z + d / 2 });
  }
  return out;
}

/** Elevator alcove centre in world space for a building. */
export function elevatorPoint(building) {
  const rot = building.yaw || 0;
  const lx = -(building.width / 2) + 1.6 + ELEVATOR_SIZE / 2;
  const lz = -(building.depth / 2) + 1.6 + ELEVATOR_SIZE / 2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: building.x + lx * cos + lz * sin,
    z: building.z - lx * sin + lz * cos,
  };
}
