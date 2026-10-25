"""
test_view_window_layout.py — ADR-176 / ADR-203 guard for the framed view window.

The guru-shishya canvas and the mela-janya wheel must live entirely inside the
four walls — below the playlist bar, between the two panels, above the bottom
floor — so the playlist bar can never occlude the layout/filter controls. As of
ADR-203 the desktop layout is frozen: both sidebars are permanent grid bays and
the central window is an explicit bordered frame (the bottom floor is the frame
edge, not a chrome band). This pins that desktop CSS contract; it fails if the
dynamic top wall or the controls' placement drifts back into the top chrome band.

Failure means the layout drifted: update base.html (and UIMAP.md §3/§4/§5) in
the same commit.
"""
from __future__ import annotations

import re
from pathlib import Path

TEMPLATES = (
    Path(__file__).parent.parent.parent
    / "carnatic" / "render" / "templates"
)
BASE = TEMPLATES / "base.html"


def _base() -> str:
    return BASE.read_text(encoding="utf-8")


def test_view_window_is_inset_inside_the_four_walls():
    """ADR-203: the desktop view is a framed bay between the two permanent
    sidebars. ADR-176's dynamic top wall still pushes it below a live Playlist
    Bar; the bay's four borders make the frame boundary explicit."""
    css = _base()
    block = re.search(
        r"#canvas-wrap\s*\{([^}]*--playlist-ui-bottom[^}]*)\}",
        css, re.DOTALL,
    )
    assert block, "#canvas-wrap must carry the dynamic top wall"
    body = block.group(1)
    # Top wall tracks the playlist editor's bottom, never higher than the bar gap.
    assert "max(var(--chrome-top)" in body, (
        "the view's top wall must be max(--chrome-top, playlist-ui-bottom + gap) "
        "so a deepening editor pushes the view (and its controls) lower"
    )
    assert re.search(r"border:\s*[^;]*var\(--border-strong\)", body), (
        "ADR-203: the central view window must be framed by a border"
    )


def test_mobile_view_top_wall_clears_the_playlist_bar():
    """ADR-200: on mobile the drawers ride --chrome-top, so #main (not
    #canvas-wrap) carries the top wall that clears a live Playlist Bar."""
    css = _base()
    assert re.search(
        r"#main\s*\{[^}]*padding-top:\s*max\(var\(--chrome-top\),\s*"
        r"calc\(var\(--playlist-ui-bottom, 0px\) \+ 8px\)\)",
        css, re.DOTALL,
    ), (
        "the mobile view must clear a live Playlist Bar via the same "
        "--playlist-ui-bottom wall the desktop view uses"
    )


def test_view_window_is_inset_by_the_frozen_panel_columns():
    """ADR-203: on desktop both sidebars own fixed grid columns, so the view is
    inset by construction rather than by a margin that appears when a drawer
    opens. Both bays are permanent in-flow panels."""
    css = _base()
    block = re.search(
        r"#main\s*\{([^}]*grid-template-columns:[^}]*)\}", css, re.DOTALL
    )
    assert block, "the desktop #main grid must declare its columns"
    body = block.group(1)
    assert "--left-panel-width" in body and "--right-panel-width" in body, (
        "both sidebars must own a fixed column so the view is always inset"
    )
    assert re.search(
        r"#left-sidebar,\s*#right-sidebar\s*\{[^}]*position:\s*static",
        css, re.DOTALL,
    ), "the desktop panels must be static grid bays, not drawers"


def test_layout_controls_live_inside_the_view_not_the_top_chrome():
    css = _base()
    blocks = re.findall(r"#layout-controls-float\s*\{([^}]*)\}", css, re.DOTALL)
    assert blocks, "#layout-controls-float rule missing"
    assert all(
        "position: fixed" not in b for b in blocks
    ), "controls must not be fixed in the top chrome band (the playlist bar owns it)"
    assert any(
        "position: absolute" in b and "top: 4px" in b for b in blocks
    ), "controls must sit at the top of the inset view window"


def test_timeline_ruler_fills_the_inset_view():
    css = _base()
    assert re.search(r'id="timeline-ruler"[^>]*height:100%', css), (
        "the timeline ruler should fill the inset view (the view is already "
        "bounded by the floor)"
    )
    assert "height:calc(100% - var(--chrome-bottom" not in css, (
        "the ruler must not re-subtract the floor now that #canvas-wrap is inset"
    )


def test_playlist_ui_bottom_is_published_and_the_view_refits():
    """The dynamic top wall: media_player publishes --playlist-ui-bottom; the
    view refit hook re-centres cy / the wheel after the inset lands."""
    mp = (TEMPLATES / "media_player.js").read_text(encoding="utf-8")
    assert "function _syncViewTopInset" in mp, "missing the inset publisher"
    assert "--playlist-ui-bottom" in mp, "media_player must publish the top wall"
    assert "refitViewWindow" in mp, "the editor resize must request a view refit"

    mob = (TEMPLATES / "mobile.js").read_text(encoding="utf-8")
    assert "window.refitViewWindow" in mob, "mobile.js must expose the refit hook"
    assert "_syncViewTopInset" in mob, (
        "_refitViews must re-publish the top wall before measuring"
    )


def test_refit_preserves_the_open_wheel_detail_panel():
    """ADR-176 regression: a panel re-fit must not clobber the open WDP.

    ``_refitViews`` used to call ``drawRagaWheel()`` directly, which rebuilds
    the SVG and clears the WDP. Clicking a raga/comp chip (»triggerBaniSearch»
    re-asserts the TRAIL drawer) therefore flashed the detail panel open then
    shut. The refit now goes through the wheel's state-preserving
    ``refitRagaWheel()``, and ``setPanelState`` only refits on a real drawer
    open/close.
    """
    mob = (TEMPLATES / "mobile.js").read_text(encoding="utf-8")
    assert "window.refitRagaWheel" in mob, (
        "_refitViews must redraw the wheel through refitRagaWheel"
    )
    assert "leftWasOpen" in mob and "rightWasOpen" in mob, (
        "setPanelState must gate the refit on an actual drawer open/close"
    )

    wheel = (TEMPLATES / "raga_wheel.js").read_text(encoding="utf-8")
    assert "window.refitRagaWheel = function" in wheel, (
        "the wheel must expose a state-preserving refit redraw"
    )
    # It re-applies the active subject through the canonical sync path so the
    # janya pre-selection and active composition are restored too.
    assert "syncRagaWheelToFilter(activeBaniFilter.type, activeBaniFilter.id)" in wheel
