"""
test_fixed_dock_player.py — ADR-183 guard for the fixed, docked content player.

The video player is no longer a floating window: it cannot be dragged or
resized, it always rests magnetically beneath the Playlist UI, and the playlist
editor is height-capped so the video's own minimize/close controls can never be
pushed off-screen.

Failure here means the fixed-dock contract drifted; update media_player.js /
base.html (and UIMAP.md §5) in the same commit.
"""
from __future__ import annotations

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
TEMPLATES = PROJECT_ROOT / "carnatic" / "render" / "templates"
MP = TEMPLATES / "media_player.js"
BASE = TEMPLATES / "base.html"


def _mp() -> str:
    return MP.read_text(encoding="utf-8")


def _function_body(src: str, name: str) -> str:
    """Return the body of a top-level `function <name>(...) { ... }` block."""
    start = src.index(f"function {name}(")
    # Walk braces so nested blocks don't terminate early.
    depth = 0
    i = src.index("{", start)
    begin = i
    while i < len(src):
        ch = src[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return src[begin:i + 1]
        i += 1
    raise AssertionError(f"unterminated function body: {name}")


def test_content_player_has_no_drag_or_resize_grips():
    body = _function_body(_mp(), "createPlayer")
    assert "mp-drag-handle" not in body, (
        "content player must not build a drag handle (ADR-183)"
    )
    assert "mp-resize" not in body, (
        "content player must not build a resize grip (ADR-183)"
    )
    assert "wireDrag(" not in body, "content player must not be draggable"
    assert "wireResize(" not in body, "content player must not be resizable"


def test_player_width_always_matches_the_playlist_ui():
    body = _function_body(_mp(), "_playerMatchWidth")
    assert "_userResized" not in body, (
        "the fixed player must always take the Playlist UI width"
    )
    assert "el.style.width" in body


def test_player_controls_are_always_shown():
    body = _function_body(_mp(), "_syncPlayerControls")
    assert "overlay.style.display = 'flex'" in body, (
        "the docked video must always show its minimize/close controls"
    )
    assert "_detached" not in body and "editorOpen" not in body, (
        "control visibility must no longer depend on the editor row or detachment"
    )


def test_editor_height_is_clamped_before_docking_and_on_resize():
    src = _mp()
    assert "function _clampPlaylistEditorHeight" in src
    # The clamp must run in every path that positions the player or reflows the
    # layout, so the editor never pushes the video out of the viewport.
    for fn in ("_dockPlayer", "_repositionPlayers", "_renderPlaylistBar"):
        assert "_clampPlaylistEditorHeight()" in _function_body(src, fn), (
            f"{fn} must re-clamp the playlist editor height"
        )


def test_editor_height_cap_reserves_the_docked_player():
    body = _function_body(_mp(), "_clampPlaylistEditorHeight")
    assert "playerH" in body and "innerHeight" in body, (
        "the cap must reserve the docked player's height within the viewport"
    )
    assert "maxHeight" in body, "the cap must set the editor's max-height"
    assert "window.innerWidth <= 768" in body, (
        "the docked geometry is desktop-only; mobile keeps the sheet layout"
    )


def test_wdp_adjacent_positioning_is_retired():
    src = _mp()
    assert "_wdpAdjacentPosition" not in src, (
        "the video must stay docked to the playlist UI, never jump beside the WDP"
    )


def test_playlist_editor_scrolls_when_capped():
    css = BASE.read_text(encoding="utf-8")
    # `.mp-queue` owns the overflow; `.mp-queue-bar` inherits it and gets a
    # runtime max-height from _clampPlaylistEditorHeight().
    assert re.search(r"\.mp-queue\s*\{[^}]*overflow-y:\s*auto", css, re.DOTALL), (
        "the playlist editor must scroll vertically when capped"
    )
    assert "max-height" in re.search(
        r"#playlist-bar\s+\.mp-queue-bar\s*\{[^}]*\}", css, re.DOTALL
    ).group(0), "the playlist editor needs a max-height fallback"
