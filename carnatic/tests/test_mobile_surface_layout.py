"""
test_mobile_surface_layout.py — regression guard for two mobile rendering bugs.

1. Panel withdrawal on the raga wheel. Tapping a wheel element opened a drawer
   (TRAIL/MUSICIAN) and a deferred view refit immediately closed it again: the
   refit ran ``syncRagaWheelToFilter`` -> ``_triggerMelaExpand``, which
   synthesized a mela click whose handler unconditionally called
   ``setPanelState('IDLE')`` on mobile. The handler must ignore programmatic
   sync clicks (``window._wheelPreviewNoPanel``).

2. The mobile chrome line. ADR-200: the search bar's bottom edge is the line
   shared by the Playlist Bar and both drawers (top: var(--chrome-top)); the
   mobile bar sits below the drawers (z-index 210 vs 220) so an open panel
   draws over it. The canvas alone is pushed clear of a live bar via
   --playlist-ui-bottom, so the view never runs under it.

Also pins a scope fix: ``switchView`` (defined outside the wheel IIFE) referenced
the IIFE-private ``_wdpData`` and threw a ReferenceError on raga-view entry.

Failure here means mobile layout/sync drifted; update base.html / mobile.js /
raga_wheel.js (and UIMAP.md §4/§5) in the same commit.
"""
from __future__ import annotations

import re
from pathlib import Path

TEMPLATES = (
    Path(__file__).parent.parent.parent
    / "carnatic" / "render" / "templates"
)
BASE = TEMPLATES / "base.html"
MOBILE = TEMPLATES / "mobile.js"
WHEEL = TEMPLATES / "raga_wheel.js"
EMPTY = TEMPLATES / "empty_tutorials.js"
BANI = TEMPLATES / "bani_flow.js"


def test_mobile_drawers_ride_the_search_bar_chrome_line():
    css = BASE.read_text(encoding="utf-8")
    for sel in ("#left-sidebar", "#right-sidebar"):
        blocks = re.findall(re.escape(sel) + r"\s*\{(.*?)\}", css, re.DOTALL)
        assert blocks, f"{sel} rule missing"
        mobile = [b for b in blocks if "top: var(--chrome-top)" in b]
        assert mobile, (
            f"{sel} must ride the mobile chrome line (top: var(--chrome-top))"
        )
        assert all("bottom: calc(56px" in b for b in mobile), (
            f"{sel} must still stop above the mobile tab bar"
        )


def test_mobile_chrome_line_is_the_search_bar_bottom():
    """ADR-200: --chrome-top is the search bar's bottom edge + gap, shared by
    the Playlist Bar and both drawers; the canvas alone clears a live bar."""
    css = BASE.read_text(encoding="utf-8")
    block = re.search(
        r"@media \(max-width: 768px\) \{\s*:root \{ --chrome-top: "
        r"calc\(52px \+ var\(--search-height, 32px\) \+ 8px\); \}",
        css,
    )
    assert block, (
        "mobile --chrome-top must be the search bar's bottom edge + gap, not a "
        "fixed band that also clears the ephemeral Playlist Bar"
    )
    # The bar and the drawers share that line; the bar drops below the drawers.
    assert re.search(
        r"#playlist-bar \{[^}]*top: var\(--chrome-top\);[^}]*z-index: 210;",
        css, re.DOTALL,
    ), "the mobile bar must ride the chrome line and sit below the drawers (220)"
    # The canvas still never runs under a live bar.
    assert re.search(
        r"#main \{[^}]*padding-top:\s*max\(var\(--chrome-top\),\s*"
        r"calc\(var\(--playlist-ui-bottom, 0px\) \+ 8px\)\)",
        css, re.DOTALL,
    ), "the mobile canvas must clear a live Playlist Bar via --playlist-ui-bottom"


def test_mela_click_ignores_programmatic_sync_when_dismissing_panels():
    js = WHEEL.read_text(encoding="utf-8")
    pattern = re.compile(
        r"if \(window\.matchMedia\('\(max-width: 768px\)'\)\.matches &&\s*"
        r"typeof window\.setPanelState === 'function' &&\s*"
        r"!window\._wheelPreviewNoPanel\) \{\s*"
        r"window\.setPanelState\('IDLE'\);",
        re.DOTALL,
    )
    assert pattern.search(js), (
        "the mela click's mobile panel dismissal must be gated on "
        "!window._wheelPreviewNoPanel so a programmatic _triggerMelaExpand "
        "(sync/refit) cannot withdraw the panel that just opened"
    )


def test_mobile_first_visit_lands_on_the_wheel_with_both_drawers_withdrawn():
    """First-visit hello-world boot must not draw a panel out on mobile.

    ``_bootHelloWorld`` populates the Reetigowla / Ramnad Krishnan demo
    subjects, but on mobile the page must land on the bare Mela-Janya wheel —
    both drawers withdrawn. The panel-open side effects are suppressed:
    ``triggerBaniSearch`` skips the TRAIL drawer when ``suppressPanelOpen`` is
    set, and ``selectNode`` is called with ``revealPanel: false``.
    """
    js = EMPTY.read_text(encoding="utf-8")
    assert "const isMobile = window.matchMedia('(max-width: 768px)').matches;" in js
    assert "{ suppressPanelOpen: isMobile }" in js, (
        "the boot's bani search must suppress the TRAIL drawer on mobile"
    )
    assert "selectNode(n, { revealPanel: !isMobile })" in js, (
        "the boot's musician select must not reveal the MUSICIAN drawer on mobile"
    )

    bani = BANI.read_text(encoding="utf-8")
    assert re.search(
        r"typeof window\.setPanelState === 'function' && !opts\.suppressPanelOpen",
        bani,
    ), "triggerBaniSearch must honour the suppressPanelOpen option"


def test_wheel_switchview_does_not_touch_iife_private_cache():
    js = WHEEL.read_text(encoding="utf-8")
    assert "if (!_wdpData) drawRagaWheel();" not in js, (
        "switchView is outside the wheel IIFE; _wdpData is not in scope there. "
        "Use the window._wdpDataReady flag"
    )
    assert "if (!window._wdpDataReady) drawRagaWheel();" in js
    assert "window._wdpDataReady = true;" in js


def test_opening_a_panel_no_longer_folds_the_playlist_editor():
    # ADR-195: the Playlist Editor is a modal above the drawers, so the ADR-175
    # mobile fold (which existed only for the full-width popdown) is retired.
    js = MOBILE.read_text(encoding="utf-8")
    assert "MediaQueue.setPanelOpen(false)" not in js, (
        "ADR-195 removed the mobile editor fold from setPanelState"
    )
