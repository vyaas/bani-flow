# ADR-108: Musician Panel `+` Add Chip, Form Split, and `✎` Edit Rewire

**Status**: Accepted
**Date**: 2026-04-26
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-031 (data entry forms), ADR-097 (bundle deltas, `op: "patch"`), ADR-103 (co-located edit affordances), ADR-104 (panel header edit buttons)
**Related**: ADR-100 (edit coverage matrix), ADR-109 (musician-as-composer), ADR-111 (bottom bar retirement)

---

## Context

Three gaps remain in the musician's co-located affordance coverage:

**Gap 1 — No `+` to add a new musician.** Every other primary entity type now has a panel-mediated create path: compositions from composer panels (ADR-105), janya ragas from the mela panel (ADR-106), concert recordings from the musician's Concerts header (ADR-107). Musicians themselves still have no co-located add trigger. The only path is the deprecated global bar's "Musician / Recordings" button.

**Gap 2 — The `✎` chip beside the musician name is a stub.** ADR-104 (Track A) shipped the `✎` chip on the musician header but wired it to `openEditForm()`, which shows a "coming soon" notice pointing back to the bottom bar. The bottom bar cannot be retired while this chip is non-functional.

**Gap 3 — `buildMusicianRecordingsForm` is a combined form.** The form conflates two unrelated actions: creating a new musician entity and adding YouTube recordings. Splitting them is a prerequisite for a clean `+` on the panel header (which should open only the entity creation side) and for a clean `✎` (which should pre-fill the entity fields, not the recording fields).

### Forces

| Force | Direction |
|---|---|
| **Co-location (ADR-103 §1)** | The trigger to add a musician should sit on the musician panel itself, not a global bar. |
| **Pre-targeting (ADR-103 §2)** | The `✎` chip should open with the current musician already selected and fields pre-filled. |
| **Single responsibility** | Adding a musician and adding that musician's recordings are different acts. The form should not conflate them. |
| **Bundle delta shape (ADR-097 §2)** | Editing an existing musician generates a `op: "patch"` bundle item, not a new `op: "create"`. |
| **Loop closure (ADR-085 §1)** | A `✎` chip that says "use the bottom bar" does not close the loop. |
| **Bottom bar removal gate (ADR-100 §3)** | Musician create + musician edit must both be co-located before the bar is removable. |

---

## Pattern

**Property 3, *Boundaries* (*The Nature of Order*, Book 1).** The musician panel's header row is the strongest boundary between the graph and the entity. Placing a `+` at the left edge (or right edge) of that boundary is the natural place for *add*; placing `✎` beside the entity name is the natural place for *edit*. Both acts belong at the boundary; today neither does.

**ADR-097 §2 — `op: "patch"`.** The edit form does not recreate the musician from scratch; it describes what changed. Only mutated fields appear in the patch bundle item. Unchanged fields are omitted. This is the correct shape for a musician edit: a three-field patch to born/died/instrument is four lines of JSON, not 200.

---

## Decision

### 1 — Split `buildMusicianRecordingsForm` into two functions

**`buildAddMusicianForm()`** — entity creation only. Contains:
- Node fields: Display Name, auto-generated ID, Born, Died, Era, Instrument
- Source URL (required; ADR-097 §4 infers label/type)
- Guru-Shishya edges section (keep from current combined form)
- *No YouTube section* — recordings are added from the musician's own panel post-creation

**`buildAddYouTubeToMusicianForm(musicianId?)`** — recordings only. This is essentially the existing "Section B" of the combined form, re-exported as its own function. Optionally pre-targets a specific musician when `musicianId` is provided. This function is the new target of the deprecated global bar's "Musician / Recordings" button until that button is removed (ADR-111).

The old `buildMusicianRecordingsForm` becomes an alias for `buildAddMusicianForm` during the transition window so no existing call-sites break.

### 2 — `+` chip on the "MUSICIAN ♫" panel header

