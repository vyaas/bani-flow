"""
test_scrollbar_affordance.py — ADR-180 guard for the thin hover scrollbar.

Pins the engine split that keeps the horizontal chip bars thin and on a uniform
pitch across panels:

* Chromium 121+ ignores ``::-webkit-scrollbar`` once ``scrollbar-color`` or
  ``scrollbar-width`` is set, and its "thin" standard bar is ~11px with the
  platform arrow buttons. The standard properties are therefore gated to
  Firefox via ``@supports not selector(::-webkit-scrollbar)`` and Chromium gets
  the 3px pseudo-element bar instead.
* ``::-webkit-scrollbar-button`` is suppressed globally, or the platform arrows
  inflate the bar regardless of the declared height.
* The standalone horizontal scrollers use ``overflow-x: scroll`` so a row that
  fits is exactly as tall as one that overflows — uniform spacing, with the bar
  appearing as a sliver at the bottom of the row.

Failure means the surface drifted; update UIMAP §6 in the same commit.
"""
from __future__ import annotations

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
BASE = PROJECT_ROOT / "carnatic" / "render" / "templates" / "base.html"


def _css() -> str:
    return BASE.read_text(encoding="utf-8")


def test_firefox_standard_scrollbar_properties_are_gated():
    css = _css()
    # The thin + transparent-until-hover declarations must live only in the
    # Firefox branch; if they leak into Chromium they disable the webkit bar.
    firefox = re.search(
        r"@supports not selector\(::-webkit-scrollbar\)\s*\{(.*?)\n  \}",
        css,
        re.DOTALL,
    )
    assert firefox, "missing the Firefox scrollbar branch"
    block = firefox.group(1)
    assert "scrollbar-width: thin" in block
    assert "scrollbar-color: transparent transparent" in block
    assert "scrollbar-color: var(--fg-muted) transparent" in block, (
        "the hover reveal must be part of the Firefox branch"
    )


def test_chromium_neutralizes_standard_scrollbar_properties():
    css = _css()
    chromium = re.search(
        r"@supports selector\(::-webkit-scrollbar\)\s*\{(.*?)\n  \}",
        css,
        re.DOTALL,
    )
    assert chromium, "missing the Chromium scrollbar reset"
    block = chromium.group(1)
    assert "scrollbar-width: auto !important" in block
    assert "scrollbar-color: auto !important" in block, (
        "Chromium must reset the standard properties or ::-webkit-scrollbar is ignored"
    )
    assert ".mp-now-playing { scrollbar-width: none !important; }" in block, (
        "the now-playing placard's intentional hide must survive the reset"
    )


def test_webkit_scrollbar_is_a_thin_sliver():
    css = _css()
    assert re.search(
        r"::-webkit-scrollbar-button\s*\{[^}]*display:\s*none", css, re.DOTALL
    ), "scrollbar buttons must be hidden or the platform arrows inflate the bar"
    assert re.search(
        r"::-webkit-scrollbar\s*\{[^}]*width:\s*3px;\s*height:\s*3px",
        css,
        re.DOTALL,
    ), "the panel scrollbar must be a 3px sliver"


def test_standalone_horizontal_scrollers_reserve_a_uniform_pitch():
    css = _css()
    for selector in (
        r"\.wdp-comp-row",
        r"\.mp-queue-chips",
        r"\.track-result-chips",
    ):
        block = re.search(selector + r"\s*\{([^}]*)\}", css, re.DOTALL)
        assert block, f"missing the {selector} rule"
        assert "overflow-x: scroll" in block.group(1), (
            f"{selector} must reserve the bar on every row for a uniform pitch"
        )
    editor = re.search(
        r"#hd-body \.playlist-editor \.mp-queue-chips\s*\{([^}]*)\}",
        css,
        re.DOTALL,
    )
    assert editor and "overflow-x: scroll" in editor.group(1), (
        "the modal editor chips must reserve the bar too"
    )
