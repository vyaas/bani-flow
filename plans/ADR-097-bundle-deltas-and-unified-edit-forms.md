# ADR-097: Bundle Deltas, Unified Edit Forms, and Source Inference

**Status**: Proposed
**Date**: 2026-04-25
**Agents**: graph-architect (proposer), carnatic-coder + librarian (downstream implementers)
**Depends on**: ADR-016 (writer validation), ADR-031 (data entry forms), ADR-083 (bundle as canonical write channel), ADR-085 (self-replicating curation loop)
**Inspired by**: ADR-095 (BaniWiki / TiddlyWiki convergence)
**Supersedes**: nothing — this ADR *extends* the bundle envelope (schema_version 1 → 2) additively. v1 bundles continue to ingest unchanged.

---

## Context

Three observations have converged.

**1. Bundles are wasteful.** Today, when the rasika edits anything about an existing musician — adds one YouTube entry, fixes a year, adds an accompanist to one track — the entry forms (ADR-031) emit the *entire* musician JSON file as a "create" item, and the ingester silently `SKIP`s it as a duplicate. The contribution path for *editing* an existing entity is therefore: download a 200-line file, hand-merge it into `data/musicians/<id>.json`, re-render. This bypasses the loop (ADR-085 §1) and forfeits every safety property the loop provides.

The fix is the natural one: **bundle items should describe what changed, not what exists**. A patch to a single field is a four-line item. An appended YouTube entry is a one-array-element item. A new note on a raga is a two-line item. The bundle becomes a transcript of intent, not a snapshot of state.

**2. Reading a thing should imply being able to edit it.** ADR-031 made every entity *creatable* from the read surface. ADR-085 §3 elevated this to a constraint: every read surface must come with a write surface. But "edit" is the missing case. A rasika reading TM Krishna's panel can add a new lecdem (great), but if she notices a wrong year on an existing entry, or wants to attach a personal note to a recording, she has no in-loop affordance. She must either tolerate the error or leave the loop and edit JSON by hand.

The fix is **a unified Edit form**: one window that lets her pick any first-class entity (musician, raga, composition, recording, edge, individual `youtube[]` entry) from a dropdown, see its current state, and submit a delta — a patched field, an appended array element, or a free-form note. The same form, when used to *add* a new entity, simply unlocks the entity-creation block instead of the patch block.

This is the TiddlyWiki shape (ADR-095): a single dispatch surface keyed on entity type, with read and write affordances on the same artefact. We are not migrating to TiddlyWiki today, but the *latent centre* (ADR-095 Pattern §1) is exactly here — a unified Edit form is the strongest centre we can name without leaving our current host.

**3. The Add Musician form has too many demand-fields, and some of them mean nothing the system can use.**

- `BANI / GHARANA` is asked at create-time. But a musician's bani is *inferred from the music and the lineage*, not asserted before either is recorded. Every existing high-quality bani assignment in the corpus came from a librarian after listening, reading sources, and tracing edges — never from the musician themselves declaring it on entry. Asking for it at the entry form is a category error: it teaches contributors that bani is metadata to be guessed at intake, when it is in fact a property the system reveals over time.
- `SOURCE LABEL` and `SOURCE TYPE` are asked alongside `SOURCE URL`. Both are *derivable* from the URL: `en.wikipedia.org/...` is `{label: "Wikipedia", type: "wikipedia"}`; `karnatik.com/...` is `{label: "karnatik.com", type: "article"}`; a `.pdf` is `{label: "PDF", type: "pdf"}`; `archive.org` is `{label: "Internet Archive", type: "archive"}`. The corpus already contains hundreds of source records that follow this pattern; the inference function is straightforward and the manual fields add friction without adding signal. Worse, the `type` dropdown is a small enumeration that contributors can get wrong (an `archive.org` link mistagged as `other`); inference removes the failure mode.

The chip on a musician panel that links out to a source uses the URL's host (`Wikipedia`, `karnatik.com`) as its display label today; nothing on the read surface depends on the contributor having chosen the right `label` and `type` at entry time.

### Forces

