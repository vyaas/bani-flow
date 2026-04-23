# ADR-086: Empty-Panel Tutorials — Smuggling the README into the Workshop

**Status**: Proposed
**Date**: 2026-04-23
**Agents**: graph-architect (proposes); carnatic-coder (implements rendering); librarian (curates the example seed list once schema lands)
**Depends on**: ADR-003 (left sidebar), ADR-005 (right sidebar space utilisation), ADR-011 (left/right sidebar symmetry), ADR-020 (raga–composition header parity), ADR-022 (raga panel navigability), ADR-080 (musician panel lecdem sections), ADR-081 (bani-flow lecdem strip)
**Supersedes**: none — extends the empty-state convention established by ADR-005 (`#sheet-peek-label`) and the static `help.md` modal.

---

## Context

A first-time visitor to `https://vyaas.github.io/bani_flow/` lands on a page where the canvas is busy (a force-directed graph or a raga wheel) but **both side panels are empty**. The Bani Flow panel shows a search box and nothing else. The Musician panel shows a search box, a `—` placeholder name, and a single peek label that says “Tap a musician to explore ↑”.

That peek label is correct, terse, and useless. It does not tell the rasika:

- what kinds of things they can search for in each box (raga? composition? lecdem? musician?)
- what the panel is going to show them once they pick something
- how the **two views** (Mela-Janya wheel vs. Guru-Shishya graph) change what each panel surfaces
- what a *good* first click looks like — what is the equivalent of “open `examples/hello.py`” for a knowledge graph of a 250-year-old oral tradition?

The cost of this silence is not theoretical. The single biggest UX failure of a graph explorer is that it looks like a poster, not a tool. The user sees the wheel, admires it for ten seconds, scrolls, sees nothing reactive, and closes the tab. The panels — which are where the depth of the corpus actually *lives* — never get opened.

Meanwhile, the project already maintains `carnatic/render/templates/help.md`, but it is stashed behind a help affordance most users will not discover. The README has been written; it is just not where the user is looking.

There is an obvious move available: **the empty panel is the best surface in the application for a mini-tutorial**, because (a) it is empty by definition, (b) it is exactly where the user’s attention is when they first wonder “what now?”, and (c) it is self-evicting — the moment the user does the thing the tutorial taught, the tutorial is replaced by the user’s own exploration.

This ADR proposes the schema, content shape, and rendering contract for those tutorials. It is **not** a content ADR — the seed list of examples is curated by the Librarian, but the structure that holds them is decided here.

### Forces in tension

- **Pedagogy vs. clutter**. The tutorial must teach without becoming a wall of text the user must dismiss. It must look like *part of the panel*, not a modal pasted on top.
- **Help text vs. live state**. The user must understand at a glance that what they see is *help* — not stale data, not a broken render, not a “0 results” miss. Misreading a tutorial as broken state is worse than no tutorial at all.
- **View-coupling**. The Musician panel’s tutorial must reflect the *current canvas view*. In Guru-Shishya view, “musician” means a node in the lineage graph. In Mela-Janya view, “musician” still means the same node, but the panel’s entry vector is different (you usually arrive there *via* a raga rather than directly). The tutorial copy must adapt.
- **Concrete > abstract**. The tutorial is dramatically more useful if the examples are *clickable* and resolve to real nodes, real recordings, real lecdems already in the corpus. Verified IDs, not invented placeholders.
- **Self-replication (ADR-085)**. Tutorials are a write surface in disguise: they teach the user to read, but the loop is closed only if the same user, weeks later, can also *contribute*. Tutorials must mention — at minimum — the existence of `+ Lecdem` / `+ Performer` entry buttons.
- **Maintenance**. The example IDs (`tyagaraja`, `ramnad_krishnan`, `tm_krishna`, `thodi`, `parulanna_matta`, `abhimanamennedu`) will drift over time as nodes are renamed or merged. The schema must make stale examples obvious to a CI check, not silent.

---

## Pattern

**Strong Centres + Boundaries + Levels of Scale.**

