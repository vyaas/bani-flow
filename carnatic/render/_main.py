#!/usr/bin/env python3
"""
_main.py — Orchestrator: renders graph.html from Carnatic knowledge graph data.

Entry point for the `bani-render` CLI command (pyproject.toml).
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
DATA_FILE         = ROOT / "data" / "musicians.json"       # legacy monolithic fallback
MUSICIANS_DIR     = ROOT / "data" / "musicians"            # preferred: per-musician files
RAGAS_DIR         = ROOT / "data" / "ragas"                # preferred: per-raga files
COMPOSITIONS_DIR  = ROOT / "data" / "compositions"         # preferred: per-composition files
COMPOSITIONS_FILE = ROOT / "data" / "compositions.json"    # legacy monolithic fallback
RECORDINGS_FILE   = ROOT / "data" / "recordings.json"
OUT_FILE          = ROOT / "graph.html"

# Support both `python3 carnatic/render/_main.py` (direct) and
# `bani-render` (installed entry point via pyproject.toml).
# When run directly, the project root is not on sys.path, so relative
# imports fail.  Inject it here before any package import.
if _PROJECT_ROOT not in [Path(p).resolve() for p in sys.path]:
    sys.path.insert(0, str(_PROJECT_ROOT))

from carnatic.render.sync import sync_graph_json
from carnatic.render.data_loaders import load_musicians, load_compositions, load_recordings, load_tanpura
from carnatic.render.data_transforms import build_recording_lookups, build_composition_lookups, build_listenable_set, build_lecdem_indexes
from carnatic.render.graph_builder import build_elements
from carnatic.render.html_generator import render_html


def main() -> None:
    # Step 0: sync graph.json from source files (ADR-016)
    if GRAPH_FILE.exists() and (MUSICIANS_DIR.is_dir() or DATA_FILE.exists()):
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
        graph           = load_musicians(MUSICIANS_DIR, DATA_FILE)
        comp_data       = load_compositions(COMPOSITIONS_DIR, COMPOSITIONS_FILE, RAGAS_DIR)
        recordings_data = load_recordings(ROOT / "data" / "recordings", RECORDINGS_FILE)
        source_label    = "musicians/" if MUSICIANS_DIR.is_dir() else "musicians.json (legacy)"
        print(f"[LOAD] {source_label}  ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges)")

    # Step 2: build lookup tables
    composition_to_nodes, raga_to_nodes = build_composition_lookups(graph, comp_data, recordings_data)
    musician_to_performances, composition_to_performances, raga_to_performances, perf_to_performances = \
        build_recording_lookups(recordings_data, comp_data)

    # ADR-055: listenable set — set of musician node IDs with playable content
    listenable_set = build_listenable_set(graph, recordings_data, comp_data)

    # ADR-078: lecdem subject-anchored indexes
    lecdem_indexes = build_lecdem_indexes(graph["nodes"])

    # ADR-057: composer_node_map — {musician_node_id: composer_id} for composer chip routing
    composer_node_map: dict[str, str] = {}
    for composer in comp_data.get("composers", []):
        mid = composer.get("musician_node_id")
        if mid:
            composer_node_map[mid] = composer["id"]

    # Step 3: build Cytoscape elements
    elements = build_elements(graph, listenable_set, composer_node_map)

    # Step 3b: load tanpura drone data (ADR-029)
    tanpura_data = load_tanpura(ROOT / "data")
    print(f"[LOAD] tanpura.json  ({len(tanpura_data)} entries)")

    # Step 4: render HTML
    html = render_html(
        elements, graph, comp_data,
        composition_to_nodes, raga_to_nodes,
        recordings_data,
        musician_to_performances,
        composition_to_performances,
        raga_to_performances,
        perf_to_performances,
        tanpura_data=tanpura_data,
        listenable_set=listenable_set,
        lecdem_indexes=lecdem_indexes,
    )
    OUT_FILE.write_text(html, encoding="utf-8")
    print(f"[RENDERED] {OUT_FILE}  ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges)")


if __name__ == "__main__":
    main()
