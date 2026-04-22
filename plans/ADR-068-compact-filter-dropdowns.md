# ADR-068: Compact Era and Instrument Filter Dropdowns

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-008 (era/instrument topbar filters), ADR-040 (mobile filter-bar wrapping), ADR-054 (era-coloured musician chips)

---

## Context

### The real-estate problem

The current `#filter-bar` renders each era as an individual pill chip and each instrument as an individual pill chip — 6 era chips + 5 instrument chips = 11 visible chips at all times, wrapping across two or three rows on a 375 px mobile viewport. Per ADR-040 mobile already allowed wrapping, but wrapping eats 60–90 px of vertical space that belongs to the graph.

The graph canvas is the primary content on a mobile screen. Every pixel of UI chrome above the graph is a direct subtraction from the listening surface. On a 667 px tall iPhone SE, the current filter bar in its wrapped state consumes ~18% of the visible viewport height before the graph is even visible.

### Scalability problem

We currently have 6 eras and 5 instruments. Adding more eras (e.g. "Pre-Trinity") or instruments (e.g. "Sitar", "Tabla") compounds the wrapping. The chip approach does not scale.

### Multi-select already works — the affordance does not

The back-end `activeFilters` logic already supports multi-select: any combination of era × instrument can be active simultaneously. The front-end chip layout, however, shows all options at once, making the multi-select affordance implicit rather than explicit. A dropdown with checkboxes makes multi-select explicit and expected.

### Forces

| Force | Direction |
|---|---|
| **Real-estate recovery** | Collapse 11 chips across multiple rows into a single line — frees 60–90 px of graph canvas on mobile |
| **Scalability** | Dropdown list accepts arbitrarily many options without changing the header footprint |
| **Multi-select legibility** | Checkbox-style list items make "you can pick several" obvious and familiar |
| **Discoverability** | Capsule buttons with dropdown arrows are universally understood; no new affordance to learn |
| **Active-count feedback** | When filters are on, the button label shows a count badge so the rasika knows the graph is filtered |
| **Clear affordance** | A single `✕ Clear` pill appears inline only when at least one filter is active |
| **Era colour signal** | Each era option retains its coloured dot; each instrument option retains its outline-shape icon |
| **No hidden state** | An active filter is always visible at a glance — the button label changes, the count badge appears |

---

## Pattern

**Strong Centres**: the `#filter-bar` becomes a single, compact, one-line strong centre rather than a sea of chips demanding equal visual attention on entry.

**Levels of Scale**: the two dropdowns operate at the same graph-level scale but occupy minimal space — subordinate to the graph itself while remaining immediately accessible.

---

## Decision

### 1 — Visual layout (one line, always)

```
┌─────────────────────────────────────────────────────┐
│  [Era ▾]   [Instrument ▾]   [ ✕ Clear ]             │
└─────────────────────────────────────────────────────┘
```

- The filter bar is a flex row, `flex-wrap: nowrap`, always single line on all viewports.
- `[Era ▾]` is a `<button class="filter-dropdown-btn" data-group="era">`.
- `[Instrument ▾]` is a `<button class="filter-dropdown-btn" data-group="instrument">`.
- `[ ✕ Clear ]` appears only when `activeFilters.era.size + activeFilters.instrument.size > 0`.
- When filters are active the button label shows a parenthetical count: `Era (2) ▾`, `Instrument (1) ▾`.

### 2 — HTML structure (before / after)

**BEFORE**
```html
<div id="filter-bar">
  <div class="filter-group" id="era-filter-group"   data-group="era"></div>
  <div class="filter-separator"></div>
  <div class="filter-group" id="instr-filter-group" data-group="instrument"></div>
  <button class="filter-clear" id="filter-clear-all"
          style="visibility:hidden" title="Clear all filters"
          onclick="clearAllChipFilters()">✕ Show all</button>
</div>
```

**AFTER**
```html
<div id="filter-bar">
  <div class="filter-dropdown-wrap" id="era-dropdown-wrap" data-group="era">
    <button class="filter-dropdown-btn" id="era-dropdown-btn"
            data-group="era" aria-haspopup="listbox" aria-expanded="false">
      Era <span class="filter-count"></span><span class="filter-arrow">▾</span>
    </button>
    <ul class="filter-dropdown-list" id="era-dropdown-list" role="listbox"
        aria-multiselectable="true" aria-label="Filter by era" hidden></ul>
  </div>

  <div class="filter-dropdown-wrap" id="instr-dropdown-wrap" data-group="instrument">
    <button class="filter-dropdown-btn" id="instr-dropdown-btn"
            data-group="instrument" aria-haspopup="listbox" aria-expanded="false">
      Instrument <span class="filter-count"></span><span class="filter-arrow">▾</span>
    </button>
    <ul class="filter-dropdown-list" id="instr-dropdown-list" role="listbox"
        aria-multiselectable="true" aria-label="Filter by instrument" hidden></ul>
  </div>

  <button class="filter-clear" id="filter-clear-all"
          hidden title="Clear all filters">✕ Clear</button>
</div>
```

### 3 — Dropdown list item structure

Each `<li>` in the dropdown list:

