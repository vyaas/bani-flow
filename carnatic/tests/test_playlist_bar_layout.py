"""
test_playlist_bar_layout.py — regression guard for the ADR-175 Playlist Bar
look-and-feel.

Pins three layout contracts that a previous revision got wrong:

1. The bar stretches gas-like between the floating view selector and help
   button (`left`/`right` anchors) — it is not a centred fixed-width pill.
2. On desktop the bar is clamped to the canvas column whenever a sidebar is
   open, so the bar (and the editor / docked player that inherit its width)
   never occlude the bani-flow or musician panel.
3. `#pb-summary` scrolls horizontally with a thin scrollbar when its chips
   overflow, and the chips keep their natural width (no squashing).

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
