# ADR-144 — Section-header and row-block double-click (extending the affordance-on-content model)

**Status**: Accepted  
**Date**: 2026-05-17  
**Agents**: graph-architect  
**Depends on**: ADR-142 (chip dblclick), ADR-143 (bundle/patch file)

---

## Context

ADR-142 established that double-clicking any entity chip opens its edit form. That covers the three
primary first-class citizens: musician, raga, composition (and their recording/edge siblings). But
the musician panel and bani-flow panel also contain a second tier of interactive structure — section
headers and item rows — that remain dependent on separate `+` and `✎` buttons.

Two parallel interaction vocabularies now coexist:

| Target | Current affordance | Expected (after ADR-142) |
|---|---|---|
| Musician chip in graph | dblclick → edit | ✓ done |
| Raga chip in bani-flow | dblclick → edit | ✓ done |
| Composition chip | dblclick → edit | ✓ done |
| Lecdem bracket header | dblclick → edit | ✓ done (applyChipRole at media_player.js:1675) |
| Concert bracket header | dblclick → edit | ✓ done (applyChipRole at media_player.js:1004) |
| Recording row (multi-rec) | dblclick → edit | ✓ done (applyChipRole at media_player.js:1518) |
| **LECDEMS section header** | `+` button → add lecdem | ✗ missing |
| **CONCERTS section header** | `+` button → add concert | ✗ missing |
| **RECORDINGS section header** | `+` button → add recording | ✗ missing |
| **MUSICIAN panel-title chip** (base.html:4389) | no affordance | ✗ missing (Phase A) |
| **Single-recording row** | no affordance (only year+play) | ✗ missing (Phase B) |
| **BANI FLOW panel-title chip** (base.html:4272) | no affordance | ✗ missing (Phase C) |

The missing affordances mean users must learn two separate interaction patterns: the chip dblclick
they discover through ADR-142's discoverability hint, and an entirely separate set of buttons for
adding new items to sections. Worse, the per-row ✎ buttons on lecdems/concerts create visual noise
while duplicating capability that dblclick already provides.

---

## Forces

- **Consistency**: one interaction model across all panel content reduces cognitive load.
- **Discovery**: the ADR-142 hint ("double-click any chip to edit") implicitly promises that all
  chips behave uniformly. Section-header chips that silently do nothing violate this promise.
- **Section context**: "add to this section" actions need musician-id context (the current panel's
  `nodeId`) passed into the form as pre-fill. The chip itself must carry this context.
- **Non-chip rows**: single-recording entries (one recording under a composition in the raga tree)
  have no chip — only a year span and a play button. The entire row acts div must become the
  affordance without disrupting the composition chip's single-click navigate behaviour.
- **Bani-flow panel**: the same principle applies to section headers in the left panel, but the
  relevant actions differ (add composition to raga, add raga, etc.) and need separate thought.
- **Retirement**: once the new affordances ship, the `+`/`✎` buttons become redundant. Removing
  them cleans up the panel and reduces the parallel vocabulary.

---

## Pattern

**Affordance on content** (Christopher Alexander, _Levels of Scale_). Every interactive unit in
the panel — section header chips, item rows, recording blocks — should be its own affordance.
Separate `+`/`✎` buttons are weak centres: they express "there is an action related to the content
next to me" rather than being the content themselves. Collapsing the action onto the content
strengthens the centres and removes structural noise.

---

## Decision

Four phases. Each phase is independently shippable.

---

### Phase A — Section-header dblclick dispatches "add-new" forms

**Data model change (before/after):**

```javascript
// BEFORE — section-header chips have role but no actionable data
applyChipRole(lsHdrChip, 'section-header', 'recording');
// chip_dblclick.js silently ignores chips with no data-entity-id

// AFTER — section-header chips carry action + musician context
// chip_dblclick.js routes data-chip-role="section-add" to openEntryForm
lsHdrChip.dataset.sectionAction  = 'add-lecdem';
lsHdrChip.dataset.musicianId     = nodeId;
// (applyChipRole changed to 'section-add' role for consistency)
```

**Section → action mapping:**

| Chip | `data-section-action` | `data-musician-id` | Form opened |
|---|---|---|---|
| MUSICIAN panel-title chip (base.html:4389) | `add-musician` | — | `openEntryForm('musician')` |
| LECDEMS | `add-lecdem` | current `nodeId` | `openEntryForm('musician_recordings', {nodeId, kind:'lecdem'})` |
| CONCERTS | `add-concert` | current `nodeId` | `openEntryForm('musician_recordings', {nodeId, kind:'concert'})` |
| RECORDINGS | `add-recording` | current `nodeId` | `openEntryForm('musician_recordings', {nodeId, kind:'direct'})` |

