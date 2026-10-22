// MetroVenture 3D — drivable vehicles + AI street traffic.
import * as THREE from 'three';
import { VEHICLE_MODELS, ROAD_LINES, LANE_OFFSET, WORLD_LIMIT, CAR_COLORS } from './data.js';
import { resolveCircle, makeTextTexture } from './world.js';
import { applyDrive, speedFactor, gripFactor, freshCond } from './vehicleCond.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL_GEO = new THREE.CylinderGeometry(1, 1, 1, 14);
const HUB_GEO = new THREE.CylinderGeometry(0.55, 0.55, 1.02, 8);
const MAT = {
  glass: new THREE.MeshPhongMaterial({ color: 0x1e293b, transparent: true, opacity: 0.55, shininess: 120, specular: 0x8899aa }),
  tyre: new THREE.MeshLambertMaterial({ color: 0x18181b }),
  hub: new THREE.MeshLambertMaterial({ color: 0xa1a1aa }),
  trim: new THREE.MeshLambertMaterial({ color: 0x27272a }),
  head: new THREE.MeshBasicMaterial({ color: 0xfffbeb }),
  plate: new THREE.MeshLambertMaterial({ color: 0xf8fafc }),
  checker: new THREE.MeshLambertMaterial({ color: 0x111827 }),
};
let taxiSignTex = null;

