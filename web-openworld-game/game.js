// MetroVenture 3D — main entry: renderer, game loop, player, NPCs, jobs, startups, vehicles, UI.
import * as THREE from 'three';
import {
  SAVE_KEY, OCCUPATIONS, BUSINESSES, STATIONS, DEALERSHIP, BOUTIQUE, UNIVERSITY, VEHICLE_MODELS, CAR_COLORS, MAX_BUSINESS_LEVEL,
  SKIN_TONES, SHIRT_COLORS, PANTS_COLORS, SHOE_COLORS, HAIR_COLORS, HAIR_STYLES, BUILDS, TOTAL_CITIZENS, ROAD_LINES,
  ROAD_HALF, WORLD_LIMIT, BLOCK_CENTERS, BLOCK_HALF, DEFAULT_APPEARANCE,
  FUEL_STATIONS, TOW_PRICE, MOTORS_REPAIR_MARKUP,
  ROADSIDE_CALLOUT_FEE, ROADSIDE_FUEL_FEE, ROADSIDE_FUEL_AMOUNT, TELEMETRY_HZ,
  EMOTES, CAR_LIVERIES, RIM_FINISHES, UNDERGLOW_OPTIONS, RESPRAY_COST, CLOTHING_ITEMS, OUTFIT_BUNDLES,
  CAM_COCKPIT_YAW_MAX, BUILD_ITEMS, BUILD_COLORS, BUILD_STORY_H, MAX_CUSTOM_BUILDS,
} from './src/data.js';
import * as Eco from './src/economy.js';
import * as VCond from './src/vehicleCond.js';
import * as Time from './src/time.js';
import * as VCard from './src/vehCard.js';
import * as Heat from './src/heat.js';
import * as Cust from './src/customization.js';
import * as Cam from './src/camera.js';
import * as Uni from './src/university.js';
import * as Build from './src/build.js';
import * as Interiors from './src/interiors.js';
import * as Props from './src/props.js';
import * as Places from './src/publicPlaces.js';
import { Character } from './src/character.js';
import { City, resolveCircle, makeTextTexture, CURB_Y } from './src/world.js';
import { Vehicle, TrafficCar, PoliceCar, buildCarMesh, setVehicleNightFactor } from './src/vehicles.js';
import { setupRealisticAtmosphere } from './src/textures.js';
import { StreetFX } from './src/fx.js';
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
scene.fog = new THREE.Fog(SKY, 130, 380);
const atmosphere = setupRealisticAtmosphere(renderer, scene);
const streetFX = new StreetFX(scene);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x4d6b35, 1.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// Single real headlight attached only to the player's currently driven car (UPGRADE_PLAN.md §11 D2)
const playerHeadlight = new THREE.SpotLight(0xfffbeb, 0, 48, 0.54, 0.45, 1.35);
playerHeadlight.castShadow = false;
playerHeadlight.visible = false;
let currentSunOffset = { x: 45, y: 90, z: 30 };
let currentNightFactor = 0;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===========================================================================
// Audio (tiny WebAudio synth, no assets)
// ===========================================================================
const sfx = {
  ctx: null, muted: false, engine: null, skid: null, siren: null,
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

    // Tyre screech continuous synth
    const sOsc = this.ctx.createOscillator();
    const sFilt = this.ctx.createBiquadFilter();
    const sGain = this.ctx.createGain();
    sOsc.type = 'sawtooth';
    sOsc.frequency.value = 780;
    sFilt.type = 'bandpass';
    sFilt.frequency.value = 1150;
    sFilt.Q.value = 4.5;
    sGain.gain.value = 0;
    sOsc.connect(sFilt).connect(sGain).connect(this.ctx.destination);
    sOsc.start();
    this.skid = { osc: sOsc, gain: sGain };

    // Police wail siren continuous synth
    const pOsc = this.ctx.createOscillator();
    const pGain = this.ctx.createGain();
    pOsc.type = 'triangle';
    pOsc.frequency.value = 680;
    pGain.gain.value = 0;
    pOsc.connect(pGain).connect(this.ctx.destination);
    pOsc.start();
    this.siren = { osc: pOsc, gain: pGain };
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
  crash(v) {
    this.tone(70 + Math.random() * 40, 0.25, 'sawtooth', Math.min(0.25, v * 0.02));
    if (v > 7) this.tone(180 + Math.random() * 90, 0.14, 'square', Math.min(0.12, v * 0.01));
  },
  explosion() {
    this.tone(48, 0.85, 'sawtooth', 0.28);
    this.tone(82, 0.55, 'triangle', 0.22, 0.04);
    this.tone(145, 0.32, 'square', 0.14, 0.08);
  },
  jump() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.12);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.15);
  },
  click() { this.tone(660, 0.05, 'square', 0.04); },
  door() {
    this.tone(150, 0.1, 'triangle', 0.06);
    this.tone(96, 0.22, 'sine', 0.05, 0.05);
  },
  error() { this.tone(180, 0.18, 'square', 0.06); },
  rankUp() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, i * 0.09)); },
  stall() { this.tone(150, 0.25, 'sawtooth', 0.09); this.tone(85, 0.45, 'sawtooth', 0.09, 0.18); },
  pump() { for (let i = 0; i < 6; i++) this.tone(280 + i * 45, 0.09, 'square', 0.05, i * 0.28); },
  wrench() { [0, 0.22, 0.44, 0.66].forEach((w, i) => this.tone(210 + (i % 2) * 70, 0.09, 'square', 0.05, w)); },
  fuelTick() { this.tone(940, 0.035, 'sine', 0.045); },
  setEngine(on, speed) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.gain.gain.setTargetAtTime(on && !this.muted ? 0.035 : 0, t, 0.1);
    this.engine.osc.frequency.setTargetAtTime(45 + Math.abs(speed) * 5.5, t, 0.08);
  },
  setSkid(on, factor = 0.5) {
    if (!this.skid) return;
    const t = this.ctx.currentTime;
    this.skid.gain.gain.setTargetAtTime(on && !this.muted ? 0.024 * factor : 0, t, 0.06);
    this.skid.osc.frequency.setTargetAtTime(690 + factor * 260 + Math.sin(t * 28) * 35, t, 0.05);
  },
  setSiren(on, elapsed = 0, proximity = 1) {
    if (!this.siren) return;
    const t = this.ctx.currentTime;
    const vol = on && !this.muted ? 0.042 * Math.max(0.2, Math.min(1, proximity)) : 0;
    this.siren.gain.gain.setTargetAtTime(vol, t, 0.08);
    if (on) {
      const wail = 640 + (Math.sin(elapsed * 4.6) * 0.5 + 0.5) * 360;
      this.siren.osc.frequency.setTargetAtTime(wail, t, 0.05);
    }
  },
};

// ===========================================================================
// World
// ===========================================================================
const city = new City(scene);
const navNodes = city.navNodes;

// Showroom display cars at Metro Motors (Valkyrie X12 Hypercar, Benz G-Wagen 4x4, Aero Spider Convertible)
const SHOWROOM_SPECS = [
  { model: 'hyper', color: '#dc2626', opts: { livery: 'carbon_hood', rims: 'gold', underglow: 'cyan' } },
  { model: 'gwagen', color: '#111827', opts: { livery: 'gold_trim', rims: 'gold', underglow: 'gold' } },
  { model: 'roadster', color: '#2563eb', opts: { livery: 'twin_stripe', rims: 'silver', underglow: 'purple' } },
];
const displayCarParts = SHOWROOM_SPECS.map((spec, i) => {
  const parts = buildCarMesh(spec.model, spec.color, spec.opts);
  const spot = city.dealerDisplays[i];
  parts.group.position.set(spot.x, CURB_Y + 0.26, spot.z);
  parts.group.rotation.y = spot.yaw;
  scene.add(parts.group);
  return parts;
});
const displayCars = displayCarParts.map((p) => p.group);

// Dressed 3D fashion mannequins on Maison Verve Boutique display pedestals
const boutiqueMannequins = (city.boutiqueDisplays || []).map((spot, i) => {
  const bundle = OUTFIT_BUNDLES[i % OUTFIT_BUNDLES.length];
  const app = { ...DEFAULT_APPEARANCE, skin: ['#8d5524', '#c68642', '#4a2c11'][i % 3], ...(bundle.colors || {}) };
  for (const [slot, id] of bundle.items) {
    const def = CLOTHING_ITEMS[slot]?.[id];
    if (def) app[def.field] = id;
  }
  const ch = new Character(app);
  ch.group.position.set(spot.x, spot.y, spot.z);
  ch.group.rotation.y = spot.yaw;
  ch.setEmote(['flex', 'peace', 'wave'][i % 3]);
  scene.add(ch.group);
  return ch;
});

// Resident 3D University Faculty & Scholars inside Metro Grand University's walk-in halls
const campusActors = [
  { x: 0,   z: -224.0, yaw: 0,           emote: 'wave',  app: { ...DEFAULT_APPEARANCE, skin: '#4a2c11', topStyle: 'gown', hatStyle: 'mortarboard', shirt: '#1e3a8a', hatColor: '#0f172a', glasses: 'wayfarer' } },
  { x: -18, z: -204.2, yaw: 0,           emote: 'peace', app: { ...DEFAULT_APPEARANCE, skin: '#c68642', topStyle: 'suit', shirt: '#1e293b', pants: '#0f172a' } },
  { x: -57, z: -219.4, yaw: 0,           emote: null,    app: { ...DEFAULT_APPEARANCE, skin: '#8d5524', topStyle: 'senator', shirt: '#7c2d12', glasses: 'wayfarer' } },
  { x: 57,  z: -217.5, yaw: Math.PI,     emote: null,    app: { ...DEFAULT_APPEARANCE, skin: '#f1c27d', topStyle: 'suit', shirt: '#f8fafc', pants: '#1e293b' } },
].map((sp) => {
  const ch = new Character(sp.app);
  ch.group.position.set(sp.x, CURB_Y, sp.z);
  ch.group.rotation.y = sp.yaw;
  if (sp.emote) ch.setEmote(sp.emote);
  scene.add(ch.group);
  return ch;
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
  player: { char: null, x: 0, z: 0, y: 0.1, yaw: 0, vx: 0, vz: 0, vy: 0, onGround: true, vehicle: null },
  vehicles: [],
  citizens: [],
  traffic: [],
  police: [],
  heat: Heat.createHeatState(),
  fx: streetFX,
  atmosphere,
  task: null,
  passenger: null,
  modal: null,
  modalShop: null, // { name, markup, x, z } — set while the mechanic modal is open
  creatorOpen: false,
  helpOpen: false,
  loginOpen: false,
  elapsed: 0,
  time: null,      // window.__mv.time = { now(), set(inGameMs), fastForwardTo(inGameMs), phase(), label() }
  telemetry: null, // window.__mv.telemetry = () => snapshot of all owned vehicles' cond
  camera,
  cameraView: null,
  university: Uni,
  inside: null,        // { id, level, building } while standing inside a walk-in building
  buildMode: false,
  buildItem: 'wall_solid',
  buildColor: BUILD_COLORS[0],
  buildRot: 0,
  buildLift: 0,
  buildGroup: null,
  buildGhost: null,
  buildMeshes: new Map(),
  buildSurfaces: [],
  elevatorBuilding: null,
  seat: null,          // { spot, pose, yOffset } while sitting / lying on furniture
  nearDoor: null,      // door the player is standing next to
  placeService: null,  // public-place id whose service desk is open
  emotes: EMOTES,
  valetCooldown: 0,
  autosaveTimer: 60,
  prompt: null,
};
window.__mv = game; // handy for debugging in the console
game.renderer = renderer;

let debugClockOverride = null; // optional QA override when window.__mv.time.set(ms) is used while online
let lastShiftIndex = null;
let dayNightTimer = 0;
let clockHudTimer = 0;
let telemetryTimer = 0;
let fuelTickTimer = 0;

/** Single authoritative clock source (server-sourced when online, local fallback offline). */
function getClock() {
  if (debugClockOverride) return Time.inGameNowMs(debugClockOverride, Date.now());
  const srv = net?.clockNow?.();
  if (srv != null) return srv;
  return Time.inGameNowMs(game.state?.clock, Date.now());
}

function updateDayNight(inGameMs, force = false) {
  if (!force && dayNightTimer > 0) return;
  dayNightTimer = 0.1;
  const L = Time.lightingAt(inGameMs);
  currentNightFactor = L.night;
  currentSunOffset = L.sunOffset;
  SKY.setHex(L.skyHex);
  scene.fog.color.copy(SKY);
  hemi.color.setHex(L.hemiSkyHex);
  hemi.groundColor.setHex(L.hemiGroundHex);
  hemi.intensity = L.hemiIntensity;
  sun.color.setHex(L.sunHex);
  sun.intensity = L.sunIntensity;
  sun.castShadow = L.shadows;
  city.setDayNight(L.night, L.lampFactor, game.player.x, game.player.z);
  setVehicleNightFactor(L.night);
  atmosphere.update(L, game.elapsed, game.player.x, game.player.z);
  const nightBeams = L.night > 0.08;
  for (const p of displayCarParts) p.headBeams.visible = nightBeams;
  const pv = game.player.vehicle;
  const headOn = !!(pv && pv.cond.hp > 0 && pv.cond.fuel > 0 && nightBeams);
  playerHeadlight.visible = headOn;
  playerHeadlight.intensity = headOn ? 4.8 * L.night : 0;
}

function ensureWarnState(v) {
  if (!v.warnState) v.warnState = VCard.createWarningState(v.cond);
  return v.warnState;
}

function updateVehicleTelemetry(dt, force = false) {
  const v = game.player.vehicle;
  if (!v) return;
  const tracker = ensureWarnState(v);
  // Low-fuel (<10%) tick SFX while driving, capped at 3 s per episode (§9 A)
  const fuelCritDriving = v.cond.hp > 0 && v.cond.fuel > 0 && v.cond.fuel < 10 && Math.abs(v.speed) > 0.4;
  if (fuelCritDriving && tracker.fuelTickElapsed < 3.0) {
    tracker.fuelTickElapsed += dt;
    fuelTickTimer -= dt;
    if (fuelTickTimer <= 0) {
      fuelTickTimer = 0.6;
      sfx.fuelTick();
    }
  } else if (!fuelCritDriving) {
    fuelTickTimer = 0;
  }

  telemetryTimer -= dt;
  if (!force && telemetryTimer > 0) return;
  telemetryTimer = 1 / TELEMETRY_HZ;

  for (const { key } of VCard.TELEMETRY_BARS) {
    const val = Math.max(0, Math.min(100, v.cond[key]));
    const { cls } = VCard.barTier(val);
    const barEl = $(`vbar-${key}`);
    const pctEl = $(`vpct-${key}`);
    if (barEl) {
      barEl.style.width = `${val.toFixed(1)}%`;
      if (barEl.className !== cls) barEl.className = cls;
    }
    if (pctEl) pctEl.textContent = `${Math.round(val)}%`;
  }
  const step = VCard.stepWarnings(tracker, v.cond);
  for (const alert of step.alerts) toast(alert.msg, alert.kind);
  $('vicon-fuel')?.classList.toggle('blink', step.fuelBlink);
  $('veh-fault')?.classList.toggle('hidden', !step.engineFault);
}

game.time = {
  now: () => getClock(),
  set(inGameMs) {
    const target = Math.max(0, Number(inGameMs) || 0);
    if (game.state?.clock) Time.setClock(game.state.clock, target, Date.now());
    debugClockOverride = net?.connected ? Time.createClock(Date.now(), target, Time.CLOCK_SPEED) : null;
    lastShiftIndex = Time.shiftIndex(target);
    if (game.state?.stats) {
      game.state.stats.day = Time.dayOf(target);
      game.state.stats.payrollTimer = Time.secondsToNextShift(target);
    }
    updateDayNight(target, true);
    updateHUD(true);
    return Time.clockLabel(target);
  },
  fastForwardTo(inGameMs) {
    if (game.state?.clock) Time.fastForwardTo(game.state.clock, inGameMs, Date.now());
    const cur = getClock();
    lastShiftIndex = Time.shiftIndex(cur);
    updateDayNight(cur, true);
    updateHUD(true);
    return Time.clockLabel(cur);
  },
  phase: () => Time.phase(getClock()),
  label: () => Time.clockLabel(getClock()),
};
game.telemetry = () => VCard.telemetrySnapshot(game.vehicles);

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
          if (c.isPlayer && c.speed > 7) triggerOffense('pedScare');
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
    scene.remove(this.char.group);
    this.char.dispose();
    if (this.labelMat.map) this.labelMat.map.dispose();
    this.labelMat.dispose();
  }
}

// ===========================================================================
// State application (new game / load)
// ===========================================================================
function applyState() {
  const s = game.state;
  cancelTask();
  // lots
  for (const id of Object.keys(BUSINESSES)) city.updateLot(id, s.businesses[id]);
  city.rebuildColliderCache();
  // player
  const p = game.player;
  if (p.vehicle) detachFromVehicle();
  game.seat = null;
  p.char.seat = null;
  p.char.stopAction();
  p.char.setPose('stand');
  if (!s.leisure) s.leisure = Props.createLeisureState();
  p.char.setAppearance(s.appearance);
  p.char.setOccupation(s.activeJob);
  p.char.setCarrying(false);
  p.x = s.player.x; p.z = s.player.z; p.yaw = s.player.yaw; p.vx = p.vz = 0;
  s.builds = Build.normalizeBuildState(s.builds);
  rebuildBuildWorld();
  p.y = Number.isFinite(s.player.y) ? s.player.y : city.groundY(p.x, p.z);
  p.vy = 0; p.onGround = true;
  Cam.setCameraMode(cam, s.player?.cameraMode, false, p.yaw);
  // vehicles
  for (const v of game.vehicles) v.dispose();
  game.vehicles = s.vehicles.map((d) => {
    const veh = new Vehicle(scene, d);
    veh.warnState = VCard.createWarningState(veh.cond);
    return veh;
  });
  for (const v of game.vehicles) v.syncMesh(city.groundY(v.x, v.z));
  // police & street heat reset on load/new game
  clearPolice();
  game.heat = Heat.createHeatState();
  // citizens
  for (const c of game.citizens) c.dispose();
  game.citizens = s.citizens.map((d) => new CitizenAgent(d));
  const nowInGame = getClock();
  lastShiftIndex = Time.shiftIndex(nowInGame);
  s.stats.day = Time.dayOf(nowInGame);
  s.stats.payrollTimer = Time.secondsToNextShift(nowInGame, s.clock?.speed);
  updateDayNight(nowInGame, true);
  if (s.player.inVehicle) {
    const v = game.vehicles.find((x) => x.data.id === s.player.inVehicle);
    if (v && v.cond.hp > 0) enterVehicle(v, true);
  }
  syncCameraViewMode();
  if (s.activeJob) newTask();
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
  s.player.y = game.seat ? game.seat.spot.y : p.y;
  s.player.yaw = p.yaw;
  s.player.cameraMode = cam.mode;
  if (s.clock) Time.setClock(s.clock, getClock(), Date.now());
}

function saveGame(silent = false) {
  try {
    snapshotState();
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.state));
    if (!silent) toast('💾 Game saved', 'good');
    return true;
  } catch (err) {
    toast(`Save failed: ${err.message}`, 'bad');
    return false;
  }
}

