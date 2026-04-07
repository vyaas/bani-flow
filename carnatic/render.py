#!/usr/bin/env python3
"""
render.py — Renders musicians.json as a self-contained Cytoscape.js HTML graph.
Nodes clickable (Wikipedia). Edges directed guru→shishya.
Color-coded by era. Shape-coded by instrument.
Floating YouTube player: click a node's track list → embedded video, graph stays live.
"""

import json
from pathlib import Path
from collections import defaultdict

ROOT      = Path(__file__).parent
DATA_FILE = ROOT / "data" / "musicians.json"
OUT_FILE  = ROOT / "graph.html"

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
                tracks.append({"vid": vid, "label": t.get("label", vid)})

        elements.append({"data": {
            "id":         node["id"],
            "label":      node["label"],
            "url":        node.get("wikipedia", ""),
            "era":        era,
            "era_label":  ERA_LABELS.get(era, era),
            "instrument": instr,
            "bani":       node.get("bani", ""),
            "lifespan":   lifespan,
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

def render_html(elements: list[dict], graph: dict) -> str:
    elements_json = json.dumps(elements, indent=2, ensure_ascii=False)
    node_count    = len(graph["nodes"])
    edge_count    = len(graph["edges"])

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
  #node-link {{
    display: none; margin-top: 8px; color: var(--blue);
    text-decoration: none; font-size: 0.75rem;
  }}
  #node-link:hover {{ text-decoration: underline; }}

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
  </div>
</header>

<div id="main">
  <div id="cy"></div>

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
      <a id="node-link" href="#" target="_blank">Wikipedia &#8599;</a>
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
      &#9654; track → plays inline, graph stays live.<br>
      Drag player anywhere on canvas.<br>
      Click edge to see relationship.<br>
      Double-click node &#8599; Wikipedia.<br>
      Green border = has recordings.<br>
      Scroll to zoom &middot; drag to pan.
    </div>
  </div>
</div>

<script>
const elements = {elements_json};

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
  const lnk = document.getElementById('node-link');
  lnk.href = d.url; lnk.style.display = d.url ? 'inline-block' : 'none';

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
</script>
</body>
</html>
"""

# ── entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    graph    = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    elements = build_elements(graph)
    html     = render_html(elements, graph)
    OUT_FILE.write_text(html, encoding="utf-8")
    print(f"[RENDERED] {OUT_FILE}  ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges)")

if __name__ == "__main__":
    main()
