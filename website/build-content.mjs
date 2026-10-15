/**
 * Renders the content-driven portfolio sections (selected work, smaller
 * projects, experience, education) into index.html between the ENRICHMENT
 * markers, so every word is readable without JavaScript.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PROJECTS, EXPERIENCE, EDUCATION } from "./content-enrichment.js";
import { getProject } from "./content.js";

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

/** Readable lists: "A, B and C". */
const listing = (items) => items.length < 2
  ? items.join("")
  : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

function external(item, context, className = "link") {
  return `<a class="${className}" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.label)}<span class="sr-only">${context ? `, ${escape(context)}` : ""} (opens in a new tab)</span></a>`;
}

/* Presentation details from the public résumé; claims stay as written there. */
const ERP = {
  id: "attendance",
  building: [
    "A Flask and PostgreSQL app that connects InsightFace recognition to enrolment, attendance records, review and reports.",
    "Background processing with Celery and Redis, plus bulk imports.",
    "Testing capture quality, replay scenarios and the CPU fallback for machines without a GPU.",
  ],
  stack: ["Python", "Flask", "PostgreSQL", "InsightFace", "Celery", "Redis"],
};

const STUDIES = [
  {
    id: "satellite",
    image: "satellite.svg",
    alt: "Illustration of stacked satellite image layers with one irregular region outlined for review. Synthetic, not real imagery.",
    details: [
      "Compared U-Net and DeepLabV3 in PyTorch, choosing on validation results and testing on a separate held-out set.",
      "Exported a model for CPU inference with ONNX Runtime, and added checkpoints so training can resume.",
    ],
    stack: ["PyTorch", "ONNX Runtime"],
  },
  {
    id: "memory",
    image: "memory.svg",
    alt: "Illustration of an invoice with a warning mark, a stack of earlier resolutions, and a person reviewing the suggestion.",
    details: [
      "Recalls earlier resolutions through Hindsight, with a local JSONL fallback when the memory service is unavailable.",
      "Checks GSTIN, HSN and purchase-order fields, and catches duplicate invoices, before it suggests anything.",
    ],
    stack: ["Python", "FastAPI", "Hindsight", "JSONL"],
  },
];

/* Line icons for the four stations of the attendance flow. */
const FLOW_ICONS = [
  '<rect x="3" y="6.5" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8.5 6.5 10 4h4l1.5 2.5"/>',
  '<path d="M4 8.5V5h3.5M16.5 5H20v3.5M20 15.5V19h-3.5M7.5 19H4v-3.5"/><circle cx="12" cy="10.5" r="2.6"/><path d="M8 16.5c.9-1.8 2.3-2.6 4-2.6s3.1.8 4 2.6"/>',
  '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 14.5h16M9.5 9.5V20"/>',
  '<circle cx="10" cy="8" r="3"/><path d="M4 19.5c.8-3.1 3-4.7 6-4.7 1.1 0 2.1.2 3 .6"/><path d="m14.5 17.5 2.2 2.2 4.3-4.4"/>',
];

const projectTitle = (project) => (project.id === "memory" ? `${project.title} ${project.subtitle}` : project.title);

/** Indent every line after the first, so nested blocks line up in index.html. */
const indent = (block, spaces) => block.replace(/\n/g, `\n${" ".repeat(spaces)}`);

function flow(project) {
  const last = project.architecture.length - 1;
  const steps = project.architecture.map((step, index) => `<li class="flow-step">
  <span class="flow-node" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${FLOW_ICONS[index]}</svg></span>${index < last ? `
  <span class="flow-wire" aria-hidden="true"></span>` : ""}
  <p class="flow-name">${escape(step.title)}</p>
  <p class="flow-text">${escape(step.text)}</p>
</li>`);
  return `<ol class="flow" aria-label="How it works">
  ${steps.map((step) => indent(step, 2)).join("\n  ")}
</ol>`;
}

