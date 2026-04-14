# ADR-030: View Selector Restructure — Guru-Shishya / Mela-Janya, Timeline as Toggle, Viewport Controls Relocation

**Status:** Proposed  
**Date:** 2026-04-14

---

## Context

The current header (visible in the attached screenshot) exposes four controls in the top-right corner of the application:

```
[Fit] [Reset] [Relayout] [Labels]   [Graph] [Timeline] [Ragas]
```

Three problems are in tension:

### Problem 1 — Conceptual asymmetry between views

**Graph** and **Timeline** are two *renderings of the same data*: the guru-shishya parampara. One is a force-directed topology; the other is a chronological axis. They share the same Cytoscape node/edge dataset, the same filter chips, and the same Bani Flow trail. They are not peers of the Raga Wheel — they are two lenses on the same subject.

**Ragas** (the Mela-Janya wheel) is fundamentally different: it renders `compositions.json` and the melakarta system, not the musician graph. It has its own SVG canvas, its own interaction model, and its own data domain. Placing it as a third peer of Graph and Timeline misrepresents the ontology.

The correct two-level structure is:

```
Primary views:   [Guru-Shishya]   [Mela-Janya]
Sub-option:      Timeline toggle (within Guru-Shishya only)
```

### Problem 2 — Viewport controls are oversized and mislocated

`[Fit]`, `[Reset]`, `[Relayout]`, and `[Labels]` are rendered as full-height header buttons — the same visual weight as the view selector. This makes them read as *conceptual categories* rather than *rendering utilities*. A rasika scanning the header sees six equally-weighted buttons and must parse them all before understanding the structure.

These are viewport manipulation tools. They belong in the corner of the *canvas pane*, not in the application header. Their visual weight should be demoted to small icon-buttons or a compact toolbar overlay positioned at the top-right of the centre pane (`#canvas-wrap`), so they are spatially associated with the surface they control.

### Problem 3 — "Labels" serves no purpose at this scale

The `toggleLabels()` function overrides the zoom-tiered label system, forcing all labels visible regardless of zoom level. In practice:

- At low zoom, forcing all labels produces an illegible word-cloud.
- At high zoom, labels are already visible via the tier system.
- No user scenario has been identified where overriding the tier system improves comprehension.
- The button adds cognitive load without adding navigational value.

The zoom-tiered label system (ADR-008 / `applyZoomLabels()`) is the correct behaviour. The override should be removed.

---

## Forces in tension

| Force | Direction |
|---|---|
| **Immersion** | The rasika should immediately understand: "I am looking at lineages" or "I am looking at ragas." Two primary views, clearly named, serve this better than three ambiguous peers. |
| **Fidelity to the oral tradition** | Timeline is a scholarly tool for situating musicians in history — a sub-mode of the lineage view, not a separate tradition. |
| **Scalability without fragmentation** | Future views (e.g. a Tala wheel, a Composer graph) must fit cleanly into the two-primary-view structure without proliferating the header. |
| **Queryability** | Viewport controls (Fit/Reset/Relayout) must remain accessible in both Guru-Shishya sub-modes (graph and timeline). The Mela-Janya view needs its own Fit/Reset/Relayout equivalents for the SVG wheel. |
| **Visual hierarchy** | Rendering utilities must not compete visually with navigation. |

---

## Pattern

**Levels of Scale** (Alexander, *A Pattern Language*, Pattern 26): a living structure has distinguishable levels — the tradition, the view, the sub-mode, the control. Collapsing these levels (treating Timeline as a peer of Ragas) destroys the hierarchy that makes the interface readable.

**Strong Centres** (Alexander, *The Nature of Order*, Book 1): each primary view is a strong centre — a coherent domain of musical knowledge. The Guru-Shishya parampara is one centre; the Mela-Janya system is another. Timeline is not a centre — it is a *perspective* on the Guru-Shishya centre.

**Boundaries** (Alexander, *A Pattern Language*, Pattern 13): the viewport controls belong *inside* the boundary of the canvas pane, not in the application header. Moving them into the canvas corner makes the boundary explicit: "these controls act on this surface."

---

## Decision

### 1. Rename and restructure the primary view selector

**Before** (in [`base.html`](../carnatic/render/templates/base.html:1044)):

```html
<div class="view-selector" id="view-selector">
  <button class="view-btn active" id="view-btn-graph"
          onclick="switchView('graph')" title="Guru-shishya lineage graph">Graph</button>
  <button class="view-btn" id="view-btn-timeline"
          onclick="switchView('timeline')" title="Chronological timeline">Timeline</button>
  <button class="view-btn" id="view-btn-raga"
          onclick="switchView('raga')" title="Melakarta raga wheel">Ragas</button>
</div>
```

