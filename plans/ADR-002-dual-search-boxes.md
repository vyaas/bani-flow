# ADR-002: Dual Search Boxes — Musician Finder and Bani Flow Autocomplete

**Status:** Superseded by [ADR-007](ADR-007-search-bar-colocation.md)
**Date:** 2026-04-09
**Superseded:** 2026-04-11

---

## Context

The graph has grown to 56 musicians and 42 lineage edges (screenshot, 2026-04-09). At this scale, discoverability breaks down. A rasika who wants to find Ariyakudi Ramanuja Iyengar must already know he is in the graph and must visually scan a dense force-directed layout to locate him. A scholar who wants to filter by Kalyani must scroll a dropdown that will soon contain dozens of ragas.

Two distinct discovery problems exist:

1. **Musician discovery** — "I know the name; show me the node." The rasika wants to type a partial name and have the graph pan-and-select to that musician, lighting them up exactly as a manual click would.

2. **Bani Flow discovery** — "I want to hear Kaligiyunte; who has recorded it?" The rasika wants to type a partial composition or raga name and have the Bani Flow filter activate, highlighting all musicians who have transmitted that work.

Both problems share the same interaction pattern: **incremental narrowing as the user types**, with keyboard-navigable results, culminating in a single selection that triggers an existing graph action. This is precisely the TiddlyWiki search bar pattern — a floating, always-visible input that narrows a list of candidates in real time, with no page reload.

### Current state

- Musician selection: click-only. No text entry path.
- Bani Flow: two `<select>` dropdowns. Requires scrolling a full alphabetical list. No narrowing.
- Both controls live in the right sidebar, which is already dense.

### Forces in tension

| Force | Pressure |
|---|---|
| **Immersion** | The rasika must reach any musician or composition in ≤ 3 keystrokes. Scrolling a 50-item dropdown breaks immersion. |
| **Fidelity to the oral tradition** | The graph is a listening guide. The search must lead to sound, not just to a highlighted node. |
| **Scalability** | The graph will grow. A dropdown that works at 20 compositions fails at 200. The search box scales linearly. |
| **Queryability** | Every structural decision must support a concrete query. Both searches map to queries a rasika actually asks. |
| **No schema change** | All data needed for both searches already exists in the injected JS constants (`elements`, `compositions`, `ragas`). No new Python data structures are required. |
| **No render.py breakage** | The existing `applyBaniFilter()`, `clearBaniFilter()`, and node-tap logic must remain the canonical action handlers. The search boxes are **input surfaces only** — they call existing functions. |

---

## Pattern

**Strong Centres** (Alexander): each search box is a distinct, bounded centre of interaction. The musician search is centred on the parampara graph; the bani flow search is centred on the listening trail. They must not be merged into one box — their result types are different (a node selection vs. a filter activation), and merging them would produce an ambiguous, weaker centre.

**Levels of Scale**: the search operates at the label level (text), which resolves to the node level (graph), which resolves to the recording level (audio). The three levels must remain connected: selecting a musician via search must show their sidebar panel and recordings, exactly as a tap does.

**Boundaries**: the search results dropdown is a temporary boundary — it appears on input, disappears on selection or blur. It must not persist as a permanent UI element that competes with the graph canvas.

**Gradients**: results narrow as the user types. The gradient from "many candidates" to "one selection" is the core interaction. Fuzzy matching (substring, case-insensitive) is the right gradient function here — not prefix-only, not Levenshtein distance. Substring matching is what TiddlyWiki uses and what a rasika expects: typing "krishn" should surface Ramnad Krishnan, TN Krishnan, and GN Balasubramaniam (whose full name contains "krishna" in the Wikipedia article, though not in the label — so label-only substring is correct).

---

## Decision

### Two new search inputs, placed in the header bar

The header currently contains: title · stats · [Fit] [Reset] [Relayout] [Labels] [Timeline].

Add two search inputs to the header, between the stats and the controls:

```
[Carnatic · Guru-Shishya Parampara]  [56 musicians · 42 edges]
  [🔍 Search musician…]  [♩ Search composition / raga…]
                                        [Fit] [Reset] [Relayout] [Labels] [Timeline]
```

The header already uses `display: flex; align-items: center; gap: 18px; flex-wrap: wrap;` — the two inputs slot in naturally without layout surgery.

