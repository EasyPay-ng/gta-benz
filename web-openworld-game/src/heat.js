// MetroVenture 3D — pure street-heat / wanted-level & police bust calculations (no DOM, no Three.js).
import {
  HEAT_STAR_THRESHOLDS,
  HEAT_MAX_SCORE,
  HEAT_CRASH_SPEED_MPS,
  HEAT_COOLDOWN_DELAY,
  HEAT_DECAY_PER_SEC,
  HEAT_BUST_SECONDS,
  HEAT_FINE_PER_STAR,
  HEAT_MAX_CRUISERS,
} from './data.js';

export function createHeatState() {
  return {
    score: 0,
    stars: 0,
    unseenTime: 0,
    bustTimer: 0,
    incidentCooldown: 0,
  };
}

export function starsForScore(score) {
  let s = 0;
  for (let i = 0; i < HEAT_STAR_THRESHOLDS.length; i++) {
    if (score >= HEAT_STAR_THRESHOLDS[i]) s = i + 1;
  }
  return s;
}

export function desiredCruisers(stars) {
  if (stars <= 0) return 0;
  if (stars === 1) return 1;
  return Math.min(HEAT_MAX_CRUISERS, stars);
}

/**
 * Record a street offense ('traffic_ram' | 'ped_scare' | 'vehicle_explosion' | 'cop_ram').
 * Returns `{ added, starsBefore, starsAfter, escalated }`.
 */
export function addHeatOffense(heat, kind, impactSpeed = 0) {
  const starsBefore = heat.stars;
  let points = 0;
  switch (kind) {
    case 'traffic_ram':
      if (impactSpeed < HEAT_CRASH_SPEED_MPS || heat.incidentCooldown > 0) break;
      points = Math.min(34, 14 + (impactSpeed - HEAT_CRASH_SPEED_MPS) * 1.6);
      heat.incidentCooldown = 1.4;
      break;
    case 'cop_ram':
      if (heat.incidentCooldown > 0) break;
      points = 30 + Math.min(25, impactSpeed * 1.1);
      heat.incidentCooldown = 1.2;
      break;
    case 'ped_scare':
      if (heat.incidentCooldown > 0) break;
      points = 24;
      heat.incidentCooldown = 1.8;
      break;
    case 'vehicle_explosion':
      points = 42;
      break;
    default:
      break;
  }
  if (points > 0) {
    heat.score = Math.min(HEAT_MAX_SCORE, heat.score + points);
    heat.unseenTime = 0;
    heat.stars = starsForScore(heat.score);
  }
  return {
    added: points,
    starsBefore,
    starsAfter: heat.stars,
    escalated: heat.stars > starsBefore,
  };
}

/**
 * Advance heat timers by `dt` seconds.
 * @param {object} heat
 * @param {number} dt
 * @param {{ seenByPolice: boolean, pinnedByPolice: boolean }} ctx
 * @returns {{ cleared: boolean, busted: boolean, stars: number }}
 */
export function stepHeat(heat, dt, { seenByPolice = false, pinnedByPolice = false } = {}) {
  heat.incidentCooldown = Math.max(0, heat.incidentCooldown - dt);
  if (heat.score <= 0) {
    heat.score = 0;
    heat.stars = 0;
    heat.bustTimer = 0;
    return { cleared: false, busted: false, stars: 0 };
  }

  const prevStars = heat.stars;
  if (pinnedByPolice && heat.stars > 0) {
    heat.bustTimer += dt;
    heat.unseenTime = 0;
    if (heat.bustTimer >= HEAT_BUST_SECONDS) {
      const bustedStars = heat.stars;
      heat.score = 0;
      heat.stars = 0;
      heat.bustTimer = 0;
      heat.unseenTime = 0;
      return { cleared: false, busted: true, stars: bustedStars };
    }
  } else {
    heat.bustTimer = Math.max(0, heat.bustTimer - dt * 1.5);
  }

  if (seenByPolice) {
    heat.unseenTime = 0;
  } else {
    heat.unseenTime += dt;
    if (heat.unseenTime >= HEAT_COOLDOWN_DELAY) {
      heat.score = Math.max(0, heat.score - HEAT_DECAY_PER_SEC * dt);
      heat.stars = starsForScore(heat.score);
    }
  }

  const cleared = prevStars > 0 && heat.stars === 0;
  if (cleared) heat.score = 0;
  return { cleared, busted: false, stars: heat.stars };
}

/** Compute & apply police ticket fine on bust (never drives cash negative). */
export function applyBustFine(cash, bustedStars) {
  const stars = Math.max(1, Math.round(bustedStars || 1));
  const rawFine = stars * HEAT_FINE_PER_STAR;
  const paid = Math.max(0, Math.min(cash, rawFine));
  return { fine: paid, cashAfter: cash - paid };
}

export function starLabel(stars, maxStars = 3) {
  const s = Math.max(0, Math.min(maxStars, stars));
  return '★'.repeat(s) + '☆'.repeat(maxStars - s);
}
