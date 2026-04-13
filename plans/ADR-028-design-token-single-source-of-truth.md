# ADR-028: Design Token Single Source of Truth

**Status:** Accepted
**Date:** 2026-04-13

---

## Context

### The problem

Bani Flow and VS Code both claim to use the Gruvbox colour theme, yet they look
noticeably different (see `screenshots/screenshot_02.png`). The root cause is
**four independent colour registries** that have drifted apart and are never
reconciled:

| Registry | Location | Controls |
|---|---|---|
| CSS custom properties | [`base.html`](../carnatic/render/templates/base.html:9) `:root {}` | All HTML/CSS chrome: sidebars, panels, buttons, text |
| Python dicts | [`graph_builder.py`](../carnatic/render/graph_builder.py:12) `ERA_COLORS`, `NODE_SIZES`, `ERA_FONT_SIZES` | Cytoscape node colours, sizes, font sizes (injected as element data) |
| JS object + raw hex | [`graph_view.js`](../carnatic/render/templates/graph_view.js:102) `ERA_COLOURS` + Cytoscape style blocks | Cytoscape edge/node border colours, label colours, faded opacity |
| JS object + raw hex | [`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js:65) `CAKRA_COLORS` + ~25 SVG attribute literals | Raga wheel sector fills, node strokes, label fills |

Beyond colour, **typography** is also fragmented:
- `Courier New, monospace` is hardcoded in [`base.html`](../carnatic/render/templates/base.html:19), [`graph_view.js`](../carnatic/render/templates/graph_view.js:21), and [`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js:168) independently.
- Font sizes are scattered as raw `px` strings in SVG attribute calls throughout `raga_wheel.js`.
- The header uses the same monospace font as code — VS Code uses a proportional UI font for chrome.

The consequence: changing the theme requires hunting through four files, and
any partial change produces visual inconsistency. There is no way to switch
themes, test contrast variants, or reproduce VS Code's exact appearance without
touching every file.

### The VS Code / Bani Flow divergence

Comparing the two screenshots:

| Property | VS Code (Gruvbox) | Bani Flow (current) |
|---|---|---|
| Background | `#1d2021` (hard dark) | `#282828` (medium dark) |
| Sidebar bg | `#282828` | `#3c3836` |
| Active tab / header | `#3c3836` | `#3c3836` ✓ |
| Foreground text | `#ebdbb2` ✓ | `#ebdbb2` ✓ |
| Dimmed text | `#a89984` ✓ | `#a89984` ✓ |
| UI chrome font | System sans-serif (Segoe UI / Inter) | `Courier New` ✗ |
| Code/data font | `Courier New` ✓ | `Courier New` ✓ |
| Accent yellow | `#d79921` ✓ | `#d79921` ✓ |
| Selection highlight | `#fabd2f` (bright yellow) | `#d79921` (same as accent) |
| Border / separator | `#504945` | `#504945` ✓ |

The primary divergences are:
1. **Background depth** — VS Code uses `#1d2021` (hard) as the deepest background; Bani Flow uses `#282828`. This makes Bani Flow look flatter and less contrasty.
2. **UI font** — VS Code uses a proportional sans-serif for all chrome (panel headers, labels, buttons, sidebar text). Bani Flow uses `Courier New` everywhere, which reads as "terminal" rather than "editor".
3. **Selection vs accent** — VS Code distinguishes the active/selected accent (`#fabd2f` bright yellow) from the general accent (`#d79921` dark yellow). Bani Flow uses `#d79921` for both.

---

## Forces in tension

- **Immersion** — the rasika should feel they are inside a coherent visual world, not a patchwork of independently styled widgets.
- **Fidelity to the oral tradition** — the UI is a container for music, not a statement about itself. It should recede. VS Code's approach (deep background, proportional chrome font, monospace only for data) achieves this better than Bani Flow's current all-monospace approach.
- **Scalability without fragmentation** — as new views are added (raga wheel, timeline, future views), each must inherit the theme automatically, not re-implement it.
- **Queryability / maintainability** — a developer must be able to change the entire theme by editing one file.

