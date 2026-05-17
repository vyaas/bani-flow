"""
test_bani_add_recording_ops.py — ADR-143 §6 v2 bundle dispatcher coverage.

Verifies that `_process_recordings` correctly routes each ADR-143 op/array
combination to the right writer method:

  op=patch    field=<top-level>                → writer.patch_recording
  op=patch    field=segments[HH:MM:SS].<f>     → writer.patch_recording_segment
  op=append   array=segments                   → writer.append_to_recording_segments
  op=append   array=performers                 → writer.append_to_recording_performers
  op=append   array=subjects.raga_ids          → writer.append_to_recording_subject
                                                  (structured refusal)
  op=annotate                                  → writer.add_note(entity_type='recording')

Legacy ADR-101 paths (`sessions[N].performances[M].field`) must still work.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from carnatic.bani_add import _process_recordings
from carnatic.writer import CarnaticWriter


# ── sandbox ────────────────────────────────────────────────────────────────────


def _seed(tmp_path: Path) -> tuple[Path, Path, Path]:
    rec_dir = tmp_path / "recordings"; rec_dir.mkdir()
    comp_dir = tmp_path / "compositions"; comp_dir.mkdir()
    raga_dir = tmp_path / "ragas"; raga_dir.mkdir()

    (raga_dir / "begada.json").write_text(
        json.dumps({"id": "begada", "name": "Begada"}) + "\n", encoding="utf-8"
    )
    (comp_dir / "intha_chalamu.json").write_text(
        json.dumps({"id": "intha_chalamu", "title": "Intha Chalamu", "raga_id": "begada"}) + "\n",
        encoding="utf-8",
    )

    rec = {
        "id": "rec_test",
        "video_id": "abc123",
        "url": "https://youtu.be/abc123",
        "title": "Original Title",
        "short_title": "Orig",
        "date": "1932-01-01",
        "venue": "Old Hall",
        "occasion": "Inaugural",
        "sources": [],
        "sessions": [
            {
                "session_index": 1,
                "performers": [{"musician_id": "vina_dhanammal", "role": "veena"}],
                "performances": [
                    {"performance_index": 1, "timestamp": "00:00:00",
                     "offset_seconds": 0, "display_title": "Tuning"}
                ],
            }
        ],
    }
    (rec_dir / "rec_test.json").write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")
    return rec_dir, comp_dir, raga_dir


# ── dispatcher tests ──────────────────────────────────────────────────────────


def test_dispatcher_patch_top_level_field(tmp_path, capsys):
    rec_dir, comp_dir, raga_dir = _seed(tmp_path)
    bundle = [{"op": "patch", "id": "rec_test", "field": "venue", "value": "Madras Academy"}]
    added, skipped, errors = _process_recordings(
        bundle, rec_dir, CarnaticWriter(), comp_dir, raga_dir
    )
    assert (added, skipped, errors) == (1, 0, 0)
    data = json.loads((rec_dir / "rec_test.json").read_text())
    assert data["venue"] == "Madras Academy"


def test_dispatcher_patch_segment_by_timestamp(tmp_path):
    rec_dir, comp_dir, raga_dir = _seed(tmp_path)
    bundle = [{
        "op": "patch", "id": "rec_test",
        "field": "segments[00:00:00].display_title",
        "value": "Tuning + Alapana",
    }]
    added, skipped, errors = _process_recordings(
        bundle, rec_dir, CarnaticWriter(), comp_dir, raga_dir
    )
    assert errors == 0 and added == 1
    data = json.loads((rec_dir / "rec_test.json").read_text())
    assert data["sessions"][0]["performances"][0]["display_title"] == "Tuning + Alapana"


def test_dispatcher_append_segment(tmp_path):
    rec_dir, comp_dir, raga_dir = _seed(tmp_path)
    bundle = [{
        "op": "append", "id": "rec_test", "array": "segments",
        "value": {
            "offset_seconds": 872, "composition_id": "intha_chalamu",
            "raga_id": "begada", "display_title": "Intha Chalamu",
        },
    }]
    added, skipped, errors = _process_recordings(
        bundle, rec_dir, CarnaticWriter(), comp_dir, raga_dir
    )
    assert (added, errors) == (1, 0)
    data = json.loads((rec_dir / "rec_test.json").read_text())
    assert len(data["sessions"][0]["performances"]) == 2


def test_dispatcher_append_performer(tmp_path):
    rec_dir, comp_dir, raga_dir = _seed(tmp_path)
    bundle = [{
        "op": "append", "id": "rec_test", "array": "performers",
        "value": {"musician_id": "tirukkodikaval_krishna_iyer", "role": "violin"},
    }]
    added, skipped, errors = _process_recordings(
        bundle, rec_dir, CarnaticWriter(), comp_dir, raga_dir
    )
    assert (added, errors) == (1, 0)
    data = json.loads((rec_dir / "rec_test.json").read_text())
    assert len(data["sessions"][0]["performers"]) == 2


def test_dispatcher_append_subject_refused_with_message(tmp_path, capsys):
    rec_dir, comp_dir, raga_dir = _seed(tmp_path)
    bundle = [{
        "op": "append", "id": "rec_test", "array": "subjects.raga_ids", "value": "begada",
    }]
    added, skipped, errors = _process_recordings(
        bundle, rec_dir, CarnaticWriter(), comp_dir, raga_dir
    )
    assert errors == 1
    captured = capsys.readouterr().out
    assert "Architectural decision pending" in captured


def test_dispatcher_annotate(tmp_path):
    rec_dir, comp_dir, raga_dir = _seed(tmp_path)
    bundle = [{
        "op": "annotate", "id": "rec_test",
        "note": {"text": "Restored from acetate.", "source_url": "https://ex.org/notes"},
    }]
    added, skipped, errors = _process_recordings(
        bundle, rec_dir, CarnaticWriter(), comp_dir, raga_dir
    )
    assert errors == 0 and added == 1
    data = json.loads((rec_dir / "rec_test.json").read_text())
    assert data["notes"][0]["text"].startswith("Restored")


def test_dispatcher_legacy_session_indexed_path_still_works(tmp_path):
    """ADR-101 selectors must continue to ingest under v2 schema (back-compat)."""
    rec_dir, comp_dir, raga_dir = _seed(tmp_path)
    bundle = [{
        "op": "patch", "id": "rec_test",
        "field": "sessions[1].performances[1].display_title",
        "value": "Legacy Patched Title",
    }]
    added, skipped, errors = _process_recordings(
        bundle, rec_dir, CarnaticWriter(), comp_dir, raga_dir
    )
    assert errors == 0 and added == 1
    data = json.loads((rec_dir / "rec_test.json").read_text())
    assert data["sessions"][0]["performances"][0]["display_title"] == "Legacy Patched Title"


def test_dispatcher_unknown_top_level_field_falls_through_to_legacy_error(tmp_path, capsys):
    rec_dir, comp_dir, raga_dir = _seed(tmp_path)
    bundle = [{"op": "patch", "id": "rec_test", "field": "not_a_field", "value": "x"}]
    added, skipped, errors = _process_recordings(
        bundle, rec_dir, CarnaticWriter(), comp_dir, raga_dir
    )
    assert errors == 1
    assert "unsupported field path" in capsys.readouterr().out
