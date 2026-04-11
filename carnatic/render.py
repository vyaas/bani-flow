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
RECORDINGS_FILE   = ROOT / "data" / "recordings.json"
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

def load_recordings() -> dict:
    """
    Load recordings from carnatic/data/recordings/ (one .json per recording).
    Each file is a bare recording object — no {"recordings": [...]} wrapper.
    Files are sorted alphabetically by name for a deterministic compile order.
    Files whose names start with '_' (e.g. _index.json) are skipped.

    Falls back to the legacy monolithic recordings.json if the directory does
    not exist (backward-compatible during migration).
    """
    recordings_dir = ROOT / "data" / "recordings"
    if recordings_dir.is_dir():
        files = sorted(
            f for f in recordings_dir.glob("*.json")
            if not f.name.startswith("_")
        )
        recordings = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in files
        ]
        return {"recordings": recordings}
    # legacy fallback: monolithic recordings.json
    if RECORDINGS_FILE.exists():
        return json.loads(RECORDINGS_FILE.read_text(encoding="utf-8"))
    return {"recordings": []}

def timestamp_to_seconds(ts: str) -> int:
    """Convert 'MM:SS' or 'HH:MM:SS' to integer seconds."""
    parts = [int(p) for p in ts.strip().split(":")]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    elif len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    raise ValueError(f"Unrecognised timestamp format: {ts!r}")

def build_recording_lookups(recordings_data: dict, comp_data: dict) -> tuple[dict, dict, dict]:
    """
    Build three denormalised lookup dicts from recordings.json:
      musician_to_performances:     {musician_id: [PerformanceRef, ...]}
      composition_to_performances:  {composition_id: [PerformanceRef, ...]}
      raga_to_performances:         {raga_id: [PerformanceRef, ...]}

    Each PerformanceRef is a flat dict carrying everything the UI needs.
    """
    comp_raga: dict[str, str] = {
        c["id"]: c["raga_id"] for c in comp_data.get("compositions", [])
    }

    musician_to_performances:    dict[str, list[dict]] = defaultdict(list)
    composition_to_performances: dict[str, list[dict]] = defaultdict(list)
    raga_to_performances:        dict[str, list[dict]] = defaultdict(list)

    for rec in recordings_data.get("recordings", []):
        rec_id   = rec["id"]
        video_id = rec["video_id"]
        title    = rec["title"]
        date     = rec.get("date", "")

        for session in rec.get("sessions", []):
            performers = session.get("performers", [])

            for perf in session.get("performances", []):
                # Infer raga_id from composition if not set directly
                raga_id = perf.get("raga_id")
                comp_id = perf.get("composition_id")
                if not raga_id and comp_id:
                    raga_id = comp_raga.get(comp_id)

                ref: dict = {
                    "recording_id":      rec_id,
                    "video_id":          video_id,
                    "title":             title,
                    "short_title":       rec.get("short_title", ""),
                    "date":              date,
                    "session_index":     session["session_index"],
                    "performance_index": perf["performance_index"],
                    "timestamp":         perf.get("timestamp", ""),
                    "offset_seconds":    perf.get("offset_seconds", 0),
                    "display_title":     perf.get("display_title", ""),
                    "composition_id":    comp_id,
                    "raga_id":           raga_id,
                    "tala":              perf.get("tala"),
                    "composer_id":       perf.get("composer_id"),
                    "notes":             perf.get("notes"),
                    "type":              perf.get("type"),
                    "performers":        performers,
                }

                # Index by musician
                for pf in performers:
                    mid = pf.get("musician_id")
                    if mid:
                        musician_to_performances[mid].append(ref)

                # Index by composition
                if comp_id:
                    composition_to_performances[comp_id].append(ref)

                # Index by raga
                if raga_id:
                    raga_to_performances[raga_id].append(ref)

    return (
        dict(musician_to_performances),
        dict(composition_to_performances),
        dict(raga_to_performances),
    )

