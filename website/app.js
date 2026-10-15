import { initJourney } from "./js/journey/journey.js?v=20261015-v3";

export const MOTION_STORAGE_KEY = "vh:motion";
const MOTION_PREFERENCES = new Set(["system", "full", "reduced"]);

export function readMotionPreference(storage) {
  try {
    const preference = storage?.getItem(MOTION_STORAGE_KEY);
    return MOTION_PREFERENCES.has(preference) ? preference : "system";
  } catch {
    return "system";
  }
}

export function writeMotionPreference(storage, preference) {
  if (!MOTION_PREFERENCES.has(preference)) return false;
  try {
    if (!storage) return false;
    storage.setItem(MOTION_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

export function resolveReducedMotion(preference, systemReduced) {
  if (preference === "full") return false;
  if (preference === "reduced") return true;
  return Boolean(systemReduced);
}

function getLocalStorage(win) {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
}

export function initMotionPreference(doc = document, win = window) {
  const root = doc.documentElement;
  const controls = [...doc.querySelectorAll("[data-motion-toggle]")];
  const media = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  const storage = getLocalStorage(win);
  let preference = readMotionPreference(storage);

  function apply(source = "initial") {
    const reduced = resolveReducedMotion(preference, media?.matches);
    root.dataset.motion = reduced ? "reduced" : "full";
    root.dataset.motionPreference = preference;
    controls.forEach((control) => {
      control.hidden = false;
      control.setAttribute("aria-pressed", String(reduced));
      control.setAttribute("aria-label", reduced
        ? "Motion off — select to enable animation"
        : "Motion on — select to reduce animation");
      control.title = reduced
        ? "Reduced motion is on. Select to enable motion."
        : "Select to reduce motion.";
      const label = control.querySelector("[data-motion-label]");
      if (label) label.textContent = reduced ? "Motion off" : "Motion on";
    });
    win.dispatchEvent(
      new win.CustomEvent("portfolio:motionchange", {
        detail: { preference, reduced, source },
      }),
    );
    return reduced;
  }

  controls.forEach((control) => {
    control.addEventListener("click", () => {
      preference =
        root.dataset.motion === "reduced" ? "full" : "reduced";
      writeMotionPreference(storage, preference);
      apply("user");
    });
  });
  const onSystemChange = () => {
    if (preference === "system") apply("system");
  };
  if (media?.addEventListener) {
    media.addEventListener("change", onSystemChange);
  } else {
    media?.addListener?.(onSystemChange);
  }
  win.addEventListener("storage", (event) => {
    if (event.key === MOTION_STORAGE_KEY || event.key === null) {
      preference = readMotionPreference(storage);
      apply("storage");
    }
  });
  apply();
  return {
    getPreference: () => preference,
    useSystemPreference() {
      preference = "system";
      writeMotionPreference(storage, preference);
      apply("user");
    },
  };
}

/** A dropdown, not a modal: desktop navigation stays in the normal tab order. */
export function initMobileMenu({
  header,
  menu,
  toggle,
  doc = document,
  mediaQuery = window.matchMedia("(max-width: 860px)"),
}) {
  if (!header || !menu || !toggle) return null;
  toggle.hidden = false;

  function setOpen(open, returnFocus = false) {
    const next = Boolean(open && mediaQuery.matches);
    menu.classList.toggle("is-open", next);
    toggle.setAttribute("aria-expanded", String(next));
    const label = toggle.querySelector("[data-menu-label]");
    if (label) label.textContent = next ? "Close" : "Menu";
    if (!next && returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  menu.addEventListener("click", (event) => {
    if (event.target.closest?.('a[href^="#"]')) setOpen(false);
  });
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  doc.addEventListener("pointerdown", (event) => {
    if (!header.contains(event.target)) setOpen(false);
  });
  doc.addEventListener("focusin", (event) => {
    if (!header.contains(event.target)) setOpen(false);
  });
  const onResize = () => {
    if (!mediaQuery.matches) setOpen(false);
  };
  if (mediaQuery.addEventListener) mediaQuery.addEventListener("change", onResize);
  else mediaQuery.addListener?.(onResize);
  setOpen(false);
  return { setOpen };
}

export function initFullscreen(doc=document,win=window) {
  const button=doc.getElementById('fullscreen-toggle');
  if(!button||!doc.fullscreenEnabled||typeof doc.documentElement.requestFullscreen!=='function')return null;
  const status=doc.getElementById('fullscreen-status');
  let pending=false;
  function sync() {
    const active=Boolean(doc.fullscreenElement);
    button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',active?'Exit fullscreen':'View website fullscreen');
    button.title=active?'Exit fullscreen · Esc':'View fullscreen';
  }
  button.hidden=false;sync();
  button.addEventListener('click',async()=>{
    if(pending)return;pending=true;
    if(status)status.textContent='';
    win.dispatchEvent(new win.CustomEvent('portfolio:fullscreenwillchange'));
    try {
      if(doc.fullscreenElement)await doc.exitFullscreen();
      else await doc.documentElement.requestFullscreen({navigationUI:'hide'});
    } catch {
      if(status)status.textContent='Fullscreen is not available in this browser right now.';
    } finally {pending=false;sync();}
  });
  doc.addEventListener('fullscreenchange',()=>{
    if(status)status.textContent='';
    sync();
    win.dispatchEvent(new win.CustomEvent('portfolio:fullscreenchange'));
  });
  doc.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&doc.fullscreenElement&&!doc.querySelector('dialog[open]')) {
      win.dispatchEvent(new win.CustomEvent('portfolio:fullscreenwillchange'));
      Promise.resolve(doc.exitFullscreen()).catch(()=>{});
    }
  });
  return{sync};
}

function initPortraitFallback(doc) {
  const image = doc.querySelector("#hero-portrait img");
  if (!image) return;
  const markUnavailable = () => {
    image.hidden = true;
    image.closest(".hero-visual")?.classList.add("portrait-unavailable");
  };
  image.addEventListener("error", markUnavailable, { once: true });
  if (image.complete && image.naturalWidth === 0) markUnavailable();
}

function failOpenMotion(doc) {
  const loader=doc.getElementById("experience-loader");
  if(loader)loader.hidden=true;
  const intro = doc.getElementById("cinematic-intro");
  if (intro) intro.hidden = true;
  const site = doc.getElementById("site-content");
  if (site) {
    site.inert = false;
    site.removeAttribute("aria-hidden");
  }
  const replay = doc.getElementById("replay-intro");
  if (replay) {
    replay.disabled = true;
    replay.title = "The optional film is unavailable. The portfolio is fully accessible.";
  }
  const availability = doc.getElementById("intro-availability");
  if (availability) availability.textContent =
    "The optional film is unavailable. All portfolio content is accessible below.";
}

export function initSite(doc = document, win = window) {
  doc.documentElement.classList.add("js");
  initMotionPreference(doc, win);
  initMobileMenu({
    header: doc.querySelector(".site-header"),
    menu: doc.getElementById("primary-navigation"),
    toggle: doc.getElementById("menu-toggle"),
    doc,
    mediaQuery: win.matchMedia("(max-width: 860px)"),
  });
  initFullscreen(doc, win);
  initPortraitFallback(doc);

  // The scroll journey owns the opening section; js/sections.js enhances the
  // portfolio sections. If the journey cannot start, the page stays fully usable.
  try {
    initJourney();
  } catch (error) {
    console.warn("[journey]", error);
    doc.documentElement.classList.add("journey-static");
  }
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initSite(), { once: true });
  } else {
    initSite();
  }
}
