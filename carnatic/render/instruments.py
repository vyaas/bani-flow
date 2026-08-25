"""
carnatic/render/instruments.py — Instrument iconography registry (ADR-172).

Single source of truth for how an instrument is *presented*: display label,
sort order, tradition, filter eligibility, and its drawn SVG glyph.

Supersedes the geometric-shape vocabulary of ADR-069 (circle = vocal,
diamond = veena, square = violin, triangle = flute, hexagon = mridangam) and
the two drifted `INSTRUMENT_SHAPES` tables it was split across
(`theme.py` had 5 keys, `graph_view.js` had 13 — so a sitar player's canvas
node disagreed with their own chip badge).

Every consumer is *generated* from this module — there is no hand-maintained
mirror, deliberately unlike theme.py/theme.js and roles.py/roles.js. Bezier
path data is unreviewable in a diff, and the table this module replaces was a
manual mirror that drifted. See ADR-172 §2.

  sprite_symbols()          → <symbol id="icon-instr-KEY"> markup for base.html
  js_registry()             → `const INSTRUMENTS = {...}` (labels only, no paths)
  icon_data_uri(key, colour)→ base64 data URI for cytoscape background-image

GLYPH CONVENTION (inherited from ADR-169's icon-tanpura, base.html:5080):
shapes carry **no `fill` attribute**, so they inherit the fill colour set by
the referencing <use> element or by icon_data_uri()'s wrapper. Glyphs are
filled silhouettes on a 24x24 viewBox, drawn for legibility at 11px — the
smallest scale they must survive (ADR-172 §Pattern).

NOTE: `instrument` values themselves are validated by
`carnatic/writer.py::VALID_INSTRUMENTS`, which is deliberately independent —
the data layer must not depend on the render layer. The subset relationship is
enforced by carnatic/tests/test_instrument_registry_drift.py.
"""
from __future__ import annotations

import base64
import json

# Key used for musicians with `instrument: null` (53 of 217 at time of writing).
# Presentation-only: never a valid data value, never offered as a filter.
FALLBACK_KEY = "unknown"

