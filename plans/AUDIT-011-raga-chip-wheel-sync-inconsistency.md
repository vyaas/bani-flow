# AUDIT-011 — Raga/Composition Chip -> Wheel Sync Inconsistency

## Scope

Scanned the navigation and wheel-sync flow for raga/composition interactions across:

- `carnatic/render/templates/bani_flow.js`
- `carnatic/render/templates/raga_wheel.js`
- `carnatic/render/templates/media_player.js`
- `carnatic/render/templates/panel_components.js`
- `carnatic/render/templates/search.js`
- `carnatic/render/templates/empty_tutorials.js`

Goal: identify why wheel light-up + WDP open are reliable when interacting inside the wheel, but inconsistent when raga/composition chips are clicked elsewhere.

## Findings

### F1 (High) — Wheel sync/open path is hard-gated by active view

- **Pattern**: view-gated side effects
- **Evidence**:
  - `applyBaniFilter(...)` calls `syncRagaWheelToFilter(type, id)` only as a downstream sync step (`bani_flow.js` around lines 233-234).
  - `syncRagaWheelToFilter(...)` returns immediately when `currentView !== 'raga'` (`raga_wheel.js` around line 2597).
  - `triggerBaniSearch(...)` attempts orientation via `orientRagaWheel(...)`, but `orientRagaWheel(...)` also returns immediately when `currentView !== 'raga'` (`bani_flow.js` around lines 1747-1749; `raga_wheel.js` around line 2627).
- **Why this causes inconsistency**:
  - Chip clicks outside the wheel can fully populate Bani Flow while doing no wheel light-up/WDP open if the user is not already in raga view.
  - Wheel interactions do not have this issue because they run wheel-local effects directly.

### F2 (High) — Two competing navigation pipelines exist (wheel-local vs global trigger)

- **Pattern**: duplicated orchestration / split-brain flow
- **Evidence**:
  - Wheel mela click path directly executes: `_openWheelDetailPanel(raga)` + `lightUpSpine(raga.id)` + guarded `applyBaniFilter('raga', raga.id)` (`raga_wheel.js` around lines 1891-1926).
  - Global chip/search path executes: `triggerBaniSearch(...) -> applyBaniFilter(...) -> syncRagaWheelToFilter(...)` and depends on view guards (`bani_flow.js` around lines 1704-1750, 112-234).
- **Why this causes inconsistency**:
  - One path is immediate and wheel-owned; the other is indirect and conditionally no-op.
  - Behavior depends on origin of interaction, not just subject (`raga`/`comp`).

### F3 (Medium) — Some raga/composition chips bypass the canonical trigger function

- **Pattern**: bypass of central dispatcher
- **Evidence**:
  - Tutorial chips call `applyBaniFilter('raga'|'comp', ...)` directly rather than `triggerBaniSearch(...)` (`empty_tutorials.js` around lines 1512, 1528).
- **Why this matters**:
  - Any future fix placed only in `triggerBaniSearch(...)` will miss these chips.
  - It also bypasses shared navigation/history semantics already centralized in `triggerBaniSearch`.

## Recommendations

1. Introduce a single wheel-sync contract for all raga/comp subject loads.
   - Example target API: `syncWheelFromBaniSubject(type, id, { ensureView: false, openWdp: true, lightOnlyWhenHidden: true })`.
   - Called from `triggerBaniSearch(...)` after `applyBaniFilter(...)`.
   - `applyBaniFilter(...)` should not directly decide wheel orchestration beyond pure filter state.

2. Unify wheel-local and global paths around the same contract.
   - Wheel click handlers should call the same subject-sync function (or delegate into it), rather than inlining a separate sequence.
   - Prevent recursion with existing `_wheelSyncInProgress` / `_wheelOriginatedTrigger` guards.

3. Normalize chip call sites to `triggerBaniSearch(...)` for raga/comp.
   - Replace direct tutorial calls to `applyBaniFilter(...)` with `triggerBaniSearch(...)`.
   - This ensures history, drawer behavior, and wheel behavior remain consistent.

4. Add regression tests for navigation parity.
   - Cases: media player chip, bani panel chip, search dropdown item, tutorial chip, wheel click.
   - Assertions: same subject -> same wheel lit mela + WDP state (when wheel view visible) and same pending-state behavior (when wheel view hidden).

## Routing

- **To Carnatic Coder**:
  - F1, F2, F3 (all implementation-level orchestration issues in JS render templates).
  - Implement unified subject->wheel sync contract and refactor call sites.

- **To Graph Architect**:
  - No schema-level issue discovered in this audit. No ADR required unless the team wants to formally specify cross-view navigation invariants.
