# ADR-121: BaniWiki phase-out — retiring `bani-render` and the legacy land

**Status**: Proposed
**Date**: 2026-05-08
**Agents**: graph-architect (proposer), all agents (implementers across the cutover)
**Depends on**: ADR-085 (curation loop), ADR-095 (BaniWiki exploration), ADR-117 (Node deployment), ADR-118 (vocabulary), ADR-119 (mapper), ADR-120 (filter atlas)
**Supersedes (eventually)**: ADR-024 (render refactor), parts of ADR-013 (single source of truth — the *source* changes), parts of ADR-016 (writer validation — moves into BaniWiki) — superseding marks are applied in the relevant commit when each phase completes, not preemptively.

---

## Context

ADRs 117–120 build BaniWiki *alongside* `data/**` and `bani-render`. Both lands coexist. `data/**` is canonical; BaniWiki is a projection. This is the right shape for the exploration, but it cannot be the final shape — duplicating canonicality across two lands is exactly the drift trap the Librarian's discipline was designed to prevent.

The user has named the destination explicitly:

> *"Eventually we phase our land out."*

This ADR is the **phase-out plan**: a staged, reversible, evidence-gated migration of canonicality from `data/**` to `baniwiki/tiddlers/`. It does not commit us to the migration today. It commits us to a *path*, gated at every stage by acceptance criteria the project can independently evaluate.

Phase-out is the riskiest decision in the BaniWiki series. ADR-085 named the curation loop as constitutional. Moving the loop's substrate from `data/**` to `tiddlers/` is a constitutional amendment. We do it slowly, with evidence, with reversibility at every stage.

### Forces

| Force | Direction |
|---|---|
| **Single canonical source** | The end state has exactly one canonical source. Two-canonical is a worse state than the current one. |
| **Reversibility at every stage** | Until the final cutover commit, the project must be able to abandon the migration with no data loss. The mapper (ADR-119) is the safety net: as long as round-trip is lossless, either land can be reconstructed from the other. |
| **Evidence-gated transitions** | Each phase has measurable acceptance criteria. We do not advance on schedule; we advance on proof. |
| **Continuity of Librarian work** | Curation cannot pause for the migration. Librarians keep adding musicians, recordings, lecdems throughout. The phase-out accommodates ongoing work; it does not freeze it. |
| **Tooling parity before retirement** | `bani-render` is not retired until BaniWiki demonstrably does *everything* `bani-render` did, including: trail rendering, raga wheel, panel navigation, entry forms, phonetic search (ADR-120 Gap B), tutorials, help system. |
| **Public artefact continuity** | The currently-deployed `graph.html` (GitHub Pages) does not disappear. It is succeeded by a new deployment shape (single-file BaniWiki export, or hosted Node, or both — decided in Phase 4). The public never loses a working site. |
| **No surgical schema change** | Per the user's constitutional rule (also enshrined in ADR-119): the cutover happens by *flipping canonicality*, not by mutating either schema. The mapper is bidirectional; the cutover is just choosing which side the contributors edit. |

---

## Pattern

**Christopher Alexander, Property 6, *Positive Space*; Property 14, *Gradients*.** A migration is not a switch; it is a gradient. The phases are increments along the gradient: from "BaniWiki is a projection" to "`data/**` is a projection" via well-named intermediate states where both are true and the mapper holds them in correspondence.

**Pattern 51, *Green Streets*.** A green street is one where car traffic and pedestrian traffic coexist gracefully because the design names the gradient between them. The phase-out names the gradient between the two lands. At each phase, both lands work; only the *direction of canonical authority* shifts.

**The bidirectional mapper (ADR-119) is the cutover infrastructure.** Because the mapper is lossless in both directions, canonicality is a *convention*, not a structural fact. We can flip it by changing one CI gate.

**Convergence with the project's own pattern.** Every prior major change (ADR-024 render refactor, ADR-083 bundle channel, ADR-085 curation loop ratification) followed the same gradient: introduce alongside, prove parity, flip canonicality, retire the legacy. The phase-out reuses that proven pattern.

---

## Decision

**Migrate canonicality from `data/**` to `baniwiki/tiddlers/` in five evidence-gated phases.** Each phase is independently committable, independently reversible, and ends with a named state the project can rest in indefinitely if the next phase is deferred.

