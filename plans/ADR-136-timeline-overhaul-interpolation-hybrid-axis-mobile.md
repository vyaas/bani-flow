# ADR-136: Timeline Overhaul — Interpolated Dating, Hybrid Axis, Navigable Ticks, Mobile Vertical

**Status**: Proposed
**Date**: 2026-05-12
**Author**: Graph Architect
**Depends on**: ADR-013 (graph view structure), ADR-114 (timeline placement by birth year, applies to Carnatic + Hindustani), ADR-134 (connected-only — defines the input set), ADR-135 (`Timeline` button lives in the layout-control cluster)
**Related**: ADR-008 (era filters compose with timeline), ADR-129 (chrome retirement — ruler is part of the floating canvas)

---

## Context

The timeline sub-layout of the Guru-Shishya view has accreted four distinct pathologies, all visible in the screenshots attached to the originating session:

1. **Orphan dating**. Musicians without a `birth_year` are dumped at `TIMELINE_UNKNOWN_X` (`TIMELINE_WIDTH + 400`) — a single far-right column that catches dozens of nodes. The screenshot shows two dense vertical pillars at the right edge made entirely of un-dated musicians. This misrepresents the data: a shishya of Patnam Subramania Iyer cannot be a 2030s figure; the absence of a year is not the same as "unknown era".

2. **No use of edge information**. We *know* the lineage edges. A node connected to a guru with `death_year = 1902` and a shishya with `birth_year = 1925` was alive in roughly that span. We do not currently use this information to interpolate a position.

3. **Pre-Trinity gaps**. As ADR-122/123 (katapayadi, melakarta lineage) and the broader pre-Trinity musicology has been added, the timeline now spans figures from the 17th–18th century alongside the 19th–20th. The current axis is uniform-linear from 1750–2010 (`TIMELINE_X_MIN`, `TIMELINE_X_MAX`); the pre-1800 band is sparse and the post-1850 band is a wall of nodes. The hard-coded floor of 1750 also clips genuinely earlier figures.

4. **Ruler illegibility and inertness**. The current ruler draws ticks every 10 years (`for (let year = TIMELINE_X_MIN; year <= TIMELINE_X_MAX; year += 10)`). At the working zoom level, century-only labels are tiny and 10-year ticks are noise. Worse, the ruler is inert: clicking a year does nothing. A timeline that does not let you *navigate* to an era is just a ruler in a cage.

5. **Mobile orientation wrong**. The viewport on mobile is taller than wide. A horizontal timeline crammed into a portrait viewport is unreadable. The natural orientation in portrait is **vertical** (time flowing top-to-bottom).

### Forces

| Force | Direction |
|---|---|
| **Honest dating under incomplete information** | We will never have complete birth/death data. The timeline must give a *defensible position* for every connected node, with a clear rule. |
| **Lineage as evidence** | Guru-shishya edges carry temporal information. Using them is a free upgrade in dating fidelity. |
| **Legibility over precision** | A 50-year tick with a clear, large label tells the rasika more than a 10-year tick they cannot read. |
| **Pre-Trinity scale** | A tradition that includes both 1700 and 2000 cannot be drawn on a single uniform axis without one half being a smear. A hybrid scale (log pre-Trinity, linear post-Trinity) handles this without distortion within the Trinity-and-after window where most nodes live. |
| **Navigability** | An axis tick that responds to a click is an interface element, not just a label. A 50-year tick that focuses the canvas on its era is the cheapest, most legible navigation tool we can offer. |
| **Orientation matches viewport** | Time is one-dimensional; the viewport's long axis should carry it. Landscape → horizontal. Portrait → vertical. |
| **No data migration** | All four fixes operate on existing fields (`birth_year`, `death_year`, `guru-shishya` edges). No schema change. |
| **Composes with ADR-134** | Orphan suppression (ADR-134) already removes nodes with zero edges. Every node the timeline must place has at least one edge — guaranteeing the interpolation rule has *something to anchor to*. |

---

## Pattern

**Christopher Alexander, *A Pattern Language*, Pattern 134 — *Zen View*.** A timeline is a window onto historical time. The view from the window must compose: known years anchor the eye, unknown years are *placed in relation* (not in a separate column), and the ruler frames the window without dominating it.

**The Nature of Order, Book 1, Property 1 — *Levels of Scale*.** Centuries, half-centuries, decades — three nested scales. The ruler should show the centuries strongly, the half-centuries clearly, and the decades not at all. Three scales, not one.

