# ADR-085: The Self-Replicating Curation Loop — Governing Principle for Write Surfaces

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect (governing principle for all four agents)
**Depends on**: ADR-016 (writer validation source-of-truth), ADR-024 (render refactor), ADR-031 (data entry forms), ADR-083 (bundle as canonical write channel), ADR-084 (lecdem-aware bundle ingestion)
**Status of dependents**: this ADR is meta — it does not introduce new code paths, it constrains all future ones.

---

## Context

Bani Flow has crossed a threshold. It began as a render pipeline: data went in, `graph.html` came out, the rasika read it. The reader was distinct from the author. Authoring meant editing JSON files in a text editor and re-running the render.

That distinction has dissolved. With ADR-031 (entry forms), ADR-070/071 (performer entry), ADR-077–082 (lecdems), and now ADR-083 (bundle channel), every artefact `graph.html` displays can also be authored *from inside `graph.html`*. The single self-contained file is now reader and author at once. A rasika clicks `+ Lecdem`, fills in the dropdowns (every option populated from the very `graphData` they are reading), downloads `bani_add_bundle.json`, runs two CLI commands, and the next render of `graph.html` contains their contribution.

This is not just a feature. It is a **change in kind**:

- Before: the system was a publication. Authors lived elsewhere; readers were terminals.
- After: the system is a workshop. Every reader is a potential author. The graph is a thing the rasika maintains, not a thing they consume.

The technical name for this shape is a **self-replicating, self-editing system**. Each `graph.html` carries within it the means to produce the next `graph.html`. The data, the schema, the entry forms, the validators, the render pipeline are all reachable from a fresh clone. There is no external service, no privileged author, no schema enforced only on a server. The corpus and the tools to extend it are the same artefact.

This ADR's job is to **name the loop** and make it the shape every future write surface must conform to. It is not a code change. It is a constitutional commitment.

### What the loop looks like

```
   ┌─────────────────────────────────────────────────────────────────┐
   │                       graph.html (current)                       │
   │                                                                  │
   │  reads: nodes, edges, ragas, compositions, recordings, lecdems  │
   │  writes: bani_add_bundle.json (via entry forms, ADR-031/082)    │
   └────────────────────────────────────┬────────────────────────────┘
                                        │  user downloads, runs CLI
                                        ▼
                        ┌──────────────────────────────┐
                        │   bani-add  bundle.json      │
                        │   (carnatic/bani_add.py,     │
                        │    governed by ADR-083)      │
                        └──────────────┬───────────────┘
                                       │  per-item dispatch to writer
                                       ▼
                        ┌──────────────────────────────┐
                        │   CarnaticWriter             │
                        │   (carnatic/writer.py,       │
                        │    sole validation site —    │
                        │    ADR-016)                  │
                        └──────────────┬───────────────┘
                                       │  atomic per-entity writes
                                       ▼
                        ┌──────────────────────────────┐
                        │   data/musicians/*.json      │
                        │   data/ragas/*.json          │
                        │   data/compositions/*.json   │
                        │   data/recordings/*.json     │
                        └──────────────┬───────────────┘
                                       │  bani-render
                                       ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                       graph.html (next)                          │
   │                                                                  │
   │  same shape, contributed entries now visible and authorable      │
   └─────────────────────────────────────────────────────────────────┘
```

The loop is closed. There is no node in this diagram that lives outside the repository. There is no node that requires a network call. There is no privileged step.

### Forces

| Force | Direction |
|---|---|
| **Closure** | Every artefact the system reads must be authorable through the loop. No data path may exist that bypasses `bundle → bani-add → writer → entity files → render`. |
| **Locality** | A rasika with a clone of the repo and Python installed must be able to run the entire loop offline. No external services. No network dependencies in the write path. |
| **Single validation point** | `CarnaticWriter` is the validation choke point. Browser forms, CLI verbs, bundle ingestion, and any future surface all converge on it. Validation rules live in writer code; surfaces describe them in their UI. |
| **Append-only at the entity layer** | The loop adds. Renames, restructurings, and deletions are out-of-loop operations that require an ADR and (often) a migration script. The rasika's loop does not delete. |
| **Schema is part of the cargo** | The bundle schema (ADR-083) and per-entity schemas (ADR-016, READYOU files) ship inside every clone. A user can validate a bundle they authored without contacting the project. |
| **Graph reads from the same shape it writes** | The on-disk shape and the bundle's `YoutubeEntryItem` shape are the same (ADR-083 §2d). The render pipeline does not transform writes back into reads — they are the same objects, byte-equivalent across the loop boundary. |

---

## Pattern

**Christopher Alexander, *The Nature of Order*, Book 2: The Process of Creating Life — Structure-Preserving Transformations.** A living structure grows by transformations that preserve the structure already present and add new strong centres at the right scale. The loop in this ADR *is* a structure-preserving transformation: each pass through it adds entities at the entity scale, performances at the recording scale, lecdems at the youtube-entry scale — never reshaping what is already there. The same loop runs whether one rasika adds one lecdem or ten contributors add ten musicians; the corpus grows by the same step at every iteration.

