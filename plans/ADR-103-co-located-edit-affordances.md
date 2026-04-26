# ADR-103: Co-Located Edit Affordances and the Deprecation of the Global Edit Bar

**Status**: Accepted
**Date**: 2026-04-26
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-031 (data entry forms), ADR-082 (lecdem entry forms — the model), ADR-085 (self-replicating curation loop), ADR-097 (unified Edit form)
**Related**: ADR-104 (header edit buttons), ADR-105 (composer-mediated composition entry), ADR-106 (mela-anchored janya entry), ADR-107 (concert-anchored recording entry)
**Supersedes**: nothing — *extends* ADR-097 §6 by relocating the dispatch point of the unified Edit form from a single global launcher to many in-panel entry points.

---

## Context

ADR-082 made lecdems editable in a way the rest of the corpus is not. A rasika listening to a lecdem who hears a raga modulation she wants to mark does not leave the panel: the segment-edit affordance lives on the lecdem row itself. The act of identification and the act of recording the identification share the same visual locus. The loop (ADR-085) closes inside the unit of attention.

Every other entity type in the system fails this test. To edit a musician's birth year, fix a typo on a composition, attach a janya to its mela, or add a recording to an artist, the rasika must currently:

1. Leave the panel she is reading.
2. Open the global Edit / Add bar at the bottom of the screen.
3. Pick the entity type from a dropdown.
4. Re-find the entity she was already reading by typing it into a combobox.
5. Submit the change.

Steps 1–4 are pure friction. They reproduce the entity she already had in focus. They break immersion. They turn an in-context observation into a context-switch task — and therefore into a task most rasikas will not perform.

The bottom edit bar made sense as the *first* write surface (ADR-031): one unified launcher established that the read-only graph was now writeable. With ADR-097 it grew the unified Edit form. But the launcher is now the wrong shape for the work. The entry-points to write should sit beside the things being read. The bar's job is done.

### Forces

| Force | Direction |
|---|---|
| **Co-location** | Every editable entity should expose its edit affordance on the same visual unit that displays it. Distance between observation and contribution is friction. |
| **Loop closure (ADR-085 §1)** | The loop is closed only if the rasika *uses* it. A loop she does not invoke is mathematically closed and practically empty. Reducing the cost of the first click is the highest-leverage loop investment. |
| **Single dispatch (ADR-097 §6)** | The unified Edit form remains the single dispatch surface; only its *entry points* multiply. We are not creating new write channels — we are creating new shortcuts to the same one, each pre-targeted at the entity in focus. |
| **Permission asymmetry by entity type** | Not every entity should be edited willy-nilly. Compositions must flow through composers. Janyas must flow through melakartas. Notes must flow through entities. The placement of the affordance is itself a permission gradient: an edit button on a composer panel says *"add a composition by this composer"*; the absence of an edit button on a composition panel says *"compositions are not authored standalone"*. The UI teaches the rule. |
| **Append-only at the entity layer (ADR-085 §6)** | Co-located buttons add or open Edit. They do not delete. Removal remains librarian-tier. |
| **Reading must remain primary** | The buttons must be small, marginal, and discoverable but not intrusive. They are escape hatches into the loop, not chrome. The reader who is not contributing should barely notice them. |
| **One global escape hatch survives (transitional)** | Until every panel has its co-located trigger, the global launcher remains as a fallback. It is deprecated, not removed. |

---

## Pattern

**Christopher Alexander, *A Pattern Language*, Pattern 129 — *Common Areas at the Heart*.** The places where action happens are placed at the centres of the spaces where attention already lives. Putting an edit button on the panel where the rasika is reading is the architectural equivalent: the action lives where the attention is. A hallway with a door at its centre serves more traffic than a door behind a closed cupboard at the end of the corridor.

**Property 1, *Strong Centres* (*The Nature of Order*, Book 1).** Each entity panel is already a strong centre — the entire visual hierarchy of Bani Flow is built from these centres. ADR-103 strengthens each centre by giving it a write affordance, rather than weakening every centre by routing all writes through a single peripheral organ.

**Property 7, *Boundaries*.** The edit button is the boundary at which the panel becomes both readable and writeable. The button is small because the boundary is meant to be permeable, not monumental.

**ADR-085 §3 (read implies write).** ADR-097 satisfied this constraint at the *system* level (a single Edit form covers all entities). ADR-103 satisfies it at the *panel* level: every readable panel exposes its own write entry. The constraint is now satisfied not just by the existence of a write surface but by its placement.

---

## Decision

### 1 — Every readable entity panel exposes its write entry on the same panel

The general rule: **the affordance to edit or extend an entity sits on the visual unit that displays it.** The shape of the affordance is a small icon button (a `+` for add-here, a pencil/✎ for edit-this) placed inline with the panel header or section header it acts on. The button opens the relevant entry form (Add* or unified Edit) **pre-targeted at the entity in focus** — the rasika never re-picks the subject she was already reading.

