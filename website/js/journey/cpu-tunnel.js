/**
 * The neural passage and circuit drawn on the CPU, for browsers without WebGL. Shared
 * by the main thread and the worker threads that draw bands of rows in parallel.
 *
 * A lookup table, built once per canvas size, gives every pixel its depth, angle, fog
 * and mip level. A frame then costs two texel reads and a few integer operations per
 * pixel. The textures are power-of-two mip pyramids, so the far passage never
 * shimmers, and the near walls are filtered along their depth instead of stepping.
 */

export const TEX_W = 2048;
export const TEX_H = 1024;
const FRAC = 12; // fixed-point fraction bits of a texture row
const ONE = 1 << FRAC;
const TAU = Math.PI * 2;
const MIN_RHO = 0.016;

export const LEVELS = (() => {
  const levels = [];
  let base = 0;
  for (let w = TEX_W, h = TEX_H; w >= 8 && h >= 8; w >>= 1, h >>= 1) {
    levels.push({w, h, base});
    base += w * h;
  }
  return levels;
})();
const TOP = LEVELS.length - 1;
const HMASK = Int32Array.from(LEVELS, (l) => l.h - 1);
const SHIFT = Int32Array.from(LEVELS, (l) => Math.log2(l.w));
const LBASE = Int32Array.from(LEVELS, (l) => l.base);
const SIZE = LEVELS[TOP].base + LEVELS[TOP].w * LEVELS[TOP].h;

/** Wall noise for the neural-to-circuit front, fixed so every thread agrees. */
export const FRONT_NOISE = (() => {
  const noise = new Float32Array(16384);
  let s = 7;
  for (let i = 0; i < noise.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    noise[i] = (s / 4294967296 - 0.5) * 2.2;
  }
  return noise;
})();

/**
 * Mip pyramid of a tileable TEX_W × TEX_H RGBA texture, as packed texels.
 * gain brightens the texture once (the circuit glows a little more than the tissue).
 */
