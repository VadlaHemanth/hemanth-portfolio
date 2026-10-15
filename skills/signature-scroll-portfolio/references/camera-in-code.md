# A camera in code: scroll journeys computed from the scroll position

Use this when the concept is a journey (a zoom, a flight, a pass through some
material) and the visitor should feel that they are driving it. Every frame is
computed from the scroll position, so the journey runs forward and backward at
the same pace and a given scroll position always shows the same picture.

Hemanth's v3 portfolio is the example implementation. Its code is in
`website/js/journey/` of his portfolio repository. His production scripts and QA
tools were kept outside the repository; they are described here by name. Copy
the method, not his eye, palette or story.

Jump to [choosing](#1-choose-between-film-and-code-honestly),
[visual units](#2-plan-the-journey-in-visual-units),
[constant speed](#3-keep-the-perceived-speed-constant),
[plate stack](#4-a-photographic-zoom-from-a-registered-plate-stack),
[no black gaps](#5-bridge-scenes-through-a-window-not-a-black-gap),
[shader worlds](#6-shader-worlds-from-tileable-ai-textures),
[overlays](#7-overlays-read-the-same-state), [loading](#8-loading-tiers-and-budgets),
[fallbacks](#9-fallbacks-and-input) or [optical-flow QA](#10-measure-the-motion-optical-flow-qa).

## 1. Choose between film and code honestly

Both are legitimate. They fail in different ways.

**Scrubbing a pre-rendered film** (Hemanth's v2: a 20-second generated film
scrubbed with `video.currentTime`):

- Good when the motion itself is what a video model does best: materials
  transforming, light changing, a camera path through a scene you could not
  build, people moving. A short sequence watched mostly forwards, or an intro
  with a Skip button, suits it.
- Costs: seeking a decoder on every scroll frame is not frame-accurate and is
  worse in reverse; all-keyframe encodes seek better but multiply the bytes.
  Speed is baked into each generated clip and differs between clips, and a
  retiming curve can only hide part of that. Continuity can drift between
  separately generated shots. Each composition needs its own render, and every
  visitor downloads megabytes (Hemanth's v2: one movie of about 9–24 MiB per
  visitor, about 127 MiB across all variants in the build).

**Computing the camera in code** (Hemanth's v3: WebGL2, still plates and
textures, about 1–2 MiB per visitor):

- Good when the visitor must feel in control, the speed must stay consistent in
  both directions, and the journey is a zoom, flight, pan or reveal through
  material you can hold as still images: one master photograph with sharper
  plates for nested regions, tileable textures, an end plate, particles.
- Costs: shader and graphics work, and more code to test. The look is limited to
  what you can composite and compute; you won't get a generated performance.
  GPU cost on weak devices needs adaptive quality and a static fallback, and GPUs
  differ, so checks on physical devices matter more. The stills need
  preparation: registration, colour matching and tiling.

Questions that usually decide it:

| Question | Leans toward |
|---|---|
| Does the story depend on motion only a video model can produce? | Film, or a short generated loop inside a code camera |
| Will visitors scroll back and forth and expect exact control? | Code |
| Is the journey mainly a zoom, flight or pan through things you can hold as images? | Code |
| Is a 10–25 MiB download acceptable for the audience and the host? | If not, code or a lighter CSS/SVG treatment |
| Is there time to write shaders, a fallback and the tests? | If not, film or a lighter treatment |

If you are unsure, prototype the hardest beat both ways, cheaply, before
generating a full sequence. Mixing is fine (a generated loop used as a texture
inside a code camera, or a film inside a code-driven frame) as long as one value
drives everything.

Signs that a film should move into code: retiming passes keep moving the problem
around, some sections still race while others crawl, the subject visibly changes
between shots, or a travelling element stalls. That is what Hemanth saw in v2
([case study, section 12](hemanth-case-study.md#12-v3-what-changed-and-why)).

## 2. Plan the journey in visual units

Make the whole journey a pure function of one number: scroll position → visual
position → state (camera scale and position, depth, current chapter and progress
through it, the amount of each effect). No timer drives the story. Clock time is
only used for small ambient life, such as a shimmer or a slight wobble, that never
moves the camera. Then the same scroll position always gives the same frame,
scrolling back is exact, and any frame can be rendered on demand for QA.

Pick one measure of perceived motion and express every chapter in it. Hemanth's
unit: **one visual unit is the picture growing by a factor of e** (about 2.7×).
Other motion converts into the same unit:

```text
zoom      scale = start scale × e^u            → units = ln(end scale / start scale)
approach  apparent size ∝ 1 / distance          → units = ln(start distance / end distance)
tunnel    a wall point at depth D appears at screen radius k / D
          flight moves a point at radius r by r² / k per unit of depth
          a log zoom moves it by r per unit
          make them agree at radius r0          → one unit = k / r0 of depth
pan       every pixel moves the same amount     → about r0 pixels per unit
```

`r0` is where the speeds should agree. Hemanth measures screen radius in units of
the distance from the centre to the nearest screen edge, with k = 1, and matches
at half that distance (r0 = 0.5), so one visual unit is 2 units of depth. A
tunnel's outer walls always move faster than its centre; matching at mid-radius
makes the hand-off from zoom to flight feel continuous where the eye usually
rests.

Then write the chapter list, `{id, length in units, speed}`, with speed 1 for
ordinary travel. Scroll per unit is one constant (Hemanth: 0.205 viewport
heights) divided by the chapter's speed. Measure scroll in viewport heights so
every screen gets the same number of screens of scroll. Hemanth's journey is
about 35–37 units, which comes to about seven screens on every tested viewport
(6.8–7.1 viewport heights across eight sizes from 360×640 to 2560×1080).

His chapter list, as an example of the shape rather than settings to reuse:

| Phase | Chapters (length in units, speed) |
|---|---|
| Forward | zoom 4.4–5.2 (depends on the screen), 1 · portal 0.45, 1 · mind 4, 1 · break 2.4, 1 · machine 2.55, 1 |
| Show | burst 1.6, 1 · assemble 1.25, 1 · focus 0.9, 0.85 · hold 1.2, 0.34 · release 0.9, 0.85 · collapse 1.15, 1.15 |
| Pull-back | the forward chapters in reverse, at 2.1–3.1 in the tunnel and 1.4 for the zoom |
| Settle | 0.75 at 0.6, easing toward rest |

The zoom's length comes from the framing: from the opening composition to the
moment the target (his dilated pupil) covers the screen's half-diagonal. Compute
it per viewport so the dive always ends on the same picture.

This skill's [scripts/pace-map.mjs](../scripts/pace-map.mjs) turns such a list
into a scroll ↔ visual mapping with blended pace changes. With his chapter list
it reproduces his timeline's mapping to within 0.0001 units.

## 3. Keep the perceived speed constant

**Zoom in log scale.** Perceived zoom speed is the relative growth rate, so the
scale is `e^u`, not a linear ramp. A linear zoom crawls at the start and races at
the end.

**Zoom about the target.** Scale around the point you are diving into, and glide
that point from its opening position to the screen centre early in the dive
(Hemanth: over the first 70% or so, while the eye is still small).

**Convert everything else into the same units**, with the formulas above: tunnel
depth through the matched radius, approaches through the log of the distance
ratio.

**Blend the deliberate pace changes.** Hemanth slows to about a third of the
speed to read the projects and speeds up for the pull-back. Change speed by
blending 1/speed (scroll per unit) with a Gaussian about half a unit wide.
Blending 1/speed rather than speed keeps scroll distance additive: away from the
ends of the journey, a pace change moves scroll between neighbouring chapters
without adding or removing any. A step in speed, even a small one, reads as a
jolt.

**Ease arrivals out in log space.** To arrive at an object, start the arrival
where the approach's log rate equals cruise speed (that is, at a distance of one
unit's depth), then reduce the log rate linearly to zero over L units:

```text
distance(w) = D0 × e^(−(L/2)(2w − w²)),   w from 0 to 1 across the arrival
```

It leaves cruise speed without a jump and comes to rest at `D0 × e^(−L/2)`. The
final settle on the portrait applies the same idea to the pace itself: speed
eases to about a fifth across the last chapter.

**Keep velocity continuous across joins, not only position.** Examples from
Hemanth's timeline:

- The flight inside the window (section 5) starts from rest and reaches cruise
  speed exactly as the next chapter begins.
- The arrival at the processor core starts at the matched distance above.
- The project show never freezes: the camera keeps creeping toward the core
  along a slow log approach, and the pull-back leaves from wherever the show
  left the camera.
- A reading hold is a slow chapter with a slight breathing drift, not a stopped
  frame.

**Test it.** These are pure functions, so the tests are cheap. Sample the
scroll → visual mapping densely and check that the step between samples never
changes by more than a few per cent (Hemanth: under 5% across 4,000 steps, on
eight viewports). Check that every camera value (log scale, depth, log distance
to the core, window size) is free of jumps. Check the journey length across
viewports.

**Use the measured speed for finishing.** Estimate the visual speed (units per
second, smoothed over about 0.1 s) and let it drive a light radial blur, a
chromatic fringe, speed streaks and the length of a comet's tail. Fast flicks
then look like fast motion instead of stepping, and slow scrolling stays sharp.

## 4. A photographic zoom from a registered plate stack

A deep zoom into a photograph needs more pixels than one photograph has. In
Hemanth's v2 film the eye visibly changed between shots during the zoom. The fix
is a stack of plates that are all the same picture.

1. **One master.** Derive every level from one approved master (Hemanth: the
   1122×1402 portrait). Never swap in a separately photographed or separately
   generated subject at a new scale.
2. **Generated plates restore the master's own crops.** Hemanth's eye plate
   covers a 300×300-pixel region of the portrait around the pupil and his iris
   plate an 80×80 region. Each was generated from that exact crop as "a faithful
   high-resolution restoration, not a new photo"; the iris plate also used a
   photo of his real iris for texture. Prompts are in
   [media-production.md](media-production.md#stills-for-a-camera-in-code). Each
   level covers roughly a quarter of its parent's width.
3. **Register each plate to its parent.** ECC affine alignment (OpenCV
   `findTransformECC` with `MOTION_AFFINE`) on blurred greyscale, coarse to fine
   at a fixed working size. Store an affine from master pixels to plate texture
   coordinates. Check the correlation and look at a reference / aligned /
   difference triptych. Hemanth's eye plate registered at 0.995 correlation, its
   pupil within about 0.1 portrait pixel of the original; the iris plate at 0.96.
4. **Colour-match by low-frequency transfer.** Convert plate and parent to Lab,
   blur both at the scale of a few master pixels, and replace the plate's low
   frequencies with the parent's (resampled into the plate's grid). The plate
   keeps its fine detail and takes the parent's colour and shading, so a
   cross-fade only ever adds sharpness.
5. **Blend along natural boundaries.** Use soft masks where the picture already
   changes. Hemanth's eye plate fades out over skin, well away from the eye
   (between 58% and 94% of its radius). His iris plate hands over at the dark
   limbal ring around the iris, which hides the seam.
6. **Start the hand-off while the parent is still sharp.** Weight each plate by
   screen density relative to its parent's texel density: begin when one screen
   pixel still covers about two of the parent's texels, and finish just before
   the parent would be magnified past one texel per pixel. A plate that only
   appears once the parent has gone soft looks like a focus pull.
7. **Animate by remapping coordinates, not by sliding pixels.** Hemanth's pupil
   dilates by remapping the iris radially (inside the widened pupil, sample from
   the original pupil; between the pupil and the iris edge, stretch linearly), so
   the fibres stretch and nothing slides.
8. **Feather the master into the stage.** Ease the plate's dark backdrop to pure
   black toward its borders so no rectangle edge shows on wide screens.
9. **Give matching features matching detail.** If a similar feature is visible at
   the same scale, such as the other eye, it will look soft beside the restored
   one. Give it a plate too, or keep it out of frame.

Keep the claims honest: the plates are generated restorations that look right at
the scale shown, not a record of the person's real iris or skin.

## 5. Bridge scenes through a window, not a black gap

A black interval between two worlds reads as a cut or a loading pause, and the
eye loses the speed it was following. Instead, draw the next scene inside an
aperture of the current one before the aperture fills the screen.

Hemanth's pupil is the window. Late in the dive, as the pupil dilates, the neural
passage is drawn inside a circle that follows the widening pupil. Inside that
window, the flight starts from rest and its speed grows with the square of
progress through the window (speed = cruise × (u/W)², position is the integral of
that), so it reaches cruise speed exactly as the pupil covers the screen. There is no black
frame and no jump in speed. The pull-back runs the same path in reverse.

Other ideas have other apertures: a lens, a doorway, a screen inside the scene, a
hole in a page, the gap between two hands. Choose one that belongs to the concept.

## 6. Shader worlds from tileable AI textures

A long passage can come from one or two tileable textures and a small fragment
shader rather than a generated film.

**Polar tunnel.** For each pixel, take the radius r (in units of half the smaller
screen side) and the angle θ around the focal point. Depth along the wall is
`z + k / r`; sample the texture at `(θ / 2π × repeats around, depth / tile length)`.
Fade with depth so the far walls fall into darkness. A little slowly varying noise
in the radius makes an organic wall breathe; reduce it as the world becomes
mechanical.

**Sampling across the atan seam.** `atan` jumps from +π to −π along one line on
the screen. The texture coordinate jumps there too, the GPU picks the coarsest
mip level along that line, and a thin seam appears. Compute the derivatives again
from an angle whose jump is on the opposite side (`atan(−y, −x)`), keep the
smaller derivative per axis, and sample with `textureGrad`. Use mipmaps and
anisotropic filtering, because tunnel walls are seen at grazing angles.

**Morph fronts that travel through depth.** Turn one material into another along
a boundary in depth that starts far ahead and sweeps past the camera (Hemanth:
from 15 units ahead to just behind the camera across the chapter), roughened with
noise. The change appears in the distance first and then passes you, so the
passage becomes a machine without a visible line or a cross-fade.

**Mind the aperture problem.** Features that run along the direction of motion
carry almost no speed information; only features that cross it do. Hemanth's
circuit texture had traces running along the passage, so it read slower than the
neural tissue at the same speed. The fix was to tile it more densely (5 repeats
around and a 1.25-unit tile, against 3 repeats and 3.2 units for the neural
texture) so its cross-features pass at a similar rate. Better still, ask for
regular cross-features in the prompt: pads, vias, cross-traces, nodes.

**Give the passage an end.** Fade the walls out at a chamber depth and close the
tunnel with an end wall (a plane of the same texture at the core's distance) and a
symmetrical end plate at the vanishing point. Walls that simply stop in black
look unfinished.

**A guide that cannot stall.** Hemanth's blue signal is placed relative to the
camera, a fixed depth ahead, not in the world, so it always leads. Its tail grows
with speed and flips with the scroll direction. Near the end it falls into the
core and is absorbed.

**Particles as functions of state.** Seed the particles once (a fixed
pseudo-random sequence) and compute each position directly from state values
such as burst, assembly and collapse amounts. There is no simulation, so
scrolling back shows exactly the same particles. Hemanth's burst shards land on
the outlines of the project cards because the shader receives the same rectangles
as the DOM.

**Finishing.** Render the scene into a half-float target where available, then a
small bloom pyramid (soft threshold, five levels), the speed-driven blur and
fringe, a gentle vignette, grain, and a slight dither so dark gradients don't
band. Keep photographic plates in display colour so the face stays faithful.
Sample only the textures that are visible, branching on uniforms so derivatives
stay valid.

## 7. Overlays read the same state

Text and cards are DOM elements positioned every frame from the same state as the
camera, so they cannot drift.

- Opening copy, passing words, project cards and the closing line all take their
  opacity and transform from state values (Hemanth: `overlays.js`).
- Use one layout function for the DOM cards and for anything the shader draws
  around them.
- Words that ride with the signal take the signal head's screen position from the
  same function that sets the shader uniform.
- Write a style only when its value changes, and make hidden layers `inert` so
  hidden links cannot take focus.
- The canvas is `aria-hidden`. All content exists in the HTML for readers without
  JavaScript, screen readers and search engines. Keep text out of the imagery.

## 8. Loading tiers and budgets

**Bytes.** Ship plates and textures as image tiers listed in a manifest. Per tier,
record each file's path with a content hash in its name (so it can be cached
immutably), its byte size and, for plates, the texel density the blend needs
(plate texels per master pixel). Hemanth's build script resizes each source to a
per-tier longest side, encodes WebP, hashes the result and writes the manifest
(`build_journey_assets.py`). Set a byte budget per tier and a test that fails
above it. His design targets were about 4 MB for desktops and 2.5 MB for phones,
his tests fail above 4.5 MiB per tier, and the tiers came to about 1–2 MiB.

**Choice.** Pick the tier before downloading, from screen pixels (longest side ×
DPR capped at 2), pointer type, device memory, CPU cores, Save-Data and the
reported connection. Treat missing hints as unknown, not as fast. Hemanth sends
Save-Data, slow connections and low-memory devices to the low tier (about 1 MiB)
rather than skipping the journey, and loads nothing for it under reduced motion.
That trade-off only works because the tier is small; a film-sized download under
Save-Data would not be acceptable.

**Order.** Fetch in priority order with real byte progress: the first screen's
plate first, so the opening appears and responds at once; then the zoom stack;
then the textures for later chapters, which load while the visitor reads the
opening. Decode with `createImageBitmap`.

**Frame time.** Cap DPR at 2 and adapt the render scale to measured frame time.
Hemanth averages 45 frames: above 21 ms the render scale drops by 0.1 (not below
0.5), below 12.5 ms it rises by 0.05, and at 0.5 with frames still above 24 ms
the bloom passes switch off ("eco"). Touch devices start at 0.85. Stop rendering
while the stage is off screen or the tab is hidden. Keep the decoded images so a
lost WebGL context can be rebuilt.

## 9. Fallbacks and input

- Put a static poster of the opening in the HTML from the start; the canvas draws
  over it once it is ready.
- Reduced motion (the system setting or a switch on the site), no WebGL2, a failed
  manifest or image, and a context that cannot be restored all lead to the static
  poster and the full portfolio, with a short status message for screen readers.
  Never an indefinite loader.
- Keep Skip links to the work. A guided tour can scroll at a constant rate, which
  reproduces the authored pace exactly (Hemanth: 0.44 viewport heights per second,
  with about 0.6 s ramps at each end). Any wheel, touch, pointer or key input stops
  it.
- Keep the document as the scroller. Hemanth uses Lenis to smooth wheel input
  while touch keeps native momentum, plus a short extra damping (a time constant
  of about 45 ms, 65 ms on touch) before the timeline. Nothing locks the page.
- Lay out the journey with the small viewport height and size the stage with the
  large one, so mobile toolbars do not rescale the scene. On touch devices, ignore
  height-only resizes; on a real width change, rebuild the timeline and restore
  the same journey progress.

## 10. Measure the motion: optical-flow QA

Unit tests prove the mapping is smooth. They don't prove the picture moves at an
even speed: a texture, a mask or a missing plate can make one chapter read slower
than its numbers say. Measure the rendered frames.

1. **Capture mode.** Add a URL flag that stops the animation loop and exposes a
   function that renders one deterministic frame for a scroll value, with a fixed
   clock and zero velocity (Hemanth: `?journey-capture` exposes
   `window.__journey.frame(scroll)`, and `&nograin` turns grain off).
2. **Capture at uniform scroll steps.** Drive a headless browser through the whole
   journey in equal steps (Hemanth: 0.025 viewport heights at 480×300, in Chromium
   with software WebGL through SwiftShader). Hide overlays and the header, and
   save each frame with its chapter and progress.
3. **Measure flow.** For each consecutive pair, compute dense optical flow
   (Farneback) and take the median magnitude over textured pixels only. Flat black
   has no measurable flow; Hemanth required at least 500 pixels with a clear
   Laplacian response and left the step empty otherwise.
4. **Read it by chapter.** Plot flow per step against scroll with the chapter
   boundaries marked, print each chapter's median and spread, and flag steps where
   flow changes by more than about 60% from the previous one.
5. **Fix the cause.** Change a chapter's speed, a unit conversion, a texture's
   density or a mask, not the global scroll constant. Run it again.

Read the numbers with their caveats:

- **Grain must be off.** Random grain registers as motion everywhere.
- **Freeze the clock.** Time-driven shimmer adds flow unrelated to scroll.
- **Fine textures under-read at low resolution.** Detail smaller than the flow
  window, or aliased at 480×300, reads slower than it looks.
- **Zooms read low where the frame is mostly black.** Only textured pixels count;
  when they cluster near the centre, where a zoom's flow is smallest, the median
  drops. A dive into a dark pupil or an approach to a small bright object on black
  will under-read.
- **Deliberate holds read near zero** once the overlays are hidden.
- **Software rendering is not the device.** It shows the pictures and their
  motion, not frame rate or GPU behaviour. Flow is evidence that helps locate
  problems; scrolling the journey yourself on real phones and laptops decides.

Hemanth's capture and flow scripts were throwaway tools (`capseq.mjs` with
Playwright, `flow.py` with OpenCV) kept outside the repository. The steps above
are enough to rebuild them.

## 11. Where this lives in Hemanth's repository

| File | Role |
|---|---|
| `website/js/journey/timeline.js` | Scroll → state as pure functions: visual units, matched tunnel depth, chapter list, Gaussian-blended pace, framing per viewport |
| `website/js/journey/shaders.js` | Eye-stack compositor with dilation remap and iris data lanes; polar tunnel with seam-free sampling, depth morph, end wall and signal comet; shards; bloom; composite with velocity blur, fringe, grain and dither |
| `website/js/journey/renderer.js`, `gl.js` | WebGL2 passes, render targets, mipmapped anisotropic textures |
| `website/js/journey/journey.js` | Lenis, stable viewport, loading order, adaptive render scale and eco mode, guided tour, context loss, capture mode |
| `website/js/journey/overlays.js` | DOM layers and card layout from the same state |
| `website/js/journey/assets.js` | Tier choice and priority fetch with byte progress |
| `website/tests/journey.test.mjs` | Journey length, pacing steps, continuity, framing, card layout, tiers and byte budget |
| `production-v3/scripts/register.py`, `make_plates.py` | ECC registration and Lab low-frequency transfer (outside the repository) |
| `production-v3/scripts/make_seamless.py`, `build_journey_assets.py` | Tileable textures; WebP tiers with hashed names and the manifest (outside the repository) |

`make_seamless.py` makes a texture tile by blending it with a copy shifted by half
its size, feathered toward the edges, then restoring the local contrast that the
blend flattens. Use it only when a generated texture almost tiles; a texture that
tiles by itself is better. Hemanth's chosen neural and circuit textures tiled as
generated and shipped unmodified apart from resizing.

## Before asking for approval

- A written runtime choice with its reasons, budget and fallback.
- A chapter list in visual units, and tests for pacing steps, joins, framing and
  journey length on the target viewports.
- Registered, colour-matched plates with their correlation numbers and a
  triptych per level, reviewed at the scales where they hand over.
- Tileable textures checked tiled, with motion cross-features where speed matters.
- A byte budget per tier with a test, and the static path verified with reduced
  motion, without WebGL2 and with a failed image.
- An optical-flow plot by chapter, read with the caveats above, plus the journey
  scrolled by hand on at least one real phone and one real laptop. Say which
  devices were not checked.
