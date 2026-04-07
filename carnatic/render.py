#!/usr/bin/env python3
"""
render.py — Renders musicians.json as a self-contained Cytoscape.js HTML graph.
Nodes clickable (sources). Edges directed guru→shishya.
Color-coded by era. Shape-coded by instrument.
Floating YouTube player: click a node's track list → embedded video, graph stays live.
Bani Flow panel: filter by composition or raga, chronological listening trail.
"""

import json
from pathlib import Path
from collections import defaultdict

ROOT              = Path(__file__).parent
DATA_FILE         = ROOT / "data" / "musicians.json"
COMPOSITIONS_FILE = ROOT / "data" / "compositions.json"
OUT_FILE          = ROOT / "graph.html"

# ── visual mappings ────────────────────────────────────────────────────────────

ERA_COLORS = {
    "trinity":        "#d79921",
    "bridge":         "#d65d0e",
    "golden_age":     "#458588",
    "disseminator":   "#689d6a",
    "living_pillars": "#b16286",
    "contemporary":   "#98971a",
}

ERA_LABELS = {
    "trinity":        "The Trinity",
    "bridge":         "The Bridge",
    "golden_age":     "Golden Age",
    "disseminator":   "Disseminators",
    "living_pillars": "Living Pillars",
    "contemporary":   "Contemporary",
}

INSTRUMENT_SHAPES = {
    "vocal":     "ellipse",
    "veena":     "diamond",
    "violin":    "rectangle",
    "flute":     "triangle",
    "mridangam": "hexagon",
}

NODE_SIZES = {
    "trinity":        80,
    "bridge":         65,
    "golden_age":     58,
    "disseminator":   52,
    "living_pillars": 48,
    "contemporary":   44,
}

# Font sizes mirror cartographic label hierarchy (graph-space px).
# Cytoscape's min-zoomed-font-size handles hiding when zoomed out too far.
# Range kept modest so labels never overwhelm nodes.
ERA_FONT_SIZES = {
    "trinity":        20,
    "bridge":         17,
    "golden_age":     15,
    "disseminator":   13,
    "living_pillars": 12,
    "contemporary":   11,
}

# ── helpers ────────────────────────────────────────────────────────────────────

def yt_video_id(url: str) -> str | None:
    import re
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None

# ── load compositions data ─────────────────────────────────────────────────────

def load_compositions() -> dict:
    """Load compositions.json; return empty structure if absent."""
    if COMPOSITIONS_FILE.exists():
        return json.loads(COMPOSITIONS_FILE.read_text(encoding="utf-8"))
    return {"ragas": [], "composers": [], "compositions": []}

def build_composition_lookups(graph: dict, comp_data: dict) -> tuple[dict, dict]:
    """
    Build two lookup dicts from the musicians graph:
      composition_to_nodes: {composition_id: [node_id, ...]}
      raga_to_nodes:        {raga_id:        [node_id, ...]}
    A node appears in raga_to_nodes if any youtube entry has raga_id set directly,
    or has a composition_id whose composition references that raga_id.
    """
    comp_raga: dict[str, str] = {
        c["id"]: c["raga_id"] for c in comp_data.get("compositions", [])
    }
    composition_to_nodes: dict[str, list[str]] = defaultdict(list)
    raga_to_nodes: dict[str, list[str]] = defaultdict(list)
    for node in graph["nodes"]:
        node_id = node["id"]
        for yt in node.get("youtube", []):
            cid = yt.get("composition_id")
            rid = yt.get("raga_id")
            if cid:
                if node_id not in composition_to_nodes[cid]:
                    composition_to_nodes[cid].append(node_id)
                inferred_raga = comp_raga.get(cid)
                if inferred_raga and node_id not in raga_to_nodes[inferred_raga]:
                    raga_to_nodes[inferred_raga].append(node_id)
            if rid:
                if node_id not in raga_to_nodes[rid]:
                    raga_to_nodes[rid].append(node_id)
    return dict(composition_to_nodes), dict(raga_to_nodes)

# ── build cytoscape elements ───────────────────────────────────────────────────

def build_elements(graph: dict) -> list[dict]:
    degree: dict[str, int] = defaultdict(int)
    for e in graph["edges"]:
        degree[e["source"]] += 1
        degree[e["target"]] += 1
    max_degree = max(degree.values(), default=1)

    elements = []

    for node in graph["nodes"]:
        era      = node.get("era", "contemporary")
        instr    = node.get("instrument", "vocal")
        color    = ERA_COLORS.get(era, "#a89984")
        shape    = INSTRUMENT_SHAPES.get(instr, "ellipse")
        base     = NODE_SIZES.get(era, 44)
        deg      = degree.get(node["id"], 0)
        size     = base + int((deg / max_degree) * 28)
        born      = node.get("born", "?")
        died      = node.get("died")
        lifespan  = f"{born}–{died}" if died else (f"b. {born}" if born != "?" else "")

        if era in ("trinity", "bridge"):
            label_tier = 0
        elif era in ("golden_age", "disseminator"):
            label_tier = 1
        else:
            label_tier = 2

        # Word-cloud font sizing: era base + degree bonus (up to +5px)
        base_font   = ERA_FONT_SIZES.get(era, 11)
        font_size   = base_font + int((deg / max_degree) * 5)
        font_weight = "bold" if era in ("trinity", "bridge") else "normal"

        tracks = []
        for t in node.get("youtube", []):
            vid = yt_video_id(t.get("url", ""))
            if vid:
                tracks.append({
                    "vid":            vid,
                    "label":          t.get("label", vid),
                    "composition_id": t.get("composition_id"),
                    "raga_id":        t.get("raga_id"),
                    "year":           t.get("year"),
                })

        # Sources: new schema (sources array) with legacy fallback
        raw_sources = node.get("sources", [])
        if not raw_sources and node.get("wikipedia"):
            raw_sources = [{"url": node["wikipedia"], "label": "Wikipedia", "type": "wikipedia"}]
        primary_url = raw_sources[0]["url"] if raw_sources else ""

        elements.append({"data": {
            "id":         node["id"],
            "label":      node["label"],
            "url":        primary_url,
            "sources":    raw_sources,
            "era":        era,
            "era_label":  ERA_LABELS.get(era, era),
            "instrument": instr,
            "bani":       node.get("bani", ""),
            "lifespan":   lifespan,
            "born":       node.get("born"),
            "color":      color,
            "shape":      shape,
            "size":       size,
            "degree":     deg,
            "label_tier":  label_tier,
            "font_size":   font_size,
            "font_weight": font_weight,
            "tracks":      tracks,
        }})

    for edge in graph["edges"]:
        conf  = edge.get("confidence", 0.8)
        width = max(1.0, conf * 3.5)
        elements.append({"data": {
            "id":         f"{edge['source']}→{edge['target']}",
            "source":     edge["source"],
            "target":     edge["target"],
            "confidence": conf,
            "source_url": edge.get("source_url", ""),
            "note":       edge.get("note", ""),
            "width":      width,
        }})

    return elements

# ── HTML template ──────────────────────────────────────────────────────────────

def render_html(elements: list[dict], graph: dict, comp_data: dict,
                composition_to_nodes: dict, raga_to_nodes: dict) -> str:
    elements_json      = json.dumps(elements, indent=2, ensure_ascii=False)
    ragas_json         = json.dumps(comp_data.get("ragas", []), indent=2, ensure_ascii=False)
    composers_json     = json.dumps(comp_data.get("composers", []), indent=2, ensure_ascii=False)
    compositions_json  = json.dumps(comp_data.get("compositions", []), indent=2, ensure_ascii=False)
    comp_to_nodes_json = json.dumps(composition_to_nodes, indent=2, ensure_ascii=False)
    raga_to_nodes_json = json.dumps(raga_to_nodes, indent=2, ensure_ascii=False)
    node_count         = len(graph["nodes"])
    edge_count         = len(graph["edges"])

    legend_items = "".join(
        f'<div class="legend-item">'
        f'<span class="dot" style="background:{ERA_COLORS[era]}"></span>{label}'
        f'</div>'
        for era, label in ERA_LABELS.items()
    )
    instrument_items = "".join(
        f'<div class="legend-item">'
        f'<span class="shape-icon {shape}"></span>{instr}'
        f'</div>'
        for instr, shape in INSTRUMENT_SHAPES.items()
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Carnatic Guru-Shishya Parampara</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js"></script>
<style>
  :root {{
    --bg:     #282828; --bg1: #3c3836; --bg2: #504945; --bg3: #665c54;
    --fg:     #ebdbb2; --fg2: #d5c4a1; --fg3: #bdae93;
    --yellow: #d79921; --orange: #d65d0e; --blue: #458588;
    --aqua:   #689d6a; --purple: #b16286; --green: #98971a;
    --red:    #cc241d; --gray:   #a89984;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    background: var(--bg); color: var(--fg);
    font-family: 'Courier New', monospace;
    height: 100vh; display: flex; flex-direction: column;
  }}

  /* ── header ── */
  header {{
    padding: 10px 18px; background: var(--bg1);
    border-bottom: 1px solid var(--bg3);
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  }}
  header h1 {{
    font-size: 1rem; color: var(--yellow);
    letter-spacing: 0.08em; text-transform: uppercase; font-weight: bold;
  }}
  .stats  {{ font-size: 0.75rem; color: var(--gray); }}
  .controls {{ display: flex; gap: 8px; margin-left: auto; }}
  button {{
    background: var(--bg2); color: var(--fg2); border: 1px solid var(--bg3);
    padding: 4px 10px; font-family: inherit; font-size: 0.75rem;
    cursor: pointer; border-radius: 2px;
  }}
  button:hover {{ background: var(--bg3); color: var(--fg); background: var(--bg3); }}

  /* ── main layout ── */
  #main {{ display: flex; flex: 1; overflow: hidden; position: relative; }}
  #cy   {{ flex: 1; background: var(--bg); }}

  /* ── sidebar ── */
  #sidebar {{
    width: 240px; background: var(--bg1);
    border-left: 1px solid var(--bg2);
    display: flex; flex-direction: column;
    overflow-y: auto; font-size: 0.78rem;
  }}
  .panel {{ padding: 12px 14px; border-bottom: 1px solid var(--bg2); }}
  .panel h3 {{
    font-size: 0.7rem; color: var(--gray);
    text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;
  }}
  #node-info {{ min-height: 140px; }}
  #node-name {{ font-size: 0.95rem; color: var(--yellow); font-weight: bold; margin-bottom: 4px; }}
  #node-meta {{ color: var(--fg3); line-height: 1.7; }}
  #node-sources {{ margin-top: 8px; display: none; }}
  .node-src-link {{
    display: block; color: var(--blue);
    text-decoration: none; font-size: 0.75rem; margin-bottom: 3px;
  }}
  .node-src-link:hover {{ text-decoration: underline; }}

  /* sidebar track list */
  #track-panel {{ display: none; }}
  #track-list  {{ list-style: none; margin-top: 2px; }}
  #track-list li {{
    padding: 5px 0; border-bottom: 1px solid var(--bg2);
    cursor: pointer; color: var(--fg2); font-size: 0.75rem;
    display: flex; align-items: flex-start; gap: 6px; line-height: 1.4;
  }}
  #track-list li:last-child {{ border-bottom: none; }}
  #track-list li:hover  {{ color: var(--yellow); }}
  #track-list li.playing {{ color: var(--aqua); }}
  .play-icon {{ flex-shrink: 0; color: var(--green); margin-top: 1px; }}
  li.playing .play-icon {{ color: var(--aqua); }}

  /* edge info */
  #edge-info    {{ display: none; }}
  #edge-guru    {{ color: var(--yellow); font-weight: bold; }}
  #edge-arrow   {{ color: var(--gray); font-size: 0.8rem; margin: 2px 0; }}
  #edge-shishya {{ color: var(--aqua);  font-weight: bold; }}
  #edge-note    {{ margin-top: 6px; color: var(--orange); font-style: italic; font-size: 0.8rem; }}
  #edge-conf    {{ margin-top: 4px; color: var(--fg3); font-size: 0.75rem; }}
  #edge-src     {{
    display: none; margin-top: 6px; color: var(--blue);
    font-size: 0.75rem; text-decoration: none;
  }}
  #edge-src:hover {{ text-decoration: underline; }}

  /* legends */
  .legend-item  {{ display: flex; align-items: center; gap: 7px; margin-bottom: 5px; color: var(--fg2); }}
  .dot          {{ width: 11px; height: 11px; border-radius: 50%; display: inline-block; flex-shrink: 0; }}
  .shape-icon   {{ width: 11px; height: 11px; display: inline-block; flex-shrink: 0; background: var(--gray); }}
  .shape-icon.ellipse   {{ border-radius: 50%; }}
  .shape-icon.diamond   {{ transform: rotate(45deg); border-radius: 1px; }}
  .shape-icon.rectangle {{ border-radius: 1px; }}
  .shape-icon.triangle  {{
    width: 0; height: 0; background: none;
    border-left: 6px solid transparent; border-right: 6px solid transparent;
    border-bottom: 11px solid var(--gray);
  }}
  .shape-icon.hexagon {{ clip-path: polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%); }}

  #hint {{
    padding: 8px 14px; color: var(--bg3); font-size: 0.68rem;
    line-height: 1.6; margin-top: auto; border-top: 1px solid var(--bg2);
  }}

  /* ── hover popover ── */
  #hover-popover {{
    position: fixed; display: none; pointer-events: none;
    background: var(--bg1); border: 1px solid var(--yellow); border-radius: 3px;
    padding: 7px 12px; z-index: 900; max-width: 220px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }}
  #hp-name {{ font-size: 1rem; font-weight: bold; color: var(--yellow); line-height: 1.3; }}
  #hp-sub  {{ font-size: 0.75rem; color: var(--fg3); margin-top: 3px; line-height: 1.5; }}

  /* ── floating media player ── */
  #media-player {{
    position: absolute;
    top: 18px; left: 18px;
    width: 340px;
    background: var(--bg1);
    border: 1px solid var(--bg3);
    border-radius: 4px;
    box-shadow: 0 6px 28px rgba(0,0,0,0.65);
    z-index: 800;
    display: none;
    flex-direction: column;
    user-select: none;
  }}
  #media-player.visible {{ display: flex; }}

  /* title bar / drag handle */
  #mp-bar {{
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px;
    background: var(--bg2); border-radius: 4px 4px 0 0;
    cursor: grab; border-bottom: 1px solid var(--bg3);
  }}
  #mp-bar:active {{ cursor: grabbing; }}
  #mp-title {{
    flex: 1; font-size: 0.78rem; font-weight: bold; color: var(--yellow);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }}
  #mp-close {{
    background: none; border: none; color: var(--gray);
    font-size: 1.1rem; cursor: pointer; padding: 0 2px; line-height: 1;
    flex-shrink: 0;
  }}
  #mp-close:hover {{ color: var(--red); }}

  /* 16:9 iframe wrapper */
  #mp-video-wrap {{
    position: relative; width: 100%; padding-top: 56.25%; background: #000;
  }}
  #mp-iframe {{
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%; border: none;
  }}

  /* player track list */
  #mp-tracks {{ max-height: 150px; overflow-y: auto; padding: 4px 0; }}
  .mp-track {{
    padding: 5px 12px; cursor: pointer; font-size: 0.74rem;
    color: var(--fg3); display: flex; align-items: flex-start;
    gap: 6px; line-height: 1.4;
  }}
  .mp-track:hover  {{ background: var(--bg2); color: var(--fg); }}
  .mp-track.active {{ background: var(--bg2); color: var(--aqua); }}
  .mp-track .ti    {{ flex-shrink: 0; color: var(--green); }}
  .mp-track.active .ti {{ color: var(--aqua); }}

  /* resize grip at bottom */
  #mp-resize {{
    height: 7px; cursor: ns-resize;
    background: var(--bg2); border-top: 1px solid var(--bg3);
    border-radius: 0 0 4px 4px; opacity: 0.6;
  }}
  #mp-resize:hover {{ opacity: 1; background: var(--bg3); }}

  /* ── timeline ruler ── */
  #timeline-ruler .tick-line {{
    stroke: #504945; stroke-width: 1px;
  }}
  #timeline-ruler .tick-line.century {{
    stroke: #665c54; stroke-width: 1.5px;
  }}
  #timeline-ruler .tick-label {{
    fill: #a89984; font-family: 'Courier New', monospace;
    font-size: 11px; text-anchor: middle; dominant-baseline: hanging;
  }}
  #timeline-ruler .tick-label.century {{
    fill: #d5c4a1; font-size: 13px; font-weight: bold;
  }}
  #timeline-ruler .era-band {{
    fill: none; stroke: none;
  }}
  #timeline-ruler .era-label {{
    fill: #665c54; font-family: 'Courier New', monospace;
    font-size: 10px; dominant-baseline: middle;
  }}
  #btn-layout.active {{
    background: var(--bg3); color: var(--yellow);
    border-color: var(--yellow);
  }}

  /* ── Bani Flow panel ── */
  :root {{ --teal: #83a598; }}
  #bani-flow-panel select {{
    width: 100%; background: var(--bg2); color: var(--fg2);
    border: 1px solid var(--bg3); font-family: inherit; font-size: 0.74rem;
    padding: 4px 6px; border-radius: 2px; margin-bottom: 6px; cursor: pointer;
  }}
  #bani-flow-panel select:focus {{ outline: none; border-color: var(--teal); }}
  #bani-clear {{
    width: 100%; margin-top: 2px; background: var(--bg2);
    color: var(--gray); border-color: var(--bg3); font-size: 0.72rem; display: none;
  }}
  #bani-clear:hover {{ color: var(--red); border-color: var(--red); }}
  #listening-trail {{ display: none; margin-top: 8px; }}
  #trail-composer-label {{
    font-size: 0.72rem; color: var(--teal); font-style: italic;
    margin-bottom: 6px; padding-bottom: 5px;
    border-bottom: 1px solid var(--bg2); line-height: 1.5;
  }}
  #trail-list {{ list-style: none; }}
  #trail-list li {{
    padding: 5px 0; border-bottom: 1px solid var(--bg2);
    font-size: 0.74rem; color: var(--fg2);
    display: flex; align-items: flex-start; gap: 5px; line-height: 1.4; flex-wrap: wrap;
  }}
  #trail-list li:last-child {{ border-bottom: none; }}
  .trail-year {{ flex-shrink: 0; color: var(--gray); font-size: 0.68rem; min-width: 30px; margin-top: 2px; }}
  .trail-artist {{ color: var(--yellow); cursor: pointer; font-weight: bold; flex-shrink: 0; }}
  .trail-artist:hover {{ text-decoration: underline; }}
  .trail-play {{ flex-shrink: 0; color: var(--green); cursor: pointer; margin-top: 1px; }}
  .trail-play:hover {{ color: var(--aqua); }}
  .trail-label {{ color: var(--fg3); font-size: 0.72rem; width: 100%; padding-left: 35px; }}
