import {test} from "node:test";
import assert from "node:assert/strict";
import {TEX_W, TEX_H, LEVELS, makePyramid, TunnelLut, frameConstants, outlineTable, shade} from "../js/journey/cpu-tunnel.js";

function texture(paint) {
  const px = new Uint8ClampedArray(TEX_W * TEX_H * 4);
  for (let y = 0; y < TEX_H; y++) {
    for (let x = 0; x < TEX_W; x++) {
      const i = (y * TEX_W + x) * 4;
      const [r, g, b] = paint(x, y);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return px;
}

const alpha = (c) => c >>> 24;
const red = (c) => c & 255;
const SHAPE_E = 0.035;
const SHAPE_PHI = 0.1187;
const SHAPE = [SHAPE_E * Math.cos(2 * SHAPE_PHI), SHAPE_E * Math.sin(2 * SHAPE_PHI)];

test("mip levels average their parents", () => {
  const pyramid = makePyramid(texture((x) => (x & 1 ? [255, 0, 255] : [1, 254, 1])));
  const l1 = LEVELS[1];
  const c = pyramid[l1.base + 5 * l1.w + 7];
  assert.equal(c & 255, 128);
  assert.equal((c >> 8) & 255, 127);
  assert.equal((c >> 16) & 255, 128);
  assert.equal(c >>> 24, 255);
});

test("a passage frame is opaque everywhere and falls into darkness at its far centre", () => {
  const white = makePyramid(texture(() => [255, 255, 255]));
  const lut = new TunnelLut({width: 160, height: 90, cx: 80, cy: 45, hm: 45});
  assert.equal(lut.build(), true);
  const out = new Uint32Array(160 * 90);
  shade(out, lut, frameConstants({z: 1, morph: 0, chamberDepth: 18.6}), white, white, 0, 0, 160, 90);
  assert.ok(out.every((c) => alpha(c) === 255));
  const centre = red(out[45 * 160 + 80]);
  const edge = red(out[2 * 160 + 2]);
  assert.ok(centre < 20, `far centre is dark (${centre})`);
  assert.ok(edge > 240, `near wall is lit (${edge})`);
});

test("the opening follows the pupil's oval outline, edge alpha like the WebGL window", () => {
  const white = makePyramid(texture(() => [255, 255, 255]));
  const size = 241;
  const c = 120;
  const lut = new TunnelLut({width: size, height: size, cx: c + 0.5, cy: c + 0.5, hm: 120});
  lut.build();
  const out = new Uint32Array(size * size);
  const radius = 90;
  shade(out, lut, frameConstants({z: 0, morph: 0, chamberDepth: 18.6}), white, white, 0, 0, size, size, 0, 0,
    {radius, table: outlineTable(SHAPE)});
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    // Screen direction (y down) and the oval radius the shaders use for it.
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const edge = radius * (1 + SHAPE[0] * (dx * dx - dy * dy) + SHAPE[1] * 2 * dx * dy);
    const at = (r) => out[Math.round(c + dy * r) * size + Math.round(c + dx * r)];
    assert.equal(alpha(at(edge * 0.85)), 255, `inside at ${a.toFixed(2)}`);
    assert.equal(alpha(at(edge + 1.5)), 0, `outside at ${a.toFixed(2)}`);
  }
});

test("bands drawn by separate threads match one whole frame, morph front included", () => {
  const tex = makePyramid(texture((x, y) => [(x * 7) & 255, (y * 13) & 255, (x ^ y) & 255]));
  const spec = {width: 200, height: 120, cx: 100, cy: 60, hm: 60};
  const whole = new TunnelLut(spec);
  whole.build();
  const k = frameConstants({z: 7.3, morph: 0.5, chamberDepth: 18.6});
  const expected = new Uint32Array(200 * 120);
  shade(expected, whole, k, tex, tex, 0, 0, 200, 120, 3, -2);
  for (const [y0, y1] of [[0, 60], [60, 120]]) {
    const band = new TunnelLut({...spec, y0: Math.max(0, y0 - 48), y1: Math.min(120, y1 + 48)});
    band.build();
    const part = new Uint32Array(200 * (y1 - y0));
    shade(part, band, k, tex, tex, 0, y0, 200, y1, 3, -2);
    assert.deepEqual(part, expected.subarray(y0 * 200, y1 * 200));
  }
});

test("lookup tables build in slices without changing the result", () => {
  const spec = {width: 120, height: 80, cx: 60, cy: 40, hm: 40};
  const once = new TunnelLut(spec);
  once.build();
  const sliced = new TunnelLut(spec);
  let rounds = 0;
  while (!sliced.build(performance.now() - 1)) rounds++;
  assert.ok(rounds > 1);
  assert.deepEqual(sliced.depth, once.depth);
  assert.deepEqual(sliced.level, once.level);
});
