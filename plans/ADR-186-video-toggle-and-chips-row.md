# ADR-186 — The Video Toggle and the Single-Row Now-Playing Strip

**Status**: Proposed → Accepted (user directive 2026-10-25)
**Date**: 2026-10-25
**Author**: pi (`surface` skill)
**Depends on**: ADR-161 (`.mp-toggle-btn` depressed-toggle primitive),
ADR-175 (Playlist Bar / parent-inherits rule), ADR-183 (fixed docked player),
ADR-184 (now-playing overlay + thin editor bar).
**Scope**: `carnatic/render/templates/base.html`, `media_player.js`,
UIMAP §5, `test_ui_surface_map_drift.py`.

---

## Context

ADR-183 made the content player a bare, fixed video surface with its own
minimize (`—`) and close (`✕`) controls, and ADR-184 added a `.mp-now-playing`
chip overlay that names the sounding track. Two rough edges surfaced:

1. The chip overlay is absolutely positioned at `top: 34px` inside
   `.mp-video-wrap`, so the track chips sit on a **second line below** the
   minimize/close row — extra vertical chrome on a player whose whole point is
   the video.
2. `_toggleMinimized()` hides a content player with `display: none`. Once the
   user minimizes, the docked window vanishes with **no affordance to bring it
   back** (the Playlist Bar remains, but carries no show/hide control).

## Decision

### D1 — The chips share the video's control row

The desktop `nowPlaying` element is appended into `.mp-player-controls`
(between `minBtn` and `closeBtn`) instead of `.mp-video-wrap`. A scoped rule
`.mp-player-controls .mp-now-playing` drops the absolute positioning
(`position: static; flex: 1 1 auto`) so the row reads

```
[ — minimize ]  [ chips … ]  [ ✕ close ]
```

The base `.mp-now-playing` absolute rule is untouched, because the mobile
player still mounts its overlay inside `.mp-video-wrap`. Fullscreen is
unaffected: `.mp-player-controls` is a sibling of `.mp-video-wrap` but is not
a descendant of the Fullscreen element (`.plyr`), so the API hides it.

### D2 — A film-strip toggle restores a minimized video

A new `.mp-video-toggle` button (film-strip SVG) joins the operator set:

- `#pb-video-toggle` in the Playlist Bar, next to `#pb-watch`.
- `.mp-video-toggle` in the **current** queue row, next to the row's play /
  copy / share / watch operators.

The bar inherits the row's set under the ADR-175 parent-inherits rule, so the
toggle is reachable whether the editor is folded or open. `aria-pressed="true"`
means the video is **shown** (the `.mp-toggle-btn` depressed state); the title
reads `Hide video` / `Show video`. It is disabled when there is no mounted
current player.

`_videoVisible()` reports the current instance's `display` state.
`_toggleVideoVisibility()` calls `_toggleMinimized` on desktop and the mobile
expand/collapse pair, then `_refreshQueuePanels()` re-renders both faces. The
video's own minimize button also refreshes the row/bar so the two controls
never disagree.

## Consequences

- The now-playing chips no longer cost a second line on desktop; the mobile
  overlay is unchanged.
- `_syncNowPlayingOverlays()` is unchanged — it still queries `.mp-now-playing`
  by class, now found inside the controls overlay on desktop.
- The toggle is a current-player control, so it appears only on the current
  row (like the volume slider) and inherits into the bar when the editor folds.
- `_toggleMinimized` remains the single minimize primitive; `#pb-video-toggle`
  and `.mp-video-toggle` are thin wrappers over it.