---

## Pattern

**Single Source of Truth** (Alexander: *One Place*) combined with **Levels of Scale** (Alexander: tokens at the primitive level → semantic level → component level).

The pattern resolves the forces by establishing a strict hierarchy:

```
Level 0 — Primitive tokens   (raw Gruvbox palette values, never used directly)
Level 1 — Semantic tokens    (bg, fg, accent, border — what a colour *means*)
Level 2 — Component tokens   (sidebar-bg, node-label-color, edge-line-color)
Level 3 — Usage              (CSS custom properties, JS constants, Python dicts)
```

All four registries become **consumers** of a single Level 1 token file. No
raw hex value appears more than once in the codebase.

---

## Decision

### 1. Introduce `carnatic/render/templates/theme.js` — the single source of truth

A new file, `theme.js`, is injected **first** in the script block (before
`graph_view.js`). It exports a global `THEME` object containing all design
tokens at Levels 0–2. Every other JS file references `THEME.*` instead of raw
hex literals.

**Before (scattered):**
```js
// graph_view.js line 24
'color': '#ebdbb2',
// graph_view.js line 38
'border-color': '#665c54',
// raga_wheel.js line 89
fill: '#1d2021', opacity: 0.72
// raga_wheel.js line 167
fill: i === 0 ? '#ebdbb2' : '#a89984',
```

**After (all from THEME):**
```js
// graph_view.js
'color':        THEME.fg,
'border-color': THEME.border,
// raga_wheel.js
fill: THEME.bg0, opacity: 0.72
fill: i === 0 ? THEME.fg : THEME.fgDim,
```

### 2. `theme.js` shape — Gruvbox Hard Dark (VS Code variant)

