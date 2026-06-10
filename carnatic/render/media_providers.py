"""
carnatic/render/media_providers.py — Source-agnostic media provider registry (ADR-154).

Single source of truth for turning a stored media `url` string into a derived
`MediaRef`:

    { "provider": str, "provider_id": str, "url": str, "start": int, "controllable": bool }

Each provider owns a `match(url)` predicate and a `parse(url)` strategy. Adding a
new provider = appending one entry to `PROVIDERS` (and mirroring it in
`templates/media_providers.js`). No other pipeline file should branch on URL shape.

`controllable` reflects whether the JS player layer (ADR-155, Plyr) can drive
playback through its API. YouTube/Vimeo/direct files are controllable; SoundCloud
and Google Drive are rendered via their native embed and are not (yet) controllable.

The JS mirror lives in `templates/media_providers.js`. Keep the two files in sync.
"""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

# ── start-offset parsing ──────────────────────────────────────────────────────
# YouTube accepts ?t=, &start=, and #t= in seconds or 1h2m3s form.
_T_HMS = re.compile(r"^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$")


def _parse_start(url: str) -> int:
    """Extract a start offset in whole seconds from a media URL, or 0."""
    parsed = urlparse(url)
    q = parse_qs(parsed.query)
    raw = None
    for key in ("t", "start"):
        if key in q and q[key]:
            raw = q[key][0]
            break
    if raw is None and parsed.fragment.startswith("t="):
        raw = parsed.fragment[2:]
    if not raw:
        return 0
    if raw.isdigit():
        return int(raw)
    m = _T_HMS.match(raw)
    if m and any(m.groups()):
        h, mn, s = (int(g) if g else 0 for g in m.groups())
        return h * 3600 + mn * 60 + s
    return 0


# ── per-provider parse strategies ─────────────────────────────────────────────
# Each returns a (provider_id) string or None. The registry wraps them into a
# full MediaRef so individual providers stay tiny and declarative.

_YT_ID = re.compile(r"(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})")
_VIMEO_ID = re.compile(r"vimeo\.com/(?:video/)?(\d+)")
_GDRIVE_ID = re.compile(r"/file/d/([A-Za-z0-9_-]+)|[?&]id=([A-Za-z0-9_-]+)")

_AUDIO_EXT = (".mp3", ".m4a", ".wav", ".ogg", ".oga", ".flac", ".aac")
_VIDEO_EXT = (".mp4", ".webm", ".ogv", ".mov", ".m4v")


def _yt(url: str):
    m = _YT_ID.search(url)
    return m.group(1) if m else None


def _vimeo(url: str):
    m = _VIMEO_ID.search(url)
    return m.group(1) if m else None


def _soundcloud(url: str):
    if "soundcloud.com/" not in url:
        return None
    # SoundCloud has no short numeric id in the public URL; the canonical path
    # (user/track) is the stable identifier.
    path = urlparse(url).path.strip("/")
    return path or None


def _gdrive(url: str):
    if "drive.google.com" not in url and "docs.google.com" not in url:
        return None
    m = _GDRIVE_ID.search(url)
    if not m:
        return None
    return m.group(1) or m.group(2)


def _file(url: str, exts: tuple[str, ...]):
    path = urlparse(url).path.lower()
    return url if path.endswith(exts) else None


# ── registry ──────────────────────────────────────────────────────────────────
# Order matters: first match wins. File providers are last (broadest).
PROVIDERS: tuple[dict, ...] = (
    {"provider": "youtube",    "controllable": True,  "extract": _yt},
    {"provider": "vimeo",      "controllable": True,  "extract": _vimeo},
    {"provider": "soundcloud", "controllable": False, "extract": _soundcloud},
    {"provider": "gdrive",     "controllable": False, "extract": _gdrive},
    {"provider": "audio",      "controllable": True,  "extract": lambda u: _file(u, _AUDIO_EXT)},
    {"provider": "video",      "controllable": True,  "extract": lambda u: _file(u, _VIDEO_EXT)},
)


def parse_media_url(url: str) -> "dict | None":
    """Turn a stored url into a MediaRef dict, or None if no provider matches.

    Replaces data_loaders.yt_video_id as the single URL→identity entry point.
    Callers should log a None return as an unmatched-url curation signal rather
    than silently dropping the media (cf. AUDIT-014 F-02).
    """
    if not url:
        return None
    for p in PROVIDERS:
        pid = p["extract"](url)
        if pid:
            return {
                "provider":     p["provider"],
                "provider_id":  pid,
                "url":          url,
                "start":        _parse_start(url),
                "controllable": p["controllable"],
            }
    return None


def media_key(ref: "dict | None") -> "str | None":
    """The provider-qualified key that replaces the bare YouTube `vid`.

    e.g. 'youtube:_rj8fHJiSLA', 'vimeo:824804225'. None for an unparseable ref.
    """
    if not ref or not ref.get("provider") or not ref.get("provider_id"):
        return None
    return f"{ref['provider']}:{ref['provider_id']}"
