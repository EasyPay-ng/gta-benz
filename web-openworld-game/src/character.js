// MetroVenture 3D — sculpted articulated humanoid rig with biomechanical walk/sprint,
// vertical jump physics, and 8 procedural emotes (shared by player, citizens, passengers & peers).
import * as THREE from 'three';
import { BUILDS, OCCUPATIONS, EMOTES, JUMP_VELOCITY, JUMP_GRAVITY } from './data.js';

const EMOTE_MAP = Object.fromEntries(EMOTES.map((e) => [e.id, e]));

// Shared sculpted geometries (created once, reused across every character in the city)
const G = {
  pelvis: new THREE.CapsuleGeometry(0.135, 0.16, 6, 12),
  thigh: new THREE.CapsuleGeometry(0.088, 0.25, 6, 10),
  shin: new THREE.CapsuleGeometry(0.072, 0.26, 6, 10),
  shoeUpper: new THREE.CapsuleGeometry(0.076, 0.12, 5, 10),
  shoeSole: new THREE.BoxGeometry(0.165, 0.036, 0.29),
  torsoLower: new THREE.CylinderGeometry(0.195, 0.165, 0.28, 12),
  torsoChest: new THREE.CylinderGeometry(0.225, 0.195, 0.34, 12),
  shoulder: new THREE.SphereGeometry(0.092, 10, 8),
  collar: new THREE.TorusGeometry(0.105, 0.026, 6, 12),
  belt: new THREE.CylinderGeometry(0.176, 0.176, 0.055, 12),
  buckle: new THREE.BoxGeometry(0.075, 0.06, 0.03),
  stripe: new THREE.CylinderGeometry(0.228, 0.214, 0.065, 12),
  upperArm: new THREE.CapsuleGeometry(0.066, 0.19, 5, 10),
  foreArm: new THREE.CapsuleGeometry(0.056, 0.19, 5, 10),
  hand: new THREE.SphereGeometry(0.062, 8, 8),
  neck: new THREE.CylinderGeometry(0.064, 0.074, 0.11, 10),
  cranium: new THREE.SphereGeometry(0.168, 14, 12),
  jaw: new THREE.SphereGeometry(0.132, 12, 10),
  ear: new THREE.SphereGeometry(0.036, 8, 6),
  nose: new THREE.ConeGeometry(0.026, 0.065, 6),
  sclera: new THREE.SphereGeometry(0.027, 8, 6),
  iris: new THREE.SphereGeometry(0.016, 8, 6),
  brow: new THREE.BoxGeometry(0.056, 0.016, 0.02),
  mouth: new THREE.BoxGeometry(0.072, 0.018, 0.02),
  // Hairstyles
  hairCrown: new THREE.SphereGeometry(0.176, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
  hairFade: new THREE.CylinderGeometry(0.168, 0.155, 0.12, 12, 1, true),
  hairFringe: new THREE.CapsuleGeometry(0.045, 0.16, 4, 8),
  hairLongBack: new THREE.CapsuleGeometry(0.12, 0.26, 6, 10),
  afro: new THREE.SphereGeometry(0.235, 14, 12),
  buzz: new THREE.SphereGeometry(0.171, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.54),
  // Occupational headgear
  capTop: new THREE.SphereGeometry(0.176, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
  capBrim: new THREE.BoxGeometry(0.26, 0.022, 0.16),
  peakTop: new THREE.CylinderGeometry(0.205, 0.172, 0.095, 14),
  peakBand: new THREE.CylinderGeometry(0.175, 0.175, 0.055, 14),
  badge: new THREE.BoxGeometry(0.055, 0.058, 0.02),
  hardhat: new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  hardBrim: new THREE.CylinderGeometry(0.235, 0.235, 0.022, 14),
  chefBase: new THREE.CylinderGeometry(0.165, 0.165, 0.14, 12),
  chefPuff: new THREE.SphereGeometry(0.205, 12, 10),
  visorBand: new THREE.CylinderGeometry(0.172, 0.172, 0.048, 14, 1, true),
  visorGlass: new THREE.BoxGeometry(0.29, 0.078, 0.04),
  beanie: new THREE.SphereGeometry(0.178, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  beanieFold: new THREE.CylinderGeometry(0.182, 0.182, 0.058, 12),
  flatTop: new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  // Unique Boutique 3D Fashion & Accessories
  hoodBack: new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
  hoodPocket: new THREE.BoxGeometry(0.26, 0.13, 0.045),
  drawstring: new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6),
  innerShirt: new THREE.BoxGeometry(0.16, 0.42, 0.03),
  lapel: new THREE.BoxGeometry(0.068, 0.34, 0.035),
  tieBody: new THREE.BoxGeometry(0.048, 0.28, 0.032),
  tieKnot: new THREE.BoxGeometry(0.056, 0.052, 0.036),
  pocketSquare: new THREE.BoxGeometry(0.055, 0.032, 0.02),
  senatorSkirt: new THREE.CylinderGeometry(0.182, 0.215, 0.34, 14),
  senatorPlacket: new THREE.BoxGeometry(0.075, 0.34, 0.025),
  senatorMotif: new THREE.BoxGeometry(0.085, 0.085, 0.024),
  jerseyBar: new THREE.BoxGeometry(0.16, 0.11, 0.025),
  cargoPocket: new THREE.BoxGeometry(0.055, 0.14, 0.12),
  shortsCuff: new THREE.CylinderGeometry(0.095, 0.095, 0.045, 10),
  ankleSock: new THREE.CylinderGeometry(0.074, 0.072, 0.11, 10),
  highTopCollar: new THREE.CylinderGeometry(0.084, 0.082, 0.095, 10),
  bootShaft: new THREE.CylinderGeometry(0.086, 0.082, 0.15, 10),
  bootSole: new THREE.BoxGeometry(0.175, 0.052, 0.305),
  loaferClasp: new THREE.BoxGeometry(0.095, 0.018, 0.028),
  chainLoop: new THREE.TorusGeometry(0.122, 0.015, 6, 16),
  chainPendant: new THREE.CylinderGeometry(0.034, 0.034, 0.014, 10),
  shadeLens: new THREE.BoxGeometry(0.078, 0.052, 0.022),
  shadeRim: new THREE.BoxGeometry(0.088, 0.062, 0.018),
  shadeBridge: new THREE.BoxGeometry(0.045, 0.012, 0.02),
  shadeArm: new THREE.BoxGeometry(0.012, 0.014, 0.14),
  cyberVisor: new THREE.BoxGeometry(0.235, 0.058, 0.036),
  bucketCrown: new THREE.CylinderGeometry(0.158, 0.176, 0.11, 14),
  bucketBrim: new THREE.CylinderGeometry(0.245, 0.215, 0.025, 16),
  filaCrown: new THREE.CylinderGeometry(0.162, 0.174, 0.135, 14),
  filaBand: new THREE.CylinderGeometry(0.176, 0.176, 0.028, 14),
  crownBand: new THREE.CylinderGeometry(0.176, 0.168, 0.075, 14),
  crownSpike: new THREE.ConeGeometry(0.036, 0.085, 5),
  crownGem: new THREE.SphereGeometry(0.018, 6, 6),
  mortarSkull: new THREE.CylinderGeometry(0.162, 0.172, 0.085, 14),
  mortarBoard: new THREE.BoxGeometry(0.42, 0.022, 0.42),
  mortarTassel: new THREE.CylinderGeometry(0.009, 0.016, 0.15, 6),
  gownSkirt: new THREE.CylinderGeometry(0.19, 0.245, 0.44, 14),
  gownStole: new THREE.BoxGeometry(0.052, 0.44, 0.032),
  parcel: new THREE.BoxGeometry(0.4, 0.28, 0.3),
  parcelTape: new THREE.BoxGeometry(0.41, 0.05, 0.31),
};

// Seated hips drop by this much so the body rests on the cushion instead of
// hovering above it (hip joint sits at local y = 0.89 in the rig).
const SIT_HIP_DROP = -0.87;

const SHARED_MAT = {
  dark: new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.55, metalness: 0.1 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45, metalness: 0.05 }),
  sole: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.22, metalness: 0.85 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.18, metalness: 0.94 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.92 }),
  darkLens: new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.12, metalness: 0.55 }),
  tieRed: new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.42, metalness: 0.08 }),
  royalBlue: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.38, metalness: 0.12 }),
  ruby: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.18, metalness: 0.35 }),
  parcel: new THREE.MeshStandardMaterial({ color: 0xb7884e, roughness: 0.85 }),
  tape: new THREE.MeshStandardMaterial({ color: 0xd6b37c, roughness: 0.65 }),
  visor: new THREE.MeshPhysicalMaterial({
    color: 0x22d3ee,
    emissive: 0x0e7490,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.82,
    roughness: 0.12,
    metalness: 0.2,
  }),
};

