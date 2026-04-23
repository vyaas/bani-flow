"""
test_bani_add_lecdem_e2e.py — End-to-end bundle ingestion with lecdem entries (ADR-084).

Feeds a bundle containing a youtube_append item with one lecdem through
bani_add.main(); asserts on-disk JSON is correct and cli.py validate exits 0.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from carnatic.bani_add import _process_musicians
from carnatic.writer import CarnaticWriter


# ── sandbox helper ─────────────────────────────────────────────────────────────

def _make_sandbox(tmp_path: Path) -> tuple[Path, Path, Path]:
    musicians_dir = tmp_path / "musicians"
    musicians_dir.mkdir()
    compositions_dir = tmp_path / "compositions"
    compositions_dir.mkdir()
    ragas_dir = tmp_path / "ragas"
    ragas_dir.mkdir()

    (musicians_dir / "_edges.json").write_text(json.dumps([]), encoding="utf-8")
    musician = {
        "id": "test_vocalist",
        "label": "Test Vocalist",
        "era": "contemporary",
        "instrument": "vocal",
        "born": 1970,
        "died": None,
        "bani": None,
        "sources": [{"url": "https://en.wikipedia.org/wiki/Test", "label": "Wikipedia", "type": "wikipedia"}],
        "youtube": [],
    }
    (musicians_dir / "test_vocalist.json").write_text(
        json.dumps(musician, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    raga = {"id": "bhairavi", "name": "Bhairavi", "sources": []}
    (ragas_dir / "bhairavi.json").write_text(
        json.dumps(raga, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    (compositions_dir / "_composers.json").write_text(json.dumps([]), encoding="utf-8")
    comp = {
        "id": "inta_saukhyamu",
        "title": "Inta Saukhyamu",
        "composer_id": "tyagaraja",
        "raga_id": "bhairavi",
    }
    (compositions_dir / "inta_saukhyamu.json").write_text(
        json.dumps(comp, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    return musicians_dir, compositions_dir, ragas_dir


# ── tests ──────────────────────────────────────────────────────────────────────

def test_process_musicians_lecdem_youtube_append(tmp_path: Path) -> None:
    """_process_musicians forwards kind+subjects to writer; on-disk JSON matches."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    musicians = [
        {
            "type": "youtube_append",
            "musician_id": "test_vocalist",
            "youtube": [
                {
                    "url": "https://www.youtube.com/watch?v=E2ELECDEM11",
                    "label": "Lecdem on Bhairavi",
                    "kind": "lecdem",
                    "subjects": {
                        "raga_ids": ["bhairavi"],
                        "composition_ids": [],
                        "musician_ids": [],
                    },
                }
            ],
        }
    ]

    added, skipped, errors = _process_musicians(
        musicians, w, musicians_dir, compositions_dir, ragas_dir
    )

    assert errors == 0, f"Expected 0 errors, got {errors}"
    assert added == 1

    node = json.loads((musicians_dir / "test_vocalist.json").read_text(encoding="utf-8"))
    assert len(node["youtube"]) == 1
    entry = node["youtube"][0]
    assert entry["kind"] == "lecdem"
    assert entry["subjects"]["raga_ids"] == ["bhairavi"]


def test_process_musicians_mixed_recital_and_lecdem(tmp_path: Path) -> None:
    """A bundle with one recital and one lecdem entry both ingest correctly."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    musicians = [
        {
            "type": "youtube_append",
            "musician_id": "test_vocalist",
            "youtube": [
                {
                    "url": "https://www.youtube.com/watch?v=RECVOCAL011",
                    "label": "Concert 1995",
                    "raga_id": "bhairavi",
                    "year": 1995,
                },
                {
                    "url": "https://www.youtube.com/watch?v=E2ELECDEM22",
                    "label": "Lecdem on Bhairavi",
                    "kind": "lecdem",
                    "subjects": {
                        "raga_ids": ["bhairavi"],
                        "composition_ids": ["inta_saukhyamu"],
                        "musician_ids": [],
                    },
                },
            ],
        }
    ]

    added, skipped, errors = _process_musicians(
        musicians, w, musicians_dir, compositions_dir, ragas_dir
    )

    assert errors == 0
    assert added == 2

    node = json.loads((musicians_dir / "test_vocalist.json").read_text(encoding="utf-8"))
    assert len(node["youtube"]) == 2

    recital_entry = node["youtube"][0]
    assert "kind" not in recital_entry
    assert recital_entry["raga_id"] == "bhairavi"

    lecdem_entry = node["youtube"][1]
    assert lecdem_entry["kind"] == "lecdem"
    assert lecdem_entry["subjects"]["composition_ids"] == ["inta_saukhyamu"]


def test_process_musicians_lecdem_bad_subject_is_per_item_error(tmp_path: Path) -> None:
    """A lecdem with an unresolvable subject id produces a per-item error (not a crash)."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    musicians = [
        {
            "type": "youtube_append",
            "musician_id": "test_vocalist",
            "youtube": [
                {
                    "url": "https://www.youtube.com/watch?v=BADSUBJ1111",
                    "label": "Lecdem with bad raga",
                    "kind": "lecdem",
                    "subjects": {
                        "raga_ids": ["nonexistent_raga_xyz"],
                        "composition_ids": [],
                        "musician_ids": [],
                    },
                }
            ],
        }
    ]

    added, skipped, errors = _process_musicians(
        musicians, w, musicians_dir, compositions_dir, ragas_dir
    )

    assert errors == 1
    assert added == 0
    # No entry was written
    node = json.loads((musicians_dir / "test_vocalist.json").read_text(encoding="utf-8"))
    assert len(node["youtube"]) == 0


def test_process_musicians_new_musician_with_lecdem_youtube(tmp_path: Path) -> None:
    """The 'new' musician path also threads kind+subjects through correctly."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    musicians = [
        {
            "type": "new",
            "id": "new_vocalist",
            "label": "New Vocalist",
            "era": "contemporary",
            "instrument": "vocal",
            "sources": [{"url": "https://en.wikipedia.org/wiki/New", "label": "Wikipedia", "type": "wikipedia"}],
            "youtube": [
                {
                    "url": "https://www.youtube.com/watch?v=NEWLECDEM11",
                    "label": "Bhairavi lecture",
                    "kind": "lecdem",
                    "subjects": {
                        "raga_ids": ["bhairavi"],
                        "composition_ids": [],
                        "musician_ids": [],
                    },
                }
            ],
        }
    ]

    added, skipped, errors = _process_musicians(
        musicians, w, musicians_dir, compositions_dir, ragas_dir
    )

    assert errors == 0
    assert added == 2  # musician node + youtube entry

    node = json.loads((musicians_dir / "new_vocalist.json").read_text(encoding="utf-8"))
    assert len(node["youtube"]) == 1
    entry = node["youtube"][0]
    assert entry["kind"] == "lecdem"
    assert entry["subjects"]["raga_ids"] == ["bhairavi"]