def build_composition_lookups(
    graph: dict,
    comp_data: dict,
    recordings_data: dict,
) -> tuple[dict, dict]:
    """
    Build two lookup dicts that map compositions/ragas → musician node IDs.

      composition_to_nodes: {composition_id: [node_id, ...]}
      raga_to_nodes:        {raga_id:        [node_id, ...]}

    Two sources are indexed:
      1. Legacy schema  – youtube[] entries embedded in musicians.json nodes
      2. Structured schema – performers[] inside recordings/*.json sessions

    Both sources are merged; duplicates are suppressed by the existing
    `if node_id not in …` guards.
    """
    comp_raga: dict[str, str] = {
        c["id"]: c["raga_id"] for c in comp_data.get("compositions", [])
    }
    composition_to_nodes: dict[str, list[str]] = defaultdict(list)
    raga_to_nodes: dict[str, list[str]] = defaultdict(list)

    # ── 1. Legacy schema: youtube[] entries on musician nodes ─────────────────
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

    # ── 2. Structured schema: recordings/*.json performers[] ─────────────────
    for rec in recordings_data.get("recordings", []):
        for session in rec.get("sessions", []):
            performers = session.get("performers", [])
            for perf in session.get("performances", []):
                comp_id = perf.get("composition_id")
                raga_id = perf.get("raga_id")
                # Infer raga from composition if not set directly
                if not raga_id and comp_id:
                    raga_id = comp_raga.get(comp_id)
                for pf in performers:
                    mid = pf.get("musician_id")
                    if mid:
                        if comp_id and mid not in composition_to_nodes[comp_id]:
                            composition_to_nodes[comp_id].append(mid)
                        if raga_id and mid not in raga_to_nodes[raga_id]:
                            raga_to_nodes[raga_id].append(mid)

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
    node_count               = len(graph["nodes"])
    edge_count               = len(graph["edges"])

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

  /* ── canvas column (filter bar + graph) ── */
  #canvas-wrap {{
    flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative;
  }}
  #filter-bar {{
    display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap;
    padding: 5px 10px;
    background: var(--bg1); border-bottom: 1px solid var(--bg2);
    flex-shrink: 0;
  }}

  /* ── filter groups ── */
  .filter-group {{
    display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  }}
  .filter-separator {{
    width: 1px; height: 18px; background: var(--fg3);
    flex-shrink: 0; margin: 0 6px; opacity: 0.4;
  }}

  /* ── individual chips ── */
  .filter-chip {{
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 7px; border-radius: 2px;
    border: 1px solid var(--bg3); background: var(--bg1);
    color: var(--fg3); font-size: 0.68rem;
    cursor: pointer; user-select: none;
    transition: border-color 0.1s, color 0.1s, background 0.1s;
    white-space: nowrap;
  }}
  .filter-chip:hover {{ border-color: var(--fg3); color: var(--fg); }}
  .filter-chip.active {{
    border-color: var(--yellow); color: var(--yellow); background: var(--bg2);
  }}
  .filter-chip .chip-dot {{
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  }}
  .filter-chip .chip-dot.diamond   {{ transform: rotate(45deg); border-radius: 1px; }}
  .filter-chip .chip-dot.rectangle {{ border-radius: 1px; }}
  .filter-chip .chip-dot.triangle  {{
    width: 0; height: 0; background: none !important;
    border-left: 4px solid transparent; border-right: 4px solid transparent;
    border-bottom: 7px solid var(--gray);
  }}
  .filter-chip.active .chip-dot.triangle {{ border-bottom-color: var(--yellow); }}
  .filter-chip .chip-dot.hexagon {{
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  }}

  /* ── clear-all button ── */
  .filter-clear {{
    font-size: 0.65rem; color: var(--gray);
    background: none; border: none; cursor: pointer;
    padding: 2px 4px; margin-left: 4px;
  }}
  .filter-clear:hover {{ color: var(--fg); }}

  /* ── scope label ── */
  .search-scope-label {{
    font-size: 0.65rem; color: var(--gray);
    font-style: italic; padding: 2px 0 4px 2px; line-height: 1.3;
  }}
  button {{
    background: var(--bg2); color: var(--fg2); border: 1px solid var(--bg3);
    padding: 4px 10px; font-family: inherit; font-size: 0.75rem;
    cursor: pointer; border-radius: 2px;
  }}
  button:hover {{ background: var(--bg3); color: var(--fg); background: var(--bg3); }}

  /* ── main layout ── */
  #main {{ display: flex; flex: 1; overflow: hidden; position: relative; }}
  #cy   {{ flex: 1; background: var(--bg); min-height: 0; }}

  /* ── left sidebar (global controls: Bani Flow, legends) ── */
  #left-sidebar {{
    width: 260px; background: var(--bg1);
    border-right: 1px solid var(--bg2);
    display: flex; flex-direction: column;
    overflow-y: auto; font-size: 0.78rem;
    flex-shrink: 0;
  }}

  /* ── right sidebar (node-specific: selection, recordings, edge) ── */
  #right-sidebar {{
    width: 260px; background: var(--bg1);
    border-left: 1px solid var(--bg2);
    display: flex; flex-direction: column;
    overflow-y: auto; font-size: 0.78rem;
    flex-shrink: 0;
  }}
  .panel {{ padding: 12px 14px; border-bottom: 1px solid var(--bg2); flex-shrink: 0; }}
  .panel h3 {{
    font-size: 0.7rem; color: var(--gray);
    text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;
  }}

  /* ── node header (collapsed single-line) ── */
  #node-info {{ padding: 8px 14px; border-bottom: 1px solid var(--bg2); flex-shrink: 0; }}
  #node-header {{ display: flex; align-items: center; gap: 5px; }}
  #node-name {{ font-size: 0.85rem; color: var(--yellow); font-weight: bold; }}
  #node-lifespan {{ font-size: 0.70rem; color: var(--gray); margin-left: 4px; }}
  .node-wiki-link {{
    margin-left: auto; flex-shrink: 0;
    color: var(--blue); font-size: 0.72rem; text-decoration: none;
  }}
  .node-wiki-link:hover {{ text-decoration: underline; }}

  /* Single coloured shape — shape = instrument, colour = era */
  .node-shape-icon {{
    width: 10px; height: 10px; display: inline-block;
    flex-shrink: 0;
    /* background-color set dynamically via JS: d.color */
  }}
  .node-shape-icon.ellipse   {{ border-radius: 50%; }}
  .node-shape-icon.diamond   {{ transform: rotate(45deg); border-radius: 1px; }}
  .node-shape-icon.rectangle {{ border-radius: 1px; }}
  .node-shape-icon.triangle  {{
    width: 0; height: 0; background: none !important;
    border-left: 5px solid transparent; border-right: 5px solid transparent;
    border-bottom: 10px solid var(--gray); /* overridden by JS for triangle */
  }}
  .node-shape-icon.hexagon {{
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  }}

  /* ── recording filter input + trail filter input ── */
  #rec-filter,
  #trail-filter {{
    width: 100%; background: var(--bg2); color: var(--fg2);
    border: 1px solid var(--bg3); padding: 4px 8px;
    font-family: inherit; font-size: 0.72rem; border-radius: 2px;
    margin-top: 6px; display: none; box-sizing: border-box;
  }}
  #rec-filter:focus,
  #trail-filter:focus {{ outline: none; border-color: var(--yellow); }}
  #rec-filter::placeholder,
  #trail-filter::placeholder {{ color: var(--gray); font-style: italic; }}

  /* ── unified recordings panel ── */
  #recordings-panel {{ display: none; }}
  #recordings-list {{ list-style: none; margin-top: 4px; }}
  #recordings-list li {{
    padding: 5px 0; border-bottom: 1px solid var(--bg2);
    cursor: pointer; display: flex; flex-direction: column; gap: 2px;
    line-height: 1.4;
  }}
  #recordings-list li:last-child {{ border-bottom: none; }}
  #recordings-list li:hover {{ color: var(--yellow); }}
  #recordings-list li.playing {{ color: var(--aqua); }}
  .rec-row1 {{ display: flex; align-items: baseline; width: 100%; gap: 4px; }}
  .rec-title {{
    color: var(--yellow); font-weight: bold; font-size: 0.74rem;
    flex: 1; min-width: 0; word-break: break-word;
  }}
  .rec-year {{
    flex-shrink: 0; color: var(--gray); font-size: 0.68rem;
    margin-left: auto; padding-left: 6px;
  }}
  .rec-row2 {{ display: flex; align-items: baseline; width: 100%; gap: 4px; }}
  .rec-row3 {{ display: flex; align-items: baseline; width: 100%; gap: 4px; }}
  .rec-meta {{
    color: var(--fg3); font-size: 0.70rem;
    flex: 1; min-width: 0;
  }}
  .rec-link {{
    flex-shrink: 0; color: var(--blue); font-size: 0.70rem;
    text-decoration: none; white-space: nowrap;
  }}
  .rec-link:hover {{ text-decoration: underline; }}

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


  /* ── hover popover ── */
  #hover-popover {{
    position: fixed; display: none; pointer-events: none;
    background: var(--bg1); border: 1px solid var(--yellow); border-radius: 3px;
    padding: 7px 12px; z-index: 900; max-width: 220px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }}
  #hp-name {{ font-size: 1rem; font-weight: bold; color: var(--yellow); line-height: 1.3; }}
  #hp-sub  {{ font-size: 0.75rem; color: var(--fg3); margin-top: 3px; line-height: 1.5; }}

  /* ── floating media player (multi-window, class-based) ── */
  .media-player {{
    position: absolute;
    width: 340px;
    background: var(--bg1);
    border: 1px solid var(--bg3);
    border-radius: 4px;
    box-shadow: 0 6px 28px rgba(0,0,0,0.65);
    display: flex;
    flex-direction: column;
    user-select: none;
  }}

  /* title bar / drag handle */
  .mp-bar {{
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px;
    background: var(--bg2); border-radius: 4px 4px 0 0;
    cursor: grab; border-bottom: 1px solid var(--bg3);
  }}
  .mp-bar:active {{ cursor: grabbing; }}
  .mp-title {{
    flex: 1; font-size: 0.78rem; font-weight: bold; color: var(--yellow);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }}
  .mp-close {{
    background: none; border: none; color: var(--gray);
    font-size: 1.1rem; cursor: pointer; padding: 0 2px; line-height: 1;
    flex-shrink: 0;
  }}
  .mp-close:hover {{ color: var(--red); }}

  /* 16:9 iframe wrapper */
  .mp-video-wrap {{
    position: relative; width: 100%; padding-top: 56.25%; background: #000;
  }}
  .mp-iframe {{
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%; border: none;
  }}

  /* resize grip at bottom */
  .mp-resize {{
    height: 7px; cursor: ns-resize;
    background: var(--bg2); border-top: 1px solid var(--bg3);
    border-radius: 0 0 4px 4px; opacity: 0.6;
  }}
  .mp-resize:hover {{ opacity: 1; background: var(--bg3); }}

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
    display: flex; flex-direction: column; gap: 2px; line-height: 1.4;
    cursor: pointer;
  }}
  #trail-list li:last-child {{ border-bottom: none; }}
  #trail-list li:hover {{ color: var(--yellow); }}
  #trail-list li.playing {{ color: var(--aqua); }}
  .trail-header {{ display: flex; align-items: center; width: 100%; gap: 4px; }}
  .trail-lifespan {{ flex-shrink: 0; color: var(--gray); font-size: 0.68rem; margin-left: auto; padding-left: 6px; }}
  .trail-artist {{ color: var(--yellow); cursor: pointer; font-weight: bold; flex-shrink: 0; display: inline-flex; align-items: center; gap: 0; }}
  .trail-artist:hover {{ text-decoration: underline; }}
  .trail-row2 {{ display: flex; align-items: baseline; width: 100%; gap: 4px; }}
  .trail-label {{ color: var(--fg3); font-size: 0.72rem; flex: 1; min-width: 0; }}
  .trail-shape-icon {{
    width: 8px; height: 8px; display: inline-block;
    margin-right: 6px; vertical-align: middle; flex-shrink: 0;
  }}
  .trail-shape-icon.ellipse   {{ border-radius: 50%; }}
  .trail-shape-icon.diamond   {{ transform: rotate(45deg); border-radius: 1px; }}
  .trail-shape-icon.rectangle {{ border-radius: 1px; }}
  .trail-shape-icon.triangle  {{
    width: 0; height: 0; background: none;
    border-left: 4px solid transparent; border-right: 4px solid transparent;
    border-bottom: 8px solid var(--gray);
  }}
  .trail-shape-icon.hexagon {{
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  }}
  .trail-link {{
    flex-shrink: 0; color: var(--blue); font-size: 0.70rem;
    text-decoration: none; white-space: nowrap; margin-left: auto;
  }}
  .trail-link:hover {{ text-decoration: underline; }}

  /* ── panel-level search bars ── */
  .panel-search-wrap {{
    padding: 8px 14px 0;
    border-bottom: 1px solid var(--bg2);
  }}
  .panel-search {{
    width: 100% !important;
    box-sizing: border-box;
    background: var(--bg2); color: var(--fg2); border: 1px solid var(--bg3);
    padding: 4px 8px; font-family: inherit; font-size: 0.72rem;
    border-radius: 2px;
  }}
  .panel-search:focus {{ outline: none; border-color: var(--yellow); }}
  .panel-search::placeholder {{ color: var(--gray); font-style: italic; }}
  .search-wrap {{
    position: relative;
  }}
  .search-input {{
    background: var(--bg2); color: var(--fg2); border: 1px solid var(--bg3);
    padding: 4px 10px; font-family: inherit; font-size: 0.75rem;
    cursor: text; border-radius: 2px; width: 200px;
  }}
  .search-input:focus {{
    outline: none; border-color: var(--yellow);
  }}
  .search-dropdown {{
    position: absolute; top: 100%; left: 0; width: 100%;
    background: var(--bg1); border: 1px solid var(--bg3);
    border-radius: 0 0 3px 3px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.5);
    max-height: 280px; overflow-y: auto; z-index: 950;
  }}
  .search-result-item {{
    padding: 6px 10px; cursor: pointer;
    border-bottom: 1px solid var(--bg2);
    font-size: 0.78rem;
  }}
  .search-result-item:last-child {{ border-bottom: none; }}
  .search-result-item:hover,
  .search-result-item.active {{
    background: var(--bg2); color: var(--yellow);
  }}
  .search-result-secondary {{
    font-size: 0.70rem; color: var(--gray); margin-top: 2px;
  }}
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
  <!-- ── left sidebar: global controls (Bani Flow, legends) ── -->
  <div id="left-sidebar">
    <!-- ── Bani Flow panel ── -->
    <div class="panel" id="bani-flow-panel">
      <h3>Bani Flow &#9835;</h3>
      <div class="search-wrap panel-search-wrap" id="bani-search-wrap">
        <input id="bani-search-input" class="search-input panel-search" type="text"
               placeholder="&#9833; Search raga / composition"
               autocomplete="off" spellcheck="false">
        <div id="bani-search-dropdown" class="search-dropdown" style="display:none"></div>
        <div class="search-scope-label" id="bani-scope-label" style="display:none">
          searching all compositions
        </div>
      </div>
      <input id="trail-filter" type="text" placeholder="Filter trail&#8230;"
             style="display:none" autocomplete="off" spellcheck="false" />
      <div id="listening-trail">
        <div id="trail-composer-label"></div>
        <ul id="trail-list"></ul>
      </div>
    </div>

  </div>

  <!-- ── canvas column: filter bar + graph ── -->
  <div id="canvas-wrap">
    <div id="filter-bar">
      <div class="filter-group" id="era-filter-group" data-group="era"></div>
      <div class="filter-separator"></div>
      <div class="filter-group" id="instr-filter-group" data-group="instrument"></div>
      <button class="filter-clear" id="filter-clear-all"
              style="display:none" title="Clear all filters" onclick="clearAllChipFilters()">&#10005; Show all</button>
    </div>
    <div id="cy"></div>
    <svg id="timeline-ruler" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:50;"></svg>
  </div>

  <!-- ── hover popover ── -->
  <div id="hover-popover">
    <div id="hp-name"></div>
    <div id="hp-sub"></div>
  </div>

  <!-- ── right sidebar: node-specific (selection, recordings, edge) ── -->
  <div id="right-sidebar">
    <div class="panel" id="musician-panel">
      <h3>Musician &#9835;</h3>
      <div class="search-wrap panel-search-wrap" id="musician-search-wrap">
        <input id="musician-search-input" class="search-input panel-search" type="text"
               placeholder="&#128269; Search musician&#8230;"
               autocomplete="off" spellcheck="false">
        <div id="musician-search-dropdown" class="search-dropdown" style="display:none"></div>
        <div class="search-scope-label" id="musician-scope-label" style="display:none">
          searching all {node_count} musicians
        </div>
      </div>
    </div>
    <div id="node-info">
      <div id="node-header">
        <span id="node-shape-icon" class="node-shape-icon ellipse"></span>
        <span id="node-name">—</span>
        <span id="node-lifespan"></span>
        <a id="node-wiki-link" class="node-wiki-link" href="#" target="_blank"
           style="display:none">&#8599;</a>
      </div>
      <input id="rec-filter" type="text" placeholder="Filter recordings&#8230;"
             style="display:none" autocomplete="off" spellcheck="false" />
    </div>

    <div class="panel" id="recordings-panel" style="display:none">
      <h3>Recordings</h3>
      <ul id="recordings-list"></ul>
    </div>

    <div class="panel" id="edge-info" style="display:none">
      <h3>Selected Edge</h3>
      <div id="edge-guru"></div>
      <div id="edge-arrow">&#8595; guru &middot; shishya</div>
      <div id="edge-shishya"></div>
      <div id="edge-note"></div>
      <div id="edge-conf"></div>
      <a id="edge-src" href="#" target="_blank">source &#8599;</a>
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

