#!/usr/bin/env python3
"""
migrate_to_graph_json.py — Phase 1 of ADR-013.

Reads musicians.json and compositions.json, merges them into the unified
graph.json schema, and writes carnatic/data/graph.json.

The recording_refs array is left empty by this script; it is populated
separately by build_recording_index.py.

Usage:
    python3 carnatic/migrate_to_graph_json.py [--dry-run]

Flags:
    --dry-run   Print the output JSON to stdout instead of writing the file.

Output:
    carnatic/data/graph.json
"""

import json
import sys
from pathlib import Path

ROOT             = Path(__file__).parent
MUSICIANS_FILE   = ROOT / "data" / "musicians.json"
COMPOSITIONS_FILE = ROOT / "data" / "compositions.json"
GRAPH_FILE       = ROOT / "data" / "graph.json"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def migrate(musicians: dict, compositions: dict) -> dict:
    """
    Pure transform: takes the two legacy dicts and returns the graph.json dict.

    The youtube[] arrays on musician nodes are preserved in graph.json during
    the migration period (they are still consumed by render.py for the legacy
    Bani Flow path). They will be removed once all youtube[] entries have been
    migrated to recordings/*.json files per unified_recordings_architecture.md.
    """
    return {
        "schema_version": 1,
        "musicians": {
            "nodes": musicians.get("nodes", []),
            "edges": musicians.get("edges", []),
        },
        "compositions": {
            "ragas":        compositions.get("ragas", []),
            "composers":    compositions.get("composers", []),
            "compositions": compositions.get("compositions", []),
        },
        # recording_refs is populated by build_recording_index.py
        "recording_refs": [],
    }


def summarise(graph: dict) -> None:
    m = graph["musicians"]
    c = graph["compositions"]
    print(f"  musicians.nodes:          {len(m['nodes'])}")
    print(f"  musicians.edges:          {len(m['edges'])}")
    print(f"  compositions.ragas:       {len(c['ragas'])}")
    print(f"  compositions.composers:   {len(c['composers'])}")
    print(f"  compositions.compositions:{len(c['compositions'])}")
    print(f"  recording_refs:           {len(graph['recording_refs'])}  (run build_recording_index.py next)")


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    if not MUSICIANS_FILE.exists():
        print(f"[ERROR] {MUSICIANS_FILE} not found", file=sys.stderr)
        sys.exit(1)
    if not COMPOSITIONS_FILE.exists():
        print(f"[ERROR] {COMPOSITIONS_FILE} not found", file=sys.stderr)
        sys.exit(1)

    musicians    = load_json(MUSICIANS_FILE)
    compositions = load_json(COMPOSITIONS_FILE)
    graph        = migrate(musicians, compositions)

    output = json.dumps(graph, indent=2, ensure_ascii=False)

    if dry_run:
        print(output)
        print("\n[DRY-RUN] Summary:", file=sys.stderr)
        summarise(graph)
    else:
        GRAPH_FILE.write_text(output, encoding="utf-8")
        print(f"[WRITTEN] {GRAPH_FILE}")
        summarise(graph)


if __name__ == "__main__":
    main()
