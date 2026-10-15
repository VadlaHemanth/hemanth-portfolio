import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NAV_TARGETS,
  navTargetFor,
  motionAllowed,
  copyText,
  emailFromHref,
  initMotionGate,
  initNavState,
  initCopyEmail,
} from "../js/sections.js";
import { PROJECTS as MAJOR } from "../content.js";
import { PROJECTS, EXPERIENCE } from "../content-enrichment.js";

const website = fileURLToPath(new URL("../", import.meta.url));
const html = readFileSync(path.join(website, "index.html"), "utf8");
const section = (id) => html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`))?.[0] ?? "";

/* Small DOM doubles, enough for the event wiring. */
class Node {
  constructor(attrs = {}) {
    this.attrs = new Map(Object.entries(attrs));
    this.listeners = new Map();
    this.hidden = true;
    this.textContent = "";
    this.classes = new Set();
    this.classList = {
      toggle: (name, on) => (on ?? !this.classes.has(name)) ? this.classes.add(name) : this.classes.delete(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
  }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  toggleAttribute(name, on) { on ? this.attrs.set(name, "") : this.attrs.delete(name); return on; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  async emit(type, event = {}) { for (const fn of this.listeners.get(type) ?? []) await fn(event); }
}

test("each section maps to the navigation link that represents it", () => {
  assert.equal(navTargetFor("work"), "work");
  assert.equal(navTargetFor("more-work"), "work");
  assert.equal(navTargetFor("experience"), "experience");
  assert.equal(navTargetFor("education"), "experience");
  assert.equal(navTargetFor("about"), "about");
  assert.equal(navTargetFor("skills"), "skills");
  assert.equal(navTargetFor("contact"), "contact");
  assert.equal(navTargetFor("top"), null);
  assert.equal(navTargetFor("constructor"), null);
  assert.ok(Object.isFrozen(NAV_TARGETS));
  // Every mapped section exists, and every target is a header link.
  for (const [id, target] of Object.entries(NAV_TARGETS)) {
    assert.match(html, new RegExp(`<section id="${id}"`));
    assert.match(html, new RegExp(`<a href="#${target}">`));
  }
});

test("the site motion setting wins over the system preference", () => {
  const root = (motion) => ({ dataset: motion ? { motion } : {} });
  assert.equal(motionAllowed(root("full"), { matches: true }), true);
  assert.equal(motionAllowed(root("reduced"), { matches: false }), false);
  assert.equal(motionAllowed(root(), { matches: true }), false);
  assert.equal(motionAllowed(root(), { matches: false }), true);
  assert.equal(motionAllowed(root(), undefined), true);
});

test("the motion gate follows preference changes", async () => {
  const documentElement = new Node();
  documentElement.dataset = {};
  const media = new Node();
  media.matches = false;
  const win = new Node();
  win.matchMedia = () => media;
  initMotionGate({ documentElement }, win);
  assert.equal(documentElement.hasAttribute("data-sections-motion"), true);
  documentElement.dataset.motion = "reduced";
  await win.emit("portfolio:motionchange");
  assert.equal(documentElement.hasAttribute("data-sections-motion"), false);
  delete documentElement.dataset.motion;
  media.matches = true;
  await media.emit("change");
  assert.equal(documentElement.hasAttribute("data-sections-motion"), false);
});

test("clipboard success, refusal and absence are all handled", async () => {
  let copied;
  assert.equal(await copyText({ async writeText(text) { copied = text; } }, "a@b.c"), true);
  assert.equal(copied, "a@b.c");
  assert.equal(await copyText(undefined, "a@b.c"), false);
  assert.equal(await copyText({ async writeText() { throw new Error("denied"); } }, "a@b.c"), false);
  assert.equal(emailFromHref("mailto:vadlahemanth123@gmail.com"), "vadlahemanth123@gmail.com");
  assert.equal(emailFromHref("mailto:a%40b.c?subject=Hi"), "a@b.c");
  assert.equal(emailFromHref("https://example.com"), null);
});

function emailFixture(clipboard) {
  const button = new Node();
  const status = new Node();
  const link = new Node({ href: "mailto:vadlahemanth123@gmail.com" });
  const selected = [];
  const doc = {
    querySelector: (selector) => ({ "[data-copy-email]": button, "[data-copy-status]": status, "[data-email]": link })[selector] ?? null,
    createRange: () => ({ selectNodeContents: (node) => selected.push(node) }),
  };
  const win = {
    navigator: { clipboard },
    setTimeout: () => 1,
    clearTimeout: () => {},
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
  };
  return { button, status, link, selected, controller: initCopyEmail(doc, win) };
}

test("copy email reveals its button and confirms what happened", async () => {
  let copied;
  const ok = emailFixture({ async writeText(text) { copied = text; } });
  assert.equal(ok.button.hidden, false);
  await ok.button.emit("click");
  assert.equal(copied, "vadlahemanth123@gmail.com");
  assert.match(ok.status.textContent, /^Copied\./);
  assert.equal(ok.button.classList.contains("is-done"), true);

  const refused = emailFixture({ async writeText() { throw new Error("denied"); } });
  await refused.button.emit("click");
  assert.deepEqual(refused.selected, [refused.link], "the address is selected for a manual copy");
  assert.match(refused.status.textContent, /selected/);
  assert.equal(initCopyEmail({ querySelector: () => null }, {}), null);
});

test("navigation marks the section crossing the reading line", () => {
  const links = ["work", "experience", "about", "skills", "contact"].map((id) => {
    const link = new Node();
    link.hash = `#${id}`;
    return link;
  });
  const sections = Object.fromEntries(Object.keys(NAV_TARGETS).map((id) => [id, Object.assign(new Node(), { id })]));
  const footer = new Node();
  let observerCallback;
  const observed = [];
  const win = {
    IntersectionObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe(element) { observed.push(element); }
      disconnect() {}
    },
  };
  const doc = {
    querySelectorAll: () => links,
    getElementById: (id) => sections[id] ?? null,
    querySelector: () => footer,
  };
  const nav = initNavState(doc, win);
  assert.equal(observed.length, Object.keys(NAV_TARGETS).length + 1);
  const cross = (element, isIntersecting) => observerCallback([{ target: element, isIntersecting }]);
  cross(sections.education, true);
  assert.equal(nav.current(), "experience");
  assert.equal(links[1].getAttribute("aria-current"), "location");
  cross(sections.education, false);
  cross(sections["more-work"], true);
  assert.equal(nav.current(), "work");
  assert.equal(links[1].getAttribute("aria-current"), null);
  cross(sections["more-work"], false);
  cross(footer, true);
  assert.equal(nav.current(), "contact");
  cross(footer, false);
  assert.equal(nav.current(), null, "nothing is current during the journey");
  assert.ok(links.every((link) => link.getAttribute("aria-current") === null));
});

