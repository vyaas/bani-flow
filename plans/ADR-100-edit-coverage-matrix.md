# ADR-100: The Edit Coverage Matrix — Every Entity, Every Field, In-Loop

**Status**: Accepted
**Date**: 2026-04-25
**Agents**: graph-architect (proposer), carnatic-coder (downstream implementer)
**Depends on**: ADR-016 (writer validation), ADR-031 (data entry forms), ADR-083 (bundle as canonical write channel), ADR-085 (self-replicating curation loop), ADR-097 (bundle deltas + unified Edit form), ADR-099 (bundle dependency resolution)
**Extends**: ADR-097 §3 (per-bucket op matrix), §6 (unified Edit form)

---

## Context

ADR-097 introduced the unified Edit form with three operations per entity — `patch`, `append`, `annotate` — and shipped an MVP scoped to *Musician + Raga + Edge* (Phase C). The remaining entity types (composer, composition, recording, lecdem-shaped YouTube entry, individual recording session, individual performance) were left to "subsequent commits" with no specification of *which* fields are patchable on each, *which* arrays are appendable, or *which* paths into the nested structures the bundle's `array` selector can name.

This unspecified surface is now the limiting factor on the curation loop. Three observed cases:

**Case 1 — Wikipedia URL drift.** A musician's Wikipedia URL changed (the page was renamed). The Edit form has no patchable `sources[].url` selector — `sources` is exposed as an *append-only* array. The rasika cannot fix the existing entry without leaving the loop. ADR-097 §3's `append` row mentions `sources[]` but says nothing about how to *patch* an existing source's `url` or `label` once the host has renamed.

**Case 2 — Performer label correction.** A YouTube entry has an accompanist tagged with the wrong `role` ("violin" where it should be "viola" — or, more commonly, an `unmatched_name` that the rasika has now matched to a real `musician_id`). The Edit form's `youtube[<vid>].performers[]` selector is `append`-only; there is no path to *patch* the existing element.

**Case 3 — Composition title transliteration.** `compositions.json` has `display_title: "ninnukori"` but the rasika wants the diacritical `"ninnukōri"`. There is no `patch_composition` verb in the writer (ADR-097 §3 noted it as "to add" in Phase B step 3). Even if there were, the Edit form's entity-type dropdown does not include Composition, and even if it did, the patchable-fields list is undefined.

These are not exotic edge cases. They are the daily texture of curation. The library is a knowledge graph; knowledge graphs are *corrected* more often than they are *grown*. ADR-085 §3 (read implies write) and ADR-097's extension (read implies edit) demand that every readable field be editable through the loop.

The work this ADR does is **not** to invent new mechanisms. ADR-097 already specified `patch`, `append`, `annotate`, and the unified Edit form. The work is to **define the coverage matrix** — the normative table of *which entity has which patchable fields, which appendable arrays, and which deeply-nested array selectors* — so that the Coder's Phase C implementation has a single contract to satisfy and code review has a single contract to verify.

### Forces

