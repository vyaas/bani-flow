# ADR-134: Connected-Only Guru-Shishya Graph — Suppress Lineage Orphans

**Status**: Proposed
**Date**: 2026-05-12
**Author**: Graph Architect
**Depends on**: ADR-013 (single-source-of-truth traversal layer), ADR-114 (Hindustani musicians without forced lineage)
**Related**: ADR-133 (companion: Mela-Janya as primary view), ADR-115/116 (entry forms for adding edges), ADR-137 (musician panel exposes guru/shishya — alternate access path for orphans)

---

## Context

The Guru-Shishya view currently renders **every musician node in `musicians.json`**, including those with zero `guru-shishya` edges incident on them. The screenshot in the originating session shows the result: a dense halo of disconnected dots floating around the genuine lineage trees. This is data we have collected but for which we have not yet sourced lineage; rendering them in the *lineage* view misrepresents the dataset as fragmented and gives the visitor the false impression that Carnatic music is a tradition of "musical orphans".

The information is not lost — orphan musicians remain:
- Searchable from the search bar
- Reachable from the Mela-Janya view (when they have recordings tied to a raga)
- Reachable from the Musician panel via the new guru/shishya chips (ADR-137)
- Editable via `bani-add` and the entry forms — adding an edge re-introduces the node to the lineage view automatically
- Inspectable directly via `python3 carnatic/cli.py get-musician <id>` and `gurus-of` / `shishyas-of`

What is suppressed is only their **rendering as a disconnected dot in a view whose entire grammar is *connection***.

### Forces

