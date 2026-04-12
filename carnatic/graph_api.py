#!/usr/bin/env python3
"""
graph_api.py — Phase 2 of ADR-013.

Immutable in-memory representation of the Carnatic knowledge graph.
Loaded once from graph.json + recordings/*.json.
All methods are pure (no side effects, no I/O after __init__).

Usage (as a library):
    from carnatic.graph_api import CarnaticGraph
    from pathlib import Path

    g = CarnaticGraph(Path("carnatic/data/graph.json"))
    print(g.get_gurus_of("madurai_mani_iyer"))

Usage (as a CLI query tool):
    python3 carnatic/graph_api.py --musician madurai_mani_iyer
    python3 carnatic/graph_api.py --recordings-for lalgudi_jayaraman
    python3 carnatic/graph_api.py --concert jamshedpur_1961_madurai_mani_iyer
    python3 carnatic/graph_api.py --bani-flow maakelara_vicaaramu
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path


# ── CarnaticGraph ──────────────────────────────────────────────────────────────

class CarnaticGraph:
    """
    Immutable in-memory representation of the Carnatic knowledge graph.

    Loaded once from graph.json + recordings/*.json.
    All methods after __init__ are pure lookups — no file I/O, no mutation.

    Recording files are loaded lazily on first access and cached.
    """

    def __init__(self, graph_json_path: Path) -> None:
        raw = json.loads(graph_json_path.read_text(encoding="utf-8"))

        # ── musician graph ─────────────────────────────────────────────────────
        m = raw.get("musicians", {})
        self._musician_nodes: list[dict] = m.get("nodes", [])
        self._musician_edges: list[dict] = m.get("edges", [])

        # ── composition data ───────────────────────────────────────────────────
        c = raw.get("compositions", {})
        self._ragas:        list[dict] = c.get("ragas", [])
        self._composers:    list[dict] = c.get("composers", [])
        self._compositions: list[dict] = c.get("compositions", [])

        # ── recording refs (index) ─────────────────────────────────────────────
        self._recording_refs: list[dict] = raw.get("recording_refs", [])

        # ── base path for resolving recording file paths ───────────────────────
        self._data_dir: Path = graph_json_path.parent

        # ── lazy cache: recording_id → full recording dict ────────────────────
        self._recording_cache: dict[str, dict] = {}

        # ── pre-build fast-lookup indices ──────────────────────────────────────
        self._musician_by_id:    dict[str, dict] = {n["id"]: n for n in self._musician_nodes}
        self._raga_by_id:        dict[str, dict] = {r["id"]: r for r in self._ragas}
        self._composer_by_id:    dict[str, dict] = {c["id"]: c for c in self._composers}
        self._composition_by_id: dict[str, dict] = {c["id"]: c for c in self._compositions}
        self._recording_ref_by_id: dict[str, dict] = {r["id"]: r for r in self._recording_refs}

        # guru→[shishya_ids], shishya→[guru_ids]
        self._shishyas_of: dict[str, list[str]] = defaultdict(list)
        self._gurus_of:    dict[str, list[str]] = defaultdict(list)
        for edge in self._musician_edges:
            src, tgt = edge["source"], edge["target"]
            self._shishyas_of[src].append(tgt)
            self._gurus_of[tgt].append(src)

    # ── internal: lazy recording loader ───────────────────────────────────────

    def _load_recording(self, recording_id: str) -> dict | None:
        if recording_id in self._recording_cache:
            return self._recording_cache[recording_id]
        ref = self._recording_ref_by_id.get(recording_id)
        if ref is None:
            return None
        path = self._data_dir / ref["path"]
        if not path.exists():
            return None
        rec = json.loads(path.read_text(encoding="utf-8"))
        self._recording_cache[recording_id] = rec
        return rec

    def _all_recordings_loaded(self) -> list[dict]:
        """Load and cache all recording files; return list of full recording dicts."""
        result = []
        for ref in self._recording_refs:
            rec = self._load_recording(ref["id"])
            if rec is not None:
                result.append(rec)
        return result

    # ── Musician traversal ─────────────────────────────────────────────────────

    def get_musician(self, musician_id: str) -> dict | None:
        """Return the musician node dict for the given id, or None."""
        return self._musician_by_id.get(musician_id)

    def get_all_musicians(self) -> list[dict]:
        """Return all musician nodes."""
        return list(self._musician_nodes)

    def get_gurus_of(self, musician_id: str) -> list[dict]:
        """Return all musician nodes that are gurus of the given musician."""
        return [
            self._musician_by_id[mid]
            for mid in self._gurus_of.get(musician_id, [])
            if mid in self._musician_by_id
        ]

    def get_shishyas_of(self, musician_id: str) -> list[dict]:
        """Return all musician nodes that are shishyas of the given musician."""
        return [
            self._musician_by_id[mid]
            for mid in self._shishyas_of.get(musician_id, [])
            if mid in self._musician_by_id
        ]

    def get_lineage_chain(self, musician_id: str, depth: int = 5) -> list[dict]:
        """
        Walk the guru chain upward from musician_id for up to `depth` hops.
        Returns a list of musician dicts from the given musician up to the root,
        in ascending order (musician first, oldest ancestor last).
        Stops at the first node with no gurus or when depth is exhausted.
        Cycles are broken by tracking visited ids.
        """
        chain: list[dict] = []
        visited: set[str] = set()
        current_id = musician_id
        for _ in range(depth + 1):
            if current_id in visited:
                break
            node = self._musician_by_id.get(current_id)
            if node is None:
                break
            chain.append(node)
            visited.add(current_id)
            gurus = self._gurus_of.get(current_id, [])
            if not gurus:
                break
            # Follow the first (highest-confidence) guru edge
            current_id = gurus[0]
        return chain

    def get_musicians_by_era(self, era: str) -> list[dict]:
        """Return all musician nodes with the given era value."""
        return [n for n in self._musician_nodes if n.get("era") == era]

    def get_musicians_by_instrument(self, instrument: str) -> list[dict]:
        """Return all musician nodes with the given instrument value."""
        return [n for n in self._musician_nodes if n.get("instrument") == instrument]

    def get_musicians_by_bani(self, bani: str) -> list[dict]:
        """Return all musician nodes with the given bani value."""
        return [n for n in self._musician_nodes if n.get("bani") == bani]

    def get_all_edges(self) -> list[dict]:
        """Return all guru-shishya edges."""
        return list(self._musician_edges)

    # ── Recording traversal ────────────────────────────────────────────────────

    def get_recording(self, recording_id: str) -> dict | None:
        """Return the full recording dict for the given id, or None."""
        return self._load_recording(recording_id)

    def get_all_recordings(self) -> list[dict]:
        """Return all full recording dicts (loads all recording files)."""
        return self._all_recordings_loaded()

    def get_all_recording_refs(self) -> list[dict]:
        """Return the lightweight recording_refs index (no file I/O)."""
        return list(self._recording_refs)

    def get_recordings_for_musician(self, musician_id: str) -> list[dict]:
        """
        Return all full recording dicts in which the given musician appears
        as a performer in any session.
        """
        result = []
        for ref in self._recording_refs:
            if musician_id in ref.get("primary_musician_ids", []):
                rec = self._load_recording(ref["id"])
                if rec is not None:
                    result.append(rec)
        return result

    def get_performances_for_musician(self, musician_id: str) -> list[dict]:
        """
        Return a flat list of PerformanceRef dicts for every performance
        in which the given musician appears as a performer.

        Each PerformanceRef carries: recording_id, video_id, title,
        short_title, date, session_index, performance_index, timestamp,
        offset_seconds, display_title, composition_id, raga_id, tala,
        composer_id, notes, type, performers.
        """
        result = []
        for rec in self.get_recordings_for_musician(musician_id):
            for session in rec.get("sessions", []):
                performers = session.get("performers", [])
                # Only include sessions where this musician actually performs
                if not any(p.get("musician_id") == musician_id for p in performers):
                    continue
                for perf in session.get("performances", []):
                    result.append(self._make_perf_ref(rec, session, perf, performers))
        return result

    def get_recordings_for_composition(self, composition_id: str) -> list[dict]:
        """Return all full recording dicts that contain a performance of the given composition."""
        result = []
        for rec in self._all_recordings_loaded():
            for session in rec.get("sessions", []):
                for perf in session.get("performances", []):
                    if perf.get("composition_id") == composition_id:
                        result.append(rec)
                        break
                else:
                    continue
                break
        return result

    def get_recordings_for_raga(self, raga_id: str) -> list[dict]:
        """Return all full recording dicts that contain a performance in the given raga."""
        result = []
        for rec in self._all_recordings_loaded():
            for session in rec.get("sessions", []):
                for perf in session.get("performances", []):
                    if perf.get("raga_id") == raga_id:
                        result.append(rec)
                        break
                else:
                    continue
                break
        return result

    # ── Composition traversal ──────────────────────────────────────────────────

    def get_composition(self, composition_id: str) -> dict | None:
        """Return the composition dict for the given id, or None."""
        return self._composition_by_id.get(composition_id)

    def get_all_compositions(self) -> list[dict]:
        """Return all composition dicts."""
        return list(self._compositions)

    def get_raga(self, raga_id: str) -> dict | None:
        """Return the raga dict for the given id, or None."""
        return self._raga_by_id.get(raga_id)

    def get_all_ragas(self) -> list[dict]:
        """Return all raga dicts."""
        return list(self._ragas)

    def get_composer(self, composer_id: str) -> dict | None:
        """Return the composer dict for the given id, or None."""
        return self._composer_by_id.get(composer_id)

    def get_all_composers(self) -> list[dict]:
        """Return all composer dicts."""
        return list(self._composers)

    def get_compositions_by_raga(self, raga_id: str) -> list[dict]:
        """Return all compositions in the given raga."""
        return [c for c in self._compositions if c.get("raga_id") == raga_id]

    def get_compositions_by_composer(self, composer_id: str) -> list[dict]:
        """Return all compositions by the given composer."""
        return [c for c in self._compositions if c.get("composer_id") == composer_id]

    def get_musicians_who_performed(self, composition_id: str) -> list[dict]:
        """
        Return all musician nodes who appear as performers in any recording
        that contains a performance of the given composition.
        """
        musician_ids: set[str] = set()
        for rec in self._all_recordings_loaded():
            for session in rec.get("sessions", []):
                for perf in session.get("performances", []):
                    if perf.get("composition_id") == composition_id:
                        for pf in session.get("performers", []):
                            mid = pf.get("musician_id")
                            if mid:
                                musician_ids.add(mid)
        # Also check legacy youtube[] entries on musician nodes
        for node in self._musician_nodes:
            for yt in node.get("youtube", []):
                if yt.get("composition_id") == composition_id:
                    musician_ids.add(node["id"])
        return [
            self._musician_by_id[mid]
            for mid in musician_ids
            if mid in self._musician_by_id
        ]

    def get_musicians_who_performed_raga(self, raga_id: str) -> list[dict]:
        """
        Return all musician nodes who appear as performers in any recording
        that contains a performance in the given raga.
        Also includes musicians with youtube[] entries tagged with this raga.
        """
        musician_ids: set[str] = set()
        for rec in self._all_recordings_loaded():
            for session in rec.get("sessions", []):
                for perf in session.get("performances", []):
                    if perf.get("raga_id") == raga_id:
                        for pf in session.get("performers", []):
                            mid = pf.get("musician_id")
                            if mid:
                                musician_ids.add(mid)
        # Also check legacy youtube[] entries
        for node in self._musician_nodes:
            for yt in node.get("youtube", []):
                if yt.get("raga_id") == raga_id:
                    musician_ids.add(node["id"])
        return [
            self._musician_by_id[mid]
            for mid in musician_ids
            if mid in self._musician_by_id
        ]

    # ── Cross-domain traversal ─────────────────────────────────────────────────

    # Labels that should never appear as co-performer names in the output
    _UNKNOWN_LABELS: frozenset[str] = frozenset({"Unknown", "Unidentified artiste", "?"})

    def get_bani_flow(self, composition_id: str) -> list[dict]:
        """
        Return a chronologically sorted list of deduplicated PerformanceRef dicts
        for the given composition, across all recordings and all musicians.

        Each entry represents one distinct performance event. Co-performers are
        listed in the ``co_performers`` field (all performers except the primary).

        Deduplication key:
          - Structured recordings: ``(recording_id, session_index, performance_index)``
          - Legacy youtube[] entries: ``(video_id, offset_seconds)``

        Entries without a date sort last.
        """
        raw_refs: list[dict] = []

        # ── Structured recordings ──────────────────────────────────────────────
        for rec in self._all_recordings_loaded():
            for session in rec.get("sessions", []):
                performers = session.get("performers", [])
                for perf in session.get("performances", []):
                    if perf.get("composition_id") == composition_id:
                        ref = self._make_perf_ref(rec, session, perf, performers)
                        ref["_perf_key"] = (
                            f"{ref['recording_id']}::{ref['session_index']}"
                            f"::{ref['performance_index']}"
                        )
                        # Identify primary performer (vocal or first)
                        primary = next(
                            (p for p in performers if p.get("role") == "vocal"),
                            performers[0] if performers else None,
                        )
                        ref["_primary_musician_id"] = (
                            primary.get("musician_id") if primary else None
                        )
                        raw_refs.append(ref)

        # ── Legacy youtube[] entries ───────────────────────────────────────────
        for node in self._musician_nodes:
            for yt in node.get("youtube", []):
                if yt.get("composition_id") == composition_id:
                    vid    = self._yt_video_id(yt.get("url", ""))
                    offset = 0
                    ref = {
                        "recording_id":      None,
                        "video_id":          vid,
                        "title":             yt.get("label", ""),
                        "short_title":       yt.get("label", ""),
                        "date":              str(yt.get("year", "")),
                        "session_index":     None,
                        "performance_index": None,
                        "timestamp":         None,
                        "offset_seconds":    offset,
                        "display_title":     yt.get("label", ""),
                        "composition_id":    composition_id,
                        "raga_id":           yt.get("raga_id"),
                        "tala":              None,
                        "composer_id":       None,
                        "notes":             None,
                        "type":              "youtube_legacy",
                        "performers":        [{"musician_id": node["id"], "role": node.get("instrument", "vocal")}],
                        "version":           yt.get("version"),
                        "_perf_key":         f"{vid}::{offset}",
                        "_primary_musician_id": node["id"],
                    }
                    raw_refs.append(ref)

        # ── Deduplicate by _perf_key ───────────────────────────────────────────
        seen: dict[str, dict] = {}
        for ref in raw_refs:
            key = ref["_perf_key"]
            if key not in seen:
                seen[key] = ref
                seen[key].setdefault("co_performers", [])
            else:
                existing = seen[key]
                primary_id = existing.get("_primary_musician_id")
                for pf in ref.get("performers", []):
                    mid = pf.get("musician_id")
                    if mid == primary_id:
                        continue
                    already = any(
                        cp.get("musician_id") == mid
                        for cp in existing["co_performers"]
                    )
                    if not already:
                        node_label = (
                            self._musician_by_id.get(mid, {}).get("label")
                            if mid else None
                        )
                        label = node_label or pf.get("unmatched_name", "?")
                        if label not in self._UNKNOWN_LABELS:
                            existing["co_performers"].append({
                                "musician_id": mid,
                                "label":       label,
                                "role":        pf.get("role"),
                            })

        # For structured recordings: build co_performers from performers[] directly
        for ref in seen.values():
            if ref.get("recording_id") is not None:  # structured
                primary_id = ref.get("_primary_musician_id")
                ref["co_performers"] = []
                for pf in ref.get("performers", []):
                    mid = pf.get("musician_id")
                    if mid == primary_id:
                        continue
                    node_label = (
                        self._musician_by_id.get(mid, {}).get("label")
                        if mid else None
                    )
                    label = node_label or pf.get("unmatched_name")
                    if not label or label in self._UNKNOWN_LABELS:
                        continue
                    ref["co_performers"].append({
                        "musician_id": mid,
                        "label":       label,
                        "role":        pf.get("role"),
                    })

        # ── Strip internal keys and sort ──────────────────────────────────────
        result = []
        for ref in seen.values():
            ref.pop("_perf_key", None)
            ref.pop("_primary_musician_id", None)
            result.append(ref)

        def sort_key(r: dict) -> str:
            return r.get("date") or "9999"

        return sorted(result, key=sort_key)

    def get_concert_programme(self, recording_id: str) -> dict | None:
        """
        Return a structured programme dict:
          {
            "recording": <recording metadata>,
            "sessions": [
              {
                "session_index": int,
                "performers": [...],
                "performances": [
                  {
                    ...performance fields...,
                    "composition": <resolved composition dict or None>,
                    "raga":        <resolved raga dict or None>,
                    "composer":    <resolved composer dict or None>,
                  }
                ]
              }
            ]
          }
        Returns None if the recording_id is not found.
        """
        rec = self._load_recording(recording_id)
        if rec is None:
            return None

        sessions_out = []
        for session in rec.get("sessions", []):
            perfs_out = []
            for perf in session.get("performances", []):
                comp_id     = perf.get("composition_id")
                raga_id     = perf.get("raga_id")
                composer_id = perf.get("composer_id")
                perfs_out.append({
                    **perf,
                    "composition": self._composition_by_id.get(comp_id) if comp_id else None,
                    "raga":        self._raga_by_id.get(raga_id) if raga_id else None,
                    "composer":    self._composer_by_id.get(composer_id) if composer_id else None,
                })
            sessions_out.append({
                "session_index": session["session_index"],
                "performers":    session.get("performers", []),
                "performances":  perfs_out,
            })

        return {
            "recording": {k: v for k, v in rec.items() if k != "sessions"},
            "sessions":  sessions_out,
        }

    # ── Concert-bracket queries (ADR-018) ─────────────────────────────────────

    def get_concerts_for_musician(self, musician_id: str) -> list[dict]:
        """
        Return a list of concert bracket dicts for the given musician.

        Each dict:
          {
            "recording_id": str,
            "title":        str,
            "short_title":  str,
            "date":         str | None,
            "sessions": [
              {
                "session_index": int,
                "performers":    [...],
                "performances":  [...],   # PerformanceRef list
              }
            ]
          }

        Only sessions in which the musician appears are included.
        Concerts are sorted chronologically by date (nulls last).
        """
        if not self.get_musician(musician_id):
            return []

        concert_map: dict[str, dict] = {}
        for rec in self.get_recordings_for_musician(musician_id):
            rid = rec["id"]
            for session in rec.get("sessions", []):
                performers = session.get("performers", [])
                if not any(p.get("musician_id") == musician_id for p in performers):
                    continue
                if rid not in concert_map:
                    concert_map[rid] = {
                        "recording_id": rid,
                        "title":        rec.get("title", ""),
                        "short_title":  rec.get("short_title", ""),
                        "date":         rec.get("date"),
                        "sessions":     [],
                    }
                perfs = [
                    self._make_perf_ref(rec, session, p, performers)
                    for p in session.get("performances", [])
                ]
                concert_map[rid]["sessions"].append({
                    "session_index": session["session_index"],
                    "performers":    performers,
                    "performances":  perfs,
                })

        def _year(c: dict) -> int:
            d = c.get("date")
            try:
                return int(str(d)[:4]) if d else 9999
            except (ValueError, TypeError):
                return 9999

        concerts = sorted(concert_map.values(), key=_year)
        for c in concerts:
            c["sessions"].sort(key=lambda s: s["session_index"])
        return concerts

    def get_co_performers_of(self, musician_id: str) -> list[dict]:
        """
        Return a deduplicated list of co-performer dicts for the given musician.

        Each dict:
          {
            "musician_id":   str | None,
            "label":         str,
            "role":          str,
            "recording_ids": list[str],
          }

        Sorted: matched musicians first (by label), then unmatched (by name).
        The given musician is excluded from their own list.
        """
        if not self.get_musician(musician_id):
            return []

        # key → {musician_id, label, role, recording_ids set}
        seen: dict[str, dict] = {}

        for rec in self.get_recordings_for_musician(musician_id):
            rid = rec["id"]
            for session in rec.get("sessions", []):
                performers = session.get("performers", [])
                if not any(p.get("musician_id") == musician_id for p in performers):
                    continue
                for pf in performers:
                    mid = pf.get("musician_id")
                    if mid == musician_id:
                        continue
                    unmatched = pf.get("unmatched_name", "")
                    key = mid if mid else ("_" + (unmatched or "?"))
                    if key not in seen:
                        if mid:
                            node = self._musician_by_id.get(mid)
                            label = node.get("label", mid) if node else mid
                        else:
                            label = unmatched or "?"
                        seen[key] = {
                            "musician_id":   mid,
                            "label":         label,
                            "role":          pf.get("role", ""),
                            "recording_ids": set(),
                        }
                    seen[key]["recording_ids"].add(rid)

        result = []
        for entry in seen.values():
            result.append({
                "musician_id":   entry["musician_id"],
                "label":         entry["label"],
                "role":          entry["role"],
                "recording_ids": sorted(entry["recording_ids"]),
            })

        # Matched first (by label), then unmatched (by label/name)
        result.sort(key=lambda x: (0 if x["musician_id"] else 1, x["label"].lower()))
        return result

    def get_concerts_with(self, musician_id_a: str, musician_id_b: str) -> list[dict]:
        """
        Return concert bracket dicts (same shape as get_concerts_for_musician)
        for concerts where both musicians appear in the SAME session.

        Only sessions containing both musicians are included.
        Sorted chronologically.
        """
        # Collect recording_ids where musician_a appears
        recs_a = {rec["id"]: rec for rec in self.get_recordings_for_musician(musician_id_a)}

        concert_map: dict[str, dict] = {}
        for rid, rec in recs_a.items():
            for session in rec.get("sessions", []):
                performers = session.get("performers", [])
                ids_in_session = {p.get("musician_id") for p in performers}
                if musician_id_a not in ids_in_session:
                    continue
                if musician_id_b not in ids_in_session:
                    continue
                if rid not in concert_map:
                    concert_map[rid] = {
                        "recording_id": rid,
                        "title":        rec.get("title", ""),
                        "short_title":  rec.get("short_title", ""),
                        "date":         rec.get("date"),
                        "sessions":     [],
                    }
                perfs = [
                    self._make_perf_ref(rec, session, p, performers)
                    for p in session.get("performances", [])
                ]
                concert_map[rid]["sessions"].append({
                    "session_index": session["session_index"],
                    "performers":    performers,
                    "performances":  perfs,
                })

        def _year(c: dict) -> int:
            d = c.get("date")
            try:
                return int(str(d)[:4]) if d else 9999
            except (ValueError, TypeError):
                return 9999

        concerts = sorted(concert_map.values(), key=_year)
        for c in concerts:
            c["sessions"].sort(key=lambda s: s["session_index"])
        return concerts

    # ── internal helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _make_perf_ref(rec: dict, session: dict, perf: dict, performers: list[dict]) -> dict:
        return {
            "recording_id":      rec["id"],
            "video_id":          rec.get("video_id"),
            "title":             rec.get("title", ""),
            "short_title":       rec.get("short_title", ""),
            "date":              rec.get("date", ""),
            "session_index":     session["session_index"],
            "performance_index": perf["performance_index"],
            "timestamp":         perf.get("timestamp", ""),
            "offset_seconds":    perf.get("offset_seconds", 0),
            "display_title":     perf.get("display_title", ""),
            "composition_id":    perf.get("composition_id"),
            "raga_id":           perf.get("raga_id"),
            "tala":              perf.get("tala"),
            "composer_id":       perf.get("composer_id"),
            "notes":             perf.get("notes"),
            "type":              perf.get("type"),
            "performers":        performers,
            "version":           perf.get("version"),
        }

    @staticmethod
    def _yt_video_id(url: str) -> str | None:
        import re
        m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
        return m.group(1) if m else None


# ── CLI entry point ────────────────────────────────────────────────────────────

def _default_graph_path() -> Path:
    return Path(__file__).parent / "data" / "graph.json"


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Query the Carnatic knowledge graph via CarnaticGraph API."
    )
    parser.add_argument("--graph", default=str(_default_graph_path()),
                        help="Path to graph.json (default: carnatic/data/graph.json)")
    parser.add_argument("--musician",          metavar="ID", help="Print musician node")
    parser.add_argument("--gurus-of",          metavar="ID", help="Print gurus of musician")
    parser.add_argument("--shishyas-of",       metavar="ID", help="Print shishyas of musician")
    parser.add_argument("--lineage",           metavar="ID", help="Print lineage chain upward")
    parser.add_argument("--recordings-for",    metavar="ID", help="Print recordings for musician")
    parser.add_argument("--concert",           metavar="ID", help="Print concert programme")
    parser.add_argument("--bani-flow",         metavar="ID", help="Print bani flow for composition")
    parser.add_argument("--composition",       metavar="ID", help="Print composition")
    parser.add_argument("--raga",              metavar="ID", help="Print raga")
    parser.add_argument("--stats",             action="store_true", help="Print graph statistics")
    args = parser.parse_args()

    g = CarnaticGraph(Path(args.graph))

    def dump(obj: object) -> None:
        print(json.dumps(obj, indent=2, ensure_ascii=False))

    if args.stats:
        print(f"Musicians:    {len(g.get_all_musicians())}")
        print(f"Edges:        {len(g.get_all_edges())}")
        print(f"Ragas:        {len(g.get_all_ragas())}")
        print(f"Composers:    {len(g.get_all_composers())}")
        print(f"Compositions: {len(g.get_all_compositions())}")
        print(f"Recordings:   {len(g.get_all_recording_refs())}")
    elif args.musician:
        dump(g.get_musician(args.musician))
    elif args.gurus_of:
        dump(g.get_gurus_of(args.gurus_of))
    elif args.shishyas_of:
        dump(g.get_shishyas_of(args.shishyas_of))
    elif args.lineage:
        dump(g.get_lineage_chain(args.lineage))
    elif args.recordings_for:
        recs = g.get_recordings_for_musician(args.recordings_for)
        dump([{"id": r["id"], "title": r["title"], "date": r.get("date")} for r in recs])
    elif args.concert:
        dump(g.get_concert_programme(args.concert))
    elif args.bani_flow:
        dump(g.get_bani_flow(args.bani_flow))
    elif args.composition:
        dump(g.get_composition(args.composition))
    elif args.raga:
        dump(g.get_raga(args.raga))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
