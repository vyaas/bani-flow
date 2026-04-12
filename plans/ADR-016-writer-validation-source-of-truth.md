# ADR-016: CarnaticWriter Validation Must Read Source Files, Not graph.json

**Status:** Proposed
**Date:** 2026-04-12

---

## Context

Two staleness bugs were reported in [`plans/BUG-graph-json-compositions-sync.md`](plans/BUG-graph-json-compositions-sync.md):

### Problem A — `graph.json["compositions"]` not synced after `add-raga` / `add-composition`

[`write_cli.py add-youtube`](carnatic/write_cli.py) validates `composition_id` and `raga_id`
references by calling [`CarnaticWriter._load_graph()`](carnatic/writer.py:163), which
instantiates [`CarnaticGraph`](carnatic/graph_api.py:43) from `graph.json`. However,
`add-raga` and `add-composition` write only to `compositions.json` — they never touch
`graph.json`. So `graph.json["compositions"]` is stale the moment any composition write
completes. The next `add-youtube` call re-loads the stale `graph.json` and fails validation
with a misleading error message that says "run render.py" — but `render.py` also reads from
`graph.json` (via `CarnaticGraph`), so running it does not fix the problem.

### Problem B — `graph.json["musicians"]` not synced after `add-musician` / `add-youtube`

[`write_cli.py add-youtube`](carnatic/write_cli.py) writes to `musicians.json` only.
[`render.py`](carnatic/render.py:2206) reads musician nodes (including their `youtube[]`
arrays) from `graph.json["musicians"]["nodes"]` via `CarnaticGraph`. Any youtube entries
added via `write_cli.py` are invisible to `render.py` until `graph.json["musicians"]` is
manually synced. The rendered `graph.html` silently omits those entries — no error is
raised.

### Root cause — the validation indirection

The bug is not in `render.py`. The bug is in [`writer.py`](carnatic/writer.py:163):

```python
# writer.py — current (broken)
def _load_graph(self, graph_path: Path | None = None) -> CarnaticGraph:
    p = graph_path or _default_graph_path()
    return CarnaticGraph(p)          # ← reads graph.json, which is stale
```

`CarnaticWriter` uses `CarnaticGraph` (which reads `graph.json`) to validate cross-file
references. But `CarnaticWriter` writes to `musicians.json` and `compositions.json` — not
to `graph.json`. The two files diverge immediately after every write. The validation layer
is reading a stale snapshot of the data it just modified.

### Forces in tension

- **Correctness** — validation must read the same files that writes target. Reading a
  derived cache (`graph.json`) for validation of writes to source files (`musicians.json`,
  `compositions.json`) is structurally unsound.
- **Simplicity** — the validation queries are simple single-file lookups: "does this raga
  id exist in `compositions.json`?" does not require a full `CarnaticGraph` traversal.
- **ADR-013 intent** — ADR-013 established `graph.json` as the single source of truth for
  *rendering and traversal*. It did not establish it as the source of truth for *write
  validation*. The write path predates the traversal layer and was retrofitted to use it
  without recognising the staleness hazard.
- **Immersion** — a Librarian who runs `add-raga` followed immediately by `add-youtube`
  referencing that raga should not encounter a validation error. The workflow must be
  frictionless within a single session.

---

## Pattern

**Boundaries** (Alexander, *The Nature of Order*, Book 1) — a boundary must be a clean
interface, not a leaky coupling. The write path and the traversal path are two distinct
concerns. The write path's boundary is `musicians.json` + `compositions.json`. The
traversal path's boundary is `graph.json`. Mixing them — using the traversal boundary for
write validation — creates a hidden coupling that breaks whenever the two sides diverge.

**Strong Centres** — each source file must be a strong centre: self-describing and
internally consistent. `compositions.json` is the authoritative centre for ragas,
composers, and compositions. Validation of composition references must read that centre
directly, not a derived projection of it.

---

## Decision

**`CarnaticWriter` validation methods must read source files directly, not `graph.json`.**

Specifically:

1. **`add_youtube` raga/composition validation** — replace `CarnaticGraph` lookup with
   direct reads of `compositions.json`. The `_load_graph()` call is removed from
   `add_youtube`. Instead, `add_youtube` accepts a `compositions_path` parameter and reads
   `compositions.json` directly.

2. **`add_youtube` musician validation** — replace `CarnaticGraph` lookup with a direct
   read of `musicians.json` (already being read for the write; the node lookup is free).

3. **`add_composer` musician_node_id validation** — replace `CarnaticGraph` lookup with a
   direct read of `musicians.json`.

4. **`render.py` sync step** — `render.py` must sync `graph.json` from the source files
   before rendering. This is the single sync point that keeps `graph.json` current for
   traversal and rendering. It is idempotent and runs every time `render.py` is invoked.

### Before (broken — validation reads stale `graph.json`)

