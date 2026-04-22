# ADR-066: Musician Panel History Navigation (Back / Forward)

**Status**: Accepted
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-025 (explicit panel state), ADR-046 (sticky zone / right sidebar layout), ADR-064 (raga→composition tree)

---

## Context

### The disorientation problem

When a rasika selects a musician node from the graph, the right-sidebar (Musician Panel) populates with that musician's recordings and tree structure. While exploring, the rasika may click on a *composer chip* or a *co-performer chip* inside the panel — this calls `selectNode()` and overwrites the entire panel with the new musician's data.

The problem: **there is no way back**. The previous musician's panel contents are gone and the graph viewport may have shifted. The rasika has lost their place in the exploration.

This is not a problem for raga/composition clicks: those open the *left* Bani Flow panel and leave the Musician panel intact. But musician-to-musician traversal within the right panel has no navigation memory.

### Comparison with other panel pairings

| Click target | Panel effect | Navigation preserved? |
|---|---|---|
| Musician node on graph | Right panel reloads | ❌ no history |
| Raga chip in recordings | Left Bani-Flow panel opens | ✅ right panel untouched |
| Composition chip | Left Bani-Flow panel opens | ✅ right panel untouched |
| Composer chip (musician) | Right panel reloads | ❌ no history — **the pain point** |
| Co-performer chip | Right panel reloads | ❌ no history |

### The request

> "When a rasika clicks on a Composer's name, they are thrown into a list where it is difficult to traceback where the rasika came from. We essentially need navigation buttons for both panels. We can have a ← and → button on either side of the header of the panel. Something like ← Bani-Flow → and ← Musician →. Let us keep a maximum cache of 5 items."

This ADR scopes to the **Musician Panel** (right sidebar). The Bani Flow panel (left) has a separate interaction model — filter-driven rather than node-driven — and is left for a future ADR if needed.

---

## Forces

| Force | Direction |
|---|---|
| **Disorientation** | Every musician-chip click replaces all panel content with no way back — the rasika loses their exploration thread |
| **Familiar affordance** | Browser-style back/forward arrows are instantly understood, globally familiar — zero new learning |
| **Visual symmetry** | `← Musician ♪ →` mirrors the panel title symmetrically, adding affordance without adding cognitive load |
| **Cache cap** | A max-5 back stack prevents unbounded memory growth in a long exploration session |
| **Rendering layer only** | No data-schema changes — purely JS state + minimal CSS + two HTML buttons. The underlying `selectNode()` function remains the single entry point |
| **No orphan forward history** | When a new node is selected directly (not via nav buttons), the forward stack is cleared — standard browser-history model |
| **Disabled state legibility** | Back/forward buttons must visually communicate "nothing here" when the stack is empty — opacity dimming, pointer-events none |

---

## Decision

### 1 — UI layout: buttons flank the panel title

```html
<!-- BEFORE -->
<h3>Musician &#9835;</h3>

<!-- AFTER -->
<h3>
  <button id="panel-back-btn"  class="panel-nav-btn" title="Back"    disabled>&#8592;</button>
  Musician &#9835;
  <button id="panel-fwd-btn"   class="panel-nav-btn" title="Forward" disabled>&#8594;</button>
</h3>
```

The `h3` becomes a flex row (`display:flex; align-items:center; justify-content:space-between`). The panel title text lives between the two nav buttons, centred by flex auto-margins. On an empty history the buttons are `disabled` with reduced opacity; on a populated history they are fully interactive.

### 2 — History data model

```javascript
// Added to graph_view.js (module-level, before selectNode)
const panelHistory = {
  back:    [],   // [nodeId, …] oldest first, most-recent-prev last — max 5 entries
  forward: [],   // [nodeId, …] next first, furthest last — max 5 entries
};
const PANEL_HISTORY_MAX = 5;
```

Standard browser-history invariants:
- **New selection** → push current to `back` (trim to `PANEL_HISTORY_MAX`), clear `forward`.
- **Back** → push current to `front` of `forward` (trim to `PANEL_HISTORY_MAX`), pop last from `back`, navigate.
- **Forward** → push current to end of `back` (trim to `PANEL_HISTORY_MAX`), pop first from `forward`, navigate.

