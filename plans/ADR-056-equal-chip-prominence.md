# ADR-056: Equal Chip Prominence; Smaller Chips for Unlabelled Tracks

**Status**: Accepted
**Date**: 2026-04-21
**Agents**: graph-architect

## Context

In the Bani Flow and Musician panels, the **composition chip** currently renders smaller than the **raga chip** and the artist name. This falsely communicates a hierarchy — composition appears subordinate when in fact composition is the *fixed content* of the guru-shishya transmission (raga is the *form*). They are co-equal centres of musical life.

Worse: track titles that have no resolved `composition_id` (i.e. the librarian has not yet matched the YouTube title to a composition) currently render the same size as resolved composition chips. They are indistinguishable, so the librarian cannot scan for "what still needs annotating".

## Forces

- **Truthful visual hierarchy**: equal-importance things look equal.
- **Librarian feedback**: the panel itself should signal what the librarian still has to do.
- **Token-driven sizing**: never hard-code chip dimensions; use design tokens so all chip classes scale together.

## Pattern

**Levels of Scale**: two levels — primary (resolved metadata) and secondary (unresolved fallback). Two sizes, never three.

## Decision

### New CSS tokens (in `base.html` `:root`)

```css
:root {
  --chip-size-primary:   0.78rem;   /* compositions, ragas, musicians, composers */
  --chip-size-secondary: 0.66rem;   /* unmatched track-title fallbacks */
  --chip-padding-primary:   2px 8px;
  --chip-padding-secondary: 1px 6px;
}
```

### Apply across all chip classes

```css
.comp-chip,
.raga-chip,
.musician-chip,
.composer-chip {
  font-size: var(--chip-size-primary);
  padding: var(--chip-padding-primary);
}

.chip-secondary {
  font-size: var(--chip-size-secondary) !important;
  padding: var(--chip-padding-secondary) !important;
  opacity: 0.7;
  font-style: italic;
}
```

`.chip-secondary` is a modifier added in JS at row-build time:

```js
if (!row.composition_id) {
  compChip.classList.add('chip-secondary');
}
```

### Player-bar chips inherit too

`.mp-comp-chip`, `.mp-raga-chip`, `.mp-musician-chip` adopt `--chip-size-primary` so the player and the panel share one type scale.

## Consequences

- Compositions and ragas read as equals, restoring the truthful relationship.
- The librarian can scan a panel and immediately spot italicised, smaller fallbacks — these are the rows that need annotation.
- Future chip classes (e.g. `.tala-chip`, `.composer-chip` from ADR-057) plug into the same tokens automatically.

## Implementation

1. Add the four tokens in `base.html`.
2. Update existing chip rules to consume the tokens.
3. Add the `.chip-secondary` modifier rule.
4. In row builders (`bani_flow.js`, `media_player.js`), conditionally add `.chip-secondary` to comp chips when no `composition_id` resolves.
5. Render and verify: composition and raga chips are visually equal; rows with raw titles show the smaller italic fallback.
