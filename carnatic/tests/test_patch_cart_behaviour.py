"""
test_patch_cart_behaviour.py — ADR-171 behavioural tests, run through node.

The drift guards in test_patch_cart_drift.py check that the browser and the
ingester agree about shape. This drives carnatic/tests/js/patch_cart_behaviour.js,
which loads entry_forms.js + patch_cart.js exactly as html_generator.py
concatenates them and exercises the semantics that carry the feature's weight:
replace-in-place, group removal, artefact cleanliness, persistence round-trip,
and describeOp's coverage of every inconsistent op shape.

Skipped when node is unavailable, so the suite still runs on a bare checkout.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
RUNNER = PROJECT_ROOT / "carnatic" / "tests" / "js" / "patch_cart_behaviour.js"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_patch_cart_behaviour() -> None:
    assert RUNNER.exists(), f"missing JS runner: {RUNNER}"
    proc = subprocess.run(
        [shutil.which("node"), str(RUNNER)],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    output = proc.stdout + proc.stderr
    assert proc.returncode == 0, "ADR-171 behavioural failures:\n" + output