function loadGame(silent = false) {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { if (!silent) toast('No save found yet. Press F5 to save.', 'bad'); return false; }
  try {
    game.state = Eco.migrateState(JSON.parse(raw));
    applyState();
    if (!silent) toast('📂 Save loaded', 'good');
    return true;
  } catch (err) {
    toast(`Load failed: ${err.message}`, 'bad');
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
const EMOTE_BY_ID = Object.fromEntries(EMOTES.map((e) => [e.id, e]));

function triggerJump() {
  if (game.player.vehicle || game.creatorOpen || anyOverlay()) return;
  if (game.player.char.triggerJump()) sfx.jump();
}

function triggerEmote(id) {
  if (game.seat) return false;
  if (game.player.vehicle) { toast('Step out of the car to perform emotes.', 'bad'); return false; }
  if (game.creatorOpen) return false;
  const def = EMOTE_BY_ID[id];
  if (!def) return false;
  const active = game.player.char.emote === id && def.loop;
  if (active) {
    game.player.char.clearEmote();
    sfx.click();
    return true;
  }
  game.player.char.setEmote(id);
  sfx.click();
  toast(`${def.icon} ${def.name}`, '');
  return true;
}

const keys = new Set();
const touchInput = { x: 0, y: 0, sprint: false, handbrake: false };
const isTyping = () => document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
const anyOverlay = () => !!game.modal || game.helpOpen || game.loginOpen;

window.addEventListener('keydown', (e) => {
  sfx.ensure();
  if (e.code === 'F5') { e.preventDefault(); saveGame(); return; }
  if (e.code === 'F9') { e.preventDefault(); loadGame(); return; }
  if (e.code === 'Escape') {
    if (game.buildMode && !anyOverlay()) { toggleBuildMode(false); return; }
    closeModal(); closeCreator(); hideHelp(); return;
  }
  if (isTyping()) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (game.helpOpen) { if (e.code === 'Enter' || e.code === 'Space') hideHelp(); return; }
  if (game.modal) {
    if (e.code === 'KeyB') closeModal();
    return;
  }
  if (game.buildMode && !anyOverlay()) {
    switch (e.code) {
      case 'KeyE': placeBuildPiece(); return;
      case 'KeyX': demolishBuildPiece(); return;
      case 'KeyQ': game.buildRot = Build.snapRotation(game.buildRot - Math.PI / 2); renderBuildBar(); return;
      case 'KeyR': game.buildRot = Build.snapRotation(game.buildRot + Math.PI / 2); renderBuildBar(); return;
      case 'KeyC': cycleBuildColor(); return;
      case 'Tab': e.preventDefault(); cycleBuildItem(e.shiftKey ? -1 : 1); return;
      case 'PageUp': setBuildLift(1); return;
      case 'PageDown': setBuildLift(-1); return;
      case 'KeyY': toggleBuildMode(false); return;
      default: break;
    }
  }
  if (e.code.startsWith('Digit')) {
    const idx = Number(e.code.slice(5)) - 1;
    if (game.buildMode && idx >= 0 && idx < BUILD_ITEMS.length) {
      game.buildItem = BUILD_ITEMS[idx].id;
      renderBuildBar();
      rebuildBuildGhost();
      return;
    }
    if (idx >= 0 && idx < EMOTES.length && !game.player.vehicle) {
      triggerEmote(EMOTES[idx].id);
      return;
    }
  }
  switch (e.code) {
    case 'KeyE': interact(); break;
    case 'Space':
      if (!game.player.vehicle) {
        if (game.prompt?.e?.action) interact();
        else triggerJump();
      }
      break;
    case 'KeyB': openEmotesModal(); break;
    case 'KeyF': toggleVehicle(); break;
    case 'KeyV': valet(); break;
    case 'KeyT': openGarageModal(); break;
    case 'KeyU': openUniversity(); break;
    case 'KeyY': toggleBuildMode(); break;
    case 'KeyC': game.creatorOpen ? closeCreator() : openCreator(); break;
    case 'KeyX':
    case 'KeyP':
      toggleCameraMode();
      break;
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

// Camera orbit / first-person & 3D car cockpit freelook + live 3D planar mirror rig
const cam = Cam.createCameraState('third');
let mirrorRig = null;

function ensureMirrorRig() {
  if (mirrorRig) return mirrorRig;
  const rtOpts = { depthBuffer: true, stencilBuffer: false };
  mirrorRig = {
    rearRT: new THREE.WebGLRenderTarget(320, 96, rtOpts),
    leftRT: new THREE.WebGLRenderTarget(224, 128, rtOpts),
    rightRT: new THREE.WebGLRenderTarget(224, 128, rtOpts),
    cam: new THREE.PerspectiveCamera(48, 320 / 96, 0.22, 240),
    boundVeh: null,
    needsPrime: true,
    tick: 0,
  };
  return mirrorRig;
}

function renderCockpitMirrors() {
  const v = game.player.vehicle;
  if (!v || cam.mode !== 'first' || game.creatorOpen) return;
  const rig = ensureMirrorRig();
  if (rig.boundVeh !== v) {
    v.setMirrorTextures({
      rear: rig.rearRT.texture,
      left: rig.leftRT.texture,
      right: rig.rightRT.texture,
    });
    rig.boundVeh = v;
    rig.needsPrime = true;
  }

  rig.tick = (rig.tick + 1) % 4;
  let passes;
  if (rig.needsPrime) {
    passes = ['rear', 'left', 'right'];
    rig.needsPrime = false;
  } else {
    const primarySide = cam.cockpitYaw < -0.12 ? 'right' : 'left';
    const secondarySide = primarySide === 'left' ? 'right' : 'left';
    passes = rig.tick === 0 ? ['rear', primarySide, secondarySide] : ['rear', primarySide];
  }

  const prevTarget = renderer.getRenderTarget();
  const prevShadowAuto = renderer.shadowMap.autoUpdate;
  const prevSkyPosX = atmosphere.skyMesh.position.x;
  const prevSkyPosZ = atmosphere.skyMesh.position.z;
  renderer.shadowMap.autoUpdate = false;
  v.setMirrorSurfacesVisible(false);

  const mirrorInput = {
    vx: v.x,
    vy: v.y,
    vz: v.z,
    carYaw: v.yaw,
    bodyPitch: v.parts?.body?.rotation?.x || 0,
    bodyRoll: v.parts?.body?.rotation?.z || 0,
    mirrorAnchors: v.parts?.mirrorAnchors || null,
  };

  for (const which of passes) {
    const rt = which === 'rear' ? rig.rearRT : which === 'left' ? rig.leftRT : rig.rightRT;
    const pose = Cam.computeMirrorCameraPose(which, mirrorInput);
    const mCam = rig.cam;
    mCam.fov = pose.fov;
    mCam.aspect = rt.width / rt.height;
    mCam.updateProjectionMatrix();
    mCam.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    mCam.up.set(0, 1, 0);
    mCam.lookAt(pose.look.x, pose.look.y, pose.look.z);
    if (pose.roll) mCam.rotateZ(pose.roll);

    atmosphere.skyMesh.position.set(pose.pos.x, 0, pose.pos.z);
    const wasCockpitVis = v.parts?.cockpit ? v.parts.cockpit.group.visible : false;
    if (which === 'rear' && v.parts?.cockpit) v.parts.cockpit.group.visible = false;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, mCam);
    if (which === 'rear' && v.parts?.cockpit) v.parts.cockpit.group.visible = wasCockpitVis;
  }

  atmosphere.skyMesh.position.set(prevSkyPosX, 0, prevSkyPosZ);
  v.setMirrorSurfacesVisible(true);
  renderer.setRenderTarget(prevTarget);
  renderer.shadowMap.autoUpdate = prevShadowAuto;
}

function syncCameraViewMode() {
  const v = game.player.vehicle;
  const isFirst = cam.mode === 'first' && !game.creatorOpen;
  const inCockpit = !!(v && isFirst);
  const onFootFP = !!(!v && isFirst);

  const wantNear = isFirst ? 0.06 : 0.1;
  if (camera.near !== wantNear) {
    camera.near = wantNear;
    camera.updateProjectionMatrix();
  }

  for (const veh of game.vehicles) {
    if (veh === v && inCockpit) {
      veh.setCockpitView(true, game.state?.appearance || null);
      const rig = ensureMirrorRig();
      veh.setMirrorTextures({
        rear: rig.rearRT.texture,
        left: rig.leftRT.texture,
        right: rig.rightRT.texture,
      });
      rig.boundVeh = veh;
      rig.needsPrime = true;
    } else if (veh.cockpitView) {
      veh.setCockpitView(false);
      if (mirrorRig?.boundVeh === veh) mirrorRig.boundVeh = null;
    }
  }

  const ch = game.player.char;
  if (ch) {
    if (inCockpit) {
      ch.group.visible = false;
      ch.setFirstPerson(false);
    } else {
      ch.group.visible = true;
      ch.setFirstPerson(onFootFP);
    }
  }

  const btn = $('btn-camera');
  if (btn) {
    btn.classList.toggle('on', cam.mode === 'first');
    btn.textContent = cam.mode === 'first'
      ? (v ? '🎥 Cockpit' : '🎥 1st View')
      : (v ? '🎥 Chase' : '🎥 3rd View');
  }
  $('t-camera')?.classList.toggle('on', cam.mode === 'first');
  $('fp-reticle')?.classList.toggle('hidden', !onFootFP || anyOverlay());

  if (game.state?.player) game.state.player.cameraMode = cam.mode;
}

function setCameraMode(mode, silent = false) {
  if (game.creatorOpen) closeCreator();
  const v = game.player.vehicle;
  const res = Cam.setCameraMode(cam, mode, !!v, v ? v.yaw : game.player.yaw);
  syncCameraViewMode();
  if (!silent) {
    sfx.click();
    toast(`🎥 ${res.label}`, '');
  }
  return res.mode;
}

function toggleCameraMode(silent = false) {
  return setCameraMode(cam.mode === 'first' ? 'third' : 'first', silent);
}

game.cameraView = {
  getMode: () => cam.mode,
  setMode: (m, silent = true) => setCameraMode(m, silent),
  toggle: (silent = true) => toggleCameraMode(silent),
  state: cam,
};

canvas.addEventListener('pointerdown', (e) => {
  sfx.ensure();
  cam.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!cam.drag || cam.drag.id !== e.pointerId) return;
  const dx = e.clientX - cam.drag.x; const dy = e.clientY - cam.drag.y;
  cam.drag.x = e.clientX; cam.drag.y = e.clientY;
  Cam.applyCameraDrag(cam, dx, dy, { inVehicle: !!game.player.vehicle, elapsed: game.elapsed });
});
const endDrag = (e) => { if (cam.drag && cam.drag.id === e.pointerId) cam.drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (cam.mode === 'third') {
    cam.dist = THREE.MathUtils.clamp(cam.dist + Math.sign(e.deltaY) * 0.8, 3.5, 18);
  }
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
      if (b.id === 't-emote') { openEmotesModal(); return; }
      if (b.id === 't-camera') { toggleCameraMode(); return; }
      if (b.id === 't-uni') { openUniversity(); return; }
      if (b.id === 't-build') { toggleBuildMode(); return; }
      if (anyOverlay()) return;
      if (key === 'interact') interact();
      if (key === 'vehicle') toggleVehicle();
      if (key === 'horn') honk();
      if (key === 'sprint') touchInput.sprint = true;
      if (key === 'jump') {
        if (game.player.vehicle) touchInput.handbrake = true;
        else triggerJump();
      }
    });
    const up = () => {
      if (key === 'sprint') touchInput.sprint = false;
      if (key === 'jump') touchInput.handbrake = false;
    };
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
  const uniEl = $('hud-uni');
  if (uniEl) {
    const ac = s.academic || Uni.createAcademicState();
    const activeCourse = ac.activeCourseId ? Uni.COURSE_BY_ID[ac.activeCourseId] : null;
    const degCount = ac.completedIds?.length || 0;
    if (activeCourse) {
      uniEl.textContent = `${activeCourse.code}${degCount ? ` · 🎓${degCount}` : ''}`;
    } else if (degCount > 0) {
      uniEl.textContent = `🎓 ${degCount} degree${degCount === 1 ? '' : 's'} · GPA ${ac.gpa.toFixed(2)}`;
    } else {
      uniEl.textContent = '1,105 courses (U)';
    }
  }
  const wellEl = $('hud-well');
  if (wellEl) {
    const leisure = s.leisure || Props.createLeisureState();
    const hotel = Places.hotelStatus(s);
    const base = `${Props.wellbeingLabel(leisure)} · ⚡${Math.round(leisure.energy)}% · 🛋${Math.round(leisure.comfort)}%`;
    wellEl.textContent = hotel ? `${base} · 🗝 ${hotel.room}` : base;
  }
  $('hud-vehicles').textContent = `${s.vehicles.length} vehicle${s.vehicles.length === 1 ? '' : 's'}`;
  const heatRow = $('hud-heat-row');
  if (heatRow) {
    const stars = game.heat?.stars || 0;
    heatRow.classList.toggle('hidden', stars <= 0);
    if (stars > 0) $('hud-heat').textContent = `🚨 ${Heat.starLabel(stars)}`;
  }
  if (force || clockHudTimer <= 0) {
    clockHudTimer = 1.0; // tick #hud-day at 1 Hz (UPGRADE_PLAN.md §11A B)
    $('hud-day').textContent = Time.clockLabel(getClock());
  }
  $('hud-payday').textContent = Eco.builtCount(s) ? `Shift in ${Math.ceil(s.stats.payrollTimer)}s` : 'No startups yet';
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
function closeModal() {
  game.modal = null;
  game.modalShop = null;
  if (game.boutiquePreview) {
    game.boutiquePreview = false;
    game.player.char?.setOccupation(game.state?.activeJob || null);
    game.player.char?.setCarrying(!!(game.task && game.task.carrying));
  }
  modalEl.classList.add('hidden');
}
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

/** Apply a public-service result, persist and refresh the HUD. */
function serviceResult(res) {
  if (res.ok) { sfx.cash(); toast(res.msg, 'good'); saveGame(true); }
  else { sfx.error(); toast(res.msg, 'warn'); }
  updateHUD(true);
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
    const degMult = Uni.academicJobMultiplier(s, occ.id);
    const active = s.activeJob === occ.id;
    const needsCar = occ.requiresVehicle && !s.vehicles.length;
    return `
      <h2>${st.name}</h2>
      <p class="sub">${occ.title} · ${occ.description}</p>
      <div class="kv">
        <div><b>${money(occ.basePay)}${occ.id === 'security' ? '' : '+'}</b><span>Base pay per job</span></div>
        <div><b>+${Math.round((Eco.payMultiplier(xp) - 1) * 100)}%${degMult > 1 ? ` · 🎓 +${Math.round((degMult - 1) * 100)}%` : ''}</b><span>Rank${degMult > 1 ? ' + Degree' : ''} bonus</span></div>
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
        <p class="muted">Launch the startup, then hire unemployed citizens to create jobs and earn passive profit every 12-min shift (30s).</p>
        <div class="actions">
          <button class="primary" data-action="buy" data-biz="${bizId}" ${s.cash < def.cost ? 'disabled' : ''}>Buy &amp; build · ${money(def.cost)}</button>
        </div>
        ${s.cash < def.cost ? `<p class="bad-text">You need ${money(def.cost - s.cash)} more. Work some shifts!</p>` : ''}`;
    }
    const n = Eco.businessDailyNumbers(bizId, biz, s);
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
        ${bizId === 'garage' ? '<button class="primary" data-action="serviceBay">🔧 Service bay (house rates)</button><button data-action="openModShop">🎨 Custom Mod Shop (-25%)</button>' : ''}
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

// ---------------------------------------------------------------------------
// Refuelling & mechanic (feature 4 — UPGRADE_PLAN.md §4)
// ---------------------------------------------------------------------------
function startRefuel(st) {
  const p = game.player;
  let best = null; let bd = 9 * 9;
  for (const x of game.vehicles) {
    const d = dist2(x, p);
    if (d < bd) { bd = d; best = x; }
  }
  if (!best) { toast('Bring a car within 9 m of the pumps to refuel it.', ''); return; }
  if (best.cond.hp <= 0) { toast(`Your ${best.model.name} is wrecked — it needs the mechanic before a top-up.`, 'bad'); return; }
  if (best.cond.fuel >= 99.5) { toast('Tank is already full.', ''); return; }
  openModal(refuelModal(best, st));
}

function refuelModal(v, st) {
  return () => {
    const s = game.state;
    const cost = VCond.refuelCost(v.cond, v.data.model);
    return `
      <h2>⛽ ${st.name}</h2>
      <p class="sub">${v.model.name} · parked at the pumps</p>
      <div class="kv">
        <div><b>${Math.ceil(v.cond.fuel)}%</b><span>Fuel in the tank</span></div>
        <div><b>${money(cost)}</b><span>Cost to fill</span></div>
      </div>
      ${cost <= 0 ? '<p class="good-text">Full tank.</p>' : ''}
      <div class="actions">
        ${cost > 0 ? `<button class="primary" data-action="refuel" data-veh="${v.data.id}" ${s.cash < cost ? 'disabled' : ''}>Fill up · ${money(cost)}</button>` : ''}
        <button data-action="close">Later</button>
      </div>
      ${cost > 0 && s.cash < cost ? `<p class="bad-text">You need ${money(cost - s.cash)} more. A quick shift fixes that.</p>` : ''}`;
  };
}

function towSpotNear(x, z) {
  const cands = [[0, 8], [7, 10], [-7, 10], [0, 14], [7, 14], [-7, 14]];
  for (const [dx, dz] of cands) {
    const c = { x: x + dx, z: z + dz, yaw: Math.PI / 2 };
    const clear = !game.vehicles.some((v) => dist2(v, c) < 4.5 * 4.5);
    const r = resolveCircle(c.x, c.z, 1.2, city.colliderCache);
    if (clear && !r.hit) return c;
  }
  return { x: x + 0, z: z + 8, yaw: Math.PI / 2 };
}

function preferredShop() {
  if (game.state?.businesses?.garage) {
    return { name: 'Apex Auto Garage', markup: 1, ...city.lots.garage.interact };
  }
  return { name: 'Metro Motors', markup: MOTORS_REPAIR_MARKUP, ...DEALERSHIP.interact };
}

function openMechanicAt(shop) {
  game.modalShop = shop;
  openModal(mechanicModal(shop));
}

function mechanicModal(shop) {
  return () => {
    const s = game.state;
    const rows = s.vehicles.map((d) => {
      const v = game.vehicles.find((x) => x.data.id === d.id);
      const cond = v ? v.cond : d.cond;
      return VCard.renderVehicleCard(
        { ...d, cond },
        { interactive: true, mode: 'shop', markup: shop.markup, cash: s.cash },
      );
    }).join('');
    return `
      <h2>🔧 ${shop.name} — Mechanic</h2>
      <p class="sub">${shop.markup > 1 ? 'City rates — 20% markup. Build Apex Auto Garage for house rates.' : 'House rates — no markup.'}</p>
      ${rows || '<p class="muted">You don\'t own any vehicles yet.</p>'}
      <div class="actions"><button data-action="close">Close</button></div>`;
  };
}

function openGarageModal(focusVehId = null) {
  if (game.creatorOpen) closeCreator();
  const focus = focusVehId || game.player.vehicle?.data.id || game.state?.lastVehicleId || null;
  openModal(garageModal(focus));
}

function garageModal(focusVehId = null) {
  return () => {
    const s = game.state;
    const hasGarage = !!s.businesses.garage;
    const shop = preferredShop();
    const rows = s.vehicles.map((d) => {
      const v = game.vehicles.find((x) => x.data.id === d.id);
      const cond = v ? v.cond : d.cond;
      return VCard.renderVehicleCard(
        { ...d, cond },
        {
          interactive: true,
          mode: 'roadside',
          hasGarage,
          shopName: shop.name,
          cash: s.cash,
          highlight: d.id === focusVehId,
        },
      );
    }).join('');
    return `
      <h2>🛠 Garage &amp; Roadside Assist</h2>
      <p class="sub">Live telemetry for your fleet · call a tow to <b>${shop.name}</b> (${money(TOW_PRICE)}) or dispatch a mobile mechanic anywhere (${money(ROADSIDE_CALLOUT_FEE)} call-out + ${hasGarage ? '15% Apex owner' : '40% mobile'} parts).</p>
      ${rows || '<p class="muted">You don\'t own any vehicles yet. Visit Metro Motors!</p>'}
      <div class="actions"><button data-action="close">Close</button></div>`;
  };
}

function openEmotesModal() {
  if (game.creatorOpen) closeCreator();
  openModal(emotesModal);
}

function emotesModal() {
  const inCar = !!game.player.vehicle;
  const active = game.player.char?.emote;
  const buttons = EMOTES.map((def) => {
    const isAct = active === def.id;
    return `<button class="emote-btn ${isAct ? 'active' : ''}" data-action="emote" data-emote="${def.id}" ${inCar ? 'disabled' : ''}>
      <span>${def.icon} ${def.name}</span>
      <kbd>${def.key}</kbd>
    </button>`;
  }).join('');
  return `
    <h2>✋ Character Actions &amp; Emotes</h2>
    <p class="sub">${inCar ? 'Step out of your car (<kbd>F</kbd>) to jump, wave, or dance.' : 'Press <kbd>1</kbd>–<kbd>8</kbd> anytime on foot, or <kbd>Space</kbd> to jump. Moving cancels looping poses.'}</p>
    <div class="emote-grid">${buttons}</div>
    <div class="actions">
      <button class="primary" data-action="jumpNow" ${inCar ? 'disabled' : ''}>⤒ Jump (<kbd>Space</kbd>)</button>
      ${active ? '<button data-action="stopEmote">⏹ Stop emote</button>' : ''}
      <button data-action="close">Close</button>
    </div>`;
}

const dealerUI = { colors: {}, filter: 'all' };
const customUI = { vehId: null };
const boutiqueUI = { tab: 'bundles' };

function openCustomizer(focusVehId = null) {
  const s = game.state;
  if (!s.vehicles.length) {
    toast('You don\'t own a vehicle yet. Buy one at Metro Motors!', 'bad');
    return;
  }
  customUI.vehId = focusVehId || game.player.vehicle?.data.id || s.lastVehicleId || s.vehicles[0].id;
  openModal(customizerModal());
}

function customizerModal() {
  return () => {
    const s = game.state;
    const hasGarage = !!s.businesses.garage;
    if (!s.vehicles.some((x) => x.id === customUI.vehId)) customUI.vehId = s.vehicles[0]?.id || null;
    const v = s.vehicles.find((x) => x.id === customUI.vehId);
    if (!v) return '<h2>🎨 Custom Mod Shop</h2><p class="muted">No vehicles in your garage.</p>';
    const m = VEHICLE_MODELS[v.model];
    const fleetTabs = s.vehicles.map((veh) => {
      const mod = VEHICLE_MODELS[veh.model];
      return `<button class="shop-tab ${veh.id === v.id ? 'active' : ''}" data-action="selectModCar" data-veh="${veh.id}">
        <span class="veh-dot" style="background:${veh.color}"></span>${mod.name}
      </button>`;
    }).join('');

    const paintCost = Cust.modCost(RESPRAY_COST, hasGarage);
    const paintSection = m.fixedColor
      ? '<span class="muted">Official fleet vehicle — body paint locked</span>'
      : CAR_COLORS.map((c) => `<button class="swatch ${c === v.color ? 'active' : ''}" style="background:${c}" data-action="applyMod" data-veh="${v.id}" data-kind="paint" data-val="${c}" title="Respray (${money(paintCost)})"></button>`).join('');

    const liveryBtns = Object.values(CAR_LIVERIES).map((liv) => {
      const active = (v.livery || 'clean') === liv.id;
      const cost = Cust.modCost(liv.price, hasGarage);
      const label = active ? `✓ ${liv.name}` : `${liv.name} · ${cost ? money(cost) : 'Free'}`;
      return `<button class="mod-chip ${active ? 'active' : ''}" data-action="applyMod" data-veh="${v.id}" data-kind="livery" data-val="${liv.id}" ${!active && s.cash < cost ? 'disabled' : ''}>${label}</button>`;
    }).join('');

    const rimBtns = Object.values(RIM_FINISHES).map((rim) => {
      const active = (v.rims || 'silver') === rim.id;
      const cost = Cust.modCost(rim.price, hasGarage);
      const label = active ? `✓ ${rim.name}` : `${rim.name} · ${cost ? money(cost) : 'Free'}`;
      return `<button class="mod-chip ${active ? 'active' : ''}" data-action="applyMod" data-veh="${v.id}" data-kind="rims" data-val="${rim.id}" ${!active && s.cash < cost ? 'disabled' : ''}>
        <span class="veh-dot" style="background:${rim.hex}"></span>${label}
      </button>`;
    }).join('');

    const glowBtns = Object.values(UNDERGLOW_OPTIONS).map((gl) => {
      const active = (v.underglow || 'none') === gl.id;
      const cost = Cust.modCost(gl.price, hasGarage);
      const dot = gl.hex ? `<span class="veh-dot" style="background:${gl.hex};box-shadow:0 0 8px ${gl.hex}"></span>` : '';
      const label = active ? `✓ ${gl.name}` : `${gl.name} · ${cost ? money(cost) : 'Free'}`;
      return `<button class="mod-chip ${active ? 'active' : ''}" data-action="applyMod" data-veh="${v.id}" data-kind="underglow" data-val="${gl.id}" ${!active && s.cash < cost ? 'disabled' : ''}>${dot}${label}</button>`;
    }).join('');

    return `
      <h2>🎨 Metro Customs — Paint, Stripes, Rims &amp; Underglow</h2>
      <p class="sub">${hasGarage ? '⭐ <b>Apex Auto Garage owner</b> — 25% discount active on all custom mods!' : 'Standard Metro Customs pricing · build <b>Apex Auto Garage</b> for 25% off all mods.'} · Cash: <b>${money(s.cash)}</b></p>
      <div class="shop-tabs">${fleetTabs}</div>
      <div class="mod-section">
        <h4><span>🎨 Metallic Clearcoat Respray</span><span>${m.fixedColor ? 'Locked' : money(paintCost)}</span></h4>
        <div class="swatches">${paintSection}</div>
      </div>
      <div class="mod-section">
        <h4><span>🏁 Racing Stripes &amp; Carbon Aero</span></h4>
        <div class="mod-chips">${liveryBtns}</div>
      </div>
      <div class="mod-section">
        <h4><span>🛞 5-Spoke Alloy Rim Finish</span></h4>
        <div class="mod-chips">${rimBtns}</div>
      </div>
      <div class="mod-section">
        <h4><span>💡 Street Neon Underglow</span></h4>
        <div class="mod-chips">${glowBtns}</div>
      </div>
      <div class="actions">
        <button data-action="backToDealer">🚗 Showroom</button>
        <button data-action="close">Done</button>
      </div>`;
  };
}

function openBoutique() {
  if (game.creatorOpen) closeCreator();
  game.boutiquePreview = true;
  game.player.char?.setOccupation(null);
  openModal(boutiqueModal());
}

// ---------------------------------------------------------------------------
// Metro Grand University — 1,105 Real-World Academic Courses, Lectures & Exams
// ---------------------------------------------------------------------------
const uniUI = {
  tab: 'catalog',
  query: '',
  facultyId: 'all',
  degreeId: 'all',
  offset: 0,
  examActive: false,
  answers: [null, null, null],
};

function isPlayerOnCampus() {
  const p = game.player;
  return p.x >= -82 && p.x <= 82 && p.z >= -235 && p.z <= -157;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderUniCatalogInner() {
  const s = game.state;
  const ac = s.academic || Uni.createAcademicState();
  const { total, items } = Uni.searchCourses({
    query: uniUI.query,
    facultyId: uniUI.facultyId,
    degreeId: uniUI.degreeId,
    limit: 24,
    offset: uniUI.offset,
  });
  const enrolledSet = new Set(ac.enrolledIds || []);
  const completedSet = new Set(ac.completedIds || []);
  const cards = items.map((c) => {
    const isActive = ac.activeCourseId === c.id;
    const isGrad = completedSet.has(c.id);
    const isEnrolled = enrolledSet.has(c.id);
    const cr = ac.creditsByCourse?.[c.id] || 0;
    const costLabel = isGrad
      ? '🎓 Graduated'
      : isActive
        ? '✓ Active Major'
        : isEnrolled || c.tuition === 0
          ? '<span class="uni-free">FREE OPEN ENROLL</span>'
          : `Tuition ${money(c.tuition)}`;
    const btnLabel = isActive
      ? '🏛 Go to Classroom'
      : isGrad
        ? '🔄 Audit / Switch'
        : isEnrolled
          ? '🎓 Switch Active Major (Free)'
          : c.tuition === 0
            ? '🎓 Enroll Free ($0)'
            : `🎓 Enroll · ${money(c.tuition)}`;
    const actionAttr = isActive
      ? 'data-action="uniTab" data-tab="classroom"'
      : `data-action="uniEnroll" data-cid="${c.id}"`;
    const disabled = !isActive && !isEnrolled && !isGrad && s.cash < c.tuition ? 'disabled' : '';
    return `
      <div class="uni-course-card ${isActive ? 'active-major' : ''} ${isGrad ? 'graduated' : ''}">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px">
            <span class="uni-code">${c.code}</span>
            <span style="font-size:11px;color:#fde68a">${costLabel}</span>
          </div>
          <h4 style="margin:2px 0 4px;font-size:13.5px">${escapeHtml(c.title)}</h4>
          <p style="margin:0;font-size:11.5px;color:#94a3b8">${escapeHtml(c.facultyName)} · Credits: <b>${cr}/${c.creditsRequired}</b> · <b>+${Math.round(c.jobBoost * 100)}%</b> career pay</p>
        </div>
        <button class="${isActive ? 'good' : 'primary'}" ${actionAttr} ${disabled} style="font-size:12px;padding:6px 10px">${btnLabel}</button>
      </div>`;
  }).join('');

  const start = total ? uniUI.offset + 1 : 0;
  const end = Math.min(total, uniUI.offset + items.length);
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin:4px 0 8px">
      <span class="muted">Showing <b>${start}–${end}</b> of <b>${total.toLocaleString()}</b> real-world academic courses</span>
      <div style="display:flex;gap:6px">
        <button data-action="uniPage" data-dir="-1" ${uniUI.offset <= 0 ? 'disabled' : ''} style="font-size:12px;padding:4px 10px">◀ Prev 24</button>
        <button data-action="uniPage" data-dir="1" ${uniUI.offset + 24 >= total ? 'disabled' : ''} style="font-size:12px;padding:4px 10px">Next 24 ▶</button>
      </div>
    </div>
    <div class="shop-grid">${cards || '<p class="muted">No courses match that search — try another keyword or clear filters.</p>'}</div>`;
}

function openUniversity(mode = 'catalog') {
  if (game.creatorOpen) closeCreator();
  if (!game.state.academic) game.state.academic = Uni.createAcademicState();
  if (mode === 'study_library' || mode === 'study_lab') {
    if (game.state.academic.activeCourseId) {
      const res = Uni.studySession(game.state, { mode: mode === 'study_lab' ? 'lab' : 'library' });
      result(res);
      saveGame(true);
    }
    uniUI.tab = game.state.academic.activeCourseId ? 'classroom' : 'catalog';
  } else if (mode === 'classroom') {
    uniUI.tab = game.state.academic.activeCourseId ? 'classroom' : 'catalog';
  } else {
    uniUI.tab = mode || 'catalog';
  }
  uniUI.examActive = false;
  openModal(universityModal());
}

function universityModal() {
  return () => {
    const s = game.state;
    const ac = s.academic || (s.academic = Uni.createAcademicState());
    const active = ac.activeCourseId ? Uni.COURSE_BY_ID[ac.activeCourseId] : null;
    const onCampus = isPlayerOnCampus();
    const hasGradGown = Cust.ownsClothing(s, 'top', 'gown');

    const header = `
      <h2>🎓 Metro Grand University <span class="pill good">${Uni.UNIVERSITY_COURSES.length.toLocaleString()} Real Courses</span></h2>
      <div class="uni-id-card">
        <div class="uni-id-meta">
          <div>🪪 Student ID: <b>${ac.matricNo}</b> · Name: <b>${escapeHtml(s.appearance.name)}</b> · GPA: <b>${ac.gpa.toFixed(2)}</b></div>
          <div>📚 Active Major: <b>${active ? `${active.code} — ${escapeHtml(active.title)}` : 'None selected (pick any course below!)'}</b></div>
          <div>🏅 Earned Degrees: <b>${ac.completedIds.length}</b> · Enrolled Courses: <b>${ac.enrolledIds.length}</b> · ${onCampus ? '<span style="color:#4ade80;font-weight:700">📍 On Campus (+50% Stipend Bonus!)</span>' : 'Walk North of 1st St to enter the 3D Lecture Hall, Library &amp; Labs!'}</div>
        </div>
        ${hasGradGown ? '<button class="good" data-action="uniWearGown" style="font-size:12px">🎓 Wear Cap &amp; Gown</button>' : ''}
      </div>
      <div class="shop-tabs">
        <button class="shop-tab ${uniUI.tab === 'catalog' ? 'active' : ''}" data-action="uniTab" data-tab="catalog">📚 Course Explorer (${Uni.UNIVERSITY_COURSES.length.toLocaleString()})</button>
        <button class="shop-tab ${uniUI.tab === 'classroom' ? 'active' : ''}" data-action="uniTab" data-tab="classroom">🏛 Live Classroom &amp; Exam</button>
        <button class="shop-tab ${uniUI.tab === 'transcript' ? 'active' : ''}" data-action="uniTab" data-tab="transcript">📜 Transcript &amp; Career Boosts (${ac.completedIds.length})</button>
      </div>`;

    if (uniUI.tab === 'catalog') {
      const facOptions = `<option value="all" ${uniUI.facultyId === 'all' ? 'selected' : ''}>All 12 Faculties (${Uni.UNIVERSITY_COURSES.length.toLocaleString()})</option>` +
        Uni.UNIVERSITY_FACULTIES.map((f) => `<option value="${f.id}" ${uniUI.facultyId === f.id ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
      const degOptions = `<option value="all" ${uniUI.degreeId === 'all' ? 'selected' : ''}>All Degree Tracks</option>` +
        Uni.DEGREE_LEVELS.map((d) => `<option value="${d.id}" ${uniUI.degreeId === d.id ? 'selected' : ''}>${escapeHtml(d.label)} (${d.tuition === 0 ? 'Free' : money(d.tuition)})</option>`).join('');
      return `${header}
        <div class="uni-search-row">
          <input id="uni-search-input" type="search" value="${escapeHtml(uniUI.query)}" placeholder="Search 1,105 courses (e.g. Computer Science, Medicine, Law, AI, Nursing, Finance, Architecture)..." />
          <select id="uni-fac-select">${facOptions}</select>
          <select id="uni-deg-select">${degOptions}</select>
        </div>
        <div id="uni-catalog-results">${renderUniCatalogInner()}</div>`;
    }

    if (uniUI.tab === 'classroom') {
      const live = Uni.getLiveCampusSchedule(getClock());
      const scheduleHtml = live.map((slot) => `
        <div class="shop-item">
          <div>
            <h4><span>🏛 ${escapeHtml(slot.venue)}</span><span class="uni-code">${slot.window}</span></h4>
            <p><b>${slot.course.code}: ${escapeHtml(slot.course.title)}</b><br/>Faculty of ${escapeHtml(slot.course.facultyName)}</p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button data-action="uniLecture" data-cid="${slot.course.id}" style="font-size:12px">🎙 Audit Live Class</button>
            <button data-action="uniEnroll" data-cid="${slot.course.id}" style="font-size:12px">Switch Major</button>
          </div>
        </div>`).join('');

      if (!active) {
        return `${header}
          <p class="sub">Pick any major in the <b>Course Explorer</b> (including <b>$0 Free Undergraduate Certificates</b>) or audit one of the live campus lectures happening right now:</p>
          <div class="shop-grid">${scheduleHtml}</div>`;
      }

      const cr = ac.creditsByCourse?.[active.id] || 0;
      const ready = cr >= active.creditsRequired;
      const isGrad = ac.completedIds.includes(active.id);

      let examBlock = '';
      if (uniUI.examActive) {
        const qs = Uni.getExamQuestions(active.id);
        examBlock = `
          <div class="mod-section" style="border-color:#fbbf24">
            <h4><span>📝 Final Degree Examination — ${escapeHtml(active.title)}</span><span>Pass: 2 / 3</span></h4>
            ${qs.map((q, qi) => `
              <div class="uni-exam-q">
                <div style="font-size:13px;font-weight:700">${qi + 1}. ${escapeHtml(q.q)}</div>
                <div class="uni-exam-opts">
                  ${q.options.map((opt, oi) => `
                    <button class="uni-exam-opt ${uniUI.answers[qi] === oi ? 'selected' : ''}" data-action="uniPickAnswer" data-q="${qi}" data-opt="${oi}">
                      ${String.fromCharCode(65 + oi)}. ${escapeHtml(opt)}
                    </button>`).join('')}
                </div>
              </div>`).join('')}
            <div class="actions">
              <button class="good" data-action="uniSubmitExam">🎓 Submit Final Exam</button>
            </div>
          </div>`;
      }

      return `${header}
        <div class="mod-section">
          <h4><span>📖 Active Degree Program: ${active.code} — ${escapeHtml(active.title)}</span><span>${isGrad ? '🎓 Graduated!' : `Credits: ${cr} / ${active.creditsRequired}`}</span></h4>
          <p class="muted" style="margin:4px 0 10px">Faculty of <b>${escapeHtml(active.facultyName)}</b> · Graduation Reward: <b>+${Math.round(active.jobBoost * 100)}% Career Pay</b>, <b>+${Math.round(active.bizBoost * 100)}% Startup Revenue</b>, <b>${money(active.grant)} Grant</b> &amp; <b>Academic Cap + Gown</b>!</p>
          <div class="actions">
            <button class="primary" data-action="uniLecture" data-cid="${active.id}">🎙 Attend Campus Lecture (+1 Credit${onCampus ? ' · Campus Stipend!' : ''})</button>
            <button data-action="uniStudy" data-mode="${onCampus ? 'library' : 'portal'}">📖 Research / Lab Study (+1 Credit)</button>
            <button class="good" data-action="uniStartExam" ${!ready ? 'disabled' : ''}>${ready ? '📝 Sit 3-Question Final Exam' : `📝 Final Exam (${active.creditsRequired - cr} more credit${active.creditsRequired - cr === 1 ? '' : 's'})`}</button>
          </div>
        </div>
        ${examBlock}
        <h3 style="margin:12px 0 6px;font-size:14px">🕒 Live Campus Lecture Timetable (${Time.hhmm(getClock())})</h3>
        <div class="shop-grid">${scheduleHtml}</div>`;
    }

    // Transcript & Career Boosts tab
    const occRows = Object.values(OCCUPATIONS).map((occ) => {
      const m = Uni.academicJobMultiplier(s, occ.id);
      return `<div><b>+${Math.round((m - 1) * 100)}%</b><span>${escapeHtml(occ.title)}</span></div>`;
    }).join('');
    const gradCards = ac.transcript.length
      ? ac.transcript.map((rec) => `
        <div class="shop-item exotic">
          <h4><span>🎓 ${escapeHtml(rec.title)}</span><span class="exotic-badge">${rec.code}</span></h4>
          <p><b>${escapeHtml(rec.honours)}</b> (${rec.score}/${rec.total}) · Faculty of ${escapeHtml(rec.facultyName)} · Conferred Day ${rec.day}</p>
        </div>`).join('')
      : '<p class="muted">No degrees conferred yet. Enroll in any course, earn credits through lectures or research, and pass the 3-question exam!</p>';

    return `${header}
      <h3 style="margin:6px 0;font-size:14px">💼 Active Permanent Degree Career Multipliers</h3>
      <div class="kv">${occRows}</div>
      <h3 style="margin:12px 0 6px;font-size:14px">📜 Official Diplomas &amp; Academic Transcript (${ac.transcript.length})</h3>
      <div class="shop-grid">${gradCards}</div>`;
  };
}

$('modal-body').addEventListener('input', (e) => {
  if (e.target.id === 'uni-search-input') {
    uniUI.query = e.target.value;
    uniUI.offset = 0;
    const box = $('uni-catalog-results');
    if (box) box.innerHTML = renderUniCatalogInner();
  }
});
$('modal-body').addEventListener('change', (e) => {
  if (e.target.id === 'uni-fac-select') {
    uniUI.facultyId = e.target.value;
    uniUI.offset = 0;
    const box = $('uni-catalog-results');
    if (box) box.innerHTML = renderUniCatalogInner();
  } else if (e.target.id === 'uni-deg-select') {
    uniUI.degreeId = e.target.value;
    uniUI.offset = 0;
    const box = $('uni-catalog-results');
    if (box) box.innerHTML = renderUniCatalogInner();
  }
});

const BOUTIQUE_TABS = [
  { id: 'bundles', label: '✨ Signature Looks' },
  { id: 'top', label: '🧥 Tops & Jackets' },
  { id: 'bottom', label: '👖 Bottoms' },
  { id: 'shoe', label: '👟 Footwear' },
  { id: 'hat', label: '👑 Headwear' },
  { id: 'glasses', label: '🕶 Shades' },
  { id: 'chain', label: '⛓ Chains' },
  { id: 'colors', label: '🎨 Colours' },
];

function boutiqueModal() {
  return () => {
    const s = game.state;
    const tabs = BOUTIQUE_TABS.map((t) => `<button class="shop-tab boutique-tab ${boutiqueUI.tab === t.id ? 'active' : ''}" data-action="boutiqueTab" data-tab="${t.id}">${t.label}</button>`).join('');

    let body = '';
    if (boutiqueUI.tab === 'bundles') {
      const cards = OUTFIT_BUNDLES.map((b) => {
        const q = Cust.bundleQuote(s, b.id);
        return `
          <div class="shop-item exotic ${q.allOwned ? 'equipped' : ''}">
            <div>
              <h4><span>${b.name}</span><span class="exotic-badge">${q.allOwned ? 'Owned' : money(q.cost)}</span></h4>
              <p>${b.desc}</p>
              ${!q.allOwned && q.savings > 0 ? `<p class="good-text" style="margin-top:4px">Save ${money(q.savings)} vs individual pieces</p>` : ''}
            </div>
            <button class="primary" data-action="buyBundle" data-bundle="${b.id}" ${!q.allOwned && s.cash < q.cost ? 'disabled' : ''}>
              ${q.allOwned ? '✨ Wear Signature Look' : `🛍 Unlock & Wear · ${money(q.cost)}`}
            </button>
          </div>`;
      }).join('');
      body = `<div class="shop-grid">${cards}</div>`;
    } else if (boutiqueUI.tab === 'colors') {
      const sw = (list, key) => list.map((c) => `<button class="swatch ${s.appearance[key] === c ? 'active' : ''}" style="background:${c}" data-action="wardrobeColor" data-key="${key}" data-val="${c}"></button>`).join('');
      body = `
        <div class="mod-section"><h4>Top / Jacket / Tunic Colour (Free)</h4><div class="swatches">${sw(SHIRT_COLORS, 'shirt')}</div></div>
        <div class="mod-section"><h4>Pants / Shorts / Slacks Colour (Free)</h4><div class="swatches">${sw(PANTS_COLORS, 'pants')}</div></div>
        <div class="mod-section"><h4>Sneaker / Boot / Loafer Colour (Free)</h4><div class="swatches">${sw(SHOE_COLORS, 'shoeColor')}</div></div>
        <div class="mod-section"><h4>Cap / Bucket / Fila Hat Colour (Free)</h4><div class="swatches">${sw(SHIRT_COLORS, 'hatColor')}</div></div>`;
    } else {
      const slot = boutiqueUI.tab;
      const items = Object.values(CLOTHING_ITEMS[slot] || {});
      const cards = items.map((item) => {
        const owned = Cust.ownsClothing(s, slot, item.id);
        const equipped = (s.appearance[item.field] || '') === item.id;
        return `
          <div class="shop-item ${equipped ? 'equipped' : ''}">
            <div>
              <h4><span>${item.name}</span><span class="pill ${owned ? 'good' : ''}">${owned ? (equipped ? 'Wearing' : 'Owned') : money(item.price)}</span></h4>
              <p>${item.desc}</p>
            </div>
            <button class="${equipped ? '' : 'primary'}" data-action="buyCloth" data-slot="${slot}" data-item="${item.id}" ${equipped || (!owned && s.cash < item.price) ? 'disabled' : ''}>
              ${equipped ? '✓ Currently Wearing' : owned ? 'Equip (Free)' : `Buy & Wear · ${money(item.price)}`}
            </button>
          </div>`;
      }).join('');
      body = `<div class="shop-grid">${cards}</div>`;
    }

    return `
      <h2>🛍 Maison Verve — Luxury Fashion &amp; Chains</h2>
      <p class="sub">Unlock 3D Hoodies, Bombers, Suits, Royal Senator Tunics, Shades &amp; 24k Gold Chains · Cash: <b>${money(s.cash)}</b></p>
      <div class="shop-tabs">${tabs}</div>
      ${body}
      <p class="muted">Unlocked pieces stay in your personal <b>Look &amp; Wardrobe (<kbd>C</kbd>)</b> forever — mix &amp; match anytime for free!</p>
      <div class="actions">
        <button data-action="openCreatorFromBoutique">👤 Open Full Look &amp; Colours (<kbd>C</kbd>)</button>
        <button data-action="close">Close</button>
      </div>`;
  };
}

function dealerModal() {
  return () => {
    const s = game.state;
    const allModels = Object.values(VEHICLE_MODELS).filter((m) => m.forSale);
    const list = dealerUI.filter === 'exotic'
      ? allModels.filter((m) => m.tier === 'exotic')
      : dealerUI.filter === 'daily'
        ? allModels.filter((m) => m.tier !== 'exotic')
        : allModels;

    const cards = list.map((m) => {
      const color = m.fixedColor || dealerUI.colors[m.id] || CAR_COLORS[0];
      const bar = (v) => `<div class="bar"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div>`;
      const isExotic = m.tier === 'exotic';
      return `
        <div class="car-card ${isExotic ? 'exotic-card' : ''}">
          <h3>${m.name} ${isExotic ? '<span class="exotic-badge">Signature</span>' : ''}</h3>
          <div class="price">${money(m.price)}</div>
          ${m.desc ? `<p class="muted" style="margin:2px 0 8px">${m.desc}</p>` : ''}
          <div class="bars">
            <span>Top speed</span>${bar(m.maxSpeed / 52)}
            <span>Acceleration</span>${bar(m.accel / 21)}
            <span>Handling</span>${bar((m.grip / 10.5) * 0.6 + (m.steer / 0.62) * 0.4)}
          </div>
          <div class="row">
            <div class="swatches">${m.fixedColor ? '<span class="muted">Official taxi yellow</span>' : CAR_COLORS.map((c) => `<button class="swatch ${c === color ? 'active' : ''}" style="background:${c}" data-action="carColor" data-model="${m.id}" data-color="${c}" aria-label="colour ${c}"></button>`).join('')}</div>
            <button class="primary" data-action="buyCar" data-model="${m.id}" ${s.cash < m.price ? 'disabled' : ''}>Buy</button>
          </div>
        </div>`;
    }).join('');
    const owned = s.vehicles.map((v) => `<span class="pill">🚗 ${VEHICLE_MODELS[v.model].name}</span>`).join('');
    return `
      <h2>🚗 Metro Motors — Exotics &amp; Dealership</h2>
      <p class="sub">Your garage: ${owned || 'empty'} · Cash: <b>${money(s.cash)}</b></p>
      <div class="actions">
        <button class="primary" data-action="openModShop">🎨 Custom Mod Shop (Stripes, Rims &amp; Underglow)</button>
        <button data-action="mechDealer">🔧 Mechanic (city rates)</button>
      </div>
      <div class="shop-tabs">
        <button class="shop-tab ${dealerUI.filter === 'all' ? 'active' : ''}" data-action="dealerTab" data-tab="all">All Vehicles (${allModels.length})</button>
        <button class="shop-tab ${dealerUI.filter === 'exotic' ? 'active' : ''}" data-action="dealerTab" data-tab="exotic">✨ Exotic &amp; Signature (4)</button>
        <button class="shop-tab ${dealerUI.filter === 'daily' ? 'active' : ''}" data-action="dealerTab" data-tab="daily">🚙 Daily &amp; Fleet (5)</button>
      </div>
      ${cards}
      <p class="muted">Tip: Drive the open-top <b>Aero Spider Convertible</b> to show off your Maison Verve outfits while cruising! Press <kbd>V</kbd> anywhere for valet delivery.</p>`;
  };
}

const modalActions = {
  close: () => closeModal(),
  rideLift: ({ level }) => rideElevator(Number(level)),
  openUni: () => { closeModal(); openUniversity(); },
  hotelBook: ({ room, nights }) => {
    const res = Places.bookHotelRoom(game.state, { roomType: room, nights: Number(nights) || 1, day: Time.dayOf(getClock()) });
    if (res.ok) { sfx.cash(); toast(res.msg, 'good'); saveGame(true); } else { sfx.error(); toast(res.msg, 'warn'); }
    updateHUD(true);
  },
  hotelCheckout: () => {
    const res = Places.checkoutHotel(game.state);
    if (res.ok) { toast(res.msg, 'good'); saveGame(true); } else toast(res.msg, 'warn');
    updateHUD(true);
  },
  hotelSleep: () => {
    const res = Places.sleepHotelNight(game.state, {});
    if (res.ok) {
      game.seat = null;
      const bed = city.propSpotsNear(game.player.x, game.player.z, game.player.y, 6).find((x) => x.type === 'bed');
      if (bed) {
        sitOnProp(bed, Props.interactionFor('bed'), { action: 'sleep' });
        game.player.char.playAction('sleep', { loop: true });
      }
      sfx.cash(); toast(res.msg, 'good'); saveGame(true);
    } else { sfx.error(); toast(res.msg, 'warn'); }
    updateHUD(true);
  },
  hospitalTreat: ({ tier }) => serviceResult(Places.treatPatient(game.state, { tier })),
  museumTicket: ({ tier }) => serviceResult(Places.visitMuseum(game.state, { tier })),
  gymOffer: ({ offer }) => serviceResult(Places.buyGymOffer(game.state, { offer })),
  mallMeal: ({ meal }) => serviceResult(Places.buyMeal(game.state, { meal })),
  movieTicket: ({ movie }) => serviceResult(Places.watchMovie(game.state, { movie })),
  mallBoutique: () => { closeModal(); openBoutique(); },
  libraryBorrow: () => serviceResult(Places.borrowBook(game.state)),
  fuelBuy: ({ item }) => serviceResult(Props.buySnack(game.state, item)),
  libraryStudy: () => {
    const res = Uni.studySession(game.state, { spot: 'Metro Public Library' });
    if (res.ok) { sfx.cash(); toast(res.msg, 'good'); saveGame(true); } else { sfx.error(); toast(res.msg, 'warn'); }
    updateHUD(true);
  },
  toggleBuild: () => { closeModal(); toggleBuildMode(true); },
  emote: ({ emote }) => {
    if (triggerEmote(emote)) closeModal();
  },
  stopEmote: () => {
    game.player.char?.clearEmote();
    closeModal();
  },
  jumpNow: () => {
    closeModal();
    triggerJump();
  },
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
  dealerTab: ({ tab }) => { dealerUI.filter = tab || 'all'; },
  openModShop: () => openCustomizer(),
  customizeCar: ({ veh }) => openCustomizer(veh),
  selectModCar: ({ veh }) => { customUI.vehId = veh; },
  backToDealer: () => openModal(dealerModal()),
  applyMod: ({ veh, kind, val }) => {
    const res = Cust.applyVehicleMod(game.state, veh, kind, val);
    if (!result(res)) return;
    const live = game.vehicles.find((x) => x.data.id === veh);
    if (live) live.applyCustomization();
    sfx.wrench();
    saveGame(true);
  },
  boutiqueTab: ({ tab }) => { boutiqueUI.tab = tab || 'bundles'; },
  buyCloth: ({ slot, item }) => {
    const res = Cust.buyOrEquipClothing(game.state, slot, item);
    if (!res.ok) { sfx.error(); toast(res.msg, 'bad'); return; }
    if (res.bought) sfx.cash(); else sfx.click();
    toast(res.msg, res.bought ? 'money' : 'good');
    game.player.char.setAppearance(game.state.appearance);
    game.player.char.setOccupation(null);
    if (net) net.setAppearance(game.state.appearance);
    saveGame(true);
  },
  buyBundle: ({ bundle }) => {
    const res = Cust.buyOrEquipBundle(game.state, bundle);
    if (!res.ok) { sfx.error(); toast(res.msg, 'bad'); return; }
    if (res.bought) sfx.cash(); else sfx.click();
    toast(res.msg, res.bought ? 'money' : 'good');
    game.player.char.setAppearance(game.state.appearance);
    game.player.char.setOccupation(null);
    if (net) net.setAppearance(game.state.appearance);
    saveGame(true);
  },
  wardrobeColor: ({ key, val }) => {
    game.state.appearance[key] = val;
    game.player.char.setAppearance(game.state.appearance);
    game.player.char.setOccupation(null);
    if (net) net.setAppearance(game.state.appearance);
    sfx.click();
    saveGame(true);
  },
  openCreatorFromBoutique: () => {
    closeModal();
    openCreator();
  },
  uniTab: ({ tab }) => {
    uniUI.tab = tab || 'catalog';
    uniUI.examActive = false;
  },
  uniFaculty: ({ fac }) => {
    uniUI.facultyId = fac || 'all';
    uniUI.offset = 0;
  },
  uniPage: ({ dir }) => {
    uniUI.offset = Math.max(0, uniUI.offset + Number(dir) * 24);
  },
  uniEnroll: ({ cid }) => {
    const res = Uni.enrollCourse(game.state, cid);
    if (!result(res)) return;
    uniUI.examActive = false;
    saveGame(true);
  },
  uniLecture: ({ cid }) => {
    const onCampus = isPlayerOnCampus();
    const res = Uni.attendLecture(game.state, {
      courseId: cid || game.state.academic?.activeCourseId,
      inGameMs: getClock(),
      onCampus,
    });
    if (!result(res)) return;
    saveGame(true);
  },
  uniStudy: ({ mode }) => {
    const res = Uni.studySession(game.state, { mode: mode || (isPlayerOnCampus() ? 'library' : 'portal') });
    if (!result(res)) return;
    saveGame(true);
  },
  uniStartExam: () => {
    const cid = game.state.academic?.activeCourseId;
    if (!cid) { result({ ok: false, msg: 'Enroll in a course first!' }); return; }
    uniUI.examActive = true;
    uniUI.answers = [null, null, null];
  },
  uniPickAnswer: ({ q, opt }) => {
    uniUI.answers[Number(q)] = Number(opt);
  },
  uniSubmitExam: () => {
    const cid = game.state.academic?.activeCourseId;
    if (!cid) return;
    if (uniUI.answers.some((a) => a === null || a === undefined)) {
      result({ ok: false, msg: 'Answer all 3 exam questions before submitting!' });
      return;
    }
    const res = Uni.submitCourseExam(game.state, cid, uniUI.answers, Time.dayOf(getClock()));
    uniUI.examActive = false;
    if (!result(res)) return;
    saveGame(true);
  },
  uniWearGown: () => {
    const s = game.state;
    if (!Cust.ownsClothing(s, 'top', 'gown')) {
      result({ ok: false, msg: 'Graduate at least 1 university course (or visit Maison Verve) to unlock the Academic Gown!' });
      return;
    }
    Cust.equipClothing(s, 'top', 'gown');
    if (Cust.ownsClothing(s, 'hat', 'mortarboard')) Cust.equipClothing(s, 'hat', 'mortarboard');
    game.player.char.setAppearance(s.appearance);
    game.player.char.setOccupation(null);
    if (net) net.setAppearance(s.appearance);
    sfx.cash();
    toast('🎓 Wearing your Academic Convocation Gown & Mortarboard Cap!', 'good');
    saveGame(true);
  },
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
    v.warnState = VCard.createWarningState(v.cond);
    v.syncMesh(city.groundY(v.x, v.z));
    game.vehicles.push(v);
    saveGame(true);
  },
  refuel: ({ veh }) => {
    const s = game.state;
    const v = game.vehicles.find((x) => x.data.id === veh);
    if (!v) return;
    const cost = VCond.refuelCost(v.cond, v.data.model);
    if (cost <= 0) { result({ ok: false, msg: 'Tank is already full.' }); return; }
    if (s.cash < cost) { result({ ok: false, msg: `You need ${money(cost - s.cash)} more.` }); return; }
    s.cash -= cost;
    v.cond.fuel = 100;
    v.stallNotified = false;
    VCard.rearmWarnings(ensureWarnState(v), v.cond);
    updateVehicleTelemetry(0, true);
    sfx.pump();
    result({ ok: true, msg: `⛽ ${v.model.name} refuelled (${money(cost)})` });
    saveGame(true);
  },
  mechDealer: () => {
    openMechanicAt({ name: 'Metro Motors', markup: MOTORS_REPAIR_MARKUP, ...DEALERSHIP.interact });
  },
  serviceBay: () => {
    openMechanicAt({ name: 'Apex Auto Garage', markup: 1, ...city.lots.garage.interact });
  },
  repair: ({ veh }) => {
    const s = game.state;
    const shop = game.modalShop;
    const v = game.vehicles.find((x) => x.data.id === veh);
    if (!shop || !v) return;
    const opts = VCond.repairOptions(v.cond, shop.markup);
    if (opts.total <= 0) { result({ ok: false, msg: 'Nothing to repair.' }); return; }
    if (s.cash < opts.total) { result({ ok: false, msg: `You need ${money(opts.total - s.cash)} more.` }); return; }
    s.cash -= opts.total;
    VCond.applyRepairs(v.cond, shop.markup);
    v.data.wrecked = false;
    v.data.lastServicedInGameMs = Math.round(getClock());
    v.setScorched(false);
    v.exhaustSmoke.visible = false;
    VCard.rearmWarnings(ensureWarnState(v), v.cond);
    updateVehicleTelemetry(0, true);
    sfx.wrench();
    result({ ok: true, msg: `🔧 ${v.model.name} repaired (${money(opts.total)})` });
    saveGame(true);
  },
  tow: ({ veh }) => {
    const s = game.state;
    const shop = game.modalShop;
    const v = game.vehicles.find((x) => x.data.id === veh);
    if (!shop || !v) return;
    if (s.cash < TOW_PRICE) { result({ ok: false, msg: `You need ${money(TOW_PRICE - s.cash)} more.` }); return; }
    s.cash -= TOW_PRICE;
    if (game.player.vehicle === v) exitVehicle();
    const spot = towSpotNear(shop.x, shop.z);
    v.teleport(spot.x, spot.z, spot.yaw);
    sfx.tone(110, 0.5, 'sawtooth', 0.06);
    result({ ok: true, msg: `🚛 ${v.model.name} towed to ${shop.name}.` });
    saveGame(true);
  },
  roadsideRepair: ({ veh }) => {
    const s = game.state;
    const v = game.vehicles.find((x) => x.data.id === veh);
    if (!v) return;
    const hasGarage = !!s.businesses.garage;
    const quote = VCond.roadsideRepairQuote(v.cond, hasGarage);
    if (quote.total <= 0) { result({ ok: false, msg: 'Nothing to repair.' }); return; }
    if (s.cash < quote.total) { result({ ok: false, msg: `You need ${money(quote.total - s.cash)} more.` }); return; }
    s.cash -= quote.total;
    VCond.applyRoadsideRepairs(v.cond, hasGarage);
    v.data.wrecked = false;
    v.data.lastServicedInGameMs = Math.round(getClock());
    v.setScorched(false);
    v.exhaustSmoke.visible = false;
    VCard.rearmWarnings(ensureWarnState(v), v.cond);
    updateVehicleTelemetry(0, true);
    sfx.wrench();
    result({ ok: true, msg: `🔧 Mobile mechanic repaired your ${v.model.name} on the spot (${money(quote.total)})` });
    saveGame(true);
  },
  roadsideFuel: ({ veh }) => {
    const s = game.state;
    const v = game.vehicles.find((x) => x.data.id === veh);
    if (!v || !VCond.canEmergencyRefuel(v.cond)) return;
    if (s.cash < ROADSIDE_FUEL_FEE) { result({ ok: false, msg: `You need ${money(ROADSIDE_FUEL_FEE - s.cash)} more.` }); return; }
    s.cash -= ROADSIDE_FUEL_FEE;
    const { added } = VCond.applyEmergencyRefuel(v.cond);
    v.stallNotified = false;
    VCard.rearmWarnings(ensureWarnState(v), v.cond);
    updateVehicleTelemetry(0, true);
    sfx.pump();
    result({ ok: true, msg: `⛽ Roadside assist added +${Math.round(added)}% fuel (${money(ROADSIDE_FUEL_FEE)})` });
    saveGame(true);
  },
  roadsideTow: ({ veh }) => {
    const s = game.state;
    const shop = preferredShop();
    const v = game.vehicles.find((x) => x.data.id === veh);
    if (!v) return;
    if (s.cash < TOW_PRICE) { result({ ok: false, msg: `You need ${money(TOW_PRICE - s.cash)} more.` }); return; }
    s.cash -= TOW_PRICE;
    const wasInCar = game.player.vehicle === v;
    if (wasInCar) detachFromVehicle();
    const spot = towSpotNear(shop.x, shop.z);
    v.teleport(spot.x, spot.z, spot.yaw);
    if (wasInCar) {
      game.player.x = shop.x;
      game.player.z = shop.z;
      game.player.vx = game.player.vz = 0;
      unstickPlayer();
    }
    sfx.tone(110, 0.5, 'sawtooth', 0.06);
    result({ ok: true, msg: `🚛 ${v.model.name} towed to ${shop.name} (${money(TOW_PRICE)}).` });
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
// Character creator & Personal Wardrobe
// ---------------------------------------------------------------------------
function buildCreatorUI() {
  const s = game.state;
  const swatch = (containerId, list, key) => {
    const el = $(containerId);
    if (!el) return;
    el.innerHTML = list.map((c) => `<button class="swatch ${s.appearance[key] === c ? 'active' : ''}" data-key="${key}" data-val="${c}" style="background:${c}"></button>`).join('');
  };
  const chips = (containerId, list, key) => {
    const el = $(containerId);
    if (!el) return;
    el.innerHTML = list.map((c) => `<button class="chip ${s.appearance[key] === c ? 'active' : ''}" data-key="${key}" data-val="${c}">${c}</button>`).join('');
  };
  const slotChips = (containerId, slot) => {
    const el = $(containerId);
    if (!el) return;
    const items = Object.values(CLOTHING_ITEMS[slot] || {});
    el.innerHTML = items.map((item) => {
      const owned = Cust.ownsClothing(s, slot, item.id);
      const active = (s.appearance[item.field] || '') === item.id;
      const label = owned ? item.name : `🔒 ${item.name} (${money(item.price)})`;
      return `<button class="chip ${active ? 'active' : ''} ${owned ? '' : 'locked'}" data-slot="${slot}" data-item="${item.id}">${label}</button>`;
    }).join('');
  };
  swatch('cc-skin', SKIN_TONES, 'skin');
  swatch('cc-shirt', SHIRT_COLORS, 'shirt');
  swatch('cc-pants', PANTS_COLORS, 'pants');
  swatch('cc-shoecolor', SHOE_COLORS, 'shoeColor');
  swatch('cc-hatcolor', SHIRT_COLORS, 'hatColor');
  swatch('cc-hair', HAIR_COLORS, 'hair');
  chips('cc-hairstyle', HAIR_STYLES, 'hairStyle');
  chips('cc-build', Object.keys(BUILDS), 'build');
  slotChips('cc-topstyle', 'top');
  slotChips('cc-bottomstyle', 'bottom');
  slotChips('cc-shoestyle', 'shoe');
  slotChips('cc-hatstyle', 'hat');
  slotChips('cc-glasses', 'glasses');
  slotChips('cc-chain', 'chain');
  $('cc-name').value = s.appearance.name;
}
$('creator').addEventListener('click', (e) => {
  const slotBtn = e.target.closest('[data-slot]');
  if (slotBtn) {
    const res = Cust.equipClothing(game.state, slotBtn.dataset.slot, slotBtn.dataset.item);
    if (!res.ok) { sfx.error(); toast(res.msg, 'warn'); return; }
    game.player.char.setAppearance(game.state.appearance);
    game.player.char.setOccupation(null);
    buildCreatorUI();
    sfx.click();
    return;
  }
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
  const s = game.state;
  const pickOwned = (slot, fallback) => {
    const owned = Object.values(CLOTHING_ITEMS[slot] || {}).filter((it) => Cust.ownsClothing(s, slot, it.id));
    return owned.length ? owned[Math.floor(Math.random() * owned.length)].id : fallback;
  };
  const base = Eco.randomAppearance(Math.random, s.appearance.name);
  s.appearance = {
    ...base,
    topStyle: pickOwned('top', 'tee'),
    bottomStyle: pickOwned('bottom', 'jeans'),
    shoeStyle: pickOwned('shoe', 'sneakers'),
    hatStyle: pickOwned('hat', 'none'),
    glasses: pickOwned('glasses', 'none'),
    chain: pickOwned('chain', 'none'),
  };
  game.player.char.setAppearance(s.appearance);
  game.player.char.setOccupation(null);
  buildCreatorUI();
});
$('cc-done').addEventListener('click', () => closeCreator());
function openCreator() {
  if (game.player.vehicle) { toast('Step out of the car to change your look.', 'bad'); return; }
  closeModal();
  game.creatorOpen = true;
  game.player.char.setOccupation(null); // show casual clothes while editing
  syncCameraViewMode();
  buildCreatorUI();
  $('creator').classList.remove('hidden');
}
function closeCreator() {
  if (!game.creatorOpen) return;
  game.creatorOpen = false;
  $('creator').classList.add('hidden');
  game.player.char.setOccupation(game.state.activeJob);
  game.player.char.setCarrying(!!(game.task && game.task.carrying));
  syncCameraViewMode();
  document.activeElement?.blur?.();
  saveGame(true);
  if (net) net.setAppearance(game.state.appearance);
}
$('btn-camera')?.addEventListener('click', () => toggleCameraMode());
$('btn-uni')?.addEventListener('click', () => (game.modal ? closeModal() : openUniversity()));
$('btn-build')?.addEventListener('click', () => toggleBuildMode());
$('btn-creator').addEventListener('click', () => (game.creatorOpen ? closeCreator() : openCreator()));
$('btn-garage').addEventListener('click', () => (game.modal ? closeModal() : openGarageModal()));
$('btn-emotes')?.addEventListener('click', () => (game.modal ? closeModal() : openEmotesModal()));

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
    if (v.cond.hp <= 0) continue; // wrecks wait for the mechanic, not the driver
    const d = dist2(v, game.player);
    const reach = (maxDist + v.model.len * 0.35) ** 2;
    if (d < reach && d < bd + v.model.len) { bd = d; best = v; }
  }
  return best;
}

function enterVehicle(v, silent = false) {
  const p = game.player;
  p.vehicle = v;
  v.occupied = true;
  game.state.lastVehicleId = v.data.id;
  const ch = p.char;
  v.mesh.add(ch.group);
  ch.group.position.copy(v.parts.seat);
  ch.group.rotation.set(0, 0, 0);
  ch.group.scale.setScalar(v.parts.seatScale);
  ch.setPose('sit');
  ch.parcel.visible = false;
  v.mesh.add(playerHeadlight);
  v.mesh.add(playerHeadlight.target);
  playerHeadlight.position.set(0, 0.72, v.model.len / 2 - 0.1);
  playerHeadlight.target.position.set(0, 0.1, v.model.len / 2 + 16);
  v.syncMesh(city.groundY(v.x, v.z));
  p.y = city.groundY(v.x, v.z);
  p.vy = 0;
  updateDayNight(getClock(), true);
  cam.yaw = v.yaw;
  cam.cockpitYaw = 0;
  cam.cockpitPitch = -0.05;
  syncCameraViewMode();
  $('vehicle-hud').classList.remove('hidden');
  $('veh-name').textContent = v.model.name;
  updateVehicleTelemetry(0, true);
  if (!silent) sfx.tone(120, 0.3, 'sawtooth', 0.05);
}

function detachFromVehicle() {
  const p = game.player;
  const prev = p.vehicle;
  const ch = p.char;
  scene.add(ch.group);
  ch.group.scale.setScalar(1);
  ch.setPose('stand');
  ch.setCarrying(!!(game.task && game.task.carrying));
  p.vehicle = null;
  if (prev) {
    prev.setCockpitView(false);
    prev.occupied = false;
    prev.syncMesh(city.groundY(prev.x, prev.z));
    cam.yaw = prev.yaw;
  }
  cam.cockpitYaw = 0;
  cam.fpPitch = -0.02;
  syncCameraViewMode();
  playerHeadlight.visible = false;
  scene.add(playerHeadlight);
  scene.add(playerHeadlight.target);
  $('vehicle-hud').classList.add('hidden');
  $('veh-fault')?.classList.add('hidden');
  $('vicon-fuel')?.classList.remove('blink');
  fuelTickTimer = 0;
  sfx.setEngine(false, 0);
  sfx.setSkid(false, 0);
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
  p.y = city.groundY(p.x, p.z); p.vy = 0; p.onGround = true;
  cam.yaw = v.yaw;
}

function wreckVehicle(v) {
  v.data.wrecked = true;
  v.speed = 0; v.vx = 0; v.vz = 0;
  v.setScorched(true);
  streetFX.spawnExplosion(v.x, v.y, v.z);
  sfx.setEngine(false, 0);
  sfx.setSkid(false, 0);
  sfx.explosion();
  cam.shake = Math.max(cam.shake, 0.92);
  if (game.player.vehicle === v) exitVehicle();
  triggerOffense('explosion');
  toast(`💥 Your ${v.model.name} exploded! Press T (or E nearby) to call a tow (${money(TOW_PRICE)}) or mobile mechanic.`, 'danger');
  saveGame(true);
}

function toggleVehicle() {
  if (game.creatorOpen) return;
  if (game.seat) { standUpFromProp(); return; }
  if (game.player.vehicle) { exitVehicle(); return; }
  const v = nearestOwnedVehicle(3.2);
  if (v) enterVehicle(v);
  else if (game.vehicles.some((x) => x.cond.hp <= 0 && dist2(x, game.player) < 4.2 * 4.2)) toast('That car is wrecked — press E or T to call a tow or mobile mechanic.', 'warn');
  else if (game.state.vehicles.length) toast('No car nearby. Press V for valet or T for Garage & Roadside.', '');
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
  const v = game.vehicles.find((x) => x.data.id === s.lastVehicleId && x.cond.hp > 0)
    || game.vehicles.find((x) => x.cond.hp > 0)
    || game.vehicles[0];
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
    ps.char.armR.rotation.x = -2.6 + Math.sin(game.elapsed * 8) * 0.3;
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
  // seated on furniture: the only prompt is to get up
  if (!inCar && game.seat) return { e: { text: '🚶 Stand up', action: () => standUpFromProp() }, f: null };
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
  if (inCar) {
    if (!out.e && p.vehicle.cond.fuel <= 0) {
      out.e = { text: 'Roadside assist / emergency fuel', action: () => openGarageModal(p.vehicle.data.id) };
    }
    out.f = { text: 'Exit vehicle' };
    return out;
  }
  if (!out.e) {
    let best = null; let bd = Infinity;
    // weight > 1 lowers priority (moving citizens shouldn't steal the prompt from fixed places)
    const insideNow = city.buildingAt(p.x, p.z);
    const onUpper = !!insideNow && insideNow.building.kind === 'tower' && p.y > insideNow.building.baseY + 1.4;
    const consider = (x, z, r, text, action, weight = 1) => {
      if (onUpper) return; // upper storeys can't reach street-level pads (the lift is added separately)
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < r * r && d * weight < bd) { bd = d * weight; best = { text, action }; }
    };
    for (const st of Object.values(STATIONS)) {
      const active = game.state.activeJob === st.occupation;
      consider(st.interact.x, st.interact.z, 2.6, `${st.name}: ${active ? 'on shift' : 'clock in'}`, () => openModal(stationModal(st.id)));
    }
    consider(DEALERSHIP.interact.x, DEALERSHIP.interact.z, 2.8, 'Metro Motors: exotics, customs & mechanic', () => openModal(dealerModal()));
    consider(BOUTIQUE.interact.x, BOUTIQUE.interact.z, 2.8, 'Maison Verve Boutique: luxury outfits & chains', () => openBoutique());
    for (const sp of (city.universitySpots || [])) {
      consider(sp.x, sp.z, 3.6, sp.prompt.replace(/^Press E — /, ''), () => openUniversity(sp.mode));
    }
    for (const st of Object.values(FUEL_STATIONS)) {
      consider(st.interact.x, st.interact.z, 3.4, `⛽ Refuel at ${st.name}`, () => startRefuel(st));
    }
    for (const [id, lot] of Object.entries(city.lots)) {
      const def = BUSINESSES[id]; const biz = game.state.businesses[id];
      consider(lot.interact.x, lot.interact.z, 2.8, biz ? `Manage ${def.name}` : `Vacant lot: ${def.name} (${money(def.cost)})`, () => openModal(lotModal(id)));
    }
    for (const ov of game.vehicles) {
      const wrecked = ov.data.wrecked || ov.cond.hp <= 0;
      const stalled = !wrecked && ov.cond.fuel <= 0;
      if (wrecked || stalled) {
        const label = wrecked
          ? `🚛 Roadside assist for wrecked ${ov.model.name}`
          : `⛽ Roadside assist for stalled ${ov.model.name}`;
        consider(ov.x, ov.z, 3.8 + ov.model.len * 0.25, label, () => openGarageModal(ov.data.id), 2);
      }
    }
    for (const c of game.citizens) {
      const label = c.data.employer ? `Chat with ${c.data.name}` : `Talk to ${c.data.name} (looking for work)`;
      consider(c.x, c.z, 2.2, label, () => { c.idle = 3; c.yaw = Math.atan2(p.x - c.x, p.z - c.z); openModal(hireModal(c.data.id)); }, 6);
    }
    // walk-in building interiors: lifts + reception desks
    for (const spot of city.indoorSpots) {
      consider(spot.x, spot.z, 3.3, spot.prompt, () => openIndoorSpot(spot), 0.8);
    }
    const lift = city.towerLiftNear(p.x, p.z);
    if (lift && lift.dist < 4.4) {
      const lvl = levelIn(lift.building);
      const dl = (lift.landing.x - p.x) ** 2 + (lift.landing.z - p.z) ** 2;
      if (best === null || dl * 0.55 < bd) {
        bd = dl * 0.55;
        best = { text: `🛗 ${lift.building.name} lift — ${Interiors.floorLabel(lift.building, lvl)}`, action: openElevatorModal };
      }
    }

    // ---- interactive furniture, doors & service counters (any floor) --------
    let local = null; let localD = Infinity;
    const pushLocal = (x, z, r, text, action, weight = 1) => {
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d >= r * r) return;
      if (d * weight < localD) { localD = d * weight; local = { text, action }; }
    };
    for (const spot of city.propSpotsNear(p.x, p.z, p.y, 2.6)) {
      const def = Props.interactionFor(spot.type);
      if (!def) continue;
      pushLocal(spot.x, spot.z, 2.6, `${def.icon} ${def.verb}`, () => usePropSpot(spot), 0.8);
    }
    for (const spot of builtPropSpotsNear(p.x, p.z, p.y, 2.6)) {
      const def = Props.interactionFor(spot.type);
      if (!def) continue;
      pushLocal(spot.x, spot.z, 2.6, `${def.icon} ${def.verb} (your build)`, () => usePropSpot(spot), 0.8);
    }
    for (const spot of city.serviceSpotsNear(p.x, p.z, p.y, 4.2)) {
      pushLocal(spot.x, spot.z, 4.2, spot.prompt, () => openServiceForBuilding(spot.placeId), 0.62);
    }
    if (!onUpper) {
      for (const d of city.districtSpots) {
        pushLocal(d.x, d.z, 5.2, `${d.icon} ${d.name}`, () => openPlaceService(d.id), 0.9);
      }
    }
    const door = city.nearestDoor(p.x, p.z, p.y, 3.2);
    if (door) {
      game.nearDoor = door;
      pushLocal(door.x, door.z, 3.2, `${door.open ? '🚪 Close' : '🚪 Open'} ${door.label}`, () => {
        const res = Props.toggleDoorState(door);
        if (res.ok) { sfx.door?.(); toast(res.msg, 'good'); } else { sfx.error(); toast(res.msg, 'warn'); }
      }, 0.7);
    } else {
      game.nearDoor = null;
    }
    if (local && (best === null || localD < bd)) best = local;
    out.e = best;
  }
  const v = nearestOwnedVehicle(3.2);
  if (v) out.f = { text: `Get in ${v.model.name}` };
  return out;
}

