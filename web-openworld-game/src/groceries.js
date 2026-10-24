// MetroVenture 3D — FreshMart Superstore: catalogue, basket, checkout & pantry.
//
// Pure logic only (no DOM, no Three.js) so all of it is unit-tested in
// `tests/groceries.test.mjs`. The 3D store in `src/world.js` reads AISLES and
// GOODS to decide what stands on each shelf and what the aisle signs say.

import { applyWellbeing, createLeisureState } from './props.js';

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------
export const STORE = {
  id: 'freshmart',
  name: 'FreshMart Superstore',
  short: 'FreshMart',
  slogan: 'Fresh every day · Open 24/7',
  x: -37.5,
  z: 170,
  width: 34,
  depth: 20,
  height: 8.6,
  yaw: 0,
  tillCount: 4,
};

// ---------------------------------------------------------------------------
// Aisles & categories
// ---------------------------------------------------------------------------
export const CATEGORIES = {
  produce: { name: 'Fresh produce', icon: '🥬', color: '#22c55e' },
  dairy: { name: 'Dairy & eggs', icon: '🥛', color: '#38bdf8' },
  bakery: { name: 'Bakery', icon: '🥖', color: '#f59e0b' },
  pantry: { name: 'Pantry staples', icon: '🍚', color: '#a16207' },
  drinks: { name: 'Drinks', icon: '🥤', color: '#6366f1' },
  chilled: { name: 'Meat & fish', icon: '🥩', color: '#ef4444' },
  frozen: { name: 'Frozen', icon: '🍦', color: '#0ea5e9' },
  household: { name: 'Household', icon: '🧼', color: '#64748b' },
};

/** Carton colours used by the 3D stock on the shelves. */
export const CAT_COLORS = {
  produce: '#4ade80',
  dairy: '#e2e8f0',
  bakery: '#fbbf24',
  pantry: '#a16207',
  drinks: '#818cf8',
  chilled: '#f87171',
  frozen: '#7dd3fc',
  household: '#94a3b8',
};

/**
 * The five dry aisles in the middle of the shop. The produce island and the
 * bakery counter are their own counters, so those categories are not here.
 */
export const AISLES = [
  { id: 'A1', label: 'Dairy & eggs', categories: ['dairy'], color: '#38bdf8' },
  { id: 'A2', label: 'Pantry staples', categories: ['pantry'], color: '#a16207' },
  { id: 'A3', label: 'Drinks', categories: ['drinks'], color: '#6366f1' },
  { id: 'A4', label: 'Household', categories: ['household'], color: '#64748b' },
  { id: 'A5', label: 'Chilled & frozen', categories: ['chilled', 'frozen'], color: '#ef4444' },
];

