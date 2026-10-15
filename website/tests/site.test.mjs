import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MOTION_STORAGE_KEY,
  readMotionPreference,
  writeMotionPreference,
  resolveReducedMotion,
  initMotionPreference,
  initMobileMenu,
  initFullscreen,
} from "../app.js";
import { PROFILE, PROJECTS, getProject } from "../content.js";

// Minimal DOM doubles exercise our event wiring without running a browser or
// installing dependencies. Native dialog focus trapping still needs browser QA.
class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.dataset = {};
    this.queries = new Map();
    this.hidden = true;
    this.textContent = "";
    this.isConnected = true;
    this.focused = false;
    this.classes = new Set();
    this.classList = {
      toggle: (name, value) => {
        const next = value ?? !this.classes.has(name);
        next ? this.classes.add(name) : this.classes.delete(name);
        return next;
      },
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
  }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  emit(type, properties = {}) {
    const event = { target: this, ...properties };
    return Promise.all((this.listeners.get(type) ?? []).map((listener) => listener(event)));
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  querySelector(selector) { return this.queries.get(selector) ?? null; }
  querySelectorAll(selector) { return this.queries.get(selector) ?? []; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  focus() { this.focused = true; }
}

class Document extends Element {
  constructor() {
    super("document");
    this.documentElement = new Element("html");
    this.ids = new Map();
  }
  getElementById(id) { return this.ids.get(id) ?? null; }
  createElement(tag) { return new Element(tag); }
}

function memoryStorage(initial) {
  const values = new Map(initial ? [[MOTION_STORAGE_KEY, initial]] : []);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("public identity and exactly three real projects", () => {
  assert.equal(PROFILE.displayName, "VADLA HEMANTH");
  assert.equal(PROFILE.github, "https://github.com/VadlaHemanth");
  assert.deepEqual(PROJECTS.map((project) => project.id), ["attendance", "satellite", "memory"]);
  assert.equal(getProject("unknown"), null);
  for (const project of PROJECTS) {
    for (const key of ["problem", "contribution", "evidence", "status"]) {
      assert.ok(project[key].length > 10);
    }
    assert.equal(project.architecture.length, 4);
    assert.ok(project.limitations.length >= 2);
  }
  assert.match(getProject("attendance").status, /prototype.*private/i);
  assert.match(getProject("satellite").status, /prototype.*private/i);
  assert.match(getProject("memory").status, /demo/i);
  assert.match(getProject("attendance").evidence, /earlier.*not the current/i);
});

test("major project links are verified public repositories", () => {
  assert.deepEqual(PROJECTS.flatMap((project) => project.links.map((link) => link.url)), [
    "https://github.com/Vadla-Hemanth/Automatic-Attendance-System",
    "https://github.com/VadlaHemanth/vendor-payment-memory-agent",
  ]);
  assert.match(getProject("satellite").limitations.join(" "), /(?:cannot establish.*vessel|does not establish proven attribution)/);
  assert.match(getProject("memory").limitations.join(" "), /(?:demo|demonstration|not verified clients)/i);
});

test("motion preference defaults to system and rejects corrupt values", () => {
  assert.equal(readMotionPreference(memoryStorage()), "system");
  assert.equal(readMotionPreference(memoryStorage("full")), "full");
  assert.equal(readMotionPreference(memoryStorage("reduced")), "reduced");
  assert.equal(readMotionPreference(memoryStorage("unexpected")), "system");
  assert.equal(readMotionPreference(null), "system");
  assert.equal(readMotionPreference({ getItem() { throw new Error("blocked"); } }), "system");
});

test("storage failures do not block preference changes", () => {
  const storage = memoryStorage();
  assert.equal(writeMotionPreference(storage, "reduced"), true);
  assert.equal(readMotionPreference(storage), "reduced");
  assert.equal(writeMotionPreference(storage, "invalid"), false);
  assert.equal(writeMotionPreference(null, "full"), false);
  assert.equal(writeMotionPreference({ setItem() { throw new Error("quota"); } }, "full"), false);
});

test("explicit preference and operating-system preference resolve predictably", () => {
  assert.equal(resolveReducedMotion("system", true), true);
  assert.equal(resolveReducedMotion("system", false), false);
  assert.equal(resolveReducedMotion("reduced", false), true);
  assert.equal(resolveReducedMotion("full", true), false);
});

test("visible preference updates labels, ARIA, storage, and motion-module event", async () => {
  const doc = new Document();
  const button = new Element("button");
  const label = new Element("span");
  button.queries.set("[data-motion-label]", label);
  doc.queries.set("[data-motion-toggle]", [button]);
  const media = new Element();
  media.matches = true;
  const win = new Element();
  win.localStorage = memoryStorage();
  win.matchMedia = () => media;
  win.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init.detail; }
  };
  const events = [];
  win.dispatchEvent = (event) => events.push(event);
  const controller = initMotionPreference(doc, win);
  assert.equal(button.hidden, false);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(doc.documentElement.dataset.motion, "reduced");
  assert.equal(label.textContent, "Motion off");
  await button.emit("click");
  assert.equal(doc.documentElement.dataset.motion, "full");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(readMotionPreference(win.localStorage), "full");
  assert.equal(events.at(-1).type, "portfolio:motionchange");
  assert.deepEqual(events.at(-1).detail, { preference: "full", reduced: false, source: "user" });
  controller.useSystemPreference();
  assert.equal(doc.documentElement.dataset.motion, "reduced");
  media.matches = false;
  await media.emit("change");
  assert.equal(doc.documentElement.dataset.motion, "full");
});