**Why the header, not the sidebar?**

The sidebar is already at capacity. More critically: the search must be reachable *before* the user has selected anything — it is a navigation entry point, not a detail panel. The header is always visible, always accessible, and is the correct architectural location for global navigation controls. TiddlyWiki places its search in the sidebar because TiddlyWiki has no canvas; we have a canvas, and the header is the correct analogue.

---

### Search Box 1: Musician Finder

**Input:** free text, placeholder `Search musician…`  
**Data source:** `elements` array (already injected), filtered to nodes only  
**Match field:** `data.label` — substring, case-insensitive  
**Result display:** floating dropdown below the input, max 8 results, each showing:
- Musician name (bold, era colour)
- Lifespan · instrument · bani (secondary line, muted)

**On result selection:**
1. Close the dropdown
2. Clear the input
3. Call `cy.getElementById(nodeId).emit('tap')` — this fires the existing `cy.on('tap', 'node', ...)` handler, which populates the sidebar, highlights the neighbourhood, and shows recordings. **No new action logic.**
4. Pan and zoom to centre the selected node: `cy.animate({ fit: { eles: cy.getElementById(nodeId), padding: 120 }, duration: 400 })`

**Keyboard behaviour:**
- `↓` / `↑` — navigate results
- `Enter` — select highlighted result
- `Escape` — close dropdown, clear input

**Edge cases:**
- No results: show `no match` in the dropdown (single disabled item)
- Single result: auto-select on `Enter` without requiring arrow navigation
- Input cleared: close dropdown

**CSS class:** `.musician-search-wrap`, `.musician-search-input`, `.search-dropdown`, `.search-result-item`, `.search-result-item.active`

---

### Search Box 2: Bani Flow Finder

**Input:** free text, placeholder `Search composition / raga…`  
**Data source:** `compositions` and `ragas` arrays (already injected)  
**Match field:** `title` (compositions) and `name` (ragas) — substring, case-insensitive  
**Result display:** floating dropdown below the input, max 10 results, grouped:
- Compositions first (prefixed with `♩ `)
- Ragas second (prefixed with `◈ `)
- Only entries that have at least one matched node OR performance are shown (same filter as the existing dropdown population logic at [`render.py:1318`](carnatic/render.py:1318))

**On result selection:**
1. Close the dropdown
2. Set the input text to the selected item's name (so the rasika can see what is active)
3. Call `applyBaniFilter(type, id)` — the existing function. **No new action logic.**
4. Show the "× Clear filter" button (already handled inside `applyBaniFilter`)

**On clear (× button or Escape with dropdown closed):**
1. Call `clearBaniFilter()` — the existing function
2. Clear the input text

**Keyboard behaviour:** same as Musician Finder.

**CSS class:** `.bani-search-wrap`, `.bani-search-input`, `.search-result-item.comp`, `.search-result-item.raga`

---

### Retire the existing `<select>` dropdowns

The two `<select>` elements (`#bani-comp-select`, `#bani-raga-select`) in the Bani Flow panel are replaced by the new search box. They are **removed** from the HTML. The `change` event listeners on them are removed. The `clearBaniFilter()` function already resets them by value — that line must be updated to clear the new input instead.

The Bani Flow panel retains:
- The `<h3>Bani Flow ♩</h3>` heading
- The `#bani-clear` button
- The `#listening-trail` div

The panel loses:
- `#bani-comp-select`
- `#bani-raga-select`

---

### Shared dropdown component

Both search boxes use the same CSS class structure for their result dropdowns. A single shared CSS block covers both. The JS is two independent instances (not a shared factory) because their data sources and action handlers differ — sharing a factory would add indirection without adding life.

**Dropdown positioning:** `position: absolute` relative to the header, `top: 100%` of the input wrapper, `z-index: 950` (above the graph canvas at z=0, below media players at z=800+). Width matches the input.

**Dropdown appearance:**
```
background: var(--bg1)
border: 1px solid var(--bg3)
border-radius: 0 0 3px 3px
box-shadow: 0 6px 20px rgba(0,0,0,0.5)
max-height: 280px
overflow-y: auto
```

**Result item appearance:**
```
padding: 6px 10px
cursor: pointer
border-bottom: 1px solid var(--bg2)
font-size: 0.78rem
```

**Active (keyboard-highlighted) item:**
```
background: var(--bg2)
color: var(--yellow)
```

