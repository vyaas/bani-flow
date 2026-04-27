# ADR-110: Collapse Composer into Musician — Retire `_composers.json`

**Status**: Accepted
**Date**: 2026-04-27
**Agents**: graph-architect (proposer), librarian (data migration), carnatic-coder (implementer)
**Depends on**: ADR-015 (write commands), ADR-057 (composer panel), ADR-059 (musician panel compositions), ADR-083 (bundle write channel), ADR-109 (musician-as-composer)

---

## Context

The data model currently splits people into two separate entity types:

- **Musician** — a node in `data/musicians/{id}.json`; appears on the graph; can have recordings, YouTube entries, edges.
- **Composer** — a record in `data/compositions/_composers.json`; referenced by `composer_id` on compositions and performances; may or may not have a linked `musician_node_id`.

This split was an artefact of an early-stage data model where composer metadata was a property of the compositions layer, not the performers layer. It made sense when the graph was purely a guru-shishya transmission graph and composers were referenced only as attribution metadata.

ADR-059 and ADR-057 broke open that assumption: the Musician panel now renders compositions, making a composer's work accessible through their node. But this only works if the composer **has** a musician node — i.e., `musician_node_id` is set. Of the 69 composers in `_composers.json`, only **19** have a linked musician node. The remaining **50** are inaccessible as interactive exploration centres; their compositions are orphaned from the graph.

ADR-109 introduced auto-creation of composer records alongside musician panels, which further blurred the boundary. The model now generates composer records pointing back to musicians (`musician_node_id`), doubling the bookkeeping.

**The two-layer model has outlived its usefulness.** A composer is a musician. The distinction is a data-layer bookkeeping concern, not a user-level concept. Every composer deserves a musician node so their compositions are discoverable.

---

## Forces

| Force | Direction |
|---|---|
| **Discoverability** | A composer with no musician node is invisible to the panel system; 50 composers' worth of compositions are unreachable via interaction |
| **Referential simplicity** | `composer_id` on a composition should point directly to a musician ID — one namespace, one lookup table |
| **Write-path friction** | Adding a composition currently requires the target composer to exist in `_composers.json`; contributors must remember two write surfaces |
| **`musician_node_id` indirection** | The `musician_node_id` field on a composer record exists solely to link a composer back to a musician; if composer IS musician this field is unnecessary overhead |
| **Test fixture complexity** | Every test that exercises composition creation must seed both `_composers.json` and musician JSON; this doubles the fixture setup surface |
| **Backward compatibility** | `composer_id` references in compositions and recordings all use IDs that already match musician IDs (for the 19 linked composers) or will match after migration (for the 50) — no composition records need to change |

---

## Pattern

**Christopher Alexander, *The Timeless Way of Building*, §11 — "The Whole."** When two parts of a whole represent the same centre, they diminish each other. The composer/musician split creates two representations of the same human being; the model is more coherent when each person is one node.

**ADR-016 (writer validation).** The writer's validation layer resolves composer IDs from a single authoritative source. Collapsing to musicians makes that source `data/musicians/`, where all other entity validation already lives.

---

## Decision

### 1 — Musician is the single node type for people

`_composers.json` is retired. Every composer becomes a musician. The `composer_id` field on compositions and performances continues to work unchanged — it already is a musician ID for the 19 linked composers; after migration it will be for all 69.

### 2 — Musician schema: `instrument` becomes optional

Currently `instrument` is required and has values: `vocal`, `violin`, `veena`, `flute`, `mridangam`, `bharatanatyam`. Many historical composers do not have a clear primary instrument in the Carnatic performance sense (Basava, Tulsidas, Andal, etc.). The field becomes nullable (`null` allowed). Existing values are unchanged.

**Before (composer schema)**:
```jsonc
{
  "id": "purandara_dasa",
  "name": "Purandara Dasa",
  "musician_node_id": null,
  "born": 1484,
  "died": 1564,
  "sources": [{ "url": "https://en.wikipedia.org/wiki/Purandara_Dasa", ... }]
}
```

**After (musician schema)**:
```jsonc
{
  "id": "purandara_dasa",
  "label": "Purandara Dasa",
  "born": 1484,
  "died": 1564,
  "era": "disseminator",
  "instrument": "vocal",
  "bani": null,
  "youtube": [],
  "sources": [{ "url": "https://en.wikipedia.org/wiki/Purandara_Dasa", ... }]
}
```

The `name` → `label` rename and the removal of `musician_node_id` are the only structural differences.

### 3 — `composer_id` on compositions and performances: no change

All `composer_id` values already match musician IDs (for the 19 with `musician_node_id`) or will match after migration. No composition files need to be patched; `composer_id` continues to mean "musician who composed this".

