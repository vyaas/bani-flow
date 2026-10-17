"""
test_queue_permalink.py — ADR-164 shareable queue & playlist permalinks.

Two layers:

1. Behavioural — drives carnatic/tests/js/queue_permalink_behaviour.js through
   node, one scenario per test so the failure message tells the story. The
   runner extracts the real units (encodePermalink, MediaQueue, the permalink
   reader) from the shipped templates, so these tests fail when the shipped
   code changes semantics — not when a Python mirror drifts. Skipped when node
   is unavailable, so the suite still runs on a bare checkout.

2. Presence — the q-block wiring must exist in the rendered graph.html
   (the codec is embedded, not imported).

ADR-164 test obligations (from the ADR's Implementation §5):
   share-from-queue round-trips the sequence + cursor; the persistent form
   survives playlist edits by id; an oversized ephemeral queue truncates with
   a surfaced notice; old permalinks (no q) still resolve.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
RUNNER = PROJECT_ROOT / "carnatic" / "tests" / "js" / "queue_permalink_behaviour.js"
GRAPH_HTML = PROJECT_ROOT / "carnatic" / "graph.html"

NODE = shutil.which("node")

SCENARIOS = [
    # ADR-164 §5: share-from-queue round-trips the sequence + cursor.
    "persistent-roundtrip",
    "inline-roundtrip",
    # ADR-164 §5: the persistent form survives playlist edits by id.
    "persistent-survives-playlist-edit",
    # ADR-164 §5: oversized ephemeral queue truncates with a surfaced notice.
    "truncation-windows-and-notices",
    # A mutated queue no longer IS the playlist — it must inline, never claim.
    "queue-edit-drops-playlist-reference",
    # ADR-164 D3: degrade cleanly on a missing playlist id.
    "missing-playlist-degrades-to-single-item",
    # ADR-164 §5: old permalinks (no q) still resolve.
    "old-link-without-q-resolves",
    # The reader's dual transport: q decodes from #s= as well as #z=.
    "q-rides-legacy-s-transport-too",
    # Single-item shares are untouched by the feature.
    "single-item-share-emits-no-q",
]


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("scenario", SCENARIOS)
def test_queue_permalink_scenario(scenario: str) -> None:
    assert RUNNER.exists(), f"missing JS runner: {RUNNER}"
    proc = subprocess.run(
        [NODE, str(RUNNER), scenario],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    output = proc.stdout + proc.stderr
    assert proc.returncode == 0, f"ADR-164 scenario '{scenario}' failed:\n{output}"


class TestQueuePermalinkInRenderedOutput:
    """The q-block wiring must be embedded in graph.html (codec is inlined)."""

    @pytest.fixture(autouse=True, scope="class")
    def rendered_html(self, request):
        if not GRAPH_HTML.exists():
            pytest.skip("graph.html not rendered; run bani-render first")
        request.cls._html = GRAPH_HTML.read_text(encoding="utf-8")

    _html: str = ""

    def test_cap_constant_present(self):
        assert "QUEUE_PERMALINK_CAP" in self._html

    def test_queue_item_encoder_present(self):
        assert "_encodeQueueItemForPermalink" in self._html

    def test_playlist_identity_present(self):
        """MediaQueue.playlistId — the share-by-reference provenance claim."""
        assert "playlistId" in self._html

    def test_pending_seek_present(self):
        """The one-shot mid-item seek the reader passes via seekSeconds."""
        assert "_pendingSeek" in self._html
        assert "seekSeconds" in self._html

    def test_reader_q_block_present(self):
        assert "state.q" in self._html

    def test_truncation_notice_present(self):
        assert "queue truncated to" in self._html

    def test_q_rides_v2_no_version_bump(self):
        """ADR-164 D1: q extends v:2 as an optional field — the reader must
        still accept exactly v ∈ {1, 2} (a v:3 would break old readers'
        graceful degradation)."""
        assert "state.v !== 1 && state.v !== 2" in self._html
