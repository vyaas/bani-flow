"""
test_ui_surface_map_drift.py — ADR-174 drift-guard.

Asserts that the DOM ids, entry-point functions, and state globals claimed by
carnatic/render/UIMAP.md still exist in the templates (and Python modules)
they are attributed to.

Failure here means a symbol was renamed or removed in code while the map still
points at it. Fix: update UIMAP.md (and this test's table) in the same commit
as the code change, then re-run bani-render.
"""
from __future__ import annotations

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
TEMPLATES = PROJECT_ROOT / "carnatic" / "render" / "templates"
RENDER = PROJECT_ROOT / "carnatic" / "render"

# ── The claim table: file → symbols UIMAP.md attributes to it ────────────────
# Keep in lockstep with UIMAP.md sections §1–§6. One entry per load-bearing
# claim; comments note the UIMAP section each group serves.

CLAIMS: dict[str, list[str]] = {
    "base.html": [
        # §1 bani-flow panel
        'id="bani-flow-panel"', 'id="bani-scroll"', 'id="bani-sticky"',
        'id="bani-search-input"', 'id="bani-subject-popup"',
        'id="bani-add-btn"', 'id="panel-add-btn"',
        'id="left-panel-toggle"', 'id="left-sidebar"',
        # §2 musician panel
        'id="right-sidebar"', 'id="musician-panel"', 'id="recordings-panel"',
        'id="recordings-list"', 'id="edge-info"', 'id="node-info"',
        'id="rec-filter"', 'id="trail-filter"', 'id="lineage-popup"', 'id="right-panel-toggle"',
        # §3 guru-shishya view
        'id="cy"', 'id="cy-labels"', 'id="timeline-ruler"',
        # §4 mela-janya view
        'id="raga-wheel"', 'id="wheel-detail-panel"', 'id="wheel-comp-panel"',
        'id="wheel-rec-panel"',
        # §5 media player
        'id="mp-copy-toast"',
        # §5 media player — ADR-184 grand track search
        'id="search-bar"', 'id="track-search-input"', 'id="track-search-dropdown"',
        # §5 media player — ADR-175 persistent Playlist Bar
        'id="playlist-bar"', 'id="pb-summary"', 'id="pb-editor-toggle"',
        'id="pb-prev"', 'id="pb-next"', 'id="pb-play"', 'id="pb-stop"',
        'id="pb-copy"', 'id="pb-share"', 'id="pb-watch"', 'id="pb-volume"',
        # §5 media player — ADR-186 film-strip video toggle
        'id="pb-video-toggle"',
    ],
    "bani_flow.js": [
        # §1
        "function applyBaniFilter", "function clearBaniFilter",
        "function triggerBaniSearch", "function buildListeningTrail",
        "function buildTrailItem", "window.getBaniTrail",
        "function _renderBaniFlowPlaylists", "function _renderBaniFlowLecdemStrip",
        "activeBaniFilter",
        # §4 — ADR-193 shared row pipeline re-used by the recordings leaf
        "function _collectTrailRows", "function buildRecordingsTrail",
        "window.buildRecordingsTrail",
    ],
    "graph_view.js": [
        # §2 (header/selection half of the musician panel)
        "function selectNode", "function buildLineagePanel",
        "window.clearMusicianPanel", "function panelBack", "function panelForward",
        "window.getCurrentPanelNode", "function gurusOf", "function shishyasOf",
        "function _openMusicianPanelForTransit",
        # §3
        "cytoscape(", "function orientToNode", "function focusNode",
        "function applyTrinityTriangleLayout", "function relayout",
        "function buildFilterDropdowns", "function applyChipFilters",
        "function scheduleCyChipSync", "function applyZoomLabels",
        "function openMetaInspector",
    ],
    "timeline_view.js": [
        # §3
        "function applyTimelineLayout", "currentLayout",
    ],
    "raga_wheel.js": [
        # §4 — view switching lives here (not in graph_view.js)
        "function switchView", "function showRagaWheel", "function hideRagaWheel",
        "function vpToggleTimeline",
        # §4 — geometry core
        "function polar", "function sectorPath", "function solveRingLayout",
        "function _labelWithBg",
        # §4 — expansion chain + WDP
        "function _expandMela", "function _expandComps", "function _expandMusicians",
        "function _collapseAll", "function _openWheelDetailPanel",
        "window._closeWheelDetailPanel", "function _openCompPanel",
        "window._closeWheelCompPanel", "window._positionCompPanel",
        "function _wdpSelectJanya", "_wdpCompRaga",
        # §4 — ADR-193 composition pair rows + recordings leaf
        "function _wdpRenderCompRows", "function _openRecPanel",
        "window._closeWheelRecPanel", "window._positionRecPanel", "_wdpRecComp",
        "function _panChainIntoView",
        # §4 — light-up + sync
        "function _lightUpMelas", "window.lightUpSpine",
        "window.clearWheelLightUp", "function syncRagaWheelToFilter",
        "window.syncWheelFromBaniSubject", "function orientRagaWheel",
        "window.drawRagaWheel", "_wdpData", "currentView",
    ],
    "media_player.js": [
        # §5 — player lifecycle
        "function openOrFocusPlayer", "function createPlayer",
        "function mountPlayer", "function openPlayer", "function closePlayer",
        "function resolveMedia",
        # §5 — queue model + UI
        "const MediaQueue", "window.startMediaQueue", "window.registerQueueItem",
        "function collectQueueItems", "function buildQueuePanel",
        "function _renderQueuePanel", "function _refreshQueuePanels",
        # §5 — ADR-175 persistent Playlist Bar
        "function _initPlaylistBar", "function _renderPlaylistBar",
        "function _pbPlayPauseCurrent", "function _pbExpandPlayer",
        "function _pbStopCurrent",
        "function _dockPlayer", "function _snapPlayerIfNearBar",
        "function _playlistUiRect", "function _avoidUIOverlap",
        "function _uiObstacleRects", "function _resolveNonOverlap",
        "function _clampPlayerWidthToColumn", "function _repositionPlayers",
        "function _syncViewTopInset", "function _clampPlaylistEditorHeight",
        "function _syncPlayerControls",
        "function _pbSetPaused", "function _isCurrentPlaying",
        "function _pbCopyLink", "function _pbShareLink", "function _pbWatchOnYouTube",
        # §5 — ADR-186 film-strip video toggle
        "function _currentPlayerInst", "function _videoVisible",
        "function _toggleVideoVisibility",
        "function _copyMediaLink", "function _copyMediaPermalink", "function _openMediaOnYouTube",
        "function _syncNowPlayingOverlays",
        # §5 — ADR-194 bottom placard + vertical operator rail
        "function _buildPlayerOps", "function _syncPlayerOverlayInset",
        "function _pollPlayerOverlayInset", "mp-player-ops",
        # §5 — ADR-194 Plyr-language chrome icons (external play = Plyr sprite)
        "_ICON_PLAYER_MIN", "_ICON_PLAYER_CLOSE", "_ICON_PLAYER_WATCH",
        "plyr-logo-youtube",
        "function _pbCurrentTarget",
        "function _setPlayerVolume", "function _syncVolumeControls",
        "window._initPlaylistBar",
        # §5 — chrome
        "function buildPlayerBar", "function buildPlayerRail",
        "function updatePlayerRail", "function buildPlayerTrackList",
        # §5 — recordings body (musician panel split, §2)
        "function buildRecordingsList", "function buildRagaTree",
        "function buildConcertBracket",
        # §5 — mobile paths
        "function _openMobilePlayer", "window._collapseMobilePlayer",
        "function showMiniPlayer", "function hideMiniPlayer",
        # §5 — spawn/z state
        "function nextSpawnPosition", "function bringToFront",
        "function refreshPlayingIndicators",
    ],
    "media_providers.js": [
        # §5 — provider registry (ADR-154)
        "parseMediaUrl", "mediaKey", "embedSource",
    ],
    "search.js": [
        # §5 — ADR-184 grand track search (index over performances + youtube[])
        "function _getIndex", "function _entryFromPerf", "function _entryFromTrack",
        "getElementById('track-search-input')",
    ],
    "panel_components.js": [
        # §6.5 — shared panel/chip constructors (ADR-128)
        "function buildPanelHeader", "function buildSection",
        "function buildSubjectGroup", "function buildRowAccordion",
        "function tagUntaggedChips", "function applyChipRole",
        # §6.5 — unified panel content filter (ADR-178)
        "function applyPanelContentFilter", "CONTENT_FILTER_ZONES",
    ],
    "mobile.js": [
        # §6.4 — drawer state machine
        "function setPanelState", "function peekBottomSheet",
        "function dismissBottomSheet",
        # §6.4 — ADR-176 view-window refit hook
        "window.refitViewWindow",
    ],
}

