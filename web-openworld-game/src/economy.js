// MetroVenture 3D — pure game-state / economy logic.
// No DOM or Three.js usage so it can be unit-tested in Node (see tests/economy.test.mjs).

import {
  SAVE_VERSION, STARTING_CASH, OCCUPATIONS, RANKS, RANK_PAY_BONUS, BUSINESSES,
  BASE_JOB_SLOTS, SLOTS_PER_LEVEL, MAX_BUSINESS_LEVEL, LEVEL_REVENUE_BONUS,
  VEHICLE_MODELS, DEFAULT_APPEARANCE, CITIZEN_NAMES, SKIN_TONES, SHIRT_COLORS,
  PANTS_COLORS, HAIR_COLORS, HAIR_STYLES, BUILDS, PAYROLL_INTERVAL, TOTAL_CITIZENS,
} from './data.js';

// Small deterministic PRNG so citizens look the same for every new game.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];

export function randomAppearance(rand, name = 'Citizen') {
  return {
    name,
    skin: pick(rand, SKIN_TONES),
    shirt: pick(rand, SHIRT_COLORS),
    pants: pick(rand, PANTS_COLORS),
    hair: pick(rand, HAIR_COLORS),
    hairStyle: pick(rand, HAIR_STYLES),
    build: pick(rand, Object.keys(BUILDS)),
  };
}

export function createCitizens(seed = 1337) {
  const rand = mulberry32(seed);
  const citizens = [];
  for (let i = 0; i < TOTAL_CITIZENS; i++) {
    citizens.push({
      id: `c${i}`,
      name: CITIZEN_NAMES[i % CITIZEN_NAMES.length],
      appearance: randomAppearance(rand, CITIZEN_NAMES[i % CITIZEN_NAMES.length]),
      employer: null,
      x: null,
      z: null,
    });
  }
  return citizens;
}

export function createInitialState() {
  const jobXP = {};
  for (const id of Object.keys(OCCUPATIONS)) jobXP[id] = 0;
  const businesses = {};
  for (const id of Object.keys(BUSINESSES)) businesses[id] = null;
  return {
    version: SAVE_VERSION,
    cash: STARTING_CASH,
    appearance: { ...DEFAULT_APPEARANCE },
    activeJob: null,
    jobXP,
    businesses,
    citizens: createCitizens(),
    vehicles: [
      // Free starter car parked at the curb next to the spawn point.
      { id: 'v1', model: 'hatch', color: '#b45309', x: -6.0, z: -24, yaw: 0 },
    ],
    nextVehicleId: 2,
    lastVehicleId: 'v1',
    player: { x: -12.5, z: -15, yaw: Math.PI * 0.8, inVehicle: null },
    stats: { tasksCompleted: 0, totalEarned: 0, day: 1, payrollTimer: PAYROLL_INTERVAL },
    seenHelp: false,
  };
}

