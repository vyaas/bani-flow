# ADR-034: Responsive Layout — Bottom Drawer Pattern for Mobile

**Status:** Proposed
**Date:** 2026-04-18

---

## Context

At ≤768px viewport width, the current three-column flexbox layout is unrenderable:

```
#main { display: flex; flex-direction: row; }
  #left-sidebar  { width: 260px; }   /* Bani Flow panel + listening trail */
  #canvas-wrap   { flex: 1; }        /* Cytoscape / SVG canvas */
  #right-sidebar { width: 260px; }   /* Node info + recordings */
```

On a 390px screen, `260 + flex:1 + 260` produces a canvas with negative available
width. The browser's flex algorithm assigns `0px` to the canvas and the sidebars
overflow the viewport. Neither panel is usable; the canvas is invisible.

The header has the same problem. Its CSS grid is:
```
grid-template-columns: 260px 1fr 260px
```
The title column (260px) and the controls column (260px) leave `390 - 520 = −130px`
for the centre column. The header overflows or truncates.

This ADR defines the responsive layout strategy: what the application looks like and
how users navigate between panels on a mobile breakpoint.

---

## Forces in tension

| Force | Direction |
|---|---|
| **Immersion** | A rasika exploring lineages on a phone must see the graph at maximum size. Panels should not compete with the canvas for screen real estate while the user is navigating. |
| **Accessibility of depth** | Recordings, the listening trail, and edge information must remain reachable in at most two taps from the canvas. Hiding them too deeply loses the layered depth of the application. |
| **Familiar mobile patterns** | Bottom sheets (Google Maps, Apple Maps) and side drawers (Gmail, most nav drawers) are universally understood mobile patterns. Custom navigation paradigms add cognitive load. |
| **No layout regressions** | Desktop layout must be completely unaffected. All mobile styles are additive, gated behind a `max-width: 768px` media query. |
| **Single-file constraint** | All CSS and JS live in `graph.html`. There is no separate mobile stylesheet to maintain. Mobile styles must coexist with the desktop styles in the same `<style>` block. |

---

## Pattern

**Layers of Scale** (Alexander, *A Pattern Language*, Pattern 26): the application has
a clear three-layer structure — navigation (which view?), exploration (which musician?
which raga?), and immersion (listen). The responsive layout respects these layers:
the canvas is always the ground layer; panels emerge from edges (bottom, left) on demand.

**Boundaries** (Alexander, *A Pattern Language*, Pattern 13): the border between the
canvas and the information panels should be a *physical boundary* the user can see
and feel — a draggable sheet handle — not an invisible CSS boundary that the user
accidentally crosses.

---

## Decision

### Breakpoint

All mobile styles apply at `@media (max-width: 768px)`.

At 768px and below, the three-column layout is replaced by a full-screen canvas with
two overlay panels:

1. **Left drawer** — contains the Bani Flow left sidebar (search, Bani subject header,
   janya list, listening trail). Slides in from the left.

2. **Bottom sheet** — contains the right sidebar (node info, edge info, recordings).
   Slides up from the bottom.

The canvas occupies `100vw × (viewport height − header height)` at all times, whether
or not a panel is open. Panels overlay the canvas; they do not displace it.

---

### Header at mobile breakpoint

```
Before (desktop):
┌────────────────────────────────────────────────────────────────────┐
│  [☰] Bani Flow ♫   nodes: 148  edges: 203   [sruti bar]   [GS|MJ] │
│                                              [Fit][Reset][Relayout] │
└────────────────────────────────────────────────────────────────────┘

After (mobile):
┌─────────────────────────────────┐
│  [☰]  Bani Flow ♫   [GS | MJ]  │
└─────────────────────────────────┘
```

Changes:
- `☰` hamburger button added (left of title) — opens/closes left drawer
- Stats count (`nodes: 148 edges: 203`) hidden at mobile breakpoint
- Header grid `260px 1fr 260px` replaced with `auto 1fr auto`
- Sruti bar hidden at mobile breakpoint (or collapsed to a single drone toggle)
- Viewport toolbar (Fit/Reset/Relayout) moved into canvas overlay at ADR-030 — on
  mobile these remain in the canvas overlay (no header change required)

---

### Left drawer (Bani Flow panel)

