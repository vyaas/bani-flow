# ADR-140: Wheel Detail Panel — Mela-Anchored Positioning

**Status**: Accepted  
**Date**: 2026-05-14  
**Agents**: graph-architect, carnatic-coder

---

## Context

The Wheel Detail Panel (`#wheel-detail-panel`, WDP) was introduced in ADR-096 as "Option B": a fixed HTML overlay that replaces the old SVG janya-fan satellites. It is positioned at `top: 8px; left: 8px` of `#cy-wrap` — the top-left corner of the raga wheel canvas.

This hardcoded position breaks the central metaphor of the raga wheel: **all sound emerges from Sa, the centre, outward through the swara rings to the mela arc and beyond**. The WDP is supposed to reveal a mela's musical content — its janya ragas and compositions — but it materialises in a corner that has no spatial relationship to the mela that opened it. The user sees a mela highlight on the wheel and a panel appear somewhere else.

Before ADR-140, the visual journey was:
```
centre → swara rings → mela (highlighted) → ??? → WDP floating top-left
```

The visual journey we want:
```
centre → swara rings → mela → WDP emerging from the mela arc → compositions
```

### Why the janya-fan approach was abandoned

Prior to ADR-096, janyas and compositions fanned outward from the mela as SVG satellite nodes. This produced correct spatial correspondence but failed at scale: popular melas (Kalyāṇi, Shankarābharaṇam) have 100+ janya ragas. Hundreds of SVG chip nodes at `R_JANYA → R_COMP → R_MUSC` radii overflowed the viewport at any practical zoom level. The ADR-093 chip-spacing solver addressed the geometry problem but not the overflow problem. ADR-096 Option B replaced fans with a compact scrollable panel — giving up spatial correspondence for usability.

ADR-140 restores spatial correspondence without reintroducing the fan overflow problem.

---

## Pattern

**Levels of Scale** (Alexander): the mela arc, WDP, and the screen are three nested centres at increasing scale. The WDP should feel like it *belongs to* the mela's angular footprint, not to the screen corner.

**Containment over radiation**: the WDP is not a satellite radiating outward — it is the mela's voice, emerging from its outer edge when clicked. The user's eye moves from centre to mela to panel in one unbroken direction.

---

## Decision

### Rejected alternative: `<foreignObject>` inside `#wheel-viewport`

Moving the WDP into an SVG `<foreignObject>` would make it a true part of the wheel coordinate system. But `#wheel-viewport` carries a compound SVG transform `translate scale rotate`. Any rotation (user rim-drag gesture) would tilt the WDP text, making it unreadable. Additionally, scrollable `<foreignObject>` HTML has known rendering bugs in rotated/scaled SVG contexts. Rejected.

### Chosen approach: Dynamic HTML overlay + zoom-coupled CSS scale

The WDP remains a `position: absolute` HTML `<div>`. Its `left` and `top` are set by JavaScript on every pan/zoom/rotate frame, computed from the mela's SVG position mapped through the current viewport transform. Its visual scale is coupled to the wheel zoom via `transform: scale(s)`.

#### Before

```css
#wheel-detail-panel {
  position: absolute; top: 8px; left: 8px;
  width: 228px; max-height: calc(100% - 60px);
  transition: left 0.22s ease;
  /* ... */
}
```

The WDP always appears at a fixed corner. Desktop and mobile media queries further override `top` and `left` to account for chrome offsets and open drawers.

#### After

```css
#wheel-detail-panel {
  position: absolute;        /* left/top set dynamically by JS */
  width: 228px; max-height: 60vh;
  transform-origin: top left;  /* scale grows panel from its anchor corner */
  /* ... (no top, no left, no transition) */
}
```

```js
// Called once on open and on every _applyTransform() frame:
function _positionWdpAtMela(melaNum) {
  // 1. Compute SVG-local anchor: just outside R_MELA at mela's centre angle
  const thetaDeg = (melaNum - 0.5) * 5;          // clockwise, 0° = 12-o'clock
  const thetaRad = (thetaDeg - 90) * Math.PI / 180;
  const lx = cx + (R_MELA + 12) * Math.cos(thetaRad);
  const ly = cy + (R_MELA + 12) * Math.sin(thetaRad);
  // 2. Apply viewport transform: rotate(deg, cx, cy) then scale then translate
  const rx = cos(rot)*(lx-cx) - sin(rot)*(ly-cy) + cx;
  const ry = sin(rot)*(lx-cx) + cos(rot)*(ly-cy) + cy;
  panel.style.left = (rx * scale + panX) + 'px';
  panel.style.top  = (ry * scale + panY) + 'px';
  panel.style.transform = 'scale(' + scale + ')';
}
```

