# ADR-093: Minimum-Spacing Radius Solver (Font Size as Length Scale)

**Status**: Proposed
**Date**: 2026-04-23
**Agents**: graph-architect
**Depends on**: ADR-023 (raga wheel third view), ADR-073 (raga wheel chip parity), ADR-092 (raga wheel as stateful object)
**Related**: ADR-094 (zoom-coupled adaptive radii)

---

## Context

### The crowding is mechanical, not artistic

The two attached screenshots (chrome on a 360×800 device) make the failure mode obvious:

- **Mela rim, north-east arc**: `Vakulābharaṇam`, `Mayāmāḷavagowla`, `Chakravakam`, `Sūryakāntam`, `Hāṭakāmbari`, `Jhaṅkāradhvani`, `Natabhairavi`, `Keeravani`, `Kharaharapriyā`, `Gowrīmanohari` — chips overlap so densely that adjacent ones occlude each other's hit regions. Users tap `Sūryakāntam` and select `Hāṭakāmbari`.
- **Janya/composition fan, west arc**: when `Sankarābharanam` is expanded, its janya satellites (`Arabhi`, `Atana`, `Begada`, `Bilahari`, `Devagandhari`, `Gambhīra Naṭṭai`, `Janaranjani`, `Kannaḍa`, `Naravanagowla`, `Neelambari`, `Purnachandrika`, …) all fan into a single 50° wedge and stack into an unreadable column.

These overlaps are not a styling bug. They are the deterministic output of two layout rules that ignore label width:

```javascript
// raga_wheel.js — mela rim
const R_MELA  = minDim * 0.38;          // fixed radius
const angleDeg = (n - 1) * 5;           // 72 chips × 5° = full circle

// raga_wheel.js — janya fan inside _expandMela
const SPREAD = Math.min(50, janyas.length * 8);
const offset = janyas.length === 1 ? 0
             : -SPREAD / 2 + (SPREAD / (janyas.length - 1)) * i;

// raga_wheel.js — composition fan inside _expandComps
const SPREAD = Math.min(40, items.length * 7);
```

Both rules use **angles** (degrees per chip) but never check whether the resulting **arc-length** between chip centres exceeds the chip's actual width. A 5° step at radius `0.38·minDim ≈ 137 px` (on a 360-px viewport) gives ≈ 12 px between chip centres — but `Mayāmāḷavagowla` at 11 px font is ≈ 90 px wide. The chips overlap by 7×.

### The user's framing

> "There must be a strict condition on the raga chips: they necessarily have to be spaced by a minimum distance, determined by their size (font size in this case is the natural length scale). Fixed spacing between chips also means the user knows what to expect, even if a raga is not in view, it can be panned to."

Two requirements live in those sentences:

1. **Spacing is derived, not configured.** The natural unit is font size. The visible chip width is some multiple of font size. The required gap between chips is some multiple of chip width. So `s_min = k · fontSize` for a tunable `k`.
2. **Spacing is uniform.** Every chip on a ring is the same arc-distance from its neighbour. The user can pan around the rim with confidence — what's off-screen is laid out the same way as what's on-screen. No locally-dense pockets, no locally-sparse gaps.

This is the same constraint the rim ribbon labels obey today — they just satisfy it by accident at desktop sizes and break on mobile.

---

## Forces

