"""
test_instrument_registry_drift.py — ADR-172 §Verification drift-guard.

The instrument→glyph registry (carnatic/render/instruments.py) is the single
source of truth for instrument *presentation*. Before ADR-172 the mapping lived
in two hand-maintained tables (theme.py had 5 keys, graph_view.js had 13) which
had silently drifted, so a sitar player's canvas node disagreed with their own
chip badge. These assertions exist so that cannot recur.

Failure here means one of:
  • an instrument was added to writer.py's vocabulary without a glyph
  • a musician was added with an instrument the registry does not know
  • a JS template grew a hardcoded instrument list again instead of deriving
    from the generated INSTRUMENTS registry
  • the retired geometric-shape machinery came back
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from carnatic.render.instruments import (  # noqa: E402
    FALLBACK_KEY,
    INSTRUMENTS,
    SYMBOL_ID_PREFIX,
    icon_data_uri,
    js_registry,
    ordered_keys,
    sprite_symbols,
)
from carnatic.writer import VALID_INSTRUMENTS  # noqa: E402

TEMPLATES = PROJECT_ROOT / "carnatic" / "render" / "templates"
MUSICIAN_DIR = PROJECT_ROOT / "carnatic" / "data" / "musicians"

# Every registry key except the presentation-only fallback is a real data value.
ADDABLE = set(INSTRUMENTS) - {FALLBACK_KEY}


def _data_instruments() -> set[str]:
    """Distinct non-null `instrument` values across all musician files."""
    found = set()
    for path in MUSICIAN_DIR.glob("*.json"):
        # `_edges.json` lives here too and is a list of lineage edges, not a node.
        if path.name.startswith("_"):
            continue
        instr = json.loads(path.read_text()).get("instrument")
        if instr:
            found.add(instr)
    return found


# ── vocabulary agreement ─────────────────────────────────────────────────────

def test_registry_is_subset_of_writer_vocabulary():
    """No glyph may exist for an instrument the writer would reject."""
    assert ADDABLE <= VALID_INSTRUMENTS, (
        f"registry keys absent from writer.VALID_INSTRUMENTS: "
        f"{sorted(ADDABLE - VALID_INSTRUMENTS)}"
    )


def test_every_valid_instrument_has_a_glyph():
    """
    Every instrument a librarian can write must be drawable — otherwise the
    add-musician form offers an option that renders as the fallback ring.
    """
    assert VALID_INSTRUMENTS <= ADDABLE, (
        f"valid instruments with no glyph: {sorted(VALID_INSTRUMENTS - ADDABLE)}"
    )


def test_every_instrument_in_the_data_has_a_glyph():
    """Catches `add-musician --instrument <new>` shipping without a glyph."""
    missing = _data_instruments() - ADDABLE
    assert not missing, f"musicians reference instruments with no glyph: {sorted(missing)}"


# ── registry internal consistency ────────────────────────────────────────────

@pytest.mark.parametrize("key", sorted(INSTRUMENTS))
def test_entry_shape(key):
    entry = INSTRUMENTS[key]
    assert set(entry) == {"label", "order", "tradition", "filter", "svg"}, \
        f"{key}: unexpected fields {sorted(entry)}"
    assert entry["label"], f"{key}: empty label"
    assert isinstance(entry["order"], int), f"{key}: order must be int"
    assert isinstance(entry["filter"], bool), f"{key}: filter must be bool"
    assert entry["tradition"] in (None, "carnatic", "hindustani"), \
        f"{key}: bad tradition {entry['tradition']!r}"


def test_orders_are_unique():
    orders = [v["order"] for v in INSTRUMENTS.values()]
    assert len(orders) == len(set(orders)), "duplicate `order` values"


def test_fallback_is_not_offerable():
    """`unknown` is presentation-only: never filterable, never a data value."""
    assert INSTRUMENTS[FALLBACK_KEY]["filter"] is False
    assert FALLBACK_KEY not in VALID_INSTRUMENTS


@pytest.mark.parametrize("key", sorted(INSTRUMENTS))
def test_glyph_sets_no_fill(key):
    """
    ADR-169/ADR-172 convention: glyph shapes carry no `fill` attribute so the
    colour is set by the referencing <use> or by icon_data_uri()'s wrapper. A
    hardcoded fill would make the badge ignore --fg-muted and currentColor.
    """
    svg = INSTRUMENTS[key]["svg"]
    assert "fill=" not in svg, f"{key}: glyph hardcodes a fill attribute"
    assert "stroke" not in svg, f"{key}: glyphs are filled silhouettes, not stroked"


# ── emitters ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("key", sorted(INSTRUMENTS))
def test_sprite_emits_one_symbol_per_key(key):
    sprite = sprite_symbols()
    assert sprite.count(f'id="{SYMBOL_ID_PREFIX}{key}"') == 1, \
        f"{key}: expected exactly one <symbol> in the sprite"


def test_sprite_symbol_count_matches_registry():
    assert sprite_symbols().count("<symbol ") == len(INSTRUMENTS)


def test_js_registry_exposes_every_key_without_path_data():
    js = js_registry()
    match = re.search(r"const INSTRUMENTS = (\{.*?\n\});", js, re.S)
    assert match, "could not parse the emitted INSTRUMENTS object"
    payload = json.loads(match.group(1))
    assert set(payload) == set(INSTRUMENTS)
    for key, entry in payload.items():
        assert set(entry) == {"label", "order", "tradition", "filter"}, \
            f"{key}: JS registry must not carry `svg` — path data belongs only " \
            f"in the sprite, or it can drift again (ADR-172 §2)"
    assert "INSTRUMENT_FALLBACK" in js
    assert "INSTRUMENT_SYMBOL_PREFIX" in js


@pytest.mark.parametrize("key", sorted(INSTRUMENTS))
def test_data_uri_is_safe_for_cytoscape(key):
    """
    A raw `#` inside a data: URI is read as a fragment delimiter, so the `#rrggbb`
    fill colour would truncate the image. base64 sidesteps it entirely.
    """
    uri = icon_data_uri(key, "#1d2021")
    assert uri.startswith("data:image/svg+xml;base64,")
    payload = uri.split(",", 1)[1]
    for bad in "#<>\n\"' ":
        assert bad not in payload, f"{key}: data URI payload contains {bad!r}"


def test_data_uri_falls_back_for_null_instrument():
    """53 musicians have `instrument: null` — they must not render blank."""
    assert icon_data_uri(None, "#1d2021") == icon_data_uri(FALLBACK_KEY, "#1d2021")
    assert icon_data_uri("harmonium", "#1d2021") == icon_data_uri(FALLBACK_KEY, "#1d2021")


def test_ordered_keys_respects_filter_flag():
    assert ordered_keys(filterable=True) == [
        k for k in ordered_keys() if INSTRUMENTS[k]["filter"]
    ]
    assert FALLBACK_KEY not in ordered_keys(filterable=True)


# ── JS templates derive rather than duplicate ────────────────────────────────

# A hardcoded list is two or more instrument names as adjacent quoted strings.
#
# The performer-ROLE vocabulary (render/roles.py, render/templates/roles.js)
# overlaps instruments almost entirely — `['vocal', 'violin', 'mridangam']` is a
# legitimate role list, not a drifted instrument list. ADR-172 Open Q2 leaves
# role/instrument unification to a later ADR, so role lines are exempt here.
_NAMES = "|".join(sorted(ADDABLE))
_HARDCODED = re.compile(
    rf"""['"](?:{_NAMES})['"]\s*,\s*['"](?:{_NAMES})['"]"""
)
_ROLE_LINE = re.compile(r"role|performer", re.I)


