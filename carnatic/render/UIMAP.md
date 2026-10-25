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
`.panel-top-row` (ADR-191) = nav group (`#bani-back-btn`, `#bani-fwd-btn`,
square) + search (`#bani-search-input`, `#bani-search-dropdown`, scope label
`#bani-scope-label`; inside the shared `.search-field` shell — ADR-190) + add
(`#bani-add-btn`, single-click raga-or-composition picker). The old BANI FLOW
title banner is retired. Then subject header (`#bani-subject-header`,
`#bani-subject-name`, `#bani-subject-popup-btn` → popup `#bani-subject-popup`);
content filter `#trail-filter-row` → `#trail-filter` (placeholder "Filter
content…", ADR-178).
Scroll zone
`#bani-scroll`: `#bani-info`, `#bani-notes-row`, `#bani-playlists`,
`#bani-lecdem-strip`, `#bani-tutorial`. Toggles: `#left-panel-toggle`,
`#desktop-left-handle`, scrim `#left-drawer-scrim`.

**Owns:** `templates/bani_flow.js` (~2000 ln) — filter + trail. Supporting:
`search.js` (bani search dropdown), `empty_tutorials.js` (`#bani-tutorial`
tutorial deck + category help cards), `mobile.js` (drawer open/close). The
**content-filter engine** (`applyPanelContentFilter`, `CONTENT_FILTER_ZONES`)
lives in `panel_components.js` and is shared with the musician panel (ADR-178).

**Entry points:**
- `applyBaniFilter(type, id)` — **the funnel**; every bani subject (raga, comp,
  perf, yt) enters here. `type ∈ {'comp','raga','perf','yt'}`.
- `clearBaniFilter(opts)` — reset; clears `activeBaniFilter`.
- `triggerBaniSearch(type, id, fromHistory)` — search-driven entry.
- `buildListeningTrail(type, id, matchedNodeIds)` — renders the trail;
  delegates to `buildTreeRaga` / `buildTreeComp` / `buildTreeLeaf`,
  `buildTrailItem(row, …)`, `buildArtistSpan`.
- `_renderBaniFlowPlaylists(type, id)`, `_renderBaniFlowLecdemStrip(type, id)`
  — secondary strips. `_renderBaniFlowPlaylists` passes `{type, id}` to
  `buildPlaylistsSection` so each playlist row shows only the items matching
  the subject (ADR-189).
- `baniBack()` / `baniForward()` / `_updateBaniNavButtons()` — history.
- `window.getBaniTrail()` — read current trail from other modules.
- `window.openCategoryHelp(slot, kind)` (empty_tutorials.js) — ADR-177: opens
  the category help card in `#help-dialog`; wired from `.section-help-btn` on
  every section header (buildSection, panel_components.js).
- `applyPanelContentFilter('bani', q)` (panel_components.js, ADR-178) — the
  textContent filter bound to `#trail-filter`; filters `#trail-list`, the
  `#bani-lecdem-strip`, and `#bani-playlists`.

**State globals:** `activeBaniFilter = {type, id} | null` — **the shared state
bus** read by the wheel and view-switcher. `_currentBaniSubject = {type, id}`.

**CSS hooks:** `--left-panel-width` (derived from data in `html_generator.py`,
ADR-128 D7 — never hardcode); `.trail-*` classes; `.panel` base class; chip
classes (`.raga-chip`, `.comp-chip`, `.musician-chip`); `.section-help-btn`
(ADR-177 category help trigger — ADR-181: gray meta chip). **ADR-180:** fixed `--row-height` ribbons —
`.row-accordion-scroll` / `.tree-header-text` / `.trail-chips` are the
horizontal-scroll surfaces; `.trail-acts` / `.tree-comp-acts` are the pinned
two-slot action column; fold chevrons are retired. The subject chip row
follows the same pattern: `#bani-subject-name` is itself the nowrap
horizontal-scroll surface, with `#bani-subject-popup-btn` and the `↗`
affordances pinned.

**Connects to:** sets `activeBaniFilter` → `switchView` (in raga_wheel.js)
re-applies it to the wheel via `syncRagaWheelToFilter`; reverse direction
`window.syncWheelFromBaniSubject`. Trail rows register as queue items via
`registerQueueItem` (media_player.js); `#trail-enqueue-btn` →
`startMediaQueue`. Subject popup per ADR-149.

**ADRs:** 020, 022 (bani flow), 025 (wheel-sync gap), 086 (empty-panel
tutorials), 128 (panel components), 138, 142/144 (chip interactions), 148,
149 (subject popup), 150, 151 (permalink), 154/156 (media spans), 157
(play-all), 163 (playlists), 165, 167, 177 (category help dialog), 178
(unified content filter), 180 (ribbon rows), 181 (transport buttons + meta chips),
182 (themeable meta badges), 189 (context-scoped playlist rows + ⓘ info dialog),
190 (shared search-field shell across grand + both panels), 191 (panel top
row — banners retired, square nav + add).

---

## 2. Musician panel (right sidebar)

**Aliases:** musician panel, right panel, right sidebar, node panel,
recordings panel.

**DOM:** `#right-sidebar` → sticky zone `#right-sticky` → `#musician-panel`
(`.panel-top-row` (ADR-191) = nav group (`#panel-back-btn`, `#panel-fwd-btn`,
square) + `#musician-search-input` + `#musician-search-dropdown` (inside the
shared `.search-field` shell, ADR-190) + add (`#panel-add-btn`, single-click
add-musician form). The old MUSICIAN title banner is retired. Then header:
`#node-info` → `#node-header` → `#node-name`, `#node-shape-icon`,
`#node-wiki-link`, `#lineage-popup-btn`; content filter `#rec-filter-row` →
`#rec-filter` (placeholder "Filter content…", ADR-178), `#rec-play-all-btn`,
`#rec-enqueue-btn`).
Scroll zone `#right-scroll` → `#recordings-panel` →
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
  `buildPlaylistsSection` (context-scoped, ADR-189) / `_buildLecdemBracket`.
- `window.clearMusicianPanel()` — reset (also hides `#recordings-panel`).
- `panelBack()` / `panelForward()` / `window.getCurrentPanelNode()`.
- `gurusOf(nodeId)` / `shishyasOf(nodeId)` / `_makeLineageChip(d)` —
  lineage chips; `_setupLineagePopupBtn` → `#lineage-popup`.
- `_openMusicianPanelForTransit(transitId)` — cross-view open (defined in
  graph_view.js; called from bani_flow.js and media_player.js).
- `applyPanelContentFilter('musician', q)` (panel_components.js, ADR-178) — the
  textContent filter bound to `#rec-filter`; searches lecdems + segment names,
  subject chips, misc recordings, raga/composition groups, playlists, notes.

**State globals:** `_currentPanelNodeId` (graph_view.js); panel history stack;
`_focusedGraphNode`.

**CSS hooks:** `--right-panel-width` (derived, ADR-128 D7); `.panel`;
`.section-collapse-btn` (ADR-180: retired); `.section-play-acts` (play-all/enqueue pair);
`.section-help-btn` (ADR-177 category help trigger — ADR-181: a gray meta chip
grouped with the section label);
`#recordings-panel { padding-top: 0 }` (ADR-011). **ADR-179:** all row action
groups (`.trail-acts`, `.tree-comp-acts`) reserve a fixed two-slot column and
section headers (`.section-hdr-right`) two; play/enqueue badges share
`--row-act-size`, and row labels are single-line horizontal-scroll surfaces.
**ADR-180:** every row is a fixed-height ribbon — the composer chip is inlined
on the composition line, multi-recording lists are always visible, and the
perf/bracket fold chevrons are retired. **ADR-181:** `.section-hdr-count`,
`.section-help-btn`, `.mp-playlist-count`, `.rec-group-count` are the gray meta
chips (the `.trail-version` recipe); count/help sit left with the label, only
play + enqueue (the bare `+`) occupy `.section-hdr-right`. The subject chip row
reuses the ADR-180 mechanism: `#node-name` is the nowrap horizontal-scroll
surface, with `#lineage-popup-btn` / `#node-wiki-link` pinned.

**Connects to:** invoked from cy canvas tap (§3), WDP/ wheel musician
expansion (§4), bani trail chips (§1), permalink restore. Recording rows →
`openOrFocusPlayer` / `registerQueueItem` (§5). Panel open/close state
machine: `mobile.js setPanelState`.

**ADRs:** 018 (concert bracket), 036/039 (mobile sheet), 041 (close-button
removal), 046 (drawer handles), 086 (empty tutorial), 128 (panel components +
D7 width), 129 (floating toggles), 137 (lineage popup), 163 (playlists
section), 177 (category help dialog), 178 (unified content filter), 179
(single-line rows + shared action column), 180 (ribbon rows, chevrons retired),
181 (transport buttons + left-aligned meta chips), 182 (themeable meta badges),
189 (context-scoped playlist rows + ⓘ info dialog), 190 (shared search-field
shell — the panel search is the grand search's sibling), 191 (panel top row —
banners retired, square nav + add).

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
JS. Overlay chips use chip classes. **View window (ADR-176):** `#canvas-wrap`
is inset on desktop to the four walls (between the open panels, above the bottom
floor); its top wall is `max(--chrome-top, --playlist-ui-bottom + gap)` —
`media_player.js` `_syncViewTopInset()` publishes the playlist UI's live bottom
so a deepening editor pushes the view (and `#layout-controls-float`) lower.
**(ADR-185:** the static `--chrome-top` now clears only the grand search bar
(desktop `56px`), and the ephemeral Playlist Bar is `display:none` when empty,
so `_playlistUiRect()` collapses to `null` and the view reclaims the second
band; `_renderPlaylistBar()` re-publishes the wall on every queue render.)
`mobile.js` `_refitViews()`/`window.refitViewWindow` re-run `cy.resize()`/
`cy.fit()` and `window.refitRagaWheel()` when a panel or the editor re-insets
it (the wheel's state-preserving redraw, so the open WDP survives).

**Connects to:** shown/hidden by `switchView('graph')` in raga_wheel.js
(re-runs `applyTrinityTriangleLayout` on re-entry, calls `cy.resize()`); node
tap → `selectNode` → §2. Bani filter dims non-matching nodes.

**ADRs:** 018, 027, 028 (theme), 033/034, 044, 046, 055 (content-bearing),
058, 064/066, 068/069/070, 074 (DOM label chips), 078 (lecdem), 080/081, 086,
110 (composers as musicians), 114, 134, 137, 151, 163, 165/166, 172
(instrument glyphs), 173 (scholar cap), 176 (inset view window).

---

## 4. Mela-janya view (raga wheel)

**Aliases:** raga wheel, mela wheel, melakarta wheel, mela-janya wheel, chakra
wheel, the wheel.

**DOM:** `#raga-wheel` (container; SVG built imperatively by `svgEl()`);
`#wheel-detail-panel` (**WDP** — the raga panel: mela chip + its janya chips);
`#wheel-comp-panel` (**child panel**, ADR-192 — the selected raga's compositions,
opened by clicking a raga chip and placed beside that chip: outside the WDP's
outward edge, vertically centred on the chip's row; **desktop-only** — on
≤768px a raga tap draws the bani-flow panel instead); tooltip group. Permanent
centre annotation: the 12-sector sruti pie (ADR-131 R3).

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
- **WDP (two-panel telescoping, ADR-192):** `_openWheelDetailPanel(raga)`
  builds the raga panel (mela + janyas, no comps); `_wdpSelectJanya(raga, chipEl,
  suppressFilter, activeCompId)` opens/closes the child panel and populates the
  bani filter; `_openCompPanel(raga, activeCompId)`, `_wdpRenderComps`,
  `window._closeWheelCompPanel()`, `window._positionCompPanel()` (anchors the
  child beside the `.wdp-selected` chip — outward edge + `_WDP_COMP_GAP`,
  centred on the chip's measured screen row and clamped to the view window;
  re-runs on list scroll; no-op on ≤768px, where a raga tap draws the
  bani-flow panel); `window._closeWheelDetailPanel()` clears both;
  `_positionWdpAtMela(melaNum)`, `_animateWheelToMela(melaNum, ms)`.
- **Light-up API:** `_lightUpMelas(melaNumbers, strokeHint)`,
  `_lightUpSpineForMela(M)`, `window.lightUpSpine(ragaId)`,
  `window.clearWheelLightUp()`.
- **Sync:** `syncRagaWheelToFilter(type, id)` (reads bani filter),
  `window.syncWheelFromBaniSubject(type, id)`, `orientRagaWheel(type, id)`,
  `window.refitRagaWheel()` (state-preserving redraw for the ADR-176 refit).
  `_triggerMelaExpand` flags `window._wheelPreviewNoPanel` around its
  synthesized mela click, so the mela handler's mobile panel-dismissal
  (`setPanelState('IDLE')`) is skipped for programmatic sync/refit clicks —
  otherwise a refit would withdraw the panel that just opened.
- **View switching:** `switchView('graph'|'raga')`, `showRagaWheel(skipDraw)`,
  `hideRagaWheel()`, `wheelFit()`.

**State globals:** `currentView` ('graph'|'raga'); `_wdpData`, `_wdpMelaNum`,
`_wdpCorner`, `_wdpCompRaga` (ADR-192: raga id whose child comp panel is open);
`_expandedMela/_expandedJanya/_expandedComp`; `_litMelaId`;
pan/zoom transform state (`_dragging`, `_gestureMode`, `_pinchStartScale`) —
mutated only via `_applyTransform()` (`window._wheelApplyTransform`).

**CSS hooks:** SVG colors from `THEME` (e.g. `THEME.bgPanel` via
`getCakraColor`) and chip tokens via `_readChipTokens()` /
`_readChipSpacingK()` — never hardcode hex in wheel code. The wheel is drawn
into the same inset view window (ADR-176); `mobile.js` `_refitViews()` calls
`window.refitRagaWheel()` after a panel re-insets the SVG.

**Connects to:** `switchView('raga')` re-applies `activeBaniFilter` (§1) via
`syncRagaWheelToFilter`, resolves `window._pendingWheelSubject`, and draws so
`window._pendingWdpPlayback` (permalink) can restore. `_expandMusicians` opens
the musician panel (§2). Sruti pie plays drone via `openPlayer`/`closePlayer`
(§5).

**ADRs:** 023 (three-view selector), 025 (bani↔wheel sync), 030, 035, 073,
093, 096, 123/124/126, 131 (sruti pie, R3), 132, 140 (WDP anchoring), 151
(permalink), 169 (tanpura glyph), 176 (inset view window), 192 (telescoping
raga panel + composition child panel).

---

## 5. Media player (+ queue / playlist)

**Aliases:** media player, the player, now playing, playlist, queue,
"Up Next", mini player.

**DOM:** players are **dynamically created** — no static root. Desktop: fixed,
docked `.media-player` (spawned at `nextSpawnPosition()`, z-order via
`bringToFront`/`topZ`; ADR-183: not draggable or resizable). Mobile:
bottom-sheet `.media-player.full-mobile`
(the ADR-043 `.mini` strip is **retired** — ADR-175). Chrome: bar
(`buildPlayerBar`), chip rail (`buildPlayerRail`), tracklist (`.mp-tracklist`,
opens upward `bottom:100%`), queue panel (`.mp-queue`, opens upward; the
app-level editor is `.mp-queue-bar`), video wrap (`.mp-video-wrap`), copy toast
`#mp-copy-toast`. **ADR-184:** the now-playing overlay
`.mp-now-playing` is a sibling of `.plyr` inside `.mp-video-wrap` (so the
Fullscreen API hides it automatically); the grand search is the static
`#search-bar` (`#track-search-input` + `#track-search-dropdown`) at the top of
the viewport.

**ADR-175 / ADR-183 — the playlist row is king:** content players are **bare**
(`.media-player.bare`: the video surface only; **no** `.mp-bar`, drag handle,
resize grip, identity rail, ✕, minimize or fold-cue). Identity lives in the editor row; the
current row owns the transport (`.mp-queue-play`; play↔stop via `_pbStopCurrent`;
plus the volume slider `.mp-queue-vol` → `_setPlayerVolume`). **ADR-184:** every
row owns its own operator set (`.mp-queue-op` copy / permalink / watch →
`_copyMediaLink` / `_copyMediaPermalink` / `_openMediaOnYouTube`, the row's own
track), not just the current one. Copy's tooltip reads
**Copy YouTube link**; permalink is the TiddlyWiki-style **#** glyph (still
`Copy permalink`). **Parent-inherits rule:** while the editor is open the row holds
the operators; the Playlist Bar (`#pb-copy` / `#pb-share` / `#pb-watch` /
`#pb-volume`, `#pb-play` / `#pb-stop`) shows them only when the row is not visible. **ADR-188:**
`#pb-play` is a play/pause toggle (`❚❚` while the current item sounds, `▶`
otherwise, `_pbPlayPauseCurrent`) and `#pb-stop` is a dedicated, non-toggling
stop; the current row carries the same toggle plus an `mp-queue-stop` button
(styled by the bar's `.pb-btn`, so both stops read identically). The bare player carries its own
`.mp-player-controls` (minimize `—` + close `✕`) — **always shown** by
`_syncPlayerControls` (ADR-183: the video is permanently docked on screen, so its
top controls stay reachable regardless of the editor row) — so the docked video is
independently minimizable and closable. `#pb-editor-toggle` is the bar's leftmost
control and uses the panel chevron glyph (`▶`/`▼`). Bar and row share the same
left→right order (**toggle · text · operators**). **ADR-184:** every row owns the
copy · permalink · watch operator set (no phantom columns); the volume slider
stays the current row's last operator and is inherited by the bar when the
editor folds. The per-row ``.mp-queue-collapse`` chevron is retired — the video's
own `.mp-player-min` and the bar's `#pb-editor-toggle` are the show/hide
affordances. Utility players (sruti/tanpura) keep `.mp-bar` and their own drag/resize.
`_dockPlayer` magnetically rests a player **under the Playlist UI** — the union of
bar + open editor (`_playlistUiRect`) — and is the only placement path for
content players (ADR-183; `_snapPlayerIfNearBar` still serves the utility
players' drag release). `_clampPlaylistEditorHeight()` caps the editor so the
docked player always fits below it (overflow scrolls). **ADR-176 (non-overlap
contract):** the four app-level surfaces — left
sidebar, right sidebar, playlist UI, and every floating player — must never
overlap. `_uiObstacleRects()` unions the two open sidebars (`_openSidebarRects`)
with `_playlistUiRect()`; `_resolveNonOverlap()` is the pure nearest-free-spot
solver; `_avoidUIOverlap()` clamps a drag; `_repositionPlayers()` re-runs on
viewport resize, drawer class flips, transform settle, and bar resize (guards
installed by `_installPlacementGuards`); `_clampPlayerWidthToColumn()` caps the
width-matched player to the free column via `max-width`. **The player observes the
Playlist Bar's left inset on both sides** — `_columnBounds()` intersects the
parent box with `_playlistUiRect()`, then mirrors the left (view-selector) inset
on the right. That protects the withdrawn musician panel and its bottom-right
toggle just as the left inset protects the bani-flow toggle; the help button's
narrower top-right inset is deliberately not the player's limit. `_playerMatchWidth`
always keeps the player flush with the playlist UI width (ADR-183: no user
resize). z-order: players `≤700`, `#playlist-bar` `750`, modals
`1000+` — the geometric constraints, not z, are what guarantee non-overlap.
The `.mp-tracklist-toggle` (burger) is retired — the Playlist Bar editor owns
list navigation.

**ADR-190: the search field is ONE component, three scopes.** `#search-bar`
(grand), `#bani-search-wrap .search-field`, and
`#musician-search-wrap .search-field` are all `.search-field`: raised
`--search-bg` surface, `--search-border` hairline, `--search-radius` (8px),
`--search-height` (32px), accent ring on `:focus-within` (`--search-ring`),
the shared `#icon-search` sprite glyph (`.search-glyph`, accent on focus), and
a `.search-clear` ✕ revealed by `:has(.search-input:not(:placeholder-shown))`
(delegated handler at the end of `search.js`). The inner `.search-input` is
borderless and transparent — the shell is the field. `#search-bar` overrides
only reach (fixed placement, drop shadow, taller dropdown); the panel shells
override only the inset. A new search surface must adopt the same three parts.

**ADR-184: the grand track search.** `#search-bar` occupies the old top slot
(desktop `top:12px`, the thin editor bar moves to `top:56px`; mobile `52px` /
`112px`). `search.js`'s grand-search IIFE indexes every recorded performance
(`perfToPerf`) **and** every `musician.youtube[]` recital track (host entry
preferred; accompanist cross-links dropped by `media_key`). Matching is
word-prefix over dots-fused initials (so `tm krishna` matches T.M. Krishna but
not the `tm` inside `atma`); when the whole query is a prefix of one entity name
the results narrow to that name (`_getIndex`, `_entryFromPerf`,
`_entryFromTrack`). Each result row (`.track-result`) is the shared chip strip +
**play** (`MediaQueue.playContent`) + **enqueue** (`MediaQueue.addItem`).
`#track-search-dropdown` is scrollable and sits above players (bar `750`,
search `751`, dropdown `10` inside it). ADR-190: the dropdown anchors to the
`.search-field` shell (4px below it, same `--search-radius`).

**ADR-175: the persistent Playlist Bar** is the thin editor bar below the
search bar (**ADR-185: ephemeral — `display:none` when the queue is empty, so
the second band is reclaimed; it appears only with ≥ 1 item**):
`#playlist-bar` (app chrome on desktop, gas-like between the view selector and
help button and **clamped to the canvas column** — `body:has(#left-sidebar.drawer-open)` /
`body:has(#right-sidebar.drawer-open)` pin its `left`/`right` to the panel widths so
it, the `.mp-queue-bar` editor and the docked player never occlude a sidebar;
second top band on mobile) with `#pb-prev` / `#pb-play` / `#pb-next` /
`#pb-stop` (`#pb-transport`), `#pb-summary` (thin horizontal scrollbar when the chips
overflow), `#pb-count`, `#pb-editor-toggle`, and the operator set inherited from
the current row: `#pb-copy` / `#pb-share` / `#pb-watch` / `#pb-volume`. The volume
slider sets the current player's output level via `_setPlayerVolume` and is
persisted across queue items (`_volumeLevel`); `_syncVolumeControls` mirrors it
between bar and row and disables it for volume-less (iframe) providers. The ADR-162 editor is re-parented
into it as `.mp-queue-bar` (drops **downward** from the bar) so the playlist is
visible/editable with the player open *or* closed. **ADR-184:** the ADR-162 "Up
Next" head (`.mp-queue-head`: title, prev/next transport, "Save queue as
playlist") is retired — the editor is the list alone. **Row/bar
parity:** an editor row's `.mp-queue-chips` is a single-row strip whose capsules
keep their natural width and scroll horizontally (thin scrollbar) — the exact
geometry of `#pb-summary`, so the bar reads as an inheritance of the rows. The
bare-label fallback (`_buildQueueRowChips`'s `.yt-label-chip`) is overridden in
both contexts to the same single-line, natural-width, centred chip contract, so
a label item never balloons the row/bar height.

**ADR-184: the now-playing overlay.** `_syncNowPlayingOverlays()` (called from
`_refreshQueuePanels`) paints `_buildQueueRowChips(item, activeChapter)` into
every mounted player's `.mp-now-playing`, so the video itself always names the
sounding track — even with the editor folded. It is refreshed on queue advance
and ADR-176 `activeChapter` changes. **ADR-186:** on desktop the strip is a
child of `.mp-player-controls`, so the chips share the video's own control row —
`[minimize] · chips · [close]` — instead of a second line below it (the base
absolute `.mp-now-playing` rule still serves the mobile overlay inside
`.mp-video-wrap`).

**ADR-186: the film-strip video toggle.** Minimizing a content player hides the
whole docked window (`display:none`); the Playlist Bar's `#pb-video-toggle` and
the current row's `.mp-video-toggle` are the always-reachable way back, placed
next to the play / copy / share / watch operators (bar inherits the row's set,
per ADR-175). `_videoVisible()` reads the current instance's display state;
`_toggleVideoVisibility()` calls `_toggleMinimized` (desktop) or the mobile
expand/collapse pair, then `_refreshQueuePanels()` re-renders both faces. Pressed
(`aria-pressed="true"`) = video shown; the icon is the `.mp-video-toggle` film
strip, `.mp-toggle-btn` supplies the depressed state (ADR-161).

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
  panelOpen, playlistId}` (ADR-164: source-playlist id for share-by-reference,
  dropped on any queue edit; `_pendingSeek` = one-shot permalink restore seek);
  `start(items, startIndex, opts)` (also `window.startMediaQueue`),
  `advance`, `jumpTo`/`previous`/`next`, `removeAt(i)`, `move(from,to)`
  (recomputes `index` from `currentKey` — the reorder precedent), `isCurrent`,
  `setPanelOpen`. **Invariant:** items' `media` must be MediaRef-normalised
  (`_normalize`) or `currentKey` silently breaks.
- Queue UI: `buildQueuePanel()` / `_renderQueuePanel(panel)` /
  `_refreshQueuePanels()` (two-way binding — call after every mutation) /
  `_syncNowPlayingOverlays()` (ADR-184: paints `.mp-now-playing`).
- **ADR-175 Playlist Bar:** `_initPlaylistBar()` (mounts the bar + editor, wires
  transport), `_renderPlaylistBar()` (mirrors MediaQueue into `#playlist-bar`),
  `_pbPlayPauseCurrent()` / `_pbStopCurrent()` / `_pbExpandPlayer()` (control
  handlers; ADR-188 makes the bar transport a play/pause toggle + a dedicated
  stop). Content play routes through `Playlist.playContent` (alias of
  `MediaQueue`), so `openOrFocusPlayer` is the window primitive again.
- **ADR-186 video toggle:** `_currentPlayerInst()` / `_videoVisible()` /
  `_toggleVideoVisibility()` (bar `#pb-video-toggle`, current row
  `.mp-video-toggle`).
- **ADR-176 advance/retarget (always know what is playing):** consecutive queue
  items that share one source video (every track of a concert) must NOT spawn a
  second window — `MediaQueue._open` detects an already-mounted same-`mediaKey`
  player and calls `_retarget(inst, item, ss)` (seek + adopt tracks/meta) in
  place. `_queueItemBoundary(instance, item)` = explicit `meta.end_seconds` or the
  item's next chapter; `_shouldAdvanceQueue(instance, sec)` makes the boundary
  **compulsory only when another item follows** (the last item runs on into the
  concert). While a last item runs past its own start, `_updateActiveSegment`
  publishes `MediaQueue.activeChapter`, which `_buildQueueRowChips(item,
  activeChapter)` renders into both the editor row and `#pb-summary`.
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
`.mp-queue.mp-queue-shown`; mobile sheet grows via `:has(...)`. **ADR-179:**
playlist-track chips are a single non-wrapping scroll line; a playlist row's
count badge right-aligns ahead of its two-slot `.trail-acts` column.
**ADR-180:** a playlist is a header ribbon plus one track ribbon per entry
(the fold is retired); each track's `.mp-playlist-track-chips` scrolls and its
`.trail-acts` pins. **ADR-189:** a playlist row is scoped to the panel's
subject — `buildPlaylistRow(pl, context)` filters items by raga / composition /
musician, the count reads `shown/total`, and the row ▶ plays the subset while
`+` enqueues the whole list. The name reads as a `.concert-title` (no pill),
tracks indent by `--hier-indent-step`, and `ⓘ` (`.mp-playlist-info-btn`) opens
the full playlist in `#help-dialog` as a `.playlist-info-card` with a **Play
all** `▶` / enqueue-all `+`.

**Connects to:** everything plays through here — trail play-acts (§1),
recording rows (§2), WDP playbacks (§4), sruti drone, tanpura (ADR-029).
`onEnded` → `MediaQueue.advance()`. `refreshPlayingIndicators()` syncs ▶
state across panels. Permalink (permalink.js) restores the open player **and
the queue** (ADR-164): `encodePermalink` emits an optional `q` block on the
v:2 state — `{pl, i}` for a saved playlist (id + cursor; reader rehydrates
from `playlists` via `_playlistToQueueItems`, degrades to single item on
missing id) or `{items, i}` for an ephemeral queue (compact refs,
hard-capped at `QUEUE_PERMALINK_CAP` = 20 with a surfaced truncation toast).
Playlist rows start the queue with `{playlistId}` so share-by-reference
kicks in; `t` stays top-level and seeks mid-item via `_pendingSeek`.

**Gotchas (from LEARNINGS):** queue UI only appears when `MediaQueue.active`
(correct-by-design, reads as broken); transformed ancestors break
`position:fixed` menus in the mini player (reparent to `<body>` — ADR-161);
desktop tracklist and queue are mutually exclusive (both open upward).

**ADRs:** 154 (providers), 155 (Plyr), 156 (spans), 157 (window reuse, queue
phase A), 158–160, 161 (toggle primitive, upward surfaces), 162 (visible
queue), 163 (playlists), 164 (queue permalinks), 165, 168, 170 (permalink),
176 (app-level non-overlap contract), 179 (single-line rows + shared action
column), 180 (ribbon rows, chevrons retired), 181 (transport buttons + left-aligned meta chips),
182 (themeable meta badges), 183 (fixed docked player; no drag/resize, editor
height cap), 184 (grand track search, thin editor bar, now-playing overlay),
185 (ephemeral Playlist Bar — hidden when empty, second band reclaimed),
189 (context-scoped playlist rows + ⓘ info dialog), 190 (shared search-field
shell across grand + both panels).
AUDITs: 013 (chip pencil
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
  never in templates.** ADR-179 adds `rowActSize`/`rowActGap` (`--row-act-size`
  / `--row-act-gap`); ADR-180 adds `rowHeight` (`--row-height`); ADR-182 adds
  `chipMetaBg`/`chipMetaFg`/`chipMetaBorder` (`--chip-meta-bg` / `-fg` / `-border`)
  — the themeable, high-contrast meta-badge surface.
- Panel widths `--left-panel-width` / `--right-panel-width` are **derived from
  data** in `html_generator.py` (ADR-128 D7).
- Canvas node styling (era colors, sizes, shapes) lives in Python
  `graph_builder.py`.

### 6.4 Panel/drawer state machine

`mobile.js`: `setPanelState(newState)` — opens/closes `#left-sidebar` /
`#right-sidebar` via `.drawer-open`; desktop toggles `#left-panel-toggle` /
`#right-panel-toggle` (`.float-toggle-active`); `peekBottomSheet()` /
`dismissBottomSheet()` exposed as globals. **Mobile geometry (ADR-175):** the
drawers are `position:fixed` with `top: var(--chrome-top)`, so they start
**below** the full-width Playlist Bar (never occluded); `--chrome-top` on mobile
is `116px` (bar bottom 106 + gap). Opening a panel also folds the app-level
playlist editor (`MediaQueue.setPanelOpen(false)` + `_refreshQueuePanels()`) so
the bar cannot drop over the panel column. **View refit (ADR-176):**
`_refitViews()` re-publishes the playlist top wall (`_syncViewTopInset`) then
`cy.resize()`/`cy.fit()` and `window.refitRagaWheel()` — the wheel's
state-preserving redraw (a bare `drawRagaWheel()` would clear the open WDP);
rAF-debounced as `window.refitViewWindow`, which `media_player.js` calls when
the editor box changes. `setPanelState` only schedules a refit when a drawer
actually opened or closed.

### 6.5 Chips (the shared atom)

`panel_components.js`: `buildPanelHeader`, `buildSection({playable, helpKind,
helpSlot, …})` (the play-acts pair comes free with `playable:true`; `helpKind` +
`helpSlot` add the `.section-help-btn`; ADR-181: the count and the `?` are gray
meta chips inside `.rec-section-hdr-label-wrap` — `[CHIP] [N] [?] ······ [▶ +]`
— leaving `.section-hdr-right` with only the transport pair; ADR-182: those
chips (plus `.trail-version` and `.mp-playlist-count`) share the
`--chip-meta-*` tokens for a high-contrast, themeable badge),
`buildSubjectGroup`,
`buildRowAccordion` (ADR-180: no longer folds — its body chips lay inline on
one `.row-accordion-scroll` line), `tagUntaggedChips` / `applyChipRole`. Also the unified
panel **content-filter engine** `applyPanelContentFilter(panelKey, q)` +
`CONTENT_FILTER_ZONES` (ADR-178) — a textContent matcher that keeps the ADR-165
§3 inline-`display`-only exclusion channel. Double-click
dispatch: `chip_dblclick.js` → `openEditForm` (entry_forms.js) per
`edit_form_spec.js` (ADR-142/143).

### 6.6 Help dialog & category cards (ADR-177)

`#help-dialog` / `#help-scrim` / `#hd-body` / `#hd-title` (base.html) is the
shared modal. Its inline script exposes `window.openHelpDialog(title, node)` and
`window.closeHelpDialog()`. The floating `#help-btn` shows the preface home
content; each panel section header's `.section-help-btn` (buildSection) calls
`window.openCategoryHelp(slot, kind)` (empty_tutorials.js), which borrows the
matching `.pt-v5-section` node from the hidden tutorial deck and restores it on
close via `window._onHelpDialogClosed`. The retired panel-wide `?` buttons
(`#bani-reset-btn`, `#musician-reset-btn`) and the `togglePanelHelp` overlay no
longer exist.

---

## 7. Recipes

### R1 — "Add a randomize play button to the media player"

1. Model: add `MediaQueue.shuffle()` in `media_player.js` — precedent is
   `move(from,to)`: reorder `items`, recompute `index` from `currentKey` so the
   current track keeps playing, then `_refreshQueuePanels()`.
2. Chrome: add the button in `buildPlayerBar` (`.mp-bar-right`); if it holds
   state use the `.mp-toggle-btn` primitive (ADR-161).
3. Mirror in `_openMobilePlayer`'s bar (mobile chrome changes go in the
   `_openMobilePlayer` branch, not only `buildPlayerBar`).
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
