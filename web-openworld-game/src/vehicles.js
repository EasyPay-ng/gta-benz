// MetroVenture 3D — sculpted PBR vehicles, 5-spoke rims, light flares, AI traffic & police cruisers.
import * as THREE from 'three';
import {
  VEHICLE_MODELS, ROAD_LINES, LANE_OFFSET, WORLD_LIMIT, CAR_COLORS, TELEMETRY_ENGINE_FAULT,
  CAR_LIVERIES, RIM_FINISHES, UNDERGLOW_OPTIONS,
} from './data.js';
import { resolveCircle, makeTextTexture } from './world.js';
import { applyDrive, speedFactor, gripFactor, freshCond } from './vehicleCond.js';
import { getFXTextures } from './textures.js';
import { createWreckFireRig, createTailpipeSmokeRig } from './fx.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 18);
const HEAD_BEAM_GEO = new THREE.ConeGeometry(1.05, 5.2, 12, 1, true);
const PROFILE_CACHE = new Map();

const MAT = {
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    transparent: true,
    opacity: 0.72,
    roughness: 0.06,
    metalness: 0.12,
    clearcoat: 1.0,
    envMapIntensity: 1.85,
  }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.86, metalness: 0.08 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.22, metalness: 0.88 }),
  rotor: new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.45, metalness: 0.7 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.52, metalness: 0.25 }),
  carbon: new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.34, metalness: 0.42 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x1f1a17, roughness: 0.62, metalness: 0.08 }),
  alcantara: new THREE.MeshStandardMaterial({ color: 0x121318, roughness: 0.86, metalness: 0.04 }),
  dashSoft: new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.56, metalness: 0.12 }),
  seatQuilt: new THREE.MeshStandardMaterial({ color: 0x26201d, roughness: 0.54, metalness: 0.08 }),
  tanLeather: new THREE.MeshStandardMaterial({ color: 0x7c4a27, roughness: 0.52, metalness: 0.08 }),
  creamLeather: new THREE.MeshStandardMaterial({ color: 0xd6c3a5, roughness: 0.52, metalness: 0.05 }),
  cognacLeather: new THREE.MeshStandardMaterial({ color: 0xb46934, roughness: 0.48, metalness: 0.08 }),
  oxbloodLeather: new THREE.MeshStandardMaterial({ color: 0x4c1118, roughness: 0.5, metalness: 0.08 }),
  crimsonBolster: new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.52, metalness: 0.08 }),
  saddleLeather: new THREE.MeshStandardMaterial({ color: 0x6b3e1e, roughness: 0.62, metalness: 0.06 }),
  clothGrey: new THREE.MeshStandardMaterial({ color: 0x3b4049, roughness: 0.9, metalness: 0.02 }),
  walnutWood: new THREE.MeshPhysicalMaterial({ color: 0x5b3216, roughness: 0.16, metalness: 0.08, clearcoat: 0.92 }),
  vintageWood: new THREE.MeshPhysicalMaterial({ color: 0x783f18, roughness: 0.22, metalness: 0.08, clearcoat: 0.8 }),
  pineGreen: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.78 }),
  taxiYellow: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.42, metalness: 0.12 }),
  harnessCyan: new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.55, metalness: 0.1 }),
  mdtScreen: new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }),
  aluTrim: new THREE.MeshStandardMaterial({ color: 0xd4d8df, roughness: 0.24, metalness: 0.86 }),
  pianoBlack: new THREE.MeshPhysicalMaterial({ color: 0x090a0f, roughness: 0.08, metalness: 0.2, clearcoat: 1.0 }),
  mirrorGlass: new THREE.MeshPhysicalMaterial({ color: 0x64748b, roughness: 0.04, metalness: 0.96, clearcoat: 1.0 }),
  cabinGlass: new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.08,
    roughness: 0.05,
    metalness: 0.08,
    clearcoat: 1.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  goldMetal: new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.2, metalness: 0.92 }),
  redIntake: new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4, metalness: 0.3 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe4e4e7, roughness: 0.14, metalness: 0.94 }),
  grille: new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.65, metalness: 0.35 }),
  archWell: new THREE.MeshBasicMaterial({ color: 0x070709 }),
  head: new THREE.MeshBasicMaterial({ color: 0xf8fafc }),
  amber: new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
  headBeam: new THREE.MeshBasicMaterial({
    color: 0xfef9c3,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }),
  checker: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 }),
  whiteDoor: new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.24,
    metalness: 0.35,
    clearcoat: 0.85,
  }),
  sirenRed: new THREE.MeshBasicMaterial({ color: 0xef4444 }),
  sirenBlue: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
};

let taxiSignTex = null;
let policeDoorTex = null;
let vehicleNight = 0;

/** Update shared night-time headlight material state across all cars (O(1)). */
export function setVehicleNightFactor(nightFactor) {
  vehicleNight = Math.max(0, Math.min(1, nightFactor));
  MAT.head.color.setHex(vehicleNight > 0.12 ? 0xfffbeb : 0xe2e8f0);
  MAT.headBeam.opacity = vehicleNight * 0.15;
}

function part(parent, mat, x, y, z, w, h, d, cast = true) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Extrude a 2D side-silhouette `shape` (where shape X = car Z from -L/2..+L/2 and shape Y = car Y)
 * across `width` along the car's X axis with smooth automotive bevels.
 */
function extrudeCarProfile(shape, width, bevelSize = 0.055, bevelThickness = 0.065) {
  const depth = Math.max(0.2, width - bevelThickness * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize,
    bevelThickness,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function getCabinBounds(m, yBot, yBelt) {
  const L = m.len;
  const W = m.wid;
  const cabW = m.style === 'van' ? W * 0.92
    : m.style === 'gwagen' ? W * 0.88
    : m.style === 'hyper' ? W * 0.75
    : (m.style === 'sports' || m.style === 'roadster') ? W * 0.8
    : W * 0.85;

  let zWindBase;
  let zWindTop;
  let zRearCab;
  let zSeat;
  if (m.style === 'van') {
    zWindBase = L / 2 - 0.28;
    zWindTop = L / 2 - 0.76;
    zRearCab = -L / 2 + 0.22;
    zSeat = 0.88;
  } else if (m.style === 'gwagen') {
    zWindBase = L * 0.22;
    zWindTop = L * 0.09;
    zRearCab = -L / 2 + 0.22;
    zSeat = -0.1;
  } else if (m.style === 'roadster') {
    zWindBase = 0.68;
    zWindTop = 0.36;
    zRearCab = -0.64;
    zSeat = -0.24;
  } else if (m.style === 'hyper') {
    zWindBase = m.cabinZ + m.cabinLen * 0.62;
    zWindTop = m.cabinZ + m.cabinLen * 0.16;
    zRearCab = m.cabinZ - m.cabinLen * 0.66;
    zSeat = -0.22;
  } else if (m.style === 'pickup') {
    zWindBase = m.cabinZ + m.cabinLen * 0.55;
    zWindTop = m.cabinZ + m.cabinLen * 0.2;
    zRearCab = m.cabinZ - m.cabinLen * 0.46;
    zSeat = m.cabinZ - 0.18;
  } else {
    zWindBase = m.cabinZ + m.cabinLen * 0.55;
    zWindTop = m.cabinZ + m.cabinLen * 0.2;
    zRearCab = m.cabinZ - m.cabinLen * 0.58;
    zSeat = m.cabinZ - 0.16;
  }
  const yFloor = yBot + 0.065;
  return { cabW, zWindBase, zWindTop, zRearCab, zSeat, yFloor };
}

function getSculptedGeometries(modelId) {
  if (PROFILE_CACHE.has(modelId)) return PROFILE_CACHE.get(modelId);
  const m = VEHICLE_MODELS[modelId];
  const L = m.len;
  const W = m.wid;
  const yBot = m.wheelR * 0.48;
  const yBelt = m.wheelR + m.bodyH - 0.03;
  const yNose = yBelt - (
    m.style === 'hyper' ? 0.22
    : m.style === 'sports' || m.style === 'roadster' ? 0.16
    : m.style === 'gwagen' || m.style === 'muscle' ? 0.04
    : m.style === 'van' ? 0.06 : 0.11
  );
  const yTail = yBelt + (m.style === 'hyper' ? 0.06 : m.style === 'sports' || m.style === 'muscle' ? 0.04 : 0.01);
  const bounds = getCabinBounds(m, yBot, yBelt);

  // 1. Sculpted lower body hull tailored to each vehicle archetype
  const hullShape = new THREE.Shape();
  if (m.style === 'gwagen') {
    // Upright commanding G-Class off-road silhouette
    hullShape.moveTo(-L / 2 + 0.04, yBot + 0.06);
    hullShape.lineTo(L / 2 - 0.06, yBot + 0.06);
    hullShape.lineTo(L / 2, yNose);
    hullShape.lineTo(L * 0.26, yBelt);
    hullShape.lineTo(-L / 2 + 0.02, yBelt);
    hullShape.closePath();
  } else if (m.style === 'hyper') {
    // Razor-sharp mid-engine hypercar wedge
    hullShape.moveTo(-L / 2 + 0.08, yBot + 0.05);
    hullShape.lineTo(L / 2 - 0.06, yBot + 0.01);
    hullShape.quadraticCurveTo(L / 2 + 0.04, yBot + 0.09, L / 2 - 0.05, yNose);
    hullShape.quadraticCurveTo(L * 0.28, yBelt - 0.02, 0.05, yBelt + 0.02);
    hullShape.lineTo(-L * 0.34, yTail);
    hullShape.lineTo(-L / 2, yTail - 0.05);
    hullShape.lineTo(-L / 2 + 0.04, yBot + 0.09);
    hullShape.closePath();
  } else if (m.style === 'muscle') {
    // Long-hood '69 fastback muscle coupe with shark nose
    hullShape.moveTo(-L / 2 + 0.06, yBot + 0.06);
    hullShape.lineTo(L / 2 - 0.1, yBot + 0.04);
    hullShape.lineTo(L / 2 + 0.02, yBelt - 0.02);
    hullShape.lineTo(L * 0.14, yBelt + 0.01);
    hullShape.lineTo(-L * 0.28, yBelt + 0.03);
    hullShape.lineTo(-L / 2, yTail);
    hullShape.lineTo(-L / 2 + 0.04, yBot + 0.09);
    hullShape.closePath();
  } else {
    hullShape.moveTo(-L / 2 + 0.08, yBot + 0.06);
    hullShape.lineTo(L / 2 - 0.12, yBot + 0.03);
    hullShape.quadraticCurveTo(L / 2 + 0.02, yBot + 0.12, L / 2, yNose * 0.86);
    hullShape.quadraticCurveTo(L / 2 - 0.08, yNose, L * 0.18, yBelt);
    hullShape.lineTo(-L * 0.25, yBelt + 0.02);
    hullShape.quadraticCurveTo(-L / 2 + 0.05, yTail, -L / 2, yTail - 0.08);
    hullShape.lineTo(-L / 2 + 0.03, yBot + 0.1);
    hullShape.closePath();
  }
  const hullBevel = m.style === 'gwagen' ? 0.03 : 0.055;
  const hullGeo = extrudeCarProfile(hullShape, W, hullBevel, 0.065);

  // 1b. Hollowed lower chassis for Cockpit View & open-top roadsters (drops cabin tub down to yFloor!)
  const zCutFront = Math.min(L / 2 - 0.34, bounds.zWindBase - 0.03);
  const zCutRear = Math.max(-L / 2 + 0.24, bounds.zRearCab + 0.03);
  const yWell = Math.max(yBot + 0.012, bounds.yFloor - hullBevel - 0.012);
  const cockpitHullShape = new THREE.Shape();
  cockpitHullShape.moveTo(-L / 2 + 0.06, yBot + 0.06);
  cockpitHullShape.lineTo(L / 2 - 0.1, yBot + 0.04);
  cockpitHullShape.quadraticCurveTo(L / 2 + 0.02, yBot + 0.11, L / 2 - 0.02, yNose);
  cockpitHullShape.lineTo(Math.max(zCutFront + 0.08, Math.min(L / 2 - 0.18, L * 0.24)), yBelt - hullBevel * 0.4);
  cockpitHullShape.lineTo(zCutFront, yBelt - hullBevel * 0.4);
  cockpitHullShape.lineTo(zCutFront - 0.05, yWell);
  cockpitHullShape.lineTo(zCutRear + 0.05, yWell);
  cockpitHullShape.lineTo(zCutRear, yBelt - hullBevel * 0.4);
  cockpitHullShape.lineTo(-L / 2 + 0.04, yTail - 0.04);
  cockpitHullShape.closePath();
  const cockpitHullGeo = extrudeCarProfile(cockpitHullShape, W, hullBevel, 0.065);

  // 2. Sculpted upper cabin / greenhouse + inset glass core
  let roofGeo = null;
  let glassGeo = null;
  if (m.style === 'roadster') {
    // True open-top convertible: no roof shell!
    roofGeo = null;
    glassGeo = null;
  } else if (m.style === 'van') {
    const cab = new THREE.Shape();
    const zRear = -L / 2 + 0.14;
    const zFront = L / 2 - 0.24;
    const yTop = yBelt + m.cabinH;
    cab.moveTo(zRear, yBelt - 0.04);
    cab.lineTo(zFront, yBelt - 0.04);
    cab.quadraticCurveTo(zFront - 0.18, yTop * 0.96, zFront - 0.65, yTop);
    cab.lineTo(zRear + 0.14, yTop);
    cab.quadraticCurveTo(zRear, yTop - 0.08, zRear, yBelt - 0.04);
    roofGeo = extrudeCarProfile(cab, W * 0.95, 0.05, 0.06);
  } else if (m.style === 'gwagen') {
    // Tall upright boxy G-Wagen greenhouse
    const cabW = W * 0.9;
    const zRear = -L / 2 + 0.14;
    const zFrontBase = L * 0.22;
    const zFrontTop = L * 0.09;
    const yTop = yBelt + m.cabinH;

    const roofShape = new THREE.Shape();
    roofShape.moveTo(zRear, yBelt - 0.03);
    roofShape.lineTo(zFrontBase, yBelt - 0.03);
    roofShape.lineTo(zFrontTop, yTop);
    roofShape.lineTo(zRear + 0.05, yTop);
    roofShape.closePath();
    roofGeo = extrudeCarProfile(roofShape, cabW * 0.95, 0.025, 0.03);

    const glassShape = new THREE.Shape();
    glassShape.moveTo(zRear + 0.05, yBelt - 0.01);
    glassShape.lineTo(zFrontBase - 0.04, yBelt - 0.01);
    glassShape.lineTo(zFrontTop - 0.02, yTop - 0.05);
    glassShape.lineTo(zRear + 0.08, yTop - 0.05);
    glassShape.closePath();
    glassGeo = extrudeCarProfile(glassShape, cabW, 0.015, 0.02);
  } else {
    const cabW = m.style === 'hyper' ? W * 0.74 : m.style === 'sports' ? W * 0.8 : W * 0.86;
    const zC = m.cabinZ;
    const cLen = m.cabinLen;
    const zFrontBase = zC + cLen * (m.style === 'hyper' ? 0.64 : 0.56);
    const zRearBase = zC - cLen * (
      m.style === 'muscle' ? 0.78
      : m.style === 'hyper' ? 0.72
      : m.style === 'sports' ? 0.68
      : m.style === 'pickup' ? 0.5 : 0.58
    );
    const zFrontTop = zC + cLen * (m.style === 'hyper' ? 0.18 : 0.24);
    const zRearTop = zC - cLen * (
      m.style === 'muscle' ? 0.22
      : m.style === 'hyper' ? 0.2
      : m.style === 'sports' ? 0.28
      : m.style === 'pickup' ? 0.42 : 0.34
    );
    const yTop = yBelt + m.cabinH;

    // Outer painted roof shell
    const roofShape = new THREE.Shape();
    roofShape.moveTo(zRearBase, yBelt - 0.03);
    roofShape.lineTo(zFrontBase, yBelt - 0.03);
    roofShape.quadraticCurveTo(zFrontTop + 0.14, yTop, zFrontTop, yTop);
    roofShape.lineTo(zRearTop, yTop);
    roofShape.quadraticCurveTo(zRearBase + 0.08, yTop * 0.96, zRearBase, yBelt - 0.03);
    roofGeo = extrudeCarProfile(roofShape, cabW * 0.94, 0.04, 0.045);

    // Slightly wider wrap-around dark reflective glass greenhouse
    const glassShape = new THREE.Shape();
    glassShape.moveTo(zRearBase + 0.06, yBelt - 0.01);
    glassShape.lineTo(zFrontBase - 0.05, yBelt - 0.01);
    glassShape.quadraticCurveTo(zFrontTop + 0.1, yTop - 0.045, zFrontTop - 0.02, yTop - 0.045);
    glassShape.lineTo(zRearTop + 0.03, yTop - 0.045);
    glassShape.quadraticCurveTo(zRearBase + 0.1, yTop * 0.93, zRearBase + 0.06, yBelt - 0.01);
    glassGeo = extrudeCarProfile(glassShape, cabW, 0.02, 0.025);
  }

  const out = { hullGeo, cockpitHullGeo, roofGeo, glassGeo, yBot, yBelt, yNose, yTail, bounds };
  PROFILE_CACHE.set(modelId, out);
  return out;
}

function buildAlloyWheel(wheelR, rimMat = MAT.rim) {
  const wheel = new THREE.Group();
  // Treaded rubber tyre
  const tyre = new THREE.Mesh(CYL, MAT.tyre);
  tyre.scale.set(wheelR, 0.27, wheelR);
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  wheel.add(tyre);

  // Inner brake disc rotor
  const rotor = new THREE.Mesh(CYL, MAT.rotor);
  rotor.scale.set(wheelR * 0.62, 0.14, wheelR * 0.62);
  rotor.rotation.z = Math.PI / 2;
  wheel.add(rotor);

  // Outer alloy rim lip + 5 sculpted spokes (on both outer faces so left/right wheels match)
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(CYL, rimMat);
    cap.scale.set(wheelR * 0.22, 0.03, wheelR * 0.22);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * 0.125;
    wheel.add(cap);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(wheelR * 0.66, wheelR * 0.075, 6, 16), rimMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * 0.12;
    wheel.add(ring);

    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2;
      const spoke = new THREE.Mesh(BOX, rimMat);
      spoke.scale.set(0.032, wheelR * 0.64, wheelR * 0.13);
      spoke.position.set(
        side * 0.12,
        Math.cos(ang) * wheelR * 0.33,
        Math.sin(ang) * wheelR * 0.33,
      );
      spoke.rotation.x = -ang;
      wheel.add(spoke);
    }
  }
  return wheel;
}

