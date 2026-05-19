# ADR-150: elements[] as Musician Data Authority

**Status**: Proposed  
**Date**: 2026-05-19  
**Supersedes**: (none)  
**Related**: ADR-134 (connected-only guru-shishya graph; introduced transit nodes), ADR-138 (transit/isolated musicians — direct ancestor of this problem), ADR-070 (performers[] on youtube entries; first recording surface for transit musicians)

---

## Context

The render pipeline injects two in-memory data structures into `graph.html` at build time:

1. **`elements[]`** — a flat array of every musician node (connected *and* transit) and every edge, produced by `graph_builder.py`. This array is pre-rendered at Python time and carries the full display metadata for every musician: label, born, died, lifespan, era, era colour, instrument shape, bani, sources, tracks, is_composer, is_hindustani flags. Every musician in `graph.json` appears here. Currently 141 nodes (79 lineage + 62 transit, per AUDIT-001 counts).

2. **`cy`** — the Cytoscape instance, initialised from `_cyElements` (a filtered subset of `elements[]` containing only the 79 musicians with at least one `guru-shishya` edge and all edges). Transit musicians are **absent from `cy`**. `cy` owns layout positions, highlight/fade state, degree weights, and traversal queries.

This two-tier architecture was introduced by ADR-134 (connected-only guru-shishya graph) and deepened by ADR-138 (transit musicians). The split was deliberate: the guru-shishya canvas renders only lineage-bearing musicians, while the data layer retains every musician for panel and trail rendering.

The problem is that this architectural split was never formalised as a rule. In the original design every musician had lineage edges and was inserted into `cy`, which therefore served as the single authoritative in-memory store. Panel functions, trail builders, and chip constructors were written to call `cy.getElementById(id).data(field)` freely, because the assumption "if the musician exists, they're in cy" held universally. When ADR-138 shattered that assumption, fixes were applied locally and inconsistently — `buildArtistSpan` (bani_flow.js:1196–1210) and the legacy `youtube[]` branch of `buildTrail` received `elements[]` fallbacks, but every function in `media_player.js` and `panel_components.js`, the structured-recordings branch of `buildTrail`, and the co-performer resolution loop were left querying `cy` exclusively.

AUDIT-001 (`plans/AUDIT-001-cy-panel-coupling.md`) identified **12 findings** across three files (`bani_flow.js`, `media_player.js`, `panel_components.js`) where `cy.getElementById()` or `cy.nodes()` is used as the data-resolution authority for display metadata without an `elements[]` fallback. The impact ranges from silently wrong musician labels and missing era-tint (F-001, F-002, F-005, F-006, F-008, F-009, F-010, F-012), to a hard crash when a transit musician's panel is opened (F-011: `cy.getElementById(nodeId).data()` returns `undefined` on an empty Collection, and every subsequent property access throws `TypeError`).

The canonical fix pattern already exists in `buildArtistSpan` and the `host_id` lookup (bani_flow.js:452–458), but it is unnamed, inlined, and duplicated. The audit confirms that the entire problem reduces to: **there is no single named helper that resolves a musician id to its display data by checking both `cy` and `elements[]`**. Every affected call site is a missed instance of a function that should already exist.

---

## Forces in tension

- **Correctness**: any musician in `elements[]` must be renderable in any panel, trail entry, or chip, regardless of whether they carry lineage edges. Transit musicians exist, are catalogued, appeared in real recordings, and have valid display metadata. Invisible or incorrectly labelled transit musicians are a data fidelity failure.
- **Liveness**: `cy` node data reflects current layout state — degree, computed size, active highlight, fade class. When a musician is in `cy`, the cy node is the authoritative live object. Any fallback must prefer cy when available, not bypass it.
- **Simplicity**: 12 call sites across three files perform ad-hoc two-step lookups using slightly different guard patterns. All 12 should collapse into one canonical helper. The partial fix in `buildArtistSpan` is a proof of concept, not a system.
- **Crash prevention**: F-011 (`buildRecordingsList` in `media_player.js:1938`) can produce a `TypeError` when a transit musician's panel is opened. Crash paths must be eliminated; silent data loss (wrong labels, missing colours) must also be eliminated even where they currently avoid a throw.
- **Ordering stability**: the helper must be defined before any template that uses it — this is a render-pipeline ordering constraint, not a schema constraint.

