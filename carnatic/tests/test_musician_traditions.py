"""
test_musician_traditions.py — ADR-114 Phase 2 tests.

Three tests:
  1. Musician with traditions:["hindustani"] validates without error.
  2. Musician with traditions:["carnatic","hindustani"] validates without error.
  3. Musician file missing traditions field is treated as ["carnatic"] (backward compat).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from carnatic.writer import CarnaticWriter, VALID_TRADITIONS  # noqa: E402


# ── sandbox helpers ────────────────────────────────────────────────────────────

def _make_sandbox(tmp_path: Path) -> Path:
    """Return a musicians directory with minimal fixtures."""
    musicians_dir = tmp_path / "musicians"
    musicians_dir.mkdir()
    (musicians_dir / "_edges.json").write_text(json.dumps([]), encoding="utf-8")
    return musicians_dir


def _add_musician(musicians_dir: Path, *, id: str, traditions: list[str] | None) -> Path:
    """Write a minimal musician JSON file; omit traditions field when None."""
    node: dict = {
        "id":         id,
        "label":      f"Test {id}",
        "sources":    [{"url": "https://en.wikipedia.org/wiki/Test", "label": "Wikipedia", "type": "wikipedia"}],
        "born":       1960,
        "died":       None,
        "era":        "contemporary",
        "instrument": "sitar",
        "bani":       None,
        "youtube":    [],
    }
    if traditions is not None:
        node["traditions"] = traditions
    path = musicians_dir / f"{id}.json"
    path.write_text(json.dumps(node, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


# ── test 1: hindustani-only traditions ────────────────────────────────────────

def test_hindustani_traditions_validates(tmp_path: Path) -> None:
    """Musician with traditions:["hindustani"] should write without error."""
    musicians_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    result = w.add_hindustani_musician(
        musicians_dir,
        id="ravi_shankar",
        label="Ravi Shankar",
        instrument="sitar",
        source_url="https://en.wikipedia.org/wiki/Ravi_Shankar",
        source_label="Wikipedia",
        born=1920,
        also_carnatic=False,
    )

    assert result.ok, f"Expected ok=True, got: {result.message}"
    node = json.loads((musicians_dir / "ravi_shankar.json").read_text(encoding="utf-8"))
    assert node["traditions"] == ["hindustani"]
    assert node["bani"] is None


# ── test 2: cross-tradition ["carnatic","hindustani"] ────────────────────────

def test_cross_tradition_validates(tmp_path: Path) -> None:
    """Musician with traditions:["carnatic","hindustani"] should write without error."""
    musicians_dir = _make_sandbox(tmp_path)
    w = CarnaticWriter()

    result = w.add_hindustani_musician(
        musicians_dir,
        id="ali_akbar_khan",
        label="Ali Akbar Khan",
        instrument="sarod",
        source_url="https://en.wikipedia.org/wiki/Ali_Akbar_Khan",
        source_label="Wikipedia",
        born=1922,
        also_carnatic=True,
    )

    assert result.ok, f"Expected ok=True, got: {result.message}"
    node = json.loads((musicians_dir / "ali_akbar_khan.json").read_text(encoding="utf-8"))
    assert "carnatic" in node["traditions"]
    assert "hindustani" in node["traditions"]


# ── test 3: missing traditions → backward compat as ["carnatic"] ──────────────

def test_missing_traditions_backward_compat(tmp_path: Path) -> None:
    """A musician file with no traditions field should be treated as carnatic by the writer."""
    musicians_dir = _make_sandbox(tmp_path)

    # Write a file WITHOUT traditions field (simulates pre-ADR-114 file)
    _add_musician(musicians_dir, id="old_musician", traditions=None)

    node = json.loads((musicians_dir / "old_musician.json").read_text(encoding="utf-8"))
    assert "traditions" not in node, "Fixture should not have traditions field"

    # add_musician defaults to ["carnatic"] — confirm VALID_TRADITIONS is correct
    assert "carnatic" in VALID_TRADITIONS
    assert "hindustani" in VALID_TRADITIONS

    # Now write a NEW musician via add_musician (without passing traditions):
    # it should default to ["carnatic"]
    w = CarnaticWriter()
    result = w.add_musician(
        musicians_dir,
        id="new_musician",
        label="New Musician",
        instrument="vocal",
        source_url="https://en.wikipedia.org/wiki/Test2",
        source_label="Wikipedia",
    )
    assert result.ok, f"Expected ok=True, got: {result.message}"
    written = json.loads((musicians_dir / "new_musician.json").read_text(encoding="utf-8"))
    assert written.get("traditions") == ["carnatic"], (
        f"Expected traditions=['carnatic'], got {written.get('traditions')}"
    )
