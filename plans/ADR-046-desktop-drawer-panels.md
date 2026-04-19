# ADR-046: Desktop Drawer Panels — Unified Slide-In Layout for Desktop and Mobile

**Status:** Accepted
**Date:** 2026-04-19
**Supersedes:** Fixed-sidebar layout for desktop (ADR-034 addresses mobile only; this
ADR extends the drawer pattern to desktops ≥ 769px)

---

## Context

On desktop (> 768px), Bani Flow has a classic three-column layout:

```
260px #left-sidebar | flex:1 canvas | 260px #right-sidebar
```

Both panels are permanently visible, consuming 520px of horizontal space. The graph
canvas receives only the remainder. On a 1280px monitor, the canvas is 760px wide —
58% of the screen. On a 1024px laptop, it is 504px (49%).

The mobile version (ADR-034/036/039) converted both sidebars to slide-in drawers:
the canvas expands to full width, panels appear on demand, and the user dismisses
them by tapping a tab or scrim. This produced a much more immersive graph
exploration experience.

### User statement

> "We want to mirror the placement of panels as it happens on mobile for desktop
> mode as well. Namely, we want the bani-flow and musician panels to appear with
> clicks on nodes and items in each other's panels, essentially just like the mobile
> version. One thing we will need to include are drawer handles on either side so
> that the user can click on them to open them at any time."