const TORUS_WHEEL = new THREE.TorusGeometry(0.145, 0.02, 8, 28);
const TORUS_FLAT_WHEEL = new THREE.TorusGeometry(0.145, 0.021, 8, 26, Math.PI * 1.56);
const TORUS_VENT = new THREE.TorusGeometry(0.032, 0.006, 6, 16);
const HAND_GEO = new THREE.CapsuleGeometry(0.024, 0.042, 4, 10);
const THUMB_GEO = new THREE.CapsuleGeometry(0.011, 0.024, 4, 8);
const FOREARM_GEO = new THREE.CylinderGeometry(0.028, 0.036, 0.21, 14);
const SHORT_CUFF_GEO = new THREE.CylinderGeometry(0.039, 0.042, 0.065, 14);
const THIGH_GEO = new THREE.CylinderGeometry(0.064, 0.076, 0.34, 14);
const SHIN_GEO = new THREE.CylinderGeometry(0.046, 0.056, 0.31, 14);
const JOINT_GEO = new THREE.SphereGeometry(1, 10, 8);
const MIRROR_GLASS_GEO = (() => {
  const g = new THREE.PlaneGeometry(1, 1);
  const uv = g.attributes.uv;
  // Flip U horizontally (u -> 1 - u) so a rear-facing camera produces true optical mirror reflections
  uv.setXY(0, 1, 1);
  uv.setXY(1, 0, 1);
  uv.setXY(2, 1, 0);
  uv.setXY(3, 0, 0);
  uv.needsUpdate = true;
  return g;
})();

function addStrutBetween(parent, mat, p1, p2, w = 0.055, d = 0.055) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return null;
  const m = new THREE.Mesh(BOX, mat);
  m.position.set((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5, (p1.z + p2.z) * 0.5);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  m.quaternion.setFromUnitVectors(up, dir);
  m.scale.set(w, len, d);
  m.castShadow = false;
  parent.add(m);
  return m;
}

/**
 * Per-vehicle bespoke interior blueprint across all 11 vehicle styles.
 */
const COCKPIT_THEMES = {
  hatch:    { wheelType: 'commuter_2spoke', clusterTheme: 'analog_amber',   centerTheme: 'retro_din_fm', ambient: '#f59e0b', hasAmbientStrip: false },
  sedan:    { wheelType: 'exec_4spoke',     clusterTheme: 'exec_ivory',     centerTheme: 'gps_nav',      ambient: '#fbbf24', hasAmbientStrip: true },
  taxi:     { wheelType: 'fleet_4spoke',    clusterTheme: 'taxi_fleet',     centerTheme: 'taxi_dispatch', ambient: '#facc15', hasAmbientStrip: false },
  pickup:   { wheelType: 'truck_4spoke',    clusterTheme: 'truck_rugged',   centerTheme: 'truck_util',   ambient: '#f97316', hasAmbientStrip: false },
  van:      { wheelType: 'transit_comm',    clusterTheme: 'cargo_emerald',  centerTheme: 'cargo_log',    ambient: '#10b981', hasAmbientStrip: false },
  muscle:   { wheelType: 'vintage_wood3',   clusterTheme: 'retro_chrome69', centerTheme: 'retro_amfm',   ambient: '#f59e0b', hasAmbientStrip: false },
  sports:   { wheelType: 'amg_flatbottom',  clusterTheme: 'amg_supersport', centerTheme: 'gps_nav',      ambient: '#38bdf8', hasAmbientStrip: true },
  roadster: { wheelType: 'speedster_flat',  clusterTheme: 'chrono_yellow',  centerTheme: 'gps_nav',      ambient: '#34d399', hasAmbientStrip: true },
  gwagen:   { wheelType: 'luxury_offroad',  clusterTheme: 'offroad_dual',   centerTheme: 'gps_nav',      ambient: '#c084fc', hasAmbientStrip: true },
  hyper:    { wheelType: 'f1_carbon_yoke',  clusterTheme: 'hyper_f1_bar',   centerTheme: 'hyper_telem',  ambient: '#22d3ee', hasAmbientStrip: true },
  police:   { wheelType: 'pursuit_tactical', clusterTheme: 'police_pursuit', centerTheme: 'police_mdt',   ambient: '#ef4444', hasAmbientStrip: false },
};

/**
 * Build a bespoke, model-specific 3D car interior & framed greenhouse for Cockpit View
 * (and always-visible open-air interior on roadsters).
 */
