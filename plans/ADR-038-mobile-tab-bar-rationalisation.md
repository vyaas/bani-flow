# ADR-038: Mobile Tab Bar Rationalisation — Remove Hamburger, Swap Tab Positions

**Status:** Proposed
**Date:** 2026-04-18
**Depends on:** ADR-036 (mobile navigation choreography)

---

## Context

ADR-036 introduced a 56px bottom tab bar with two buttons: `♫ Musician` (left) and
`☰ Trail` (right). The same ADR preserved the `#hamburger-btn` (☰) in the top-left
header corner, which also opens the Trail (left drawer) via `toggleLeftDrawer()`.

### What breaks on mobile (observed in screenshot)

1. **Redundant hamburger button.** The top-left ☰ hamburger and the bottom ☰ Trail
   tab both call `toggleLeftDrawer()` and open the same left drawer. The hamburger
   wastes 44×44px of header space and confuses users who see two ☰ icons with
   identical behaviour. One must go.

2. **Spatial mismatch: Trail button on right, drawer on left.** The Trail tab sits on
   the right side of the bottom tab bar, but the Trail drawer slides in from the left
   edge. This violates the Fitts's Law expectation that a button's panel appears
   adjacent to the button. The user taps bottom-right, but their eye must jump to the
   left edge to find the panel.

3. **Tap-through on Musician button.** Tapping the `#tab-musician` button fires the
   button's click handler, but the touch event also propagates to the Cytoscape canvas
   underneath. If a graph node happens to sit behind the button's screen coordinates,
   the node activates (hover popover appears, node selects). The user intended to open
   the Musician panel, not visit a random node. This occurs because the tab bar and
   the Cytoscape container share z-index proximity at the viewport bottom, and
   Cytoscape's touch handlers intercept events that leak through.

### What we can observe

- `#hamburger-btn` is wired in `mobile.js` line ~220: `hamburger.addEventListener('click', toggleLeftDrawer)`
- `#tab-trail` calls `setPanelState('TRAIL')` which calls `_openDrawer()` — identical effect
- `#mobile-tab-bar` is `z-index: 160`, canvas `#cy` has no explicit z-index (defaults to auto/0)
- The Cytoscape container fills `100vw` and extends behind the tab bar visually

---

## Forces in tension

| Force | Direction |
|---|---|
| **Discoverability** | Two entry points to the Trail is confusing, not helpful. One clear, well-placed button is better than two ambiguous ones. |
| **Spatial coherence** | A button should be near the panel it controls. Trail drawer slides from left → Trail button should be on the left. |
| **Touch isolation** | Tab bar buttons must consume touch events completely. No ghost taps on the canvas beneath. |
| **Header real estate** | Removing the hamburger frees 44px + 6px margin in the header row. The header can use this for a wider title or the sruti strip. |

---

## Pattern

**Bottom navigation convention** (Material Design 3, iOS Human Interface
Guidelines): In a two-tab bottom bar, the spatial position of each tab should
correspond to the edge from which its panel appears. Left tab → left panel.
Right tab → right panel.

**Touch target isolation** (WCAG 2.2, Target Size): interactive elements must not
allow touch events to cascade to unrelated interactive surfaces beneath them.

---

## Decision

### 1. Remove the hamburger button

Delete `#hamburger-btn` from the header HTML. The Trail tab at the bottom is the sole
mobile entry point for the left drawer. On desktop (≥769px), the left sidebar is
always visible — no hamburger is needed there either.

### 2. Swap tab positions: Trail left, Musician right

The bottom tab bar becomes:

```
┌────────────────────────────────────┐
│   [☰ Trail]        [♫ Musician]    │  56px, flush bottom
└────────────────────────────────────┘
```

- **Left tab → `#tab-trail`**: Opens the left drawer (slides in from left edge).
- **Right tab → `#tab-musician`**: Opens the musician panel (ADR-039 determines
  whether this is a right drawer or bottom sheet; this ADR only moves the button).

