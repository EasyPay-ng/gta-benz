// MetroVenture 3D — main entry: renderer, game loop, player, NPCs, jobs, startups, vehicles, UI.
import * as THREE from 'three';
import {
  SAVE_KEY, OCCUPATIONS, BUSINESSES, STATIONS, DEALERSHIP, VEHICLE_MODELS, CAR_COLORS, MAX_BUSINESS_LEVEL,
  SKIN_TONES, SHIRT_COLORS, PANTS_COLORS, HAIR_COLORS, HAIR_STYLES, BUILDS, TOTAL_CITIZENS, ROAD_LINES,
  ROAD_HALF, WORLD_LIMIT, PAYROLL_INTERVAL, BLOCK_CENTERS, BLOCK_HALF, DEFAULT_APPEARANCE,
} from './src/data.js';
import * as Eco from './src/economy.js';
import { Character } from './src/character.js';
import { City, resolveCircle, makeTextTexture, CURB_Y } from './src/world.js';
import { Vehicle, TrafficCar, buildCarMesh } from './src/vehicles.js';
import { NetClient, discoverServerUrl } from './src/net.js';

const $ = (id) => document.getElementById(id);
const money = Eco.money;
const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

// ===========================================================================
// Renderer / scene
// ===========================================================================
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x9fd3f5);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 150, 430);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x4d6b35, 1.9));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===========================================================================
// Audio (tiny WebAudio synth, no assets)
// ===========================================================================
const sfx = {
  ctx: null, muted: false, engine: null,
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.ctx.destination);
    osc.start();
    this.engine = { osc, gain };
  },
  tone(freq, dur = 0.15, type = 'sine', vol = 0.12, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  cash() { this.tone(880, 0.12, 'triangle', 0.12); this.tone(1320, 0.2, 'triangle', 0.1, 0.09); },
  horn() { this.tone(392, 0.35, 'square', 0.06); this.tone(494, 0.35, 'square', 0.05); },
  crash(v) { this.tone(70 + Math.random() * 40, 0.25, 'sawtooth', Math.min(0.25, v * 0.02)); },
  click() { this.tone(660, 0.05, 'square', 0.04); },
  error() { this.tone(180, 0.18, 'square', 0.06); },
  rankUp() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, i * 0.09)); },
  setEngine(on, speed) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.gain.gain.setTargetAtTime(on && !this.muted ? 0.035 : 0, t, 0.1);
    this.engine.osc.frequency.setTargetAtTime(45 + Math.abs(speed) * 5.5, t, 0.08);
  },
};

// ===========================================================================
// World
// ===========================================================================
const city = new City(scene);
const navNodes = city.navNodes;

// Showroom display cars at Metro Motors
const displayCars = ['sedan', 'sports', 'pickup'].map((model, i) => {
  const parts = buildCarMesh(model, ['#2563eb', '#dc2626', '#0d9488'][i]);
  const spot = city.dealerDisplays[i];
  parts.group.position.set(spot.x, CURB_Y + 0.25, spot.z);
  parts.group.rotation.y = spot.yaw;
  scene.add(parts.group);
  return parts.group;
});

// Task waypoint marker
const marker = (() => {
  const g = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 60, 20, 1, true), beamMat);
  beam.position.y = 30;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.14;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), ringMat);
  arrow.rotation.x = Math.PI; arrow.position.y = 3.2;
  g.add(beam, ring, arrow);
  g.visible = false;
  scene.add(g);
  return { group: g, beamMat, ringMat, arrow, ring };
})();

// ===========================================================================
// Game state
// ===========================================================================
const game = {
  state: null,
  player: { char: null, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, vehicle: null },
  vehicles: [],
  citizens: [],
  traffic: [],
  task: null,
  passenger: null,
  modal: null,
  creatorOpen: false,
  helpOpen: false,
  loginOpen: false,
  time: 0,
  valetCooldown: 0,
  autosaveTimer: 60,
  prompt: null,
};
window.__mv = game; // handy for debugging in the console
game.renderer = renderer;

game.player.char = new Character(Eco.createInitialState().appearance);
scene.add(game.player.char.group);

// AI traffic
{
  const rand = Eco.mulberry32(9001);
  for (let i = 0; i < 12; i++) game.traffic.push(new TrafficCar(scene, rand));
}

// ===========================================================================
// Citizens
// ===========================================================================
function makeLabelTexture(title, sub, color) {
  return makeTextTexture([title, sub], { width: 320, height: 96, bg: 'rgba(15,23,42,0.82)', fg: color, font: 'bold 38px system-ui, sans-serif' });
}

class CitizenAgent {
  constructor(data) {
    this.data = data;
    this.char = new Character(data.appearance);
    scene.add(this.char.group);
    this.speed = 1.3 + Math.random() * 0.4;
    this.path = [];
    this.target = null;
    this.idle = 0;
    this.prevNode = null;
    this.vel = 0;
    this.labelMat = new THREE.SpriteMaterial({ depthTest: false, transparent: true });
    this.label = new THREE.Sprite(this.labelMat);
    this.label.scale.set(2.4, 0.72, 1);
    this.label.position.y = 2.45;
    this.label.renderOrder = 10;
    this.char.group.add(this.label);
    if (data.x == null || !Number.isFinite(data.x)) {
      const n = navNodes[Math.floor(Math.random() * navNodes.length)];
      this.x = n.x; this.z = n.z;
    } else { this.x = data.x; this.z = data.z; }
    this.yaw = Math.random() * Math.PI * 2;
    this.refreshJob(true);
  }

  get employerDef() { return this.data.employer ? BUSINESSES[this.data.employer] : null; }

  refreshJob(initial = false) {
    const def = this.employerDef;
    this.char.setOccupation(def ? def.occupation : null);
    if (this.labelMat.map) this.labelMat.map.dispose();
    this.labelMat.map = def
      ? makeLabelTexture(this.data.name, `${OCCUPATIONS[def.occupation].title}`, '#86efac')
      : makeLabelTexture(this.data.name, 'Unemployed · looking for work', '#fde68a');
    this.labelMat.needsUpdate = true;
    this.path = [];
    this.target = null;
    this.mode = def ? 'commute' : 'wander';
    this.char.setPose('stand');
    if (def && initial && this.data.x != null) this.mode = 'commute';
  }

  workSpotWorld() {
    const def = this.employerDef;
    const lot = city.lots[def.id];
    const s = def.workSpots[Math.floor(Math.random() * def.workSpots.length)];
    const p = city.toWorld(lot.frame, s.x + (Math.random() - 0.5) * 2, s.z + (Math.random() - 0.5) * 2);
    return p;
  }

  planCommute() {
    const def = this.employerDef;
    const lot = city.lots[def.id];
    const from = city.nearestNavNode(this.x, this.z);
    const to = city.nearestNavNode(lot.interact.x, lot.interact.z);
    const ids = city.findPath(from.id, to.id);
    this.path = ids.map((id) => ({ x: navNodes[id].x, z: navNodes[id].z }));
    this.path.push({ x: lot.interact.x, z: lot.interact.z });
    this.path.push(this.workSpotWorld());
    this.mode = 'commuting';
  }

  pickWander() {
    const here = city.nearestNavNode(this.x, this.z);
    const options = here.links.filter((id) => id !== this.prevNode);
    const nextId = options.length ? options[Math.floor(Math.random() * options.length)] : here.links[0];
    this.prevNode = here.id;
    const n = navNodes[nextId];
    this.path = [{ x: n.x + (Math.random() - 0.5) * 1.2, z: n.z + (Math.random() - 0.5) * 1.2 }];
  }

  update(dt, carCircles) {
    // dodge fast cars
    if (this.char.pose !== 'dive') {
      for (const c of carCircles) {
        if (c.speed < 3) continue;
        const dx = this.x - c.x; const dz = this.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < c.r + 1.3) {
          this.char.setPose('dive', 1.1);
          this.diveX = (dx / (d || 1)) * 5; this.diveZ = (dz / (d || 1)) * 5;
          this.idle = 1.2;
          break;
        }
      }
    }
    let moveSpeed = 0;
    if (this.char.pose === 'dive') {
      this.x += this.diveX * dt; this.z += this.diveZ * dt;
      this.diveX *= 0.9; this.diveZ *= 0.9;
    } else if (this.idle > 0) {
      this.idle -= dt;
      if (this.idle <= 0 && this.char.pose === 'work') this.char.setPose('stand');
    } else {
      if (this.mode === 'commute') this.planCommute();
      if (!this.path.length) {
        if (this.mode === 'wander') {
          if (Math.random() < 0.2) this.idle = 1.5 + Math.random() * 3;
          else this.pickWander();
        } else if (this.mode === 'commuting' || this.mode === 'working') {
          // arrived at a work spot: do some work, then move to another spot
          this.mode = 'working';
          this.char.setPose('work');
          this.idle = 4 + Math.random() * 5;
          this.path = [this.workSpotWorld()];
        }
      }
      const t = this.path[0];
      if (t && this.idle <= 0) {
        const dx = t.x - this.x; const dz = t.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5) this.path.shift();
        else {
          moveSpeed = this.speed;
          this.x += (dx / d) * moveSpeed * dt;
          this.z += (dz / d) * moveSpeed * dt;
          this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
          this.char.setPose('stand');
        }
      }
    }
    // keep out of buildings and cars
    const res = resolveCircle(this.x, this.z, 0.35, city.colliderCache);
    this.x = res.x; this.z = res.z;
    for (const c of carCircles) {
      const dx = this.x - c.x; const dz = this.z - c.z;
      const d = Math.hypot(dx, dz); const min = c.r + 0.35;
      if (d < min && d > 1e-4) { this.x += (dx / d) * (min - d); this.z += (dz / d) * (min - d); }
    }
    this.x = THREE.MathUtils.clamp(this.x, -WORLD_LIMIT, WORLD_LIMIT);
    this.z = THREE.MathUtils.clamp(this.z, -WORLD_LIMIT, WORLD_LIMIT);
    this.char.group.position.set(this.x, city.groundY(this.x, this.z), this.z);
    this.char.group.rotation.y = this.yaw;
    this.char.animate(dt, moveSpeed);
    this.data.x = this.x; this.data.z = this.z;
    const pd = Math.hypot(this.x - game.player.x, this.z - game.player.z);
    this.label.visible = pd < 16 && !game.creatorOpen;
  }

  dispose() {
    try { this.char.group.removeFromParent(); } catch { try { scene.remove(this.char.group); } catch {} }
    try { this.char.dispose(); } catch {}
    try { if (this.labelMat.map) this.labelMat.map.dispose(); } catch {}
    try { this.labelMat.dispose(); } catch {}
  }
}

