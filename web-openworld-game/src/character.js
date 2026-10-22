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
  parcel: new THREE.BoxGeometry(0.4, 0.28, 0.3),
  parcelTape: new THREE.BoxGeometry(0.41, 0.05, 0.31),
};

const SHARED_MAT = {
  dark: new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.55, metalness: 0.1 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45, metalness: 0.05 }),
  sole: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.22, metalness: 0.85 }),
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
    this._build();
    this.setAppearance(appearance);
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

    for (const [leg, shin] of [[this.legL, this.shinL], [this.legR, this.shinR]]) {
      const thigh = part(G.thigh, m.pants, 0, -0.21, 0);
      leg.add(thigh);

      shin.position.set(0, -0.42, 0);
      const calf = part(G.shin, m.pants, 0, -0.2, 0);
      shin.add(calf);

      // Sculpted shoe + white rubber sole
      const shoeGroup = new THREE.Group();
      shoeGroup.position.set(0, -0.43, 0.045);
      const upper = part(G.shoeUpper, m.shoes, 0, 0.02, 0);
      upper.rotation.x = Math.PI / 2;
      upper.scale.set(1.02, 1, 0.76);
      const sole = part(G.shoeSole, SHARED_MAT.sole, 0, -0.025, 0.005);
      shoeGroup.add(upper, sole);
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

    const collar = part(G.collar, m.shirt, 0, 0.6, 0.01);
    collar.rotation.x = Math.PI / 2 + 0.12;
    this.torsoGroup.add(collar);

    for (const sx of [-1, 1]) {
      const sh = part(G.shoulder, m.shirt, sx * 0.255, 0.54, 0);
      sh.scale.set(1, 0.92, 0.88);
      this.torsoGroup.add(sh);
    }

    this.belt = part(G.belt, SHARED_MAT.dark, 0, 0.025, 0);
    this.belt.scale.set(1.06, 1, 0.74);
    const buckle = part(G.buckle, SHARED_MAT.chrome, 0, 0.025, 0.135);
    this.torsoGroup.add(this.belt, buckle);

    this.stripe = part(G.stripe, m.accent, 0, 0.42, 0);
    this.stripe.scale.set(1.09, 1, 0.74);
    this.torsoGroup.add(this.stripe);

    // Articulated 2-segment arms (shoulder -> upper arm -> elbow -> forearm -> hand)
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.foreArmL = new THREE.Group();
    this.foreArmR = new THREE.Group();
    for (const [arm, fore, side] of [[this.armL, this.foreArmL, -1], [this.armR, this.foreArmR, 1]]) {
      arm.position.set(side * 0.285, 0.55, 0);
      const upper = part(G.upperArm, m.shirt, 0, -0.15, 0);
      arm.add(upper);

      fore.position.set(0, -0.3, 0);
      const lower = part(G.foreArm, m.skin, 0, -0.14, 0);
      const hand = part(G.hand, m.skin, 0, -0.29, 0.01);
      hand.scale.set(0.88, 1.08, 0.68);
      fore.add(lower, hand);
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
    this.stripe.visible = !!uni;
    if (uni) {
      this.mats.accent.color.set(uni.accent);
      this.mats.hat.color.set(uni.hat);
    }
  }

  _buildHair() {
    this.hairGroup.clear();
    const hasHat = !!this.occupation;
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
    if (!this.occupation) return;
    const type = OCCUPATIONS[this.occupation].uniform.headgear;
    const hat = this.mats.hat;
    const add = (m) => this.hatGroup.add(m);
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
      this.legL.rotation.x = this.legR.rotation.x = -1.35;
      this.shinL.rotation.x = this.shinR.rotation.x = 1.18;
      this.armL.rotation.x = this.armR.rotation.x = -1.05;
      this.foreArmL.rotation.x = this.foreArmR.rotation.x = -0.45;
      body.position.y = 0;
      body.rotation.x = 0;
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

    // Movement cancels active emotes automatically
    if (speed > 0.25 && this.emote) this.clearEmote();

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
  }

  dispose() {
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