function interact() {
  if (game.creatorOpen) return;
  if (game.seat && !game.prompt?.e?.action) { standUpFromProp(); return; }
  const it = game.prompt;
  if (it && it.e && it.e.action) it.e.action();
}



// ===========================================================================
// Interactive furniture: sitting, sleeping, TV, bookshelves, gym, service desks
// ===========================================================================
function seatOffsetY() {
  // The player's y is already the seat surface, so the group needs no lift.
  return 0;
}

/** Camera / eye height above the seat while sitting or lying down. */
function seatedEyeHeight() {
  if (!game.seat) return 1.55;
  return game.seat.pose === 'lie' ? 0.42 : game.seat.pose === 'sit' ? 0.95 : 1.55;
}

function buildingNameOf(id) {
  const b = id ? city.buildingById(id) : null;
  return b ? b.name : '';
}

/**
 * Sit / lie / use a prop. `spot.y` is the floor, and the prop's real seat
 * geometry (cushion or mattress height) raises the body so it rests on the
 * furniture instead of floating above it.
 */
function sitOnProp(spot, def, opts = {}) {
  const p = game.player;
  if (p.vehicle) return;
  const seat = Props.seatFor(spot.type) || {
    surface: 0, pose: opts.pose || def?.pose || 'sit', forward: 0, recline: 0,
  };
  const yaw = Number.isFinite(opts.faceYaw) ? opts.faceYaw : (spot.rot || 0) + (seat.yawOffset || 0);
  game.seat = {
    spot, pose: seat.pose, seat, yaw,
    watch: opts.watch || null, action: opts.action || null,
  };
  // some props (the desk) seat you on a chair offset from the prop centre
  const ox = seat.offset ? Math.sin(spot.rot || 0) * seat.forward : 0;
  const oz = seat.offset ? Math.cos(spot.rot || 0) * seat.forward : 0;
  p.x = spot.x + ox; p.z = spot.z + oz;
  p.y = (Number.isFinite(spot.y) ? spot.y : p.y) + (seat.surface || 0);
  p.yaw = yaw;
  p.vx = p.vz = 0; p.vy = 0; p.onGround = true;
  p.char.seat = seat;
  p.char.setPose(seat.pose);
  p.char.group.position.set(p.x, p.y, p.z);
  p.char.group.rotation.y = p.yaw;
  cam.yaw = p.yaw;
  if (seat.pose === 'lie') cam.pitch = 0.24;
  if (game.seat.watch) city.setTVOn(game.seat.watch, true);
  return game.seat;
}

