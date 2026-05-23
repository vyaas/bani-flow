# AUDIT-008 — Concert Recording Editability

**Date**: 2025-07-14  
**Status**: Complete  
**Requested by**: User question: "We lack editability for concert recordings. Lecdems have this feature via double-click. We need a form that closely resembles the add form, pre-filled, inheriting from a common class. See if all this is possible using what we already have."

---

## Scope

The right-sidebar musician panel: concert bracket and lec-dem bracket dblclick-to-edit affordances, form reuse patterns, CSS hover signals, and double-click dispatch machinery.

**Files examined**:
- `carnatic/render/templates/media_player.js` (lines 1046–1195, 1818–1995, 1995–2200)
- `carnatic/render/templates/chip_dblclick.js` (all 179 lines)
- `carnatic/render/templates/entry_forms.js` (lines 3559–3900, 5216–5500, 6536–6900, 6773–6860)
- `carnatic/render/templates/base.html` (lines 1870–1960, 4767–4840)
- `carnatic/render/html_generator.py` (lines 207–312)

---

## Findings

### F-1 · Concert bracket dblclick edit pipeline — already fully wired
**Pattern**: Feature presumed missing is implemented end-to-end.

The entire chain exists and is connected:

1. **Chip tagging** — `media_player.js:1093–1095`
   ```js
   applyChipRole(titleSpan, 'panel-title', 'recording', concert.recording_id);
   titleSpan.dataset.musicianId = nodeId;
   ```
   The `.concert-title` chip carries `panel-title` role, entity type `recording`, and the recording id. The comment on the next line reads: *"panel-title role enables the chip_dblclick.js dblclick-to-edit gesture"*.

2. **Dispatch** — `chip_dblclick.js:141–162`  
   The document-level capture handler routes `panel-title` recording chips to:
   ```js
   openEditForm({ entityType: 'recording', id: entityId, musicianId });
   ```

3. **Edit form routing** — `entry_forms.js:5787–5795`  
   `openEditForm` finds the recording in `graphData.recordings`; because `rec.sessions.length > 0`, it calls:
   ```js
   return buildEditConcertForm(id, musicianId || null);
   ```

4. **Edit form delegates to add form** — `entry_forms.js:3854`
   ```js
   return buildAddConcertForm(resolvedMusicianId, { recording: rec });
   ```

5. **Single function, both modes** — `entry_forms.js:3559`
   ```js
   const rec = opts.recording || null;
   const isEdit = !!rec;
   ```
   `buildAddConcertForm` with `isEdit = true` pre-fills title, URL, date, venue, occasion, and all sessions (performers + performances). The "+ Add Segment" button (line ~3703) is always rendered — the user CAN add segments.

6. **CSS hover affordance** — `base.html:1901–1928`
   ```css
   #right-sidebar [data-chip-role][data-entity-type][data-entity-id] { position: relative; }
   #right-sidebar [data-chip-role][data-entity-type][data-entity-id]:hover {
     outline: 1px dashed var(--accent);
   }
   #right-sidebar [data-chip-role][data-entity-type][data-entity-id]:hover::after {
     opacity: 1;   /* ✎ pencil glyph */
   }
   ```
   The exclusion rules at lines 1944–1950 suppress affordance inside `.concert-perf-list` and `.concert-performers` — they do **not** touch `.concert-title` (which lives in `.concert-header → .concert-title-row`). The CSS comment at line 1953 confirms: *"The bracket title chip (double-click to edit) keeps the positioned pencil."*

**Conclusion**: The concert bracket dblclick-to-edit path is complete. `buildAddConcertForm` already satisfies the "common class" requirement — it IS both the add and the edit form, driven by the `isEdit` flag. No new machinery is required.

---

### F-2 · Discoverability gap — concert title tooltip does not signal double-click editability
**Pattern**: Inconsistency in affordance tooltip text between bracket types.

`media_player.js:1089`:
```js
if (concert.title) titleSpan.title = concert.title;
```
The tooltip shows only the concert title.

Compare `_buildLecdemBracket`, `media_player.js:1851`:
```js
titleSpan.title = (ref.label || 'Lecture-Demo') + ' — Double-click to edit';
```
Lec-dem brackets advertise their editability in the tooltip. Concert brackets do not, despite offering identical edit access. This explains why the feature appears missing — the hover ✎ pencil is subtle on a title chip already styled as a chip.

---

### F-3 · UX friction — first click toggles bracket state before edit form opens
**Pattern**: Unexpected toggle-on-first-click before edit-on-second-click.

`buildConcertBracket`, `media_player.js:1071`:
```js
header.setAttribute('onclick', 'toggleConcert(this)');
```
`chip_dblclick.js:130–132` (first click of a pair): records `lastEntityKey` + `lastClickTime` then **returns without calling `stopImmediatePropagation`**. `toggleConcert` fires. The bracket expands or collapses.

On the second click, `chip_dblclick.js` fires in capture phase and stops propagation — `toggleConcert` does not run; the edit form opens. Net result: the bracket is in the wrong toggle state when the edit form appears (collapsed when the user expected it expanded, or vice versa).

Compare `_buildLecdemBracket`, `media_player.js:1855`:
```js
titleSpan.addEventListener('click', e => {
  e.stopPropagation();       // ← stops propagation on EVERY click
  const now = Date.now();
  if (now - _ldDblTap2 < 400) { ... buildLecdemEditForm ... }
  else { _ldDblTap2 = now; }
});
```
The lec-dem click handler stops propagation unconditionally — the bracket **never** toggles on either click of the dblclick gesture.

