# ADR-035: Mela-Janya Wheel Touch Support — Pointer Events, Pinch-Zoom, Long-Press

**Status:** Proposed
**Date:** 2026-04-18

---

## Context

The Mela-Janya SVG wheel is completely inoperable on touch devices. Its pan/zoom
event handlers use mouse-only events (`mousedown`, `mousemove`, `mouseup`, `wheel`).
On mobile, these events either do not fire (scroll wheel) or trigger browser-level
scrolling/zooming instead of wheel pan/zoom.

### Current event handler architecture (raga_wheel.js)

The wheel currently maintains pan/zoom state via flag variables:

```javascript
let _vx = 0, _vy = 0;       // current pan translation
let _scale = 1.0;            // current zoom scale
let _dragging = false;
let _dragStartX = 0, _dragStartY = 0;
let _dragMoved = false;      // prevents accidental dblclick-after-pan
```

Event wiring (approximate, based on code exploration):
```javascript
svgEl.addEventListener('mousedown', (e) => { _dragging = true; ... });
svgEl.addEventListener('mousemove', (e) => { if (_dragging) { pan... } });
svgEl.addEventListener('mouseup',   (e) => { _dragging = false; });
svgEl.addEventListener('dblclick',  (e) => { wheelFit(); });
svgEl.addEventListener('wheel',     (e) => { zoom... });
```

Node interaction for click vs drag disambiguation uses `_dragMoved`:
```javascript
if (!_dragMoved) openMetaInspector('mela', melaData);
```

### What breaks on mobile

1. `mousedown`/`mousemove`/`mouseup` — do not fire on mobile Chrome/Safari/Firefox by
   default on touch events (these browsers only synthesize a `click` from touch, not the
   full mouse event sequence during drag).
2. `wheel` event — not fired by pinch gesture; browser uses pinch for page zoom instead.
3. The drag `_dragMoved` flag is never set because the drag handlers never fire; this
   means `openMetaInspector` (gated by `!_dragMoved`) may fire erroneously after a
   swipe gesture resolves to a synthetic `click`.
4. `dblclick` for `wheelFit()` — unreliable on mobile (see ADR-033).

### Why not just use `touchstart`/`touchmove` directly?

The `Touch Events API` is phone-specific. Using it creates a dual code path: one for
mouse, one for touch. The **Pointer Events API** (W3C standard, supported in all modern
browsers including iOS Safari 13+, Chrome Android, Samsung Internet) provides a unified
event model that works for mouse, touch, and stylus with a single handler set.

Pointer Events is the correct choice for this refactor.

---

## Forces in tension

| Force | Direction |
|---|---|
| **Zero regressions on desktop** | The existing mouse pan/zoom/click behaviour must be preserved exactly. Pointer Events are a superset of mouse events — the refactor can be a drop-in replacement. |
| **Touch naturalness** | Pinch-zoom is the universal phone zoom gesture. Single-finger drag is the universal pan gesture. Any other model creates friction. |
| **Drag/tap disambiguation** | The `_dragMoved` guard is critical: it prevents an accidental metadata inspector open when the user was trying to pan. This logic must survive the refactor. |
| **Long-press for inspector** | ADR-033 establishes that long-press (taphold) replaces dblclick for the metadata inspector on mobile. This requires a timer-based touchhold pattern on top of the Pointer Events handlers. |
| **SVG hit targets** | The circular node hit areas in the wheel are designed for cursor precision (hover states appear at exact circle edges). On mobile, finger touch is ~10mm = ~38px in CSS pixels at 1x density. Node radii may be too small. |

---

## Pattern

**Unified input abstraction** (Pointer Events API): treat mouse, touch, and stylus as
a single input type. Register one set of handlers. The `pointerType` property
(`'mouse'` | `'touch'` | `'pen'`) is available if behaviour must diverge.

**State machine for multi-touch**: extend the existing boolean `_dragging` state to a
`Map<pointerId, {x, y}>` structure. One active pointer = pan. Two active pointers =
pinch. Zero active pointers = idle.

---

## Decision

### 1. Replace mouse event handlers with Pointer Events

**Before:**
```javascript
svgEl.addEventListener('mousedown', onMouseDown);
svgEl.addEventListener('mousemove', onMouseMove);
svgEl.addEventListener('mouseup',   onMouseUp);
svgEl.addEventListener('mouseleave', onMouseLeave);
```

