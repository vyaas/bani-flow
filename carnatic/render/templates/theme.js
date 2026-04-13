// carnatic/render/templates/theme.js
// ── Bani Flow Design Tokens ────────────────────────────────────────────────
// Single source of truth for all visual properties.
// Edit ONLY this file to change the theme.
// Implements: Gruvbox Hard Dark (matches VS Code Gruvbox theme).
//
// SYNC REQUIRED: any change here must be mirrored in theme.py
//
// Implements ADR-028: Design Token Single Source of Truth.
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
    nodeDefault:   P.bg3,           // default node border
    nodeHasTracks: P.aqua,          // node with recordings (green border)
    nodeHovered:   P.yellow,        // hovered node
    nodeSelected:  P.fg,            // selected node (bright fg)
    nodeBaniMatch: P.blueBright,    // bani-match node

    // Edge colours
    edgeLine:      P.bg2,           // default edge line
    edgeArrow:     P.bg3,           // default edge arrow
    edgeHighlight: P.yellow,        // highlighted edge (bani filter)

    // Text on graph canvas
    labelColor:      P.fg,          // node label text
    labelOutline:    P.bg_h,        // node label text outline / bg
    labelBgOpacity:  0.65,

    // Opacity states
    opacityFaded: 0.12,             // faded elements during bani filter
    opacityEdge:  0.75,             // default edge opacity

    // ── Level 2: Typography ────────────────────────────────────────────────
    // VS Code uses proportional sans-serif for UI chrome,
    // monospace only for code/data content.
    fontUi:       "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontMono:     "'Courier New', monospace",
    fontSizeBase: '0.78rem',
    fontSizeSm:   '0.72rem',
    fontSizeXs:   '0.68rem',
    fontSizeLg:   '0.85rem',
    fontSizeH3:   '0.70rem',        // panel section headers (uppercase)
  };

  // ── Level 2: Era colours (node fill colours) ──────────────────────────────
  // These are the semantic era→colour mappings used by both Python (graph_builder)
  // and JS (graph_view, raga_wheel). The Python side reads from theme.py;
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
        '--bg-deep':       tokens.bgDeep,
        '--bg':            tokens.bg,
        '--bg-panel':      tokens.bgPanel,
        '--bg-input':      tokens.bgInput,
        '--bg-hover':      tokens.bgHover,
        '--bg-active':     tokens.bgActive,
        '--fg':            tokens.fg,
        '--fg-sub':        tokens.fgSub,
        '--fg-dim':        tokens.fgDim,
        '--fg-muted':      tokens.fgMuted,
        '--border':        tokens.border,
        '--border-strong': tokens.borderStrong,
        '--accent':        tokens.accent,
        '--accent-sub':    tokens.accentSub,
        '--accent-link':   tokens.accentLink,
        '--accent-warn':   tokens.accentWarn,
        '--accent-danger': tokens.accentDanger,
        '--accent-select': tokens.accentSelect,
        '--accent-match':  tokens.accentMatch,
        '--font-ui':       tokens.fontUi,
        '--font-mono':     tokens.fontMono,
      };
      return Object.entries(map)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n');
    }
  };
})();
