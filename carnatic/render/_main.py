#!/usr/bin/env python3
"""
_main.py — Orchestrator: renders graph.html from Carnatic knowledge graph data.

Entry point for the `gstree-render` CLI command (pyproject.toml).
Delegates to carnatic/render/ package modules:
  sync          → sync graph.json from source files
  data_loaders  → load JSON data
  data_transforms → build lookup tables
  graph_builder → build Cytoscape elements
  html_generator → assemble final HTML
"""
import sys
from pathlib import Path

ROOT              = Path(__file__).parent.parent  # carnatic/render/_main.py → carnatic/render/ → carnatic/
GRAPH_FILE        = ROOT / "data" / "graph.json"
DATA_FILE         = ROOT / "data" / "musicians.json"
COMPOSITIONS_FILE = ROOT / "data" / "compositions.json"
RECORDINGS_FILE   = ROOT / "data" / "recordings.json"
OUT_FILE          = ROOT / "graph.html"

from .sync import sync_graph_json
from .data_loaders import load_compositions, load_recordings
from .data_transforms import build_recording_lookups, build_composition_lookups
from .graph_builder import build_elements
from .html_generator import render_html


def main() -> None:
    # Step 0: sync graph.json from source files (ADR-016)
    if GRAPH_FILE.exists() and DATA_FILE.exists():
        sync_graph_json(GRAPH_FILE, DATA_FILE, COMPOSITIONS_FILE)

    # Step 1: load data (ADR-013: graph.json preferred, legacy fallback)
    if GRAPH_FILE.exists():
        from carnatic.graph_api import CarnaticGraph
        cg = CarnaticGraph(GRAPH_FILE)
        graph = {
            "nodes": cg.get_all_musicians(),
            "edges": cg.get_all_edges(),
        }
        comp_data = {
            "ragas":        cg.get_all_ragas(),
            "composers":    cg.get_all_composers(),
            "compositions": cg.get_all_compositions(),
        }
        recordings_data = {"recordings": cg.get_all_recordings()}
        print(f"[LOAD] graph.json  ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges, "
              f"{len(recordings_data['recordings'])} recordings)")
    else:
        import json
        graph           = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        comp_data       = load_compositions(COMPOSITIONS_FILE)
        recordings_data = load_recordings(ROOT / "data" / "recordings", RECORDINGS_FILE)
        print(f"[LOAD] musicians.json (legacy)  ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges)")

    # Step 2: build lookup tables
    composition_to_nodes, raga_to_nodes = build_composition_lookups(graph, comp_data, recordings_data)
    musician_to_performances, composition_to_performances, raga_to_performances, perf_to_performances = \
        build_recording_lookups(recordings_data, comp_data)

    # Step 3: build Cytoscape elements
    elements = build_elements(graph)

    # Step 4: render HTML
    html = render_html(
        elements, graph, comp_data,
        composition_to_nodes, raga_to_nodes,
        recordings_data,
        musician_to_performances,
        composition_to_performances,
        raga_to_performances,
        perf_to_performances,
    )
    OUT_FILE.write_text(html, encoding="utf-8")
    print(f"[RENDERED] {OUT_FILE}  ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges)")


if __name__ == "__main__":
    main()
