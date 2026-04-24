# ADR-094: Zoom-Coupled Adaptive Radii

**Status**: Proposed
**Date**: 2026-04-23
**Agents**: graph-architect
**Depends on**: ADR-092 (raga wheel as stateful object), ADR-093 (chip spacing radius solver)
**Related**: ADR-035 (raga wheel touch support)

---

## Context

### Zooming today is a uniform scale

Pinch-zoom and the mouse `wheel` handler both multiply `_vscale` and re-apply the SVG transform `translate(panX,panY) scale(scale)`. Everything inside `#wheel-viewport` — chip text, chip rectangles, ring radii, connector lines — scales by the same factor.

The user can already zoom from `0.5×` to `4×`. But the *angular* density of chips on the rim is unchanged: at `2×` the rim is twice as long, but each chip is twice as wide, so chip-to-chip arc length per chip width is identical to `1×`. Zooming does not relieve crowding; it just enlarges everything together. The user can move closer to the picture but cannot **open it up**.

### What ADR-093 provides

ADR-093's solver guarantees no chip overlap *at the current draw scale*. It is called once per `drawRagaWheel()` rebuild with `R_baseline = minDim * 0.38` etc. The chip widths used in the constraint are computed at the solver's `fontSize` argument. After the solver runs, the SVG is built with those radii and that font size, and the wheel transform applies a uniform `scale` factor on top.

So ADR-093 alone solves crowding at a single zoom level. To solve it *across* zoom levels — and to honour the user's framing that "the circles need to be dynamic, i.e. their radii should change according to the zoom level" — radii must grow **faster** than chip width as the user zooms in.

### The user's framing

> "The circles need to be dynamic, i.e. their radii should change according to the zoom level."

Combined with the spacing constraint from ADR-093, this means: when the user zooms in, the rings should bloom outward, opening up arc-length between chips. When the user zooms out, the rings should contract back to their solver baseline, since zooming out *should* tighten the layout — that is the user's intent in zooming out.

---

## Forces

| Force | Direction |
|---|---|
| **Zooming should reveal structure** | Levels of Scale: zooming should not just enlarge a fixed picture, it should expose finer relationships. Today's uniform scale is a flat enlargement. A zoom that opens up chip gaps lets the user *resolve* labels and click targets that were crowded together. |
| **Chip text should stay legible** | Chip width tracks chip text. If radii grow super-linearly with zoom but chip text grows linearly, chip width grows linearly too — and arc-length-per-chip-width grows by the *difference*. To make this concrete: at `α = 1.4`, zoom `2×` makes radii grow by `2^1.4 ≈ 2.64×` while text grows by `2×`. Net arc-length-per-chip-width gain: `1.32×`. The wheel "opens" by 32 % at `2×` zoom. |
| **Don't over-shrink chip text on zoom-in** | The user expects zooming in to make text *bigger*, not the same. Implementation: scale the text the SVG transform's normal way (i.e. `chipText_screen = chipText_solver · scale`); only the *radii* get the extra `scale^(α-1)` factor. |
| **Fall back at scale = 1** | The solver baseline must hold at scale = 1 (so the wheel looks identical to ADR-093 alone in the fit/default state). This is automatic: `scale^α = 1^α = 1` and the `scale^(α-1)` correction is also 1. |
| **Re-solve, don't just re-position** | When radii change, the solver's open-fan branch may want to re-distribute chips (collapse spread back toward its baseline if the larger radius now has angular budget to spare). So zoom changes call `solveRingLayout` with the new effective radii, not just multiply existing positions. |
| **Don't thrash on every zoom frame** | Pinch-zoom fires `pointermove` at 60 Hz. Re-solving the layout and rebuilding satellite SVG groups every frame would jank. Re-solve must be **debounced to zoom-end** (≈ 100 ms idle after the last zoom delta). During the gesture, the SVG transform's `scale` carries the visual feedback. |
| **Rotation composes** | Rotation from ADR-092 acts on the centred wheel before scale and pan; the radius re-solve does not interact with rotation. |
| **Pinch must lock rotation** | Two-pointer pinch is unambiguously zoom (per ADR-035 + ADR-092). Rim-drag rotation is single-pointer. The two cannot fire simultaneously, so no interaction term. |
| **Transform composition order with α correction** | The cleanest implementation is to keep the solver's outputs in *absolute SVG coordinates* (radii multiplied by `scale^α`) and then have the SVG transform apply `scale^(α-1) / α = scale^(1-α) · scale = scale` … no, the cleaner factoring is below. |