---

## Before / After JSON shape

No data schema changes. This ADR touches only [`carnatic/render.py`](carnatic/render.py) — specifically the HTML template string inside `render_html()`.

**Before (Bani Flow panel HTML):**
```html
<div class="panel" id="bani-flow-panel">
  <h3>Bani Flow &#9835;</h3>
  <select id="bani-comp-select">
    <option value="">&#8212; Filter by Composition &#8212;</option>
  </select>
  <select id="bani-raga-select">
    <option value="">&#8212; Filter by Raga &#8212;</option>
  </select>
  <button id="bani-clear" onclick="clearBaniFilter()">&#10005; Clear filter</button>
  <div id="listening-trail">...</div>
</div>
```

**After (Bani Flow panel HTML):**
```html
<div class="panel" id="bani-flow-panel">
  <h3>Bani Flow &#9835;</h3>
  <button id="bani-clear" onclick="clearBaniFilter()">&#10005; Clear filter</button>
  <div id="listening-trail">...</div>
</div>
```

**Before (header HTML):**
```html
<header>
  <h1>Carnatic · Guru-Shishya Parampara</h1>
  <span class="stats">56 musicians · 42 lineage edges</span>
  <div class="controls">
    <button onclick="cy.fit()">Fit</button>
    ...
  </div>
</header>
```

**After (header HTML):**
```html
<header>
  <h1>Carnatic · Guru-Shishya Parampara</h1>
  <span class="stats">56 musicians · 42 lineage edges</span>
  <div class="search-group">
    <div class="search-wrap" id="musician-search-wrap">
      <input id="musician-search-input" class="search-input"
             type="text" placeholder="&#128269; Search musician…"
             autocomplete="off" spellcheck="false">
      <div id="musician-search-dropdown" class="search-dropdown" style="display:none"></div>
    </div>
    <div class="search-wrap" id="bani-search-wrap">
      <input id="bani-search-input" class="search-input"
             type="text" placeholder="&#9833; Search composition / raga…"
             autocomplete="off" spellcheck="false">
      <div id="bani-search-dropdown" class="search-dropdown" style="display:none"></div>
    </div>
  </div>
  <div class="controls">
    <button onclick="cy.fit()">Fit</button>
    ...
  </div>
</header>
```

---

## Consequences

### What queries this enables

| Query | Before | After |
|---|---|---|
| "Find Ariyakudi Ramanuja Iyengar" | Visual scan of 56 nodes | Type "ariy" → 1 result → click → node selected |
| "Who has recorded Kaligiyunte?" | Scroll dropdown to K | Type "kalig" → 1 result → click → Bani Flow activates |
| "Show me all Bhairavi recordings" | Scroll dropdown to B | Type "bhair" → 2 results (Bhairavi, Sindhu Bhairavi) → select |
| "Find GN Balasubramaniam" | Visual scan | Type "gnb" → 0 results; type "bala" → 1 result |

### What this costs

- **Complexity:** ~120 lines of new JS (two search instances + shared dropdown CSS). No new Python. No new data structures.
- **Migration effort:** Remove two `<select>` elements and their `change` listeners. Update `clearBaniFilter()` to clear `#bani-search-input` instead of resetting select values. Low risk.
- **No render.py Python changes** beyond the HTML template string.

### How this serves the rasika's immersion

The rasika arrives at the graph with a musician's name in mind — perhaps they just heard a concert, or read a liner note. The search box lets them enter the tradition immediately, without first learning the graph's visual layout. Once the node is selected, the existing sidebar, recordings panel, and neighbourhood highlighting take over. The search is a **door**, not a room.

The bani flow search serves the scholar who is tracing a composition's transmission. Typing the composition name is faster and more precise than scrolling a dropdown. The result is the same `applyBaniFilter()` call — the listening trail appears, the teal borders light up, and the rasika can follow the sound through the lineage.

### What the Carnatic Coder must implement

All changes are confined to the HTML template string inside [`render_html()`](carnatic/render.py:342) in [`carnatic/render.py`](carnatic/render.py).

