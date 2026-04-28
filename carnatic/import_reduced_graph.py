#!/usr/bin/env python3
"""
import_reduced_graph.py — Ingest a librarian-edited reduced-graph file.

Workflow:
  1. Load the edited file (--in).
  2. Re-project the live database into a baseline reduced-graph document.
  3. Diff baseline vs edited → ReducedDiff.
  4. Print a human-readable summary (and optionally write a report).
  5. Unless --dry-run, apply each change through CarnaticWriter:
       MusicianAdd  → writer.add_musician (first source) + add_source for the rest
       SourceAdd    → writer.add_source
       MusicianPatch → writer.patch_musician (one call per changed scalar)
       EdgeAdd      → writer.add_edge
       EdgePatch    → writer.patch_edge
  6. Print a final tally; exit non-zero if any change failed.

Removals are never applied (deletions are a human-only operation).

Usage:
    bani-import-reduced --in /tmp/reduced.json --dry-run
    bani-import-reduced --in /tmp/reduced.json
    bani-import-reduced --in /tmp/reduced.json --out-report /tmp/diff.txt

After a real (non-dry) import, run `bani-render` to regenerate graph.html.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from carnatic.export_reduced_graph import (  # noqa: E402
    EDGES_FILE,
    MUSICIANS_DIR,
    load_edges,
    load_nodes,
)
from carnatic.reduced_graph import (  # noqa: E402
    EdgeAdd,
    EdgePatch,
    MusicianAdd,
    MusicianPatch,
    ReducedDiff,
    SourceAdd,
    build_reduced,
    diff_reduced,
)
from carnatic.writer import CarnaticWriter  # noqa: E402


# ── Pretty-print the diff ─────────────────────────────────────────────────────

def format_diff(diff: ReducedDiff) -> str:
    lines: list[str] = []
    lines.append("=" * 72)
    lines.append("Reduced-graph import diff")
    lines.append("=" * 72)
    lines.append(
        f"  musician adds:    {len(diff.musician_adds)}\n"
        f"  source adds:      {len(diff.source_adds)}\n"
        f"  musician patches: {len(diff.musician_patches)}\n"
        f"  edge adds:        {len(diff.edge_adds)}\n"
        f"  edge patches:     {len(diff.edge_patches)}\n"
        f"  warnings:         {len(diff.warnings)}"
    )

    if diff.musician_adds:
        lines.append("\n-- musician adds --")
        for ma in diff.musician_adds:
            m = ma.musician
            lines.append(
                f"  + {m['id']}  {m.get('label')!r}  "
                f"({m.get('era')}, {m.get('instrument')}, "
                f"{len(m.get('sources', []))} source(s))"
            )

    if diff.source_adds:
        lines.append("\n-- source adds --")
        for sa in diff.source_adds:
            lines.append(f"  + {sa.musician_id}  {sa.source.get('label')!r}  ({sa.source.get('type')})")

    if diff.musician_patches:
        lines.append("\n-- musician patches --")
        for mp in diff.musician_patches:
            lines.append(f"  ~ {mp.musician_id}  {mp.field}: {mp.old!r} → {mp.new!r}")

    if diff.edge_adds:
        lines.append("\n-- edge adds --")
        for ea in diff.edge_adds:
            e = ea.edge
            lines.append(
                f"  + {e['source']} → {e['target']}  (c={e.get('confidence')})"
            )

    if diff.edge_patches:
        lines.append("\n-- edge patches --")
        for ep in diff.edge_patches:
            lines.append(
                f"  ~ {ep.source} → {ep.target}  {ep.field}: {ep.old!r} → {ep.new!r}"
            )

    if diff.warnings:
        lines.append("\n-- warnings --")
        for w in diff.warnings:
            lines.append(f"  ! {w}")

    lines.append("=" * 72)
    return "\n".join(lines)


# ── Apply ─────────────────────────────────────────────────────────────────────

def _validate_source(src: dict, *, context: str) -> tuple[str, str, str] | None:
    """Return (url, label, type) or None if the source is unusable."""
    url   = src.get("url")
    label = src.get("label")
    typ   = src.get("type")
    if not (url and label and typ):
        print(
            f"  FAIL [{context}]: source missing url/label/type — {src!r}",
            file=sys.stderr,
        )
        return None
    return url, label, typ


def apply_diff(
    diff: ReducedDiff,
    *,
    musicians_dir: Path,
) -> tuple[int, int]:
    """Apply each change via CarnaticWriter. Returns (applied, failed) counts."""
    writer = CarnaticWriter()
    applied = 0
    failed  = 0

    # 1. New musicians (first source via add_musician, rest via add_source).
    for ma in diff.musician_adds:
        m = ma.musician
        sources = m.get("sources", [])
        if not sources:
            print(
                f"  FAIL [musician_add {m['id']}]: at least one source is required",
                file=sys.stderr,
            )
            failed += 1
            continue

        first = _validate_source(sources[0], context=f"musician_add {m['id']}")
        if first is None:
            failed += 1
            continue
        url, label, typ = first

        result = writer.add_musician(
            musicians_dir,
            id=m["id"],
            label=m.get("label") or m["id"],
            era=m.get("era"),
            instrument=m.get("instrument"),
            source_url=url,
            source_label=label,
            source_type=typ,
            born=m.get("born"),
            died=m.get("died"),
            bani=m.get("bani"),
        )
        if not result.ok:
            print(f"  FAIL [musician_add {m['id']}]: {result.message}", file=sys.stderr)
            failed += 1
            continue
        print(f"  {result.log_prefix} {result.message}")
        applied += 1

        for extra in sources[1:]:
            triple = _validate_source(extra, context=f"musician_add {m['id']} (extra source)")
            if triple is None:
                failed += 1
                continue
            url2, label2, typ2 = triple
            r2 = writer.add_source(
                musicians_dir,
                musician_id=m["id"],
                url=url2,
                label=label2,
                type=typ2,
            )
            if not r2.ok:
                print(f"  FAIL [source_add {m['id']}]: {r2.message}", file=sys.stderr)
                failed += 1
            else:
                print(f"  {r2.log_prefix} {r2.message}")
                applied += 1

    # 2. Source adds for existing musicians.
    for sa in diff.source_adds:
        triple = _validate_source(sa.source, context=f"source_add {sa.musician_id}")
        if triple is None:
            failed += 1
            continue
        url, label, typ = triple
        result = writer.add_source(
            musicians_dir,
            musician_id=sa.musician_id,
            url=url,
            label=label,
            type=typ,
        )
        if not result.ok:
            print(f"  FAIL [source_add {sa.musician_id}]: {result.message}", file=sys.stderr)
            failed += 1
        else:
            print(f"  {result.log_prefix} {result.message}")
            applied += 1

    # 3. Musician scalar patches.
    for mp in diff.musician_patches:
        result = writer.patch_musician(
            musicians_dir,
            musician_id=mp.musician_id,
            field=mp.field,
            value=mp.new,
        )
        if not result.ok:
            print(
                f"  FAIL [musician_patch {mp.musician_id} {mp.field}]: {result.message}",
                file=sys.stderr,
            )
            failed += 1
        else:
            print(f"  {result.log_prefix} {result.message}")
            applied += 1

    # 4. New edges.
    for ea in diff.edge_adds:
        e = ea.edge
        if e.get("source_url") is None or e.get("confidence") is None:
            print(
                f"  FAIL [edge_add {e.get('source')}→{e.get('target')}]: "
                f"requires confidence and source_url",
                file=sys.stderr,
            )
            failed += 1
            continue
        try:
            confidence = float(e["confidence"])
        except (TypeError, ValueError):
            print(
                f"  FAIL [edge_add {e['source']}→{e['target']}]: "
                f"confidence must be numeric, got {e['confidence']!r}",
                file=sys.stderr,
            )
            failed += 1
            continue
        result = writer.add_edge(
            musicians_dir,
            source=e["source"],
            target=e["target"],
            confidence=confidence,
            source_url=e["source_url"],
            note=e.get("note"),
        )
        if not result.ok:
            print(
                f"  FAIL [edge_add {e['source']}→{e['target']}]: {result.message}",
                file=sys.stderr,
            )
            failed += 1
        else:
            print(f"  {result.log_prefix} {result.message}")
            applied += 1

    # 5. Edge patches.
    for ep in diff.edge_patches:
        result = writer.patch_edge(
            musicians_dir,
            source=ep.source,
            target=ep.target,
            field=ep.field,
            value=ep.new,
        )
        if not result.ok:
            print(
                f"  FAIL [edge_patch {ep.source}→{ep.target} {ep.field}]: {result.message}",
                file=sys.stderr,
            )
            failed += 1
        else:
            print(f"  {result.log_prefix} {result.message}")
            applied += 1

    return applied, failed


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import an edited reduced-graph file. Diffs vs current state and applies adds/patches.",
    )
    parser.add_argument("--in", dest="in_path", type=Path, required=True,
                        help="Path to the edited reduced-graph JSON.")
    parser.add_argument("--musicians-dir", type=Path, default=MUSICIANS_DIR,
                        help="Override musicians directory.")
    parser.add_argument("--out-report", type=Path, default=None,
                        help="Optional path to write the diff summary.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show diff without applying changes.")
    args = parser.parse_args()

    if not args.in_path.exists():
        print(f"error: input file not found: {args.in_path}", file=sys.stderr)
        return 2

    with args.in_path.open("r", encoding="utf-8") as fh:
        edited = json.load(fh)

    if edited.get("schema_version") != 1:
        print(
            f"warning: schema_version is {edited.get('schema_version')!r}; "
            f"expected 1. Proceeding anyway.",
            file=sys.stderr,
        )

    nodes = load_nodes(args.musicians_dir)
    edges = load_edges(args.musicians_dir / "_edges.json")
    baseline = build_reduced(
        nodes,
        edges,
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )

    diff = diff_reduced(baseline, edited)
    summary = format_diff(diff)
    print(summary)

    if args.out_report:
        args.out_report.parent.mkdir(parents=True, exist_ok=True)
        args.out_report.write_text(summary + "\n", encoding="utf-8")
        print(f"\nwrote diff report → {args.out_report}")

    if args.dry_run:
        print("\n[dry-run] no changes applied.")
        return 0

    if diff.is_empty():
        print("\nNo changes to apply.")
        return 0

    print("\nApplying changes...")
    applied, failed = apply_diff(diff, musicians_dir=args.musicians_dir)
    print(f"\nApplied {applied} change(s); {failed} failure(s).")
    print("Reminder: run `bani-render` to regenerate graph.html.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
