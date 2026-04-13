"""
carnatic/render/graph_builder.py — Cytoscape element construction.

Visual constants (ERA_COLORS, ERA_LABELS, INSTRUMENT_SHAPES, NODE_SIZES,
ERA_FONT_SIZES) are imported from theme.py — the single source of truth.
Implements ADR-028: Design Token Single Source of Truth.
"""
from collections import defaultdict
from .data_loaders import yt_video_id
from .theme import ERA_COLORS, ERA_LABELS, INSTRUMENT_SHAPES, NODE_SIZES, ERA_FONT_SIZES, TOKENS

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
        color    = ERA_COLORS.get(era, TOKENS["fgMuted"])
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
                    "version":        t.get("version"),
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
