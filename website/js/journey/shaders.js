/** GLSL for the journey. All passes work in display-referred colour so photographs stay faithful. */

export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const COMMON = `
precision highp float;
#define TAU 6.28318530718
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
const vec3 SIGNAL = vec3(0.169, 0.482, 1.0);
const vec3 SPARK = vec3(0.612, 0.776, 1.0);
`;

/* ---------- Eye stack: portrait → eye → iris → pupil ---------- */
export const PLATES_FS = `#version 300 es
${COMMON}
in vec2 vUv;
out vec4 outColor;
uniform vec2 uViewport;
uniform float uSigma;
uniform vec2 uPupilScreen;
uniform vec2 uPupil;
uniform vec2 uPlateSize;
uniform float uPxPerCss;
uniform sampler2D uL0;
uniform float uTexel0;
uniform sampler2D uL1;
uniform mat3 uM1;
uniform vec3 uC1;
uniform float uTexel1;
uniform float uHasL1;
uniform sampler2D uL2;
uniform mat3 uM2;
uniform vec3 uC2;
uniform float uTexel2;
uniform float uHasL2;
uniform float uPupilR;
uniform float uIrisR;
uniform float uDilation;
uniform float uIrisFx;
uniform float uPortal;
uniform float uTime;
uniform float uFlow;
uniform float uExposure;
uniform float uSweep;
uniform vec4 uEdges;

vec3 sampleStack(vec2 P) {
  vec2 uv0 = P / uPlateSize;
  vec3 col = texture(uL0, uv0).rgb;
  // Feather the plate into the black stage: toward its borders the near-black backdrop
  // is eased down to pure black (a natural vignette), so no rectangle edge ever shows.
  float edge = smoothstep(0.0, uEdges.x, uv0.x) * smoothstep(0.0, uEdges.y, 1.0 - uv0.x)
    * smoothstep(0.0, uEdges.z, uv0.y) * smoothstep(0.0, uEdges.w, 1.0 - uv0.y);
  float toe = smoothstep(0.012, 0.06, luma(col));
  col *= mix(toe, 1.0, edge * edge) * edge;
  float density = uSigma * uPxPerCss;
  if (uHasL1 > 0.5) {
    vec2 uv1 = (uM1 * vec3(P, 1.0)).xy;
    float inside = step(0.0, uv1.x) * step(uv1.x, 1.0) * step(0.0, uv1.y) * step(uv1.y, 1.0);
    float when = smoothstep(0.45, 0.95, density / uTexel0);
    float where = 1.0 - smoothstep(uC1.z * 0.58, uC1.z * 0.94, length(P - uC1.xy));
    col = mix(col, texture(uL1, uv1).rgb, inside * when * where);
  }
  if (uHasL2 > 0.5) {
    vec2 uv2 = (uM2 * vec3(P, 1.0)).xy;
    float inside = step(0.0, uv2.x) * step(uv2.x, 1.0) * step(0.0, uv2.y) * step(uv2.y, 1.0);
    float when = smoothstep(0.45, 0.95, density / uTexel1);
    // The iris plate takes over inside the iris; the dark limbal ring hides the seam.
    float where = 1.0 - smoothstep(uC2.z * 0.86, uC2.z, length(P - uC2.xy));
    col = mix(col, texture(uL2, uv2).rgb, inside * when * where);
  }
  return col;
}

void main() {
  vec2 css = vec2(vUv.x, 1.0 - vUv.y) * uViewport;
  vec2 P = uPupil + (css - uPupilScreen) / uSigma;
  vec2 d = P - uPupil;
  float r = length(d);
  float rp = uPupilR * (1.0 + 0.55 * uDilation);
  // Dilate the pupil by remapping the iris radially (fibers stretch, nothing slides).
  vec2 Ps = P;
  if (r < uIrisR) {
    float rs = r < rp ? r * uPupilR / rp : uPupilR + (r - rp) * (uIrisR - uPupilR) / (uIrisR - rp);
    Ps = uPupil + d * (rs / max(r, 1e-4));
  }
  vec3 col = sampleStack(Ps);

  // Iris fibers begin to behave like data: thin lanes with packets flowing to the pupil.
  float rn = clamp((r - rp) / (uIrisR - rp), 0.0, 1.0);
  float irisMask = smoothstep(uIrisR * 1.03, uIrisR * 0.9, r) * smoothstep(rp * 0.97, rp * 1.1, r);
  if (uIrisFx > 0.001 && irisMask > 0.0) {
    float a = atan(d.y, d.x) / TAU + 0.5;
    float lanes = 180.0;
    float lx = a * lanes;
    float id = floor(lx);
    float h = hash11(id * 1.37 + 3.1);
    float across = abs(fract(lx) - 0.5);
    float fw = fwidth(lx);
    float line = 1.0 - smoothstep(0.05, 0.05 + max(fw, 0.02), across);
    float visible = smoothstep(0.9, 0.3, fw);
    float packet = fract(rn * (1.6 + 2.2 * h) + uFlow * (0.7 + h) + uTime * (0.12 + 0.22 * h) + h * 9.0);
    float pulse = smoothstep(0.7, 0.98, packet) * smoothstep(1.0, 0.985, packet);
    float lit = step(1.0 - uIrisFx * 0.55, h);
    float data = line * pulse * lit * visible;
    float l = luma(col);
    vec3 cool = l * vec3(0.42, 0.66, 1.25);
    float near = 1.0 - smoothstep(0.0, 0.65, rn);
    col = mix(col, cool, uIrisFx * 0.42 * near * irisMask);
    col += mix(SIGNAL, SPARK, h * 0.6) * data * irisMask * uIrisFx * (0.6 + 1.2 * near);
    // A soft ring of light where the iris meets the opening pupil.
    float rim = exp(-pow((r - rp) / (rp * 0.12), 2.0));
    col += SIGNAL * rim * uIrisFx * 0.7;
  }
  // The dilated pupil is the portal: pure black (the catch-light survives until it opens).
  col *= mix(1.0, smoothstep(rp * 0.985, rp * 1.04, r), smoothstep(0.05, 0.35, uDilation));
  col *= mix(1.0, 0.0, smoothstep(0.0, 0.7, uPortal));

  // Hero light-in: exposure ramps up and a soft band of light crosses the face once.
  float band = exp(-pow((vUv.x * 1.2 - uSweep) * 3.2, 2.0)) * (1.0 - smoothstep(0.85, 1.0, uExposure));
  col *= uExposure;
  col += col * band * 0.55;
  outColor = vec4(col, 1.0);
}`;

