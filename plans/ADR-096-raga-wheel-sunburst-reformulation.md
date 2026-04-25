# ADR-096: Raga Wheel — Sunburst Reformulation (Option A)

**Status**: Accepted  
**Date**: 2026-04-24  
**Branch**: `feat/sunburst-wheel`  
**Supersedes**: ADR-023 (raga wheel as third view), ADR-093 (chip spacing solver)

---

## Context

The current raga wheel uses a **concentric-rings formalism**:

```
R_INNER  (0.08) — cakra hub
R_CAKRA  (0.155) — cakra sector text
R_MELA   (0.38) — 72 mela circle nodes on a single ring
R_JANYA  (0.56) — janya satellite fans (open fan, anchor = mela angle)
R_COMP   (0.72) — composition satellite fans (anchor = janya angle)
R_MUSC   (0.88) — musician nodes
```

This formalism has produced a recurring problem: **janya and comp fans compete for radial ring budget that the viewport cannot contain**. With 20–30 janyas fanning outward from `R_JANYA = 0.56 × minDim`, and comps from `R_COMP = 0.72 × minDim`, the outermost nodes sit at `0.88 × minDim + label_overhang` — well past the viewport edge on any laptop screen before the user pans or zooms. Every attempt to fix this by tuning `maxSpread`, `k`, font sizes, or zoom targets has been a local patch on a global geometry problem.

The root cause: the three levels (mela → janya → comp) are laid out on **independent rings at independent radii**. Nothing in the geometry ensures that all three levels fit simultaneously in one viewport.

### What the reference image (Melakarta.katapayadi.sankhya.72) actually does

The reference image is a **sunburst**: each of the 72 melas occupies a fixed 5° angular wedge, and the detail (swara structure) fills that wedge radially. The circle is a compact index. Detail is contained *within* each angular slice, not pushed further outward into open space.

Mela names appear as radial spokes outside the ring — not as circle nodes *on* the ring — so they never consume arc-length on the rim.

---

## Pattern

**Containment over radiation**: rather than expanding detail radially outward (further from centre), contain hierarchy *within the same angular footprint*. Each 5° wedge "owns" its mela and all its descendants. Expansion deepens the ring, not widens it.

This is Alexander's **Levels of Scale** applied to the geometry: the mela arc, janya sub-arc, and comp sub-arc each exist at a different radial depth but share the same angular window.

---

## Proposed Design

### Overview state (collapsed)
- 72 mela arc-slices, each 5°, spanning `R_INNER` → `R_MELA_OUTER`
- Cakra sectors fill `R_INNER` → `R_CAKRA` (colours unchanged)
- Mela arc spans `R_CAKRA` → `R_MELA_OUTER`
- Mela name rendered as a **rotated text label** following the arc midline, or as a radial spoke label outside `R_MELA_OUTER` (same as the reference image)
- "Live" melas (have music) are brighter; inactive melas are dimmed
- All 72 melas visible simultaneously, no horizontal overflow

### Expanded state (one mela selected)
The selected mela's 5° wedge stays at its position; inner rings expand radially:

```
R_CAKRA       → R_MELA_OUTER  : mela arc (highlighted)
R_MELA_OUTER  → R_JANYA_OUTER : janya sub-arcs (subdivide the 5° wedge by janya count)
R_JANYA_OUTER → R_COMP_OUTER  : comp sub-arcs (subdivide each janya's angular slice)
```

Each janya gets an equal share of the 5° mela wedge: `5° / n_janyas`. For a mela with 20 janyas, each janya slice is 0.25° — too narrow for any label. **Label strategy**: on click/tap, a selected janya shows its name as a tooltip or in the adjacent panel (Option B's panel still applies here, but only for the selected node — not for the entire expanded state).

The key insight: even with 30 janyas, all fit within the 5° wedge at whatever radius the ring occupies. No fan geometry, no radius inflation, no off-screen content.

### Radii (suggested, to be tuned)
```
R_INNER       = 0.08 × minDim   (cakra hub, unchanged)
R_CAKRA       = 0.20 × minDim   (cakra sectors, slightly wider)
R_MELA_OUTER  = 0.38 × minDim   (mela arcs end here, same as now)
R_JANYA_OUTER = 0.56 × minDim   (janya ring, same as now)
R_COMP_OUTER  = 0.70 × minDim   (comp ring)
```
All three rings fit within `0.70 × minDim` — always inside the viewport.

### Interaction
- **Click mela arc** → expand janya sub-arcs (animated radial growth)
- **Click janya sub-arc** → expand comp sub-arcs + show selected janya name in panel
- **Click comp sub-arc** → trigger `triggerBaniSearch` (same as now) + show comp name in panel
- **Double-click / Fit** → collapse all, reset pan/zoom
- Rotation still applies to the whole wheel (makes sense for arcs, same code)

---

## Consequences

### Positive
- All three hierarchy levels always fit within `0.70 × minDim`; no pan required to see the full expanded state
- No fan-solver geometry (no `solveRingLayout` for janyas/comps); angular subdivision is O(1)
- Matches the reference image's visual DNA more closely
- Rotation becomes more meaningful: rotating the wheel brings a specific cakra to the "top" reading position

### Negative / Tradeoffs
- **Janya arc labels**: at 5°/30 = 0.25° per janya, label text is only viable for selected nodes (tooltip/panel) or at high zoom. The current explicit label chips on every janya node are not possible in the arc formalism.
- **Comp arc labels**: similarly — comp names must come from a panel or tooltip, not inline. This is actually consistent with Option B (adjacent panel for detail).
- Requires rewriting `_expandMela`, `_expandComps`, the SVG arc-rendering, and the auto-zoom targets. Roughly 400–600 lines of raga_wheel.js need replacement.
- The `solveRingLayout` function and `solveRingLayout`-based mela/janya/comp rendering can be deleted entirely.

---

## Implementation Plan

To be done in branch `feat/sunburst-wheel`:

1. **Carnatic Coder**: New `_drawMelaArcs(vp, ...)` — 72 arc-path elements replacing circle nodes. Keep `sectorPath()` helper (already exists).
2. **Carnatic Coder**: New `_expandMelaSunburst(vp, svg, raga, ...)` — janya sub-arc subdivision with animated radial growth (CSS transition or RAF).
3. **Carnatic Coder**: New `_expandJanyaSunburst(vp, svg, janya, ...)` — comp sub-arc subdivision.
4. **Carnatic Coder**: Reuse `RagaWheel` state controller (ADR-092) unchanged — pan/zoom/rotation geometry is format-agnostic.
5. **Carnatic Coder**: Update `orientRagaWheel` zoom targets for arc geometry (centring on arc midpoint rather than circle cx/cy).
6. **Carnatic Coder**: Remove `solveRingLayout`, `NR_JANYA`, `NR_COMP` constants once old code is gone.

Merge condition: the sunburst must render all 72 melas co-visible at scale=1, and an expanded mela+janya+comp triple must be fully visible without panning at scale≤2.

---

## Open Questions

- What is the minimum readable arc-width for a mela label? At `R_MELA_OUTER = 228px` and 5°, arc-length ≈ 20px. A rotated 9px font fits 2–3 characters. Options: abbreviate (first 3 chars), number only, or use radial spokes outside the ring as the reference image does.
- Should the janya sub-arcs use **equal angular division** (each janya gets 5°/n) or **proportional** (weighted by composition count)? Proportional gives richer ragas more visual weight but makes the layout non-uniform.
- Does rotation (ADR-092) apply before or after arc subdivision? (Likely before — the wheel rotates as a whole, then subdivision is computed in the rotated frame.)