| Force | Direction |
|---|---|
| **Loop closure (ADR-085 §1)** | Editing must be in-loop. Today it is not. The bundle must support edit deltas, or rasikas will continue to bypass the loop for fixes. |
| **Bundle compactness** | A one-line-edit bundle should be one item, not one full entity copy. Bundle size scales with intent, not with entity size. |
| **Additive evolution (ADR-083 §3)** | Bumping `schema_version` 1 → 2 must accept v1 bundles unchanged and accept v2 bundles that contain only v1-style items. Old downloads still ingest. |
| **Single validation point (ADR-016)** | New delta verbs go through `CarnaticWriter.patch_*`, `add_*`, etc. The ingester is transport, not validator. |
| **Dropdowns over typing** | Every reference to an existing entity (composer, raga, accompanist, lecdem subject) is a combobox over `graphData`. Typing free-text where a dropdown would do introduces id-drift. |
| **Inline escape hatches (ADR-031)** | When the dropdown does not contain the entity the contributor wants, an inline "+ Add new …" affordance opens the relevant create-form section without leaving the Edit window. |
| **Append-only at the entity layer (ADR-085 §6)** | Edits add or change. They do not delete. Removing a youtube entry, an edge, or an entity is out-of-loop and remains a librarian-tier escape hatch (`remove_youtube_entry.py`, `remove_edge`). |
| **Source inference is total** | The URL → `(label, type)` function must produce a sensible answer for every URL the contributor might paste. The default arm (`other`) catches the unknown case; nothing is rejected. |
| **Notes on every entity** | A free-form `notes[]` array is the universal annotation surface. Every entity type accepts it. The ADR-085 loop applies: notes are append-only via the bundle. |

---

## Pattern

**Christopher Alexander, *The Nature of Order*, Book 1, Property 7 — *Boundaries*.** The bundle is the boundary between authored intent and stored state (ADR-083 Pattern). Today that boundary is *coarse-grained*: every item is a whole entity. This ADR makes it *fine-grained*: every item is the smallest unit of intent that the writer can validate. Coarse boundaries pretend each contribution rewrites the world; fine boundaries let the contribution describe exactly what it changes. The latter is closer to how human attention actually works.

**Property 1, *Strong Centres*.** The unified Edit form is one strong centre that subsumes six (one per entity type today). The centres are not destroyed; they are folded into a single dispatch surface that lets the contributor pick the centre she wants to act on. The Tiddler model (ADR-095 §2) demonstrates that this folding does not weaken the centres — it makes their commonality (every entity has an id, a type, a set of patchable fields, a set of appendable arrays, a notes vector) into the primary axis of interaction.

**Property 14, *Gradients*.** Source inference replaces a flat-and-uninformed enumeration (`wikipedia / pdf / article / archive / other`) with a gradient from "well-known host" (Wikipedia, karnatik.com, archive.org) through "structural hint" (extension `.pdf`) to "unknown" (defaults to `other`). The gradient is in the inference function, not in the contributor's head.

**ADR-085 §3 (read implies write) is now extended to *read implies edit*.** The constraint becomes: every entity the rasika can read must be both creatable and editable through the loop. This is the third invariant in the trilogy and completes it.

---

## Decision

### 1 — Bundle envelope: `schema_version` bumps to 2; v1 still accepted

The envelope (ADR-083 §1) is preserved. `schema_version: 1` bundles ingest exactly as today. The new behaviour is gated on `schema_version: 2`. The ingester's `MAX_VERSION` becomes `2`. There are no v1 → v2 migrations: v1 items at v2 are valid because v2 is a strict superset.

### 2 — Items become *delta-shaped* via an `op` discriminator

Every item under every bucket gains an optional top-level `op` field:

```jsonc
{
  "op": "create"   // today's behaviour: full-entity create. Default when op is absent.
       | "patch"    // change a single field on an existing entity
       | "append"   // push one element onto an array on an existing entity
       | "annotate" // append a note to the entity's notes[] vector
}
```

Default: `op` absent ⇒ `op: "create"`. This is what makes v1 bundles ingest under v2 — they have no `op` field, so every item is treated as a create.

The `op` value is part of the contract. Unknown `op` values are a per-item error: `ERROR: <bucket> item has unknown op '<op>'. Known ops for <bucket>: create, patch, append, annotate.` Per-bucket op support is in §3.

