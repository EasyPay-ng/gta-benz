import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return nextResolve(new URL('../vendor/three.module.min.js', '${import.meta.url}').href, context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`);

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
    roundRect: noop,
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
  return { width: w, height: h, getContext: () => ctx };
}

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return {};
  },
};

test('All 11 vehicles build unique bespoke 3D interiors with 11 distinct wheels & gauge clusters', async () => {
  const { VEHICLE_MODELS } = await import('../src/data.js');
  const { buildCarMesh } = await import('../src/vehicles.js');

  const models = Object.keys(VEHICLE_MODELS);
  assert.equal(models.length, 11);

  const seenStyles = new Set();
  const seenWheels = new Set();
  const seenClusters = new Set();
  const seenPrimaryProps = new Set();

  for (const id of models) {
    const parts = buildCarMesh(id, '#2563eb', { withInterior: true, livery: 'clean', rims: 'silver', underglow: 'none' });
    const cp = parts.cockpit;
    assert.ok(cp, `${id} has a 3D cockpit`);
    assert.equal(cp.styleId, id, `${id} exposes matching styleId`);
    assert.ok(cp.wheelType, `${id} exposes bespoke wheelType`);
    assert.ok(cp.clusterTheme, `${id} exposes bespoke clusterTheme`);
    assert.ok(Array.isArray(cp.signatureProps) && cp.signatureProps.length >= 1, `${id} has signature 3D interior props`);

    seenStyles.add(cp.styleId);
    seenWheels.add(cp.wheelType);
    seenClusters.add(cp.clusterTheme);
    seenPrimaryProps.add(cp.signatureProps.join('|'));

    // Exercise bespoke 12 Hz instrument cluster & center console rendering
    cp.setSteer(0.45, 0.8, 0.2);
    cp.updateScreens({
      speedKmh: 118,
      gearLabel: 'D4',
      rpmFrac: 0.72,
      fuel: 84,
      hp: 96,
      x: 15,
      z: -195,
      yaw: 0.4,
      nightFactor: 0.85,
    });
  }

  assert.equal(seenStyles.size, 11, '11 unique interior styleIds');
  assert.equal(seenWheels.size, 11, '11 unique steering wheel designs across all 11 vehicles');
  assert.equal(seenClusters.size, 11, '11 unique instrument cluster themes across all 11 vehicles');
  assert.equal(seenPrimaryProps.size, 11, '11 unique signature 3D interior props across all 11 vehicles');
});

test('Metro Grand University provides 1,105 real-world academic courses across 12 faculties with open enrollment, exams & pay boosts', async () => {
  const Eco = await import('../src/economy.js');
  const Uni = await import('../src/university.js');

  assert.ok(Uni.UNIVERSITY_COURSES.length >= 1000, `Expected >= 1000 courses, got ${Uni.UNIVERSITY_COURSES.length}`);
  assert.equal(Uni.UNIVERSITY_FACULTIES.length, 12);

  const ids = new Set();
  const codes = new Set();
  for (const c of Uni.UNIVERSITY_COURSES) {
    assert.ok(!ids.has(c.id), `duplicate course id ${c.id}`);
    assert.ok(!codes.has(c.code), `duplicate course code ${c.code}`);
    ids.add(c.id);
    codes.add(c.code);
  }

  // Instant search across recognizable real-world disciplines
  for (const term of ['Computer Science', 'Medicine', 'Law', 'Artificial Intelligence', 'Nursing', 'Cybersecurity', 'Architecture', 'Finance']) {
    const found = Uni.searchCourses({ query: term });
    assert.ok(found.total >= 1, `Expected real courses matching "${term}"`);
  }

  // Open Enrollment & Free Major Switching + Lectures + Final Exam + Graduation Gown Unlock + Job/Startup Boosts
  const state = Eco.createInitialState();
  state.cash = 5000;

  const csBsc = Uni.searchCourses({ query: 'BSc Computer Science', facultyId: 'cs', degreeId: 'bachelor' }).items[0];
  const lawCert = Uni.searchCourses({ facultyId: 'law', degreeId: 'cert' }).items[0];
  assert.ok(csBsc && lawCert);

  // Free certificate enrollment ($0)
  const rFree = Uni.enrollCourse(state, lawCert.id);
  assert.equal(rFree.ok, true);
  assert.equal(state.cash, 5000);
  assert.equal(state.academic.activeCourseId, lawCert.id);

  // Paid Bachelor's enrollment ($280) + switching back & forth for $0
  const rPaid = Uni.enrollCourse(state, csBsc.id);
  assert.equal(rPaid.ok, true);
  assert.equal(state.cash, 5000 - csBsc.tuition);

  const rSwitchBack = Uni.enrollCourse(state, lawCert.id);
  assert.equal(rSwitchBack.ok, true);
  assert.equal(rSwitchBack.tuitionPaid, 0);
  assert.equal(Uni.enrollCourse(state, csBsc.id).tuitionPaid, 0);

  // Earn required credits via campus lecture + research study
  const lec = Uni.attendLecture(state, { courseId: csBsc.id, inGameMs: 8 * 3600_000, onCampus: true });
  assert.equal(lec.ok, true);
  assert.ok(lec.stipend > 0);
  while ((state.academic.creditsByCourse[csBsc.id] || 0) < csBsc.creditsRequired) {
    assert.equal(Uni.studySession(state, { mode: 'library' }).ok, true);
  }

  // Pass the 3-question faculty final exam
  const qs = Uni.getExamQuestions(csBsc.id);
  assert.equal(qs.length, 3);
  assert.ok(qs[0].q && qs[0].options.length === 4);
  const winningAnswers = qs.map((q) => q.correctIndex);
  const examRes = Uni.submitCourseExam(state, csBsc.id, winningAnswers, 2);
  assert.equal(examRes.ok, true);
  assert.equal(examRes.passed, true);
  assert.ok(state.academic.completedIds.includes(csBsc.id));
  assert.ok(state.academic.gpa >= 3.8);
  assert.equal(state.academic.transcript[0].honours, 'Summa Cum Laude');

  // Verify Graduation Gown & Mortarboard Cap unlocked automatically in Wardrobe
  assert.ok(state.wardrobe.includes('top:gown'));
  assert.ok(state.wardrobe.includes('hat:mortarboard'));

  // Verify permanent occupation & startup multipliers apply in economy.js
  assert.ok(Uni.academicJobMultiplier(state, 'engineer') > 1.1);
  assert.ok(Uni.academicBusinessMultiplier(state, 'tech') > 1.05);

  Eco.buyLot(state, 'tech');
  state.businesses.tech.employees.push(state.citizens[0].id);
  state.citizens[0].employer = 'tech';
  const baseNums = Eco.businessDailyNumbers('tech', state.businesses.tech, null);
  const boostedNums = Eco.businessDailyNumbers('tech', state.businesses.tech, state);
  assert.ok(boostedNums.revenue > baseNums.revenue, 'Graduated CS degree boosts PixelForge Tech Hub revenue');
});

test('Walk-In 3D University Campus allows walking through open doorways into Rotunda, Library & Science Hall and clamps indoor ceiling', async () => {
  const THREE = await import('three');
  const { DEFAULT_APPEARANCE } = await import('../src/data.js');
  const { City, resolveCircle, CURB_Y } = await import('../src/world.js');
  const { Character } = await import('../src/character.js');

  const scene = new THREE.Scene();
  const city = new City(scene);
  city.rebuildColliderCache();

  assert.equal(city.universitySpots.length, 5);
  assert.ok(city.lectureBoard, '3D live Amphitheatre smartboard exists');

  // Walk a player (r = 0.38m) straight through each building's South doorway (z = -194)
  for (const doorX of [0, -57, 57]) {
    for (let z = -190; z >= -199; z -= 0.5) {
      const step = resolveCircle(doorX, z, 0.38, city.colliderCache);
      assert.equal(step.hit, false, `Player walks cleanly through open doorway at x=${doorX}, z=${z}`);
    }
  }

  // Solid front wall away from doorway blocks walking through walls
  const wallHit = resolveCircle(-20, -194, 0.38, city.colliderCache);
  assert.equal(wallHit.hit, true, 'Solid exterior stone wall blocks walking outside doorway');

  // Indoor ceilingY is active inside all 3 halls and null outdoors on the Quad
  assert.ok(city.ceilingY(0, -210) > CURB_Y + 7.5, 'Main Rotunda reports indoor ceiling height');
  assert.ok(city.ceilingY(-57, -210) > CURB_Y + 6.5, 'West Grand Library reports indoor ceiling height');
  assert.ok(city.ceilingY(57, -210) > CURB_Y + 6.5, 'East Science Hall reports indoor ceiling height');
  assert.equal(city.ceilingY(0, -175), null, 'Outdoor Honor Quad has no indoor ceiling');

  // 3D Graduation Convocation Gown & Mortarboard Cap build cleanly on Character
  const gradChar = new Character({ ...DEFAULT_APPEARANCE, topStyle: 'gown', hatStyle: 'mortarboard' });
  assert.ok(gradChar.group.children.length > 0);
  gradChar.dispose();
});
