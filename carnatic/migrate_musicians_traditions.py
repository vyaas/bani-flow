#!/usr/bin/env python3
"""
migrate_musicians_traditions.py — ADR-114 Phase 2.

Backfill `traditions: ["carnatic"]` on every existing musician file that
does not already carry the field.  Idempotent: files that already have
`traditions` are left unchanged.

Run once after Phase 1 lands:
    python3 carnatic/migrate_musicians_traditions.py
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path


def _atomic_write(path: Path, data: dict) -> None:
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent,
        suffix=".tmp", delete=False
    ) as f:
        f.write(text)
        tmp = Path(f.name)
    os.replace(tmp, path)


def main() -> None:
    musicians_dir = Path(__file__).parent / "data" / "musicians"
    if not musicians_dir.is_dir():
        raise SystemExit(f"ERROR: {musicians_dir} is not a directory")

    updated = 0
    already_had = 0

    for path in sorted(musicians_dir.glob("*.json")):
        if path.name.startswith("_"):
            continue  # skip _edges.json and similar meta files

        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            continue

        if "traditions" in data:
            already_had += 1
            continue

        # Insert `traditions` after `instrument` if present, otherwise after `bani`,
        # otherwise after `era`.  Fall back to inserting at the top of the object.
        keys = list(data.keys())
        insert_after = None
        for candidate in ("instrument", "bani", "era"):
            if candidate in keys:
                insert_after = candidate
                break

        new_data: dict = {}
        for k, v in data.items():
            new_data[k] = v
            if k == insert_after and "traditions" not in new_data:
                new_data["traditions"] = ["carnatic"]

        # Safety: if insert_after was never found, prepend after "id"
        if "traditions" not in new_data:
            rebuilt: dict = {}
            for k, v in data.items():
                rebuilt[k] = v
                if k == "id":
                    rebuilt["traditions"] = ["carnatic"]
            if "traditions" not in rebuilt:
                rebuilt["traditions"] = ["carnatic"]
            new_data = rebuilt

        _atomic_write(path, new_data)
        updated += 1

    print(f"migrate_musicians_traditions: {updated} files updated, {already_had} already had field.")


if __name__ == "__main__":
    main()
