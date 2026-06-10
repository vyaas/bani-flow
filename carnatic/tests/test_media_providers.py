"""Tests for the source-agnostic media provider registry (ADR-154).

Covers the parse table (one row per provider, plus malformed/unmatched),
start-offset extraction, the media_key scheme, and the yt_video_id back-compat
shim that existing callers depend on.
"""
import pytest

from carnatic.render.data_loaders import yt_video_id
from carnatic.render.media_providers import media_key, parse_media_url


@pytest.mark.parametrize(
    "url, provider, provider_id, start, controllable",
    [
        # YouTube — every URL form the old regex accepted, plus shorts + offsets
        ("https://youtu.be/_rj8fHJiSLA", "youtube", "_rj8fHJiSLA", 0, True),
        ("https://www.youtube.com/watch?v=_rj8fHJiSLA", "youtube", "_rj8fHJiSLA", 0, True),
        ("https://www.youtube.com/embed/_rj8fHJiSLA", "youtube", "_rj8fHJiSLA", 0, True),
        ("https://www.youtube.com/watch?v=_rj8fHJiSLA&t=90", "youtube", "_rj8fHJiSLA", 90, True),
        ("https://youtu.be/_rj8fHJiSLA?t=1h2m3s", "youtube", "_rj8fHJiSLA", 3723, True),
        ("https://www.youtube.com/shorts/_rj8fHJiSLA", "youtube", "_rj8fHJiSLA", 0, True),
        # Vimeo
        ("https://vimeo.com/824804225", "vimeo", "824804225", 0, True),
        ("https://player.vimeo.com/video/824804225", "vimeo", "824804225", 0, True),
        # SoundCloud — uncontrollable; path is the stable id
        ("https://soundcloud.com/user/track-name", "soundcloud", "user/track-name", 0, False),
        # Google Drive — both URL forms; uncontrollable
        ("https://drive.google.com/file/d/1AbC_dEf-123/view", "gdrive", "1AbC_dEf-123", 0, False),
        ("https://drive.google.com/open?id=1AbC_dEf-123", "gdrive", "1AbC_dEf-123", 0, False),
        # Direct files
        ("https://example.org/rec/concert.mp3", "audio", "https://example.org/rec/concert.mp3", 0, True),
        ("https://example.org/rec/concert.mp3#t=1m30s", "audio", "https://example.org/rec/concert.mp3#t=1m30s", 90, True),
        ("https://example.org/rec/clip.mp4", "video", "https://example.org/rec/clip.mp4", 0, True),
    ],
)
def test_parse_table(url, provider, provider_id, start, controllable):
    ref = parse_media_url(url)
    assert ref is not None, f"expected a MediaRef for {url!r}"
    assert ref["provider"] == provider
    assert ref["provider_id"] == provider_id
    assert ref["start"] == start
    assert ref["controllable"] is controllable
    assert ref["url"] == url


@pytest.mark.parametrize("url", ["", None, "https://en.wikipedia.org/wiki/Foo", "not a url", "https://example.org/page.html"])
def test_unmatched_returns_none(url):
    """Unmatched URLs return None (caller logs them) — never silently coerced."""
    assert parse_media_url(url) is None


def test_media_key_scheme():
    assert media_key(parse_media_url("https://youtu.be/_rj8fHJiSLA")) == "youtube:_rj8fHJiSLA"
    assert media_key(parse_media_url("https://vimeo.com/824804225")) == "vimeo:824804225"
    assert media_key(None) is None
    assert media_key({"provider": "youtube"}) is None  # missing provider_id


def test_yt_video_id_backcompat():
    """The shim returns the id only for YouTube urls; others stay None as before."""
    assert yt_video_id("https://youtu.be/_rj8fHJiSLA") == "_rj8fHJiSLA"
    assert yt_video_id("https://www.youtube.com/watch?v=_rj8fHJiSLA&t=90") == "_rj8fHJiSLA"
    assert yt_video_id("https://vimeo.com/824804225") is None
    assert yt_video_id("https://soundcloud.com/user/track") is None
    assert yt_video_id("") is None
