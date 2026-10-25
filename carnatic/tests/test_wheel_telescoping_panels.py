"""
test_wheel_telescoping_panels.py — ADR-192/193 regression guard.

The mela-janya view is a three-card telescoping chain:

* ``#wheel-detail-panel`` (the raga panel) shows the mela chip and its janya
  chips only — it must never render composition chips itself.
* ``#wheel-comp-panel`` (the composition branch card) shows the selected raga's
  compositions as composition+composer pair rows, pinned just outside the raga
  panel's outward edge by ``_positionCompPanel``.
* ``#wheel-rec-panel`` (the recordings leaf card, ADR-193) shows the recordings
  of the selected pair row, pinned outside the composition card by
  ``_positionRecPanel``.

Failure here means the telescoping split drifted — e.g. compositions were
pre-rendered back into the raga panel, the composition rows lost their
composer, or the leaf is no longer opened by a pair row. Update raga_wheel.js /
base.html (and UIMAP.md §4) in the same commit.
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
    assert 'id="wheel-rec-panel"' in html
    # Same surface: all three cards are styled together.
    assert "#wheel-detail-panel, #wheel-comp-panel, #wheel-rec-panel" in html


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
    assert "_wdpRenderCompRows(body" in body, "child panel must render the raga's compositions"
    assert "_positionCompPanel()" in body, "child panel must anchor to the clicked chip"
    assert "_closeWheelRecPanel()" in body, "a new raga must clear the stale leaf"

    pos = _fn(src, "_positionCompPanel")
    assert "wheel-comp-panel" in pos
    assert "_WDP_COMP_GAP" in pos, "child must keep the telescoping gap from the parent"
    assert "wdp-selected" in pos, (
        "child must align to the selected raga chip, not the panel's outer corner"
    )
    assert "getBoundingClientRect" in pos, "child must track the chip's on-screen row"


def test_composition_rows_pair_composer_and_open_recordings():
    src = _wheel_src()
    rows = _fn(src, "_wdpRenderCompRows")
    assert "buildComposerChip" in rows, "composition row must carry its composer chip"
    assert "wdp-comp-row" in rows and "comp-chip" in rows, (
        "composition+composer must render as a side-by-side pair row of real chips"
    )
    assert "_wdpToggleCompItem" in rows, "clicking a pair row must open its recordings leaf"

    toggle = _fn(src, "_wdpToggleCompItem")
    assert "_openRecPanel" in toggle
    leaf = _fn(src, "_openRecPanel")
    assert "buildRecordingsTrail" in leaf, (
        "leaf must re-represent the bani-flow recordings trail, not reimplement rows"
    )
    assert "wheel-rec-panel" in leaf
    assert "matchMedia('(max-width: 768px)')" in leaf, "recordings leaf is desktop-only"
    assert "Open in Bani Flow" not in leaf, "the leaf must not advertise a separate Bani-flow escape hatch"


def test_recordings_leaf_reuses_the_bani_flow_trail():
    bani = (TEMPLATES / "bani_flow.js").read_text(encoding="utf-8")
    assert "function _collectTrailRows(" in bani, "the row pipeline must be extracted from buildListeningTrail"
    assert "function buildRecordingsTrail(" in bani, "bani-flow must expose a detached recordings tree"
    assert "window.buildRecordingsTrail" in bani
    assert "_collectTrailRows(type, id, matchedNodeIds)" in bani, (
        "buildListeningTrail must keep using the shared pipeline"
    )
    assert "ul.className = 'trail-list'" in bani, (
        "the leaf tree must adopt the shared .trail-list styling"
    )


def test_rows_own_the_horizontal_scroll_not_the_panels():
    html = BASE.read_text(encoding="utf-8")
    # The pair row is the scroll surface; its chips are intrinsic-size peers.
    assert ".wdp-comp-row > .comp-chip," in html
    assert ".wdp-comp-row > .composer-chip" in html
    assert "flex: 0 0 auto;" in html
    # Panel bodies never grow a horizontal scrollbar — the rows do.
    assert "overflow-y: auto; overflow-x: hidden;" in html, (
        "the detail-panel body must not scroll horizontally"
    )
    # The leaf reuses the ADR-180 ribbon rules (scroll surface + pinned acts).
    assert ":is(#left-sidebar, #right-sidebar, #wheel-rec-panel) .row-accordion-scroll" in html, (
        "the leaf must share the sidebar per-row scroll/pinned-acts rules"
    )
    assert "#wheel-rec-panel .wdp-body > .trail-list" in html


def test_recordings_leaf_pins_beside_the_composition_card():
    pos = _fn(_wheel_src(), "_positionRecPanel")
    assert "wheel-rec-panel" in pos
    assert "wheel-comp-panel" in pos
    assert "_WDP_REC_GAP" in pos, "leaf must keep the telescoping gap from the comp card"
    assert "wdp-comp-row" in pos and "wdp-active" in pos, (
        "leaf must align to the selected pair row"
    )
    assert "getBoundingClientRect" in pos, "leaf must track the selected row's on-screen position"


def test_closing_the_raga_panel_closes_the_child():
    body = _fn(_wheel_src(), "_closeWheelDetailPanel")
    assert "_closeWheelCompPanel()" in body


def test_closing_the_composition_card_closes_the_leaf():
    body = _fn(_wheel_src(), "_closeWheelCompPanel")
    assert "_closeWheelRecPanel()" in body


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