function buildCockpitRig(m, { paint, yBot, yBelt, cabinTop, bounds, openTop = false }) {
  const W = m.wid;
  const style = m.style || 'sedan';
  const theme = COCKPIT_THEMES[style] || COCKPIT_THEMES.sedan;
  const group = new THREE.Group();
  const isExotic = style === 'hyper' || style === 'sports' || style === 'roadster';
  const isMuscle = style === 'muscle';
  const signatureProps = [];

  const { cabW, zWindBase, zWindTop, zRearCab, zSeat, yFloor } = bounds || getCabinBounds(m, yBot, yBelt);

  const driverX = cabW * 0.255;
  const passX = -cabW * 0.255;
  const eyeY = yBelt + Math.max(0.27, Math.min(m.cabinH * 0.62, m.cabinH - 0.1));
  const eyeZ = zSeat + 0.05;
  const driverEye = new THREE.Vector3(driverX, eyeY, eyeZ);

  // Bespoke fascia & seat upholstery materials per vehicle model!
  const trimMat = style === 'sedan' ? MAT.walnutWood
    : style === 'roadster' ? paint
    : style === 'muscle' ? MAT.aluTrim
    : (style === 'hyper' || style === 'sports') ? MAT.carbon
    : style === 'gwagen' ? MAT.pianoBlack
    : MAT.trim;

  const seatMainMat = style === 'hatch' || style === 'van' ? MAT.clothGrey
    : style === 'sedan' ? MAT.creamLeather
    : style === 'roadster' ? MAT.cognacLeather
    : style === 'pickup' ? MAT.saddleLeather
    : style === 'muscle' ? MAT.oxbloodLeather
    : style === 'gwagen' ? MAT.tanLeather
    : MAT.seatQuilt;

  const seatBolsterMat = style === 'sports' ? MAT.crimsonBolster
    : style === 'hyper' ? MAT.carbon
    : style === 'taxi' ? MAT.taxiYellow
    : style === 'sedan' ? MAT.tanLeather
    : MAT.leather;

  const defaultAmbientHex = theme.ambient;
  const ambientMat = new THREE.MeshBasicMaterial({ color: defaultAmbientHex });

  // 1. Deep Cabin Tub (down to yFloor!), Painted Outer Door Skins, Full-Height Door Cards & Sport Pedals
  const tubLen = Math.max(1.25, zWindBase - zRearCab + 0.06);
  const tubMidZ = (zWindBase + zRearCab) * 0.5;
  const cabinWallH = Math.max(0.32, yBelt - yFloor + 0.02);
  const wallMidY = (yFloor + yBelt) * 0.5;

  const floorMat = style === 'pickup' || style === 'van' || style === 'police' ? MAT.trim : MAT.alcantara;
  part(group, floorMat, 0, yFloor, tubMidZ, W * 0.88, 0.028, tubLen, false);
  part(group, MAT.dashSoft, 0, wallMidY, zWindBase - 0.02, W * 0.88, cabinWallH, 0.05, false);
  part(group, MAT.alcantara, 0, wallMidY, zRearCab + 0.02, W * 0.88, cabinWallH, 0.06, false);

  // Stitched driver & passenger floor mats (ribbed rubber on utility/police, stitched leather on luxury/exotic)
  const matLen = Math.max(0.46, (zWindBase - zSeat) * 0.56);
  const matZ = zWindBase - matLen * 0.55 - 0.08;
  for (const sx of [-1, 1]) {
    part(group, style === 'sedan' ? MAT.tanLeather : MAT.leather, sx * Math.abs(driverX), yFloor + 0.017, matZ, 0.4, 0.01, matLen, false);
  }

  // Footwell pedals (rubber-pad pedals on economy/utility, drilled brushed-alloy pedals on sport/luxury/muscle)
  const pedalMat = (isExotic || isMuscle || style === 'gwagen') ? MAT.aluTrim : MAT.trim;
  const zPedal = zWindBase - 0.14;
  const pFoot = part(group, pedalMat, driverX + 0.145, yFloor + 0.09, zPedal + 0.02, 0.052, 0.14, 0.014, false);
  pFoot.rotation.x = -0.52;
  const pBrake = part(group, pedalMat, driverX + 0.015, yFloor + 0.125, zPedal - 0.02, 0.078, 0.052, 0.016, false);
  pBrake.rotation.x = -0.42;
  part(group, MAT.trim, driverX + 0.015, yFloor + 0.19, zPedal + 0.02, 0.018, 0.12, 0.018, false);
  const pGas = part(group, pedalMat, driverX - 0.1, yFloor + 0.105, zPedal, 0.044, 0.15, 0.014, false);
  pGas.rotation.x = -0.48;
  // Manual clutch 4th pedal on stick-shift Hatchback & '69 Stallion GT!
  if (style === 'hatch' || style === 'muscle') {
    const pClutch = part(group, pedalMat, driverX + 0.092, yFloor + 0.125, zPedal - 0.015, 0.052, 0.052, 0.016, false);
    pClutch.rotation.x = -0.42;
    signatureProps.push('clutch_pedal');
  }

  // Painted exterior door shells + bespoke inner door cards
  const doorLen = Math.max(1.15, zWindBase - zRearCab + 0.12);
  const innerDoorLen = Math.min(1.65, tubLen * 0.84);
  const doorZ = zSeat + innerDoorLen * 0.28;
  for (const sx of [-1, 1]) {
    part(group, paint, sx * (W * 0.5 - 0.034), wallMidY, tubMidZ, 0.068, cabinWallH + 0.03, doorLen, true);
    part(group, MAT.dashSoft, sx * (W * 0.5 - 0.078), wallMidY + 0.01, doorZ, 0.036, cabinWallH + 0.04, innerDoorLen, false);
    part(group, seatMainMat, sx * (W * 0.5 - 0.098), yFloor + cabinWallH * 0.52, doorZ - 0.02, 0.018, cabinWallH * 0.44, innerDoorLen * 0.68, false);
    part(group, seatBolsterMat, sx * (W * 0.5 - 0.122), yFloor + cabinWallH * 0.56, doorZ - 0.03, 0.058, 0.046, innerDoorLen * 0.56, false);
    // Fabric pull-straps on Hypercar, manual window crank on Rusty Hatchback, chrome pull on others!
    if (style === 'hyper') {
      part(group, MAT.redIntake, sx * (W * 0.5 - 0.118), yBelt - 0.05, doorZ + innerDoorLen * 0.18, 0.025, 0.065, 0.028, false);
    } else if (style === 'hatch') {
      const crank = part(group, MAT.trim, sx * (W * 0.5 - 0.116), yFloor + cabinWallH * 0.48, doorZ + innerDoorLen * 0.15, 0.02, 0.095, 0.024, false);
      crank.rotation.x = 0.45;
      if (sx === 1) signatureProps.push('manual_window_cranks');
    } else {
      part(group, MAT.aluTrim, sx * (W * 0.5 - 0.115), yBelt - 0.045, doorZ + innerDoorLen * 0.2, 0.022, 0.024, 0.13, false);
    }
    if (theme.hasAmbientStrip) {
      part(group, ambientMat, sx * (W * 0.5 - 0.1), yBelt - 0.01, doorZ, 0.012, 0.011, innerDoorLen * 0.78, false);
    }
    const spkRing = new THREE.Mesh(TORUS_VENT, MAT.aluTrim);
    spkRing.position.set(sx * (W * 0.5 - 0.098), yFloor + cabinWallH * 0.27, doorZ + innerDoorLen * 0.27);
    spkRing.rotation.y = Math.PI / 2;
    spkRing.scale.setScalar(2.1);
    group.add(spkRing);
    const spkCore = new THREE.Mesh(CYL, MAT.grille);
    spkCore.scale.set(0.062, 0.01, 0.062);
    spkCore.rotation.z = Math.PI / 2;
    spkCore.position.copy(spkRing.position);
    group.add(spkCore);
  }

  // 2. Bespoke Center Console / Transmission Tunnel & Model-Specific Shifters / Cabin Gear
  const consoleLen = Math.max(0.95, (zWindBase - zSeat) * 0.92);
  const consoleZ = zSeat + consoleLen * 0.34;
  const yConsoleTop = yBelt + 0.075;
  const tunnelH = Math.max(0.28, yConsoleTop - yFloor);
  const shiftZ = zSeat + 0.35;

  if (style === 'van') {
    // SwiftCargo Van: open walk-through center floor aisle (no full floor tunnel!) + rubber aisle runner
    part(group, MAT.leather, 0, yFloor + 0.018, consoleZ, cabW * 0.18, 0.012, consoleLen, false);
    signatureProps.push('walkthrough_aisle');
  } else {
    const cWidth = style === 'hyper' ? cabW * 0.14 : style === 'pickup' ? cabW * 0.25 : cabW * 0.21;
    part(group, MAT.dashSoft, 0, yFloor + tunnelH * 0.5, consoleZ, cWidth, tunnelH, consoleLen, false);
    part(group, trimMat, 0, yConsoleTop + 0.008, consoleZ + 0.05, cWidth * 0.88, 0.018, consoleLen * 0.76, false);
    if (theme.hasAmbientStrip) {
      for (const sx of [-1, 1]) {
        part(group, ambientMat, sx * (cWidth * 0.46), yConsoleTop + 0.004, consoleZ + 0.05, 0.008, 0.009, consoleLen * 0.7, false);
      }
    }
    part(group, seatMainMat, 0, yConsoleTop + 0.028, zSeat - 0.04, cWidth * 0.9, 0.055, 0.34, false);
  }

  // Model-specific Shifter & Center Console Equipment
  if (style === 'hatch') {
    // Economy 5-speed rubber-boot manual stick + mechanical pull handbrake lever
    const boot = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.06, 10), MAT.leather);
    boot.position.set(0, yConsoleTop + 0.035, shiftZ);
    group.add(boot);
    const stick = new THREE.Mesh(CYL, MAT.trim);
    stick.scale.set(0.009, 0.1, 0.009);
    stick.position.set(0, yConsoleTop + 0.09, shiftZ);
    group.add(stick);
    const knob = new THREE.Mesh(JOINT_GEO, MAT.trim);
    knob.scale.set(0.024, 0.028, 0.024);
    knob.position.set(0, yConsoleTop + 0.14, shiftZ);
    group.add(knob);
    const hBrake = part(group, MAT.trim, 0.048, yConsoleTop + 0.042, zSeat + 0.16, 0.022, 0.024, 0.16, false);
    hBrake.rotation.x = 0.26;
    signatureProps.push('manual_5speed_and_handbrake');
  } else if (style === 'muscle') {
    // Classic '69 Hurst bent chrome shifter with white cue-ball knob + chrome bezel ring
    part(group, MAT.chrome, 0, yConsoleTop + 0.018, shiftZ, 0.095, 0.012, 0.11, false);
    const stalk = new THREE.Mesh(CYL, MAT.chrome);
    stalk.scale.set(0.01, 0.145, 0.01);
    stalk.rotation.x = -0.22;
    stalk.position.set(0, yConsoleTop + 0.082, shiftZ);
    group.add(stalk);
    const ball = new THREE.Mesh(JOINT_GEO, MAT.plate);
    ball.scale.setScalar(0.028);
    ball.position.set(0, yConsoleTop + 0.152, shiftZ - 0.026);
    group.add(ball);
    signatureProps.push('hurst_cueball_shifter');
  } else if (style === 'roadster') {
    // Open-gate machined aluminium turret shifter
    part(group, MAT.chrome, 0, yConsoleTop + 0.022, shiftZ, 0.092, 0.016, 0.105, false);
    for (const gx of [-0.022, 0, 0.022]) {
      part(group, MAT.grille, gx, yConsoleTop + 0.031, shiftZ, 0.007, 0.006, 0.075, false);
    }
    const stalk = new THREE.Mesh(CYL, MAT.chrome);
    stalk.scale.set(0.008, 0.11, 0.008);
    stalk.position.set(0, yConsoleTop + 0.075, shiftZ);
    group.add(stalk);
    const ball = new THREE.Mesh(JOINT_GEO, MAT.aluTrim);
    ball.scale.setScalar(0.024);
    ball.position.set(0, yConsoleTop + 0.132, shiftZ);
    group.add(ball);
    signatureProps.push('gated_metal_shifter');
  } else if (style === 'hyper') {
    // Valkyrie X12: Push-button D/N/R/LAUNCH aero switches + flip-up red jet-fighter ignition guard!
    for (let b = 0; b < 4; b++) {
      part(group, b === 0 ? MAT.redIntake : MAT.aluTrim, 0, yConsoleTop + 0.02, zSeat + 0.16 + b * 0.062, 0.048, 0.014, 0.038, false);
    }
    const guard = part(group, MAT.redIntake, 0, yConsoleTop + 0.046, shiftZ + 0.12, 0.046, 0.042, 0.052, false);
    guard.rotation.x = -0.45;
    signatureProps.push('jet_ignition_guard');
  } else if (style === 'pickup') {
    // 4WD Transfer-Case floor lever (2H / 4H / 4L) + wide utility storage bin
    const tLever = new THREE.Mesh(CYL, MAT.trim);
    tLever.scale.set(0.011, 0.11, 0.011);
    tLever.rotation.x = 0.2;
    tLever.position.set(0.05, yConsoleTop + 0.065, shiftZ - 0.04);
    group.add(tLever);
    part(group, MAT.saddleLeather, 0.05, yConsoleTop + 0.12, shiftZ - 0.03, 0.044, 0.032, 0.052, false);
    signatureProps.push('transfer_case_4wd_lever');
  } else if (style === 'police') {
    // Police Interceptor: Siren/Lightbar rocker controller + Swivel-Mounted Open MDT Toughbook Laptop!
    part(group, MAT.trim, 0, yConsoleTop + 0.038, zSeat + 0.18, 0.14, 0.045, 0.16, false);
    part(group, MAT.sirenRed, -0.035, yConsoleTop + 0.064, zSeat + 0.21, 0.028, 0.01, 0.028, false);
    part(group, MAT.sirenBlue, 0.035, yConsoleTop + 0.064, zSeat + 0.21, 0.028, 0.01, 0.028, false);
    const mdtMount = new THREE.Group();
    mdtMount.position.set(-0.075, yConsoleTop + 0.12, shiftZ + 0.02);
    mdtMount.rotation.y = -0.42; // swivelled toward the officer!
    part(mdtMount, MAT.trim, 0, -0.05, 0, 0.032, 0.11, 0.032, false);
    part(mdtMount, MAT.carbon, 0, 0, -0.04, 0.22, 0.016, 0.16, false); // rugged keyboard deck
    const lid = new THREE.Group();
    lid.position.set(0, 0.008, 0.035);
    lid.rotation.x = 0.28;
    part(lid, MAT.trim, 0, 0.075, 0, 0.22, 0.15, 0.014, false);
    part(lid, MAT.mdtScreen, 0, 0.075, -0.008, 0.195, 0.125, 0.004, false);
    mdtMount.add(lid);
    group.add(mdtMount);
    signatureProps.push('police_mdt_laptop');
  } else if (style !== 'van') {
    // Executive / AMG / G-Wagen T-shifter + rotary command dial + cupholders
    for (const cx of [-0.042, 0.042]) {
      const cup = new THREE.Mesh(TORUS_VENT, MAT.aluTrim);
      cup.rotation.x = Math.PI / 2;
      cup.scale.setScalar(1.05);
      cup.position.set(cx, yConsoleTop + 0.02, zSeat + 0.2);
      group.add(cup);
    }
    const dial = new THREE.Mesh(CYL, style === 'sedan' ? MAT.goldMetal : MAT.aluTrim);
    dial.scale.set(0.024, 0.018, 0.024);
    dial.position.set(0, yConsoleTop + 0.024, zSeat + 0.12);
    group.add(dial);
    part(group, MAT.aluTrim, 0, yConsoleTop + 0.045, shiftZ, 0.026, 0.065, 0.032, false);
    part(group, MAT.leather, 0, yConsoleTop + 0.08, shiftZ + 0.01, 0.088, 0.026, 0.05, false);
    const startBtn = new THREE.Mesh(CYL, MAT.redIntake);
    startBtn.scale.set(0.016, 0.008, 0.016);
    startBtn.position.set(driverX * 0.32, yConsoleTop + 0.022, shiftZ + 0.12);
    group.add(startBtn);
  }

  // Taxi CB Dispatch Radio & Coiled Handset Mic beside console
  if (style === 'taxi') {
    part(group, MAT.trim, -0.095, yConsoleTop + 0.042, shiftZ + 0.08, 0.11, 0.042, 0.12, false);
    part(group, MAT.taxiYellow, -0.095, yConsoleTop + 0.066, shiftZ + 0.08, 0.045, 0.016, 0.065, false);
    signatureProps.push('taxi_cb_radio');
  }

  // 3. Bespoke Seats (Cloth Commuter / Executive Leather / Pleated '69 Muscle / 4-Point Harness Carbon Tubs!)
  const ySeatTop = yFloor + Math.max(0.19, (yBelt - yFloor) * 0.42);
  const seatBaseH = Math.max(0.12, ySeatTop - yFloor - 0.04);
  for (const sx of [-1, 1]) {
    const seatX = sx * Math.abs(driverX);
    part(group, MAT.trim, seatX, yFloor + seatBaseH * 0.5, zSeat + 0.08, 0.36, seatBaseH, 0.38, false);
    const cush = part(group, seatMainMat, seatX, ySeatTop, zSeat + 0.11, 0.43, 0.075, 0.45, false);
    cush.rotation.x = -0.08;
    const bolH = isExotic ? 0.105 : style === 'hatch' ? 0.055 : 0.085;
    for (const bx of [-1, 1]) {
      const bol = part(group, seatBolsterMat, seatX + bx * 0.195, ySeatTop + 0.038, zSeat + 0.11, 0.058, bolH, 0.43, false);
      bol.rotation.x = -0.08;
    }
    const backH = Math.max(0.48, (yBelt + 0.34) - ySeatTop);
    const back = part(group, seatMainMat, seatX, ySeatTop + backH * 0.5, zSeat - 0.11, 0.41, backH, 0.09, false);
    back.rotation.x = -0.15;
    for (const bx of [-1, 1]) {
      const sBol = part(group, seatBolsterMat, seatX + bx * 0.19, ySeatTop + backH * 0.52, zSeat - 0.09, 0.055, backH * 0.86, 0.1, false);
      sBol.rotation.x = -0.15;
    }
    const hRest = part(group, seatBolsterMat, seatX, ySeatTop + backH + 0.08, zSeat - 0.16, 0.22, 0.15, 0.078, false);
    hRest.rotation.x = -0.1;

    // 4-point cyan racing harnesses + 24k gold cam-lock buckle on Valkyrie X12 Hypercar!
    if (style === 'hyper') {
      for (const hx of [-0.075, 0.075]) {
        const strap = part(group, MAT.harnessCyan, seatX + hx, ySeatTop + backH * 0.52, zSeat - 0.055, 0.038, backH * 0.86, 0.018, false);
        strap.rotation.x = -0.15;
      }
      part(group, MAT.goldMetal, seatX, ySeatTop + backH * 0.22, zSeat - 0.03, 0.052, 0.052, 0.022, false);
      if (sx === 1) signatureProps.push('racing_4pt_harness');
    }
  }

  // Rear Bulkhead / Partition for SwiftCargo Van & Metro Police Interceptor (behind seats, clear of front mirrors!)
  if (style === 'van') {
    const wallH = Math.max(0.65, cabinTop - yFloor - 0.08);
    const zPart = zSeat - 0.28;
    for (const px of [-cabW * 0.32, cabW * 0.32]) {
      part(group, MAT.trim, px, yFloor + wallH * 0.5, zPart, cabW * 0.32, wallH, 0.035, false);
    }
    part(group, MAT.trim, 0, yFloor + wallH * 0.26, zPart, cabW * 0.34, wallH * 0.52, 0.035, false);
    part(group, MAT.cabinGlass, 0, yFloor + wallH * 0.74, zPart, cabW * 0.32, wallH * 0.36, 0.015, false);
    signatureProps.push('cargo_steel_bulkhead');
  } else if (style === 'police') {
    const cageH = Math.max(0.55, cabinTop - yFloor - 0.1);
    const zCage = zSeat - 0.27;
    part(group, MAT.trim, 0, yFloor + cageH * 0.25, zCage, cabW * 0.88, cageH * 0.5, 0.03, false);
    for (let b = -3; b <= 3; b++) {
      part(group, MAT.aluTrim, b * (cabW * 0.11), yFloor + cageH * 0.72, zCage, 0.014, cageH * 0.44, 0.014, false);
    }
    signatureProps.push('prisoner_partition_cage');
  }

  // 4. Multi-layered Dashboard + Model-Specific Vents, Dash Pods & Signature Top Gear
  const zDashFront = zWindBase - 0.03;
  const zDashFace = zSeat + (zWindBase - zSeat) * 0.55;
  const dashDepth = Math.max(0.24, zDashFront - zDashFace);
  const dashMidZ = (zDashFront + zDashFace) * 0.5;
  const yDashTop = Math.min(yBelt + 0.14, eyeY - 0.185);
  const yDashUnder = yFloor + Math.max(0.32, (yBelt - yFloor) * 0.68);
  const fullDashH = Math.max(0.18, yDashTop - yDashUnder);

  part(group, MAT.dashSoft, 0, yDashUnder + fullDashH * 0.5, dashMidZ, cabW * 0.96, fullDashH, dashDepth, false);
  part(group, trimMat, 0, yDashTop - 0.042, zDashFace - 0.008, cabW * 0.92, 0.062, 0.024, false);
  if (theme.hasAmbientStrip) {
    part(group, ambientMat, 0, yDashTop - 0.076, zDashFace - 0.016, cabW * 0.9, 0.011, 0.016, false);
  }

  // Driver instrument binnacle hood (twin retro round pods on '69 Muscle, frameless panoramic glass on Sports, sculpted hood on others)
  if (style === 'muscle') {
    for (const px of [-0.078, 0.078]) {
      const bezel = new THREE.Mesh(TORUS_VENT, MAT.chrome);
      bezel.scale.setScalar(1.85);
      bezel.position.set(driverX + px, yDashTop + 0.028, zDashFace - 0.016);
      group.add(bezel);
    }
    // 3 Iconic Auxiliary Chrome Gauge Pods angled atop center dash!
    for (let p = -1; p <= 1; p++) {
      const pod = new THREE.Mesh(CYL, MAT.chrome);
      pod.scale.set(0.026, 0.042, 0.026);
      pod.rotation.x = Math.PI / 2;
      pod.rotation.z = -0.18;
      pod.position.set(p * 0.062, yDashTop + 0.032, zDashFace + 0.045);
      group.add(pod);
    }
    signatureProps.push('triple_chrome_dash_pods');
  } else if (style === 'sports') {
    // Seamless curved panoramic MBUX-style dual-screen glass backing
    part(group, MAT.pianoBlack, driverX * 0.42, yDashTop + 0.03, zDashFace - 0.008, cabW * 0.56, 0.142, 0.018, false);
    signatureProps.push('panoramic_widescreen_slab');
  } else {
    part(group, MAT.leather, driverX, yDashTop + 0.078, zDashFace + 0.025, 0.37, 0.026, 0.16, false);
    for (const bx of [-1, 1]) {
      part(group, MAT.leather, driverX + bx * 0.175, yDashTop + 0.032, zDashFace + 0.025, 0.024, 0.09, 0.15, false);
    }
  }

  // Model-specific AC Vents: Chunky Rectangular Vents on Truck/Van/Hatch/Taxi/Police vs Round Turbine Vents on Luxury/Exotic!
  const ventXs = [-cabW * 0.39, -0.095, 0, 0.095, cabW * 0.39];
  const yVent = yDashTop - 0.042;
  const squareVents = style === 'hatch' || style === 'pickup' || style === 'van' || style === 'taxi' || style === 'police';
  for (const vx of ventXs) {
    if (Math.abs(vx - driverX) < 0.19 && vx !== cabW * 0.39) continue;
    if (squareVents) {
      part(group, style === 'pickup' ? MAT.amber : MAT.aluTrim, vx, yVent, zDashFace - 0.02, 0.074, 0.042, 0.012, false);
      part(group, MAT.grille, vx, yVent, zDashFace - 0.023, 0.064, 0.032, 0.01, false);
    } else {
      const ring = new THREE.Mesh(TORUS_VENT, MAT.aluTrim);
      ring.position.set(vx, yVent, zDashFace - 0.022);
      ring.rotation.y = Math.PI;
      group.add(ring);
      const core = new THREE.Mesh(CYL, MAT.grille);
      core.scale.set(0.028, 0.012, 0.028);
      core.rotation.x = Math.PI / 2;
      core.position.set(vx, yVent, zDashFace - 0.02);
      group.add(core);
    }
  }

  // Bespoke Dashboard Top & Passenger-Side Signature Props!
  if (style === 'gwagen') {
    // G-Wagen: Passenger off-road grab handle + 3 iconic chrome differential-lock switches!
    part(group, MAT.aluTrim, passX, yDashTop - 0.035, zDashFace - 0.035, 0.28, 0.024, 0.03, false);
    for (const gx of [-0.12, 0.12]) {
      part(group, MAT.aluTrim, passX + gx, yDashTop - 0.035, zDashFace - 0.018, 0.028, 0.028, 0.035, false);
    }
    for (let d = -1; d <= 1; d++) {
      part(group, MAT.chrome, d * 0.034, yDashTop - 0.088, zDashFace - 0.024, 0.022, 0.018, 0.014, false);
    }
    signatureProps.push('gwagen_difflock_and_grabbar');
  } else if (style === 'sedan') {
    // Lagos Cruiser Sedan: Gold-bezel analog luxury clock centerpiece + walnut trim!
    const clk = new THREE.Mesh(TORUS_VENT, MAT.goldMetal);
    clk.scale.setScalar(0.82);
    clk.position.set(0, yDashTop - 0.01, zDashFace - 0.022);
    group.add(clk);
    signatureProps.push('walnut_luxury_clock');
  } else if (style === 'roadster') {
    // Aero Spider Roadster: Dash-top Chronosport Lap Stopwatch Pod!
    const pod = new THREE.Mesh(CYL, paint);
    pod.scale.set(0.036, 0.055, 0.036);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(0, yDashTop + 0.032, zDashFace + 0.04);
    group.add(pod);
    const bezel = new THREE.Mesh(TORUS_VENT, MAT.chrome);
    bezel.position.set(0, yDashTop + 0.032, zDashFace + 0.012);
    group.add(bezel);
    signatureProps.push('chronosport_stopwatch');
  } else if (style === 'taxi') {
    // Metro Cab Taxi: Dash-Top Digital Fare Meter ("FARE $ · HIRED") + Yellow Passenger Medallion!
    part(group, MAT.trim, -0.04, yDashTop + 0.034, zDashFace + 0.04, 0.17, 0.056, 0.068, false);
    part(group, MAT.taxiYellow, -0.04, yDashTop + 0.064, zDashFace + 0.04, 0.174, 0.008, 0.07, false);
    part(group, MAT.sirenRed, -0.07, yDashTop + 0.035, zDashFace + 0.004, 0.075, 0.026, 0.005, false);
    part(group, MAT.taxiYellow, passX, yDashTop - 0.04, zDashFace - 0.022, 0.18, 0.048, 0.008, false);
    signatureProps.push('taxi_fare_meter');
  } else if (style === 'van') {
    // SwiftCargo Van: Dash-mounted Manifest Clipboard + Dash-pod Commercial Shifter + Barcode Scanner!
    const clip = part(group, MAT.saddleLeather, passX * 0.55, yDashTop + 0.018, zDashFace + 0.06, 0.19, 0.012, 0.24, false);
    clip.rotation.y = 0.22;
    const sheet = part(group, MAT.plate, passX * 0.55, yDashTop + 0.026, zDashFace + 0.06, 0.16, 0.006, 0.2, false);
    sheet.rotation.y = 0.22;
    // Dash-mounted ergonomic commercial shifter pod
    part(group, MAT.trim, driverX - 0.21, yDashTop - 0.085, zDashFace - 0.045, 0.075, 0.095, 0.085, false);
    part(group, MAT.aluTrim, driverX - 0.21, yDashTop - 0.03, zDashFace - 0.065, 0.032, 0.065, 0.032, false);
    signatureProps.push('manifest_clipboard_and_dash_shifter');
  } else if (style === 'police') {
    // Police Interceptor: Dash-top Doppler Radar Speed Gun unit!
    part(group, MAT.trim, driverX * 0.45, yDashTop + 0.028, zDashFace + 0.055, 0.14, 0.044, 0.085, false);
    const cone = new THREE.Mesh(CYL, MAT.aluTrim);
    cone.scale.set(0.024, 0.07, 0.024);
    cone.rotation.x = Math.PI / 2;
    cone.position.set(driverX * 0.45 + 0.09, yDashTop + 0.03, zDashFace + 0.085);
    group.add(cone);
    signatureProps.push('doppler_radar_unit');
  }

  // 5. Driver Instrument Cluster & Model-Specific Center Stack (Widescreen GPS / Retro DIN FM / Vintage Chrome Radio)
  const clusterMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
  const infotainMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

  const clusterGroup = new THREE.Group();
  clusterGroup.position.set(driverX, yDashTop + 0.028, zDashFace - 0.012);
  clusterGroup.rotation.y = Math.PI;
  clusterGroup.rotation.x = 0.14;
  part(clusterGroup, MAT.pianoBlack, 0, 0, -0.006, 0.335, 0.12, 0.012, false);
  const clusterPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.315, 0.104), clusterMat);
  clusterGroup.add(clusterPlane);
  group.add(clusterGroup);

  const infoGroup = new THREE.Group();
  const infoX = Math.min(0.0, driverX - 0.33);
  const isCompactDeck = style === 'hatch' || style === 'muscle';
  infoGroup.position.set(
    isCompactDeck ? 0 : infoX,
    isCompactDeck ? yDashTop - 0.042 : yDashTop + 0.028,
    zDashFace - 0.022,
  );
  infoGroup.rotation.y = isCompactDeck ? Math.PI : Math.PI - 0.16;
  infoGroup.rotation.x = isCompactDeck ? 0.04 : 0.12;
  const deckW = isCompactDeck ? 0.25 : 0.335;
  const deckH = isCompactDeck ? 0.086 : 0.158;
  part(infoGroup, style === 'muscle' ? MAT.chrome : MAT.aluTrim, 0, 0, -0.008, deckW, deckH, 0.014, false);
  part(infoGroup, MAT.pianoBlack, 0, 0, -0.003, deckW - 0.012, deckH - 0.012, 0.01, false);
  const infoPlane = new THREE.Mesh(new THREE.PlaneGeometry(deckW - 0.026, deckH - 0.024), infotainMat);
  infoPlane.position.z = 0.004;
  infoGroup.add(infoPlane);
  if (isCompactDeck) {
    // Physical rotary tuning/volume knobs + 3 HVAC climate dials below the Single-DIN deck!
    for (const kx of [-deckW * 0.42, deckW * 0.42]) {
      const knob = new THREE.Mesh(CYL, MAT.chrome);
      knob.scale.set(0.012, 0.016, 0.012);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(kx, 0, 0.008);
      infoGroup.add(knob);
    }
  }
  group.add(infoGroup);

  // 6. Sculpted Steering Column + Bespoke Model-Specific Steering Wheel / F1 Carbon Yoke!
  const zSteer = zDashFace - 0.168;
  const ySteer = yDashTop - 0.026;
  const colStalk = new THREE.Mesh(CYL, MAT.trim);
  colStalk.scale.set(0.036, 0.18, 0.036);
  colStalk.rotation.x = Math.PI / 2 - 0.28;
  colStalk.position.set(driverX, ySteer - 0.012, (zDashFace + zSteer) * 0.5);
  group.add(colStalk);

  // Column gear-shifter stalk on Pickup Truck!
  if (style === 'pickup') {
    const cShift = part(group, MAT.trim, driverX - 0.075, ySteer + 0.015, zSteer + 0.055, 0.12, 0.014, 0.014, false);
    cShift.rotation.z = -0.25;
  }

  const steerTilt = new THREE.Group();
  steerTilt.position.set(driverX, ySteer, zSteer);
  steerTilt.rotation.x = style === 'van' || style === 'pickup' ? 0.42 : 0.26;
  group.add(steerTilt);

  const steerWheel = new THREE.Group();
  steerTilt.add(steerWheel);

  // Build bespoke steering wheel geometry per vehicle model!
  if (style === 'hyper') {
    // Valkyrie X12: Rectangular Open-Top Formula / Le Mans Carbon Yoke + 6-LED RPM Shift Strip!
    for (const sx of [-1, 1]) {
      part(steerWheel, MAT.alcantara, sx * 0.142, -0.006, 0, 0.034, 0.155, 0.034, false);
      part(steerWheel, MAT.carbon, sx * 0.088, -0.012, -0.004, 0.095, 0.03, 0.018, false);
      part(steerWheel, MAT.carbon, sx * 0.105, 0.028, 0.022, 0.028, 0.072, 0.008, false); // carbon paddles
    }
    part(steerWheel, MAT.carbon, 0, 0.042, 0, 0.255, 0.022, 0.022, false);
    part(steerWheel, MAT.carbon, 0, -0.072, 0, 0.24, 0.02, 0.02, false);
    // 6-LED F1 shift-light strip across yoke bridge
    for (let l = 0; l < 6; l++) {
      const ledMat = l < 2 ? MAT.pineGreen : l < 4 ? MAT.amber : MAT.sirenRed;
      part(steerWheel, ledMat, -0.065 + l * 0.026, 0.044, -0.013, 0.016, 0.008, 0.005, false);
    }
    part(steerWheel, MAT.carbon, 0, -0.012, -0.004, 0.092, 0.078, 0.028, false);
    signatureProps.push('f1_carbon_yoke');
  } else if (style === 'sports' || style === 'roadster') {
    // AMG / Roadster Flat-Bottom D-Shaped Sport Wheel!
    const rimMesh = new THREE.Mesh(TORUS_FLAT_WHEEL, style === 'roadster' ? MAT.cognacLeather : MAT.alcantara);
    rimMesh.rotation.z = -Math.PI * 0.28; // centers the open chord cleanly at 6 o'clock (-Y)!
    steerWheel.add(rimMesh);
    part(steerWheel, style === 'roadster' ? paint : MAT.carbon, 0, -0.112, 0, 0.195, 0.032, 0.034, false);
    part(steerWheel, MAT.redIntake, 0, 0.145, 0, 0.024, 0.044, 0.044, false);
    const hub = new THREE.Mesh(CYL, MAT.leather);
    hub.scale.set(0.044, 0.032, 0.044);
    hub.rotation.x = Math.PI / 2;
    steerWheel.add(hub);
    const emblemRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0032, 6, 16), MAT.chrome);
    emblemRing.position.z = -0.018;
    steerWheel.add(emblemRing);
    part(steerWheel, MAT.aluTrim, 0.092, -0.014, -0.004, 0.092, 0.022, 0.016, false);
    part(steerWheel, MAT.aluTrim, -0.092, -0.014, -0.004, 0.092, 0.022, 0.016, false);
    part(steerWheel, MAT.aluTrim, 0, -0.068, -0.004, 0.034, 0.072, 0.016, false);
    for (const sx of [-1, 1]) {
      part(steerWheel, MAT.aluTrim, sx * 0.105, 0.028, 0.022, 0.028, 0.068, 0.008, false);
    }
    signatureProps.push('flat_bottom_sport_wheel');
  } else if (style === 'muscle') {
    // '69 Stallion GT: Vintage Wood-Rimmed Wheel + 3 Brushed Chrome Drilled Spokes!
    const rimMesh = new THREE.Mesh(TORUS_WHEEL, MAT.vintageWood);
    steerWheel.add(rimMesh);
    const hub = new THREE.Mesh(CYL, MAT.chrome);
    hub.scale.set(0.038, 0.034, 0.038);
    hub.rotation.x = Math.PI / 2;
    steerWheel.add(hub);
    part(steerWheel, MAT.chrome, 0.092, -0.008, -0.004, 0.098, 0.024, 0.012, false);
    part(steerWheel, MAT.chrome, -0.092, -0.008, -0.004, 0.098, 0.024, 0.012, false);
    part(steerWheel, MAT.chrome, 0, -0.092, -0.004, 0.024, 0.098, 0.012, false);
    signatureProps.push('vintage_wood_chrome_wheel');
  } else if (style === 'hatch') {
    // Rusty Hatchback: Basic 2-Spoke Molded Plastic Commuter Wheel (no bottom spoke, no paddles!)
    const rimMesh = new THREE.Mesh(TORUS_WHEEL, MAT.trim);
    steerWheel.add(rimMesh);
    part(steerWheel, MAT.trim, 0, -0.012, -0.004, 0.26, 0.044, 0.024, false);
    signatureProps.push('commuter_2spoke_wheel');
  } else {
    // 4-Spoke Executive / Fleet / Truck / Van / G-Wagen / Police Wheel
    const rimMat = style === 'sedan' ? MAT.walnutWood : MAT.leather;
    const rimMesh = new THREE.Mesh(TORUS_WHEEL, rimMat);
    steerWheel.add(rimMesh);
    if (style === 'gwagen') {
      part(steerWheel, MAT.goldMetal, 0, 0.145, 0, 0.024, 0.044, 0.044, false);
    }
    const hub = new THREE.Mesh(CYL, MAT.leather);
    hub.scale.set(0.046, 0.032, 0.046);
    hub.rotation.x = Math.PI / 2;
    steerWheel.add(hub);
    const emblemMat = style === 'taxi' ? MAT.taxiYellow : style === 'sedan' ? MAT.goldMetal : MAT.chrome;
    const emblemRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0032, 6, 16), emblemMat);
    emblemRing.position.z = -0.018;
    steerWheel.add(emblemRing);
    const spokeMat = style === 'pickup' || style === 'van' || style === 'police' ? MAT.trim : MAT.aluTrim;
    part(steerWheel, spokeMat, 0.092, 0.012, -0.004, 0.092, 0.02, 0.016, false);
    part(steerWheel, spokeMat, -0.092, 0.012, -0.004, 0.092, 0.02, 0.016, false);
    part(steerWheel, spokeMat, 0.068, -0.072, -0.004, 0.022, 0.095, 0.016, false).rotation.z = 0.55;
    part(steerWheel, spokeMat, -0.068, -0.072, -0.004, 0.022, 0.095, 0.016, false).rotation.z = -0.55;
    if (style === 'gwagen') {
      for (const sx of [-1, 1]) {
        part(steerWheel, MAT.aluTrim, sx * 0.105, 0.028, 0.022, 0.028, 0.068, 0.008, false);
      }
    }
  }

  // Sculpted 3D driver hands, downward-tapered forearms & seated legs/shoes (visible in Cockpit View)
  const handSkinMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.58 });
  const handSleeveMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.72 });
  const legPantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78 });
  const legShoeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });
  const driverForearmMeshes = [];
  const driverShortCuffs = [];
  const driverShinMeshes = [];

  const driverHands = new THREE.Group();
  driverHands.visible = false;
  for (const sx of [-1, 1]) {
    // Palm + wrapped thumb gripping 9-and-3 on the wheel
    const grip = new THREE.Mesh(HAND_GEO, handSkinMat);
    grip.position.set(sx * 0.144, -0.004, -0.006);
    grip.rotation.z = sx * 0.14;
    driverHands.add(grip);

    const thumb = new THREE.Mesh(THUMB_GEO, handSkinMat);
    thumb.position.set(sx * 0.123, 0.018, -0.012);
    thumb.rotation.z = sx * -0.62;
    driverHands.add(thumb);

    // Tapered forearm angling steeply downward toward the driver's lap/elbow (zero floating cut-offs!)
    const armPivot = new THREE.Group();
    armPivot.position.set(sx * 0.146, -0.022, -0.018);
    armPivot.rotation.x = -0.82; // angles down & back toward seated waist
    armPivot.rotation.z = sx * -0.18;

    const wrist = new THREE.Mesh(JOINT_GEO, handSkinMat);
    wrist.scale.setScalar(0.027);
    armPivot.add(wrist);

    const forearm = new THREE.Mesh(FOREARM_GEO, handSleeveMat);
    forearm.position.set(0, -0.11, 0);
    armPivot.add(forearm);
    driverForearmMeshes.push(forearm);

    const shortCuff = new THREE.Mesh(SHORT_CUFF_GEO, handSleeveMat);
    shortCuff.position.set(0, -0.195, 0);
    shortCuff.visible = false;
    armPivot.add(shortCuff);
    driverShortCuffs.push(shortCuff);

    const elbowCap = new THREE.Mesh(JOINT_GEO, handSleeveMat);
    elbowCap.scale.setScalar(0.036);
    elbowCap.position.set(0, -0.215, 0);
    armPivot.add(elbowCap);
    driverForearmMeshes.push(elbowCap);

    driverHands.add(armPivot);
  }
  steerWheel.add(driverHands);

  // Seated 3D driver thighs, knees, calves & sneakers resting in the bucket seat & reaching to the pedals!
  const driverLegs = new THREE.Group();
  driverLegs.visible = false;
  const thighLen = Math.max(0.28, Math.min(0.4, (zDashFace - zSeat) * 0.56));
  for (const sx of [-1, 1]) {
    const lx = driverX + sx * 0.092;
    const hipPos = new THREE.Vector3(lx, ySeatTop + 0.062, zSeat + 0.02);
    const kneePos = new THREE.Vector3(lx + sx * 0.014, ySeatTop + 0.082, zSeat + 0.04 + thighLen);
    const anklePos = new THREE.Vector3(
      driverX + (sx < 0 ? -0.095 : 0.035),
      yFloor + 0.085,
      Math.min(zPedal - 0.06, kneePos.z + 0.24),
    );

    // Seated thigh along cushion
    const tDir = new THREE.Vector3().subVectors(kneePos, hipPos);
    const tL = tDir.length();
    const thigh = new THREE.Mesh(THIGH_GEO, legPantsMat);
    thigh.scale.set(1, tL / 0.34, 1);
    thigh.position.copy(hipPos).addScaledVector(tDir, 0.5);
    thigh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tDir.clone().normalize());
    driverLegs.add(thigh);

    const knee = new THREE.Mesh(JOINT_GEO, legPantsMat);
    knee.scale.setScalar(0.064);
    knee.position.copy(kneePos);
    driverLegs.add(knee);

    // Lower shin/calf angling down toward the pedals
    const sDir = new THREE.Vector3().subVectors(anklePos, kneePos);
    const sL = sDir.length();
    const shin = new THREE.Mesh(SHIN_GEO, legPantsMat);
    shin.scale.set(1, sL / 0.31, 1);
    shin.position.copy(kneePos).addScaledVector(sDir, 0.5);
    shin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sDir.clone().normalize());
    driverLegs.add(shin);
    driverShinMeshes.push(shin);

    // 3D sneaker / loafer + contrast sole at the pedal
    const shoeGroup = new THREE.Group();
    shoeGroup.position.copy(anklePos);
    shoeGroup.rotation.x = -0.35;
    part(shoeGroup, legShoeMat, 0, 0.015, 0.045, 0.092, 0.058, 0.19, false);
    part(shoeGroup, MAT.plate, 0, -0.014, 0.045, 0.096, 0.018, 0.198, false);
    driverLegs.add(shoeGroup);
  }
  group.add(driverLegs);

  // 7. Framed Cabin Greenhouse (A/B/C pillars, Alcantara headliner, sun visors, rearview mirror & clear glass)
  const yHeader = cabinTop - 0.025;
  if (!openTop) {
    // Slanted A-pillars, vertical B-pillars & rear C-pillars
    for (const sx of [-1, 1]) {
      addStrutBetween(
        group,
        MAT.alcantara,
        new THREE.Vector3(sx * cabW * 0.48, yBelt + 0.02, zWindBase),
        new THREE.Vector3(sx * cabW * 0.44, yHeader, zWindTop),
        0.052,
        0.062,
      );
      addStrutBetween(
        group,
        MAT.alcantara,
        new THREE.Vector3(sx * cabW * 0.48, yBelt + 0.02, zSeat - 0.24),
        new THREE.Vector3(sx * cabW * 0.44, yHeader, zSeat - 0.26),
        0.055,
        0.075,
      );
      addStrutBetween(
        group,
        MAT.alcantara,
        new THREE.Vector3(sx * cabW * 0.48, yBelt + 0.02, zRearCab + 0.04),
        new THREE.Vector3(sx * cabW * 0.44, yHeader, zRearCab + 0.16),
        0.065,
        0.085,
      );
    }
    // Roof headliner + painted exterior top skin (casts shadows & matches body roof)
    const roofLen = Math.max(0.6, zWindTop - zRearCab - 0.06);
    const roofMidZ = (zWindTop + zRearCab) * 0.5 + 0.04;
    part(group, MAT.alcantara, 0, yHeader, roofMidZ, cabW * 0.9, 0.026, roofLen, false);
    const extRoofMat = m.style === 'police' ? MAT.whiteDoor : paint;
    part(group, extRoofMat, 0, cabinTop, roofMidZ, cabW * 0.92, 0.026, roofLen + 0.04, true);

    // Front windshield header + twin sun visors + overhead dome light
    part(group, MAT.alcantara, 0, yHeader - 0.015, zWindTop + 0.02, cabW * 0.88, 0.042, 0.08, false);
    for (const sx of [-1, 1]) {
      part(group, MAT.leather, sx * cabW * 0.24, yHeader - 0.032, zWindTop - 0.03, 0.28, 0.014, 0.11, false);
    }
    part(group, MAT.head, 0, yHeader - 0.03, zWindTop - 0.06, 0.08, 0.01, 0.05, false);

    // Pickup & Van: Heavy-duty A-pillar grab handles + overhead cab storage shelf!
    if (style === 'pickup' || style === 'van') {
      for (const sx of [-1, 1]) {
        part(group, MAT.trim, sx * (cabW * 0.44), yBelt + 0.26, (zWindBase + zWindTop) * 0.5, 0.024, 0.16, 0.028, false);
      }
      part(group, MAT.trim, 0, yHeader - 0.052, zWindTop - 0.01, cabW * 0.78, 0.016, 0.14, false);
      if (style === 'pickup') signatureProps.push('apillar_grab_handles');
    }

    // Subtle clear-tinted front windshield pane
    const wsDx = zWindBase - zWindTop;
    const wsDy = yHeader - (yBelt + 0.04);
    const wsLen = Math.hypot(wsDx, wsDy);
    const wsPane = new THREE.Mesh(new THREE.PlaneGeometry(cabW * 0.88, wsLen), MAT.cabinGlass);
    wsPane.position.set(0, (yHeader + yBelt + 0.04) * 0.5, (zWindTop + zWindBase) * 0.5);
    wsPane.rotation.x = Math.atan2(wsDx, wsDy) - Math.PI;
    group.add(wsPane);
  } else {
    // Open-top roadster: raked frameless windshield, chrome top rail, chrome roll-hoops & painted speedster humps
    const ws = part(group, MAT.cabinGlass, 0, yBelt + 0.24, 0.56, W * 0.82, 0.48, 0.03, false);
    ws.rotation.x = -0.58;
    const wsTop = part(group, MAT.chrome, 0, yBelt + 0.44, 0.43, W * 0.83, 0.032, 0.042, false);
    wsTop.rotation.x = -0.58;
    for (const sx of [-1, 1]) {
      addStrutBetween(
        group,
        MAT.chrome,
        new THREE.Vector3(sx * W * 0.41, yBelt + 0.03, 0.69),
        new THREE.Vector3(sx * W * 0.4, yBelt + 0.44, 0.43),
        0.034,
        0.038,
      );
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.028, 6, 12, Math.PI), MAT.chrome);
      hoop.position.set(sx * Math.abs(driverX), yBelt + 0.19, zSeat - 0.24);
      group.add(hoop);
      const hump = new THREE.Mesh(CYL, paint);
      hump.scale.set(0.24, 0.88, 0.16);
      hump.rotation.x = Math.PI / 2 - 0.12;
      hump.position.set(sx * Math.abs(driverX), yBelt + 0.06, -1.04);
      hump.castShadow = true;
      group.add(hump);
    }
  }

  // Hanging panoramic center rearview mirror (live 3D reflection in Cockpit View!)
  const mirrorY = openTop ? yBelt + 0.38 : yHeader - 0.072;
  const mirrorZ = openTop ? 0.45 : zWindTop + 0.04;
  part(group, MAT.trim, 0, mirrorY + 0.04, mirrorZ + 0.015, 0.016, 0.068, 0.016, false);
  const mirrorHousing = new THREE.Group();
  mirrorHousing.position.set(-0.015, mirrorY, mirrorZ);
  mirrorHousing.rotation.y = -0.15; // angled naturally toward left-hand driver
  part(mirrorHousing, MAT.pianoBlack, 0, 0, 0.006, 0.242, 0.064, 0.016, false);
  part(mirrorHousing, MAT.aluTrim, 0, 0, 0.008, 0.246, 0.068, 0.01, false);
  const rearMirrorLiveMat = new THREE.MeshBasicMaterial({ color: 0xeef5fb });
  const rearMirrorGlass = new THREE.Mesh(MIRROR_GLASS_GEO, MAT.mirrorGlass);
  rearMirrorGlass.scale.set(0.228, 0.052, 1);
  rearMirrorGlass.position.set(0, 0, -0.0035);
  rearMirrorGlass.rotation.y = Math.PI; // faces -Z toward driver
  mirrorHousing.add(rearMirrorGlass);
  // Rusty Hatchback signature charm: hanging green pine-tree air freshener below rearview mirror!
  if (style === 'hatch') {
    part(mirrorHousing, MAT.plate, 0.015, -0.048, -0.002, 0.003, 0.032, 0.003, false);
    const pine = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.058, 4), MAT.pineGreen);
    pine.rotation.y = Math.PI / 4;
    pine.scale.set(1, 1, 0.16);
    pine.position.set(0.015, -0.082, -0.002);
    mirrorHousing.add(pine);
    signatureProps.push('pine_tree_freshener');
  }
  group.add(mirrorHousing);

  // Lazy high-contrast digital OLED gauge & infotainment canvas textures
  let screens = null;
  let screenTimer = 0;

  function ensureScreens() {
    if (screens || typeof document === 'undefined') return screens;
    const c1 = document.createElement('canvas');
    c1.width = 256; c1.height = 96;
    const g1 = c1.getContext('2d');
    const t1 = new THREE.CanvasTexture(c1);
    t1.colorSpace = THREE.SRGBColorSpace;
    clusterMat.map = t1;
    clusterMat.color.setHex(0xffffff);
    clusterMat.needsUpdate = true;

    const c2 = document.createElement('canvas');
    c2.width = 320; c2.height = 144;
    const g2 = c2.getContext('2d');
    const t2 = new THREE.CanvasTexture(c2);
    t2.colorSpace = THREE.SRGBColorSpace;
    infotainMat.map = t2;
    infotainMat.color.setHex(0xffffff);
    infotainMat.needsUpdate = true;

    screens = { c1, g1, t1, c2, g2, t2 };
    return screens;
  }

  function updateScreens(dt, info = {}, force = false) {
    screenTimer -= dt;
    if (!force && screenTimer > 0) return;
    screenTimer = 1 / 12; // crisp 12 Hz dashboard refresh
    const sc = ensureScreens();
    if (!sc) return;

    const speedKmh = Math.round(Math.abs(info.speedMps || 0) * 3.6);
    const maxKmh = Math.max(80, Math.round((m.maxSpeed || 32) * 3.6));
    const speedRatio = Math.min(1, speedKmh / maxKmh);
    const gearNum = speedKmh < 2 ? 0 : Math.min(6, 1 + Math.floor(speedRatio * 5.6));
    const gearStr = (info.speedMps || 0) < -0.6 ? 'R' : speedKmh < 1 ? 'P' : `D${gearNum}`;
    const rpmFrac = gearStr === 'P' ? 0.14 : Math.min(1, 0.24 + ((speedRatio * 5.6) % 1) * 0.62 + (info.throttle > 0 ? 0.14 : 0));
    const accent = info.accentHex || defaultAmbientHex;
    const fuel = Math.round(info.fuel ?? 100);
    const hp = Math.round(info.hp ?? 100);

    // --- 1. Bespoke Per-Vehicle Driver Instrument Cluster ---
    const { g1, t1 } = sc;
    const cTheme = theme.clusterTheme;
    const isAnalog = cTheme === 'analog_amber' || cTheme === 'exec_ivory' || cTheme === 'retro_chrome69';
    const isCentralRing = cTheme === 'amg_supersport' || cTheme === 'chrono_yellow';

    if (isAnalog) {
      // Twin sweeping analog circular dials (Amber Hatchback / Ivory-Gold Executive Sedan / '69 Green-Chrome Muscle)
      g1.fillStyle = cTheme === 'exec_ivory' ? '#131620' : '#09090b';
      g1.fillRect(0, 0, 256, 96);
      const ringCol = cTheme === 'analog_amber' ? '#f59e0b' : cTheme === 'exec_ivory' ? '#fbbf24' : '#cbd5e1';
      const faceCol = cTheme === 'exec_ivory' ? '#1e2433' : '#111318';
      const needleCol = cTheme === 'retro_chrome69' ? '#4ade80' : '#ef4444';
      const drawDial = (cx, cy, r, frac, label, valTxt) => {
        g1.fillStyle = faceCol;
        g1.beginPath(); g1.arc(cx, cy, r, 0, Math.PI * 2); g1.fill();
        g1.strokeStyle = ringCol; g1.lineWidth = 3;
        g1.beginPath(); g1.arc(cx, cy, r, 0, Math.PI * 2); g1.stroke();
        const a0 = Math.PI * 0.78;
        const a1 = a0 + Math.PI * 1.44 * Math.min(1, Math.max(0, frac));
        g1.strokeStyle = needleCol; g1.lineWidth = 2.6;
        g1.beginPath();
        g1.moveTo(cx, cy);
        g1.lineTo(cx + Math.cos(a1) * (r - 6), cy + Math.sin(a1) * (r - 6));
        g1.stroke();
        g1.fillStyle = '#f8fafc';
        g1.font = 'bold 13px system-ui, sans-serif';
        g1.textAlign = 'center'; g1.textBaseline = 'middle';
        g1.fillText(valTxt, cx, cy + 12);
        g1.fillStyle = ringCol;
        g1.font = 'bold 9px system-ui, sans-serif';
        g1.fillText(label, cx, cy - 11);
      };
      drawDial(66, 49, 39, speedRatio, 'KM/H', String(speedKmh));
      drawDial(190, 49, 39, rpmFrac, 'RPM', gearStr);
      g1.fillStyle = fuel < 25 ? '#ef4444' : ringCol;
      g1.font = 'bold 10px system-ui, sans-serif';
      g1.textAlign = 'center';
      g1.fillText(`F:${fuel}%`, 128, 36);
      g1.fillStyle = '#94a3b8';
      g1.fillText(`HP:${hp}%`, 128, 62);
    } else if (isCentralRing) {
      // AMG Supersport / Roadster Chronosport: Central Racing Tachometer Ring!
      const ringAccent = cTheme === 'chrono_yellow' ? '#facc15' : accent;
      g1.fillStyle = '#050811';
      g1.fillRect(0, 0, 256, 96);
      g1.strokeStyle = '#1e293b'; g1.lineWidth = 7;
      g1.beginPath(); g1.arc(128, 50, 39, Math.PI * 0.75, Math.PI * 2.25); g1.stroke();
      g1.strokeStyle = rpmFrac > 0.82 ? '#ef4444' : ringAccent; g1.lineWidth = 7;
      g1.beginPath(); g1.arc(128, 50, 39, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * rpmFrac)); g1.stroke();
      g1.fillStyle = '#f8fafc';
      g1.font = 'bold 28px system-ui, sans-serif';
      g1.textAlign = 'center'; g1.textBaseline = 'middle';
      g1.fillText(String(speedKmh), 128, 46);
      g1.fillStyle = ringAccent;
      g1.font = 'bold 11px system-ui, sans-serif';
      g1.fillText(`${gearStr} · KM/H`, 128, 69);
      g1.textAlign = 'left';
      g1.fillStyle = '#38bdf8'; g1.fillText(`FUEL ${fuel}%`, 10, 34);
      g1.fillStyle = '#f43f5e'; g1.fillText('V12 BOOST', 10, 62);
      g1.textAlign = 'right';
      g1.fillStyle = '#4ade80'; g1.fillText(`HP ${hp}%`, 246, 34);
      g1.fillStyle = ringAccent; g1.fillText(cTheme === 'chrono_yellow' ? 'CHRONO' : 'RACE+', 246, 62);
    } else {
      // Digital Telemetry / F1 Bar / Off-Road / Fleet / Police Pursuit Cluster
      g1.fillStyle = cTheme === 'police_pursuit' ? '#070b19' : '#050811';
      g1.fillRect(0, 0, 256, 96);
      g1.strokeStyle = cTheme === 'police_pursuit' ? '#3b82f6' : accent;
      g1.lineWidth = 2;
      g1.strokeRect(3, 3, 250, 90);

      const segs = cTheme === 'hyper_f1_bar' ? 22 : 18;
      const segW = cTheme === 'hyper_f1_bar' ? 10.4 : 12.8;
      for (let i = 0; i < segs; i++) {
        const lit = (i + 1) / segs <= rpmFrac;
        g1.fillStyle = !lit ? '#1e293b' : i >= segs * 0.78 ? '#ef4444' : i >= segs * 0.58 ? '#f59e0b' : accent;
        g1.fillRect(14 + i * segW, 10, segW - 2.4, 9);
      }

      g1.fillStyle = '#f8fafc';
      g1.font = 'bold 40px system-ui, sans-serif';
      g1.textAlign = 'center';
      g1.textBaseline = 'middle';
      g1.fillText(String(speedKmh).padStart(3, '0'), 128, 52);

      const subLabel = cTheme === 'police_pursuit' ? 'CERTIFIED PURSUIT'
        : cTheme === 'offroad_dual' || cTheme === 'truck_rugged' ? '4X4 LOCK · KM/H'
        : cTheme === 'taxi_fleet' ? 'CAB METER · KM/H'
        : cTheme === 'hyper_f1_bar' ? 'ERS ACTIVE · KM/H'
        : 'KM/H';
      g1.fillStyle = '#94a3b8';
      g1.font = 'bold 10px system-ui, sans-serif';
      g1.fillText(subLabel, 128, 80);

      g1.fillStyle = '#0f172a';
      g1.fillRect(14, 34, 48, 44);
      g1.strokeStyle = accent;
      g1.strokeRect(14, 34, 48, 44);
      g1.fillStyle = accent;
      g1.font = 'bold 24px system-ui, sans-serif';
      g1.fillText(gearStr, 38, 57);

      g1.textAlign = 'right';
      g1.font = 'bold 13px system-ui, sans-serif';
      g1.fillStyle = fuel < 25 ? '#ef4444' : '#38bdf8';
      g1.fillText(`FUEL ${fuel}%`, 240, 46);
      g1.fillStyle = hp < 35 ? '#ef4444' : '#4ade80';
      g1.fillText(`BODY ${hp}%`, 240, 68);
    }
    t1.needsUpdate = true;

    // --- 2. Bespoke Center Stack Display (Retro DIN FM / '69 Chrome AM-FM / Police MDT / Live GPS Radar) ---
    const { g2, t2 } = sc;
    const ctrTheme = theme.centerTheme;
    if (ctrTheme === 'retro_din_fm') {
      // Rusty Hatchback: Single-DIN Green Matrix FM Radio + Manual HVAC Legend!
      g2.fillStyle = '#090d0a';
      g2.fillRect(0, 0, 320, 144);
      g2.strokeStyle = '#22c55e';
      g2.lineWidth = 3;
      g2.strokeRect(8, 10, 304, 124);
      g2.fillStyle = '#4ade80';
      g2.font = 'bold 28px monospace';
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('FM 98.4 MHz', 160, 52);
      g2.font = 'bold 15px monospace';
      g2.fillStyle = '#86efac';
      g2.fillText(`METRO BEATS · ${info.clockHHMM || '08:00'}`, 160, 92);
      g2.font = '12px monospace';
      g2.fillStyle = '#16a34a';
      g2.fillText('[1] [2] [3] [4] [BASS+]', 160, 118);
    } else if (ctrTheme === 'retro_amfm') {
      // '69 Stallion GT: Vintage Chrome Push-Button AM/FM Analog Dial Scale!
      g2.fillStyle = '#14110f';
      g2.fillRect(0, 0, 320, 144);
      g2.strokeStyle = '#d4d4d8'; g2.lineWidth = 4;
      g2.strokeRect(6, 8, 308, 128);
      g2.fillStyle = '#fef3c7';
      g2.font = 'bold 18px serif';
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('54   70   90   110   140   160  AM', 160, 46);
      g2.strokeStyle = '#ef4444'; g2.lineWidth = 4;
      g2.beginPath(); g2.moveTo(148, 22); g2.lineTo(148, 72); g2.stroke();
      for (let b = 0; b < 5; b++) {
        g2.fillStyle = '#cbd5e1';
        g2.fillRect(34 + b * 54, 92, 38, 26);
      }
    } else {
      g2.fillStyle = '#070b16';
      g2.fillRect(0, 0, 320, 144);

      g2.fillStyle = ctrTheme === 'police_mdt' ? '#1e3a8a' : '#0f172a';
      g2.fillRect(0, 0, 320, 26);
      g2.fillStyle = ctrTheme === 'taxi_dispatch' ? '#facc15' : accent;
      g2.font = 'bold 12px system-ui, sans-serif';
      g2.textAlign = 'left';
      g2.textBaseline = 'middle';
      const headerTxt = ctrTheme === 'police_mdt' ? 'METRO PD · NCIC TACTICAL'
        : ctrTheme === 'taxi_dispatch' ? 'METRO CAB · DISPATCH LIVE'
        : ctrTheme === 'cargo_log' ? 'SWIFTCARGO · FLEET ROUTE'
        : m.name.toUpperCase().slice(0, 22);
      g2.fillText(headerTxt, 10, 13);
      g2.fillStyle = '#e2e8f0';
      g2.textAlign = 'right';
      g2.fillText(info.clockHHMM || '08:00', 310, 13);

      const mapCx = 104;
      const mapCy = 82;
      const scale = 0.34;
      g2.save();
      g2.beginPath();
      g2.rect(8, 30, 192, 104);
      g2.clip();
      g2.fillStyle = '#0b1324';
      g2.fillRect(8, 30, 192, 104);
      g2.translate(mapCx, mapCy);
      g2.rotate((info.yaw || 0) - Math.PI);
      const px = info.x || 0;
      const pz = info.z || 0;
      g2.strokeStyle = '#334155';
      g2.lineWidth = 4;
      for (const r of ROAD_LINES) {
        g2.beginPath();
        g2.moveTo((r - px) * scale, (-170 - pz) * scale);
        g2.lineTo((r - px) * scale, (170 - pz) * scale);
        g2.stroke();
        g2.beginPath();
        g2.moveTo((-170 - px) * scale, (r - pz) * scale);
        g2.lineTo((170 - px) * scale, (r - pz) * scale);
        g2.stroke();
      }
      // Show Metro Grand University campus landmark on in-car GPS!
      const ux = (0 - px) * scale;
      const uz = (-196 - pz) * scale;
      g2.fillStyle = '#3b82f6';
      g2.fillRect(ux - 14, uz - 5, 28, 10);
      if (info.waypoint) {
        const wx = (info.waypoint.x - px) * scale;
        const wz = (info.waypoint.z - pz) * scale;
        g2.strokeStyle = '#f43f5e';
        g2.lineWidth = 2;
        g2.beginPath();
        g2.moveTo(0, 0);
        g2.lineTo(wx, wz);
        g2.stroke();
        g2.fillStyle = '#fbbf24';
        g2.beginPath();
        g2.arc(wx, wz, 5, 0, Math.PI * 2);
        g2.fill();
      }
      g2.restore();

      g2.fillStyle = accent;
      g2.beginPath();
      g2.moveTo(mapCx, mapCy - 6);
      g2.lineTo(mapCx + 4.5, mapCy + 5);
      g2.lineTo(mapCx - 4.5, mapCy + 5);
      g2.closePath();
      g2.fill();
      g2.strokeStyle = '#1e293b';
      g2.lineWidth = 1.5;
      g2.strokeRect(8, 30, 192, 104);

      g2.fillStyle = '#0f172a';
      g2.fillRect(208, 30, 104, 104);
      g2.fillStyle = accent;
      g2.textAlign = 'left';
      g2.font = 'bold 11px system-ui, sans-serif';
      const cardTitle = ctrTheme === 'police_mdt' ? 'APB UNIT 04'
        : ctrTheme === 'taxi_dispatch' ? 'RATE 1 · HIRED'
        : ctrTheme === 'hyper_telem' ? 'AERO · V12'
        : ctrTheme === 'truck_util' ? '4WD TORQUE'
        : ctrTheme === 'cargo_log' ? 'MANIFEST OK'
        : isExotic ? 'TRACK MODE' : 'COMFORT+';
      g2.fillText(cardTitle, 214, 46);
      g2.fillStyle = '#f8fafc';
      g2.font = 'bold 15px system-ui, sans-serif';
      g2.fillText(`${speedKmh} km/h`, 214, 70);
      g2.fillStyle = '#94a3b8';
      g2.font = '11px system-ui, sans-serif';
      g2.fillText(ctrTheme === 'police_mdt' ? 'RADAR ACTIVE' : 'METRO FM · LIVE', 214, 94);
      g2.fillStyle = '#4ade80';
      g2.fillText(ctrTheme === 'taxi_dispatch' ? '+30% CAB BONUS' : 'A/C 20.5°C', 214, 116);
    }
    t2.needsUpdate = true;
  }

  return {
    group,
    styleId: style,
    wheelType: theme.wheelType,
    clusterTheme: theme.clusterTheme,
    centerTheme: theme.centerTheme,
    signatureProps,
    driverEye,
    steerWheel,
    driverHands,
    driverLegs,
    rearMirrorGlass,
    rearMirrorAnchor: { x: 0, y: eyeY + 0.03, z: zRearCab - 0.1 },
    ambientMat,
    setSteer(steerRad) {
      steerWheel.rotation.z = steerRad * 1.65;
    },
    setDriverLook({
      skin, shirt, topStyle, pants, bottomStyle, shoeColor, showHands = true,
    } = {}) {
      if (skin) handSkinMat.color.set(skin);
      if (shirt) handSleeveMat.color.set(shirt);
      if (pants) legPantsMat.color.set(pants);
      if (shoeColor) legShoeMat.color.set(shoeColor);

      const shortSleeves = topStyle === 'tee' || topStyle === 'jersey';
      for (const fm of driverForearmMeshes) fm.material = shortSleeves ? handSkinMat : handSleeveMat;
      for (const sc of driverShortCuffs) sc.visible = topStyle === 'tee';

      const wearShorts = bottomStyle === 'shorts';
      for (const sm of driverShinMeshes) sm.material = wearShorts ? handSkinMat : legPantsMat;

      driverHands.visible = !!showHands;
      driverLegs.visible = !!showHands;
    },
    setRearMirrorTexture(tex) {
      if (tex) {
        rearMirrorLiveMat.map = tex;
        rearMirrorLiveMat.needsUpdate = true;
        rearMirrorGlass.material = rearMirrorLiveMat;
      } else {
        rearMirrorGlass.material = MAT.mirrorGlass;
      }
    },
    setAmbientColor(hex) {
      ambientMat.color.set(hex || defaultAmbientHex);
    },
    updateScreens,
    dispose() {
      ambientMat.dispose();
      clusterMat.dispose();
      infotainMat.dispose();
      rearMirrorLiveMat.dispose();
      handSkinMat.dispose();
      handSleeveMat.dispose();
      legPantsMat.dispose();
      legShoeMat.dispose();
      if (screens) {
        screens.t1.dispose();
        screens.t2.dispose();
      }
    },
  };
}