### 3 — Per-bucket op matrix and item shapes

| Bucket | `create` | `patch` | `append` | `annotate` |
|---|:---:|:---:|:---:|:---:|
| `ragas` | ✓ (today) | ✓ — single field | ✓ — `aliases[]` | ✓ |
| `composers` | ✓ (today) | ✓ — single field | — | ✓ |
| `musicians` | ✓ (today: `type: "new"`) | ✓ — single field | ✓ — `youtube[]`, `sources[]`, `youtube[i].performers[]`, `youtube[i].subjects.*[]` | ✓ |
| `compositions` | ✓ (today) | ✓ — single field | — | ✓ |
| `recordings` | ✓ (today: full file) | — (recordings are file-shaped, not field-shaped) | — | ✓ |
| `edges` | ✓ (today) | ✓ — `confidence`, `source_url`, `note` | — | — |

**Worked shapes**:

```jsonc
// patch a single field on an existing musician
{ "op": "patch",
  "bucket": "musicians",      // implicit: this item is in items.musicians[]
  "id":     "tm_krishna",
  "field":  "born",
  "value":  1976 }

// append one youtube entry to an existing musician
// (this REPLACES today's "type: youtube_append" item — which remains valid for v1 compat)
{ "op": "append",
  "id":     "tm_krishna",
  "array":  "youtube",
  "value":  { /* one YoutubeEntryItem, ADR-083 §2d */ } }

// append one performer to an existing youtube entry on an existing musician
{ "op": "append",
  "id":     "tm_krishna",
  "array":  "youtube[<vid>].performers",   // <vid> = the 11-char YouTube id of the target entry
  "value":  { "musician_id": "akkarai_subbulakshmi", "role": "violin" } }

// annotate an existing raga with a free-form note
{ "op": "annotate",
  "id":     "kharaharapriya",
  "note":   { "text":       "Mela 22; common janyas: kapi, abheri, sriranjani.",
              "source_url": "https://en.wikipedia.org/wiki/Kharaharapriya" } }

// patch a raga field
{ "op": "patch",
  "id":     "kharaharapriya",
  "field":  "cakra",
  "value":  4 }

// patch an edge
{ "op": "patch",
  "source": "ariyakudi_ramanuja_iyengar",
  "target": "semmangudi_srinivasa_iyer",
  "field":  "confidence",
  "value":  0.95 }
```

**Constraints** (per-op, normative):

- `patch` items reference an existing entity; if the entity does not exist, the item errors. The `field` MUST be on the writer's `PATCHABLE_*_FIELDS` whitelist for that entity type.
- `append` items reference an existing entity; if the entity does not exist, the item errors. The `array` selector is one of: a top-level array name (`youtube`, `sources`, `aliases`), or a path of the form `youtube[<vid>].<sub>` where `<sub>` ∈ {`performers`, `subjects.raga_ids`, `subjects.composition_ids`, `subjects.musician_ids`}. The `<vid>` is the YouTube video id (11 chars), which uniquely identifies the entry within the musician's `youtube[]`. (Index-based selectors are forbidden — they break under concurrent appends.)
- `annotate` items append to a `notes[]` array on the target entity. The note shape is `{ text: string (required), source_url?: string, added_at?: ISO-8601 string }`. The writer fills `added_at` if absent. This implies a small schema addition: every entity type gains an optional `notes[]` field. No existing data files need to change; the field is present-or-absent.
- `create` items are unchanged from ADR-083.

### 4 — Source inference: URL alone is sufficient at the boundary

The Add forms (musician, raga, composer, composition) accept `Source URL` as the only required field of the source block. `Source Label` and `Source Type` controls are removed from the UI.

The bundle item produced by the form contains either:
- a full source object `{ url, label, type }` where `label` and `type` are computed by JS from the URL — OR —
- a minimal source object `{ url }`, with the writer doing the inference at ingest time.

**Decision**: the inference happens in **JS at form-submit time**, so the bundle artefact remains self-describing (a contributor inspecting the JSON sees a complete source object). The inference function is a small lookup with a default arm and lives in `entry_forms.js`:

```javascript
// inferSource(url) → { url, label, type }
//   Wikipedia hosts        → label "Wikipedia",          type "wikipedia"
//   Wikisource hosts       → label "Wikisource",         type "wikipedia"
//   karnatik.com           → label "karnatik.com",       type "article"
//   sangeethamshare.org    → label "sangeethamshare",    type "article"
//   *.archive.org          → label "Internet Archive",   type "archive"
//   url ends in .pdf       → label "PDF",                type "pdf"
//   sruti.com              → label "Sruti",              type "article"
//   carnaticheritage.in    → label "Carnatic Heritage",  type "article"
//   indiaartreview.com     → label "India Art Review",   type "article"
//   eambalam.com           → label "eambalam",           type "article"
//   anything else          → label = URL host,           type "other"
```

The host-to-label table is a small constant in `entry_forms.js`. Adding a new well-known host is a one-line change. The corpus already exhibits all of the hosts above; the table is grounded, not speculative.

The CLI `add-musician` verb (and friends) retain `--source-label` / `--source-type` flags for librarian-tier writes (those flags are defaults-omittable in a follow-up Coder ADR; this ADR does not require it).

### 5 — `Bani / Gharana` is removed from create forms

The `Bani / Gharana` row is removed from the Add Musician form (the standalone form and the merged musician+recordings form). The `bani` field on existing musician records is unchanged; future `patch` items can still set it (`{ op: "patch", id: "...", field: "bani", value: "..." }`), used by a librarian after the lineage is documented. The form-time prompt is gone; the field stays in the schema as a *derived assertion*, not a *demanded input*.

This deprioritises bani at the entry surface without removing it from the data model. ADR-095's exploration may eventually re-shape bani as a tag (TiddlyWiki style), but that is out of scope here.

### 6 — Unified Edit form (the dispatch surface)

A new entry point opens an `Edit` window that combines all edit affordances:

```
┌─ Edit ──────────────────────────────────────────────┐
│ Entity type:  [Musician ▾]                          │
│ Pick:         [combobox over graphData …  ▾]        │
├──────────────────────────────────────────────────────┤
│  PATCH FIELD                                         │
│   Field: [combobox of patchable fields ▾]            │
│   New value: [input or select per field type]        │
│   [+ Stage patch → bundle]                           │
│  APPEND TO ARRAY                                     │
│   Array: [youtube ▾ | sources ▾ | aliases ▾ | …]     │
│   Element: [inline mini-form per array type]         │
│   [+ Stage append → bundle]                          │
│  ADD NOTE                                            │
│   Text: [textarea]                                   │
│   Source URL: [optional]                             │
│   [+ Stage note → bundle]                            │
└──────────────────────────────────────────────────────┘
```

