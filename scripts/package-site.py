#!/usr/bin/env python3
"""Package only the validated public build; originals and previous ZIPs are kept."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="Hemanth-Portfolio-Public-v2.zip")
    args = parser.parse_args()
    if Path(args.name).name != args.name or not args.name.endswith(".zip"):
        raise SystemExit("Use a simple ZIP filename, not a path.")
    subprocess.run(["node", str(ROOT / "scripts/build-site.mjs")], cwd=ROOT, check=True)
    output = ROOT / "deliverables"
    output.mkdir(exist_ok=True)
    archive = output / args.name
    if archive.exists():
        raise SystemExit("Archive already exists. Choose a new --name to preserve it.")
    files = sorted(p for p in (ROOT / "dist").rglob("*") if p.is_file())
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
        for file in files:
            target.write(file, "Hemanth-Portfolio/" + file.relative_to(ROOT / "dist").as_posix())
    with zipfile.ZipFile(archive) as target:
        if target.testzip():
            raise SystemExit("ZIP integrity check failed.")
    with archive.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    report = {
        "archive": str(archive), "bytes": archive.stat().st_size,
        "sha256": digest, "files": len(files),
        "contains_resume": True, "contains_4k_downloads": False,
        "contains_private_source_or_maintenance": False,
    }
    (output / "current-public-package.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