function standUpFromProp(quiet = false) {
  if (!game.seat) return false;
  const p = game.player;
  const { spot } = game.seat;
  if (game.seat.watch) city.setTVOn(game.seat.watch, false);
  p.char.stopAction();
  p.char.seat = null;
  p.char.setPose('stand');
  const yaw = game.seat.yaw ?? (spot.rot || 0);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  let sx; let sz;
  if (game.seat.seat?.offset) {
    // already seated on a chair offset from the prop centre — just stand there
    sx = p.x; sz = p.z;
  } else {
    sx = spot.x + fx * 1.15;
    sz = spot.z + fz * 1.15;
    const res = resolveCircle(sx, sz, 0.4, city.colliderCache);
    if (res.hit) { sx = spot.x - fx * 1.15; sz = spot.z - fz * 1.15; }
  }
  p.x = sx; p.z = sz;
  p.y = Number.isFinite(spot.y) ? spot.y : p.y;
  p.vx = p.vz = 0;
  game.seat = null;
  if (!quiet) sfx.click();
  return true;
}

/** Nearest player-built piece that can be used (sofas, beds, desks, lamps...). */
function builtPropSpotsNear(x, z, y, radius = 2.6) {
  const out = [];
  const pieces = game.state?.builds?.pieces || [];
  for (const piece of pieces) {
    const type = Props.propTypeForBuild(piece.item);
    if (!type || !Props.isInteractable(type)) continue;
    if (Math.abs(piece.y - y) > 1.7) continue;
    const d = Math.hypot(piece.x - x, piece.z - z);
    if (d < radius) out.push({ type, x: piece.x, z: piece.z, y: piece.y, rot: piece.rot || 0, built: true });
  }
  return out;
}

