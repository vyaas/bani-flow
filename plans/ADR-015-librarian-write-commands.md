# ADR-015: Atomic Write Commands for the Librarian CLI

**Status:** Accepted
**Date:** 2026-04-12

---

## Context

### The problem

ADR-014 gave the Librarian a complete set of **read** commands. The Librarian can now
orient, query, and validate without reading large JSON files. But the *write* side of
the workflow remains manual: the Librarian constructs `apply_diff` blocks by hand,
serialising JSON fragments from memory and inserting them at the correct position in a
3,000-line file.

This is the most error-prone step in the entire pipeline. Three failure modes recur:

1. **Malformed JSON.** A missing comma, a trailing comma, or a mismatched brace silently
   corrupts the file. The error is only caught when `render.py` fails — sometimes much
   later in the session.

2. **Referential integrity violations.** The Librarian adds a `youtube` entry with a
   `raga_id` that does not exist in `compositions.json`, or an edge whose `target` is
   not yet a node. The `validate` command catches this *after* the write; the write
   command should prevent it *before*.

3. **Partial writes under batch workloads.** When ingesting a playlist of 50 videos
   (e.g. from `playlist_meta.py` output), the Librarian must apply 50 separate diffs.
   If entry 23 fails, entries 1–22 are already written and 24–50 are not. The graph is
   in an inconsistent state with no clean rollback path.

### The opportunity

`playlist_meta.py` produces a structured list of `{id, url, title, description,
uploader, duration, upload_date}` dicts — exactly the shape needed to drive a batch
`add-youtube` command. The Librarian's job is to *interpret* each entry (identify the
musician, raga, composition) and *call* a method. The method handles serialisation,
duplicate detection, and referential integrity. The LLM is the caller, not the
serialiser.

This is the pattern that scales: as new data sources appear (website parsers, AIR
archives, concert programme PDFs), the Librarian's role remains constant — interpret
and call — while the methods absorb the schema complexity.

### Governing constraint

**All write methods must be stateless.** Each command:

1. Reads the current source file into memory.
2. Applies a single, validated transformation.
3. Writes the result atomically (write to a temp file, then rename).
4. Exits 0 on success, 1 on validation failure (with a clear error message).

The source files are `carnatic/data/musicians.json` and `carnatic/data/compositions.json`.
`carnatic/data/graph.json` is a **derived artefact** — write commands never touch it
directly. After any write session, the Librarian runs `python3 carnatic/render.py` to
rebuild `graph.json` and `graph.html`.

---

## Pattern

**Positive Outdoor Space** (Alexander, *A Pattern Language*, Pattern 106) — every write
command creates a well-bounded, positive space of valid state. The graph cannot be left
in a negative (invalid, partially-written) state because each command either completes
the full transition or aborts with the original file untouched.

**Strong Centres** — each write command is a named, purposeful operation with a
predictable contract: typed inputs in, a single atomic file write out, a terse change
log line to stdout. The Librarian composes these commands without understanding the
internals of the JSON serialiser.

**Levels of Scale** — the write commands operate at the correct scale for each
operation. Adding a single `youtube` entry is a different scale from adding a musician
node, which is a different scale from ingesting a full playlist. The command set covers
all three scales without conflating them.

---

## Decision

### Tool: `carnatic/write_cli.py`

A new entry-point script, parallel to `carnatic/cli.py`, that exposes all Librarian
write operations as subcommands. It is a thin wrapper over a new `CarnaticWriter` class
(see below). Every subcommand:

- Reads the relevant source file.
- Validates all inputs against the current graph state (using `CarnaticGraph` for
  referential integrity checks).
- Applies the transformation.
- Writes atomically.
- Prints a change-log line to stdout (same prefix vocabulary as `READYOU.md`).
- Exits 0 on success, 1 on any validation failure.

**Design principles:**

1. **Stateless methods.** `CarnaticWriter` methods are pure functions of their inputs
   and the current file state. No global state, no session state, no partial writes.

