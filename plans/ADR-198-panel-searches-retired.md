# ADR-198 — Retire the panel search bars; nav + add join the command row

**Status**: Accepted (user directive 2026-10-22)
**Date**: 2026-10-22
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-174 (UI surface map), ADR-178
(unified content filter), ADR-184 (grand track search), ADR-190 (search-field
shell), ADR-191 (panel top row).
**Supersedes**: ADR-190 D1/D5 (panel searches as siblings of the grand bar),
ADR-191 D1–D3 (nav + add living in a standalone top row).
**Scope**: `carnatic/render/templates/base.html`,
`carnatic/render/templates/search.js`, `carnatic/render/templates/bani_flow.js`,
`carnatic/render/templates/graph_view.js`,
`carnatic/render/templates/media_player.js`, UIMAP §1 / §2 / §6.

---

## Context

The grand track search (ADR-184) now browses every performance, musician,
raga and composition through one indexed, playable result list. The two panel
searches — `#bani-search-input` (raga/composition picker) and
`#musician-search-input` (musician/composer picker) — duplicate that reach with
a narrower index and a second interaction to learn.

They also cost the most constrained columns a full row. ADR-191 had already
retired the panel title banners and moved nav/search/add into one top row, but
the search consumed that entire row. The content-filter row below it was a
second row of chrome whenever a subject was loaded.

## Decision

### D1 — Delete both panel search bars

`#bani-search-input`, `#musician-search-input`, their dropdowns, scope labels
and the `.search-field`/`.search-glyph`/`.search-clear` instances inside the
panels are removed. `search.js` keeps only the grand-search IIFE (plus the
`normText` helper it uses); the shared `makeDropdown` helper and the two panel
search IIFEs go with them. The delegated `.search-clear` handler remains for
the grand bar.

The grand track search is now the single lookup surface. `triggerBaniSearch`
and `selectNode` remain the canonical funnels — they are simply reached from
the grand results, chips, wheel and canvas instead of a panel input.

### D2 — Nav rides the chip row; add leads the filter row

The history pair moves into the subject chip row:

```
[icon] [chip ………………………………] [popup] [↗]   [back] [forward]
```

It sits in a pinned `.panel-chip-actions` group at the row's right edge, so a
long subject name still scrolls between the chip and the nav.

The context add control moves to the **leftmost** slot of the content-filter
row, so the filter itself reads as indented relative to the chip above it:

```
[+] [Filter content ……………………………………………] [▶ play-all] [+ enqueue]
```

That row appears only when a subject/node is loaded. Its transport pair shares
the same right edge as the play/enqueue buttons on the panel's content rows.

Both panels carry `.panel-empty` while no subject/node is loaded. CSS hides the
filter input and transport pair in that state while leaving the add control in
place; the chip row keeps nav visible. For the bani panel `#bani-info` is now
always present so the chip row can host nav even before a subject is chosen.

### D3 — Reclaim the row, not just the field

There is no standalone `.panel-top-row` anymore. With the search retired, the
old top row's height is fully reclaimed: the sticky panel begins with the
subject header (when loaded), then the command row. The panel search CSS
(`.search-wrap`, `.panel-search-wrap`, `.search-result-item`,
`.search-scope-label`) is deleted; the grand bar keeps the ADR-190 shell.

## Consequences

- Both sidebars merge the old top row into the chip row, reclaiming roughly
  one 40px row of vertical space while browsing; the filter row only appears
  when it has a subject to act on.
- The chip row is the panel's first row in every state; the filter row keeps
  full width because nav no longer shares it. The leftmost add button indents
  the filter input under the chip, making its ownership explicit.
- `#bani-info` / `#node-info` no longer add a second side inset: the subject
  chip and the add button share the same left edge (and their rows share the
  same right edge), so the chip no longer overshoots the control beneath it.
- `#node-header-chip-row` is explicitly `width: 100%`. Its parent
  `#node-header` is a shrink-to-fit flex column, so without the explicit width a
  short musician name lets the row collapse to its content and the nav cluster's
  `margin-left: auto` has no free space — the arrows then sit next to the chip
  instead of at the panel's right edge.
- The subject chip remains the chip row's horizontal-scroll surface; the
  pinned nav cluster takes the right edge, so very long names scroll rather
  than wrapping or pushing the controls off-panel.
- `setScopeLabels()` (which toggled the retired "searching all …" labels during
  chip filters) is removed; era/instrument filtering still works.
- A new panel command must be placed in the command row, not in a resurrected
  top row. `.panel-empty` is the visibility contract for subject-only controls.
- `test_grand_search_editor.py` now asserts exactly one `.search-field` and a
  command row carrying nav/add; `test_ui_surface_map_drift.py` no longer claims
  `#bani-search-input`.

## Alternatives considered

- **Keep a slim nav/add top row** — rejected: it preserves the row height this
  ADR exists to reclaim and leaves a mostly empty strip above the subject.
- **Put + in the subject header only** — rejected: the button must be reachable
  in the empty state, before any subject header exists.
- **Floating nav/add over the scroll area** — rejected: overlays content in a
  dense ribbon UI and breaks the panel's flush-first-row geometry.
