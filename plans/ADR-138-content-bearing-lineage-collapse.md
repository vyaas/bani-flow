# ADR-138: Content-Bearing Lineage — Collapse Contentless Nodes Into Bulged Transitive Edges

**Status**: Proposed
**Date**: 2026-05-12
**Author**: Graph Architect
**Depends on**: ADR-134 (connected-only Guru-Shishya graph — the predicate this ADR tightens), ADR-013 (single-source-of-truth traversal layer), ADR-077 (YouTube `kind` vocabulary — recital / lecdem / raga_alap / concert / misc)
**Related**: ADR-137 (musician panel guru/shishya chips — the panel-side counterpart that does *not* cull, but dims), ADR-133 (Mela-Janya as primary view), ADR-136 (timeline overhaul — applies the same predicate)

---

## Context

ADR-134 narrowed the Guru-Shishya view to nodes incident to at least one `guru-shishya` edge. That removed the orphan halo, but it did not remove a subtler and more pervasive form of noise: **musicians whose only claim to inclusion is a lineage edge, and who themselves contribute no exploreable content**.

The Bani Flow project's grammar across every view is the same: **content is the entry point**. A node earns its place on the canvas because the rasika can *do something* with it — listen to a recording, read a composition, watch a lecdem. A node with no content is a dead-end; it is a pin on a map of a town with no buildings. The Mela-Janya view already honours this — a raga without recordings does not appear. The Guru-Shishya view does not, yet.

But there is a wrinkle. Some contentless nodes are **structurally load-bearing**: they sit on a transmission chain between two nodes that *do* carry content. Removing them naively would sever the chain and falsely orphan the descendants. Example:

```
Tyagaraja  →  Walajapet Krishnaswami Bhagavatar  →  Tirukodikaval Krishna Iyer
(content)        (no content yet)                       (content)
```

If we drop the middle node, the rasika loses the truthful lineage between the two ends. If we keep it as a full node, the canvas accumulates the same noise ADR-134 set out to remove. The resolution is to **collapse the contentless intermediate into a bulged transitive edge** — a single visually distinct arc between Tyagaraja and Tirukodikaval Krishna Iyer that says *"there is a documented chain through one or more contentless nodes here."*

This is not a schema change. It is a **view-layer rewriting** of the rendered subgraph, computed at view-construction time from the same `graphData` already in scope.

### Forces

| Force | Direction |
|---|---|
| **Content is the entry point** | Every view earns the rasika's attention by giving them something to explore. A contentless node violates the contract. |
| **Lineage truth must survive culling** | A contentless node that bridges content-bearing nodes carries real information — the chain itself. We must not silently delete that information; we must re-encode it. |
| **Visual distinctness of derived edges** | A direct edge and a collapsed-through edge are not the same claim. The user must see, at a glance, which is which. |
| **No data mutation** | The musicians and edges files are unchanged. Suppression and collapse are *rendering decisions*. Adding a recording to a hidden node restores it. |
| **Compatibility with the panel chips (ADR-137)** | The musician panel must continue to render *all* gurus and shishyas — including contentless ones — but visually dim the contentless. The panel is the curator's surface; the canvas is the rasika's. The two surfaces apply the same predicate but to opposite ends: cull on canvas, dim in panel. |
| **Compatibility with ADR-134** | ADR-134's predicate (must be incident to ≥1 guru-shishya edge) remains; this ADR adds a second predicate (must carry content **or** lie on a chain between two content-bearing nodes) and a rewriting step (collapse). |
| **Reversibility under curation** | A node hidden today appears tomorrow when a Librarian adds a recording. This is the curation feedback loop ADR-134 began. |
| **Performance** | Fewer rendered nodes; the collapse computation is O(N+E) — a single pass. |

---

## Pattern

**Christopher Alexander, *A Pattern Language*, Pattern 61 — *Small Public Squares*.** A square is alive only when there are doors opening onto it. A musician node is alive only when there is content opening onto it. Doorless plazas are not squares — they are voids. The lineage canvas should be a sequence of small lit squares, joined by paths.

