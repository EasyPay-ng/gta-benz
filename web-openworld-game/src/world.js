// MetroVenture 3D — procedural city: roads, sidewalks, blocks, buildings, lots, stations.
import * as THREE from 'three';
import {
  ROAD_LINES, ROAD_HALF, SIDEWALK_W, BLOCK_HALF, SIDEWALK_RING, BLOCK_CENTERS, BUSINESSES,
  STATIONS, DEALERSHIP, BOUTIQUE, UNIVERSITY, FUEL_STATIONS, STREET_NAMES_X, STREET_NAMES_Z, MAX_BUSINESS_LEVEL,
  STREET_LAMP_POOL,
} from './data.js';
import { mulberry32 } from './economy.js';
import * as Interiors from './interiors.js';
import * as Props from './props.js';
import { PUBLIC_PLACES, DISTRICT } from './publicPlaces.js';
import {
  makeAsphaltPBR,
  makeFlagstonePBR,
  makeGrassPBR,
  makeStormDrainTexture,
  makeFacadePBR,
  makeBarkPBR,
  makeFoliagePBR,
  getFXTextures,
} from './textures.js';

const MAP_EDGE = ROAD_LINES[ROAD_LINES.length - 1] + ROAD_HALF; // 157

const TOWER_NAMES = [
  'Meridian Tower', 'Aurora Heights', 'Apex Business Center', 'Harbor Point',
  'Metro Grand Plaza', 'Skyline One', 'Lagoon Court', 'Central Exchange',
  'Broad Street Tower', 'Market Square', 'Tech Avenue Tower', 'Palm Residences',
  'The Metro Residences', 'Unity Tower', 'Crescent Plaza', 'First Avenue Court',
];
export const CURB_Y = 0.1;

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------
export function makeTextTexture(lines, { width = 512, height = 128, bg = '#111827', fg = '#ffffff', font = 'bold 44px system-ui, sans-serif', border = null } = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  if (border) {
    g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(5, 5, width - 10, height - 10);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((line, i) => {
    const isFirst = i === 0;
    g.font = isFirst ? font : font.replace(/\d+px/, (m) => `${Math.round(parseInt(m, 10) * 0.62)}px`);
    const y = height * ((i + 1) / (arr.length + 1));
    g.fillText(line, width / 2, y, width - 24);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeWindowPair(seed, base, lit) {
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);

  const ec = document.createElement('canvas');
  ec.width = 128; ec.height = 128;
  const eg = ec.getContext('2d');
  eg.fillStyle = '#000000';
  eg.fillRect(0, 0, 128, 128);

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const roll = rand();
      g.fillStyle = roll < 0.25 ? lit : '#1e293b';
      g.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(x * 32 + 6, y * 32 + 7, 20, 4);
      if (roll < 0.58) {
        eg.fillStyle = lit;
        eg.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
      }
    }
  }
  const setup = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    return t;
  };
  return { map: setup(c), emissive: setup(ec) };
}

function makeZebraTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(229, 231, 235, 0.84)';
  for (let i = 0; i < 4; i++) {
    g.fillRect(i * 32 + 6, 4, 18, 120);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function cloneRepeat(tex, rx, ry) {
  const c = tex.clone();
  c.needsUpdate = true;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  return c;
}

// ---------------------------------------------------------------------------
// City
// ---------------------------------------------------------------------------
export class City {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.colliders = [];           // static AABBs {minX,maxX,minZ,maxZ}
    this.dynamicColliders = {};    // keyed (lots) -> array of AABBs
    this.lots = {};                // bizId -> { group, interact }
    this.stationMarkers = [];

    const asphalt = makeAsphaltPBR(101);
    const cobble = makeFlagstonePBR(202);
    const grass = makeGrassPBR(303);
    const bark = makeBarkPBR(404);
    const leafDark = makeFoliagePBR(505, '#254d1f');
    const leafMid = makeFoliagePBR(606, '#336528');

    const roadZMap = cloneRepeat(asphalt.map, 2, 46);
    const roadZNorm = cloneRepeat(asphalt.normalMap, 2, 46);
    const roadZRough = cloneRepeat(asphalt.roughnessMap, 2, 46);

    const roadXMap = cloneRepeat(asphalt.map, 46, 2);
    const roadXNorm = cloneRepeat(asphalt.normalMap, 46, 2);
    const roadXRough = cloneRepeat(asphalt.roughnessMap, 46, 2);

    const padMap = cloneRepeat(asphalt.map, 4, 3);
    const padNorm = cloneRepeat(asphalt.normalMap, 4, 3);

    const swMap = cloneRepeat(cobble.map, 11, 11);
    const swNorm = cloneRepeat(cobble.normalMap, 11, 11);
    const swRough = cloneRepeat(cobble.roughnessMap, 11, 11);

    const plazaMap = cloneRepeat(cobble.map, 6, 6);
    const plazaNorm = cloneRepeat(cobble.normalMap, 6, 6);

    const grassWorldMap = cloneRepeat(grass.map, 95, 95);
    const grassWorldNorm = cloneRepeat(grass.normalMap, 95, 95);
    const grassBlockMap = cloneRepeat(grass.map, 8, 8);
    const grassBlockNorm = cloneRepeat(grass.normalMap, 8, 8);

    this.mats = {
      road: new THREE.MeshStandardMaterial({
        map: padMap, normalMap: padNorm, roughness: 0.84, metalness: 0.08,
      }),
      roadZ: new THREE.MeshStandardMaterial({
        map: roadZMap, normalMap: roadZNorm, roughnessMap: roadZRough,
        normalScale: new THREE.Vector2(0.85, 0.85), roughness: 0.92, metalness: 0.08,
      }),
      roadX: new THREE.MeshStandardMaterial({
        map: roadXMap, normalMap: roadXNorm, roughnessMap: roadXRough,
        normalScale: new THREE.Vector2(0.85, 0.85), roughness: 0.92, metalness: 0.08,
      }),
      line: new THREE.MeshBasicMaterial({ color: 0xeab308 }),
      white: new THREE.MeshBasicMaterial({ color: 0xe5e7eb }),
      sidewalk: new THREE.MeshStandardMaterial({
        map: swMap, normalMap: swNorm, roughnessMap: swRough,
        normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.82, metalness: 0.06,
      }),
      grass: new THREE.MeshStandardMaterial({
        map: grassWorldMap, normalMap: grassWorldNorm,
        normalScale: new THREE.Vector2(0.65, 0.65), roughness: 0.94, metalness: 0.02,
      }),
      grassBlock: new THREE.MeshStandardMaterial({
        map: grassBlockMap, normalMap: grassBlockNorm,
        normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.92, metalness: 0.02,
      }),
      plaza: new THREE.MeshStandardMaterial({
        map: plazaMap, normalMap: plazaNorm, color: 0xb8b2a8,
        normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.76, metalness: 0.06,
      }),
      dirt: new THREE.MeshStandardMaterial({ color: 0x6b4f31, roughness: 0.95 }),
      trunk: new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, roughness: 0.92 }),
      leaf: new THREE.MeshStandardMaterial({ map: leafDark.map, normalMap: leafDark.normalMap, roughness: 0.84 }),
      leaf2: new THREE.MeshStandardMaterial({ map: leafMid.map, normalMap: leafMid.normalMap, roughness: 0.82 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.62, roughness: 0.08, metalness: 0.15, clearcoat: 1.0, envMapIntensity: 1.6,
      }),
      metal: new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.32, metalness: 0.78 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.44, metalness: 0.68 }),
      roofDark: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.82, metalness: 0.15 }),
      water: new THREE.MeshPhysicalMaterial({
        color: 0x0284c7, roughness: 0.08, metalness: 0.1, clearcoat: 1.0, transparent: true, opacity: 0.88,
      }),
      fence: new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.7 }),
      hill: new THREE.MeshStandardMaterial({ color: 0x2e4c24, roughness: 0.95, flatShading: true }),
    };

    // 6 realistic architectural facade PBR sets (brick masonry, limestone, concrete, glass curtain, terracotta)
    this.windowPairs = [
      makeFacadePBR(11, { wallStyle: 'brick',     wallHex: '#8b4332', mortarHex: '#382a25', litHex: '#fde68a' }),
      makeFacadePBR(22, { wallStyle: 'limestone', wallHex: '#a89f91', mortarHex: '#44403c', litHex: '#fef3c7' }),
      makeFacadePBR(33, { wallStyle: 'curtain',   wallHex: '#1e3a5f', mortarHex: '#0f172a', litHex: '#bae6fd' }),
      makeFacadePBR(44, { wallStyle: 'brick',     wallHex: '#6f4534', mortarHex: '#29201c', litHex: '#fed7aa' }),
      makeFacadePBR(55, { wallStyle: 'curtain',   wallHex: '#0f172a', mortarHex: '#090d16', litHex: '#93c5fd' }),
      makeFacadePBR(66, { wallStyle: 'concrete',  wallHex: '#64748b', mortarHex: '#334155', litHex: '#fde68a' }),
    ];
    this.windowTex = this.windowPairs.map((p) => p.map);
    this.windowMats = [];          // skyline + office window materials (emissive at night)
    this.lotWindowMats = {};       // bizId -> window material (cleaned on lot rebuild)
    this.fuelGlowMats = [];        // fuel canopy neon strips + under-canopy glow
    this.streetLamps = [];         // 25 intersection lamps { x, y, z }
    this.lampLights = [];          // pooled <=8 real PointLights
    this.lampFlareMat = null;      // additive warm glow flare on streetlamp bulbs
    this._lastLampFocus = { x: 1e9, z: 1e9, factor: -1 };
    this._nightFactor = 0;
    this.interiorZones = [];       // [{ minX, maxX, minZ, maxZ, ceilingY }] for enterable campus buildings
    this.universitySpots = [];     // interactive campus markers (Registrar, Amphitheatre, Library, Science Lab, Quad)
    this.enterables = [];          // every walk-in building: towers, shops, stations & startup lots
    this.walkSurfaces = [];        // every walkable interior floor slab (multi-storey support)
    this.upperColliders = [];      // colliders that only exist above street level (roof parapets)
    this.indoorSpots = [];         // reception desks / counters inside buildings
    this.interiorFurniture = {};   // building id -> static furniture colliders (single-storey interiors)
    this._activeFloor = null;      // { id, level, group, colliders } lazily dressed floor
    this._pm = null;               // shared interior prop materials
    this._towerCount = 0;          // stable unique tower names
    this.doors = [];               // interactive swing doors on every walk-in building
    this.serviceSpots = [];        // hotel check-in, hospital reception, gym desk…
    this.propSpots = [];           // static interactive furniture (shops, halls, parks)
    this._activePropSpots = [];    // interactive furniture on the current tower floor
    this.districtSpots = [];       // public-place entrance markers
    this.palms = [];
    this.lectureBoard = null;      // live 3D smartboard canvas in the Main Lecture Amphitheatre
    this._lastBoardKey = '';
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.trunkGeo = new THREE.CylinderGeometry(0.14, 0.23, 2.5, 8);
    this.boughGeo = new THREE.CylinderGeometry(0.06, 0.1, 1.1, 6);
    this.foliageGeo = new THREE.DodecahedronGeometry(1.15, 1);
    this.rand = mulberry32(42);

    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildUniversity();
    this._buildDistrict();
    this._buildStreetLamps();
    this._buildSidewalkGraph();
    this._buildOutskirts();
  }

  // ----- helpers -----------------------------------------------------------
  box(parent, x, y, z, w, h, d, mat, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(this.boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  addCollider(minX, maxX, minZ, maxZ, list = this.colliders) {
    list.push({ minX, maxX, minZ, maxZ });
  }

  // world-space AABB for a local rect inside a feature frame (bx,bz,face)
  frameCollider(frame, lx, lz, w, d, list) {
    const cx = frame.x + frame.face * lx;
    const cz = frame.z + frame.face * lz;
    this.addCollider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, list);
  }

  toWorld(frame, lx, lz) {
    return { x: frame.x + frame.face * lx, z: frame.z + frame.face * lz };
  }

  frameGroup(frame) {
    const g = new THREE.Group();
    g.position.set(frame.x, CURB_Y, frame.z);
    g.rotation.y = frame.face === 1 ? 0 : Math.PI;
    this.root.add(g);
    return g;
  }

  // =========================================================================
  // Walk-in buildings & multi-storey interiors
  // =========================================================================
  /** World-space AABB of a local rect inside a (90°-rotated) building frame. */
  _worldAabb(building, lx, lz, w, d) {
    const cos = Math.cos(building.yaw || 0);
    const sin = Math.sin(building.yaw || 0);
    const cx = building.x + lx * cos + lz * sin;
    const cz = building.z - lx * sin + lz * cos;
    const quarter = Math.abs(Math.round((building.yaw || 0) / (Math.PI / 2))) % 2 === 1;
    const ww = quarter ? d : w;
    const dd = quarter ? w : d;
    return { minX: cx - ww / 2, maxX: cx + ww / 2, minZ: cz - dd / 2, maxZ: cz + dd / 2 };
  }

  _addLocalCollider(building, lx, lz, w, d, opts = {}, list = this.colliders) {
    const r = this._worldAabb(building, lx, lz, w, d);
    const c = { ...r, ...opts };
    list.push(c);
    return c;
  }

  // =========================================================================
  // Live TV & cinema screens (canvas textures that actually show programmes)
  // =========================================================================
  _tvSetup() {
    if (this._tv) return this._tv;
    const make = (w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
      return { canvas, ctx, texture, mat };
    };
    this._tv = {
      tv: make(320, 180),
      cinema: make(512, 216),
      off: new THREE.MeshBasicMaterial({ color: 0x0a1018 }),
      active: new Set(),
      acc: 0,
      channel: 0,
      channelT: 0,
    };
    this._drawScreen(this._tv.tv, 'news', 0);
    this._drawScreen(this._tv.cinema, 'movie', 0);
    return this._tv;
  }

  /** Turn a registered TV / cinema screen mesh on (showing a channel) or off. */
  setTVOn(mesh, on) {
    if (!mesh) return;
    const tv = this._tvSetup();
    if (on) {
      mesh.material = mesh.userData.cinema ? tv.cinema.mat : tv.tv.mat;
      tv.active.add(mesh);
      tv.acc = 99; // repaint on the next frame
    } else {
      mesh.material = tv.off;
      tv.active.delete(mesh);
    }
  }

  isTVOn(mesh) {
    return !!this._tv && this._tv.active.has(mesh);
  }

  /** Label of the channel currently airing (visible in the HUD). */
  channelName() {
    const tv = this._tv;
    if (!tv || !tv.active.size) return '';
    const names = ['Metro News', 'Metro Sports', 'Benny & the Metro Crew', 'The Long Road'];
    return names[tv.channel % names.length];
  }

  /** Count of screens currently switched on. */
  tvCount() {
    return this._tv ? this._tv.active.size : 0;
  }

  _drawScreen(target, mode, t) {
    const { ctx, canvas } = target;
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    if (mode === 'movie') {
      // widescreen film: drifting desert horizon, sun and a hero silhouette
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0b1026');
      sky.addColorStop(0.55, '#7c2d12');
      sky.addColorStop(1, '#f59e0b');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const sun = h * 0.62 + Math.sin(t * 0.2) * 4;
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(w * 0.68, sun, h * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      // dunes
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        ctx.lineTo(x, h * 0.8 - Math.sin(x * 0.02 + t * 0.4) * h * 0.05);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      // lone rider silhouette
      const rx = w * 0.35 + Math.sin(t * 0.35) * 10;
      ctx.fillStyle = '#0b1026';
      ctx.fillRect(rx - 8, h * 0.6, 16, h * 0.12);
      ctx.beginPath();
      ctx.arc(rx, h * 0.58, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(0, 0, w, h * 0.09);
      ctx.fillRect(0, h * 0.91, w, h * 0.09);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('THE LONG ROAD', w * 0.06, h * 0.97);
      ctx.restore();
      return;
    }
    if (mode === 'sports') {
      ctx.fillStyle = '#166534';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.24, 0, Math.PI * 2); ctx.stroke();
      // moving ball
      const bx = w / 2 + Math.cos(t * 1.3) * w * 0.3;
      const by = h / 2 + Math.sin(t * 1.7) * h * 0.28;
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
      // players
      for (let i = 0; i < 6; i++) {
        const px = w * 0.16 + i * w * 0.13 + Math.sin(t * 2 + i) * 6;
        const py = h * 0.55 + Math.cos(t * 1.6 + i * 1.3) * h * 0.16;
        ctx.fillStyle = i % 2 ? '#dc2626' : '#1d4ed8';
        ctx.fillRect(px - 2, py - 8, 4, 12);
      }
      ctx.fillStyle = 'rgba(15,23,42,0.88)';
      ctx.fillRect(0, 0, w, h * 0.14);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('METRO SPORTS  ·  HARBOR 2 - 1 LAGOON', w * 0.05, h * 0.1);
      ctx.restore();
      return;
    }
    if (mode === 'cartoon') {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(w * 0.15, h * 0.18, h * 0.1, 0, Math.PI * 2);
      ctx.fill();
      // bouncing character
      const hop = Math.abs(Math.sin(t * 3.2)) * h * 0.22;
      const cx = w * 0.35 + Math.sin(t * 0.8) * w * 0.1;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, h * 0.6 - hop, h * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 3, h * 0.58 - hop, 2, 2);
      ctx.fillRect(cx + 2, h * 0.58 - hop, 2, 2);
      ctx.fillRect(cx - 5, h * 0.63 - hop, 10, 2);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('BENNY & THE METRO CREW', w * 0.05, h * 0.95);
      ctx.restore();
      return;
    }
    // news studio
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1e3a');
    bg.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(0, h * 0.16, w, 3);
    // desk
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(w * 0.18, h * 0.72, w * 0.64, h * 0.28);
    // anchor
    const nod = Math.sin(t * 1.4) * 2;
    ctx.fillStyle = '#f5d0a9';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.44 + nod, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(w * 0.45, h * 0.53 + nod, w * 0.1, h * 0.14);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(w * 0.47, h * 0.55 + nod, w * 0.06, h * 0.008);
    // headline + ticker
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('METRO NEWS', w * 0.05, h * 0.12);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px system-ui, sans-serif';
    const ticker = 'SOUTH WATERFRONT OPENS  ·  METRO 2 - 1 LAGOON  ·  NEW EXOTICS AT METRO MOTORS  ·  GRAND MERIDIAN HOTEL NOW TAKING BOOKINGS  ·  ';
    const off = (t * 42) % (w * 0.6);
    ctx.fillText(ticker, w * 0.02 - off, h * 0.95);
    ctx.fillText(ticker, w * 0.02 - off + w * 0.6, h * 0.95);
    ctx.restore();
  }

  _propMaterials() {
    if (this._pm) return this._pm;
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.12, ...extra });
    this._pm = {
      fabric: std(0x334155), fabricLight: std(0x94a3b8), blue: std(0x1d4ed8), red: std(0x991b1b),
      wood: std(0x8b5a2b, { roughness: 0.72 }), woodDark: std(0x4a2c14, { roughness: 0.7 }),
      marble: std(0xe2e8f0, { roughness: 0.24, metalness: 0.08 }),
      white: std(0xf8fafc, { roughness: 0.5 }), cream: std(0xfef3c7, { roughness: 0.72 }),
      black: std(0x0f172a, { roughness: 0.35, metalness: 0.4 }),
      metal: this.mats.metal, dark: this.mats.darkMetal,
      gold: std(0xfbbf24, { metalness: 0.85, roughness: 0.22 }),
      green: std(0x15803d, { roughness: 0.8 }), leaf: std(0x22c55e, { roughness: 0.8 }),
      felt: std(0x047857, { roughness: 0.85 }), terracotta: std(0xb45309, { roughness: 0.8 }),
      screen: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
      glow: new THREE.MeshBasicMaterial({ color: 0xfef3c7 }),
      led: new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
      warm: new THREE.MeshBasicMaterial({ color: 0xfdba74 }),
      glass: this.mats.glass,
      carpet: std(0x6b7280, { roughness: 0.95 }),
      plaster: std(0xe7e2d9, { roughness: 0.92, metalness: 0.02 }),
      plasterWarm: std(0xded3c4, { roughness: 0.93, metalness: 0.02 }),
      skirting: std(0x3f3f46, { roughness: 0.6, metalness: 0.1 }),
      windowGlass: new THREE.MeshStandardMaterial({
        color: 0xa8cbe0, emissive: 0x4f7fa3, emissiveIntensity: 0.42,
        roughness: 0.12, metalness: 0.18, transparent: true, opacity: 0.92,
      }),
      frame: std(0x27272a, { roughness: 0.45, metalness: 0.4 }),
      ceiling: std(0xf4f4f2, { roughness: 0.95 }),
    };
    return this._pm;
  }

  /**
   * Real interior wall lining for one room: painted plaster walls, skirting
   * boards, and proper framed windows instead of the exterior facade texture
   * showing through from inside.
   */
  _interiorWalls(group, { w, d, h, sill = 0.95, head = 2.45, doorW = 0, doorH = 3.5, mat = null, warm = false }) {
    const m = this._propMaterials();
    const wall = mat || (warm ? m.plasterWarm : m.plaster);
    const t = 0.09;
    const RW = w;
    const RD = d;
    const mid = (sill + head) / 2;
    const bandH = head - sill;
    const addWindow = (cx, cz, len, vertical) => {
      const bw = vertical ? t : len;
      const bd = vertical ? len : t;
      // glass + sill + head + mullions
      this.box(group, cx, mid, cz, vertical ? Math.max(0.03, t * 0.55) : len, bandH, vertical ? len : Math.max(0.03, t * 0.55), m.windowGlass, { cast: false, receive: false });
      this.box(group, cx, sill - 0.06, cz, vertical ? 0.24 : len + 0.1, 0.12, vertical ? len + 0.1 : 0.24, m.frame, { cast: false });
      const posts = Math.max(1, Math.round(len / 2.1));
      for (let i = 0; i <= posts; i++) {
        const f = -len / 2 + (len / posts) * i;
        this.box(group, vertical ? cx : cx + f, mid, vertical ? cz + f : cz, vertical ? 0.14 : 0.09, bandH + 0.1, vertical ? 0.09 : 0.14, m.frame, { cast: false });
      }
      this.box(group, cx, head + 0.05, cz, vertical ? 0.2 : len + 0.1, 0.1, vertical ? len + 0.1 : 0.2, m.frame, { cast: false });
      // plaster above & below the window band
      this.box(group, cx, sill / 2, cz, bw, sill, bd, wall, { cast: false });
      this.box(group, cx, (h + head) / 2, cz, bw, Math.max(0.12, h - head), bd, wall, { cast: false });
    };
    const addWall = (cx, cz, len, vertical, doorGap = false) => {
      if (!doorGap) {
        this.box(group, cx, h / 2, cz, vertical ? t : len, h, vertical ? len : t, wall, { cast: false });
        this.box(group, cx, 0.07, cz, vertical ? t + 0.04 : len + 0.02, 0.14, vertical ? len + 0.02 : t + 0.04, m.skirting, { cast: false });
        addWindow(cx, cz, len, vertical);
        return;
      }
      // front wall with a doorway: two segments either side of the opening
      const seg = Math.max(0.2, (len - doorW) / 2);
      for (const sgn of [-1, 1]) {
        const off = sgn * (doorW / 2 + seg / 2);
        this.box(group, cx + off, h / 2, cz, vertical ? t : seg, h, vertical ? seg : t, wall, { cast: false });
        this.box(group, cx + off, 0.07, cz, vertical ? t + 0.04 : seg, 0.14, vertical ? seg : t + 0.04, m.skirting, { cast: false });
        addWindow(cx + off, cz, seg, vertical);
      }
      // lintel over the doorway
      this.box(group, cx, doorH + (h - doorH) / 2, cz, vertical ? t : doorW + 0.2, h - doorH, vertical ? doorW + 0.2 : t, wall, { cast: false });
      this.box(group, cx, doorH + 0.06, cz, vertical ? 0.2 : doorW + 0.1, 0.12, vertical ? doorW + 0.1 : 0.2, m.frame, { cast: false });
    };
    addWall(0, -RD / 2 + t / 2, RW - t * 2, false);
    addWall(0, RD / 2 - t / 2, RW - t * 2, false, doorW > 0);
    addWall(-RW / 2 + t / 2, 0, RD - t * 2, true);
    addWall(RW / 2 - t / 2, 0, RD - t * 2, true);
    // wall/ceiling trim line
    this.box(group, 0, h - 0.07, 0, RW, 0.14, RD, m.ceiling, { cast: false, receive: false });
  }

  _cyl(parent, x, y, z, r, h, mat, seg = 10) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  _chairAt(g, m, x, z, rot) {
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.rotation.y = rot;
    this.box(c, 0, 0.44, 0, 0.52, 0.08, 0.52, m.fabric);
    this.box(c, 0, 0.72, -0.22, 0.52, 0.52, 0.08, m.fabricLight);
    this.box(c, 0, 0.48, 0, 0.08, 0.5, 0.08, m.dark);
    g.add(c);
  }

  /** Build one 3D interior prop (local space, floor at y = 0). */
  _addProp(parent, prop) {
    const m = this._propMaterials();
    const g = new THREE.Group();
    g.position.set(prop.x, 0, prop.z);
    g.rotation.y = prop.rot || 0;
    parent.add(g);
    switch (prop.type) {
      case 'reception':
        this.box(g, 0, 0.55, 0, 4.2, 1.1, 0.9, m.wood);
        this.box(g, 0, 1.17, 0, 4.4, 0.14, 1.06, m.marble);
        this.box(g, -1.3, 1.42, -0.12, 0.6, 0.4, 0.06, m.screen, { cast: false });
        this.box(g, -1.3, 1.22, -0.18, 0.16, 0.26, 0.16, m.black);
        this.box(g, 1.1, 1.3, -0.05, 0.7, 0.09, 0.32, m.gold);
        this.box(g, 2.6, 0.55, 0, 0.9, 0.9, 0.9, m.woodDark);
        this._chairAt(g, m, 0, 1.1, Math.PI);
        break;
      case 'sofa':
        this.box(g, 0, 0.24, 0, 2.6, 0.42, 0.95, m.blue);
        this.box(g, 0, 0.68, -0.37, 2.6, 0.52, 0.2, m.blue);
        this.box(g, -1.24, 0.58, 0, 0.14, 0.5, 0.95, m.blue);
        this.box(g, 1.24, 0.58, 0, 0.14, 0.5, 0.95, m.blue);
        for (const dx of [-0.62, 0.62]) this.box(g, dx, 0.5, 0.02, 1.14, 0.14, 0.82, m.fabricLight);
        break;
      case 'armchair':
        this.box(g, 0, 0.26, 0, 1.1, 0.44, 1.05, m.red);
        this.box(g, 0, 0.72, -0.42, 1.1, 0.54, 0.2, m.red);
        this.box(g, -0.5, 0.6, 0, 0.12, 0.44, 1.05, m.red);
        this.box(g, 0.5, 0.6, 0, 0.12, 0.44, 1.05, m.red);
        break;
      case 'desk':
        this.box(g, 0, 0.75, 0, 1.9, 0.09, 0.9, m.wood);
        for (const dx of [-0.85, 0.85]) this.box(g, dx, 0.37, 0, 0.1, 0.74, 0.8, m.dark);
        this.box(g, 0, 1.06, -0.24, 0.62, 0.4, 0.05, m.screen, { cast: false });
        this.box(g, 0, 0.88, -0.2, 0.18, 0.26, 0.16, m.black);
        this.box(g, 0, 0.82, 0.18, 0.46, 0.03, 0.16, m.white);
        this._chairAt(g, m, 0, 0.90, Math.PI);
        break;
      case 'deskpair':
        for (const dx of [-1.0, 1.0]) {
          this.box(g, dx, 0.75, 0, 1.86, 0.09, 0.9, m.wood);
          this.box(g, dx, 1.06, -0.24, 0.58, 0.38, 0.05, m.screen, { cast: false });
          this.box(g, dx, 0.88, -0.2, 0.16, 0.24, 0.16, m.black);
          this._chairAt(g, m, dx, 0.90, Math.PI);
        }
        break;
      case 'chair':
        this._chairAt(g, m, 0, 0, 0);
        break;
      case 'meetingtable':
        this.box(g, 0, 0.74, 0, 4.4, 0.12, 1.7, m.woodDark);
        this.box(g, 0, 0.79, 0, 4.0, 0.03, 1.34, m.felt);
        for (const dx of [-1.6, 1.6]) this.box(g, dx, 0.37, 0, 0.4, 0.74, 1.2, m.dark);
        for (const dx of [-1.5, -0.5, 0.5, 1.5]) {
          this._chairAt(g, m, dx, -1.35, 0);
          this._chairAt(g, m, dx, 1.35, Math.PI);
        }
        break;
      case 'tvwall': {
        this.box(g, 0, 1.35, 0, 3.4, 1.9, 0.14, m.black);
        const tv = this.box(g, 0, 1.4, 0.09, 3.14, 1.62, 0.04, this._tvSetup().off, { cast: false });
        tv.userData.screen = true;
        g.userData.screen = tv;
        this.box(g, 0, 0.36, 0.02, 2.4, 0.12, 0.3, m.dark);
        break;
      }
      case 'bookshelf':
        this.box(g, 0, 1.15, 0, 2.4, 2.3, 0.5, m.woodDark);
        for (let i = 0; i < 4; i++) {
          this.box(g, 0, 0.3 + i * 0.58, 0.2, 2.2, 0.06, 0.16, m.wood);
          for (let b = 0; b < 7; b++) {
            const c = [m.red, m.blue, m.green, m.cream, m.gold][(i + b) % 5];
            this.box(g, -0.92 + b * 0.3, 0.42 + i * 0.58, 0.22, 0.2, 0.24, 0.14, c);
          }
        }
        break;
      case 'planter':
        this._cyl(g, 0, 0.24, 0, 0.42, 0.48, m.terracotta, 12);
        this._cyl(g, 0, 0.5, 0, 0.36, 0.06, m.woodDark, 12);
        for (let i = 0; i < 6; i++) {
          const leaf = this.box(g, Math.cos(i * 1.05) * 0.24, 0.85 + (i % 3) * 0.16, Math.sin(i * 1.05) * 0.24, 0.14, 0.66, 0.14, m.leaf);
          leaf.rotation.z = Math.cos(i * 1.05) * 0.5;
          leaf.rotation.x = Math.sin(i * 1.05) * 0.5;
        }
        break;
      case 'bar':
        this.box(g, 0, 0.58, 0, 2.8, 1.16, 0.8, m.woodDark);
        this.box(g, 0, 1.2, 0, 3.0, 0.12, 0.98, m.marble);
        this.box(g, 0, 1.55, -0.36, 2.8, 0.9, 0.08, m.wood);
        for (let i = 0; i < 6; i++) this.box(g, -0.9 + i * 0.36, 1.62, -0.28, 0.12, 0.34, 0.12, [m.green, m.gold, m.red][i % 3]);
        for (const dx of [-0.9, 0, 0.9]) { this._cyl(g, dx, 0.36, 0.95, 0.2, 0.72, m.dark, 10); this._cyl(g, dx, 0.74, 0.95, 0.3, 0.08, m.fabric, 12); }
        break;
      case 'kitchen':
        this.box(g, 0, 0.46, 0, 3.4, 0.92, 1.1, m.white);
        this.box(g, 0, 0.96, 0, 3.6, 0.1, 1.26, m.marble);
        this.box(g, -0.7, 1.0, 0, 0.7, 0.06, 0.5, m.dark, { cast: false });
        this._cyl(g, -0.7, 1.2, -0.3, 0.05, 0.4, m.metal, 8);
        for (let i = 0; i < 3; i++) this._cyl(g, 0.9 + i * 0.28, 1.18, 0.1, 0.11, 0.3, m.metal, 8);
        break;
      case 'bed':
        this.box(g, 0, 0.28, 0, 2.0, 0.3, 2.3, m.woodDark);
        this.box(g, 0, 0.5, 0, 1.94, 0.26, 2.2, m.white);
        this.box(g, 0, 0.66, 0.35, 1.9, 0.16, 1.4, m.red);
        this.box(g, -0.46, 0.7, -0.86, 0.78, 0.18, 0.44, m.cream);
        this.box(g, 0.46, 0.7, -0.86, 0.78, 0.18, 0.44, m.cream);
        this.box(g, 0, 0.85, -1.16, 2.06, 1.1, 0.16, m.woodDark);
        this.box(g, -1.2, 0.4, 0, 0.4, 0.5, 0.4, m.wood);
        break;
      case 'dinetable':
        this.box(g, 0, 0.74, 0, 2.2, 0.1, 1.2, m.wood);
        for (const dx of [-0.9, 0.9]) this.box(g, dx, 0.37, 0, 0.12, 0.74, 0.9, m.woodDark);
        for (const dx of [-0.55, 0.55]) { this._chairAt(g, m, dx, -0.95, 0); this._chairAt(g, m, dx, 0.95, Math.PI); }
        break;
      case 'pooltable':
        this.box(g, 0, 0.72, 0, 3.0, 0.16, 1.7, m.woodDark);
        this.box(g, 0, 0.81, 0, 2.7, 0.04, 1.4, m.felt);
        for (const dx of [-1.3, 1.3]) for (const dz of [-0.65, 0.65]) this.box(g, dx, 0.36, dz, 0.16, 0.72, 0.16, m.woodDark);
        for (let i = 0; i < 6; i++) this.box(g, -0.6 + (i % 3) * 0.28, 0.87, -0.2 + Math.floor(i / 3) * 0.3, 0.1, 0.1, 0.1, i < 3 ? m.gold : m.red);
        break;
      case 'serverrack':
        this.box(g, 0, 1.1, 0, 1.1, 2.2, 1.1, m.black);
        for (let i = 0; i < 8; i++) this.box(g, 0, 0.3 + i * 0.24, 0.57, 0.9, 0.05, 0.02, i % 3 ? m.led : m.screen, { cast: false });
        this.box(g, 0, 2.23, 0, 1.0, 0.06, 1.0, m.dark);
        break;
      case 'labbench':
        this.box(g, 0, 0.5, 0, 3.2, 1.0, 1.1, m.white);
        this.box(g, 0, 1.03, 0, 3.3, 0.08, 1.2, m.marble);
        for (let i = 0; i < 3; i++) this._cyl(g, -1.1 + i * 0.55, 1.2, -0.2, 0.1, 0.3, i === 1 ? m.led : m.glass, 10);
        this.box(g, 1.0, 1.3, -0.25, 0.42, 0.5, 0.3, m.black);
        break;
      case 'medbed':
        this.box(g, 0, 0.42, 0, 1.2, 0.18, 2.3, m.metal);
        this.box(g, 0, 0.58, 0, 1.14, 0.18, 2.2, m.white);
        this.box(g, 0, 0.7, -0.86, 1.0, 0.14, 0.4, m.cream);
        this.box(g, 0, 0.9, -1.16, 1.2, 0.9, 0.12, m.metal);
        for (const dx of [-0.62, 0.62]) for (const dz of [-1.0, 1.0]) this._cyl(g, dx, 0.18, dz, 0.06, 0.36, m.dark, 8);
        this._cyl(g, 0.86, 1.1, -0.9, 0.05, 1.8, m.metal, 8);
        this.box(g, 0.86, 1.9, -0.9, 0.26, 0.4, 0.14, m.white);
        break;
      case 'lounger':
        this.box(g, 0, 0.3, 0, 0.9, 0.16, 1.9, m.wood);
        this.box(g, 0, 0.44, 0.1, 0.84, 0.14, 1.5, m.fabricLight);
        this.box(g, 0, 0.66, -0.76, 0.84, 0.5, 0.14, m.fabricLight).rotation.x = -0.6;
        for (const dx of [-0.38, 0.38]) for (const dz of [-0.85, 0.85]) this.box(g, dx, 0.14, dz, 0.08, 0.28, 0.08, m.dark);
        break;
      case 'treadmill':
        this.box(g, 0, 0.12, 0, 1.2, 0.24, 2.2, m.black);
        this.box(g, 0, 0.26, 0.1, 1.0, 0.06, 1.7, m.dark);
        this.box(g, 0, 0.9, -0.95, 1.15, 0.08, 0.5, m.black);
        this.box(g, 0, 1.35, -1.02, 1.15, 0.9, 0.12, m.black);
        this.box(g, 0, 1.5, -0.95, 0.7, 0.34, 0.05, m.screen, { cast: false });
        for (const dx of [-0.5, 0.5]) this.box(g, dx, 1.1, -0.98, 0.08, 1.9, 0.08, m.metal, { cast: false });
        break;
      case 'gymbench':
        this.box(g, 0, 0.42, 0, 0.5, 0.16, 1.9, m.dark);
        this.box(g, 0, 0.5, 0.1, 0.46, 0.06, 1.6, m.fabric);
        for (const dz of [-0.75, 0.75]) this.box(g, 0, 0.2, dz, 0.42, 0.36, 0.14, m.metal);
        for (const dx of [-0.62, 0.62]) {
          this.box(g, dx, 0.95, -0.55, 0.1, 1.9, 0.1, m.metal);
          this.box(g, dx, 0.24, -0.55, 0.34, 0.1, 0.9, m.metal);
        }
        this.box(g, 0, 1.28, -0.55, 2.0, 0.08, 0.08, m.metal);
        for (const dx of [-0.82, 0.82]) this.box(g, dx, 1.28, -0.55, 0.26, 0.52, 0.26, m.black);
        break;
      case 'dumbbellrack':
        this.box(g, 0, 0.07, 0, 2.2, 0.14, 0.66, m.black);
        this.box(g, 0, 0.9, -0.3, 2.2, 1.7, 0.12, m.dark);
        for (let r = 0; r < 3; r++) {
          this.box(g, 0, 0.55 + r * 0.45, 0, 2.2, 0.08, 0.6, m.metal);
          for (let i = 0; i < 6; i++) this.box(g, -0.9 + i * 0.36, 0.66 + r * 0.45, 0.05, 0.16, 0.14, 0.16, m.black);
        }
        break;
      case 'cinema_screen': {
        this.box(g, 0, 2.4, 0, 7.8, 4.0, 0.12, m.black);
        const screen = this.box(g, 0, 2.4, 0.09, 7.4, 3.7, 0.04, this._tvSetup().off, { cast: false });
        screen.userData.screen = true;
        screen.userData.cinema = true;
        g.userData.screen = screen;
        this.box(g, 0, 0.28, 0.6, 6.0, 0.56, 1.2, m.dark);
        for (let i = 0; i < 4; i++) this.box(g, 0, 0.6, 2.0 + i * 1.5, 6.4, 0.5, 0.5, m.blue);
        break;
      }
      case 'artframe':
        this.box(g, 0, 1.5, 0, 2.3, 2.7, 0.12, m.gold);
        this.box(g, 0, 1.5, 0.08, 2.05, 2.45, 0.06, [m.red, m.blue, m.green, m.cream][Math.abs(Math.round(prop.x + prop.z)) % 4], { cast: false });
        this.box(g, 0, 1.5, 0.12, 1.4, 1.7, 0.03, m.cream, { cast: false });
        break;
      case 'bench':
        this.box(g, 0, 0.45, 0, 2.4, 0.12, 0.62, m.wood);
        this.box(g, 0, 0.78, -0.28, 2.4, 0.5, 0.12, m.wood);
        for (const dx of [-1.0, 1.0]) this.box(g, dx, 0.22, 0, 0.1, 0.45, 0.55, m.dark);
        break;
      case 'counter':
        this.box(g, 0, 0.6, 0, 3.0, 1.15, 0.9, m.woodDark);
        this.box(g, 0, 1.2, 0, 3.2, 0.1, 1.06, m.marble);
        this.box(g, 0, 1.45, -0.32, 2.6, 0.4, 0.1, m.led, { cast: false });
        this.box(g, -1.0, 1.32, 0.1, 0.22, 0.24, 0.16, m.black);
        break;
      case 'piano':
        this.box(g, 0, 0.92, 0, 2.1, 0.5, 1.4, m.black);
        this.box(g, 0, 1.2, -0.1, 2.0, 0.08, 1.2, m.black).rotation.x = 0.12;
        this.box(g, 0, 1.18, 0.52, 1.9, 0.06, 0.4, m.white);
        for (const dx of [-0.85, 0.85]) this.box(g, dx, 0.45, -0.4, 0.16, 0.9, 0.16, m.black);
        this.box(g, 0, 0.45, 0.55, 0.2, 0.9, 0.2, m.black);
        break;
      case 'sculpture':
        this._cyl(g, 0, 0.5, 0, 0.5, 1.0, m.marble, 12);
        this._cyl(g, 0, 1.05, 0, 0.62, 0.12, m.gold, 12);
        {
          const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.42, 0.13, 64, 8), m.gold);
          knot.position.y = 1.7;
          knot.castShadow = true;
          g.add(knot);
        }
        break;
      default:
        this.box(g, 0, 0.4, 0, 1, 0.8, 1, m.fabric);
    }
    return g;
  }

  /** Lazily dress one floor of a multi-storey building with furniture, glazing & lights. */
  _dressFloor(building, level) {
    const fh = Interiors.FLOOR_HEIGHT;
    const m = this._propMaterials();
    const w = building.width; const d = building.depth;
    const group = new THREE.Group();
    group.position.set(building.x, building.baseY + level * fh, building.z);
    group.rotation.y = building.yaw || 0;
    this.root.add(group);

    const isRoof = level >= (building.floors || 0);
    // polished floor inlay / open-air roof decking
    this.box(group, 0, 0.03, 0, w - 1.5, 0.05, d - 1.5, isRoof ? m.wood : level === 0 ? m.marble : m.carpet, { cast: false });
    if (!isRoof) {
      // ceiling light panels + trim ring
      this.box(group, 0, fh - 0.22, 0, 4.6, 0.08, 2.4, m.glow, { cast: false, receive: false });
      this.box(group, w * 0.24, fh - 0.22, 0, 3.0, 0.08, 2.0, m.glow, { cast: false, receive: false });
      this.box(group, -w * 0.24, fh - 0.22, 0, 3.0, 0.08, 2.0, m.glow, { cast: false, receive: false });
      this.box(group, 0, fh - 0.32, 0, w - 2.2, 0.06, d - 2.2, m.dark, { cast: false });

      // Real interior walls: painted plaster, skirting, framed windows on every
      // wall (doorway gap on the street wall of the lobby) instead of showing
      // the exterior facade texture from inside.
      this._interiorWalls(group, {
        w: w - 0.7, d: d - 0.7, h: fh,
        sill: 0.95, head: Math.min(2.5, fh - 0.7),
        doorW: level === 0 ? 4.4 : 0, doorH: 3.5,
        warm: building.themeId === 'residential' || building.themeId === 'hotel',
      });
    }

    // deterministic furniture for this floor
    const floors = building.floors;
    const kindId = Interiors.kindForLevel(building.themeId, level, floors);
    const plan = Interiors.floorPlan({
      themeId: building.themeId, kindId, level, floors, width: w, depth: d, seed: building.seed,
    });
    const spots = [];
    for (const prop of plan.props) {
      const propGroup = this._addProp(group, prop);
      if (!Props.isInteractable(prop.type)) continue;
      const cos = Math.cos(building.yaw || 0); const sin = Math.sin(building.yaw || 0);
      const wx = building.x + prop.x * cos + prop.z * sin;
      const wz = building.z - prop.x * sin + prop.z * cos;
      spots.push({
        type: prop.type, x: +wx.toFixed(2), z: +wz.toFixed(2),
        y: +(building.baseY + level * fh).toFixed(2),
        rot: +((prop.rot || 0) + (building.yaw || 0)).toFixed(3),
        buildingId: building.id, level,
        screen: propGroup?.userData?.screen || null,
      });
    }

    // glowing lift door frame on the core face (so every floor has a visible elevator)
    const coreX = -w / 2 + 1.6 + Interiors.ELEVATOR_SIZE / 2;
    const coreZ = -d / 2 + 1.6 + Interiors.ELEVATOR_SIZE / 2;
    this.box(group, coreX + Interiors.ELEVATOR_SIZE / 2 + 0.03, 1.35, coreZ, 0.06, 2.5, 1.7, m.screen, { cast: false });
    this.box(group, coreX + Interiors.ELEVATOR_SIZE / 2 + 0.05, 2.75, coreZ, 0.04, 0.34, 1.1, m.led, { cast: false });

    return { group, colliders: Interiors.propColliders(Interiors.floorLayout(building, level)), layout: plan, spots };
  }

  /** Swap in the furnished floor the player is currently standing on. */
  setActiveInterior(id, level) {
    if (this._activeFloor && this._activeFloor.id === id && this._activeFloor.level === level) return this._activeFloor;
    this.clearActiveInterior();
    const building = this.enterables.find((b) => b.id === id);
    if (!building) return null;
    const dressed = this._dressFloor(building, level);
    this._activeFloor = {
      id, level, group: dressed.group, colliders: dressed.colliders,
      layout: dressed.layout, building, spots: dressed.spots,
    };
    this._activePropSpots = dressed.spots;
    return this._activeFloor;
  }

  clearActiveInterior() {
    if (!this._activeFloor) return;
    this.root.remove(this._activeFloor.group);
    this._activeFloor.group.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry !== this.boxGeo) o.geometry.dispose?.();
    });
    this._activeFloor = null;
    this._activePropSpots = [];
    if (this._tv) this._tv.active.clear();
  }

  activeInteriorColliders() {
    return this._activeFloor?.colliders || [];
  }

  /** Find the walk-in building containing a world point (and its local coords). */
  buildingAt(x, z) {
    for (const b of this.enterables) {
      const dx = x - b.x; const dz = z - b.z;
      const cos = Math.cos(b.yaw || 0); const sin = Math.sin(b.yaw || 0);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) <= b.width / 2 + 0.15 && Math.abs(lz) <= b.depth / 2 + 0.15) {
        return { building: b, lx, lz };
      }
    }
    return null;
  }

  buildingById(id) {
    return this.enterables.find((b) => b.id === id) || null;
  }

  /** Lift landing point in world space (just in front of the core). */
  elevatorLanding(building) {
    const p = Interiors.elevatorPoint(building);
    const cos = Math.cos(building.yaw || 0); const sin = Math.sin(building.yaw || 0);
    return { x: p.x + 2.5 * cos, z: p.z - 2.5 * sin };
  }

  /** Indoor ceiling above a world point at the player's current elevation. */
  ceilingAt(x, z, feetY = 0) {
    const inside = this.buildingAt(x, z);
    if (!inside) return this.ceilingY(x, z);
    const b = inside.building;
    if (b.kind !== 'tower') return b.baseY + Math.max(2.6, (b.height || 4) - 0.35);
    const level = Math.max(0, Math.min(b.floors, Math.round((feetY - b.baseY) / Interiors.FLOOR_HEIGHT)));
    if (level >= b.floors) return null;
    return b.baseY + level * Interiors.FLOOR_HEIGHT + Interiors.FLOOR_HEIGHT - 0.3;
  }

  /** Static interior floor slabs the player can stand on (towers). */
  walkSurfaceAt(x, z, feetY, stepUp) {
    let best = -Infinity;
    const limit = feetY + (stepUp ?? 0.45);
    for (const s of this.walkSurfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      if (s.y > limit + 0.001 || s.y <= best) continue;
      best = s.y;
    }
    return Number.isFinite(best) ? best : null;
  }

  /**
   * Build a walk-in, multi-storey tower: hollow facade with an open doorway,
   * one walkable slab per storey, a lift core, roof parapet & sky deck.
   */
  _buildTower({ x, z, w, d, h, mat, roofMat, yaw, seed, name, themeId, id: idOverride }) {
    const baseY = CURB_Y;
    const fh = Interiors.FLOOR_HEIGHT;
    const floors = Interiors.floorCountForHeight(h - 1.5);
    const theme = themeId || Interiors.themeForSeed(seed);
    const id = idOverride || `bld-${this.enterables.length}-${Math.round(x)}-${Math.round(z)}`;
    const building = {
      id, kind: 'tower', name: name || `${Interiors.themeFor(theme).name}`,
      x, z, width: w, depth: d, height: h, baseY, floors, floorHeight: fh,
      themeId: theme, seed, yaw, roofY: baseY + floors * fh,
    };
    this.enterables.push(building);

    const wallMat = mat;
    wallMat.side = THREE.DoubleSide;
    const g = new THREE.Group();
    g.position.set(x, baseY, z);
    g.rotation.y = yaw;
    this.root.add(g);

    const wallH = floors * fh + 1.15;
    const t = 0.55;
    const doorW = 4.4; const doorH = 3.5;

    // --- facade walls -------------------------------------------------------
    this.box(g, 0, wallH / 2, -d / 2, w, wallH, t, wallMat);
    this._addLocalCollider(building, 0, -d / 2, w, t);
    this.box(g, -w / 2, wallH / 2, 0, t, wallH, d, wallMat);
    this._addLocalCollider(building, -w / 2, 0, t, d);
    this.box(g, w / 2, wallH / 2, 0, t, wallH, d, wallMat);
    this._addLocalCollider(building, w / 2, 0, t, d);

    // south (street-facing) wall split around an open doorway
    const segW = Math.max(0.5, w / 2 - doorW / 2);
    for (const s of [-1, 1]) {
      const cx = s * (doorW / 2 + segW / 2);
      this.box(g, cx, wallH / 2, d / 2, segW, wallH, t, wallMat);
      this._addLocalCollider(building, cx, d / 2, segW, t);
    }
    // lintel above the door + stone surround
    this.box(g, 0, doorH + (wallH - doorH) / 2, d / 2, doorW + 0.3, wallH - doorH, t + 0.08, wallMat);
    this.box(g, 0, doorH + 0.12, d / 2, doorW + 0.9, 0.24, t + 0.3, this.mats.darkMetal);
    this.box(g, -(doorW / 2 + 0.2), doorH / 2, d / 2, 0.4, doorH, t + 0.24, this.mats.darkMetal);
    this.box(g, (doorW / 2 + 0.2), doorH / 2, d / 2, 0.4, doorH, t + 0.24, this.mats.darkMetal);
    // interactive glass double doors (open / close with E)
    this._addSwingDoor({
      x: x + Math.sin(yaw) * (d / 2),
      z: z + Math.cos(yaw) * (d / 2),
      y: baseY, yaw, width: doorW, height: doorH,
      label: `${name || 'Tower'} doors`, buildingId: id,
    });
    // entrance planters also stop cars from driving inside
    for (const s of [-1, 1]) {
      const px = s * (doorW / 2 + 1.4);
      this.box(g, px, 0.45, d / 2 + 1.5, 1.3, 0.9, 1.3, this.mats.plaza);
      this.box(g, px, 1.0, d / 2 + 1.5, 1.0, 0.5, 1.0, this._propMaterials().green);
      this._addLocalCollider(building, px, d / 2 + 1.5, 1.3, 1.3);
    }

    // --- storey slabs (instanced) ------------------------------------------
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.62, metalness: 0.05 });
    const slabs = new THREE.InstancedMesh(this.boxGeo, slabMat, floors + 1);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3(w - 1.15, 0.24, d - 1.15);
    for (let lv = 0; lv <= floors; lv++) {
      m4.compose(new THREE.Vector3(0, lv * fh - 0.12, 0), q, sc);
      slabs.setMatrixAt(lv, m4);
      const r = this._worldAabb(building, 0, 0, w - 1.15, d - 1.15);
      this.walkSurfaces.push({ ...r, y: baseY + lv * fh, kind: 'tower', buildingId: id });
    }
    slabs.receiveShadow = true;
    slabs.castShadow = false;
    g.add(slabs);

    // --- lift core ----------------------------------------------------------
    const coreX = -w / 2 + 1.6 + Interiors.ELEVATOR_SIZE / 2;
    const coreZ = -d / 2 + 1.6 + Interiors.ELEVATOR_SIZE / 2;
    this.box(g, coreX, wallH / 2, coreZ, Interiors.ELEVATOR_SIZE, wallH, Interiors.ELEVATOR_SIZE, this.mats.darkMetal);
    this.box(g, coreX + Interiors.ELEVATOR_SIZE / 2 + 0.02, wallH * 0.5, coreZ, 0.08, wallH * 0.86, 0.55, this.mats.metal);
    this.box(g, coreX + Interiors.ELEVATOR_SIZE / 2 + 0.06, wallH - 1.2, coreZ, 0.05, 1.6, Interiors.ELEVATOR_SIZE * 0.7, this._propMaterials().led, { cast: false });
    this._addLocalCollider(building, coreX, coreZ, Interiors.ELEVATOR_SIZE, Interiors.ELEVATOR_SIZE);

    // --- roof deck ----------------------------------------------------------
    this.box(g, 0, floors * fh - 0.1, 0, w + 0.7, 0.22, d + 0.7, roofMat);
    // parapet ring (only blocks on the roof)
    const roofOpt = { minY: baseY + floors * fh - 0.2, maxY: baseY + floors * fh + 1.4 };
    for (const [lx, lz, bw, bd] of [[0, -d / 2, w + 0.7, 0.5], [0, d / 2, w + 0.7, 0.5], [-w / 2, 0, 0.5, d + 0.7], [w / 2, 0, 0.5, d + 0.7]]) {
      this.box(g, lx, floors * fh + 0.62, lz, bw, 1.1, bd, this.mats.darkMetal);
      const r = this._worldAabb(building, lx, lz, bw, bd);
      this.upperColliders.push({ ...r, ...roofOpt });
    }
    // rooftop mechanical plant
    this.box(g, w * 0.28, floors * fh + 1.1, -d * 0.25, 2.6, 1.6, 2.0, this.mats.darkMetal);

    // --- street-level signage & canopy -------------------------------------
    this.sign(g, [name || 'METRO TOWER', `${Interiors.themeFor(theme).short.toUpperCase()} · ${floors} FLOORS`],
      0, doorH + 0.85, d / 2 + t / 2 + 0.02, Math.min(w - 4, 13), 1.7, { bg: '#0f172a', fg: '#e2e8f0', border: Interiors.themeFor(theme).accent });
    this.box(g, 0, doorH + 0.2, d / 2 + 1.5, doorW + 3.0, 0.22, 3.4, this.mats.darkMetal);

    // ground-floor lobby dressing is handled by setActiveInterior(level 0)
    return building;
  }


  // =========================================================================
  // Interactive swing doors (every walk-in building has them)
  // =========================================================================
  _addSwingDoor({
    x, z, y = CURB_Y, yaw = 0, width = 4.4, height = 3.4,
    label = 'doors', buildingId = null, leaves = 2, open = false, glass = true,
  }) {
    const door = Props.createDoorState({ x, z, y, yaw, width, height, label, buildingId, leaves, open });
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.y = yaw;
    this.root.add(root);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.36, metalness: 0.82 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.28, metalness: 0.92 });
    const leafMat = glass
      ? new THREE.MeshPhysicalMaterial({
        color: 0xbae6fd, transparent: true, opacity: 0.28, roughness: 0.06,
        metalness: 0.12, depthWrite: false, side: THREE.DoubleSide,
      })
      : new THREE.MeshStandardMaterial({ color: 0x6b4b2a, roughness: 0.7 });

    const n = leaves === 2 ? 2 : 1;
    const leafW = (width - 0.12) / n;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const side = n === 2 ? (i === 0 ? -1 : 1) : 1;
      const hingeX = n === 2 ? side * (width / 2) : -width / 2;
      const pivot = new THREE.Group();
      pivot.position.set(hingeX, 0, 0);
      root.add(pivot);
      const dir = n === 2 ? -side : 1;
      // leaf panel
      const panel = this.box(pivot, dir * (leafW / 2), height / 2, 0, leafW, height - 0.1, 0.07, leafMat, { cast: false });
      panel.castShadow = false;
      // frame + rails
      this.box(pivot, dir * (leafW / 2), height / 2, 0, leafW, 0.07, 0.12, frameMat);
      this.box(pivot, dir * (leafW / 2), height - 0.06, 0, leafW, 0.1, 0.12, frameMat);
      this.box(pivot, dir * (leafW / 2), 0.06, 0, leafW, 0.12, 0.12, frameMat);
      this.box(pivot, dir * (leafW - 0.05), height / 2, 0, 0.09, height - 0.08, 0.12, frameMat);
      this.box(pivot, dir * (leafW - 0.16), height * 0.46, 0.07, 0.05, 0.5, 0.05, brass, { cast: false });
      parts.push({ pivot, side });
    }
    door.root = root;
    door.parts = parts;
    door.glass = glass;
    this.doors.push(door);
    return door;
  }

  /** Animate every door leaf toward its target swing angle. */
  updateDoors(dt) {
    for (const d of this.doors) {
      const before = d.amount;
      Props.stepDoor(d, dt);
      if (d.amount === before || !d.parts) continue;
      const angle = Props.DOOR_SWING * d.amount;
      for (const part of d.parts) part.pivot.rotation.y = part.side === 1 ? angle : -angle;
    }
  }

  /** Closed-door colliders for the storey the player is standing on. */
  doorCollidersAt(feetY) {
    return Props.doorColliders(this.doors, feetY);
  }

  nearestDoor(x, z, y = CURB_Y, radius = 3.6) {
    let best = null; let bd = Infinity;
    for (const d of this.doors) {
      if (Math.abs((d.y || 0) - y) > 4.2) continue;
      const dist = Props.doorDistance(d, x, z);
      const reach = radius + d.width * 0.35;
      if (dist < reach && dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  // =========================================================================
  // Interactable furniture spots
  // =========================================================================
  _registerPropSpot({ buildingId = null, level = 0, type, x, z, y = CURB_Y, rot = 0, name = '', screen = null }) {
    if (!Props.isInteractable(type)) return null;
    const def = Props.interactionFor(type);
    const spot = {
      type, x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), rot: +rot.toFixed(3),
      buildingId, level, name: name || def.verb, icon: def.icon, screen,
    };
    this.propSpots.push(spot);
    return spot;
  }

  /** Register every prop of a frame-local interior and return the persisted list. */
  _registerFrameProps(building, frame, props, level = 0, groups = null) {
    const list = [];
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      const world = this.toWorld(frame, prop.x, prop.z);
      const spot = this._registerPropSpot({
        buildingId: building.id, level, type: prop.type,
        x: world.x, z: world.z, y: building.baseY + 0.1, rot: prop.rot + (frame.face === 1 ? 0 : Math.PI),
        screen: groups?.[i]?.userData?.screen || null,
      });
      if (spot) list.push(spot);
    }
    return list;
  }

  _registerWorldProps(building, props, level = 0, groups = null) {
    const cos = Math.cos(building.yaw || 0);
    const sin = Math.sin(building.yaw || 0);
    const out = [];
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      const wx = building.x + prop.x * cos + prop.z * sin;
      const wz = building.z - prop.x * sin + prop.z * cos;
      const spot = this._registerPropSpot({
        buildingId: building.id, level, type: prop.type,
        x: wx, z: wz, y: building.baseY + level * Interiors.FLOOR_HEIGHT,
        rot: (prop.rot || 0) + (building.yaw || 0),
        screen: groups?.[i]?.userData?.screen || null,
      });
      if (spot) out.push(spot);
    }
    return out;
  }

  propSpotsNear(x, z, y = CURB_Y, radius = 2.4) {
    const out = [];
    for (const s of this.propSpots) {
      if (Math.abs(s.y - y) > 1.8) continue;
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < radius * radius) out.push(s);
    }
    for (const s of this._activePropSpots) {
      if (Math.abs(s.y - y) > 1.8) continue;
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < radius * radius) out.push(s);
    }
    return out;
  }

  serviceSpotsNear(x, z, y = CURB_Y, radius = 3.6) {
    const out = [];
    for (const s of this.serviceSpots) {
      if (Math.abs((s.y || 0) - y) > 2.4) continue;
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < radius * radius) out.push(s);
    }
    return out;
  }

  _registerServiceSpot(spot) {
    const entry = { y: CURB_Y, ...spot };
    this.serviceSpots.push(entry);
    return entry;
  }

  // =========================================================================
  // South Waterfront civic district (hotel, hospital, museum, mall, gym, library)
  // =========================================================================
  _palm(x, z, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, CURB_Y, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.26 * scale, 6.4 * scale, 7), this.mats.trunk);
    trunk.position.y = 3.2 * scale;
    trunk.rotation.z = (this.rand() - 0.5) * 0.12;
    trunk.castShadow = true;
    g.add(trunk);
    const frondMat = this.mats.leaf2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.34 * scale, 3.1 * scale, 5), frondMat);
      frond.position.set(Math.cos(a) * 1.05 * scale, 6.4 * scale, Math.sin(a) * 1.05 * scale);
      frond.rotation.z = Math.cos(a) * 1.12;
      frond.rotation.x = -Math.sin(a) * 1.12;
      frond.castShadow = true;
      g.add(frond);
    }
    this.root.add(g);
    this.addCollider(x - 0.32, x + 0.32, z - 0.32, z + 0.32);
    this.palms.push({ x, z });
    return g;
  }

  _buildCivicHall(place) {
    const { id, name, width: w, depth: d, height: h, yaw, color } = place;
    const m = this._propMaterials();
    const g = new THREE.Group();
    g.position.set(place.x, CURB_Y, place.z);
    g.rotation.y = yaw;
    this.root.add(g);

    const building = {
      id, kind: 'hall', name, x: place.x, z: place.z, width: w, depth: d, height: h,
      baseY: CURB_Y, floors: 0, themeId: place.themeId, seed: Math.round(place.x * 17 + place.z * 5), yaw,
    };
    this.enterables.push(building);
    this.interiorFurniture[id] = [];

    const pair = this.windowPairs[place.type === 'museum' ? 1 : place.type === 'mall' ? 2 : 5];
    const wallMat = new THREE.MeshStandardMaterial({
      map: cloneRepeat(pair.map, 4, 3),
      normalMap: cloneRepeat(pair.normalMap, 4, 3),
      roughnessMap: cloneRepeat(pair.roughnessMap, 4, 3),
      roughness: 0.86, metalness: 0.12,
      emissive: 0xffffff,
      emissiveMap: cloneRepeat(pair.emissive, 4, 3),
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
    });
    this.windowMats.push(wallMat);
    const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.35, metalness: 0.55 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });

    const t = 0.6;
    const doorW = 7.0; const doorH = 4.4;
    const front = d / 2;

    // shell
    this.box(g, 0, 0.07, 0, w - 1.2, 0.14, d - 1.2, place.type === 'gym' ? m.carpet : m.marble, { cast: false });
    this.box(g, 0, h - 0.3, 0, w - 0.4, 0.4, d - 0.4, cream);
    this.box(g, 0, h + 0.35, 0, w + 0.8, 0.5, d + 0.8, accent);
    this.box(g, 0, h + 0.75, 0, w + 1.2, 0.22, d + 1.2, this.mats.darkMetal);
    this.box(g, 0, h / 2, -d / 2, w, h, t, wallMat);
    this.frameWorldCollider(building, 0, -d / 2, w, t);
    for (const sx of [-w / 2, w / 2]) {
      this.box(g, sx, h / 2, 0, t, h, d, wallMat);
      this.frameWorldCollider(building, sx, 0, t, d);
    }
    const segW = (w - doorW) / 2;
    for (const sgn of [-1, 1]) {
      const x = sgn * (doorW / 2 + segW / 2);
      this.box(g, x, h / 2, front, segW, h, t, wallMat);
      this.frameWorldCollider(building, x, front, segW, t);
      this.box(g, x, 2.4, front + t / 2 + 0.02, Math.max(1, segW - 2.2), 3.0, 0.12, this.mats.glass, { cast: false });
      this.box(g, x, 4.1, front + t / 2 + 0.02, Math.max(1, segW - 2.2), 0.22, t + 0.1, accent, { cast: false });
    }
    this.box(g, 0, doorH + (h - doorH) / 2, front, doorW + 0.5, h - doorH, t + 0.1, wallMat);
    this.box(g, 0, doorH + 0.2, front, doorW + 1.6, 0.3, t + 0.5, accent);
    // columned portico
    for (const sgn of [-1, 1]) {
      this.box(g, sgn * (doorW / 2 + 1.3), (h * 0.55) / 2, front + 1.9, 0.66, h * 0.55, 0.66, cream);
      this.box(g, sgn * (doorW / 2 + 1.3), h * 0.55 + 0.22, front + 1.9, 1.0, 0.4, 1.0, accent);
    }
    this.box(g, 0, h * 0.55 + 0.9, front + 1.9, doorW + 3.4, 0.4, 2.6, accent);
    this.sign(g, [name.toUpperCase(), place.blurb.split('.')[0].toUpperCase()], 0, h + 1.35, front + 0.1, Math.min(w - 4, 22), 2.0, {
      bg: '#0b1220', fg: '#f8fafc', border: color,
    });

    // standard painted walls, skirting and framed windows inside the hall
    this._interiorWalls(g, {
      w: w - 1.0, d: d - 1.0, h: h - 0.45,
      sill: 1.15, head: Math.min(h - 2.2, 5.4),
      doorW: 7.2, doorH: 4.4,
      warm: place.type === 'hotel' || place.type === 'library',
    });

    // interior furniture & service desk
    const props = this._civicProps(place, w, d);
    const propGroups = props.map((prop) => this._addProp(g, prop));
    this._registerWorldProps(building, props, 0, propGroups);
    for (const prop of props) {
      const spec = Interiors.PROP_SPECS[prop.type];
      if (!spec || !spec.collide) continue;
      this.frameWorldCollider(building, prop.x, prop.z, spec.w, spec.d);
    }

    // doors
    this._addSwingDoor({
      x: place.x + Math.sin(yaw) * front,
      z: place.z + Math.cos(yaw) * front,
      yaw, width: doorW, height: doorH,
      label: `${name} doors`, buildingId: id,
    });

    // entrance marker & service spot in front of the desk
    const marker = this._marker(new THREE.Color(color));
    const mx = place.x + Math.sin(yaw) * (front + 6.5);
    const mz = place.z + Math.cos(yaw) * (front + 6.5);
    marker.position.set(mx, CURB_Y + 0.04, mz);
    this.root.add(marker);
    this.stationMarkers.push(marker);

    this.districtSpots.push({ x: mx, z: mz, id, name, icon: place.icon, place });

    const desk = props.find((p) => p.type === 'reception') || { x: 0, z: -d / 2 + 4 };
    const cos = Math.cos(yaw); const sin = Math.sin(yaw);
    this._registerServiceSpot({
      placeId: id,
      serviceId: place.services[0],
      name,
      prompt: `${name} — ${place.services[0] === 'hotel' ? 'check in / check out' : place.services[0] === 'hospital' ? 'reception & treatment' : place.services[0] === 'museum' ? 'tickets & gallery' : place.services[0] === 'mall' ? 'concierge, shops & cinema' : place.services[0] === 'gym' ? 'front desk & training' : 'librarian & study desks'}`,
      x: place.x + desk.x * cos + (desk.z + 2.2) * sin,
      z: place.z - desk.x * sin + (desk.z + 2.2) * cos,
      y: CURB_Y,
    });
    return building;
  }

  frameWorldCollider(building, lx, lz, w, d) {
    const cos = Math.cos(building.yaw || 0);
    const sin = Math.sin(building.yaw || 0);
    const cx = building.x + lx * cos + lz * sin;
    const cz = building.z - lx * sin + lz * cos;
    const quarter = Math.abs(Math.round((building.yaw || 0) / (Math.PI / 2))) % 2 === 1;
    const ww = quarter ? d : w;
    const dd = quarter ? w : d;
    this.addCollider(cx - ww / 2, cx + ww / 2, cz - dd / 2, cz + dd / 2);
  }

  /** Deterministic furniture for each civic building type. */
  _civicProps(place, w, d) {
    const hd = d / 2;
    const hw = w / 2;
    switch (place.type) {
      case 'hospital':
        return [
          { type: 'reception', x: 0, z: -hd + 4.0, rot: Math.PI },
          { type: 'medbed', x: -hw + 4.0, z: -hd + 8.2, rot: Math.PI / 2 },
          { type: 'medbed', x: -hw + 4.0, z: -hd + 11.0, rot: Math.PI / 2 },
          { type: 'medbed', x: hw - 4.0, z: -hd + 8.2, rot: -Math.PI / 2 },
          { type: 'medbed', x: hw - 4.0, z: -hd + 11.0, rot: -Math.PI / 2 },
          { type: 'deskpair', x: -hw + 6.0, z: 1.0, rot: 0 },
          { type: 'labbench', x: hw - 6.0, z: 1.6, rot: Math.PI },
          { type: 'chair', x: -3.2, z: -hd + 6.4, rot: Math.PI },
          { type: 'chair', x: -2.4, z: -hd + 6.4, rot: Math.PI },
          { type: 'chair', x: 2.4, z: -hd + 6.4, rot: Math.PI },
          { type: 'chair', x: 3.2, z: -hd + 6.4, rot: Math.PI },
          { type: 'planter', x: -hw + 2.0, z: hd - 2.6, rot: 0 },
          { type: 'planter', x: hw - 2.0, z: hd - 2.6, rot: 0 },
        ];
      case 'museum':
        return [
          { type: 'reception', x: 3.0, z: -hd + 3.6, rot: Math.PI },
          { type: 'artframe', x: -8.0, z: -hd + 0.6, rot: 0 },
          { type: 'artframe', x: 0.0, z: -hd + 0.6, rot: 0 },
          { type: 'artframe', x: 8.0, z: -hd + 0.6, rot: 0 },
          { type: 'artframe', x: -hw + 0.75, z: -2.0, rot: Math.PI / 2 },
          { type: 'artframe', x: hw - 0.75, z: -2.0, rot: -Math.PI / 2 },
          { type: 'sculpture', x: -7.5, z: 1.6, rot: 0 },
          { type: 'sculpture', x: 0.0, z: -2.6, rot: 0 },
          { type: 'sculpture', x: 7.5, z: 1.6, rot: 0 },
          { type: 'bench', x: 0, z: 5.2, rot: 0 },
          { type: 'bench', x: -5.5, z: 5.2, rot: 0 },
          { type: 'bench', x: 5.5, z: 5.2, rot: 0 },
          { type: 'planter', x: -hw + 2.0, z: hd - 2.4, rot: 0 },
          { type: 'planter', x: hw - 2.0, z: hd - 2.4, rot: 0 },
        ];
      case 'mall':
        return [
          { type: 'reception', x: 0, z: -hd + 3.4, rot: Math.PI },
          { type: 'counter', x: -11.0, z: -hd + 8.5, rot: Math.PI / 2 },
          { type: 'counter', x: 11.0, z: -hd + 8.5, rot: -Math.PI / 2 },
          { type: 'bookshelf', x: -hw + 2.4, z: -2.0, rot: Math.PI / 2 },
          { type: 'bookshelf', x: -hw + 2.4, z: 1.6, rot: Math.PI / 2 },
          { type: 'dinetable', x: -8.0, z: 3.6, rot: 0 },
          { type: 'dinetable', x: -2.5, z: 3.6, rot: 0 },
          { type: 'dinetable', x: 3.0, z: 3.6, rot: 0 },
          { type: 'kitchen', x: 9.5, z: 4.6, rot: Math.PI },
          { type: 'bar', x: 9.5, z: 1.0, rot: 0 },
          { type: 'sofa', x: 12.5, z: -1.0, rot: -Math.PI / 2 },
          { type: 'planter', x: -hw + 2.0, z: hd - 2.4, rot: 0 },
          { type: 'planter', x: hw - 2.0, z: hd - 2.4, rot: 0 },
          { type: 'cinema_screen', x: 0, z: -hd + 0.9, rot: 0 },
          // cinema seating facing the screen (E seats you facing the picture)
          { type: 'bench', x: -3.6, z: -hd + 5.2, rot: Math.PI },
          { type: 'bench', x: 0, z: -hd + 5.2, rot: Math.PI },
          { type: 'bench', x: 3.6, z: -hd + 5.2, rot: Math.PI },
          { type: 'bench', x: -3.6, z: -hd + 7.4, rot: Math.PI },
          { type: 'bench', x: 0, z: -hd + 7.4, rot: Math.PI },
          { type: 'bench', x: 3.6, z: -hd + 7.4, rot: Math.PI },
        ].filter((p, i, arr) => {
          // the cinema screen lives on the east wing; keep it clear of the counters
          if (p.type === 'cinema_screen') return true;
          return i < arr.length;
        });
      case 'gym':
        return [
          { type: 'reception', x: 0, z: -hd + 3.4, rot: Math.PI },
          { type: 'treadmill', x: -9.0, z: -3.0, rot: 0 },
          { type: 'treadmill', x: -6.2, z: -3.0, rot: 0 },
          { type: 'treadmill', x: -9.0, z: 1.4, rot: 0 },
          { type: 'treadmill', x: -6.2, z: 1.4, rot: 0 },
          { type: 'gymbench', x: 3.0, z: -2.4, rot: 0 },
          { type: 'gymbench', x: 7.4, z: -2.4, rot: 0 },
          { type: 'dumbbellrack', x: hw - 2.2, z: 2.6, rot: -Math.PI / 2 },
          { type: 'dumbbellrack', x: hw - 2.2, z: 5.2, rot: -Math.PI / 2 },
          { type: 'bench', x: -3.0, z: hd - 3.0, rot: 0 },
          { type: 'planter', x: -hw + 2.0, z: hd - 2.4, rot: 0 },
        ];
      case 'library':
      default:
        return [
          { type: 'reception', x: 0, z: -hd + 3.4, rot: Math.PI },
          { type: 'bookshelf', x: -9.6, z: -3.4, rot: 0 },
          { type: 'bookshelf', x: -6.8, z: -3.4, rot: 0 },
          { type: 'bookshelf', x: 6.8, z: -3.4, rot: 0 },
          { type: 'bookshelf', x: 9.6, z: -3.4, rot: 0 },
          { type: 'bookshelf', x: -hw + 2.0, z: 0.4, rot: Math.PI / 2 },
          { type: 'bookshelf', x: hw - 2.0, z: 0.4, rot: -Math.PI / 2 },
          { type: 'desk', x: -5.0, z: 3.2, rot: 0 },
          { type: 'desk', x: 0.0, z: 3.2, rot: 0 },
          { type: 'desk', x: 5.0, z: 3.2, rot: 0 },
          { type: 'chair', x: -5.0, z: 2.2, rot: Math.PI },
          { type: 'chair', x: 0.0, z: 2.2, rot: Math.PI },
          { type: 'chair', x: 5.0, z: 2.2, rot: Math.PI },
          { type: 'bench', x: 0, z: hd - 3.4, rot: 0 },
          { type: 'planter', x: -hw + 2.0, z: hd - 2.4, rot: 0 },
          { type: 'planter', x: hw - 2.0, z: hd - 2.4, rot: 0 },
        ];
    }
  }

  _buildDistrict() {
    const m = this._propMaterials();
    const D = DISTRICT;

    // ---------------------------------------------------------------- roads
    // Extend all five avenues south and add a new cross avenue at z = 190.
    const roadZ = new THREE.PlaneGeometry(ROAD_HALF * 2, 70);
    for (const r of ROAD_LINES) {
      const strip = new THREE.Mesh(roadZ, this.mats.roadZ);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(r, 0.021, 192.5);
      strip.receiveShadow = true;
      this.root.add(strip);
    }
    const roadX = new THREE.PlaneGeometry(320, ROAD_HALF * 2);
    const cross = new THREE.Mesh(roadX, this.mats.roadX);
    cross.rotation.x = -Math.PI / 2;
    cross.position.set(0, 0.022, D.avenueZ);
    cross.receiveShadow = true;
    this.root.add(cross);

    // ------------------------------------------------------------- pavements
    const padGeo = this.boxGeo;
    const padMat = this.mats.plaza;
    const pad = (cx, cz, w, d) => {
      const b = new THREE.Mesh(padGeo, padMat);
      b.scale.set(w, CURB_Y, d);
      b.position.set(cx, CURB_Y / 2, cz);
      b.receiveShadow = true;
      this.root.add(b);
    };
    for (const bx of BLOCK_CENTERS) {
      pad(bx, 169.75, 58, 24.5);   // north band (gym & library)
      pad(bx, 212.75, 58, 29.5);   // south band (hotel, hospital, museum, mall)
    }

    // --------------------------------------------------------------- beach
    // beachfront promenade deck then sand
    pad(0, 228.5, 324, 5.0);
    const sand = new THREE.MeshStandardMaterial({ color: 0xe8d3a0, roughness: 0.95 });
    const sandMesh = new THREE.Mesh(padGeo, sand);
    sandMesh.scale.set(324, 0.14, 11.0);
    sandMesh.position.set(0, 0.03, 234.0);
    sandMesh.receiveShadow = true;
    this.root.add(sandMesh);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(340, 60), new THREE.MeshPhysicalMaterial({
      color: 0x0e7490, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.92,
    }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.04, 269);
    this.root.add(sea);
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(324, 3.2), new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.55 }));
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(0, 0.055, 240.0);
    this.root.add(surf);

    // promenade: palms, benches, lamps and a lifeguard tower
    for (let i = 0; i < 12; i++) {
      const x = -150 + i * 27.5;
      this._palm(x + 6, 227.5);
      this._palm(x - 6, 229.5);
    }
    for (let i = 0; i < 7; i++) {
      const x = -132 + i * 44;
      const bench = new THREE.Group();
      bench.position.set(x, CURB_Y, 225.6);
      this.box(bench, 0, 0.45, 0, 3.0, 0.12, 0.7, m.wood);
      this.box(bench, 0, 0.78, -0.32, 3.0, 0.5, 0.12, m.wood);
      for (const dx of [-1.25, 1.25]) this.box(bench, dx, 0.22, 0, 0.12, 0.45, 0.6, this.mats.darkMetal);
      this.root.add(bench);
      this.addCollider(x - 1.55, x + 1.55, 225.25, 225.95);
      this._registerPropSpot({ buildingId: null, level: -1, type: 'bench', x, z: 225.6, y: CURB_Y, rot: 0, name: 'Promenade bench' });
    }
    // lifeguard tower
    const tower = new THREE.Group();
    tower.position.set(0, CURB_Y, 234.0);
    for (const dx of [-1.4, 1.4]) for (const dz of [-1.4, 1.4]) this.box(tower, dx, 1.1, dz, 0.2, 2.2, 0.2, m.white);
    this.box(tower, 0, 2.3, 0, 3.6, 0.24, 3.6, m.wood);
    this.box(tower, 0, 3.1, -1.5, 3.6, 1.5, 0.14, m.white);
    this.box(tower, 0, 3.9, 0, 4.2, 0.24, 4.2, new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 }));
    this.box(tower, 0, 5.0, 0, 0.1, 2.0, 0.1, this.mats.metal);
    this.box(tower, 0.8, 5.6, 0, 1.4, 0.8, 0.06, new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    this.root.add(tower);
    this.addCollider(-1.9, 1.9, 232.1, 235.9);
    // sea wall keeps players on the sand (and cars out of the water)
    this.addCollider(DISTRICT.minX, DISTRICT.maxX, 238.4, 240.2);
    for (let x = DISTRICT.minX; x <= DISTRICT.maxX; x += 8) {
      this.box(this.root, x, 0.5, 239.3, 7.6, 1.0, 0.5, this.mats.plaza);
    }

    // ------------------------------------------------------- civic buildings
    for (const place of PUBLIC_PLACES) {
      if (place.kind === 'tower') {
        const pair = this.windowPairs[place.type === 'hotel' ? 1 : 2];
        const rx = Math.max(2, Math.round(place.width / 6));
        const ry = Math.max(3, Math.round(place.height / 6));
        const mat = new THREE.MeshStandardMaterial({
          map: cloneRepeat(pair.map, rx, ry),
          normalMap: cloneRepeat(pair.normalMap, rx, ry),
          roughnessMap: cloneRepeat(pair.roughnessMap, rx, ry),
          roughness: 0.86, metalness: 0.16,
          emissive: 0xffffff,
          emissiveMap: cloneRepeat(pair.emissive, rx, ry),
          emissiveIntensity: 0,
        });
        this.windowMats.push(mat);
        const building = this._buildTower({
          x: place.x, z: place.z, w: place.width, d: place.depth, h: place.height,
          mat, roofMat: this.mats.roofDark, yaw: place.yaw, seed: 8100 + Math.round(place.x),
          name: place.name, themeId: place.themeId, id: place.id,
        });
        building.civic = true;
        // hotel lobby extras & service desk
        const cos = Math.cos(place.yaw); const sin = Math.sin(place.yaw);
        this._registerServiceSpot({
          placeId: place.id,
          serviceId: 'hotel',
          name: place.name,
          prompt: 'The Grand Meridian Hotel — check in / check out',
          x: place.x + 3.2 * cos + (place.depth / 2 - 4.6) * sin,
          z: place.z - 3.2 * sin + (place.depth / 2 - 4.6) * cos,
          y: CURB_Y,
        });
        // entrance marker
        const marker = this._marker(new THREE.Color(place.color));
        marker.position.set(place.x + Math.sin(place.yaw) * (place.depth / 2 + 6), CURB_Y + 0.04, place.z + Math.cos(place.yaw) * (place.depth / 2 + 6));
        this.root.add(marker);
        this.stationMarkers.push(marker);
        this.districtSpots.push({ x: marker.position.x, z: marker.position.z, id: place.id, name: place.name, icon: place.icon, place });
      } else {
        this._buildCivicHall(place);
      }
    }

    // ---------------------------------------------------------- gateway signs
    // Monument sign beside the avenue, facing north up the city so drivers see it.
    const gate = new THREE.Group();
    gate.position.set(-136, CURB_Y, 180.0);
    gate.rotation.y = Math.PI;
    this.root.add(gate);
    this.box(gate, 0, 0.35, 0, 12.0, 0.7, 0.7, m.marble);
    this.box(gate, 0, 4.55, 0, 11.0, 0.5, 0.5, m.gold);
    for (const sx of [-5.2, 5.2]) this.box(gate, sx, 2.4, 0, 0.42, 4.4, 0.42, this.mats.darkMetal);
    this.sign(gate, ['SOUTH WATERFRONT', 'HOTEL · HOSPITAL · MUSEUM · MALL · GYM · LIBRARY'], 0, 3.2, 0.26, 9.4, 2.1, {
      bg: '#0e7490', fg: '#f0fdfa', border: '#f59e0b',
    });
    this.addCollider(-141.5, -130.5, 179.2, 180.8);
    // Beach promenade sign
    const beachSign = new THREE.Group();
    beachSign.position.set(60, CURB_Y, 230.2);
    beachSign.rotation.y = Math.PI;
    this.root.add(beachSign);
    for (const sx of [-2.2, 2.2]) this.box(beachSign, sx, 1.25, 0, 0.18, 2.5, 0.18, this.mats.darkMetal);
    this.sign(beachSign, ['METRO BEACH', 'PROMENADE · SEA WALL'], 0, 2.1, 0.12, 4.8, 1.05, {
      bg: '#0f766e', fg: '#ecfeff', border: '#67e8f9',
    });

    // street lamps along the new avenue
    for (const lx of [-120, -60, 0, 60, 120]) {
      const lamp = new THREE.Group();
      lamp.position.set(lx, CURB_Y, D.avenueZ - ROAD_HALF - 1.4);
      this.box(lamp, 0, 3.1, 0, 0.18, 6.2, 0.18, this.mats.darkMetal);
      this.box(lamp, 0.7, 6.1, 0, 1.6, 0.16, 0.16, this.mats.darkMetal);
      this.box(lamp, 1.45, 5.95, 0, 0.5, 0.22, 0.4, new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));
      this.root.add(lamp);
      this.addCollider(lx - 0.2, lx + 0.2, D.avenueZ - ROAD_HALF - 1.6, D.avenueZ - ROAD_HALF - 1.2);
    }
  }

  sign(parent, text, x, y, z, w, h, opts = {}) {
    const tex = makeTextTexture(text, opts);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  tree(x, z, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, CURB_Y, z);
    const trunk = new THREE.Mesh(this.trunkGeo, this.mats.trunk);
    trunk.scale.setScalar(scale);
    trunk.position.y = 1.25 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);

    for (const sx of [-1, 1]) {
      const bough = new THREE.Mesh(this.boughGeo, this.mats.trunk);
      bough.scale.setScalar(scale);
      bough.position.set(sx * 0.34 * scale, 2.25 * scale, 0);
      bough.rotation.z = -sx * 0.58;
      g.add(bough);
    }

    const clusters = [
      [0, 3.35, 0, 1.25],
      [-0.78, 2.75, 0.36, 0.92],
      [0.82, 2.82, -0.32, 0.95],
      [0.12, 2.9, -0.72, 0.86],
    ];
    for (const [cx, cy, cz, cr] of clusters) {
      const leafMat = this.rand() < 0.5 ? this.mats.leaf : this.mats.leaf2;
      const puff = new THREE.Mesh(this.foliageGeo, leafMat);
      puff.scale.set(cr * scale, cr * 0.84 * scale, cr * scale);
      puff.position.set(cx * scale, cy * scale, cz * scale);
      puff.rotation.set(this.rand() * 0.5, this.rand() * 3, 0);
      puff.castShadow = true;
      puff.receiveShadow = true;
      g.add(puff);
    }
    this.root.add(g);
    this.addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
  }

  // ----- terrain -------------------------------------------------------------
  _buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), this.mats.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  _buildRoads() {
    const len = MAP_EDGE * 2;
    for (const r of ROAD_LINES) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), this.mats.roadZ);
      a.rotation.x = -Math.PI / 2; a.position.set(r, 0.02, 0); a.receiveShadow = true;
      this.root.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(len, ROAD_HALF * 2), this.mats.roadX);
      b.rotation.x = -Math.PI / 2; b.position.set(0, 0.021, r); b.receiveShadow = true;
      this.root.add(b);
    }
    // dashed centre lines between intersections
    const dash = new THREE.PlaneGeometry(0.22, 2.4);
    const dashes = [];
    for (let i = 0; i < ROAD_LINES.length - 1; i++) {
      const from = ROAD_LINES[i] + ROAD_HALF + 2;
      const to = ROAD_LINES[i + 1] - ROAD_HALF - 2;
      for (let t = from; t < to; t += 5) {
        for (const r of ROAD_LINES) {
          dashes.push([r, t + 1.2, 0]);
          dashes.push([t + 1.2, r, Math.PI / 2]);
        }
      }
    }
    const inst = new THREE.InstancedMesh(dash, this.mats.line, dashes.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    dashes.forEach(([x, z, rot], idx) => {
      e.set(-Math.PI / 2, 0, rot);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.032, z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(idx, m4);
    });
    this.root.add(inst);

    // Curb storm-drain grates along road edges (gritty street detail!)
    const drainGeo = new THREE.PlaneGeometry(0.55, 1.15);
    const drainMat = new THREE.MeshStandardMaterial({
      map: makeStormDrainTexture(), roughness: 0.45, metalness: 0.72,
    });
    const drains = [];
    for (const bx of BLOCK_CENTERS) {
      for (const r of ROAD_LINES) {
        for (const s of [-1, 1]) {
          drains.push([r + s * (ROAD_HALF - 0.34), bx, 0]);
          drains.push([bx, r + s * (ROAD_HALF - 0.34), Math.PI / 2]);
        }
      }
    }
    const drainInst = new THREE.InstancedMesh(drainGeo, drainMat, drains.length);
    drains.forEach(([x, z, rot], idx) => {
      e.set(-Math.PI / 2, 0, rot);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.029, z), q, new THREE.Vector3(1, 1, 1));
      drainInst.setMatrixAt(idx, m4);
    });
    this.root.add(drainInst);

    // zebra crossings at every block corner (alpha-blended over textured asphalt)
    const zebra = makeZebraTexture();
    const zebraMat = new THREE.MeshStandardMaterial({
      map: zebra, transparent: true, roughness: 0.85, depthWrite: false,
    });
    const crossGeoZ = new THREE.PlaneGeometry(ROAD_HALF * 2, SIDEWALK_W);
    for (const r of ROAD_LINES) {
      for (const r2 of ROAD_LINES) {
        for (const s of [-1, 1]) {
          const off = s * (ROAD_HALF + SIDEWALK_W / 2);
          const c1 = new THREE.Mesh(crossGeoZ, zebraMat);
          c1.rotation.x = -Math.PI / 2;
          c1.position.set(r, 0.03, r2 + off);
          if (Math.abs(r2 + off) < MAP_EDGE) this.root.add(c1);
          const c2 = new THREE.Mesh(crossGeoZ, zebraMat);
          c2.rotation.x = -Math.PI / 2;
          c2.rotation.z = Math.PI / 2;
          c2.position.set(r2 + off, 0.031, r);
          if (Math.abs(r2 + off) < MAP_EDGE) this.root.add(c2);
        }
      }
    }
  }

  _buildBlocks() {
    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        const outer = BLOCK_HALF + SIDEWALK_W;
        const sw = new THREE.Mesh(this.boxGeo, this.mats.sidewalk);
        sw.scale.set(outer * 2, CURB_Y, outer * 2);
        sw.position.set(bx, CURB_Y / 2, bz);
        sw.receiveShadow = true;
        this.root.add(sw);
        const inner = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_HALF * 2, BLOCK_HALF * 2), this.mats.grassBlock);
        inner.rotation.x = -Math.PI / 2;
        inner.position.set(bx, CURB_Y + 0.005, bz);
        inner.receiveShadow = true;
        this.root.add(inner);
        this._fillBlock(bx, bz);
      }
    }
  }

  _fillBlock(bx, bz) {
    const face = bz > 0 ? -1 : 1; // features face the central east-west road (z = 0)
    const frame = { x: bx, z: bz, face };
    const key = `${bx},${bz}`;
    const feature = this._featureAt(bx, bz);
    if (feature) {
      feature(frame);
      // filler: trees at the back corners
      for (const lx of [-22, 22]) {
        const p = this.toWorld(frame, lx, -23);
        this.tree(p.x, p.z, 0.9);
      }
      return;
    }
    if (key === '-37.5,112.5' || key === '37.5,-112.5') {
      this._buildPark(frame);
      return;
    }
    this._buildSkylineBlock(frame);
  }

  _featureAt(bx, bz) {
    for (const s of Object.values(STATIONS)) if (s.x === bx && s.z === bz) return (f) => this._buildStation(f, s);
    for (const b of Object.values(BUSINESSES)) if (b.x === bx && b.z === bz) return (f) => this._buildLotBase(f, b);
    for (const s of Object.values(FUEL_STATIONS)) if (s.x === bx && s.z === bz) return (f) => this._buildFuelStation(f, s);
    if (DEALERSHIP.x === bx && DEALERSHIP.z === bz) return (f) => this._buildDealership(f);
    if (BOUTIQUE.x === bx && BOUTIQUE.z === bz) return (f) => this._buildBoutique(f);
    return null;
  }

  // ----- fuel station (feature 4 + night glow from feature 11) --------------
  _buildFuelStation(frame, st) {
    const g = this.frameGroup(frame);
    const color = new THREE.Color(st.color);
    const canopy = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0 });
    const ceilingGlow = new THREE.MeshBasicMaterial({ color: 0xfef9c3, transparent: true, opacity: 0.12 });
    this.fuelGlowMats.push({ canopy, ceilingGlow });
    const dark = this.mats.darkMetal;
    // asphalt pad
    this.box(g, 0, 0.02, 0, 28, 0.04, 16, this.mats.road, { cast: false });
    // canopy: four posts + roof (drive under it; only the pump islands block)
    for (const [px, pz] of [[-9, 5], [9, 5], [-9, -5], [9, -5]]) this.box(g, px, 2.6, pz, 0.5, 5.2, 0.5, dark);
    this.box(g, 0, 5.35, 0, 23, 0.5, 12.5, canopy);
    this.box(g, 0, 5.08, 0, 21.6, 0.04, 11.2, ceilingGlow, { cast: false, receive: false });
    this.box(g, 0, 5.65, -6.1, 23, 0.3, 0.3, dark);
    this.sign(g, [st.name.toUpperCase(), 'FUELS 24/7'], 0, 4.6, -6.3, 12, 2.4, { bg: st.color, fg: '#ffffff' });
    this.sign(g, [st.name.toUpperCase(), 'FUELS 24/7'], 0, 5.35, 6.28, 12, 0.9, { bg: st.color, fg: '#ffffff' });
    // two pump islands × two pumps
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    for (const ix of [-5.5, 5.5]) {
      this.box(g, ix, 0.15, 0, 4.2, 0.3, 4.2, dark);
      this.frameCollider(frame, ix, 0, 4.4, 4.4);
      for (const dx of [-1.2, 1.2]) {
        this.box(g, ix + dx, 1.05, 0, 0.95, 1.7, 0.8, canopy);
        this.box(g, ix + dx, 1.35, -0.42, 0.6, 0.5, 0.05, screenMat, { cast: false });
        this.box(g, ix + dx + 0.55, 1.0, 0, 0.08, 0.8, 0.15, dark);
      }
    }
    // price totem
    this.box(g, -11.5, 1.1, 2, 0.3, 2.2, 0.3, dark);
    this.sign(g, ['$1.05 / L', 'DIESEL + $0.20'], -11.5, 3.2, 2, 4.6, 1.6, { bg: '#111827', fg: '#4ade80' });
    // --- Fuel & Go convenience store: a real walk-in building on every forecourt
    {
      const sx = 8.5;
      const sz = -12.0;
      const cos = frame.face;
      const yaw = frame.face === 1 ? 0 : Math.PI;
      const bx = frame.x + frame.face * sx;
      const bz = frame.z + frame.face * sz;
      const store = {
        id: `fuel-${st.id}`, kind: 'shop', name: `${st.name} Express`,
        x: bx, z: bz, width: 11, depth: 7.2, height: 3.6, baseY: CURB_Y,
        floors: 0, yaw, themeId: 'corporate', seed: 90 + Math.round(sx),
      };
      const sg = new THREE.Group();
      sg.position.set(bx, CURB_Y, bz);
      sg.rotation.y = yaw;
      this.root.add(sg);
      this.enterables.push(store);
      // shell
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85 });
      this.box(sg, 0, 1.8, -3.6, 11, 3.6, 0.3, wallMat);
      this.frameWorldCollider(store, 0, -3.6, 11, 0.3);
      for (const sgn of [-1, 1]) {
        this.box(sg, sgn * 5.5, 1.8, 0, 0.3, 3.6, 7.2, wallMat);
        this.frameWorldCollider(store, sgn * 5.5, 0, 0.3, 7.2);
      }
      // front wall with a door gap + glass shopfront
      const seg = (11 - 3.2) / 2;
      for (const sgn of [-1, 1]) {
        const ox = sgn * (3.2 / 2 + seg / 2);
        this.box(sg, ox, 1.8, 3.6, seg, 3.6, 0.3, wallMat);
        this.box(sg, ox, 2.2, 3.78, seg - 0.6, 1.9, 0.06, this.mats.glass, { cast: false });
        this.frameWorldCollider(store, ox, 3.6, seg, 0.3);
      }
      this.box(sg, 0, 3.3, 3.6, 11.6, 0.6, 7.6, this.mats.darkMetal);
      this.sign(sg, [`${st.name.toUpperCase()} EXPRESS`, 'SNACKS · DRINKS · COFFEE'], 0, 3.05, 3.8, 8.2, 1.0, {
        bg: st.color, fg: '#ffffff',
      });
      this._interiorWalls(sg, { w: 10.4, d: 6.8, h: 3.2, sill: 0.95, head: 2.6, doorW: 3.4, doorH: 2.9 });
      this._addSwingDoor({
        x: bx + Math.sin(yaw) * 3.6, z: bz + Math.cos(yaw) * 3.6,
        y: CURB_Y, yaw, width: 3.2, height: 2.9,
        label: `${st.name} Express doors`, buildingId: store.id,
      });
      const shopProps = [
        { type: 'counter', x: 0, z: -1.4, rot: 0 },
        { type: 'bookshelf', x: -4.2, z: -2.4, rot: 0 },
        { type: 'kitchen', x: 3.6, z: -2.4, rot: 0 },
        { type: 'lamp', x: -4.6, z: 1.6, rot: 0 },
      ];
      const shopGroups = shopProps.map((prop) => this._addProp(sg, prop));
      this._registerWorldProps(store, shopProps, 0, shopGroups);
      this._registerServiceSpot({
        placeId: store.id, serviceId: 'snack', name: `${st.name} Express`,
        prompt: `${st.name} Express — snacks, coffee & hot food`,
        x: bx + Math.sin(yaw) * 2.4, z: bz + Math.cos(yaw) * 2.4, y: CURB_Y,
      });
      void cos;
    }

    // glowing interaction pad
    const pad = this._marker(color);
    const p = this.toWorld(frame, 0, 9);
    pad.position.set(p.x, CURB_Y + 0.03, p.z);
    this.root.add(pad);
    this.stationMarkers.push(pad);
    st.interact = { x: p.x, z: p.z };
  }

  // ----- skyline -------------------------------------------------------------
  _buildSkylineBlock(frame) {
    const r = this.rand;
    // Dense downtown: a 3×3 parcel grid per block (up to 9 walk-in towers each)
    const spots = [[-18, -18], [0, -18], [18, -18], [-18, 0], [0, 0], [18, 0], [-18, 18], [0, 18], [18, 18]];
    for (const [lx, lz] of spots) {
      if (r() < 0.12) { const p = this.toWorld(frame, lx, lz); this.tree(p.x, p.z, 1.2); continue; }
      const w = 10.5 + r() * 3.5;
      const d = 10.5 + r() * 3.5;
      const h = 11 + r() * (Math.abs(frame.x) < 80 ? 34 : 24);
      const p = this.toWorld(frame, lx, lz);
      const pair = this.windowPairs[Math.floor(r() * this.windowPairs.length)];
      const floorsGuess = Interiors.floorCountForHeight(h - 1.5);
      const rx = Math.max(1, Math.round(w / 6));
      const ry = Math.max(1, Math.round((floorsGuess * 3.2) / 6));
      const tex = cloneRepeat(pair.map, rx, ry);
      const norm = cloneRepeat(pair.normalMap, rx, ry);
      const rough = cloneRepeat(pair.roughnessMap, rx, ry);
      const em = cloneRepeat(pair.emissive, rx, ry);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        normalMap: norm,
        roughnessMap: rough,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 0.9,
        metalness: 0.14,
        emissive: 0xffffff,
        emissiveMap: em,
        emissiveIntensity: 0,
      });
      this.windowMats.push(mat);
      // Every skyline tower is now a walk-in, multi-storey building with a lift
      // and a roof sky deck. Doors face the nearest avenue (east or west).
      // Doors face the closest open street: side columns face outward, middle faces the block front
      let yaw = lz > 0 ? 0 : Math.PI;
      if (lx < -6) yaw = -Math.PI / 2;
      else if (lx > 6) yaw = Math.PI / 2;
      this._buildTower({
        x: p.x, z: p.z, w, d, h,
        mat,
        roofMat: this.mats.roofDark,
        yaw,
        seed: Math.round(p.x * 31 + p.z * 17 + w * 7),
        themeId: Interiors.themeForSeed(Math.round(p.x * 31 + p.z * 17)),
        name: TOWER_NAMES[this._towerCount++ % TOWER_NAMES.length],
      });
      // cornice ring right above the parapet
      const building = this.enterables[this.enterables.length - 1];
      this.box(this.root, p.x, building.roofY + 1.2, p.z, w + 0.9, 0.35, d + 0.9, this.mats.darkMetal);
    }
  }

  _buildPark(frame) {
    const g = this.frameGroup(frame);
    // paths
    this.box(g, 0, 0.02, 0, 4, 0.04, 52, this.mats.plaza, { cast: false });
    this.box(g, 0, 0.02, 0, 52, 0.04, 4, this.mats.plaza, { cast: false });
    // fountain
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.8, 24), this.mats.plaza);
    basin.position.y = 0.4; basin.castShadow = true; basin.receiveShadow = true;
    g.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.1, 24), this.mats.water);
    water.position.y = 0.75;
    g.add(water);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 2.4, 10), this.mats.plaza);
    spout.position.y = 1.4; spout.castShadow = true;
    g.add(spout);
    this.fountainWater = water;
    this.addCollider(frame.x - 5.2, frame.x + 5.2, frame.z - 5.2, frame.z + 5.2);
    for (const [lx, lz] of [[-14, -14], [14, -14], [-14, 14], [14, 14], [-22, 4], [22, -4], [6, 22], [-6, -22]]) {
      const p = this.toWorld(frame, lx, lz);
      this.tree(p.x, p.z, 1 + this.rand() * 0.4);
    }
    // benches (interactive — press E to sit)
    for (const [lx, lz, rot] of [[-4, 9, 0], [4, -9, Math.PI], [9, 4, Math.PI / 2], [-9, -4, -Math.PI / 2]]) {
      const b = new THREE.Group();
      b.position.set(lx, 0, lz); b.rotation.y = rot;
      this.box(b, 0, 0.45, 0, 2.2, 0.1, 0.6, this.mats.trunk);
      this.box(b, 0, 0.8, -0.28, 2.2, 0.6, 0.08, this.mats.trunk);
      this.box(b, -0.9, 0.22, 0, 0.1, 0.45, 0.5, this.mats.darkMetal);
      this.box(b, 0.9, 0.22, 0, 0.1, 0.45, 0.5, this.mats.darkMetal);
      g.add(b);
      const world = this.toWorld(frame, lx, lz);
      this._registerPropSpot({ buildingId: null, level: -1, type: 'bench', x: world.x, z: world.z, y: CURB_Y, rot: rot + (frame.face === 1 ? 0 : Math.PI), name: 'Park bench' });
    }
  }

  // ----- job stations --------------------------------------------------------
  _buildStation(frame, st) {
    const g = this.frameGroup(frame);
    const color = new THREE.Color(st.color);
    const pair = this.windowPairs[1];
    const wallMat = new THREE.MeshStandardMaterial({
      map: cloneRepeat(pair.map, 3, 2),
      normalMap: cloneRepeat(pair.normalMap, 3, 2),
      roughnessMap: cloneRepeat(pair.roughnessMap, 3, 2),
      roughness: 0.85,
      metalness: 0.12,
      emissive: 0xffffff,
      emissiveMap: cloneRepeat(pair.emissive, 3, 2),
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
    });
    this.windowMats.push(wallMat);
    const trimMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });
    const m = this._propMaterials();
    const centre = this.toWorld(frame, 0, -9);
    const building = {
      id: `station-${st.id}`, kind: 'shop', name: st.name, x: centre.x, z: centre.z,
      width: 20, depth: 14, height: 7, baseY: CURB_Y, floors: 0, yaw: frame.face === 1 ? 0 : Math.PI,
      seed: Math.round(centre.x * 13 + centre.z * 7), themeId: 'corporate',
    };
    this.enterables.push(building);
    this.interiorFurniture[building.id] = [];

    // ----- hollow walk-in shell (footprint local x[-10,10] z[-16,-2]) -------
    this.box(g, 0, 0.05, -9, 19.5, 0.1, 13.5, m.marble, { cast: false });
    this.box(g, 0, 6.85, -9, 20.2, 0.3, 14.2, trimMat);
    this.box(g, 0, 3.5, -15.7, 20.4, 7, 0.45, wallMat);
    this.frameCollider(frame, 0, -15.7, 20.4, 0.6);
    this.box(g, -10.05, 3.5, -9, 0.45, 7, 14, wallMat);
    this.frameCollider(frame, -10.05, -9, 0.6, 14.1);
    this.box(g, 10.05, 3.5, -9, 0.45, 7, 14, wallMat);
    this.frameCollider(frame, 10.05, -9, 0.6, 14.1);

    // standard interior walls, skirting & framed windows
    {
      const room = new THREE.Group();
      room.position.set(0, 0, -9);
      g.add(room);
      this._interiorWalls(room, {
        w: 19.4, d: 13.4, h: 6.7, sill: 0.95, head: 3.6, doorW: 4.4, doorH: 3.4,
      });
    }

    // front: glass shopfront either side of a wide open doorway
    const doorW = 4.2; const doorH = 3.4; const t = 0.42;
    const segW = 10 - doorW / 2;
    for (const sgn of [-1, 1]) {
      const cx = sgn * (doorW / 2 + segW / 2);
      this.box(g, cx, 0.55, -1.95, segW, 1.1, t, wallMat);
      this.box(g, cx, 2.55, -1.95, segW - 0.5, 2.4, 0.12, this.mats.glass, { cast: false });
      this.box(g, cx, 5.35, -1.95, segW, 3.3, t, wallMat);
      this.box(g, cx, 3.78, -1.95, segW, 0.24, t + 0.1, trimMat);
      this.frameCollider(frame, cx, -1.95, segW, t);
    }
    this.box(g, 0, doorH + 1.8, -1.95, doorW + 0.4, 3.6, t, wallMat);
    this.box(g, -(doorW / 2 + 0.15), doorH / 2, -1.95, 0.3, doorH, t + 0.2, trimMat);
    this.box(g, (doorW / 2 + 0.15), doorH / 2, -1.95, 0.3, doorH, t + 0.2, trimMat);
    const stationDoor = this.toWorld(frame, 0, -1.95);
    this._addSwingDoor({
      x: stationDoor.x, z: stationDoor.z, y: CURB_Y,
      yaw: frame.face === 1 ? 0 : Math.PI,
      width: doorW, height: doorH, label: `${st.name} doors`, buildingId: building.id,
    });
    this.box(g, 0, 4.4, -1.4, 21, 0.3, 1.4, trimMat);                     // awning
    this.sign(g, [st.name.toUpperCase(), 'NOW HIRING'], 0, 5.9, -1.84, 14, 1.9, { bg: st.color, fg: st.id === 'cab' ? '#111827' : '#ffffff' });

    // ----- interior dressing -------------------------------------------------
    const props = [];
    if (st.id === 'courier') {
      props.push({ type: 'reception', x: 0, z: -5.2, rot: 0 });
      props.push({ type: 'desk', x: 6.4, z: -10.5, rot: Math.PI });
      props.push({ type: 'bookshelf', x: -7.6, z: -12.8, rot: 0 });
      props.push({ type: 'planter', x: -7.8, z: -4.2, rot: 0 });
      for (const [x, z] of [[12, -4], [13, -6], [12.4, -8]]) this.box(g, x, 0.4, z, 1, 0.8, 1, m.wood);
      this.frameCollider(frame, 12.5, -6, 2.5, 6);
      this.frameCollider(frame, 6.4, -10.5, 2.2, 1.2);
    } else if (st.id === 'security') {
      props.push({ type: 'reception', x: 0, z: -5.4, rot: 0 });
      props.push({ type: 'deskpair', x: 0, z: -11.5, rot: Math.PI });
      props.push({ type: 'tvwall', x: 0, z: -14.6, rot: 0 });
      props.push({ type: 'planter', x: 7.6, z: -11.5, rot: 0 });
      this.frameCollider(frame, 0, -11.5, 4.2, 1.2);
      this.frameCollider(frame, 0, -14.6, 3.4, 0.6);
      this.box(g, 13, 4, -3, 0.2, 8, 0.2, this.mats.metal);
      this.box(g, 13.8, 7.3, -3, 1.6, 1, 0.05, new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }));
      this.frameCollider(frame, 13, -3, 0.6, 0.6);
    } else if (st.id === 'cab') {
      props.push({ type: 'reception', x: 0, z: -5.6, rot: 0 });
      props.push({ type: 'deskpair', x: 0, z: -10.8, rot: Math.PI });
      props.push({ type: 'sofa', x: -6.4, z: -9.2, rot: Math.PI / 2 });
      props.push({ type: 'sofa', x: 6.4, z: -9.2, rot: -Math.PI / 2 });
      props.push({ type: 'planter', x: 7.7, z: -4.2, rot: 0 });
      this.frameCollider(frame, 0, -10.8, 4.2, 1.2);
      this.frameCollider(frame, -6.4, -9.2, 1.2, 2.8);
      this.frameCollider(frame, 6.4, -9.2, 1.2, 2.8);
      for (const x of [-12, -6, 6, 12]) this.box(g, x, 0.02, 8, 0.2, 0.02, 5, this.mats.white, { cast: false });
    }
    const propGroups = [];
    for (const prop of props) {
      propGroups.push(this._addProp(g, prop));
      const spec = Interiors.PROP_SPECS[prop.type];
      if (spec && spec.collide) {
        const world = this.toWorld(frame, prop.x, prop.z);
        this.interiorFurniture[building.id].push({
          minX: world.x - spec.w / 2, maxX: world.x + spec.w / 2,
          minZ: world.z - spec.d / 2, maxZ: world.z + spec.d / 2,
        });
      }
    }
    this._registerFrameProps(building, frame, props, 0, propGroups);
    this.box(g, 0, 0.06, -9, 3.4, 0.06, 12.4, m.cream, { cast: false }); // entry runner rug

    // interior reception pad (press E at the desk)
    const deskWorld = this.toWorld(frame, 0, -3.2);
    this.indoorSpots.push({
      x: deskWorld.x, z: deskWorld.z, type: 'station', id: st.id, name: st.name,
      prompt: `${st.name} reception — clock in & manage your shift`,
    });

    // glowing exterior interaction pad
    const pad = this._marker(color);
    const p = this.toWorld(frame, 0, 6);
    pad.position.set(p.x, CURB_Y + 0.03, p.z);
    this.root.add(pad);
    this.stationMarkers.push(pad);
    st.interact = { x: p.x, z: p.z };
  }

  _marker(color) {
    const geo = new THREE.RingGeometry(1.1, 1.5, 32);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  // ----- dealership ----------------------------------------------------------
  _buildDealership(frame) {
    const g = this.frameGroup(frame);
    const trim = new THREE.MeshStandardMaterial({ color: DEALERSHIP.color, roughness: 0.3, metalness: 0.45 });
    const neonBlue = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.box(g, 0, 0.05, -8, 30, 0.1, 18, this.mats.plaza, { cast: false });
    // glass showroom
    this.box(g, 0, 3, -16.8, 30, 6, 0.4, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55 })); // sleek dark back wall
    this.box(g, -14.8, 3, -8, 0.4, 6, 18, this.mats.glass, { cast: false });
    this.box(g, 14.8, 3, -8, 0.4, 6, 18, this.mats.glass, { cast: false });
    this.box(g, 0, 6.2, -8, 30.6, 0.4, 18.4, trim);
    this.box(g, 0, 6.45, 0.25, 30.7, 0.08, 0.14, neonBlue, { cast: false });
    for (const x of [-14.8, -5, 5, 14.8]) this.box(g, x, 3, 0.8, 0.4, 6, 0.4, this.mats.metal);
    this.sign(g, ['METRO MOTORS', 'EXOTICS · CUSTOMS · DEALERSHIP'], 0, 7.45, 1, 16, 2.1, { bg: DEALERSHIP.color, border: '#38bdf8' });
    this.box(g, 0, 7.45, 0.85, 16.4, 2.3, 0.2, this.mats.darkMetal);
    this.frameCollider(frame, 0, -16.8, 30, 1);
    this.frameCollider(frame, -14.8, -8, 0.8, 18);
    this.frameCollider(frame, 14.8, -8, 0.8, 18);
    // --- walk-in showroom: real walls, framed windows, doorway & lining ------
    const yaw = frame.face === 1 ? 0 : Math.PI;
    const cx = frame.x;
    const cz = frame.z + frame.face * -8;
    const showroom = new THREE.Group();
    showroom.position.set(0, 0, -8);
    g.add(showroom);
    this._interiorWalls(showroom, {
      w: 29.2, d: 17.2, h: 6.0, sill: 1.05, head: 4.5, doorW: 5.6, doorH: 3.3,
    });
    const showroomBuilding = {
      id: 'dealership', kind: 'shop', name: 'Metro Motors',
      x: cx, z: cz, width: 30, depth: 18, height: 6.45, baseY: CURB_Y,
      floors: 0, yaw, themeId: 'corporate', seed: 41,
    };
    this.enterables.push(showroomBuilding);
    this._addSwingDoor({
      x: cx + Math.sin(yaw) * 8.6, z: cz + Math.cos(yaw) * 8.6,
      y: CURB_Y, yaw, width: 5.6, height: 3.3,
      label: 'Metro Motors doors', buildingId: 'dealership',
    });
    // solid front wall either side of the entrance (the lining has no colliders)
    {
      const seg = (29.2 - 5.6) / 2;
      for (const sgn of [-1, 1]) {
        this.frameCollider(frame, sgn * (5.6 / 2 + seg / 2), 0.6, seg, 0.2);
      }
    }
    const dealerProps = [
      { type: 'reception', x: 0, z: -6.2, rot: 0 },
      { type: 'sofa', x: 8.4, z: -5.4, rot: 0 },
      { type: 'planter', x: -9.2, z: -5.2, rot: 0 },
      { type: 'planter', x: 9.2, z: -5.2, rot: 0 },
      { type: 'tvwall', x: -6.0, z: -7.6, rot: 0 },
      { type: 'armchair', x: -6.0, z: -4.4, rot: Math.PI },
      { type: 'armchair', x: -3.4, z: -4.9, rot: Math.PI },
    ];
    const dealerGroups = dealerProps.map((prop) => this._addProp(showroom, prop));
    this._registerWorldProps(showroomBuilding, dealerProps, 0, dealerGroups);
    this._registerServiceSpot({
      placeId: 'dealership', serviceId: 'dealer', name: 'Metro Motors',
      prompt: 'Metro Motors — exotics, customs & mechanic',
      x: cx + Math.sin(yaw) * 3.2, z: cz + Math.cos(yaw) * 3.2, y: CURB_Y,
    });

    // display platforms (cars placed by game.js)
    this.dealerDisplays = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    for (const x of [-9, 0, 9]) {
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.95, 0.26, 28), this.mats.darkMetal);
      plat.position.set(x, 0.13, -9);
      plat.receiveShadow = true;
      g.add(plat);
      const glow = new THREE.Mesh(new THREE.RingGeometry(2.75, 2.92, 28), ringMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(x, 0.27, -9);
      g.add(glow);
      const p = this.toWorld(frame, x, -9);
      this.dealerDisplays.push({ x: p.x, z: p.z, yaw: frame.face === 1 ? 0.6 : Math.PI + 0.6 });
      this.frameCollider(frame, x, -9, 4.6, 5.2);
    }
    const pad = this._marker(new THREE.Color(DEALERSHIP.color));
    const p = this.toWorld(frame, 0, 6);
    pad.position.set(p.x, CURB_Y + 0.03, p.z);
    this.root.add(pad);
    this.stationMarkers.push(pad);
    DEALERSHIP.interact = { x: p.x, z: p.z };
    // delivery bays for purchased cars (front yard, parallel to the road)
    DEALERSHIP.deliverySpots = [-8, 0, 8].map((lx) => {
      const q = this.toWorld(frame, lx, 17);
      return { x: q.x, z: q.z, yaw: Math.PI / 2 };
    });
    for (const lx of [-12, -4, 4, 12]) this.box(g, lx, 0.02, 17, 0.2, 0.02, 6, this.mats.white, { cast: false });
  }

  // ----- luxury fashion boutique (Maison Verve) ------------------------------
  _buildBoutique(frame) {
    const g = this.frameGroup(frame);
    const obsidian = new THREE.MeshStandardMaterial({ color: 0x14141b, roughness: 0.35, metalness: 0.35 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.9 });
    const velvetMat = new THREE.MeshStandardMaterial({ color: 0x9f1239, roughness: 0.82 });
    const warmBackdrop = new THREE.MeshBasicMaterial({ color: 0xfdf2f8 });
    const neonPink = new THREE.MeshBasicMaterial({ color: 0xf472b6 });

    // Marble forecourt plaza + crimson VIP runway carpet
    this.box(g, 0, 0.04, -3, 28, 0.08, 22, this.mats.plaza, { cast: false });
    this.box(g, 0, 0.09, 4.5, 3.8, 0.03, 9, velvetMat, { cast: false });

    // 2-storey Art-Deco obsidian flagship — hollow & walk-in
    const m = this._propMaterials();
    const centre = this.toWorld(frame, 0, -9);
    const shop = {
      id: 'boutique', kind: 'shop', name: 'Maison Verve', x: centre.x, z: centre.z,
      width: 26, depth: 13, height: 9.2, baseY: CURB_Y, floors: 0,
      yaw: frame.face === 1 ? 0 : Math.PI, seed: 4711, themeId: 'hotel',
    };
    this.enterables.push(shop);
    this.interiorFurniture[shop.id] = [];

    this.box(g, 0, 0.06, -9, 25.4, 0.12, 12.4, m.marble, { cast: false }); // marble shop floor
    this.box(g, 0, 8.95, -9, 26.4, 0.32, 13.4, obsidian);                  // ceiling
    this.box(g, 0, 4.6, -15.45, 26.4, 9.2, 0.5, obsidian);                 // back wall
    this.frameCollider(frame, 0, -15.45, 26.4, 0.6);
    for (const sx of [-12.95, 12.95]) {
      this.box(g, sx, 4.6, -9, 0.5, 9.2, 13, obsidian);                    // side walls
      this.frameCollider(frame, sx, -9, 0.6, 13.1);
    }
    // warm plaster interior with gilt-framed windows
    {
      const room = new THREE.Group();
      room.position.set(0, 0, -9);
      g.add(room);
      this._interiorWalls(room, {
        w: 25.4, d: 12.4, h: 8.85, sill: 1.1, head: 5.6, doorW: 4.0, doorH: 4.6, warm: true,
      });
    }

    // front piers either side of the open 3.8 m entrance
    for (const sgn of [-1, 1]) {
      const cx = sgn * (1.9 + 11.1 / 2);
      this.box(g, cx, 4.6, -2.7, 11.1, 9.2, 0.45, obsidian);
      this.frameCollider(frame, cx, -2.7, 11.1, 0.55);
      this.box(g, sgn * 12.6, 4.6, -2.35, 0.55, 9.2, 0.55, goldMat);
      this.box(g, sgn * 5.2, 4.6, -2.35, 0.55, 9.2, 0.55, goldMat);
    }
    this.box(g, 0, 6.65, -2.7, 3.9, 5.1, 0.45, obsidian);                  // lintel over doors
    this.box(g, 0, 9.35, -9, 26.8, 0.38, 13.8, goldMat);
    this.box(g, 0, 4.9, -2.35, 26.4, 0.22, 0.35, goldMat);
    this.box(g, 0, 9.58, -2.15, 26.8, 0.09, 0.14, neonPink, { cast: false });

    // Illuminated window display alcoves + panoramic boutique glass
    for (const wx of [-8.8, 8.8]) {
      this.box(g, wx, 2.2, -2.52, 6.2, 3.8, 0.12, warmBackdrop, { cast: false });
      this.box(g, wx, 2.2, -2.15, 6.4, 3.9, 0.08, this.mats.glass, { cast: false });
    }
    // Interactive grand glass doors + gold awning canopy
    const boutiqueDoor = this.toWorld(frame, 0, -2.7);
    this._addSwingDoor({
      x: boutiqueDoor.x, z: boutiqueDoor.z, y: CURB_Y,
      yaw: frame.face === 1 ? 0 : Math.PI,
      width: 3.8, height: 4.0, label: 'Maison Verve doors', buildingId: shop.id,
    });
    this.box(g, 0, 4.25, -0.8, 6.2, 0.24, 3.2, goldMat);

    // ----- boutique interior: rails, fitting rooms, gold counter, chandelier
    const props = [
      { type: 'reception', x: 0, z: -13.2, rot: Math.PI },
      { type: 'bookshelf', x: -10.4, z: -8.2, rot: Math.PI / 2 },
      { type: 'bookshelf', x: 10.4, z: -8.2, rot: -Math.PI / 2 },
      { type: 'sofa', x: -6.2, z: -5.2, rot: 0 },
      { type: 'sofa', x: 6.2, z: -5.2, rot: 0 },
      { type: 'sculpture', x: 0, z: -8.4, rot: 0 },
    ];
    const shopGroups = [];
    for (const prop of props) {
      shopGroups.push(this._addProp(g, prop));
      const spec = Interiors.PROP_SPECS[prop.type];
      if (spec && spec.collide) {
        const world = this.toWorld(frame, prop.x, prop.z);
        this.interiorFurniture[shop.id].push({
          minX: world.x - spec.w / 2, maxX: world.x + spec.w / 2,
          minZ: world.z - spec.d / 2, maxZ: world.z + spec.d / 2,
        });
      }
    }
    this._registerFrameProps(shop, frame, props, 0, shopGroups);
    // fitting rooms (velvet booths with mirrors)
    for (const sx of [-9.4, 9.4]) {
      this.box(g, sx, 1.4, -12.6, 2.4, 2.8, 2.4, velvetMat);
      this.box(g, sx, 1.4, -11.35, 1.6, 2.4, 0.1, this.mats.glass, { cast: false });
      this.frameCollider(frame, sx, -12.6, 2.5, 2.5);
    }
    // chandelier
    this._cyl(g, 0, 7.4, -9, 1.1, 0.18, goldMat, 16);
    for (let i = 0; i < 8; i++) {
      this.box(g, Math.cos(i * 0.785) * 0.8, 7.15, -9 + Math.sin(i * 0.785) * 0.8, 0.14, 0.4, 0.14, m.warm, { cast: false });
    }
    this.box(g, 0, 8.1, -9, 0.06, 1.7, 0.06, goldMat);

    this.indoorSpots.push({
      x: this.toWorld(frame, 0, -11.6).x, z: this.toWorld(frame, 0, -11.6).z,
      type: 'boutique', id: 'boutique', name: 'Maison Verve',
      prompt: 'Maison Verve — browse couture, chains & accessories',
    });

    // Flagship signage
    this.sign(g, ['MAISON VERVE', 'LUXURY FASHION · CHAINS · HAUTE COUTURE'], 0, 7.1, -2.28, 18, 2.2, {
      bg: '#18181b', fg: '#fbcfe8', border: '#fbbf24',
    });

    // 3 Golden Mannequin Display Pedestals right in front of the illuminated windows (dressed by game.js)
    this.boutiqueDisplays = [];
    for (const lx of [-8.8, 0, 8.8]) {
      const zLocal = lx === 0 ? -0.9 : -1.45;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.22, 20), goldMat);
      ped.position.set(lx, 0.15, zLocal);
      ped.receiveShadow = true;
      g.add(ped);
      const wp = this.toWorld(frame, lx, zLocal);
      this.boutiqueDisplays.push({
        x: wp.x,
        z: wp.z,
        y: CURB_Y + 0.26,
        yaw: frame.face === 1 ? 0 : Math.PI,
      });
    }

    // Glowing rose-pink interaction ring on the VIP runway
    const pad = this._marker(new THREE.Color(BOUTIQUE.color));
    const p = this.toWorld(frame, 0, 7.5);
    pad.position.set(p.x, CURB_Y + 0.04, p.z);
    this.root.add(pad);
    this.stationMarkers.push(pad);
    BOUTIQUE.interact = { x: p.x, z: p.z };
  }

  // ----- buildable lots --------------------------------------------------------
  _buildLotBase(frame, biz) {
    const pad = this._marker(new THREE.Color(biz.color));
    const p = this.toWorld(frame, 0, 15);
    pad.position.set(p.x, CURB_Y + 0.03, p.z);
    this.root.add(pad);
    this.stationMarkers.push(pad);
    this.lots[biz.id] = { frame, group: null, interact: { x: p.x, z: p.z }, pad };
  }

  // (Re)build the visual for a lot depending on business state (null = vacant)
  updateLot(bizId, bizState) {
    const def = BUSINESSES[bizId];
    const lot = this.lots[bizId];
    if (lot.group) {
      lot.group.parent.remove(lot.group);
      lot.group.traverse((o) => {
        if (o.material && o.material.map) o.material.map.dispose();
      });
    }
    this.dynamicColliders[bizId] = [];
    const list = this.dynamicColliders[bizId];
    // remove any previous walk-in registration for this lot
    const prevIdx = this.enterables.findIndex((b) => b.id === `lot-${bizId}`);
    if (prevIdx >= 0) this.enterables.splice(prevIdx, 1);
    delete this.interiorFurniture[`lot-${bizId}`];
    this.indoorSpots = this.indoorSpots.filter((spot) => spot.lot !== bizId);
    const g = this.frameGroup(lot.frame);
    lot.group = g;
    const frame = lot.frame;

    if (!bizState) {
      this.box(g, 0, 0.02, -6, 30, 0.04, 26, this.mats.dirt, { cast: false });
      // fence posts
      for (let x = -15; x <= 15; x += 3) {
        this.box(g, x, 0.5, -19, 0.15, 1, 0.15, this.mats.fence);
      }
      for (let z = -19; z <= 5; z += 3) {
        this.box(g, -15, 0.5, z, 0.15, 1, 0.15, this.mats.fence);
        this.box(g, 15, 0.5, z, 0.15, 1, 0.15, this.mats.fence);
      }
      this.box(g, 0, 0.8, -19, 30, 0.08, 0.08, this.mats.fence);
      this.box(g, -15, 0.8, -7, 0.08, 0.08, 24, this.mats.fence);
      this.box(g, 15, 0.8, -7, 0.08, 0.08, 24, this.mats.fence);
      // FOR SALE sign
      this.box(g, -2.4, 1.3, 8, 0.15, 2.6, 0.15, this.mats.darkMetal);
      this.box(g, 2.4, 1.3, 8, 0.15, 2.6, 0.15, this.mats.darkMetal);
      this.sign(g, ['FOR SALE', `${def.name} · $${def.cost.toLocaleString()}`], 0, 2.4, 8.09, 5.6, 1.9, { bg: '#fef3c7', fg: '#7c2d12', border: '#b45309' });
      const back = this.sign(g, ['FOR SALE', 'Commercial Lot'], 0, 2.4, 7.91, 5.6, 1.9, { bg: '#fef3c7', fg: '#7c2d12', border: '#b45309' });
      back.rotation.y = Math.PI;
      // little construction props
      this.box(g, -9, 0.5, -10, 2, 1, 2, new THREE.MeshLambertMaterial({ color: 0xf59e0b }));
      this.frameCollider(frame, -9, -10, 2, 2, list);
      this.frameCollider(frame, 0, 8, 5.2, 0.4, list);
      return;
    }

    const level = Math.min(bizState.level, MAX_BUSINESS_LEVEL);
    const color = new THREE.Color(def.color);
    const main = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.25 });
    const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.accent), roughness: 0.48, metalness: 0.2 });
    const wallPair = this.windowPairs[bizId === 'garage' ? 0 : 1];
    const wall = new THREE.MeshStandardMaterial({
      map: cloneRepeat(wallPair.map, 3, Math.max(1, level)),
      normalMap: cloneRepeat(wallPair.normalMap, 3, Math.max(1, level)),
      roughnessMap: cloneRepeat(wallPair.roughnessMap, 3, Math.max(1, level)),
      roughness: 0.86,
      metalness: 0.1,
    });
    const floors = 1 + (level - 1);
    const floorH = 3.6;
    const width = 20 + (level - 1) * 1.5;
    const depth = 16;
    const h = floors * floorH + 1.5;
    const cz = -11; // building centre (local)
    this.box(g, 0, 0.03, -2, 32, 0.05, 30, this.mats.plaza, { cast: false });

    if (this.lotWindowMats[bizId]) {
      const old = this.lotWindowMats[bizId];
      old.emissiveMap?.dispose?.();
      this.lotWindowMats[bizId] = null;
    }
    if (bizId === 'tech') {
      const pair = this.windowPairs[4];
      const tex = cloneRepeat(pair.map, 4, floors * 1.5 + 1);
      const norm = cloneRepeat(pair.normalMap, 4, floors * 1.5 + 1);
      const rough = cloneRepeat(pair.roughnessMap, 4, floors * 1.5 + 1);
      const em = cloneRepeat(pair.emissive, 4, floors * 1.5 + 1);
      const glassMat = new THREE.MeshStandardMaterial({
        map: tex,
        normalMap: norm,
        roughnessMap: rough,
        color: 0xc4b5fd,
        roughness: 0.35,
        metalness: 0.45,
        emissive: 0xffffff,
        emissiveMap: em,
        emissiveIntensity: this._nightFactor * 0.95,
      });
      this.lotWindowMats[bizId] = glassMat;
      const m = this._propMaterials();
      const th = h * 1.6 + 4;
      const lobbyH = 4.6;
      const tower = new THREE.Mesh(this.boxGeo, [glassMat, glassMat, accent, accent, glassMat, glassMat]);
      tower.scale.set(width * 0.8, th - lobbyH, depth);
      tower.position.set(0, lobbyH + (th - lobbyH) / 2, cz);
      tower.castShadow = tower.receiveShadow = true;
      g.add(tower);
      this.box(g, 0, th + 0.6, cz, width * 0.4, 1.2, depth * 0.5, accent);
      this.sign(g, ['BYTEFORGE', `Tech Startup · Lv ${level}`], 0, th - 2, cz + depth / 2 + 0.06, 12, 2.2, { bg: '#1e1b4b', fg: '#22d3ee' });

      // walk-in double-height glass lobby under the tower
      const centre = this.toWorld(frame, 0, cz);
      const lotId = 'lot-tech';
      const doorW = 5.2;
      const t = 0.5;
      const bw = width * 0.8;
      const front = cz + depth / 2;
      this.enterables.push({
        id: lotId, kind: 'shop', name: 'ByteForge Tech Hub', x: centre.x, z: centre.z,
        width: bw, depth, height: lobbyH, baseY: CURB_Y, floors: 0,
        yaw: frame.face === 1 ? 0 : Math.PI, seed: 991, themeId: 'tech',
      });
      this.interiorFurniture[lotId] = [];
      this.box(g, 0, 0.06, cz, bw - 0.4, 0.12, depth - 0.4, m.marble, { cast: false });
      this.box(g, 0, lobbyH - 0.2, cz, bw, 0.4, depth, accent);           // lobby ceiling
      this.box(g, 0, lobbyH / 2, cz - depth / 2, bw, lobbyH, t, glassMat);
      this.frameCollider(frame, 0, cz - depth / 2, bw, t, list);
      for (const sx of [-bw / 2, bw / 2]) {
        this.box(g, sx, lobbyH / 2, cz, t, lobbyH, depth, glassMat);
        this.frameCollider(frame, sx, cz, t, depth, list);
      }
      const segW = (bw - doorW) / 2;
      for (const sgn of [-1, 1]) {
        const x = sgn * (doorW / 2 + segW / 2);
        this.box(g, x, lobbyH / 2, front, segW, lobbyH, t, glassMat);
        this.frameCollider(frame, x, front, segW, t, list);
      }
      this.box(g, 0, 4.0, front, doorW + 0.3, 1.2, t, accent);
      const lobbyProps = [
        { type: 'reception', x: 0, z: cz + 3.6, rot: Math.PI },
        { type: 'serverrack', x: -bw / 2 + 2.2, z: cz - 1.6, rot: 0 },
        { type: 'serverrack', x: -bw / 2 + 3.6, z: cz - 1.6, rot: 0 },
        { type: 'deskpair', x: bw / 2 - 3.8, z: cz - 2.2, rot: -Math.PI / 2 },
        { type: 'planter', x: bw / 2 - 2.2, z: cz + 4.6, rot: 0 },
      ];
      const lobbyGroups = [];
      for (const prop of lobbyProps) {
        lobbyGroups.push(this._addProp(g, prop));
        const spec = Interiors.PROP_SPECS[prop.type];
        if (spec && spec.collide) this.frameCollider(frame, prop.x, prop.z, spec.w, spec.d, list);
      }
      const techBuilding = this.buildingById(lotId);
      if (techBuilding) this._registerFrameProps(techBuilding, frame, lobbyProps, 0, lobbyGroups);
      const techDoor = this.toWorld(frame, 0, front);
      this._addSwingDoor({
        x: techDoor.x, z: techDoor.z, y: CURB_Y,
        yaw: frame.face === 1 ? 0 : Math.PI,
        width: doorW, height: 4.0, label: 'ByteForge lobby doors', buildingId: lotId,
      });
      this.indoorSpots.push({
        x: this.toWorld(frame, 0, cz + 5.6).x, z: this.toWorld(frame, 0, cz + 5.6).z,
        type: 'lot', lot: 'tech', id: 'tech', name: 'ByteForge Tech Hub',
        prompt: 'ByteForge Tech Hub — reception & startup management',
      });
    } else {
      const m = this._propMaterials();
      const centre = this.toWorld(frame, 0, cz);
      const lotId = `lot-${bizId}`;
      const t = 0.5;
      const doorW = bizId === 'garage' ? 9 : bizId === 'logistics' ? 7.5 : 4.6;
      const doorH = 3.7;
      const front = cz + depth / 2;
      this.enterables.push({
        id: lotId, kind: 'shop', name: def.name, x: centre.x, z: centre.z,
        width, depth, height: h, baseY: CURB_Y, floors: 0,
        yaw: frame.face === 1 ? 0 : Math.PI, seed: Math.round(level * 71 + bizId.length), themeId: 'corporate',
      });
      this.interiorFurniture[lotId] = [];

      // roof, interior floor & ceiling
      this.box(g, 0, h + 0.25, cz, width + 0.6, 0.5, depth + 0.6, main);
      this.box(g, 0, 0.06, cz, width - 0.5, 0.12, depth - 0.5, bizId === 'diner' ? m.wood : m.marble, { cast: false });
      this.box(g, 0, h - 0.25, cz, width - 0.4, 0.35, depth - 0.4, main);
      // back + side walls
      this.box(g, 0, h / 2, cz - depth / 2, width, h, t, wall);
      this.frameCollider(frame, 0, cz - depth / 2, width, t, list);
      for (const sx of [-width / 2, width / 2]) {
        this.box(g, sx, h / 2, cz, t, h, depth, wall);
        this.frameCollider(frame, sx, cz, t, depth, list);
      }
      // shopfront with an open doorway
      const segW = Math.max(0.6, (width - doorW) / 2);
      for (const sgn of [-1, 1]) {
        const x = sgn * (doorW / 2 + segW / 2);
        this.box(g, x, h / 2, front, segW, h, t, wall);
        this.frameCollider(frame, x, front, segW, t, list);
        this.box(g, x, 2.05, front + t / 2 + 0.03, Math.max(1, segW - 1.4), 2.6, 0.1, this.mats.glass, { cast: false });
        if (bizId === 'garage') {
          for (let y = 0.4; y < 3.8; y += 0.55) this.box(g, x, y, front + 0.34, Math.max(1, segW - 1.4), 0.06, 0.05, this.mats.metal, { cast: false });
        }
      }
      this.box(g, 0, doorH + (h - doorH) / 2, front, doorW + 0.4, h - doorH, t, wall);
      this.box(g, 0, doorH + 0.3, front + 0.55, doorW + 2.2, 0.32, 1.3, accent);
      if (bizId === 'garage') {
        this.box(g, 0, h - 0.9, front + 0.14, 10, 1.6, 0.1, main);
        this.sign(g, ['APEX AUTO', `Garage · Lv ${level}`], 0, h - 0.9, front + 0.2, 10, 1.5, { bg: def.color });
      } else if (bizId === 'diner') {
        this.sign(g, ['METRO FRESH', `Diner · Lv ${level}`], 0, h - 0.9, front + 0.2, 10, 1.5, { bg: def.color });
      } else if (bizId === 'logistics') {
        this.sign(g, ['SWIFTCARGO', `Logistics Hub · Lv ${level}`], 0, h - 0.9, front + 0.2, 11, 1.5, { bg: def.color, fg: '#111827' });
      }

      // plaster lining, skirting & framed windows so the shop reads as a real room
      {
        const room = new THREE.Group();
        room.position.set(0, 0, cz);
        g.add(room);
        this._interiorWalls(room, {
          w: width - 0.7, d: depth - 0.7, h: Math.max(3.2, h - 0.55),
          sill: 0.95, head: Math.min(2.45, Math.max(2.1, h - 1.1)),
          doorW: doorW, doorH: doorH, warm: bizId === 'diner',
        });
      }

      // ----- themed walk-in interior -------------------------------------
      const props = [];
      if (bizId === 'garage') {
        this.box(g, -4.5, 0.22, cz - 1.5, 4.0, 0.36, 7.0, this.mats.metal); // hydraulic lift
        this.box(g, -4.5, 0.45, cz - 1.5, 3.4, 0.2, 5.6, accent);
        this.frameCollider(frame, -4.5, cz - 1.5, 4.0, 7.0, list);
        props.push(
          { type: 'labbench', x: 3.5, z: cz - 5.2, rot: 0 },
          { type: 'bookshelf', x: width / 2 - 1.6, z: cz - 0.5, rot: -Math.PI / 2 },
          { type: 'desk', x: -width / 2 + 3.2, z: cz + 4.4, rot: Math.PI / 2 },
          { type: 'planter', x: width / 2 - 2.0, z: front - 2.2, rot: 0 },
        );
        for (const [x, z] of [[1.5, cz - 5.8], [2.2, cz - 5.8]]) {
          const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.18, 6, 12), this.mats.darkMetal);
          tyre.rotation.x = Math.PI / 2; tyre.position.set(x, 0.2, z); g.add(tyre);
        }
      } else if (bizId === 'diner') {
        props.push(
          { type: 'bar', x: 0, z: cz - 4.6, rot: 0 },
          { type: 'kitchen', x: 0, z: cz - 6.6, rot: 0 },
          { type: 'dinetable', x: -width / 2 + 4.0, z: cz + 3.4, rot: 0 },
          { type: 'dinetable', x: width / 2 - 4.0, z: cz + 3.4, rot: 0 },
          { type: 'sofa', x: -width / 2 + 4.0, z: cz + 0.6, rot: Math.PI },
          { type: 'sofa', x: width / 2 - 4.0, z: cz + 0.6, rot: Math.PI },
          { type: 'planter', x: width / 2 - 2.0, z: front - 2.0, rot: 0 },
        );
      } else {
        for (const rx of [-width / 2 + 3.2, -width / 2 + 6.0, width / 2 - 3.2, width / 2 - 6.0]) {
          props.push({ type: 'bookshelf', x: rx, z: cz - 5.4, rot: 0 });
        }
        props.push(
          { type: 'desk', x: 0, z: cz - 6.4, rot: 0 },
          { type: 'reception', x: 0, z: cz + 2.4, rot: Math.PI },
          { type: 'planter', x: width / 2 - 2.2, z: cz + 5.2, rot: 0 },
        );
        for (const [x, z] of [[-3, cz - 2.4], [-1.4, cz - 2.4], [-2.2, cz - 1.0]]) {
          this.box(g, x, 0.6, z, 1.5, 1.2, 1.5, accent);
          this.frameCollider(frame, x, z, 1.6, 1.6, list);
        }
      }
      const lotGroups = [];
      for (const prop of props) {
        lotGroups.push(this._addProp(g, prop));
        const spec = Interiors.PROP_SPECS[prop.type];
        if (spec && spec.collide) {
          this.frameCollider(frame, prop.x, prop.z, spec.w, spec.d, list);
          const world = this.toWorld(frame, prop.x, prop.z);
          this.interiorFurniture[lotId].push({
            minX: world.x - spec.w / 2, maxX: world.x + spec.w / 2,
            minZ: world.z - spec.d / 2, maxZ: world.z + spec.d / 2,
          });
        }
      }
      this._registerFrameProps({ id: lotId, baseY: CURB_Y }, frame, props, 0, lotGroups);
      const lotDoor = this.toWorld(frame, 0, front);
      this._addSwingDoor({
        x: lotDoor.x, z: lotDoor.z, y: CURB_Y,
        yaw: frame.face === 1 ? 0 : Math.PI,
        width: doorW, height: doorH, label: `${def.name} doors`, buildingId: lotId,
      });
      this.indoorSpots.push({
        x: this.toWorld(frame, 0, cz + 5.2).x, z: this.toWorld(frame, 0, cz + 5.2).z,
        type: 'lot', lot: bizId, id: bizId, name: def.name,
        prompt: `${def.name} — counter & management`,
      });
    }
    // level stars on the yard sign
    this.box(g, 0, 1.1, 10, 0.15, 2.2, 0.15, this.mats.darkMetal);
    this.sign(g, [def.name, `${'★'.repeat(level)}${'☆'.repeat(MAX_BUSINESS_LEVEL - level)}`], 0, 2.1, 10.09, 5, 1.4, { bg: '#0f172a', fg: '#fde68a' });
    this.frameCollider(frame, 0, 10, 0.5, 0.5, list);
  }

  // ----- Metro Grand University (160m × 76m walk-in enterable 3D campus!) ----
  _addHollowShell({
    parent, minX, maxX, minZ, maxZ, height, doorX, doorW = 6.8, doorH = 4.6,
    wallMat, roofMat, trimMat, interiorFloorMat, ceilingLightColor = 0xfef3c7,
    doorLabel = 'University hall doors', buildingId = null, doorOpen = false,
  }) {
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const W = maxX - minX;
    const D = maxZ - minZ;
    const t = 0.65;
    const y0 = CURB_Y;

    // Walkable polished interior floor slab + coffered roof + warm illuminated ceiling panels
    this.box(parent, cx, y0 + 0.03, cz, W - 0.3, 0.06, D - 0.3, interiorFloorMat, { cast: false });
    this.box(parent, cx, y0 + height + 0.28, cz, W + 0.9, 0.56, D + 0.9, roofMat);
    this.box(parent, cx, y0 + height + 0.68, cz, W + 1.3, 0.26, D + 1.3, trimMat);

    const panelGlow = new THREE.MeshBasicMaterial({ color: ceilingLightColor });
    for (const px of [cx - W * 0.26, cx, cx + W * 0.26]) {
      for (const pz of [cz - D * 0.24, cz + D * 0.22]) {
        this.box(parent, px, y0 + height - 0.06, pz, 4.2, 0.08, 2.2, panelGlow, { cast: false, receive: false });
      }
    }

    // Back wall (North, minZ) + Left wall (West, minX) + Right wall (East, maxX)
    this.box(parent, cx, y0 + height * 0.5, minZ, W, height, t, wallMat);
    this.box(parent, minX, y0 + height * 0.5, cz, t, height, D, wallMat);
    this.box(parent, maxX, y0 + height * 0.5, cz, t, height, D, wallMat);

    this.addCollider(minX, maxX, minZ - t * 0.5, minZ + t * 0.5);
    this.addCollider(minX - t * 0.5, minX + t * 0.5, minZ, maxZ);
    this.addCollider(maxX - t * 0.5, maxX + t * 0.5, minZ, maxZ);

    // Split Front Wall (South, maxZ) leaving an open 6.8m walk-in doorway at `doorX`!
    const leftEnd = doorX - doorW * 0.5;
    const rightStart = doorX + doorW * 0.5;
    const leftW = Math.max(0.5, leftEnd - minX);
    const rightW = Math.max(0.5, maxX - rightStart);

    // Left & right front wall piers + large clear-glass display windows so players see inside from the quad!
    const winGlass = new THREE.MeshPhysicalMaterial({
      color: 0xbae6fd, transparent: true, opacity: 0.22, roughness: 0.06, metalness: 0.1, depthWrite: false,
    });
    for (const [segMin, segMax, segW] of [[minX, leftEnd, leftW], [rightStart, maxX, rightW]]) {
      const segCx = (segMin + segMax) * 0.5;
      if (segW > 7) {
        // Low stone sill + upper stone spandrel + wide clear glass window in the middle!
        this.box(parent, segCx, y0 + 0.65, maxZ, segW, 1.3, t, wallMat);
        this.box(parent, segCx, y0 + height - (height - 4.4) * 0.5, maxZ, segW, height - 4.4, t, wallMat);
        this.box(parent, segCx, y0 + 2.85, maxZ, segW - 1.6, 3.1, 0.12, winGlass, { cast: false });
        this.box(parent, segMin + 0.45, y0 + height * 0.5, maxZ, 0.9, height, t + 0.08, trimMat);
        this.box(parent, segMax - 0.45, y0 + height * 0.5, maxZ, 0.9, height, t + 0.08, trimMat);
      } else {
        this.box(parent, segCx, y0 + height * 0.5, maxZ, segW, height, t, wallMat);
      }
      this.addCollider(segMin, segMax, maxZ - t * 0.5, maxZ + t * 0.5);
    }

    // Lintel header above the open doorway + propped-open glass double doors!
    const lintelH = Math.max(0.6, height - doorH);
    this.box(parent, doorX, y0 + doorH + lintelH * 0.5, maxZ, doorW + 0.4, lintelH, t + 0.1, wallMat);
    this.box(parent, leftEnd, y0 + doorH * 0.5, maxZ, 0.35, doorH, t + 0.2, trimMat);
    this.box(parent, rightStart, y0 + doorH * 0.5, maxZ, 0.35, doorH, t + 0.2, trimMat);
    // Interactive hall doors — open & close them with E, just like any building
    this._addSwingDoor({
      x: doorX, z: maxZ, y: y0, yaw: 0, width: doorW, height: doorH,
      label: doorLabel, buildingId, open: doorOpen,
    });
    for (const sx of [-1, 1]) {
      // Exterior brass/stone pedestrian bollards (blocks vehicles from driving indoors while players walk right in!)
      const bx = doorX + sx * 1.65;
      const bz = maxZ + 2.6;
      this.box(parent, bx, y0 + 0.48, bz, 0.28, 0.96, 0.28, trimMat);
      this.addCollider(bx - 0.22, bx + 0.22, bz - 0.22, bz + 0.22);
    }

    this.interiorZones.push({
      minX: minX + 0.4,
      maxX: maxX - 0.4,
      minZ: minZ + 0.4,
      maxZ: maxZ - 0.2,
      ceilingY: y0 + height - 0.35,
    });
  }

  _buildUniversity() {
    const g = new THREE.Group();
    this.root.add(g);

    const limestone = new THREE.MeshStandardMaterial({
      map: this.windowPairs[1].map,
      normalMap: this.windowPairs[1].normalMap,
      roughness: 0.78,
      metalness: 0.08,
    });
    const stoneTrim = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.52, metalness: 0.08 });
    const royalRoof = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.45, metalness: 0.25 });
    const goldDomeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 });
    const marbleFloor = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.26, metalness: 0.08 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3e1e, roughness: 0.55, metalness: 0.06 });
    const greenLampMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    const labCyanMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // 1. Campus Grounds, Paved Driveway off 1st St (x=0, z=-157), Honor Quad Plaza & Wrought-Iron Fence
    this.box(g, 0, CURB_Y * 0.5, -196, 160, CURB_Y, 76, this.mats.plaza, { cast: false });
    // Central asphalt entry driveway connecting 1st St (z=-150) straight into the campus turnaround!
    this.box(g, 0, 0.024, -167, 15, 0.03, 22, this.mats.road, { cast: false });
    // Manicured emerald quad lawns flanking the central walkway
    for (const sx of [-1, 1]) {
      this.box(g, sx * 36, CURB_Y + 0.015, -175, 48, 0.03, 26, this.mats.grass, { cast: false });
    }

    // Perimeter wrought-iron & brick piers along 1st St (leaving wide 18m main gate open at x=0!)
    for (const [fMin, fMax] of [[-79, -10], [10, 79]]) {
      const fw = fMax - fMin;
      const fx = (fMin + fMax) * 0.5;
      this.box(g, fx, CURB_Y + 0.35, -158.5, fw, 0.7, 0.5, stoneTrim);
      this.box(g, fx, CURB_Y + 1.15, -158.5, fw, 0.9, 0.14, this.mats.darkMetal);
      this.addCollider(fMin, fMax, -158.9, -158.1);
    }
    // Side & rear campus boundary walls
    this.box(g, -79.5, CURB_Y + 0.9, -196, 0.6, 1.8, 75, stoneTrim);
    this.box(g, 79.5, CURB_Y + 0.9, -196, 0.6, 1.8, 75, stoneTrim);
    this.box(g, 0, CURB_Y + 0.9, -233.5, 160, 1.8, 0.6, stoneTrim);
    this.addCollider(-80, -79, -234, -158.5);
    this.addCollider(79, 80, -234, -158.5);
    this.addCollider(-80, 80, -234, -233);

    // Monumental Entrance Archway at (0, -158.5)
    for (const sx of [-1, 1]) {
      this.box(g, sx * 9.5, CURB_Y + 3.4, -158.5, 1.8, 6.8, 1.8, stoneTrim);
      this.addCollider(sx * 9.5 - 0.95, sx * 9.5 + 0.95, -159.4, -157.6);
    }
    this.box(g, 0, CURB_Y + 6.9, -158.5, 21.5, 1.3, 1.6, royalRoof);
    this.sign(
      g,
      ['METRO GRAND UNIVERSITY', '12 FACULTIES · 1,100+ ACADEMIC COURSES'],
      0, CURB_Y + 6.9, -157.62, 18.5, 1.15,
      { bg: '#1e3a8a', fg: '#fef08a', border: '#f59e0b' },
    );

    // Honor Quad Marble Fountain at (0, -177) + trees & campus benches
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.0, 0.78, 24), stoneTrim);
    basin.position.set(0, CURB_Y + 0.39, -177);
    basin.castShadow = true;
    g.add(basin);
    this.campusFountainWater = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.1, 24), this.mats.water);
    this.campusFountainWater.position.set(0, CURB_Y + 0.72, -177);
    g.add(this.campusFountainWater);
    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 3.2, 12), goldDomeMat);
    obelisk.position.set(0, CURB_Y + 1.8, -177);
    obelisk.castShadow = true;
    g.add(obelisk);
    this.addCollider(-5.1, 5.1, -182.1, -171.9);

    for (const [tx, tz] of [[-24, -168], [24, -168], [-48, -168], [48, -168], [-28, -184], [28, -184], [-68, -176], [68, -176]]) {
      this.tree(tx, tz, 1.15);
    }

    // 2. MAIN WALK-IN BUILDING: Chancellor's Clocktower & Grand Lecture Rotunda (68m × 36m, height 8.8m!)
    this._addHollowShell({
      parent: g,
      minX: -34, maxX: 34, minZ: -230, maxZ: -194,
      height: 8.8, doorX: 0, doorW: 7.2, doorH: 5.0,
      doorLabel: 'Chancellor Rotunda doors', buildingId: 'mgu-rotunda',
      wallMat: limestone, roofMat: royalRoof, trimMat: stoneTrim, interiorFloorMat: marbleFloor,
    });

    // Neoclassical 6-Column Portico + Pediment + 28m Illuminated Clocktower & Gold Dome!
    const colGeo = new THREE.CylinderGeometry(0.52, 0.58, 8.2, 16);
    for (const cx of [-12, -7.2, -4.1, 4.1, 7.2, 12]) {
      const col = new THREE.Mesh(colGeo, stoneTrim);
      col.position.set(cx, CURB_Y + 4.1, -191.2);
      col.castShadow = true;
      g.add(col);
      this.addCollider(cx - 0.6, cx + 0.6, -191.8, -190.6);
    }
    this.box(g, 0, CURB_Y + 8.55, -192.2, 27, 0.9, 4.2, stoneTrim);
    const pediment = new THREE.Mesh(new THREE.ConeGeometry(15.5, 3.2, 4), royalRoof);
    pediment.rotation.y = Math.PI / 4;
    pediment.scale.set(1.25, 1, 0.26);
    pediment.position.set(0, CURB_Y + 10.5, -191.9);
    g.add(pediment);
    this.sign(
      g,
      ['CHANCELLOR ROTUNDA & LECTURE HALL', 'WALK INSIDE · ADMISSIONS & EXAMS'],
      0, CURB_Y + 8.55, -190.02, 20, 1.1,
      { bg: '#0f172a', fg: '#fde68a', border: '#3b82f6' },
    );

    // Towering Campus Clocktower + Gold Dome atop Main Hall
    this.box(g, 0, CURB_Y + 15.2, -212, 9.5, 12.2, 9.5, stoneTrim);
    this.box(g, 0, CURB_Y + 21.8, -212, 10.6, 0.9, 10.6, royalRoof);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.8, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), goldDomeMat);
    dome.position.set(0, CURB_Y + 22.1, -212);
    g.add(dome);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.6, 8), goldDomeMat);
    spire.position.set(0, CURB_Y + 28.2, -212);
    g.add(spire);
    this.sign(g, ['12:00', 'M · G · U'], 0, CURB_Y + 17.5, -207.18, 5.2, 3.2, { bg: '#0f172a', fg: '#fef08a', border: '#f59e0b' });

    // --- Main Rotunda Interior Furnishings ---
    // (a) Left Lobby: Admissions & Registrar Desk (-18, -203)
    this.box(g, -18, CURB_Y + 0.62, -203, 7.6, 1.15, 1.4, woodMat);
    this.box(g, -18, CURB_Y + 1.24, -203, 7.9, 0.1, 1.65, stoneTrim);
    this.sign(
      g,
      ['REGISTRAR & ADMISSIONS', '1,105 REAL-WORLD COURSES'],
      -18, CURB_Y + 3.4, -205.5, 7.4, 1.5,
      { bg: '#1e3a8a', fg: '#ffffff', border: '#f59e0b' },
    );
    this.addCollider(-21.9, -14.1, -203.8, -202.2);

    // (b) Right Lobby: Hall of Honours & Degree Diploma Showcase (+18, -203)
    this.box(g, 18, CURB_Y + 0.62, -203, 7.6, 1.15, 1.4, woodMat);
    this.sign(
      g,
      ['HONOURS & TRANSCRIPTS', 'BSc · BA · BEng · LLB · MBBS · MBA · PhD'],
      18, CURB_Y + 3.4, -205.5, 8.2, 1.5,
      { bg: '#0f172a', fg: '#fde68a', border: '#f59e0b' },
    );
    this.addCollider(14.1, 21.9, -203.8, -202.2);

    // (c) Center Lecture Amphitheatre: Stage, Lectern, Live 3D Smartboard & 3 Rows of Lecture Desks!
    this.box(g, 0, CURB_Y + 0.28, -225.2, 22, 0.5, 5.4, woodMat); // raised stage platform
    this.box(g, 0, CURB_Y + 1.15, -223.4, 1.5, 1.25, 0.9, woodMat); // professor lectern

    // Giant Live-Updating 3D Lecture Smartboard on North Amphitheatre Wall!
    if (typeof document !== 'undefined') {
      const bc = document.createElement('canvas');
      bc.width = 768; bc.height = 256;
      const bg = bc.getContext('2d');
      const bTex = new THREE.CanvasTexture(bc);
      bTex.colorSpace = THREE.SRGBColorSpace;
      const bMat = new THREE.MeshBasicMaterial({ map: bTex });
      const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 4.4), bMat);
      boardMesh.position.set(0, CURB_Y + 4.2, -229.45);
      g.add(boardMesh);
      this.box(g, 0, CURB_Y + 4.2, -229.55, 15.1, 4.9, 0.14, this.mats.darkMetal, { cast: false });
      this.lectureBoard = { canvas: bc, ctx: bg, tex: bTex };
      this.updateLectureBoard({
        venue: 'Main Rotunda Amphitheatre',
        window: '08:00–10:00',
        course: { code: 'CSC-301', title: 'BSc Computer Science', facultyName: 'Computer Science, AI & Cybersecurity' },
      });
    }

    // 3 rows × 2 banks of Amphitheatre lecture desks & benches (central aisle kept wide open for walking!)
    for (const rowZ of [-218.5, -214.5, -210.5]) {
      for (const bankX of [-7.5, 7.5]) {
        this.box(g, bankX, CURB_Y + 0.78, rowZ, 7.4, 0.1, 0.95, woodMat);
        this.box(g, bankX, CURB_Y + 0.4, rowZ, 7.0, 0.76, 0.14, this.mats.darkMetal);
        this.box(g, bankX, CURB_Y + 0.46, rowZ + 0.85, 7.2, 0.1, 0.5, woodMat);
        this.addCollider(bankX - 3.7, bankX + 3.7, rowZ - 0.5, rowZ + 1.1);
      }
    }

    // 3. WEST WALK-IN WING: Grand University Library & Reading Hall (-74..-40, -226..-194, height 7.8m!)
    this._addHollowShell({
      parent: g,
      minX: -74, maxX: -40, minZ: -226, maxZ: -194,
      height: 7.8, doorX: -57, doorW: 6.4, doorH: 4.5,
      doorLabel: 'Grand Library doors', buildingId: 'mgu-library',
      wallMat: limestone, roofMat: royalRoof, trimMat: stoneTrim, interiorFloorMat: marbleFloor,
    });
    this.sign(
      g,
      ['WEST GRAND LIBRARY', 'QUIET STUDY & RESEARCH'],
      -57, CURB_Y + 6.4, -193.55, 13.5, 1.15,
      { bg: '#7c2d12', fg: '#fef3c7', border: '#f59e0b' },
    );
    // 6 Tall Mahogany 3D Bookshelf Stacks with colorful book-row bands + Reading Tables w/ Green Banker's Lamps!
    const bookColors = [
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 }),
    ];
    for (const sx of [-69, -45]) {
      for (const sz of [-221, -213, -205]) {
        this.box(g, sx, CURB_Y + 2.1, sz, 1.3, 4.2, 5.2, woodMat);
        for (let shelf = 0; shelf < 4; shelf++) {
          this.box(g, sx, CURB_Y + 0.75 + shelf * 0.95, sz, 1.38, 0.52, 4.8, bookColors[(shelf + Math.abs(sz)) % 4]);
        }
        this.addCollider(sx - 0.75, sx + 0.75, sz - 2.65, sz + 2.65);
      }
    }
    for (const rz of [-218, -206]) {
      this.box(g, -57, CURB_Y + 0.78, rz, 6.2, 0.12, 2.2, woodMat);
      this.box(g, -55.4, CURB_Y + 1.05, rz, 0.55, 0.35, 0.35, greenLampMat, { cast: false });
      this.box(g, -58.6, CURB_Y + 1.05, rz, 0.55, 0.35, 0.35, greenLampMat, { cast: false });
      this.addCollider(-60.1, -53.9, rz - 1.15, rz + 1.15);
    }

    // 4. EAST WALK-IN WING: Science, Engineering, AI & Medical Hall (40..74, -226..-194, height 7.8m!)
    this._addHollowShell({
      parent: g,
      minX: 40, maxX: 74, minZ: -226, maxZ: -194,
      height: 7.8, doorX: 57, doorW: 6.4, doorH: 4.5,
      doorLabel: 'Science & Medical Hall doors', buildingId: 'mgu-science',
      wallMat: limestone, roofMat: royalRoof, trimMat: stoneTrim, interiorFloorMat: marbleFloor,
      ceilingLightColor: 0xe0f2fe,
    });
    this.sign(
      g,
      ['SCIENCE, AI & MEDICAL HALL', 'ENGINEERING · CS · MEDICINE LABS'],
      57, CURB_Y + 6.4, -193.55, 14.5, 1.15,
      { bg: '#0f766e', fg: '#ecfeff', border: '#38bdf8' },
    );
    // Glowing Stainless/Cyan Laboratory Workbenches & High-Performance AI Server Racks inside East Wing!
    for (const lx of [46, 68]) {
      for (const lz of [-220, -211, -203]) {
        this.box(g, lx, CURB_Y + 0.55, lz, 2.2, 1.05, 4.6, stoneTrim);
        this.box(g, lx, CURB_Y + 1.12, lz, 2.35, 0.08, 4.8, this.mats.darkMetal);
        this.box(g, lx, CURB_Y + 1.52, lz, 0.35, 0.65, 1.8, labCyanMat, { cast: false });
        this.addCollider(lx - 1.2, lx + 1.2, lz - 2.4, lz + 2.4);
      }
    }

    // Covered Colonnade Breezeways linking West Library <-> Main Rotunda <-> East Science Hall
    for (const bx of [-37, 37]) {
      this.box(g, bx, CURB_Y + 4.8, -208, 6.2, 0.5, 8.0, royalRoof);
    }

    // 5. Interactive Glowing Campus Pads (inside the walk-in halls + courtyard directory!)
    const uniColor = new THREE.Color(UNIVERSITY.color);
    const goldColor = new THREE.Color(UNIVERSITY.accent);
    const rawSpots = [
      { id: 'quad',         x: 0,   z: -169.5, mode: 'catalog',       color: uniColor,  prompt: 'Press E — Metro Grand University Portal (1,105 Courses)' },
      { id: 'registrar',    x: -18, z: -200.2, mode: 'catalog',       color: uniColor,  prompt: 'Press E — Admissions & 1,105 Real-World Course Catalog' },
      { id: 'amphitheatre', x: 0,   z: -220.8, mode: 'classroom',     color: goldColor, prompt: 'Press E — Attend Live Lecture (+1 Credit) or Sit Final Exam' },
      { id: 'library',      x: -57, z: -212.0, mode: 'study_library', color: goldColor, prompt: 'Press E — Library Research Session (+1 Credit) & Course Portal' },
      { id: 'lab',          x: 57,  z: -212.0, mode: 'study_lab',     color: uniColor,  prompt: 'Press E — Science / AI / Medical Lab Session (+1 Credit)' },
    ];
    for (const sp of rawSpots) {
      const pad = this._marker(sp.color);
      pad.position.set(sp.x, CURB_Y + 0.08, sp.z);
      this.root.add(pad);
      this.stationMarkers.push(pad);
      this.universitySpots.push(sp);
    }
    UNIVERSITY.interact = { x: 0, z: -169.5 };
    UNIVERSITY.spots = this.universitySpots;
  }

  updateLectureBoard(scheduleItem) {
    if (!this.lectureBoard || !scheduleItem?.course) return;
    const key = `${scheduleItem.window}:${scheduleItem.course.id}`;
    if (key === this._lastBoardKey) return;
    this._lastBoardKey = key;
    const { ctx: g2, tex } = this.lectureBoard;
    const c = scheduleItem.course;
    g2.fillStyle = '#091526';
    g2.fillRect(0, 0, 768, 256);
    g2.strokeStyle = '#f59e0b';
    g2.lineWidth = 8;
    g2.strokeRect(10, 10, 748, 236);
    g2.fillStyle = '#fbbf24';
    g2.font = 'bold 26px system-ui, sans-serif';
    g2.textAlign = 'center';
    g2.fillText(`METRO GRAND UNIVERSITY · LIVE LECTURE (${scheduleItem.window})`, 384, 54);
    g2.fillStyle = '#ffffff';
    g2.font = 'bold 42px system-ui, sans-serif';
    g2.fillText(`${c.code}: ${c.title}`.slice(0, 44), 384, 128);
    g2.fillStyle = '#93c5fd';
    g2.font = 'bold 24px system-ui, sans-serif';
    g2.fillText(`Faculty of ${c.facultyName} · Walk up & press [E] to attend`, 384, 196);
    tex.needsUpdate = true;
  }
  // ----- street lamps at the 25 intersections (feature 11) -------------------
  _buildStreetLamps() {
    const fxTex = getFXTextures();
    this.lampBulbMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
    this.lampHaloMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.lampFlareMat = new THREE.SpriteMaterial({
      map: fxTex.flareWhite,
      color: 0xfde68a,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const haloGeo = new THREE.ConeGeometry(2.4, 5.8, 12, 1, true);
    for (const rx of ROAD_LINES) {
      for (const rz of ROAD_LINES) {
        const sx = rx >= 150 ? -1 : 1;
        const sz = rz >= 150 ? -1 : 1;
        const px = rx + sx * (ROAD_HALF + 1.4);
        const pz = rz + sz * (ROAD_HALF + 1.4);
        const g = new THREE.Group();
        g.position.set(px, CURB_Y, pz);
        // Pole + overhang arm toward intersection centre
        this.box(g, 0, 3.0, 0, 0.16, 6.0, 0.16, this.mats.darkMetal);
        this.box(g, -sx * 0.65, 6.0, 0, 1.46, 0.1, 0.1, this.mats.darkMetal, { cast: false });
        this.box(g, -sx * 1.3, 6.0, -sz * 0.65, 0.1, 0.1, 1.4, this.mats.darkMetal, { cast: false });
        this.box(g, -sx * 1.3, 6.02, -sz * 1.3, 0.46, 0.12, 0.46, this.mats.metal, { cast: false });
        this.box(g, -sx * 1.3, 5.92, -sz * 1.3, 0.34, 0.08, 0.34, this.lampBulbMat, { cast: false, receive: false });
        const halo = new THREE.Mesh(haloGeo, this.lampHaloMat);
        halo.position.set(-sx * 1.3, 3.0, -sz * 1.3);
        const flare = new THREE.Sprite(this.lampFlareMat);
        flare.position.set(-sx * 1.3, 5.82, -sz * 1.3);
        flare.scale.set(2.3, 2.3, 1);
        g.add(halo, flare);
        this.root.add(g);
        this.addCollider(px - 0.18, px + 0.18, pz - 0.18, pz + 0.18);
        this.streetLamps.push({
          x: px - sx * 1.3,
          y: CURB_Y + 5.75,
          z: pz - sz * 1.3,
        });
      }
    }
    for (let i = 0; i < STREET_LAMP_POOL; i++) {
      const light = new THREE.PointLight(0xffdca8, 0, 38, 1.55);
      light.castShadow = false;
      light.visible = false;
      this.root.add(light);
      this.lampLights.push(light);
    }
  }

  /**
   * Update nocturnal city visuals: window emissive glow, fuel station signs/canopies,
   * street lamp bulbs/cones, and the <=8 pooled PointLights nearest `(focusX, focusZ)`.
   */
  setDayNight(nightFactor, lampFactor, focusX = 0, focusZ = 0) {
    this._nightFactor = nightFactor;
    const winInt = nightFactor * 0.95;
    for (const m of this.windowMats) m.emissiveIntensity = winInt;
    for (const m of Object.values(this.lotWindowMats)) if (m) m.emissiveIntensity = winInt;
    for (const fg of this.fuelGlowMats) {
      fg.canopy.emissiveIntensity = nightFactor * 0.55;
      fg.ceilingGlow.opacity = 0.12 + nightFactor * 0.72;
    }
    if (this.lampBulbMat) {
      this.lampBulbMat.color.setHex(lampFactor > 0.15 ? 0xfef08a : 0x64748b);
      this.lampHaloMat.opacity = lampFactor * 0.085;
      this.lampHaloMat.visible = lampFactor > 0.04;
    }
    if (this.lampFlareMat) {
      this.lampFlareMat.opacity = lampFactor * 0.85;
    }
    if (!this.lampLights.length) return;
    if (lampFactor <= 0.04) {
      if (this._lastLampFocus.factor > 0.04) {
        for (const l of this.lampLights) { l.visible = false; l.intensity = 0; }
        this._lastLampFocus.factor = 0;
      }
      return;
    }
    const moved = (focusX - this._lastLampFocus.x) ** 2 + (focusZ - this._lastLampFocus.z) ** 2 > 16;
    if (moved || this._lastLampFocus.factor <= 0.04) {
      this._lastLampFocus.x = focusX;
      this._lastLampFocus.z = focusZ;
      const ranked = this.streetLamps
        .map((lp) => ({ lp, d2: (lp.x - focusX) ** 2 + (lp.z - focusZ) ** 2 }))
        .sort((a, b) => a.d2 - b.d2);
      for (let i = 0; i < this.lampLights.length; i++) {
        const pick = ranked[i]?.lp;
        if (pick) this.lampLights[i].position.set(pick.x, pick.y, pick.z);
      }
    }
    this._lastLampFocus.factor = lampFactor;
    const intensity = 2.8 * lampFactor;
    for (const l of this.lampLights) {
      l.visible = true;
      l.intensity = intensity;
    }
  }

  // ----- outskirts -------------------------------------------------------------
  _buildOutskirts() {
    const r = this.rand;
    for (let i = 0; i < 90; i++) {
      const ang = r() * Math.PI * 2;
      const dist = 168 + r() * 26;
      const x = Math.cos(ang) * dist * 1.1;
      const z = Math.sin(ang) * dist * 1.1;
      if (Math.max(Math.abs(x), Math.abs(z)) < 165) continue;
      // Keep the North Metro Grand University Campus clear of random outskirts trees!
      if (x > -90 && x < 90 && z < -154) continue;
      // Keep the South Waterfront civic district clear too
      if (z > 150 && z < 248 && x > -172 && x < 172) continue;
      this.tree(Math.max(-236, Math.min(236, x)), Math.max(-236, Math.min(236, z)), 1 + r() * 0.8);
    }
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2;
      const dist = 305 + r() * 45;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(40 + r() * 30, 25 + r() * 35, 7), this.mats.hill);
      hill.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      this.root.add(hill);
    }
  }

  // ----- sidewalk navigation graph (for pedestrians) --------------------------
  _buildSidewalkGraph() {
    const nodes = [];
    const index = new Map();
    const key = (x, z) => `${x.toFixed(1)},${z.toFixed(1)}`;
    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const n = { id: nodes.length, x: bx + sx * SIDEWALK_RING, z: bz + sz * SIDEWALK_RING, links: [] };
            index.set(key(n.x, n.z), n);
            nodes.push(n);
          }
        }
      }
    }
    const link = (a, b) => { if (a && b && !a.links.includes(b.id)) { a.links.push(b.id); b.links.push(a.id); } };
    const span = SIDEWALK_RING * 2;
    const cross = 75 - span;
    for (const n of nodes) {
      link(n, index.get(key(n.x + span, n.z)));
      link(n, index.get(key(n.x, n.z + span)));
      link(n, index.get(key(n.x + cross, n.z)));
      link(n, index.get(key(n.x, n.z + cross)));
    }
    // Remove sidewalk links that would pass through block contents: same-block edges run along the ring, so they are fine.
    this.navNodes = nodes;
  }

  nearestNavNode(x, z) {
    let best = null; let bd = Infinity;
    for (const n of this.navNodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  findPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = new Map([[fromId, -1]]);
    const queue = [fromId];
    while (queue.length) {
      const id = queue.shift();
      if (id === toId) break;
      for (const nb of this.navNodes[id].links) {
        if (!prev.has(nb)) { prev.set(nb, id); queue.push(nb); }
      }
    }
    if (!prev.has(toId)) return [fromId];
    const path = [];
    for (let id = toId; id !== -1; id = prev.get(id)) path.unshift(id);
    return path;
  }

  // ----- queries ---------------------------------------------------------------
  inDistrict(x, z) {
    return z > MAP_EDGE && z <= DISTRICT.maxZ + 4 && x >= DISTRICT.minX && x <= DISTRICT.maxX;
  }

  isOnRoad(x, z) {
    if (this.inDistrict(x, z)) {
      if (Math.abs(z - DISTRICT.avenueZ) < ROAD_HALF + 0.6) return true;
      // the avenues stop at the beachfront promenade
      if (z < DISTRICT.promenadeZ - 1 && ROAD_LINES.some((r) => Math.abs(x - r) < ROAD_HALF + 0.6)) return true;
      return false;
    }
    if (Math.abs(x) > MAP_EDGE || Math.abs(z) > MAP_EDGE) return false;
    for (const r of ROAD_LINES) if (Math.abs(x - r) < ROAD_HALF || Math.abs(z - r) < ROAD_HALF) return true;
    return false;
  }

  groundY(x, z) {
    // Metro Grand University Campus grounds & walk-in halls (North of 1st St)
    if (x >= -80 && x <= 80 && z >= -234 && z <= -157) {
      if (Math.abs(x) < 7.5 && z > -178) return 0; // entry driveway off 1st St
      return CURB_Y;
    }
    // South Waterfront civic district (hotel, hospital, museum, mall, gym, library)
    if (this.inDistrict(x, z)) return this.isOnRoad(x, z) ? 0 : CURB_Y;
    if (Math.abs(x) > MAP_EDGE || Math.abs(z) > MAP_EDGE) return 0;
    return this.isOnRoad(x, z) ? 0 : CURB_Y;
  }

  ceilingY(x, z) {
    for (const zc of this.interiorZones) {
      if (x >= zc.minX && x <= zc.maxX && z >= zc.minZ && z <= zc.maxZ) {
        return zc.ceilingY;
      }
    }
    return null;
  }

  allColliders() {
    let out = this.colliders;
    for (const list of Object.values(this.dynamicColliders)) out = out.concat(list);
    return out;
  }

  /** Roof-parapet / upper-storey colliders that only apply near a given elevation. */
  upperCollidersAt(feetY) {
    if (!this.upperColliders.length) return EMPTY_COLLIDERS;
    let out = null;
    for (const c of this.upperColliders) {
      if (feetY >= (c.minY ?? 0) - 0.35 && feetY <= (c.maxY ?? Infinity)) (out || (out = [])).push(c);
    }
    return out || EMPTY_COLLIDERS;
  }

  /** Furniture colliders on the storey a player is standing on. */
  interiorCollidersFor(id, level) {
    const b = this.buildingById(id);
    if (!b) return EMPTY_COLLIDERS;
    if (b.kind === 'tower') {
      const active = this._activeFloor;
      if (active && active.id === id && active.level === level) return active.colliders;
      return Interiors.propColliders(Interiors.floorLayout(b, level));
    }
    return this.interiorFurniture[id] || EMPTY_COLLIDERS;
  }

  /** Nearest lift landing to a world point, inside a walk-in tower. */
  towerLiftNear(x, z) {
    const inside = this.buildingAt(x, z);
    if (!inside || inside.building.kind !== 'tower') return null;
    const landing = this.elevatorLanding(inside.building);
    return { building: inside.building, landing, dist: Math.hypot(landing.x - x, landing.z - z) };
  }

  interiorSpotsNear(x, z, radius = 3.4) {
    const r2 = radius * radius;
    return this.indoorSpots.filter((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < r2);
  }

  rebuildColliderCache() { this._cache = this.allColliders(); }
  get colliderCache() { if (!this._cache) this.rebuildColliderCache(); return this._cache; }

  // Address label like "Broad Ave & 2nd St" or campus hall name
  addressFor(x, z) {
    if (x >= -80 && x <= 80 && z < -158) {
      if (z < -193 && x >= -34 && x <= 34) return 'Chancellor Rotunda · MGU';
      if (z < -193 && x < -38) return 'West Grand Library · MGU';
      if (z < -193 && x > 38) return 'Science & Medical Hall · MGU';
      return 'Metro Grand University Quad';
    }
    let bi = 0; let bj = 0;
    ROAD_LINES.forEach((r, i) => { if (Math.abs(x - r) < Math.abs(x - ROAD_LINES[bi])) bi = i; });
    ROAD_LINES.forEach((r, j) => { if (Math.abs(z - r) < Math.abs(z - ROAD_LINES[bj])) bj = j; });
    return `${STREET_NAMES_X[bi]} & ${STREET_NAMES_Z[bj]}`;
  }

  update(t, dt = 0) {
    if (dt > 0) this.updateDoors(dt);
    if (this._tv && this._tv.active.size) {
      const tv = this._tv;
      tv.acc += dt;
      tv.channelT += dt;
      if (tv.channelT > 16) { tv.channelT = 0; tv.channel = (tv.channel + 1) % 4; }
      if (tv.acc >= 0.1) {
        tv.acc = 0;
        const mode = ['news', 'sports', 'cartoon', 'movie'][tv.channel];
        this._drawScreen(tv.tv, mode, t);
        this._drawScreen(tv.cinema, 'movie', t);
        tv.tv.texture.needsUpdate = true;
        tv.cinema.texture.needsUpdate = true;
      }
    }
    for (const m of this.stationMarkers) {
      m.material.opacity = 0.55 + Math.sin(t * 3) * 0.3;
      m.rotation.z = t * 0.6;
    }
    if (this.fountainWater) this.fountainWater.position.y = 0.75 + Math.sin(t * 2) * 0.03;
    if (this.campusFountainWater) this.campusFountainWater.position.y = CURB_Y + 0.72 + Math.sin(t * 2.2) * 0.03;
  }
}

const EMPTY_COLLIDERS = Object.freeze([]);

// Collision helper: push a circle (x,z,r) out of a list of AABBs. Returns {x,z,hit,nx,nz}.
export function resolveCircle(x, z, r, colliders) {
  let hit = false; let nx = 0; let nz = 0;
  for (const c of colliders) {
    if (x + r < c.minX || x - r > c.maxX || z + r < c.minZ || z - r > c.maxZ) continue;
    const px = Math.max(c.minX, Math.min(x, c.maxX));
    const pz = Math.max(c.minZ, Math.min(z, c.maxZ));
    let dx = x - px; let dz = z - pz;
    let d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 < 1e-8) {
      // centre inside the box: push out along the shallowest axis
      const left = x - c.minX; const right = c.maxX - x; const top = z - c.minZ; const bottom = c.maxZ - z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) { dx = -1; dz = 0; x = c.minX - r; } else if (m === right) { dx = 1; dz = 0; x = c.maxX + r; } else if (m === top) { dx = 0; dz = -1; z = c.minZ - r; } else { dx = 0; dz = 1; z = c.maxZ + r; }
      nx += dx; nz += dz; hit = true;
      continue;
    }
    const d = Math.sqrt(d2);
    const push = r - d;
    x += (dx / d) * push;
    z += (dz / d) * push;
    nx += dx / d; nz += dz / d;
    hit = true;
  }
  const nl = Math.hypot(nx, nz) || 1;
  return { x, z, hit, nx: nx / nl, nz: nz / nl };
}
