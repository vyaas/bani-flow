"""
carnatic/render/graph_builder.py — Cytoscape element construction.

Visual constants (ERA_COLORS, ERA_LABELS, INSTRUMENT_SHAPES, NODE_SIZES,
ERA_FONT_SIZES) are imported from theme.py — the single source of truth.
Implements ADR-028: Design Token Single Source of Truth.
"""
from collections import defaultdict
from .data_loaders import yt_video_id
from .theme import ERA_COLORS, ERA_LABELS, INSTRUMENT_SHAPES, NODE_SIZES, ERA_FONT_SIZES, TOKENS

def build_elements(graph: dict, listenable_set: set | None = None,
                   composer_node_map: dict | None = None) -> list[dict]:
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
        # ADR-074: per-node label chip tokens — era colour for musicians,
        # dark fallback (labelOutline) for non-musician nodes (no 'era' key).
        _era_raw = node.get("era")
        _label_chip = ERA_COLORS.get(_era_raw, TOKENS["labelOutline"]) if _era_raw else TOKENS["labelOutline"]
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
                    "tala":           t.get("tala"),
                    "performers":     t.get("performers", []),  # ADR-070
                })

        # Sources: new schema (sources array) with legacy fallback
        raw_sources = node.get("sources", [])
        if not raw_sources and node.get("wikipedia"):
            raw_sources = [{"url": node["wikipedia"], "label": "Wikipedia", "type": "wikipedia"}]
        primary_url = raw_sources[0]["url"] if raw_sources else ""

        # ADR-055: listenable flag; ADR-057: composer flag and composer_id
        node_id_local = node["id"]
        is_listenable = bool(listenable_set is None or node_id_local in listenable_set)
        # is_composer: this musician node is the canonical node for a composer
        composer_id_local = None
        if composer_node_map:
            composer_id_local = composer_node_map.get(node_id_local)
        is_composer = bool(composer_id_local)

        elements.append({"data": {
            "id":           node_id_local,
            "label":        node["label"],
            "url":          primary_url,
            "sources":      raw_sources,
            "era":          era,
            "era_label":    ERA_LABELS.get(era, era),
            "instrument":   instr,
            "bani":         node.get("bani", ""),
            "lifespan":     lifespan,
            "born":         node.get("born"),
            "color":        color,
            "label_outline": _label_chip,
            "label_bg":      _label_chip,
            "shape":        shape,
            "size":         size,
            "degree":       deg,
            "label_tier":   label_tier,
            "font_size":    font_size,
            "font_weight":  font_weight,
            "tracks":       tracks,
            "is_listenable": 1 if is_listenable else 0,
            "is_composer":   1 if is_composer else 0,
            "composer_id":   composer_id_local,
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

    # ── ADR-070: cross-link accompanist youtube tracks ────────────────────────
    # When a host's youtube[] entry carries performers[], surface that track on
    # each accompanist's musician panel too. The synthesized track carries a
    # `host_id` marker so the Bani Flow row builder can keep the lead musician
    # as the primary attribution and never let the accompanist usurp it.
    node_data_by_id = {
        e["data"]["id"]: e["data"]
        for e in elements
        if not e["data"].get("source")
    }
    for host in graph["nodes"]:
        host_id = host["id"]
        for yt in host.get("youtube", []):
            performers = yt.get("performers") or []
            if not performers:
                continue
            vid = yt_video_id(yt.get("url", ""))
            if not vid:
                continue
            for pf in performers:
                mid = pf.get("musician_id")
                if not mid or mid == host_id:
                    continue
                target = node_data_by_id.get(mid)
                if not target:
                    continue
                target_tracks = target.setdefault("tracks", [])
                # Skip if already present (host's own iteration covered it, or
                # this performer is also in the same track twice)
                if any(t.get("vid") == vid and t.get("host_id") == host_id
                       for t in target_tracks):
                    continue
                target_tracks.append({
                    "vid":            vid,
                    "label":          yt.get("label", vid),
                    "composition_id": yt.get("composition_id"),
                    "raga_id":        yt.get("raga_id"),
                    "year":           yt.get("year"),
                    "version":        yt.get("version"),
                    "tala":           yt.get("tala"),
                    "performers":     performers,
                    "host_id":        host_id,
                })

    return elements
