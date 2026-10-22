// MetroVenture 3D — sculpted PBR vehicles, 5-spoke rims, light flares, AI traffic & police cruisers.
import * as THREE from 'three';
import {
  VEHICLE_MODELS, ROAD_LINES, LANE_OFFSET, WORLD_LIMIT, CAR_COLORS, TELEMETRY_ENGINE_FAULT,
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

function getSculptedGeometries(modelId) {
  if (PROFILE_CACHE.has(modelId)) return PROFILE_CACHE.get(modelId);
  const m = VEHICLE_MODELS[modelId];
  const L = m.len;
  const W = m.wid;
  const yBot = m.wheelR * 0.48;
  const yBelt = m.wheelR + m.bodyH - 0.03;
  const yNose = yBelt - (m.style === 'sports' ? 0.16 : m.style === 'van' ? 0.06 : 0.11);
  const yTail = yBelt + (m.style === 'sports' ? 0.04 : 0.01);

  // 1. Sculpted lower body hull (sloped hood, chin spoiler, kicked-up rear haunch)
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-L / 2 + 0.08, yBot + 0.06);
  hullShape.lineTo(L / 2 - 0.12, yBot + 0.03);
  hullShape.quadraticCurveTo(L / 2 + 0.02, yBot + 0.12, L / 2, yNose * 0.86);
  hullShape.quadraticCurveTo(L / 2 - 0.08, yNose, L * 0.18, yBelt);
  hullShape.lineTo(-L * 0.25, yBelt + 0.02);
  hullShape.quadraticCurveTo(-L / 2 + 0.05, yTail, -L / 2, yTail - 0.08);
  hullShape.lineTo(-L / 2 + 0.03, yBot + 0.1);
  hullShape.closePath();
  const hullGeo = extrudeCarProfile(hullShape, W, 0.055, 0.07);

  // 2. Sculpted upper cabin / greenhouse + slightly inset glass core
  let roofGeo = null;
  let glassGeo = null;
  if (m.style === 'van') {
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
  } else {
    const cabW = m.style === 'sports' ? W * 0.8 : W * 0.86;
    const zC = m.cabinZ;
    const cLen = m.cabinLen;
    const zFrontBase = zC + cLen * 0.56;
    const zRearBase = zC - cLen * (m.style === 'sports' ? 0.68 : m.style === 'pickup' ? 0.5 : 0.58);
    const zFrontTop = zC + cLen * 0.24;
    const zRearTop = zC - cLen * (m.style === 'sports' ? 0.28 : m.style === 'pickup' ? 0.42 : 0.34);
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

  const out = { hullGeo, roofGeo, glassGeo, yBot, yBelt, yNose, yTail };
  PROFILE_CACHE.set(modelId, out);
  return out;
}

function buildAlloyWheel(wheelR) {
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
    const cap = new THREE.Mesh(CYL, MAT.rim);
    cap.scale.set(wheelR * 0.22, 0.03, wheelR * 0.22);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * 0.125;
    wheel.add(cap);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(wheelR * 0.66, wheelR * 0.075, 6, 16), MAT.rim);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * 0.12;
    wheel.add(ring);

    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2;
      const spoke = new THREE.Mesh(BOX, MAT.rim);
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

// Build a sculpted PBR car. The car faces +Z; the driver sits on the left (+X) side.
export function buildCarMesh(modelId, color) {
  const m = VEHICLE_MODELS[modelId] || VEHICLE_MODELS.sedan;
  const fxTex = getFXTextures();
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Metallic automotive clearcoat PBR paint
  const paint = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: m.style === 'taxi' ? 0.28 : 0.56,
    roughness: m.style === 'pickup' ? 0.3 : 0.22,
    clearcoat: 0.92,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.45,
  });
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x991b1b });

  const L = m.len;
  const W = m.wid;
  const { hullGeo, roofGeo, glassGeo, yBot, yBelt } = getSculptedGeometries(m.id);
  const cabinTop = yBelt + m.cabinH;
  const wz = L / 2 - m.wheelR - 0.38;

  // Sculpted lower chassis + cabin
  const hullMesh = new THREE.Mesh(hullGeo, paint);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  body.add(hullMesh);

  if (m.style === 'van') {
    const vanTop = new THREE.Mesh(roofGeo, paint);
    vanTop.castShadow = true;
    vanTop.receiveShadow = true;
    body.add(vanTop);
    part(body, MAT.glass, 0, yBelt + m.cabinH * 0.52, L / 2 - 0.34, W * 0.86, m.cabinH * 0.56, 0.14, false);
    for (const sx of [-1, 1]) {
      part(body, MAT.glass, sx * W * 0.48, yBelt + m.cabinH * 0.54, L * 0.18, 0.04, m.cabinH * 0.46, 1.05, false);
      part(body, MAT.checker, sx * W * 0.485, yBelt + 0.14, -0.45, 0.03, 0.12, L * 0.58, false);
    }
  } else {
    const roofMat = m.style === 'police' ? MAT.whiteDoor : paint;
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    body.add(roofMesh);

    const glassMesh = new THREE.Mesh(glassGeo, MAT.glass);
    body.add(glassMesh);

    // Side mirrors + chrome door handles
    const cabW = m.style === 'sports' ? W * 0.8 : W * 0.86;
    for (const sx of [-1, 1]) {
      part(body, paint, sx * (cabW * 0.5 + 0.08), yBelt + 0.08, m.cabinZ + m.cabinLen * 0.28, 0.15, 0.09, 0.12, false);
      part(body, MAT.chrome, sx * (W * 0.5 + 0.005), yBelt - 0.08, m.cabinZ - 0.08, 0.03, 0.04, 0.18, false);
    }
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

  // Model-specific styling
  if (m.style === 'pickup') {
    const bedLen = L / 2 - (m.cabinZ - m.cabinLen / 2) - 0.12;
    const bedZ = -L / 2 + bedLen / 2 + 0.06;
    part(body, MAT.trim, 0, yBelt - 0.14, bedZ, W - 0.24, 0.04, bedLen - 0.14, false);
    part(body, MAT.chrome, 0, yBot + 0.1, L / 2 + 0.06, W * 0.92, 0.16, 0.08);
    // Muscular hood power dome
    part(body, paint, 0, yBelt + 0.04, L * 0.26, W * 0.46, 0.08, L * 0.28);
  }

  if (m.style === 'sports' || m.style === 'sedan') {
    // Sculpted hood power dome / muscle intake scoop (Payback muscle/GT aesthetic!)
    part(body, paint, 0, yBelt + 0.045, L * 0.24, W * 0.42, 0.085, L * 0.28);
    if (m.style === 'sports') {
      part(body, MAT.chrome, 0, yBelt + 0.11, L * 0.25, 0.36, 0.11, 0.52);
      part(body, MAT.grille, 0, yBelt + 0.11, L * 0.51 - 0.01, 0.32, 0.08, 0.04, false);
      // Rear GT wing spoiler
      part(body, paint, 0, yBelt + 0.28, -L / 2 + 0.24, W * 0.92, 0.05, 0.32);
      for (const sx of [-1, 1]) {
        part(body, MAT.trim, sx * W * 0.34, yBelt + 0.15, -L / 2 + 0.24, 0.05, 0.24, 0.12);
      }
    }
  }

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
    const wheel = buildAlloyWheel(m.wheelR);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (sz === 1) frontPivots.push(pivot);
  }

  const roofInner = (m.style === 'van' ? yBelt + m.cabinH : cabinTop) - 0.08;
  const seatScale = 0.82;
  const hipY = Math.min(yBelt - 0.05, roofInner - 1.02 * seatScale);
  const seatZ = m.style === 'pickup' ? m.cabinZ - 0.1 : m.style === 'van' ? m.cabinZ + m.cabinLen / 2 - 1.2 : m.cabinZ - 0.05;

  return {
    group,
    body,
    wheels,
    frontPivots,
    brakeMat,
    paint,
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
    this.data = data; // persisted record {id, model, color, x, z, yaw, cond, wrecked}
    this.model = VEHICLE_MODELS[data.model];
    this.parts = buildCarMesh(data.model, data.color);
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
    } else {
      this.parts.paint.color.set(this.data.color);
      this.parts.paint.roughness = this.model.style === 'pickup' ? 0.3 : 0.22;
      this.parts.paint.clearcoat = 0.92;
    }
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
    const models = ['sedan', 'sedan', 'hatch', 'taxi', 'van', 'pickup', 'sports'];
    const modelId = models[Math.floor(rand() * models.length)];
    const color = VEHICLE_MODELS[modelId].fixedColor || CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
    this.model = VEHICLE_MODELS[modelId];
    this.parts = buildCarMesh(modelId, color);
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