The form is *one window*, not three. Selecting the entity type reveals the legal patch fields and array selectors (driven by a single per-type metadata block in JS — the same metadata the writer's `PATCHABLE_*_FIELDS` constants describe in Python). Each "Stage" button pushes a delta item into `baniBundle.<bucket>` and the existing Bundle download path emits it. The unified form **does not introduce a new write channel** — it conforms to ADR-085 §2 by emitting bundle items only.

The "Add" forms (today: per-entity windows) remain. The Edit form does not subsume creation; it sits *alongside* the create surfaces and shares the bundle.

### 7 — The notes[] surface

Every entity gains an optional `notes[]` array. Schema:

```jsonc
"notes": [
  { "text": "string (required)",
    "source_url": "string (optional)",
    "added_at": "ISO-8601 UTC string (writer-filled if absent)" }
]
```

`notes[]` is **strictly append-only** via the loop. Edits and deletions of notes are not supported by the bundle; they are librarian-tier file edits. The render layer chooses how to surface notes (likely as a small footnote section on each panel) — that is a Carnatic Coder follow-up, not in this ADR.

### 8 — Refused operations remain refused

Per ADR-085 §6, the loop is monotone-additive. This ADR does **not** add: `op: "delete"`, `op: "remove"`, or `op: "rename"`. Removing a youtube entry, removing an edge, or renaming an entity remain librarian-tier scripts (`remove_youtube_entry.py`, `remove_edge`, hand-edit). Adding a delete-op surface to the bundle is a future ADR with its own forces to weigh.

### 9 — Front-end ⇄ ingester naming parity (preserved)

ADR-083 §4's parity rule still holds: `addToBundle(type, obj)` keys are exactly the six bucket names. The new `op` field lives *inside* each item, not as a new bucket key. No new whitelisted bucket key is introduced.

---

## Consequences

### Positive

- **Editing is in-loop.** Every fix, every annotation, every appended performer flows through `bundle → bani-add → writer → entity files → render`. The loop closure invariant of ADR-085 is restored for the edit case.
- **Bundle size scales with intent.** A typo fix is a four-line item, not a 200-line snapshot. Bundles authored across long discovery sessions stay readable.
- **The unified Edit form is the affordance the read surface always needed.** A rasika reading TM Krishna's panel can correct a year on a recording, attach a note to a raga, append an accompanist she just identified — without leaving immersion.
- **Source inference removes a failure mode.** Mistagged sources (`archive.org` links labelled `other`, etc.) become impossible at the form layer. The corpus's source vocabulary becomes consistent by construction.
- **Bani is no longer a pretend-fact at intake.** Contributors are no longer asked to assert a bani they have not yet learned. The field remains in the schema for librarians to set after the music speaks.
- **Notes give the corpus a place for soft knowledge.** Observations that do not fit any field — "this recording is widely cited as the canonical version", "the raga's chaya is unmistakably *deshya*" — get a structured home.
- **The path to BaniWiki (ADR-095) shortens.** Patch / append / annotate are the three operations TiddlyWiki natively expresses; this ADR teaches Bani Flow the same vocabulary inside its current host. If the BaniWiki branch lands, the migration is a vocabulary re-mapping, not a semantic re-design.

### Negative / accepted tradeoffs

- **The bundle schema grows.** Reviewers must understand four ops, not one. Mitigated by the per-bucket op matrix in §3 being the single normative table.
- **The unified Edit form is a non-trivial UI.** The MVP can ship with only Musician support and grow per entity type without breaking the bundle contract. Per-entity rollout is a Coder backlog.
- **Notes are unstructured.** A `text` field invites prose that no query can read. Accepted: notes are the soft-knowledge tier; structured fields remain the queryable tier. Notes complement, not compete.
- **`vid` selectors in `append` paths assume YouTube uniqueness within a musician's `youtube[]`.** True today (the writer's add-youtube enforces it). Lecdems and recitals share the namespace. If a musician ever has two entries for the same `vid`, the selector is ambiguous — this is already a corpus-integrity violation, not a new surface concern.

### Risks

- **A v2 bundle authored in a newer browser hits an older `bani-add`.** ADR-083 §3's refusal mechanism handles this: the older ingester reports `schema_version 2 > 1`, refuses cleanly, instructs `pip install -e . --upgrade`. No silent corruption.
- **Inferred source labels drift from existing corpus labels.** Existing data uses labels like `"Wikipedia"`, `"karnatik.com"`, `"Sruti"`. The inference table is seeded from these so new writes match. Drift is a code-review artefact when the table is updated.
- **The unified Edit form's inline "+ Add new" escape hatch could re-introduce duplicate-entity bugs** (a contributor adds a "new" raga that already exists under a different id). Mitigated by the existing duplicate-id warning in `efIdRow` (entry_forms.js line ~600s) — it fires on any create item, regardless of which form opened it.

---

## Implementation

