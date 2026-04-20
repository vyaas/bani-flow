# ADR-048: Chip Click Highlight Isolation on Mobile

**Status**: Proposed  
**Date**: 2026-04-19  
**Agents**: graph-architect

## Context

In the Musician (right) panel, each recording row (`<li>`) contains a composition chip (`.comp-chip`) and a raga chip (`.raga-chip`) on separate sub-rows. When the user taps either chip on mobile:

1. The **entire `<li>` row** flashes with the browser's default `-webkit-tap-highlight-color`, making it look like both the composition and raga were selected.
2. There is no persistent visual confirmation of **which** chip was actually tapped.
3. The `:hover` underline effect that works on desktop does not fire on touch devices.

The root cause: each `<li>` has a row-level click handler (`li.addEventListener('click', ...)`) that cross-navigates to `triggerBaniSearch()`. The chips also have individual click handlers with `e.stopPropagation()`. On mobile, the browser paints `tap-highlight` on the nearest clickable ancestor (`<li>`), not the actual tapped `<span>`.

## Forces

- **Reinforce intent**: The user tapped a specific chip — visual feedback must confirm exactly what was tapped, not the whole row.
- **Touch fidelity**: On mobile, `:hover` is unreliable. We need `:active` or a momentary class to signal taps.
- **Minimal footprint**: No new elements — CSS-only changes plus suppressing the `<li>`-level tap highlight.

## Pattern

**Strong Centres**: Each chip is a navigable centre. The centre must light up on activation, not its container.

## Decision

### CSS Changes (base.html — mobile media query)

```css
/* Suppress default tap highlight on recording rows */
.rec-legacy,
.concert-perf-row {
  -webkit-tap-highlight-color: transparent;
}

/* Touch-active feedback on individual chips */
.raga-chip:active {
  color: var(--fg);
  text-decoration: underline;
}
.comp-chip:active {
  background: rgba(131, 165, 152, 0.15);
  color: var(--fg);
  border-color: var(--fg-sub);
}
```

### Optional: momentary "flash" class (JS)

If the CSS `:active` pseudo is too brief on some mobile browsers, add a 200ms `.chip-tapped` class in the chip click handler:

```js
chip.classList.add('chip-tapped');
setTimeout(() => chip.classList.remove('chip-tapped'), 200);
```

With matching CSS:
```css
.raga-chip.chip-tapped { color: var(--fg); text-decoration: underline; }
.comp-chip.chip-tapped { background: rgba(131,165,152,0.15); color: var(--fg); border-color: var(--fg-sub); }
```

## Consequences

- The `<li>` row no longer flashes on tap — only the tapped chip lights up.
- Desktop behavior unchanged (`:hover` still works as before; `:active` is additive).
- The momentary flash gives visual confirmation before the panel switches via `triggerBaniSearch()`.

## Implementation

1. Add `-webkit-tap-highlight-color: transparent` to `.rec-legacy` and `.concert-perf-row` in `base.html`.
2. Add `:active` rules for `.raga-chip` and `.comp-chip` in `base.html`.
3. Optionally add the `.chip-tapped` class toggle in `media_player.js` (where chips are created).
4. Render and verify on mobile.