```js
// carnatic/render/templates/theme.js
// ── Bani Flow Design Tokens ────────────────────────────────────────────────
// Single source of truth for all visual properties.
// Edit ONLY this file to change the theme.
// Implements: Gruvbox Hard Dark (matches VS Code Gruvbox theme).
//
// get(key)  → returns token value
// set(key, value) → overrides token at runtime (for theme switching)

const THEME = (() => {
  // ── Level 0: Gruvbox Hard Dark primitive palette ─────────────────────────
  // These are the raw palette values. Never reference these directly outside
  // this file. Use semantic tokens (Level 1) instead.
  const P = {
    // Backgrounds (darkest → lightest)
    bg_h:   '#1d2021',   // hard dark  — deepest bg (VS Code editor bg)
    bg0:    '#282828',   // dark       — main bg
    bg1:    '#3c3836',   // — sidebar, panel bg
    bg2:    '#504945',   // — input bg, subtle separator
    bg3:    '#665c54',   // — border, muted element
    bg4:    '#7c6f64',   // — disabled, very muted

    // Foregrounds (lightest → dimmest)
    fg0:    '#f9f5d7',   // brightest fg (rarely used)
    fg:     '#ebdbb2',   // main fg
    fg1:    '#d5c4a1',   // slightly dimmed
    fg2:    '#bdae93',   // dimmed
    fg3:    '#a89984',   // muted / gray

    // Accent colours (dark variants — used for nodes, highlights)
    yellow: '#d79921',
    orange: '#d65d0e',
    red:    '#cc241d',
    green:  '#98971a',
    aqua:   '#689d6a',
    blue:   '#458588',
    purple: '#b16286',

    // Accent colours (bright variants — used for selection, active state)
    yellowBright: '#fabd2f',
    orangeBright: '#fe8019',
    redBright:    '#fb4934',
    greenBright:  '#b8bb26',
    aquaBright:   '#8ec07c',
    blueBright:   '#83a598',
    purpleBright: '#d3869b',

    // Neutral
    gray:   '#928374',
  };

  // ── Level 1: Semantic tokens ──────────────────────────────────────────────
  // What a colour *means* in the UI. Map primitives to roles.
  const S = {
    // Backgrounds
    bgDeep:       P.bg_h,    // deepest: graph canvas, editor area
    bg:           P.bg0,     // main page background
    bgPanel:      P.bg1,     // sidebar, panel background
    bgInput:      P.bg2,     // input fields, subtle inset
    bgHover:      P.bg2,     // hover state background
    bgActive:     P.bg3,     // active/pressed state

    // Foregrounds
    fg:           P.fg,      // primary text
    fgSub:        P.fg1,     // secondary text (concert titles, etc.)
    fgDim:        P.fg2,     // dimmed text (metadata)
    fgMuted:      P.fg3,     // muted / placeholder text

    // Borders & separators
    border:       P.bg2,     // panel borders, separators
    borderStrong: P.bg3,     // stronger border (node default border)
    borderMuted:  P.bg1,     // very subtle separator

    // Accent — general
    accent:       P.yellow,  // primary accent (headings, active chips)
    accentSub:    P.aqua,    // secondary accent (playing state, bani match)
    accentLink:   P.blue,    // hyperlinks, wiki links
    accentWarn:   P.orange,  // warnings, edge notes
    accentDanger: P.red,     // close buttons, errors

    // Accent — selection / active (brighter)
    accentSelect: P.yellowBright,  // selected node border, active track
    accentMatch:  P.blueBright,    // bani-match node border

    // Node state borders
    nodeDefault:  P.bg3,           // default node border
    nodeHasTracks: P.aqua,         // node with recordings (green border)
    nodeHovered:  P.yellow,        // hovered node
    nodeSelected: P.fg,            // selected node (bright fg)
    nodeBaniMatch: P.blueBright,   // bani-match node

    // Edge colours
    edgeLine:     P.bg2,           // default edge line
    edgeArrow:    P.bg3,           // default edge arrow
    edgeHighlight: P.yellow,       // highlighted edge (bani filter)

    // Text on graph canvas
    labelColor:   P.fg,            // node label text
    labelOutline: P.bg_h,          // node label text outline / bg
    labelBgOpacity: 0.65,

    // Opacity states
    opacityFaded: 0.12,            // faded elements during bani filter
    opacityEdge:  0.75,            // default edge opacity

    // ── Level 2: Typography ────────────────────────────────────────────────
    // VS Code uses proportional sans-serif for UI chrome,
    // monospace only for code/data content.
    fontUi:       "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontMono:     "'Courier New', monospace",
    fontSizeBase: '0.78rem',
    fontSizeSm:   '0.72rem',
    fontSizeXs:   '0.68rem',
    fontSizeLg:   '0.85rem',
    fontSizeH3:   '0.70rem',       // panel section headers (uppercase)
  };

  // ── Level 2: Era colours (node fill colours) ──────────────────────────────
  // These are the semantic era→colour mappings used by both Python (graph_builder)
  // and JS (graph_view, raga_wheel). The Python side reads from graph_builder.py;
  // the JS side reads from THEME.era.
  S.era = {
    trinity:        P.yellow,
    bridge:         P.orange,
    golden_age:     P.blue,
    disseminator:   P.aqua,
    living_pillars: P.purple,
    contemporary:   P.green,
  };

  // ── Level 2: Cakra colours (raga wheel sector fills) ─────────────────────
  S.cakra = {
    1:  P.yellow,   2:  P.green,    3:  P.aqua,    4:  P.blue,
    5:  '#076678',  6:  '#427b58',  7:  '#79740e', 8:  P.orange,
    9:  '#af3a03',  10: P.red,      11: P.purple,  12: P.purpleBright,
  };

  // ── get / set API ─────────────────────────────────────────────────────────
  const tokens = { ...S, _primitives: P };

  return {
    ...tokens,
    get(key)        { return tokens[key]; },
    set(key, value) { tokens[key] = value; },
    // Convenience: dump all tokens as CSS custom properties string
    // (used by the render pipeline to inject into :root {})
    toCSSVars() {
      const map = {
        '--bg-deep':      tokens.bgDeep,
        '--bg':           tokens.bg,
        '--bg-panel':     tokens.bgPanel,
        '--bg-input':     tokens.bgInput,
        '--bg-hover':     tokens.bgHover,
        '--bg-active':    tokens.bgActive,
        '--fg':           tokens.fg,
        '--fg-sub':       tokens.fgSub,
        '--fg-dim':       tokens.fgDim,
        '--fg-muted':     tokens.fgMuted,
        '--border':       tokens.border,
        '--border-strong': tokens.borderStrong,
        '--accent':       tokens.accent,
        '--accent-sub':   tokens.accentSub,
        '--accent-link':  tokens.accentLink,
        '--accent-warn':  tokens.accentWarn,
        '--accent-danger': tokens.accentDanger,
        '--accent-select': tokens.accentSelect,
        '--font-ui':      tokens.fontUi,
        '--font-mono':    tokens.fontMono,
      };
      return Object.entries(map)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n');
    }
  };
})();
```

