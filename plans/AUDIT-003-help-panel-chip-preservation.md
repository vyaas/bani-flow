# AUDIT-003: Help-panel chip preservation audit

## Scope
Scanned chip click and panel render pathways that affect the first-run tutorial decks in [carnatic/data/help/empty_panels.json](carnatic/data/help/empty_panels.json), focusing on:
- Help deck rendering and chip dispatch in [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js)
- Bani panel overwrite path in [carnatic/render/templates/bani_flow.js](carnatic/render/templates/bani_flow.js)
- Musician panel overwrite path in [carnatic/render/templates/graph_view.js](carnatic/render/templates/graph_view.js)
- Existing no-panel wheel preview pattern in [carnatic/render/templates/raga_wheel.js](carnatic/render/templates/raga_wheel.js)
- Shared chip constructors in [carnatic/render/templates/panel_components.js](carnatic/render/templates/panel_components.js)

## Findings

### F1 (High): Help-chip routes currently invoke full panel overwrite pathways
- Pattern name: Tutorial chips coupled to normal navigation handlers.
- Evidence:
  - [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js#L74) and [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js#L82) call `triggerBaniSearch(...)` from `_onComposition` / `_onRaga` unless `previewOnly`.
  - [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js#L88) to [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js#L121) `_orientToMusician` calls `orientToNode`/`selectNode` and then forces `setPanelState('MUSICIAN')`.
- Impact:
  - Clicking tutorial chips exits the tutorial-preserving state and replaces panel contents with normal subject views.

### F2 (High): Bani subject load always dismisses help overlay before rendering trail
- Pattern name: Unconditional help-dismiss in panel build path.
- Evidence:
  - [carnatic/render/templates/bani_flow.js](carnatic/render/templates/bani_flow.js#L228) `applyBaniFilter(...)` always calls `buildListeningTrail(...)`.
  - [carnatic/render/templates/bani_flow.js](carnatic/render/templates/bani_flow.js#L235) `buildListeningTrail(...)` begins with:
    - `window.dismissPanelHelp('bani')`
    - `window.hidePanelTutorial('bani')`
- Impact:
  - Any help-panel chip path that reaches `applyBaniFilter` or `triggerBaniSearch` destroys the tutorial deck in the left panel.

### F3 (High): Musician selection always dismisses help overlay, even when panel reveal is suppressed
- Pattern name: Selection side effects not separable from rendering side effects.
- Evidence:
  - [carnatic/render/templates/graph_view.js](carnatic/render/templates/graph_view.js#L1128) `selectNode(node, { revealPanel = true })`.
  - [carnatic/render/templates/graph_view.js](carnatic/render/templates/graph_view.js#L1178) to [carnatic/render/templates/graph_view.js](carnatic/render/templates/graph_view.js#L1179) unconditionally dismisses/hides musician tutorial.
  - [carnatic/render/templates/graph_view.js](carnatic/render/templates/graph_view.js#L1201) `revealPanel` only controls drawer open, not help dismissal.
- Impact:
  - Even a "silent"/background musician selection path still overwrites tutorial state.

### F4 (Medium): Existing no-panel pattern already exists for wheel interactions and can be generalized
- Pattern name: Global preview guard (`_wheelPreviewNoPanel`) with synchronized highlight-only behavior.
- Evidence:
  - [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js#L53) to [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js#L68) `_previewWheel(...)` sets `window._wheelPreviewNoPanel` and drives `syncRagaWheelToFilter(...)`.
  - [carnatic/render/templates/raga_wheel.js](carnatic/render/templates/raga_wheel.js#L1920), [carnatic/render/templates/raga_wheel.js](carnatic/render/templates/raga_wheel.js#L2139), [carnatic/render/templates/raga_wheel.js](carnatic/render/templates/raga_wheel.js#L2358) gate `applyBaniFilter(...)` behind `!window._wheelPreviewNoPanel`.
- Impact:
  - The codebase already has a proven pattern for "visual sync without panel rebuild".

### F5 (Medium): No exported "help mode active" query exists; help state is private closure state
- Pattern name: Hidden mode state prevents cross-module guarding.
- Evidence:
  - [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js#L1387) `_helpState` is closure-private.
  - Public API includes `togglePanelHelp`, `dismissPanelHelp`, `showPanelTutorial`, `hidePanelTutorial`, but no `isPanelHelpActive(slot)`.
- Impact:
  - Other modules cannot reliably branch into "preserve tutorial" behavior when clicks originate during help mode.

## Recommendations

### R1: Add a shared help-lock query and use it as a guard in overwrite points
- Add exported helper in [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js):
  - `window.isPanelHelpActive = (slot) => !!_helpState[slot];`
- Consume this in:
  - [carnatic/render/templates/bani_flow.js](carnatic/render/templates/bani_flow.js): guard the top of `buildListeningTrail(...)` so help dismissal is skipped when lock active.
  - [carnatic/render/templates/graph_view.js](carnatic/render/templates/graph_view.js): guard `dismissPanelHelp/hidePanelTutorial` in `selectNode(...)` and `_openMusicianPanelForTransit(...)`.
- Expected behavior:
  - During help mode, chip clicks can still update graph/wheel state while tutorial deck remains visible.

### R2: Split "visual focus" from "panel populate" for help-chip musician clicks
- In [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js), route help-chip musician actions to a focus-only path:
  - `switchView('graph')`
  - `focusNode(...)` (or equivalent highlight function)
  - `orientToNode(...)` only if it can be made no-overwrite in help mode
- Avoid direct `selectNode(...)` in help mode unless `selectNode` gains a `preserveHelp` / `skipPanelPopulate` option.

### R3: Reuse existing preview pattern for raga/composition help chips
- Standardize help-chip raga/comp click behavior around the already-working preview mechanism:
  - Keep `window._wheelPreviewNoPanel` + `syncRagaWheelToFilter(...)` in help mode.
  - Avoid calling `triggerBaniSearch(...)` while help mode is active.
- This preserves wheel detail behavior without replacing Bani panel contents.

### R4: Keep default behavior unchanged outside help mode
- Ensure guards are conditional on active help lock only.
- Once help is dismissed (`togglePanelHelp` off / normal usage), all existing chip behavior (including panel overwrite) remains untouched.

## Routing
- Carnatic Coder:
  - F1, F2, F3, F4, F5 (implementation-level event routing and state guard work).
- Graph Architect:
  - None required. This is behavioral routing, not schema change.

## Coder handoff checklist
1. Introduce `isPanelHelpActive(slot)` API in [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js).
2. Guard help dismissal calls in [carnatic/render/templates/bani_flow.js](carnatic/render/templates/bani_flow.js) and [carnatic/render/templates/graph_view.js](carnatic/render/templates/graph_view.js).
3. Update help-chip dispatch in [carnatic/render/templates/empty_tutorials.js](carnatic/render/templates/empty_tutorials.js) to use no-overwrite pathways for:
   - musician chips -> graph focus/highlight only
   - raga/composition chips -> wheel sync/detail only
4. Validate manually:
   - Help on: chip clicks update graph/wheel but tutorial deck remains intact.
   - Help off: legacy overwrite behavior remains exactly the same.
