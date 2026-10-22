// MetroVenture 3D — procedural PBR textures, normal maps, soft FX sprites, sky dome & reflections.
// Zero external image assets: everything generates deterministically at boot in ~80 ms.
import * as THREE from 'three';
import { mulberry32 } from './economy.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function wrapTex(canvas, { srgb = true, repeatX = 1, repeatY = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = aniso;
  return t;
}

/** Convert a `Float32Array` heightfield (`w * h`, values 0..1) into a seamless tangent-space normal map. */
function heightToNormalCanvas(heights, w, h, strength = 2.6) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const at = (x, y) => heights[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1); const t = at(x, y - 1); const tr = at(x + 1, y - 1);
      const l  = at(x - 1, y);                             const r  = at(x + 1, y);
      const bl = at(x - 1, y + 1); const b = at(x, y + 1); const br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const nx = -dx * inv;
      const ny = -dy * inv;
      const nz = inv;
      const idx = (y * w + x) * 4;
      d[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Tileable value noise on a periodic `grid` lattice. */
function makeTileNoise(seed, grid = 16) {
  const rand = mulberry32(seed);
  const table = new Float32Array(grid * grid);
  for (let i = 0; i < table.length; i++) table[i] = rand();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const gx = ((u % 1) + 1) % 1 * grid;
    const gy = ((v % 1) + 1) % 1 * grid;
    const x0 = Math.floor(gx); const y0 = Math.floor(gy);
    const fx = smooth(gx - x0); const fy = smooth(gy - y0);
    const x1 = (x0 + 1) % grid; const y1 = (y0 + 1) % grid;
    const a = table[y0 * grid + x0];
    const b = table[y0 * grid + x1];
    const c = table[y1 * grid + x0];
    const d = table[y1 * grid + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

// ---------------------------------------------------------------------------
// 1. Weathered Asphalt PBR (aggregate grit + tyre-polished lanes + tar cracks)
// ---------------------------------------------------------------------------
export function makeAsphaltPBR(seed = 101) {
  const S = 256;
  const rand = mulberry32(seed);
  const nCoarse = makeTileNoise(seed + 1, 12);
  const nFine = makeTileNoise(seed + 2, 48);
  const diff = makeCanvas(S, S);
  const rough = makeCanvas(S, S);
  const dCtx = diff.getContext('2d');
  const rCtx = rough.getContext('2d');
  const dImg = dCtx.createImageData(S, S);
  const rImg = rCtx.createImageData(S, S);
  const heights = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const patch = nCoarse(u, v);
      const grit = nFine(u, v) * 0.55 + rand() * 0.45;
      // Subtle polished wheel-rut sheen along two lane tracks
      const rutL = Math.exp(-(((u - 0.27) / 0.09) ** 2));
      const rutR = Math.exp(-(((u - 0.73) / 0.09) ** 2));
      const polish = Math.max(rutL, rutR) * 0.35;

      const base = 36 + patch * 13 + (grit - 0.5) * 18 - polish * 5;
      const idx = (y * S + x) * 4;
      dImg.data[idx]     = Math.max(18, Math.min(82, base));
      dImg.data[idx + 1] = Math.max(19, Math.min(84, base + 1));
      dImg.data[idx + 2] = Math.max(22, Math.min(90, base + 4));
      dImg.data[idx + 3] = 255;

      const rv = Math.max(95, Math.min(242, 212 - polish * 72 - patch * 24 + (grit - 0.5) * 24));
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
      heights[y * S + x] = 0.5 + (grit - 0.5) * 0.38 + patch * 0.15;
    }
  }
  dCtx.putImageData(dImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // Hairline tar-sealed cracks
  dCtx.strokeStyle = 'rgba(15, 17, 21, 0.58)';
  dCtx.lineWidth = 1.4;
  rCtx.strokeStyle = 'rgb(95, 95, 95)';
  rCtx.lineWidth = 2.0;
  for (let c = 0; c < 5; c++) {
    let cx = rand() * S;
    let cy = rand() * S;
    dCtx.beginPath(); rCtx.beginPath();
    dCtx.moveTo(cx, cy); rCtx.moveTo(cx, cy);
    for (let s = 0; s < 10; s++) {
      cx += (rand() - 0.48) * 22;
      cy += 10 + rand() * 16;
      dCtx.lineTo(cx, cy); rCtx.lineTo(cx, cy);
    }
    dCtx.stroke(); rCtx.stroke();
  }

  const norm = heightToNormalCanvas(heights, S, S, 2.1);
  return {
    map: wrapTex(diff),
    normalMap: wrapTex(norm, { srgb: false }),
    roughnessMap: wrapTex(rough, { srgb: false }),
  };
}

// ---------------------------------------------------------------------------
// 2. Irregular Slate / Cobblestone Flagstone Sidewalk (Payback-style stone pavers!)
// ---------------------------------------------------------------------------
export function makeFlagstonePBR(seed = 202) {
  const S = 256;
  const rand = mulberry32(seed);
  const N_CELLS = 34;
  const pts = [];
  for (let i = 0; i < N_CELLS; i++) {
    pts.push({
      u: rand(),
      v: rand(),
      tint: (rand() - 0.5) * 24,
      warm: (rand() - 0.4) * 10,
      tiltX: (rand() - 0.5) * 0.18,
      tiltY: (rand() - 0.5) * 0.18,
    });
  }
  const nGrain = makeTileNoise(seed + 9, 32);
  const diff = makeCanvas(S, S);
  const rough = makeCanvas(S, S);
  const dCtx = diff.getContext('2d');
  const rCtx = rough.getContext('2d');
  const dImg = dCtx.createImageData(S, S);
  const rImg = rCtx.createImageData(S, S);
  const heights = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const warpU = u + (nGrain(u * 2, v * 2) - 0.5) * 0.022;
      const warpV = v + (nGrain(v * 2 + 0.3, u * 2) - 0.5) * 0.022;
      let d1 = 9; let d2 = 9; let cell = pts[0]; let duBest = 0; let dvBest = 0;
      for (let i = 0; i < N_CELLS; i++) {
        const p = pts[i];
        let du = warpU - p.u;
        let dv = warpV - p.v;
        if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
        if (dv > 0.5) dv -= 1; else if (dv < -0.5) dv += 1;
        const d = Math.hypot(du, dv);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          cell = p;
          duBest = du;
          dvBest = dv;
        } else if (d < d2) {
          d2 = d;
        }
      }
      const edge = d2 - d1;
      const grain = nGrain(u * 3, v * 3);
      const bevel = Math.max(0, Math.min(1, (edge - 0.014) / 0.032));
      const mortar = bevel < 0.18;
      const idx = (y * S + x) * 4;

      if (mortar) {
        const mv = 26 + grain * 10;
        dImg.data[idx]     = mv;
        dImg.data[idx + 1] = mv - 1;
        dImg.data[idx + 2] = mv - 2;
        dImg.data[idx + 3] = 255;
        rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = 242;
        rImg.data[idx + 3] = 255;
        heights[y * S + x] = 0.06 + grain * 0.05;
      } else {
        const hStone = 0.35 + bevel * 0.52 + duBest * cell.tiltX + dvBest * cell.tiltY + (grain - 0.5) * 0.14;
        heights[y * S + x] = Math.max(0.12, Math.min(1, hStone));
        const base = 78 + cell.tint + bevel * 14 + (grain - 0.5) * 18;
        dImg.data[idx]     = Math.max(38, Math.min(148, base + cell.warm));
        dImg.data[idx + 1] = Math.max(36, Math.min(142, base + cell.warm * 0.4));
        dImg.data[idx + 2] = Math.max(34, Math.min(136, base - cell.warm * 0.3));
        dImg.data[idx + 3] = 255;
        const rv = Math.max(115, Math.min(225, 168 - bevel * 24 + (grain - 0.5) * 28));
        rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = rv;
        rImg.data[idx + 3] = 255;
      }
    }
  }
  dCtx.putImageData(dImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  const norm = heightToNormalCanvas(heights, S, S, 3.4);
  return {
    map: wrapTex(diff),
    normalMap: wrapTex(norm, { srgb: false }),
    roughnessMap: wrapTex(rough, { srgb: false }),
  };
}

