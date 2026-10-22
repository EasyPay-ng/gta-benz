import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Eco from '../src/economy.js';
import { BUSINESSES, OCCUPATIONS, STARTING_CASH, PAYROLL_INTERVAL, VEHICLE_MODELS } from '../src/data.js';

test('new game starts with cash, a free car and 12 unemployed citizens', () => {
  const s = Eco.createInitialState();
  assert.equal(s.cash, STARTING_CASH);
  assert.equal(s.vehicles.length, 1);
  assert.equal(s.vehicles[0].model, 'hatch');
  assert.equal(s.citizens.length, 12);
  assert.equal(Eco.employedCount(s), 0);
  assert.equal(Eco.builtCount(s), 0);
});

test('citizens are deterministic for a given seed', () => {
  assert.deepEqual(Eco.createCitizens(7), Eco.createCitizens(7));
});

test('starter jobs unlocked, business jobs locked until built', () => {
  const s = Eco.createInitialState();
  assert.ok(Eco.isOccupationUnlocked(s, 'courier'));
  assert.ok(Eco.isOccupationUnlocked(s, 'cabbie'));
  assert.ok(!Eco.isOccupationUnlocked(s, 'chef'));
  assert.equal(Eco.clockIn(s, 'chef').ok, false);
  s.cash = 99999;
  Eco.buyLot(s, 'diner');
  assert.ok(Eco.clockIn(s, 'chef').ok);
  assert.equal(s.activeJob, 'chef');
});

test('task completion pays with rank bonus and ranks up', () => {
  const s = Eco.createInitialState();
  let r;
  for (let i = 0; i < 3; i++) r = Eco.completeTask(s, 'courier', 200);
  assert.equal(r.rankUp, true);
  assert.equal(r.rank, 'Junior');
  const r2 = Eco.completeTask(s, 'courier', 200);
  assert.equal(r2.pay, Math.round(200 * 1.15));
  assert.equal(s.stats.tasksCompleted, 4);
});

test('buying a lot, hiring, payroll and collecting profit', () => {
  const s = Eco.createInitialState();
  assert.equal(Eco.buyLot(s, 'garage').ok, false, 'cannot afford at start');
  s.cash = 5000;
  assert.ok(Eco.buyLot(s, 'garage').ok);
  assert.equal(s.cash, 5000 - BUSINESSES.garage.cost);
  assert.equal(Eco.buyLot(s, 'garage').ok, false, 'cannot build twice');
  for (let i = 0; i < 3; i++) assert.ok(Eco.hireCitizen(s, 'garage', `c${i}`).ok);
  assert.equal(Eco.hireCitizen(s, 'garage', 'c3').ok, false, 'slots full at level 1');
  assert.equal(Eco.hireCitizen(s, 'garage', 'c0').ok, false);
  assert.equal(Eco.employedCount(s), 3);
  const cashBefore = s.cash;
  const res = Eco.tickPayroll(s, PAYROLL_INTERVAL + 0.01);
  const def = BUSINESSES.garage;
  assert.equal(res.total, 3 * (def.revenuePerWorker - def.wagePerWorker));
  assert.equal(s.stats.day, 2);
  const c = Eco.collectProfit(s, 'garage');
  assert.ok(c.ok);
  assert.equal(s.cash, cashBefore + res.total);
  assert.equal(Eco.collectProfit(s, 'garage').ok, false);
});

test('upgrades add +2 slots and cost more each level', () => {
  const s = Eco.createInitialState();
  s.cash = 100000;
  Eco.buyLot(s, 'tech');
  assert.equal(Eco.jobSlots(1), 3);
  assert.ok(Eco.upgradeBusiness(s, 'tech').ok);
  assert.equal(s.businesses.tech.level, 2);
  assert.equal(Eco.jobSlots(2), 5);
  assert.ok(Eco.upgradeCost('tech', 2) > Eco.upgradeCost('tech', 1));
  for (let i = 0; i < 10; i++) Eco.upgradeBusiness(s, 'tech');
  assert.equal(s.businesses.tech.level, 5);
});

