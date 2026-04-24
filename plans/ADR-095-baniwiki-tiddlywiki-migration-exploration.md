# ADR-095: BaniWiki — Exploratory Migration of Bani Flow onto TiddlyWiki

**Status**: Proposed (exploratory branch)
**Date**: 2026-04-23
**Agents**: graph-architect (proposer), carnatic-coder + librarian (downstream implementers if accepted)
**Depends on**: ADR-013 (single-source-of-truth traversal), ADR-016 (writer validation), ADR-024 (render refactor), ADR-031 (entry forms), ADR-083 (bundle as canonical write channel), ADR-085 (self-replicating curation loop)
**Supersedes**: nothing yet — this ADR proposes a *parallel branch*, not a replacement of the current pipeline.

---

## Context

ADR-085 named what Bani Flow had quietly become: a **self-replicating, self-editing system**. Every reader is a potential author; the same `graph.html` artefact carries reader, author, schema, validator, and regenerator. The loop is closed and offline-runnable.

Once that shape was named, a second observation became unavoidable: **we have re-discovered the TiddlyWiki pattern**. TiddlyWiki — Jeremy Ruston's single-file personal notebook — is the canonical existence proof that a self-modifying, self-replicating, single-file knowledge system is not only possible but stable across two decades and millions of users. The shipped artefact (`empty.html` in this repo, vendored as a reference) is a **quine**: it contains the data, the schema, the renderer, the editor, the search engine, and the means to write a new copy of itself.

Bani Flow currently re-implements, by hand and at small scale, several mechanisms TiddlyWiki has solved at industrial strength:

| Bani Flow concern | Current implementation | TiddlyWiki primitive |
|---|---|---|
| Per-entity records | `data/{musicians,ragas,compositions,recordings}/*.json` | tiddlers (one per entity) |
| Tagging & classification | implicit (folder + field conventions) | first-class `tags` field, indexed |
| Cross-entity associations | hardcoded edge arrays + lookup dicts in `graph_builder.py` | `[tag[X]] [field:y[Z]]` filter operators |
| Schema | `READYOU.md` + `writer.py` validators | tiddler `type`/`fields`, optional shadow tiddlers describing schema |
| Rendering | Jinja templates + inlined JS in `html_generator.py` | wikitext + JS macro tiddlers, hot-rendered |
| Search | bespoke phonetic search (ADR-017) | TW search + filter DSL + `[search[…]]` |
| Single-file ship | `bani-render` inlines everything | TW is a single file by construction |
| Append-only writes | bundle → `bani-add` → writer (ADR-083) | save-tiddler operations, conflict-free |
| Theming | hand-rolled CSS | TW theme tiddlers + palettes |

The user's framing — *"BaniWiki"* — is the right name. The migration question is no longer hypothetical: **could the entire corpus, schema, render pipeline, and authoring loop be re-expressed as tiddlers and filter operations inside a single TiddlyWiki, while preserving every node, edge, recording, lecdem, and ADR currently in the repository?**

This ADR does **not** decide to migrate. It proposes an **exploratory branch** in which a faithful, lossless mapping is constructed and demonstrated against a representative slice of the corpus, so the project has a concrete artefact to evaluate before committing.

### Forces

| Force | Direction |
|---|---|
| **Data preservation** | Every musician, raga, composition, recording, lecdem, and ADR currently in `data/**` and `plans/**` MUST round-trip through the migration with byte-equivalent semantics (allowing key reordering, whitespace normalisation, and explicit serialisation differences). |
| **Loop preservation** | The ADR-085 curation loop must remain runnable in BaniWiki form: read a tiddler, author a new tiddler in-browser, save the file, re-render — the next file contains the contribution. |
| **Filter expressivity** | Relationships currently expressed by joining on `composer_id`, `raga_id`, `parent_raga`, `bani`, `guru_ids`, etc. must be re-expressible as TiddlyWiki filter expressions — and ideally become *more* composable, not less. |
| **Visualisation parity** | The Bani Flow trail, the Raga Wheel, and the Musician panel must be reproducible as TiddlyWiki widgets (most likely as JS macro tiddlers wrapping the existing render code, not as wikitext rewrites). |
| **Continuity of work** | The exploratory branch must not block ongoing main-branch work (ADR-092 wheel controller, ADR-093/094 chip spacing, lecdem ingestion). The two tracks evolve in parallel until the project chooses. |
| **Reversibility** | Until the project commits, the BaniWiki artefact must be regenerable from `data/**` at any time. Authoring done inside BaniWiki during the exploration must round-trip back into `data/**` so no curation work is lost regardless of which track wins. |
| **Minimal lock-in** | The mapping should be expressible in plain JSON-import / plain JSON-export — TiddlyWiki has a stable `application/json` tiddler MIME and a JSON tiddler store, so we are not forced into wikitext for things that are naturally JSON. |

