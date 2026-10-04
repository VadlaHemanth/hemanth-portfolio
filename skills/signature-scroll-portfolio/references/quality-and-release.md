# Evidence, recording and release

Use for QA, packaging, deployment or follow-up changes. “Done locally”,
“committed”, “pushed”, “deployed” and “verified live” are different states.

## 1. Make a change-specific test plan

Don't redesign an approved site for a small request. Record the baseline revision,
working-tree changes and intended deltas. Preserve unrelated owner work.

Check at least the relevant combinations:

- Desktop and a short laptop viewport, including high-DPR where practical.
- Phone, landscape phone and the actual tablet compositions.
- Slow/constrained network, Save-Data and unavailable network hints.
- Reduced motion, no JavaScript, keyboard-only and screen-reader structure.
- Failed/aborted media, static/direct-link entry, rotation and fullscreen.
- Normal guided exploration, forward/back manual scroll and interrupted guide.

Prioritize the owner's real audience and hardware. Emulation is useful but **not
proof on every physical device**. State which physical checks remain.

### Functional and visual tests

Check actual screenshots/video and DOM geometry for overlap, unreadable
project names, clipped identity, horizontal overflow, fixed-header obstruction,
duplicate sections and stretched media. One bounded contact sheet can show
multiple checkpoints without overloading an image context.

Measure first visible response after the CTA, fully readable project interval,
one approach/retreat instead of a repeated hold, and the final handoff to normal
content. Use relative and absolute checks appropriate to the viewport.

Test focus restoration after dialogs/loaders, direct content navigation, correct
accessible names and visible focus. Static tests can catch broken references;
real browser tests catch interaction and decoder failures.

### Performance

Record transfer bytes, selected variant, decode behavior, long tasks and memory
where useful. Run throttled profiles as lab evidence, not invented field
telemetry. Lighthouse is one tool, not an award or all-device smoothness
certificate. Do not hide a giant download just to improve its score.

Compare encodes on the same approved source and representative difficult frames.
SSIM/VMAF can support decisions, but do not prove perceptual equivalence,
losslessness, facial accuracy or recovered detail.

## 2. Record the actual site

Record the browser-rendered website, not only the underlying film labelled as a
website demo. Use an isolated preview/browser context containing no personal
tabs, bookmarks, credentials or notifications. Keep browser controls out of
the composition where possible without disguising what is being shown.

Suggested demonstration, adjusted to the site:

1. Brief readable opening, then click the real Explore control.
2. The full approved journey at the actual site pacing.
3. A small amount of ordinary scrolling to establish that real work follows.
4. Optionally one short case study/skills interaction and an ending with the
   site identity. Do not rush through every section.

Record wide and portrait only when the intended post needs them. A compact
1080p H.264/MP4 with appropriate frame rate and fast-start is broadly useful;
verify the target platform's current requirements.

**Audio approval gate:** a silent preview recording can be prepared first.
When the user approves the sound, capture the approved site's actual audio or
render its logged cue schedule using exactly the same samples/gain. If audio
is muxed from that schedule, state that in production notes. Don't invent a
continuous soundtrack, record a microphone, or claim a manual screen capture
if it was an automated browser run.

If the owner rejects sound, remove the audio experiment and proceed with a
sound-free final capture. Do not keep asking for sound approval or silently leave
an unwanted audio toggle in the interface.

Check the resulting video by decoding it and inspecting start, reveal and end.
Verify dimensions, duration, frame count, codec, audio streams and silence/clipping
as applicable. Keep an unedited capture or a reproducible capture script.

## 3. Write a showcase post with the owner, not a persona

Use concrete first-person decisions, trade-offs and observations. Match the
owner's directness and vocabulary without reproducing typos. Avoid filler,
generic “thrilled to announce” language and unsupported superlatives.

Include the real idea, one or two hard implementation decisions, the website
link and an invitation to try it. Mention the reusable workflow if it exists.
Keep an unreleased skill URL explicitly pending; never put a plausible but
nonexistent repository link in the public copy.

Human-directed work can honestly acknowledge AI-assisted media/code. Do not
assert “100% human-made”, “no AI” or an award that never happened. The owner
should read and adapt the draft before posting. Drafting is not authorization
to post on their account.

