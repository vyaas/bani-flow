# ADR-033: Touch Interaction Model — Tap, Double-Tap, and Long-Press in Both Graph Views

**Status:** Proposed
**Date:** 2026-04-18

---

## Context

### The three-event problem

Mouse input provides three distinct events: `mouseover` (hover), `click`, and
`dblclick`. Touch input provides three analogous events: `tap` (single touch),
`dbltap` (double-tap), and `taphold` (long press, ~500ms). The semantic mapping
between these sets is not one-to-one:

| Mouse | Touch | Problem |
|---|---|---|
| `mouseover` | — | No touch equivalent exists. Tooltip/preview information is invisible on mobile. |
| `click` | `tap` | Clean mapping. No issue. |
| `dblclick` | `dbltap` | Double-tap is inconsistent across mobile browsers; iOS intercepts it for Safari zoom in some contexts. |

The result: on mobile, **hover tooltips never appear** and **the metadata inspector
(triggered by dblclick) is unreliable or unreachable**.

### The desktop ambiguity problem

Independent of mobile, the current desktop interaction model has a UX clarity gap that
the team has noticed: double-clicking a node opens the metadata inspector (raw JSON
viewer). This is a developer-facing tool. Rasikas and contributors who double-click
on a musician node expecting to "navigate deeper" instead get a JSON object. The
purpose of double-click is not surfaced in any UI affordance.

This ADR resolves both problems: it defines a canonical interaction model for desktop
(no regressions, but clarified intent) and a coherent touch model for mobile.

---

## Current Interaction States

### Guru-Shishya View (Cytoscape)

| Input | Event | Current behaviour |
|---|---|---|
| Mouse over node | `mouseover` | Hover popover: name, lifespan, instrument, recording count |
| Mouse out node | `mouseout` | Hide hover popover |
| Click node | `tap` | Select node: highlight in graph, populate right sidebar (name, lifespan, wiki, recordings) |
| Double-click node | `dbltap` | Open metadata inspector (raw JSON popover) |
| Click edge | `tap` on edge | Populate `#edge-info`: guru→shishya, relationship note, confidence % |
| Double-click edge | `dbltap` on edge | Open metadata inspector for edge |
| Click background | `tap` on canvas | Clear selection: reset highlights, hide panels |
| (no touch) | `taphold` | Not currently wired |

### Mela-Janya View (SVG raga wheel)

| Input | Event | Current behaviour |
|---|---|---|
| Mouse enter node | `mouseenter` | Show tooltip: raga name, parent mela, composition count |
| Mouse leave node | `mouseleave` | Hide tooltip |
| Click mela circle | `click` | Expand: show janya nodes at R_JANYA radius; `triggerBaniSearch('raga', mela.id)` |
| Double-click mela | `dblclick` | Open metadata inspector (if not a post-drag click) |
| Click janya node | `click` | Toggle: show/hide composition nodes at R_COMP; `triggerBaniSearch('raga', janya.id)` |
| Double-click janya | `dblclick` | Open metadata inspector |
| Click composition node | `click` | Expand: show musician nodes at R_MUSC; filter Bani Flow panel |
| Double-click composition | `dblclick` | Open metadata inspector |
| Click musician node | `click` | Switch to Guru-Shishya graph, select that musician node |
| Drag (SVG background) | `mousedown`+`mousemove` | Pan the wheel |
| Scroll | `wheel` | Zoom the wheel |
| Double-click background | `dblclick` | `wheelFit()`: reset pan and zoom to default |

---

## Forces in tension

| Force | Direction |
|---|---|
| **Immersion** | A rasika at a concert should tap a musician and immediately see recordings — not trigger a raw JSON inspector by accident. Double-click should not be a hazard. |
| **Expert access** | The metadata inspector is valuable for data contributors and debugging. It must remain accessible, but via a deliberate gesture that reflects its expert-facing nature. |
| **Touch naturalness** | On mobile, long-press (taphold) is the universal "contextual menu" gesture — it maps naturally to "show more / developer info". Double-tap is "zoom into this". |
| **Desktop continuity** | The desktop interaction model should not regress. Users who have learned the existing model lose nothing. |
| **Cross-view consistency** | The same gesture should mean the same thing in both views. If long-press = metadata inspector in Guru-Shishya, it must mean the same in Mela-Janya. |

---

## Pattern

**Layers of purpose** (Norman, *The Design of Everyday Things*, ch. 2): each interaction
layer should have a single clear intent. Selection is a first-layer action. Navigation
is a second-layer action. Inspection (raw data) is a third-layer action for experts.
The model below assigns each gesture to the correct layer.

---

## Decision

### Desktop interaction (no changes, clarified intent)

The desktop model is preserved exactly. This section documents the canonical intent
so that future UI additions can reason about it.

**Guru-Shishya:**
- **hover** → preview (tooltip: name, lifespan, instrument, recording count)
- **click** → select (full musician panel, recording list)
- **dblclick** → inspect (metadata inspector — explicit expert action)

**Mela-Janya:**
- **hover** → preview (tooltip: raga/composition info)
- **click** → navigate (expand/collapse level: mela→janya, janya→composition, composition→musician)
- **dblclick** → inspect (metadata inspector)
- **background dblclick** → reset view (`wheelFit()`)

### Mobile interaction model (new)