// ── Recordings data (injected by render.py) ───────────────────────────────────
const recordings             = {recordings_json};
const musicianToPerformances = {musician_to_perf_json};
const compositionToPerf      = {composition_to_perf_json};
const ragaToPerf             = {raga_to_perf_json};

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
    {{ selector: '.faded',      style: {{ 'opacity': 0.12 }} }},
    {{ selector: '.chip-faded', style: {{ 'opacity': 0.12 }} }},
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
  buildFilterChips();
}});

// ── ERA_COLOURS and INSTRUMENT_SHAPES mirrors (for chip injection) ─────────────
const ERA_COLOURS = {{
  trinity:        '#d79921',
  bridge:         '#d65d0e',
  golden_age:     '#458588',
  disseminator:   '#689d6a',
  living_pillars: '#b16286',
  contemporary:   '#98971a',
}};
const INSTRUMENT_SHAPES = {{
  vocal:         'ellipse',
  veena:         'diamond',
  violin:        'rectangle',
  flute:         'triangle',
  mridangam:     'hexagon',
  bharatanatyam: 'ellipse',
}};

// ── chip filter state ─────────────────────────────────────────────────────────
const activeFilters = {{ era: new Set(), instrument: new Set() }};

function buildFilterChips() {{
  const eraGroup   = document.getElementById('era-filter-group');
  const instrGroup = document.getElementById('instr-filter-group');

  const eraOrder = [
    'trinity', 'bridge', 'golden_age', 'disseminator', 'living_pillars', 'contemporary'
  ];
  const eraLabels = {{
    trinity:        'Trinity',
    bridge:         'Bridge',
    golden_age:     'Golden Age',
    disseminator:   'Disseminators',
    living_pillars: 'Living Pillars',
    contemporary:   'Contemporary',
  }};
  eraOrder.forEach(era => {{
    const chip = document.createElement('span');
    chip.className   = 'filter-chip';
    chip.dataset.key = era;
    chip.dataset.group = 'era';

    const dot = document.createElement('span');
    dot.className = 'chip-dot ellipse';
    dot.style.background = ERA_COLOURS[era] || 'var(--gray)';

    const label = document.createElement('span');
    label.textContent = eraLabels[era] || era;

    chip.appendChild(dot);
    chip.appendChild(label);
    chip.addEventListener('click', () => toggleFilterChip(chip));
    eraGroup.appendChild(chip);
  }});

  const instrOrder = ['vocal', 'veena', 'violin', 'flute', 'mridangam'];
  const instrLabels = {{
    vocal:     'Vocal',
    veena:     'Veena',
    violin:    'Violin',
    flute:     'Flute',
    mridangam: 'Mridangam',
  }};
  instrOrder.forEach(instr => {{
    const chip = document.createElement('span');
    chip.className   = 'filter-chip';
    chip.dataset.key = instr;
    chip.dataset.group = 'instrument';

    const dot = document.createElement('span');
    const shapeClass = INSTRUMENT_SHAPES[instr] || 'ellipse';
    dot.className = `chip-dot ${{shapeClass}}`;
    if (shapeClass !== 'triangle') {{
      dot.style.background = 'var(--gray)';
    }}

    const label = document.createElement('span');
    label.textContent = instrLabels[instr] || instr;

    chip.appendChild(dot);
    chip.appendChild(label);
    chip.addEventListener('click', () => toggleFilterChip(chip));
    instrGroup.appendChild(chip);
  }});
}}

