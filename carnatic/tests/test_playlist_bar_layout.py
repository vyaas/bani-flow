"""
test_playlist_bar_layout.py — regression guard for the ADR-175 Playlist Bar
look-and-feel.

Pins three layout contracts that a previous revision got wrong:

1. The bar stretches gas-like between the floating view selector and help
   button (`left`/`right` anchors) — it is not a centred fixed-width pill.
2. On desktop the bar is clamped to the canvas column whenever a sidebar is
   open, so the bar (and the docked player that inherits its width) never
   occlude the bani-flow or musician panel.
3. `#pb-summary` scrolls horizontally with a thin scrollbar when its chips
   overflow, and the chips keep their natural width (no squashing).

ADR-195 adds the modal-editor contract: #pb-count is the only editor control
(the chevron is retired) and the editor's draggable rows wrap their chips.

The on-screen "Carnatic Music Explorer" title is retired; only the help button
remains in the top-right cluster.

Failure here means the layout drifted; update base.html (and UIMAP.md §5) in the
same commit.
"""
from __future__ import annotations

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
BASE = PROJECT_ROOT / "carnatic" / "render" / "templates" / "base.html"


def _base() -> str:
    return BASE.read_text(encoding="utf-8")


def _rule(css: str, selector: str) -> str:
    """Return the declaration block for a top-level CSS rule (best effort)."""
    match = re.search(re.escape(selector) + r"\s*\{(.*?)\}", css, re.DOTALL)
    assert match, f"rule not found: {selector}"
    return match.group(1)


def test_title_retired_help_button_remains():
    css = _base()
    assert "<h1>Carnatic Music Explorer</h1>" not in css, (
        "the on-screen title was retired — only the help button remains"
    )
    assert 'id="app-title-float"' in css and 'id="help-btn"' in css


def test_bar_stretches_between_chrome_anchors():
    block = _rule(_base(), "#playlist-bar")
    assert "left:" in block and "right:" in block
    assert "translateX(-50%)" not in block, "bar must not be a centred pill"
    assert "width: auto" in block


def test_bar_is_clamped_to_open_sidebars_on_desktop():
    css = _base()
    left = re.search(
        r"body:has\(#left-sidebar\.drawer-open\)\s*#playlist-bar\s*\{[^}]*\}",
        css,
    )
    right = re.search(
        r"body:has\(#right-sidebar\.drawer-open\)\s*#playlist-bar\s*\{[^}]*\}",
        css,
    )
    assert left, "missing desktop clamp against the open left panel"
    assert right, "missing desktop clamp against the open right panel"
    assert "--left-panel-width" in left.group(0)
    assert "--right-panel-width" in right.group(0)


def test_summary_scrolls_with_thin_scrollbar_and_fixed_chips():
    css = _base()
    assert re.search(
        r"#pb-summary\s*\{[^}]*overflow-x:\s*auto", css, re.DOTALL
    ), "#pb-summary must scroll horizontally on overflow"
    assert "scrollbar-width: thin" in _rule(css, "#pb-summary")
    assert re.search(
        r"#pb-summary\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0", css, re.DOTALL
    ), "chips must keep their natural width so the strip scrolls, not squashes"


def test_editor_rows_wrap_while_the_bar_scrolls():
    """ADR-195: the modal form has the width, so its chip cluster WRAPS; the
    bar keeps the ADR-179 single-line scroll (its base .mp-queue-chips rule)."""
    css = _base()
    row = _rule(css, ".mp-queue-chips")
    assert "flex-wrap: nowrap" in row, "the shared row base still scrolls"
    assert re.search(
        r"\.mp-queue-chips\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0", css, re.DOTALL
    ), "chips keep their natural width so the strip scrolls, not squashes"
    editor = re.search(
        r"#hd-body \.playlist-editor \.mp-queue-chips\s*\{(.*?)\}",
        css, re.DOTALL,
    )
    assert editor, "missing the modal chip-wrap override (ADR-195)"
    block = editor.group(1)
    assert "flex-wrap: wrap" in block, "the modal editor rows must wrap chips"
    assert "overflow-x: visible" in block, "the modal editor must not scroll chips"