// ===========================================================================
// State application (new game / load)
// ===========================================================================
function applyState() {
  const s = game.state;
  cancelTask();
  // lots — be tolerant if save references unknown business or city lost a lot
  for (const id of Object.keys(BUSINESSES)) {
    try { city.updateLot(id, s.businesses[id]); } catch (e) { console.warn('[applyState] lot', id, e); }
  }
  try { city.rebuildColliderCache(); } catch {}
  // player
  const p = game.player;
  try { if (p.vehicle) detachFromVehicle(); } catch {}
  try { p.char.setAppearance(s.appearance); } catch (e) { console.warn('[applyState] appearance', e); p.char.setAppearance(Eco.createInitialState().appearance); }
  try { p.char.setOccupation(s.activeJob); } catch {}
  try { p.char.setCarrying(false); } catch {}
  p.x = Number.isFinite(s.player.x) ? s.player.x : -12.5;
  p.z = Number.isFinite(s.player.z) ? s.player.z : -15;
  p.yaw = Number.isFinite(s.player.yaw) ? s.player.yaw : Math.PI * 0.8;
  p.vx = p.vz = 0;
  cam.yaw = p.yaw;
  // vehicles — filter out any entry that fails to construct
  for (const v of game.vehicles) try { v.dispose(); } catch {}
  game.vehicles = [];
  for (const d of (s.vehicles || [])) {
    try { game.vehicles.push(new Vehicle(scene, d)); } catch (e) { console.warn('[applyState] vehicle', d, e); }
  }
  for (const v of game.vehicles) try { v.syncMesh(city.groundY(v.x, v.z)); } catch {}
  // citizens
  for (const c of game.citizens) try { c.dispose(); } catch {}
  game.citizens = [];
  for (const d of (s.citizens || [])) {
    try { game.citizens.push(new CitizenAgent(d)); } catch (e) { console.warn('[applyState] citizen', d, e); }
  }
  // if citizen list ended up empty due to corrupted save, repopulate
  if (!game.citizens.length) {
    const fresh = Eco.createInitialState();
    s.citizens = fresh.citizens;
    for (const d of s.citizens) try { game.citizens.push(new CitizenAgent(d)); } catch {}
  }
  if (s.player.inVehicle) {
    const v = game.vehicles.find((x) => x.data.id === s.player.inVehicle);
    if (v) try { enterVehicle(v, true); } catch {}
  }
  if (s.activeJob) try { newTask(); } catch {}
  updateHUD(true);
}

function snapshotState() {
  const s = game.state; const p = game.player;
  if (p.vehicle) {
    s.player.x = p.vehicle.x; s.player.z = p.vehicle.z;
    s.player.inVehicle = p.vehicle.data.id;
  } else {
    s.player.x = p.x; s.player.z = p.z; s.player.inVehicle = null;
  }
  s.player.yaw = p.yaw;
}

function saveGame(silent = false) {
  try {
    snapshotState();
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.state));
    if (!silent) toast('💾 Game saved', 'good');
    return true;
  } catch (err) {
    console.error('[save]', err);
    toast(`Save failed: ${err.message}`, 'bad');
    return false;
  }
}

function loadGame(silent = false) {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { if (!silent) toast('No save found yet. Press F5 to save.', 'bad'); return false; }
  // keep a copy of the last known-good state so a corrupted save doesn't brick the city
  const prevState = game.state;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (err) {
    console.error('[load] JSON parse', err);
    toast(`Load failed: Save is corrupted (bad JSON). Press Reset to start fresh.`, 'bad');
    return false;
  }
  try {
    game.state = Eco.migrateState(parsed);
    applyState();
    if (!silent) toast('📂 Save loaded', 'good');
    return true;
  } catch (err) {
    console.error('[load] applyState', err);
    // revert to previous working city so the player isn't stuck on a green void
    try {
      game.state = prevState || Eco.createInitialState();
      applyState();
    } catch (recoveryErr) {
      console.error('[load] recovery', recoveryErr);
      game.state = Eco.createInitialState();
      try { applyState(); } catch {}
    }
    toast(`Load failed: ${err.message} — kept your previous city. Press Reset to clear the broken save if this repeats.`, 'bad');
    return false;
  }
}

function resetGame() {
  if (!window.confirm('Delete your save and start a brand new city?')) return;
  localStorage.removeItem(SAVE_KEY);
  game.state = Eco.createInitialState();
  applyState();
  closeModal();
  toast('A fresh start in Metro City!', 'good');
  showHelp();
}

// ===========================================================================
// Input
// ===========================================================================
const keys = new Set();
const touchInput = { x: 0, y: 0, sprint: false };
const isTyping = () => document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
const anyOverlay = () => !!game.modal || game.helpOpen || game.loginOpen;

window.addEventListener('keydown', (e) => {
  sfx.ensure();
  if (e.code === 'F5') { e.preventDefault(); saveGame(); return; }
  if (e.code === 'F9') { e.preventDefault(); loadGame(); return; }
  if (e.code === 'Escape') { closeModal(); closeCreator(); hideHelp(); return; }
  if (isTyping()) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (game.helpOpen) { if (e.code === 'Enter' || e.code === 'Space') hideHelp(); return; }
  if (game.modal) return;
  switch (e.code) {
    case 'KeyE': interact(); break;
    case 'Space': if (!game.player.vehicle) interact(); break;
    case 'KeyF': toggleVehicle(); break;
    case 'KeyV': valet(); break;
    case 'KeyC': game.creatorOpen ? closeCreator() : openCreator(); break;
    case 'KeyH': showHelp(); break;
    case 'KeyM': toggleMute(); break;
    case 'KeyG': if (game.player.vehicle) honk(); break;
    default: break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const k = (...codes) => codes.some((c) => keys.has(c));
function axes() {
  let f = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0) + touchInput.y;
  let r = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0) + touchInput.x;
  if (anyOverlay() || isTyping()) { f = 0; r = 0; }
  return { f: THREE.MathUtils.clamp(f, -1, 1), r: THREE.MathUtils.clamp(r, -1, 1) };
}

// Camera orbit with mouse / touch drag
const cam = { yaw: 0, pitch: 0.38, dist: 7.5, lastDrag: -10, drag: null, shake: 0 };
canvas.addEventListener('pointerdown', (e) => {
  sfx.ensure();
  cam.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!cam.drag || cam.drag.id !== e.pointerId) return;
  const dx = e.clientX - cam.drag.x; const dy = e.clientY - cam.drag.y;
  cam.drag.x = e.clientX; cam.drag.y = e.clientY;
  cam.yaw -= dx * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004, 0.05, 1.25);
  cam.lastDrag = game.time;
});
const endDrag = (e) => { if (cam.drag && cam.drag.id === e.pointerId) cam.drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = THREE.MathUtils.clamp(cam.dist + Math.sign(e.deltaY) * 0.8, 3.5, 18);
}, { passive: false });

// Touch controls
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
  $('touch').classList.remove('hidden');
  const joy = $('joystick'); const knob = $('joystick-knob');
  let jid = null;
  const setJoy = (e) => {
    const r = joy.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2); let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy); const max = 45;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touchInput.x = dx / max; touchInput.y = -dy / max;
  };
  joy.addEventListener('pointerdown', (e) => { sfx.ensure(); jid = e.pointerId; joy.setPointerCapture(jid); setJoy(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) setJoy(e); });
  const end = (e) => { if (e.pointerId !== jid) return; jid = null; touchInput.x = touchInput.y = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  for (const b of document.querySelectorAll('#touch-buttons button')) {
    const key = b.dataset.key;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); sfx.ensure();
      if (anyOverlay()) return;
      if (key === 'interact') interact();
      if (key === 'vehicle') toggleVehicle();
      if (key === 'horn') honk();
      if (key === 'sprint') touchInput.sprint = true;
    });
    const up = () => { if (key === 'sprint') touchInput.sprint = false; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  }
}

// ===========================================================================
// UI helpers: toasts, HUD, modals
// ===========================================================================
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('toasts').prepend(el);
  while ($('toasts').children.length > 5) $('toasts').lastChild.remove();
  setTimeout(() => el.classList.add('fade'), 3800);
  setTimeout(() => el.remove(), 4300);
}