// ---------------------------------------------------------------------------
// 3. Natural Dark Mottled Turf PBR
// ---------------------------------------------------------------------------
export function makeGrassPBR(seed = 303) {
  const S = 256;
  const rand = mulberry32(seed);
  const nPatch = makeTileNoise(seed + 1, 10);
  const nBlade = makeTileNoise(seed + 2, 44);
  const diff = makeCanvas(S, S);
  const dCtx = diff.getContext('2d');
  const dImg = dCtx.createImageData(S, S);
  const heights = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const patch = nPatch(u, v);
      const blade = nBlade(u, v) * 0.6 + rand() * 0.4;
      const idx = (y * S + x) * 4;
      dImg.data[idx]     = Math.round(34 + patch * 24 + blade * 16);
      dImg.data[idx + 1] = Math.round(64 + patch * 34 + blade * 26);
      dImg.data[idx + 2] = Math.round(26 + patch * 14 + blade * 12);
      dImg.data[idx + 3] = 255;
      heights[y * S + x] = 0.3 + blade * 0.55 + patch * 0.15;
    }
  }
  dCtx.putImageData(dImg, 0, 0);
  const norm = heightToNormalCanvas(heights, S, S, 2.2);
  return {
    map: wrapTex(diff),
    normalMap: wrapTex(norm, { srgb: false }),
  };
}

