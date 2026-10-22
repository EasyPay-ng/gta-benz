// MetroVenture 3D — pure Boutique Wardrobe & Vehicle Mod Shop logic (zero DOM / Three.js deps).

import {
  CLOTHING_ITEMS,
  OUTFIT_BUNDLES,
  VEHICLE_MODELS,
  CAR_COLORS,
  CAR_LIVERIES,
  RIM_FINISHES,
  UNDERGLOW_OPTIONS,
  RESPRAY_COST,
  APEX_MOD_DISCOUNT,
} from './data.js';

export function wardrobeKey(slot, id) {
  return `${slot}:${id}`;
}

export function starterWardrobe() {
  const keys = [];
  for (const [slot, items] of Object.entries(CLOTHING_ITEMS)) {
    for (const item of Object.values(items)) {
      if (item.price <= 0) keys.push(wardrobeKey(slot, item.id));
    }
  }
  return keys;
}

export function normalizeWardrobe(rawList, appearance = {}) {
  const set = new Set(starterWardrobe());
  if (Array.isArray(rawList)) {
    for (const k of rawList) if (typeof k === 'string') set.add(k);
  }
  // Never strip items already equipped on a migrated appearance
  for (const [slot, items] of Object.entries(CLOTHING_ITEMS)) {
    const sample = Object.values(items)[0];
    const worn = appearance?.[sample.field];
    if (worn && items[worn]) set.add(wardrobeKey(slot, worn));
  }
  return Array.from(set);
}

export function ownsClothing(state, slot, id) {
  const item = CLOTHING_ITEMS[slot]?.[id];
  if (!item) return false;
  if (item.price <= 0) return true;
  return Array.isArray(state.wardrobe) && state.wardrobe.includes(wardrobeKey(slot, id));
}

export function equipClothing(state, slot, id) {
  const item = CLOTHING_ITEMS[slot]?.[id];
  if (!item) return { ok: false, msg: 'Unknown clothing item.' };
  if (!ownsClothing(state, slot, id)) {
    return { ok: false, msg: `Visit Maison Verve Boutique to unlock ${item.name} ($${item.price.toLocaleString()}).` };
  }
  state.appearance[item.field] = id;
  return { ok: true, equipped: true, cost: 0, msg: `Equipped ${item.name}.` };
}

export function buyOrEquipClothing(state, slot, id) {
  const item = CLOTHING_ITEMS[slot]?.[id];
  if (!item) return { ok: false, msg: 'Unknown boutique item.' };
  if (ownsClothing(state, slot, id)) {
    state.appearance[item.field] = id;
    return { ok: true, bought: false, cost: 0, msg: `Equipped ${item.name}.` };
  }
  if (state.cash < item.price) {
    return { ok: false, msg: `You need $${(item.price - state.cash).toLocaleString()} more for ${item.name}.` };
  }
  state.cash -= item.price;
  if (!Array.isArray(state.wardrobe)) state.wardrobe = starterWardrobe();
  const key = wardrobeKey(slot, id);
  if (!state.wardrobe.includes(key)) state.wardrobe.push(key);
  state.appearance[item.field] = id;
  return { ok: true, bought: true, cost: item.price, msg: `🛍 Bought & equipped ${item.name} ($${item.price.toLocaleString()})!` };
}

export function bundleQuote(state, bundleId) {
  const bundle = OUTFIT_BUNDLES.find((b) => b.id === bundleId);
  if (!bundle) return null;
  let unownedRetail = 0;
  let totalRetail = 0;
  let allOwned = true;
  for (const [slot, id] of bundle.items) {
    const def = CLOTHING_ITEMS[slot]?.[id];
    if (!def) continue;
    totalRetail += def.price;
    if (!ownsClothing(state, slot, id)) {
      allOwned = false;
      unownedRetail += def.price;
    }
  }
  if (allOwned) return { bundle, allOwned: true, cost: 0, savings: 0 };
  const ratio = totalRetail > 0 ? bundle.price / totalRetail : 1;
  const cost = Math.max(50, Math.round(unownedRetail * ratio));
  return { bundle, allOwned: false, cost, savings: Math.max(0, unownedRetail - cost) };
}

export function buyOrEquipBundle(state, bundleId) {
  const q = bundleQuote(state, bundleId);
  if (!q) return { ok: false, msg: 'Unknown outfit bundle.' };
  const { bundle, allOwned, cost } = q;
  if (!allOwned && state.cash < cost) {
    return { ok: false, msg: `You need $${(cost - state.cash).toLocaleString()} more for ${bundle.name}.` };
  }
  if (!allOwned) state.cash -= cost;
  if (!Array.isArray(state.wardrobe)) state.wardrobe = starterWardrobe();
  for (const [slot, id] of bundle.items) {
    const key = wardrobeKey(slot, id);
    if (!state.wardrobe.includes(key)) state.wardrobe.push(key);
    const def = CLOTHING_ITEMS[slot]?.[id];
    if (def) state.appearance[def.field] = id;
  }
  if (bundle.colors) Object.assign(state.appearance, bundle.colors);
  return {
    ok: true,
    bought: !allOwned,
    cost,
    msg: allOwned ? `✨ Put on ${bundle.name}.` : `🛍 Unlocked & wore ${bundle.name} ($${cost.toLocaleString()})!`,
  };
}