/* ---------- Neural passage → circuit → processor chamber ---------- */
export const TUNNEL_FS = `#version 300 es
${COMMON}
in vec2 vUv;
out vec4 outColor;
uniform vec2 uViewport;
uniform float uZ;
uniform float uMorph;
uniform float uChamberDepth;
uniform float uCoreDist;
uniform float uCoreSize;
uniform float uReveal;
uniform vec3 uWindow;
uniform float uTime;
uniform float uSpeed;
uniform float uFlash;
uniform float uCoreDim;
uniform vec4 uSignal;
uniform float uSignalLevel;
uniform vec2 uFrameCenter;
uniform float uHalfMin;
uniform sampler2D uNeural;
uniform sampler2D uCircuit;
uniform sampler2D uCore;

vec3 seamless(sampler2D tex, vec2 uv, vec2 uvAlt) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec2 dxa = dFdx(uvAlt), dya = dFdy(uvAlt);
  dx.x = abs(dx.x) < abs(dxa.x) ? dx.x : dxa.x;
  dy.x = abs(dy.x) < abs(dya.x) ? dy.x : dya.x;
  return textureGrad(tex, uv, dx, dy).rgb;
}

float segmentDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 css = vec2(vUv.x, 1.0 - vUv.y) * uViewport;
  vec2 p = (css - uFrameCenter) / uHalfMin;
  p.y = -p.y;
  float rho = max(length(p), 1e-4);
  float th = atan(p.y, p.x);
  float thAlt = atan(-p.y, -p.x);
  float baseDepth = 1.0 / rho;
  // The wall breathes: an organic radius that evolves along the passage, calmer once it is a machine.
  float organic = (fbm(vec2(th * 1.3 + 2.0, (uZ + baseDepth) * 0.42)) - 0.5) * mix(0.34, 0.08, uMorph);
  float d = (1.0 + organic) / rho;
  float depth = uZ + d;
  float a = th / TAU;
  float aAlt = thAlt / TAU;

  // Sample only what is visible (uniform branches keep derivatives valid).
  vec3 neural = vec3(0.0);
  vec3 circuit = vec3(0.0);
  if (uMorph < 0.999) neural = seamless(uNeural, vec2(a * 3.0, depth / 3.2), vec2(aAlt * 3.0, depth / 3.2));
  // Circuit traces run along the passage, so pack their cross-features densely enough
  // that flight reads as fast here as it does through the neural tissue.
  if (uMorph > 0.001) circuit = seamless(uCircuit, vec2(a * 5.0, depth / 1.25), vec2(aAlt * 5.0, depth / 1.25));

  // Neural pathways straighten into traces: the boundary runs toward the camera.
  float m = 0.0;
  if (uMorph > 0.999) m = 1.0;
  else if (uMorph > 0.001) {
    float front = uZ + mix(15.0, -1.2, smoothstep(0.0, 1.0, uMorph));
    m = smoothstep(-1.1, 1.1, depth - front + 2.2 * (fbm(vec2(a * 7.0, depth * 0.55)) - 0.5));
  }
  vec3 base = mix(neural, circuit, m);

  // Light travels along the bright filaments.
  float emissive = smoothstep(0.32, 0.85, luma(base));
  float wave = 0.5 + 0.5 * sin(depth * 2.6 - uTime * 2.2 + a * 31.0 + m * 4.0);
  base += base * emissive * pow(wave, 6.0) * 1.15;

  // Depth: near walls bright, far walls fall into darkness.
  float fog = exp(-max(d - 0.35, 0.0) * 0.21);
  vec3 col = base * fog * mix(1.0, 1.25, m);

  // Walls end where the chamber around the processor core begins.
  float wall = 1.0 - smoothstep(uChamberDepth - 1.1, uChamberDepth + 0.15, depth);
  col *= wall;

  // Processor core at the end of the passage, mounted on a circuit board that closes the tunnel.
  float coreR = uCoreSize / max(uCoreDist, 1e-3);
  float chamberLight = smoothstep(uChamberDepth - 5.0, uChamberDepth - 0.5, uZ + 2.0);
  vec2 board = p * uCoreDist;
  vec3 endWall = texture(uCircuit, board * 0.62 + vec2(0.5, 0.31)).rgb;
  float boardLight = 0.28 + 1.3 * exp(-length(board) / 0.75);
  endWall *= boardLight * exp(-max(uCoreDist - 0.35, 0.0) * 0.21) * mix(1.0, 1.25, uMorph);
  col = col + endWall * (1.0 - wall) * chamberLight;
  vec2 coreUv = p / (2.0 * coreR) * vec2(1.0, -1.0) + 0.5;
  float inCore = step(0.0, coreUv.x) * step(coreUv.x, 1.0) * step(0.0, coreUv.y) * step(coreUv.y, 1.0);
  vec3 core = texture(uCore, coreUv).rgb * inCore;
  col += core * chamberLight * uCoreDim;
  float glow = exp(-rho / max(coreR * 0.4, 0.02)) * chamberLight;
  col += SIGNAL * glow * (0.3 + 0.8 * uFlash) * uCoreDim;
  col += mix(SIGNAL, vec3(1.0), 0.55) * uFlash * exp(-rho * rho / max(coreR * coreR * 0.12, 0.002)) * 1.1;
  // Walls near the chamber catch the core's light.
  col += SIGNAL * base * wall * chamberLight * exp(-max(uChamberDepth - depth, 0.0) * 0.8) * 0.9;

  // The signal: a pulse that always travels ahead of the camera, with a short comet tail.
  vec2 head = uSignal.xy;
  vec2 tail = uSignal.zw;
  float sd = segmentDist(p, head, tail);
  float alongHead = length(p - head);
  float signal = exp(-sd * sd / 0.00028) * 0.85 + exp(-alongHead * alongHead / 0.00032) * 2.3;
  signal += exp(-alongHead / 0.08) * 0.3;
  col += mix(SIGNAL, SPARK, 0.45) * signal * uSignalLevel;

  // Speed streaks on the near walls make fast travel read as motion, not stepping.
  if (abs(uSpeed) > 0.4) {
    float streak = smoothstep(0.75, 1.0, vnoise(vec2(a * 140.0, depth * 0.6))) * smoothstep(0.6, 1.6, rho);
    col += SIGNAL * streak * clamp((abs(uSpeed) - 0.4) * 0.12, 0.0, 0.5) * fog;
  }

  // Seen through the opening pupil first, then everywhere once the pupil fills the view.
  float w = length(css - uWindow.xy);
  float alpha = max(1.0 - smoothstep(uWindow.z * 0.9, uWindow.z * 0.995, w), uReveal);
  outColor = vec4(col * alpha, alpha);
}`;