2. **Atomic file writes.** Every write uses the write-to-temp-then-rename pattern.
   A crash mid-write leaves the original file intact.

3. **Referential integrity before write.** Every foreign key (`musician_id`,
   `raga_id`, `composition_id`, `composer_id`) is validated against the current graph
   state *before* the file is touched. A bad reference aborts with exit 1.

4. **Idempotent duplicate detection.** Every command checks for the relevant duplicate
   condition before writing. Running the same command twice is safe — the second
   invocation exits 0 with a `SKIP (duplicate)` message.

5. **Source files only.** `write_cli.py` writes to `musicians.json` and
   `compositions.json` only. It never touches `graph.json` or any recording file.
   Recording files are written by the Librarian directly (they are self-contained and
   small enough that hand-construction is safe).

6. **Invokable from project root.** All commands run as
   `python3 carnatic/write_cli.py <subcommand> [args]`.

---

### Subcommand taxonomy

#### Group 1 — Musician graph writes

---

##### `add-musician`

Add a new musician node to `musicians.json`.

```
python3 carnatic/write_cli.py add-musician \
  --id           <snake_case_id>          \
  --label        "Display Name"           \
  --era          <era_enum>               \
  --instrument   <instrument_enum>        \
  --born         <year|null>              \
  --died         <year|null>              \
  --bani         "bani label"             \
  --source-url   "https://..."            \
  --source-label "Wikipedia"              \
  --source-type  wikipedia
```

**Validation before write:**
- `id` does not already exist in `nodes[]`.
- `era` is a valid era enum value.
- `instrument` is a valid instrument enum value (or a new value — new values are
  accepted freely, as per the schema).
- `--source-url` is required (hard constraint: no node without a source).

**Output (success):**
```
[NODE+]  added: abhishek_raghuram — Abhishek Raghuram (born 1984, contemporary, vocal)
```

**Output (duplicate):**
```
SKIP (duplicate)  abhishek_raghuram already exists
```

**Output (validation failure):**
```
ERROR  --era "legendary" is not a valid era value
       Valid values: trinity, bridge, golden_age, disseminator, living_pillars, contemporary
```

---

##### `add-edge`

Add a guru-shishya edge to `musicians.json`.

```
python3 carnatic/write_cli.py add-edge \
  --source      <guru_musician_id>     \
  --target      <shishya_musician_id>  \
  --confidence  <float 0.0–1.0>        \
  --source-url  "https://..."          \
  [--note       "first guru"]
```

**Validation before write:**
- `source` exists in `nodes[]`.
- `target` exists in `nodes[]`.
- `source != target` (no self-loops).
- `(source, target)` pair does not already exist in `edges[]`.
- `confidence` is in range [0.0, 1.0].
- If `confidence < 0.70`, `--note` is required (hard constraint).

**Output (success):**
```
[EDGE+]  added: semmangudi_srinivasa_iyer → ms_subbulakshmi (confidence 0.85)
```

**Output (duplicate):**
```
SKIP (duplicate)  edge semmangudi_srinivasa_iyer → ms_subbulakshmi already exists
```

---

##### `add-youtube`

Append a YouTube recording entry to a musician node's `youtube[]` array.

```
python3 carnatic/write_cli.py add-youtube \
  --musician-id    <musician_id>          \
  --url            "https://youtu.be/..." \
  --label          "Raga · Tala — Event"  \
  [--composition-id <composition_id>]     \
  [--raga-id        <raga_id>]            \
  [--year           <int>]                \
  [--version        "free text"]
```

**Validation before write:**
- `musician_id` exists in `nodes[]`.
- The 11-character video ID extracted from `--url` does not already appear in any
  `youtube[]` entry on this node (duplicate detection per node).
- If `--composition-id` is given, it exists in `compositions.json`.
- If `--raga-id` is given, it exists in `compositions.json`.

**Output (success):**
```
[YOUTUBE+]  appended to tm_krishna: "Sahana · Adi — Karnatic Modern, Mumbai 2016"
            video_id: AEbAgJK30Z8  raga: sahana  composition: emaanadicchevo
```

