// MetroVenture 3D — Minecraft-style pixel-art texture painter (no Three.js).
//
// Build Mode's voxel blocks are painted pixel by pixel into 16×16 canvases from
// the palettes in `data.js` (BLOCK_ART). Keeping the painter DOM-light means it
// can be unit-tested in Node with a recording canvas shim — game.js only wraps
// the finished canvas in a NearestFilter THREE.CanvasTexture.

const SPEC_W = 16;

export function pixelRng(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 16777619); }
  let s = h >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amt);
  const g = clamp(((n >> 8) & 255) + amt);
  const b = clamp((n & 255) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Paint one 16×16 pixel texture described by a palette spec. */
export const PIXEL = SPEC_W;

/** Neutral grey palettes for the architectural pieces, tinted by the player's colour. */
export const PIECE_ART = {
  brick: { p: 'brick', base: '#d9d9d9', alt: '#c4c4c4', mortar: '#b0b0b0' },
  cobble: { p: 'cobble', base: '#d2d2d2', alt: '#bcbcbc' },
  planks: { p: 'planks', base: '#dcdcdc', alt: '#c6c6c6' },
  stone: { p: 'speckle', base: '#d6d6d6', alt: '#c2c2c2' },
};

function defaultCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PIXEL;
  return canvas;
}

/** Paint one 16×16 pixel-art texture described by a palette spec (`{p, base, alt, ...}`). */
export function paintPixels(spec, seed, makeCanvas) {
  const factory = makeCanvas || defaultCanvas;
  const rand = pixelRng(seed);
  const canvas = factory();
  canvas.width = canvas.height = PIXEL;
  const ctx = canvas.getContext('2d');
  const base = spec.base;
  const alt = spec.alt || shadeHex(base, -14);
  const mortar = spec.mortar || shadeHex(base, 26);
  const px = (x, y, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); };
  ctx.fillStyle = base; ctx.fillRect(0, 0, PIXEL, PIXEL);
  const pattern = spec.p || 'noise';
  switch (pattern) {
    case 'noise':
      for (let y = 0; y < PIXEL; y++) {
        for (let x = 0; x < PIXEL; x++) {
          const r = rand();
          if (r < 0.34) px(x, y, alt);
          else if (r < 0.44) px(x, y, shadeHex(base, 10));
        }
      }
      break;
    case 'speckle':
      for (let i = 0; i < 44; i++) px((rand() * PIXEL) | 0, (rand() * PIXEL) | 0, rand() < 0.55 ? alt : shadeHex(base, 14));
      break;
    case 'cobble':
      // staggered rounded pebbles with dark mortar gaps
      {
        const dark = shadeHex(alt, -34);
        const cells = [
          [0, 0, 6, 6], [6, 0, 5, 5], [11, 0, 5, 6],
          [0, 6, 5, 5], [5, 6, 6, 6], [11, 6, 5, 5],
          [0, 11, 6, 5], [6, 11, 5, 5], [11, 11, 5, 5],
        ];
        for (const [cx, cy, cw, ch] of cells) {
          const tone = rand() < 0.5 ? alt : shadeHex(base, rand() < 0.5 ? 16 : -10);
          ctx.fillStyle = dark;
          ctx.fillRect(cx, cy, cw, ch);
          ctx.fillStyle = tone;
          ctx.fillRect(cx + 1, cy + 1, cw - 1, ch - 1);
          for (let y = cy + 1; y < cy + ch; y++) {
            for (let x = cx + 1; x < cx + cw; x++) {
              if (rand() < 0.16) px(x, y, shadeHex(tone, rand() < 0.5 ? 14 : -16));
            }
          }
        }
        break;
      }
    case 'planks':
      for (let band = 0; band < 4; band++) {
        const y0 = band * 4;
        const tone = band % 2 === 0 ? base : alt;
        ctx.fillStyle = tone; ctx.fillRect(0, y0, PIXEL, 4);
        for (let x = 0; x < PIXEL; x++) if (rand() < 0.22) px(x, y0 + 1 + ((rand() * 2) | 0), shadeHex(tone, -16));
        for (let x = 0; x < PIXEL; x++) px(x, y0 + 3, shadeHex(tone, -28));
        const nail = (rand() * PIXEL) | 0;
        px(nail, y0 + 1, shadeHex(tone, 18));
      }
      break;
    case 'log':
      for (let x = 0; x < PIXEL; x++) {
        const tone = x % 4 === 0 ? shadeHex(base, -20) : x % 3 === 0 ? alt : base;
        ctx.fillStyle = tone; ctx.fillRect(x, 0, 1, PIXEL);
        for (let y = 0; y < PIXEL; y++) if (rand() < 0.2) px(x, y, shadeHex(tone, -12));
      }
      break;
    case 'logTop':
      ctx.fillStyle = base; ctx.fillRect(0, 0, PIXEL, PIXEL);
      for (let ring = 1; ring <= 3; ring++) {
        ctx.fillStyle = ring % 2 ? alt : shadeHex(base, 12);
        ctx.fillRect(8 - ring * 2, 8 - ring * 2, ring * 4, 1);
        ctx.fillRect(8 - ring * 2, 8 + ring * 2 - 1, ring * 4, 1);
        ctx.fillRect(8 - ring * 2, 8 - ring * 2, 1, ring * 4);
        ctx.fillRect(8 + ring * 2 - 1, 8 - ring * 2, 1, ring * 4);
      }
      break;
    case 'brick':
      for (let row = 0; row < 4; row++) {
        const y0 = row * 4;
        const offset = row % 2 === 0 ? 0 : 4;
        for (let x = 0; x < PIXEL; x++) {
          const inBrick = ((x + offset) % 8) !== 7 && (y0 + 3) % PIXEL !== 0;
          if (inBrick) {
            const tone = rand() < 0.25 ? alt : base;
            ctx.fillStyle = tone; ctx.fillRect(x, y0, 1, 3);
          } else {
            ctx.fillStyle = mortar; ctx.fillRect(x, y0, 1, 3);
          }
        }
        ctx.fillStyle = mortar; ctx.fillRect(0, y0 + 3, PIXEL, 1);
      }
      break;
    case 'glass':
      ctx.fillStyle = base; ctx.fillRect(0, 0, PIXEL, PIXEL);
      ctx.fillStyle = alt;
      for (let i = 0; i < PIXEL; i++) {
        px(i, 0, alt); px(i, PIXEL - 1, alt); px(0, i, alt); px(PIXEL - 1, i, alt);
      }
      // a clean diagonal reflection streak across the pane
      for (let i = 0; i < 8; i++) px(3 + i, 11 - i, '#ffffff');
      for (let i = 0; i < 8; i++) px(4 + i, 11 - i, alt);
      break;
    case 'grassSide':
      for (let y = 0; y < PIXEL; y++) {
        for (let x = 0; x < PIXEL; x++) {
          const r = rand();
          if (y < 3) px(x, y, r < 0.5 ? spec.fringe : spec.fringe2 || spec.fringe);
          else if (y === 3 || (y === 4 && r < 0.4)) px(x, y, r < 0.5 ? spec.fringe2 || spec.fringe : spec.fringe);
          else px(x, y, r < 0.34 ? alt : r < 0.44 ? shadeHex(base, 10) : base);
        }
      }
      break;
    case 'grass':
    case 'wool':
      for (let y = 0; y < PIXEL; y++) {
        for (let x = 0; x < PIXEL; x++) {
          const r = rand();
          if (r < 0.3) px(x, y, alt);
          else if (r < 0.36) px(x, y, shadeHex(base, 12));
        }
      }
      break;
    default:
      break;
  }
  return canvas;
}