function feature() {
  const project = getProject(ERP.id);
  const title = projectTitle(project);
  return `<article id="case-${project.id}" class="feature" aria-labelledby="${project.id}-title">
  <div class="feature-head">
    <h3 id="${project.id}-title" class="feature-title">${escape(title)}</h3>
    <p class="status status-live">${escape(project.status)}</p>
  </div>
  <div class="feature-intro">
    <p class="feature-summary">${escape(project.description)}</p>
    <p class="feature-problem">${escape(project.problem)}</p>
  </div>
  <div class="feature-flow">
    ${indent(flow(project), 4)}
  </div>
  <div class="feature-notes">
    <div class="note">
      <h4 class="note-title">What I’m building</h4>
      <ul class="ticks">${ERP.building.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>
    </div>
    <div class="note">
      <h4 class="note-title">Where it stands</h4>
      <p>${escape(project.evidence)}</p>
      <p class="note-link">${project.links.map((item) => external(item, title)).join(" ")}</p>
      <p class="fine">${project.limitations.map(escape).join(" ")}</p>
    </div>
    <div class="note">
      <h4 class="note-title">Built with</h4>
      <p>${escape(listing(ERP.stack))}.</p>
    </div>
  </div>
</article>`;
}

function study(entry) {
  const project = getProject(entry.id);
  const title = projectTitle(project);
  const live = project.links.length > 0;
  return `<article id="case-${project.id}" class="study" aria-labelledby="${project.id}-title">
  <figure class="study-figure">
    <img src="./assets/work/${entry.image}" width="640" height="400" loading="lazy" decoding="async" alt="${escape(entry.alt)}">
  </figure>
  <h3 id="${project.id}-title" class="study-title">${escape(title)}</h3>
  <p class="status${live ? " status-public" : ""}">${escape(project.status)}</p>
  <p class="study-summary">${escape(project.description)}</p>
  <ul class="ticks">${entry.details.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>
  <p class="fine">${project.limitations.map(escape).join(" ")}</p>
  <p class="study-foot"><span class="study-stack">Built with ${escape(listing(entry.stack))}.</span>${live ? ` ${project.links.map((item) => external(item, title)).join(" ")}` : ""}</p>
</article>`;
}

const selectedWork = `<section id="work" class="sec sec-work" aria-labelledby="work-title">
            <div class="wrap">
              <div class="sec-head">
                <h2 id="work-title" class="sec-title">Selected work</h2>
                <p class="sec-lede">The three projects I’d show you first.</p>
              </div>
              ${indent(feature(), 14)}
              <div class="pair">
                ${STUDIES.map((entry) => indent(study(entry), 16)).join("\n                ")}
              </div>
            </div>
          </section>`;

/* Smaller projects: everything public that is not one of the three above. */
const SMALL_ORDER = [
  "drive-uploader", "proofa", "data-structures-study-tool",
  "drawing-study-tool", "serverless-web", "portfolio-public",
];
const projectById = new Map(PROJECTS.map((item) => [item.id, item]));
const smaller = SMALL_ORDER.map((id) => projectById.get(id));
if (smaller.some((item) => !item || !item.links.length)) {
  throw new Error("Every smaller project must exist and have a public link.");
}

function smallProject(project) {
  return `<li class="index-item" id="project-${escape(project.id)}">
                  <h3 class="index-title">${escape(project.title)}</h3>
                  <p class="index-text">${escape(project.description)}</p>
                  <p class="index-meta"><span class="index-kind">${escape(project.status)}</span>${project.links.map((item) => external(item, project.title)).join("")}</p>
                </li>`;
}

const smallerProjects = `<section id="more-work" class="sec sec-more" aria-labelledby="more-work-title">
            <div class="wrap">
              <div class="sec-head">
                <h2 id="more-work-title" class="sec-title">Smaller projects</h2>
                <p class="sec-lede">Tools and sites I’ve made. All of them are public.</p>
              </div>
              <ul class="index">
                ${smaller.map(smallProject).join("\n                ")}
              </ul>
            </div>
          </section>`;