// Build a sculpted PBR car. The car faces +Z; the driver sits on the left (+X) side.
export function buildCarMesh(modelId, color, opts = {}) {
  const m = VEHICLE_MODELS[modelId] || VEHICLE_MODELS.sedan;
  const fxTex = getFXTextures();
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Metallic automotive clearcoat PBR paint
  const paint = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color || m.fixedColor || '#2563eb'),
    metalness: m.style === 'taxi' ? 0.28 : m.style === 'hyper' ? 0.66 : 0.56,
    roughness: m.style === 'pickup' ? 0.3 : m.style === 'hyper' ? 0.16 : 0.22,
    clearcoat: 0.94,
    clearcoatRoughness: 0.09,
    envMapIntensity: 1.5,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(RIM_FINISHES[opts.rims]?.hex || RIM_FINISHES.silver.hex),
    roughness: 0.22,
    metalness: 0.88,
  });
  const stripeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.22,
    metalness: 0.45,
    clearcoat: 0.9,
  });
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x991b1b });

  const L = m.len;
  const W = m.wid;
  const { hullGeo, cockpitHullGeo, roofGeo, glassGeo, yBot, yBelt, bounds } = getSculptedGeometries(m.id);
  const cabinTop = yBelt + m.cabinH;
  const wz = L / 2 - m.wheelR - 0.38;

  // Sculpted lower chassis (swaps to deep hollowed cockpitHullGeo in Cockpit View & on open-top roadsters!)
  const hullMesh = new THREE.Mesh(m.style === 'roadster' ? cockpitHullGeo : hullGeo, paint);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  body.add(hullMesh);

  const exteriorCabin = new THREE.Group();
  body.add(exteriorCabin);

  // Sculpted aerodynamic Left (+X) & Right (-X) Wing Mirrors angled toward the driver (with live 3D reflection support!)
  const leftMirrorLiveMat = new THREE.MeshBasicMaterial({ color: 0xeef5fb });
  const rightMirrorLiveMat = new THREE.MeshBasicMaterial({ color: 0xeef5fb });
  let leftMirrorGlass = null;
  let rightMirrorGlass = null;
  const wingMirZ = m.style === 'van'
    ? L / 2 - 0.62
    : bounds.zSeat + (bounds.zWindBase - bounds.zSeat) * 0.56;
  const wingMirY = yBelt + (m.style === 'van' ? 0.17 : 0.088);
  const wingMirHalfX = W * 0.5 + 0.072;

  for (const sx of [-1, 1]) {
    const mx = sx * wingMirHalfX;
    // Aerodynamic mirror stalk connecting door skin to mirror housing
    addStrutBetween(
      body,
      MAT.trim,
      new THREE.Vector3(sx * (W * 0.5 - 0.02), yBelt + 0.025, wingMirZ + 0.03),
      new THREE.Vector3(mx, wingMirY, wingMirZ),
      0.026,
      0.034,
    );
    const wingGroup = new THREE.Group();
    wingGroup.position.set(mx, wingMirY, wingMirZ);
    wingGroup.rotation.y = sx * -0.24; // angled inward so driver looks squarely into mirror face!
    const mW = 0.165;
    const mH = m.style === 'van' || m.style === 'gwagen' ? 0.125 : 0.096;
    part(wingGroup, paint, 0, 0, 0.024, mW, mH, 0.068, false);
    part(wingGroup, MAT.pianoBlack, 0, 0, -0.008, mW + 0.008, mH + 0.008, 0.018, false);
    const glassPane = new THREE.Mesh(MIRROR_GLASS_GEO, MAT.mirrorGlass);
    glassPane.scale.set(mW - 0.014, mH - 0.014, 1);
    glassPane.position.set(0, 0, -0.019);
    glassPane.rotation.y = Math.PI; // faces -Z toward driver with horizontally flipped UVs
    wingGroup.add(glassPane);
    body.add(wingGroup);
    if (sx > 0) leftMirrorGlass = glassPane;
    else rightMirrorGlass = glassPane;
  }

  if (m.style === 'van') {
    const vanTop = new THREE.Mesh(roofGeo, paint);
    vanTop.castShadow = true;
    vanTop.receiveShadow = true;
    exteriorCabin.add(vanTop);
    part(exteriorCabin, MAT.glass, 0, yBelt + m.cabinH * 0.52, L / 2 - 0.34, W * 0.86, m.cabinH * 0.56, 0.14, false);
    for (const sx of [-1, 1]) {
      part(exteriorCabin, MAT.glass, sx * W * 0.48, yBelt + m.cabinH * 0.54, L * 0.18, 0.04, m.cabinH * 0.46, 1.05, false);
      part(body, MAT.checker, sx * W * 0.485, yBelt + 0.14, -0.45, 0.03, 0.12, L * 0.58, false);
    }
  } else if (m.style === 'roadster') {
    for (const sx of [-1, 1]) {
      part(body, MAT.chrome, sx * (W * 0.5 + 0.005), yBelt - 0.08, -0.18, 0.03, 0.04, 0.18, false);
    }
  } else {
    const roofMat = m.style === 'police' ? MAT.whiteDoor : paint;
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    exteriorCabin.add(roofMesh);

    const glassMesh = new THREE.Mesh(glassGeo, MAT.glass);
    exteriorCabin.add(glassMesh);

    for (const sx of [-1, 1]) {
      part(body, MAT.chrome, sx * (W * 0.5 + 0.005), yBelt - 0.08, m.cabinZ - 0.08, 0.03, 0.04, 0.18, false);
    }
  }

  let cockpit = null;
  if (m.style === 'roadster' || opts.withInterior) {
    cockpit = buildCockpitRig(m, {
      paint,
      yBot,
      yBelt,
      cabinTop,
      bounds,
      openTop: m.style === 'roadster',
    });
    cockpit.group.visible = m.style === 'roadster';
    body.add(cockpit.group);
  }

  // Dark wheel-arch recesses + flared fenders
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const well = new THREE.Mesh(CYL, MAT.archWell);
    well.scale.set(m.wheelR * 1.15, 0.16, m.wheelR * 1.15);
    well.rotation.z = Math.PI / 2;
    well.position.set(sx * (W * 0.46), m.wheelR + 0.02, sz * wz);
    body.add(well);
  }

  // Front radiator grille, chrome surround & sculpted bumpers
  const frontY = yBot + (yBelt - yBot) * 0.46;
  part(body, MAT.grille, 0, frontY, L / 2 + 0.008, W * 0.54, 0.22, 0.05, false);
  part(body, MAT.chrome, 0, frontY + 0.115, L / 2 + 0.015, W * 0.56, 0.025, 0.05, false);
  part(body, MAT.chrome, 0, frontY, L / 2 + 0.02, W * 0.54, 0.03, 0.05, false);
  // Lower front splitter & rear diffuser/bumper
  part(body, MAT.trim, 0, yBot + 0.05, L / 2 + 0.03, W * 0.96, 0.12, 0.12);
  part(body, MAT.trim, 0, yBot + 0.07, -L / 2 - 0.03, W * 0.96, 0.16, 0.12);
  part(body, MAT.plate, 0, frontY - 0.06, -L / 2 - 0.05, 0.52, 0.14, 0.03, false);
  // Dual chrome exhaust tailpipes
  for (const sx of [-1, 1]) {
    const pipe = new THREE.Mesh(CYL, MAT.chrome);
    pipe.scale.set(0.055, 0.18, 0.055);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx * W * 0.3, yBot + 0.05, -L / 2 - 0.06);
    body.add(pipe);
  }

  // Hood geometry helper so scoops/stripes stay strictly on the hood forward of the windshield
  const hoodStartZ = bounds.zWindBase + 0.05;
  const hoodEndZ = L / 2 - 0.12;
  const hoodSpan = Math.max(0.32, hoodEndZ - hoodStartZ);
  const hoodMidZ = (hoodStartZ + hoodEndZ) * 0.5;

  // Model-specific styling
  if (m.style === 'pickup') {
    const bedLen = L / 2 - (m.cabinZ - m.cabinLen / 2) - 0.12;
    const bedZ = -L / 2 + bedLen / 2 + 0.06;
    part(body, MAT.trim, 0, yBelt - 0.14, bedZ, W - 0.24, 0.04, bedLen - 0.14, false);
    part(body, MAT.chrome, 0, yBot + 0.1, L / 2 + 0.06, W * 0.92, 0.16, 0.08);
    // Muscular hood power dome
    part(body, paint, 0, yBelt + 0.04, hoodMidZ, W * 0.46, 0.08, hoodSpan * 0.78);
  }

  if (m.style === 'sports' || m.style === 'sedan') {
    // Sculpted hood power dome / muscle intake scoop
    part(body, paint, 0, yBelt + 0.045, hoodMidZ, W * 0.42, 0.085, hoodSpan * 0.78);
    if (m.style === 'sports') {
      const scoopLen = Math.min(0.52, hoodSpan * 0.56);
      part(body, MAT.chrome, 0, yBelt + 0.11, hoodMidZ + 0.04, 0.36, 0.11, scoopLen);
      part(body, MAT.grille, 0, yBelt + 0.11, hoodMidZ + 0.04 + scoopLen * 0.5, 0.32, 0.08, 0.04, false);
      // Rear GT wing spoiler
      part(body, paint, 0, yBelt + 0.28, -L / 2 + 0.24, W * 0.92, 0.05, 0.32);
      for (const sx of [-1, 1]) {
        part(body, MAT.trim, sx * W * 0.34, yBelt + 0.15, -L / 2 + 0.24, 0.05, 0.24, 0.12);
      }
    }
  }

  if (m.style === 'muscle') {
    // '69 Stallion GT: towering chrome supercharger blower + red butterfly scoop + ducktail lip + louvers
    const blowerZ = Math.max(hoodStartZ + 0.36, L * 0.24);
    part(body, MAT.trim, 0, yBelt + 0.03, blowerZ, 0.58, 0.07, 0.68);
    part(body, MAT.chrome, 0, yBelt + 0.14, blowerZ, 0.44, 0.18, 0.52);
    part(body, MAT.redIntake, 0, yBelt + 0.18, blowerZ + 0.26, 0.36, 0.09, 0.03, false);
    // Deep shark-nose blackout grille + dual inner fog lamps
    part(body, MAT.grille, 0, frontY + 0.04, L / 2 + 0.025, W * 0.74, 0.24, 0.06, false);
    for (const sx of [-1, 1]) {
      const fog = new THREE.Mesh(CYL, MAT.head);
      fog.scale.set(0.08, 0.04, 0.08);
      fog.rotation.x = Math.PI / 2;
      fog.position.set(sx * W * 0.19, frontY + 0.04, L / 2 + 0.05);
      body.add(fog);
    }
    // Kicked-up rear ducktail lip spoiler
    const duck = part(body, MAT.carbon, 0, yBelt + 0.14, -L / 2 + 0.09, W * 0.92, 0.14, 0.16);
    duck.rotation.x = -0.35;
  }

  if (m.style === 'gwagen') {
    // Benz G-Wagen 4x4: chrome bullbar, raised fender indicators, side running boards & rear spare wheel!
    part(body, MAT.chrome, 0, frontY + 0.04, L / 2 + 0.12, W * 0.62, 0.36, 0.07);
    for (const sx of [-1, 1]) {
      part(body, MAT.chrome, sx * W * 0.28, frontY + 0.06, L / 2 + 0.12, 0.06, 0.46, 0.09);
      // Raised G-Class front fender turn-signal pods
      part(body, MAT.amber, sx * W * 0.41, yBelt + 0.045, L / 2 - 0.34, 0.09, 0.06, 0.18, false);
      // Squared off-road fender flares + side running boards + side-exit dual chrome pipes
      part(body, MAT.trim, sx * (W * 0.5 + 0.02), yBot + 0.06, 0, 0.11, 0.07, L * 0.54);
      for (const ez of [-0.45, -0.62]) {
        const sp = new THREE.Mesh(CYL, MAT.chrome);
        sp.scale.set(0.042, 0.16, 0.042);
        sp.rotation.z = Math.PI / 2;
        sp.position.set(sx * (W * 0.5 + 0.06), yBot + 0.02, ez);
        body.add(sp);
      }
    }
    // Expedition roof rack + 4 off-road LED light pods
    part(body, MAT.trim, 0, cabinTop + 0.06, m.cabinZ - 0.05, W * 0.82, 0.05, m.cabinLen * 0.82);
    for (const lx of [-0.48, -0.16, 0.16, 0.48]) {
      part(body, MAT.head, lx, cabinTop + 0.12, m.cabinZ + m.cabinLen * 0.36, 0.16, 0.09, 0.08, false);
    }
    // Iconic rear tailgate 3D spare tyre cover + chrome band
    const spareCover = new THREE.Mesh(CYL, paint);
    spareCover.scale.set(0.42, 0.24, 0.42);
    spareCover.rotation.x = Math.PI / 2;
    spareCover.position.set(0.14, yBelt + 0.06, -L / 2 - 0.12);
    spareCover.castShadow = true;
    body.add(spareCover);
    const spareRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.032, 6, 20), MAT.chrome);
    spareRing.position.set(0.14, yBelt + 0.06, -L / 2 - 0.14);
    body.add(spareRing);
  }

  if (m.style === 'hyper') {
    // Valkyrie X12 Hypercar: front carbon splitter, side V12 air scoops, rear engine spine, swan-neck GT wing & quad central exhausts!
    part(body, MAT.carbon, 0, yBot + 0.02, L / 2 + 0.08, W * 1.01, 0.05, 0.28);
    for (const sx of [-1, 1]) {
      // Side carbon skirts + deep mid-engine air intakes
      part(body, MAT.carbon, sx * (W * 0.5 + 0.015), yBot + 0.03, -0.05, 0.08, 0.06, L * 0.56);
      part(body, MAT.grille, sx * (W * 0.48), yBelt - 0.08, -0.36, 0.12, 0.24, 0.68, false);
      // Carbon swan-neck wing pylons & endplates
      part(body, MAT.carbon, sx * W * 0.26, yBelt + 0.22, -L / 2 + 0.28, 0.04, 0.32, 0.18);
      part(body, MAT.carbon, sx * W * 0.49, yBelt + 0.34, -L / 2 + 0.22, 0.03, 0.22, 0.38);
    }
    // Wide carbon GT wing + louvered mid-engine spine (kept strictly behind cabin rear bulkhead)
    const spineRear = -L / 2 + 0.24;
    const spineFront = Math.min(-0.62, bounds.zRearCab - 0.04);
    const spineLen = Math.max(0.32, spineFront - spineRear);
    part(body, MAT.carbon, 0, yBelt + 0.37, -L / 2 + 0.22, W * 0.98, 0.045, 0.34);
    part(body, MAT.carbon, 0, yBelt + 0.14, (spineRear + spineFront) * 0.5, 0.34, 0.12, spineLen);
    // High-mounted quad central exhaust cannons
    for (const ex of [-0.21, -0.07, 0.07, 0.21]) {
      const cannon = new THREE.Mesh(CYL, MAT.goldMetal);
      cannon.scale.set(0.048, 0.18, 0.048);
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(ex, yBelt - 0.1, -L / 2 - 0.06);
      body.add(cannon);
    }
  }

  // Dynamic Custom Livery Group (Twin Racing Stripes / 24k Gold Stripes / Carbon Aero Hood)
  const liveryGroup = new THREE.Group();
  liveryGroup.visible = false;
  const twinStripes = new THREE.Group();
  const rearDeckEnd = bounds.zRearCab - 0.05;
  const rearDeckStart = -L / 2 + 0.16;
  const rearDeckSpan = Math.max(0.22, rearDeckEnd - rearDeckStart);
  const rearDeckMid = (rearDeckEnd + rearDeckStart) * 0.5;
  for (const sx of [-0.16, 0.16]) {
    if (m.style !== 'van') {
      part(twinStripes, stripeMat, sx, yBelt + 0.025, hoodMidZ, 0.13, 0.016, hoodSpan * 0.88, false);
    }
    if (m.style !== 'roadster' && m.style !== 'pickup') {
      part(twinStripes, stripeMat, sx, cabinTop + 0.016, m.cabinZ - 0.04, 0.13, 0.015, m.cabinLen * 0.56, false);
    }
    if (m.style !== 'gwagen' && m.style !== 'van' && rearDeckEnd > rearDeckStart + 0.18) {
      part(twinStripes, stripeMat, sx, yBelt + 0.03, rearDeckMid, 0.13, 0.016, rearDeckSpan * 0.82, false);
    }
  }
  const carbonHood = new THREE.Group();
  if (m.style !== 'van') {
    part(carbonHood, MAT.carbon, 0, yBelt + 0.024, hoodMidZ, W * 0.58, 0.018, hoodSpan * 0.9, false);
  }
  if (m.style !== 'roadster' && m.style !== 'van' && m.style !== 'police') {
    part(carbonHood, MAT.carbon, 0, cabinTop + 0.016, m.cabinZ - 0.04, W * 0.56, 0.016, m.cabinLen * 0.54, false);
  }
  liveryGroup.add(twinStripes, carbonHood);
  body.add(liveryGroup);

  // Street Neon Underglow Pad (hugs the asphalt under the car!)
  const underglowMat = new THREE.MeshBasicMaterial({
    map: fxTex.flareWhite,
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const underglowGeo = new THREE.PlaneGeometry(W * 1.65, L * 1.24);
  underglowGeo.rotateX(-Math.PI / 2);
  const underglowMesh = new THREE.Mesh(underglowGeo, underglowMat);
  underglowMesh.position.set(0, 0.055, 0);
  underglowMesh.visible = false;
  group.add(underglowMesh);

  if (m.style === 'taxi') {
    if (!taxiSignTex) taxiSignTex = makeTextTexture('TAXI', { width: 128, height: 48, bg: '#fde047', fg: '#111827', font: 'bold 34px system-ui, sans-serif' });
    const signMat = new THREE.MeshBasicMaterial({ map: taxiSignTex });
    part(body, signMat, 0, cabinTop + 0.11, m.cabinZ, 0.68, 0.2, 0.28, false);
    for (const sx of [-1, 1]) {
      part(body, MAT.checker, sx * (W / 2 + 0.008), yBelt - 0.16, 0, 0.02, 0.1, L * 0.76, false);
    }
  }

  let lightbar = null;
  if (m.style === 'police') {
    if (!policeDoorTex) {
      policeDoorTex = makeTextTexture(['POLICE', 'METRO INTERCEPTOR'], {
        width: 256, height: 96, bg: '#f8fafc', fg: '#0f172a', font: 'bold 42px system-ui, sans-serif',
      });
    }
    const doorMat = new THREE.MeshStandardMaterial({ map: policeDoorTex, roughness: 0.3, metalness: 0.2 });
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.42), doorMat);
      door.position.set(sx * (W / 2 + 0.016), yBelt - 0.18, -0.05);
      door.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      body.add(door);
    }
    // Heavy front push-bar bullbar
    part(body, MAT.trim, 0, frontY, L / 2 + 0.1, W * 0.56, 0.32, 0.08);
    part(body, MAT.trim, -W * 0.22, frontY + 0.04, L / 2 + 0.11, 0.07, 0.42, 0.1);
    part(body, MAT.trim, W * 0.22, frontY + 0.04, L / 2 + 0.11, 0.07, 0.42, 0.1);

    // Rooftop red/blue LED strobe lightbar
    const barGroup = new THREE.Group();
    barGroup.position.set(0, cabinTop + 0.08, m.cabinZ - 0.05);
    part(barGroup, MAT.trim, 0, 0, 0, 0.24, 0.09, 0.22, false);
    part(barGroup, MAT.sirenRed, 0.34, 0.02, 0, 0.44, 0.1, 0.2, false);
    part(barGroup, MAT.sirenBlue, -0.34, 0.02, 0, 0.44, 0.1, 0.2, false);
    const redFlare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: fxTex.flareRed, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    redFlare.position.set(0.36, 0.06, 0);
    redFlare.scale.set(1.3, 1.3, 1);
    const blueFlare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: fxTex.flareBlue, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    blueFlare.position.set(-0.36, 0.06, 0);
    blueFlare.scale.set(1.3, 1.3, 1);
    barGroup.add(redFlare, blueFlare);
    body.add(barGroup);
    lightbar = { group: barGroup, redFlare, blueFlare };
  }

  // Headlights, wide red tail-lamps, volumetric night cones & additive lens-flare halos!
  const headBeams = new THREE.Group();
  headBeams.visible = false;
  const headFlares = [];
  const tailFlares = [];

  const headFlareMat = new THREE.SpriteMaterial({
    map: fxTex.flareWhite,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const tailFlareMat = new THREE.SpriteMaterial({
    map: fxTex.flareRed,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });

  const headY = frontY + 0.06;
  const tailY = yBelt - 0.12;
  for (const sx of [-1, 1]) {
    // Xenon projector + amber corner indicator
    part(body, MAT.head, sx * W * 0.35, headY, L / 2 + 0.015, W * 0.18, 0.11, 0.04, false);
    part(body, MAT.amber, sx * W * 0.45, headY, L / 2 + 0.005, 0.06, 0.1, 0.04, false);
    // Wide sculpted crimson tail-lamp bar (like the Payback muscle car!)
    part(body, brakeMat, sx * W * 0.33, tailY, -L / 2 - 0.012, W * 0.25, 0.13, 0.04, false);

    const hSprite = new THREE.Sprite(headFlareMat);
    hSprite.position.set(sx * W * 0.35, headY, L / 2 + 0.12);
    hSprite.scale.set(0.95, 0.95, 1);
    hSprite.visible = false;
    body.add(hSprite);
    headFlares.push(hSprite);

    const tSprite = new THREE.Sprite(tailFlareMat);
    tSprite.position.set(sx * W * 0.33, tailY, -L / 2 - 0.11);
    tSprite.scale.set(0.85, 0.65, 1);
    tSprite.visible = false;
    body.add(tSprite);
    tailFlares.push(tSprite);

    const cone = new THREE.Mesh(HEAD_BEAM_GEO, MAT.headBeam);
    cone.rotation.x = -Math.PI / 2 - 0.08;
    cone.position.set(sx * W * 0.35, Math.max(0.22, headY - 0.16), L / 2 + 2.55);
    headBeams.add(cone);
  }
  body.add(headBeams);

  // 4 Sculpted 5-spoke alloy wheels
  const wheels = [];
  const frontPivots = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (W / 2 - 0.1), m.wheelR, sz * wz);
    const wheel = buildAlloyWheel(m.wheelR, rimMat);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (sz === 1) frontPivots.push(pivot);
  }

  const roofInner = (m.style === 'van' ? yBelt + m.cabinH : cabinTop) - 0.08;
  const seatScale = 0.82;
  const hipY = m.style === 'roadster'
    ? yBelt - 0.03
    : Math.min(yBelt - 0.05, roofInner - 1.02 * seatScale);
  const seatZ = m.style === 'pickup' ? m.cabinZ - 0.1
    : m.style === 'van' ? m.cabinZ + m.cabinLen / 2 - 1.2
    : m.style === 'roadster' ? -0.18
    : m.cabinZ - 0.05;

  function applyMods({ color: nextColor, livery, rims, underglow } = {}) {
    if (nextColor && !m.fixedColor) paint.color.set(nextColor);
    const rimDef = RIM_FINISHES[rims] || RIM_FINISHES.silver;
    rimMat.color.set(rimDef.hex);

    const livKey = CAR_LIVERIES[livery] ? livery : (m.defaultLivery || 'clean');
    liveryGroup.visible = livKey !== 'clean';
    twinStripes.visible = livKey === 'twin_stripe' || livKey === 'gold_trim';
    carbonHood.visible = livKey === 'carbon_hood';
    if (livKey === 'gold_trim') {
      stripeMat.color.set('#fbbf24');
      stripeMat.metalness = 0.88;
    } else if (livKey === 'twin_stripe') {
      // Auto-contrast white stripes on dark cars, obsidian stripes on white/yellow cars
      const lum = paint.color.r * 0.299 + paint.color.g * 0.587 + paint.color.b * 0.114;
      stripeMat.color.set(lum > 0.72 ? '#111827' : '#f8fafc');
      stripeMat.metalness = 0.35;
    }

    const glowDef = UNDERGLOW_OPTIONS[underglow] || UNDERGLOW_OPTIONS.none;
    if (glowDef.hex) {
      underglowMesh.visible = true;
      underglowMat.color.set(glowDef.hex);
      cockpit?.setAmbientColor(glowDef.hex);
    } else {
      underglowMesh.visible = false;
      cockpit?.setAmbientColor(null);
    }
  }

  const mirrorAnchors = {
    rear: cockpit ? cockpit.rearMirrorAnchor : { x: 0, y: yBelt + m.cabinH * 0.58, z: bounds.zRearCab - 0.1 },
    left: { x: wingMirHalfX + 0.02, y: wingMirY, z: wingMirZ - 0.06 },
    right: { x: -wingMirHalfX - 0.02, y: wingMirY, z: wingMirZ - 0.06 },
  };

  function setMirrorTextures({ rear = null, left = null, right = null } = {}) {
    cockpit?.setRearMirrorTexture(rear);
    if (leftMirrorGlass) {
      if (left) {
        leftMirrorLiveMat.map = left;
        leftMirrorLiveMat.needsUpdate = true;
        leftMirrorGlass.material = leftMirrorLiveMat;
      } else {
        leftMirrorGlass.material = MAT.mirrorGlass;
      }
    }
    if (rightMirrorGlass) {
      if (right) {
        rightMirrorLiveMat.map = right;
        rightMirrorLiveMat.needsUpdate = true;
        rightMirrorGlass.material = rightMirrorLiveMat;
      } else {
        rightMirrorGlass.material = MAT.mirrorGlass;
      }
    }
  }

  function setMirrorSurfacesVisible(vis) {
    const v = !!vis;
    if (cockpit?.rearMirrorGlass) cockpit.rearMirrorGlass.visible = v;
    if (leftMirrorGlass) leftMirrorGlass.visible = v;
    if (rightMirrorGlass) rightMirrorGlass.visible = v;
  }

  function setCockpitMode(active, driverLook = null) {
    const inside = !!active;
    hullMesh.geometry = (inside || m.style === 'roadster') ? cockpitHullGeo : hullGeo;
    if (m.style !== 'roadster') {
      exteriorCabin.visible = !inside;
      if (cockpit) cockpit.group.visible = inside;
    }
    if (cockpit) {
      cockpit.setDriverLook({ ...(driverLook || {}), showHands: inside });
    }
    if (!inside) setMirrorTextures({});
  }

  applyMods({
    color: color || m.fixedColor,
    livery: opts.livery || m.defaultLivery || 'clean',
    rims: opts.rims || 'silver',
    underglow: opts.underglow || 'none',
  });

  return {
    group,
    body,
    hullMesh,
    hullGeo,
    cockpitHullGeo,
    exteriorCabin,
    cockpit,
    leftMirrorGlass,
    rightMirrorGlass,
    leftMirrorLiveMat,
    rightMirrorLiveMat,
    mirrorAnchors,
    setMirrorTextures,
    setMirrorSurfacesVisible,
    setCockpitMode,
    driverEye: cockpit ? cockpit.driverEye : new THREE.Vector3(W * 0.22, hipY + 0.56, seatZ + 0.04),
    wheels,
    frontPivots,
    brakeMat,
    paint,
    rimMat,
    underglowMesh,
    applyMods,
    headBeams,
    headFlares,
    tailFlares,
    headFlareMat,
    tailFlareMat,
    lightbar,
    seat: new THREE.Vector3(W * 0.22, hipY - 0.9 * seatScale, seatZ),
    passengerSeat: new THREE.Vector3(-W * 0.22, hipY - 0.9 * seatScale, seatZ),
    seatScale,
  };
}

