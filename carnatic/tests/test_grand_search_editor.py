"""
test_grand_search_editor.py — ADR-184 guard for the grand track search, the
thin editor bar, and the now-playing overlay.

Pins the architecture the ADR introduces:

* `#search-bar` (`#track-search-input` + `#track-search-dropdown`) is the top
  band; `#playlist-bar` is the thin editor band BELOW it.
* `search.js` indexes both `perfToPerf` (recorded concerts) and
  `musician.youtube[]` tracks; word-prefix matching with a whole-name boost.
* Only the playing playlist row owns copy/permalink/watch (ADR-197 retires
  ADR-184's per-row clause); no row carries a self-enqueue `+`, and the
  retired per-row chevron / "Up Next" head are gone.
* `_syncNowPlayingOverlays()` paints `.mp-now-playing` (sibling of `.plyr`, so
  fullscreen hides it) from `_refreshQueuePanels`.

Failure means the surface drifted; update UIMAP §5 in the same commit.
"""
from __future__ import annotations

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
TEMPLATES = PROJECT_ROOT / "carnatic" / "render" / "templates"
GRAPH_HTML = PROJECT_ROOT / "carnatic" / "graph.html"
BASE = TEMPLATES / "base.html"
MP = TEMPLATES / "media_player.js"
SEARCH = TEMPLATES / "search.js"


def _base() -> str:
    return BASE.read_text(encoding="utf-8")


def _mp() -> str:
    return MP.read_text(encoding="utf-8")


def _search() -> str:
    return SEARCH.read_text(encoding="utf-8")


# ── the two fixed top bands ───────────────────────────────────────────────────


def test_search_bar_and_editor_bar_are_stacked():
    css = _base()
    assert 'id="search-bar"' in css
    assert 'id="track-search-input"' in css
    assert 'id="track-search-dropdown"' in css
    bar = re.search(r"#playlist-bar\s*\{([^}]*)\}", css, re.DOTALL).group(1)
    assert "top: 56px" in bar, "the editor bar must sit below the search bar"
    assert "left:" in bar and "right:" in bar and "width: auto" in bar


def test_both_bands_clamp_to_open_sidebars():
    css = _base()
    for band in ("#search-bar", "#playlist-bar"):
        assert re.search(
            r"body:has\(#left-sidebar\.drawer-open\)\s*" + re.escape(band) + r"\s*\{[^}]*--left-panel-width",
            css,
        ), f"{band} must clamp to the open left panel"
        assert re.search(
            r"body:has\(#right-sidebar\.drawer-open\)\s*" + re.escape(band) + r"\s*\{[^}]*--right-panel-width",
            css,
        ), f"{band} must clamp to the open right panel"


def test_mobile_search_bar_is_the_chrome_line():
    """ADR-200: mobile --chrome-top is the search bar's bottom edge + gap; the
    Playlist Bar and the drawers share it instead of stacking a third band."""
    css = _base()
    block = re.search(
        r"@media \(max-width: 768px\) \{\s*:root \{ --chrome-top: "
        r"calc\(52px \+ var\(--search-height, 32px\) \+ 8px\); \}",
        css,
    )
    assert block, "mobile --chrome-top must be the search bar's bottom edge + gap"
    assert re.search(r"#search-bar\s*\{[^}]*top: 52px", css, re.DOTALL)
    assert re.search(
        r"#playlist-bar\s*\{[^}]*top: var\(--chrome-top\)", css, re.DOTALL
    ), "the mobile bar must ride the search bar's bottom edge, not a fixed 112px"


# ── the playlist row contract ─────────────────────────────────────────────────


def test_row_chevron_and_up_next_head_are_retired():
    src = _mp()
    assert "mp-queue-collapse" not in src, "the per-row chevron was retired"
    assert "mp-queue-op-phantom" not in src, "rows no longer reserve phantom columns"
    assert "buildQueuePanel" in src
    assert "mp-queue-head" not in src, "the Up Next head was retired"
    assert "mp-queue-save" not in src, "save-queue-as-playlist was retired"


def test_only_the_playing_row_owns_the_operator_set():
    """ADR-197: copy/permalink/watch live on the current row only, and no row
    carries the self-enqueue `+`."""
    src = _mp()
    start = src.index("function _renderQueuePanel(panel)")
    body = src[start:src.index("function _refreshQueuePanels", start)]
    assert re.search(
        r"if \(isCurrent\) \{\s*const mkOp[\s\S]*?_openMediaOnYouTube\(item\)",
        body,
    ), "copy/permalink/watch must sit inside an `if (isCurrent)` guard (ADR-197)"
    assert "_buildPlusBtn" not in body, (
        "a queue row must not carry the + (it would add to self — ADR-197)"
    )
    # The old phantoms stay retired.
    assert "mp-queue-op-phantom" not in src