test('buying vehicles', () => {
  const s = Eco.createInitialState();
  assert.equal(Eco.buyVehicle(s, 'sports', '#fff').ok, false);
  assert.equal(Eco.buyVehicle(s, 'hatch', '#fff').ok, false, 'starter hatch is not for sale');
  s.cash = 10000;
  const r = Eco.buyVehicle(s, 'taxi', '#ff0000', { x: 1, z: 2, yaw: 0 });
  assert.ok(r.ok);
  assert.equal(r.vehicle.color, VEHICLE_MODELS.taxi.fixedColor);
  assert.equal(s.vehicles.length, 2);
  assert.equal(s.lastVehicleId, r.vehicle.id);
  assert.equal(s.cash, 10000 - VEHICLE_MODELS.taxi.price);
});

test('migrateState fills defaults and repairs employee lists', () => {
  const s = Eco.createInitialState();
  s.cash = 5000;
  Eco.buyLot(s, 'diner');
  Eco.hireCitizen(s, 'diner', 'c4');
  const raw = JSON.parse(JSON.stringify(s));
  delete raw.vehicles; delete raw.stats; raw.businesses.diner.employees = [];
  raw.activeJob = 'astronaut';
  const m = Eco.migrateState(raw);
  assert.deepEqual(m.businesses.diner.employees, ['c4']);
  assert.equal(m.vehicles.length, 1);
  assert.equal(m.activeJob, null);
  assert.ok(m.stats.payrollTimer > 0);
  assert.deepEqual(Eco.migrateState(null).cash, STARTING_CASH);
});

test('every business unlocks an occupation that points back to it', () => {
  for (const b of Object.values(BUSINESSES)) {
    assert.equal(OCCUPATIONS[b.occupation].business, b.id);
  }
});
test('v2 saves migrate with a fresh vehicle condition and anchored clock (save v4)', () => {
  const now = 1_700_000_000_000;
  const s = Eco.migrateState({
    version: 2,
    stats: { day: 3, tasksCompleted: 2, totalEarned: 440, payrollTimer: 12 },
    vehicles: [{ id: 'v1', model: 'hatch', color: '#b45309', x: 0, z: 0, yaw: 0 }],
  }, now);
  assert.equal(s.version, 4);
  assert.deepEqual(s.vehicles[0].cond, { hp: 100, fuel: 100, tires: 100, engine: 100 });
  assert.equal(s.vehicles[0].wrecked, false);
  assert.equal(s.vehicles[0].lastServicedInGameMs, 0);
  // Resumes at Day 3 · 08:00 without a surprise jump
  assert.equal(s.stats.day, 3);
  assert.equal(s.clock.realBase, now);
});

test('v4 saves fast-forward the clock by elapsed offline time on reload', () => {
  const t0 = 1_700_000_000_000;
  const s0 = Eco.createInitialState(t0);
  assert.equal(s0.stats.day, 1);
  // Reload 2 real hours later -> +2 in-game days (Day 3)
  const reloaded = Eco.migrateState(JSON.parse(JSON.stringify(s0)), t0 + 2 * 3_600_000);
  assert.equal(reloaded.stats.day, 3);
});

test('partially damaged v3 saves keep their condition through migration', () => {
  const s = Eco.migrateState({
    version: 3,
    vehicles: [{ id: 'v1', model: 'sedan', color: '#dc2626', x: 0, z: 0, yaw: 0, cond: { hp: 42, fuel: 7, tires: 61, engine: 88 }, wrecked: false }],
  });
  assert.deepEqual(s.vehicles[0].cond, { hp: 42, fuel: 7, tires: 61, engine: 88 });
});

test('new cars start healthy', () => {
  const s = Eco.createInitialState();
  s.cash = 100000;
  const r = Eco.buyVehicle(s, 'sedan', '#dc2626', { x: 0, z: 0, yaw: 0 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.vehicle.cond, { hp: 100, fuel: 100, tires: 100, engine: 100 });
  assert.equal(r.vehicle.wrecked, false);
});