def test_bar_count_is_the_only_editor_control():
    """ADR-195: the chevron is retired; the x / y count button toggles the
    Playlist Editor modal."""
    css = _base()
    assert 'id="pb-count"' in css and 'id="pb-editor-toggle"' not in css
    mp = (PROJECT_ROOT / "carnatic" / "render" / "templates" / "media_player.js").read_text(
        encoding="utf-8"
    )
    assert "count.addEventListener('click', _togglePlaylistEditor)" in mp
    assert "function _togglePlaylistEditor" in mp


def test_editor_is_a_modal_with_draggable_rows():
    """ADR-195: the editor is hosted by the shared help dialog and its rows
    reorder by native drag-and-drop through MediaQueue.move()."""
    mp = (PROJECT_ROOT / "carnatic" / "render" / "templates" / "media_player.js").read_text(
        encoding="utf-8"
    )
    assert "playlist-editor" in mp
    assert "openHelpDialog('Playlist'" in mp, "editor must open as a dialog"
    assert "helpdialogclosed" in mp, "the dialog close must sync MediaQueue.panelOpen"
    assert "draggable = true" in mp, "editor rows must be draggable entities"
    assert "MediaQueue.move(from, to)" in mp, "drop must reuse the queue move()"
    assert "mp-queue-grip" in mp and "mp-queue-pos" in mp


def test_queue_label_chips_follow_the_same_chip_contract():
    """A bare-label item must not balloon the row/bar: the fallback
    .yt-label-chip is overridden in the queue row and Playlist Bar to the same
    single-line, natural-width, centred contract as every other chip."""
    css = _base()
    match = re.search(
        r"\.mp-queue-chips \.yt-label-chip,\s*"
        r"(?:\.track-result-chips \.yt-label-chip,\s*)?"
        r"#pb-summary \.yt-label-chip\s*\{(.*?)\}",
        css, re.DOTALL,
    )
    assert match, "missing queue-context override for the fallback label chip"
    block = match.group(1)
    for decl in (
        "white-space: nowrap", "max-width: none",
        "align-self: center", "margin-top: 0",
    ):
        assert decl in block, f"label chip override missing: {decl}"


def test_empty_playlist_bar_is_hidden_not_faded():
    """ADR-185: the bar is ephemeral chrome. With an empty queue it must be
    gone entirely (display:none), not a dimmed "Playlist empty" hint."""
    css = _base()
    block = _rule(css, "#playlist-bar.pb-empty")
    assert "display: none" in block, "an empty Playlist Bar must be hidden"
    assert "opacity" not in block, "the old faded-empty state is retired"


def test_render_playlist_bar_publishes_the_view_wall():
    """The bar's own appear/disappear changes the view's top wall, but the
    editor ResizeObserver only fires on editor-box changes — so every bar
    render must publish the inset and request a refit (ADR-185 D3)."""
    mp = (PROJECT_ROOT / "carnatic" / "render" / "templates" / "media_player.js").read_text(
        encoding="utf-8"
    )
    start = mp.index("function _renderPlaylistBar()")
    body = mp[start:start + 4000]
    assert "_syncViewTopInset()" in body, (
        "_renderPlaylistBar must re-publish --playlist-ui-bottom"
    )
    assert "refitViewWindow" in body, (
        "_renderPlaylistBar must request a view refit when the bar toggles"
    )


def test_hidden_bar_collapses_the_playlist_ui_wall():
    """_playlistUiRect must report a hidden (display:none, zero-size) bar as
    absent so the dynamic wall collapses to --chrome-top."""
    mp = (PROJECT_ROOT / "carnatic" / "render" / "templates" / "media_player.js").read_text(
        encoding="utf-8"
    )
    start = mp.index("function _playlistUiRect()")
    body = mp[start:start + 600]
    assert "return null" in body, (
        "a display:none Playlist Bar must yield no playlist-UI rect"
    )
