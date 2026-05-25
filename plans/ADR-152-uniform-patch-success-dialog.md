# ADR-152 — Uniform "Update Patch" Success Dialog: `showPatchSuccess`

**Status**: Proposed  
**Date**: 2026-05-24  
**Depends on**: ADR-083 (bani-add bundle as canonical write channel), ADR-015 (librarian write commands), ADR-016 (writer validation)  
**Audit source**: AUDIT-010 (`plans/AUDIT-010-update-patch-feedback-inconsistency.md`)

---

## Context

`entry_forms.js` exposes nine form functions whose primary CTA is "Update Patch" or "+ Add to Patch". After clicking, the user needs to know two things: (a) what was committed to the in-memory bundle, and (b) what to do next. AUDIT-010 found that only five of the nine forms satisfy both needs (Pattern A — dialog replacement); the other four silently gray out the button for 1–2 seconds and re-enable it, providing no snapshot and no next-step guidance (Pattern B — gray/re-enable).

Forces in tension:
- **Closure**: the user must know the operation is done and irreversible until Undo
- **Transparency**: the user must be able to verify what was committed before running `bani-add`
- **Next-step clarity**: `bani-add` and `bani-render` are manual steps; the UI must remind the user of both, identically, every time
- **Reversibility**: items in the in-memory bundle can be removed before the patch is downloaded; the dialog is the only moment at which an Undo is naturally expected
- **Simplicity**: a single shared helper is easier to maintain and audit than five divergent patterns

---

## Pattern

**Strong Centres** (Alexander): the success dialog is a self-contained centre — it has a clear boundary (the same `.ew-body` / `.ew-footer` that hosted the form), a single purpose (confirm + orient), and a stable vocabulary. Making every form produce the same centre is what gives the UI its coherence.

**Levels of Scale**: the snapshot detail lives at a smaller scale (the collapsible `<details>` block) than the confirmation headline, which lives at a smaller scale than the next-step command block. Each level is readable independently; the user can ignore the JSON unless they want to verify.

---

## Decision

Replace all five existing success helpers and all `setTimeout` gray/re-enable handlers with a single function:

```js
showPatchSuccess(win, snapshot, opts)
```

Where:
- `win` — the `.ew-window` element (whose `.ew-body` and `.ew-footer` are replaced)
- `snapshot` — the exact JS object that was passed to `addToBundle()`, for display only
- `opts` — optional configuration object (see below)

### `opts` fields

| Field | Type | Default | Purpose |
|---|---|---|---|
| `headline` | `string` | `'✓ Added to patch'` | Short confirmation, shown in `<strong>` |
| `addAnotherLabel` | `string` | `null` | If set, renders an "Add another" button that calls `addAnotherFn` |
| `addAnotherFn` | `function` | `null` | Called when the "Add another" button is clicked; closes `win` first |
| `undoFn` | `function` | `null` | Called when "Undo" is clicked; if `null`, Undo button is not shown |

### Layout — the success panel

```
┌─────────────────────────────────────────────────────┐  .ew-body
│  ✓ <headline>                                        │  ef-success__headline
│                                                      │
│  ▶ Snapshot  (collapsed by default)                  │  <details> / <summary>
│    { "op": "upsert", "id": "...", ... }              │  <pre class="ef-preview-pre">
│                                                      │
│  Next steps:                                         │  ef-success__steps
│  When done, click ⬇ Patch in the toolbar             │
│  to download bani_add_patch.json, then run:          │
│  ┌──────────────────────────────────────────┐        │
│  │ bani-add bani_add_bundle.json            │        │  <pre>
│  │ bani-render                              │        │
│  └──────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐  .ew-footer
│  [+ Add another X]   [Undo]   [OK]                  │
└─────────────────────────────────────────────────────┘
```

Button placement (left to right): "Add another" (optional, `ef-download-btn`), "Undo" (optional, `ef-preview-btn`), "OK" (always, `ef-preview-btn`, closes window).

### Next-step command block

The same literal text appears in every success panel:

```
When done, click ⬇ Patch in the toolbar to download
bani_add_patch.json, then run:

  bani-add bani_add_bundle.json
  bani-render
```

This block is **not parameterised**. Every form produces the same output; there is nothing entity-specific about the next steps once an item is in the bundle.

### Snapshot collapsibility

The `<details>` element is **closed by default**. Experienced users who just want to close the dialog never see the JSON. Contributors who want to verify the patch before downloading can expand it. The `<pre>` inside uses the existing `ef-preview-pre` class for consistent monospace styling.

### Undo behaviour

When `undoFn` is provided and the Undo button is clicked:
1. `undoFn()` is called (the caller is responsible for removing the item from `baniBundle`)
2. The success panel is replaced by a brief "↩ Undone — item removed from patch" message
3. After 1.5 s the window closes

Undo is only provided for the simple case where the last `addToBundle` call added exactly one item. For forms that stage multiple items in a single click (e.g. `buildLecdemEditForm` which stages N subjects + M segments), Undo is not offered — the `undoFn` is omitted and the Undo button does not render.

---

## Before / After — the nine forms

### Before

