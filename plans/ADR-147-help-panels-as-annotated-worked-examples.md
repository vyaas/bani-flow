# ADR-147 — Help Panels as Annotated Worked Examples (Reetigowla & Ramnad Krishnan)

**Status**: Proposed
**Date**: 2026-05-17
**Author**: Graph Architect
**Agents**: graph-architect (proposes); carnatic-coder (rewrites `empty_tutorials.js` against new schema); librarian (replaces `carnatic/data/help/empty_panels.json` with the worked-example payload below).
**Depends on**: ADR-061 (tree-structured Bani Flow trail), ADR-064 (musician-panel raga/composition tree), ADR-077–ADR-081 (lecdems as first-class objects + panel sections), ADR-018 (concert-bracketed recording groups), ADR-019 (co-performer chips), ADR-021 (melakarta first-class), ADR-022 (raga panel navigability), ADR-025 (cross-panel coupling), ADR-112/ADR-113 (Hindustani Equivalent Ragas), ADR-133 (mela-janya as primary view), ADR-134 (connected-only Guru-Shishya graph).
**Supersedes**: ADR-086, ADR-087, ADR-090, ADR-091 — the entire "demo-row catalogue" and "cross-panel seeds + view-section" structure in `empty_panels.json` is retired. The static help modal driven by `preface.md` is **not** superseded; it remains the project manifesto.

---

## Context

The empty-panel tutorials introduced by ADR-086 and refined by ADR-087/090/091 currently work as a **catalogue of chip species**: one row per CSS class (musician-chip, raga-chip, comp-chip, lecdem-chip, her-chip, action-row), each with a contrived demo row and a paragraph of effect-copy, plus a separate cross-panel-seeds block, plus a view-section block. The user is asked to learn the panels by reading a glossary of widgets.

Meanwhile, the panels themselves have, since ADR-061 / ADR-064 / ADR-080 / ADR-081, evolved into **richly structured trees**: a Bani Flow panel has a section ribbon (LECDEMS → COMPOSITIONS → MISC), each section nests entities at multiple depths (composition → composer → musician chip → play button), and a Musician panel has its own ribbon (LECDEMS → CONCERTS → RECORDINGS → COMPOSITIONS) with the recordings sub-tree grouped by raga and then by composition, with versions stacked underneath.

The current tutorial does not look like that tree. It looks like a card. The user is given the alphabet but not shown a sentence.

The screenshots the user attached (Reetigowla Bani Flow panel; Ramnad Krishnan Musician panel) are *exactly the worked sentences* we should be teaching from — they are dense, populated, lineage-rich, and they happen to span every section the user will ever encounter. They are the README we wish we had been showing all along.

### Forces in tension

1. **Glossary vs. worked example.** A glossary scales (one entry per widget species); a worked example *binds*. The user does not need to be told "this is a lecdem-chip"; the user needs to see Reetigowla's actual lecdem strip and be told *why those three specific lecdems were chosen, what each teaches, and what to click first*.
2. **Mirror fidelity vs. brevity.** If the tutorial mirrors the real panel too literally, it becomes a 60-row scroll. If it abbreviates too aggressively, it stops being a worked example and reverts to a glossary. The resolution: keep the panel's section ribbon and tree shape verbatim, but populate each section with **at most three** salient entries chosen for pedagogical contrast.
3. **Voice.** The current tutorial copy is competent but flat ("Tap the chip to load it here"). `preface.md` proves the project has a voice: lyrical, lineage-aware, plainspoken about listening. The tutorials should sound like the preface, not like a tooltip.
4. **Concept density.** The new tutorial must cover, on the Bani Flow side: section ribbon, raga header, janya-of-mela relationship, Hindustani Equivalent Raga (HER) presence/absence, filter trail, LECDEMS (three kinds — meaning/context, comparative, practice), COMPOSITIONS sub-tree (composition → composer → renderer-musician chips → play), MISC bucket (alapana sketches, unsorted material), play vs. open-source affordances. On the Musician side: musician header with instrument + era + lineage chip, LECDEMS *about* this musician (subject-flipped), CONCERTS (with co-performer chips), RECORDINGS (grouped by raga → composition → versions), empty COMPOSITIONS prompt, and the chip-click cross-panel effect (Bani Flow panel populates **and** the mela wheel / Guru-Shishya graph reacts).
5. **Self-eviction.** The tutorial must vanish atomically the moment the user picks a real subject — same as ADR-086. It is the null state of the panel, not a banner.
6. **Maintenance.** Every chip in the tutorial must resolve to a real node/recording/lecdem in `graph.json` and be validated by `cli.py validate`. Stale examples must fail CI, not silently 404.
7. **Cross-panel pedagogy.** The two tutorials are a pair, not duplicates. The Bani Flow tutorial teaches the *raga axis* and uses its closing note to point at the mela wheel. The Musician tutorial teaches the *lineage axis* and uses its closing note to point at the Guru-Shishya graph. Each tutorial introduces the cross-panel effect from the side it owns.

