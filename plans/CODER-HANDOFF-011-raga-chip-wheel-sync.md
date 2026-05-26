# Coder Handoff — AUDIT-011

## Objective

Make raga/composition chip behavior consistent across the app:

- Any raga/composition subject load must drive the raga wheel to the same state semantics.
- When the wheel is shown, it must light up the relevant section and open the corresponding WDP context.
- Interaction origin must not matter (wheel click, panel chip, media player chip, search result, tutorial chip).

## Inputs

- Audit report: `plans/AUDIT-011-raga-chip-wheel-sync-inconsistency.md`

## Code Evidence (entry points)

- Global navigation dispatcher:
  - `carnatic/render/templates/bani_flow.js:1704` (`triggerBaniSearch`)
- Filter application and downstream wheel sync:
  - `carnatic/render/templates/bani_flow.js:112` (`applyBaniFilter`)
  - `carnatic/render/templates/bani_flow.js:233` (`syncRagaWheelToFilter` invocation)
- Wheel sync/orientation guards:
  - `carnatic/render/templates/raga_wheel.js:2596` (`syncRagaWheelToFilter`, early return when `currentView !== 'raga'`)
  - `carnatic/render/templates/raga_wheel.js:2626` (`orientRagaWheel`, same guard)
- Wheel-local immediate path (currently more complete):
  - `carnatic/render/templates/raga_wheel.js:1891` (mela click -> `_openWheelDetailPanel` + `lightUpSpine` + guarded `applyBaniFilter`)
- Bypass call sites (not using canonical trigger):
  - `carnatic/render/templates/empty_tutorials.js:1512` (`applyBaniFilter('raga', ...)`)
  - `carnatic/render/templates/empty_tutorials.js:1528` (`applyBaniFilter('comp', ...)`)

## Required Refactor

1. Create a single subject->wheel sync contract in `raga_wheel.js`.
   - One function should own resolution of `type,id -> raga/mela/janya/comp target` and wheel-side actions.
   - It must be safe under existing recursion guards (`_wheelSyncInProgress`, `_wheelOriginatedTrigger`, `_wheelPreviewNoPanel`).

2. Use that contract from the global dispatcher path.
   - Integrate at/after `triggerBaniSearch(...)` in `bani_flow.js`.
   - Keep `applyBaniFilter(...)` focused on filter + trail state; avoid split orchestration logic.

3. Make wheel-local path delegate to the same contract where feasible.
   - Prevent origin-specific behavior drift.

4. Normalize bypass sites.
   - Replace tutorial direct `applyBaniFilter('raga'|'comp', ...)` usage with `triggerBaniSearch(...)`.

## Behavioral Contract (target)

- For any `triggerBaniSearch('raga', id)` or `triggerBaniSearch('comp', id)`:
  - Bani Flow panel updates as now.
  - If raga view is visible, wheel highlights relevant spine/segment and opens WDP anchored to resolved mela context.
  - If raga view is hidden, behavior is deterministic and ready to apply when switching into raga view (no stale or origin-dependent divergence).

## Regression Matrix

Validate parity for these origins:

1. Bani Flow subject chip click
2. Media player footer chip click
3. Search dropdown selection
4. Tutorial chip click
5. Wheel internal click

For each origin, verify:

- Same subject in Bani Flow
- Same wheel highlighted mela/raga context when in raga view
- Same WDP open/selection behavior
- No flicker/toggle-off regressions from duplicate light-up calls

## Definition of Done

- No remaining direct tutorial calls to `applyBaniFilter('raga'|'comp', ...)`.
- Single orchestration path for wheel light-up/WDP behavior is observable in code.
- Manual regression matrix above passes.
- Render gate passes: `source .venv/bin/activate && bani-render`.