| Force | Direction |
|---|---|
| **The view's grammar** | A guru-shishya graph asserts that every node is part of a transmission chain. An isolated node is a category error in this grammar. |
| **Honest representation of incompleteness** | Our data is and will always be incomplete. The honest response is *to not render claims we cannot make*, not *to render the absence as scatter*. |
| **No data loss** | The orphan is not deleted, hidden from search, or de-prioritised in the schema. The view changes; the source of truth does not. |
| **Discoverability of orphans** | A user must still be able to find an orphan and *add an edge* if they have one. The musician panel's new guru/shishya chips (ADR-137) and the search bar provide this access. |
| **Curation feedback loop** | Suppressing orphans creates a visible, productive pressure: a node only appears in the lineage view once its lineage has been sourced. This rewards curation and makes the gap legible to the curator (via CLI), not to the rasika. |
| **Performance** | Cytoscape layouts (cose, fcose) on hundreds of disconnected singletons waste compute and crowd the canvas. Suppression reclaims both. |
| **Filter interaction** | Era / instrument filters (and ADR-135's relocated cluster) should filter *within the connected set*, not toggle visibility of orphans. The "connected" predicate is upstream of all view filters. |

---

## Pattern

**Christopher Alexander, *A Pattern Language*, Pattern 60 — *Accessible Green*.** The lineage view is a public commons. Empty plots scattered through it do not become a park; they become a vacant lot. The commons is defined by what is *connected and walkable*, not by what is enclosed.

**The Nature of Order, Book 1, Property 5 — *Boundaries*.** A coherent centre needs an edge that says "this and not that". The boundary of the lineage view is *participation in a lineage edge*. Without that boundary the view dissolves into noise.

**Property 12 — *Not-Separateness***. The orphans look separate not because they are conceptually separate from the tradition, but because we have not yet documented their connection. Rendering them as separate **manufactures** a separateness that does not exist in the music. Suppression restores the truer not-separateness: when their edges are added, they re-appear *already connected*.

---

## Decision

### D1. Predicate for inclusion in the Guru-Shishya view

A musician node is included in the **Guru-Shishya view's rendered subgraph** iff it is incident to **at least one edge of type `guru-shishya`** in the canonical edge list.

```text
visible_in_lineage_view(node) :=
    exists edge in graph.edges
        where edge.type == "guru-shishya"
          and (edge.source == node.id or edge.target == node.id)
```

This is computed at view-construction time from the same `graphData` already in scope; it does not require schema changes, new fields, or a precomputed flag.

### D2. Scope of suppression — Guru-Shishya view only

Orphan suppression applies **only to the Guru-Shishya view's Cytoscape graph (both `cose` and `timeline` sub-layouts — see ADR-136)**. It **does not** affect:

- The Mela-Janya / raga-wheel view (musicians appear there via recordings, not via lineage)
- The search bar's results
- The musician panel (renderable for any musician, orphan or not)
- The export/reduced-graph CLIs
- The bundle and entry-form pickers
- `cli.py` queries — `stats`, `get-musician`, etc. continue to count and return all musicians

### D3. Filter composition order

When an era or instrument filter is active, the visible set is:

```text
visible := connected_set  ∩  era_filter_predicate  ∩  instrument_filter_predicate
```

Connectedness is the **innermost** predicate. A filter never re-introduces an orphan; it can only further narrow the connected set. The "Clear" button clears the user-facing filters but does **not** disable the connectedness predicate (that requires superseding this ADR).

### D4. Empty-state handling

If a filter combination yields zero visible nodes, the empty-state tutorial (existing affordance) is shown with a hint:

> *"No musicians match these filters. Some lineages are still being sourced — see them by name in the search bar or via the Mela-Janya view."*

This restores the access path for curious visitors without polluting the canvas.

### D5. Edge-type narrowness

For this ADR, "edge" means specifically `type: "guru-shishya"`. Co-performance edges, concert-bracket edges (ADR-018), and any future relational edges **do not** count toward connectedness in the Guru-Shishya view. This view is named for one relation; that relation is what defines membership.

### D6. Orphan visibility for the curator (out of scope, but flagged)

The curator's view of "musicians lacking lineage" is a CLI affair, not a UI affair. A future tool (e.g. `cli.py orphans`) may enumerate them; this ADR does not require it but does not preclude it.

---

## Consequences

- **Positive**: The lineage view becomes legible. Disconnected scatter is gone. The eye reads transmission chains, not noise.
- **Positive**: Layouts compute faster and converge cleaner.
- **Positive**: The act of *adding a guru-shishya edge* now has a visible reward: the node materialises in the view. The curation loop self-reinforces.
- **Positive**: The dataset's incompleteness becomes invisible to the rasika and visible to the curator (via CLI), which is the correct routing of that information.
- **Negative**: Visitors who knew an orphan was there and used the lineage view as their entry point lose that path. Mitigated by ADR-137 (musician panel chips) and the search bar.
- **Negative**: A curator who relied on "I can see all orphans on the canvas" loses that overview. Mitigated by future CLI tooling (D6) — explicitly out of scope here but cheap to add.
- **Neutral**: No schema change. No data migration. No new fields.

---

## Implementation

This is a **single-predicate change** in the graph view's data-loading path — assignable to the Carnatic Coder once Accepted.

| File | Change |
|---|---|
| `carnatic/render/templates/graph_view.js` | At the point where nodes are fed to Cytoscape for the Guru-Shishya view, filter `nodes` through `visible_in_lineage_view` (D1). The connected-set computation runs once per graph load, cached in a `Set<id>`. |
| `carnatic/render/templates/empty_tutorials.js` | Add the empty-state hint copy (D4). |

**No data files change. No render-pipeline schema changes. No CLI changes.**

**Verification after `bani-render`**:
- `graph.html` Guru-Shishya view renders only musicians with ≥1 guru-shishya edge
- The disconnected dots in the originating screenshot are absent
- Mela-Janya view, search, and musician panels continue to surface every musician
- Adding a new edge via the entry form (or `bani-add`) and re-rendering causes the previously-orphan node to appear in the lineage view

---

## Status history

- 2026-05-12: **Proposed** by Graph Architect.
