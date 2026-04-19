# ADR-039: Mobile Musician Panel as Right Drawer

**Status:** Proposed
**Date:** 2026-04-18
**Depends on:** ADR-036 (panel state machine), ADR-038 (tab bar rationalisation)

---

## Context

ADR-034 converted the desktop right sidebar into a mobile bottom sheet: the
`#right-sidebar` becomes `position: fixed; bottom: 56px` and slides up via
`translateY()` with three states (dismissed → peek → expanded). ADR-036 refined
this with a drag handle, contextual peek labels, and state machine integration.

### What breaks on mobile (observed in screenshot)

1. **Musician bar does not open.** Tapping the `♫ Musician` tab at the bottom is
   supposed to call `setPanelState('PEEK')`, which adds the `.peek` class to
   `#right-sidebar`. However, in practice the musician panel does not appear
   accessible — the user sees no musician info and cannot search musicians. The
   bottom sheet either does not render visibly at its peek height (100px), or
   the tap-through issue (ADR-038 §3) selects a node but never triggers the sheet.
   Either way, **musician info is inaccessible and unsearchable on mobile**.

2. **Bottom sheet is the wrong paradigm for the Musician panel.** The musician
   panel contains: a search box, a node header (name, lifespan, Wikipedia link),
   a recording filter, a scrollable recordings list, and edge info. This is a
   tall, content-rich panel — similar in nature to the Trail panel (left drawer).
   A bottom sheet that starts at 100px peek height and expands to 50vh gives the
   panel an awkward half-screen presentation. Meanwhile, the content *wants* full
   height — the recordings list can have 50+ entries.

3. **Spatial asymmetry.** After ADR-038 moves the Trail tab to the left and the
   Musician tab to the right, the expected mental model is:
   - Left tab → left panel (Trail drawer slides from left) ✓
   - Right tab → right panel (Musician should slide from right)
   But today, the Musician panel rises from the bottom as a sheet. This violates
   the spatial correspondence established by the tab placement.

4. **No musician search on mobile.** The `#musician-search-input` lives inside
   `#right-sidebar`, which on mobile is the bottom sheet. Even if the sheet opens,
   the search box is buried inside the expanded state — it's not visible in peek
   mode. A right drawer that opens to full height would make the search immediately
   accessible.

---

## Forces in tension

| Force | Direction |
|---|---|
| **Immersion** | The rasika must be able to search and browse musicians at any time. The musician panel is a primary navigation surface, not a secondary detail pane. |
| **Spatial coherence** | Right tab → right drawer. The panel should appear from the same edge as its button. |
| **Symmetry** | Left drawer (Trail) and right drawer (Musician) mirror each other structurally. Same slide animation, same width calculation, same scrim. |
| **Canvas visibility** | Two drawers open simultaneously would obscure the entire canvas. Mutual exclusion must be enforced — opening one closes the other. |
| **ADR-037 dependency** | The media player (ADR-037) was positioned relative to the bottom sheet. If the bottom sheet is removed, ADR-037's positioning must adapt. Fortunately, ADR-037's mini-player is docked above the tab bar, independent of the sheet. |

---

## Pattern

**Dual drawer** (Google Maps mobile, many music apps): The app has two drawers —
one from the left (navigation/library) and one from the right (detail/context).
Both are full-height, occupy `min(85vw, 320px)`, and are mutually exclusive. A
scrim covers the canvas when either is open. The bottom tab bar remains visible
beneath both.

**Strong Centres** (Alexander): Each drawer is a complete centre of interaction.
The left drawer is the Trail centre (raga/composition navigation). The right
drawer is the Musician centre (search, node info, recordings). Neither interrupts
the other.

---

## Decision

### 1. Convert `#right-sidebar` from bottom sheet to right drawer on mobile

At `≤768px`, `#right-sidebar` becomes a fixed right drawer, mirroring the left
drawer:

```css
@media (max-width: 768px) {
  #right-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: auto;
    width: min(85vw, 320px);
    height: auto;            /* full viewport height, not 50vh */
    min-height: unset;
    z-index: 200;            /* same as left drawer */
    transform: translateX(100%);   /* off-screen right */
    transition: transform 0.25s ease;
    border-radius: 0;
    border-top: none;
    border-left: 2px solid var(--border-strong);
    box-shadow: -4px 0 16px rgba(0,0,0,0.3);
    overflow-y: auto;
  }
  #right-sidebar.drawer-open {
    transform: translateX(0);
  }
}
```

The `.peek` and `.expanded` classes are **removed** — they are bottom sheet
concepts. The right sidebar is either open (`drawer-open`) or closed.

### 2. Remove bottom sheet mechanics for Musician panel

The following mobile-only elements become unused and are removed:

- `#sheet-handle` — the drag handle pill (only relevant for a bottom sheet)
- `#sheet-peek-label` — the contextual peek label (replaced by always-visible
  musician search inside the open drawer)
- The `_setupSheetHandle()` touch logic in `mobile.js`
- The `peek` / `expanded` CSS classes on `#right-sidebar`
- The `body.sheet-peek` / `body.sheet-expanded` body classes

### 3. Add a right-drawer scrim

A new scrim element `#right-drawer-scrim` (analogous to `#left-drawer-scrim`)
covers the canvas when the Musician drawer is open:

```html
<div id="right-drawer-scrim" aria-hidden="true"></div>
```

```css
#right-drawer-scrim {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 199;
}
#right-drawer-scrim.scrim-visible {
  display: block;
}
```

Tapping the scrim closes the Musician drawer.

### 4. Update the panel state machine

The state machine in `mobile.js` updates:

```
States: IDLE | MUSICIAN | TRAIL

IDLE     → canvas visible, both drawers closed, no tabs active
MUSICIAN → right drawer open, scrim visible, Musician tab active
TRAIL    → left drawer open, scrim visible, Trail tab active
```

The `PEEK` state is **removed**. There is no intermediate state — the Musician
drawer is either open or closed. This simplifies the state machine from four
states to three.

```javascript
function setPanelState(newState) {
  if (window.innerWidth > 768) return;
  panelState = newState;

  // Close everything first
  _closeLeftDrawer();
  _closeRightDrawer();

  if (newState === 'TRAIL') {
    _openLeftDrawer();
  } else if (newState === 'MUSICIAN') {
    _openRightDrawer();
  }

  _updateTabs(newState);
}
```

**Mutual exclusion is automatic**: `setPanelState()` always closes both drawers
before opening the requested one. Opening Trail closes Musician and vice versa.

### 5. Node tap opens the Musician drawer

When the user taps a graph node on mobile, instead of `peekBottomSheet()`, the
callback calls `setPanelState('MUSICIAN')`. The right drawer opens with the
selected node's info pre-populated (name, recordings, etc.) — exactly as it does
today in the expanded bottom sheet, but now in a full-height right drawer.

```javascript
// graph_view.js — on node select (mobile path)
if (window.innerWidth <= 768) {
  window.setPanelState('MUSICIAN');
}
```

### 6. Add a close button inside the Musician drawer

Mirroring the Trail drawer's `#drawer-close-btn`, add a `#right-drawer-close-btn`
inside `#right-sidebar`:

```html
<button id="right-drawer-close-btn" aria-label="Close musician panel">&times;</button>
```

Positioned at `top: 8px; left: 8px` (mirrored from the Trail drawer's
`top: 8px; right: 8px`), since the right drawer opens from the right edge so the
close button should be on the inner (left) side.

---

## Before / After

### Before (bottom sheet)
```
┌────────────────────────────────────┐
│  CARNATIC MUSIC       [GS|MJ]     │
├────────────────────────────────────┤
│                                    │
│          (canvas)                  │
│                                    │
├────────────────────────────────────┤
│  ━━━ (drag handle)                 │
│  ◆ Vina Dhanammal · 4▶         ↑  │  100px peek (often broken)
├────────────────────────────────────┤
│    [☰ Trail]       [♫ Musician]    │  56px tab bar
└────────────────────────────────────┘
```

