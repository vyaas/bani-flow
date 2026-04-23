# ADR-089: Tutorial Null State as Navigable History Landmark

**Status**: Proposed
**Date**: 2026-04-23
**Agents**: graph-architect (proposes); carnatic-coder (implements)
**Depends on**: ADR-086 (tutorial rendering, `showPanelTutorial` / `hidePanelTutorial` API), ADR-087 (chip catalogue tutorial content), ADR-067 (Musician panel history), ADR-088 (Bani Flow panel history)
**Extends**: ADR-067 and ADR-088 — adds a "ground state" sentinel to both history stacks.

---

## Context

### The gap

ADR-067 and ADR-088 give each panel a back/forward history stack with a max depth of five. When the user first opens the application, both stacks are empty. The back button is disabled. There is nowhere to go back to.

ADR-086 specifies that the tutorial (the chip catalogue + cross-panel seeds from ADR-087) is the **null state** of each panel: it appears when no subject is loaded, disappears when one is. This is correct. But the null state is not part of the navigation history — it does not appear in the stack and cannot be reached by pressing `←`. Pressing `←` from the first loaded subject reaches the earliest subject in the history (or disables itself when the stack is empty), never the tutorial.

This creates a gap that grows as the user's session deepens:

1. User lands on the site. Sees the tutorial. Reads the chip catalogue.
2. Taps a cross-panel seed chip. Tutorial disappears. BF panel loads Thodi.
3. Explores five more ragas. History is now full.
4. User wants to recall the chip legend mid-session. No path exists. Must reload the page or manually clear the panel.

### The tutorial as a reference document

The chip catalogue introduced by ADR-087 is not a one-time orientation; it is a **reference** — worth consulting after a session deepens and unfamiliar chip types turn up (a lecdem chip appearing for the first time, an `↗` link appearing next to a new external source). The tutorial should be retraceable, not discardable.

The analogy: a book's index is not discarded after the first use. A browser's home page is reachable by pressing Home, not by backtracking through every visited page. The tutorial is the panel's home page.

### The sentinel pattern

Rather than adding a "go to tutorial" button (which would add surface to an already-dense header), this ADR embeds the tutorial into the history as a **sentinel entry** — a named position that is always the earliest possible back-stack entry. Pressing `←` from the first real subject in either panel navigates to the sentinel, which shows the tutorial. Pressing `←` again from the tutorial is a no-op (back button disabled). Pressing `→` from the tutorial returns to the first real subject.

The sentinel is invisible as a stack item; it behaves like any other history entry from the user's point of view. The navigation affordance is unchanged — the same `←` arrow the user already knows.

---

## Forces

| Force | Direction |
|---|---|
| **Tutorial is a reference, not a door** | Users consult the chip catalogue mid-session, not only on first visit. Navigation must reach it at any depth. |
| **No new controls** | Adding a "Help" button or "Home" button to an already-dense header adds cognitive load. The `←` arrow already says "go back"; the sentinel makes the tutorial the thing you go back to. |
| **Single sentinel per session** | The sentinel must appear exactly once in each stack. Multiple clears and re-loads in a session must not produce multiple tutorial entries — that would artificially deepen the stack. |
| **Symmetric for both panels** | Both panels register their sentinel on first load. The user learns one model for both. |
| **Back-button disabled state** | When the tutorial is shown, `←` must be disabled. The tutorial is the earliest position; there is nothing behind it. |
| **Forward button re-entry** | When navigated to the sentinel (tutorial shown), pressing `→` must return to the most recent real subject, not the tutorial. The forward stack is preserved through the sentinel visit. |
| **Non-blocking for empty sessions** | If the user never loads any subject (only reads the tutorial and closes the tab), the sentinel is never pushed — there is nothing meaningful to navigate to. The sentinel is registered on the **first load**, not on page open. |

---

## Pattern

**Levels of Scale + Strong Centres.**

The history stack has a new explicit lowest level: the tutorial ground state. The existing levels are:

```
Level 0: tutorial (sentinel — always earliest)
Level 1: first loaded subject (e.g. Thodi)
Level 2: second loaded subject (e.g. Bhairavi)
…
Level N: current subject (most recent)
```

The sentinel is the **strong centre at level 0** — the anchor around which the rest of the exploration is organised. It is always reachable from any depth (via repeated `←` presses) and always launches forward correctly (via `→`).

**Connection to Things (Pattern 136, Alexander)**: The tutorial ground state is the application's connection to things: "This is what this system is." Keeping it navigable ensures the user can return to their grounding whenever the exploration becomes disorientating.

---

## Decision

### 1 — Sentinel definition

A sentinel is a history entry with a reserved type:

```javascript
const TUTORIAL_SENTINEL = { type: '__tutorial__', id: null };
```

`__tutorial__` is not a valid `triggerBaniSearch` type and not a valid node ID. The `__` prefix is a naming convention that signals "reserved, not a user query".

### 2 — Sentinel registration: first real load, once per session

```javascript
// In triggerBaniSearch (bani_flow.js):
let _baniSentinelRegistered = false;

function triggerBaniSearch(type, id, { fromHistory = false } = {}) {
  if (!fromHistory && !_baniSentinelRegistered && _currentBaniSubject === null) {
    // First real load of the session — register the sentinel as the ground state
    baniHistory.back.push(TUTORIAL_SENTINEL);
    _baniSentinelRegistered = true;
    // (No trim — the sentinel takes one of the 5 slots)
  }
  // … existing push-to-history and navigation logic (ADR-088) …
}
```

```javascript
// In selectNode (graph_view.js):
let _musicianSentinelRegistered = false;

function selectNode(node, { fromHistory = false } = {}) {
  if (!fromHistory && !_musicianSentinelRegistered && _currentPanelNodeId === null) {
    panelHistory.back.push(TUTORIAL_SENTINEL);
    _musicianSentinelRegistered = true;
  }
  // … existing push-to-history and navigation logic (ADR-067) …
}
```

**Invariants**:
- `_baniSentinelRegistered` and `_musicianSentinelRegistered` are module-level flags that flip `true` on the first real load and never flip back during the session. The sentinel is pushed exactly once.
- The sentinel occupies one slot in the 5-entry stack. An exploration of five real subjects after the sentinel means the sentinel is ejected (the oldest entry is evicted when the stack exceeds `PANEL_HISTORY_MAX`). This is correct — after five subjects, the session is deep enough that the user can reload the page if they need the tutorial again; the sentinel's value is highest in the first few navigations.

### 3 — Navigating to the sentinel: showing the tutorial

When either back handler encounters the sentinel at the top of the back stack:

```javascript
// In baniBack() (bani_flow.js):
function baniBack() {
  if (!baniHistory.back.length) return;
  const target = baniHistory.back.pop();

  if (_currentBaniSubject) {
    baniHistory.forward.unshift(_currentBaniSubject);
    if (baniHistory.forward.length > BANI_HISTORY_MAX)
      baniHistory.forward.pop();
  }

  if (target.type === '__tutorial__') {
    _currentBaniSubject = null;
    clearBaniFilter({ fromHistory: true });   // shows tutorial, does NOT push to history
    _updateBaniNavButtons();
    return;
  }

  _currentBaniSubject = null;
  triggerBaniSearch(target.type, target.id, { fromHistory: true });
}
```

```javascript
// In panelBack() (graph_view.js) — same pattern:
function panelBack() {
  if (!panelHistory.back.length) return;
  const targetId = panelHistory.back.pop();
  panelHistory.forward.unshift(_currentPanelNodeId);
  // …trim forward…

  if (targetId === '__tutorial__') {
    _currentPanelNodeId = null;
    _showMusicianTutorial();        // clears node, shows tutorial
    _updatePanelNavButtons();
    return;
  }

  const n = cy.getElementById(targetId);
  if (n && n.length) selectNode(n, { fromHistory: true });
}
```