| Force | Direction |
|---|---|
| **Determinism** | Layout must be a pure function of `(chip count, font size, viewport size)`. Same inputs → same chip positions, every render. Users build muscle memory around chip locations; a stochastic or content-dependent layout would corrode that. |
| **Font size as length scale** | Chip width is `≈ charCount · 0.55 · fontSize + padding` (per `_labelWithBg` in [raga_wheel.js](../carnatic/render/templates/raga_wheel.js)). The natural minimum chip-to-chip arc length is therefore proportional to font size. Encoding the rule as `s_min = k · fontSize` is the simplest expression of the constraint. |
| **Closed rim vs open fan** | The mela rim is a *closed* circle: 72 chips, full 2π span, no end. Janya and composition fans are *open* arcs: N chips, span Δθ ≤ some maximum, anchored at a parent angle. The solver must handle both. The two cases share the equation `arcLength = R · Δθ ≥ N · s_min`; they differ in which variable is solved for. |
| **Closed rim → solve for radius** | For the rim, `Δθ = 2π` is fixed and `N = 72`. So `R_rim ≥ N · s_min / (2π)`. The rim radius is determined by the *longest label's width* (since `s_min` derives from the chip with the widest label, not the average). |
| **Open fan → solve for spread, then radius** | For janya/comp fans, the parent's angular position is fixed. The fan can grow its spread Δθ until it would collide with the neighbouring parent's fan. If `Δθ_max · R_baseline < N · s_min`, the fan overflows the angular budget and the solver must increase R as well. |
| **Neighbour collision (open fans only)** | A janya fan at mela `n` cannot exceed half the angular distance to its neighbour at `n±1` — otherwise two adjacent expanded melas' fans would overlap. With 5° between melas, the fan's half-spread cannot exceed 2.5°. This is *too tight* in practice (today's `SPREAD=50°` already overlaps), but only one mela is expanded at a time, so the actual collision constraint is between the fan and the **neighbouring mela's rim chip**, not its fan. The neighbour-gap parameter expresses this. |
| **Tunability without ADRs** | The constant `k` will need empirical tuning across desktop and mobile. Encoding it as a CSS custom property `--wheel-chip-spacing-k` lets future visual tuning happen without an ADR cycle. |
| **Composition with ADR-092 actions** | The solver must run inside `drawRagaWheel()` and re-run when `RagaWheel.zoom()` changes the effective scale (groundwork for ADR-092). The solver itself is a pure function with no DOM dependency, so it can be called freely. |
| **Backward compatibility with `_expandMela` / `_expandComps`** | Today these functions mutate SVG inline. Replacing the spread math with solver output is a localised change; the solver returns `{angles[], radius}` and the call sites read those values. No DOM API changes. |

---

## Pattern

**Levels of Scale** (Alexander): the chip is a unit; the ring is a composition of chips; the wheel is a composition of rings. The unit's *size* (font width) determines the next level's *spacing*, which determines the next level's *radius*. Each scale's geometry derives from the scale below it.

**Form follows function** (modernist orthodoxy applied to UI): the rim's radius is not a stylistic choice; it is whatever it must be to fit 72 chips of width *w* without overlap. Encoding this as a constraint, not a constant, makes the rule visible.

**The principle of least astonishment** (Saltzer): users panning the wheel expect the same layout density everywhere. Uniform spacing satisfies this without further explanation.

---

## Decision

### The solver — pure function

```javascript
/**
 * Solve a ring's geometry given a minimum-arc-length spacing constraint.
 *
 * @param {Object} opts
 * @param {number} opts.n           Number of chips on this ring (≥ 1).
 * @param {number} opts.fontSize    Chip font size in px. Drives s_min.
 * @param {number} opts.maxLabelChars  Width of the widest label, in characters.
 *                                     Used to compute the actual chip width.
 * @param {number} opts.k           Spacing multiplier. s_min = k · chipWidth.
 *                                  Read from CSS var --wheel-chip-spacing-k
 *                                  (default 1.15).
 * @param {Object} [opts.openFan]   Present iff this is an open fan (janya/comp);
 *                                  absent for closed rim.
 * @param {number} opts.openFan.anchorAngle    Parent's angle in radians.
 * @param {number} opts.openFan.maxSpread      Hard cap on Δθ in radians.
 *                                             (e.g. neighbour-gap budget.)
 * @param {number} opts.openFan.rBaseline      Preferred radius (e.g. R_JANYA).
 * @param {Object} [opts.closedRim] Present iff this is the mela rim.
 * @param {number} opts.closedRim.rBaseline    Preferred radius (e.g. R_MELA).
 *
 * @returns {{ radius: number, spread: number, angles: number[] }}
 *   radius  — actual ring radius (≥ baseline)
 *   spread  — actual angular span used (= 2π for closed rim)
 *   angles  — per-chip angles in radians, length n, evenly spaced across spread
 */
function solveRingLayout(opts) {
  const PAD_X = opts.fontSize * 0.6;     // matches _labelWithBg padding
  const chipWidth = opts.maxLabelChars * opts.fontSize * 0.55 + PAD_X * 2;
  const s_min = opts.k * chipWidth;       // minimum arc length between centres

  if (opts.closedRim) {
    // Closed rim: Δθ = 2π fixed. Solve R.
    const rRequired = opts.n * s_min / (2 * Math.PI);
    const radius = Math.max(opts.closedRim.rBaseline, rRequired);
    const angles = Array.from({ length: opts.n }, (_, i) => i * 2 * Math.PI / opts.n);
    return { radius, spread: 2 * Math.PI, angles };
  }

  if (opts.openFan) {
    // Open fan: try to fit at baseline radius, growing spread up to maxSpread.
    // If even maxSpread can't fit, grow radius too.
    const { anchorAngle, maxSpread, rBaseline } = opts.openFan;
    const spreadAtBaseline = (opts.n - 1) * s_min / rBaseline;  // arc-length / r
    let spread, radius;
    if (spreadAtBaseline <= maxSpread) {
      spread = spreadAtBaseline;
      radius = rBaseline;
    } else {
      spread = maxSpread;
      radius = (opts.n - 1) * s_min / maxSpread;
    }
    // Distribute n chips evenly across [-spread/2, +spread/2] around anchorAngle.
    const angles = opts.n === 1
      ? [anchorAngle]
      : Array.from({ length: opts.n }, (_, i) =>
          anchorAngle - spread / 2 + (spread / (opts.n - 1)) * i
        );
    return { radius, spread, angles };
  }

  throw new Error('solveRingLayout: must specify closedRim or openFan');
}
```

### Before — three independent ad-hoc rules

```javascript
// Mela rim (raga_wheel.js, ~line 478)
const R_MELA  = minDim * 0.38;
const angleDeg = (n - 1) * 5;           // 360° / 72 = 5°
const pos = polar(cx, cy, R_MELA, angleDeg);

// Janya fan (raga_wheel.js, _expandMela)
const SPREAD = Math.min(50, janyas.length * 8);
const offset = janyas.length === 1 ? 0
             : -SPREAD / 2 + (SPREAD / (janyas.length - 1)) * i;
const jAngle = melaAngle + offset;
const jPos = polar(cx, cy, R_JANYA, jAngle);

// Composition fan (raga_wheel.js, _expandComps)
const SPREAD = Math.min(40, items.length * 7);
const offset = items.length === 1 ? 0
             : -SPREAD / 2 + (SPREAD / (items.length - 1)) * i;
const cAngle = jAngle + offset;
const cPos = polar(cx, cy, R_COMP, cAngle);
```

### After — three call sites of one solver

```javascript
// Mela rim (drawRagaWheel)
const melaFontSize = Math.max(7, minDim * 0.012);
const melaMaxChars = Math.max(...melaList.map(r => r.name.length));
const melaLayout = solveRingLayout({
  n: 72,
  fontSize: melaFontSize,
  maxLabelChars: melaMaxChars,
  k: _readChipSpacingK(),
  closedRim: { rBaseline: minDim * 0.38 },
});
const R_MELA = melaLayout.radius;

melaList.forEach((raga, i) => {
  const angleRad = melaLayout.angles[i];
  const pos = polarRad(cx, cy, R_MELA, angleRad);
  // ... existing render ...
});

// Janya fan (_expandMela)
const jFontSize = Math.max(7, minDim * 0.011);
const jMaxChars = Math.max(...janyas.map(j => j.name.length));
const NEIGHBOUR_GAP_RAD = (5 * Math.PI / 180) * 0.85;  // 85% of inter-mela gap
const janyaLayout = solveRingLayout({
  n: janyas.length,
  fontSize: jFontSize,
  maxLabelChars: jMaxChars,
  k: _readChipSpacingK(),
  openFan: {
    anchorAngle: melaAngleRad,
    maxSpread: NEIGHBOUR_GAP_RAD,
    rBaseline: R_JANYA,
  },
});
const R_JANYA_actual = janyaLayout.radius;

janyas.forEach((janya, i) => {
  const jAngle = janyaLayout.angles[i];
  const jPos = polarRad(cx, cy, R_JANYA_actual, jAngle);
  // ... existing render ...
});

// Composition fan (_expandComps) — analogous, with R_COMP baseline.
```

### Constants

| Symbol | Source | Default | Rationale |
|---|---|---|---|
| `k` | CSS var `--wheel-chip-spacing-k` | `1.15` | 15 % gap between chip rectangles. Empirically clears the visible overlaps in the screenshots. Tunable without ADR. |
| `R_baseline` (mela) | `minDim * 0.38` | unchanged | Today's value. Solver only *grows* this; never shrinks. |
| `R_baseline` (janya) | `minDim * 0.56` | unchanged | Today's value. |
| `R_baseline` (comp) | `minDim * 0.72` | unchanged | Today's value. |
| `NEIGHBOUR_GAP_RAD` | `(360°/72) · 0.85` | ≈ 0.074 rad | Janya fan can use 85 % of the angular distance to the next mela. Leaves a visible gap between adjacent melas' fans. |
| Chip width formula | matches `_labelWithBg` | `chars · fontSize · 0.55 + 2 · 0.6 · fontSize` | Same constants as the existing chip renderer. |

### What changes vs. what stays

- **Stays**: `R_INNER`, `R_CAKRA`, `R_MUSC`; the cakra colouring; chip styling (ADR-073); cross-panel coupling; the `_expandMela`/`_expandComps` DOM mutations; click handlers.
- **Changes**: the three angle-and-radius computations are replaced by `solveRingLayout` calls. `R_MELA`, `R_JANYA`, `R_COMP` become *outputs* of the solver, not constants.
- **Deletes**: the `SPREAD = Math.min(...)` heuristics in `_expandMela` and `_expandComps`.

---

## Consequences

### Positive

- **No more chip overlap.** The constraint `arcLength ≥ k · chipWidth` is mechanically enforced. The screenshots' failure modes become impossible by construction.
- **Predictable panning.** Chips are evenly spaced everywhere on a ring. A user who pans north-east to find `Vakulābharaṇam` knows it sits exactly `(n-1) · 360°/72` from due north.
- **Self-tuning to mobile.** When `minDim` shrinks, font size shrinks, chip widths shrink, but `s_min = k · chipWidth` shrinks proportionally. Spacing remains visually consistent across viewport sizes.
- **Self-tuning to data growth.** Adding more janyas to a popular mela (e.g. Karaharapriya) makes the fan grow its spread first, then its radius. No re-design needed.
- **Natural extension to ADR-094.** ADR-094 will multiply `R_baseline` by `scale^α` before passing to the solver, then divide it back in the SVG transform. The solver itself doesn't need to change.

### Negative / risks

- **Rings can grow beyond the viewport.** When `R_required > R_baseline`, the rim or fan extends past the visible area. This is the price of the constraint — It relies on ADR-092's pan/zoom to navigate. The fit() action and the existing `centreOn` logic ensure the user is never stranded.
- **Mela rim radius depends on the longest label.** Adding a single very long mela name (say a transliterated form `Bhāṣāṅgakāmbhojī`) inflates the entire rim. This is correct behaviour — the constraint is binding on the worst case — but worth flagging because the *current* rim radius is not data-dependent.
- **One-mela-at-a-time assumption holds.** `NEIGHBOUR_GAP_RAD` is sized assuming only one mela's janyas are expanded at any moment. The expansion-state model in ADR-023 already enforces this. Document the assumption in code comments so a future "expand multiple melas" feature triggers an ADR.
- **Non-integer angles** make per-chip rotation math (the existing rim-label `melaRotDeg = angleDeg ± 90` branches) marginally more complex — but the existing branches use angle modulo 180°, which works in radians too. Mechanical conversion.

### Out of scope

- Changing chip *visual* design (ADR-073 already governs that).
- Adaptive font sizing (e.g. shrink fonts when count grows). The user's framing fixes font size as the *length scale* — it is the independent variable, not a knob to wiggle.
- Rendering overflow chips (e.g. paginating ragas onto multiple rings). With the solver, overflow is handled by growing the ring; pagination would be a different design.
- Per-chip collision avoidance (forces, simulated annealing). The deterministic equal-spacing model is the user-stated goal; per-chip dodging would break panning predictability.

---

## Implementation

(Ownership: Carnatic Coder, after Architect acceptance.)

1. Add `solveRingLayout` as a top-level helper in `raga_wheel.js` (above `drawRagaWheel`). Pure function; no DOM access.
2. Add `_readChipSpacingK()` reading `--wheel-chip-spacing-k` from `:root`, defaulting to `1.15`.
3. Add `polarRad(cx, cy, r, angleRad)` helper alongside `polar()` (existing `polar` takes degrees).
4. In `drawRagaWheel`, replace the rim's `R_MELA = minDim * 0.38` block with a `solveRingLayout({closedRim})` call. Update the rim render loop to read `melaLayout.angles[i]` instead of `(n-1) * 5`.
5. In `_expandMela`, replace `SPREAD = Math.min(50, ...)` with a `solveRingLayout({openFan})` call. Use `melaAngle` (converted to radians) as `anchorAngle`.
6. In `_expandComps`, same treatment. Use the selected janya's resolved angle as `anchorAngle`.
7. Add `--wheel-chip-spacing-k: 1.15;` to the design-tokens CSS file (per ADR-028).
8. Add a comment at the call sites linking to this ADR.
9. Manual smoke test on 360 × 800: every mela chip readable; expanding `Sankarābharanam` shows all janyas without overlap; expanding `Karaharapriya` (high-janya-count) makes the fan grow radius beyond `R_JANYA` baseline as expected.
