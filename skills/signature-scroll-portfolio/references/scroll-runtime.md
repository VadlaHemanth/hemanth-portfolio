# Scroll, video, overlays and sound as one system

Use after the direction and a media pilot are approved. Preserve an existing
working stack. A library may help, but it cannot fix mismatched imagery or a
poor time curve by itself.

## 1. Progressive architecture

Start with semantic HTML: readable identity, work, case studies, experience,
skills and contact. Keep important text in the DOM, not burned into a movie.
Style the static experience first.

Enhance the opening into a tall section with a sticky viewport. The source movie
is muted, inline, not looping, and selected once for the device. Ordinary page
content follows the sticky section. Provide direct Work navigation and Skip to
work. Do not trap a recruiter in a long intro.

Avoid replacing the native scrolling element or cancelling wheel/touch events.
One scroll listener should request at most one animation-frame update. Cancel
off-screen work. Prefer transform/opacity and profile expensive filters, masks
and excessive compositing layers; they are not universally “GPU free.”

## 2. Separate three coordinates

1. **Document progress:** normalized position within the sticky story.
2. **Source time:** which media frame corresponds to that progress.
3. **Presented time:** which frame the decoder actually displayed.

```js
const progress = Math.max(0, Math.min(1,
  (scrollY - storyTop) / Math.max(1, storyHeight - stageHeight)
));
const targetTime = timeAt(progress); // calibrated, monotone interpolation
```

Time-dependent overlays should follow presented time, especially around a slow
project reveal. Use `requestVideoFrameCallback` during playback where supported;
`seeked` is the useful acknowledgement during exact frame scrubbing.
Guard a fallback for unsupported callbacks. Avoid a stream of unresolved seeks.

Smoothing must be delta-time-aware:

```js
const blend = 1 - Math.exp(-dt / tau);
displayTime += (targetTime - displayTime) * blend;
```

Keep `tau` small enough that the scene feels attached to the user's input.
Use a bounded `dt` after stalls/tab changes. Do not solve source-motion problems
by making the entire site lag behind the scroll.

## 3. Calibrate perceived motion, not just clip duration

An AI-generated clip may accelerate into an eye, stop a travelling light, stall
on panels, then whip out. A linear `progress * duration` mapping preserves all of
those defects. A generic ease-in-out merely moves the defects around.

### Practical calibration

1. Mark meaningful source frames: initial visible motion, approach, threshold,
   journey, reveal landing, readable project state, departure, return, final frame.
2. Measure relative motion on low-resolution samples where helpful. Separate
   useful camera/subject displacement from flicker, bloom and foreground particles.
   Optical flow magnitude is evidence, not a sole judge of perceived quality.
3. Allocate scroll distance/reference viewing time by visual effort and meaning.
   Compress nearly static openings; give difficult transitions enough travel;
   reserve explicit reading time for work.
4. Create strictly increasing progress/time knots. Smooth the local rate using
   monotone cubic interpolation, not an overshooting spline.
5. Test the actual guide and manual scroll. Adjust only the offending intervals.
6. If the source truly stops or changes identity, repair the film. Timing cannot
   invent travelling motion or fix a different eye.

Use `scripts/motion-map.mjs` for interpolation, not for automatic aesthetic
decisions. Point data can come from manual review, motion analysis or both.
The mapping may be monotone even when the **authored film** contains a reverse
journey; source time continues forward while the visuals return.

### Guided “Explore” action

An optional guided visit should visibly begin in the first few frames, not use a
long ease-in over a nearly still source opening. Guide the native scroll position
at a steady rate and let the calibrated media curve do the perceptual work.

For continuous decoder playback, derive playback rate from the local derivative:

```text
playbackRate = d(sourceTime)/d(progress) × d(progress)/d(wallTime)
```

Clamp to tested decoder-supported values and correct bounded drift. Prefer
exact frame seeks in a slow reveal if native playback would outrun the names.
Don't run an independent clock for the camera or sound.

Cancel the guide immediately on wheel, touch, pointer interaction, navigation
keys, hidden document or reduced-motion change. No delayed animation should
pull the visitor back after they choose another section.

## 4. A reveal with breathing room, not two dead screens

Introduce the project planes once. If more reading time is needed, a slight
continuous approach and matching retreat can make the interval readable without
a frozen plateau. Keep the project information and motion in the same narrative
state; don't follow it with another identical held screen.

Measure how long names are **fully legible**, not merely mounted in the DOM.
Check contrast, actual projected text size and fixed-navigation clearance.
Avoid making the desktop cards so large that viewers cannot take in the set.
On mobile, recompose/stack rather than shrinking all the cards beyond readability.

