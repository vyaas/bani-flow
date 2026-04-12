# ADR-013: Single Source of Truth, Traversal Layer, and Testing Ground

**Status:** Accepted
**Date:** 2026-04-12
**Implemented:** 2026-04-12

---

## Context

The user has asked us to step back and examine the structural health of the codebase before adding more data. Three concerns were named:

1. **No single source of truth.** Data is spread across [`carnatic/data/musicians.json`](carnatic/data/musicians.json), [`carnatic/data/compositions.json`](carnatic/data/compositions.json), and the [`carnatic/data/recordings/`](carnatic/data/recordings/) directory. A `Musician` node in `musicians.json` has no direct pointer to the concerts it appears in — that join is reconstructed at render time inside [`render.py`](carnatic/render.py) by scanning every recording file. The graph is not self-contained: you cannot answer "what concerts did Madurai Mani Iyer play?" by reading `musicians.json` alone.

2. **No traversal API.** All graph traversal logic lives inside the 2200-line [`render.py`](carnatic/render.py) as Python dicts built at compile time, and inside the 1200-line JavaScript blob baked into [`graph.html`](carnatic/graph.html). There is no reusable, importable module that exposes atomic traversal methods. Rendering and querying are fused. This makes it impossible to write tests, impossible to reuse logic in scripts, and impossible to reason about correctness independently of the browser.

3. **No tests.** There is no test suite. The only validation is "does `render.py` run without crashing?" and "does the graph look right in the browser?" This is insufficient for a knowledge graph that is growing in complexity.

The concept map (Excalidraw diagram) shows the following first-class citizens and their relationships:

```
Musician ──by──> Recording
Musician ──performs──> Concert
Musician ──teaches──> Musician  (guru-shishya edge)
Concert ──contains──> Session
Session ──has──> Performance
Performance ──of──> Composition
Composition ──in──> Raga
Composition ──by──> Composer
Composer ──is──> Musician (optional)
Recording ──is──> Concert | SinglePerformance
```

The forces in tension are:

- **Immersion** — the rasika needs to traverse from a musician to their concerts to individual performances to ragas and back, in one coherent motion. Today this requires non-trivial code that is not exposed as a public API.
- **Fidelity to the oral tradition** — the sitting (lesson, concert, AIR session) must be a first-class citizen, not a derived artefact reconstructed at render time.
- **Queryability** — every structural decision must support at least one concrete query a rasika or scholar would actually ask.
- **Testability** — the graph must have a coherent enough ground that we can write assertions about it.
- **Rendering independence** — `render.py` should be a thin consumer of a traversal API, not the place where the graph's semantics live.

---

## Pattern

**Levels of Scale** (Alexander, *A Pattern Language*, Pattern 26) — a living structure must have coherent centres at every scale: the tradition as a whole, the bani, the lineage chain, the individual musician, the single recording, the moment in a raga. The current architecture has good structure at the data-file level and at the browser-rendering level, but the *middle scale* — the traversal layer that connects raw JSON to rendered HTML — is missing. Without it, the graph has no skeleton.

**Strong Centres** — each entity (Musician, Concert, Recording, Composition, Raga) must be a strong centre: self-describing, addressable by a stable ID, and reachable from every other centre via a named, typed relationship. Today `musicians.json` nodes are strong centres; concerts are not — they exist only as files in a directory, with no back-pointer from the musician who performed in them.

**Boundaries** — the boundary between data and rendering must be a clean interface, not a 2200-line script that does both. The traversal layer is that boundary.

---

## Decision

We propose a three-phase refactor. Each phase is independently deliverable and does not break the existing render pipeline.

---

### Phase 1 — Unified Database File (`carnatic/data/graph.json`)

**The problem:** `musicians.json` has no notion of concerts. `recordings/` files have no back-pointer to the musician graph. `compositions.json` is a separate island. The three files are joined only inside `render.py`.

**The solution:** Introduce a single top-level database file, [`carnatic/data/graph.json`](carnatic/data/graph.json), that is the **one source of truth**. It contains:

- All musician nodes and edges (currently in `musicians.json`)
- All ragas, composers, and compositions (currently in `compositions.json`)
- **Pointers** to recording files (not the recording data itself — that stays in `recordings/`)

The recording files remain as separate files (one per concert) because they are large, independently editable, and already have a stable schema. `graph.json` holds a `recording_refs` array that lists every recording ID and its file path, making the full graph self-describing without inlining the recording data.

**Before (three separate files, no cross-references):**

```
musicians.json          → nodes[], edges[]
compositions.json       → ragas[], composers[], compositions[]
recordings/*.json       → one recording object per file (no back-pointer)
```

**After (one source of truth with pointers):**