The phases:

1. **Coexistence** — both lands live; `data/**` is canonical; mapper produces `tiddlers/`.
2. **Parity** — every `graph.html` capability exists in BaniWiki; `bani-render` and `bani-wiki-build` produce equivalent functionality.
3. **Authoring shift** — Librarians author primarily in BaniWiki; `data/**` updates are derived via `bani-wiki-roundtrip`.
4. **Canonicality flip** — `baniwiki/tiddlers/` becomes canonical; `data/**` becomes a derived export; `bani-render` produces from tiddlers.
5. **Legacy retirement** — `bani-render` is removed; `data/**` is removed; the project lives entirely in BaniWiki.

### Phase 1 — Coexistence

**State**: ADR-117–120 are merged; BaniWiki builds, BaniWiki serves, BaniWiki round-trips. `data/**` remains canonical. `bani-render` remains the public-artefact producer.

**Acceptance criteria** (already enumerated in ADR-117 §6, ADR-119 §9, ADR-120 §4):

- `bani-wiki-validate` passes on the full corpus (round-trip lossless).
- `bani-wiki-serve` runs locally; every entity is reachable at a `#:` URL.
- `Atlas/Filters` is generated and verified in CI.
- `bani-render` continues to produce `graph.html` unchanged.

**Reversibility**: trivial. If we abandon at end of Phase 1, BaniWiki is a side artefact; `data/**` and `bani-render` continue unchanged.

**Estimated duration**: the time to implement ADRs 117–120.

### Phase 2 — Parity

**State**: every public-facing capability of `graph.html` exists in BaniWiki. The Bani Flow trail, the Raga Wheel (ADR-022, ADR-092, ADR-094, ADR-096), entry forms (ADR-031, ADR-115, ADR-116), tutorials (ADR-086–091), help deck (ADR-098, ADR-102), phonetic search (ADR-017 → ADR-120 Gap B), timestamped segments (ADR-101), edit affordances (ADR-103, ADR-104), bottom-bar replacements (ADR-111).

**Implementation strategy**: each `graph.html` panel becomes a TW5 macro tiddler (`type: application/javascript`, `module-type: macro` or `widget`), fed by filter-derived data per ADR-120's named subfilters. The panel's existing JS is largely reusable; the change is the data feed (from `graphData` global to filter output).

**Acceptance criteria**:

- A reference user can perform every task on BaniWiki that they can perform on `graph.html`. Test scripted against a checklist (one row per ADR feature).
- Visual parity is *good enough*, not pixel-perfect. The Raga Wheel renders. The trail navigates. Search returns the same results. Tutorials advance.
- BaniWiki bundle output (an export of in-browser-authored tiddlers) round-trips through `bani-wiki-roundtrip` to a clean `data/**` patch, validated by `writer.py`.
- A new `bani-wiki-build` artefact (the single-file export) is produced in CI and is functionally equivalent to `graph.html` on the parity checklist.

**Reversibility**: still high. BaniWiki is now full-featured but not yet load-bearing. Abandoning at this point archives BaniWiki as a working second deployment; `data/**` and `bani-render` continue.

**Estimated duration**: the bulk of the migration's engineering work. Likely the longest phase.

### Phase 3 — Authoring shift

**State**: Librarians shift their primary authoring surface to BaniWiki. The Librarian's existing CLI (`write_cli.py`) verbs continue to work and write to `data/**`; the round-trip fills `tiddlers/`. New verbs are added that write directly to `tiddlers/` and the round-trip fills `data/**`. Both directions are validated; both produce identical commits.

**The shift is voluntary per Librarian.** A Librarian comfortable with `write_cli.py` continues to use it; one who prefers in-browser editing uses BaniWiki. The mapper makes both flows produce the same end state.

**Acceptance criteria**:

- For one full curation week, every Librarian commit shows clean diffs in *both* `data/**` and `tiddlers/`, demonstrating the round-trip working in production.
- A randomly selected subset of in-browser-authored tiddlers is hand-inspected by the Architect to confirm no vocabulary drift (ADR-118 violations).
- Documentation in `CLAUDE.md` and `.clinerules` is updated to describe both authoring flows.

**Reversibility**: still meaningful, but the point of no-return is approaching. Librarian habit is hardening around BaniWiki; reverting means re-training. The mapper still works in both directions, so no data is lost on revert; only the authoring affordance is.