function toggleFilterChip(chip) {{
  const group = chip.dataset.group;
  const key   = chip.dataset.key;
  if (activeFilters[group].has(key)) {{
    activeFilters[group].delete(key);
    chip.classList.remove('active');
  }} else {{
    activeFilters[group].add(key);
    chip.classList.add('active');
  }}
  applyChipFilters();
}}

function applyChipFilters() {{
  // Mutual exclusion: clear Bani Flow filter when chip filter activates
  const eraActive   = activeFilters.era;
  const instrActive = activeFilters.instrument;
  const anyActive   = eraActive.size > 0 || instrActive.size > 0;

  if (anyActive && activeBaniFilter) {{
    clearBaniFilter();
  }}

  if (!anyActive) {{
    cy.elements().removeClass('chip-faded');
    document.getElementById('filter-clear-all').style.display = 'none';
    setScopeLabels(false);
    return;
  }}

  cy.nodes().forEach(node => {{
    const d = node.data();
    const eraMatch   = eraActive.size   === 0 || eraActive.has(d.era);
    const instrMatch = instrActive.size === 0 || instrActive.has(d.instrument);
    const passes = eraMatch && instrMatch;
    if (passes) {{
      node.removeClass('chip-faded');
    }} else {{
      node.addClass('chip-faded');
    }}
  }});

  cy.edges().forEach(edge => {{
    const srcFaded = edge.source().hasClass('chip-faded');
    const tgtFaded = edge.target().hasClass('chip-faded');
    if (srcFaded && tgtFaded) {{
      edge.addClass('chip-faded');
    }} else {{
      edge.removeClass('chip-faded');
    }}
  }});

  document.getElementById('filter-clear-all').style.display = 'inline';
  setScopeLabels(true);
}}

