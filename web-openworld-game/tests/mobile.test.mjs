// Mobile detection, framing and render budget — the decisions that decide whether
// the game is playable on a phone.
//
// The bug these exist for: touch controls were gated behind a single
// `matchMedia('(pointer: coarse)')` check. When that check is wrong — and on some
// phone browsers it is — the player gets no joystick and no buttons at all.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectProfile, toggleTouchControls, framingForViewport, renderBudget,
  canvasSize, describeEnvironment, nextQuality, frameBudget, QUALITY_STEPS,
} from '../src/mobile.js';

const PHONE = {
  coarsePointer: true, maxTouchPoints: 5, hasTouchEvent: true,
  innerWidth: 390, innerHeight: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148',
};
const DESKTOP = {
  coarsePointer: false, maxTouchPoints: 0, hasTouchEvent: false,
  innerWidth: 1920, innerHeight: 1080, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
};

// ---------------------------------------------------------------------------
// 1. Detection
// ---------------------------------------------------------------------------
test('Mobile: a phone is detected on any single signal, not just one media query', () => {
  assert.equal(detectProfile(PHONE).touch, true, 'all signals agree');

  // Each signal alone must be enough — this is the fix for the missing joystick.
  assert.equal(detectProfile({ ...DESKTOP, coarsePointer: true }).touch, true, 'coarse pointer alone');
  assert.equal(detectProfile({ ...DESKTOP, anyCoarse: true }).touch, true, 'any-pointer alone');
  assert.equal(detectProfile({ ...DESKTOP, maxTouchPoints: 5 }).touch, true, 'maxTouchPoints alone');
  assert.equal(detectProfile({ ...DESKTOP, hasTouchEvent: true }).touch, true, 'ontouchstart alone');
  assert.equal(detectProfile({ ...DESKTOP, userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' }).touch, true, 'ua alone');
});

test('Mobile: a desktop stays a desktop', () => {
  const p = detectProfile(DESKTOP);
  assert.equal(p.touch, false);
  assert.equal(p.touchControls, false);
  assert.equal(p.lowPower, false);
  assert.equal(p.smallScreen, false);
});

test('Mobile: touch controls follow touch, and small screens are cheap-rendered', () => {
  assert.equal(detectProfile(PHONE).touchControls, true);
  // A small laptop window is not touch, but it is small: cheaper rendering only.
  const small = detectProfile({ ...DESKTOP, innerWidth: 800, innerHeight: 600 });
  assert.equal(small.touch, false);
  assert.equal(small.touchControls, false);
  assert.equal(small.smallScreen, true);
  assert.equal(small.lowPower, true);
});

test('Mobile: the compact layout needs a small screen, not just a touchscreen', () => {
  // This phone reported ~845 CSS px across in landscape. A width breakpoint
  // reads that as a desktop and leaves the desktop layout in place.
  const phoneLandscape = detectProfile({ ...PHONE, innerWidth: 845, innerHeight: 373 });
  assert.equal(phoneLandscape.phoneLayout, true, 'short side 373 is a phone');
  assert.equal(phoneLandscape.touch, true);

  const portrait = detectProfile(PHONE);
  assert.equal(portrait.phoneLayout, true);

  // A big touch laptop keeps the desktop layout.
  const laptop = detectProfile({ ...DESKTOP, maxTouchPoints: 10, innerWidth: 1440, innerHeight: 900 });
  assert.equal(laptop.touch, true, 'it does have a touchscreen');
  assert.equal(laptop.phoneLayout, false, 'but it is not held in a hand');
});

test('Mobile: the escape hatch always works', () => {
  assert.equal(toggleTouchControls(false), true);
  assert.equal(toggleTouchControls(true), false);
});

// ---------------------------------------------------------------------------
// 2. Framing
// ---------------------------------------------------------------------------
test('Mobile: a portrait phone pulls the camera back and widens it', () => {
  const portrait = framingForViewport(390 / 844);
  const landscape = framingForViewport(1920 / 1080);

  assert.ok(portrait.dist > landscape.dist, 'the character cannot fill a tall screen');
  assert.ok(portrait.fov > landscape.fov, 'a narrow window needs a wider view');
  assert.ok(portrait.pitch < landscape.pitch, 'and a flatter angle, or it is all ground');

  // exact desktop framing is preserved for ordinary landscape windows
  assert.deepEqual(landscape, { dist: 7.5, pitch: 0.38, fov: 62 });
});

test('Mobile: every aspect ratio gets a sane camera', () => {
  for (const aspect of [0.4, 0.56, 0.75, 1, 1.33, 1.78, 2.2, 3]) {
    const f = framingForViewport(aspect);
    assert.ok(f.dist >= 6 && f.dist <= 13, `dist in range for ${aspect}`);
    assert.ok(f.pitch > 0.2 && f.pitch < 0.5, `pitch in range for ${aspect}`);
    assert.ok(f.fov >= 55 && f.fov <= 75, `fov in range for ${aspect}`);
  }
  // A very wide phone must not be framed closer than a monitor: `fov` is
  // vertical, so pulling in only enlarges the character.
  assert.equal(framingForViewport(2.3).dist, framingForViewport(1.78).dist);

  // and junk input falls back to the desktop framing instead of NaN
  assert.deepEqual(framingForViewport(NaN), framingForViewport(1));
  assert.deepEqual(framingForViewport(0), framingForViewport(1));
});

// ---------------------------------------------------------------------------
// 3. Render budget
// ---------------------------------------------------------------------------
test('Mobile: a phone gets a cheaper renderer', () => {
  const phone = renderBudget(detectProfile(PHONE), 3);
  assert.equal(phone.pixelRatio, 1.25, 'dpr 3 does not mean render 3×');
  assert.equal(phone.shadowMapSize, 1024);
  assert.equal(phone.antialias, false);

  const desktop = renderBudget(detectProfile(DESKTOP), 2);
  assert.equal(desktop.pixelRatio, 1.75);
  assert.equal(desktop.shadowMapSize, 2048);
  assert.equal(desktop.antialias, true);
});

test('Mobile: a 1× display is never rendered below 1×', () => {
  const phone = renderBudget(detectProfile(PHONE), 1);
  assert.equal(phone.pixelRatio, 1);
  assert.equal(renderBudget(detectProfile(PHONE), 0).pixelRatio, 1, 'dpr 0 is not a ratio');
});

// ---------------------------------------------------------------------------
// 4. Canvas size
// ---------------------------------------------------------------------------
test('Mobile: the canvas follows the visual viewport, which is what you can see', () => {
  // A phone in landscape: the layout viewport says 844 tall but only 390 is visible.
  const size = canvasSize(844, 844, { width: 844, height: 390 });
  assert.deepEqual(size, { width: 844, height: 390, aspect: 844 / 390 });

  // Without a visualViewport, fall back to the window.
  assert.deepEqual(canvasSize(390, 844, null), { width: 390, height: 844, aspect: 390 / 844 });

  // Never zero, never NaN — a zero-sized canvas is a black screen forever.
  assert.deepEqual(canvasSize(0, 0, { width: 0, height: 0 }), { width: 1, height: 1, aspect: 1 });
  assert.equal(canvasSize(undefined, undefined, undefined).width, 1);
});

// ---------------------------------------------------------------------------
// 5. Diagnostics
// ---------------------------------------------------------------------------
test('Mobile: the diagnostic panel is short and copyable', () => {
  const env = { ...PHONE, devicePixelRatio: 3, fullscreenSupported: true, orientation: 'portrait-primary' };
  const profile = detectProfile(env);
  const text = describeEnvironment(env, profile, canvasSize(390, 844, null));

  assert.match(text, /viewport\s+390×844/);
  assert.match(text, /dpr\s+3/);
  assert.match(text, /touch\s+yes \(points 5\)/);
  assert.match(text, /fullscreen\s+yes/);
  assert.ok(text.split('\n').length <= 10, 'fits in a screenshot');
});

// ---------------------------------------------------------------------------
// 6. Per-frame budget
// ---------------------------------------------------------------------------
test('Mobile: a phone skips the expensive per-frame work', () => {
  const phone = frameBudget(detectProfile(PHONE));
  assert.ok(phone.shadowEvery > 1, 'shadows are a full depth pass');
  assert.ok(phone.mirrorEvery > 1, 'mirrors are extra scene renders');
  assert.equal(phone.sideMirrors, false, 'one mirror is enough on a phone');

  const desktop = frameBudget(detectProfile(DESKTOP));
  assert.deepEqual(desktop, { shadowEvery: 1, mirrorEvery: 1, sideMirrors: true });
  assert.deepEqual(frameBudget(null), { shadowEvery: 1, mirrorEvery: 1, sideMirrors: true });
});

test('Mobile: quality only ever falls, and stops at the floor', () => {
  assert.equal(nextQuality(1.25, 16), 1.25, 'a fast frame changes nothing');
  assert.equal(nextQuality(1.25, 40), 1, 'a slow frame steps down once');
  assert.equal(nextQuality(1, 40), 0.85);
  assert.equal(nextQuality(0.85, 40), 0.7);
  assert.equal(nextQuality(0.7, 90), 0.7, 'the floor holds even when it is hopeless');

  // never climbs: a fast frame at a reduced scale stays where it is
  for (const step of QUALITY_STEPS) assert.equal(nextQuality(step, 5) <= step, true);

  assert.equal(nextQuality(99, 16), QUALITY_STEPS[0], 'unknown scale resets to the top');
});
