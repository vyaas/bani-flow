"""
test_trail_queue_item_invariants.py — regression guard for AUDIT-019.

The trail-level "Play all" / "Enqueue all" buttons (ADR-167) harvest queue
items by invoking every row's `registerQueueItem` thunk via
`collectQueueItems(#trail-list)`. ADR-163 §5 requires concert-segment rows to
carry an `end_seconds` boundary so the queue advances at the segment edge
instead of bleeding into the rest of the source video.

AUDIT-019 documented that three of the four queue-item construction sites in
`bani_flow.js` had copy-pasted inline thunks that omitted `end_seconds`,
breaking the marubalka enqueue-all scenario (Ariyakudi's segment would not
advance to Semmangudi, TM Krishna, Vignesh Ishwar — the rest of the
Shanmukhananda 1963 concert played instead).

The fix collapses all four sites to a single canonical helper,
`_buildRowQueueItem(row)`, which itself calls `_deriveRowEndSec(row)` to
compute the boundary. This module tests that structural invariant statically
against the JS template — if a future contributor adds a new
`registerQueueItem` or `_buildPlusBtn` call site with an inline thunk, these
tests fail.

Plus one data-side test that confirms the marubalka bani flow still has the
2 concert-segment + 2 standalone mix that AUDIT-019 regressed on, so the
regression scenario itself doesn't silently disappear via data drift.
"""

import re
from pathlib import Path

import pytest

from carnatic.graph_api import CarnaticGraph

BANI_FLOW_JS = (
    Path(__file__).parent.parent / "render" / "templates" / "bani_flow.js"
)


# ── helpers ────────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def bani_flow_src() -> str:
    """Read the bani_flow.js template once per test module."""
    assert BANI_FLOW_JS.exists(), (
        f"bani_flow.js not found at {BANI_FLOW_JS} — has the render pipeline moved?"
    )
    return BANI_FLOW_JS.read_text(encoding="utf-8")


def _slice_after(src: str, start: int, n_lines: int = 5) -> str:
    """Return the next n_lines of source after the match start position."""
    return "\n".join(src[start:].splitlines()[:n_lines])


# ── helper presence + shape ────────────────────────────────────────────────────


def test_derive_row_end_sec_helper_defined(bani_flow_src: str) -> None:
    """
    `_deriveRowEndSec(row)` must exist and compute the boundary by:
      1. gating on `row.isStructured && row.track.recording_id`,
      2. filtering musicianToPerformances by `recording_id`,
      3. sorting by `offset_seconds`,
      4. returning the next perf's `offset_seconds`, or null.
    """
    m = re.search(
        r"function\s+_deriveRowEndSec\s*\(\s*row\s*\)\s*\{(.+?)\n\}",
        bani_flow_src,
        re.DOTALL,
    )
    assert m, "_deriveRowEndSec(row) helper is missing — AUDIT-019 fix removed"
    body = m.group(1)

    assert "row.isStructured" in body and "row.track.recording_id" in body, (
        "_deriveRowEndSec must gate on isStructured + recording_id "
        "(standalone whole-video rows should return null)"
    )
    assert "musicianToPerformances" in body, (
        "_deriveRowEndSec must scan musicianToPerformances to find the next perf"
    )
    assert "offset_seconds" in body, (
        "_deriveRowEndSec must sort/compare by offset_seconds"
    )


def test_build_row_queue_item_helper_defined(bani_flow_src: str) -> None:
    """
    `_buildRowQueueItem(row)` must exist and emit `end_seconds` via
    `_deriveRowEndSec(row)` so the harvest and + menu agree by construction
    (ADR-165 §3).
    """
    m = re.search(
        r"function\s+_buildRowQueueItem\s*\(\s*row\s*\)\s*\{(.+?)\n\}",
        bani_flow_src,
        re.DOTALL,
    )
    assert m, "_buildRowQueueItem(row) helper is missing — AUDIT-019 fix removed"
    body = m.group(1)

    assert "end_seconds:" in body, (
        "_buildRowQueueItem must emit an end_seconds key in meta — without it "
        "the MediaQueue advance never fires at the segment boundary"
    )
    assert "_deriveRowEndSec(row)" in body, (
        "_buildRowQueueItem must derive end_seconds via _deriveRowEndSec(row) — "
        "any other source risks divergence between sites"
    )
    # The other meta fields the rest of the player relies on.
    for key in ("media:", "startSeconds:", "meta:", "nodeId:", "ragaId:",
                "compositionId:", "recId:"):
        assert key in body, f"_buildRowQueueItem missing required field: {key}"


# ── structural invariant: every callsite routes through the helper ─────────────