</style>
</head>
<body>

<header>
  <h1>Carnatic · Guru-Shishya Parampara</h1>
  <span class="stats">{node_count} musicians · {edge_count} lineage edges</span>
  <div class="controls">
    <button onclick="cy.fit()">Fit</button>
    <button onclick="cy.reset()">Reset</button>
    <button onclick="relayout()">Relayout</button>
    <button onclick="toggleLabels()">Labels</button>
    <button id="btn-layout" onclick="toggleLayout()">Timeline</button>
  </div>
</header>

<div id="main">
  <div id="cy"></div>
  <svg id="timeline-ruler" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:50;"></svg>

  <!-- ── floating media player ── -->
  <div id="media-player">
    <div id="mp-bar">
      <span id="mp-title">—</span>
      <button id="mp-close" title="Close">✕</button>
    </div>
    <div id="mp-video-wrap">
      <iframe id="mp-iframe" src=""
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
        allowfullscreen></iframe>
    </div>
    <div id="mp-tracks"></div>
    <div id="mp-resize" title="Drag to resize"></div>
  </div>

  <!-- ── hover popover ── -->
  <div id="hover-popover">
    <div id="hp-name"></div>
    <div id="hp-sub"></div>
  </div>

  <div id="sidebar">
    <div class="panel" id="node-info">
      <h3>Selected</h3>
      <div id="node-name">—</div>
      <div id="node-meta"></div>
      <div id="node-sources"></div>
    </div>

    <div class="panel" id="track-panel">
      <h3>Recordings &#9654;</h3>
      <ul id="track-list"></ul>
    </div>

    <div class="panel" id="edge-info">
      <h3>Selected Edge</h3>
      <div id="edge-guru"></div>
      <div id="edge-arrow">&#8595; guru &middot; shishya</div>
      <div id="edge-shishya"></div>
      <div id="edge-note"></div>
      <div id="edge-conf"></div>
      <a id="edge-src" href="#" target="_blank">source &#8599;</a>
    </div>

    <!-- ── Bani Flow panel ── -->
    <div class="panel" id="bani-flow-panel">
      <h3>Bani Flow &#9835;</h3>
      <select id="bani-comp-select">
        <option value="">&#8212; Filter by Composition &#8212;</option>
      </select>
      <select id="bani-raga-select">
        <option value="">&#8212; Filter by Raga &#8212;</option>
      </select>
      <button id="bani-clear" onclick="clearBaniFilter()">&#10005; Clear filter</button>
      <div id="listening-trail">
        <div id="trail-composer-label"></div>
        <ul id="trail-list"></ul>
      </div>
    </div>

    <div class="panel">
      <h3>Era</h3>
      {legend_items}
    </div>
    <div class="panel">
      <h3>Instrument</h3>
      {instrument_items}
    </div>
    <div id="hint">
      Click node to inspect.<br>
      &#9654; track &#8594; plays inline, graph stays live.<br>
      Drag player anywhere on canvas.<br>
      Click edge to see relationship.<br>
      Double-click node &#8599; opens primary source.<br>
      Green border = has recordings.<br>
      Teal border = matches Bani Flow filter.<br>
      Scroll to zoom &middot; drag to pan.
    </div>
  </div>
