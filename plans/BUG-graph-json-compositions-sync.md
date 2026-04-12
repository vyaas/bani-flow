# BUG: graph.json["compositions"] and ["musicians"] not synced by render.py

**Reported:** 2026-04-12
**Reported by:** Librarian
**Severity:** High — `graph.json["musicians"]` staleness causes render.py to silently omit youtube entries from graph.html; `graph.json["compositions"]` staleness blocks `add-youtube` validation

---

## Summary

Two separate staleness problems exist in `graph.json`:

### Problem A — `graph.json["compositions"]` not synced
`write_cli.py add-youtube` validates `composition_id` and `raga_id` references against
`graph.json` (via `CarnaticGraph`), not against `compositions.json` directly. However,
`render.py` does **not** update the `graph.json["compositions"]` section. This means that
any raga or composition added via `write_cli.py add-raga` / `add-composition` in the same
session is invisible to subsequent `add-youtube` calls, even after `render.py` is run.

### Problem B — `graph.json["musicians"]` not synced (discovered 2026-04-12)
`render.py` reads musician nodes (including their `youtube[]` arrays) from
`graph.json["musicians"]["nodes"]`, **not** from `musicians.json`. However,
`write_cli.py add-youtube` writes to `musicians.json` only. This means that any youtube
entries added via `write_cli.py` are invisible to `render.py` until `graph.json["musicians"]`
is manually synced. The rendered `graph.html` will silently omit those entries — no error
is raised, the graph just shows stale data.

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

### Workaround A — sync `graph.json["compositions"]`

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

### Workaround B — sync `graph.json["musicians"]`

After any `write_cli.py add-youtube` (or other musician mutation) session, sync
`graph.json["musicians"]` from `musicians.json` before running `render.py`:

```python
import json, os

with open('carnatic/data/musicians.json') as f:
    musicians_data = json.load(f)
with open('carnatic/data/graph.json') as f:
    graph = json.load(f)

# graph.json["musicians"] = {"nodes": [...], "edges": [...]}
graph['musicians'] = {
    'nodes': musicians_data['nodes'],
    'edges': musicians_data['edges'],
}

tmp = 'carnatic/data/graph.json.tmp'
with open(tmp, 'w') as f:
    json.dump(graph, f, indent=2, ensure_ascii=False)
    f.write('\n')
os.replace(tmp, 'carnatic/data/graph.json')
```

This must be done **before** `render.py` is run, otherwise the rendered `graph.html` will
silently show stale youtube entries with no error.

---

## Proposed fix

The cleanest fix is to make `render.py` the single sync point: before writing `graph.html`,
it should:

1. Read `musicians.json` and write its `nodes`/`edges` into `graph.json["musicians"]`
2. Read `compositions.json` and write its `ragas`/`composers`/`compositions` into `graph.json["compositions"]`

This makes `render.py` idempotent and eliminates both manual sync steps.

Alternatively, `CarnaticWriter` could write to both `musicians.json` and `graph.json`
atomically on every mutation, keeping them permanently in sync (true dual-write).

A third option: deprecate `graph.json` as a source of truth for `render.py` and have
`render.py` read `musicians.json` + `compositions.json` directly (reverting to the legacy
path). This is the simplest fix but requires updating the ADR-013 decision.

---

## Impact

- **Problem A**: Any batch ingest session that adds new ragas or compositions and then
  immediately calls `add-youtube` referencing those new IDs will silently fail on those
  entries.
- **Problem B**: Any batch ingest session that adds youtube entries via `write_cli.py` will
  produce a stale `graph.html` that silently omits those entries. No error is raised — the
  graph just shows old data. This is the more dangerous failure mode because it is invisible.

The Librarian must remember to manually sync both sections of `graph.json` after every
write session, which is error-prone and was missed in the 2026-04-12 session.