### 3. `base.html` `:root {}` block is replaced by `THEME.toCSSVars()` injection

The CSS custom properties in [`base.html`](../carnatic/render/templates/base.html:9) are **generated** by the render pipeline from `THEME`, not hand-written. The `html_generator.py` injects `theme.js` first, then calls `THEME.toCSSVars()` to produce the `:root {}` block.

**Before (`base.html` lines 9–15):**
```css
:root {
  --bg:     #282828; --bg1: #3c3836; --bg2: #504945; --bg3: #665c54;
  --fg:     #ebdbb2; --fg2: #d5c4a1; --fg3: #bdae93;
  --yellow: #d79921; --orange: #d65d0e; --blue: #458588;
  --aqua:   #689d6a; --purple: #b16286; --green: #98971a;
  --red:    #cc241d; --gray:   #a89984;
}
```

**After (`base.html` — CSS vars replaced by semantic names):**
```css
:root {
  /* Generated by THEME.toCSSVars() — edit theme.js, not here */
  --bg-deep:      #1d2021;
  --bg:           #282828;
  --bg-panel:     #3c3836;
  --bg-input:     #504945;
  --bg-hover:     #504945;
  --bg-active:    #665c54;
  --fg:           #ebdbb2;
  --fg-sub:       #d5c4a1;
  --fg-dim:       #bdae93;
  --fg-muted:     #a89984;
  --border:       #504945;
  --border-strong: #665c54;
  --accent:       #d79921;
  --accent-sub:   #689d6a;
  --accent-link:  #458588;
  --accent-warn:  #d65d0e;
  --accent-danger: #cc241d;
  --accent-select: #fabd2f;
  --font-ui:      'Inter', 'Segoe UI', system-ui, sans-serif;
  --font-mono:    'Courier New', monospace;
}
```

All CSS in `base.html` is then updated to use the new semantic variable names:

```css
/* Before */
body { background: var(--bg); color: var(--fg); font-family: 'Courier New', monospace; }
header { background: var(--bg1); border-bottom: 1px solid var(--bg3); }
.panel h3 { color: var(--gray); }

/* After */
body { background: var(--bg); color: var(--fg); font-family: var(--font-ui); }
header { background: var(--bg-panel); border-bottom: 1px solid var(--border-strong); }
.panel h3 { color: var(--fg-muted); }
```

Note the critical typography change: `body` switches from `font-family: 'Courier New', monospace` to `font-family: var(--font-ui)`. Monospace is retained only for data-dense elements: the graph canvas labels, the metadata inspector (`#mi-pre`), and the timeline ruler.

### 4. `graph_builder.py` reads from a shared token file

`graph_builder.py` currently hardcodes `ERA_COLORS`, `NODE_SIZES`, and `ERA_FONT_SIZES` as Python dicts. These must be derived from the same source of truth.

**Mechanism:** A new file `carnatic/render/theme.py` mirrors the JS `theme.js` token structure in Python. `graph_builder.py` imports from it. `html_generator.py` also imports from it to inject `theme.js` into the HTML.

**Before (`graph_builder.py` lines 12–19):**
```python
ERA_COLORS = {
    "trinity":        "#d79921",
    "bridge":         "#d65d0e",
    "golden_age":     "#458588",
    "disseminator":   "#689d6a",
    "living_pillars": "#b16286",
    "contemporary":   "#98971a",
}
```