// ---------------------------------------------------------------------------
// Vehicle Mod Shop (Paint, Racing Stripes/Carbon, Alloy Rims, Neon Underglow)
// ---------------------------------------------------------------------------
export function modCost(basePrice, hasGarage = false) {
  if (basePrice <= 0) return 0;
  return Math.round(basePrice * (hasGarage ? APEX_MOD_DISCOUNT : 1));
}

export function applyVehicleMod(state, vehId, kind, value) {
  const v = state.vehicles?.find((x) => x.id === vehId);
  if (!v) return { ok: false, msg: 'Vehicle not found.' };
  const model = VEHICLE_MODELS[v.model];
  const hasGarage = !!state.businesses?.garage;

  if (kind === 'paint') {
    if (model?.fixedColor) return { ok: false, msg: `${model.name} uses official livery paint.` };
    if (!CAR_COLORS.includes(value)) return { ok: false, msg: 'Invalid paint colour.' };
    if (v.color === value) return { ok: false, msg: 'Already painted that colour.' };
    const cost = modCost(RESPRAY_COST, hasGarage);
    if (state.cash < cost) return { ok: false, msg: `You need $${(cost - state.cash).toLocaleString()} more.` };
    state.cash -= cost;
    v.color = value;
    return { ok: true, cost, msg: `🎨 Resprayed ${model.name} ($${cost.toLocaleString()})!` };
  }

  if (kind === 'livery') {
    const liv = CAR_LIVERIES[value];
    if (!liv) return { ok: false, msg: 'Unknown livery.' };
    if ((v.livery || 'clean') === value) return { ok: false, msg: `${liv.name} is already installed.` };
    const cost = modCost(liv.price, hasGarage);
    if (state.cash < cost) return { ok: false, msg: `You need $${(cost - state.cash).toLocaleString()} more.` };
    state.cash -= cost;
    v.livery = value;
    return { ok: true, cost, msg: `🏁 Installed ${liv.name} on ${model.name} ($${cost.toLocaleString()})!` };
  }

  if (kind === 'rims') {
    const rim = RIM_FINISHES[value];
    if (!rim) return { ok: false, msg: 'Unknown rim finish.' };
    if ((v.rims || 'silver') === value) return { ok: false, msg: `${rim.name} rims already fitted.` };
    const cost = modCost(rim.price, hasGarage);
    if (state.cash < cost) return { ok: false, msg: `You need $${(cost - state.cash).toLocaleString()} more.` };
    state.cash -= cost;
    v.rims = value;
    return { ok: true, cost, msg: `🛞 Fitted ${rim.name} rims on ${model.name} ($${cost.toLocaleString()})!` };
  }

  if (kind === 'underglow') {
    const glow = UNDERGLOW_OPTIONS[value];
    if (!glow) return { ok: false, msg: 'Unknown underglow kit.' };
    if ((v.underglow || 'none') === value) return { ok: false, msg: `${glow.name} already set.` };
    const cost = modCost(glow.price, hasGarage);
    if (state.cash < cost) return { ok: false, msg: `You need $${(cost - state.cash).toLocaleString()} more.` };
    state.cash -= cost;
    v.underglow = value;
    return {
      ok: true,
      cost,
      msg: value === 'none'
        ? `Removed underglow on ${model.name}.`
        : `💡 Installed ${glow.name} street underglow on ${model.name} ($${cost.toLocaleString()})!`,
    };
  }

  return { ok: false, msg: 'Unknown mod category.' };
}

/** Encode vehicle model + custom appearance into a <=48-char multiplayer wire token. */
export function encodeNetVehicle(vehData) {
  if (!vehData || !vehData.model) return null;
  const color = vehData.color || '';
  const livery = vehData.livery && vehData.livery !== 'clean' ? vehData.livery : '';
  const rims = vehData.rims && vehData.rims !== 'silver' ? vehData.rims : '';
  const glow = vehData.underglow && vehData.underglow !== 'none' ? vehData.underglow : '';
  if (!color && !livery && !rims && !glow) return vehData.model;
  return `${vehData.model}|${color}|${livery}|${rims}|${glow}`;
}

/** Decode a multiplayer vehicle token back into `{ model, color, livery, rims, underglow }`. */
export function decodeNetVehicle(raw, fallbackColor = '#38bdf8') {
  if (!raw || typeof raw !== 'string') return null;
  const [model, color, livery, rims, underglow] = raw.split('|');
  if (!VEHICLE_MODELS[model]) return null;
  return {
    model,
    color: /^#[0-9a-fA-F]{3,8}$/.test(color || '') ? color : (VEHICLE_MODELS[model].fixedColor || fallbackColor),
    livery: CAR_LIVERIES[livery] ? livery : (VEHICLE_MODELS[model].defaultLivery || 'clean'),
    rims: RIM_FINISHES[rims] ? rims : 'silver',
    underglow: UNDERGLOW_OPTIONS[underglow] ? underglow : 'none',
  };
}