---

## Pattern

**Levels of Scale** (Alexander): zooming reveals more detail. A tightly packed rim at scale 1 is a single visual unit ("the rim of the wheel"); zoomed to 2× with super-linear radii, individual chips become first-class units with breathing room.

**Direct manipulation feedback** (Shneiderman): pinch-zoom is a continuous gesture. The user expects continuous visual feedback during the gesture, not a jump at the end. Solution: the SVG transform handles continuous feedback; the solver re-runs on gesture-end to commit the new layout. The user sees "zoom in continuously, then a soft re-flow when I let go" — exactly the affordance of zooming a map and seeing it re-label.

---

## Decision

### The exponent α

```
R_effective(scale) = R_baseline · scale^α          where α = 1.4
```

`α` is a CSS custom property `--wheel-radius-zoom-exponent` defaulting to `1.4`. Bounds: `1.0 ≤ α ≤ 2.0`. At `α = 1.0` the system degenerates to today's uniform scale (no opening). At `α = 2.0` radii grow with the *square* of zoom — chips become very sparse very quickly. Empirically `1.4` opens the rim noticeably without making the wheel feel unwieldy.

### Two-stage transform

The SVG viewport transform from ADR-092 was:

```
M = T(panX, panY) · S(scale) · R(rotation, cx, cy)
```

With ADR-092, the `scale` factor in the SVG transform is **divided by `scale^(α−1)`** so chip text remains at solver-determined screen size:

```
M = T(panX, panY) · S(scale / scale^(α−1)) · R(rotation, cx, cy)
  = T(panX, panY) · S(scale^(2−α)) · R(rotation, cx, cy)
```

And the solver is called with **R_baseline · scale^α** as its `rBaseline`:

```
solveRingLayout({ ..., closedRim: { rBaseline: R_MELA_baseline * scale^α } })
```

Net effect at scale `s`:

| Quantity | Formula | At s = 1 | At s = 2 |
|---|---|---|---|
| Effective radius (model space) | `R_baseline · s^α` | `R_baseline` | `R_baseline · 2.64` |
| Effective radius (screen space, after transform) | `R_baseline · s^α · s^(2−α)` = `R_baseline · s^2`… | wait |

Let me redo this with the *correct* factoring. The screen-space radius equals model-space radius multiplied by the SVG transform's scale factor. We want **screen-space radius to grow as `s^α`**, and **screen-space chip text to grow as `s`** (i.e. normal zoom behaviour for text).

| Approach | Model-space radius | SVG-transform scale | Screen radius | Screen text |
|---|---|---|---|---|
| Today (uniform) | `R_baseline` | `s` | `R_baseline · s` | `text · s` |
| **ADR-094** | `R_baseline · s^(α−1)` | `s` | `R_baseline · s^α` ✓ | `text · s` ✓ |

**Corrected decision**: keep the SVG transform's scale factor unchanged at `s`. Pass `R_baseline · s^(α−1)` as the solver's `rBaseline` argument. Chip text in model space stays at the solver's `fontSize`; the SVG transform multiplies it by `s` to give normal zoom-text behaviour. Radii in model space get the extra `s^(α−1)` factor; the SVG transform multiplies that by `s` to give `s^α` total. Pure.

This means **only the radii passed into the solver depend on `α`**. The transform itself stays as ADR-092 defined it. The two-stage trick lives entirely in the solver call.