let hudTimer = 0;
function updateHUD(force = false) {
  hudTimer -= 1;
  if (!force && hudTimer > 0) return;
  hudTimer = 6;
  const s = game.state;
  $('hud-cash').textContent = money(s.cash);
  if (s.activeJob) {
    const xp = s.jobXP[s.activeJob] || 0;
    const rank = Eco.rankFor(xp); const next = Eco.nextRank(xp);
    $('hud-job').textContent = `${OCCUPATIONS[s.activeJob].title} · ${rank.name}`;
    $('hud-xp').style.width = next ? `${((xp - rank.xp) / (next.xp - rank.xp)) * 100}%` : '100%';
    $('hud-xpwrap').classList.remove('hidden');
    $('btn-clockout').classList.remove('hidden');
  } else {
    $('hud-job').textContent = 'Off duty';
    $('hud-xpwrap').classList.add('hidden');
    $('btn-clockout').classList.add('hidden');
  }
  $('hud-startups').textContent = `${Eco.builtCount(s)} / ${Object.keys(BUSINESSES).length}`;
  $('hud-employment').textContent = `${Eco.employedCount(s)} / ${TOTAL_CITIZENS} citizens hired`;
  $('hud-vehicles').textContent = `${s.vehicles.length} vehicle${s.vehicles.length === 1 ? '' : 's'}`;
  $('hud-day').textContent = `Day ${s.stats.day}`;
  $('hud-payday').textContent = Eco.builtCount(s) ? `Payday in ${Math.ceil(s.stats.payrollTimer)}s` : 'No startups yet';
  const netEl = $('hud-net');
  if (netEl) {
    if (!net) netEl.textContent = 'Single-player';
    else if (net.connected) {
      const name = net.name || 'Guest';
      netEl.textContent = `${name}${net.account ? '' : ' (guest)'} · ${net.visiblePeers().length} nearby${net.rtt != null ? ` · ${net.rtt}ms` : ''}`;
    } else if (net.status === 'auth_required' || net.status === 'authenticating') netEl.textContent = 'Signing in…';
    else if (net.status === 'reconnecting') netEl.textContent = 'Reconnecting…';
    else netEl.textContent = 'Connecting…';
  }
  const acctBtn = $('btn-account');
  if (acctBtn) acctBtn.classList.toggle('hidden', !net);
}

const modalEl = $('modal');
function openModal(render) {
  game.modal = render;
  renderModal();
  modalEl.classList.remove('hidden');
  sfx.click();
}
function renderModal() { if (game.modal) $('modal-body').innerHTML = game.modal(); }
function closeModal() { game.modal = null; modalEl.classList.add('hidden'); }
$('modal-close').addEventListener('click', closeModal);
modalEl.addEventListener('pointerdown', (e) => { if (e.target === modalEl) closeModal(); });
$('modal-body').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const handler = modalActions[btn.dataset.action];
  if (handler) handler(btn.dataset);
  renderModal();
  updateHUD(true);
});

function result(res) {
  if (res.ok) { sfx.cash(); toast(res.msg, 'good'); } else { sfx.error(); toast(res.msg, 'bad'); }
  return res.ok;
}

// ---------------------------------------------------------------------------
// Modal renderers & actions
// ---------------------------------------------------------------------------
function stationModal(stationId) {
  return () => {
    const st = STATIONS[stationId];
    const occ = OCCUPATIONS[st.occupation];
    const s = game.state;
    const xp = s.jobXP[occ.id] || 0;
    const rank = Eco.rankFor(xp); const next = Eco.nextRank(xp);
    const active = s.activeJob === occ.id;
    const needsCar = occ.requiresVehicle && !s.vehicles.length;
    return `
      <h2>${st.name}</h2>
      <p class="sub">${occ.title} · ${occ.description}</p>
      <div class="kv">
        <div><b>${money(occ.basePay)}${occ.id === 'security' ? '' : '+'}</b><span>Base pay per job</span></div>
        <div><b>+${Math.round((Eco.payMultiplier(xp) - 1) * 100)}%</b><span>Rank bonus</span></div>
        <div><b>${rank.name}</b><span>Your rank</span></div>
        <div><b>${xp}${next ? ` / ${next.xp}` : ''}</b><span>${next ? `Jobs to ${next.name}` : 'Max rank'}</span></div>
      </div>
      ${occ.requiresVehicle ? `<p class="muted">🚗 Requires a car. ${s.vehicles.length ? 'Press <kbd>V</kbd> to have the valet bring yours.' : 'Buy one at Metro Motors.'}</p>` : ''}
      ${s.activeJob && !active ? `<p class="muted">You are currently working as <b>${OCCUPATIONS[s.activeJob].title}</b>. Clocking in here will switch jobs.</p>` : ''}
      <div class="actions">
        ${active
          ? '<button data-action="clockout">Clock out</button>'
          : `<button class="primary" data-action="clockin" data-occ="${occ.id}" ${needsCar ? 'disabled' : ''}>Clock in &amp; start working</button>`}
      </div>`;
  };
}

function lotModal(bizId) {
  return () => {
    const def = BUSINESSES[bizId];
    const s = game.state;
    const biz = s.businesses[bizId];
    const occ = OCCUPATIONS[def.occupation];
    const addr = city.addressFor(def.x, def.z);
    if (!biz) {
      return `
        <h2>${def.name}</h2>
        <p class="sub">Vacant commercial lot near ${addr}</p>
        <div class="kv">
          <div><b>${money(def.cost)}</b><span>Build cost</span></div>
          <div><b>${occ.title}</b><span>Unlocks occupation</span></div>
          <div><b>${Eco.jobSlots(1)} jobs</b><span>Starting job slots (+2 per upgrade)</span></div>
          <div><b>+${money(def.revenuePerWorker - def.wagePerWorker)}</b><span>Profit per worker each payday</span></div>
        </div>
        <p class="muted">Launch the startup, then hire unemployed citizens to create jobs and earn passive profit every ${PAYROLL_INTERVAL}s payday.</p>
        <div class="actions">
          <button class="primary" data-action="buy" data-biz="${bizId}" ${s.cash < def.cost ? 'disabled' : ''}>Buy &amp; build · ${money(def.cost)}</button>
        </div>
        ${s.cash < def.cost ? `<p class="bad-text">You need ${money(def.cost - s.cash)} more. Work some shifts!</p>` : ''}`;
    }
    const n = Eco.businessDailyNumbers(bizId, biz);
    const slots = Eco.jobSlots(biz.level);
    const workers = biz.employees.map((id) => s.citizens.find((c) => c.id === id)).filter(Boolean);
    const unemployed = s.citizens.filter((c) => !c.employer).length;
    const maxed = biz.level >= MAX_BUSINESS_LEVEL;
    const upCost = Eco.upgradeCost(bizId, biz.level);
    const working = s.activeJob === def.occupation;
    return `
      <h2>${def.name} <span class="pill good">Lv ${biz.level}</span></h2>
      <p class="sub">${addr} · creates <b>${occ.title}</b> jobs</p>
      <div class="kv">
        <div><b>${workers.length} / ${slots}</b><span>Employees / job slots</span></div>
        <div><b class="${n.profit > 0 ? 'good-text' : ''}">${money(n.profit)}</b><span>Profit per payday (${money(n.revenue)} revenue − ${money(n.wages)} wages)</span></div>
        <div><b class="good-text">${money(biz.storedProfit)}</b><span>Stored profit</span></div>
        <div><b>${money(biz.lifetimeProfit)}</b><span>Lifetime profit</span></div>
      </div>
      <div>${workers.length ? workers.map((w) => `<span class="pill">👷 ${w.name}</span>`).join('') : '<span class="muted">No employees yet. Hire unemployed citizens!</span>'}</div>
      <div class="actions">
        <button class="good" data-action="collect" data-biz="${bizId}" ${biz.storedProfit < 1 ? 'disabled' : ''}>💰 Collect ${money(biz.storedProfit)}</button>
        <button data-action="hire" data-biz="${bizId}" ${workers.length >= slots || !unemployed ? 'disabled' : ''}>🤝 Hire nearest citizen ${unemployed ? `(${unemployed} looking)` : '(none left)'}</button>
        <button data-action="upgrade" data-biz="${bizId}" ${maxed || s.cash < upCost ? 'disabled' : ''}>${maxed ? '⭐ Max level' : `⬆ Upgrade · ${money(upCost)} (+2 slots)`}</button>
        ${working
          ? '<button data-action="clockout">⏹ End shift</button>'
          : `<button class="primary" data-action="clockin" data-occ="${def.occupation}">🛠 Work a shift as ${occ.title}</button>`}
      </div>`;
  };
}

function hireModal(citizenId) {
  return () => {
    const s = game.state;
    const c = s.citizens.find((x) => x.id === citizenId);
    if (c.employer) {
      return `<h2>${c.name}</h2><p class="sub">Now working as ${OCCUPATIONS[BUSINESSES[c.employer].occupation].title} at ${BUSINESSES[c.employer].name}.</p>
      <p>"Thanks for the opportunity, boss! 🙌"</p><div class="actions"><button data-action="close">Close</button></div>`;
    }
    const owned = Object.entries(s.businesses).filter(([, b]) => b);
    const rows = owned.map(([id, b]) => {
      const def = BUSINESSES[id];
      const open = Eco.jobSlots(b.level) - b.employees.length;
      return `<li><span><b>${def.name}</b><br><span class="muted">${OCCUPATIONS[def.occupation].title} · ${open} open slot${open === 1 ? '' : 's'}</span></span>
        <button class="primary" data-action="hireCitizen" data-biz="${id}" data-cid="${c.id}" ${open <= 0 ? 'disabled' : ''}>Hire</button></li>`;
    }).join('');
    return `
      <h2>${c.name}</h2>
      <p class="sub">Unemployed citizen · looking for work</p>
      ${owned.length ? `<p>Offer ${c.name} a job at one of your startups:</p><ul class="list">${rows}</ul>`
        : '<p>"I\'d love a job, but nobody is hiring." Build a startup on a <b>FOR SALE</b> lot to create jobs for citizens like me.</p>'}
      `;
  };
}