1. **CSS additions** (inside the `<style>` block):
   - `.search-group` — flex container in the header for the two search wraps
   - `.search-wrap` — `position: relative` wrapper for input + dropdown
   - `.search-input` — styled text input (matches existing button aesthetic)
   - `.search-dropdown` — absolute-positioned result list
   - `.search-result-item` — individual result row
   - `.search-result-item.active` — keyboard-highlighted state
   - `.search-result-secondary` — secondary line (lifespan · instrument · bani)

2. **HTML changes**:
   - Add `.search-group` div to `<header>` between `.stats` and `.controls`
   - Remove `#bani-comp-select` and `#bani-raga-select` from `#bani-flow-panel`

3. **JS additions** (after the existing Bani Flow section):
   - `buildMusicianSearch()` — wires `#musician-search-input` to a filtered list of node labels; on selection calls `cy.getElementById(id).emit('tap')` then animates to the node
   - `buildBaniSearch()` — wires `#bani-search-input` to a filtered list of compositions + ragas; on selection calls `applyBaniFilter(type, id)`
   - Shared `makeDropdown(inputEl, dropdownEl, getItems, onSelect)` helper — handles keystroke filtering, keyboard navigation, blur-to-close

4. **JS removals**:
   - The two `document.getElementById('bani-comp-select').addEventListener('change', ...)` blocks
   - The two `document.getElementById('bani-raga-select').addEventListener('change', ...)` blocks
   - The IIFE that populates the `<select>` options (lines 1318–1349 of current render.py)

5. **JS modification**:
   - `clearBaniFilter()`: replace `document.getElementById('bani-comp-select').value = ''` and `document.getElementById('bani-raga-select').value = ''` with `document.getElementById('bani-search-input').value = ''`

### What the Librarian must do

Nothing. No data changes required.

---

## Alternatives considered

### Alternative 1: Enhance the existing `<select>` dropdowns with a datalist

Use `<input list="...">` with `<datalist>` elements. Rejected because:
- Browser `<datalist>` UI is inconsistent across platforms and cannot be styled to match the Gruvbox aesthetic.
- `<datalist>` does not support grouped results (compositions vs. ragas).
- `<datalist>` does not support secondary lines (lifespan, instrument).
- The TiddlyWiki pattern the user explicitly requested is a custom dropdown, not a datalist.

### Alternative 2: Single unified search box for both musicians and bani flow

One input that searches across all entity types. Rejected because:
- The result types are fundamentally different: a musician selection triggers neighbourhood highlighting and sidebar population; a bani flow selection triggers the filter and listening trail. Mixing them in one result list creates ambiguity.
- Alexander's **Strong Centres** principle: two distinct centres (musician graph, listening trail) require two distinct entry points. A unified search weakens both.
- The user explicitly requested two separate boxes.

### Alternative 3: Move search to a modal overlay (command palette pattern)

A `Cmd+K` style modal. Rejected because:
- The graph is a continuous immersive experience. A modal interrupts it.
- The header placement keeps the search always visible without requiring a keyboard shortcut to discover it.
- The rasika may be using a tablet or touch device where keyboard shortcuts are unavailable.

### Alternative 4: Fuzzy matching (Levenshtein / trigram)

Use a fuzzy matching library (Fuse.js) for typo-tolerance. Deferred, not rejected:
- Substring matching is sufficient for the current dataset size (56 musicians, ~30 compositions).
- Fuse.js would require adding a CDN dependency or bundling.
- If the dataset grows to 200+ musicians, revisit. The `makeDropdown` helper's `getItems` function is the only place that needs to change — the architecture supports upgrading the match function without touching the UI.

---

## Verification

After implementation, verify:

1. Typing "krishn" in the musician search shows Ramnad Krishnan and TN Krishnan (and any other label containing "krishn").
2. Selecting Ramnad Krishnan from the dropdown: node is selected, sidebar shows his name and recordings, neighbourhood is highlighted, graph pans to him.
3. Typing "kalig" in the bani search shows "Kaligiyunte" (composition).
4. Selecting Kaligiyunte: `applyBaniFilter('comp', 'kaligiyunte')` fires, teal borders appear, listening trail populates.
5. Pressing `×  Clear filter`: `clearBaniFilter()` fires, bani search input is cleared, teal borders removed.
6. Pressing `Escape` in either input: dropdown closes, input cleared.
7. The existing `<select>` dropdowns are gone from the DOM.
8. No console errors.
9. The header wraps gracefully on narrow viewports (`flex-wrap: wrap` is already set).
