# AUDIT-009 — ADR-151 Permalink: `_bootHelloWorld` Async Race Clobbers Restored State

**Date**: 2026-05-23  
**Scope**: `carnatic/render/templates/empty_tutorials.js` — the `_bootHelloWorld` boot
sequence and its `DOMContentLoaded` + Cytoscape-ready poll trigger.  
**Reported symptom**: Navigating to a permalink (`#s=…`) opens the correct video but both
panels display the *help-deck demo content* (reetigowla bani trail, ramnad_krishnan
musician panel) from `data/help/empty_panels.json` instead of the state encoded in
the URL fragment.

---

## Findings

### Finding 1 — Async boot overwrites synchronous permalink restore

**File**: `carnatic/render/templates/empty_tutorials.js`  
**Lines**: ~1558–1609 (`_bootHelloWorld` function + `DOMContentLoaded` trigger)  
**Pattern name**: *Async-after-sync state clobber*

**Evidence**:

```js
// empty_tutorials.js ~L1557
function _bootHelloWorld() {
  if (!helpEmptyPanels) return;
  // Loads reetigowla into the bani panel...
  if (baniSubject && baniSubject.id && typeof triggerBaniSearch === 'function') {
    try { triggerBaniSearch(baniSubject.kind || 'raga', baniSubject.id); } catch (_) {}
  }
  // Loads ramnad_krishnan into the musician panel...
  if (muSubject && muSubject.id && typeof cy !== 'undefined' && ...) {
    const n = cy.getElementById(muSubject.id);
    if (n && n.length) {
      try { selectNode(n); } catch (_) {}
    }
  }
  // Then overlays both help decks via _enterHelp
  if (!_helpState.bani)     _enterHelp('bani');
  if (!_helpState.musician) _enterHelp('musician');
}

document.addEventListener('DOMContentLoaded', () => {
  // ...pre-renders...
  var attempts = 0;
  (function tick() {
    const cyReady = (typeof cy !== 'undefined') && cy.nodes && cy.nodes().length > 0;
    if (cyReady || attempts >= 100) {
      _bootHelloWorld();    // ← fires AFTER restoreStateFromHash()
      return;
    }
    attempts += 1;
    setTimeout(tick, 50);
  })();
});
```

And in `permalink.js`:

```js
// permalink.js — last script in the block, runs synchronously
restoreStateFromHash();  // ← runs synchronously before DOMContentLoaded
```

**Why this is a bug**:

The execution order is:

1. The entire `<script>` block executes synchronously, including `restoreStateFromHash()` at the very end.  `restoreStateFromHash()` calls `triggerBaniSearch()`, `selectNode()`, and `openOrFocusPlayer()` — correctly restoring the bani trail, musician panel, and video player from the `#s=…` hash.

2. *After* the script block, `DOMContentLoaded` fires (async).

3. `DOMContentLoaded` starts the Cytoscape-ready poll (`tick()`).

4. Once cy is ready (~50–500 ms after step 1), `_bootHelloWorld()` runs — unconditionally — and:
   - overwrites the bani panel with the `reetigowla` demo subject,
   - overwrites the musician panel with the `ramnad_krishnan` demo subject,
   - wraps both in `_enterHelp()` help-deck overlays.

The permalink-restored state is visually correct for a brief moment (the video plays),
then the hello-world boot fires and covers it with the help-deck demo content.
`restoreStateFromHash()` has no knowledge of this deferred boot — it runs, finishes,
and considers its work done. The race is inherent in the current architecture.

---

## Recommendations

### Recommendation 1 — Guard `_bootHelloWorld` against permalink presence

**Target**: `carnatic/render/templates/empty_tutorials.js`, inside `_bootHelloWorld`  
**Type**: One-line guard at the top of the function.

```js
function _bootHelloWorld() {
  if (!helpEmptyPanels) return;
  // ADR-151: if a permalink is being restored, the synchronous
  // restoreStateFromHash() has already populated both panels.
  // Proceeding would clobber the restored state with the demo subjects.
  if (window.location.hash && window.location.hash.startsWith('#s=')) return;
  // … rest of function unchanged …
}
```

This is the minimal, correct fix. `restoreStateFromHash()` always runs before
`DOMContentLoaded`, so by the time `_bootHelloWorld` fires the check is stable.
The guard does not affect any non-permalink page load.

**Risk**: None. The guard is a pure early-exit that only fires when `#s=` is in
the URL. Normal (non-permalink) page loads are unaffected.

### Recommendation 2 (optional hardening) — Move the guard into the tick condition

As a belt-and-suspenders addition, the tick caller could also skip booting:

```js
(function tick() {
  const cyReady = (typeof cy !== 'undefined') && cy.nodes && cy.nodes().length > 0;
  // ADR-151: never boot hello-world when a permalink is active.
  if (window.location.hash && window.location.hash.startsWith('#s=')) return;
  if (cyReady || attempts >= 100) {
    _bootHelloWorld();
    return;
  }
  attempts += 1;
  setTimeout(tick, 50);
})();
```

Putting the guard in both places (inside `_bootHelloWorld` and in the tick loop)
stops the polling loop immediately instead of polling 100× before doing nothing.
Both together are more efficient; Recommendation 1 alone is sufficient for
correctness.

---

## Routing

| Finding | Route to | Action |
|---|---|---|
| Finding 1 — `_bootHelloWorld` async clobber | **Carnatic Coder** | Add the `#s=` early-exit guard to `_bootHelloWorld` (Recommendation 1); optionally also to the tick loop (Recommendation 2). No schema change, no ADR required. |

---

## Test coverage gap

The existing `carnatic/tests/test_permalink.py` tests verify round-trip encoding and
that `restoreStateFromHash` is present in `graph.html`, but there is no test that
verifies `_bootHelloWorld` is suppressed when a permalink hash is active. After the
Coder applies the fix, the **Test Engineer** should add a unit test that:

1. Mocks `window.location.hash = '#s=<valid-encoded-state>'`  
2. Calls `_bootHelloWorld()` (via `window._bootHelloWorld` if exposed, or via
   integration)  
3. Asserts that `triggerBaniSearch` and `selectNode` were **not** called with the
   demo-subject IDs (`reetigowla`, `ramnad_krishnan`).

[ADR: ADR-151, ADR-086]  
[AGENTS: code-auditor]