// Merge a loaded save onto a fresh state so missing fields (older saves) get defaults.
export function migrateState(raw) {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  // shallow merge, but guard against raw containing null / non-object sub-fields
  const s = { ...base, ...raw };

  // --- appearance -----------------------------------------------------------
  const rawApp = raw.appearance && typeof raw.appearance === 'object' ? raw.appearance : {};
  s.appearance = { ...base.appearance, ...rawApp };
  // sanitize appearance values so Character.setAppearance never receives
  // undefined / invalid colours that would make THREE.Color.set() throw
  for (const k of Object.keys(base.appearance)) {
    if (s.appearance[k] == null || typeof s.appearance[k] !== 'string') s.appearance[k] = base.appearance[k];
  }
  if (!BUILDS[s.appearance.build]) s.appearance.build = base.appearance.build;
  if (!HAIR_STYLES.includes(s.appearance.hairStyle)) s.appearance.hairStyle = base.appearance.hairStyle;

  // --- jobXP ---------------------------------------------------------------
  const rawXP = raw.jobXP && typeof raw.jobXP === 'object' ? raw.jobXP : {};
  s.jobXP = { ...base.jobXP };
  for (const k of Object.keys(base.jobXP)) {
    const v = rawXP[k];
    s.jobXP[k] = Number.isFinite(v) ? v : base.jobXP[k];
  }

  // --- businesses ----------------------------------------------------------
  const rawBiz = raw.businesses && typeof raw.businesses === 'object' ? raw.businesses : {};
  s.businesses = { ...base.businesses };
  for (const id of Object.keys(base.businesses)) {
    const b = rawBiz[id];
    if (b == null) { s.businesses[id] = null; continue; }
    if (typeof b !== 'object' || Array.isArray(b)) { s.businesses[id] = null; continue; }
    s.businesses[id] = {
      level: Number.isFinite(b.level) ? Math.min(Math.max(1, Math.floor(b.level)), MAX_BUSINESS_LEVEL) : 1,
      storedProfit: Number.isFinite(b.storedProfit) ? b.storedProfit : 0,
      lifetimeProfit: Number.isFinite(b.lifetimeProfit) ? b.lifetimeProfit : 0,
      employees: [], // recomputed below from citizen.employer
    };
    // preserve any extra future fields without letting them corrupt
    for (const k of Object.keys(b)) if (!(k in s.businesses[id])) s.businesses[id][k] = b[k];
  }
  // drop unknown business keys that may have been injected by a corrupted save
  for (const id of Object.keys(s.businesses)) if (!(id in BUSINESSES)) delete s.businesses[id];

  // --- citizens ------------------------------------------------------------
  const sanitizeCitizen = (c, i) => {
    const b = base.citizens[i] || base.citizens[0];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { ...b };
    const app = c.appearance && typeof c.appearance === 'object' ? c.appearance : {};
    const out = { ...b, ...c };
    out.appearance = { ...b.appearance, ...app };
    for (const k of Object.keys(b.appearance)) if (out.appearance[k] == null) out.appearance[k] = b.appearance[k];
    if (out.id == null || typeof out.id !== 'string') out.id = b.id;
    if (out.name == null || typeof out.name !== 'string') out.name = b.name;
    // employer will be validated below; allow null
    if (out.employer != null && typeof out.employer !== 'string') out.employer = null;
    out.x = Number.isFinite(out.x) ? out.x : null;
    out.z = Number.isFinite(out.z) ? out.z : null;
    return out;
  };
  if (!Array.isArray(raw.citizens) || raw.citizens.length !== base.citizens.length) {
    s.citizens = base.citizens;
  } else {
    s.citizens = raw.citizens.map((c, i) => sanitizeCitizen(c, i));
  }

  // --- vehicles ------------------------------------------------------------
  if (Array.isArray(raw.vehicles)) {
    const filtered = raw.vehicles.filter((v) => v && typeof v === 'object' && VEHICLE_MODELS[v.model]);
    s.vehicles = filtered.map((v, idx) => ({
      id: typeof v.id === 'string' ? v.id : `v${idx + 1}`,
      model: v.model,
      color: typeof v.color === 'string' ? v.color : '#ffffff',
      x: Number.isFinite(v.x) ? v.x : 0,
      z: Number.isFinite(v.z) ? v.z : 0,
      yaw: Number.isFinite(v.yaw) ? v.yaw : 0,
    }));
    if (!s.vehicles.length) s.vehicles = base.vehicles;
  } else {
    s.vehicles = base.vehicles;
  }
  // nextVehicleId / lastVehicleId sanity
  s.nextVehicleId = Number.isFinite(raw.nextVehicleId) ? Math.max(1, Math.floor(raw.nextVehicleId)) : base.nextVehicleId;
  if (s.nextVehicleId <= s.vehicles.length) s.nextVehicleId = s.vehicles.length + 1;
  if (typeof raw.lastVehicleId !== 'string' || !s.vehicles.find((v) => v.id === raw.lastVehicleId)) {
    s.lastVehicleId = s.vehicles[s.vehicles.length - 1]?.id || base.lastVehicleId;
  } else {
    s.lastVehicleId = raw.lastVehicleId;
  }

  // --- player & stats ------------------------------------------------------
  const rawPlayer = raw.player && typeof raw.player === 'object' ? raw.player : {};
  s.player = { ...base.player, ...rawPlayer };
  s.player.x = Number.isFinite(s.player.x) ? s.player.x : base.player.x;
  s.player.z = Number.isFinite(s.player.z) ? s.player.z : base.player.z;
  s.player.yaw = Number.isFinite(s.player.yaw) ? s.player.yaw : base.player.yaw;
  if (typeof s.player.inVehicle !== 'string' && s.player.inVehicle !== null) s.player.inVehicle = null;
  if (s.player.inVehicle && !s.vehicles.find((v) => v.id === s.player.inVehicle)) s.player.inVehicle = null;

  const rawStats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  s.stats = { ...base.stats, ...rawStats };
  s.stats.day = Number.isFinite(s.stats.day) ? Math.max(1, Math.floor(s.stats.day)) : base.stats.day;
  s.stats.payrollTimer = Number.isFinite(s.stats.payrollTimer) ? s.stats.payrollTimer : base.stats.payrollTimer;
  s.stats.tasksCompleted = Number.isFinite(s.stats.tasksCompleted) ? Math.max(0, Math.floor(s.stats.tasksCompleted)) : 0;
  s.stats.totalEarned = Number.isFinite(s.stats.totalEarned) ? s.stats.totalEarned : 0;

  s.cash = Number.isFinite(s.cash) ? s.cash : base.cash;
  s.seenHelp = !!raw.seenHelp;
  if (s.activeJob && !OCCUPATIONS[s.activeJob]) s.activeJob = null;

  // Keep employee lists and citizen employer fields consistent.
  for (const c of s.citizens) {
    if (c.employer && (!s.businesses[c.employer] || typeof c.employer !== 'string')) c.employer = null;
  }
  for (const [id, b] of Object.entries(s.businesses)) {
    if (!b) continue;
    b.employees = s.citizens.filter((c) => c && c.employer === id).map((c) => c.id);
    // clamp storedProfit etc already done
  }
  s.version = SAVE_VERSION;
  return s;
}

