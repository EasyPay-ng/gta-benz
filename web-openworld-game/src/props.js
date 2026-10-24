// MetroVenture 3D — pure furniture interaction, rest/energy & door logic (no Three.js).
//
// Every 3D prop in the city (sofas, beds, TVs, bookshelves, kitchen counters,
// bars, pool tables, server racks, lab benches, hospital beds, loungers, lamps,
// pianos and reception desks) is interactive. This module owns the rules:
// what each prop does, how much energy/comfort it restores, prices & cooldowns,
// how the character should pose when using it, and the swing-door state machine.

// ---------------------------------------------------------------------------
// Rest & wellbeing (persisted on state.leisure)
// ---------------------------------------------------------------------------
export const MAX_ENERGY = 100;
export const MAX_COMFORT = 100;
export const MAX_HEALTH = 100;
export const MAX_FITNESS = 100;
export const LOW_ENERGY = 15;
export const LOW_COMFORT = 20;

export const ENERGY_DRAIN_IDLE = 0.012;      // per second, standing still
export const ENERGY_DRAIN_WALK = 0.035;      // per second, walking
export const ENERGY_DRAIN_SPRINT = 0.11;     // per second, sprinting
export const ENERGY_REGEN_SEATED = 0.28;     // per second, sitting/lounging
export const COMFORT_DRAIN_WALK = 0.02;
export const COMFORT_DRAIN_SPRINT = 0.05;
export const COMFORT_REGEN_SEATED = 0.38;

