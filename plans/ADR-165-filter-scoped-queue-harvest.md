# ADR-165: Filter-Scoped Queue Harvest — Row Registry & the WYSIWYG Invariant

**Status**: Proposed
**Date**: 2026-06-12
**Agents**: graph-architect → carnatic-coder → test-engineer
**Depends on**: ADR-162 (`MediaQueue` and the Up-Next panel), ADR-163 §3 (the `+` affordance's lazy `getItem` thunks — this ADR generalises them), ADR-154 (`mediaKey` identity), ADR-156 (span items / `start_seconds`), ADR-018/064/080 (the bracket-, tree-, and lecdem-aware `#rec-filter` matching rules this ADR deliberately does **not** re-implement).
**Series**: first of three — ADR-165 (mechanism) → ADR-166 (detail-panel affordances) → ADR-167 (Bani Flow affordances). Together they turn every filter input into a playlist generator.

---

## Context (forces in tension)

The roadmap's next ambition: **a filter is a playlist generator**. Type "begada" into the filter above Ramnad Krishnan's sections, press a section's Play All, and the queue holds exactly the Begada rows that survived the filter. Combined with the ADR-162 queue's "Save as playlist" (→ ADR-163 `op:"create"`), a persistent playlist becomes a three-gesture artifact: *filter → play all → save*.

For that to work, something must answer the question *"which playable items are currently visible inside this container?"* Today nothing can:

- **Queue items are constructed ad hoc** at every call site. The `+` affordance receives a lazy thunk (`_buildPlusBtn(getItem)` — `media_player.js:1751, 2355, 2481, 2554, 3133`), the structured-recording "play all" builds its own `queueItems` array (`media_player.js:3088, 3128`), and the trail's ADR-157 play-all eagerly precomputes `_qItems` at render time (`bani_flow.js:738–760`). There is no shared "this row, as a queue item" contract.
- **Filter state lives only in the DOM.** Both filters (`#rec-filter` — `graph_view.js:1298`; `#trail-filter` — `graph_view.js:1440`) hide rows by setting inline `style.display = 'none'`, with bracket-aware, tree-aware, and lecdem-aware matching rules accumulated across ADR-018/064/070/080/081. Re-implementing those rules as a data-level predicate would duplicate ~150 lines of matching logic and **drift** the moment either copy changes.
- **Collapse is not filter.** Section bodies fold via the `hidden` attribute (`buildSection`, `panel_components.js:98–112`). A collapsed section is a *viewing convenience*; a filtered-out row is an *expressed exclusion*. Play All on a collapsed-but-unfiltered section must still play it.
- **Laziness matters.** Thunks exist because materialising a queue item resolves media, closes over loop variables, and assembles `meta` — work that should happen only when the user actually acts (the ADR-163 precedent).

## Pattern

**Strong Centres, orthogonal Boundaries.** The playable row is the centre: it alone knows how to describe itself as a queue item, and it declares that once (the same thunk feeds the `+` menu *and* the harvest). The two hiding mechanisms are boundaries on orthogonal channels — filters speak through inline `style.display`, collapse speaks through the `hidden` attribute — so "filter-visible" is computable without knowing any filter's matching rules.

## Decision

### 1. Row registry — one thunk per playable row, declared at build time

A module-level registry in `media_player.js`:

```js
const _queueItemThunks = new WeakMap();   // rowEl → getItem

// Marks `rowEl` as a playable row whose queue item(s) come from `getItem`.
// getItem() → item | item[]  (lazy; same contract as _buildPlusBtn).
function registerQueueItem(rowEl, getItem) {
  rowEl.classList.add('q-row');
  _queueItemThunks.set(rowEl, getItem);
}
window.registerQueueItem = registerQueueItem;   // bani_flow.js registers trail rows
```

Every site that today calls `_buildPlusBtn(getItem)` also calls `registerQueueItem(rowEl, getItem)` with the **same thunk** — the `+` affordance and the harvest become two consumers of one declaration. Rows that are playable but lack a `+` (if any remain) register too. A thunk may return an **array** (a playlist row expands to its items via `_playlistToQueueItems`), and the harvest flattens.

### 2. The harvest primitive — `collectQueueItems(rootEl)`

```js
// All queue items currently *filter-visible* inside rootEl, in document order,
// deduplicated by media identity + span start.
function collectQueueItems(rootEl) {
  const seen = new Set(), out = [];
  rootEl.querySelectorAll('.q-row').forEach(row => {
    // Filter channel only: inline display:none on the row or any ancestor
    // below rootEl excludes it. The `hidden` attribute (collapse) does not.
    for (let el = row; el && el !== rootEl; el = el.parentElement) {
      if (el.style && el.style.display === 'none') return;
    }
    const thunk = _queueItemThunks.get(row);
    if (!thunk) return;
    [].concat(thunk() || []).forEach(item => {
      if (!item || !item.media) return;
      const k = mediaKey(item.media) + '@' + (item.startSeconds || 0);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(item);
    });
  });
  return out;
}
```

Properties, each deliberate:
- **WYSIWYG**: document order = visual order; the queue reads exactly like the filtered panel did at click time. No second filter implementation exists to drift.
- **Lazy**: thunks materialise at the moment of action, never at render.
- **Dedup key is `mediaKey + '@' + startSeconds`** — not `mediaKey` alone. Under ADR-156, three Begada segments inside one concert are three distinct playable spans; collapsing them to one video (as ADR-157's trail dedup did) would defeat span-accurate filter playlists. Genuine duplicates (same video, same offset, reachable through two rows) still collapse.
- **Collapse-blind**: a folded section plays in full; only the filter excludes.

### 3. The visibility-channel invariant (constitutional for templates)

What makes §2's ancestor walk sound is an accident of history this ADR promotes to a rule:

> **Filters express exclusion exclusively via inline `style.display = 'none'`. Collapse/fold expresses folding exclusively via the `hidden` attribute (or a class that does not touch inline `display`). No template code may use one channel for the other's purpose.**

Both existing filter listeners already comply (`graph_view.js:1298–1437` and `:1440–1530` set inline display; `buildSection` collapse sets `bodyEl.hidden`). Future filter or fold code must keep to its channel, or harvest semantics silently corrupt. This invariant gets a comment block above both filter listeners and above `collectQueueItems`.

### 4. Bulk enqueue — `MediaQueue.addItems(items)`

ADR-163 §3 added single-item `addItem`. The enqueue affordance (ADR-166/167) appends a whole harvest:

```js
addItems(items) {
  const valid = (items || []).filter(it => it && it.media);
  if (!valid.length) return;
  if (!this.active) { this.start(valid, 0); return; }   // empty queue: enqueue ≡ play all
  this.items.push(...valid);
  _refreshQueuePanels();                                 // one refresh, not N
},
```

No dedup against items already in the queue — the queue is user-editable (ADR-162) and intentional repetition is legitimate; the harvest dedups within itself only.

### Before / after

```
BEFORE  row built → + thunk attached (one consumer)
        "what's visible?" → unanswerable without re-running filter logic

AFTER   row built → registerQueueItem(rowEl, thunk) → + menu AND harvest consume it
        collectQueueItems(sectionBody) → [items in visual order, filter-applied]
        startMediaQueue(items, 0)            (ADR-166/167: ▶ Play All)
        MediaQueue.addItems(items)           (ADR-166/167: ⊕ Enqueue)
```

## Consequences

**Positive**
- One declaration per row powers `+`, Play All, and Enqueue; zero duplicated filter logic; the matching rules stay where they are.
- The filter input is upgraded from a *viewing* tool to a *generative* one at no cost to its existing behaviour — this ADR changes no visible UI by itself.
- ADR-157's eager `_qItems` precomputation becomes deletable (ADR-167 does so).

**Negative / costs**
- The §3 invariant is a real constraint on future template work — a filter written with `classList`-based hiding would be invisible to the harvest. Mitigated by comment blocks at the three sites and a test (below).
- `WeakMap` registration means a re-rendered row must re-register; sections that rebuild their DOM (e.g. `_renderQueuePanel`-style full rebuilds) must call `registerQueueItem` inside the rebuild path, not once. The Coder should treat "build row → register row" as one motion.
- Harvest is O(rows) DOM-walking at click time — negligible at panel scale (hundreds of rows).

## Implementation (for Coder, after acceptance)

1. Add `_queueItemThunks`, `registerQueueItem`, `collectQueueItems`, and `MediaQueue.addItems` to `media_player.js`; export `registerQueueItem` and `collectQueueItems` on `window` for `bani_flow.js`.
2. Register thunks at every existing `_buildPlusBtn` call site (`media_player.js:1751, 2355, 2481, 2554, 3133`) and at the structured-recording rows behind `media_player.js:3088/3128`, reusing the identical thunk.
3. Add the §3 invariant comment above both filter listeners (`graph_view.js:1298, 1440`) and above `collectQueueItems`.
4. `.venv/bin/bani-render`; verify no behavioural change yet (this ADR is pure mechanism).

**Test Engineer:**
5. Unit: harvest returns visual order; dedups `mediaKey@start`; flattens array-returning thunks; skips rows under an inline-`display:none` ancestor; **includes** rows under a `hidden` (collapsed) section body.
6. Regression guard for §3: a row hidden via the filter channel is excluded; the same row collapsed via `hidden` is included.
7. `addItems` on an inactive queue starts at index 0; on an active queue appends with a single panel refresh.

**Branch**: `adr/165-filter-scoped-queue-harvest` — mechanism + two follow-up ADRs warrant a PR for the series.

---
[ADR: ADR-165, ADR-162, ADR-163, ADR-154, ADR-156, ADR-157, ADR-018, ADR-064, ADR-080]
[AGENTS: graph-architect]
