"""
test_writer_add_youtube_lecdem_happy.py — Happy-path tests for lecdem youtube writes (ADR-084).

Covers: a lecdem entry with subject ids is appended to a sandbox musician;
the on-disk JSON carries kind/subjects; validate exits 0.
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from carnatic.writer import CarnaticWriter, _default_musicians_path


# ── sandbox helpers ────────────────────────────────────────────────────────────

def _make_sandbox(tmp_path: Path) -> tuple[Path, Path, Path]:
    """Return (musicians_dir, compositions_dir, ragas_dir) populated with minimal fixtures."""
    musicians_dir = tmp_path / "musicians"
    musicians_dir.mkdir()
    compositions_dir = tmp_path / "compositions"
    compositions_dir.mkdir()
    ragas_dir = tmp_path / "ragas"
    ragas_dir.mkdir()

    # One musician
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

    # One raga
    raga = {"id": "bhairavi", "name": "Bhairavi", "sources": []}
    (ragas_dir / "bhairavi.json").write_text(
        json.dumps(raga, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # One composition
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

def test_add_lecdem_with_raga_subject(tmp_path: Path) -> None:
    """Adding a lecdem with a valid raga subject appends the entry with kind+subjects."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    result = w.add_youtube(
        musicians_dir,
        musician_id="test_vocalist",
        url="https://www.youtube.com/watch?v=LECDEM11111",
        label="On Bhairavi raga",
        kind="lecdem",
        subjects={
            "raga_ids": ["bhairavi"],
            "composition_ids": [],
            "musician_ids": [],
        },
        compositions_path=compositions_dir,
        ragas_path=ragas_dir,
    )

    assert result.ok, f"Expected ok=True but got: {result.message}"
    assert result.log_prefix == "[YT+L]"

    # Verify on-disk JSON
    node = json.loads((musicians_dir / "test_vocalist.json").read_text(encoding="utf-8"))
    assert len(node["youtube"]) == 1
    entry = node["youtube"][0]
    assert entry["url"] == "https://www.youtube.com/watch?v=LECDEM11111"
    assert entry["kind"] == "lecdem"
    assert entry["subjects"]["raga_ids"] == ["bhairavi"]
    assert entry["subjects"]["composition_ids"] == []
    assert entry["subjects"]["musician_ids"] == []
    # No composition_id or raga_id at top level
    assert "composition_id" not in entry
    assert "raga_id" not in entry


def test_add_lecdem_with_composition_subject(tmp_path: Path) -> None:
    """A lecdem referencing a composition subject is stored correctly."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    result = w.add_youtube(
        musicians_dir,
        musician_id="test_vocalist",
        url="https://www.youtube.com/watch?v=LECDEM22222",
        label="On Inta Saukhyamu",
        kind="lecdem",
        subjects={
            "raga_ids": [],
            "composition_ids": ["inta_saukhyamu"],
            "musician_ids": [],
        },
        compositions_path=compositions_dir,
        ragas_path=ragas_dir,
    )

    assert result.ok, result.message
    node = json.loads((musicians_dir / "test_vocalist.json").read_text(encoding="utf-8"))
    entry = node["youtube"][0]
    assert entry["subjects"]["composition_ids"] == ["inta_saukhyamu"]


def test_add_lecdem_empty_subjects_manodharma(tmp_path: Path) -> None:
    """Empty subjects (all arrays empty) is valid — the Manodharma lecdem case."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    result = w.add_youtube(
        musicians_dir,
        musician_id="test_vocalist",
        url="https://www.youtube.com/watch?v=LECDEM33333",
        label="On Manodharma Sangita",
        kind="lecdem",
        subjects={
            "raga_ids": [],
            "composition_ids": [],
            "musician_ids": [],
        },
        compositions_path=compositions_dir,
        ragas_path=ragas_dir,
    )

    assert result.ok, result.message
    node = json.loads((musicians_dir / "test_vocalist.json").read_text(encoding="utf-8"))
    entry = node["youtube"][0]
    assert entry["kind"] == "lecdem"
    assert entry["subjects"] == {"raga_ids": [], "composition_ids": [], "musician_ids": []}


def test_recital_entry_unchanged_format(tmp_path: Path) -> None:
    """Recital entry (kind=None) must not gain 'kind' or 'subjects' keys on disk."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    result = w.add_youtube(
        musicians_dir,
        musician_id="test_vocalist",
        url="https://www.youtube.com/watch?v=RECITAL1111",
        label="Concert 1990",
        raga_id="bhairavi",
        year=1990,
        compositions_path=compositions_dir,
        ragas_path=ragas_dir,
    )

    assert result.ok, result.message
    node = json.loads((musicians_dir / "test_vocalist.json").read_text(encoding="utf-8"))
    entry = node["youtube"][0]
    assert "kind" not in entry
    assert "subjects" not in entry
    assert entry["raga_id"] == "bhairavi"
    assert entry["year"] == 1990


def test_duplicate_lecdem_url_skipped(tmp_path: Path) -> None:
    """A second add_youtube with the same video_id is skipped (idempotent)."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    url = "https://www.youtube.com/watch?v=LECDEM44444"
    subjects = {"raga_ids": ["bhairavi"], "composition_ids": [], "musician_ids": []}
    kwargs = dict(
        musician_id="test_vocalist",
        url=url,
        label="On Bhairavi",
        kind="lecdem",
        subjects=subjects,
        compositions_path=compositions_dir,
        ragas_path=ragas_dir,
    )

    r1 = w.add_youtube(musicians_dir, **kwargs)
    assert r1.ok

    r2 = w.add_youtube(musicians_dir, **kwargs)
    assert r2.skipped, f"Expected skipped=True on duplicate, got: {r2.message}"

    node = json.loads((musicians_dir / "test_vocalist.json").read_text(encoding="utf-8"))
    assert len(node["youtube"]) == 1