```python
# writer.py — add_youtube (current)
def add_youtube(self, musicians_path, *, musician_id, url, label,
                composition_id=None, raga_id=None, year=None, version=None,
                graph_path=None):
    video_id = _yt_video_id(url)
    if not video_id:
        return _err(...)

    # ← BUG: loads graph.json, which is stale after any add-raga/add-composition
    g = self._load_graph(graph_path)

    if g.get_musician(musician_id) is None:
        return _err(...)
    if composition_id is not None and g.get_composition(composition_id) is None:
        return _err(...)
    if raga_id is not None and g.get_raga(raga_id) is None:
        return _err(...)

    data = json.loads(musicians_path.read_text(encoding="utf-8"))
    # ... write to musicians.json only
```

### After (fixed — validation reads source files directly)

```python
# writer.py — add_youtube (proposed)
def add_youtube(self, musicians_path, *, musician_id, url, label,
                composition_id=None, raga_id=None, year=None, version=None,
                compositions_path=None):          # ← new param; graph_path removed
    video_id = _yt_video_id(url)
    if not video_id:
        return _err(...)

    # Read musicians.json once — used for both validation and write
    data = json.loads(musicians_path.read_text(encoding="utf-8"))
    nodes: list[dict] = data.get("nodes", [])

    # Validate musician_id directly from the file being written
    known_musician_ids = {n["id"] for n in nodes}
    if musician_id not in known_musician_ids:
        return _err(f'musician_id "{musician_id}" does not exist in nodes[]')

    # Validate composition_id / raga_id directly from compositions.json
    if composition_id is not None or raga_id is not None:
        comp_path = compositions_path or _default_compositions_path()
        comp_data = json.loads(comp_path.read_text(encoding="utf-8"))
        if composition_id is not None:
            known_comp_ids = {c["id"] for c in comp_data.get("compositions", [])}
            if composition_id not in known_comp_ids:
                return _err(
                    f'--composition-id "{composition_id}" does not exist in compositions.json\n'
                    f'       Run add-composition before referencing it here.'
                )
        if raga_id is not None:
            known_raga_ids = {r["id"] for r in comp_data.get("ragas", [])}
            if raga_id not in known_raga_ids:
                return _err(
                    f'--raga-id "{raga_id}" does not exist in compositions.json\n'
                    f'       Run add-raga before referencing it here.'
                )

    # Find the node (already loaded above)
    node = next((n for n in nodes if n["id"] == musician_id), None)
    # ... duplicate check, append, atomic write (unchanged)
```

### `add_composer` musician_node_id validation (before/after)

```python
# Before (broken)
if musician_node_id is not None:
    g = self._load_graph(graph_path)
    if g.get_musician(musician_node_id) is None:
        return _err(...)

# After (fixed)
if musician_node_id is not None:
    m_path = musicians_path or _default_musicians_path()
    m_data = json.loads(m_path.read_text(encoding="utf-8"))
    known_ids = {n["id"] for n in m_data.get("nodes", [])}
    if musician_node_id not in known_ids:
        return _err(
            f'--musician-node-id "{musician_node_id}" does not exist in musicians.json'
        )
```

### `render.py` sync step (new — Problem B fix)

`render.py` must sync `graph.json` from source files before rendering. This is inserted
at the top of `main()`, before `CarnaticGraph` is instantiated:

```python
# render.py — main() (proposed addition)
def _sync_graph_json(graph_file: Path, musicians_file: Path, compositions_file: Path) -> None:
    """
    Sync graph.json["musicians"] and graph.json["compositions"] from the
    canonical source files before rendering. This is the single sync point
    that keeps graph.json current for traversal and rendering.

    Idempotent: safe to call on every render.py invocation.
    Atomic: writes via temp file + os.replace.
    """
    import os, tempfile

    graph = json.loads(graph_file.read_text(encoding="utf-8"))

    if musicians_file.exists():
        m = json.loads(musicians_file.read_text(encoding="utf-8"))
        graph["musicians"] = {
            "nodes": m.get("nodes", []),
            "edges": m.get("edges", []),
        }

    if compositions_file.exists():
        c = json.loads(compositions_file.read_text(encoding="utf-8"))
        graph["compositions"] = {
            "ragas":        c.get("ragas", []),
            "composers":    c.get("composers", []),
            "compositions": c.get("compositions", []),
        }

    text = json.dumps(graph, indent=2, ensure_ascii=False) + "\n"
    dir_ = graph_file.parent
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=dir_, suffix=".tmp", delete=False
    ) as f:
        f.write(text)
        tmp = Path(f.name)
    os.replace(tmp, graph_file)
    print(f"[SYNC] graph.json ← musicians.json + compositions.json")


def main() -> None:
    # ── Step 0: sync graph.json from source files (ADR-016) ──────────────────
    if GRAPH_FILE.exists() and DATA_FILE.exists():
        _sync_graph_json(GRAPH_FILE, DATA_FILE, COMPOSITIONS_FILE)

    # ── ADR-013: load from graph.json via CarnaticGraph ───────────────────────
    if GRAPH_FILE.exists():
        ...  # unchanged
```