@pytest.mark.parametrize("template", ["graph_view.js", "entry_forms.js"])
def test_no_hardcoded_instrument_lists(template):
    """
    ADR-172 §6: the five instrument literals were replaced by instrumentKeys()
    calls. A new one reintroduces the drift this ADR exists to close.
    """
    src = (TEMPLATES / template).read_text()
    offenders = [
        line.strip()
        for line in src.splitlines()
        if _HARDCODED.search(line) and not _ROLE_LINE.search(line)
    ]
    assert not offenders, (
        f"{template}: hardcoded instrument list found — derive from the "
        f"INSTRUMENTS registry via instrumentKeys() instead:\n  "
        + "\n  ".join(offenders)
    )


@pytest.mark.parametrize("template", ["graph_view.js", "entry_forms.js"])
def test_templates_actually_call_instrument_keys(template):
    """The flip side: the lists must be derived, not merely deleted."""
    src = (TEMPLATES / template).read_text()
    assert "instrumentKeys(" in src, f"{template}: nothing derives from the registry"


def test_geometric_shape_machinery_is_gone():
    """ADR-172 §4/§5: node geometry no longer encodes instrument."""
    gv = (TEMPLATES / "graph_view.js").read_text()
    # Strip `//` comments first: the prose recording the removal names the very
    # identifiers we are asserting are gone.
    code = "\n".join(re.sub(r"//.*$", "", ln) for ln in gv.splitlines())
    assert "makeShapeSVG" not in code, "makeShapeSVG was retired by ADR-172"
    assert "INSTRUMENT_SHAPES" not in code, "the drifted shape table was retired by ADR-172"
    assert "node[shape = " not in code, "per-shape border rules were retired by ADR-172"
    assert "'data(shape)'" not in code, "nodes no longer carry a `shape` field"
    # The glyph overlay must actually be wired up.
    assert "'data(icon)'" in code


def test_graph_builder_emits_icon_not_shape():
    from carnatic.render.graph_builder import build_elements
    graph = {
        "nodes": [
            {"id": "a", "label": "A", "era": "contemporary", "instrument": "violin"},
            {"id": "b", "label": "B", "era": "contemporary", "instrument": None},
        ],
        "edges": [],
    }
    nodes = [e for e in build_elements(graph) if not e["data"].get("source")]
    by_id = {n["data"]["id"]: n["data"] for n in nodes}
    for data in by_id.values():
        assert "shape" not in data, "ADR-172 removed the `shape` node field"
        assert data["icon"].startswith("data:image/svg+xml;base64,")
    # A null instrument gets the fallback glyph, not the vocal one.
    assert by_id["b"]["icon"] == icon_data_uri(FALLBACK_KEY, by_id["b"]["icon"] and
                                              __import__("carnatic.render.theme",
                                                         fromlist=["TOKENS"]).TOKENS["bgDeep"])
    assert by_id["a"]["icon"] != by_id["b"]["icon"]
