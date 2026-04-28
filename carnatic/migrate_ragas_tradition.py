#!/usr/bin/env python3
"""
migrate_ragas_tradition.py — Backfill tradition: "carnatic" on every existing raga file (ADR-112).

Reads all JSON files in carnatic/data/ragas/*.json.
For each file:
  - If "tradition" key is absent, inserts "tradition": "carnatic" after "id" and "name".
  - If "tradition" is already present, leaves it unchanged (idempotent).
  - Writes back only if changed.

Prints a summary: how many files updated, how many already had the field.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def _insert_tradition_carnatic(obj: dict) -> dict:
    """Return a new ordered dict with tradition: carnatic inserted after id/name.

    Insertion point: after "name" if present, else after "id", else at the top.
    """
    if "tradition" in obj:
        return obj

    keys = list(obj.keys())
    # Find the rightmost anchor key ("name" preferred over "id")
    insert_after: str | None = None
    for k in keys:
        if k in ("id", "name"):
            insert_after = k  # "name" wins if both present (it comes later)

    new_obj: dict = {}
    for key in keys:
        new_obj[key] = obj[key]
        if key == insert_after:
            new_obj["tradition"] = "carnatic"

    if "tradition" not in new_obj:
        # Fallback: prepend
        new_obj = {"tradition": "carnatic", **obj}

    return new_obj


def main() -> None:
    ragas_dir = Path(__file__).parent / "data" / "ragas"
    if not ragas_dir.is_dir():
        print(f"ERROR: ragas directory not found: {ragas_dir}", file=sys.stderr)
        sys.exit(1)

    raga_files = sorted(f for f in ragas_dir.glob("*.json") if not f.name.startswith("_"))

    updated = 0
    already_had = 0

    for path in raga_files:
        obj = json.loads(path.read_text(encoding="utf-8"))
        if "tradition" in obj:
            already_had += 1
            continue

        new_obj = _insert_tradition_carnatic(obj)
        text = json.dumps(new_obj, indent=2, ensure_ascii=False) + "\n"
        path.write_text(text, encoding="utf-8")
        updated += 1

    total = updated + already_had
    print(f"Updated: {updated} files (added tradition: \"carnatic\")")
    print(f"Already had tradition field: {already_had} files")
    print(f"Total: {total} files processed")


if __name__ == "__main__":
    main()