| Force | Direction |
|---|---|
| **Read implies edit (ADR-097)** | If the panel shows it, the Edit form must let the rasika change it (or annotate it, where mutation is unsafe). |
| **Mutation is dangerous; patches must be whitelisted** | Free-text patching of arbitrary fields would let a typo on `id` corrupt every reference. Every patchable field is on a per-entity allow-list. Identity-bearing fields (`id`, `kind`, `type`, `url` of a YouTube entry — i.e. anything used as a key) are *never* patchable through the loop. They are renames, which ADR-085 §6 forbids in-loop. |
| **Append paths must be unambiguous** | A selector like `youtube[3].performers` (index-based) breaks under concurrent appends. Per ADR-097 §3 selectors must be id-based: `youtube[<vid>].performers`. This ADR extends the same rule to every nested array. |
| **Patch paths into nested arrays need element selectors** | To patch the `role` of one performer in one YouTube entry, the selector is `youtube[<vid>].performers[<musician_id_or_unmatched_name>].role`. The element-key chosen must be stable across operations and unique within the array. |
| **Annotate is the safety valve** | Anywhere a field is too unstructured or too contested to whitelist for `patch`, the answer is `annotate`: append a note rather than overwrite. The rasika is never blocked. |
| **One JS metadata block, mirrored to one Python whitelist** | The patchable-fields and append-targets table is encoded once in JS (`PATCH_METADATA`, `APPEND_METADATA`) for the Edit form's UI generation, and once in Python (`writer.PATCHABLE_*_FIELDS`, `writer.APPEND_*_TARGETS`) for validation. The two must be reviewed together. ADR-097 §6 noted future work to derive both from a single source — out of scope here, but this ADR makes the coupling explicit. |
| **Recording entities are file-shaped, not field-shaped** | ADR-097 §3 row `recordings` marked `patch` as `—` because recordings are atomic JSON files. This ADR re-opens that decision: the *outer* recording fields (title, date, venue, occasion) are patchable; the *nested* arrays (sessions, performances) are deferred to ADR-101. |
| **Lecdem-shaped YouTube entries get full coverage** | Per ADR-077, a lecdem is a `youtube[]` entry with `kind: "lecdem"` and a `subjects` block. Its patchable fields and appendable arrays are a strict subset of the YouTube entry's. The matrix names them explicitly so the Edit form can route to a lecdem-specific block when the selected entry has `kind == "lecdem"`. |

---

## Pattern

**Property 4 — *Positive Space*.** Today the editable surface is a negative space — defined by what the writer happens to expose, not by a positive specification of what the rasika should be able to do. This ADR fills the negative space with positive declarations: a row per entity, a column per operation, a list per cell. Reviewing the matrix becomes the review-criterion for the Edit form's completeness.

**Property 1 — *Strong Centres* (continuation).** ADR-097's unified Edit form is one centre that subsumes per-entity edit windows. This ADR is what makes that centre *thick* — the centre is strong only if it actually dispatches to every entity type with full field coverage. A centre that handles three of seven entities is a stub.

**Property 11 — *Roughness*.** The matrix has irregular cells. `compositions.append` has no entries (compositions are leaf-shaped); `recordings.append` is intentionally deferred (ADR-101 owns segments); `edges.annotate` is `—` because edges are not entity-shaped enough to carry a notes vector. Roughness is honest: not every entity is shaped the same, and the matrix tells the truth about it.

---

## Decision

### 1 — The patchable-fields table (per-entity, normative)

Every patchable field is identity-stable: patching it does not change any reference any other entity holds.

| Entity | Patchable top-level fields | Patchable nested fields (via element selectors) |
|---|---|---|
| `musicians` | `label`, `born`, `died`, `instrument`, `bani`, `notes_text`, `wikipedia_url` (deprecated alias of `sources[wikipedia].url` — see §3) | `sources[<host>].url`, `sources[<host>].label`, `youtube[<vid>].label`, `youtube[<vid>].year`, `youtube[<vid>].version`, `youtube[<vid>].tala`, `youtube[<vid>].composition_id`, `youtube[<vid>].raga_id`, `youtube[<vid>].kind`, `youtube[<vid>].performers[<key>].role`, `youtube[<vid>].performers[<key>].musician_id` |
| `ragas` | `label`, `parent_raga`, `melakarta_number`, `cakra`, `arohana`, `avarohana`, `mela_id` | `sources[<host>].url`, `sources[<host>].label` |
| `composers` | `label`, `born`, `died`, `tradition` | `sources[<host>].url`, `sources[<host>].label` |
| `compositions` | `display_title`, `composer_id`, `raga_id`, `tala`, `language`, `type` | `sources[<host>].url`, `sources[<host>].label` |
| `recordings` | `title`, `date`, `venue`, `occasion` | `sources[<host>].url`, `sources[<host>].label`. *Nested `sessions[]`/`performances[]` patches: deferred to ADR-101.* |
| `edges` | `confidence`, `source_url`, `note`, `relation` (only when `relation` is on `VALID_RELATIONS`) | — |

