"""
test_her_dual_emission.py — ADR-115 bundle dual-emission rollback test.

Validates that the bani-add pipeline atomically handles the two-item bundle
emitted by the Add Raga form in Hindustani state:
  1. op: create, type: raga  → a new HER node
  2. op: append, id: <carnatic_raga_id>, field: hindustani_equivalents, value: <her_id>

Test cases:
  1. Both items succeed atomically — HER created and linked.
  2. First item (create HER) fails → second item (append) is never attempted.
  3. Second item (append) fails because HER id is wrong → HER file may exist but
     link is never written (partial failure reported).
  4. op:append for an unknown field is rejected with an error.
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
from carnatic.bani_add import _process_ragas  # noqa: E402


# ── sandbox helpers ────────────────────────────────────────────────────────────

def _make_sandbox(tmp_path: Path) -> tuple[Path, Path, Path]:
    """Return (musicians_dir, compositions_dir, ragas_dir) with seed fixtures."""
    musicians_dir = tmp_path / "musicians"
    musicians_dir.mkdir()
    compositions_dir = tmp_path / "compositions"
    compositions_dir.mkdir()
    ragas_dir = tmp_path / "ragas"
    ragas_dir.mkdir()

    (musicians_dir / "_edges.json").write_text(json.dumps([]), encoding="utf-8")

    carnatic_raga = {
        "id": "bhimpalasi",
        "name": "Bhimpalasi",
        "tradition": "carnatic",
        "aliases": [],
        "melakarta": None,
        "parent_raga": None,
        "is_melakarta": False,
        "hindustani_equivalents": [],
        "sources": [{"url": "https://en.wikipedia.org/wiki/Bhimpalasi", "label": "Wikipedia", "type": "wikipedia"}],
    }
    (ragas_dir / "bhimpalasi.json").write_text(
        json.dumps(carnatic_raga, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return musicians_dir, compositions_dir, ragas_dir


# ── test 1: dual-emission succeeds atomically ─────────────────────────────────

def test_dual_emission_both_succeed(tmp_path: pytest.TempPathFactory) -> None:
    """Both create+append succeed: HER node written and linked to Carnatic raga."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    bundle_ragas = [
        {
            "op": "create",
            "id": "bhimpalasi_her",
            "name": "Bhimpalasi",
            "tradition": "hindustani",
            "aliases": [],
            "melakarta": None,
            "is_melakarta": False,
            "cakra": None,
            "parent_raga": None,
            "thaat": "kafi",
            "carnatic_equivalents": [],
            "sources": [{"url": "https://en.wikipedia.org/wiki/Bhimpalasi", "label": "Wikipedia", "type": "wikipedia"}],
            "notes": "Test HER raga for dual-emission",
        },
        {
            "op": "append",
            "id": "bhimpalasi",
            "field": "hindustani_equivalents",
            "value": "bhimpalasi_her",
        },
    ]

    added, skipped, errors = _process_ragas(bundle_ragas, w, compositions_dir, ragas_dir)

    assert errors == 0, f"Expected 0 errors, got {errors}"
    assert added == 2, f"Expected 2 added, got {added}"

    # Verify HER file created
    her_file = ragas_dir / "bhimpalasi_her.json"
    assert her_file.exists(), "HER raga file should have been created"
    her_data = json.loads(her_file.read_text(encoding="utf-8"))
    assert her_data["tradition"] == "hindustani"
    assert her_data["thaat"] == "kafi"

    # Verify Carnatic raga linked
    car_file = ragas_dir / "bhimpalasi.json"
    car_data = json.loads(car_file.read_text(encoding="utf-8"))
    assert "bhimpalasi_her" in car_data.get("hindustani_equivalents", []), \
        "Carnatic raga should have bhimpalasi_her in hindustani_equivalents"


# ── test 2: first item fails → second item is never attempted ─────────────────

def test_dual_emission_create_fails_no_append(tmp_path: pytest.TempPathFactory) -> None:
    """If the HER create fails (bad source_type), append is not attempted."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    bundle_ragas = [
        {
            "op": "create",
            "id": "bad_her",
            "name": "Bad HER",
            "tradition": "hindustani",
            "sources": [{"url": "https://en.wikipedia.org/wiki/Bad", "label": "Wikipedia", "type": "invalid_type"}],
        },
        {
            "op": "append",
            "id": "bhimpalasi",
            "field": "hindustani_equivalents",
            "value": "bad_her",
        },
    ]

    added, skipped, errors = _process_ragas(bundle_ragas, w, compositions_dir, ragas_dir)

    # First item fails (invalid source_type) → error counted
    assert errors >= 1, "Expected at least 1 error from bad source_type"

    # Second item also fails because bad_her doesn't exist yet → another error
    # Carnatic raga must NOT have bad_her linked
    car_file = ragas_dir / "bhimpalasi.json"
    car_data = json.loads(car_file.read_text(encoding="utf-8"))
    assert "bad_her" not in car_data.get("hindustani_equivalents", []), \
        "Carnatic raga should NOT have been linked to a failed HER"


# ── test 3: second item (append) fails when her_id doesn't exist ─────────────

def test_dual_emission_append_fails_her_missing(tmp_path: pytest.TempPathFactory) -> None:
    """append to hindustani_equivalents fails when HER id doesn't exist in ragas."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    bundle_ragas = [
        {
            "op": "append",
            "id": "bhimpalasi",
            "field": "hindustani_equivalents",
            "value": "nonexistent_her",
        },
    ]

    added, skipped, errors = _process_ragas(bundle_ragas, w, compositions_dir, ragas_dir)

    assert errors >= 1, "Expected error when appending a non-existent HER id"

    # Verify no change to the Carnatic raga
    car_file = ragas_dir / "bhimpalasi.json"
    car_data = json.loads(car_file.read_text(encoding="utf-8"))
    assert "nonexistent_her" not in car_data.get("hindustani_equivalents", [])


# ── test 4: op:append with unsupported field is rejected ─────────────────────

def test_raga_append_unsupported_field_rejected(tmp_path: pytest.TempPathFactory) -> None:
    """op:append on an unsupported raga field emits an error and makes no change."""
    musicians_dir, compositions_dir, ragas_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    bundle_ragas = [
        {
            "op": "append",
            "id": "bhimpalasi",
            "field": "unsupported_field",
            "value": "some_value",
        },
    ]

    added, skipped, errors = _process_ragas(bundle_ragas, w, compositions_dir, ragas_dir)

    assert errors >= 1, "Expected error for unsupported append field"
    assert added == 0