**Estimated duration**: a curation cycle (weeks, not months) of dual-authoring observation.

### Phase 4 — Canonicality flip

**State**: `baniwiki/tiddlers/` is now canonical. `data/**` becomes a derived export.

**The flip is one commit.** It changes:

- `.gitignore`: removes `baniwiki/tiddlers/` (now tracked); adds `data/**` (now derived).
- `pyproject.toml` console scripts: `bani-render` invokes `bani-wiki-build` internally.
- `carnatic/cli.py`: reads from `tiddlers/` (or from a derived in-memory `data/**`).
- `carnatic/writer.py`: writes to `tiddlers/` (or remains as data-shape validation, called by the inverse-mapper).
- CI: gate moves from `cli.py validate` to `bani-wiki-validate`.
- Pages workflow: deploys the Node-served wiki (or its single-file export) instead of `graph.html`.

**Pre-flip checklist** (Git Fiend gates):

- [ ] All Phase 3 acceptance criteria met for at least 4 weeks.
- [ ] No open-question gaps in ADRs 118–120 unresolved.
- [ ] At least 2 Librarians comfortable with the BaniWiki authoring flow.
- [ ] CI passes the round-trip on the full corpus on every commit.
- [ ] An "escape hatch" branch (`legacy/data-canonical`) is preserved for revert.

**Reversibility**: low. The flip is intended as one-way. If reverted, weeks of in-BaniWiki authoring need to be back-mapped. The mapper makes it possible (the round-trip works either way) but the muscle memory and tooling alignment have shifted. The Architect recommends the flip be a deliberate, ceremonial commit, not a routine merge.

**Estimated duration**: one commit, reviewed extensively.

### Phase 5 — Legacy retirement

**State**: `data/**` is removed (kept in git history); `bani-render` is removed; `graph.html` is no longer built; the entire project lives in `baniwiki/`.

**Pre-retirement checklist**:

- [ ] At least 6 months in Phase 4 with no revert pressure.
- [ ] All consumers of `data/**` (external scripts, embedded analyses, third-party tools) migrated to read from `tiddlers/` or from the derived export.
- [ ] An ADR (ADR-NNN, post-this) records the retirement and updates `.clinerules`.
- [ ] A final tagged commit on the `legacy/data-canonical` branch is made and the branch is preserved indefinitely.

**This phase is optional.** If at any point the project decides Phase 4 is the comfortable end state — `tiddlers/` canonical, `data/**` derived but kept on disk for legacy callers — that is also honourable. Phase 5 is the *eventual* destination, not a forced one.