**After (`carnatic/render/theme.py` — new file):**
```python
# carnatic/render/theme.py
# Single source of truth for all Bani Flow design tokens.
# Mirrors theme.js. Edit ONLY this file to change the theme.
# Implements: Gruvbox Hard Dark (matches VS Code Gruvbox theme).

# ── Level 0: Gruvbox Hard Dark primitive palette ──────────────────────────
_P = {
    "bg_h":   "#1d2021",
    "bg0":    "#282828",
    "bg1":    "#3c3836",
    "bg2":    "#504945",
    "bg3":    "#665c54",
    "bg4":    "#7c6f64",
    "fg0":    "#f9f5d7",
    "fg":     "#ebdbb2",
    "fg1":    "#d5c4a1",
    "fg2":    "#bdae93",
    "fg3":    "#a89984",
    "yellow": "#d79921",
    "orange": "#d65d0e",
    "red":    "#cc241d",
    "green":  "#98971a",
    "aqua":   "#689d6a",
    "blue":   "#458588",
    "purple": "#b16286",
    "yellow_bright": "#fabd2f",
    "blue_bright":   "#83a598",
    "gray":   "#928374",
}

# ── Level 1: Semantic tokens ──────────────────────────────────────────────
TOKENS = {
    "bgDeep":       _P["bg_h"],
    "bg":           _P["bg0"],
    "bgPanel":      _P["bg1"],
    "bgInput":      _P["bg2"],
    "bgActive":     _P["bg3"],
    "fg":           _P["fg"],
    "fgSub":        _P["fg1"],
    "fgDim":        _P["fg2"],
    "fgMuted":      _P["fg3"],
    "border":       _P["bg2"],
    "borderStrong": _P["bg3"],
    "accent":       _P["yellow"],
    "accentSub":    _P["aqua"],
    "accentLink":   _P["blue"],
    "accentWarn":   _P["orange"],
    "accentDanger": _P["red"],
    "accentSelect": _P["yellow_bright"],
    "accentMatch":  _P["blue_bright"],
    "nodeDefault":  _P["bg3"],
    "nodeHasTracks": _P["aqua"],
    "nodeHovered":  _P["yellow"],
    "nodeSelected": _P["fg"],
    "nodeBaniMatch": _P["blue_bright"],
    "edgeLine":     _P["bg2"],
    "edgeArrow":    _P["bg3"],
    "edgeHighlight": _P["yellow"],
    "labelColor":   _P["fg"],
    "labelOutline": _P["bg_h"],
    "opacityFaded": 0.12,
    "opacityEdge":  0.75,
    "fontUi":       "'Inter', 'Segoe UI', system-ui, sans-serif",
    "fontMono":     "'Courier New', monospace",
}

# ── Level 2: Era colours ──────────────────────────────────────────────────
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

ERA_FONT_SIZES = {
    "trinity":        20,
    "bridge":         17,
    "golden_age":     15,
    "disseminator":   13,
    "living_pillars": 12,
    "contemporary":   11,
}

def get(key: str):
    """Return a token value by semantic name."""
    return TOKENS.get(key)

def css_vars() -> str:
    """Return a CSS :root {} block generated from TOKENS."""
    mapping = {
        "--bg-deep":       TOKENS["bgDeep"],
        "--bg":            TOKENS["bg"],
        "--bg-panel":      TOKENS["bgPanel"],
        "--bg-input":      TOKENS["bgInput"],
        "--bg-active":     TOKENS["bgActive"],
        "--fg":            TOKENS["fg"],
        "--fg-sub":        TOKENS["fgSub"],
        "--fg-dim":        TOKENS["fgDim"],
        "--fg-muted":      TOKENS["fgMuted"],
        "--border":        TOKENS["border"],
        "--border-strong": TOKENS["borderStrong"],
        "--accent":        TOKENS["accent"],
        "--accent-sub":    TOKENS["accentSub"],
        "--accent-link":   TOKENS["accentLink"],
        "--accent-warn":   TOKENS["accentWarn"],
        "--accent-danger": TOKENS["accentDanger"],
        "--accent-select": TOKENS["accentSelect"],
        "--font-ui":       TOKENS["fontUi"],
        "--font-mono":     TOKENS["fontMono"],
    }
    lines = "\n".join(f"  {k}: {v};" for k, v in mapping.items())
    return f":root {{\n{lines}\n}}"
```