// ---------------------------------------------------------------------------
// 4. Curb Storm-Drain Grate Texture (seen along road curbs in Payback 2!)
// ---------------------------------------------------------------------------
export function makeStormDrainTexture() {
  const c = makeCanvas(128, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#1f2328';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#52525b';
  g.lineWidth = 6;
  g.strokeRect(4, 4, 120, 56);
  for (let x = 14; x < 114; x += 14) {
    g.fillStyle = '#090b0e';
    g.fillRect(x, 11, 8, 42);
    g.fillStyle = '#71717a';
    g.fillRect(x + 8, 9, 6, 46);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// 5. Realistic Architectural Building Facade PBR Sets (brick, limestone, glass, etc.)
// ---------------------------------------------------------------------------
export function makeFacadePBR(seed, {
  wallStyle = 'brick', // 'brick' | 'limestone' | 'curtain' | 'concrete' | 'terracotta'
  wallHex = '#8c4a38',
  mortarHex = '#3b2f2a',
  litHex = '#fde68a',
  frameHex = '#1e293b',
} = {}) {
  const S = 256;
  const rand = mulberry32(seed);
  const diff = makeCanvas(S, S);
  const emis = makeCanvas(S, S);
  const rough = makeCanvas(S, S);
  const dCtx = diff.getContext('2d');
  const eCtx = emis.getContext('2d');
  const rCtx = rough.getContext('2d');
  const heights = new Float32Array(S * S).fill(0.75);

  const wallCol = new THREE.Color(wallHex);
  dCtx.fillStyle = wallHex;
  dCtx.fillRect(0, 0, S, S);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, S, S);
  rCtx.fillStyle = wallStyle === 'curtain' ? 'rgb(65,65,65)' : 'rgb(215,215,215)';
  rCtx.fillRect(0, 0, S, S);

  if (wallStyle === 'brick' || wallStyle === 'terracotta') {
    dCtx.fillStyle = mortarHex;
    dCtx.fillRect(0, 0, S, S);
    heights.fill(0.35);
    const rows = 32;
    const cols = 16;
    const bh = S / rows;
    const bw = S / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (bw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const bx = c * bw + off + 1;
        const by = r * bh + 1;
        const jitter = (rand() - 0.5) * 0.14;
        const col = wallCol.clone().offsetHSL(0, (rand() - 0.5) * 0.05, jitter);
        dCtx.fillStyle = `#${col.getHexString()}`;
        dCtx.fillRect(bx, by, bw - 2, bh - 2);
        const y0 = Math.max(0, Math.floor(by));
        const y1 = Math.min(S, Math.floor(by + bh - 2));
        for (let py = y0; py < y1; py++) {
          for (let px = Math.floor(bx); px < Math.floor(bx + bw - 2); px++) {
            const wx = ((px % S) + S) % S;
            heights[py * S + wx] = 0.78 + jitter * 0.35;
          }
        }
      }
    }
  } else if (wallStyle === 'limestone' || wallStyle === 'concrete') {
    const blocksY = 8;
    const bh = S / blocksY;
    for (let r = 0; r < blocksY; r++) {
      const col = wallCol.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.06);
      dCtx.fillStyle = `#${col.getHexString()}`;
      dCtx.fillRect(0, r * bh + 2, S, bh - 3);
      dCtx.fillStyle = 'rgba(15, 23, 42, 0.25)';
      dCtx.fillRect(0, r * bh, S, 2);
      for (let x = 0; x < S; x += 64) dCtx.fillRect(x, r * bh, 2, bh);
    }
  } else if (wallStyle === 'curtain') {
    const grad = dCtx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, wallHex);
    grad.addColorStop(1, '#1e293b');
    dCtx.fillStyle = grad;
    dCtx.fillRect(0, 0, S, S);
  }

  // Horizontal floor cornice ledge every floor (4 floors per 256 tile)
  for (let fy = 0; fy < 4; fy++) {
    const ly = fy * 64;
    dCtx.fillStyle = 'rgba(15, 23, 42, 0.36)';
    dCtx.fillRect(0, ly + 58, S, 6);
    dCtx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    dCtx.fillRect(0, ly + 56, S, 2);
    for (let y = ly + 56; y < ly + 62; y++) {
      for (let x = 0; x < S; x++) heights[y * S + x] = 0.96;
    }
  }

  // 4×4 Recessed architectural windows with mullions, blinds & warm night glow
  for (let wy = 0; wy < 4; wy++) {
    for (let wx = 0; wx < 4; wx++) {
      const x = wx * 64 + 11;
      const y = wy * 64 + 10;
      const w = 42;
      const h = 42;
      const roll = rand();
      const nightLit = roll < 0.56;
      const dayLit = roll < 0.22;

      // Deep recessed window frame + stone sill
      dCtx.fillStyle = frameHex;
      dCtx.fillRect(x - 3, y - 3, w + 6, h + 6);
      dCtx.fillStyle = '#cbd5e1';
      dCtx.fillRect(x - 4, y + h + 1, w + 8, 4);

      // Glass pane gradient
      const gPane = dCtx.createLinearGradient(x, y, x + w, y + h);
      if (dayLit) {
        gPane.addColorStop(0, litHex);
        gPane.addColorStop(1, '#ca8a04');
      } else {
        gPane.addColorStop(0, '#1e3a5f');
        gPane.addColorStop(0.55, '#0f172a');
        gPane.addColorStop(1, '#334155');
      }
      dCtx.fillStyle = gPane;
      dCtx.fillRect(x, y, w, h);

      // Diagonal sky reflection + window mullions
      dCtx.fillStyle = 'rgba(255,255,255,0.18)';
      dCtx.beginPath();
      dCtx.moveTo(x + 3, y + 3);
      dCtx.lineTo(x + w * 0.55, y + 3);
      dCtx.lineTo(x + 3, y + h * 0.65);
      dCtx.closePath();
      dCtx.fill();

      // Mullion crossbars
      dCtx.fillStyle = frameHex;
      dCtx.fillRect(x + w / 2 - 1, y, 2, h);
      dCtx.fillRect(x, y + h * 0.45, w, 2);

      // Glass is ultra-smooth (low roughness) so it glints in sunlight & streetlamps!
      rCtx.fillStyle = 'rgb(28, 28, 28)';
      rCtx.fillRect(x, y, w, h);
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) heights[py * S + px] = 0.22;
      }

      if (nightLit) {
        const eg = eCtx.createLinearGradient(x, y, x, y + h);
        eg.addColorStop(0, litHex);
        eg.addColorStop(1, roll < 0.28 ? '#f59e0b' : '#bae6fd');
        eCtx.fillStyle = eg;
        const blindH = roll < 0.18 ? Math.round(h * 0.62) : h;
        eCtx.fillRect(x + 1, y + (h - blindH), w - 2, blindH - 1);
        eCtx.fillStyle = '#0f172a';
        eCtx.fillRect(x + w / 2 - 1, y, 2, h);
      }
    }
  }

  const norm = heightToNormalCanvas(heights, S, S, 2.5);
  return {
    map: wrapTex(diff),
    normalMap: wrapTex(norm, { srgb: false }),
    roughnessMap: wrapTex(rough, { srgb: false }),
    emissive: wrapTex(emis),
  };
}

