# UIMAP — Bani Flow UI Surface Map

**The vocabulary → code Rosetta stone.** Resolves the five graphical elements
(bani-flow panel, musician panel, guru-shishya view, mela-janya view, media
player) to their DOM roots, owning modules, entry points, state globals, and
the logic that connects them.

**How to use (context hygiene — hard rule):** never read this file wholesale at
session start. Grep or read the one element section your task touches, plus the
sync graph if the task crosses elements:

```bash
grep -n "^## " carnatic/render/UIMAP.md          # section index
```

**Maintenance contract:** `carnatic/tests/test_ui_surface_map_drift.py` greps
the templates for the DOM ids and function names claimed here and fails on
rename/removal. A red drift test means *update this file in the same commit*.
Governing decision: ADR-174.

---

## Section index

| § | Element | DOM root | Owning module(s) |
|---|---|---|---|
| 1 | Bani-flow panel (left sidebar) | `#bani-flow-panel` | `bani_flow.js` |
| 2 | Musician panel (right sidebar) | `#musician-panel` + `#recordings-panel` | `graph_view.js` + `media_player.js` |
| 3 | Guru-shishya view | `#cy` | `graph_view.js` + `timeline_view.js` |
| 4 | Mela-janya view (raga wheel) | `#raga-wheel` | `raga_wheel.js` |
| 5 | Media player (+ queue/playlist) | dynamic `.media-player` | `media_player.js` |
| 6 | Cross-cutting: load order, sync graph, theme, panel state, chips | — | — |
| 7 | Recipes | — | — |

---

## 1. Bani-flow panel (left sidebar)

**Aliases:** bani flow panel, left panel, left sidebar, trail panel, listening
trail, "her trail".

**DOM:** `#left-sidebar` → `#bani-flow-panel`. Sticky zone `#bani-sticky`:
subject header (`#bani-subject-header`, `#bani-subject-name`,
`#bani-subject-popup-btn` → popup `#bani-subject-popup`), search
(`#bani-search-input`, `#bani-search-dropdown`, scope label `#bani-scope-label`),
nav (`#bani-back-btn`, `#bani-fwd-btn`, `#bani-reset-btn`). Scroll zone
`#bani-scroll`: `#bani-info`, `#bani-notes-row`, `#bani-playlists`,
`#bani-lecdem-strip`, `#bani-tutorial`. Toggles: `#left-panel-toggle`,
`#desktop-left-handle`, scrim `#left-drawer-scrim`.

**Owns:** `templates/bani_flow.js` (~2000 ln) — filter + trail. Supporting:
`search.js` (bani search dropdown), `empty_tutorials.js` (`#bani-tutorial`),
`mobile.js` (drawer open/close).

**Entry points:**
- `applyBaniFilter(type, id)` — **the funnel**; every bani subject (raga, comp,
  perf, yt) enters here. `type ∈ {'comp','raga','perf','yt'}`.
- `clearBaniFilter(opts)` — reset; clears `activeBaniFilter`.
- `triggerBaniSearch(type, id, fromHistory)` — search-driven entry.
- `buildListeningTrail(type, id, matchedNodeIds)` — renders the trail;
  delegates to `buildTreeRaga` / `buildTreeComp` / `buildTreeLeaf`,
  `buildTrailItem(row, …)`, `buildArtistSpan`.
- `_renderBaniFlowPlaylists(type, id)`, `_renderBaniFlowLecdemStrip(type, id)`
  — secondary strips.
- `baniBack()` / `baniForward()` / `_updateBaniNavButtons()` — history.
- `window.getBaniTrail()` — read current trail from other modules.

**State globals:** `activeBaniFilter = {type, id} | null` — **the shared state
bus** read by the wheel and view-switcher. `_currentBaniSubject = {type, id}`.

**CSS hooks:** `--left-panel-width` (derived from data in `html_generator.py`,
ADR-128 D7 — never hardcode); `.trail-*` classes; `.panel` base class; chip
classes (`.raga-chip`, `.comp-chip`, `.musician-chip`).