### 4 — Code changes required

#### `carnatic/writer.py`
- Remove `_composers_file()`, `_load_all_composers()`, `_write_composers()`.
- Remove `add_composer()` and `patch_composer()` public methods.
- Remove the `musician_node_id` parameter from any remaining composer-creation paths.
- Update `add_composition()`: validate `composer_id` against musician IDs loaded via `_load_all_musicians()` (same function already used for other musician lookups).
- Update `add_note()`: remove `entity_type="composer"` branch; if reached, raise a clear error directing to `entity_type="musician"`.
- Update `_RECORDING_PERF_FIELDS` / validation: `composer_id` is validated against musician IDs.

#### `carnatic/write_cli.py`
- Remove `add-composer` subcommand, `cmd_add_composer()` function, and its `argparse` registration.
- Remove `add-composer` from the `COMMANDS` dispatch dict.
- Update the module docstring.

#### `carnatic/bani_add.py`
- Remove `_process_composers()` function entirely.
- In the bundle dispatch (`apply_bundle`): remove the `# ── composers ──` section.
- **Transition**: Any bundle JSON that contains a `composers` key should emit a deprecation warning listing the items, then process each item as a musician via `_process_musicians()`. This handles existing bundles that were generated before this ADR. The deprecation shim is removed in a follow-up.

#### `carnatic/render/data_loaders.py`
- Remove `_composers.json` loading (the `composers_file = compositions_dir / "_composers.json"` block).
- The returned dict no longer includes `"composers"`.

#### `carnatic/render/_main.py`
- Remove the `composer_node_map` construction loop (iterates `comp_data["composers"]`).
- Replace with a direct lookup: any musician whose `id` appears as a `composer_id` on at least one composition is a composer. Build `composer_musician_ids: set[str]` from compositions, then pass it to `build_elements`.
- Update `build_elements` signature accordingly.