**Implementation sites:**

- `chip_dblclick.js`: new `handleSectionAdd(e)` branch for `[data-chip-role="section-add"]`; calls
  `openEntryForm` with action + context extracted from `data-section-action`/`data-musician-id`.
  Time-based dblclick detector reused (same `DBL_CLICK_MS`, same `lastEntityKey` keyed on
  `section-add|<action>|<musicianId>`).
- `media_player.js:buildRecordingsList`: set `data-section-action` and `data-musician-id` on
  `lsHdrChip`, `_concertsChip`, `_recordingsChip` when constructing section headers.
- `graph_view.js` or `base.html`: find the "Musicians" right-panel title chip and give it
  `data-chip-role="section-add"` + `data-section-action="add-musician"`.
- `entry_forms.js:openEntryForm`: extend the `musician_recordings` branch to accept a second
  `options` argument `{nodeId, kind}` so the form pre-selects the musician and pre-selects the
  recording type (lecdem / concert / direct).

**CSS:** The existing `[data-chip-role][data-entity-type][data-entity-id]:hover` affordance rules
do not apply (section-add chips have no `data-entity-id`). Add:
```css
[data-chip-role="section-add"]:hover { outline: 1px dashed var(--accent); }
/* dashed vs solid distinguishes "add" from "edit" at a glance */
```

---

### Phase B — Single-recording row as an edit affordance

Currently `buildCompNode` (media_player.js) handles two cases:
- **Single recording**: compact header row with `tree-comp-acts` (year + play button). No label
  chip. No `data-entity-id` anywhere on the `li`.
- **Multiple recordings**: chevron accordion with `tree-rec-list` items, each with a label span
  that already carries `applyChipRole('entity', 'recording', p.video_id)`.

**Change (single-recording path only):**

```javascript
// BEFORE — single recording path
const li = document.createElement('li');
li.className = 'tree-comp-node';
// ... year + play button only, no recording affordance

// AFTER — li itself carries the recording entity attrs
if (recCount === 1) {
  const p = sortedPerfs[0];
  if (p.video_id && typeof applyChipRole === 'function') {
    applyChipRole(li, 'row-block', 'recording', p.video_id);
    // 'row-block' role = dblclick affordance on a container, not a chip
  }
  // ... rest unchanged
}
```

**chip_dblclick.js**: the time-based detector already matches any element with
`[data-entity-type][data-entity-id]`. `applyChipRole('row-block', ...)` sets these. No logic
change required — just ensure `applyChipRole` handles `'row-block'` role identically to `'entity'`
in terms of data attributes (it already does: `applyChipRole` only writes `data-chip-role`,
`data-entity-type`, `data-entity-id`).

**CSS**: Row-blocks get a different visual treatment than chip affordances. Do NOT apply the
`::after { content: " ✎" }` pseudo-element (that's for chips). Instead:
```css
[data-chip-role="row-block"]:hover {
  outline: 1px dashed var(--accent);
  border-radius: 3px;
}
[data-chip-role="row-block"] { cursor: context-menu; }
```
`cursor: context-menu` signals "secondary action" without claiming the row is a link.

**Scope guard**: only the single-recording `li` gets `row-block`. The multi-recording `li` uses
the existing label-chip affordance on each `tree-leaf`. No duplication.

---

### Phase C — BANI FLOW panel-title chip as add entry point

The **BANI FLOW** chip (`<span class="bani-chip chip-panel-title">BANI FLOW</span>`, base.html:4272)
seals the pattern symmetrically with MUSICIAN. Double-clicking it opens a lightweight **picker**
that lets the user choose what to add to the knowledge graph:

```
┌─ Add to Bani Flow ──────────────┐
│  [ + Raga ]  [ + Composition ]  │
└─────────────────────────────────┘
```

Clicking either option opens the corresponding entry form:
- `add-raga`        → `openEntryForm('raga')`
- `add-composition` → `openEntryForm('composition')`

**Data model:** the BANI FLOW chip gets `data-chip-role="section-add"` +
`data-section-action="add-bani-flow"`. The `handleSectionAdd` handler in `chip_dblclick.js`
recognises `add-bani-flow` and opens the picker instead of a single form.

**Picker implementation:** a small `.entry-window`-style floating div (reusing
`createEntryWindow('Add to Bani Flow')`) with two buttons. No form fields of its own — it is just
a routing step. Stays open until the user picks one option or presses Escape.

**Context pre-fill (resolved):** The picker opens without any pre-filled raga/composition context.
If the user is viewing Bhairavi and clicks `+ Composition`, the Add Composition form opens with no
pre-fill. Users can select the raga inside the form itself. This avoids ambiguity when the panel
shows a multi-raga result set.

Phase C reuses the same `handleSectionAdd` machinery from Phase A and ships after Phase A is stable.

---

### Phase D — Retire the `+` and `✎` buttons

Once Phases A and B ship:

1. Remove the `onAdd` callback from all `buildSection` calls in `media_player.js` (the `buildSection`
   function signature can keep the parameter for forward compat but stop rendering the button when
   not supplied).
2. Remove the per-row ✎ buttons on lecdem/concert bracket headers (those rows use
   `applyChipRole('entity', ...)` which already provides the dblclick edit path).
3. Adjust `buildSection` internal CSS/spacing to account for absent buttons.
4. Update the ADR-142 Phase E discoverability hint text from `"Double-click any chip to edit"`
   to `"Double-click any chip or row to edit; double-click section labels to add"`.

Phase D **must not** ship before Phases A + B are fully tested on all panel states (empty section,
single item, many items, collapsed).

---

## Consequences

**Positive:**
- Single interaction vocabulary: dblclick everywhere that creates or edits.
- Section headers become discoverable affordances (same hint teaches both add and edit).
- Panel visual weight reduced: no ± buttons cluttering section headers.
- `buildSection` simplifies: `onAdd` param becomes optional/unused.

**Negative / risks:**
- `chip_dblclick.js` grows a second handler branch (section-add). Must not regress entity-chip path.
- `openEntryForm('musician_recordings', options)` needs an options argument currently absent. This
  is a small but real API change that must be backward-compatible (existing callers pass no second
  arg and must still work).
- Phase B makes `li` elements into affordances — dblclick on the composition chip within the same
  `li` will propagate to the `li` as well. The chip dblclick (entity chip) fires first via
  stopImmediatePropagation; the `li` row-block fires the same recording edit form. **Net**: the
  chip dblclick wins. No double-open because the `li` and the chip are different entities — the
  composition chip has `data-entity-type=composition`, the `li` has `data-entity-type=recording`.
  Two separate edit forms can open. This is acceptable (user double-clicked on the composition chip,
  wanted to edit the composition, not the recording).
  **Mitigation**: in `handleChipClick` in chip_dblclick.js, when the innermost element match is a
  chip (`role=entity|panel-title`) but the `li` also has entity attrs, prefer the innermost element.
  The existing `e.target.closest(...)` already takes the innermost match. Verify this is true.

---

## Implementation order

```
Phase A → Phase B → Phase C (optional) → Phase D
```

Phases A and B are independent and can ship in either order or together. Phase C needs Phase A's
machinery. Phase D is a cleanup gate: must not ship until A+B are battle-tested.

---

## Verification (per phase)

- **Phase A**: double-click the LECDEMS chip in a musician panel → the add-recording form opens
  pre-scoped to the current musician and "lecdem" kind. Same for CONCERTS and RECORDINGS. Double-
  click "Musicians" header → add-musician form opens.
- **Phase B**: open a musician panel, navigate to a raga tree that has one recording for a
  composition. Double-click the `li` row (not the composition chip, not the play button). Edit form
  for that recording opens. Year/play button single-click still works normally.
- **Phase C**: viewing Bhairavi in bani-flow, double-click "Compositions" section header → add
  composition form opens (with optional raga pre-fill).
- **Phase D**: no `+` or `✎` button remains visible in the musician panel. Panel layout unchanged.
  All adds/edits reachable via dblclick alone. Existing keyboard/touch paths tested.

---

## Open questions

*All three original open questions are resolved:*

1. ~~Phase C raga pre-fill~~ — **Resolved**: no pre-fill. Add Composition form opens blank;
   user selects raga inside the form.
2. ~~Touch / mobile~~ — **Resolved**: mobile editing is out of scope for this ADR (same ruling
   as ADR-142). No mobile-specific tap-window changes needed.
3. ~~"Musician" header location~~ — **Resolved**: the static `<span class="musician-chip
   chip-panel-title">MUSICIAN</span>` at base.html:4389 is the affordance. It is always visible
   at the top of the right panel regardless of which musician is selected, and is never repainted
   by `graph_view.js` (unlike the per-musician name chip below it). This is the correct target.
