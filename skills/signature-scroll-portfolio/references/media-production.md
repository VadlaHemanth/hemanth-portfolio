# Media production for a distinct cinematic portfolio

Use this workflow when a personal visual story needs generated footage, deterministic compositing and responsive scroll delivery. Choose only the stages the project needs. A good approved shot does not need another model comparison; a source-preserving camera move does not need video generation.

**Reference version:** 1 · **Reviewed:** 4 October 2026. Provider limits, available models, licenses and browser capabilities must be checked again when executing. Examples are decisions from one production, not universal presets or approval to upload, spend compute or publish.

Jump to [prompts](#2-storyboard-semantic-changes-and-shared-boundaries), [review/repair](#4-make-review-bounded-without-pretending-samples-are-exhaustive), [Kaggle](#8-budget-kaggle-as-a-controlled-job-not-an-unlimited-render-farm), [encodes](#9-separate-preservation-quality-intermediates-and-web-delivery) or [release evidence](#11-release-by-manifest-and-keep-the-history-honest).

## 1. Give the motif a job

Before generating, write a short creative contract:

- **Person and proof:** what does this creator actually make, and which public work demonstrates it?
- **Motif:** which object, process, environment or gesture expresses that practice? An eye, blue palette, processor or H² monogram is not mandatory.
- **Transformation:** what changes, why does it change, and what recognizable feature persists?
- **Reveal and return:** how does the visual lead to useful work and reconnect to the person or original motif?
- **Limits:** approved identity sources, forbidden inventions, reading space, motion tolerance, device targets and budget.

Reject a concept whose only connection to the person is a name over generic cinematic footage. Also reject a concept that needs an entire private biography sent to a generation service. Supply only the authorized reference assets needed for the shot.

Establish the static experience at the same time: portrait or other meaningful poster, real project links, readable claims and direct navigation. Completion of the cinematic sequence must not become a condition for reaching the portfolio.

## 2. Storyboard semantic changes and shared boundaries

Describe each shot in a small ledger:

| Field | Decision it captures |
| --- | --- |
| Shot / purpose | One change the viewer should understand |
| Start / end assets | Exact approved files and digests, not two lookalikes |
| Camera / continuity | Optical axis, focal anchor, direction, scale and motion at the join |
| Constant features | Identity, material, layout, light or a travelling signal |
| Generated vs code | What the model may invent; what stays deterministic |
| Timing | Supported generation duration, intended edit range and handle frames |
| Aspect / safe area | Active subject and later text/overlay clearance |
| Acceptance / fallback | A visible pass criterion and a bounded repair route |

The end asset of shot A should normally be the start asset of B. A labelled storyboard/contact sheet is for review, not a set of full-resolution generation inputs. Do not extract tiny panels and pretend they are production keyframes. A midpoint illustration is not an enforced constraint unless the chosen tool actually supports it.

### Complete storyboard-image prompt template

Fill the brackets from the approved creative direction **before** sending this
prompt. Use the real planned beats, not Hemanth's eye sequence by default.

```text
Create ONE overview storyboard image for a cinematic personal portfolio.
This is a planning contact sheet, not a finished video or production keyframe.

OWNER / IDEA
[Owner's approved public role and a short, specific creative concept.]
The distinctive motif is [confirmed craft/object/process/feature].
The story should communicate [what the viewer learns about this person].

REFERENCES AND INVARIANTS
Use supplied reference [A] for [identity/primary object].
Use reference [B, only if supplied] for [specific allowed secondary role].
Keep [identity, geometry, material, palette and directional anchors] consistent.
Do not replace the motif with a generic eye, brain, processor or neon tunnel.

STORYBOARD LAYOUT
Arrange [number] equal [panel-aspect] panels in a clear chronological grid.
Read left to right, top to bottom. Use thin neutral separators OUTSIDE panels.
Every individual panel must be edge-to-edge imagery, with no baked black bars.
Do not add a title, panel numbers, fake UI or captions inside the artwork.
I will add reliable labels to the review sheet separately.

BEATS — SHOW THE WHOLE ARC
Panel 1: [static opening; identity and space for actual DOM heading].
Panel 2: [first clear movement; what causes the next transition].
Panel 3: [approach; focal anchor and direction].
Panel 4: [threshold/transformation; same recognizable anchor].
Panel 5: [development; one continuing path or process].
Panel 6: [arrival; setting where real work will appear].
Panel 7: [one readable reveal with deliberately blank surfaces/space].
Panel 8: [small departure movement, not a second identical reveal].
Panel 9: [return/resolution tied to the original identity or motif].
Panel 10: [final stable composition that can hand off to the HTML portfolio].
[Change the number/description of panels to fit the actual approved story.]

FRAMING AND TASTE
Visual direction: [owner-approved palette, material, mood and lens language].
Camera: [coherent path with controlled changes, no unexplained axis switches].
Protect [subject/project safe areas] for [target desktop/phone compositions].
If a phone composition differs, show its plan in a SEPARATE later sheet;
do not squeeze contradictory aspects into one generation request.

DO NOT GENERATE
Project names, fake screenshots, logos, text, charts, metrics, extra identity,
unapproved props, watermarks requested as artwork, or new story beats.
Do not claim the panels enforce exact motion or identity in a later video.

Output one complete high-resolution planning sheet. Preserve the story and
consistency over decorative detail.
```

Treat all requested output properties as a brief to review, not guaranteed
model controls. After approval, generate clean full-resolution keyframes
individually using the next template and the exact shared-boundary ledger.

### Still/keyframe prompt template

```text
Create [one start / end / intermediate still] for [shot purpose].
Reference A controls [identity / geometry / target viewpoint].
Reference B, if supported, controls only [material / lighting / detail context].
Preserve [specific recognizable features, gaze/pose/orientation, object layout].
Change only [the intended presentation or semantic transformation].
Frame for [aspect], keeping [active subject] and [overlay-safe region] usable.
Keep [continuity anchor] at [relative position] and retain [incoming direction].
No generated words, project UI, extra subjects or unrequested structural changes.
If the permitted edit cannot preserve the protected feature, keep that feature
unchanged and return a separable background/effect rather than a replacement.
```

### First/last-frame motion prompt template

```text
Use START and END as ordered endpoint references for this single shot.
Move from [start state] to [end state] by [one camera/material progression].
Maintain [identity/shape/material] and [optical axis / signal direction].
Between the endpoints, show [specific transformation], not merely a dissolve.
Keep the scene inside the authored [aspect] composition; no padded matte,
anisotropic stretch, sudden reframing, new objects, flash or camera reset.
Arrive with [settling behaviour / continuing velocity] for the next shot.
Leave [surfaces] blank; typography and approved project content come later.
```

These are adaptable briefs, not promises of pixel locks. Record the actual host, model/version, mode, reference-slot semantics, duration, resolution, output count and settings. Do not invent unsupported “identity strength,” seeds or third-frame controls.

Check the chosen model's current documentation; for example, the [Google Gemini Omni guide](https://ai.google.dev/gemini-api/docs/omni) was retrievable on 4 October 2026. API documentation does not prove that a third-party host exposes the same controls or routes a particular returned clip to that model.

## 3. Receive originals, not previews

Keep immutable originals separate from references, trials, approved processed sources and delivery files. Download the original result rather than screen-recording it or saving a chat thumbnail. A JPEG converted to PNG has not regained detail.

For each asset, retain:

- Origin, creator/likeness permission and relevant license/usage terms.
- Source digest, selected take, generation/edit parameters and upstream asset dependencies.
- Actual raster, pixel aspect, codec, pixel format, colour metadata, frame count, frame rate, presentation timestamps, duration and audio streams.
- Selection/rejection reason, observed defects, review scope and reviewer/date.

Useful read-only intake commands, after setting `INPUT` to an approved local file:

```bash
sha256sum "$INPUT"
ffprobe -v error -count_frames \
  -show_entries stream=codec_type,codec_name,width,height,pix_fmt,sample_aspect_ratio,avg_frame_rate,nb_read_frames,color_space,color_transfer,color_primaries,color_range:format=duration,size \
  -of json "$INPUT"
ffmpeg -v error -xerror -nostdin -i "$INPUT" -map 0:v:0 -f null -
```

A full decode catches problems a header probe cannot. Separately inspect frame/packet timestamps and stream policy; a container can last longer than its video because of audio. For a known constant-rate edit, verify the intended frame count and presentation cadence, not only rounded duration. With B-frames, decode and presentation order differ; do not require every packet's DTS to equal its PTS.

Hash-checked copying proves preservation. It does not prove identity, authorship, visual quality or rights. [FFprobe documentation](https://ffmpeg.org/ffprobe.html)

## 4. Make review bounded without pretending samples are exhaustive

Plan an explicit **image-bearing result budget** before opening media. For example, cap a fresh reviewer context at **20 or fewer image results**, counting screenshots and native crops as well as contact sheets. This is a conservative workflow limit, not a claim about a provider's current hard limit.

Use chronological sheets to locate problems, then a few native crops and short playback ranges to decide them. Include every adjacent frame around a suspected pop, not just a flattering start/end pair. Log timestamps, zero/one-based frame conventions, source versions and exact coverage.

When available, split entry/identity, abstract motion and responsive hardware review into fresh contexts with disjoint write scopes. Return text findings and asset identities instead of reloading all images into a coordinator. Hand over browser ownership explicitly; do not drive the same page concurrently.

Stop at the cap with a text checkpoint. Continue in a fresh context if needed. A reduced contact sheet can establish sequence coverage but not every native pixel or realtime cadence. A metric can locate a suspicious region; it cannot certify smoothness, identity or absence of flashes.

### Diagnose before spending another generation

| Failure | First useful response |
| --- | --- |
| Attractive still, wrong gaze or object orientation | Fix reference authority/viewpoint; a centred crop will not change gaze |
| Identity changes during a zoom | Reuse one approved source; reveal abstraction earlier or conceal a deliberate source transfer |
| Long soft macro | Shorten unsupported magnification; obtain a better real capture if needed, not invented “restoration” |
| Model merely dissolves between materials | Specify a local structural change; composite controlled layers if topology still fails |
| Duplicated processor/object or unrecoverable geometry | One targeted retry or deterministic rebuild; don't hide it with bloom |
| Stationary/duplicated leader | Correct once against source indices; distinguish the leader from background highlights |
| Panel drift or overlap | Use recorded quads/controlled planes, or hand off to a deterministic layout |
| Isolated flash/pop | Inspect neighbouring frames; trim or repair the smallest justified window and retest both joins |
| Endpoint mismatch | Compare actual generated endpoints; align/trim/rebuild the join rather than trusting the input stills |

Set a retry budget and stopping condition. Keep rejected takes; do not quietly substitute them because their filenames look similar.

## 5. Protect identity and the return path

For an eye passage, compare the same pupil, iris/lid relationship, gaze, catchlight, local colour and orientation at matched scale. For another motif, identify its equivalent invariants: a tool's silhouette, handwriting, grain pattern, gesture or product geometry.

A portrait and separately photographed macro may not share projection or anatomy at the visible scale. Repeated dissolves can create double exposure. Useful alternatives are:

1. A single-source affine camera move with the effect restricted to a measured aperture.
2. An earlier transition into clearly abstract material.
3. A deliberately registered cut, disclosed as an edit rather than seamless anatomical continuity.
4. A new authorized capture matching the required viewpoint.

Do not independently regenerate identity for every aspect or return shot. A generated approved portrait is still generated; “same source throughout” is a continuity statement, not proof that it matches the original person pixel-for-pixel.

Decide whether the return should be an exact retrace or a newly authored backward camera move. Exact reversal intentionally reverses particles and assembly too; use it only when that supports the story. For a retrace:

```text
forward[k] = correct_and_compose(source[source_index[k]], pinned_recipe)
return[j]  = forward[reverse_map[j]]       # reuse processed pixels
assert hash(return[j]) == hash(forward[reverse_map[j]])
```

Do not run cleanup again or advance a new pulse clock during the return. Verify decoded delivery separately: lossy video can differ slightly even when the pre-encode RGB frames match. Pin the code version used by the render process; an on-disk edit does not hot-reload an already imported module.

## 6. Author framing variants, then place truthful project content

Choose composition families from the story and target viewports, not a mandatory list of devices. Wide, balanced and tall are useful starting points; a portrait-tablet variant may be justified if neither adjacent composition works.

- Uniformly scale identity layers; never stretch a face or device.
- Use shot-specific focal anchors. A safe opening crop does not establish a safe processor/reveal crop.
- Preserve the active subject: deliberate eye close-ups are different from accidentally clipping hardware or project surfaces.
- Re-arrange controlled layers for narrow canvases. Designed dark headroom is scene composition; padding an unchanged landscape movie with bars is not equivalent.
- At transitions between crop/cover and free scene placement, inherit the preceding transform before easing to the next. Test the same boundary in reverse.
- Keep one complete primary project surface legible rather than squeezing three unreadable interfaces into a phone. Check short landscape, split screens, large text and browser-toolbar changes.

Generate blank surfaces, not fake app screenshots. Add approved public screenshots or clearly labelled concept/demo covers as separate layers. Redact private records, faces, invoice data and credentials before composition. Use measured plane geometry or deterministic planes; HTML alone is not a tracking solution.

Check overlay timing against presented media frames, at final viewport size and with real text. When plane content cannot be read comfortably, expose the full case study in ordinary document flow. The film is a preview, not the only evidence.

## 7. Treat cleanup and enlargement as separate, authorized operations

Prefer a provider-supported clean export when available. Before any visible-mark removal, establish permission for the material and the requested edit, and check the applicable terms. Removal does not grant reuse rights or make generated material original photography.

Keep the marked original and provenance. Do not aim to defeat invisible provenance systems or misrepresent the output's origin. Do not bypass browser upload/permission boundaries with relocated copies, encoded injection or hidden page APIs. Ask for a legitimate upload, an approved permission change or separately authorized local processing.

For an authorized repair:

- Test the smallest justified mask with surrounding context, not a broad blur.
- Compare before/after at native scale and through consecutive frames.
- Verify pixels outside the mask in the same decoded colour representation when exact locality is intended.
- Inspect after enlargement too: upscaling can amplify a subtle seam or repair pop.
- Call occluded pixels **estimated**, even if they look plausible. Reverse-alpha removal requires the correct overlay/compositing model and does not guarantee exact recovery from a compressed source.

Compare conservative resampling with any neural upscale on the **same frames**, including identity detail, thin lines, flat areas and motion. Reject invented texture, changed colour/shape, ringing, tile seams and temporal shimmer. A smaller model can be the useful choice; a sharper still can be the worse sequence.

Keep DNI/model blending, whole-image blending, spatial masks and temporal processing distinct in the recipe. A 50% image mix is not automatically a model denoise setting. Code licenses, checkpoint rights, generation-service terms and likeness permissions are separate questions; retain relevant notices and checkpoint hashes. [Real-ESRGAN upstream](https://github.com/xinntao/Real-ESRGAN) · [LaMa upstream](https://github.com/advimman/lama)

## 8. Budget Kaggle as a controlled job, not an unlimited render farm

Kaggle is optional. Use it when authorized cloud transfer and the measured compute benefit justify it.

1. **Authorize the scope:** which files may leave the machine, resource visibility, expected quota use, runtime ceiling and whether datasets/notebooks may be created. Do not upload a whole working directory.
2. **Read current capacity:** check remaining quota and active sessions. Yesterday's allocation and one project's “30 hours” observation are not a guarantee.
3. **Run a media-free smoke test:** verify actual kernels/inference, not just that a GPU name appears. Record runtime image, package versions, device and precision.
4. **Start with bounded samples:** consecutive frames from distinct content classes, controls and one or two candidates. Benchmark setup, inference, encoding and I/O separately.
5. **Estimate the real batch:** `frames_to_process × measured_seconds_per_frame + setup + encode + transfer + reserve`. Use all source frames if that is the actual plan; do not budget only the edited length while processing full takes.
6. **Verify privacy remotely:** both input dataset and notebook must be private before sensitive assets are attached. Stage only authorized media, licensed dependencies and checkpoints. Disable notebook internet when dependencies are staged and the work permits it.
7. **Keep credentials outside artifacts:** use the configured connector/CLI credential store. No cloud tokens in scripts, notebook cells, metadata examples, logs, screenshots or public receipts.
8. **Run once, rejoin deliberately:** retain the job identity privately. Empty logs alone are not a reason to submit a duplicate. Back off polling; cancel/retry within the agreed budget when there is evidence of failure.
9. **Download and independently verify:** expected file inventory, byte sizes, hashes, complete decode, dimensions, frames, PTS and processed-pixel hashes where supplied. “Notebook complete” and “download began” are not delivery acceptance.
10. **Review before promotion:** keep diagnostic/uncleaned samples out of the final edit. Preserve originals and receipts; delete scratch only after verified recovery inputs exist and cleanup is authorized.

Prefer the working installed stack over unbounded environment rebuilding. Record changes to vendored inference helpers and their licenses; do not paste a giant restoration library into the skill. A reported two-GPU allocation is not evidence the code used both efficiently.

Official references: [Kaggle CLI](https://github.com/Kaggle/kaggle-cli) and [notebook commands](https://github.com/Kaggle/kaggle-cli/blob/main/docs/kernels.md). Confirm current command/schema behaviour before writes; none of this documentation authorizes a new remote run.

## 9. Separate preservation, quality intermediates and web delivery

| Asset class | Honest claim |
| --- | --- |
| Original download | Exact provider/source bytes if copied and hash-verified |
| RGB FFV1 master/intermediate | Lossless storage of the chosen processed samples, with pixel format/bit depth verified |
| Upscaled raster | More output pixels; not necessarily more authentic detail |
| High-quality or “near-lossless” MP4 | Still lossy unless sample equality is actually established; label the tested scope |
| Browser rendition | Measured compromise among visual detail, bytes, decode cost and seeking |

An FFV1 encode after repair cannot undo the repair or recover prior compression loss. RGB→YUV conversion, chroma subsampling and changed bit depth may lose information even before the final codec. Preserve colour/range deliberately; do not “fix” mismatches by relabelling tags. [FFV1 format specification](https://www.rfc-editor.org/rfc/rfc9043.html)

Encode every candidate from the best approved composition source, not from the last web encode. If that source is already a lossy maximum-quality MP4, disclose that fact. Keep the original master and process recipe so future exports need not accumulate more generation loss.

### Measure a small candidate set

For a 24-fps scroll film, GOP 12 or 24 is a useful **experiment**, not a required preset. Shorter closed GOPs reduce dependency distance for random access; all-I often costs much more bandwidth. B-frames can improve compression but change decode/reorder behaviour. Test the actual candidate's forward, reverse and random seeks in target browsers.

```text
for candidate in a_bounded_set:
    encode(approved_composition, new_non_overwriting_path,
           codec=H264, crf=candidate.crf,
           closed_gop=candidate.gop, b_frames=candidate.b_frames,
           square_pixels=true, faststart=true,
           intended_colour_transform=recorded, audio=explicit_policy)
    verify(hash, full_decode, raster, frame_count, fps, PTS, keyframes, bytes)
    compare_at_equal_raster(reference, candidate, native_crops, motion, SSIM)
    measure_browser(startup, presented_frames, random_and_reverse_seek, memory)
    promote_only_if_reviewed(candidate)
```

This is pseudocode, not an executed encode. Use [FFmpeg's codec documentation](https://ffmpeg.org/ffmpeg-codecs.html) for the installed encoder/options. Do not copy one film's CRF, profile/level or dimensions blindly; in particular, do not force an aspect ratio by independent width/height scaling.

Spatial SSIM against a resized, already-lossy source is useful comparative evidence, not ground truth or a universal quality threshold. Different-raster scores cannot rank absolute detail. Full-sequence measurements and the worst local crops matter more than an attractive single frame.

**Provider-specific example, checked 4 October 2026:** [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) specify **25 MiB per asset** (`25 × 1024 × 1024` bytes), not 25 MB. The case-study desktop file is 25,180,717 bytes and fits. This is neither a general web standard nor an instruction to target the maximum. Recheck the chosen host; larger masters may belong in separate authorized storage. Splitting bytes can satisfy a file cap but does not reduce total bandwidth or memory, and arbitrary byte chunks are not adaptive streaming.

## 10. Couple delivery, scroll and optional sound to the real presentation

Choose the composition first, then an appropriate quality tier. Useful signals include rendered size/DPR, network/data-saving hints and device capacity; treat absent or inaccurate hints conservatively. Feature-detect and time-bound [MediaCapabilities decoding checks](https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo). Keep a poster/static path when loading or decoding fails.

Separate three clocks:

- **Encoded time:** frames and timestamps of the immutable film.
- **Story progress:** scroll distance, including intentional reading room.
- **Presented time:** what the video element has actually shown.

Manual scroll and an optional guided visit must not fight for ownership. In a guide, continuous playback with a bounded rate curve may outperform repeated seeks. Manual wheel/touch/pointer/navigation input should cancel guidance immediately. Precise source-frame control may still be needed at a slow reading interval.

Retiming should protect meaning, not flatten everything into the same speed. Smooth an optical-flow proxy only as a diagnostic; establish readable subject/overlay intervals and measure the result. Reverse jumps, aspect changes, fullscreen, hidden tabs and browser-toolbar resizing require explicit handling. Keep native document scrolling and direct content access.

For optional audio, require a clear enable action before starting sound; default to silence and retain a visible mute control. Derive accents from actual presented progress, with jump/reverse suppression, cooldowns and no voice stacking. Do not fire a backlog after seeking. Suspend/stop appropriately offscreen, in hidden tabs and under the chosen reduced-motion policy. Use licensed samples or documented synthesis, and audition on real speakers/headphones before approval. Source-code guards and waveform tests do not establish that the sound is pleasant, balanced or accessible. [Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)

## 11. Release by manifest and keep the history honest

The release manifest should identify active files and hashes, composition/tier, measured bytes, raster, codec/profile, frame count/fps/duration, keyframe policy, source/recipe revision and approval scope. Select by manifest, not a wildcard that might include rejected trials. Keep internal provenance separate from a public manifest that must not expose private paths or account identifiers.

Maintain a short status ledger:

| Status | Minimum supporting evidence |
| --- | --- |
| Proposed | Brief or plan; no execution implied |
| Generated / processed | Actual output plus source/settings receipt |
| Technically verified | Completed checks with exact artifact identities |
| Visually accepted | Review scope, conditions and known residuals |
| Integrated | Runtime uses those approved artifacts |
| Deployed | Target revision and public bytes verified after release |
| Changed / not rerun | Which prior approvals no longer cover current files |

Publish only the reviewed website build and public-safe résumé/content. Inspect the Git history as well as the current tree before public release; a local parentless commit or force push alone is not proof old remote content is inaccessible. Preserve an existing deployment/domain unless a change is actually requested. [GitHub sensitive-data guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) · [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)

After changing media, retiming, overlays, sound or build configuration, rerun the relevant checks against the new revision. Report exactly what was sampled and what remains untested. Do not reuse an earlier Lighthouse score, a test count or a GPU completion receipt as approval of a later release.

**Documentation maintenance:** stamp the date, release/recipe hash, source versions, provider-limit check date and review scope. Supersede old recommendations explicitly. Preserve the distinction between a prepared prompt, a completed cloud job, a downloaded file, an accepted sequence and a shipped experience.