"Current" is always whichever node happens to be rendered in the panel — there is no explicit `current` variable to maintain.

### 3 — selectNode receives an optional navigation flag

```javascript
// BEFORE
function selectNode(node) { … }

// AFTER
function selectNode(node, { fromHistory = false } = {}) {
  if (!fromHistory) {
    // push the previous node id (if any) onto back stack
    const prevId = _currentPanelNodeId;
    if (prevId && prevId !== node.id()) {
      panelHistory.back.push(prevId);
      if (panelHistory.back.length > PANEL_HISTORY_MAX)
        panelHistory.back.shift();        // drop oldest
      panelHistory.forward = [];          // new path clears forward
    }
  }
  _currentPanelNodeId = node.id();
  _updatePanelNavButtons();
  // … rest of selectNode unchanged …
}
```

`_currentPanelNodeId` is a module-level `let` string (or `null` on first load).  `_updatePanelNavButtons()` is a small helper that sets `disabled` / `opacity` on both buttons.

### 4 — Back and Forward handlers

```javascript
// panel-back-btn click
function panelBack() {
  if (!panelHistory.back.length) return;
  const targetId = panelHistory.back.pop();
  panelHistory.forward.unshift(_currentPanelNodeId);
  if (panelHistory.forward.length > PANEL_HISTORY_MAX)
    panelHistory.forward.pop();
  const n = cy.getElementById(targetId);
  if (n && n.length) selectNode(n, { fromHistory: true });
}

// panel-fwd-btn click
function panelForward() {
  if (!panelHistory.forward.length) return;
  const targetId = panelHistory.forward.shift();
  panelHistory.back.push(_currentPanelNodeId);
  if (panelHistory.back.length > PANEL_HISTORY_MAX)
    panelHistory.back.shift();
  const n = cy.getElementById(targetId);
  if (n && n.length) selectNode(n, { fromHistory: true });
}
```

Note: `panelBack()` / `panelForward()` do **not** re-orient the graph viewport (no `orientToNode` call). The rasika navigated to the current musician by some other means; the panel history is a *panel* affordance, not a graph viewport affordance. If the rasika wants to re-centre the graph on the returned-to musician, they can click the musician chip (which calls `orientToNode`, unchanged).

### 5 — Button styles (CSS additions to base.html)

```css
/* panel-nav-btn: small arrow buttons flanking the Musician ♪ heading */
.panel-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: none;
  border: 1px solid var(--border-weak);
  border-radius: 50%;
  color: var(--fg-muted);
  font-size: 0.75rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s, border-color 0.15s;
}
.panel-nav-btn:disabled {
  opacity: 0.25;
  cursor: default;
  pointer-events: none;
}
.panel-nav-btn:not(:disabled):hover {
  border-color: var(--accent-main);
  color: var(--accent-main);
}

/* Make the h3 inside #musician-panel a flex row for button layout */
#musician-panel h3 {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```

---

## Consequences

### Positive
- Rasika can navigate back through up to 5 musician panels without losing their thread
- Forward history is preserved when navigating back, enabling full browser-style undo/redo of panel traversal
- Zero changes to data layer, rendering pipeline, or mobile layout
- The `fromHistory` flag leaves `selectNode()` as the single selection entry point — no new code paths for recordings, highlights, or panel state management

### Negative / tradeoffs
- Adding `_currentPanelNodeId` as module-level state is a small increase in statefulness of `graph_view.js`; acceptable given this is a panel-specific concern
- The graph viewport is **not** walked back — the history is purely a panel concern. This is a deliberate choice to avoid unexpected graph jumps; if viewport history is wanted later, a separate ADR should address it
- The forward stack is nuked on every fresh selection, consistent with browser history

### Out of scope
- Bani Flow panel (left sidebar) history — separate concern, different interaction model
- Keyboard shortcuts (Alt+Left / Alt+Right) — could be added as a follow-on with zero architecture change (just add `keydown` listeners calling `panelBack()` / `panelForward()`)
- URL hash navigation — not applicable in a single-page self-contained HTML file

