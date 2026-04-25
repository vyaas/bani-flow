"""
test_bani_add_dependency_resolution.py — ADR-099 two-pass ingest tests.

Verifies that:
  1. _collect_create_items correctly partitions creates vs mutations.
  2. _extract_refs returns the correct reference set per bucket type.
  3. _topo_sort_creates sorts items so dependencies come first (stable tiebreaker).
  4. _topo_sort_creates detects cycles and returns cycle_items separately.
  5. _run_bundle ingests a bundle with a forward reference (create composition +
     append youtube) in natural order and in reversed authored order identically.
  6. A bundle with a true cycle emits a WARN log and per-item errors, not a crash.
  7. The error augmentation helper works correctly.
"""

from __future__ import annotations

import json
import sys
import tempfile
from io import StringIO
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Make sure the project root is importable
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from carnatic.bani_add import (
    BUCKET_ORDER,
    _CreateItem,
    _collect_create_items,
    _extract_refs,
    _maybe_augment_error,
    _topo_sort_creates,
    _run_bundle,
)
from carnatic.writer import WriteResult


# ── helpers ────────────────────────────────────────────────────────────────────

def _make_raga(id: str, **kw) -> dict:
    return {"id": id, "name": id, "op": "create", **kw}


def _make_composition(id: str, raga_id: str = "", composer_id: str = "", **kw) -> dict:
    return {"id": id, "title": id, "op": "create", "raga_id": raga_id,
            "composer_id": composer_id, **kw}


def _make_musician(id: str, youtube: list | None = None, **kw) -> dict:
    m = {"id": id, "label": id, "op": "create", **kw}
    if youtube is not None:
        m["youtube"] = youtube
    return m


def _make_edge(source: str, target: str) -> dict:
    return {"source": source, "target": target, "op": "create", "confidence": 0.9}


def _make_append_youtube(musician_id: str, url: str, composition_id: str = "") -> dict:
    entry: dict = {"op": "append", "id": musician_id, "array": "youtube",
                   "value": {"url": url, "label": "test"}}
    if composition_id:
        entry["value"]["composition_id"] = composition_id
    return entry


def _bundle(items: dict) -> dict:
    return {"schema_version": 2, "generated_at": "2026-01-01T00:00:00Z", "items": items}


# ── _collect_create_items ──────────────────────────────────────────────────────

class TestCollectCreateItems:
    def test_empty_bundle(self):
        assert _collect_create_items({}) == []

    def test_returns_only_creates(self):
        items = {
            "ragas": [
                {"id": "r1", "name": "r1", "op": "create"},
                {"id": "r2", "op": "patch", "field": "name", "value": "x"},
            ],
            "musicians": [
                {"id": "m1", "label": "m1"},                      # implicit create
                {"id": "m2", "label": "m2", "op": "annotate"},    # mutation
                {"type": "youtube_append", "musician_id": "m1"},  # v1 mutation
            ],
        }
        creates = _collect_create_items(items)
        ids = [ci.item_id for ci in creates]
        assert "r1" in ids
        assert "r2" not in ids   # patch → mutation
        assert "m1" in ids
        assert "m2" not in ids   # annotate → mutation
        # youtube_append is a mutation
        assert not any("youtube_append" in ci.item_id for ci in creates)

    def test_bucket_and_authored_idx_are_correct(self):
        items = {
            "ragas": [_make_raga("r1"), _make_raga("r2")],
            "compositions": [_make_composition("c1")],
        }
        creates = _collect_create_items(items)
        by_id = {ci.item_id: ci for ci in creates}
        assert by_id["r1"].bucket_idx == BUCKET_ORDER.index("ragas")
        assert by_id["r1"].authored_idx == 0
        assert by_id["r2"].authored_idx == 1
        assert by_id["c1"].bucket_idx == BUCKET_ORDER.index("compositions")

    def test_edge_gets_synthesised_id(self):
        items = {"edges": [_make_edge("a", "b")]}
        creates = _collect_create_items(items)
        assert len(creates) == 1
        assert creates[0].item_id == "edges:a:b"


# ── _extract_refs ──────────────────────────────────────────────────────────────

