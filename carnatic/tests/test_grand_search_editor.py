"""
test_grand_search_editor.py — ADR-184 guard for the grand track search, the
thin editor bar, and the now-playing overlay.

Pins the architecture the ADR introduces:

* `#search-bar` (`#track-search-input` + `#track-search-dropdown`) is the top
  band; `#playlist-bar` is the thin editor band BELOW it.
* `search.js` indexes both `perfToPerf` (recorded concerts) and
  `musician.youtube[]` tracks; word-prefix matching with a whole-name boost.
* Every playlist row owns copy/permalink/watch (no phantom columns) and the
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


def test_mobile_chrome_clears_both_bands():
    css = _base()
    block = re.search(
        r"@media \(max-width: 768px\) \{\s*:root \{ --chrome-top: (\d+)px; \}", css
    )
    assert block, "missing mobile --chrome-top override"
    assert int(block.group(1)) >= 168, (
        "mobile --chrome-top must clear BOTH the search and editor bands"
    )
    assert re.search(r"#search-bar\s*\{[^}]*top: 52px", css, re.DOTALL)
    assert re.search(r"#playlist-bar\s*\{[^}]*top: 112px", css, re.DOTALL)


# ── the playlist row contract ─────────────────────────────────────────────────


def test_row_chevron_and_up_next_head_are_retired():
    src = _mp()
    assert "mp-queue-collapse" not in src, "the per-row chevron was retired"
    assert "mp-queue-op-phantom" not in src, "rows no longer reserve phantom columns"
    assert "buildQueuePanel" in src
    assert "mp-queue-head" not in src, "the Up Next head was retired"
    assert "mp-queue-save" not in src, "save-queue-as-playlist was retired"


def test_every_row_owns_the_operator_set_unconditionally():
    """The copy/share/watch mkOp calls must not be guarded by `if (isCurrent)`."""
    src = _mp()
    assert "() => _copyMediaLink(item)" in src
    assert "() => _copyMediaPermalink(item)" in src
    assert "() => _openMediaOnYouTube(item)" in src
    # The old phantoms were the tell of a current-only operator set.
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
