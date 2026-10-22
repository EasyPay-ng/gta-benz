import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/vehicleCond.js';
import { VEHICLE_MODELS, DAMAGE_SPEED_KMH, TIRE_WEAR_PER_KM, ENGINE_WEAR_PER_KM, ENGINE_HIGH_SPEED_EXTRA } from '../src/data.js';

test('fresh condition is all 100', () => {
  assert.deepEqual(V.freshCond(), { hp: 100, fuel: 100, tires: 100, engine: 100 });
});

test('drive wear: fuel, tyres and engine drop with distance (no high-speed extra)', () => {
  const c = V.freshCond();
  V.applyDrive(c, 'sedan', 10, 10, 1);
  assert.equal(c.fuel, 100 - VEHICLE_MODELS.sedan.fuelPerKm * 10);
  assert.equal(c.tires, 100 - TIRE_WEAR_PER_KM * 10);
  assert.equal(c.engine, 100 - ENGINE_WEAR_PER_KM * 10);
});

test('high speed adds engine wear; partial load sips less fuel', () => {
  const full = V.freshCond();
  V.applyDrive(full, 'sports', 10, 40, 1);
  const half = V.freshCond();
  V.applyDrive(half, 'sports', 10, 40, 0.4);
  const m = VEHICLE_MODELS.sports;
  assert.equal(full.fuel, 100 - m.fuelPerKm * 10);
  assert.equal(half.fuel, 100 - m.fuelPerKm * 10 * (0.35 + 0.65 * 0.4));
  assert.ok(half.fuel > full.fuel);
  // both above the 25 m/s threshold, so both get the extra engine wear
  const exp = 100 - (ENGINE_WEAR_PER_KM + ENGINE_HIGH_SPEED_EXTRA) * 10;
  assert.equal(full.engine, exp);
  assert.equal(half.engine, exp);
});

test('fuel and wear clamp at 0', () => {
  const c = V.freshCond();
  V.applyDrive(c, 'hatch', 500, 20, 1);
  assert.ok(c.fuel >= 0 && c.tires >= 0 && c.engine >= 0);
});

test('impact: no damage under scrape speed, scrape band, formula above 30 km/h, 40 cap', () => {
  const thr = DAMAGE_SPEED_KMH / 3.6; // 8.333 m/s
  let c = V.freshCond();
  assert.equal(V.applyImpact(c, 4), 0);
  assert.equal(c.hp, 100);

  c = V.freshCond();
  assert.equal(V.applyImpact(c, 7), 1, 'scrape band 5..8.33 m/s does 1 hp');
  assert.equal(c.hp, 99);

  c = V.freshCond();
  const lost = V.applyImpact(c, 11.111, ); // 40 km/h
  assert.ok(Math.abs(lost - (11.111 - thr) * 4) < 0.01);

  c = V.freshCond();
  assert.equal(V.applyImpact(c, 50), 40, 'damage is capped at 40 per impact');
  assert.ok(c.hp >= 0);
});

test('wreck: hp floors at 0 and isWrecked agrees', () => {
  const c = V.freshCond();
  c.hp = 10;
  V.applyImpact(c, 50);
  assert.equal(c.hp, 0);
  assert.ok(V.isWrecked(c));
  assert.ok(!V.isStalled(c), 'a wreck is not a stall');
});

test('stall: empty tank with a living engine', () => {
  assert.ok(V.isStalled({ hp: 50, fuel: 0, tires: 100, engine: 100 }));
  assert.ok(!V.isStalled(V.freshCond()));
});

test('refuel cost scales with missing fuel', () => {
  const c = { ...V.freshCond(), fuel: 50 };
  assert.equal(V.refuelCost(c, 'sedan'), 60); // 120 × 0.5
  assert.equal(V.refuelCost(V.freshCond(), 'sedan'), 0);
  assert.equal(V.refuelCost({ ...V.freshCond(), fuel: 0 }, 'hatch'), 60);
});

test('repair options: itemised, hp per point, tyres/engine in 25-step bundles', () => {
  const c = { ...V.freshCond(), hp: 80, tires: 50, engine: 100 };
  const o = V.repairOptions(c, 1);
  assert.equal(o.items.length, 2);
  assert.equal(o.total, 60 + 300); // hp: 20 × $3, tyres: 2 bundles × $150
  const cost = V.applyRepairs(c, 1);
  assert.equal(cost, 360);
  assert.deepEqual({ hp: c.hp, tires: c.tires, engine: c.engine }, { hp: 100, tires: 100, engine: 100 });
});

test('repair quote for a full vehicle is zero', () => {
  const o = V.repairOptions(V.freshCond(), 1);
  assert.equal(o.items.length, 0);
  assert.equal(o.total, 0);
});

test('markup applies (Metro Motors city rates)', () => {
  const c = { ...V.freshCond(), hp: 90, tires: 100, engine: 100 };
  assert.equal(V.repairOptions(c, 1.2).total, Math.ceil(10 * 3 * 1.2)); // 36
  const c2 = { ...V.freshCond(), hp: 100, tires: 100, engine: 99 };
  assert.equal(V.repairOptions(c2, 1.2).total, Math.round(1 * 200 * 1.2)); // 240
});

test('wear factors: limp-home top speed and slidey tyres', () => {
  assert.equal(V.speedFactor(100), 1);
  assert.equal(V.speedFactor(0), 0.5);
  assert.equal(V.gripFactor(100), 1);
  assert.equal(V.gripFactor(0), 0.55);
});
