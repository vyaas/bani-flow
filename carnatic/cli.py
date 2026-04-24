#!/usr/bin/env python3
"""
cli.py — Librarian orientation CLI (ADR-014, ADR-021).

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
    python3 carnatic/cli.py concerts-for      <musician_id>
    python3 carnatic/cli.py co-performers-of  <musician_id>
    python3 carnatic/cli.py concerts-with     <musician_id_a> <musician_id_b>
    python3 carnatic/cli.py concert           <recording_id>  [--json]
    python3 carnatic/cli.py validate

    # Melakarta / Cakra traversal (ADR-021)
    python3 carnatic/cli.py is-mela          <raga_id>
    python3 carnatic/cli.py janyas-of        <mela_raga_id>
    python3 carnatic/cli.py mela-of          <janya_raga_id>
    python3 carnatic/cli.py cakra-of         <raga_id>
    python3 carnatic/cli.py melas-in-cakra   <cakra_number>
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
    """Match query against musician id (exact), then label (exact case-insensitive,
    then substring fallback for partial names like 'TN Krishnan')."""
    # 1. Exact id match
    node = g.get_musician(query)
    if node:
        return node
    q = query.lower()
    # 2. Exact label match (case-insensitive)
    for n in g.get_all_musicians():
        if q == n.get("label", "").lower():
            return n
    # 3. Substring fallback (musician names have many spelling variants)
    for n in g.get_all_musicians():
        if q in n.get("label", "").lower():
            return n
    return None


def _fuzzy_match_raga(g: CarnaticGraph, query: str) -> dict | None:
    """Match query against raga id (exact), then name or aliases (exact case-insensitive).
    No substring fallback — substring matching produces false positives for short raga
    names like 'Sri', 'Bhairavi', 'Kalyani', 'Kanada', 'Varali'."""
    # 1. Exact id match
    raga = g.get_raga(query)
    if raga:
        return raga
    q = query.lower()
    # 2. Exact name match (case-insensitive)
    for r in g.get_all_ragas():
        if q == r.get("name", "").lower():
            return r
    # 3. Exact alias match (case-insensitive)
    for r in g.get_all_ragas():
        for alias in r.get("aliases", []):
            if q == alias.lower():
                return r
    return None


def _fuzzy_match_composition(g: CarnaticGraph, query: str) -> dict | None:
    """Match query against composition id (exact), then title (exact case-insensitive,
    then prefix fallback). No arbitrary substring — 'Sri' must not match 'Sri Narada'."""
    # 1. Exact id match
    comp = g.get_composition(query)
    if comp:
        return comp
    q = query.lower()
    # 2. Exact title match (case-insensitive)
    for c in g.get_all_compositions():
        if q == c.get("title", "").lower():
            return c
    # 3. Prefix match (query is a leading substring of the title)
    for c in g.get_all_compositions():
        if c.get("title", "").lower().startswith(q):
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
    if want_json:
        _dump(raga)
    else:
        janyas_count = len(g.get_janyas_of(ids[0])) if raga.get("is_melakarta") else None
        summary = {
            "id":           raga.get("id"),
            "name":         raga.get("name"),
            "aliases":      raga.get("aliases", []),
            "melakarta":    raga.get("melakarta"),
            "is_melakarta": raga.get("is_melakarta", False),
            "cakra":        raga.get("cakra"),
            "parent_raga":  raga.get("parent_raga"),
            "notes":        raga.get("notes"),
        }
        if janyas_count is not None:
            summary["janyas_count"] = janyas_count
        _dump(summary)
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


def cmd_concerts_for(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: concerts-for <musician_id>", file=sys.stderr)
        return 1
    mid = args[0]
    concerts = g.get_concerts_for_musician(mid)
    if not concerts:
        node = g.get_musician(mid)
        if node is None:
            print(f"NOT FOUND  musician \"{mid}\"")
        else:
            print(f"No structured concerts found for \"{mid}\"")
        return 1
    print(f"Concerts for {mid}:\n")
    for c in concerts:
        date_str = f"[{c['date']}]" if c.get("date") else ""
        print(f"  {c['title']}   {date_str}")
        for s in c["sessions"]:
            performers_str = " · ".join(
                f"{pf.get('role', '?')}: {pf.get('unmatched_name') or pf.get('musician_id', '?')}"
                for pf in s["performers"]
            )
            titles = [p["display_title"] for p in s["performances"] if p.get("display_title")]
            pieces_str = " · ".join(titles)
            print(f"    Session {s['session_index']} — {performers_str}")
            print(f"    {len(titles)} piece(s): {pieces_str}")
        print()
    return 0


def cmd_co_performers_of(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: co-performers-of <musician_id>", file=sys.stderr)
        return 1
    mid = args[0]
    co = g.get_co_performers_of(mid)
    if not co:
        node = g.get_musician(mid)
        if node is None:
            print(f"NOT FOUND  musician \"{mid}\"")
        else:
            print(f"No co-performers found for \"{mid}\"")
        return 1
    print(f"Co-performers of {mid} (across all structured recordings):\n")
    for entry in co:
        mid_str   = entry["musician_id"] or "[unmatched]"
        label_str = f"\"{entry['label']}\""
        role_str  = entry["role"]
        recs_str  = ", ".join(entry["recording_ids"])
        print(f"  {mid_str:<35} {label_str:<35} {role_str:<12} — {recs_str}")
    return 0


def cmd_concerts_with(g: CarnaticGraph, args: list[str]) -> int:
    if len(args) < 2:
        print("Usage: concerts-with <musician_id_a> <musician_id_b>", file=sys.stderr)
        return 1
    mid_a, mid_b = args[0], args[1]
    concerts = g.get_concerts_with(mid_a, mid_b)
    if not concerts:
        print(f"No shared concerts found for \"{mid_a}\" and \"{mid_b}\"")
        return 1
    print(f"Concerts where {mid_a} and {mid_b} appeared together:\n")
    for c in concerts:
        date_str = f"[{c['date']}]" if c.get("date") else ""
        print(f"  {c['title']}   {date_str}")
        for s in c["sessions"]:
            performers_str = " · ".join(
                f"{pf.get('role', '?')}: {pf.get('unmatched_name') or pf.get('musician_id', '?')}"
                for pf in s["performers"]
            )
            titles = [p["display_title"] for p in s["performances"] if p.get("display_title")]
            pieces_str = " · ".join(titles)
            print(f"    Session {s['session_index']} — {performers_str}")
            if titles:
                print(f"    {len(titles)} piece(s): {pieces_str}")
        print()
    return 0


def cmd_concert(g: CarnaticGraph, args: list[str]) -> int:
    want_json = "--json" in args
    ids = [a for a in args if a != "--json"]
    if not ids:
        print("Usage: concert <recording_id> [--json]", file=sys.stderr)
        return 1
    recording_id = ids[0]
    prog = g.get_concert_programme(recording_id)
    if prog is None:
        print(f"NOT FOUND  recording \"{recording_id}\"")
        return 1
    if want_json:
        _dump(prog)
        return 0

    rec = prog["recording"]
    print(f"Concert: {rec.get('title', recording_id)}")
    print(f"Date:    {rec.get('date', 'unknown')}")
    if rec.get("venue"):
        print(f"Venue:   {rec['venue']}")
    if rec.get("occasion"):
        print(f"Occasion: {rec['occasion']}")
    print()
    for s in prog["sessions"]:
        print(f"Session {s['session_index']}")
        performers_str = " · ".join(
            f"{pf.get('role', '?')}: {pf.get('unmatched_name') or pf.get('musician_id', '?')}"
            for pf in s["performers"]
        )
        print(f"  Performers: {performers_str}")
        print(f"  Performances:")
        for perf in s["performances"]:
            idx       = perf.get("performance_index", "?")
            ts        = perf.get("timestamp", "00:00:00")
            title     = perf.get("display_title", "?")
            raga_obj  = perf.get("raga")
            raga_name = raga_obj.get("name", perf.get("raga_id", "")) if raga_obj else (perf.get("raga_id") or "")
            tala      = perf.get("tala") or ""
            meta      = " · ".join(x for x in [raga_name, tala] if x)
            meta_str  = f"  {meta}" if meta else ""
            print(f"    {idx:>2}.  {ts}  {title:<35}{meta_str}")
        print()
    return 0


# ── Melakarta / Cakra traversal commands (ADR-021) ────────────────────────────

CAKRA_NAMES = {
    1:  "Indu",
    2:  "Netra",
    3:  "Agni",
    4:  "Veda",
    5:  "Bana",
    6:  "Rutu",
    7:  "Rishi",
    8:  "Vasu",
    9:  "Brahma",
    10: "Disi",
    11: "Rudra",
    12: "Aditya",
}


def cmd_is_mela(g: CarnaticGraph, args: list[str]) -> int:
    """Exit 0 if raga is a melakarta; exit 1 otherwise."""
    if not args:
        print("Usage: is-mela <raga_id>", file=sys.stderr)
        return 1
    raga_id = args[0]
    raga = g.get_raga(raga_id)
    if raga is None:
        print(f"NOT FOUND  raga \"{raga_id}\"")
        return 1
    if g.is_melakarta(raga_id):
        mela_num   = raga.get("melakarta", "?")
        cakra_num  = raga.get("cakra", "?")
        cakra_name = CAKRA_NAMES.get(cakra_num, str(cakra_num)) if isinstance(cakra_num, int) else "?"
        print(f"YES — Mela {mela_num}, Cakra {cakra_num} ({cakra_name})")
        return 0
    else:
        parent_id = raga.get("parent_raga")
        if parent_id:
            parent = g.get_raga(parent_id)
            parent_name = parent.get("name", parent_id) if parent else parent_id
            print(f"NO — janya of {parent_id} ({parent_name})")
        else:
            print(f"NO — janya raga (parent_raga not set)")
        return 1


def cmd_janyas_of(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: janyas-of <mela_raga_id>", file=sys.stderr)
        return 1
    mela_id = args[0]
    mela = g.get_raga(mela_id)
    if mela is None:
        print(f"NOT FOUND  raga \"{mela_id}\"")
        return 1
    janyas = g.get_janyas_of(mela_id)
    mela_num = mela.get("melakarta", "?")
    print(f"Janyas of {mela.get('name', mela_id)} (Mela {mela_num}):")
    if not janyas:
        print("  (none found — parent_raga links may not yet be set)")
        return 0
    for j in janyas:
        print(f"  {j['id']:<35} {j.get('name', '')}")
    print(f"  ({len(janyas)} total)")
    return 0


def cmd_mela_of(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: mela-of <janya_raga_id>", file=sys.stderr)
        return 1
    janya_id = args[0]
    janya = g.get_raga(janya_id)
    if janya is None:
        print(f"NOT FOUND  raga \"{janya_id}\"")
        return 1
    if g.is_melakarta(janya_id):
        mela_num  = janya.get("melakarta", "?")
        cakra_num = janya.get("cakra", "?")
        cakra_name = CAKRA_NAMES.get(cakra_num, str(cakra_num)) if isinstance(cakra_num, int) else "?"
        print(f"{janya_id} is itself a melakarta — Mela {mela_num}, Cakra {cakra_num} ({cakra_name})")
        return 0
    parent = g.get_mela_of(janya_id)
    if parent is None:
        parent_id = janya.get("parent_raga")
        if parent_id:
            print(f"Parent raga id '{parent_id}' is set but not found in ragas[] — referential integrity gap")
        else:
            print(f"No parent_raga set for \"{janya_id}\" — janya parentage not yet encoded")
        return 1
    mela_num  = parent.get("melakarta", "?")
    cakra_num = parent.get("cakra", "?")
    cakra_name = CAKRA_NAMES.get(cakra_num, str(cakra_num)) if isinstance(cakra_num, int) else "?"
    print(
        f"Parent mela: {parent['id']} ({parent.get('name', '')}) "
        f"— Mela {mela_num}, Cakra {cakra_num} ({cakra_name})"
    )
    return 0


def cmd_cakra_of(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: cakra-of <raga_id>", file=sys.stderr)
        return 1
    raga_id = args[0]
    raga = g.get_raga(raga_id)
    if raga is None:
        print(f"NOT FOUND  raga \"{raga_id}\"")
        return 1
    cakra_num = g.get_cakra_of(raga_id)
    if cakra_num is None:
        print(f"Cakra unknown for \"{raga_id}\" — melakarta data not yet populated")
        return 1
    cakra_name = CAKRA_NAMES.get(cakra_num, str(cakra_num))
    # Compute mela range for this cakra
    mela_start = (cakra_num - 1) * 6 + 1
    mela_end   = cakra_num * 6
    print(f"Cakra {cakra_num} — {cakra_name} (Melas {mela_start}–{mela_end})")
    return 0


def cmd_melas_in_cakra(g: CarnaticGraph, args: list[str]) -> int:
    if not args:
        print("Usage: melas-in-cakra <cakra_number>", file=sys.stderr)
        return 1
    try:
        cakra_num = int(args[0])
    except ValueError:
        print(f"ERROR: cakra_number must be an integer 1–12, got \"{args[0]}\"", file=sys.stderr)
        return 1
    if not (1 <= cakra_num <= 12):
        print(f"ERROR: cakra_number {cakra_num} is out of range [1, 12]", file=sys.stderr)
        return 1
    cakra_name = CAKRA_NAMES.get(cakra_num, str(cakra_num))
    mela_start = (cakra_num - 1) * 6 + 1
    mela_end   = cakra_num * 6
    melas = g.get_melas_in_cakra(cakra_num)
    print(f"Cakra {cakra_num} — {cakra_name} (Melas {mela_start}–{mela_end}):")
    if not melas:
        print("  (no mela ragas found — melakarta data not yet populated)")
        return 0
    # Show all 6 slots; mark missing ones
    present_by_num = {m.get("melakarta"): m for m in melas}
    for n in range(mela_start, mela_end + 1):
        m = present_by_num.get(n)
        if m:
            print(f"  {n:<3}  {m['id']:<35} {m.get('name', '')}")
        else:
            print(f"  {n:<3}  (not yet in ragas[])")
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

    # ── youtube performer integrity (ADR-070) ──────────────────────────────────
    from carnatic.render.roles import VALID_ROLES
    for node in g.get_all_musicians():
        nid = node["id"]
        for i, yt in enumerate(node.get("youtube", [])):
            performers = yt.get("performers")
            if not performers:
                continue
            host_present = False
            for j, p in enumerate(performers):
                mid = p.get("musician_id")
                role = p.get("role")
                unmatched = p.get("unmatched_name")
                if mid == nid:
                    host_present = True
                if role is None:
                    errors.append(
                        f"Musician {nid} youtube[{i}].performers[{j}]: missing 'role'"
                    )
                elif role not in VALID_ROLES:
                    errors.append(
                        f"Musician {nid} youtube[{i}].performers[{j}]: "
                        f"role '{role}' not in vocabulary"
                    )
                if mid is None and not unmatched:
                    errors.append(
                        f"Musician {nid} youtube[{i}].performers[{j}]: "
                        f"must have musician_id or unmatched_name"
                    )
                if mid is not None and mid not in known_musician_ids:
                    errors.append(
                        f"Musician {nid} youtube[{i}].performers[{j}]: "
                        f"musician_id '{mid}' not in graph"
                    )
            if not host_present:
                errors.append(
                    f"Musician {nid} youtube[{i}].performers: "
                    f"host musician_id '{nid}' must be listed (ADR-070 invariant B)"
                )

    # ── youtube lecdem integrity (ADR-077) ────────────────────────────────────
    from carnatic.render.youtube_kinds import VALID_YOUTUBE_KINDS
    _SUBJECTS_KEYS = ("raga_ids", "composition_ids", "musician_ids")
    for node in g.get_all_musicians():
        nid = node["id"]
        for i, yt in enumerate(node.get("youtube", [])):
            kind = yt.get("kind")
            if kind is not None and kind not in VALID_YOUTUBE_KINDS:
                errors.append(
                    f"Musician {nid} youtube[{i}]: "
                    f"kind '{kind}' not in vocabulary"
                )
            if kind == "lecdem":
                subjects = yt.get("subjects")
                if subjects is None:
                    errors.append(
                        f"Musician {nid} youtube[{i}]: "
                        f"lecdem entry missing 'subjects' object (ADR-077 invariant B)"
                    )
                else:
                    for key in _SUBJECTS_KEYS:
                        if key not in subjects:
                            errors.append(
                                f"Musician {nid} youtube[{i}].subjects: "
                                f"missing required key '{key}' (ADR-077 invariant B)"
                            )
                    for rid2 in subjects.get("raga_ids", []):
                        if rid2 not in known_raga_ids:
                            errors.append(
                                f"Musician {nid} youtube[{i}].subjects.raga_ids: "
                                f"'{rid2}' not in ragas (ADR-077 invariant D)"
                            )
                    for cid2 in subjects.get("composition_ids", []):
                        if cid2 not in known_composition_ids:
                            errors.append(
                                f"Musician {nid} youtube[{i}].subjects.composition_ids: "
                                f"'{cid2}' not in compositions (ADR-077 invariant D)"
                            )
                    for mid2 in subjects.get("musician_ids", []):
                        if mid2 not in known_musician_ids:
                            errors.append(
                                f"Musician {nid} youtube[{i}].subjects.musician_ids: "
                                f"'{mid2}' not in musicians (ADR-077 invariant D)"
                            )
                if yt.get("composition_id") is not None or yt.get("raga_id") is not None:
                    errors.append(
                        f"Musician {nid} youtube[{i}]: "
                        f"lecdem entry must not carry composition_id or raga_id "
                        f"(ADR-077 — use subjects arrays instead)"
                    )

    # ── empty-panel tutorial integrity (ADR-087) ──────────────────────────────
    # If carnatic/data/help/empty_panels.json exists, every entity id it
    # references must resolve in the graph. Action items (example_kind=action,
    # example_id=null) are exempt. Also validates cross_panel_seeds invariants
    # and the schema version gate.
    import json as _json
    from pathlib import Path as _Path
    _help_path = _Path(__file__).resolve().parent / "data" / "help" / "empty_panels.json"
    if _help_path.exists():
        try:
            help_data = _json.loads(_help_path.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"help/empty_panels.json: invalid JSON ({e})")
            help_data = None
        if help_data:
            _schema_version = help_data.get("schema_version", 1)
            if _schema_version > 2:
                errors.append(
                    f"help/empty_panels.json: schema_version {_schema_version} > 2; "
                    f"update cli.py to handle the new schema"
                )
            else:
                # panel_target value that would self-reference each panel block
                _PANEL_TARGET_FORBIDDEN = {
                    "musician_panel":  "musician",
                    "bani_flow_panel": "bani",
                }
                # allowed item kinds in cross_panel_seeds per panel
                _SEED_ALLOWED_KINDS = {
                    "musician_panel":  {"raga", "composition"},
                    "bani_flow_panel": {"musician"},
                }

                for panel_key in ("musician_panel", "bani_flow_panel"):
                    block = help_data.get(panel_key) or {}

                    # Validate chip_catalogue entity ids
                    for ci, entry in enumerate(block.get("chip_catalogue", [])):
                        c_where = f"help/empty_panels.json:{panel_key}.chip_catalogue[{ci}]"
                        kind = entry.get("example_kind")
                        eid  = entry.get("example_id")
                        # Action items with null example_id are exempt
                        if kind == "action" or eid is None:
                            continue
                        if kind == "musician" and eid not in known_musician_ids:
                            errors.append(f"{c_where}: musician_id '{eid}' not in graph")
                        elif kind == "raga" and eid not in known_raga_ids:
                            errors.append(f"{c_where}: raga_id '{eid}' not in ragas")
                        elif kind == "composition" and eid not in known_composition_ids:
                            errors.append(f"{c_where}: composition_id '{eid}' not in compositions")
                        elif kind in ("lecdem_by", "lecdem_about"):
                            if eid not in known_musician_ids:
                                errors.append(
                                    f"{c_where}: musician_id '{eid}' not in graph (lecdem example)"
                                )

                    # Validate cross_panel_seeds
                    seeds = block.get("cross_panel_seeds") or {}
                    panel_target = seeds.get("panel_target")
                    forbidden_target = _PANEL_TARGET_FORBIDDEN.get(panel_key)
                    if panel_target and panel_target == forbidden_target:
                        errors.append(
                            f"help/empty_panels.json:{panel_key}.cross_panel_seeds.panel_target "
                            f"'{panel_target}' self-targets this panel (must target the other panel)"
                        )
                    allowed_kinds = _SEED_ALLOWED_KINDS.get(panel_key, set())
                    for si, item in enumerate(seeds.get("items", [])):
                        s_where = (
                            f"help/empty_panels.json:{panel_key}.cross_panel_seeds.items[{si}]"
                        )
                        item_kind = item.get("kind")
                        item_id   = item.get("id")
                        if item_kind not in allowed_kinds:
                            errors.append(
                                f"{s_where}: kind '{item_kind}' is not allowed in {panel_key} "
                                f"cross_panel_seeds (allowed: {sorted(allowed_kinds)})"
                            )
                            continue
                        if item_kind == "musician" and item_id not in known_musician_ids:
                            errors.append(f"{s_where}: musician_id '{item_id}' not in graph")
                        elif item_kind == "raga" and item_id not in known_raga_ids:
                            errors.append(f"{s_where}: raga_id '{item_id}' not in ragas")
                        elif item_kind == "composition" and item_id not in known_composition_ids:
                            errors.append(f"{s_where}: composition_id '{item_id}' not in compositions")

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
        "All youtube performers reference known musicians and roles (ADR-070)",
        "All youtube lecdem entries have valid kind, subjects, and resolvable ids (ADR-077)",
        "All empty-panel tutorial ids resolve in graph (ADR-087)",
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
    "concerts-for":         cmd_concerts_for,
    "co-performers-of":     cmd_co_performers_of,
    "concerts-with":        cmd_concerts_with,
    "concert":              cmd_concert,
    "validate":             cmd_validate,
    # Melakarta / Cakra traversal (ADR-021)
    "is-mela":              cmd_is_mela,
    "janyas-of":            cmd_janyas_of,
    "mela-of":              cmd_mela_of,
    "cakra-of":             cmd_cakra_of,
    "melas-in-cakra":       cmd_melas_in_cakra,
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
