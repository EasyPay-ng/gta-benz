// MetroVenture 3D — pure in-game clock & day/night lighting math (feature 11).
// No DOM, no Three.js — safe to import in Node tests (see tests/time.test.mjs).
//
// Time scale: 1 real-life hour = 24 in-game hours (24× real time).
//   1 in-game minute = 2.5 real s  (0.4 in-game min / real s)
//   12 in-game min   = 30 real s   (existing payday cadence, relabelled as 1 shift)
//   1 in-game hour   = 2.5 real min
//   1 in-game day    = 1 real hour
//   1 in-game week   = 7 real hours

import {
  CLOCK_SPEED,
  INGAME_MINUTE_MS,
  INGAME_HOUR_MS,
  INGAME_DAY_MS,
  CLOCK_START_HOUR,
  SHIFT_INGAME_MINUTES,
} from './data.js';

export { CLOCK_SPEED, INGAME_MINUTE_MS, INGAME_HOUR_MS, INGAME_DAY_MS, SHIFT_INGAME_MINUTES };

export const SHIFT_INGAME_MS = SHIFT_INGAME_MINUTES * INGAME_MINUTE_MS; // 720,000 ms
export const inGameMinutesPerRealSecond = CLOCK_SPEED / 60;             // 0.4

/**
 * Create a fresh TimeState anchored to `wallNow`.
 * `inGameMs = 0` corresponds to Day 1 · 00:00, so `CLOCK_START_HOUR = 8` starts at Day 1 · 08:00.
 */
export function createClock(
  wallNow = Date.now(),
  inGameBase = CLOCK_START_HOUR * INGAME_HOUR_MS,
  speed = CLOCK_SPEED,
) {
  return { realBase: wallNow, inGameBase, speed };
}

/** Current in-game timestamp (ms since Day 1 · 00:00). */
export function inGameNowMs(clock, wallNow = Date.now()) {
  if (!clock || typeof clock !== 'object') return CLOCK_START_HOUR * INGAME_HOUR_MS;
  const speed = Number.isFinite(clock.speed) ? clock.speed : CLOCK_SPEED;
  const realBase = Number.isFinite(clock.realBase) ? clock.realBase : wallNow;
  const inGameBase = Number.isFinite(clock.inGameBase) ? clock.inGameBase : CLOCK_START_HOUR * INGAME_HOUR_MS;
  const elapsedReal = Math.max(0, wallNow - realBase);
  return inGameBase + elapsedReal * speed;
}

/** 1-indexed in-game day number (Day 1 = 0 .. 86,399,999 ms). */
export function dayOf(inGameMs) {
  return Math.floor(Math.max(0, inGameMs) / INGAME_DAY_MS) + 1;
}

/** Milliseconds into the current 24h day (0 .. 86,399,999). */
export function timeOfDayMs(inGameMs) {
  return ((inGameMs % INGAME_DAY_MS) + INGAME_DAY_MS) % INGAME_DAY_MS;
}

/** Fractional hours into the current 24h day (0 .. <24). */
export function hoursOfDay(inGameMs) {
  return timeOfDayMs(inGameMs) / INGAME_HOUR_MS;
}

/** Zero-padded 'HH:MM' 24-hour string. */
export function hhmm(inGameMs) {
  const totalMin = Math.floor(timeOfDayMs(inGameMs) / INGAME_MINUTE_MS);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Full HUD label, e.g. 'Day 3 · 14:32'. */
export function clockLabel(inGameMs) {
  return `Day ${dayOf(inGameMs)} · ${hhmm(inGameMs)}`;
}

/** Named band for a timestamp: night (20–05), dawn (05–08), day (08–18), dusk (18–20). */
export function phaseBand(inGameMs) {
  const h = hoursOfDay(inGameMs);
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 18) return 'day';
  if (h >= 18 && h < 20) return 'dusk';
  return 'night';
}

/** Progress through the current 24h day in [0, 1). */
export function dayProgress(inGameMs) {
  return timeOfDayMs(inGameMs) / INGAME_DAY_MS;
}

/** Smooth 0..1 darkness factor (0 in bright day, 1 at night; ramps across dawn/dusk). */
export function nightFactor(inGameMs) {
  const h = hoursOfDay(inGameMs);
  if (h >= 8 && h < 17.5) return 0;
  if (h >= 20 || h < 5) return 1;
  if (h >= 17.5 && h < 20) return smoothstep((h - 17.5) / 2.5);
  // 5..8 dawn: 1 -> 0
  return 1 - smoothstep((h - 5) / 3);
}

/**
 * Day phase descriptor. Coerces numerically to 0..1 (`+phase(ms)`) while exposing
 * `.t`, `.progress`, `.band` ('night'|'dawn'|'day'|'dusk'), `.hours`, and `.night`.
 */
export function phase(inGameMs) {
  const t = dayProgress(inGameMs);
  const band = phaseBand(inGameMs);
  const hours = hoursOfDay(inGameMs);
  const night = nightFactor(inGameMs);
  return {
    t,
    progress: t,
    band,
    hours,
    night,
    valueOf() { return t; },
  };
}

// ---------------------------------------------------------------------------
// 12-in-game-minute shift / payroll alignment (30 real s at 24×)
// ---------------------------------------------------------------------------