/* ---------- Burst shards (instanced, additive) ---------- */
export const SHARDS_VS = `#version 300 es
${COMMON}
layout(location = 0) in vec4 aSeed;
layout(location = 1) in vec4 aTarget;
uniform vec2 uViewport;
uniform vec2 uCore;
uniform float uCoreR;
uniform float uBurst;
uniform float uAssemble;
uniform float uCollapse;
uniform float uTime;
uniform vec4 uCards[3];
uniform float uHalfMin;
out vec2 vLocal;
out float vAlpha;
out float vHue;

vec2 perimeter(vec4 rect, float t) {
  float w = rect.z, h = rect.w, L = 2.0 * (w + h);
  float s = fract(t) * L;
  if (s < w) return rect.xy + vec2(s, 0.0);
  s -= w;
  if (s < h) return rect.xy + vec2(w, s);
  s -= h;
  if (s < w) return rect.xy + vec2(w - s, h);
  s -= w;
  return rect.xy + vec2(0.0, h - s);
}

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  float halfMin = uHalfMin;
  float ang = aSeed.x * TAU;
  vec2 dir = vec2(cos(ang), sin(ang));
  float delay = aSeed.z * 0.25;
  float tb = clamp((uBurst - delay) / (1.0 - delay), 0.0, 1.0);
  float travel = 1.0 - pow(1.0 - tb, 3.0);
  float speed = mix(0.35, 1.9, pow(aSeed.y, 1.6));
  vec2 pos = uCore + dir * (uCoreR * 0.25 + speed * travel * halfMin * 1.25);
  vec2 vel = dir * speed * (1.0 - tb) * 3.0;
  float size = mix(0.7, 3.2, aSeed.w * aSeed.w) * (1.0 + travel * 1.1);
  float alpha = smoothstep(0.0, 0.08, tb) * (1.0 - smoothstep(0.55, 1.0, travel) * (aTarget.x < 0.0 ? 1.0 : 0.0));
  if (aTarget.x >= 0.0) {
    int k = int(aTarget.x);
    vec4 rect = k == 0 ? uCards[0] : k == 1 ? uCards[1] : uCards[2];
    vec2 target = perimeter(rect, aTarget.y);
    float ta = clamp((uAssemble - aTarget.z * 0.35) / 0.65, 0.0, 1.0);
    float e = ta * ta * (3.0 - 2.0 * ta);
    pos = mix(pos, target, e);
    vel = mix(vel, (target - pos) * 0.02, e);
    size = mix(size, 2.2, e);
    alpha *= mix(1.0, 0.0, smoothstep(0.75, 1.0, ta) * smoothstep(0.0, 0.2, uAssemble - 0.8));
    alpha = max(alpha, smoothstep(0.6, 0.95, ta) * (1.0 - smoothstep(0.92, 1.0, uAssemble)) * 0.8);
  }
  // Everything is drawn back into the core before the pull-back.
  float tc = clamp((uCollapse - aSeed.y * 0.3) / 0.7, 0.0, 1.0);
  float ec = tc * tc * (3.0 - 2.0 * tc);
  if (uCollapse > 0.0) {
    vec2 from = aTarget.x >= 0.0 ? perimeter(aTarget.x < 0.5 ? uCards[0] : aTarget.x < 1.5 ? uCards[1] : uCards[2], aTarget.y)
      : uCore + dir * speed * halfMin * 0.8;
    pos = mix(from, uCore, ec);
    vel = (uCore - from) * 0.004;
    alpha = smoothstep(0.0, 0.15, uCollapse) * (1.0 - smoothstep(0.85, 1.0, tc));
    size = mix(3.0, 1.0, ec);
  }
  float stretch = 2.2 + min(length(vel), 6.0) * 2.4;
  vec2 axis = length(vel) > 1e-4 ? normalize(vel) : vec2(1.0, 0.0);
  vec2 normal = vec2(-axis.y, axis.x);
  vec2 offset = axis * corner.x * size * stretch + normal * corner.y * size;
  vec2 css = pos + offset;
  vec2 clip = css / uViewport * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vLocal = corner;
  vAlpha = alpha;
  vHue = aSeed.w;
}`;

