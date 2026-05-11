"""
backfill_katapayadi.py — one-shot idempotent backfill of katapayadi tuples.

Reads every melakarta entry in carnatic/data/ragas/*.json (where is_melakarta
is true), computes the canonical swara tuple from its melakarta number using
katapayadi_from_mela(), and writes the result back via CarnaticWriter.patch_raga().

Safe to re-run: if katapayadi already matches the formula, no write is performed.

Usage:
    python3 carnatic/backfill_katapayadi.py [--dry-run] [--ragas-dir PATH]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Project root is two levels up from this file
_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from carnatic.melakarta_math import katapayadi_from_mela
from carnatic.writer import CarnaticWriter


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing any files",
    )
    p.add_argument(
        "--ragas-dir",
        default=str(_ROOT / "carnatic" / "data" / "ragas"),
        help="Path to the ragas/ directory (default: carnatic/data/ragas/)",
    )
    # CarnaticWriter needs a compositions_path to locate raga storage.
    # In dir-mode, it reads/writes individual ragas/<id>.json files.
    p.add_argument(
        "--compositions-path",
        default=str(_ROOT / "carnatic" / "data" / "compositions"),
        help="Path to compositions dir or monolithic compositions.json",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    ragas_dir = Path(args.ragas_dir)
    compositions_path = Path(args.compositions_path)

    if not ragas_dir.is_dir():
        print(f"ERROR: ragas dir not found: {ragas_dir}", file=sys.stderr)
        return 1

    # Collect all raga JSON files
    raga_files = sorted(ragas_dir.glob("*.json"))
    if not raga_files:
        print(f"ERROR: no .json files in {ragas_dir}", file=sys.stderr)
        return 1

    import json

    updated = 0
    skipped = 0
    errors = 0

    writer = CarnaticWriter()

    for path in raga_files:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not data.get("is_melakarta"):
            continue

        mela_num = data.get("melakarta")
        if mela_num is None:
            print(f"  WARN {path.name}: is_melakarta=true but melakarta field is null — skipping")
            errors += 1
            continue

        try:
            expected = katapayadi_from_mela(int(mela_num))
        except ValueError as exc:
            print(f"  ERROR {path.name}: {exc}")
            errors += 1
            continue

        current = data.get("katapayadi")
        if current == expected:
            skipped += 1
            continue

        raga_id = data["id"]
        if args.dry_run:
            print(f"  DRY-RUN {raga_id}: katapayadi {current!r} → {expected!r}")
            updated += 1
            continue

        result = writer.patch_raga(
            compositions_path,
            raga_id=raga_id,
            field="katapayadi",
            value=expected,
            ragas_path=ragas_dir,
        )
        if result.ok:
            print(f"  OK  {raga_id} (mela {mela_num}): katapayadi set to {expected!r}")
            updated += 1
        else:
            print(f"  FAIL {raga_id}: {result.message}")
            errors += 1

    print(
        f"\nDone — {updated} updated, {skipped} already correct, {errors} errors"
        + (" [dry-run, no files written]" if args.dry_run else "")
    )
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
