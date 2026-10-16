/**
 * Inside Hemanth: the scroll journey.
 * The camera lives in code. Every frame is computed from the scroll position
 * (smoothed by Lenis), so the journey plays forward and backward at one
 * consistent pace instead of scrubbing a video.
 */
import Lenis from "../../vendor/lenis.js?v=20261016-v3b";
import {createContext} from "./gl.js?v=20261016-v3b";
import {JourneyRenderer} from "./renderer.js?v=20261016-v3b";
import {createTimeline, zoomCamera, CHAMBER_DEPTH, smoothstep} from "./timeline.js?v=20261016-v3b";
import {Overlays, layoutCards} from "./overlays.js?v=20261016-v3b";
import {chooseTier, fetchAll} from "./assets.js?v=20261016-v3b";

const CORE_SIZE = 0.9;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function stableViewport() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  const svh = probe.getBoundingClientRect().height || innerHeight;
  probe.style.height = "100lvh";
  const lvh = probe.getBoundingClientRect().height || innerHeight;
  probe.remove();
  return {width: document.documentElement.clientWidth, svh: Math.round(svh), lvh: Math.round(Math.max(lvh, svh))};
}

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

  function measure() {
    view = stableViewport();
    if (plate) {
      timeline = createTimeline(view.width, view.svh, plate);
      root.style.height = `${Math.round(timeline.scrollTotal * view.svh + view.lvh)}px`;
    }
    stage.style.setProperty("--stage-h", `${view.lvh}px`);
    stage.style.setProperty("--frame-h", `${view.svh}px`);
    sectionTop = root.getBoundingClientRect().top + window.scrollY;
    if (cpu) {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer?.setViewport(view.width, view.lvh, dpr);
      if (plate) renderer?.warm([view.width / 2, view.svh / 2, Math.min(view.width, view.svh) / 2]);
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
      const cam = zoomCamera(state.zoomLog + breath, width, svh, plate, timeline.zoomLen);
      const pupilR = plate.pupilRadius * (1 + 0.55 * state.dilation) * cam.sigma;
      windowCircle = [cam.pupil[0], cam.pupil[1], state.window > 0 ? pupilR * smoothstep(0, 1, state.window * 1.4) : 0];
      frameCenter[0] = cam.pupil[0];
      frameCenter[1] = cam.pupil[1];
      f.plates = {
        zoomLog: state.zoomLog + breath,
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
    lenis.raf(now);
    const dt = lastTime ? Math.min(100, now - lastTime) : 16.7;
    lastTime = now;
    // The header's journey styling follows the scroll position even when the stage is off screen.
    if (timeline) setJourneyClass(loop.journey && scrollVh(lenis.scroll) < timeline.scrollTotal - 0.02);
    if (!loop.journey || !ready || !visible || document.hidden) return;
    const target = scrollVh(lenis.scroll);
    if (smoothScroll === null) smoothScroll = target;
    // A light extra damping removes the last bit of input jitter (touch and keyboard steps).
    smoothScroll += (target - smoothScroll) * (1 - Math.exp(-dt / (coarse ? 65 : 45)));
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

  document.querySelectorAll("a[href='#work'][data-skip]").forEach((a) => a.addEventListener("click", (event) => {
    event.preventDefault();
    const work = document.getElementById("work");
    if (!work) return;
    lenis.scrollTo(work, {immediate: true, force: true});
    work.setAttribute("tabindex", "-1");
    work.focus({preventScroll: true});
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
      const order = ["L0", "L1", "L2", "L1b", "neural", "circuit", "core"].filter((k) => tier[k]);
      const files = order.map((key) => ({key, src: tier[key].src, bytes: tier[key].bytes}));
      const cores = navigator.hardwareConcurrency || 2;
      if (cpu) {
        // Only machines without WebGL download the CPU renderer.
        const {CpuRenderer} = await import("./renderer2d.js?v=20261016-v3b");
        renderer = new CpuRenderer(cpu, {workers: cores >= 4 ? 2 : cores >= 2 ? 1 : 0});
      } else renderer = new JourneyRenderer(context, {shardCount: coarse ? 700 : 1400});
      planes = planeUniforms(tier);
      measure();
      const repeat = {neural: true, circuit: true};
      let heroShown = false;
      loop.files = files;
      await fetchAll(files, {
        onProgress: (p) => loaderLine?.style.setProperty("--load", p.toFixed(4)),
        onFile: (key, bitmap) => {
          renderer.setTexture(key, bitmap, {repeat: !!repeat[key]});
          // Decoded images are freed as soon as the renderer has its own copy.
          bitmap.close?.();
          dirty = true;
          if (key === "L0" && !heroShown) {
            heroShown = true;
            ready = true;
            root.classList.add("is-ready");
          }
        },
      });
      root.classList.add("is-loaded");
      renderer.prepare?.(buildFrame(timeline.stateAt(0), 0).plates);
      dirty = true;
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
    load();
  }
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