function part(parent, mat, x, y, z, w, h, d) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Build a low-poly car. The car faces +Z; the driver sits on the left (+X) side.
export function buildCarMesh(modelId, color) {
  const m = VEHICLE_MODELS[modelId];
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const paint = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x7f1d1d });
  const L = m.len; const W = m.wid;
  const bodyY = m.wheelR + m.bodyH / 2 - 0.05;
  const bodyTop = bodyY + m.bodyH / 2;
  const cabinTop = bodyTop + m.cabinH;

  // lower body + bumpers
  part(body, paint, 0, bodyY, 0, W, m.bodyH, L);
  part(body, MAT.trim, 0, bodyY - m.bodyH / 2 + 0.12, L / 2 + 0.04, W * 0.98, 0.22, 0.12);
  part(body, MAT.trim, 0, bodyY - m.bodyH / 2 + 0.12, -L / 2 - 0.04, W * 0.98, 0.22, 0.12);
  part(body, MAT.plate, 0, bodyY - 0.05, -L / 2 - 0.08, 0.5, 0.14, 0.03);

  if (m.style === 'van') {
    // tall box body with windscreen
    part(body, paint, 0, bodyTop + m.cabinH / 2, m.cabinZ - 0.15, W * 0.98, m.cabinH, m.cabinLen - 0.3);
    part(body, MAT.glass, 0, bodyTop + m.cabinH * 0.55, m.cabinZ + m.cabinLen / 2 - 0.2, W * 0.9, m.cabinH * 0.6, 0.12);
    part(body, MAT.glass, W * 0.495, bodyTop + m.cabinH * 0.6, m.cabinZ + m.cabinLen / 2 - 0.8, 0.04, m.cabinH * 0.5, 0.9);
    part(body, MAT.glass, -W * 0.495, bodyTop + m.cabinH * 0.6, m.cabinZ + m.cabinLen / 2 - 0.8, 0.04, m.cabinH * 0.5, 0.9);
    part(body, MAT.checker, W * 0.5, bodyTop + m.cabinH * 0.3, m.cabinZ - 0.6, 0.03, 0.18, m.cabinLen * 0.6);
    part(body, MAT.checker, -W * 0.5, bodyTop + m.cabinH * 0.3, m.cabinZ - 0.6, 0.03, 0.18, m.cabinLen * 0.6);
  } else {
    const cabW = m.style === 'sports' ? W * 0.82 : W * 0.9;
    part(body, MAT.glass, 0, bodyTop + m.cabinH / 2 - 0.02, m.cabinZ, cabW, m.cabinH, m.cabinLen);
    part(body, paint, 0, cabinTop - 0.03, m.cabinZ, cabW + 0.02, 0.07, m.cabinLen * 0.86);
    // pillars
    for (const sx of [-1, 1]) {
      part(body, paint, sx * cabW / 2, bodyTop + m.cabinH / 2, m.cabinZ + m.cabinLen / 2 - 0.08, 0.06, m.cabinH, 0.1);
      part(body, paint, sx * cabW / 2, bodyTop + m.cabinH / 2, m.cabinZ - m.cabinLen / 2 + 0.08, 0.06, m.cabinH, 0.1);
    }
  }
  if (m.style === 'pickup') {
    const bedLen = L / 2 - (m.cabinZ - m.cabinLen / 2) - 0.1;
    const bedZ = -L / 2 + bedLen / 2 + 0.05;
    part(body, paint, W / 2 - 0.05, bodyTop + 0.22, bedZ, 0.1, 0.44, bedLen);
    part(body, paint, -W / 2 + 0.05, bodyTop + 0.22, bedZ, 0.1, 0.44, bedLen);
    part(body, paint, 0, bodyTop + 0.22, -L / 2 + 0.05, W, 0.44, 0.1);
    part(body, MAT.trim, 0, bodyTop + 0.01, bedZ, W - 0.2, 0.02, bedLen - 0.1);
  }
  if (m.style === 'sports') {
    part(body, MAT.trim, 0, bodyTop + 0.32, -L / 2 + 0.25, W * 0.9, 0.06, 0.35);
    part(body, MAT.trim, W * 0.35, bodyTop + 0.16, -L / 2 + 0.25, 0.06, 0.3, 0.1);
    part(body, MAT.trim, -W * 0.35, bodyTop + 0.16, -L / 2 + 0.25, 0.06, 0.3, 0.1);
    part(body, MAT.checker, 0, bodyTop + 0.005, 0.6, 0.35, 0.01, L * 0.5);
  }
  if (m.style === 'taxi') {
    if (!taxiSignTex) taxiSignTex = makeTextTexture('TAXI', { width: 128, height: 48, bg: '#fde047', fg: '#111827', font: 'bold 34px system-ui, sans-serif' });
    const signMat = new THREE.MeshBasicMaterial({ map: taxiSignTex });
    part(body, signMat, 0, cabinTop + 0.13, m.cabinZ, 0.7, 0.22, 0.32);
    part(body, MAT.checker, W / 2 + 0.005, bodyY + 0.05, 0, 0.02, 0.12, L * 0.8);
    part(body, MAT.checker, -W / 2 - 0.005, bodyY + 0.05, 0, 0.02, 0.12, L * 0.8);
  }

  // lights
  for (const sx of [-1, 1]) {
    part(body, MAT.head, sx * W * 0.34, bodyY + 0.08, L / 2 + 0.005, W * 0.2, 0.13, 0.04);
    part(body, brakeMat, sx * W * 0.36, bodyY + 0.1, -L / 2 - 0.005, W * 0.18, 0.13, 0.04);
  }

  // wheels
  const wheels = [];
  const frontPivots = [];
  const wz = L / 2 - m.wheelR - 0.35;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (W / 2 - 0.12), m.wheelR, sz * wz);
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(WHEEL_GEO, MAT.tyre);
    tyre.scale.set(m.wheelR, 0.26, m.wheelR);
    tyre.castShadow = true;
    const hub = new THREE.Mesh(HUB_GEO, MAT.hub);
    hub.scale.set(m.wheelR, 0.26, m.wheelR);
    wheel.add(tyre, hub);
    wheel.rotation.z = Math.PI / 2;
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (sz === 1) frontPivots.push(pivot);
  }

  const roofInner = (m.style === 'van' ? bodyTop + m.cabinH : cabinTop) - 0.08;
  const seatScale = 0.82;
  const hipY = Math.min(bodyTop - 0.05, roofInner - 1.02 * seatScale);
  const seatZ = m.style === 'pickup' ? m.cabinZ - 0.1 : m.style === 'van' ? m.cabinZ + m.cabinLen / 2 - 1.2 : m.cabinZ - 0.05;
  return {
    group, body, wheels, frontPivots, brakeMat, paint,
    seat: new THREE.Vector3(W * 0.22, hipY - 0.9 * seatScale, seatZ),
    passengerSeat: new THREE.Vector3(-W * 0.22, hipY - 0.9 * seatScale, seatZ),
    seatScale,
  };
}

