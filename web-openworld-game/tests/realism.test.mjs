import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Map bare 'three' specifier to the vendored Three.js module (matching index.html importmap)
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return nextResolve(new URL('../vendor/three.module.min.js', '${import.meta.url}').href, context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`);

// Minimal 2D canvas shim so procedural PBR textures & signs execute cleanly in Node
function makeCanvas(w = 256, h = 256) {
  const data = new Uint8ClampedArray(w * h * 4);
  const noop = () => {};
  const grad = () => ({ addColorStop: noop });
  const ctx = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '16px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: noop,
    clearRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    rect: noop,
    clip: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    createLinearGradient: grad,
    createRadialGradient: grad,
    createImageData: (iw, ih) => ({ data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih }),
    getImageData: (_x, _y, iw, ih) => ({ data: data.subarray(0, iw * ih * 4), width: iw, height: ih }),
    putImageData: noop,
  };
  return {
    width: w,
    height: h,
    getContext: () => ctx,
  };
}

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return {};
  },
};

test('Character rig: sculpted limbs, biomechanical locomotion, jump physics & all 8 emotes', async () => {
  const { DEFAULT_APPEARANCE, EMOTES } = await import('../src/data.js');
  const { Character } = await import('../src/character.js');

  const ch = new Character(DEFAULT_APPEARANCE);
  assert.ok(ch.group && ch.armL && ch.armR && ch.legL && ch.legR);
  assert.ok(ch.foreArmL && ch.foreArmR && ch.shinL && ch.shinR, '2-segment elbows and knees exist');

  // Walk & sprint animation
  ch.animate(0.05, 3.8);
  ch.animate(0.05, 7.2);

  // Jump physics rises off ground and lands cleanly
  assert.equal(ch.triggerJump(), true);
  assert.equal(ch.isAirborne(), true);
  ch.animate(0.12, 3.8);
  assert.ok(ch.jumpY > 0.1, `expected jumpY > 0.1 while airborne, got ${ch.jumpY}`);
  for (let i = 0; i < 30; i++) ch.animate(0.05, 0);
  assert.equal(ch.isAirborne(), false);
  assert.equal(ch.jumpY, 0);

  // Every defined emote executes without error
  for (const def of EMOTES) {
    assert.equal(ch.setEmote(def.id), true, `setEmote(${def.id})`);
    ch.animate(0.1, 0);
  }
  ch.clearEmote();
  assert.equal(ch.emote, null);

  // Exercise every unique 3D Boutique garment, shoe, hat, eyewear & chain
  const { CLOTHING_ITEMS } = await import('../src/data.js');
  for (const [slot, items] of Object.entries(CLOTHING_ITEMS)) {
    for (const item of Object.values(items)) {
      ch.setAppearance({ ...DEFAULT_APPEARANCE, [item.field]: item.id });
      ch.animate(0.05, 3.5);
    }
    void slot;
  }
  // Verify Senator tunic adds 3D tunic skirt + gold embroidery and Crown adds gold circlet + gems
  ch.setAppearance({
    ...DEFAULT_APPEARANCE,
    topStyle: 'senator',
    bottomStyle: 'shorts',
    shoeStyle: 'loafers',
    hatStyle: 'crown',
    glasses: 'gold_shades',
    chain: 'gold',
  });
  assert.ok(ch.topExtras.children.length >= 3, 'Senator tunic populates 3D skirt & gold embroidery');
  assert.ok(ch.hatGroup.children.length >= 7, 'Crown populates 3D gold band, spikes & gems');
  assert.ok(ch.faceExtras.children.length >= 5, 'Gold shades populate lenses, gold rims & bridge');
  assert.equal(ch.neckExtras.children.length, 2, 'Gold Cuban chain + medallion populated');
  ch.dispose();
});

test('Vehicles: sculpted PBR meshes for all 11 models, custom mods, scorched wreck rig & PoliceCar pursuit AI', async () => {
  const THREE = await import('three');
  const { VEHICLE_MODELS } = await import('../src/data.js');
  const { buildCarMesh, Vehicle, TrafficCar, PoliceCar, setVehicleNightFactor } = await import('../src/vehicles.js');
  const { mulberry32 } = await import('../src/economy.js');

  const scene = new THREE.Scene();
  const modelIds = Object.keys(VEHICLE_MODELS);
  assert.equal(modelIds.length, 11, '11 distinct vehicle models registered');
  for (const modelId of modelIds) {
    const parts = buildCarMesh(modelId, '#2563eb', {
      livery: 'gold_trim',
      rims: 'gold',
      underglow: 'cyan',
    });
    assert.equal(parts.wheels.length, 4, `${modelId} has 4 sculpted 5-spoke wheels`);
    assert.ok(parts.paint.isMeshPhysicalMaterial, `${modelId} uses clearcoat MeshPhysicalMaterial`);
    assert.equal(parts.underglowMesh.visible, true, `${modelId} cyan neon underglow active`);
    parts.applyMods({ color: '#111827', livery: 'carbon_hood', rims: 'black', underglow: 'none' });
    assert.equal(parts.underglowMesh.visible, false, `${modelId} underglow toggles off cleanly`);
    assert.ok(parts.headBeams && parts.brakeMat);
  }

  setVehicleNightFactor(0.9);
  const v = new Vehicle(scene, { id: 'v1', model: 'sports', color: '#dc2626', x: 0, z: 0, yaw: 0 });
  v.update(0.05, { throttle: 1, steer: 0.4, handbrake: true }, [], []);
  v.syncMesh(0, 0.05);
  v.setScorched(true);
  assert.equal(v.smoke.visible, true);
  v.syncMesh(0, 0.05);
  v.setScorched(false);
  assert.equal(v.smoke.visible, false);

  const cop = new PoliceCar(scene, true);
  cop.spawnNear(10, 10);
  for (let i = 0; i < 10; i++) cop.update(0.05, { x: 0, z: 0 }, 2, [], 0);
  assert.equal(cop.circles()[0].tag, 'police');

  const traffic = new TrafficCar(scene, mulberry32(7));
  traffic.update(0.05, []);

  v.dispose();
  cop.dispose();
});

test('World & StreetFX: PBR City, SkyDome shader, tyre skid marks, crash sparks & explosions', async () => {
  const THREE = await import('three');
  const { City } = await import('../src/world.js');
  const { StreetFX } = await import('../src/fx.js');
  const { Vehicle } = await import('../src/vehicles.js');
  const { setupRealisticAtmosphere } = await import('../src/textures.js');
  const Time = await import('../src/time.js');

  const scene = new THREE.Scene();
  const city = new City(scene);
  city.setDayNight(0.85, 1.0, 0, 0);
  city.update(1.5);
  assert.ok(city.colliders.length > 40, 'city static colliders populated');
  assert.equal(city.streetLamps.length, 25, '25 streetlamps built');
  assert.equal(city.boutiqueDisplays.length, 3, 'Maison Verve Boutique has 3 display pedestals');

  const atmo = setupRealisticAtmosphere(null, scene);
  atmo.update(Time.lightingAt(19 * 3600_000), 2.5, 10, -10);
  assert.ok(atmo.skyMesh.isMesh);

  const fx = new StreetFX(scene);
  const v = new Vehicle(scene, { id: 'v2', model: 'sedan', color: '#f59e0b', x: 0, z: 0, yaw: 0 });
  v.speed = 16;
  v.drifting = true;
  fx.trackVehicleSkids(v, 0.05, 0);
  v.x += 1.2;
  fx.trackVehicleSkids(v, 0.05, 0);
  assert.ok(fx.skidCursor >= 2, 'twin tyre skid marks laid down');

  fx.spawnSparks(0, 0.6, 0, 18, 1.4);
  fx.spawnExplosion(2, 0, 2);
  assert.ok(fx.scorchCursor >= 1, 'explosion scorched the asphalt');
  assert.ok(fx.explosions.length >= 1, 'explosion shockwave & fireball spawned');
  for (let i = 0; i < 45; i++) fx.update(0.05);
  assert.equal(fx.explosions.length, 0, 'explosion cleans up after lifetime');
});

test('First-Person Character Rig & Sleek 3D Car Cockpit Interiors across all 11 models', async () => {
  const THREE = await import('three');
  const { DEFAULT_APPEARANCE, VEHICLE_MODELS } = await import('../src/data.js');
  const { Character } = await import('../src/character.js');
  const { Vehicle } = await import('../src/vehicles.js');
  const { createCameraState, computeCockpitCameraPose } = await import('../src/camera.js');

  // 1. Character first-person toggles head/collar while keeping body, chains, arms & shoes visible
  const ch = new Character({
    ...DEFAULT_APPEARANCE,
    topStyle: 'suit',
    hatStyle: 'fedora',
    glasses: 'aviators',
    chain: 'gold',
  });
  assert.equal(ch.headGroup.visible, true);
  assert.equal(ch.collar.visible, true);
  ch.setFirstPerson(true);
  assert.equal(ch.firstPerson, true);
  assert.equal(ch.headGroup.visible, false, 'head, hat & glasses hidden in first-person');
  assert.equal(ch.collar.visible, false, 'neck collar hidden to prevent eye-level clipping');
  assert.equal(ch.torso.visible, true, 'torso remains visible when looking down');
  assert.equal(ch.armL.visible, true, 'arms remain visible when walking');
  assert.equal(ch.legL.visible, true, 'legs & shoes remain visible');
  ch.setFirstPerson(false);
  assert.equal(ch.headGroup.visible, true, 'head restored when returning to third-person');
  assert.equal(ch.collar.visible, true);
  ch.dispose();

  // 2. Every one of the 11 vehicle models has a sleek 3D interior, rotating wheel, driver hands & live displays
  const scene = new THREE.Scene();
  const camState = createCameraState('first');
  for (const modelId of Object.keys(VEHICLE_MODELS)) {
    const v = new Vehicle(scene, { id: `ck_${modelId}`, model: modelId, color: '#2563eb', x: 0, z: 0, yaw: 0 });
    assert.ok(v.parts.cockpit, `${modelId} builds 3D cockpit rig`);

    if (modelId === 'roadster') {
      assert.equal(v.parts.cockpit.group.visible, true, 'open-top roadster shows 3D interior even from outside');
    } else {
      assert.equal(v.parts.cockpit.group.visible, false, `${modelId} hides heavy cockpit meshes while outside`);
      assert.equal(v.parts.exteriorCabin.visible, true, `${modelId} shows frosted exterior cabin while outside`);
    }

    // Switch into Inside Cockpit View
    v.setCockpitView(true, { skin: '#8d5524', shirt: '#ec4899' });
    assert.equal(v.cockpitView, true);
    assert.equal(v.parts.cockpit.group.visible, true, `${modelId} 3D interior visible in cockpit view`);
    assert.equal(v.parts.cockpit.driverHands.visible, true, `${modelId} 3D driver hands & cuffs visible on wheel`);
    if (modelId !== 'roadster') {
      assert.equal(v.parts.exteriorCabin.visible, false, `${modelId} frosted exterior cabin hidden in cockpit view`);
    }

    // Steering right (+steer) rotates steering wheel clockwise (+Z in local car frame)
    v.steer = 0.45;
    v.speed = 24;
    v.syncMesh(0, 0.05);
    assert.ok(v.parts.cockpit.steerWheel.rotation.z > 0.5, `${modelId} steering wheel rotates clockwise on right turn`);

    // Live 12 Hz OLED instrument cluster + GPS street-radar infotainment canvas update
    v.updateCockpit(0.12, {
      clockHHMM: '21:30',
      waypoint: { x: 40, z: 80 },
    });

    // Verify driver eye pose sits cleanly inside cabin bounds above dashboard & below roof
    const pose = computeCockpitCameraPose(camState, {
      vx: v.x,
      vy: v.y,
      vz: v.z,
      carYaw: v.yaw,
      bodyPitch: v.parts.body.rotation.x,
      bodyRoll: v.parts.body.rotation.z,
      driverEye: v.parts.cockpit.driverEye,
      speed: v.speed,
      steer: v.steer,
      elapsed: 1.0,
      dt: 0.05,
    });
    assert.ok(pose.eye.x > 0.25, `${modelId} driver eye sits on left-hand (+X) seat`);
    assert.ok(pose.eye.y > 0.7 && pose.eye.y < 2.2, `${modelId} driver eye height (${pose.eye.y.toFixed(2)}m) sits cleanly inside cabin`);

    // Switch back to Outside Chase View
    v.setCockpitView(false);
    assert.equal(v.cockpitView, false);
    assert.equal(v.parts.cockpit.driverHands.visible, false);
    if (modelId !== 'roadster') {
      assert.equal(v.parts.cockpit.group.visible, false);
      assert.equal(v.parts.exteriorCabin.visible, true);
    }
    v.dispose();
  }
});