All changes are additive. No desktop events are removed. Mobile-specific gesture
mappings apply when `window.matchMedia('(pointer: coarse)').matches` is true.

#### Guru-Shishya on mobile (Cytoscape)

| Gesture | Cytoscape event | Action | Rationale |
|---|---|---|---|
| Tap (node) | `tap` | Select node + open bottom sheet in peek state (see ADR-034) | Same as desktop click; bottom sheet replaces always-visible right sidebar |
| Double-tap (node) | `dbltap` | Fit graph viewport to selected node (auto-zoom to fill canvas) | Double-tap = zoom is a universal mobile pattern; makes dense graphs navigable |
| Long press (node) | `taphold` | Open metadata inspector | Deliberate, expert gesture; maps naturally to "contextual info" |
| Tap (edge) | `tap` on edge | Show edge info in bottom sheet | Same as desktop click |
| Long press (edge) | `taphold` on edge | Open metadata inspector for edge | Consistent with node long-press |
| Tap (background) | `tap` on canvas | Clear selection; dismiss bottom sheet | Same as desktop background click |

Cytoscape natively fires `taphold` after 500ms of no movement. No extra library needed.

The `dbltap` "fit to node" implementation:
```javascript
cy.on('dbltap', 'node', function(evt) {
  if (!isTouchDevice()) return;  // desktop: handled by existing dblclick→inspector
  const node = evt.target;
  cy.animate({ fit: { eles: node, padding: 80 }, duration: 300 });
});
```

#### Mela-Janya on mobile (SVG wheel)

| Gesture | Pointer event | Action | Rationale |
|---|---|---|---|
| Tap (mela circle) | `pointerup` (no move) | Expand janyas; show raga info in bottom sheet | Same as desktop click |
| Long press (mela) | `pointerdown` + 500ms timeout | Open metadata inspector | Expert gesture; consistent with GS model |
| Tap (janya node) | `pointerup` (no move) | Toggle compositions; update bottom sheet | Same as desktop click |
| Long press (janya) | `pointerdown` + 500ms | Open metadata inspector | Consistent |
| Tap (composition) | `pointerup` (no move) | Expand musicians; update bottom sheet | Same as desktop click |
| Long press (composition) | `pointerdown` + 500ms | Open metadata inspector | Consistent |
| Tap (musician) | `pointerup` (no move) | Switch to Guru-Shishya, select node | Same as desktop click |
| Single-finger drag | `pointermove` (1 pointer) | Pan wheel | Same as desktop drag |
| Two-finger drag | `pointermove` (2 pointers) | Pinch-zoom wheel (see ADR-035) | Replaces scroll wheel |
| Double-tap (background) | Two rapid `pointerup` on background | `wheelFit()` reset | Preserves existing desktop double-click-background behaviour |

Long-press timing wired via `pointerdown`/`pointermove`/`pointerup` with a
`_tapHoldTimer`. Any `pointermove` beyond a 5px threshold cancels the timer (pan
gesture wins). See ADR-035 for the full event handler refactor.

---

## Before / After summary

| Context | Desktop (no change) | Mobile (new) |
|---|---|---|
| Node preview | hover popover | First tap shows right sidebar (peek, see ADR-034) |
| Node selection | click | tap |
| Metadata inspector | dblclick | long press (taphold) |
| Wheel zoom | scroll wheel | pinch (see ADR-035) |
| Wheel pan | mouse drag | single-finger drag (see ADR-035) |
| Viewport reset | Fit button / dblclick background | Fit button (always visible) / double-tap background |
| Navigation in wheel | click to expand levels | tap to expand; bottom sheet shows level info |

---

## Consequences

- Cytoscape's `taphold` event is already fired by its touch normalisation layer.
  Wiring it to `openMetaInspector` is a ~3-line addition in `graph_view.js`.
- The `dbltap` → fit-to-node requires a `cy.animate()` call guarded by `isTouchDevice()`.
  Desktop `dbltap` behaviour (metadata inspector) is unaffected.
- Mela-Janya long-press requires extending the `pointerdown` handler in `raga_wheel.js`
  with a timeout + cancel-on-move pattern. This is detailed in ADR-035.
- The bottom sheet referenced in this ADR is specified in ADR-034. The interaction
  model (what populates the sheet) is defined here; the drawer structure is in ADR-034.
- `isTouchDevice()` guard: `window.matchMedia('(pointer: coarse)').matches` is the
  recommended check. It is `true` on phones/tablets, `false` on desktop. Hybrid devices
  (Surface, iPad with keyboard) resolve to `coarse` when touch is the primary input.

---

## Open questions

1. Should `dbltap` on mobile in the Mela-Janya wheel trigger a `wheelFit()` on any
   node (reset to show the full wheel), or a "zoom into this mela/janya" behaviour?
   The current proposal is `wheelFit()` only on background double-tap; node double-tap
   is reserved for long-press disambiguation (no second action needed).

2. Is 500ms the right long-press threshold? iOS uses ~500ms; Android ~400ms. Cytoscape
   uses 500ms for `taphold`. Using 500ms everywhere (Cytoscape + SVG) is consistent.

3. When the bottom sheet is in peek state (musician name visible), should a second tap
   on the same node expand the sheet, or should the expansion be triggered by the user
   dragging the sheet handle up? Current proposal: tapping the peek handle expands it;
   a second node tap does nothing (node is already selected).
