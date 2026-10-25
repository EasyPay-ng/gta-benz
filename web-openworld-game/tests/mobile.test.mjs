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
  canvasSize, describeEnvironment,
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
