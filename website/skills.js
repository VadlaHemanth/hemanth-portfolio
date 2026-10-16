/** A project lens, not a proficiency chart. No dependencies or background work. */
const freezeLens = (lens) => Object.freeze({
  ...lens,
  nodes: Object.freeze(lens.nodes.map((node) => Object.freeze(node))),
});

export const SKILL_LENSES = Object.freeze([
  freezeLens({
    id: "satellite", title: "Satellite research", status: "Private research",
    nodes: [
      { id: "pytorch", name: "PyTorch", mark: "PT", role: "Model experiments", scope: "Research experiments", use: "Compare segmentation models and run experiments on satellite imagery." },
      { id: "segmentation", name: "Segmentation", mark: "◫", role: "Image regions", scope: "Image screening", use: "Highlight candidate image regions for closer investigation, rather than treating them as confirmed oil spills." },
      { id: "checkpoints", name: "Checkpoints", mark: "↳", role: "Recovery", scope: "Research experiments", use: "Test checkpoint recovery so model experiments can continue from saved states." },
      { id: "inference", name: "Inference", mark: "→", role: "Screening", scope: "Research experiments", use: "Run trained models on imagery and examine their output. Final interpretation stays with a human reviewer." },
    ],
  }),
  freezeLens({
    id: "attendance", title: "Attendance ERP", status: "Private prototype",
    nodes: [
      { id: "vision", name: "Computer vision", mark: "CV", role: "Candidate matches", scope: "Current ERP prototype", use: "Connect camera frames and candidate face matches to an attendance workflow that people can review." },
      { id: "python", name: "Python", mark: "Py", role: "Attendance logic", scope: "Earlier public prototype", use: "Build the earlier camera-based attendance prototype in Python. That public snapshot is separate from the current private ERP." },
      { id: "flask", name: "Flask", mark: "ƒ", role: "Web application", scope: "Earlier public prototype", use: "Provide the web application layer in the earlier attendance prototype. The current ERP implementation remains private." },
      { id: "workflows", name: "Workflow design", mark: "↗", role: "Records & review", scope: "Current ERP prototype", use: "Work through enrolment, attendance review and reporting, so recognition connects to everyday college tasks." },
    ],
  }),
  freezeLens({
    id: "memory", title: "Vendor Payment Memory Agent", status: "Hackathon demo",
    nodes: [
      { id: "fastapi", name: "FastAPI", mark: "API", role: "Demo application", scope: "Invoice-exception demo", use: "Build the API layer of a demo for reviewing recurring invoice exceptions." },
      { id: "hindsight", name: "Hindsight", mark: "↶", role: "Recall", scope: "Memory-assisted review", use: "Retrieve earlier invoice resolutions so a new exception does not have to start without context." },
      { id: "jsonl", name: "JSONL", mark: "{ }", role: "Local fallback", scope: "Memory-assisted review", use: "Keep a local JSONL fallback for retrieving prior context alongside the Hindsight memory path." },
      { id: "checks", name: "Invoice checks", mark: "✓", role: "Review support", scope: "Example invoices only", use: "Check GSTIN, HSN and purchase-order fields before a person reviews the suggestion. The demo does not execute payments." },
    ],
  }),
]);

export const getSkillLens = (id) => SKILL_LENSES.find((lens) => lens.id === id) ?? null;
export const getSkillConnection = (projectId, skillId) =>
  getSkillLens(projectId)?.nodes.find((node) => node.id === skillId) ?? null;

const controllers = new WeakMap();

/** Call once from the page entry point. Safe to call again or import in Node. */
export function initSkills(root = globalThis.document) {
  const section = root?.id === "skills" ? root : root?.querySelector?.("#skills");
  if (!section) return null;
  if (controllers.has(section)) return controllers.get(section);

  const find = (selector) => section.querySelector(selector);
  const interactive = find("[data-skills-interactive]");
  const fallback = find("[data-skills-static]");
  const lenses = [...section.querySelectorAll("[data-skill-lens]")];
  const nodes = [...section.querySelectorAll("[data-skill-node]")];
  const wires = [...section.querySelectorAll("[data-skill-wire]")];
  const fields = Object.fromEntries([
    "project-index", "project-title", "project-status", "detail-index",
    "detail-title", "detail-scope", "detail-use", "announcement",
  ].map((name) => [name, find(`[data-skill-${name}]`)]));
  const parts = nodes.map((node) => ({
    name: node.querySelector("[data-skill-name]"),
    role: node.querySelector("[data-skill-role]"),
    mark: node.querySelector("[data-skill-mark]"),
  }));
  if (!interactive || !fallback || lenses.length !== 3 || nodes.length !== 4
    || Object.values(fields).some((field) => !field)
    || parts.some((part) => Object.values(part).some((field) => !field))) return null;

  let projectId = "satellite";
  let skillId = "pytorch";
  const cleanups = [];

  function render(announce) {
    const lens = getSkillLens(projectId);
    const selected = getSkillConnection(projectId, skillId);
    const index = lens.nodes.indexOf(selected);
    lenses.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.skillLens === projectId));
    });
    nodes.forEach((button, slot) => {
      const node = lens.nodes[slot];
      parts[slot].name.textContent = node.name;
      parts[slot].role.textContent = node.role;
      parts[slot].mark.textContent = node.mark;
      button.dataset.skillId = node.id;
      button.setAttribute("aria-pressed", String(slot === index));
      button.setAttribute("aria-label", `${node.name}: ${node.role}`);
    });
    wires.forEach((wire) => wire.classList.toggle("is-selected", Number(wire.dataset.skillWire) === index));
    fields["project-index"].textContent = `${String(SKILL_LENSES.indexOf(lens) + 1).padStart(2, "0")} / PROJECT LENS`;
    fields["project-title"].textContent = lens.title;
    fields["project-status"].textContent = lens.status;
    fields["detail-index"].textContent = `${String(index + 1).padStart(2, "0")} / 04`;
    fields["detail-title"].textContent = selected.name;
    fields["detail-scope"].textContent = selected.scope;
    fields["detail-use"].textContent = selected.use;
    if (announce) fields.announcement.textContent = `${lens.title}. ${selected.name}. ${selected.use}`;
  }

  function selectProject(id) {
    const lens = getSkillLens(id);
    if (!lens) return false;
    projectId = id;
    skillId = lens.nodes[0].id;
    render(true);
    return true;
  }
  function selectSkill(id) {
    if (!getSkillConnection(projectId, id)) return false;
    skillId = id;
    render(true);
    return true;
  }
  function listen(target, event, handler) {
    target.addEventListener(event, handler);
    cleanups.push(() => target.removeEventListener(event, handler));
  }
  lenses.forEach((button, index) => {
    listen(button, "click", () => selectProject(button.dataset.skillLens));
    listen(button, "keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % lenses.length;
      if (event.key === "ArrowLeft") next = (index + lenses.length - 1) % lenses.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = lenses.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      lenses[next].focus();
      selectProject(lenses[next].dataset.skillLens);
    });
  });
  nodes.forEach((button) => listen(button, "click", () => selectSkill(button.dataset.skillId)));

  render(false);
  interactive.hidden = false;
  fallback.hidden = true;
  section.dataset.skillsReady = "true";
  const controller = {
    selectProject, selectSkill,
    getState: () => ({ projectId, skillId }),
    destroy() {
      cleanups.forEach((cleanup) => cleanup());
      interactive.hidden = true;
      fallback.hidden = false;
      fields.announcement.textContent = "";
      delete section.dataset.skillsReady;
      controllers.delete(section);
    },
  };
  controllers.set(section, controller);
  return controller;
}
