#!/usr/bin/env python3
"""
build_recording_index.py — Phase 1 of ADR-013.

Scans carnatic/data/recordings/*.json, extracts the index fields from each
recording file, and writes the recording_refs array into graph.json.

This script is the ONLY writer of graph.json["recording_refs"].
Manual edits to that array are forbidden — run this script instead.

Usage:
    python3 carnatic/build_recording_index.py [--dry-run]

Flags:
    --dry-run   Print the updated recording_refs to stdout; do not write.

Prerequisite:
    carnatic/data/graph.json must already exist (run migrate_to_graph_json.py first).

Output:
    Updates carnatic/data/graph.json in-place (recording_refs array only).
"""

import json
import sys
from pathlib import Path

ROOT           = Path(__file__).parent
RECORDINGS_DIR = ROOT / "data" / "recordings"
GRAPH_FILE     = ROOT / "data" / "graph.json"


def extract_ref(recording: dict, rel_path: str) -> dict:
    """
    Extract the index fields from a single recording object.

    primary_musician_ids: all musician_ids that appear in any session's
    performers list (null entries are skipped).
    """
    primary_ids: list[str] = []
    seen: set[str] = set()
    for session in recording.get("sessions", []):
        for performer in session.get("performers", []):
            mid = performer.get("musician_id")
            if mid and mid not in seen:
                primary_ids.append(mid)
                seen.add(mid)

    return {
        "id":                   recording["id"],
        "path":                 rel_path,
        "title":                recording.get("title", ""),
        "short_title":          recording.get("short_title", ""),
        "date":                 recording.get("date", ""),
        "venue":                recording.get("venue", ""),
        "primary_musician_ids": primary_ids,
    }


def build_refs(recordings_dir: Path) -> list[dict]:
    """
    Scan recordings_dir for *.json files (skipping _-prefixed files),
    load each, and return a sorted list of recording_ref dicts.
    """
    files = sorted(
        f for f in recordings_dir.glob("*.json")
        if not f.name.startswith("_")
    )
    refs = []
    for f in files:
        try:
            recording = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"[WARN] Skipping {f.name}: JSON parse error — {exc}", file=sys.stderr)
            continue
        # rel_path is relative to carnatic/data/ so it matches the ADR schema
        rel_path = f"recordings/{f.name}"
        refs.append(extract_ref(recording, rel_path))
    return refs


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    if not GRAPH_FILE.exists():
        print(
            f"[ERROR] {GRAPH_FILE} not found.\n"
            "Run migrate_to_graph_json.py first.",
            file=sys.stderr,
        )
        sys.exit(1)

    if not RECORDINGS_DIR.is_dir():
        print(f"[ERROR] {RECORDINGS_DIR} is not a directory", file=sys.stderr)
        sys.exit(1)

    refs = build_refs(RECORDINGS_DIR)

    if dry_run:
        print(json.dumps(refs, indent=2, ensure_ascii=False))
        print(f"\n[DRY-RUN] Would write {len(refs)} recording_refs to {GRAPH_FILE}", file=sys.stderr)
        return

    graph = json.loads(GRAPH_FILE.read_text(encoding="utf-8"))
    old_count = len(graph.get("recording_refs", []))
    graph["recording_refs"] = refs
    GRAPH_FILE.write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"[UPDATED] {GRAPH_FILE}")
    print(f"  recording_refs: {old_count} → {len(refs)}")
    for ref in refs:
        print(f"  + {ref['id']}  ({ref['date']})  [{', '.join(ref['primary_musician_ids'])}]")


if __name__ == "__main__":
    main()