**Output (duplicate):**
```
SKIP (duplicate)  video_id AEbAgJK30Z8 already in tm_krishna.youtube[]
```

**Note on batch ingestion from `playlist_meta.py`:** The Librarian calls `add-youtube`
once per playlist entry, after interpreting the title/description to extract
`musician_id`, `raga_id`, `composition_id`. The command handles duplicate detection
and referential integrity for each entry independently. A failure on one entry does not
affect others — each call is atomic.

---

##### `add-source`

Append a source object to an existing musician node's `sources[]` array.

```
python3 carnatic/write_cli.py add-source \
  --musician-id  <musician_id>           \
  --url          "https://..."           \
  --label        "The Hindu profile"     \
  --type         article
```

**Validation before write:**
- `musician_id` exists in `nodes[]`.
- `url` does not already appear in the node's `sources[]` array.
- `type` is a valid source type enum (`wikipedia`, `pdf`, `article`, `archive`, `other`).

**Output (success):**
```
[SOURCE+]  tm_krishna — "The Hindu profile" (article)
```

---

#### Group 2 — Composition data writes

---

##### `add-raga`

Add a new raga to `compositions.json`.

```
python3 carnatic/write_cli.py add-raga \
  --id          <snake_case_id>        \
  --name        "Canonical Name"       \
  --source-url  "https://..."          \
  --source-label "Wikipedia"           \
  --source-type  wikipedia             \
  [--aliases    "Alias1,Alias2"]       \
  [--melakarta  <int 1–72>]            \
  [--parent-raga <raga_id>]            \
  [--notes      "free text"]
```

**Validation before write:**
- `id` does not already exist in `ragas[]`.
- `--source-url` is required (hard constraint: no raga without a source).
- If `--parent-raga` is given, it exists in `ragas[]`.
- If `--melakarta` is given, it is in range [1, 72].

**Output (success):**
```
[RAGA+]  added: sahana — "Sahana"  melakarta: null  parent_raga: null
```

---

##### `add-composer`

Add a new composer to `compositions.json`.

```
python3 carnatic/write_cli.py add-composer \
  --id                <snake_case_id>      \
  --name              "Canonical Name"     \
  --source-url        "https://..."        \
  --source-label      "Wikipedia"          \
  --source-type       wikipedia            \
  [--musician-node-id <musician_id>]       \
  [--born             <year>]              \
  [--died             <year>]
```

**Validation before write:**
- `id` does not already exist in `composers[]`.
- If `--musician-node-id` is given, it exists in `musicians.json` nodes.
- `--source-url` is required.

**Output (success):**
```
[COMPOSER+]  added: kshetrayya — "Kshetrayya"  musician_node_id: null
```

---

##### `add-composition`

Add a new composition to `compositions.json`.

```
python3 carnatic/write_cli.py add-composition \
  --id           <snake_case_id>              \
  --title        "Canonical Title"            \
  --composer-id  <composer_id>                \
  --raga-id      <raga_id>                    \
  [--tala        "adi"]                       \
  [--language    "telugu"]                    \
  [--source-url  "https://..."]               \
  [--source-label "Wikipedia"]                \
  [--source-type  wikipedia]                  \
  [--notes       "free text"]
```

**Validation before write:**
- `id` does not already exist in `compositions[]`.
- `composer_id` exists in `composers[]` (hard constraint).
- `raga_id` exists in `ragas[]` (hard constraint).

**Output (success):**
```
[COMP+]  added: emaanadicchevo — "Emaanadicchevo"  raga: sahana  composer: tyagaraja
```

---

#### Group 3 — Edge and field mutations

---

##### `remove-edge`

Remove a guru-shishya edge from `musicians.json`.

```
python3 carnatic/write_cli.py remove-edge \
  --source <guru_musician_id>             \
  --target <shishya_musician_id>
```