This ADR is large enough to span multiple Coder sessions. The work is partitioned into **Phase A** (this session — surgical, immediately valuable) and **Phase B / C / D** (follow-up sessions, gated on this ADR's acceptance).

### Phase A — Source simplification + bani removal *(this session)*

Carnatic Coder, in `carnatic/render/templates/entry_forms.js`:

1. Add an `inferSource(url)` helper near the existing `efSourceFields` definition, with the host-to-label table from §4.
2. Reduce `efSourceFields(prefix, defaults)` to render *only* the Source URL row. Remove the `Source Label` and `Source Type` rows (lines ~630–637 today).
3. Remove the `Bani / Gharana` row from `buildMusicianForm` (line ~742) and from the merged musician+recordings form's "new musician" section (line ~2287).
4. In `generateMusicianJson` (and the merged form's analogue), call `inferSource(srcUrl)` to construct the `sources[0]` object. Validation now requires only `srcUrl` (not `srcLbl` / `srcType`).
5. Apply the same source-row simplification to `buildRagaForm`, `buildComposerForm`, `buildCompositionForm` for parity. (Bani is a musician-only field; only the musician forms drop it.)
6. Run `bani-render`; verify `graph.html` builds; spot-check the form by opening the rendered HTML and adding a musician with only a URL.

The Python ingester needs **no change** for Phase A — it already accepts `sources[0].label` / `sources[0].type` with `.get(..., default)`, and the inferred values from JS are already valid. The JS produces complete source objects, so the writer's existing validation (`source_type ∈ VALID_SOURCE_TYPES`) is satisfied by construction.

### Phase B — Bundle deltas at the ingester (`schema_version: 2`)

Carnatic Coder, in `carnatic/bani_add.py` and `carnatic/writer.py`:

1. Bump `MAX_VERSION = 2` in `bani_add.py`.
2. Add an `op` dispatcher inside each `_process_*` function. Default `op = "create"` (today's path).
3. For `op == "patch"`: dispatch to `writer.patch_musician` / `patch_raga` / `patch_edge` (already exist). Add `patch_composition` and `patch_composer` to writer.py with the same shape and a `PATCHABLE_*_FIELDS` whitelist.
4. For `op == "append"`: dispatch by `array` selector. The `youtube[<vid>].performers` and `youtube[<vid>].subjects.*` paths reuse `writer.add_youtube_performer` and `writer.add_lecdem_subject` (already exist). Top-level `youtube`, `sources`, `aliases` reuse existing add verbs.
5. For `op == "annotate"`: add `writer.add_note(entity_type, id, note)` — a single new verb that appends to the entity's `notes[]` array, creating it if absent. One implementation, six entity-type cases.
6. Update `bani_add.py`'s docstring and ADR-083 reference to cite this ADR for the v2 envelope.

### Phase C — Unified Edit form (the dispatch surface)

Carnatic Coder, in `carnatic/render/templates/entry_forms.js`:

1. Add `buildEditForm()` per §6's wireframe. Reuse `efCombobox`, `efSelect`, `efRow` primitives.
2. Define a `PATCH_METADATA` constant in JS that mirrors the writer's `PATCHABLE_*_FIELDS` Python constants. (A future Phase D could generate this from a single source of truth.)
3. Wire each "Stage" button to call `addToBundle('<bucket>', { op: '...', ... })`.
4. Add a top-level `+ Edit` button alongside the existing `+ Add` buttons in the entry-form launcher.
5. MVP: ship with Musician + Raga + Edge support. Composition / Composer / Recording follow in subsequent commits.

### Phase D — `notes[]` rendering on panels

Carnatic Coder, in `carnatic/render/templates/media_player.js` and `bani_flow.js`:

1. When rendering an entity panel, if `notes.length > 0`, append a small `Notes` section showing `text` (linkified if `source_url` present) and `added_at` (relative time).
2. Style as a footnote tier — softer than primary data.
3. No data migration: panels with no notes render unchanged.

### Verification (per phase)

- **Phase A**: `bani-render` succeeds; the rendered Add Musician form shows no Bani row, no Source Label / Type rows; submitting a Wikipedia-URL-only musician produces a bundle whose `sources[0]` is `{url, label: "Wikipedia", type: "wikipedia"}`.
- **Phase B**: a hand-written v2 bundle with one `patch` item ingests successfully and the field changes on disk; v1 bundles still ingest unchanged.
- **Phase C**: end-to-end — open Edit form, pick a musician, patch their `born` field, download bundle, run `bani-add`, run `bani-render`, the next graph.html shows the new birth year on the panel.
- **Phase D**: a note added via Edit form appears on the entity's panel after the next render.

This ADR is the contract under which all four phases ship. ADR-085 §2 (every new write surface conforms to the loop) is the test each phase must pass at code-review time.
