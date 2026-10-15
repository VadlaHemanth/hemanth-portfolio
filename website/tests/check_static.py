"""Standard-library structural checks. No browser, server, or network needed."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import re
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SECTION_ORDER = ["work", "more-work", "experience", "education", "about", "skills", "contact"]
MAJOR_PROJECTS = ["attendance", "satellite", "memory"]


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
        cls.sections_css = (ROOT / "css/sections.css").read_text()
        cls.css += "\n" + (ROOT / "css/tokens.css").read_text() + "\n" + cls.sections_css
        cls.region = re.search(r"<!-- SECTIONS:START.*?<!-- SECTIONS:END -->", cls.html, re.S).group(0)
        cls.header = re.search(r'<header class="site-header".*?</header>', cls.html, re.S).group(0)
        cls.region_nodes = Markup(cls.region).nodes

    @staticmethod
    def visible_text(fragment):
        fragment = re.sub(r"<(script|style)\b.*?</\1>", " ", fragment, flags=re.S)
        fragment = re.sub(r"<!--.*?-->", " ", fragment, flags=re.S)
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", fragment))

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

    def test_sections_order_and_stable_anchors(self):
        # The journey's project cards and "Skip intro" link to these ids.
        positions = [self.region.find(f'id="{name}"') for name in SECTION_ORDER]
        self.assertTrue(all(position >= 0 for position in positions), positions)
        self.assertEqual(positions, sorted(positions))
        for name in SECTION_ORDER:
            self.assertEqual(self.ids[name][0], "section", name)
        for project in MAJOR_PROJECTS:
            tag, attrs = self.ids[f"case-{project}"]
            self.assertEqual(tag, "article")
            self.assertEqual(attrs.get("aria-labelledby"), f"{project}-title")
        work = re.search(r'<section id="work".*?</section>', self.region, re.S).group(0)
        self.assertLess(work.find('id="case-attendance"'), work.find('id="case-satellite"'))
        self.assertIn('class="feature"', work, "Attendance ERP is the featured case study")
        self.assertIn(">Skills</a>", self.html)
        self.assertNotIn(">Tools</a>", self.html)

    def test_sections_region_wraps_main_end_and_footer(self):
        self.assertEqual(self.html.count("<!-- SECTIONS:START"), 1)
        self.assertIn("</main>", self.region)
        self.assertIn('<footer class="site-footer">', self.region)
        enrichment = re.search(r"<!-- ENRICHMENT:START.*?<!-- ENRICHMENT:END -->", self.region, re.S)
        self.assertIsNotNone(enrichment, "the generated catalog lives inside the sections region")
        wrapper, (tag, attrs) = self.region_nodes[0], self.region_nodes[1]
        self.assertEqual((wrapper[1].get("class"), tag, attrs.get("class")), ("portfolio", "div", "ambient"))
        self.assertEqual(attrs.get("aria-hidden"), "true")
        self.assertIn("data-ambient", attrs)
        self.assertRegex(self.sections_css, r"\.ambient \{[^}]*position: fixed")

    def test_header_is_compact_with_a_journey_hook(self):
        self.assertIn('class="site-header"', self.header)
        self.assertEqual(re.findall(r'<a href="#([\w-]+)">', self.header), ["work", "experience", "about", "skills", "contact"])
        for required in ['id="menu-toggle"', 'id="primary-navigation"', "data-motion-toggle", 'id="fullscreen-toggle"', 'href="./resume.html"']:
            self.assertIn(required, self.header)
        self.assertRegex(self.sections_css, r"html\.is-journey \.site-header")
        self.assertRegex(self.sections_css, r"--header-h: 4rem")
        self.assertRegex(self.sections_css, r"max-width: 860px\) \{\s*:root \{ --header-h: 3\.5rem; \}")

    def test_single_education_section(self):
        self.assertEqual(sum(attrs.get("id") == "education" for _, attrs in self.nodes), 1)
        self.assertEqual(sum("degree" in attrs.get("class", "").split() for _, attrs in self.nodes), 2)
        outside = self.visible_text(re.sub(r'<section id="education".*?</section>', "", self.region, flags=re.S))
        for detail in ["Data Science and Applications", "B.Tech", "SR Junior College", "St Peters School", "2029"]:
            self.assertNotIn(detail, outside, f"education detail repeated outside #education: {detail}")
        self.assertNotRegex(self.html, r"Résumé-stated|[Ss]elf-reported|[Ss]ource-reported|not independently (?:verified|assessed)")

    def test_section_copy_is_plain_and_labels_private_work(self):
        text = self.visible_text(self.region)
        for phrase in ["passionate", "cutting-edge", "seamless", "leverag", "delve", "synerg", "world-class",
                       "innovative", "game-chang", "revolutioni", "unlock", "empower", "elevate", "film"]:
            self.assertNotIn(phrase, text.lower(), phrase)
        self.assertNotIn("↗", self.region)
        self.assertNotIn(" · ", text, "no middle-dot meta strings")
        self.assertIn("In-progress prototype. The code is private.", text)
        self.assertIn("earlier, simpler attendance prototype, not the current implementation", text)
        self.assertIn("not a confirmed oil spill", text)
        self.assertIn("does not authorise or execute payments", text)
        for tag, attrs in self.region_nodes:
            if tag == "a" and attrs.get("target") == "_blank":
                self.assertIn("link", attrs.get("class", "").split())
        self.assertEqual(self.region.count('target="_blank"'), self.region.count("(opens in a new tab)"))

    def test_skills_match_the_resume(self):
        resume = json.loads((ROOT.parent / "design" / "resume-data.json").read_text())
        on_resume = {item for group in resume["skills"] for item in group["items"]}
        skills = re.search(r'<section id="skills".*?</section>', self.region, re.S).group(0)
        listed = re.findall(r"<li>([^<]+)</li>", skills)
        self.assertTrue(listed)
        self.assertEqual(sorted(set(listed) - on_resume), [], "every listed skill is on the résumé")
        self.assertEqual(sorted(on_resume - set(listed)), [], "the résumé skills all appear")

    def test_progressive_enhancement(self):
        self.assertEqual(sum(tag == "dialog" for tag, _ in self.nodes), 0, "case studies are inline, not modal")
        self.assertIn('role="status"', self.html)
        self.assertIn('class="skip-link"', self.html)
        self.assertRegex(self.region, r'<button class="copy-button" type="button" data-copy-email hidden>')
        self.assertIn('href="mailto:vadlahemanth123@gmail.com"', self.region)
        self.assertIn('href="./assets/Vadla-Hemanth-Resume.pdf" download', self.region)
        self.assertIn('href="./resume.html"', self.region)
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
        sections_js = (ROOT / "js/sections.js").read_text()
        self.assertNotIn("innerHTML", sections_js)
        self.assertNotRegex(sections_js, r"https?://|fetch\(|^import\s")

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
        for name in ["attendance-system.svg", "satellite-study.svg", "memory-flow.svg", "work/satellite.svg", "work/memory.svg"]:
            root = ET.parse(ROOT / "assets" / name).getroot()
            width, height = (float(value) for value in root.attrib["viewBox"].split()[2:])
            self.assertEqual(width / height, 1.6, name)
            tags = {node.tag.split("}")[-1] for node in root.iter()}
            self.assertTrue({"title", "desc"} <= tags)
            self.assertFalse({"script", "foreignObject", "image"} & tags)


if __name__ == "__main__":
    unittest.main(verbosity=2)