#### `carnatic/render/graph_builder.py`
- Update `build_elements()`: replace `composer_node_map` parameter with `composer_musician_ids: set[str]`.
- `is_composer = node_id_local in composer_musician_ids` (direct set membership, no indirection).
- `composer_id` on the node becomes `node_id_local` (the musician's own id), not a foreign key via a separate composer record.

#### `carnatic/render/data_transforms.py`
- Update `build_listenable_set()`: remove the `composer_to_node` mapping loop. A musician is listenable due to compositions if `musician_id in composer_musician_ids` (passed in or derived directly from composition `composer_id` values).

#### `carnatic/graph_api.py`
- Update `get_all_composers()` and `get_composer()`: instead of reading `self._composers` (loaded from `_composers.json`), derive the composer list from `self._musicians` filtered to those IDs that appear as `composer_id` in any composition.
- The `self._composers` field is removed; `self._composer_by_id` is derived from musicians by composer ID set.
- `graph.json` format change: the `composers` top-level key is removed (or kept as a derived alias for backward compatibility during transition).

#### `carnatic/cli.py`
- `validate`: update all `composer_id` checks to look up against `known_musician_ids` instead of `known_composer_ids`.
- Remove "Composers: N" stat line, or derive it from musicians-with-compositions.
- Remove `get_all_composers()` call (or keep it pointing at the updated `graph_api` method).

#### `carnatic/data/READYOU.md`
- Remove `compositions/_composers.json` row from the files table.
- Update counts.

#### Tests
- `tests/test_schema_integrity.py`: Update `test_all_performance_composer_ids_exist` and `test_all_composition_composer_ids_exist` to check against musician IDs, not `get_all_composers()`.
- `tests/test_writer_add_youtube_lecdem_happy.py`, `test_writer_add_youtube_lecdem_invariants.py`, `test_bani_add_lecdem_e2e.py`: Remove `(compositions_dir / "_composers.json").write_text(...)` fixture setup lines; instead seed the musician fixture for the test composer.
- `tests/test_traversal.py`: Update assertions about `composer["musician_node_id"]` — that field no longer exists; the composer IS the musician.

### 5 — Data migration (Librarian task)

The 50 composers currently without a musician node must be migrated to `data/musicians/{id}.json`.

**Migration fields**:
| _composers.json field | Musician field | Rule |
|---|---|---|
| `id` | `id` | Same |
| `name` | `label` | Rename |
| `born` | `born` | Same |
| `died` | `died` | Same |
| `sources` | `sources` | Same |
| *(absent)* | `era` | Librarian assigns based on dates |
| *(absent)* | `instrument` | Librarian assigns; `null` if unknown |
| *(absent)* | `bani` | `null` for all composer-only entries |
| *(absent)* | `youtube` | `[]` for all composer-only entries |

**Era assignment guidance** (Librarian uses best judgement with Wikipedia sources):
- Pre-1700: no era bucket exists yet; use `null` (era field also becomes optional in this ADR — see §2)
- 1700–1800: `golden_age`
- 1800–1900: `bridge` or `disseminator`
- 1900–1970: `living_pillars`
- 1970–present: `contemporary`

**The 19 composers already linked to musician nodes**: their `musicians/*.json` files already exist; they only need to be verified for completeness (no schema changes required). The `musician_node_id` field in `_composers.json` for these is simply obsolete after the file is deleted.

**Migration order**: Migrate the 50 composer-only entries first; then delete `_composers.json`; then run code changes so nothing reads the deleted file.

### 6 — `graph.json` format

The top-level `composers` key is removed from `graph.json`. The render pipeline no longer emits it. `graph_api.py` derives the composer roster from `musicians` + composition `composer_id` cross-reference. This is a breaking change for any consumer reading `graph.json["composers"]` directly — there are none outside the Python layer; the JS layer reads `window.composers` (injected by `html_generator.py`) which will be updated simultaneously.

---

## Consequences

### Positive
- All 69 composers become searchable graph centres with panel access to their compositions.
- One entity type for people: simpler validation, simpler tests, simpler bundle JSON.
- `musician_node_id` bookkeeping eliminated entirely.
- The `add-composer` CLI command disappears; contributors use `add-musician` for all people, reducing cognitive load.
- `_composers.json` (1 026 lines) deleted; data layer shrinks by one file type.
- ADR-109's auto-create path still works: a musician who is also a composer creates a companion record only if no musician ID already exists — but in the new model, the musician record IS the composer record. The ADR-109 "companion create" step reduces to a no-op when the musician already exists.

### Negative / accepted tradeoffs
- The Librarian must create 50 new musician files. Many of these composers (saint-poets, medieval figures) lack a clear `instrument` or `era` assignment. Nullable fields handle this; Librarians may refine later.
- `era` also becomes nullable to accommodate pre-golden-age composers (Annamacharya 1408, Basava 1131, etc.) who predate the era taxonomy.
- `graph.json` `composers` key is removed; any external tool relying on it must be updated. There are none known.
- Tests that seed `_composers.json` fixtures must be updated to seed musician fixtures instead. This is mechanical work with no semantic change.

---

## Implementation Checklist (for Carnatic Coder)

The implementation must proceed in this order to avoid breaking the validation chain:

**Phase 1 — Code: relax schema constraints** (before data migration)
- [ ] `writer.py`: make `instrument` and `era` optional (allow `None`) in `add_musician()` — required to accept historical composers without these fields
- [ ] `writer.py`: update `add_composition()` validation to accept `composer_id` that matches either musician IDs or (during transition) composer IDs (both namespaces initially identical)

**Phase 2 — Data: Librarian migrates 50 composer-only entries**
- [ ] For each of the 50 composers listed in §5, create `data/musicians/{id}.json` with appropriate fields
- [ ] Verify with `python3 carnatic/cli.py validate` after each batch
- [ ] Run `bani-render` and confirm composition panel opens for newly added musician-composers

**Phase 3 — Code: remove composer infrastructure**
- [ ] `writer.py`: remove `_composers_file`, `_load_all_composers`, `_write_composers`, `add_composer`, `patch_composer`
- [ ] `writer.py`: update `add_composition` and `add_note` to use musician lookup only
- [ ] `write_cli.py`: remove `add-composer` subcommand
- [ ] `bani_add.py`: remove `_process_composers`; add deprecation shim routing `composers` bundle key to `_process_musicians`
- [ ] `render/data_loaders.py`: remove `_composers.json` load
- [ ] `render/_main.py`: replace `composer_node_map` with `composer_musician_ids` set
- [ ] `render/graph_builder.py`: update `is_composer` logic
- [ ] `render/data_transforms.py`: update listenable logic
- [ ] `graph_api.py`: update `get_all_composers()` and `get_composer()` to derive from musicians
- [ ] `cli.py`: update validate and stats

**Phase 4 — Data: delete `_composers.json`**
- [ ] `git rm carnatic/data/compositions/_composers.json`
- [ ] `bani-render` + full validate pass

**Phase 5 — Tests**
- [ ] Update all test fixtures and assertions (see §4 Tests section)
- [ ] Run full test suite: `python -m pytest carnatic/tests/`

**Phase 6 — Docs**
- [ ] Update `carnatic/data/READYOU.md`
- [ ] Update `CLAUDE.md` and `.clinerules` stats
