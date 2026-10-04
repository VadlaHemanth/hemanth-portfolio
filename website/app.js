import { PROFILE, getProject } from "./content.js?v=20261004-3";
import { initMotion } from "./motion.js?v=20261004-3";
import { initSkills } from "./skills.js?v=20261004-3";

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

export async function copyProfileUrl(clipboard, url = PROFILE.github) {
  try {
    if (typeof clipboard?.writeText !== "function") return false;
    await clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
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

export function initDisclosure(trigger, panel) {
  if (!trigger || !panel) return null;
  trigger.hidden = false;

  function setExpanded(expanded) {
    trigger.setAttribute("aria-expanded", String(Boolean(expanded)));
    panel.hidden = !expanded;
    const symbol = trigger.querySelector(".disclosure-symbol");
    if (symbol) symbol.textContent = expanded ? "−" : "+";
  }
  trigger.addEventListener("click", () => {
    setExpanded(trigger.getAttribute("aria-expanded") !== "true");
  });
  setExpanded(false);
  return { setExpanded };
}

function textElement(doc, tag, text, className) {
  const element = doc.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function renderCaseStudy(project, doc = document) {
  if (!project) return false;
  const title = doc.getElementById("case-title");
  const content = doc.getElementById("case-content");
  const links = doc.getElementById("case-links");
  if (!title || !content || !links) return false;

  doc.getElementById("case-kicker").textContent =
    `${project.number} / ${project.category}`;
  doc.getElementById("case-status").textContent = project.status;
  title.textContent = `${project.title} / ${project.subtitle}`;
  doc.getElementById("case-description").textContent = project.description;
  content.replaceChildren();
  links.replaceChildren();

  function addSection(label, child) {
    const section = doc.createElement("section");
    section.className = "case-section";
    section.append(textElement(doc, "h3", label), child);
    content.append(section);
  }

  addSection("The problem", textElement(doc, "p", project.problem));
  addSection("My contribution", textElement(doc, "p", project.contribution));
  const pipeline = doc.createElement("ol");
  pipeline.className = "case-architecture";
  project.architecture.forEach((step) => {
    const item = doc.createElement("li");
    item.append(
      textElement(doc, "strong", step.title),
      textElement(doc, "span", step.text),
    );
    pipeline.append(item);
  });
  addSection("How it works", pipeline);
  addSection("Where it stands", textElement(doc, "p", project.evidence));
  const limitations = doc.createElement("ul");
  project.limitations.forEach((limit) => {
    limitations.append(textElement(doc, "li", limit));
  });
  addSection("Limits and context", limitations);

  project.links.forEach((link) => {
    const anchor = textElement(doc, "a", link.label, "button button-primary");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    const arrow = textElement(doc, "span", "↗");
    arrow.setAttribute("aria-hidden", "true");
    anchor.append(arrow);
    links.append(anchor);
  });
  if (!project.links.length) {
    links.append(
      textElement(doc, "p", "This research is private. I’m happy to talk through the approach."),
    );
    const profile = textElement(doc, "a", "Visit my GitHub profile ↗", "text-link");
    profile.href = PROFILE.github;
    profile.target = "_blank";
    profile.rel = "noopener noreferrer";
    links.append(profile);
  }
  return true;
}

export function initProjectDialogs(doc = document) {
  const dialog = doc.getElementById("project-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return null;
  let returnTarget = null;
  let pointerBeganOutside = false;

  function close() {
    if (dialog.open) dialog.close();
  }
  function open(id, trigger) {
    const project = getProject(id);
    if (!project || !renderCaseStudy(project, doc)) return false;
    returnTarget = trigger;
    dialog.showModal();
    doc.documentElement.classList.add("dialog-open");
    dialog.scrollTop = 0;
    doc.getElementById("case-title").focus({ preventScroll: true });
    return true;
  }

  doc.querySelectorAll("[data-project]").forEach((trigger) => {
    if (!getProject(trigger.dataset.project)) return;
    trigger.hidden = false;
    trigger.setAttribute("aria-controls", "project-dialog");
    const fallback = doc.getElementById(`case-${trigger.dataset.project}`);
    if (fallback) fallback.hidden = true;
    trigger.addEventListener("click", () => open(trigger.dataset.project, trigger));
  });
  // Project planes are created by the motion layer after the rest of the site.
  doc.addEventListener("click", (event) => {
    const trigger=event.target.closest?.("[data-screen-project]");
    if(!trigger)return;
    if(open(trigger.dataset.screenProject,trigger))event.preventDefault();
  });
  doc.getElementById("close-project-dialog").addEventListener("click", close);
  dialog.addEventListener("close", () => {
    doc.documentElement.classList.remove("dialog-open");
    if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    returnTarget = null;
  });
  function outsideBounds(event) {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom;
  }
  dialog.addEventListener("pointerdown", (event) => {
    pointerBeganOutside = event.target === dialog && outsideBounds(event);
  });
  dialog.addEventListener("click", (event) => {
    if (pointerBeganOutside && event.target === dialog && outsideBounds(event)) close();
    pointerBeganOutside = false;
  });
  return { open, close };
}

export function initCopyProfile(doc = document, nav = navigator) {
  const button = doc.getElementById("copy-profile-link");
  const status = doc.getElementById("copy-status");
  const fallback = doc.getElementById("copy-fallback");
  const input = doc.getElementById("profile-url");
  if (!button || !status || !fallback || !input) return;
  button.hidden = false;
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = "";
    let clipboard;
    try { clipboard = nav.clipboard; } catch { /* Use the visible manual fallback. */ }
    const copied = await copyProfileUrl(clipboard);
    fallback.hidden = copied;
    status.textContent = copied
      ? "Profile link copied. Thanks for taking a look."
      : "Automatic copy isn’t available here. The link below is selected for you to copy.";
    if (!copied) {
      input.value = PROFILE.github;
      input.focus();
      input.select();
    }
    button.disabled = false;
  });
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

function initScrollEnhancements(doc, win) {
  if (typeof win.IntersectionObserver !== "function") return;
  const reveals = new win.IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-revealed");
      reveals.unobserve(entry.target);
    });
  }, { threshold: .08 });
  doc.querySelectorAll("[data-reveal]").forEach((element) => reveals.observe(element));

  const navLinks = [...doc.querySelectorAll('.site-nav a[href^="#"]')];
  const activeSections = new Map();
  const navObserver = new win.IntersectionObserver((entries) => {
    entries.forEach((entry) => activeSections.set(entry.target.id, entry.isIntersecting));
    const current = [...activeSections].find(([, visible]) => visible)?.[0];
    navLinks.forEach((link) => {
      if (current && link.hash === `#${current}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }, { rootMargin: "-15% 0px -55% 0px", threshold: 0 });
  navLinks.forEach((link) => {
    const section = doc.getElementById(link.hash.slice(1));
    if (section) navObserver.observe(section);
  });
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
  doc.querySelectorAll("[data-hood-toggle]").forEach((trigger) => {
    initDisclosure(trigger, doc.getElementById(trigger.getAttribute("aria-controls")));
  });
  initProjectDialogs(doc);
  initCopyProfile(doc, win.navigator);
  initFullscreen(doc, win);
  initPortraitFallback(doc);
  initScrollEnhancements(doc, win);
  initSkills(doc);

  // Playback, manifest selection, source loading, focus containment, and cleanup
  // belong to motion.js. Site interactions are ready before it runs.
  try {
    Promise.resolve(initMotion()).catch(() => failOpenMotion(doc));
  } catch {
    failOpenMotion(doc);
  }
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initSite(), { once: true });
  } else {
    initSite();
  }
}
