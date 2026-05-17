"""
test_edit_form_spec_drift.py — ADR-143 §4 drift-guard.

Asserts that editFormSpec's patchable arrays in edit_form_spec.js stay in
lockstep with writer.py's PATCHABLE_*_FIELDS constants.

Failure here means a field was added (or removed) in one place but not the
other. Fix: update both edit_form_spec.js and writer.py in the same commit
and re-run bani-render so the bundle picks up both changes.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from carnatic.writer import (  # noqa: E402
    PATCHABLE_COMPOSITION_FIELDS,
    PATCHABLE_EDGE_FIELDS,
    PATCHABLE_MUSICIAN_FIELDS,
    PATCHABLE_RAGA_FIELDS,
    PATCHABLE_RECORDING_FIELDS,
    PATCHABLE_RECORDING_PERFORMANCE_FIELDS,
)

SPEC_JS = PROJECT_ROOT / "carnatic" / "render" / "templates" / "edit_form_spec.js"


# ── helpers ────────────────────────────────────────────────────────────────────


def _parse_js_array(raw: str) -> set[str]:
    """Parse a JS array literal string like "'a', 'b', 'c'" into a Python set."""
    return {s.strip(" '\"") for s in raw.split(",") if s.strip(" '\"")}


def _extract_spec_patchable(js_text: str, entity_type: str) -> set[str]:
    """Return the patchable field-set for entity_type from editFormSpec in the JS file."""
    # Matches: musician: {\n  ...  patchable: ['field', ...],
    # [^}]*? is non-greedy and stops at the first closing brace.
    pattern = rf"{re.escape(entity_type)}:\s*{{[^}}]*?patchable:\s*\[([^\]]*)\]"
    m = re.search(pattern, js_text, re.DOTALL)
    if not m:
        raise ValueError(
            f"Could not find editFormSpec.{entity_type}.patchable in {SPEC_JS.name}"
        )
    return _parse_js_array(m.group(1))


def _extract_segment_patchable(js_text: str) -> set[str]:
    """Return editFormSpecSegment.patchable as a Python set."""
    pattern = r"editFormSpecSegment\s*=\s*\{[^}]*?patchable:\s*\[([^\]]*)\]"
    m = re.search(pattern, js_text, re.DOTALL)
    if not m:
        raise ValueError(
            f"Could not find editFormSpecSegment.patchable in {SPEC_JS.name}"
        )
    return _parse_js_array(m.group(1))


# ── fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def spec_js_text():
    assert SPEC_JS.exists(), f"edit_form_spec.js not found at {SPEC_JS}"
    return SPEC_JS.read_text(encoding="utf-8")


# ── tests ──────────────────────────────────────────────────────────────────────


_ENTITY_PAIRS = [
    ("musician",    PATCHABLE_MUSICIAN_FIELDS),
    ("raga",        PATCHABLE_RAGA_FIELDS),
    ("composition", PATCHABLE_COMPOSITION_FIELDS),
    ("recording",   PATCHABLE_RECORDING_FIELDS),
    ("edge",        PATCHABLE_EDGE_FIELDS),
]


@pytest.mark.parametrize("entity_type,writer_fields", _ENTITY_PAIRS)
def test_patchable_lockstep(spec_js_text, entity_type, writer_fields):
    """editFormSpec[entity].patchable must equal writer.PATCHABLE_*_FIELDS exactly.

    ADR-143 §4: drift between front-end spec and writer whitelist is the
    explicit failure mode this test guards against.
    """
    js_fields = _extract_spec_patchable(spec_js_text, entity_type)
    extra_in_js = js_fields - writer_fields
    extra_in_writer = writer_fields - js_fields
    assert not extra_in_js and not extra_in_writer, (
        f"ADR-143 §4 drift for '{entity_type}':\n"
        f"  JS only (edit_form_spec.js): {sorted(extra_in_js)}\n"
        f"  writer only (writer.py):     {sorted(extra_in_writer)}\n"
        "Fix: add the missing field to both files in the same commit, then re-run bani-render."
    )


def test_segment_patchable_lockstep(spec_js_text):
    """editFormSpecSegment.patchable must equal PATCHABLE_RECORDING_PERFORMANCE_FIELDS.

    Segment patches target sessions[].performances[] rows; the correct
    writer-side whitelist is PATCHABLE_RECORDING_PERFORMANCE_FIELDS (not
    PATCHABLE_SEGMENT_FIELDS, which covers lecdem segments — a different
    entity with extra fields like 'kind', 'performer_ids', 'duration_seconds').
    """
    js_fields = _extract_segment_patchable(spec_js_text)
    writer_fields = PATCHABLE_RECORDING_PERFORMANCE_FIELDS
    extra_in_js = js_fields - writer_fields
    extra_in_writer = writer_fields - js_fields
    assert not extra_in_js and not extra_in_writer, (
        "ADR-143 §4 drift for recording-segment:\n"
        f"  JS only (editFormSpecSegment):              {sorted(extra_in_js)}\n"
        f"  writer only (PATCHABLE_RECORDING_PERFORMANCE_FIELDS): {sorted(extra_in_writer)}\n"
        "Fix: update both in the same commit and re-run bani-render."
    )