# ── the now-playing overlay ───────────────────────────────────────────────────


def test_now_playing_overlay_present_and_refreshed():
    css = _base()
    assert ".mp-now-playing" in css
    assert re.search(r"\.mp-now-playing\s*\{[^}]*position:\s*absolute", css, re.DOTALL)
    src = _mp()
    assert "function _syncNowPlayingOverlays" in src
    # createPlayer + mobile mount both append it to the video wrap.
    assert src.count("className = 'mp-now-playing'") >= 2
    # Refreshed from the single mutation funnel.
    assert re.search(
        r"function _refreshQueuePanels\(\)[\s\S]*?_syncNowPlayingOverlays\(\)", src
    ), "_refreshQueuePanels must paint the overlays"


# ── the grand search ──────────────────────────────────────────────────────────


def test_search_indexes_recordings_and_youtube_tracks():
    src = _search()
    assert "function _getIndex" in src
    assert "perfToPerf" in src, "must index recorded concerts"
    assert "d.tracks" in src and "elements" in src, "must index musician.youtube[] tracks"
    # Whole-name boost keeps 'tm krishna' precise; word-prefix keeps it safe.
    assert "startsWith(qp)" in src
    assert "startsWith(t)" in src


def test_search_rows_have_play_and_enqueue():
    src = _search()
    assert "MediaQueue.playContent(item)" in src
    assert "MediaQueue.addItem(item)" in src
    assert "track-result-play" in src and "track-result-enqueue" in src


def test_search_rows_are_compact_and_the_scrollbar_waits_for_inquiry():
    """ADR-205: a result row is a compact single line — the play/enqueue pair
    is excluded from the blanket mobile 44px touch floor (its hit area is
    expanded off-layout) — and the strip's horizontal scrollbar is transparent
    at rest, revealed on hover / while `.is-scrolling` (toggled by search.js)."""
    css = _base()
    row = re.search(r"\.track-result\s*\{([^}]*)\}", css, re.DOTALL).group(1)
    assert "padding: 2px 8px" in row, "the row must be vertically tight"
    assert ":not(.track-result-play):not(.track-result-enqueue)" in css, (
        "the search icon buttons must not take the mobile 44px touch floor"
    )
    assert re.search(
        r"\.track-result-play::after,\s*\.track-result-enqueue::after", css
    ), "the icon buttons need an off-layout hit expansion"
    strip = re.search(r"\.track-result-chips\s*\{([^}]*)\}", css, re.DOTALL).group(1)
    assert "scrollbar-color: transparent transparent" in strip, (
        "the strip scrollbar must be invisible at rest"
    )
    assert ".track-result-chips.is-scrolling" in css
    src = _search()
    assert "classList.add('is-scrolling')" in src
    assert "classList.remove('is-scrolling')" in src
    assert re.search(r"addEventListener\('scroll'[\s\S]*?\}, true\)", src), (
        "the scroll marker must be toggled by a capture-phase listener"
    )


def test_grand_results_are_ephemeral():
    """The result list dismisses on commit and never strands itself over the
    surface it just revealed. Guards the dismiss contract:

    * play / enqueue / chip click each dismiss the overlay (`_dismiss`);
    * a press outside `#search-bar` dismisses even when the pressed element
      calls `preventDefault()` on mousedown to hold focus (capture phase);
    * the query is preserved, so re-focusing recalls the same results.
    """
    src = _search()
    assert "function _dismiss" in src
    assert "function _reopen" in src
    # Enqueue dismisses (play already did); _dismiss is invoked from a handler.
    assert re.search(r"MediaQueue\.addItem\(item\);\s*_dismiss\(\)", src)
    # Outside press: capture-phase mousedown, filtered by the search shell.
    assert re.search(
        r"document\.addEventListener\('mousedown', e => \{[\s\S]*?"
        r"closest\('#search-bar'\)[\s\S]*?\}, true\)",
        src,
    )
    # Result chips stop propagation, so their dismissal is captured too.
    assert re.search(
        r"dropdown\.addEventListener\('click',[\s\S]*?\.musician-chip[\s\S]*?\}, true\)",
        src,
    )


# ── rendered output ───────────────────────────────────────────────────────────


