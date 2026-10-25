# ADR-205 — Mobile Playlist Bar drops the chip summary; compact search rows

**Status**: Accepted (user directive 2026-10-25)
**Date**: 2026-10-25
**Author**: pi (`surface` skill)
**Depends on**: ADR-175 (persistent Playlist Bar), ADR-184 (grand track search
+ now-playing overlay), ADR-194 (bottom placard), ADR-195 (Playlist Editor is
the modal), ADR-196 (playlist rows capped at two lines), ADR-197 (only the
playing row owns operators), ADR-204 (whole-bar video toggle).
**Scope**: `carnatic/render/templates/base.html`,
`carnatic/render/templates/media_player.js`,
`carnatic/render/templates/search.js`, `carnatic/render/UIMAP.md` §5,
`test_playlist_bar_layout.py`, `test_grand_search_editor.py`,
`test_ui_surface_map_drift.py`.

---

## Context

Two pieces of mobile chrome carried more identity text than a phone can show.

1. **The Playlist Bar's `#pb-summary`** rendered the current item's chip strip
   on one scrolling line. At phone width the strip was almost always truncated
   ("Bomb", "Ada…"), so it named nothing. The same identity is already painted
   in two places a tap away: the Playlist Editor modal (opened by `#pb-count`)
   and the video's own `.mp-now-playing` placard (ADR-184/ADR-194). The summary
   was redundant chrome that consumed roughly half the bar.
2. **Grand-search result rows** (`.track-result`) were 53px tall. The culprit
   was not the chips (20px): the blanket mobile touch rule
   `button:not(…) { min-height: 44px }` caught `.track-result-play` /
   `.track-result-enqueue`, inflating each row by 22px of dead vertical space.
   The per-row horizontal scrollbar was also always painted, adding noise to a
   surface whose result text is truncated by design.

## Decision

### D1 — The Playlist Bar carries controls, not identity

`#pb-summary` is removed: markup, `_renderPlaylistBar()` population, and its
scroll CSS. The bar is now transport + `#pb-count` + the current item's
operators + volume. On desktop the strip centres in the band; on mobile
(≤768px) `justify-content: space-between` spreads it across the freed width.
The empty bands remain the ADR-204 whole-bar video-toggle hit area. No
now-playing identity is lost — the editor and the video placard own it.

### D2 — Search rows are compact single lines

`.track-result-play` / `.track-result-enqueue` are added to the `:not(…)`
chain of the mobile 44px rule, so the natural row height is the icon (22px) plus
2px padding. The two buttons keep a small off-layout hit expansion
(`::after { inset: -3px -3px }`) so tappability does not depend on the row
box. The row keeps its single-line horizontal chip scroll.

### D3 — The row scrollbar is an affordance, not chrome

`.track-result-chips` starts with a transparent scrollbar
(`scrollbar-color: transparent transparent`) and reveals `--fg-muted` only on
`:hover`, `:focus-within`, or while `.is-scrolling` is set. `search.js`
installs a capture-phase `scroll` listener on the dropdown (scroll events do
not bubble), toggling `.is-scrolling` on the strip and clearing it 700ms after
the gesture ends. This mirrors the ADR-180 ribbon-scrollbar contract used by
the sidebars, and adds the touch path hover cannot cover.

## Consequences

- The Playlist Bar shows only actionable controls; a phone bar is no longer
  half truncated identity text. `#pb-summary` is retired across UIMAP, the
  drift table, and the layout guard.
- Search result rows drop from 53px to 27px, roughly doubling the results
  visible in the dropdown without shrinking the chip type.
- The play/enqueue pair is 22px visually (its hit area expands off-layout).
  The row itself remains the play target, so play accuracy is unaffected; the
  `+` keeps a compact target for accurate enqueue.
- The horizontal scrollbar appears exactly when the user reaches for it and
  fades out afterwards, so the resting result list is clean.