function propSpotLabel(spot) {
  const name = buildingNameOf(spot.buildingId);
  return name || (spot.built ? 'your build' : '');
}

function usePropSpot(spot) {
  const s = game.state;
  const def = Props.interactionFor(spot.type);
  if (!def) return;
  if (game.seat) { standUpFromProp(); return; }
  if (game.player.vehicle) { toast('Step out of the car first.', 'warn'); return; }

  // Hotel beds are reserved for paying guests
  if (spot.type === 'bed' && spot.buildingId === 'grand_hotel') {
    const res = Places.sleepHotelNight(s, {});
    if (res.ok) {
      sitOnProp(spot, def, { action: 'sleep' });
      game.player.char.playAction('sleep', { loop: true });
      toast(res.msg, 'good');
      sfx.cash();
      saveGame(true);
      updateHUD(true);
    } else {
      toast(`${res.msg} (Front desk is in the lobby.)`, 'warn');
      sfx.error();
    }
    return;
  }

  if (def.service) {
    openServiceForBuilding(spot.buildingId);
    return;
  }

  // TV & cinema: take a seat facing the screen, switch it on and watch it
  if (spot.type === 'tvwall' || spot.type === 'cinema_screen') {
    return watchScreen(spot, def);
  }

  const res = Props.useProp(s, spot.type, { now: Date.now(), spot: propSpotLabel(spot) });
  if (!res.ok) { toast(res.msg, 'warn'); sfx.error(); return; }
  let msg = res.msg;
  if (res.study) {
    const study = Uni.studySession(s, { spot: propSpotLabel(spot) || 'study desk' });
    if (study.ok) msg += ` ${study.msg}`;
  }

  // Face the prop you are using, then play its scripted animation
  const action = res.def?.action || null;
  if (res.pose) {
    sitOnProp(spot, res.def, { action });
    const loop = ['tv', 'movie', 'sleep', 'rest', 'sit', 'run', 'benchpress', 'curls'].includes(action);
    if (action) game.player.char.playAction(action, { duration: loop ? 8 : 3.4, loop });
  } else {
    const p = game.player;
    p.yaw = Math.atan2(spot.x - p.x, spot.z - p.z);
    if (action) {
      const loop = ['piano', 'pool', 'run', 'curls', 'benchpress', 'movie'].includes(action);
      p.char.playAction(action, { duration: loop ? 7 : 2.8, loop });
    }
  }
  toast(msg, 'good');
  if (res.fresh) sfx.cash();
  updateHUD(true);
  saveGame(true);
}

/**
 * Watch a TV wall or a cinema screen: sit on the nearest sofa/chair/bench that
 * faces it (or stand in front if there is none), switch the screen on so it
 * actually shows a channel, and play the watching animation.
 */
function watchScreen(spot, def) {
  const p = game.player;
  const screen = spot.screen || null;
  if (!screen) {
    // decorative screen with no live display — fall back to a normal use
    const res = Props.useProp(game.state, spot.type, { now: Date.now(), spot: propSpotLabel(spot) });
    toast(res.msg, 'good');
    return;
  }
  const cinema = spot.type === 'cinema_screen';
  const seats = city.propSpotsNear(spot.x, spot.z, spot.y, cinema ? 12 : 7)
    .filter((s2) => s2 !== spot && Props.isSeating(s2.type));
  let seat = null;
  let bestD = Infinity;
  for (const s2 of seats) {
    const d = (s2.x - spot.x) ** 2 + (s2.z - spot.z) ** 2;
    if (d < bestD) { bestD = d; seat = s2; }
  }
  // Face the screen from the seat (screen front is +Z in prop space)
  if (seat) {
    const yaw = Math.atan2(spot.x - seat.x, spot.z - seat.z);
    sitOnProp(seat, Props.interactionFor(seat.type), {
      faceYaw: yaw, watch: screen, action: cinema ? 'movie' : 'tv',
    });
    game.player.char.playAction(cinema ? 'movie' : 'tv', { loop: true, duration: 30 });
  } else {
    const fx = Math.sin(spot.rot || 0);
    const fz = Math.cos(spot.rot || 0);
    const anchor = {
      type: 'tvwall', x: spot.x + fx * 2.1, z: spot.z + fz * 2.1,
      y: spot.y, rot: Math.atan2(-fx, -fz), buildingId: spot.buildingId,
    };
    sitOnProp(anchor, { pose: 'stand', action: '' }, { watch: screen, action: 'tv' });
    game.player.char.seat = null;
    game.player.char.setPose('stand');
    game.player.char.playAction(cinema ? 'movie' : 'tv', { loop: true, duration: 30 });
    game.seat.pose = 'stand';
    game.seat.spot = { ...anchor, y: spot.y };
  }
  city.setTVOn(screen, true);
  sfx.click();
  toast(cinema ? '🎬 The film starts — enjoy the show.' : '📺 You switch the TV on and settle in.', 'good');
  updateHUD(true);
}

