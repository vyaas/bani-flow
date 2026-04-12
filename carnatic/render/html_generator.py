"""
carnatic/render/html_generator.py — Assembles final graph.html from templates.

render_html() loads template files from carnatic/render/templates/ and injects
Python-generated JS data (elements, compositions, recordings, lookups).
Phase 2 of the render-refactor plan.
"""
import json
from pathlib import Path
from .graph_builder import ERA_COLORS, INSTRUMENT_SHAPES

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
    )

    # ── Load templates ────────────────────────────────────────────────────────
    base         = _load("base.html")
    graph_view   = _load("graph_view.js")
    media_player = _load("media_player.js")
    timeline     = _load("timeline_view.js")
    raga_wheel   = _load("raga_wheel.js")
    bani_flow    = _load("bani_flow.js")
    search       = _load("search.js")

    # ── Substitute placeholders in base.html ──────────────────────────────────
    base = base.replace("{node_count}", str(node_count))
    base = base.replace("{edge_count}", str(edge_count))

    # ── Assemble <script> block ───────────────────────────────────────────────
    script_block = "\n".join([
        "<script>",
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
