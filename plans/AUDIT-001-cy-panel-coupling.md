# AUDIT-001: Cytoscape–Panel Coupling Smell

## Status
Draft — 2026-05-19

## Scope

Files scanned:

| File | Lines |
|---|---|
| `carnatic/render/templates/bani_flow.js` | 1795 |
| `carnatic/render/templates/panel_components.js` | ~400 |
| `carnatic/render/templates/media_player.js` | ~2400 |
| `carnatic/render/templates/search.js` | ~160 |
| `carnatic/render/templates/graph_view.js` | ~1840 |
| `carnatic/render/templates/timeline_view.js` | ~260 |

Focus: `cy.getElementById()` / `cy.nodes()` calls classified as either **data-resolution**
(reading display metadata like label, era, colour, instrument from the Cytoscape graph — the
smell) or **topology** (operating on graph structure: highlighting, fading, traversals,
positioning — legitimate).

Not in scope for this audit: `raga_wheel.js`, `mobile.js`, `theme.js`, `youtube_kinds.js`,
`roles.js`, `entry_forms.js`, `edit_form_spec.js`, `chip_dblclick.js`, `empty_tutorials.js`.

---

## Background

ADR-138 introduced **transit/isolated musicians** — musicians who appear in recordings but
carry no guru-shishya lineage edges, and are therefore **not inserted into the Cytoscape
element set** (`_cyElements`). With current data: 79 lineage nodes in `cy`, 62 transit nodes
absent from `cy`. The fix was applied locally and inconsistently: `buildArtistSpan` and the
legacy-`youtube[]` section of `buildTrail` both received `elements[]` fallbacks, but a large
number of functions in `media_player.js`, `panel_components.js`, and the structured-recordings
branch of `buildTrail` still query `cy` exclusively.

The canonical fix pattern already exists in the codebase:

```js
const _cyNode = id ? cy.getElementById(id) : null;
const _rawEl  = (_cyNode && _cyNode.length) ? null
  : (id ? elements.find(e => !e.data.source && e.data.id === id) : null);
```

This two-step pattern is applied in `buildArtistSpan` (bani_flow.js:1198–1204) and the
`host_id` lookup (bani_flow.js:452–458), but is absent from every other site listed below.

---

## Findings

### F-001: structuredPerfs primary performer — Cytoscape-gated data resolution

- **File**: `carnatic/render/templates/bani_flow.js`
- **Lines**: 492–510
- **Pattern**: data-resolution – SMELL

```js
pNode = cy.getElementById(primaryPerformer.musician_id);
artistLabel = (pNode && pNode.data('label')) || primaryPerformer.unmatched_name || p.title;
nodeId = primaryPerformer.musician_id;
born   = pNode ? pNode.data('born') : null;
// ...
rawRows.push({
  nodeId,
  artistLabel,
  born,
  lifespan: pNode ? pNode.data('lifespan') : null,
  color:    pNode ? pNode.data('color')    : null,
  shape:    pNode ? pNode.data('shape')    : null,
  ...
```

**Impact**: For any structured recording whose primary performer is a transit musician (no
lineage edges), `pNode` is an empty Cytoscape Collection. `pNode.data('label')` returns
`undefined`. The label falls through to `primaryPerformer.unmatched_name` (which may also be
null), then to `p.title` (the concert title). A perfectly well-catalogued musician's name is
silently replaced with the concert title in every trail chip. `born`, `lifespan`, `color`,
and `shape` are all `null`, which breaks era-tinting and sort ordering downstream.

---

### F-002: perfMap co-performer resolution — silent drop

- **File**: `carnatic/render/templates/bani_flow.js`
- **Lines**: 561–570
- **Pattern**: data-resolution – SMELL

