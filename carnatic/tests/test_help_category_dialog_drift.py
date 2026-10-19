"""
test_help_category_dialog_drift.py — ADR-177 drift guards for category help.

ADR-177 retires the panel-wide help overlay (`togglePanelHelp`) in favour of
per-category `?` buttons on every section header, each opening a card in the
shared `#help-dialog`. These tests pin the wiring so a later refactor cannot
silently reinstate the giant help panel or orphan a `?` button.

Failure here means the templates drifted from the ADR. Update the code (and
UIMAP.md §6.6) in the same commit, then re-run `bani-render`.
"""
from __future__ import annotations

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
TEMPLATES = PROJECT_ROOT / "carnatic" / "render" / "templates"

BASE_HTML = TEMPLATES / "base.html"
PANEL_COMPONENTS_JS = TEMPLATES / "panel_components.js"
EMPTY_TUTORIALS_JS = TEMPLATES / "empty_tutorials.js"
BANI_FLOW_JS = TEMPLATES / "bani_flow.js"
MEDIA_PLAYER_JS = TEMPLATES / "media_player.js"


@pytest.fixture(scope="module")
def base_html() -> str:
    return BASE_HTML.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def panel_components_js() -> str:
    return PANEL_COMPONENTS_JS.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def empty_tutorials_js() -> str:
    return EMPTY_TUTORIALS_JS.read_text(encoding="utf-8")


# ── the shared dialog is the single help surface ───────────────────────────────


def test_dialog_exposes_open_and_close(base_html: str) -> None:
    assert "window.openHelpDialog" in base_html, (
        "base.html must expose window.openHelpDialog (ADR-177 card surface)"
    )
    assert "window.closeHelpDialog" in base_html, (
        "base.html must expose window.closeHelpDialog (ADR-177)"
    )
    assert 'id="hd-body"' in base_html and 'id="hd-title"' in base_html


def test_shared_close_handler_calls_card_restore(base_html: str) -> None:
    assert "_onHelpDialogClosed" in base_html, (
        "the dialog close handler must call window._onHelpDialogClosed so the "
        "borrowed category card returns to its deck slot (ADR-177)"
    )


# ── the retired overlay stays retired ──────────────────────────────────────────


@pytest.mark.parametrize(
    "needle",
    [
        "bani-reset-btn",
        "musician-reset-btn",
        "togglePanelHelp",
        "panel-help-active",
    ],
)
def test_retired_help_overlay_symbols_are_gone(
    base_html: str, empty_tutorials_js: str, needle: str
) -> None:
    assert needle not in base_html, f"{needle!r} was retired by ADR-177"
    assert needle not in empty_tutorials_js, f"{needle!r} was retired by ADR-177"


def test_no_enter_help_overlay_remains(empty_tutorials_js: str) -> None:
    assert "_enterHelp" not in empty_tutorials_js, (
        "the panel-wide help overlay (_enterHelp) was retired by ADR-177"
    )
    assert "dismissPanelHelp" not in empty_tutorials_js


# ── the new category help path exists end to end ───────────────────────────────


def test_build_section_renders_help_button(panel_components_js: str) -> None:
    assert "helpKind" in panel_components_js and "helpSlot" in panel_components_js
    assert "section-help-btn" in panel_components_js
    assert "window.openCategoryHelp" in panel_components_js, (
        "the .section-help-btn must relay to window.openCategoryHelp (ADR-177)"
    )


def test_open_category_help_moves_deck_section(empty_tutorials_js: str) -> None:
    assert "window.openCategoryHelp" in empty_tutorials_js
    assert ".pt-v5-section--" in empty_tutorials_js, (
        "openCategoryHelp must source the card from the tutorial deck section"
    )
    assert "window.openHelpDialog" in empty_tutorials_js
    assert "window._onHelpDialogClosed" in empty_tutorials_js


def test_every_category_call_site_passes_help_kind() -> None:
    bani = BANI_FLOW_JS.read_text(encoding="utf-8")
    media = MEDIA_PLAYER_JS.read_text(encoding="utf-8")
    # Bani Flow: lecdems, compositions, misc
    for kind in ("'lecdems'", "'compositions'", "'misc'"):
        assert f"helpKind: {kind}" in bani, (
            f"Bani Flow section missing helpKind {kind} (ADR-177)"
        )
    # Musician: lecdems, concerts, recordings, compositions_empty
    for kind in ("'lecdems'", "'concerts'", "'recordings'", "'compositions_empty'"):
        assert f"helpKind: {kind}" in media, (
            f"Musician panel section missing helpKind {kind} (ADR-177)"
        )
    assert "helpSlot: 'bani'" in bani
    assert "helpSlot: 'musician'" in media


# ── landing page: demo subjects, no overlay ────────────────────────────────────


def test_boot_loads_demo_subjects_without_overlay(empty_tutorials_js: str) -> None:
    # _bootHelloWorld still loads both demo subjects…
    assert "baniSubject" in empty_tutorials_js
    assert "muSubject" in empty_tutorials_js
    # …but no longer enters the retired overlay.
    assert "_enterHelp" not in empty_tutorials_js