export const SHARDS_FS = `#version 300 es
${COMMON}
in vec2 vLocal;
in float vAlpha;
in float vHue;
out vec4 outColor;
void main() {
  float shape = 1.0 - (abs(vLocal.x) + abs(vLocal.y));
  float a = smoothstep(0.0, 0.45, shape) * vAlpha;
  vec3 c = mix(vec3(1.0), SIGNAL, 0.35 + 0.5 * vHue) * (1.1 + 1.3 * (1.0 - vHue));
  outColor = vec4(c * a, a);
}`;

/* ---------- Bloom ---------- */
export const BLOOM_PREFILTER_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 c = texture(uSource, vUv).rgb * 0.25;
  c += texture(uSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb * 0.1875;
  c += texture(uSource, vUv + uTexel * vec2(1.0, -1.0)).rgb * 0.1875;
  c += texture(uSource, vUv + uTexel * vec2(-1.0, 1.0)).rgb * 0.1875;
  c += texture(uSource, vUv + uTexel * vec2(1.0, 1.0)).rgb * 0.1875;
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp(b - uThreshold + 0.25, 0.0, 0.5);
  soft = soft * soft / 0.5;
  float contribution = max(soft, b - uThreshold) / max(b, 1e-4);
  outColor = vec4(c * contribution, 1.0);
}`;

export const BLOOM_DOWN_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uSource, vUv).rgb * 4.0;
  c += texture(uSource, vUv - uTexel).rgb;
  c += texture(uSource, vUv + uTexel).rgb;
  c += texture(uSource, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
  c += texture(uSource, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
  outColor = vec4(c / 8.0, 1.0);
}`;