**After:**

```html
<div class="view-selector" id="view-selector">
  <button class="view-btn active" id="view-btn-graph"
          onclick="switchView('graph')" title="Guru-shishya parampara">Guru-Shishya</button>
  <button class="view-btn" id="view-btn-raga"
          onclick="switchView('raga')" title="Melakarta–janya raga system">Mela-Janya</button>
</div>
```

The `Timeline` button is removed from the primary selector. It becomes a toggle *within* the Guru-Shishya view (see §3 below).

---

### 2. Remove `[Fit]`, `[Reset]`, `[Relayout]`, `[Labels]` from the header; replace with a compact viewport toolbar overlaid on the canvas pane

**Before** (in [`base.html`](../carnatic/render/templates/base.html:1039)):

```html
<div class="controls">
  <button id="btn-fit"      onclick="cy.fit()">Fit</button>
  <button id="btn-reset"    onclick="cy.reset()">Reset</button>
  <button id="btn-relayout" onclick="relayout()">Relayout</button>
  <button id="btn-labels"   onclick="toggleLabels()">Labels</button>
  <div class="view-selector" id="view-selector">…</div>
</div>
```

**After** — header `controls` div retains only the view selector:

```html
<div class="controls">
  <div class="view-selector" id="view-selector">
    <button class="view-btn active" id="view-btn-graph"
            onclick="switchView('graph')" title="Guru-shishya parampara">Guru-Shishya</button>
    <button class="view-btn" id="view-btn-raga"
            onclick="switchView('raga')" title="Melakarta–janya raga system">Mela-Janya</button>
  </div>
</div>
```

A new compact toolbar is injected *inside* `#canvas-wrap`, absolutely positioned at the top-right corner of the canvas pane:

```html
<!-- inside #canvas-wrap, before #cy-wrap -->
<div id="viewport-toolbar">
  <button id="btn-fit"      class="vp-btn" title="Fit all nodes into view"      onclick="vpFit()">Fit</button>
  <button id="btn-reset"    class="vp-btn" title="Reset zoom to 1:1"            onclick="vpReset()">Reset</button>
  <button id="btn-relayout" class="vp-btn" title="Re-run force-directed layout" onclick="vpRelayout()">Relayout</button>
</div>
```

CSS for the toolbar (added to [`base.html`](../carnatic/render/templates/base.html:8) `<style>` block):

```css
/* ── Viewport toolbar — compact overlay, top-right of canvas pane ── */
#viewport-toolbar {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 70;
  display: flex;
  gap: 4px;
  pointer-events: auto;
}
.vp-btn {
  background: var(--bg-panel);
  color: var(--fg-muted);
  border: 1px solid var(--border-strong);
  padding: 3px 8px;
  font-family: inherit;
  font-size: 0.68rem;
  cursor: pointer;
  border-radius: 2px;
  opacity: 0.75;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
  white-space: nowrap;
}
.vp-btn:hover {
  opacity: 1;
  color: var(--accent);
  background: var(--bg-input);
}
```

The toolbar is always visible in the Guru-Shishya view (both graph and timeline sub-modes). In the Mela-Janya view, `Fit` and `Reset` call SVG-wheel equivalents (`wheelFit()`, `wheelReset()`); `Relayout` is hidden (the wheel has no stochastic layout to re-run).

---

### 3. Add a Timeline toggle inside the Guru-Shishya view

A small toggle button appears *within* the viewport toolbar, visible only when the Guru-Shishya view is active:

```html
<button id="btn-timeline" class="vp-btn vp-toggle" id="btn-timeline"
        title="Toggle chronological timeline layout"
        onclick="vpToggleTimeline()">Timeline</button>
```

`vpToggleTimeline()` replaces the old `switchView('timeline')` call. It toggles `currentLayout` between `'graph'` and `'timeline'` without changing `currentView` (which remains `'graph'`). The button receives an `.active` class when timeline layout is active.

This means:
- `currentView` has only two values: `'graph'` | `'raga'`
- `currentLayout` has two values within the graph view: `'graph'` | `'timeline'`
- The `switchView()` function in [`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js:38) is simplified: it only handles `'graph'` ↔ `'raga'` transitions

---

### 4. Remove `toggleLabels()` and the `labelsOverride` flag

**Before** (in [`graph_view.js`](../carnatic/render/templates/graph_view.js:583)):

```javascript
let labelsOverride = false;
function toggleLabels() {
  labelsOverride = !labelsOverride;
  if (labelsOverride) cy.nodes().forEach(n => n.style('label', n.data('label')));
  else applyZoomLabels();
}
```

**After:** Both declarations are deleted. All references to `labelsOverride` in `applyZoomLabels()` are removed:

```javascript
// Before:
function applyZoomLabels() {
  if (labelsOverride) return;   // ← remove this guard
  …
}

// After:
function applyZoomLabels() {
  const z = cy.zoom();
  cy.nodes().forEach(n => {
    …
  });
}
```

The `btn-labels` element is removed from the HTML. The `cyControls` array in [`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js:57) that hides/shows buttons on view switch is updated to remove `'btn-labels'`.

