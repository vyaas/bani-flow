#!/usr/bin/env python3
"""
remove_youtube_entry.py — surgically remove a youtube[] entry from a musician node.

Usage:
    python3 carnatic/remove_youtube_entry.py --musician-id <id> --video-id <11-char-id> [--dry-run]

Reads from carnatic/data/musicians/ (directory mode) or carnatic/data/musicians.json
(legacy monolithic mode), removes the matching entry from the node's youtube[] array,
writes back atomically, and prints a change-log line.

Exit 0 = removed (or dry-run preview shown).
Exit 1 = not found or error.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import os
from pathlib import Path

# ── storage paths ──────────────────────────────────────────────────────────────

_DATA_DIR      = Path(__file__).parent / "data"
MUSICIANS_DIR  = _DATA_DIR / "musicians"          # preferred: split-file mode
MUSICIANS_JSON = _DATA_DIR / "musicians.json"     # legacy fallback


def _dir_mode() -> bool:
    return MUSICIANS_DIR.is_dir()


def extract_video_id(url: str) -> str | None:
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def _atomic_write(path: Path, data: dict | list) -> None:
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--musician-id", required=True, help="Musician node id")
    parser.add_argument("--video-id",    required=True, help="11-character YouTube video ID to remove")
    parser.add_argument("--dry-run",     action="store_true", help="Print what would change without writing")
    args = parser.parse_args()

    # ── load the node ──────────────────────────────────────────────────────────
    legacy_data: dict = {}
    if _dir_mode():
        node_file = MUSICIANS_DIR / f"{args.musician_id}.json"
        if not node_file.exists():
            print(f"ERROR  musician '{args.musician_id}' not found in musicians/", file=sys.stderr)
            return 1
        node = json.loads(node_file.read_text(encoding="utf-8"))
    else:
        legacy_data = json.loads(MUSICIANS_JSON.read_text(encoding="utf-8"))
        node = next((n for n in legacy_data.get("nodes", []) if n["id"] == args.musician_id), None)
        if node is None:
            print(f"ERROR  musician '{args.musician_id}' not found in musicians.json", file=sys.stderr)
            return 1

    # ── find and remove the entry ──────────────────────────────────────────────
    youtube = node.get("youtube", [])
    before_count = len(youtube)

    kept = []
    removed = []
    for entry in youtube:
        vid = extract_video_id(entry.get("url", ""))
        if vid == args.video_id:
            removed.append(entry)
        else:
            kept.append(entry)

    if not removed:
        print(f"NOT FOUND  video_id '{args.video_id}' in youtube[] of '{args.musician_id}'")
        return 1

    if args.dry_run:
        print(f"[DRY-RUN] Would remove {len(removed)} entry from {args.musician_id}.youtube[]:")
        for e in removed:
            print(f"  url:   {e.get('url')}")
            print(f"  label: {e.get('label')}")
        print(f"  youtube[] count: {before_count} → {len(kept)}")
        return 0

    node["youtube"] = kept

    # ── write back atomically ──────────────────────────────────────────────────
    if _dir_mode():
        _atomic_write(MUSICIANS_DIR / f"{args.musician_id}.json", node)
    else:
        legacy_data["nodes"] = [
            node if n["id"] == args.musician_id else n
            for n in legacy_data.get("nodes", [])
        ]
        _atomic_write(MUSICIANS_JSON, legacy_data)

    for e in removed:
        print(f"[YOUTUBE-] {args.musician_id}  removed  {args.video_id}  \"{e.get('label', '')}\"")
    print(f"  youtube[] count: {before_count} → {len(kept)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
