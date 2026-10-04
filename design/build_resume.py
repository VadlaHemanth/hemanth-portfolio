#!/usr/bin/env python3
"""Build the public, one-page PDF and matching accessible HTML from one JSON file.

Run from any directory:
    python3 -B /path/to/Portfolio/design/build_resume.py
    python3 -B /path/to/Portfolio/design/build_resume.py --check

Dependencies: reportlab, pypdf. Tested with ReportLab 5.0.1.
Fonts are embedded from ReportLab's bundled Bitstream Vera family; no downloads
or machine-specific font paths are needed. PDF timestamps/IDs are deterministic.
This script never reads personal dossiers or maintenance/provenance material.
Only the PDF and HTML paths below are written, after in-memory validation.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
from pathlib import Path
import re
import sys
from typing import Any
from urllib.parse import urlsplit

import reportlab
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "design" / "resume-data.json"
PDF_PATH = ROOT / "website" / "assets" / "Vadla-Hemanth-Resume.pdf"
HTML_PATH = ROOT / "website" / "resume.html"
PDF_HREF = "./assets/Vadla-Hemanth-Resume.pdf"
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 48.0
TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2
INK = "#18232E"
MUTED = "#485460"
ACCENT = "#164D70"


def escape(value: str) -> str:
    return html.escape(value, quote=True)


def validate_data(data: dict[str, Any]) -> None:
    """Reject malformed input, unsupported URLs, and accidental audit fields."""
    required = {
        "schema_version", "name", "headline", "location", "email", "phone",
        "profiles", "summary", "education", "skills", "projects", "activities",
    }
    if set(data) != required or data["schema_version"] != 1:
        raise ValueError("Use the public resume-data schema; do not add provenance.")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", data["email"]):
        raise ValueError("A valid professional email is required.")
    if not re.fullmatch(r"tel:\+[0-9]{8,15}", data["phone"]["uri"]):
        raise ValueError("Phone URI must use international numeric notation.")
    if not data["projects"] or not data["education"]:
        raise ValueError("Education and projects cannot be empty.")
    for degree in data["education"]:
        if degree["status"] != "In progress":
            raise ValueError("Confirm degree completion before changing this schema.")
        if not re.fullmatch(r"\d{4}", degree["expected_graduation"]):
            raise ValueError("Expected graduation must be a four-digit year.")
    for project in data["projects"]:
        if not project["status"] or not project["bullets"]:
            raise ValueError("Each project needs a maturity label and evidence bullets.")
    urls = [profile["url"] for profile in data["profiles"]]
    urls += [project["url"] for project in data["projects"] if "url" in project]
    for url in urls:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Public links must be complete HTTPS URLs without credentials.")
    # Regular hyphens are predictable in both PDF text extraction and ATS forms.
    if any(mark in json.dumps(data, ensure_ascii=False) for mark in "\u2010\u2011\u2012\u2013\u2014"):
        raise ValueError("Use ASCII hyphens, not Unicode dashes, in resume content.")


def register_fonts() -> None:
    font_dir = Path(reportlab.__file__).resolve().parent / "fonts"
    for name, filename in (("ResumeSans", "Vera.ttf"), ("ResumeSans-Bold", "VeraBd.ttf")):
        path = font_dir / filename
        if not path.is_file():
            raise RuntimeError(f"ReportLab's bundled font is missing: {path}")
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(path)))
    pdfmetrics.registerFontFamily(
        "ResumeSans",
        normal="ResumeSans",
        bold="ResumeSans-Bold",
        italic="ResumeSans",
        boldItalic="ResumeSans-Bold",
    )


def pdf_link(label: str, url: str) -> str:
    return f'<a href="{escape(url)}" color="{ACCENT}"><u>{escape(label)}</u></a>'


class ResumePage:
    """A single text flow; overflow is an error, never silently scaled or clipped."""

    def __init__(self) -> None:
        self.output = io.BytesIO()
        self.canvas = canvas.Canvas(
            self.output, pagesize=A4, pageCompression=1, invariant=1,
            initialFontName="ResumeSans", initialFontSize=11, lang="en-IN",
        )
        self.canvas.setTitle("Vadla Hemanth - Resume")
        self.canvas.setAuthor("Vadla Hemanth")
        self.canvas.setSubject("Early-career software development and applied AI")
        self.canvas.setCreator("ReportLab - reproducible resume builder")
        self.canvas.setKeywords("Software development, applied AI, Python, undergraduate")
        self.y = PAGE_HEIGHT - MARGIN
        self.blocks: list[dict[str, Any]] = []
        self.styles = {
            "name": self.style("name", 26, 31, bold=True),
            "headline": self.style("headline", 11.2, 16),
            "contact": self.style("contact", 10.5, 14.4),
            "summary": self.style("summary", 11, 15),
            "section": self.style("section", 11.2, 14.5, bold=True),
            "institution": self.style("institution", 10.5, 14.2, bold=True),
            "detail": self.style("detail", 10.5, 14.2),
            "skill": self.style("skill", 10.5, 14.4),
            "project": self.style("project", 11, 14.8),
            "bullet": self.style("bullet", 11, 14.8),
        }
        self.styles["bullet"].leftIndent = 11
        self.styles["bullet"].bulletIndent = 0
        self.styles["bullet"].bulletFontName = "ResumeSans"
        self.styles["bullet"].bulletFontSize = 9

    @staticmethod
    def style(name: str, size: float, leading: float, bold: bool = False) -> ParagraphStyle:
        return ParagraphStyle(
            name,
            fontName="ResumeSans-Bold" if bold else "ResumeSans",
            fontSize=size,
            leading=leading,
            textColor=colors.HexColor(INK),
            alignment=TA_LEFT,
            splitLongWords=False,
            allowWidows=0,
            allowOrphans=0,
        )

    def text(self, text: str, style: str, *, before: float = 0, after: float = 0) -> None:
        self.y -= before
        paragraph = Paragraph(
            text, self.styles[style],
            bulletText="\u2022" if style == "bullet" else None,
        )
        _, height = paragraph.wrap(TEXT_WIDTH, PAGE_HEIGHT)
        if self.y - height < MARGIN:
            raise ValueError(
                f"Resume exceeds one readable page at {style!r}. "
                f"Needs {MARGIN - (self.y - height):.1f} more points. "
                "Edit the content; do not shrink the type or margins."
            )
        paragraph.drawOn(self.canvas, MARGIN, self.y - height)
        self.blocks.append({
            "style": style, "top": round(PAGE_HEIGHT - self.y, 2),
            "height": round(height, 2),
        })
        self.y -= height + after

    def section(self, title: str) -> None:
        self.text(escape(title.upper()), "section", before=10, after=5)

    def finish(self) -> bytes:
        self.canvas.showPage()
        self.canvas.save()
        return self.output.getvalue()


def build_pdf(data: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
    register_fonts()
    page = ResumePage()
    page.text(escape(data["name"].upper()), "name")
    page.text(escape(data["headline"]), "headline", after=5)
    contact = [
        escape(data["location"]),
        pdf_link(data["phone"]["display"], data["phone"]["uri"]),
        pdf_link(data["email"], f'mailto:{data["email"]}'),
    ]
    page.text(" &nbsp;|&nbsp; ".join(contact), "contact")
    # Separate logical rows keep long addresses legible, even when printed.
    for start in range(0, len(data["profiles"]), 2):
        profiles = data["profiles"][start:start + 2]
        page.text(
            " &nbsp;|&nbsp; ".join(pdf_link(p["display"], p["url"]) for p in profiles),
            "contact",
        )
    page.y -= 8
    page.canvas.setStrokeColor(colors.HexColor("#C7D0D8"))
    page.canvas.setLineWidth(0.6)
    page.canvas.line(MARGIN, page.y, PAGE_WIDTH - MARGIN, page.y)
    page.y -= 9
    page.text(escape(data["summary"]), "summary", after=1)

    page.section("Education")
    for index, degree in enumerate(data["education"]):
        page.text(escape(degree["institution"]), "institution", before=5 if index else 0)
        detail = (
            f'{degree["program"]} | {degree["status"]} - '
            f'Expected {degree["expected_graduation"]}'
        )
        page.text(escape(detail), "detail")

    page.section("Technical Skills")
    for skill in data["skills"]:
        page.text(
            f'<b>{escape(skill["category"])}:</b> {escape(", ".join(skill["items"]))}',
            "skill",
        )

    page.section("Projects")
    for index, project in enumerate(data["projects"]):
        title = (
            pdf_link(project["title"], project["url"])
            if "url" in project else escape(project["title"])
        )
        page.text(
            f'<b>{title}</b> <font color="{MUTED}">| {escape(project["status"])}</font>',
            "project", before=7 if index else 0, after=3,
        )
        for bullet in project["bullets"]:
            page.text(escape(bullet), "bullet", after=2)

    page.section("Leadership & Activities")
    for activity in data["activities"]:
        page.text(escape(activity), "bullet", after=2)

    result = page.finish()
    reader = PdfReader(io.BytesIO(result))
    if len(reader.pages) != 1:
        raise ValueError("Expected exactly one PDF page.")
    extracted = reader.pages[0].extract_text() or ""
    if data["name"].upper() not in extracted or len(extracted) < 1500:
        raise ValueError("The PDF must contain complete, selectable text.")
    links = [
        obj.get_object().get("/A", {}).get("/URI")
        for obj in reader.pages[0].get("/Annots", [])
    ]
    required_links = {p["url"] for p in data["profiles"]}
    required_links.update(p["url"] for p in data["projects"] if "url" in p)
    required_links.update((data["phone"]["uri"], f'mailto:{data["email"]}'))
    if not required_links.issubset(set(links)):
        raise ValueError("A public contact or project hyperlink is missing.")
    return result, {
        "pages": 1,
        "page_size": "A4",
        "margin_points": MARGIN,
        "body_font_points": 11,
        "minimum_text_font_points": 10.5,
        "remaining_space_above_bottom_margin_points": round(page.y - MARGIN, 2),
        "selectable_text_characters": len(extracted),
        "hyperlink_annotations": len(links),
        "blocks": page.blocks,
    }


def web_link(label: str, url: str, *, accessible_label: str | None = None) -> str:
    label_attr = f' aria-label="{escape(accessible_label)}"' if accessible_label else ""
    return f'<a href="{escape(url)}"{label_attr}>{escape(label)}</a>'


def build_html(data: dict[str, Any]) -> str:
    contact = [
        escape(data["location"]),
        web_link(data["phone"]["display"], data["phone"]["uri"]),
        web_link(data["email"], f'mailto:{data["email"]}'),
    ]
    contact_items = "\n".join(f"            <li>{item}</li>" for item in contact)
    profile_items = "\n".join(
        "            <li>" + web_link(
            p["display"], p["url"], accessible_label=f'{p["label"]}: {p["display"]}',
        ) + "</li>"
        for p in data["profiles"]
    )
    degrees = "\n".join(
        f"""          <div class="education-entry">
            <h3>{escape(d["institution"])}</h3>
            <p>{escape(d["program"])} <span class="separator" aria-hidden="true">|</span> <span class="education-status">{escape(d["status"])} - Expected {escape(d["expected_graduation"])}</span></p>
          </div>"""
        for d in data["education"]
    )
    skills = "\n".join(
        f'            <div><dt>{escape(s["category"])}:</dt> '
        f'<dd>{escape(", ".join(s["items"]))}</dd></div>'
        for s in data["skills"]
    )
    projects = []
    for p in data["projects"]:
        title = web_link(p["title"], p["url"]) if "url" in p else escape(p["title"])
        bullets = "\n".join(f"              <li>{escape(b)}</li>" for b in p["bullets"])
        projects.append(f"""          <section class="project-entry" aria-label="{escape(p["title"])}">
            <div class="project-heading">
              <h3>{title}</h3>
              <p class="project-status">{escape(p["status"])}</p>
            </div>
            <ul>
{bullets}
            </ul>
          </section>""")
    activities = "\n".join(f"            <li>{escape(a)}</li>" for a in data["activities"])
    portfolio = next(p["url"] for p in data["profiles"] if p["label"] == "Portfolio")
    return f"""<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{escape(data["name"])}: undergraduate software-development and applied-AI projects, education, technical skills, and a one-page downloadable resume.">
  <meta name="theme-color" content="#050608">
  <meta name="referrer" content="no-referrer">
  <title>{escape(data["name"])} - Resume | Software Development &amp; Applied AI</title>
  <link rel="canonical" href="{escape(portfolio.rstrip("/") + "/resume.html")}">
  <link rel="stylesheet" href="./resume.css">
