// MetroVenture 3D — pure camera mode, freelook & first-person / cockpit pose math.
// Zero DOM / Three.js dependencies so it is unit-tested in tests/camera.test.mjs.

import {
  CAM_MODES,
  CAM_THIRD_FOV,
  CAM_FIRST_FOV,
  CAM_COCKPIT_FOV,
  CAM_FOOT_EYE_HEIGHT,
  CAM_FOOT_EYE_FORWARD,
  CAM_FIRST_PITCH_MIN,
  CAM_FIRST_PITCH_MAX,
  CAM_COCKPIT_YAW_MAX,
  CAM_COCKPIT_PITCH_MIN,
  CAM_COCKPIT_PITCH_MAX,
  CAM_COCKPIT_RECENTER_DELAY,
  CAM_HEADBOB_FREQ,
  CAM_HEADBOB_AMP,
} from './data.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function normalizeCameraMode(mode) {
  return CAM_MODES.includes(mode) ? mode : 'third';
}

export function createCameraState(mode = 'third') {
  return {
    mode: normalizeCameraMode(mode),
    yaw: 0,
    pitch: 0.38,            // third-person orbit elevation (radians above horizon)
    fpPitch: -0.02,         // on-foot first-person head pitch (+up, -down)
    cockpitYaw: 0,          // in-car head yaw offset relative to car forward (+left, -right)
    cockpitPitch: -0.05,    // in-car head pitch (+up, -down; slight downward tilt frames wheel + road)
    dist: 7.5,
    lastDrag: -10,
    drag: null,
    shake: 0,
    bobPhase: 0,
  };
}

export function cameraModeLabel(mode, inVehicle = false) {
  const m = normalizeCameraMode(mode);
  if (inVehicle) return m === 'first' ? 'Cockpit Interior View' : 'Exterior Chase View';
  return m === 'first' ? 'First-Person View' : 'Third-Person View';
}

export function setCameraMode(camState, nextMode, inVehicle = false, currentHeadingYaw = null) {
  const prev = camState.mode;
  camState.mode = normalizeCameraMode(nextMode);
  if (camState.mode === 'first') {
    if (Number.isFinite(currentHeadingYaw)) camState.yaw = currentHeadingYaw;
    camState.fpPitch = -0.02;
    camState.cockpitYaw = 0;
    camState.cockpitPitch = -0.05;
  } else if (prev === 'first') {
    camState.pitch = clamp(camState.pitch, 0.18, 0.85);
    camState.cockpitYaw = 0;
  }
  return {
    mode: camState.mode,
    label: cameraModeLabel(camState.mode, inVehicle),
  };
}

export function toggleCameraMode(camState, inVehicle = false, currentHeadingYaw = null) {
  const next = camState.mode === 'first' ? 'third' : 'first';
  return setCameraMode(camState, next, inVehicle, currentHeadingYaw);
}

/**
 * Apply pointer drag delta `(dx, dy)` in screen pixels to `camState`.
 * Screen right (`dx > 0`) turns view right (`yaw` decreases); screen up (`dy < 0`) looks up in 1st-person.
 */
export function applyCameraDrag(camState, dx, dy, { inVehicle = false, elapsed = 0 } = {}) {
  camState.lastDrag = elapsed;
  if (camState.mode === 'first' && inVehicle) {
    camState.cockpitYaw = clamp(camState.cockpitYaw - dx * 0.0055, -CAM_COCKPIT_YAW_MAX, CAM_COCKPIT_YAW_MAX);
    camState.cockpitPitch = clamp(camState.cockpitPitch - dy * 0.0045, CAM_COCKPIT_PITCH_MIN, CAM_COCKPIT_PITCH_MAX);
    return;
  }
  if (camState.mode === 'first') {
    camState.yaw -= dx * 0.0055;
    camState.fpPitch = clamp(camState.fpPitch - dy * 0.0045, CAM_FIRST_PITCH_MIN, CAM_FIRST_PITCH_MAX);
    return;
  }
  camState.yaw -= dx * 0.006;
  camState.pitch = clamp(camState.pitch + dy * 0.004, 0.05, 1.25);
}