Flat DOM cards can be fitted to moving planes with a homography. Track all four
corners, interpolate only between valid shapes, guard degenerate transforms and
hide/disable interaction when not visibly in the scene. Use accurate case studies
and public-safe conceptual covers if actual product screenshots are unavailable.
Do not fabricate screenshots or client outcomes.

## 5. Responsive geometry and stable mobile viewports

Choose authored compositions by aspect and actual display needs: e.g. wide,
phone, landscape tablet, portrait tablet when the concept requires them.
Do not assume every site needs four generated films.

- Never stretch a face to fill a frame.
- Avoid baking black bars into references or delivery.
- Use `cover` only when its crop preserves approved identity, projects and safe
  areas. Otherwise recompose media rather than silently clipping the subject.
- Device pixel ratio is useful but not permission to load enormous media.
- A short desktop viewport can still benefit from Full HD; don't equate browser
  height with weak hardware.

On mobile, browser address bars changing height are not a new aspect family.
Use stable viewport units/measurements and reframe for real width/orientation
changes. Save normalized story position before rotation/fullscreen, then restore
it under the new geometry. Do not reset to the beginning or show an unrelated frame.

## 6. Adaptive media and honest loading

Use same-origin, versioned assets with a manifest containing dimensions, actual
bytes, fps, duration, codec, keyframe interval, quality role and SHA-256.
Select before downloading. For a short scrub movie, buffering one chosen
complete file can be simpler than streaming, but it must fit the memory/network
budget. Long films may need a different architecture.

Use viewport/DPR, Save-Data, reduced motion, reported network/hardware hints and
bounded `MediaCapabilities.decodingInfo` where available. Those hints are
incomplete and may be wrong: handle absence and rejection without blocking.
Never fingerprint remotely to choose a video.

A useful loader:

- Reports real received bytes and separate decode/preparation state.
- Fetches only the chosen composition/tier, not every variant.
- Has a finite deadline and an immediate keyboard-accessible Skip action.
- Opens a readable static/content path on timeout, abort or decode failure.
- Does not automatically download the movie for a direct content link or
  Save-Data/reduced-motion preference unless the user chooses it.
- Releases unused buffers, object URLs and obsolete requests.

High-quality 720p may be a better constrained-device tier than blurry 270p or a
mandatory huge all-I file. Test in the target browser. Likewise, 4K can be a
separate master/download rather than the opening network requirement.

## 7. Optional sound: a punctuation mark, not a soundtrack

Only add it if requested and useful. Default off on each fresh visit; create or
resume AudioContext in a trusted click/key gesture. The film must work muted.
Provide a visible, keyboard-accessible labelled toggle, state and focus style.
Do not hide control behind headphones-only copy or surprise autoplay.

Pick a few meaningful boundaries and keep each sound under roughly a second.
Leave most of the journey silent. Original synthesis avoids sample downloads
and uncertain licenses; licensed short samples are also valid.

Use a crossing detector over presented source time:

- No cue on the initial frame or just because sound was enabled midway.
- No sound backlog after a large seek, resume, failed load or Skip to work.
- Drop cues crossed too fast to be meaningfully visible.
- Cooldown and once-per-visit gating prevent noisy boundary fidgets.
- Reverse scrolling need not fire extra cues. If it does, design and test that
  behavior explicitly rather than playing every sound twice.
- Keep simultaneous voices bounded; stop/fade on mute, hidden tab, modal, static
  mode, leaving the stage or page teardown.
- Don't persist enabled audio into a new visit without user intent.

Test the waveform peak/RMS, ramps and lifecycle, but listen on ordinary speakers
and headphones before approving the mix. Quiet dBFS values do not guarantee the
same perceived loudness on every device.

Supply a local audition using the **same waveforms and gain** as the site. If the
user requests approval first, do not publish sound or record a release video with
it before that approval.

If the owner declines sound, silence is the final decision—not an unresolved
approval. Remove the experimental module, toggle and sound-only layout changes;
verify that no audio context or soundtrack is created. Preserve the approved
visual pacing and make the final recording without an audio stream.

## Runtime invariants worth testing

| Invariant | Useful test |
|---|---|
| Source time is monotone and bounded | Dense interpolation samples + endpoint checks |
| Same rate independent of frame cadence | Integrate several `dt` values and compare |
| No guide fighting input | Real wheel/touch/key cancellation in browser |
| One readable reveal | Visibility transitions + projected bounds + viewing interval |
| Rotation preserves location | Before/after normalized position and composition |
| No empty experience on failure | Abort/404/decode rejection → accessible content |
| No unsolicited audio | AudioContext count before opt-in is zero |
| No repeated/stale cues | Fidget, reverse, seek jump, tab-hide and replay cases |
| Revisions don't regress pacing | Record and compare the approved route |