// ---------------------------------------------------------------------------
// 6. Tree Bark & Leafy Foliage Textures
// ---------------------------------------------------------------------------
export function makeBarkPBR(seed = 404) {
  const S = 128;
  const rand = mulberry32(seed);
  const diff = makeCanvas(S, S);
  const g = diff.getContext('2d');
  const heights = new Float32Array(S * S);
  g.fillStyle = '#4a321f';
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x++) {
    const ridge = Math.sin((x / S) * Math.PI * 18) * 0.5 + 0.5;
    for (let y = 0; y < S; y++) {
      const n = rand() * 0.35 + ridge * 0.65;
      heights[y * S + x] = n;
      const v = Math.round(42 + n * 48);
      g.fillStyle = `rgb(${v + 16}, ${v}, ${Math.max(14, v - 14)})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  const norm = heightToNormalCanvas(heights, S, S, 2.8);
  return {
    map: wrapTex(diff, { repeatX: 2, repeatY: 2 }),
    normalMap: wrapTex(norm, { srgb: false, repeatX: 2, repeatY: 2 }),
  };
}

export function makeFoliagePBR(seed = 505, baseHex = '#2d5a27') {
  const S = 128;
  const rand = mulberry32(seed);
  const base = new THREE.Color(baseHex);
  const diff = makeCanvas(S, S);
  const g = diff.getContext('2d');
  g.fillStyle = baseHex;
  g.fillRect(0, 0, S, S);
  const heights = new Float32Array(S * S).fill(0.4);
  for (let i = 0; i < 420; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 4 + rand() * 8;
    const c = base.clone().offsetHSL((rand() - 0.5) * 0.05, (rand() - 0.5) * 0.1, (rand() - 0.45) * 0.16);
    g.fillStyle = `#${c.getHexString()}`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const px = ((Math.round(x + dx) % S) + S) % S;
        const py = ((Math.round(y + dy) % S) + S) % S;
        heights[py * S + px] = Math.min(1, heights[py * S + px] + 0.18);
      }
    }
  }
  const norm = heightToNormalCanvas(heights, S, S, 2.4);
  return {
    map: wrapTex(diff, { repeatX: 2, repeatY: 2 }),
    normalMap: wrapTex(norm, { srgb: false, repeatX: 2, repeatY: 2 }),
  };
}

