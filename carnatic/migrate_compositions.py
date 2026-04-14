#!/usr/bin/env python3
"""
migrate_compositions.py — One-shot migration: split compositions.json into:

  carnatic/data/ragas/{id}.json          — one file per raga (~160 files)
  carnatic/data/compositions/{id}.json   — one file per composition (~130 files)
  carnatic/data/compositions/_composers.json  — bare array of all composers

Usage:
    python3 carnatic/migrate_compositions.py [--dry-run]

Each output file is a bare JSON object (ragas, compositions) or bare JSON array
(_composers.json).  No wrapper objects.

The source file is NOT deleted — rename or remove manually once you have
verified the render output is identical.

Prints a summary of every file written (or would write, in --dry-run mode).
"""

import json
import sys
from pathlib import Path

ROOT            = Path(__file__).parent
SOURCE_FILE     = ROOT / "data" / "compositions.json"
RAGAS_DIR       = ROOT / "data" / "ragas"
COMPS_DIR       = ROOT / "data" / "compositions"

DRY_RUN = "--dry-run" in sys.argv


def _write(path: Path, payload: str) -> None:
    path.write_text(payload + "\n", encoding="utf-8")


def main() -> None:
    if not SOURCE_FILE.exists():
        print(f"[ERROR] Source file not found: {SOURCE_FILE}")
        sys.exit(1)

    data         = json.loads(SOURCE_FILE.read_text(encoding="utf-8"))
    ragas        = data.get("ragas", [])
    composers    = data.get("composers", [])
    compositions = data.get("compositions", [])

    if not ragas and not compositions:
        print("[WARN] No ragas or compositions found in source file — nothing to migrate.")
        sys.exit(0)

    if not DRY_RUN:
        RAGAS_DIR.mkdir(parents=True, exist_ok=True)
        COMPS_DIR.mkdir(parents=True, exist_ok=True)

    written_ragas  = []
    skipped_ragas  = []
    written_comps  = []
    skipped_comps  = []

    # ── write one file per raga ───────────────────────────────────────────────
    for raga in ragas:
        raga_id = raga.get("id")
        if not raga_id:
            name = raga.get("name", "(no name)")
            print(f"[SKIP] Raga missing 'id' field: {name}")
            skipped_ragas.append(raga)
            continue

        dest    = RAGAS_DIR / f"{raga_id}.json"
        payload = json.dumps(raga, indent=2, ensure_ascii=False)

        if DRY_RUN:
            print(f"[DRY-RUN] would write → {dest.relative_to(ROOT.parent)}")
        else:
            _write(dest, payload)
            print(f"[WRITTEN] {dest.relative_to(ROOT.parent)}")

        written_ragas.append(raga_id)

    # ── write _composers.json sidecar ─────────────────────────────────────────
    composers_dest    = COMPS_DIR / "_composers.json"
    composers_payload = json.dumps(composers, indent=2, ensure_ascii=False)

    if DRY_RUN:
        print(f"[DRY-RUN] would write → {composers_dest.relative_to(ROOT.parent)}")
    else:
        _write(composers_dest, composers_payload)
        print(f"[WRITTEN] {composers_dest.relative_to(ROOT.parent)}")

    # ── write one file per composition ────────────────────────────────────────
    for comp in compositions:
        comp_id = comp.get("id")
        if not comp_id:
            title = comp.get("title", "(no title)")
            print(f"[SKIP] Composition missing 'id' field: {title}")
            skipped_comps.append(comp)
            continue

        dest    = COMPS_DIR / f"{comp_id}.json"
        payload = json.dumps(comp, indent=2, ensure_ascii=False)

        if DRY_RUN:
            print(f"[DRY-RUN] would write → {dest.relative_to(ROOT.parent)}")
        else:
            _write(dest, payload)
            print(f"[WRITTEN] {dest.relative_to(ROOT.parent)}")

        written_comps.append(comp_id)

    # ── summary ───────────────────────────────────────────────────────────────
    print()
    prefix = "[DRY-RUN] " if DRY_RUN else ""
    verb   = "would be written" if DRY_RUN else "written"
    print(
        f"{prefix}Summary: "
        f"{len(written_ragas)} raga file(s) {verb}, "
        f"1 _composers.json {verb}, "
        f"{len(written_comps)} composition file(s) {verb}"
        + (f", {len(skipped_ragas)} raga(s) skipped" if skipped_ragas else "")
        + (f", {len(skipped_comps)} composition(s) skipped" if skipped_comps else "")
    )

    if not DRY_RUN:
        print()
        print(f"Source file kept at: {SOURCE_FILE.relative_to(ROOT.parent)}")
        print("Verify with:  python3 -m carnatic.render._main")
        print("Then archive: mv carnatic/data/compositions.json carnatic/data/compositions.json.bak")


if __name__ == "__main__":
    main()
