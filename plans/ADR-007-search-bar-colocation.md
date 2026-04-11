# ADR-007: Colocation of Search Bars with Their Semantic Panels

**Status:** Proposed  
**Date:** 2026-04-11  
**Supersedes:** ADR-002 (Dual Search Boxes — Musician Finder and Bani Flow Autocomplete)

---

## Context

ADR-002 placed both search bars in the `<header>` bar, reasoning that the header is
"always visible" and is "the correct architectural location for global navigation
controls." That reasoning was sound at the time — the sidebar was a single undivided
column and the Bani Flow panel had not yet been separated from the node-properties panel.

Since then, three structural changes have been implemented:

- **ADR-003** created a **left sidebar** dedicated to global graph controls (Bani Flow,
  Era legend, Instrument legend) and a **right sidebar** dedicated to node-specific
  information (selected musician, recordings, edge details).
- **ADR-004** enriched the Bani Flow trail with lifespan, era colour, instrument shape,
  and direct YouTube links — making it a **primary immersion surface**, not a secondary
  filter.
- **ADR-005** collapsed the right sidebar's "Selected" panel into a compact single-line
  header and unified all recordings into one panel — making the right sidebar a
  **recordings-first** surface.

The result is a three-column layout with clear semantic ownership:

```
┌──────────────────┬──────────────────────────────┬──────────────────────┐
│  LEFT SIDEBAR    │       GRAPH CANVAS            │   RIGHT SIDEBAR      │
│  (Global state)  │       (Cytoscape)             │   (Selection state)  │
│                  │                               │                      │
│  Bani Flow ♩     │                               │  ● Musician  1918–73 │
│  [trail…]        │                               │  [Filter recs…]      │
│                  │                               │  Recordings          │
│  Era legend      │                               │  [list…]             │
│  Instrument leg. │                               │                      │
└──────────────────┴──────────────────────────────┴──────────────────────┘
```

In this layout, the two search bars in the `<header>` are **spatially dislocated** from
the panels they control:

- The **musician search** (`🔍 Search musician…`) triggers `selectNode()`, which
  populates the **right sidebar**. But the search bar sits in the header, far from the
  right sidebar.
- The **bani flow search** (`♩ Search composition / raga…`) triggers
  `applyBaniFilter()`, which populates the **left sidebar** Bani Flow trail. But the
  search bar also sits in the header, far from the left sidebar.

The rasika must look at the header to initiate a search, then look at a sidebar to see
the result. The action and its consequence are spatially separated. This is a
**Boundaries** failure: the boundary between "where I search" and "where I see results"
is too wide.

### Forces in tension

| Force | Pressure |
|---|---|
| **Colocation** | The search input and its results panel should be in the same spatial region. The rasika's eye should not travel across the screen between action and consequence. |
| **Immersion** | The rasika must be able to enter the tradition immediately. A search bar that is far from its results breaks the flow of exploration. |
| **Scalability without fragmentation** | The header is already occupied by the title, stats, and five control buttons. Adding two search bars makes it crowded. On narrow viewports it wraps awkwardly. |
| **Strong Centres** | The left sidebar is a strong centre for global graph state. The right sidebar is a strong centre for selection state. Each search bar belongs to one of these centres, not to the header. |
| **Discoverability** | The search bars must be visible without scrolling. Both sidebars are always visible (no scroll required to reach their tops). |
| **Header cleanliness** | The header should carry only identity (title, stats) and graph-level controls (Fit, Reset, Relayout, Labels, Timeline). Search is not a graph-level control — it is a panel-level entry point. |

---

## Pattern

**Colocation** (Alexander's *Intimacy Gradient*, Pattern 127, and *Things That Belong
Together*, Pattern 8): elements that are functionally coupled must be spatially adjacent.
The search input and its results panel are functionally coupled — one produces the other.
They must share the same spatial region.

**Strong Centres** (Pattern 1): the left sidebar and right sidebar are already strong
centres with clear semantic ownership. Placing each search bar inside its owning centre
reinforces that centre's identity. The header is not a centre for either search — it is
a navigation bar, not a results surface.

**Levels of Scale** (Pattern 5): the header operates at the graph level (global
controls). The sidebars operate at the panel level (Bani Flow state, selection state).
Search is a panel-level operation. It belongs at the panel level, not the graph level.

**Boundaries** (Pattern 13): a boundary must be clear and strong where two centres of
different character meet. The boundary between "search entry" and "search results" must
be minimal — ideally zero. Placing the search bar at the top of its results panel
achieves this: the boundary collapses to a single visual unit.