// ---------------------------------------------------------------------------
// 7. Radial Soft Sprites (Headlights, Taillights, Fire, Smoke, Scorch, Skid)
// ---------------------------------------------------------------------------
let cachedSprites = null;

export function getFXTextures() {
  if (cachedSprites) return cachedSprites;

  const radial = (stops, size = 128) => {
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, col] of stops) rg.addColorStop(at, col);
    g.fillStyle = rg;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  // Twin tyre skid segment texture (soft edges)
  const skidCanvas = makeCanvas(64, 64);
  const sg = skidCanvas.getContext('2d');
  const lg = sg.createLinearGradient(0, 0, 64, 0);
  lg.addColorStop(0, 'rgba(10,10,12,0)');
  lg.addColorStop(0.22, 'rgba(12,12,14,0.85)');
  lg.addColorStop(0.5, 'rgba(18,18,20,0.45)');
  lg.addColorStop(0.78, 'rgba(12,12,14,0.85)');
  lg.addColorStop(1, 'rgba(10,10,12,0)');
  sg.fillStyle = lg;
  sg.fillRect(0, 0, 64, 64);
  const skidTex = new THREE.CanvasTexture(skidCanvas);

  cachedSprites = {
    flareWhite: radial([
      [0.0, 'rgba(255,255,255,1)'],
      [0.18, 'rgba(255,250,220,0.92)'],
      [0.48, 'rgba(254,240,138,0.34)'],
      [1.0, 'rgba(254,240,138,0)'],
    ]),
    flareRed: radial([
      [0.0, 'rgba(255,225,225,1)'],
      [0.2, 'rgba(255,48,48,0.92)'],
      [0.55, 'rgba(220,38,38,0.34)'],
      [1.0, 'rgba(185,28,28,0)'],
    ]),
    flareBlue: radial([
      [0.0, 'rgba(224,242,254,1)'],
      [0.24, 'rgba(56,189,248,0.9)'],
      [0.6, 'rgba(2,132,199,0.3)'],
      [1.0, 'rgba(2,132,199,0)'],
    ]),
    fire: radial([
      [0.0, 'rgba(255,255,230,1)'],
      [0.25, 'rgba(251,191,36,0.95)'],
      [0.58, 'rgba(234,88,12,0.62)'],
      [0.85, 'rgba(153,27,27,0.2)'],
      [1.0, 'rgba(127,29,29,0)'],
    ]),
    smoke: radial([
      [0.0, 'rgba(28,28,32,0.82)'],
      [0.42, 'rgba(38,38,44,0.58)'],
      [0.75, 'rgba(52,52,60,0.22)'],
      [1.0, 'rgba(52,52,60,0)'],
    ]),
    scorch: radial([
      [0.0, 'rgba(8,8,10,0.94)'],
      [0.45, 'rgba(15,15,18,0.78)'],
      [0.78, 'rgba(28,25,23,0.32)'],
      [1.0, 'rgba(28,25,23,0)'],
    ]),
    skid: skidTex,
  };
  return cachedSprites;
}

