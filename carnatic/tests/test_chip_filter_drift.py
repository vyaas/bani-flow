"""
test_chip_filter_drift.py — guards for the era/instrument chip-filter behaviour.

Two bugs motivated these, both found by driving real browser input over CDP
rather than by reading the code — the logic looks correct in isolation and only
misbehaves through a cross-file interaction.

1. **Re-entrant mutual exclusion.** `toggleFilterItem()` added the key, then
   `applyChipFilters()` saw a Bani Flow filter active and called
   `clearBaniFilter()`, whose closing line called `clearAllChipFilters()` — which
   cleared the very selection that had just triggered it. The first click on an
   era/instrument item therefore appeared to do nothing and only the second one
   stuck, because by then `activeBaniFilter` was already null.

2. **Chip labels ignored the filter.** In filter mode `applyZoomLabels()` gated
   name-chip visibility purely on tier/zoom, so every musician's name rendered —
   merely dimmed — instead of only the matching ones.

The project has no DOM test harness for graph_view.js, so these are structural
assertions against the JS templates that the render pipeline inlines verbatim
(the same approach AUDIT-019 took). They pin the *shape* of the fix, so a future
refactor that reintroduces either interaction fails loudly.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

TEMPLATES = PROJECT_ROOT / "carnatic" / "render" / "templates"
GRAPH_VIEW = (TEMPLATES / "graph_view.js").read_text()
BANI_FLOW = (TEMPLATES / "bani_flow.js").read_text()


def _strip_comments(src: str) -> str:
    return "\n".join(re.sub(r"//.*$", "", ln) for ln in src.splitlines())


GRAPH_VIEW_CODE = _strip_comments(GRAPH_VIEW)
BANI_FLOW_CODE = _strip_comments(BANI_FLOW)


# ── Bug 1: the mutual exclusion must not cascade back ────────────────────────

def test_clear_bani_filter_takes_a_cascade_option():
    assert "function clearBaniFilter(opts)" in BANI_FLOW_CODE, (
        "clearBaniFilter must accept opts so the chip-filter path can suppress "
        "the reciprocal clearAllChipFilters() call"
    )


def test_clear_bani_filter_guards_the_reciprocal_clear():
    """The cascade must be conditional, never unconditional."""
    assert "if (!opts || opts.cascade !== false) clearAllChipFilters();" in BANI_FLOW_CODE
    # And the bare unconditional form must be gone.
    bare = re.search(r"^\s*clearAllChipFilters\(\);\s*$", BANI_FLOW_CODE, re.M)
    assert bare is None, (
        "an unconditional clearAllChipFilters() in bani_flow.js re-introduces the "
        "re-entrant clear that ate the first chip-filter click"
    )


def test_apply_chip_filters_suppresses_the_cascade():
    assert "clearBaniFilter({ cascade: false })" in GRAPH_VIEW_CODE, (
        "applyChipFilters() must pass cascade:false — it calls clearBaniFilter "
        "*because* a chip filter was just activated"
    )
    assert not re.search(r"\bclearBaniFilter\(\s*\)", GRAPH_VIEW_CODE), (
        "graph_view.js must not call clearBaniFilter() with no options"
    )


def test_toggle_filter_item_is_a_plain_single_toggle():
    """
    The handler must remain a straight add/delete on one click. If this grows a
    second mutation path, single-click behaviour is at risk again.
    """
    m = re.search(r"function toggleFilterItem\(item\)\s*\{(.*?)\n\}", GRAPH_VIEW_CODE, re.S)
    assert m, "toggleFilterItem not found"
    body = m.group(1)
    assert body.count("activeFilters[group].add(") == 1
    assert body.count("activeFilters[group].delete(") == 1
    assert "clearAllChipFilters" not in body


# ── Bug 2: name chips are focus-driven, never zoom-driven ────────────────────
#
# First fix gated filter-mode labels on filter membership, which stopped the
# "every name, dimmed" clutter. That was still too crowded — filtering to `vocal`
# passes 141 musicians. The rule is now: in filter mode nothing is named until a
# node is clicked, and then only that node and everything it connects to.

def test_focused_id_is_available_in_both_modes():
    """
    Filter mode is focus-driven now, so `focusedId` can no longer be computed as
    `defaultView ? _currentPanelNodeId : null` — that made it null exactly when
    the filter branch needs it.
    """
    m = re.search(r"function applyZoomLabels\(\)\s*\{(.*?)\n\}", GRAPH_VIEW_CODE, re.S)
    body = m.group(1)
    assert "const focusedId = _currentPanelNodeId;" in body
    assert "defaultView ? _currentPanelNodeId" not in body


def test_filter_mode_labels_are_focus_only():
    m = re.search(r"function applyZoomLabels\(\)\s*\{(.*?)\n\}", GRAPH_VIEW_CODE, re.S)
    body = m.group(1)
    show = re.search(r"const show = defaultView(.*?);", body, re.S)
    assert show, "show expression not found"
    expr = show.group(1)
    # default branch keeps its anchors; filter branch is focus + neighbours only
    assert "isAnchor" in expr, "default view should still name the anchors"
    assert "selected || isFocused || isNeighbor" in expr, \
        "filter mode must name only the focused node and its connections"


def test_zoom_thresholds_are_gone_from_label_visibility():
    """
    Density is managed by click-to-reveal now. A returning tier/zoom threshold
    would reintroduce the crowding this replaced.
    """
    m = re.search(r"function applyZoomLabels\(\)\s*\{(.*?)\n\}", GRAPH_VIEW_CODE, re.S)
    body = m.group(1)
    assert "label_tier" not in body, "applyZoomLabels no longer consults label_tier"
    assert "cy.zoom()" not in body, "applyZoomLabels no longer consults zoom"
    assert not re.search(r"z >= 0\.\d+", body), "no zoom thresholds in label visibility"


def test_connections_are_named_regardless_of_filter_membership():
    """
    Clicking a violinist should reveal who their guru was even if the guru sang,
    so the filter must NOT gate the neighbour reveal.
    """
    m = re.search(r"function applyZoomLabels\(\)\s*\{(.*?)\n\}", GRAPH_VIEW_CODE, re.S)
    body = m.group(1)
    assert "passesFilter" not in body, (
        "a filter gate on label visibility would hide the names of connections "
        "that do not match the active filter"
    )


def test_apply_chip_filters_still_owns_chip_faded_in_filter_mode():
    """
    applyZoomLabels' filter gate reads `chip-faded`, so applyChipFilters must
    keep setting it, and applyZoomLabels must not clobber it outside defaultView.
    """
    m = re.search(r"function applyChipFilters\(\)\s*\{(.*?)\n\}", GRAPH_VIEW_CODE, re.S)
    body = m.group(1)
    assert "node.addClass('chip-faded')" in body
    assert "node.removeClass('chip-faded')" in body

    z = re.search(r"function applyZoomLabels\(\)\s*\{(.*?)\n\}", GRAPH_VIEW_CODE, re.S).group(1)
    toggles = re.findall(r"n\.toggleClass\('chip-faded'", z)
    assert len(toggles) == 1, "chip-faded should be toggled once, inside the defaultView branch"
    # that single toggle must sit under a defaultView guard
    assert re.search(r"if \(defaultView\) \{\s*\n\s*n\.toggleClass\('chip-faded'", z)