def test_rendered_graph_contains_the_new_surface():
    if not GRAPH_HTML.exists():
        return  # render gate runs bani-render before the suite in CI
    html = GRAPH_HTML.read_text(encoding="utf-8")
    for needle in (
        'id="search-bar"', 'id="track-search-input"', 'id="track-search-dropdown"',
        "function _syncNowPlayingOverlays", "mp-now-playing",
        "function _getIndex", "function _entryFromTrack",
    ):
        assert needle in html, f"rendered graph.html missing {needle!r}"


# ── ADR-190 / ADR-198: the grand search is the only search shell ────────────


def test_grand_search_owns_the_shared_search_shell():
    """ADR-198 retired both panel searches; the grand bar keeps the shell."""
    css = _base()
    for needle in (
        ".search-field {", ".search-field:focus-within", ".search-glyph",
        ".search-clear", "var(--search-radius", "var(--search-height",
        "var(--search-bg", "var(--search-ring",
    ):
        assert needle in css, f"shared search-field contract missing {needle!r}"
    assert 'id="search-bar" class="search-field"' in css
    assert css.count('class="search-field"') == 1, "grand search only"
    assert css.count('class="search-glyph"') == 1
    assert css.count('class="search-clear"') == 1
    for retired in (
        "bani-search-wrap", "musician-search-wrap",
        "bani-search-input", "musician-search-input",
    ):
        assert retired not in css, f"retired panel search still present: {retired}"
    # One glyph; the OS-dependent emoji placeholder is retired.
    assert 'id="icon-search"' in css
    assert "&#128269;" not in css
    # The inner input is no longer a bordered box — the shell is the field.
    field = re.search(r"\.search-input\s*\{([^}]*)\}", css, re.DOTALL).group(1)
    assert "border: none" in field
    # Clear is delegated once in search.js, dispatching a real input event.
    src = _search()
    assert src.count("closest('.search-clear')") == 1
    assert "dispatchEvent(new Event('input'" in src


def test_nav_in_top_chrome_and_add_anchors_the_chip_row():
    """ADR-201/202: one unified nav pair sits in the top-right chrome, left of
    help; each panel's add is the right-justified anchor of its chip row, and
    the filter rows hold only content-filter controls."""
    css = _base()
    for needle in (
        'id="trail-filter-row"', 'id="rec-filter-row"',
        'id="panel-back-btn"', 'id="panel-fwd-btn"',
        'id="bani-add-btn"', 'id="panel-add-btn"',
        'class="panel panel-empty"',
    ):
        assert needle in css
    # The old bani-specific nav ids are retired in favour of the shared pair.
    assert 'id="bani-back-btn"' not in css
    assert 'id="bani-fwd-btn"' not in css
    assert 'class="panel-chip-actions"' not in css
    # The single nav pair lives in #app-title-float, immediately left of help.
    chrome = css[css.index('id="app-title-float"'):css.index('id="help-btn"')]
    for needle in ('id="panel-back-btn"', 'id="panel-fwd-btn"'):
        assert needle in chrome
    # Each chip row carries its add as the last child; neither carries nav.
    left_chip = css[css.index('id="bani-subject-name-row"'):css.index('id="trail-filter-row"')]
    right_chip = css[css.index('id="node-header-chip-row"'):css.index('id="rec-filter-row"')]
    assert 'id="bani-add-btn"' in left_chip
    assert 'id="panel-add-btn"' in right_chip
    for needle in ('id="panel-back-btn"', 'id="panel-fwd-btn"'):
        assert needle not in left_chip
        assert needle not in right_chip
    # Add is the last control in each chip row (after the subject chip/name).
    assert left_chip.index('id="bani-subject-name"') < left_chip.index('id="bani-add-btn"')
    assert right_chip.index('id="node-name"') < right_chip.index('id="panel-add-btn"')
    # The add is right-justified by its rule.
    add_rule = re.search(r"\.panel-add-btn\s*\{([^}]*)\}", css, re.DOTALL).group(1)
    assert "margin-left: auto" in add_rule
    # The filter rows keep the content filter and transport, but no add.
    left_filter = css[css.index('id="trail-filter-row"'):css.index('id="bani-scroll"')]
    right_filter = css[css.index('id="rec-filter-row"'):css.index('id="right-scroll"')]
    assert 'id="bani-add-btn"' not in left_filter
    assert 'id="panel-add-btn"' not in right_filter
    assert 'id="trail-filter"' in left_filter and 'id="rec-filter"' in right_filter
    for needle in ('id="trail-play-acts"', 'id="rec-play-acts"'):
        assert needle in left_filter or needle in right_filter
    # No standalone top row, and no retired panel search chrome.
    assert 'class="panel-top-row"' not in css
    for retired in ("bani-search-dropdown", "musician-search-dropdown",
                    "bani-scope-label", "musician-scope-label"):
        assert retired not in css