```javascript
// Inside drawRagaWheel — replaces the bare R_MELA_baseline / R_JANYA_baseline / R_COMP_baseline
const s = RagaWheel._state.scale;
const alpha = _readRadiusZoomExponent();   // CSS var, default 1.4
const radiusGain = Math.pow(s, alpha - 1); // 1 at s=1, ~1.32 at s=2

const R_MELA  = minDim * 0.38 * radiusGain;
const R_JANYA = minDim * 0.56 * radiusGain;
const R_COMP  = minDim * 0.72 * radiusGain;
// ... pass these as rBaseline to solveRingLayout (per ADR-093).
```

### Re-solve discipline

Re-solving the layout means rebuilding satellite SVG groups (the `_expandMela` / `_expandComps` code paths). Doing this every `pointermove` would jank.

**Discipline**:

1. During the gesture (pinch frames, mouse-wheel ticks): only `RagaWheel._state.scale` changes; the SVG transform updates; chip positions visually scale uniformly.
2. On gesture end (last `pointermove` followed by 100 ms of idle, or `pointerup` for pinch, or `wheel`-event idle for mouse-wheel zoom): call `RagaWheel._onZoomSettled()`, which:
   - Recomputes `R_MELA, R_JANYA, R_COMP` using `radiusGain = s^(α−1)`.
   - Re-runs `solveRingLayout` for the rim and any currently-expanded fan.
   - Calls `drawRagaWheel()` to rebuild SVG with the new positions.
   - The transform scale resets to the new `s` — no visual jump, because the model-space coordinates moved by exactly the factor that the transform was visually applying mid-gesture.

Subtle but important: when `_onZoomSettled` runs, it must subtract the visual "gain" that the SVG transform was providing during the gesture, replacing it with model-space radii. Concretely, after `drawRagaWheel()` rebuilds at the new `s`, model coordinates have grown by `s^α / s = s^(α−1)` compared to before the gesture started, which is exactly the radiusGain factor. The transform's `scale = s` then gives the same on-screen result. Mid-gesture and post-rebuild render the same pixels — no jump.

### Debounce condition

```javascript
let _zoomSettleTimer = null;
RagaWheel.zoom = function(factor, anchor) {
  // ... existing scale update + transform apply ...
  clearTimeout(_zoomSettleTimer);
  _zoomSettleTimer = setTimeout(() => {
    _zoomSettleTimer = null;
    RagaWheel._onZoomSettled();
  }, 100);
};
```

100 ms idle is the standard "user paused" threshold. Pinch gestures naturally have a `pointerup` that can also trigger settle immediately:

```javascript
function _onPointerEnd(e) {
  // ... existing logic ...
  if (_activePointers.size === 0 && _gestureMode === 'pinch') {
    clearTimeout(_zoomSettleTimer);
    RagaWheel._onZoomSettled();
  }
}
```

### Constants

| Symbol | Source | Default | Bounds | Rationale |
|---|---|---|---|---|
| `α` | CSS var `--wheel-radius-zoom-exponent` | `1.4` | `[1.0, 2.0]` | Empirical: opens rim by ~32 % at 2× zoom; ~74 % at 4× zoom. |
| Settle debounce | const in raga_wheel.js | `100` ms | — | Standard pause-threshold; balances responsiveness against thrash. |

### Order of operations (for clarity)

```
User pinch-zooms from 1× to 2×
  ↓
pointermove fires at 60 Hz
  RagaWheel._state.scale: 1 → 1.05 → 1.10 → ... → 2.0
  SVG transform updates each frame: visual zoom is smooth
  Debounce timer reset on every frame
  ↓
pointerup fires
  _gestureMode === 'pinch' → call _onZoomSettled() immediately
  ↓
_onZoomSettled()
  radiusGain = 2^0.4 ≈ 1.32
  R_MELA, R_JANYA, R_COMP grow by 1.32× (model space)
  solveRingLayout re-runs:
    - Rim: more arc length per chip → still even spacing, but with bigger gaps in screen coordinates
    - Active fan (if any): may collapse spread back toward baseline since more arc length is available
  drawRagaWheel() rebuilds SVG
  Transform: translate(panX,panY) scale(2) rotate(0 cx cy)
  Visually: chips re-flow into their less-crowded positions
```