**After (`graph_builder.py` — imports from theme.py):**
```python
from .theme import ERA_COLORS, ERA_LABELS, INSTRUMENT_SHAPES, NODE_SIZES, ERA_FONT_SIZES
# All dicts removed from graph_builder.py; it becomes a pure builder.
```

### 5. `html_generator.py` injects `theme.js` first

```python
# html_generator.py — updated render_html()
from .theme import css_vars
from .graph_builder import INSTRUMENT_SHAPES  # ERA_COLORS now from theme

def render_html(...) -> str:
    # ...
    theme_js = _load("theme.js")

    # Generate :root {} from Python theme tokens (single source of truth)
    css_root_block = css_vars()

    # Inject into base.html — replace the hand-written :root block
    base = base.replace("/* INJECT_CSS_VARS */", css_root_block)

    script_block = "\n".join([
        "<script>",
        theme_js,      # ← FIRST: defines THEME global
        data_js,
        graph_view,
        media_player,
        timeline,
        raga_wheel,
        bani_flow,
        search,
        "</script>",
    ])
```

### 6. `graph_view.js` and `raga_wheel.js` replace raw hex with `THEME.*`

All raw hex literals in the Cytoscape style block and SVG construction calls are replaced with `THEME.*` references. Examples:

**`graph_view.js` Cytoscape style block:**
```js
// Before
'color':              '#ebdbb2',
'text-outline-color': '#1d2021',
'border-color':       '#665c54',

// After
'color':              THEME.labelColor,
'text-outline-color': THEME.labelOutline,
'border-color':       THEME.nodeDefault,
```

**`raga_wheel.js` SVG construction:**
```js
// Before
fill: '#1d2021', opacity: 0.72
fill: i === 0 ? '#ebdbb2' : '#a89984',
stroke: '#fabd2f', 'stroke-width': 2.5

// After
fill: THEME.labelOutline, opacity: 0.72
fill: i === 0 ? THEME.fg : THEME.fgMuted,
stroke: THEME.accentSelect, 'stroke-width': 2.5
```

---

## Consequences

### What this enables

- **Single-file theme change** — editing `carnatic/render/theme.py` (and its JS mirror `theme.js`) changes every visual property across all four registries simultaneously.
- **VS Code parity** — the token values above reproduce the VS Code Gruvbox Hard Dark appearance: deeper background (`#1d2021`), proportional UI font for chrome, bright yellow (`#fabd2f`) for selection vs dark yellow (`#d79921`) for accent.
- **Theme switching at runtime** — `THEME.set('bg', '#002b36')` (Solarized) would work without a rebuild, enabling future theme experimentation.
- **Testability** — `theme.py` can be unit-tested: assert that all era colours are valid hex, that contrast ratios meet WCAG AA, etc.
- **New views inherit automatically** — any future view (e.g. a notation panel) that references `THEME.*` gets the correct colours without any additional work.

### What this forecloses

- **Ad-hoc per-component colour overrides** — any colour that is not in `THEME` must be added there first. This is intentional: it prevents drift.
- **CSS-only theming** — because Cytoscape and SVG cannot read CSS custom properties directly, the JS `THEME` object is the authoritative runtime source. CSS custom properties are derived from it, not the other way around.

### Queries that become possible

- "What is the current background colour of the graph canvas?" → `THEME.bgDeep`
- "What colour does a node with recordings show?" → `THEME.nodeHasTracks`
- "What font does the UI chrome use?" → `THEME.fontUi`
- "Show me all colours used in the raga wheel" → `Object.values(THEME.cakra)`

---

## Implementation

