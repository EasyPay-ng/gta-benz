import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as VC from '../src/vehCard.js';
import { freshCond } from '../src/vehicleCond.js';
import { INGAME_DAY_MS, INGAME_HOUR_MS } from '../src/data.js';

test('barTier switches colour and pulse at exact 50 and 25 thresholds', () => {
  assert.equal(VC.barTier(100).tier, 'ok');
  assert.equal(VC.barTier(50).tier, 'ok');
  assert.equal(VC.barTier(49.9).tier, 'warn');
  assert.equal(VC.barTier(49.9).pulse, false);
  assert.equal(VC.barTier(25).tier, 'warn');
  assert.equal(VC.barTier(24.9).tier, 'bad');
  assert.equal(VC.barTier(24.9).pulse, true);
  assert.ok(VC.barTier(10).cls.includes('c-pulse'));
});

test('warning ladder fires once per crossing and re-arms after repair/refuel', () => {
  const cond = freshCond();
  const tracker = VC.createWarningState(cond);

  assert.equal(VC.stepWarnings(tracker, cond).alerts.length, 0);

  // Fuel drops below 50 -> one warn toast
  cond.fuel = 48;
  let step = VC.stepWarnings(tracker, cond);
  assert.equal(step.alerts.length, 1);
  assert.equal(step.alerts[0].bar, 'fuel');
  assert.equal(step.alerts[0].level, 50);
  assert.equal(step.alerts[0].kind, 'warn');

  // Staying below 50 does NOT re-toast
  cond.fuel = 40;
  assert.equal(VC.stepWarnings(tracker, cond).alerts.length, 0);

  // Dropping below 25 -> one danger toast
  cond.fuel = 22;
  step = VC.stepWarnings(tracker, cond);
  assert.equal(step.alerts.length, 1);
  assert.equal(step.alerts[0].level, 25);
  assert.equal(step.alerts[0].kind, 'danger');

  // Refuelling back to 100 re-arms both 50 and 25
  cond.fuel = 100;
  assert.equal(VC.stepWarnings(tracker, cond).alerts.length, 0);
  cond.fuel = 45;
  assert.equal(VC.stepWarnings(tracker, cond).alerts.length, 1);
});

test('sudden drop from >50 straight to <25 emits only the critical 25 alert', () => {
  const cond = freshCond();
  const tracker = VC.createWarningState(cond);
  cond.hp = 18;
  const step = VC.stepWarnings(tracker, cond);
  assert.equal(step.alerts.length, 1);
  assert.equal(step.alerts[0].bar, 'hp');
  assert.equal(step.alerts[0].level, 25);
});

test('fuelBlink (<10) and engineFault (<20) flags match telemetry rules', () => {
  const cond = { hp: 80, fuel: 9, tires: 70, engine: 19 };
  const tracker = VC.createWarningState(cond);
  const step = VC.stepWarnings(tracker, cond);
  assert.equal(step.fuelBlink, true);
  assert.equal(step.engineFault, true);

  // Dead/wrecked cars do not blink fuel or show running engine fault
  cond.hp = 0;
  const dead = VC.stepWarnings(tracker, cond);
  assert.equal(dead.fuelBlink, false);
  assert.equal(dead.engineFault, false);
});

test('renderVehicleCard shows identical condition numbers in shop, roadside and read-only views', () => {
  const veh = {
    id: 'v1',
    model: 'sedan',
    color: '#2563eb',
    cond: { hp: 64, fuel: 31, tires: 48, engine: 18 },
    wrecked: false,
    lastServicedInGameMs: 2 * INGAME_DAY_MS + 14.5 * INGAME_HOUR_MS,
  };
  const shopHtml = VC.renderVehicleCard(veh, { interactive: true, mode: 'shop', markup: 1.2, cash: 5000 });
  const roadHtml = VC.renderVehicleCard(veh, { interactive: true, mode: 'roadside', hasGarage: false, cash: 5000 });
  const readHtml = VC.renderVehicleCard(veh, { interactive: false });

  for (const html of [shopHtml, roadHtml, readHtml]) {
    assert.ok(html.includes('64%'));
    assert.ok(html.includes('31%'));
    assert.ok(html.includes('48%'));
    assert.ok(html.includes('18%'));
    assert.ok(html.includes('Day 3 · 14:30'));
    assert.ok(html.includes('ENGINE FAULT'));
  }
  assert.ok(shopHtml.includes('data-action="repair"'));
  assert.ok(roadHtml.includes('data-action="roadsideRepair"'));
  assert.ok(roadHtml.includes('data-action="roadsideFuel"'));
  assert.ok(roadHtml.includes('data-action="roadsideTow"'));
  assert.ok(!readHtml.includes('data-action='));
});