```json
// carnatic/data/graph.json
{
  "schema_version": 1,
  "musicians": {
    "nodes": [ /* same as musicians.json nodes[] */ ],
    "edges": [ /* same as musicians.json edges[] */ ]
  },
  "compositions": {
    "ragas":        [ /* same as compositions.json ragas[] */ ],
    "composers":    [ /* same as compositions.json composers[] */ ],
    "compositions": [ /* same as compositions.json compositions[] */ ]
  },
  "recording_refs": [
    {
      "id":   "jamshedpur_1961_madurai_mani_iyer",
      "path": "recordings/jamshedpur_1961_madurai_mani_iyer.json",
      "title": "Madurai Mani Iyer — Jamshedpur, 1961",
      "date":  "1961",
      "primary_musician_ids": ["madurai_mani_iyer", "lalgudi_jayaraman"]
    }
  ]
}
```

The `recording_refs` array is the **index** of all concerts. It is maintained by the Librarian whenever a new recording file is created. It answers the query "what concerts did musician X play?" without scanning every recording file.

`musicians.json` and `compositions.json` are **retained as derived files** during the migration period, generated from `graph.json` by a migration script. After migration is complete they become read-only aliases. The `youtube[]` arrays in `musicians.json` are migrated to `recordings/` per the existing [`unified_recordings_architecture.md`](plans/unified_recordings_architecture.md) plan (ADR already proposed there).

---

### Phase 2 — Traversal Layer (`carnatic/graph_api.py`)

**The problem:** All traversal logic lives inside `render.py` as private functions. There is no importable API. You cannot write `from carnatic.graph_api import get_concerts_for_musician` in a test or a script.

**The solution:** Extract a pure, stateless traversal module [`carnatic/graph_api.py`](carnatic/graph_api.py) that exposes atomic methods. The module loads `graph.json` once and provides typed traversal functions. `render.py` becomes a thin consumer of this API.

**Proposed API surface (atomic traversal methods):**

```python
# carnatic/graph_api.py

class CarnaticGraph:
    """
    Immutable in-memory representation of the Carnatic knowledge graph.
    Loaded once from graph.json + recordings/*.json.
    All methods are pure (no side effects, no I/O after __init__).
    """

    def __init__(self, graph_json_path: Path): ...

    # ── Musician traversal ────────────────────────────────────────────
    def get_musician(self, musician_id: str) -> dict | None
    def get_all_musicians(self) -> list[dict]
    def get_gurus_of(self, musician_id: str) -> list[dict]
    def get_shishyas_of(self, musician_id: str) -> list[dict]
    def get_lineage_chain(self, musician_id: str, depth: int = 5) -> list[dict]
    def get_musicians_by_era(self, era: str) -> list[dict]
    def get_musicians_by_instrument(self, instrument: str) -> list[dict]
    def get_musicians_by_bani(self, bani: str) -> list[dict]

    # ── Recording traversal ───────────────────────────────────────────
    def get_recording(self, recording_id: str) -> dict | None
    def get_all_recordings(self) -> list[dict]
    def get_recordings_for_musician(self, musician_id: str) -> list[dict]
    def get_performances_for_musician(self, musician_id: str) -> list[dict]
    def get_recordings_for_composition(self, composition_id: str) -> list[dict]
    def get_recordings_for_raga(self, raga_id: str) -> list[dict]

    # ── Composition traversal ─────────────────────────────────────────
    def get_composition(self, composition_id: str) -> dict | None
    def get_raga(self, raga_id: str) -> dict | None
    def get_composer(self, composer_id: str) -> dict | None
    def get_compositions_by_raga(self, raga_id: str) -> list[dict]
    def get_compositions_by_composer(self, composer_id: str) -> list[dict]
    def get_musicians_who_performed(self, composition_id: str) -> list[dict]
    def get_musicians_who_performed_raga(self, raga_id: str) -> list[dict]

    # ── Cross-domain traversal ────────────────────────────────────────
    def get_bani_flow(self, composition_id: str) -> list[dict]
    """
    Returns a chronologically sorted list of PerformanceRef objects
    for a given composition, across all recordings and all musicians.
    This is the data that powers the Bani Flow listening trail.
    """

    def get_concert_programme(self, recording_id: str) -> dict
    """
    Returns a structured programme: recording metadata + sessions +
    performances with resolved composition/raga/composer names.
    """
```

**Key design principles:**

- **Pure functions after init.** `CarnaticGraph.__init__` loads all data. Every method after that is a pure lookup — no file I/O, no mutation.
- **Lazy recording load.** Recording files are loaded on first access and cached. The `recording_refs` index in `graph.json` is used to locate files without scanning the directory.
- **Typed return values.** Every method returns plain Python dicts (same shape as the JSON objects), not custom classes. This keeps the API simple and JSON-serialisable.
- **`render.py` becomes a consumer.** The existing `build_recording_lookups()`, `build_composition_lookups()`, and `build_elements()` functions in `render.py` are rewritten to call `CarnaticGraph` methods. The render pipeline becomes:

```python
# render.py (after refactor)
from carnatic.graph_api import CarnaticGraph

def main():
    g = CarnaticGraph(Path("carnatic/data/graph.json"))
    elements = build_elements(g)
    html = render_html(g, elements)
    OUT_FILE.write_text(html)
```

---

### Phase 3 — Test Suite (`carnatic/tests/`)

**The problem:** There are no tests. The only validation is visual inspection of `graph.html`.

**The solution:** Once `graph_api.py` exists, tests become trivial to write. The test suite validates:

1. **Schema integrity** — every `musician_id` in every recording file exists in `graph.json`. Every `composition_id` and `raga_id` in every performance exists in `compositions`. Every `composer_id` exists in `composers`. Every `source` URL is non-empty.

2. **Graph topology** — no orphan nodes (every node has at least one edge or one recording). No self-loops. No duplicate `(source, target)` edge pairs.

3. **Traversal correctness** — `get_gurus_of("madurai_mani_iyer")` returns the expected set. `get_recordings_for_musician("lalgudi_jayaraman")` includes `jamshedpur_1961_madurai_mani_iyer`. `get_bani_flow("maakelara_vicaaramu")` returns at least one entry.

4. **Referential integrity** — `get_recording("nonexistent_id")` returns `None`, not an exception. `get_musician("tyagaraja")` returns the Trinity node.

**Proposed test structure:**

```
carnatic/tests/
  __init__.py
  test_schema_integrity.py   ← referential integrity across all files
  test_graph_topology.py     ← no orphans, no self-loops, no duplicate edges
  test_traversal.py          ← known-good traversal assertions
  test_bani_flow.py          ← Bani Flow trail correctness
  conftest.py                ← shared CarnaticGraph fixture
```

**Test runner:** `pytest` (already available in the Python ecosystem; no new dependencies beyond `pytest`).

**Sample test:**

```python
# carnatic/tests/test_schema_integrity.py

def test_all_recording_musician_ids_exist(graph):
    """Every musician_id in every recording must exist in graph.musicians."""
    known_ids = {n["id"] for n in graph.get_all_musicians()}
    for rec in graph.get_all_recordings():
        for session in rec.get("sessions", []):
            for performer in session.get("performers", []):
                mid = performer.get("musician_id")
                if mid is not None:
                    assert mid in known_ids, (
                        f"Recording {rec['id']}: musician_id '{mid}' not in graph"
                    )

def test_all_performance_composition_ids_exist(graph):
    """Every composition_id in every performance must exist in compositions."""
    known_ids = {c["id"] for c in graph.get_all_compositions()}
    for rec in graph.get_all_recordings():
        for session in rec.get("sessions", []):
            for perf in session.get("performances", []):
                cid = perf.get("composition_id")
                if cid is not None:
                    assert cid in known_ids, (
                        f"Recording {rec['id']} perf {perf['performance_index']}: "
                        f"composition_id '{cid}' not in compositions"
                    )
```

---

## Consequences

### What this enables

- **Single source of truth.** `graph.json` is the canonical database. Any agent or script that needs to understand the full graph reads one file (plus the recording files it points to).
- **Traversal without render.** A script can answer "what concerts did Lalgudi Jayaraman play?" by calling `graph.get_recordings_for_musician("lalgudi_jayaraman")` — no browser, no HTML, no Cytoscape.
- **Testable correctness.** Schema integrity, referential integrity, and traversal correctness are all machine-checkable. The test suite runs in seconds.
- **Rendering as a thin consumer.** `render.py` shrinks from 2200 lines to ~400 lines. The HTML template becomes a pure presentation layer.
- **Future extensibility.** Adding new association types (lessons, lecture-demonstrations, institutional affiliations) means adding new methods to `CarnaticGraph` and new test cases — not modifying the render pipeline.
- **LLM-friendly workflow.** The Librarian agent can call `graph.get_musician("id")` to validate before patching. The Carnatic Coder can write tools that import `CarnaticGraph` directly.

### What this forecloses

- **`musicians.json` as the primary edit target.** After migration, `graph.json` is the edit target. `musicians.json` becomes a derived file. Agents must be updated to patch `graph.json`, not `musicians.json`.
- **`render.py` as the join layer.** The current pattern of building lookup dicts inside `render.py` is replaced by `CarnaticGraph` methods. Any agent that calls `render.py` functions directly must be updated.

### What this does NOT change

- The recording file schema (`recordings/*.json`) — unchanged.
- The `graph.html` rendering output — unchanged from the user's perspective.
- The `compositions.json` schema — unchanged; it is absorbed into `graph.json` as a sub-object.
- The Librarian's data-entry workflows — the same change-log prefixes and hard constraints apply; only the target file changes from `musicians.json` to `graph.json`.

