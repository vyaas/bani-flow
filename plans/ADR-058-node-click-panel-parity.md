# ADR-058: Node-Click Panel Parity — Single-Tap Opens Panel on Desktop, Two-Tap Preserved on Mobile

**Status**: Accepted
**Date**: 2026-04-21
**Agents**: graph-architect
**Depends on**: ADR-025 (cross-panel coupling), ADR-042 (graph-to-drawer coupling), ADR-046 (desktop drawer panels)

---

## Context

### The current two-tap UX on Guru-Shishya graph

Clicking a musician node on the Guru-Shishya graph today runs a two-step interaction:

1. **First tap** → `focusNode()`: highlights the node's neighbourhood, animates a zoom, shows a nudge: *"tap again · open musician details"*. The Musician panel **does not open**.
2. **Second tap (same node)** → `selectNode()`: populates the Musician panel and calls `window.setPanelState('MUSICIAN')`.

The nudge (ADR-044) was added precisely because the panel's existence was non-obvious. With ADR-046 now introducing persistent desktop handles and a more visible panel metaphor, the nudge approach is still correct for mobile — but on desktop the extra tap is friction, not safety.

### Contrast with the Raga Wheel view

On the Mela-Janya wheel, a single click on a raga or composition node:
- Expands sub-nodes immediately, *and*
- Triggers `triggerBaniSearch()` which opens the Bani Flow panel with the trail filled

There is no nudge, no second tap. The panel opens as a direct consequence of the first click. This is the mental model users bring when they switch to the Guru-Shishya view — and it breaks there.

### The desktop/mobile asymmetry

ADR-046 established that desktop screens (≥769px) have enough real estate for panels to open without covering the canvas. With drawer handles always visible and toggle semantics (click handle again to close), the cost of opening a panel is zero — the user's next click on the handle undoes it instantly.

On mobile (≤768px), canvas overlap is significant. The two-tap behaviour with the nudge remains appropriate: the first tap focuses the node and signals intent; the nudge invites the user to open the panel explicitly if they want it.

### The user statement

> "When we click a node in this view, the Musician panel should draw out and be filled by the Musician data. This makes clicking the node functional (duh!)."
>
> "We also need to revise the node clicking behavior in general for both views: When we click on a node, not only do we zoom and center appropriately, we need to expand out the panel, but only for desktop mode. For mobile though, we will rely on the indication to click once more to draw out the panel."

---

## Forces

| Force | Direction |
|---|---|
| **Immediate feedback** | A click with no visible panel change feels broken. On desktop, best practice (and the raga wheel) says one click = one action. |
| **Mobile real-estate** | On mobile an open panel occludes 85% of the canvas. Don't punish the user for exploring nodes; let them opt in on the second tap. |
| **Existing nudge** | ADR-044's nudge is still appropriate for mobile. On desktop it should not appear — the panel opening is the confirmation. |
| **Mutual exclusion** | `setPanelState('MUSICIAN')` already handles mutual exclusion (closes Bani Flow if open). No new state logic needed. |
| **No regression on focusNode** | `focusNode()` still fires on both platforms — the neighbourhood zoom is always desirable. The question is only whether `selectNode()` also fires on the first tap. |

---

## Pattern

**Levels of Interaction Scale** (Alexander, *Pattern Language*): On a large canvas (desktop), the interaction can afford density — a single gesture does more. On a small canvas (mobile, phone), gestures must be sparse to preserve the sense of space. The same object — a node — responds differently at different scales of the canvas.

---

## Decision

### 1. Single-Tap-Open on desktop

In `graph_view.js`, the `cy.on('tap', 'node')` handler is amended:

```js
cy.on('tap', 'node', evt => {
  const node = evt.target;

  if (isTouchDevice()) {
    // Mobile: two-tap UX preserved (ADR-044 nudge still shown)
    if (_focusedGraphNode === node.id()) {
      if (typeof hideClickNudge === 'function') hideClickNudge();
      selectNode(node);
    } else {
      focusNode(node);
      if (typeof showClickNudge === 'function')
        showClickNudge('tap again \u00B7 open musician details');
    }
  } else {
    // Desktop: single-tap focus + open panel immediately
    focusNode(node);
    selectNode(node);
  }
});
```

`isTouchDevice()` (already defined in `graph_view.js` via `matchMedia('(pointer: coarse)')`) is the guard.

### 2. Suppress nudge on desktop

When `selectNode(node)` is called on the first tap (desktop path), `hideClickNudge()` is called so no stale nudge text appears. This is already implicitly handled because `selectNode()` does not call `showClickNudge`. No additional change needed.

### 3. _focusedGraphNode reset

`_focusedGraphNode` is reset to `null` when the user clicks elsewhere (existing logic). On desktop the reset still fires — clicking another node will again trigger `focusNode + selectNode` immediately, which is correct.

### 4. Mobile behaviour unchanged

On mobile (`isTouchDevice() === true`), the existing two-tap flow continues verbatim. The nudge remains. ADR-044 is not superseded.

---

## Consequences

- **Guru-Shishya graph now matches the Raga Wheel**: both open their respective panel on first click.
- **No new state machine changes**: `setPanelState` is called exactly as before, just earlier (first tap instead of second) on desktop.
- **Mobile not affected**: two-tap preserved; nudge still visible.
- **The click-nudge (ADR-044)** is only shown on mobile paths. It remains valuable there.
- **isTouchDevice guard as discriminator**: this guard is already defined in `graph_view.js` (line 617). No new utility needed.

---

## Implementation

**Agent**: Carnatic Coder
**File**: `carnatic/render/templates/graph_view.js`

1. Locate the `cy.on('tap', 'node', evt => { … })` handler (currently lines 580–588).
2. Replace the handler body with the desktop/mobile branch shown in Decision §1.
3. Run `bani-render`, open `graph.html`, verify:
   - Desktop: single click on any node → neighbourhood zoom fires AND Musician panel slides open.
   - Mobile (or simulated touch): first click → zoom only + nudge; second click → panel opens.
