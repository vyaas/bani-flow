# ADR-092: Raga Wheel as a Stateful First-Class Object (Rotation)

**Status**: Proposed
**Date**: 2026-04-23
**Agents**: graph-architect
**Depends on**: ADR-023 (raga wheel third view), ADR-035 (raga wheel touch support), ADR-073 (raga wheel chip parity)
**Related**: ADR-093 (chip spacing radius solver), ADR-094 (zoom-coupled adaptive radii)

---

## Context

### The wheel has no object identity

The raga wheel today is a script that *draws*, not an object that *exists*. Its full state lives as scattered module-level locals inside the IIFE in [`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js):

- `_vx`, `_vy`, `_vscale` — pan/zoom triple
- `_expandedMela`, `_expandedJanya`, `_expandedComp` — expansion state
- `_dragging`, `_dragStartX`, `_dragStartY`, `_dragVX`, `_dragVY`, `_dragMoved` — drag bookkeeping
- `_activePointers`, `_pinchStartDist`, `_pinchStartScale` — pointer state
- `_tapHoldTimer`, `_tapHoldTarget`, `_lastTapTime`, `_lastTapTarget` — gesture classifiers
- `_svgListenerController`, `_labelLayer`, `_tooltipGroup` — DOM bookkeeping

To let outside code (`orientRagaWheel`, `syncRagaWheelToFilter`) participate in pan/zoom, six getter/setter shims are bolted onto `window`:

```javascript
window._wheelGetVx      = () => _vx;
window._wheelGetVy      = () => _vy;
window._wheelGetVscale  = () => _vscale;
window._wheelSetVx      = (v) => { _vx = v; };
window._wheelSetVy      = (v) => { _vy = v; };
window._wheelSetVscale  = (v) => { _vscale = v; };
window._wheelApplyTransform = () => _applyTransform();
```

This is a controller object turned inside out. Every new behaviour (rotation, alignment, programmatic centring) requires another shim, and every consumer must touch raw fields rather than calling actions.

### The wheel does not feel like a wheel

The user's framing:

> "What would aid the experience if the raga wheel actually worked like a wheel — i.e. the user can *rotate* it. This enhances the navigability: the user gets a feeling for the circularity (note that the mela wheel encodes a musical idea as well: it is another interpretation of the circle of fifths)."

The 72-mela rim is a circle. The cakra colouring already encodes its rotational structure. But pan/zoom alone treats it as a flat picture. With long labels (`Vakulābharaṇam`, `Mayāmāḷavagowla`, `Sankarābharaṇam` — see attached screenshots) the rim chips collide with their neighbours at angles where they project onto the same screen-vertical band. There is no user action that *re-orients* the wheel under a different reading axis.

ADR-093 (spacing solver) and ADR-094 (zoom-coupled radii) both need an action surface to attach to — `RagaWheel.rotate(Δθ)`, `RagaWheel.zoom(factor, anchor)`, `RagaWheel.centreOn({type, id})`. Without that surface they would each grow their own ad-hoc shim layer.

---

## Forces

| Force | Direction |
|---|---|
| **Object identity** | The wheel is a singular interactive object. Its state is one tuple `(panX, panY, scale, rotation, expansion)`. A controller object makes that tuple the source of truth and lets every action read/write through one surface. |
| **Composability with ADR-093/094** | The spacing solver (091) and zoom-coupled radii (092) both need to call wheel actions (`zoom`, `centreOn`, re-solve on `rotate`). A named action surface lets them compose without each inventing globals. |
| **Backward compatibility with `orientRagaWheel`** | The existing trigger chain (`triggerBaniSearch` → `applyBaniFilter` → `syncRagaWheelToFilter` → `orientRagaWheel` → `animateCentreOnTarget`) reads `window._wheelGet*` and writes `window._wheelSet*`. The new controller must keep these shims as thin delegates so cross-panel coupling (ADR-025) keeps working without a coordinated rewrite. |
| **Gesture classifier discipline** | Adding a fourth gesture (rotate) on top of pan, pinch-zoom, and tap means the classifier must distinguish *translational* drag from *angular* drag. The simplest discriminator is **where** the pointer started: outside the outermost ring (`R_MUSC`) → rotate; inside → pan. This is geometric and stateless, so no new classifier ambiguity. |
| **Pinch coexistence** | Two-pointer interactions are pinch-zoom (per ADR-035). Rotation is single-pointer rim drag. A second pointer landing during a rotation drag must end the rotation cleanly, exactly as it does for pan today. |
| **Label readability under rotation** | The user explicitly chose: *labels rotate with the wheel.* A user re-aligns a label by rotating the wheel until it sits under their reading axis. This preserves the wheel gestalt and removes the need for per-label counter-rotation logic. |
| **`fit()` semantics** | Today's double-tap and `wheelFit()` reset `_vx, _vy, _vscale` to identity. With rotation added, `fit()` is a "panic button" affordance (per ADR-035) and must reset rotation too — otherwise users have no zero-state recovery. |
| **Transform composition order** | Pan, zoom, and rotation must compose in a fixed order so all three actions remain orthogonal. Order: rotate around centre, then pan, then scale. This keeps rotation centred regardless of pan, and keeps pan/zoom feeling identical to today when rotation = 0. |

---

## Pattern

**Strong Centres** (Alexander): the wheel is a strong centre — its identity is the disc itself, not the chips that decorate it. Promoting it to a controller object names that centre and gives it agency.

**Boundaries** (Alexander): the outermost ring `R_MUSC` is already a visual boundary. Repurposing it as the rotation hit-region uses the existing boundary to disambiguate gesture intent — *what's outside the wheel acts on the wheel as a whole; what's inside acts on its contents*.

**Levels of Scale**: pan, zoom, rotate, expand are four named actions at the wheel level; click, hover, tap-hold are actions at the chip level. The controller surface separates the two scales.

---

## Decision

### Before — scattered locals + window shims

```javascript
// raga_wheel.js (today)
let _vx = 0, _vy = 0, _vscale = 1;
let _dragging = false, _dragStartX = 0, /* ... */;

function _applyTransform() {
  const vp = document.getElementById('wheel-viewport');
  if (vp) vp.setAttribute('transform', `translate(${_vx},${_vy}) scale(${_vscale})`);
}

window._wheelGetVx     = () => _vx;
window._wheelSetVx     = (v) => { _vx = v; };
window._wheelGetVy     = () => _vy;
// ... six total shims
window._wheelApplyTransform = () => _applyTransform();
```

```javascript
// orientRagaWheel (today, outside the IIFE)
function animateCentreOnTarget(targetX, targetY, scale) {
  const startVx = window._wheelGetVx();
  const startVy = window._wheelGetVy();
  const startVscale = window._wheelGetVscale();
  // ... 600ms RAF loop calling _wheelSet* and _wheelApplyTransform
}
```

### After — `RagaWheel` controller with a named action surface

```javascript
// raga_wheel.js (proposed)
const RagaWheel = {
  // ── Orientation state (single source of truth) ──
  _state: {
    panX: 0,
    panY: 0,
    scale: 1,
    rotation: 0,            // radians, clockwise
  },

  // ── Geometry (set per-draw by drawRagaWheel) ──
  _geometry: {
    cx: 0, cy: 0,           // wheel centre in SVG coords
    rOuter: 0,              // R_MUSC — rim-drag hit boundary
  },

  // ── Public actions ──
  pan(dx, dy)              { /* update panX/Y, applyTransform() */ },
  zoom(factor, anchor)     { /* update scale around anchor (defaults to centre) */ },
  rotate(dTheta, anchor)   { /* update rotation around anchor (defaults to centre) */ },
  fit()                    { /* reset panX, panY, scale, rotation to identity */ },
  centreOn({type, id})     { /* resolves node DOM position, animates pan+zoom */ },
  alignLabelTo(angleRad)   { /* rotate so the named angle sits at the top of the wheel */ },

  // ── Internal ──
  _applyTransform() {
    const { panX, panY, scale, rotation } = this._state;
    const { cx, cy } = this._geometry;
    const vp = document.getElementById('wheel-viewport');
    if (!vp) return;
    // Order: rotate around (cx, cy), then pan, then scale.
    const deg = rotation * 180 / Math.PI;
    vp.setAttribute('transform',
      `translate(${panX},${panY}) scale(${scale}) ` +
      `rotate(${deg} ${cx} ${cy})`
    );
  },

  // ── Hit-test for rim-drag rotation gesture ──
  isRimDrag(svgX, svgY) {
    const { cx, cy, rOuter } = this._geometry;
    return Math.hypot(svgX - cx, svgY - cy) > rOuter;
  },
};

// Back-compat shims — orientRagaWheel keeps working without changes.
window._wheelGetVx          = () => RagaWheel._state.panX;
window._wheelGetVy          = () => RagaWheel._state.panY;
window._wheelGetVscale      = () => RagaWheel._state.scale;
window._wheelSetVx          = (v) => { RagaWheel._state.panX = v; };
window._wheelSetVy          = (v) => { RagaWheel._state.panY = v; };
window._wheelSetVscale      = (v) => { RagaWheel._state.scale = v; };
window._wheelApplyTransform = () => RagaWheel._applyTransform();
window.RagaWheel            = RagaWheel;
```

### The full action surface

| Action | Signature | Behaviour |
|---|---|---|
| `pan(dx, dy)` | screen-space delta in px | Adds to `panX, panY`. Applied after rotation in transform order. |
| `zoom(factor, anchor)` | `factor` ∈ ℝ⁺, `anchor = {x, y}` in SVG coords (defaults to wheel centre) | Multiplies `scale` clamped to `[ZOOM_MIN, ZOOM_MAX]`. Adjusts pan so `anchor` is the fixed point. ADR-094 will extend this to re-solve radii on zoom-end. |
| `rotate(dTheta, anchor)` | `dTheta` in radians, `anchor` defaults to wheel centre | Adds to `rotation`, normalised to `[-π, π]`. With `anchor = centre` (the only call site), pan is unchanged; with off-centre anchor (reserved for future), pan compensates so `anchor` is the fixed point. |
| `fit()` | — | Resets `panX, panY, rotation` to 0 and `scale` to 1. Replaces `wheelFit()`. |
| `centreOn({type, id})` | `type` ∈ `'mela' \| 'janya' \| 'composition'`, `id` is the JSON id | Resolves the node's DOM position, animates `pan` and `scale` over 600 ms (existing `animateCentreOnTarget` semantics). Does *not* touch `rotation` — programmatic centring respects user-chosen rotation. |
| `alignLabelTo(angleRad)` | radians (0 = top of wheel) | Sets `rotation` so the named wheel-angle sits at screen-up. Used by future "click a chip to rotate it under reading axis" affordance (out of scope for ADR-092 — provided so 093/094 don't have to invent it). |

### Rim-drag rotation gesture binding

In `pointerdown`, classify the gesture by hit-test:

```javascript
svg.addEventListener('pointerdown', (e) => {
  // ... existing setup ...
  if (_activePointers.size === 1) {
    const { x, y } = _svgPoint(svg, e.clientX, e.clientY);
    if (RagaWheel.isRimDrag(x, y)) {
      _gestureMode = 'rotate';
      _rotateStartAngle = Math.atan2(y - RagaWheel._geometry.cy,
                                     x - RagaWheel._geometry.cx);
      _rotateStartRotation = RagaWheel._state.rotation;
    } else {
      _gestureMode = 'pan';
      // ... existing pan setup ...
    }
  } else if (_activePointers.size === 2) {
    _gestureMode = 'pinch';
    // Pinch suppresses rotation: a second pointer landing during a rim drag
    // ends rotation cleanly via the existing pinch-takeover path.
  }
});
```

In `pointermove`, when `_gestureMode === 'rotate'`:

```javascript
const { x, y } = _svgPoint(svg, e.clientX, e.clientY);
const currentAngle = Math.atan2(y - RagaWheel._geometry.cy,
                                x - RagaWheel._geometry.cx);
const delta = currentAngle - _rotateStartAngle;
RagaWheel._state.rotation = _rotateStartRotation + delta;
RagaWheel._applyTransform();
```

The classifier is geometric and stateless: rim drag iff the pointer started outside `R_MUSC`. Tap-vs-drag movement threshold (5 px) still applies, and a tap on the rim region still falls through to chip click handlers (musician chips live at `R_MUSC`). The classifier checks `isRimDrag` only when the initial pointer landed on the SVG background, not on a chip element.

### Transform composition order

```
M_total = T(panX, panY) · S(scale) · R(rotation, cx, cy)
```

Read right-to-left in SVG space: rotate the wheel about its own centre, then scale, then translate. Consequences:

- With `rotation = 0`, the transform is identical to today's `translate(panX,panY) scale(scale)`.
- Rotation is centred on the wheel, not on the viewport. Panning the wheel off-centre and rotating still rotates the wheel about its own centre (the user's mental model: you grab the rim of the disc and spin it).
- Zoom anchor math (the existing `_vx = mx - factor * (mx - _vx)` in the wheel-zoom handler) keeps working because rotation is innermost — the anchor compensation is in pan/scale space.

---

## Consequences

### Positive

- **Single source of truth for wheel state.** Every action reads/writes `RagaWheel._state`. No scattered locals.
- **ADR-093 and ADR-094 compose cleanly.** They call `RagaWheel.zoom()` and react to `rotate` via the same hook (`_applyTransform` + an optional `onTransformChange` callback that 094 can debounce-subscribe to for radius re-solving).
- **Cross-panel coupling unaffected.** `orientRagaWheel`, `syncRagaWheelToFilter`, and the trigger chain keep using `window._wheelGet*` shims, now backed by the controller. No coordinated rewrite required.
- **Rim-drag rotation is gesturally unambiguous.** The hit-test is geometric, stateless, and cheap. There is no mode toggle the user must discover.
- **Wheel feels like a wheel.** The user's circle-of-fifths intuition becomes operable.

### Negative / risks

- **Gesture-mode locals (`_gestureMode`, `_rotateStartAngle`, `_rotateStartRotation`) are new.** They live alongside `_dragging`, `_pinchStartDist`. The classifier sets `_gestureMode` once on `pointerdown` and reads it in `pointermove`/`pointerup`. Adds three locals; removes the implicit "pan if dragging else pinch" branching.
- **`R_MUSC` is currently the musician-satellite ring radius (`minDim * 0.88`).** When no expansion is active, the area outside `R_MUSC` is mostly empty and a natural rim-drag region. When musicians are expanded, their chips sit *on* `R_MUSC`. The classifier must check chip-element hit before rim hit (it already does — the SVG background `bg` rect is the only element where rim-drag is meaningful). Document in Implementation.
- **Long-press inspector (`openMetaInspector`) must skip rotation drags.** The existing `_dragMoved` flag already gates this — once the pointer moves > 5 px, `_cancelTapHoldTimer()` runs. Rotation drags by definition move > 5 px, so this works without changes.
- **`wheelFit()` callers** (double-tap on background, `bg` button) must call `RagaWheel.fit()` instead. One symbol rename across the file.

### Out of scope

- The actual radius-spacing solver (ADR-093).
- Zoom-coupled radii (ADR-094).
- Persisting rotation across `drawRagaWheel()` rebuilds — not needed; rebuilds happen during `syncRagaWheelToFilter`, which is itself a programmatic re-orient where rotation reset is acceptable. (Defer revisiting if user feedback says otherwise.)
- Off-centre `rotate(anchor)` calls — the API accepts the parameter for forward-compat but the only call site uses centre.
- A `RagaWheel.reset()` distinct from `fit()` — they are the same operation today.

---

## Implementation

(Ownership: Carnatic Coder, after Architect acceptance. Listed for completeness, not as part of this ADR.)

1. Wrap state in `RagaWheel` object inside the IIFE; replace `_vx, _vy, _vscale` reads/writes with `RagaWheel._state.{panX,panY,scale}` (mechanical).
2. Add `RagaWheel._state.rotation`, initialised to 0.
3. Implement `RagaWheel._applyTransform()` with the three-term transform; replace existing `_applyTransform()` body.
4. Implement `RagaWheel.pan/zoom/rotate/fit/centreOn/alignLabelTo` actions. `centreOn` wraps the existing `animateCentreOnTarget` loop.
5. Set `RagaWheel._geometry = { cx, cy, rOuter: R_MUSC }` at the top of `drawRagaWheel()`.
6. Add `isRimDrag(x, y)` hit-test; thread into `pointerdown` to set `_gestureMode`.
7. Add `pointermove` branch for `_gestureMode === 'rotate'`.
8. Replace `wheelFit()` with `RagaWheel.fit()`; update double-tap and any UI button.
9. Keep `window._wheelGet*`/`_wheelSet*`/`_wheelApplyTransform` as thin delegates (backward compatibility for `orientRagaWheel`).
10. Smoke test: pan, pinch-zoom, rim-drag rotate, double-tap fit, programmatic `centreOn` from cross-panel click — all four actions compose without visual jumps.