---

## Pattern

**Worked Example as Scaffolding** (Levels of Scale + Strong Centres + Boundaries, after Alexander).

Each tutorial is structured in three concentric scales:

1. **Outermost** — the panel chrome (header, search box, section ribbon) is rendered exactly as it would be for the chosen real subject. The user is not looking at a tutorial *card* floating inside a panel; the user is looking at *the panel itself, pre-loaded* with Reetigowla (right) or Ramnad Krishnan (left), and a thin meta-layer of annotation has been threaded between the rows.
2. **Middle** — each section of the populated panel is preceded by a one-line **section gloss** explaining what that section is *for* in the language of the tradition (not the language of the widget).
3. **Innermost** — each chip / row that has been chosen for pedagogical contrast carries a **margin annotation** (a single sentence or short paragraph) pinned beside it, in a desaturated voice-tone that cannot be mistaken for the chip's own label.

The **boundary** between tutorial and live state is a single ribbon at the very top of the panel ("Worked example — tap any chip to follow the trail, or use the search above to begin your own") and a desaturated background tint on every annotation. The panel chrome is *not* desaturated — only the annotation strip is — because we want the user to recognise the chrome the moment they meet it again with real data loaded.

**Voice anchor**: the annotation copy is written in the register of `preface.md` — declarative, lyrical-where-warranted, never instructional in the imperative ("Click here to…"). It names *what the chip does in the tradition*, not *what the chip does in the DOM*.

---

## Decision

### D1 — Retire the glossary schema; introduce a worked-example schema

`carnatic/data/help/empty_panels.json` is replaced wholesale. New top-level shape:

```jsonc
{
  "schema_version": 5,
  "intro_ribbon": "Worked example — tap any chip to follow the trail, or use the search above to begin your own.",
  "bani_flow_panel": {
    "subject": { "kind": "raga", "id": "reetigowla" },
    "header_annotations": [...],
    "sections": [ /* ordered: lecdems, compositions, misc */ ],
    "closing_note": { ... }            // points at the mela wheel
  },
  "musician_panel": {
    "subject": { "kind": "musician", "id": "ramnad_krishnan" },
    "header_annotations": [...],
    "sections": [ /* ordered: lecdems, concerts, recordings, compositions_empty */ ],
    "closing_note": { ... }            // points at the Guru-Shishya graph
  }
}
```

#### Per-section shape (Bani Flow)

```jsonc
{
  "kind": "lecdems" | "compositions" | "misc",
  "section_gloss": "<one sentence in preface.md voice>",
  "rows": [
    {
      "row_kind": "lecdem" | "composition_tree" | "misc_entry",
      "data_refs": { ... ids that resolve in graph.json ... },
      "annotation": "<margin gloss for this specific row>"
    }
  ]
}
```

#### Per-section shape (Musician)