# `order` is sparse (10, 20, 30 …) so an instrument can be slotted between two
# existing ones without renumbering the file.
INSTRUMENTS: dict[str, dict] = {
    # ── Carnatic ─────────────────────────────────────────────────────────────
    "vocal": {
        "label": "Vocal", "order": 10, "tradition": "carnatic", "filter": True,
        "box": (1.8, 1.1, 21.5, 21.6),
        # Head in profile with two filled crescents radiating to the right.
        # Deliberately NOT a microphone — the mic glyph is already spoken for by
        # the "Concerts" neutral chip (base.html:2290) and would collide.
        "svg": (
            "<circle cx='8.2' cy='7.2' r='4.0'/>"
            "<path d='M1.8 21.6 C1.8 17.0 4.7 13.9 8.2 13.9 "
            "C11.7 13.9 14.6 17.0 14.6 21.6 Z'/>"
            "<path d='M15.84 4.02 A5.2 5.2 0 0 1 15.84 11.98 "
            "L16.61 12.90 A6.4 6.4 0 0 0 16.61 3.10 Z'/>"
            "<path d='M17.51 2.02 A7.8 7.8 0 0 1 17.51 13.98 "
            "L18.29 14.89 A9.0 9.0 0 0 0 18.29 1.11 Z'/>"
        ),
    },
    "violin": {
        "label": "Violin", "order": 20, "tradition": "carnatic", "filter": True,
        "box": (7.0, 1.5, 17.0, 22.6),
        # Waisted body (the load-bearing cue at small size), neck, volute scroll.
        "svg": (
            "<path d='M12 9.6 C14.6 9.6 16.6 11.2 16.6 13.2 "
            "C16.6 14.4 15.6 15.2 15.6 16.0 C15.6 16.8 17.0 17.6 17.0 19.2 "
            "C17.0 21.2 14.8 22.6 12 22.6 C9.2 22.6 7.0 21.2 7.0 19.2 "
            "C7.0 17.6 8.4 16.8 8.4 16.0 C8.4 15.2 7.4 14.4 7.4 13.2 "
            "C7.4 11.2 9.4 9.6 12 9.6 Z'/>"
            "<rect x='10.9' y='4.2' width='2.2' height='6.2'/>"
            "<path d='M10.8 4.6 L10.8 2.9 Q10.8 1.5 12.3 1.5 Q13.8 1.5 13.8 3.0 "
            "Q13.8 4.0 12.9 4.0 Q12.4 4.0 12.4 3.5 Q12.4 3.1 12.8 3.1 L13.0 3.1 "
            "Q12.9 2.5 12.3 2.5 Q11.7 2.5 11.7 3.1 L11.7 4.6 Z'/>"
        ),
    },
    "veena": {
        "label": "Veena", "order": 30, "tradition": "carnatic", "filter": True,
        "box": (2.3, 1.5, 22.8, 21.6),
        # Large resonator gourd low-left, diagonal neck up-right to a yali knob,
        # small tumba slung beneath the neck.
        "svg": (
            "<ellipse cx='7.5' cy='17.0' rx='5.2' ry='4.6'/>"
            "<path d='M9.67 12.63 L19.67 3.13 L21.33 4.87 L11.33 14.37 Z'/>"
            "<circle cx='20.9' cy='3.4' r='1.9'/>"
            "<circle cx='17.0' cy='8.6' r='1.7'/>"
        ),
    },
    "flute": {
        "label": "Flute", "order": 40, "tradition": "carnatic", "filter": True,
        "box": (1.55, 5.55, 22.45, 20.05),
        # Tilted tube; blowhole + four finger holes punched through via evenodd
        # (same trick as icon-tanpura's gourd rim).
        "svg": (
            "<path fill-rule='evenodd' d='"
            "M1.55 16.38 L20.35 5.58 L22.45 9.22 L3.65 20.02 Z "
            "M4.04 16.80 A1.00 1.00 0 1 0 6.04 16.80 A1.00 1.00 0 1 0 4.04 16.80 Z "
            "M7.29 14.96 A0.95 0.95 0 1 0 9.19 14.96 A0.95 0.95 0 1 0 7.29 14.96 Z "
            "M10.11 13.34 A0.95 0.95 0 1 0 12.01 13.34 A0.95 0.95 0 1 0 10.11 13.34 Z "
            "M12.93 11.72 A0.95 0.95 0 1 0 14.83 11.72 A0.95 0.95 0 1 0 12.93 11.72 Z "
            "M15.75 10.10 A0.95 0.95 0 1 0 17.65 10.10 A0.95 0.95 0 1 0 15.75 10.10 Z'/>"
        ),
    },
    "mridangam": {
        "label": "Mridangam", "order": 50, "tradition": "carnatic", "filter": True,
        "box": (2.0, 4.4, 22.0, 19.6),
        # Horizontal barrel bulging at the waist between two asymmetric heads
        # (thoppi left is the larger). The heads must stand clearly proud of the
        # barrel or the whole thing reads as a rounded rectangle.
        "svg": (
            "<path d='M4.6 7.6 C9 6.0 15 6.4 19.4 8.2 L19.4 15.8 "
            "C15 17.6 9 18.0 4.6 16.4 Z'/>"
            "<rect x='2.0' y='4.4' width='3.0' height='15.2' rx='1.5'/>"
            "<rect x='19.0' y='5.6' width='3.0' height='12.8' rx='1.5'/>"
        ),
    },
    "ghatam": {
        "label": "Ghatam", "order": 60, "tradition": "carnatic", "filter": True,
        "box": (3.1, 3.0, 20.9, 22.3),
        # Wide-bellied clay pot narrowing to a short neck and flared lip.
        "svg": (
            "<path d='M9.6 4.4 L14.4 4.4 L14.4 6.6 C18.6 7.9 20.9 11.4 20.9 15.0 "
            "C20.9 19.4 16.9 22.3 12 22.3 C7.1 22.3 3.1 19.4 3.1 15.0 "
            "C3.1 11.4 5.4 7.9 9.6 6.6 Z'/>"
            "<rect x='8.6' y='3.0' width='6.8' height='1.9' rx='0.95'/>"
        ),
    },
    "khanjira": {
        "label": "Khanjira", "order": 70, "tradition": "carnatic", "filter": True,
        "box": (1.8, 3.8, 21.35, 21.0),
        # Circular frame drum as an open ring (evenodd), with a pair of jingle
        # discs set into the rim at the right.
        "svg": (
            "<path fill-rule='evenodd' d='"
            "M10.4 3.8 A8.6 8.6 0 1 0 10.4 21.0 A8.6 8.6 0 1 0 10.4 3.8 Z "
            "M10.4 6.5 A5.9 5.9 0 1 0 10.4 18.3 A5.9 5.9 0 1 0 10.4 6.5 Z'/>"
            "<circle cx='19.8' cy='9.3' r='1.55'/>"
            "<circle cx='19.8' cy='15.5' r='1.55'/>"
        ),
    },
    "gottuvadyam": {
        "label": "Gottuvadyam", "order": 80, "tradition": "carnatic", "filter": True,
        "box": (2.3, 1.5, 22.8, 21.6),
        # ADR-172 Open Q1 — DEFERRED: intentionally identical to `veena`. A
        # fretless slide-bar differentiator that survives 11px is real design
        # work for two musicians; the separate key already carries the semantic
        # distinction, so closing this is an edit to this one `svg` value.
        "svg": (
            "<ellipse cx='7.5' cy='17.0' rx='5.2' ry='4.6'/>"
            "<path d='M9.67 12.63 L19.67 3.13 L21.33 4.87 L11.33 14.37 Z'/>"
            "<circle cx='20.9' cy='3.4' r='1.9'/>"
            "<circle cx='17.0' cy='8.6' r='1.7'/>"
        ),
    },
    "bharatanatyam": {
        "label": "Bharatanatyam", "order": 90, "tradition": "carnatic", "filter": True,
        "box": (4.4, 1.2, 19.4, 22.4),
        # Dancer in araimandi: arms out with elbows raised, flared costume skirt,
        # feet turned out. The skirt is what makes it read as a dancer rather
        # than a generic stick figure at small size.
        "svg": (
            "<circle cx='12' cy='3.4' r='2.2'/>"
            "<path d='M12 6.0 C13.2 6.0 14.0 6.8 14.0 8.0 L14.0 9.4 L17.6 9.4 "
            "L17.6 6.2 L19.4 6.2 L19.4 11.2 L14.0 11.2 L14.0 12.6 L9.8 12.6 "
            "L9.8 11.2 L4.4 11.2 L4.4 6.2 L6.2 6.2 L6.2 9.4 L9.8 9.4 L9.8 8.0 "
            "C9.8 6.8 10.6 6.0 12 6.0 Z'/>"
            "<path d='M9.6 12.4 L14.2 12.4 L17.0 19.4 L6.8 19.4 Z'/>"
            "<path d='M6.9 19.3 L10.1 19.3 L9.1 22.4 L5.2 22.4 Z'/>"
            "<path d='M13.9 19.3 L17.1 19.3 L18.8 22.4 L14.9 22.4 Z'/>"
        ),
    },
    # ── Hindustani (ADR-114) ─────────────────────────────────────────────────
    "sitar": {
        "label": "Sitar", "order": 100, "tradition": "hindustani", "filter": True,
        "box": (5.4, 2.0, 19.0, 22.8),
        # Deep gourd body, long straight vertical neck, tumba near the top —
        # the vertical neck + high tumba is what separates it from `veena`,
        # whose neck runs diagonally from a low-left gourd.
        "svg": (
            "<path d='M12 12.4 C15.2 12.6 18.6 15.6 18.6 18.6 "
            "C18.6 21.2 15.6 22.8 12 22.8 C8.4 22.8 5.4 21.2 5.4 18.6 "
            "C5.4 15.6 8.8 12.6 12 12.4 Z'/>"
            "<rect x='10.4' y='2.6' width='3.2' height='10.6'/>"
            "<circle cx='16.4' cy='4.6' r='2.6'/>"
        ),
    },
    "sarod": {
        "label": "Sarod", "order": 110, "tradition": "hindustani", "filter": True,
        "box": (4.7, 3.0, 19.3, 22.8),
        # Broad fretless fingerboard (metal plate punched through via evenodd)
        # over a wide rounded body, with side tuning pegs. The short broad plate
        # + pegs is the cue against `sitar`'s narrow neck and high tumba.
        "svg": (
            "<path d='M12 11.0 C16.3 11.0 19.3 13.9 19.3 17.4 "
            "C19.3 20.9 16.3 22.8 12 22.8 C7.7 22.8 4.7 20.9 4.7 17.4 "
            "C4.7 13.9 7.7 11.0 12 11.0 Z'/>"
            "<path fill-rule='evenodd' d='"
            "M8.6 11.4 L8.6 4.4 Q8.6 3.0 10.0 3.0 L14.0 3.0 Q15.4 3.0 15.4 4.4 "
            "L15.4 11.4 Z "
            "M10.0 5.2 L14.0 5.2 L14.0 10.2 L10.0 10.2 Z'/>"
            "<circle cx='7.0' cy='4.8' r='1.35'/>"
            "<circle cx='7.0' cy='7.8' r='1.35'/>"
        ),
    },
    "bansuri": {
        "label": "Bansuri", "order": 120, "tradition": "hindustani", "filter": True,
        "box": (1.55, 5.55, 22.45, 20.05),
        # ADR-172 Open Q1 — DEFERRED: intentionally identical to `flute`. See the
        # note on `gottuvadyam`; binding rings at 11px are the same problem.
        "svg": (
            "<path fill-rule='evenodd' d='"
            "M1.55 16.38 L20.35 5.58 L22.45 9.22 L3.65 20.02 Z "
            "M4.04 16.80 A1.00 1.00 0 1 0 6.04 16.80 A1.00 1.00 0 1 0 4.04 16.80 Z "
            "M7.29 14.96 A0.95 0.95 0 1 0 9.19 14.96 A0.95 0.95 0 1 0 7.29 14.96 Z "
            "M10.11 13.34 A0.95 0.95 0 1 0 12.01 13.34 A0.95 0.95 0 1 0 10.11 13.34 Z "
            "M12.93 11.72 A0.95 0.95 0 1 0 14.83 11.72 A0.95 0.95 0 1 0 12.93 11.72 Z "
            "M15.75 10.10 A0.95 0.95 0 1 0 17.65 10.10 A0.95 0.95 0 1 0 15.75 10.10 Z'/>"
        ),
    },
    "tabla": {
        "label": "Tabla", "order": 130, "tradition": "hindustani", "filter": False,
        "box": (3.2, 8.6, 20.8, 22.3),
        # The pair: squat wide bayan left, narrow tall dayan right, each with its
        # syahi punched through (evenodd).
        "svg": (
            "<path fill-rule='evenodd' d='"
            "M3.2 12.0 C3.2 9.9 5.2 8.6 7.6 8.6 C10.0 8.6 12.0 9.9 12.0 12.0 "
            "L12.0 19.2 C12.0 21.1 10.0 22.3 7.6 22.3 C5.2 22.3 3.2 21.1 3.2 19.2 Z "
            "M5.7 11.4 A1.9 1.9 0 1 0 9.5 11.4 A1.9 1.9 0 1 0 5.7 11.4 Z'/>"
            "<path fill-rule='evenodd' d='"
            "M13.6 14.0 C13.6 12.2 15.2 11.1 17.2 11.1 C19.2 11.1 20.8 12.2 20.8 14.0 "
            "L20.8 19.6 C20.8 21.2 19.2 22.3 17.2 22.3 C15.2 22.3 13.6 21.2 13.6 19.6 Z "
            "M15.7 13.4 A1.5 1.5 0 1 0 18.7 13.4 A1.5 1.5 0 1 0 15.7 13.4 Z'/>"
        ),
    },
    "sarangi": {
        "label": "Sarangi", "order": 140, "tradition": "hindustani", "filter": False,
        "box": (2.6, 3.0, 21.7, 22.6),
        # Boxy waisted body under a broad stubby neck, crossed by a bow — the bow
        # is what marks it as bowed rather than plucked.
        "svg": (
            "<path d='M8.0 11.0 L16.0 11.0 L16.0 15.0 C17.4 16.0 17.8 17.6 17.8 19.0 "
            "C17.8 21.2 16.2 22.6 12 22.6 C7.8 22.6 6.2 21.2 6.2 19.0 "
            "C6.2 17.6 6.6 16.0 8.0 15.0 Z'/>"
            "<rect x='9.9' y='3.0' width='4.2' height='8.6' rx='1.0'/>"
            "<path d='M2.6 13.4 L21.4 9.0 L21.7 10.4 L2.9 14.8 Z'/>"
        ),
    },
    "surbahar": {
        "label": "Surbahar", "order": 150, "tradition": "hindustani", "filter": False,
        "box": (4.6, 1.8, 19.4, 23.0),
        # A bass sitar: broader gourd, longer fretted neck, no upper tumba. The
        # punched frets separate it from `sitar`'s plain neck.
        "svg": (
            "<path d='M12 13.4 C15.8 13.6 19.4 16.4 19.4 19.2 "
            "C19.4 21.6 16.2 23.0 12 23.0 C7.8 23.0 4.6 21.6 4.6 19.2 "
            "C4.6 16.4 8.2 13.6 12 13.4 Z'/>"
            "<path fill-rule='evenodd' d='"
            "M9.9 1.8 L14.1 1.8 L14.1 14.0 L9.9 14.0 Z "
            "M10.6 4.4 L13.4 4.4 L13.4 5.2 L10.6 5.2 Z "
            "M10.6 7.2 L13.4 7.2 L13.4 8.0 L10.6 8.0 Z "
            "M10.6 10.0 L13.4 10.0 L13.4 10.8 L10.6 10.8 Z'/>"
        ),
    },
    # ── Catch-alls ───────────────────────────────────────────────────────────
    "other": {
        "label": "Other", "order": 900, "tradition": None, "filter": True,
        "box": (5.8, 2.4, 18.2, 22.6),
        # Generic round-bodied plucked lute — recognisably "an instrument"
        # without claiming to be any particular one.
        "svg": (
            "<path d='M12 10.8 C15.4 10.8 18.2 13.6 18.2 17.0 "
            "C18.2 20.4 15.4 22.6 12 22.6 C8.6 22.6 5.8 20.4 5.8 17.0 "
            "C5.8 13.6 8.6 10.8 12 10.8 Z'/>"
            "<rect x='10.8' y='2.4' width='2.4' height='9.0' rx='1.0'/>"
        ),
    },
    FALLBACK_KEY: {
        "label": "Unknown", "order": 990, "tradition": None, "filter": False,
        "box": (3.6, 3.6, 20.4, 20.4),
        # Neutral open ring. Musicians with `instrument: null` previously fell
        # through to "circle = vocal", which actively asserted something false.
        "svg": (
            "<path fill-rule='evenodd' d='"
            "M12 3.6 A8.4 8.4 0 1 0 12 20.4 A8.4 8.4 0 1 0 12 3.6 Z "
            "M12 6.4 A5.6 5.6 0 1 0 12 17.6 A5.6 5.6 0 1 0 12 6.4 Z'/>"
        ),
    },
}

