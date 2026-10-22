// MetroVenture 3D — pure vehicle telemetry warning ladder + shared vehicle card renderer.
// No DOM, no Three.js — unit-tested in tests/vehCard.test.mjs (see UPGRADE_PLAN.md §9).

import {
  VEHICLE_MODELS,
  TOW_PRICE,
  ROADSIDE_FUEL_FEE,
  ROADSIDE_FUEL_AMOUNT,
  TELEMETRY_WARN_LEVEL,
  TELEMETRY_CRIT_LEVEL,
  TELEMETRY_FUEL_BLINK,
  TELEMETRY_ENGINE_FAULT,
} from './data.js';
import {
  freshCond,
  repairOptions,
  roadsideRepairQuote,
  canEmergencyRefuel,
} from './vehicleCond.js';
import { clockLabel } from './time.js';

export const TELEMETRY_BARS = [
  { key: 'hp', icon: '🛡', label: 'HP', fullLabel: 'Body' },
  { key: 'fuel', icon: '⛽', label: 'FUEL', fullLabel: 'Fuel' },
  { key: 'tires', icon: '🛞', label: 'TIRES', fullLabel: 'Tyres' },
  { key: 'engine', icon: '⚙', label: 'ENGINE', fullLabel: 'Engine' },
];

const WARN_MESSAGES = {
  hp: {
    50: '🛡 Body below 50% — drive carefully or visit a mechanic',
    25: '🛡 CRITICAL body damage (<25%) — one hard crash will wreck the car!',
  },
  fuel: {
    50: '⛽ Half tank left — fuel stations are marked F on the minimap',
    25: '⛽ Low fuel (<25%) — find Lagoon, Harbor or Metro Fuels soon!',
  },
  tires: {
    50: '🛞 Tyres worn below 50% — grip is dropping on corners',
    25: '🛞 Tyres badly worn (<25%) — heavy slip! Fit new tyres soon',
  },
  engine: {
    50: '⚙ Engine below 50% — top speed is starting to drop',
    25: '⚙ Engine critical (<25%) — service soon before power cuts further!',
  },
};

const fmtMoney = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const clampPct = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/**
 * Colour/pulse tier for a 0..100 condition value.
 * Exact boundaries per §9: >= 50 -> ok (green), 25..<50 -> warn (amber), < 25 -> bad (red + pulse).
 */
export function barTier(value) {
  const v = clampPct(value);
  if (v < TELEMETRY_CRIT_LEVEL) return { tier: 'bad', cls: 'c-bad c-pulse', pulse: true };
  if (v < TELEMETRY_WARN_LEVEL) return { tier: 'warn', cls: 'c-warn', pulse: false };
  return { tier: 'ok', cls: 'c-ok', pulse: false };
}

/** Initialise per-bar threshold latches from a vehicle's starting condition. */
export function createWarningState(cond = freshCond()) {
  const state = {};
  for (const { key } of TELEMETRY_BARS) {
    const v = clampPct(cond?.[key] ?? 100);
    state[key] = {
      warn50: v >= TELEMETRY_WARN_LEVEL,
      crit25: v >= TELEMETRY_CRIT_LEVEL,
    };
  }
  state.fuelTickElapsed = 0; // seconds of <10% fuel tick SFX played this episode (cap 3s)
  return state;
}

/** Re-arm warning thresholds after repair or refuelling. */
export function rearmWarnings(tracker, cond) {
  if (!tracker || !cond) return tracker;
  for (const { key } of TELEMETRY_BARS) {
    const v = clampPct(cond[key]);
    const slot = tracker[key] || (tracker[key] = { warn50: true, crit25: true });
    if (v >= TELEMETRY_WARN_LEVEL) {
      slot.warn50 = true;
      slot.crit25 = true;
    } else if (v >= TELEMETRY_CRIT_LEVEL) {
      slot.crit25 = true;
    }
  }
  if (clampPct(cond.fuel) >= TELEMETRY_FUEL_BLINK) tracker.fuelTickElapsed = 0;
  return tracker;
}

/**
 * Evaluate current `cond` against `tracker` (2 Hz telemetry step).
 * Fires at most one alert per bar per downward threshold crossing and re-arms once
 * repaired/refuelled back above threshold.
 */
