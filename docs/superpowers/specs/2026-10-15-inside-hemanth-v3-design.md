# Inside Hemanth v3: scroll-driven journey rebuild

Date: 2026-10-15 · Branch: `v3-scroll-journey` · Owner: Vadla Hemanth (H²)

## Why

The approved concept (Oct 2) is kept: **FACE → EYE → MIND → MACHINE → PROJECTS → pull back to the FACE**.
"The entire journey was happening inside your eye." Don't make the portfolio an animation; make the
animation the portal into the portfolio.

The shipped v2 site scrubs a pre-rendered 20 s H.264 film with `video.currentTime`. Hemanth's verdict
after many iterations: the speed is not consistent, it feels like a video rather than a scroll animation,
and the zoom into and out of the eye is not convincing (the eye visibly changes between shots, the blue
signal stalls in the neural passage, and some sections race while others crawl).

Root causes:

1. Seeking a video decoder on every scroll frame cannot be frame-accurate or smooth (worse in reverse).
2. Camera motion is baked into AI-generated clips whose speed varies shot to shot; pacing curves can
   only paper over that.
3. Face → eye used different photographs at different scales, so the switch is visible.

## Goal

A pro-level, buttery, scroll-driven cinematic journey where **the camera lives in code**: every frame is
computed from scroll position, in both directions, at a consistent perceived speed, on phones, tablets,
laptops and desktops. The visuals keep the approved look (black, deep charcoal, restrained electric blue
#1F6BFF-ish, the warm brown eye as the only warm element) using high-resolution plates made with
ChatGPT image generation and Hemanth's own photos, plus real-time shaders.

## Anti-goals (these make it a failure even if it "works")

- Anything that reads as a playing video: autoplaying narrative motion, scroll that only starts/stops a clip.
- Visible swaps between different-looking eyes or faces. Face identity must not change.
- Uneven speed: chapters that crawl or race. The pull-back may be modestly faster, with smooth ramps.
- Text baked into imagery; generic cyberpunk clutter (fake HUDs, random neon, holograms).
- Heavy downloads (the old site shipped 14–25 MB movies). Target ≤ 4 MB for desktop, ≤ 2.5 MB phone.
- Sound (Hemanth explicitly declined sound effects).
- Fabricated claims. Content stays accurate: private work summarized, prototypes labelled.

## Experience (storyboard; scroll lengths are targets, tuned by measurement)

Pinned full-viewport WebGL2 stage; Lenis smooth scrolling; one source of truth: journey progress.

| Beat | What the visitor sees | Notes |
|---|---|---|
| 0 Hero (scroll 0) | Portrait emerges from darkness (load-in light sweep, time-based, ~1.6 s once). VADLA HEMANTH, "I don't just learn. I build." | Desktop: face right of centre, copy left. Phone: face upper-centre, copy below. |
| 1 Into the eye | Continuous exponential zoom toward the viewer-right eye. Copy lifts away. | log-scale linear in scroll = constant perceived speed. |
| 2 Iris | Iris fills the frame; fibers begin to behave like data: radial light flows toward the pupil, a cool-blue tint creeps in; pupil dilates like a portal. | Shader effect on the iris plate. |
| 3 Pupil | Into the black. A single blue spark appears at the centre. | Darkness bridges photo → synthetic world. |
| 4 Mind | Fly through an organic neural passage. The blue signal always travels ahead of the camera and never stalls; thoughts flash for fractions of a second: CODE · AI · DATA · VISION · CREATE. | Polar tunnel shader with tileable neural texture, bump lighting, depth fog, bloom. |
| 5 The mind breaks | Pathways straighten into circuit traces; the passage becomes a machine with no visible boundary. | Depth-propagating dissolve neural → circuit. |
| 6 Machine | The passage opens on a processor core ahead; approach. | Core plate at the vanishing point. |
| 7 Activation | Controlled burst of light and data, not an explosion. Fragments fly outward. | Scroll-scrubbed particles (deterministic). |
| 8 Projects | Fragments resolve into three project cards. **Attendance ERP centre**, Satellite research and Vendor Payment Memory Agent either side, a short attractive title. The camera eases in so one card is comfortably readable, holds with gentle drift (breathing room), then eases out. | Real DOM cards (crisp, linkable), 3D-transformed to match the camera. |
| 9 The twist | Fast but smooth pull-back: machine → mind → pupil → iris → eye → face. | Same assets in reverse, ~1.4× forward speed, eased. |
| 10 Return | Settles on the face looking at the viewer. BUILDING WHAT'S NEXT. / EXPLORE ↓. The stage unpins and the portfolio begins. | Final frame is the portrait (Explore/guided scroll stops here). |

Total pinned distance roughly 8–9 viewport heights at default pace. A guided "Explore" button auto-scrolls
the journey at constant visual speed and is interruptible by any input.

## Technical design

### Camera and pacing

- Journey state is a single parameter `s` (visual distance). Scroll progress maps to `s` with one
  global speed constant, except: ease-in from rest at the start, eased hold-drift on the project cards,
  slightly faster twist, ease-out on the final portrait.
- Zoom chapters use log-scale (`scale = exp(k·s)`) about a focal path that moves smoothly from face
  centre to the pupil (interpolated in log space so the pupil stays fixed on screen as we approach).
- Tunnel speed is matched to the zoom rate at a characteristic screen radius so the hand-off from
  zoom to flight keeps the same perceived velocity.
- Velocity-aware post effects: subtle radial zoom blur and chromatic fringe scale with camera speed,
  so fast flicks look cinematic instead of steppy.
- Verified by measurement: a QA harness renders frames at uniform scroll steps and computes optical-flow
  magnitude; the flow-per-scroll-pixel must stay within a tight band across chapters (except intended beats).

### Eye zoom stack (the critical transition)

Portrait `Cinematic Blue-Rimmed Hoodie Portrait (1).png` (1122×1402) is the master (L0). Viewer-right eye
pupil ≈ (692, 437), iris radius ≈ 19 px, pupil radius ≈ 6 px; viewer-left pupil ≈ (515, 435).

- L0 portrait, super-resolved 2× (Real-ESRGAN class model) for crisp large displays.
- L1 eye plate covering ~300×300 portrait px around the eye: generated with ChatGPT from the exact
  portrait crop (enhance, never re-pose), then geometrically aligned (ECC / feature homography) and
  colour-matched (Lab statistics over the overlap) to L0.
- L2 iris plate covering ~80×80 portrait px: Hemanth's real iris (from his 4K eye photos) or a ChatGPT
  macro conditioned on the L1 crop, aligned to L1 at the limbus/pupil, colour-matched, catch-light consistent.
- L3 pupil portal: shader.
- Hand-offs use soft radial masks along natural boundaries (eye region, limbus) and begin while the
  lower level is still sharp, so no swap is ever visible. All levels share one colour grade.

### Rendering

Raw WebGL2, no framework: scene pass (plates / tunnel / core / particles) into a float or 8-bit target,
dual-filter bloom, composite with tone mapping, vignette, grain, dithering (no banding in dark gradients),
velocity zoom-blur and chromatic fringe. Adaptive resolution from measured frame time; DPR capped
(≈1.5 phones, 2 desktop). Context-loss handling. Static fallback when WebGL2 is unavailable.

### Overlays

DOM text and project cards driven by the same journey state via a small keyframe-track system.
Canvas is `aria-hidden`; all content exists in the HTML for no-JS, screen readers and search engines.

### Loading

Real byte progress. Priority order: hero plate → eye stack → tunnel textures → core → card media.
Device tiers pick texture sizes (AVIF with WebP fallback). Hero is interactive as soon as the hero
and eye plates are decoded; later chapters load while the visitor reads the hero.

### Reduced motion, data saver, no WebGL

No zooming camera; static portrait hero and the full portfolio. "Skip intro" always available.

### After the journey

The portfolio sections keep v2's accurate content (`content.js`, `content-enrichment.js`, résumé) but
are redesigned to the same premium level: strong typographic system with self-hosted fonts, GSAP
ScrollTrigger reveals in moderation, and a very subtle living neural/circuit background. Sections:
Selected work, Smaller projects, Experience, Education, About, Skills, Contact, footer.

## Constraints

- Static site on Cloudflare Pages (`node scripts/build-site.mjs` → `dist/`, explicit allowlist,
  25 MiB per-file limit). CSP: scripts and fonts self-hosted, no inline scripts, no third-party requests.
- Vendored libraries only (Lenis, GSAP + ScrollTrigger). No analytics.
- Raw generated/production media lives in `production-v3/` (git-ignored); only optimised web assets ship.

## Calls made by the builder (Hemanth asked to skip questions)

- Camera-in-code journey instead of re-rendering another film.
- Raw WebGL2 for the journey; Lenis for scroll smoothing; GSAP only for section reveals.
- Viewer-right eye, as in v2.
- Project-moment title chosen by the builder.
- Google Flow is optional: used only if a short living-portrait loop clearly improves the hero
  without changing the face.