```js
perfMap.forEach(row => {
  if (row.allPerformers) {
    row.coPerformers = [];
    row.allPerformers.forEach(pf => {
      if (pf.musician_id === row.nodeId) return; // skip primary
      const coNode = pf.musician_id ? cy.getElementById(pf.musician_id) : null;
      const coLabel = (coNode && coNode.length) ? coNode.data('label') : (pf.unmatched_name || null);
      if (!coLabel || UNKNOWN_LABELS.has(coLabel)) return; // skip unknown/placeholder names
      row.coPerformers.push({
        nodeId:      pf.musician_id || null,
        artistLabel: coLabel,
        color:       (coNode && coNode.length) ? coNode.data('color') : null,
        shape:       (coNode && coNode.length) ? coNode.data('shape') : null,
      });
    });
  }
});
```

**Impact**: A co-performer who is a transit musician and has no `unmatched_name` is silently
dropped from every trail chip. Their name is not displayed; there is no fallback to
`elements[]`. This is the hardest failure mode to detect — the musician exists in the data,
appeared in the recording, but is invisible in the UI with no error, log message, or toast.
`color` and `shape` are both `null` for any transit co-performer, even if the musician has
valid `era` and `color` fields in the raw data.

---

### F-003: nodeBorn global map — built from cy.nodes() only

- **File**: `carnatic/render/templates/bani_flow.js`
- **Lines**: 4–5
- **Pattern**: data-resolution – SMELL

```js
const nodeBorn = {};
cy.nodes().forEach(n => { nodeBorn[n.id()] = n.data('born'); });
```

**Impact**: `nodeBorn` is used as a sort tiebreaker in certain legacy paths. Any transit
musician is absent from `nodeBorn`. The map is also redundant with the `born` field on each
raw row; but because the raw row's `born` field is itself populated from `pNode.data('born')`
(F-001), the problem cascades: isolated musicians get `born: null` in both `nodeBorn` and
`rawRow.born`, and sort to the bottom regardless of their actual birth year. This is a
compounding effect of F-001.

---

### F-004: yt-type track label — cy.nodes() iteration (2 sites)

- **File**: `carnatic/render/templates/bani_flow.js`
- **Lines**: 317–323 and 1620–1627
- **Pattern**: data-resolution – SMELL (duplicated logic)

```js
// Lines 317–323 (search-box title on baniSearch)
cy.nodes().forEach(n => {
  if (ytLabel) return;
  const tracks = n.data('tracks') || [];
  const t = tracks.find(tr => tr.vid === ytVid);
  if (t) ytLabel = t.label || '';
});

// Lines 1620–1627 (updateBaniSearchInput, same pattern)
cy.nodes().forEach(n => {
  if (ytLabel) return;
  const tracks = n.data('tracks') || [];
  const t = tracks.find(tr => tr.vid === ytVid);
  if (t) ytLabel = t.label || '';
});
```

**Impact**: If a YouTube video was uploaded by a transit musician (no lineage edges), their
tracks are invisible to `cy.nodes()`. The search bar and trail header fall back to the raw
YouTube video id string, producing an unlabelled trail. The same logic is duplicated in two
call sites with identical code — a dead abstraction waiting to be named.

There is also a matching smell at **line 88–92** (inside the `'yt'` branch of `baniSearch`)
where `cy.nodes()` is iterated to build `matchedNodeIds` for yt-type entries — isolated
musicians with yt tracks cannot be included, so their recordings never appear in the
YouTube-linked trail view.

---

### F-005: panel_components.js — musician chip label + era without elements fallback

- **File**: `carnatic/render/templates/panel_components.js`
- **Lines**: 299–313
- **Pattern**: data-resolution – SMELL

```js
musicianIds.forEach(function (mid) {
  if (mid === excludeMusicianId) return;
  const mNode  = (typeof cy !== 'undefined') ? cy.getElementById(mid) : null;
  const mLabel = (mNode && mNode.length) ? (mNode.data('label') || mid) : mid;
  ...
  // Era-tint — same pattern as all other musician chips
  if (mNode && mNode.length && typeof THEME !== 'undefined' && THEME.eraTintCss) {
    const tint = THEME.eraTintCss(mNode.data('era') || null);
    c.style.setProperty('--chip-era-bg',     tint.bg);
    c.style.setProperty('--chip-era-border', tint.border);
  }
```

