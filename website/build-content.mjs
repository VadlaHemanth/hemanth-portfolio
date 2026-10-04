/** Generate the compact catalog; all disclosures work without JavaScript. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PROJECTS, EXPERIENCE, EXPERIENCE_GROUPS, EDUCATION } from "./content-enrichment.js";
import { getProject } from "./content.js";

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

function link(item, context) {
  return `<a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(`${item.label}: ${context}`)}">${escape(item.label)} <span aria-hidden="true">↗</span></a>`;
}

const projectArtwork = [
  {
    id: "satellite",
    file: "satellite-study.svg",
    label: "Satellite imagery",
    caption: "Synthetic illustration",
    alt: "Concept illustration of satellite layers and a candidate region for review.",
    status: "Research · Private",
    tags: ["PyTorch", "Segmentation"],
  },
  {
    id: "attendance",
    file: "attendance-system.svg",
    label: "Computer vision",
    caption: "Concept diagram",
    alt: "Concept diagram connecting a camera, vision processing and attendance records.",
    status: "Prototype · Private",
    tags: ["Computer vision", "Full-stack"],
  },
  {
    id: "memory",
    file: "memory-flow.svg",
    label: "Agent memory",
    caption: "Demo workflow",
    alt: "Concept diagram of an invoice exception, recalled context and human review.",
    status: "Hackathon demo",
    tags: ["FastAPI", "Hindsight"],
  },
];

function primaryProject(artwork) {
  const project = getProject(artwork.id);
  const title = project.id === "memory" ? `${project.title} ${project.subtitle}` : project.title;
  return `<article class="work-entry" aria-labelledby="${project.id}-title" data-reveal>
              <figure class="project-figure ${project.id}-figure">
                <img src="./assets/${artwork.file}" width="800" height="500" loading="lazy" decoding="async" alt="${escape(artwork.alt)}">
                <figcaption><span>${escape(artwork.label)}</span><span>${escape(artwork.caption)}</span></figcaption>
              </figure>
              <div class="work-copy">
                <div class="work-meta"><span class="work-number">${project.number} / 03</span><p class="project-status">${escape(artwork.status)}</p></div>
                <h3 id="${project.id}-title">${escape(title)}</h3>
                <p class="work-description">${escape(project.description)}</p>
                <ul class="work-tags" aria-label="Project focus">${artwork.tags.map((tag) => `<li>${escape(tag)}</li>`).join("")}</ul>
                <div class="work-actions">
                  <button class="case-button" type="button" data-project="${project.id}" aria-haspopup="dialog" aria-label="View ${escape(title)} case study" hidden>Case study <span aria-hidden="true">↗</span></button>
                  <button class="hood-toggle" type="button" data-hood-toggle aria-expanded="false" aria-controls="pipeline-${project.id}" aria-label="View ${escape(title)} flow" hidden>View flow <span class="disclosure-symbol" aria-hidden="true">+</span></button>
                </div>
                <details id="case-${project.id}" class="case-fallback">
                  <summary>Read case study <span class="sr-only">for ${escape(title)}</span><span aria-hidden="true">↗</span></summary>
                  <dl>
                    <dt>The problem</dt><dd>${escape(project.problem)}</dd>
                    <dt>My work</dt><dd>${escape(project.contribution)}</dd>
                    <dt>Approach</dt><dd>${project.architecture.map((step) => escape(step.title)).join(" → ")}</dd>
                    <dt>Project notes</dt><dd>${escape(project.evidence)}</dd>
                    <dt>In context</dt><dd>${project.limitations.map(escape).join(" ")}</dd>
                  </dl>
                  ${project.links.length ? `<div class="archive-links">${project.links.map((item) => link(item, title)).join("")}</div>` : ""}
                </details>
                <div class="work-study">
                  <div id="pipeline-${project.id}" class="pipeline-panel" hidden>
                    <p class="eyebrow pipeline-label">The approach</p>
                    <ol class="pipeline">${project.architecture.map((step) => `<li><strong>${escape(step.title)}</strong><span>${escape(step.text)}</span></li>`).join("")}</ol>
                  </div>
                </div>
              </div>
            </article>`;
}

const selectedWork = `        <section id="work" class="work section container" aria-labelledby="work-title">
          <div class="section-heading" data-reveal>
            <p class="section-index eyebrow"><span>01</span> / Selected work</p>
            <div class="heading-row">
              <h2 id="work-title">Ideas, <span class="text-dim">put to work.</span></h2>
              <p class="section-intro">Three projects I’m building and exploring.</p>
            </div>
          </div>
          <div class="work-grid">${projectArtwork.map(primaryProject).join("\n")}</div>
        </section>`;

const projects = PROJECTS.filter((project) => !["attendance-public", "vendor-memory"].includes(project.id));
const featured = projects.filter((project) => project.featured);
const remaining = projects.filter((project) => !project.featured);
const experienceById = new Map(EXPERIENCE.map((item) => [item.id, item]));
const groupedIds = EXPERIENCE_GROUPS.flatMap((group) => group.members);

if (featured.length !== 4) throw new Error("The compact catalog must feature four projects.");
if (new Set(groupedIds).size !== groupedIds.length
  || groupedIds.length !== EXPERIENCE.length
  || groupedIds.some((id) => !experienceById.has(id))) {
  throw new Error("Every experience entry must belong to exactly one category.");
}

function projectRow(project, index) {
  return `<article class="archive-row" id="project-${escape(project.id)}">
              <span class="archive-number" aria-hidden="true">${String(index + 4).padStart(2, "0")}</span>
              <div class="archive-copy">
                <h3>${escape(project.title)}</h3>
                <p>${escape(project.description)}</p>
                <span class="archive-status">${escape(project.status)}</span>
              </div>
              <div class="archive-links">${project.links.map((item) => link(item, project.title)).join("")}</div>
            </article>`;
}

function experienceNote(id) {
  const item = experienceById.get(id);
  return `<li id="experience-${escape(item.id)}">
                  <h4>${escape(item.title)} <span>${escape(item.status)}</span></h4>
                  <p>${escape(item.description)}</p>
                  ${item.caseFacts.length ? `<p class="experience-context">${item.caseFacts.map(escape).join(" ")}</p>` : ""}
                  ${item.links.length ? `<div class="archive-links">${item.links.map((entry) => link(entry, item.title)).join("")}</div>` : ""}
                </li>`;
}

function experienceGroup(group, index) {
  return `<details class="experience-item" id="experience-${escape(group.id)}">
              <summary>
                <span class="experience-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
                <span><strong>${escape(group.title)}</strong><small>${escape(group.description)}</small></span>
                <span class="experience-plus" aria-hidden="true">+</span>
              </summary>
              <div class="experience-detail">
                <ul class="experience-notes">${group.members.map(experienceNote).join("\n")}</ul>
              </div>
            </details>`;
}

const currentStudy = EDUCATION.filter((item) => item.stage === "current");
const priorStudy = EDUCATION.filter((item) => item.stage === "previous");
const education = currentStudy.map((item) => `<li>
              <span class="education-program">${escape(item.program)}</span>
              <strong>${escape(item.shortName || item.institution)}</strong>
              <p>${escape(item.status)}</p>
              <small>${escape(item.start)} — ${escape(item.expectedCompletion)} (expected)</small>
            </li>`).join("\n");
const previousEducation = priorStudy.map((item) =>
  `<li><strong>${escape(item.program)}</strong><span>${escape(item.institution)}</span></li>`).join("");

const content = `<!-- ENRICHMENT:START -->
        <section id="more-work" class="section container more-work" aria-labelledby="more-work-title">
          <p class="section-index eyebrow"><span>02</span> / Smaller projects</p>
          <div class="heading-row">
            <h2 id="more-work-title">Small tools. <span class="text-dim">Real questions.</span></h2>
            <p class="section-intro">A few more things I’ve made.</p>
          </div>
          <div class="project-archive">${featured.map(projectRow).join("\n")}</div>
          ${remaining.length ? `<details class="archive-more">
            <summary>More public work <span class="archive-count">${remaining.length}</span><span class="experience-plus" aria-hidden="true">+</span></summary>
            <div class="project-archive">${remaining.map((item, index) => projectRow(item, index + featured.length)).join("\n")}</div>
          </details>` : ""}
        </section>

        <section id="experience" class="section experience-section" aria-labelledby="experience-title">
          <div class="container">
            <p class="section-index eyebrow"><span>03</span> / Experience</p>
            <div class="heading-row">
              <h2 id="experience-title">The work <span class="text-dim">around the work.</span></h2>
              <p class="section-intro">Building, explaining and working with people.</p>
            </div>
            <div class="experience-list">${EXPERIENCE_GROUPS.map(experienceGroup).join("\n")}</div>
          </div>
        </section>

        <section id="journey" class="section container education-section" aria-labelledby="journey-title">
          <p class="section-index eyebrow"><span>04</span> / Education</p>
          <div class="heading-row">
            <h2 id="journey-title">The foundations.</h2>
            <a class="text-link" href="./resume.html">View resume <span aria-hidden="true">↗</span></a>
          </div>
          <ul class="education-history">${education}</ul>
          <div class="education-earlier">
            <p>Previously</p>
            <ul class="education-prior">${previousEducation}</ul>
          </div>
        </section>
<!-- ENRICHMENT:END -->`;

const path = fileURLToPath(new URL("./index.html", import.meta.url));
let html = await readFile(path, "utf8");
const workSection = /        <section id="work"[\s\S]*?        <\/section>/;
if (!workSection.test(html)) throw new Error("Could not find the selected-work section.");
html = html.replace(workSection, selectedWork);
const marker = /<!-- ENRICHMENT:START -->[\s\S]*?<!-- ENRICHMENT:END -->/;
if (marker.test(html)) {
  html = html.replace(marker, content);
} else if (html.includes('        <section id="about"')) {
  html = html.replace('        <section id="about"', `${content}\n\n        <section id="about"`);
} else {
  throw new Error("Could not find the catalog insertion point in index.html.");
}
await writeFile(path, html);
console.log(`Rendered ${featured.length} featured tools, ${remaining.length} expandable projects, ${EXPERIENCE_GROUPS.length} experience categories and one education section.`);