function updateCarLightFlares(parts, { headOn, braking, runningRear }) {
  parts.headBeams.visible = headOn && vehicleNight > 0.08;
  for (const hf of parts.headFlares) {
    hf.visible = headOn;
    const s = vehicleNight > 0.1 ? 1.15 : 0.65;
    hf.scale.set(s, s, 1);
  }
  const showTail = braking || runningRear;
  for (const tf of parts.tailFlares) {
    tf.visible = showTail;
    const sx = braking ? 1.38 : 0.82;
    const sy = braking ? 0.95 : 0.56;
    tf.scale.set(sx, sy, 1);
  }
  parts.brakeMat.color.setHex(braking ? 0xff2a2a : runningRear ? 0xdc2626 : 0x7f1d1d);
}

// ---------------------------------------------------------------------------
// Player-drivable vehicle
// ---------------------------------------------------------------------------
export class Vehicle {
  constructor(scene, data) {
    this.data = data; // persisted record {id, model, color, livery, rims, underglow, x, z, yaw, cond, wrecked}
    this.model = VEHICLE_MODELS[data.model];
    this.parts = buildCarMesh(data.model, data.color, {
      livery: data.livery,
      rims: data.rims,
      underglow: data.underglow,
      withInterior: true,
    });
    this.cockpitView = false;
    this.mesh = this.parts.group;
    scene.add(this.mesh);
    this.scene = scene;
    this.x = data.x; this.z = data.z; this.yaw = data.yaw;
    this.speed = 0; this.vx = 0; this.vz = 0;
    this.steer = 0; this.spin = 0;
    this.braking = false;
    this.drifting = false;
    this.occupied = false;
    this.lastHitKind = null;
    this.lastHitPoint = { x: 0, z: 0 };
    this.radius = this.model.wid / 2 + 0.05;
    this.halfSpan = Math.max(0, this.model.len / 2 - this.radius);
    this.y = 0;

    if (!data.cond) data.cond = freshCond();
    this.cond = data.cond;
    this.stallNotified = false;
    this.lowFuelNotified = false;
    this.hoodY = this.model.wheelR + this.model.bodyH + 0.1;

    // Flickering flames + tall billowing dark smoke for wrecked vehicles
    this.wreckFire = createWreckFireRig();
    this.smoke = this.wreckFire.group; // compatibility alias (`v.smoke.visible = ...`)
    this.smoke.visible = data.wrecked === true;
    this.mesh.add(this.smoke);
    if (data.wrecked === true) this.setScorched(true);

    // Engine-fault tailpipe smoke (engine < 20% while running)
    this.tailSmoke = createTailpipeSmokeRig();
    this.exhaustSmoke = this.tailSmoke.group; // compatibility alias
    this.mesh.add(this.exhaustSmoke);

    this.syncMesh(0);
  }