export function stepWarnings(tracker, cond) {
  const alerts = [];
  rearmWarnings(tracker, cond);
  for (const { key } of TELEMETRY_BARS) {
    const v = clampPct(cond[key]);
    const slot = tracker[key];
    if (v < TELEMETRY_CRIT_LEVEL && slot.crit25) {
      slot.crit25 = false;
      slot.warn50 = false;
      alerts.push({ bar: key, level: 25, kind: 'danger', msg: WARN_MESSAGES[key][25] });
    } else if (v < TELEMETRY_WARN_LEVEL && slot.warn50) {
      slot.warn50 = false;
      alerts.push({ bar: key, level: 50, kind: 'warn', msg: WARN_MESSAGES[key][50] });
    }
  }
  const fuel = clampPct(cond.fuel);
  const hp = clampPct(cond.hp);
  const engine = clampPct(cond.engine);
  return {
    alerts,
    fuelBlink: hp > 0 && fuel > 0 && fuel < TELEMETRY_FUEL_BLINK,
    engineFault: hp > 0 && engine < TELEMETRY_ENGINE_FAULT,
  };
}

/** Format `lastServicedInGameMs` (0 = never serviced). */
export function formatLastServiced(lastServicedInGameMs) {
  return lastServicedInGameMs && lastServicedInGameMs > 0
    ? clockLabel(lastServicedInGameMs)
    : 'Never';
}

/** Status badge descriptor for a vehicle card. */
export function vehicleStatus(cond, wreckedFlag = false) {
  if (wreckedFlag || cond.hp <= 0) return { code: 'wrecked', label: 'WRECKED', pill: 'bad' };
  if (cond.fuel <= 0) return { code: 'stalled', label: 'Stalled (0% fuel)', pill: 'bad' };
  if (cond.engine < TELEMETRY_ENGINE_FAULT) return { code: 'fault', label: 'ENGINE FAULT', pill: 'bad' };
  if (cond.hp < 100 || cond.tires < 100 || cond.engine < 100) return { code: 'service', label: 'Needs service', pill: 'warn' };
  return { code: 'ok', label: 'Healthy', pill: 'good' };
}

/**
 * Shared HTML renderer for vehicle telemetry cards (Mechanic modal, Garage & Roadside
 * modal, and read-only inspection views). Keeps shop and garage numbers 100% identical.
 *
 * @param {object} vehRecord  `{ id, model, color, cond, wrecked, lastServicedInGameMs }`
 * @param {object} [opts]
 * @param {boolean} [opts.interactive=false]
 * @param {'shop'|'roadside'} [opts.mode='shop']
 * @param {number} [opts.markup=1]
 * @param {number} [opts.cash=Infinity]
 * @param {boolean} [opts.hasGarage=false]
 * @param {string} [opts.shopName='Metro Motors']
 * @param {boolean} [opts.highlight=false]
 */