**After:**
```javascript
svgEl.addEventListener('pointerdown',  onPointerDown);
svgEl.addEventListener('pointermove',  onPointerMove);
svgEl.addEventListener('pointerup',    onPointerEnd);
svgEl.addEventListener('pointercancel',onPointerEnd);
```

`pointerleave` / `pointercancel` replace `mouseleave` to handle touch cancellation
(e.g., incoming phone call interrupts a gesture).

### 2. Multi-pointer state for pinch-zoom

```javascript
const _activePointers = new Map();  // pointerId → {x, y}

function onPointerDown(e) {
  e.preventDefault();               // prevents page scroll during drag
  svgEl.setPointerCapture(e.pointerId);  // track pointer outside SVG bounds
  _activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (_activePointers.size === 1) {
    // Single pointer: start pan
    _dragging = true;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _dragMoved = false;
    startTapHoldTimer(e);  // see §4
  } else if (_activePointers.size === 2) {
    // Second pointer: transition from pan to pinch
    cancelTapHoldTimer();
    _dragMoved = true;       // suppress any tap action when second finger lands
    _pinchStartDist = getPinchDistance();
    _pinchStartScale = _scale;
  }
}

function onPointerMove(e) {
  if (!_activePointers.has(e.pointerId)) return;
  _activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (_activePointers.size === 1 && _dragging) {
    const dx = e.clientX - _dragStartX;
    const dy = e.clientY - _dragStartY;
    if (Math.hypot(dx, dy) > 5) {
      _dragMoved = true;
      cancelTapHoldTimer();
    }
    _vx += dx;
    _vy += dy;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    redrawWheel();

  } else if (_activePointers.size === 2) {
    const newDist = getPinchDistance();
    const delta = newDist / _pinchStartDist;
    _scale = Math.max(0.3, Math.min(4.0, _pinchStartScale * delta));
    redrawWheel();
  }
}

function onPointerEnd(e) {
  _activePointers.delete(e.pointerId);
  cancelTapHoldTimer();
  if (_activePointers.size < 2) {
    _pinchStartDist = null;
  }
  if (_activePointers.size === 0) {
    _dragging = false;
    // _dragMoved remains set until the next pointerdown
  }
}

function getPinchDistance() {
  const pts = [..._activePointers.values()];
  return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
}
```

### 3. Retain scroll wheel for desktop

`wheel` event is mouse-only and can remain as-is. On desktop, both `wheel` and
pointer-based pan/zoom work simultaneously with no conflict (they use different
code paths):

```javascript
svgEl.addEventListener('wheel', onWheelZoom, { passive: false });
// (unchanged from current implementation)
```

### 4. Long-press (taphold) via timer

Per ADR-033, long-press opens the metadata inspector on mobile, replacing dblclick.
Implemented as a timer that clears if the pointer moves more than 5px:

```javascript
let _tapHoldTimer = null;
let _tapHoldTarget = null;

function startTapHoldTimer(e) {
  _tapHoldTarget = e.target;
  _tapHoldTimer = setTimeout(() => {
    if (_tapHoldTarget) {
      const nodeData = getNodeDataFromElement(_tapHoldTarget);
      if (nodeData) openMetaInspector(nodeData.type, nodeData);
    }
  }, 500);
}

function cancelTapHoldTimer() {
  clearTimeout(_tapHoldTimer);
  _tapHoldTimer = null;
  _tapHoldTarget = null;
}
```

`getNodeDataFromElement` walks the SVG element's `data-` attributes or matches against
the closest `[data-node-id]` ancestor — the exact pattern matches how nodes are
currently identified in `raga_wheel.js`.

### 5. Double-tap-background for wheelFit()

The existing `dblclick` handler on the SVG background for `wheelFit()` still fires on
desktop (no change). On mobile, detect two rapid `pointerup` events within 300ms on
the SVG background:

```javascript
let _lastTapTime = 0;
let _lastTapTarget = null;

svgEl.addEventListener('pointerup', (e) => {
  if (e.target !== svgEl) return;  // background only
  const now = Date.now();
  if (now - _lastTapTime < 300 && e.target === _lastTapTarget) {
    wheelFit();
  }
  _lastTapTime = now;
  _lastTapTarget = e.target;
});
```

