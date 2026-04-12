# `carnatic/render/` — Render Package

This package is the rendering pipeline for the Carnatic guru-shishya knowledge
graph. It was extracted from a 3,634-line monolithic `graph.html` generator
during the render-refactor (Phases 1–3). Each module has a single
responsibility; together they form a pure data-in → HTML-out pipeline.

---

## Directory structure

```
carnatic/render/
├── __init__.py             # Public API re-exports (all symbols below)
├── data_loaders.py         # Pure I/O: yt_video_id, timestamp_to_seconds,
│                           #   load_compositions, load_recordings
├── data_transforms.py      # Denormalisation: build_recording_lookups,
│                           #   build_composition_lookups
├── graph_builder.py        # Visual constants + build_elements()
│                           #   ERA_COLORS, ERA_LABELS, INSTRUMENT_SHAPES,
│                           #   NODE_SIZES, ERA_FONT_SIZES
├── html_generator.py       # render_html() — loads templates, injects data,
│                           #   returns complete HTML string (~92 lines)
├── sync.py                 # sync_graph_json() — keeps graph.json current
│                           #   from musicians.json + compositions.json +
│                           #   recordings/ before each render (ADR-016)
└── templates/
    ├── base.html           # HTML skeleton, all CSS, body structure;
    │                       #   <!-- INJECT_SCRIPTS --> placeholder
    ├── graph_view.js       # Cytoscape init, chip filters, zoom labels,
    │                       #   hover popover, selectNode, tap handlers, controls
    ├── media_player.js     # YouTube player manager, concert bracket (ADR-018),
    │                       #   buildRecordingsList
    ├── timeline_view.js    # Timeline layout algorithm + decade ruler SVG
    ├── raga_wheel.js       # Three-view selector (ADR-023) + raga wheel SVG
    ├── bani_flow.js        # Bani Flow filter, listening trail, buildTrailItem,
    │                       #   buildArtistSpan
    └── search.js           # Shared dropdown helper, musician search,
                            #   bani flow search
```

**Entry point:** `carnatic/render.py` (84 lines) — the orchestrator that calls
each module in sequence and writes `carnatic/graph.html`.

---

## How to run

From the project root:

```bash
python3 carnatic/render.py
```

Output:

```
[SYNC] graph.json ← musicians.json + compositions.json + recordings/
[LOAD] graph.json  (N nodes, E edges, R recordings)
[RENDERED] carnatic/graph.html  (N nodes, E edges)
```

---

## Data flow

```
carnatic/render.py  (orchestrator)
  │
  ├─ sync.py
  │    sync_graph_json(graph.json, musicians.json, compositions.json)
  │    → writes graph.json atomically (temp file + os.replace)
  │
  ├─ data_loaders.py  (via CarnaticGraph / legacy fallback)
  │    load_compositions(compositions.json)
  │    load_recordings(recordings/, recordings.json)
  │    → plain Python dicts
  │
  ├─ data_transforms.py
  │    build_composition_lookups(graph, comp_data, recordings_data)
  │    → composition_to_nodes, raga_to_nodes
  │    build_recording_lookups(recordings_data, comp_data)
  │    → musician_to_performances, composition_to_performances,
  │      raga_to_performances
  │
  ├─ graph_builder.py
  │    build_elements(graph)
  │    → Cytoscape.js element list (nodes + edges as dicts)
  │
  └─ html_generator.py
       render_html(elements, graph, comp_data, …lookups…)
       │
       ├─ templates/base.html        → HTML skeleton + CSS
       ├─ templates/graph_view.js    → Cytoscape graph logic
       ├─ templates/media_player.js  → YouTube player + concert brackets
       ├─ templates/timeline_view.js → Timeline layout + ruler
       ├─ templates/raga_wheel.js    → Raga wheel SVG
       ├─ templates/bani_flow.js     → Bani Flow panel
       └─ templates/search.js        → Search dropdowns
       → complete HTML string → written to carnatic/graph.html
```

**Source files (read-only for this pipeline):**