```css
@media (max-width: 768px) {
  #left-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 200;
    width: min(85vw, 320px);
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    background: var(--bg-panel);
    box-shadow: 4px 0 16px rgba(0,0,0,0.3);
  }
  #left-sidebar.drawer-open {
    transform: translateX(0);
  }
  /* Scrim overlay behind left drawer */
  #left-drawer-scrim {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 199;
  }
  #left-sidebar.drawer-open ~ #left-drawer-scrim {
    display: block;
  }
}
```

Open/close triggers:
- `☰` hamburger button in header
- Optional: swipe right from left 20px edge of screen (edge swipe gesture — requires
  ~20 lines of touch event JS on the canvas)
- Close: tap scrim, or swipe drawer left

JS state: `leftDrawerOpen` boolean; `toggleLeftDrawer()` adds/removes `.drawer-open`.

---

### Bottom sheet (Node info + Recordings)

Three states, controlled by CSS classes on `#right-sidebar`:

| State | Class | `transform` | User sees |
|---|---|---|---|
| Dismissed | (default) | `translateY(100%)` | Nothing (sheet off screen) |
| Peek | `.peek` | `translateY(calc(100% - 72px))` | 72px strip: musician name + close handle |
| Expanded | `.expanded` | `translateY(0)` | Full 50vh panel: name, wiki, recordings |

```css
@media (max-width: 768px) {
  #right-sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 50vh;
    min-height: 280px;
    z-index: 150;
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 16px 16px 0 0;
    background: var(--bg-panel);
    box-shadow: 0 -4px 24px rgba(0,0,0,0.25);
    display: flex;
    flex-direction: column;
  }
  #right-sidebar.peek    { transform: translateY(calc(100% - 72px)); }
  #right-sidebar.expanded { transform: translateY(0); }

  /* Drag handle pill at top of sheet */
  #sheet-handle {
    display: block;
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-strong);
    margin: 8px auto;
    flex-shrink: 0;
    cursor: grab;
  }
}
```

State transition triggers:
- **Node tap** → set `.peek` (the sheet surfaces with musician name visible)
- **Tap on peek handle area** OR **swipe up from handle** → set `.expanded`
- **Swipe down from expanded** → set `.peek`
- **Swipe down from peek** → dismiss (remove both classes)
- **Background canvas tap** (clear selection) → dismiss sheet

Drag-to-resize (optional stretch goal for Phase 1):
Track `pointermove` on the sheet handle to allow free dragging between states. If
deferred, the three discrete states (tap to cycle) cover 90% of use cases.

---

### Canvas at mobile breakpoint

```css
@media (max-width: 768px) {
  #main {
    flex-direction: column;  /* stack instead of row */
  }
  #left-sidebar,
  #right-sidebar {
    /* removed from flow; positioned fixed above */
    flex: unset;
  }
  #canvas-wrap {
    width: 100vw;
    flex: 1;
  }
  #cy-wrap, #cy {
    width: 100%;
    height: 100%;
  }
}
```

After the left sidebar transitions to `position: fixed`, Cytoscape's container gains
the full viewport width. `cy.resize()` must be called when the drawer opens/closes to
prevent the graph canvas from rendering at the old 260px-reduced width:

```javascript
function toggleLeftDrawer() {
  leftDrawerOpen = !leftDrawerOpen;
  document.getElementById('left-sidebar')
    .classList.toggle('drawer-open', leftDrawerOpen);
  if (typeof cy !== 'undefined') {
    // micro-delay lets the CSS transition start before resize
    setTimeout(() => cy.resize(), 30);
  }
}
```

---

### Filter bar at mobile breakpoint

The era/instrument filter chips currently wrap to a second line when there are many
chips. On mobile, wrapping consumes vertical space. The fix:

```css
@media (max-width: 768px) {
  #filter-bar {
    overflow-x: auto;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;  /* momentum scrolling on iOS */
    scrollbar-width: none;              /* hide scrollbar on mobile */
  }
  #filter-bar::-webkit-scrollbar {
    display: none;
  }
}
```

---

### Touch target enlargement (Phase 0, included here for reference)

```css
@media (max-width: 768px) {
  button,
  .view-btn,
  .filter-chip,
  .ctrl-btn,
  .trail-item {
    min-height: 44px;
    min-width: 44px;
    padding: 10px 16px;
    font-size: 0.9rem;
  }
}
```

---

### Media player at mobile breakpoint

The floating media player (`.mp-bar`) currently has `width: 480px; min-width: 320px`.
On a 390px screen this is too wide if the player overlaps the canvas edge.