SYMBOL_ID_PREFIX = "icon-instr-"
CAP_SYMBOL_ID = "icon-scholar-cap"

# ── Scholar's cap (ADR-173) ───────────────────────────────────────────────────
# Mortarboard with tassel — the same artwork the lecdem chip already uses
# (base.html .lecdem-chip::before), so "scholarly" reads consistently across the
# UI. Worn by any musician with >=1 composition: in Carnatic music composing is
# a scholarly act, and it is not tied to an instrument — vocalists, violinists,
# veena players and flautists all compose.
MORTARBOARD_SVG = (
    "<path d='M12 3 1 9l11 6 9-4.91V17h2V9zM5 13.18v4L12 21l7-3.82v-4L12 17z'/>"
)
MORTARBOARD_BOX = (1.0, 3.0, 23.0, 21.0)

# ── Layout: every glyph is normalised into the same optical box ───────────────
# Hand-drawn coordinates cannot be trusted to frame consistently: measured ink
# spans ran from 16.8 to 21.2 units of the 24-unit box, and narrow glyphs
# (violin 10 wide, sitar 13.6) read as "barely visible" beside a full-width
# ghatam. So each glyph carries its measured ink `box` and is mapped into a
# fixed target rect at emit time, preserving aspect and centred. Framing is
# therefore uniform by construction rather than by careful drawing.
#
# Targets are (x, y, w, h) in the 24x24 canvas.
# The composer pair deliberately spans the SAME vertical band as a plain glyph
# (1.2..22.4 vs 1.6..22.4). Letting the composite run edge-to-edge made composer
# nodes read ~9% larger than their neighbours and crowded the node's border ring.
_PLAIN_TARGET      = (1.6, 1.6, 20.8, 20.8)     # 87% of the box, centred
_COMPOSER_CAP      = (7.2, 1.2, 9.6, 6.8)       # cap centred across the top
_COMPOSER_INSTR    = (2.2, 8.2, 19.6, 14.2)     # instrument sits below the cap