/** Monotonic 0-indexed shift counter since Day 1 · 00:00. */
export function shiftIndex(inGameMs) {
  return Math.floor(Math.max(0, inGameMs) / SHIFT_INGAME_MS);
}

/** Real-time seconds remaining until the next 12-in-game-minute shift boundary (in (0, 30]). */
export function secondsToNextShift(inGameMs, speed = CLOCK_SPEED) {
  const rem = ((inGameMs % SHIFT_INGAME_MS) + SHIFT_INGAME_MS) % SHIFT_INGAME_MS;
  const leftInGame = SHIFT_INGAME_MS - rem;
  return leftInGame / (speed * 1000);
}

/**
 * Fast-forward `clock` to `targetInGameMs` (never moves time backwards; used by sleep
 * time-skips and offline reconciliation). Mutates and returns `clock`.
 */
export function fastForwardTo(clock, targetInGameMs, wallNow = Date.now()) {
  const current = inGameNowMs(clock, wallNow);
  clock.realBase = wallNow;
  clock.inGameBase = Math.max(current, targetInGameMs);
  if (!Number.isFinite(clock.speed)) clock.speed = CLOCK_SPEED;
  return clock;
}

/**
 * Set `clock` to an exact `targetInGameMs` anchored at `wallNow` (used by server
 * reconciliation and `window.__mv.time.set(ms)` QA jumps). Mutates and returns `clock`.
 */
export function setClock(clock, targetInGameMs, wallNow = Date.now()) {
  clock.realBase = wallNow;
  clock.inGameBase = Math.max(0, Number(targetInGameMs) || 0);
  if (!Number.isFinite(clock.speed)) clock.speed = CLOCK_SPEED;
  return clock;
}

// ---------------------------------------------------------------------------
// Day / night lighting ramp (pure RGB + intensity keyframes for world/game)
// ---------------------------------------------------------------------------
const KEYFRAMES = [
  // hour, sky,      hemiSky,  hemiGnd,  hemiI, sunCol,   sunI, lamps
  [0.0,  0x070d1f, 0x1e293b, 0x090d16, 0.45,  0x64748b, 0.08, 1.0],
  [5.0,  0x0f172a, 0x334155, 0x111827, 0.52,  0x94a3b8, 0.14, 1.0],
  [6.2,  0xd98a6c, 0xfed7aa, 0x365314, 1.15,  0xfdba74, 1.35, 0.45],
  [7.8,  0x8ecae6, 0xe0f2fe, 0x4d6b35, 1.78,  0xfff1dc, 2.35, 0.0],
  [12.0, 0x9fd3f5, 0xe0f2fe, 0x4d6b35, 1.95,  0xfff7ed, 2.65, 0.0],
  [17.2, 0x8ecae6, 0xfef3c7, 0x4d6b35, 1.70,  0xfed7aa, 2.15, 0.0],
  [18.6, 0xc26d53, 0xfdba74, 0x292524, 0.98,  0xfb923c, 1.05, 0.65],
  [20.0, 0x0b132b, 0x1e293b, 0x0b1120, 0.48,  0x64748b, 0.10, 1.0],
  [24.0, 0x070d1f, 0x1e293b, 0x090d16, 0.45,  0x64748b, 0.08, 1.0],
];

/**
 * Compute interpolated sky/fog/light parameters and sun direction for `inGameMs`.
 * Sun rises in the east (+X) at 06:00, peaks high overhead at 12:00, and sets in the west (-X) at 18:00.
 */
export function lightingAt(inGameMs) {
  const h = hoursOfDay(inGameMs);
  let a = KEYFRAMES[0];
  let b = KEYFRAMES[KEYFRAMES.length - 1];
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (h >= KEYFRAMES[i][0] && h <= KEYFRAMES[i + 1][0]) {
      a = KEYFRAMES[i];
      b = KEYFRAMES[i + 1];
      break;
    }
  }
  const span = Math.max(1e-6, b[0] - a[0]);
  const u = smoothstep((h - a[0]) / span);

  // Sun arc: 06:00 -> angle 0 (east horizon), 12:00 -> PI/2 (zenith), 18:00 -> PI (west horizon)
  const dayArc = ((h - 6) / 12) * Math.PI;
  const daytime = h >= 5.5 && h <= 18.5;
  const sunX = daytime ? Math.cos(dayArc) * 95 : -35;
  const sunY = daytime ? Math.max(12, Math.sin(dayArc) * 105) : 75;
  const sunZ = daytime ? 32 : -28;

  return {
    hours: h,
    band: phaseBand(inGameMs),
    night: nightFactor(inGameMs),
    skyHex: lerpHex(a[1], b[1], u),
    hemiSkyHex: lerpHex(a[2], b[2], u),
    hemiGroundHex: lerpHex(a[3], b[3], u),
    hemiIntensity: lerp(a[4], b[4], u),
    sunHex: lerpHex(a[5], b[5], u),
    sunIntensity: lerp(a[6], b[6], u),
    lampFactor: lerp(a[7], b[7], u),
    shadows: daytime && lerp(a[6], b[6], u) > 0.25,
    sunOffset: { x: sunX, y: sunY, z: sunZ },
  };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(x) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
function lerpHex(c1, c2, t) {
  const r1 = (c1 >> 16) & 255; const g1 = (c1 >> 8) & 255; const b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255; const g2 = (c2 >> 8) & 255; const b2 = c2 & 255;
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return (r << 16) | (g << 8) | b;
}
