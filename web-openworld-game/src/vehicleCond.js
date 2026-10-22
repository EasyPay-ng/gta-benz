// MetroVenture 3D — pure vehicle condition logic (HP, fuel, wear, repairs).
// No DOM, no Three.js — unit-tested in tests/vehicleCond.test.mjs.
// See UPGRADE_PLAN.md §4 (feature 4) for the design decisions.
import {
  VEHICLE_MODELS, DAMAGE_SPEED_KMH, IMPACT_DMG_FACTOR, IMPACT_DMG_CAP,
  SCRAPE_SPEED_MPS, SCRAPE_DMG, TIRE_WEAR_PER_KM, ENGINE_WEAR_PER_KM,
  ENGINE_HIGH_SPEED_EXTRA, ENGINE_HIGH_SPEED_THRESHOLD,
  REPAIR_COST_PER_HP, REPAIR_TIRE_BUNDLE, REPAIR_TIRE_BUNDLE_COST,
  REPAIR_ENGINE_BUNDLE, REPAIR_ENGINE_BUNDLE_COST,
} from './data.js';

const clamp100 = (v) => Math.min(100, Math.max(0, v));

/** Fresh condition for a new/undamaged vehicle. */
export function freshCond() {
  return { hp: 100, fuel: 100, tires: 100, engine: 100 };
}

export function isWrecked(cond) { return cond.hp <= 0; }
export function isStalled(cond) { return cond.fuel <= 0 && cond.hp > 0; }

// Wear -> physics modifiers. A 0% engine still gives 50% top speed (limp home);
// a 0% tyre set gives 55% grip (the car slides, it doesn't fly off).
export function speedFactor(engine) { return 0.5 + 0.5 * (engine / 100); }
export function gripFactor(tires) { return 0.55 + 0.45 * (tires / 100); }

/**
 * Distance-based wear. Mutates cond, returns it.
 * @param distKm metres driven this step, in km
 * @param topSpeedMps peak speed reached this step (extra engine wear above threshold)
 * @param load 0..1 — fraction of top speed sustained (weights fuel use: idling sips,
 *             full throttle drinks). Fuel factor = 0.35 + 0.65 × load.
 */
export function applyDrive(cond, modelId, distKm, topSpeedMps, load = 1) {
  const m = VEHICLE_MODELS[modelId];
  if (!m || distKm <= 0) return cond;
  const fuelLoad = 0.35 + 0.65 * Math.min(1, Math.max(0, load));
  cond.fuel = clamp100(cond.fuel - m.fuelPerKm * distKm * fuelLoad);
  cond.tires = clamp100(cond.tires - TIRE_WEAR_PER_KM * distKm);
  const extra = topSpeedMps > ENGINE_HIGH_SPEED_THRESHOLD ? ENGINE_HIGH_SPEED_EXTRA : 0;
  cond.engine = clamp100(cond.engine - (ENGINE_WEAR_PER_KM + extra) * distKm);
  return cond;
}

/**
 * Collision damage. @param impactMps closing speed in m/s (as returned by
 * Vehicle.collide). Returns the HP actually lost (0 when below the scrape band).
 * Rule (decision D1 in UPGRADE_PLAN.md §4): no damage below DAMAGE_SPEED_KMH;
 * above it, (relSpeed − threshold) × IMPACT_DMG_FACTOR, capped at IMPACT_DMG_CAP.
 */
export function applyImpact(cond, impactMps) {
  const threshold = DAMAGE_SPEED_KMH / 3.6;
  let dmg = 0;
  if (impactMps >= threshold) dmg = Math.min(IMPACT_DMG_CAP, (impactMps - threshold) * IMPACT_DMG_FACTOR);
  else if (impactMps >= SCRAPE_SPEED_MPS) dmg = SCRAPE_DMG;
  if (dmg <= 0) return 0;
  const before = cond.hp;
  cond.hp = Math.max(0, cond.hp - dmg);
  return before - cond.hp;
}

/** Cost to fill the tank from its current level. */
export function refuelCost(cond, modelId) {
  const m = VEHICLE_MODELS[modelId];
  return Math.round(m.fillPrice * (1 - cond.fuel / 100));
}

/**
 * Itemised repair quote. `markup` = 1 at the player's own Apex Auto Garage,
 * MOTORS_REPAIR_MARKUP (1.2) at Metro Motors. Fuel is not repaired here —
 * refilling happens at the pumps.
 */
export function repairOptions(cond, markup = 1) {
  const items = [];
  if (cond.hp < 100) {
    items.push({
      part: 'hp',
      label: `Body & structure (+${Math.ceil(100 - cond.hp)} HP)`,
      cost: Math.ceil((100 - cond.hp) * REPAIR_COST_PER_HP * markup),
    });
  }
  if (cond.tires < 100) {
    const bundles = Math.ceil((100 - cond.tires) / REPAIR_TIRE_BUNDLE);
    items.push({
      part: 'tires',
      label: `New tyres (${bundles} set${bundles > 1 ? 's' : ''} of 25)`,
      cost: Math.round(bundles * REPAIR_TIRE_BUNDLE_COST * markup),
    });
  }
  if (cond.engine < 100) {
    const bundles = Math.ceil((100 - cond.engine) / REPAIR_ENGINE_BUNDLE);
    items.push({
      part: 'engine',
      label: `Engine service (${bundles}×)`,
      cost: Math.round(bundles * REPAIR_ENGINE_BUNDLE_COST * markup),
    });
  }
  return { items, total: items.reduce((a, i) => a + i.cost, 0) };
}

/** Repairs everything the quote covers (hp/tires/engine → 100). Returns the cost. */
export function applyRepairs(cond, markup = 1) {
  const { total } = repairOptions(cond, markup);
  cond.hp = 100;
  cond.tires = 100;
  cond.engine = 100;
  return total;
}