function clearAllChipFilters() {{
  activeFilters.era.clear();
  activeFilters.instrument.clear();
  document.querySelectorAll('.filter-chip.active').forEach(c => c.classList.remove('active'));
  cy.elements().removeClass('chip-faded');
  document.getElementById('filter-clear-all').style.display = 'none';
  setScopeLabels(false);
}}

function setScopeLabels(visible) {{
  const display = visible ? 'block' : 'none';
  document.getElementById('musician-scope-label').style.display = display;
  document.getElementById('bani-scope-label').style.display     = display;
}}

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

// ── media player manager ──────────────────────────────────────────────────────
// Registry: vid (11-char YouTube ID) → player instance {{ el, iframe, titleEl, vid }}
const playerRegistry = new Map();
let topZ = 800;
let spawnCount = 0;

function ytEmbedUrl(vid, startSeconds) {{
  const t = (startSeconds && startSeconds > 0) ? `&start=${{startSeconds}}` : '';
  return `https://www.youtube.com/embed/${{vid}}?autoplay=1&rel=0${{t}}`;
}}

function ytDirectUrl(vid, startSeconds) {{
  const t = (startSeconds && startSeconds > 0) ? `?t=${{startSeconds}}` : '';
  return `https://youtu.be/${{vid}}${{t}}`;
}}

function formatTimestamp(seconds) {{
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {{
    return `${{h}}:${{m.toString().padStart(2, '0')}}:${{s.toString().padStart(2, '0')}}`;
  }}
  return `${{m}}:${{s.toString().padStart(2, '0')}}`;
}}

function nextSpawnPosition() {{
  const offset = (spawnCount % 8) * 28;
  spawnCount += 1;
  return {{ top: 18 + offset, left: 18 + offset }};
}}

function bringToFront(player) {{
  topZ += 1;
  player.el.style.zIndex = topZ;
}}

function refreshPlayingIndicators() {{
  document.querySelectorAll('[data-vid]').forEach(el => {{
    el.classList.toggle('playing', playerRegistry.has(el.dataset.vid));
  }});
}}

function wireDrag(el, bar) {{
  let dragging = false, ox = 0, oy = 0;
  bar.addEventListener('mousedown', e => {{
    dragging = true;
    ox = e.clientX - el.offsetLeft;
    oy = e.clientY - el.offsetTop;
    e.preventDefault();
  }});
  document.addEventListener('mousemove', e => {{
    if (!dragging) return;
    const p = el.parentElement.getBoundingClientRect();
    el.style.left = Math.max(0, Math.min(e.clientX - ox, p.width  - el.offsetWidth))  + 'px';
    el.style.top  = Math.max(0, Math.min(e.clientY - oy, p.height - el.offsetHeight)) + 'px';
  }});
  document.addEventListener('mouseup', () => {{ dragging = false; }});
}}

function wireResize(el, handle) {{
  let resizing = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', e => {{
    resizing = true; startY = e.clientY; startH = el.offsetHeight;
    e.preventDefault();
  }});
  document.addEventListener('mousemove', e => {{
    if (!resizing) return;
    el.style.height = Math.max(180, startH + e.clientY - startY) + 'px';
  }});
  document.addEventListener('mouseup', () => {{ resizing = false; }});
}}

function createPlayer(vid, label, artistName, startSeconds) {{
  const pos = nextSpawnPosition();
  const el = document.createElement('div');
  el.className = 'media-player';
  el.style.cssText = `top:${{pos.top}}px; left:${{pos.left}}px; z-index:${{++topZ}};`;

  el.innerHTML = `
    <div class="mp-bar">
      <span class="mp-title">${{artistName ? artistName + ' \u2014 ' : ''}}${{label}}</span>
      <button class="mp-close" title="Close">\u2715</button>
    </div>
    <div class="mp-video-wrap">
      <iframe class="mp-iframe"
        src="${{ytEmbedUrl(vid, startSeconds)}}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
        allowfullscreen></iframe>
    </div>
    <div class="mp-resize" title="Drag to resize"></div>
  `;

  const instance = {{
    el,
    iframe:   el.querySelector('.mp-iframe'),
    titleEl:  el.querySelector('.mp-title'),
    vid,
  }};

  el.querySelector('.mp-close').addEventListener('click', () => {{
    instance.iframe.src = '';
    el.remove();
    playerRegistry.delete(vid);
    refreshPlayingIndicators();
  }});

  wireDrag(el, el.querySelector('.mp-bar'));
  wireResize(el, el.querySelector('.mp-resize'));
  el.addEventListener('mousedown', () => bringToFront(instance));

  document.getElementById('main').appendChild(el);
  bringToFront(instance);
  return instance;
}}

function openOrFocusPlayer(vid, label, artistName, startSeconds) {{
  if (playerRegistry.has(vid)) {{
    bringToFront(playerRegistry.get(vid));
    return;
  }}
  const p = createPlayer(vid, label, artistName, startSeconds);
  playerRegistry.set(vid, p);
  refreshPlayingIndicators();
}}