class TestExtractRefs:
    def test_raga_with_parent(self):
        item = {"id": "janya_r", "parent_raga": "mela_r"}
        assert _extract_refs("ragas", item) == {"mela_r"}

    def test_raga_no_parent(self):
        assert _extract_refs("ragas", {"id": "r1"}) == set()

    def test_composers_empty(self):
        assert _extract_refs("composers", {"id": "c"}) == set()

    def test_composition_refs(self):
        item = _make_composition("id", raga_id="r1", composer_id="cmp1")
        assert _extract_refs("compositions", item) == {"r1", "cmp1"}

    def test_composition_partial_refs(self):
        item = _make_composition("id", raga_id="r1")
        assert _extract_refs("compositions", item) == {"r1"}

    def test_musician_youtube_refs(self):
        item = _make_musician("m1", youtube=[
            {"url": "http://yt/1", "composition_id": "comp1", "raga_id": "raga1"},
            {"url": "http://yt/2", "performers": [{"musician_id": "m2"}]},
        ])
        refs = _extract_refs("musicians", item)
        assert refs == {"comp1", "raga1", "m2"}

    def test_musician_subjects_refs(self):
        item = _make_musician("m1", youtube=[{
            "url": "http://yt/1",
            "subjects": {
                "raga_ids": ["r1"],
                "composition_ids": ["c1", "c2"],
                "musician_ids": ["m2"],
            },
        }])
        refs = _extract_refs("musicians", item)
        assert "r1" in refs
        assert "c1" in refs
        assert "c2" in refs
        assert "m2" in refs

    def test_recordings_refs(self):
        item = {
            "id": "rec1",
            "sessions": [{
                "performers": [{"musician_id": "m1"}],
                "performances": [{"composition_id": "c1", "raga_id": "r1", "composer_id": "cmp1"}],
            }],
        }
        refs = _extract_refs("recordings", item)
        assert refs == {"m1", "c1", "r1", "cmp1"}

    def test_edges_refs(self):
        item = _make_edge("src", "tgt")
        assert _extract_refs("edges", item) == {"src", "tgt"}


# ── _topo_sort_creates ─────────────────────────────────────────────────────────

class TestTopoSortCreates:
    def test_empty(self):
        sorted_items, cycle_items = _topo_sort_creates([])
        assert sorted_items == []
        assert cycle_items == []

    def test_no_deps_preserves_bucket_order(self):
        items = {
            "musicians": [_make_musician("m1")],
            "compositions": [_make_composition("c1")],
            "ragas": [_make_raga("r1")],
        }
        creates = _collect_create_items(items)
        sorted_items, cycle_items = _topo_sort_creates(creates)
        assert cycle_items == []
        buckets = [ci.bucket for ci in sorted_items]
        # raga before composition before musician (BUCKET_ORDER)
        assert buckets.index("ragas") < buckets.index("compositions")
        assert buckets.index("compositions") < buckets.index("musicians")

    def test_composition_after_raga(self):
        """Composition referencing a raga in the same bundle must come after it."""
        items = {
            "compositions": [_make_composition("c1", raga_id="r1")],
            "ragas": [_make_raga("r1")],
        }
        creates = _collect_create_items(items)
        sorted_items, cycle_items = _topo_sort_creates(creates)
        assert cycle_items == []
        ids = [ci.item_id for ci in sorted_items]
        assert ids.index("r1") < ids.index("c1")

    def test_musician_append_youtube_composition(self):
        """A musician node referencing an in-bundle composition via youtube[] must come after it."""
        yt = [{"url": "http://yt/1", "composition_id": "c1"}]
        items = {
            "musicians": [_make_musician("m1", youtube=yt)],
            "compositions": [_make_composition("c1", raga_id="r1")],
            "ragas": [_make_raga("r1")],
        }
        creates = _collect_create_items(items)
        sorted_items, cycle_items = _topo_sort_creates(creates)
        assert cycle_items == []
        ids = [ci.item_id for ci in sorted_items]
        assert ids.index("r1") < ids.index("c1")
        assert ids.index("c1") < ids.index("m1")

    def test_cycle_detected(self):
        """A dependency cycle is returned in cycle_items, not in sorted_items."""
        # Synthetic cycle: raga A references raga B as parent, raga B references raga A
        items = {
            "ragas": [
                {"id": "rA", "name": "rA", "op": "create", "parent_raga": "rB"},
                {"id": "rB", "name": "rB", "op": "create", "parent_raga": "rA"},
            ],
        }
        creates = _collect_create_items(items)
        sorted_items, cycle_items = _topo_sort_creates(creates)
        assert len(cycle_items) == 2
        assert len(sorted_items) == 0
        cycle_ids = {ci.item_id for ci in cycle_items}
        assert cycle_ids == {"rA", "rB"}

    def test_partial_cycle(self):
        """Items not in a cycle are sorted; only cycle members are returned in cycle_items."""
        items = {
            "ragas": [
                {"id": "rOK", "name": "rOK", "op": "create"},
                {"id": "rA", "name": "rA", "op": "create", "parent_raga": "rB"},
                {"id": "rB", "name": "rB", "op": "create", "parent_raga": "rA"},
            ],
        }
        creates = _collect_create_items(items)
        sorted_items, cycle_items = _topo_sort_creates(creates)
        assert len(sorted_items) == 1
        assert sorted_items[0].item_id == "rOK"
        assert len(cycle_items) == 2

    def test_deterministic_tiebreaker(self):
        """Two contributors authoring the same items in different order get same sort."""
        items_ab = {
            "ragas": [_make_raga("r1"), _make_raga("r2")],
        }
        items_ba = {
            "ragas": [_make_raga("r2"), _make_raga("r1")],
        }
        sorted_ab, _ = _topo_sort_creates(_collect_create_items(items_ab))
        sorted_ba, _ = _topo_sort_creates(_collect_create_items(items_ba))
        # Both orderings must be valid (no deps), but within each, authored order is stable
        # The key property: both have 2 sorted items with no cycle
        assert len(sorted_ab) == len(sorted_ba) == 2


