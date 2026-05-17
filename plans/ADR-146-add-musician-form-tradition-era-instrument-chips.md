# ADR-146 — Add Musician Form: Tradition Multi-Select, Per-Color Chips, Era/Instrument Chip Selectors

**Status**: Accepted
**Date**: 2026-05-17
**Author**: Graph Architect
**Depends on**: ADR-054 (era tint chips), ADR-115 (multi-tradition data model), ADR-145 (musician form redesign), ADR-127 (chip vocabulary)
**Amends**: ADR-145 D2 (tradition toggle — radio → independent multi-select)

---

## Context

Three independent usability issues in `buildMusicianForm()` that share a common root: the form's
visual controls do not correspond to the semantic representation already used in the guru-shishya
graph view. A user filling in the form has no preview of what the node will look like; these
changes close that loop.

### Issue 1 — Tradition is either/or when the data model allows both

The tradition toggle implemented in ADR-145 §D2 behaves like a radio button: clicking Hindustani
deactivates Carnatic and vice versa. But the data model (`traditions` field, per ADR-115) already
supports `["carnatic","hindustani"]` for cross-tradition musicians (e.g. Bismillah Khan).

Worse, `generateMusicianJson` never serializes `traditions` at all — the hidden input
`#ef_mus_tradition` is set but never read into `nodeJson`. Every musician added via the form
is written without a `traditions` field, relying on the `["carnatic"]` backward-compat default
in the reader rather than expressing intent explicitly.

### Issue 2 — Tradition chips use the wrong active color

Both active states currently use `--accent` (gold `#d79921`), which is the composition-chip color.
The correct visual correspondence — matching every other chip in the UI — is:

- **Carnatic** → teal, matching `--chip-raga-border` (`#6ec6a8`) — the Carnatic raga chip accent
- **Hindustani** → cool blue, matching `--her-chip-accent` (`#8fb4d8`) — the HER raga chip accent

### Issue 3 — Era and Instrument are `<select>` dropdowns, not chips

In the graph view, eras are communicated via a colored 3px left-bar accent on musician chips.
Instruments are communicated via outline SVG glyphs. Both are well-established visual semantics —
but the Add Musician form breaks the correspondence by using unstyled `<select>` dropdowns. A user
selecting "golden_age" from a dropdown has no idea it means a blue left-bar on the node they are
creating. Making era and instrument selectable as chips — using the same colors and shapes as the
graph — closes the loop between form input and graph output.

---

## Decision

### D1 — Tradition: independent multi-select chips (both can be active simultaneously)

Replace the radio-toggle click listener with independent `classList.toggle('ef-trad-chip--active')`.
At-least-one guard: if both chips are deselected, snap Carnatic back to active (matches the
`["carnatic"]` default). Remove the hidden `#ef_mus_tradition` input; `generateMusicianJson`
now collects `traditions` directly from active chips.

**nodeJson before (ADR-145 era):**
```json
{ "id": "x", "era": "trinity", "instrument": "vocal" }
```

**nodeJson after (ADR-146):**
```json
{ "id": "x", "era": "trinity", "instrument": "vocal", "traditions": ["carnatic"] }
```

```json
{ "id": "x", "era": "golden_age", "instrument": "sitar", "traditions": ["carnatic", "hindustani"] }
```

### D2 — Tradition chips: per-tradition active colors

Override the generic `--accent` active state with per-`[data-trad]` rules:

```css
/* Carnatic active → teal (matches Carnatic raga chip) */
.ef-trad-chip[data-trad="carnatic"].ef-trad-chip--active {
  border-color: var(--chip-raga-border);
  background: color-mix(in srgb, var(--chip-raga-border) 18%, transparent);
  color: var(--chip-raga-border);
}

/* Hindustani active → blue (matches HER raga chip accent) */
.ef-trad-chip[data-trad="hindustani"].ef-trad-chip--active {
  border-color: var(--her-chip-accent);
  background: color-mix(in srgb, var(--her-chip-accent) 18%, transparent);
  color: var(--her-chip-accent);
}
```

### D3 — Era: chip row replacing `<select>`

Six `.ef-era-chip` buttons, one per era. Each chip carries `--ef-era-chip-color` (set inline from
`THEME.era[eraId]`), which drives:

- **Inactive**: 1px solid `var(--border)` border (left-bar same as rest), muted text
- **Hover**: border and text shift to `var(--ef-era-chip-color)`
- **Active**: 3px left-bar + translucent 13% fill + border all from `var(--ef-era-chip-color)`
  — mirrors the exact `.musician-chip` era-tint pattern from ADR-054

A hidden `#ef_mus_era` input is kept and updated on click so `generateMusicianJson` is unchanged
for era serialization.

Era labels: Trinity, Bridge, Golden Age, Disseminators, Living Pillars, Contemporary.
Default: first chip (Trinity) active.

### D4 — Instrument: chip row replacing `<select>`

Eight `.ef-instr-chip` buttons (vocal, veena, violin, flute, mridangam, bharatanatyam, ghatam,
other). Each chip embeds the instrument's SVG outline glyph via the existing `makeInstrBadge()`
function from `graph_view.js` (already globally available in `graph.html`). The active SVG
stroke inherits `currentColor` so it shifts with the active chip color.

A hidden `#ef_mus_instr` input is kept and updated on click so `generateMusicianJson` is
unchanged for instrument serialization.

Active state uses `--accent-sub` (aqua) — a neutral accent that does not claim per-instrument
semantic color (instruments have shape, not color, as their semantic encoding).

---

## Consequences

- **Positive**: Form visually previews the era color a node will carry in the graph.
- **Positive**: Form uses the same instrument glyphs the graph uses — shape = instrument.
- **Positive**: Cross-tradition musicians can be correctly flagged at intake.
- **Positive**: `traditions` is now serialized on every Add Musician operation; no more silent
  reliance on reader-side defaults.
- **Neutral**: Era chips wrap on narrow windows — acceptable; `ef-era-trad-row` already has
  `flex-wrap: wrap`.
- **Neutral**: `generateMusicianJson` gains one new field (`traditions`); downstream `bani-add`
  already handles it per ADR-115.
- **No data-model change**: `traditions` array already exists and is validated per ADR-115.

---

## Implementation

Changed files:
- `carnatic/render/templates/base.html` — CSS additions for D2 (per-trad colors), D3 (era chips),
  D4 (instrument chips)
- `carnatic/render/templates/entry_forms.js` — `buildMusicianForm()` era+tradition+instrument
  block replacement; `generateMusicianJson()` adds `traditions` to `nodeJson`

[AGENTS: graph-architect, carnatic-coder]