The `<h3>` in `#musician-panel` (currently: `← Musician ♫ → ?`) gains a `+` chip at the right edge of the title row, before the `?` button:

```
← MUSICIAN ♫  + → ?
```

Click behaviour: `openAddMusicianForm()`, which calls `buildAddMusicianForm()`.

The chip is always visible (not conditional on a node being selected), using the `.co-add-chip` class.

### 3 — `✎` chip beside musician name → pre-filled edit form

The existing `#node-edit-chip` (currently shown when a node is selected, calls `openEditForm`) is rewired to call `openEditMusicianForm(nodeId)`.

`openEditMusicianForm(nodeId)` is a new function that:
1. Opens `buildAddMusicianForm()` — the same form as the `+` create path.
2. Pre-fills all current musician fields from `graphData.nodes` for the given `nodeId`:
   - Display Name, Born, Died, Era, Instrument, existing source URLs
3. Changes the window title to "Edit Musician".
4. Changes the ID field to read-only (node IDs are permanent — CLAUDE.md Librarian rule).
5. On "Add to Bundle", generates a bundle item with `op: "patch"` containing only the fields that differ from the original values (compare new values against the pre-filled originals before serialising).

The `op: "patch"` item shape (per ADR-097 §2):
```jsonc
{
  "op": "patch",
  "id": "tm_krishna",
  "fields": {
    "born": 1976,
    "instrument": "vocal"
  }
}
```

If no fields have changed, the "Add to Bundle" button remains disabled (nothing to patch).

### 4 — `openEditForm` stub updated

`openEditForm({ entityType: 'musician', id })` now delegates to `openEditMusicianForm(id)` instead of showing the coming-soon stub. The stub message is retained only for `entityType` values that do not yet have pre-fill implementations (`raga`, `comp`, `composer`) and updated to remove the "use the bottom bar" instruction.

---

## Consequences

### Positive
- Musician create is fully co-located. The `+` on the panel header is the obvious and correct entry point.
- Musician edit is functional, not a stub. The `✎` chip pre-fills the form; contributing a fix requires zero context-switching.
- The form split clarifies the mental model: adding a musician is a distinct act from adding their recordings. The combined form was confusing to contributors who expected one form per task.
- ADR-100 Musician row becomes fully green: create ✓, edit ✓.

### Negative / accepted tradeoffs
- `op: "patch"` bundle items must be handled by `bani_add.py` (ADR-097 §3). If `bani_add.py` does not yet implement `patch`, the Coder must add the `patch` handler for the `musicians` bucket as part of this ADR's implementation. The handler is simple: deep-merge `fields` onto the existing musician record.
- Contributors who previously used "Musician / Recordings" from the global bar will no longer see YouTube entry in the create form. They add YouTube entries after creation, from the musician's panel. This is the correct model but requires that the YouTube entry path from the panel (existing) be clearly signposted.

---

## Implementation Checklist (for Carnatic Coder)

- [ ] Add `buildAddMusicianForm()` — entity fields + edges, no YouTube section
- [ ] Add `buildAddYouTubeToMusicianForm(musicianId?)` — extracted recordings section
- [ ] Keep `buildMusicianRecordingsForm` as alias of `buildAddMusicianForm` (transition shim)
- [ ] Add `openAddMusicianForm()` public entry point
- [ ] Add `openEditMusicianForm(nodeId)` with pre-fill + `op: "patch"` serialisation
- [ ] Rewire `openEditForm({ entityType:'musician', id })` to `openEditMusicianForm(id)`
- [ ] Add `+` chip to `#musician-panel > h3` in `base.html`
- [ ] Update stub message for non-musician `✎` types (remove "use the bottom bar" line)
- [ ] Add `patch` handler for `musicians` bucket in `bani_add.py` if not already present
- [ ] Run `bani-render` and smoke-test: open panel, click `+`, fill form, verify bundle item; click `✎`, change a field, verify `op: "patch"` item