// ---------------------------------------------------------------------------
// Catalogue. `energy` / `comfort` are what eating the item restores.
// ---------------------------------------------------------------------------
export const GOODS = {
  // produce (island counter)
  apple: { name: 'Apples', icon: '🍎', cat: 'produce', price: 3.5, unit: '3-pack', energy: 8, comfort: 3 },
  banana: { name: 'Bananas', icon: '🍌', cat: 'produce', price: 2.5, unit: 'bunch', energy: 9, comfort: 2 },
  tomato: { name: 'Tomatoes', icon: '🍅', cat: 'produce', price: 2.8, unit: '500 g', energy: 5, comfort: 1 },
  orange: { name: 'Oranges', icon: '🍊', cat: 'produce', price: 3, unit: '4-pack', energy: 8, comfort: 2 },
  avocado: { name: 'Avocados', icon: '🥑', cat: 'produce', price: 4.5, unit: '2-pack', energy: 7, comfort: 3 },
  potato: { name: 'Potatoes', icon: '🥔', cat: 'produce', price: 3.2, unit: '1 kg', energy: 6, comfort: 1 },

  // bakery counter
  bread: { name: 'Sliced loaf', icon: '🍞', cat: 'bakery', price: 3, unit: 'loaf', energy: 12, comfort: 5 },
  baguette: { name: 'Baguette', icon: '🥖', cat: 'bakery', price: 3.5, unit: 'each', energy: 12, comfort: 5 },
  croissant: { name: 'Croissants', icon: '🥐', cat: 'bakery', price: 2.8, unit: '2-pack', energy: 10, comfort: 6 },
  cake: { name: 'Celebration cake', icon: '🎂', cat: 'bakery', price: 9, unit: 'whole', energy: 18, comfort: 14 },

  // A1 dairy
  milk: { name: 'Milk', icon: '🥛', cat: 'dairy', price: 4, unit: '1 L', energy: 10, comfort: 4 },
  eggs: { name: 'Eggs', icon: '🥚', cat: 'dairy', price: 4.5, unit: 'dozen', energy: 14, comfort: 3 },
  cheese: { name: 'Cheddar', icon: '🧀', cat: 'dairy', price: 6, unit: '200 g', energy: 12, comfort: 6 },
  yoghurt: { name: 'Yoghurt', icon: '🥣', cat: 'dairy', price: 3.2, unit: '4-pack', energy: 9, comfort: 5 },
  butter: { name: 'Butter', icon: '🧈', cat: 'dairy', price: 3.8, unit: '250 g', energy: 6, comfort: 3 },

  // A2 pantry
  rice: { name: 'Long-grain rice', icon: '🍚', cat: 'pantry', price: 6, unit: '2 kg', energy: 20, comfort: 4 },
  pasta: { name: 'Pasta', icon: '🍝', cat: 'pantry', price: 3.5, unit: '500 g', energy: 16, comfort: 3 },
  oil: { name: 'Cooking oil', icon: '🫒', cat: 'pantry', price: 7, unit: '1 L', energy: 6, comfort: 2 },
  sugar: { name: 'Sugar', icon: '🍬', cat: 'pantry', price: 3, unit: '1 kg', energy: 4, comfort: 1 },
  coffee: { name: 'Ground coffee', icon: '☕', cat: 'pantry', price: 8, unit: '250 g', energy: 12, comfort: 6 },
  tea: { name: 'Tea bags', icon: '🍵', cat: 'pantry', price: 5, unit: '50 bags', energy: 8, comfort: 5 },

  // A3 drinks
  water: { name: 'Bottled water', icon: '💧', cat: 'drinks', price: 2, unit: '6-pack', energy: 6, comfort: 2 },
  cola: { name: 'Cola', icon: '🥤', cat: 'drinks', price: 3, unit: '1.5 L', energy: 10, comfort: 4 },
  juice: { name: 'Orange juice', icon: '🧃', cat: 'drinks', price: 3.5, unit: '1 L', energy: 12, comfort: 4 },
  beer: { name: 'Lager', icon: '🍺', cat: 'drinks', price: 5, unit: '4-pack', energy: 8, comfort: 8 },

  // A4 household
  detergent: { name: 'Detergent', icon: '🧼', cat: 'household', price: 6, unit: '1 L' },
  towels: { name: 'Paper towels', icon: '🧻', cat: 'household', price: 4, unit: '2 rolls' },
  candle: { name: 'Scented candle', icon: '🕯', cat: 'household', price: 5, unit: 'each' },

  // A5 chilled & frozen
  chicken: { name: 'Chicken', icon: '🍗', cat: 'chilled', price: 8, unit: '1 kg', energy: 22, comfort: 4 },
  beef: { name: 'Beef steak', icon: '🥩', cat: 'chilled', price: 12, unit: '500 g', energy: 26, comfort: 5 },
  fish: { name: 'Fresh fish', icon: '🐟', cat: 'chilled', price: 9, unit: '1 kg', energy: 20, comfort: 4 },
  sausage: { name: 'Sausages', icon: '🌭', cat: 'chilled', price: 6, unit: '6-pack', energy: 16, comfort: 4 },
  icecream: { name: 'Ice cream', icon: '🍦', cat: 'frozen', price: 6, unit: '1 L', energy: 14, comfort: 12 },
  pizza: { name: 'Frozen pizza', icon: '🍕', cat: 'frozen', price: 7, unit: 'each', energy: 24, comfort: 8 },
};

export const GOOD_IDS = Object.keys(GOODS);

export function goodsById(id) {
  return GOODS[id] || null;
}

export function goodsIn(category) {
  return GOOD_IDS.filter((id) => GOODS[id].cat === category);
}

/** Everything you can carry out in a trolley on the aisle with this id. */
export function goodsInAisle(aisleId) {
  const aisle = AISLES.find((a) => a.id === aisleId);
  if (!aisle) return [];
  return aisle.categories.flatMap((cat) => goodsIn(cat));
}

