import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHeatState,
  starsForScore,
  desiredCruisers,
  addHeatOffense,
  stepHeat,
  applyBustFine,
  starLabel,
} from '../src/heat.js';

test('peaceful driving under threshold keeps heat at 0 stars', () => {
  const h = createHeatState();
  const res = addHeatOffense(h, 'traffic_ram', 6.5);
  assert.equal(res.added, 0);
  assert.equal(h.stars, 0);
  assert.equal(desiredCruisers(h.stars), 0);
});

test('high-speed crashes and explosions escalate wanted stars up to 3', () => {
  const h = createHeatState();
  const r1 = addHeatOffense(h, 'traffic_ram', 18);
  assert.equal(r1.starsAfter, 1);
  assert.equal(r1.escalated, true);
  assert.equal(desiredCruisers(h.stars), 1);

  const r2 = addHeatOffense(h, 'vehicle_explosion');
  assert.equal(r2.starsAfter, 2);
  assert.equal(desiredCruisers(h.stars), 2);

  const r3 = addHeatOffense(h, 'vehicle_explosion');
  assert.equal(r3.starsAfter, 3);
  assert.equal(starLabel(h.stars), '★★★');
});

test('evading police sight decays heat and clears stars after cooldown', () => {
  const h = createHeatState();
  addHeatOffense(h, 'ped_scare');
  assert.equal(h.stars, 1);

  // While seen by police, heat does not decay
  stepHeat(h, 10, { seenByPolice: true });
  assert.equal(h.stars, 1);

  // Out of sight: wait cooldown + decay time
  let cleared = false;
  for (let i = 0; i < 20; i++) {
    const out = stepHeat(h, 1, { seenByPolice: false });
    if (out.cleared) cleared = true;
  }
  assert.equal(cleared, true);
  assert.equal(h.stars, 0);
  assert.equal(h.score, 0);
});

test('being pinned by police triggers bust fine and resets heat without negative cash', () => {
  const h = createHeatState();
  addHeatOffense(h, 'vehicle_explosion');
  assert.ok(h.stars >= 1);

  let busted = null;
  for (let i = 0; i < 30; i++) {
    const out = stepHeat(h, 0.2, { seenByPolice: true, pinnedByPolice: true });
    if (out.busted) { busted = out; break; }
  }
  assert.ok(busted?.busted);
  assert.equal(h.stars, 0);

  const rich = applyBustFine(1000, 2);
  assert.equal(rich.fine, 280);
  assert.equal(rich.cashAfter, 720);

  const broke = applyBustFine(50, 3);
  assert.equal(broke.fine, 50);
  assert.equal(broke.cashAfter, 0);
  assert.equal(starsForScore(0), 0);
});