const dealerUI = { colors: {} };
function dealerModal() {
  return () => {
    const s = game.state;
    const cards = Object.values(VEHICLE_MODELS).filter((m) => m.forSale).map((m) => {
      const color = m.fixedColor || dealerUI.colors[m.id] || CAR_COLORS[0];
      const bar = (v) => `<div class="bar"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div>`;
      return `
        <div class="car-card">
          <h3>${m.name}</h3><div class="price">${money(m.price)}</div>
          <div class="bars">
            <span>Top speed</span>${bar(m.maxSpeed / 46)}
            <span>Acceleration</span>${bar(m.accel / 17)}
            <span>Handling</span>${bar((m.grip / 9.5) * 0.6 + (m.steer / 0.62) * 0.4)}
          </div>
          <div class="row">
            <div class="swatches">${m.fixedColor ? '<span class="muted">Official taxi yellow</span>' : CAR_COLORS.map((c) => `<button class="swatch ${c === color ? 'active' : ''}" style="background:${c}" data-action="carColor" data-model="${m.id}" data-color="${c}" aria-label="colour ${c}"></button>`).join('')}</div>
            <button class="primary" data-action="buyCar" data-model="${m.id}" ${s.cash < m.price ? 'disabled' : ''}>Buy</button>
          </div>
        </div>`;
    }).join('');
    const owned = s.vehicles.map((v) => `<span class="pill">🚗 ${VEHICLE_MODELS[v.model].name}</span>`).join('');
    return `
      <h2>Metro Motors</h2>
      <p class="sub">Your garage: ${owned || 'empty'}</p>
      ${cards}
      <p class="muted">Tip: taxis earn +30% fares as a Metro Cab Driver. Press <kbd>V</kbd> anywhere to have the valet bring your last-driven car.</p>`;
  };
}

const modalActions = {
  close: () => closeModal(),
  clockin: ({ occ }) => {
    const res = Eco.clockIn(game.state, occ);
    if (!result(res)) return;
    game.player.char.setOccupation(occ);
    newTask();
    closeModal();
  },
  clockout: () => { doClockOut(); closeModal(); },
  buy: ({ biz }) => {
    const res = Eco.buyLot(game.state, biz);
    if (!result(res)) return;
    city.updateLot(biz, game.state.businesses[biz]);
    city.rebuildColliderCache();
    unstickPlayer();
    saveGame(true);
  },
  collect: ({ biz }) => { result(Eco.collectProfit(game.state, biz)); },
  hire: ({ biz }) => {
    const def = BUSINESSES[biz];
    const lot = city.lots[biz];
    const free = game.citizens.filter((a) => !a.data.employer);
    if (!free.length) { result({ ok: false, msg: 'Everyone in town already has a job! 🎉' }); return; }
    free.sort((a, b) => dist2(a, lot.interact) - dist2(b, lot.interact));
    doHire(biz, free[0].data.id);
    void def;
  },
  hireCitizen: ({ biz, cid }) => { if (doHire(biz, cid)) closeModal(); },
  upgrade: ({ biz }) => {
    if (!result(Eco.upgradeBusiness(game.state, biz))) return;
    city.updateLot(biz, game.state.businesses[biz]);
    city.rebuildColliderCache();
    unstickPlayer();
    saveGame(true);
  },
  carColor: ({ model, color }) => { dealerUI.colors[model] = color; },
  buyCar: ({ model }) => {
    const m = VEHICLE_MODELS[model];
    const spots = DEALERSHIP.deliverySpots;
    // choose the delivery bay furthest from any existing car
    let spot = spots[0]; let best = -1;
    for (const sp of spots) {
      const nearest = Math.min(Infinity, ...game.vehicles.map((v) => dist2(v, sp)));
      if (nearest > best) { best = nearest; spot = sp; }
    }
    const res = Eco.buyVehicle(game.state, model, m.fixedColor || dealerUI.colors[model] || CAR_COLORS[0], spot);
    if (!result(res)) return;
    const v = new Vehicle(scene, res.vehicle);
    v.syncMesh(city.groundY(v.x, v.z));
    game.vehicles.push(v);
    saveGame(true);
  },
};

function doHire(biz, cid) {
  const res = Eco.hireCitizen(game.state, biz, cid);
  if (!result(res)) return false;
  const agent = game.citizens.find((a) => a.data.id === cid);
  agent.refreshJob();
  const employed = Eco.employedCount(game.state);
  if (employed === TOTAL_CITIZENS) toast('🏙 Full employment! Every citizen in Metro City has a job.', 'money');
  saveGame(true);
  return true;
}

function doClockOut() {
  const res = Eco.clockOut(game.state);
  cancelTask();
  game.player.char.setOccupation(null);
  game.player.char.setCarrying(false);
  if (res.ok) toast(res.msg);
  updateHUD(true);
}
$('btn-clockout').addEventListener('click', doClockOut);

// ---------------------------------------------------------------------------
// Character creator
// ---------------------------------------------------------------------------
function buildCreatorUI() {
  const s = game.state;
  const swatch = (containerId, list, key) => {
    $(containerId).innerHTML = list.map((c) => `<button class="swatch ${s.appearance[key] === c ? 'active' : ''}" data-key="${key}" data-val="${c}" style="background:${c}"></button>`).join('');
  };
  const chips = (containerId, list, key) => {
    $(containerId).innerHTML = list.map((c) => `<button class="chip ${s.appearance[key] === c ? 'active' : ''}" data-key="${key}" data-val="${c}">${c}</button>`).join('');
  };
  swatch('cc-skin', SKIN_TONES, 'skin');
  swatch('cc-shirt', SHIRT_COLORS, 'shirt');
  swatch('cc-pants', PANTS_COLORS, 'pants');
  swatch('cc-hair', HAIR_COLORS, 'hair');
  chips('cc-hairstyle', HAIR_STYLES, 'hairStyle');
  chips('cc-build', Object.keys(BUILDS), 'build');
  $('cc-name').value = s.appearance.name;
}
$('creator').addEventListener('click', (e) => {
  const b = e.target.closest('[data-key]');
  if (!b) return;
  game.state.appearance[b.dataset.key] = b.dataset.val;
  game.player.char.setAppearance(game.state.appearance);
  game.player.char.setOccupation(null);
  buildCreatorUI();
  sfx.click();
});
$('cc-name').addEventListener('input', (e) => { game.state.appearance.name = e.target.value.trim() || 'Benz'; });
$('cc-random').addEventListener('click', () => {
  const app = Eco.randomAppearance(Math.random, game.state.appearance.name);
  game.state.appearance = app;
  game.player.char.setAppearance(app);
  game.player.char.setOccupation(null);
  buildCreatorUI();
});
$('cc-done').addEventListener('click', () => closeCreator());
function openCreator() {
  if (game.player.vehicle) { toast('Step out of the car to change your look.', 'bad'); return; }
  closeModal();
  game.creatorOpen = true;
  game.player.char.setOccupation(null); // show casual clothes while editing
  buildCreatorUI();
  $('creator').classList.remove('hidden');
}
function closeCreator() {
  if (!game.creatorOpen) return;
  game.creatorOpen = false;
  $('creator').classList.add('hidden');
  game.player.char.setOccupation(game.state.activeJob);
  game.player.char.setCarrying(!!(game.task && game.task.carrying));
  document.activeElement?.blur?.();
  saveGame(true);
  if (net) net.setAppearance(game.state.appearance);
}
$('btn-creator').addEventListener('click', () => (game.creatorOpen ? closeCreator() : openCreator()));

