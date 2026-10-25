"""
test_wheel_telescoping_panels.py — ADR-192 regression guard.

The mela-janya view is a two-panel telescoping chain:

* ``#wheel-detail-panel`` (the raga panel) shows the mela chip and its janya
  chips only — it must never render composition chips itself.
* ``#wheel-comp-panel`` (the child panel) shows the compositions of whichever
  raga chip was clicked, and is pinned just outside the raga panel's outward
  edge by ``_positionCompPanel``.

Failure here means the shallow/child split drifted — e.g. compositions were
pre-rendered back into the raga panel, or the child panel is no longer opened
by a raga chip. Update raga_wheel.js / base.html (and UIMAP.md §4) in the same
commit.
"""
from __future__ import annotations

from pathlib import Path

TEMPLATES = Path(__file__).parent.parent.parent / "carnatic" / "render" / "templates"
BASE = TEMPLATES / "base.html"
WHEEL = TEMPLATES / "raga_wheel.js"


def _wheel_src() -> str:
    return WHEEL.read_text(encoding="utf-8")


def _fn(src: str, name: str) -> str:
    """Return the source of a top-level ``function name`` up to the next one."""
    marker = f"function {name}("
    a = src.index(marker)
    b = src.find("\nfunction ", a + 1)
    if b == -1:
        b = len(src)
    return src[a:b]


def test_child_panel_is_a_sibling_in_the_markup():
    html = BASE.read_text(encoding="utf-8")
    assert 'id="wheel-detail-panel"' in html
    assert 'id="wheel-comp-panel"' in html
    # Same surface: both ids are styled together.
    assert "#wheel-detail-panel, #wheel-comp-panel" in html


def test_raga_panel_lists_janyas_but_never_compositions():
    body = _fn(_wheel_src(), "_openWheelDetailPanel")
    assert "wdp-janya-list" in body, "raga panel lost its janya list"
    assert "_wdpRenderComps" not in body, (
        "raga panel must not render compositions — that is the child panel's job"
    )
    assert "wdp-comp-group" not in body, "raga panel must not pre-render comp groups"


def test_raga_chip_opens_the_child_panel():
    body = _fn(_wheel_src(), "_wdpSelectJanya")
    assert "_openCompPanel(janya" in body, "a raga chip must open the child panel"
    assert "_closeWheelCompPanel()" in body, "clicking the selected chip must close the child"


def test_child_panel_renders_comps_and_pins_beside_the_clicked_chip():
    src = _wheel_src()
    body = _fn(src, "_openCompPanel")
    assert "_wdpRenderComps(body" in body, "child panel must render the raga's compositions"
    assert "_positionCompPanel()" in body, "child panel must anchor to the clicked chip"

    pos = _fn(src, "_positionCompPanel")
    assert "wheel-comp-panel" in pos
    assert "_WDP_COMP_GAP" in pos, "child must keep the telescoping gap from the parent"
    assert "wdp-selected" in pos, (
        "child must align to the selected raga chip, not the panel's outer corner"
    )
    assert "getBoundingClientRect" in pos, "child must track the chip's on-screen row"


def test_closing_the_raga_panel_closes_the_child():
    body = _fn(_wheel_src(), "_closeWheelDetailPanel")
    assert "_closeWheelCompPanel()" in body


def test_composition_child_is_desktop_only():
    body = _fn(_wheel_src(), "_openCompPanel")
    assert "matchMedia('(max-width: 768px)')" in body, (
        "composition card must be suppressed on mobile — the bani-flow panel replaces it"
    )


def test_child_follows_the_list_scroll():
    body = _fn(_wheel_src(), "_openWheelDetailPanel")
    assert "wdpBody.addEventListener('scroll'" in body or 'wdpBody.addEventListener("scroll"' in body, (
        "the child must re-anchor to its chip while the raga list scrolls"
    )

def test_sync_opens_the_child_for_the_resolved_raga():
    src = _wheel_src()
    a = src.index("window._triggerMelaExpand = function")
    b = src.index("\n  };", a)  # the assignment ends with an indented '};'
    body = src[a:b]
    assert "_wdpSelectJanya(targetRaga" in body, (
        "sync/permalink must open the child for the resolved raga/comp"
    )