---

## Consequences

### Positive

- **Zoom now opens the wheel.** The user's stated intent ("the circles need to be dynamic… their radii should change according to the zoom level") is honoured.
- **Composes with ADR-093.** No solver changes — only the `rBaseline` input changes per zoom.
- **No mid-gesture jank.** Debouncing keeps the gesture smooth; the re-flow happens once on settle.
- **Tunable.** Both `α` and the debounce live in CSS / const — no ADR cycle for adjustment.
- **Degenerate at scale = 1.** Wheel looks identical to ADR-093 alone in the default state. New behaviour only manifests when the user zooms.

### Negative / risks

- **A perceptible "soft re-flow" on zoom end.** Chips in expanded fans may visibly shift position 100 ms after the user lifts their fingers. This is the standard "zoom + relabel" affordance from maps; users understand it. The rim chips do not move (their positions are mathematically identical: `i · 2π/72`, just at a different radius), so the re-flow is confined to the active fan.
- **Two-pointer pinch on mobile must call `_onZoomSettled()` immediately on `pointerup`** rather than waiting for the 100 ms debounce — otherwise the user lifts fingers and waits 100 ms before seeing the re-flow. The decision section above specifies this.
- **Mouse-wheel zoom uses the debounce path only.** A user spinning the wheel through many ticks will see one soft re-flow at the end, not many during. Acceptable — and arguably better than re-flowing on every tick.
- **Off-screen chips when zoomed in.** Bigger radii push chips off the viewport. Pan + the existing `centreOn` action handle navigation; ADR-092's `RagaWheel.fit()` resets to default. Same trade-off as ADR-093.

### Out of scope

- Dynamic font sizing on zoom (chip text could shrink slightly when zooming in to amplify the "opening" effect). Not part of the user's framing.
- Per-ring α (different α for mela vs janya vs comp). One α for now; can be split later if needed.
- Animating the re-flow (smooth tween from old to new chip positions). The 100 ms settle plus a fresh `drawRagaWheel()` is a snap, not a tween. Animation could be added later under a separate ADR.

---

## Implementation

(Ownership: Carnatic Coder, after Architect acceptance.)

1. Add `--wheel-radius-zoom-exponent: 1.4;` to the design tokens CSS file.
2. Add `_readRadiusZoomExponent()` helper alongside `_readChipSpacingK()` (from ADR-093).
3. In `drawRagaWheel`, compute `radiusGain = Math.pow(RagaWheel._state.scale, alpha - 1)` and multiply each baseline radius (`minDim * 0.38`, `* 0.56`, `* 0.72`) by it before passing to `solveRingLayout` (per ADR-093).
4. Add `RagaWheel._onZoomSettled()` method: rebuilds SVG via `drawRagaWheel()`, preserving expansion state.
5. Wrap `RagaWheel.zoom()` with the 100 ms debounce timer.
6. In `_onPointerEnd`, when the last pointer of a pinch lifts, clear the debounce timer and call `_onZoomSettled()` immediately.
7. Smoke test: pinch-zoom from 1× to 2× on a viewport showing `Sankarābharanam` expanded; on lift, verify janya chips have re-spaced themselves with visibly more breathing room. Pinch-zoom out to 0.7×; verify rim contracts back toward baseline (rim chips' radius decreases proportionally, chip widths follow, spacing constraint still holds).
8. Verify `RagaWheel.fit()` resets `scale → 1`, triggers `_onZoomSettled()`, and the wheel returns to the ADR-093 baseline layout.
