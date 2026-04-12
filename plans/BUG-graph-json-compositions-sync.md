# BUG: graph.json["compositions"] not synced by render.py

**Reported:** 2026-04-12  
**Reported by:** Librarian  
**Severity:** Medium — blocks `add-youtube` when new ragas/compositions were added in the same session  

---

## Summary

`write_cli.py add-youtube` validates `composition_id` and `raga_id` references against
`graph.json` (via `CarnaticGraph`), not against `compositions.json` directly. However,
`render.py` does **not** update the `graph.json["compositions"]` section. This means that
any raga or composition added via `write_cli.py add-raga` / `add-composition` in the same
session is invisible to subsequent `add-youtube` calls, even after `render.py` is run.

---

## Reproduction steps

1. Run `write_cli.py add-raga --id foo ...` → writes to `compositions.json`. ✓
2. Run `python3 carnatic/render.py` → rebuilds `graph.html`. ✓
3. Run `write_cli.py add-youtube --raga-id foo ...` → **ERROR**: `--raga-id "foo" does not exist in compositions.json. Run render.py after add-raga before referencing it here.`

The error message says "run render.py" but render.py was already run and the problem persists.

---

## Root cause

`CarnaticGraph.__init__` (in [`graph_api.py`](../carnatic/graph_api.py)) loads composition
data from `graph.json["compositions"]`:

```python
c = raw.get("compositions", {})
self._ragas:        list[dict] = c.get("ragas", [])
self._composers:    list[dict] = c.get("composers", [])
self._compositions: list[dict] = c.get("compositions", [])
```

`render.py` reads `musicians.json` and `compositions.json` to build `graph.html`, but it
does **not** write the updated ragas/composers/compositions lists back into `graph.json`.
The `graph.json["compositions"]` section therefore remains stale after any
`add-raga` / `add-composer` / `add-composition` call.

---

## Workaround (used in session 2026-04-12)

Manually sync `graph.json["compositions"]` from `compositions.json` after adding new
ragas/compositions, before calling `add-youtube`:

```python
import json, os

with open('carnatic/data/compositions.json') as f:
    comp_data = json.load(f)
with open('carnatic/data/graph.json') as f:
    graph = json.load(f)

# IMPORTANT: must be lists, not dicts
graph['compositions'] = {
    'ragas':        comp_data['ragas'],
    'composers':    comp_data['composers'],
    'compositions': comp_data['compositions'],
}

tmp = 'carnatic/data/graph.json.tmp'
with open(tmp, 'w') as f:
    json.dump(graph, f, indent=2, ensure_ascii=False)
    f.write('\n')
os.replace(tmp, 'carnatic/data/graph.json')
```

**Critical:** the values must be **lists of objects**, not dicts. `CarnaticGraph.__init__`
iterates them with `for r in self._ragas` etc. and will crash with `TypeError: string
indices must be integers, not 'str'` if they are dicts.

---

## Proposed fix

`render.py` should write the updated `compositions.json` content back into
`graph.json["compositions"]` as part of its render pipeline. Specifically, after loading
`compositions.json`, it should update `graph.json["compositions"]` with the three lists
before (or after) writing `graph.html`.

Alternatively, `CarnaticWriter.add_youtube` could validate `composition_id` and `raga_id`
directly against `compositions.json` rather than routing through `graph.json`. This would
eliminate the sync dependency entirely for that validation path.

---

## Impact

Any batch ingest session that adds new ragas or compositions and then immediately calls
`add-youtube` referencing those new IDs will silently fail on those entries. The Librarian
must remember to manually sync `graph.json` as a workaround, which is error-prone.
