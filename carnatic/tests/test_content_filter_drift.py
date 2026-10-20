"""
test_content_filter_drift.py — guards for the unified panel content filter (ADR-178).

The two panel filter bars used to run bespoke, per-structure matching rules
(concert brackets, raga trees, lecdem sections, playlist rows), each extracting
a hand-picked list of text nodes. That meant a label that wasn't in the list
(chip text, lecdem segment name, year, version badge, misc recording title) was
invisible to the filter.

The fix replaces both listeners with one shared textContent engine in
panel_components.js. These are structural assertions against the JS templates
the render pipeline inlines verbatim — the project has no DOM test harness for
graph_view.js, so we pin the *shape* of the fix:

1. Both inputs advertise "Filter content…".
2. The listeners delegate to `applyPanelContentFilter` and no longer carry the
   old per-type matching bodies.
3. The engine keeps the ADR-165 §3 visibility-channel invariant: exclusions go
   through inline `style.display`, never the `hidden` attribute.
4. The zone tables keep the row selectors that make every panel structure
   searchable (lecdems + segments, subject chips, misc recordings, composition
   groups, playlists, notes).
"""
from __future__ import annotations

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
TEMPLATES = PROJECT_ROOT / "carnatic" / "render" / "templates"

BASE_HTML = (TEMPLATES / "base.html").read_text()
GRAPH_VIEW = (TEMPLATES / "graph_view.js").read_text()
PANEL_COMPONENTS = (TEMPLATES / "panel_components.js").read_text()


def _strip_comments(src: str) -> str:
    return "\n".join(re.sub(r"//.*$", "", ln) for ln in src.splitlines())


GRAPH_VIEW_CODE = _strip_comments(GRAPH_VIEW)
PANEL_COMPONENTS_CODE = _strip_comments(PANEL_COMPONENTS)


# ── 1. Both filter bars are relabelled ───────────────────────────────────────

def test_both_filter_placeholders_say_filter_content():
    assert BASE_HTML.count('placeholder="Filter content&#8230;"') == 2, (
        "both #rec-filter and #trail-filter must advertise 'Filter content…' "
        "(ADR-178)"
    )
    assert 'placeholder="Filter recordings' not in BASE_HTML
    assert 'placeholder="Filter trail' not in BASE_HTML


# ── 2. Listeners delegate; the old per-type bodies are gone ──────────────────

def test_rec_filter_listener_delegates_to_the_engine():
    assert "applyPanelContentFilter('musician', this.value)" in GRAPH_VIEW_CODE


def test_trail_filter_listener_delegates_to_the_engine():
    assert "applyPanelContentFilter('bani', this.value)" in GRAPH_VIEW_CODE


def test_old_per_type_matching_bodies_are_removed():
    # These were the tell-tale locals of the pre-ADR-178 listeners.
    for stale in (
        "composerChipText",       # rec-filter bracket pass
        "lecdem-subjects",        # rec-filter lecdem pass
        "tree-group-header",      # rec-filter raga-tree pass
        "trail-artist-primary",   # trail-filter flat branch
    ):
        assert stale not in GRAPH_VIEW_CODE, (
            f"stale per-type filter code {stale!r} still lives in graph_view.js; "
            "the ADR-178 engine supersedes it"
        )


# ── 3. Visibility-channel invariant (ADR-165 §3) ─────────────────────────────

def test_engine_excludes_via_inline_display_only():
    m = re.search(r"function _contentFilterShow\(el, visible\)\s*\{(.*?)\n\}", PANEL_COMPONENTS_CODE, re.S)
    assert m, "_contentFilterShow not found in panel_components.js"
    body = m.group(1)
    # The exclusion must be an inline declaration, and it must be `!important`:
    # ADR-180's ribbon rules set `display:flex !important` on row containers
    # (notably `li.concert-perf-item`), which a plain inline `none` cannot beat.
    assert "el.style.setProperty('display', 'none', 'important')" in body
    assert "el.style.removeProperty('display')" in body
    assert "hidden" not in body, (
        "the content filter must not toggle the `hidden` attribute — that is "
        "the collapse channel (ADR-165 §3)"
    )


# ── 4. Every panel structure is reachable through a row selector ─────────────

def test_engine_covers_all_panel_structures():
    for sel in (
        "li.lecdem-row",        # lecdems
        "li.concert-perf-item", # segment names
        "li.tree-comp-node",    # raga-tree composition nodes
        "li.tree-misc-leaf",    # misc recordings
        "li.comp-raga-item",    # compositions-by-raga
        "li.tree-leaf",         # bani trail leaves
        "li.notes-item",        # notes
        "section[data-section=\"playlists\"] .row-accordion",  # playlists
    ):
        assert sel in PANEL_COMPONENTS_CODE, f"ADR-178 filter zone lost row {sel!r}"


def test_engine_defines_both_panel_keys():
    assert "function applyPanelContentFilter" in PANEL_COMPONENTS_CODE
    assert "window.applyPanelContentFilter = applyPanelContentFilter" in PANEL_COMPONENTS_CODE
    assert "musician: [" in PANEL_COMPONENTS_CODE
    assert "bani: [" in PANEL_COMPONENTS_CODE
    # The bani key must also sweep the lecdem strip + playlist block.
    assert "#bani-lecdem-strip" in PANEL_COMPONENTS_CODE
    assert "#bani-playlists" in PANEL_COMPONENTS_CODE