/** Open the right counter for a building (station, boutique, lot or public place). */
function openServiceForBuilding(buildingId) {
  if (!buildingId) { toast('There is no service desk here.', 'warn'); return; }
  if (Places.placeById(buildingId)) { openPlaceService(buildingId); return; }
  if (buildingId === 'dealership') { openModal(dealerModal()); return; }
  if (buildingId.startsWith('fuel-')) { openModal(fuelShopModal(buildingId.slice(5))); return; }
  if (buildingId === 'boutique') { openBoutique(); return; }
  const station = Object.values(STATIONS).find((st) => buildingId === `station-${st.id}`);
  if (station) { openModal(stationModal(station.id)); return; }
  if (buildingId.startsWith('lot-')) { openModal(lotModal(buildingId.slice(4))); return; }
  toast('The desk is unattended right now.', '');
}

// ===========================================================================
// Swing doors
// ===========================================================================
function toggleNearbyDoor() {
  const p = game.player;
  const door = city.nearestDoor(p.x, p.z, p.y, 3.4);
  if (!door) return false;
  const res = Props.toggleDoorState(door);
  if (res.ok) {
    sfx.door?.();
    cam.shake = Math.max(cam.shake, 0.04);
  } else {
    sfx.error();
  }
  toast(res.msg, res.ok ? 'good' : 'warn');
  return true;
}

// ===========================================================================
// Public place service desks (hotel, hospital, museum, mall, gym, library)
// ===========================================================================
function openPlaceService(placeId) {
  const place = Places.placeById(placeId);
  if (!place) return;
  game.placeService = placeId;
  openModal(placeServiceModal(placeId));
}

function hotelCard() {
  const s = game.state;
  const status = Places.hotelStatus(s);
  const leisure = s.leisure || Props.createLeisureState();
  const roomCards = Places.HOTEL_ROOMS.map((r) => `
    <div class="svc-card">
      <div class="svc-head"><b>${r.icon} ${r.name}</b><span class="svc-price">$${r.price} / night</span></div>
      <p class="muted">${r.blurb}</p>
      <div class="row">
        ${[1, 2, 3].map((n) => `<button data-action="hotelBook" data-room="${r.id}" data-nights="${n}" ${s.cash < r.price * n || status ? 'disabled' : ''}>${n} night${n > 1 ? 's' : ''} · $${r.price * n}</button>`).join('')}
      </div>
    </div>`).join('');
  return `
    <h2>🏨 The Grand Meridian Hotel — Front Desk</h2>
    <p class="sub">Sleep restores energy, comfort and health. Rooms are charged per night · cash <b>${money(s.cash)}</b> · fatigue <b>${Math.round(leisure.energy)}%</b></p>
    ${status ? `<div class="svc-banner">🗝 ${status.label}<div class="row"><button data-action="hotelCheckout">🧾 Check out</button><button data-action="hotelSleep" class="primary">🛏 Sleep a night</button></div></div>` : ''}
    ${roomCards}
    <p class="muted">Your key card opens the room floors above — ride the lift and sleep in any hotel bed.</p>
    <div class="actions"><button data-action="close">Close</button></div>`;
}

function hospitalCard() {
  const s = game.state;
  const leisure = s.leisure || Props.createLeisureState();
  const tiers = [
    { id: 'checkup', name: 'Quick checkup', price: 45, blurb: '+25 health, +8 comfort.' },
    { id: 'emergency', name: 'Emergency treatment', price: 120, blurb: '+60 health, +30 energy.' },
    { id: 'full', name: 'Full-body treatment', price: 260, blurb: 'Restores health & energy completely.' },
  ];
  return `
    <h2>🏥 Metro General Hospital — Reception</h2>
    <p class="sub">Walk-in clinic & 24/7 emergency · cash <b>${money(s.cash)}</b> · health <b>${Math.round(leisure.health)}%</b></p>
    <div class="svc-grid">
      ${tiers.map((t) => `
        <div class="svc-card">
          <div class="svc-head"><b>${t.name}</b><span class="svc-price">$${t.price}</span></div>
          <p class="muted">${t.blurb}</p>
          <button data-action="hospitalTreat" data-tier="${t.id}" ${s.cash < t.price ? 'disabled' : ''}>Treat me</button>
        </div>`).join('')}
    </div>
    <p class="muted">Treatment beds inside are interactive too — press <kbd>E</kbd> beside one for a $25 rest.</p>
    <div class="actions"><button data-action="close">Close</button></div>`;
}

function museumCard() {
  const s = game.state;
  const tickets = [
    { id: 'general', name: 'General admission', price: 22, blurb: 'Wander the galleries at your own pace.' },
    { id: 'guided', name: 'Curator guided tour', price: 48, blurb: 'A full tour of the collection.' },
    { id: 'patron', name: 'Patron evening', price: 150, blurb: 'After-hours tour, rooftop champagne & a $25 gift-shop voucher.' },
  ];
  return `
    <h2>🖼 Metro Museum of Art — Ticketing</h2>
    <p class="sub">Three galleries, a sculpture court and a rooftop gallery · cash <b>${money(s.cash)}</b></p>
    <div class="svc-grid">
      ${tickets.map((t) => `
        <div class="svc-card">
          <div class="svc-head"><b>${t.name}</b><span class="svc-price">$${t.price}</span></div>
          <p class="muted">${t.blurb}</p>
          <button data-action="museumTicket" data-tier="${t.id}" ${s.cash < t.price ? 'disabled' : ''}>Buy ticket</button>
        </div>`).join('')}
    </div>
    <div class="actions"><button data-action="close">Close</button></div>`;
}

function mallCard() {
  const s = game.state;
  return `
    <h2>🛍 Metro Central Mall &amp; Cineplex — Concierge</h2>
    <p class="sub">Boutiques, food court & six-screen cinema · cash <b>${money(s.cash)}</b></p>
    <div class="svc-grid">
      <div class="svc-card">
        <div class="svc-head"><b>👗 Fashion boutiques</b></div>
        <p class="muted">Maison Verve couture, chains, shades & footwear.</p>
        <button class="primary" data-action="mallBoutique">Browse the racks</button>
      </div>
      <div class="svc-card">
        <div class="svc-head"><b>🍽 Food court</b><span class="svc-price">$9–$18</span></div>
        <p class="muted">Hot meals and smoothies that restore energy & comfort.</p>
        <div class="row">${Places.FOOD_COURT_MEALS.map((m) => `<button data-action="mallMeal" data-meal="${m.id}" ${s.cash < m.price ? 'disabled' : ''}>${m.name} · $${m.price}</button>`).join('')}</div>
      </div>
      <div class="svc-card">
        <div class="svc-head"><b>🎬 Cineplex</b><span class="svc-price">$20–$24</span></div>
        <p class="muted">Grab a ticket and unwind in the dark.</p>
        <div class="row">${Places.MOVIES.map((m) => `<button data-action="movieTicket" data-movie="${m.id}" ${s.cash < m.price ? 'disabled' : ''}>${m.icon} ${m.title} · $${m.price}</button>`).join('')}</div>
      </div>
    </div>
    <div class="actions"><button data-action="close">Close</button></div>`;
}

function gymCard() {
  const s = game.state;
  const leisure = s.leisure || Props.createLeisureState();
  const offers = Object.entries(Places.GYM_OFFERS).map(([id, o]) => `
    <div class="svc-card">
      <div class="svc-head"><b>🏋 ${o.name}</b><span class="svc-price">$${o.price}</span></div>
      <p class="muted">+${o.fitness} fitness, +${o.comfort} comfort.</p>
      <button data-action="gymOffer" data-offer="${id}" ${s.cash < o.price ? 'disabled' : ''}>Buy</button>
    </div>`).join('');
  return `
    <h2>🏋 Metro Iron Fitness Club — Front Desk</h2>
    <p class="sub">Fitness makes you sprint faster · fitness <b>${Math.round(leisure.fitness)}%</b> · cash <b>${money(s.cash)}</b></p>
    <div class="svc-grid">${offers}</div>
    <p class="muted">Treadmills, weight benches and dumbbell racks inside are all interactive — just walk up and press <kbd>E</kbd>.</p>
    <div class="actions"><button data-action="close">Close</button></div>`;
}

function libraryCard() {
  const s = game.state;
  const acad = s.academic || Uni.createAcademicState();
  const course = acad.activeCourseId ? Uni.COURSE_BY_ID[acad.activeCourseId] : null;
  const credits = course ? (acad.creditsByCourse[course.id] || 0) : 0;
  return `
    <h2>📚 Metro Public Library — Front Desk</h2>
    <p class="sub">${course ? `Studying <b>${course.code} — ${course.title}</b> · ${credits}/${course.creditsRequired} credits` : 'No active course — enroll at Metro Grand University (U)'}</p>
    <div class="svc-grid">
      <div class="svc-card">
        <div class="svc-head"><b>📖 Study session</b></div>
        <p class="muted">Quiet reading room + research desks. Earns course credits and a study stipend.</p>
        <button class="primary" data-action="libraryStudy">Study now</button>
      </div>
      <div class="svc-card">
        <div class="svc-head"><b>📕 Borrow a novel</b></div>
        <p class="muted">Free. Restores comfort and counts as reading.</p>
        <button data-action="libraryBorrow">Borrow a book</button>
      </div>
    </div>
    <div class="actions"><button data-action="openUni">🎓 Open University catalog</button><button data-action="close">Close</button></div>`;
}

function fuelShopModal(stationId) {
  const st = Object.values(FUEL_STATIONS).find((f) => f.id === stationId) || { name: 'Fuel & Go' };
  return () => {
    const s = game.state;
    const leisure = s.leisure || Props.createLeisureState();
    return `
      <h2>🏪 ${st.name} Express — Counter</h2>
      <p class="sub">Snacks, hot drinks and ready meals · cash <b>${money(s.cash)}</b> · energy <b>${Math.round(leisure.energy)}%</b></p>
      <div class="svc-grid">
        ${Object.entries(Props.SNACKS).map(([id, item]) => `
          <div class="svc-card">
            <div class="svc-head"><b>${item.icon} ${item.name}</b><span class="svc-price">$${item.price}</span></div>
            <p class="muted">+${item.effects.energy} energy${item.effects.comfort ? `, +${item.effects.comfort} comfort` : ''}.</p>
            <button data-action="fuelBuy" data-item="${id}" ${s.cash < item.price ? 'disabled' : ''}>Buy</button>
          </div>`).join('')}
      </div>
      <p class="muted">The shelves, counter and coffee machine inside are interactive too — press <kbd>E</kbd> beside them.</p>
      <div class="actions"><button data-action="close">Close</button></div>`;
  };
}

function placeServiceModal(placeId) {
  return () => {
    if (placeId === 'grand_hotel') return hotelCard();
    if (placeId === 'metro_hospital') return hospitalCard();
    if (placeId === 'metro_museum') return museumCard();
    if (placeId === 'metro_mall') return mallCard();
    if (placeId === 'metro_gym') return gymCard();
    if (placeId === 'metro_library') return libraryCard();
    return '<h2>Front desk</h2><div class="actions"><button data-action="close">Close</button></div>';
  };
}

// ===========================================================================
// Walk-in interiors: lifts, floor badges & interior reception desks
// ===========================================================================
function levelIn(building) {
  return Math.max(0, Math.min(building.floors, Math.round((game.player.y - building.baseY) / Interiors.FLOOR_HEIGHT)));
}

function updateInteriorState() {
  const p = game.player;
  const inside = p.vehicle ? null : city.buildingAt(p.x, p.z);
  if (inside && inside.building.kind === 'tower') {
    const b = inside.building;
    const lvl = levelIn(b);
    city.setActiveInterior(b.id, lvl);
    game.inside = { id: b.id, level: lvl, building: b };
  } else {
    city.clearActiveInterior();
    game.inside = inside ? { id: inside.building.id, level: 0, building: inside.building } : null;
  }
  updateFloorBadge();
}

let floorBadgeText = '';
function updateFloorBadge() {
  const el = $('floor-badge');
  if (!el) return;
  const inside = game.player.vehicle ? null : game.inside;
  if (!inside) {
    if (floorBadgeText) { el.classList.add('hidden'); floorBadgeText = ''; }
    return;
  }
  const b = inside.building;
  const label = b.kind === 'tower' ? Interiors.floorLabel(b, inside.level) : 'Interior';
  const text = `${b.name} · ${label}${b.kind === 'tower' ? ' · 🛗 Press E at the lift' : ''}`;
  if (text !== floorBadgeText) { el.textContent = text; floorBadgeText = text; }
  el.classList.remove('hidden');
}

function openIndoorSpot(spot) {
  if (spot.type === 'station') {
    const st = STATIONS[spot.id];
    if (st) openModal(stationModal(st.id));
    return;
  }
  if (spot.type === 'boutique') { openBoutique(); return; }
  if (spot.type === 'lot') { openModal(lotModal(spot.lot || spot.id)); }
}

function openElevatorModal() {
  const near = city.towerLiftNear(game.player.x, game.player.z);
  if (!near) { toast('Look for the glowing Metro Lift inside a walk-in tower.', ''); return; }
  const b = near.building;
  game.elevatorBuilding = b;
  const stops = Interiors.elevatorStops(b);
  openModal(() => {
    const here = levelIn(b);
    return `
      <h2>🛗 ${b.name} — Metro Lift</h2>
      <p class="sub">${Interiors.themeFor(b.themeId).name} · ${b.floors} floors + Sky Deck · ${stops.length} stops</p>
      <div class="lift-grid">
        ${stops.map((st) => `<button class="lift-btn ${st.level === here ? 'active' : ''}" data-action="rideLift" data-level="${st.level}">
          <b>${st.short}</b><span>${st.label}</span></button>`).join('')}
      </div>
      <p class="muted">Every floor is a real 3D interior — executive offices, apartments, boardrooms, server farms, penthouses and clinics. The top stop is an open-air <b>Sky Deck</b> with a panorama over Metro City.</p>
      <div class="actions"><button data-action="close">Close</button></div>`;
  });
}

function rideElevator(level) {
  const b = game.elevatorBuilding;
  if (!b) { closeModal(); return; }
  if (game.seat) standUpFromProp(true);
  const p = game.player;
  if (p.vehicle) { toast('Step out of the car first.', 'bad'); return; }
  const target = Math.max(0, Math.min(b.floors, level));
  const landing = city.elevatorLanding(b);
  const ceiling = city.ceilingAt(landing.x, landing.z, b.baseY + target * Interiors.FLOOR_HEIGHT);
  p.x = landing.x; p.z = landing.z;
  p.y = b.baseY + target * Interiors.FLOOR_HEIGHT;
  p.vx = p.vz = p.vy = 0; p.onGround = true;
  city.setActiveInterior(b.id, target);
  game.inside = { id: b.id, level: target, building: b };
  closeModal();
  updateFloorBadge();
  if (ceiling && ceiling < p.y + 2) toast('The ceiling feels low here — watch the camera.', 'warn');
  toast(`🛗 ${Interiors.floorLabel(b, target)}`, 'good');
  sfx.tone(320, 0.08, 'triangle', 0.05);
  sfx.tone(480, 0.12, 'triangle', 0.04, 0.09);
}

// ===========================================================================
// 3D Architect Build & Furnish Mode
// ===========================================================================
const BUILD_BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const BUILD_MAT_CACHE = new Map();

function buildMaterial(color, opts = {}) {
  const { glass = false, ghost = false, rough = 0.62, metal = 0.06, glow = false } = opts;
  const key = `${color}|${glass}|${ghost}|${rough}|${metal}|${glow}`;
  const hit = BUILD_MAT_CACHE.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: rough,
    metalness: metal,
    transparent: glass || ghost,
    opacity: glass ? 0.34 : ghost ? 0.48 : 1,
    depthWrite: !(glass || ghost),
  });
  if (glow) { mat.emissive = new THREE.Color(color); mat.emissiveIntensity = 0.85; }
  BUILD_MAT_CACHE.set(key, mat);
  return mat;
}

