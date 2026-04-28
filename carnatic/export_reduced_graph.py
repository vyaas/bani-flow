#!/usr/bin/env python3
"""
export_reduced_graph.py — Write a reduced-graph JSON document for collaborators.

Reads every musicians/{id}.json and musicians/_edges.json under
carnatic/data/, projects them onto the reduced schema (see reduced_graph.py),
and writes a single hand-editable JSON file. No recordings, no youtube,
no compositions — artist metadata + guru-shishya edges only.

Usage:
    bani-export-reduced                             # → carnatic/reports/reduced_graph.json
    bani-export-reduced --out /tmp/reduced.json
    bani-export-reduced --instructions-file FILE    # override embedded rules
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from carnatic.reduced_graph import DEFAULT_INSTRUCTIONS, build_reduced  # noqa: E402


REPO_ROOT       = Path(__file__).resolve().parent.parent
MUSICIANS_DIR   = REPO_ROOT / "carnatic" / "data" / "musicians"
EDGES_FILE      = MUSICIANS_DIR / "_edges.json"
DEFAULT_OUTPUT  = REPO_ROOT / "carnatic" / "reports" / "reduced_graph.json"


def load_nodes(musicians_dir: Path) -> list[dict]:
    """Load every {id}.json in the musicians directory (skipping _-prefixed files)."""
    nodes: list[dict] = []
    for path in sorted(musicians_dir.glob("*.json")):
        if path.name.startswith("_"):
            continue
        with path.open("r", encoding="utf-8") as fh:
            node = json.load(fh)
        if node.get("id") != path.stem:
            print(
                f"warning: {path.name}: id field {node.get('id')!r} != filename stem",
                file=sys.stderr,
            )
        nodes.append(node)
    return nodes


def load_edges(edges_file: Path) -> list[dict]:
    with edges_file.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export the reduced-graph collaboration JSON.",
    )
    parser.add_argument(
        "--out", type=Path, default=DEFAULT_OUTPUT,
        help=f"Output path (default: {DEFAULT_OUTPUT.relative_to(REPO_ROOT)})",
    )
    parser.add_argument(
        "--musicians-dir", type=Path, default=MUSICIANS_DIR,
        help="Override musicians directory (default: carnatic/data/musicians)",
    )
    parser.add_argument(
        "--instructions-file", type=Path, default=None,
        help="Read editing instructions from a file (overrides the default text).",
    )
    args = parser.parse_args()

    musicians_dir: Path = args.musicians_dir
    edges_file = musicians_dir / "_edges.json"

    if not musicians_dir.is_dir():
        print(f"error: musicians dir not found: {musicians_dir}", file=sys.stderr)
        return 1
    if not edges_file.exists():
        print(f"error: edges file not found: {edges_file}", file=sys.stderr)
        return 1

    instructions = DEFAULT_INSTRUCTIONS
    if args.instructions_file:
        instructions = args.instructions_file.read_text(encoding="utf-8").strip()

    nodes = load_nodes(musicians_dir)
    edges = load_edges(edges_file)

    doc = build_reduced(
        nodes,
        edges,
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        instructions=instructions,
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print(
        f"wrote {args.out}  "
        f"({len(doc['musicians'])} musicians, {len(doc['edges'])} edges)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
