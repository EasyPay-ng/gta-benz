// MetroVenture 3D — procedural city: roads, sidewalks, blocks, buildings, lots, stations.
import * as THREE from 'three';
import {
  ROAD_LINES, ROAD_HALF, SIDEWALK_W, BLOCK_HALF, SIDEWALK_RING, BLOCK_CENTERS, BUSINESSES,
  STATIONS, DEALERSHIP, BOUTIQUE, UNIVERSITY, FUEL_STATIONS, STREET_NAMES_X, STREET_NAMES_Z, MAX_BUSINESS_LEVEL,
  STREET_LAMP_POOL,
} from './data.js';
import { mulberry32 } from './economy.js';
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
    const spots = [[-13, -13], [13, -13], [-13, 13], [13, 13]];
    for (const [lx, lz] of spots) {
      if (r() < 0.15) { const p = this.toWorld(frame, lx, lz); this.tree(p.x, p.z, 1.2); continue; }
      const w = 14 + r() * 8;
      const d = 14 + r() * 8;
      const h = 12 + r() * (Math.abs(frame.x) < 80 ? 50 : 30);
      const p = this.toWorld(frame, lx, lz);
      const pair = this.windowPairs[Math.floor(r() * this.windowPairs.length)];
      const rx = Math.max(1, Math.round(w / 6));
      const ry = Math.max(1, Math.round(h / 6));
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
      const roof = this.mats.roofDark;
      const m = new THREE.Mesh(this.boxGeo, [mat, mat, roof, roof, mat, mat]);
      m.scale.set(w, h, d);
      m.position.set(p.x, CURB_Y + h / 2, p.z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
      // Projecting rooftop cornice parapet + HVAC mechanical unit
      this.box(this.root, p.x, CURB_Y + h + 0.22, p.z, w + 0.55, 0.44, d + 0.55, this.mats.darkMetal);
      if (r() < 0.55) this.box(this.root, p.x, CURB_Y + h + 1.35, p.z, w * 0.38, 1.9, d * 0.38, this.mats.darkMetal);
      this.addCollider(p.x - w / 2, p.x + w / 2, p.z - d / 2, p.z + d / 2);
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
    // benches
    for (const [lx, lz, rot] of [[-4, 9, 0], [4, -9, Math.PI], [9, 4, Math.PI / 2], [-9, -4, -Math.PI / 2]]) {
      const b = new THREE.Group();
      b.position.set(lx, 0, lz); b.rotation.y = rot;
      this.box(b, 0, 0.45, 0, 2.2, 0.1, 0.6, this.mats.trunk);
      this.box(b, 0, 0.8, -0.28, 2.2, 0.6, 0.08, this.mats.trunk);
      this.box(b, -0.9, 0.22, 0, 0.1, 0.45, 0.5, this.mats.darkMetal);
      this.box(b, 0.9, 0.22, 0, 0.1, 0.45, 0.5, this.mats.darkMetal);
      g.add(b);
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
    });
    this.windowMats.push(wallMat);
    const trimMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });
    // building footprint local x[-10,10] z[-16,-2]
    this.box(g, 0, 3.5, -9, 20, 7, 14, wallMat);
    this.box(g, 0, 7.2, -9, 20.6, 0.5, 14.6, trimMat);
    this.box(g, 0, 1.6, -1.95, 4, 3.2, 0.2, this.mats.glass);             // door
    this.box(g, -6, 3.2, -1.95, 5, 2.4, 0.2, this.mats.glass);            // windows
    this.box(g, 6, 3.2, -1.95, 5, 2.4, 0.2, this.mats.glass);
    this.box(g, 0, 4.4, -1.4, 21, 0.3, 1.4, trimMat);                     // awning
    this.sign(g, [st.name.toUpperCase(), 'NOW HIRING'], 0, 5.9, -1.84, 14, 1.9, { bg: st.color, fg: st.id === 'cab' ? '#111827' : '#ffffff' });
    this.frameCollider(frame, 0, -9, 20.6, 14.6);
    // station props
    if (st.id === 'courier') {
      for (const [x, z] of [[12, -4], [13, -6], [12.4, -8]]) this.box(g, x, 0.4, z, 1, 0.8, 1, new THREE.MeshStandardMaterial({ color: 0xb7884e, roughness: 0.85 }));
      this.frameCollider(frame, 12.5, -6, 2.5, 6);
    } else if (st.id === 'security') {
      this.box(g, 13, 4, -3, 0.2, 8, 0.2, this.mats.metal);
      this.box(g, 13.8, 7.3, -3, 1.6, 1, 0.05, new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }));
      this.frameCollider(frame, 13, -3, 0.6, 0.6);
    } else if (st.id === 'cab') {
      // painted parking bays
      for (const x of [-12, -6, 6, 12]) this.box(g, x, 0.02, 8, 0.2, 0.02, 5, this.mats.white, { cast: false });
    }
    // glowing interaction pad
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

    // 2-story Art-Deco obsidian flagship building + gold pilasters
    this.box(g, 0, 4.6, -9, 26, 9.2, 13, obsidian);
    this.frameCollider(frame, 0, -9, 26.4, 13.4);
    this.box(g, 0, 9.35, -9, 26.8, 0.38, 13.8, goldMat);
    this.box(g, 0, 4.9, -2.35, 26.4, 0.22, 0.35, goldMat);
    this.box(g, 0, 9.58, -2.15, 26.8, 0.09, 0.14, neonPink, { cast: false });

    for (const px of [-12.6, -5.2, 5.2, 12.6]) {
      this.box(g, px, 4.6, -2.35, 0.55, 9.2, 0.55, goldMat);
    }

    // Illuminated window display alcoves + panoramic boutique glass
    for (const wx of [-8.8, 8.8]) {
      this.box(g, wx, 2.2, -2.55, 6.2, 3.8, 0.12, warmBackdrop, { cast: false });
      this.box(g, wx, 2.2, -2.15, 6.4, 3.9, 0.08, this.mats.glass, { cast: false });
    }
    // Central grand glass double doors + gold awning canopy
    this.box(g, 0, 2.1, -2.38, 3.6, 4.0, 0.12, this.mats.glass, { cast: false });
    this.box(g, 0, 4.25, -0.8, 6.2, 0.24, 3.2, goldMat);

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
      const tower = new THREE.Mesh(this.boxGeo, [glassMat, glassMat, accent, accent, glassMat, glassMat]);
      const th = h * 1.6 + 4;
      tower.scale.set(width * 0.8, th, depth);
      tower.position.set(0, th / 2, cz);
      tower.castShadow = tower.receiveShadow = true;
      g.add(tower);
      this.box(g, 0, th + 0.6, cz, width * 0.4, 1.2, depth * 0.5, accent);
      this.box(g, 0, 1.6, cz + depth / 2 + 0.02, 5, 3.2, 0.2, this.mats.glass);
      this.sign(g, ['BYTEFORGE', `Tech Startup · Lv ${level}`], 0, th - 2, cz + depth / 2 + 0.06, 12, 2.2, { bg: '#1e1b4b', fg: '#22d3ee' });
      // server racks
      for (const x of [5, 7]) this.box(g, x, 1, 7.5, 1.2, 2, 0.9, this.mats.darkMetal);
      this.frameCollider(frame, 6, 7.5, 3.4, 1.2, list);
      this.frameCollider(frame, 0, cz, width * 0.8 + 0.4, depth + 0.4, list);
    } else {
      this.box(g, 0, h / 2, cz, width, h, depth, wall);
      this.box(g, 0, h + 0.25, cz, width + 0.6, 0.5, depth + 0.6, main);
      // colour band per floor
      for (let f = 0; f < floors; f++) this.box(g, 0, f * floorH + floorH, cz + depth / 2 + 0.05, width + 0.1, 0.25, 0.1, main);
      if (bizId === 'garage') {
        for (const x of [-5, 5]) {
          this.box(g, x, 1.9, cz + depth / 2 + 0.06, 7, 3.8, 0.1, this.mats.darkMetal);
          for (let y = 0.4; y < 3.8; y += 0.5) this.box(g, x, y, cz + depth / 2 + 0.12, 7, 0.06, 0.04, this.mats.metal);
        }
        // car lift + tyre stacks
        this.box(g, -6, 0.15, 7, 3, 0.3, 5, this.mats.metal);
        for (const [x, z] of [[12, -3], [12, -1.6]]) {
          const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.18, 6, 12), this.mats.darkMetal);
          tyre.rotation.x = Math.PI / 2; tyre.position.set(x, 0.2, z); g.add(tyre);
        }
        this.sign(g, ['APEX AUTO', `Garage · Lv ${level}`], 0, h - 0.9, cz + depth / 2 + 0.12, 10, 1.6, { bg: def.color });
      } else if (bizId === 'diner') {
        for (let i = 0; i < 8; i++) {
          this.box(g, -width / 2 + width / 16 + (i * width) / 8, 3.6, cz + depth / 2 + 1, width / 8, 0.15, 2, i % 2 ? accent : wall);
        }
        this.box(g, 0, 1.7, cz + depth / 2 + 0.06, width - 4, 2.2, 0.15, this.mats.glass);
        // patio tables
        for (const x of [-8, 8]) {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 14), wall);
          t.position.set(x, 0.85, 3); t.castShadow = true; g.add(t);
          this.box(g, x, 0.42, 3, 0.1, 0.84, 0.1, this.mats.darkMetal);
          this.frameCollider(frame, x, 3, 1.6, 1.6, list);
        }
        this.sign(g, ['METRO FRESH', `Diner · Lv ${level}`], 0, h - 0.9, cz + depth / 2 + 0.12, 10, 1.6, { bg: def.color });
      } else if (bizId === 'logistics') {
        for (const x of [-7, 0, 7]) this.box(g, x, 1.9, cz + depth / 2 + 0.06, 5, 3.4, 0.1, this.mats.darkMetal);
        this.box(g, 0, 0.6, cz + depth / 2 + 1, width, 1.2, 2, this.mats.plaza);
        // cargo stacks
        for (const [x, z] of [[12, -6], [12.5, -8], [12, -10]]) this.box(g, x, 0.6, z, 1.6, 1.2, 1.6, accent);
        this.frameCollider(frame, 12.2, -8, 2.4, 6, list);
        this.sign(g, ['SWIFTCARGO', `Logistics Hub · Lv ${level}`], 0, h - 0.9, cz + depth / 2 + 0.12, 11, 1.6, { bg: def.color, fg: '#111827' });
      }
      this.frameCollider(frame, 0, cz + (bizId === 'logistics' ? 1 : 0), width + 0.6, depth + 0.6 + (bizId === 'logistics' ? 2 : 0), list);
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
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(doorX + sx * (doorW * 0.5 - 0.2), y0, maxZ + 0.1);
      leaf.rotation.y = sx * 1.18; // swung wide open invitingly!
      this.box(leaf, -sx * 0.85, doorH * 0.46, 0, 1.7, doorH * 0.9, 0.08, winGlass, { cast: false });
      this.box(leaf, -sx * 0.85, doorH * 0.46, 0, 1.74, 0.1, 0.1, trimMat, { cast: false });
      parent.add(leaf);
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
  isOnRoad(x, z) {
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

  update(t) {
    for (const m of this.stationMarkers) {
      m.material.opacity = 0.55 + Math.sin(t * 3) * 0.3;
      m.rotation.z = t * 0.6;
    }
    if (this.fountainWater) this.fountainWater.position.y = 0.75 + Math.sin(t * 2) * 0.03;
    if (this.campusFountainWater) this.campusFountainWater.position.y = CURB_Y + 0.72 + Math.sin(t * 2.2) * 0.03;
  }
}

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
