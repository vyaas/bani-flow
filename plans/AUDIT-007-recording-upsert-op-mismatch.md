# AUDIT-007 — Recording `upsert` op: generator / ingester contract mismatch

**Status**: Published  
**Date**: 2026-05-22  
**Scope**: `carnatic/render/templates/entry_forms.js` · `carnatic/bani_add.py` · `plans/ADR-097-bundle-deltas-and-unified-edit-forms.md`

---

## Scope

Triggered by a live ingestion failure:

```
Recordings (1):
  ERROR  recording item has unknown op 'upsert'. Known ops: create, annotate, append, patch.
  Added 0 · Skipped 0 · Errors 1
```

The suspect bundle: `bani_add_bundle.json` (generated from the in-browser "Add Concert Recording" form).  
Investigation traced the error to a single generator site in `entry_forms.js` and verified against the ADR-097 op contract.

---

## Findings

### Finding 1 — `buildAddConcertForm` unconditionally emits `op: 'upsert'`

**File**: [carnatic/render/templates/entry_forms.js](../carnatic/render/templates/entry_forms.js#L3817-L3825)  
**Pattern**: Generator / ingester contract mismatch  

```js
// entry_forms.js line 3817–3825
  bundleBtn.addEventListener('click', () => {
    const obj = collectConcertData();
    if (!obj.title || !obj.url) return;
    if (typeof addToBundle === 'function') {
      addToBundle('recordings', { op: 'upsert', value: obj });   // ← always 'upsert'
      bundleBtn.disabled   = true;
      bundleBtn.textContent = '✓ Added';
      setTimeout(() => { bundleBtn.disabled = false; bundleBtn.textContent = 'Update Patch'; }, 2000);
    }
  });
```

`upsert` appears in exactly one `addToBundle` call across the entire 7500-line template. Every other call uses ops from the ADR-097 contract (`create`, `patch`, `append`, `annotate`):

| Line | Bucket | Op used |
|---|---|---|
| 2503 | ragas | append |
| 2513 | ragas | append |
| 4998 | musicians | append |
| 5002 | (any entity) | append |
| 5006 | (any entity) | append |
| 5047 | (any entity) | annotate |
| 5926 | (any entity) | patch |
| 6029 | recordings | append |
| 6059 | recordings | append |
| 6745 | musicians | append |
| 7179 | musicians | append |
| 7387 | musicians | append |
| 7550 | musicians | append |
| **3821** | **recordings** | **upsert ← only occurrence** |

---

### Finding 2 — The `isEdit` flag exists but is not used for the op decision

**File**: [carnatic/render/templates/entry_forms.js](../carnatic/render/templates/entry_forms.js#L3562)  
**Pattern**: Dead branch (partially implemented edit-mode)

```js
// line 3562
const isEdit = !!rec;
const win = createEntryWindow(isEdit ? 'Edit Concert Recording' : 'Add Concert Recording');
```

`isEdit` drives the window title and the pre-fill block (lines 3833–3843) — but the bundle click handler (line 3817) ignores it entirely and emits `upsert` in both create and edit mode.

Compare with every other entity form:

| Form | isEdit → op decision |
|---|---|
| `buildAddMusicianForm` (line 1284) | `isEdit ? 'Update Patch' : '+ Add to Patch'`; `patch` ops generated for edit mode |
| `buildAddRagaForm` (line 2448) | same pattern; `patch` ops for edit mode |
| `buildAddCompositionForm` (line 2985) | same pattern; `patch` ops for edit mode |
| `buildAddConcertForm` (line 3713) | button hardcoded `'Update Patch'`; no `isEdit` branch; always `upsert` |

The concert form was written with the skeleton of edit-mode support (`isEdit`, pre-fill block) but the op branching was never completed.

---

### Finding 3 — `bani_add.py` recording processor only accepts `create` / `None`

**File**: [carnatic/bani_add.py](../carnatic/bani_add.py#L826-L828)  
**Pattern**: Incomplete op dispatch (no `upsert` case)

```python
# line 826
if op not in ("create", None):  # reject unknown ops
    print(f"  ERROR  recording item has unknown op '{op}'. Known ops: create, annotate, append, patch.")
    errors += 1
    continue
```

Note the asymmetry: the error message advertises `annotate` and `patch` as known ops for recordings, but the gate at line 826 only admits `create` and `None`. The `annotate` and `patch` branches are handled higher up in the same `_process_recordings` function (they are reached only when the `op` is matched earlier). `upsert` is handled nowhere.

---

### Finding 4 — ADR-097 does not specify `upsert` for any bucket

**File**: [plans/ADR-097-bundle-deltas-and-unified-edit-forms.md](../plans/ADR-097-bundle-deltas-and-unified-edit-forms.md#L82-L92)

ADR-097 §3 op-support table:

| Bucket | create | patch | append | annotate |
|---|:---:|:---:|:---:|:---:|
| `recordings` | ✓ | — *(recordings are file-shaped, not field-shaped)* | — | ✓ |

ADR-097 explicitly calls out that recordings have no `patch` op because they are "file-shaped, not field-shaped." The `upsert` (create-or-overwrite) semantic was never ratified. The contract is: `create` (skip if file exists) or `annotate` (append a note). There is no path for full-file replacement.

---

## Recommendations

### R1 — Immediate: fix the bundle (unblocks the live ingestion)

Change `"op": "upsert"` → `"op": "create"` directly in `bani_add_bundle.json` before re-running `bani-add`. This is a single-token edit in an uncommitted download artifact. The recording `musiri_chamber_concert_for_july_2022` does not yet exist in `carnatic/data/recordings/`, so `create` is the correct semantic.

**Owner**: User (the file is not committed; the Librarian can also apply this if the file is being committed to data/).

---

### R2 — Code fix: correct the op emitted by `buildAddConcertForm` (routes to Carnatic Coder)

In [entry_forms.js line 3821](../carnatic/render/templates/entry_forms.js#L3821), replace:

```js
addToBundle('recordings', { op: 'upsert', value: obj });
```

with:

```js
addToBundle('recordings', { op: isEdit ? 'annotate' : 'create', value: obj });
```

*(See R3 below — the Architect should confirm whether `annotate` is the right edit-mode op or whether a new `replace` op should be ratified first.)*

Also align the button text with the pattern established by all other entity forms:

```js
// line 3713 — change hardcoded text to isEdit-aware:
bundleBtn.textContent = isEdit ? 'Update Patch' : '+ Add to Patch';
// and update the setTimeout reset:
setTimeout(() => { bundleBtn.disabled = false; bundleBtn.textContent = isEdit ? 'Update Patch' : '+ Add to Patch'; }, 2000);
```

**Owner**: Carnatic Coder.

---

### R3 — Schema gap: ratify (or reject) a `replace` op for recordings (routes to Graph Architect)

ADR-097 §3 deliberately left recordings without a `patch` op because they are "file-shaped." But the UI was clearly written with an edit intent (`isEdit` flag, pre-fill, `'Update Patch'` button text). This reveals an unresolved tension: the user expects to be able to correct a concert recording's title, date, or session list from the browser, but no write path exists for it.

The Architect should decide one of three positions for a follow-on ADR:

1. **Add `replace` op for recordings** — a full-file overwrite, distinct from `create` (which skips if exists). `bani_add.py` would need a new branch that calls `_atomic_write_recording` unconditionally.
2. **Expand `patch` to cover recording top-level scalar fields** (`title`, `date`, `venue`, `occasion`) in `writer.py`, similar to `patch_composition`.
3. **Keep recordings immutable once created; allow only `annotate`** — and update the UI to reflect that edit affordances for recordings are limited to notes.

Until one of these is ratified, R2 above defaults to `annotate` for edit mode (which is at least ingestable without error).

**Owner**: Graph Architect (ADR candidate).

---

## Routing summary

| Finding | Severity | Owner |
|---|---|---|
| F1 · `upsert` in bundle generator | High — blocks live ingestion | Carnatic Coder (R2) |
| F2 · `isEdit` not used in op dispatch | Medium — silent wrong behaviour | Carnatic Coder (R2) |
| F3 · ingester has no `upsert` handler | High — symptom, not root cause | Carnatic Coder (R2) |
| F4 · `upsert` outside ADR-097 contract | Medium — schema gap | Graph Architect (R3 ADR) |
| Immediate bundle fix | Blocking | User / Librarian (R1) |

---

*[AGENTS: code-auditor]*