### `write_cli.py` — error message correction

The error messages in `add_youtube` currently say:

```
Run render.py after add-raga before referencing it here.
```

After this fix, `render.py` is no longer required between `add-raga` and `add-youtube`.
The corrected message is:

```
Run add-raga before referencing it here.
```

---

## Consequences

### What this enables

- **`add-raga` → `add-youtube` in the same session** works without any manual sync step.
  The Librarian can add a raga and immediately reference it in a youtube entry.
- **`add-musician` → `render.py`** produces a current `graph.html` without manual sync.
  `render.py` syncs `graph.json` from `musicians.json` before rendering.
- **Batch ingest scripts** (`ingest_01_ragas_composers.py`, `ingest_02_compositions.py`,
  `ingest_03_youtube.py`) work correctly in sequence without intermediate `render.py` calls.
- **`graph.json` remains the traversal source of truth** — it is synced on every
  `render.py` invocation, so it is always current for `CarnaticGraph` queries after render.

### What this forecloses

- **`CarnaticGraph` as a validation oracle in `CarnaticWriter`** — the `_load_graph()`
  method in `CarnaticWriter` is no longer used for `add_youtube` or `add_composer`
  validation. It may be removed entirely if no other method uses it.
- **`graph_path` parameter on `add_youtube`** — replaced by `compositions_path`. Any
  caller passing `graph_path=` to `add_youtube` must be updated.

### What this does NOT change

- The `graph.json` schema — unchanged.
- The `CarnaticGraph` API — unchanged.
- The `render.py` output contract — `graph.html` is identical.
- The Librarian's data-entry workflows — the same change-log prefixes and hard constraints
  apply. The only change is that `render.py` is no longer required between `add-raga` and
  `add-youtube` within a session.
- The `recordings/` schema — unchanged.

### Queries that become possible (or unblocked)

| Scenario | Before | After |
|---|---|---|
| `add-raga foo` then `add-youtube --raga-id foo` | ERROR: raga not in graph.json | ✓ works |
| `add-musician bar` then `render.py` | graph.html omits bar's youtube entries | ✓ synced |
| Batch ingest: ragas → compositions → youtube | Fails on youtube step | ✓ works end-to-end |

### Error message quality

The old error message `"Run render.py after add-raga before referencing it here"` was
actively misleading — running `render.py` did not fix the problem. The new message
`"Run add-raga before referencing it here"` is accurate: the only prerequisite is that
the raga exists in `compositions.json`, which `add-raga` ensures.

---

## Implementation

**Agent:** Carnatic Coder

**Files to modify:**

| File | Change |
|---|---|
| [`carnatic/writer.py`](carnatic/writer.py) | `add_youtube`: remove `_load_graph()` call; validate directly from source files. `add_composer`: replace `_load_graph()` with direct `musicians.json` read. Remove `_load_graph()` method if no longer used. |
| [`carnatic/render.py`](carnatic/render.py) | Add `_sync_graph_json()` function. Call it at the top of `main()` before `CarnaticGraph` instantiation. |
| [`carnatic/write_cli.py`](carnatic/write_cli.py) | Update `add-youtube` subcommand: replace `--graph-path` with `--compositions-path` if exposed. Update error message strings. |

**Backward compatibility:** The `graph_path` parameter on `add_youtube` and `add_composer`
is removed. No external callers are known to pass it (it was an internal default-path
parameter). The ingest scripts in `carnatic/playlists/` call `write_cli.py` as a
subprocess and do not pass `--graph-path`, so they are unaffected.

**Testing:** After implementation, the Carnatic Coder should verify:

```bash
# Regression test: add-raga → add-youtube in same session
python3 carnatic/write_cli.py add-raga \
    --id test_raga_adr016 --name "Test Raga ADR016" \
    --source-url "https://example.com" --source-label "Test" --source-type other

python3 carnatic/write_cli.py add-youtube \
    --musician-id tyagaraja \
    --url "https://youtu.be/XXXXXXXXXXX" \
    --label "Test" \
    --raga-id test_raga_adr016
# Expected: [YOUTUBE+] — not ERROR

# Regression test: render.py syncs musicians.json → graph.json
python3 carnatic/render.py
# Expected: [SYNC] graph.json ← musicians.json + compositions.json
#           [RENDERED] carnatic/graph.html
```

**Cleanup:** Once the fix is implemented and verified, the manual workaround scripts
documented in [`plans/BUG-graph-json-compositions-sync.md`](plans/BUG-graph-json-compositions-sync.md)
are superseded. The bug report file should be retained as a historical record but marked
resolved.
