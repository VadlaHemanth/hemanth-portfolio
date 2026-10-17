/**
 * CPU renderer for browsers without WebGL (no GPU, blocklisted drivers, hardened
 * browsers). It draws the same journey from the same frame description as the WebGL
 * renderer, as sharp as the machine allows:
 *  - the portrait and eye plates at full resolution, from mip chains (and an exact
 *    pre-scaled copy for the resting portrait), so the photograph stays crisp;
 *  - the neural/circuit passage per pixel (cpu-tunnel.js), on worker threads when
 *    available, at a resolution that adapts to the machine and sharpens to full
 *    resolution whenever the visitor stops scrolling.
 */
import {TEX_W, TEX_H, TunnelLut, makePyramid, frameConstants, outlineTable, shade} from "./cpu-tunnel.js?v=20261017-v3c";

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Resolution steps for frames dominated by the passage (fraction of full resolution).
const STEPS = [0.5, 0.6, 0.71, 0.85, 1];
// The eye stays at full resolution while the opening pupil costs no more than a whole
// passage frame would; past that share of the screen both use the passage resolution.
const PHOTO_COVERAGE = 0.12;
const BAND_MARGIN = 48;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Copy an image into a canvas (the caller frees the source), optionally downscaled. */
function copyImage(source, maxSide) {
  const s = Math.min(1, maxSide / Math.max(source.width, source.height));
  const c = makeCanvas(Math.max(1, Math.round(source.width * s)), Math.max(1, Math.round(source.height * s)));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/** The pupil's oval outline R(θ) = R0·(1 + e·cos 2(θ − φ)) from its shape vector e·(cos 2φ, sin 2φ). */
function oval(shape) {
  return {e: Math.hypot(shape[0], shape[1]), phi: Math.atan2(shape[1], shape[0]) / 2};
}

/** Extract the parts of a GLSL column-major mat3 affine: uv = M·P + t. */
function affineParts(m) {
  return {a: m[0], d: m[1], b: m[3], e: m[4], c: m[6], f: m[7]};
}

/** A plate (with its mask baked in) as a mip chain: level 0 is full size. */
class Mipped {
  constructor(canvas) {
    this.levels = [canvas];
    let last = canvas;
    while (last.width > 320 && last.height > 320) {
      const next = makeCanvas(Math.ceil(last.width / 2), Math.ceil(last.height / 2));
      const ctx = next.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(last, 0, 0, next.width, next.height);
      this.levels.push(next);
      last = next;
    }
  }

  get width() {
    return this.levels[0].width;
  }

  /** The level whose pixels land closest to one canvas pixel at this draw scale. */
  pick(scale) {
    const level = clamp(Math.round(Math.log2(1 / Math.max(scale, 1e-6))), 0, this.levels.length - 1);
    return this.levels[level];
  }
}

/** Worker threads that each draw a band of the passage's rows. */
class TunnelPool {
  constructor(count, url) {
    this.workers = [];
    this.ready = new Map();
    this.waiting = null;
    this.free = [];
    for (let i = 0; i < count; i++) {
      this.free.push([]);
      try {
        const worker = new Worker(url, {type: "module"});
        worker.onmessage = (event) => this.receive(i, event.data);
        worker.onerror = () => {
          this.broken = true;
        };
        this.workers.push(worker);
      } catch {
        break;
      }
    }
    this.broken = this.workers.length === 0;
  }

  get size() {
    return this.workers.length;
  }

  setTextures(textures) {
    for (const worker of this.workers) worker.postMessage({type: "textures", ...textures});
  }

  bands(height) {
    const n = this.workers.length;
    return this.workers.map((_, j) => [Math.round((height * j) / n), Math.round((height * (j + 1)) / n)]);
  }

  /** Ask every worker to prepare its band of a lookup table (built between frames). */
  prepare(key, spec) {
    if (this.ready.has(key)) return;
    this.ready.set(key, 0);
    this.bands(spec.height).forEach(([y0, y1], j) => {
      this.workers[j].postMessage({type: "lut", key, spec: {...spec, y0: Math.max(0, y0 - BAND_MARGIN),
        y1: Math.min(spec.height, y1 + BAND_MARGIN)}});
    });
  }

  isReady(key) {
    return this.ready.get(key) === this.workers.length;
  }

  /** Keep only these tables (after a resize, the old sizes are dropped, built or not). */
  retain(keys) {
    for (const key of [...this.ready.keys()]) if (!keys.includes(key)) this.ready.delete(key);
    for (const worker of this.workers) worker.postMessage({type: "retain", keys});
  }

  forget(key) {
    if (!this.ready.has(key)) return;
    this.ready.delete(key);
    for (const worker of this.workers) worker.postMessage({type: "drop", key});
  }

  receive(index, m) {
    if (m.type === "lut") {
      if (this.ready.has(m.key)) this.ready.set(m.key, this.ready.get(m.key) + 1);
      return;
    }
    const job = this.waiting;
    if (!job || m.id !== job.id) {
      this.free[index].push(m.buffer);
      return;
    }
    if (m.missing) {
      job.missing = true;
      this.free[index].push(m.buffer);
    } else job.bands.push({...m, worker: index});
    if (--job.left === 0) {
      this.waiting = null;
      if (job.missing) this.release(job.bands);
      job.resolve(job.missing ? null : job.bands);
    }
  }

  /** Return drawn bands' buffers for reuse. */
  release(bands) {
    for (const band of bands || []) if (band.worker !== undefined) this.free[band.worker].push(band.buffer);
  }

  /** Draw a region of the passage; resolves with the bands, or null if a table is missing. */
  draw(key, height, region, request) {
    const [rx0, ry0, rx1, ry1] = region;
    const id = (this.serial = (this.serial || 0) + 1);
    return new Promise((resolve) => {
      const job = {id, left: 0, bands: [], resolve};
      this.bands(height).forEach(([y0, y1], j) => {
        const a = Math.max(ry0, y0);
        const b = Math.min(ry1, y1);
        if (b <= a) return;
        const bytes = (rx1 - rx0) * (b - a) * 4;
        const free = this.free[j];
        let buffer = free.pop();
        if (!buffer || buffer.byteLength < bytes) buffer = new ArrayBuffer(Math.max(bytes, buffer?.byteLength || 0));
        free.length = Math.min(free.length, 2);
        job.left++;
        this.workers[j].postMessage({type: "frame", id, key, ...request, rx0, ry0: a, rx1, ry1: b, buffer}, [buffer]);
      });
      if (!job.left) resolve([]);
      else this.waiting = job;
    });
  }

  dispose() {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
  }
}

export class CpuRenderer {
  constructor(ctx, {workers = 2} = {}) {
    this.ctx = ctx;
    this.canvas = ctx.canvas;
    this.cpu = true;
    this.images = {};
    this.plates = {};
    this.textures = {};
    this.mainLuts = new Map();
    this.seq = 0;
    this.drawnSeq = 0;
    this.inFlight = false;
    this.latest = null;
    this.pool = null;
    if (workers > 0 && typeof Worker === "function") {
      this.pool = new TunnelPool(workers, new URL("./cpu-tunnel-worker.js?v=20261017-v3c", import.meta.url));
      if (this.pool.broken) this.pool = null;
    }
    // Start sharp with two threads, lighter with fewer; adapt from measured frame times.
    this.step = this.pool ? (this.pool.size >= 2 ? 2 : 1) : 0;
    this.cost = 0;
    this.costFrames = 0;
    this.noise = new Float32Array(256 * 64);
    let s = 7;
    for (let i = 0; i < this.noise.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      this.noise[i] = s / 4294967296;
    }
    this.shards = [];
    for (let i = 0; i < 420; i++) {
      const r = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
      const pick = r();
      this.shards.push({ang: r() * TAU, speed: 0.35 + 1.55 * r() ** 1.6, delay: r() * 0.25, size: 0.7 + 2.5 * r() ** 2,
        card: pick < 0.24 ? 1 : pick < 0.36 ? 0 : pick < 0.48 ? 2 : -1, along: r(), lag: r(), hue: r()});
    }
    this.viewport = [1, 1];
    this.dpr = 1;
  }

  get tunnelScale() {
    return STEPS[this.step];
  }

  setTexture(key, bitmap) {
    if (key === "neural" || key === "circuit") {
      // Power-of-two, mip-mapped texels for the per-pixel passage.
      const c = makeCanvas(TEX_W, TEX_H);
      const x = c.getContext("2d", {willReadFrequently: true});
      x.imageSmoothingQuality = "high";
      x.drawImage(bitmap, 0, 0, TEX_W, TEX_H);
      const pyramid = makePyramid(x.getImageData(0, 0, TEX_W, TEX_H).data, key === "circuit" ? 1.25 : 1);
      this.pool?.setTextures({[key]: pyramid});
      this.textures[key] = this.pool ? true : pyramid;
      if (key === "circuit") this.images.circuit = copyImage(bitmap, 1024);
      return;
    }
    // Plates keep their full size: the zoom's hand-offs assume each plate's real texel density.
    const maxSide = key === "core" ? 768 : 2800;
    this.images[key] = copyImage(bitmap, maxSide);
    delete this.plates[key];
  }

  /** CSS viewport and device pixel ratio; the backing store follows the frame being drawn. */
  setViewport(width, height, dpr) {
    this.viewport = [width, height];
    this.dpr = dpr;
    this.heroCopy = null;
  }

  resize() {}

  canvasSize(scale) {
    return [Math.max(1, Math.round(this.viewport[0] * this.dpr * scale)), Math.max(1, Math.round(this.viewport[1] * this.dpr * scale))];
  }

  applyScale(scale) {
    const [w, h] = this.canvasSize(scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
  }

  /** The passage's lookup table for a scale: centred where the camera comes to rest. */
  lutSpec(scale, center) {
    const [w, h] = this.canvasSize(scale);
    const k = w / this.viewport[0];
    const spec = {width: w, height: h, cx: center[0] * k, cy: center[1] * k, hm: center[2] * k};
    return {key: `${w}x${h}|${spec.cx.toFixed(2)},${spec.cy.toFixed(2)}|${spec.hm.toFixed(3)}`, spec};
  }

  /** Prepare tables for the sharp (still) size and the current moving size ahead of need. */
  warm(center, {retain = false} = {}) {
    this.center = center;
    const keys = [];
    for (const scale of new Set([this.tunnelScale, 1])) {
      const {key, spec} = this.lutSpec(scale, center);
      keys.push(key);
      if (this.pool) this.pool.prepare(key, spec);
      else if (!this.mainLuts.has(key)) this.mainLuts.set(key, new TunnelLut(spec));
    }
    if (retain) {
      this.pool?.retain(keys);
      for (const key of [...this.mainLuts.keys()]) if (!keys.includes(key)) this.mainLuts.delete(key);
    }
    if (!this.pool) this.buildMainLuts();
  }

  buildMainLuts() {
    clearTimeout(this.lutTimer);
    const pending = [...this.mainLuts.values()].find((lut) => !lut.done);
    if (!pending) return;
    pending.build(performance.now() + 8);
    this.lutTimer = setTimeout(() => this.buildMainLuts(), 0);
  }

  /** True once the tables for the current sizes are built (capture mode waits for this). */
  warmed() {
    if (!this.center) return false;
    return [this.tunnelScale, 1].every((scale) => this.lutReady(this.lutSpec(scale, this.center).key));
  }

  lutReady(key) {
    return this.pool ? this.pool.isReady(key) : !!this.mainLuts.get(key)?.done;
  }

  /** Masked plates with mip chains, made once while the visitor is still on the hero. */
  plate(key, p) {
    if (this.plates[key]) return this.plates[key];
    const c = this.images[key];
    if (!c) return null;
    const ctx = c.getContext("2d");
    ctx.globalCompositeOperation = "destination-in";
    if (key === "L0" || key === "L0o") {
      // Feather the portrait into the black stage; each ramp spans the whole image.
      const [l, r, t, b] = p.edges;
      const W = c.width;
      const H = c.height;
      const ramp = (x0, y0, x1, y1, band) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        for (let i = 0; i <= 8; i++) {
          const u = i / 8;
          g.addColorStop(u * band, `rgba(0,0,0,${u * u * (3 - 2 * u)})`);
        }
        g.addColorStop(1, "rgba(0,0,0,1)");
        return g;
      };
      for (const gradient of [ramp(0, 0, W, 0, l), ramp(W, 0, 0, 0, r), ramp(0, 0, 0, H, t), ramp(0, H, 0, 0, b)]) {
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, W, H);
      }
    } else {
      const level = {L1: [p.m1, p.c1, [0.58, 0.94]], L1b: [p.m1b, p.c1b, [0.58, 0.94]], L2: [p.m2, p.c2, [0.86, 1]]}[key];
      const {a, b, c: tx, d, e, f: ty} = affineParts(level[0]);
      const [cx, cy, radius] = level[1];
      const n = c.width;
      const px = (a * cx + b * cy + tx) * n;
      const py = (d * cx + e * cy + ty) * n;
      const scale = Math.hypot(a, d) * n;
      const g = ctx.createRadialGradient(px, py, radius * level[2][0] * scale, px, py, radius * level[2][1] * scale);
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        g.addColorStop(u, `rgba(0,0,0,${1 - u * u * (3 - 2 * u)})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.globalCompositeOperation = "source-over";
    this.plates[key] = new Mipped(c);
    delete this.images[key];
    return this.plates[key];
  }

  prepare(p) {
    for (const key of ["L0o", "L0", "L1", "L1b", "L2"]) this.plate(key, p);
  }

  /** Canvas transform for a plate whose pixels map to the portrait by uv = M·P + t. */
  plateTransform(m, n, plates, k) {
    const {a, b, c, d, e, f} = affineParts(m);
    const det = a * e - b * d;
    const ia = e / det;
    const ib = -b / det;
    const id = -d / det;
    const ie = a / det;
    const s = plates.sigma / n;
    const tx = plates.pupilScreen[0] - plates.sigma * plates.pupil[0] - plates.sigma * (ia * c + ib * f);
    const ty = plates.pupilScreen[1] - plates.sigma * plates.pupil[1] - plates.sigma * (id * c + ie * f);
    return [k * s * ia, k * s * id, k * s * ib, k * s * ie, k * tx, k * ty];
  }

  /** Draw one level of a mip chain under a transform given for its full-size level. */
  drawMipped(mipped, t) {
    const scale = Math.hypot(t[0], t[1]);
    const img = mipped.pick(scale);
    const q = mipped.width / img.width;
    this.ctx.setTransform(t[0] * q, t[1] * q, t[2] * q, t[3] * q, t[4], t[5]);
    this.ctx.drawImage(img, 0, 0);
  }

  /** A portrait image: at the exact resting scale its pre-scaled copy is blitted on whole pixels. */
  drawPortrait(img, t) {
    const scale = t[0];
    const hero = this.heroCopy;
    if (hero && hero.source === img && Math.abs(scale / hero.scale - 1) < 0.004) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.drawImage(hero.canvas, Math.round(t[4]), Math.round(t[5]));
      return;
    }
    this.drawMipped(img, t);
  }

  /** Make the exact copy of the resting portrait for the hero framing (once per viewport size). */
  makeHeroCopy(img, p, k) {
    const scale = (k * p.sigma) / (img.width / p.plateSize[0]);
    if (this.heroCopy && this.heroCopy.source === img && Math.abs(scale / this.heroCopy.scale - 1) < 0.004) return;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.levels[0].height * scale));
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.levels[0], 0, 0, w, h);
    this.heroCopy = {source: img, scale, canvas};
  }

  drawPlates(f, k) {
    const ctx = this.ctx;
    const p = f.plates;
    const L0 = this.plate("L0", p);
    // At rest (first and last frame) the approved original photograph is shown as it is.
    const original = this.plate("L0o", p);
    const orig = original ? p.orig ?? 0 : 0;
    if (!L0 && !original) return;
    const resting = orig >= 0.999 ? original : L0;
    if (Math.abs(p.zoomLog) < 1e-6 && resting) this.makeHeroCopy(resting, p, k);
    // The screen's corners in portrait coordinates decide which layers are needed at all.
    const [vw, vh] = f.viewport;
    const corners = [[0, 0], [vw, 0], [0, vh], [vw, vh]].map(([x, y]) => [
      p.pupil[0] + (x - p.pupilScreen[0]) / p.sigma, p.pupil[1] + (y - p.pupilScreen[1]) / p.sigma]);
    const covers = (c, inner) => corners.every(([x, y]) => Math.hypot(x - c[0], y - c[1]) < c[2] * inner);
    const visible = (c) => {
      const xs = corners.map((q) => q[0]);
      const ys = corners.map((q) => q[1]);
      const dx = Math.max(Math.min(...xs) - c[0], 0, c[0] - Math.max(...xs));
      const dy = Math.max(Math.min(...ys) - c[1], 0, c[1] - Math.max(...ys));
      return Math.hypot(dx, dy) < c[2];
    };
    const density = p.sigma * k;
    const layers = [["L1", p.m1, p.c1, p.texel0, 0.58], ["L1b", p.m1b, p.c1b, p.texel0, 0.58], ["L2", p.m2, p.c2, p.texel1, 0.86]]
      .map(([key, m, c, texel, inner]) => ({key, m, c, inner, when: this.plate(key, p) ? smooth(0.45, 0.95, density / texel) * (1 - orig) : 0}))
      .filter((l) => l.when > 0.001 && visible(l.c));
    // Skip any layer that a fully opaque layer above it already covers.
    const top = [...layers].reverse().find((l) => l.when >= 0.999 && covers(l.c, l.inner));
    const start = top ? layers.indexOf(top) : -1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    // Pixels inside a wide-open window are covered by the passage: do not draw the eye there.
    const win = f.tunnel?.window;
    const hole = win && win[2] >= p.pupilRadius * p.sigma * 0.9 && win[2] > Math.min(vw, vh) * 0.15;
    if (hole) {
      const {e: we, phi: wphi} = oval(f.tunnel.windowShape);
      const r = win[2] * 0.88 * k;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, this.width, this.height);
      ctx.ellipse(win[0] * k, win[1] * k, r * (1 + we), r * (1 - we), wphi, 0, TAU);
      ctx.clip("evenodd");
    }
    if (start < 0) {
      const portrait = (img) => {
        const s = (k * p.sigma) / (img.width / p.plateSize[0]);
        this.drawPortrait(img, [s, 0, 0, s, k * (p.pupilScreen[0] - p.sigma * p.pupil[0]), k * (p.pupilScreen[1] - p.sigma * p.pupil[1])]);
      };
      // The original hands over to the plate as the dive begins: same pixels, same place.
      if (L0 && orig < 0.999) portrait(L0);
      if (original && orig > 0.001) {
        ctx.globalAlpha = orig;
        portrait(original);
        ctx.globalAlpha = 1;
      }
    }
    for (const layer of layers.slice(Math.max(0, start))) {
      const mipped = this.plate(layer.key, p);
      ctx.globalAlpha = layers.indexOf(layer) === start ? 1 : layer.when;
      this.drawMipped(mipped, this.plateTransform(layer.m, mipped.width, p, k));
    }
    ctx.globalAlpha = 1;
    if (hole) ctx.restore();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // The pupil opens into the portal; a ring of light marks where the iris meets it.
    // Both follow the pupil's measured, slightly oval outline, drawn in its own frame.
    const [qx, qy] = p.pupilScreen;
    const {e, phi} = oval(p.pupilShape);
    const rp = p.pupilRadius * (1 + 0.55 * p.dilation) * p.sigma;
    const ri = p.irisRadius * p.sigma;
    if (p.dilation > 0.05 || p.irisFx > 0.01) {
      ctx.save();
      ctx.translate(qx, qy);
      ctx.rotate(phi);
      ctx.scale(1 + e, 1 - e);
      // Once the passage fills the opening, only a thin ring of the pupil can still show:
      // fill rings, not discs (software drawing costs every pixel it covers).
      const open = f.tunnel && f.tunnel.window[2] >= rp * 0.9;
      const ring = (r0, r1) => {
        ctx.beginPath();
        ctx.arc(0, 0, r1, 0, TAU);
        if (r0 > 0) ctx.arc(0, 0, r0, 0, TAU, true);
        ctx.fill();
      };
      if (p.dilation > 0.05) {
        const g = ctx.createRadialGradient(0, 0, rp * 0.985, 0, 0, rp * 1.04);
        g.addColorStop(0, `rgba(0,0,0,${smooth(0.05, 0.35, p.dilation)})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ring(open ? rp * 0.88 : 0, rp * 1.04);
      }
      if (p.irisFx > 0.01) {
        ctx.globalCompositeOperation = "lighter";
        const light = ctx.createRadialGradient(0, 0, rp * 0.92, 0, 0, rp * 1.35);
        light.addColorStop(0, "rgba(43,123,255,0)");
        light.addColorStop(0.22, `rgba(43,123,255,${0.75 * p.irisFx})`);
        light.addColorStop(1, "rgba(43,123,255,0)");
        ctx.fillStyle = light;
        ring(rp * 0.92, rp * 1.35);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
    }
    if (p.irisFx > 0.01) {
      // Data packets running along the iris fibers toward the pupil.
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(156,198,255,${0.55 * p.irisFx})`;
      ctx.lineWidth = Math.max(1, ri * 0.012);
      ctx.beginPath();
      for (let i = 0; i < 96; i++) {
        const h = this.noise[i * 37];
        if (h < 1 - p.irisFx * 0.6) continue;
        const ang = (i / 96) * TAU + h * 0.05;
        const edge = rp * (1 + e * Math.cos(2 * (ang - phi)));
        const phase = 1 - ((f.flow * (0.7 + h) + f.time * (0.12 + 0.22 * h) + h * 9) % 1);
        const r0 = edge + (ri - edge) * phase;
        const r1 = Math.max(edge, r0 - (ri - edge) * 0.12);
        ctx.moveTo(qx + Math.cos(ang) * r0, qy + Math.sin(ang) * r0);
        ctx.lineTo(qx + Math.cos(ang) * r1, qy + Math.sin(ang) * r1);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
    const dark = Math.max(1 - p.exposure, smooth(0, 0.7, p.portal));
    if (dark > 0.001) {
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.fillRect(0, 0, this.width / k, this.height / k);
    }
  }

  drawTunnelLights(f) {
    const ctx = this.ctx;
    const t = f.tunnel;
    const [cx, cy] = f.frameCenter;
    const hm = f.halfMin;
    ctx.globalCompositeOperation = "lighter";
    // The processor core at the end of the passage, with its glow.
    const chamberLight = smooth(t.chamberDepth - 5, t.chamberDepth - 0.5, t.z + 2);
    const coreR = (t.coreSize / Math.max(t.coreDist, 1e-3)) * hm;
    if (chamberLight > 0.001) {
      if (this.images.circuit) {
        // The board that closes the tunnel, lit from the core.
        ctx.save();
        ctx.globalAlpha = chamberLight * 0.55;
        const boardR = Math.min(coreR * 3.2, hm * 3);
        ctx.beginPath();
        ctx.arc(cx, cy, boardR, 0, TAU);
        ctx.clip();
        const s = boardR * 2;
        ctx.drawImage(this.images.circuit, cx - s / 2, cy - s / 2, s, s * 0.66);
        ctx.restore();
      }
      if (this.images.core) {
        ctx.globalAlpha = chamberLight * t.coreDim;
        ctx.drawImage(this.images.core, cx - coreR, cy - coreR, coreR * 2, coreR * 2);
        ctx.globalAlpha = 1;
      }
      const glowR = Math.max(coreR * 1.6, 4);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      g.addColorStop(0, `rgba(43,123,255,${(0.35 + 0.8 * t.flash) * t.coreDim * chamberLight})`);
      g.addColorStop(1, "rgba(43,123,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
    }
    if (t.flash > 0.01) {
      const fr = Math.max(coreR * 0.9, hm * 0.1);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
      g.addColorStop(0, `rgba(220,235,255,${0.95 * t.flash})`);
      g.addColorStop(1, "rgba(43,123,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - fr, cy - fr, fr * 2, fr * 2);
    }
    // The travelling signal: a bright head with a short comet tail.
    if (t.signalLevel > 0.01) {
      const hx = cx + t.signal[0] * hm;
      const hy = cy - t.signal[1] * hm;
      const tx = cx + t.signal[2] * hm;
      const ty = cy - t.signal[3] * hm;
      ctx.strokeStyle = `rgba(120,175,255,${0.7 * t.signalLevel})`;
      ctx.lineWidth = Math.max(2, hm * 0.012);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      const r = Math.max(6, hm * 0.05);
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
      g.addColorStop(0, `rgba(235,244,255,${t.signalLevel})`);
      g.addColorStop(0.35, `rgba(120,175,255,${0.7 * t.signalLevel})`);
      g.addColorStop(1, "rgba(43,123,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  drawShards(f) {
    const ctx = this.ctx;
    const s = f.shards;
    const hm = f.halfMin;
    const [cx, cy] = s.core;
    const perimeter = (r, t) => {
      const w = r[2];
      const h = r[3];
      let d = (t % 1) * 2 * (w + h);
      if (d < w) return [r[0] + d, r[1]];
      d -= w;
      if (d < h) return [r[0] + w, r[1] + d];
      d -= h;
      if (d < w) return [r[0] + w - d, r[1] + h];
      d -= w;
      return [r[0], r[1] + h - d];
    };
    const rect = (i) => [s.cards[i * 4], s.cards[i * 4 + 1], s.cards[i * 4 + 2], s.cards[i * 4 + 3]];
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const p of this.shards) {
      const tb = clamp((s.burst - p.delay) / (1 - p.delay));
      const travel = 1 - (1 - tb) ** 3;
      const dx = Math.cos(p.ang);
      const dy = Math.sin(p.ang);
      let x = cx + dx * (s.coreR * 0.25 + p.speed * travel * hm * 1.25);
      let y = cy + dy * (s.coreR * 0.25 + p.speed * travel * hm * 1.25);
      let vx = dx * p.speed * (1 - tb) * 3;
      let vy = dy * p.speed * (1 - tb) * 3;
      let alpha = smooth(0, 0.08, tb) * (p.card < 0 ? 1 - smooth(0.55, 1, travel) : 1);
      if (p.card >= 0) {
        const [px, py] = perimeter(rect(p.card), p.along);
        const ta = clamp((s.assemble - p.lag * 0.35) / 0.65);
        const e = ta * ta * (3 - 2 * ta);
        x += (px - x) * e;
        y += (py - y) * e;
        vx *= 1 - e;
        vy *= 1 - e;
        alpha *= 1 - smooth(0.75, 1, ta) * smooth(0, 0.2, s.assemble - 0.8);
        alpha = Math.max(alpha, smooth(0.6, 0.95, ta) * (1 - smooth(0.92, 1, s.assemble)) * 0.8);
      }
      if (s.collapse > 0) {
        const tc = clamp((s.collapse - p.speed * 0.15) / 0.7);
        const ec = tc * tc * (3 - 2 * tc);
        const [fx, fy] = p.card >= 0 ? perimeter(rect(p.card), p.along) : [cx + dx * p.speed * hm * 0.8, cy + dy * p.speed * hm * 0.8];
        x = fx + (cx - fx) * ec;
        y = fy + (cy - fy) * ec;
        vx = (cx - fx) * 0.004;
        vy = (cy - fy) * 0.004;
        alpha = smooth(0, 0.15, s.collapse) * (1 - smooth(0.85, 1, tc));
      }
      if (alpha <= 0.01) continue;
      const len = 2 + Math.min(Math.hypot(vx, vy), 6) * 3 * p.size;
      const nx = Math.hypot(vx, vy) > 1e-4 ? vx / Math.hypot(vx, vy) : 1;
      const ny = Math.hypot(vx, vy) > 1e-4 ? vy / Math.hypot(vx, vy) : 0;
      ctx.strokeStyle = p.hue < 0.5 ? `rgba(225,238,255,${alpha})` : `rgba(90,150,255,${alpha})`;
      ctx.lineWidth = Math.max(1, p.size * 0.9);
      ctx.beginPath();
      ctx.moveTo(x - nx * len, y - ny * len);
      ctx.lineTo(x + nx * len, y + ny * len);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /** What this frame needs: its resolution, whether the passage shows, and where. */
  plan(f) {
    const [w, h] = f.viewport;
    const t = f.tunnel;
    let tunnel = false;
    let full = false;
    let coverage = 0;
    if (t) {
      const [wx, wy, r] = t.window;
      const {e} = oval(t.windowShape);
      const far = Math.max(Math.hypot(wx, wy), Math.hypot(w - wx, wy), Math.hypot(wx, h - wy), Math.hypot(w - wx, h - wy));
      full = t.reveal >= 0.999 || r * (1 - e) * 0.9 >= far;
      tunnel = full || r > 0.5 || t.reveal > 0.001;
      coverage = full ? 1 : Math.min(1, (Math.PI * r * r) / (w * h));
    }
    const photo = !!f.plates && coverage < Math.max(PHOTO_COVERAGE, this.tunnelScale ** 2);
    let scale = f.still || photo || !tunnel ? 1 : this.tunnelScale;
    // Never wait on a table: fall back to whichever size is ready.
    if (tunnel && this.center) {
      if (!this.lutReady(this.lutSpec(scale, this.center).key)) {
        const other = scale === 1 ? this.tunnelScale : 1;
        if (this.lutReady(this.lutSpec(other, this.center).key)) scale = other;
      }
    }
    return {tunnel, full, scale, plates: !!f.plates && !full};
  }

  render(f) {
    const seq = ++this.seq;
    const plan = this.plan(f);
    if (!plan.tunnel || !this.textures.neural || !this.center) {
      this.compose(f, plan, null);
      this.drawnSeq = seq;
      f.after?.();
      return;
    }
    const job = this.job(f, plan);
    if (!job) {
      this.compose(f, plan, null);
      this.drawnSeq = seq;
      f.after?.();
      return;
    }
    if (!this.pool) {
      const lut = this.mainLuts.get(job.key);
      const [rx0, ry0, rx1, ry1] = job.region;
      const n = (rx1 - rx0) * (ry1 - ry0);
      if (!this.mainOut || this.mainOut.length < n) this.mainOut = new Uint32Array(n);
      const out = this.mainOut.subarray(0, n);
      const win = job.request.win ? {radius: job.request.win.radius, table: outlineTable(job.request.win.shape)} : null;
      const start = performance.now();
      shade(out, lut, job.request.k, this.textures.neural, this.textures.circuit || this.textures.neural,
        rx0, ry0, rx1, ry1, job.request.ox, job.request.oy, win);
      this.measure(performance.now() - start, plan);
      this.compose(f, plan, [{buffer: out.buffer, rx0, ry0, rx1, ry1}]);
      this.drawnSeq = seq;
      f.after?.();
      return;
    }
    if (this.inFlight) {
      // The workers are busy: the newest frame goes next, older ones are skipped.
      this.latest = {f, plan, job, seq};
      return;
    }
    this.dispatch(f, plan, job, seq);
  }

  /** The passage request for a frame: its table, region, offset and window. */
  job(f, plan) {
    const {key} = this.lutSpec(plan.scale, this.center);
    if (!this.lutReady(key)) return null;
    const [w, h] = this.canvasSize(plan.scale);
    const k = w / f.viewport[0];
    const t = f.tunnel;
    // The table is centred where the camera comes to rest; the opening pupil may sit a little off it.
    const ox = Math.round((f.frameCenter[0] - this.center[0]) * k);
    const oy = Math.round((f.frameCenter[1] - this.center[1]) * k);
    let region = [0, 0, w, h];
    let win = null;
    if (!plan.full) {
      const {e} = oval(t.windowShape);
      const r = t.window[2] * k;
      const cx = t.window[0] * k;
      const cy = t.window[1] * k;
      const ext = r * (1 + e) + 2;
      region = [Math.max(0, Math.floor(cx - ext)), Math.max(0, Math.floor(cy - ext)), Math.min(w, Math.ceil(cx + ext)), Math.min(h, Math.ceil(cy + ext))];
      if (region[2] <= region[0] || region[3] <= region[1]) return null;
      win = {radius: r, shape: t.windowShape};
    }
    return {key, height: h, region, request: {ox, oy, win, k: frameConstants(t)}};
  }

  dispatch(f, plan, job, seq) {
    this.inFlight = true;
    const start = performance.now();
    this.pool.draw(job.key, job.height, job.region, job.request).then((bands) => {
      this.inFlight = false;
      if (bands) this.measure(performance.now() - start, plan);
      const next = this.latest;
      this.latest = null;
      // Keep the workers busy with the newest frame while this one is drawn.
      if (next) this.dispatch(next.f, next.plan, next.job, next.seq);
      if (!bands || seq < this.drawnSeq) {
        this.pool.release(bands);
        return;
      }
      this.compose(f, plan, bands);
      this.pool.release(bands);
      this.drawnSeq = seq;
      f.after?.();
    });
  }

  /** Adapt the moving resolution of passage frames to what this machine sustains. */
  measure(ms, plan) {
    if (!plan.full || plan.scale !== this.tunnelScale) return;
    this.cost += (ms - this.cost) * 0.15;
    if (++this.costFrames < 40) return;
    let step = this.step;
    if (this.cost > 26 && step > 0) step--;
    else if (this.cost < 11 && step < STEPS.length - 1) step++;
    if (step === this.step) return;
    this.costFrames = 0;
    const previous = this.lutSpec(this.tunnelScale, this.center).key;
    this.step = step;
    this.warm(this.center);
    if (previous !== this.lutSpec(1, this.center).key) {
      // Drop the old moving size once the new one is ready.
      const drop = () => (this.lutReady(this.lutSpec(this.tunnelScale, this.center).key) ? this.pool?.forget(previous) : setTimeout(drop, 250));
      setTimeout(drop, 250);
    }
  }

  compose(f, plan, bands) {
    const ctx = this.ctx;
    const stats = (window.__journeyStats ||= {});
    const t0 = performance.now();
    this.applyScale(plan.scale);
    const k = this.width / f.viewport[0];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!bands || !plan.full) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (plan.plates && f.plates) this.drawPlates(f, k);
    const t1 = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bands && bands.length) {
      if (plan.full) {
        for (const b of bands) {
          const w = b.rx1 - b.rx0;
          const h = b.ry1 - b.ry0;
          ctx.putImageData(new ImageData(new Uint8ClampedArray(b.buffer, 0, w * h * 4), w, h), b.rx0, b.ry0);
        }
      } else {
        // The opening pupil: blend the passage over the eye through a layer, edge alpha intact.
        const x0 = Math.min(...bands.map((b) => b.rx0));
        const y0 = Math.min(...bands.map((b) => b.ry0));
        const x1 = Math.max(...bands.map((b) => b.rx1));
        const y1 = Math.max(...bands.map((b) => b.ry1));
        if (!this.layer || this.layer.width < x1 - x0 || this.layer.height < y1 - y0) {
          this.layer = makeCanvas(Math.max(x1 - x0, this.layer?.width || 0), Math.max(y1 - y0, this.layer?.height || 0));
          this.layerCtx = this.layer.getContext("2d");
        }
        for (const b of bands) {
          const w = b.rx1 - b.rx0;
          const h = b.ry1 - b.ry0;
          this.layerCtx.putImageData(new ImageData(new Uint8ClampedArray(b.buffer, 0, w * h * 4), w, h), b.rx0 - x0, b.ry0 - y0);
        }
        ctx.drawImage(this.layer, 0, 0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      }
    }
    if (f.tunnel && plan.tunnel) {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      if (plan.full) this.drawTunnelLights(f);
      else {
        const {e, phi} = oval(f.tunnel.windowShape);
        const [wx, wy, wr] = f.tunnel.window;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(wx, wy, wr * 0.995 * (1 + e), wr * 0.995 * (1 - e), phi, 0, TAU);
        ctx.clip();
        this.drawTunnelLights(f);
        ctx.restore();
      }
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (f.shards) this.drawShards(f);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const t2 = performance.now();
    const kind = !plan.tunnel ? "photo" : plan.full ? "passage" : "window";
    const entry = (stats[kind] ||= {n: 0, plates: 0, rest: 0, max: 0, scale: 0});
    entry.n++;
    entry.plates += t1 - t0;
    entry.rest += t2 - t1;
    entry.max = Math.max(entry.max, t2 - t0);
    entry.scale = plan.scale;
    if (bands) stats.workerMs = this.cost;
  }

  dispose() {
    this.pool?.dispose();
    this.images = {};
    this.plates = {};
    this.textures = {};
    this.mainLuts.clear();
  }
}
