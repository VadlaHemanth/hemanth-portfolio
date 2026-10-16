import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createTimeline, heroFraming, zoomCamera, CHAMBER_DEPTH, CORE_DEPTH} from "../js/journey/timeline.js";
import {layoutCards, CARD_ORDER} from "../js/journey/overlays.js";
import {chooseTier} from "../js/journey/assets.js";

const manifest = JSON.parse(readFileSync(new URL("../assets/journey/manifest.json", import.meta.url), "utf8"));
const plate = manifest.plate;
const VIEWPORTS = [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [768, 1024], [390, 844], [360, 640], [2560, 1080]];

test("the journey has one consistent length on every screen", () => {
  const totals = VIEWPORTS.map(([w, h]) => createTimeline(w, h, plate).scrollTotal);
  for (const total of totals) assert.ok(total > 6 && total < 8.5, `journey length ${total} viewport heights`);
  assert.ok(Math.max(...totals) - Math.min(...totals) < 0.8, "devices share nearly the same pacing");
});

test("scroll maps to camera speed without jumps", () => {
  for (const [w, h] of VIEWPORTS) {
    const tl = createTimeline(w, h, plate);
    const N = 4000;
    let previous = tl.visualAt(0);
    let previousSpeed = null;
    for (let i = 1; i <= N; i++) {
      const v = tl.visualAt((tl.scrollTotal * i) / N);
      assert.ok(v >= previous - 1e-9, "never runs backwards");
      const speed = v - previous;
      if (previousSpeed !== null && previousSpeed > 1e-4) {
        assert.ok(Math.abs(speed - previousSpeed) / previousSpeed < 0.05, `speed step at ${i} on ${w}x${h}`);
      }
      previousSpeed = speed;
      previous = v;
    }
  }
});

test("the journey starts and ends on the portrait", () => {
  const tl = createTimeline(1440, 900, plate);
  const first = tl.stateAt(0);
  assert.equal(first.chapter, "zoom");
  assert.equal(first.zoomLog, 0);
  assert.equal(first.hero, 1);
  const last = tl.stateAt(tl.scrollTotal);
  assert.equal(last.chapter, "settle");
  assert.equal(last.final, 1);
  assert.equal(last.zoomLog, 0);
});

test("chapters run face → mind → machine → projects → back to the face", () => {
  const tl = createTimeline(1440, 900, plate);
  const ids = tl.chapters.map((c) => `${c.phase}:${c.id}`);
  assert.deepEqual(ids, [
    "forward:zoom", "forward:portal", "forward:mind", "forward:break", "forward:machine",
    "show:burst", "show:assemble", "show:focus", "show:hold", "show:release", "show:collapse",
    "twist:machine", "twist:break", "twist:mind", "twist:portal", "twist:zoom", "settle:settle",
  ]);
});

test("visible camera values are continuous everywhere they are drawn", () => {
  const tl = createTimeline(1440, 900, plate);
  const N = 6000;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const s = tl.stateAt((tl.scrollTotal * i) / N);
    if (prev) {
      if (s.portal < 1 && prev.portal < 1) assert.ok(Math.abs(s.zoomLog - prev.zoomLog) < 0.05, `zoom jump at ${i}`);
      if (s.tunnel > 0 && prev.tunnel > 0) {
        assert.ok(Math.abs(s.z - prev.z) < 0.05, `flight jump at ${i}`);
        assert.ok(Math.abs(Math.log(s.core) - Math.log(prev.core)) < 0.05, `core jump at ${i}`);
      }
      assert.ok(Math.abs(s.window - prev.window) < 0.05, `window jump at ${i}`);
    }
    prev = s;
  }
  assert.ok(CHAMBER_DEPTH < CORE_DEPTH);
});

test("the pupil reaches the centre and fills the screen by the end of the dive", () => {
  for (const [w, h] of VIEWPORTS) {
    const tl = createTimeline(w, h, plate);
    const hero = heroFraming(w, h, plate);
    assert.ok(hero.pupil[0] > 0 && hero.pupil[0] < w && hero.pupil[1] > 0 && hero.pupil[1] < h, "eye visible in the hero");
    const end = zoomCamera(tl.zoomLen, w, h, plate, tl.zoomLen);
    assert.ok(Math.abs(end.pupil[0] - w / 2) < 1 && Math.abs(end.pupil[1] - h / 2) < 1);
    const radius = plate.pupilRadius * 1.55 * end.sigma;
    assert.ok(radius >= Math.hypot(w, h) / 2, "dilated pupil covers the viewport");
  }
});

test("project cards stay on screen and the lead card is Attendance ERP", () => {
  assert.equal(CARD_ORDER[1], "attendance");
  for (const [w, h] of VIEWPORTS) {
    for (const focus of [0, 1]) {
      const {cards} = layoutCards(w, h, focus, 0.5);
      const lead = cards[1];
      assert.ok(lead.x >= -1 && lead.y >= 0 && lead.x + lead.w * lead.zoom <= w + 1 && lead.y + lead.h * lead.zoom <= h + 1,
        `lead card inside ${w}x${h} at focus ${focus}`);
      if (focus === 0) {
        for (const c of cards) assert.ok(c.x >= -2 && c.x + c.w * c.zoom <= w + 2, `card inside ${w}x${h}`);
      }
    }
  }
});

test("constrained devices and connections get the light tier", () => {
  assert.equal(chooseTier({width: 1920, height: 1080, dpr: 1, coarse: false, connection: {saveData: true}}), "low");
  assert.equal(chooseTier({width: 1920, height: 1080, dpr: 1, coarse: false, connection: {effectiveType: "3g"}}), "low");
  assert.equal(chooseTier({width: 1920, height: 1080, dpr: 2, coarse: false, memory: 8, connection: {}}), "high");
  assert.equal(chooseTier({width: 390, height: 844, dpr: 3, coarse: true, memory: 4, connection: {}}), "mid");
});

test("every manifest tier lists real files within the size budget", () => {
  for (const [name, tier] of Object.entries(manifest.tiers)) {
    let total = 0;
    for (const key of ["L0", "L1", "L1b", "L2", "neural", "circuit", "core"]) {
      assert.ok(tier[key]?.src, `${name}.${key}`);
      const bytes = readFileSync(new URL(`../${tier[key].src.replace("./", "")}`, import.meta.url)).length;
      assert.equal(bytes, tier[key].bytes, `${name}.${key} size`);
      total += bytes;
    }
    assert.ok(total < 4.5 * 1048576, `${name} tier ${total} bytes`);
  }
});

test("the pupil geometry is the measured one: centred in the iris, slightly oval, opening concentric", () => {
  // Measured on the registered iris plate (production-v3, scripts in the case study): centre,
  // mean radius and a gentle oval R(θ) = R0·(1 + e·cos 2(θ − φ)).
  const [e, phi] = plate.pupilShape;
  assert.ok(e > 0 && e < 0.1, "a gentle oval, not a circle guessed by eye");
  assert.ok(Math.abs(phi) <= Math.PI / 2);
  assert.ok(plate.pupilRadius > 3.5 && plate.pupilRadius < 5.5);
  assert.ok(plate.irisRadius > plate.pupilRadius * 3 && plate.irisRadius < plate.pupilRadius * 5.5);
  // The iris plate takes over well before the pupil opens, so the opening is drawn on the plate it was measured on.
  const iris = manifest.levels.L2;
  assert.ok(Math.hypot(iris.center[0] - plate.pupil[0], iris.center[1] - plate.pupil[1]) < 3);
});
