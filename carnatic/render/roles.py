"""
carnatic/render/roles.py — Performer role vocabulary (ADR-071).

Single source of truth for valid roles inside `Performer` objects, used by:
  • recordings/*.json sessions[].performers[].role
  • musicians/<id>.json youtube[].performers[].role  (ADR-070)

The JS mirror lives in `templates/roles.js`. Keep the two files in sync.
"""
from __future__ import annotations

PERFORMER_ROLES: tuple[str, ...] = (
    "vocal",
    "violin",
    "viola",
    "veena",
    "flute",
    "mridangam",
    "ghatam",
    "kanjira",
    "morsing",
    "tanpura",
    "tampura",
    "nadaswaram",
    "tavil",
    "harmonium",
)

VALID_ROLES: frozenset[str] = frozenset(PERFORMER_ROLES)
