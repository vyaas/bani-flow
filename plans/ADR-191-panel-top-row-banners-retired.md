# ADR-191 — Panel top row: title banners retired, square nav + add

**Status**: Accepted (user directive 2026-10-22)
**Date**: 2026-10-22
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-066 (panel header nav layout),
ADR-127 (vocabulary chips), ADR-128 (panel components), ADR-142 / ADR-144
(chip dblclick edit affordance), ADR-174 (UI surface map), ADR-190 (unified
search field).
**Supersedes**: ADR-066 (nav-around-centred-title), and the panel-title halves
of ADR-142 Phase D / ADR-144 Phase A + C (banner chip as the add entry point).
**Scope**: `carnatic/render/templates/base.html`, UIMAP §1 / §2.

---

## Context

Both sidebars opened with a centred title **banner** — a `chip-panel-title`
chrome reading `BANI FLOW` / `MUSICIAN` — with circular back/forward buttons
pinned to its left and the panel search on its own row below. The banner cost
a full row of vertical space in the most constrained column of the app, and
its only non-decorative function was a hidden double-click gesture
(ADR-144): dblclick `MUSICIAN` → Add Musician; dblclick `BANI FLOW` → the
raga-or-composition picker. Single-click did nothing, so the affordance was
undiscoverable and the prominent chip mostly spent pixels.

## Decision

### D1 — Retire the banner, promote the search row

The `#bani-flow-panel > h3` and `#musician-panel > h3` banners are deleted
(and with them the now-unused `.chip-panel-title` / `.bani-chip` CSS).
`#bani-sticky` / `#right-sticky` now begin with `.panel-top-row`, a single
flex row holding the nav group and the panel search. The search moves up one
row and the panel reclaims the banner's height.

### D2 — Nav buttons sit left of the search, and are square

The back/forward pair is a `.panel-nav-group` to the left of the search.
`.panel-nav-btn` changes from a 28px circle (`border-radius: 50%`) to a
`--search-height` (32px) square using `--chip-border-radius` (4px), so the
buttons, the search field and the chips share one radius vocabulary.

### D3 — Add is a visible `+`, not a hidden dblclick

Because the banners carried the only global Add Musician / Add to Bani Flow
entry points, deleting them cannot silently drop that function. A compact
square `+` (`.panel-add-btn`) sits at the right end of the top row — left of
nothing, so the nav-left-of-search rule in D2 still holds. It is a normal
single-click button calling `openEntryForm('musician')` /
`openEntryForm('bani-flow-picker')` (the handler the banner dblclick used),
upgrading an undiscoverable gesture into a labelled control.

## Consequences

- More usable vertical space in both sidebars; the search keeps the full
  width minus the nav + add buttons.
- The panel search dropdown width tracks the narrower search field (~218px on
  the 360px desktop panel).
- `chip_dblclick.js` still dispatches `section-add` for dynamic section
  chips; only the two static banner targets are gone.
- `data-section-action="add-musician"` / `"add-bani-flow"` are no longer used
  in `base.html`.
