// MetroVenture 3D — procedural city: roads, sidewalks, blocks, buildings, lots, stations.
import * as THREE from 'three';
import {
  ROAD_LINES, ROAD_HALF, SIDEWALK_W, BLOCK_HALF, SIDEWALK_RING, BLOCK_CENTERS, BUSINESSES,
  STATIONS, DEALERSHIP, FUEL_STATIONS, STREET_NAMES_X, STREET_NAMES_Z, MAX_BUSINESS_LEVEL,
} from './data.js';
import { mulberry32 } from './economy.js';

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

function makeWindowTexture(seed, base, lit) {
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = rand() < 0.25 ? lit : '#1e293b';
      g.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(x * 32 + 6, y * 32 + 7, 20, 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function makeZebraTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3d42'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e5e7eb';
  for (let i = 0; i < 4; i++) g.fillRect(i * 16 + 3, 0, 10, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
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
    this.mats = {
      road: new THREE.MeshLambertMaterial({ color: 0x3a3d42 }),
      line: new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
      white: new THREE.MeshBasicMaterial({ color: 0xe5e7eb }),
      sidewalk: new THREE.MeshLambertMaterial({ color: 0xb8b5ad }),
      grass: new THREE.MeshLambertMaterial({ color: 0x5f9e45 }),
      plaza: new THREE.MeshLambertMaterial({ color: 0x9ca3af }),
      dirt: new THREE.MeshLambertMaterial({ color: 0x8b6b43 }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x6b4423 }),
      leaf: new THREE.MeshLambertMaterial({ color: 0x2f7d32 }),
      leaf2: new THREE.MeshLambertMaterial({ color: 0x3f8f3a }),
      glass: new THREE.MeshPhongMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.55, shininess: 90 }),
      metal: new THREE.MeshLambertMaterial({ color: 0x9ca3af }),
      darkMetal: new THREE.MeshLambertMaterial({ color: 0x374151 }),
      roofDark: new THREE.MeshLambertMaterial({ color: 0x334155 }),
      water: new THREE.MeshPhongMaterial({ color: 0x38bdf8, shininess: 100, transparent: true, opacity: 0.85 }),
      fence: new THREE.MeshLambertMaterial({ color: 0xd6d3d1 }),
      hill: new THREE.MeshLambertMaterial({ color: 0x4d7c3a, flatShading: true }),
    };
    this.windowTex = [
      makeWindowTexture(1, '#64748b', '#fde68a'),
      makeWindowTexture(2, '#a8a29e', '#fef3c7'),
      makeWindowTexture(3, '#475569', '#bae6fd'),
      makeWindowTexture(4, '#9f7a5a', '#fde68a'),
      makeWindowTexture(5, '#1e3a5f', '#93c5fd'),
    ];
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.rand = mulberry32(42);

    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
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
    this.box(g, 0, 1.1 * scale, 0, 0.35 * scale, 2.2 * scale, 0.35 * scale, this.mats.trunk);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * scale, 0), this.rand() < 0.5 ? this.mats.leaf : this.mats.leaf2);
    leaf.position.y = 2.9 * scale;
    leaf.castShadow = true;
    g.add(leaf);
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
      // road along Z at x=r, and along X at z=r
      const a = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), this.mats.road);
      a.rotation.x = -Math.PI / 2; a.position.set(r, 0.02, 0); a.receiveShadow = true;
      this.root.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(len, ROAD_HALF * 2), this.mats.road);
      b.rotation.x = -Math.PI / 2; b.position.set(0, 0.021, r); b.receiveShadow = true;
      this.root.add(b);
    }
    // dashed centre lines between intersections
    const dash = new THREE.PlaneGeometry(0.25, 2.4);
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
      m4.compose(new THREE.Vector3(x, 0.035, z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(idx, m4);
    });
    this.root.add(inst);

    // zebra crossings at every block corner
    const zebra = makeZebraTexture();
    const zebraMat = new THREE.MeshLambertMaterial({ map: zebra });
    const crossGeoZ = new THREE.PlaneGeometry(ROAD_HALF * 2, SIDEWALK_W); // crossing a road along Z
    for (const r of ROAD_LINES) {
      for (const r2 of ROAD_LINES) {
        for (const s of [-1, 1]) {
          const off = s * (ROAD_HALF + SIDEWALK_W / 2);
          // crossing road along Z (x=r) near intersection z=r2
          const c1 = new THREE.Mesh(crossGeoZ, zebraMat);
          c1.rotation.x = -Math.PI / 2;
          c1.position.set(r, 0.03, r2 + off);
          if (Math.abs(r2 + off) < MAP_EDGE) this.root.add(c1);
          // crossing road along X (z=r) near intersection x=r2
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
        // sidewalk slab + inner plaza
        const outer = BLOCK_HALF + SIDEWALK_W;
        const sw = new THREE.Mesh(this.boxGeo, this.mats.sidewalk);
        sw.scale.set(outer * 2, CURB_Y, outer * 2);
        sw.position.set(bx, CURB_Y / 2, bz);
        sw.receiveShadow = true;
        this.root.add(sw);
        const inner = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_HALF * 2, BLOCK_HALF * 2), this.mats.grass);
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
    return null;
  }

  // ----- fuel station (feature 4) --------------------------------------------
  _buildFuelStation(frame, st) {
    const g = this.frameGroup(frame);
    const color = new THREE.Color(st.color);
    const canopy = new THREE.MeshLambertMaterial({ color });
    const dark = this.mats.darkMetal;
    // asphalt pad
    this.box(g, 0, 0.02, 0, 28, 0.04, 16, this.mats.road, { cast: false });
    // canopy: four posts + roof (drive under it; only the pump islands block)
    for (const [px, pz] of [[-9, 5], [9, 5], [-9, -5], [9, -5]]) this.box(g, px, 2.6, pz, 0.5, 5.2, 0.5, dark);
    this.box(g, 0, 5.35, 0, 23, 0.5, 12.5, canopy);
    this.box(g, 0, 5.65, -6.1, 23, 0.3, 0.3, dark);
    this.sign(g, [st.name.toUpperCase(), 'FUELS 24/7'], 0, 4.6, -6.3, 12, 2.4, { bg: st.color, fg: '#ffffff' });
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
      const tex = this.windowTex[Math.floor(r() * this.windowTex.length)].clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 6)));
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const roof = this.mats.roofDark;
      const m = new THREE.Mesh(this.boxGeo, [mat, mat, roof, roof, mat, mat]);
      m.scale.set(w, h, d);
      m.position.set(p.x, CURB_Y + h / 2, p.z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
      if (r() < 0.5) this.box(this.root, p.x, CURB_Y + h + 1, p.z, w * 0.4, 2, d * 0.4, this.mats.darkMetal);
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
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe7e5e4 });
    const trimMat = new THREE.MeshLambertMaterial({ color });
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
      for (const [x, z] of [[12, -4], [13, -6], [12.4, -8]]) this.box(g, x, 0.4, z, 1, 0.8, 1, new THREE.MeshLambertMaterial({ color: 0xb7884e }));
      this.frameCollider(frame, 12.5, -6, 2.5, 6);
    } else if (st.id === 'security') {
      this.box(g, 13, 4, -3, 0.2, 8, 0.2, this.mats.metal);
      this.box(g, 13.8, 7.3, -3, 1.6, 1, 0.05, new THREE.MeshLambertMaterial({ color: 0x16a34a }));
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
    const trim = new THREE.MeshLambertMaterial({ color: DEALERSHIP.color });
    this.box(g, 0, 0.05, -8, 30, 0.1, 18, this.mats.plaza, { cast: false });
    // glass showroom
    this.box(g, 0, 3, -16.8, 30, 6, 0.4, new THREE.MeshLambertMaterial({ color: 0xe5e7eb })); // back wall
    this.box(g, -14.8, 3, -8, 0.4, 6, 18, this.mats.glass, { cast: false });
    this.box(g, 14.8, 3, -8, 0.4, 6, 18, this.mats.glass, { cast: false });
    this.box(g, 0, 6.2, -8, 30.6, 0.4, 18.4, trim);
    for (const x of [-14.8, -5, 5, 14.8]) this.box(g, x, 3, 0.8, 0.4, 6, 0.4, this.mats.metal);
    this.sign(g, ['METRO MOTORS', 'NEW & USED CARS'], 0, 7.4, 1, 14, 2, { bg: DEALERSHIP.color });
    this.box(g, 0, 7.4, 0.85, 14.4, 2.2, 0.2, this.mats.darkMetal);
    this.frameCollider(frame, 0, -16.8, 30, 1);
    this.frameCollider(frame, -14.8, -8, 0.8, 18);
    this.frameCollider(frame, 14.8, -8, 0.8, 18);
    // display platforms (cars placed by game.js)
    this.dealerDisplays = [];
    for (const x of [-9, 0, 9]) {
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.25, 24), this.mats.metal);
      plat.position.set(x, 0.12, -9);
      plat.receiveShadow = true;
      g.add(plat);
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
    const main = new THREE.MeshLambertMaterial({ color });
    const accent = new THREE.MeshLambertMaterial({ color: new THREE.Color(def.accent) });
    const wall = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
    const floors = 1 + (level - 1);
    const floorH = 3.6;
    const width = 20 + (level - 1) * 1.5;
    const depth = 16;
    const h = floors * floorH + 1.5;
    const cz = -11; // building centre (local)
    this.box(g, 0, 0.03, -2, 32, 0.05, 30, this.mats.plaza, { cast: false });

    if (bizId === 'tech') {
      const tex = this.windowTex[4].clone();
      tex.needsUpdate = true;
      tex.repeat.set(4, floors * 1.5 + 1);
      const glassMat = new THREE.MeshLambertMaterial({ map: tex, color: 0xc4b5fd });
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

  // ----- outskirts -------------------------------------------------------------
  _buildOutskirts() {
    const r = this.rand;
    for (let i = 0; i < 90; i++) {
      const ang = r() * Math.PI * 2;
      const dist = 168 + r() * 26;
      const x = Math.cos(ang) * dist * 1.1;
      const z = Math.sin(ang) * dist * 1.1;
      if (Math.max(Math.abs(x), Math.abs(z)) < 165) continue;
      this.tree(Math.max(-192, Math.min(192, x)), Math.max(-192, Math.min(192, z)), 1 + r() * 0.8);
    }
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2;
      const dist = 250 + r() * 40;
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
    if (Math.abs(x) > MAP_EDGE || Math.abs(z) > MAP_EDGE) return 0;
    return this.isOnRoad(x, z) ? 0 : CURB_Y;
  }

  allColliders() {
    let out = this.colliders;
    for (const list of Object.values(this.dynamicColliders)) out = out.concat(list);
    return out;
  }

  rebuildColliderCache() { this._cache = this.allColliders(); }
  get colliderCache() { if (!this._cache) this.rebuildColliderCache(); return this._cache; }

  // Address label like "Broad Ave & 2nd St"
  addressFor(x, z) {
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