// Help
function showHelp() { game.helpOpen = true; $('help').classList.remove('hidden'); }
let pendingLogin = false;
function hideHelp() {
  if (!game.helpOpen) return;
  game.helpOpen = false;
  $('help').classList.add('hidden');
  if (!game.state.seenHelp) { game.state.seenHelp = true; saveGame(true); }
  if (pendingLogin) { pendingLogin = false; showLogin(); }
}
$('help-close').addEventListener('click', () => { sfx.ensure(); hideHelp(); });
$('btn-help').addEventListener('click', showHelp);
$('btn-save').addEventListener('click', () => saveGame());
$('btn-load').addEventListener('click', () => loadGame());
$('btn-reset').addEventListener('click', resetGame);
function toggleMute() {
  sfx.muted = !sfx.muted;
  $('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';
}
$('btn-mute').addEventListener('click', () => { sfx.ensure(); toggleMute(); });
// keep keyboard focus on the game after clicking HUD buttons
for (const b of document.querySelectorAll('.side-buttons button')) b.addEventListener('click', () => b.blur());

// ===========================================================================
// Vehicles: enter / exit / valet / horn
// ===========================================================================
function nearestOwnedVehicle(maxDist) {
  let best = null; let bd = maxDist * maxDist;
  for (const v of game.vehicles) {
    const d = dist2(v, game.player);
    const reach = (maxDist + v.model.len * 0.35) ** 2;
    if (d < reach && d < bd + v.model.len) { bd = d; best = v; }
  }
  return best;
}

function enterVehicle(v, silent = false) {
  const p = game.player;
  p.vehicle = v;
  game.state.lastVehicleId = v.data.id;
  const ch = p.char;
  v.mesh.add(ch.group);
  ch.group.position.copy(v.parts.seat);
  ch.group.rotation.set(0, 0, 0);
  ch.group.scale.setScalar(v.parts.seatScale);
  ch.setPose('sit');
  ch.parcel.visible = false;
  cam.yaw = v.yaw;
  $('vehicle-hud').classList.remove('hidden');
  $('veh-name').textContent = v.model.name;
  if (!silent) sfx.tone(120, 0.3, 'sawtooth', 0.05);
}

function detachFromVehicle() {
  const p = game.player;
  const ch = p.char;
  scene.add(ch.group);
  ch.group.scale.setScalar(1);
  ch.setPose('stand');
  ch.setCarrying(!!(game.task && game.task.carrying));
  p.vehicle = null;
  $('vehicle-hud').classList.add('hidden');
  sfx.setEngine(false, 0);
}

function exitVehicle() {
  const p = game.player; const v = p.vehicle;
  if (Math.abs(v.speed) > 9) { toast('Slow down before jumping out!', 'bad'); return; }
  const f = v.forward;
  const left = { x: f.z, z: -f.x };
  const off = v.model.wid / 2 + 0.75;
  const candidates = [
    { x: v.x + left.x * off, z: v.z + left.z * off },
    { x: v.x - left.x * off, z: v.z - left.z * off },
    { x: v.x + f.x * (v.model.len / 2 + 0.8), z: v.z + f.z * (v.model.len / 2 + 0.8) },
    { x: v.x - f.x * (v.model.len / 2 + 0.8), z: v.z - f.z * (v.model.len / 2 + 0.8) },
  ];
  let spot = candidates[0];
  for (const c of candidates) {
    const r = resolveCircle(c.x, c.z, 0.4, city.colliderCache);
    if (!r.hit) { spot = c; break; }
  }
  detachFromVehicle();
  p.x = spot.x; p.z = spot.z; p.yaw = v.yaw; p.vx = p.vz = 0;
  cam.yaw = v.yaw;
}

function toggleVehicle() {
  if (game.creatorOpen) return;
  if (game.player.vehicle) { exitVehicle(); return; }
  const v = nearestOwnedVehicle(3.2);
  if (v) enterVehicle(v);
  else if (game.state.vehicles.length) toast('No car nearby. Press V to call the valet.', '');
  else toast('You don\'t own a car. Visit Metro Motors!', 'bad');
}

function curbSpotNear(x, z) {
  let best = null; let bd = Infinity;
  const off = ROAD_HALF - 1.1;
  for (const r of ROAD_LINES) {
    const clampZ = THREE.MathUtils.clamp(z, -150, 150);
    const clampX = THREE.MathUtils.clamp(x, -150, 150);
    const cands = [
      { x: r - off, z: clampZ, yaw: 0 },            // west curb, southbound (+z)
      { x: r + off, z: clampZ, yaw: Math.PI },      // east curb, northbound (-z)
      { x: clampX, z: r + off, yaw: Math.PI / 2 },  // south curb, eastbound (+x)
      { x: clampX, z: r - off, yaw: -Math.PI / 2 }, // north curb, westbound (-x)
    ];
    for (const c of cands) {
      // avoid parking inside an intersection
      const nearInter = ROAD_LINES.some((q) => Math.abs((c.yaw === 0 || c.yaw === Math.PI ? c.z : c.x) - q) < ROAD_HALF + 3);
      if (nearInter) continue;
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
  }
  return best;
}

function valet() {
  if (game.player.vehicle) { toast('You are already driving.', ''); return; }
  const s = game.state;
  const v = game.vehicles.find((x) => x.data.id === s.lastVehicleId) || game.vehicles[0];
  if (!v) { toast('You don\'t own a car yet. Visit Metro Motors!', 'bad'); return; }
  if (game.valetCooldown > 0) { toast(`Valet is on the way back… ${Math.ceil(game.valetCooldown)}s`, ''); return; }
  const spot = curbSpotNear(game.player.x, game.player.z);
  if (!spot) return;
  v.teleport(spot.x, spot.z, spot.yaw);
  game.valetCooldown = 8;
  sfx.horn();
  toast(`🚗 Valet parked your ${v.model.name} at the curb nearby.`, 'good');
}

function honk() {
  sfx.horn();
  const v = game.player.vehicle;
  if (!v) return;
  for (const c of game.citizens) {
    if (dist2(c, v) < 100 && c.char.pose !== 'dive') { c.idle = 0.6; c.yaw = Math.atan2(v.x - c.x, v.z - c.z); }
  }
}

// ===========================================================================
// Tasks
// ===========================================================================
function randomNodeBetween(from, minD, maxD) {
  const opts = navNodes.filter((n) => { const d = Math.sqrt(dist2(n, from)); return d >= minD && d <= maxD; });
  const list = opts.length ? opts : navNodes;
  return list[Math.floor(Math.random() * list.length)];
}

function newTask() {
  const s = game.state;
  const occId = s.activeJob;
  if (!occId) return;
  const occ = OCCUPATIONS[occId];
  const P = game.player.vehicle || game.player;
  let task = null;
  if (occId === 'courier') {
    const depot = STATIONS.courier.interact;
    const dest = randomNodeBetween(depot, 60, 260);
    const d = Math.sqrt(dist2(dest, depot));
    task = {
      steps: [
        { x: depot.x, z: depot.z, label: 'Pick up a parcel at the Express Courier Depot', verb: 'Pick up parcel', onDone: () => setCarrying(true) },
        { x: dest.x, z: dest.z, label: `Deliver the parcel to ${city.addressFor(dest.x, dest.z)}`, verb: 'Deliver parcel', onDone: () => setCarrying(false) },
      ],
      pay: occ.basePay + Math.round(d * 0.5),
    };
  } else if (occId === 'security') {
    const hq = STATIONS.security.interact;
    const steps = [];
    let last = hq;
    for (let i = 1; i <= 3; i++) {
      const n = randomNodeBetween(last, 35, 120);
      steps.push({ x: n.x, z: n.z, label: `Check patrol point ${i}/3 at ${city.addressFor(n.x, n.z)}`, verb: 'Check in at patrol point' });
      last = n;
    }
    task = { steps, pay: occ.basePay };
  } else if (occId === 'cabbie') {
    const pick = randomNodeBetween(P, 40, 150);
    const drop = randomNodeBetween(pick, 80, 260);
    const d = Math.sqrt(dist2(pick, drop));
    const app = Eco.randomAppearance(Math.random, 'Passenger');
    const name = ['Mrs. Adeyemi', 'Mr. Okafor', 'Dr. Bello', 'Chioma', 'Segun', 'Halima', 'Mr. Danjuma', 'Yetunde'][Math.floor(Math.random() * 8)];
    task = {
      steps: [
        { x: pick.x, z: pick.z, label: `Pick up ${name} at ${city.addressFor(pick.x, pick.z)}`, verb: 'Pick up passenger', vehicle: true, auto: true, onStart: () => spawnPassenger(app, pick), onDone: () => boardPassenger() },
        { x: drop.x, z: drop.z, label: `Drive ${name} to ${city.addressFor(drop.x, drop.z)}`, verb: 'Drop off passenger', vehicle: true, auto: true, onDone: () => dropPassenger() },
      ],
      pay: occ.basePay + Math.round(d * 1.6),
      taxiBonus: true,
    };
  } else if (occ.kind === 'business') {
    const def = BUSINESSES[occ.business];
    const lot = city.lots[def.id];
    const spots = [...def.workSpots].sort(() => Math.random() - 0.5).slice(0, 3);
    const toStep = (sp) => { const p = city.toWorld(lot.frame, sp.x, sp.z); return { x: p.x, z: p.z, label: sp.label, verb: sp.label.split(' ').slice(0, 3).join(' ') }; };
    const steps = spots.map(toStep);
    if (def.delivery) {
      const dest = randomNodeBetween(lot.interact, 90, 260);
      steps[0].onDone = () => setCarrying(true);
      steps[1] = { x: dest.x, z: dest.z, label: `Deliver the cargo to ${city.addressFor(dest.x, dest.z)} (take a car!)`, verb: 'Deliver cargo', onDone: () => setCarrying(false) };
    }
    task = { steps, pay: occ.basePay };
  }
  task.occ = occId;
  task.idx = 0;
  task.title = occ.title;
  game.task = task;
  startStep();
}

function startStep() {
  const t = game.task;
  const step = t.steps[t.idx];
  if (step.onStart) step.onStart();
  const color = new THREE.Color(OCCUPATIONS[t.occ].uniform.shirt);
  marker.beamMat.color.copy(color);
  marker.ringMat.color.copy(color);
  marker.group.position.set(step.x, city.groundY(step.x, step.z), step.z);
  marker.group.visible = true;
  $('task-banner').classList.remove('hidden');
  $('task-title').textContent = `${t.title} · step ${t.idx + 1}/${t.steps.length}`;
  $('task-step').textContent = step.label;
}

function completeStep() {
  const t = game.task;
  const step = t.steps[t.idx];
  if (step.onDone) step.onDone();
  sfx.click();
  t.idx += 1;
  if (t.idx < t.steps.length) { startStep(); return; }
  // task complete -> pay
  let pay = t.pay;
  if (t.taxiBonus && game.player.vehicle && game.player.vehicle.data.model === 'taxi') pay = Math.round(pay * 1.3);
  const res = Eco.completeTask(game.state, t.occ, pay);
  sfx.cash();
  toast(`✅ Job done! +${money(res.pay)}`, 'money');
  if (res.rankUp) { sfx.rankUp(); toast(`⭐ Promoted to ${res.rank} ${OCCUPATIONS[t.occ].title}! Pay +15%`, 'good'); }
  game.task = null;
  marker.group.visible = false;
  $('task-banner').classList.add('hidden');
  updateHUD(true);
  const occ = t.occ;
  setTimeout(() => { if (game.state.activeJob === occ && !game.task) newTask(); }, 1200);
}

function cancelTask() {
  game.task = null;
  marker.group.visible = false;
  $('task-banner').classList.add('hidden');
  removePassenger();
  if (game.player.char) game.player.char.setCarrying(false);
}

function setCarrying(on) {
  if (game.task) game.task.carrying = on;
  game.player.char.setCarrying(on && !game.player.vehicle);
}

// Cab passengers
function spawnPassenger(app, at) {
  removePassenger();
  const ch = new Character(app);
  ch.group.position.set(at.x, CURB_Y, at.z);
  scene.add(ch.group);
  game.passenger = { char: ch, state: 'waiting', x: at.x, z: at.z, timer: 0 };
}
function boardPassenger() {
  const ps = game.passenger; const v = game.player.vehicle;
  if (!ps || !v) return;
  v.mesh.add(ps.char.group);
  ps.char.group.position.copy(v.parts.passengerSeat);
  ps.char.group.rotation.set(0, 0, 0);
  ps.char.group.scale.setScalar(v.parts.seatScale);
  ps.char.setPose('sit');
  ps.state = 'riding';
}
function dropPassenger() {
  const ps = game.passenger; const v = game.player.vehicle;
  if (!ps) return;
  scene.add(ps.char.group);
  ps.char.group.scale.setScalar(1);
  ps.char.setPose('stand');
  const f = v ? v.forward : { x: 0, z: 1 };
  const base = v || game.player;
  ps.x = base.x - f.z * 2.2; ps.z = base.z + f.x * 2.2;
  ps.state = 'leaving';
  ps.timer = 4;
  ps.dir = { x: -f.z, z: f.x };
  toast('"Thanks for the ride!" 🚕', '');
}
function removePassenger() {
  const ps = game.passenger;
  if (!ps) return;
  ps.char.group.parent?.remove(ps.char.group);
  ps.char.dispose();
  game.passenger = null;
}
function updatePassenger(dt) {
  const ps = game.passenger;
  if (!ps) return;
  if (ps.state === 'waiting') {
    // wave at the approaching cab
    ps.char.group.position.set(ps.x, CURB_Y, ps.z);
    const P = game.player.vehicle || game.player;
    ps.char.group.rotation.y = Math.atan2(P.x - ps.x, P.z - ps.z);
    ps.char.animate(dt, 0);
    ps.char.armR.rotation.x = -2.6 + Math.sin(game.time * 8) * 0.3;
  } else if (ps.state === 'riding') {
    ps.char.animate(dt, 0);
  } else if (ps.state === 'leaving') {
    ps.x += ps.dir.x * 1.4 * dt; ps.z += ps.dir.z * 1.4 * dt;
    ps.char.group.position.set(ps.x, city.groundY(ps.x, ps.z), ps.z);
    ps.char.group.rotation.y = Math.atan2(ps.dir.x, ps.dir.z);
    ps.char.animate(dt, 1.4);
    ps.timer -= dt;
    if (ps.timer <= 0) removePassenger();
  }
}

// ===========================================================================
// Interaction
// ===========================================================================
function findInteraction() {
  const p = game.player;
  const inCar = !!p.vehicle;
  const pos = inCar ? p.vehicle : p;
  const out = { e: null, f: null };
  // task step
  if (game.task) {
    const step = game.task.steps[game.task.idx];
    const r = inCar ? 6.5 : 3;
    if (dist2(pos, step) < r * r) {
      if (step.vehicle && !inCar) out.e = { text: 'You need a car for this. Press V for the valet', action: null };
      else if (step.auto) out.e = { text: inCar && Math.abs(p.vehicle.speed) > 3 ? `Stop the car to ${step.verb.toLowerCase()}` : step.verb, action: null, auto: true };
      else out.e = { text: step.verb, action: completeStep };
    }
  }
  if (inCar) { out.f = { text: 'Exit vehicle' }; return out; }
  if (!out.e) {
    let best = null; let bd = Infinity;
    // weight > 1 lowers priority (moving citizens shouldn't steal the prompt from fixed places)
    const consider = (x, z, r, text, action, weight = 1) => {
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < r * r && d * weight < bd) { bd = d * weight; best = { text, action }; }
    };
    for (const st of Object.values(STATIONS)) {
      const active = game.state.activeJob === st.occupation;
      consider(st.interact.x, st.interact.z, 2.6, `${st.name}: ${active ? 'on shift' : 'clock in'}`, () => openModal(stationModal(st.id)));
    }
    consider(DEALERSHIP.interact.x, DEALERSHIP.interact.z, 2.6, 'Metro Motors: browse cars', () => openModal(dealerModal()));
    for (const [id, lot] of Object.entries(city.lots)) {
      const def = BUSINESSES[id]; const biz = game.state.businesses[id];
      consider(lot.interact.x, lot.interact.z, 2.8, biz ? `Manage ${def.name}` : `Vacant lot: ${def.name} (${money(def.cost)})`, () => openModal(lotModal(id)));
    }
    for (const c of game.citizens) {
      const label = c.data.employer ? `Chat with ${c.data.name}` : `Talk to ${c.data.name} (looking for work)`;
      consider(c.x, c.z, 2.2, label, () => { c.idle = 3; c.yaw = Math.atan2(p.x - c.x, p.z - c.z); openModal(hireModal(c.data.id)); }, 6);
    }
    out.e = best;
  }
  const v = nearestOwnedVehicle(3.2);
  if (v) out.f = { text: `Get in ${v.model.name}` };
  return out;
}

function interact() {
  if (game.creatorOpen) return;
  const it = game.prompt;
  if (it && it.e && it.e.action) it.e.action();
}

function updatePrompt() {
  const it = findInteraction();
  game.prompt = it;
  const el = $('prompt');
  const parts = [];
  if (it.e) parts.push(it.e.action ? `<kbd>E</kbd><span>${it.e.text}</span>` : `<span>${it.e.text}</span>`);
  if (it.f && !game.player.vehicle) parts.push(`<kbd>F</kbd><span>${it.f.text}</span>`);
  const html = parts.join('<span class="muted">·</span>');
  if (!html || game.creatorOpen || anyOverlay()) { el.classList.add('hidden'); return; }
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.classList.remove('hidden');
}

// ===========================================================================
// Player update (on foot / driving)
// ===========================================================================
function carCirclesAll(excludeVehicle) {
  const out = [];
  for (const v of game.vehicles) if (v !== excludeVehicle) for (const c of v.circles()) out.push({ ...c, speed: Math.abs(v.speed) });
  for (const t of game.traffic) for (const c of t.circles()) out.push({ ...c, speed: t.speed });
  return out;
}

function unstickPlayer() {
  const p = game.player;
  if (p.vehicle) return;
  const r = resolveCircle(p.x, p.z, 0.4, city.colliderCache);
  p.x = r.x; p.z = r.z;
}

function updatePlayer(dt) {
  const p = game.player;
  const { f, r } = axes();
  if (p.vehicle) {
    const v = p.vehicle;
    const input = { throttle: f, steer: r, handbrake: k('Space') && !anyOverlay() };
    const others = carCirclesAll(v);
    const impact = v.update(dt, input, city.colliderCache, others);
    if (impact > 4) { sfx.crash(impact); cam.shake = Math.min(0.6, impact * 0.04); }
    v.syncMesh(city.groundY(v.x, v.z), dt);
    p.x = v.x; p.z = v.z; p.yaw = v.yaw;
    p.char.animate(dt, 0);
    p.char.armL.rotation.z = p.char.armR.rotation.z = -v.steer * 0.4;
    sfx.setEngine(true, v.speed);
    $('veh-speed').textContent = Math.round(Math.abs(v.speed) * 3.6);
    return;
  }
  // on foot
  const sprint = k('ShiftLeft', 'ShiftRight') || touchInput.sprint;
  const speed = sprint ? 7.2 : 3.8;
  const fx = Math.sin(cam.yaw); const fz = Math.cos(cam.yaw);
  // camera-relative movement: forward = (sin, cos), right = (-cos, sin)
  let mx = fx * f - fz * r;
  let mz = fz * f + fx * r;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (game.creatorOpen) { mx = 0; mz = 0; }
  const k2 = Math.min(1, dt * 12);
  p.vx += (mx * speed - p.vx) * k2;
  p.vz += (mz * speed - p.vz) * k2;
  p.x += p.vx * dt; p.z += p.vz * dt;
  const res = resolveCircle(p.x, p.z, 0.4, city.colliderCache);
  p.x = res.x; p.z = res.z;
  for (const c of carCirclesAll(null)) {
    const dx = p.x - c.x; const dz = p.z - c.z; const d = Math.hypot(dx, dz); const min = c.r + 0.4;
    if (d < min && d > 1e-4) { p.x += (dx / d) * (min - d); p.z += (dz / d) * (min - d); }
  }
  p.x = THREE.MathUtils.clamp(p.x, -WORLD_LIMIT, WORLD_LIMIT);
  p.z = THREE.MathUtils.clamp(p.z, -WORLD_LIMIT, WORLD_LIMIT);
  const moving = Math.hypot(p.vx, p.vz);
  if (moving > 0.3 && len > 0.05) p.yaw = lerpAngle(p.yaw, Math.atan2(mx, mz), Math.min(1, dt * 12));
  p.char.group.position.set(p.x, city.groundY(p.x, p.z), p.z);
  p.char.group.rotation.y = p.yaw;
  p.char.animate(dt, moving);
  sfx.setEngine(false, 0);
}

function updateCamera(dt) {
  const p = game.player;
  // Q / R orbit
  if (!anyOverlay() && !isTyping()) {
    if (k('KeyQ')) { cam.yaw += dt * 2; cam.lastDrag = game.time; }
    if (k('KeyR')) { cam.yaw -= dt * 2; cam.lastDrag = game.time; }
  }
  const target = new THREE.Vector3();
  let dist = cam.dist; let pitch = cam.pitch;
  if (game.creatorOpen) {
    const fy = p.yaw;
    const fwd = { x: Math.sin(fy), z: Math.cos(fy) };
    const camRight = { x: fwd.z, z: -fwd.x }; // camera looks back at the player
    target.set(p.x + camRight.x * 0.75, city.groundY(p.x, p.z) + 1.15, p.z + camRight.z * 0.75);
    camera.position.lerp(new THREE.Vector3(p.x + fwd.x * 4.3, target.y + 0.45, p.z + fwd.z * 4.3), Math.min(1, dt * 6));
    camera.lookAt(target);
    return;
  }
  if (p.vehicle) {
    const v = p.vehicle;
    target.set(v.x, v.y + 1.3, v.z);
    if (game.time - cam.lastDrag > 1.6) {
      const behind = v.speed < -2 ? v.yaw + Math.PI : v.yaw;
      cam.yaw = lerpAngle(cam.yaw, behind, Math.min(1, dt * 2.5));
      cam.pitch += (0.27 - cam.pitch) * Math.min(1, dt * 2);
    }
    dist = Math.max(cam.dist, 7) + Math.abs(v.speed) * 0.07;
    pitch = cam.pitch;
    camera.fov += ((62 + Math.abs(v.speed) * 0.35) - camera.fov) * Math.min(1, dt * 3);
  } else {
    target.set(p.x, city.groundY(p.x, p.z) + 1.55, p.z);
    camera.fov += (62 - camera.fov) * Math.min(1, dt * 3);
  }
  camera.updateProjectionMatrix();
  const cp = Math.cos(pitch);
  const desired = new THREE.Vector3(
    target.x - Math.sin(cam.yaw) * dist * cp,
    target.y + Math.sin(pitch) * dist,
    target.z - Math.cos(cam.yaw) * dist * cp,
  );
  if (desired.y < 0.6) desired.y = 0.6;
  camera.position.lerp(desired, p.vehicle ? Math.min(1, dt * 10) : 1);
  if (cam.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * cam.shake;
    camera.position.y += (Math.random() - 0.5) * cam.shake;
    cam.shake = Math.max(0, cam.shake - dt * 2);
  }
  camera.lookAt(target);
  // keep the shadow camera centred on the action
  sun.position.set(target.x + 45, target.y + 90, target.z + 30);
  sun.target.position.set(target.x, 0, target.z);
}

// ===========================================================================
// Multiplayer (optional — only active when a server URL is configured)
//
//   ?server=wss://metroventure-city.you.workers.dev/ws?room=metro-1
//
// Remote players are a render-only projection of what the server tells us. We do
// not simulate them, own their state, or resolve collisions against them.
// ===========================================================================
const remotes = new Map();
let net = null;

function remoteLabel(title, sub) {
  const tex = makeTextTexture([title, sub], { width: 320, height: 96, bg: 'rgba(15,23,42,0.82)', fg: '#38bdf8', font: 'bold 38px system-ui, sans-serif' });
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.72, 1);
  sprite.position.y = 2.45;
  sprite.renderOrder = 10;
  return { sprite, mat, tex };
}

