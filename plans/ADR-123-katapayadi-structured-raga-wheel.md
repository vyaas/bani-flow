# ADR-123: Katapayadi-Structured Raga Wheel (Concentric Decoding Rings)

**Status**: Implemented
**Date**: 2026-05-10
**Branch**: `feat/123-katapayadi-wheel` (merged to `main` 2026-05-10)
**Depends on**: ADR-122 (swara→mela mapping & validation)
**Refines** (does not supersede): ADR-023 (raga wheel as third view), ADR-092 (raga wheel as stateful object), ADR-093 (chip spacing solver). Janya/composition/musician layers from those ADRs are preserved. **Supersedes**: ADR-094 (zoom-coupled adaptive radii — addressed in ADR-124), ADR-096 (sunburst reformulation — proposed, never built; this ADR replaces that proposal)
**Enables**: ADR-124 (light-up interaction & zoom retirement)

---

## Context

The current raga wheel places 72 mela circles on a single ring. Their grouping into cakras is signalled only by adjacency and a faint sector tint. Nothing in the visual tells the user *why* any two adjacent melas are adjacent — what the bracketing *means*. The user is expected to know that consecutive cakras share a rishabha-gandhara pair, that adjacent melas within a cakra share a dhaivata-nishada pair, and that the 36/72 boundary is the madhyama hemisphere split. None of this is taught by the visual; the wheel is, as the user puts it, **unalive**.

The canonical reference (`carnatic/data/Melakarta.katapayadi.sankhya.72.png`) is alive precisely because it makes the system **decodable**:

- A central yellow disk split left/right encodes **madhyama** (śuddha vs prati).
- A red ring of 12 wedges encodes the **cakras** (Indu, Netra, Agni, … Aaditya), each spanning 30°.
- A green ring of arcs encodes **(ri, ga)** pairs — 6 distinct combinations cycling within each madhyama hemisphere.
- A peach ring of 36 cells per hemisphere encodes **(da, ni)** pairs — the finest decoding ring.
- A black outermost ring carries the 72 mela numbers and names.

To find the swara formula for any mela, the user **traces inward** from its slot through four rings. To find which mela owns a given swara combination, the user **traces outward** from the centre. The geometry *is* the teaching. The wheel teaches itself.

The proposal is to co-opt this exact structure as the new raga wheel, replacing the single-ring layout. Everything that was previously a circle node on the rim becomes an outer-ring slot in the new layout. The decoding rings are added.

---

## Pattern

**Levels of Scale**: madhyama (2) → cakra (12) → ri-ga (6) → da-ni (6) → mela (72). Each ring divides the angular space of the ring inside it. The visual literally is the multiplication 2 × 6 × 6 = 72. The user can *see* the cardinality of the system.

**Strong Centres**: the centre disk is the orientation point. Every ring outward is a refinement of the centre's two-state choice. No ring exists in isolation — it is always read as a refinement of the rings inside it.

**Boundaries**: the 36 / 72 vertical line is the madhyama boundary — a hard structural break. Cakra wedges are softer boundaries (colour-coded but still readable as a continuous angular sweep). Ring borders are visual boundaries between levels of decoding.

**Containment over radiation** (carried over from ADR-096): all 72 mela slots fit on a single outer ring; janya/composition detail does not radiate further outward into open space (see *Janya & composition placement* below).

---

## Decision

### Geometry (overview state)

The katapayadi rings are added **inside** the existing mela ring; the existing janya and composition satellite layers stay **outside** it. Everything is visible at native scale once zoom is retired (ADR-124).

```
R₀ = 0                       — centre point
R₁ = 0.10 × minDim           — yellow centre disk (madhyama: śuddha | prati)
R₂ = 0.18 × minDim           — red ring of 12 cakra wedges (30° each)
R₃ = 0.26 × minDim           — green ring of (ri, ga) arcs (1 per cakra wedge)
R₄ = 0.34 × minDim           — peach ring of (da, ni) cells (6 per cakra wedge, 5° each)
R₅ = 0.42 × minDim           — black ring of 72 mela slots (5° each, 36 per hemisphere)
R₆ = 0.50 × minDim           — radial spoke labels: mela name + number, anchored outside R₅
— — — outside the decoding rings, existing layers are preserved — — —
R_JANYA ≈ 0.62 × minDim      — janya satellite chips (existing fan layout, anchor = mela angle)
R_COMP  ≈ 0.78 × minDim      — composition satellite chips (anchor = janya angle)
R_MUSC  ≈ 0.92 × minDim      — musician chips (existing)
```

