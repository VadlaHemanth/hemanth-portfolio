# H² — Vadla Hemanth portfolio

A responsive portfolio that opens with a scroll-driven journey: from the portrait,
into the eye, through a neural passage that turns into a circuit, to the projects,
and back out to the face. It is plain HTML, CSS and ES modules with no build step.
The only vendored library is Lenis for smooth scrolling. No analytics, web fonts,
CDNs or backend.

After the journey come the portfolio sections: selected work with case studies,
smaller projects, experience, education, about, skills and contact. They keep the
design of the previous version: the system font stack (Inter where installed,
otherwise Helvetica Neue or Arial), monospace labels, and #f4f7fa text with
#168bff and #8fcbff accents on #050608. `styles.css`, `catalog.css` and
`skills.css` style them; `app.js` adds the menu, case-study dialogs, flow
disclosures, profile-link copy and fullscreen control, and `skills.js` runs the
skills lens. Every section reads without JavaScript.

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
  deliberate pace changes (the eye, reading the projects, the rewind) are blended so the
  speed never jumps. Scrolling, the camera dives into the eye and pulls back out of it at
  one pace (`EYE_PACE`), a little quicker than the passage; the guided play-through dives
  in 45% quicker still (`GUIDE_DIVE`). The journey is about seven screens of scroll on
  every device.
- `js/journey/shaders.js` and `renderer.js` draw it with WebGL2: the eye stack
  (portrait → eye → iris → pupil), the neural passage and circuit as a polar tunnel
  with tileable textures, the processor burst as particles, then bloom, a light
  velocity blur and film grain.
- The eye is a stack of registered plates: a super-resolved portrait, an eye plate
  for each eye and an iris plate. The eye and iris plates were generated in ChatGPT
  from the portrait's own crops, aligned to the portrait to under a pixel and
  colour-matched, so the zoom never visibly swaps one eye for another. The iris
  texture comes from a real photo of Hemanth's eye.
- At rest (the first and the last frame) the journey shows Hemanth's approved original
  photograph itself, framed exactly like the previous site's hero and always clear of the
  header. It is the page's poster, so it is downloaded once, and it cross-fades into the
  plates as the dive begins; the finishing effects (glow, grain, vignette) stay off it.
- "Explore my work" plays the whole journey at one steady pace (the dive into the eye
  quicker) and stops on the closing portrait, as the previous site's film did; any wheel, touch or key hands control back.
  "Skip to work" goes straight to the work.
- The opening pupil becomes a window into the neural passage, so there is no black
  gap between the eye and the tunnel. The window, the dilation and the dark rim all
  follow the pupil's outline as measured on the iris plate (its centre, radius and a
  slight oval), so the opening sits exactly on the pupil.
- `js/journey/overlays.js` positions the DOM text and the three project cards from
  the same state, so text and picture never drift apart. The cards are real links.
- `js/journey/journey.js` handles Lenis, loading, adaptive resolution (it lowers the
  render scale, then drops bloom on very slow GPUs), the skip links, context loss and
  resizing. `?journey-capture` renders single deterministic frames for QA.
- The opening copy sits left of the face on landscape screens and below it on
  portrait screens. On shorter phones the photo gets just small enough that the copy
  stays off the face: the mouth while the photo still fills the screen's width, the eyes
  always. `css/journey.css` sets it, and the journey's other text, in the
  same type and colours as the sections. Skip to work jumps straight to the work; the
  project cards open the same case studies as Selected work.

Without WebGL (no GPU, blocked drivers), `js/journey/renderer2d.js` draws the same
journey with Canvas 2D. It is loaded only on those machines:

- the portrait and eye plates are drawn at full resolution from mip chains, and the
  resting portrait is an exact pre-scaled copy;
- the passage is computed per pixel (`cpu-tunnel.js`) from a lookup table and
  mip-mapped textures, on two worker threads (`cpu-tunnel-worker.js`), at a
  resolution that adapts to the machine;
- it draws only when something changes and sharpens to full resolution when the
  visitor pauses.

Reduced motion (system setting or the header switch) or a failed load show the static
portrait and the full portfolio instead.

### Loading screen

The previous site's loading screen ("A thought. A world within.") shows from the first
paint while the journey's images load, with their real progress, the scroll directions
and a way past it ("Skip loading", or Escape). It lifts once everything is in and ready
to draw; once the photo itself is in, it waits at most five seconds after the page opened
(the rest keeps arriving, shown along the header). It never traps anyone: without
JavaScript, with reduced motion or on the static page it does not show, and if the
scripts never arrive it steps aside by itself after 15 seconds.

### Phones

Phone browsers have two screen heights: with their toolbars showing (small) and tucked
away while scrolling (large). The stage is as tall as the large one, so no gap opens
below it; the picture is composed for the small one, so nothing important hides behind
a toolbar; and the progress line and the "Swipe up to begin" hint sit on the screen's
visible lower edge (`position: fixed`), so they follow the toolbar as it moves. Browsers
without the small/large units (before Safari 15.4 and Chrome 108) fall back to `100vh`
and a measured height.

The page is short until the journey knows its length, so `journey.js` places the visitor
itself once it does: a reload comes back to the same point (the browser's own scroll
restoration is turned off), and a link to a section such as `/#work` lands on it without
the loading screen.

## Media

`assets/journey/manifest.json` lists three tiers (high, mid, low) of WebP plates and
textures with content-hashed names. The tier depends on screen size, device memory,
pointer type and connection. Everything for the journey is 1.2–3.5 MiB, loaded in
priority order: the portrait first (about 0.3 MiB), so the hero appears at once, then
the eye stack, then the tunnel textures. The eye and iris plates of the high tier are
2× super-resolved (2508 px), so the dive stays sharp deep into the iris. Production
sources and the build script for these files live outside the website
(`production-v3/`, not published).

## Content and privacy

Personal source material is not shipped. Only public work is named; private work
is summarised without project branding, addresses or repository links. The linked
public attendance repository is an earlier snapshot, not the current private ERP.
Prototypes and proposals are labelled. No invented employment, awards, client
counts, accuracy or revenue claims. Project and experience data live in
`content.js` and `content-enrichment.js`; `node build-content.mjs` renders Selected
work and the catalogue into `index.html` so they read without JavaScript.

## Checks

```bash
npm run check
npm test
```

Tests cover the journey timeline (pacing continuity, the eye's matched pace, framing,
card layout, media tiers), the loading screen and phone layout rules, content and link
structure, the menu, case-study dialogs, disclosures and skills lens, the generated
catalogue staying in sync with the content modules, cache headers, and accessible
defaults.

Phones were checked in emulation: Chromium with Android profiles and WebKit with iPhone
and iPad profiles, each opened with the toolbar showing and then with it tucked away
(the viewport grown to the large height), real touch swipes, throttled networks for the
loading screen, and a 2021 Chromium and WebKit for older phones.

## Deploy

Build the public output with `node scripts/build-site.mjs` from the repository root
and serve `dist`. `_headers` supplies the security policy and cache rules: HTML,
scripts and styles revalidate; journey plates are immutable.

Production is https://portfolio.hemanthvadla.tech/ on Cloudflare Pages. The GitHub
integration publishes updates pushed to `main` (build command
`node scripts/build-site.mjs`, output directory `dist`).