### After (right drawer)
```
┌────────────────────────┬───────────┐
│  CARNATIC MUSIC [GS|MJ]│ × Musician│
├────────────────────────┤ 🔍 search │
│                        │  ◆ Dhana  │
│      (canvas)          │  (1893–   │
│                        │  1938)    │
│                        │ Recordings│
│                        │  ► track1 │
│                        │  ► track2 │
│                        │  ► track3 │
├────────────────────────┴───────────┤
│    [☰ Trail]       [♫ Musician]    │ 56px tab bar
└────────────────────────────────────┘
```

---

## Consequences

- **Full-height musician panel.** The musician search, node info, and recordings
  list have the full viewport height to work with. No more 50vh constraint.

- **Musician search is immediately accessible.** Opening the drawer reveals the
  search box at the top. Users can search for any musician without first selecting
  a node.

- **ADR-036 state machine simplifies.** Three states instead of four. No PEEK
  state, no sheet handle, no drag gesture logic. The state machine is easier to
  reason about.

- **ADR-037 impact is minimal.** The mini-player strip (ADR-037) is docked above
  the tab bar at `bottom: calc(56px + env(safe-area-inset-bottom))`. It does not
  depend on the bottom sheet. The `body.sheet-peek` and `body.sheet-expanded`
  rules that ADR-037 was going to clean up are now gone entirely.

- **Desktop is unmodified.** All changes are inside `@media (max-width: 768px)`.
  On desktop, `#right-sidebar` remains a static right column.

- **Node tap behaviour changes.** Currently, tapping a node on mobile peeks the
  bottom sheet (100px). Now it opens a full right drawer. This is more disruptive
  visually but more useful — the user gets full info immediately. If this feels
  too aggressive, a future iteration can add a "peek" animation where the drawer
  partially opens, then completes on a second tap.

- **Two scrim elements.** The left and right drawer scrims are separate elements.
  Only one is ever visible (mutual exclusion). An alternative is a shared scrim,
  but two separate elements avoid wiring complexity.

---

## Implementation

| Step | Owner | Description |
|---|---|---|
| 1 | Carnatic Coder | Replace `#right-sidebar` bottom-sheet CSS with right-drawer CSS at ≤768px |
| 2 | Carnatic Coder | Remove `.peek`, `.expanded`, `#sheet-handle`, `#sheet-peek-label` from mobile styles |
| 3 | Carnatic Coder | Add `#right-drawer-scrim` to `base.html` and style it |
| 4 | Carnatic Coder | Add `#right-drawer-close-btn` inside `#right-sidebar` with left-aligned position |
| 5 | Carnatic Coder | Rewrite `setPanelState()` in `mobile.js`: three states (IDLE, MUSICIAN, TRAIL), dual drawer open/close |
| 6 | Carnatic Coder | Remove `_setupSheetHandle()`, `peekBottomSheet()`, `showBottomSheet()` functions |
| 7 | Carnatic Coder | Update `graph_view.js` node-select callback: call `setPanelState('MUSICIAN')` instead of `peekBottomSheet()` |
| 8 | Carnatic Coder | Wire `#right-drawer-scrim` click → `setPanelState('IDLE')` |
| 9 | Carnatic Coder | Wire `#right-drawer-close-btn` click → `setPanelState('IDLE')` |
| 10 | Carnatic Coder | `bani-render` + test in Chrome DevTools 390px emulator |

All steps are Carnatic Coder scope.

---

## Open questions

1. **Node tap: immediate full drawer or two-step?** This ADR proposes opening the
   full drawer on node tap. An alternative is a brief 200ms "peek" animation (drawer
   slides to 80px, then completes to full width after 300ms). This gives a visual
   cue without requiring a second tap. Defer to implementation testing.

2. **Swipe-to-close.** Should the right drawer support swipe-right-to-close (mirroring
   the left drawer's implied swipe-left-to-close)? This is a touch gesture nicety,
   not a launch blocker. Recommend yes for consistency.

3. **Landscape mode.** On landscape phones (height < width), two full-height drawers
   may overlap the canvas entirely. Consider limiting drawer width to `min(60vw, 280px)`
   in landscape. Out of scope for this ADR.