function ensureRemote(peer) {
  let r = remotes.get(peer.id);
  if (r) {
    if (peer.app) r.char.setAppearance({ ...DEFAULT_APPEARANCE, ...peer.app });
    return r;
  }
  const app = { ...DEFAULT_APPEARANCE, ...(peer.app || {}) };
  const char = new Character(app);
  const label = remoteLabel(peer.name || 'Citizen', 'Online');
  char.group.add(label.sprite);
  char.group.position.set(peer.x ?? 0, city.groundY(peer.x ?? 0, peer.z ?? 0), peer.z ?? 0);
  scene.add(char.group);
  r = {
    id: peer.id,
    name: peer.name || 'Citizen',
    char,
    label,
    x: peer.x ?? 0,
    z: peer.z ?? 0,
    yaw: peer.yaw ?? 0,
    car: null,
    carModel: null,
    carColor: null,
  };
  remotes.set(peer.id, r);
  return r;
}

function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  try { r.char.group.removeFromParent(); } catch { try { scene.remove(r.char.group); } catch {} }
  try { r.char.dispose(); } catch {}
  try { r.label.mat.dispose(); } catch {}
  try { r.label.tex.dispose?.(); } catch {}
  if (r.car) {
    try { r.car.removeFromParent(); } catch { try { scene.remove(r.car); } catch {} }
    try { r.car.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
    }); } catch {}
  }
  remotes.delete(id);
}

