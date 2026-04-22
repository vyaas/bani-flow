# ADR-062: Desktop Persistent Grid Layout — No Handles, No Overlap

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect
**Supersedes**: ADR-046 §3–§5 (desktop overlay drawers), ADR-060 (desktop handle redesign)
**Depends on**: ADR-034 (mobile drawer — unchanged), ADR-041 (mobile tab bar — unchanged)

---

## Context

### The problem

ADR-046 ported the mobile slide-in drawer pattern verbatim to desktop. Both panels are `position: fixed; top: 0; bottom: 0; z-index: 200` — full-viewport overlays that slide in from the edges. This creates three compounding problems:

1. **Panels cover the header.** The sruti bar (ADR-029) lives in a `<header>` element. The fixed panels start at `top: 0`, rendering directly on top of the header when open. The user cannot see the sruti controls while a panel is visible.

2. **Panels cover bottom affordances.** View-selector buttons, the `+ Raga` / `+ Composition` chips, and the `BANI FLOW` button reside below or adjacent to the canvas. Fixed panels reaching `bottom: 0` bury these affordances.

3. **Handle friction is unavoidable.** ADR-060 enlarged the handles to 80 × 48 px to compensate for discoverability. But the very existence of a toggle handle implies panels come and go — they are non-persistent. On a desktop viewport (≥ 769 px) there is abundant horizontal space to keep both panels resident at all times. The handle is solving a problem that should not exist in the first place.

### The user statement

> "Note how the panels obstruct the panels behind them. Both the sruti bar at the top and the add items at the bottom get covered by the bani-flow and musician panels."

> "The luxury of having desktop is the real estate available… so we can get rid of the handles for desktop mode and just have persistent panels."

### Current desktop layout

```
<header>                ← flows at top; h = ~52px (--header-h token)
<div id="main">         ← display:flex; flex:1; overflow:hidden
  #left-sidebar         ← position:fixed; top:0; z-index:200   ✗ covers header
  #canvas-wrap          ← flex:1
  #right-sidebar        ← position:fixed; top:0; z-index:200   ✗ covers header
#desktop-left-handle    ← position:fixed; z-index:201          ✗ no longer needed
#desktop-right-handle   ← position:fixed; z-index:201          ✗ no longer needed
```

---

## Forces

| Force | Direction |
|---|---|
| **Non-overlap as a hard constraint** | Every panel is its own domain. No panel draws on top of another panel except special-case modals (metadata inspector, entry forms). |
| **Real estate** | Desktop width ≥ 769 px. Two 280 px panels + a canvas of ≥ 200 px minimum is always achievable. The drawer metaphor is solving a mobile scarcity problem that does not exist on desktop. |
| **Header sovereignty** | The sruti bar and navigation controls must always be visible and interactive regardless of panel state. They are not content — they are the instrument controls. |
| **Discoverability** | Persistent panels are always visible; no handle → no discoverability problem to solve. The raga-wheel, musician list, and bani-flow trail are always accessible. |
| **Mobile unchanged** | The mobile drawer + tab-bar pattern (ADR-034/036/039/041) remains canonical for ≤ 768 px. This ADR is desktop-only. |
| **Transition smoothness** | Removing handles must not break the JS-driven `openPanel()` / `closePanel()` calls — those can remain in play for mobile. The desktop CSS simply overrides them to no-ops via `transform: none`. |

---

## Pattern

**Levels of Scale** (Alexander, Pattern 26): On desktop the three columns — Bani Flow | Canvas | Musician — each operate at their own scale. They are persistent, bounded, non-overlapping centres. The header is a fourth level above them all. No level obscures another.

**Boundaries as edges** (ADR-046): The column edges replace the handle tabs as the visible boundaries. The user always sees all three columns; there is no need for an invitation to open a panel.

**Minimum surprise**: The panels appear on the same trigger as before (node click, chip click) — only their persistence changes, not their role. An empty panel is still an empty panel; its content populates when the user navigates to a node or filter. A previously populated panel stays visible between navigations, which is actively useful (the user can read the Bani Flow trail while selecting a different musician).

---

## Decision

### 1. CSS grid layout for `#main` on desktop

Replace the `display: flex` layout of `#main` with a three-column CSS grid on desktop. Panels are normal flow grid items — not fixed overlays.

```css
/* Desktop only — ≥ 769 px */
@media (min-width: 769px) {

  #main {
    display: grid;
    grid-template-columns: 280px 1fr 280px;
    grid-template-rows: 1fr;
    /* Remove position:relative — not needed when panels are in-flow */
  }

  /* Panels become in-flow grid items */
  #left-sidebar,
  #right-sidebar {
    position: static;          /* was: position:fixed */
    transform: none !important; /* override JS-driven translateX */
    top: auto; bottom: auto; left: auto; right: auto;
    z-index: auto;
    box-shadow: none;
    /* Retain border for visual separation */
    border-right: 1px solid var(--border-strong);   /* left panel */
    overflow-y: auto;
    height: 100%;
  }
  #right-sidebar {
    border-right: none;
    border-left: 1px solid var(--border-strong);
  }

  /* Canvas column fills remaining space */
  #canvas-wrap {
    min-width: 0;  /* grid children can shrink below content size */
    overflow: hidden;
  }

  /* Handles are absent on desktop — hide entirely */
  .desktop-drawer-handle {
    display: none !important;
  }

  /* Scrims are absent on desktop — already hidden; keep hidden */
  #left-drawer-scrim,
  #right-drawer-scrim {
    display: none !important;
  }
}
```

