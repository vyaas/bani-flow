"""
carnatic/render/html_generator.py — Assembles final graph.html from templates.

render_html() loads template files from carnatic/render/templates/ and injects
Python-generated JS data (elements, compositions, recordings, lookups).
Phase 2 of the render-refactor plan.

Implements ADR-028: theme.js is injected first (defines THEME global);
:root {} CSS vars are generated from theme.py css_vars().
"""
import json
import re
from pathlib import Path
from .graph_builder import INSTRUMENT_SHAPES
from .theme import css_vars


def _render_help_md(md_text: str) -> str:
    """Convert preface.md to #hd-body HTML.

    Supports:
      - # Heading  →  <p class="hd-section-title">…</p>
      - Blank-line-separated stanzas  →  <p class="hd-p">…</p>
        Each line within a stanza becomes a display:block <span>.
      - Lines starting with '"…' containing ' - '  →  <span class="hd-quote">
      - Lines starting with '(My)', '(Your)', 'Art ->'  →  <code class="hd-code">
      - Stanzas starting with 'For this is', 'So I invite', 'Just '  →  hd-p-major
      - <cm>text<cm>  →  <span class="musician-chip">text</span>
      - <cr>text<cr>  →  <span class="raga-chip">text</span>
      - <cc>text<cc>  →  <span class="comp-chip">text</span>
      - **bold** and _italic_ inline markers
    """
    _MAJOR_OPENERS = ('For this is', 'So I invite', 'Just ')

    def _is_quote(line: str) -> bool:
        return line.startswith('"') and ' - ' in line

    def _is_fence(line: str) -> bool:
        return line.startswith('```')

    def _inline(text: str) -> str:
        # Chip tags first (before bold/italic so e.g. **<cr>X<cr>Y** parses cleanly)
        text = re.sub(r'<cm>(.*?)<cm>', r'<span class="musician-chip" data-preface-label="\1">\1</span>', text)
        text = re.sub(r'<cr>(.*?)<cr>', r'<span class="raga-chip" data-preface-raga="\1">\1</span>', text)
        text = re.sub(r'<cc>(.*?)<cc>', r'<span class="comp-chip" data-preface-comp="\1">\1</span>', text)
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        text = re.sub(r'_(.+?)_', r'<em>\1</em>', text)
        return text

    blocks = re.split(r'\n{2,}', md_text.strip())
    parts: list[str] = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        if block.startswith('# '):
            title = _inline(block[2:].strip())
            parts.append(f'<p class="hd-section-title">{title}</p>')
        elif _is_fence(block):
            # Fenced code block: strip opening ```(lang) and closing ``` lines
            raw_lines = block.splitlines()
            lang = raw_lines[0][3:].strip()  # text after the opening ```
            code_lines = [l for l in raw_lines[1:] if not _is_fence(l.strip())]
            escaped = '\n'.join(
                l.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                for l in code_lines
            )
            if lang == 'bani-formula':
                _cls = {
                    '+': 'hd-cf-op', '=': 'hd-cf-op', '\u2192': 'hd-cf-arrow',
                    'Experiences': 'hd-cf-common', 'Music': 'hd-cf-common', 'Feelings': 'hd-cf-common',
                }
                def _fmt(m: re.Match) -> str:
                    t = m.group(0)
                    c = _cls.get(t, 'hd-cf-label')
                    return f'<span class="{c}">{t}</span>'
                _pat = r'\([^)]+\)|[+=]|\u2192|\bExperiences\b|\bMusic\b|\bFeelings\b'
                escaped = re.sub(_pat, _fmt, escaped)
                parts.append(f'<pre class="hd-pre hd-pre-formula"><code>{escaped}</code></pre>')
            else:
                parts.append(f'<pre class="hd-pre"><code>{escaped}</code></pre>')
        elif block.startswith('<'):
            parts.append(block)
        else:
            raw_lines = [l.strip() for l in block.splitlines() if l.strip()]
            is_major = raw_lines and any(raw_lines[0].startswith(op) for op in _MAJOR_OPENERS)
            css_class = 'hd-p hd-p-major' if is_major else 'hd-p'
            line_html = []
            for raw in raw_lines:
                if raw.startswith('> '):
                    processed = _inline(raw[2:])
                    line_html.append(f'<span class="hd-quote">{processed}</span>')
                    continue
                processed = _inline(raw)
                if _is_quote(raw):
                    line_html.append(f'<span class="hd-quote">{processed}</span>')
                else:
                    line_html.append(f'<span>{processed}</span>')
            parts.append(f'<p class="{css_class}">\n' + '\n'.join(line_html) + '\n</p>')
    return '\n    '.join(parts)

