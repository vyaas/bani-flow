# ADR-143: Bundle as Object-Oriented Patch File — Per-Chip-Type Patch Coverage

**Status**: Accepted
**Date**: 2026-05-16
**Accepted**: 2026-05-16
**Author**: Graph Architect
**Depends on**: ADR-016 (writer validation as single source of truth), ADR-083 (bundle as canonical write channel), ADR-085 (self-replicating curation loop), ADR-097 (bundle deltas + unified edit forms)
**Couples with**: ADR-142 (chip as object — double-click opens the object's form)
**Extends**: ADR-097 §§2–3 (the op matrix); accelerates ADR-097 from Proposed to required by the time ADR-142 ships.

---

## Context

ADR-142 makes every chip a write surface. For that pattern to *work*, the backend must accept a patch operation for every entity type a chip can name. ADR-097 §3's matrix is most of the way there:

| Bucket | `create` | `patch` | `append` | `annotate` |
|---|:---:|:---:|:---:|:---:|
| `ragas` | ✓ | ✓ | ✓ | ✓ |
| `composers` | ✓ | ✓ | — | ✓ |
| `musicians` | ✓ | ✓ | ✓ | ✓ |
| `compositions` | ✓ | ✓ | — | ✓ |
| `recordings` | ✓ | **—** | — | ✓ |
| `edges` | ✓ | ✓ | — | — |

The `—` in `recordings.patch` is the gap. ADR-097 §3 rationalises it: *"recordings are file-shaped, not field-shaped"*. That rationale held while the only thing a contributor could do to a recording was create one or annotate it. Under ADR-142, that rationale fails:

- **Case (4)** in ADR-142 §Decision §2: double-clicking a concert chip (e.g., `Columbia 1932`) opens an Edit form for the recording. The user adjusts segments, retitles the concert, adds a lecdem subject. None of these are creates; none are appends to a *musician* array; none are notes. They are *patches to fields on the recording entity*.
- A concert recording is a single JSON file with a stable id and a small set of editable top-level fields (title, year, source_url, segments[], subjects.*) plus arrays. Recordings are *as field-shaped as musicians are*; the file/field distinction was an artefact of how the create-time form was assembled (one form per recording type), not a property of the data.

The ADR-142 chip taxonomy also surfaces a second gap. The user's case (4) involves editing **time segments** of a concert/lecdem — `segments[].start`, `segments[].composition_id`, `segments[].raga_id`. These need an `append`-style op to add a segment, a `patch`-style op to retime or relabel an existing segment, and (acceptably for now) no delete op (ADR-085 §6 monotone-additivity).

Finally, the user's framing of the bundle deserves explicit ratification: **the bundle is a patch file**. Not a snapshot, not a draft, not a delta-stream — a patch file in the conventional sense: an ordered list of typed operations that, when applied to the current state of the data directories, produces the next state. This is what ADR-097 §1–3 already says implicitly, but the surface still uses words like "items" and "bucket" that obscure the file's purpose. This ADR commits to the framing.

### Forces

| Force | Direction |
|---|---|
| **Coupling with ADR-142** | Every chip-edit gesture must land on a backend op. Gaps in the op matrix become silent UX failures: a chip the user can double-click but whose changes the bundle cannot represent. |
| **Recording as a first-class field-shaped entity** | The "file-shaped" exemption no longer holds. Recordings must accept `patch` and bounded `append` (for `segments[]`, `subjects.*`, `performers[]`). |
| **Monotone additivity (ADR-085 §6)** | This ADR does **not** add `delete` for any bucket. Removing a segment, removing a subject, removing a performer remain librarian-tier escape hatches. |
| **Single validation point (ADR-016)** | Every new op goes through a `CarnaticWriter.patch_recording` / `append_recording_segment` / etc. method with a `PATCHABLE_RECORDING_FIELDS` whitelist. The ingester is transport, not validator. |
| **Patch as the conceptual model** | The bundle is renamed in documentation (not in the JSON envelope key) as a *patch file*. The envelope key `items` stays for backward compatibility; prose, help-deck text, and tooltips speak of patches. |
| **One op per chip gesture** | Each `Stage` press in a chip-opened form produces exactly one op. A complex edit (retime three segments + add a subject) produces four ops, in order. The bundle preserves order; the ingester applies them in order. No bulk-edit op. |
| **Idempotence where natural** | `patch` is idempotent on the same field/value. `append` is not (it pushes a new element each time). `annotate` is not (it pushes a new note each time). The user is responsible for not double-staging. The bundle UI shows the staged ops list so this is visible. |
| **No new buckets** | Concerts are not a new top-level bucket; a concert is a *recording* whose file conventionally describes a multi-track session. The bucket count stays at six (ADR-083 §4). |

---

## Pattern

**Levels of Scale** (Alexander).
The patch operates at three nested scales:
1. The *entity* (musician, raga, composition, recording, edge) — `create`, `patch`, `annotate`.
2. The *array on an entity* (musician.youtube[], musician.sources[], raga.aliases[], recording.segments[], recording.subjects.*) — `append`.
3. The *element inside an array on an entity* (youtube[vid].performers[], segment[i] retitling) — `append` (for the former) and `patch` via a structured selector (for the latter).

Each scale uses the same verb vocabulary. The selector grows; the verbs do not. This is the same shape ADR-097 §3 already established for `youtube[vid].performers`; ADR-143 generalises it.

---

## Decision

### 1 — The bundle is a patch file (ratification)

The artefact `bani_add_bundle.json` is, in prose and documentation, **the patch file**. The envelope's JSON key remains `items` (ADR-083 §1; no breaking rename). The help-deck, the Bundle button tooltip, and `bani-add`'s `--help` output use the word "patch":

- Bundle button (was: `⬇ Bundle (N items)`) → `⬇ Patch (N ops)`.
- `bani-add --help` (was: `Consume a bani-add bundle JSON ...`) → `Apply a bani-add patch file to the data directories.`
- Help-deck: a one-paragraph explanation of patch semantics.

The JSON envelope key `items` is grandfathered; `ops` is accepted as an alias in v3 (future ADR). v2 remains the active schema.

### 2 — Recording bucket gains `patch` and bounded `append` ops

Extending ADR-097 §3's matrix:

| Bucket | `create` | `patch` | `append` | `annotate` |
|---|:---:|:---:|:---:|:---:|
| `recordings` | ✓ (today) | **✓ — single field** | **✓ — `segments[]`, `subjects.raga_ids[]`, `subjects.composition_ids[]`, `subjects.musician_ids[]`, `performers[]`** | ✓ |

**Recording-kind agnosticism.** The op matrix above is per *bucket*, not per *recording kind*. Concert, lecdem, and misc recordings all live in the `recordings` bucket and accept the same ops. The Edit form rendered by ADR-142's dispatch may *show* different field subsets per kind (e.g., a lecdem foregrounds `subjects.raga_ids[]`, a concert foregrounds `segments[]`, a misc recording foregrounds `composition_id` + `raga_id`), but those are presentation choices over the same op surface. There is no `patch_concert` / `patch_lecdem` / `patch_misc` proliferation in the writer; there is `patch_recording`.

**Patchable recording fields** (the `PATCHABLE_RECORDING_FIELDS` whitelist):

`title`, `year`, `source_url`, `source_label`, `notes_summary`, and any future scalar top-level field the schema admits. (The Coder pins the exact list against the current `recordings/*.json` schema; this ADR names the *kind* of fields, not an exhaustive list — that exhaustive list is itself patched-in via this ADR's implementation.)

**Bounded append selectors** (for recordings):

```jsonc
// add a segment to a concert
{ "op": "append",
  "bucket": "recordings",
  "id":     "vina_dhanammal_columbia_1932",
  "array":  "segments",
  "value":  { "start": "00:14:32",
              "composition_id": "intha_chalamu",
              "raga_id": "begada",
              "label": "Veenai Kuppayyar — Intha Chalamu" } }

// add a raga subject (for a lecdem) to an existing concert/lecdem recording
{ "op": "append",
  "bucket": "recordings",
  "id":     "tm_krishna_lecdem_2019",
  "array":  "subjects.raga_ids",
  "value":  "todi" }

// add a performer to a concert recording
{ "op": "append",
  "bucket": "recordings",
  "id":     "vina_dhanammal_columbia_1932",
  "array":  "performers",
  "value":  { "musician_id": "tirukkodikaval_krishna_iyer", "role": "violin" } }
```

**Patching a specific segment** (case (4) of ADR-142):

Segments are identified by their `start` timestamp (the natural key — segments cannot share a start within a recording). The selector path uses the timestamp:

```jsonc
{ "op": "patch",
  "bucket": "recordings",
  "id":     "tm_krishna_lecdem_2019",
  "field":  "segments[00:14:32].composition_id",
  "value":  "intha_chalamu" }
```

If two segments share a start (data error), the writer refuses the patch and reports the ambiguity. Index-based selectors (`segments[0]`) remain forbidden per ADR-097 §3 (concurrent appends invalidate indices).

### 3 — Edit-form field coverage per chip type (the dispatch contract)

Every chip type ADR-142 lets the user double-click MUST have a corresponding Edit form whose fields cover at least the entity's editable surface. The minima:

| Chip type → Edit form | Patchable fields (minimum) | Append targets (minimum) | Annotate? |
|---|---|---|---|
| Musician | `born`, `died`, `wikipedia_url`, `bani`, `gender`, `era`, `instruments[*]` | `youtube[]`, `sources[]`, `youtube[vid].performers`, `youtube[vid].subjects.*` | ✓ |
| Raga | `cakra`, `melakarta_number`, `parent_raga`, `wikipedia_url`, `arohanam`, `avarohanam` | `aliases[]`, `sources[]` | ✓ |
| Composition | `composer_id`, `raga_id`, `language`, `tala`, `wikipedia_url`, `lyrics_url` | `sources[]` | ✓ |
| Recording (concert / lecdem / misc) | `title`, `year`, `source_url`, `notes_summary` | `segments[]`, `subjects.raga_ids[]`, `subjects.composition_ids[]`, `subjects.musician_ids[]`, `performers[]` | ✓ |
| Recording-segment (selector `recording_id + start`) | `start`, `end`, `composition_id`, `raga_id`, `label` | `performers[]` | — |
| Edge (guru→shishya) | `confidence`, `source_url`, `note` | — | — |

The Coder pins the exact fields against the current schema at implementation time. New fields added to a schema later automatically become patchable when added to the `PATCHABLE_*_FIELDS` whitelist; no further ADR is required for additive field coverage.

### 4 — Per-chip Edit form is a thin view over the op matrix

The Edit form a chip opens is not a custom-per-chip-type form file. It is generated from a per-type metadata block (the same shape ADR-097 §6 described — but now scoped to a single entity):

```javascript
// One-time metadata, one entry per entity type.
const editFormSpec = {
  musician:    { patchable: [...], appendable: [...], annotatable: true },
  raga:        { patchable: [...], appendable: [...], annotatable: true },
  composition: { patchable: [...], appendable: [...], annotatable: true },
  recording:   { patchable: [...], appendable: [...], annotatable: true },
  edge:        { patchable: [...], appendable: [],   annotatable: false },
};

// openEditForm({ entityType, id }) reads editFormSpec[entityType],
// loads the current state from graphData, and renders the patch / append / annotate blocks.
```

The form is the same window template for every entity type; only the rendered fields differ. This is a Coder concern but ADR-143 mandates that the dispatch contract (the metadata block above) be the *single source of truth* on the front-end side, mirroring `PATCHABLE_*_FIELDS` on the writer side. Drift between the two is forbidden; the Coder may keep them in sync via a generated header or a render-time fetch — implementation detail.

### 5 — `Stage` produces one op; the patch list is visible

The Edit form does not commit to the data file (ADR-085 §1: no out-of-loop writes). Each `Stage <patch | append | annotate>` button pushes exactly one op into `baniBundle.<bucket>`. The Bundle button label increments. The user may open the staged-op list (a future Coder affordance, not mandated here) to review and remove staged ops before download.

### 6 — `bani-add` rolls forward the op matrix in one phase

Where ADR-097 Phase B proposed implementing patch/append/annotate gradually, this ADR collapses the rollout: when ADR-142 ships, **all rows of the matrix in §2 (this ADR) must be implemented** in `bani-add`. Partial coverage would create silently-undeliverable chip-edit gestures — exactly the failure ADR-142 §Forces names. The Coder implements:

- `CarnaticWriter.patch_musician(id, field, value)` — already specified by ADR-097.
- `CarnaticWriter.patch_raga(id, field, value)` — already specified.
- `CarnaticWriter.patch_composition(id, field, value)` — already specified.
- `CarnaticWriter.patch_recording(id, field, value)` — **new** (ADR-097 omitted).
- `CarnaticWriter.append_to_recording_segments(id, segment)` — new.
- `CarnaticWriter.append_to_recording_subject(id, subject_kind, subject_id)` — new.
- `CarnaticWriter.append_to_recording_performers(id, performer)` — new.
- `CarnaticWriter.patch_recording_segment(id, start, field, value)` — new.
- `CarnaticWriter.annotate_recording(id, note)` — new.
- `PATCHABLE_RECORDING_FIELDS` — new whitelist.

Plus the existing append/annotate methods ADR-097 specified for musicians/ragas/composers/compositions.

### 7 — Refused operations remain refused (ADR-085 §6, reaffirmed)

This ADR does **not** introduce `delete`, `remove`, or `rename` for any bucket. Specifically: deleting a segment, removing a subject from a recording, removing a performer from a recording remain librarian-tier escape hatches. The chip Edit form for a recording therefore has **no delete buttons**. When a contributor needs to remove a segment, the Edit form shows the segment in its current state with a hint: *"To remove this segment, ask a librarian."* (Exact wording is a Coder decision.)

### 8 — Schema-version stays at 2

ADR-097 bumped to v2 for delta ops. This ADR extends *what* v2 contains; it does not bump again. A v2 bundle that includes recording-patch ops is well-formed. An older `bani-add` (without the new `patch_recording` etc.) sees a v2 bundle, recognises the version, attempts to apply the op, and refuses cleanly with: `ERROR: recordings item has unsupported op 'patch' (this bani-add ingests v2 without recording-patch coverage; upgrade with 'pip install -e . --upgrade').` The refusal contract from ADR-083 §3 holds.

### 9 — Front-end ⇄ ingester naming parity (preserved)

ADR-083 §4 holds. ADR-097 §9 holds. No new bucket keys are introduced. Per-chip metadata blocks (`editFormSpec`) name *entity types*, which map 1:1 to bucket keys (`musician` ↔ `musicians`, etc.). The mapping is total and conventional.

---

## Consequences

### Positive

- **Every chip-double-click in ADR-142 has a corresponding op.** The UX and backend ship together; no silently-undeliverable gestures.
- **Recordings become first-class editable.** This was always the natural shape; this ADR makes it explicit.
- **The "patch file" framing names the artefact correctly.** Contributors, reading their own download, see what the file *does* — apply patches — rather than reading "items" and inferring.
- **Future schema growth is cheap.** Adding a new patchable field is one entry in `PATCHABLE_*_FIELDS` plus one entry in `editFormSpec`. No new ADR for additive field coverage.
- **The ingester remains transport.** All op validation is in `CarnaticWriter`. ADR-016 unchanged.

### Negative / accepted tradeoffs

- **More writer methods to maintain.** Recording patch/append/annotate add ~5 methods. Tractable; mirrors what musician/raga already have.
- **Segment selector by timestamp is awkward if the timestamp itself needs to be patched.** Renaming a segment's `start` requires two ops in order: patch with `field = "segments[old_start].start"`, `value = new_start`. The writer handles this case by updating the key and rebuilding any dependent selectors before applying the next op in the same bundle. This is a real edge case; the writer must test it.
- **The Bundle button rename to "Patch" is a small breaking change for muscle memory.** Users have learned "Bundle". One-time tooltip on rollout: *"The Bundle button is now Patch. Same behaviour, clearer name."*

### Risks

- **Op-order assumptions.** Some sequences are order-sensitive (create a recording, then patch a field on it). The bundle preserves insertion order (§Forces); `bani-add` applies in order. The writer must error clearly when an op references an entity not yet created in the same bundle.
- **Concurrent contributors patching the same field.** Two contributors download the graph, both patch `tm_krishna.born`. The second patch in time wins on ingest. This is a librarian-tier reconciliation concern, not a writer concern. Out of scope for this ADR.
- **`editFormSpec` ⇄ `PATCHABLE_*_FIELDS` drift.** If the two diverge, the front-end may stage an op the writer rejects. Mitigation: a small CI check that loads both and asserts equality. Coder follow-up.

---

## Implementation

This ADR ships with ADR-142. Coder phases interleave:

### Phase α — `editFormSpec` defined in JS
Single per-type metadata block, derived from the current writer whitelists. Mirrors `PATCHABLE_*_FIELDS`.

### Phase β — Recording patch/append/annotate in the writer
`CarnaticWriter` gains the methods listed in §6. Unit tests for each.

### Phase γ — `bani-add` op coverage
Ingester dispatches recording-patch / append / annotate ops to the writer. Schema-version stays at 2. Tests: a v2 bundle with one patch_recording op applies cleanly; a v2 bundle with patch_recording on a non-existent recording errors clearly.

### Phase δ — Bundle → Patch language change
Button label, help-deck copy, `bani-add --help`. Envelope key unchanged.

### Phase ε — Edit form per chip
Per-chip Edit form renders from `editFormSpec`. Triggered by ADR-142's chip-double-click dispatcher.

### Verification

- `bani-render` passes after every phase.
- `python3 carnatic/cli.py validate` passes after every applied patch.
- A round-trip test: open a chip, edit a field, stage, download patch, run `bani-add patch.json`, re-render, verify the change is visible on the panel.
- `editFormSpec` keys × patchable fields == writer's `PATCHABLE_*_FIELDS` for every entity type (CI check).

### Branch

Backend-and-UX ADR; couples with ADR-142. Branch: `adr/143-bundle-as-patch-file`. PR before merging. Implementation branches descend per phase (`feature/143β-writer-recording-patches`, `feature/143γ-ingester-recording-ops`, …) or fold into `feature/143-bundle-as-patch-file`.
