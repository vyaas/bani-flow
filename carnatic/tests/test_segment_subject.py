"""ADR-156: the per-segment free-text `subject` field.

`subject` is an optional topic string on a segment / recording performance —
distinct from the entry-level aggregate `subjects` dict (ADR-078). It is
patchable and type-checked (free text, no closed vocabulary).
"""
from carnatic.writer import (
    PATCHABLE_RECORDING_PERFORMANCE_FIELDS,
    PATCHABLE_SEGMENT_FIELDS,
    _validate_segment_dict,
)

_KNOWN = dict(known_raga_ids={"kalyani"}, known_comp_ids={"x"}, known_musician_ids=set())


def test_subject_is_patchable_on_segments_and_performances():
    assert "subject" in PATCHABLE_SEGMENT_FIELDS
    assert "subject" in PATCHABLE_RECORDING_PERFORMANCE_FIELDS
    # `kind` reached recording performances too (parity).
    assert "kind" in PATCHABLE_RECORDING_PERFORMANCE_FIELDS


def test_segment_with_string_subject_is_valid():
    seg = {"offset_seconds": 730, "raga_id": "kalyani",
           "subject": "Gamaka in Kalyani", "kind": "chapter"}
    assert _validate_segment_dict(seg, **_KNOWN) is None


def test_segment_subject_must_be_a_string():
    seg = {"offset_seconds": 0, "raga_id": "kalyani", "subject": 42}
    err = _validate_segment_dict(seg, **_KNOWN)
    assert err is not None and "subject must be a string" in err


def test_segment_without_subject_still_valid():
    """subject is optional — absence must not break validation."""
    seg = {"offset_seconds": 0, "raga_id": "kalyani"}
    assert _validate_segment_dict(seg, **_KNOWN) is None