TEMPLATES_DIR = Path(__file__).parent / "templates"
DATA_DIR = Path(__file__).parent.parent / "data"


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
    tanpura_data: list | None = None,
    tala_data: list | None = None,
    listenable_set: set | None = None,
    lecdem_indexes: dict | None = None,
    help_empty_panels: dict | None = None,
) -> str:
    node_count = len(graph["nodes"])
    edge_count = len(graph["edges"])

    # ── Python-generated JS data block ────────────────────────────────────────
    # These constants are injected directly into the <script> block so that
    # the template JS files can reference them as globals.
    elements_json            = json.dumps(elements, indent=2, ensure_ascii=False)
    ragas_json               = json.dumps(comp_data.get("ragas", []), indent=2, ensure_ascii=False)
    # ADR-110: composers are now musician nodes; derive list for JS backward-compat (c.name / c.id)
    _composer_nodes = [e["data"] for e in elements if e["data"].get("is_composer") and not e["data"].get("source")]
    composers_list  = [{"id": d["id"], "name": d.get("label", d["id"]), "born": d.get("born"), "died": d.get("died"), "musician_node_id": d["id"]} for d in _composer_nodes]
    composers_json           = json.dumps(composers_list, indent=2, ensure_ascii=False)
    compositions_json        = json.dumps(comp_data.get("compositions", []), indent=2, ensure_ascii=False)
    comp_to_nodes_json       = json.dumps(composition_to_nodes, indent=2, ensure_ascii=False)
    raga_to_nodes_json       = json.dumps(raga_to_nodes, indent=2, ensure_ascii=False)
    recordings_json          = json.dumps(recordings_data.get("recordings", []), indent=2, ensure_ascii=False)
    musician_to_perf_json    = json.dumps(musician_to_performances, indent=2, ensure_ascii=False)
    composition_to_perf_json = json.dumps(composition_to_performances, indent=2, ensure_ascii=False)
    raga_to_perf_json        = json.dumps(raga_to_performances, indent=2, ensure_ascii=False)
    perf_to_perf_json        = json.dumps(perf_to_performances, indent=2, ensure_ascii=False)
    tanpura_json             = json.dumps(tanpura_data or [], indent=2, ensure_ascii=False)
    tala_json                = json.dumps(tala_data or [], indent=2, ensure_ascii=False)
    edges_json               = json.dumps(graph["edges"], indent=2, ensure_ascii=False)

    # ADR-055: listenable musician node IDs (as JS Set)
    listenable_ids_json = json.dumps(sorted(listenable_set) if listenable_set else [], ensure_ascii=False)

    # ADR-086: empty-panel tutorial data (None when data file is absent)
    help_empty_panels_json = json.dumps(help_empty_panels, indent=2, ensure_ascii=False)

    # ADR-078: lecdem subject-anchored indexes
    _lecdem = lecdem_indexes or {}
    lecdems_by_json               = json.dumps(_lecdem.get("lecdems_by", {}),                indent=2, ensure_ascii=False)
    lecdems_about_musician_json   = json.dumps(_lecdem.get("lecdems_about_musician", {}),    indent=2, ensure_ascii=False)
    lecdems_about_raga_json       = json.dumps(_lecdem.get("lecdems_about_raga", {}),        indent=2, ensure_ascii=False)
    lecdems_about_composition_json= json.dumps(_lecdem.get("lecdems_about_composition", {}), indent=2, ensure_ascii=False)

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
        f"\n"
        f"// ── Tanpura drone data (ADR-029) ─────────────────────────────────────────────\n"
        f"const tanpuraData = {tanpura_json};\n"
        f"\n"
        f"// ── Tala inventory ──────────────────────────────────────────────────────────────\n"
        f"window.talaData = {tala_json};\n"
        f"\n"
        f"// ── Lecdem indexes (ADR-078) ─────────────────────────────────────────────────\n"
        f"const lecdemsBy               = {lecdems_by_json};\n"
        f"const lecdemsAboutMusician    = {lecdems_about_musician_json};\n"
        f"const lecdemsAboutRaga        = {lecdems_about_raga_json};\n"
        f"const lecdemsAboutComposition = {lecdems_about_composition_json};\n"
        f"\n"
        f"// ── Empty-panel tutorial copy (ADR-086) ──────────────────────────────────────\n"
        f"const helpEmptyPanels = {help_empty_panels_json};\n"
        f"\n"
        f"// ── graphData: unified object for entry forms (ADR-031) ──────────────────────\n"
        f"const graphData = {{\n"
        f"  nodes:        elements.filter(e => !e.data.source).map(e => ({{\n"
        f"                  id:         e.data.id,\n"
        f"                  label:      e.data.label,\n"
        f"                  sources:    e.data.sources    || [],\n"
        f"                  born:       e.data.born       || null,\n"
        f"                  died:       e.data.died       || null,\n"
        f"                  era:        e.data.era        || '',\n"
        f"                  instrument: e.data.instrument || '',\n"
        f"                  bani:       e.data.bani       || null,\n"
        f"                  youtube:    e.data.tracks     || []\n"
        f"                }})),\n"
        f"  edges:        {edges_json},\n"
        f"  ragas:        ragas,\n"
        f"  composers:    composers,\n"
        f"  compositions: compositions,\n"
        f"  recordings:   recordings,\n"
        f"}};\n"
        f"graphData.musicians = graphData.nodes;  // alias: nodes are musician nodes\n"
    )

    # ── Load templates ────────────────────────────────────────────────────────
    base         = _load("base.html")
    help_html    = _render_help_md((DATA_DIR / "help" / "preface.md").read_text(encoding="utf-8"))
    theme_js     = _load("theme.js")
    graph_view   = _load("graph_view.js")
    media_player = _load("media_player.js")
    sruti_bar    = _load("sruti_bar.js")
    timeline     = _load("timeline_view.js")
    raga_wheel   = _load("raga_wheel.js")
    bani_flow    = _load("bani_flow.js")
    search       = _load("search.js")
    entry_forms  = _load("entry_forms.js")
    roles_js     = _load("roles.js")
    empty_tut    = _load("empty_tutorials.js")
    mobile       = _load("mobile.js")

    # ── Substitute placeholders in base.html ──────────────────────────────────
    base = base.replace("{node_count}", str(node_count))
    base = base.replace("{edge_count}", str(edge_count))

    # ── Inject help dialog content from help.md ───────────────────────────────
    base = base.replace("<!-- INJECT_HELP_HTML -->", help_html)

    # ── Inject :root {} CSS vars from theme.py (single source of truth) ───────
    base = base.replace("/* INJECT_CSS_VARS */", css_vars())

    # ── Assemble <script> block ───────────────────────────────────────────────
    # theme.js MUST be first — it defines the THEME global used by all other scripts.
    # sruti_bar.js MUST come after media_player.js (needs openPlayer/closePlayer).
    # entry_forms.js MUST come after media_player.js (needs wireDrag/nextSpawnPosition/topZ)
    # and after data_js (needs graphData global).
    script_block = "\n".join([
        "<script>",
        theme_js,      # ← FIRST: defines THEME global
        data_js,
        graph_view,
        media_player,
        sruti_bar,     # ← after media_player: needs openPlayer/closePlayer
        timeline,
        raga_wheel,
        bani_flow,
        search,
        roles_js,      # ← before entry_forms: defines window.PERFORMER_ROLES (ADR-071)
        entry_forms,   # ← needs graphData + wireDrag/nextSpawnPosition/topZ
        empty_tut,     # ← ADR-086: empty-panel tutorials; needs helpEmptyPanels + bani_flow + media_player
        mobile,        # ← LAST: exposes peekBottomSheet/dismissBottomSheet globals
        "</script>",
    ])

    # ── Inject script block into base.html ────────────────────────────────────
    html = base.replace("<!-- INJECT_SCRIPTS -->", script_block)
    return html