export function renderVehicleCard(vehRecord, opts = {}) {
  const {
    interactive = false,
    mode = 'shop',
    markup = 1,
    cash = Infinity,
    hasGarage = false,
    shopName = 'Metro Motors',
    highlight = false,
  } = opts;

  const model = VEHICLE_MODELS[vehRecord.model] || { name: vehRecord.model };
  const cond = vehRecord.cond || freshCond();
  const status = vehicleStatus(cond, vehRecord.wrecked);
  const wrecked = status.code === 'wrecked';
  const servicedText = formatLastServiced(vehRecord.lastServicedInGameMs);

  const rowsHtml = TELEMETRY_BARS.map(({ key, icon, fullLabel }) => {
    const raw = clampPct(cond[key]);
    const pct = Math.round(raw);
    const { cls } = barTier(raw);
    return `
      <span class="cond-label">${icon} ${fullLabel}</span>
      <div class="condbar"><i class="${cls}" style="width:${raw.toFixed(1)}%"></i></div>
      <span class="cond-pct ${raw < TELEMETRY_CRIT_LEVEL ? 'bad-text' : raw < TELEMETRY_WARN_LEVEL ? 'warn-text' : ''}">${pct}%</span>`;
  }).join('');

  let quoteHtml = '';
  let actionsHtml = '';

  if (interactive && mode === 'shop') {
    const quote = repairOptions(cond, markup);
    if (quote.items.length) {
      quoteHtml = `<div class="cond-quote">${quote.items.map((i) => `<span>${i.label}: <b>${fmtMoney(i.cost)}</b></span>`).join(' · ')}</div>`;
    }
    const btns = [];
    if (wrecked) {
      btns.push(`<button class="primary" data-action="tow" data-veh="${vehRecord.id}" ${cash < TOW_PRICE ? 'disabled' : ''}>🚛 Tow here · ${fmtMoney(TOW_PRICE)}</button>`);
    }
    if (quote.total > 0) {
      btns.push(`<button class="primary" data-action="repair" data-veh="${vehRecord.id}" ${cash < quote.total ? 'disabled' : ''}>🔧 Repair all · ${fmtMoney(quote.total)}</button>`);
    }
    if (btns.length) actionsHtml = `<div class="actions">${btns.join('')}</div>`;
  } else if (interactive && mode === 'roadside') {
    const rQuote = roadsideRepairQuote(cond, hasGarage);
    const needsTow = wrecked || cond.fuel <= 0 || rQuote.total > 0;
    const lowFuel = canEmergencyRefuel(cond) && cond.fuel < 60;
    if (rQuote.total > 0) {
      quoteHtml = `<div class="cond-quote">Mobile dispatch ${fmtMoney(rQuote.callout)} + parts ${fmtMoney(rQuote.partsTotal)} = <b>${fmtMoney(rQuote.total)}</b></div>`;
    }
    const btns = [];
    if (rQuote.total > 0) {
      btns.push(`<button class="primary" data-action="roadsideRepair" data-veh="${vehRecord.id}" ${cash < rQuote.total ? 'disabled' : ''}>🔧 Fix on the spot · ${fmtMoney(rQuote.total)}</button>`);
    }
    if (lowFuel) {
      btns.push(`<button data-action="roadsideFuel" data-veh="${vehRecord.id}" ${cash < ROADSIDE_FUEL_FEE ? 'disabled' : ''}>⛽ Emergency +${ROADSIDE_FUEL_AMOUNT}% fuel · ${fmtMoney(ROADSIDE_FUEL_FEE)}</button>`);
    }
    if (needsTow) {
      btns.push(`<button data-action="roadsideTow" data-veh="${vehRecord.id}" ${cash < TOW_PRICE ? 'disabled' : ''}>🚛 Tow to ${shopName} · ${fmtMoney(TOW_PRICE)}</button>`);
    }
    if (btns.length) actionsHtml = `<div class="actions">${btns.join('')}</div>`;
  }

  const swatch = vehRecord.color
    ? `<span class="veh-dot" style="background:${vehRecord.color}"></span>`
    : '';

  return `
    <div class="vehcard${highlight ? ' vehcard-focus' : ''}" data-veh-card="${vehRecord.id}">
      <div class="vehcard-head">
        <b>${swatch}🚗 ${model.name}</b>
        <span class="pill ${status.pill}">${status.label}</span>
      </div>
      <div class="condgrid condgrid-pct">
        ${rowsHtml}
      </div>
      <div class="vehcard-meta muted">Last serviced: <b>${servicedText}</b>${cond.engine < TELEMETRY_ENGINE_FAULT && cond.hp > 0 ? ' · <span class="bad-text">⚙ Engine fault</span>' : ''}</div>
      ${quoteHtml}
      ${actionsHtml}
    </div>`;
}

/** Pure snapshot helper exposed on `window.__mv.telemetry()`. */
export function telemetrySnapshot(vehicles) {
  return (vehicles || []).map((v) => {
    const d = v.data || v;
    const cond = v.cond || d.cond || freshCond();
    const status = vehicleStatus(cond, d.wrecked);
    return {
      id: d.id,
      model: d.model,
      name: VEHICLE_MODELS[d.model]?.name || d.model,
      status: status.code,
      wrecked: status.code === 'wrecked',
      stalled: status.code === 'stalled',
      engineFault: cond.hp > 0 && cond.engine < TELEMETRY_ENGINE_FAULT,
      lastServicedInGameMs: d.lastServicedInGameMs || 0,
      lastServiced: formatLastServiced(d.lastServicedInGameMs || 0),
      cond: {
        hp: Math.round(cond.hp * 10) / 10,
        fuel: Math.round(cond.fuel * 10) / 10,
        tires: Math.round(cond.tires * 10) / 10,
        engine: Math.round(cond.engine * 10) / 10,
      },
    };
  });
}