```html
<li class="filter-dropdown-item" role="option"
    data-key="trinity" data-group="era" aria-selected="false">
  <span class="chip-dot ellipse" style="background: #f5a623;"></span>
  <span class="filter-item-label">Trinity</span>
  <span class="filter-checkmark" aria-hidden="true">✓</span>
</li>
```

- The coloured `chip-dot` / `chip-icon` is preserved — era colour signal is intact.
- `✓` checkmark is styled `opacity: 0` by default, `opacity: 1` when `aria-selected="true"`.
- Clicking a list item toggles `aria-selected` and the backing `activeFilters` Set, then calls `applyChipFilters()`.

### 4 — Dropdown open/close behaviour

- Clicking a `filter-dropdown-btn` toggles the corresponding `filter-dropdown-list` (`hidden` attribute on/off) and updates `aria-expanded`.
- Clicking anywhere **outside** the open dropdown closes it (global `mousedown`/`touchstart` listener on `document`).
- Only one dropdown can be open at a time (opening one closes the other).
- The dropdown panel is positioned `absolute`, `top: 100%`, `left: 0` relative to its `.filter-dropdown-wrap` parent (which has `position: relative`). z-index above the graph canvas.

### 5 — Active-state feedback

- When `activeFilters[group].size > 0`: the corresponding button's `.filter-count` span shows `(N)` and the button gets class `filter-dropdown-btn--active`.
- When all filters cleared: both `.filter-count` spans are empty strings, the `--active` class is removed.
- The `#filter-clear-all` button is shown via `hidden` attribute toggling (not `visibility`).

### 6 — CSS sketch

```css
#filter-bar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
}

.filter-dropdown-wrap {
  position: relative;
}

.filter-dropdown-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--fg-dim);
  font-size: 0.72rem;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.12s, border-color 0.12s;
}
.filter-dropdown-btn--active {
  border-color: var(--accent);
  color: var(--accent);
}
.filter-count {
  font-weight: bold;
}
.filter-arrow {
  font-size: 0.65rem;
  margin-left: 2px;
}

.filter-dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 160px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 0;
  list-style: none;
  margin: 0;
  z-index: 200;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
}
.filter-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--fg-dim);
  transition: background 0.1s;
}
.filter-dropdown-item:hover { background: var(--bg-hover); }
.filter-dropdown-item[aria-selected="true"] { color: var(--fg); }
.filter-checkmark {
  margin-left: auto;
  opacity: 0;
  font-size: 0.8rem;
  color: var(--accent);
}
.filter-dropdown-item[aria-selected="true"] .filter-checkmark {
  opacity: 1;
}

.filter-clear {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  color: var(--fg-dim);
  font-size: 0.72rem;
  cursor: pointer;
}
.filter-clear:hover { color: var(--fg); border-color: var(--fg-dim); }
```

### 7 — JS changes (graph_view.js)

The existing functions `buildFilterChips()`, `toggleFilterChip()`, `applyChipFilters()`, `clearAllChipFilters()` are modified in place:

- `buildFilterChips()` → renamed `buildFilterDropdowns()` — builds the two `<ul>` lists instead of flat chips. Called once on init.
- `toggleFilterChip(chip)` → replaced by `toggleFilterItem(item)` — same Set logic, but toggles `aria-selected` on the `<li>` instead of `.active` class on a chip.
- `applyChipFilters()` — unchanged logic; only the "show/hide `#filter-clear-all`" line changes from `visibility` to `hidden` attribute.
- `clearAllChipFilters()` — unchanged graph-dim logic; additionally resets all `aria-selected="false"` on every list item, clears `.filter-count` spans, removes `--active` classes.

---

## Consequences

### Positive
- Filter bar is always a single line regardless of how many eras or instruments are defined.
- Adding new eras or instruments requires only adding to the source arrays in `buildFilterDropdowns()` — zero layout impact.
- Multi-select intention is now visually explicit (checkmarks).
- Active filter count badge gives at-a-glance awareness that the graph is filtered.
- Mobile viewports recover ~60–90 px of graph canvas.

### Negative / Trade-offs
- The dropdown panel occludes part of the graph when open — acceptable; the user opened it intentionally.
- Filter state is no longer visible at a glance without opening the dropdown — mitigated by the count badge on the button.

### Files to change (Carnatic Coder)
| File | Change |
|---|---|
| `carnatic/render/templates/base.html` | Replace `#filter-bar` HTML; replace `.filter-chip` CSS with `.filter-dropdown-*` CSS |
| `carnatic/render/templates/graph_view.js` | Replace `buildFilterChips()`, `toggleFilterChip()` with dropdown equivalents; update `clearAllChipFilters()` |

---

## Implementation notes for Carnatic Coder

1. `buildFilterDropdowns()` must be called after `graphData` is available (same timing as existing `buildFilterChips()` call).
2. The global `mousedown` listener for outside-click close should check `!wrap.contains(e.target)` before closing.
3. `aria-expanded` on the button must mirror the `hidden` state of the list — set both together.
4. The `filter-dropdown-list` should be appended to `filter-dropdown-wrap` (not `document.body`) so z-index stacking context is predictable.
5. On mobile the min-width of the dropdown list may need to be `max(160px, 90vw)` if the viewport is very narrow — check at 375 px.
