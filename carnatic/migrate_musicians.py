#!/usr/bin/env python3
"""
migrate_musicians.py — One-shot migration: split musicians.json into
carnatic/data/musicians/{id}.json (one file per musician node) and
carnatic/data/musicians/_edges.json (all guru-shishya edges).

Usage:
    python3 carnatic/migrate_musicians.py [--dry-run]

Each node output file is a bare musician object (no {"nodes": [...]} wrapper).
Filename = {id}.json.  Edges are written to _edges.json (prefixed with '_' so
the node-glob in load_musicians() skips it automatically).

The source file is NOT deleted — rename or remove manually once you have
verified the render output is identical.

Prints a summary of every file written (or would write, in --dry-run mode).
"""

import json
import sys
from pathlib import Path

ROOT        = Path(__file__).parent
SOURCE_FILE = ROOT / "data" / "musicians.json"
DEST_DIR    = ROOT / "data" / "musicians"

DRY_RUN = "--dry-run" in sys.argv


def main() -> None:
    if not SOURCE_FILE.exists():
        print(f"[ERROR] Source file not found: {SOURCE_FILE}")
        sys.exit(1)

    data  = json.loads(SOURCE_FILE.read_text(encoding="utf-8"))
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])

    if not nodes:
        print("[WARN] No nodes found in source file — nothing to migrate.")
        sys.exit(0)

    if not DRY_RUN:
        DEST_DIR.mkdir(parents=True, exist_ok=True)

    written_nodes  = []
    skipped_nodes  = []

    # ── write one file per musician node ──────────────────────────────────────
    for node in nodes:
        node_id = node.get("id")
        if not node_id:
            label = node.get("label", "(no label)")
            print(f"[SKIP] Node missing 'id' field: {label}")
            skipped_nodes.append(node)
            continue

        dest    = DEST_DIR / f"{node_id}.json"
        payload = json.dumps(node, indent=2, ensure_ascii=False)

        if DRY_RUN:
            print(f"[DRY-RUN] would write → {dest.relative_to(ROOT.parent)}")
        else:
            dest.write_text(payload + "\n", encoding="utf-8")
            print(f"[WRITTEN] {dest.relative_to(ROOT.parent)}")

        written_nodes.append(node_id)

    # ── write _edges.json ─────────────────────────────────────────────────────
    edges_dest    = DEST_DIR / "_edges.json"
    edges_payload = json.dumps(edges, indent=2, ensure_ascii=False)

    if DRY_RUN:
        print(f"[DRY-RUN] would write → {edges_dest.relative_to(ROOT.parent)}")
    else:
        edges_dest.write_text(edges_payload + "\n", encoding="utf-8")
        print(f"[WRITTEN] {edges_dest.relative_to(ROOT.parent)}")

    # ── summary ───────────────────────────────────────────────────────────────
    print()
    prefix = "[DRY-RUN] " if DRY_RUN else ""
    verb   = "would be written" if DRY_RUN else "written"
    print(
        f"{prefix}Summary: {len(written_nodes)} node file(s) {verb}, "
        f"1 _edges.json {verb}"
        + (f", {len(skipped_nodes)} node(s) skipped" if skipped_nodes else "")
    )

    if not DRY_RUN:
        print()
        print(f"Source file kept at: {SOURCE_FILE.relative_to(ROOT.parent)}")
        print("Verify with:  python3 -m carnatic.render._main")
        print("Then archive: mv carnatic/data/musicians.json carnatic/data/musicians.json.bak")


if __name__ == "__main__":
    main()