---

## Decision

### The two-layer contract

**Topology layer — `cy` owns this exclusively:**
- Which musician nodes are rendered in the guru-shishya canvas
- Node size, edge width, layout positions
- Highlight, fade, and selection CSS classes
- Traversal queries: ancestors, descendants, connected components, BFS
- Click handlers that navigate the lineage graph by zooming and selecting cy nodes

**Data layer — `elements[]` owns this exclusively:**
- Musician display label
- Born year, died year, lifespan string
- Era identifier and era colour token
- Instrument identifier and instrument shape token
- Bani string, sources array, tracks array
- `is_composer`, `is_hindustani`, `traditions` flags
- All fields needed to render a chip, trail entry, panel header, or footer

Direct `cy.getElementById(id).data(field)` calls for the purpose of reading display metadata are a **violation of this contract** after this ADR is implemented. They are permitted only for topology operations (highlight, layout, traversal).

### The `resolveNode(id)` helper

A single top-level function named `resolveNode` is the **only permitted way to resolve musician display data in the UI layer**. It must be added to `bani_flow.js` immediately after the `elements` array is defined (before any other function that uses it).

**Signature and logic:**

```js
/**
 * Resolve a musician id to a data-accessor object.
 * Checks cy first (live/layouted state); falls back to elements[] (includes transit musicians).
 * Returns an object with a .data(key) method and a direct .data property for object spread,
 * or null if the id is not found in either store.
 *
 * @param {string|null} id  — musician node id
 * @returns {{ data: function|object, length: number }|null}
 */
function resolveNode(id) {
  if (!id) return null;
  const cyNode = cy.getElementById(id);
  if (cyNode && cyNode.length) return cyNode;            // live cy node — preferred
  const raw = elements.find(function(e) { return !e.data.source && e.data.id === id; });
  if (!raw) return null;                                 // truly unknown musician
  // Wrap raw element in a .data(key) accessor so call sites are uniform.
  return {
    length: 1,
    data: function(key) { return raw.data[key]; },
    _raw: raw.data,   // convenience for object-spread in perfMap
  };
}
```

The wrapper object exposes a `.data(key)` interface identical to a Cytoscape node, so existing call sites change minimally. The `.length` property is always 1 on a non-null return, allowing the existing `(node && node.length)` guard pattern to continue working during a staged rollout.

### Before (anti-pattern — prohibited after implementation):

```js
const node  = cy.getElementById(id);
const label = (node && node.data('label')) || fallback;
const era   = node ? node.data('era') : null;
```

### After (canonical — required everywhere):

```js
const node  = resolveNode(id);   // tries cy first, then elements[]
const label = node ? (node.data('label') || fallback) : fallback;
const era   = node ? node.data('era') : null;
```

### Scope of prohibition

After implementation, **direct `cy.getElementById(id)` calls for data-resolution purposes are prohibited** in:
- `carnatic/render/templates/bani_flow.js`
- `carnatic/render/templates/media_player.js`
- `carnatic/render/templates/panel_components.js`

Topology calls (highlight, fade, BFS, zoom-to-node) continue to use `cy` directly. The audit's Topology Calls — Verified OK table (AUDIT-001 §Topology Calls) enumerates all permitted direct-cy usages.

---

## Consequences

**Positive:**
- Transit musicians (no lineage edges) display correctly in all panels, trail chips, footer chips, co-performer chips, and concert bracket chips — F-001 through F-012 resolved.
- The guru-shishya graph rendering is completely decoupled from panel rendering. The canvas can grow or shrink its connected set (via curation or filter) without affecting musician panel data.
- The crash path in F-011 (`buildRecordingsList`) is eliminated: `resolveNode` returns `null` rather than an empty Collection, and callers guard on null rather than calling `.data()` on undefined.
- The `nodeBorn` global (F-003) can be rebuilt from `elements[]` iteration, covering all 141 musicians rather than only the 79 in `cy`.
- The two duplicate `cy.nodes().forEach(...)` blocks for yt-type track label resolution (F-004, two sites at lines 317–323 and 1620–1627) collapse into a single `resolveYtLabel(vid)` helper backed by `elements[]`.
- `buildArtistSpan`'s inlined two-step pattern (lines 1196–1210) becomes a call to `resolveNode`, retiring the only current correct implementation of this logic in favour of the shared helper.