**The Nature of Order, Book 1, Property 5 — *Boundaries*.** ADR-134 drew the first boundary (must be connected). This ADR draws the second (must be a *centre of activity*, not just a connector). The two boundaries together define what belongs.

**Property 11 — *Roughness*.** A perfectly straight transmission line through twelve undocumented intermediates is a lie of precision. A bulged, slightly indirect arc through "≥1 contentless node" is the honest visual: *we know the chain exists, we have not yet documented every link*. Roughness preserves truth.

**Property 14 — *The Void*.** What is *not shown* is as important as what is. Hiding contentless nodes creates a productive emptiness: the rasika sees only what they can act on; the curator sees the gap (via CLI) and is invited to fill it.

---

## Decision

### D1. Predicate for content-bearing musician

A musician node `m` is **content-bearing** iff *any* of the following hold:

```text
content_bearing(m) :=
    has_recording_as_artist(m)              # ≥1 youtube entry where m appears as performer / co-performer
    or has_lecdem_about(m)                  # ≥1 youtube entry of kind="lecdem" where m appears in subject_musician_ids
    or has_lecdem_by(m)                     # ≥1 youtube entry of kind="lecdem" where m is a performer
    or has_concert_recording(m)             # ≥1 youtube entry of kind="concert" where m appears
    or has_composition_as_composer(m)       # ≥1 row in compositions.json where composer_id == m.id
```

The `kind` vocabulary is ADR-077: `recital`, `lecdem`, `raga_alap`, `concert`, `misc`. All five count as "recordings as artist" except that `lecdem` *additionally* contributes via `lecdem_about` / `lecdem_by` (these are the musicologically richer signals). The default-kind absence is treated as `recital` per existing convention.

`content_bearing` is computed once per render, cached as `Set<musician_id>`, and reused by the collapse algorithm (D3) and the panel-chip dimming (D5).

### D2. Predicate for inclusion in the Guru-Shishya view

Replacing the predicate from ADR-134 §D1 with a stricter one:

```text
visible_in_lineage_view(m) :=
    incident_to_guru_shishya_edge(m)        # ADR-134's predicate, retained
    and content_bearing(m)                  # NEW: must be a centre, not just a connector
```

A node failing `content_bearing` is **culled from the Cytoscape node set** for both `cose` and `timeline` sub-layouts (ADR-136). Its incident `guru-shishya` edges are then rewritten per D3.

### D3. Collapse contentless intermediates into transitive edges

When a contentless node `c` is culled, the lineage chains passing through `c` are rewritten as **direct transitive edges** between content-bearing endpoints:

**Algorithm** (one pass over the lineage subgraph):

1. Build the directed `guru-shishya` graph `G` over all musicians (no culling yet).
2. For each contentless node `c`, mark it as a *transit node*.
3. For each path `(a, t₁, t₂, …, tₖ, b)` in `G` where:
   - `a` is content-bearing,
   - `b` is content-bearing,
   - every `tᵢ` is a transit node,
   - and there is no shorter content-bearing path between `a` and `b`,
   render a **transitive edge** `a → b` annotated with `transit: [t₁ … tₖ]`.
4. If a chain begins or ends at a transit node with no content-bearing anchor on one side, that branch is dropped (it would be invisible anyway — its endpoint has no node to render).

The algorithm is implemented as a graph contraction: contract each maximal chain of transit nodes between two content-bearing endpoints; the contracted edge inherits the metadata of all transits.

**Invariant**: every guru-shishya edge in the rendered view either (a) connects two content-bearing nodes directly (a *primary* edge), or (b) is a *transitive* edge encoding `≥1` collapsed transit node.

### D4. Visual encoding — the bulged arrow

A **primary** guru-shishya edge keeps its current rendering (straight or curved per Cytoscape layout, solid line, arrowhead at the shishya end).

A **transitive** edge is rendered with:

