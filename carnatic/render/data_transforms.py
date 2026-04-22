"""
carnatic/render/data_transforms.py — Denormalisation and lookup-table builders.
"""
from collections import defaultdict

def build_recording_lookups(recordings_data: dict, comp_data: dict) -> tuple[dict, dict, dict, dict]:
    """
    Build four denormalised lookup dicts from recordings.json:
      musician_to_performances:     {musician_id: [PerformanceRef, ...]}
      composition_to_performances:  {composition_id: [PerformanceRef, ...]}
      raga_to_performances:         {raga_id: [PerformanceRef, ...]}
      perf_to_performances:         {"recording_id::performance_index": [PerformanceRef]}

    Each PerformanceRef is a flat dict carrying everything the UI needs.
    perf_to_performances enables single-performance filtering from the raga wheel.
    """
    comp_raga: dict[str, str] = {
        c["id"]: c["raga_id"] for c in comp_data.get("compositions", [])
    }

    musician_to_performances:    dict[str, list[dict]] = defaultdict(list)
    composition_to_performances: dict[str, list[dict]] = defaultdict(list)
    raga_to_performances:        dict[str, list[dict]] = defaultdict(list)
    perf_to_performances:        dict[str, list[dict]] = defaultdict(list)

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
                    "version":           perf.get("version"),
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

                # Index by single performance key (recording_id::performance_index)
                perf_key = f"{rec_id}::{perf['performance_index']}"
                perf_to_performances[perf_key].append(ref)

    return (
        dict(musician_to_performances),
        dict(composition_to_performances),
        dict(raga_to_performances),
        dict(perf_to_performances),
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


def build_listenable_set(
    graph: dict,
    recordings_data: dict,
    comp_data: dict,
) -> set[str]:
    """
    Return the set of musician node IDs that are "listenable" — i.e. there
    exists at least one recording or composition the user can play from their
    panel.

    A musician is listenable if ANY of the following is true:
      • They have ≥1 legacy youtube[] track on their graph node.
      • They appear as a performer in ≥1 recording session.
      • They are the musician_node_id of a composer who has ≥1 composition.

    This drives two UI features (ADR-055):
      1. graph_view.js dims non-listenable nodes (opacity 0.25).
      2. Trail rows and musician-panel co-performer chips that link to
         non-listenable musicians can be hidden/de-emphasised.
    """
    listenable: set[str] = set()

    # ── 1. Legacy tracks: any node with youtube[] entries ────────────────────
    for node in graph["nodes"]:
        if node.get("youtube"):
            listenable.add(node["id"])

    # ── 2. Structured recordings: any performer across all sessions ──────────
    for rec in recordings_data.get("recordings", []):
        for session in rec.get("sessions", []):
            for pf in session.get("performers", []):
                mid = pf.get("musician_id")
                if mid:
                    listenable.add(mid)

    # ── 3. Composers with ≥1 composition whose musician_node_id is set ───────
    comp_by_composer: dict[str, int] = {}
    for comp in comp_data.get("compositions", []):
        cid = comp.get("composer_id")
        if cid:
            comp_by_composer[cid] = comp_by_composer.get(cid, 0) + 1

    # Map composer_id → musician_node_id
    composer_to_node: dict[str, str] = {}
    for composer in comp_data.get("composers", []):
        mid = composer.get("musician_node_id")
        if mid:
            composer_to_node[composer["id"]] = mid

    for composer_id, count in comp_by_composer.items():
        if count > 0 and composer_id in composer_to_node:
            listenable.add(composer_to_node[composer_id])

    return listenable
