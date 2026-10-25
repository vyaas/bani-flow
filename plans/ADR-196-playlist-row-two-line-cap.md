# ADR-196 — Playlist rows are capped at two lines

**Status**: Accepted (user directive 2026-10-24)
**Date**: 2026-10-24
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-174 (UI surface map), ADR-184
(per-row operator set), ADR-195 (Playlist Editor is a modal form).
**Supersedes**: ADR-195 D3's "the modal editor rows wrap chips" clause.
**Scope**: `carnatic/render/templates/base.html`,
`carnatic/render/templates/media_player.js`, `carnatic/render/UIMAP.md` §5,
`test_playlist_bar_layout.py`.

---

## Context

The Playlist Editor row (`.mp-queue-item`) is a wrapping flex line that holds
the row identity (grip · position · reorder · chips) plus the action set. Every
row carries the operators (play · copy · permalink · watch · enqueue · remove);
the current row additionally carries stop · video-toggle · volume.

Because the row was one flat `flex-wrap: wrap` line, a wide action set pushed
the chips into a narrow column and let the row wrap arbitrarily. On a phone the
current item grew to three visual lines — grip/pos/reorder, then chips, then
operators — while the modal's chip-wrap override (`flex-wrap: wrap`) let a long
chip set balloon any row. The current item was disproportionately tall and no
longer shared the form of a non-playing row.

## Decision

### D1 — A row has exactly two flex children

The row is split into two non-wrapping groups:

- `.mp-queue-meta` — grip · position · reorder · chips.
- `.mp-queue-actions` — play · stop · operators · video-toggle · volume ·
  enqueue · remove.

The outer `.mp-queue-item` keeps `flex-wrap: wrap`, so it can wrap *between* the
two groups but never inside either one. The row's height is therefore bounded by
`metadata line + action line` — two lines maximum, regardless of how many
operators the current item owns.

### D2 — Chips scroll on one line, even in the modal

`#hd-body .playlist-editor .mp-queue-chips` keeps the single-line horizontal
scroll (nowrap + `overflow-x: auto`), superseding ADR-195 D3's chip-wrap clause.
A wrapping chip cluster could grow the metadata group past one line and break
the two-line ceiling; the form's width is spent on the action rail instead.

### D3 — Mobile: the current item wraps, a non-current item stays inline

On a phone (≤ 768px) the current item's wider action set (stop · video-toggle ·
volume) cannot share the line with the chips, so `.mp-queue-current .mp-queue-meta`
takes `flex-basis: 100%`: metadata on line 1, actions on line 2. A non-current
item's smaller set stays inline — a single row. The reorder pair lies flat
(`flex-direction: row`) so its two 44px touch targets do not stack into an 89px
column that would inflate the metadata row.

### D4 — Desktop collapses to a single row

On a wide viewport the action set fits beside the chips, so every row —
including the current one — is one line. `.mp-queue-meta { flex: 1 1 0 }` lets
the chips yield width to the action rail instead of greedily filling the line
and forcing a wrap.

## Consequences

- **Gains**: the current item matches the non-current form on desktop; on mobile
  it is a readable metadata row + action row; a long chip set can no longer
  balloon a row; the row height is structurally bounded rather than tuned.
- **Costs**: chips are a horizontal-scroll surface in the editor too (they no
  longer wrap); a non-current mobile row shows less chip text before scrolling.
- The bar's `#pb-summary` (ADR-179) is untouched — it was already one line.
