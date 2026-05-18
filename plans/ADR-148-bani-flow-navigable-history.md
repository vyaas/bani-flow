# ADR-148 — BANI FLOW Navigable History (back/forward navigation)

**Status**: Accepted  
**Date**: 2026-05-18  
**Agents**: graph-architect, carnatic-coder  
**Depends on**: ADR-020 (subject header), ADR-066 (panel history pattern)

---

## Context

The MUSICIAN panel has had back/forward navigation since ADR-066 (`panelHistory`, `panelBack`,
`panelForward` in graph_view.js:913–945). Every click on a lineage chip, wiki link, or external
selection pushes to history, and the ← → buttons let the user retrace their steps.

The BANI FLOW panel has no equivalent. Clicking a janya chip inside the family popup (ADR-149)
navigates away with no way back. The same issue exists today: clicking a composition chip navigates
to the composition, losing the raga context.

The musician panel implementation is a complete, tested template. Zero reinvention is needed —
only a parallel implementation for the bani context.

---

## Forces

- **Explorable navigation**: users follow chains (raga → janya → its mela → a composition) and
  need to retrace steps without retyping in the search bar.
- **Parity**: the two panels are symmetric in purpose (musician lineage exploration vs. raga/comp
  exploration). Navigation symmetry reduces cognitive load.
- **External triggers**: `triggerBaniSearch` is called from `media_player.js` in ~20 places
  (clicking raga/comp chips in the trail). These callers must push to history without any changes
  at the call sites.

---

## Pattern

**History as a stack pair** (from ADR-066). Current state lives in `_currentBaniSubject`. Back
navigations push current onto `forward`; forward navigations push current onto `back`. A cap of 5
entries per stack prevents unbounded growth. `fromHistory` flag breaks the push loop when
navigating via the buttons themselves.

---

## Decision

### HTML — `base.html`

Replace the `<span class="panel-nav-spacer">` stub in the BANI FLOW `<h3>` with a real back
button; wrap the existing `?` button and a new forward button in a flex span — exactly mirroring
the MUSICIAN `<h3>` structure at base.html:4755.

**Before:**
```html
<h3>
  <span class="panel-nav-spacer" aria-hidden="true"></span>
  <span class="bani-chip chip-panel-title" ...>BANI FLOW</span>
  <button id="bani-reset-btn" class="panel-nav-btn" ...>?</button>
</h3>
```

**After:**
```html
<h3>
  <button id="bani-back-btn" class="panel-nav-btn" title="Back" disabled>&#8592;</button>
  <span class="bani-chip chip-panel-title" ...>BANI FLOW</span>
  <span style="display:inline-flex;align-items:center;gap:4px">
    <button id="bani-fwd-btn" class="panel-nav-btn" title="Forward" disabled>&#8594;</button>
    <button id="bani-reset-btn" class="panel-nav-btn" ...>?</button>
  </span>
</h3>
```

The `.panel-nav-btn` CSS class is already defined and shared — no new styles needed.

### JavaScript — `bani_flow.js`

**New state** (added near `let activeBaniFilter`):
```javascript
let _currentBaniSubject = { type: null, id: null };
const baniHistory = { back: [], forward: [] };
const BANI_HISTORY_MAX = 5;
```

**New functions** (mirroring graph_view.js:916–945):
```javascript
function _updateBaniNavButtons() { ... }   // enables/disables buttons from stack lengths
function baniBack()               { ... }   // pop back → push forward → triggerBaniSearch(..., true)
function baniForward()            { ... }   // shift forward → push back → triggerBaniSearch(..., true)
// Event listeners for bani-back-btn and bani-fwd-btn
```

**Modified signature**:
```javascript
// was: function triggerBaniSearch(type, id)
function triggerBaniSearch(type, id, fromHistory = false)
```

History push logic at the top of `triggerBaniSearch` (before existing body):
```javascript
if (!fromHistory && _currentBaniSubject.type) {
  baniHistory.back.push({ type: _currentBaniSubject.type, id: _currentBaniSubject.id });
  if (baniHistory.back.length > BANI_HISTORY_MAX) baniHistory.back.shift();
  baniHistory.forward = [];
}
_currentBaniSubject = { type, id };
_updateBaniNavButtons();
```

All existing callers in `media_player.js` call `triggerBaniSearch(type, id)` without the third
argument, so they receive `fromHistory = false` and correctly push to history with no changes
at the call sites.

`clearBaniFilter()` should reset history state:
```javascript
baniHistory.back = [];
baniHistory.forward = [];
_currentBaniSubject = { type: null, id: null };
_updateBaniNavButtons();
```

---

## Consequences

- Back/forward works across all entry points: search bar, popup chips, trail chip clicks,
  media player raga/comp chip clicks.
- History depth capped at 5 (same as musician panel).
- `clearBaniFilter` (search bar clear / Escape) resets history — correct behaviour.
- `baniBack()` and `baniForward()` are globally scoped (like `panelBack`/`panelForward`)
  for potential future use by keyboard shortcuts.

---

## Implementation

Files touched:
- `carnatic/render/templates/base.html` — `<h3>` at ~line 4639
- `carnatic/render/templates/bani_flow.js` — history state, `triggerBaniSearch`, `clearBaniFilter`
