# ADR-099: Bundle Dependency Resolution — Cascading Creates Inside a Single Bundle

**Status**: Accepted
**Date**: 2026-04-25
**Agents**: graph-architect (proposer), carnatic-coder (downstream implementer)
**Depends on**: ADR-016 (writer validation), ADR-083 (bundle as canonical write channel), ADR-085 (self-replicating curation loop), ADR-097 (bundle deltas + unified Edit form)
**Extends**: ADR-083 §1 (envelope), ADR-097 §3 (per-bucket op matrix)

---

## Context

ADR-097 made bundle items *delta-shaped*: a single contributor session can patch a field, append a YouTube entry, or annotate a raga. The pattern is sound. But there is a friction the rasika hits the moment she actually uses the unified Edit form against real material:

> She is appending a `youtube[]` entry to TM Krishna. The recording is a Tyāgarāja kṛti she has just identified — *Sarasa Sāma Dāna* — and the composition is **not yet in `compositions.json`**. The Edit form's composition combobox does not contain it. ADR-097's escape hatch (§6 last paragraph) tells her to use the inline "+ Add new composition" affordance, which adds a `create composition` item to `bundle.compositions[]`. She then completes the YouTube append, downloads the bundle, and runs `bani-add`.
>
> The bundle is rejected. `_process_musicians` runs before `_process_compositions` (`bani_add.py` line 704 vs 710), so the YouTube `append` item references a `composition_id` that does not yet exist on disk; the writer's referential check fails; the entire item errors. The contributor's natural workflow — *spot a thing, name it, attach it* — is structurally forbidden by the ingester's bucket order.

