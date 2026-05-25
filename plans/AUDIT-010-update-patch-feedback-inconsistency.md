# AUDIT-010: "Update Patch" Post-Submission Feedback Inconsistency

**Status**: Complete  
**Date**: 2025-05-24  
**Scope**: `carnatic/render/templates/entry_forms.js` — all form functions that expose an "Update Patch" or "+ Add to Patch" primary CTA button  
**Routed to**: Graph Architect (ADR) → Carnatic Coder (implementation)

---

## Scope

The entry forms module (`entry_forms.js`, 7 558 lines) contains eleven distinct form-builder functions. Each ends with a primary CTA button whose label is "Update Patch" (edit mode) or "+ Add to Patch" (add mode). After clicking, the user should learn: (a) what was just committed to the in-memory bundle, and (b) what to do next. The audit scanned every `bundleBtn.addEventListener('click', ...)` and `stageBtn.addEventListener('click', ...)` handler to classify which feedback pattern each form uses.

---

## Findings

### F-01 · Pattern A — Dialog Replacement (the preferred pattern)

**Forms using this pattern**: `buildRagaForm`, `buildCompositionForm`, `buildMusicianForm` (edit path), `buildFocusedLecdemForm`

**Mechanism**: On click, the form body and footer are fully replaced by a success panel. The panel contains a confirmation headline, numbered next-step instructions, and two footer buttons ("Add another" / "Close").

**Evidence — `showGenericSuccess` called by `buildRagaForm` and `buildCompositionForm`** (`entry_forms.js`, lines 3859–3900):
```js
function showGenericSuccess(win, filename, directory) {
  const body = win.querySelector('.ew-body');
  body.innerHTML = '';
  const msg = document.createElement('div');
  msg.className = 'ef-success';
  if (directory === 'bundle') {
    msg.innerHTML = `
      <strong>✓ Added <code>${filename}</code> to patch</strong>
      <p style="...">
        When done, click <strong>⬇ Patch</strong> in the footer to download
        <code>bani_add_patch.json</code>, then run:
      </p>
      <pre ...>bani-add bani_add_bundle.json\nbani-render</pre>
    `;
  }
  // …Close button appended to footer
}
```

**Evidence — `showMusicianPatchSuccess` called by `buildMusicianForm` (edit path)** (lines 2103–2138):
```js
function showMusicianPatchSuccess(win, id, edgeCount) {
  const body = win.querySelector('.ew-body');
  body.innerHTML = '';
  msg.innerHTML = `
    <strong>✓ Added <code>${id}</code>${edgeNote} to the patch</strong>
    <ol>
      <li>Continue adding musicians or recordings</li>
      <li>When done, click <strong>⬇ Patch (N ops)</strong> in the toolbar to download</li>
      <li>Run: <code>bani-add bani_add_bundle.json</code></li>
      <li>Run: <code>bani-render</code></li>
    </ol>
  `;
  // …"+ Add Another Musician" + "Close" buttons appended to footer
}
```

**Evidence — `buildAddMusicianForm` inline success block** (lines 6453–6480):
```js
// Inline, does NOT call showMusicianPatchSuccess or showGenericSuccess
msg.innerHTML = isEdit
  ? `<strong>✓ Added to bundle: ${editSummary}</strong>`
    + `<p ...>Download ⬇ Bundle to apply the changes.</p>`
  : `<strong>✓ Added to bundle: <code>${musId}</code></strong>`
    + `<p ...><code>${musId}</code> is now available in all dropdowns — add more musicians…`;
// …"Add another musician" + "Close" buttons appended to footer
```

> **Note**: `buildAddMusicianForm` uses a third distinct message format — it is not a call to either shared helper. It also omits the `bani-add` / `bani-render` command instructions entirely in the edit path.

---

### F-02 · Pattern B — Gray-and-Re-enable (the inferior pattern)

**Forms using this pattern**: `buildAddConcertForm`, `buildFocusedYouTubeForm`, `buildLecdemEditForm`, `buildLecdemSubjectEditForm`

**Mechanism**: On click, the button is disabled and its label briefly changes to "✓ Added" or "✓ Staged N items!", then `setTimeout` restores the original label and re-enables the button. The form body is left untouched. No snapshot, no next-step instructions, no OK/Undo.

**Evidence — `buildAddConcertForm`** (line 3824):
```js
bundleBtn.addEventListener('click', () => {
  const obj = collectConcertData();
  if (!obj.title || !obj.url) return;
  if (typeof addToBundle === 'function') {
    addToBundle('recordings', { op: isEdit ? 'upsert' : 'create', value: obj });
    bundleBtn.disabled    = true;
    bundleBtn.textContent = '✓ Added';
    setTimeout(() => {
      bundleBtn.disabled    = false;
      bundleBtn.textContent = isEdit ? 'Update Patch' : '+ Add to Patch';
    }, 2000);
  }
});
```

**Evidence — `buildFocusedYouTubeForm`** (lines 6744–6752):
```js
bundleBtn.addEventListener('click', () => {
  const data = buildBundleItem();
  if (!data.youtube.length) return;
  const effId = getEffectiveMusicianId();
  if (typeof addToBundle === 'function') {
    addToBundle('musicians', { op: 'append', id: effId, array: 'youtube', value: data.youtube });
    bundleBtn.disabled    = true;
    bundleBtn.textContent = '✓ Added';
    setTimeout(() => { bundleBtn.disabled = false; bundleBtn.textContent = 'Update Patch'; }, 2000);
  }
});
```