  setScorched(scorched) {
    this.smoke.visible = !!scorched;
    if (scorched) {
      this.parts.paint.color.set(this.data.color).multiplyScalar(0.32);
      this.parts.paint.roughness = 0.88;
      this.parts.paint.clearcoat = 0.05;
      this.parts.underglowMesh.visible = false;
    } else {
      this.applyCustomization();
      this.parts.paint.roughness = this.model.style === 'pickup' ? 0.3 : this.model.style === 'hyper' ? 0.16 : 0.22;
      this.parts.paint.clearcoat = 0.94;
    }
  }

  applyCustomization() {
    this.parts.applyMods({
      color: this.data.color,
      livery: this.data.livery,
      rims: this.data.rims,
      underglow: this.data.underglow,
    });
  }

  setCockpitView(active, driverLook = null) {
    this.cockpitView = !!active;
    this.parts.setCockpitMode(this.cockpitView, driverLook);
    if (this.cockpitView && this.parts.cockpit) {
      this.parts.cockpit.updateScreens(0, {
        speedMps: this.speed,
        fuel: this.cond.fuel,
        hp: this.cond.hp,
        x: this.x,
        z: this.z,
        yaw: this.yaw,
      }, true);
    }
  }

  setMirrorTextures(textures) {
    this.parts.setMirrorTextures(textures);
  }

