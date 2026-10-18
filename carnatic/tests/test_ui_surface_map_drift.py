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
        'id="left-panel-toggle"', 'id="left-sidebar"',
        # §2 musician panel
        'id="right-sidebar"', 'id="musician-panel"', 'id="recordings-panel"',
        'id="recordings-list"', 'id="edge-info"', 'id="node-info"',
        'id="rec-filter"', 'id="lineage-popup"', 'id="right-panel-toggle"',
        # §3 guru-shishya view
        'id="cy"', 'id="cy-labels"', 'id="timeline-ruler"',
        # §4 mela-janya view
        'id="raga-wheel"', 'id="wheel-detail-panel"',
        # §5 media player
        'id="mp-copy-toast"',
        # §5 media player — ADR-175 persistent Playlist Bar
        'id="playlist-bar"', 'id="pb-summary"', 'id="pb-editor-toggle"',
        'id="pb-prev"', 'id="pb-next"', 'id="pb-play"', 'id="pb-stop"',
        'id="pb-copy"', 'id="pb-share"', 'id="pb-watch"',
    ],
    "bani_flow.js": [
        # §1
        "function applyBaniFilter", "function clearBaniFilter",
        "function triggerBaniSearch", "function buildListeningTrail",
        "function buildTrailItem", "window.getBaniTrail",
        "function _renderBaniFlowPlaylists", "function _renderBaniFlowLecdemStrip",
        "activeBaniFilter",
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
        "window._closeWheelDetailPanel",
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
        "function _addQueueUI",
        # §5 — ADR-175 persistent Playlist Bar
        "function _initPlaylistBar", "function _renderPlaylistBar",
        "function _pbPlayPauseCurrent", "function _pbExpandPlayer",
        "function _pbStopCurrent",
        "function _dockPlayer", "function _snapPlayerIfNearBar",
        "function _playlistUiRect", "function _avoidUIOverlap",
        "function _uiObstacleRects", "function _resolveNonOverlap",
        "function _clampPlayerWidthToColumn", "function _repositionPlayers",
        "function _syncViewTopInset",
        "function _syncPlayerControls",
        "function _toggleCurrentPlayerCollapse", "function _isCurrentPlayerCollapsed",
        "function _pbCopyLink", "function _pbShareLink", "function _pbWatchOnYouTube",
        "function _pbCurrentTarget",
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
    "panel_components.js": [
        # §6.5 — shared panel/chip constructors (ADR-128)
        "function buildPanelHeader", "function buildSection",
        "function buildSubjectGroup", "function buildRowAccordion",
        "function tagUntaggedChips", "function applyChipRole",
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