### 2. Header remains in normal document flow

The `<header>` already precedes `#main` in the DOM as a flex column child of `<body>`. With `#main` becoming a grid (rather than fixed overlays spilling over the viewport), the header is never covered. No change to `<header>` CSS is required.

### 3. Mobile behaviour unchanged

Below 768 px: the existing `position: fixed; top: 0; bottom: calc(56px + …)` drawer behaviour remains (ADR-034/036/039). The `transform: translateX(…)` transitions continue to work. The mobile tab bar (ADR-041) is unchanged.

**Exception — mobile panel top anchor (prerequisite fix)**:
On mobile the panels also start at `top: 0`, covering the header. This is a separate but smaller issue: the header height must be subtracted. Add:

```css
@media (max-width: 768px) {
  #left-sidebar,
  #right-sidebar {
    top: var(--header-h, 52px);  /* never cover the header */
  }
}
```

This is a one-line CSS fix that belongs in this ADR as a hygiene correction, even though the structural change is desktop-only.

### 4. JavaScript compatibility

`openPanel(side)` / `closePanel(side)` in `drawer.js` call `translateX()` transforms. On desktop, `transform: none !important` in the grid CSS neutralises these silently — the panel is always visible, so open/close is a no-op.

One addition: on desktop, `openPanel(side)` can also scroll the panel's content into view if needed (e.g., snap to top). This is optional; the default is to leave the scroll position as-is so the user does not lose their place in the trail.

**Remove desktop-specific handle show/hide logic**:
Any JS that shows/hides `.desktop-drawer-handle` or fires on handle click no longer runs on desktop (handles are `display: none`). Guard all handle logic with a media-query check:
```js
const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;
// In handle event listeners:
if (!isDesktop()) { /* mobile drawer toggle only */ }
```

### 5. Canvas minimum width

The canvas must not collapse below a usable size. Set a minimum:
```css
#canvas-wrap {
  min-width: 200px;
}
```
At 769 px viewport width: 280 + 280 + 209 = 769 px — just viable. The layout is intended for comfortable reading at ≥ 1024 px.

---

## Consequences

### Positive
- Sruti bar and header are always visible. No panel covers the header under any circumstance on desktop.
- Bottom affordances (view selector, add buttons) sit below `#main` in the flex-column body — also never covered.
- Handles are gone on desktop — zero handle friction, zero discoverability problem.
- Both panels visible simultaneously. The user can compare the Bani Flow trail while examining a musician node without any toggling.
- Less JS complexity: handle event listeners, handle slide animations, and the `handle-panel-open` class management all become dead code on desktop.
- Mobile behaviour is fully preserved.

### Negative / Trade-offs
- Canvas is permanently narrower on desktop (560 px consumed by panels on a 1280 px monitor). The graph canvas is 720 px instead of 1280 px. This is the correct trade-off: the user came to read panel content, not to maximize an empty canvas.
- At 769–1023 px viewports, the layout is tight. A future ADR may introduce a responsive breakpoint at ~900 px to hide one or both panels on very small desktops. Out of scope here.
- The `position:static` override means iOS/Safari viewport-unit bugs do not apply; but test that `height: 100%` fills correctly inside the grid row.

### Out of scope
- Resizable panel columns (ADR-038 territory)
- Making one panel optional on narrow desktop viewports
- Mobile header coverage fix beyond the one-line `top: var(--header-h)` patch

---

## Implementation

**Carnatic Coder owns**: `carnatic/render/templates/base.html`, `carnatic/render/templates/drawer.js`.

**Workflow C** (toolchain feature):

1. **`base.html` CSS**: Add the `@media (min-width: 769px)` block in § Decision §1 above. Add the mobile `top: var(--header-h)` fix in §3.
2. **`base.html` `:root`**: Confirm `--header-h` token exists (or add `--header-h: 52px`). Measure actual header height and update if needed.
3. **`drawer.js`**: Guard handle show/hide logic with `isDesktop()` check (§4 above). Remove or guard the `desktop-drawer-handle` click listeners.
4. Run `bani-render` and test at 1280 px, 1024 px, and 769 px:
   - Header always visible above both panels
   - Neither panel covers header or bottom affordances
   - Clicking a node populates the musician panel without any toggle
   - Clicking a chip in the musician panel populates the Bani Flow panel
   - Mobile (768 px viewport) retains drawer + tab-bar behaviour unchanged
