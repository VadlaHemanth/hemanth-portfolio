/**
 * Journey timeline: pure functions from scroll position to camera state.
 *
 * One rule keeps the motion consistent: the camera travels at a single
 * perceived speed. Every chapter is measured in visual units (one unit is the
 * picture growing by a factor of e), and tunnel flight is converted into the
 * same units. Scroll distance per unit is constant, except where a chapter
 * deliberately changes pace (reading the projects, the pull-back), and those
 * changes are blended so velocity never jumps.
 */

/** Viewport heights of scroll per visual unit. Lower is faster. */
export const SCROLL_PER_UNIT = 0.205;
/** Tunnel depth per visual unit: matches zoom flow at half the screen radius. */
export const TUNNEL_Z_PER_UNIT = 2;
/** Visual units over which pace changes are blended. */
const PACE_BLEND = 0.55;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const lerp = (a, b, t) => a + (b - a) * t;

/* Fixed chapter lengths in visual units. The zoom length depends on the screen. */
const PORTAL = 0.45;
const MIND = 4.0;
const BREAK = 2.4;
/* The machine chapter cruises toward the core at flight speed, then arrives (log-slowing). */
const MACHINE_CRUISE = 2.0;
const MACHINE_ARRIVE = 0.55;
const MACHINE = MACHINE_CRUISE + MACHINE_ARRIVE;
const MIND_Z = MIND * TUNNEL_Z_PER_UNIT;
const BREAK_Z = BREAK * TUNNEL_Z_PER_UNIT;
/** Distance to the core when the machine chapter begins. */
const CORE_START = TUNNEL_Z_PER_UNIT * (MACHINE_CRUISE + 1);
/** Arrival eases out in log space, from flight speed to rest at the core. */
const CORE_END = TUNNEL_Z_PER_UNIT * Math.exp(-MACHINE_ARRIVE / 2);
export const CORE_DEPTH = MIND_Z + BREAK_Z + CORE_START;
/** The circuit passage ends just in front of the processor core. */
export const CHAMBER_DEPTH = CORE_DEPTH - 0.2;

/** The five passing thoughts in the neural passage (centres in mind-chapter time). */
export const THOUGHTS = Object.freeze([
  {word: "CODE", at: 0.14},
  {word: "AI", at: 0.31},
  {word: "DATA", at: 0.48},
  {word: "VISION", at: 0.65},
  {word: "CREATE", at: 0.82},
]);
const THOUGHT_WINDOW = 0.075;

/**
 * The dive into the eye: quicker while the face and the eye grow (the eye's broad, smooth
 * surfaces read slower on screen than the passage), easing back to the common pace as the
 * pupil opens, so the opening and everything after it keep their timing.
 */
export const DIVE_PACE = 1.45;
export function divePace(t) {
  return 1 + (DIVE_PACE - 1) * (1 - smoothstep(0.5, 0.78, t));
}

/**
 * Where the portrait sits for a viewport, in CSS pixels.
 * plate: {width, height, face:[x,y], pupil:[x,y], pupilRadius, irisRadius, hero?, hairTop?}
 * top: the bottom of the fixed header; the crown of the hair always stays clear of it.
 */
export function heroFraming(width, height, plate, top = 0) {
  const aspect = width / height;
  const wide = plate.hero?.wide;
  let sigma, faceX, faceY;
  if (aspect >= 1.12 && wide) {
    // Landscape: the approved composition of the previous site — the photo inside its
    // landscape crop, and that crop fitted to the screen.
    const c = Math.min(width / wide.size[0], height / wide.size[1]);
    sigma = wide.scale * c;
    faceX = (width - wide.size[0] * c) / 2 + (wide.offset[0] + plate.face[0] * wide.scale) * c;
    faceY = (height - wide.size[1] * c) / 2 + (wide.offset[1] + plate.face[1] * wide.scale) * c;
  } else if (aspect >= 1.12) {
    // Landscape: the face sits right of centre and the copy takes the left.
    sigma = height / plate.height * (aspect > 2.1 ? 1.08 : 1);
    faceX = width * (aspect >= 1.45 ? 0.68 : 0.63);
    faceY = plate.face[1] * sigma + height * 0.015;
  } else {
    // Portrait: the face sits in the upper half and the copy below it.
    sigma = Math.max(width / (plate.width * 0.8), height * 0.6 / plate.height);
    faceX = width * 0.5;
    faceY = height * (aspect < 0.62 ? 0.33 : 0.36);
  }
  if (top > 0 && plate.hairTop != null) {
    // Never let the header cut the hair: lower the photo until the crown clears it.
    const crown = faceY + (plate.hairTop - plate.face[1]) * sigma;
    const clear = top + Math.max(12, height * 0.025);
    if (crown < clear) faceY += clear - crown;
  }
  const pupil = [faceX + (plate.pupil[0] - plate.face[0]) * sigma, faceY + (plate.pupil[1] - plate.face[1]) * sigma];
  return {sigma, pupil, face: [faceX, faceY]};
}