---

## Implementation (for Carnatic Coder)

All changes are **rendering layer only**: `carnatic/render/templates/base.html` and `carnatic/render/templates/graph_view.js`.

### Step 1 — `base.html`: two buttons in the `#musician-panel h3`

Locate (approximately line 2506):
```html
        <h3>Musician &#9835;</h3>
```
Replace with:
```html
        <h3>
          <button id="panel-back-btn" class="panel-nav-btn" title="Back" disabled>&#8592;</button>
          Musician &#9835;
          <button id="panel-fwd-btn" class="panel-nav-btn" title="Forward" disabled>&#8594;</button>
        </h3>
```

### Step 2 — `base.html`: CSS additions

Add `.panel-nav-btn` rules and the `#musician-panel h3` flex override (from §5 above) in the `<style>` block alongside the existing `.panel h3` rules.

### Step 3 — `graph_view.js`: module-level history state

Before `function selectNode`:
```javascript
// ── Panel history (ADR-066) ──────────────────────────────────────────────────
let _currentPanelNodeId = null;
const panelHistory = { back: [], forward: [] };
const PANEL_HISTORY_MAX = 5;

function _updatePanelNavButtons() {
  const backBtn = document.getElementById('panel-back-btn');
  const fwdBtn  = document.getElementById('panel-fwd-btn');
  if (backBtn) backBtn.disabled = panelHistory.back.length === 0;
  if (fwdBtn)  fwdBtn.disabled  = panelHistory.forward.length === 0;
}

function panelBack() {
  if (!panelHistory.back.length) return;
  const targetId = panelHistory.back.pop();
  if (_currentPanelNodeId) {
    panelHistory.forward.unshift(_currentPanelNodeId);
    if (panelHistory.forward.length > PANEL_HISTORY_MAX) panelHistory.forward.pop();
  }
  const n = cy.getElementById(targetId);
  if (n && n.length) selectNode(n, { fromHistory: true });
}

function panelForward() {
  if (!panelHistory.forward.length) return;
  const targetId = panelHistory.forward.shift();
  if (_currentPanelNodeId) {
    panelHistory.back.push(_currentPanelNodeId);
    if (panelHistory.back.length > PANEL_HISTORY_MAX) panelHistory.back.shift();
  }
  const n = cy.getElementById(targetId);
  if (n && n.length) selectNode(n, { fromHistory: true });
}
```

### Step 4 — `graph_view.js`: modify `selectNode` signature and history push

```javascript
// BEFORE
function selectNode(node) {
  const d = node.data();

// AFTER
function selectNode(node, { fromHistory = false } = {}) {
  const d = node.data();
  if (!fromHistory) {
    if (_currentPanelNodeId && _currentPanelNodeId !== node.id()) {
      panelHistory.back.push(_currentPanelNodeId);
      if (panelHistory.back.length > PANEL_HISTORY_MAX) panelHistory.back.shift();
      panelHistory.forward = [];
    }
  }
  _currentPanelNodeId = node.id();
  _updatePanelNavButtons();
```

### Step 5 — `graph_view.js`: wire button `onclick` handlers

Add after the `panelForward` definition (still before `selectNode`):
```javascript
document.getElementById('panel-back-btn').addEventListener('click', panelBack);
document.getElementById('panel-fwd-btn').addEventListener('click', panelForward);
```

### Step 6 — Render and validate

```bash
source .venv/bin/activate && bani-render
```

Smoke-test checklist:
- [ ] Select musician A on graph → back btn disabled, fwd btn disabled
- [ ] Click composer chip in panel → panel shows composer B → back btn enabled
- [ ] Click ← back btn → panel returns to musician A → back btn disabled, fwd btn enabled
- [ ] Click → fwd btn → panel returns to musician B → fwd btn disabled, back btn enabled
- [ ] Navigate A → B → C → D → E → F (6 hops) → back stack shows max 5 entries (A is dropped)
- [ ] Click musician name chip inside panel → `orientToNode` fires, graph pans, panel stays (no double-push: `orientToNode` calls `selectNode` which pushes normally — correct)