---

## Pattern

**Christopher Alexander, *The Nature of Order*, Book 2 — *Latent Centres*.** A latent centre is a structure that already exists implicitly in a system and only needs to be *named* and *strengthened* to become a strong centre. The TiddlyWiki shape is latent in Bani Flow: we already have per-entity files (tiddler-shaped), tags-by-convention (`bani`, `era`, `instrument`), filter-shaped queries (`cli.py` greps), and a single-file ship target (`graph.html`). This ADR proposes to *strengthen the latent centre* by adopting the host system that already embodies it, rather than continuing to re-implement it incrementally.

**Pattern 10, *A Pattern Language*: Magic of the City — but for systems: a place is alive when many small forces converge in one shape.** The convergence here is striking: every mechanism we have built (entity files, bundle ingestion, append-only writes, schema validation, single-file ship) already has a TiddlyWiki counterpart that is older, more battle-tested, and more general than ours. Adopting that host preserves our shape and grants us mechanisms we do not yet have (filter DSL, transclusion, palette/theme system, plugin economy).

**Property 7, *Boundaries*; Property 14, *Gradients*.** TiddlyWiki has clean boundaries (the tiddler is the atom, the filter is the join, the macro is the renderer) and natural gradients (shadow tiddlers → user tiddlers → drafts → saved state). Our current ad-hoc layering (JSON files → graph.json → graphData global → DOM) collapses several of these gradients into one step. The migration would re-introduce the gradient and let TiddlyWiki manage the transitions.

**ADR-085's loop is a special case of TiddlyWiki's normal mode of operation.** TiddlyWiki has been a self-replicating curation loop since 2004. We arrived at the same shape independently. This ADR proposes we *recognise the convergence* and decide whether to keep walking the parallel path or step onto the older, wider one.

---

## Decision

**Open an exploratory branch `baniwiki/exploration` that produces a faithful, lossless mapping of the current Bani Flow corpus onto a single TiddlyWiki file (`baniwiki.html`), without disturbing main-branch development.** The branch's goal is a concrete artefact the project can evaluate. The branch's deliverables and constraints are:

### 1 — Branch hygiene

- New branch: `baniwiki/exploration`, forked from current `main`.
- Main-branch work continues unimpeded. No `data/**` schema changes are made on main *because of* this exploration.
- Periodic rebases of `baniwiki/exploration` onto `main` keep the corpus current. The mapping scripts (see §3) are designed to be re-runnable, so rebasing is "regenerate the BaniWiki artefact from latest `data/**`", not a manual merge.
- The branch carries its own `BANIWIKI.md` charter pointing back to this ADR.

### 2 — Tiddler mapping (the type system)

Every entity in `data/**` becomes a tiddler. The mapping is **one entity = one tiddler** with a typed `tags` discipline. JSON-shaped fields are preserved by giving each tiddler `type: application/json` and storing the entity's JSON object as the tiddler text. Scalar metadata is also lifted into TiddlyWiki **fields** for filterability.

Proposed tiddler types (each is a tag namespace and a filter target):

| Bani Flow source | Tiddler title | Tags | Lifted fields | Text |
|---|---|---|---|---|
| `data/musicians/<id>.json` | `Musician/<id>` | `Musician`, `era:<era>`, `instrument:<instrument>`, `bani:<bani>` | `id`, `label`, `born`, `died`, `era`, `instrument`, `bani` | full JSON (incl. `youtube[]`, `sources[]`, `guru_ids[]`) |
| `data/ragas/<id>.json` | `Raga/<id>` | `Raga`, `mela:<mela_id>` (if janya), `Melakarta` (if mela) | `id`, `label`, `mela_id`, `melakarta_number`, `cakra` | full JSON |
| `data/compositions/<id>.json` | `Composition/<id>` | `Composition`, `composer:<composer_id>`, `raga:<raga_id>`, `tala:<tala>` | `id`, `label`, `composer_id`, `raga_id`, `tala`, `language` | full JSON |
| `data/recordings/<id>.json` | `Recording/<id>` | `Recording`, `concert:<id>`, plus per-track `Musician/<id>` references | `id`, `label`, `year`, `venue` | full JSON |
| `data/help/empty_panels.json` chips | `Help/EmptyPanel/<panel>` | `Help`, `Panel:<panel>` | as needed | JSON |
| `plans/ADR-NNN-*.md` | `ADR/NNN` | `ADR`, `Status:<status>` | `adr_number`, `date`, `status` | markdown body verbatim (TW renders markdown) |
| `carnatic/.clinerules` | `Operations/Clinerules` | `Operations` | — | markdown |
| `CLAUDE.md`, `CONTRIBUTING.md`, `README.md` | `Doc/<name>` | `Doc` | — | markdown |

