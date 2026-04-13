# carnatic/render/theme.py
# Single source of truth for all Bani Flow design tokens.
# Mirrors theme.js. Edit ONLY this file to change the theme.
# Implements: Gruvbox Hard Dark (matches VS Code Gruvbox theme).
#
# SYNC REQUIRED: any change here must be mirrored in theme.js
#
# Implements ADR-028: Design Token Single Source of Truth.

# ── Level 0: Gruvbox Hard Dark primitive palette ──────────────────────────────
_P = {
    # Backgrounds (darkest → lightest)
    "bg_h":   "#1d2021",   # hard dark  — deepest bg (VS Code editor bg)
    "bg0":    "#282828",   # dark       — main bg
    "bg1":    "#3c3836",   # — sidebar, panel bg
    "bg2":    "#504945",   # — input bg, subtle separator
    "bg3":    "#665c54",   # — border, muted element
    "bg4":    "#7c6f64",   # — disabled, very muted

    # Foregrounds (lightest → dimmest)
    "fg0":    "#f9f5d7",   # brightest fg (rarely used)
    "fg":     "#ebdbb2",   # main fg
    "fg1":    "#d5c4a1",   # slightly dimmed
    "fg2":    "#bdae93",   # dimmed
    "fg3":    "#a89984",   # muted / gray

    # Accent colours (dark variants — used for nodes, highlights)
    "yellow": "#d79921",
    "orange": "#d65d0e",
    "red":    "#cc241d",
    "green":  "#98971a",
    "aqua":   "#689d6a",
    "blue":   "#458588",
    "purple": "#b16286",

    # Accent colours (bright variants — used for selection, active state)
    "yellow_bright": "#fabd2f",
    "orange_bright": "#fe8019",
    "red_bright":    "#fb4934",
    "green_bright":  "#b8bb26",
    "aqua_bright":   "#8ec07c",
    "blue_bright":   "#83a598",
    "purple_bright": "#d3869b",

    # Neutral
    "gray":   "#928374",
}

# ── Level 1: Semantic tokens ──────────────────────────────────────────────────
TOKENS = {
    # Backgrounds
    "bgDeep":       _P["bg_h"],    # deepest: graph canvas, editor area
    "bg":           _P["bg0"],     # main page background
    "bgPanel":      _P["bg1"],     # sidebar, panel background
    "bgInput":      _P["bg2"],     # input fields, subtle inset
    "bgHover":      _P["bg2"],     # hover state background
    "bgActive":     _P["bg3"],     # active/pressed state

    # Foregrounds
    "fg":           _P["fg"],      # primary text
    "fgSub":        _P["fg1"],     # secondary text (concert titles, etc.)
    "fgDim":        _P["fg2"],     # dimmed text (metadata)
    "fgMuted":      _P["fg3"],     # muted / placeholder text

    # Borders & separators
    "border":       _P["bg2"],     # panel borders, separators
    "borderStrong": _P["bg3"],     # stronger border (node default border)
    "borderMuted":  _P["bg1"],     # very subtle separator

    # Accent — general
    "accent":       _P["yellow"],  # primary accent (headings, active chips)
    "accentSub":    _P["aqua"],    # secondary accent (playing state, bani match)
    "accentLink":   _P["blue"],    # hyperlinks, wiki links
    "accentWarn":   _P["orange"],  # warnings, edge notes
    "accentDanger": _P["red"],     # close buttons, errors

    # Accent — selection / active (brighter)
    "accentSelect": _P["yellow_bright"],  # selected node border, active track
    "accentMatch":  _P["blue_bright"],    # bani-match node border

    # Node state borders
    "nodeDefault":   _P["bg3"],           # default node border
    "nodeHasTracks": _P["aqua"],          # node with recordings (green border)
    "nodeHovered":   _P["yellow"],        # hovered node
    "nodeSelected":  _P["fg"],            # selected node (bright fg)
    "nodeBaniMatch": _P["blue_bright"],   # bani-match node

    # Edge colours
    "edgeLine":      _P["bg2"],           # default edge line
    "edgeArrow":     _P["bg3"],           # default edge arrow
    "edgeHighlight": _P["yellow"],        # highlighted edge (bani filter)

    # Text on graph canvas
    "labelColor":      _P["fg"],          # node label text
    "labelOutline":    _P["bg_h"],        # node label text outline / bg
    "labelBgOpacity":  0.65,

    # Opacity states
    "opacityFaded": 0.12,                 # faded elements during bani filter
    "opacityEdge":  0.75,                 # default edge opacity

    # Typography
    # VS Code uses proportional sans-serif for UI chrome,
    # monospace only for code/data content.
    "fontUi":       "'Inter', 'Segoe UI', system-ui, sans-serif",
    "fontMono":     "'Courier New', monospace",
    "fontSizeBase": "0.78rem",
    "fontSizeSm":   "0.72rem",
    "fontSizeXs":   "0.68rem",
    "fontSizeLg":   "0.85rem",
    "fontSizeH3":   "0.70rem",            # panel section headers (uppercase)
}

