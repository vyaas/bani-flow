"""
carnatic/render/data_loaders.py — Pure I/O functions for loading Carnatic data.

All functions accept explicit Path parameters so they are testable without
relying on module-level globals.
"""
import json
import re
from pathlib import Path


def yt_video_id(url: str) -> "str | None":
    """Extract an 11-character YouTube video ID from any YouTube URL form."""
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def timestamp_to_seconds(ts: str) -> int:
    """Convert 'MM:SS' or 'HH:MM:SS' to integer seconds."""
    parts = [int(p) for p in ts.strip().split(":")]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    elif len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    raise ValueError(f"Unrecognised timestamp format: {ts!r}")


def load_musicians(musicians_dir: Path, musicians_file: Path) -> dict:
    """
    Load musicians from a musicians/ directory (one .json per musician node)
    plus a _edges.json file for all guru-shishya edges.

    Node files are sorted alphabetically by name for a deterministic compile
    order.  Files whose names start with '_' (e.g. _edges.json) are skipped
    during the node glob — _edges.json is loaded explicitly.

    Falls back to the legacy monolithic musicians_file if the directory does
    not exist (backward-compatible during migration).
    """
    if musicians_dir.is_dir():
        node_files = sorted(
            f for f in musicians_dir.glob("*.json")
            if not f.name.startswith("_")
        )
        nodes = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in node_files
        ]
        edges_file = musicians_dir / "_edges.json"
        edges = (
            json.loads(edges_file.read_text(encoding="utf-8"))
            if edges_file.exists()
            else []
        )
        return {"nodes": nodes, "edges": edges}
    # legacy fallback: monolithic musicians.json
    if musicians_file.exists():
        return json.loads(musicians_file.read_text(encoding="utf-8"))
    return {"nodes": [], "edges": []}


def load_compositions(
    compositions_dir: Path,
    compositions_file: Path,
    ragas_dir: Path | None = None,
) -> dict:
    """
    Load compositions data from split directories or the legacy monolithic file.

    Directory mode (preferred):
      - ragas_dir/          → one .json per raga (bare objects); skips '_'-prefixed files
      - compositions_dir/   → one .json per composition (bare objects); skips '_'-prefixed files
      - compositions_dir/_composers.json → bare array of all composers

    Falls back to the legacy monolithic compositions_file if neither directory exists.

    ragas_dir defaults to compositions_dir.parent / "ragas" when not supplied.
    """
    _ragas_dir = ragas_dir if ragas_dir is not None else compositions_dir.parent / "ragas"

    ragas_from_dir   = _ragas_dir.is_dir()
    comps_from_dir   = compositions_dir.is_dir()

    if ragas_from_dir or comps_from_dir:
        # ── ragas ──────────────────────────────────────────────────────────
        if ragas_from_dir:
            raga_files = sorted(
                f for f in _ragas_dir.glob("*.json")
                if not f.name.startswith("_")
            )
            ragas = [json.loads(f.read_text(encoding="utf-8")) for f in raga_files]
        else:
            ragas = []

        # ── composers sidecar ──────────────────────────────────────────────
        if comps_from_dir:
            composers_file = compositions_dir / "_composers.json"
            composers = (
                json.loads(composers_file.read_text(encoding="utf-8"))
                if composers_file.exists()
                else []
            )
            # ── compositions ───────────────────────────────────────────────
            comp_files = sorted(
                f for f in compositions_dir.glob("*.json")
                if not f.name.startswith("_")
            )
            compositions = [json.loads(f.read_text(encoding="utf-8")) for f in comp_files]
        else:
            composers    = []
            compositions = []

        return {"ragas": ragas, "composers": composers, "compositions": compositions}

    # legacy fallback: monolithic compositions.json
    if compositions_file.exists():
        return json.loads(compositions_file.read_text(encoding="utf-8"))
    return {"ragas": [], "composers": [], "compositions": []}


def load_recordings(recordings_dir: Path, recordings_file: Path) -> dict:
    """
    Load recordings from a recordings/ directory (one .json per recording).
    Each file is a bare recording object — no {"recordings": [...]} wrapper.
    Files are sorted alphabetically by name for a deterministic compile order.
    Files whose names start with '_' (e.g. _index.json) are skipped.

    Falls back to the legacy monolithic recordings_file if the directory does
    not exist (backward-compatible during migration).
    """
    if recordings_dir.is_dir():
        files = sorted(
            f for f in recordings_dir.glob("*.json")
            if not f.name.startswith("_")
        )
        recordings = [
            json.loads(f.read_text(encoding="utf-8"))
            for f in files
        ]
        return {"recordings": recordings}
    # legacy fallback: monolithic recordings.json
    if recordings_file.exists():
        return json.loads(recordings_file.read_text(encoding="utf-8"))
    return {"recordings": []}


def load_tanpura(data_dir: Path) -> list:
    """Load carnatic/data/tanpura.json; return empty list if absent."""
    path = data_dir / "tanpura.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []
