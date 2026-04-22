# ADR-069: Instrument Badge on Musician Chips

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-054 (era-coloured musician chips), ADR-063 (uniform chip appearance), ADR-066 (player tag completeness)

---

## Context

### The instrument identification problem

Every musician chip currently shows a name and an era-tinted left border — but no instrument indicator. When the rasika sees "M. S. Subbulakshmi" in the Bani Flow trail or the media player, they recognise her. When they see "Lalgudi Jayaraman" alongside "T. N. Krishnan" in a concert bracket, they know both are violinists — but only if they already know. A newcomer or a casual listener will not.

The graph view encodes instrument information in node *shape* (circle = vocal, diamond = veena, square = violin, triangle = flute, barrel = mridangam). But:
1. Panel content is detached from the graph — the panels do not show shapes.
2. On mobile the graph is small and node shapes are hard to distinguish at distance.
3. The Bani Flow trail and media player are the primary listening surfaces — they present musicians stripped of the visual vocabulary that the graph axis uses.

The instrument shape vocabulary already exists as SVG icons (`makeShapeSVG()` in `graph_view.js`). The same icons appear in the filter bar (ADR-008). Reusing them as inline badges inside musician chips closes the visual gap between the graph vocabulary and the panel vocabulary.

### Forces

| Force | Direction |
|---|---|
| **Immediate identification** | The rasika should know an artist's instrument from the chip alone, without referencing the graph |
| **Visual vocabulary reuse** | The shape-per-instrument system is already established in graph nodes and filter chips — reinforce it, do not invent a new encoding |
| **Minimal footprint** | The badge must be small enough not to dominate the musician name — a 12–14 px icon, same as filter-chip icons |
| **All panels** | The badge must appear wherever musician chips are rendered: right sidebar header, Bani Flow trail, media player artist chip, concert bracket co-performers |
| **No data change** | Every musician node already has an `instrument` field in `graphData` — no schema change required |
| **Performance** | `makeShapeSVG()` (or an equivalent) is already called per node on page load — calling it per chip is negligible |

---

## Pattern

**Strong Centres**: every musician chip becomes a self-contained centre of musical identity — name + era colour + instrument shape. The rasika can decode who someone is without any cross-referencing.

**Levels of Scale**: the small instrument badge reads at the chip level; the chip reads at the panel level; the panel reads at the graph level. Each level carries the same vocabulary so no translation is needed when moving between levels.

---

## Decision

### 1 — Badge anatomy

A small inline SVG icon prepended inside the `.musician-chip`, before the text:

```html
<!-- BEFORE -->
<span class="musician-chip" style="...">Lalgudi Jayaraman</span>

<!-- AFTER -->
<span class="musician-chip" style="...">
  <span class="chip-instr-icon" aria-hidden="true">
    <!-- inline SVG: square (violin shape), 13×13 -->
  </span>
  Lalgudi Jayaraman
</span>
```

- The icon is a `<span class="chip-instr-icon">` wrapping an inline SVG produced by `makeShapeSVG(instrumentShape, 13)`.
- `aria-hidden="true"` — the instrument information is conveyed visually only; screen-reader label is carried by the chip's `title` attribute (already present or to be added).
- The icon uses `stroke: currentColor` so it inherits the chip's active/hover colour states automatically.

### 2 — Badge size and positioning

```css
.chip-instr-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  opacity: 0.75;          /* slightly subdued — name is primary */
}
.chip-instr-icon svg {
  width: 100%;
  height: 100%;
}
/* On secondary (smaller) chips */
.chip-secondary .chip-instr-icon {
  width: 11px;
  height: 11px;
}
```

- `opacity: 0.75` keeps the icon visually subordinate to the name while still readable.
- The icon inherits `color` from the chip, so era-colour hover states apply consistently.

### 3 — Affected surfaces (all musician chip construction sites)

