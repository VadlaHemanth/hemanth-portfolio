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
        cls.css = (ROOT / "styles.css").read_text() + "\n" + (ROOT / "scroll-story.css").read_text()
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
                if "portraits" not in attrs["src"]:
                    self.assertEqual(attrs.get("loading"), "lazy")
        image = next(attrs for tag, attrs in self.nodes if tag == "img" and "hero-wide" in attrs["src"])
        source = next(attrs for tag, attrs in self.nodes if tag == "source" and "hero-phone" in attrs["srcset"])
        self.assertEqual((image["width"], image["height"]), ("1600", "900"))
        self.assertEqual((source["width"], source["height"]), ("900", "1600"))

    def test_motion_is_scroll_background_with_skippable_real_loader(self):
        self.assertEqual(self.ids["top"][1]["class"], "scroll-story")
        self.assertEqual(self.ids["experience-loader"][1]["role"], "dialog")
        self.assertIn("hidden", self.ids["experience-loader"][1])
        self.assertIn("skip-loading", self.ids)
        self.assertIn("load-progress", self.ids)
        self.assertNotIn("cinematic-intro", self.ids)
        _, video = self.ids["intro-video"]
        self.assertEqual(video.get("preload"), "none")
        for required in ["muted", "playsinline"]:
            self.assertIn(required, video)
        for forbidden in ["autoplay", "loop", "src"]:
            self.assertNotIn(forbidden, video)
        self.assertNotIn("hidden", self.ids["site-content"][1])
        self.assertEqual(self.ids["intro-progress"][0], "progress")
        self.assertEqual(self.ids["intro-progress"][1].get("class"), "sr-only")
        self.assertNotIn("scroll-hint", self.ids)
        self.assertNotIn('class="story-bottom', self.html)
        self.assertIn("Scroll down to move forward", self.html)
        self.assertIn("Scroll up to go back", self.html)
        self.assertEqual(
            [attrs["data-chapter"] for _, attrs in self.nodes if "data-chapter" in attrs],
            ["mind", "build", "work", "return"],
        )

    def test_fullscreen_is_progressively_enhanced_not_forced(self):
        self.assertIn("fullscreen-toggle", self.ids)
        self.assertIn("hidden", self.ids["fullscreen-toggle"][1])
        self.assertEqual(self.ids["fullscreen-toggle"][1]["aria-pressed"], "false")
        self.assertIn("fullscreen-status", self.ids)

    def test_experience_is_intentionally_sound_free(self):
        self.assertNotIn("sound-toggle", self.ids)
        self.assertNotIn("sound-status", self.ids)
        self.assertFalse((ROOT / "sound.js").exists())
        self.assertFalse(any(tag == "audio" for tag, _ in self.nodes))
        self.assertIn("muted", self.ids["intro-video"][1])
        self.assertIn("No sound needed.", self.html)

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