export function makePyramid(rgba, gain = 1) {
  const data = new Uint32Array(SIZE);
  const src = new Uint32Array(rgba.buffer, rgba.byteOffset, TEX_W * TEX_H);
  if (gain === 1) data.set(src);
  else {
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      const r = Math.min(255, (c & 255) * gain);
      const g = Math.min(255, ((c >> 8) & 255) * gain);
      const b = Math.min(255, ((c >> 16) & 255) * gain);
      data[i] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
  for (let l = 1; l < LEVELS.length; l++) {
    const a = LEVELS[l - 1];
    const b = LEVELS[l];
    for (let y = 0; y < b.h; y++) {
      const i0 = a.base + 2 * y * a.w;
      for (let x = 0; x < b.w; x++) {
        const p = data[i0 + 2 * x];
        const q = data[i0 + 2 * x + 1];
        const u = data[i0 + a.w + 2 * x];
        const v = data[i0 + a.w + 2 * x + 1];
        const rb = (p & 0xff00ff) + (q & 0xff00ff) + (u & 0xff00ff) + (v & 0xff00ff);
        const g = (p & 0xff00) + (q & 0xff00) + (u & 0xff00) + (v & 0xff00);
        data[b.base + y * b.w + x] = 0xff000000 | ((rb >>> 2) & 0xff00ff) | ((g >>> 2) & 0xff00);
      }
    }
  }
  return data;
}

/**
 * Per-pixel lookups for canvas rows y0..y1 of a width-wide canvas whose passage is
 * centred on (cx, cy) with half-min hm (all in canvas pixels). build() fills it in
 * slices, so a thread can keep drawing frames while a new size is prepared.
 */
export class TunnelLut {
  constructor({width, height, cx, cy, hm, y0 = 0, y1 = height}) {
    Object.assign(this, {width, height, cx, cy, hm, y0, y1});
    const n = width * (y1 - y0);
    this.depth = new Float32Array(n);
    this.fog = new Uint16Array(n);
    this.angle = new Uint16Array(n);
    this.level = new Uint8Array(n);
    this.next = y0;
  }

  get done() {
    return this.next >= this.y1;
  }

  /** Build rows until the deadline (performance.now() milliseconds); true once complete. */
  build(deadline = Infinity) {
    const {width, cx, cy, hm, y0} = this;
    const aroundN = (3 * TEX_W) / (TAU * hm);
    const aroundC = (5 * TEX_W) / (TAU * hm);
    const alongN = TEX_H / 3.2 / hm;
    const alongC = TEX_H / 1.25 / hm;
    while (this.next < this.y1) {
      const y = this.next++;
      const py = (cy - (y + 0.5)) / hm;
      let i = (y - y0) * width;
      for (let x = 0; x < width; x++, i++) {
        const px = (x + 0.5 - cx) / hm;
        const rho = Math.max(Math.sqrt(px * px + py * py), MIN_RHO);
        const d = 1 / rho;
        this.depth[i] = d;
        this.fog[i] = Math.round(256 * Math.exp(-Math.max(d - 0.35, 0) * 0.21));
        const a = Math.atan2(py, px) / TAU;
        this.angle[i] = ((a - Math.floor(a)) * 65536) & 65535;
        // Texels per pixel around and along the passage pick the mip level.
        const lN = Math.log2(Math.max(aroundN * d, alongN * d * d, 1)) | 0;
        const lC = Math.log2(Math.max(aroundC * d, alongC * d * d, 1)) | 0;
        this.level[i] = Math.min(lN, TOP) | (Math.min(lC, TOP) << 4);
      }
      if ((y & 7) === 7 && performance.now() > deadline) break;
    }
    return this.done;
  }
}

/** Per-frame constants for shade(): the camera, the morph front and the chamber wall. */
export function frameConstants(f) {
  const morph = f.morph;
  const zN = ((f.z / 3.2) * TEX_H) % TEX_H;
  const zC = ((f.z / 1.25) * TEX_H) % TEX_H;
  return {
    useN: morph < 0.999,
    useC: morph > 0.001,
    blend: morph > 0.001 && morph < 0.999,
    z: f.z,
    zN: Math.round((zN < 0 ? zN + TEX_H : zN) * ONE),
    zC: Math.round((zC < 0 ? zC + TEX_H : zC) * ONE),
    kN: (TEX_H / 3.2) * ONE,
    kC: (TEX_H / 1.25) * ONE,
    front: f.z + 15 + (-1.2 - 15) * smooth01(morph),
    chamber: f.chamberDepth,
    nearChamber: f.z > f.chamberDepth - 30,
  };
}

function smooth01(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Radius factors of the window's oval outline, one per 1/1024 turn. */
export function outlineTable(shape) {
  const table = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const a = ((i + 0.5) / 1024) * TAU;
    // Same convention as the shaders: y grows downward on screen, angles are y-up here.
    const dx = Math.cos(a);
    const dy = -Math.sin(a);
    table[i] = 1 + shape[0] * (dx * dx - dy * dy) + shape[1] * 2 * dx * dy;
  }
  return table;
}

/**
 * Shade canvas rows [ry0, ry1) × columns [rx0, rx1) into out (rx1 - rx0 texels per row).
 * The passage centre sits at the LUT centre plus (ox, oy). With a window, pixels outside
 * the opening are transparent and the edge fades like the WebGL renderer's
 * (1 - smoothstep(0.9, 0.995) of the outline radius). Colours are not premultiplied.
 */
export function shade(out, lut, k, texN, texC, rx0, ry0, rx1, ry1, ox = 0, oy = 0, win = null) {
  const {depth, fog, angle, level, width, y0: ly0, y1: ly1} = lut;
  const {useN, useC, blend, zN, zC, kN, kC, z, front, chamber, nearChamber} = k;
  const stride = rx1 - rx0;
  const noise = FRONT_NOISE;
  const wr = win ? win.radius : 0;
  const table = win ? win.table : null;
  const hm = lut.hm;
  let o = 0;
  for (let y = ry0; y < ry1; y++) {
    const ly = y - oy;
    if (ly < ly0 || ly >= ly1) {
      out.fill(0, o, o + stride);
      o += stride;
      continue;
    }
    const rowBase = (ly - ly0) * width - ox;
    for (let x = rx0; x < rx1; x++, o++) {
      const lx = x - ox;
      if (lx < 0 || lx >= width) {
        out[o] = 0;
        continue;
      }
      const i = rowBase + x;
      const d = depth[i];
      let alpha = 255;
      if (win) {
        // Distance from the passage centre against the oval outline in this direction.
        const edge = wr * table[angle[i] >> 6];
        const dist = hm / d;
        if (dist >= edge * 0.995) {
          out[o] = 0;
          continue;
        }
        if (dist > edge * 0.9) {
          const t = (dist - edge * 0.9) / (edge * 0.095);
          alpha = (255 * (1 - t * t * (3 - 2 * t))) | 0;
          if (alpha <= 0) {
            out[o] = 0;
            continue;
          }
        }
      }
      const lv = level[i];
      const a16 = angle[i];
      let rb = 0;
      let g = 0;
      let m = 256;
      if (blend) {
        const xf = z + d - front + noise[((i + ly0 * width) * 7) & 16383];
        if (xf <= -1.1) m = 0;
        else if (xf < 1.1) {
          const t = (xf + 1.1) / 2.2;
          m = (256 * t * t * (3 - 2 * t)) | 0;
        }
      } else if (!useC) m = 0;
      if (m < 256) {
        const l = lv & 15;
        const v = zN + ((d * kN) | 0);
        const row = (v >>> (FRAC + l)) & HMASK[l];
        const w = (v >>> (FRAC - 8 + l)) & 255;
        const sh = SHIFT[l];
        const base = LBASE[l] + ((((a16 * 3 * TEX_W) >>> 16) & (TEX_W - 1)) >> l);
        const c0 = texN[base + (row << sh)];
        const c1 = texN[base + (((row + 1) & HMASK[l]) << sh)];
        rb = (((c0 & 0xff00ff) * (256 - w) + (c1 & 0xff00ff) * w) >>> 8) & 0xff00ff;
        g = (((c0 & 0xff00) * (256 - w) + (c1 & 0xff00) * w) >>> 8) & 0xff00;
      }
      if (m > 0) {
        const l = lv >> 4;
        const v = zC + ((d * kC) | 0);
        const row = (v >>> (FRAC + l)) & HMASK[l];
        const w = (v >>> (FRAC - 8 + l)) & 255;
        const sh = SHIFT[l];
        const base = LBASE[l] + ((((a16 * 5 * TEX_W) >>> 16) & (TEX_W - 1)) >> l);
        const c0 = texC[base + (row << sh)];
        const c1 = texC[base + (((row + 1) & HMASK[l]) << sh)];
        const crb = (((c0 & 0xff00ff) * (256 - w) + (c1 & 0xff00ff) * w) >>> 8) & 0xff00ff;
        const cg = (((c0 & 0xff00) * (256 - w) + (c1 & 0xff00) * w) >>> 8) & 0xff00;
        if (m === 256) {
          rb = crb;
          g = cg;
        } else {
          rb = ((rb * (256 - m) + crb * m) >>> 8) & 0xff00ff;
          g = ((g * (256 - m) + cg * m) >>> 8) & 0xff00;
        }
      }
      let f = fog[i];
      if (nearChamber) {
        // The walls end where the chamber around the processor core begins.
        const t = (z + d - (chamber - 1.1)) / 1.25;
        if (t >= 1) f = 0;
        else if (t > 0) f = (f * (1 - t * t * (3 - 2 * t))) | 0;
      }
      out[o] = (alpha << 24 >>> 0) | (((rb * f) >>> 8) & 0xff00ff) | (((g * f) >>> 8) & 0xff00);
    }
  }
}