export function targetFov(camState, inVehicle = false, speedMps = 0) {
  if (camState.mode === 'first') {
    if (inVehicle) return CAM_COCKPIT_FOV + Math.min(7, Math.abs(speedMps) * 0.14);
    return CAM_FIRST_FOV + Math.min(4, Math.abs(speedMps) * 0.35);
  }
  if (inVehicle) return CAM_THIRD_FOV + Math.abs(speedMps) * 0.35;
  return CAM_THIRD_FOV;
}

/**
 * Compute world-space eye position and look-at target for On-Foot First-Person View.
 */
export function computeFootFirstPersonPose(camState, {
  x, z, groundY = 0, buildH = 1, jumpY = 0, movingSpeed = 0, dt = 0,
}) {
  const airborne = jumpY > 0.02;
  if (!airborne && movingSpeed > 0.25) {
    camState.bobPhase += dt * CAM_HEADBOB_FREQ * (0.55 + Math.min(1.3, movingSpeed / 6.5));
  }
  const speedRatio = airborne ? 0 : clamp(movingSpeed / 7.2, 0, 1);
  const bobY = Math.sin(camState.bobPhase * 2) * CAM_HEADBOB_AMP * speedRatio;
  const bobSway = Math.cos(camState.bobPhase) * CAM_HEADBOB_AMP * 0.55 * speedRatio;

  const sinY = Math.sin(camState.yaw);
  const cosY = Math.cos(camState.yaw);
  // Right vector in world (+Z forward, +X left, -X right): right = (-cosY, sinY)
  const rightX = -cosY;
  const rightZ = sinY;

  const eyeX = x + sinY * CAM_FOOT_EYE_FORWARD + rightX * bobSway;
  const eyeY = groundY + CAM_FOOT_EYE_HEIGHT * buildH + jumpY + bobY;
  const eyeZ = z + cosY * CAM_FOOT_EYE_FORWARD + rightZ * bobSway;

  const cosP = Math.cos(camState.fpPitch);
  const sinP = Math.sin(camState.fpPitch);
  const lookDist = 12;

  return {
    eye: { x: eyeX, y: eyeY, z: eyeZ },
    look: {
      x: eyeX + sinY * cosP * lookDist,
      y: eyeY + sinP * lookDist,
      z: eyeZ + cosP * cosY * lookDist,
    },
  };
}

/**
 * Compute world-space driver eye position, look-at target & subtle roll for In-Car Cockpit View.
 * Local car space: +Z = forward, +Y = up, +X = driver (left) side, -X = passenger (right) side.
 */