When a mela is clicked (and `_wheelSyncInProgress` is not set), the viewport pans smoothly to centre the mela in view, preserving current zoom. This uses `requestAnimationFrame` with ease-in-out-cubic over 500 ms.

#### Coordinate transform derivation

SVG `transform="translate(panX,panY) scale(s) rotate(deg cx cy)"` maps a local point `P = (lx, ly)` to screen coordinates as `T = T_translate × T_scale × T_rotate`:

```
1. rotate around (cx, cy):
   dx = lx - cx,  dy = ly - cy
   rx = cos(θ)·dx − sin(θ)·dy + cx
   ry = sin(θ)·dx + cos(θ)·dy + cy

2. scale from origin:
   sx = rx · s,  sy = ry · s

3. translate:
   screenX = sx + panX,  screenY = sy + panY
```

`θ` is `RagaWheel._state.rotation` in radians.

---

## Consequences

### Positive
- **Spatial correspondence restored**: WDP emerges from the mela's outer edge. The visual chain centre → swara rings → mela → WDP → compositions is unbroken.
- **Follows pan/zoom/rotate**: WDP tracks the mela continuously because `_positionWdpAtMela` is called on every `_applyTransform()` invocation.
- **Scales with zoom**: `transform: scale(s)` makes the WDP grow/shrink with the wheel, satisfying "it belongs on that canvas."
- **No content changes**: WDP HTML structure, chip actions, ghost-click guards, mobile behaviour — all unchanged.

### Negative / Risks
- **Off-screen at peripheral melas**: If the mela is near the SVG edge and the WDP extends outward, part of the panel may be outside the viewport. The user must pan to reveal it. This is consistent with the "part of the wheel" metaphor — we do not clamp.
- **Minimum readable scale**: At `scale=0.5` the WDP renders at `transform: scale(0.5)`, making text small (228px → 114px apparent width). This is a known limitation at extreme zoom-out. No mitigation in this ADR.
- **`max-height: 60vh` is viewport-relative, not position-aware**: The panel may extend below the visible area if positioned low on screen. The user can scroll within the panel. Acceptable.

### Removed CSS rules
- `top: 8px; left: 8px` (main block)
- `transition: left 0.22s ease` (JS animation replaces CSS transition)
- Mobile override: `#wheel-detail-panel { top: 8px; max-height: ... }`
- Desktop override: `#main:not(.left-pinned):has(...) #wheel-detail-panel { left: 292px; }`
- Desktop override: `#wheel-detail-panel { top: var(--chrome-top); max-height: ...; }`

---

## Implementation

Delegated to Carnatic Coder. Eight steps:

1. **`base.html` CSS** — Remove `top/left/transition` from main `#wheel-detail-panel` block; add `transform-origin: top left`; set `max-height: 60vh`. Remove the three media-query overrides that set `top`/`left` on the WDP.

2. **`raga_wheel.js` module var** — Add `let _wdpMelaNum = null;` after the existing `let _wdpData = null;`.

3. **`drawRagaWheel()`** — After `RagaWheel._geometry.rOuter = R_MUSC;`, add `RagaWheel._geometry.rMela = R_MELA;`.

4. **`RagaWheel._applyTransform()`** — After the `vp.setAttribute('transform', ...)` call, add: `if (_wdpMelaNum !== null) _positionWdpAtMela(_wdpMelaNum);`

5. **New `_positionWdpAtMela(melaNum)`** — Compute SVG-local anchor, apply viewport transform, set inline `left/top/transform` on panel.

6. **New `_animateWheelToMela(melaNum, durationMs)`** — Compute target pan to centre the mela in view; animate over `durationMs` ms using ease-in-out-cubic RAF loop; reuse `_animRafId`.

7. **`_openWheelDetailPanel(raga)`** — After `panel.classList.add('wdp-open')`: set `_wdpMelaNum = raga.melakarta`, call `_positionWdpAtMela`, call `_animateWheelToMela` (guarded by `!window._wheelSyncInProgress`).

8. **`_closeWheelDetailPanel()`** — Set `_wdpMelaNum = null`; clear inline `left/top/transform` on panel.
