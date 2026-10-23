import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cam from '../src/camera.js';

test('toggleCameraMode switches cleanly between third-person and first-person / cockpit', () => {
  const cam = Cam.createCameraState();
  assert.equal(cam.mode, 'third');

  const r1 = Cam.toggleCameraMode(cam, false, 1.25);
  assert.equal(r1.mode, 'first');
  assert.equal(r1.label, 'First-Person View');
  assert.equal(cam.yaw, 1.25);

  const r2 = Cam.toggleCameraMode(cam, true);
  assert.equal(r2.mode, 'third');
  assert.equal(r2.label, 'Exterior Chase View');

  const r3 = Cam.toggleCameraMode(cam, true);
  assert.equal(r3.mode, 'first');
  assert.equal(r3.label, 'Cockpit Interior View');
});

test('applyCameraDrag turns right on positive dx and looks up on negative dy in first-person & cockpit', () => {
  const cam = Cam.createCameraState('first');
  cam.yaw = 0;
  cam.fpPitch = 0;

  // Drag right (+dx) and up (-dy) on foot
  Cam.applyCameraDrag(cam, 100, -100, { inVehicle: false, elapsed: 5 });
  assert.ok(cam.yaw < 0, 'yaw turns right');
  assert.ok(cam.fpPitch > 0, 'fpPitch looks up');

  // Extreme vertical drag clamps safely without gimbal flip
  Cam.applyCameraDrag(cam, 0, -50000, { inVehicle: false, elapsed: 6 });
  assert.ok(cam.fpPitch < Math.PI / 2);

  // In-car cockpit freelook clamps yaw offset and gently recenters after delay while driving
  Cam.applyCameraDrag(cam, -120, 40, { inVehicle: true, elapsed: 10 });
  assert.ok(cam.cockpitYaw > 0, 'dragging left looks left toward driver window');
  const beforeRecenter = cam.cockpitYaw;
  Cam.computeCockpitCameraPose(cam, {
    vx: 0, vy: 0, vz: 0, carYaw: 0,
    speed: 18, steer: 0, elapsed: 13, dt: 0.2,
  });
  assert.ok(cam.cockpitYaw < beforeRecenter, 'cockpitYaw gently recenters while driving');
});

test('computeFootFirstPersonPose places eye at build-scaled head height and bobs while sprinting', () => {
  const cam = Cam.createCameraState('first');
  cam.yaw = 0;
  const stand = Cam.computeFootFirstPersonPose(cam, {
    x: 10, z: 20, groundY: 0.1, buildH: 1.04, jumpY: 0, movingSpeed: 0, dt: 0.05,
  });
  assert.ok(stand.eye.y > 1.65 && stand.eye.y < 1.8);
  assert.ok(stand.look.z > stand.eye.z, 'yaw 0 looks along +Z');

  const sprint = Cam.computeFootFirstPersonPose(cam, {
    x: 10, z: 20, groundY: 0.1, buildH: 1.04, jumpY: 0, movingSpeed: 7.2, dt: 0.07,
  });
  assert.notEqual(sprint.eye.y, stand.eye.y, 'stride head-bob modulates eye height while moving');
});

test('computeCockpitCameraPose transforms driver-side (+X) eye into world space across car yaw', () => {
  const cam = Cam.createCameraState('first');
  // Facing +Z (carYaw = 0): driver seat (+X local) sits at +X world
  const pNorth = Cam.computeCockpitCameraPose(cam, {
    vx: 0, vy: 0, vz: 0, carYaw: 0,
    driverEye: { x: 0.44, y: 1.28, z: -0.2 },
    speed: 0, steer: 0, elapsed: 1, dt: 0.016,
  });
  assert.ok(Math.abs(pNorth.eye.x - 0.44) < 0.01);
  assert.ok(pNorth.look.z > pNorth.eye.z, 'looks forward out windshield along +Z');

  // Facing +X (carYaw = +PI/2): forward is +X world, driver seat (+X local = left) is at -Z world
  const pEast = Cam.computeCockpitCameraPose(cam, {
    vx: 0, vy: 0, vz: 0, carYaw: Math.PI / 2,
    driverEye: { x: 0.44, y: 1.28, z: -0.2 },
    speed: 0, steer: 0, elapsed: 1, dt: 0.016,
  });
  assert.ok(pEast.look.x > pEast.eye.x, 'looks forward along +X when carYaw = PI/2');
  assert.ok(pEast.eye.z < -0.4, 'left-hand driver seat sits on -Z side when facing +X');
});