export function isEdible(id) {
  const g = GOODS[id];
  return !!g && ((g.energy || 0) > 0 || (g.comfort || 0) > 0);
}

const usd = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export function createGroceryState(seed = 1) {
  return {
    pantry: {},
    basket: {},
    list: makeList(seed, 5),
    listSeed: seed,
    stats: { shops: 0, itemsBought: 0, spent: 0, eaten: 0, listsDone: 0 },
  };
}

function sanitizeCounts(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, qty] of Object.entries(raw)) {
    if (!GOODS[id]) continue;
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n) || n <= 0) continue;
    out[id] = Math.min(99, n);
  }
  return out;
}

export function normalizeGroceryState(raw, seed = 1) {
  const base = createGroceryState(seed);
  if (!raw || typeof raw !== 'object') return base;
  const stats = { ...base.stats };
  if (raw.stats && typeof raw.stats === 'object') {
    for (const k of Object.keys(stats)) {
      const v = Math.floor(Number(raw.stats[k]));
      stats[k] = Number.isFinite(v) && v > 0 ? v : 0;
    }
  }
  const listSeed = Number.isFinite(raw.listSeed) ? Math.floor(raw.listSeed) : seed;
  const list = Array.isArray(raw.list)
    ? [...new Set(raw.list.filter((id) => GOODS[id] && isEdible(id)))].slice(0, 8)
    : [];
  return {
    pantry: sanitizeCounts(raw.pantry),
    basket: sanitizeCounts(raw.basket),
    list: list.length ? list : makeList(listSeed, 5),
    listSeed,
    stats,
  };
}

function ensure(state, seed = 1) {
  if (!state.groceries || typeof state.groceries !== 'object') state.groceries = createGroceryState(seed);
  return state.groceries;
}