---

### 5. Viewport toolbar visibility by view

The [`switchView()`](../carnatic/render/templates/raga_wheel.js:38) function manages toolbar button visibility:

| Button | Guru-Shishya (graph) | Guru-Shishya (timeline) | Mela-Janya |
|---|---|---|---|
| `Fit` | visible → `cy.fit()` | visible → `cy.fit()` | visible → `wheelFit()` |
| `Reset` | visible → `cy.reset()` | visible → `cy.reset()` | visible → `wheelReset()` |
| `Relayout` | visible → cose relayout | visible → re-apply timeline | hidden |
| `Timeline` | visible, inactive | visible, **active** | hidden |

The `wheelFit()` and `wheelReset()` functions are stubs to be implemented in [`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js:1) — they call the existing `drawRagaWheel()` with a reset viewport transform.

---

## Consequences

### Enables

- A rasika opening the application sees two clearly named domains: **Guru-Shishya** (the parampara) and **Mela-Janya** (the raga system). The conceptual structure of Carnatic music is immediately legible.
- Timeline remains accessible as a scholarly sub-mode without polluting the primary navigation.
- Viewport controls are spatially associated with the canvas they control, reducing cognitive load in the header.
- The Mela-Janya view gains `Fit` and `Reset` parity with the Guru-Shishya view — resolving the asymmetry noted in the user's observation.
- Future primary views (e.g. a Composer graph, a Tala wheel) can be added to the two-button selector without header overflow.

### Forecloses

- The `labelsOverride` escape hatch is permanently removed. If a future use case requires forced label visibility, it must be implemented as a zoom-level override in `applyZoomLabels()`, not as a global flag.
- `currentView` can no longer be `'timeline'` — any code that checks `currentView === 'timeline'` must be updated to check `currentLayout === 'timeline'` instead.

### Queries now possible

- "Show me the Guru-Shishya parampara as a timeline" → Timeline toggle within the Guru-Shishya view.
- "Show me the Mela-Janya system" → Mela-Janya primary view, with Fit/Reset controls.
- "Fit the current view to the screen" → always available via the viewport toolbar, regardless of which view or sub-mode is active.

---

## Implementation

**Agent:** Carnatic Coder

**Files to modify:**

| File | Change |
|---|---|
| [`carnatic/render/templates/base.html`](../carnatic/render/templates/base.html) | Remove `[Fit]` `[Reset]` `[Relayout]` `[Labels]` from header `.controls`; rename view buttons to `Guru-Shishya` / `Mela-Janya`; remove `view-btn-timeline`; add `#viewport-toolbar` div inside `#canvas-wrap`; add `.vp-btn` CSS; add `#viewport-toolbar` positioning CSS |
| [`carnatic/render/templates/graph_view.js`](../carnatic/render/templates/graph_view.js) | Remove `labelsOverride` flag and `toggleLabels()` function; remove `if (labelsOverride) return` guard from `applyZoomLabels()`; update `relayout()` to be called via `vpRelayout()` wrapper |
| [`carnatic/render/templates/raga_wheel.js`](../carnatic/render/templates/raga_wheel.js) | Update `switchView()` to handle only `'graph'` ↔ `'raga'`; remove `'btn-labels'` from `cyControls` array; add `vpFit()`, `vpReset()`, `vpRelayout()`, `vpToggleTimeline()` dispatcher functions; add `wheelFit()` and `wheelReset()` stubs; manage `#btn-timeline` and `#btn-relayout` visibility per view |
| [`carnatic/render/templates/timeline_view.js`](../carnatic/render/templates/timeline_view.js) | No structural changes required; `currentLayout` variable and `applyTimelineLayout()` remain as-is |

**Sequence:**

1. Coder modifies `base.html`: header restructure + viewport toolbar HTML + CSS.
2. Coder modifies `graph_view.js`: remove Labels machinery; expose `relayout()` as `vpRelayout()` target.
3. Coder modifies `raga_wheel.js`: update `switchView()`; add dispatcher functions; add wheel viewport stubs.
4. Coder runs `bani-render` and verifies in browser: both primary views load; Timeline toggle works within Guru-Shishya; Fit/Reset/Relayout work in both views; Mela-Janya has Fit/Reset; Labels button is gone.
