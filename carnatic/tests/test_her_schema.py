"""
test_her_schema.py — Tests for ADR-112 Hindustani Equivalent Raga schema.

Three tests:
  1. HER recording with no composition_id validates when raga has tradition "hindustani".
  2. add_her_recording rejects a Carnatic raga (tradition != "hindustani") — analogous to
     "Carnatic recording with a kind that requires HER still fails".
  3. her-of and carnatic-twin-of round-trip a seeded pair using temp raga files.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from carnatic.writer import CarnaticWriter  # noqa: E402


# ── sandbox helpers ────────────────────────────────────────────────────────────

def _make_sandbox(tmp_path: Path) -> tuple[Path, Path, Path]:
    """Return (musicians_dir, compositions_dir, ragas_dir) with minimal fixtures."""
    musicians_dir = tmp_path / "musicians"
    musicians_dir.mkdir()
    compositions_dir = tmp_path / "compositions"
    compositions_dir.mkdir()
    ragas_dir = tmp_path / "ragas"
    ragas_dir.mkdir()

    (musicians_dir / "_edges.json").write_text(json.dumps([]), encoding="utf-8")
    musician = {
        "id": "test_musician",
        "label": "Test Musician",
        "era": "contemporary",
        "instrument": "vocal",
        "born": 1970,
        "died": None,
        "bani": None,
        "sources": [{"url": "https://en.wikipedia.org/wiki/Test", "label": "Wikipedia", "type": "wikipedia"}],
        "youtube": [],
    }
    (musicians_dir / "test_musician.json").write_text(
        json.dumps(musician, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # A Carnatic raga
    carnatic_raga = {
        "id": "bhairavi",
        "name": "Bhairavi",
        "tradition": "carnatic",
        "melakarta": None,
        "parent_raga": "natabhairavi",
        "is_melakarta": False,
        "sources": [{"url": "https://en.wikipedia.org/wiki/Bhairavi_(Carnatic)", "label": "Wikipedia", "type": "wikipedia"}],
    }
    (ragas_dir / "bhairavi.json").write_text(
        json.dumps(carnatic_raga, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # A Hindustani raga
    her_raga = {
        "id": "bhairav",
        "name": "Bhairav",
        "tradition": "hindustani",
        "aliases": [],
        "melakarta": None,
        "parent_raga": None,
        "is_melakarta": False,
        "thaat": "bhairav",
        "carnatic_equivalents": [],
        "sources": [{"url": "https://en.wikipedia.org/wiki/Bhairav_(Hindustani)", "label": "Wikipedia", "type": "wikipedia"}],
    }
    (ragas_dir / "bhairav.json").write_text(
        json.dumps(her_raga, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    return musicians_dir, compositions_dir, ragas_dir


# ── test 1: HER recording with no composition_id succeeds for hindustani raga ──

def test_her_recording_hindustani_raga_validates(tmp_path: pytest.TempPathFactory) -> None:
    """add_her_recording succeeds for a hindustani raga without composition_id."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    result = w.add_her_recording(
        musicians_dir,
        musician_id="test_musician",
        url="https://www.youtube.com/watch?v=AAAAAAAAAA1",
        label="Test HER Raga Alap",
        raga_id="bhairav",
        kind="raga_alap",
        compositions_path=compositions_dir,
        ragas_path=ragas_dir,
    )

    assert result.ok, f"Expected ok=True, got: {result.message}"
    assert "bhairav" in result.message
    assert "raga_alap" in result.message

    # Verify the entry was written to the musician file
    node = json.loads((musicians_dir / "test_musician.json").read_text(encoding="utf-8"))
    yt_entries = node.get("youtube", [])
    assert len(yt_entries) == 1
    entry = yt_entries[0]
    assert entry["raga_id"] == "bhairav"
    assert entry["kind"] == "raga_alap"
    assert "composition_id" not in entry  # no composition required for HER recordings


# ── test 2: add_her_recording rejects a Carnatic raga ──────────────────────────

def test_her_recording_carnatic_raga_rejected(tmp_path: pytest.TempPathFactory) -> None:
    """add_her_recording must reject a raga with tradition == carnatic."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    result = w.add_her_recording(
        musicians_dir,
        musician_id="test_musician",
        url="https://www.youtube.com/watch?v=AAAAAAAAAA2",
        label="Should Fail — Carnatic Raga",
        raga_id="bhairavi",   # Carnatic raga
        kind="raga_alap",
        compositions_path=compositions_dir,
        ragas_path=ragas_dir,
    )

    assert not result.ok, "Expected failure for Carnatic raga passed to add_her_recording"
    assert not result.skipped
    assert "hindustani" in result.message.lower() or "tradition" in result.message.lower()


# ── test 3: her-of / carnatic-twin-of round-trip ──────────────────────────────

def test_her_of_carnatic_twin_of_round_trip(tmp_path: pytest.TempPathFactory) -> None:
    """her-of and carnatic-twin-of are consistent for a seeded pair."""
    from carnatic.graph_api import CarnaticGraph

    # Build a minimal graph.json with a carnatic↔hindustani raga pair
    graph_data = {
        "musicians": {"nodes": [], "edges": []},
        "compositions": {
            "ragas": [
                {
                    "id": "bhairavi",
                    "name": "Bhairavi",
                    "tradition": "carnatic",
                    "melakarta": None,
                    "parent_raga": None,
                    "is_melakarta": False,
                    "hindustani_equivalents": ["bhairav"],
                },
                {
                    "id": "bhairav",
                    "name": "Bhairav",
                    "tradition": "hindustani",
                    "melakarta": None,
                    "parent_raga": None,
                    "is_melakarta": False,
                    "thaat": "bhairav",
                    "carnatic_equivalents": ["bhairavi"],  # pre-derived
                },
            ],
            "compositions": [],
        },
        "recording_refs": [],
    }
    graph_file = tmp_path / "graph.json"
    graph_file.write_text(json.dumps(graph_data, indent=2, ensure_ascii=False), encoding="utf-8")

    g = CarnaticGraph(graph_file)

    # her-of bhairavi → should list bhairav
    bhairavi = g.get_raga("bhairavi")
    assert bhairavi is not None
    hers = bhairavi.get("hindustani_equivalents", [])
    assert "bhairav" in hers, f"Expected bhairav in hindustani_equivalents, got: {hers}"

    # carnatic-twin-of bhairav → should list bhairavi
    twins = [
        r["id"] for r in g.get_all_ragas()
        if "bhairav" in r.get("hindustani_equivalents", [])
    ]
    assert "bhairavi" in twins, f"Expected bhairavi in twins, got: {twins}"

    # Round-trip consistency
    assert set(hers) == {"bhairav"}
    assert set(twins) == {"bhairavi"}
