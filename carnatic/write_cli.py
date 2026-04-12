#!/usr/bin/env python3
"""
write_cli.py — Atomic write commands for the Librarian CLI (ADR-015).

Thin wrapper over CarnaticWriter. Every subcommand:
  - Reads the relevant source file.
  - Validates all inputs against the current graph state.
  - Applies the transformation atomically (temp file + rename).
  - Prints a change-log line to stdout.
  - Exits 0 on success or duplicate-skip; exits 1 on validation failure.

Source files written: musicians.json, compositions.json only.
graph.json is a derived artefact — never touched here.
After any write session, run: python3 carnatic/render.py

Usage:
    python3 carnatic/write_cli.py add-musician     --id <id> --label <label> --era <era> \\
                                                    --instrument <inst> --source-url <url> \\
                                                    --source-label <label> --source-type <type> \\
                                                    [--born <year>] [--died <year>] [--bani <bani>]

    python3 carnatic/write_cli.py add-edge         --source <guru_id> --target <shishya_id> \\
                                                    --confidence <float> --source-url <url> \\
                                                    [--note <text>]

    python3 carnatic/write_cli.py add-youtube      --musician-id <id> --url <yt_url> \\
                                                    --label <label> \\
                                                    [--composition-id <id>] [--raga-id <id>] \\
                                                    [--year <int>] [--version <text>]

    python3 carnatic/write_cli.py add-source       --musician-id <id> --url <url> \\
                                                    --label <label> --type <type>

    python3 carnatic/write_cli.py remove-edge      --source <guru_id> --target <shishya_id>

    python3 carnatic/write_cli.py patch-musician   --id <id> --field <field> --value <value>
    # Permitted fields: label, born, died, era, instrument, bani  (id is immutable)

    python3 carnatic/write_cli.py patch-edge       --source <guru_id> --target <shishya_id> \\
                                                    --field <field> --value <value>
    # Permitted fields: confidence, source_url, note

    python3 carnatic/write_cli.py add-raga         --id <id> --name <name> \\
                                                    --source-url <url> --source-label <label> \\
                                                    --source-type <type> \\
                                                    [--aliases <csv>] [--melakarta <int>] \\
                                                    [--parent-raga <id>] [--notes <text>]

    python3 carnatic/write_cli.py add-composer     --id <id> --name <name> \\
                                                    --source-url <url> --source-label <label> \\
                                                    --source-type <type> \\
                                                    [--musician-node-id <id>] \\
                                                    [--born <year>] [--died <year>]

    python3 carnatic/write_cli.py add-composition  --id <id> --title <title> \\
                                                    --composer-id <id> --raga-id <id> \\
                                                    [--tala <tala>] [--language <lang>] \\
                                                    [--source-url <url>] [--source-label <label>] \\
                                                    [--source-type <type>] [--notes <text>]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# ── path bootstrap ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from carnatic.writer import CarnaticWriter, WriteResult  # noqa: E402


# ── default paths ──────────────────────────────────────────────────────────────

def _musicians_path() -> Path:
    return Path(__file__).parent / "data" / "musicians.json"


def _compositions_path() -> Path:
    return Path(__file__).parent / "data" / "compositions.json"


def _graph_path() -> Path:
    return Path(__file__).parent / "data" / "graph.json"


# ── result printer + exit ──────────────────────────────────────────────────────

def _finish(result: WriteResult) -> None:
    print(result.message)
    sys.exit(0 if result.exit_ok else 1)


# ── subcommand handlers ────────────────────────────────────────────────────────

def cmd_add_musician(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    born = int(args.born) if args.born is not None else None
    died = int(args.died) if args.died is not None else None
    return w.add_musician(
        _musicians_path(),
        id=args.id,
        label=args.label,
        era=args.era,
        instrument=args.instrument,
        source_url=args.source_url,
        source_label=args.source_label,
        source_type=args.source_type,
        born=born,
        died=died,
        bani=args.bani,
        graph_path=_graph_path(),
    )


def cmd_add_edge(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    return w.add_edge(
        _musicians_path(),
        source=args.source,
        target=args.target,
        confidence=float(args.confidence),
        source_url=args.source_url,
        note=args.note,
        graph_path=_graph_path(),
    )


def cmd_add_youtube(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    year = int(args.year) if args.year is not None else None
    return w.add_youtube(
        _musicians_path(),
        musician_id=args.musician_id,
        url=args.url,
        label=args.label,
        composition_id=args.composition_id,
        raga_id=args.raga_id,
        year=year,
        version=args.version,
        graph_path=_graph_path(),
    )


def cmd_add_source(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    return w.add_source(
        _musicians_path(),
        musician_id=args.musician_id,
        url=args.url,
        label=args.label,
        type=args.type,
        graph_path=_graph_path(),
    )


def cmd_remove_edge(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    return w.remove_edge(
        _musicians_path(),
        source=args.source,
        target=args.target,
        graph_path=_graph_path(),
    )


def cmd_patch_musician(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    return w.patch_musician(
        _musicians_path(),
        musician_id=args.id,
        field=args.field,
        value=args.value,
        graph_path=_graph_path(),
    )


def cmd_patch_edge(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    return w.patch_edge(
        _musicians_path(),
        source=args.source,
        target=args.target,
        field=args.field,
        value=args.value,
        graph_path=_graph_path(),
    )


def cmd_add_raga(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    aliases = [a.strip() for a in args.aliases.split(",")] if args.aliases else None
    melakarta = int(args.melakarta) if args.melakarta is not None else None
    return w.add_raga(
        _compositions_path(),
        id=args.id,
        name=args.name,
        source_url=args.source_url,
        source_label=args.source_label,
        source_type=args.source_type,
        aliases=aliases,
        melakarta=melakarta,
        parent_raga=args.parent_raga,
        notes=args.notes,
        graph_path=_graph_path(),
    )


def cmd_add_composer(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    born = int(args.born) if args.born is not None else None
    died = int(args.died) if args.died is not None else None
    return w.add_composer(
        _compositions_path(),
        id=args.id,
        name=args.name,
        source_url=args.source_url,
        source_label=args.source_label,
        source_type=args.source_type,
        musician_node_id=args.musician_node_id,
        born=born,
        died=died,
        musicians_path=_musicians_path(),
        graph_path=_graph_path(),
    )


def cmd_add_composition(w: CarnaticWriter, args: argparse.Namespace) -> WriteResult:
    return w.add_composition(
        _compositions_path(),
        id=args.id,
        title=args.title,
        composer_id=args.composer_id,
        raga_id=args.raga_id,
        tala=args.tala,
        language=args.language,
        source_url=args.source_url,
        source_label=args.source_label,
        source_type=args.source_type,
        notes=args.notes,
        graph_path=_graph_path(),
    )


# ── argument parser ────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="write_cli.py",
        description=(
            "Atomic write commands for musicians.json and compositions.json (ADR-015).\n"
            "Exit 0 = written or duplicate-skipped. Exit 1 = validation error (file unchanged)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="subcommand", metavar="<subcommand>")
    sub.required = True

    # ── add-musician ──────────────────────────────────────────────────────────
    p = sub.add_parser("add-musician", help="Add a new musician node to musicians.json")
    p.add_argument("--id",           required=True,  help="snake_case unique id")
    p.add_argument("--label",        required=True,  help="Display name")
    p.add_argument("--era",          required=True,
                   help="Era enum: trinity|bridge|golden_age|disseminator|living_pillars|contemporary")
    p.add_argument("--instrument",   required=True,  help="Instrument (vocal, veena, violin, …)")
    p.add_argument("--source-url",   required=True,  dest="source_url",  help="Primary source URL")
    p.add_argument("--source-label", required=True,  dest="source_label", help="Source label (e.g. Wikipedia)")
    p.add_argument("--source-type",  required=True,  dest="source_type",
                   help="Source type: wikipedia|pdf|article|archive|other")
    p.add_argument("--born",         default=None,   help="Birth year (integer)")
    p.add_argument("--died",         default=None,   help="Death year (integer)")
    p.add_argument("--bani",         default=None,   help="Bani/style lineage label")

    # ── add-edge ──────────────────────────────────────────────────────────────
    p = sub.add_parser("add-edge", help="Add a guru-shishya edge to musicians.json")
    p.add_argument("--source",     required=True,              help="Guru musician id")
    p.add_argument("--target",     required=True,              help="Shishya musician id")
    p.add_argument("--confidence", required=True, type=float,  help="Confidence float [0.0–1.0]")
    p.add_argument("--source-url", required=True, dest="source_url", help="Evidence URL")
    p.add_argument("--note",       default=None,               help="Qualifying note (required if confidence < 0.70)")

    # ── add-youtube ───────────────────────────────────────────────────────────
    p = sub.add_parser("add-youtube", help="Append a YouTube entry to a musician node")
    p.add_argument("--musician-id",    required=True, dest="musician_id", help="Musician node id")
    p.add_argument("--url",            required=True,                     help="YouTube URL")
    p.add_argument("--label",          required=True,                     help="Display label")
    p.add_argument("--composition-id", default=None,  dest="composition_id", help="Composition id (optional)")
    p.add_argument("--raga-id",        default=None,  dest="raga_id",        help="Raga id (optional)")
    p.add_argument("--year",           default=None,                         help="Year (integer, optional)")
    p.add_argument("--version",        default=None,                         help="Version note (optional)")

    # ── add-source ────────────────────────────────────────────────────────────
    p = sub.add_parser("add-source", help="Append a source to a musician node's sources[]")
    p.add_argument("--musician-id", required=True, dest="musician_id", help="Musician node id")
    p.add_argument("--url",         required=True,                     help="Source URL")
    p.add_argument("--label",       required=True,                     help="Source label")
    p.add_argument("--type",        required=True,
                   help="Source type: wikipedia|pdf|article|archive|other")

    # ── remove-edge ───────────────────────────────────────────────────────────
    p = sub.add_parser("remove-edge", help="Remove a guru-shishya edge from musicians.json")
    p.add_argument("--source", required=True, help="Guru musician id")
    p.add_argument("--target", required=True, help="Shishya musician id")

    # ── patch-musician ────────────────────────────────────────────────────────
    p = sub.add_parser("patch-musician", help="Update a scalar field on a musician node")
    p.add_argument("--id",    required=True, help="Musician node id")
    p.add_argument("--field", required=True,
                   help="Field to patch: label|born|died|era|instrument|bani")
    p.add_argument("--value", required=True, help="New value (use 'null' for born/died)")

    # ── patch-edge ────────────────────────────────────────────────────────────
    p = sub.add_parser("patch-edge", help="Update a field on an existing edge")
    p.add_argument("--source", required=True, help="Guru musician id")
    p.add_argument("--target", required=True, help="Shishya musician id")
    p.add_argument("--field",  required=True,
                   help="Field to patch: confidence|source_url|note")
    p.add_argument("--value",  required=True, help="New value")

    # ── add-raga ──────────────────────────────────────────────────────────────
    p = sub.add_parser("add-raga", help="Add a new raga to compositions.json")
    p.add_argument("--id",           required=True,              help="snake_case unique id")
    p.add_argument("--name",         required=True,              help="Canonical raga name")
    p.add_argument("--source-url",   required=True, dest="source_url",   help="Primary source URL")
    p.add_argument("--source-label", required=True, dest="source_label", help="Source label")
    p.add_argument("--source-type",  required=True, dest="source_type",
                   help="Source type: wikipedia|pdf|article|archive|other")
    p.add_argument("--aliases",      default=None,  help="Comma-separated alias names")
    p.add_argument("--melakarta",    default=None,  help="Melakarta number [1–72]")
    p.add_argument("--parent-raga",  default=None,  dest="parent_raga", help="Parent raga id")
    p.add_argument("--notes",        default=None,  help="Free-text musicological notes")

    # ── add-composer ──────────────────────────────────────────────────────────
    p = sub.add_parser("add-composer", help="Add a new composer to compositions.json")
    p.add_argument("--id",               required=True,              help="snake_case unique id")
    p.add_argument("--name",             required=True,              help="Canonical composer name")
    p.add_argument("--source-url",       required=True, dest="source_url",   help="Primary source URL")
    p.add_argument("--source-label",     required=True, dest="source_label", help="Source label")
    p.add_argument("--source-type",      required=True, dest="source_type",
                   help="Source type: wikipedia|pdf|article|archive|other")
    p.add_argument("--musician-node-id", default=None,  dest="musician_node_id",
                   help="Musician node id if composer is also a lineage node")
    p.add_argument("--born",             default=None,  help="Birth year (integer)")
    p.add_argument("--died",             default=None,  help="Death year (integer)")

    # ── add-composition ───────────────────────────────────────────────────────
    p = sub.add_parser("add-composition", help="Add a new composition to compositions.json")
    p.add_argument("--id",           required=True,              help="snake_case unique id")
    p.add_argument("--title",        required=True,              help="Canonical composition title")
    p.add_argument("--composer-id",  required=True, dest="composer_id", help="Composer id (must exist)")
    p.add_argument("--raga-id",      required=True, dest="raga_id",     help="Raga id (must exist)")
    p.add_argument("--tala",         default=None,  help="Tala (e.g. adi, rupaka)")
    p.add_argument("--language",     default=None,  help="Language (e.g. telugu, tamil)")
    p.add_argument("--source-url",   default=None,  dest="source_url",   help="Source URL (optional)")
    p.add_argument("--source-label", default=None,  dest="source_label", help="Source label (optional)")
    p.add_argument("--source-type",  default=None,  dest="source_type",
                   help="Source type: wikipedia|pdf|article|archive|other")
    p.add_argument("--notes",        default=None,  help="Free-text notes")

    return parser


# ── dispatch table ─────────────────────────────────────────────────────────────

HANDLERS = {
    "add-musician":    cmd_add_musician,
    "add-edge":        cmd_add_edge,
    "add-youtube":     cmd_add_youtube,
    "add-source":      cmd_add_source,
    "remove-edge":     cmd_remove_edge,
    "patch-musician":  cmd_patch_musician,
    "patch-edge":      cmd_patch_edge,
    "add-raga":        cmd_add_raga,
    "add-composer":    cmd_add_composer,
    "add-composition": cmd_add_composition,
}


# ── entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    w = CarnaticWriter()
    handler = HANDLERS[args.subcommand]
    result = handler(w, args)
    _finish(result)


if __name__ == "__main__":
    main()