The HTML order changes from `tab-musician, tab-trail` to `tab-trail, tab-musician`.

### 3. Isolate tab bar touch events

Add a pointer-events barrier so canvas touch handlers cannot fire through the tab
bar:

```css
#mobile-tab-bar {
  pointer-events: auto;  /* explicit, defensive */
  touch-action: manipulation;
}
```

Each tab button handler calls `e.stopPropagation()` to prevent the touch from
reaching Cytoscape's container beneath:

```javascript
tabMusician.addEventListener('click', function (e) {
  e.stopPropagation();
  // existing toggle logic
});
tabTrail.addEventListener('click', function (e) {
  e.stopPropagation();
  // existing toggle logic
});
```

Additionally, set `pointer-events: none` on the Cytoscape container in the zone
covered by the tab bar by ensuring `#mobile-tab-bar` sits above it in stacking
context. Currently `z-index: 160` should suffice, but the Cytoscape canvas must NOT
have a higher stacking context. Verify `#cy-wrap` and `#cy` have no competing
`z-index` values.

### 4. Reclaim header space

With the hamburger removed, the mobile header simplifies to:

```
┌────────────────────────────────────┐
│  CARNATIC MUSIC EXPLORER   [GS|MJ]│  56px
└────────────────────────────────────┘
```

The title can be left-aligned or centred (implementation choice). The view selector
remains at the right edge. The freed 50px on the left can optionally house a compact
sruti power indicator (●) if ADR-029 is adapted for mobile — but that is out of scope
here.

---

## Before / After

### Before
```
Header:     [☰]  CARNATIC MUSIC EXPLORER  [GS|MJ]
                                                       ← hamburger opens left drawer
Tab bar:    [♫ Musician]          [☰ Trail]
                                  ↑ also opens left drawer (redundant)
                                  ↑ button on right, panel on left (spatial mismatch)
```

### After
```
Header:     CARNATIC MUSIC EXPLORER       [GS|MJ]
                                                       ← no hamburger
Tab bar:    [☰ Trail]            [♫ Musician]
             ↑ left button → left panel    ↑ right button → right panel (ADR-039)
```

---

## Consequences

- **One fewer element in DOM.** `#hamburger-btn` is removed from `base.html`.
  The `hamburger` event listener in `mobile.js` becomes dead code and is removed.

- **Tab order swap.** `#tab-trail` is the first child of `#mobile-tab-bar`,
  `#tab-musician` is the second. CSS `justify-content: space-around` still works.

- **Touch isolation is defensive.** `e.stopPropagation()` on tab buttons prevents
  accidental node selection. This is a one-line change per handler.

- **No desktop impact.** The hamburger was already `display: none` on desktop.
  The tab bar is already `display: none` on desktop. No desktop behaviour changes.

- **Depends on ADR-039.** The Musician button's panel (right drawer vs. bottom sheet)
  is decided in ADR-039. This ADR only moves the button to the right side and
  ensures the tap event is isolated.

---

## Implementation

| Step | Owner | Description |
|---|---|---|
| 1 | Carnatic Coder | Remove `#hamburger-btn` from `base.html` header |
| 2 | Carnatic Coder | Remove `#hamburger-btn` CSS (the `display: inline-flex` block in mobile query) |
| 3 | Carnatic Coder | Remove hamburger event listener from `mobile.js` |
| 4 | Carnatic Coder | Swap `#tab-trail` and `#tab-musician` order in `#mobile-tab-bar` HTML |
| 5 | Carnatic Coder | Add `e.stopPropagation()` to both tab button click handlers in `mobile.js` |
| 6 | Carnatic Coder | Verify `#cy` / `#cy-wrap` have no competing z-index above 160 |
| 7 | Carnatic Coder | `bani-render` + test in Chrome DevTools 390px emulator |

All steps are Carnatic Coder scope.
