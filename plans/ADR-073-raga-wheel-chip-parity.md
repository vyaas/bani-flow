# ADR-073: Raga Wheel Label Chip Parity

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect
**Depends on**: ADR-028 (design tokens), ADR-063 (uniform chip appearance), ADR-023 (raga wheel)
**Related**: ADR-025 (cross-panel coupling), ADR-074 (guru-shishya label chip parity)

---

## Context

### The visual disjunction

The raga wheel and the side panels both expose the same first-class entities — ragas (mela, janya) and compositions — but render them in **two unrelated visual languages**:

| Surface | Raga rendering | Composition rendering |
|---|---|---|
| Left/right panels (per ADR-063) | Teal-bordered chip with teal-tinted fill, teal text, ◈ glyph | Amber-bordered chip with amber-tinted fill, amber text, ♩ glyph |
| Raga wheel (current) | Plain `var(--fg-sub)` text on a dark `THEME.labelOutline` pill (`P.bg_h` at 0.72 opacity) | Plain `var(--fg-sub)` text on the same dark pill |

The user's observation:

> "The fonts for ragas and compositions in the panels are different from those on the wheel. These need to be made the same... This establishes the fact that the same data is being re-represented, reassuring the user that they are interacting with the same objects."

The chip on the panel and the satellite label on the wheel point to the *same* JSON object. Their visual divergence breaks the user's mental model of object identity — the panel's `Bhairavi` chip and the wheel's `Bhairavi` label appear to be different things.

### Where the labels are rendered

[`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js) defines a single helper `_labelWithBg(layer, text, cx, cy, fontSize, extraAttrs, clickHandler)` that renders every satellite label as `<rect fill={THEME.labelOutline} opacity={0.72}>` + `<text fill={attrs.fill}>`. Three call sites distinguish the type via `extraAttrs.class`:

- `sat-label-mela` — mela name labels around the wheel rim ([raga_wheel.js:1349](../carnatic/render/templates/raga_wheel.js))
- `sat-label-janya` — janya names emanating from a selected mela ([raga_wheel.js:1077](../carnatic/render/templates/raga_wheel.js))
- `sat-label-comp` — composition titles emanating from a selected raga ([raga_wheel.js:1150](../carnatic/render/templates/raga_wheel.js))

The class hook is already in place. The fill colour on the inner `<rect>` is the only thing tying every label to the same dark pill.

---

## Forces

| Force | Direction |
|---|---|
| **Object identity across surfaces** | If the user clicks a `Bhairavi` chip in the panel and then sees `Bhairavi` on the wheel, both should read as the *same* visual entity. Same colour, same border, same glyph, same chip shape. |
| **Cakra colour coherence on the wheel** | The wheel's mela rim sectors are coloured by cakra (per ADR-023). Stamping a teal chip on top of every mela label would over-paint the cakra colour and break the existing colour wayfinding. *Mela* labels are exempt from the chip treatment for this reason — they are geographic markers on the wheel, not free-standing entity chips. |
| **SVG vs HTML rendering** | Wheel labels are SVG (`<rect>`+`<text>`), not HTML. They cannot inherit `.raga-chip`/`.comp-chip` CSS rules directly. The chip *tokens* (`--chip-raga-border`, `--chip-raga-bg`, `--chip-comp-border`, `--chip-comp-bg`) must be readable from JS via `getComputedStyle(documentElement)` and threaded into SVG attributes. |
| **Token-driven** | No new colour literals in `raga_wheel.js`. Reuse the tokens ADR-063 already established. A future theme swap should retint the wheel automatically. |
| **Glyph affordance** | Panel chips carry ◈ (raga) and ♩ (composition) prefix glyphs. SVG `<text>` can prepend the same Unicode glyphs without measuring text width separately — the glyph is just one more character. |
| **Hit-target preservation** | The pill `<rect>` is currently the click target (per the `clickHandler` argument to `_labelWithBg`). The new chip rect must remain the same size and remain a pointer target. Visual changes only — no geometry change. |
| **Legibility on cakra-coloured sectors** | Teal/amber chips will sometimes sit atop coloured mela sectors. The chip background uses `color-mix(...12%, transparent)` which is too transparent to occlude the sector colour. Solution: keep the chip background slightly opaque (use the *solid* equivalent of the chip-bg token, computed once per draw, not the transparent variant) so the chip reads as a chip even over a coloured sector. |

---

## Pattern

**Strong Centres** (Alexander): a chip is a strong centre — bordered, filled, identifiable. The current wheel labels are weak centres: they fade into the dark pill background. Promoting them to chips gives each raga and composition presence on the wheel.

**Same-thing-looks-same** (Nielsen consistency heuristic): the panel chip and the wheel label point to the same JSON object; therefore they should look the same.

**Levels of Scale**: type encoded by colour (teal = raga, amber = composition), shape and geometry shared. The wheel inherits the panel's encoding rather than inventing a parallel one.

---

## Decision

### 1. Add chip-token JS bridge

In [`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js), at the top of the IIFE block, read the chip tokens from `:root` once per `drawRagaWheel()` call:

```js
function _readChipTokens() {
  const cs = getComputedStyle(document.documentElement);
  return {
    ragaBorder: cs.getPropertyValue('--chip-raga-border').trim() || '#6ec6a8',
    ragaBg:     cs.getPropertyValue('--chip-raga-border').trim() || '#6ec6a8', // solid for SVG
    compBorder: cs.getPropertyValue('--chip-comp-border').trim() || '#d79921',
    compBg:     cs.getPropertyValue('--chip-comp-border').trim() || '#d79921',
    radius:     parseFloat(cs.getPropertyValue('--chip-border-radius')) || 4,
  };
}
```

