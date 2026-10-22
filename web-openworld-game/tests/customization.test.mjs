import test from 'node:test';
import assert from 'node:assert/strict';
import * as Eco from '../src/economy.js';
import * as Cust from '../src/customization.js';
import { CLOTHING_ITEMS, RESPRAY_COST, APEX_MOD_DISCOUNT } from '../src/data.js';

test('Boutique wardrobe: starter items are free, paid items unlock once and re-equip for $0', () => {
  const s = Eco.createInitialState();
  assert.equal(Cust.ownsClothing(s, 'top', 'tee'), true);
  assert.equal(Cust.ownsClothing(s, 'top', 'senator'), false);

  // Insufficient cash blocked cleanly
  const fail = Cust.buyOrEquipClothing(s, 'top', 'senator');
  assert.equal(fail.ok, false);
  assert.equal(s.appearance.topStyle, 'tee');

  // Purchase unlocks & equips
  s.cash = 2000;
  const buy = Cust.buyOrEquipClothing(s, 'top', 'senator');
  assert.equal(buy.ok, true);
  assert.equal(buy.bought, true);
  assert.equal(buy.cost, CLOTHING_ITEMS.top.senator.price);
  assert.equal(s.appearance.topStyle, 'senator');
  assert.equal(Cust.ownsClothing(s, 'top', 'senator'), true);

  // Switch back to tee and re-equip senator at $0
  Cust.equipClothing(s, 'top', 'tee');
  assert.equal(s.appearance.topStyle, 'tee');
  const cashAfter = s.cash;
  const reEquip = Cust.buyOrEquipClothing(s, 'top', 'senator');
  assert.equal(reEquip.ok, true);
  assert.equal(reEquip.bought, false);
  assert.equal(s.cash, cashAfter);
});

test('Outfit bundles discount remaining unowned pieces and apply signature colours', () => {
  const s = Eco.createInitialState();
  s.cash = 5000;
  const q1 = Cust.bundleQuote(s, 'lagos_royalty');
  assert.ok(q1.cost > 0 && q1.savings > 0);

  // Buying one piece first lowers remaining bundle quote
  Cust.buyOrEquipClothing(s, 'top', 'senator');
  const q2 = Cust.bundleQuote(s, 'lagos_royalty');
  assert.ok(q2.cost < q1.cost);

  const res = Cust.buyOrEquipBundle(s, 'lagos_royalty');
  assert.equal(res.ok, true);
  assert.equal(s.appearance.topStyle, 'senator');
  assert.equal(s.appearance.hatStyle, 'fila');
  assert.equal(s.appearance.chain, 'gold');

  // Re-wearing fully owned bundle costs $0
  const q3 = Cust.bundleQuote(s, 'lagos_royalty');
  assert.equal(q3.allOwned, true);
  assert.equal(q3.cost, 0);
});

test('Vehicle Mod Shop: paint, racing stripes, gold rims, neon underglow & Apex Garage 25% discount', () => {
  const s = Eco.createInitialState();
  s.cash = 30000;
  const buyHyper = Eco.buyVehicle(s, 'hyper', '#dc2626', { x: 0, z: 0, yaw: 0 });
  assert.equal(buyHyper.ok, true);
  assert.equal(buyHyper.vehicle.livery, 'carbon_hood', 'hypercar ships with carbon_hood default');

  // Full-price respray before owning Apex Auto Garage
  const cashBefore = s.cash;
  const paintRes = Cust.applyVehicleMod(s, buyHyper.vehicle.id, 'paint', '#111827');
  assert.equal(paintRes.ok, true);
  assert.equal(paintRes.cost, RESPRAY_COST);
  assert.equal(s.cash, cashBefore - RESPRAY_COST);

  // Build Apex Auto Garage -> 25% discount on mods
  Eco.buyLot(s, 'garage');
  const rimRes = Cust.applyVehicleMod(s, buyHyper.vehicle.id, 'rims', 'gold');
  assert.equal(rimRes.ok, true);
  assert.equal(rimRes.cost, Math.round(520 * APEX_MOD_DISCOUNT));
  assert.equal(buyHyper.vehicle.rims, 'gold');

  const glowRes = Cust.applyVehicleMod(s, buyHyper.vehicle.id, 'underglow', 'cyan');
  assert.equal(glowRes.ok, true);
  assert.equal(buyHyper.vehicle.underglow, 'cyan');

  // Official taxi blocks custom respray but permits rims & underglow
  const buyTaxi = Eco.buyVehicle(s, 'taxi', '#facc15', { x: 5, z: 0, yaw: 0 });
  assert.equal(Cust.applyVehicleMod(s, buyTaxi.vehicle.id, 'paint', '#2563eb').ok, false);
  assert.equal(Cust.applyVehicleMod(s, buyTaxi.vehicle.id, 'underglow', 'gold').ok, true);
});

test('Multiplayer vehicle wire token encodes & decodes custom mods within 48 chars', () => {
  const token = Cust.encodeNetVehicle({
    model: 'gwagen',
    color: '#111827',
    livery: 'gold_trim',
    rims: 'gold',
    underglow: 'cyan',
  });
  assert.ok(token.length <= 48, `token length ${token.length} <= 48`);
  const decoded = Cust.decodeNetVehicle(token);
  assert.deepEqual(decoded, {
    model: 'gwagen',
    color: '#111827',
    livery: 'gold_trim',
    rims: 'gold',
    underglow: 'cyan',
  });
  // Legacy plain model string still decodes cleanly
  assert.equal(Cust.decodeNetVehicle('sedan').model, 'sedan');
});
