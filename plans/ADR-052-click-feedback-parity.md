# ADR-052: Click Feedback Parity Across Bani Flow and Musician Panels

**Status**: Proposed
**Date**: 2026-04-21
**Agents**: graph-architect

## Context

ADR-048 isolated chip-level tap highlighting in the Musician panel: tapping a `.comp-chip` or `.raga-chip` lights up only that chip, not the whole `<li>`. The Bani Flow (left) panel never received this treatment. The result is asymmetric:

- **Musician panel**: clear "I tapped *this*" feedback. Intent → outcome is unmistakable.
- **Bani Flow panel**: the entire metadata box appears highlighted on tap. The user cannot tell whether the row, the composition chip, the raga chip, or the musician name was the active target.

Click is a fundamental mechanism. The two panels are different views of the same filtered data — they must speak the same visual language when the user activates a chip.

## Forces

- **Parity**: A user who learns the click vocabulary in one panel must not have to relearn it in the other.
- **Strong centres**: Each chip is the centre of an action. The centre lights, not the container.
- **Touch fidelity**: `:hover` is unreliable on touch; `:active` plus a momentary class gives reliable feedback across browsers.
- **Minimal surface area**: This is a CSS contract plus a small JS hook in chip click handlers — no structural changes.

## Pattern

**Strong Centres**: a centre activates by lighting itself, never by lighting its boundary.

## Decision

### A shared chip-activation contract (CSS)

Every chip class (`.comp-chip`, `.raga-chip`, the new `.musician-chip` from ADR-054) honours the same activation states:

```css
/* Touch — momentary feedback while finger is down */
.comp-chip:active,
.raga-chip:active,
.musician-chip:active { /* per-chip flash colors */ }

/* JS-driven — 200ms post-tap class for browsers that swallow :active */
.comp-chip.chip-tapped,
.raga-chip.chip-tapped,
.musician-chip.chip-tapped { /* same as :active */ }
```

### Suppress container-level tap highlight

Every row container that wraps chips (`li.rec-legacy`, `.concert-perf-row`, all `#bani-trail li` row variants) must set:

```css
-webkit-tap-highlight-color: transparent;
```

ADR-048 applied this to `.rec-legacy` and `.concert-perf-row`. Extend it to all Bani Flow row containers.

### JS hook in every chip click handler

```js
chip.classList.add('chip-tapped');
setTimeout(() => chip.classList.remove('chip-tapped'), 200);
```

Apply this in `bani_flow.js` everywhere a `.comp-chip`, `.raga-chip`, or `.musician-chip` is built. `media_player.js` already has the pattern from ADR-048; mirror it.

## Consequences

- A single, panel-agnostic vocabulary for chip activation.
- The user always knows exactly what they tapped.
- Adding a new panel later requires only honouring the contract — no new CSS rules.

## Implementation

1. Audit every chip-creation site in `bani_flow.js` and `media_player.js`. Each must wire the 200ms class toggle.
2. Extend `-webkit-tap-highlight-color: transparent` in `base.html` to every row container in either panel.
3. Define the `.chip-tapped` rule once per chip class, identical to its `:active` rule.
4. Render and verify on a 768px viewport that tapping a chip in either panel flashes only the chip.