---

## Decision

### Move each search bar to the top of its owning panel.

**Musician search** → top of the **right sidebar**, above the node header.  
**Bani flow search** → top of the **Bani Flow panel** in the **left sidebar**, replacing
the now-absent `<select>` dropdowns (already removed by ADR-002).

The header loses the `.search-group` div entirely. The header returns to its original
role: identity + graph-level controls.

---

### Before / After HTML shape

#### Before (current state — [`carnatic/render.py:727–749`](carnatic/render.py:727))

```html
<header>
  <h1>Carnatic · Guru-Shishya Parampara</h1>
  <span class="stats">{node_count} musicians · {edge_count} lineage edges</span>
  <div class="search-group">                          <!-- ← REMOVE -->
    <div class="search-wrap" id="musician-search-wrap">
      <input id="musician-search-input" …>
      <div id="musician-search-dropdown" …></div>
    </div>
    <div class="search-wrap" id="bani-search-wrap">
      <input id="bani-search-input" …>
      <div id="bani-search-dropdown" …></div>
    </div>
  </div>                                              <!-- ← REMOVE -->
  <div class="controls">…</div>
</header>

<div id="main">
  <div id="left-sidebar">
    <div class="panel" id="bani-flow-panel">
      <h3>Bani Flow &#9835;</h3>
      <!-- no search bar here currently -->
      <button id="bani-clear" …>&#10005; Clear filter</button>
      <div id="listening-trail">…</div>
    </div>
    …
  </div>

  <div id="right-sidebar">
    <div id="node-info">
      <!-- no search bar here currently -->
      <div id="node-header">…</div>
      <input id="rec-filter" …>
    </div>
    …
  </div>
</div>
```

#### After (proposed state)

```html
<header>
  <h1>Carnatic · Guru-Shishya Parampara</h1>
  <span class="stats">{node_count} musicians · {edge_count} lineage edges</span>
  <!-- search-group GONE -->
  <div class="controls">…</div>
</header>

<div id="main">
  <div id="left-sidebar">
    <div class="panel" id="bani-flow-panel">
      <h3>Bani Flow &#9835;</h3>
      <!-- Bani search bar NOW HERE, at the top of its panel -->
      <div class="search-wrap" id="bani-search-wrap">
        <input id="bani-search-input" class="search-input panel-search" type="text"
               placeholder="&#9833; Search composition / raga&#8230;"
               autocomplete="off" spellcheck="false">
        <div id="bani-search-dropdown" class="search-dropdown" style="display:none"></div>
      </div>
      <button id="bani-clear" …>&#10005; Clear filter</button>
      <div id="listening-trail">…</div>
    </div>
    …
  </div>

  <div id="right-sidebar">
    <!-- Musician search bar NOW HERE, at the top of the right sidebar -->
    <div class="search-wrap panel-search-wrap" id="musician-search-wrap">
      <input id="musician-search-input" class="search-input panel-search" type="text"
             placeholder="&#128269; Search musician&#8230;"
             autocomplete="off" spellcheck="false">
      <div id="musician-search-dropdown" class="search-dropdown" style="display:none"></div>
    </div>

    <div id="node-info">
      <div id="node-header">…</div>
      <input id="rec-filter" …>
    </div>
    …
  </div>
</div>
```

---

### CSS changes

#### Remove

```css
/* ── dual search boxes ── */
.search-group {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
}
```

The `.search-group` rule is no longer needed — the two search wraps are now in separate
panels and do not need a shared flex container.

#### Add / modify

```css
/* ── panel-level search bars ── */
.panel-search-wrap {
  padding: 8px 14px 0;   /* matches .panel padding, sits flush above node-info */
  border-bottom: 1px solid var(--bg2);
}

.panel-search {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg2); color: var(--fg2); border: 1px solid var(--bg3);
  padding: 4px 8px; font-family: inherit; font-size: 0.72rem;
  border-radius: 2px;
}
.panel-search:focus { outline: none; border-color: var(--yellow); }
.panel-search::placeholder { color: var(--gray); font-style: italic; }
```

The existing `.search-wrap`, `.search-input`, `.search-dropdown`, `.search-result-item`,
`.search-result-item.active`, `.search-result-secondary` rules are **unchanged** — they
govern the dropdown appearance, which is the same regardless of where the input lives.

