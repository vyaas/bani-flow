# ADR-183 — The Fixed, Docked Content Player

**Status**: Accepted (user directive 2026-10-21)
**Date**: 2026-10-21
**Author**: pi (`surface` skill)
**Depends on**: ADR-175 (Playlist Bar / bare content players / `_dockPlayer`),
ADR-176 (non-overlap contract / `_playlistUiRect` / `_columnBounds`).
**Scope**: `carnatic/render/templates/media_player.js`, `base.html` (player +
editor CSS), UIMAP §5, `test_fixed_dock_player.py`.

---

## Context

ADR-175 made the content player *bare* — the video surface plus a thin
`.mp-drag-handle` strip and a `.mp-resize` corner grip — while the persistent
Playlist Bar + `.mp-queue-bar` editor became the single face of the Current
Playlist. ADR-176 then docked that player magnetically beneath the playlist UI
and enforced a four-surface non-overlap contract.

Two problems remained:

1. **The player was still a floating window.** It could be dragged anywhere and
   resized arbitrarily, so its width/height were decoupled from the Playlist UI
   it was supposed to inherit. A dragged player could be left detached
   (`el._detached`) and a resized one only "matched" the UI until the user
   grabbed the grip.
2. **The editor could push the video off-screen.** The editor deepens downward
   and the player docks directly beneath it. Its CSS cap was
   `max-height: min(60vh, 420px)`, which on short/wide viewports placed the
   player — including its top-left minimize and top-right close controls —
   below the fold.

## Decision

**The content player is a fixed, docked surface.** Its geometry is derived, never
user-authored:

- **No drag, no resize.** `createPlayer()` no longer builds `.mp-drag-handle` or
  `.mp-resize`, and never calls `wireDrag`/`wireResize`. Utility players
  (sruti/tanpura, `namedPlayerRegistry`) keep their own bar drag + resize; the
  contract is about the content player only.
- **Magnetic dock is the only placement.** `_dockPlayer()` remains the single
  path for content players and always re-runs `_playerMatchWidth()` (now
  unconditional — the `_userResized` escape hatch is gone) and
  `_clampPlayerWidthToColumn()`, then rests the player under
  `_playlistUiRect()`. `_repositionPlayers()` re-docks every content player on
  viewport resize, drawer flips, transform settle, and bar resize.
- **No WDP-adjacent jump.** The raga-context branch that repositioned a player
  beside `#wheel-detail-panel` (`_wdpAdjacentPosition`) is removed; the WDP still
  opens, but the video stays docked to the playlist.
- **Always-visible controls.** `_syncPlayerControls()` sets
  `.mp-player-controls` to `display:flex` unconditionally, so the docked video's
  minimize (`—`) and close (`✕`) are always reachable regardless of the editor
  row's own operator set.
- **Editor height cap.** `_clampPlaylistEditorHeight()` computes
  `maxHeight = innerHeight − barBottom − playerH − gap`, where `playerH` is the
  docked player's 16:9 height at its actual (width-matched, column-capped)
  width. It runs from `_dockPlayer()`, `_repositionPlayers()`, and
  `_renderPlaylistBar()`. `.mp-queue` already owns `overflow-y:auto`, so once the
  cap is reached extra rows reveal a vertical scrollbar instead of shoving the
  video down. Desktop only; the mobile player is a full-screen sheet and keeps
  the CSS cap.

The allowed operations are therefore **minimize**, **maximize/restore** (the
row's `.mp-queue-collapse` chevron, the current row's play button, and
`_pbExpandPlayer`), and **full-screen** (Plyr's own control).

## Consequences

- The video is always on screen while the editor is open; its minimize/close
  controls are always visible.
- The player is exactly as wide as the Playlist UI (capped to the free column),
  so the layout reads as one flush stack: bar → editor → video.
- A very long playlist scrolls inside the editor rather than moving the player.
- Removing the WDP-adjacent placement means a raga-context video can overlap the
  WDP (z 65) while it is open; this is the intended trade-off of "always stick to
  the playlist".
- Drift: UIMAP §5 and `test_ui_surface_map_drift.py` track
  `_clampPlaylistEditorHeight`; `test_fixed_dock_player.py` pins the contract.

## Alternatives rejected

- **Keep drag but snap harder.** Still lets the user author geometry, which the
  directive explicitly removes; the "detached" state is the source of the
  non-overlap complexity.
- **Clamp the editor to a fixed `vh` fraction.** Viewport-relative and
  width-blind: a wide player is taller than a narrow one, so a fixed fraction
  overflows on wide columns. The cap must reserve the player's actual height.
- **Hide the editor when it would cover the video.** Loses the always-visible
  playlist; scrolling is the standard, discoverable answer.
