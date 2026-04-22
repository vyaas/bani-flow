#!/usr/bin/env python3
"""
bani_add.py — Consume a bani-add bundle JSON and populate the data directories.

Usage:
    bani-add  bundle.json
    python3 carnatic/bani_add.py  bundle.json

Bundle schema (schema_version 1):

  {
    "schema_version": 1,
    "generated_at":   "<ISO timestamp>",
    "items": {
      "ragas":        [ { raga fields … } ],
      "composers":    [ { composer fields … } ],
      "musicians":    [ { "type": "new",            musician fields + "youtube": […] }
                      | { "type": "youtube_append", "musician_id": "…", "youtube": […] } ],
      "compositions": [ { composition fields … } ],
      "recordings":   [ { recording fields — written as-is to data/recordings/ } ],
      "edges":        [ { "source": "…", "target": "…", "confidence": 0.9,
                          "source_url": "…", "note": "…" } ]
    }
  }

Processing order: ragas → composers → musicians → compositions → recordings → edges.

Exit codes:
  0 — all items written or skipped (no errors)
  1 — at least one error (see output)
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import os
from datetime import datetime, timezone
from pathlib import Path

# Path bootstrap for direct invocation
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from carnatic.writer import (
    CarnaticWriter,
    _default_musicians_path,
    _default_compositions_path,
    _default_ragas_path,
    WriteResult,
)


# ── helpers ────────────────────────────────────────────────────────────────────

def _default_recordings_path() -> Path:
    return Path(__file__).parent / "data" / "recordings"


def _atomic_write_recording(recordings_dir: Path, rec: dict) -> None:
    """Write a recording file atomically to recordings/{id}.json."""
    rec_id = rec.get("id")
    if not rec_id:
        raise ValueError("recording has no 'id' field")
    dest = recordings_dir / f"{rec_id}.json"
    text = json.dumps(rec, indent=2, ensure_ascii=False) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=recordings_dir,
        suffix=".tmp", delete=False
    ) as f:
        f.write(text)
        tmp = Path(f.name)
    os.replace(tmp, dest)


def _print_result(result: WriteResult) -> None:
    print(f"  {result.message}")


def _summary_line(added: int, skipped: int, errors: int) -> str:
    parts = [f"Added {added}", f"Skipped {skipped}", f"Errors {errors}"]
    return "  " + " · ".join(parts)


# ── item processors ───────────────────────────────────────────────────────────

def _process_ragas(
    ragas: list[dict],
    writer: CarnaticWriter,
    comp_path: Path,
    ragas_path: Path,
) -> tuple[int, int, int]:
    added = skipped = errors = 0
    for r in ragas:
        if not r.get("id") or not r.get("name"):
            print(f"  ERROR  raga missing 'id' or 'name': {r}")
            errors += 1
            continue
        src = r.get("sources", [{}])[0] if r.get("sources") else {}
        result = writer.add_raga(
            comp_path,
            id=r["id"],
            name=r["name"],
            source_url=src.get("url", ""),
            source_label=src.get("label", ""),
            source_type=src.get("type", "other"),
            aliases=r.get("aliases"),
            melakarta=r.get("melakarta"),
            parent_raga=r.get("parent_raga"),
            notes=r.get("notes"),
            ragas_path=ragas_path,
        )
        _print_result(result)
        if result.ok:
            added += 1
        elif result.skipped:
            skipped += 1
        else:
            errors += 1
    return added, skipped, errors


def _process_composers(
    composers: list[dict],
    writer: CarnaticWriter,
    comp_path: Path,
    musicians_path: Path,
) -> tuple[int, int, int]:
    added = skipped = errors = 0
    for c in composers:
        if not c.get("id") or not c.get("name"):
            print(f"  ERROR  composer missing 'id' or 'name': {c}")
            errors += 1
            continue
        src = c.get("sources", [{}])[0] if c.get("sources") else {}
        result = writer.add_composer(
            comp_path,
            id=c["id"],
            name=c["name"],
            source_url=src.get("url", ""),
            source_label=src.get("label", ""),
            source_type=src.get("type", "other"),
            musician_node_id=c.get("musician_node_id"),
            born=c.get("born"),
            died=c.get("died"),
            musicians_path=musicians_path,
        )
        _print_result(result)
        if result.ok:
            added += 1
        elif result.skipped:
            skipped += 1
        else:
            errors += 1
    return added, skipped, errors


def _process_musicians(
    musicians: list[dict],
    writer: CarnaticWriter,
    musicians_path: Path,
    comp_path: Path,
) -> tuple[int, int, int]:
    added = skipped = errors = 0
    for m in musicians:
        item_type = m.get("type", "new")

        if item_type == "youtube_append":
            musician_id = m.get("musician_id")
            if not musician_id:
                print("  ERROR  youtube_append item missing 'musician_id'")
                errors += 1
                continue
            for yt in m.get("youtube", []):
                if not yt.get("url"):
                    print(f"  ERROR  youtube entry missing 'url' for musician {musician_id}")
                    errors += 1
                    continue
                result = writer.add_youtube(
                    musicians_path,
                    musician_id=musician_id,
                    url=yt["url"],
                    label=yt.get("label", ""),
                    composition_id=yt.get("composition_id"),
                    raga_id=yt.get("raga_id"),
                    year=yt.get("year"),
                    version=yt.get("version"),
                    tala=yt.get("tala"),
                    performers=yt.get("performers"),
                    compositions_path=comp_path,
                )
                _print_result(result)
                if result.ok:
                    added += 1
                elif result.skipped:
                    skipped += 1
                else:
                    errors += 1

        else:  # "new" — add musician node, then its YouTube entries
            if not m.get("id") or not m.get("label"):
                print(f"  ERROR  musician missing 'id' or 'label': {m}")
                errors += 1
                continue
            src = m.get("sources", [{}])[0] if m.get("sources") else {}
            result = writer.add_musician(
                musicians_path,
                id=m["id"],
                label=m["label"],
                era=m.get("era", "contemporary"),
                instrument=m.get("instrument", "vocal"),
                source_url=src.get("url", ""),
                source_label=src.get("label", ""),
                source_type=src.get("type", "other"),
                born=m.get("born"),
                died=m.get("died"),
                bani=m.get("bani"),
            )
            _print_result(result)
            if result.ok:
                added += 1
            elif result.skipped:
                skipped += 1
            else:
                errors += 1
                continue  # skip youtube entries if musician creation failed

            # Add YouTube entries for the new musician
            for yt in m.get("youtube", []):
                if not yt.get("url"):
                    continue
                yt_result = writer.add_youtube(
                    musicians_path,
                    musician_id=m["id"],
                    url=yt["url"],
                    label=yt.get("label", ""),
                    composition_id=yt.get("composition_id"),
                    raga_id=yt.get("raga_id"),
                    year=yt.get("year"),
                    version=yt.get("version"),
                    tala=yt.get("tala"),
                    performers=yt.get("performers"),
                    compositions_path=comp_path,
                )
                _print_result(yt_result)
                if yt_result.ok:
                    added += 1
                elif yt_result.skipped:
                    skipped += 1
                else:
                    errors += 1

    return added, skipped, errors


def _process_compositions(
    compositions: list[dict],
    writer: CarnaticWriter,
    comp_path: Path,
    ragas_path: Path,
) -> tuple[int, int, int]:
    added = skipped = errors = 0
    for c in compositions:
        if not c.get("id") or not c.get("title"):
            print(f"  ERROR  composition missing 'id' or 'title': {c}")
            errors += 1
            continue
        src = c.get("sources", [{}])[0] if c.get("sources") else {}
        result = writer.add_composition(
            comp_path,
            id=c["id"],
            title=c["title"],
            composer_id=c.get("composer_id", ""),
            raga_id=c.get("raga_id", ""),
            tala=c.get("tala"),
            language=c.get("language"),
            source_url=src.get("url"),
            source_label=src.get("label"),
            source_type=src.get("type"),
            notes=c.get("notes"),
            ragas_path=ragas_path,
        )
        _print_result(result)
        if result.ok:
            added += 1
        elif result.skipped:
            skipped += 1
        else:
            errors += 1
    return added, skipped, errors


def _process_recordings(
    recordings: list[dict],
    recordings_path: Path,
) -> tuple[int, int, int]:
    added = skipped = errors = 0
    if not recordings_path.exists():
        recordings_path.mkdir(parents=True, exist_ok=True)
    for rec in recordings:
        rec_id = rec.get("id")
        if not rec_id:
            print("  ERROR  recording missing 'id'")
            errors += 1
            continue
        dest = recordings_path / f"{rec_id}.json"
        if dest.exists():
            print(f"  SKIP (duplicate)  {rec_id} already exists in recordings/")
            skipped += 1
            continue
        try:
            _atomic_write_recording(recordings_path, rec)
            print(f"  [REC+]  added: {rec_id}")
            added += 1
        except Exception as exc:
            print(f"  ERROR  could not write recording {rec_id}: {exc}")
            errors += 1
    return added, skipped, errors


def _process_edges(
    edges: list[dict],
    writer: CarnaticWriter,
    musicians_path: Path,
) -> tuple[int, int, int]:
    added = skipped = errors = 0
    for e in edges:
        if not e.get("source") or not e.get("target"):
            print(f"  ERROR  edge missing 'source' or 'target': {e}")
            errors += 1
            continue
        result = writer.add_edge(
            musicians_path,
            source=e["source"],
            target=e["target"],
            confidence=float(e.get("confidence", 0.90)),
            source_url=e.get("source_url", ""),
            note=e.get("note"),
        )
        _print_result(result)
        if result.ok:
            added += 1
        elif result.skipped:
            skipped += 1
        else:
            errors += 1
    return added, skipped, errors


# ── main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="bani-add",
        description="Consume a bani-add bundle JSON and populate the data directories.",
    )
    parser.add_argument(
        "bundle",
        metavar="bundle.json",
        help="Path to the bundle JSON file produced by the entry forms.",
    )
    args = parser.parse_args()

    bundle_path = Path(args.bundle)
    if not bundle_path.exists():
        print(f"ERROR  bundle file not found: {bundle_path}", file=sys.stderr)
        sys.exit(1)

    try:
        bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR  invalid JSON in bundle file: {exc}", file=sys.stderr)
        sys.exit(1)

    schema_version = bundle.get("schema_version", 1)
    if schema_version != 1:
        print(f"ERROR  unsupported schema_version {schema_version} (expected 1)", file=sys.stderr)
        sys.exit(1)

    items = bundle.get("items", {})
    ragas        = items.get("ragas",        [])
    composers    = items.get("composers",    [])
    musicians    = items.get("musicians",    [])
    compositions = items.get("compositions", [])
    recordings   = items.get("recordings",   [])
    edges        = items.get("edges",        [])

    writer          = CarnaticWriter()
    musicians_path  = _default_musicians_path()
    comp_path       = _default_compositions_path()
    ragas_path      = _default_ragas_path()
    recordings_path = _default_recordings_path()

    total_added = total_skipped = total_errors = 0

    # ── ragas ──────────────────────────────────────────────────────────────────
    if ragas:
        print(f"\nRagas ({len(ragas)}):")
        a, s, e = _process_ragas(ragas, writer, comp_path, ragas_path)
        total_added += a; total_skipped += s; total_errors += e

    # ── composers ─────────────────────────────────────────────────────────────
    if composers:
        print(f"\nComposers ({len(composers)}):")
        a, s, e = _process_composers(composers, writer, comp_path, musicians_path)
        total_added += a; total_skipped += s; total_errors += e

    # ── musicians ─────────────────────────────────────────────────────────────
    if musicians:
        print(f"\nMusicians ({len(musicians)}):")
        a, s, e = _process_musicians(musicians, writer, musicians_path, comp_path)
        total_added += a; total_skipped += s; total_errors += e

    # ── compositions ──────────────────────────────────────────────────────────
    if compositions:
        print(f"\nCompositions ({len(compositions)}):")
        a, s, e = _process_compositions(compositions, writer, comp_path, ragas_path)
        total_added += a; total_skipped += s; total_errors += e

    # ── recordings ────────────────────────────────────────────────────────────
    if recordings:
        print(f"\nRecordings ({len(recordings)}):")
        a, s, e = _process_recordings(recordings, recordings_path)
        total_added += a; total_skipped += s; total_errors += e

    # ── edges ─────────────────────────────────────────────────────────────────
    if edges:
        print(f"\nEdges ({len(edges)}):")
        a, s, e = _process_edges(edges, writer, musicians_path)
        total_added += a; total_skipped += s; total_errors += e

    # ── summary ───────────────────────────────────────────────────────────────
    print()
    print(_summary_line(total_added, total_skipped, total_errors))
    print()
    print("  Run `bani-render` to update the visualization.")

    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