/** Visual length of the dive from the hero framing until the dilated pupil covers the screen. */
export function zoomLength(width, height, plate, dilation = 1.55, top = 0) {
  const halfDiagonal = Math.hypot(width, height) / 2;
  const sigmaEnd = halfDiagonal * 1.04 / (plate.pupilRadius * dilation);
  return Math.log(sigmaEnd / heroFraming(width, height, plate, top).sigma);
}

/** The zoom camera: scale and on-screen pupil position for a log-zoom value. */
export function zoomCamera(zoomLog, width, height, plate, length, top = 0) {
  const hero = heroFraming(width, height, plate, top);
  const sigma = hero.sigma * Math.exp(zoomLog);
  // The pupil glides to the centre early in the dive, while the eye is still small.
  const glide = smoothstep(0, 0.72, zoomLog / length);
  const pupil = [lerp(hero.pupil[0], width / 2, glide), lerp(hero.pupil[1], height / 2, glide)];
  return {sigma, pupil};
}

function diveFactor(chapter, v) {
  return chapter.phase === "forward" && chapter.id === "zoom" ? divePace((v - chapter.start) / chapter.len) : 1;
}

function chapterList(zoomLen) {
  // phase: forward → show → twist → settle. speed is visual units per unit of base scroll.
  const forward = [
    {id: "zoom", len: zoomLen},
    {id: "portal", len: PORTAL},
    {id: "mind", len: MIND},
    {id: "break", len: BREAK},
    {id: "machine", len: MACHINE},
  ].map((c) => ({...c, phase: "forward", speed: 1}));
  const show = [
    {id: "burst", len: 1.6, speed: 1},
    {id: "assemble", len: 1.25, speed: 1},
    {id: "focus", len: 0.9, speed: 0.85},
    {id: "hold", len: 1.2, speed: 0.34},
    {id: "release", len: 0.9, speed: 0.85},
    {id: "collapse", len: 1.15, speed: 1.15},
  ].map((c) => ({...c, phase: "show"}));
  const twistSpeed = {machine: 2.1, break: 3.1, mind: 3.1, portal: 2.2, zoom: 1.4};
  const twist = forward.slice().reverse().map((c) => ({...c, phase: "twist", speed: twistSpeed[c.id]}));
  const settle = [{id: "settle", len: 0.75, speed: 0.6, phase: "settle"}];
  return [...forward, ...show, ...twist, ...settle];
}

/**
 * Build the journey for a viewport. Returns its scroll length (in viewport
 * heights) and stateAt(scrollViewportHeights) → camera and overlay state.
 */