---

### F-4 · Lec-dem add form and edit form share no code — DRY violation; "common class" requirement unmet for lec-dems
**Pattern**: Diverged parallel implementations; the user's explicit architectural requirement is satisfied for concerts but violated for lec-dems.

**Add form**: `buildFocusedLecdemForm` (`entry_forms.js:6773`) — new lec-dem recording:
- Musician identity row (lines 6786–6823): era-tinted chip if musician known, search dropdown otherwise
- URL input (line 6825): editable, required
- Subjects combobox (lines 6829–6900): pick from ragas/compositions/musicians

**Edit form**: `buildLecdemEditForm` (`entry_forms.js:5216`) — edit existing lec-dem:
- Musician identity row: different implementation, same visual output
- URL field: read-only display
- Existing subjects: shown as grayed-out chips (not interactive); new subjects appended via combobox
- Time segments section: editor for existing time-segmented subjects (no equivalent in add form)

The musician identity row pattern is duplicated verbatim. The forms have no shared base. The title strings are `'Add Lecdem Recording'` and `'Edit Lecdem — <label>'` respectively.

**Compare**: `buildAddConcertForm` (`entry_forms.js:3559`) is a **single** function for both modes:
```js
const rec = opts.recording || null;
const isEdit = !!rec;
// …
win.querySelector('.ew-title').textContent = isEdit ? 'Edit Concert Recording' : 'Add Concert Recording';
// …
titleInp.value = rec ? (rec.title || '') : '';
```
This is the pattern the user asked for. Concerts already use it. Lec-dems do not.

---

### F-5 · Inconsistent dblclick dispatch mechanism — lec-dem bracket uses per-element manual timing; concert bracket uses document-level chip_dblclick.js
**Pattern**: Two strategies for structurally identical bracket headers; chip role assigned differently, with conflicting documentation.

| | Concert bracket | Lec-dem bracket |
|---|---|---|
| Chip role | `'panel-title'` | `'entity'` |
| Dispatch | `chip_dblclick.js` capture handler | Per-element `_ldDblTap2` timing listener |
| Propagation on click 1 | Not stopped → `toggleConcert` fires | Stopped → bracket stays in current state |
| Code path | `chip_dblclick.js:141` → `openEditForm` | `media_player.js:1856` → `buildLecdemEditForm` |

The `chip_dblclick.js` comment at line 138–139 documents: *"Only panel-title chips are dblclick-editable. Entity chips in trail rows, lecdem subjects, lineage lists etc. are navigation-only."*

This comment is already outdated — the lec-dem bracket title IS dblclick-editable, but routes via a per-element workaround because it holds `'entity'` role. The comment misleads future readers.

---

## Recommendations

| # | Finding | Change |
|---|---|---|
| R-1 | F-2 | Add `' — Double-click to edit'` to the concert title tooltip at `media_player.js:1089` |
| R-2 | F-3 | Stop event propagation on first click of the concert title chip so the bracket does not toggle. The simplest fix: add a per-element click listener on `titleSpan` that calls `e.stopPropagation()` unconditionally, parallel to the lec-dem approach — then drop the reliance on `chip_dblclick.js` capture for this element (or keep both paths by re-roling the chip to `'entity'` and using a per-element timing handler like lec-dems do). Alternatively: call `e.stopPropagation()` inside the `chip_dblclick.js` first-click path for `panel-title` chips, but this would affect all `panel-title` chips globally. |
| R-3 | F-4 | Consolidate `buildFocusedLecdemForm` and `buildLecdemEditForm` into a single `buildLecdemForm(musicianId, opts)` following the `buildAddConcertForm` pattern: `const isEdit = !!(opts && opts.recording)`. Pre-fill URL (read-only when `isEdit`), subjects (existing shown as grayed chips), and time segments when editing. The per-element dblclick caller at `media_player.js:1860` would become `buildLecdemForm(nodeId, { recording: ref })` instead of `buildLecdemEditForm(ref, nodeId)`. The `buildFocusedLecdemForm` add-path shims at `entry_forms.js:6536` and `6549` would call `buildLecdemForm(opts.nodeId, prefill)` with no `recording` key. |
| R-4 | F-5 | Re-role the lec-dem bracket title chip from `'entity'` to `'panel-title'` (`media_player.js:1849`), remove the per-element `_ldDblTap2` timing listener (lines 1853–1862), and route through `chip_dblclick.js` → `openEditForm` as concerts do. Then update `openEditForm` (`entry_forms.js:5787`) to call the unified `buildLecdemForm(musicianId, { recording: ref })` for lec-dem recordings. This removes a per-element timing loop and unifies dispatch. **Prerequisite: R-3 (unified form) must land first.** R-2 (propagation stop on click-1) must also be solved at the `chip_dblclick.js` level when doing this, so the lec-dem bracket does not toggle on the first click of a dblclick gesture. |

**Implementation order**: R-3 → R-4 → R-1 + R-2 (R-1 and R-2 are independent one-liners).

---

## Routing

All findings are code-level. No schema changes implied. No ADR required.

**→ Carnatic Coder**:
- R-1: `media_player.js:1089` — one-liner tooltip fix
- R-2: `media_player.js:1071`, `chip_dblclick.js:130–132` — event propagation fix
- R-3: `entry_forms.js:5216`, `entry_forms.js:6773` — form consolidation (largest change)
- R-4: `media_player.js:1849–1862`, `entry_forms.js:5787` — dispatch unification (depends on R-3)

[AGENTS: code-auditor]