**Connects to:** sets `activeBaniFilter` → `switchView` (in raga_wheel.js)
re-applies it to the wheel via `syncRagaWheelToFilter`; reverse direction
`window.syncWheelFromBaniSubject`. Trail rows register as queue items via
`registerQueueItem` (media_player.js); `#trail-enqueue-btn` →
`startMediaQueue`. Subject popup per ADR-149.

**ADRs:** 020, 022 (bani flow), 025 (wheel-sync gap), 086 (empty-panel
tutorials), 128 (panel components), 138, 142/144 (chip interactions), 148,
149 (subject popup), 150, 151 (permalink), 154/156 (media spans), 157
(play-all), 163 (playlists), 165, 167.

---

## 2. Musician panel (right sidebar)

**Aliases:** musician panel, right panel, right sidebar, node panel,
recordings panel.

**DOM:** `#right-sidebar` → sticky zone `#right-sticky` → `#musician-panel`
(header: `#node-info` → `#node-header` → `#node-name`, `#node-shape-icon`,
`#node-wiki-link`, `#lineage-popup-btn`; `#musician-search-input` +
`#musician-search-dropdown`; recording filter `#rec-filter-row` → `#rec-filter`,
`#rec-play-all-btn`, `#rec-enqueue-btn`; `#panel-back-btn`, `#panel-fwd-btn`,
`#musician-reset-btn`). Scroll zone `#right-scroll` → `#recordings-panel` →
`#recordings-list`; `#edge-info` (selected-edge readout); `#musician-tutorial`.
Toggles: `#right-panel-toggle`, `#desktop-right-handle`. Popup:
`#lineage-popup` (ADR-137).

