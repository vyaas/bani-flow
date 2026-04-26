# ADR-111: Bottom Bar Retirement

**Status**: Accepted
**Date**: 2026-04-26
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-100 (edit coverage matrix), ADR-103 (co-located edit affordances), ADR-108 (musician add chip + form split), ADR-109 (musician-as-composer)
**Gate**: This ADR must not be implemented before ADR-108 and ADR-109 have shipped. The bar is removable only once the ADR-100 gate conditions are met.
**Related**: ADR-031 (data entry forms — bundle button originated here)

---

## Context

ADR-031 introduced the global edit bar as the first write surface. ADR-103 deprecated it as co-located affordances replaced its individual entry points. ADR-100 defined the coverage matrix gate: the bar is removable when every entity type has a co-located create path and all `✎` stubs are in place.

After ADR-108 and ADR-109 ship, the gate conditions are met:

| Entity | Co-located create | Header ✎ |
|---|---|---|
| Musician | `+` on MUSICIAN header (ADR-108) | ✓ (ADR-104, rewired ADR-108) |
| Raga (janya) | `+` on Janyas row (ADR-106) | ✓ (ADR-104 stub) |
| Composition | `+` on Compositions header (ADR-105 + ADR-109) | ✓ (ADR-104 stub) |
| Composer | auto-created via musician panel (ADR-109) | ✓ (via musician ✎) |
| Recording (concert) | `+` on Concerts header (ADR-107) | — (file-shaped; not field-patched) |

Gate condition 1: every entity type has at least one create path not on the global bar. ✓  
Gate condition 2: ADR-104 header `✎` has shipped for all field-patchable entity types. ✓  
Gate condition 3: smoke test confirms end-to-end loop run for each entity type using only co-located triggers. (Coder runs this before merging.)

The bar can be retired.

### What the bar currently contains

```html
<div id="footer-bar">
  <span>  <!-- deprecation caption --> </span>
  <button>+ Musician / Recordings</button>   <!-- openEntryForm('musician_recordings') -->
  <button>+ Composer</button>                <!-- openEntryForm('composer') -->
  <button>+ Raga</button>                    <!-- openEntryForm('raga') -->
  <button>+ Composition</button>             <!-- openEntryForm('composition') -->
  <button>+ Concert Recording</button>       <!-- openEntryForm('recording') -->
  <button>✎ Edit</button>                    <!-- openEntryForm('edit') -->
  <span style="flex:1"></span>
  <button id="bundle-download-btn">⬇ Bundle (N items)</button>
</div>
```

The first six buttons and the caption are removed. The bundle download button is the only element worth keeping — it is the contributor's primary feedback mechanism (how many items are queued) and the download trigger for the contribution loop (ADR-085).

### Forces

| Force | Direction |
|---|---|
| **Screen real estate** | A footer bar that occupies ~44px of vertical height at all times was appropriate when it was the *only* write surface. With every panel now having its own entry points, the bar has become noise. |
| **Loop closure** | The bundle button must remain reachable. Without it, the contribution loop has no exit. |
| **Visual restraint** | The bar's persistent presence sent the signal "this UI is editable". The panels' `+` chips now send that signal from within the reading context. The bar is now visual clutter. |
| **Reachability on mobile** | On small screens the footer bar competed with the bottom sheet (ADR-034). Its removal reduces layering complexity. |
| **No information loss** | `buildComposerForm()`, `buildRagaForm()`, `buildMusicianRecordingsForm()` etc. remain callable. They are not deleted. The bar's buttons were merely the surface entry points; removing the buttons does not remove the forms. |

---

## Pattern

**Christopher Alexander, *The Nature of Order*, Book 1, Property 8 — *Deep Interlock and Ambiguity*.** A single surface that serves all write acts simultaneously does not allow any one act to be deeply interlocked with its context. When you click "+ Composition" on the global bar, the context (which composer? which raga?) must be re-established from scratch. Each co-located chip, by contrast, is deeply interlocked with the entity it acts on — the context is already there. The bar, once a solution, is now an obstacle to deeper interlock.

