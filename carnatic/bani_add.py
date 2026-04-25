#!/usr/bin/env python3
"""
bani_add.py — Consume a bani-add bundle JSON and populate the data directories.

Usage:
    bani-add  bundle.json
    python3 carnatic/bani_add.py  bundle.json

Bundle schema reference: ADR-083 (plans/ADR-083-bani-add-bundle-canonical-write-channel.md).
Delta ops (schema_version 2): ADR-097 (plans/ADR-097-bundle-deltas-and-unified-edit-forms.md).

Bundle envelope (schema_version 1 — still accepted):

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

schema_version 2 adds an optional "op" field to every item (ADR-097 §2):
  op: "create"   — default (omitted = create); today's behaviour
  op: "patch"    — update a single field on an existing entity
  op: "append"   — push one element onto an array on an existing entity
  op: "annotate" — append a note to the entity's notes[] vector

Whitelisted item types: ragas, composers, musicians, compositions, recordings, edges.
Unknown item types are rejected with a named error — silent drops are forbidden.

Processing order: ragas → composers → musicians → compositions → recordings → edges.

Version contract (§3 of ADR-083):
  - bundles with schema_version > MAX_VERSION are refused immediately.
  - bundles with schema_version < MAX_VERSION are accepted (v1 bundles ingest unchanged under v2).

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
    PATCHABLE_MUSICIAN_FIELDS,
    PATCHABLE_EDGE_FIELDS,
    PATCHABLE_RAGA_FIELDS,
    PATCHABLE_COMPOSITION_FIELDS,
    PATCHABLE_COMPOSER_FIELDS,
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
        op = r.get("op", "create")

        if op == "patch":
            raga_id = r.get("id")
            field   = r.get("field")
            value   = r.get("value")
            if not raga_id or not field:
                print(f"  ERROR  raga patch missing 'id' or 'field': {r}")
                errors += 1
                continue
            result = writer.patch_raga(
                comp_path, raga_id=raga_id, field=field, value=value,
                ragas_path=ragas_path,
            )

        elif op == "annotate":
            result = writer.add_note(
                entity_type="raga", entity_id=r.get("id", ""),
                note_text=r.get("note", {}).get("text", ""),
                source_url=r.get("note", {}).get("source_url"),
                added_at=r.get("note", {}).get("added_at"),
                compositions_path=comp_path, ragas_path=ragas_path,
            )

        elif op == "create":
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

        else:
            print(f"  ERROR  raga item has unknown op '{op}'. Known ops: create, patch, annotate.")
            errors += 1
            continue

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
        op = c.get("op", "create")

        if op == "patch":
            composer_id = c.get("id")
            field       = c.get("field")
            value       = c.get("value")
            if not composer_id or not field:
                print(f"  ERROR  composer patch missing 'id' or 'field': {c}")
                errors += 1
                continue
            result = writer.patch_composer(
                comp_path, composer_id=composer_id, field=field, value=value,
            )

        elif op == "annotate":
            result = writer.add_note(
                entity_type="composer", entity_id=c.get("id", ""),
                note_text=c.get("note", {}).get("text", ""),
                source_url=c.get("note", {}).get("source_url"),
                added_at=c.get("note", {}).get("added_at"),
                compositions_path=comp_path,
            )

        elif op == "create":
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

        else:
            print(f"  ERROR  composer item has unknown op '{op}'. Known ops: create, patch, annotate.")
            errors += 1
            continue

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
    ragas_path: Path,
) -> tuple[int, int, int]:
    added = skipped = errors = 0
    for m in musicians:
        op        = m.get("op")          # v2 delta ops (ADR-097 §2)
        item_type = m.get("type", "new") # v1 type discriminator (kept for compat)

        # ── v2: patch a single field on an existing musician ─────────────────
        if op == "patch":
            musician_id = m.get("id")
            field       = m.get("field")
            value       = m.get("value")
            if not musician_id or not field:
                print(f"  ERROR  musician patch missing 'id' or 'field': {m}")
                errors += 1
                continue
            result = writer.patch_musician(
                musicians_path, musician_id=musician_id, field=field, value=value,
            )
            _print_result(result)
            if result.ok:       added   += 1
            elif result.skipped: skipped += 1
            else:                errors  += 1
            continue

        # ── v2: append one element to a musician array ────────────────────────
        if op == "append":
            musician_id = m.get("id")
            array_sel   = m.get("array", "")
            value       = m.get("value", {})
            if not musician_id or not array_sel:
                print(f"  ERROR  musician append missing 'id' or 'array': {m}")
                errors += 1
                continue

            if array_sel == "youtube":
                # same as youtube_append; value is one YoutubeEntryItem
                yt = value if isinstance(value, dict) else {}
                if not yt.get("url"):
                    print(f"  ERROR  musician append youtube missing 'url' for {musician_id}")
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
                    kind=yt.get("kind"),
                    subjects=yt.get("subjects"),
                    compositions_path=comp_path,
                    ragas_path=ragas_path,
                )
            elif array_sel.startswith("youtube[") and ".performers" in array_sel:
                # e.g. "youtube[dQw4w9WgXcQ].performers"
                import re as _re
                m_sel = _re.match(r"youtube\[([A-Za-z0-9_-]{11})\]\.performers", array_sel)
                if not m_sel:
                    print(f"  ERROR  malformed append array selector: {array_sel!r}")
                    errors += 1
                    continue
                vid = m_sel.group(1)
                result = writer.add_youtube_performer(
                    musicians_path,
                    musician_id=musician_id,
                    video_id=vid,
                    performer=value,
                )
            elif array_sel.startswith("youtube[") and ".subjects" in array_sel:
                import re as _re
                m_sel = _re.match(r"youtube\[([A-Za-z0-9_-]{11})\]\.subjects\.(.*)", array_sel)
                if not m_sel:
                    print(f"  ERROR  malformed append array selector: {array_sel!r}")
                    errors += 1
                    continue
                vid     = m_sel.group(1)
                sub_key = m_sel.group(2)  # e.g. "raga_ids"
                result = writer.add_lecdem_subject(
                    musicians_path,
                    musician_id=musician_id,
                    video_id=vid,
                    subject_key=sub_key,
                    subject_value=value,
                )
            else:
                print(f"  ERROR  musician append: unsupported array selector {array_sel!r}.")
                errors += 1
                continue
            _print_result(result)
            if result.ok:       added   += 1
            elif result.skipped: skipped += 1
            else:                errors  += 1
            continue

        # ── v2: annotate musician with a note ─────────────────────────────────
        if op == "annotate":
            result = writer.add_note(
                entity_type="musician", entity_id=m.get("id", ""),
                note_text=m.get("note", {}).get("text", ""),
                source_url=m.get("note", {}).get("source_url"),
                added_at=m.get("note", {}).get("added_at"),
                musicians_path=musicians_path,
            )
            _print_result(result)
            if result.ok:       added   += 1
            elif result.skipped: skipped += 1
            else:                errors  += 1
            continue

        # ── v1 compat: youtube_append ─────────────────────────────────────────
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
                    kind=yt.get("kind"),
                    subjects=yt.get("subjects"),
                    compositions_path=comp_path,
                    ragas_path=ragas_path,
                )
                _print_result(result)
                if result.ok:       added   += 1
                elif result.skipped: skipped += 1
                else:                errors  += 1
            continue

        # ── unknown v2 op (op was set but not recognised) ─────────────────────
        if op is not None and op != "create":
            print(f"  ERROR  musician item has unknown op '{op}'. Known ops: create, patch, append, annotate.")
            errors += 1
            continue

        # ── create (default) — add new musician node + YouTube entries ─────────
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
        if result.ok:       added   += 1
        elif result.skipped: skipped += 1
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
                kind=yt.get("kind"),
                subjects=yt.get("subjects"),
                compositions_path=comp_path,
                ragas_path=ragas_path,
            )
            _print_result(yt_result)
            if yt_result.ok:       added   += 1
            elif yt_result.skipped: skipped += 1
            else:                   errors  += 1

    return added, skipped, errors



def _process_compositions(
    compositions: list[dict],
    writer: CarnaticWriter,
    comp_path: Path,
    ragas_path: Path,
) -> tuple[int, int, int]:
    added = skipped = errors = 0
    for c in compositions:
        op = c.get("op", "create")

        if op == "patch":
            comp_id = c.get("id")
            field   = c.get("field")
            value   = c.get("value")
            if not comp_id or not field:
                print(f"  ERROR  composition patch missing 'id' or 'field': {c}")
                errors += 1
                continue
            result = writer.patch_composition(
                comp_path, composition_id=comp_id, field=field, value=value,
            )

        elif op == "annotate":
            result = writer.add_note(
                entity_type="composition", entity_id=c.get("id", ""),
                note_text=c.get("note", {}).get("text", ""),
                source_url=c.get("note", {}).get("source_url"),
                added_at=c.get("note", {}).get("added_at"),
                compositions_path=comp_path,
            )

        elif op == "create":
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

        else:
            print(f"  ERROR  composition item has unknown op '{op}'. Known ops: create, patch, annotate.")
            errors += 1
            continue

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
    writer: CarnaticWriter,
) -> tuple[int, int, int]:
    added = skipped = errors = 0
    if not recordings_path.exists():
        recordings_path.mkdir(parents=True, exist_ok=True)
    for rec in recordings:
        op = rec.get("op", "create")

        if op == "patch":
            rec_id = rec.get("id")
            field  = rec.get("field")
            value  = rec.get("value")
            if not rec_id or not field:
                print(f"  ERROR  recording patch missing 'id' or 'field': {rec}")
                errors += 1
                continue
            result = writer.patch_recording_outer(
                recording_id=rec_id, field=field, value=value,
                recordings_path=recordings_path,
            )
            _print_result(result)
            if result.ok:       added   += 1
            elif result.skipped: skipped += 1
            else:                errors  += 1
            continue

        if op == "annotate":
            result = writer.add_note(
                entity_type="recording", entity_id=rec.get("id", ""),
                note_text=rec.get("note", {}).get("text", ""),
                source_url=rec.get("note", {}).get("source_url"),
                added_at=rec.get("note", {}).get("added_at"),
                recordings_path=recordings_path,
            )
            _print_result(result)
            if result.ok:       added   += 1
            elif result.skipped: skipped += 1
            else:                errors  += 1
            continue

        if op not in ("create", None):  # reject unknown ops
            print(f"  ERROR  recording item has unknown op '{op}'. Known ops: create, patch, annotate.")
            errors += 1
            continue

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
        op = e.get("op", "create")

        if op == "patch":
            source = e.get("source")
            target = e.get("target")
            field  = e.get("field")
            value  = e.get("value")
            if not source or not target or not field:
                print(f"  ERROR  edge patch missing 'source', 'target', or 'field': {e}")
                errors += 1
                continue
            result = writer.patch_edge(
                musicians_path, source=source, target=target, field=field, value=value,
            )
            _print_result(result)
            if result.ok:       added   += 1
            elif result.skipped: skipped += 1
            else:                errors  += 1
            continue

        if op not in ("create", None):
            print(f"  ERROR  edge item has unknown op '{op}'. Known ops: create, patch.")
            errors += 1
            continue

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

    MAX_VERSION = 2
    KNOWN_ITEM_TYPES = {"ragas", "composers", "musicians", "compositions", "recordings", "edges"}

    schema_version = bundle.get("schema_version", 1)
    if schema_version > MAX_VERSION:
        print(
            f"ERROR: bundle is schema_version {schema_version}, but this bani-add supports up "
            f"to schema_version {MAX_VERSION}. Upgrade carnatic/ to ingest.",
            file=sys.stderr,
        )
        sys.exit(1)

    items = bundle.get("items", {})
    unknown_keys = set(items.keys()) - KNOWN_ITEM_TYPES
    if unknown_keys:
        print(
            f"ERROR: bundle contains unknown item type(s) {sorted(unknown_keys)!r}. "
            f"Known types: {', '.join(sorted(KNOWN_ITEM_TYPES))}.",
            file=sys.stderr,
        )
        sys.exit(1)

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
        a, s, e = _process_musicians(musicians, writer, musicians_path, comp_path, ragas_path)
        total_added += a; total_skipped += s; total_errors += e

    # ── compositions ──────────────────────────────────────────────────────────
    if compositions:
        print(f"\nCompositions ({len(compositions)}):")
        a, s, e = _process_compositions(compositions, writer, comp_path, ragas_path)
        total_added += a; total_skipped += s; total_errors += e

    # ── recordings ────────────────────────────────────────────────────────────
    if recordings:
        print(f"\nRecordings ({len(recordings)}):")
        a, s, e = _process_recordings(recordings, recordings_path, writer)
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
