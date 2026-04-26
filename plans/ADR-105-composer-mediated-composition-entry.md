# ADR-105: Composer-Mediated Composition Entry

**Status**: Proposed
**Date**: 2026-04-26
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-031 (data entry forms), ADR-085 (self-replicating curation loop), ADR-103 (co-located edit affordances)
**Related**: ADR-104, ADR-106, ADR-107

---

## Context

The Librarian's hard rule (CLAUDE.md): *every composition has a verified `composer_id`. Without a composer, no composition.* Today this rule lives in two places: in the writer's validation (a composition with an unknown composer_id is rejected) and in the librarian's discipline. It does **not** yet live in the UI: a contributor opening the global Add bar is asked to pick a composer from a combobox, where they may pick wrongly, leave it blank, or fail to find the composer they meant.

The cleanest enforcement is structural: **the only place to add a composition is from the composer's own panel**. A rasika navigating to Tyāgarāja and wanting to add a composition does so on the Tyāgarāja panel; the form opens with `composer_id = tyagaraja` already locked. The schema rule becomes the navigation rule. There is no path through the UI that produces a composer-less composition.

The composer panel today already lists *Compositions (N)* as a section header. The natural placement of the affordance is **the right edge of that header row**: a small `+` chip whose meaning is unambiguous in context — *add a composition by this composer*.

### Forces

| Force | Direction |
|---|---|
| **Schema-as-UI (ADR-103 §4)** | The hard rule "every composition needs a composer" is expressed structurally by making the composer the only entry point. |
| **Co-location (ADR-103 §1)** | The trigger sits on the section header it acts on. |
| **Pre-targeting (ADR-103 §2)** | The form opens with the composer pre-filled and locked. The contributor cannot accidentally attach the composition to a different composer. |
| **Discoverability** | A `+` next to a count is a near-universal UI signal for *add to this list*. No tutorial copy needed. |
| **Reading is primary** | The chip is small and inline with the count, not a button block. |
| **Single dispatch** | The Add Composition form is unchanged; only its launch surface multiplies. |

---

## Pattern

**Pattern 80, *A Pattern Language*: *Self-Governing Workshops and Offices*.** The most reliable enforcement of a rule is to put the work where the rule is already implicit. A workshop run by its workers does not need a sign saying *"you may not enter without authorisation"* on the door because the door opens onto a place where authorisation is structurally established. A composition added from a composer's panel does not need a validator to remind it of its composer because the composer is already the room it stands in.

**Property 5, *Positive Space* (*The Nature of Order* Book 1).** The negative space of a composer panel — the gap between *Compositions (N)* and the first composition row — is currently dead. ADR-105 makes that gap *positive*: a small `+` chip that completes the row's grammar.

---

## Decision

### 1 — `+` chip on the "Compositions (N)" row of every composer panel

Where any panel renders a section header of the form *Compositions (N)* attached to a composer subject, the right edge of that header row gains a `+` chip:

```
COMPOSITIONS (47)                                                  +
  · Sri Dakshinamurte    [Shankarabharanam]   [played by …]
  · Vande Meenakshi Twam [Khamas]             [played by …]
  ...
```

Affected panels:

- The composer panel (when a composer is the subject).
- Any panel where the composer is contextually unambiguous (e.g., a future "All Tyāgarāja kritis" view). For panels where the composer is ambiguous (e.g., the bani-flow raga panel listing compositions in *Kharaharapriya* by many composers), **no chip** is rendered — adding here would force a composer pick, defeating the ADR's purpose.

The chip uses the visual language of ADR-103 §6.

### 2 — Click behaviour

Clicking the `+` opens the existing **Add Composition** form (`buildCompositionForm` in `entry_forms.js`) with:

- `composer_id` pre-filled to the panel's composer.
- The `composer_id` field rendered as a locked chip with a small `change` link (ADR-103 §2).

All other fields (title, raga, language, tala, source URL) remain to be filled by the contributor as today.

### 3 — Inline raga escape hatch is preserved

The Add Composition form already exposes a *+ Add missing raga* affordance under its raga combobox (ADR-031, retained per ADR-097 §6). That escape hatch is unchanged: a contributor adding a Dīkshitar kriti in a raga not yet in the corpus can add the raga inline. The chip on the composer panel does not bypass this — it shortens the composition path, not the raga path.

### 4 — What this ADR does NOT do

- **Does not add a standalone "+ Add Composition"** to the global launcher. The launcher's existing entry remains during the deprecation window (ADR-103 §3) but no new entry is added.
- **Does not change the composition entity shape.** No schema change. The form's output is unchanged.
- **Does not couple to ADR-104.** The composer panel's `✎` (ADR-104) edits the composer; ADR-105's `+` adds a composition by the composer. They sit on different rows of the same panel and do not collide.
- **Does not auto-link the new composition to any specific recording or YouTube entry.** That coupling, if needed, happens via the existing performance/segment writes (ADR-101).

---

## Consequences

### Positive

- **Composer-less compositions become structurally impossible** through the read surface. The schema rule is enforced by navigation, not by validation alone.
- **The contribution flow matches the rasika's mental model**: she opens the composer, sees what is missing, adds it.
- **The Add Composition form's combobox of composers becomes redundant** for this entry path. The form still renders it (locked) so the contributor can confirm the target.
- **Counts update naturally.** After ingest and render, the *Compositions (N)* count increments, providing immediate visible feedback.

### Negative / accepted tradeoffs

- **A contributor who wants to add a composition without first navigating to the composer must use the deprecated launcher.** Accepted: the deprecated launcher persists for exactly this case during the rollout window.
- **Composers who do not yet exist as panels (i.e., not in `composers.json`) cannot host the chip.** Accepted: such compositions cannot be added through the loop until the composer is added first. This is the rule we are encoding.

### Risks

- **A composer panel with zero compositions has nothing under the *Compositions (0)* header except the chip.** Accepted: this is correct — the chip is the only thing the section can offer until contributions arrive. The empty-panel tutorial (ADR-086) handles the *"how do I add one"* messaging.

---

## Implementation

### Phase 1 — Render the chip on the composer panel

In the panel renderer (likely `bani_flow.js` or the composer panel template):

1. When rendering the composer panel's *Compositions (N)* section header, append a `+` chip element.
2. The chip's click handler calls `openAddCompositionForm({composerId})` — a new helper exported from `entry_forms.js`.

### Phase 2 — `openAddCompositionForm` helper

In `carnatic/render/templates/entry_forms.js`:

1. Add `openAddCompositionForm({composerId})` that opens the existing Add Composition window with `composer_id` pre-set and rendered as a locked chip with a `change` link.
2. No change to the form's submission path — it continues to call `addToBundle('compositions', compItem)` per ADR-097 §3 with `op` defaulting to `"create"`.

### Verification

- `bani-render` succeeds; the Tyāgarāja panel shows `+` to the right of *Compositions (N)*.
- Clicking the chip opens the Add Composition form with `composer_id = tyagaraja` locked.
- The contributor fills title, raga, language, tala, source URL, submits.
- Bundle download contains a `compositions[]` create item with `composer_id: "tyagaraja"`.
- After `bani-add` and `bani-render`, the new composition appears on the panel and the count is `N+1`.

---

## Closing note

The composer is the room a composition is composed in. ADR-105 ensures that to add a composition, you must first walk into the room.
