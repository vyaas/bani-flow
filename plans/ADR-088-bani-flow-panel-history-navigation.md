# ADR-088: Bani Flow Panel History Navigation

**Status**: Proposed
**Date**: 2026-04-23
**Agents**: graph-architect (proposes); carnatic-coder (implements)
**Depends on**: ADR-067 (Musician panel history navigation), ADR-002 (dual search boxes), ADR-061 (tree-structured Bani Flow trail), ADR-072 (search-subject prominence), ADR-025 (explicit panel state)
**Symmetric with**: ADR-067 — this ADR applies the same pattern to the Bani Flow panel that ADR-067 applied to the Musician panel.

---

## Context

### The problem

ADR-067 gave the **Musician panel** back/forward navigation: `← Musician ♪ →` arrows flanking the panel title, a 5-entry back stack, and the standard browser-history invariants (new selection clears forward, back/forward do not reset the graph viewport).

The **Bani Flow panel** (left sidebar) has no equivalent. A rasika exploring three ragas in sequence — Thodi, Bhairavi, Kambhoji — by tapping them on the wheel cannot navigate back to Thodi without tapping the wheel again. The exploration is strictly forward-only. Worse: a rasika who arrives at the BF panel via a composition chip in the Musician panel, explores upward to the raga, and then wants to return to the composition, has no path back. They must re-search the composition by name or scroll the Musician panel to find the chip again.

### Why the Bani Flow panel's history is different from the Musician panel's

The Musician panel's history unit is a **node ID** (a string like `ramnad_krishnan`). Reconstructing the panel from a node ID means calling `selectNode(cy.getElementById(id))` — a single operation.

The Bani Flow panel's history unit is a **search subject**: the pair `{type, id}` that `triggerBaniSearch(type, id)` received. `type` can be `'raga'`, `'comp'`, `'perf'`, or `'musician'` (the last opens the musician trail in the BF panel). Reconstructing the panel from a history entry means calling `triggerBaniSearch(entry.type, entry.id, { fromHistory: true })`.

This means the history stack stores `{type, id}` pairs, not raw node IDs. The invariants remain the standard browser-history model.

### Scope

This ADR scopes to the **Bani Flow panel** only. It does not change the Musician panel (ADR-067). Both panels will have parallel back/forward controls after this ADR and ADR-067 are both implemented.

---

## Forces

| Force | Direction |
|---|---|
| **Disorientation in raga exploration** | Tapping three ragas on the wheel replaces the panel three times with no way back. A 5-entry back stack resolves this without unbounded memory. |
| **Composition-raga traversal** | A rasika who taps a comp-chip in the Musician panel then taps the raga name to see the full raga trail has two steps to reverse; the back stack should cover both. |
| **Familiar affordance** | `← Bani Flow →` mirrors `← Musician ♪ →` from ADR-067 — one visual pattern for both panels, zero new learning. |
| **No viewport entanglement** | BF panel back/forward must NOT re-trigger the raga wheel's visual state. The history is a panel affordance; the wheel is a view affordance. The wheel can desync from the panel's history — this is acceptable. |
| **triggerBaniSearch is the single entry point** | All paths that populate the BF panel flow through `triggerBaniSearch`. This is where the history push must happen — not at call sites. One change, all paths covered. |
| **Disabled state legibility** | Back/forward buttons communicate "nothing here" at a glance via opacity dimming and pointer-events none. |
| **Tutorial ground state** | The tutorial null state (no subject) participates in the history as a sentinel entry — specified in ADR-089. This ADR provides the history data model that ADR-089 attaches the sentinel to. |

---

## Pattern

**Strong Centres + Levels of Scale.**

The BF panel title is a strong centre. Flanking it with navigation arrows preserves the title's prominence (it is still the centred label between two small affordances) while adding a new scale of interaction: the session-level exploration thread.

**Symmetric Boundaries.** ADR-067 (Musician panel) and ADR-088 (BF panel) are intentionally symmetric. The user learns one pattern for both panels. Asymmetry here — different button positions, different labels, different max-depth — would impose a two-pattern cognitive tax.

---

## Decision

### 1 — UI layout: buttons flank the Bani Flow panel title

```html
<!-- BEFORE -->
<h3>Bani Flow &#9835;</h3>

<!-- AFTER -->
<h3 id="bani-flow-panel-title">
  <button id="bani-back-btn"  class="panel-nav-btn" title="Back"    disabled>&#8592;</button>
  Bani Flow &#9835;
  <button id="bani-fwd-btn"   class="panel-nav-btn" title="Forward" disabled>&#8594;</button>
</h3>
```

Same CSS class (`panel-nav-btn`) and same disabled/enabled visual treatment as the Musician panel's nav buttons (ADR-067 §5). No new tokens or styles introduced.

### 2 — History data model

```javascript
// bani_flow.js — module-level, before triggerBaniSearch

const baniHistory = {
  back:    [],   // [{type, id}, …] oldest first, most-recent-prev last — max 5 entries
  forward: [],   // [{type, id}, …] next first, furthest last — max 5 entries
};
const BANI_HISTORY_MAX = 5;

// Current subject — null when panel is empty / tutorial is shown
let _currentBaniSubject = null;  // {type, id} | null
```