PY_CLAIMS: dict[str, list[str]] = {
    # §6.3 — theme single source of truth (ADR-028)
    "theme.py": ["TOKENS", "def css_vars"],
    # §3 — canvas styling lives in Python
    "graph_builder.py": ["ERA_COLORS", "NODE_SIZES"],
    # §6.1 — load-order contract owner
    "html_generator.py": ["def render_html", "INJECT_SCRIPTS"],
}


def _missing(path: Path, symbols: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [s for s in symbols if s not in text]


@pytest.mark.parametrize("filename", sorted(CLAIMS))
def test_template_symbols_exist(filename: str) -> None:
    missing = _missing(TEMPLATES / filename, CLAIMS[filename])
    assert not missing, (
        f"{filename}: UIMAP.md claims these symbols but they are gone: "
        f"{missing}. Update carnatic/render/UIMAP.md + this test in the same "
        f"commit as the rename/removal (ADR-174)."
    )


@pytest.mark.parametrize("filename", sorted(PY_CLAIMS))
def test_python_symbols_exist(filename: str) -> None:
    missing = _missing(RENDER / filename, PY_CLAIMS[filename])
    assert not missing, (
        f"render/{filename}: UIMAP.md claims these symbols but they are gone: "
        f"{missing}. Update carnatic/render/UIMAP.md + this test in the same "
        f"commit as the rename/removal (ADR-174)."
    )


def test_uimap_exists_and_indexes_five_elements() -> None:
    uimap = RENDER / "UIMAP.md"
    assert uimap.exists(), "carnatic/render/UIMAP.md is missing (ADR-174)"
    text = uimap.read_text(encoding="utf-8")
    for heading in (
        "## 1. Bani-flow panel",
        "## 2. Musician panel",
        "## 3. Guru-shishya view",
        "## 4. Mela-janya view",
        "## 5. Media player",
    ):
        assert heading in text, f"UIMAP.md lost its section: {heading}"
