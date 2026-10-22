import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Time from '../src/time.js';
import { PAYROLL_INTERVAL, CLOCK_SPEED } from '../src/data.js';

test('24x rate: 30 real seconds equals 12 in-game minutes and 2.5 real min equals 1 in-game hour', () => {
  assert.equal(Time.inGameMinutesPerRealSecond, 0.4);
  assert.equal(PAYROLL_INTERVAL * Time.inGameMinutesPerRealSecond, 12);
  assert.equal(Time.SHIFT_INGAME_MS / CLOCK_SPEED, PAYROLL_INTERVAL * 1000);

  const t0 = 1_700_000_000_000;
  const clk = Time.createClock(t0, 8 * Time.INGAME_HOUR_MS, 24);
  assert.equal(Time.clockLabel(Time.inGameNowMs(clk, t0)), 'Day 1 · 08:00');

  // 2.5 real minutes later = +1 in-game hour (09:00)
  const after2m30s = Time.inGameNowMs(clk, t0 + 150_000);
  assert.equal(Time.clockLabel(after2m30s), 'Day 1 · 09:00');

  // 1 real hour later = +24 in-game hours (Day 2 · 08:00)
  const after1h = Time.inGameNowMs(clk, t0 + 3_600_000);
  assert.equal(Time.clockLabel(after1h), 'Day 2 · 08:00');
  assert.equal(Time.dayOf(after1h), 2);
});

test('offline fast-forward: reloading later advances clock by elapsed real time * 24', () => {
  const savedAt = 1_700_000_000_000;
  const clk = Time.createClock(savedAt, 2 * Time.INGAME_DAY_MS + 14 * Time.INGAME_HOUR_MS + 32 * Time.INGAME_MINUTE_MS);
  assert.equal(Time.clockLabel(Time.inGameNowMs(clk, savedAt)), 'Day 3 · 14:32');

  // Come back 10 real minutes later -> +4 in-game hours (Day 3 · 18:32)
  const reloadedAt = savedAt + 10 * 60_000;
  assert.equal(Time.clockLabel(Time.inGameNowMs(clk, reloadedAt)), 'Day 3 · 18:32');
});

test('phase returns 0..1 progress and named bands (night/dawn/day/dusk)', () => {
  const at = (h) => h * Time.INGAME_HOUR_MS;
  assert.equal(Time.phase(at(0)).band, 'night');
  assert.equal(+Time.phase(at(0)), 0);
  assert.equal(Time.phase(at(4.9)).band, 'night');
  assert.equal(Time.phase(at(5.0)).band, 'dawn');
  assert.equal(Time.phase(at(7.9)).band, 'dawn');
  assert.equal(Time.phase(at(8.0)).band, 'day');
  assert.equal(+Time.phase(at(12)), 0.5);
  assert.equal(Time.phase(at(17.9)).band, 'day');
  assert.equal(Time.phase(at(18.0)).band, 'dusk');
  assert.equal(Time.phase(at(19.9)).band, 'dusk');
  assert.equal(Time.phase(at(20.0)).band, 'night');
  assert.equal(Time.phase(at(23.5)).band, 'night');
});

test('12-minute shift boundaries align with 30s real-time payday cadence', () => {
  const start = 8 * Time.INGAME_HOUR_MS; // exact 12-min boundary
  assert.equal(Time.secondsToNextShift(start), 30);
  assert.equal(Time.secondsToNextShift(start + 6 * Time.INGAME_MINUTE_MS), 15);
  assert.equal(Time.shiftIndex(start + 12 * Time.INGAME_MINUTE_MS) - Time.shiftIndex(start), 1);
  assert.equal(Time.secondsToNextShift(start + 12 * Time.INGAME_MINUTE_MS), 30);
});

test('fastForwardTo only advances forward while setClock jumps anywhere for QA', () => {
  const t0 = 1_000_000;
  const clk = Time.createClock(t0, 10 * Time.INGAME_HOUR_MS);
  // Attempt to fast-forward to an earlier time is a no-op
  Time.fastForwardTo(clk, 6 * Time.INGAME_HOUR_MS, t0);
  assert.equal(Time.hhmm(Time.inGameNowMs(clk, t0)), '10:00');

  // Fast-forward to next morning 07:00 (Day 2 · 07:00)
  const target = Time.INGAME_DAY_MS + 7 * Time.INGAME_HOUR_MS;
  Time.fastForwardTo(clk, target, t0 + 5_000);
  assert.equal(Time.clockLabel(Time.inGameNowMs(clk, t0 + 5_000)), 'Day 2 · 07:00');

  // QA setClock can jump back to midnight
  Time.setClock(clk, 0, t0 + 5_000);
  assert.equal(Time.clockLabel(Time.inGameNowMs(clk, t0 + 5_000)), 'Day 1 · 00:00');
});

test('lightingAt transitions smoothly across midnight, dawn, noon and dusk', () => {
  const midnight = Time.lightingAt(0);
  const dawn = Time.lightingAt(6.2 * Time.INGAME_HOUR_MS);
  const noon = Time.lightingAt(12 * Time.INGAME_HOUR_MS);
  const dusk = Time.lightingAt(19 * Time.INGAME_HOUR_MS);

  assert.equal(midnight.lampFactor, 1);
  assert.equal(midnight.shadows, false);
  assert.equal(noon.lampFactor, 0);
  assert.equal(noon.shadows, true);
  assert.ok(noon.sunIntensity > dawn.sunIntensity);
  assert.ok(dawn.lampFactor > 0 && dawn.lampFactor < 1);
  assert.ok(dusk.lampFactor > 0.5);
});
