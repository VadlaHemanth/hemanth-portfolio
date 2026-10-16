/**
 * CPU fallback for browsers without WebGL (no GPU, blocklisted drivers, hardened
 * browsers). It draws the same journey from the same frame description as the
 * WebGL renderer: the registered eye plates with canvas transforms, and the
 * neural/circuit passage as a lookup-table tunnel at low resolution, upscaled.
 */

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Copy an ImageBitmap into a canvas (the caller frees the bitmap), optionally downscaled. */
function copyImage(source, maxSide) {
  const s = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * s));
  const h = Math.max(1, Math.round(source.height * s));
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return c;
}

/** Extract the parts of a GLSL column-major mat3 affine: uv = M·P + t. */
function affineParts(m) {
  return {a: m[0], d: m[1], b: m[3], e: m[4], c: m[6], f: m[7]};
}

export class CpuRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.cpu = true;
    this.images = {};
    this.textures = {};
    this.baked = {};
    this.lutKey = "";
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
  }

  setTexture(key, bitmap) {
    if (key === "neural" || key === "circuit") {
      // Small pixel arrays for per-pixel sampling.
      const c = copyImage(bitmap, 512);
      const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      this.textures[key] = {w: c.width, h: c.height, data};
      if (key === "circuit") this.images.circuit = copyImage(bitmap, 1024);
      return;
    }
    const maxSide = key === "L0" ? 1600 : key === "core" ? 768 : 1254;
    this.images[key] = copyImage(bitmap, maxSide);
    delete this.baked[key];
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /** Masked copies of the plates, made once: feathered portrait edges and soft-edged eye/iris plates. */
  bake(key, p) {
    if (this.baked[key]) return this.baked[key];
    const img = this.images[key];
    if (!img) return null;
    const c = makeCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    if (key === "L0") {
      // "destination-in" acts on the whole canvas, so each edge ramp spans the full image.
      const [l, r, t, b] = p.edges;
      const W = img.width;
      const H = img.height;
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
      const n = img.width;
      const px = (a * cx + b * cy + tx) * n;
      const py = (d * cx + e * cy + ty) * n;
      const scale = Math.hypot(a, d) * n;
      const inner = radius * level[2][0] * scale;
      const outer = radius * level[2][1] * scale;
      const g = ctx.createRadialGradient(px, py, inner, px, py, outer);
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        g.addColorStop(u, `rgba(0,0,0,${1 - u * u * (3 - 2 * u)})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, img.width, img.height);
    }
    this.baked[key] = c;
    return c;
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

  /** Bake every mask while the visitor is still on the hero, so scrolling never waits. */
  prepare(p) {
    for (const key of ["L0", "L1", "L1b", "L2"]) if (this.images[key]) this.bake(key, p);
  }

  drawPlates(f, k) {
    const ctx = this.ctx;
    const p = f.plates;
    const L0 = this.bake("L0", p);
    if (!L0) return;
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
      .map(([key, m, c, texel, inner]) => ({key, m, c, inner, when: this.images[key] ? smooth(0.45, 0.95, density / texel) : 0}))
      .filter((l) => l.when > 0.001 && visible(l.c));
    // Skip any layer that a fully opaque layer above it already covers.
    const top = [...layers].reverse().find((l) => l.when >= 0.999 && covers(l.c, l.inner));
    const start = top ? layers.indexOf(top) : -1;
    ctx.imageSmoothingQuality = density / (L0.width / p.plateSize[0]) > 1 ? "low" : "medium";
    if (start < 0) {
      const s0 = L0.width / p.plateSize[0];
      ctx.setTransform(k * p.sigma / s0, 0, 0, k * p.sigma / s0,
        k * (p.pupilScreen[0] - p.sigma * p.pupil[0]), k * (p.pupilScreen[1] - p.sigma * p.pupil[1]));
      ctx.drawImage(L0, 0, 0);
    }
    for (const layer of layers.slice(Math.max(0, start))) {
      const img = this.bake(layer.key, p);
      ctx.globalAlpha = layers.indexOf(layer) === start ? 1 : layer.when;
      ctx.setTransform(...this.plateTransform(layer.m, img.width, p, k));
      ctx.drawImage(img, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // The pupil opens into the portal; a ring of light marks where the iris meets it.
    const [qx, qy] = p.pupilScreen;
    const rp = p.pupilRadius * (1 + 0.55 * p.dilation) * p.sigma;
    const ri = p.irisRadius * p.sigma;
    if (p.dilation > 0.05) {
      const g = ctx.createRadialGradient(qx, qy, rp * 0.97, qx, qy, rp * 1.05);
      g.addColorStop(0, `rgba(0,0,0,${smooth(0.05, 0.35, p.dilation)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(qx, qy, rp * 1.05, 0, TAU);
      ctx.fill();
    }
    if (p.irisFx > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      const ring = ctx.createRadialGradient(qx, qy, rp * 0.92, qx, qy, rp * 1.35);
      ring.addColorStop(0, "rgba(43,123,255,0)");
      ring.addColorStop(0.22, `rgba(43,123,255,${0.75 * p.irisFx})`);
      ring.addColorStop(1, "rgba(43,123,255,0)");
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(qx, qy, rp * 1.35, 0, TAU);
      ctx.fill();
      // Data packets running along the iris fibers toward the pupil.
      ctx.strokeStyle = `rgba(156,198,255,${0.55 * p.irisFx})`;
      ctx.lineWidth = Math.max(1, ri * 0.012);
      ctx.beginPath();
      for (let i = 0; i < 96; i++) {
        const h = this.noise[i * 37];
        if (h < 1 - p.irisFx * 0.6) continue;
        const ang = (i / 96) * TAU + h * 0.05;
        const phase = 1 - ((f.flow * (0.7 + h) + f.time * (0.12 + 0.22 * h) + h * 9) % 1);
        const r0 = rp + (ri - rp) * phase;
        const r1 = Math.max(rp, r0 - (ri - rp) * 0.12);
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

  /** Per-pixel lookups that only change with the viewport. */
  buildLut(f) {
    const [cw, ch] = f.viewport;
    // The centre moves slightly while the pupil settles; quantise it so the table is rarely rebuilt.
    const qx = Math.round(f.frameCenter[0] / 6) * 6;
    const qy = Math.round(f.frameCenter[1] / 6) * 6;
    const key = `${cw}x${ch}:${qx},${qy}:${f.halfMin}`;
    if (key === this.lutKey) return;
    this.lutKey = key;
    this.lutCenter = [qx, qy];
    const area = 72000;
    const tw = Math.max(64, Math.round(Math.sqrt(area * (cw / ch))));
    const th = Math.max(48, Math.round(tw * (ch / cw)));
    this.tw = tw;
    this.th = th;
    this.tunnelCanvas = makeCanvas(tw, th);
    this.tunnelCtx = this.tunnelCanvas.getContext("2d");
    this.tunnelImage = this.tunnelCtx.createImageData(tw, th);
    this.tunnelPixels = new Uint32Array(this.tunnelImage.data.buffer);
    const n = tw * th;
    this.lutInv = new Float32Array(n);
    this.lutFog = new Float32Array(n);
    this.lutA = new Float32Array(n);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const i = y * tw + x;
        const cssX = ((x + 0.5) / tw) * cw;
        const cssY = ((y + 0.5) / th) * ch;
        const px = (cssX - qx) / f.halfMin;
        const py = -(cssY - qy) / f.halfMin;
        const rho = Math.max(Math.hypot(px, py), 0.016);
        this.lutA[i] = Math.atan2(py, px) / TAU + 0.5;
        this.lutInv[i] = 1 / rho;
        this.lutFog[i] = Math.exp(-Math.max(1 / rho - 0.35, 0) * 0.21);
      }
    }
    this.columnsFor = {};
  }

  /** Texture columns per pixel for a texture width and repeat count (fixed per viewport). */
  columns(texW, repeat) {
    const key = `${texW}:${repeat}`;
    if (this.columnsFor[key]) return this.columnsFor[key];
    const a = this.lutA;
    const col = new Int32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      const u = a[i] * repeat;
      col[i] = ((u - Math.floor(u)) * texW) | 0;
    }
    return (this.columnsFor[key] = col);
  }

  drawTunnel(f) {
    const t = f.tunnel;
    const neural = this.textures.neural;
    const circuit = this.textures.circuit;
    if (!neural) return null;
    this.buildLut(f);
    // While the camera barely moves (reading the cards), reuse the last tunnel frame.
    const sig = `${this.lutKey}|${t.morph.toFixed(3)}`;
    if (sig === this.lastTunnelSig && Math.abs(t.z - this.lastTunnelZ) < 0.004) return this.tunnelCanvas;
    this.lastTunnelSig = sig;
    this.lastTunnelZ = t.z;
    const out = this.tunnelPixels;
    const n = out.length;
    const inv = this.lutInv;
    const fog = this.lutFog;
    const noise = this.noise;
    const z = t.z;
    const morph = t.morph;
    const front = z + 15 + (-1.2 - 15) * smooth(0, 1, morph);
    const chamber = t.chamberDepth;
    const nearChamber = z > chamber - 30;
    const useN = morph < 0.999;
    const useC = morph > 0.001 && circuit;
    const nPix = useN ? new Uint32Array(neural.data.buffer) : null;
    const cPix = useC ? new Uint32Array(circuit.data.buffer) : null;
    const nCol = useN ? this.columns(neural.w, 3) : null;
    const cCol = useC ? this.columns(circuit.w, 5) : null;
    const nh = neural.h;
    const nw = neural.w;
    const chh = useC ? circuit.h : 1;
    const cw = useC ? circuit.w : 1;
    const zn = (z / 3.2) * nh;
    const zc = (z / 1.25) * chh;
    const kn = nh / 3.2;
    const kc = chh / 1.25;
    const boost = 1 + 0.25 * morph;
    const big = 1e6;
    for (let i = 0; i < n; i++) {
      const d = inv[i];
      let c = 0;
      if (useN) {
        const y = ((zn + d * kn + big * nh) | 0) % nh;
        c = nPix[y * nw + nCol[i]];
      }
      let r = c & 255;
      let g = (c >> 8) & 255;
      let b = (c >> 16) & 255;
      if (useC) {
        let m = 1;
        if (morph < 0.999) {
          const x = z + d - front + (noise[(i * 7) & 16383] - 0.5) * 2.2;
          m = x <= -1.1 ? 0 : x >= 1.1 ? 1 : ((x + 1.1) / 2.2) * ((x + 1.1) / 2.2) * (3 - 2 * ((x + 1.1) / 2.2));
        }
        if (m > 0) {
          const y = ((zc + d * kc + big * chh) | 0) % chh;
          const cc = cPix[y * cw + cCol[i]];
          r += ((cc & 255) - r) * m;
          g += (((cc >> 8) & 255) - g) * m;
          b += (((cc >> 16) & 255) - b) * m;
        }
      }
      let shade = fog[i] * boost;
      if (nearChamber) {
        const x = (z + d - (chamber - 1.1)) / 1.25;
        if (x > 0) shade *= x >= 1 ? 0 : 1 - x * x * (3 - 2 * x);
      }
      r *= shade;
      g *= shade;
      b *= shade;
      out[i] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
    }
    this.tunnelCtx.putImageData(this.tunnelImage, 0, 0);
    return this.tunnelCanvas;
  }

  drawTunnelLights(f, k) {
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

  vignette(f, k) {
    const [w, h] = f.viewport;
    const key = `${w}x${h}`;
    if (this.vignetteKey !== key) {
      this.vignetteKey = key;
      const c = makeCanvas(Math.max(2, Math.round(w / 4)), Math.max(2, Math.round(h / 4)));
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.25,
        c.width / 2, c.height / 2, Math.hypot(c.width, c.height) * 0.62);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      this.vignetteCanvas = c;
    }
    this.ctx.drawImage(this.vignetteCanvas, 0, 0, w, h);
  }

  render(f) {
    const ctx = this.ctx;
    const k = this.width / f.viewport[0];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    if (f.plates) this.drawPlates(f, k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (f.tunnel) {
      const tunnel = this.drawTunnel(f);
      if (tunnel) {
        const [w, h] = f.viewport;
        const win = f.tunnel.window;
        const full = f.tunnel.reveal >= 0.999 || win[2] > Math.hypot(w, h);
        ctx.save();
        ctx.imageSmoothingQuality = "low";
        if (!full) {
          ctx.beginPath();
          ctx.arc(win[0], win[1], Math.max(0, win[2] * 0.97), 0, TAU);
          ctx.clip();
        }
        // Window mode: the passage's vanishing point sits in the pupil.
        const ox = f.frameCenter[0] - this.lutCenter[0];
        const oy = f.frameCenter[1] - this.lutCenter[1];
        ctx.drawImage(tunnel, ox, oy, w, h);
        ctx.restore();
        if (full || f.tunnel.reveal > 0) this.drawTunnelLights(f, k);
        else {
          ctx.save();
          ctx.beginPath();
          ctx.arc(win[0], win[1], Math.max(0, win[2] * 0.97), 0, TAU);
          ctx.clip();
          this.drawTunnelLights(f, k);
          ctx.restore();
        }
      }
    }
    if (f.shards) this.drawShards(f);
  }

  dispose() {
    this.images = {};
    this.textures = {};
    this.baked = {};
  }
}
