"""
test_writer_recording_patches.py — ADR-143 §6 recording-as-entity write verbs.

Covers patch_recording, append_to_recording_segments, patch_recording_segment,
append_to_recording_performers, annotate_recording, and the structured refusal
of append_to_recording_subject (pending architectural resolution).

All tests operate on a sandbox recordings/ directory; no project data is mutated.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from carnatic.writer import CarnaticWriter, PATCHABLE_RECORDING_FIELDS


# ── sandbox helpers ────────────────────────────────────────────────────────────


def _make_recording_sandbox(tmp_path: Path) -> tuple[Path, Path, Path]:
    """Create a recordings/ sandbox plus a minimal compositions/ + ragas/ for
    segment validation. Returns (recordings_dir, compositions_dir, ragas_dir)."""
    rec_dir = tmp_path / "recordings"
    rec_dir.mkdir()
    comp_dir = tmp_path / "compositions"
    comp_dir.mkdir()
    raga_dir = tmp_path / "ragas"
    raga_dir.mkdir()

    # Minimal raga + composition for segment validation
    (raga_dir / "begada.json").write_text(
        json.dumps({"id": "begada", "name": "Begada"}, indent=2) + "\n", encoding="utf-8"
    )
    (raga_dir / "sahana.json").write_text(
        json.dumps({"id": "sahana", "name": "Sahana"}, indent=2) + "\n", encoding="utf-8"
    )
    (comp_dir / "intha_chalamu.json").write_text(
        json.dumps(
            {"id": "intha_chalamu", "title": "Intha Chalamu", "raga_id": "begada"},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    return rec_dir, comp_dir, raga_dir


def _seed_recording(rec_dir: Path, recording_id: str = "test_concert_1932") -> Path:
    """Write a one-session recording fixture and return its path."""
    rec = {
        "id": recording_id,
        "video_id": "abc123",
        "url": "https://youtu.be/abc123",
        "title": "Test Concert — 1932",
        "short_title": "Test 1932",
        "date": "1932-01-01",
        "venue": "Old Hall",
        "occasion": "Inaugural",
        "sources": [],
        "sessions": [
            {
                "session_index": 1,
                "performers": [{"musician_id": "vina_dhanammal", "role": "veena"}],
                "performances": [
                    {
                        "performance_index": 1,
                        "timestamp": "00:00:00",
                        "offset_seconds": 0,
                        "composition_id": None,
                        "raga_id": None,
                        "display_title": "Tuning",
                    }
                ],
            }
        ],
    }
    path = rec_dir / f"{recording_id}.json"
    path.write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")
    return path


# ── patch_recording ────────────────────────────────────────────────────────────


def test_patch_recording_happy(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.patch_recording(
        recording_id="test_concert_1932",
        field="venue",
        value="Madras Music Academy",
        recordings_path=rec_dir,
    )
    assert r.exit_ok, r.message
    data = json.loads((rec_dir / "test_concert_1932.json").read_text())
    assert data["venue"] == "Madras Music Academy"


def test_patch_recording_rejects_non_whitelisted_field(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.patch_recording(
        recording_id="test_concert_1932",
        field="sessions",  # not in PATCHABLE_RECORDING_FIELDS
        value=[],
        recordings_path=rec_dir,
    )
    assert not r.exit_ok
    assert "is not patchable" in r.message


def test_patch_recording_rejects_immutable_id(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    for fld in ("id", "video_id"):
        r = w.patch_recording(
            recording_id="test_concert_1932",
            field=fld,
            value="hacked",
            recordings_path=rec_dir,
        )
        assert not r.exit_ok
        assert "immutable" in r.message


def test_patch_recording_missing_id(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    w = CarnaticWriter()
    r = w.patch_recording(
        recording_id="nope",
        field="title",
        value="x",
        recordings_path=rec_dir,
    )
    assert not r.exit_ok
    assert "does not exist" in r.message


def test_patchable_recording_fields_contains_minima(tmp_path):
    # ADR-143 §3 minima for the Recording chip's Edit form
    for field in ("title", "date", "venue", "occasion", "url"):
        assert field in PATCHABLE_RECORDING_FIELDS


# ── append_to_recording_segments ───────────────────────────────────────────────


def test_append_segment_single_session_auto(tmp_path):
    rec_dir, comp_dir, raga_dir = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.append_to_recording_segments(
        recording_id="test_concert_1932",
        segment={
            "offset_seconds": 872,
            "composition_id": "intha_chalamu",
            "raga_id": "begada",
            "display_title": "Intha Chalamu",
        },
        recordings_path=rec_dir,
        compositions_path=comp_dir,
        ragas_path=raga_dir,
    )
    assert r.exit_ok, r.message
    data = json.loads((rec_dir / "test_concert_1932.json").read_text())
    perfs = data["sessions"][0]["performances"]
    assert len(perfs) == 2
    assert perfs[-1]["composition_id"] == "intha_chalamu"
    # _offset_to_timestamp emits HH:MM:SS only when hours > 0; sub-hour values
    # use MM:SS form (872s → "14:32").
    assert perfs[-1]["timestamp"] == "14:32"


def test_append_segment_multi_session_requires_index(tmp_path):
    rec_dir, comp_dir, raga_dir = _make_recording_sandbox(tmp_path)
    path = _seed_recording(rec_dir)
    # Add a second session
    data = json.loads(path.read_text())
    data["sessions"].append(
        {"session_index": 2, "performers": [], "performances": [
            {"performance_index": 1, "timestamp": "00:00:00", "offset_seconds": 0}
        ]}
    )
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    w = CarnaticWriter()
    r = w.append_to_recording_segments(
        recording_id="test_concert_1932",
        segment={"offset_seconds": 100},
        recordings_path=rec_dir,
        compositions_path=comp_dir,
        ragas_path=raga_dir,
    )
    assert not r.exit_ok
    assert "session_index is required" in r.message


# ── patch_recording_segment ────────────────────────────────────────────────────


def test_patch_segment_by_start_happy(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.patch_recording_segment(
        recording_id="test_concert_1932",
        start="00:00:00",
        field="display_title",
        value="Tuning + Alapana",
        recordings_path=rec_dir,
    )
    assert r.exit_ok, r.message
    data = json.loads((rec_dir / "test_concert_1932.json").read_text())
    assert data["sessions"][0]["performances"][0]["display_title"] == "Tuning + Alapana"


def test_patch_segment_unknown_timestamp(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.patch_recording_segment(
        recording_id="test_concert_1932",
        start="99:99:99",
        field="display_title",
        value="x",
        recordings_path=rec_dir,
    )
    assert not r.exit_ok
    assert "no segment with start" in r.message


def test_patch_segment_ambiguous_start_refused(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    path = _seed_recording(rec_dir)
    data = json.loads(path.read_text())
    # Add a second session whose first segment shares the same start as session 1
    data["sessions"].append(
        {"session_index": 2, "performers": [], "performances": [
            {"performance_index": 1, "timestamp": "00:00:00", "offset_seconds": 0,
             "display_title": "Other tuning"}
        ]}
    )
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    w = CarnaticWriter()
    r = w.patch_recording_segment(
        recording_id="test_concert_1932",
        start="00:00:00",
        field="display_title",
        value="x",
        recordings_path=rec_dir,
    )
    assert not r.exit_ok
    assert "ambiguous" in r.message


def test_patch_segment_rejects_non_whitelisted_field(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.patch_recording_segment(
        recording_id="test_concert_1932",
        start="00:00:00",
        field="timestamp",  # not in PATCHABLE_RECORDING_PERFORMANCE_FIELDS
        value="00:01:00",
        recordings_path=rec_dir,
    )
    assert not r.exit_ok
    assert "is not patchable" in r.message


# ── append_to_recording_performers ─────────────────────────────────────────────


def test_append_performer_happy(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.append_to_recording_performers(
        recording_id="test_concert_1932",
        performer={"musician_id": "tirukkodikaval_krishna_iyer", "role": "violin"},
        recordings_path=rec_dir,
    )
    assert r.exit_ok, r.message
    data = json.loads((rec_dir / "test_concert_1932.json").read_text())
    performers = data["sessions"][0]["performers"]
    assert len(performers) == 2
    assert performers[-1] == {"musician_id": "tirukkodikaval_krishna_iyer", "role": "violin"}


def test_append_performer_duplicate_is_skipped(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.append_to_recording_performers(
        recording_id="test_concert_1932",
        performer={"musician_id": "vina_dhanammal", "role": "veena"},  # already present
        recordings_path=rec_dir,
    )
    assert "already present" in r.message
    data = json.loads((rec_dir / "test_concert_1932.json").read_text())
    assert len(data["sessions"][0]["performers"]) == 1  # unchanged


def test_append_performer_requires_role(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.append_to_recording_performers(
        recording_id="test_concert_1932",
        performer={"musician_id": "x"},
        recordings_path=rec_dir,
    )
    assert not r.exit_ok
    assert "role is required" in r.message


# ── append_to_recording_subject (structured refusal) ───────────────────────────


def test_append_subject_returns_structured_refusal(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.append_to_recording_subject(
        recording_id="test_concert_1932",
        subject_kind="raga_ids",
        subject_id="begada",
        recordings_path=rec_dir,
    )
    assert not r.exit_ok
    # Must mention the architectural reason so the bundle ingester surfaces a
    # helpful error instead of a silent drop (ADR-143 §6 contract).
    assert "Architectural decision pending" in r.message
    assert "lecdem" in r.message.lower()


def test_append_subject_invalid_kind(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.append_to_recording_subject(
        recording_id="test_concert_1932",
        subject_kind="not_a_kind",
        subject_id="x",
        recordings_path=rec_dir,
    )
    assert not r.exit_ok
    assert "is not valid" in r.message


# ── annotate_recording ─────────────────────────────────────────────────────────


def test_annotate_recording_happy(tmp_path):
    rec_dir, _, _ = _make_recording_sandbox(tmp_path)
    _seed_recording(rec_dir)
    w = CarnaticWriter()
    r = w.annotate_recording(
        recording_id="test_concert_1932",
        note_text="Restored from acetate disc; channel imbalance corrected.",
        source_url="https://example.org/restoration-notes",
        recordings_path=rec_dir,
    )
    assert r.exit_ok, r.message
    data = json.loads((rec_dir / "test_concert_1932.json").read_text())
    assert len(data["notes"]) == 1
    assert data["notes"][0]["text"].startswith("Restored from acetate")
    assert data["notes"][0]["source_url"] == "https://example.org/restoration-notes"
