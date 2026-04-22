# ADR-054: Era-Coloured Musician Chips (Cross-View Coupling)

**Status**: Accepted
**Date**: 2026-04-21
**Agents**: graph-architect

## Context

The guru-shishya graph paints each musician node in the colour of their era (Trinity, Bridge, Golden Age, Disseminator, Living Pillars, Contemporary). The panels — Bani Flow and Musician — display musician names as plain text. There is no visual link between a name in the panel and the node it refers to on the graph.

This is a missed opportunity. Bani Flow is fundamentally about *the flow of music from guru to shishya*. The panels and the graph are the same data in two representations; they should look like it.

## Forces

- **Cross-view coupling**: a musician chip in the panel must telegraph its era at a glance, identical to its node on the graph.
- **Reuse design tokens**: era colours already live in `theme.py` / `theme.js`. No new colour decisions.
- **Readability**: a translucent fill keeps text on a high-contrast background. A solid era-colour bar on the left does the unmissable signalling.
- **Composer-aware**: composers are also placed in eras (Trinity, etc.); the same chip works for them.

## Pattern

**Levels of Scale**: the era is the scale; the chip is the scale unit; the graph node is the same unit at a larger scale. Same colour, different size.

## Decision

### New `.musician-chip` class

```css
.musician-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px 2px 6px;
  border-left: 2px solid var(--chip-era-border);
  background: var(--chip-era-bg);
  color: var(--fg);
  border-radius: 3px;
  cursor: pointer;
}
.musician-chip:hover { color: var(--fg); text-decoration: underline; }
.musician-chip:active,
.musician-chip.chip-tapped { filter: brightness(1.2); }
```

The two custom properties `--chip-era-bg` and `--chip-era-border` are set inline at chip-build time:

```js
chip.style.setProperty('--chip-era-border', eraColor);
chip.style.setProperty('--chip-era-bg', eraTint);   // ~14% alpha of eraColor
```

### Helper in `theme.js`

```js
function eraTintCss(eraId) {
  const c = ERA_COLORS[eraId] || ERA_COLORS.contemporary;
  return { border: c, bg: hexToRgba(c, 0.14) };
}
```

Mirrored from `theme.py` so the contract is consistent between Python (graph rendering) and JS (panel rendering).

### Use sites

Every musician name in either panel or in the media-player chip strip becomes a `.musician-chip`:

- Bani Flow trail rows: artist + co-performers.
- Musician panel: header (musician being viewed) + each row's artist + co-performers.
- Media player: the existing `.mp-musician-chip` adopts the era tint.

The existing `.mp-musician-chip` class can either be reskinned to inherit from `.musician-chip` or replaced. Either way, the era-colour treatment is uniform.

## Consequences

- The visual loop is closed: chip colour = node colour = era. Tapping a chip and watching the graph confirms the connection.
- Pulls the user's eye back toward the centre (the graph) by establishing colour identity between panel text and graph nodes.
- Co-performers are now era-distinguishable — useful when scanning a row of three-or-four artists for who is the headliner.
- Slight CSS overhead: one extra inline style declaration per chip (negligible).

## Implementation

1. Add the `.musician-chip` rule and the `--chip-era-bg`/`--chip-era-border` custom properties in `base.html`.
2. Add `eraTintCss(eraId)` and `hexToRgba(hex, a)` helpers in `theme.js`.
3. Audit musician-name rendering sites in `bani_flow.js` and `media_player.js`; convert each to `.musician-chip` with inline custom properties.
4. Update the existing `.mp-musician-chip` to use the same tint system (or alias it).
5. Render and verify: chip colour matches node colour for a sample of musicians from each era.