// ---------------------------------------------------------------------------
// Ranks & occupations
// ---------------------------------------------------------------------------
export function rankIndexFor(xp) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) idx = i;
  return idx;
}
export function rankFor(xp) { return RANKS[rankIndexFor(xp)]; }
export function nextRank(xp) { return RANKS[rankIndexFor(xp) + 1] || null; }
export function payMultiplier(xp) { return 1 + rankIndexFor(xp) * RANK_PAY_BONUS; }

export function isOccupationUnlocked(state, occId) {
  const occ = OCCUPATIONS[occId];
  if (!occ) return false;
  if (occ.kind === 'starter') return true;
  return !!state.businesses[occ.business];
}

export function unlockedOccupations(state) {
  return Object.keys(OCCUPATIONS).filter((id) => isOccupationUnlocked(state, id));
}

export function clockIn(state, occId) {
  if (!isOccupationUnlocked(state, occId)) return { ok: false, msg: 'That occupation is locked. Build the matching startup first.' };
  state.activeJob = occId;
  return { ok: true, msg: `Clocked in as ${OCCUPATIONS[occId].title}.` };
}

export function clockOut(state) {
  const prev = state.activeJob;
  state.activeJob = null;
  return { ok: !!prev, msg: prev ? `Clocked out of ${OCCUPATIONS[prev].title}.` : 'You are not on shift.' };
}