**Element selectors** are id-keyed:
- `sources[<host>]` — the `host` token is the URL host (`en.wikipedia.org` → `en_wikipedia_org`, normalised lowercase, dots → underscores). The writer normalises identically. If two sources share a host, the selector is ambiguous and the writer errors; the rasika must use `annotate` or hand-edit.
- `youtube[<vid>]` — 11-char YouTube video id (per ADR-097 §3).
- `youtube[<vid>].performers[<key>]` — `<key>` is the element's `musician_id` if set, else its `unmatched_name` slugified. Unique within the array by writer invariant.

**Identity-bearing fields are never patchable**: `id` (every entity), `url` of a YouTube entry (it *is* the identity-key), `video_id` of a recording, `source` / `target` of an edge. These are *renames*; renaming is out-of-loop (ADR-085 §6).

### 2 — The appendable-arrays table (per-entity, normative)

| Entity | Appendable top-level arrays | Appendable nested arrays |
|---|---|---|
| `musicians` | `sources`, `youtube` | `youtube[<vid>].performers`, `youtube[<vid>].subjects.raga_ids`, `youtube[<vid>].subjects.composition_ids`, `youtube[<vid>].subjects.musician_ids` |
| `ragas` | `aliases`, `sources` | — |
| `composers` | `sources` | — |
| `compositions` | `sources` | — |
| `recordings` | *deferred to ADR-101* | *deferred to ADR-101* |
| `edges` | — (edges are atomic) | — |

The append `value` shape per array is fixed by the writer's existing `add_*` verbs. The Edit form renders the per-array mini-form by looking up `APPEND_METADATA[entity][array]`, which lists the value's expected fields and their input types (combobox over `graphData`, free text, year, etc.).

### 3 — Wikipedia URL: the canonical case for `sources[<host>]` patching

The most-requested edit is "fix this Wikipedia link". Today every musician has a `sources[]` array whose first element (typically) is the Wikipedia entry. Patching it is the cell `musicians.sources[en_wikipedia_org].url` in §1.

The Edit form surfaces this as a top-priority row: when the rasika opens Edit → Musician → TM Krishna, the patch panel shows `Wikipedia URL` as a labelled patchable row that resolves under the hood to `sources[en_wikipedia_org].url`. Same for `sources[<host>].label`. This is a UI affordance over the underlying selector, not a new bundle op.

If a musician's `sources[]` does not contain a `wikipedia.org`-host entry, the row degrades to a hint: "No Wikipedia source on file. Use Append → sources to add one." (Which routes through the existing append path.)

### 4 — Lecdem-shaped YouTube entries: full editing surface

When the selected `youtube[<vid>]` element has `kind == "lecdem"` (ADR-077), the Edit form switches its element editor to the lecdem variant. Patchable fields gain `subjects.raga_ids`, `subjects.composition_ids`, `subjects.musician_ids` as *appendable* (not patchable — per ADR-099 the inline `+ Add new raga` cascade handles the case where the spotted raga is brand new). Patchable scalars on the lecdem are exactly the same as on a regular YouTube entry (`label`, `year`, etc.).

Concert-recording-shaped editing — adding *timestamped* segments to the body of a recording while listening — is a richer surface. It is handled separately in ADR-101.

### 5 — Annotate is universal except for edges

Per ADR-097 §7, every entity gains `notes[]`. This ADR confirms `annotate` is supported on `musicians`, `ragas`, `composers`, `compositions`, `recordings`, `youtube[<vid>]` (i.e. an individual YouTube entry can carry its own notes). Edges remain `annotate: —` because edges already carry a `note` field that the patch row covers; a notes-vector on edges would duplicate without adding signal.

### 6 — The Edit form's metadata blocks

`entry_forms.js` defines two top-level constants:

```javascript
const PATCH_METADATA = {
  musicians: {
    fields: [
      { name: 'label',         label: 'Label',          input: 'text' },
      { name: 'born',          label: 'Born',           input: 'year' },
      { name: 'died',          label: 'Died',           input: 'year' },
      { name: 'instrument',    label: 'Instrument',     input: 'text' },
      { name: 'bani',          label: 'Bani / Gharana', input: 'text' },
      // ... and the nested-selector fields, rendered with element-pickers
    ],
    nested: {
      'sources[<host>]':           { fields: ['url', 'label'] },
      'youtube[<vid>]':            { fields: ['label', 'year', 'version', 'tala',
                                              'composition_id', 'raga_id', 'kind'] },
      'youtube[<vid>].performers[<key>]': { fields: ['role', 'musician_id'] },
    },
  },
  ragas:        { /* per §1 */ },
  composers:    { /* per §1 */ },
  compositions: { /* per §1 */ },
  recordings:   { /* per §1, body-of-recording fields only */ },
  edges:        { /* per §1 */ },
};

const APPEND_METADATA = {
  musicians: {
    sources:  { /* element shape */ },
    youtube:  { /* element shape — full YoutubeEntryItem per ADR-083 §2d */ },
    'youtube[<vid>].performers': { /* element: { musician_id?, unmatched_name?, role } */ },
    'youtube[<vid>].subjects.raga_ids':        { /* element: raga_id (combobox) */ },
    'youtube[<vid>].subjects.composition_ids': { /* element: composition_id (combobox) */ },
    'youtube[<vid>].subjects.musician_ids':    { /* element: musician_id (combobox) */ },
  },
  ragas:    { aliases: { /* element: string */ }, sources: { /* element shape */ } },
  composers:    { sources: { /* element shape */ } },
  compositions: { sources: { /* element shape */ } },
};
```