  setMirrorSurfacesVisible(vis) {
    this.parts.setMirrorSurfacesVisible(vis);
  }

  updateCockpit(dt, info = {}) {
    if ((!this.cockpitView && this.data.model !== 'roadster') || !this.parts.cockpit) return;
    this.parts.cockpit.updateScreens(dt, {
      speedMps: this.speed,
      fuel: this.cond.fuel,
      hp: this.cond.hp,
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      accentHex: UNDERGLOW_OPTIONS[this.data.underglow]?.hex || null,
      ...info,
    });
  }

  get forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }

  circles() {
    const f = this.forward;
    return [
      { x: this.x + f.x * this.halfSpan, z: this.z + f.z * this.halfSpan, r: this.radius },
      { x: this.x, z: this.z, r: this.radius },
      { x: this.x - f.x * this.halfSpan, z: this.z - f.z * this.halfSpan, r: this.radius },
    ];
  }

  update(dt, input, colliders, otherCircles) {
    const m = this.model;
    if (this.cond.hp <= 0) {
      this.speed = 0; this.vx = 0; this.vz = 0; this.braking = false; this.drifting = false;
      return 0;
    }
    const stalled = this.cond.fuel <= 0;
    const maxSpeed = m.maxSpeed * speedFactor(this.cond.engine);
    let { speed } = this;
    this.braking = false;
    if (stalled) {
      const drag = (1.6 + 0.012 * speed * speed) * dt;
      speed -= Math.sign(speed) * Math.min(Math.abs(speed), drag);
    } else if (input.throttle > 0.05) {
      if (speed < -0.3) { speed = Math.min(0, speed + m.brake * dt); this.braking = true; } else {
        const k = 1 - Math.min(1, (speed / maxSpeed) ** 2);
        speed += m.accel * input.throttle * k * dt;
      }
    } else if (input.throttle < -0.05) {
      if (speed > 0.3) { speed = Math.max(0, speed - m.brake * dt); this.braking = true; } else {
        speed = Math.max(-maxSpeed * 0.3, speed - m.accel * 0.6 * dt);
      }
    } else {
      const drag = (1.6 + 0.012 * speed * speed) * dt;
      speed -= Math.sign(speed) * Math.min(Math.abs(speed), drag);
    }
    if (input.handbrake) {
      speed -= Math.sign(speed) * Math.min(Math.abs(speed), 9 * dt);
      this.braking = true;
    }
    speed = Math.min(speed, maxSpeed);

    const steerTarget = input.steer * m.steer / (1 + Math.abs(speed) * 0.045);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 7);
    const wheelbase = m.len * 0.6;
    let yawRate = -(speed / wheelbase) * Math.tan(this.steer);
    if (input.handbrake && Math.abs(speed) > 4) yawRate *= 1.45;
    this.yaw += yawRate * dt;

    const nf = this.forward;
    const grip = input.handbrake ? 1.4 : m.grip * gripFactor(this.cond.tires);
    const k = Math.min(1, grip * dt);
    this.vx += (nf.x * speed - this.vx) * k;
    this.vz += (nf.z * speed - this.vz) * k;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.speed = speed;
    this.drifting = input.handbrake && Math.abs(speed) > 5.5;

    const dist = Math.abs(this.speed) * dt;
    if (dist > 1e-4) {
      const speedFrac = Math.min(1, Math.abs(this.speed) / Math.max(1, m.maxSpeed));
      applyDrive(this.cond, this.data.model, dist / 1000, Math.abs(this.speed), speedFrac);
    }
    return this.collide(colliders, otherCircles);
  }

  collide(colliders, otherCircles = []) {
    let hit = false; let nx = 0; let nz = 0;
    this.lastHitKind = null;
    this.lastHitPoint.x = this.x;
    this.lastHitPoint.z = this.z;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.circles()) {
        const res = resolveCircle(c.x, c.z, c.r, colliders);
        if (res.hit) {
          this.x += res.x - c.x; this.z += res.z - c.z;
          nx += res.nx; nz += res.nz; hit = true;
          this.lastHitKind = this.lastHitKind || 'wall';
          this.lastHitPoint.x = c.x - res.nx * c.r;
          this.lastHitPoint.z = c.z - res.nz * c.r;
        }
        for (const o of otherCircles) {
          const dx = c.x - o.x; const dz = c.z - o.z;
          const d = Math.hypot(dx, dz); const min = c.r + o.r;
          if (d < min && d > 1e-4) {
            const push = min - d;
            this.x += (dx / d) * push; this.z += (dz / d) * push;
            nx += dx / d; nz += dz / d; hit = true;
            this.lastHitKind = o.tag || 'traffic';
            this.lastHitPoint.x = (c.x + o.x) * 0.5;
            this.lastHitPoint.z = (c.z + o.z) * 0.5;
          }
        }
      }
    }
    for (const axis of ['x', 'z']) {
      if (this[axis] > WORLD_LIMIT) { this[axis] = WORLD_LIMIT; if (axis === 'x') nx -= 1; else nz -= 1; hit = true; }
      if (this[axis] < -WORLD_LIMIT) { this[axis] = -WORLD_LIMIT; if (axis === 'x') nx += 1; else nz += 1; hit = true; }
    }
    if (!hit) return 0;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const vn = this.vx * nx + this.vz * nz;
    let impact = 0;
    if (vn < 0) {
      impact = -vn;
      this.vx -= nx * vn * 1.35;
      this.vz -= nz * vn * 1.35;
      const f = this.forward;
      this.speed = (this.vx * f.x + this.vz * f.z) * 0.85;
    }
    return impact;
  }

  syncMesh(groundY, dt = 0, nearCamera = true) {
    this.y += (groundY - this.y) * Math.min(1, dt * 10 || 1);
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
    this.spin += (this.speed * dt) / this.model.wheelR;
    for (const w of this.parts.wheels) w.rotation.x = this.spin;
    for (const p of this.parts.frontPivots) p.rotation.y = -this.steer;
    if (this.parts.cockpit) this.parts.cockpit.setSteer(this.steer);
    // Realistic suspension body roll + pitch under braking/acceleration
    this.parts.body.rotation.z = THREE.MathUtils.clamp(this.steer * this.speed * 0.0065, -0.065, 0.065);
    const targetPitch = this.braking && Math.abs(this.speed) > 2 ? 0.022 : 0;
    this.parts.body.rotation.x += (targetPitch - this.parts.body.rotation.x) * Math.min(1, dt * 10 || 1);

    const powered = this.cond.hp > 0 && this.cond.fuel > 0;
    const headOn = this.occupied && powered && vehicleNight > 0.05;
    updateCarLightFlares(this.parts, {
      headOn,
      braking: powered && this.braking,
      runningRear: headOn,
    });

    this.wreckFire.update(dt, this.hoodY, this.model.len * 0.24, nearCamera);

    const faultSmoke = powered && this.cond.engine < TELEMETRY_ENGINE_FAULT;
    this.exhaustSmoke.visible = faultSmoke;
    if (faultSmoke) {
      this.tailSmoke.update(dt, -this.model.wid * 0.3, this.model.wheelR * 0.72, -this.model.len / 2 - 0.14);
    }
    this.data.x = this.x; this.data.z = this.z; this.data.yaw = this.yaw;
  }

  teleport(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.speed = 0; this.vx = 0; this.vz = 0; this.steer = 0;
    this._lastSkid = null;
    this.syncMesh(this.y);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.parts.paint.dispose();
    this.parts.rimMat.dispose();
    this.parts.leftMirrorLiveMat?.dispose?.();
    this.parts.rightMirrorLiveMat?.dispose?.();
    this.parts.cockpit?.dispose?.();
    this.parts.headFlareMat.dispose();
    this.parts.tailFlareMat.dispose();
    this.wreckFire.dispose();
    this.tailSmoke.dispose();
  }
}

