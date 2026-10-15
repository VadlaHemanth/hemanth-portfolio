# H² · Vadla Hemanth

Source repository for a responsive personal portfolio. The website is plain HTML,
CSS and JavaScript: a scroll-driven WebGL2 journey (camera computed in code, Lenis
smoothing) followed by the portfolio sections. No build step and no framework.

## Project structure

- `website/` — website, résumé, content, journey engine and plates, and tests.
- `design/` — reproducible résumé and social-preview builders.
- `scripts/` — public-site build and deployment checks.
- `skills/signature-scroll-portfolio/` — reusable personal-portfolio workflow,
  intake prompt, production references and portable helpers; not a website runtime dependency.

## Local preview

```bash
cd website
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/`.

## Validate

```bash
cd website
npm run check
npm test
```

The reusable skill has independent, dependency-free helper tests:

```bash
node --test skills/signature-scroll-portfolio/scripts/*.test.mjs
python3 -B -m unittest discover -s skills/signature-scroll-portfolio/scripts -p 'test_*.py'
```

Run these from the repository root. The optional media-inspection command also
requires `ffprobe`; see the skill README. CI runs both the website and helper tests.

## Repository boundaries

This repository contains the complete shipping website and its public artifact
builders. Raw personal dossiers, credentials, local environment files, generated
review caches, the retired v2 film archive and the journey's production sources
(`production-v3/`: generated plates, registration and texture scripts) remain
outside Git. They are not needed to build or run the website. The shipped journey
plates in `website/assets/journey/` are ready to serve.

Do not upload the personal source documents or production working directory as a
Cloudflare Pages output directory. Only the reviewed website build belongs on the
public host.

## Cloudflare Pages

Production: **https://portfolio.hemanthvadla.tech/**  
Pages project: **hemanth-portfolio**  
Public GitHub repository: **VadlaHemanth/hemanth-portfolio**

Recommended Git-integration settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Build command | `node scripts/build-site.mjs` |
| Build output directory | `dist` |
| Root directory | Repository root |

The build copies an explicit public-file allowlist and verifies the Pages
25 MiB per-file limit. Pushing `main` updates the existing Pages site. DNS and
the custom domain are already configured; do not recreate them.

The custom domain has a narrowly scoped Cache Rule:
`http.host eq "portfolio.hemanthvadla.tech"`, Browser TTL **Respect origin TTL**.
This prevents the zone's four-hour browser-cache default from overriding
mutable scripts, résumé and social-image revalidation. Do not broaden the
rule to other hosts. Content-hashed journey plates and fonts keep a one-year
immutable cache policy.

Retired initial-publication paths (`/tests/*`, package metadata and the old
download page) bypass the outer cache only on the portfolio host. The Pages
redirect file retires them to a deliberately missing route, returning the
custom 404 rather than allowing an old inner-cache source response to persist.

```bash
node scripts/build-site.mjs
python3 -m http.server 8080 --directory dist --bind 127.0.0.1
```

## Content and résumé

Edit the public content modules and run `node website/build-content.mjs`.
Selected work, smaller projects, experience and education are generated into
`index.html` from the same source; `npm test` fails if the page falls out of sync.
Private projects stay generic; their repository URLs are never published.

The résumé builder reads only `design/resume-data.json`. Install ReportLab in a
local environment, then run:

```bash
python3 design/build_resume.py
python3 design/build_resume.py --check
```

The shipped one-page PDF and accessible HTML are ready to deploy. The build
fails rather than shrinking text silently if the résumé no longer fits.

## Motion

The site is intentionally sound-free. A local sound experiment was declined
before publication; no audio module, audio toggle or background soundtrack ships.

The opening is a scroll-driven WebGL2 journey, not a video. Scroll is native and
smoothed by Lenis on wheel input (touch keeps native momentum); nothing locks the
page. A sticky stage holds the canvas while the journey section scrolls, and the
portfolio sections follow as ordinary content.

`js/journey/timeline.js` turns scroll into one perceived camera speed: zooms advance
in log-scale, flight through the passage is converted into the same units, and pace
changes are blended with a Gaussian so speed never jumps. The only deliberate pace
changes are the reading hold on the Attendance ERP card and a quicker pull-back.
`website/tests/journey.test.mjs` checks continuity, framing and card layout on
eight viewport sizes. For visual QA, `?journey-capture` exposes
`window.__journey.frame(scroll)` to render one deterministic frame at a time.

The eye zoom uses registered plates (portrait, ChatGPT-restored eye plate, iris
plate with Hemanth's real iris texture) blended along natural boundaries, so
no switch between photographs is visible. The dilating pupil becomes a window
into the neural passage. Thoughts, project cards and the closing line are DOM
layers positioned from the same state as the camera.

Quality adapts at runtime: the render scale drops when frames run long, and on
very slow GPUs the bloom passes switch off. Reduced motion, the header's motion
switch, a missing WebGL2 context or a failed load show the static portrait and the
full portfolio. The guided tour scrolls at a constant rate (which reproduces the
authored pacing) and any wheel, touch, pointer or key input stops it. It ends on
the final portrait. Skip links jump straight to the work.

## Portable site

```bash
python3 scripts/package-site.py --name Hemanth-Portfolio-Public-v3.zip
```

The command rebuilds `dist`, verifies a ZIP and preserves any previous package.
It never packages the private dossier, maintenance evidence or production sources.