function menuFixture() {
  const doc = new Document();
  const menu = new Element("nav");
  const toggle = new Element("button");
  const label = new Element("span");
  toggle.queries.set("[data-menu-label]", label);
  const header = new Element("header");
  header.contains = (target) => [header, menu, toggle, label].includes(target);
  const mediaQuery = new Element();
  mediaQuery.matches = true;
  const controller = initMobileMenu({ header, menu, toggle, doc, mediaQuery });
  return { doc, menu, toggle, header, label, mediaQuery, controller };
}

test("mobile menu opens, closes with Escape, and restores toggle focus", async () => {
  const { toggle, menu, doc, label } = menuFixture();
  assert.equal(toggle.hidden, false);
  await toggle.emit("click");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(menu.classList.contains("is-open"), true);
  assert.equal(label.textContent, "Close");
  let prevented = false;
  await doc.emit("keydown", { key: "Escape", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.focused, true);
});

test("mobile menu closes on outside pointer, outside focus, navigation, and desktop resize", async () => {
  const { toggle, menu, doc, mediaQuery, controller } = menuFixture();
  for (const event of ["pointerdown", "focusin"]) {
    controller.setOpen(true);
    await doc.emit(event, { target: new Element() });
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
  }
  controller.setOpen(true);
  await menu.emit("click", { target: { closest() { return {}; } } });
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  controller.setOpen(true);
  mediaQuery.matches = false;
  await mediaQuery.emit("change");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  controller.setOpen(true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});

test("fullscreen is optional, accessible, toggles natively and follows Escape", async () => {
  const doc=new Document(),button=new Element('button'),status=new Element(),win=new Element();
  doc.ids.set('fullscreen-toggle',button);doc.ids.set('fullscreen-status',status);
  win.CustomEvent=class {constructor(type){this.type=type;}};
  win.dispatchEvent=event=>win.emit(event.type);
  assert.equal(initFullscreen(doc,win),null);
  assert.equal(button.hidden,true);
  doc.fullscreenEnabled=true;
  doc.documentElement.requestFullscreen=async()=>{doc.fullscreenElement=doc.documentElement;await doc.emit('fullscreenchange');};
  doc.exitFullscreen=async()=>{doc.fullscreenElement=null;await doc.emit('fullscreenchange');};
  initFullscreen(doc,win);
  assert.equal(button.hidden,false);
  await button.emit('click');
  assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(button.getAttribute('aria-label'),'Exit fullscreen');
  await button.emit('click');
  assert.equal(button.getAttribute('aria-pressed'),'false');
  await button.emit('click');
  doc.fullscreenElement=null;await doc.emit('fullscreenchange');
  assert.equal(button.getAttribute('aria-pressed'),'false');
  doc.documentElement.requestFullscreen=async()=>{throw new Error('Denied');};
  await button.emit('click');
  assert.match(status.textContent,/not available/);
});

test("token text colours meet WCAG AA on the pure black base", () => {
  const tokens = readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8");
  const token = (name) => tokens.match(new RegExp(`--${name}:\\s*#([0-9a-f]{6})`, "i"))?.[1];
  function luminance(hex) {
    const rgb = hex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16) / 255);
    const linear = rgb.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  }
  const ratio = (a, b) => {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (lighter + .05) / (darker + .05);
  };
  const black = token("void");
  assert.equal(black, "000000");
  // Body and secondary copy, link hover and the signal used for focus rings.
  for (const name of ["sclera", "mist", "spark", "signal"]) {
    assert.ok(ratio(token(name), black) >= 4.5, `${name} on void`);
  }
  // --dim is reserved for large or decorative use: it must not colour small section text.
  assert.ok(ratio(token("dim"), black) >= 3, "dim still passes for large text");
  // Its only colour uses: the unlit flow icons and the first frame of a title reveal.
  const css = readFileSync(new URL("../css/sections.css", import.meta.url), "utf8")
    .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
    .replace(/\.flow-node \{[^}]*\}/, "")
    .replace(/@media print \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  assert.doesNotMatch(css, /color:\s*var\(--dim\)/);
});
