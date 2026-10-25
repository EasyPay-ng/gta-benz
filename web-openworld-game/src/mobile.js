// Mobile / touch support decisions, kept pure so they can be tested in Node.
//
// The game shipped touch controls behind a single check:
//
//     if (matchMedia('(pointer: coarse)').matches) { ...show joystick... }
//
// One wrong media query and the player has no controls at all — which is what a
// phone reported: no HUD, no joystick, nothing to touch. Detection is now several
// independent signals, and any one of them is enough.

/** Rough device class from the user agent. Only used as one signal among many. */
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i;

/**
 * Work out what this device can do.
 *
 * @param {object} env
 * @param {boolean} [env.coarsePointer]  matchMedia('(pointer: coarse)').matches
 * @param {boolean} [env.anyCoarse]      matchMedia('(any-pointer: coarse)').matches
 * @param {number}  [env.maxTouchPoints] navigator.maxTouchPoints
 * @param {boolean} [env.hasTouchEvent]  'ontouchstart' in window
 * @param {number}  [env.innerWidth]
 * @param {number}  [env.innerHeight]
 * @param {string}  [env.userAgent]
 */
export function detectProfile(env = {}) {
  const {
    coarsePointer = false,
    anyCoarse = false,
    maxTouchPoints = 0,
    hasTouchEvent = false,
    innerWidth = 1024,
    innerHeight = 768,
    userAgent = '',
  } = env;

  const uaTouch = MOBILE_UA.test(userAgent);
  const touchPoints = Number(maxTouchPoints) || 0;

  // Any one of these means "this device can be touched".
  const touch = touchPoints > 0 || coarsePointer || anyCoarse || hasTouchEvent || uaTouch;

  const shortSide = Math.min(Number(innerWidth) || 1024, Number(innerHeight) || 768);
  const smallScreen = shortSide <= 820; // phones and small tablets, either orientation

  return {
    touch,
    touchPoints,
    smallScreen,
    // The compact layout is for a phone held in a hand, not for a big touch
    // laptop: it needs both a touchscreen and a screen that is genuinely small
    // on its short side. This phone reported ~845 CSS px across in landscape,
    // which a width breakpoint reads as a desktop.
    phoneLayout: smallScreen,
    // On-screen controls whenever the device can be touched — never only when a
    // media query happens to agree.
    touchControls: touch,
    // Cheaper rendering when either signal says mobile.
    lowPower: touch || smallScreen,
    userAgentMatched: uaTouch,
  };
}

/**
 * The phone player can always get their controls back, whatever detection decided.
 * Returns the new visibility for #touch.
 */
export function toggleTouchControls(currentVisible) {
  return !currentVisible;
}

/**
 * Camera framing for the current viewport.
 *
 * A phone held upright is a tall, narrow window. At the desktop framing (7.5 m,
 * 62° vertical FOV) the character fills most of the height and the city is invisible.
 * Pull back, widen slightly, and flatten the pitch as the window gets narrower.
 */
export function framingForViewport(aspect) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

  if (a < 0.85) {            // portrait phone
    return { dist: 11.5, pitch: 0.30, fov: 70 };
  }
  if (a < 1.4) {             // square-ish / small tablet
    return { dist: 9.5, pitch: 0.34, fov: 66 };
  }
  // Ordinary landscape, and anything wider. `fov` is vertical, so a wide window
  // already shows as much of the world top-to-bottom as a monitor; bringing the
  // camera closer only makes the character bigger, which is the opposite of
  // what a phone needs.
  return { dist: 7.5, pitch: 0.38, fov: 62 };
}

/**
 * How hard the GPU should be pushed.
 * A phone at devicePixelRatio 3 rendering a 2048² shadow map is how you get 12 fps,
 * which then looks like a broken camera.
 */
export function renderBudget(profile, devicePixelRatio = 1) {
  const dpr = Math.max(1, Number(devicePixelRatio) || 1);
  if (profile?.lowPower) {
    return {
      pixelRatio: Math.min(dpr, 1.25),
      shadowMapSize: 1024,
      antialias: false,
      shadows: true,
    };
  }
  return {
    pixelRatio: Math.min(dpr, 1.75),
    shadowMapSize: 2048,
    antialias: true,
    shadows: true,
  };
}

/**
 * The largest canvas that actually fits on screen.
 *
 * Mobile browsers report a layout viewport that can be taller than the area you can
 * see (URL bar, home indicator). Sizing the canvas from `visualViewport` when it
 * exists keeps the render, the HUD and the touch controls on the same page.
 */
export function canvasSize(innerWidth, innerHeight, visualViewport) {
  const w = Math.round(Number(visualViewport?.width) || Number(innerWidth) || 1);
  const h = Math.round(Number(visualViewport?.height) || Number(innerHeight) || 1);
  return {
    width: Math.max(1, w),
    height: Math.max(1, h),
    aspect: Math.max(1, w) / Math.max(1, h),
  };
}

/** Short, copyable summary for the on-screen diagnostic panel. */
export function describeEnvironment(env = {}, profile = detectProfile(env), size = {}) {
  const yes = (v) => (v ? 'yes' : 'no');
  return [
    `viewport   ${size.width || env.innerWidth}×${size.height || env.innerHeight}`,
    `dpr        ${env.devicePixelRatio ?? '?'}`,
    `touch      ${yes(profile.touch)} (points ${profile.touchPoints})`,
    `coarse     ${yes(env.coarsePointer)} / any ${yes(env.anyCoarse)}`,
    `ua match   ${yes(profile.userAgentMatched)}`,
    `low power  ${yes(profile.lowPower)}`,
    `fullscreen ${yes(env.fullscreenSupported)}`,
    `orientation ${env.orientation || '?'}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Adaptive quality
// ---------------------------------------------------------------------------
// One-way degradation: a phone that cannot hold 30 fps steps the render scale
// down and never climbs back. Recovering upward would oscillate between two
// rates, which looks worse than simply running a little softer.
export const QUALITY_STEPS = [1.25, 1, 0.85, 0.7];

export function nextQuality(current, avgFrameMs) {
  const i = QUALITY_STEPS.indexOf(current);
  if (i < 0) return QUALITY_STEPS[0];
  // Below ~30 fps is the point where input starts to feel detached.
  if (avgFrameMs > 33 && i < QUALITY_STEPS.length - 1) return QUALITY_STEPS[i + 1];
  return current;
}

// How often the expensive per-frame work may run, given the device.
// Mirrors are extra full scene renders; shadows are a full depth pass.
export function frameBudget(profile) {
  if (!profile || !profile.lowPower) return { shadowEvery: 1, mirrorEvery: 1, sideMirrors: true };
  return { shadowEvery: 3, mirrorEvery: 4, sideMirrors: false };
}