</div>

<script>
const elements = {elements_json};

// ── Compositions data (injected by render.py) ─────────────────────────────────
const ragas        = {ragas_json};
const composers    = {composers_json};
const compositions = {compositions_json};
const compositionToNodes = {comp_to_nodes_json};
const ragaToNodes        = {raga_to_nodes_json};

// ── Cytoscape init ────────────────────────────────────────────────────────────
const cy = cytoscape({{
  container: document.getElementById('cy'),
  elements:  elements,
  style: [
    {{
      selector: 'node',
      style: {{
        'background-color':   'data(color)',
        'shape':              'data(shape)',
        'width':              'data(size)',
        'height':             'data(size)',
        'label':              'data(label)',
        'font-family':            'Courier New, monospace',
        'font-size':              'data(font_size)',
        'font-weight':            'data(font_weight)',
        'color':                  '#ebdbb2',
        'text-valign':            'bottom',
        'text-halign':            'center',
        'text-margin-y':          '8px',
        'text-wrap':              'wrap',
        'text-max-width':         '100px',
        'text-outline-color':     '#1d2021',
        'text-outline-width':     '2px',
        'min-zoomed-font-size':   8,
        'text-background-color':  '#1d2021',
        'text-background-opacity': 0.65,
        'text-background-padding': '3px',
        'text-background-shape':  'roundrectangle',
        'border-width':       '2px',
        'border-color':       '#665c54',
      }}
    }},
    {{
      selector: 'node.has-tracks',
      style: {{ 'border-color': '#689d6a', 'border-width': '2.5px' }}
    }},
    {{
      selector: 'node.hovered',
      style: {{ 'border-color': '#d79921', 'border-width': '3px' }}
    }},
    {{
      selector: 'node:selected',
      style: {{
        'border-color': '#ebdbb2', 'border-width': '3px',
        'label': 'data(label)',
      }}
    }},
    {{
      selector: 'node.bani-match',
      style: {{ 'border-color': '#83a598', 'border-width': '3.5px' }}
    }},
    {{
      selector: 'edge',
      style: {{
        'curve-style':         'bezier',
        'target-arrow-shape':  'triangle',
        'target-arrow-color':  '#665c54',
        'line-color':          '#504945',
        'width':               'data(width)',
        'arrow-scale':         0.8,
        'opacity':             0.75,
      }}
    }},
    {{
      selector: 'edge.highlighted',
      style: {{
        'line-color':         '#d79921',
        'target-arrow-color': '#d79921',
        'opacity':            1.0,
      }}
    }},
    {{ selector: '.faded', style: {{ 'opacity': 0.12 }} }},
  ],
  layout: {{
    name: 'cose', animate: true, animationDuration: 800,
    randomize: true, componentSpacing: 80,
    nodeRepulsion: () => 8000, nodeOverlap: 20,
    idealEdgeLength: () => 120, edgeElasticity: () => 100,
    gravity: 0.25, numIter: 1000,
    initialTemp: 200, coolingFactor: 0.95, minTemp: 1.0,
  }},
}});

