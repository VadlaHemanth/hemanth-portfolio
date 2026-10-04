# H² · Vadla Hemanth

Source repository for a responsive, cinematic personal portfolio. The website is
plain HTML, CSS and JavaScript with native-scroll video storytelling and no
runtime framework dependencies.

## Project structure

- `website/` — website, résumé, content, responsive web movies and tests.
- `design/` — reproducible résumé and social-preview builders.
- `scripts/` — public-site build and deployment checks.

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

## Repository boundaries

This repository contains the complete shipping website and its public artifact
builders. Raw personal dossiers, credentials, local environment
files, generated review caches, multi-gigabyte film intermediates and optional
full-resolution film downloads remain outside Git. They are not needed to build
or run the website and are preserved locally. Film re-rendering additionally
requires private production scripts and original media inputs; existing web
movies are ready to serve. The reusable video toolkit is kept separately.

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
rule to other hosts. Versioned video files retain their one-year cache policy.

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
Project notes, native disclosures and static fallbacks use the same source.
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

There is no wheel/touch interception. Scroll is native, with a sticky story and
ordinary sections below. The project scene progresses with a small camera move;
the original eye return has extra scroll distance.

One independently decodable H.264 rendition is selected by aspect ratio.
The current delivery uses high-quality H.264 MP4s with bounded 12–24-frame GOPs
derived from the approved maximum-quality sources. Each device composition has
a 720p efficient tier and a 1080p high-detail tier. Both retain all 480 frames at
24 fps. Every file is below the Pages 25 MiB limit; no segmented byte download is
needed for the current version.

The desktop high tier uses CRF 21 with two B-frames, preserving more detail at
about the same transfer size as the earlier CRF 22 encode. Capable short laptop
viewports prefer Full HD even when their visible browser height is below 720 px.
Constrained-device and slow-connection alternatives remain available.

Display size/DPR, connection hints and device capacity select the useful raster.
MediaCapabilities is consulted when available, with a bounded timeout and static
fallback if neither file can be decoded smoothly. Decoder reports are hints,
not physical-device certification. No 270p fallback or forced 4K exists.
Reduced motion, data saving and direct content links skip automatic loading.
No claim is made that the source portrait or film is native 4K.

Mobile stage dimensions are kept stable across browser-toolbar height changes.
Orientation changes and native fullscreen preserve the relative story position.
Fullscreen is shown only when the browser supports the document Fullscreen API.

The explicit Explore CTA guides the native scroll for roughly 25–27 seconds,
starting immediately at a steady scroll rate. The separate source-time curve
compensates for the film's uneven movement. It was calibrated offline from
smoothed optical flow with bounds. Eye entry and exit are slightly quicker, with
roughly three seconds of reading room at the projects. A symmetric camera zoom
in and out keeps that section moving rather than adding a stationary hold.
During that explicit guided visit, native video playback follows the curve with
a bounded changing playback rate instead of forcing a new seek on every RAF.
The slow project window uses precise source frames so the decoder clock cannot
rush past the names; the zoom camera continues moving through that interval.
Manual scrolling returns to precise seek-based control immediately.
Wheel/touch/pointer/navigation-key input cancels it immediately. It is not a
wheel-event override or scroll lock.

## Portable site

```bash
python3 scripts/package-site.py --name Hemanth-Portfolio-Public-v2.zip
```

The command rebuilds `dist`, verifies a ZIP and preserves any previous package.
It never packages the private dossier, maintenance evidence, source-video
archive or optional full-resolution film downloads.
