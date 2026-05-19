# AUDIT-002: Bani Search Input Label Pollution

**Status**: Accepted  
**Date**: 2026-05-19  
**Scope**: `carnatic/render/templates/bani_flow.js` · `carnatic/render/templates/empty_tutorials.js` · `carnatic/render/templates/search.js`

---

## Scope

The `#bani-search-input` element and all code paths that write to its `.value` property. Triggered by the observed symptom: every raga chip click populates the search bar with the raga name (e.g., "◈ Reetigowla"), whereas the musician search bar never writes back a label after selection. The user wants the search bar to behave like an input field — always empty/placeholder when not actively being typed into.

---

## Findings

### Finding 1 — `triggerBaniSearch` writes a label into the search input as a side effect

**File**: `carnatic/render/templates/bani_flow.js`  
**Lines**: 1638–1664  
**Pattern**: Input field dual-use (search widget + status display)

**Evidence**:
```javascript
const searchInput = document.getElementById('bani-search-input');
if (type === 'perf') {
  if (searchInput && ref) {
    searchInput.value = '\u25b6 ' + (ref.display_title || ref.title || id);  // line 1644
  }
} else if (type === 'yt') {
  if (searchInput) searchInput.value = '\u25b6 ' + ytShort;                  // line 1656
} else {
  if (searchInput && entity) {
    const label = entity.name || entity.title || id;
    const prefix = type === 'raga' ? '\u25c8 ' : '\u266a ';
    searchInput.value = prefix + label;                                        // line 1664
  }
}
```

`triggerBaniSearch` is called from **every** raga/composition chip click in the entire UI (bani-flow panel chips, raga wheel chips, co-performer trail chips, history back/forward, `_bootHelloWorld`). Every call writes a formatted label into the search bar, overwriting whatever the user may have typed.

This is the root cause of the reported asymmetry: the musician panel's `selectNode()` equivalent writes to `#node-info` (a read-only display chip row), never to the musician search input. The bani side has no equivalent read-only display region — it reuses the input box as a status label.

Wait — it does have one: **`#bani-subject-name`** inside `#bani-info`, which is already populated by `applyBaniFilter`. The search input label is therefore redundant.

---

### Finding 2 — `makeDropdown` already clears the input after selection, making the write in Finding 1 a no-op for the dropdown path

**File**: `carnatic/render/templates/search.js`  
**Lines**: 37–40  
**Pattern**: Write-then-immediate-overwrite

**Evidence**:
```javascript
div.addEventListener('mousedown', e => {
  e.preventDefault();
  onSelect(item);         // ← triggerBaniSearch writes the label here
  inputEl.value = '';     // ← immediately cleared here
  dropdownEl.style.display = 'none';
});
```

When the user types and selects from the dropdown, `triggerBaniSearch` writes the label — and then `makeDropdown` clears it one line later. The label write is effectively dead for this path. It only manifests visibly on all non-dropdown call paths (chip clicks, boot, history navigation).

---

### Finding 3 — `_bootHelloWorld` workaround masks the root cause

**File**: `carnatic/render/templates/empty_tutorials.js`  
**Lines**: 1577–1579 (introduced in this session)  
**Pattern**: Symptom suppression without root cause fix

**Evidence**:
```javascript
// Clear the bani search input — help panels should open with an empty bar
const _baniInput = document.getElementById('bani-search-input');
if (_baniInput) _baniInput.value = '';
```

This was added to address the original report (boot page showing "◈ Reetigowla"), but is now superseded by the root-cause fix. Once Finding 1 is resolved, this code is unnecessary and should be removed to avoid confusion.

---

## Recommendations

### R1 — Remove the `searchInput.value` block from `triggerBaniSearch` (Finding 1)

Delete lines 1638–1664 of `bani_flow.js` (the entire `searchInput` block). `triggerBaniSearch` should not write to the search bar. The current subject is already displayed in `#bani-subject-name` (within `#bani-info`), which `applyBaniFilter` populates correctly. The search input is an input widget; it should never be used as a status label.

`clearBaniFilter()` already clears the input (`bani-search-input').value = ''`) as part of a full panel reset — that line should remain as-is.

### R2 — Remove the boot-time workaround (Finding 3)

Delete the three lines added to `_bootHelloWorld` in `empty_tutorials.js` (lines 1576–1579). They are rendered redundant once R1 is applied.

---

## Routing

| Finding | Recommendation | Routed to |
|---|---|---|
| F1 — label write in `triggerBaniSearch` | R1: delete the `searchInput.value` block | **Carnatic Coder** |
| F2 — dead write in dropdown path | Subsumed by R1; no separate action needed | — |
| F3 — `_bootHelloWorld` workaround | R2: delete 3 lines from `empty_tutorials.js` | **Carnatic Coder** |

No schema implications. No ADR required.

---

*Auditor: Code Auditor · 2026-05-19*