// ---------------------------------------------------------------------------
// Player-drivable vehicle
// ---------------------------------------------------------------------------
export class Vehicle {
  constructor(scene, data) {
    this.data = data;              // persisted record {id, model, color, x, z, yaw, cond, wrecked}
    this.model = VEHICLE_MODELS[data.model];
    this.parts = buildCarMesh(data.model, data.color);
    this.mesh = this.parts.group;
    scene.add(this.mesh);
    this.scene = scene;
    this.x = data.x; this.z = data.z; this.yaw = data.yaw;
    this.speed = 0; this.vx = 0; this.vz = 0;
    this.steer = 0; this.spin = 0;
    this.braking = false;
    this.radius = this.model.wid / 2 + 0.05;
    this.halfSpan = Math.max(0, this.model.len / 2 - this.radius);
    this.y = 0;
    // condition (feature 4) — same object as data.cond so repairs/repairs persist
    if (!data.cond) data.cond = freshCond();
    this.cond = data.cond;
    this.stallNotified = false;
    this.lowFuelNotified = false;
    this.hoodY = this.model.wheelR + this.model.bodyH + 0.15;
    this.smokeT = 0;
    this.smokeMat = new THREE.MeshBasicMaterial({ color: 0x6b7280, transparent: true, opacity: 0.35, depthWrite: false });
    this.smoke = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(BOX, this.smokeMat);
      puff.scale.set(0.22, 0.22, 0.22);
      puff.userData = {
        phase: (i / 6) * 1.4,
        ox: (i % 2 ? 1 : -1) * this.model.wid * 0.25,
        oz: this.model.len * 0.28 + (i / 5 - 0.5) * 0.9,
      };
      this.smoke.add(puff);
    }
    this.smoke.visible = data.wrecked === true;
    if (data.wrecked === true) this.parts.paint.color.multiplyScalar(0.55); // re-scorch on load
    this.mesh.add(this.smoke);
    this.syncMesh(0);
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

  // input: {throttle: -1..1, steer: -1..1 (right +), handbrake: bool}
  // returns impact speed (m/s) of any collision this frame
  update(dt, input, colliders, otherCircles) {
    const m = this.model;
    // Wrecked cars are static props: no power, no response to input.
    if (this.cond.hp <= 0) {
      this.speed = 0; this.vx = 0; this.vz = 0; this.braking = false;
      return 0;
    }
    const stalled = this.cond.fuel <= 0; // no fuel: can only coast and brake
    const maxSpeed = m.maxSpeed * speedFactor(this.cond.engine); // worn engine = limp home
    const f = this.forward;
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
    const grip = input.handbrake ? 1.4 : m.grip * gripFactor(this.cond.tires); // worn tyres = slidey
    const k = Math.min(1, grip * dt);
    this.vx += (nf.x * speed - this.vx) * k;
    this.vz += (nf.z * speed - this.vz) * k;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.speed = speed;
    this.drifting = input.handbrake && Math.abs(speed) > 6;
    // fuel + wear, distance-based (no idle consumption)
    const dist = Math.abs(this.speed) * dt;
    if (dist > 1e-4) {
      const speedFrac = Math.min(1, Math.abs(this.speed) / Math.max(1, m.maxSpeed));
      applyDrive(this.cond, this.data.model, dist / 1000, Math.abs(this.speed), speedFrac);
    }
    void f;
    return this.collide(colliders, otherCircles);
  }