**Validation before write:**
- `(source, target)` pair exists in `edges[]`. If not found, exits 1 with a clear
  message — no silent no-ops.

**Output (success):**
```
[EDGE-]  removed: semmangudi_srinivasa_iyer → ramnad_krishnan
```

---

##### `patch-musician`

Update a single scalar field on an existing musician node.

```
python3 carnatic/write_cli.py patch-musician \
  --id     <musician_id>                     \
  --field  <field_name>                      \
  --value  <new_value>
```

Permitted fields: `label`, `born`, `died`, `era`, `instrument`, `bani`.
`id` is immutable — attempting to patch it exits 1 with an error.

**Validation before write:**
- `musician_id` exists in `nodes[]`.
- `field` is in the permitted set.
- If `field` is `era`, value is a valid era enum.
- If `field` is `instrument`, value is accepted freely (new instruments are valid).
- If `field` is `born` or `died`, value is an integer or the string `"null"`.

**Output (success):**
```
[NODE~]  patched: t_muktha  born: 1909 → 1914
```

---

##### `patch-edge`

Update a single field on an existing edge.

```
python3 carnatic/write_cli.py patch-edge \
  --source    <guru_musician_id>          \
  --target    <shishya_musician_id>       \
  --field     <field_name>               \
  --value     <new_value>
```

Permitted fields: `confidence`, `source_url`, `note`.

**Validation before write:**
- `(source, target)` pair exists in `edges[]`.
- If `field` is `confidence`, value is a float in [0.0, 1.0].

**Output (success):**
```
[EDGE~]  patched: vina_dhanammal → t_viswanathan  note: "inherited family bani, not direct tutelage"
```

---

### Before/after JSON shape

This ADR does not change any data schema. It adds a new Python script and a new
`CarnaticWriter` class. The JSON shapes in `musicians.json` and `compositions.json`
are unchanged.

**Before (batch YouTube ingestion from playlist_meta.py output):**
```
# Librarian reads playlist_metadata.json (50 entries)
# For each entry, constructs an apply_diff block by hand:
#   - Finds the correct position in musicians.json
#   - Serialises the youtube object as a JSON fragment
#   - Inserts it with correct comma placement
# 50 manual diffs, each a potential corruption point
```

**After (batch YouTube ingestion):**
```bash
# Librarian interprets each playlist entry, then calls:
python3 carnatic/write_cli.py add-youtube \
  --musician-id tm_krishna \
  --url "https://www.youtube.com/watch?v=AEbAgJK30Z8" \
  --label "Sahana · Adi — Karnatic Modern, Mumbai 2016" \
  --raga-id sahana \
  --composition-id emaanadicchevo \
  --year 2016

# Output:
# [YOUTUBE+]  appended to tm_krishna: "Sahana · Adi — Karnatic Modern, Mumbai 2016"
#             video_id: AEbAgJK30Z8  raga: sahana  composition: emaanadicchevo

# Repeat for each entry. Each call is atomic and independently validated.
# After all entries: python3 carnatic/render.py
```

---

### `CarnaticWriter` class design

The write commands are backed by a `CarnaticWriter` class in a new module
`carnatic/writer.py`. Its methods are stateless in the following sense: each method
receives the path to the source file, reads it, applies the transformation, and writes
it back. No instance state is carried between calls.

