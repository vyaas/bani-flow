"""
test_non_overlap_geometry.py — ADR-176 guard for the app-level non-overlap
contract.

Drives carnatic/tests/js/non_overlap_behaviour.js through node, one scenario per
test, so a failure names the surface that overlapped. The runner extracts the
real `_rectsOverlap` / `_resolveNonOverlap` units from the shipped
`media_player.js` — these tests fail when the geometry semantics drift, not when
a Python mirror does. Skipped when node is unavailable.

The contract (ADR-176): the left sidebar, right sidebar, playlist UI, and every
floating media player never overlap. The player is the only free actor, and this
solver is the single funnel for its placement.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
RUNNER = PROJECT_ROOT / "carnatic" / "tests" / "js" / "non_overlap_behaviour.js"

NODE = shutil.which("node")

SCENARIOS = [
    "clear-proposal-untouched",
    "proposal-clamped-to-bounds",
    "single-obstacle-pushed-clear",
    "free-column-between-sidebars-and-ui",
    "wide-player-clear-of-open-sidebar",
    "cramped-degrades-not-crashes",
    "rects-overlap-margin",
]


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("scenario", SCENARIOS)
def test_non_overlap_scenario(scenario: str) -> None:
    assert RUNNER.exists(), f"missing JS runner: {RUNNER}"
    proc = subprocess.run(
        [NODE, str(RUNNER), scenario],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=60,
    )
    output = proc.stdout + proc.stderr
    assert proc.returncode == 0, f"ADR-176 scenario '{scenario}' failed:\n{output}"
