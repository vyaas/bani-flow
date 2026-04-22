# ADR-074: Guru-Shishya Graph Label Chip Parity

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect
**Depends on**: ADR-028 (design tokens), ADR-054 (era-coloured musician chips), ADR-063 (uniform chip appearance)
**Related**: ADR-025 (cross-panel coupling), ADR-073 (raga wheel chip parity)

---

## Context

### The visual disjunction

The guru-shishya graph and the side panels both render the same first-class entity — the **musician** — but in two unrelated visual languages:

| Surface | Musician rendering |
|---|---|
| Left/right panels (per ADR-054, ADR-063) | Pill chip with **era-coloured left bar + era-tinted background fill + era-coloured border**, name in `var(--fg)`, instrument badge appended |
| Guru-shishya graph (current) | Era-coloured circle/diamond *node*, with a separate **plain text label** below it that uses `text-background-color: THEME.labelOutline` (uniform dark grey pill) and `text-outline-color: THEME.labelOutline`. The era colour is on the node geometry only, never on the label. |

The user's observation:

> "The same is true in the Guru-Shishya views: the fonts and coloring and bg boxes need to appear the same as what they do in the panels."

The label pill below `DK Pattammal` on the graph and the `DK Pattammal` chip in the right panel point to the *same* musician JSON object. Today they share neither colour, border, nor pill style — only the text content. This breaks visual identity across surfaces in exactly the way ADR-073 fixes for the raga wheel.

### Where the labels are styled

[`graph_view.js`](../carnatic/render/templates/graph_view.js) declares one Cytoscape style block for `selector: 'node'` ([graph_view.js:16](../carnatic/render/templates/graph_view.js)) that sets:

```js
'color':                  THEME.labelColor,        // P.fg
'text-outline-color':     THEME.labelOutline,      // P.bg_h — uniform dark
'text-outline-width':     '2px',
'text-background-color':  THEME.labelOutline,      // P.bg_h — uniform dark
'text-background-opacity': THEME.labelBgOpacity,   // 0.65
```

These are **literal values**, not data-bound. Every musician's label gets the same dark pill regardless of era. Meanwhile, the node fill (`'background-color': 'data(color)'`) and font size (`'data(font_size)'`) are already data-bound — the pattern for per-node label theming is already established; it just hasn't been applied to label colours.

The Python side ([`graph_builder.py`](../carnatic/render/graph_builder.py)) already injects per-node `color` (era colour) and `era` keys onto every musician node. To drive label tinting per-node, we add two new data fields on each node: `label_bg` (the era-tinted background) and `label_outline` (the era border colour). No schema change to the source JSON; this is rendering metadata derived during graph build.

---

## Forces

| Force | Direction |
|---|---|
| **Object identity across surfaces** | A musician's chip in the panel and their label on the graph should read as the same entity at a glance. Era colour is the existing identity carrier — extend it from the node body into the label. |
| **Don't lose the node geometry** | The era-coloured circle/diamond is the primary node affordance. The label sits *below* it. Tinting the label too strongly would create visual competition between node and label. The label's chip background should be *subtle* (low opacity), the border crisp. |
| **Cytoscape's label model** | Cytoscape labels do not support a separate border colour from outline colour at high fidelity, but they do support `text-background-color`, `text-background-opacity`, and `text-background-shape: roundrectangle`. This is enough to mimic the panel chip: era-tinted bg + era-coloured outline. |
| **Token-driven** | No new colour literals in `graph_view.js`. The era→colour mapping already lives in `THEME.era` and is mirrored on each node as `data(color)`. Compute `label_bg` and `label_outline` in `graph_builder.py` from the existing era colour. |
| **Selection / hover precedence** | The current `:selected`, `.hovered`, `.has-tracks`, `.bani-match` rules override `border-color` on the *node*, not the label. They remain unchanged. Per-node label theming via `data(...)` is independent of state classes. |
| **No regression on faded state** | The existing `.faded` (opacity 0.12) and `[is_listenable = 0]` (opacity 0.25, text-opacity 1.0) rules must continue to work. Per-node label colours don't interact with opacity — opacity multiplies whatever colour is set. |
| **Symmetry with raga wheel** | ADR-073 brings the wheel into chip parity for ragas/compositions. ADR-074 brings the graph into chip parity for musicians. The two ADRs together close the visual coupling loop named in ADR-025. |

---

## Pattern

**Same-thing-looks-same** (Nielsen): the musician chip in the panel and the musician label on the graph carry the same identity; therefore the same visual encoding.

**Levels of Scale**: era colour is the identity axis. It already paints the node body. Extending it into the label is a level-of-scale extension, not a new visual axis. The user learns one rule (era → colour) and applies it everywhere.

**Strong Centres preserved at multiple scales**: the node is a strong centre at the geometric scale; the label becomes a chip-like strong centre at the text scale. Both reference the same era colour. The composition reads as a single entity, not two unrelated marks.

---

## Decision

### 1. Inject per-node label tokens in `graph_builder.py`

Where each musician node currently gets `color` (era colour), also compute and attach:

