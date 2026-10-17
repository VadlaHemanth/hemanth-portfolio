/**
 * Inside Hemanth: the scroll journey.
 * The camera lives in code. Every frame is computed from the scroll position
 * (smoothed by Lenis), so the journey plays forward and backward at one
 * consistent pace instead of scrubbing a video.
 */
import Lenis from "../../vendor/lenis.js?v=20261017-v3c";
import {createContext} from "./gl.js?v=20261017-v3c";
import {JourneyRenderer} from "./renderer.js?v=20261017-v3c";
import {createTimeline, zoomCamera, CHAMBER_DEPTH, smoothstep} from "./timeline.js?v=20261017-v3c";
import {Overlays, layoutCards} from "./overlays.js?v=20261017-v3c";
import {chooseTier, fetchAll} from "./assets.js?v=20261017-v3c";

const CORE_SIZE = 0.9;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** The screen's small and large heights (phone toolbars showing and tucked away), in CSS pixels. */
function stableViewport() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  // A unit the browser does not know leaves the height unset, which reads as 0.
  const read = (value) => {
    probe.style.height = "";
    probe.style.height = value;
    return probe.style.height ? probe.getBoundingClientRect().height : 0;
  };
  // Older browsers (before Safari 15.4 and Chrome 108) have only vh, the large height on phones;
  // there the small one is the visible height now, as the page opens with its toolbars showing.
  const vh = read("100vh") || innerHeight;
  const svh = read("100svh") || Math.min(innerHeight, vh);
  const lvh = read("100lvh") || vh;
  probe.remove();
  return {width: document.documentElement.clientWidth, svh: Math.round(svh), lvh: Math.round(Math.max(lvh, svh))};
}
const viewportUnits = typeof CSS !== "undefined" && CSS.supports?.("height", "100svh");

function affineToMat3([a, b, c, d, e, f]) {
  // uv.x = a*x + b*y + c ; uv.y = d*x + e*y + f   (column-major for GLSL)
  return new Float32Array([a, d, 0, b, e, 0, c, f, 1]);
}

