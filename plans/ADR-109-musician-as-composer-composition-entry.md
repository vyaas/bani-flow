# ADR-109: Musician-as-Composer — Composition Entry from Musician Panels

**Status**: Accepted
**Date**: 2026-04-26
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-031 (data entry forms), ADR-083 (bundle write channel), ADR-085 (self-replicating curation loop), ADR-105 (composer-mediated composition entry)
**Related**: ADR-100 (edit coverage matrix), ADR-108 (musician add chip), ADR-111 (bottom bar retirement)

---

## Context

ADR-105 placed a `+` chip on the "Compositions (N)" section header of *composer panels*, enabling composition entry from the composer's own panel with `composer_id` pre-locked. This was the right structural move. But it has a blind spot:

**A musician on the graph may also be a composer — and the system will not show the `+` chip unless they already have a `composers[]` record with `musician_node_id` pointing back to them.**

Of the 58 composers in the corpus, only 8 have a `musician_node_id`. The remaining 50 are historical figures with no musician graph node (the Trinity, medieval vidwans, etc.) — they exist in `composers.json` but not as `nodes[]`. This is correct and expected.

But for the 8 who are both — and for any future musician who is also a performer-composer — the current UI flow is:

1. Navigate to the musician panel.
2. Notice there is no `+` on the Compositions header (the check `composerForNode` fails if the link is missing or if no composer record exists yet).
3. Leave the musician panel.
4. Open the global Add bar → "Add Composer" → create a composer record with `musician_node_id` set.
5. Return to the musician panel (now the link may appear after re-render).
6. Only now does the `+` chip appear.

This is exactly the multi-step, context-switching friction that ADR-103 was written to eliminate. Steps 3–5 are pure overhead. And they only exist because we model composer as a *separate entity* from musician, when in practice many musicians are composers and the distinction is a data-layer concern, not a user-level concept.

The user-level concept is: **"I'm looking at TM Krishna. He composed X. I want to add X."** That the system may need to create a composer record for TM Krishna alongside X is an implementation detail — not something the contributor should manage separately.

### Forces

| Force | Direction |
|---|---|
| **The Librarian's hard rule** | Every composition needs a `composer_id`. This rule is inviolable and is encoded in the writer's validation. The form must respect it. |
| **User-level concept** | Musicians who compose are composers. The data model split is an artefact; the user sees one entity. |
| **Auto-create on demand** | When a contributor adds a composition from a musician's panel, the bundle may need to contain *both* a composer record (if one doesn't exist yet) and the composition. The system, not the contributor, decides when a companion record is needed. |
| **Idempotent ingestion** | If the musician already has a composer record, the bundle should not duplicate it. The auto-created companion record includes `musician_node_id`; the ingester can skip-create if the id already exists (existing `op: "create"` duplicate behaviour). |
| **Historical-only composers remain unchanged** | Composers who are not musician nodes (the Trinity, etc.) are still added through the inline escape hatch in the composition form, or through a future Add Composer entry form. This ADR does not touch that path. |
| **The `+` chip must not silently fail** | If a musician panel shows no `+` on the Compositions header because the link check fails, the contributor has no visible indication of why. The chip should appear for all musicians and handle the auto-create case gracefully. |

---

## Pattern

**Christopher Alexander, *A Pattern Language*, Pattern 58 — *Carnival*.** The contribution space should be a place where each act of authorship is its own complete event. Creating a composition by Lalgudi Jayaraman should not require the contributor to first create "Lalgudi Jayaraman the Composer" as a preparatory act. The two are the same person. The system should recognise this and handle the bookkeeping.

**ADR-085 §3 (read implies write), extended by ADR-103.** A musician panel that lists compositions should offer the affordance to add a composition on that same panel, regardless of whether the underlying data model has a pre-linked composer record. The affordance is a property of the *reading surface* (musician panel), not of the *data state* (composer record present/absent).

---

## Decision

### 1 — `+` chip appears on Compositions header for ALL musicians

The rendering logic (currently in `graph_view.js`) that checks `composerForNode` before appending the `compAddChip` is changed to:

- **Always** render the `+` chip on the Compositions section header when a musician panel is displayed.
- Attach the `composerForNode` (if found) to the click handler so `openAddCompositionForm` receives it.
- If no `composerForNode` exists, pass `{ musicianId: nodeId }` instead of `{ composerId }`.

