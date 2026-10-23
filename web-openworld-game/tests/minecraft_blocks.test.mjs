import test from 'node:test';
import assert from 'node:assert/strict';

/** Tiny recording canvas so the pixel painter can run without a DOM. */
function recordingCanvas() {
  const pixels = new Map();
  let fillStyle = '#000000';
  const ctx = {
    get fillStyle() { return fillStyle; },
    set fillStyle(v) { fillStyle = v; },
    fillRect(x, y, w, h) {
      for (let iy = 0; iy < h; iy++) {
        for (let ix = 0; ix < w; ix++) pixels.set(`${x + ix},${y + iy}`, fillStyle);
      }
    },
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  canvas.pixels = pixels;
  return canvas;
}

// ---------------------------------------------------------------------------
// 1. The block catalog
// ---------------------------------------------------------------------------
test('Blocks: Minecraft catalog with 1 m cubes, palettes for every face', async () => {
  const { BUILD_ITEMS, BLOCK_ART, BLOCK_SIZE } = await import('../src/data.js');
  const blocks = BUILD_ITEMS.filter((i) => i.cat === 'block');
  assert.ok(blocks.length >= 12, `voxel block palette (${blocks.length})`);
  assert.equal(BLOCK_SIZE, 1);

  const ids = new Set();
  for (const b of blocks) {
    assert.ok(!ids.has(b.id), `${b.id} is unique`);
    ids.add(b.id);
    assert.equal(b.grid, BLOCK_SIZE, `${b.id} snaps to a 1 m grid`);
    assert.ok(b.icon && b.name.length > 3);
    const art = BLOCK_ART[b.block];
    assert.ok(art, `${b.id} has pixel art`);
    for (const face of ['top', 'side', 'bottom']) {
      assert.ok(art[face], `${b.id} ${face} palette`);
      assert.match(art[face].base, /^#[0-9a-f]{6}$/i);
    }
  }
  // the classics are all here
  for (const kind of ['grass', 'dirt', 'stone', 'cobble', 'planks', 'log', 'brick', 'sand', 'glass']) {
    assert.ok(BLOCK_ART[kind], `${kind} block art`);
  }
  // wool comes in a full colour range
  assert.ok(blocks.filter((b) => b.block.startsWith('wool_')).length >= 5);
});

// ---------------------------------------------------------------------------
// 2. Placement: snapping, stacking, collision & walkable tops
// ---------------------------------------------------------------------------
test('Blocks: snap to the 1 m grid, stack in a column and become walkable tops', async () => {
  const B = await import('../src/build.js');
  const { BUILD_ITEMS } = await import('../src/data.js');
  const stone = B.itemById('block_stone');
  assert.ok(stone);
  assert.equal(B.isBlock('block_stone'), true);
  assert.equal(B.isBlock('wall_solid'), false);
  assert.equal(B.gridFor(stone), 1);
  assert.deepEqual(B.snapPlacement(stone, 2.4, -3.6, 0.2), { x: 2, z: -4, y: 0.2 });

  const build = B.createBuildState();
  const a = B.addPiece(build, 'block_grass', { x: 2, z: -4, y: 0, rot: 0 });
  assert.ok(a.ok);
  const b = B.addPiece(build, 'block_stone', { x: 2, z: -4, y: 1, rot: 0 });
  assert.equal(b.ok, true, 'a second block stacks on top');
  const dup = B.addPiece(build, 'block_stone', { x: 2, z: -4, y: 1, rot: 0 });
  assert.equal(dup.ok, false, 'the same cell cannot be filled twice');

  // each cube is exactly 1 × 1 m
  const box = B.pieceAabb(build.pieces[0]);
  assert.equal(box.maxX - box.minX, 1);
  assert.equal(box.maxZ - box.minZ, 1);

  // solid between its base and its top, walkable on top
  assert.equal(B.collidersNear(build, 0.5).length, 1, 'the ground block blocks a walking body');
  assert.equal(B.collidersNear(build, 1.5).length, 1, 'the upper block blocks a body standing at 1.5 m');
  const surfaces = B.walkSurfaces(build);
  assert.equal(surfaces.length, 2, 'both block tops are surfaces');
  assert.deepEqual(surfaces.map((s) => s.y).sort(), [1, 2]);
  assert.equal(B.supportAt(surfaces, 2, -4, 1.0), 1, 'you stand on the first block');
  assert.equal(B.supportAt(surfaces, 2, -4, 2.0), 2, 'and then on the second');
  assert.equal(B.supportAt(surfaces, 20, 20, 2.0), 0, 'the ground is elsewhere');

  const stats = B.summary(build);
  assert.equal(stats.blocks, 2);
  assert.equal(stats.structure, 0);
  assert.equal(stats.total, 2);

  // saves round-trip and unknown block ids are dropped
  const snap = B.serializeBuild(build);
  const restored = B.normalizeBuildState(snap);
  assert.equal(restored.pieces.length, 2);
  assert.equal(restored.pieces[0].item, 'block_grass');
  const hostile = B.normalizeBuildState({ pieces: [{ item: 'block_made_up', x: 0, y: 0, z: 0 }] });
  assert.equal(hostile.pieces.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Pixel-art painter
// ---------------------------------------------------------------------------
test('Blocks: every face paints a full 16×16 pixel texture', async () => {
  const { paintPixels, PIXEL } = await import('../src/pixelart.js');
  const { BLOCK_ART } = await import('../src/data.js');
  assert.equal(PIXEL, 16);
  for (const [kind, art] of Object.entries(BLOCK_ART)) {
    for (const face of ['top', 'side', 'bottom']) {
      const canvas = recordingCanvas();
      const out = paintPixels(art[face], `${kind}:${face}`, () => canvas);
      assert.equal(out, canvas);
      assert.equal(canvas.width, 16);
      assert.equal(canvas.pixels.size, 256, `${kind}:${face} fills every pixel`);
      for (const [, color] of canvas.pixels) assert.match(color, /^#[0-9a-f]{6}$/i);
    }
  }
});

test('Blocks: grass has a green crown, bricks have mortar rows, textures are deterministic', async () => {
  const { paintPixels } = await import('../src/pixelart.js');
  const { BLOCK_ART } = await import('../src/data.js');
  const paint = (spec, seed) => {
    const canvas = recordingCanvas();
    paintPixels(spec, seed, () => canvas);
    return canvas.pixels;
  };
  const greenish = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 8) & 255) > ((n >> 16) & 255) + 8;
  };
  const grassSide = paint(BLOCK_ART.grass.side, 'grass:side');
  for (let x = 0; x < 16; x++) {
    assert.ok(greenish(grassSide.get(`${x},0`)), 'top row of grass is green');
    assert.ok(!greenish(grassSide.get(`${x},15`)), 'bottom row is dirt');
  }

  const brick = paint(BLOCK_ART.brick.side, 'brick:side');
  const mortar = '#c9b8a8';
  for (const y of [3, 7, 11, 15]) {
    assert.equal(brick.get(`2,${y}`), mortar, `mortar course at y=${y}`);
  }

  const a = paint(BLOCK_ART.stone.side, 'stone:side');
  const b = paint(BLOCK_ART.stone.side, 'stone:side');
  assert.deepEqual([...a.entries()], [...b.entries()], 'same seed produces the same texture');
  const c = paint(BLOCK_ART.stone.side, 'stone:other');
  assert.notDeepEqual([...a.values()], [...c.values()], 'a different seed shifts the speckles');

  // glass is light and see-through-looking, obsidian is dark
  const glass = paint(BLOCK_ART.glass.side, 'glass:side');
  assert.ok([...glass.values()].filter((v) => parseInt(v.slice(1), 16) > 0xcccccc).length > 100);
  const obsidian = paint(BLOCK_ART.obsidian.side, 'obsidian:side');
  assert.ok([...obsidian.values()].every((v) => parseInt(v.slice(1), 16) < 0x606060));
});

test('Blocks: architectural pieces wear tinted pixel patterns', async () => {
  const { PIECE_ART, paintPixels } = await import('../src/pixelart.js');
  for (const key of ['brick', 'cobble', 'planks', 'stone']) {
    assert.ok(PIECE_ART[key], `${key} piece texture`);
    assert.match(PIECE_ART[key].base, /^#[0-9a-f]{6}$/i);
    const canvas = recordingCanvas();
    paintPixels(PIECE_ART[key], `piece:${key}`, () => canvas);
    assert.equal(canvas.pixels.size, 256);
    // grey palettes stay grey so the player's colour tints cleanly
    for (const [, color] of canvas.pixels) {
      const n = parseInt(color.slice(1), 16);
      const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 4, `${key} is neutral grey`);
    }
  }
});

test('Blocks: a jump clears one 1 m cube so columns can be climbed', async () => {
  const { JUMP_VELOCITY, JUMP_GRAVITY, BLOCK_SIZE } = await import('../src/data.js');
  const apex = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * JUMP_GRAVITY);
  assert.ok(apex > BLOCK_SIZE, `jump apex ${apex.toFixed(2)} m clears a ${BLOCK_SIZE} m block`);
  assert.ok(apex < 1.4, 'and you still cannot hop onto a whole storey');
});