cy.ready(() => {{
  cy.nodes().forEach(n => {{
    if (n.data('tracks').length > 0) n.addClass('has-tracks');
  }});
  applyZoomLabels();
}});

// ── zoom-tiered labels (word-cloud / cartographic style) ──────────────────────
// Font sizes are graph-space values — Cytoscape's viewport zoom scales them
// naturally. min-zoomed-font-size (set in style) hides labels that become
// too small on screen. We only control tier-based visibility here.
let labelsOverride = false;
function applyZoomLabels() {{
  if (labelsOverride) return;
  const z = cy.zoom();
  cy.nodes().forEach(n => {{
    if (n.selected()) return;
    const tier = n.data('label_tier');
    // Tier-0 (Trinity/Bridge): always visible
    // Tier-1 (Golden Age/Disseminator): show from z≥0.35
    // Tier-2 (Living Pillars/Contemporary): show from z≥0.60
    const show = tier === 0 ||
                 (tier === 1 && z >= 0.35) ||
                 (tier === 2 && z >= 0.60);
    n.style('label', show ? n.data('label') : '');
  }});
}}
cy.on('zoom', applyZoomLabels);

// ── hover popover ─────────────────────────────────────────────────────────────
const popover = document.getElementById('hover-popover');
cy.on('mouseover', 'node', evt => {{
  const d = evt.target.data();
  document.getElementById('hp-name').textContent = d.label;
  const rec = d.tracks.length > 0
    ? ` · ${{d.tracks.length}} recording${{d.tracks.length > 1 ? 's' : ''}}`
    : '';
  document.getElementById('hp-sub').textContent =
    [d.lifespan, d.era_label, d.instrument].filter(Boolean).join(' · ') + rec;
  popover.style.display = 'block';
  evt.target.addClass('hovered');
}});
cy.on('mouseout', 'node', evt => {{
  popover.style.display = 'none';
  evt.target.removeClass('hovered');
}});
cy.on('mousemove', 'node', evt => {{
  const x = evt.originalEvent.clientX, y = evt.originalEvent.clientY;
  const pw = popover.offsetWidth  || 200;
  const ph = popover.offsetHeight || 60;
  popover.style.left = (x + 16 + pw > window.innerWidth  ? x - pw - 10 : x + 16) + 'px';
  popover.style.top  = (y + 16 + ph > window.innerHeight ? y - ph - 10 : y + 16) + 'px';
}});

// ── media player ──────────────────────────────────────────────────────────────
const player   = document.getElementById('media-player');
const mpIframe = document.getElementById('mp-iframe');
const mpTitle  = document.getElementById('mp-title');
const mpTracks = document.getElementById('mp-tracks');
let   currentVid = null;

function ytEmbedUrl(vid) {{
  return `https://www.youtube.com/embed/${{vid}}?autoplay=1&rel=0`;
}}

function loadTrack(vid, label, artistName) {{
  if (currentVid === vid) return;
  currentVid = vid;
  mpIframe.src = ytEmbedUrl(vid);
  mpTitle.textContent = artistName ? `${{artistName}} — ${{label}}` : label;
  mpTracks.querySelectorAll('.mp-track').forEach(el =>
    el.classList.toggle('active', el.dataset.vid === vid));
  document.querySelectorAll('#track-list li').forEach(el =>
    el.classList.toggle('playing', el.dataset.vid === vid));
  player.classList.add('visible');
}}

function buildPlayerTracks(tracks, artistName) {{
  mpTracks.innerHTML = '';
  tracks.forEach(t => {{
    const div = document.createElement('div');
    div.className  = 'mp-track' + (t.vid === currentVid ? ' active' : '');
    div.dataset.vid = t.vid;
    div.innerHTML   = `<span class="ti">&#9654;</span><span>${{t.label}}</span>`;
    div.addEventListener('click', () => loadTrack(t.vid, t.label, artistName));
    mpTracks.appendChild(div);
  }});
}}

document.getElementById('mp-close').addEventListener('click', () => {{
  player.classList.remove('visible');
  mpIframe.src = '';
  currentVid   = null;
  document.querySelectorAll('#track-list li').forEach(el => el.classList.remove('playing'));
  mpTracks.querySelectorAll('.mp-track').forEach(el => el.classList.remove('active'));
}});