**Impact**: This function builds co-musician chips for composition and lecdem subject
sections of the musician panel. When `mid` is a transit musician, `mLabel` falls through to
the raw `mid` id string (e.g. `"lakshminarayana_subramaniam"`). Era-tint is silently skipped
(the `if (mNode && mNode.length)` guard short-circuits), so the chip is rendered without
colouring. The chip navigation is correctly handled via `_openMusicianPanelForTransit`, but
the label and tint problems remain.

---

### F-006: _buildMusicianChipForFooter — no elements fallback for era/instrument

- **File**: `carnatic/render/templates/media_player.js`
- **Lines**: 404–424
- **Pattern**: data-resolution – SMELL

```js
function _buildMusicianChipForFooter(nodeId, artistName) {
  if (!nodeId && !artistName) return null;
  const node = (nodeId && typeof cy !== 'undefined') ? cy.getElementById(nodeId) : null;
  const name = (node && node.length) ? (node.data('label') || artistName || nodeId)
                                     : (artistName || nodeId);
  ...
  const eraId = (node && node.length) ? (node.data('era') || null) : null;
  ...
  if (nodeId && typeof cy !== 'undefined' && typeof makeInstrBadge === 'function') {
    const instrKey = (node && node.length) ? node.data('instrument') : null;
    if (instrKey) chip.appendChild(makeInstrBadge(instrKey));
  }
```

**Impact**: The function is called from `buildPlayerFooter` and `_buildLecdemSubjectFooter`
to render the primary musician chip below the video. When `nodeId` is a transit musician,
`name` correctly falls back to `artistName`, but `eraId` is `null` (no era-tint), and
`instrKey` is `null` (no instrument badge). The chip renders without colour and without the
instrument badge. There is no fallback to `elements[]`.

---

### F-007: buildComposerChip — bare cy.getElementById without elements fallback

- **File**: `carnatic/render/templates/media_player.js`
- **Lines**: 754–756
- **Pattern**: data-resolution – SMELL (bare call; no elements fallback)

```js
const eraId = composerObj.musician_node_id
  ? (cy.getElementById(composerObj.musician_node_id).data('era') || null)
  : null;
```

**Impact**: `cy.getElementById()` returns an empty Collection (truthy!) when the musician is
absent from `cy`. Calling `.data('era')` on an empty Collection returns `undefined`, which
is falsy, so the expression evaluates to `null`. The call does not throw, but the era tint
is silently suppressed for any composer who is a transit musician. There is no fallback to
`elements[]`. A few lines later (line 761) the same node is looked up again with a proper
`typeof cy !== 'undefined'` guard — the era-tint lookup is the only place that skips the
guard and the fallback.

---

### F-008: _buildLecdemSubjectFooter musicians — no elements fallback

- **File**: `carnatic/render/templates/media_player.js`
- **Lines**: 889–891
- **Pattern**: data-resolution – SMELL

```js
musicianIds.forEach(musicianId => {
  const node  = (typeof cy !== 'undefined') ? cy.getElementById(musicianId) : null;
  const name  = (node && node.length) ? node.data('label') : musicianId;
  const eraId = (node && node.length) ? (node.data('era') || null) : null;
```

**Impact**: Lecturer-demo subject musician chips in the player footer fall back to the raw
id string for both name and era-tint when the musician is a transit node. Identical failure
mode to F-006.

---

### F-009: buildConcertBracket co-performer label — id fallback instead of elements fallback

- **File**: `carnatic/render/templates/media_player.js`
- **Lines**: 996–1001
- **Pattern**: data-resolution – SMELL

```js
if (pf.musician_id) {
  const node = cy.getElementById(pf.musician_id);
  label = (node && node.length > 0) ? (node.data('label') || pf.musician_id) : pf.musician_id;
}
```

**Impact**: When `pf.musician_id` points to a transit musician, `label` is set to the raw
id string (e.g. `"n_ramani"`) rather than the musician's display label. This label is then
stored in `coPerformerMap` and rendered as the chip text. There is no fallback to
`elements[]` to retrieve the actual label.