/* Experience stays short: the work done with or for other people. */
const EXPERIENCE_HIGHLIGHTS = [
  { id: "design-content", kind: "Design" },
  { id: "faculty-timetable-automation", kind: "Automation" },
  { id: "institutional-web", kind: "Web" },
  { id: "technical-events", kind: "Events" },
  { id: "hackathonz", kind: "Hackathon" },
  { id: "school-tutoring", kind: "Teaching" },
  { id: "model-un", kind: "Debate" },
];
const experienceById = new Map(EXPERIENCE.map((item) => [item.id, item]));
if (EXPERIENCE_HIGHLIGHTS.some(({ id }) => !experienceById.has(id))) {
  throw new Error("Every experience highlight must exist in content-enrichment.js.");
}

function experienceRow({ id, kind }) {
  const item = experienceById.get(id);
  const facts = id === "faculty-timetable-automation" ? ` ${item.caseFacts.map(escape).join(" ")}` : "";
  const links = item.links.length ? ` ${item.links.map((entry) => external(entry, item.title)).join(" ")}` : "";
  return `<li class="ledger-row" id="experience-${escape(item.id)}">
                  <h3 class="ledger-title">${escape(item.title)}</h3>
                  <p class="ledger-text">${escape(item.description)}${facts}${links}</p>
                  <p class="ledger-kind">${escape(kind)}</p>
                </li>`;
}

const experience = `<section id="experience" class="sec sec-experience" aria-labelledby="experience-title">
            <div class="wrap">
              <div class="sec-head">
                <h2 id="experience-title" class="sec-title">Experience</h2>
              </div>
              <ul class="ledger">
                ${EXPERIENCE_HIGHLIGHTS.map(experienceRow).join("\n                ")}
              </ul>
              <p class="ledger-after">I also prepare technical proposals, write study guides and edit copy for campus events.</p>
            </div>
          </section>`;

const current = EDUCATION.filter((item) => item.stage === "current");
const previous = EDUCATION.filter((item) => item.stage === "previous");
if (current.length !== 2 || previous.length !== 2) throw new Error("Education expects two current and two earlier entries.");

function degree(item) {
  // Acronyms people actually use (NNRG) follow the full name; "IIT Madras" would only repeat it.
  const school = /^[A-Z]{2,}$/.test(item.shortName ?? "")
    ? `${item.institution} (${item.shortName})`
    : item.institution;
  return `<li class="degree">
                  <h3 class="degree-name">${escape(item.program)}</h3>
                  <p class="degree-school">${escape(school)}</p>
                  <p class="degree-dates">${escape(item.start)} – ${escape(item.expectedCompletion)} (expected)</p>
                </li>`;
}

const education = `<section id="education" class="sec sec-education" aria-labelledby="education-title">
            <div class="wrap">
              <div class="sec-head">
                <h2 id="education-title" class="sec-title">Education</h2>
              </div>
              <ul class="degrees">
                ${current.map(degree).join("\n                ")}
              </ul>
              <p class="before">Before that: ${escape(previous[0].program)} at ${escape(previous[0].institution)}, and ${escape(previous[1].program)} at ${escape(previous[1].institution)}.</p>
            </div>
          </section>`;

const content = `<!-- ENRICHMENT:START (generated by build-content.mjs; edit the content modules instead) -->
          ${selectedWork}

          ${smallerProjects}

          ${experience}

          ${education}
          <!-- ENRICHMENT:END -->`;

const path = fileURLToPath(new URL("./index.html", import.meta.url));
const html = await readFile(path, "utf8");
const marker = /<!-- ENRICHMENT:START[\s\S]*?<!-- ENRICHMENT:END -->/;
if (!marker.test(html)) throw new Error("Could not find the ENRICHMENT markers in index.html.");
await writeFile(path, html.replace(marker, () => content));
console.log(`Rendered 3 selected projects, ${smaller.length} smaller projects, ${EXPERIENCE_HIGHLIGHTS.length} experience highlights and one education section.`);