// ── buildRecordingsList — unified legacy + structured recordings ───────────────
function buildRecordingsList(nodeId, nodeData) {{
  const recPanel  = document.getElementById('recordings-panel');
  const recList   = document.getElementById('recordings-list');
  const recFilter = document.getElementById('rec-filter');
  recList.innerHTML = '';

  const nd = nodeData || cy.getElementById(nodeId).data();
  const legacyTracks    = nd.tracks || [];
  const structuredPerfs = musicianToPerformances[nodeId] || [];

  const allRecs = [];

  legacyTracks.forEach(t => {{
    allRecs.push({{
      vid:            t.vid,
      title:          t.label,
      composition_id: t.composition_id || null,
      raga_id:        t.raga_id        || null,
      year:           t.year           || null,
      offset_seconds: 0,
      tala:           null,
      context:        null,
      type:           t.type           || null,
      isLegacy:       true,
    }});
  }});

  structuredPerfs.forEach(p => {{
    allRecs.push({{
      vid:            p.video_id,
      title:          p.display_title,
      composition_id: p.composition_id || null,
      raga_id:        p.raga_id        || null,
      year:           p.date ? parseInt(p.date) : null,
      offset_seconds: p.offset_seconds || 0,
      tala:           p.tala           || null,
      context:        p.short_title || p.date || null,
      type:           p.type           || null,
      isLegacy:       false,
    }});
  }});

  // Sort: year asc (nulls last), performances before non-performances, then title
  allRecs.sort((a, b) => {{
    if (a.year !== b.year) {{
      if (a.year == null) return 1;
      if (b.year == null) return -1;
      return a.year - b.year;
    }}
    const aIsPerf = !!(a.composition_id && a.raga_id);
    const bIsPerf = !!(b.composition_id && b.raga_id);
    if (aIsPerf !== bIsPerf) return aIsPerf ? -1 : 1;
    return (a.title || '').localeCompare(b.title || '');
  }});

  const artistLabel = nd.label || '';

  allRecs.forEach(rec => {{
    const li = document.createElement('li');
    li.dataset.vid = rec.vid;
    li.className   = playerRegistry.has(rec.vid) ? 'playing' : '';
    li.addEventListener('click', () =>
      openOrFocusPlayer(rec.vid, rec.title, artistLabel,
                        rec.offset_seconds > 0 ? rec.offset_seconds : undefined));

    // Row 1: title + year
    const row1 = document.createElement('div');
    row1.className = 'rec-row1';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'rec-title';
    if (rec.composition_id && rec.raga_id) {{
      const comp = compositions.find(c => c.id === rec.composition_id);
      titleSpan.textContent = comp ? comp.title : rec.title;
    }} else {{
      const typeIcon = {{ interview: '🎤 ', lecture: '🎓 ', radio: '📻 ' }}[rec.type] || '';
      titleSpan.textContent = typeIcon + (rec.title || '');
    }}

    const yearSpan = document.createElement('span');
    yearSpan.className = 'rec-year';
    yearSpan.textContent = '';

    row1.appendChild(titleSpan);
    row1.appendChild(yearSpan);

    // Build the YouTube link (shared by all rows)
    const linkA = document.createElement('a');
    linkA.className = 'rec-link';
    linkA.href      = ytDirectUrl(rec.vid, rec.offset_seconds > 0 ? rec.offset_seconds : undefined);
    linkA.target    = '_blank';
    linkA.textContent = rec.offset_seconds > 0
      ? formatTimestamp(rec.offset_seconds) + ' \u2197'
      : '00:00 \u2197';
    linkA.title = rec.offset_seconds > 0
      ? 'Open in YouTube at this timestamp'
      : 'Open in YouTube';
    linkA.addEventListener('click', e => e.stopPropagation());

    // Row 2: raga name (composition) or context (non-composition)
    const row2 = document.createElement('div');
    row2.className = 'rec-row2';
    const ragaSpan = document.createElement('span');
    ragaSpan.className = 'rec-meta';
    if (rec.composition_id && rec.raga_id) {{
      const ragaObj = ragas.find(r => r.id === rec.raga_id);
      ragaSpan.textContent = ragaObj ? ragaObj.name : (rec.raga_id || '');
    }} else {{
      ragaSpan.textContent = rec.context || '';
    }}
    row2.appendChild(ragaSpan);

    // Row 3 (only when context exists): context + link
    // When no context: link goes on row 2 alongside raga
    const hasContext = !!(rec.composition_id && rec.raga_id && rec.context);
    if (hasContext) {{
      const row3 = document.createElement('div');
      row3.className = 'rec-row3';
      const ctxSpan = document.createElement('span');
      ctxSpan.className = 'rec-meta';
      ctxSpan.textContent = rec.context;
      row3.appendChild(ctxSpan);
      row3.appendChild(linkA);
      li.appendChild(row1);
      li.appendChild(row2);
      li.appendChild(row3);
    }} else {{
      // No context — link shares row 2 with raga
      row2.appendChild(linkA);
      li.appendChild(row1);
      li.appendChild(row2);
    }}
    recList.appendChild(li);
  }});

  if (allRecs.length > 0) {{
    recPanel.style.display  = 'block';
    recFilter.style.display = 'block';
  }} else {{
    recPanel.style.display  = 'none';
    recFilter.style.display = 'none';
  }}
}}

// ── selectNode — shared selection logic (sidebar + graph highlight) ───────────
function selectNode(node) {{
  const d = node.data();

  // Collapsed single-line header
  document.getElementById('node-name').textContent     = d.label;
  document.getElementById('node-lifespan').textContent = d.lifespan || '';

  const shapeIcon = document.getElementById('node-shape-icon');
  shapeIcon.className = 'node-shape-icon ' + (d.shape || 'ellipse');
  if (d.shape === 'triangle') {{
    shapeIcon.style.borderBottomColor = d.color || 'var(--gray)';
    shapeIcon.style.background = '';
  }} else {{
    shapeIcon.style.background = d.color || 'var(--gray)';
    shapeIcon.style.borderBottomColor = '';
  }}

  const wikiLink   = document.getElementById('node-wiki-link');
  const primarySrc = d.sources && d.sources.length > 0 ? d.sources[0] : null;
  if (primarySrc) {{
    wikiLink.href         = primarySrc.url;
    wikiLink.title        = primarySrc.label;
    wikiLink.style.display = 'inline';
  }} else {{
    wikiLink.style.display = 'none';
  }}

  document.getElementById('node-info').style.display = 'block';
  document.getElementById('edge-info').style.display = 'none';

  // Clear filter and rebuild unified recordings list
  const recFilter = document.getElementById('rec-filter');
  recFilter.value = '';
  recFilter.dispatchEvent(new Event('input'));

  buildRecordingsList(d.id, d);

  cy.elements().addClass('faded');
  node.removeClass('faded');
  node.connectedEdges().removeClass('faded').addClass('highlighted');
  node.connectedEdges().connectedNodes().removeClass('faded');
}}

// ── rec-filter event listener ─────────────────────────────────────────────────
document.getElementById('rec-filter').addEventListener('input', function() {{
  const q       = this.value.toLowerCase().trim();
  const recList = document.getElementById('recordings-list');
  const items   = recList.querySelectorAll('li:not(.rec-no-match)');
  let anyVisible = false;

  items.forEach(li => {{
    if (!q) {{ li.style.display = 'flex'; anyVisible = true; return; }}
    // Match only musicological content — title and meta, not year or timestamp
    const titleText = (li.querySelector('.rec-title') || {{}}).textContent || '';
    const metaText  = (li.querySelector('.rec-meta')  || {{}}).textContent || '';
    const matches   = titleText.toLowerCase().includes(q) ||
                      metaText.toLowerCase().includes(q);
    li.style.display = matches ? 'flex' : 'none';
    if (matches) anyVisible = true;
  }});

  let noMatch = recList.querySelector('.rec-no-match');
  if (!anyVisible && q) {{
    if (!noMatch) {{
      noMatch = document.createElement('li');
      noMatch.className = 'rec-no-match';
      noMatch.style.cssText = 'color:var(--gray);font-style:italic;cursor:default;padding:5px 0;';
      noMatch.textContent = 'no match';
      recList.appendChild(noMatch);
    }}
    noMatch.style.display = 'flex';
  }} else if (noMatch) {{
    noMatch.style.display = 'none';
  }}
}});

