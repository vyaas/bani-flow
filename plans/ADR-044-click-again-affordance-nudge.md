# ADR-044 — Click-Again Affordance Nudge

**Status**: Proposed  
**Date**: 2026-04-19  
**Agent**: graph-architect

---

## Context

Two views use a two-tap activation pattern:

1. **Raga Wheel (Mela-Janya view)** — Composition satellite nodes require two separate clicks:
   - First click: highlights the node (stroke → `THEME.accentSelect`), dims siblings, stores `_expandedComp`
   - Second click: calls `triggerBaniSearch('comp', id)` → opens the Bani Flow listening trail panel

2. **Guru-Shishya graph** — Musician nodes require two taps:
   - First tap: focuses the node neighborhood (fades siblings, fits viewport to closed neighborhood), stores `_focusedGraphNode`
   - Second tap: calls `selectNode(node)` → populates and opens the Musician detail panel

In both cases, the post-first-click visual signal (stroke color or opacity fade) reads as "selection confirmed" — not "action pending." There is no affordance that tells the user a second click is available and would open a panel. Users learn through accidental discovery.

---

## Pattern

**Transient Context Banner** (Alexander: Levels of Scale + Boundaries)

A bounded, time-limited signal at the bottom center of the viewport. It belongs to the viewport boundary — not to the node — so it is visible regardless of zoom level or whether the node is near the edge. It carries just enough context ("open bani flow" vs "open musician details") to be meaningful. It disappears after 2500 ms or on the second click, whichever comes first, so it never nags.

This pattern is preferred over:
- **Node-adjacent tooltip**: requires coordinate mapping between SVG/canvas space and DOM space; breaks under zoom/pan
- **Persistent badge on node**: pollutes the node design; invisible under zoom-out
- **Pulse animation on stroke**: too subtle; conveys "selected" not "click again"
- **Toast at top-right**: typically reserved for system feedback (errors, confirmations), not interaction hints

---

## Decision

### Add a single shared `<div id="click-nudge">` in `base.html`

Position: `bottom: 72px; left: 50%; transform: translateX(-50%)`. 72px clears the bottom edge and avoids any existing toolbar.

**Anatomy** of the nudge:
```
[ ☰ tap again · open bani flow ]
[ ☰ tap again · open musician details ]
```

Specifically:
- A small hand-tap SVG icon (unicode `☛` or an inline SVG path) on the left
- Text: `"tap again · <contextual label>"` — two variants
- Styled with `background: rgba(0,0,0,0.72)`, `color: var(--accent)`, `border-radius: 20px`, small padding, `font-size: 0.75rem`
- Enters: `opacity: 0 → 1` over 200ms
- Auto-exits: `opacity: 1 → 0` over 400ms after 2500ms display
- Dismissed early on second click

### Two trigger call sites

**Raga Wheel** (raga_wheel.js) — in the composition node's **first-click branch** (where `_expandedComp !== item.id`):
```javascript
showClickNudge('tap again · open bani flow');
```

**Guru-Shishya graph** (graph_view.js) — in the `cy.on('tap', 'node', ...)` handler, in the `focusNode()` branch (i.e. when `_focusedGraphNode !== evt.target.id()`):
```javascript
showClickNudge('tap again · open musician details');
```

### `showClickNudge(text)` — shared utility

Lives in `base.html` as a small inline `<script>` block (≤ 25 lines). Uses a module-level timeout handle to cancel any in-flight nudge before showing a new one. No dependencies on any view-specific state.

```javascript
let _nudgeTimeout = null;
function showClickNudge(text) {
  const el = document.getElementById('click-nudge');
  if (!el) return;
  clearTimeout(_nudgeTimeout);
  el.textContent = text;
  el.classList.remove('nudge-hiding');
  el.classList.add('nudge-visible');
  _nudgeTimeout = setTimeout(() => {
    el.classList.add('nudge-hiding');
    el.addEventListener('transitionend', () => {
      el.classList.remove('nudge-visible', 'nudge-hiding');
    }, { once: true });
  }, 2500);
}

function hideClickNudge() {
  const el = document.getElementById('click-nudge');
  if (!el) return;
  clearTimeout(_nudgeTimeout);
  el.classList.remove('nudge-visible', 'nudge-hiding');
}
```

Call `hideClickNudge()` from:
- The composition node's **second-click branch** (before calling `triggerBaniSearch`)
- `selectNode(node)` (before populating the panel)

### CSS rules (in `base.html` `<style>`)

```css
#click-nudge {
  position: fixed;
  bottom: 72px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.72);
  color: var(--accent);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px;
  padding: 6px 16px;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  pointer-events: none;        /* never intercepts clicks */
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 9999;
}
#click-nudge.nudge-visible {
  opacity: 1;
}
#click-nudge.nudge-hiding {
  opacity: 0;
  transition: opacity 0.4s ease;
}
```

---

## Before / After

**Before** (composition first click, raga_wheel.js ~line 1095):
```javascript
// First click on a composition — store expanded state, highlight
_expandedComp = item.id;
compCircle.setAttribute('stroke', THEME.accentSelect);
// ... dim siblings ...
```

**After**:
```javascript
// First click on a composition — store expanded state, highlight
_expandedComp = item.id;
compCircle.setAttribute('stroke', THEME.accentSelect);
// ... dim siblings ...
showClickNudge('tap again · open bani flow');   // ← new
```

**Before** (musician first tap, graph_view.js, inside `cy.on('tap', 'node', ...)` handler):
```javascript
} else {
  focusNode(evt.target);
}
```

**After**:
```javascript
} else {
  focusNode(evt.target);
  showClickNudge('tap again · open musician details');  // ← new
}
```

**Before** (musician second tap):
```javascript
if (_focusedGraphNode === evt.target.id()) {
  selectNode(evt.target);
```

**After**:
```javascript
if (_focusedGraphNode === evt.target.id()) {
  hideClickNudge();   // ← new (dismiss before panel opens)
  selectNode(evt.target);
```

---

## Consequences

**Positive**:
- Explicit, legible affordance for two-tap interaction in both views
- Zero impact on node visual design — nudge lives outside both SVG and Cytoscape canvas
- `pointer-events: none` means nudge never accidentally absorbs a click
- Single DOM element shared by both views; no per-view duplication
- Auto-dismiss means no persistent clutter

**Negative / Risks**:
- None identified; overhead is ~25 JS lines + ~20 CSS lines

**Out of scope**:
- Janya node clicks (first-click expands compositions; that is navigation, not panel-opening — no nudge needed)
- Mela node clicks (first-click expands janyas + silently preloads bani-flow; that's exploration, not direct panel open — no nudge needed)

---

## Implementation

Carnatic Coder should:

1. **`carnatic/render/templates/base.html`**:
   - Add `<div id="click-nudge"></div>` inside `<body>` (before closing tag)
   - Add CSS rules above (in the existing `<style>` block)
   - Add `showClickNudge` / `hideClickNudge` utility functions in a `<script>` block

2. **`carnatic/render/templates/raga_wheel.js`** — in the composition satellite click handler's first-click branch:
   - Add `showClickNudge('tap again · open bani flow');`
   - Add `hideClickNudge();` in the second-click branch before `triggerBaniSearch`

3. **`carnatic/render/templates/graph_view.js`** — in `cy.on('tap', 'node', ...)`:
   - Add `showClickNudge('tap again · open musician details');` in the `focusNode` branch
   - Add `hideClickNudge();` in the `selectNode` branch

4. Run `bani-render` and test both views in the local server
5. Commit: `render(toolchain): add click-again affordance nudge (ADR-044)`