This mapping is **lossless**: the original JSON object is the tiddler's text body, so any field we forget to lift into a TW field is still recoverable. Lifting into fields is purely for filter ergonomics.

### 3 — The mapper (`carnatic/baniwiki/`)

A new package on the exploratory branch (does not exist on main):

- `carnatic/baniwiki/mapper.py` — pure transform: `data/**` → list of tiddler dicts (`{title, tags, type, text, fields}`).
- `carnatic/baniwiki/build.py` — takes the tiddler list, takes `empty.html` (the vendored TiddlyWiki shell already in `carnatic/empty.html`), and produces `baniwiki.html` by injecting tiddlers into the `<script class="tiddlywiki-tiddler-store" type="application/json">` block. This is TiddlyWiki's documented ingestion contract.
- `carnatic/baniwiki/round_trip.py` — pure inverse: parse a `baniwiki.html` file's tiddler store, reconstruct `data/**` JSON files. This proves losslessness: `data → baniwiki → data` MUST produce byte-identical files (modulo deterministic key ordering and whitespace).
- `carnatic/baniwiki/cli.py` — entry points: `baniwiki-build` (forward), `baniwiki-roundtrip` (inverse + diff), `baniwiki-validate` (assert losslessness on every commit via a CI-equivalent script).

The mapper and inverse are **pure functions** in the Coder discipline (ADR-085 §4). No I/O outside the `cli.py` boundary.

### 4 — Filter atlas (the query layer)

The CLI queries we currently express as Python (`cli.py` verbs, `graph_api.py` joins) get a parallel expression as TiddlyWiki filter strings. The exploratory branch ships an **atlas** — a tiddler titled `Atlas/Filters` that lists, side by side, every existing query and its TW filter equivalent. Examples (illustrative, to be validated during exploration):

| Query | Bani Flow today | TW filter |
|---|---|---|
| All musicians of the Semmangudi bani | `python3 carnatic/cli.py musicians --bani semmangudi` | `[tag[bani:semmangudi]tag[Musician]]` |
| All compositions by Tyagaraja in Kharaharapriya | grep + filter | `[tag[composer:tyagaraja]tag[raga:kharaharapriya]]` |
| All recordings of Parulanna Matta | grep across `recordings/*.json` | `[tag[Recording]field:composition_id[parulanna_matta]]` (after lift) |
| All janyas of Kharaharapriya (mela 22) | bespoke join | `[tag[mela:kharaharapriya]tag[Raga]]` |
| Disciples of Ariyakudi (one hop) | `cli.py descendants` | `[tag[Musician]field:guru_ids[ariyakudi_ramanuja_iyengar]]` |

The atlas is the **proof of expressivity**: if every existing query maps cleanly to a TW filter, the migration is feasible at the query layer. If a query has no clean TW equivalent, that gap is recorded as an open question in the ADR and `.clinerules`.

### 5 — Render pipeline preservation

The Bani Flow trail, the Raga Wheel (ADR-022 / ADR-092), and the Musician/Bani-Flow panels are non-trivial pieces of JavaScript. The exploration **does not rewrite them as wikitext**. Instead:

- Each major view (`graph_view.js`, `raga_wheel.js`, `entry_forms.js`, `tutorial.js`, the panel controllers) becomes a **JavaScript macro tiddler** (`type: application/javascript`, `module-type: macro` or `widget`).
- The current `graphData` global becomes the output of a `[tag[Musician]] [tag[Raga]] [tag[Composition]] [tag[Recording]]` filter, marshalled by a small adapter macro into the same shape the existing JS expects. This keeps the render code unchanged on day one.
- `bani-render`'s job (concatenating templates and inlining everything) is replaced by `baniwiki-build`. The output (`baniwiki.html`) is also a single self-contained file — exactly the property we already prize about `graph.html`.