### Files to create
| File | Agent | Action |
|---|---|---|
| `carnatic/render/theme.py` | Carnatic Coder | New file — Python token registry |
| `carnatic/render/templates/theme.js` | Carnatic Coder | New file — JS token registry (mirrors `theme.py`) |

### Files to modify
| File | Agent | Change |
|---|---|---|
| `carnatic/render/graph_builder.py` | Carnatic Coder | Remove `ERA_COLORS`, `ERA_LABELS`, `INSTRUMENT_SHAPES`, `NODE_SIZES`, `ERA_FONT_SIZES`; import from `theme.py` |
| `carnatic/render/html_generator.py` | Carnatic Coder | Import `css_vars()` from `theme.py`; inject `theme.js` first in script block; replace hand-written `:root {}` with `/* INJECT_CSS_VARS */` placeholder |
| `carnatic/render/templates/base.html` | Carnatic Coder | Replace `:root {}` block with `/* INJECT_CSS_VARS */`; rename all CSS vars to semantic names (`--bg-panel`, `--fg-muted`, `--accent`, etc.); change `body` font to `var(--font-ui)`; keep `var(--font-mono)` only on `#mi-pre`, `.timeline-ruler`, and graph canvas labels |
| `carnatic/render/templates/graph_view.js` | Carnatic Coder | Replace all raw hex literals and the duplicate `ERA_COLOURS` object with `THEME.*` references |
| `carnatic/render/templates/raga_wheel.js` | Carnatic Coder | Replace `CAKRA_COLORS` object and all ~25 raw hex literals in SVG attribute calls with `THEME.cakra[n]` and `THEME.*` references |

### Execution order

1. **Create `theme.py`** — the Python source of truth. All other changes depend on it.
2. **Create `theme.js`** — the JS mirror. Must be kept in sync with `theme.py` manually (or via a future code-generation step).
3. **Modify `graph_builder.py`** — import from `theme.py`. Run `bani-render` to confirm no regression.
4. **Modify `html_generator.py`** — inject `theme.js` first; use `css_vars()` for `:root {}`.
5. **Modify `base.html`** — rename CSS vars; change body font. Run `bani-render` and visually verify.
6. **Modify `graph_view.js`** — replace hex literals. Run `bani-render` and verify graph colours.
7. **Modify `raga_wheel.js`** — replace hex literals. Run `bani-render` and verify raga wheel colours.

### Acceptance criteria

- [ ] `grep -r '#[0-9a-fA-F]\{3,6\}' carnatic/render/templates/` returns zero results (all hex moved to `theme.js`)
- [ ] `grep -r '#[0-9a-fA-F]\{3,6\}' carnatic/render/graph_builder.py` returns zero results
- [ ] `grep -r "'Courier New'" carnatic/render/templates/base.html` returns zero results (font is `var(--font-mono)`)
- [ ] `bani-render` completes without error
- [ ] Visual comparison: Bani Flow background matches VS Code (`#1d2021` canvas, `#282828` main, `#3c3836` sidebars)
- [ ] Visual comparison: UI chrome (panel headers, sidebar labels, buttons) uses proportional sans-serif font
- [ ] Visual comparison: selected node border is `#fabd2f` (bright yellow), not `#d79921`
- [ ] `THEME.get('bgDeep')` returns `'#1d2021'` in browser console
- [ ] `THEME.set('bg', '#002b36')` changes the graph canvas background at runtime (smoke test for theme switching)

---

## Sync discipline — keeping `theme.py` and `theme.js` in sync

Until a code-generation step is implemented, the two files must be kept manually in sync. The rule is:

> **`theme.py` is the master.** When a token is added, changed, or removed in `theme.py`, the corresponding change must be made in `theme.js` in the same commit.

The Carnatic Coder must add a comment to both files:

```python
# theme.py — SYNC REQUIRED: any change here must be mirrored in theme.js
```

```js
// theme.js — SYNC REQUIRED: any change here must be mirrored in theme.py
```

A future ADR may introduce a code-generation step (e.g. `bani-render` generates `theme.js` from `theme.py` at build time), eliminating the manual sync requirement entirely.