export function createLeisureState() {
  return {
    energy: MAX_ENERGY,
    comfort: 78,
    health: MAX_HEALTH,
    fitness: 18,
    cooldowns: {},
    seated: false,
    hotel: null, // { placeId, room, nights, night: 1, day }
    stats: {
      sits: 0, naps: 0, tv: 0, reads: 0, workouts: 0, meals: 0,
      movies: 0, visits: 0, swims: 0, sleeps: 0,
    },
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

export function normalizeLeisureState(raw) {
  const base = createLeisureState();
  if (!raw || typeof raw !== 'object') return base;
  const stats = { ...base.stats };
  if (raw.stats && typeof raw.stats === 'object') {
    for (const k of Object.keys(stats)) stats[k] = Math.max(0, Math.floor(num(raw.stats[k], 0)));
  }
  const cooldowns = {};
  if (raw.cooldowns && typeof raw.cooldowns === 'object') {
    for (const [k, v] of Object.entries(raw.cooldowns)) {
      if (typeof k === 'string' && k.length <= 24 && Number.isFinite(v)) cooldowns[k] = Math.max(0, Math.min(v, 1e13));
    }
  }
  let hotel = null;
  if (raw.hotel && typeof raw.hotel === 'object' && typeof raw.hotel.placeId === 'string') {
    hotel = {
      placeId: raw.hotel.placeId.slice(0, 32),
      room: Math.max(1, Math.min(9999, Math.floor(num(raw.hotel.room, 101)))),
      nights: Math.max(1, Math.min(30, Math.floor(num(raw.hotel.nights, 1)))),
      night: Math.max(1, Math.min(30, Math.floor(num(raw.hotel.night, 1)))),
      day: Math.max(1, Math.floor(num(raw.hotel.day, 1))),
    };
  }
  return {
    energy: clamp(num(raw.energy, base.energy), 0, MAX_ENERGY),
    comfort: clamp(num(raw.comfort, base.comfort), 0, MAX_COMFORT),
    health: clamp(num(raw.health, base.health), 0, MAX_HEALTH),
    fitness: clamp(num(raw.fitness, base.fitness), 0, MAX_FITNESS),
    cooldowns,
    seated: false,
    hotel,
    stats,
  };
}

/** Passive drain/regen each frame. Mutates `leisure`. */
export function tickLeisure(leisure, dt, { sprinting = false, moving = false, seated = false } = {}) {
  if (!leisure) return null;
  const step = Math.max(0, Math.min(dt || 0, 1));
  if (seated) {
    leisure.energy = clamp(leisure.energy + ENERGY_REGEN_SEATED * step, 0, MAX_ENERGY);
    leisure.comfort = clamp(leisure.comfort + COMFORT_REGEN_SEATED * step, 0, MAX_COMFORT);
  } else {
    const drain = sprinting ? ENERGY_DRAIN_SPRINT : moving ? ENERGY_DRAIN_WALK : ENERGY_DRAIN_IDLE;
    leisure.energy = clamp(leisure.energy - drain * step, 0, MAX_ENERGY);
    const cd = sprinting ? COMFORT_DRAIN_SPRINT : moving ? COMFORT_DRAIN_WALK : 0;
    leisure.comfort = clamp(leisure.comfort - cd * step, 0, MAX_COMFORT);
  }
  return {
    tired: leisure.energy < LOW_ENERGY,
    uncomfortable: leisure.comfort < LOW_COMFORT,
  };
}

/** Sprint speed multiplier from fitness and fatigue (0.62 – 1.12). */
export function sprintMultiplier(leisure) {
  if (!leisure) return 1;
  const fit = 0.9 + (clamp(leisure.fitness, 0, MAX_FITNESS) / MAX_FITNESS) * 0.22;
  const tired = leisure.energy < LOW_ENERGY ? 0.72 : 1;
  return +(fit * tired).toFixed(3);
}

export function applyWellbeing(leisure, effects = {}) {
  if (!leisure) return;
  if (effects.energy) leisure.energy = clamp(leisure.energy + effects.energy, 0, MAX_ENERGY);
  if (effects.comfort) leisure.comfort = clamp(leisure.comfort + effects.comfort, 0, MAX_COMFORT);
  if (effects.health) leisure.health = clamp(leisure.health + effects.health, 0, MAX_HEALTH);
  if (effects.fitness) leisure.fitness = clamp(leisure.fitness + effects.fitness, 0, MAX_FITNESS);
}

export function wellbeingLabel(leisure) {
  if (!leisure) return 'Rested';
  if (leisure.energy < LOW_ENERGY) return 'Exhausted';
  if (leisure.comfort < LOW_COMFORT) return 'Restless';
  if (leisure.energy > 85 && leisure.comfort > 70) return 'Energised';
  return 'Okay';
}

// ---------------------------------------------------------------------------
// Furniture interaction catalog
// ---------------------------------------------------------------------------
// pose: 'sit' | 'lie' | 'stand'  · y = hip offset added to the floor position
export const PROP_INTERACTIONS = {
  sofa: {
    verb: 'Sit on the sofa', icon: '🛋', pose: 'sit', cooldown: 8, action: 'sit',
    effects: { comfort: 18, energy: 8 }, stat: 'sits',
    msg: '🛋 You sink into the sofa and put your feet up.',
  },
  armchair: {
    verb: 'Sit in the armchair', icon: '💺', pose: 'sit', cooldown: 8, action: 'sit',
    effects: { comfort: 14, energy: 6 }, stat: 'sits',
    msg: '💺 You relax in the armchair.',
  },
  chair: {
    verb: 'Take a seat', icon: '🪑', pose: 'sit', cooldown: 10, action: 'sit',
    effects: { comfort: 8, energy: 4 }, stat: 'sits',
    msg: '🪑 You take a seat and stretch your legs.',
  },
  bench: {
    verb: 'Sit on the bench', icon: '🪑', pose: 'sit', cooldown: 10, action: 'sit',
    effects: { comfort: 10, energy: 5 }, stat: 'sits',
    msg: '🌳 You sit on the bench and watch Metro City go by.',
  },
  bed: {
    verb: 'Sleep in the bed', icon: '🛏', pose: 'lie', cooldown: 60, action: 'sleep',
    effects: { energy: 52, comfort: 30, health: 8 }, stat: 'naps',
    msg: '🛏 You sleep for a while and wake up refreshed.',
  },
  lounger: {
    verb: 'Lounge in the sun', icon: '🏖', pose: 'lie', cooldown: 25, action: 'sunbathe',
    effects: { energy: 16, comfort: 20 }, stat: 'swims',
    msg: '🏖 You stretch out on the lounger and soak up the sun.',
  },
  medbed: {
    verb: 'Rest on the treatment bed', icon: '🩺', pose: 'lie', cooldown: 45, action: 'rest',
    price: 25, effects: { health: 40, energy: 20, comfort: 10 }, stat: 'visits',
    msg: '🩺 A nurse checks you over — you feel much better.',
  },
  tvwall: {
    verb: 'Watch TV', icon: '📺', pose: 'sit', cooldown: 30, action: 'tv',
    effects: { comfort: 22, energy: 6 }, stat: 'tv',
    msg: '📺 You kick back and watch a Metro Sports highlights reel.',
  },
  bookshelf: {
    verb: 'Browse & read', icon: '📚', pose: 'stand', cooldown: 14, action: 'read',
    effects: { comfort: 8 }, stat: 'reads', study: true,
    msg: '📚 You lose yourself in a good book.',
  },
  desk: {
    verb: 'Work at the desk', icon: '🖥', pose: 'sit', cooldown: 30, action: 'type',
    effects: { comfort: -4 }, stat: 'reads', study: true,
    msg: '🖥 You put in a focused work session at the desk.',
  },
  labbench: {
    verb: 'Run an experiment', icon: '🧪', pose: 'stand', cooldown: 30, action: 'experiment',
    effects: { comfort: 2 }, stat: 'reads', study: true,
    msg: '🧪 You run a lab experiment and log the results.',
  },
  kitchen: {
    verb: 'Cook a meal', icon: '🍳', pose: 'stand', cooldown: 45, action: 'cook',
    price: 12, effects: { energy: 28, comfort: 12 }, stat: 'meals',
    msg: '🍳 You cook a hot meal and eat it while it is still steaming.',
  },
  bar: {
    verb: 'Order a drink', icon: '🍹', pose: 'stand', cooldown: 25, action: 'drink',
    price: 15, effects: { comfort: 16, energy: -6 }, stat: 'meals',
    msg: '🍹 You order a cold drink at the bar.',
  },
  pooltable: {
    verb: 'Play a frame of pool', icon: '🎱', pose: 'stand', cooldown: 40, action: 'pool',
    price: 10, effects: { comfort: 20, fitness: 2 }, stat: 'sits',
    msg: '🎱 You run the table and sink the black.',
  },
  serverrack: {
    verb: 'Run an IT shift', icon: '🖧', pose: 'stand', cooldown: 75, action: 'type',
    effects: { comfort: -6 }, cash: 45, xp: 4, stat: 'reads',
    msg: '🖧 You patch the racks and pick up a freelance IT job — +$45.',
  },
  piano: {
    verb: 'Play the piano', icon: '🎹', pose: 'stand', cooldown: 35, action: 'piano',
    effects: { comfort: 18 }, stat: 'visits',
    msg: '🎹 You play a few bars and heads turn.',
  },
  treadmill: {
    verb: 'Run on the treadmill', icon: '🏃', pose: 'stand', cooldown: 45, action: 'run',
    effects: { fitness: 3, energy: -9, comfort: 4 }, stat: 'workouts',
    msg: '🏃 You run 5 km on the treadmill — legs burning, feeling strong.',
  },
  gymbench: {
    verb: 'Lift weights', icon: '🏋', pose: 'stand', cooldown: 45, action: 'benchpress',
    effects: { fitness: 4, energy: -11, comfort: 3 }, stat: 'workouts',
    msg: '🏋 You rack up a heavy set — +4 fitness.',
  },
  dumbbellrack: {
    verb: 'Train with dumbbells', icon: '💪', pose: 'stand', cooldown: 35, action: 'curls',
    effects: { fitness: 2, energy: -6, comfort: 2 }, stat: 'workouts',
    msg: '💪 You knock out a dumbbell circuit.',
  },
  cinema_screen: {
    verb: 'Watch a movie', icon: '🎬', pose: 'stand', cooldown: 5, action: 'movie',
    effects: {}, stat: 'movies', service: true,
    msg: '🎬 You walk up to the box office.',
  },
  artframe: {
    verb: 'Admire the artwork', icon: '🖼', pose: 'stand', cooldown: 50, action: 'admire',
    effects: { comfort: 5 }, stat: 'visits',
    msg: '🖼 You study the brushwork up close.',
  },
  counter: {
    verb: 'Browse the shop', icon: '🛍', pose: 'stand', cooldown: 5, action: 'talk',
    effects: {}, stat: 'visits', service: true,
    msg: '🛍 You browse the counter.',
  },
  sculpture: {
    verb: 'Admire the art', icon: '🗿', pose: 'stand', cooldown: 45, action: 'admire',
    effects: { comfort: 6 }, stat: 'visits',
    msg: '🗿 You stop and admire the piece.',
  },
  planter: {
    verb: 'Water the plant', icon: '🪴', pose: 'stand', cooldown: 60, action: 'water',
    effects: { comfort: 4 }, stat: 'visits',
    msg: '🪴 You water the plant — the leaves look happier already.',
  },
  lamp: {
    verb: 'Toggle the lamp', icon: '💡', pose: 'stand', cooldown: 4, action: 'switch',
    effects: {}, stat: 'visits',
    msg: '💡 You flick the lamp switch.',
  },
  table: {
    verb: 'Dine at the table', icon: '🍽', pose: 'stand', cooldown: 90, action: 'eat',
    effects: { comfort: 14, energy: 9 }, stat: 'meals',
    msg: '🍽 You set the table and enjoy a proper meal at home.',
  },
  reception: {
    verb: 'Talk to reception', icon: '🛎', pose: 'stand', cooldown: 2, action: 'talk',
    effects: {}, stat: 'visits', service: true,
    msg: '🛎 The receptionist looks up and smiles.',
  },

  // ---- FreshMart Superstore ------------------------------------------------
  // The supermarket props open the shopping UI instead of applying effects on
  // the spot (see `usePropSpot` in game.js); `shop` marks that family.
  shelf: {
    verb: 'Shop the aisle', icon: '🛒', pose: 'stand', cooldown: 0.2, action: 'shop',
    effects: {}, stat: 'visits', shop: true,
    msg: '🛒 You browse the shelf.',
  },
  fridge: {
    verb: 'Open the chiller', icon: '🧊', pose: 'stand', cooldown: 0.2, action: 'shop',
    effects: {}, stat: 'visits', shop: true,
    msg: '🧊 Cold air rolls out of the chiller.',
  },
  produce: {
    verb: 'Pick fresh produce', icon: '🥬', pose: 'stand', cooldown: 0.2, action: 'shop',
    effects: {}, stat: 'visits', shop: true,
    msg: '🥬 You turn a tomato over in your hand.',
  },
  bakery: {
    verb: 'Look in the bakery case', icon: '🥖', pose: 'stand', cooldown: 0.2, action: 'shop',
    effects: {}, stat: 'visits', shop: true,
    msg: '🥖 Warm bread, still steaming.',
  },
  till: {
    verb: 'Pay at the till', icon: '💳', pose: 'stand', cooldown: 0.2, action: 'pay',
    effects: {}, stat: 'visits', shop: true,
    msg: '💳 The self-checkout screen wakes up.',
  },
  trolley: {
    verb: 'Take a trolley', icon: '🛒', pose: 'stand', cooldown: 0.2, action: 'cart',
    effects: {}, stat: 'visits', shop: true,
    msg: '🛒 You pull a trolley free of the stack.',
  },
};

/**
 * 3D Architect furniture ids → interactive prop types, so everything you build
 * yourself is usable with E exactly like the city's own furniture.
 */
export const BUILD_PROP_MAP = {
  sofa: 'sofa',
  bed: 'bed',
  desk: 'desk',
  table: 'table',
  tv_stand: 'tvwall',
  bookshelf: 'bookshelf',
  lamp: 'lamp',
  plant: 'planter',
};

export function propTypeForBuild(itemId) {
  return BUILD_PROP_MAP[itemId] || null;
}

// ---------------------------------------------------------------------------
// Real seat geometry: where the body actually rests on each piece of furniture.
// `surface` is the height of the cushion/mattress above the prop's base,
// `forward` slides a lying body along the prop's long axis (feet end),
// `recline` tilts a lounger back by that many radians.
// ---------------------------------------------------------------------------
export const PROP_SEATS = {
  sofa: { surface: 0.57, pose: 'sit', forward: 0 },
  armchair: { surface: 0.48, pose: 'sit', forward: 0 },
  chair: { surface: 0.48, pose: 'sit', forward: 0 },
  bench: { surface: 0.50, pose: 'sit', forward: 0 },
  // the desk mesh has its own chair 0.95 m in front, facing the screen
  desk: { surface: 0.48, pose: 'sit', forward: 0.90, yawOffset: Math.PI, offset: true },
  bed: { surface: 0.63, pose: 'lie', forward: 0.90, recline: 0 },
  medbed: { surface: 0.67, pose: 'lie', forward: 0.90, recline: 0 },
  lounger: { surface: 0.51, pose: 'lie', forward: 0.52, recline: 0.42 },
};

export function seatFor(propType) {
  return PROP_SEATS[propType] || null;
}

export function actionFor(propType) {
  return PROP_INTERACTIONS[propType]?.action || null;
}

// ---------------------------------------------------------------------------
// Fuel & Go convenience-store stock (every fuel station has a walk-in shop)
// ---------------------------------------------------------------------------
export const SNACKS = {
  coffee: { name: 'Hot coffee', icon: '☕', price: 5, effects: { energy: 14, comfort: 4 }, stat: 'meals' },
  snack: { name: 'Snack pack', icon: '🍫', price: 8, effects: { energy: 18, comfort: 8 }, stat: 'meals' },
  meal: { name: 'Hot meal', icon: '🍱', price: 22, effects: { energy: 34, comfort: 16 }, stat: 'meals' },
};

export function buySnack(state, id) {
  const def = SNACKS[id];
  if (!def) return { ok: false, msg: 'That item is not in stock.' };
  if ((state.cash || 0) < def.price) return { ok: false, msg: `${def.name} costs $${def.price} — not enough cash.` };
  state.cash -= def.price;
  if (!state.leisure) state.leisure = createLeisureState();
  applyWellbeing(state.leisure, def.effects);
  state.leisure.stats[def.stat] = (state.leisure.stats[def.stat] || 0) + 1;
  return {
    ok: true,
    msg: `${def.icon} You grab a ${def.name.toLowerCase()} at the counter — +${def.effects.energy} energy. (-$${def.price})`,
  };
}

export function interactionFor(propType) {
  return PROP_INTERACTIONS[propType] || null;
}

export function isInteractable(propType) {
  return !!PROP_INTERACTIONS[propType];
}

/** Supermarket props open the shopping UI rather than applying effects. */
export function isShopProp(propType) {
  return !!(PROP_INTERACTIONS[propType] && PROP_INTERACTIONS[propType].shop);
}

// Screens use the seated pose to watch from, but they are not seats themselves.
const SCREEN_TYPES = new Set(['tvwall', 'cinema_screen']);

/** A television, media wall or cinema screen: pressing E shows a picture. */
export function isScreen(propType) {
  return SCREEN_TYPES.has(propType);
}

export function isSeating(propType) {
  if (SCREEN_TYPES.has(propType)) return false;
  const def = interactionFor(propType);
  return !!def && (def.pose === 'sit' || def.pose === 'lie');
}

/** Cooldown remaining in ms for a prop type (0 = ready). */
export function cooldownLeft(leisure, propType, now = Date.now()) {
  const until = leisure?.cooldowns?.[propType] || 0;
  return Math.max(0, until - now);
}

/**
 * Use a piece of furniture. Pure: only mutates `state.leisure`, `state.cash`
 * and `state.stats.totalEarned`.
 * @returns {{ ok:boolean, msg:string, pose:string|null, def:object|null, study:boolean, service:boolean, fresh:boolean }}
 */
export function useProp(state, propType, { now = Date.now(), spot = '' } = {}) {
  const def = interactionFor(propType);
  if (!def) return { ok: false, msg: 'Nothing to use there.', pose: null, def: null, study: false, service: false, fresh: false };
  if (!state.leisure) state.leisure = createLeisureState();
  const leisure = state.leisure;
  if (!leisure.cooldowns) leisure.cooldowns = {};

  if (def.service) {
    return { ok: true, msg: def.msg, pose: null, def, study: false, service: true, fresh: false };
  }

  const left = cooldownLeft(leisure, propType, now);
  if (left > 0) {
    return {
      ok: true,
      msg: `${def.icon} ${def.verb.replace(/^[A-Z]/, (c) => c.toLowerCase())} — you already did that recently.`,
      pose: def.pose === 'stand' ? null : def.pose,
      def,
      study: false,
      service: false,
      fresh: false,
    };
  }

  const price = def.price || 0;
  if (price > 0 && (state.cash || 0) < price) {
    return { ok: false, msg: `That costs $${price} — you only have $${Math.max(0, Math.floor(state.cash || 0))}.`, pose: null, def, study: false, service: false, fresh: false };
  }
  if (price > 0) state.cash = Math.max(0, (state.cash || 0) - price);

  applyWellbeing(leisure, def.effects || {});
  if (def.cash) {
    state.cash = (state.cash || 0) + def.cash;
    state.stats = state.stats || {};
    state.stats.totalEarned = (state.stats.totalEarned || 0) + def.cash;
  }
  if (def.xp && state.activeJob) {
    state.jobXP = state.jobXP || {};
    state.jobXP[state.activeJob] = (state.jobXP[state.activeJob] || 0) + def.xp;
  }
  if (def.stat && leisure.stats) leisure.stats[def.stat] = (leisure.stats[def.stat] || 0) + 1;
  leisure.cooldowns[propType] = now + (def.cooldown || 10) * 1000;

  const bits = [def.msg];
  if (price > 0) bits.push(`(-$${price})`);
  if (def.effects?.energy) bits.push(`${def.effects.energy > 0 ? '+' : ''}${def.effects.energy} energy`);
  if (def.effects?.comfort) bits.push(`${def.effects.comfort > 0 ? '+' : ''}${def.effects.comfort} comfort`);
  if (def.cash) bits.push(`+$${def.cash}`);
  if (spot) bits.push(`· ${spot}`);
  return {
    ok: true,
    msg: bits.join(' '),
    pose: def.pose === 'stand' ? null : def.pose,
    def,
    study: !!def.study,
    service: false,
    fresh: true,
  };
}

// ---------------------------------------------------------------------------
// Door state machine (open / close / swing animation / blocking)
// ---------------------------------------------------------------------------
export const DOOR_SWING = 1.75;          // radians the leaf swings inward
export const DOOR_OPEN_SPEED = 3.1;      // radians per second toward open
export const DOOR_CLOSE_SPEED = 2.4;     // radians per second toward closed
export const DOOR_BLOCK_THRESHOLD = 0.45; // fraction open at which the doorway clears

export function createDoorState(spec = {}) {
  return {
    id: spec.id || `door-${Math.random().toString(36).slice(2, 8)}`,
    x: +spec.x || 0,
    z: +spec.z || 0,
    y: +spec.y || 0,
    yaw: +spec.yaw || 0,
    width: Math.max(1, +spec.width || 4),
    height: Math.max(1.8, +spec.height || 3.4),
    leaves: spec.leaves === 2 ? 2 : 1,
    label: spec.label || 'Door',
    buildingId: spec.buildingId || null,
    locked: !!spec.locked,
    open: !!spec.open,
    amount: spec.open ? 1 : 0,
  };
}

export function toggleDoorState(door, { force = null } = {}) {
  if (!door) return { ok: false, msg: 'No door there.' };
  if (door.locked) return { ok: false, msg: `${door.label} is locked.` };
  door.open = force === null ? !door.open : !!force;
  return { ok: true, open: door.open, msg: `${door.open ? '🚪 Opened' : '🚪 Closed'} ${door.label.toLowerCase()}.` };
}

/** Advance the swing animation. Returns the new open amount (0..1). */
export function stepDoor(door, dt) {
  if (!door) return 0;
  const target = door.open ? 1 : 0;
  const speed = door.open ? DOOR_OPEN_SPEED : DOOR_CLOSE_SPEED;
  const step = speed * Math.max(0, Math.min(dt || 0, 0.1));
  if (door.amount < target) door.amount = Math.min(target, door.amount + step);
  else if (door.amount > target) door.amount = Math.max(target, door.amount - step);
  return door.amount;
}

export function doorIsOpen(door) {
  return !!door && door.amount >= DOOR_BLOCK_THRESHOLD;
}

/** Doorway AABB while the leaf is swinging shut. */
export function doorCollider(door) {
  if (!door || doorIsOpen(door)) return null;
  const along = Math.cos(door.yaw) >= 0 ? 1 : -1;
  // The leaf spans `width` along the facade (perpendicular to the facing yaw).
  const halfW = door.width / 2;
  const fx = Math.sin(door.yaw);
  const fz = Math.cos(door.yaw);
  const rx = fz * along;
  const rz = -fx * along;
  const cx = door.x;
  const cz = door.z;
  const t = 0.28;
  return {
    minX: Math.min(cx - rx * halfW, cx + rx * halfW) - t,
    maxX: Math.max(cx - rx * halfW, cx + rx * halfW) + t,
    minZ: Math.min(cz - rz * halfW, cz + rz * halfW) - t,
    maxZ: Math.max(cz - rz * halfW, cz + rz * halfW) + t,
    minY: door.y - 0.2,
    maxY: door.y + door.height,
  };
}

export function doorColliders(doors, feetY = 0) {
  if (!doors || !doors.length) return EMPTY;
  let out = null;
  for (const d of doors) {
    const c = doorCollider(d);
    if (!c) continue;
    if (feetY < c.minY - 0.3 || feetY > c.maxY) continue;
    (out || (out = [])).push(c);
  }
  return out || EMPTY;
}

const EMPTY = Object.freeze([]);

/** Is a world point inside a door's swing footprint (for interaction prompts)? */
export function doorDistance(door, x, z) {
  const dx = door.x - x;
  const dz = door.z - z;
  return Math.hypot(dx, dz);
}

export function normalizeDoors(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const d of raw) {
    if (!d || typeof d !== 'object') continue;
    const door = createDoorState({
      id: typeof d.id === 'string' ? d.id : undefined,
      x: d.x, z: d.z, y: d.y, yaw: d.yaw, width: d.width, height: d.height,
      leaves: d.leaves, label: d.label, buildingId: d.buildingId,
      open: !!d.open,
    });
    out.push(door);
    if (out.length >= 400) break;
  }
  return out;
}