```python
class CarnaticWriter:
    """
    Stateless writer for musicians.json and compositions.json.

    Each method:
      1. Reads the source file.
      2. Validates inputs against current state (using CarnaticGraph for
         cross-file referential integrity).
      3. Applies the transformation.
      4. Writes atomically (temp file + rename).
      5. Returns a WriteResult(ok: bool, message: str, log_prefix: str).

    No method mutates instance state. All methods are safe to call
    concurrently (each call holds the file lock for the duration of
    its read-transform-write cycle only).
    """

    def add_musician(self, musicians_path: Path, **fields) -> WriteResult: ...
    def add_edge(self, musicians_path: Path, source: str, target: str,
                 confidence: float, source_url: str, note: str | None) -> WriteResult: ...
    def add_youtube(self, musicians_path: Path, musician_id: str,
                    url: str, label: str, **optional) -> WriteResult: ...
    def add_source(self, musicians_path: Path, musician_id: str,
                   url: str, label: str, type: str) -> WriteResult: ...
    def remove_edge(self, musicians_path: Path, source: str, target: str) -> WriteResult: ...
    def patch_musician(self, musicians_path: Path, musician_id: str,
                       field: str, value: object) -> WriteResult: ...
    def patch_edge(self, musicians_path: Path, source: str, target: str,
                   field: str, value: object) -> WriteResult: ...
    def add_raga(self, compositions_path: Path, **fields) -> WriteResult: ...
    def add_composer(self, compositions_path: Path, **fields) -> WriteResult: ...
    def add_composition(self, compositions_path: Path, **fields) -> WriteResult: ...
```

`WriteResult` is a simple dataclass:

```python
@dataclass
class WriteResult:
    ok:         bool    # True = written, False = error or duplicate
    skipped:    bool    # True = duplicate (not an error)
    message:    str     # Human-readable output line
    log_prefix: str     # e.g. "[NODE+]", "[EDGE-]", "SKIP", "ERROR"
```

The `write_cli.py` script instantiates `CarnaticWriter`, calls the appropriate method,
prints `result.message`, and exits with code 0 if `result.ok or result.skipped`, else 1.

---

### Atomic write implementation

Every write method uses this pattern:

```python
import json, os, tempfile
from pathlib import Path

def _atomic_write(path: Path, data: dict | list) -> None:
    """Write JSON atomically: temp file in same directory, then os.replace."""
    text = json.dumps(data, indent=2, ensure_ascii=False)
    dir_ = path.parent
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=dir_,
        suffix=".tmp", delete=False
    ) as f:
        f.write(text)
        tmp = Path(f.name)
    os.replace(tmp, path)  # atomic on POSIX; near-atomic on Windows
```

`os.replace` is atomic on POSIX (Linux, macOS). A crash between the `write` and the
`replace` leaves the `.tmp` file on disk but the original file intact. The `.tmp` file
is cleaned up on the next run.

---

### Referential integrity enforcement

`CarnaticWriter` methods that involve cross-file references (e.g. `add-youtube` with
`--raga-id`) load a `CarnaticGraph` instance from the current `graph.json` to resolve
foreign keys. This means:

- **After adding a raga** with `add-raga`, the Librarian must run
  `python3 carnatic/render.py` before calling `add-youtube --raga-id <new_raga_id>`.
  The write command validates against `graph.json`, which is only updated by `render.py`.

This is a deliberate constraint. It enforces the correct workflow:

```
add-raga → render.py → add-youtube (with raga_id)
```

rather than allowing the Librarian to add a `youtube` entry referencing a raga that
exists in `compositions.json` but not yet in `graph.json`. The graph is always the
single source of truth for validation.

**Alternative considered:** validate directly against `compositions.json` without
requiring `render.py`. Rejected because it would allow `graph.json` to diverge from
`compositions.json` silently — the exact failure mode we are trying to prevent.

---

### Subcommand reference