// drag
(function () {{
  const bar = document.getElementById('mp-bar');
  let dragging = false, ox = 0, oy = 0;
  bar.addEventListener('mousedown', e => {{
    dragging = true;
    ox = e.clientX - player.offsetLeft;
    oy = e.clientY - player.offsetTop;
    e.preventDefault();
  }});
  document.addEventListener('mousemove', e => {{
    if (!dragging) return;
    const p = player.parentElement.getBoundingClientRect();
    player.style.left = Math.max(0, Math.min(e.clientX - ox, p.width  - player.offsetWidth))  + 'px';
    player.style.top  = Math.max(0, Math.min(e.clientY - oy, p.height - player.offsetHeight)) + 'px';
  }});
  document.addEventListener('mouseup', () => {{ dragging = false; }});
}})();

// vertical resize
(function () {{
  const handle = document.getElementById('mp-resize');
  let resizing = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', e => {{
    resizing = true; startY = e.clientY; startH = player.offsetHeight;
    e.preventDefault();
  }});
  document.addEventListener('mousemove', e => {{
    if (!resizing) return;
    player.style.height = Math.max(180, startH + e.clientY - startY) + 'px';
  }});
  document.addEventListener('mouseup', () => {{ resizing = false; }});
}})();

// ── node tap ──────────────────────────────────────────────────────────────────
cy.on('tap', 'node', evt => {{
  const d = evt.target.data();

  document.getElementById('node-name').textContent = d.label;
  document.getElementById('node-meta').innerHTML =
    `<div>${{d.lifespan || ''}}</div>` +
    `<div style="color:var(--gray)">${{d.era_label}}</div>` +
    `<div>${{d.instrument}} · ${{d.bani || ''}}</div>`;
  const srcDiv = document.getElementById('node-sources');
  if (d.sources && d.sources.length > 0) {{
    srcDiv.style.display = 'block';
    srcDiv.innerHTML = d.sources.map(s =>
      `<a class="node-src-link" href="${{s.url}}" target="_blank">${{s.label}} &#8599;</a>`
    ).join('');
  }} else {{
    srcDiv.style.display = 'none';
    srcDiv.innerHTML = '';
  }}

  document.getElementById('node-info').style.display  = 'block';
  document.getElementById('edge-info').style.display  = 'none';

  const trackPanel = document.getElementById('track-panel');
  const trackList  = document.getElementById('track-list');
  trackList.innerHTML = '';

  if (d.tracks && d.tracks.length > 0) {{
    trackPanel.style.display = 'block';
    buildPlayerTracks(d.tracks, d.label);
    d.tracks.forEach(t => {{
      const li = document.createElement('li');
      li.dataset.vid = t.vid;
      li.className   = t.vid === currentVid ? 'playing' : '';
      li.innerHTML   = `<span class="play-icon">&#9654;</span><span>${{t.label}}</span>`;
      li.addEventListener('click', () => loadTrack(t.vid, t.label, d.label));
      trackList.appendChild(li);
    }});
  }} else {{
    trackPanel.style.display = 'none';
  }}

  cy.elements().addClass('faded');
  evt.target.removeClass('faded');
  evt.target.connectedEdges().removeClass('faded').addClass('highlighted');
  evt.target.connectedEdges().connectedNodes().removeClass('faded');
}});

cy.on('dbltap', 'node', evt => {{
  const url = evt.target.data('url');
  if (url) window.open(url, '_blank');
}});

// ── edge tap ──────────────────────────────────────────────────────────────────
cy.on('tap', 'edge', evt => {{
  const d    = evt.target.data();
  const srcL = cy.getElementById(d.source).data('label') || d.source;
  const tgtL = cy.getElementById(d.target).data('label') || d.target;

  document.getElementById('edge-guru').textContent    = srcL;
  document.getElementById('edge-shishya').textContent = tgtL;
  document.getElementById('edge-note').textContent    = d.note || '';
  document.getElementById('edge-conf').textContent    =
    'confidence: ' + (d.confidence * 100).toFixed(0) + '%';
  const srcA = document.getElementById('edge-src');
  srcA.href = d.source_url;
  srcA.style.display = d.source_url ? 'inline-block' : 'none';

  document.getElementById('node-info').style.display   = 'none';
  document.getElementById('track-panel').style.display = 'none';
  document.getElementById('edge-info').style.display   = 'block';

  cy.elements().addClass('faded');
  evt.target.removeClass('faded').addClass('highlighted');
  evt.target.source().removeClass('faded');
  evt.target.target().removeClass('faded');
}});

// ── background tap ────────────────────────────────────────────────────────────
cy.on('tap', evt => {{
  if (evt.target !== cy) return;
  cy.elements().removeClass('faded highlighted');
  document.getElementById('node-name').textContent     = '—';
  document.getElementById('node-meta').innerHTML       = '';
  document.getElementById('node-link').style.display   = 'none';
  document.getElementById('node-info').style.display   = 'block';
  document.getElementById('track-panel').style.display = 'none';
  document.getElementById('edge-info').style.display   = 'none';
  applyZoomLabels();
}});

// ── controls ──────────────────────────────────────────────────────────────────
function toggleLabels() {{
  labelsOverride = !labelsOverride;
  if (labelsOverride) cy.nodes().forEach(n => n.style('label', n.data('label')));
  else applyZoomLabels();
}}

function relayout() {{
  cy.layout({{
    name: 'cose', animate: true, animationDuration: 600, randomize: false,
    nodeRepulsion: () => 8000, idealEdgeLength: () => 120,
    gravity: 0.25, numIter: 500,
  }}).run();
}}

// ── timeline layout ───────────────────────────────────────────────────────────
const TIMELINE_X_MIN  = 1750;
const TIMELINE_X_MAX  = 2010;
const TIMELINE_WIDTH  = 5200;   // virtual graph-space px
const TIMELINE_UNKNOWN_X = TIMELINE_WIDTH + 400;

