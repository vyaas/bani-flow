# AUDIT-012: Bani Panel Double-Click Edit Regression and Edit-Form UX Gaps

**Status**: Filed  
**Date**: 2026-05-26  
**Author**: Code Auditor  
**Routing**: Findings 1 and 2 → Carnatic Coder (code fixes); Finding 3 → Graph Architect (ADR candidate)

---

## Scope

Files scanned:

- `carnatic/render/templates/chip_dblclick.js` — double-click detection pipeline
- `carnatic/render/templates/bani_flow.js` — bani panel subject chip construction and `triggerBaniSearch`
- `carnatic/render/templates/entry_forms.js` — edit form dispatch and `showPatchSuccess` calls
- `carnatic/render/templates/panel_components.js` — chip role taxonomy (`applyChipRole`, `tagUntaggedChips`)
- `carnatic/render/templates/base.html` — pencil hover CSS, panel HTML structure

Git history reviewed: commits `af6a559`, `bc8c2a5`, `5e91f05`, `27bf3a8`, `537f30e`.

---

## Findings

---

### Finding 1 — BUG (dblclick regression): Single-click on bani panel title chip triggers redundant full trail rebuild, degrading the double-click edit window

**Pattern**: Click-Handler-Interferes-With-Dblclick-Window  
**Files**: `carnatic/render/templates/bani_flow.js` lines 307 and 465  
**Introduced**: commit `5e91f05` (2026-05-24)

**Evidence**:

In `bani_flow.js` the composition subject chip is set up (line ~307):

```javascript
// Single-click on comp title → sync raga wheel to this composition
subjectName.onclick = function() { triggerBaniSearch('comp', id); };
```

And the raga subject chip (line ~465):

```javascript
// Single-click on raga title → sync raga wheel to this raga
subjectName.onclick = function() { triggerBaniSearch('raga', id); };
```

These `onclick` handlers fire in the bubble phase after `chip_dblclick.js` records the first click in its capture phase. `triggerBaniSearch` unconditionally calls `applyBaniFilter`, which calls `buildListeningTrail`:

```javascript
// bani_flow.js applyBaniFilter (line 224)
buildListeningTrail(type, id, matchedNodeIds);
```

`buildListeningTrail` first DELETES the entity attributes that `chip_dblclick.js` relies on (lines ~276–278):

```javascript
delete subjectName.dataset.chipRole;
delete subjectName.dataset.entityType;
delete subjectName.dataset.entityId;
```

It re-applies them later (line ~291 for comp, line ~443 for raga), and because JavaScript is single-threaded the re-application completes before the second click fires. The double-click DOES work in theory. However:

1. **Semantic bug**: `triggerBaniSearch` has a guard preventing history push for same-subject navigation, but it still calls `applyBaniFilter` unconditionally. Clicking the chip of the raga/comp you are already viewing re-dims and re-highlights all Cytoscape nodes, clears and rebuilds the entire `#trail-list` DOM, and resets scroll position — wasted work and a jarring UX artefact.

2. **Practical dblclick reliability**: The full `buildListeningTrail` cycle (Cytoscape operations + DOM reconstruction for potentially dozens of trail rows + `tagUntaggedChips(document.body)`) consumes tens to hundreds of milliseconds of the 400 ms dblclick window. On a loaded trail, this compresses the effective window and causes the dblclick gesture to fail intermittently.

3. **Same-subject navigation is semantically wrong**: The panel already shows the subject. Single-clicking the subject chip should have NO side effect (or at most focus the chip for accessibility). The comment "sync raga wheel to this raga" names a different intent — this should be done via `syncWheelFromBaniSubject` which was already added to `triggerBaniSearch` in `537f30e` without re-triggering the full trail rebuild.

**Recommendation**:

Add a same-subject early-return guard in `subjectName.onclick` so that clicking the panel-title chip while already on that subject is a no-op:

```javascript
// bani_flow.js — composition path
subjectName.onclick = function() {
  if (_currentBaniSubject.type === 'comp' && _currentBaniSubject.id === id) return;
  triggerBaniSearch('comp', id);
};

// bani_flow.js — raga path
subjectName.onclick = function() {
  if (_currentBaniSubject.type === 'raga' && _currentBaniSubject.id === id) return;
  triggerBaniSearch('raga', id);
};
```