// ── trail-filter event listener ───────────────────────────────────────────────
document.getElementById('trail-filter').addEventListener('input', function() {{
  const q         = this.value.toLowerCase().trim();
  const trailList = document.getElementById('trail-list');
  const items     = trailList.querySelectorAll('li:not(.trail-no-match)');
  let anyVisible  = false;

  items.forEach(li => {{
    if (!q) {{ li.style.display = 'flex'; anyVisible = true; return; }}
    // Match artist name (trail-artist text) and composition title (trail-label)
    const artistText = (li.querySelector('.trail-artist') || {{}}).textContent || '';
    const labelText  = (li.querySelector('.trail-label')  || {{}}).textContent || '';
    const matches    = artistText.toLowerCase().includes(q) ||
                       labelText.toLowerCase().includes(q);
    li.style.display = matches ? 'flex' : 'none';
    if (matches) anyVisible = true;
  }});

  let noMatch = trailList.querySelector('.trail-no-match');
  if (!anyVisible && q) {{
    if (!noMatch) {{
      noMatch = document.createElement('li');
      noMatch.className = 'trail-no-match';
      noMatch.style.cssText = 'color:var(--gray);font-style:italic;cursor:default;padding:5px 0;';
      noMatch.textContent = 'no match';
      trailList.appendChild(noMatch);
    }}
    noMatch.style.display = 'flex';
  }} else if (noMatch) {{
    noMatch.style.display = 'none';
  }}
}});

// ── node tap ──────────────────────────────────────────────────────────────────
cy.on('tap', 'node', evt => {{
  selectNode(evt.target);
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

  document.getElementById('node-info').style.display        = 'none';
  document.getElementById('recordings-panel').style.display = 'none';
  document.getElementById('edge-info').style.display        = 'block';

  cy.elements().addClass('faded');
  evt.target.removeClass('faded').addClass('highlighted');
  evt.target.source().removeClass('faded');
  evt.target.target().removeClass('faded');
}});

// ── background tap ────────────────────────────────────────────────────────────
cy.on('tap', evt => {{
  if (evt.target !== cy) return;
  cy.elements().removeClass('faded highlighted');
  document.getElementById('node-name').textContent          = '—';
  document.getElementById('node-lifespan').textContent      = '';
  document.getElementById('node-wiki-link').style.display   = 'none';
  document.getElementById('rec-filter').style.display       = 'none';
  document.getElementById('rec-filter').value               = '';
  document.getElementById('node-info').style.display        = 'block';
  document.getElementById('recordings-panel').style.display = 'none';
  document.getElementById('edge-info').style.display        = 'none';
  // NEW: clear chip filters on background tap
  clearAllChipFilters();
  applyZoomLabels();
}});

// ── controls ──────────────────────────────────────────────────────────────────
function toggleLabels() {{
  labelsOverride = !labelsOverride;
  if (labelsOverride) cy.nodes().forEach(n => n.style('label', n.data('label')));
  else applyZoomLabels();
}}

