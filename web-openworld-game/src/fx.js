// MetroVenture 3D — Street FX: persistent twin tyre skid marks, collision sparks,
// ground scorch decals, fireball explosions, flickering wreck flames & smoke plumes.
import * as THREE from 'three';
import { SKID_POOL_SIZE, SPARK_POOL_SIZE, SCORCH_POOL_SIZE } from './data.js';
import { getFXTextures } from './textures.js';

const DUMMY = new THREE.Object3D();
const UP = new THREE.Vector3(0, 1, 0);
const TMP_V = new THREE.Vector3();

/** Build a soft-sprite wreck fire + billowing smoke rig for any vehicle. */
export function createWreckFireRig() {
  const tex = getFXTextures();
  const group = new THREE.Group();
  group.visible = false;

  const fireMat = new THREE.SpriteMaterial({
    map: tex.fire,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const smokeMat = new THREE.SpriteMaterial({
    map: tex.smoke,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  const flames = [];
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Sprite(fireMat);
    sp.userData = {
      phase: (i / 5) * Math.PI * 2,
      ox: (i % 2 ? 1 : -1) * (0.14 + (i % 3) * 0.12),
      oz: (i - 2) * 0.22,
    };
    group.add(sp);
    flames.push(sp);
  }

  const plumes = [];
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Sprite(smokeMat);
    sp.userData = {
      phase: i / 9,
      ox: ((i % 3) - 1) * 0.22,
      oz: ((i % 2) - 0.5) * 0.35,
    };
    group.add(sp);
    plumes.push(sp);
  }

  const fireLight = new THREE.PointLight(0xff7b1a, 0, 18, 1.7);
  fireLight.position.set(0, 1.35, 0.6);
  group.add(fireLight);

  return {
    group,
    flames,
    plumes,
    fireLight,
    fireMat,
    smokeMat,
    t: Math.random() * 5,
    update(dt, hoodY, hoodZ, nearPlayer = true) {
      if (!group.visible) {
        fireLight.intensity = 0;
        return;
      }
      this.t += dt;
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const flicker = Math.sin(this.t * 14 + f.userData.phase) * 0.5 + 0.5;
        const s = 0.85 + flicker * 0.55;
        f.scale.set(s, s * (1.1 + flicker * 0.35), 1);
        f.position.set(
          f.userData.ox + Math.sin(this.t * 7 + i) * 0.06,
          hoodY + 0.28 + flicker * 0.26,
          hoodZ + f.userData.oz,
        );
      }
      for (let i = 0; i < plumes.length; i++) {
        const p = plumes[i];
        const age = (this.t * 0.42 + p.userData.phase) % 1;
        const s = 0.65 + age * 2.65;
        p.scale.set(s, s, 1);
        p.position.set(
          p.userData.ox + Math.sin(this.t * 1.4 + i) * age * 0.7,
          hoodY + 0.55 + age * 5.4,
          hoodZ + p.userData.oz - age * 0.9,
        );
      }
      fireLight.visible = nearPlayer;
      fireLight.intensity = nearPlayer ? 2.6 + Math.sin(this.t * 19) * 0.75 : 0;
    },
    dispose() {
      fireMat.dispose();
      smokeMat.dispose();
    },
  };
}

/** Build a soft-sprite tailpipe smoke rig (for engine < 20% fault). */
export function createTailpipeSmokeRig() {
  const tex = getFXTextures();
  const group = new THREE.Group();
  group.visible = false;
  const mat = new THREE.SpriteMaterial({
    map: tex.smoke,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const puffs = [];
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Sprite(mat);
    sp.userData = { phase: i / 5 };
    group.add(sp);
    puffs.push(sp);
  }
  return {
    group,
    t: 0,
    update(dt, xOff, yBase, zTail) {
      if (!group.visible) return;
      this.t += dt;
      for (const p of puffs) {
        const a = (this.t * 0.9 + p.userData.phase) % 1;
        const s = 0.25 + a * 0.85;
        p.scale.set(s, s, 1);
        p.position.set(xOff + Math.sin(this.t * 4 + a * 6) * 0.08, yBase + a * 0.95, zTail - a * 1.5);
      }
    },
    dispose() { mat.dispose(); },
  };
}

export class StreetFX {
  constructor(scene) {
    this.scene = scene;
    const tex = getFXTextures();

    // 1. Ring-buffered Twin Tyre Skid Marks (InstancedMesh, 0 GC per frame)
    const skidGeo = new THREE.PlaneGeometry(0.28, 1.0);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      map: tex.skid,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, SKID_POOL_SIZE);
    this.skidMesh.frustumCulled = false;
    this.skidCursor = 0;
    this.skidCount = 0;
    DUMMY.scale.set(0, 0, 0);
    DUMMY.updateMatrix();
    for (let i = 0; i < SKID_POOL_SIZE; i++) this.skidMesh.setMatrixAt(i, DUMMY.matrix);
    scene.add(this.skidMesh);

    // 2. Scorch ground decals under explosions
    const scorchGeo = new THREE.PlaneGeometry(5.6, 5.6);
    scorchGeo.rotateX(-Math.PI / 2);
    const scorchMat = new THREE.MeshBasicMaterial({
      map: tex.scorch,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.scorchMesh = new THREE.InstancedMesh(scorchGeo, scorchMat, SCORCH_POOL_SIZE);
    this.scorchMesh.frustumCulled = false;
    this.scorchCursor = 0;
    for (let i = 0; i < SCORCH_POOL_SIZE; i++) this.scorchMesh.setMatrixAt(i, DUMMY.matrix);
    scene.add(this.scorchMesh);

    // 3. Collision Sparks (elongated additive streaks oriented along velocity)
    const sparkGeo = new THREE.BoxGeometry(0.045, 0.045, 0.42);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffb703,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_POOL_SIZE);
    this.sparkMesh.frustumCulled = false;
    this.sparks = Array.from({ length: SPARK_POOL_SIZE }, () => ({
      life: 0, maxLife: 0.5, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    }));
    this.sparkCursor = 0;
    for (let i = 0; i < SPARK_POOL_SIZE; i++) this.sparkMesh.setMatrixAt(i, DUMMY.matrix);
    scene.add(this.sparkMesh);

    // 4. Tyre drift smoke & explosion fireball pool
    this.driftPuffs = [];
    this.driftMat = new THREE.SpriteMaterial({
      map: tex.smoke,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      color: 0xd4d4d8,
    });
    for (let i = 0; i < 24; i++) {
      const sp = new THREE.Sprite(this.driftMat);
      sp.visible = false;
      scene.add(sp);
      this.driftPuffs.push({ sp, life: 0, maxLife: 0.7, vx: 0, vy: 0, vz: 0 });
    }
    this.driftCursor = 0;
    this.driftEmitTimer = 0;

    // 5. Active fireball explosions (short-lived dramatic bursts)
    this.explosions = [];
    this.fireTex = tex.fire;
    this.blastLight = new THREE.PointLight(0xff8c1a, 0, 42, 1.4);
    this.blastLight.visible = false;
    scene.add(this.blastLight);
    this.blastTimer = 0;
  }

  /** Stamp a single tyre rubber segment on the asphalt at `(x, z)` heading `yaw`. */
  _addSkid(x, y, z, yaw, len = 0.85, widthScale = 1) {
    DUMMY.position.set(x, y + 0.036, z);
    DUMMY.rotation.set(0, yaw, 0);
    DUMMY.scale.set(widthScale, 1, Math.max(0.45, Math.min(2.2, len)));
    DUMMY.updateMatrix();
    this.skidMesh.setMatrixAt(this.skidCursor, DUMMY.matrix);
    this.skidCursor = (this.skidCursor + 1) % SKID_POOL_SIZE;
    this.skidCount = Math.min(SKID_POOL_SIZE, this.skidCount + 1);
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Track a vehicle's rear tyres and automatically lay twin skid marks + tyre smoke
   * whenever drifting, handbraking at speed, or sliding laterally.
   */
  trackVehicleSkids(veh, dt, groundY = 0) {
    if (!veh || veh.cond?.hp <= 0) return false;
    const speed = Math.abs(veh.speed);
    const f = veh.forward;
    // Lateral velocity perpendicular to car heading
    const latSpeed = Math.abs((veh.vx || 0) * f.z - (veh.vz || 0) * f.x);
    const skidding = (veh.drifting && speed > 4.5)
      || (veh.braking && speed > 8.5)
      || (latSpeed > 2.7 && speed > 5.5);

    if (!skidding) {
      veh._lastSkid = null;
      return false;
    }

    const rearZ = -(veh.model.len * 0.34);
    const halfTrack = veh.model.wid * 0.41;
    const rx = f.z; const rz = -f.x;
    const bx = veh.x + f.x * rearZ;
    const bz = veh.z + f.z * rearZ;
    const lx = bx + rx * halfTrack; const lz = bz + rz * halfTrack;
    const rrx = bx - rx * halfTrack; const rrz = bz - rz * halfTrack;

    if (veh._lastSkid) {
      const dist = Math.hypot(bx - veh._lastSkid.x, bz - veh._lastSkid.z);
      if (dist >= 0.48) {
        const segYaw = Math.atan2(bx - veh._lastSkid.x, bz - veh._lastSkid.z);
        this._addSkid((lx + veh._lastSkid.lx) * 0.5, groundY, (lz + veh._lastSkid.lz) * 0.5, segYaw, dist * 1.18, 1.05);
        this._addSkid((rrx + veh._lastSkid.rx) * 0.5, groundY, (rrz + veh._lastSkid.rz) * 0.5, segYaw, dist * 1.18, 1.05);
        veh._lastSkid = { x: bx, z: bz, lx, lz, rx: rrx, rz: rrz };
      }
    } else {
      veh._lastSkid = { x: bx, z: bz, lx, lz, rx: rrx, rz: rrz };
    }

    this.driftEmitTimer -= dt;
    if (this.driftEmitTimer <= 0) {
      this.driftEmitTimer = 0.055;
      this._spawnDriftPuff(lx, groundY + 0.18, lz);
      this._spawnDriftPuff(rrx, groundY + 0.18, rrz);
    }
    return true;
  }

  _spawnDriftPuff(x, y, z) {
    const p = this.driftPuffs[this.driftCursor];
    this.driftCursor = (this.driftCursor + 1) % this.driftPuffs.length;
    p.life = p.maxLife = 0.55 + Math.random() * 0.25;
    p.sp.position.set(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2);
    p.sp.scale.set(0.35, 0.35, 1);
    p.sp.visible = true;
    p.vx = (Math.random() - 0.5) * 0.9;
    p.vy = 0.7 + Math.random() * 0.6;
    p.vz = (Math.random() - 0.5) * 0.9;
  }

  /** Burst bright orange collision sparks at `(x, y, z)`. */
  spawnSparks(x, y, z, count = 14, power = 1) {
    const n = Math.min(SPARK_POOL_SIZE, Math.round(count));
    for (let i = 0; i < n; i++) {
      const s = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_POOL_SIZE;
      const ang = Math.random() * Math.PI * 2;
      const spd = (3.5 + Math.random() * 9.5) * power;
      s.x = x + (Math.random() - 0.5) * 0.5;
      s.y = y + Math.random() * 0.35;
      s.z = z + (Math.random() - 0.5) * 0.5;
      s.vx = Math.cos(ang) * spd;
      s.vy = 2.2 + Math.random() * 5.8 * power;
      s.vz = Math.sin(ang) * spd;
      s.maxLife = 0.28 + Math.random() * 0.38;
      s.life = s.maxLife;
    }
  }

  /** Trigger a dramatic fireball explosion + shockwave ring + asphalt scorch mark! */
  spawnExplosion(x, y, z) {
    // Ground scorch decal
    DUMMY.position.set(x, y + 0.034, z);
    DUMMY.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const sc = 0.85 + Math.random() * 0.45;
    DUMMY.scale.set(sc, 1, sc);
    DUMMY.updateMatrix();
    this.scorchMesh.setMatrixAt(this.scorchCursor, DUMMY.matrix);
    this.scorchCursor = (this.scorchCursor + 1) % SCORCH_POOL_SIZE;
    this.scorchMesh.instanceMatrix.needsUpdate = true;

    // Heavy spark shower
    this.spawnSparks(x, y + 0.7, z, 36, 1.55);

    // Expanding fireball + shockwave ring
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const coreMat = new THREE.SpriteMaterial({
      map: this.fireTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const blobs = [];
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(coreMat);
      sp.position.set((Math.random() - 0.5) * 1.4, 0.6 + Math.random() * 1.1, (Math.random() - 0.5) * 1.4);
      group.add(sp);
      blobs.push({
        sp,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 2.2 + Math.random() * 3.8,
        vz: (Math.random() - 0.5) * 3.2,
        base: 1.6 + Math.random() * 1.4,
      });
    }
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfb923c,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.25, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;
    group.add(ring);
    this.scene.add(group);
    this.explosions.push({ group, coreMat, ring, ringMat, blobs, age: 0, dur: 1.15 });

    // Intense flash light
    this.blastLight.position.set(x, y + 2.4, z);
    this.blastLight.visible = true;
    this.blastLight.intensity = 16;
    this.blastTimer = 0.55;
  }

  update(dt) {
    // Update sparks
    let anySparkDirty = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      const s = this.sparks[i];
      if (s.life <= 0) continue;
      anySparkDirty = true;
      s.life -= dt;
      if (s.life <= 0) {
        DUMMY.scale.set(0, 0, 0);
        DUMMY.updateMatrix();
        this.sparkMesh.setMatrixAt(i, DUMMY.matrix);
        continue;
      }
      s.vy -= 14.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.05) {
        s.y = 0.05;
        s.vy = Math.abs(s.vy) * 0.42;
        s.vx *= 0.78;
        s.vz *= 0.78;
      }
      DUMMY.position.set(s.x, s.y, s.z);
      TMP_V.set(s.x + s.vx, s.y + s.vy, s.z + s.vz);
      DUMMY.up.copy(UP);
      DUMMY.lookAt(TMP_V);
      const frac = s.life / s.maxLife;
      DUMMY.scale.set(frac, frac, 0.6 + frac * 1.4);
      DUMMY.updateMatrix();
      this.sparkMesh.setMatrixAt(i, DUMMY.matrix);
    }
    if (anySparkDirty) this.sparkMesh.instanceMatrix.needsUpdate = true;

    // Update tyre drift smoke puffs
    for (const p of this.driftPuffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; continue; }
      const t = 1 - p.life / p.maxLife;
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      const sc = 0.4 + t * 1.35;
      p.sp.scale.set(sc, sc, 1);
    }

    // Update fireball explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += dt;
      const t = ex.age / ex.dur;
      if (t >= 1) {
        this.scene.remove(ex.group);
        ex.ring.geometry.dispose();
        ex.coreMat.dispose();
        ex.ringMat.dispose();
        this.explosions.splice(i, 1);
        continue;
      }
      ex.coreMat.opacity = Math.max(0, 1 - t ** 1.3);
      for (const b of ex.blobs) {
        b.sp.position.x += b.vx * dt;
        b.sp.position.y += b.vy * dt;
        b.sp.position.z += b.vz * dt;
        const s = b.base * (0.65 + t * 2.1);
        b.sp.scale.set(s, s, 1);
      }
      const rs = 1 + t * 11;
      ex.ring.scale.set(rs, rs, 1);
      ex.ringMat.opacity = Math.max(0, (1 - t) ** 1.8 * 0.9);
    }

    if (this.blastTimer > 0) {
      this.blastTimer = Math.max(0, this.blastTimer - dt);
      this.blastLight.intensity = (this.blastTimer / 0.55) ** 2 * 16;
      if (this.blastTimer <= 0) this.blastLight.visible = false;
    }
  }
}