  collide(colliders, otherCircles = []) {
    let hit = false; let nx = 0; let nz = 0;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.circles()) {
        const res = resolveCircle(c.x, c.z, c.r, colliders);
        if (res.hit) {
          this.x += res.x - c.x; this.z += res.z - c.z;
          nx += res.nx; nz += res.nz; hit = true;
        }
        for (const o of otherCircles) {
          const dx = c.x - o.x; const dz = c.z - o.z;
          const d = Math.hypot(dx, dz); const min = c.r + o.r;
          if (d < min && d > 1e-4) {
            const push = min - d;
            this.x += (dx / d) * push; this.z += (dz / d) * push;
            nx += dx / d; nz += dz / d; hit = true;
          }
        }
      }
    }
    // world limits
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

  syncMesh(groundY, dt = 0) {
    this.y += (groundY - this.y) * Math.min(1, dt * 10 || 1);
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
    this.spin += (this.speed * dt) / this.model.wheelR;
    for (const w of this.parts.wheels) w.rotation.x = this.spin;
    for (const p of this.parts.frontPivots) p.rotation.y = -this.steer;
    // body roll when cornering
    this.parts.body.rotation.z = THREE.MathUtils.clamp(this.steer * this.speed * 0.006, -0.06, 0.06);
    this.parts.brakeMat.color.setHex(this.braking ? 0xff2222 : 0x7f1d1d);
    // wreck smoke
    if (this.smoke.visible) {
      this.smokeT += dt;
      for (const puff of this.smoke.children) {
        const t = ((this.smokeT + puff.userData.phase) % 1.4) / 1.4;
        puff.position.set(puff.userData.ox, this.hoodY + 0.2 + t * 1.7, puff.userData.oz);
        const s = 0.22 + t * 0.55;
        puff.scale.set(s, s, s);
      }
    }
    this.data.x = this.x; this.data.z = this.z; this.data.yaw = this.yaw;
  }

  teleport(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.speed = 0; this.vx = 0; this.vz = 0; this.steer = 0;
    this.syncMesh(this.y);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.parts.paint.dispose();
    this.smokeMat.dispose();
  }
}

// ---------------------------------------------------------------------------
// AI traffic
// ---------------------------------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N = ROAD_LINES.length;

function lanePoint(i, j, d, along) {
  // point `along` metres from intersection (i,j) travelling in direction d, in the right-hand lane
  const px = ROAD_LINES[i]; const pz = ROAD_LINES[j];
  const rx = -d[1]; const rz = d[0]; // right of heading (dx,dz) is (-dz, dx)
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
    // add a seated driver silhouette
    const driver = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: 0x3b2412 }));
    driver.scale.set(0.3, 0.32, 0.3);
    driver.position.set(this.parts.seat.x, this.parts.seat.y + 1.55 * this.parts.seatScale + 0.15, this.parts.seat.z);
    this.mesh.add(driver);
    this.radius = this.model.wid / 2 + 0.05;
    this.halfSpan = Math.max(0, this.model.len / 2 - this.radius);
    this.cruise = 8 + rand() * 4;
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
    this.node = [i + d[0], j + d[1]]; // destination intersection
    this.dir = d;
    const along = 9 + r() * 50;
    const p = lanePoint(i, j, d, along);
    this.x = p.x; this.z = p.z;
    this.yaw = Math.atan2(d[0], d[1]);
    this._setExitTarget();
  }

  _valid(i, j) { return i >= 0 && j >= 0 && i < N && j < N; }

  _setExitTarget() {
    // exit point of current segment = 9 m before the destination node, in our lane
    const d = this.dir;
    const p = lanePoint(this.node[0], this.node[1], d, -9);
    this.target = p;
    this.phase = 'exit';
  }

  _chooseNext() {
    const d = this.dir;
    const options = DIRS.filter((nd) => !(nd[0] === -d[0] && nd[1] === -d[1]) && this._valid(this.node[0] + nd[0], this.node[1] + nd[1]));
    // prefer going straight a bit more often
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

  // obstacles: [{x,z,kind:'car'|'ped'|'player'}]
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

    // speed control
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
    this.parts.brakeMat.color.setHex(this.braking ? 0xff2222 : 0x7f1d1d);
  }
}