export function initJourney() {
  const root = document.getElementById("top");
  const stage = root?.querySelector("[data-journey-stage]");
  const canvas = root?.querySelector("canvas[data-journey-canvas]");
  if (!root || !stage || !canvas) return null;
  const html = document.documentElement;
  const loaderLine = root.querySelector("[data-j='load']");
  const loader = document.querySelector("[data-loader]");
  const loaderBar = loader?.querySelector("[data-loader-bar]");
  const loaderPercent = loader?.querySelector("[data-loader-percent]");
  const loaderStatus = loader?.querySelector("[data-loader-status]");
  const site = document.getElementById("site-content");
  const SOFT_WAIT = 5000;
  const HARD_WAIT = 15000;
  let loading = false;
  let loadShown = -1;
  // The loading screen belongs to the first arrival: coming back in the same tab (from the
  // resume page, Back, a reload) the images are already in the browser's cache.
  const SEEN_KEY = "vh:loaded";
  const storage = () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };
  const seenLoader = storage()?.getItem(SEEN_KEY) === "1";
  let hardTimer = 0;
  let softTimer = 0;
  const status = root.querySelector("[data-j='status']");
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
  // Capture mode renders single deterministic frames on request (QA and screenshots).
  const params = new URLSearchParams(location.search);
  const capture = params.has("journey-capture");
  const noGrain = params.has("nograin");
  const coarse = matchMedia("(pointer: coarse)").matches;

  // Smooth scrolling for the whole page. Touch keeps native momentum.
  const reducedAtStart = html.dataset.motion ? html.dataset.motion === "reduced" : matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lenis = new Lenis({autoRaf: false, lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: !reducedAtStart, anchors: false});
  window.__lenis = lenis;
  document.dispatchEvent(new CustomEvent("journey:lenis", {detail: lenis}));

  function goStatic(reason) {
    html.classList.add("journey-static");
    finishLoader();
    html.classList.remove("is-journey");
    root.style.removeProperty("height");
    // Whatever the journey last did to its hero copy, the static page shows it, usable.
    const hero = root.querySelector("[data-j='hero']");
    if (hero) {
      hero.inert = false;
      hero.removeAttribute("data-hidden");
      for (const prop of ["opacity", "transform", "--squeeze"]) hero.style.removeProperty(prop);
    }
    if (status) status.textContent = reason;
    loop.journey = false;
  }

  const loop = {journey: true};
  // app.js resolves the visitor's saved choice against the system setting into data-motion.
  const prefersReduced = () => (html.dataset.motion ? html.dataset.motion === "reduced" : reducedQuery.matches);
  if (prefersReduced()) {
    goStatic("Reduced motion: the portfolio is shown without the camera journey.");
  }
  const context = loop.journey ? createContext(canvas) : null;
  // Without WebGL (no GPU, blocked drivers, hardened browsers) the same journey runs on the CPU.
  const cpu = loop.journey && !context ? canvas.getContext("2d", {alpha: false, desynchronized: true}) : null;
  if (loop.journey && !context && !cpu) goStatic("This browser cannot draw the journey, so the portfolio is shown directly.");
  if (cpu) root.dataset.renderer = "cpu";

  let view = stableViewport();
  let manifest = null;
  let plate = null;
  let pupilShape = [0, 0];
  let timeline = null;
  let renderer = null;
  let overlays = new Overlays(root);
  let sectionTop = 0;
  let ready = false;
  let visible = true;
  let introStart = -1;
  let smoothScroll = null;
  let lastVisual = 0;
  let speed = 0;
  let lastTime = 0;
  // WebGL renders at a scale that adapts to the GPU; the CPU renderer manages its own resolution.
  let renderScale = coarse ? 0.85 : 1;
  const frameTimes = [];
  let qualityCooldown = 0;
  let eco = false;
  // CPU path: draw only when something changed, and once more, sharp, when the visitor pauses.
  let lastSignature = "";
  let lastChange = 0;
  let stillDrawn = false;
  let dirty = true;
  let dpr = 1;
  let headerBottom = 0;
  let copyTop = 0;
  let tour = null;
  // Where to land once the journey knows its length (until then the page is too short): a link
  // to a section (#work), the place a reload left, or "Skip" pressed while it loaded. The
  // browser's own restoration would land before the page has its height, so it is done here.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const RESTORE_KEY = "vh:scroll";
  let pending = null;
  const linked = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (linked && !root.contains(linked)) {
    // The browser would jump there before the journey has its length; it is done once it does,
    // and the address keeps its #section.
    pending = {element: linked, hash: location.hash};
    history.replaceState(history.state, "", location.pathname + location.search);
  }
  else if (["reload", "back_forward"].includes(performance.getEntriesByType?.("navigation")?.[0]?.type)) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(RESTORE_KEY) || "null");
      if (saved?.path === location.pathname && saved.y > 0 && saved.journey > 0) pending = saved;
    } catch {
      // Storage may be unavailable (private modes); the page then opens at the top.
    }
  }
  window.addEventListener("pagehide", () => {
    try {
      sessionStorage.setItem(RESTORE_KEY, JSON.stringify({path: location.pathname, y: Math.round(window.scrollY), journey: root.offsetHeight}));
    } catch {
      // As above.
    }
  });

  /** Top of the opening copy within the frame (layout position: no transforms). */
  function measureCopyTop() {
    let el = root.querySelector(".story-opening");
    let y = 0;
    while (el && el !== stage) {
      y += el.offsetTop;
      el = el.offsetParent;
    }
    return el === stage ? y : 0;
  }

  function measure() {
    view = stableViewport();
    stage.style.setProperty("--stage-h", `${view.lvh}px`);
    stage.style.setProperty("--frame-h", `${view.svh}px`);
    if (!viewportUnits) {
      // Without svh/lvh the page's own heights come from the measurement too.
      html.style.setProperty("--vh-small", `${view.svh}px`);
      html.style.setProperty("--vh-large", `${view.lvh}px`);
    }
    // The fixed header's height (layout height: unaffected by any transform on scroll).
    headerBottom = document.querySelector(".site-header")?.offsetHeight || 0;
    copyTop = measureCopyTop();
    if (plate) {
      timeline = createTimeline(view.width, view.svh, plate, {top: headerBottom, copyTop});
      root.style.height = `${Math.round(timeline.scrollTotal * view.svh + view.lvh)}px`;
      if (pending) {
        const p = pending;
        pending = null;
        lenis.resize();
        if (p.skip) skipToWork();
        else if (p.element) {
          lenis.scrollTo(p.element, {immediate: true, force: true});
          history.replaceState(history.state, "", location.pathname + location.search + p.hash);
        }
        else {
          // The same point of the journey, or the same place in the sections after it.
          const h = root.offsetHeight;
          lenis.scrollTo(p.y < p.journey ? (p.y * h) / p.journey : h + p.y - p.journey, {immediate: true, force: true});
        }
      }
    }
    sectionTop = root.getBoundingClientRect().top + window.scrollY;
    if (cpu) {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer?.setViewport(view.width, view.lvh, dpr);
      // Tables for the new size replace the old ones (built or still queued).
      if (plate) renderer?.warm([view.width / 2, view.svh / 2, Math.min(view.width, view.svh) / 2], {retain: true});
      dirty = true;
      return;
    }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.lvh * dpr);
    renderer?.resize(canvas.width, canvas.height, renderScale);
  }

  function scrollVh(y) {
    return (y - sectionTop) / view.svh;
  }

  function planeUniforms(tierFiles) {
    const levels = manifest.levels;
    const m1 = levels.L1 ? affineToMat3(levels.L1.affine) : new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const m2 = levels.L2 ? affineToMat3(levels.L2.affine) : new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const m1b = levels.L1b ? affineToMat3(levels.L1b.affine) : new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    return {
      m1,
      m2,
      m1b,
      c1b: levels.L1b ? [...levels.L1b.center, levels.L1b.radius] : [0, 0, 0],
      texel1b: tierFiles.L1b?.texel || 1,
      c1: levels.L1 ? [...levels.L1.center, levels.L1.radius] : [0, 0, 0],
      c2: levels.L2 ? [...levels.L2.center, levels.L2.radius] : [0, 0, 0],
      texel0: tierFiles.L0?.texel || 1,
      texel1: tierFiles.L1?.texel || 1,
      texel2: tierFiles.L2?.texel || 1,
    };
  }

  let planes = null;

  function signalGeometry(state, time) {
    let ahead = lerp(30, 2.35, state.entry ** 0.8) + 0.22 * Math.sin(time * 0.9);
    let level = smoothstep(0.0, 0.12, state.entry);
    if (state.chapter === "machine" || state.phase === "show" || state.phase === "settle") {
      // The signal reaches the processor and is absorbed into the core.
      const into = state.phase === "forward" ? state.t : 1;
      ahead = lerp(ahead, Math.max(state.core * 0.98, 0.3), smoothstep(0, 0.8, into));
      level *= 1 - smoothstep(0.55, 0.95, into);
    }
    const angle = 0.9 + state.z * 0.3 + time * 0.12;
    const back = speed < -0.05;
    const tailLen = 0.5 + Math.min(1.4, Math.abs(speed) * 0.09);
    const headR = 1 / ahead;
    const tailR = back ? 1 / (ahead + tailLen) : 1 / Math.max(ahead - tailLen, 0.42);
    return {
      head: [Math.cos(angle) * headR, Math.sin(angle) * headR],
      tail: [Math.cos(angle) * tailR, Math.sin(angle) * tailR],
      level,
    };
  }

  function buildFrame(state, time) {
    const {width, svh, lvh} = view;
    const halfMin = Math.min(width, svh) / 2;
    const frameCenter = [width / 2, svh / 2];
    const f = {
      viewport: [width, lvh],
      pxPerCss: dpr * renderScale,
      time,
      flow: state.zoomLog * 0.55,
      speed,
      halfMin,
      frameCenter,
      bloomThreshold: 0.72,
      bloomStrength: eco ? 0 : lerp(0.22, 0.9, state.portal),
      vignette: lerp(0.45, 0.62, state.portal),
      grain: noGrain ? 0 : 0.035,
      photo: 0,
      fringe: 0,
      blur: 0,
      blurCenter: [0.5, 1 - frameCenter[1] / lvh],
    };
    // Intro light: the face emerges from darkness once, then stays lit.
    const intro = introStart < 0 ? 0 : (time - introStart);
    const exposure = smoothstep(0, 1.5, intro);
    const sweep = lerp(-0.4, 1.7, clamp(intro / 2.1));
    let windowCircle = [frameCenter[0], frameCenter[1], 1e5];
    if (state.portal < 0.999) {
      // A slow breath while the visitor rests on the portrait (fades out as the dive begins).
      const rest = cpu ? 0 : Math.max(state.hero, state.final) * (1 - smoothstep(0, 0.2, state.zoomLog));
      const breath = rest * 0.0045 * Math.sin(time * (Math.PI * 2 / 5.5));
      const cam = zoomCamera(state.zoomLog + breath, width, svh, plate, timeline.zoomLen, headerBottom, copyTop);
      const pupilR = plate.pupilRadius * (1 + 0.55 * state.dilation) * cam.sigma;
      windowCircle = [cam.pupil[0], cam.pupil[1], state.window > 0 ? pupilR * smoothstep(0, 1, state.window * 1.4) : 0];
      frameCenter[0] = cam.pupil[0];
      frameCenter[1] = cam.pupil[1];
      // At rest the approved photograph is shown as it is: no glow, grain or vignette on it.
      const orig = 1 - smoothstep(0, 0.35, state.zoomLog);
      f.photo = orig;
      f.bloomStrength *= 1 - orig;
      f.vignette *= 1 - orig;
      f.grain *= 1 - orig;
      f.plates = {
        zoomLog: state.zoomLog + breath,
        orig,
        sigma: cam.sigma,
        pupilScreen: cam.pupil,
        pupil: plate.pupil,
        plateSize: [plate.width, plate.height],
        pupilRadius: plate.pupilRadius,
        pupilShape,
        irisRadius: plate.irisRadius,
        dilation: state.dilation,
        irisFx: state.irisFx,
        portal: state.portal,
        exposure,
        sweep,
        shimmer: Math.max(state.hero, state.final),
        edges: plate.edges,
        ...planes,
      };
      f.blurCenter = [cam.pupil[0] / width, 1 - cam.pupil[1] / lvh];
    }
    if (state.tunnel > 0) {
      const sig = signalGeometry(state, time);
      const flashBurst = Math.exp(-(((state.burst - 0.08) / 0.07) ** 2)) * (state.burst > 0 ? 1 : 0);
      const flashCollapse = smoothstep(0.82, 0.97, state.collapse) * (1 - smoothstep(0.97, 1, state.collapse));
      f.tunnel = {
        z: state.z,
        morph: state.morph,
        chamberDepth: CHAMBER_DEPTH,
        coreDist: state.core,
        coreSize: CORE_SIZE,
        reveal: state.portal,
        window: windowCircle,
        windowShape: pupilShape,
        flash: Math.max(flashBurst, flashCollapse * 0.8),
        coreDim: 1 - 0.62 * smoothstep(0.3, 0.9, state.assemble) * (1 - smoothstep(0.35, 1, state.collapse)),
        signal: [...sig.head, ...sig.tail],
        signalLevel: sig.level,
      };
      f.signalScreen = [frameCenter[0] + sig.head[0] * halfMin, frameCenter[1] - sig.head[1] * halfMin];
    }
    if (state.burst > 0 && state.collapse < 1 && state.phase === "show") {
      const layout = layoutCards(width, svh, state.focus, state.hold);
      f.cardLayout = layout;
      const cards = new Float32Array(12);
      layout.cards.forEach((r, i) => cards.set([r.x, r.y, r.w * r.zoom, r.h * r.zoom], i * 4));
      f.shards = {
        core: frameCenter,
        coreR: (CORE_SIZE / state.core) * halfMin,
        burst: state.burst,
        assemble: state.assemble,
        collapse: state.collapse,
        cards,
      };
    }
    // Velocity-aware finishing: fast travel gets a touch of zoom blur and fringe.
    const v = Math.abs(speed);
    f.blur = clamp((v - 0.8) * 0.0055, 0, 0.05);
    f.fringe = clamp((v - 1.2) * 0.00045, 0, 0.004);
    return f;
  }

  function adaptQuality(dt) {
    frameTimes.push(dt);
    if (frameTimes.length > 45) frameTimes.shift();
    if (qualityCooldown > 0) {
      qualityCooldown--;
      return;
    }
    if (frameTimes.length < 45) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const max = coarse ? 0.9 : 1;
    if (avg > 24 && renderScale <= 0.5 && !eco) {
      // Last resort on very slow GPUs: drop the bloom passes.
      eco = true;
      root.dataset.eco = "true";
      qualityCooldown = 120;
      frameTimes.length = 0;
    } else if (avg > 21 && renderScale > 0.5) {
      renderScale = Math.max(0.5, renderScale - 0.1);
      renderer.resize(canvas.width, canvas.height, renderScale);
      qualityCooldown = 90;
      frameTimes.length = 0;
    } else if (avg < 12.5 && renderScale < max) {
      renderScale = Math.min(max, renderScale + 0.05);
      renderer.resize(canvas.width, canvas.height, renderScale);
      qualityCooldown = 240;
      frameTimes.length = 0;
    }
  }

  /** Draw a frame; overlays follow the frame actually drawn (the CPU may finish it a moment later). */
  function draw(state, f, done) {
    f.after = () => {
      overlays.update(state, {width: view.width, height: view.svh}, {
        signalScreen: f.signalScreen || [view.width / 2, view.svh / 2],
        cardLayout: f.cardLayout || layoutCards(view.width, view.svh, state.focus, state.hold),
      });
      window.__journeyDraws = (window.__journeyDraws || 0) + 1;
      done?.();
    };
    renderer.render(f);
    if (!cpu) f.after();
  }

  function renderAt(scroll, time, velocity = 0) {
    const state = timeline.stateAt(scroll);
    speed = velocity;
    const f = buildFrame(state, time);
    // Capture frames are stills: the CPU renderer draws them at full resolution.
    f.still = true;
    return new Promise((resolve) => draw(state, f, () => resolve(state)));
  }

  function frame(now) {
    if (capture) return;
    requestAnimationFrame(frame);
    if (tour) advanceTour(now);
    lenis.raf(now);
    const dt = lastTime ? Math.min(100, now - lastTime) : 16.7;
    lastTime = now;
    // The header's journey styling follows the scroll position even when the stage is off screen.
    if (timeline) setJourneyClass(loop.journey && scrollVh(lenis.scroll) < timeline.scrollTotal - 0.02);
    if (!loop.journey || !ready || !visible || document.hidden) return;
    const target = scrollVh(lenis.scroll);
    if (smoothScroll === null) smoothScroll = target;
    // A light extra damping removes the last bit of input jitter (touch and keyboard steps);
    // the guided play-through is already smooth and keeps its exact, uniform pace.
    if (tour) smoothScroll = target;
    else smoothScroll += (target - smoothScroll) * (1 - Math.exp(-dt / (coarse ? 65 : 45)));
    if (Math.abs(target - smoothScroll) < 1e-5) smoothScroll = target;
    const visual = timeline.visualAt(smoothScroll);
    const instant = (visual - lastVisual) / Math.max(dt / 1000, 1e-3);
    speed += (instant - speed) * (1 - Math.exp(-dt / 110));
    lastVisual = visual;
    const state = timeline.stateAt(smoothScroll);
    const time = now / 1000;
    if (introStart < 0) introStart = time;
    if (cpu) {
      // Draw only when the picture changes: while scrolling, while the light-in plays, after
      // a load or resize. Once the visitor pauses, one last frame is drawn at full resolution.
      const settling = time - introStart < 1.6;
      const signature = `${smoothScroll.toFixed(5)}|${view.width}x${view.lvh}`;
      if (signature !== lastSignature || settling || dirty) {
        lastSignature = signature;
        lastChange = now;
        stillDrawn = false;
        dirty = false;
      } else if (stillDrawn || now - lastChange < 220) {
        return;
      }
      const f = buildFrame(state, time);
      if (now - lastChange >= 220) {
        f.still = true;
        stillDrawn = true;
      }
      draw(state, f);
      return;
    }
    const f = buildFrame(state, time);
    draw(state, f);
    adaptQuality(dt);
  }

  let journeyClass = null;
  function setJourneyClass(on) {
    if (on === journeyClass) return;
    journeyClass = on;
    html.classList.toggle("is-journey", on);
  }

  // Loading screen (the previous site's): it stays until the journey's images are in and ready to
  // draw, so the first scroll is complete and smooth. Once the photo itself is in it waits at most
  // until SOFT_WAIT after the page opened (the rest keeps arriving, shown along the header), and
  // never past HARD_WAIT, when its CSS fallback also lets go.
  function startLoader() {
    if (!loader || capture || seenLoader || pending?.element || getComputedStyle(loader).display === "none" || getComputedStyle(loader).visibility === "hidden") {
      finishLoader();
      return;
    }
    loading = true;
    html.classList.add("is-loading");
    lenis.stop();
    // The page behind waits; the skip button is the first stop for the keyboard (no focus ring
    // forced on everyone else).
    if (site) site.inert = true;
    hardTimer = setTimeout(finishLoader, Math.max(0, HARD_WAIT - performance.now()));
    softTimer = setTimeout(() => {
      if (ready) finishLoader();
    }, Math.max(0, SOFT_WAIT - performance.now()));
  }
  function setLoad(p) {
    loaderLine?.style.setProperty("--load", p.toFixed(4));
    if (!loading) return;
    loaderBar?.style.setProperty("--load", p.toFixed(4));
    const percent = Math.floor(p * 100);
    if (percent === loadShown) return;
    loadShown = percent;
    if (loaderPercent) loaderPercent.textContent = `${percent}%`;
    loaderBar?.setAttribute("aria-valuenow", String(percent));
  }
  function finishLoader() {
    clearTimeout(hardTimer);
    clearTimeout(softTimer);
    try {
      storage()?.setItem(SEEN_KEY, "1");
    } catch {
      // Private modes may refuse storage; the screen then shows on each arrival.
    }
    const wasLoading = loading;
    loading = false;
    html.classList.remove("is-loading");
    if (!wasLoading) {
      html.classList.add("loader-done");
      return;
    }
    html.classList.add("loader-leaving");
    setTimeout(() => html.classList.add("loader-done"), 650);
    if (site) site.inert = false;
    if (loader.contains(document.activeElement)) document.getElementById("main")?.focus({preventScroll: true});
    lenis.start();
    // The face lights up as the screen lifts.
    introStart = -1;
    if (ready) root.classList.add("is-ready");
  }
  function skipToWork() {
    stopTour();
    const work = document.getElementById("work");
    if (!work) return;
    if (!timeline) pending = {skip: true};
    // The page may have just grown (the journey sized itself): scroll with fresh limits.
    lenis.resize();
    lenis.scrollTo(work, {immediate: true, force: true});
    work.setAttribute("tabindex", "-1");
    work.focus({preventScroll: true});
  }
  loader?.querySelector("[data-loader-skip]")?.addEventListener("click", () => {
    finishLoader();
    skipToWork();
  });
  window.addEventListener("keydown", (event) => {
    if (!loading || event.key !== "Escape") return;
    event.preventDefault();
    finishLoader();
    skipToWork();
  });
  // Nothing scrolls behind the screen (older iPhones ignore overflow: hidden for touch).
  loader?.addEventListener("touchmove", (event) => {
    if (loading && loader.scrollHeight <= loader.clientHeight + 1) event.preventDefault();
  }, {passive: false});

  // First-visit hint: a quiet "scroll down" prompt on the opening frame, gone for good once the
  // visitor moves (scroll, a skip link or the guide).
  const scrolled = () => {
    if (window.scrollY < 2 && !tour) return;
    root.classList.add("has-scrolled");
    window.removeEventListener("scroll", scrolled);
  };
  window.addEventListener("scroll", scrolled, {passive: true});
  scrolled();

  // Guided play-through: "Explore my work" plays the whole journey, as the previous site's film
  // did, at one uniform camera speed: it advances in the timeline's visual units, so the dive, the
  // passage, the projects and the pull-back all move alike. It ends on the closing portrait, and
  // any input hands control back.
  const GUIDE_SPEED = 2.75; // visual units per second (the eye at its own pace: EYE_PACE)
  function startTour() {
    const from = timeline.guideTimeAt(timeline.visualAt(clamp(scrollVh(lenis.scroll), 0, timeline.scrollTotal)));
    const to = timeline.guideTimeAt(timeline.visualTotal);
    if (to - from < 0.05) return false;
    tour = {from, to, elapsed: 0, last: performance.now(), duration: ((to - from) / GUIDE_SPEED) * 1000};
    html.classList.add("is-touring");
    root.classList.add("has-scrolled");
    return true;
  }
  function stopTour() {
    if (!tour) return;
    tour = null;
    html.classList.remove("is-touring");
  }
  function advanceTour(now) {
    // Real time keeps the speed uniform however fast the machine draws; only a long stall
    // (a hidden tab, a busy moment) is skipped rather than caught up in one jump.
    tour.elapsed += clamp(now - tour.last, 0, 250);
    tour.last = now;
    const t = clamp(tour.elapsed / tour.duration);
    // Ease in and out over about a third of a second; constant speed in between.
    const ramp = Math.min(0.06, 350 / tour.duration);
    const e = t < ramp ? (t * t) / (2 * ramp * (1 - ramp)) : t > 1 - ramp ? 1 - ((1 - t) ** 2) / (2 * ramp * (1 - ramp)) : (t - ramp / 2) / (1 - ramp);
    const visual = timeline.visualAtGuideTime(lerp(tour.from, tour.to, e));
    lenis.scrollTo(sectionTop + timeline.scrollAtVisual(visual) * view.svh, {immediate: true, force: true});
    if (t >= 1) stopTour();
  }
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) {
    window.addEventListener(type, (event) => {
      if (type === "pointerdown" && event.target.closest?.("[data-guide], [data-skip], [data-loader-skip]")) return;
      // The visitor's own scrolling overrides a pending skip.
      if (type === "wheel" || type === "touchstart" || /^(Arrow|Page|Home|End| )/.test(event.key || "")) pending = null;
      stopTour();
    }, {passive: true});
  }
  root.querySelectorAll("[data-guide]").forEach((button) => button.addEventListener("click", (event) => {
    // Without the journey (static page, reduced motion, still loading) the link simply goes to the work.
    if (!loop.journey || !ready || !timeline) return;
    if (startTour()) event.preventDefault();
  }));
  document.querySelectorAll("a[href='#work'][data-skip]").forEach((a) => a.addEventListener("click", (event) => {
    event.preventDefault();
    skipToWork();
  }));

  async function load() {
    try {
      manifest = await fetch("./assets/journey/manifest.json", {cache: "no-cache"}).then((r) => {
        if (!r.ok) throw new Error("Journey manifest unavailable.");
        return r.json();
      });
      plate = manifest.plate;
      // The pupil's measured outline is a touch oval: R(θ) = R0·(1 + e·cos 2(θ − φ)).
      const [e, phi] = plate.pupilShape || [0, 0];
      pupilShape = [e * Math.cos(2 * phi), e * Math.sin(2 * phi)];
      const connection = navigator.connection || {};
      // Both renderers get the sharpest media the screen can show (the CPU renderer mips it itself).
      const tierName = chooseTier({width: view.width, height: view.lvh, dpr: window.devicePixelRatio, coarse,
        memory: navigator.deviceMemory, cores: navigator.hardwareConcurrency, connection});
      const tier = manifest.tiers[tierName] || manifest.tiers.mid;
      root.dataset.tier = tierName;
      // The original photograph first (it is the page's poster, usually already cached), so the
      // hero appears at once; then the plates for the dive, then the passage.
      const order = ["L0o", "L0", "L1", "L2", "L1b", "neural", "circuit", "core"].filter((k) => tier[k]);
      const files = order.map((key) => ({key, src: tier[key].src, bytes: tier[key].bytes}));
      const cores = navigator.hardwareConcurrency || 2;
      if (cpu) {
        // Only machines without WebGL download the CPU renderer.
        const {CpuRenderer} = await import("./renderer2d.js?v=20261017-v3c");
        renderer = new CpuRenderer(cpu, {workers: cores >= 4 ? 2 : cores >= 2 ? 1 : 0});
      } else renderer = new JourneyRenderer(context, {shardCount: coarse ? 700 : 1400});
      planes = planeUniforms(tier);
      measure();
      const repeat = {neural: true, circuit: true};
      let heroShown = false;
      loop.files = files;
      // The last few percent are the renderer getting ready to draw (the CPU's lookup tables).
      const share = cpu ? 0.94 : 1;
      await fetchAll(files, {
        onProgress: (p) => setLoad(p * share),
        onFile: (key, bitmap) => {
          renderer.setTexture(key, bitmap, {repeat: !!repeat[key]});
          // Decoded images are freed as soon as the renderer has its own copy.
          bitmap.close?.();
          dirty = true;
          if ((key === "L0o" || (key === "L0" && !tier.L0o)) && !heroShown) {
            heroShown = true;
            ready = true;
            if (!loading) root.classList.add("is-ready");
            else if (performance.now() >= SOFT_WAIT) finishLoader();
          }
        },
      });
      root.classList.add("is-loaded");
      renderer.prepare?.(buildFrame(timeline.stateAt(0), 0).plates);
      dirty = true;
      if (loading && renderer.warmed) {
        if (loaderStatus) loaderStatus.textContent = "Preparing smooth scrolling.";
        const until = performance.now() + 4000;
        while (loading && !renderer.warmed() && performance.now() < until) await new Promise((r) => setTimeout(r, 100));
      }
      setLoad(1);
      // Let the meter reach the end before the screen lifts (not worth a wait on a quick load).
      if (loading) setTimeout(finishLoader, performance.now() < 1200 ? 0 : 300);
      if (status) status.textContent = "";
    } catch (error) {
      console.warn("[journey]", error);
      goStatic("The journey could not load, so the portfolio is shown directly.");
    }
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    ready = false;
  });
  canvas.addEventListener("webglcontextrestored", async () => {
    try {
      renderer = new JourneyRenderer(context, {shardCount: coarse ? 700 : 1400});
      measure();
      // Textures were freed after upload; the files come back from the HTTP cache.
      const repeat = {neural: true, circuit: true};
      await fetchAll(loop.files || [], {
        onFile: (key, bitmap) => {
          renderer.setTexture(key, bitmap, {repeat: !!repeat[key]});
          bitmap.close?.();
        },
      });
      ready = true;
    } catch {
      goStatic("Graphics were reset by the browser; the portfolio is shown directly.");
    }
  });

  // The header's motion switch can turn the journey off and back on without a reload.
  window.addEventListener("portfolio:motionchange", (event) => {
    lenis.options.smoothWheel = !event.detail?.reduced;
    if (event.detail?.reduced) {
      stopTour();
      goStatic("Reduced motion: the portfolio is shown without the camera journey.");
    } else if (html.classList.contains("journey-static")) {
      if (!(context || cpu) || !renderer) {
        location.reload();
        return;
      }
      html.classList.remove("journey-static");
      // Fresh overlay state: the static page changed what the old cache remembers.
      overlays = new Overlays(root);
      loop.journey = true;
      smoothScroll = null;
      measure();
      lenis.resize();
    }
  });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }, {rootMargin: "20% 0px"}).observe(root);

  let resizeTimer = 0;
  let lastWidth = view.width;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const next = stableViewport();
      // Mobile toolbars change the height only; keep the composition unless the width changed.
      if (coarse && Math.abs(next.width - lastWidth) < 2) return;
      const progress = timeline ? clamp(scrollVh(lenis.scroll) / timeline.scrollTotal) : 0;
      const inside = timeline && progress > 0 && progress < 1;
      lastWidth = next.width;
      measure();
      lenis.resize();
      if (inside) lenis.scrollTo(sectionTop + progress * timeline.scrollTotal * view.svh, {immediate: true, force: true});
      smoothScroll = null;
    }, 140);
  });

  if (loop.journey) {
    html.classList.add("is-journey");
    measure();
    startLoader();
    load();
  } else finishLoader();
  requestAnimationFrame(frame);
  if (capture) {
    window.__journey = {
      ready: () => ready && root.classList.contains("is-loaded") && (renderer?.warmed?.() ?? true),
      total: () => timeline.scrollTotal,
      frame: async (scroll, time = 10, velocity = 0) => {
        lenis.scrollTo(sectionTop + scroll * view.svh, {immediate: true, force: true});
        introStart = 0;
        const state = await renderAt(scroll, time, velocity);
        return {chapter: state.chapter, phase: state.phase, t: +state.t.toFixed(3)};
      },
    };
  }
  return {lenis, getState: () => ({ready, tier: root.dataset.tier, renderScale, scroll: smoothScroll, total: timeline?.scrollTotal})};
}
