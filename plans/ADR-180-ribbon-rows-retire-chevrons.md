# ADR-180: Ribbon Rows — Retiring the Fold Chevrons

**Status**: Accepted
**Date**: 2026-10-19
**Agents**: surface (UI surgeon) → tester
**Depends on**: ADR-028 (theme tokens), ADR-128 (panel components), ADR-166
(section play-acts), ADR-177 (section action group), ADR-179 (single-line rows
+ shared action column).

---

## Context (forces in tension)

ADR-179 made panel rows single-line and gave play/enqueue/count one shared
action column, but it only treated the *text*: the tree kept its fold
chevrons, so a click still opened a second, vertically stacked band of detail.
Rows that carried metadata on a second line (the composer chip in
`.tree-comp-meta`, the co-performer chip strip under a concert header, the
segment/version lists behind `.tree-comp-chevron` / `.concert-chevron` /
`.row-accordion-chevron`) stayed variable height. Long lecdem titles still
clipped because the label chip — not a `.trail-chips` wrapper — was the row's
only content and refused to shrink.

The user's directive: **fixed row height everywhere, achieved with a
horizontal scrollbar instead of word-wrap; one vertical for all play / enqueue
/ count buttons; category item buttons identical to row buttons; and the
chevrons that dropdown more detail retired in favour of a single scrollable
line.**

## Decision

### 1. One fixed-height ribbon per entry

`theme.py`/`theme.js` gain `rowHeight` (`--row-height`, `28px = rowActSize +
4px`). Every panel row container (`.row-accordion-header`, `.trail-row2`,
`.tree-comp-header`, `.tree-group-header`, `.concert-title-row`,
`.concert-perf-item`, `.mp-playlist-track`) is a non-wrapping flex line of
exactly that height, with vertical padding stripped from its list item.

### 2. A single scroll surface + a pinned action column

Each row has exactly one horizontal-scroll surface —
`.row-accordion-scroll` / `.tree-comp-main` / `.concert-title-main` /
`.concert-perf-main` / `.trail-chips` / `.tree-header-text` — and the action
group (`.trail-acts`, `.tree-comp-acts`, or the section's `.section-hdr-right`)
is a non-shrinking sibling that owns the fixed two-slot (rows) or three-slot
(playable section headers) column. Counts reserve the same full three-slot
group so every count badge sits on the same vertical even in a non-playable
section.

A lone play button is forced into the **first** slot (`.rec-play-btn`'s global
`margin-left:auto` is reset inside the strip), so a single-play lecdem lines up
with the play column of a play+enqueue row above it.

Identity and label chips are **immutable**: `.comp-chip`, `.raga-chip`,
`.musician-chip`, `.composer-chip`, `.yt-label-chip`, `.lecdem-label-chip`,
`.concert-title`, … are forced to `flex: 0 0 auto; max-width: none;
overflow: visible; text-overflow: clip`. A name chip can never be shrunk or
ellipsized to make room for the text label beside it (the old
`.tree-leaf-primary > .musician-chip` and `.rec-row1 .comp-chip` rules did
exactly that); the row scrolls instead.

### 3. Detail is inlined, not folded

The fold chevrons are retired and their content is rendered inline or always
visible:

- `buildRowAccordion` keeps its name but never creates a chevron or a hidden
  body: `bodyEls` are appended into `.row-accordion-scroll`.
- `buildSection` drops the `.section-collapse-btn`; sections render open (all
  call sites already defaulted to `collapsed:false`).
- `buildCompNode` inlines the composer chip on the composition line and shows
  every recording version (no `.tree-comp-chevron`).
- `buildConcertBracket` / `_buildLecdemBracket` inline co-performers and always
  render the perf/segment list (no `.concert-chevron`).
- `buildPlaylistRow` is a header ribbon plus one track ribbon per entry.
- Flat lecdem rows inline lecturer/subject chips into the existing label row
  rather than wrapping it in an accordion.

### 4. Label chips shrink

When a label chip (`lecdem-label-chip`, `yt-label-chip`, `rec-title`,
`lecdem-label`) is a row's only content it becomes the scroll surface
(`flex:1 1 auto; min-width:0; overflow-x:auto; white-space:nowrap`), so long
titles stay readable and the play button never leaves the viewport.

## Consequences

**Positive**
- Every entry is the same height; play/enqueue/count share one vertical across
  rows and categories in both panels.
- Full strings remain reachable by scrolling instead of being truncated or
  wrapping.
- Fewer moving parts: no chevron state, no hidden bodies, no phantom-chevron
  spacing hacks.

**Negative / costs**
- Lists are longer because nothing folds; the panel scrolls, which is the
  intended trade.
- A horizontal (thin) scrollbar appears inside long rows.
- Section collapse and row-accordion semantics are gone; anything that relied
  on `.expanded` / `hidden` body state must read the always-visible DOM.

## Implementation (as landed)

- `theme.py` / `theme.js`: `rowHeight` + `--row-height`.
- `base.html`: ADR-180 block at the end of the stylesheet (chevron kill,
  ribbon geometry, scroll surfaces, pinned actions, single-line labels,
  always-visible perf lists, uniform padding), plus an addendum that keeps every
  panel/playlist scrollbar transparent at rest and reveals it on `:hover`
  (`scrollbar-color` is inherited, so the sidebar-level transparent value hides
  every descendant scrollbar).
- `panel_components.js`: `buildSection` chevron removed; `buildRowAccordion`
  inline ribbon.
- `bani_flow.js`: `buildTreeComp` multi-version always open; context label
  inlined; flat lecdem subjects inlined.
- `media_player.js`: `buildCompNode` composer inline + versions always visible;
  concert/lecdem brackets chevron-free; perf items and playlist rows
  restructured into ribbon + pinned acts.
- `UIMAP.md` §1/§2/§5/§6.3/§6.5 CSS hooks and ADR lists updated.

**Verified**: `bani-render && python3 carnatic/cli.py validate`; full pytest
suite, including the UI-surface-map drift guard, green.

---

[ADR: ADR-180, ADR-028, ADR-128, ADR-166, ADR-177, ADR-179]