| Location | File | Build function | Instrument source |
|---|---|---|---|
| Right sidebar node header | `graph_view.js` | `showNodePanel()` | `d.instrument` (node data) |
| Bani Flow trail co-performers | `bani_flow.js` | `buildArtistSpan()` | `cy.getElementById(artistRow.nodeId).data('instrument')` |
| Media player title bar | `media_player.js` | `buildPlayerBar()` | `meta.instrument` (recording metadata) |
| Concert bracket co-performers | `media_player.js` | concert bracket builder | performer node `data('instrument')` |

For all four sites, the pattern is the same:

```javascript
// 1. Resolve the instrument key
const instrKey = /* d.instrument | meta.instrument | node.data('instrument') */;
const instrShape = INSTRUMENT_SHAPES[instrKey] || 'ellipse';

// 2. Build the badge
const instrBadge = document.createElement('span');
instrBadge.className = 'chip-instr-icon';
instrBadge.setAttribute('aria-hidden', 'true');
instrBadge.appendChild(makeShapeSVG(instrShape, 13));

// 3. Prepend to chip — before textContent
chip.appendChild(instrBadge);
chip.appendChild(document.createTextNode(label));
```

Note: where chips currently set `chip.textContent = label` directly, this must be changed to `chip.appendChild(document.createTextNode(label))` so the SVG is not overwritten.

### 4 — `makeShapeSVG` availability

`makeShapeSVG()` is currently defined only in `graph_view.js`. All four construction sites must have access to it. Two options:

- **Option A (preferred)**: Move `makeShapeSVG()` and `INSTRUMENT_SHAPES` to `base.html` (in a `<script>` block that runs before the other templates are evaluated) so all template scripts share it as a global.
- **Option B**: Duplicate the function in each template file that needs it.

Option A is preferred — it matches the existing pattern for `THEME`, `ERA_COLOURS`, and other shared globals defined in `base.html`.

### 5 — `title` attribute for screen readers

When constructing the chip, add or update the `title` attribute to include the instrument:

```javascript
chip.title = `${label} (${instrKey || 'unknown'})`;
```

This costs nothing and gives keyboard/screen-reader users the same information.

---

## Consequences

### Positive
- Every musician chip is self-contained: name + era colour + instrument shape = complete identity signal.
- The instrument shape vocabulary (already present in graph nodes and filter chips) is reinforced across all panels.
- No new data fetching — all musician nodes already have `instrument` in their data payload.
- Works on all panel surfaces without changing the rendering architecture.

### Negative / Trade-offs
- Chips are very slightly wider (by ~17 px: 13 px icon + 4 px gap). On small mobile screens, long musician names in the player may wrap one word to a new line — acceptable: the name still reads clearly.
- `makeShapeSVG()` and `INSTRUMENT_SHAPES` must be hoisted to a shared scope (Option A). This is a minor refactor inside `base.html`.

### Files to change (Carnatic Coder)
| File | Change |
|---|---|
| `carnatic/render/templates/base.html` | Hoist `makeShapeSVG()` and `INSTRUMENT_SHAPES` constant to shared `<script>` block; add `.chip-instr-icon` CSS |
| `carnatic/render/templates/graph_view.js` | Add instrument badge in `showNodePanel()`; remove `makeShapeSVG()` / `INSTRUMENT_SHAPES` (now in base.html) |
| `carnatic/render/templates/bani_flow.js` | Add instrument badge in `buildArtistSpan()` |
| `carnatic/render/templates/media_player.js` | Add instrument badge in `buildPlayerBar()` and concert bracket builder |

---

## Implementation notes for Carnatic Coder

1. Hoist `makeShapeSVG()` and `INSTRUMENT_SHAPES` **before** any template-specific JS is evaluated in base.html.
2. Where `chip.textContent = label` is used today, replace with the two-step append pattern (badge node + text node) to avoid overwriting the SVG.
3. For the Bani Flow trail, `artistRow.nodeId` may be `null` for unmatched performers — in that case, omit the badge (instrument is unknown for unlinked names).
4. For the media player, `meta.instrument` should already be populated from the recording's `musician_id` → node lookup. If not found, omit the badge.
5. The `chip-secondary` size override (11 px icon) should be in the shared CSS block in `base.html`, not per-template.