- **A bulge / lens in the middle of the line** — implemented as either a Cytoscape `unbundled-bezier` with a single mid-control-point offset perpendicular to the line, or an SVG-overlay decorator (whichever the Coder finds cleaner). The bulge is *the* signature: it reads as "this connection passes through".
- **The same arrow direction and head as a primary edge.**
- **Same colour as primary**, but with a **subtly thinner stroke** (e.g. 0.75× the primary width) to convey "derived, not asserted".
- **Hover tooltip**: lists the collapsed transit musicians, e.g. *"via Walajapet Krishnaswami Bhagavatar"*. Clicking the bulge opens a small popover listing each transit musician as a chip, each clickable to open that musician's panel (which still renders for any musician, content-bearing or not — the panel is exempt per ADR-137).
- **No arrowhead bidirectionality** — direction is preserved from the underlying chain.

The bulge is the **only** visual difference between primary and transitive edges. No colour change, no dash pattern, no label clutter.

### D5. Panel-chip rendering — dim, do not cull (composes with ADR-137)

ADR-137 mandates that a musician's panel renders **all** gurus and **all** shishyas as chips. This ADR does not change that. It only adds:

- A chip whose target musician is **content-bearing** is rendered at full opacity, full era-tint, normal interaction.
- A chip whose target musician is **not content-bearing** is rendered with **reduced opacity (e.g. 0.5)**, **muted era-tint** (e.g. desaturated by 60% or rendered in the grey-fallback chip palette), and a small inline icon (e.g. a thin dotted underline or a `·` glyph) signalling "no content yet". The chip remains clickable — opening the panel of a contentless musician is still a valid action (it shows their bio, lineage chips, and any future content).
- A tooltip on the dimmed chip reads: *"No recordings or compositions yet — open to view lineage."*

This is the **dual** of D3: the canvas hides them and re-routes through them; the panel shows them and signals that they are sparse. A curator sees a dimmed chip as an invitation to add content; a rasika reads it as a "skip-over" cue.

This dual treatment satisfies ADR-137's mandate that *all* lineage chips are surfaced, while honouring this ADR's principle that the canvas only shows centres of activity. **No conflict**: the predicate is the same; the *rendering response* differs by surface.

### D6. Edge-case behaviour

| Case | Behaviour |
|---|---|
| Isolated contentless node (no lineage edges either) | Already culled by ADR-134. No change. |
| Contentless node with only contentless neighbours | Entire subtree drops out — no content-bearing anchor exists. Documented in CLI orphan tooling (ADR-134 §D6). |
| Cycle of contentless nodes between two content-bearing anchors | Treated as a single transit set; the contraction collapses the cycle to one transitive edge per (source, target) anchor pair. |
| Contentless node that is *both* a transit and an endpoint of a separate chain that has no anchor on the other side | The transit role is preserved; the dead-end branch is dropped. |
| A musician becomes content-bearing mid-session (via `bani-add` then `bani-render`) | Re-rendered as a primary node; transitive edges that previously bypassed them are recomputed and now route through them. |

### D7. Filter composition order (extends ADR-134 §D3)

```text
visible := connected_set ∩ content_bearing_set ∩ era_filter ∩ instrument_filter
```

`content_bearing` is the **second** predicate, layered over `connected`. Era / instrument filters apply *within* the content-bearing connected subgraph. Transitive edges are recomputed *after* user filters apply: if a filter hides a content-bearing intermediate, the chain through it is re-collapsed for the filtered view. This keeps the bulge semantics honest under any filter combination.

### D8. Scope — Guru-Shishya view only

Identical to ADR-134 §D2. This ADR's culling and collapse apply **only** to the Guru-Shishya view's Cytoscape graph (both `cose` and `timeline` sub-layouts). The Mela-Janya view, search bar, musician panel, export CLIs, bundle pickers, and `cli.py` queries are unaffected.

---

## Consequences

