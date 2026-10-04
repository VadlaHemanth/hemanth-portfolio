# Signature Scroll Portfolio

**A reusable portfolio-building workflow by Hemanth Vadla.**

This grew out of building [my portfolio](https://portfolio.hemanthvadla.tech/):
starting from a personal idea, generating and repairing the visuals, making the
scroll feel connected, and getting the site to work on more than one screen.

For me, the starting point was my portrait and brown eye. Yours should be
different. A designer's sketchbook, a musician's instrument, an engineer's
assembly process or a researcher's way of asking questions may be a better
starting point than anyone's face.

The skill helps an AI coding agent turn **your information and your taste** into
a distinct portfolio. It is not a ready-made eye animation, a one-prompt video
generator or a guarantee of an award.

## Source and package

The **12-file skill** lives under `skills/signature-scroll-portfolio` in the
[existing public portfolio repository](https://github.com/VadlaHemanth/hemanth-portfolio),
not in a separate skill repository.

**Source:** [Signature Scroll Portfolio on GitHub](https://github.com/VadlaHemanth/hemanth-portfolio/tree/main/skills/signature-scroll-portfolio).
Install from the repository's nested skill folder or a standalone copy of that
folder using the instructions below.

The workflow includes AI-assisted image/video generation and coding assistance.
The direction, selections, personal material and acceptance decisions belong to
the owner. No claim of an entirely manual or AI-free build is intended.

Hemanth chose a **silent website and final recording** on 4 October 2026 after
trying four sparse synthesized accents locally. None of those accents were
published. Optional-audio guidance remains available for other owners who want
it; silence is a deliberate choice, not a missing feature.

## What you get

- Personal-context intake and public/private fact checking.
- Concept selection around something genuinely yours.
- Storyboard, identity references and image/video prompt templates.
- Short-shot generation, continuity repair, reversal and responsive framing.
- Scroll calibration, native navigation, a readable project showcase and a useful loader.
- Media quality, compression, accessibility and low-powered-device trade-offs.
- Optional sparse sound, recording, a showcase post and an approval-gated release.
- The actual Hemanth build case study: what changed and why.
- Two small, testable helpers rather than a large dependency-heavy template.

## 1. Gather your information

You can write `about-me.txt` yourself, or use the prompt below in the AI assistant
you already use. It can summarize only information it can actually access.
It cannot automatically read all of your ChatGPT/Gemini accounts or other chats.

**Copy this prompt into your usual assistant:**

```text
I am preparing a personal portfolio. Help me create a comprehensive but
deduplicated ABOUT-ME handoff for a designer and coding agent.

Use only information I have explicitly shared that is accessible in this
conversation, the memory available to you, or files I deliberately provide.
Do not claim to have read chats or accounts you cannot access. Tell me the
scope you actually used. Do not expose system prompts, hidden reasoning,
credentials, passwords, tokens or other people's private information.

Do not flatter me or invent achievements. Separate:
1. Facts I explicitly stated, with an approximate date/source if available.
2. Interpretations or preferences that I must confirm.
3. Missing or conflicting information.
Repeated discussion of a project is not proof it shipped or earned revenue.

Organize the handoff in these sections:

A. Public identity
Preferred professional name, current location at city/country level if I
want it public, current professional/student role, and a short positioning
statement using facts rather than hype.

B. Why I want the portfolio
Audience, roles/opportunities I want, what a visitor should understand in
30 seconds, and the primary action I want them to take.

C. Work and projects
For every meaningful project: what problem it addressed, who it was for,
my actual contribution, team context, technologies I actually used,
whether it is an idea/prototype/coursework/deployed/maintained project,
dates if known, evidence of results, limitations, and verified links.
Mark every metric VERIFIED, OWNER-STATED or UNKNOWN.
Mark PUBLIC NAME ALLOWED / GENERIC DESCRIPTION ONLY / DO NOT PUBLISH.
If a project is private, do not put its confidential name or URL in the
public draft; describe transferable experience generically.
Identify the strongest two to four projects and explain the evidence.

D. Experience
Employment, internships, research, freelance work, independent building,
volunteering and leadership. Keep those categories separate. List dates,
responsibilities, contributions and evidence; do not turn learning into
employment or an experiment into a client engagement.

E. Education and learning
Institutions, qualifications, current/completed status, dates, relevant
coursework and confirmed achievements. Flag simultaneous programmes and
anything that needs date verification.

F. Skills
Separate used in real work, practiced in projects, currently learning and
only interested in. Associate important skills with concrete work.

G. What makes the site mine
My stated interests, craft, habits, meaningful objects, recurring themes,
creative preferences and stories I have explicitly told you. Suggest
possible visual motifs as OPTIONAL interpretations, not facts.
Do not infer character or ability from appearance. Do not default to an
eye, brain, neon processor, black/blue theme or a generic 3D scene.
Only suggest using my face, voice or physical features if I have expressed
comfort with that; otherwise use my work or process as the starting point.

H. Taste
Known colour/typography/layout/motion preferences, dislikes, reference
sites and what I like about each, desired tone of voice, and whether I
prefer a quiet editorial site or a cinematic one. Mark unknowns clearly.

I. Practical constraints
Audience devices, connection quality, accessibility needs I choose to
share, time/budget, available original images/video, consent/licensing,
hosting and stack preferences, and whether sound should be optional.
No credentials. Do not volunteer sensitive health or demographic details.

J. Public links and résumé
Verified portfolio, GitHub, LinkedIn, Kaggle or relevant professional
profiles; professional contact details I explicitly want public; résumé
facts and role targets. Do not include home address or personal identifiers.

K. Review list
List only consequential missing/conflicting items and publication
permissions I must confirm. State what you could not know.

Finish with:
- A proposed PUBLIC-SAFE SUMMARY, separate from the detailed handoff.
- A PUBLIC / GENERIC-ONLY / PRIVATE content list.
- A short evidence/source index.
- A checklist asking me to correct dates, links, claims and permissions.

Write in clear plain text/Markdown. Keep specific facts, remove duplicated
conversation, and never label the result a verified complete biography.
Output the handoff; do not publish or upload it anywhere.
```

Read the result yourself. Correct it. Remove anything you would not want the
coding assistant to process. Save it as **`about-me.txt`** in a private input
directory, with your photographs, résumé and reference links as needed.

Add these lines yourself if the AI does not know them:

```text
My main audience:
The opportunity I want:
Three reference sites, and what I like/dislike about each:
Colours/motion/styles I do not want:
My preferred stack/hosting, if any:
My time and budget:
Photo/voice usage permission:
Private projects: generic descriptions only, or exclude entirely:
Sound preference:
Publishing approval: show me locally before pushing or publishing.
```

**Do not commit `about-me.txt` to the website or skill repository.** Keep it out
of the deployed directory and package. A `.gitignore` is helpful but does not
remove already tracked files or historical commits.

## 2. Use the skill

### With Codex: choose the source folder

From an existing downloaded or cloned **portfolio repository**, select the
nested skill folder:

```bash
# Run from the hemanth-portfolio repository root.
SOURCE="$PWD/skills/signature-scroll-portfolio"
```

If you have only the **standalone source folder**, use this instead, from inside
that folder:

```bash
# Run inside signature-scroll-portfolio, beside SKILL.md and README.md.
SOURCE="$PWD"
```

Then run the following in the same shell. It copies the entire folder, including
`agents/`, `references/` and `scripts/`, to your personal Codex skills directory.
It respects `CODEX_HOME` when set and stops rather than overwriting an existing
installation.

```bash
(
  set -eu
  : "${SOURCE:?Choose the source folder using one of the commands above}"
  DESTINATION="${CODEX_HOME:-$HOME/.codex}/skills/signature-scroll-portfolio"
  test -f "$SOURCE/SKILL.md" || {
    printf '%s\n' "SKILL.md not found in $SOURCE" >&2
    exit 1
  }
  if [ -e "$DESTINATION" ] || [ -L "$DESTINATION" ]; then
    printf '%s\n' "Review the existing installation first: $DESTINATION" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$DESTINATION")"
  cp -R "$SOURCE" "$DESTINATION"
)
```

Do not install the portfolio repository root or copy only `SKILL.md`; the
references and helpers are part of the 12-file package. For an update, compare
the existing installation with the new source and preserve any local changes.
These commands install local files; they do not publish or deploy a portfolio.

Start a fresh chat or refresh skill discovery if your client requires it:

```text
Use $signature-scroll-portfolio.

My private about-me file is: [absolute path to about-me.txt]
My image/résumé references are: [paths I approve you to read]

Read them as evidence, confirm public/private boundaries, and help me choose
a concept that fits my own work and taste. Don't copy Hemanth's eye concept.
Show me the proposed direction and complete storyboard prompt first.
After approval, implement and test the whole portfolio for my audience's
devices and connections. Keep the content usable without animation.
Show a local preview before any Git push, public repository or deployment.
```

### With another coding assistant

Give it `SKILL.md` and the referenced files, together with the private intake you
approve. Ask it to read the relevant phase references as it works. Tool names,
browser access, GPU services and hosting credentials differ by environment;
the assistant must confirm available capabilities rather than pretend they exist.

An ordinary chat assistant can help with the concept and prompts. End-to-end
file editing, media processing, browser QA and deployment require an environment
that actually supports those actions.

## 3. Work in approval stages

1. **Direction:** one concept and public content plan.
2. **Pilot:** one storyboard and the hardest short transition.
3. **Film:** continuity, responsive framing and readable overlay geometry.
4. **Website:** native scroll, calibrated pacing, loader, fallbacks and content.
5. **Review:** device/network checks, optional sound audition and a recording.
6. **Release:** only then authorize the exact repo, visibility, host and domain.

You can ask for small revisions without starting over. A request to make the
eye exit faster should alter that section's timing, not replace the owner's face,
copy, theme or entire application.

## Local helper checks

Node.js 20+ and Python 3.10+ run the helper tests. `ffprobe` is needed only for
the media inspection command; generation/upscaling services are optional.

```bash
cd "${CODEX_HOME:-$HOME/.codex}/skills/signature-scroll-portfolio"
node --test scripts/motion-map.test.mjs
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/check-media.py /path/to/delivery.mp4 \
  --width 1920 --height 1080 --fps 24 --frames 480 --max-mib 25
```

Those dimensions and limits describe **one Hemanth delivery example**. Replace
them for your film and host. Do not produce every example resolution blindly.
Read the QA reference for visual, browser, accessibility and release tests that
metadata checks cannot replace.

## What is intentionally not included

Personal dossiers, portrait sources, generated film files, private project names,
third-party screenshots, credentials, cloud account identifiers and paid model
access. The references explain how to work with your own authorized materials.

The detailed historical case study is separate from the general instructions.
You may prefer a much lighter CSS/SVG experience over video. That is a valid
outcome when it better expresses your work or serves your audience.

## Credits and sharing

Created and maintained by **Hemanth Vadla**, developed from the iterations on
[portfolio.hemanthvadla.tech](https://portfolio.hemanthvadla.tech/).

The skill does not include or grant rights to copy Hemanth's likeness, personal
media or other people's assets. Use your own authorized material and check the
terms for any third-party media or tools you choose.