```bash
# Musician graph writes
python3 carnatic/write_cli.py add-musician     --id <id> --label <label> --era <era> \
                                                --instrument <inst> --source-url <url> \
                                                --source-label <label> --source-type <type> \
                                                [--born <year>] [--died <year>] [--bani <bani>]

python3 carnatic/write_cli.py add-edge         --source <guru_id> --target <shishya_id> \
                                                --confidence <float> --source-url <url> \
                                                [--note <text>]

python3 carnatic/write_cli.py add-youtube      --musician-id <id> --url <yt_url> \
                                                --label <label> \
                                                [--composition-id <id>] [--raga-id <id>] \
                                                [--year <int>] [--version <text>]

python3 carnatic/write_cli.py add-source       --musician-id <id> --url <url> \
                                                --label <label> --type <type>

python3 carnatic/write_cli.py remove-edge      --source <guru_id> --target <shishya_id>

python3 carnatic/write_cli.py patch-musician   --id <id> --field <field> --value <value>

python3 carnatic/write_cli.py patch-edge       --source <guru_id> --target <shishya_id> \
                                                --field <field> --value <value>

# Composition data writes
python3 carnatic/write_cli.py add-raga         --id <id> --name <name> \
                                                --source-url <url> --source-label <label> \
                                                --source-type <type> \
                                                [--aliases <csv>] [--melakarta <int>] \
                                                [--parent-raga <id>] [--notes <text>]

python3 carnatic/write_cli.py add-composer     --id <id> --name <name> \
                                                --source-url <url> --source-label <label> \
                                                --source-type <type> \
                                                [--musician-node-id <id>] \
                                                [--born <year>] [--died <year>]

python3 carnatic/write_cli.py add-composition  --id <id> --title <title> \
                                                --composer-id <id> --raga-id <id> \
                                                [--tala <tala>] [--language <lang>] \
                                                [--source-url <url>] [--source-label <label>] \
                                                [--source-type <type>] [--notes <text>]
```

---

### Updated Librarian workflow for playlist ingestion

The playlist ingestion workflow (new Workflow H in `READYOU.md`) uses `write_cli.py`
as its execution layer:

```
Step 0 — Ensure graph.json is current.
  python3 carnatic/render.py
  (Ensures all referential integrity checks run against the latest state.)

Step 1 — For each playlist entry:
  a. Extract artist name(s) from title/description.
  b. python3 carnatic/cli.py musician-exists "<artist name>"
     → If NOT FOUND: flag, skip entry, do not create node without user instruction.
     → If FOUND: note the exact musician_id.

  c. Extract raga name from title/description.
  d. python3 carnatic/cli.py raga-exists "<raga name>"
     → If NOT FOUND: python3 carnatic/write_cli.py add-raga ...
       then python3 carnatic/render.py (required before next step).
     → If FOUND: note the exact raga_id.

  e. Extract composition name from title/description (if identifiable).
  f. python3 carnatic/cli.py composition-exists "<composition name>"
     → If NOT FOUND: python3 carnatic/write_cli.py add-composition ...
       then python3 carnatic/render.py.
     → If FOUND: note the exact composition_id.

  g. python3 carnatic/cli.py url-exists "<url>"
     → If FOUND: log SKIP (duplicate), continue to next entry.
     → If NOT FOUND: proceed.

  h. python3 carnatic/write_cli.py add-youtube \
       --musician-id <id> --url <url> --label <label> \
       [--raga-id <id>] [--composition-id <id>] [--year <year>]

Step 2 — After all entries:
  python3 carnatic/render.py
  python3 carnatic/cli.py validate
```

---

## Consequences

### What this enables

- **Error-free batch ingestion.** A 50-video playlist can be ingested without a single
  hand-constructed JSON fragment. Each entry is validated and written atomically.

- **Referential integrity by construction.** A `youtube` entry with a bad `raga_id`
  cannot be written — the command rejects it before touching the file.

- **Clean rollback semantics.** A failed command leaves the file unchanged. There is no
  "partial write" state to recover from.

- **Mediated LLM access.** The LLM never serialises JSON. It calls methods with typed
  arguments. The schema complexity is absorbed by `CarnaticWriter`, not the LLM.

- **Composable with read commands.** The read/write CLI forms a closed loop:
  `musician-exists` → `add-musician`; `url-exists` → `add-youtube`;
  `raga-exists` → `add-raga`. Every write is preceded by a read that confirms the
  precondition.

- **Future-proof for new data sources.** Website parsers, AIR archive scrapers, concert
  programme PDF parsers — all produce structured dicts. All can drive `write_cli.py`
  commands. The Librarian's interpretation role remains constant; the ingestion
  mechanics are already in place.

### What this forecloses