- **Positive**: The lineage canvas becomes a map of *centres of musical life* connected by lines of transmission. Every visible node rewards a click.
- **Positive**: Contentless intermediates remain truthfully present — as the *form of the connection itself* — without consuming node real estate.
- **Positive**: The bulge becomes a curatorial signal: *"there is a story to tell here — fill in the middle."* Adding a single recording to a transit node promotes it to a primary node and the bulge straightens.
- **Positive**: Composes cleanly with ADR-137. The musician panel remains the comprehensive lineage surface; the canvas remains the curated, content-rich surface. Each surface honours its grammar.
- **Positive**: No schema change. No data migration. Pure render-layer logic.
- **Negative**: A modest computational cost per render: the contraction is O(N+E) and runs once per filter change. Negligible at current dataset scale.
- **Negative**: The bulged-arrow encoding is a new visual primitive the rasika must learn. Mitigated by hover tooltips and by the encoding's intuitiveness (a bulge reading as "passes through").
- **Negative**: A user who *wanted* to see every named musician on the lineage canvas (e.g. for completionist navigation) loses that affordance. Mitigated by the panel chips (ADR-137) and the search bar — both of which surface every musician.
- **Neutral**: Existing CLI queries (`gurus-of`, `shishyas-of`, `stats`) continue to operate over the full graph, not the rendered subgraph. The view's truth is a subset of the data's truth, by design.

---

## Implementation

This is a **two-step view-layer change** — assignable to the Carnatic Coder once Accepted.

### Step 1 — Compute the content-bearing set

| File | Change |
|---|---|
| `carnatic/render/templates/graph_view.js` (or the dedicated lineage data-prep file) | Add a pure helper `computeContentBearingSet(graphData) → Set<musicianId>` that scans `recordings`, `compositions`, and lecdem-subject metadata once. Cache on the global graph object for reuse by panel-chip rendering (D5). |

### Step 2 — Cull and collapse

| File | Change |
|---|---|
| `carnatic/render/templates/graph_view.js` | At the point where nodes are fed to Cytoscape for the Guru-Shishya view, filter through `visible_in_lineage_view` (D2). Then run the collapse algorithm (D3) over the residual `guru-shishya` edges, producing a mixed list of primary and transitive edges with `data.kind ∈ {primary, transitive}` and `data.transit: [ids]` on transitives. |
| `carnatic/render/templates/graph_view.js` (Cytoscape style block) | Add a style rule `edge[kind="transitive"]` with `unbundled-bezier`, mid-control-point perpendicular offset, and reduced stroke width per D4. |
| `carnatic/render/templates/graph_view.js` (interaction handlers) | Add hover tooltip and click-popover for transitive edges per D4. |
| `carnatic/render/templates/musician_panel.js` (the renderer ADR-137 will introduce) | When rendering guru/shishya chips, check membership in the content-bearing set; apply the dimmed-chip class and tooltip per D5. |
| `carnatic/render/templates/empty_tutorials.js` | Update the empty-state hint copy to mention that musicians without recordings or compositions are not yet shown on the lineage canvas. |

**No data files change. No render-pipeline schema changes. No CLI changes. ADR-077 (kind vocabulary) is consumed but unmodified.**

**Verification after `bani-render`**:
- A musician with `≥1` recording, composition, or lecdem appears as a primary node on the lineage canvas.
- A musician with only `guru-shishya` edges and no content does **not** appear as a node, but their lineage chain is preserved as a bulged transitive edge between their nearest content-bearing ancestor and descendant.
- Hovering a bulged edge reveals the transit musicians; clicking opens a popover with chips.
- The musician panel for a content-bearing musician shows guru/shishya chips at full opacity; for a contentless musician, dimmed.
- Adding a recording to a previously-hidden musician via `bani-add` and re-rendering promotes them to a primary node; the previously-bulged edges through them straighten.
- The Mela-Janya view, search bar, and CLI queries continue to surface every musician.
- ADR-134's connected-only behaviour is preserved (no orphan halo); this ADR strictly tightens, does not loosen.

---

## Status history

- 2026-05-12: **Proposed** by Graph Architect.