function updateRemotes(dt) {
  for (const r of remotes.values()) {
    const peer = net?.peers.get(r.id);
    const visible = !!(peer && peer.visible);
    if (!visible) {
      r.char.group.visible = false;
      if (r.car) r.car.visible = false;
      continue;
    }
    // Dumb interpolation: enough to hide a 5 Hz snapshot rate, no prediction.
    const k = Math.min(1, dt * 9);
    r.x += (peer.tx - r.x) * k;
    r.z += (peer.tz - r.z) * k;
    r.yaw = lerpAngle(r.yaw, peer.tyaw, Math.min(1, dt * 10));

    const inCar = peer.veh && VEHICLE_MODELS[peer.veh] ? peer.veh : null;
    if (inCar) {
      const color = peer.app?.shirt || '#38bdf8';
      if (!r.car || r.carModel !== inCar || r.carColor !== color) {
        if (r.car) { try { r.car.removeFromParent(); } catch { try { scene.remove(r.car); } catch {} } try { r.car.traverse((o) => { o.geometry?.dispose?.(); }); } catch {} }
        r.car = buildCarMesh(inCar, color).group;
        r.carModel = inCar;
        r.carColor = color;
        scene.add(r.car);
      }
      r.car.visible = true;
      r.car.position.set(r.x, city.groundY(r.x, r.z), r.z);
      r.car.rotation.y = r.yaw;
      r.char.group.visible = false;
    } else {
      if (r.car) r.car.visible = false;
      r.char.group.visible = true;
      r.char.group.position.set(r.x, city.groundY(r.x, r.z), r.z);
      r.char.group.rotation.y = r.yaw;
      r.char.animate(dt, peer.mv ? 4.2 : 0);
    }
  }
}

// --- identity (name + PIN) -------------------------------------------------
// The PIN is only sent to the server; the browser keeps a session token instead.
const IDENTITY_KEY = 'metroventure_identity';
let cityServerUrl = null;

function loadIdentity() {
  try { return JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null'); } catch { return null; }
}
function saveIdentity(identity) {
  try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* private mode */ }
}
function forgetIdentity() {
  try { localStorage.removeItem(IDENTITY_KEY); } catch { /* private mode */ }
}

const AUTH_MESSAGES = {
  bad_name: 'Names are 3–16 characters: letters, numbers, spaces, dots, dashes or underscores.',
  bad_pin: 'PINs are 4–32 letters or numbers.',
  name_taken: 'That name already belongs to someone. Try another, or use their PIN if it is yours.',
  bad_credential: 'Wrong name or PIN.',
  locked: 'Too many wrong PINs. Wait a minute and try again.',
  slow_down: 'Slow down a moment, then try again.',
  session_expired: 'Your session expired. Please sign in again.',
  already_online: 'That account is already playing in this city. Close the other tab first.',
  logged_out: 'Signed out.',
  connect_failed: 'Could not reach the city server. Playing offline instead.',
};

function showLogin(message) {
  game.loginOpen = true;
  const saved = loadIdentity();
  $('login-name').value = saved?.name || game.state.appearance.name || '';
  $('login-pin').value = '';
  loginError(message || '');
  $('login').classList.remove('hidden');
  setTimeout(() => { ($('login-name').value ? $('login-pin') : $('login-name')).focus(); }, 30);
}
function hideLogin() {
  game.loginOpen = false;
  $('login').classList.add('hidden');
}
function loginError(message, kind = '') {
  const el = $('login-error');
  el.textContent = message || '';
  el.classList.toggle('hidden', !message);
  el.classList.toggle('info', kind === 'info');
}
function applyPlayerName(name) {
  if (!name) return;
  game.state.appearance.name = name;
  const field = $('cc-name');
  if (field && document.activeElement !== field) field.value = name;
  updateHUD(true);
}

function startNet(identity = null) {
  if (!cityServerUrl) return;
  if (net) { net.disconnect(); net = null; }
  net = new NetClient({
    url: cityServerUrl,
    identity,
    appearance: game.state.appearance,
    handlers: {
      onStatus(status) {
        if (status === 'online') toast('🌐 Joined the city server', 'good');
        else if (status === 'reconnecting') toast('🌐 Connection lost — retrying…', 'bad');
        updateHUD(true);
      },
      onAuth(auth) {
        saveIdentity({ name: auth.name, token: auth.token });
        applyPlayerName(auth.name);
        loginError('');
        $('btn-account').classList.add('on');
        toast(auth.created ? `🪪 Account created — welcome, ${auth.name}` : `🪪 Signed in as ${auth.name}`, 'good');
      },
      onAuthError(code, msg) {
        if (code === 'session_expired' || code === 'logged_out') forgetIdentity();
        if (code === 'session_expired') return; // onAuthRequired will ask again
        loginError(AUTH_MESSAGES[code] || `Sign-in failed (${code}).`);
        if (!game.loginOpen) showLogin(AUTH_MESSAGES[code] || `Sign-in failed (${code}).`);
        if (code === 'connect_failed') { /* handled below */ }
        updateHUD(true);
      },
      onAuthRequired() { if (!game.loginOpen) showLogin(); },
      onWelcome(msg) {
        for (const p of msg.peers) ensureRemote(p);
        hideLogin();
        applyPlayerName(msg.you?.name);
        if (msg.restore && !game.player.vehicle) {
          game.player.x = msg.restore.x; game.player.z = msg.restore.z;
          game.player.yaw = msg.restore.yaw;
          game.player.vx = game.player.vz = 0;
          game.player.char.group.position.set(msg.restore.x, city.groundY(msg.restore.x, msg.restore.z), msg.restore.z);
          cam.yaw = msg.restore.yaw;
        }
        toast(`🌐 ${msg.room} · ${msg.peers.length + 1} ${msg.peers.length ? 'players' : 'player'} online`, 'good');
        updateHUD(true);
      },
      onJoin(peer) { ensureRemote(peer); },
      onLeave(id) { removeRemote(id); },
      onChat(msg) { toast(`${msg.name}: ${msg.m}`, ''); },
      onError(err) {
        if (err.code === 'rate_limited') return;
        console.warn('[net]', err);
        if (err.code === 'connect_failed') toast('City server unreachable — still playable offline.', 'bad');
      },
    },
  });
  net.connect();
  window.__mv.net = net;
  window.__mv.remotes = remotes;
  window.__mv.identity = () => loadIdentity();
}

