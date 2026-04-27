"""Musician summary CSV report for guru-shishya handoff.

Reads carnatic/data/graph.json and exports one row per musician with:
  name, instrument, sources, guru_of, shishya_of

Multi-value cells (guru_of, shishya_of) use semicolons as separators.
YouTube data is deliberately excluded.

Usage::

    python3 -m carnatic.reports.musician_summary               # stdout
    python3 -m carnatic.reports.musician_summary --output out.csv

    bani-export-musicians                                       # stdout
    bani-export-musicians --output musicians_handoff.csv
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

from carnatic.reports.csv_export import ColumnSpec, graph_to_rows, rows_to_csv

_GRAPH_PATH = Path(__file__).parent.parent / "data" / "graph.json"

MULTI_VALUE_SEP = ";"


def _load_graph() -> dict:
    with _GRAPH_PATH.open(encoding="utf-8") as f:
        return json.load(f)["musicians"]


def _build_edge_lookups(graph: dict) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Return (guru_of, shishya_of) label-list dicts keyed by node id.

    Edge direction: source=guru → target=shishya.
      guru_of[guru_id]     = [shishya_label, ...]
      shishya_of[shishya_id] = [guru_label, ...]
    """
    id_to_label = {node["id"]: node["label"] for node in graph.get("nodes", [])}

    guru_of: dict[str, list[str]] = defaultdict(list)
    shishya_of: dict[str, list[str]] = defaultdict(list)

    for edge in graph.get("edges", []):
        guru_id = edge.get("source", "")
        shishya_id = edge.get("target", "")
        if guru_id and shishya_id:
            guru_of[guru_id].append(id_to_label.get(shishya_id, shishya_id))
            shishya_of[shishya_id].append(id_to_label.get(guru_id, guru_id))

    return dict(guru_of), dict(shishya_of)


def _sources_str(node: dict) -> str:
    """Return semicolon-joined Wikipedia (or any) source URLs for a node."""
    sources = node.get("sources") or []
    urls = [s["url"] for s in sources if s.get("url")]
    return MULTI_VALUE_SEP.join(urls)


def build_columns(guru_of: dict, shishya_of: dict) -> list[ColumnSpec]:
    return [
        ColumnSpec("name", lambda node, _graph: node.get("label", "")),
        ColumnSpec("instrument", lambda node, _graph: node.get("instrument", "") or ""),
        ColumnSpec("sources", lambda node, _graph: _sources_str(node)),
        ColumnSpec(
            "guru_of",
            lambda node, _graph, _g=guru_of: MULTI_VALUE_SEP.join(_g.get(node["id"], [])),
        ),
        ColumnSpec(
            "shishya_of",
            lambda node, _graph, _s=shishya_of: MULTI_VALUE_SEP.join(_s.get(node["id"], [])),
        ),
    ]


def generate_csv() -> str:
    """Return the full musician summary CSV as a string. No I/O side effects."""
    graph = _load_graph()
    guru_of, shishya_of = _build_edge_lookups(graph)
    columns = build_columns(guru_of, shishya_of)
    rows = graph_to_rows(graph, columns)
    return rows_to_csv(rows, [c.name for c in columns])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export all musicians to CSV for guru-shishya research handoff."
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        default=None,
        help="Write CSV to FILE instead of stdout.",
    )
    args = parser.parse_args()

    csv_text = generate_csv()

    if args.output:
        Path(args.output).write_text(csv_text, encoding="utf-8")
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(csv_text)


if __name__ == "__main__":
    main()