**Negative:**
- `resolveNode` must be defined before any template that uses it. The render pipeline (`_main.py`) already concatenates JS templates in a fixed order; this helper must land in `bani_flow.js` before `media_player.js` and `panel_components.js` are loaded. The Carnatic Coder must verify concatenation order.
- Call sites that currently spread cy node data into an object literal (`primaryD = hostNode.data()`) will need minor adaptation — the wrapper's `._raw` property provides a plain data object for those sites, or callers can access fields via `.data(key)` individually.

**Neutral:**
- The `elements[]` array is already injected at render time for all musicians — no data pipeline changes needed. No new Python-side code, no schema changes, no new CLI commands.
- `resolveNode` is a pure lookup helper with no side effects. It can be tested in isolation with a mock `cy` and a mock `elements[]` array.

---

## Implementation

Route to: **Carnatic Coder**

1. **Add `resolveNode(id)` to `bani_flow.js`** immediately after the `elements` array is defined (before `nodeBorn` and all subsequent functions). Use the signature and logic above exactly.

2. **Fix F-001** (`bani_flow.js:492–510`, structuredPerfs primary performer): replace `pNode = cy.getElementById(primaryPerformer.musician_id)` with `pNode = resolveNode(primaryPerformer.musician_id)`. Update all downstream field reads to use `pNode.data('born')` etc. This is the highest user-visible impact finding — a perfectly catalogued musician's name being replaced by the concert title.

3. **Fix F-002** (`bani_flow.js:561–570`, perfMap co-performer): replace `cy.getElementById(pf.musician_id)` with `resolveNode(pf.musician_id)`. Update the `coLabel` fallback chain to `resolveNode(pf.musician_id)?.data('label') || pf.unmatched_name || null`. This is the silent-drop finding — no log, no error, musician absent from every chip.

4. **Fix F-007** (`media_player.js:754–756`, buildComposerChip bare call): replace the bare `cy.getElementById(...).data('era')` call with `resolveNode(composerObj.musician_node_id)?.data('era') || null`. This is the crash-risk finding — empty Collection chained without a length guard.

5. **Fix F-011** (`media_player.js:1938`, buildRecordingsList unsafe fallback): replace `cy.getElementById(nodeId).data()` with `resolveNode(nodeId)?._raw`. Guard the function body on `nd` being non-null; return early with an empty panel state if `resolveNode` returns null. This is the hard-crash path.

6. **Fix F-003** (`bani_flow.js:4–5`, `nodeBorn` global): replace `cy.nodes().forEach(...)` with `elements.forEach(function(e) { if (!e.data.source) nodeBorn[e.data.id] = e.data.born; })`. This covers all 141 musicians.

7. **Fix F-004** (`bani_flow.js:317–323` and `1620–1627`, yt-type track label, duplicated): extract a `resolveYtLabel(vid)` helper that iterates `elements[]` (not `cy.nodes()`). Replace both call sites. Also fix the `yt`-type `matchedNodeIds` construction at line 88–92 to include transit musicians via `elements[]`.

8. **Fix remaining findings in file order**: F-005 (`panel_components.js:299–313`), F-006 (`media_player.js:404–424`), F-008 (`media_player.js:889–891`), F-009 (`media_player.js:996–1001`), F-010 (`media_player.js:1047–1058`), F-012 (`media_player.js:2351–2357`). All follow the same pattern: replace `cy.getElementById(id)` with `resolveNode(id)`, update `.data(field)` reads, remove redundant `(node && node.length)` guards where `resolveNode` already returns null for absent musicians.

9. **Retire inlined pattern in `buildArtistSpan`** (`bani_flow.js:1196–1210`): replace the four-line `_cyNode`/`_rawEl` block with a single `const _node = resolveNode(artistRow.nodeId);` and update all downstream reads to `_node?.data('era')` etc.

10. **Run `bani-render`** after all changes. Confirm node and edge counts are unchanged.

11. **Run `pytest carnatic/tests/ -v`** and confirm green before handing off to Git Fiend.