Today the workaround is two bundles: one to create the composition, render, then a second to append the YouTube entry. This violates ADR-085 §1 (the loop must close in a single pass over the contributor's intent) and re-introduces exactly the friction ADR-097 was written to remove. **The bundle is supposed to be a transcript of intent. Intent does not respect bucket order.**

The same friction exists in every direction the rasika might add new material:

| Workflow | What references what |
|---|---|
| Append a YouTube entry naming a new composition | `musicians.append.youtube` references `compositions.create` |
| Append a YouTube entry naming a new raga | `musicians.append.youtube` references `ragas.create` |
| Append a performer to a YouTube entry, where the performer is a new musician | `musicians.append.youtube[vid].performers` references `musicians.create` |
| Append a lecdem subject (raga) where the raga is new | `musicians.append.youtube[vid].subjects.raga_ids` references `ragas.create` |
| Create a composition that names a new composer | `compositions.create.composer_id` references `composers.create` |
| Create a recording that names a new performer | `recordings.create.sessions[].performers[].musician_id` references `musicians.create` |
| Add an edge between two musicians, one of which is new | `edges.create` references `musicians.create` |

Each of these is a single human gesture. Each must be a single bundle.

### Forces

| Force | Direction |
|---|---|
| **Single-bundle intent (ADR-085 §1)** | One contributor session = one bundle. The ingester must accept the bundle as authored, not require the contributor to pre-render between adds. |
| **No reference forward in time** | The writer's referential checks are correct — they protect corpus integrity. They must continue to fire. The fix is *ordering*, not weakening validation. |
| **Determinism** | Two contributors authoring the "same" bundle (same items, possibly in different order) must produce the same on-disk state. Bundle item order inside a bucket is not a contract today; making it one would be a regression. |
| **Cycles are real-but-rare** | Composer A wrote a kṛti in raga R, and raga R is named in honour of composer A — pathological, but the schema does not forbid it. The ordering algorithm must terminate even when the dependency graph contains a cycle, by ingesting whatever it can and surfacing the rest as a per-item error. |
| **Single validation point (ADR-016)** | The dependency resolver lives in `bani_add.py` (transport). The writer's per-verb validation is unchanged. |
| **Loud failure on residue** | If after resolution some items still cannot ingest (true cycle, or a reference to an entity that was *neither* in the bundle *nor* on disk), the per-item error message must say *which* missing reference blocked it, so the contributor knows what to add to the next bundle. |
| **No silent re-ordering of effects** | The ingester reorders items for *processing*, but the summary it emits to the contributor preserves the original authored order — so the diff she sees back matches the diff she wrote. |

---

## Pattern

**Christopher Alexander, *The Nature of Order*, Book 1, Property 3 — *Boundaries* (the strong-boundary case).** The bundle's outer boundary (envelope, schema_version, the six buckets) is unchanged. The *inner* structure — the order in which buckets and items are processed — is currently a leaky implementation detail of `bani_add.py` that the contributor must know in order to author a working bundle. This ADR seals that boundary: the order is computed by the ingester from the items themselves, and the contributor is freed from knowing it.

**Property 5 — *Alternating Repetition*.** The fix is the well-known alternation between *declaration* and *use*: declare every entity that any item refers to, then process every item that uses those declarations. A two-pass ingest (creates first, then patches/appends/annotates) is the simplest expression. We will use it, with one refinement: creates that depend on other creates (composition.composer_id → composer.id) need a sub-ordering inside Pass 1, which a single topological sort over the create items handles.

**ADR-085 §6 (monotone-additive).** Dependency resolution adds no new ops, no new buckets, no new write surfaces. It is a strict reordering of existing items. The bundle artefact, the writer verbs, and the rendered graph are unchanged.

---

## Decision

### 1 — Two-pass ingest with intra-pass topological sort

`bani_add.py` replaces its current fixed-order bucket loop with a two-pass algorithm:

**Pass 1 — Creates.**
Collect every item across every bucket whose `op` is `create` (or absent, which defaults to `create` per ADR-097 §2). Topologically sort them by intra-bundle reference. Process in sorted order. Emit one `[CREATE PASS]` summary block.

**Pass 2 — Mutations.**
Process every non-create item — `patch`, `append`, `annotate` — in *authored* order, grouped by bucket for readability. Every reference target now exists either on disk or because Pass 1 just created it. Emit one `[MUTATION PASS]` summary block.

The output the contributor sees:

```
[CREATE PASS]
  ragas:        +1   (sarasangi)
  composers:    +0
  compositions: +1   (sarasa_sama_dana)
  musicians:    +0
  recordings:   +0
  edges:        +0
[MUTATION PASS]
  musicians:    ~1   (tm_krishna: append youtube +1)
[OK] bundle ingested. Run bani-render to refresh graph.html.
```

### 2 — Topological sort over Pass 1

Build a directed graph `G` over create items only. Edges are *dependency* edges: an item `A` has an edge `A → B` if `A` references the id of `B` and `B` is also a create item in this bundle. Reference extraction is shape-driven, one rule per item type:

| Create item type | Outgoing references (intra-bundle only) |
|---|---|
| `ragas.create` | `parent_raga` (if creating a janya whose mela is also in this bundle) |
| `composers.create` | — (composers reference nothing) |
| `compositions.create` | `composer_id`, `raga_id` |
| `musicians.create` | every `youtube[].composition_id`, every `youtube[].raga_id`, every `youtube[].performers[].musician_id`, every `youtube[].subjects.{raga,composition,musician}_ids[]` |
| `recordings.create` | every `sessions[].performers[].musician_id`, every `sessions[].performances[].{composition_id, raga_id, composer_id}` |
| `edges.create` | `source`, `target` |

References to ids that are **not** in the bundle are ignored at sort time — they will be validated against disk during ingest, exactly as today.

Process `G` with Kahn's algorithm (queue of zero-indegree nodes). Stable tiebreaker: bucket order from ADR-083 (`ragas, composers, compositions, musicians, recordings, edges`), then authored order within bucket. This makes the sort deterministic across runs and across contributors.

**Cycle handling.** If Kahn's algorithm terminates with un-processed nodes, those nodes are part of a cycle. The ingester:
1. Logs `WARN: dependency cycle in create pass: <list of item ids>`.
2. Attempts to ingest each cycle node anyway, in bucket order. The writer will reject any whose references genuinely cannot resolve; those become per-item errors with the existing `ERROR: <bucket>[<id>] references unknown <type> '<id>'` message, augmented to add `(also missing in this bundle)`.
3. Continues to Pass 2.

This guarantees termination, loses no ingestible work, and surfaces the irresolvable items by name.

### 3 — Pass 2 mutation ordering

Pass 2 needs no topological sort — every reference target either pre-existed on disk or was created by Pass 1. Items run in authored order, grouped by bucket for log clarity (so the contributor can match the summary to the buckets she wrote). The grouping is a presentation detail; correctness does not depend on it.

If a Pass 2 item still references an unknown id (e.g. an `append youtube` whose `composition_id` is neither on disk nor in the bundle's create items), it errors with the existing message — exactly today's behaviour for the un-resolvable case.

### 4 — Inline create from the Edit form: same bundle, no new affordance

ADR-097 §6 specified an inline "+ Add new …" escape hatch from the unified Edit form. This ADR makes that escape hatch *fully sufficient*: the new entity goes into `baniBundle.<creates-bucket>` and the dependency-resolving ingester handles the order. No new UI element, no warning to the contributor that her bundle "won't ingest as authored" — because under this ADR, it will.

The Edit form's composition combobox, raga combobox, musician combobox, and composer combobox each gain (if not already present) an `+ Add new …` row at the bottom of their dropdown, which opens the corresponding mini create-form inline (the same form the standalone Add buttons use, rendered as a sub-block). On submit, the new entity is staged into the bundle's create bucket and the combobox is auto-selected to the new id. The rasika's gaze never leaves the Edit window.

### 5 — `schema_version` is unchanged

Two-pass ingest is **not** a schema change. v1 bundles still ingest under v1 semantics (bucket order), and v2 bundles ingest under the new dependency-resolved order. Actually — refinement — even v1 bundles benefit, because v1 bundles can also exhibit the create-references-create case (a `create musician` whose `youtube[].composition_id` is a `create composition` in the same bundle). Therefore: **the two-pass algorithm replaces the fixed-order loop unconditionally for both v1 and v2 bundles.** This is observably backwards-compatible because every bundle that ingested cleanly under fixed order also ingests cleanly under topological order (the fixed order is a valid topological order for any bundle that did not exhibit the references-create case).

### 6 — Errors are scoped to the item, not the bundle

A single item failing — whether by cycle, missing reference, or writer rejection — does not abort the bundle. Other items continue to ingest. This is the existing per-item error contract (ADR-083 §6) and is preserved unchanged. The only addition: the per-item error message names the *missing reference* explicitly when that is the cause, with a parenthetical noting whether the missing id is also absent from the bundle.

---

## Consequences

### Positive

- **The intent contract is restored.** A rasika can spot a new composition mid-edit, add it inline, attach the YouTube entry, and ingest in one pass. The friction ADR-097 §6 left dangling is closed.
- **Bundle authoring becomes order-independent.** Two contributors authoring the same set of items in different orders produce identical on-disk state. Reviewers no longer need to think about bucket order.
- **The ingester documents the dependency graph by computing it.** The reference-extraction table in §2 is the canonical statement of what references what across the schema — a useful artefact in its own right (it mirrors what the writer's referential checks already enforce in scattered form).
- **Cycles fail loudly and partially** rather than silently corrupting state. Today a cycle would not be reached because there is no try-add-anyway path; the user would simply re-author. Tomorrow the user gets a precise diagnostic.
- **No schema bump, no migration, no UI surface.** The change is internal to `bani_add.py` and improves every existing v1 bundle and every future v2 bundle equally.

### Negative / accepted tradeoffs

- **Two passes through the bundle is a small performance cost.** Bundles are tens to hundreds of items at most. The cost is irrelevant.
- **Reference extraction must stay in sync with the schema.** Adding a new id-typed field to any entity requires updating the table in §2. Mitigated: the same reference table is already implicit in the writer's validation; this ADR makes it explicit. A future ADR could derive both from a single declaration.
- **The contributor sees a different log shape** (`[CREATE PASS]` / `[MUTATION PASS]` instead of one block per bucket). Accepted: the new shape is more honest about what the ingester did.

### Risks

- **A contributor relies on intra-bundle bucket order semantics that the old fixed-order loop accidentally provided.** None known in the corpus's authored bundles. The deterministic tiebreaker (bucket order, then authored order) preserves observable behaviour for any bundle that did not exhibit forward references — i.e. every bundle that ingested cleanly today.
- **The reference-extraction logic mis-classifies a field as a reference (or fails to).** Mitigated by the same test suite that exercises the writer's referential checks; one new test per row of the §2 table is sufficient.
- **A cycle that today would have been authored as two bundles is now authored as one and silently partially-ingests.** Mitigated by the WARN log and the augmented error message — the contributor sees exactly what blocked, and can resolve manually.

---

## Implementation

Carnatic Coder, in `carnatic/bani_add.py`:

1. Add `_collect_create_items(bundle) → list[CreateItem]` that walks all six buckets and yields `(bucket, item, item_id)` for every `op == "create"` (or absent).
2. Add `_extract_refs(bucket, item) → set[str]` per the §2 table — one match-on-bucket function. Returns the set of ids the item references.
3. Add `_topo_sort_creates(items) → (sorted_items, cycle_items)` using Kahn's algorithm with the bucket-order + authored-order tiebreaker. Cycle nodes are returned separately for the warn-and-try-anyway path.
4. Refactor the main `_run_bundle` body: Pass 1 calls `_process_<bucket>` once per bucket but with only the create items, *in topo-sorted order across buckets*. Pass 2 calls each `_process_<bucket>` with the non-create items in authored order.
5. Augment the writer's "unknown reference" error path to add `(also missing in this bundle)` when applicable. This requires `bani_add.py` to pass the set of bundle-create ids into the writer call site, or — cleaner — to wrap the writer call and rewrite the error message at the transport layer. Prefer the wrapper.
6. Update `bani_add.py`'s docstring to cite this ADR alongside ADR-083 and ADR-097.

In `carnatic/render/templates/entry_forms.js`:

7. Audit every reference combobox in the Add and Edit forms (composition, raga, composer, musician). Each must end its dropdown with a `+ Add new …` row that opens the corresponding mini create-form inline and auto-selects the new id on submit. Most are already present per ADR-031 / ADR-097 §6; this is a coverage check, not a redesign.

### Verification

- A hand-authored bundle with one `create composition` and one `append youtube` (musician existing on disk; YouTube references the new composition by id) ingests cleanly. Both items appear in the summary in the correct passes.
- A bundle with the same two items in *reversed* authored order ingests identically.
- A bundle with a true cycle (composition X composer→A; composer A — synthetic edge — references composition X via, say, a future field) emits the WARN log, ingests what it can, and emits per-item errors for the rest.
- Every existing v1 bundle in `tests/bundles/` (if such a fixtures dir exists; otherwise ad-hoc) continues to ingest with byte-identical disk state.
- A bundle authored entirely from the unified Edit form using inline "+ Add new composition" produces a single one-pass ingest that the rasika never had to think about.

This ADR is the order-of-operations contract the bundle promised but did not yet deliver.