### Queries that become possible

| Query | Method |
|---|---|
| What concerts did Lalgudi Jayaraman play? | `get_recordings_for_musician("lalgudi_jayaraman")` |
| Who performed Entharo Mahanubhavulu? | `get_musicians_who_performed("entharo_mahanubhavulu")` |
| What is the Bani Flow for Kalyani? | `get_musicians_who_performed_raga("kalyani")` |
| Who are Semmangudi's shishyas? | `get_shishyas_of("semmangudi_srinivasa_iyer")` |
| What is the full lineage chain from Tyagaraja to TM Krishna? | `get_lineage_chain("tm_krishna", depth=10)` |
| What compositions did Madurai Mani Iyer perform at Jamshedpur? | `get_concert_programme("jamshedpur_1961_madurai_mani_iyer")` |
| Are all musician_ids in recordings valid? | `test_schema_integrity.py` |

---

## Implementation

### Phase 1 — `graph.json` migration
**Agent:** Carnatic Coder (writes migration script) + Librarian (validates data)  
**Deliverable:** `carnatic/data/graph.json`, migration script `carnatic/migrate_to_graph_json.py`  
**Backward compatibility:** `musicians.json` and `compositions.json` remain as read-only aliases during transition; `render.py` reads from `graph.json` first, falls back to legacy files.

### Phase 2 — `graph_api.py` traversal layer
**Agent:** Carnatic Coder  
**Deliverable:** `carnatic/graph_api.py` with the full `CarnaticGraph` class  
**Backward compatibility:** `render.py` is refactored to use `CarnaticGraph`; HTML output is identical.

### Phase 3 — Test suite
**Agent:** Carnatic Coder  
**Deliverable:** `carnatic/tests/` directory with `pytest` suite  
**Dependency:** Phase 2 must be complete (tests import `CarnaticGraph`).

---

## Migration Pain Assessment

The user explicitly accepted migration pain now rather than later. The pain points are:

1. **`graph.json` authoring.** The Librarian must patch `graph.json` instead of `musicians.json`. The schema is identical — only the file path and the wrapping object key change. The READYOU files must be updated.

2. **`render.py` refactor.** The existing `build_recording_lookups()`, `build_composition_lookups()`, and `build_elements()` functions are replaced by `CarnaticGraph` method calls. This is a rewrite of ~400 lines of Python, but the output contract (the JSON blobs injected into `graph.html`) is unchanged.

3. **Agent instruction updates.** The Librarian's `customInstructions` in `.roomodes` must be updated to reference `graph.json` as the edit target. The Carnatic Coder's instructions must reference `graph_api.py` as the traversal API.

4. **`youtube[]` migration.** The existing `youtube[]` arrays in `musicians.json` must be migrated to `recordings/` per the existing [`unified_recordings_architecture.md`](plans/unified_recordings_architecture.md) plan. This is a prerequisite for Phase 1 — `graph.json` should not carry `youtube[]` arrays.

---

## Sequencing Recommendation

```
Step 0 (now):     Migrate youtube[] → recordings/  (per unified_recordings_architecture.md)
Step 1 (Phase 1): Write migrate_to_graph_json.py; produce graph.json
Step 2 (Phase 1): Update render.py to read graph.json (backward-compatible fallback)
Step 3 (Phase 2): Write graph_api.py; refactor render.py to use it
Step 4 (Phase 3): Write test suite; run against current data
Step 5 (cleanup): Remove musicians.json, compositions.json as primary files;
                  update all READYOU.md files and .roomodes agent instructions
```

Each step is independently committable and independently testable. The graph remains renderable at every step.

---

## Resolved Decisions

The following open questions were resolved by the project owner:

1. **`graph.json` holds refs only, not inline recording data.**
   Recording files remain as separate files in `recordings/`. `graph.json` carries a `recording_refs` array (id, path, title, date, primary_musician_ids) as an index. This preserves the one-file-per-recording LLM workflow and keeps `graph.json` at a manageable size.

2. **`CarnaticGraph` is a class, not a module of functions.**
   Instance state holds the loaded data. The lazy-loading pattern is clean. The `conftest.py` test fixture creates one shared `CarnaticGraph` instance for the entire test session.

3. **`recording_refs` is auto-generated by `carnatic/build_recording_index.py`.**
   This script scans `recordings/*.json` and writes the `recording_refs` array into `graph.json`. The Librarian runs it after adding any new recording file. Manual maintenance of the index is explicitly forbidden — the script is the only writer of `recording_refs`.

4. **`pyproject.toml` gets a `[tool.pytest.ini_options]` section.**
   The Carnatic Coder adds `testpaths = ["carnatic/tests"]` and `python_files = ["test_*.py"]` to the existing [`pyproject.toml`](pyproject.toml). No new dependency files are needed beyond adding `pytest` to the dev dependencies.