/** Build a 3D mesh for one placed piece (or its translucent ghost preview). */
function makeBuildMesh(piece, ghost = false) {
  const item = Build.itemById(piece.item);
  const g = new THREE.Group();
  g.position.set(piece.x, piece.y, piece.z);
  g.rotation.y = piece.rot || 0;
  const solid = buildMaterial(piece.color || item?.defaultColor || '#f1f5f9', { ghost });
  const trim = buildMaterial('#334155', { ghost });
  const glass = buildMaterial('#bae6fd', { glass: true, ghost });
  const soft = buildMaterial('#94a3b8', { ghost, rough: 0.8 });
  const dark = buildMaterial('#0f172a', { ghost, rough: 0.4, metal: 0.4 });
  const warm = buildMaterial('#fbbf24', { ghost, glow: true });
  const green = buildMaterial('#22c55e', { ghost, rough: 0.85 });
  const box = (x, y, z, w, h, d, mat, opts = {}) => {
    const m = new THREE.Mesh(BUILD_BOX_GEO, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = !ghost;
    m.receiveShadow = !ghost;
    if (opts.rotX) m.rotation.x = opts.rotX;
    if (opts.rotZ) m.rotation.z = opts.rotZ;
    g.add(m);
    return m;
  };
  switch (piece.item) {
    case 'floor_stone':
    case 'floor_wood':
      box(0, -0.1, 0, 4, 0.2, 4, solid);
      box(0, 0.004, 0, 3.96, 0.012, 3.96, soft);
      box(0, -0.205, 0, 4, 0.09, 0.16, trim);
      break;
    case 'wall_solid':
      box(0, 1.6, 0, 4, 3.2, 0.22, solid);
      box(0, 3.26, 0, 4, 0.16, 0.32, trim);
      box(0, 0.08, 0, 4, 0.16, 0.32, trim);
      break;
    case 'wall_window':
      box(0, 0.45, 0, 4, 0.9, 0.22, solid);
      box(0, 1.7, 0, 4, 1.7, 0.07, glass);
      box(0, 2.79, 0, 4, 0.82, 0.22, solid);
      box(-1.86, 1.7, 0, 0.28, 1.7, 0.3, trim);
      box(1.86, 1.7, 0, 0.28, 1.7, 0.3, trim);
      box(0, 2.6, 0, 4, 0.12, 0.32, trim);
      box(0, 0.84, 0, 4, 0.12, 0.32, trim);
      break;
    case 'wall_door':
      box(-1.55, 1.6, 0, 0.9, 3.2, 0.22, solid);
      box(1.55, 1.6, 0, 0.9, 3.2, 0.22, solid);
      box(0, 2.8, 0, 2.2, 0.8, 0.22, solid);
      box(0, 2.42, 0, 2.4, 0.14, 0.34, trim);
      box(-1.09, 1.2, 0, 0.1, 2.4, 0.32, trim);
      box(1.09, 1.2, 0, 0.1, 2.4, 0.32, trim);
      break;
    case 'glass_wall':
      box(0, 1.6, 0, 4, 3.2, 0.08, glass);
      box(0, 3.24, 0, 4, 0.14, 0.24, trim);
      box(0, 0.07, 0, 4, 0.14, 0.24, trim);
      for (const mx of [-1.34, 0, 1.34]) box(mx, 1.6, 0, 0.1, 3.2, 0.16, trim);
      break;
    case 'stairs':
      for (let i = 0; i < 8; i++) {
        const z = -1.6 + i * 0.4 + 0.2;
        box(0, (i + 1) * 0.4 - 0.2, z, 4, 0.4, 0.4, solid);
        box(0, (i + 1) * 0.4 - 0.01, z, 3.9, 0.03, 0.36, trim);
      }
      for (const sx of [-1.95, 1.95]) box(sx, 1.6, 0, 0.12, 0.12, 3.4, trim, { rotX: -0.78 });
      break;
    case 'pillar':
      box(0, 1.6, 0, 0.6, 3.2, 0.6, solid);
      box(0, 3.12, 0, 0.9, 0.18, 0.9, trim);
      box(0, 0.1, 0, 0.9, 0.2, 0.9, trim);
      break;
    case 'railing':
      box(0, 0.62, 0, 4, 0.9, 0.06, glass);
      box(0, 1.12, 0, 4, 0.1, 0.14, trim);
      for (const px of [-2, 0, 2]) box(px, 0.56, 0, 0.1, 1.12, 0.1, trim);
      break;
    case 'roof_gable':
      box(-0.95, 0.85, 0, 2.4, 0.16, 4.8, solid, { rotZ: 0.52 });
      box(0.95, 0.85, 0, 2.4, 0.16, 4.8, solid, { rotZ: -0.52 });
      box(0, 1.42, 0, 0.42, 0.28, 4.9, trim);
      box(0, 0.05, 0, 4.4, 0.16, 4.9, trim);
      break;
    // ---- furniture ------------------------------------------------------
    case 'sofa':
      box(0, 0.24, 0, 2.6, 0.42, 1.0, solid);
      box(0, 0.66, -0.4, 2.6, 0.5, 0.2, solid);
      box(-1.25, 0.55, 0, 0.12, 0.5, 1.0, solid);
      box(1.25, 0.55, 0, 0.12, 0.5, 1.0, solid);
      box(-0.62, 0.5, 0.04, 1.16, 0.14, 0.84, soft);
      box(0.62, 0.5, 0.04, 1.16, 0.14, 0.84, soft);
      for (const dx of [-1.05, 1.05]) for (const dz of [-0.36, 0.36]) box(dx, 0.06, dz, 0.1, 0.12, 0.1, dark);
      break;
    case 'bed':
      box(0, 0.26, 0, 2.0, 0.3, 2.3, dark);
      box(0, 0.49, 0, 1.94, 0.24, 2.2, soft);
      box(0, 0.64, 0.35, 1.9, 0.16, 1.4, solid);
      box(-0.46, 0.68, -0.86, 0.78, 0.18, 0.44, trim);
      box(0.46, 0.68, -0.86, 0.78, 0.18, 0.44, trim);
      box(0, 0.85, -1.16, 2.06, 1.1, 0.16, dark);
      break;
    case 'desk':
      box(0, 0.75, 0, 2.0, 0.09, 0.9, solid);
      for (const dx of [-0.9, 0.9]) box(dx, 0.37, 0, 0.1, 0.74, 0.8, dark);
      box(0, 1.06, -0.24, 0.62, 0.4, 0.05, dark);
      box(0, 1.12, -0.2, 0.56, 0.32, 0.02, glass);
      box(0, 0.82, 0.2, 0.5, 0.03, 0.16, trim);
      box(0, 0.45, 1.0, 0.5, 0.75, 0.08, solid);
      box(0, 0.06, 1.0, 0.5, 0.1, 0.4, dark);
      break;
    case 'table':
      box(0, 0.74, 0, 2.0, 0.1, 1.2, solid);
      for (const dx of [-0.8, 0.8]) box(dx, 0.36, 0, 0.12, 0.72, 0.9, dark);
      for (const dz of [-0.95, 0.95]) box(0, 0.45, dz, 0.5, 0.75, 0.1, trim);
      break;
    case 'tv_stand':
      box(0, 0.32, 0, 2.4, 0.55, 0.5, dark);
      box(0, 1.3, 0, 2.1, 1.2, 0.1, dark);
      box(0, 1.3, 0.07, 1.96, 1.06, 0.03, glass);
      break;
    case 'bookshelf':
      box(-1.0, 1.1, 0, 0.1, 2.2, 0.5, dark);
      box(1.0, 1.1, 0, 0.1, 2.2, 0.5, dark);
      box(0, 2.16, 0, 2.0, 0.1, 0.5, dark);
      for (let i = 0; i < 4; i++) {
        box(0, 0.36 + i * 0.56, 0.02, 1.94, 0.07, 0.44, solid);
        for (let b = 0; b < 6; b++) box(-0.78 + b * 0.3, 0.52 + i * 0.56, 0.04, 0.2, 0.26, 0.34, b % 2 ? trim : warm);
      }
      break;
    case 'lamp':
      box(0, 0.02, 0, 0.4, 0.04, 0.4, dark);
      box(0, 0.85, 0, 0.07, 1.7, 0.07, dark);
      box(0, 1.74, 0, 0.46, 0.34, 0.46, warm);
      break;
    case 'plant':
      box(0, 0.24, 0, 0.66, 0.48, 0.66, trim);
      box(0, 0.48, 0, 0.6, 0.06, 0.6, dark);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        const leaf = box(Math.cos(a) * 0.3, 0.95 + (i % 3) * 0.2, Math.sin(a) * 0.3, 0.14, 0.8, 0.14, green);
        leaf.rotation.z = Math.cos(a) * 0.5;
        leaf.rotation.x = Math.sin(a) * 0.5;
      }
      break;
    default:
      box(0, 0.4, 0, 1, 0.8, 1, solid);
  }
  return g;
}

function addBuildPieceMesh(piece) {
  if (!game.buildGroup) return;
  const mesh = makeBuildMesh(piece, false);
  game.buildGroup.add(mesh);
  game.buildMeshes.set(piece.id, mesh);
}

function removeBuildPieceMesh(id) {
  const mesh = game.buildMeshes.get(id);
  if (mesh) { game.buildGroup.remove(mesh); game.buildMeshes.delete(id); }
}

function refreshBuildSurfaces() {
  game.buildSurfaces = Build.walkSurfaces(game.state?.builds || { pieces: [] });
}

function rebuildBuildWorld() {
  if (!game.buildGroup) {
    game.buildGroup = new THREE.Group();
    scene.add(game.buildGroup);
  }
  for (const mesh of game.buildMeshes.values()) game.buildGroup.remove(mesh);
  game.buildMeshes.clear();
  const builds = game.state?.builds;
  if (builds) for (const piece of builds.pieces) addBuildPieceMesh(piece);
  refreshBuildSurfaces();
}

function ghostTarget() {
  const item = Build.itemById(game.buildItem);
  const grid = Build.gridFor(item);
  const reach = item?.cat === 'structure' ? 4.2 : 3.0;
  const x = Build.snap(game.player.x + Math.sin(cam.yaw) * reach, grid);
  const z = Build.snap(game.player.z + Math.cos(cam.yaw) * reach, grid);
  return { x, z, y: +(game.player.y + game.buildLift).toFixed(2), rot: game.buildRot };
}

function rebuildBuildGhost() {
  if (game.buildGhost) { scene.remove(game.buildGhost); game.buildGhost = null; }
  if (!game.buildMode) return;
  const item = Build.itemById(game.buildItem);
  if (!item) return;
  game.buildGhost = makeBuildMesh({ item: item.id, x: 0, y: 0, z: 0, rot: game.buildRot, color: game.buildColor }, true);
  game.buildGhost.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  scene.add(game.buildGhost);
}

function updateBuildGhost() {
  if (!game.buildMode || !game.buildGhost) return;
  const t = ghostTarget();
  game.buildGhost.position.set(t.x, t.y, t.z);
  game.buildGhost.rotation.y = game.buildRot;
  game.buildGhost.visible = !game.player.vehicle;
}

function renderBuildBar() {
  const el = $('build-bar');
  if (!el) return;
  const builds = game.state?.builds || { pieces: [] };
  const stats = Build.summary(builds);
  const structures = BUILD_ITEMS.filter((i) => i.cat === 'structure');
  const furniture = BUILD_ITEMS.filter((i) => i.cat === 'furniture');
  const btn = (i) => `<button class="build-item ${i.id === game.buildItem ? 'active' : ''}" data-build-item="${i.id}" title="${i.name}"><span>${i.icon}</span><small>${i.name.replace(/ \(.*\)$/, '')}</small></button>`;
  const swatch = (c) => `<button class="build-swatch ${c === game.buildColor ? 'active' : ''}" style="background:${c}" data-build-color="${c}" aria-label="colour ${c}"></button>`;
  el.innerHTML = `
    <div class="build-row build-head">
      <b>🏗 Build &amp; Furnish</b>
      <span class="build-meta">${stats.structure} structure · ${stats.furniture} furniture / ${MAX_CUSTOM_BUILDS}</span>
      <span class="build-tools">
        <span class="build-level">Height ${(game.player.y + game.buildLift).toFixed(1)} m</span>
        <button data-build-lift="1" title="Raise ghost one storey (PageUp)">▲ storey</button>
        <button data-build-lift="-1" title="Lower ghost one storey (PageDown)">▼ storey</button>
        <button data-build-rotate="-1" title="Rotate left (Q)">⟲</button>
        <button data-build-rotate="1" title="Rotate right (R)">⟳</button>
        <button data-build-demolish="1" title="Demolish (X)">🧨 Demolish</button>
        <button class="danger" data-build-exit="1" title="Exit Build Mode (Y)">✕ Exit</button>
      </span>
    </div>
    <div class="build-row"><span class="build-label">Structure</span>${structures.map(btn).join('')}</div>
    <div class="build-row"><span class="build-label">Furniture</span>${furniture.map(btn).join('')}</div>
    <div class="build-row"><span class="build-label">Colour</span>${BUILD_COLORS.map(swatch).join('')}
      <span class="build-hint"><kbd>E</kbd> place · <kbd>X</kbd> demolish · <kbd>Q</kbd>/<kbd>R</kbd> rotate · <kbd>Tab</kbd> item · <kbd>PgUp</kbd>/<kbd>PgDn</kbd> storey · <kbd>Y</kbd> exit</span>
    </div>`;
}

function setBuildLift(delta) {
  game.buildLift = Math.max(-2 * BUILD_STORY_H, Math.min(10 * BUILD_STORY_H, game.buildLift + delta * BUILD_STORY_H));
  renderBuildBar();
}

function cycleBuildColor() {
  const i = BUILD_COLORS.indexOf(game.buildColor);
  game.buildColor = BUILD_COLORS[(i + 1) % BUILD_COLORS.length];
  renderBuildBar();
  rebuildBuildGhost();
}

function cycleBuildItem(dir = 1) {
  const list = BUILD_ITEMS;
  const i = list.findIndex((it) => it.id === game.buildItem);
  game.buildItem = list[(i + dir + list.length) % list.length].id;
  renderBuildBar();
  rebuildBuildGhost();
}

function toggleBuildMode(on) {
  const next = on === undefined ? !game.buildMode : !!on;
  if (next && game.player.vehicle) { toast('Step out of the car to enter Build Mode.', 'bad'); return; }
  game.buildMode = next;
  document.body.classList.toggle('build-mode', next);
  $('build-bar')?.classList.toggle('hidden', !next);
  if (next) {
    if (!game.state.builds) game.state.builds = Build.createBuildState();
    if (!game.buildGroup) rebuildBuildWorld();
    renderBuildBar();
    rebuildBuildGhost();
    toast('🏗 Build Mode — E place · X demolish · Q/R rotate · C colour · Tab item · PgUp/PgDn storey', 'good');
  } else {
    if (game.buildGhost) { scene.remove(game.buildGhost); game.buildGhost = null; }
    renderBuildBar();
    saveGame(true);
  }
  sfx.click();
}

function placeBuildPiece() {
  const item = Build.itemById(game.buildItem);
  if (!item) return;
  const target = ghostTarget();
  const res = Build.addPiece(game.state.builds, item.id, target, { color: game.buildColor });
  if (!res.ok) { toast(res.msg, 'warn'); sfx.error(); return; }
  addBuildPieceMesh(res.piece);
  refreshBuildSurfaces();
  renderBuildBar();
  sfx.tone(520, 0.06, 'square', 0.05);
  toast(`🏗 ${res.msg}`, 'good');
  updateHUD(true);
}

function demolishBuildPiece() {
  const t = ghostTarget();
  const piece = Build.pieceNear(game.state.builds, t.x, t.z, t.y, 3.4);
  if (!piece) { toast('Nothing to demolish there — aim at your build.', 'warn'); sfx.error(); return; }
  const res = Build.removePiece(game.state.builds, piece.id);
  if (!res.ok) { toast(res.msg, 'warn'); return; }
  removeBuildPieceMesh(piece.id);
  refreshBuildSurfaces();
  renderBuildBar();
  sfx.wrench();
  toast(`🧨 ${res.msg}`, 'good');
}

function openBuildMode() { toggleBuildMode(true); }

$('build-bar')?.addEventListener('click', (e) => {
  const item = e.target.closest('[data-build-item]');
  if (item) { game.buildItem = item.dataset.buildItem; renderBuildBar(); rebuildBuildGhost(); sfx.click(); return; }
  const col = e.target.closest('[data-build-color]');
  if (col) { game.buildColor = col.dataset.buildColor; renderBuildBar(); rebuildBuildGhost(); return; }
  const rot = e.target.closest('[data-build-rotate]');
  if (rot) { game.buildRot = Build.snapRotation(game.buildRot + Number(rot.dataset.buildRotate) * (Math.PI / 2)); renderBuildBar(); return; }
  const lift = e.target.closest('[data-build-lift]');
  if (lift) { setBuildLift(Number(lift.dataset.buildLift)); return; }
  if (e.target.closest('[data-build-demolish]')) { demolishBuildPiece(); return; }
  if (e.target.closest('[data-build-exit]')) toggleBuildMode(false);
});

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
let hitHeatCooldown = 0;

function clearPolice() {
  for (const cop of game.police) cop.dispose();
  game.police = [];
  sfx.setSiren(false);
}

function triggerOffense(kind) {
  if (kind !== 'explosion' && hitHeatCooldown > 0) return;
  if (kind !== 'explosion') hitHeatCooldown = 1.6;
  const res = Heat.addHeatOffense(game.heat, kind);
  if (res.escalated) {
    toast(`🚨 Wanted ${Heat.starLabel(res.stars)} — Metro Police dispatched! Outrun cruisers to clear heat.`, 'danger');
    updateHUD(true);
  }
}

function updatePolice(dt) {
  hitHeatCooldown = Math.max(0, hitHeatCooldown - dt);
  const desired = Heat.desiredCruisers(game.heat.stars);
  const target = game.player.vehicle || game.player;

  while (game.police.length < desired) {
    const cop = new PoliceCar(scene, game.police.length === 0);
    cop.spawnNear(target.x, target.z);
    game.police.push(cop);
  }
  while (game.police.length > desired) {
    const cop = game.police.pop();
    cop.dispose();
  }

  let closestDist = Infinity;
  for (const cop of game.police) {
    const gy = city.groundY(cop.x, cop.z);
    cop.update(dt, target, game.heat.stars, city.colliderCache, gy);
    const d = Math.hypot(cop.x - target.x, cop.z - target.z);
    if (d < closestDist) closestDist = d;
  }

  if (game.heat.score > 0 || game.heat.stars > 0) {
    const prevStars = game.heat.stars;
    const playerSpeed = game.player.vehicle
      ? Math.abs(game.player.vehicle.speed)
      : Math.hypot(game.player.vx, game.player.vz);
    const step = Heat.stepHeat(game.heat, dt, {
      policeInSight: closestDist < 54,
      closestPoliceDist: closestDist,
      playerSpeed,
    });
    if (step.busted) {
      const fine = Heat.applyBustFine(game.state, step.bustedStars);
      if (game.player.vehicle) {
        game.player.vehicle.speed = 0;
        game.player.vehicle.vx = 0;
        game.player.vehicle.vz = 0;
      }
      clearPolice();
      sfx.error();
      toast(`🚓 Busted by Metro Police! Ticketed ${money(fine)} — street heat cleared.`, 'danger');
      updateHUD(true);
    } else if (step.evaded) {
      clearPolice();
      sfx.cash();
      toast('🕵️ Outran Metro Police — street heat cleared!', 'good');
      updateHUD(true);
    } else if (game.heat.stars !== prevStars) {
      updateHUD(true);
    }
  }

  const sirenOn = game.police.length > 0 && closestDist < 95;
  sfx.setSiren(sirenOn, game.elapsed, 1 - Math.min(0.85, closestDist / 95));
}

function carCirclesAll(excludeVehicle) {
  const out = [];
  for (const v of game.vehicles) {
    if (v === excludeVehicle) continue;
    const isPlayer = v === game.player.vehicle;
    for (const c of v.circles()) out.push({ ...c, speed: Math.abs(v.speed), isPlayer, tag: 'car' });
  }
  for (const t of game.traffic) for (const c of t.circles()) out.push({ ...c, speed: t.speed, tag: 'car' });
  for (const cop of game.police) for (const c of cop.circles()) out.push({ ...c, speed: cop.speed, tag: 'police' });
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
    const hb = (k('Space') || touchInput.handbrake) && !anyOverlay();
    const input = { throttle: f, steer: r, handbrake: hb };
    const others = carCirclesAll(v);
    const impact = v.update(dt, input, city.colliderCache, others);
    const gy = city.groundY(v.x, v.z);
    streetFX.trackVehicleSkids(v, dt, gy);
    sfx.setSkid(v.drifting && Math.abs(v.speed) > 4.5, Math.min(1, Math.abs(v.speed) / 22));
    if (impact > 3.5) {
      sfx.crash(impact);
      cam.shake = Math.min(0.65, impact * 0.042);
      streetFX.spawnSparks(
        v.lastHitPoint.x,
        gy + 0.55,
        v.lastHitPoint.z,
        Math.min(28, Math.round(impact * 1.9)),
        Math.min(2.2, impact / 11),
      );
      if (v.lastHitKind === 'police' && impact > 5) triggerOffense('policeHit');
      else if (v.lastHitKind === 'car' && impact > 10.5) triggerOffense('trafficHit');
    }
    // collision damage (≥30 km/h threshold — src/vehicleCond.js, UPGRADE_PLAN.md §4)
    const dmg = VCond.applyImpact(v.cond, impact);
    if (dmg > 0 && v.cond.hp <= 0) { wreckVehicle(v); return; }
    else if (dmg >= 12) cam.shake = Math.min(0.8, cam.shake + 0.15);
    // fuel stall warning (tiered <50 / <25 warnings live in updateVehicleTelemetry)
    if (v.cond.fuel <= 0 && !v.stallNotified) {
      v.stallNotified = true;
      sfx.setEngine(false, 0); sfx.stall(); sfx.horn();
      toast('⛽ Out of fuel — engine stalled. Press E or T for Roadside Assist, or visit a fuel station!', 'danger');
    } else if (v.cond.fuel > 40) v.stallNotified = false;
    v.syncMesh(gy, dt);
    if (cam.mode === 'first' || v.data.model === 'roadster') {
      const step = game.task?.steps?.[game.task.idx] || null;
      v.updateCockpit(dt, {
        clockHHMM: Time.hhmm(getClock()),
        waypoint: step ? { x: step.x, z: step.z } : null,
      });
    }
    p.x = v.x; p.z = v.z; p.yaw = v.yaw;
    p.char.animate(dt, 0);
    p.char.armL.rotation.z = p.char.armR.rotation.z = -v.steer * 0.4;
    sfx.setEngine(v.cond.fuel > 0 && v.cond.hp > 0, v.speed);
    $('veh-speed').textContent = Math.round(Math.abs(v.speed) * 3.6);
    updateVehicleTelemetry(dt);
    return;
  }
  sfx.setSkid(false, 0);
  // on foot — sitting / lying on furniture holds the player in place
  const { f: f2, r: r2 } = { f, r };
  const inputLen = Math.abs(f2) + Math.abs(r2);
  if (game.seat && inputLen > 0.05) standUpFromProp(true);
  if (game.seat) {
    p.vx = p.vz = 0;
    p.x = game.seat.spot.x; p.z = game.seat.spot.z;
    p.char.group.position.set(p.x, p.y + seatOffsetY(), p.z);
    p.char.group.rotation.y = p.yaw;
    p.char.animate(dt, 0);
    if (game.state.leisure) Props.tickLeisure(game.state.leisure, dt, { seated: true });
    sfx.setEngine(false, 0);
    return;
  }
  const sprint = k('ShiftLeft', 'ShiftRight') || touchInput.sprint;
  const speed = sprint ? 7.2 * Props.sprintMultiplier(game.state.leisure) : 3.8;
  const fx = Math.sin(cam.yaw); const fz = Math.cos(cam.yaw);
  // camera-relative movement: forward = (sin, cos), right = (-cos, sin)
  let mx = fx * f - fz * r;
  let mz = fz * f + fx * r;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (game.creatorOpen) { mx = 0; mz = 0; }
  if (len > 0.12 && p.char.emote) p.char.clearEmote();
  const k2 = Math.min(1, dt * 12);
  p.vx += (mx * speed - p.vx) * k2;
  p.vz += (mz * speed - p.vz) * k2;
  p.x += p.vx * dt; p.z += p.vz * dt;
  let px = p.x; let pz = p.z;
  let res = resolveCircle(px, pz, 0.4, city.colliderCache);
  px = res.x; pz = res.z;
  // roof parapets & upper-storey shells only block at their own elevation
  const upper = city.upperCollidersAt(p.y);
  if (upper.length) { res = resolveCircle(px, pz, 0.4, upper); px = res.x; pz = res.z; }
  // furniture inside the building you are standing in
  const insideNow = city.buildingAt(px, pz);
  if (insideNow) {
    const lvl = Math.max(0, Math.min(insideNow.building.floors, Math.round((p.y - insideNow.building.baseY) / Interiors.FLOOR_HEIGHT)));
    const furn = city.interiorCollidersFor(insideNow.building.id, lvl);
    if (furn.length) { res = resolveCircle(px, pz, 0.4, furn); px = res.x; pz = res.z; }
  }
  // player-built walls & furniture on this storey
  const ownWalls = Build.collidersNear(game.state.builds, p.y + 0.05);
  if (ownWalls.length) { res = resolveCircle(px, pz, 0.4, ownWalls); px = res.x; pz = res.z; }
  // closed swing doors block the doorway until you open them
  const doorCols = city.doorCollidersAt(p.y);
  if (doorCols.length) { res = resolveCircle(px, pz, 0.4, doorCols); px = res.x; pz = res.z; }
  p.x = px; p.z = pz;
  if (p.y < 1.4) {
    for (const c of carCirclesAll(null)) {
      const dx = p.x - c.x; const dz = p.z - c.z; const d = Math.hypot(dx, dz); const min = c.r + 0.4;
      if (d < min && d > 1e-4) { p.x += (dx / d) * (min - d); p.z += (dz / d) * (min - d); }
    }
  }
  p.x = THREE.MathUtils.clamp(p.x, -WORLD_LIMIT, WORLD_LIMIT);
  p.z = THREE.MathUtils.clamp(p.z, -WORLD_LIMIT, WORLD_LIMIT);
  // vertical support: street, tower floor slabs, built floors & stairs
  const groundY = city.groundY(p.x, p.z);
  let support = groundY;
  const towerY = city.walkSurfaceAt(p.x, p.z, p.y, Build.STEP_UP);
  if (towerY != null && towerY > support) support = towerY;
  const builtY = Build.supportAt(game.buildSurfaces, p.x, p.z, p.y, -Infinity);
  if (builtY > support) support = builtY;
  if (p.y <= support + 0.02) {
    p.y = support; p.vy = 0; p.onGround = true;
  } else {
    p.vy -= 22 * dt;
    p.y += p.vy * dt;
    p.onGround = false;
    if (p.y <= support) { p.y = support; p.vy = 0; p.onGround = true; }
  }
  if (p.y < groundY - 0.4) { p.y = groundY; p.vy = 0; }
  const moving = Math.hypot(p.vx, p.vz);
  if (cam.mode === 'first' && !game.creatorOpen) {
    p.yaw = cam.yaw;
  } else if (moving > 0.3 && len > 0.05) {
    p.yaw = lerpAngle(p.yaw, Math.atan2(mx, mz), Math.min(1, dt * 12));
  }
  p.char.group.position.set(p.x, p.y + seatOffsetY(), p.z);
  p.char.group.rotation.y = p.yaw;
  p.char.animate(dt, moving);
  if (game.state.leisure) {
    Props.tickLeisure(game.state.leisure, dt, { sprinting: sprint && moving > 0.6, moving: moving > 0.25 });
  }
  sfx.setEngine(false, 0);
}

