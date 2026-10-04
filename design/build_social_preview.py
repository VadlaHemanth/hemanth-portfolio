#!/usr/bin/env python3
"""Build the 1200x630 social card from the tracked portrait-about.webp.

Dependencies: Pillow and ReportLab (for its bundled Bitstream Vera fonts).
Run: python3 -B design/build_social_preview.py [--check]
No private originals, network calls, generated faces, or system fonts are used.
Only website/assets/social-preview.jpg is written. --check writes nothing.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import sys

import PIL
from PIL import Image, ImageCms, ImageDraw, ImageFont
import reportlab


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "website/assets/portraits/portrait-about.webp"
OUTPUT = ROOT / "website/assets/social-preview.jpg"
SOURCE_SHA256 = "b23190c40b963a9dcee800b0cd0e3d924b741b370fd3419f2a5c465a7bade98f"
SIZE = (1200, 630)
BACKGROUND = (8, 11, 16)
WHITE = (244, 247, 250)
MUTED = (174, 187, 203)
AZURE = (22, 139, 255)
FONT_DIR = Path(reportlab.__file__).resolve().parent / "fonts"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def smoothstep(lo: float, hi: float, value: float) -> float:
    t = min(1.0, max(0.0, (value - lo) / (hi - lo)))
    return t * t * (3.0 - 2.0 * t)


def linear(channel: int) -> float:
    value = channel / 255.0
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def srgb(value: float) -> int:
    value = 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055
    return round(min(1.0, max(0.0, value)) * 255)


def lift_forehead(source: Image.Image) -> tuple[Image.Image, dict]:
    """Compact feathered exposure mask; no smoothing, cloning or reconstruction."""
    image = source.copy()
    pixels = image.load()
    changed = 0
    maximum_delta = 0
    maximum_ev = 0.0
    # Source-pixel coordinates, calibrated only for the hash-locked 700x875 image.
    cx, cy, rx, ry = 331.0, 194.0, 55.0, 36.0
    for y in range(158, 231):
        for x in range(276, 387):
            distance = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if distance >= 1.0:
                continue
            old = pixels[x, y]
            channels = [linear(c) for c in old]
            luminance = sum(c * w for c, w in zip(channels, (0.2126, 0.7152, 0.0722)))
            feather = (0.5 + 0.5 * math.cos(math.pi * math.sqrt(distance))) ** 2
            protect = smoothstep(0.018, 0.055, luminance)
            protect *= 1.0 - smoothstep(0.22, 0.50, luminance)
            ev = 0.34 * feather * protect
            new = tuple(srgb(c * 2.0 ** ev) for c in channels)
            pixels[x, y] = new
            maximum_ev = max(maximum_ev, ev)
            if old != new:
                changed += 1
                maximum_delta = max(maximum_delta, max(b - a for a, b in zip(old, new)))
    return image, {
        "method": "Linear-light exposure; compact cosine-squared ellipse; luminance protection",
        "mask_center_source_px": [cx, cy],
        "mask_radii_source_px": [rx, ry],
        "exposure_cap_ev": 0.34,
        "actual_max_ev": round(maximum_ev, 6),
        "changed_source_pixels": changed,
        "max_source_channel_delta_8bit": maximum_delta,
        "outside_mask": "Unchanged before resizing/compositing/JPEG encoding",
    }


def build() -> tuple[bytes, dict]:
    source_bytes = SOURCE.read_bytes()
    if sha256(source_bytes) != SOURCE_SHA256:
        raise ValueError("Portrait changed: inspect it and recalibrate the local mask before rebuilding.")
    with Image.open(io.BytesIO(source_bytes)) as opened:
        if opened.size != (700, 875) or opened.mode != "RGB":
            raise ValueError("Expected the tracked 700x875 RGB portrait.")
        portrait, correction = lift_forehead(opened)

    scale = 2
    canvas = Image.new("RGB", (SIZE[0] * scale, SIZE[1] * scale), BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    bounds = {}

    def text(label: str, value: str, x: int, y: int, size: int, color=WHITE, bold=False):
        filename = "VeraBd.ttf" if bold else "Vera.ttf"
        font = ImageFont.truetype(str(FONT_DIR / filename), size * scale)
        box = draw.textbbox((x * scale, y * scale), value, font=font, anchor="lt")
        if box[0] < 64 * scale or box[2] > 654 * scale or box[3] > 566 * scale:
            raise ValueError(f"Text exceeds its safe area: {label} {box}")
        draw.text((x * scale, y * scale), value, font=font, anchor="lt", fill=color)
        bounds[label] = [round(v / scale, 2) for v in box]

    # Solid, uncut H with a true superscript 2. No diagonal styling.
    hx, hy, hw, hh, stem = 64, 65, 44, 48, 10
    for box in (
        (hx, hy, hx + stem, hy + hh),
        (hx + hw - stem, hy, hx + hw, hy + hh),
        (hx, hy + 19, hx + hw, hy + 29),
    ):
        draw.rectangle(tuple(v * scale for v in box), fill=WHITE)
    text("superscript", "2", 115, 59, 25, AZURE, bold=True)
    draw.rectangle((64 * scale, 201 * scale, 108 * scale, 204 * scale), fill=AZURE)
    text("name", "Vadla Hemanth", 64, 244, 62, bold=True)
    text("focus", "Software & Applied AI", 66, 332, 29)
    text("student", "Computer Science & Data Science student", 66, 388, 22, MUTED)
    text("location", "Hyderabad, India", 66, 426, 22, MUTED)
    text("url", "portfolio.hemanthvadla.tech", 66, 542, 20, MUTED)
    canvas = canvas.resize(SIZE, Image.Resampling.LANCZOS)

    # The complete portrait is reduced, not enlarged or face-cropped.
    portrait = portrait.resize((452, 565), Image.Resampling.LANCZOS)
    mask = Image.new("L", portrait.size, 255)
    mp = mask.load()
    for y in range(portrait.height):
        for x in range(portrait.width):
            edge = smoothstep(0, 58, x) * smoothstep(0, 24, portrait.width - 1 - x)
            edge *= smoothstep(0, 10, y) * smoothstep(0, 52, portrait.height - 1 - y)
            mp[x, y] = round(255 * edge)
    canvas.paste(portrait, (684, 48), mask)
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    # ICC creation date is runtime-dependent; normalize its fixed header for reproducibility.
    icc = icc[:24] + bytes.fromhex("07e800010001000000000000") + icc[36:]
    output = io.BytesIO()
    canvas.save(output, "JPEG", quality=92, subsampling=0, optimize=True,
                progressive=True, icc_profile=icc)
    result = output.getvalue()
    with Image.open(io.BytesIO(result)) as verified:
        verified.load()
        if verified.size != SIZE or verified.mode != "RGB" or len(result) > 250_000:
            raise ValueError("Social card dimensions, color mode, or byte budget failed.")
    metrics = {
        "source": str(SOURCE.relative_to(ROOT)),
        "source_sha256": SOURCE_SHA256,
        "output": str(OUTPUT.relative_to(ROOT)),
        "output_sha256": sha256(result),
        "dimensions": list(SIZE),
        "bytes": len(result),
        "color": "RGB JPEG with normalized sRGB ICC profile",
        "pillow_version": PIL.__version__,
        "reportlab_version": reportlab.Version,
        "font_sha256": {name: sha256((FONT_DIR / name).read_bytes()) for name in ("Vera.ttf", "VeraBd.ttf")},
        "correction": correction,
        "portrait_box": [684, 48, 1136, 613],
        "text_bounds": bounds,
        "disclosure": "Existing portrait pixels only; no newly generated face, skin smoothing, or recovered hidden detail. Resizing and JPEG are lossy.",
    }
    return result, metrics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the committed JPEG without writing.")
    args = parser.parse_args()
    result, metrics = build()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_bytes() != result:
            print("Social preview is missing or stale; rebuild with the documented dependencies.", file=sys.stderr)
            return 1
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(result)
    metrics["mode"] = "check" if args.check else "build"
    print(json.dumps(metrics, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