| Form | Pattern | Snapshot | Next steps | Undo |
|---|---|---|---|---|
| `buildMusicianForm` (edit) | A — `showMusicianPatchSuccess` | No | 4-step `<ol>` | No |
| `buildAddMusicianForm` | A — inline | No | Add only; edit omits commands | No |
| `buildRagaForm` | A — `showGenericSuccess` | No | `<pre>` block | No |
| `buildCompositionForm` | A — `showGenericSuccess` | No | `<pre>` block | No |
| `buildFocusedLecdemForm` | A — `showGenericSuccess` | No | `<pre>` block | No |
| `buildAddConcertForm` | **B — setTimeout** | No | None | No |
| `buildFocusedYouTubeForm` | **B — setTimeout** | No | None | No |
| `buildLecdemEditForm` | **B — setTimeout** | No | None | No |
| `buildLecdemSubjectEditForm` | **B — setTimeout** | No | None | No |

### After

All nine forms call `showPatchSuccess(win, snapshot, opts)`.

| Form | `headline` | `addAnotherLabel` | `undoFn` |
|---|---|---|---|
| `buildMusicianForm` (edit) | `✓ Patch queued for <id>` | — | last bundle item |
| `buildAddMusicianForm` (add) | `✓ Added <id> to patch` | `+ Add another musician` | last bundle item |
| `buildAddMusicianForm` (edit) | `✓ Patch queued for <id>` | — | last bundle item |
| `buildRagaForm` (add) | `✓ Added raga <id> to patch` | `+ Add another raga` | last bundle item |
| `buildRagaForm` (edit) | `✓ Patch queued for raga <id>` | — | last bundle item |
| `buildCompositionForm` (add) | `✓ Added composition <id> to patch` | `+ Add another composition` | last bundle item |
| `buildCompositionForm` (edit) | `✓ Patch queued for composition <id>` | — | last bundle item |
| `buildFocusedLecdemForm` | `✓ Lecdem queued for <musician id>` | — | last bundle item |
| `buildAddConcertForm` (add) | `✓ Added concert recording to patch` | — | last bundle item |
| `buildAddConcertForm` (edit) | `✓ Concert recording patch queued` | — | last bundle item |
| `buildFocusedYouTubeForm` | `✓ YouTube entries queued for <id>` | — | last bundle item |
| `buildLecdemEditForm` | `✓ Staged <N> item(s) for <id>` | — | omit (multi-item) |
| `buildLecdemSubjectEditForm` | `✓ Staged <N> subject(s) for <id>` | — | omit (multi-item) |

---

## Consequences

**Positive**:
- Every "Update Patch" click gives the same information in the same layout — no user-facing surprise
- The snapshot `<details>` block closes the loop on "did that really work?" without cluttering the primary flow
- Undo at the dialog is the natural recovery surface — it removes the last bundle item before the user leaves the form
- `showMusicianPatchSuccess`, `showGenericSuccess`, `showBundleSuccess` (dead), and two inline ad-hoc blocks are all deleted; net reduction ≈ 120 lines of divergent HTML-as-string logic
- The next-step command block is a single literal string maintained in one place

**Negative / risks**:
- `buildLecdemEditForm` and `buildLecdemSubjectEditForm` stage N items atomically; they cannot offer a simple Undo — the dialog must omit the Undo button and this is a visible asymmetry; acceptable because multi-item staging is genuinely harder to undo
- `showBundleSuccess` has no active callers but its removal should be verified by the Coder with a codebase-wide grep before deleting

---

## Implementation

Steps for the Carnatic Coder:

1. **Write `showPatchSuccess(win, snapshot, opts)`** as a top-level function near the other helpers (after line 94, before `efInput`). Use `<details>`/`<summary>` for the snapshot block. Keep all strings literal — no template engine.

2. **Replace `showMusicianPatchSuccess`** (lines 2103–2138): call `showPatchSuccess` from `buildMusicianForm`'s bundle click handler with the appropriate headline and undoFn.

3. **Replace `showGenericSuccess` calls** in `buildRagaForm` (line 2519), `buildCompositionForm` (line 3056), `buildFocusedLecdemForm` (line ~7185): call `showPatchSuccess` instead. Delete `showGenericSuccess` if no other callers remain after the sweep.

4. **Replace the inline success block in `buildAddMusicianForm`** (lines 6453–6480): call `showPatchSuccess` instead.

5. **Replace the `setTimeout` handler in `buildAddConcertForm`** (line 3824): call `showPatchSuccess` instead.

6. **Replace the `setTimeout` handler in `buildFocusedYouTubeForm`** (line ~6748): call `showPatchSuccess` instead.

7. **Replace the `setTimeout` handler in `buildLecdemEditForm`** (lines 5558–5566): call `showPatchSuccess` with no `undoFn`.

8. **Replace the `setTimeout` handler in `buildLecdemSubjectEditForm`** (lines 5190–5197): call `showPatchSuccess` with no `undoFn`.

9. **Delete `showBundleSuccess`** (lines 4258–4298) after confirming zero callers with grep.

10. **Run `bani-render`** and smoke-test all nine forms in the browser.

---

*[ADR: ADR-152]*  
*[AGENTS: graph-architect]*