The empty panel is currently a *weak centre*: a search box floating above white space. We want to make it a *strong centre* by giving it a body, but the body must dissolve cleanly the moment the panel earns its real role (showing a node’s recordings or a raga’s performer trail). The tutorial is therefore not a layer on top of the panel; it is the **null state of the panel**, sharing the panel’s frame, padding, and typographic scale.

Three levels of scale inside each tutorial card:

1. **Headline** — one sentence answering “what is this panel for?”
2. **Mechanic** — three or four short bullets covering search, filter, view-coupling.
3. **Examples** — a list of clickable seed entries that, when tapped, transition the panel out of its tutorial state into its normal state with that subject already loaded.

The boundary that protects the tutorial from being misread as data is a **conspicuous label** at the top of the card (“How to use this panel”) and a muted/desaturated visual treatment that distinguishes it from live content. The tutorial is content, but it is *meta*-content, and it must look it.

---

## Decision

### 1. Storage: a new data file `carnatic/data/help/empty_panels.json`

The tutorial copy and example IDs are **data, not template**, because:
- the Librarian must be able to update the seed examples (a recording gets re-tagged, a composition is renamed, a new TMK lecdem becomes the canonical pedagogical example) without a Coder PR;
- the file can be validated by the existing CLI: every `id` referenced must resolve in `graph.json`, or the build is broken;
- the same seed can be reused later by the public-facing README, by a screenshot test, or by an onboarding email.

Schema (before / after):

**Before** — does not exist.

**After** — new file:

```json
{
  "schema_version": 1,
  "musician_panel": {
    "headline": "This panel shows what a musician has recorded.",
    "mechanics": [
      "Type a name in the search box, or tap a node on the graph to load it here.",
      "In Guru-Shishya view, the panel follows whichever musician you tap on the lineage graph.",
      "In Mela-Janya view, tapping a raga opens the Bani Flow panel; this panel stays in sync with the last musician you visited.",
      "Use the filter to narrow the recording list by composition, raga, or year.",
      "Tap ▶ on any recording to open it in the floating YouTube player.",
      "Use + Performer / + Lecdem to contribute a recording you know about (see ADR-085)."
    ],
    "try_these": {
      "label": "Try one of these to see the panel in action:",
      "groups": [
        {
          "subject_kind": "composer",
          "subject_id": "tyagaraja",
          "subject_label": "Tyagaraja — two compositions",
          "items": [
            { "kind": "composition", "id": "ninnada", "label": "Ninnada nela" },
            { "kind": "composition", "id": "samayamide_rara", "label": "Samayamide rara" }
          ]
        },
        {
          "subject_kind": "musician",
          "subject_id": "ramnad_krishnan",
          "subject_label": "Ramnad Krishnan — Poonamalee 1965",
          "items": [
            { "kind": "recording_ref", "musician_id": "ramnad_krishnan", "concert_hint": "poonamalee_1965", "raga_id": "begada", "label": "Begada (Poonamalee 1965)" },
            { "kind": "recording_ref", "musician_id": "ramnad_krishnan", "concert_hint": "poonamalee_1965", "raga_id": "devagandhari", "label": "Devagandhari (Poonamalee 1965)" }
          ]
        },
        {
          "subject_kind": "musician",
          "subject_id": "tm_krishna",
          "subject_label": "TM Krishna — two lecdems",
          "items": [
            { "kind": "lecdem_ref", "musician_id": "tm_krishna", "pick": "any", "n": 2, "label": "Two recent lecture-demonstrations" }
          ]
        }
      ]
    }
  },
  "bani_flow_panel": {
    "headline": "This panel shows everyone who has recorded a raga or composition.",
    "mechanics": [
      "Type a raga or composition in the search box, or tap a raga on the wheel / a composition chip in the Musician panel.",
      "Mela-Janya view: tapping a raga in the wheel loads its trail of recordings here, oldest → newest.",
      "Guru-Shishya view: the panel still works — search by composition to see every musician who has it in their repertoire.",
      "When the subject is a melakarta raga, expand Janyas to navigate to its derived ragas.",
      "Lecdems on the subject appear as a strip above the trail (ADR-081)."
    ],
    "try_these": {
      "label": "Try one of these to see the panel in action:",
      "groups": [
        {
          "subject_kind": "raga",
          "subject_id": "thodi",
          "subject_label": "Thodi — the heavyweight",
          "blurb": "Every era and every bani has a Thodi. The trail spans the early 78-rpm masters through the contemporary stage."
        },
        {
          "subject_kind": "composition",
          "subject_id": "parulanna_matta",
          "subject_label": "Parulanna Matta (Kapi)",
          "blurb": "A javali in Kapi by Dharmapuri Subbaraya Iyer; recorded across vocal and instrumental traditions, useful for hearing how a single composition travels."
        }
      ]
    }
  }
}
```