**Evidence — `buildLecdemEditForm`** (lines 5558–5566):
```js
if (count > 0) {
  stageBtn.textContent = `✓ Staged ${count} item${count > 1 ? 's' : ''}!`;
  setTimeout(() => { stageBtn.textContent = 'Update Patch'; }, 1800);
} else {
  stageBtn.textContent = '(no new items)';
  setTimeout(() => { stageBtn.textContent = 'Update Patch'; }, 1200);
}
```

**Evidence — `buildLecdemSubjectEditForm`** (lines 5190–5197):
```js
if (count > 0) {
  stageBtn.textContent = `✓ Staged ${count} addition${count > 1 ? 's' : ''}!`;
  setTimeout(() => { stageBtn.textContent = '↪ Stage additions → patch'; }, 1800);
} else {
  stageBtn.textContent = '(no new items)';
  setTimeout(() => { stageBtn.textContent = '↪ Stage additions → patch'; }, 1200);
}
```

---

### F-03 · Orphaned legacy helper `showBundleSuccess`

**File**: `entry_forms.js`, lines 4258–4298  
**Pattern**: Dead code (dialog-replacement variant)

`showBundleSuccess(win, id, mode)` was written for the now-deprecated `_buildCombinedMusicianYouTubeForm` / `buildMusicianRecordingsForm` path. Grep confirms no active caller in the codebase. It offers a fourth message format with an "Add another musician" button.

```js
function showBundleSuccess(win, id, mode) {
  // …
  msg.innerHTML = `
    <strong>✓ Added to bundle: ${desc}</strong>
    <p ...>When done adding items, click <strong>⬇ Patch</strong>
      in the footer to download <code>bani_add_patch.json</code>, then run:
    </p>
    <pre ...>bani-add bani_add_bundle.json\nbani-render</pre>
  `;
  // footer: "Add another musician" + "Close"
}
```

---

### F-04 · Fragmented message vocabulary across Pattern A helpers

Even within Pattern A, the confirmation headline and next-step text are not uniform:

| Helper / site | Headline | Next-steps format | Undo? | Snapshot? |
|---|---|---|---|---|
| `showMusicianPatchSuccess` | `✓ Added <id> [+ N edges] to the patch` | `<ol>` with 4 steps | No | No |
| `showGenericSuccess` (bundle) | `✓ Added <filename> to patch` | `<p>` + `<pre>` inline | No | No |
| `buildAddMusicianForm` inline (add) | `✓ Added to bundle: <id>` | prose `<p>` only (no commands) | No | No |
| `buildAddMusicianForm` inline (edit) | `✓ Added to bundle: <editSummary>` | `<p>` "Download ⬇ Bundle" only | No | No |
| `showBundleSuccess` (dead) | `✓ Added to bundle: <desc>` | `<p>` + `<pre>` | No | No |

No form shows an undo button. No form shows a snapshot of the exact JSON object committed.

---

## Summary

| # | Form function | Lines | Pattern | Snapshot? | Next-step help? | Undo? |
|---|---|---|---|---|---|---|
| 1 | `buildMusicianForm` (edit) | 1059 | A — Dialog | No | Yes (4-step `<ol>`) | No |
| 2 | `buildAddMusicianForm` | 6143 | A — Dialog | No | Add only; edit omits commands | No |
| 3 | `buildRagaForm` | 2197 | A — Dialog | No | Yes (`<pre>` block) | No |
| 4 | `buildCompositionForm` | 2874 | A — Dialog | No | Yes (`<pre>` block) | No |
| 5 | `buildFocusedLecdemForm` | 6773 | A — Dialog | No | Yes (`<pre>` block) | No |
| 6 | `buildAddConcertForm` | 3559 | **B — Gray/re-enable** | No | No | No |
| 7 | `buildFocusedYouTubeForm` | 6574 | **B — Gray/re-enable** | No | No | No |
| 8 | `buildLecdemEditForm` | 5216 | **B — Gray/re-enable** | No | No | No |
| 9 | `buildLecdemSubjectEditForm` | 5086 | **B — Gray/re-enable** | No | No | No |

Plus: `showBundleSuccess` (lines 4258–4298) is dead code — a fifth message variant with no active caller.

---

## Recommendations

**R-01 (schema/UX design → Architect)**: Define a single canonical `showPatchSuccess(win, snapshot, opts)` contract that all nine forms share. The contract should specify: confirmation headline format, snapshot display (collapsible JSON), next-step command block, and footer button set (OK + Undo). This is a UX schema decision — write an ADR before implementing.

**R-02 (code → Coder)**: Once the ADR is accepted, replace the four `setTimeout` Gray/re-enable handlers in `buildAddConcertForm`, `buildFocusedYouTubeForm`, `buildLecdemEditForm`, `buildLecdemSubjectEditForm` with calls to the new shared helper.

**R-03 (code → Coder)**: Consolidate the four existing Pattern A helpers (`showMusicianPatchSuccess`, `showGenericSuccess`, `buildAddMusicianForm` inline, `showBundleSuccess`) into the single new helper. Remove `showBundleSuccess` (dead code, line 4258).

**R-04 (code → Coder)**: Standardise the "Add another" button label and target form across all success panels — currently they are inconsistent ("Add Another Musician" vs "Add another musician" vs non-existent for raga/composition/concert).

---

## Routing

| Finding | Route to |
|---|---|
| R-01: Define `showPatchSuccess` contract (snapshot, next-steps, OK/Undo) | **Graph Architect** → ADR |
| R-02: Replace 4× `setTimeout` handlers with shared helper | **Carnatic Coder** |
| R-03: Consolidate 4 Pattern A variants + remove dead `showBundleSuccess` | **Carnatic Coder** |
| R-04: Standardise "Add another" button labels | **Carnatic Coder** |

---

*[AGENTS: code-auditor]*