**Reversibility**: zero (within this repo's main branch). The `legacy/data-canonical` branch remains as the historical reference.

---

## Consequences

### Positive

- **Single canonical source restored.** The drift risk of two-canonical is eliminated.
- **External addressability becomes the default.** Every entity has a stable URL by virtue of being a tiddler.
- **The curation loop (ADR-085) gains a battle-tested host.** TW5's twenty years of save/edit/sync mechanics replace our hand-rolled bundle ingestion.
- **`bani-render`'s render-gate annoyance is gone forever.** No more "did you remember to run `bani-render`?"
- **The repository is dramatically simpler.** No `render/`, no `graph_builder.py`, no `html_generator.py`, no Jinja templates. Just the mapper and the wiki.

### Negative / accepted tradeoffs

- **Migration is multi-month work.** No way around this; the parity bar (Phase 2) is the project's entire feature surface.
- **Once flipped, reversion is expensive.** Mitigated by the legacy branch and by the bidirectional mapper, but real.
- **TW5 becomes a project dependency.** Mitigated by TW5's twenty-year stability and by the single-file export remaining buildable.
- **External tooling that reads `data/**` directly will need to update.** Inventory taken in Phase 4 pre-flip checklist.

### Risks (and mitigations)

- **Parity is harder than estimated.** Phase 2 is the open-ended one; the Raga Wheel and the entry forms are non-trivial. *Mitigated* by ADR-095 §5's strategy (move JS as macro tiddlers without rewrite).
- **Librarians resist the in-browser flow.** *Mitigated* by Phase 3's voluntariness; nobody is forced to switch until Phase 4 is gated by Phase 3 acceptance.
- **Phantom drift across the mapper.** A subtle vocabulary violation that round-trips silently. *Mitigated* by the Atlas verification (ADR-120) running every query both ways; if results disagree, drift is exposed.
- **TW5 upstream introduces a breaking change.** *Mitigated* by pinning version in `package.json`. Upgrades are explicit ADRs.
- **The user changes their mind.** Acceptable. The phases are independently reversible up to Phase 4. The exploration was worthwhile regardless of outcome (ADR-095's "honest negative results" clause applies).

---

## Implementation

This ADR is a **plan**, not a deliverable. Implementation is the five phases themselves; each phase is gated by acceptance criteria, not by schedule.

### Governance

- The Architect tracks phase progress in a dedicated `.clinerules` section: "BaniWiki phase-out status".
- Each phase transition requires a commit with `[ADR: ADR-121]` citing this ADR and the criteria met.
- Phase 4 (the canonicality flip) requires an explicit user approval commit, branched as `cutover/baniwiki-canonical`, opened as a PR for review before merging to main.
- Phase 5 requires a successor ADR (`ADR-NNN-baniwiki-legacy-retirement`) that catalogues the removed code and the migrated consumers.

### Per-phase artefacts

| Phase | Branch | Artefacts |
|---|---|---|
| 1 — Coexistence | `baniwiki/exploration` (existing) | mapper, atlas, served wiki, `bani-wiki-*` scripts |
| 2 — Parity | `baniwiki/parity` | macro tiddlers per panel, ported entry forms, ported tutorials, parity checklist tiddler |
| 3 — Authoring shift | `baniwiki/authoring` | new write-side CLI verbs, dual-flow documentation |
| 4 — Canonicality flip | `cutover/baniwiki-canonical` | one large commit; PR-reviewed; tagged `v-cutover` |
| 5 — Legacy retirement | `cleanup/legacy-data` | removal commits; final ADR |

### Per-phase open-questions log

Each phase opens a tagged Open Questions block on this ADR. Questions are answered in commits as they resolve. Unresolved questions block the next phase.

---

## Open questions

These are the open questions for **the plan**, not the phases (which carry their own).

1. **Estimated phase 2 duration.** A function of how many panels need porting and the Coder's velocity. The parity checklist (Phase 2 deliverable) will allow estimation once enumerated.
2. **Hosting strategy.** Phase 4 changes the public deploy. Options: GitHub Pages serving the single-file BaniWiki export (cheapest, loses Node mode's per-tiddler URLs publicly); a small VM running TW5 Node (gains URLs, costs money); both (single-file for Pages public, Node for authoring). Decision in Phase 4 pre-flip planning.
3. **Whether `data/**` is removed in Phase 5 or kept as a derived export indefinitely.** Two stable end states; project preference decides.
4. **What happens to `READYOU.md` in `data/`?** Once `data/**` is derived, its READMEs are derivative documentation. Likely migrated as `Doc/Schema/<entity>` tiddlers and the originals removed.
5. **Whether `bani-render` survives in any form.** A nostalgic version that builds the legacy `graph.html` from `tiddlers/` could be kept as a museum artefact, or removed cleanly. Decision in Phase 5.
6. **External integrations.** Anyone reading our public `data/**` JSON (we don't know who) will be affected by Phase 4. The pre-flip checklist requires an audit; the audit may surface stakeholders we should announce to.
7. **Whether ADRs themselves are authored in BaniWiki after Phase 4.** The Architect's workflow currently produces `plans/ADR-NNN.md` files. Post-flip, ADRs could be authored as `ADR/<NNN>` tiddlers directly in BaniWiki. Likely yes — closing the loop on the Architect's own workflow. Decision in Phase 4.

---

## Closing note

The migration is a single sentence stretched across five phases:

> *"Build the new land beside the old; prove the new land does what the old did; let people walk between them; flip the road signs; retire the old land when nobody walks back."*

ADR-085 named the curation loop as constitutional. ADR-095 said TiddlyWiki is the older system that already perfected the loop. ADRs 117–120 build the bridge. This ADR walks across it — slowly, with both feet, never letting go of either side until the other is firm.

> *"The bani is not the score. It is the lineage of those who could play it. The wiki is not the file. It is the lineage of those who could write it."*
