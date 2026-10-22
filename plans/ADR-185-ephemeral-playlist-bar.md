# ADR-185 — The Playlist Bar Is Ephemeral Chrome

**Status**: Proposed → Accepted (user directive 2026-10-24)
**Date**: 2026-10-24
**Author**: pi (`surface` skill)
**Depends on**: ADR-175 (persistent Playlist Bar), ADR-176 (non-overlap /
`_playlistUiRect` / dynamic view wall), ADR-183 (fixed docked player),
ADR-184 (grand search bar + thin editor bar).
**Scope**: `carnatic/render/templates/base.html`, `media_player.js`, UIMAP §5,
`test_playlist_bar_layout.py`.

---

## Context

ADR-184 gave the grand track search the old top slot (`#search-bar`, desktop
`top:12px`) and pushed the Playlist Bar to the second band (`top:56px`). The bar
is a **permanent** fixture: with an empty queue it still renders a faded
`Playlist empty` hint (`#playlist-bar.pb-empty { opacity: 0.6 }`), and the
static `--chrome-top: 96px` reserves its band whether or not anything is
playing. That reserved band is dead real estate for the overwhelmingly common
"nothing queued yet" state, and an empty control strip is pure noise.

## Decision

### D1 — No queue, no bar

`#playlist-bar.pb-empty` becomes `display: none` instead of an opacity fade.
The bar appears the moment the queue has ≥ 1 item and vanishes when it is
emptied (`MediaQueue` has no items, or is inactive). The `Playlist empty` hint
is left in the markup but is no longer reachable.

### D2 — The empty state reclaims the second band

The static `--chrome-top` now clears only the grand search bar (desktop
`56px`; mobile unchanged at `176px`, where it must still clear the full-width
bar so drawers are never occluded). When the bar *is* present, the ADR-176
dynamic wall still applies — `#canvas-wrap` keeps
`margin-top: max(--chrome-top, --playlist-ui-bottom + 10px)` — so the view
(and its layout controls) is pushed clear of the bar exactly as before.

This is deliberately **not** a blanket overlay: the ADR-176 contract that the
Playlist UI never covers the layout controls is preserved. The real-estate win
comes from the bar being absent when empty, not from letting it float over the
canvas.

### D3 — The bar's own visibility drives the wall

The dynamic wall was originally published by a `ResizeObserver` on the *editor*
(`.mp-queue-bar`), which does not fire when the bar itself appears/disappears.
`_renderPlaylistBar()` now calls `_syncViewTopInset()` and requests
`window.refitViewWindow()` after every render, so the first item added (editor
folded) still lowers the view's top wall. `_playlistUiRect()` returns `null`
for a hidden bar, collapsing the wall to `--chrome-top`.

## Consequences

- Adding the first track: bar appears, view slides down (existing wall
  behaviour). Removing the last track: bar disappears, view rises to the search
  bar. Both are driven by the existing `_refreshQueuePanels()` path.
- Mobile geometry is unchanged: the bar still occupies its full-width band when
  present, and `--chrome-top` still clears it so drawers/canvas are never
  occluded.
- `#playlist-bar.pb-empty` semantics change from "dimmed" to "absent"; any
  future code that relied on the hint being visible must be revised.
