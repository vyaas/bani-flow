"""
test_mobile_surface_layout.py — regression guard for two mobile rendering bugs.

1. Panel withdrawal on the raga wheel. Tapping a wheel element opened a drawer
   (TRAIL/MUSICIAN) and a deferred view refit immediately closed it again: the
   refit ran ``syncRagaWheelToFilter`` -> ``_triggerMelaExpand``, which
   synthesized a mela click whose handler unconditionally called
   ``setPanelState('IDLE')`` on mobile. The handler must ignore programmatic
   sync clicks (``window._wheelPreviewNoPanel``).

2. The playlist bar occluded the panels. On mobile the bar is a full-width top
   band at z-index 750 over drawers at 220, and the drawers started at the
   viewport top. The drawers (and the canvas chrome gap) must start below the
   bar, and an open playlist editor must fold when a panel opens so the bar
   never draws over the panel column.

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


def test_mobile_drawers_start_below_the_playlist_bar():
    css = BASE.read_text(encoding="utf-8")
    for sel in ("#left-sidebar", "#right-sidebar"):
        blocks = re.findall(re.escape(sel) + r"\s*\{(.*?)\}", css, re.DOTALL)
        assert blocks, f"{sel} rule missing"
        mobile = [b for b in blocks if "top: var(--chrome-top)" in b]
        assert mobile, (
            f"{sel} must start below the playlist bar (top: var(--chrome-top)) "
            "so the bar never occludes the panel"
        )
        assert all("bottom: calc(56px" in b for b in mobile), (
            f"{sel} must still stop above the mobile tab bar"
        )


def test_mobile_chrome_top_clears_the_bar():
    css = BASE.read_text(encoding="utf-8")
    block = re.search(
        r"@media \(max-width: 768px\) \{\s*:root \{ --chrome-top: (\d+)px; \}",
        css,
    )
    assert block, "mobile --chrome-top override missing"
    # Bar: top 52px + 54px height = 106px bottom; chrome-top must clear it.
    assert int(block.group(1)) >= 112, (
        "mobile --chrome-top must clear the playlist bar's bottom (106px) so the "
        "canvas, wheel and panels never run under it"
    )


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