The bani search bar inside `.panel` already inherits the panel's `padding: 12px 14px`,
so no additional wrapper padding is needed there. The musician search bar sits *above*
`#node-info` (which has its own `padding: 8px 14px`), so it needs its own padding block
via `.panel-search-wrap`.

#### Dropdown z-index

The `.search-dropdown` is `position: absolute; z-index: 950`. This is sufficient for
both new positions:
- In the left sidebar: the dropdown overlaps the Bani Flow trail below it. `z-index:
  950` clears the trail content.
- In the right sidebar: the dropdown overlaps the node header and recordings list below
  it. `z-index: 950` clears both.

No z-index change required.

---

### JS changes

**None.** The JS for both search bars references elements by `id`
(`musician-search-input`, `musician-search-dropdown`, `bani-search-input`,
`bani-search-dropdown`). Moving the elements in the HTML does not change their `id`s.
The `makeDropdown`, `buildMusicianSearch`, and `buildBaniSearch` IIFEs are unchanged.

The `clearBaniFilter()` function already clears `#bani-search-input` by id — unchanged.

---

### Visual result

#### Left sidebar — Bani Flow panel (after)

```
┌─────────────────────────────┐
│ BANI FLOW ♩                 │
│ [♩ Search composition/raga] │  ← search bar at top of panel
│ [✕ Clear filter]            │
│                             │
│ 1867–1938  ◆ Vina Dhanammal │
│   Intha Chalamu    00:00 ↗  │
│ 1918–1973  ● Ramnad Krishnan│
│   abhimanamemnedu  1:02 ↗   │
│ …                           │
└─────────────────────────────┘
```

The rasika types in the search bar and sees results appear in the trail immediately
below. Action and consequence share the same visual container.

#### Right sidebar — top (after)

```
┌─────────────────────────────┐
│ [🔍 Search musician…      ] │  ← search bar at top of right sidebar
├─────────────────────────────┤
│ ●  T. Muktha  1914–2007  ↗  │  ← node header (compact, ADR-005)
│ [Filter recordings…       ] │
├─────────────────────────────┤
│ RECORDINGS                  │
│ …                           │
└─────────────────────────────┘
```

The rasika types a musician name and sees the node header update immediately below.
Action and consequence share the same visual container.

#### Header (after)

```
[Carnatic · Guru-Shishya Parampara]  [56 musicians · 42 edges]
                                     [Fit] [Reset] [Relayout] [Labels] [Timeline]
```

The header is clean. It carries only identity and graph-level controls. No search bars.

---

## Consequences

### What this enables

| Query | Before | After |
|---|---|---|
| "Find Ramnad Krishnan" | Type in header, look right for result | Type at top of right sidebar, see result immediately below |
| "Show Kalyani recordings" | Type in header, look left for trail | Type at top of Bani Flow panel, see trail immediately below |
| "What does the header do?" | Navigation + search (mixed concerns) | Navigation only (single concern) |
| "Where do I search for a musician?" | Header (non-obvious) | Top of right sidebar (adjacent to results) |
| "Where do I search for a raga?" | Header (non-obvious) | Top of Bani Flow panel (adjacent to trail) |

### What this forecloses

- **Global keyboard shortcut to focus search** — if the rasika wants to search without
  clicking, they must Tab to the correct sidebar. A header search bar is reachable with
  a single Tab from the page top. This is a minor cost: the graph is primarily a
  mouse/touch interface, and the sidebars are always visible.
  - *Mitigation:* Add `accesskey` attributes (`accesskey="m"` for musician search,
    `accesskey="b"` for bani search) so power users can focus either bar with a keyboard
    shortcut. This is a future enhancement, not a blocker.

- **Narrow viewport behaviour** — on screens < 900px wide, the sidebars may be hidden
  or collapsed. The search bars would then be inaccessible. This is already a known
  limitation of the three-column layout (noted in ADR-003).
  - *Mitigation:* The responsive design work deferred in ADR-003 covers this. When
    sidebars collapse on narrow screens, the search bars collapse with them — which is
    correct behaviour (the results panels are also hidden).

### What the Carnatic Coder must implement

All changes are confined to the HTML template string inside [`render_html()`](carnatic/render.py:342)
in [`carnatic/render.py`](carnatic/render.py).

**Edit 1 — Header HTML (lines 727–749):**  
Remove the entire `<div class="search-group">…</div>` block from `<header>`.