---

### F-010: buildConcertBracket chip rendering — bare cy calls for era + instrument

- **File**: `carnatic/render/templates/media_player.js`
- **Lines**: 1047–1058
- **Pattern**: data-resolution – SMELL (bare calls without null guard; no elements fallback)

```js
const eraId = pf.musicianId
  ? (cy.getElementById(pf.musicianId).data('era') || null)
  : null;
...
if (pf.musicianId && typeof makeInstrBadge === 'function') {
  const instrKey = cy.getElementById(pf.musicianId).data('instrument');
  if (instrKey) chip.appendChild(makeInstrBadge(instrKey, 11));
}
```

**Impact**: Same bare-call pattern as F-007. `era` returns `null` for transit musicians
(empty Collection → `undefined` → fallback `null`), so no era-tint. `instrument` also
returns `undefined`, so no instrument badge. Neither call has a fallback to `elements[]`.
These are called inside the `coPerformerMap` rendering loop, which runs for every
co-performer chip in every concert bracket in the musician panel — the impact surface is
large.

---

### F-011: buildRecordingsList — unsafe bare cy call as nodeData fallback

- **File**: `carnatic/render/templates/media_player.js`
- **Lines**: 1938
- **Pattern**: data-resolution – SMELL (unsafe fallback)

```js
const nd = nodeData || cy.getElementById(nodeId).data();
```

**Impact**: This is the entry point for building the entire musician panel. When `nodeData`
is null and `nodeId` belongs to a transit musician, `cy.getElementById(nodeId)` returns an
empty Collection. Calling `.data()` on an empty Collection returns `undefined`. Therefore
`nd` is `undefined`, and every subsequent access such as `nd.tracks`, `nd.label`,
`nd.lifespan` throws `TypeError: Cannot read properties of undefined`. The function silently
fails to render the musician panel. The correct fallback is
`elements.find(e => !e.data.source && e.data.id === nodeId)?.data`.

---

### F-012: _buildLecturerChip — era from cy only, no elements fallback

- **File**: `carnatic/render/templates/media_player.js`
- **Lines**: 2351–2357
- **Pattern**: data-resolution – SMELL

```js
const lNode = (typeof cy !== 'undefined') ? cy.getElementById(lecturerId) : null;
if (lNode && lNode.length && typeof THEME !== 'undefined' && THEME.eraTintCss) {
  const eraId = lNode.data('era') || null;
  const tint  = THEME.eraTintCss(eraId);
  chip.style.setProperty('--chip-era-bg',     tint.bg);
  chip.style.setProperty('--chip-era-border', tint.border);
}
```

**Impact**: Lecturer chips in the lecdem player footer render without era-tint when the
lecturer is a transit musician. Navigation is correctly handled via `_openMusicianPanelForTransit`
in the click handler, so the chip is tappable — only the colour is missing.

---

## Topology Calls — Verified OK

The following `cy` usages were inspected and classified as legitimate graph-topology
operations. They do not need to resolve musician display data from `cy`:

| Location | Call | Purpose |
|---|---|---|
| `bani_flow.js:160–177` | `cy.elements().addClass('faded')`, `cy.getElementById(nid).removeClass(...)`, `cy.edges().forEach(...)` | Highlight/fade nodes + edges in lineage graph during bani filter |
| `bani_flow.js:1225` | `cy.getElementById(artistRow.nodeId)` | Navigation click: zoom to node in graph view, with transit fallback |
| `bani_flow.js:1248` | `cy.elements().removeClass(...)` | Clear filter state |
| `bani_flow.js:1470` | `cy.getElementById(composer.musician_node_id)` | Composer chip navigation, with transit fallback |
| `search.js:123` | `cy.getElementById(item.id)` | Post-search navigation, with explicit transit comment + fallback |
| `graph_view.js` (all) | Various | Graph layout, edge fading, chip highlight, BFS positioning — all topological |
| `timeline_view.js:174,182,244` | `cy.nodes()` | Timeline layout — intentionally restricted to lineage nodes |
| `media_player.js:761,1068` | `cy.getElementById(...)` (guarded, with transit fallback) | Navigation in click handlers, not data resolution |