---

## Decision

### 1 — Remove all deprecated buttons and the deprecation caption from `#footer-bar`

Elements removed:
- The deprecation caption `<span>` ("Most edits now live on the panels. This bar is a fallback.")
- `<button>+ Musician / Recordings</button>`
- `<button>+ Composer</button>`
- `<button>+ Raga</button>`
- `<button>+ Composition</button>`
- `<button>+ Concert Recording</button>`
- `<button>✎ Edit</button>`
- The `<span style="flex:1"></span>` spacer (no longer needed)
- The HTML comment block referencing ADR-103 deprecation

### 2 — Bundle button is extracted and repositioned

`#bundle-download-btn` is moved out of `#footer-bar` and into the `#header` area, placed at the right edge of the header row alongside the existing `?` (help) button:

```
BANI FLOW ♫    [search raga/composition…]    ⬇ Bundle (0)   ?
```

On mobile, the bundle button collapses to a minimal icon chip (⬇) with the item count as a badge. The item count is the most important signal; the label "Bundle" is secondary.

### 3 — `#footer-bar` element is removed entirely

Once emptied, the `<div id="footer-bar">` element itself is removed from `base.html`. Any CSS rules targeting `#footer-bar` are also removed (search `#footer-bar` in `base.html`). Any `margin-bottom` or `padding-bottom` on the canvas or sidebar that compensated for the bar's height is adjusted.

### 4 — `entry-btn-deprecated` class and associated CSS are removed

The CSS rules `.entry-btn-deprecated` and `.entry-btn-deprecated:hover` in `base.html` are removed. The base `.entry-btn` and `.entry-btn-edit` rules may be kept if any inline forms still use them; if unused, remove those too.

### 5 — `openEntryForm` switch cases for bar-only entries are not removed

`openEntryForm('musician_recordings')`, `openEntryForm('composer')`, `openEntryForm('raga')`, `openEntryForm('composition')`, `openEntryForm('recording')`, `openEntryForm('edit')` remain callable from `entry_forms.js`. They are tested by the smoke test and serve as the fallback dispatch for any future programmatic use. Their surface buttons are gone; their functions are not.

---

## Consequences

### Positive
- The bottom of the screen is clear. On mobile, bottom-sheet interactions are unimpeded.
- No persistent visual noise on desktop.
- Every write act now originates from the panel it acts on. The loop is fully contextual.
- `entry-btn-deprecated` class name disappears from the codebase.

### Negative / accepted tradeoffs
- A contributor who has memorised the global bar buttons must discover the panel chips. The panel chips follow a near-universal UI convention (`+` next to a section header = add to that list); no tutorial copy is required.
- The bundle button changes location. Existing contributors will notice. The header is arguably a better home — it is persistent and visible regardless of which panel is open.

---

## Implementation Checklist (for Carnatic Coder)

- [ ] Confirm ADR-108 and ADR-109 have shipped (gate check)
- [ ] Run smoke test: for each entity type, complete a full create cycle using *only* co-located chips (no bottom bar). All five entity types must produce valid bundle items.
- [ ] Remove deprecated buttons, caption, spacer, and HTML comment from `#footer-bar` in `base.html`
- [ ] Move `#bundle-download-btn` to `#header` area, right-aligned beside `?` button
- [ ] Add mobile-responsive treatment for bundle button (icon + count badge at ≤768px)
- [ ] Remove `<div id="footer-bar">` element
- [ ] Remove `#footer-bar` CSS rules from `base.html`
- [ ] Remove `canvas`/`sidebar` `margin-bottom` compensation for bar height
- [ ] Remove `.entry-btn-deprecated` and `.entry-btn-deprecated:hover` CSS rules
- [ ] Run `bani-render` and visually inspect: no empty space at bottom, bundle button visible in header, mobile layout correct
- [ ] Update ADR-100 coverage matrix: mark Status as "Implemented"
- [ ] Append learning log to `carnatic/.clinerules`