export function computeCockpitCameraPose(camState, {
  vx, vy, vz, carYaw, bodyPitch = 0, bodyRoll = 0,
  driverEye = { x: 0.38, y: 1.24, z: -0.2 },
  speed = 0, steer = 0, elapsed = 0, dt = 0,
}) {
  // Gently recenter head toward the road ahead while actively driving if user isn't freelooking
  if (!camState.drag && elapsed - camState.lastDrag > CAM_COCKPIT_RECENTER_DELAY && Math.abs(speed) > 1.5) {
    const k = Math.min(1, dt * 3.2);
    camState.cockpitYaw += (0 - camState.cockpitYaw) * k;
    camState.cockpitPitch += (-0.05 - camState.cockpitPitch) * k;
  }

  // Subtle lateral G-force head lean into turns + high-RPM micro-vibration
  const gLeanX = clamp(-steer * (speed / 28) * 0.032, -0.035, 0.035);
  const pitchShiftZ = clamp(-bodyPitch * 0.45, -0.03, 0.03);
  const vibY = Math.abs(speed) > 1 ? Math.sin(elapsed * 38) * Math.min(0.0035, Math.abs(speed) * 0.0001) : 0;

  // Local eye offset inside the car (including body suspension pitch & roll)
  const lx = driverEye.x + gLeanX - bodyRoll * driverEye.y * 0.55;
  const ly = driverEye.y + vibY + bodyRoll * driverEye.x * 0.35 - bodyPitch * driverEye.z * 0.35;
  const lz = driverEye.z + pitchShiftZ;

  // Rotate local (lx, lz) into world by carYaw:
  // forward (+Z local) -> (sin(carYaw), cos(carYaw))
  // left    (+X local) -> (cos(carYaw), -sin(carYaw))
  const sinC = Math.sin(carYaw);
  const cosC = Math.cos(carYaw);
  const eyeX = vx + cosC * lx + sinC * lz;
  const eyeY = vy + ly;
  const eyeZ = vz - sinC * lx + cosC * lz;

  // Driver look direction combines carYaw + cockpitYaw + subtle steering look-into-apex
  const apexLook = Math.abs(camState.cockpitYaw) < 0.18 ? -steer * Math.min(1, Math.abs(speed) / 14) * 0.08 : 0;
  const totalYaw = carYaw + camState.cockpitYaw + apexLook;
  const totalPitch = clamp(camState.cockpitPitch - bodyPitch * 0.65, -1.1, 1.0);

  const cosP = Math.cos(totalPitch);
  const sinP = Math.sin(totalPitch);
  const lookDist = 18;

  return {
    eye: { x: eyeX, y: eyeY, z: eyeZ },
    look: {
      x: eyeX + Math.sin(totalYaw) * cosP * lookDist,
      y: eyeY + sinP * lookDist,
      z: eyeZ + Math.cos(totalYaw) * cosP * lookDist,
    },
    roll: clamp(bodyRoll * 0.5, -0.05, 0.05),
  };
}

/**
 * Compute world-space camera pose for live 3D planar car mirrors ('rear', 'left', 'right').
 * Combined with horizontally mirrored UVs on the mirror glass plane, this produces true
 * optical reflections (left lane appears on the left side of the mirror, right lane on the right).
 */
export function computeMirrorCameraPose(which, {
  vx, vy, vz, carYaw, bodyPitch = 0, bodyRoll = 0,
  mirrorAnchors = null,
}) {
  const anchors = mirrorAnchors || {
    rear:  { x: 0,     y: 1.24, z: -1.35 },
    left:  { x: 0.98,  y: 0.92, z: 0.25 },
    right: { x: -0.98, y: 0.92, z: 0.25 },
  };
  const a = anchors[which] || anchors.rear;

  const sinC = Math.sin(carYaw);
  const cosC = Math.cos(carYaw);
  const posX = vx + cosC * a.x + sinC * a.z;
  const posY = vy + a.y + bodyRoll * a.x * 0.35 - bodyPitch * a.z * 0.35;
  const posZ = vz - sinC * a.x + cosC * a.z;

  // At carYaw = 0 (forward = +Z, left = +X):
  //   sin(PI - d) = +sin(d) (+X, outward-left), sin(PI + d) = -sin(d) (-X, outward-right)
  const splay = which === 'left' ? -0.15 : which === 'right' ? 0.15 : 0;
  const yaw = carYaw + Math.PI + splay;
  const pitch = (which === 'rear' ? -0.025 : -0.045) + bodyPitch * 0.65;
  const fov = which === 'rear' ? 48 : 42;

  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const dist = 24;

  return {
    pos: { x: posX, y: posY, z: posZ },
    look: {
      x: posX + Math.sin(yaw) * cosP * dist,
      y: posY + sinP * dist,
      z: posZ + Math.cos(yaw) * cosP * dist,
    },
    roll: clamp(-bodyRoll * 0.5, -0.05, 0.05),
    fov,
  };
}

