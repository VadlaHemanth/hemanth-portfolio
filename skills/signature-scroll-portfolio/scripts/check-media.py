#!/usr/bin/env python3
"""Read-only delivery checks. Requires ffprobe; optional full decode uses ffmpeg."""
import argparse
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import sys


def mp4_atoms(path):
    """Inspect top-level atom boundaries without loading the movie into memory."""
    rows = []
    size = path.stat().st_size
    with path.open("rb") as source:
        position = 0
        while position < size:
            if len(rows) >= 10000:
                raise ValueError("Too many top-level MP4 atoms for bounded inspection")
            source.seek(position)
            header = source.read(8)
            if len(header) != 8:
                raise ValueError("Truncated MP4 atom header")
            length, kind = struct.unpack(">I4s", header)
            header_size = 8
            if length == 1:
                extension = source.read(8)
                if len(extension) != 8:
                    raise ValueError("Truncated extended MP4 atom")
                length = struct.unpack(">Q", extension)[0]
                header_size = 16
            elif length == 0:
                length = size - position
            if length < header_size or position + length > size:
                raise ValueError("MP4 atom exceeds file bounds")
            rows.append({"type": kind.decode("ascii", errors="replace"), "offset": position, "size": length})
            position += length
    return rows


def checks_for(metadata, size, expected, atoms=None):
    video = next((stream for stream in metadata.get("streams", []) if stream.get("codec_type") == "video"), None)
    checks = [{"name": "video-stream", "passed": video is not None}]
    if not video:
        return checks
    for key in ("width", "height", "codec_name"):
        want = expected.get(key)
        if want is not None:
            checks.append({"name": key, "actual": video.get(key), "expected": want, "passed": video.get(key) == want})
    if expected.get("fps") is not None:
        try:
            actual = float(Fraction(video.get("avg_frame_rate", "0/1")))
        except (ValueError, ZeroDivisionError):
            actual = None
        checks.append({"name": "fps", "actual": actual, "expected": expected["fps"],
                       "passed": actual is not None and abs(actual - expected["fps"]) < .001})
    if expected.get("frames") is not None:
        actual = video.get("nb_read_frames", video.get("nb_frames"))
        actual = int(actual) if str(actual).isdigit() else None
        checks.append({"name": "decoded-frames", "actual": actual, "expected": expected["frames"],
                       "passed": actual == expected["frames"]})
    if expected.get("max_mib") is not None:
        limit = int(expected["max_mib"] * 1024 * 1024)
        checks.append({"name": "asset-byte-limit", "actual": size, "limit": limit, "passed": size <= limit})
    if atoms is not None:
        moov = next((row["offset"] for row in atoms if row["type"] == "moov"), None)
        mdat = next((row["offset"] for row in atoms if row["type"] == "mdat"), None)
        checks.append({"name": "mp4-fast-start", "passed": moov is not None and mdat is not None and moov < mdat})
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument("--fps", type=float)
    parser.add_argument("--frames", type=int)
    parser.add_argument("--codec", dest="codec_name")
    parser.add_argument("--max-mib", type=float, help="Host-specific per-file limit; omitted means no assumed limit")
    parser.add_argument("--full-decode", action="store_true")
    args = parser.parse_args()
    target = args.file.expanduser().resolve(strict=True)
    if not target.is_file():
        raise ValueError("Expected one local media file")
    for name in ("width", "height", "fps", "frames", "max_mib"):
        value = getattr(args, name)
        if value is not None and (not math.isfinite(value) or value <= 0):
            raise ValueError(f"--{name.replace('_', '-')} must be finite and positive")
    if not shutil.which("ffprobe"):
        raise RuntimeError("ffprobe is required; install it through your normal approved tool setup")
    command = ["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(target)]
    probe = subprocess.run(command, capture_output=True, text=True, check=True, timeout=600)
    metadata = json.loads(probe.stdout)
    digest = hashlib.sha256()
    with target.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    atoms = mp4_atoms(target) if target.suffix.lower() in (".mp4", ".m4v", ".mov") else None
    checks = checks_for(metadata, target.stat().st_size, vars(args), atoms)
    if probe.stderr.strip():
        checks.append({"name": "ffprobe-decode-errors", "passed": False, "detail": probe.stderr.strip()[:1500]})
    if args.full_decode:
        if not shutil.which("ffmpeg"):
            raise RuntimeError("--full-decode requires ffmpeg")
        decoded = subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-nostdin", "-i", str(target),
                                  "-map", "0:v:0", "-f", "null", "-"], capture_output=True, text=True, timeout=600)
        checks.append({"name": "full-decode", "passed": decoded.returncode == 0, "detail": decoded.stderr.strip()[:1500]})
    result = {"file": str(target), "sizeBytes": target.stat().st_size, "sha256": digest.hexdigest(),
              "passed": all(row["passed"] for row in checks), "checks": checks,
              "streams": metadata.get("streams", []), "atoms": atoms,
              "scope": "Metadata/byte/decode checks only. Not a visual, identity, licensing, native-detail or all-device certificate."}
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(json.dumps({"passed": False, "error": str(error)}), file=sys.stderr)
        sys.exit(2)
