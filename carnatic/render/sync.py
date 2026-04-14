"""
carnatic/render/sync.py — graph.json sync logic (ADR-016).

sync_graph_json() keeps graph.json current from musicians/ (or musicians.json),
ragas/ + compositions/ (or legacy compositions.json), and the recordings/
directory before each render.
Atomic write via temp file + os.replace.
"""
import json
import os
import tempfile
from pathlib import Path

from carnatic.render.data_loaders import load_musicians, load_compositions


def sync_graph_json(
    graph_file: Path,
    musicians_file: Path,
    compositions_file: Path,
) -> None:
    """
    Sync graph.json["musicians"], graph.json["compositions"], and
    graph.json["recording_refs"] from the canonical source files before rendering.

    Musicians are loaded from the musicians/ directory (one .json per node +
    _edges.json) when it exists, falling back to the legacy monolithic
    musicians.json.

    Compositions are loaded from:
      - ragas/          (one .json per raga, top-level sibling of musicians/)
      - compositions/   (one .json per composition + _composers.json sidecar)
    falling back to the legacy monolithic compositions.json.

    recording_refs is rebuilt from the recordings/ directory on every render,
    so adding a new recordings/*.json file is automatically picked up without
    any manual graph.json edit.

    This is the single sync point that keeps graph.json current for traversal
    and rendering (ADR-016). Idempotent: safe to call on every render.py
    invocation. Atomic: writes via temp file + os.replace.
    """

    graph = json.loads(graph_file.read_text(encoding="utf-8"))

    # ── musicians: prefer musicians/ directory, fall back to musicians.json ──
    musicians_dir = musicians_file.parent / "musicians"
    m = load_musicians(musicians_dir, musicians_file)
    graph["musicians"] = {
        "nodes": m.get("nodes", []),
        "edges": m.get("edges", []),
    }

    # ── compositions: prefer ragas/ + compositions/ dirs, fall back to .json ──
    data_dir         = compositions_file.parent
    ragas_dir        = data_dir / "ragas"
    compositions_dir = data_dir / "compositions"

    c = load_compositions(compositions_dir, compositions_file, ragas_dir)
    graph["compositions"] = {
        "ragas":        c.get("ragas", []),
        "composers":    c.get("composers", []),
        "compositions": c.get("compositions", []),
    }

    # Rebuild recording_refs from recordings/ directory.
    # Each ref carries the fields CarnaticGraph needs for lazy loading:
    #   id, path, title, short_title, date, venue, primary_musician_ids
    recordings_dir = graph_file.parent / "recordings"
    if recordings_dir.is_dir():
        new_refs = []
        for f in sorted(recordings_dir.glob("*.json")):
            if f.name.startswith("_"):
                continue
            try:
                rec = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            rec_id = rec.get("id")
            if not rec_id:
                continue
            # Collect all musician_ids across all sessions
            primary_ids: list[str] = []
            for session in rec.get("sessions", []):
                for pf in session.get("performers", []):
                    mid = pf.get("musician_id")
                    if mid and mid not in primary_ids:
                        primary_ids.append(mid)
            ref = {
                "id":                  rec_id,
                "path":                f"recordings/{f.name}",
                "title":               rec.get("title", ""),
                "short_title":         rec.get("short_title", ""),
                "date":                rec.get("date", ""),
                "venue":               rec.get("venue", ""),
                "primary_musician_ids": primary_ids,
            }
            new_refs.append(ref)
        graph["recording_refs"] = new_refs

    text = json.dumps(graph, indent=2, ensure_ascii=False) + "\n"
    dir_ = graph_file.parent
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=dir_, suffix=".tmp", delete=False
    ) as f:
        f.write(text)
        tmp = Path(f.name)
    os.replace(tmp, graph_file)

    musicians_label = "musicians/" if musicians_dir.is_dir() else "musicians.json"
    if ragas_dir.is_dir() or compositions_dir.is_dir():
        comp_label = "ragas/ + compositions/"
    else:
        comp_label = "compositions.json"
    print(f"[SYNC] graph.json ← {musicians_label} + {comp_label} + recordings/")