---

## Root Cause Analysis

The codebase evolved in two distinct phases. In the original design, every musician had
lineage edges and was inserted into the Cytoscape element set; `cy` served as the single
authoritative in-memory store for all musician metadata (label, born, era, colour, shape,
instrument, tracks). Panel functions, trail builders, and chip constructors were written to
call `cy.getElementById(id).data(field)` freely because the assumption "if the musician
exists, they're in cy" held universally.

ADR-138 shattered that assumption by introducing transit/isolated musicians — nodes that
appear in structured recordings but carry no guru-shishya lineage edges and are therefore
excluded from `_cyElements`. The raw `elements[]` array (the flat data loaded into the page
before Cytoscape initialises) became the ground-truth store for these musicians, but no
systematic update was made to the data-resolution layer. Fixes were applied locally and
inconsistently: `buildArtistSpan` and the legacy `youtube[]` branch of `buildTrail` received
`elements[]` fallbacks, but every function in `media_player.js` and `panel_components.js`,
the structured-recordings branch of `buildTrail`, and the co-performer resolution loop were
left querying `cy` exclusively.

The result is a **split authority problem**: some code treats `elements[]` as the source of
truth, other code treats `cy` as the source of truth, and there is no single function that
resolves a musician id to its display data by checking both. The canonical two-step pattern
in `buildArtistSpan` (lines 1198–1204) is the correct approach; it needs to be lifted into a
named helper and used everywhere.

---

## Recommendations

### R-001: Extract a `resolveNode(id)` helper function

Define a single function that abstracts the two-step resolution pattern already present in
`buildArtistSpan`:

```js
// Proposed helper — does not yet exist in the codebase
function resolveNode(id) {
  if (!id) return null;
  const cyNode = cy.getElementById(id);
  if (cyNode && cyNode.length) return cyNode.data();
  const raw = elements.find(e => !e.data.source && e.data.id === id);
  return raw ? raw.data : null;
}
```

Returns a plain data object (or null) regardless of whether the musician is in `cy` or only
in `elements[]`. All findings below reduce to: replace `cy.getElementById(id).data(field)`
with `resolveNode(id)?.[field]`.

**Routing**: Carnatic Coder

---

### R-002: Fix F-001 — structuredPerfs primary performer data (bani_flow.js:492–496)

Replace the `pNode = cy.getElementById(...)` block with `resolveNode` so that `born`,
`lifespan`, `color`, and `shape` are populated from `elements[]` when `cy` returns an empty
Collection.

**Routing**: Carnatic Coder

---

### R-003: Fix F-002 — perfMap co-performer label/color/shape (bani_flow.js:561–565)

Replace `cy.getElementById(pf.musician_id)` with `resolveNode(pf.musician_id)`. The
`coLabel` fallback chain should become:
`resolveNode(pf.musician_id)?.label || pf.unmatched_name || null`.

**Routing**: Carnatic Coder

---

### R-004: Fix F-004 — yt-type track label (bani_flow.js:317–323 and 1620–1627)

Replace both `cy.nodes().forEach(...)` loops with an iteration over `elements[]` (which
includes transit musicians). Consider extracting a `_ytVidLabel(vid)` helper called from
both sites to eliminate the code duplication. Also fix the `yt`-type `matchedNodeIds`
construction at line 88–92 to include transit musicians.

**Routing**: Carnatic Coder

---

### R-005: Fix F-005 — panel_components.js musician chips (lines 299–313)

After `const mNode = cy.getElementById(mid)`, add a raw-elements fallback for both `mLabel`
and `eraId` so that transit musicians display their actual label and era tint.

**Routing**: Carnatic Coder

---

### R-006: Fix F-006, F-007, F-008, F-009, F-010, F-012 — media_player.js data-resolution calls

