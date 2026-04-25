#!/usr/bin/env python3
"""
bani_add.py — Consume a bani-add bundle JSON and populate the data directories.

Usage:
    bani-add  bundle.json
    python3 carnatic/bani_add.py  bundle.json

Bundle schema reference: ADR-083 (plans/ADR-083-bani-add-bundle-canonical-write-channel.md).
Delta ops (schema_version 2): ADR-097 (plans/ADR-097-bundle-deltas-and-unified-edit-forms.md).
Dependency resolution: ADR-099 (plans/ADR-099-bundle-dependency-resolution.md).

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

Processing order (ADR-099): two-pass ingest.
  Pass 1 (creates): all op=="create" items, topologically sorted by intra-bundle
    dependency so that referenced entities are created before their dependents.
  Pass 2 (mutations): all patch/append/annotate items in authored order.

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
import re
import sys
import tempfile
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

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
    """Print a WriteResult, augmenting unknown-reference errors with bundle context."""
    msg = result.message
    if _BUNDLE_CREATE_IDS and not result.ok and not result.skipped:
        msg = _maybe_augment_error(msg, _BUNDLE_CREATE_IDS)
    print(f"  {msg}")


def _summary_line(added: int, skipped: int, errors: int) -> str:
    parts = [f"Added {added}", f"Skipped {skipped}", f"Errors {errors}"]
    return "  " + " · ".join(parts)


# ── dependency resolution (ADR-099) ───────────────────────────────────────────

# Canonical bucket processing order (ADR-083). Used as stable tiebreaker in the
# topological sort and as the partition key for the create-pass summary.
BUCKET_ORDER = ["ragas", "composers", "compositions", "musicians", "recordings", "edges"]

# Module-level context set by _run_bundle() before Pass 2 so that _print_result
# can augment "unknown reference" error messages without changing every processor
# signature. Reset to frozenset() after _run_bundle() returns.
_BUNDLE_CREATE_IDS: frozenset[str] = frozenset()


class _CreateItem(NamedTuple):
    bucket: str
    item: dict
    item_id: str       # canonical id referenced by other items in the bundle
    bucket_idx: int    # index in BUCKET_ORDER — stable sort tiebreaker (tier 1)
    authored_idx: int  # position within the bucket list — stable sort tiebreaker (tier 2)


def _maybe_augment_error(message: str, bundle_create_ids: frozenset[str]) -> str:
    """Append '(also missing in this bundle)' when the unresolved id was a bundle create."""
    m = re.search(r"unknown \w+ '([^']+)'", message)
    if m and m.group(1) in bundle_create_ids:
        return message + " (also missing in this bundle)"
    return message


def _collect_create_items(items: dict) -> list[_CreateItem]:
    """Return every create item across all buckets, preserving authored order."""
    result: list[_CreateItem] = []
    for b_idx, bucket in enumerate(BUCKET_ORDER):
        for a_idx, item in enumerate(items.get(bucket, [])):
            op = item.get("op", "create")
            # v1 compat: musicians with type="youtube_append" are mutations, not creates
            if bucket == "musicians" and item.get("type") == "youtube_append":
                continue
            # patch / append / annotate are mutations — they belong to Pass 2
            if op not in ("create", None):
                continue
            # Synthesise a stable id key for edges (no single "id" field)
            if bucket == "edges":
                item_id = f"edges:{item.get('source', '')}:{item.get('target', '')}"
            else:
                item_id = item.get("id", "")
            result.append(_CreateItem(
                bucket=bucket, item=item, item_id=item_id,
                bucket_idx=b_idx, authored_idx=a_idx,
            ))
    return result


def _extract_refs(bucket: str, item: dict) -> set[str]:
    """Return the set of ids that this create item references (ADR-099 §2 table).

    Only ids that might also be *create* items in the same bundle matter for the
    topological sort; references to ids that only exist on disk are validated
    by the writer (unchanged), not by the sort.
    """
    refs: set[str] = set()

    if bucket == "ragas":
        if pr := item.get("parent_raga"):
            refs.add(pr)

    elif bucket == "composers":
        pass  # composers reference nothing in the §2 table

    elif bucket == "compositions":
        if ci := item.get("composer_id"):
            refs.add(ci)
        if ri := item.get("raga_id"):
            refs.add(ri)

    elif bucket == "musicians":
        for yt in item.get("youtube", []) or []:
            if ci := yt.get("composition_id"):
                refs.add(ci)
            if ri := yt.get("raga_id"):
                refs.add(ri)
            for perf in yt.get("performers", []) or []:
                if mi := perf.get("musician_id"):
                    refs.add(mi)
            subj = yt.get("subjects") or {}
            for id_list in (
                subj.get("raga_ids") or [],
                subj.get("composition_ids") or [],
                subj.get("musician_ids") or [],
            ):
                for sid in id_list:
                    refs.add(sid)

    elif bucket == "recordings":
        for session in item.get("sessions", []) or []:
            for perf in session.get("performers", []) or []:
                if mi := perf.get("musician_id"):
                    refs.add(mi)
            for performance in session.get("performances", []) or []:
                for field in ("composition_id", "raga_id", "composer_id"):
                    if val := performance.get(field):
                        refs.add(val)

    elif bucket == "edges":
        if src := item.get("source"):
            refs.add(src)
        if tgt := item.get("target"):
            refs.add(tgt)

    return refs


def _topo_sort_creates(
    creates: list[_CreateItem],
) -> tuple[list[_CreateItem], list[_CreateItem]]:
    """Topological sort of create items by intra-bundle dependency (ADR-099 §2).

    Uses Kahn's algorithm. Stable tiebreaker: bucket order (BUCKET_ORDER index),
    then authored order within the bucket. This makes the sort deterministic
    across runs and across contributors authoring the same set of items.

    Returns (sorted_items, cycle_items). cycle_items are nodes that could not be
    processed due to a dependency cycle; the caller is responsible for logging a
    WARN and attempting them anyway (ADR-099 §2 cycle-handling).
    """
    by_id: dict[str, _CreateItem] = {ci.item_id: ci for ci in creates}

    # deps[id] = set of ids that 'id' depends on (must be created before 'id')
    # rdeps[id] = set of ids that depend on 'id'
    deps: dict[str, set[str]] = {ci.item_id: set() for ci in creates}
    rdeps: dict[str, set[str]] = {ci.item_id: set() for ci in creates}

    for ci in creates:
        for ref in _extract_refs(ci.bucket, ci.item):
            if ref in by_id and ref != ci.item_id:
                deps[ci.item_id].add(ref)
                rdeps[ref].add(ci.item_id)

    indegree: dict[str, int] = {iid: len(d) for iid, d in deps.items()}

    def _sort_key(iid: str) -> tuple[int, int]:
        ci = by_id[iid]
        return (ci.bucket_idx, ci.authored_idx)

    # Seed with zero-indegree nodes in stable order
    queue: list[str] = sorted(
        (iid for iid, deg in indegree.items() if deg == 0),
        key=_sort_key,
    )

    sorted_items: list[_CreateItem] = []
    while queue:
        iid = queue.pop(0)
        sorted_items.append(by_id[iid])
        ready: list[str] = []
        for dep_iid in rdeps.get(iid, set()):
            indegree[dep_iid] -= 1
            if indegree[dep_iid] == 0:
                ready.append(dep_iid)
        ready.sort(key=_sort_key)
        queue.extend(ready)

    processed = {ci.item_id for ci in sorted_items}
    cycle_items = [ci for ci in creates if ci.item_id not in processed]
    return sorted_items, cycle_items


def _process_one_create(
    ci: _CreateItem,
    writer: CarnaticWriter,
    musicians_path: Path,
    comp_path: Path,
    ragas_path: Path,
    recordings_path: Path,
) -> tuple[int, int, int]:
    """Dispatch a single create item to the appropriate bucket processor."""
    bucket = ci.bucket
    item = ci.item
    if bucket == "ragas":
        return _process_ragas([item], writer, comp_path, ragas_path)
    elif bucket == "composers":
        return _process_composers([item], writer, comp_path, musicians_path)
    elif bucket == "musicians":
        return _process_musicians([item], writer, musicians_path, comp_path, ragas_path)
    elif bucket == "compositions":
        return _process_compositions([item], writer, comp_path, ragas_path)
    elif bucket == "recordings":
        return _process_recordings([item], recordings_path, writer)
    elif bucket == "edges":
        return _process_edges([item], writer, musicians_path)
    return 0, 0, 1


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
            print(f"  ERROR  recording item has unknown op '{op}'. Known ops: create, annotate.")
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

def _run_bundle(
    bundle: dict,
    writer: CarnaticWriter,
    musicians_path: Path,
    comp_path: Path,
    ragas_path: Path,
    recordings_path: Path,
) -> int:
    """Two-pass bundle ingestion (ADR-099).

    Pass 1 — Creates: every op=='create' item across all buckets, sorted
      topologically so that referenced entities exist before their dependents.
    Pass 2 — Mutations: every patch/append/annotate item in authored order,
      grouped by bucket for log clarity.

    Returns total error count.
    """
    global _BUNDLE_CREATE_IDS

    items = bundle.get("items", {})

    # ── Pass 1: collect and sort creates ──────────────────────────────────────
    all_creates = _collect_create_items(items)
    sorted_creates, cycle_creates = _topo_sort_creates(all_creates)

    if cycle_creates:
        cycle_ids = [ci.item_id for ci in cycle_creates]
        print(f"\nWARN: dependency cycle in create pass: {cycle_ids}")
        print("  Attempting cycle items in bucket order; unresolvable references will error.")
        cycle_creates.sort(key=lambda ci: (ci.bucket_idx, ci.authored_idx))
        sorted_creates.extend(cycle_creates)

    # Expose all bundle create ids so _print_result can augment error messages
    # in Pass 2 when a mutation references a create that never landed on disk.
    _BUNDLE_CREATE_IDS = frozenset(ci.item_id for ci in all_creates)

    pass1_counts: dict[str, list[int]] = {b: [0, 0, 0] for b in BUCKET_ORDER}

    if sorted_creates:
        print("\n[CREATE PASS]")
        for ci in sorted_creates:
            a, s, e = _process_one_create(
                ci, writer, musicians_path, comp_path, ragas_path, recordings_path,
            )
            pass1_counts[ci.bucket][0] += a
            pass1_counts[ci.bucket][1] += s
            pass1_counts[ci.bucket][2] += e
        print()
        for bucket in BUCKET_ORDER:
            a, s, e = pass1_counts[bucket]
            if a or s or e:
                print(f"  {bucket:<14}  +{a}  (skipped {s}, errors {e})" if (s or e) else f"  {bucket:<14}  +{a}")

    # ── Pass 2: collect mutations (authored order, grouped by bucket) ─────────
    mutations: dict[str, list[dict]] = {b: [] for b in BUCKET_ORDER}
    for bucket in BUCKET_ORDER:
        for item in items.get(bucket, []):
            op = item.get("op", "create")
            # v1 compat: youtube_append is a mutation
            if bucket == "musicians" and item.get("type") == "youtube_append":
                mutations[bucket].append(item)
                continue
            if op in ("patch", "append", "annotate"):
                mutations[bucket].append(item)

    pass2_has_items = any(mutations[b] for b in BUCKET_ORDER)
    pass2_counts: dict[str, list[int]] = {b: [0, 0, 0] for b in BUCKET_ORDER}

    if pass2_has_items:
        print("\n[MUTATION PASS]")
        for bucket in BUCKET_ORDER:
            if not mutations[bucket]:
                continue
            print(f"\n{bucket.capitalize()} ({len(mutations[bucket])}):")
            if bucket == "ragas":
                a, s, e = _process_ragas(mutations[bucket], writer, comp_path, ragas_path)
            elif bucket == "composers":
                a, s, e = _process_composers(mutations[bucket], writer, comp_path, musicians_path)
            elif bucket == "musicians":
                a, s, e = _process_musicians(mutations[bucket], writer, musicians_path, comp_path, ragas_path)
            elif bucket == "compositions":
                a, s, e = _process_compositions(mutations[bucket], writer, comp_path, ragas_path)
            elif bucket == "recordings":
                a, s, e = _process_recordings(mutations[bucket], recordings_path, writer)
            elif bucket == "edges":
                a, s, e = _process_edges(mutations[bucket], writer, musicians_path)
            else:
                a = s = e = 0
            pass2_counts[bucket] = [a, s, e]

    # ── tally ──────────────────────────────────────────────────────────────────
    total_added = total_skipped = total_errors = 0
    for bucket in BUCKET_ORDER:
        for counts in (pass1_counts[bucket], pass2_counts.get(bucket, [0, 0, 0])):
            total_added   += counts[0]
            total_skipped += counts[1]
            total_errors  += counts[2]

    # Reset module-level context
    _BUNDLE_CREATE_IDS = frozenset()

    print()
    print(_summary_line(total_added, total_skipped, total_errors))
    print()
    print("  Run `bani-render` to update the visualization.")

    return total_errors


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

    writer          = CarnaticWriter()
    musicians_path  = _default_musicians_path()
    comp_path       = _default_compositions_path()
    ragas_path      = _default_ragas_path()
    recordings_path = _default_recordings_path()

    total_errors = _run_bundle(
        bundle, writer, musicians_path, comp_path, ragas_path, recordings_path,
    )

    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