### 6. SVG touch-action must be `none`

Without this, the browser intercepts pointer events for page scrolling/zooming:

```css
#raga-wheel-svg {
  touch-action: none;
}
```

This is a **required** CSS change. Without it, the `e.preventDefault()` calls in JS
throw "Unable to preventDefault inside passive event listener" errors in Chrome, and
touch events scroll the page instead of panning the wheel.

### 7. Hit target expansion on mobile

Mela circle radii and janya node radii are designed for hover/cursor interaction.
On mobile, increase hit target radius without changing the visual radius. This can be
done by adding an invisible `<circle>` with larger radius and `pointer-events: all;
fill: transparent` behind each node — or by conditionally increasing the node radius
in the render step:

```javascript
// In raga_wheel.js node rendering:
const hitRadius = isTouchDevice() ? nodeRadius + 8 : nodeRadius;
nodeEl.setAttribute('r', nodeRadius);           // visual
hitCircle.setAttribute('r', hitRadius);         // interaction target
hitCircle.setAttribute('fill', 'transparent');
hitCircle.setAttribute('pointer-events', 'all');
```

This ensures the visual design is unchanged while finger-tapping accuracy improves.

---

## Before / After summary

| Capability | Desktop before | Desktop after | Mobile after |
|---|---|---|---|
| Pan wheel | mousedown + drag | pointerdown + drag (same UX) | single-finger drag |
| Zoom wheel | scroll wheel | scroll wheel (unchanged) | pinch gesture |
| Reset view | dblclick background | dblclick background (unchanged) | double-tap background |
| Metadata inspector | dblclick node | dblclick node (unchanged) | long press (~500ms) |
| Tap disambiguation | `_dragMoved` flag | `_dragMoved` flag (unchanged) | `_dragMoved` + 5px threshold |

---

## Consequences

- **~80 lines of JS change** in `raga_wheel.js`. The existing `_dragging`, `_vx`,
  `_vy`, `_scale`, `_dragMoved` state variables are preserved; `_activePointers` Map
  and pinch state are added.
- **One CSS line** (`touch-action: none` on the SVG element) is required.
- **No changes to Librarian data** or render pipeline. This is a pure JS/CSS change.
- **Pointer Events on iOS Safari**: supported since iOS 13.0 (2019). Current iOS
  minimum is effectively iOS 15+. No polyfill needed.
- **Interaction model** (which gesture does what) is defined in ADR-033; this ADR
  defines only the *implementation mechanism* for those gestures in the SVG context.
- **Long-press on SVG is not supported by Cytoscape's `taphold` event** (that's
  Cytoscape-specific). The timer pattern here is the equivalent for SVG. The 500ms
  threshold matches Cytoscape's default for consistency.
- **`setPointerCapture`** ensures that `pointermove`/`pointerup` events continue to
  fire even if the user's finger moves outside the SVG boundary mid-drag. This is
  essential for reliable pan at screen edges.

---

## Implementation checklist (Carnatic Coder)

- [ ] Add `touch-action: none` to the raga wheel SVG container in `base.html` CSS
- [ ] Replace `mousedown`/`mousemove`/`mouseup`/`mouseleave` handlers with
      `pointerdown`/`pointermove`/`pointerup`/`pointercancel` in `raga_wheel.js`
- [ ] Add `_activePointers` Map state variables
- [ ] Implement `onPointerDown`, `onPointerMove`, `onPointerEnd` with pinch detection
- [ ] Add `startTapHoldTimer()` / `cancelTapHoldTimer()` functions
- [ ] Wire taphold to `openMetaInspector` via `getNodeDataFromElement()`
- [ ] Add double-tap-background detection for `wheelFit()` (mobile supplement)
- [ ] Add invisible hit-target circles for mela/janya nodes at mobile breakpoint
- [ ] Keep `wheel` event handler for desktop scroll-zoom (no change)
- [ ] Keep `dblclick` handler for desktop dblclick-background reset (no change)
- [ ] Test on iOS Safari (pinch, pan, tap, long-press) and Chrome Android
- [ ] Test desktop regression: mouse drag, scroll zoom, dblclick inspector, dblclick reset
