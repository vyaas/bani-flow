"""
carnatic/render/html_generator.py — Assembles final graph.html from templates.

render_html() loads template files from carnatic/render/templates/ and injects
Python-generated JS data (elements, compositions, recordings, lookups).
Phase 2 of the render-refactor plan.

Implements ADR-028: theme.js is injected first (defines THEME global);
:root {} CSS vars are generated from theme.py css_vars().
"""
import json
from pathlib import Path
from .graph_builder import INSTRUMENT_SHAPES
from .theme import css_vars

TEMPLATES_DIR = Path(__file__).parent / "templates"


def _load(name: str) -> str:
    return (TEMPLATES_DIR / name).read_text(encoding="utf-8")


def render_html(
    elements: list[dict],
    graph: dict,
    comp_data: dict,
    composition_to_nodes: dict,
    raga_to_nodes: dict,
    recordings_data: dict,
    musician_to_performances: dict,
    composition_to_performances: dict,
    raga_to_performances: dict,
    perf_to_performances: dict,
) -> str:
    node_count = len(graph["nodes"])
    edge_count = len(graph["edges"])

    # ── Python-generated JS data block ────────────────────────────────────────
    # These constants are injected directly into the <script> block so that
    # the template JS files can reference them as globals.
    elements_json            = json.dumps(elements, indent=2, ensure_ascii=False)
    ragas_json               = json.dumps(comp_data.get("ragas", []), indent=2, ensure_ascii=False)
    composers_json           = json.dumps(comp_data.get("composers", []), indent=2, ensure_ascii=False)
    compositions_json        = json.dumps(comp_data.get("compositions", []), indent=2, ensure_ascii=False)
    comp_to_nodes_json       = json.dumps(composition_to_nodes, indent=2, ensure_ascii=False)
    raga_to_nodes_json       = json.dumps(raga_to_nodes, indent=2, ensure_ascii=False)
    recordings_json          = json.dumps(recordings_data.get("recordings", []), indent=2, ensure_ascii=False)
    musician_to_perf_json    = json.dumps(musician_to_performances, indent=2, ensure_ascii=False)
    composition_to_perf_json = json.dumps(composition_to_performances, indent=2, ensure_ascii=False)
    raga_to_perf_json        = json.dumps(raga_to_performances, indent=2, ensure_ascii=False)
    perf_to_perf_json        = json.dumps(perf_to_performances, indent=2, ensure_ascii=False)

    data_js = (
        f"const elements = {elements_json};\n"
        f"\n"
        f"// ── Compositions data (injected by render.py) ──────────────────────────────\n"
        f"const ragas        = {ragas_json};\n"
        f"const composers    = {composers_json};\n"
        f"const compositions = {compositions_json};\n"
        f"const compositionToNodes = {comp_to_nodes_json};\n"
        f"const ragaToNodes        = {raga_to_nodes_json};\n"
        f"\n"
        f"// ── Recordings data (injected by render.py) ─────────────────────────────────\n"
        f"const recordings             = {recordings_json};\n"
        f"const musicianToPerformances = {musician_to_perf_json};\n"
        f"const compositionToPerf      = {composition_to_perf_json};\n"
        f"const ragaToPerf             = {raga_to_perf_json};\n"
        f"// perfToPerf: {{\"recording_id::performance_index\": [PerformanceRef]}}\n"
        f"// Enables single-performance filtering from the raga wheel.\n"
        f"const perfToPerf             = {perf_to_perf_json};\n"
    )

    # ── Load templates ────────────────────────────────────────────────────────
    base         = _load("base.html")
    theme_js     = _load("theme.js")
    graph_view   = _load("graph_view.js")
    media_player = _load("media_player.js")
    timeline     = _load("timeline_view.js")
    raga_wheel   = _load("raga_wheel.js")
    bani_flow    = _load("bani_flow.js")
    search       = _load("search.js")

    # ── Substitute placeholders in base.html ──────────────────────────────────
    base = base.replace("{node_count}", str(node_count))
    base = base.replace("{edge_count}", str(edge_count))

    # ── Inject :root {} CSS vars from theme.py (single source of truth) ───────
    base = base.replace("/* INJECT_CSS_VARS */", css_vars())

    # ── Assemble <script> block ───────────────────────────────────────────────
    # theme.js MUST be first — it defines the THEME global used by all other scripts.
    script_block = "\n".join([
        "<script>",
        theme_js,      # ← FIRST: defines THEME global
        data_js,
        graph_view,
        media_player,
        timeline,
        raga_wheel,
        bani_flow,
        search,
        "</script>",
    ])

    # ── Inject script block into base.html ────────────────────────────────────
    html = base.replace("<!-- INJECT_SCRIPTS -->", script_block)
    return html