All six media_player.js findings share the same fix: replace bare `cy.getElementById(id)`
data accesses with `resolveNode(id)`. Specific sites:

- `_buildMusicianChipForFooter` (lines 404–413): era + instrument
- `buildComposerChip` (line 754): era bare call — add null guard and elements fallback
- `_buildLecdemSubjectFooter` musicians loop (lines 889–891): label + era
- `buildConcertBracket` label collection (line 996): label
- `buildConcertBracket` chip rendering (lines 1047–1058): era + instrument bare calls
- `_buildLecturerChip` (lines 2351–2357): era

**Routing**: Carnatic Coder

---

### R-007: Fix F-011 — buildRecordingsList unsafe fallback (media_player.js:1938)

Replace:
```js
const nd = nodeData || cy.getElementById(nodeId).data();
```
with:
```js
const nd = nodeData || resolveNode(nodeId);
```

This is the highest-priority fix: the current code produces a `TypeError` at runtime for any
transit musician panel opened when `nodeData` is null. All downstream panel sections
(`nd.tracks`, `nd.label`, etc.) depend on this line being safe.

**Routing**: Carnatic Coder

---

### R-008: ADR candidate — formalise the resolveNode contract

The split authority (`cy` vs `elements[]`) is an architectural decision, not just a bug fix.
An ADR should formalise:

1. `elements[]` is the ground-truth data store for all musician metadata.
2. `cy` is the *topology and styling layer* only — it holds element position, style class, and edge connectivity.
3. Any function that reads musician metadata (label, born, era, colour, instrument) must use `resolveNode` or an equivalent lookup against `elements[]`, never `cy.getElementById(id).data()` directly.
4. The `cy` node data fields (label, born, era, etc.) are an optimisation cache populated at Cytoscape init time; they must not be treated as the only source.

This constraint would prevent the class of bug introduced each time a new chip-builder
function is written without consulting the ADR-138 precedent.

**Routing**: Graph Architect (ADR candidate)

---

## Routing Summary

| Finding | File | Lines | Recommendation | Agent |
|---|---|---|---|---|
| F-001: structuredPerfs primary performer cy-gated | `bani_flow.js` | 492–510 | R-002 (resolveNode) | Carnatic Coder |
| F-002: perfMap co-performer silent drop | `bani_flow.js` | 561–570 | R-003 (resolveNode) | Carnatic Coder |
| F-003: nodeBorn map from cy.nodes() only | `bani_flow.js` | 4–5 | R-002 (side effect fix) | Carnatic Coder |
| F-004: yt-type track label cy.nodes() iteration (×2 + matching) | `bani_flow.js` | 88–92, 317–323, 1620–1627 | R-004 (elements iteration) | Carnatic Coder |
| F-005: panel_components musician chip label + era | `panel_components.js` | 299–313 | R-005 (resolveNode) | Carnatic Coder |
| F-006: _buildMusicianChipForFooter era/instrument | `media_player.js` | 404–424 | R-006 (resolveNode) | Carnatic Coder |
| F-007: buildComposerChip bare cy call | `media_player.js` | 754–756 | R-006 (resolveNode) | Carnatic Coder |
| F-008: _buildLecdemSubjectFooter musicians label/era | `media_player.js` | 889–891 | R-006 (resolveNode) | Carnatic Coder |
| F-009: buildConcertBracket co-performer label → id fallback | `media_player.js` | 996–1001 | R-006 (resolveNode) | Carnatic Coder |
| F-010: buildConcertBracket chip era/instrument bare calls | `media_player.js` | 1047–1058 | R-006 (resolveNode) | Carnatic Coder |
| F-011: buildRecordingsList unsafe fallback | `media_player.js` | 1938 | R-007 (resolveNode, highest priority) | Carnatic Coder |
| F-012: _buildLecturerChip era from cy only | `media_player.js` | 2351–2357 | R-006 (resolveNode) | Carnatic Coder |
| R-008: formalise resolveNode contract | — | — | ADR candidate | Graph Architect |