**Pattern 24, *A Pattern Language*: Sacred Sites.** Some places must be authored by the people who use them, not by remote authors. The Carnatic tradition's transmission is itself this pattern — every guru is also a former shishya, every shishya a future guru. The graph that documents the tradition must follow the tradition's own shape: every reader a potential author. Bani Flow's curation loop is the technical expression of this commitment.

**Property 1, *Strong Centres*.** The loop has six centres: graph.html (the surface), the bundle (the contract), bani-add (the dispatcher), the writer (the validator), the entity files (the storage), and the render pipeline (the regenerator). Each is independently reasonable. Each can be replaced without changing the others, provided the contracts at the boundaries hold.

**Property 7, *Boundaries*.** The bundle (ADR-083) is the boundary between authored intent and stored state. The writer is the boundary between transport and storage. The render pipeline is the boundary between storage and presentation. The loop has three skins; the loop is held together by them.

---

## Decision

### 1 — The loop is the only write path

Every change to repository data MUST go through the loop:

```
  intent  →  bundle  →  bani-add  →  writer  →  entity files  →  render
```

This is normative for code paths. Manual edits to `data/**/*.json` by a librarian (with `apply_diff` or hand-editing) remain permitted as a librarian-tier escape hatch (per CLAUDE.md and `.clinerules`), but they are **outside the loop** and do not enjoy its guarantees. The loop is the path the system itself uses to grow; the manual escape hatch is for surgical corrections that the loop cannot express (e.g., fixing a typo in an existing field).

### 2 — Every new write surface conforms to the loop

A "write surface" is anything that produces or modifies entity data. Examples authored or proposed: the entry forms (ADR-031, 082), the `write_cli.py` verbs (ADR-015, 071, 082), the bundle ingester (ADR-083, 084).

A future write surface — examples include a CLI playlist importer, a watchdog that ingests `~/Downloads/*.json`, a mobile share-target shim, a browser-extension scrobbler — MUST:

- **Produce a bundle** that conforms to ADR-083. It MUST NOT write directly to `data/**/*.json`.
- **Pass `bani-add`'s validation.** No bypassing. The bundle is validated by the same ingester used by `entry_forms.js` downloads.
- **Use `CarnaticWriter` for any direct CLI writes** (e.g., a CLI verb that writes a single entity). The writer is the single validation point regardless of surface.
- **Not invent a parallel write channel.** No second bundle format, no per-surface JSON shape, no surface-private validation. The loop has one shape.

A new ADR introducing a write surface MUST cite ADR-083 and this ADR, and demonstrate how the surface's output enters the loop at the bundle boundary.

### 3 — Every new read surface preserves authorability

A "read surface" is anything the rasika sees in `graph.html`. ADR-031 established that every entity type the read surface displays should also be authorable from the read surface. ADR-077 extended this to lecdems. The pattern is now general:

A new entity type, association type, or facet that is rendered in `graph.html` MUST come with an entry surface (form + CLI verb) by the time it is shipped, OR the introducing ADR MUST explicitly defer the entry surface to a follow-up ADR with a name. There MUST NOT be entity types that the rasika can read but cannot author through the loop. This commitment is what makes the loop "complete" in the self-replication sense.

(Exception by precedent: derived/computed indexes — like `lecdems_about_raga` from ADR-078 — are not authored; they are recomputed from authored data. They live outside this rule because they have no authoring semantics.)

### 4 — Schema, validators, and templates ship inside the clone

The repository must contain everything required to run the loop offline:

- The bundle schema (this ADR, ADR-083, the `bani_add.py` docstring).
- The per-entity schemas (READYOU files, writer code).
- The render templates (`carnatic/render/templates/`).
- The Python tooling (`pyproject.toml`, `pip install -e .`).

A clone with no internet access (after `pip install -e .` once) must be able to: read `graph.html`, author a bundle in the forms, run `bani-add`, run `bani-render`, see the new content in the next `graph.html`. This is the test of locality. It is verified at every release by a fresh-clone smoke test (manual until a CI step is added).

### 5 — The render is idempotent and append-aware

The render pipeline (`bani-render`) MUST be idempotent: running it twice on the same data produces byte-identical `graph.html` (modulo a `generated_at` timestamp). This is what makes the loop's outer boundary reliable — a contributor can re-run the render to verify their bundle ingested correctly, with no risk of perturbing unrelated content.

The pipeline MUST handle append additions (new musicians, new youtube entries, new lecdems) without requiring any other file to change. This is already true and is hereby ratified as a constraint, not just an observed property.

### 6 — Deletions and renames are explicitly out-of-loop

The loop adds. It does not remove. The CLI has surgical removal verbs (`remove_youtube_entry.py`, …) that operate outside the loop and are documented as librarian-tier tools. A future ADR may introduce a removal/rename surface inside the loop, but until then, the asymmetry is intentional: the rasika's contribution path is monotone-additive, which is the easiest shape to reason about and the safest to expose to many contributors.

### 7 — The loop's safety properties