def _fit(box: tuple[float, float, float, float],
         tx: float, ty: float, tw: float, th: float) -> str:
    """
    SVG transform mapping `box` (an ink bounding box) into the target rect,
    scaled on its longest side so aspect is preserved, and centred.
    """
    x0, y0, x1, y1 = box
    scale = min(tw, th) / max(x1 - x0, y1 - y0)
    cx, cy = tx + tw / 2, ty + th / 2
    icx, icy = (x0 + x1) / 2, (y0 + y1) / 2
    return f"translate({cx - scale * icx:.4f} {cy - scale * icy:.4f}) scale({scale:.5f})"


def glyph_markup(key: str | None, *, composer: bool = False) -> str:
    """
    Normalised inner markup for `key` on a 24x24 canvas.

    `composer=True` shrinks the instrument into the lower band and sets a
    mortarboard across the top. Only used where there is room for it — at 11-13px
    the composite turns to mush, so chips wear the cap as a separate marker
    (see makeInstrBadge in graph_view.js) rather than a composite glyph.
    """
    entry = INSTRUMENTS.get(key or "", INSTRUMENTS[FALLBACK_KEY])
    if not composer:
        return f"<g transform='{_fit(entry['box'], *_PLAIN_TARGET)}'>{entry['svg']}</g>"
    return (
        f"<g transform='{_fit(entry['box'], *_COMPOSER_INSTR)}'>{entry['svg']}</g>"
        f"<g transform='{_fit(MORTARBOARD_BOX, *_COMPOSER_CAP)}'>{MORTARBOARD_SVG}</g>"
    )