export const BLOOM_UP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uSource, vUv + vec2(-uTexel.x * 2.0, 0.0)).rgb;
  c += texture(uSource, vUv + vec2(-uTexel.x, uTexel.y)).rgb * 2.0;
  c += texture(uSource, vUv + vec2(0.0, uTexel.y * 2.0)).rgb;
  c += texture(uSource, vUv + vec2(uTexel.x, uTexel.y)).rgb * 2.0;
  c += texture(uSource, vUv + vec2(uTexel.x * 2.0, 0.0)).rgb;
  c += texture(uSource, vUv + vec2(uTexel.x, -uTexel.y)).rgb * 2.0;
  c += texture(uSource, vUv + vec2(0.0, -uTexel.y * 2.0)).rgb;
  c += texture(uSource, vUv + vec2(-uTexel.x, -uTexel.y)).rgb * 2.0;
  outColor = vec4(c / 12.0, 1.0);
}`;

/* ---------- Composite: bloom, velocity blur, fringe, vignette, grain ---------- */
export const COMPOSITE_FS = `#version 300 es
${COMMON}
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uCenter;
uniform float uBlur;
uniform float uFringe;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uAspect;
uniform float uFade;

vec3 softClip(vec3 c) {
  vec3 over = max(c - 0.82, 0.0);
  return min(c, 0.82) + 0.18 * (1.0 - exp(-over / 0.18));
}

void main() {
  vec2 uv = vUv;
  vec2 toCenter = uCenter - uv;
  vec3 col = vec3(0.0);
  if (uBlur > 0.0008) {
    float wsum = 0.0;
    float jitter = hash12(gl_FragCoord.xy + fract(uTime) * 61.0);
    for (int i = 0; i < 9; i++) {
      float f = (float(i) + jitter) / 9.0;
      float w = 1.0 - f * 0.6;
      col += texture(uScene, uv + toCenter * f * uBlur).rgb * w;
      wsum += w;
    }
    col /= wsum;
  } else {
    col = texture(uScene, uv).rgb;
  }
  if (uFringe > 0.0001) {
    vec2 off = -toCenter * uFringe;
    col.r = mix(col.r, texture(uScene, uv + off).r, 0.85);
    col.b = mix(col.b, texture(uScene, uv - off).b, 0.85);
  }
  col += texture(uBloom, uv).rgb * uBloomStrength;
  col = softClip(col);
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(1.35, 0.25, length(q) * 1.15);
  col *= mix(1.0, vig, uVignette);
  float g = hash12(gl_FragCoord.xy * 1.7 + fract(uTime * 7.3) * 97.0) - 0.5;
  col += g * uGrain * (0.35 + 0.65 * (1.0 - luma(col)));
  col += (hash12(gl_FragCoord.xy + 13.7) - 0.5) / 255.0;
  outColor = vec4(col * uFade, 1.0);
}`;