```jsonc
{
  "kind": "lecdems" | "concerts" | "recordings" | "compositions_empty",
  "section_gloss": "<one sentence>",
  "rows": [
    {
      "row_kind": "lecdem" | "concert" | "recording_tree",
      "data_refs": { ... },
      "annotation": "<margin gloss>"
    }
  ]
}
```

`row_kind=composition_tree` and `row_kind=recording_tree` are **rendered exactly as the live panel would render them** — same components, same indentation, same chip classes. The tutorial does not invent a parallel renderer.

### D2 — Validation contract

`cli.py validate` is extended (Librarian task; or already covered by ADR-086's validator — Coder to confirm) to enforce:
- every `id` resolves in `graph.json`;
- every `lecdem` row resolves to an existing lecdem entry on the named musician;
- every `composition_tree` row resolves to a composition whose `composer_id` and `raga_id` match the references;
- every `recording_tree` row resolves to a `(musician, raga, composition)` triple that exists in the corpus.

Stale tutorials must fail the build, not the user.

### D3 — Full copy (verbatim — no decisions left for Coder or Librarian)

#### Bani Flow panel — subject `reetigowla`

**Header annotations** (rendered immediately under the existing raga header row, before the filter):

- Above the `Reetigowla` raga chip:
  *"This is the raga header. Every Bani Flow trail opens with the raga (or composition) you chose. The `↗` opens the Wikipedia page for the raga."*
- Above the `Janya of … Kharaharapriya` row (annotating the link):
  *"Reetigowla is a **janya** — a 'derived' raga — born from the 22nd mela, **Kharaharapriya**. A mela is a parent scale, complete with all seven swaras in fixed order; a janya selects, skips, twists, or curves through those swaras to become its own personality. Tap the Kharaharapriya chip to climb up to the parent and see its other children — Reetigowla's siblings."*
- Above the `Hindustani equivalents:` strip (which on Reetigowla is empty):
  *"Reetigowla has no Hindustani equivalent. Most ragas don't. But some do — and when they do, the resemblance is in the swaras, not in the sound. **Darbari Kanada** (Carnatic, a janya of the 20th mela [Natabhairavi](#)) is mirrored by Hindustani **Darbari** — same notes, two entirely different musical worlds. Look for the cool blue ↔ chip on those ragas."*
- Above the `Filter trail…` box:
  *"As the trail grows, the filter narrows it. Type a composition name, a musician's name, or a raga to focus this panel on a slice of the trail. The filter is shape-preserving — sections collapse if empty, but the tree structure stays intact."*

**Section `lecdems` — `section_gloss`:**

> *"Lecture-demonstrations are how Carnatic musicians teach themselves to listeners. Before recordings, knowledge of a raga moved guru-to-shishya only; now it moves through these — and they remain the fastest doorway in."*

Rows (three, chosen for contrast across three teaching modes):

1. **David Shulman — "How to Put Together a Goddess out of Musical Scales"**
   - `data_refs`: `{ lecdem_musician_id: "david_shulman", lecdem_url: "https://youtu.be/yjbAbMu8mzY" }`
   - Annotation: *"**Meaning and context.** Shulman is a Sanskritist and a Carnatic vocalist; his lecture reads Reetigowla as Dikshitar reads it — as a vessel for a goddess. Hear what the raga *means* before you hear what it sounds like."*

2. **Seetha Rajan — "A Musical Exploration — Abhogi, Sriranjani, Ritigaula, Kanada and more"**
   - `data_refs`: `{ lecdem_musician_id: "seetha_rajan", lecdem_url: "https://www.youtube.com/watch?v=oG6RRKJpTqQ" }`
   - Annotation: *"**Relationship to other ragas.** Seetha Rajan sits Reetigowla beside its neighbours — Abhogi, Sriranjani, Kanada — and shows how a swara of difference makes a world of difference. The clearest possible answer to 'how do these ragas, which share so many notes, not sound the same?'"*

3. **TM Krishna — "In The Classroom - Part 1"**
   - `data_refs`: `{ lecdem_musician_id: "tm_krishna", lecdem_url: "<URL to be supplied by Librarian from tm_krishna.json>" }`
   - Annotation: *"**Practice — how to improvise inside a raga.** TM Krishna's classroom is the rasika's classroom too. Watch the alapana take shape phrase by phrase: this is improvisation as architecture, not ornament."*

> Librarian note: locate the actual YouTube URL for TM Krishna's *"In The Classroom - Part 1"* lecdem in `tm_krishna.json` before populating; flag in Open questions if no exact match exists and choose the closest classroom-pedagogy lecdem.

**Section `compositions` — `section_gloss`:**

> *"A composition is the structured vessel through which a raga's personality becomes audible. Each renderer reveals a different face of the same mode — same notes, same words, different soul."*

Rows (one composition_tree, fully unfolded to show the full nesting):

1. **`janani ninnuvina` — Subbaraya Sastri — Reetigowla**
   - `data_refs`: `{ composition_id: "janani_ninnuvina" }`
   - Tree (rendered identically to live panel):
     ```
     ▾ ♪ janani ninnuvina
         ♯ Subbaraya Sastri
             ▸ ○ MD Ramanathan      ▶
             ▸ ○ <one or two more renderers if present in graph>  ▶
     ```
   - Annotation (pinned beside the composition chip):
     *"The composition row carries — top to bottom — the **composition** (orange), its **composer** (dotted-outline orange), and the **musicians** who have recorded it in this raga (era-tinted). The play button ▶ on a musician row launches that specific rendering. The composer chip is itself navigable — tap it to see everything Subbaraya Sastri ever wrote."*

**Section `misc` — `section_gloss`:**

> *"Material that doesn't fit a composition — alapana sketches, ragam-tanam, untitled fragments. The unsorted shelf of the tradition: often where the most uninhibited listening lives."*

Rows (one):

1. **MD Ramanathan — "Reetigowla — Alapana Sketch"**
   - `data_refs`: `{ misc_musician_id: "md_ramanathan", misc_label: "Reetigowla — Alapana Sketch" }`
   - Annotation: *"An alapana is a raga thinking out loud — no composition, no tala, no destination. Hear MD Ramanathan move through Reetigowla in his unmistakable slow tempo: each swara dwelt in, the gamaka thick and patient. This is the raga *as raga*."*

**Closing note** (renders below the section list, anchored to a wheel-icon glyph):

> *"Every play button ▶ opens the floating YouTube player at the bottom-right. Tap the **Kharaharapriya** chip above to climb the mela wheel — the wheel will rotate to centre the 22nd mela and Reetigowla will be highlighted as one of its children. The tradition has two faces: this panel is the **raga face**, the wheel is the **modal face**, and they speak to each other through every chip you tap."*

---

#### Musician panel — subject `ramnad_krishnan`

**Header annotations** (under the musician name + lineage badge + ↗ row, before the filter):

- Above the `Ramnad Krishnan` chip with `↥ 4` badge and `↗`:
  *"This is the musician header. The `↥ 4` is the lineage depth — Ramnad Krishnan sits four generations downstream from the root of his bani. The `↗` opens his Wikipedia page. Every musician in the graph has a Wikipedia source — the curation rule is absolute."*
- Beside the era dot at the start of the chip:
  *"The coloured bar on the left of the chip encodes the **era** — golden-age, disseminator, contemporary, living. Ramnad Krishnan (1918–1973) belongs to the **disseminator** generation: the artists who carried the bani out of the gurukula and onto record."*
- Above the `Filter recordings…` box:
  *"The filter narrows the recordings list by raga, composition, or co-performer name. The sections below collapse and reform around your query without losing their tree shape."*

**Section `lecdems` — `section_gloss`:**

> *"Lectures **about** a musician — appreciations, oral histories, technical analyses of the artist's style. These appear at the top of the panel because a musician is best entered through someone who has thought hard about them."*

Rows (one representative — Librarian may add a second from the existing two on Ramnad Krishnan's profile if pedagogy calls for it):

1. **Savita Narasimhan — "On Ramnad Krishnan"**
   - `data_refs`: `{ lecdem_musician_id: "savita_narasimhan", lecdem_subject_musician_id: "ramnad_krishnan", lecdem_url: "https://youtu.be/taMZcVu0fh8" }`
   - Annotation: *"A lec-dem **about** Ramnad Krishnan is hosted on Savita Narasimhan's profile but **surfaced here** because Ramnad Krishnan is its subject. This is how lecdems are indexed: by host *and* by subject, so they appear wherever their meaning lives. Begin a musician's profile with the lecdems — let someone introduce you before the recordings begin."*

**Section `concerts` — `section_gloss`:**

> *"Full-evening recordings, grouped by the night they happened. A concert is its own unit of attention — a single bow, an arc of pieces chosen for that hall on that day. Open a concert and listen the way the audience listened."*

Rows (two, chosen for breadth — a Madras concert and a US concert):

1. **Poonamallee 1965** — `recording_id: poonamallee_1965`
   - Display the existing tree exactly: bold concert title, ▶ button, co-performer chips (`TN Krishnan`, `vellore_ramabhadran`), piece count.
   - Annotation: *"**Poonamallee 1965.** Sung at Srinivasa Farms on the outskirts of Madras, on the occasion of Alathur Sivasubramania Iyer receiving the Sangita Kalanidhi. The chips below the title are the **accompanying musicians** — violin and mridangam — each itself a node in the graph: tap one to open that musician's own panel. The piece-count tells you how many performances are nested inside; the ▶ opens the entire concert as a setlist in the floating player."*

2. **Wesleyan 1967** — `recording_id: wesleyan_1967_ramnad_krishnan`
   - Display tree with co-performer chips `T. Viswanathan`, `V. Tyagarajan`, `T. Ranganathan` (the last two may be `unmatched_name`-only — render as muted chips per the existing convention).
   - Annotation: *"**Wesleyan 1967.** Recorded at Wesleyan University in the United States with T. Viswanathan on flute — one of the first Carnatic concerts on a Western university stage. Co-performers whose chips appear *muted* are present in the recording metadata but not yet linked to a node in our graph: a curation invitation. Every concert is also an invitation to widen the lineage."*

**Section `recordings` — `section_gloss`:**

> *"Every individual rendering Ramnad Krishnan has on record, grouped first by **raga**, then by **composition**, then by **version** (different concerts, different years, different moods). Read it like a tree: the raga is the room, the composition is the door, the version is the way he walked through it that evening."*

Rows (two recording_trees, deliberately one Begada kriti and one Huseni padam, to show range across composer / tala / language):

1. **♦ Begada → ♪ Abhimanamennedu (Patnam Subramanya Iyer)**
   - `data_refs`: `{ raga_id: "begada", composition_id: "abhimanamennedu" }`
   - Tree (rendered live):
     ```
     ▾ ♦ Begada
         ▾ ♪ Abhimanamennedu
             ♯ Patnam Subramanya Iyer
                 ▸ <version 1 — venue/year>  ▶
                 ▸ <version 2 — if present>  ▶
     ```
   - Annotation: *"Ramnad Krishnan in **Begada** is said to be unparalleled. Abhimanamennedu — a kriti of Patnam Subramanya Iyer — appears here with each surviving version stacked underneath. Tap a version's ▶ to hear that one specifically; tap the composition chip to open Begada's full Bani Flow trail across every musician in the graph who has recorded in it."*

2. **♦ Huseni → ♪ Ilalo Priyudu (Kshetrayya)**
   - `data_refs`: `{ raga_id: "huseni", composition_id: "ilalo_priyudu" }`
   - Tree (rendered live, same shape).
   - Annotation: *"A padam of **Kshetrayya** in **Huseni** — Telugu, slow, sensual, the genre Ramnad Krishnan inherited directly through T. Brinda and the Dhanammal bani. Where the kriti speaks of god, the padam speaks as the lover. Two ragas, two genres, the same voice — the recordings tree is how that range becomes visible."*

**Section `compositions_empty` — `section_gloss`:**

> *"This section lists compositions **authored by** this musician. Ramnad Krishnan was a performer of immense range but not a composer — so this section is empty. Open the panel of one of the **Trinity** instead — Tyagaraja, Muthuswami Dikshitar, or Shyama Shastri — and watch this section bloom into hundreds of works, each one a door into a raga."*

Rendered shape: the empty `COMPOSITIONS (0)` section header, with this gloss in the space where rows would be, followed by three navigable chips:

- `<cm>Tyagaraja</cm>` `<cm>Muthuswami Dikshitar</cm>` `<cm>Shyama Shastri</cm>`

Each chip is live and opens the named composer's musician panel.

**Closing note** (rendered below the last section, anchored to a graph-icon glyph):

> *"Every chip you tap in this panel echoes across the canvas. Tap a raga chip and the **mela wheel** rotates to centre its parent mela. Tap a musician chip and the **Guru-Shishya graph** lights up the lineage — the chain of teachers and students through which this artist learnt and taught. The graph is sparse on purpose: only musicians connected by a documented relationship appear. The tradition is a forest, not a list."*

### D4 — Render contract

- Both tutorials are **the null state** of their respective panels — dismissed atomically when a real subject loads, restored when the panel is cleared. No change from ADR-086 dismissal semantics.
- The **intro ribbon** sits above the populated worked-example body so it is impossible to mistake the tutorial for live data.
- Annotation strips use a **single new design token** `--annotation-bg` (Coder's call: derive via `color-mix(in srgb, var(--bg-deep) 88%, var(--fg-muted))` or equivalent). No new colours otherwise.
- The worked-example tree rows reuse the existing renderers (`renderBaniTrail`, `renderMusicianPanel`, lecdem strip, concert renderer). The tutorial does **not** ship a parallel renderer — that is the whole point of the worked-example pattern. The Coder's task is to give those renderers a `tutorialMode: true` input that:
  1. accepts a curated subset of rows (from `helpEmptyPanels.<panel>.sections[*].rows`) instead of building from `graph.json`;
  2. interleaves the annotation strings between rows;
  3. disables any interactions the panel does not yet support in tutorial mode (e.g., the filter input is rendered but inert until a real subject loads — its annotation explains this).
- The `preface.md` modal continues to be invoked from the "?" affordance. It is the manifesto. The tutorials are the worked examples. Both surfaces live; neither replaces the other.

### D5 — Retirement list (no migration window)

The following keys in `empty_panels.json` are removed:

- `musician_panel.chip_catalogue`
- `musician_panel.cross_panel_seeds`
- `musician_panel.view_section`
- `bani_flow_panel.chip_catalogue`
- `bani_flow_panel.cross_panel_seeds`
- `bani_flow_panel.view_section`
- `mechanics_bullets`
- `help_cards`

If any of those keys are still referenced after the Coder's pass, the build fails — there is no fallback path. This is intentional; ADR-086's catalogue model is fully superseded.

---

## Consequences

**Positive.**
- The first thing a new user sees in either panel is a **real lineage of the tradition**, not a glossary of widgets. The README is now where the user is looking.
- Every concept the panels rely on — janya/mela, HER, lecdem-by-subject, concert-as-unit, recording tree, cross-panel echo — is taught **once, on the chip where it lives**, never in a separate help document.
- The tutorial cannot drift from the panel's real layout, because it *is* the panel's real layout, with annotations threaded in. Any future panel refactor (new section, new chip shape) automatically reshapes the tutorial too.
- Voice continuity: the annotations sound like `preface.md`. The site now has a single register.
- The empty `COMPOSITIONS` section becomes a curation invitation rather than a dead row — it points the user at the Trinity.

**Negative / costs.**
- The Coder must factor the existing panel renderers to accept a `tutorialMode` input. This is a non-trivial refactor; it should be done one section at a time, with the old catalogue renderer kept only long enough to switch over per-section.
- Annotation copy is locked in this ADR — future copy revisions require a follow-up ADR (or, more pragmatically, a Librarian-level patch with the Architect notified).
- The validator must grow `lecdem` and `recording-triple` resolution. If this exceeds what the existing `cli.py validate` covers, the Coder must extend it before the Librarian's data PR can land.
- The tutorial now references specific URLs (David Shulman, Seetha Rajan, TM Krishna, MD Ramanathan, Savita Narasimhan, Poonamallee 1965, Wesleyan 1967, Abhimanamennedu, Ilalo Priyudu, janani ninnuvina) — any of these getting re-tagged or removed without updating `empty_panels.json` will fail the build (this is the *desired* failure mode, per ADR-086 principle).

**Neutral.**
- `preface.md` is untouched and remains the project manifesto.
- ADR-086, ADR-087, ADR-090, ADR-091 are marked **Superseded by ADR-147** in their Status field (Librarian/Architect follow-up).

---

## Implementation handoff

This ADR contains **all the copy**. No further design decisions are needed before implementation. The work splits cleanly:

### Librarian (data only — `carnatic/data/help/empty_panels.json`)

1. Replace the file wholesale with a payload conforming to **D1** (schema_version 5), populated with the copy in **D3**.
2. Resolve the one open lookup: TM Krishna's *"In The Classroom - Part 1"* YouTube URL from `tm_krishna.json`. If no exact match, flag in `carnatic/.clinerules` Open questions and choose the closest classroom-pedagogy lecdem in his profile.
3. Run `python3 carnatic/cli.py validate` and ensure every referenced id/url resolves; if the validator does not yet cover lecdems-by-subject or recording-triples, file a note for the Coder and proceed once D2 lands.
4. Commit: `data(config): seed ADR-147 worked-example tutorials for Reetigowla and Ramnad Krishnan` with body citing this ADR and listing every musician/raga/composition/recording id used.

### Carnatic Coder (`carnatic/render/templates/empty_tutorials.js` + panel renderers)

1. Implement the schema_version 5 reader in `empty_tutorials.js`; remove all readers for the retired keys listed in **D5**.
2. Add `tutorialMode` input to the Bani Flow panel renderer and the Musician panel renderer so they can be driven from `helpEmptyPanels.<panel>` instead of `graph.json`. Re-use existing row renderers — do not duplicate them.
3. Implement the **intro ribbon**, **section gloss strip**, and **annotation strip** as desaturated overlays sharing the panel's typographic scale (see D4). Introduce only `--annotation-bg` if a new token is needed; otherwise reuse `--bg-deep` + `--fg-muted`.
4. Extend `cli.py validate` (or the empty-panel validator subroutine) to cover the new ref types per **D2**.
5. Re-render: `.venv/bin/bani-render`. Confirm both panels show the worked examples on a fresh page load, and that selecting any real subject atomically replaces the tutorial.
6. Commit: `tool(toolchain): implement ADR-147 worked-example tutorials in panel renderers` with body describing the renderer refactor and validator extension.

### Git Fiend

- This is a multi-file change spanning data, code, and an ADR. Branch decision: **branch is warranted** (`feature/147-worked-example-tutorials`). The ADR commit (this file) lands first on the branch; Librarian and Coder commits stack on top; PR opened citing ADR-147.

---

## Open questions

- Should the worked-example body be **scrollable independently of the panel**, or should it flow with the panel scroll? Recommendation: flow with the panel — the goal is for the tutorial to feel like the panel itself, and a nested scroll container would betray that. Final call: Coder during implementation.
- For the empty `COMPOSITIONS` section in the Musician panel, should the three Trinity chips be rendered with the standard musician-chip styling (era-tinted, with instrument badge) or in a muted "see also" treatment? Recommendation: standard styling — they are real navigable chips, not annotations.
- Long-term: extend the worked-example pattern to a third panel (Composer panel, ADR-057) once that panel's tree shape stabilises. Out of scope for this ADR.