Radii are illustrative; the actual values are tuned so the new katapayadi rings fit within what the current wheel uses for `R_INNER..R_MELA` (≤ 0.42 × minDim), leaving the existing janya/comp/musician radii **unchanged**. The visible budget that pan+zoom previously freed up at the centre is exactly the budget the new decoding rings consume — a one-for-one trade. `minDim = min(viewport.width, viewport.height)`.

### Angular layout (this is the heart of the design)

The reference image lays out melas **starting at the top (12 o'clock) and proceeding clockwise**, with mela 1 immediately right of the vertical, mela 36 immediately left of the bottom vertical, mela 37 immediately left of the bottom vertical (prati hemisphere), mela 72 immediately left of the top vertical. Each mela occupies 5° (360° / 72 = 5°).

**Hemisphere split (vertical line)**:
- Right half (0° → 180°, clockwise from top): śuddha madhyama, melas 1–36
- Left half (180° → 360°): prati madhyama, melas 37–72

**Cakra wedges** (red ring): 30° each. Cakra 1 (Indu, melas 1–6) sits at the top-right; cakra 6 (Rutu, melas 31–36) at the bottom-right; cakra 7 (Rishi, melas 37–42) at the bottom-left; cakra 12 (Aaditya, melas 67–72) at the top-left.

**Ri-ga arcs** (green ring): each cakra wedge contains a single (ri, ga) arc. Within one madhyama hemisphere, the 6 cakras cycle through:

```
Cakra 1, 7  : (R₁, G₁)
Cakra 2, 8  : (R₁, G₂)
Cakra 3, 9  : (R₁, G₃)
Cakra 4, 10 : (R₂, G₂)
Cakra 5, 11 : (R₂, G₃)
Cakra 6, 12 : (R₃, G₃)
```

(Same upper-triangular pair sequence as in ADR-122.)

**Da-ni cells** (peach ring): each cakra wedge contains 6 da-ni cells (5° each), cycling through the same 6 upper-triangular pairs. The cell within cakra `c` at position `p` encodes the `(da, ni)` pair for mela `(c-1)*6 + p`.

**Mela slots** (black ring): 72 slots of 5°. Slot for mela `M` carries the mela number and a small chip (currently a circle; see ADR-073 chip parity). The mela name renders as a radial label at `R₆`, rotated tangentially as in the reference image (read radially outward).

### Click affordances (declared here; behavior in ADR-124)

Every visual element is a click target:

- Centre disk halves → "show all melas in this madhyama hemisphere"
- Cakra wedge → "show all 6 melas in this cakra"
- Ri-ga arc → "show all 12 melas with this (ri, ga) pair (6 in each hemisphere)"
- Da-ni cell → "show the 2 melas with this (da, ni) pair within this hemisphere"
- Mela slot or label → existing mela-click semantics (open janya panel, etc.)

### Janya & composition placement (preserved)

The existing janya satellite fans, composition satellite fans, and musician chips on the wheel are **preserved unchanged**. The user values the hierarchical browse-on-the-wheel affordance and the right-sidebar Bani Flow panel; both stay.

- Selecting a mela still expands its janya fan outward at `R_JANYA` (existing behavior, ADR-023, ADR-092).
- Selecting a janya still expands its composition fan at `R_COMP` (ADR-093 chip spacing logic stays).
- The right sidebar continues to mirror selection state.

What changes is *what's at the centre of the wheel*: the decoding rings now occupy the radii previously empty between centre and the mela ring. Nothing gets removed from the existing layout; the centre is *filled in*.

### Visual encoding

- Cakra wedge fill: existing cakra colour palette (already in use on the current wheel)
- Ri-ga arc fill: a muted green tint; subscripts `R₁G₁`, `R₁G₂`, … rendered along the arc
- Da-ni cell fill: a muted peach tint; subscripts `D₁N₁`, `D₁N₂`, … rendered radially within the cell
- Mela slot fill: black ring, mela number drawn near R₅ inside the slot, name radial-labelled outside
- Live (has recordings) vs dim (no recordings): brightness modulation on the mela slot only
- Selected swara cells: highlighted via accent colour (defined in ADR-124)

### Geometric correctness check (pre-render)

Before render, validate (Coder):

```python
for M in 1..72:
    tuple = data[mela_M].katapayadi
    cakra_wedge = mela_to_cakra_wedge_index(M)        # 0..11
    riga_arc    = riga_pair_index(tuple.ri, tuple.ga) # 0..5
    dani_cell   = dani_pair_index(tuple.da, tuple.ni) # 0..5
    assert cakra_to_riga(cakra_wedge) == riga_arc
    assert cakra_position(M) == dani_cell
```

If any mela's slot does not align radially with the (ri-ga, da-ni) cells implied by its tuple, the render must abort with a clear error. The wheel must never render a geometric lie.

---

## Consequences

**Positive**

- The wheel becomes self-teaching. A user can derive any mela's swara formula visually, and infer the structure of the system without a textbook.
- Eliminates the recurring "janya/comp fans don't fit the viewport" geometry problem (the root cause behind ADR-093, ADR-094, ADR-096) by removing fans entirely.
- All 72 melas always visible. No expand-to-see behavior; expansion happens in the sidebar.
- The wheel becomes the single best on-screen surface for the *concept* of melakarta, not just an index of it.
- Unlocks ADR-124 (light-up interaction).

**Negative**

- The mela ring shrinks (was at `R_MELA = 0.38 × minDim`; now at `≈ 0.42 × minDim` but with the inside crowded by four decoding rings rather than empty). Mela chips and labels need to be re-fitted at this radius without zoom-to-focus available; legibility is the central design risk.
- Janya fans now anchor on a mela slot whose chip is smaller than before; angular alignment from mela → janya remains the same but visual continuity at the mela ring needs care.
- Implementation cost: the `raga_wheel.js` centre-and-mela-ring rendering is rewritten; janya/comp/musician code paths stay but their input radii change.
- Pan / zoom / pinch gesture code is retired (ADR-124) — see that ADR for the trade-off rationale.

**Neutral**

- Mobile viewport: a 5° mela slot at `minDim ≈ 360px` viewport is ≈ 17px arc-length at `R₅`. Tap targets need to span `R₅ → R₆` (radial extent ≈ 50px) to be reachable; the 17px arc-width is acceptable for tap if the radial extent is generous. Validate with a touch-test before declaring done.

---

## Implementation (delegated; not done in this ADR)

Sequenced work after ADR-123 is Accepted:

1. **Coder** — implement `melakarta_math.py` ring-index helpers (`mela_to_cakra_wedge_index`, `riga_pair_index`, `dani_pair_index`, `cakra_to_riga`, `cakra_position`) used by both backend validation and the JS renderer.
2. **Coder** — replace the ring/fan layout in `carnatic/render/templates/raga_wheel.js` with the six-zone concentric layout. Reuse cakra colour palette from `theme.py`.
3. **Coder** — emit pre-render assertions per the geometric correctness check; abort render on any mismatch.
4. **Coder** — wire mela-slot click through to the existing `triggerBaniSearch('raga', mela_id)` path; sidebar coupling is unchanged for mela clicks.
5. **Coder** — keep janya satellite, composition satellite, and musician render paths intact; only update their input radii (`R_JANYA`, `R_COMP`, `R_MUSC`) and the angular anchor lookup (still mela centre). `_expandedMela`, `_expandedJanya`, `_expandedComp` state remains.
6. **Coder** — `bani-render`; visual diff against the reference image for the centre-through-mela-ring portion; manually trace 5 random melas (one per cakra) to confirm radial alignment of decoding cells; expand 3 melas to confirm janya/comp fans still anchor correctly on the smaller mela ring.
7. **Git Fiend** — branch `feat/123-katapayadi-wheel`, commit, push, open PR (this is a structural change; not main).

ADR-124 implementation begins after step 7.

---

## Open questions (logged for `.clinerules`)

- Should the cakra colour palette mirror the reference image's pastel red, or stay with the current darker palette (gruvbox)? Theming decision; defer to first render review.
- Are mela name labels readable at 5° angular spacing on a 1280×800 viewport without overlap, given the mela ring is now smaller (≈ `0.42 × minDim` vs prior `0.38`)? May need alternating inner/outer label radii, or label rotation tuning. Resolve at first render review.
- Does the 36/72 vertical hemisphere split need a heavy black bar (as in the reference) or is a subtle line enough? Aesthetic call.
- With janya/comp fans preserved at `R_JANYA = 0.62`, `R_COMP = 0.78`, do they still fit the viewport at native scale (no zoom)? This is the core legibility question for ADR-124 to answer at first render review; if not, fan radii or chip sizes adjust, but the decoding rings stay fixed.
