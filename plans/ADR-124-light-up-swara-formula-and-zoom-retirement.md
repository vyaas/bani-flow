# ADR-124: Light-Up Swara Formula Interaction & Zoom Retirement

**Status**: Accepted
**Date**: 2026-05-10
**Branch**: `feat/124-light-up-swara-formula`
**Depends on**: ADR-122 (swara→mela mapping), ADR-123 (katapayadi-structured wheel)
**Supersedes** (partially): ADR-033 (touch interaction model — pinch/zoom portion only; click/expand semantics preserved), ADR-035 (raga wheel pointer capture — pinch portion only), ADR-094 (zoom-coupled adaptive radii — entirely)

---

## Context

ADR-123 gives us a wheel that *can* be decoded — concentric rings of madhyama, cakra, ri-ga, and da-ni surrounding 72 mela slots. But the rings are still passive. A user looking at the wheel sees structure but cannot yet *use* the structure. Two things are missing:

1. **A way for the wheel to teach what a mela's name means.** A mela name like *Mecakalyani* is, in the system, nothing more than a label for a swara bucket: `(prati madhyama, R₂, G₃, D₂, N₃)`. Until clicking *Mecakalyani* causes those exact cells to light up across the rings, the user cannot internalise this. The mela name remains a magic word, not a derived thing.

2. **A way for the wheel to teach generativity in the other direction.** A user who clicks the cell `(R₂, G₃)` should see *all 12 melas* (6 śuddha + 6 prati hemisphere) that share that ri-ga combination glow. A user who clicks the cakra wedge should see *all 6 melas in that cakra* glow. The wheel reveals the combinatorial structure of the system: 2 × 6 × 6 = 72 is not just an arithmetic fact but a *visible* one.

Together, these two interactions transform the wheel from an index into an instrument. The user can play it: click a swara → see which melas it generates; click a mela → see which swaras compose it. This is the symbolic isomorphism the user describes.

**The blocker**: the current wheel uses pan, pinch-zoom, and animated centre-on-target to "focus" on a selected mela. With pan/zoom in play, the rings the user needs to *see lighting up* are off-screen the moment focus shifts. The light-up gesture and the zoom gesture are mutually exclusive. To honour the new design, **zoom must be retired**.

---

## Pattern

**Reciprocity**: every visual element is both a source (clickable) and a sink (highlightable). Click a mela → swara cells light. Click a swara cell → melas light. Click a cakra → 6 melas + 1 ri-ga arc light. The wheel becomes a bidirectional map.

**Strong Centres** (continued from ADR-123): the lit-up cells *across all rings simultaneously* form a single visual gesture — a radial spine from centre to mela slot. The spine *is* the swara formula, drawn by the geometry.

**Decisive subtraction**: removing zoom is not a regression; it is the clearance that makes the new behavior possible. The wheel's full radial extent must be visible at all times.

---

## Decision

### A. Click semantics: forward direction (raga → swara cells)

When the user clicks any **mela slot** or any **mela label** in the outer ring, or selects a mela via the right sidebar:

1. Resolve the mela's tuple `(madhyama, ri, ga, da, ni)` from `katapayadi` (ADR-122).
2. Highlight, with the same accent stroke + accent fill, exactly these cells:
   - The matching half of the centre disk (śuddha or prati)
   - The cakra wedge that contains the mela (1 of 12)
   - The ri-ga arc (1 of 6 in this hemisphere) that matches `(ri, ga)`
   - The da-ni cell (1 of 6 in this cakra) that matches `(da, ni)`
   - The mela slot itself
3. All other cells are dimmed (reduced opacity, or desaturated fill) — same dimming pass already used for the graph view's filter.
4. The dim/lit transition animates over ~200ms (eased).

**The lit cells form a continuous radial spine from the centre to the outer ring.** This is the "swara formula made visible" effect. The user can read the formula by following the spine.

### B. Click semantics: reverse direction (swara cell → raga set)

When the user clicks a **decoding cell** (centre half, cakra wedge, ri-ga arc, da-ni cell):

