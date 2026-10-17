"""Standard-library structural checks. No browser, server, or network needed."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import re
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


class Markup(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.nodes = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.nodes.append((tag, dict(attrs)))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


class StaticChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text()
        cls.markup = Markup(cls.html)
        cls.nodes = cls.markup.nodes
        cls.ids = {attrs["id"]: (tag, attrs) for tag, attrs in cls.nodes if "id" in attrs}
        cls.css = (ROOT / "styles.css").read_text() + "\n" + (ROOT / "css/journey.css").read_text()
        cls.css += "\n" + (ROOT / "catalog.css").read_text()

    def test_unique_ids_and_landmarks(self):
        counts = Counter(attrs["id"] for _, attrs in self.nodes if "id" in attrs)
        self.assertEqual([key for key, count in counts.items() if count > 1], [])
        for tag in ["main", "h1", "header", "footer"]:
            self.assertEqual(sum(name == tag for name, _ in self.nodes), 1, tag)
        self.assertIn('lang="en"', self.html)
        self.assertIn('name="viewport"', self.html)

    def test_hash_links_and_aria_references_resolve(self):
        for tag, attrs in self.nodes:
            href = attrs.get("href", "")
            if href.startswith("#"):
                self.assertIn(href[1:], self.ids, href)
            for attribute in ["aria-controls", "aria-labelledby", "aria-describedby"]:
                for target in attrs.get(attribute, "").split():
                    self.assertIn(target, self.ids, f"{tag}: {attribute}={target}")

    def test_local_asset_links(self):
        for tag, attrs in self.nodes:
            keys = ["src", "srcset"] if tag in ["img", "source", "script"] else ["href"]
            for key in keys:
                value = attrs.get(key, "")
                if value.startswith("./"):
                    self.assertTrue((ROOT / urlsplit(value).path.removeprefix("./")).is_file(), value)

    def test_media_sizes_alt_and_loading(self):
        for tag, attrs in self.nodes:
            if tag == "img":
                self.assertTrue(attrs.get("alt", "").strip())
                self.assertGreater(int(attrs["width"]), 0)
                self.assertGreater(int(attrs["height"]), 0)
                if "journey/poster" not in attrs["src"]:
                    self.assertEqual(attrs.get("loading"), "lazy")
        poster = next(attrs for tag, attrs in self.nodes if tag == "img" and "journey/poster" in attrs["src"])
        self.assertEqual((poster["width"], poster["height"]), ("1122", "1402"))
        self.assertEqual(poster.get("fetchpriority"), "high")

    def test_journey_is_a_scroll_driven_canvas_behind_the_opening(self):
        self.assertEqual(self.ids["top"][1]["class"], "journey")
        self.assertEqual(self.ids["top"][1]["aria-labelledby"], "hero-title")
        self.assertEqual(self.ids["hero-title"][0], "h1")
        canvas = next(attrs for tag, attrs in self.nodes if tag == "canvas")
        self.assertEqual(canvas.get("aria-hidden"), "true")
        self.assertIn("data-journey-canvas", canvas)
        hooks = [attrs.get("data-j") for _, attrs in self.nodes if "data-j" in attrs]
        self.assertEqual(hooks, ["hero", "hint", "thought", "cards", "cards-title", "final", "progress", "load", "status"])
        # First-visit scroll hint: decorative (the content is reachable without it), both input wordings.
        hint = next(attrs for _, attrs in self.nodes if attrs.get("data-j") == "hint")
        self.assertEqual(hint.get("aria-hidden"), "true")
        self.assertIn("Scroll down to begin", self.html)
        self.assertIn("Swipe up to begin", self.html)
        self.assertIn("data-journey-stage", self.html)
        # The previous site's loading screen: a labelled dialog with real progress and a way past
        # it. Hidden without JavaScript, and it lets go by itself if the scripts never arrive.
        loader = self.ids["experience-loader"][1]
        self.assertEqual((loader.get("role"), loader.get("aria-modal"), loader.get("aria-labelledby")), ("dialog", "true", "loader-title"))
        self.assertIn("A thought.<br>A world within.", self.html)
        bar = next(attrs for _, attrs in self.nodes if "data-loader-bar" in attrs)
        self.assertEqual((bar.get("role"), bar.get("aria-valuemin"), bar.get("aria-valuemax")), ("progressbar", "0", "100"))
        self.assertEqual(sum("data-loader-skip" in attrs for _, attrs in self.nodes), 1)
        self.assertIn("<noscript><style>.experience-loader { display: none !important; }</style></noscript>", self.html)
        self.assertRegex(self.css, r"\.experience-loader \{ display: flex; animation: loader-failsafe 0s linear 15s forwards; \}")
        # As on the previous site, "Explore my work" plays the journey (a guided scroll, still a
        # plain link to the work without JavaScript) and the other ways past the opening go
        # straight to the work.
        self.assertNotIn("intro-video", self.ids)
        self.assertNotIn("data-ambient", self.html)
        guides = [attrs for tag, attrs in self.nodes if tag == "a" and "data-guide" in attrs]
        self.assertEqual(len(guides), 1)
        self.assertEqual(guides[0]["href"], "#work")
        skips = [attrs for tag, attrs in self.nodes if tag == "a" and "data-skip" in attrs]
        self.assertEqual(len(skips), 2)
        self.assertTrue(all(attrs["href"] == "#work" for attrs in skips))
        opening = re.search(r'<div id="story-opening".*?</div>\s*</div>', self.html, re.S).group(0)
        self.assertIn("I don’t just<br>learn.<br><span>I build.</span>", opening)
        self.assertIn("Data Science student &amp; builder / Hyderabad", opening)
        self.assertIn("Applied AI · Computer vision<br>Full-stack systems", opening)
        self.assertIn('class="button button-primary" href="#work" data-guide>Explore my work', opening)
        self.assertIn('class="text-link hero-direct" href="#work" data-skip>Skip to work', opening)
        # The three cards lead with Attendance ERP and open the same case studies as the work section.
        cards = [attrs for _, attrs in self.nodes if "data-card" in attrs]
        self.assertEqual([attrs["data-card"] for attrs in cards], ["satellite", "attendance", "memory"])
        for attrs in cards:
            self.assertEqual(attrs["href"], f"#case-{attrs['data-card']}")
            self.assertEqual(attrs["data-screen-project"], attrs["data-card"])
        self.assertIn("data-lenis-prevent", self.ids["project-dialog"][1])

    def test_journey_fits_every_phone_screen(self):
        journey = (ROOT / "css/journey.css").read_text()
        # svh/lvh go through two variables with a 100vh fallback, for browsers before Safari 15.4
        # and Chrome 108 (journey.js measures the small height there).
        self.assertIn(":root { --vh-small: 100vh; --vh-large: 100vh; }", journey)
        self.assertIn("@supports (height: 100svh) {\n  :root { --vh-small: 100svh; --vh-large: 100lvh; }\n}", journey)
        self.assertEqual(len(re.findall(r"\d(?:svh|lvh|dvh)\b", journey)), 3)
        # The stage fills the screen with the toolbars tucked away; what must stay in sight sits on
        # the visible lower edge, which moves with the toolbar.
        self.assertRegex(journey, r"\.journey-stage \{[^}]*height: var\(--stage-h, var\(--vh-large\)\);")
        self.assertRegex(journey, r"\.journey-progress \{\s*position: fixed;[^}]*bottom: 0;")
        self.assertRegex(journey, r"\.journey-hint \{\s*position: fixed;")
        # Integer aspect ratios: older browsers ignore a media query with a decimal ratio.
        self.assertNotRegex(journey, r"aspect-ratio:\s*\d+\.\d")
        self.assertNotIn("inset: 0", journey.split("/* ---------- Thoughts")[0])

    def test_fullscreen_is_progressively_enhanced_not_forced(self):
        self.assertIn("fullscreen-toggle", self.ids)
        self.assertIn("hidden", self.ids["fullscreen-toggle"][1])
        self.assertEqual(self.ids["fullscreen-toggle"][1]["aria-pressed"], "false")
        self.assertIn("fullscreen-status", self.ids)

    def test_experience_is_intentionally_sound_free(self):
        self.assertNotIn("sound-toggle", self.ids)
        self.assertNotIn("sound-status", self.ids)
        self.assertFalse((ROOT / "sound.js").exists())
        self.assertFalse(any(tag in ("audio", "video") for tag, _ in self.nodes))

    def test_public_links_are_allowlisted(self):
        allowlist = {
            "./resume.html",
            "./assets/Vadla-Hemanth-Resume.pdf",
            "https://github.com/VadlaHemanth",
            "https://github.com/Vadla-Hemanth",
            "https://github.com/Vadla-Hemanth/Automatic-Attendance-System",
            "https://github.com/VadlaHemanth/vendor-payment-memory-agent",
            "https://github.com/VadlaHemanth/gdrive-photo-uploader",
            "https://github.com/VadlaHemanth/proofa",
            "https://github.com/Vadla-Hemanth/portfolio",
            "https://vadla-hemanth.github.io/portfolio/",
            "https://tuition-platform.pages.dev/",
            "https://ds-question-tracker.pages.dev/",
            "https://engineering-drawing-tracker.pages.dev/",
            "https://umeinteriors.com/",
            "https://www.umeinteriors.com/",
            "https://www.linkedin.com/in/vadlahemanth/",
            "https://www.kaggle.com/hemanthvadla",
            "mailto:vadlahemanth123@gmail.com",
        }
        for tag, attrs in self.nodes:
            href = attrs.get("href", "")
            if tag == "a" and not href.startswith("#"):
                self.assertIn(href, allowlist)
                if attrs.get("target") == "_blank":
                    self.assertTrue({"noopener", "noreferrer"} <= set(attrs["rel"].split()))
        self.assertNotIn('href="./downloads.html"', self.html)
        self.assertTrue((ROOT / "assets/Vadla-Hemanth-Resume.pdf").is_file())

    def test_compact_sections_and_single_education_section(self):
        self.assertEqual(sum(attrs.get("id") == "journey" for _, attrs in self.nodes), 1)
        self.assertEqual(sum("education-history" in attrs.get("class", "").split() for _, attrs in self.nodes), 1)
        self.assertEqual(sum("work-entry" in attrs.get("class", "").split() for _, attrs in self.nodes), 3)
        self.assertIn('class="work-grid"', self.html)
        self.assertIn(">Skills</a>", self.html)
        self.assertNotIn(">Tools</a>", self.html)
        self.assertNotRegex(self.html, r"Résumé-stated|[Ss]elf-reported|[Ss]ource-reported|not independently (?:verified|assessed)")

    def test_progressive_enhancement_and_case_fallbacks(self):
        for project in ["attendance", "satellite", "memory"]:
            self.assertEqual(self.ids[f"case-{project}"][0], "details")
            self.assertNotIn("hidden", self.ids[f"case-{project}"][1])
            self.assertIn(f"pipeline-{project}", self.ids)
        self.assertEqual(sum(tag == "dialog" for tag, _ in self.nodes), 1)
        self.assertIn('role="status"', self.html)
        self.assertIn('class="skip-link"', self.html)
        for tag, attrs in self.nodes:
            if tag == "button":
                self.assertEqual(attrs.get("type"), "button")

    def test_no_inline_handlers_remote_scripts_or_fake_form(self):
        for tag, attrs in self.nodes:
            self.assertFalse(any(key.startswith("on") for key in attrs), attrs)
            if tag == "script":
                self.assertEqual(attrs.get("type"), "module")
                self.assertTrue(attrs["src"].startswith("./"))
        self.assertEqual(sum(tag == "form" for tag, _ in self.nodes), 0)
        self.assertNotIn("innerHTML", (ROOT / "app.js").read_text())
        self.assertNotRegex(self.html, r"fonts\.googleapis|<link[^>]+\.woff2")
        self.assertNotIn("@font-face", self.css)

    def test_css_structure_and_accessibility_guards(self):
        css = re.sub(r"/\*.*?\*/", "", self.css, flags=re.S)
        css = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '""', css)
        stack = []
        pairs = {"}": "{", ")": "(", "]": "["}
        for char in css:
            if char in "{([":
                stack.append(char)
            elif char in "})]":
                self.assertTrue(stack, f"Unexpected {char}")
                self.assertEqual(stack.pop(), pairs[char])
        self.assertEqual(stack, [])
        for required in [
            "[hidden]", ":focus-visible", "prefers-reduced-motion",
            'data-motion="reduced"', "forced-colors", "max-width: 360px",
            "max-width: 640px", "max-width: 860px", "min-width: 1800px",
        ]:
            self.assertIn(required, self.css)
        self.assertNotIn("scroll-snap-type", self.css)
        self.assertNotIn("cursor: none", self.css)

    def test_original_diagrams_are_valid_safe_svg(self):
        for name in ["attendance-system.svg", "satellite-study.svg", "memory-flow.svg"]:
            root = ET.parse(ROOT / "assets" / name).getroot()
            self.assertEqual(root.attrib["viewBox"], "0 0 800 500")
            tags = {node.tag.split("}")[-1] for node in root.iter()}
            self.assertTrue({"title", "desc"} <= tags)
            self.assertFalse({"script", "foreignObject", "image"} & tags)


if __name__ == "__main__":
    unittest.main(verbosity=2)