export function createTimeline(width, height, plate, {top = 0} = {}) {
  const zoomLen = zoomLength(width, height, plate, 1.55, top);
  const chapters = chapterList(zoomLen);
  let cursor = 0;
  for (const c of chapters) {
    c.start = cursor;
    cursor += c.len;
  }
  const visualTotal = cursor;

  // Pace as a function of visual position, blended with a Gaussian so velocity is continuous.
  const N = 4096;
  const dv = visualTotal / (N - 1);
  const raw = new Float64Array(N);
  let k = 0;
  for (let i = 0; i < N; i++) {
    const v = i * dv;
    while (k < chapters.length - 1 && v >= chapters[k].start + chapters[k].len) k++;
    raw[i] = chapters[k].speed * diveFactor(chapters[k], v);
  }
  // Ease out of the final settle so the camera arrives at rest on the portrait.
  const settle = chapters.at(-1);
  for (let i = 0; i < N; i++) {
    const v = i * dv;
    if (v > settle.start) raw[i] *= lerp(1, 0.22, smoothstep(settle.start, visualTotal, v));
  }
  const sigma = PACE_BLEND / dv;
  const radius = Math.ceil(sigma * 3);
  const kernel = [];
  let kernelSum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(w);
    kernelSum += w;
  }
  const pace = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let acc = 0;
    for (let j = -radius; j <= radius; j++) {
      // Harmonic blending keeps scroll time additive across a pace change.
      acc += kernel[j + radius] / raw[Math.min(N - 1, Math.max(0, i + j))];
    }
    pace[i] = kernelSum / acc;
  }
  // Integrate scroll distance s(v).
  const scrollAt = new Float64Array(N);
  for (let i = 1; i < N; i++) {
    scrollAt[i] = scrollAt[i - 1] + SCROLL_PER_UNIT * dv * 2 / (pace[i - 1] + pace[i]);
  }
  const scrollTotal = scrollAt[N - 1];

  function visualAt(scroll) {
    const s = clamp(scroll, 0, scrollTotal);
    let lo = 0;
    let hi = N - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (scrollAt[mid] <= s) lo = mid;
      else hi = mid;
    }
    const span = scrollAt[hi] - scrollAt[lo];
    return (lo + (span > 0 ? (s - scrollAt[lo]) / span : 0)) * dv;
  }

  // Guide time (in visual units at the guide's base speed): uniform, with the same quicker dive.
  const guideAt = new Float64Array(N);
  for (let i = 1; i < N; i++) {
    const v = (i - 0.5) * dv;
    const chapter = chapters.find((c) => v < c.start + c.len) || chapters.at(-1);
    guideAt[i] = guideAt[i - 1] + dv / diveFactor(chapter, v);
  }
  /** Guide time of a visual position, and its inverse. */
  function guideTimeAt(visual) {
    const x = clamp(visual / dv, 0, N - 1);
    const i = Math.min(N - 2, Math.floor(x));
    return guideAt[i] + (guideAt[i + 1] - guideAt[i]) * (x - i);
  }
  function visualAtGuideTime(time) {
    const g = clamp(time, 0, guideAt[N - 1]);
    let lo = 0;
    let hi = N - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (guideAt[mid] <= g) lo = mid;
      else hi = mid;
    }
    const span = guideAt[hi] - guideAt[lo];
    return (lo + (span > 0 ? (g - guideAt[lo]) / span : 0)) * dv;
  }

  /** Inverse of visualAt: the scroll position (viewport heights) of a visual position. */
  function scrollAtVisual(visual) {
    const x = clamp(visual / dv, 0, N - 1);
    const i = Math.min(N - 2, Math.floor(x));
    return scrollAt[i] + (scrollAt[i + 1] - scrollAt[i]) * (x - i);
  }

  const ctx = {width, height, plate, top, zoomLen, showProgress: 0};

  const showStart = chapters.find((c) => c.phase === "show").start;
  const showEnd = chapters.filter((c) => c.phase === "show").at(-1);
  const showLen = showEnd.start + showEnd.len - showStart;

  function stateAt(scroll) {
    const v = visualAt(scroll);
    let index = chapters.findIndex((c) => v < c.start + c.len);
    if (index < 0) index = chapters.length - 1;
    const chapter = chapters[index];
    const t = clamp((v - chapter.start) / chapter.len);
    ctx.showProgress = clamp((v - showStart) / showLen);
    return chapterState(chapter, t, ctx, v / visualTotal);
  }

  return {scrollTotal, visualTotal, zoomLen, chapters, stateAt, visualAt, scrollAtVisual, guideTimeAt, visualAtGuideTime};
}

function baseState() {
  return {
    chapter: "zoom",
    phase: "forward",
    t: 0,
    progress: 0,
    zoomLog: 0,
    dilation: 0,
    irisFx: 0,
    portal: 0,
    window: 0,
    entry: 0,
    tunnel: 0,
    z: 0,
    morph: 0,
    core: CORE_START + MIND_Z + BREAK_Z,
    chamber: 0,
    burst: 0,
    assemble: 0,
    focus: 0,
    hold: 0,
    collapse: 0,
    hero: 0,
    final: 0,
    cardsTitle: 0,
    thought: -1,
    thoughtLevel: 0,
  };
}

