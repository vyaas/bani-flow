# ADR-135: Layout-Control Cluster — Co-Locate All View-Shaping Affordances

**Status**: Proposed
**Date**: 2026-05-12
**Author**: Graph Architect
**Depends on**: ADR-129 (chrome retirement, floating controls), ADR-008 (era + instrument top-bar filters), ADR-013 (graph view structure)
**Related**: ADR-134 (connected-only — composes with these filters), ADR-136 (timeline overhaul — `Timeline` button is one of these)

---

## Context

The Guru-Shishya view currently exposes its view-shaping controls in **two visually disjoint groups**:

- **Top-left, behind a dark pill bar**: `Era ▾`, `Instrument ▾`, `× Clear` (the predicate filters from ADR-008)
- **Top-right, floating**: `Fit`, `Re-layout`, `Timeline` (the layout-shape buttons)

Both groups do the same kind of work: **they change what the canvas shows or how it shapes the visible set**. A first-time visitor parses them as two unrelated control regions, and the era/instrument bar reads as a *header* (because it has a backing fill, contradicting ADR-129's chrome-retirement principle). The fit/relayout/timeline cluster has the right floating treatment; the filter cluster has not been brought into line.

### Forces

| Force | Direction |
|---|---|
| **Co-locate by function** | Filters and layout-shapers both modify the rendered graph. They belong together so the user has a single mental "where do I go to change the view" answer. |
| **Honour ADR-129** | The era/instrument backing pill is residual chrome. ADR-129 retired chrome. The filter buttons must float like every other control. |
| **Vertical economy** | A single cluster anchored top-right occupies one corner. Two clusters occupy two corners and steal real estate from both. |
| **Reading order within the cluster** | Layout-shape (what *form* the graph takes — fit, relayout, timeline) reads as primary; predicate filters (what *subset* is shown) read as secondary. The primary group sits above the secondary group. |
| **No semantic change** | Each button retains its existing handler and behaviour. Only their grouping and position change. |
| **Mobile fallback** | The cluster must collapse cleanly on narrow viewports — see ADR-136 for the timeline-orientation flip; the cluster as a whole keeps the same composition but may stack differently. |

---

## Pattern

**Christopher Alexander, *A Pattern Language*, Pattern 168 — *Connection to the Earth*.** A control needs to feel anchored to the thing it acts on. All the view-shapers act on the same canvas; they share the same anchor point.

**The Nature of Order, Book 1, Property 1 — *Levels of Scale*.** A cluster of clusters: the top-level cluster is "view shapers"; within it, two sub-clusters (layout-shape, predicate-filter) at a smaller scale. This recursion is what makes a control region *legible* rather than *crowded*.

**Property 14 — *Simplicity and Inner Calm*.** Two scattered control groups produce visual noise. One cluster, with two clearly-bounded sub-rows, is calm.

---

## Decision

### D1. A single floating cluster `#layout-controls-float`

A new container, anchored top-right of the canvas (taking the slot currently occupied by `Fit / Re-layout / Timeline`), holds **all** view-shaping controls in two stacked rows:

```
┌──────────────────────────────────────────┐   ← #layout-controls-float
│  [ Fit ]  [ Re-layout ]  [ Timeline ]    │   ← row 1: layout-shape (primary)
│  [ Era ▾ ] [ Instrument ▾ ] [ × Clear ]  │   ← row 2: predicate-filters (secondary)
└──────────────────────────────────────────┘
```

The container itself has `pointer-events: none` (per ADR-129 hit-testing); each button has `pointer-events: auto`. No backing fill; each button keeps its existing pill treatment.

### D2. Visibility: Guru-Shishya view only

The cluster is shown **only when the active view is Guru-Shishya** (`currentView === 'graph'`). When Mela-Janya is active, the cluster is hidden in its entirety. (The raga wheel has its own affordances — ADR-123/124/131 — which this ADR does not touch.)

### D3. Backing-fill removal — ratify ADR-129 for the filter row

The dark `bg-panel`-style backing currently behind `Era / Instrument / Clear` is removed. Each filter button stands as its own pill, matching the floating treatment of `Fit / Re-layout / Timeline`. Active-state tinting (which signals "filter applied") is preserved on each button.

### D4. Reading order within the cluster

- **Row 1 (top)**: layout-shape buttons in the existing order — `Fit`, `Re-layout`, `Timeline`.
- **Row 2 (bottom)**: predicate-filter buttons in the existing order — `Era ▾`, `Instrument ▾`, `× Clear`.

The two rows are visually grouped by proximity (a tighter intra-row gap, a slightly larger inter-row gap) — no rule lines, no boxes.

### D5. Mobile composition

On narrow viewports (existing mobile breakpoint), the cluster collapses to a **single column** of two stacked rows (still in the same order — layout-shape on top, filters below). The cluster remains anchored top-right. The `Timeline` button, when active on mobile, triggers the vertical timeline orientation defined by ADR-136 §D5.

### D6. Keyboard / accessibility (out of scope, but flagged)

This ADR does not introduce new accessibility requirements. Existing focus order and ARIA labels are preserved as buttons are re-parented.

---

## Consequences

- **Positive**: One corner of the canvas owns "view-shaping". Three corners are freed.
- **Positive**: ADR-129's chrome-retirement principle is now applied uniformly to *every* control on the Guru-Shishya canvas.
- **Positive**: The visual hierarchy (layout-shape > predicate-filter) is finally legible.
- **Negative**: Existing muscle memory ("Era is in the top-left") changes. One-time cost.
- **Neutral**: No data, schema, or handler-logic change.

---

## Implementation

This is a **DOM re-parenting + CSS** change in the Guru-Shishya template — assignable to the Carnatic Coder once Accepted.

| File | Change |
|---|---|
| `carnatic/render/templates/base.html` | Move the era/instrument/clear button group into a new `#layout-controls-float` container that also wraps the existing `Fit / Re-layout / Timeline` buttons. Two rows per D1 / D4. |
| `carnatic/render/templates/base.html` (CSS section) | Remove the dark backing-fill from the filter buttons. Add `.layout-controls-float` styles (pointer-events scaffolding, two-row flex/grid layout, mobile single-column rule per D5). |
| `carnatic/render/templates/graph_view.js` | Toggle `display` of `#layout-controls-float` in `switchView()` per D2. |

**Verification after `bani-render`**:
- Top-right of Guru-Shishya canvas shows a single cluster, two rows, six buttons total
- Top-left of canvas is empty (the dark pill bar is gone)
- Switching to Mela-Janya hides the cluster entirely
- All button handlers continue to work unchanged
- Mobile viewport shows the cluster stacked per D5

---

## Status history

- 2026-05-12: **Proposed** by Graph Architect.
