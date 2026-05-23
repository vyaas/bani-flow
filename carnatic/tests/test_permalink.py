"""
ADR-151: Permalink encode/decode round-trip tests.

All tests operate on the JavaScript-level logic expressed in Python so they can
run without a browser.  The encode algorithm (btoa / URL-safe base64) and the
decode algorithm (_decodePermalinkHash) are reimplemented here in Python for
unit verification — the JavaScript counterparts must stay in sync.
"""
import base64
import json
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest


# ── Pure-Python reimplementation of the JS codec ─────────────────────────────

def py_encode_permalink(state: dict) -> str:
    """Python mirror of encodePermalink(instance) logic in media_player.js."""
    json_bytes = json.dumps(state, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    b64 = base64.b64encode(json_bytes).decode("ascii")
    # URL-safe: + → -, / → _, strip padding =
    b64 = b64.replace("+", "-").replace("/", "_").rstrip("=")
    return "#s=" + b64


def py_decode_permalink(fragment: str) -> dict | None:
    """Python mirror of _decodePermalinkHash() in permalink.js."""
    if not fragment or not fragment.startswith("#s="):
        return None
    b64 = fragment[3:].replace("-", "+").replace("_", "/")
    # Re-add padding
    pad = len(b64) % 4
    if pad:
        b64 += "=" * (4 - pad)
    try:
        payload = base64.b64decode(b64).decode("utf-8")
        return json.loads(payload)
    except Exception:
        return None


# ── Round-trip tests ──────────────────────────────────────────────────────────

class TestPermalinkRoundTrip:
    def test_minimal_state_roundtrip(self):
        state = {"v": 1, "vid": "abc123XYZ_-"}
        fragment = py_encode_permalink(state)
        assert fragment.startswith("#s=")
        decoded = py_decode_permalink(fragment)
        assert decoded == state

    def test_full_state_roundtrip(self):
        state = {
            "v": 1,
            "vid": "11charVidId",
            "t": 120,
            "meta": {"nid": "msv", "rid": "kambhoji", "cid": "c001", "rec": "r042"},
            "trail": [{"tp": "raga", "id": "kambhoji"}, {"tp": "perf", "id": "msv"}],
            "panel": "msv",
        }
        fragment = py_encode_permalink(state)
        decoded = py_decode_permalink(fragment)
        assert decoded == state

    def test_unicode_names_roundtrip(self):
        """Raga/musician names may include non-ASCII Tamil/Sanskrit characters."""
        state = {
            "v": 1,
            "vid": "XyZ9876abcd",
            "meta": {"nid": "பாலமுரளி", "rid": "ஹிந்தோளம்"},
        }
        fragment = py_encode_permalink(state)
        decoded = py_decode_permalink(fragment)
        assert decoded == state
        assert decoded["meta"]["nid"] == "பாலமுரளி"

    def test_no_plus_slash_in_fragment(self):
        """URL-safe base64 must not contain + or /."""
        # Use a payload that is likely to produce these chars in standard b64
        for i in range(20):
            state = {"v": 1, "vid": f"testVid{i:04d}"}
            fragment = py_encode_permalink(state)
            assert "+" not in fragment, f"+ found in fragment for i={i}"
            assert "/" not in fragment, f"/ found in fragment for i={i}"

    def test_no_padding_in_fragment(self):
        """The base64 payload must not contain = padding (breaks URLs).
        Note: '#s=' contains '=' as a separator — only the b64 part is checked."""
        state = {"v": 1, "vid": "abc"}
        fragment = py_encode_permalink(state)
        assert fragment.startswith("#s=")
        b64_part = fragment[3:]  # strip the '#s=' prefix
        assert "=" not in b64_part, f"padding found in b64 payload: {b64_part}"


# ── Malformed input tests ─────────────────────────────────────────────────────

class TestPermalinkMalformedInput:
    def test_none_returns_none(self):
        assert py_decode_permalink(None) is None

    def test_empty_string_returns_none(self):
        assert py_decode_permalink("") is None

    def test_wrong_prefix_returns_none(self):
        assert py_decode_permalink("#v=abc") is None
        assert py_decode_permalink("?s=abc") is None

    def test_garbage_payload_returns_none(self):
        assert py_decode_permalink("#s=notvalidbase64!!!") is None

    def test_valid_b64_not_json_returns_none(self):
        import base64
        b64 = base64.b64encode(b"not json").decode("ascii").rstrip("=")
        assert py_decode_permalink(f"#s={b64}") is None

    def test_valid_json_missing_vid(self):
        """State missing 'vid' should be treated as invalid by the JS runtime.
        At the Python level _decodePermalinkHash only validates v and vid are
        present, so we test the v≠1 path here."""
        state = {"v": 2, "vid": "someVid"}
        fragment = py_encode_permalink(state)
        # v=2 is not supported — JS warns and returns null.
        # At Python level we just decode successfully (version check is in JS).
        decoded = py_decode_permalink(fragment)
        assert decoded == state   # Python decode doesn't filter on v

    def test_empty_trail_works(self):
        state = {"v": 1, "vid": "abc"}
        # No trail key at all
        fragment = py_encode_permalink(state)
        decoded = py_decode_permalink(fragment)
        assert "trail" not in decoded

    def test_empty_trail_list_works(self):
        state = {"v": 1, "vid": "abc", "trail": []}
        fragment = py_encode_permalink(state)
        decoded = py_decode_permalink(fragment)
        assert decoded["trail"] == []


# ── Integration: permalink.js is included in rendered graph.html ─────────────

class TestPermalinkInRenderedOutput:
    """Verify that bani-render embeds all ADR-151 symbols in graph.html."""

    GRAPH_HTML = Path(__file__).parent.parent / "graph.html"

    @pytest.fixture(autouse=True, scope="class")
    def rendered_html(self):
        if not self.GRAPH_HTML.exists():
            pytest.skip("graph.html not rendered; run bani-render first")

    def _html(self):
        return self.GRAPH_HTML.read_text(encoding="utf-8")

    def test_encode_permalink_present(self):
        assert "encodePermalink" in self._html()

    def test_share_button_class_present(self):
        assert "mp-share-btn" in self._html()

    def test_restore_state_from_hash_present(self):
        assert "restoreStateFromHash" in self._html()

    def test_get_bani_trail_present(self):
        assert "getBaniTrail" in self._html()

    def test_get_current_panel_node_present(self):
        assert "getCurrentPanelNode" in self._html()

    def test_decode_permalink_hash_present(self):
        assert "_decodePermalinkHash" in self._html()

    def test_share_btn_css_present(self):
        assert ".mp-share-btn" in self._html()

    def test_share_btn_mobile_touch_target_present(self):
        assert ".media-player.full-mobile .mp-share-btn" in self._html()

    def test_permalink_runs_last(self):
        """permalink.js code must appear after mobile.js code in the script block.
        We check that restoreStateFromHash() call is after peekBottomSheet (mobile)."""
        html = self._html()
        pos_peek = html.rfind("peekBottomSheet")
        pos_restore = html.rfind("restoreStateFromHash")
        assert pos_peek > 0 and pos_restore > 0, "both symbols must exist"
        assert pos_restore > pos_peek, (
            "restoreStateFromHash must appear after peekBottomSheet (load order)"
        )