// ---------------------------------------------------------------------------
// Shopping list — what the household needs this week
// ---------------------------------------------------------------------------
/** Deterministic PRNG (mulberry32) so a list only changes when the seed does. */
function rng(seed) {
  let a = (Math.imul(Math.floor(seed) || 1, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeList(seed = 1, count = 5, { avoid = [] } = {}) {
  const rand = rng(seed);
  const pool = GOOD_IDS.filter(isEdible);
  const skip = new Set(avoid);
  const out = [];
  let guard = 0;
  while (out.length < Math.max(1, Math.min(8, count)) && guard < 400) {
    guard += 1;
    const id = pool[Math.floor(rand() * pool.length) % pool.length];
    if (out.includes(id) || skip.has(id)) continue;
    out.push(id);
  }
  return out;
}

/** How much of this week's list is already in the pantry. */
export function listProgress(state) {
  const g = ensure(state);
  const items = g.list.map((id) => ({
    id,
    name: GOODS[id]?.name || id,
    icon: GOODS[id]?.icon || '•',
    have: g.pantry[id] || 0,
    got: (g.pantry[id] || 0) > 0,
  }));
  const done = items.filter((i) => i.got).length;
  return { items, done, total: items.length, complete: items.length > 0 && done === items.length };
}

// ---------------------------------------------------------------------------
// Basket
// ---------------------------------------------------------------------------
export function basketAdd(state, id, qty = 1) {
  const g = ensure(state);
  const good = GOODS[id];
  if (!good) return { ok: false, msg: 'That item is not in stock.' };
  const n = Math.max(1, Math.min(20, Math.floor(qty) || 1));
  g.basket[id] = Math.min(99, (g.basket[id] || 0) + n);
  return {
    ok: true,
    id,
    qty: g.basket[id],
    count: basketCount(state),
    total: basketTotal(state),
    msg: `${good.icon} ${good.name} → trolley (${g.basket[id]})`,
  };
}

export function basketRemove(state, id, qty = 1) {
  const g = ensure(state);
  const have = g.basket[id] || 0;
  if (!have) return { ok: false, msg: 'That is not in your trolley.' };
  const n = Math.max(1, Math.floor(qty) || 1);
  if (have - n <= 0) delete g.basket[id];
  else g.basket[id] = have - n;
  return {
    ok: true,
    id,
    qty: g.basket[id] || 0,
    count: basketCount(state),
    total: basketTotal(state),
    msg: `${GOODS[id]?.icon || '•'} ${GOODS[id]?.name || id} removed`,
  };
}

export function basketClear(state) {
  const g = ensure(state);
  g.basket = {};
  return { ok: true, msg: '🧺 Trolley emptied back onto the shelves.' };
}

export function basketLines(state) {
  const g = ensure(state);
  return Object.entries(g.basket)
    .filter(([id]) => GOODS[id])
    .map(([id, qty]) => {
      const good = GOODS[id];
      return {
        id, qty,
        name: good.name, icon: good.icon, cat: good.cat,
        price: good.price,
        line: round2(good.price * qty),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function basketTotal(state) {
  return round2(basketLines(state).reduce((sum, l) => sum + l.line, 0));
}

export function basketCount(state) {
  const g = ensure(state);
  return Object.values(g.basket).reduce((n, q) => n + (Number(q) || 0), 0);
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------
export function checkout(state, { now = Date.now() } = {}) {
  const g = ensure(state);
  const lines = basketLines(state);
  if (!lines.length) return { ok: false, msg: '🧺 Your trolley is empty — shop the aisles first.' };
  const total = basketTotal(state);
  if ((state.cash || 0) < total) {
    return { ok: false, msg: `🧾 That comes to ${usd(total)} and you only have ${usd(state.cash || 0)}.`, total };
  }
  state.cash = round2((state.cash || 0) - total);
  for (const line of lines) g.pantry[line.id] = Math.min(99, (g.pantry[line.id] || 0) + line.qty);
  const count = lines.reduce((n, l) => n + l.qty, 0);
  g.basket = {};
  g.stats.shops += 1;
  g.stats.itemsBought += count;
  g.stats.spent = round2(g.stats.spent + total);

  const progress = listProgress(state);
  let msg = `🧾 Paid ${usd(total)} for ${count} item${count === 1 ? '' : 's'} — bagged and carried home.`;
  if (progress.complete) {
    g.stats.listsDone += 1;
    g.listSeed += 1;
    g.list = makeList(g.listSeed, 5, { avoid: Object.keys(g.pantry).filter((id) => g.pantry[id] > 0) });
    msg += ' ✅ Shopping list complete — next week’s list is on your phone.';
  }
  return { ok: true, total, count, lines, listDone: progress.complete, msg };
}

// ---------------------------------------------------------------------------
// Pantry — eat what you bought
// ---------------------------------------------------------------------------
export function pantryLines(state) {
  const g = ensure(state);
  return Object.entries(g.pantry)
    .filter(([id]) => GOODS[id])
    .map(([id, qty]) => ({
      id, qty,
      name: GOODS[id].name, icon: GOODS[id].icon, cat: GOODS[id].cat,
      edible: isEdible(id),
      energy: GOODS[id].energy || 0,
      comfort: GOODS[id].comfort || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function pantryCount(state) {
  const g = ensure(state);
  return Object.values(g.pantry).reduce((n, q) => n + (Number(q) || 0), 0);
}

export function eatFromPantry(state, id) {
  const g = ensure(state);
  const good = GOODS[id];
  if (!good) return { ok: false, msg: 'That is not in your pantry.' };
  if (!isEdible(id)) return { ok: false, msg: `${good.icon} ${good.name} isn't food — that stays in the cupboard.` };
  if (!(g.pantry[id] > 0)) return { ok: false, msg: `You are out of ${good.name.toLowerCase()} — FreshMart has more.` };
  g.pantry[id] -= 1;
  if (g.pantry[id] <= 0) delete g.pantry[id];
  if (!state.leisure) state.leisure = createLeisureState();
  applyWellbeing(state.leisure, { energy: good.energy || 0, comfort: good.comfort || 0 });
  g.stats.eaten += 1;
  return {
    ok: true,
    id,
    msg: `${good.icon} You have ${good.name.toLowerCase()} — +${good.energy || 0} energy${good.comfort ? `, +${good.comfort} comfort` : ''}.`,
  };
}

/** One-glance summary for the HUD / phone. */
export function grocerySummary(state) {
  const g = ensure(state);
  const progress = listProgress(state);
  return {
    basketCount: basketCount(state),
    basketTotal: basketTotal(state),
    pantryCount: pantryCount(state),
    listDone: progress.done,
    listTotal: progress.total,
    complete: progress.complete,
    shops: g.stats.shops,
    spent: g.stats.spent,
  };
}
