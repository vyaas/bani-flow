# ADR-078: Lecdem Render Indexes — `lecdems_by` and `lecdems_about_*`

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-077 (lecdem schema), ADR-024 (render refactor), ADR-070 (host-implicit indexer pattern)
**Companion ADRs**: ADR-080 (musician panel reads `lecdems_by` + `lecdems_about_musician`), ADR-081 (bani-flow reads `lecdems_about_raga` + `lecdems_about_composition`)

---

## Context

ADR-077 defines a lecdem as a `youtube[]` entry tagged `kind: "lecdem"` with a `subjects` object naming zero or more ragas, compositions, and musicians. The schema is sufficient for storage but produces no panel behaviour on its own. The render pipeline must transform the host-anchored lecdems into **subject-anchored indexes** so the right (musician) and left (bani-flow) panels can answer:

- "Which lecdems did *this musician* lecture?" — needed by ADR-080's "Lecdems by" section.
- "Which lecdems are *about this musician*?" — needed by ADR-080's "Lecdems about" section.
- "Which lecdems discuss *this raga*?" — needed by ADR-081's bani-flow raga surfacing.
- "Which lecdems discuss *this composition*?" — needed by ADR-081's bani-flow composition surfacing.

The first lookup is host-direct (already trivially available via the musician's own `youtube[]`). The other three are inverted indexes: each lecdem appears in as many index buckets as it has subject ids.

This ADR specifies the data structures, where they are built, and how they are surfaced to JS — exactly mirroring the pattern already used for `composition_to_nodes`, `raga_to_nodes`, `musicianToPerformances`, and the listenable set (`build_listenable_set`, `build_composition_raga_to_nodes_lookups` in `carnatic/render/data_transforms.py`).

### Forces

| Force | Direction |
|---|---|
| **One pass over `youtube[]`** | The pipeline already walks every `node.youtube[]` for performer indexing (ADR-070). Lecdem indexing must piggy-back on the same traversal — no additional file reads, no second pass. |
| **Symmetry with existing indexes** | `lecdems_about_musician` should look the same as `composition_to_nodes`: `dict[entity_id, list[LecdemRef]]`. JS-side consumers should not need to learn a new shape. |
| **Subject ordering preserved** | The `subjects.raga_ids[]` order is significant for display ordering in the panel; the indexer must not re-sort. |
| **Validator already guarantees referential integrity** | Per ADR-077 invariant D, every subject id resolves. The indexer can use bare lookups without defensive `if not None` branches at index-build time. |
| **Listenable-set semantics unchanged** | Lecdems must NOT contribute to `listenable` (the index that ADR-055 uses to mark a node as "has audio you can play"). A musician with only lecdems-about-them is not listenable through them — they still need their own recital tracks to be listenable. The `lecdems_about_*` indexes are *discovery* indexes, not *playback* indexes. |
| **Cytoscape data shape additive only** | Existing JS code that reads `node.data` and `compositions[]` must not break. New globals are introduced; nothing is renamed. |

---

## Pattern

**Levels of Scale**. The same atom (a track entry) feeds multiple indexers at different scales: per-musician (host), per-raga (subjects), per-composition (subjects), per-musician-as-subject (subjects). Each indexer is a one-line variant of the same loop.

**Strong Centres preserved**. Each subject id remains the strong centre of its own panel; the lecdem becomes a peripheral chip that points back to its lecturer. The index is the wiring that makes the centre reachable from the periphery.

---

## Decision

### 1 — The `LecdemRef` shape (single source)

A lecdem reference is the minimal payload needed to render a chip and play the entry. It is constructed once per `youtube[]` lecdem entry and reused across every index bucket the entry contributes to.

```python
LecdemRef = {
    "lecturer_id":     str,           # host musician id
    "lecturer_label":  str,           # host musician display name
    "url":             str,           # canonical youtube URL
    "video_id":        str,           # extracted from URL (existing helper)
    "label":           str,           # entry label as authored
    "year":            int | None,    # if present
    "subjects": {
        "raga_ids":        list[str],
        "composition_ids": list[str],
        "musician_ids":    list[str],
    },
}
```

The full `subjects` object is carried inside the ref (not just the bucket key) so the panel renderer can show *all* subjects of a lecdem on every chip — clicking a raga lecdem reveals it also discusses two other ragas and one composition.

### 2 — Four indexes built in one pass

A new function `build_lecdem_indexes(musicians)` is added to `carnatic/render/data_transforms.py`, called once during the render pipeline alongside the existing index builders.

```python
def build_lecdem_indexes(musicians: list[dict]) -> dict:
    by:                dict[str, list[LecdemRef]] = {}   # lecturer_id    → refs
    about_musician:    dict[str, list[LecdemRef]] = {}   # subject mid    → refs
    about_raga:        dict[str, list[LecdemRef]] = {}   # subject rid    → refs
    about_composition: dict[str, list[LecdemRef]] = {}   # subject cid    → refs

    for node in musicians:
        for entry in node.get("youtube", []):
            if entry.get("kind") != "lecdem":
                continue
            ref = _build_lecdem_ref(node, entry)
            by.setdefault(node["id"], []).append(ref)
            for mid in ref["subjects"]["musician_ids"]:
                about_musician.setdefault(mid, []).append(ref)
            for rid in ref["subjects"]["raga_ids"]:
                about_raga.setdefault(rid, []).append(ref)
            for cid in ref["subjects"]["composition_ids"]:
                about_composition.setdefault(cid, []).append(ref)

    return {
        "lecdems_by":                by,
        "lecdems_about_musician":    about_musician,
        "lecdems_about_raga":        about_raga,
        "lecdems_about_composition": about_composition,
    }
```

The function is **pure** (input → output, no side effects), consistent with the Carnatic Coder's stateless-functions principle.

### 3 — Listenable-set is NOT touched

`build_listenable_set` and `build_composition_raga_to_nodes_lookups` skip `kind: "lecdem"` entries explicitly. A guard added at the top of each per-entry loop:

```python
for entry in node.get("youtube", []):
    if entry.get("kind") == "lecdem":
        continue                  # lecdems do not feed recital indexes
    # ... existing recital-track indexing path ...
```

Rationale: a lecdem on Bhairavi does not make its lecturer "listenable through Bhairavi" in the recital sense. ADR-055's no-dead-ends invariant operates on recital surfaces; lecdems live in dedicated panel sections (ADR-080, ADR-081) and follow their own discoverability rules (ADR-081).

### 4 — JS globals injected by `html_generator.py`

The four indexes are serialized as JSON globals into `graph.html`, alongside the existing `composers`, `compositions`, `ragas`, `recordings`, `musicianToPerformances`:

```js
const lecdemsBy               = { /* lecturer_id → LecdemRef[] */ };
const lecdemsAboutMusician    = { /* subject mid → LecdemRef[] */ };
const lecdemsAboutRaga        = { /* subject rid → LecdemRef[] */ };
const lecdemsAboutComposition = { /* subject cid → LecdemRef[] */ };
```

Naming: camelCase to match the existing JS-globals style (`musicianToPerformances`, not `musician_to_performances`). The JSON keys inside each object remain snake_case ids — they are entity ids, not JS identifiers.

### 5 — Cytoscape `node.data` is NOT touched

The four indexes live as standalone globals, not as fields on individual `node.data` objects. Reasons:

- **Avoids data duplication**: a lecdem with three musician subjects would otherwise appear inside four `node.data.lecdems_about` arrays. The standalone-global pattern lets each `LecdemRef` object exist exactly once in memory and be referenced from multiple buckets.
- **Consistent with `musicianToPerformances`**: the existing pattern for "subject-id → ref-list" lookups already lives outside `node.data`. Following the precedent reduces cognitive load.
- **Cytoscape filters do not need lecdem awareness**: graph-canvas filtering (era, instrument, search) operates on `node.data`. Lecdems are a panel-only concern; they should not influence node visibility.

### 6 — Lecdem chip identity is rendered, not stored

The `LecdemRef` does NOT carry a `kind: "lecdem"` discriminator field. The bucket name (`lecdemsBy` etc.) and the source field (`youtube[].kind`) already establish identity. The chip-class assignment is the renderer's job (ADR-079).

---

## Consequences

### Positive

- **One traversal, four indexes**: indexing cost is O(total youtube entries × average subjects per lecdem). For the current corpus (≈3000 youtube entries, of which ≈30 will be lecdems with avg 2 subjects), this is negligible.
- **Panel renderers become trivial lookups**: `lecdemsAboutRaga[ragaId] || []` is the entire data fetch for ADR-081's bani-flow lecdem strip.
- **Memory footprint is bounded**: `LecdemRef` objects are shared by reference across buckets; only the bucket maps grow.
- **No coupling to the listenable index**: ADR-055's no-dead-ends logic remains stable — lecdems are an additive surface, not a redefinition of "listenable".

### Negative / accepted tradeoffs

- **Four new globals**: the `graph.html` JS namespace gains four name bindings. Acceptable — the existing pattern already has six (`elements`, `ragas`, `composers`, `compositions`, `recordings`, `musicianToPerformances`).
- **Subject mutability requires re-render**: changing a lecdem's `subjects.raga_ids[]` requires `bani-render` to rebuild all four indexes. Standard render-gate behaviour; no surprise.
- **`LecdemRef.lecturer_label` duplicates `musicians[id].label`**: minor denormalisation in service of avoiding a per-render JS lookup. Same precedent as `musicianToPerformances` carrying `musician_label`.

### Risks

- **A future kind beyond `lecdem`** would need its own index family. Mitigated by naming the function `build_lecdem_indexes` (specific, not generic) — a future `build_tani_indexes` is a clean parallel.
- **Index drift across renders**: if a librarian deletes a raga that a lecdem references, the validator catches it (ADR-077 invariant D) before the render. The indexer never sees broken refs.

---

## Implementation

1. **`carnatic/render/data_transforms.py`** (Coder)
   - Add `build_lecdem_indexes(musicians) -> dict` (the function above).
   - Add the `kind == "lecdem"` skip-guard to `build_listenable_set` and `build_composition_raga_to_nodes_lookups`.

2. **`carnatic/render/_main.py`** (Coder)
   - Call `build_lecdem_indexes` and thread its output dict through to `html_generator`.

3. **`carnatic/render/html_generator.py`** (Coder)
   - Serialise the four indexes as JSON into a new `<script>` block:
     ```js
     const lecdemsBy               = {{ lecdems_by | tojson }};
     const lecdemsAboutMusician    = {{ lecdems_about_musician | tojson }};
     const lecdemsAboutRaga        = {{ lecdems_about_raga | tojson }};
     const lecdemsAboutComposition = {{ lecdems_about_composition | tojson }};
     ```
   - Place above the panel-renderer scripts so they are in scope at first render.

4. **`carnatic/render/README.md`** (Coder)
   - Document the four globals in the existing "JS globals injected by render" reference.

5. **Verification**
   - `bani-render` exits 0 on current data: all four indexes serialise as `{}` (no lecdems exist yet).
   - Add one test lecdem to a sandbox musician with mixed subjects; re-render; inspect `graph.html`; confirm the lecdem appears under exactly the expected bucket keys; confirm `listenable` is unchanged; revert before commit.
   - `python3 carnatic/cli.py validate` continues to pass.