| Clicked element     | Lit melas                                                              |
|---------------------|------------------------------------------------------------------------|
| Centre disk half    | All 36 melas in that madhyama hemisphere                               |
| Cakra wedge         | The 6 melas in that cakra                                              |
| Ri-ga arc           | The 12 melas with that `(ri, ga)` (6 śuddha + 6 prati)                 |
| Da-ni cell          | The 2 melas with that `(da, ni)` (one in each hemisphere) within the cakra position they share |

The clicked cell itself is highlighted with the accent treatment. The lit melas glow on the outer ring. The right sidebar populates with the corresponding raga list (using the existing Bani Flow filter machinery — `applyBaniFilter` extended with new filter types `cakra`, `riga`, `dani`, `madhyama`).

### C. Click semantics: clearing

- Click on empty wheel area (background) → clear all highlighting. Wheel returns to overview state (all melas at full brightness, no spine visible).
- Click the same cell twice → toggle off (clears highlighting).
- ESC key → clear.

### D. Hover affordance (desktop only)

- Hover on any decodable cell → preview the would-be lit-up set with a light tint (no commitment, no sidebar change). Click commits.
- Hover on a mela slot → preview the swara spine.
- Mobile has no hover; click is the only commitment.

### E. Zoom retirement (the trade-off)

The following are removed from the wheel:

1. **Pinch-zoom gesture** (`raga_wheel.js` pointer capture, ADR-035 partial)
2. **Mouse-wheel zoom**
3. **`animateCentreOnTarget`** and the entire animated focus mechanism
4. **`_vx`, `_vy`, `_vscale` viewport state** (`window._wheelGetVscale` etc. — all retired)
5. **`wheelFit`** — there is nothing to fit; the wheel is always at native scale

What is **preserved**:

- The mela → janya → composition → musician hierarchical expand chain on the wheel (ADR-023, ADR-092). `_expandedMela`, `_expandedJanya`, `_expandedComp` state stays.
- The `_triggerMelaExpand` synthetic-click chain for mela/janya/comp expansion. Light-up (this ADR) is **layered on top of** expansion, not a replacement for it. Clicking a mela both expands its janya fan *and* lights its swara spine.
- The right sidebar (Bani Flow panel) and its coupling with the wheel.

What remains of the viewport machinery:

- A single static SVG sized to fit the viewport (`viewBox` covers the outermost radius + label margin on each side).
- One transform: `viewBox` recomputed on resize. No interactive transform.
- The wheel is read-only as *viewport geometry*; only fill/stroke/opacity (highlights) and the existing expand/collapse animations (janya/comp fans) change in response to interaction.

This is a **deliberate sacrifice of zoom only**. With zoom retired, the user can never magnify a single mela — but in exchange, the user always sees the *whole system* and the swara spine that connects centre to the selected mela across all rings. The user's prompt makes this trade explicit: the spine across the radial extent is the new value, and zoom is what was blocking it.

### F. Sidebar coupling (unchanged + light-up overlay)

- Wheel mela click → existing janya-fan expansion fires *and* spine lights up; sidebar populates as today.
- Sidebar mela click → existing `triggerBaniSearch('raga', id)` → `syncRagaWheelToFilter` chain runs; `_triggerMelaExpand` continues to expand the janya fan, and a new `lightUpSpine(melaId)` call is added at the end of that chain to draw the spine.
- New decoding-cell clicks (centre half / cakra wedge / ri-ga arc / da-ni cell) populate the sidebar via `applyBaniFilter` extended with new filter types.
- Re-entry guards (`_wheelOriginatedTrigger`, `_wheelSyncInProgress`) are simpler than before because there is no pan/zoom animation race to manage; the expand-chain timing is unchanged.

### G. Accessibility

- Each clickable cell gets a `<title>` SVG element with descriptive text ("Cakra 5 — Bana — melas 25–30: chakravakam, suryakantam, hatakambari, jhamkaradhvani, natabhairavi, kiravani").
- Keyboard navigation: tab through cells; enter to commit; ESC to clear.
- Screen reader: lit-up state is announced ("Mecakalyani: prati madhyama, ri 2, ga 3, dha 2, ni 3").

---