- **Direct `apply_diff` writes to `musicians.json` for the operations covered here.**
  Once `write_cli.py` is implemented, the Librarian should use it for all covered
  operations. `apply_diff` remains available for operations not yet covered (e.g.
  editing a recording file, adding a `notes` field to a composition).

- **Writing to `graph.json` directly.** `graph.json` is a derived artefact. Write
  commands enforce this by never touching it.

### What this does NOT change

- The data schema (`musicians.json`, `compositions.json`, `recordings/*.json`) — unchanged.
- The `graph.json` structure — unchanged.
- The `render.py` pipeline — unchanged.
- The test suite — unchanged.
- The Librarian's hard constraints — unchanged.
- Recording file writes — unchanged (recording files are self-contained and small;
  hand-construction with `apply_diff` remains appropriate).

### Queries that become possible (or safer)

| Operation | Before | After |
|---|---|---|
| Add a musician node | Hand-construct JSON fragment, apply_diff | `add-musician --id ... --label ...` |
| Add a guru-shishya edge | Hand-construct JSON fragment, apply_diff | `add-edge --source ... --target ...` |
| Append a YouTube entry | Hand-construct JSON fragment, apply_diff | `add-youtube --musician-id ... --url ...` |
| Add a raga | Hand-construct JSON fragment, apply_diff | `add-raga --id ... --name ...` |
| Add a composition | Hand-construct JSON fragment, apply_diff | `add-composition --id ... --title ...` |
| Ingest 50-video playlist | 50 manual diffs, each a corruption risk | 50 `add-youtube` calls, each atomic |
| Correct a musician's birth year | apply_diff with exact line number | `patch-musician --id ... --field born --value 1914` |
| Remove a wrong edge | apply_diff to delete the edge object | `remove-edge --source ... --target ...` |

---

## Implementation

**Agent:** Carnatic Coder
**Deliverables:**
- `carnatic/writer.py` — `CarnaticWriter` class and `WriteResult` dataclass (~250 lines)
- `carnatic/write_cli.py` — thin CLI wrapper over `CarnaticWriter` (~200 lines)

**Dependencies:**
- `carnatic/graph_api.py` (ADR-013 Phase 2) — used for referential integrity checks
- `carnatic/data/musicians.json` — primary write target for musician/edge/youtube operations
- `carnatic/data/compositions.json` — primary write target for raga/composer/composition operations
- `carnatic/data/graph.json` — read-only; used by `CarnaticGraph` for cross-file validation

**No new Python dependencies** beyond the standard library and what ADR-013 already requires.

**After implementation:**
- Carnatic Coder updates `carnatic/.clinerules` to add the write command reference.
- Carnatic Coder updates `.roomodes` Librarian `customInstructions` to add Workflow H (playlist ingestion).
- Graph Architect updates this ADR status to Accepted.
- Git Fiend commits: `feat(cli): add atomic write commands for librarian (ADR-015)`.

---

## Open questions

1. **Recording file writes.** This ADR deliberately excludes recording files
   (`carnatic/data/recordings/*.json`) from the write command set. Recording files are
   self-contained, small, and structurally complex (nested sessions/performances). The
   Librarian's current `apply_diff` workflow for recording files is adequate. A future
   ADR may add `add-session`, `add-performance`, and `patch-performance` commands if
   batch recording ingestion becomes a workload.

2. **`patch-musician` scope.** The current design permits patching only scalar fields
   (`label`, `born`, `died`, `era`, `instrument`, `bani`). Patching `sources[]` is
   handled by `add-source`. Patching `youtube[]` entries (e.g. adding `raga_id` to an
   existing entry — Workflow D) is not yet covered. A `patch-youtube` command may be
   warranted if Workflow D becomes a frequent operation.

3. **Concurrent writes.** The atomic write pattern (`os.replace`) is safe for single-
   writer scenarios. If multiple agents ever write to the same file concurrently, a
   file-level lock will be needed. This is not a current concern but should be noted
   for future multi-agent architectures.