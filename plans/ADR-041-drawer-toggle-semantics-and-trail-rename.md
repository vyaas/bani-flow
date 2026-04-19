# ADR-041: Drawer Toggle Semantics — Tab Bar Always Visible, Click-to-Dismiss, Rename Trail → Bani Flow

**Status:** Proposed
**Date:** 2026-04-18
**Depends on:** ADR-038 (tab bar rationalisation), ADR-039 (right drawer)

---

## Context

ADR-038 established a two-tab bottom bar (`Trail` left, `Musician` right) and
ADR-039 converted both panels to left/right drawers. Currently, each drawer has
two dismiss affordances: a scrim tap and an ✕ close button inside the drawer's
header. In practice three problems remain:

1. **Tabs disappear behind the drawer.** When either drawer slides open, the tab
   bar is visually obscured by the scrim and the drawer itself occupies the
   screen edge from top to bottom. The user who opened the drawer by tapping
   the tab cannot see that same tab to close it. The ✕ button inside the drawer
   is the only visible close affordance — a non-obvious, non-symmetric escape
   hatch.

2. **No toggle idiom.** Physical drawers open and close from the same handle.
   Digital drawers should do the same. If the tab bar remained visible *above*
   the scrim z-order, the user could tap the same tab again to close the
   drawer. This is the toggle idiom: one button, two states, zero ambiguity.
   With toggle semantics the ✕ button becomes redundant and can be removed,
   recovering header space for the panel title.

3. **"Trail" label is opaque.** The label "Trail" communicates nothing about
   what the panel contains. The panel's own header says "BANI FLOW ♫". The
   tab should say the same. Renaming the tab from "Trail" to "Bani Flow"
   aligns the entry point with the destination.

### User statement

> "If the side panel opened such that the Musician and Trail tabs remained
> visible and clickable, the user would naturally *know* how to minimize
> either panel: by merely clicking it again! This would remove the need for
> an X button for either panel as there is a natural way to open and close
> these panels, which come in and out like drawers."

---

## Forces in tension

| Force | Direction |
|---|---|
| **Discoverability** | The toggle idiom is self-teaching: the same control that opens also closes. No instruction needed. |
| **Spatial stability** | The tab bar is the user's anchor — it must remain fixed at the viewport bottom regardless of panel state. Moving it or hiding it breaks spatial memory. |
| **Z-order simplicity** | The tab bar must sit above the scrim (z > 199) but below the drawer content. This is a narrow z-index band that must be explicitly managed. |
| **Header economy** | Removing the ✕ button inside each drawer frees ~44px of header width. The panel title can breathe. |
| **Label clarity** | "Bani Flow" is the panel's identity. "Trail" is an implementation term. The label should match the destination. |

---

## Pattern

**Toggle affordance** (iOS tab bar, Android bottom navigation): Tapping the
active tab in a bottom bar returns the user to the default state — collapses
the panel, scrolls to top, or deselects. The tab bar is always visible; it is
the persistent control surface. This pattern is so universal that its absence
is the surprise.

**Naming centres by their essence** (Alexander, *A Timeless Way of Building*,
ch. 10): A centre's name should describe what happens there, not how you get
there. "Bani Flow" describes the exploration experience; "Trail" describes the
implementation detail of a breadcrumb-like list.

---

## Decision

### 1. Tab bar sits above the scrim

The `#mobile-tab-bar` z-index is raised above the scrim:

```css
#mobile-tab-bar {
  z-index: 210;     /* above scrim (199–200), above drawer (200) */
  position: fixed;
  bottom: 0;
  /* ...existing flex, height, background styles unchanged */
}
```

Both drawers remain at `z-index: 200`. The scrim remains at `z-index: 199`.
The tab bar floats above everything except modal dialogs (if any).

When a drawer is open, the tab bar is visually "in front of" the scrim but
"behind" the drawer's content edge. The active tab glows or is highlighted
to signal "this drawer is mine — tap me to close it."

### 2. Toggle semantics for both tabs

The click handler for each tab becomes a toggle:

```javascript
// Pseudocode — replaces existing setPanelState calls
tabTrail.addEventListener('click', () => {
  if (leftDrawerIsOpen()) {
    closeLeftDrawer();
    tabTrail.classList.remove('tab-active');
  } else {
    closeRightDrawer();   // mutual exclusion
    openLeftDrawer();
    tabTrail.classList.add('tab-active');
    tabMusician.classList.remove('tab-active');
  }
});

tabMusician.addEventListener('click', () => {
  if (rightDrawerIsOpen()) {
    closeRightDrawer();
    tabMusician.classList.remove('tab-active');
  } else {
    closeLeftDrawer();    // mutual exclusion
    openRightDrawer();
    tabMusician.classList.add('tab-active');
    tabTrail.classList.remove('tab-active');
  }
});
```

Scrim tap still closes either drawer (defensive fallback), but the ✕ button
is removed from both drawer headers.

### 3. Active tab highlight

The active tab receives a `.tab-active` class:

```css
.mobile-tab.tab-active {
  color: var(--accent-main);
  border-top: 2px solid var(--accent-main);
}
.mobile-tab:not(.tab-active) {
  color: var(--text-muted);
  border-top: 2px solid transparent;
}
```

This gives the user a persistent visual signal: "this tab is currently open;
tap it to close."

### 4. Rename "Trail" → "Bani Flow"

In the tab bar HTML:

```html
<button class="mobile-tab" id="tab-trail" aria-label="Bani Flow panel">
  <span class="mobile-tab-icon">&#9776;</span>
  <span class="mobile-tab-label">Bani Flow</span>
</button>
```

The `id` remains `tab-trail` for backward compatibility with existing JS
references. Only the visible label and aria-label change.

### 5. Remove ✕ close button from both drawers

The `<button class="close-panel-btn">✕</button>` (or equivalent) inside each
drawer header is removed. Its click handler is deleted. The panel title expands
to fill the recovered space.

---

## Desktop behaviour

On desktop (≥769px), both sidebars are always visible and do not use the tab
bar. This ADR has no effect on the desktop layout. The tab bar is
`display: none` at ≥769px per ADR-036.

---

## Consequences

| Consequence | Impact |
|---|---|
| ✕ button removal | Reduces close affordances from three (✕, scrim, tab toggle) to two (scrim, tab toggle). Acceptable: both remaining affordances are more discoverable than ✕ was. |
| Higher tab bar z-index | Must be tested against entry forms (ADR-031) and media player (ADR-037). If either floats above 210, z-index collisions may occur. |
| "Bani Flow" label width | "Bani Flow" is wider than "Trail" (9 chars vs 5). On narrow viewports (<320px) the label may need to truncate. Mitigated by `text-overflow: ellipsis` on `.mobile-tab-label`. |
| Backward compatibility | `#tab-trail` id is preserved. No JS refactoring beyond the toggle handler. |

---

## Implementation

1. **Carnatic Coder**: Raise `#mobile-tab-bar` z-index to 210 in `base.html` or
   `mobile.css`.
2. **Carnatic Coder**: Replace `setPanelState` calls with toggle logic in
   `mobile.js`.
3. **Carnatic Coder**: Add `.tab-active` CSS class and apply on open/close
   transitions.
4. **Carnatic Coder**: Rename tab label from "Trail" to "Bani Flow" in HTML.
5. **Carnatic Coder**: Remove ✕ close button from both drawer headers.
6. **Carnatic Coder**: Run `bani-render`, verify on 390px viewport.
