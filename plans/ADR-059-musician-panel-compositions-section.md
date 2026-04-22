# ADR-059: Musician Panel — Compositions Section and Composer Sub-Mode

**Status**: Accepted
**Date**: 2026-04-21
**Agents**: graph-architect
**Implements**: ADR-057 (Composer Panel — Compositions as the Listenable Surface)
**Depends on**: ADR-018 (concert brackets), ADR-053 (drop-timestamps), ADR-054 (era chips), ADR-055 (no dead-ends)

---

## Context

### What ADR-057 promised, what is missing

ADR-057 was accepted on 2026-04-21 and partially scaffolded into `media_player.js` (section 3 of `buildRecordingsList`, lines 745–836). The scaffold is structurally correct — it builds a `div.comp-section` from `composerComps` and appends it to `recList`. The styling is already in `base.html`. However, **the section renders empty in practice** due to a defect in the variable references:

```js
// BUG — these use window.* which is undefined for const-scoped globals:
const composerForNode = (window.composers || []).find(…);
…
? (window.compositions || []).filter(…)
…
const ragaObj = (window.ragas || []).find(r => r.id === comp.raga_id);
```

All JS globals injected by `html_generator.py` are declared with `const` inside a single `<script>` block. `const` at the top level of a `<script>` does **not** attach to `window`, so `window.composers`, `window.compositions`, and `window.ragas` are all `undefined`. The `|| []` fallback silently produces an empty section. The rest of `buildRecordingsList` correctly uses `compositions` (no `window.`) throughout.

### What the user expects to see

> "composer information is missing. And the compositions is missing from the Musician panel. Every Musician must have their recordings, singles, and compositions, in that order. Compositions needs to be demarcated as it is a special category, showing chips (composition, raga), which if clicked populate and expand the Bani-flow panel."

### Panel ordering

The current panel order is already correct by design:
1. **Concerts** (section 1 — `structuredPerfs` → concert brackets)
2. **Singles** (section 2 — `legacyTracks` as flat items)
3. **Compositions** (section 3 — works composed by this musician)

The only failure is that section 3 produces no output.

### Chip-to-Bani-Flow coupling

Clicking a `.comp-chip` in section 3 calls `triggerBaniSearch('comp', id)`, which (via `bani_flow.js` line 892) calls `window.setPanelState('TRAIL')` after 50ms. This opens the Bani Flow (left) panel with the composition trail. The behaviour is correct in principle but untested because the chips were never rendered.

### Pure composer sub-mode (Trinity)

For a node that has **zero** concerts and **zero** singles (e.g. Tyagaraja, Dikshitar, Syama Sastri), the Musician panel opens showing only the Compositions section header and list. This must not look like a broken panel — it should look intentional. The header `"Compositions (N)"` already serves as a clear label; no additional affordance is needed for this release.

ADR-057 §Entry points also specifies that clicking a *composer node on the graph* should route to `openComposerPanel(composerId)`. That expanded entry-point routing remains out of scope for this ADR; it requires `graph_view.js` changes to distinguish performer vs. composer nodes on click. The immediate priority is fixing the Musician panel compositions section.

---

## Forces

| Force | Direction |
|---|---|
| **No dead ends (ADR-055)** | Composers are already flagged `is_listenable` via `composer_has_composition`. The panel must fulfil the promise by showing their compositions — currently it shows nothing. |
| **Separation of concerns** | The Coder fixes the JS variable scope bug; no data changes needed (composers, compositions, ragas are all correctly injected). |
| **Bani Flow coupling** | Compositions are listening entry points. Clicking a comp-chip must trigger the Bani Flow trail, which in turn opens the left panel. This unifies the two exploration vectors. |
| **Visual demarcation** | The compositions section is categorically different from recordings. It already has `.comp-section-header` styling (uppercase, muted colour, separator). No new CSS needed; the existing styles suffice. |
| **Performance** | `composers.find(c => c.musician_node_id === nodeId)` runs in O(n) over the composer list (typically < 50 entries). Acceptable. |

---

## Pattern

**Levels of Scale** (Alexander): recordings and compositions are different scales of the same musical life. On the Musician panel, a recording is an event; a composition is a legacy. The panel should surface both, ordered by temporal immediacy (when the musician performed) then by permanence (what they left behind).

---

## Decision

### Fix 1 — Variable scope in `buildRecordingsList` section 3

In `media_player.js` section 3, replace `window.composers`, `window.compositions`, and `window.ragas` with their bare counterparts:

```js
// BEFORE (broken):
const composerForNode = (window.composers || []).find(
  c => c.musician_node_id === nodeId
);
const composerComps = composerForNode
  ? (window.compositions || []).filter(c => c.composer_id === composerForNode.id)
  : [];
…
const ragaObj = (window.ragas || []).find(r => r.id === comp.raga_id);
```

```js
// AFTER (correct):
const composerForNode = (typeof composers !== 'undefined' ? composers : []).find(
  c => c.musician_node_id === nodeId
);
const composerComps = composerForNode
  ? (typeof compositions !== 'undefined' ? compositions : []).filter(
      c => c.composer_id === composerForNode.id
    )
  : [];
…
const ragaObj = (typeof ragas !== 'undefined' ? ragas : []).find(r => r.id === comp.raga_id);
```

The `typeof` guard is the correct idiom for referencing injected globals from within a `<script>` block when `window.*` is not available.

### Fix 2 — Panel visibility when only Compositions section has content

In the `buildRecordingsList` visibility block at the end, the `hasContent` check already includes `composerComps.length > 0`. No change needed — this is already correct in the scaffold.

### Fix 3 — Bani Flow opens when composition chip is clicked

`triggerBaniSearch('comp', comp.id)` already calls `setPanelState('TRAIL')` via `bani_flow.js`. This is correct. No change needed, but it must be verified end-to-end after Fix 1 is applied.

### Fix 4 — rec-filter must not hide Compositions section

The `rec-filter` input filters visible list items. The Compositions section (`div.comp-section`) is appended as a child of `recList` but is a `div`, not a `li`. Verify that the filter's `querySelectorAll` selectors do **not** unintentionally hide the `.comp-section` element. If the filter does `li` selectors only, no change is needed. If it uses a broader selector that could match `.comp-section`, add a guard to exclude it.

---

## Consequences

- **Trinity nodes become listenable**: clicking Tyagaraja's node opens the Musician panel, which now shows his compositions (section 3 filled). Each comp-chip, when clicked, triggers the Bani Flow trail with that composition's performers.
- **Performer-composers** (e.g. Patnam Subramania Iyer): panel shows concerts, singles, **then** compositions. All three sections are functional.
- **No new CSS needed**: `.comp-section`, `.comp-section-header`, `.comp-section-list`, `.comp-section-item` are already styled in `base.html`.
- **No data changes**: `composers`, `compositions`, `ragas` are all correctly injected by `html_generator.py`.

---

## Implementation

**Agent**: Carnatic Coder
**File**: `carnatic/render/templates/media_player.js`

1. Find section 3 in `buildRecordingsList` (search for `// ── 3. Compositions by this musician`).
2. Replace `window.composers`, `window.compositions`, and `window.ragas` with `typeof`-guarded bare references (see Fix 1 above).
3. Run `bani-render`.
4. Open `graph.html`, click Tyagaraja's node. Verify Musician panel shows "Compositions (N)" section with comp-chips and raga-chips.
5. Click a comp-chip. Verify Bani Flow panel opens (left drawer) and trail populates with that composition's recordings.
6. Click the rec-filter input, type a query. Verify the Compositions section is not inadvertently hidden by the filter.