```css
@media (max-width: 768px) {
  .mp-bar {
    width: min(90vw, 400px);
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
  }
  /* When bottom sheet is open, lift media player above it */
  body.sheet-expanded .mp-bar {
    bottom: 50vh;
  }
  body.sheet-peek .mp-bar {
    bottom: 72px;
  }
}
```

`body.sheet-expanded` / `body.sheet-peek` classes are added by the same JS that
manages bottom sheet state.

---

## Before / After (structural)

### Before
```
<body>
  <header>  <!-- grid: 260px 1fr 260px; overflows at mobile -->
  <main id="main">  <!-- flex-row; sidebars collapse canvas to 0px -->
    <aside id="left-sidebar">   <!-- 260px fixed -->
    <div   id="canvas-wrap">    <!-- flex:1 — starved on mobile -->
    <aside id="right-sidebar">  <!-- 260px fixed -->
```

### After (mobile additions only — no desktop changes)
```
<body>
  <header>  <!-- grid unchanged on desktop; auto 1fr auto at ≤768px -->
    <button id="hamburger-btn">☰</button>   <!-- new; hidden on desktop -->
  <main id="main">
    <aside id="left-sidebar">   <!-- unchanged on desktop; fixed drawer at ≤768px -->
    <div   id="canvas-wrap">    <!-- unchanged on desktop; 100vw at ≤768px -->
    <aside id="right-sidebar">  <!-- unchanged on desktop; bottom sheet at ≤768px -->
      <div id="sheet-handle"></div>   <!-- new; hidden on desktop -->
  <div id="left-drawer-scrim"></div>  <!-- new; always present, display:none on desktop -->
```

New HTML elements: 3 (`#hamburger-btn`, `#sheet-handle`, `#left-drawer-scrim`)
New CSS lines: ~100 (media query block)
New JS functions: ~6 (`toggleLeftDrawer`, `showBottomSheet`, `dismissBottomSheet`,
  `peekBottomSheet`, sheet drag handler, `cy.resize()` coordination)

---

## Consequences

- **Zero desktop regressions.** All mobile CSS is inside `@media (max-width: 768px)`.
  All mobile JS functions are no-ops on desktop (guarded by `isTouchDevice()` or media
  query check).
- **Cytoscape `cy.resize()` must be called** after drawer open/close to prevent stale
  canvas dimensions. This is a known Cytoscape requirement, not a new bug.
- **ADR-030 dependency**: ADR-030 proposes moving viewport controls (Fit/Reset/Relayout)
  from the header into the canvas overlay. If ADR-030 is accepted and implemented before
  this ADR, the header simplification it provides reduces the header restructuring needed
  here. If ADR-030 is deferred, the viewport controls must be hidden in the header at
  mobile breakpoint and a minimal Fit button added to the canvas overlay separately.
- **Z-index stack audit**: The current z-index stack is:
  `hover popover: 900 > meta inspector: 1000 > raga wheel: 60 > viewport toolbar: 70`.
  The left drawer at `z-index: 200` and bottom sheet at `z-index: 150` fit cleanly
  between the toolbar (70) and hover popover (900). No conflicts.
- **Raga wheel on mobile**: The SVG wheel must also adapt to `100vw` canvas. The
  wheel's `viewBox` is already relative; centring and `wheelFit()` should work after
  a `viewBox` recalculation. Any touch pan/zoom issues are resolved in ADR-035.

---

## Implementation checklist (Carnatic Coder)

- [ ] Add `#hamburger-btn` to `base.html` header (hidden on desktop via CSS)
- [ ] Add `#sheet-handle` inside `#right-sidebar` (hidden on desktop via CSS)
- [ ] Add `#left-drawer-scrim` div after `</main>` (hidden on desktop via CSS)
- [ ] Add media query CSS block to `base.html` `<style>` section
- [ ] Add `toggleLeftDrawer()`, `showBottomSheet(state)`, `dismissBottomSheet()` to JS
- [ ] Wire `#hamburger-btn` click → `toggleLeftDrawer()`
- [ ] Wire `#sheet-handle` drag/tap → sheet state transitions
- [ ] Wire `#left-drawer-scrim` tap → `toggleLeftDrawer()`
- [ ] Call `cy.resize()` in `toggleLeftDrawer()`
- [ ] Wire bottom sheet open to `selectNode()` (existing function in `graph_view.js`)
- [ ] Wire `body.sheet-*` classes to media player position
- [ ] Test on 390px (iPhone SE viewport) and 768px (iPad portrait viewport)
- [ ] Confirm desktop layout unchanged at 1024px+