function relayout() {{
  if (currentLayout === 'timeline') {{ applyTimelineLayout(); return; }}
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

  document.getElementById('trail-filter').style.display = 'block';
  document.getElementById('trail-filter').value = '';
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

  // Collect matching tracks across matched nodes (from musicians.json youtube[])
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
        rows.push({{ nodeId: nid, artistLabel: d.label, born: d.born, lifespan: d.lifespan, color: d.color, shape: d.shape, track: t, isStructured: false }});
      }}
    }});
  }});

  // Also collect from structured recordings (recordings.json)
  const structuredPerfs = type === 'comp'
    ? (compositionToPerf[id] || [])
    : (ragaToPerf[id] || []);

  structuredPerfs.forEach(p => {{
    const primaryPerformer = p.performers.find(pf => pf.role === 'vocal') || p.performers[0];
    let artistLabel, nodeId, born, pNode;
    if (primaryPerformer && primaryPerformer.musician_id) {{
      pNode = cy.getElementById(primaryPerformer.musician_id);
      artistLabel = (pNode && pNode.data('label')) || primaryPerformer.unmatched_name || p.title;
      nodeId = primaryPerformer.musician_id;
      born   = pNode ? pNode.data('born') : null;
    }} else {{
      pNode = null;
      artistLabel = (primaryPerformer && primaryPerformer.unmatched_name) || p.title;
      nodeId = null;
      born   = null;
    }}
    rows.push({{
      nodeId,
      artistLabel,
      born,
      lifespan: pNode ? pNode.data('lifespan') : null,
      color:    pNode ? pNode.data('color')    : null,
      shape:    pNode ? pNode.data('shape')    : null,
      track: {{
        vid:            p.video_id,
        label:          p.display_title,
        year:           p.date ? parseInt(p.date) : null,
        offset_seconds: p.offset_seconds,
      }},
      isStructured: true,
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
    li.dataset.vid = row.track.vid;
    li.className   = playerRegistry.has(row.track.vid) ? 'playing' : '';
    li.title = row.isStructured
      ? `Play from ${{row.track.offset_seconds ? row.track.offset_seconds + 's' : 'start'}}`
      : 'Play';
    li.addEventListener('click', () =>
      openOrFocusPlayer(row.track.vid, row.track.label, row.artistLabel,
                        row.isStructured ? row.track.offset_seconds : undefined));

    const artistSpan = document.createElement('span');
    artistSpan.className = 'trail-artist';

    if (row.color || row.shape) {{
      const shapeIcon = document.createElement('span');
      shapeIcon.className = `trail-shape-icon ${{row.shape || 'ellipse'}}`;
      if ((row.shape || 'ellipse') === 'triangle') {{
        shapeIcon.style.borderBottomColor = row.color || 'var(--gray)';
      }} else {{
        shapeIcon.style.background = row.color || 'var(--gray)';
      }}
      artistSpan.appendChild(shapeIcon);
    }}

    artistSpan.appendChild(document.createTextNode(row.artistLabel));

    const lifespanSpan = document.createElement('span');
    lifespanSpan.className = 'trail-lifespan';
    lifespanSpan.textContent = row.lifespan || '';

    if (row.nodeId) {{
      artistSpan.addEventListener('click', e => {{
        e.stopPropagation();
        cy.elements().removeClass('faded highlighted bani-match');
        applyBaniFilter(type, id);
        const n = cy.getElementById(row.nodeId);
        if (n && n.length) selectNode(n);
      }});
    }}

    // For legacy tracks, resolve composition title from compositions array.
    // For structured tracks, track.label is already the clean display_title.
    let compTitle = row.track.label;
    if (!row.isStructured && row.track.composition_id) {{
      const comp = compositions.find(c => c.id === row.track.composition_id);
      if (comp) compTitle = comp.title;
    }}

    const labelSpan = document.createElement('span');
    labelSpan.className = 'trail-label';
    labelSpan.textContent = compTitle;

    const offsetSecs = row.isStructured ? row.track.offset_seconds : 0;
    const linkA = document.createElement('a');
    linkA.className = 'trail-link';
    linkA.href = ytDirectUrl(row.track.vid, offsetSecs || undefined);
    linkA.target = '_blank';
    linkA.textContent = (offsetSecs > 0)
      ? `${{formatTimestamp(offsetSecs)}} \u2197`
      : `00:00 \u2197`;
    linkA.title = offsetSecs > 0 ? 'Open in YouTube at this timestamp' : 'Open in YouTube';
    linkA.addEventListener('click', e => e.stopPropagation());

    const headerDiv = document.createElement('div');
    headerDiv.className = 'trail-header';
    headerDiv.appendChild(artistSpan);
    headerDiv.appendChild(lifespanSpan);

    const row2Div = document.createElement('div');
    row2Div.className = 'trail-row2';
    row2Div.appendChild(labelSpan);
    row2Div.appendChild(linkA);

    li.appendChild(headerDiv);
    li.appendChild(row2Div);
    trailList.appendChild(li);
  }});

  trail.style.display = rows.length > 0 ? 'block' : 'none';
}}

function clearBaniFilter() {{
  activeBaniFilter = null;
  cy.elements().removeClass('faded highlighted bani-match');
  document.getElementById('bani-search-input').value = '';
  document.getElementById('trail-filter').style.display = 'none';
  document.getElementById('trail-filter').value = '';
  document.getElementById('listening-trail').style.display = 'none';
  applyZoomLabels();
  // Mutual exclusion: clear chip filters when Bani Flow filter clears
  clearAllChipFilters();
}}

// ── shared dropdown helper ────────────────────────────────────────────────────
function makeDropdown(inputEl, dropdownEl, getItems, onSelect) {{
  let activeIdx = -1;

  function renderItems(items) {{
    dropdownEl.innerHTML = '';
    activeIdx = -1;
    if (items.length === 0) {{
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.style.color = 'var(--gray)';
      div.textContent = 'no match';
      dropdownEl.appendChild(div);
      dropdownEl.style.display = 'block';
      return;
    }}
    items.forEach((item, i) => {{
      const div = document.createElement('div');
      div.className = 'search-result-item';
      // primary line
      const primary = document.createElement('div');
      primary.textContent = item.primary;
      if (item.primaryColor) primary.style.color = item.primaryColor;
      div.appendChild(primary);
      // secondary line
      if (item.secondary) {{
        const sec = document.createElement('div');
        sec.className = 'search-result-secondary';
        sec.textContent = item.secondary;
        div.appendChild(sec);
      }}
      div.addEventListener('mousedown', e => {{
        e.preventDefault(); // prevent blur before click
        onSelect(item);
        inputEl.value = '';
        dropdownEl.style.display = 'none';
      }});
      div.addEventListener('mouseover', () => setActive(i));
      dropdownEl.appendChild(div);
    }});
    dropdownEl.style.display = 'block';
  }}

  function setActive(idx) {{
    const items = dropdownEl.querySelectorAll('.search-result-item');
    items.forEach((el, i) => el.classList.toggle('active', i === idx));
    activeIdx = idx;
  }}

  inputEl.addEventListener('input', () => {{
    const q = inputEl.value.trim();
    if (!q) {{ dropdownEl.style.display = 'none'; return; }}
    renderItems(getItems(q));
  }});

  inputEl.addEventListener('keydown', e => {{
    const items = dropdownEl.querySelectorAll('.search-result-item');
    if (e.key === 'ArrowDown') {{
      e.preventDefault();
      setActive(Math.min(activeIdx + 1, items.length - 1));
    }} else if (e.key === 'ArrowUp') {{
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
    }} else if (e.key === 'Enter') {{
      if (activeIdx >= 0 && activeIdx < items.length) {{
        items[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
      }}
    }} else if (e.key === 'Escape') {{
      inputEl.value = '';
      dropdownEl.style.display = 'none';
    }}
  }});

  inputEl.addEventListener('blur', () => {{
    setTimeout(() => {{ dropdownEl.style.display = 'none'; }}, 150);
  }});
}}

// ── musician search ───────────────────────────────────────────────────────────
(function() {{
  const input    = document.getElementById('musician-search-input');
  const dropdown = document.getElementById('musician-search-dropdown');

  function getItems(q) {{
    const ql = q.toLowerCase();
    const results = [];
    cy.nodes().forEach(n => {{
      const d = n.data();
      if (d.label.toLowerCase().includes(ql)) {{
        results.push({{
          id:           d.id,
          primary:      d.label,
          primaryColor: d.color,
          secondary:    [d.lifespan, d.era_label, d.instrument, d.bani]
                          .filter(Boolean).join(' \u00b7 '),
        }});
      }}
    }});
    results.sort((a, b) => a.primary.localeCompare(b.primary));
    return results.slice(0, 8);
  }}

  makeDropdown(input, dropdown, getItems, item => {{
    const node = cy.getElementById(item.id);
    if (!node || !node.length) return;
    selectNode(node);
  }});
}})();

// ── bani flow search ──────────────────────────────────────────────────────────
(function() {{
  const input    = document.getElementById('bani-search-input');
  const dropdown = document.getElementById('bani-search-dropdown');

  function getItems(q) {{
    const ql = q.toLowerCase();
    const results = [];

    // Compositions first
    compositions.forEach(c => {{
      const hasNode = compositionToNodes[c.id] && compositionToNodes[c.id].length > 0;
      const hasPerf = compositionToPerf[c.id]  && compositionToPerf[c.id].length  > 0;
      if ((hasNode || hasPerf) && c.title.toLowerCase().includes(ql)) {{
        results.push({{ type: 'comp', id: c.id, primary: '\u266a ' + c.title, secondary: null }});
      }}
    }});

    // Ragas second
    ragas.forEach(r => {{
      const hasNode = ragaToNodes[r.id] && ragaToNodes[r.id].length > 0;
      const hasPerf = ragaToPerf[r.id]  && ragaToPerf[r.id].length  > 0;
      if ((hasNode || hasPerf) && r.name.toLowerCase().includes(ql)) {{
        results.push({{ type: 'raga', id: r.id, primary: '\u25c8 ' + r.name, secondary: null }});
      }}
    }});

    results.sort((a, b) => a.primary.localeCompare(b.primary));
    return results.slice(0, 10);
  }}

  makeDropdown(input, dropdown, getItems, item => {{
    input.value = item.primary; // show what is active
    applyBaniFilter(item.type, item.id);
  }});
}})();
</script>
</body>
</html>
"""

# ── entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    graph            = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    comp_data        = load_compositions()
    recordings_data  = load_recordings()
    composition_to_nodes, raga_to_nodes = build_composition_lookups(graph, comp_data, recordings_data)
    musician_to_performances, composition_to_performances, raga_to_performances = \
        build_recording_lookups(recordings_data, comp_data)
    elements = build_elements(graph)
    html     = render_html(
        elements, graph, comp_data,
        composition_to_nodes, raga_to_nodes,
        recordings_data,
        musician_to_performances,
        composition_to_performances,
        raga_to_performances,
    )
    OUT_FILE.write_text(html, encoding="utf-8")
    print(f"[RENDERED] {OUT_FILE}  ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges)")

if __name__ == "__main__":
    main()
