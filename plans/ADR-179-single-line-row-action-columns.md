# ADR-179: Single-Line Rows and the Shared Action Column

**Status**: Accepted
**Date**: 2026-10-18
**Agents**: surface (UI surgeon) → tester
**Depends on**: ADR-028 (theme tokens), ADR-128 (panel components), ADR-166 (section play-acts), ADR-177 (section header action group), ADR-175 (playlist row/bar parity).

---

## Context (forces in tension)

Panel rows grew organically: trail leaves, raga-tree leaves, composition nodes,
concert brackets, lecdem rows, playlist rows, and section headers each chose
their own label wrapping and action layout. Long titles wrapped or clamped to
two lines; some rows carried only a play button, others play + enqueue; section
headers used 18px buttons while rows used 26px. The result was ragged: action
buttons landed in different columns, and counts floated wherever their section
happened to place them.

The user's directive: **no item wraps**, every item that sits on a line scrolls
horizontally to reveal its full string, all row items get a fixed action column
so play/enqueue align vertically, category-level play/enqueue match row-button
size, and every count (playlists, lecdems, concerts, pieces, recordings,
compositions) sits on one vertical.

## Decision

### 1. One action square

`theme.py`/`theme.js` gain `rowActSize: 24px` and `rowActGap: 4px`, emitted as
`--row-act-size` / `--row-act-gap`. Every play, enqueue, and count affordance
uses that square: `.rec-play-btn`, `.mp-plus-btn`, `.section-play-btn`,
`.section-enqueue-btn`, and the count badges.

### 2. Two-slot row action column

`.trail-acts` and `.tree-comp-acts` inside either panel reserve exactly two
slots (`2 × rowActSize + gap`) and are pinned right with `justify-content:
flex-start`. A row with only play leaves the enqueue slot blank; its play button
still occupies the first slot, so play stays in one column and enqueue in the
next.

### 3. Three-slot header action column

`.section-hdr-right` reserves three slots (count · play · enqueue) whenever the
section is playable, two when playable without a count, one when it only shows a
count. Because it is right-pinned, the play/enqueue slots line up with the row
column beneath. Counts get the same height and minimum width as buttons.

Playlist and concert/lecdem counts use the same badge geometry and are placed at
the right edge of their header (with `margin-right: rowActGap`) so their right
edges match the section-count column.

### 4. One line, then horizontal scroll

Panel text leaves are `white-space: nowrap` with `overflow-x: auto` and a thin
scrollbar; multi-chip strips (`trail-chips`, co-performer/subject/accordion
bodies, playlist track chips) are non-wrapping rows that scroll sideways. The
section label wrap is the scrollable part of a header, keeping the right-hand
action group fixed.

## Consequences

**Positive**
- Play, enqueue, and count badges share a single vertical per panel regardless
  of whether a row has one or two actions.
- Full titles remain readable through horizontal scroll instead of truncation.
- One theme token controls all action geometry.

**Negative / costs**
- Horizontal scrollbars appear inside chips when their text exceeds the row.
  This is the requested trade: full strings over fixed truncation.
- Rows with only play leave a deliberate empty enqueue slot.
- `:has()` powers the adaptive header-column widths; browsers without `:has`
  fall back to the base group layout (still usable, less aligned).

## Implementation (as landed)

- `theme.py` / `theme.js`: `rowActSize`, `rowActGap` + CSS var export.
- `base.html`: ADR-179 block at the end of the stylesheet (action squares,
  action strips, count badges, no-wrap/scroll rules).
- `panel_components.js`: section count renders as a bare number in a badge.
- `media_player.js`: concert/lecdem counts become numeric badges placed in the
  header title row; concert/lecdem/segment play buttons move into `.trail-acts`;
  playlist track count becomes a numeric badge.
- `UIMAP.md` §2/§5 CSS hooks updated.

**Verified**: `bani-render && python3 carnatic/cli.py validate`; UI drift,
playlist-bar, and mobile-surface tests green.

---

[ADR: ADR-179, ADR-028, ADR-128, ADR-166, ADR-177, ADR-175]