**Property 9 — *Echoes*.** The interpolated position of an undated node *echoes* the dated nodes it is connected to. The position is not invented; it is inherited from the lineage. This honours the oral-tradition stance: *who you learned from places you in time*.

**Pattern 132 — *Short Passages*.** The pre-Trinity stretch is the long approach to the dense settlement of the Trinity-and-after. A log compression of that approach is the equivalent of a short passage — it acknowledges distance without making the visitor walk every step.

---

## Decision

### D1. Interpolated dating — three-tier resolution

For each musician node placed on the timeline, the **placement year `y(node)`** is computed as:

```
y(node) :=
  1. if node.birth_year is known       → birth_year
  2. else if node has guru-shishya edges with at least one dated neighbour:
         → interpolate (D2)
  3. else                              → fallback (D3)
```

This rule is computed once per timeline-layout invocation. It is **never written back to JSON** — `birth_year` remains the canonical, sourced field; `y(node)` is a derived display coordinate.

### D2. Interpolation rule

Define for each undated node:

- `g_years` := the set of `{birth_year ?? death_year ?? y(guru)}` over all gurus of `node`, recursively up to depth 2 if direct neighbours are also undated
- `s_years` := the same for shishyas

Then:

```text
if both g_years and s_years are non-empty:
    y(node) := mean( max(g_years) + 20 ,  min(s_years) - 20 )
              clamped to [ max(g_years), min(s_years) ]

else if only g_years non-empty:
    y(node) := max(g_years) + 20      // a generation after the latest guru

else if only s_years non-empty:
    y(node) := min(s_years) - 20      // a generation before the earliest shishya
```

The constant `20` is the "one-generation" offset (a defensible default for guru→shishya transmission within a lifetime). It is exposed as a single tunable in the timeline module; this ADR fixes its initial value.

The recursion-depth cap of **2** prevents pathological propagation through long chains of undated nodes; if no dated anchor is found within depth 2, the node falls through to D3.

### D3. Fallback for the truly unanchored

A node with no dated neighbour within 2 hops is placed at **the median year of its era band** (using the existing era-classification — Trinity, Bridge, Golden Age, Disseminators, Living Pillars, Contemporary). If even the era is unknown, the node is **omitted from the timeline view** (not piled at the right edge). It remains visible in the cose layout per ADR-134 and reachable from search and panels.

This consciously reverses the current behaviour: better to omit a placement we cannot defend than to invent a 2030 musician.

### D4. Hybrid axis — log pre-Trinity, linear post-Trinity

The axis is split at **1775** (the Trinity birth window — Tyagaraja b. 1767, Dikshitar b. 1775, Syama Sastri b. 1762; this ADR fixes the pivot at 1775 as a clean round number near the centroid).

- **Pre-1775**: logarithmic compression. The mapping `axisX(year)` for `year < 1775` follows `log( 1775 - year + 1 )` scaled to occupy the leftmost ~15% of the timeline width.
- **1775 onward**: linear, with the per-year span calibrated so that 1775 → 2025 fills the remaining ~85% of the timeline width.

The two halves meet at 1775 with **C⁰ continuity** (the position is single-valued at the pivot); slope continuity is *not* required and is intentionally relaxed (the visitor sees a slight inflection at 1775, which is a feature, not a bug — it announces "this is where dense documentation begins").

The constants `TIMELINE_X_MIN = 1750` and `TIMELINE_X_MAX = 2010` are retired. The new bounds are dynamic: `min(y(node))` floored to the nearest century, `max(y(node))` ceilinged to the nearest decade, with the log-region extending to whichever century is needed to fit the earliest node.

### D5. Ruler — 50-year ticks, large labels, navigable

- Ticks at **every 50 years** in the linear (post-1775) region.
- Ticks at **every century** in the log (pre-1775) region (the log compression makes 50-year ticks pre-1775 illegible; centuries are the right granularity there).
- Each tick is rendered as **(a)** a faint full-height grid line (`opacity ~0.15`) across the canvas, **(b)** a clearly-sized label (≥14px on desktop, ≥16px on mobile) above the line, and **(c)** an invisible 24-px-wide click target centered on the line.
- **Click behaviour**: clicking a tick fits the canvas to all musicians whose `y(node)` falls within `[year - 25, year + 25]` (or `±50` for century ticks in the log region). The fit uses Cytoscape's `cy.fit(collection, padding)`. If the collection is empty, the ruler subtly flashes the tick to indicate "no musicians in this era".
- The 10-year ticks are removed.

