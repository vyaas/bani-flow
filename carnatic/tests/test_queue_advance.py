"""
test_queue_advance.py — ADR-176 follow-up: the Current Playlist must always
know what is playing, and must move on compulsorily when it should.

Two layers:

1. Behavioural — drives carnatic/tests/js/queue_advance_behaviour.js through
   node against the SHIPPED media_player.js. The runner extracts the real
   MediaQueue, the boundary predicate and the active-segment helper, then drives
   them with a fake player registry. These fail when the shipped code changes
   semantics, not when a Python mirror drifts. Skipped when node is unavailable.

2. Presence — the new wiring must be embedded in the rendered graph.html.

Bugs this guards (reported against the ADR-175 playlist integration):
  • a queue of same-video concert tracks spawned a fresh player per advance and
    left the previous one playing — so playback "continued with the rest of the
    concert" instead of moving to the next playlist item;
  • the end boundary fired even on the LAST playlist item, deactivating the
    queue (bar went empty) while the video kept playing;
  • the playlist row + bar never updated to the concert chapter actually
    sounding.
"""
from __future__ import annotations

import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
RUNNER = PROJECT_ROOT / "carnatic" / "tests" / "js" / "queue_advance_behaviour.js"
GRAPH_HTML = PROJECT_ROOT / "carnatic" / "graph.html"

NODE = shutil.which("node")

SCENARIOS = [
    # Same source video (a concert) → one reused window, retargeted per track.
    "same-video-advance-retargets-one-window",
    # A genuinely different video still opens fresh and tears the old one down.
    "different-video-advance-opens-and-destroys",
    # The span boundary is compulsory only when another item follows.
    "boundary-compulsory-only-when-not-last",
    # No end_seconds? Derive the boundary from the item's own chapters.
    "boundary-derives-from-chapters-when-end-seconds-absent",
    # A last item that runs on publishes the sounding chapter for the row/bar.
    "continuing-item-publishes-active-chapter",
]


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("scenario", SCENARIOS)
def test_queue_advance_scenario(scenario: str) -> None:
    assert RUNNER.exists(), f"missing JS runner: {RUNNER}"
    proc = subprocess.run(
        [NODE, str(RUNNER), scenario],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    output = proc.stdout + proc.stderr
    assert proc.returncode == 0, f"queue-advance scenario '{scenario}' failed:\n{output}"


@lru_cache(maxsize=1)
def _html() -> str:
    if not GRAPH_HTML.exists():
        pytest.skip("graph.html not rendered; run bani-render first")
    return GRAPH_HTML.read_text(encoding="utf-8")


class TestQueueAdvanceInRenderedOutput:
    """The advance/retarget wiring must be embedded in graph.html."""

    def test_same_video_retarget_present(self):
        """Concert tracks share a media_key; the queue must retarget the window."""
        assert "_retarget" in _html()

    def test_boundary_predicate_present(self):
        """One shared predicate decides advance for desktop + mobile."""
        assert "_shouldAdvanceQueue" in _html()
        assert "_queueItemBoundary" in _html()

    def test_last_item_guard_present(self):
        """The predicate must refuse to advance on the last playlist item."""
        assert "MediaQueue.index >= MediaQueue.items.length - 1" in _html()

    def test_active_chapter_present(self):
        """The sounding-chapter override that keeps the row/bar truthful."""
        assert "activeChapter" in _html()

    def test_row_bar_consume_active_chapter(self):
        """Both the editor row and the bar summary read the override."""
        assert "_buildQueueRowChips(item, isCurrent ? MediaQueue.activeChapter : null)" in _html()
        assert "_buildQueueRowChips(item, MediaQueue.activeChapter)" in _html()