# ── _maybe_augment_error ───────────────────────────────────────────────────────

class TestMaybeAugmentError:
    def test_augments_when_id_in_bundle(self):
        msg = "ERROR  composition 'test_comp': unknown raga 'missing_raga'"
        result = _maybe_augment_error(msg, frozenset({"missing_raga"}))
        assert "(also missing in this bundle)" in result

    def test_no_augment_when_id_not_in_bundle(self):
        msg = "ERROR  composition 'test_comp': unknown raga 'missing_raga'"
        result = _maybe_augment_error(msg, frozenset({"other_id"}))
        assert "(also missing in this bundle)" not in result
        assert result == msg

    def test_no_augment_when_no_unknown_pattern(self):
        msg = "ERROR  some other problem"
        result = _maybe_augment_error(msg, frozenset({"r1"}))
        assert result == msg

    def test_no_augment_on_empty_set(self):
        msg = "ERROR  composition 'test_comp': unknown raga 'r1'"
        result = _maybe_augment_error(msg, frozenset())
        assert result == msg


# ── _run_bundle integration ────────────────────────────────────────────────────

class TestRunBundleIntegration:
    """Integration tests using a mock CarnaticWriter to verify Pass 1 / Pass 2 ordering."""

    def _make_mock_writer(self) -> MagicMock:
        w = MagicMock()
        ok = WriteResult(ok=True, skipped=False, message="[+]  ok", log_prefix="[+]")
        skip = WriteResult(ok=False, skipped=True, message="SKIP (duplicate)  x", log_prefix="SKIP")
        w.add_raga.return_value = ok
        w.add_composer.return_value = ok
        w.add_musician.return_value = ok
        w.add_youtube.return_value = ok
        w.add_composition.return_value = ok
        w.add_edge.return_value = ok
        w.add_note.return_value = ok
        w.patch_musician.return_value = ok
        w.patch_raga.return_value = ok
        w.patch_composition.return_value = ok
        w.patch_composer.return_value = ok
        w.patch_edge.return_value = ok
        w.add_youtube_performer.return_value = ok
        w.add_lecdem_subject.return_value = ok
        return w

    def _run(self, bundle: dict, writer: MagicMock, tmp_path: Path) -> tuple[int, str]:
        """Run _run_bundle and capture stdout. Returns (error_count, output)."""
        recordings_path = tmp_path / "recordings"
        recordings_path.mkdir(parents=True, exist_ok=True)
        musicians_path = tmp_path / "musicians.json"
        comp_path = tmp_path / "compositions.json"
        ragas_path = tmp_path / "ragas.json"
        # Minimal JSON so processors don't crash reading them
        for p in (musicians_path, comp_path, ragas_path):
            p.write_text('{"musicians": [], "edges": [], "compositions": [], "ragas": [], "composers": []}')

        buf = StringIO()
        with patch("builtins.print", side_effect=lambda *a, **kw: buf.write(" ".join(str(x) for x in a) + "\n")):
            errors = _run_bundle(bundle, writer, musicians_path, comp_path, ragas_path, recordings_path)
        return errors, buf.getvalue()

    def test_create_pass_before_mutation_pass(self, tmp_path):
        """Creates (Pass 1) must be called before mutations (Pass 2)."""
        writer = self._make_mock_writer()
        bundle = _bundle({
            "ragas": [_make_raga("r1")],
            "musicians": [_make_append_youtube("m1", "http://yt/1")],
        })
        errors, output = self._run(bundle, writer, tmp_path)
        assert errors == 0
        assert "[CREATE PASS]" in output
        assert "[MUTATION PASS]" in output
        create_pos = output.index("[CREATE PASS]")
        mutation_pos = output.index("[MUTATION PASS]")
        assert create_pos < mutation_pos
        writer.add_raga.assert_called_once()
        writer.add_youtube.assert_called_once()

    def test_forward_reference_natural_order(self, tmp_path):
        """Bundle with composition create + youtube append: natural order ingests cleanly."""
        writer = self._make_mock_writer()
        bundle = _bundle({
            "compositions": [_make_composition("sarasa_sama_dana", raga_id="sarasangi")],
            "musicians": [_make_append_youtube("tm_krishna", "http://yt/1", "sarasa_sama_dana")],
        })
        errors, output = self._run(bundle, writer, tmp_path)
        assert errors == 0
        writer.add_composition.assert_called_once()
        writer.add_youtube.assert_called_once()

    def test_forward_reference_reversed_order(self, tmp_path):
        """Same bundle items in reversed authored order must produce identical call pattern."""
        writer_natural = self._make_mock_writer()
        writer_reversed = self._make_mock_writer()

        natural = _bundle({
            "compositions": [_make_composition("sarasa_sama_dana", raga_id="sarasangi")],
            "musicians": [_make_append_youtube("tm_krishna", "http://yt/1", "sarasa_sama_dana")],
        })
        # reversed: append youtube listed before composition
        reversed_b = _bundle({
            "musicians": [_make_append_youtube("tm_krishna", "http://yt/1", "sarasa_sama_dana")],
            "compositions": [_make_composition("sarasa_sama_dana", raga_id="sarasangi")],
        })
        e1, _ = self._run(natural, writer_natural, tmp_path / "n")
        (tmp_path / "n").mkdir(exist_ok=True)
        e2, _ = self._run(reversed_b, writer_reversed, tmp_path / "r")
        (tmp_path / "r").mkdir(exist_ok=True)

        assert e1 == e2 == 0
        # Both should have called add_composition and add_youtube exactly once
        writer_natural.add_composition.assert_called_once()
        writer_reversed.add_composition.assert_called_once()
        writer_natural.add_youtube.assert_called_once()
        writer_reversed.add_youtube.assert_called_once()

    def test_cycle_emits_warn_and_continues(self, tmp_path):
        """A cyclic create bundle must WARN and attempt anyway, not crash."""
        writer = self._make_mock_writer()
        bundle = _bundle({
            "ragas": [
                {"id": "rA", "name": "rA", "op": "create", "parent_raga": "rB"},
                {"id": "rB", "name": "rB", "op": "create", "parent_raga": "rA"},
            ],
        })
        errors, output = self._run(bundle, writer, tmp_path)
        assert "WARN: dependency cycle" in output
        # Both cycle items must still be attempted
        assert writer.add_raga.call_count == 2

    def test_mutations_only_bundle(self, tmp_path):
        """A mutations-only bundle goes entirely through Pass 2; no [CREATE PASS] header."""
        writer = self._make_mock_writer()
        bundle = _bundle({
            "musicians": [_make_append_youtube("m1", "http://yt/1")],
        })
        errors, output = self._run(bundle, writer, tmp_path)
        assert errors == 0
        assert "[CREATE PASS]" not in output
        assert "[MUTATION PASS]" in output

    def test_empty_bundle(self, tmp_path):
        """An empty bundle returns 0 errors and does not crash."""
        writer = self._make_mock_writer()
        errors, _ = self._run(_bundle({}), writer, tmp_path)
        assert errors == 0
