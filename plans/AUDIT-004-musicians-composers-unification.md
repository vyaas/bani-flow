# AUDIT-004: Musicians/Composers Unification — Implementation Gaps

**Status**: Open  
**Date**: 2026-05-19  
**Scope**: `carnatic/render/html_generator.py`, `carnatic/render/graph_builder.py`, `carnatic/render/templates/entry_forms.js`, `carnatic/writer.py`, `carnatic/bani_add.py`  
**Requested by**: Orchestrator (symptom: `ns_chidambaram` absent from composer dropdown; `bani-add` rejecting `null` composer_id)

---

## Context

ADR-110 declared that composers are musician nodes — there is no separate `_composers.json`. Every musician is a potential composer; `composer_id` on a composition references `musicians/{id}.json` directly. The compat shim in `bani_add.py` (lines 941–959) routes any legacy `composers` bundle key through the musicians writer.

Despite this, three code locations still treat "composer" as a filtered subset of musicians, breaking ADR-110's intent in practice.

---

## Findings

### Finding 1 — Composer dropdown silently excludes musicians with no prior compositions

**Pattern**: Stale-flag filtering at the display layer.

**Evidence**:

`carnatic/render/graph_builder.py`, line 77:
```python
is_composer = bool(composer_musician_ids and node_id_local in composer_musician_ids)
```
`composer_musician_ids` is the set of `composer_id` values already present in `compositions.json`. A musician who has never been listed as a composer on any existing composition gets `is_composer = False`.

`carnatic/render/html_generator.py`, lines 227–228:
```python
_composer_nodes = [e["data"] for e in elements if e["data"].get("is_composer") and not e["data"].get("source")]
composers_list  = [{"id": d["id"], "name": d.get("label", d["id"]), ...} for d in _composer_nodes]
```
This filter is a truthy `get("is_composer")` — only nodes where `is_composer=True` survive. The resulting `composers_list` is injected as `graphData.composers`.

`carnatic/render/templates/entry_forms.js`, line 2825:
```javascript
const composerOpts = (graphData.composers || []).map(c => ({ value: c.id, label: c.name || c.id }));
```
The Add Composition form consumes `graphData.composers` for its dropdown. Because `ns_chidambaram` has never been a `composer_id` on any composition, his `is_composer` flag is `False`, he is excluded from `composers_list`, and the dropdown is blind to him.

**Impact**: Any musician who has not previously composed is impossible to select as a composer in the UI, creating a chicken-and-egg deadlock.

---

### Finding 2 — `writer.py` rejects `null` composer_id, contradicting the schema

**Pattern**: Missing null guard at validation boundary.

**Evidence**:

`carnatic/writer.py`, lines 1599–1601:
```python
known_musician_ids = {n["id"] for n in _load_all_nodes(_default_musicians_path())}
if composer_id not in known_musician_ids:
    return _err(f'--composer-id "{composer_id}" does not exist in musicians[]')
```
When `composer_id=None`, Python evaluates `None not in known_musician_ids` as `True`, triggering the error.

`carnatic/tests/test_schema_integrity.py`, lines 78–86:
```python
def test_all_composition_composer_ids_exist(graph: CarnaticGraph) -> None:
    """Every composer_id on a composition must exist in musicians (ADR-110; null is allowed)."""
    known_ids = {m["id"] for m in graph.get_all_musicians()}
    for comp in graph.get_all_compositions():
        cid = comp.get("composer_id")
        if cid is not None:
            assert cid in known_ids, ...
```
The test explicitly skips `null`, acknowledging it as valid. The writer contradicts both the test and the schema.

**Impact**: Compositions with unknown or anonymous composers cannot be ingested via `bani-add`.

---

### Finding 3 — `buildComposerMiniForm()` still emits deprecated `composers` bundle key

**Pattern**: Obsolete output path kept after schema migration.

**Evidence**:

`carnatic/render/templates/entry_forms.js`, lines 2858–2861:
```javascript
bundleBtn.addEventListener('click', () => {
  const obj = buildJson();
  addToBundle('composers', obj);       // ← deprecated key
  ...
});
```
`buildJson()` returns `{ id, name, musician_node_id, ... }` — the `name` field (not `label`) and the `musician_node_id` shim field both belong to the retired composer schema.

`carnatic/bani_add.py`, lines 941–959: the compatibility shim detects this key, emits a `WARNING`, maps `name→label`, and drops `musician_node_id` before routing through `_process_musicians`. The shim works, but it exists solely to compensate for this form producing the wrong output.

**Impact**: Every add-composer bundle action triggers a deprecation warning and passes through an unnecessary compat layer. New contributors reading the bundle JSON see a `composers` key that contradicts ADR-110 documentation.

---

## Recommendations

### Rec 1 — Expand `composers_list` to all musician nodes (Coder)

`carnatic/render/html_generator.py` line 227: change the filter from truthy `is_composer` to a field-presence check. The `is_composer` attribute is set on every musician node (True or False) but is absent from raga/composition nodes and edge objects — making its presence a reliable musician-type discriminator.

```python
# Before
_composer_nodes = [e["data"] for e in elements if e["data"].get("is_composer") and not e["data"].get("source")]
# After
_composer_nodes = [e["data"] for e in elements if "is_composer" in e["data"] and not e["data"].get("source")]
```

### Rec 2 — Allow null composer_id in `writer.py` (Coder)

`carnatic/writer.py` line 1600: add an explicit null guard before the membership check.

```python
# Before
if composer_id not in known_musician_ids:
# After
if composer_id is not None and composer_id not in known_musician_ids:
```

### Rec 3 — Align `buildComposerMiniForm()` output to musicians schema (Coder)

`carnatic/render/templates/entry_forms.js`:
- `buildJson()`: rename `name` → `label`, remove `musician_node_id`
- `bundleBtn` handler: change `addToBundle('composers', obj)` → `addToBundle('musicians', obj)`

This makes the bundle output conform to ADR-110 directly, eliminating the need for the compat shim in `bani_add.py` (shim can be retained as a safety net but will no longer trigger).

---

## Routing

All three recommendations are **code-only fixes**. No ADR is required — ADR-110 already mandates the correct behaviour. These are implementation lapses.

Route all three to: **Carnatic Coder**

---

## Learning Log

- 2026-05-19: `is_composer` flag on musician nodes is set post-hoc from existing compositions, not from musician metadata — a new musician with no compositions can never appear in the composer dropdown until at least one composition references them, creating a bootstrap deadlock (AUDIT-004).
