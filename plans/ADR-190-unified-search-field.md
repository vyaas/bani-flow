# ADR-190 — The Unified Search Field (one shell, three scopes)

**Status**: Accepted (user directive 2026-10-22)
**Date**: 2026-10-22
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-072 (search-subject prominence),
ADR-128 (panel components), ADR-174 (UI surface map), ADR-184 (grand track
search), ADR-178 (panel content filters).
**Scope**: `carnatic/render/templates/base.html`,
`carnatic/render/templates/search.js`, `carnatic/render/theme.py`,
`carnatic/render/templates/theme.js`, UIMAP §1 / §2 / §5.

---

## Context

The app has three search bars: the grand track search at the top of the
viewport (ADR-184), the bani-flow search, and the musician-panel search. They
are the same interaction at different reach — type a name, pick from a
dropdown — but they looked unrelated:

* the grand bar was a bordered container wrapping a *second* bordered input
  (double frame), 4px radius inside 6px radius, a `&#9906;` glyph, italic
  placeholder at 0.78rem;
* each panel search was a bare input with a 2px radius, an emoji `🔍` baked
  into the placeholder string, italic placeholder at 0.72rem.

Users had to learn three visual languages for one affordance, and neither the
glyph nor the frame said "these three are siblings".

## Decision

### D1 — One shell component, `.search-field`

`#search-bar` (grand) and the inner wrapper of `#bani-search-wrap` /
`#musician-search-wrap` are all `.search-field`. The shell owns every visual
property: a raised surface (`--search-bg` = `bg0` over the `bg_h` panel/canvas),
a hairline frame (`--search-border`), `--search-radius` (8px),
`--search-height` (32px), and the accent ring on `:focus-within`
(`--search-ring`). The `<input>` inside is transparent and borderless. A
search bar is the shell; the input is never a bordered box again.

The grand bar overrides only *reach*: fixed placement, full column width, a
taller dropdown cap, and a drop shadow (it floats over the canvas). The panel
shells override only the inset (`.panel-search-wrap` padding). Width and
result set are the only legitimate differences.

### D2 — One glyph, no emoji

`#icon-search` in the inline sprite is the single magnifier, referenced by
`<use>` from all three shells. It is `currentColor`, muted at rest and accent
when the field has focus. The `🔍` emoji is removed from both panel
placeholders: an emoji renders differently on every OS and cannot take the
focus colour.

### D3 — Shared clear affordance

Every shell carries `.search-clear` (✕), revealed by
`:has(.search-input:not(:placeholder-shown))`. `search.js` installs one
delegated click handler that clears the value, dispatches a real `input` event
(so each module's own listener closes or re-renders its dropdown), and refocuses
the field. No per-module wiring.

### D4 — Tokens, not literals

All new values live in `theme.py` / `theme.js` (`searchFieldBg`,
`searchFieldBorder`, `searchFieldRadius`, `searchFieldHeight`,
`searchFieldRing`) and reach CSS as `--search-*`. The accent ring is a
`color-mix` of the theme yellow, so a future theme restyles the field without
touching `base.html`.

### D5 — Placeholders name the scope, sentence case

`Search raga or composition`, `Search musician or composer`,
`Search musicians, ragas, compositions, recordings`. Same verb, same voice; the
noun phrase is the only thing that changes — which is exactly the relationship
the shared shell now advertises.

## Consequences

* A new search surface must be a `.search-field` with a `#icon-search` glyph,
  a `.search-input`, and a `.search-clear`; it inherits the full contract.
* Dropdowns anchor to the shell (`position: relative`), sit 4px below it, and
  share the 8px radius, so the result pane reads as the field unfolding.
* `test_grand_search_editor.py`'s top-band geometry assertions are unaffected
  (the bar's fixed placement is untouched).
* The emoji placeholders are gone from the rendered HTML; nothing reads them.

## Alternatives considered

* **Pill (fully rounded) fields** — rejected: the panel is a dense ribbon UI
  already using 5–6px radii on chips; a pill would read as a button and break
  the row geometry.
* **Flush dropdowns (no gap, square bottom corners)** — rejected: attached
  panes read as old-style autocomplete; the 4px gap + full radius makes the
  dropdown a distinct, modern sheet.
* **Per-module clear buttons** — rejected: three copies of the same five lines
  is how the three bars drifted apart in the first place.
