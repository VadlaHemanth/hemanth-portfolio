/**
 * A very faint, living neural-to-circuit field behind the portfolio sections.
 * Half resolution, about 30 fps, and only while the sections are on screen.
 */
import {createProgram, createTexture} from "./gl.js";

const VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uNeural;
uniform sampler2D uCircuit;
uniform vec2 uSize;
uniform float uScroll;
uniform float uPage;
uniform float uTime;
uniform float uFade;
void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float scale = 1.0 / 900.0;
  vec2 uvN = px * scale * 0.85 + vec2(0.0, uScroll * 0.12 * scale);
  vec2 uvC = px * scale * 1.1 + vec2(0.37, uScroll * 0.18 * scale);
  vec3 n = texture(uNeural, uvN).rgb;
  vec3 c = texture(uCircuit, uvC).rgb;
  // The page itself goes from mind to machine as you read down it.
  vec3 base = mix(n, c, smoothstep(0.15, 0.85, uPage));
  float l = dot(base, vec3(0.2126, 0.7152, 0.0722));
  // Light travels along the brightest strands.
  float wave = 0.5 + 0.5 * sin(uvC.y * 18.0 - uTime * 0.9 + uvC.x * 9.0);
  vec3 glow = vec3(0.17, 0.48, 1.0) * smoothstep(0.35, 0.9, l) * pow(wave, 8.0) * 0.9;
  vec3 col = base * 0.16 + glow * 0.22;
  vec2 q = vUv - 0.5;
  col *= smoothstep(1.0, 0.2, length(q * vec2(1.4, 1.0)));
  outColor = vec4(col * uFade, 1.0);
}`;

export function initAmbient(host, sources) {
  if (!host || !sources?.neural || !sources?.circuit) return null;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  const gl = canvas.getContext("webgl2", {alpha: false, antialias: false, depth: false, powerPreference: "low-power"});
  if (!gl) {
    canvas.remove();
    return null;
  }
  const context = {gl, anisotropy: null};
  const program = createProgram(gl, VS, FS, "ambient");
  const vao = gl.createVertexArray();
  const neural = createTexture(context, sources.neural, {repeat: true});
  const circuit = createTexture(context, sources.circuit, {repeat: true});
  let width = 0;
  let height = 0;
  let active = false;
  let last = 0;
  let fade = 0;

  function resize() {
    const scale = 0.5;
    width = Math.round(innerWidth * scale);
    height = Math.round(innerHeight * scale);
    canvas.width = width;
    canvas.height = height;
  }
  resize();
  addEventListener("resize", resize, {passive: true});

  function draw(now) {
    if (!active) return;
    requestAnimationFrame(draw);
    if (now - last < 32) return;
    last = now;
    fade = Math.min(1, fade + 0.05);
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - innerHeight);
    gl.viewport(0, 0, width, height);
    gl.useProgram(program.program);
    const u = program.uniforms;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, neural.texture);
    gl.uniform1i(u.uNeural, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, circuit.texture);
    gl.uniform1i(u.uCircuit, 1);
    gl.uniform2f(u.uSize, innerWidth, innerHeight);
    gl.uniform1f(u.uScroll, scrollY);
    gl.uniform1f(u.uPage, scrollY / max);
    gl.uniform1f(u.uTime, now / 1000);
    gl.uniform1f(u.uFade, fade);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    setActive(on) {
      if (on === active) return;
      active = on;
      host.classList.toggle("is-live", on);
      if (on) {
        fade = 0;
        requestAnimationFrame(draw);
      }
    },
  };
}