// ---------------------------------------------------------------------------
// AI traffic
// ---------------------------------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N = ROAD_LINES.length;

function lanePoint(i, j, d, along) {
  const px = ROAD_LINES[i]; const pz = ROAD_LINES[j];
  const rx = -d[1]; const rz = d[0];
  return { x: px + d[0] * along + rx * LANE_OFFSET, z: pz + d[1] * along + rz * LANE_OFFSET };
}

export class TrafficCar {
  constructor(scene, rand) {
    this.rand = rand;
    const models = ['sedan', 'sedan', 'hatch', 'taxi', 'van', 'pickup', 'sports', 'muscle', 'gwagen', 'roadster'];
    const modelId = models[Math.floor(rand() * models.length)];
    const color = VEHICLE_MODELS[modelId].fixedColor || CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
    this.model = VEHICLE_MODELS[modelId];
    this.parts = buildCarMesh(modelId, color, {
      rims: rand() < 0.2 ? 'gold' : rand() < 0.4 ? 'black' : 'silver',
    });
    this.mesh = this.parts.group;
    scene.add(this.mesh);
    // Seated driver silhouette
    const driver = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3b2412, roughness: 0.6 }));
    driver.position.set(this.parts.seat.x, this.parts.seat.y + 1.55 * this.parts.seatScale + 0.14, this.parts.seat.z);
    this.mesh.add(driver);
    this.radius = this.model.wid / 2 + 0.05;
    this.halfSpan = Math.max(0, this.model.len / 2 - this.radius);
    this.cruise = 8 + rand() * 4.5;
    this.speed = 0;
    this.spin = 0;
    this.blockedTime = 0;
    this.ghostTime = 0;
    this.honkCooldown = 0;
    this.spawnRandom();
  }

  spawnRandom() {
    const r = this.rand;
    let i; let j; let d;
    do {
      i = Math.floor(r() * N); j = Math.floor(r() * N);
      d = DIRS[Math.floor(r() * 4)];
    } while (!this._valid(i + d[0], j + d[1]));
    this.node = [i + d[0], j + d[1]];
    this.dir = d;
    const along = 9 + r() * 50;
    const p = lanePoint(i, j, d, along);
    this.x = p.x; this.z = p.z;
    this.yaw = Math.atan2(d[0], d[1]);
    this._setExitTarget();
  }

  _valid(i, j) { return i >= 0 && j >= 0 && i < N && j < N; }

  _setExitTarget() {
    const d = this.dir;
    const p = lanePoint(this.node[0], this.node[1], d, -9);
    this.target = p;
    this.phase = 'exit';
  }

  _chooseNext() {
    const d = this.dir;
    const options = DIRS.filter((nd) => !(nd[0] === -d[0] && nd[1] === -d[1]) && this._valid(this.node[0] + nd[0], this.node[1] + nd[1]));
    const straight = options.find((nd) => nd[0] === d[0] && nd[1] === d[1]);
    const nd = straight && this.rand() < 0.45 ? straight : options[Math.floor(this.rand() * options.length)];
    const entry = lanePoint(this.node[0], this.node[1], nd, 9);
    this.dir = nd;
    this.target = entry;
    this.phase = 'entry';
  }

  get forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }

  circles() {
    const f = this.forward;
    return [
      { x: this.x + f.x * this.halfSpan, z: this.z + f.z * this.halfSpan, r: this.radius },
      { x: this.x, z: this.z, r: this.radius },
      { x: this.x - f.x * this.halfSpan, z: this.z - f.z * this.halfSpan, r: this.radius },
    ];
  }

  update(dt, obstacles) {
    const dx = this.target.x - this.x; const dz = this.target.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.2) {
      if (this.phase === 'exit') this._chooseNext();
      else {
        this.node = [this.node[0] + this.dir[0], this.node[1] + this.dir[1]];
        this._setExitTarget();
      }
    }
    const desiredYaw = Math.atan2(this.target.x - this.x, this.target.z - this.z);
    let diff = desiredYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnRate = 1.9;
    this.yaw += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);

    let targetSpeed = this.cruise * (Math.abs(diff) > 0.35 ? 0.55 : 1);
    if (this.phase === 'entry') targetSpeed = Math.min(targetSpeed, 7);
    const f = this.forward;
    let blockedBy = null;
    this.ghostTime = Math.max(0, this.ghostTime - dt);
    for (const o of obstacles) {
      if (o.self === this) continue;
      if (o.kind === 'car' && this.ghostTime > 0) continue;
      const rx = o.x - this.x; const rz = o.z - this.z;
      const fd = rx * f.x + rz * f.z;
      if (fd <= 0 || fd > 13) continue;
      const lat = Math.abs(rx * f.z - rz * f.x);
      if (lat > (o.kind === 'ped' ? 1.7 : (o.r || 1) + this.radius + 0.15)) continue;
      const stopDist = this.halfSpan + this.radius + (o.kind === 'car' ? 2.2 : 2.6);
      const allowed = Math.max(0, (fd - stopDist) * 1.4);
      if (allowed < targetSpeed) { targetSpeed = allowed; blockedBy = o; }
    }
    if (blockedBy && targetSpeed < 0.5) {
      this.blockedTime += dt;
      if (this.blockedTime > 3.5 && blockedBy.kind === 'car') { this.ghostTime = 2.5; this.blockedTime = 0; }
    } else this.blockedTime = 0;
    this.honkCooldown -= dt;
    this.wantsHonk = false;
    if (blockedBy && blockedBy.kind === 'player' && this.blockedTime > 1.8 && this.honkCooldown <= 0) {
      this.wantsHonk = true;
      this.honkCooldown = 4;
    }
    const accel = targetSpeed > this.speed ? 5 : 14;
    this.speed += THREE.MathUtils.clamp(targetSpeed - this.speed, -accel * dt, accel * dt);
    this.x += f.x * this.speed * dt;
    this.z += f.z * this.speed * dt;
    this.braking = targetSpeed < this.speed - 0.5 || this.speed < 0.3;

    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
    this.spin += (this.speed * dt) / this.model.wheelR;
    for (const w of this.parts.wheels) w.rotation.x = this.spin;
    const steerVis = THREE.MathUtils.clamp(diff, -0.5, 0.5);
    for (const p of this.parts.frontPivots) p.rotation.y = steerVis;
    const nightOn = vehicleNight > 0.06;
    updateCarLightFlares(this.parts, {
      headOn: nightOn,
      braking: this.braking,
      runningRear: nightOn,
    });
  }
}

// ---------------------------------------------------------------------------
// Metro Police Interceptor (spawned dynamically during Wanted Heat 1–3★)
// ---------------------------------------------------------------------------
export class PoliceCar {
  constructor(scene, withPointLight = false) {
    this.scene = scene;
    this.model = VEHICLE_MODELS.police;
    this.parts = buildCarMesh('police', '#0f172a');
    this.mesh = this.parts.group;
    scene.add(this.mesh);
    this.radius = this.model.wid / 2 + 0.05;
    this.halfSpan = Math.max(0, this.model.len / 2 - this.radius);
    this.x = 0; this.z = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0; this.speed = 0;
    this.spin = 0;
    this.braking = false;
    this.drifting = false;
    this.strobeT = Math.random() * 3;
    this.sirenLight = null;
    if (withPointLight) {
      this.sirenLight = new THREE.PointLight(0xef4444, 3.2, 26, 1.5);
      this.sirenLight.position.set(0, 2.0, 0);
      this.mesh.add(this.sirenLight);
    }
  }

  spawnNear(targetX, targetZ) {
    // Pick a road point ~55–85 m from the player
    let best = { x: 0, z: -75, yaw: 0 };
    let bestScore = Infinity;
    for (const rx of ROAD_LINES) {
      for (const rz of ROAD_LINES) {
        const d = Math.hypot(rx - targetX, rz - targetZ);
        const score = Math.abs(d - 68);
        if (d > 38 && score < bestScore) {
          bestScore = score;
          best = {
            x: rx + LANE_OFFSET,
            z: rz,
            yaw: Math.atan2(targetX - rx, targetZ - rz),
          };
        }
      }
    }
    this.x = best.x;
    this.z = best.z;
    this.yaw = best.yaw;
    this.speed = 12;
    this.vx = Math.sin(this.yaw) * 12;
    this.vz = Math.cos(this.yaw) * 12;
    this._lastSkid = null;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
  }

  get forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }

  circles() {
    const f = this.forward;
    return [
      { x: this.x + f.x * this.halfSpan, z: this.z + f.z * this.halfSpan, r: this.radius, tag: 'police' },
      { x: this.x, z: this.z, r: this.radius, tag: 'police' },
      { x: this.x - f.x * this.halfSpan, z: this.z - f.z * this.halfSpan, r: this.radius, tag: 'police' },
    ];
  }

  update(dt, target, stars, colliders, groundY = 0) {
    this.strobeT += dt * 9.5;
    const redTurn = Math.sin(this.strobeT) > 0;
    if (this.parts.lightbar) {
      this.parts.lightbar.redFlare.visible = redTurn;
      this.parts.lightbar.blueFlare.visible = !redTurn;
    }
    if (this.sirenLight) {
      this.sirenLight.color.setHex(redTurn ? 0xef4444 : 0x38bdf8);
      this.sirenLight.intensity = 2.8 + (vehicleNight * 2.2);
    }

    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);

    // If way too far behind (>145 m), relocate closer along the road grid
    if (dist > 145) {
      this.spawnNear(target.x, target.z);
      return;
    }

    // Steer toward player with feeler obstacle avoidance around city blocks
    let desiredYaw = Math.atan2(dx, dz);
    const feelerDist = 6.5;
    const fx = this.x + Math.sin(desiredYaw) * feelerDist;
    const fz = this.z + Math.cos(desiredYaw) * feelerDist;
    if (resolveCircle(fx, fz, this.radius + 0.6, colliders).hit) {
      // Snap toward nearest clear road axis
      const a1 = desiredYaw + 0.85;
      const a2 = desiredYaw - 0.85;
      const h1 = resolveCircle(this.x + Math.sin(a1) * feelerDist, this.z + Math.cos(a1) * feelerDist, this.radius + 0.4, colliders).hit;
      desiredYaw = !h1 ? a1 : a2;
    }

    let diff = desiredYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnRate = 2.6;
    this.yaw += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);

    const topSpd = 16 + stars * 4.5;
    const wantSpeed = dist < 4.5 ? 2 : Math.abs(diff) > 0.65 ? topSpd * 0.58 : topSpd;
    const accel = wantSpeed > this.speed ? 12 : 20;
    this.braking = wantSpeed < this.speed - 2;
    this.drifting = Math.abs(diff) > 0.55 && this.speed > 10;
    this.speed += THREE.MathUtils.clamp(wantSpeed - this.speed, -accel * dt, accel * dt);

    const f = this.forward;
    const k = Math.min(1, 6.2 * dt);
    this.vx += (f.x * this.speed - this.vx) * k;
    this.vz += (f.z * this.speed - this.vz) * k;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    for (const c of this.circles()) {
      const res = resolveCircle(c.x, c.z, c.r, colliders);
      if (res.hit) {
        this.x += res.x - c.x;
        this.z += res.z - c.z;
        this.speed *= 0.82;
      }
    }

    this.mesh.position.set(this.x, groundY, this.z);
    this.mesh.rotation.y = this.yaw;
    this.spin += (this.speed * dt) / this.model.wheelR;
    for (const w of this.parts.wheels) w.rotation.x = this.spin;
    const steerVis = THREE.MathUtils.clamp(diff, -0.5, 0.5);
    for (const p of this.parts.frontPivots) p.rotation.y = steerVis;
    this.parts.body.rotation.z = THREE.MathUtils.clamp(-steerVis * this.speed * 0.005, -0.06, 0.06);

    updateCarLightFlares(this.parts, {
      headOn: true, // pursuit cruisers run headlights day & night!
      braking: this.braking,
      runningRear: true,
    });
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.parts.paint.dispose();
    this.parts.headFlareMat.dispose();
    this.parts.tailFlareMat.dispose();
  }
}