`_showMusicianTutorial()` is a thin helper:
```javascript
function _showMusicianTutorial() {
  document.getElementById('musician-tutorial').style.display = 'block';
  // Clear node-specific content (existing clearMusicianPanel logic, if any)
}
```

`clearBaniFilter({ fromHistory: true })` is the existing `clearBaniFilter` function extended with an optional flag that suppresses the history push (clearing navigated-from-history should not itself be a history event).

### 4 — Back button state when the sentinel is last

After navigating to the sentinel, the back stack is empty (the sentinel was popped). `_updateBaniNavButtons()` / `_updatePanelNavButtons()` must disable the `←` button when the sentinel has been consumed AND `_currentBaniSubject === null` (or `_currentPanelNodeId === null`). Specifically:

```javascript
function _updateBaniNavButtons() {
  const backBtn = document.getElementById('bani-back-btn');
  const fwdBtn  = document.getElementById('bani-fwd-btn');
  const canBack = baniHistory.back.length > 0;
  const canFwd  = baniHistory.forward.length > 0;
  backBtn.disabled = !canBack;
  fwdBtn.disabled  = !canFwd;
  backBtn.style.opacity = canBack ? '1' : '0.3';
  fwdBtn.style.opacity  = canFwd  ? '1' : '0.3';
}
```

When the sentinel is consumed, `baniHistory.back.length === 0` → back button disabled. When the user then presses `→`, `baniHistory.forward.length > 0` → forward button enabled. The state machine is consistent.

### 5 — `clearBaniFilter` must NOT register a new sentinel

When the user manually clears the search box (or the panel is cleared programmatically for any reason other than back-navigation), the existing sentinel registration logic must not fire again. The `_baniSentinelRegistered` flag prevents this: it is `true` from the first real load onward. A manual clear does NOT set it back to `false`.

If the user then searches again after a manual clear, `!_baniSentinelRegistered` is `false`, so no new sentinel is pushed. The only sentinel in the session is the one from the first load.

### 6 — Tutorial re-entry is idempotent

At the moment the sentinel is navigated to (`target.type === '__tutorial__'`), `showPanelTutorial(slot)` is called. ADR-086 specified that the tutorial renders once and is cached (`data-rendered="1"`). Re-entry via the sentinel simply sets `style.display = 'block'` — no re-render, no flicker.

---

## Consequences

### Positive

- **The tutorial becomes a navigable landmark.** A rasika who saw the chip catalogue on first load and wants to recall it mid-session presses `←` repeatedly until the tutorial appears. No reload required.
- **The `←` button now has a natural floor.** Previously, pressing `←` at the bottom of the stack was a no-op (disabled button). Now it navigates to a meaningful state — the tutorial — before disabling. The affordance is used to its full extent.
- **Both panels are symmetric.** The sentinel pattern applies identically to Musician and BF panels. One model, two panels.
- **No new UI elements.** The sentinel is invisible infrastructure inside the history stacks. The only visible change is that pressing `←` one extra time shows the tutorial rather than doing nothing.
- **Re-entry is free.** `showPanelTutorial` is cached (ADR-086 §3). Navigating to the sentinel is a DOM `display: block` operation, not a re-render.

### Negative / cost

- **Sentinel occupies one history slot.** A session limited to five subjects loses the sentinel after the fifth subject is loaded (it is evicted as the oldest entry). This is the correct trade-off: five subjects deep into a session, the user is oriented and the tutorial is less valuable than the actual exploration history.
- **`clearBaniFilter` gains an optional flag.** A small signature change to avoid double sentinel registration. The existing callers omit the flag (behaviour unchanged); only the new back-navigation path passes `{ fromHistory: true }`.
- **Two new module-level booleans** (`_baniSentinelRegistered`, `_musicianSentinelRegistered`). These are the minimum state needed to guarantee single-push.
- **`__tutorial__` is a reserved type string.** Any future `triggerBaniSearch` type that starts with `__` would collide with the sentinel check. This is a naming convention, not a schema contract, but it must be documented in the module header comment.
