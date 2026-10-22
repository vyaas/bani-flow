"""
test_playlist_context_scoping.py — ADR-189 context-scoped playlist rows.

Two layers, mirroring test_queue_permalink.py:

1. Behavioural — drives carnatic/tests/js/playlist_context_behaviour.js through
   node, one scenario per test. The runner extracts the real units
   (_playlistItemsForContext, _playlistToQueueItems, _playlistEntries) from the
   shipped media_player.js, so these fail when the shipped code changes
   semantics, not when a Python mirror drifts. Skipped when node is unavailable.

2. Presence — the context plumbing, the ⓘ info dialog, and the visual contract
   (concert-title name, indented tracks, info button) must exist in the shipped
   templates / rendered graph.html.

Failure here means ADR-189 drifted; update the templates and UIMAP.md §1/§2/§5
in the same commit.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
TEMPLATES = PROJECT_ROOT / "carnatic" / "render" / "templates"
GRAPH_HTML = PROJECT_ROOT / "carnatic" / "graph.html"
RUNNER = PROJECT_ROOT / "carnatic" / "tests" / "js" / "playlist_context_behaviour.js"

NODE = shutil.which("node")

MEDIA_PLAYER = (TEMPLATES / "media_player.js").read_text(encoding="utf-8")
BANI_FLOW = (TEMPLATES / "bani_flow.js").read_text(encoding="utf-8")
BASE_HTML = (TEMPLATES / "base.html").read_text(encoding="utf-8")


SCENARIOS = [
    "raga-filters",
    "musician-filters",
    "comp-filters",
    "no-context-returns-all",
    "unknown-subject-returns-empty",
    "queue-items-follow-filter",
    "entries-keep-index-aligned",
]


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("scenario", SCENARIOS)
def test_playlist_context_scenario(scenario: str) -> None:
    assert RUNNER.exists(), f"missing JS runner: {RUNNER}"
    proc = subprocess.run(
        [NODE, str(RUNNER), scenario],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    output = proc.stdout + proc.stderr
    assert proc.returncode == 0, f"ADR-189 scenario '{scenario}' failed:\n{output}"


# ── 2. Presence: the context plumbing reaches both panels ────────────────────

def test_build_playlists_section_accepts_and_forwards_context():
    assert "function buildPlaylistsSection(playlistIds, context)" in MEDIA_PLAYER
    assert "buildPlaylistRow(pl, context)" in MEDIA_PLAYER


def test_bani_panel_scopes_to_its_subject():
    assert "buildPlaylistsSection(ids, { type: type, id: id })" in BANI_FLOW, (
        "the bani panel must scope playlist rows to the raga/composition subject"
    )


def test_musician_panel_scopes_to_its_node():
    assert "{ type: 'musician', id: nodeId }" in MEDIA_PLAYER, (
        "the musician panel must scope playlist rows to the selected node"
    )


def test_playlist_wrapper_is_no_longer_a_harvest_unit():
    # ADR-189 D1: the per-track .q-row registrations are the harvest units, so a
    # context-hidden track can never be reached by "play all visible".
    assert "registerQueueItem(wrap, () => queueItems)" not in MEDIA_PLAYER


# ── 3. Presence: the ⓘ info dialog and its play-all ─────────────────────────

def test_info_button_opens_the_full_playlist_dialog():
    assert "function _openPlaylistInfo(pl)" in MEDIA_PLAYER
    assert "window.openHelpDialog(pl.title || pl.id, card)" in MEDIA_PLAYER
    assert "playlist-info-playall" in MEDIA_PLAYER
    assert "mp-playlist-info-btn" in MEDIA_PLAYER


def test_context_subset_plays_inline_while_play_all_shares_by_reference():
    # The row's ▶ must NOT tag a context subset with playlistId (the cursor would
    # not align with the full playlist on restore); the info dialog's play-all must.
    assert "const playOpts = filtered ? {} : { playlistId: pl.id };" in MEDIA_PLAYER
    assert "startMediaQueue(queueItems, 0, { playlistId: pl.id })" in MEDIA_PLAYER


# ── 4. Presence: the visual contract (name / indent / info button) ──────────

def _css_rule(selector: str) -> str:
    match = re.search(re.escape(selector) + r"\s*\{(.*?)\}", BASE_HTML, re.DOTALL)
    assert match, f"CSS rule not found: {selector}"
    return match.group(1)


def test_playlist_name_reads_as_a_concert_title():
    block = _css_rule(".playlist-chip")
    assert "border:" not in block, "the playlist name must not be a bordered pill"
    assert "font-weight: bold" in block and "color: var(--fg-sub)" in block


def test_playlist_tracks_are_indented_under_the_name():
    block = _css_rule(".mp-playlist-track")
    assert "padding-left: var(--hier-indent-step" in block, (
        "a playlist's tracks must indent under its name (ADR-189 D4)"
    )


def test_info_button_and_dialog_are_styled():
    assert ".mp-playlist-info-btn" in BASE_HTML
    assert ".playlist-info-card" in BASE_HTML
    assert "playlist-info-playall" in MEDIA_PLAYER
    assert ".playlist-info-acts" in BASE_HTML


# ── 5. Presence: the shipped graph.html carries the new code ────────────────

@pytest.mark.skipif(not GRAPH_HTML.exists(), reason="graph.html not rendered")
def test_rendered_graph_contains_the_context_engine():
    html = GRAPH_HTML.read_text(encoding="utf-8")
    assert "function _playlistItemsForContext" in html
    assert "function _openPlaylistInfo" in html
    assert "mp-playlist-info-btn" in html