The five concrete placements are specified in their own ADRs:

- **ADR-104** — `✎ Edit` next to the entity name in panel headers (musician, raga, composition, composer). Opens the unified Edit form (ADR-097 §6) with `entity type` and `pick` already filled.
- **ADR-105** — `+` on the "Compositions (N)" row in a composer panel. Opens the Add Composition form with `composer_id` pre-filled and locked.
- **ADR-106** — `+` on the "Janyas (N)" row in a melakarta panel. Opens the Add Raga form with `parent_raga_id` pre-filled and locked. Plus: melakartas always appear in the bani-search dropdown regardless of recording coverage.
- **ADR-107** — `+` on the "Concerts" section header in a musician panel. Opens the Add Recording form with the musician pre-attached as a performer.
- **(Already shipped)** ADR-082 — segment-edit affordances on lecdem rows. ADR-018/019/026 — segment-edit affordances on concert recordings. ADR-101 — timestamped segments. These are the existence proofs the present ADR generalises from.

### 2 — Pre-targeting is part of the contract

A co-located trigger MUST pre-fill the entry form's identifying fields and SHOULD lock them (read-only with a "change" affordance) so the rasika cannot accidentally retarget. The locked fields are:

| Trigger location | Pre-filled and locked |
|---|---|
| Edit `✎` on musician header | entity_type=Musician, id=<musician_id> |
| Edit `✎` on raga header | entity_type=Raga, id=<raga_id> |
| Edit `✎` on composition header | entity_type=Composition, id=<composition_id> |
| Edit `✎` on composer header | entity_type=Composer, id=<composer_id> |
| `+` on composer's "Compositions" row | composer_id=<composer_id> |
| `+` on melakarta's "Janyas" row | parent_raga_id=<melakarta_id>, mela=<mela_number> |
| `+` on musician's "Concerts" row | performers includes <musician_id>, role pre-filled from musician's primary instrument |

"Lock with a change affordance" means the field renders as a non-editable chip (matching ADR-074 chip parity) with a small `change` link beside it that, if clicked, unlocks the field and removes the pre-target. This preserves the rasika's escape but defaults to the path of least surprise.

### 3 — The global edit bar is deprecated, not removed

The bottom edit bar is marked **deprecated** in this ADR. It remains in the UI as a fallback during the rollout of ADRs 104–107 and as an escape hatch for entity types or operations that do not yet have a co-located trigger. The deprecation has three operational consequences:

1. **Visual demotion.** The bar's chrome is reduced (smaller buttons, lower contrast, no primary-action emphasis). It reads as a utility, not as the primary write surface.
2. **No new entry points are added to it.** Future entity types or write surfaces MUST come with a co-located trigger; they do not extend the bar.
3. **A future ADR may remove it entirely** once the co-located coverage matrix (ADR-100 placeholder) is complete and a fresh-clone smoke test confirms every entity type has at least one co-located trigger. Until then, removal is out of scope.

### 4 — Refusal of edit affordances is a design statement

Some entities deliberately do **not** receive an edit-this button:

- **Compositions have no `✎ Edit` on a composition panel** for *adding new compositions* (one already exists for editing the current composition's fields per ADR-104). New compositions are added only through their composer (ADR-105). This refusal enforces the existing hard rule that every composition has a verified `composer_id`.
- **Ragas have no top-level `+` in the bani-flow search** for *adding new ragas*. New ragas are added only as janyas of an existing melakarta (ADR-106). This refusal enforces the lineage requirement and prevents orphaned ragas.
- **Lecdems and recordings retain their existing entry points** (musician panel `+ Add YouTube`, `+ Add Recording`); ADRs 104 and 107 do not introduce parallel triggers, only relocate them.

The pattern: **where an entity has a hard parent, the only entry point is on the parent**. The refusal is not a missing feature; it is the schema rule expressed in the UI.

### 5 — Conformance with ADR-085 and ADR-097

Each co-located trigger is a thin shortcut into an existing form. None of them write directly to disk. None of them produce a non-bundle artefact. None of them bypass the writer (ADR-016). The bundle items they produce are the same `op`-discriminated items defined in ADR-097 §3. ADR-103 introduces zero new write channels; it introduces *placements* of existing channels.

### 6 — Visual language

To preserve the chip parity established in ADR-073 / ADR-074:

- **`✎ Edit`** — a small pencil glyph chip placed immediately to the right of the entity name in the panel header. Tooltip: `Edit this <entity-type>`.
- **`+`** — a small plus glyph chip placed at the right edge of a section header row (e.g., "Compositions (N)", "Janyas (N)", "Concerts"). Tooltip: `Add a <child-type> to this <parent-type>`.
- Both glyphs use the chip border-radius and softer-than-primary contrast established in ADR-093 / ADR-094. They are inline with their row, not floating.
- On mobile (ADR-075), the buttons are larger touch targets but visually identical.

The exact CSS tokens come from ADR-028 (design-token single source of truth). No new tokens are introduced by this ADR.

---

## Consequences

### Positive

- **The cost of the first contribution drops.** The rasika who notices an error in the panel she is reading can act on it without leaving the panel. This is the single highest-leverage UX change for loop adoption since the entry forms shipped.
- **The UI teaches the schema.** The presence or absence of a co-located trigger encodes the system's hard rules (compositions through composers, janyas through melakartas) without prose.
- **The bottom bar's chrome is reclaimed.** A demoted bar makes room visually for the panels themselves to grow. The screen becomes denser with content and lighter with chrome.
- **ADR-085 §3's "read implies write" is satisfied at the panel scale**, not just the system scale. A reader looking at any panel can write into that panel.
- **The path to BaniWiki (ADR-095) shortens further.** TiddlyWiki's edit affordance is *on the tiddler*. ADR-103 moves Bani Flow's affordance *onto its panels*. The shape converges.

### Negative / accepted tradeoffs

- **Five surfaces to wire up instead of one.** Each ADR (104–107) is a small Coder change, but they collectively span musician, raga, composition, composer, and recording panels. Mitigated by all five sharing the same dispatch (the unified Edit form and the existing Add forms) — the wiring is repetitive, not novel.
- **The deprecated bar adds visual ambiguity** during the transition (two ways to do the same thing). Mitigated by the visual demotion in §3 and by documentation in the empty-panel tutorials (ADR-086) pointing rasikas at the co-located triggers first.
- **Pre-targeted forms can feel constraining.** A rasika who opened the wrong trigger has to use the `change` link to retarget. Accepted: the cost of "change" is much lower than the benefit of "subject already filled in".

### Risks

- **A trigger that opens to the wrong entity (off-by-one bug) is more confusing than the bar's blank state.** Mitigated by the locked-chip rendering of pre-targeted fields — the rasika sees the subject before submitting and can correct it.
- **Mobile screen real-estate.** Adding chips to panel headers risks crowding on narrow viewports. Mitigated by ADR-075's mobile panel rules and by collapsing to icon-only on small screens.
- **The deprecated bar may linger longer than planned.** Accepted: ADR-103 does not require removal; ADR-100 (when populated) becomes the gate.

---

## Implementation

ADR-103 is a governing ADR for ADRs 104–107. It introduces no code on its own. Its implementation is the union of those four ADRs plus the visual demotion of the global edit bar.

### Phase 0 — This ADR (documentation only)

Architect:
1. Land ADR-103 alongside ADRs 104–107 as a Proposed set.
2. Update [ADR-100](./ADR-100-edit-coverage-matrix.md) (currently empty placeholder) to enumerate the co-located trigger matrix and reference ADRs 103–107 as its constituents.

### Phase 1 — Per-trigger ADRs (Coder, sequenced)

Each of ADRs 104–107 is independently shippable. Recommended order, in increasing wiring complexity:

1. ADR-104 (header `✎ Edit`) — touches every entity panel header; reuses ADR-097 §6 unified Edit form.
2. ADR-105 (`+` on composer "Compositions") — single panel; reuses Add Composition form.
3. ADR-107 (`+` on musician "Concerts") — single panel; reuses Add Recording form.
4. ADR-106 (mela-anchored janyas) — touches both raga panel and search; couples a UI change with a search-filter change.

### Phase 2 — Global bar demotion (Coder, after Phase 1 ships any one trigger)

In `carnatic/render/templates/entry_forms.js` and the corresponding CSS:

1. Reduce the bar's button sizes to match secondary-chip dimensions.
2. Lower the bar's background contrast so it reads as utility chrome.
3. Add a one-line caption above the bar: *"Most edits now live on the panels. This bar is a fallback."* (Or equivalent — exact copy is a Coder choice.)
4. Add an internal comment in the launcher block citing ADR-103 and ADR-100 as the deprecation rationale.

### Phase 3 — Bar removal (future ADR, gated on ADR-100 being green)

Out of scope for ADR-103. When ADR-100's coverage matrix shows every entity type has at least one co-located trigger, a future ADR may remove the bar entirely. Until then, the bar stays.

### Verification

- **Per ADR (104–107)**: each ADR specifies its own verification (a manual trigger → form → bundle → ingest → render check).
- **For ADR-103 itself**: a fresh `bani-render` after Phase 2 lands shows the demoted bar and at least one co-located trigger; the rasika can perform an end-to-end edit through a co-located trigger without ever clicking the bar.

---

## Closing note

ADR-085 said *every read surface implies a write surface*. ADR-097 said *every entity has a single Edit dispatch*. ADR-103 says *every panel exposes its own door into that dispatch*. The three together make the loop not merely closed but **inviting**: contribution is no longer a separate task, it is a side-effect of paying attention.