/** Forward-path state for the travelling chapters, shared by the dive and the pull-back. */
function travel(id, t, ctx, s) {
  const {zoomLen, plate, width, height, top} = ctx;
  if (id === "zoom") {
    s.zoomLog = t * zoomLen;
    const sigma = heroFraming(width, height, plate, top).sigma * Math.exp(s.zoomLog);
    const iris = plate.irisRadius * sigma / (Math.min(width, height) / 2);
    s.irisFx = smoothstep(0.32, 1.35, iris);
    s.dilation = smoothstep(0.5, 2.2, iris);
    // The opening pupil becomes a window: the neural passage is already visible inside it.
    s.window = smoothstep(0.55, 0.8, t);
    s.entry = 0.6 * s.window;
    if (s.window > 0) s.tunnel = 1;
    // Flight speed inside the window eases up from rest to the passage's cruising speed.
    const windowUnits = 0.45 * zoomLen;
    const u = Math.max(0, t - 0.55) * zoomLen;
    const zEnd = -PORTAL * TUNNEL_Z_PER_UNIT;
    s.z = zEnd - (TUNNEL_Z_PER_UNIT * windowUnits) / 3 + (TUNNEL_Z_PER_UNIT * u ** 3) / (3 * windowUnits ** 2);
  } else if (id === "portal") {
    s.zoomLog = zoomLen + t * PORTAL;
    s.irisFx = 1;
    s.dilation = 1;
    s.window = 1;
    s.entry = 0.6 + 0.4 * t;
    s.portal = smoothstep(0, 1, t);
    s.tunnel = 1;
    s.z = (t - 1) * PORTAL * TUNNEL_Z_PER_UNIT;
  } else if (id === "mind") {
    s.zoomLog = zoomLen + PORTAL;
    s.portal = 1;
    s.window = 1;
    s.entry = 1;
    s.tunnel = 1;
    s.z = t * MIND_Z;
  } else if (id === "break") {
    s.zoomLog = zoomLen + PORTAL;
    s.portal = 1;
    s.window = 1;
    s.entry = 1;
    s.tunnel = 1;
    s.z = MIND_Z + t * BREAK_Z;
    s.morph = t;
  } else if (id === "machine") {
    s.zoomLog = zoomLen + PORTAL;
    s.portal = 1;
    s.window = 1;
    s.entry = 1;
    s.tunnel = 1;
    s.morph = 1;
    const u = t * MACHINE;
    if (u < MACHINE_CRUISE) {
      s.z = MIND_Z + BREAK_Z + u * TUNNEL_Z_PER_UNIT;
      s.core = CORE_DEPTH - s.z;
    } else {
      const w = (u - MACHINE_CRUISE) / MACHINE_ARRIVE;
      s.core = TUNNEL_Z_PER_UNIT * Math.exp(-(MACHINE_ARRIVE / 2) * (2 * w - w * w));
      s.z = CORE_DEPTH - s.core;
    }
  }
  if (id !== "machine") s.core = CORE_DEPTH - s.z;
  s.chamber = smoothstep(CHAMBER_DEPTH - 1.6, CHAMBER_DEPTH + 0.2, s.z);
  return s;
}

function chapterState(chapter, t, ctx, progress) {
  const s = baseState();
  s.chapter = chapter.id;
  s.phase = chapter.phase;
  s.t = t;
  s.progress = progress;
  if (chapter.phase === "forward") {
    travel(chapter.id, t, ctx, s);
    if (chapter.id === "zoom") s.hero = 1 - smoothstep(0.015, 0.2, t);
    if (chapter.id === "mind") {
      for (let i = 0; i < THOUGHTS.length; i++) {
        const level = 1 - Math.abs(t - THOUGHTS[i].at) / THOUGHT_WINDOW;
        if (level > 0) {
          s.thought = i;
          s.thoughtLevel = level;
        }
      }
    }
    if (chapter.id === "machine") s.cardsTitle = 0;
    return s;
  }
  if (chapter.phase === "show") {
    travel("machine", 1, ctx, s);
    // The camera never freezes: it keeps creeping toward the core through the whole show.
    s.core = CORE_END * Math.exp(-0.24 * ctx.showProgress);
    s.z = CORE_DEPTH - s.core;
    s.burst = chapter.id === "burst" ? t : 1;
    s.assemble = chapter.id === "burst" ? 0 : chapter.id === "assemble" ? t : 1;
    if (chapter.id === "focus") s.focus = easeInOut(t);
    if (chapter.id === "hold") {
      s.focus = 1;
      s.hold = t;
    }
    if (chapter.id === "release") s.focus = 1 - easeInOut(t);
    if (chapter.id === "collapse") s.collapse = t;
    s.cardsTitle = chapter.id === "burst" ? 0
      : chapter.id === "assemble" ? smoothstep(0.35, 1, t)
        : chapter.id === "collapse" ? 1 - smoothstep(0, 0.45, t) : 1;
    return s;
  }
  if (chapter.phase === "twist") {
    travel(chapter.id, 1 - t, ctx, s);
    if (chapter.id === "machine") {
      // Leave from where the show left the camera, then join the return path.
      s.core *= Math.exp(-0.24 * (1 - smoothstep(0, 0.4, t)));
      s.z = CORE_DEPTH - s.core;
    }
    s.collapse = 1;
    s.burst = 1;
    s.assemble = 1;
    if (chapter.id === "zoom") s.final = smoothstep(0.86, 1, t);
    return s;
  }
  // settle: the camera rests on the portrait while the closing line lands.
  s.final = 1;
  s.collapse = 1;
  return s;
}