A history entry is the minimal pair `{type, id}` — enough to reconstruct the full panel via `triggerBaniSearch`.

### 3 — `triggerBaniSearch` receives an optional navigation flag

```javascript
// BEFORE
function triggerBaniSearch(type, id) { … }

// AFTER
function triggerBaniSearch(type, id, { fromHistory = false } = {}) {
  if (!fromHistory && _currentBaniSubject) {
    const prev = _currentBaniSubject;
    if (prev.type !== type || prev.id !== id) {
      baniHistory.back.push(prev);
      if (baniHistory.back.length > BANI_HISTORY_MAX)
        baniHistory.back.shift();          // drop oldest
      baniHistory.forward = [];            // new path clears forward
    }
  }
  _currentBaniSubject = { type, id };
  _updateBaniNavButtons();
  // … rest of triggerBaniSearch unchanged …
}
```

`_updateBaniNavButtons()` sets `disabled` and opacity on `#bani-back-btn` / `#bani-fwd-btn` symmetrically to `_updatePanelNavButtons()` in ADR-067.

### 4 — Back and Forward handlers

```javascript
// #bani-back-btn click
function baniBack() {
  if (!baniHistory.back.length) return;
  const target = baniHistory.back.pop();
  if (_currentBaniSubject) {
    baniHistory.forward.unshift(_currentBaniSubject);
    if (baniHistory.forward.length > BANI_HISTORY_MAX)
      baniHistory.forward.pop();
  }
  _currentBaniSubject = null;  // cleared before triggerBaniSearch sets it
  triggerBaniSearch(target.type, target.id, { fromHistory: true });
}

// #bani-fwd-btn click
function baniForward() {
  if (!baniHistory.forward.length) return;
  const target = baniHistory.forward.shift();
  if (_currentBaniSubject) {
    baniHistory.back.push(_currentBaniSubject);
    if (baniHistory.back.length > BANI_HISTORY_MAX)
      baniHistory.back.shift();
  }
  _currentBaniSubject = null;
  triggerBaniSearch(target.type, target.id, { fromHistory: true });
}
```

**No viewport side-effect**: `baniBack()` / `baniForward()` do NOT call any raga-wheel function. The wheel may be out of sync with the BF panel during back/forward navigation; this is acceptable. A wheel-sync would force a full-wheel redraw on every history step, which is visually disruptive. The rasika can tap the raga chip in the loaded trail to re-sync the wheel if they want.

### 5 — Panel clear / null-state handling

When `clearBaniFilter()` is called (the user clears the search box, or the tutorial is shown):

```javascript
function clearBaniFilter() {
  _currentBaniSubject = null;
  _updateBaniNavButtons();
  // … rest of clearBaniFilter unchanged …
}
```

Clearing the BF subject does NOT push to the history. The user is not navigating to a new subject; they are returning to the null state. The history stacks are left intact so the user can tap the forward button to return to the subject they just cleared (unless ADR-089 decision §4 governs — see that ADR).

### 6 — CSS additions (additions to `base.html`)

No new CSS rules beyond what ADR-067 already specified for `.panel-nav-btn`. The BF panel header uses the same class unchanged. The only visual change is that the `<h3>` containing `Bani Flow ♬` gains the same `display:flex; align-items:center; justify-content:space-between` as the Musician panel heading.

### 7 — Interaction with the raga-wheel sync guard

ADR-025 established `window._wheelSyncInProgress` to prevent `syncRagaWheelToFilter` from re-entering `triggerBaniSearch`. When `triggerBaniSearch` is called from `baniBack()` / `baniForward()` (i.e. `fromHistory: true`), the `_wheelSyncInProgress` guard must still be respected: if the wheel sync fires as a side-effect of the history navigation, the guard prevents a loop. No change to the guard logic is needed.

---

## Consequences

### Positive

- **Raga exploration becomes reversible.** Tapping three ragas on the wheel can be undone step by step. The BF panel now has the same exploration grammar as the Musician panel.
- **Composition-to-raga-and-back.** A rasika who drills down from composition to raga (composition chip → BF panel loads composition trail → raga chip → BF panel loads raga trail) can navigate back without re-searching.
- **One interaction pattern, two panels.** `← →` buttons on both panels mean the user only has to learn the affordance once. The symmetry noted in ADR-067's original context ("We essentially need navigation buttons for both panels") is now fulfilled.
- **Low implementation cost.** `triggerBaniSearch` is the single entry point for all BF panel population paths. One signature addition, one push-to-history block, two button handlers, one CSS tweak.

### Negative / cost

- **Wheel desync during history navigation.** Pressing `←` in the BF panel after tapping Thodi → Bhairavi → Kambhoji on the wheel will restore the Bhairavi trail, but the wheel will still show Kambhoji expanded. The desync is intentional and acceptable (re-syncing requires a full wheel redraw), but it may be surprising to some users. A future ADR may optionally re-sync the wheel on history navigation if user testing surfaces this as a confusion point.
- **One more `_currentBaniSubject` variable to maintain.** If any path populates the BF panel without going through `triggerBaniSearch`, that path bypasses the history system. The existing codebase already routes all BF panel population through `triggerBaniSearch`, making this a moot risk — but it becomes a "must not break" constraint for all future BF panel code.