Notes on the `try_these.items` shape:

- `kind: "composition"` resolves to a composition node id; clicking loads the composition into the Bani Flow panel (the existing trail-by-composition behaviour).
- `kind: "recording_ref"` is a *soft pointer*: `{musician_id, concert_hint, raga_id}`. The Coder’s render-time resolver looks up the matching recording by `(musician, concert label substring, raga)` and binds the click to “open this track in the floating player”. This indirection lets the seed survive a recording being re-IDed.
- `kind: "lecdem_ref"` with `pick: "any", n: 2` lets the Coder pick the two most recent lecdems by `tm_krishna` at render time. This avoids hard-coding a specific lecdem id that may be re-curated.
- `subject_kind: "composer"` opens the composer’s musician panel and pre-scrolls to the composition list (the panel already supports this — ADR-080).

### 2. Validation: `cli.py validate` learns about help references

Every `id` field in `empty_panels.json` (`subject_id`, items.`id`, `musician_id`, `raga_id`) must resolve in `graph.json`. A composition `concert_hint` must match at least one recording when paired with its `musician_id`. A failed resolution fails CI the same way an unresolved composer or raga id fails today (ADR-016).

This is the mechanism that prevents tutorial bit-rot: the seed examples are validated alongside the rest of the corpus, and a Librarian renaming a node can no longer silently leave the tutorial pointing at nothing.

### 3. Render contract (specified here, implemented by Coder)

When either panel is in its empty state — no node selected, no search subject, no trail loaded — render the corresponding `*_panel` block from `empty_panels.json` *inside the panel’s scrollable region*, replacing nothing in the sticky header (search and view-selector remain available).

Visual language:

- A wrapper element with class `panel-tutorial` and an explicit, conspicuous label (“How to use this panel” or equivalent localisable string).
- Muted background tint distinct from live recording cards (use the existing `--bg-deep` / `--fg-muted` design tokens from ADR-028 — no new tokens introduced by this ADR).
- Headline rendered in the same typographic scale as a node header, mechanics as a normal `<ul>`, examples as chips that match the existing `comp-chip` / `raga-chip` / musician-chip vocabulary so the user learns the chip syntax by using it.
- The tutorial card *must* be dismissed atomically the moment a subject is loaded. It must never appear above or alongside live content — it is the null state, not a banner.

View-coupling for the Musician panel:

- The panel exposes its mechanics list filtered to the current view (`view === 'graph'` → omit Mela-Janya bullets; `view === 'raga'` → keep both, since both apply).
- The same `try_these` list is shown in both views — examples are anchored in the corpus, not in the view.

Re-entry behaviour:

- Once the user has interacted with the panel and then *cleared* the selection (back-navigates to a no-subject state), the tutorial returns. This is intentional: the help is contextual to the panel being empty, not to the session being new.

### 4. Discoverability of `+ Performer` / `+ Lecdem`

The musician-panel tutorial’s last mechanic bullet must include a chip-style link to the entry forms (ADR-031, ADR-082) so the self-replicating loop (ADR-085) is visible from the very first paint. This is the only place in the application where a brand-new visitor naturally encounters the *contributor* surface — we should not waste it.

---

## Consequences

### Positive