```python
# In graph_builder.py, where a musician node dict is assembled:
era_color = ERA_COLORS[era]                   # existing — node fill
node['data']['color']         = era_color
node['data']['label_outline'] = era_color     # NEW — chip-like outline
node['data']['label_bg']      = era_color     # NEW — same hue, low-opacity in CSS layer
```

Both `label_outline` and `label_bg` carry the *solid* era colour. Cytoscape's `text-background-opacity` (set to a small value like 0.18) handles the tinting at render time — equivalent to `color-mix(... 18%, transparent)` in the panel CSS. This avoids needing to compute colour-mix in Python.

For non-musician nodes (raga, composition, mela — if any appear as graph nodes), `label_outline` and `label_bg` should fall back to the existing dark `THEME.labelOutline` so they retain today's appearance. Use `node.get('era')` as the discriminator (musicians have an era; ragas do not).

### 2. Wire data-bound label styling in `graph_view.js`

Change the `node` style block ([graph_view.js:16](../carnatic/render/templates/graph_view.js)):

```js
{
  selector: 'node',
  style: {
    // ... existing fill, shape, size, label, font ...
    'color':                   THEME.labelColor,
    'text-outline-color':      'data(label_outline)',     // was THEME.labelOutline
    'text-outline-width':      '2px',
    'text-background-color':   'data(label_bg)',          // was THEME.labelOutline
    'text-background-opacity': 0.18,                       // was THEME.labelBgOpacity (0.65)
    'text-background-padding': '3px',
    'text-background-shape':   'roundrectangle',
    // ... existing border, etc ...
  }
},
```

The opacity change from `0.65` to `0.18` is intentional: at 0.65 a teal/amber/orange tint would dominate; at ~0.18 it reads as a subtle wash, matching the panel chip's `color-mix(... 12%, transparent)` look at SVG fidelity.

### 3. State-class label overrides (optional, low priority)

`:selected` could brighten the label outline by switching `text-outline-color` to `THEME.nodeSelected`. **Defer to a follow-up ADR** — the current selection signal (3px node border) is already strong; adding label-outline emphasis risks visual noise. This ADR keeps state-class selectors untouched.

### 4. Fallback for nodes without `era`

In the Python builder, when `era` is absent or unknown:

```python
node['data']['label_outline'] = THEME_LABEL_OUTLINE   # P.bg_h, the dark legacy value
node['data']['label_bg']      = THEME_LABEL_OUTLINE
```

The Cytoscape style block remains data-bound; non-musician nodes simply receive the dark fallback and look unchanged from today.

---

## Consequences

### Positive
- The musician's label on the guru-shishya graph reads as the same chip a user just clicked in the panel. Visual identity across surfaces is preserved.
- Era colour now operates at two scales on the same node — geometry (fill) and label (tint + outline) — reinforcing the era as the primary identity axis.
- All theming remains token-driven through `THEME.era` and the per-node `data()` field. ADR-028's single-source-of-truth is preserved.
- Drop-in change to two files; no new dependencies, no schema change to source JSON.

### Negative / Trade-offs
- The graph becomes visibly more colourful. Era differentiation, today only at the node-fill scale, now extends to the labels — which means a graph with many eras becomes a more saturated picture. This is the intended outcome but represents a perceptible shift from today's restrained label palette.
- The `text-background-opacity` change from 0.65 to 0.18 means the label *background* contributes less occlusion of edges passing under labels. Edges may show through label backgrounds slightly more than before. The `text-outline-width: 2px` (era-coloured) preserves legibility against any colour underneath.
- Two new fields on every musician node in the Cytoscape `elements` payload. Trivial size increase (~30 bytes/node, ~10 KB total at current scale).

### Out of scope
- Selection/hover label-state overrides (defer)
- Era colour extension into the panel `:hover` state on chips (already handled by the `filter: brightness(1.15)` rule in ADR-063)
- Composer-edge label tinting (composer chips are panel-only; no graph rendering yet)
- Raga and composition nodes on the guru-shishya graph (not currently rendered there; if added later they'd use chip-token tints, mirroring ADR-073)

---

## Implementation

**Carnatic Coder owns**:
- [`carnatic/render/graph_builder.py`](../carnatic/render/graph_builder.py) — emit `label_outline` and `label_bg` per musician node from the era colour; emit dark fallback for non-musician nodes.
- [`carnatic/render/templates/graph_view.js`](../carnatic/render/templates/graph_view.js) — switch `text-outline-color` and `text-background-color` to `data(...)` references; lower `text-background-opacity` to ~0.18.

**Verification**:
1. Run `bani-render` and open `carnatic/graph.html`.
2. Switch to the **Guru-Shishya** view.
3. For a musician of each era (trinity, bridge, golden_age, disseminator, contemporary), confirm the label pill below the node carries the **same era tint and outline** as that musician's panel chip.
4. Click the musician to open the right panel. Visually compare the panel chip and the graph label — they should read as the same entity.
5. Confirm `:selected`, `.hovered`, `.has-tracks`, `.bani-match`, `.faded`, and `[is_listenable = 0]` all still produce their original visual states (era-tinted labels are independent of these classes).
6. Run `python3 carnatic/cli.py validate` — no data changes, but sanity-check that the graph still loads.