// Era lane Y centres (graph-space px). Trinity at top, Contemporary at bottom.
const ERA_LANE_Y = {{
  trinity:        0,
  bridge:         220,
  golden_age:     440,
  disseminator:   660,
  living_pillars: 880,
  contemporary:   1100,
}};
const LANE_STEP = 55;    // fixed vertical step between nodes in the same lane

let currentLayout = 'graph';

function bornToX(born) {{
  if (born == null) return TIMELINE_UNKNOWN_X;
  return ((born - TIMELINE_X_MIN) / (TIMELINE_X_MAX - TIMELINE_X_MIN)) * TIMELINE_WIDTH;
}}

function applyTimelineLayout() {{
  // Group nodes by era, sort each group by born year, assign Y offsets
  const laneNodes = {{}};
  cy.nodes().forEach(n => {{
    const era = n.data('era') || 'contemporary';
    if (!laneNodes[era]) laneNodes[era] = [];
    laneNodes[era].push(n);
  }});

  const positions = {{}};
  Object.entries(laneNodes).forEach(([era, nodes]) => {{
    const laneY = ERA_LANE_Y[era] !== undefined ? ERA_LANE_Y[era] : 1100;
    // Sort by born year (nulls last)
    nodes.sort((a, b) => {{
      const ba = a.data('born'), bb = b.data('born');
      if (ba == null && bb == null) return 0;
      if (ba == null) return 1;
      if (bb == null) return -1;
      return ba - bb;
    }});
    // Spread nodes vertically within lane to avoid stacking.
    // Alternate above/below lane centre with a fixed step so nodes never overlap
    // regardless of how many share the same birth year.
    nodes.forEach((n, i) => {{
      const born = n.data('born');
      const x = bornToX(born);
      const half = Math.floor(i / 2) + 1;
      const offset = (i % 2 === 0 ? 1 : -1) * half * LANE_STEP;
      positions[n.id()] = {{ x, y: laneY + offset }};
    }});
  }});

  const layout = cy.layout({{
    name: 'preset',
    positions: node => positions[node.id()] || {{ x: TIMELINE_UNKNOWN_X, y: 600 }},
    animate: true,
    animationDuration: 700,
    fit: true,
    padding: 60,
  }});
  layout.one('layoutstop', () => showTimelineRuler());
  layout.run();
}}

// ── decade ruler ──────────────────────────────────────────────────────────────
const ruler = document.getElementById('timeline-ruler');

function graphXtoPx(gx) {{
  // Convert graph-space X to screen-space X using Cytoscape's pan/zoom
  return gx * cy.zoom() + cy.pan().x;
}}

function graphYtoPx(gy) {{
  return gy * cy.zoom() + cy.pan().y;
}}

function drawRuler() {{
  if (currentLayout !== 'timeline') return;
  ruler.innerHTML = '';

  const svgNS = 'http://www.w3.org/2000/svg';
  const h = ruler.clientHeight || window.innerHeight;

  // Decade ticks from 1750 to 2010
  for (let year = TIMELINE_X_MIN; year <= TIMELINE_X_MAX; year += 10) {{
    const sx = graphXtoPx(bornToX(year));
    const isCentury = (year % 100 === 0);
    const tickH = isCentury ? 18 : 10;

    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', sx); line.setAttribute('x2', sx);
    line.setAttribute('y1', 0);  line.setAttribute('y2', h);
    line.setAttribute('class', 'tick-line' + (isCentury ? ' century' : ''));
    ruler.appendChild(line);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', sx);
    label.setAttribute('y', 4);
    label.setAttribute('class', 'tick-label' + (isCentury ? ' century' : ''));
    label.textContent = year;
    ruler.appendChild(label);
  }}

  // Era lane labels on the left margin
  Object.entries(ERA_LANE_Y).forEach(([era, gy]) => {{
    const sy = graphYtoPx(gy);
    const eraLabel = {{
      trinity: 'Trinity', bridge: 'Bridge', golden_age: 'Golden Age',
      disseminator: 'Disseminators', living_pillars: 'Living Pillars',
      contemporary: 'Contemporary',
    }}[era] || era;
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', 6);
    text.setAttribute('y', sy);
    text.setAttribute('class', 'era-label');
    text.textContent = '— ' + eraLabel;
    ruler.appendChild(text);
  }});
}}

function showTimelineRuler() {{
  ruler.style.display = 'block';
  drawRuler();
}}

function hideTimelineRuler() {{
  ruler.style.display = 'none';
  ruler.innerHTML = '';
}}

cy.on('pan zoom', () => {{
  if (currentLayout === 'timeline') drawRuler();
}});

// ── layout toggle ─────────────────────────────────────────────────────────────
function toggleLayout() {{
  const btn = document.getElementById('btn-layout');
  if (currentLayout === 'graph') {{
    currentLayout = 'timeline';
    btn.textContent = 'Graph';
    btn.classList.add('active');
    applyTimelineLayout();
  }} else {{
    currentLayout = 'graph';
    btn.textContent = 'Timeline';
    btn.classList.remove('active');
    hideTimelineRuler();
    relayout();
  }}
}}

// ── Bani Flow ─────────────────────────────────────────────────────────────────

// Build a node-id → born-year map for fallback sort
const nodeBorn = {{}};
cy.nodes().forEach(n => {{ nodeBorn[n.id()] = n.data('born'); }});

// Populate dropdowns (only entries that have tagged recordings)
(function () {{
  const compSel = document.getElementById('bani-comp-select');
  const ragaSel = document.getElementById('bani-raga-select');

  compositions.forEach(c => {{
    if (compositionToNodes[c.id] && compositionToNodes[c.id].length > 0) {{
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.title;
      compSel.appendChild(opt);
    }}
  }});

  ragas.forEach(r => {{
    if (ragaToNodes[r.id] && ragaToNodes[r.id].length > 0) {{
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      ragaSel.appendChild(opt);
    }}
  }});
}})();

