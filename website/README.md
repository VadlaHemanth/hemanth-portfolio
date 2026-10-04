# H² — Vadla Hemanth portfolio

A dependency-free, responsive portfolio with a native-scroll cinematic background.
The page uses HTML, CSS and ES modules. No external fonts, animation framework,
analytics, paid service or backend is required.

## Run locally

```bash
cd /path/to/Hemanth-Portfolio
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/`. Use a local HTTP server, not a `file://` tab:
browser security can block module and movie fetches from local-file origins.
The working Codex-hosted preview uses `http://127.0.0.1:8768/`.

## Experience

- The video is the background of the first scroll section, not a pop-up player.
- Scroll naturally in either direction. No wheel/touch interception or scroll snapping.
- The eye approach and return have more scroll distance; the neural-to-circuit
  passage moves faster; the project reveal keeps moving with a gentle camera zoom.
- The three project screens contain linked public project covers, accurately
  labelled conceptual previews rather than fabricated application screenshots.
- Other sections follow the film. Navigation and Skip to work bypass it immediately.
- The loading screen reports bytes downloaded, supports Escape/Skip, and fails
  open after a bounded wait. It is not an artificial timed loader.
- Reduced motion, data-saver preferences and direct section links bypass initial
  motion loading. A manual Load action remains available.
- Mobile viewport height remains stable when browser toolbars expand or retract.
- A small header fullscreen control appears only where the native API is supported.
- On rotation, the correct composition is selected. Only one movie blob is
  retained; old object URLs are revoked.

## Media

`assets/motion/manifest.json` selects a high-quality H.264 rendition:
720p for constrained devices/smaller displays or 1080p for capable devices that
benefit from the added detail. Both are encoded from approved maximum-quality
sources, not from the old lower-resolution web films. Short closed GOPs retain
all 24 fps/480 frames while reducing mandatory download size substantially.
Each complete MP4 is under 25 MiB and is buffered before cinematic scrolling.
The optional full-resolution deliveries remain local and are not included in
the public Pages build or footer.

The hero's Explore button offers a gently paced, interruptible guided scroll.
Normal scrolling remains native; wheel, touch or navigation keys immediately
return control to the visitor. The Work navigation link remains direct access.

`resume.html` provides the full résumé in accessible HTML, a PDF viewer link,
and a one-page PDF download. The artifacts share one public data source.

The underlying film has 480 frames at 24 fps, twenty video seconds, silent and
without baked-in text. Scroll controls viewing time, so the on-page experience
is not constrained to twenty wall-clock seconds. Its actual inner return uses
reversed corrected forward frames. The eye is always the original portrait's
source eye; the pupil masks the stylized inner scene instead of switching to a
different photographic eye.

4K-raster delivery is upscaled/recomposed, not native 4K capture. The original
portrait has limited fine detail. Local old-signal and visible-logo corrections
estimate small areas; they do not recover hidden original pixels. Original
media and lossless processed source intermediates are retained separately from
this deployable website. Final downloadable MP4s are high-quality lossy encodes.

## Content and privacy

Public repository/site access was checked on 3 October 2026. Personal source
material is NOT shipped. Only public work is named; private work is summarized
as experience without project branding, addresses or repository links.

The linked public attendance repository is an earlier snapshot, not evidence
of the newer private implementation. Prototypes, self-reported activities and
proposals are labelled. No invented employment, award, client count, accuracy,
revenue, or deployed-scale claims are included. Education dates are self-reported.

Project and experience data live in `content.js` and `content-enrichment.js`.
The catalog is also rendered into `index.html` so it stays readable without JS.
Project illustrations are original conceptual diagrams, not product screenshots.

## Checks

```bash
npm run check
npm test
```

Tests cover content/link structure, navigation/dialog/disclosure behavior,
motion preferences, scroll mapping, screen homography, and accessible defaults.
Browser tests complement unit tests; emulation is not physical-device certification.

## Deploy

Build the public output with `node scripts/build-site.mjs` from the repository
root, then serve `dist`. Use HTTPS, correct media MIME types,
byte-range support, and compression for text assets. `_headers` supplies optional
Netlify/Cloudflare-compatible cache/security headers. Versioned video files can
be cached immutably; keep `assets/motion/manifest.json` revalidating.

Production is https://portfolio.hemanthvadla.tech/ on Cloudflare Pages.
The GitHub integration publishes updates pushed to `main`.
Use build command `node scripts/build-site.mjs` and output directory `dist`.
The allowlisted build excludes tests, source dossiers, maintenance notes,
production intermediates and optional film downloads.