// ---------------------------------------------------------------------------
// 8. Atmospheric Sky Dome + PMREM Environment Reflection Map
// ---------------------------------------------------------------------------
export function setupRealisticAtmosphere(renderer, scene) {
  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    // Build a procedural studio + city-sky reflection environment so car clearcoat,
    // chrome bumpers, rims and building glass reflect realistic sky & warm street lights.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(40, 32, 16);
    const envCanvas = makeCanvas(256, 128);
    const eg = envCanvas.getContext('2d');
    const grad = eg.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#1d4ed8');
    grad.addColorStop(0.42, '#7dd3fc');
    grad.addColorStop(0.5, '#fde68a');
    grad.addColorStop(0.56, '#334155');
    grad.addColorStop(1.0, '#0f172a');
    eg.fillStyle = grad;
    eg.fillRect(0, 0, 256, 128);
    // Bright studio highlight strips for crisp automotive clearcoat reflections
    eg.fillStyle = 'rgba(255,251,235,0.85)';
    eg.fillRect(28, 22, 68, 8);
    eg.fillRect(148, 30, 82, 6);
    eg.fillStyle = 'rgba(251,146,60,0.55)';
    eg.fillRect(0, 61, 256, 5);
    const envTex = new THREE.CanvasTexture(envCanvas);
    envTex.colorSpace = THREE.SRGBColorSpace;
    envScene.add(new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide })));
    const envRT = pmrem.fromScene(envScene, 0.03);
    scene.environment = envRT.texture;
    envGeo.dispose();
    envTex.dispose();
    pmrem.dispose();
  }

  // Dynamic atmospheric SkyDome with sunset/dawn horizon glow, clouds & night stars
  const skyUniforms = {
    uZenith: { value: new THREE.Color(0x1d4ed8) },
    uHorizon: { value: new THREE.Color(0x9fd3f5) },
    uGlow: { value: new THREE.Color(0xfb923c) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.75, 0.3).normalize() },
    uNight: { value: 0 },
    uTime: { value: 0 },
  };

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform vec3 uSunDir;
      uniform float uNight;
      uniform float uTime;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        vec3 d = normalize(vWorldDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.58));

        // Warm sunset / dawn / urban horizon scatter
        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        float horizonBand = pow(1.0 - h, 3.2);
        col += uGlow * (pow(sunDot, 5.0) * 0.48 + horizonBand * 0.22);
        // Sun disc
        col += vec3(1.0, 0.96, 0.85) * smoothstep(0.9965, 0.9992, sunDot) * (1.0 - uNight * 0.9);

        // Soft drifting clouds above horizon
        if (d.y > 0.04) {
          vec2 uv = d.xz / (d.y + 0.28) * 1.6 + vec2(uTime * 0.008, uTime * 0.004);
          float c = noise(uv) * 0.6 + noise(uv * 2.3) * 0.4;
          float cloud = smoothstep(0.56, 0.82, c) * smoothstep(0.04, 0.26, d.y);
          vec3 cloudCol = mix(vec3(0.96, 0.97, 0.99), uGlow * 0.85 + vec3(0.18), uNight * 0.55);
          col = mix(col, cloudCol * (1.0 - uNight * 0.62), cloud * 0.42);
        }

        // Twinkling night stars
        if (uNight > 0.2 && d.y > 0.08) {
          vec2 sg = floor(d.xz / (d.y + 0.15) * 95.0);
          float st = hash(sg);
          if (st > 0.993) {
            float tw = 0.65 + 0.35 * sin(uTime * 2.5 + st * 90.0);
            col += vec3(0.9, 0.94, 1.0) * (uNight - 0.2) * 1.15 * tw * smoothstep(0.08, 0.35, d.y);
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(760, 32, 20), skyMat);
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  const zenithTmp = new THREE.Color();
  return {
    skyMesh,
    update(lighting, elapsedSec, focusX = 0, focusZ = 0) {
      skyMesh.position.set(focusX, 0, focusZ);
      skyUniforms.uHorizon.value.setHex(lighting.skyHex);
      zenithTmp.setHex(lighting.skyHex).multiplyScalar(lighting.night > 0.5 ? 0.48 : 0.62);
      skyUniforms.uZenith.value.copy(zenithTmp);
      const duskDawn = Math.max(0, 1 - Math.abs(lighting.night - 0.45) * 2.2);
      skyUniforms.uGlow.value.setHex(lighting.night > 0.65 ? 0xd97706 : duskDawn > 0.25 ? 0xf97316 : 0xfef08a);
      skyUniforms.uGlow.value.multiplyScalar(0.32 + duskDawn * 0.65 + lighting.night * 0.22);
      skyUniforms.uSunDir.value.set(lighting.sunOffset.x, lighting.sunOffset.y, lighting.sunOffset.z).normalize();
      skyUniforms.uNight.value = lighting.night;
      skyUniforms.uTime.value = elapsedSec;
      scene.environmentIntensity = 0.52 + (1 - lighting.night) * 0.48;
    },
  };
}