The combination of ADR-083 (bundle whitelist + schema versioning), ADR-016/084 (writer as single validation site), and the render-gate convention (writes must be followed by `bani-render` before CLI queries reflect them) gives the loop these properties:

- **No silent corruption.** Every write either succeeds (entity file updated, validate passes) or fails loudly (per-item error in bani-add output).
- **No partial bundles.** A bundle either fully ingests (with per-item skips/errors reported) or refuses (schema version mismatch, unknown item type). There is no half-ingested state visible to render.
- **No schema drift.** The bundle, the writer, and the render pipeline all reference the same field shapes. Drift is a code-review artefact, not a runtime bug.

---

## Consequences

### Positive

- **Bani Flow becomes a community-curatable corpus** without infrastructure. Anyone with a clone can contribute. A future `Pull Request` workflow is a thin wrapper around: clone → bundle → ingest → render → commit → push.
- **The system's growth path is named and constrained.** Future write features have a template. Reviewers (human and AI) can ask "does this conform to ADR-085?" and get a clear answer.
- **Every read becomes a potential write.** A rasika exploring TM Krishna's lecdems sees not only what is there but the affordance to add what is missing. The graph teaches its own extension.
- **The per-rasika personal collection use case is supported by construction.** A rasika can fork the repo, ingest only their own bundles, and maintain a private superset of the upstream corpus. The loop runs the same way for one user as for the project.
- **Migrations and breaking changes have a clear discipline.** They go through `schema_version` bumps in ADR-083 and migration scripts under the librarian/coder tier; they never sneak in via a write surface.

### Negative / accepted tradeoffs

- **The loop is now load-bearing.** Future contributors must understand it before introducing write features. Mitigated by this ADR being short, named, and linked from `entry_forms.js`, `bani_add.py`, `writer.py`, `CLAUDE.md`, and `.clinerules`.
- **Some authoring affordances will feel slow** because the loop requires a CLI step (`bani-add` + `bani-render`). This friction is intentional — the CLI is where validation and atomicity live. A future ADR could collapse the CLI step into a single browser button using a local helper process, but that is a UX layer over the same loop, not a replacement for it.
- **Manual JSON edits remain permitted but unblessed.** The librarian's escape hatch is real and necessary; this ADR does not deprecate it. The cost is a slight ambiguity in onboarding ("which path should I use?"). Resolved by `.clinerules` guidance: forms first, CLI verbs second, manual edits only for surgical fixes.

### Risks

- **A future contributor adds a write feature that bypasses the loop** (e.g., a `quick_add.py` that writes a JSON file directly). Mitigated by this ADR being citable in code review and by `.clinerules` enumeration of the loop as the only sanctioned write path.
- **The loop's CLI-step requirement excludes pure-browser contributors** until a local helper is built. Mitigated by clear documentation of the two-command sequence (`bani-add bundle.json && bani-render`) and by the fact that contributors who can clone the repo already have a terminal.
- **`schema_version` bumps could fragment the contributor base** (older clones can't ingest newer bundles). Mitigated by the ingester's clear refusal message and by treating bumps as rare, ADR-driven events.

---

## Implementation

This is a governing ADR. It does not introduce code. Its implementation is documentary and procedural:

1. **`CLAUDE.md`** (Architect)
   - Add a "Self-replicating curation loop" subsection under "Reference" linking this ADR. One paragraph.

2. **`carnatic/.clinerules`** (Architect, then maintained by all agents)
   - Add a section "The Curation Loop" with the diagram from §Context and a one-sentence pointer per arrow to the governing ADR.
   - Update the existing "Write CLI Tools" section to note that all CLI verbs converge on `CarnaticWriter` per ADR-016, and that all in-browser writes go through the bundle per ADR-083.

3. **`carnatic/render/templates/entry_forms.js`** (Coder)
   - Update the file-header comment to cite ADR-083 (bundle contract) and this ADR (governing loop). One sentence each.

4. **`carnatic/bani_add.py`** (Coder)
   - Update the module docstring's opening paragraph to cite this ADR as the loop's governing principle.

5. **`carnatic/writer.py`** (Coder)
   - Add a one-paragraph module docstring citing ADR-016 (validation source-of-truth) and this ADR (single validation site for the loop).

6. **README.md** (Coder, light touch)
   - Add a short paragraph in the project description: "Bani Flow is a self-editing system: every reader is a potential author. See ADR-085 for the curation loop."

7. **Verification**
   - This ADR's test is conceptual: every existing write surface (ADR-031 forms, write_cli verbs, bani_add ingestion) demonstrably traces through the loop. Confirmed by inspection.
   - Operational test: a fresh clone, `pip install -e .`, `bani-serve`, author a lecdem in the form, download the bundle, `bani-add bundle.json`, `bani-render`, refresh — the lecdem is present. This is the loop's smoke test and should be runnable by any new contributor as their onboarding exercise.

---

## Closing note

This ADR is short on novelty and long on commitment. Almost everything it names already exists. Its purpose is to **name the shape** so that the next twenty ADRs do not accidentally undermine it. A self-replicating system is not a feature you add; it is a property you protect. This ADR is the protection.