## 4. Prepare a public-only package

Use an explicit build allowlist, not “upload this whole folder.”

Exclude:

- `about-me.txt`, raw memory exports, transcripts and fact ledgers.
- Private project names/URLs, credentials, environment files and account IDs.
- Unapproved portraits, source screenshots and licensing-restricted material.
- Model caches, unused renders, review artifacts, node_modules and temporary files.

Include:

- Site source and reproducible build configuration.
- Only currently selected public assets and necessary manifests.
- Accessible résumé only if approved.
- Tests and useful public developer documentation in the repository; usually
  not in the deployed web root.
- A scoped license only after the owner's choice, with media rights separated.

Inspect both **tracked files and history**. `.gitignore` does not remove an old
secret or dossier from commits. If an owner approves a clean-history public
repository, prepare it deliberately and preserve the original private history.
Never `push --mirror` or `push --all` from a checkout with private recovery refs.

Cleanups are separate, explicitly scoped operations. Check active processes,
references and reproducibility before deleting caches. Do not clean other
projects, uninstall applications or kill unrelated tasks just because disk
space is low. Preserve original/approved media and the current deliverable.

## 5. Approval checklist

Before any external mutation, make the proposal unambiguous:

```text
Local preview:
Changes since last approved version:
Tests and remaining limitations:
Files/content approved for publication:
Repository + owner + visibility:
Branch/commit strategy:
Hosting project + build command + output folder:
Domain/DNS change, if any:
Sound decision: none / approved revision / awaiting review:
Recording/post approved?:
Rollback target:
```

If the user asked to preview before pushing, leave the working tree local and
show that preview. Do not create a public “preview repo”, upload recordings to
third parties or start a production deployment as a workaround.

## 6. GitHub → Cloudflare Pages example

This is one supported route, not a mandatory host.

1. Verify the user's actual account/repository permission and intended
   visibility. Reuse existing authorized integrations instead of reconnecting
   accounts or changing unrelated projects.
2. Check the current host limits and build behavior. Cloudflare Pages' per-file
   limit in the Hemanth build was **25 MiB (26,214,400 bytes)**. A decimal 25 MB
   comparison is not the same thing. Do not treat this number as timeless.
3. Configure the approved branch, build command and public-only output folder.
4. Push only the approved branch/commit. Confirm the remote head.
5. Read actual build/deployment status. Diagnose errors; don't report success
   merely because the Git push succeeded.
6. Verify the exact intended custom host and TLS. Avoid touching apex/ERP/other
   subdomain rules when only the portfolio host needs a change.
7. Check live HTML, script imports, manifest, résumé and representative/all
   critical media hashes according to the release risk.

### Cache traps worth checking

- HTML and mutable manifests/scripts must revalidate appropriately.
- Content-hashed media can be cached immutably.
- Duplicate matching header rules may combine into contradictory cache policy.
- A zone-level Browser Cache TTL can override expectations; inspect response
  headers on the real custom host.
- A query on `app.js` does not automatically propagate to its imported modules.
  Version imports consistently or use content hashes.
- Removing a file from the build may leave a cached old public URL. Check
  retired sensitive paths and use approved exact-host/path handling if needed.

Never disclose credentials in diagnostics, commits, notebooks, recordings or
public issue comments. Follow connector/browser permissions; don't bypass a
denied file save or authorization by switching transport.

## 7. Final receipt

Record the final revision, public URL, remote build result, selected media
bytes/hashes, test counts, tested profiles, known limitations and package path.
Use actual measurements. A “perfect, lossless 4K on every device” claim is not
a substitute for evidence.

Leave a compact resume checkpoint for a new chat:

```text
Objective and current approval boundary
Workspace / current branch / baseline and changed files
What is approved, rejected, pending
Canonical assets + manifests, not every old candidate
Commands that work and outputs already verified
Active processes/agents to reuse or stop
Current blocker or next local action
Public/private exclusions
```

This prevents a continuation from regenerating the owner's face, repeating a GPU
job, publishing unapproved audio or undoing an already deployed improvement.