function updateCamera(dt) {
  const p = game.player;
  const inFirst = cam.mode === 'first' && !game.creatorOpen;
  $('fp-reticle')?.classList.toggle('hidden', !(inFirst && !p.vehicle && !anyOverlay()));

  // Q / R look or orbit
  if (!anyOverlay() && !isTyping() && !game.buildMode) {
    if (inFirst && p.vehicle) {
      if (k('KeyQ')) {
        cam.cockpitYaw = THREE.MathUtils.clamp(cam.cockpitYaw + dt * 1.85, -CAM_COCKPIT_YAW_MAX, CAM_COCKPIT_YAW_MAX);
        cam.lastDrag = game.elapsed;
      }
      if (k('KeyR')) {
        cam.cockpitYaw = THREE.MathUtils.clamp(cam.cockpitYaw - dt * 1.85, -CAM_COCKPIT_YAW_MAX, CAM_COCKPIT_YAW_MAX);
        cam.lastDrag = game.elapsed;
      }
    } else {
      if (k('KeyQ')) { cam.yaw += dt * 2; cam.lastDrag = game.elapsed; }
      if (k('KeyR')) { cam.yaw -= dt * 2; cam.lastDrag = game.elapsed; }
    }
  }
  const target = new THREE.Vector3();
  let dist = cam.dist; let pitch = cam.pitch;
  if (game.creatorOpen) {
    camera.up.set(0, 1, 0);
    const fy = p.yaw;
    const fwd = { x: Math.sin(fy), z: Math.cos(fy) };
    const camRight = { x: fwd.z, z: -fwd.x }; // camera looks back at the player
    target.set(p.x + camRight.x * 0.75, city.groundY(p.x, p.z) + 1.15, p.z + camRight.z * 0.75);
    camera.position.lerp(new THREE.Vector3(p.x + fwd.x * 4.3, target.y + 0.45, p.z + fwd.z * 4.3), Math.min(1, dt * 6));
    camera.lookAt(target);
    return;
  }

  // First-person 3D Car Cockpit Interior View
  if (inFirst && p.vehicle) {
    const v = p.vehicle;
    if (!v.cockpitView) syncCameraViewMode();
    const pose = Cam.computeCockpitCameraPose(cam, {
      vx: v.x,
      vy: v.y,
      vz: v.z,
      carYaw: v.yaw,
      bodyPitch: v.parts?.body?.rotation?.x || 0,
      bodyRoll: v.parts?.body?.rotation?.z || 0,
      driverEye: v.parts?.cockpit?.driverEye || { x: 0.38, y: 1.24, z: -0.2 },
      speed: v.speed,
      steer: v.steer,
      elapsed: game.elapsed,
      dt,
    });
    camera.fov += (Cam.targetFov(cam, true, v.speed) - camera.fov) * Math.min(1, dt * 6);
    camera.updateProjectionMatrix();
    camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
    if (cam.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * cam.shake * 0.22;
      camera.position.y += (Math.random() - 0.5) * cam.shake * 0.22;
      cam.shake = Math.max(0, cam.shake - dt * 2.4);
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.look.x, pose.look.y, pose.look.z);
    if (pose.roll) camera.rotateZ(pose.roll);
    sun.position.set(v.x + currentSunOffset.x, v.y + 1.2 + currentSunOffset.y, v.z + currentSunOffset.z);
    sun.target.position.set(v.x, 0, v.z);
    return;
  }

  // First-person On-Foot Street POV
  if (inFirst && !p.vehicle) {
    if (!p.char.firstPerson) syncCameraViewMode();
    camera.up.set(0, 1, 0);
    const moving = Math.hypot(p.vx, p.vz);
    const buildH = (BUILDS[game.state?.appearance?.build] || BUILDS.Balanced).h;
    const pose = Cam.computeFootFirstPersonPose(cam, {
      x: p.x,
      z: p.z,
      groundY: p.y + (game.seat ? (game.seat.pose === 'lie' ? -1.3 : -0.6) : 0),
      buildH,
      jumpY: p.char.jumpY || 0,
      movingSpeed: moving,
      dt,
    });
    camera.fov += (Cam.targetFov(cam, false, moving) - camera.fov) * Math.min(1, dt * 6);
    camera.updateProjectionMatrix();
    camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
    if (cam.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * cam.shake * 0.3;
      camera.position.y += (Math.random() - 0.5) * cam.shake * 0.3;
      cam.shake = Math.max(0, cam.shake - dt * 2.2);
    }
    camera.lookAt(pose.look.x, pose.look.y, pose.look.z);
    sun.position.set(pose.eye.x + currentSunOffset.x, pose.eye.y + currentSunOffset.y, pose.eye.z + currentSunOffset.z);
    sun.target.position.set(pose.eye.x, 0, pose.eye.z);
    return;
  }

  // Third-person Chase / Orbit Camera
  camera.up.set(0, 1, 0);
  if (p.vehicle) {
    const v = p.vehicle;
    target.set(v.x, v.y + 1.3, v.z);
    if (game.elapsed - cam.lastDrag > 1.6) {
      const behind = v.speed < -2 ? v.yaw + Math.PI : v.yaw;
      cam.yaw = lerpAngle(cam.yaw, behind, Math.min(1, dt * 2.5));
      cam.pitch += (0.27 - cam.pitch) * Math.min(1, dt * 2);
    }
    dist = Math.max(cam.dist, 7) + Math.abs(v.speed) * 0.07;
    pitch = cam.pitch;
    camera.fov += (Cam.targetFov(cam, true, v.speed) - camera.fov) * Math.min(1, dt * 3);
  } else {
    target.set(p.x, p.y + seatedEyeHeight() + (p.char.jumpY || 0) * 0.4, p.z);
    camera.fov += (Cam.targetFov(cam, false, 0) - camera.fov) * Math.min(1, dt * 3);
  }
  camera.updateProjectionMatrix();
  const indoorCeil = !p.vehicle ? city.ceilingAt(p.x, p.z, p.y) : null;
  if (indoorCeil != null) {
    dist = Math.min(dist, 5.2);
  }
  const cp = Math.cos(pitch);
  const desired = new THREE.Vector3(
    target.x - Math.sin(cam.yaw) * dist * cp,
    target.y + Math.sin(pitch) * dist,
    target.z - Math.cos(cam.yaw) * dist * cp,
  );
  if (indoorCeil != null) desired.y = Math.min(desired.y, indoorCeil - 0.55);
  const camCeil = city.ceilingY(desired.x, desired.z);
  if (camCeil != null) desired.y = Math.min(desired.y, camCeil - 0.55);
  if (desired.y < 0.6) desired.y = 0.6;
  camera.position.lerp(desired, p.vehicle ? Math.min(1, dt * 10) : 1);
  if (cam.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * cam.shake;
    camera.position.y += (Math.random() - 0.5) * cam.shake;
    cam.shake = Math.max(0, cam.shake - dt * 2);
  }
  camera.lookAt(target);
  // keep the orbiting sun/shadow frustum centred on the action
  sun.position.set(
    target.x + currentSunOffset.x,
    target.y + currentSunOffset.y,
    target.z + currentSunOffset.z,
  );
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

function disposeCarParts(parts) {
  if (!parts) return;
  parts.paint?.dispose?.();
  parts.rimMat?.dispose?.();
  parts.brakeMat?.dispose?.();
  parts.headFlareMat?.dispose?.();
  parts.tailFlareMat?.dispose?.();
  parts.leftMirrorLiveMat?.dispose?.();
  parts.rightMirrorLiveMat?.dispose?.();
  parts.cockpit?.dispose?.();
}

function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  r.char.group.parent?.remove(r.char.group);
  r.char.dispose();
  r.label.mat.dispose();
  r.label.tex.dispose?.();
  if (r.car) {
    scene.remove(r.car);
    disposeCarParts(r.carParts);
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

    const spec = Cust.decodeNetVehicle(peer.veh, peer.app?.shirt || '#38bdf8');
    if (spec) {
      if (!r.car || r.carModel !== spec.model) {
        if (r.car) {
          if (r.char.group.parent === r.car) scene.add(r.char.group);
          scene.remove(r.car);
          disposeCarParts(r.carParts);
        }
        r.carParts = buildCarMesh(spec.model, spec.color, spec);
        r.car = r.carParts.group;
        r.carModel = spec.model;
        r.carToken = peer.veh;
        scene.add(r.car);
      } else if (r.carToken !== peer.veh && r.carParts) {
        r.carParts.applyMods(spec);
        r.carToken = peer.veh;
      }
      r.car.visible = true;
      if (r.carParts) r.carParts.headBeams.visible = currentNightFactor > 0.08;
      r.car.position.set(r.x, city.groundY(r.x, r.z), r.z);
      r.car.rotation.y = r.yaw;
      // Open-top roadster shows the remote driver's full outfit, shades & gold chain!
      if (spec.model === 'roadster' && r.carParts) {
        if (r.char.group.parent !== r.car) r.car.add(r.char.group);
        r.char.group.visible = true;
        r.char.group.position.copy(r.carParts.seat);
        r.char.group.rotation.set(0, 0, 0);
        r.char.group.scale.setScalar(r.carParts.seatScale);
        r.char.setPose('sit');
        r.char.animate(dt, 0);
      } else {
        r.char.group.visible = false;
      }
    } else {
      if (r.car) r.car.visible = false;
      if (r.char.group.parent !== scene) {
        scene.add(r.char.group);
        r.char.group.scale.setScalar(1);
        r.char.setPose('stand');
      }
      r.char.group.visible = true;
      r.char.group.position.set(r.x, city.groundY(r.x, r.z), r.z);
      r.char.group.rotation.y = r.yaw;
      if (peer.emote && EMOTE_BY_ID[peer.emote]) {
        if (r.char.emote !== peer.emote) r.char.setEmote(peer.emote);
      } else if (r.char.emote) {
        r.char.clearEmote();
      }
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
        if (msg.clock) {
          debugClockOverride = null;
          if (game.state?.clock) Time.setClock(game.state.clock, msg.clock.inGameMs, Date.now());
          lastShiftIndex = Time.shiftIndex(msg.clock.inGameMs);
          if (game.state?.stats) {
            game.state.stats.day = Time.dayOf(msg.clock.inGameMs);
            game.state.stats.payrollTimer = Time.secondsToNextShift(msg.clock.inGameMs);
          }
          updateDayNight(msg.clock.inGameMs, true);
        }
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
      onClock(clockMsg) {
        if (!debugClockOverride && game.state?.clock) {
          Time.setClock(game.state.clock, clockMsg.inGameMs, Date.now());
          updateDayNight(clockMsg.inGameMs, true);
          updateHUD(true);
        }
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
    vehicle: v ? Cust.encodeNetVehicle(v.data) : null,
    emote: !v && p.char?.emote ? p.char.emote : null,
  };
}

// ===========================================================================
// Minimap
// ===========================================================================
const mm = $('minimap');
const mmCtx = mm.getContext('2d');
const MM_HALF = 245;
const MM_SCALE = 200 / (MM_HALF * 2);
const mmBase = document.createElement('canvas');
mmBase.width = mmBase.height = 200;
{
  const g = mmBase.getContext('2d');
  const toMM = (v) => (v + MM_HALF) * MM_SCALE;
  g.fillStyle = '#3f6b33'; g.fillRect(0, 0, 200, 200);
  // Metro Grand University North Campus footprint (-80..80, -234..-158)
  g.fillStyle = '#cbd5e1';
  g.fillRect(toMM(-80), toMM(-234), 160 * MM_SCALE, 76 * MM_SCALE);
  g.fillStyle = '#1e3a8a';
  g.fillRect(toMM(-34), toMM(-230), 68 * MM_SCALE, 36 * MM_SCALE);
  g.fillRect(toMM(-74), toMM(-226), 34 * MM_SCALE, 32 * MM_SCALE);
  g.fillRect(toMM(40), toMM(-226), 34 * MM_SCALE, 32 * MM_SCALE);
  // South Waterfront public district (z 157..240): pads, beach & sea
  g.fillStyle = '#cfd6dd';
  g.fillRect(toMM(-162), toMM(157), 324 * MM_SCALE, 74 * MM_SCALE);
  g.fillStyle = '#e8d3a0';
  g.fillRect(toMM(-162), toMM(228), 324 * MM_SCALE, 11 * MM_SCALE);
  g.fillStyle = '#0e7490';
  g.fillRect(toMM(-162), toMM(239), 324 * MM_SCALE, 8 * MM_SCALE);
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
  // South Waterfront avenues: 5 north–south strips + the waterfront cross avenue
  for (const r of ROAD_LINES) g.fillRect(toMM(r - ROAD_HALF), toMM(157), ROAD_HALF * 2 * MM_SCALE, 70 * MM_SCALE);
  g.fillRect(toMM(-162), toMM(190 - ROAD_HALF), 324 * MM_SCALE, ROAD_HALF * 2 * MM_SCALE);
}
function drawMinimap() {
  const g = mmCtx;
  const toMM = (v) => (v + MM_HALF) * MM_SCALE;
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
  square(BOUTIQUE.x, BOUTIQUE.z, 13, BOUTIQUE.color, 'B');
  square(UNIVERSITY.x, UNIVERSITY.z, 15, UNIVERSITY.color, 'U');
  for (const place of Places.PUBLIC_PLACES) square(place.x, place.z, 15, place.color, place.mapLabel);
  for (const st of Object.values(FUEL_STATIONS)) square(st.x, st.z, 11, st.color, 'F');
  for (const t of game.traffic) dot(t.x, t.z, 1.6, '#e5e7eb');
  for (const cop of game.police) {
    const copColor = Math.floor(game.elapsed * 7) % 2 === 0 ? '#ef4444' : '#3b82f6';
    dot(cop.x, cop.z, 3.0, copColor);
  }
  for (const c of game.citizens) dot(c.x, c.z, 1.6, c.data.employer ? '#4ade80' : '#fde047');
  for (const v of game.vehicles) if (v !== game.player.vehicle) dot(v.x, v.z, 2.6, '#38bdf8');
  if (game.task) {
    const st = game.task.steps[game.task.idx];
    const pulse = 3 + Math.sin(game.elapsed * 6) * 1.2;
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
  game.elapsed += dt;
  clockHudTimer -= dt;
  dayNightTimer -= dt;
  const s = game.state;

  updatePlayer(dt);
  updateInteriorState();
  updateBuildGhost();
  if (net) { net.update(dt, netLocalState()); updateRemotes(dt); }

  // owned parked vehicles coast to a stop & stay out of walls (wrecks animate smoke)
  for (const v of game.vehicles) {
    if (v === game.player.vehicle) continue;
    if (v.cond.hp <= 0 || Math.abs(v.speed) > 0.05 || Math.hypot(v.vx, v.vz) > 0.05) {
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
  for (const cop of game.police) for (const c of cop.circles()) obstacles.push({ x: c.x, z: c.z, kind: 'car', r: c.r });
  for (const t of game.traffic) for (const c of t.circles()) obstacles.push({ x: c.x, z: c.z, kind: 'car', r: c.r, self: t });
  for (const t of game.traffic) {
    t.update(dt, obstacles);
    if (t.wantsHonk && dist2(t, game.player) < 900) sfx.horn();
  }

  // police pursuit cruisers + wanted street heat
  updatePolice(dt);

  // street FX (skid marks, crash sparks, explosions, smoke)
  streetFX.update(dt);

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
    marker.arrow.position.y = 3.2 + Math.sin(game.elapsed * 3) * 0.35;
    marker.arrow.rotation.y = game.elapsed * 2;
  }

  // clock-aligned 12-in-game-minute (30 real s) shift payroll + day/night cycle
  const nowInGame = getClock();
  s.stats.day = Time.dayOf(nowInGame);
  s.stats.payrollTimer = Time.secondsToNextShift(nowInGame, s.clock?.speed);
  const curShift = Time.shiftIndex(nowInGame);
  if (lastShiftIndex === null) lastShiftIndex = curShift;
  if (curShift > lastShiftIndex) {
    const cycles = Math.min(4, curShift - lastShiftIndex);
    lastShiftIndex = curShift;
    let totalPay = 0;
    for (let i = 0; i < cycles; i++) totalPay += Eco.runPayrollCycle(s).total;
    if (totalPay > 0) {
      sfx.cash();
      toast(`💼 Shift payout (${Time.hhmm(nowInGame)}): +${money(totalPay)} stored at your startups`, 'money');
    } else if (Eco.builtCount(s) && !Eco.employedCount(s)) {
      toast('Your startups have no workers. Hire citizens to earn profit!', '');
    }
    if (game.modal) renderModal();
  }
  updateDayNight(nowInGame);

  game.valetCooldown = Math.max(0, game.valetCooldown - dt);
  game.autosaveTimer -= dt;
  if (game.autosaveTimer <= 0) { game.autosaveTimer = 60; saveGame(true); }

  for (const [i, car] of displayCars.entries()) car.rotation.y += dt * (0.25 + i * 0.05);
  for (const [i, man] of boutiqueMannequins.entries()) {
    man.group.rotation.y += dt * (0.32 + i * 0.04);
    man.animate(dt, 0);
  }
  for (const actor of campusActors) actor.animate(dt, 0);
  if (city.lectureBoard && Math.floor(game.elapsed * 2) !== Math.floor((game.elapsed - dt) * 2)) {
    const liveSchedule = Uni.getLiveCampusSchedule(nowInGame);
    if (liveSchedule.length) city.updateLectureBoard(liveSchedule[0]);
  }
  city.update(game.elapsed, dt);
  updatePrompt();
  updateCamera(dt);
  updateHUD();
  mmTimer -= dt;
  if (mmTimer <= 0) { mmTimer = 1 / 15; drawMinimap(); }
  renderCockpitMirrors();
  renderer.render(scene, camera);
}

// ===========================================================================
// Boot
// ===========================================================================
function boot() {
  game.state = Eco.createInitialState();
  const loaded = localStorage.getItem(SAVE_KEY) ? loadGame(true) : false;
  if (!loaded) applyState();
  if (!game.state.seenHelp) showHelp();
  else toast(`Welcome back, ${game.state.appearance.name}!`, 'good');
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