def symbol_id(key: str) -> str:
    """DOM id of the <symbol> for `key`, falling back for unknown/null keys."""
    return SYMBOL_ID_PREFIX + (key if key in INSTRUMENTS else FALLBACK_KEY)


def ordered_keys(*, filterable: bool = False) -> list[str]:
    """Registry keys sorted by `order`. `filterable` restricts to filter=True."""
    keys = [k for k, v in INSTRUMENTS.items() if not filterable or v["filter"]]
    return sorted(keys, key=lambda k: INSTRUMENTS[k]["order"])


def sprite_symbols(indent: str = "  ") -> str:
    """
    <symbol> defs for base.html's ADR-079 inline sprite: one per instrument plus
    the standalone scholar's cap.

    Composite composer glyphs are deliberately NOT emitted here — the DOM wears
    instrument and cap as two elements, so the composite is only ever needed by
    icon_data_uri() for canvas nodes.
    """
    out = [
        f"{indent}<symbol id=\"{symbol_id(key)}\" viewBox=\"0 0 24 24\">"
        f"{glyph_markup(key)}</symbol>"
        for key in ordered_keys()
    ]
    out.append(
        f"{indent}<symbol id=\"{CAP_SYMBOL_ID}\" viewBox=\"0 0 24 24\">"
        f"<g transform='{_fit(MORTARBOARD_BOX, *_PLAIN_TARGET)}'>{MORTARBOARD_SVG}</g>"
        f"</symbol>"
    )
    return "\n".join(out)