function part(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Scripted prop-use animations: which prop you hold in your right hand while doing them.
export const ACTION_ITEMS = {
  drink: 'glass',
  eat: 'plate',
  cook: 'pan',
  read: 'book',
  pool: 'cue',
  tv: 'remote',
  movie: 'remote',
  curls: 'dumbbell',
  run: null,
  benchpress: 'dumbbell',
  water: 'can',
  experiment: 'flask',
  piano: null,
  sleep: null,
  sunbathe: null,
  rest: null,
  sit: null,
  type: null,
  talk: null,
  admire: null,
  switch: null,
};

export class Character {
  constructor(appearance) {
    this.group = new THREE.Group();
    this.mats = {
      skin: new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.03 }),
      shirt: new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.04 }),
      pants: new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.04 }),
      hair: new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.04 }),
      shoes: new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.48, metalness: 0.12 }),
      hat: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.08 }),
      accent: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.18 }),
    };
    this.phase = Math.random() * 10;
    this.idlePhase = Math.random() * 10;
    this.pose = 'stand'; // stand | sit | work | dive
    this.poseTimer = 0;
    this.emote = null;   // active emote id or null
    this.emoteTime = 0;
    this.emoteDur = 0;
    this.emoteLoop = false;
    this.jumpY = 0;
    this.jumpVy = 0;
    this.landingSquash = 0;
    this.occupation = null;
    this.carrying = false;
    this.firstPerson = false;
    this.action = null;   // { id, t, duration, loop } scripted prop animation
    this.seat = null;     // { pose, surface, forward, recline } geometry of the prop being used
    this._build();
    this._held = new THREE.Group();
    this._held.position.set(0, -0.31, 0.05);
    this.foreArmR.add(this._held);
    this._heldCache = new Map();
    this._heldKind = null;
    this._buildHeldItems();
    this.setAppearance(appearance);
  }

  setFirstPerson(on) {
    this.firstPerson = !!on;
    if (this.headGroup) this.headGroup.visible = !this.firstPerson;
    if (this.collar) this.collar.visible = !this.firstPerson;
  }

  _build() {
    const m = this.mats;
    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);

    // Sculpted pelvis
    const pelvis = part(G.pelvis, m.pants, 0, 0.89, 0);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.scale.set(0.95, 1, 0.82);
    body.add(pelvis);

    // Articulated 2-segment legs (hip -> thigh -> knee -> shin -> sculpted sneaker)
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.shinL = new THREE.Group();
    this.shinR = new THREE.Group();
    this.legL.position.set(-0.115, 0.89, 0);
    this.legR.position.set(0.115, 0.89, 0);
    this.calves = [];
    this.legExtras = [];
    this.shinExtras = [];
    this.shoeExtras = [];
    this.shoeSoles = [];

    for (const [leg, shin, side] of [[this.legL, this.shinL, -1], [this.legR, this.shinR, 1]]) {
      const thigh = part(G.thigh, m.pants, 0, -0.21, 0);
      leg.add(thigh);
      const legExtra = new THREE.Group();
      legExtra.userData.side = side;
      leg.add(legExtra);
      this.legExtras.push(legExtra);

      shin.position.set(0, -0.42, 0);
      const calf = part(G.shin, m.pants, 0, -0.2, 0);
      shin.add(calf);
      this.calves.push(calf);
      const shinExtra = new THREE.Group();
      shin.add(shinExtra);
      this.shinExtras.push(shinExtra);

      // Sculpted shoe + rubber sole + dynamic footwear extras
      const shoeGroup = new THREE.Group();
      shoeGroup.position.set(0, -0.43, 0.045);
      const upper = part(G.shoeUpper, m.shoes, 0, 0.02, 0);
      upper.rotation.x = Math.PI / 2;
      upper.scale.set(1.02, 1, 0.76);
      const sole = part(G.shoeSole, SHARED_MAT.sole, 0, -0.025, 0.005);
      const shoeExtra = new THREE.Group();
      shoeGroup.add(upper, sole, shoeExtra);
      this.shoeSoles.push(sole);
      this.shoeExtras.push(shoeExtra);
      shin.add(shoeGroup);

      leg.add(shin);
      body.add(leg);
    }

    // Torso (waist + tapered chest + shoulders + collar + belt)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0.9, 0);
    body.add(this.torsoGroup);

    const lowerTorso = part(G.torsoLower, m.shirt, 0, 0.15, 0);
    lowerTorso.scale.set(1.05, 1, 0.72);
    const chest = part(G.torsoChest, m.shirt, 0, 0.43, 0);
    chest.scale.set(1.08, 1, 0.72);
    this.torso = chest;
    this.torsoGroup.add(lowerTorso, chest);

    this.collar = part(G.collar, m.shirt, 0, 0.6, 0.01);
    this.collar.rotation.x = Math.PI / 2 + 0.12;
    this.torsoGroup.add(this.collar);

    this.shoulders = [];
    for (const sx of [-1, 1]) {
      const sh = part(G.shoulder, m.shirt, sx * 0.255, 0.54, 0);
      sh.scale.set(1, 0.92, 0.88);
      this.torsoGroup.add(sh);
      this.shoulders.push(sh);
    }

    this.belt = part(G.belt, SHARED_MAT.dark, 0, 0.025, 0);
    this.belt.scale.set(1.06, 1, 0.74);
    this.buckle = part(G.buckle, SHARED_MAT.chrome, 0, 0.025, 0.135);
    this.torsoGroup.add(this.belt, this.buckle);

    this.stripe = part(G.stripe, m.accent, 0, 0.42, 0);
    this.stripe.scale.set(1.09, 1, 0.74);
    this.torsoGroup.add(this.stripe);

    // 3D sculpted garment details (hoodies, bomber lapels, suit & tie, senator tunic, chains)
    this.topExtras = new THREE.Group();
    this.neckExtras = new THREE.Group();
    this.torsoGroup.add(this.topExtras, this.neckExtras);

    // Articulated 2-segment arms (shoulder -> upper arm -> elbow -> forearm -> hand)
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.foreArmL = new THREE.Group();
    this.foreArmR = new THREE.Group();
    this.upperArms = [];
    this.foreArms = [];
    for (const [arm, fore, side] of [[this.armL, this.foreArmL, -1], [this.armR, this.foreArmR, 1]]) {
      arm.position.set(side * 0.285, 0.55, 0);
      const upper = part(G.upperArm, m.shirt, 0, -0.15, 0);
      arm.add(upper);
      this.upperArms.push(upper);

      fore.position.set(0, -0.3, 0);
      const lower = part(G.foreArm, m.skin, 0, -0.14, 0);
      const hand = part(G.hand, m.skin, 0, -0.29, 0.01);
      hand.scale.set(0.88, 1.08, 0.68);
      fore.add(lower, hand);
      this.foreArms.push(lower);
      arm.add(fore);
      this.torsoGroup.add(arm);
    }

    // Sculpted anatomical head + facial features
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.62, 0);
    this.torsoGroup.add(this.headGroup);
    this.headGroup.add(part(G.neck, m.skin, 0, 0.045, 0));

    this.head = part(G.cranium, m.skin, 0, 0.255, 0);
    this.head.scale.set(0.92, 1.04, 0.96);
    const jaw = part(G.jaw, m.skin, 0, 0.185, 0.02);
    jaw.scale.set(0.88, 0.85, 0.92);
    this.headGroup.add(this.head, jaw);

    // Ears & nose
    for (const sx of [-1, 1]) {
      const ear = part(G.ear, m.skin, sx * 0.152, 0.24, -0.01);
      ear.scale.set(0.55, 1.05, 0.75);
      this.headGroup.add(ear);
    }
    const nose = part(G.nose, m.skin, 0, 0.235, 0.165);
    nose.rotation.x = Math.PI / 2 - 0.22;
    this.headGroup.add(nose);

    // Eyes (sclera + dark iris) + eyebrows + mouth
    for (const sx of [-1, 1]) {
      const sclera = part(G.sclera, SHARED_MAT.white, sx * 0.058, 0.265, 0.142);
      sclera.scale.set(1.1, 0.85, 0.55);
      const iris = part(G.iris, SHARED_MAT.dark, sx * 0.058, 0.265, 0.155);
      iris.scale.set(1, 1, 0.5);
      const brow = part(G.brow, m.hair, sx * 0.058, 0.302, 0.148);
      brow.rotation.z = sx * -0.06;
      this.headGroup.add(sclera, iris, brow);
    }
    const mouth = part(G.mouth, SHARED_MAT.dark, 0, 0.168, 0.146);
    this.headGroup.add(mouth);

    this.hairGroup = new THREE.Group();
    this.headGroup.add(this.hairGroup);
    this.faceExtras = new THREE.Group();
    this.headGroup.add(this.faceExtras);
    this.hatGroup = new THREE.Group();
    this.hatGroup.position.set(0, 0.39, 0);
    this.headGroup.add(this.hatGroup);

    // Carried courier parcel
    this.parcel = new THREE.Group();
    this.parcel.position.set(0, 0.26, 0.3);
    this.parcel.add(part(G.parcel, SHARED_MAT.parcel, 0, 0, 0));
    this.parcel.add(part(G.parcelTape, SHARED_MAT.tape, 0, 0, 0));
    this.parcel.visible = false;
    this.torsoGroup.add(this.parcel);
  }

  setAppearance(app) {
    this.appearance = { ...app };
    const b = BUILDS[app.build] || BUILDS.Balanced;
    this.body.scale.set(b.w, b.h, b.w > 1 ? 1.08 : 1);
    this.headGroup.scale.set(1 / b.w, 1 / b.h, b.w > 1 ? 1 / 1.08 : 1);
    this.mats.skin.color.set(app.skin || '#8d5524');
    this.mats.hair.color.set(app.hair || '#111111');
    this._applyClothes();
    this._buildHair();
    this._buildHat();
  }

  setOccupation(occId) {
    this.occupation = occId && OCCUPATIONS[occId] ? occId : null;
    this._applyClothes();
    this._buildHair();
    this._buildHat();
  }

  _applyClothes() {
    const app = this.appearance;
    const uni = this.occupation ? OCCUPATIONS[this.occupation].uniform : null;
    this.mats.shirt.color.set(uni ? uni.shirt : (app.shirt || '#3b82f6'));
    this.mats.pants.color.set(uni ? uni.pants : (app.pants || '#1f2937'));
    this.mats.shoes.color.set(uni ? '#1c1917' : (app.shoeColor || '#f8fafc'));
    this.stripe.visible = !!uni;
    if (uni) {
      this.mats.accent.color.set(uni.accent);
      this.mats.hat.color.set(uni.hat);
    } else {
      this.mats.hat.color.set(app.hatColor || app.shirt || '#111827');
    }

    const topStyle = uni ? 'tee' : (app.topStyle || 'tee');
    const bottomStyle = uni ? 'jeans' : (app.bottomStyle || 'jeans');
    const shoeStyle = uni ? 'sneakers' : (app.shoeStyle || 'sneakers');

    // Sleeve length & shoulder coverage
    const sleeveless = topStyle === 'jersey';
    const longSleeve = topStyle === 'hoodie' || topStyle === 'bomber' || topStyle === 'suit' || topStyle === 'senator' || topStyle === 'gown';
    for (const sh of this.shoulders) sh.material = sleeveless ? this.mats.skin : this.mats.shirt;
    for (const ua of this.upperArms) ua.material = sleeveless ? this.mats.skin : this.mats.shirt;
    for (const fa of this.foreArms) fa.material = longSleeve ? this.mats.shirt : this.mats.skin;

    // Shorts vs full-length trousers
    for (const calf of this.calves) calf.material = bottomStyle === 'shorts' ? this.mats.skin : this.mats.pants;

    // Senator tunic & academic gown drape cleanly past the waist, hiding belt
    const hideBelt = topStyle === 'senator' || topStyle === 'hoodie' || topStyle === 'gown';
    this.belt.visible = !hideBelt;
    this.buckle.visible = !hideBelt;

    // 3D Sculpted Top Garment Details
    this.topExtras.clear();
    if (topStyle === 'hoodie') {
      const hood = part(G.hoodBack, this.mats.shirt, 0, 0.59, -0.11);
      hood.rotation.x = -0.65;
      hood.scale.set(1.08, 0.86, 0.92);
      const pocket = part(G.hoodPocket, this.mats.shirt, 0, 0.16, 0.155);
      const sL = part(G.drawstring, SHARED_MAT.white, -0.055, 0.49, 0.165);
      const sR = part(G.drawstring, SHARED_MAT.white, 0.055, 0.49, 0.165);
      this.topExtras.add(hood, pocket, sL, sR);
    } else if (topStyle === 'bomber') {
      const inner = part(G.innerShirt, SHARED_MAT.white, 0, 0.36, 0.145);
      const lapL = part(G.lapel, this.mats.shirt, -0.095, 0.36, 0.158);
      const lapR = part(G.lapel, this.mats.shirt, 0.095, 0.36, 0.158);
      const zipL = part(G.drawstring, SHARED_MAT.chrome, -0.058, 0.36, 0.172);
      const zipR = part(G.drawstring, SHARED_MAT.chrome, 0.058, 0.36, 0.172);
      zipL.scale.y = 2.1;
      zipR.scale.y = 2.1;
      this.topExtras.add(inner, lapL, lapR, zipL, zipR);
    } else if (topStyle === 'suit') {
      const shirtFront = part(G.innerShirt, SHARED_MAT.white, 0, 0.38, 0.146);
      const lapL = part(G.lapel, this.mats.shirt, -0.088, 0.4, 0.16);
      lapL.rotation.z = -0.16;
      const lapR = part(G.lapel, this.mats.shirt, 0.088, 0.4, 0.16);
      lapR.rotation.z = 0.16;
      const knot = part(G.tieKnot, SHARED_MAT.tieRed, 0, 0.54, 0.166);
      const tie = part(G.tieBody, SHARED_MAT.tieRed, 0, 0.37, 0.165);
      const sq = part(G.pocketSquare, SHARED_MAT.white, 0.125, 0.46, 0.158);
      this.topExtras.add(shirtFront, lapL, lapR, knot, tie, sq);
    } else if (topStyle === 'senator') {
      // Knee-grazing Nigerian Senator / Agbada tunic skirt + 24k gold chest embroidery
      const skirt = part(G.senatorSkirt, this.mats.shirt, 0, -0.12, 0);
      skirt.scale.set(1.08, 1, 0.8);
      const placket = part(G.senatorPlacket, SHARED_MAT.gold, -0.035, 0.41, 0.156);
      const motif = part(G.senatorMotif, SHARED_MAT.gold, 0.105, 0.44, 0.156);
      this.topExtras.add(skirt, placket, motif);
    } else if (topStyle === 'gown') {
      // Academic Convocation Gown: flowing pleated robe skirt + royal-blue & 24k gold convocation stoles
      const skirt = part(G.gownSkirt, this.mats.shirt, 0, -0.17, 0);
      skirt.scale.set(1.12, 1, 0.84);
      const shirtNeck = part(G.innerShirt, SHARED_MAT.white, 0, 0.46, 0.145);
      shirtNeck.scale.y = 0.48;
      const stoleL = part(G.gownStole, SHARED_MAT.gold, -0.088, 0.34, 0.16);
      const stoleR = part(G.gownStole, SHARED_MAT.gold, 0.088, 0.34, 0.16);
      const velvetL = part(G.lapel, SHARED_MAT.royalBlue, -0.088, 0.42, 0.166);
      const velvetR = part(G.lapel, SHARED_MAT.royalBlue, 0.088, 0.42, 0.166);
      velvetL.scale.set(0.65, 0.65, 1);
      velvetR.scale.set(0.65, 0.65, 1);
      this.topExtras.add(skirt, shirtNeck, stoleL, stoleR, velvetL, velvetR);
    } else if (topStyle === 'jersey') {
      const bar = part(G.jerseyBar, SHARED_MAT.white, 0, 0.41, 0.162);
      this.topExtras.add(bar);
    }

    // 3D Bottoms & Footwear Details
    for (const le of this.legExtras) {
      le.clear();
      const sx = le.userData.side || 1;
      if (bottomStyle === 'cargo') {
        le.add(part(G.cargoPocket, this.mats.pants, sx * 0.085, -0.22, 0.01));
      } else if (bottomStyle === 'shorts') {
        le.add(part(G.shortsCuff, this.mats.pants, 0, -0.35, 0));
      }
    }
    for (const se of this.shinExtras) {
      se.clear();
      if (bottomStyle === 'shorts') {
        se.add(part(G.ankleSock, SHARED_MAT.white, 0, -0.34, 0));
      }
    }
    for (let i = 0; i < this.shoeExtras.length; i++) {
      const shoeEx = this.shoeExtras[i];
      const sole = this.shoeSoles[i];
      shoeEx.clear();
      sole.material = shoeStyle === 'boots' || shoeStyle === 'loafers' ? SHARED_MAT.dark : SHARED_MAT.sole;
      if (shoeStyle === 'hightops') {
        shoeEx.add(part(G.highTopCollar, this.mats.shoes, 0, 0.075, -0.025));
      } else if (shoeStyle === 'boots') {
        shoeEx.add(part(G.bootShaft, this.mats.shoes, 0, 0.095, -0.025));
        shoeEx.add(part(G.bootSole, SHARED_MAT.dark, 0, -0.028, 0.005));
      } else if (shoeStyle === 'loafers') {
        shoeEx.add(part(G.loaferClasp, SHARED_MAT.gold, 0, 0.062, 0.04));
      }
    }

    // 3D Neck Chains (Silver / 24k Gold Cuban Link + Medallion)
    this.neckExtras.clear();
    const chainStyle = uni ? 'none' : (app.chain || 'none');
    if (chainStyle === 'gold' || chainStyle === 'silver') {
      const cMat = chainStyle === 'gold' ? SHARED_MAT.gold : SHARED_MAT.silver;
      const loop = part(G.chainLoop, cMat, 0, 0.555, 0.045);
      loop.rotation.x = Math.PI / 2 + 0.38;
      const pendant = part(G.chainPendant, cMat, 0, 0.445, 0.175);
      pendant.rotation.x = Math.PI / 2;
      this.neckExtras.add(loop, pendant);
    }

    // 3D Eyewear / Shades
    this.faceExtras.clear();
    const glasses = app.glasses || 'none';
    if (glasses === 'aviator' || glasses === 'gold_shades') {
      const frameMat = glasses === 'gold_shades' ? SHARED_MAT.gold : SHARED_MAT.chrome;
      for (const sx of [-1, 1]) {
        this.faceExtras.add(part(G.shadeLens, SHARED_MAT.darkLens, sx * 0.062, 0.266, 0.168));
        if (glasses === 'gold_shades') {
          this.faceExtras.add(part(G.shadeRim, SHARED_MAT.gold, sx * 0.062, 0.266, 0.164));
        }
        this.faceExtras.add(part(G.shadeArm, frameMat, sx * 0.132, 0.27, 0.09));
      }
      this.faceExtras.add(part(G.shadeBridge, frameMat, 0, 0.276, 0.17));
    } else if (glasses === 'cyber_shades') {
      this.faceExtras.add(part(G.cyberVisor, SHARED_MAT.visor, 0, 0.268, 0.165));
      for (const sx of [-1, 1]) {
        this.faceExtras.add(part(G.shadeArm, SHARED_MAT.chrome, sx * 0.135, 0.268, 0.085));
      }
    }
  }

  _buildHair() {
    this.hairGroup.clear();
    const casualHat = !this.occupation && this.appearance.hatStyle && this.appearance.hatStyle !== 'none' && this.appearance.hatStyle !== 'crown';
    const hasHat = !!this.occupation || casualHat;
    let style = this.appearance.hairStyle;
    if (hasHat && (style === 'afro' || style === 'long')) style = 'short';
    const h = this.mats.hair;
    if (style === 'short') {
      const crown = part(G.hairCrown, h, 0, 0.27, -0.008);
      crown.scale.set(0.95, 1.02, 0.99);
      const fringe = part(G.hairFringe, h, 0, 0.37, 0.125);
      fringe.rotation.z = Math.PI / 2;
      this.hairGroup.add(crown, fringe);
    } else if (style === 'buzz') {
      const buzz = part(G.buzz, h, 0, 0.265, -0.005);
      buzz.scale.set(0.93, 1.02, 0.97);
      this.hairGroup.add(buzz);
    } else if (style === 'afro') {
      const a = part(G.afro, h, 0, 0.35, -0.02);
      a.scale.set(1.02, 0.92, 1.02);
      this.hairGroup.add(a);
    } else if (style === 'long') {
      const crown = part(G.hairCrown, h, 0, 0.27, -0.008);
      crown.scale.set(0.96, 1.03, 1.0);
      const back = part(G.hairLongBack, h, 0, 0.16, -0.105);
      back.scale.set(1.12, 1, 0.65);
      this.hairGroup.add(crown, back);
    }
  }

  _buildHat() {
    this.hatGroup.clear();
    const hat = this.mats.hat;
    const add = (m) => this.hatGroup.add(m);
    if (!this.occupation) {
      const casual = this.appearance.hatStyle || 'none';
      if (casual === 'snapback') {
        add(part(G.capTop, hat, 0, -0.08, 0));
        add(part(G.capBrim, hat, 0, -0.02, 0.19));
      } else if (casual === 'bucket') {
        add(part(G.bucketCrown, hat, 0, 0.01, 0));
        add(part(G.bucketBrim, hat, 0, -0.045, 0));
      } else if (casual === 'fila') {
        const fc = part(G.filaCrown, hat, 0, 0.02, 0);
        fc.rotation.z = 0.08;
        add(fc);
        add(part(G.filaBand, SHARED_MAT.gold, 0, -0.032, 0));
      } else if (casual === 'mortarboard') {
        add(part(G.mortarSkull, hat, 0, 0.015, 0));
        const board = part(G.mortarBoard, hat, 0, 0.068, 0.01);
        board.rotation.y = Math.PI / 4; // classic diamond academic orientation!
        add(board);
        add(part(G.crownGem, SHARED_MAT.gold, 0, 0.082, 0.01));
        const cord = part(G.drawstring, SHARED_MAT.gold, 0.12, 0.078, 0.05);
        cord.rotation.z = Math.PI / 2 - 0.18;
        cord.scale.y = 1.05;
        add(cord);
        add(part(G.mortarTassel, SHARED_MAT.gold, 0.205, 0.005, 0.08));
      } else if (casual === 'crown') {
        add(part(G.crownBand, SHARED_MAT.gold, 0, 0.005, 0));
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2;
          add(part(G.crownSpike, SHARED_MAT.gold, Math.sin(ang) * 0.16, 0.075, Math.cos(ang) * 0.16));
          add(part(G.crownGem, SHARED_MAT.ruby, Math.sin(ang) * 0.175, 0.005, Math.cos(ang) * 0.175));
        }
      }
      return;
    }
    const type = OCCUPATIONS[this.occupation].uniform.headgear;
    switch (type) {
      case 'cap':
        add(part(G.capTop, hat, 0, -0.08, 0));
        add(part(G.capBrim, hat, 0, -0.02, 0.19));
        break;
      case 'peaked':
        add(part(G.peakTop, hat, 0, 0.06, 0));
        add(part(G.peakBand, SHARED_MAT.dark, 0, 0.0, 0));
        add(part(G.capBrim, SHARED_MAT.dark, 0, -0.02, 0.19));
        add(part(G.badge, this.mats.accent, 0, 0.04, 0.18));
        break;
      case 'hardhat':
        add(part(G.hardhat, hat, 0, -0.04, 0));
        add(part(G.hardBrim, hat, 0, -0.04, 0.02));
        break;
      case 'chefhat':
        add(part(G.chefBase, SHARED_MAT.white, 0, 0.04, 0));
        add(part(G.chefPuff, SHARED_MAT.white, 0, 0.22, 0));
        break;
      case 'visor':
        add(part(G.visorBand, hat, 0, -0.1, 0));
        add(part(G.visorGlass, SHARED_MAT.visor, 0, -0.12, 0.16));
        break;
      case 'beanie':
        add(part(G.beanie, hat, 0, -0.06, 0));
        add(part(G.beanieFold, hat, 0, -0.05, 0));
        break;
      case 'flatcap': {
        const t = part(G.flatTop, hat, 0, -0.04, 0.01);
        t.scale.set(1, 0.55, 1.1);
        add(t);
        add(part(G.capBrim, hat, 0, -0.03, 0.18));
        break;
      }
      default:
        break;
    }
  }

  setCarrying(on) {
    this.carrying = on;
    this.parcel.visible = on;
  }

  /** Play a scripted prop-use animation ('drink', 'piano', 'pool', 'tv' …). */
  playAction(id, { duration = 3, loop = false } = {}) {
    if (!id) return false;
    const item = ACTION_ITEMS[id] || null;
    this.action = { id, t: 0, duration, loop };
    this._showHeld(item);
    return true;
  }

  stopAction() {
    this.action = null;
    this._showHeld(null);
  }

  clearAction() { this.stopAction(); }

  /** True while a scripted prop animation is playing. */
  isActing() {
    return !!this.action;
  }

  _buildHeldItems() {
    const m = this.mats;
    const glassClear = new THREE.MeshPhysicalMaterial({
      color: 0xd8eef7, transparent: true, opacity: 0.42, roughness: 0.06, metalness: 0.05,
    });
    const mk = (kind) => {
      const g = new THREE.Group();
      const mesh = (geo, mat, x, y, z) => {
        const o = new THREE.Mesh(geo, mat);
        o.position.set(x, y, z);
        o.castShadow = true;
        g.add(o);
        return o;
      };
      if (kind === 'glass') {
        mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.13, 10), glassClear, 0, -0.02, 0);
        mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.085, 10), new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.3 }), 0, -0.045, 0);
      } else if (kind === 'book') {
        const cover = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.7 });
        mesh(new THREE.BoxGeometry(0.2, 0.27, 0.05), cover, 0, -0.1, 0);
        mesh(new THREE.BoxGeometry(0.17, 0.24, 0.055), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 }), 0.012, -0.1, 0);
      } else if (kind === 'cue') {
        const cue = mesh(new THREE.CylinderGeometry(0.014, 0.026, 1.55, 8), new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.55 }), 0, -0.86, 0);
        cue.rotation.z = 0;
      } else if (kind === 'remote') {
        mesh(new THREE.BoxGeometry(0.055, 0.16, 0.03), m.hat, 0, -0.05, 0);
      } else if (kind === 'dumbbell') {
        mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), SHARED_MAT.chrome || m.metal, 0, -0.06, 0).rotation.z = Math.PI / 2;
        for (const dx of [-0.12, 0.12]) mesh(new THREE.SphereGeometry(0.062, 10, 8), m.hat, dx, -0.06, 0);
      } else if (kind === 'pan') {
        mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.045, 14), m.metal, 0, -0.18, 0.1);
        mesh(new THREE.BoxGeometry(0.03, 0.03, 0.24), m.hat, 0, -0.18, -0.06);
      } else if (kind === 'can') {
        mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 12), m.accent, 0, -0.14, 0);
        const spout = mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.24, 8), m.accent, 0, -0.09, 0.12);
        spout.rotation.x = 0.9;
      } else if (kind === 'flask') {
        mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.16, 12), glassClear, 0, -0.12, 0);
        mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.3 }), 0, 0.0, 0);
      } else if (kind === 'plate') {
        mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.03, 16), SHARED_MAT.white || m.accent, 0, -0.13, 0.02);
      }
      g.visible = false;
      this._held.add(g);
      return g;
    };
    for (const kind of ['glass', 'book', 'cue', 'remote', 'dumbbell', 'pan', 'can', 'flask', 'plate']) {
      this._heldCache.set(kind, mk(kind));
    }
  }

  _showHeld(kind) {
    this._heldKind = kind;
    for (const [k, g] of this._heldCache) g.visible = k === kind;
  }

  setPose(pose, duration = 0) {
    this.pose = pose;
    this.poseTimer = duration;
    if (pose !== 'stand') this.clearEmote();
  }

  /** Trigger an expressive emote ('wave' | 'greet' | 'clap' | 'celebrate' | 'flex' | 'dance1' | 'dance2' | 'dance3'). */
  setEmote(id) {
    const def = EMOTE_MAP[id];
    if (!def || this.pose === 'sit') return false;
    this.emote = id;
    this.emoteTime = 0;
    this.emoteDur = def.duration;
    this.emoteLoop = def.loop;
    return true;
  }

  clearEmote() {
    this.emote = null;
    this.emoteTime = 0;
  }

  /** Trigger an on-foot jump if grounded. */
  triggerJump() {
    if (this.pose === 'sit' || this.jumpY > 0.02) return false;
    this.jumpVy = JUMP_VELOCITY;
    this.jumpY = 0.021;
    this.clearEmote();
    return true;
  }

  isAirborne() {
    return this.jumpY > 0.01;
  }

  _resetJoints() {
    this.torsoGroup.rotation.set(0, 0, 0);
    this.torsoGroup.scale.set(1, 1, 1);
    this.headGroup.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0.07);
    this.armR.rotation.set(0, 0, -0.07);
    this.foreArmL.rotation.set(-0.18, 0, 0);
    this.foreArmR.rotation.set(-0.18, 0, 0);
    this.legL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.shinL.rotation.set(0, 0, 0);
    this.shinR.rotation.set(0, 0, 0);
  }

  _animateEmote(dt) {
    this.emoteTime += dt;
    if (!this.emoteLoop && this.emoteTime >= this.emoteDur) {
      this.clearEmote();
      return false;
    }
    this._resetJoints();
    const t = this.emoteTime;
    switch (this.emote) {
      case 'wave': {
        this.armR.rotation.set(-2.55, 0, -0.35 + Math.sin(t * 11) * 0.36);
        this.foreArmR.rotation.set(-0.35, 0, Math.sin(t * 11) * 0.28);
        this.headGroup.rotation.z = -0.1;
        this.torsoGroup.rotation.y = 0.14;
        break;
      }
      case 'greet': {
        const bow = Math.sin(Math.min(1, t / 1.5) * Math.PI);
        this.torsoGroup.rotation.x = bow * 0.28;
        this.headGroup.rotation.x = bow * 0.24;
        this.armR.rotation.set(-1.05 * bow, 0, -0.45 * bow);
        this.foreArmR.rotation.set(-1.35 * bow, 0.4 * bow, 0);
        break;
      }
      case 'clap': {
        const clap = Math.abs(Math.sin(t * 10.5));
        this.armL.rotation.set(-1.25, 0.35, 0.38 - clap * 0.34);
        this.armR.rotation.set(-1.25, -0.35, -0.38 + clap * 0.34);
        this.foreArmL.rotation.set(-0.85, 0, 0);
        this.foreArmR.rotation.set(-0.85, 0, 0);
        this.headGroup.rotation.x = -0.06 + clap * 0.08;
        break;
      }
      case 'celebrate': {
        const hop = Math.abs(Math.sin(t * 7.5));
        this.body.position.y = this.jumpY + hop * 0.18;
        this.armL.rotation.set(-2.75 + Math.sin(t * 9) * 0.22, 0, 0.32);
        this.armR.rotation.set(-2.75 - Math.sin(t * 9) * 0.22, 0, -0.32);
        this.foreArmL.rotation.set(-0.25, 0, 0);
        this.foreArmR.rotation.set(-0.25, 0, 0);
        this.shinL.rotation.x = (1 - hop) * 0.25;
        this.shinR.rotation.x = (1 - hop) * 0.25;
        break;
      }
      case 'flex': {
        const pulse = 0.85 + Math.sin(t * 8) * 0.15;
        this.torsoGroup.rotation.x = -0.08;
        this.armL.rotation.set(-0.3, 0, 1.35);
        this.armR.rotation.set(-0.3, 0, -1.35);
        this.foreArmL.rotation.set(-0.2, 0, -1.75 * pulse);
        this.foreArmR.rotation.set(-0.2, 0, 1.75 * pulse);
        this.legL.rotation.z = -0.1;
        this.legR.rotation.z = 0.1;
        break;
      }
      case 'dance1': { // Afro-Groove: rhythmic knee bounce, hip sway & rolling arms
        const beat = t * 6.4;
        const s = Math.sin(beat);
        const c = Math.cos(beat);
        this.body.position.y = this.jumpY + Math.abs(c) * 0.07;
        this.torsoGroup.rotation.z = s * 0.13;
        this.torsoGroup.rotation.y = c * 0.22;
        this.torsoGroup.rotation.x = 0.09;
        this.legL.rotation.x = Math.max(-0.4, s * 0.42);
        this.legR.rotation.x = Math.max(-0.4, -s * 0.42);
        this.shinL.rotation.x = Math.max(0.08, -s * 0.55);
        this.shinR.rotation.x = Math.max(0.08, s * 0.55);
        this.armL.rotation.set(-1.1 + s * 0.55, 0, 0.42 + c * 0.25);
        this.armR.rotation.set(-1.1 - s * 0.55, 0, -0.42 + c * 0.25);
        this.foreArmL.rotation.x = -0.95 + c * 0.35;
        this.foreArmR.rotation.x = -0.95 - c * 0.35;
        this.headGroup.rotation.z = -s * 0.12;
        break;
      }
      case 'dance2': { // Robot: quantized crisp mechanical isolations
        const step = Math.floor(t * 4.5) / 4.5;
        const s = Math.sin(step * 5.2);
        const c = Math.cos(step * 3.7);
        this.torsoGroup.rotation.y = Math.round(s) * 0.38;
        this.headGroup.rotation.y = -Math.round(c) * 0.35;
        this.armL.rotation.set(s > 0 ? -1.55 : -0.2, 0, 0.55);
        this.armR.rotation.set(c > 0 ? -1.55 : -0.2, 0, -0.55);
        this.foreArmL.rotation.x = c > 0 ? -1.55 : -0.1;
        this.foreArmR.rotation.x = s > 0 ? -1.55 : -0.1;
        break;
      }
      case 'dance3': { // Street Shuffle: rapid footwork + cross-body arm swings
        const beat = t * 8.2;
        const s = Math.sin(beat);
        this.body.position.y = this.jumpY + Math.abs(Math.sin(beat * 2)) * 0.08;
        this.legL.rotation.set(s * 0.58, 0, -0.08 - Math.max(0, s) * 0.14);
        this.legR.rotation.set(-s * 0.58, 0, 0.08 + Math.max(0, -s) * 0.14);
        this.shinL.rotation.x = Math.max(0, -s * 0.72);
        this.shinR.rotation.x = Math.max(0, s * 0.72);
        this.armL.rotation.set(-0.75 - s * 0.65, 0, 0.22 - s * 0.28);
        this.armR.rotation.set(-0.75 + s * 0.65, 0, -0.22 - s * 0.28);
        this.foreArmL.rotation.x = -0.7;
        this.foreArmR.rotation.x = -0.7;
        this.torsoGroup.rotation.y = -s * 0.24;
        break;
      }
      default:
        break;
    }
    return true;
  }

  // speed in m/s (0 = idle)
  animate(dt, speed) {
    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
      if (this.poseTimer <= 0 && this.pose === 'dive') this.pose = 'stand';
    }

    const body = this.body;
    // Seated driving / passenger pose with bent knees & hands on wheel
    if (this.pose === 'sit') {
      this.jumpY = 0; this.jumpVy = 0;
      this._resetJoints();
      // hips drop onto the seat surface (the group origin sits on the cushion)
      this.legL.rotation.x = this.legR.rotation.x = -1.35;
      this.shinL.rotation.x = this.shinR.rotation.x = 1.18;
      this.legL.rotation.z = -0.05;
      this.legR.rotation.z = 0.05;
      this.armL.rotation.set(-0.92, 0, 0.24);
      this.armR.rotation.set(-0.92, 0, -0.24);
      this.foreArmL.rotation.x = -0.62;
      this.foreArmR.rotation.x = -0.62;
      this.legL.rotation.x -= 0.05;
      body.position.y = SIT_HIP_DROP;
      body.position.z = 0;
      body.rotation.x = 0;
      this._actionTick(dt);
      return;
    }

    // Lying down (beds, loungers, treatment tables)
    if (this.pose === 'lie') {
      this.jumpY = 0; this.jumpVy = 0;
      this._resetJoints();
      const recline = this.seat?.recline || 0;
      const forward = this.seat?.forward ?? 0.9;
      body.rotation.set(-Math.PI / 2 + recline, 0, 0);
      body.position.set(0, 0.21, forward);
      this.legL.rotation.set(0.05, 0, -0.05);
      this.legR.rotation.set(0.05, 0, 0.05);
      this.shinL.rotation.x = 0.1;
      this.shinR.rotation.x = 0.1;
      this.armL.rotation.set(0.16, 0, 0.54);
      this.armR.rotation.set(0.16, 0, -0.54);
      this.foreArmL.rotation.x = -0.14;
      this.foreArmR.rotation.x = -0.14;
      this.headGroup.rotation.x = -0.2;
      this._actionTick(dt);
      return;
    }

    // Pedestrian dodge dive
    if (this.pose === 'dive') {
      body.rotation.x = Math.min(body.rotation.x + dt * 6.5, 1.22);
      body.position.y = 0.28;
      this.armL.rotation.x = this.armR.rotation.x = -2.6;
      this.shinL.rotation.x = this.shinR.rotation.x = 0.55;
      return;
    }

    // Vertical jump integration
    if (this.jumpY > 0 || this.jumpVy !== 0) {
      this.jumpVy -= JUMP_GRAVITY * dt;
      this.jumpY += this.jumpVy * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.jumpVy = 0;
        this.landingSquash = 0.16;
      }
    }
    if (this.landingSquash > 0) this.landingSquash = Math.max(0, this.landingSquash - dt * 1.1);

    body.rotation.x *= 0.8;

    // Movement cancels active emotes & scripted prop animations
    if (speed > 0.25 && this.emote) this.clearEmote();
    if (speed > 0.25 && this.action) this.stopAction();

    // Airborne jump pose
    if (this.jumpY > 0.02) {
      this._resetJoints();
      const tuck = Math.min(1, this.jumpY * 1.25);
      body.position.y = this.jumpY;
      this.torsoGroup.rotation.x = 0.14;
      this.legL.rotation.x = -0.55 * tuck;
      this.legR.rotation.x = -0.32 * tuck;
      this.shinL.rotation.x = 0.95 * tuck;
      this.shinR.rotation.x = 0.68 * tuck;
      this.armL.rotation.set(-1.35 * tuck, 0, 0.36);
      this.armR.rotation.set(-1.35 * tuck, 0, -0.36);
      this.foreArmL.rotation.x = -0.55;
      this.foreArmR.rotation.x = -0.55;
      return;
    }

    // Active emote animation when stationary
    if (this.emote && this._animateEmote(dt)) return;

    // Biomechanical walk & sprint cycle with articulated knees, elbows & spine twist
    if (speed > 0.15) {
      const runBlend = Math.min(1, Math.max(0, (speed - 4.1) / 3.1));
      this.phase += dt * (3.4 + speed * 1.65);
      const stride = Math.min(0.32 + speed * 0.095, 0.92);
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);

      // Hip swing + realistic knee bend on recovery swing
      this.legL.rotation.x = s * stride;
      this.legR.rotation.x = -s * stride;
      this.legL.rotation.z = 0;
      this.legR.rotation.z = 0;
      const kneeBase = 0.12 + runBlend * 0.22;
      this.shinL.rotation.x = kneeBase + Math.max(0, -c) * (0.58 + runBlend * 0.52);
      this.shinR.rotation.x = kneeBase + Math.max(0, c) * (0.58 + runBlend * 0.52);

      // Spine forward lean + counter-twist
      this.torsoGroup.rotation.x = 0.04 + runBlend * 0.15;
      this.torsoGroup.rotation.y = -s * (0.1 + runBlend * 0.08);
      this.torsoGroup.rotation.z = c * 0.035;
      this.headGroup.rotation.y = s * 0.06;
      this.headGroup.rotation.x = -this.torsoGroup.rotation.x * 0.55;

      if (this.carrying) {
        this.armL.rotation.set(-1.05, 0.18, 0.08);
        this.armR.rotation.set(-1.05, -0.18, -0.08);
        this.foreArmL.rotation.x = -0.55;
        this.foreArmR.rotation.x = -0.55;
      } else {
        const armAmp = stride * (0.72 + runBlend * 0.35);
        this.armL.rotation.set(-s * armAmp, 0, 0.07 + runBlend * 0.05);
        this.armR.rotation.set(s * armAmp, 0, -0.07 - runBlend * 0.05);
        const elbowBase = -0.24 - runBlend * 0.88;
        this.foreArmL.rotation.x = elbowBase - Math.max(0, s) * 0.28;
        this.foreArmR.rotation.x = elbowBase - Math.max(0, -s) * 0.28;
      }

      const squash = this.landingSquash * 0.55;
      body.position.y = Math.abs(c) * (0.045 + runBlend * 0.035) - squash;
    } else {
      // Natural breathing + subtle idle weight shift & head look
      this.phase += dt * 1.9;
      this.idlePhase += dt * 0.75;
      this.legL.rotation.x *= 0.82;
      this.legR.rotation.x *= 0.82;
      const squashBend = this.landingSquash * 2.2;
      this.shinL.rotation.x = this.shinL.rotation.x * 0.8 + squashBend;
      this.shinR.rotation.x = this.shinR.rotation.x * 0.8 + squashBend;
      body.position.y = -this.landingSquash * 0.45;

      this.torsoGroup.rotation.x *= 0.82;
      this.torsoGroup.rotation.y = Math.sin(this.idlePhase) * 0.04;
      this.torsoGroup.rotation.z = Math.cos(this.idlePhase * 0.8) * 0.015;
      this.headGroup.rotation.y = Math.sin(this.idlePhase * 1.3) * 0.11;
      this.headGroup.rotation.x = Math.cos(this.idlePhase * 0.9) * 0.03;

      if (this.pose === 'work') {
        this.armR.rotation.set(-0.95 + Math.sin(this.phase * 3.2) * 0.42, 0, -0.1);
        this.foreArmR.rotation.x = -0.65 + Math.cos(this.phase * 3.2) * 0.35;
        this.armL.rotation.set(-0.65 + Math.cos(this.phase * 3.2) * 0.18, 0, 0.1);
        this.foreArmL.rotation.x = -0.55;
      } else if (this.carrying) {
        this.armL.rotation.set(-1.05, 0.18, 0.08);
        this.armR.rotation.set(-1.05, -0.18, -0.08);
        this.foreArmL.rotation.x = -0.55;
        this.foreArmR.rotation.x = -0.55;
      } else {
        this.armL.rotation.set(Math.sin(this.phase) * 0.035, 0, 0.08);
        this.armR.rotation.set(-Math.sin(this.phase) * 0.035, 0, -0.08);
        this.foreArmL.rotation.x = -0.2;
        this.foreArmR.rotation.x = -0.2;
      }
      this.torsoGroup.scale.y = 1 + Math.sin(this.phase * 1.2) * 0.01;
    }
    this._actionTick(dt);
  }

  /**
   * Scripted prop-use animations. Runs after the base pose so it can override
   * any joint: drinking at the bar, playing the piano, taking a pool shot,
   * watching TV, lifting weights, cooking, reading, watering plants…
   */
  _actionTick(dt) {
    const a = this.action;
    if (!a) return false;
    a.t += dt;
    if (!a.loop && a.t >= a.duration) {
      this.stopAction();
      return false;
    }
    const t = a.t;
    const T = this.torsoGroup;
    const H = this.headGroup;
    switch (a.id) {
      case 'sit': {
        T.rotation.z = Math.sin(t * 0.9) * 0.018;
        T.rotation.y = Math.sin(t * 0.45) * 0.05;
        H.rotation.y = Math.sin(t * 0.32) * 0.22;
        H.rotation.x = Math.cos(t * 0.55) * 0.05;
        this.legL.rotation.x = -1.35 + Math.sin(t * 0.6) * 0.05;
        break;
      }
      case 'sleep': {
        T.scale.y = 1 + Math.sin(t * 1.35) * 0.014;
        H.rotation.z = 0.14 + Math.sin(t * 0.5) * 0.03;
        H.rotation.y = 0.12;
        this.legL.rotation.x = 0.03;
        this.legR.rotation.x = 0.07;
        break;
      }
      case 'rest': {
        T.scale.y = 1 + Math.sin(t * 1.7) * 0.012;
        this.armL.rotation.set(-0.5, 0, 0.62);
        this.armR.rotation.set(-0.5, 0, -0.62);
        this.foreArmL.rotation.x = -1.5;
        this.foreArmR.rotation.x = -1.5;
        H.rotation.x = -0.1;
        break;
      }
      case 'sunbathe': {
        // hands behind the head, one knee up, soaking up the sun
        this.armL.rotation.set(-2.35, 0, 0.72);
        this.armR.rotation.set(-2.35, 0, -0.72);
        this.foreArmL.rotation.x = -1.75;
        this.foreArmR.rotation.x = -1.75;
        this.legR.rotation.x = -0.55;
        this.shinR.rotation.x = 0.85;
        this.legL.rotation.x = 0.12;
        H.rotation.x = -0.32;
        break;
      }
      case 'tv': {
        // slouched on the sofa, remote in hand, reacting to the screen
        T.rotation.x = -0.04 + Math.sin(t * 0.7) * 0.015;
        H.rotation.y = Math.sin(t * 0.21) * 0.06;
        H.rotation.x = -0.05 + Math.sin(t * 0.9) * 0.03;
        this.armR.rotation.set(-0.75, 0, -0.5);
        this.foreArmR.rotation.set(-0.95 + Math.sin(t * 6.5) * 0.05, 0, 0.1);
        this.armL.rotation.set(-0.55, 0, 0.38);
        this.foreArmL.rotation.x = -0.95;
        const laugh = Math.max(0, Math.sin(t * 0.75 - 1.2));
        if (laugh > 0.86) {
          T.rotation.x -= 0.06;
          H.rotation.x += 0.08;
          this.armL.rotation.x -= 0.2;
        }
        break;
      }
      case 'movie': {
        H.rotation.x = -0.2 + Math.sin(t * 0.4) * 0.03;
        this.armR.rotation.set(-1.35, 0, -0.32);
        this.foreArmR.rotation.x = -1.5 + Math.sin(t * 2.2) * 0.12;
        this.armL.rotation.set(-1.15, 0, 0.36);
        this.foreArmL.rotation.x = -1.4;
        break;
      }
      case 'drink': {
        // raise the glass, two sips, head tips back, glass returns to the bar
        const cycle = (t % 2.0) / 2.0;
        const raise = cycle < 0.22 ? cycle / 0.22 : cycle < 0.62 ? 1 : cycle < 0.9 ? 1 - (cycle - 0.62) / 0.28 : 0;
        const sip = Math.max(0, Math.sin((cycle - 0.24) / 0.4 * Math.PI));
        this.armR.rotation.set(-1.05 - raise * 0.95, 0, -0.42 + raise * 0.12);
        this.foreArmR.rotation.set(-0.7 - raise * 0.95, 0, 0.15);
        H.rotation.x = -0.08 - sip * 0.3;
        T.rotation.x = -sip * 0.05;
        this.armL.rotation.set(-0.18, 0, 0.3);
        this.foreArmL.rotation.x = -0.35;
        if (raise > 0.02) break;
        break;
      }
      case 'eat': {
        const cycle = (t % 1.7) / 1.7;
        const bite = cycle < 0.5 ? Math.sin(cycle * Math.PI) : 0;
        this.armR.rotation.set(-1.1 - bite * 0.75, 0, -0.45);
        this.foreArmR.rotation.set(-1.0 - bite * 0.7, 0, 0.1);
        this.armL.rotation.set(-0.8, 0, 0.5);
        this.foreArmL.rotation.x = -1.4;
        H.rotation.x = 0.1 - bite * 0.22;
        T.rotation.y = Math.sin(t * 0.6) * 0.04;
        break;
      }
      case 'piano': {
        // both hands bounce across the keys, head nods with the beat
        const beat = t * 6.6;
        const l = Math.sin(beat) * 0.5 + 0.5;
        const r = Math.sin(beat + 1.9) * 0.5 + 0.5;
        this.armL.rotation.set(-1.02 - l * 0.08, 0, 0.4);
        this.armR.rotation.set(-1.02 - r * 0.08, 0, -0.4);
        this.foreArmL.rotation.set(-1.12 - l * 0.16, 0, 0);
        this.foreArmR.rotation.set(-1.12 - r * 0.16, 0, 0);
        T.rotation.x = 0.1;
        T.rotation.y = Math.sin(beat * 0.25) * 0.07;
        H.rotation.x = 0.26 + Math.sin(beat * 0.5) * 0.05;
        H.rotation.y = Math.sin(beat * 0.25) * 0.1;
        this.legL.rotation.x = -0.1 + Math.sin(beat * 0.5) * 0.05;
        break;
      }
      case 'pool': {
        // lean over the table, cue back, strike, straighten up, chalk the tip
        const cycle = (t % 4.4) / 4.4;
        const aim = cycle < 0.55 ? 1 : cycle < 0.7 ? 1 - (cycle - 0.55) / 0.15 : 0.15;
        const strike = cycle > 0.28 && cycle < 0.34 ? Math.sin(((cycle - 0.28) / 0.06) * Math.PI) : 0;
        T.rotation.x = 0.3 * aim;
        T.rotation.y = -0.16 * aim;
        this.armR.rotation.set(-1.25 - aim * 0.35, 0, -0.2 - aim * 0.15);
        this.foreArmR.rotation.set(-0.5 + aim * 0.1 - strike * 0.45, 0, 0);
        this.armL.rotation.set(-1.05 - aim * 0.35, 0, 0.34);
        this.foreArmL.rotation.x = -0.9;
        H.rotation.x = 0.16 * aim;
        H.rotation.y = -0.1 * aim;
        this.legL.rotation.x = 0.12 * aim;
        this.legR.rotation.x = -0.14 * aim;
        break;
      }
      case 'read': {
        // book held in both hands, eyes scanning, page turn every ~3 s
        const page = (t % 3.2) / 3.2;
        const turn = page > 0.86 ? Math.sin(((page - 0.86) / 0.14) * Math.PI) : 0;
        this.armL.rotation.set(-0.95 - turn * 0.12, 0, 0.34);
        this.armR.rotation.set(-0.95, 0, -0.34);
        this.foreArmL.rotation.set(-1.35 - turn * 0.25, 0, 0);
        this.foreArmR.rotation.set(-1.35, 0, 0);
        H.rotation.x = 0.3 + Math.sin(t * 0.8) * 0.04;
        T.rotation.x = 0.05;
        break;
      }
      case 'type': {
        const tap = Math.sin(t * 13);
        this.armL.rotation.set(-0.88, 0, 0.26);
        this.armR.rotation.set(-0.88, 0, -0.26);
        this.foreArmL.rotation.set(-1.02 + tap * 0.05, 0, 0);
        this.foreArmR.rotation.set(-1.02 - tap * 0.05, 0, 0);
        H.rotation.x = 0.18;
        T.rotation.x = 0.06;
        break;
      }
      case 'cook': {
        // stirring a pan on the hob, occasional seasoning shake
        const stir = t * 4.2;
        this.armR.rotation.set(-1.02, 0, -0.28 + Math.sin(stir) * 0.12);
        this.foreArmR.rotation.set(-1.15, 0, Math.sin(stir) * 0.22);
        this.armL.rotation.set(-0.92, 0, 0.3);
        this.foreArmL.rotation.set(-1.2 + Math.cos(stir * 1.3) * 0.08, 0, 0);
        T.rotation.x = 0.08;
        H.rotation.x = 0.3;
        break;
      }
      case 'run': {
        // treadmill: fast stride, pumping arms, bouncing head
        const runPhase = t * 11;
        const s = Math.sin(runPhase);
        this.legL.rotation.x = s * 0.7;
        this.legR.rotation.x = -s * 0.7;
        this.shinL.rotation.x = 0.25 + Math.max(0, -Math.cos(runPhase)) * 0.95;
        this.shinR.rotation.x = 0.25 + Math.max(0, Math.cos(runPhase)) * 0.95;
        this.armL.rotation.set(-s * 0.75 - 0.2, 0, 0.1);
        this.armR.rotation.set(s * 0.75 - 0.2, 0, -0.1);
        this.foreArmL.rotation.x = -1.15;
        this.foreArmR.rotation.x = -1.15;
        this.body.position.y = Math.abs(Math.cos(runPhase)) * 0.06;
        T.rotation.x = 0.16;
        H.rotation.x = -0.1;
        break;
      }
      case 'benchpress': {
        const push = (Math.sin(t * 3.4) + 1) / 2;
        this.armL.rotation.set(-2.5 + push * 0.85, 0, 0.4);
        this.armR.rotation.set(-2.5 + push * 0.85, 0, -0.4);
        this.foreArmL.rotation.x = -0.5;
        this.foreArmR.rotation.x = -0.5;
        T.rotation.x = 0.12;
        H.rotation.x = -0.18;
        break;
      }
      case 'curls': {
        const c = (Math.sin(t * 3.6) + 1) / 2;
        this.armR.rotation.set(-0.55 - c * 1.15, 0, -0.2);
        this.foreArmR.rotation.set(-0.6 - c * 1.35, 0, 0);
        this.armL.rotation.set(-0.3, 0, 0.16);
        this.foreArmL.rotation.x = -0.3;
        T.rotation.y = Math.sin(t * 1.8) * 0.05;
        H.rotation.x = 0.08;
        break;
      }
      case 'water': {
        const pour = Math.max(0, Math.sin(t * 1.7));
        this.armR.rotation.set(-0.95 - pour * 0.25, 0, -0.25);
        this.foreArmR.rotation.set(-1.0 - pour * 0.35, 0, 0);
        this.armL.rotation.set(-0.6, 0, 0.34);
        this.foreArmL.rotation.x = -0.9;
        T.rotation.x = 0.12 + pour * 0.08;
        H.rotation.x = 0.3;
        break;
      }
      case 'admire': {
        const sway = Math.sin(t * 0.6);
        this.armL.rotation.set(0.32, 0, 0.16);
        this.armR.rotation.set(0.32, 0, -0.16);
        this.foreArmL.rotation.set(0.2, 0, -0.9);
        this.foreArmR.rotation.set(0.2, 0, 0.9);
        H.rotation.y = sway * 0.3;
        H.rotation.x = -0.12 + Math.sin(t * 0.5) * 0.05;
        T.rotation.y = sway * 0.08;
        break;
      }
      case 'switch': {
        const reach = Math.max(0, Math.sin(t * 2.4));
        this.armR.rotation.set(-1.1 - reach * 0.75, 0, -0.3);
        this.foreArmR.rotation.set(-0.9 - reach * 0.4, 0, 0);
        H.rotation.x = -0.12 * reach;
        break;
      }
      case 'talk': {
        const g = Math.sin(t * 3.1);
        this.armR.rotation.set(-0.9 - Math.max(0, g) * 0.35, 0, -0.36);
        this.foreArmR.rotation.set(-0.95 - Math.max(0, g) * 0.4, 0, 0.1);
        this.armL.rotation.set(-0.5, 0, 0.34);
        this.foreArmL.rotation.x = -0.6;
        H.rotation.y = Math.sin(t * 1.4) * 0.14;
        H.rotation.x = Math.sin(t * 2.6) * 0.06;
        break;
      }
      case 'experiment': {
        const shake = Math.sin(t * 8.5);
        this.armR.rotation.set(-1.15, 0, -0.28 + shake * 0.06);
        this.foreArmR.rotation.set(-1.3 + shake * 0.12, 0, 0);
        this.armL.rotation.set(-1.0, 0, 0.3);
        this.foreArmL.rotation.x = -1.2;
        T.rotation.x = 0.08;
        H.rotation.x = 0.26;
        break;
      }
      default:
        break;
    }
    return true;
  }

  dispose() {
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