This eliminates the spurious rebuild on first click of a dblclick gesture and restores the full 400 ms window for the second click to fire.

---

### Finding 2 — BUG: "Add/Edit another" absent from all edit-mode form completions

**Pattern**: Asymmetric-Post-Patch-Success-UX  
**Files**: `carnatic/render/templates/entry_forms.js`  
**Lines**: 2568 (raga edit), 3123–3129 (composition edit), 1443–1444 (musician form A), 6546–6547 (musician form B)

**Evidence — raga edit mode** (line 2568):

```javascript
if (isEdit) {
  addToBundle('ragas', obj);
  // ...
  showPatchSuccess(win, obj, { headline: `✓ Patch queued for raga <code>${obj.id}</code>` });
  //                          ↑ NO addAnotherLabel, NO addAnotherFn, NO undoFn
```

Compare with raga add mode (line 2579):

```javascript
showPatchSuccess(win, obj, {
  headline:        `✓ Added raga <code>${obj.id}</code> to patch`,
  addAnotherLabel: '+ Add another raga',
  addAnotherFn:    () => buildRagaForm(),
  undoFn: dual ? null : () => { baniBundle.ragas.pop(); _updateBundleBtn(); },
});
```

Edit mode omits ALL three optional parameters. After patching a raga, the user sees only "OK" — no way to immediately edit another raga, no undo.

**Evidence — composition edit mode** (lines 3123–3129):

```javascript
showPatchSuccess(win, obj, {
  headline: isEdit ? `✓ Patch queued ...` : `✓ Added ...`,
  addAnotherLabel: isEdit ? null : '+ Add another composition',
  addAnotherFn:    isEdit ? null : () => buildCompositionForm(),
  undoFn: () => { baniBundle.compositions.pop(); _updateBundleBtn(); },
});
```

`undoFn` IS present for edit mode (it pops from `baniBundle.compositions`), but `addAnotherLabel` and `addAnotherFn` are explicitly `null` in edit mode.

**Evidence — musician forms** (lines 1443–1444 and 6546–6547):

```javascript
addAnotherLabel: isEdit ? null : '+ Add Another Musician',
addAnotherFn:    isEdit ? null : () => buildMusicianForm(),
// line 6546:
addAnotherLabel: isEdit ? null : '+ Add another musician',
addAnotherFn:    isEdit ? null : () => buildAddMusicianForm(),
```

Same pattern: edit mode suppresses "Add another".

**Affected forms**: raga edit, composition edit, musician edit (both form builders), likely edge and recording edit forms (not checked, likely same pattern via `isEdit`).

**Impact**: A user who double-clicks the raga chip, edits a field, clicks "Stage patch", and wants to do the same for the next raga must close the success dialog, find the next raga chip, and double-click again. The "Edit another" affordance would let them immediately reopen the form for a different entity.

**Recommendation**:

In edit mode, provide:
- `addAnotherLabel: '+ Edit another raga'` (or composition/musician)
- `addAnotherFn: () => buildRagaForm()` (opens a fresh add-mode form; the user can switch to edit by searching)
  - OR: `addAnotherFn: () => openEditRagaForm(obj.id)` if re-editing the SAME entity makes more sense
- `undoFn` should be supplied for raga edit mode; it is currently missing entirely. The undo operation should pop the most recently staged patch for this entity from `baniBundle.ragas` (match by `id` or last push).

The `undoFn` for raga edit mode specifically: `baniBundle.ragas` holds the staged op. Popping `baniBundle.ragas[baniBundle.ragas.length - 1]` should be sufficient IF the patch is always the last staged item; otherwise filter by matching `id`.

---

### Finding 3 — DESIGN INCONSISTENCY: Pencil hover affordance is broader than the dblclick-to-edit surface

**Pattern**: Affordance-Scope-Mismatch  
**Files**: `carnatic/render/templates/base.html` (CSS lines ~1906–1992), `carnatic/render/templates/chip_dblclick.js` (lines 147–152), `carnatic/render/templates/panel_components.js` (`buildPanelHeader`, line ~14)

**Evidence — CSS scope**:

`base.html` pencil hover CSS:
```css
/* Left sidebar: only panel-title chips get the pencil */
#left-sidebar [data-chip-role="panel-title"][data-entity-type][data-entity-id]:hover::after { content: '✎'; ... }

/* Right sidebar: ALL chip roles get the pencil */
#right-sidebar [data-chip-role][data-entity-type][data-entity-id]:hover::after { content: '✎'; ... }
```

`chip_dblclick.js` dblclick restriction (lines 147–152):
```javascript
if (chipRole !== 'panel-title') {
  // Still track for single-click nav — but do not enter edit mode.
  lastEntityKey = entityType + '|' + entityId;
  lastClickTime = Date.now();
  return;
}
```

The pencil hover on the right sidebar is shown for ALL `entity`-role chips (trail rows, lineage lists, recording chips). But `chip_dblclick.js` will never open an edit form for an `entity`-role chip — it only opens for `panel-title`. The user sees a pencil on a musician chip in a trail row, double-clicks it, and navigates rather than editing. The pencil is a false affordance.

**Evidence — `buildPanelHeader` stub**:

`panel_components.js` `buildPanelHeader` (line ~14): the function docstring references an `onEdit` parameter, but the implementation does not render a `✎` button or wire any edit callback. This is an incomplete unification point — the intention was to surface edit access via the panel header, but it was never implemented.

**Impact**: Users trained that "pencil = double-click to edit" will be confused when right-sidebar entity chips (musician lineage chips, trail entries visible in the WDP) show the pencil but do not open an edit form. This will increase support burden as the edit affordance is expanded to more panels.

**Recommendation (route to Graph Architect as ADR candidate)**:

Define a canonical rule for the "dblclick-to-edit" surface:
- Either extend `chip_dblclick.js` to cover `entity`-role chips in contexts where editing is appropriate (e.g., musician chips in the musician panel's lineage list in the right sidebar), OR
- Restrict the CSS pencil hover to only `panel-title` chips across all panels (right sidebar included), OR
- Introduce a third chip role `editable-entity` that applies when a chip both navigates AND edits.

The current state is: left sidebar CSS is correctly scoped to `panel-title`, but right sidebar CSS is over-broad. ADR should decide which direction (narrow CSS or extend dblclick handler) is correct before the edit surface grows further.

---

## Recommendations Summary

| Finding | Severity | Action | Route |
|---------|----------|--------|-------|
| 1 — Same-subject `triggerBaniSearch` on first click of dblclick | HIGH (regression) | Add same-subject guard in `subjectName.onclick` | Carnatic Coder |
| 2 — "Add/Edit another" and undo absent from edit mode | MEDIUM (UX gap) | Pass `addAnotherLabel`, `addAnotherFn`, `undoFn` in edit-mode `showPatchSuccess` calls for raga, composition, musician | Carnatic Coder |
| 3 — Pencil hover broader than dblclick-edit surface | LOW (design inconsistency) | Decide canonical editable-chip taxonomy via ADR | Graph Architect |

---

## Routing

### → Carnatic Coder (implementation tasks)

**Task C1** (Finding 1): In `bani_flow.js`, add same-subject guard to `subjectName.onclick` for both raga and composition subject chips. Guard: `if (_currentBaniSubject.type === type && _currentBaniSubject.id === id) return;`.

**Task C2** (Finding 2): In `entry_forms.js`:
- `buildRagaForm` edit-mode `showPatchSuccess` call (~line 2568): add `addAnotherLabel: '+ Edit another raga'`, `addAnotherFn: () => buildRagaForm()`, `undoFn: () => { baniBundle.ragas.pop(); _updateBundleBtn(); }`.
- `buildCompositionForm` `showPatchSuccess` call (~line 3123): change `addAnotherLabel: isEdit ? null : ...` to `isEdit ? '+ Edit another composition' : '+ Add another composition'`; same for `addAnotherFn`.
- Musician forms (~lines 1443 and 6546): change `isEdit ? null : ...` to `isEdit ? '+ Edit another musician' : '+ Add another musician'`; same for `addAnotherFn`.

### → Graph Architect (ADR candidate)

**Task A1** (Finding 3): Write an ADR defining the canonical "editable-chip" taxonomy: which `chipRole` values show the pencil hover and open an edit form on dblclick, and whether the right-sidebar CSS should be narrowed to match `panel-title` or the dblclick handler should be extended to cover additional roles.