The core requests are:
1. Panels are hidden by default on desktop; canvas fills 100% width.
2. Panels slide in from left (#left-sidebar/Bani Flow) and right (#right-sidebar/Musician)
   in response to graph interactions, mirroring the existing mobile behaviour.
3. **Persistent edge handles** — thin vertical tabs anchored to the left and right
   viewport edges, always visible, allow the user to open the corresponding panel
   at any time regardless of graph state.
4. Panels are dismissed by clicking the handle again (toggle semantics, identical to
   ADR-041's mobile tab bar toggle).

---

## Forces in tension

| Force | Direction |
|---|---|
| **Immersion** | The rasika exploring a lineage graph deserves the full canvas. Permanently visible sidepanels consume 40%+ of screen real estate even when only one node is selected. |
| **Consistency with mobile** | The mobile layout now sets the canonical mental model: panels emerge on demand. Desktop diverging from mobile creates two different mental models for the same application. |
| **Discoverability** | On mobile, the tab bar is always visible (ADR-041). On desktop there is no equivalent persistent affordance. The handle tabs serve this role: they are always visible on the viewport edges so the user always knows where to find the panels. |
| **Zero regressions** | Desktop has additional features (floating media player, resize handles, hover popovers) that must continue to work. The drawer must not trap pointer events or obstruct player windows. |
| **Toggle semantics** | The handle that opens a panel should also close it (same control, two states). This mirrors ADR-041's tab bar toggle idiom and requires no additional "X" close button. |
| **No scrim on desktop** | Mobile uses a dark scrim behind drawers to indicate modal depth. On desktop, the cursor provides precise control; a semi-transparent scrim would darken the canvas and impede graph reading while the panel is open. Handle-based toggle replaces the scrim as the dismiss affordance. |

---

## Pattern

**Toggle affordance** (iOS tab bar, material navigation drawer): A persistent vertical
handle tab sits on the screen edge. Clicking opens the panel; clicking again closes
it. The same object is both lock and key.

**Layers of Scale** (Alexander, *A Pattern Language*, Pattern 26): The canvas is the
ground — always at full scale. Panels are upper layers that overlay the canvas without
displacing it. The handles are the thinnest possible surface element, just enough to
be clickable.

**Boundaries as physical edges** (Alexander, Pattern 13): The vertical handle tab
makes the boundary between canvas and panel visible and tangible. It is a real edge,
not an invisible CSS line.

---

## Decision

### 1. Desktop breakpoint target

All changes apply at `@media (min-width: 769px)` — i.e., on all non-mobile screens.
Mobile styles (≤ 768px) are untouched.

### 2. Canvas expands to full width

On desktop, `#left-sidebar` and `#right-sidebar` are removed from the normal flex
flow. The `#main` flex row contains only `#canvas-wrap`, which expands to `flex: 1`
(100% width).

### 3. Panels become fixed overlay drawers

Both sidebars are converted to `position: fixed` overlays:

```
#left-sidebar (desktop):
  position: fixed; top: header-height; left: 0; bottom: footer-height;
  width: 280px;
  transform: translateX(-100%);   /* hidden */
  transition: transform 0.22s ease;
  z-index: 200;

#left-sidebar.drawer-open:
  transform: translateX(0);
```

```
#right-sidebar (desktop):
  position: fixed; top: header-height; right: 0; bottom: footer-height;
  width: 280px;
  transform: translateX(100%);    /* hidden */
  transition: transform 0.22s ease;
  z-index: 200;

#right-sidebar.drawer-open:
  transform: translateX(0);
```

Width remains 280px (slightly wider than the current 260px to accommodate the full
panel title at comfortable line lengths).

### 4. Persistent edge handle tabs

Two thin vertical handle tabs are added to the DOM (inside `#main`):

```html
<button id="desktop-left-handle"  class="desktop-drawer-handle desktop-handle-left"
        aria-label="Open Bani Flow panel">☰&thinsp;Bani Flow</button>
<button id="desktop-right-handle" class="desktop-drawer-handle desktop-handle-right"
        aria-label="Open Musician panel">Musician&thinsp;♫</button>
```

CSS (desktop only, hidden on mobile):

```css
/* Base handle — full-height vertical tab on viewport edge */
.desktop-drawer-handle {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 80px;
  z-index: 201;                  /* above sidebars so it stays clickable */
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--fg-sub);
  font-size: 0.60rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 6px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.desktop-drawer-handle:hover {
  background: var(--bg-active);
  color: var(--accent);
  border-color: var(--accent);
}
.desktop-handle-left {
  left: 0;
  border-left: none;
  border-radius: 0 4px 4px 0;
}
.desktop-handle-right {
  right: 0;
  border-right: none;
  border-radius: 4px 0 0 4px;
}
/* Hide handle when its panel is open — panel edge replaces it */
#left-sidebar.drawer-open  ~ .desktop-handle-left,
#right-sidebar.drawer-open ~ .desktop-handle-right { opacity: 0; pointer-events: none; }
```

When a panel is open, its edge serves as the visible boundary; the handle fades out
(`opacity: 0`) to avoid visual duplication. When closed, the handle reappears
instantly.

The handles are hidden on mobile (`@media (max-width: 768px) { .desktop-drawer-handle
{ display: none; } }`) because the mobile tab bar (ADR-041) serves the same purpose.

### 5. Toggle interaction

Clicking the left handle:
- If left panel is closed → `setPanelState('TRAIL')` (open left drawer)
- If left panel is open → `setPanelState('IDLE')` (close left drawer)

Clicking the right handle:
- If right panel is closed → `setPanelState('MUSICIAN')` (open right drawer)
- If right panel is open → `setPanelState('IDLE')` (close right drawer)

### 6. Automatic open on graph events

The existing `mobile.js` `setPanelState()` guarded all drawer calls behind
`if (window.innerWidth > 768) return;`. This guard is removed. Desktop now
participates in the same panel state machine as mobile.

Graph interaction callbacks already call:
- `peekBottomSheet()` / `showBottomSheet('expanded')` on node click → opens right drawer
- `setPanelState('TRAIL')` when the Bani Flow trail updates → opens left drawer

These will now fire on desktop too, giving the panel-reveal-on-selection behaviour
the user described.

### 7. No scrim on desktop

On desktop, `#left-drawer-scrim` and `#right-drawer-scrim` remain `display: none`
(not activated). The toggle handle is the sole dismiss affordance. This keeps the
canvas fully readable when a panel is open.

### 8. Cytoscape resize nudge

After any panel open/close transition, `cy.resize()` is called with a 30ms delay
(already present in mobile.js) to reflow the canvas. On desktop the canvas does not
physically change width (the panel overlays it rather than displacing it), so this
is only needed to clear any layout caching artefacts.

---

## JSON before / after

No data schema change. This is a pure rendering-layer change.

---

## Consequences

### Positive
- Canvas uses 100% of desktop viewport width — any graph with > ~15 nodes now
  has substantially more room.
- Desktop and mobile share the same mental model: panels appear on demand.
- The handle tabs are self-teaching (they label the panel they open).
- Toggle semantics require no additional close button inside panels.
- Panels open automatically on the first node click, so new users discover the
  panels immediately without needing to find the handles.

### Negative / mitigations
- Floating media players (`position: absolute` inside `#cy-wrap`) may visually
  overlap with an open left or right drawer. Mitigation: the canvas is still
  full-width; players are unconstrained. Users can drag players toward the center
  of the canvas. No z-index change needed.
- Users accustomed to the fixed sidepanels will need to rediscover the panels.
  Mitigation: the handle tabs are always visible; the first node click auto-opens
  the Musician panel; the Bani Flow panel opens when a trail item is selected.

---

## Implementation

**Carnatic Coder** tasks (all in `carnatic/render/templates/`):

1. **`base.html` — CSS**: Add a `@media (min-width: 769px)` block that:
   - Sets `#left-sidebar` and `#right-sidebar` to `position: fixed` with `transform:
     translateX(±100%)` (hidden) and `transition: transform 0.22s ease`.
   - Adds `.desktop-drawer-handle`, `.desktop-handle-left`, `.desktop-handle-right`
     styles as specified in §4 above.
   - Hides the handles at `@media (max-width: 768px)`.

2. **`base.html` — HTML**: Add two `<button>` handle elements inside `#main`,
   after the `#right-sidebar` close tag.

3. **`mobile.js` — state machine**: Remove the `if (window.innerWidth > 768) return;`
   guard from `setPanelState()` so desktop participates in the drawer state machine.
   `peekBottomSheet()`, `dismissBottomSheet()`, `showBottomSheet()`, `toggleLeftDrawer()`
   retain their own guards only if the calling context is exclusively mobile
   (none of them are — all are called from graph_view.js on both breakpoints).

4. **`mobile.js` — handle wiring**: Add `click` event listeners for
   `#desktop-left-handle` and `#desktop-right-handle` that call `toggleLeftDrawer()`
   and `toggleRightDrawer()` respectively. Use a new `toggleRightDrawer()` function
   mirroring `toggleLeftDrawer()`.
