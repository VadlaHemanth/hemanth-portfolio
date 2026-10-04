import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SKILL_LENSES, getSkillLens, getSkillConnection, initSkills } from "../skills.js";

test("three real project lenses have four bounded, immutable connections each", () => {
  assert.deepEqual(SKILL_LENSES.map((lens) => lens.id), ["satellite", "attendance", "memory"]);
  assert.ok(Object.isFrozen(SKILL_LENSES));
  for (const lens of SKILL_LENSES) {
    assert.ok(Object.isFrozen(lens) && Object.isFrozen(lens.nodes));
    assert.equal(lens.nodes.length, 4);
    assert.equal(new Set(lens.nodes.map((node) => node.id)).size, 4);
    for (const node of lens.nodes) {
      assert.ok(Object.isFrozen(node));
      assert.ok(node.name && node.scope && node.role);
      assert.ok(node.use.length > 20 && node.use.length < 200);
      assert.ok(`${lens.title}. ${node.name}. ${node.use}`.length < 260);
    }
  }
});

test("attendance technologies distinguish the earlier snapshot from the private ERP", () => {
  for (const id of ["python", "flask"]) {
    assert.equal(getSkillConnection("attendance", id).scope, "Earlier public prototype");
    assert.match(getSkillConnection("attendance", id).use, /private/);
  }
  assert.equal(getSkillConnection("attendance", "vision").scope, "Current ERP prototype");
});

test("research and payment connections keep human review explicit", () => {
  assert.match(getSkillConnection("satellite", "segmentation").use, /rather than.*confirmed/);
  assert.match(getSkillConnection("satellite", "inference").use, /human reviewer/);
  assert.match(getSkillConnection("memory", "checks").use, /does not execute payments/);
  assert.match(getSkillConnection("memory", "jsonl").use, /fallback/);
});

test("lookups reject unknown projects and cross-project skill IDs", () => {
  assert.equal(getSkillLens("missing"), null);
  assert.equal(getSkillConnection("missing", "python"), null);
  assert.equal(getSkillConnection("satellite", "flask"), null);
  assert.equal(initSkills(null), null);
  assert.equal(initSkills({ querySelector: () => null }), null);
});

test("static skills content and native controls exist before enhancement", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const section = html.match(/<section id="skills"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /aria-labelledby="tools-title"/);
  assert.match(section, /<h2 id="tools-title"/);
  assert.match(section, /data-skills-interactive hidden/);
  assert.match(section, /data-skills-static>/);
  assert.equal((section.match(/data-skill-lens=/g) ?? []).length, 3);
  assert.equal((section.match(/data-skill-node=/g) ?? []).length, 4);
  assert.match(section, /aria-live="polite" aria-atomic="true"/);
  assert.match(section, /Python and Flask belong to the earlier public prototype/);
  assert.doesNotMatch(section, /<canvas|onmouseover|onmouseenter/);
});

test("interaction is local and event-driven, with no render loop or remote dependencies", () => {
  const js = readFileSync(new URL("../skills.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /requestAnimationFrame|setInterval|setTimeout|fetch\(|innerHTML|https?:\/\//);
  const css = readFileSync(new URL("../skills.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /data-motion="reduced"/);
  assert.match(css, /forced-colors/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /infinite|@keyframes/);
});
