import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return nextResolve(new URL('../vendor/three.module.min.js', '${import.meta.url}').href, context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`);

function makeCanvas(w = 64, h = 64) {
  const data = new Uint8ClampedArray(w * h * 4);
  const noop = () => {};
  const grad = () => ({ addColorStop: noop });
  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '16px sans-serif',
    textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: noop, clearRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, rect: noop, roundRect: noop,
    clip: noop, arc: noop, ellipse: noop, fill: noop, stroke: noop, fillText: noop,
    save: noop, restore: noop, translate: noop, rotate: noop,
    createLinearGradient: grad, createRadialGradient: grad,
    createImageData: (iw, ih) => ({ data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih }),
    getImageData: (_x, _y, iw, ih) => ({ data: data.subarray(0, iw * ih * 4), width: iw, height: ih }),
    putImageData: noop,
  };
  return { width: w, height: h, getContext: () => ctx };
}
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {}) };

const Grocery = await import('../src/groceries.js');
const Eco = await import('../src/economy.js');
const Places = await import('../src/publicPlaces.js');
const Phone = await import('../src/phone.js');
const THREE = await import('three');
const { City } = await import('../src/world.js');

const freshState = (cash = 200) => {
  const s = Eco.createInitialState(1700000000000);
  s.cash = cash;
  return s;
};

// ---------------------------------------------------------------------------
// 1. The catalogue
// ---------------------------------------------------------------------------
test('Groceries: every product is priced, named and shelved in a real category', () => {
  const ids = Object.keys(Grocery.GOODS);
  assert.ok(ids.length >= 28, `a full shop, not a kiosk (${ids.length} products)`);
  for (const id of ids) {
    const g = Grocery.GOODS[id];
    assert.ok(g.name && g.icon, `${id} has a name and an icon`);
    assert.ok(Grocery.CATEGORIES[g.cat], `${id} sits in a known category`);
    assert.ok(g.price > 0 && g.price < 40, `${id} is priced sensibly`);
    assert.ok(g.unit, `${id} has a unit`);
    if (Grocery.isEdible(id)) assert.ok(g.energy > 0, `${id} that feeds you gives energy`);
  }
  // household goods are not food
  assert.equal(Grocery.isEdible('detergent'), false);
  assert.equal(Grocery.isEdible('milk'), true);
});

test('Groceries: every aisle on the shop floor sells something', () => {
  assert.ok(Grocery.AISLES.length >= 5);
  const shelved = new Set(Grocery.AISLES.flatMap((a) => a.categories));
  for (const aisle of Grocery.AISLES) {
    assert.ok(Grocery.goodsInAisle(aisle.id).length > 0, `${aisle.id} is stocked`);
    for (const cat of aisle.categories) assert.ok(Grocery.CATEGORIES[cat]);
  }
  // the fresh counters cover what the dry aisles do not
  assert.ok(Grocery.goodsIn('produce').length >= 5, 'produce island is stocked');
  assert.ok(Grocery.goodsIn('bakery').length >= 4, 'bakery counter is stocked');
  assert.equal(shelved.has('produce'), false);
  assert.equal(shelved.has('bakery'), false);
});

// ---------------------------------------------------------------------------
// 2. Trolley
// ---------------------------------------------------------------------------
test('Groceries: adding, removing and clearing a trolley keeps the maths honest', () => {
  const s = freshState();
  assert.equal(Grocery.basketCount(s), 0);
  assert.equal(Grocery.basketTotal(s), 0);

  Grocery.basketAdd(s, 'milk');
  Grocery.basketAdd(s, 'milk');
  Grocery.basketAdd(s, 'bread');
  assert.equal(Grocery.basketCount(s), 3);
  assert.equal(Grocery.basketTotal(s), 11); // 2 × $4 milk + $3 bread

  const lines = Grocery.basketLines(s);
  assert.equal(lines.length, 2);
  assert.equal(lines.find((l) => l.id === 'milk').qty, 2);

  Grocery.basketRemove(s, 'milk');
  assert.equal(Grocery.basketCount(s), 2);
  Grocery.basketRemove(s, 'milk');
  assert.equal(Grocery.basketCount(s), 1);

  Grocery.basketClear(s);
  assert.equal(Grocery.basketCount(s), 0);
  assert.deepEqual(Grocery.basketLines(s), []);
  assert.equal(Grocery.basketRemove(s, 'milk').ok, false);
  assert.equal(Grocery.basketAdd(s, 'unicorn').ok, false);
});

// ---------------------------------------------------------------------------
// 3. Checkout
// ---------------------------------------------------------------------------
test('Groceries: you cannot check out an empty trolley or one you cannot afford', () => {
  const s = freshState(10);
  assert.equal(Grocery.checkout(s).ok, false);
  Grocery.basketAdd(s, 'beef'); // $12
  const poor = Grocery.checkout(s);
  assert.equal(poor.ok, false);
  assert.match(poor.msg, /only have/);
  assert.equal(s.cash, 10, 'no money moved');
  assert.equal(Grocery.basketCount(s), 1, 'trolley untouched');
});

test('Groceries: paying stocks the pantry, empties the trolley and records the trip', () => {
  const s = freshState(100);
  Grocery.basketAdd(s, 'milk', 2);
  Grocery.basketAdd(s, 'bread');
  Grocery.basketAdd(s, 'detergent');
  const total = Grocery.basketTotal(s);
  const res = Grocery.checkout(s);
  assert.equal(res.ok, true);
  assert.equal(res.total, total);
  assert.equal(res.count, 4);
  assert.equal(s.cash, 100 - total);
  assert.equal(Grocery.basketCount(s), 0);
  assert.equal(s.groceries.pantry.milk, 2);
  assert.equal(s.groceries.pantry.bread, 1);
  assert.equal(s.groceries.pantry.detergent, 1);
  assert.equal(s.groceries.stats.shops, 1);
  assert.equal(s.groceries.stats.itemsBought, 4);
  assert.equal(s.groceries.stats.spent, total);
});

test('Groceries: finishing the shopping list rolls a new list for next week', () => {
  const s = freshState(200);
  const list = s.groceries.list;
  for (const id of list) Grocery.basketAdd(s, id);
  const before = Grocery.listProgress(s);
  assert.equal(before.complete, false);
  const res = Grocery.checkout(s);
  assert.equal(res.ok, true);
  assert.equal(res.listDone, true);
  assert.equal(s.groceries.stats.listsDone, 1);
  assert.notDeepEqual(s.groceries.list, list, 'a fresh list is waiting');
  assert.equal(s.groceries.list.length, 5);
  // the new list avoids what is already in the pantry
  for (const id of s.groceries.list) assert.equal(s.groceries.pantry[id] || 0, 0);
});

// ---------------------------------------------------------------------------
// 4. Shopping list
// ---------------------------------------------------------------------------
test('Groceries: the shopping list is deterministic, editable and always edible', () => {
  const a = Grocery.makeList(7, 5);
  const b = Grocery.makeList(7, 5);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, Grocery.makeList(8, 5));
  assert.equal(a.length, 5);
  for (const id of a) assert.ok(Grocery.isEdible(id), `${id} is food`);

  const s = freshState();
  s.groceries.list = ['milk', 'bread'];
  Grocery.basketAdd(s, 'milk');
  Grocery.checkout(s);
  const progress = Grocery.listProgress(s);
  assert.equal(progress.total, 2);
  assert.equal(progress.done, 1);
  assert.equal(progress.complete, false);
  assert.equal(progress.items.find((i) => i.id === 'milk').got, true);
});

// ---------------------------------------------------------------------------
// 5. Pantry
// ---------------------------------------------------------------------------
test('Groceries: eating what you bought restores energy and uses the item up', () => {
  const s = freshState();
  s.groceries.pantry = { beef: 1, detergent: 1 };
  s.leisure.energy = 40;
  const res = Grocery.eatFromPantry(s, 'beef');
  assert.equal(res.ok, true);
  assert.equal(s.leisure.energy, 66, '+26 energy from the steak');
  assert.equal(s.groceries.pantry.beef, undefined, 'eaten');
  assert.equal(s.groceries.stats.eaten, 1);

  assert.equal(Grocery.eatFromPantry(s, 'beef').ok, false, 'nothing left');
  assert.equal(Grocery.eatFromPantry(s, 'detergent').ok, false, 'not food');
  assert.equal(Grocery.eatFromPantry(s, 'nope').ok, false);
});

test('Groceries: energy never overflows when you eat a big meal on a full stomach', () => {
  const s = freshState();
  s.groceries.pantry = { cake: 3 };
  s.leisure.energy = 95;
  Grocery.eatFromPantry(s, 'cake');
  assert.ok(s.leisure.energy <= 100);
});

// ---------------------------------------------------------------------------
// 6. Saves
// ---------------------------------------------------------------------------
test('Groceries: saves migrate, unknown items are dropped and counts are capped', () => {
  const raw = {
    pantry: { milk: 3, ghost: 5, bread: -2, eggs: 400 },
    basket: { rice: 2, nonsense: 1 },
    list: ['milk', 'ghost', 'rice', 'milk'],
    listSeed: 12,
    stats: { shops: 4, itemsBought: 9, spent: 33.5, eaten: 2, listsDone: 1 },
  };
  const g = Grocery.normalizeGroceryState(raw, 3);
  assert.equal(g.pantry.milk, 3);
  assert.equal(g.pantry.ghost, undefined);
  assert.equal(g.pantry.bread, undefined);
  assert.equal(g.pantry.eggs, 99);
  assert.equal(g.basket.rice, 2);
  assert.equal(g.basket.nonsense, undefined);
  assert.deepEqual(g.list, ['milk', 'rice']);
  assert.equal(g.stats.shops, 4);

  const s = Eco.migrateState({ version: 9, cash: 500, groceries: raw });
  assert.equal(s.groceries.pantry.milk, 3);
  assert.equal(s.version, 10);
  // a save from before the supermarket opens with an empty pantry and a list
  const old = Eco.migrateState({ version: 9, cash: 500 });
  assert.equal(Grocery.pantryCount(old), 0);
  assert.equal(old.groceries.list.length, 5);
});

// ---------------------------------------------------------------------------
// 7. The shop on the street
// ---------------------------------------------------------------------------
test('FreshMart: the store exists, matches its data and is walk-in', () => {
  const place = Places.placeById('freshmart');
  assert.ok(place, 'the place is on the map');
  assert.equal(place.type, 'supermarket');
  assert.equal(place.x, Grocery.STORE.x);
  assert.equal(place.z, Grocery.STORE.z);
  assert.equal(place.width, Grocery.STORE.width);
  assert.equal(place.depth, Grocery.STORE.depth);

  const city = new City(new THREE.Scene());
  const store = city.enterables.find((b) => b.id === 'freshmart');
  assert.ok(store, 'the building was built');
  assert.equal(store.width, Grocery.STORE.width);
  assert.equal(city.buildingAt(store.x, store.z)?.building?.id, 'freshmart', 'you can stand inside');
  assert.equal(city.doors.filter((d) => d.buildingId === 'freshmart').length, 1, 'it has a front door');
  assert.ok(city.groundY(store.x, store.z + 15) >= 0, 'there is pavement outside');
});

test('FreshMart: every aisle, counter and till is a real interactive spot', () => {
  const city = new City(new THREE.Scene());
  const spots = city.propSpots.filter((s) => s.buildingId === 'freshmart');
  const byType = (t) => spots.filter((s) => s.type === t);
  assert.equal(byType('shelf').length, Grocery.AISLES.length, 'one shelf run per aisle');
  assert.equal(byType('till').length, 4, 'four self-checkout tills');
  assert.equal(byType('fridge').length, 1);
  assert.equal(byType('produce').length, 1);
  assert.equal(byType('bakery').length, 1);
  assert.equal(byType('trolley').length, 1);

  for (const shelf of byType('shelf')) {
    assert.ok(shelf.name.startsWith('A'), 'aisle sign name');
    assert.ok(Array.isArray(shelf.goods) && shelf.goods.length > 0, `${shelf.name} is stocked`);
    for (const id of shelf.goods) assert.ok(Grocery.GOODS[id], `${id} is a real product`);
    assert.ok(shelf.x > -60 && shelf.x < -15, 'inside the shop, not on the street');
    // the spot is reachable: nothing solid sits on top of it
    const reachable = city.propSpotsNear(shelf.x, shelf.z, shelf.y, 2.2);
    assert.ok(reachable.some((s) => s.type === 'shelf'));
  }
  for (const till of byType('till')) {
    assert.ok(till.till >= 1 && till.till <= 4);
    assert.ok(till.z > 170, 'tills face the front doors');
  }
  const fridge = byType('fridge')[0];
  assert.ok(fridge.goods.some((id) => Grocery.GOODS[id].cat === 'chilled'));
  assert.ok(fridge.goods.some((id) => Grocery.GOODS[id].cat === 'frozen'));
});

test('FreshMart: a full shop trip — shelf to trolley to till to pantry', () => {
  const city = new City(new THREE.Scene());
  const s = freshState(80);
  const shelf = city.propSpots.find((p) => p.buildingId === 'freshmart' && p.type === 'shelf');
  const till = city.propSpots.find((p) => p.buildingId === 'freshmart' && p.type === 'till');
  assert.ok(shelf && till);

  // pick up what the aisle offers
  for (const id of shelf.goods.slice(0, 2)) {
    const res = Grocery.basketAdd(s, id);
    assert.equal(res.ok, true);
    assert.ok(res.msg.includes(Grocery.GOODS[id].icon));
  }
  assert.ok(Grocery.basketTotal(s) > 0);
  const res = Grocery.checkout(s);
  assert.equal(res.ok, true);
  for (const id of shelf.goods.slice(0, 2)) assert.ok(s.groceries.pantry[id] > 0);
  assert.equal(s.cash, 80 - res.total);

  // the phone knows about it
  const card = Phone.groceryCard(s);
  assert.equal(card.pantryCount, res.count);
  assert.ok(card.pantry.length >= 1);
  assert.equal(card.basketCount, 0);
  assert.ok(card.listLabel.includes('/'));
});