This means the migration can proceed **without rewriting any of the visualisation code**. The visualisation code is moved into the wiki as macro tiddlers, fed by filter-derived data, and continues to work.

### 6 — Authoring loop preservation (ADR-085 inside BaniWiki)

ADR-085's loop becomes simpler inside TiddlyWiki, not more complex:

- **Read**: every tiddler is its own page, addressable by title, indexed by tags.
- **Author**: TW's built-in editor handles tiddler creation. Our `entry_forms.js` (ADR-031, 082) becomes a TW widget — a custom UI that creates a typed tiddler with the right tags and fields. The bundle (ADR-083) becomes either: (a) a JSON tiddler that downloads on a button click — i.e., the same bundle flow we have today, ingested by the same `bani-add` if the user is round-tripping back to main; or (b) directly created tiddlers inside the wiki, with TW's "save changes" producing a new `baniwiki.html`.
- **Validate**: `writer.py`'s validation rules are ported to a JS validator macro that the entry widget calls before allowing save. The single-validation-point principle (ADR-016) is preserved.
- **Re-render**: TW re-renders on every tiddler change. There is no separate "render gate" — the artefact is always current. (This is one of the strongest ergonomic wins of the migration.)

The ADR-085 loop is **not weakened**. It is restated inside a host that has been running an equivalent loop for twenty years.

### 7 — What stays out of scope for the exploration

- **No deletion of `data/**`**. The JSON files remain canonical for the duration of the exploration. The mapper reads from them; the inverse writes back to them.
- **No removal of `bani-render`**. Main-branch tooling continues to produce `graph.html` from `data/**`. BaniWiki is a parallel artefact, not a replacement.
- **No commitment to TiddlyWiki Classic vs TiddlyWiki5**. The exploration uses TiddlyWiki5 (the version `empty.html` represents — `tiddlywiki-version 5.4.0`). Classic is not considered.
- **No multi-user / Node.js TiddlyWiki server**. The exploration targets the single-file artefact only, matching ADR-085's locality property.
- **No plugin authoring beyond what is needed for the mapping**. We use stock TW where possible; we author macros only where unavoidable (the visualisation views).

### 8 — Acceptance criteria for the exploration

The exploratory branch is **successful** (and the project may then choose to migrate) if and only if:

1. **Round-trip losslessness**: `baniwiki-roundtrip` on the produced `baniwiki.html` regenerates `data/**` byte-equivalently (modulo documented normalisations). Verified on the full corpus, not a slice.
2. **Filter atlas completeness**: every CLI query in `carnatic/cli.py` and `graph_api.py` has a recorded TW filter equivalent in `Atlas/Filters`. Gaps are explicitly named.
3. **Visualisation parity**: at minimum, the Bani Flow trail and the Raga Wheel render correctly inside `baniwiki.html` for three reference subjects (one musician, one raga, one composition). Full parity (all panels, all interactions) is desirable but not required for the exploration to be judged successful.
4. **Authoring smoke test**: a contributor can open `baniwiki.html` in a browser, add a new musician via the entry widget (or via TW's built-in tiddler editor in the worst case), save, reload, and see the new musician in the trail and the wheel. The change round-trips back to `data/musicians/<id>.json` via `baniwiki-roundtrip`.
5. **Locality**: the exploration runs offline after `pip install -e .` and a local clone. No network calls during build, round-trip, or in-browser authoring.
6. **Documented gaps**: anything that doesn't map cleanly is recorded as a tagged open question in `.clinerules` and as an Open Questions appendix on this ADR. *Honest negative results count as success.*

---

## Consequences

### Positive

- **We adopt twenty years of solved problems.** TW's filter DSL, search, theming, transclusion, undo/redo, and tiddler atomicity are mature in ways our hand-rolled equivalents are not.
- **The graph becomes inspectable at every layer.** Each entity is a tiddler the rasika can open, edit, transclude, link to. The opaque `graphData` global is replaced by a queryable tiddler store.
- **Tags become first-class.** The forces ADR-085 and ADR-024 hint at — *organic growth via tags, ad-hoc and-or filters revealing what is missing* — become operationally true. A new association (e.g., a teacher-student relationship discovered in a lecdem) is a tag added to a tiddler. No schema change needed.
- **Renders are continuous, not gated.** The render-gate convention (a defining annoyance — "remember to run `bani-render` after every write") goes away. TW re-renders on every tiddler change.
- **The shipped artefact is even more clearly a quine.** `baniwiki.html` is *literally* a TiddlyWiki: the canonical example of a self-replicating, self-editing single-file system. ADR-085's name becomes its host system's name.
- **Plugin economy.** TW has thousands of community plugins (table-of-contents, graph visualisations, audio players, calendar views) that may compose with our domain plugins.
- **Reversibility is structural.** Because the mapping is bidirectional and `data/**` remains canonical during exploration, the project can abandon BaniWiki at any time with zero data loss.

### Negative / accepted tradeoffs

- **Wikitext is not Python.** Some tooling we currently express as Python (validators, the bundle ingester, phonetic search ADR-017) needs JavaScript counterparts inside the wiki. The exploration's Coder cost is mostly here.
- **TiddlyWiki has its own learning curve.** Filter DSL, macro/widget syntax, shadow tiddlers, system tiddlers — all idiomatic to TW, all needing to be learned by future contributors. Mitigated by TW's excellent documentation and by the fact that most contributors interact with tiddlers, not internals.
- **The single-file artefact gets heavier.** TW's core is ~2 MB before our content. `graph.html` is currently lighter. This is acceptable for the use case but should be measured.
- **CI / GitHub Pages workflow changes.** The current `.github/workflows/deploy-pages.yml` builds `graph.html`. A BaniWiki migration would build `baniwiki.html`. The exploration produces the artefact; the workflow change is a follow-up ADR if migration is approved.
- **Some queries may not map cleanly.** The phonetic search (ADR-017) and the bani-flow trail's specific traversal logic (ADR-013, ADR-022) may need bespoke macros rather than pure filter expressions. Recorded as a known risk.

### Risks (and mitigations)

- **Sunk cost in the visualisation code.** *Mitigated* by §5 — visualisations move as macro tiddlers without rewrite. The risk is integration friction, not loss of work.
- **TW upstream churn.** TW5 is stable but evolving. *Mitigated* by vendoring `empty.html` (already done) and pinning to a specific version.
- **The exploration produces a working BaniWiki but the project decides not to migrate.** This is an acceptable outcome. The exploratory branch becomes an archived reference. ADR-085's loop continues on main. We have learned the answer: "yes, it's possible; no, we don't want it." That is a *useful* answer.
- **The exploration produces a working BaniWiki and the project decides to migrate.** Then the migration ADR (ADR-NNN, future) names the cutover, the deprecation of `bani-render`, and the new `bani-build` (or whatever it ends up called). The exploration is the rehearsal; the migration ADR is the performance.
- **Two parallel branches diverge.** Mitigated by §1 — periodic rebases plus the regeneration property mean main-branch curation work appears in BaniWiki on every rebase, not as a merge conflict.

---

## Implementation

This ADR is a **branch-opening** decision. Implementation is the exploration itself.

### Phase 0 — ADR review and branching

1. **Architect** (this ADR): authored, citing ADR-085 as the trigger.
2. **User**: reviews, marks Status `Accepted (exploratory)` if the exploration is sanctioned. The "exploratory" qualifier signals: accepting this ADR commits us to the *exploration*, not to the migration.
3. **Coder**: creates branch `baniwiki/exploration` from current `main`. Adds `BANIWIKI.md` charter (one paragraph + link to this ADR).

### Phase 1 — Mapper and round-trip (proves losslessness)

On `baniwiki/exploration`:

4. **Coder**: implements `carnatic/baniwiki/mapper.py` with pure transforms for each entity type per §2. Unit-tested with a representative slice (5 musicians, 5 ragas, 5 compositions, 2 recordings, 1 ADR).
5. **Coder**: implements `carnatic/baniwiki/round_trip.py` (inverse). Adds `baniwiki-validate` CLI verb that asserts byte-equivalence across `data → tiddlers → data`. **Gate: this must pass on the full corpus before Phase 2.**
6. **Coder**: implements `carnatic/baniwiki/build.py` to produce `baniwiki.html` by injecting tiddlers into the vendored `carnatic/empty.html` shell.

### Phase 2 — Filter atlas (proves query expressivity)

7. **Architect** + **Coder**: produce `Atlas/Filters` tiddler with side-by-side mapping per §4. Every query in `carnatic/cli.py` and `graph_api.py` is enumerated. Gaps are flagged.
8. **Architect**: writes a short addendum to this ADR (or a follow-up Open Questions block) cataloguing any query that resists mapping.

### Phase 3 — Visualisation port (proves render parity for one slice)

9. **Coder**: ports `graph_view.js` and `raga_wheel.js` as TW macro tiddlers, fed by an adapter that materialises `graphData` from filter queries.
10. **Coder**: confirms acceptance criterion §8.3 — Bani Flow trail and Raga Wheel render correctly for three reference subjects.

### Phase 4 — Authoring loop port (proves §8.4)

11. **Coder**: ports the musician entry form (ADR-031) as a TW widget. Validation rules from `writer.py` ported to a JS validator macro. Save produces a new tiddler; "save changes" produces a new `baniwiki.html`.
12. **Librarian** (acting as test-rasika): performs the §8.4 smoke test end-to-end. Logs result.

### Phase 5 — Decision

13. **Architect** + **User**: review the produced `baniwiki.html`, the filter atlas, the visualisation port, and the smoke-test log. Decide one of:
   - **Migrate**: write ADR-NNN proposing the cutover, deprecation timeline, and main-branch end-of-life for `bani-render`.
   - **Defer**: keep the branch alive as a reference; revisit when the next major refactor is forced.
   - **Abandon**: archive the branch with a tagged final commit and a one-line note in `.clinerules` recording the lesson learned.

All three outcomes are honourable. The exploration's purpose is to make the decision *informed*.

### Phase 6 — Learning

14. **All agents**: append dated learning log entries to `carnatic/.clinerules` documenting what the exploration revealed — about Bani Flow, about TiddlyWiki, about the curation loop. These entries persist regardless of which Phase 5 outcome is chosen.

---

## Open questions (to be resolved during exploration)

1. **Phonetic search (ADR-017)**: does it port cleanly as a TW search-filter operator, or does it require a custom macro? Most likely the latter — TW search is index-driven and may not accommodate the IAST/ITRANS/Roman tri-modal matching our search uses.
2. **Bani-flow trail traversal (ADR-013)**: the trail's specific ordering (era, then bani, then chronology) may not be a pure filter — it's a sort over a filter. TW supports sort operators; the question is whether the multi-key sort is expressible inline or needs a macro.
3. **The `youtube[]` array on a musician**: as JSON in tiddler text, it's not directly filterable. Decide: keep as JSON-in-text (with a derived `[tag[Recording]]` tiddler per entry, generated by the mapper), or lift each youtube entry to its own tiddler (`Recording/<musician_id>/<index>`)? The latter is more TW-idiomatic but inflates tiddler count significantly.
4. **ADR-085's `schema_version` discipline**: how does this map to TW? TW has no first-class schema-version concept for tiddler stores. Likely answer: a `System/SchemaVersion` tiddler that the build asserts, mirroring the bundle's discipline.
5. **`graph.json` (the synced canonical artefact)**: does the BaniWiki branch keep producing `graph.json` for legacy callers (`cli.py`), or does the round-trip implicitly regenerate it? Likely yes, kept, for the duration of the exploration.
6. **Two-way authoring during the exploration**: if a contributor authors *inside* `baniwiki.html` and a contributor authors on main *simultaneously*, how is the merge handled? Likely answer: the round-trip is the merge — pull main, regenerate BaniWiki from `data/**`, re-apply the BaniWiki-side authoring as a bundle through main's `bani-add`. This keeps `data/**` canonical during the exploration.
7. **Performance**: will TW's filter engine handle our corpus (76 musicians, 160 ragas, 232 compositions, growing) at interactive speed? TW handles much larger corpora in practice (50k+ tiddler wikis exist), so this is expected to be fine, but should be measured.

---

## Closing note

ADR-085 said: "we have built a self-replicating curation loop." This ADR says: "the system that already perfected this loop is called TiddlyWiki, and we should find out — concretely, with code, on a branch — what it would mean to be hosted by it."

We are not committing to migrate. We are committing to *find out*, in a way that costs us nothing if the answer is no, and grants us a stable host that has outlived most of its contemporaries if the answer is yes.

The Carnatic tradition itself is a quine — every guru is a former shishya, every shishya a future guru, the bani replicates by being lived. It is fitting that the system documenting it might soon be one too.

> *"BaniWiki: the bani is the wiki is the bani."*