## Consequences

**Positive**

- The wheel becomes pedagogical. A new user learns the structure of the 72-mela system *by playing with the wheel*, with no documentation required.
- The combinatorial nature of the system (2 × 6 × 6) becomes a *visible*, *clickable* fact.
- Rendering is dramatically simpler — no animation engine, no viewport state machine, no synthetic click chains, no expand/collapse choreography.
- The recurring class of bugs around "wheel state out of sync after pan + filter + view-switch" disappears at its source. The wheel has no pan state.
- Mobile and desktop now behave nearly identically (no pinch gesture asymmetry).

**Negative**

- Users who liked zooming in on individual mela slots lose that affordance. Mitigated: at native scale on a typical viewport, a 5° slot is large enough to read; the radial label at `R₆` carries the name in full size.
- The `animateCentreOnTarget` work and pinch-zoom work (ADR-094, ADR-035) is sunk cost.
- Touch interaction model (ADR-033) needs revision — the pinch portion is gone; the click/hold semantics may need new gestures (e.g. long-press = preview spine without committing).

**Neutral**

- The right sidebar's role grows: it is now the only surface for hierarchical janya/composition browsing. This was already true for most workflows; the change just makes it official.

---

## Implementation (delegated; not done in this ADR)

Sequenced work after ADR-124 is Accepted (presupposes ADR-123 implementation complete):

1. **Coder** — implement `lightUpSpine(melaId)` in `raga_wheel.js`: resolves tuple, applies accent stroke/fill to the five spine cells, dims all others. Animates over 200ms.
2. **Coder** — implement `lightUpMelas(melaIds)` for the reverse direction: takes a set of mela ids, applies accent to those slots, dims others.
3. **Coder** — wire centre-disk-half, cakra-wedge, ri-ga-arc, da-ni-cell click handlers. Each computes its mela set (using `melakarta_math.py` JS port) and calls `lightUpMelas`, then populates sidebar.
4. **Coder** — extend `applyBaniFilter` to accept new filter types: `madhyama` (1|2), `cakra` (1..12), `riga` ((ri, ga)), `dani` ((da, ni)). Each resolves to a set of mela ids that drive the existing dim-others-on-graph behavior.
5. **Coder** — delete pan/zoom/pinch code from `raga_wheel.js`. Delete `animateCentreOnTarget`, `_vx`/`_vy`/`_vscale` state, `wheelFit`, `_wheelGetVscale`/`Set` window exports. **Preserve** `_triggerMelaExpand` and the `_expandedMela/Janya/Comp` state; janya/comp expansion stays.
6. **Coder** — extend `syncRagaWheelToFilter` to call `lightUpSpine(melaId)` (or `lightUpMelas` for non-mela filters) **after** `_triggerMelaExpand` runs. Both fire; expansion is not replaced.
7. **Coder** — add hover-preview tint on desktop (CSS-only is fine: `:hover` on each cell renders a tint, no JS needed).
8. **Coder** — accessibility pass: SVG `<title>` per cell, keyboard nav (`tabindex`), `aria-label` updates on highlight, ESC handler.
9. **Coder** — `bani-render`; manual interaction test: click each mela in cakra 5 (bana) and confirm the spine lights up correctly; click each ri-ga arc and confirm 12 melas highlight; click cakra 5 and confirm 6 melas highlight; click centre half and confirm 36 melas highlight.
10. **Git Fiend** — branch `feat/124-light-up-swara-formula`, commit, push, open PR.

---

## Open questions (logged for `.clinerules`)

- Should the lit-up spine persist when the user navigates away to graph view and back, or reset? Probably persist (it is part of `activeBaniFilter` state).
- For janya ragas (which inherit from a parent mela), does the spine light up the *parent's* swara cells, or does the janya carry its own (potentially varied) swara overrides? Defer until janya schema decision in ADR-122 follow-up.
- Long-press on mobile to "preview spine without committing" — useful, or feature creep? Defer to user testing.
- Should the search box accept queries like "show me melas with G₃ and D₂"? This becomes trivial once the schema and filters are in place; surface it in a follow-up ADR if there is appetite.