def test_every_trail_register_queue_item_uses_canonical_helper(
    bani_flow_src: str,
) -> None:
    """
    AUDIT-019 root cause: copy-pasted inline thunks at three `registerQueueItem`
    sites omitted end_seconds. The structural fix is that every trail-row
    `registerQueueItem(` call in bani_flow.js must wrap _buildRowQueueItem —
    no inline `meta: {...}` literals allowed.

    Scope: trail rows are identified structurally as thunks whose emitted meta
    carries `recId:` (the concert-segment marker). Other registerQueueItem
    sites — notably lecture-demo entries — have a different row shape (no
    `row.track`, no recording_id, never a concert segment) and correctly emit
    end_seconds == null by construction. They are exempt.

    If this test fails, a contributor has added a new trail-row
    registerQueueItem call with an inline thunk. Route them to use
    _buildRowQueueItem(row).
    """
    sites = list(re.finditer(r"\bregisterQueueItem\s*\(", bani_flow_src))
    assert sites, (
        "No registerQueueItem call sites found in bani_flow.js — has the "
        "ADR-167 harvest been removed?"
    )

    bad_sites: list[tuple[int, str]] = []
    for site in sites:
        # Look at the next ~10 lines after the call — long enough to see the
        # thunk's meta block.
        window = _slice_after(bani_flow_src, site.start(), n_lines=10)
        # Trail-row thunks always include `recId:` in their meta. Lecdem and
        # any other future non-trail thunk does not — skip those.
        if "recId:" not in window:
            continue
        if "_buildRowQueueItem(" not in window:
            line_no = bani_flow_src[: site.start()].count("\n") + 1
            bad_sites.append((line_no, window))

    assert not bad_sites, (
        "Trail-row registerQueueItem call(s) not routed through "
        "_buildRowQueueItem — AUDIT-019 regression risk:\n\n"
        + "\n\n".join(f"  bani_flow.js:{ln}:\n{w}" for ln, w in bad_sites)
    )


def test_every_plus_btn_uses_canonical_helper(bani_flow_src: str) -> None:
    """
    ADR-165 §3: the + menu thunk and the harvest thunk must produce identical
    queue items. Enforced by both calling _buildRowQueueItem.

    If this test fails, a contributor has added a + button thunk that builds
    its own queue-item literal. Route them to use _buildRowQueueItem(row).
    """
    sites = list(re.finditer(r"\b_buildPlusBtn\s*\(", bani_flow_src))
    assert sites, (
        "No _buildPlusBtn call sites found in bani_flow.js — has the "
        "+ affordance been removed?"
    )

    bad_sites: list[tuple[int, str]] = []
    for site in sites:
        window = _slice_after(bani_flow_src, site.start(), n_lines=6)
        if "_buildRowQueueItem(" not in window:
            line_no = bani_flow_src[: site.start()].count("\n") + 1
            bad_sites.append((line_no, window))

    assert not bad_sites, (
        "_buildPlusBtn call(s) not routed through _buildRowQueueItem — "
        "ADR-165 §3 invariant violated:\n\n"
        + "\n\n".join(f"  bani_flow.js:{ln}:\n{w}" for ln, w in bad_sites)
    )


# ── data-side: the marubalka regression scenario must remain reproducible ─────


def test_marubalka_fixture_has_concert_segment_and_standalone_mix(
    graph: CarnaticGraph,
) -> None:
    """
    AUDIT-019's reproduction relied on marubalka having both:
      * concert-segment rows (recording_id != None, offset_seconds > 0) — these
        are the rows that need end_seconds and were broken,
      * standalone whole-video rows (recording_id == None) — these are the
        rows that correctly have end_seconds == None.

    If a curation change removes either group from marubalka, the regression
    scenario disappears and this guard should fail so we know to pick a new
    fixture composition for the structural tests above.
    """
    flow = graph.get_bani_flow("marubalka")
    assert flow, "marubalka has no bani flow entries — AUDIT-019 fixture is gone"

    concert_segments = [e for e in flow if e.get("recording_id")]
    standalones = [e for e in flow if not e.get("recording_id")]

    assert len(concert_segments) >= 2, (
        f"marubalka has {len(concert_segments)} concert-segment row(s); "
        "AUDIT-019 needs at least 2 to exercise the cross-recording queue "
        "advance. Pick a new fixture composition or restore the data."
    )
    assert len(standalones) >= 1, (
        f"marubalka has {len(standalones)} standalone row(s); AUDIT-019 needs "
        "at least 1 to verify end_seconds correctly stays null for whole-video "
        "entries."
    )

    # Every concert-segment row must have a non-trivial offset so the
    # end_seconds boundary is observable.
    for e in concert_segments:
        assert (e.get("offset_seconds") or 0) > 0, (
            f"concert-segment row for marubalka in {e.get('recording_id')} has "
            "no offset_seconds — boundary advance cannot be tested"
        )