### 2 — `openAddCompositionForm` extended to accept `musicianId`

New signature:
```js
openAddCompositionForm({ composerId, musicianId } = {})
```

Behaviour when called with `musicianId` and no `composerId`:

1. Look up whether a composer record already exists for this musician:
   ```js
   const linkedComposer = (graphData.composers || []).find(c => c.musician_node_id === musicianId);
   ```
2. **If found**: use `linkedComposer.id` as `composerId`. Behaviour is identical to the existing ADR-105 path.
3. **If not found**: enter *musician-as-composer* mode.
   - The musician's node data (label, era, born/died) is fetched from `graphData.nodes`.
   - A prospective composer id is synthesised (same as the musician's node id).
   - The form's composer field is locked, showing the musician's name with a note: *"A composer record for [Name] will be created alongside this composition."*
   - On "Add to Bundle", the bundle receives **two items**: a `composers` create item (with `musician_node_id` set to the musician's id, name and era inferred from the node), and the `compositions` create item with `composer_id` pointing to the new composer id.

### 3 — Auto-generated companion composer record shape

When a musician-as-composer companion record is auto-generated:

```jsonc
{
  "id":               "<same as musician node id>",
  "name":             "<musician node label>",
  "musician_node_id": "<musician node id>",
  "born":             <musician born year or null>,
  "died":             <musician died year or null>,
  "sources":          []   // contributor may add sources later via edit
}
```

`sources` is intentionally empty. The ingester's existing duplicate-id skip means a re-submitted bundle item with the same id is safe.

### 4 — Standalone "Add Composer" path is demoted, not removed

The `buildComposerForm()` function and its global bar entry (`openEntryForm('composer')`) are not deleted. Instead:
- The global bar's "Composer" button is removed (ADR-111).
- `buildComposerForm()` remains accessible as an inline escape hatch within the composition form's existing "+ Add missing composer" affordance (ADR-031, already present).
- The use case it still serves: adding a historical composer who has no musician node and is not reachable from any musician panel.

### 5 — ADR-100 coverage matrix update

After this ADR ships:

| Entity | Create (co-located) | Status |
|---|---|---|
| Musician | `+` on panel header (ADR-108) | ✓ |
| Raga (janya) | `+` on Janyas row (ADR-106) | ✓ |
| Composition | `+` on Compositions header, musician or composer panel | ✓ |
| Composer | auto-created via musician-as-composer (this ADR) | ✓ |
| Recording (concert) | `+` on Concerts header (ADR-107) | ✓ |

All create paths are green. The global bar removal gate condition 1 is satisfied.

---

## Consequences

### Positive
- A contributor navigating to any musician panel can immediately add compositions without a prior "Add Composer" detour.
- The system automatically maintains the `musician_node_id` link, which is currently sparse (8/58) and only populated by librarians. After this ADR, every composition added via the musician panel produces a correctly linked composer record.
- Historical composers (not graph nodes) are unaffected.

### Negative / accepted tradeoffs
- The auto-generated companion composer record has empty `sources`. Librarians may want to add sources later. This is intentional — the `op: "append"` mechanism (ADR-097 §2) and the inline edit form handle subsequent source additions.
- Two bundle items are generated for a first-composition-by-a-musician. This is correct; the ingester handles both. The contributor sees a clear notice in the form before submitting.

---

## Implementation Checklist (for Carnatic Coder)

- [ ] In `graph_view.js`: always render `+` chip on Compositions header for musician panels, regardless of `composerForNode`. Pass `{ composerId: composerForNode.id }` if found, else `{ musicianId: nodeId }`.
- [ ] In `entry_forms.js`, `openAddCompositionForm`: add `musicianId` branch — look up linked composer, fall back to *musician-as-composer* mode.
- [ ] Implement musician-as-composer mode: lock composer field showing musician name + companion-record notice; on bundle submit, emit both `composers` create and `compositions` create items.
- [ ] Run `bani-render` and smoke-test: open a musician panel that has NO composer record, click `+` on Compositions, fill form, verify bundle contains both items.
- [ ] Also smoke-test: open a musician panel that DOES have a composer record — verify chip works as before (single `compositions` item, no duplicate composer).
