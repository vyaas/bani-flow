#!/usr/bin/env python3
"""
merge_melakarta.py — merge missing melakarta ragas from melakarta_new.json
into compositions.json ragas[].

Only ragas present in melakarta_new.json but absent from compositions.json
are inserted. Existing ragas are never modified.

The merged ragas[] list is sorted by melakarta number (nulls last), then by id.

Usage:
    python3 carnatic/merge_melakarta.py [--dry-run]

Flags:
    --dry-run   Print what would be added; do not write.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
COMPOSITIONS = ROOT / "carnatic" / "data" / "compositions.json"
MELAKARTA_NEW = ROOT / "carnatic" / "data" / "melakarta_new.json"


def _sort_key(raga: dict) -> tuple:
    mela = raga.get("melakarta")
    return (0 if mela is not None else 1, mela or 0, raga["id"])


def merge(dry_run: bool = False) -> None:
    with COMPOSITIONS.open() as f:
        comp = json.load(f)

    with MELAKARTA_NEW.open() as f:
        new_ragas: list[dict] = json.load(f)

    existing_ids = {r["id"] for r in comp["ragas"]}
    existing_mela_nums = {r["melakarta"] for r in comp["ragas"] if r.get("melakarta") is not None}

    skipped = []
    to_add = []
    for r in new_ragas:
        if r["id"] in existing_ids:
            continue
        mela_num = r.get("melakarta")
        if mela_num is not None and mela_num in existing_mela_nums:
            skipped.append(r)
            continue
        to_add.append(r)

    if skipped:
        print(f"{'[DRY-RUN] ' if dry_run else ''}Skipping {len(skipped)} raga(s) — melakarta number already present under a different id:")
        for r in sorted(skipped, key=lambda x: x.get("melakarta", 0)):
            existing = next(e for e in comp["ragas"] if e.get("melakarta") == r["melakarta"])
            print(f"  [SKIP] {r['id']} (mela={r['melakarta']}) — conflicts with existing id '{existing['id']}'")
        print("  → Librarian action required: add the new id as an alias on the existing node, then remove the duplicate.")
        print()

    if not to_add:
        print("Nothing to add — all melakarta ragas already present in compositions.json.")
        return

    print(f"{'[DRY-RUN] ' if dry_run else ''}Adding {len(to_add)} melakarta raga(s) to compositions.json:")
    for r in sorted(to_add, key=_sort_key):
        print(f"  [RAGA+] {r['id']} ({r['name']}) mela={r['melakarta']}")

    if dry_run:
        print("\nDry-run complete. No files written.")
        return

    # Merge and re-sort
    merged = comp["ragas"] + to_add
    merged.sort(key=_sort_key)
    comp["ragas"] = merged

    with COMPOSITIONS.open("w") as f:
        json.dump(comp, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\ncompositions.json updated. ragas[] now has {len(merged)} entries.")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    merge(dry_run=dry_run)