def js_registry() -> str:
    """
    `const INSTRUMENTS = {...}` for the JS surfaces.

    Deliberately omits `svg` and `box`: JS renders glyphs via
    <use href="#icon-instr-KEY"> against the injected sprite, so geometry exists
    exactly once in the built artifact and cannot drift (ADR-172 §2).
    """
    payload = {
        key: {
            "label":     v["label"],
            "order":     v["order"],
            "tradition": v["tradition"],
            "filter":    v["filter"],
        }
        for key, v in INSTRUMENTS.items()
    }
    return (
        "// ADR-172/ADR-173: generated from carnatic/render/instruments.py — do not edit.\n"
        f"const INSTRUMENTS = {json.dumps(payload, indent=2, sort_keys=False)};\n"
        f"const INSTRUMENT_FALLBACK = {json.dumps(FALLBACK_KEY)};\n"
        f"const INSTRUMENT_SYMBOL_PREFIX = {json.dumps(SYMBOL_ID_PREFIX)};\n"
        f"const SCHOLAR_CAP_SYMBOL = {json.dumps(CAP_SYMBOL_ID)};\n"
    )


def icon_data_uri(key: str | None, colour: str, *, composer: bool = False) -> str:
    """
    Base64 SVG data URI of `key`'s glyph filled with `colour`.

    Two things here are load-bearing for cytoscape:

    * **Explicit width/height.** An SVG carrying only a viewBox has no intrinsic
      size, so a browser falls back to the 300x150 default replaced-element box.
      Cytoscape then scales that 2:1 letterbox rather than the glyph — which is
      what made node icons look off-centre and inconsistently zoomed.
    * **base64, not `;utf8,`.** The `#` of a `#rrggbb` fill is read as a fragment
      delimiter inside a data: URI and truncates the image.
    """
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' "
        f"viewBox='0 0 24 24' fill='{colour}'>{glyph_markup(key, composer=composer)}</svg>"
    )
    b64 = base64.b64encode(svg.encode()).decode()
    return f"data:image/svg+xml;base64,{b64}"
