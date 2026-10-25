"""
test_playlist_bar_layout.py — regression guard for the ADR-175 Playlist Bar
look-and-feel.

Pins three layout contracts that a previous revision got wrong:

1. The bar stretches gas-like between the floating view selector and help
   button (`left`/`right` anchors) — it is not a centred fixed-width pill.
2. On desktop the bar is clamped to the canvas column whenever a sidebar is
   open, so the bar (and the docked player that inherits its width) never
   occlude the bani-flow or musician panel.
3. The bar no longer carries a chip summary (ADR-205): the control strip
   centres on desktop and spreads across the freed width on mobile.

ADR-195 adds the modal-editor contract: #pb-count is the only editor control
(the chevron is retired) and the editor rows are draggable. ADR-196 caps a row
at two lines: chips scroll on one line and the row is split into a metadata
group and an action group.

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


def test_bar_retires_the_chip_summary_and_lays_out_the_controls():
    """ADR-205: the bar is controls, not identity. The `#pb-summary` chip strip
    is retired (the editor and video placard own now-playing), so the freed
    band centres the strip on desktop and spreads it on mobile."""
    css = _base()
    assert "#pb-summary" not in css, "the Playlist Bar chip summary must be retired"
    assert "pb-empty-hint" not in css, "the empty hint went with the summary"
    bar = _rule(css, "#playlist-bar")
    assert "justify-content: center" in bar, "the desktop strip must centre"
    assert re.search(
        r"#playlist-bar\s*\{[^}]*justify-content:\s*space-between", css, re.DOTALL
    ), "the mobile strip must spread across the freed width"
    mp = (
        PROJECT_ROOT / "carnatic" / "render" / "templates" / "media_player.js"
    ).read_text(encoding="utf-8")
    assert "#pb-summary" not in mp, "_renderPlaylistBar must not build a summary"


def test_playlist_rows_are_capped_at_two_lines():
    """ADR-196: a row is exactly two non-wrapping groups (metadata + actions),
    so it can never exceed two lines. Chips scroll on one line in the modal too
    (this supersedes ADR-195's chip-wrap clause)."""
    css = _base()
    # Shared chip base keeps its single-line scroll.
    row = _rule(css, ".mp-queue-chips")
    assert "flex-wrap: nowrap" in row, "the shared row base still scrolls"
    assert re.search(
        r"\.mp-queue-chips\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0", css, re.DOTALL
    ), "chips keep their natural width so the strip scrolls, not squashes"
    # The modal chip override is now a single-line scroll too (ADR-196).
    editor = re.search(
        r"#hd-body \.playlist-editor \.mp-queue-chips\s*\{(.*?)\}",
        css, re.DOTALL,
    )
    assert editor, "missing the modal chip override"
    block = editor.group(1)
    assert "flex-wrap: nowrap" in block, "the modal editor chips must not wrap"
    assert "overflow-x: auto" in block, "the modal editor chips must scroll"
    # The two groups each stay on one line.
    meta = _rule(css, ".mp-queue-meta")
    actions = _rule(css, ".mp-queue-actions")
    assert "nowrap" in meta or "flex-wrap" not in meta
    assert "nowrap" in actions, "the action group must never wrap"
    # Mobile: the current item's metadata takes its own line.
    assert re.search(
        r"@media \(max-width: 768px\)\s*\{[^}]*"
        r"\.playlist-editor \.mp-queue-current \.mp-queue-meta\s*\{\s*flex-basis: 100%",
        css, re.DOTALL,
    ), "the mobile current row must wrap its metadata to its own line"
    # JS builds both groups.
    mp = (
        PROJECT_ROOT / "carnatic" / "render" / "templates" / "media_player.js"
    ).read_text(encoding="utf-8")
    assert "meta.className = 'mp-queue-meta'" in mp
    assert "actions.className = 'mp-queue-actions'" in mp


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
    assert "mp-queue-grip" in mp, "the row keeps its drag affordance"
    assert "mp-queue-pos" not in mp, "rows no longer carry a numeric ordinal badge"


def test_queue_label_chips_follow_the_same_chip_contract():
    """A bare-label item must not balloon the row: the fallback
    .yt-label-chip is overridden in the queue row and search result to the same
    single-line, natural-width, centred contract as every other chip."""
    css = _base()
    match = re.search(
        r"\.mp-queue-chips \.yt-label-chip,\s*"
        r"\.track-result-chips \.yt-label-chip\s*\{(.*?)\}",
        css, re.DOTALL,
    )
    assert match, "missing queue-context override for the fallback label chip"
    assert "#pb-summary" not in css, "the bar summary is retired (ADR-205)"
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


def test_desktop_bar_surface_toggles_the_video_without_stealing_controls():
    """ADR-204: a press on a non-control part of the desktop Playlist Bar
    toggles the docked video through the ADR-186 primitive. Controls and chips
    keep their own actions, and mobile keeps its bottom-sheet pair."""
    mp = (PROJECT_ROOT / "carnatic" / "render" / "templates" / "media_player.js").read_text(
        encoding="utf-8"
    )
    assert "bar.addEventListener('click', _onPlaylistBarClick)" in mp
    start = mp.index("function _onPlaylistBarClick(e)")
    body = mp[start:start + 500]
    assert "_isMobilePlayer()" in body, "the whole-bar toggle is desktop-only"
    assert "_isPlaylistBarControl(e.target)" in body, (
        "buttons, chips and the volume slider must not toggle the video"
    )
    assert "_toggleVideoVisibility()" in body, (
        "the bar must reuse the ADR-186 show/hide primitive"
    )
    assert re.search(
        r"button, input, select, textarea, a, \[role=\"button\"\], \[class\*=\"chip\"\]",
        mp,
    ), "control exclusion must cover buttons, inputs, links and chips"
    css = _base()
    assert "cursor: pointer" in _rule(css, "#playlist-bar"), (
        "the non-control bar surface should read as clickable"
    )


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