**Edit 2 — Left sidebar HTML (lines 754–762):**  
Inside `<div class="panel" id="bani-flow-panel">`, add the bani search wrap immediately
after the `<h3>Bani Flow &#9835;</h3>` heading and before the `<button id="bani-clear">`:

```html
<div class="search-wrap" id="bani-search-wrap">
  <input id="bani-search-input" class="search-input panel-search" type="text"
         placeholder="&#9833; Search composition / raga&#8230;"
         autocomplete="off" spellcheck="false">
  <div id="bani-search-dropdown" class="search-dropdown" style="display:none"></div>
</div>
```

**Edit 3 — Right sidebar HTML (lines 784–795):**  
Add the musician search wrap as the **first child** of `<div id="right-sidebar">`,
before `<div id="node-info">`:

```html
<div class="search-wrap panel-search-wrap" id="musician-search-wrap">
  <input id="musician-search-input" class="search-input panel-search" type="text"
         placeholder="&#128269; Search musician&#8230;"
         autocomplete="off" spellcheck="false">
  <div id="musician-search-dropdown" class="search-dropdown" style="display:none"></div>
</div>
```

**Edit 4 — CSS (lines 687–722):**  
Remove the `.search-group` rule block. Add the `.panel-search-wrap` and `.panel-search`
rules. Leave all other `.search-*` rules unchanged.

**No JS changes required.**

### What the Librarian must do

Nothing. No data changes required.

---

## Alternatives considered

### Alternative 1: Keep search bars in the header, add visual arrows pointing to results

Add a small animated indicator (e.g., a pulsing arrow) from the header search bar to
its results panel when results appear.

**Rejected.** This is a cosmetic patch on a structural problem. The spatial dislocation
remains. The rasika's eye still travels across the screen. Arrows add visual noise
without solving the colocation failure.

### Alternative 2: Move only the bani search bar; keep musician search in the header

The musician search is a "global" action (it navigates the graph), so it arguably
belongs in the header. The bani search is "panel-local" (it populates the left sidebar),
so it belongs in the panel.

**Rejected.** The musician search result is the right sidebar — which is not the header.
Both searches are panel-local in their consequences. The asymmetry of keeping one in the
header and moving the other to a panel would create a new inconsistency. Both must move.

### Alternative 3: Floating search overlay (command palette pattern)

A `Cmd+K` modal that searches across both musicians and compositions/ragas, with results
grouped by type.

**Rejected** (same reasoning as ADR-002 Alternative 3). The graph is a continuous
immersive experience. A modal interrupts it. The panel-level search bars are always
visible without requiring a keyboard shortcut to discover them.

### Alternative 4: Keep header search bars, make them visually connected to their panels

Use a coloured underline or border on each search bar that matches the colour of its
target panel (e.g., the bani search bar has a teal left border matching the Bani Flow
panel heading).

**Rejected.** Visual connection is not spatial connection. The rasika's eye still
travels. The colocation pattern requires physical adjacency, not visual signalling.

---

## Verification

After implementation, verify:

1. **Bani search bar is at the top of the Bani Flow panel** — visible without scrolling
   the left sidebar.
2. **Musician search bar is at the top of the right sidebar** — visible without
   scrolling, above the node header.
3. **Header contains no search bars** — only title, stats, and control buttons.
4. **Dropdown positioning is correct** — both dropdowns appear below their inputs,
   overlapping the panel content below them, not clipped by the panel boundary.
   - Verify: `overflow: visible` on the panel, or `overflow: hidden` removed from the
     sidebar container. The `.search-wrap` is `position: relative`; the dropdown is
     `position: absolute; top: 100%`. The sidebar must not clip it.
5. **Existing JS behaviour unchanged** — typing in either search bar produces the same
   results as before; selecting a result triggers the same action as before.
6. **`clearBaniFilter()` still clears the bani search input** — the input's `id` is
   unchanged, so the existing `document.getElementById('bani-search-input').value = ''`
   call works without modification.
7. **No console errors.**
8. **Narrow viewport** — on a 1200px-wide screen, both sidebars remain visible and both
   search bars are accessible.

---

## Implementation priority

**High.** This is a direct usability fix that serves the rasika's immersion. The current
header placement creates a spatial disconnect between search entry and search results.
The fix is architecturally clean: three HTML edits, one CSS edit, zero JS changes.

The fix also cleans up the header, which has been accumulating controls since the
project began. A clean header is a prerequisite for any future header additions
(e.g., a "Share graph" button, a "Download" button, or a timeline scrubber).
