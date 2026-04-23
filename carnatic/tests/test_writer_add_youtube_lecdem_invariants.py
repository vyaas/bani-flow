"""
test_writer_add_youtube_lecdem_invariants.py — Rejection invariants for lecdem writes (ADR-084).

Covers every error rule from ADR-084 §2: kind enum membership, recital/lecdem
mutual exclusion, subjects structure, resolvability, parse-time guards.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

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


def _add(musicians_dir: Path, compositions_dir: Path, ragas_dir: Path, **kwargs):
    w = CarnaticWriter()
    defaults = dict(
        musician_id="test_vocalist",
        url="https://www.youtube.com/watch?v=TESTINVAR11",
        label="test",
        compositions_path=compositions_dir,
        ragas_path=ragas_dir,
    )
    defaults.update(kwargs)
    return w.add_youtube(musicians_dir, **defaults)


# ── kind enum ─────────────────────────────────────────────────────────────────

def test_invalid_kind_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(md, cp, rp, kind="tani")
    assert not r.ok and not r.skipped
    assert "kind must be one of" in r.message
    assert "tani" in r.message


def test_recital_kind_explicit_accepted(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(md, cp, rp, kind="recital")
    assert r.ok, r.message


def test_kind_none_accepted(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(md, cp, rp, kind=None)
    assert r.ok, r.message


# ── recital rejects subjects ──────────────────────────────────────────────────

def test_recital_with_subjects_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(md, cp, rp, kind="recital", subjects={"raga_ids": [], "composition_ids": [], "musician_ids": []})
    assert not r.ok and not r.skipped
    assert "subjects field is only valid on lecdem" in r.message


def test_none_kind_with_subjects_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(md, cp, rp, kind=None, subjects={"raga_ids": [], "composition_ids": [], "musician_ids": []})
    assert not r.ok and not r.skipped
    assert "subjects field is only valid on lecdem" in r.message


# ── lecdem mutual exclusion ───────────────────────────────────────────────────

def test_lecdem_with_composition_id_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(
        md, cp, rp,
        kind="lecdem",
        composition_id="inta_saukhyamu",
        subjects={"raga_ids": [], "composition_ids": [], "musician_ids": []},
    )
    assert not r.ok and not r.skipped
    assert "composition_id must be None" in r.message


def test_lecdem_with_raga_id_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(
        md, cp, rp,
        kind="lecdem",
        raga_id="bhairavi",
        subjects={"raga_ids": [], "composition_ids": [], "musician_ids": []},
    )
    assert not r.ok and not r.skipped
    assert "raga_id must be None" in r.message


# ── subjects structure ────────────────────────────────────────────────────────

def test_lecdem_missing_subjects_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(md, cp, rp, kind="lecdem")
    assert not r.ok and not r.skipped
    assert "lecdem entries must include a 'subjects' dict" in r.message


def test_lecdem_subjects_missing_key_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(md, cp, rp, kind="lecdem", subjects={"raga_ids": [], "composition_ids": []})
    assert not r.ok and not r.skipped
    assert "lecdem subjects must have keys" in r.message
    assert "missing keys" in r.message


def test_lecdem_subjects_extra_key_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(
        md, cp, rp,
        kind="lecdem",
        subjects={"raga_ids": [], "composition_ids": [], "musician_ids": [], "extra": []},
    )
    assert not r.ok and not r.skipped
    assert "unexpected keys" in r.message


def test_lecdem_subjects_non_list_value_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(
        md, cp, rp,
        kind="lecdem",
        subjects={"raga_ids": "bhairavi", "composition_ids": [], "musician_ids": []},
    )
    assert not r.ok and not r.skipped
    assert "raga_ids must be a list of strings" in r.message


# ── subject resolvability ─────────────────────────────────────────────────────

def test_lecdem_unknown_raga_subject_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(
        md, cp, rp,
        kind="lecdem",
        subjects={"raga_ids": ["nonexistent_raga"], "composition_ids": [], "musician_ids": []},
    )
    assert not r.ok and not r.skipped
    assert "subject not found" in r.message
    assert "nonexistent_raga" in r.message


def test_lecdem_unknown_composition_subject_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(
        md, cp, rp,
        kind="lecdem",
        subjects={"raga_ids": [], "composition_ids": ["no_such_comp"], "musician_ids": []},
    )
    assert not r.ok and not r.skipped
    assert "subject not found" in r.message
    assert "no_such_comp" in r.message


def test_lecdem_unknown_musician_subject_rejected(tmp_path: Path) -> None:
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(
        md, cp, rp,
        kind="lecdem",
        subjects={"raga_ids": [], "composition_ids": [], "musician_ids": ["no_such_musician"]},
    )
    assert not r.ok and not r.skipped
    assert "subject not found" in r.message
    assert "no_such_musician" in r.message


def test_lecdem_known_musician_subject_accepted(tmp_path: Path) -> None:
    """A musician id equal to the host's own id is a valid lecdem subject."""
    md, cp, rp = _make_sandbox(tmp_path)
    r = _add(md, cp, rp, url="https://www.youtube.com/watch?v=MUSCSUBJ111", kind="lecdem",
        subjects={"raga_ids": [], "composition_ids": [], "musician_ids": ["test_vocalist"]},
    )
    assert r.ok, r.message