The `--chip-*-bg` tokens use `color-mix()` which `getComputedStyle` returns as a `color-mix(...)` literal in some engines. Use the solid border colour as the *base* for the SVG rect fill at low opacity (12%) instead — this avoids `color-mix` parsing issues in the SVG attribute path while preserving the same on-screen tint.

### 2. Extend `_labelWithBg` to accept a chip variant

Change the signature to accept an optional `chipVariant` field on `extraAttrs`:

```js
function _labelWithBg(layer, text, cx, cy, fontSize, extraAttrs, clickHandler) {
  // chipVariant: 'raga' | 'comp' | undefined (default = legacy dark pill)
  const variant = extraAttrs && extraAttrs.chipVariant;
  // ... existing geometry calculation ...

  let fillColor   = THEME.labelOutline;   // legacy default
  let fillOpacity = 0.72;
  let strokeColor = 'none';
  let strokeWidth = 0;
  let textColor   = (extraAttrs && extraAttrs.fill) || THEME.fg;
  let glyph       = '';

  if (variant === 'raga' || variant === 'comp') {
    const tok = _readChipTokens();
    const base = variant === 'raga' ? tok.ragaBorder : tok.compBorder;
    fillColor   = base;
    fillOpacity = 0.18;          // matches ~12% color-mix tint, slightly opaque for SVG
    strokeColor = base;
    strokeWidth = 1;
    textColor   = base;
    glyph       = variant === 'raga' ? '◈\u00a0' : '♩\u00a0';
  }
  // ... build rect with fillColor/fillOpacity/strokeColor/strokeWidth ...
  // ... build text with textColor; prepend glyph to text content ...
}
```

The text width estimate must include the glyph (one extra character). The `chipVariant` field is stripped from the `textAttrs` object so it does not leak as an SVG attribute.

### 3. Wire variants at call sites

| Call site | Variant | Notes |
|---|---|---|
| `sat-label-comp` ([raga_wheel.js:1150](../carnatic/render/templates/raga_wheel.js)) | `'comp'` | Composition titles around a selected raga |
| `sat-label-janya` ([raga_wheel.js:1077](../carnatic/render/templates/raga_wheel.js)) | `'raga'` | Janya names around a selected mela |
| `sat-label-mela` ([raga_wheel.js:1349](../carnatic/render/templates/raga_wheel.js)) | **unchanged** (legacy dark pill) | Mela names sit on cakra-coloured sectors; chip would fight the cakra colour |
| Wheel tooltip ([raga_wheel.js:300](../carnatic/render/templates/raga_wheel.js)) | unchanged | Tooltip is a different idiom |
| Empty-state placeholders ("no compositions", etc.) | unchanged | Not real chips |

### 4. Selected / hover state on wheel chips

The wheel currently raises label opacity / weight on selection by re-drawing on `applyBaniFilter`. No new state machine is required — the existing redraw path will pick up chip styling automatically. If a future iteration wants a brighter chip border on the *currently played* item, that can be handled by passing `chipVariant: 'comp-active'` and a third token (`--chip-comp-border-bright`) — out of scope for this ADR.

---

## Consequences

### Positive
- A `Bhairavi` chip on the panel and a `Bhairavi` label on the wheel are visually identical. Object identity is preserved across surfaces.
- The wheel becomes legible as a chip surface, not a captioned diagram. The user can tap a chip on the wheel with the same affordance learned in the panel.
- All chip styling remains token-driven. ADR-028's single-source-of-truth principle is preserved.
- No changes to wheel layout, geometry, or interaction — drop-in visual replacement.

### Negative / Trade-offs
- The wheel becomes more colour-saturated (teal + amber chips alongside cakra-coloured mela sectors). This is the intended outcome — colour now carries entity-type meaning at every scale — but it is a noticeable visual shift from the current restrained palette.
- `getComputedStyle` is called once per `drawRagaWheel()` invocation. This is cheap and only runs on user-initiated wheel redraws.
- Mela labels remain on the legacy dark pill. This is a deliberate exception (cakra colour preservation) and should be documented in the implementation comment.

### Out of scope
- Chip styling on the cakra rim sectors themselves (the rim is the wheel's own colour vocabulary)
- Active-track chip variant (player coupling — handled by ADR-025/ADR-026)
- HTML-based chip rendering inside SVG via `<foreignObject>` (rejected: SVG-native rendering is simpler and avoids `<foreignObject>` browser quirks)

---

## Implementation

**Carnatic Coder owns**:
- [`carnatic/render/templates/raga_wheel.js`](../carnatic/render/templates/raga_wheel.js) — extend `_labelWithBg`, add `_readChipTokens`, wire `chipVariant: 'raga'` and `chipVariant: 'comp'` at the two call sites listed above.

**Verification**:
1. Run `bani-render` and open `carnatic/graph.html`.
2. Open the raga wheel view. Select a mela (e.g. Natabhairavi).
3. Confirm janya labels (Bhairavi, Kiravani, etc.) render as **teal-bordered, teal-tinted boxes with a ◈ glyph**, matching the panel chip exactly.
4. Click a janya. Confirm composition labels (Sri Raghuvara, Koluvaiyunnade, etc.) render as **amber-bordered, amber-tinted boxes with a ♩ glyph**, matching the panel comp-chip exactly.
5. Confirm mela labels around the rim are *unchanged* (legacy dark pill, cakra sector colour preserved underneath).
6. Confirm click handlers still fire (label is still a hit target).
