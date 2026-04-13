#!/usr/bin/env python3
"""
_main.py — Orchestrator: renders graph.html from Carnatic knowledge graph data.

Entry point for the `gstree-render` CLI command (pyproject.toml).
Can also be run directly: python3 carnatic/render/_main.py

Delegates to carnatic/render/ package modules:
  sync          → sync graph.json from source files
  data_loaders  → load JSON data
  data_transforms → build lookup tables
  graph_builder → build Cytoscape elements
  html_generator → assemble final HTML
"""
import sys
from pathlib import Path

# carnatic/render/_main.py → carnatic/render/ → carnatic/ → project root
_RENDER_DIR  = Path(__file__).resolve().parent
_CARNATIC_DIR = _RENDER_DIR.parent
_PROJECT_ROOT = _CARNATIC_DIR.parent

ROOT              = _CARNATIC_DIR
GRAPH_FILE        = ROOT / "data" / "graph.json"
DATA_FILE         = ROOT / "data" / "musicians.json"
COMPOSITIONS_FILE = ROOT / "data" / "compositions.json"
RECORDINGS_FILE   = ROOT / "data" / "recordings.json"
OUT_FILE          = ROOT / "graph.html"

# Support both `python3 carnatic/render/_main.py` (direct) and
# `gstree-render` (installed entry point via pyproject.toml).
# When run directly, the project root is not on sys.path, so relative
# imports fail.  Inject it here before any package import.
if _PROJECT_ROOT not in [Path(p).resolve() for p in sys.path]:
    sys.path.insert(0, str(_PROJECT_ROOT))

from carnatic.render.sync import sync_graph_json
from carnatic.render.data_loaders import load_compositions, load_recordings
from carnatic.render.data_transforms import build_recording_lookups, build_composition_lookups
from carnatic.render.graph_builder import build_elements
from carnatic.render.html_generator import render_html


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