- **First visit becomes legible.** A rasika who lands on the site sees, in the first paint, what each panel does and what a worthwhile first click looks like. Time-to-first-meaningful-interaction drops from “whenever they happen to tap something” to “the moment they read the chips”.
- **The README is where the user is looking.** Help text moves from a buried modal into the empty space it was always going to occupy.
- **Tutorial bit-rot is impossible.** Renaming `parulanna_matta` or removing `tm_krishna`’s lecdem cascade through `cli.py validate`. The build breaks loudly instead of leaving a broken example.
- **Self-replication becomes visible.** The contributor surface (`+ Performer`, `+ Lecdem`) is named in the same paint that explains how to read — closing the loop ADR-085 named.
- **Mela-Janya ↔ Guru-Shishya symmetry.** The tutorial copy makes the relationship between the two views explicit, which is currently only learnable by experimenting.

### Negative / cost

- **A new data file** — small, but it is one more place the Librarian must know exists. Mitigated by a `READYOU.md` in `data/help/`.
- **Render-time resolution of soft pointers (`recording_ref`, `lecdem_ref`)** requires a small amount of new code in the render pipeline. This is contained to the help-rendering site and does not touch the existing recording or lecdem code paths.
- **One more failure mode in CI.** A Librarian renaming a node now has to update one more file. This is the cost of validation; it is the same cost that already exists for compositions and recordings.

### Neutral

- The existing `help.md` and the eventual help modal are *not* deprecated. They serve a different purpose: a single canonical narrative. The empty-panel tutorials are *contextual* — they answer “what is this panel?”, not “what is this project?”. Both should continue to exist.

---

## Implementation (sketch — Coder will refine in their own PR after acceptance)

1. **Librarian** — once this ADR is Accepted:
   - Create `carnatic/data/help/empty_panels.json` with the schema above.
   - Create `carnatic/data/help/READYOU.md` describing the file.
   - Verify all referenced ids exist (`tyagaraja`, `ninnada`, `samayamide_rara`, `ramnad_krishnan`, `begada`, `devagandhari`, `tm_krishna`, `thodi`, `parulanna_matta`, `kapi`). If any are missing, add them through the normal write_cli flow before merging this ADR’s implementation.
   - Decide whether `abhimanamennedu` is the right Begada track for the Poonamalee 1965 example and substitute if a more representative Ramnad Krishnan recording is available on that raga in that concert.
   - Commit: `data(help): seed empty-panel tutorial examples`.

2. **Carnatic Coder** — in the same or following PR:
   - Extend the loader pipeline to read `data/help/empty_panels.json` into `graphData.help` at render time.
   - Extend `cli.py validate` to resolve every `id` / `recording_ref` / `lecdem_ref` in the help file against `graph.json`.
   - In `base.html` + `bani_flow.js` + the musician-panel rendering site, add a `panel-tutorial` block that renders when the panel has no subject loaded. Style with existing tokens.
   - Implement click handlers for chip kinds: composition / raga / musician / composer / recording_ref / lecdem_ref → existing selection actions.
   - Hide the tutorial atomically when a subject is loaded; restore it when the subject is cleared.
   - Run `bani-render` and verify both panels show their tutorial in the empty state and dissolve correctly on first interaction.
   - Commit: `tool(toolchain): render empty-panel tutorials per ADR-086`.

3. **Graph Architect** — flip status to Accepted once the user signs off on the schema in this ADR.

---

## Open questions to resolve before implementation

- Should the tutorial show on *every* return to the empty state, or only on the *first* visit per session (with a “show help again” affordance)? Default proposed here: every return, no dismissal — the panel is empty anyway, so there is no cost.
- Does the Mela-Janya view need its *own* tutorial overlay on the canvas, or is the Bani Flow panel’s tutorial enough? Out of scope for this ADR; flag as a follow-up if first-visit telemetry suggests the canvas itself is illegible.
- The `try_these` lists are deliberately short (2 composer compositions, 2 Ramnad Krishnan tracks, 2 TMK lecdems, 1 Thodi, 1 Parulanna Matta). Is six the right cap per panel, or should the Librarian be free to add more? Default: cap at six in the schema validator, force a Librarian PR if more are wanted, to keep the tutorial scannable.