**Owns — THE SPLIT (the #1 gotcha):** the panel is built by *two* modules.
`graph_view.js` owns selection and the header/lineage zone; `media_player.js`
owns the recordings body. A "musician panel" task usually touches both.

**Entry points:**
- `selectNode(node, {fromHistory, revealPanel})` (graph_view.js) — **the
  funnel** for showing a musician: canvas tap, chip click, wheel expansion, and
  permalink all call it. Sets `_currentPanelNodeId`, calls
  `buildLineagePanel(nodeId)` (header) and `buildRecordingsList(nodeId,
  nodeData)` (body).
- `buildRecordingsList` (media_player.js) → `buildRagaTree` →
  `buildConcertBracket` / `buildCompNode` / `buildMiscLeaf` /
  `buildPlaylistsSection` / `_buildLecdemBracket`.
- `window.clearMusicianPanel()` — reset (also hides `#recordings-panel`).
- `panelBack()` / `panelForward()` / `window.getCurrentPanelNode()`.
- `gurusOf(nodeId)` / `shishyasOf(nodeId)` / `_makeLineageChip(d)` —
  lineage chips; `_setupLineagePopupBtn` → `#lineage-popup`.
- `_openMusicianPanelForTransit(transitId)` — cross-view open (defined in
  graph_view.js; called from bani_flow.js and media_player.js).

**State globals:** `_currentPanelNodeId` (graph_view.js); panel history stack;
`_focusedGraphNode`.

**CSS hooks:** `--right-panel-width` (derived, ADR-128 D7); `.panel`;
`.section-collapse-btn`; `.section-play-acts` (play-all/enqueue pair);
`#recordings-panel { padding-top: 0 }` (ADR-011).

**Connects to:** invoked from cy canvas tap (§3), WDP/ wheel musician
expansion (§4), bani trail chips (§1), permalink restore. Recording rows →
`openOrFocusPlayer` / `registerQueueItem` (§5). Panel open/close state
machine: `mobile.js setPanelState`.

**ADRs:** 018 (concert bracket), 036/039 (mobile sheet), 041 (close-button
removal), 046 (drawer handles), 086 (empty tutorial), 128 (panel components +
D7 width), 129 (floating toggles), 137 (lineage popup), 163 (playlists
section).

---

## 3. Guru-shishya view

**Aliases:** graph view, lineage graph, guru-shishya graph, the canvas,
cytoscape view.

**DOM:** `#cy` (Cytoscape canvas) inside `#cy-wrap` / `#canvas-wrap`;
`#cy-labels` (DOM overlay chips). Toolbar: `#layout-controls-float` →
`#btn-relayout`, `#btn-timeline`; filter dropdowns `#era-dropdown-*`,
`#instr-dropdown-*`; `#hover-popover` (`#hp-name`, `#hp-sub`).

**Owns:** `graph_view.js` (~2060 ln) — cy init, filters, selection, labels.
`timeline_view.js` — timeline layout + decade ruler (`#timeline-ruler`).

**Entry points:**
- `const cy = cytoscape({...})` (graph_view.js:160) — instance created at
  load; node/edge styling, instrument glyphs (ADR-172/173), era colors.
- `selectNode(node)` — canvas tap handler → §2.
- `orientToNode(nodeId)` / `focusNode(node)` — camera control.
- Layouts: `applyTrinityTriangleLayout()` (**base layout**, `currentLayout =
  'trinity'`); `applyTimelineLayout()` + ruler (timeline_view.js);
  `relayout()`; `vpToggleTimeline()` (raga_wheel.js) flips between them.
- Filters: `buildFilterDropdowns()` / `applyChipFilters()` /
  `clearAllChipFilters()`; content-bearing dimming via `_contentBearingIds`
  (ADR-055).
- Overlay chips: `scheduleCyChipSync()` / `_syncOverlayChipPositions()`
  (ADR-074); zoom-scaled labels `applyZoomLabels()`.
- Meta inspector: `openMetaInspector(type, dataObj)`.

**State globals:** `cy`; `currentLayout` ('trinity'|'timeline', declared in
timeline_view.js, read by raga_wheel.js's `switchView`);
`_connectedNodeIds` / `_visiblyConnectedIds`.

**CSS hooks:** canvas colors come from `THEME`/Python `graph_builder.py`
(`ERA_COLORS`, `INSTRUMENT_SHAPES`, `NODE_SIZES`) — change them in Python, not
JS. Overlay chips use chip classes.

**Connects to:** shown/hidden by `switchView('graph')` in raga_wheel.js
(re-runs `applyTrinityTriangleLayout` on re-entry, calls `cy.resize()`); node
tap → `selectNode` → §2. Bani filter dims non-matching nodes.

**ADRs:** 018, 027, 028 (theme), 033/034, 044, 046, 055 (content-bearing),
058, 064/066, 068/069/070, 074 (DOM label chips), 078 (lecdem), 080/081, 086,
110 (composers as musicians), 114, 134, 137, 151, 163, 165/166, 172
(instrument glyphs), 173 (scholar cap).

---

## 4. Mela-janya view (raga wheel)

**Aliases:** raga wheel, mela wheel, melakarta wheel, mela-janya wheel, chakra
wheel, the wheel.

**DOM:** `#raga-wheel` (container; SVG built imperatively by `svgEl()`);
`#wheel-detail-panel` (**WDP** — the melakarta detail card); tooltip group.
Permanent centre annotation: the 12-sector sruti pie (ADR-131 R3).

**Owns:** `raga_wheel.js` (~2890 ln) — **also owns view switching for the
whole app** (`switchView`, `_updateViewportToolbar`, `vpFit`, `vpRelayout`,
`vpToggleTimeline`).

**Entry points:**
- `window.drawRagaWheel()` — full redraw; computes `_wdpData =
  {janyasByMela, compsByRaga, melaByNum}`.
- **Geometry core:** `polar(cx,cy,r,deg)`, `polarRad`, `sectorPath(cx,cy,r1,
  r2,start,end)` (annular sector), `solveRingLayout(opts)` — reuse these; never
  hand-roll wheel math.
- **Labels:** `_labelWithBg(layer, text, cx, cy, fontSize, extraAttrs,
  clickHandler)` — all text goes in `_labelLayer` (top-most `<g>`);
  `_bringLabelsToFront(vp)` after draws.
- **Expansion chain:** `_expandMela(vp, svg, raga, melaAngle, …)` →
  `_expandComps(vp, svg, janya, …)` → `_expandMusicians(vp, svg, comp, …)`;
  `_collapseAll(vp, melaByNum)`.
- **WDP:** `_openWheelDetailPanel(raga)`, `window._closeWheelDetailPanel()`,
  `_wdpSelectJanya`, `_wdpRenderComps`, `_positionWdpAtMela(melaNum)`,
  `_animateWheelToMela(melaNum, ms)`.
- **Light-up API:** `_lightUpMelas(melaNumbers, strokeHint)`,
  `_lightUpSpineForMela(M)`, `window.lightUpSpine(ragaId)`,
  `window.clearWheelLightUp()`.
- **Sync:** `syncRagaWheelToFilter(type, id)` (reads bani filter),
  `window.syncWheelFromBaniSubject(type, id)`, `orientRagaWheel(type, id)`.
- **View switching:** `switchView('graph'|'raga')`, `showRagaWheel(skipDraw)`,
  `hideRagaWheel()`, `wheelFit()`.

**State globals:** `currentView` ('graph'|'raga'); `_wdpData`, `_wdpMelaNum`,
`_wdpCorner`; `_expandedMela/_expandedJanya/_expandedComp`; `_litMelaId`;
pan/zoom transform state (`_dragging`, `_gestureMode`, `_pinchStartScale`) —
mutated only via `_applyTransform()` (`window._wheelApplyTransform`).

**CSS hooks:** SVG colors from `THEME` (e.g. `THEME.bgPanel` via
`getCakraColor`) and chip tokens via `_readChipTokens()` /
`_readChipSpacingK()` — never hardcode hex in wheel code.

**Connects to:** `switchView('raga')` re-applies `activeBaniFilter` (§1) via
`syncRagaWheelToFilter`, resolves `window._pendingWheelSubject`, and draws so
`window._pendingWdpPlayback` (permalink) can restore. `_expandMusicians` opens
the musician panel (§2). Sruti pie plays drone via `openPlayer`/`closePlayer`
(§5).

**ADRs:** 023 (three-view selector), 025 (bani↔wheel sync), 030, 035, 073,
093, 096, 123/124/126, 131 (sruti pie, R3), 132, 140 (WDP anchoring), 151
(permalink), 169 (tanpura glyph).

---

## 5. Media player (+ queue / playlist)

**Aliases:** media player, the player, now playing, playlist, queue,
"Up Next", mini player.

**DOM:** players are **dynamically created** — no static root. Desktop:
draggable/resizable `.media-player` (spawned at `nextSpawnPosition()`, z-order
via `bringToFront`/`topZ`). Mobile: bottom-sheet `.media-player.full-mobile` +
collapsed `.mini` strip. Chrome: bar (`buildPlayerBar`), chip rail
(`buildPlayerRail`), tracklist (`.mp-tracklist`, opens upward `bottom:100%`),
queue panel (`.mp-queue`, also upward), video wrap (`.mp-video-wrap`), copy
toast `#mp-copy-toast`.

**Owns:** `media_player.js` (~4740 ln) + `media_providers.js` (provider
registry: `parseMediaUrl`, `mediaKey`, `embedSource`, `resolveMedia` — ADR-154)
+ vendored Plyr (ADR-155: `window.Plyr`, local sprite).

**Entry points:**
- `openOrFocusPlayer(mediaArg, trackLabel, artistName, startSeconds,
  concertTitle, tracks, meta)` — **main desktop entry**; mobile funnels to
  `_openMobilePlayer(...)`.
- `createPlayer(...)` — builds the window; `mountPlayer(videoWrap, media,
  startSeconds, markerPoints)` — Plyr wiring, segment markers
  (`markerPointsFromTracks`, `segmentsToTracks`).
- `openPlayer(videoId, title, playerId, anchorRect)` / `closePlayer(playerId)`
  — *embedded* players (e.g. wheel sruti drone).
- **`MediaQueue`** (`window.MediaQueue`): `{items, index, active, currentKey,
  panelOpen}`; `start(items, startIndex)` (also `window.startMediaQueue`),
  `advance`, `jumpTo`/`previous`/`next`, `removeAt(i)`, `move(from,to)`
  (recomputes `index` from `currentKey` — the reorder precedent), `isCurrent`,
  `setPanelOpen`. **Invariant:** items' `media` must be MediaRef-normalised
  (`_normalize`) or `currentKey` silently breaks.
- Queue UI: `buildQueuePanel()` / `_renderQueuePanel(panel)` /
  `_refreshQueuePanels()` (two-way binding — call after every mutation) /
  `_addQueueUI(el, skipRefresh)` (attach point: called from `createPlayer` AND
  `_openMobilePlayer`).
- Row registration: `window.registerQueueItem(rowEl, getItem)` — how bani
  trail and recording rows become queueable; `collectQueueItems(rootEl)`.
- Chrome: `buildPlayerBar(...)` (transport buttons — new buttons go here),
  `buildPlayerRail(meta)` / `updatePlayerRail(...)` / `reflowRail(rail)`
  (now-playing raga/comp chips), `buildPlayerTrackList(...)`.
- Mobile: `_openMobilePlayer`, `_expandMobilePlayer`,
  `window._collapseMobilePlayer`, `showMiniPlayer`/`hideMiniPlayer`,
  `_swipeMobileTrack(direction)`.

**State globals:** `MediaQueue` (above); spawn/z state `nextSpawnPosition()`,
`topZ`; per-instance `instance.mediaKey`.

**CSS hooks:** `.mp-*` classes; `.mp-toggle-btn[aria-pressed="true"]` — the
reusable depressed-toggle primitive (ADR-161) for any state-holding button;
upward-surface pattern (`bottom:100%`, flip-down near viewport top);
`.mp-queue.mp-queue-shown`; mobile sheet grows via `:has(...)`.

**Connects to:** everything plays through here — trail play-acts (§1),
recording rows (§2), WDP playbacks (§4), sruti drone, tanpura (ADR-029).
`onEnded` → `MediaQueue.advance()`. `refreshPlayingIndicators()` syncs ▶
state across panels. Permalink (permalink.js) restores the open player; queue
in permalink is ADR-164 (open).

**Gotchas (from LEARNINGS):** queue UI only appears when `MediaQueue.active`
(correct-by-design, reads as broken); transformed ancestors break
`position:fixed` menus in the mini player (reparent to `<body>` — ADR-161);
desktop tracklist and queue are mutually exclusive (both open upward).

**ADRs:** 154 (providers), 155 (Plyr), 156 (spans), 157 (window reuse, queue
phase A), 158–160, 161 (toggle primitive, upward surfaces), 162 (visible
queue), 163 (playlists), 165, 168, 170 (permalink). AUDITs: 013 (chip pencil
leak), 014 (player-source coupling), 015 (mute click-pause), 016 (playlist
overlay), 018 (concert queue end boundary), 019 (trail end-seconds).

---

## 6. Cross-cutting

### 6.1 Script load order (contract — enforced by `html_generator.py`)

```
theme.js          FIRST — defines THEME global
instruments registry (js_registry())
data_js           injected consts: elements, ragas, compositions, recordings,
                  musicianToPerformances, perfToPerf, playlists*, graphData…
plyr.min.js       vendored; defines window.Plyr
graph_view.js     defines cy (loads before data consumers? no — after data_js)
media_providers.js  parseMediaUrl / mediaKey / resolveMedia
panel_components.js  MUST precede media_player.js + bani_flow.js (ADR-128)
media_player.js
timeline_view.js
raga_wheel.js     needs openPlayer/closePlayer from media_player.js
bani_flow.js
search.js
roles.js → edit_form_spec.js → entry_forms.js  (needs graphData + wireDrag/topZ)
patch_cart.js → chip_dblclick.js → empty_tutorials.js → mobile.js
permalink.js    LAST — restores state using every global above
```

### 6.2 The sync graph (how the five elements talk)

```
                 activeBaniFilter (state bus, §1)
                 │                    ▲
   §1 Bani-flow ─┼── syncRagaWheelToFilter ──► §4 Wheel
     panel       │                    │
                 └── ◄── syncWheelFromBaniSubject ──┘
   §4 Wheel ── _expandMusicians ──► §2 Musician panel
   §3 Graph  ── tap → selectNode ─► §2 Musician panel
   §1, §2, §4 ── registerQueueItem / openOrFocusPlayer ─► §5 Player+Queue
   permalink.js ── restores ──► §1 filter, §2 panel, §4 WDP, §5 player
   mobile.js setPanelState ── shows/hides ──► §1, §2 drawers
```

### 6.3 Theme & look-and-feel (single sources)

- `render/theme.py` `TOKENS` → `css_vars()` → `:root` CSS vars; also exported
  to `theme.js` as the `THEME` global (ADR-028). **Change colors/sizing here,
  never in templates.**
- Panel widths `--left-panel-width` / `--right-panel-width` are **derived from
  data** in `html_generator.py` (ADR-128 D7).
- Canvas node styling (era colors, sizes, shapes) lives in Python
  `graph_builder.py`.

### 6.4 Panel/drawer state machine

`mobile.js`: `setPanelState(newState)` — opens/closes `#left-sidebar` /
`#right-sidebar` via `.drawer-open`; desktop toggles `#left-panel-toggle` /
`#right-panel-toggle` (`.float-toggle-active`); `peekBottomSheet()` /
`dismissBottomSheet()` exposed as globals.

### 6.5 Chips (the shared atom)

`panel_components.js`: `buildPanelHeader`, `buildSection({playable, …})` (the
play-acts pair comes free with `playable:true`), `buildSubjectGroup`,
`buildRowAccordion`, `tagUntaggedChips` / `applyChipRole`. Double-click
dispatch: `chip_dblclick.js` → `openEditForm` (entry_forms.js) per
`edit_form_spec.js` (ADR-142/143).

---

## 7. Recipes

### R1 — "Add a randomize play button to the media player"

1. Model: add `MediaQueue.shuffle()` in `media_player.js` — precedent is
   `move(from,to)`: reorder `items`, recompute `index` from `currentKey` so the
   current track keeps playing, then `_refreshQueuePanels()`.
2. Chrome: add the button in `buildPlayerBar` (`.mp-bar-right`); if it holds
   state use the `.mp-toggle-btn` primitive (ADR-161).
3. Mirror in `_openMobilePlayer`'s bar (`_addQueueUI` attach point covers the
   panel; the button itself is bar chrome).
4. Style in `base.html` using THEME vars only.
5. Gate: `bani-render` → `pytest carnatic/tests/` (queue invariants:
   `test_trail_queue_item_invariants.py`).

### R2 — "Numerical total at the periphery of the mela-janya wheel (items per mela)"

1. Counts already exist: `_wdpData.janyasByMela` / `compsByRaga` computed in
   `drawRagaWheel` — do not recompute.
2. Draw labels into `_labelLayer` via `_labelWithBg(...)` at a radius beyond
   the outermost ring; position with `polar()` (never hand-rolled trig).
3. Respect the transform: labels land in the panned/zoomed `<g>`; call
   `_bringLabelsToFront(vp)`; clear them wherever `_clearWheelLightUp` /
   `_collapseAll` clear transient layers.
4. Colors from `THEME` / `_readChipTokens()`. Precedent for permanent wheel
   annotations: the ADR-131 R3 sruti pie.
5. Gate: render + drift tests.

### R3 — "Add a section to a panel"

Use `buildSection({headerChip, count, playable:true})` from
`panel_components.js` — `playable:true` yields the ▶/⊕ play-acts pair; register
rows with `registerQueueItem` so they enqueue like everything else.

### R4 — "Change the look and feel"

Colors/typography/spacing → `theme.py` `TOKENS` only. Canvas node styling →
`graph_builder.py`. Panel widths → derived (ADR-128 D7); adjust the formula in
`html_generator.py`, not CSS.
