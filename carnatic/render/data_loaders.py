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


def load_compositions(compositions_file: Path) -> dict:
    """Load compositions.json; return empty structure if absent."""
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
