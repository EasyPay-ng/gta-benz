// MetroVenture 3D — modular low-poly humanoid shared by the player, citizens and passengers.
import * as THREE from 'three';
import { BUILDS, OCCUPATIONS, DEFAULT_APPEARANCE } from './data.js';

// Shared geometries (re-used by every character to keep memory low)
const G = {
  leg: new THREE.BoxGeometry(0.17, 0.78, 0.19),
  shoe: new THREE.BoxGeometry(0.19, 0.1, 0.28),
  torso: new THREE.BoxGeometry(0.46, 0.62, 0.26),
  belt: new THREE.BoxGeometry(0.47, 0.07, 0.27),
  stripe: new THREE.BoxGeometry(0.47, 0.06, 0.27),
  arm: new THREE.BoxGeometry(0.13, 0.56, 0.14),
  hand: new THREE.BoxGeometry(0.12, 0.12, 0.12),
  neck: new THREE.BoxGeometry(0.12, 0.08, 0.12),
  head: new THREE.BoxGeometry(0.3, 0.32, 0.3),
  eye: new THREE.BoxGeometry(0.05, 0.05, 0.02),
  mouth: new THREE.BoxGeometry(0.1, 0.025, 0.02),
  hairShort: new THREE.BoxGeometry(0.32, 0.09, 0.32),
  hairBack: new THREE.BoxGeometry(0.32, 0.2, 0.06),
  hairLong: new THREE.BoxGeometry(0.33, 0.42, 0.08),
  afro: new THREE.SphereGeometry(0.24, 10, 8),
  buzz: new THREE.BoxGeometry(0.31, 0.04, 0.31),
  capTop: new THREE.CylinderGeometry(0.17, 0.17, 0.11, 12),
  capBrim: new THREE.BoxGeometry(0.28, 0.025, 0.16),
  peakTop: new THREE.CylinderGeometry(0.2, 0.17, 0.1, 12),
  peakBand: new THREE.CylinderGeometry(0.172, 0.172, 0.06, 12),
  badge: new THREE.BoxGeometry(0.06, 0.06, 0.02),
  hardhat: new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  hardBrim: new THREE.CylinderGeometry(0.24, 0.24, 0.025, 14),
  chefBase: new THREE.CylinderGeometry(0.16, 0.16, 0.14, 12),
  chefPuff: new THREE.SphereGeometry(0.2, 12, 8),
  visorBand: new THREE.CylinderGeometry(0.165, 0.165, 0.05, 14, 1, true),
  visorGlass: new THREE.BoxGeometry(0.3, 0.08, 0.04),
  beanie: new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  beanieFold: new THREE.CylinderGeometry(0.175, 0.175, 0.06, 12),
  flatTop: new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  parcel: new THREE.BoxGeometry(0.42, 0.3, 0.32),
};

const DARK = new THREE.MeshLambertMaterial({ color: 0x111111 });
const WHITE = new THREE.MeshLambertMaterial({ color: 0xffffff });
const PARCEL = new THREE.MeshLambertMaterial({ color: 0xb7884e });
const VISOR = new THREE.MeshPhongMaterial({ color: 0x22d3ee, emissive: 0x0e7490, transparent: true, opacity: 0.8, shininess: 80 });

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class Character {
  constructor(appearance) {
    this.group = new THREE.Group();
    this.mats = {
      skin: new THREE.MeshLambertMaterial(),
      shirt: new THREE.MeshLambertMaterial(),
      pants: new THREE.MeshLambertMaterial(),
      hair: new THREE.MeshLambertMaterial(),
      shoes: new THREE.MeshLambertMaterial({ color: 0x1c1917 }),
      hat: new THREE.MeshLambertMaterial(),
      accent: new THREE.MeshLambertMaterial(),
    };
    this.phase = Math.random() * 10;
    this.pose = 'stand'; // stand | sit | work | dive
    this.poseTimer = 0;
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

    // Legs (pivot at the hip)
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.12, 0.9, 0);
    this.legR.position.set(0.12, 0.9, 0);
    for (const leg of [this.legL, this.legR]) {
      leg.add(mesh(G.leg, m.pants, 0, -0.39, 0));
      leg.add(mesh(G.shoe, m.shoes, 0, -0.84, 0.04));
      body.add(leg);
    }

    // Torso
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0.9, 0);
    body.add(this.torsoGroup);
    this.torso = mesh(G.torso, m.shirt, 0, 0.31, 0);
    this.torsoGroup.add(this.torso);
    this.belt = mesh(G.belt, DARK, 0, 0.03, 0);
    this.torsoGroup.add(this.belt);
    this.stripe = mesh(G.stripe, m.accent, 0, 0.42, 0);
    this.torsoGroup.add(this.stripe);

    // Arms (pivot at the shoulder)
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]]) {
      arm.position.set(side * 0.31, 0.58, 0);
      arm.add(mesh(G.arm, m.shirt, 0, -0.26, 0));
      arm.add(mesh(G.hand, m.skin, 0, -0.58, 0));
      this.torsoGroup.add(arm);
    }

    // Head
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.62, 0);
    this.torsoGroup.add(this.headGroup);
    this.headGroup.add(mesh(G.neck, m.skin, 0, 0.04, 0));
    this.head = mesh(G.head, m.skin, 0, 0.24, 0);
    this.headGroup.add(this.head);
    this.headGroup.add(mesh(G.eye, DARK, -0.07, 0.27, 0.151));
    this.headGroup.add(mesh(G.eye, DARK, 0.07, 0.27, 0.151));
    this.headGroup.add(mesh(G.mouth, DARK, 0, 0.16, 0.151));

    this.hairGroup = new THREE.Group();
    this.headGroup.add(this.hairGroup);
    this.hatGroup = new THREE.Group();
    this.hatGroup.position.set(0, 0.4, 0);
    this.headGroup.add(this.hatGroup);

    // Carried parcel (courier)
    this.parcel = mesh(G.parcel, PARCEL, 0, 0.25, 0.3);
    this.parcel.visible = false;
    this.torsoGroup.add(this.parcel);
  }

  setAppearance(app) {
    // Defensive: saves from older/corrupted localStorage may miss fields
    // or contain nonsense values that would make THREE.Color.set() throw.
    const safe = { ...DEFAULT_APPEARANCE, ...(app || {}) };
    if (!BUILDS[safe.build]) safe.build = DEFAULT_APPEARANCE.build;
    if (!safe.skin || typeof safe.skin !== 'string') safe.skin = DEFAULT_APPEARANCE.skin;
    if (!safe.hair || typeof safe.hair !== 'string') safe.hair = DEFAULT_APPEARANCE.hair;
    if (!safe.shirt || typeof safe.shirt !== 'string') safe.shirt = DEFAULT_APPEARANCE.shirt;
    if (!safe.pants || typeof safe.pants !== 'string') safe.pants = DEFAULT_APPEARANCE.pants;
    if (!safe.hairStyle || typeof safe.hairStyle !== 'string') safe.hairStyle = DEFAULT_APPEARANCE.hairStyle;
    this.appearance = { ...safe };
    const b = BUILDS[safe.build] || BUILDS.Balanced;
    this.body.scale.set(b.w, b.h, b.w > 1 ? 1.1 : 1);
    this.headGroup.scale.set(1 / b.w, 1 / b.h, b.w > 1 ? 1 / 1.1 : 1); // keep head proportional
    try { this.mats.skin.color.set(safe.skin); } catch {}
    try { this.mats.hair.color.set(safe.hair); } catch {}
    this._applyClothes();
    this._buildHair();
  }

  // occId = null for casual clothes
  setOccupation(occId) {
    this.occupation = occId && OCCUPATIONS[occId] ? occId : null;
    this._applyClothes();
    this._buildHair();
    this._buildHat();
  }

  _applyClothes() {
    const app = this.appearance || DEFAULT_APPEARANCE;
    const uni = this.occupation ? OCCUPATIONS[this.occupation].uniform : null;
    try { this.mats.shirt.color.set(uni ? uni.shirt : (app.shirt || DEFAULT_APPEARANCE.shirt)); } catch {}
    try { this.mats.pants.color.set(uni ? uni.pants : (app.pants || DEFAULT_APPEARANCE.pants)); } catch {}
    this.stripe.visible = !!uni;
    if (uni) {
      try { this.mats.accent.color.set(uni.accent); } catch {}
      try { this.mats.hat.color.set(uni.hat); } catch {}
    }
  }

  _buildHair() {
    this.hairGroup.clear();
    const hasHat = !!this.occupation;
    let style = this.appearance.hairStyle;
    if (hasHat && (style === 'afro' || style === 'long')) style = 'short';
    const h = this.mats.hair;
    if (style === 'short') {
      this.hairGroup.add(mesh(G.hairShort, h, 0, 0.42, 0));
      this.hairGroup.add(mesh(G.hairBack, h, 0, 0.32, -0.14));
    } else if (style === 'buzz') {
      this.hairGroup.add(mesh(G.buzz, h, 0, 0.41, 0));
    } else if (style === 'afro') {
      const a = mesh(G.afro, h, 0, 0.42, -0.03);
      a.scale.set(1, 0.85, 1);
      this.hairGroup.add(a);
    } else if (style === 'long') {
      this.hairGroup.add(mesh(G.hairShort, h, 0, 0.42, 0));
      this.hairGroup.add(mesh(G.hairLong, h, 0, 0.22, -0.14));
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
        add(mesh(G.capTop, hat, 0, 0.04, 0));
        add(mesh(G.capBrim, hat, 0, -0.01, 0.2));
        break;
      case 'peaked':
        add(mesh(G.peakTop, hat, 0, 0.07, 0));
        add(mesh(G.peakBand, DARK, 0, 0.0, 0));
        add(mesh(G.capBrim, DARK, 0, -0.02, 0.19));
        add(mesh(G.badge, this.mats.accent, 0, 0.04, 0.18));
        break;
      case 'hardhat':
        add(mesh(G.hardhat, hat, 0, -0.03, 0));
        add(mesh(G.hardBrim, hat, 0, -0.03, 0.02));
        break;
      case 'chefhat':
        add(mesh(G.chefBase, WHITE, 0, 0.04, 0));
        add(mesh(G.chefPuff, WHITE, 0, 0.22, 0));
        break;
      case 'visor': {
        add(mesh(G.visorBand, hat, 0, -0.1, 0));
        const g = mesh(G.visorGlass, VISOR, 0, -0.13, 0.16);
        add(g);
        break;
      }
      case 'beanie':
        add(mesh(G.beanie, hat, 0, -0.04, 0));
        add(mesh(G.beanieFold, hat, 0, -0.05, 0));
        break;
      case 'flatcap': {
        const t = mesh(G.flatTop, hat, 0, -0.04, 0.01);
        t.scale.set(1, 0.55, 1.1);
        add(t);
        add(mesh(G.capBrim, hat, 0, -0.03, 0.18));
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
  }

  // speed in m/s (0 = idle)
  animate(dt, speed) {
    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
      if (this.poseTimer <= 0 && this.pose === 'dive') this.pose = 'stand';
    }
    const body = this.body;
    if (this.pose === 'sit') {
      this.legL.rotation.x = this.legR.rotation.x = -1.45;
      this.armL.rotation.x = this.armR.rotation.x = -1.1;
      this.armL.rotation.z = this.armR.rotation.z = 0;
      body.position.y = 0;
      body.rotation.x = 0;
      return;
    }
    if (this.pose === 'dive') {
      body.rotation.x = Math.min(body.rotation.x + dt * 6, 1.2);
      body.position.y = 0.3;
      this.armL.rotation.x = this.armR.rotation.x = -2.8;
      return;
    }
    body.rotation.x *= 0.8;
    body.position.y = 0;

    if (speed > 0.15) {
      this.phase += dt * (3 + speed * 1.6);
      const amp = Math.min(0.25 + speed * 0.09, 0.85);
      const s = Math.sin(this.phase);
      this.legL.rotation.x = s * amp;
      this.legR.rotation.x = -s * amp;
      if (this.carrying) {
        this.armL.rotation.x = this.armR.rotation.x = -1.2;
      } else {
        this.armL.rotation.x = -s * amp * 0.9;
        this.armR.rotation.x = s * amp * 0.9;
      }
      this.armL.rotation.z = 0.05;
      this.armR.rotation.z = -0.05;
      body.position.y = Math.abs(Math.cos(this.phase)) * 0.05 * Math.min(speed / 4, 1);
    } else {
      this.phase += dt * 2;
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
      if (this.pose === 'work') {
        // hammering / typing motion
        this.armR.rotation.x = -1.0 + Math.sin(this.phase * 3) * 0.5;
        this.armL.rotation.x = -0.6 + Math.cos(this.phase * 3) * 0.2;
      } else if (this.carrying) {
        this.armL.rotation.x = this.armR.rotation.x = -1.2;
      } else {
        this.armL.rotation.x = Math.sin(this.phase) * 0.04;
        this.armR.rotation.x = -Math.sin(this.phase) * 0.04;
      }
      this.armL.rotation.z = 0.08;
      this.armR.rotation.z = -0.08;
      this.torsoGroup.scale.y = 1 + Math.sin(this.phase) * 0.008;
    }
  }

  dispose() {
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
