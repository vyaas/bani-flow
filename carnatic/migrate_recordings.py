#!/usr/bin/env node
"""
migrate_recordings.py — One-shot migration: split recordings.json into
carnatic/data/recordings/{id}.json (one file per recording).

Usage:
    python3 carnatic/migrate_recordings.py [--dry-run]

Each output file is a bare recording object (no {"recordings": [...]} wrapper).
Filename = {id}.json.  The source file is NOT deleted — rename or remove manually
once you have verified the render output is identical.

Prints a summary of every file written (or would write, in --dry-run mode).
"""

import json
import sys
from pathlib import Path

ROOT          = Path(__file__).parent
SOURCE_FILE   = ROOT / "data" / "recordings.json"
DEST_DIR      = ROOT / "data" / "recordings"

DRY_RUN = "--dry-run" in sys.argv


def main() -> None:
    if not SOURCE_FILE.exists():
        print(f"[ERROR] Source file not found: {SOURCE_FILE}")
        sys.exit(1)

    data = json.loads(SOURCE_FILE.read_text(encoding="utf-8"))
    recordings = data.get("recordings", [])

    if not recordings:
        print("[WARN] No recordings found in source file — nothing to migrate.")
        sys.exit(0)

    if not DRY_RUN:
        DEST_DIR.mkdir(parents=True, exist_ok=True)

    written = []
    skipped = []

    for rec in recordings:
        rec_id = rec.get("id")
        if not rec_id:
            print(f"[SKIP] Recording missing 'id' field: {rec.get('title', '(no title)')}")
            skipped.append(rec)
            continue

        dest = DEST_DIR / f"{rec_id}.json"
        payload = json.dumps(rec, indent=2, ensure_ascii=False)

        if DRY_RUN:
            print(f"[DRY-RUN] would write → {dest.relative_to(ROOT.parent)}")
        else:
            dest.write_text(payload + "\n", encoding="utf-8")
            print(f"[WRITTEN] {dest.relative_to(ROOT.parent)}")

        written.append(rec_id)

    print()
    print(f"{'[DRY-RUN] ' if DRY_RUN else ''}Summary: {len(written)} recording(s) "
          f"{'would be written' if DRY_RUN else 'written'}"
          + (f", {len(skipped)} skipped" if skipped else ""))

    if not DRY_RUN:
        print()
        print(f"Source file kept at: {SOURCE_FILE.relative_to(ROOT.parent)}")
        print("Verify with:  python3 carnatic/render.py")
        print("Then archive: mv carnatic/data/recordings.json carnatic/data/recordings.json.bak")


if __name__ == "__main__":
    main()
