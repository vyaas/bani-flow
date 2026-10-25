# ADR-192 — Telescoping mela-janya detail: raga panel + composition panel

**Status**: Accepted (user directive 2026-10-22)
**Date**: 2026-10-22
**Author**: pi (`surface` skill)
**Depends on**: ADR-096 (Option B WDP), ADR-124 (wheel light-up), ADR-140
(corner-anchored WDP), ADR-174 (UI surface map), ADR-176 (inset view window).
**Scope**: `carnatic/render/templates/raga_wheel.js`, `base.html` (WDP CSS +
`#wheel-comp-panel` DOM), `carnatic/render/UIMAP.md` §4,
`test_ui_surface_map_drift.py`.

---

## Context

ADR-096 replaced the SVG satellite fans with a single Wheel Detail Panel: one
scrollable card that, on a mela click, rendered the mela, its *direct*
compositions, then every janya raga with its compositions pre-nested beneath
it. On a mela with many janyas this is a deep, mostly-collapsed tree — the
rasika scrolls past composition lists they did not ask for to reach the janya
they did, and there is no way to look at one raga's repertoire in isolation.

The user directive: *"we want to break this up where further outward
telescoping happens: when clicking a mela we want to see only the mela and its
janyas, and clicking a mela/janya explodes open another box next to this one
showing the various compositions."*

## Decision

Split the single WDP into a **two-panel telescoping chain**:

1. **Raga panel** (`#wheel-detail-panel`, the existing WDP). Opened by a mela
   click on the wheel. Shows *only* the mela chip and its janya chips — no
   compositions. Each raga chip carries its composition count as a badge.
2. **Composition panel** (`#wheel-comp-panel`, new). Opened by clicking a raga
   chip (the mela header chip or any janya chip). Shows that raga's
   compositions. It sits immediately beside the clicked chip: just outside the
   raga panel's outward edge (the fan side), vertically centred on the chip's
   row and clamped only to the view window. The child re-anchors while the raga
   list scrolls, so the click and its result stay spatially tied.

Both panels retain the ADR-140 corner-anchor rule and the ADR-176 scale
contract. The composition panel uses a top-left scale origin anchored to the
chip's measured screen row, so both cards scale with the wheel's
`_applyTransform()`.

**Mobile:** the composition panel is desktop-only. On a viewport ≤768px a raga
chip does not open the child card; it draws the Bani-flow panel
(`setPanelState('TRAIL')`), whose trail already carries that raga's
compositions. The shallow raga panel (mela + janyas) still opens on a mela tap;

Clicking a raga chip populates the Bani-flow panel with `raga`, and clicking a
composition chip populates it with `comp` — unchanged from the existing
selection plumbing. Clicking an already-selected raga chip toggles the
composition panel closed.

Sync/permalink paths (`_triggerMelaExpand`) open the raga panel, then open the
composition panel for the resolved raga and mark the target composition
`wdp-active`.

## Consequences

- The overview stays a shallow two-level read: mela → janyas. Depth is entered
  one raga at a time, per raga, in a child card that does not resize the parent.
  On mobile the depth is entered through the bani-flow drawer instead.
- Two simultaneously visible cards can exceed the viewport on narrow screens;
  this is why the child card is desktop-only. On desktop the raga panel is
  centred as before (ADR-140) and the child card tracks its chip's row, so it
  inherits whatever pan keeps the parent on screen. Both cards remain
  independently scrollable.
- `#wheel-detail-panel`'s `_closeWheelDetailPanel()` closes the whole chain, so
  every existing dismiss path (background tap, ESC, view switch, redraw) clears
  both cards.
- `_expandMela` / `_expandComps` SVG fans remain dead-but-present (ADR-124
  retired them from the click path); this ADR does not touch them.