### D6. Mobile orientation — vertical timeline

On viewports where `height > width` (the existing mobile breakpoint logic, which already exists for other features), the timeline rotates 90°:

- Time flows **top → bottom** (older → newer).
- The ruler runs along the **left edge** of the canvas with labels reading horizontally.
- The 50-year tick grid lines run **horizontally** across the canvas.
- Click behaviour from D5 is unchanged (the fit collection is the same).
- `applyTimelineLayout()` swaps its `x`/`y` assignments based on a single `orientation: 'horizontal' | 'vertical'` parameter derived once from the viewport at layout time. Re-orienting on viewport rotation re-runs the layout.

The orientation is **not user-toggleable**; it is determined by the viewport. Power users on desktop who want the vertical view can still narrow their window — this is the natural affordance.

### D7. Composition with filters and ADR-134

- Era / instrument filters (ADR-008) compose multiplicatively with the timeline placement: filtered-out nodes are removed from the layout before D1–D3 run.
- ADR-134's connected-set predicate runs first. The timeline never sees a fully orphan node, simplifying D2 (every node has at least one edge to anchor against).
- A click on a ruler tick (D5) does **not** alter the active filters; it only fits the camera. Filters and navigation are orthogonal.

---

## Consequences

- **Positive**: No node sits at a fictitious "unknown" pillar. Every visible node has a defensible position derived from sourced data or sourced lineage.
- **Positive**: The pre-Trinity stretch is legible without dominating the canvas. The Trinity-and-after window — where the bulk of the data lives — gets the linear precision it deserves.
- **Positive**: The ruler becomes an *interface*. A rasika can click "1900" and see the Golden Age musicians composed.
- **Positive**: Mobile becomes a first-class timeline surface, not a degraded one.
- **Positive**: Adding a single guru-shishya edge (the cheapest curatorial act) immediately improves the timeline placement of every undated descendant. The curation loop tightens.
- **Negative**: The interpolated `y(node)` is *not* the musician's true year. The ADR accepts this by fiat: a defensible interpolation is honest in a way that "all unknowns dumped on the right" is not. The musician panel continues to show `birth_year: unknown` truthfully; only the *position on the axis* is interpolated.
- **Negative**: The slope discontinuity at 1775 is a small visual inflection. We accept it (see D4 rationale).
- **Negative**: Truly unanchored nodes (D3 fallback to era-band median; or omission) lose representation in the timeline. The cose layout (ADR-013) and the search bar remain their access path. This is the right trade.
- **Neutral**: No JSON schema change. No data migration. The render pipeline emits the same `graph.json`.

---

## Implementation

This is a **single-file rewrite of `timeline_view.js`** plus small CSS tweaks — assignable to the Carnatic Coder once Accepted.

| File | Change |
|---|---|
| `carnatic/render/templates/timeline_view.js` | Rewrite per D1–D6: implement `placementYear(node, graphData)`, `interpolateYear(node, edges, depth)`, hybrid `axisX(year)` / `axisY(year)`, dynamic bounds, 50-year ruler with click handlers, orientation switch. Retire `TIMELINE_X_MIN`/`TIMELINE_X_MAX`/`TIMELINE_UNKNOWN_X` constants. |
| `carnatic/render/templates/base.html` (CSS) | Larger ruler label sizes (D5); grid-line opacity tokens; vertical-orientation rules (D6). |
| `carnatic/render/templates/graph_view.js` | Re-run `applyTimelineLayout()` on `orientationchange` / viewport resize across the portrait/landscape breakpoint. |

**Verification after `bani-render`**:
- Toggle Timeline view: no nodes pile at the right edge; every visible node sits within its lineage's plausible window.
- Pre-1800 figures appear in a compressed left band; Trinity-and-after fills most of the axis.
- Ruler shows 50-year labels (centuries pre-1775); clicking "1900" fits the camera to the Golden Age musicians.
- On a portrait viewport, the timeline runs top-to-bottom with the ruler on the left.
- Era / instrument filters still narrow the visible set without breaking interpolation.

**Test data hooks** (suggested for the Coder when implementing): a small fixture of 5 musicians (one fully dated, two undated with one dated guru each, one undated with only a dated shishya, one with no dated neighbour within 2 hops) verifies all four D1–D3 branches.

---

## Status history

- 2026-05-12: **Proposed** by Graph Architect.