| File | Role |
|---|---|
| `carnatic/data/graph.json` | Single source of truth (ADR-013, ADR-016) |
| `carnatic/data/musicians.json` | Musician nodes + edges (Librarian's domain) |
| `carnatic/data/compositions.json` | Ragas, composers, compositions |
| `carnatic/data/recordings/*.json` | One recording object per file |

---

## Module reference

### `data_loaders.py`

Pure I/O functions. All accept explicit `Path` parameters — no module-level
globals, fully testable.

| Function | Signature | Description |
|---|---|---|
| `yt_video_id` | `(url: str) -> str \| None` | Extract 11-char YouTube video ID from any YouTube URL form |
| `timestamp_to_seconds` | `(ts: str) -> int` | Convert `'MM:SS'` or `'HH:MM:SS'` to integer seconds |
| `load_compositions` | `(compositions_file: Path) -> dict` | Load `compositions.json`; return empty structure if absent |
| `load_recordings` | `(recordings_dir: Path, recordings_file: Path) -> dict` | Load recordings from `recordings/` dir (one `.json` per recording); falls back to legacy monolithic file |

`load_recordings` skips files whose names start with `_` (e.g. `_index.json`)
and sorts alphabetically for a deterministic compile order.

---

### `data_transforms.py`

Denormalisation layer. Builds lookup dicts that the JS templates consume as
injected globals.

#### `build_recording_lookups(recordings_data, comp_data) -> tuple[dict, dict, dict]`

Iterates every `session → performance` in every recording and builds three
inverted indexes:

| Return value | Key | Value |
|---|---|---|
| `musician_to_performances` | `musician_id` | `[PerformanceRef, …]` |
| `composition_to_performances` | `composition_id` | `[PerformanceRef, …]` |
| `raga_to_performances` | `raga_id` | `[PerformanceRef, …]` |

Each `PerformanceRef` is a flat dict carrying `recording_id`, `video_id`,
`title`, `short_title`, `date`, `session_index`, `performance_index`,
`timestamp`, `offset_seconds`, `display_title`, `composition_id`, `raga_id`,
`tala`, `composer_id`, `notes`, `type`, and `performers`.

`raga_id` is inferred from `composition_id` via `compositions.json` when not
set directly on the performance.

#### `build_composition_lookups(graph, comp_data, recordings_data) -> tuple[dict, dict]`

Builds two lookup dicts mapping compositions/ragas → musician node IDs:

| Return value | Key | Value |
|---|---|---|
| `composition_to_nodes` | `composition_id` | `[node_id, …]` |
| `raga_to_nodes` | `raga_id` | `[node_id, …]` |

Indexes two sources and merges them (duplicates suppressed):
1. **Legacy schema** — `youtube[]` entries embedded in `musicians.json` nodes
2. **Structured schema** — `performers[]` inside `recordings/*.json` sessions

---

### `graph_builder.py`

Visual constants and Cytoscape element construction.

**Constants** (also re-exported to JS as globals via `html_generator.py`):

| Constant | Type | Purpose |
|---|---|---|
| `ERA_COLORS` | `dict[str, str]` | Hex colour per era (Gruvbox palette) |
| `ERA_LABELS` | `dict[str, str]` | Human-readable era name |
| `INSTRUMENT_SHAPES` | `dict[str, str]` | Cytoscape node shape per instrument |
| `NODE_SIZES` | `dict[str, int]` | Base node size (px) per era |
| `ERA_FONT_SIZES` | `dict[str, int]` | Base label font size (graph-space px) per era |

#### `build_elements(graph) -> list[dict]`

Converts `graph["nodes"]` and `graph["edges"]` into a flat Cytoscape.js
element list. For each node it computes:

- `color`, `shape`, `size` from era/instrument/degree
- `font_size`, `font_weight`, `label_tier` for zoom-tiered word-cloud labels
- `tracks` — list of `{vid, label, composition_id, raga_id, year}` from
  `youtube[]` entries (legacy schema)
- `sources` — normalised from `sources[]` array or legacy `wikipedia` field
- `lifespan` — formatted from `born`/`died`

Node size scales with graph degree: `base + int((deg / max_degree) * 28)`.
Font size scales similarly: `base_font + int((deg / max_degree) * 5)`.

---

### `html_generator.py`

Assembles the final `graph.html` string from templates and injected data.

#### `render_html(elements, graph, comp_data, composition_to_nodes, raga_to_nodes, recordings_data, musician_to_performances, composition_to_performances, raga_to_performances) -> str`

1. Substitutes `{node_count}` and `{edge_count}` in `base.html` via
   `str.replace()`.
2. Serialises all lookup tables to JSON and builds a Python f-string data
   block (see [Template injection](#template-injection) below).
3. Concatenates: `<script>` + data block + 6 `.js` files + `</script>`.
4. Replaces `<!-- INJECT_SCRIPTS -->` in `base.html` with the assembled
   script block.
5. Returns the complete HTML string (caller writes it to disk).

---

### `sync.py`

#### `sync_graph_json(graph_file, musicians_file, compositions_file) -> None`

Keeps `graph.json` current before each render (ADR-016). Idempotent — safe to
call on every `render.py` invocation.

- Copies `musicians.json` → `graph.json["musicians"]`
- Copies `compositions.json` → `graph.json["compositions"]`
- Rebuilds `graph.json["recording_refs"]` from `recordings/*.json` (each ref
  carries `id`, `path`, `title`, `short_title`, `date`, `venue`,
  `primary_musician_ids`)
- Writes atomically via `tempfile.NamedTemporaryFile` + `os.replace`

Adding a new `recordings/*.json` file is automatically picked up on the next
`render.py` run — no manual `graph.json` edit required.

---

## Template reference

All templates are plain JavaScript files loaded verbatim by
`html_generator.py`. They share a single `<script>` scope and can reference
any global defined earlier in the concatenation order.

### `base.html`

HTML skeleton, all CSS (Gruvbox dark theme), and body structure. Contains the
`<!-- INJECT_SCRIPTS -->` placeholder where the assembled `<script>` block is
injected. Placeholders `{node_count}` and `{edge_count}` are substituted by
`render_html()`.

**Defines:** DOM structure — `#cy` (Cytoscape canvas), `#left-sidebar`,
`#right-sidebar`, `#filter-bar`, `#timeline-ruler`, `#raga-wheel-container`,
`#bani-flow-panel`, `#hover-popover`, `#search-input`, `#bani-search-input`.

---

### `graph_view.js`

Cytoscape.js initialisation and all graph interaction logic.

| Symbol | Kind | Description |
|---|---|---|
| `CAKRA_NAMES` | `const` | Melakarta cakra name lookup |
| `cy` | `const` | Cytoscape instance |
| `ERA_COLOURS` | `const` | Mirror of Python `ERA_COLORS` (for chip injection) |
| `INSTRUMENT_SHAPES` | `const` | Mirror of Python constant |
| `activeFilters` | `const` | `{ era: Set, instrument: Set }` — chip filter state |
| `buildFilterChips()` | function | Injects era + instrument filter chips into `#filter-bar` |
| `toggleFilterChip(chip)` | function | Toggle a single chip on/off |
| `applyChipFilters()` | function | Show/hide nodes based on active filter sets |
| `clearAllChipFilters()` | function | Reset all chips to inactive |
| `setScopeLabels(visible)` | function | Show/hide scope labels on edges |
| `applyZoomLabels()` | function | Zoom-tiered label visibility (word-cloud style) |
| `selectNode(node)` | function | Shared selection logic — populates sidebar, highlights neighbourhood |
| `toggleLabels()` | function | Toggle label visibility |
| `relayout()` | function | Re-run Cytoscape layout |

Also wires: hover popover, `rec-filter` event listener (bracket-aware,
ADR-018), trail-filter event listener, node tap, edge tap, background tap.

---

### `media_player.js`

Floating YouTube player manager and concert bracket UI (ADR-018).

| Symbol | Kind | Description |
|---|---|---|
| `playerRegistry` | `Map` | `vid → player DOM element` |
| `ytEmbedUrl(vid, startSeconds)` | function | Build YouTube embed URL with autoplay + start |
| `ytDirectUrl(vid, startSeconds)` | function | Build direct `youtu.be` URL |
| `formatTimestamp(seconds)` | function | Format integer seconds as `MM:SS` or `H:MM:SS` |
| `nextSpawnPosition()` | function | Cascade spawn position for new player windows |
| `bringToFront(player)` | function | Raise a player's z-index above all others |
| `refreshPlayingIndicators()` | function | Sync ▶ indicators across all open players |
| `wireDrag(el, bar)` | function | Make a player draggable by its title bar |
| `wireResize(el, handle)` | function | Make a player resizable via corner handle |
| `createPlayer(vid, label, artistName, startSeconds)` | function | Create and mount a floating player DOM element |
| `openOrFocusPlayer(vid, label, artistName, startSeconds)` | function | Open a new player or focus existing one for same `vid` |
| `toggleConcert(headerEl)` | function | Expand/collapse a concert bracket (ADR-018) |
| `buildConcertBracket(concert, nodeId, artistLabel)` | function | Build one concert bracket DOM element |
| `buildRecordingsList(nodeId, nodeData)` | function | Build concert-bracketed + legacy flat recordings list for sidebar |

---

### `timeline_view.js`

Timeline layout algorithm and decade ruler SVG.

| Symbol | Kind | Description |
|---|---|---|
| `TIMELINE_X_MIN` | `const` | Leftmost year mapped to graph-space (1750) |
| `TIMELINE_X_MAX` | `const` | Rightmost year (2010) |
| `TIMELINE_WIDTH` | `const` | Virtual graph-space width in px (5200) |
| `TIMELINE_UNKNOWN_X` | `const` | X position for nodes with unknown birth year |
| `ERA_LANE_Y` | `const` | Y lane per era in graph-space |
| `LANE_STEP` | `const` | Fixed vertical step between nodes in the same lane (55px) |
| `currentLayout` | `let` | `'graph'` or `'timeline'` |
| `bornToX(born)` | function | Map birth year to graph-space X coordinate |
| `applyTimelineLayout()` | function | Animate all nodes to timeline positions |
| `graphXtoPx(gx)` | function | Convert graph-space X to screen px (for ruler) |
| `graphYtoPx(gy)` | function | Convert graph-space Y to screen px |
| `drawRuler()` | function | Render decade tick marks as SVG into `#timeline-ruler` |
| `showTimelineRuler()` | function | Show the ruler overlay |
| `hideTimelineRuler()` | function | Hide the ruler overlay |

---

### `raga_wheel.js`

Three-view selector (ADR-023) and interactive raga wheel SVG.

| Symbol | Kind | Description |
|---|---|---|
| `currentView` | `let` | `'graph'` \| `'timeline'` \| `'raga'` |
| `switchView(name)` | function | Switch between the three views |
| `toggleLayout()` | function | Toggle between graph and timeline layouts |
| `showRagaWheel()` | function | Show the raga wheel container |
| `hideRagaWheel()` | function | Hide the raga wheel container |
| `CAKRA_COLORS` | `const` | Colour per melakarta cakra |
| `svgEl(tag, attrs)` | function | SVG element factory |
| `polar(cx, cy, r, angleDeg)` | function | Polar → Cartesian coordinate helper |
| `sectorPath(…)` | function | Build SVG arc path for a wheel sector |
| `abbrev(name, maxLen)` | function | Abbreviate a string for SVG label fitting |
| `showWheelTooltip(svg, x, y, lines)` | function | Show tooltip group in SVG |
| `hideWheelTooltip()` | function | Hide tooltip group |
| `_expandMela(…)` | function | Expand a melakarta sector to show janya ragas |
| `_expandComps(…)` | function | Expand a janya raga to show compositions |
| `_expandMusicians(…)` | function | Expand a composition to show performing musicians |
| `_collapseAll(vp, melaByNum)` | function | Collapse all expanded sectors |

---

### `bani_flow.js`

Bani Flow filter panel and listening trail builder.

| Symbol | Kind | Description |
|---|---|---|
| `nodeBorn` | `const` | `{ node_id: born_year }` — pre-indexed from `elements` |
| `activeBaniFilter` | `let` | `{ type: 'comp'\|'raga', id: string }` or `null` |
| `applyBaniFilter(type, id)` | function | Filter graph to musicians who performed a composition or raga; build listening trail |
| `buildListeningTrail(type, id, matchedNodeIds)` | function | Build the full listening trail DOM for the left sidebar |
| `buildTrailItem(row, type, id)` | function | Render one `<li>` for a deduplicated performance row |
| `buildArtistSpan(artistRow, isPrimary, type, id)` | function | Render a clickable artist name with instrument shape icon |
| `clearBaniFilter()` | function | Reset Bani Flow filter and restore full graph |
| `triggerBaniSearch(type, id)` | function | Programmatically trigger a Bani Flow search |

---

### `search.js`

Shared dropdown helper and search box wiring.

| Symbol | Kind | Description |
|---|---|---|
| `makeDropdown(inputEl, dropdownEl, getItems, onSelect)` | function | Generic keyboard-navigable dropdown: handles input, arrow keys, Enter, Escape, outside-click |

Also wires (inline, no exported function):
- **Musician search** (`#search-input`) — filters `elements` by label, calls
  `selectNode()` on selection
- **Bani Flow search** (`#bani-search-input`) — searches compositions and
  ragas by name, calls `triggerBaniSearch()` on selection

---

## Template injection

`html_generator.py` assembles the final HTML in four steps:

**Step 1 — Substitute base.html placeholders**

```python
base = base.replace("{node_count}", str(node_count))
base = base.replace("{edge_count}", str(edge_count))
```

**Step 2 — Build the JS data block**

All lookup tables are serialised to JSON and written as `const` declarations:

```js
const elements = […];                    // Cytoscape element list
const ragas = […];                       // from compositions.json
const composers = […];
const compositions = […];
const compositionToNodes = {…};          // composition_id → [node_id, …]
const ragaToNodes = {…};                 // raga_id → [node_id, …]
const recordings = […];                  // from recordings/*.json
const musicianToPerformances = {…};      // musician_id → [PerformanceRef, …]
const compositionToPerf = {…};           // composition_id → [PerformanceRef, …]
const ragaToPerf = {…};                  // raga_id → [PerformanceRef, …]
```

**Step 3 — Concatenate script block**

```
<script>
  [data block]
  [graph_view.js]
  [media_player.js]
  [timeline_view.js]
  [raga_wheel.js]
  [bani_flow.js]
  [search.js]
</script>
```

The concatenation order matters: `graph_view.js` references `elements` and
`musicianToPerformances`; `bani_flow.js` references `compositionToPerf` and
`ragaToPerf`; `search.js` references `elements` and calls `selectNode()` and
`triggerBaniSearch()` defined in earlier files.

**Step 4 — Inject into base.html**

```python
html = base.replace("<!-- INJECT_SCRIPTS -->", script_block)
```

---

## How to add a new view

1. **Create the template** — add `carnatic/render/templates/my_view.js`.
   Define a `showMyView()` / `hideMyView()` function pair. Reference any
   injected global (`elements`, `compositions`, etc.) directly.

2. **Load it in `html_generator.py`** — add one line in `render_html()`:

   ```python
   my_view = _load("my_view.js")
   ```

   Then add `my_view` to the `script_block` join list, after `bani_flow` and
   before `search` (or at the end — order only matters if you reference
   symbols from earlier files).

3. **Add a button to `base.html`** — add a `<button>` in the `.controls` div
   in the header:

   ```html
   <button onclick="switchView('my_view')" title="My View">🔭</button>
   ```

4. **Wire `switchView()`** — in `raga_wheel.js`, extend the `switchView(name)`
   function to handle `'my_view'`: call `showMyView()` / `hideMyView()` and
   show/hide `#cy` as appropriate.

5. **Run** `python3 carnatic/render.py` to rebuild `graph.html`.

---

## ADR references

| ADR | Title | Implemented in |
|---|---|---|
| ADR-001 | Bani Flow highlighting bug | `bani_flow.js` |
| ADR-002 | Dual search boxes | `search.js` |
| ADR-003 | Bani Flow left sidebar | `bani_flow.js`, `base.html` |
| ADR-004 | Bani Flow visual consistency | `bani_flow.js` |
| ADR-005 | Right sidebar space utilisation | `base.html` |
| ADR-006 | Node header era-dot disambiguation | `graph_view.js` |
| ADR-007 | Search bar colocation | `search.js`, `base.html` |
| ADR-008 | Era + instrument topbar filters | `graph_view.js` |
| ADR-010 | Multiple versions same composition | `media_player.js` |
| ADR-012 | Same-concert track switching | `media_player.js` |
| ADR-013 | Single source of truth traversal layer | `render.py`, `sync.py` |
| ADR-016 | Writer validation + source of truth | `sync.py` |
| ADR-018 | Concert-bracketed recording groups | `media_player.js`, `graph_view.js` |
| ADR-019 | Co-performer bracketed trail entries | `bani_flow.js` |
| ADR-020 | Raga/composition header parity | `graph_view.js` |
| ADR-021 | Melakarta first-class citizens | `raga_wheel.js` |
| ADR-022 | Raga panel navigability | `raga_wheel.js` |
| ADR-023 | Raga wheel third view | `raga_wheel.js` |
