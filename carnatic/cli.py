#!/usr/bin/env python3
"""
cli.py — Librarian orientation CLI (ADR-014).

Thin wrapper over CarnaticGraph. All subcommands are read-only.
Exit 0 = found/valid. Exit 1 = not found/invalid/errors.

Usage:
    python3 carnatic/cli.py stats
    python3 carnatic/cli.py musician-exists   <id_or_label>
    python3 carnatic/cli.py raga-exists       <id_or_name>
    python3 carnatic/cli.py composition-exists <id_or_title>
    python3 carnatic/cli.py recording-exists  <id_or_title>
    python3 carnatic/cli.py url-exists        <youtube_url>
    python3 carnatic/cli.py get-musician      <id>  [--json]
    python3 carnatic/cli.py get-raga          <id>  [--json]
    python3 carnatic/cli.py get-composition   <id>  [--json]
    python3 carnatic/cli.py gurus-of          <musician_id>
    python3 carnatic/cli.py shishyas-of       <musician_id>
    python3 carnatic/cli.py lineage           <musician_id>
    python3 carnatic/cli.py recordings-for    <musician_id>
    python3 carnatic/cli.py compositions-in-raga <raga_id>
    python3 carnatic/cli.py validate
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# ── path bootstrap ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from carnatic.graph_api import CarnaticGraph  # noqa: E402


# ── helpers ────────────────────────────────────────────────────────────────────

def _default_graph_path() -> Path:
    return Path(__file__).parent / "data" / "graph.json"


def _load_graph() -> CarnaticGraph:
    return CarnaticGraph(_default_graph_path())


def _yt_video_id(url: str) -> str | None:
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def _dump(obj: object) -> None:
    print(json.dumps(obj, indent=2, ensure_ascii=False))


def _fuzzy_match_musician(g: CarnaticGraph, query: str) -> dict | None:
    """Match query against musician id (exact) or label (case-insensitive substring)."""
    # Exact id match first
    node = g.get_musician(query)
    if node:
        return node
    # Case-insensitive label substring
    q = query.lower()
    for n in g.get_all_musicians():
        if q in n.get("label", "").lower():
            return n
    return None


def _fuzzy_match_raga(g: CarnaticGraph, query: str) -> dict | None:
    """Match query against raga id (exact), name, or aliases (case-insensitive)."""
    raga = g.get_raga(query)
    if raga:
        return raga
    q = query.lower()
    for r in g.get_all_ragas():
        if q in r.get("name", "").lower():
            return r
        for alias in r.get("aliases", []):
            if q in alias.lower():
                return r
    return None


def _fuzzy_match_composition(g: CarnaticGraph, query: str) -> dict | None:
    """Match query against composition id (exact) or title (case-insensitive substring)."""
    comp = g.get_composition(query)
    if comp:
        return comp
    q = query.lower()
    for c in g.get_all_compositions():
        if q in c.get("title", "").lower():
            return c
    return None


def _fuzzy_match_recording(g: CarnaticGraph, query: str) -> dict | None:
    """Match query against recording ref id (exact) or title (case-insensitive substring)."""
    q = query.lower()
    for ref in g.get_all_recording_refs():
        if ref["id"] == query:
            return ref
        if q in ref.get("title", "").lower():
            return ref
    return None


# ── subcommands ────────────────────────────────────────────────────────────────

def cmd_stats(g: CarnaticGraph, _args: list[str]) -> int:
    print(f"Musicians:    {len(g.get_all_musicians())}")
    print(f"Edges:        {len(g.get_all_edges())}")
    print(f"Ragas:        {len(g.get_all_ragas())}")
    print(f"Composers:    {len(g.get_all_composers())}")
    print(f"Compositions: {len(g.get_all_compositions())}")
    print(f"Recordings:   {len(g.get_all_recording_refs())}")
    return 0


def cmd_musician_exists(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: musician-exists <id_or_label>", file=sys.stderr)
        return 1
    query = " ".join(args)
    node = _fuzzy_match_musician(g, query)
    if node:
        print(
            f"FOUND  {node['id']}  \"{node.get('label', '')}\"  "
            f"{node.get('era', '')}  {node.get('instrument', '')}"
        )
        return 0
    print(f"NOT FOUND  \"{query}\"")
    return 1


def cmd_raga_exists(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: raga-exists <id_or_name>", file=sys.stderr)
        return 1
    query = " ".join(args)
    raga = _fuzzy_match_raga(g, query)
    if raga:
        aliases = raga.get("aliases", [])
        alias_str = f"  aliases: {aliases}" if aliases else ""
        print(
            f"FOUND  {raga['id']}  \"{raga.get('name', '')}\"  "
            f"melakarta: {raga.get('melakarta')}{alias_str}"
        )
        return 0
    print(f"NOT FOUND  \"{query}\"")
    return 1


def cmd_composition_exists(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: composition-exists <id_or_title>", file=sys.stderr)
        return 1
    query = " ".join(args)
    comp = _fuzzy_match_composition(g, query)
    if comp:
        print(
            f"FOUND  {comp['id']}  \"{comp.get('title', '')}\"  "
            f"raga: {comp.get('raga_id')}  composer: {comp.get('composer_id')}"
        )
        return 0
    print(f"NOT FOUND  \"{query}\"")
    return 1


def cmd_recording_exists(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: recording-exists <id_or_title>", file=sys.stderr)
        return 1
    query = " ".join(args)
    ref = _fuzzy_match_recording(g, query)
    if ref:
        print(
            f"FOUND  {ref['id']}  \"{ref.get('title', '')}\"  "
            f"date: {ref.get('date', 'unknown')}"
        )
        return 0
    print(f"NOT FOUND  \"{query}\"")
    return 1


def cmd_url_exists(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: url-exists <youtube_url>", file=sys.stderr)
        return 1
    url = args[0]
    video_id = _yt_video_id(url)
    if not video_id:
        print(f"ERROR: could not extract video ID from URL: {url}", file=sys.stderr)
        return 1

    # Check recording refs (structured recordings)
    for ref in g.get_all_recording_refs():
        rec = g.get_recording(ref["id"])
        if rec and rec.get("video_id") == video_id:
            print(f"FOUND  video_id: {video_id}")
            print(f"  recording:  {ref['id']}  \"{ref.get('title', '')}\"")
            return 0

    # Check legacy youtube[] arrays on musician nodes
    for node in g.get_all_musicians():
        for yt in node.get("youtube", []):
            yt_id = _yt_video_id(yt.get("url", ""))
            if yt_id == video_id:
                idx = node.get("youtube", []).index(yt)
                print(f"FOUND  video_id: {video_id}")
                print(f"  musician node:  {node['id']}  youtube[{idx}]")
                return 0

    print(f"NOT FOUND  video_id: {video_id}")
    return 1


def cmd_get_musician(g: CarnaticGraph, args: list[str]) -> int:
    want_json = "--json" in args
    ids = [a for a in args if a != "--json"]
    if not ids:
        print("Usage: get-musician <id> [--json]", file=sys.stderr)
        return 1
    node = g.get_musician(ids[0])
    if node is None:
        print(f"NOT FOUND  \"{ids[0]}\"")
        return 1
    if want_json:
        _dump(node)
    else:
        summary = {
            "id":            node.get("id"),
            "label":         node.get("label"),
            "born":          node.get("born"),
            "died":          node.get("died"),
            "era":           node.get("era"),
            "instrument":    node.get("instrument"),
            "bani":          node.get("bani"),
            "youtube_count": len(node.get("youtube", [])),
            "sources":       [s.get("label", s.get("url", "")) for s in node.get("sources", [])],
        }
        _dump(summary)
    return 0


def cmd_get_raga(g: CarnaticGraph, args: list[str]) -> int:
    want_json = "--json" in args
    ids = [a for a in args if a != "--json"]
    if not ids:
        print("Usage: get-raga <id> [--json]", file=sys.stderr)
        return 1
    raga = g.get_raga(ids[0])
    if raga is None:
        print(f"NOT FOUND  \"{ids[0]}\"")
        return 1
    _dump(raga) if want_json else _dump({
        "id":          raga.get("id"),
        "name":        raga.get("name"),
        "aliases":     raga.get("aliases", []),
        "melakarta":   raga.get("melakarta"),
        "parent_raga": raga.get("parent_raga"),
        "notes":       raga.get("notes"),
    })
    return 0


def cmd_get_composition(g: CarnaticGraph, args: list[str]) -> int:
    want_json = "--json" in args
    ids = [a for a in args if a != "--json"]
    if not ids:
        print("Usage: get-composition <id> [--json]", file=sys.stderr)
        return 1
    comp = g.get_composition(ids[0])
    if comp is None:
        print(f"NOT FOUND  \"{ids[0]}\"")
        return 1
    _dump(comp) if want_json else _dump({
        "id":          comp.get("id"),
        "title":       comp.get("title"),
        "composer_id": comp.get("composer_id"),
        "raga_id":     comp.get("raga_id"),
        "tala":        comp.get("tala"),
        "language":    comp.get("language"),
        "notes":       comp.get("notes"),
    })
    return 0


def cmd_gurus_of(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: gurus-of <musician_id>", file=sys.stderr)
        return 1
    mid = args[0]
    gurus = g.get_gurus_of(mid)
    if not gurus:
        print(f"No gurus found for \"{mid}\"")
        return 0
    print(f"Gurus of {mid}:")
    # Find confidence from edges
    edges = {(e["target"], e["source"]): e for e in g.get_all_edges()}
    for guru in gurus:
        edge = edges.get((mid, guru["id"]), {})
        conf = edge.get("confidence", "?")
        print(f"  {guru['id']:<40} \"{guru.get('label', '')}\"  confidence: {conf}")
    return 0


def cmd_shishyas_of(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: shishyas-of <musician_id>", file=sys.stderr)
        return 1
    mid = args[0]
    shishyas = g.get_shishyas_of(mid)
    if not shishyas:
        print(f"No shishyas found for \"{mid}\"")
        return 0
    print(f"Shishyas of {mid}:")
    edges = {(e["source"], e["target"]): e for e in g.get_all_edges()}
    for s in shishyas:
        edge = edges.get((mid, s["id"]), {})
        conf = edge.get("confidence", "?")
        print(f"  {s['id']:<40} \"{s.get('label', '')}\"  confidence: {conf}")
    return 0


def cmd_lineage(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: lineage <musician_id>", file=sys.stderr)
        return 1
    chain = g.get_lineage_chain(args[0])
    if not chain:
        print(f"No lineage found for \"{args[0]}\"")
        return 0
    print(f"Lineage chain (upward) from {args[0]}:")
    for node in chain:
        print(f"  {node['id']:<40} \"{node.get('label', '')}\"  {node.get('era', '')}")
    return 0


def cmd_recordings_for(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: recordings-for <musician_id>", file=sys.stderr)
        return 1
    mid = args[0]
    recs = g.get_recordings_for_musician(mid)
    if not recs:
        print(f"No recordings found for \"{mid}\"")
        return 0
    print(f"Recordings for {mid}:")
    for r in recs:
        print(f"  {r['id']:<50} \"{r.get('title', '')}\"  {r.get('date', '')}")
    return 0


def cmd_compositions_in_raga(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: compositions-in-raga <raga_id>", file=sys.stderr)
        return 1
    raga_id = args[0]
    comps = g.get_compositions_by_raga(raga_id)
    if not comps:
        print(f"No compositions found for raga \"{raga_id}\"")
        return 0
    print(f"Compositions in raga {raga_id}:")
    for c in comps:
        print(
            f"  {c['id']:<50} \"{c.get('title', '')}\"  "
            f"composer: {c.get('composer_id')}  tala: {c.get('tala')}"
        )
    return 0


def cmd_validate(g: CarnaticGraph, _args: list[str]) -> int:
    errors: list[str] = []

    known_musician_ids = {n["id"] for n in g.get_all_musicians()}
    known_composition_ids = {c["id"] for c in g.get_all_compositions()}
    known_raga_ids = {r["id"] for r in g.get_all_ragas()}
    known_composer_ids = {c["id"] for c in g.get_all_composers()}

    # ── recording referential integrity ────────────────────────────────────────
    for rec in g.get_all_recordings():
        rid = rec.get("id", "?")
        for session in rec.get("sessions", []):
            for performer in session.get("performers", []):
                mid = performer.get("musician_id")
                if mid is not None and mid not in known_musician_ids:
                    errors.append(
                        f"Recording {rid} session {session['session_index']}: "
                        f"musician_id '{mid}' not in graph"
                    )
            for perf in session.get("performances", []):
                pi = perf.get("performance_index", "?")
                cid = perf.get("composition_id")
                if cid is not None and cid not in known_composition_ids:
                    errors.append(
                        f"Recording {rid} perf {pi}: composition_id '{cid}' not in compositions"
                    )
                rid2 = perf.get("raga_id")
                if rid2 is not None and rid2 not in known_raga_ids:
                    errors.append(
                        f"Recording {rid} perf {pi}: raga_id '{rid2}' not in ragas"
                    )
                coid = perf.get("composer_id")
                if coid is not None and coid not in known_composer_ids:
                    errors.append(
                        f"Recording {rid} perf {pi}: composer_id '{coid}' not in composers"
                    )

    # ── edge integrity ─────────────────────────────────────────────────────────
    seen_edges: set[tuple[str, str]] = set()
    for edge in g.get_all_edges():
        src, tgt = edge["source"], edge["target"]
        if src == tgt:
            errors.append(f"Self-loop edge: {src} → {tgt}")
        pair = (src, tgt)
        if pair in seen_edges:
            errors.append(f"Duplicate edge: {src} → {tgt}")
        seen_edges.add(pair)
        if src not in known_musician_ids:
            errors.append(f"Edge source '{src}' not in musicians")
        if tgt not in known_musician_ids:
            errors.append(f"Edge target '{tgt}' not in musicians")

    # ── composition referential integrity ──────────────────────────────────────
    # null composer_id and null raga_id are valid (ragamalika / anonymous-composer
    # compositions are documented with notes explaining the null).
    for comp in g.get_all_compositions():
        cid = comp.get("id", "?")
        composer_id = comp.get("composer_id")
        if composer_id is not None and composer_id not in known_composer_ids:
            errors.append(f"Composition {cid}: composer_id '{composer_id}' not in composers")
        raga_id = comp.get("raga_id")
        if raga_id is not None and raga_id not in known_raga_ids:
            errors.append(f"Composition {cid}: raga_id '{raga_id}' not in ragas")

    # ── report ─────────────────────────────────────────────────────────────────
    checks = [
        "All musician_ids in recordings exist in graph",
        "All composition_ids in performances exist in compositions",
        "All raga_ids in performances exist in ragas",
        "All composer_ids in performances exist in composers",
        "No duplicate (source, target) edge pairs",
        "No self-loop edges",
        "All edge endpoints exist in musicians",
        "All composition composer_ids and raga_ids are valid",
    ]

    if not errors:
        for check in checks:
            print(f"✓  {check}")
        print("Graph is coherent.")
        return 0
    else:
        for err in errors:
            print(f"✗  {err}")
        print(f"\n{len(errors)} integrity error(s) found.")
        return 1


# ── dispatch ───────────────────────────────────────────────────────────────────

COMMANDS: dict[str, object] = {
    "stats":                cmd_stats,
    "musician-exists":      cmd_musician_exists,
    "raga-exists":          cmd_raga_exists,
    "composition-exists":   cmd_composition_exists,
    "recording-exists":     cmd_recording_exists,
    "url-exists":           cmd_url_exists,
    "get-musician":         cmd_get_musician,
    "get-raga":             cmd_get_raga,
    "get-composition":      cmd_get_composition,
    "gurus-of":             cmd_gurus_of,
    "shishyas-of":          cmd_shishyas_of,
    "lineage":              cmd_lineage,
    "recordings-for":       cmd_recordings_for,
    "compositions-in-raga": cmd_compositions_in_raga,
    "validate":             cmd_validate,
}


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    subcmd = args[0]
    rest = args[1:]

    if subcmd not in COMMANDS:
        print(f"Unknown subcommand: {subcmd}", file=sys.stderr)
        print(f"Available: {', '.join(sorted(COMMANDS))}", file=sys.stderr)
        sys.exit(1)

    g = _load_graph()
    fn = COMMANDS[subcmd]
    exit_code = fn(g, rest)  # type: ignore[operator]
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