# ── Level 2: Era colours (node fill colours) ──────────────────────────────────
# These are the semantic era→colour mappings used by both Python (graph_builder)
# and JS (graph_view, raga_wheel). The Python side reads from here;
# the JS side reads from THEME.era.
ERA_COLORS = {
    "trinity":        _P["yellow"],
    "bridge":         _P["orange"],
    "golden_age":     _P["blue"],
    "disseminator":   _P["aqua"],
    "living_pillars": _P["purple"],
    "contemporary":   _P["green"],
}

ERA_LABELS = {
    "trinity":        "The Trinity",
    "bridge":         "The Bridge",
    "golden_age":     "Golden Age",
    "disseminator":   "Disseminators",
    "living_pillars": "Living Pillars",
    "contemporary":   "Contemporary",
}

INSTRUMENT_SHAPES = {
    "vocal":     "ellipse",
    "veena":     "diamond",
    "violin":    "rectangle",
    "flute":     "triangle",
    "mridangam": "hexagon",
}

NODE_SIZES = {
    "trinity":        80,
    "bridge":         65,
    "golden_age":     58,
    "disseminator":   52,
    "living_pillars": 48,
    "contemporary":   44,
}

# Font sizes mirror cartographic label hierarchy (graph-space px).
# Cytoscape's min-zoomed-font-size handles hiding when zoomed out too far.
# Range kept modest so labels never overwhelm nodes.
ERA_FONT_SIZES = {
    "trinity":        20,
    "bridge":         17,
    "golden_age":     15,
    "disseminator":   13,
    "living_pillars": 12,
    "contemporary":   11,
}

# ── Level 2: Cakra colours (raga wheel sector fills) ──────────────────────────
CAKRA_COLORS = {
    1:  _P["yellow"],   2:  _P["green"],    3:  _P["aqua"],    4:  _P["blue"],
    5:  "#076678",      6:  "#427b58",      7:  "#79740e",     8:  _P["orange"],
    9:  "#af3a03",      10: _P["red"],      11: _P["purple"],  12: _P["purple_bright"],
}


def get(key: str):
    """Return a token value by semantic name."""
    return TOKENS.get(key)


def css_vars() -> str:
    """Return a CSS :root {} block generated from TOKENS."""
    mapping = {
        "--bg-deep":        TOKENS["bgDeep"],
        "--bg":             TOKENS["bg"],
        "--bg-panel":       TOKENS["bgPanel"],
        "--bg-input":       TOKENS["bgInput"],
        "--bg-hover":       TOKENS["bgHover"],
        "--bg-active":      TOKENS["bgActive"],
        "--fg":             TOKENS["fg"],
        "--fg-sub":         TOKENS["fgSub"],
        "--fg-dim":         TOKENS["fgDim"],
        "--fg-muted":       TOKENS["fgMuted"],
        "--border":         TOKENS["border"],
        "--border-strong":  TOKENS["borderStrong"],
        "--accent":         TOKENS["accent"],
        "--accent-sub":     TOKENS["accentSub"],
        "--accent-link":    TOKENS["accentLink"],
        "--accent-warn":    TOKENS["accentWarn"],
        "--accent-danger":  TOKENS["accentDanger"],
        "--accent-select":  TOKENS["accentSelect"],
        "--font-ui":        TOKENS["fontUi"],
        "--font-mono":      TOKENS["fontMono"],
    }
    lines = "\n".join(f"  {k}: {v};" for k, v in mapping.items())
    return f":root {{\n  /* Generated by theme.py css_vars() — edit theme.py, not here */\n{lines}\n}}"
