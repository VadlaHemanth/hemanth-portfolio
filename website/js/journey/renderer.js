/** Draws one journey frame: scene (plates, tunnel, shards) → bloom → composite. */
import {createProgram, createTexture, createTarget, deleteTarget, bindTarget, bindTexture} from "./gl.js?v=20261016-v3b";
import * as S from "./shaders.js?v=20261016-v3b";

const BLOOM_LEVELS = 5;

export class JourneyRenderer {
  constructor(context, {shardCount = 1200} = {}) {
    this.context = context;
    const gl = (this.gl = context.gl);
    this.programs = {
      plates: createProgram(gl, S.FULLSCREEN_VS, S.PLATES_FS, "plates"),
      tunnel: createProgram(gl, S.FULLSCREEN_VS, S.TUNNEL_FS, "tunnel"),
      shards: createProgram(gl, S.SHARDS_VS, S.SHARDS_FS, "shards"),
      prefilter: createProgram(gl, S.FULLSCREEN_VS, S.BLOOM_PREFILTER_FS, "bloom prefilter"),
      down: createProgram(gl, S.FULLSCREEN_VS, S.BLOOM_DOWN_FS, "bloom down"),
      up: createProgram(gl, S.FULLSCREEN_VS, S.BLOOM_UP_FS, "bloom up"),
      composite: createProgram(gl, S.FULLSCREEN_VS, S.COMPOSITE_FS, "composite"),
    };
    this.emptyVao = gl.createVertexArray();
    this.shardCount = shardCount;
    this.shardVao = this.createShards(shardCount);
    const black = new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1);
    this.fallback = createTexture(context, black, {mipmaps: false});
    this.textures = {};
    this.width = 0;
    this.height = 0;
    this.scale = 1;
  }

  createShards(count) {
    const gl = this.gl;
    const seeds = new Float32Array(count * 4);
    const targets = new Float32Array(count * 4);
    let state = 1234567;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      seeds.set([random(), random(), random(), random()], i * 4);
      // About half the fragments resolve into the three project cards; the centre card gets the most.
      const r = random();
      const card = r < 0.24 ? 1 : r < 0.36 ? 0 : r < 0.48 ? 2 : -1;
      targets.set([card, random(), random(), 0], i * 4);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    for (const [location, data] of [[0, seeds], [1, targets]]) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  setTexture(name, source, options) {
    const previous = this.textures[name];
    if (previous) this.gl.deleteTexture(previous.texture);
    this.textures[name] = createTexture(this.context, source, options);
  }

  texture(name) {
    return (this.textures[name] || this.fallback).texture;
  }

  resize(width, height, scale) {
    if (width === this.width && height === this.height && scale === this.scale && this.scene) return;
    this.width = width;
    this.height = height;
    this.scale = scale;
    const gl = this.gl;
    deleteTarget(gl, this.scene);
    (this.bloom || []).forEach((t) => deleteTarget(gl, t));
    const w = Math.max(2, Math.round(width * scale));
    const h = Math.max(2, Math.round(height * scale));
    this.scene = createTarget(this.context, w, h, {float: true});
    this.bloom = [];
    let bw = Math.max(2, w >> 1);
    let bh = Math.max(2, h >> 1);
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      this.bloom.push(createTarget(this.context, bw, bh, {float: true}));
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
    }
  }

  use(name) {
    const program = this.programs[name];
    this.gl.useProgram(program.program);
    return program.uniforms;
  }

  fullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(f) {
    const gl = this.gl;
    if (!this.scene) return;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    bindTarget(gl, this.scene);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);

    if (f.plates) {
      const u = this.use("plates");
      const p = f.plates;
      gl.uniform2f(u.uViewport, f.viewport[0], f.viewport[1]);
      gl.uniform1f(u.uSigma, p.sigma);
      gl.uniform2f(u.uPupilScreen, p.pupilScreen[0], p.pupilScreen[1]);
      gl.uniform2f(u.uPupil, p.pupil[0], p.pupil[1]);
      gl.uniform2f(u.uPlateSize, p.plateSize[0], p.plateSize[1]);
      gl.uniform1f(u.uPxPerCss, f.pxPerCss);
      bindTexture(gl, 0, this.texture("L0"));
      gl.uniform1i(u.uL0, 0);
      gl.uniform1f(u.uTexel0, p.texel0);
      bindTexture(gl, 1, this.texture("L1"));
      gl.uniform1i(u.uL1, 1);
      gl.uniformMatrix3fv(u.uM1, false, p.m1);
      gl.uniform3f(u.uC1, p.c1[0], p.c1[1], p.c1[2]);
      gl.uniform1f(u.uTexel1, p.texel1);
      gl.uniform1f(u.uHasL1, this.textures.L1 ? 1 : 0);
      bindTexture(gl, 3, this.texture("L1b"));
      gl.uniform1i(u.uL1b, 3);
      gl.uniformMatrix3fv(u.uM1b, false, p.m1b);
      gl.uniform3f(u.uC1b, p.c1b[0], p.c1b[1], p.c1b[2]);
      gl.uniform1f(u.uTexel1b, p.texel1b);
      gl.uniform1f(u.uHasL1b, this.textures.L1b ? 1 : 0);
      bindTexture(gl, 2, this.texture("L2"));
      gl.uniform1i(u.uL2, 2);
      gl.uniformMatrix3fv(u.uM2, false, p.m2);
      gl.uniform3f(u.uC2, p.c2[0], p.c2[1], p.c2[2]);
      gl.uniform1f(u.uTexel2, p.texel2);
      gl.uniform1f(u.uHasL2, this.textures.L2 ? 1 : 0);
      gl.uniform1f(u.uPupilR, p.pupilRadius);
      gl.uniform2f(u.uPupilShape, p.pupilShape[0], p.pupilShape[1]);
      gl.uniform1f(u.uIrisR, p.irisRadius);
      gl.uniform1f(u.uDilation, p.dilation);
      gl.uniform1f(u.uIrisFx, p.irisFx);
      gl.uniform1f(u.uPortal, p.portal);
      gl.uniform1f(u.uTime, f.time);
      gl.uniform1f(u.uFlow, f.flow);
      gl.uniform1f(u.uExposure, p.exposure);
      gl.uniform1f(u.uSweep, p.sweep);
      gl.uniform1f(u.uShimmer, p.shimmer ?? 0);
      gl.uniform4f(u.uEdges, p.edges[0], p.edges[1], p.edges[2], p.edges[3]);
      this.fullscreen();
    }

    if (f.tunnel) {
      const u = this.use("tunnel");
      const t = f.tunnel;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(u.uViewport, f.viewport[0], f.viewport[1]);
      gl.uniform1f(u.uZ, t.z);
      gl.uniform1f(u.uMorph, t.morph);
      gl.uniform1f(u.uChamberDepth, t.chamberDepth);
      gl.uniform1f(u.uCoreDist, t.coreDist);
      gl.uniform1f(u.uCoreSize, t.coreSize);
      gl.uniform1f(u.uReveal, t.reveal);
      gl.uniform3f(u.uWindow, t.window[0], t.window[1], t.window[2]);
      gl.uniform2f(u.uWindowShape, t.windowShape[0], t.windowShape[1]);
      gl.uniform1f(u.uTime, f.time);
      gl.uniform1f(u.uSpeed, f.speed);
      gl.uniform1f(u.uFlash, t.flash);
      gl.uniform1f(u.uCoreDim, t.coreDim);
      gl.uniform4f(u.uSignal, t.signal[0], t.signal[1], t.signal[2], t.signal[3]);
      gl.uniform1f(u.uSignalLevel, t.signalLevel);
      gl.uniform2f(u.uFrameCenter, f.frameCenter[0], f.frameCenter[1]);
      gl.uniform1f(u.uHalfMin, f.halfMin);
      bindTexture(gl, 0, this.texture("neural"));
      gl.uniform1i(u.uNeural, 0);
      bindTexture(gl, 1, this.texture("circuit"));
      gl.uniform1i(u.uCircuit, 1);
      bindTexture(gl, 2, this.texture("core"));
      gl.uniform1i(u.uCore, 2);
      this.fullscreen();
    }

    if (f.shards) {
      const u = this.use("shards");
      const s = f.shards;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform2f(u.uViewport, f.viewport[0], f.viewport[1]);
      gl.uniform2f(u.uCore, s.core[0], s.core[1]);
      gl.uniform1f(u.uCoreR, s.coreR);
      gl.uniform1f(u.uBurst, s.burst);
      gl.uniform1f(u.uAssemble, s.assemble);
      gl.uniform1f(u.uCollapse, s.collapse);
      gl.uniform1f(u.uTime, f.time);
      gl.uniform4fv(u.uCards, s.cards);
      gl.uniform1f(u.uHalfMin, f.halfMin);
      gl.bindVertexArray(this.shardVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.count ?? this.shardCount);
    }
    gl.disable(gl.BLEND);

    // Bloom pyramid (skipped in eco mode).
    if (f.bloomStrength > 0) {
      this.renderBloom(f);
      this.bloomCleared = false;
    } else if (!this.bloomCleared) {
      for (const t of this.bloom) {
        bindTarget(gl, t);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      this.bloomCleared = true;
    }
    this.compositePass(f);
  }

  renderBloom(f) {
    const gl = this.gl;
    const prefilter = this.use("prefilter");
    bindTarget(gl, this.bloom[0]);
    bindTexture(gl, 0, this.scene.texture);
    gl.uniform1i(prefilter.uSource, 0);
    gl.uniform2f(prefilter.uTexel, 1 / this.scene.width, 1 / this.scene.height);
    gl.uniform1f(prefilter.uThreshold, f.bloomThreshold);
    this.fullscreen();
    const down = this.use("down");
    for (let i = 1; i < this.bloom.length; i++) {
      bindTarget(gl, this.bloom[i]);
      bindTexture(gl, 0, this.bloom[i - 1].texture);
      gl.uniform1i(down.uSource, 0);
      gl.uniform2f(down.uTexel, 0.5 / this.bloom[i - 1].width, 0.5 / this.bloom[i - 1].height);
      this.fullscreen();
    }
    const up = this.use("up");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.bloom.length - 2; i >= 0; i--) {
      bindTarget(gl, this.bloom[i]);
      bindTexture(gl, 0, this.bloom[i + 1].texture);
      gl.uniform1i(up.uSource, 0);
      gl.uniform2f(up.uTexel, 0.5 / this.bloom[i + 1].width, 0.5 / this.bloom[i + 1].height);
      this.fullscreen();
    }
    gl.disable(gl.BLEND);
  }

  compositePass(f) {
    const gl = this.gl;
    const c = this.use("composite");
    bindTarget(gl, null, this.width, this.height);
    bindTexture(gl, 0, this.scene.texture);
    gl.uniform1i(c.uScene, 0);
    bindTexture(gl, 1, this.bloom[0].texture);
    gl.uniform1i(c.uBloom, 1);
    gl.uniform2f(c.uCenter, f.blurCenter[0], f.blurCenter[1]);
    gl.uniform1f(c.uBlur, f.blur);
    gl.uniform1f(c.uFringe, f.fringe);
    gl.uniform1f(c.uBloomStrength, f.bloomStrength);
    gl.uniform1f(c.uVignette, f.vignette);
    gl.uniform1f(c.uGrain, f.grain);
    gl.uniform1f(c.uTime, f.time);
    gl.uniform1f(c.uAspect, this.width / this.height);
    gl.uniform1f(c.uFade, f.fade ?? 1);
    this.fullscreen();
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    for (const t of Object.values(this.textures)) gl.deleteTexture(t.texture);
    gl.deleteTexture(this.fallback.texture);
    deleteTarget(gl, this.scene);
    (this.bloom || []).forEach((t) => deleteTarget(gl, t));
    for (const p of Object.values(this.programs)) gl.deleteProgram(p.program);
  }
}