</head>
<body>
  <a class="skip-link" href="#resume">Skip to resume</a>
  <header class="viewer-header">
    <nav class="viewer-nav" aria-label="Resume actions">
      <a class="back-link" href="./index.html"><span aria-hidden="true">&larr;</span> Back to portfolio</a>
      <div class="viewer-actions">
        <a class="open-link" href="{PDF_HREF}" target="_blank" rel="noopener noreferrer">Open PDF<span class="sr-only"> in a new tab</span></a>
        <a class="download-link" href="{PDF_HREF}" download="Vadla-Hemanth-Resume.pdf" type="application/pdf">Download PDF <span aria-hidden="true">&darr;</span></a>
      </div>
    </nav>
  </header>

  <div class="viewer-shell">
    <div class="viewer-caption">
      <p>Application resume</p>
      <p>One-page PDF <span aria-hidden="true">/</span> Accessible web version</p>
    </div>
    <main id="resume" class="resume-paper" tabindex="-1" aria-labelledby="resume-name">
      <header class="resume-profile">
        <h1 id="resume-name">{escape(data["name"])}</h1>
        <p class="headline">{escape(data["headline"])}</p>
        <ul class="contact-list" aria-label="Contact details">
{contact_items}
        </ul>
        <ul class="profile-links" aria-label="Professional profiles">
{profile_items}
        </ul>
      </header>
      <p class="summary">{escape(data["summary"])}</p>

      <section class="resume-section" aria-labelledby="education-heading">
        <h2 id="education-heading">Education</h2>
{degrees}
      </section>

      <section class="resume-section" aria-labelledby="skills-heading">
        <h2 id="skills-heading">Technical Skills</h2>
        <dl class="skills-list">
{skills}
        </dl>
      </section>

      <section class="resume-section" aria-labelledby="projects-heading">
        <h2 id="projects-heading">Projects</h2>
{chr(10).join(projects)}
      </section>

      <section class="resume-section" aria-labelledby="activities-heading">
        <h2 id="activities-heading">Leadership &amp; Activities</h2>
        <ul class="activities-list">
{activities}
        </ul>
      </section>
    </main>
    <footer class="viewer-footer">
      <p>The same resume, in a format that works for you.</p>
      <a href="{PDF_HREF}" download="Vadla-Hemanth-Resume.pdf" type="application/pdf">Download the one-page PDF</a>
    </footer>
  </div>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check generated files without writing.")
    args = parser.parse_args()
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    validate_data(data)
    pdf, metrics = build_pdf(data)
    html_bytes = build_html(data).encode("utf-8")
    outputs = {PDF_PATH: pdf, HTML_PATH: html_bytes}
    if args.check:
        stale = [str(p) for p, expected in outputs.items() if not p.is_file() or p.read_bytes() != expected]
        if stale:
            print("Missing or out-of-date resume outputs:\n" + "\n".join(stale), file=sys.stderr)
            return 1
    else:
        for path, content in outputs.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    metrics["mode"] = "check" if args.check else "build"
    metrics["reportlab_version"] = reportlab.Version
    metrics["sha256"] = {str(p.relative_to(ROOT)): hashlib.sha256(b).hexdigest() for p, b in outputs.items()}
    print(json.dumps(metrics, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
