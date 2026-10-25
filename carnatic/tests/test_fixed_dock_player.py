"""
test_fixed_dock_player.py — ADR-183 guard for the fixed, docked content player.

The video player is no longer a floating window: it cannot be dragged or
resized, it always rests magnetically beneath the Playlist Bar, and (ADR-195)
the editor is a modal — there is no bar-docked popdown to height-cap and no
surface beneath the editor to reserve room for.

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


def test_editor_height_cap_and_popdown_are_retired():
    """ADR-195: the editor is a modal, so the bar-docked popdown and its
    runtime height cap are gone — the dialog body owns the scroll."""
    src = _mp()
    assert "function _clampPlaylistEditorHeight" not in src
    assert "mp-queue-bar" not in src, "the bar-docked editor is retired"
    css = BASE.read_text(encoding="utf-8")
    assert ".mp-queue-bar" not in css, "the popdown CSS is retired"
    assert re.search(r"#hd-body\s*\{[^}]*overflow-y:\s*auto", css, re.DOTALL), (
        "the modal body must own the vertical scroll"
    )


def test_dock_target_is_the_bar_alone():
    """The player docks under the Playlist Bar; the editor no longer unions in."""
    body = _function_body(_mp(), "_playlistUiRect")
    assert "mp-queue" not in body, (
        "ADR-195: the editor is a modal, so _playlistUiRect must not merge it"
    )


def test_wdp_adjacent_positioning_is_retired():
    src = _mp()
    assert "_wdpAdjacentPosition" not in src, (
        "the video must stay docked to the playlist UI, never jump beside the WDP"
    )



