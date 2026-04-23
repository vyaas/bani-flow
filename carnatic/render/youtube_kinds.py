"""
carnatic/render/youtube_kinds.py — YouTube entry kind vocabulary (ADR-077).

Single source of truth for valid `kind` values inside `youtube[]` entries,
used by:
  • musicians/<id>.json youtube[].kind  (ADR-077)

The JS mirror lives in `templates/youtube_kinds.js`. Keep the two files in sync.

The default kind (field absent) is treated as "recital" everywhere downstream.
Storage prefers omission over writing "recital" explicitly to keep diffs minimal.
"""
from __future__ import annotations

YOUTUBE_KINDS: tuple[str, ...] = (
    "recital",
    "lecdem",
)

VALID_YOUTUBE_KINDS: frozenset[str] = frozenset(YOUTUBE_KINDS)