test("the generated catalog in index.html is current", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "sections-"));
  try {
    for (const file of ["build-content.mjs", "content.js", "content-enrichment.js", "index.html", "package.json"]) {
      cpSync(path.join(website, file), path.join(temp, file));
    }
    execFileSync(process.execPath, ["build-content.mjs"], { cwd: temp, stdio: "pipe" });
    assert.equal(readFileSync(path.join(temp, "index.html"), "utf8"), html, "run node website/build-content.mjs");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("selected work keeps private work private and prototypes labelled", () => {
  const work = section("work");
  for (const project of MAJOR) {
    assert.match(work, new RegExp(`id="case-${project.id}"`));
    assert.ok(work.includes(project.status), `${project.id} status shown`);
    for (const limit of project.limitations) assert.ok(work.includes(limit), `${project.id} limitation shown`);
  }
  const links = [...work.matchAll(/href="(https:[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(links, [
    "https://github.com/Vadla-Hemanth/Automatic-Attendance-System",
    "https://github.com/VadlaHemanth/vendor-payment-memory-agent",
  ]);
  const satellite = work.match(/<article id="case-satellite"[\s\S]*?<\/article>/)[0];
  assert.doesNotMatch(satellite, /href="http/, "satellite research stays private");
  assert.match(work, /Earlier prototype on GitHub/);
  assert.match(work, /Synthetic, not real imagery/);
});

test("smaller projects and experience stay concise and come from the content modules", () => {
  const smaller = section("more-work");
  const items = [...smaller.matchAll(/<li class="index-item" id="project-([\w-]+)">/g)].map((match) => match[1]);
  assert.equal(items.length, 6);
  for (const id of items) {
    const project = PROJECTS.find((entry) => entry.id === id);
    assert.ok(project && project.links.length, id);
    assert.ok(!["attendance-public", "vendor-memory"].includes(id), "major projects are not repeated");
    for (const link of project.links) assert.ok(smaller.includes(`href="${link.url}"`), `${id} link`);
  }
  const experience = section("experience");
  const rows = [...experience.matchAll(/<li class="ledger-row" id="experience-([\w-]+)">/g)].map((match) => match[1]);
  assert.ok(rows.length >= 5 && rows.length <= 8, "a short list, not every activity");
  for (const id of rows) assert.ok(EXPERIENCE.some((entry) => entry.id === id), id);
  assert.doesNotMatch(experience, /<details/, "no nested disclosures");
});
