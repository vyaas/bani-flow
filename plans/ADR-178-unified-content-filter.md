# ADR-178: Unified Panel Content Filter — textContent Search Across Every Panel Label

**Status**: Accepted
**Date**: 2026-10-18
**Agents**: surface (UI surgeon) → tester
**Depends on**: ADR-128 (panel components — the shared atom module this engine lives in), ADR-165 §3 (visibility-channel invariant: filters express exclusion *only* via inline `display`; collapse owns `hidden`), ADR-018/064/080/081 (the bracket-, tree-, and lecdem-aware matching rules this ADR replaces), ADR-163 (playlists section).

---

## Context (forces in tension)

Both detail panels carry a filter bar above their content: `#rec-filter` in the musician panel ("Filter recordings…") and `#trail-filter` in the Bani-flow panel ("Filter trail…"). Each was a bespoke listener in `graph_view.js` that walked a fixed list of structures — concert brackets, raga-tree groups, legacy flat rows, lecdem sections, playlist sections — and, for each, extracted a hand-picked set of text nodes (`.yt-label-chip`, `.comp-chip`, `.raga-chip`, `.composer-chip`, `.rec-meta`, `.lecdem-subjects`, …) to test against the query.

That design had three costs:

1. **Label blindness.** Any label not in the extraction list was invisible to the filter — year, version badge, `#trail-version`, section/group header chips, and (in the musician panel) the entire Compositions-by-raga section, standalone Misc leaves under a `li.tree-group`, and the Notes section. Lecdem segment names and subject cross-links matched inconsistently across surfaces.
2. **Selector drift.** Matching rules accumulated by ADR (018 → 064 → 070 → 080 → 081 → 163), each new render structure needing a matching edit to the listener. The lecdem strip's own pass looked for `.lecdem-chip`, which had not been the row class since the strip moved to `li.lecdem-row` — so it silently matched only the section header.
3. **Duplication.** Two panels, overlapping structures (lecdems, tree groups, playlists), two implementations of "is this row visible".

The user's directive: *"Filter content…"* must be a broad-spectrum search over **every** text that populates both panels — lecdems **and their segment names**, subject chips, all misc recordings, every label — because the filter is a navigation tool, not a recordings tool.

## Pattern

**One matcher over the rendered text; structure only decides visibility propagation.** A row's full `textContent` already contains every chip, label, and segment name by construction — so matching needs no per-label selector list. The only thing that *does* need structure is the group visibility decision (show a section/tree/group iff it has a visible descendant, or its header matched) and the fold expansion that lets a match be seen.

## Decision

### 1. One engine, two panel keys, declarative zones

`panel_components.js` gains `applyPanelContentFilter(panelKey, rawQuery)` and `CONTENT_FILTER_ZONES`. Each zone is `{root, rows[], groups[], noMatch?, rootBase?}`:

- `rows` — the atomic content rows. A row is visible iff its own `textContent` matches, **or** an ancestor group's header matched.
- `groups` — `{sel, header, expand?, collapseOnClear?}`. A group is visible iff its header text matched, or a descendant row is visible. A matching header **forces** all its descendant rows visible (typing a raga name shows all its compositions; typing "Lecdems" shows the whole section).
- `noMatch` — the "no match" sentinel row, created/toggled inside root.
- `rootBase(root)` — optional resting display for a root that must hide as a whole (the lecdem strip).

`musician` covers `#recordings-list` (lecdem rows + segment perf items, raga-tree composition nodes, misc leaves, compositions-by-raga, playlists, notes). `bani` covers `#trail-list` (tree leaves, perf/yt flat `li`s, playlists) **plus** `#bani-lecdem-strip` and `#bani-playlists` — the strip and playlist block sit outside the trail but are part of the same panel's content.

### 2. `textContent` is the matcher

`_contentFilterText(el)` lowercases `el.textContent`. This is the whole point: chips, segment names, subject cross-links, years, version badges, and misc titles are all descendants, so they are all searchable without enumerating a single label class. A new chip type needs no filter change.

### 3. The visibility-channel invariant is preserved (ADR-165 §3)

`_contentFilterShow(el, visible)` writes **only** `el.style.display = visible ? '' : 'none'`. The engine never touches the `hidden` attribute — collapse/fold keeps that channel, so `collectQueueItems`' ancestor walk ("visible = no inline-`display:none` ancestor, ignoring `hidden`") stays sound. `.concert-bracket` fold uses the `expanded` class (added on a match, removed on clear), which is a class, not `display`.

### 4. Both filter bars are relabelled

`#rec-filter` and `#trail-filter` placeholders become **"Filter content…"**. The engine is bound in the existing two listeners in `graph_view.js`, each now a two-line delegation:

```js
document.getElementById('rec-filter').addEventListener('input', function() {
  if (typeof applyPanelContentFilter === 'function') applyPanelContentFilter('musician', this.value);
});
```

### Consequences

**Positive**
- Every panel label is searchable by construction: lecdem segment names, subject chips, misc recordings, composition groups, playlist track chips, notes, section/group headers.
- Adding a new panel structure means adding one row selector to a zone table — not re-deriving matching rules.
- The two panels share one matcher and one invariant; the ADR-165 harvest contract is untouched.

**Negative / costs**
- `textContent` matching is broader than the old per-field rules: a query that appears in a header count (`(18)`), a year, or a version badge now matches. This is the intended trade — breadth over curated field lists.
- The engine is load-order-late relative to `graph_view.js` (`panel_components.js` loads after it, ADR-128/§6.1). Listeners are attached at parse time but only *call* the engine at event time, by which point all scripts have loaded; this is safe but must be remembered if the engine is ever needed at parse time.

## Implementation (as landed)

- `panel_components.js`: `CONTENT_FILTER_ZONES`, `_contentFilterText`, `_contentFilterShow`, `_contentFilterSetSentinel`, `_contentFilterZone`, `applyPanelContentFilter` (+ `window.applyPanelContentFilter`).
- `graph_view.js`: both listeners replaced by delegations.
- `base.html`: both placeholders → "Filter content…".
- `UIMAP.md` §1/§2/§6.5 updated; `test_ui_surface_map_drift.py` claims extended.
- `test_content_filter_drift.py`: structural guard for the relabel, the delegation, the inline-`display`-only channel, and the row selectors for every panel structure.

**Verified**: `bani-render && cli.py validate`; full pytest suite green; browser probe (headless Chromium) confirms lecdem segment/subject queries, misc titles, composition rows, section headers, the lecdem strip, and playlists all match, and that the strip hides on no-match.

---

[ADR: ADR-178, ADR-165, ADR-128, ADR-018, ADR-064, ADR-080, ADR-081, ADR-163]
[AGENTS: surface]