The Edit form's renderer reads these constants and produces:
- a patch-field combobox populated from `PATCH_METADATA[entity].fields[].name`;
- when a nested-selector field is chosen, an element-picker (combobox over the entity's existing `<vid>`s, `<host>`s, or `<key>`s);
- an input row whose type matches `input` (text / year / combobox-over-graphData / textarea).

The `array` combobox in the append block is populated from `Object.keys(APPEND_METADATA[entity])`. Selecting an array reveals its mini-form per `APPEND_METADATA[entity][array]`.

### 7 — Python writer mirror

In `carnatic/writer.py`:

```python
PATCHABLE_MUSICIAN_FIELDS         = { 'label', 'born', 'died', 'instrument', 'bani' }
PATCHABLE_MUSICIAN_NESTED_PATHS   = { 'sources[<host>].url', 'sources[<host>].label',
                                      'youtube[<vid>].label', 'youtube[<vid>].year',
                                      'youtube[<vid>].version', 'youtube[<vid>].tala',
                                      'youtube[<vid>].composition_id',
                                      'youtube[<vid>].raga_id', 'youtube[<vid>].kind',
                                      'youtube[<vid>].performers[<key>].role',
                                      'youtube[<vid>].performers[<key>].musician_id' }
# ... and analogous constants per entity, per §1
```

The bundle ingester's `op == "patch"` dispatcher in `bani_add.py` (ADR-097 Phase B step 3) routes to `writer.patch_<entity>` with `(id, field_or_path, value)`. The writer:
1. Validates the field/path is in the per-entity whitelist.
2. Resolves the path (host normalisation, vid lookup, performer key resolution).
3. Validates the new value (referential integrity for `musician_id`, `composition_id`, `raga_id`; URL well-formedness for URL fields; year integer for year fields).
4. Writes.

Per-entity new verbs to add: `patch_composer`, `patch_composition` (noted in ADR-097 Phase B step 3 as new), `patch_recording_outer` (this ADR — body-of-recording fields only). Existing `patch_musician`, `patch_raga`, `patch_edge` get expanded to handle the nested-path selectors per §1.

---

## Consequences

### Positive

- **The Edit form is now specifiable.** Phase C of ADR-097 had no acceptance criterion beyond "it ships". This ADR is the acceptance criterion: the Edit form is complete when the matrix is implemented end-to-end.
- **Wikipedia URL editing — the most common request — has a one-row UI affordance** that resolves to a clean `sources[<host>].url` patch.
- **Performer corrections are in-loop.** Today fixing a wrong role or matching an `unmatched_name` requires a hand-edit; tomorrow it is a patch through the bundle.
- **The matrix is reviewable in one pass.** Code review of the Edit form can check each cell against the implementation.
- **Lecdem editing gains its own block** without requiring a separate Edit-form variant — it is a `kind == "lecdem"` branch of the YouTube entry editor, sharing all infrastructure.
- **Notes on YouTube entries** give the rasika a place for soft observations on individual recordings ("Subbulakshmi's tampura is conspicuously low here") that today have no home.

### Negative / accepted tradeoffs

- **The matrix is the contract; drift is a risk.** When a new field is added to any entity, this ADR (or a successor) must be updated and `PATCH_METADATA` / `APPEND_METADATA` / the Python whitelists synced. Mitigated by code-review convention — a PR adding a field must touch all three sites.
- **Element selectors require host/vid/key normalisation that must be identical on both sides** (JS for staging, Python for ingest). One implementation per side; tested by a round-trip: stage in JS, ingest in Python, assert disk shape.
- **Sources keyed by host fail when two sources share a host.** Accepted: this is rare (most entities have at most one source per host), and the writer error message names the collision and points the rasika to `annotate` or hand-edit.
- **Identity-bearing fields are not patchable** — so renames remain a librarian-tier escape hatch. Accepted per ADR-085 §6; deletes and renames are out-of-loop by design.

### Risks

- **The matrix grows.** Future entity types (raga families, ensembles, institutions, lessons) will each need a row. Mitigated by the matrix being a single reviewable artefact in this ADR.
- **An Edit form built without first reading this ADR underspecifies the surface.** Mitigated by the Phase C verification step: "every cell of §1 and §2 has an Edit-form path; ad-hoc QA exercises one cell per row."
- **Nested-path selectors are a small DSL.** Contributors who hand-author bundles must learn it. Mitigated: hand-authoring is rare; the Edit form is the primary path; the DSL is uniform (`array[<key>].field`) so once learned it generalises.

---

## Implementation

This ADR is a contract; the work is a Coder follow-up to ADR-097 Phase B and Phase C.

### Phase B (writer side)

1. Add `PATCHABLE_*_FIELDS` and `PATCHABLE_*_NESTED_PATHS` constants per §1 to `writer.py`.
2. Add `APPEND_*_TARGETS` constants per §2.
3. Add `patch_composer`, `patch_composition`, `patch_recording_outer` verbs.
4. Expand `patch_musician`, `patch_raga`, `patch_edge` to accept the nested-path selectors and dispatch internally.
5. Add `add_note(entity_type, id, note)` — a single new verb that appends to the entity's `notes[]` array, creating it if absent (this satisfies ADR-097 Phase B step 5; restated here because it is the `annotate` verb the matrix relies on).

### Phase C (Edit form side)

1. Add `PATCH_METADATA` and `APPEND_METADATA` constants to `entry_forms.js` per §6.
2. Implement the entity-type dispatcher in `buildEditForm()` covering all six entity rows of §1.
3. For each nested-selector field, render an element-picker (combobox over the entity's current `<vid>`s / `<host>`s / `<key>`s) before the value input.
4. Implement the lecdem-variant branch of the YouTube entry editor per §4.
5. Implement the Wikipedia-URL convenience row per §3.

### Verification

For each row of §1: open Edit form, select the entity type, pick an entity, patch one field per cell, download the bundle, ingest, render, confirm the value changed on the panel. For each row of §2: append one element to one array per cell, ingest, render, confirm the new element appears.

The matrix in §1 + §2 is the test plan. The Edit form is complete when every cell has been exercised end-to-end.

This ADR closes the remaining gap between *read implies write* (ADR-085 §3) and *read implies edit* (ADR-097) — by naming, exhaustively, what it means to edit each thing.