let activeBaniFilter = null; // {{ type: 'comp'|'raga', id: string }}

function applyBaniFilter(type, id) {{
  activeBaniFilter = {{ type, id }};
  const matchedNodeIds = type === 'comp'
    ? (compositionToNodes[id] || [])
    : (ragaToNodes[id] || []);

  // Dim/highlight nodes
  cy.elements().addClass('faded');
  cy.elements().removeClass('highlighted bani-match');
  matchedNodeIds.forEach(nid => {{
    const n = cy.getElementById(nid);
    n.removeClass('faded');
    n.addClass('bani-match');
  }});

  // Highlight edges between matched nodes
  const matchedSet = new Set(matchedNodeIds);
  cy.edges().forEach(e => {{
    if (matchedSet.has(e.data('source')) && matchedSet.has(e.data('target'))) {{
      e.removeClass('faded');
      e.addClass('highlighted');
    }}
  }});

  // Build listening trail
  buildListeningTrail(type, id, matchedNodeIds);

  document.getElementById('bani-clear').style.display = 'block';
}}

function buildListeningTrail(type, id, matchedNodeIds) {{
  const trail = document.getElementById('listening-trail');
  const composerLabel = document.getElementById('trail-composer-label');
  const trailList = document.getElementById('trail-list');
  trailList.innerHTML = '';
  composerLabel.textContent = '';

  // Composer label (for composition filter only)
  if (type === 'comp') {{
    const comp = compositions.find(c => c.id === id);
    if (comp) {{
      const raga = ragas.find(r => r.id === comp.raga_id);
      const composer = composers.find(c => c.id === comp.composer_id);
      const parts = [
        composer ? 'Composed by ' + composer.name : null,
        raga ? raga.name : null,
        comp.tala ? comp.tala.charAt(0).toUpperCase() + comp.tala.slice(1) : null,
      ].filter(Boolean);
      composerLabel.textContent = parts.join(' \u00b7 ');
    }}
  }} else {{
    const raga = ragas.find(r => r.id === id);
    if (raga) composerLabel.textContent = 'Raga: ' + raga.name;
  }}

  // Collect matching tracks across matched nodes, sorted by year then born
  const rows = [];
  matchedNodeIds.forEach(nid => {{
    const n = cy.getElementById(nid);
    if (!n) return;
    const d = n.data();
    d.tracks.forEach(t => {{
      const matches = type === 'comp'
        ? t.composition_id === id
        : (t.raga_id === id || (t.composition_id && (() => {{
            const c = compositions.find(x => x.id === t.composition_id);
            return c && c.raga_id === id;
          }})())) ;
      if (matches) {{
        rows.push({{ nodeId: nid, artistLabel: d.label, born: d.born, track: t }});
      }}
    }});
  }});

  // Sort: year asc (nulls last), then born asc (nulls last), then label
  rows.sort((a, b) => {{
    const ay = a.track.year, by = b.track.year;
    if (ay !== by) {{
      if (ay == null) return 1;
      if (by == null) return -1;
      return ay - by;
    }}
    const ab = a.born, bb = b.born;
    if (ab !== bb) {{
      if (ab == null) return 1;
      if (bb == null) return -1;
      return ab - bb;
    }}
    return a.artistLabel.localeCompare(b.artistLabel);
  }});

  rows.forEach(row => {{
    const li = document.createElement('li');
    const yearSpan = document.createElement('span');
    yearSpan.className = 'trail-year';
    yearSpan.textContent = row.track.year || '';

    const artistSpan = document.createElement('span');
    artistSpan.className = 'trail-artist';
    artistSpan.textContent = row.artistLabel;
    artistSpan.addEventListener('click', () => {{
      cy.elements().removeClass('faded highlighted bani-match');
      applyBaniFilter(type, id); // re-apply to keep highlight
      const n = cy.getElementById(row.nodeId);
      cy.animate({{ fit: {{ eles: n, padding: 80 }} }});
    }});

    const playSpan = document.createElement('span');
    playSpan.className = 'trail-play';
    playSpan.textContent = '\u25b6';
    playSpan.title = 'Play';
    playSpan.addEventListener('click', () => loadTrack(row.track.vid, row.track.label, row.artistLabel));

    const labelSpan = document.createElement('span');
    labelSpan.className = 'trail-label';
    labelSpan.textContent = row.track.label;

    li.appendChild(yearSpan);
    li.appendChild(artistSpan);
    li.appendChild(playSpan);
    li.appendChild(labelSpan);
    trailList.appendChild(li);
  }});

  trail.style.display = rows.length > 0 ? 'block' : 'none';
}}

function clearBaniFilter() {{
  activeBaniFilter = null;
  cy.elements().removeClass('faded highlighted bani-match');
  document.getElementById('bani-comp-select').value = '';
  document.getElementById('bani-raga-select').value = '';
  document.getElementById('bani-clear').style.display = 'none';
  document.getElementById('listening-trail').style.display = 'none';
  applyZoomLabels();
}}

document.getElementById('bani-comp-select').addEventListener('change', function () {{
  if (!this.value) {{ clearBaniFilter(); return; }}
  document.getElementById('bani-raga-select').value = '';
  applyBaniFilter('comp', this.value);
}});

document.getElementById('bani-raga-select').addEventListener('change', function () {{
  if (!this.value) {{ clearBaniFilter(); return; }}
  document.getElementById('bani-comp-select').value = '';
  applyBaniFilter('raga', this.value);
}});
</script>
</body>
</html>
"""

# ── entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    graph     = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    comp_data = load_compositions()
    composition_to_nodes, raga_to_nodes = build_composition_lookups(graph, comp_data)
    elements  = build_elements(graph)
    html      = render_html(elements, graph, comp_data, composition_to_nodes, raga_to_nodes)
    OUT_FILE.write_text(html, encoding="utf-8")
    print(f"[RENDERED] {OUT_FILE}  ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges)")

if __name__ == "__main__":
    main()