// Sign-in card controls
$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('login-name').value.trim();
  const pin = $('login-pin').value;
  if (name.length < 3) return loginError(AUTH_MESSAGES.bad_name);
  if (pin.length < 4) return loginError(AUTH_MESSAGES.bad_pin);
  loginError('Connecting…', 'info');
  applyPlayerName(name);
  if (net) net.signIn(name, pin);
  else startNet({ mode: 'credential', name, pin });
});
$('login-guest').addEventListener('click', () => {
  const name = $('login-name').value.trim() || game.state.appearance.name || 'Guest';
  hideLogin();
  if (net) net.playAsGuest(name);
  else startNet({ mode: 'guest', name });
});
$('login-offline').addEventListener('click', () => {
  hideLogin();
  if (net) net.disconnect();
  net = null;
  cityServerUrl = null;
  toast('Playing offline. Reload to sign in again.', '');
  updateHUD(true);
});
$('btn-account').addEventListener('click', () => {
  if (game.loginOpen) return hideLogin();
  showLogin(net?.account ? `Signed in as ${net.name}. Enter a PIN to sign in as someone else.` : '');
});

function netLocalState() {
  const p = game.player;
  const v = p.vehicle;
  return {
    x: p.x,
    z: p.z,
    yaw: p.yaw,
    moving: v ? Math.abs(v.speed) > 0.4 : Math.hypot(p.vx, p.vz) > 0.3,
    vehicle: v ? v.data.model : null,
  };
}

// ===========================================================================
// Minimap
// ===========================================================================
const mm = $('minimap');
const mmCtx = mm.getContext('2d');
const MM_SCALE = 200 / 400;
const mmBase = document.createElement('canvas');
mmBase.width = mmBase.height = 200;
{
  const g = mmBase.getContext('2d');
  const toMM = (v) => (v + 200) * MM_SCALE;
  g.fillStyle = '#3f6b33'; g.fillRect(0, 0, 200, 200);
  g.fillStyle = '#8f9196';
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    const h = BLOCK_HALF + 3;
    g.fillRect(toMM(bx - h), toMM(bz - h), h * 2 * MM_SCALE, h * 2 * MM_SCALE);
  }
  g.fillStyle = '#4b5563';
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    const h = BLOCK_HALF;
    g.fillRect(toMM(bx - h), toMM(bz - h), h * 2 * MM_SCALE, h * 2 * MM_SCALE);
  }
  g.fillStyle = '#1f2937';
  for (const r of ROAD_LINES) {
    g.fillRect(toMM(r - ROAD_HALF), toMM(-157), ROAD_HALF * 2 * MM_SCALE, 314 * MM_SCALE);
    g.fillRect(toMM(-157), toMM(r - ROAD_HALF), 314 * MM_SCALE, ROAD_HALF * 2 * MM_SCALE);
  }
}
function drawMinimap() {
  const g = mmCtx;
  const toMM = (v) => (v + 200) * MM_SCALE;
  g.drawImage(mmBase, 0, 0);
  const dot = (x, z, r, color) => { g.fillStyle = color; g.beginPath(); g.arc(toMM(x), toMM(z), r, 0, Math.PI * 2); g.fill(); };
  const square = (x, z, s, color, label) => {
    g.fillStyle = color; g.fillRect(toMM(x) - s / 2, toMM(z) - s / 2, s, s);
    if (label) { g.fillStyle = '#fff'; g.font = 'bold 9px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, toMM(x), toMM(z) + 0.5); }
  };
  for (const [id, def] of Object.entries(BUSINESSES)) {
    const built = !!game.state.businesses[id];
    square(def.x, def.z, 13, built ? def.color : '#a16207', built ? '★' : '$');
  }
  for (const st of Object.values(STATIONS)) square(st.x, st.z, 13, st.color, st.id[0].toUpperCase());
  square(DEALERSHIP.x, DEALERSHIP.z, 13, DEALERSHIP.color, 'M');
  for (const t of game.traffic) dot(t.x, t.z, 1.6, '#e5e7eb');
  for (const c of game.citizens) dot(c.x, c.z, 1.6, c.data.employer ? '#4ade80' : '#fde047');
  for (const v of game.vehicles) if (v !== game.player.vehicle) dot(v.x, v.z, 2.6, '#38bdf8');
  if (game.task) {
    const st = game.task.steps[game.task.idx];
    const pulse = 3 + Math.sin(game.time * 6) * 1.2;
    g.strokeStyle = '#f43f5e'; g.lineWidth = 2;
    g.beginPath(); g.arc(toMM(st.x), toMM(st.z), pulse + 2, 0, Math.PI * 2); g.stroke();
    dot(st.x, st.z, 2.5, '#f43f5e');
  }
  if (net) for (const r of remotes.values()) if (net.peers.get(r.id)?.visible) dot(r.x, r.z, 2.4, '#38bdf8');
  // player arrow
  const p = game.player;
  g.save();
  g.translate(toMM(p.x), toMM(p.z));
  g.rotate(-p.yaw + Math.PI); // yaw 0 faces +z (down on the map)
  g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath();
  g.fill(); g.stroke();
  g.restore();
}

// ===========================================================================
// Main loop
// ===========================================================================
const clock = new THREE.Clock();
let mmTimer = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.time += dt;
  const s = game.state;

  updatePlayer(dt);
  if (net) { net.update(dt, netLocalState()); updateRemotes(dt); }

  // owned parked vehicles coast to a stop & stay out of walls
  for (const v of game.vehicles) {
    if (v === game.player.vehicle) continue;
    if (Math.abs(v.speed) > 0.05 || Math.hypot(v.vx, v.vz) > 0.05) {
      v.update(dt, { throttle: 0, steer: 0, handbrake: true }, city.colliderCache, []);
      v.syncMesh(city.groundY(v.x, v.z), dt);
    }
  }

  // traffic
  const obstacles = [];
  if (game.player.vehicle) for (const c of game.player.vehicle.circles()) obstacles.push({ x: c.x, z: c.z, kind: 'player', r: c.r });
  else obstacles.push({ x: game.player.x, z: game.player.z, kind: 'player', r: 0.4 });
  for (const c of game.citizens) obstacles.push({ x: c.x, z: c.z, kind: 'ped', r: 0.4 });
  if (game.passenger && game.passenger.state !== 'riding') obstacles.push({ x: game.passenger.x, z: game.passenger.z, kind: 'ped', r: 0.4 });
  for (const v of game.vehicles) if (v !== game.player.vehicle) for (const c of v.circles()) obstacles.push({ x: c.x, z: c.z, kind: 'car', r: c.r });
  for (const t of game.traffic) for (const c of t.circles()) obstacles.push({ x: c.x, z: c.z, kind: 'car', r: c.r, self: t });
  for (const t of game.traffic) {
    t.update(dt, obstacles);
    if (t.wantsHonk && dist2(t, game.player) < 900) sfx.horn();
  }

  // citizens
  const circles = carCirclesAll(null);
  for (const c of game.citizens) c.update(dt, circles);

  updatePassenger(dt);

  // auto-completing task steps (cab pickups / drop-offs)
  if (game.task && !anyOverlay()) {
    const step = game.task.steps[game.task.idx];
    const v = game.player.vehicle;
    if (step.auto && v && Math.abs(v.speed) < 3 && dist2(v, step) < 6.5 * 6.5) completeStep();
  }
  if (game.task) {
    const step = game.task.steps[game.task.idx];
    const from = game.player.vehicle || game.player;
    $('task-dist').textContent = `${Math.round(Math.sqrt(dist2(from, step)))} m`;
    let pay = game.task.pay;
    if (game.task.taxiBonus && game.player.vehicle?.data.model === 'taxi') pay = Math.round(pay * 1.3);
    $('task-pay').textContent = `${money(Math.round(pay * Eco.payMultiplier(s.jobXP[game.task.occ] || 0)))}`;
    marker.arrow.position.y = 3.2 + Math.sin(game.time * 3) * 0.35;
    marker.arrow.rotation.y = game.time * 2;
  }

  // economy
  const pay = Eco.tickPayroll(s, dt);
  if (pay) {
    if (pay.total > 0) { sfx.cash(); toast(`💼 Payday (day ${s.stats.day}): +${money(pay.total)} profit stored at your startups`, 'money'); }
    else if (Eco.builtCount(s) && !Eco.employedCount(s)) toast('Your startups have no workers. Hire citizens to earn profit!', '');
    if (game.modal) renderModal();
  }
  game.valetCooldown = Math.max(0, game.valetCooldown - dt);
  game.autosaveTimer -= dt;
  if (game.autosaveTimer <= 0) { game.autosaveTimer = 60; saveGame(true); }

  for (const [i, car] of displayCars.entries()) car.rotation.y += dt * (0.25 + i * 0.05);
  city.update(game.time);
  updatePrompt();
  updateCamera(dt);
  updateHUD();
  mmTimer -= dt;
  if (mmTimer <= 0) { mmTimer = 1 / 15; drawMinimap(); }
  renderer.render(scene, camera);
}

// ===========================================================================
// Boot
// ===========================================================================
function boot() {
  game.state = Eco.createInitialState();
  const hasSave = !!localStorage.getItem(SAVE_KEY);
  let loaded = false;
  if (hasSave) {
    loaded = loadGame(true);
    if (!loaded) updateHUD(true);
  } else {
    applyState();
  }
  if (!game.state.seenHelp) showHelp();
  else if (loaded) toast(`Welcome back, ${game.state.appearance.name}!`, 'good');
  else if (hasSave && !loaded) {
    // failure toast already shown by loadGame; no extra welcome
  } else if (!hasSave) {
    // fresh install with no save: welcome is the help card
  }
  discoverServerUrl().then((serverUrl) => {
    if (!serverUrl) return;
    cityServerUrl = serverUrl;
    const saved = loadIdentity();
    if (saved?.token) startNet({ mode: 'token', token: saved.token, name: saved.name });
    else if (game.helpOpen) pendingLogin = true; // ask once the welcome card is dismissed
    else showLogin();
  });
  camera.position.set(game.player.x - 6, 5, game.player.z - 6);
  frame();
}

window.addEventListener('beforeunload', () => { if (game.state) saveGame(true); });
boot();