// Called when a task is finished. basePay is the task's pay before rank bonus.
export function completeTask(state, occId, basePay) {
  const xpBefore = state.jobXP[occId] || 0;
  const pay = Math.round(basePay * payMultiplier(xpBefore));
  state.jobXP[occId] = xpBefore + 1;
  state.cash += pay;
  state.stats.tasksCompleted += 1;
  state.stats.totalEarned += pay;
  const rankUp = rankIndexFor(state.jobXP[occId]) > rankIndexFor(xpBefore);
  return { pay, rankUp, rank: rankFor(state.jobXP[occId]).name };
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------
export function jobSlots(level) { return BASE_JOB_SLOTS + SLOTS_PER_LEVEL * (level - 1); }
export function upgradeCost(bizId, level) { return Math.round(BUSINESSES[bizId].cost * 0.6 * level); }
export function builtCount(state) { return Object.values(state.businesses).filter(Boolean).length; }
export function employedCount(state) { return state.citizens.filter((c) => c.employer).length; }

export function businessDailyNumbers(bizId, biz) {
  const def = BUSINESSES[bizId];
  const workers = biz.employees.length;
  const revenue = Math.round(workers * def.revenuePerWorker * (1 + LEVEL_REVENUE_BONUS * (biz.level - 1)));
  const wages = workers * def.wagePerWorker;
  return { workers, revenue, wages, profit: revenue - wages };
}

export function buyLot(state, bizId) {
  const def = BUSINESSES[bizId];
  if (!def) return { ok: false, msg: 'Unknown lot.' };
  if (state.businesses[bizId]) return { ok: false, msg: `${def.name} is already built.` };
  if (state.cash < def.cost) return { ok: false, msg: `You need $${def.cost.toLocaleString()} to build ${def.name}.` };
  state.cash -= def.cost;
  state.businesses[bizId] = { level: 1, storedProfit: 0, lifetimeProfit: 0, employees: [] };
  return { ok: true, msg: `${def.name} is open! New occupation unlocked: ${OCCUPATIONS[def.occupation].title}.` };
}

export function upgradeBusiness(state, bizId) {
  const biz = state.businesses[bizId];
  if (!biz) return { ok: false, msg: 'Build the startup first.' };
  if (biz.level >= MAX_BUSINESS_LEVEL) return { ok: false, msg: 'Already at max level.' };
  const cost = upgradeCost(bizId, biz.level);
  if (state.cash < cost) return { ok: false, msg: `Upgrade costs $${cost.toLocaleString()}.` };
  state.cash -= cost;
  biz.level += 1;
  return { ok: true, msg: `${BUSINESSES[bizId].name} upgraded to level ${biz.level} (${jobSlots(biz.level)} job slots).` };
}

export function hireCitizen(state, bizId, citizenId) {
  const biz = state.businesses[bizId];
  if (!biz) return { ok: false, msg: 'Build the startup first.' };
  if (biz.employees.length >= jobSlots(biz.level)) return { ok: false, msg: 'No open job slots. Upgrade the building to add more.' };
  const c = state.citizens.find((x) => x.id === citizenId);
  if (!c) return { ok: false, msg: 'Citizen not found.' };
  if (c.employer) return { ok: false, msg: `${c.name} already has a job.` };
  c.employer = bizId;
  biz.employees.push(c.id);
  const occ = OCCUPATIONS[BUSINESSES[bizId].occupation];
  return { ok: true, msg: `${c.name} hired as ${occ.title} at ${BUSINESSES[bizId].name}!` };
}

export function collectProfit(state, bizId) {
  const biz = state.businesses[bizId];
  if (!biz) return { ok: false, amount: 0, msg: 'Nothing to collect.' };
  const amount = Math.floor(biz.storedProfit);
  if (amount <= 0) return { ok: false, amount: 0, msg: 'No profit stored yet. Hire workers and wait for payday.' };
  biz.storedProfit -= amount;
  state.cash += amount;
  state.stats.totalEarned += amount;
  return { ok: true, amount, msg: `Collected $${amount.toLocaleString()} from ${BUSINESSES[bizId].name}.` };
}

export function runPayrollCycle(state) {
  let total = 0;
  const per = {};
  for (const [id, biz] of Object.entries(state.businesses)) {
    if (!biz) continue;
    const n = businessDailyNumbers(id, biz);
    biz.storedProfit += n.profit;
    biz.lifetimeProfit += n.profit;
    per[id] = n;
    total += n.profit;
  }
  state.stats.day += 1;
  return { total, per };
}

// Advance the payroll timer; returns a payroll result when a cycle elapsed, else null.
export function tickPayroll(state, dt) {
  state.stats.payrollTimer -= dt;
  if (state.stats.payrollTimer <= 0) {
    state.stats.payrollTimer += PAYROLL_INTERVAL;
    return runPayrollCycle(state);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------
export function buyVehicle(state, modelId, color, spot) {
  const m = VEHICLE_MODELS[modelId];
  if (!m || !m.forSale) return { ok: false, msg: 'That model is not for sale.' };
  if (state.cash < m.price) return { ok: false, msg: `You need $${m.price.toLocaleString()} for the ${m.name}.` };
  state.cash -= m.price;
  const v = {
    id: `v${state.nextVehicleId++}`,
    model: modelId,
    color: m.fixedColor || color,
    x: spot?.x ?? 0, z: spot?.z ?? 0, yaw: spot?.yaw ?? 0,
  };
  state.vehicles.push(v);
  state.lastVehicleId = v.id;
  return { ok: true, vehicle: v, msg: `You bought a ${m.name}! It's parked out front.` };
}

export function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
