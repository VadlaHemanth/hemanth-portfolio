# H² — Vadla Hemanth portfolio

A responsive portfolio that opens with a scroll-driven journey: from the portrait,
into the eye, through a neural passage that turns into a circuit, to the projects,
and back out to the face. It is plain HTML, CSS and ES modules with no build step.
The only vendored library is Lenis for smooth scrolling. No analytics, external
fonts, CDNs or backend.

## Run locally

```bash
cd website
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/`. Use a local HTTP server, not a `file://` tab:
browsers block module and texture fetches from local-file origins.

## How the journey works

The camera lives in code. Every frame is computed from the scroll position, so the
journey runs forward and backward at the same pace instead of scrubbing a video.

- `js/journey/timeline.js` maps scroll to one perceived camera speed. Zooms advance
  in log-scale, tunnel flight is converted into the same units, and the few
  deliberate pace changes (reading the projects, the pull-back) are blended so the
  speed never jumps. The journey is about seven screens of scroll on every device.
- `js/journey/shaders.js` and `renderer.js` draw it with WebGL2: the eye stack
  (portrait → eye → iris → pupil), the neural passage and circuit as a polar tunnel
  with tileable textures, the processor burst as particles, then bloom, a light
  velocity blur and film grain.
- The eye is a stack of registered plates. The eye and iris plates were generated
  in ChatGPT from the portrait's own crops, aligned to the portrait to under a pixel,
  and colour-matched, so the zoom never visibly swaps one eye for another. The iris
  texture comes from a real photo of Hemanth's eye.
- The opening pupil becomes a window into the neural passage, so there is no black
  gap between the eye and the tunnel.
- `js/journey/overlays.js` positions the DOM text and the three project cards from
  the same state, so text and picture never drift apart. The cards are real links.
- `js/journey/journey.js` handles Lenis, loading, adaptive resolution (it lowers the
  render scale, then drops bloom on very slow GPUs), the guided tour, context loss and
  resizing. `?journey-capture` renders single deterministic frames for QA.

Reduced motion (system setting or the header switch), a missing WebGL2 context or a
failed load all show the static portrait and the full portfolio instead.

## Media

`assets/journey/manifest.json` lists three tiers (high, mid, low) of WebP plates and
textures with content-hashed names. The tier depends on screen size, device memory,
pointer type and connection. Everything for the journey is 1.0–1.6 MiB, loaded in
priority order: the portrait first, so the hero appears at once, then the eye
stack, then the tunnel textures. Production sources and the build script for these
files live outside the website (`production-v3/`, not published).

## Content and privacy

Personal source material is not shipped. Only public work is named; private work
is summarised without project branding, addresses or repository links. The linked
public attendance repository is an earlier snapshot, not the current private ERP.
Prototypes and proposals are labelled. No invented employment, awards, client
counts, accuracy or revenue claims. Project and experience data live in
`content.js` and `content-enrichment.js`; the catalogue is rendered into
`index.html` so it reads without JavaScript.

## Checks

```bash
npm run check
npm test
```

Tests cover the journey timeline (pacing continuity, framing, card layout, media
tiers), content and link structure, section anchors and copy accuracy, cache
headers, and accessible defaults.

## Deploy

Build the public output with `node scripts/build-site.mjs` from the repository root
and serve `dist`. `_headers` supplies the security policy and cache rules: HTML,
scripts and styles revalidate; journey plates and fonts are immutable.

Production is https://portfolio.hemanthvadla.tech/ on Cloudflare Pages. The GitHub
integration publishes updates pushed to `main` (build command
`node scripts/build-site.mjs`, output directory `dist`).
