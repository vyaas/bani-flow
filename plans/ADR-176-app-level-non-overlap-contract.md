# ADR-176 — App-Level Non-Overlap Contract for the Four Floating Surfaces

**Status**: Accepted (user directive 2026-10-18)
**Date**: 2026-10-18
**Author**: pi (`surface` skill)
**Depends on**: ADR-175 (Playlist Bar / `_dockPlayer` / `_playlistUiRect`),
ADR-129 (floating chrome + safe zones), ADR-175's docking helpers.
**Scope**: `carnatic/render/templates/media_player.js` (geometry), UIMAP §5.

---

## Context

Four app-level surfaces share the desktop viewport:

1. the left **bani-flow sidebar** (`#left-sidebar`),
2. the right **musician sidebar** (`#right-sidebar`),
3. the **playlist UI** — `#playlist-bar` + its downward `.mp-queue-bar` editor,
4. every floating **media player** (`.media-player`).

ADR-175 already keeps the playlist UI clear of the sidebars (the bar is clamped
to the canvas column by `body:has(#sidebar.drawer-open)`), and keeps the docked
player out of the playlist UI (`_playlistUiRect` / `_avoidPlaylistUI`). But the
player occluded the *sidebars*: nothing prevented a drag or a panel
open/close from placing a player over a panel, and a user-resized player wider
than the column spilled under one. When a panel was withdrawn (or drawn) after a
player had been docked, the player's stale position could land under the
newly-sized editor or a sidebar. The invariant "these four never overlap" was
implied but never enforced as a single rule.

## Decision

Declare a single **non-overlap contract** and funnel every player position
through one pure solver. The sidebars and playlist UI are laid out by CSS and
are *obstacles*; the player is the only free actor.

- `_openSidebarRects()` — viewport rects of the sidebars that are on screen
  (a closed drawer is translated off-screen by a transform, so
  `getBoundingClientRect()` puts it at the viewport edge and it is excluded).
- `_uiObstacleRects()` — sidebars ∪ `_playlistUiRect()`.
- `_resolveNonOverlap(left, top, w, h, obstacles, bounds, margin)` — a **pure**
  function: candidates are the proposal plus, for each obstacle, its four edges
  pushed just clear; zero-overlap candidates inside `bounds` win, closest to the
  proposal first. If none is feasible it returns the least-overlap candidate so
  the constraint degrades gracefully instead of teleporting the player.
- `_avoidUIOverlap()` clamps a drag; `_dockPlayer()` re-targets the free column;
  `_snapPlayerIfNearBar()` re-settles a drag release blocked by any obstacle.
- `_clampPlayerWidthToColumn()` caps a user-widened player to the free column
  with `max-width` (auto-restored when the column widens) — never rewriting the
  user's chosen width.
- `_repositionPlayers()` re-establishes the contract after any layout change.
  Guards are installed by `_installPlacementGuards()`: viewport `resize`, a
  `class` `MutationObserver` + `transitionend` on each sidebar, and a
  `ResizeObserver` on `#playlist-bar`. `_refreshQueuePanels()` also schedules a
  sweep so a detached player is pushed clear when the editor grows.

The geometric constraint — not z-order — is what guarantees non-overlap;
z-order is unchanged (players ≤700, bar 750, modals 1000+).

## Consequences

- The four surfaces are mutually non-overlapping in steady state across panel
  open/close, editor open/close, drag, and viewport resize.
- `_dockPlayer` no longer hand-rolls the "shove to the side" branch; the solver
  owns placement.
- A pathologically cramped viewport (no free rectangle fits) degrades to
  minimum overlap rather than an off-screen player.
- Drift: UIMAP §5 and `test_ui_surface_map_drift.py` track the new symbols;
  `surface`/`tester` own any follow-up geometry tests.

## Alternatives rejected

- **Raise the sidebars' z-index above players.** Hides the symptom but lets a
  player sit *behind* a panel (still overlapping) and does not address the
  editor/player case. Geometry is the actual invariant.
- **Forbid dragging players over panels via pointer capture only.** Misses the
  programmatic paths (dock, resize, drawer open), which are the reported bug.

---

## Addendum (2026-10-18) — the view window is the fifth bounded surface

**Problem.** The desktop `#layout-controls-float` (Timeline / Re-layout / Era /
Instrument) was `position: fixed; top: 10px; left: 50%` — pinned to the top
chrome band, which the ADR-175 Playlist Bar now owns. The bar occluded the
filters in the guru-shishya view.

**Decision.** Treat the canvas/view as a rectangle that lives *inside* the four
walls: below the playlist UI, between the open panels, above the bottom floor.
On desktop `#canvas-wrap` gets `margin-bottom: var(--chrome-bottom)`; when a panel
is open the matching margin (`--left-panel-width`; `--right-panel-width` unless
`.right-pinned`, because a pinned right panel already owns a grid column)
vacates its footprint. Margins, not grid columns, because the left panel is
intentionally an absolute overlay. The controls move to the top of the inset view
(`position: absolute; top: 4px`), and `#timeline-ruler` fills the view
(`height: 100%`). `mobile.js` `_refitViews()` re-runs `cy.resize()`/`cy.fit()` and
`drawRagaWheel()` after a panel re-insets the window, so both views re-centre.

**Dynamic top wall (the editor pushes the view).** The bottom of the playlist UI
is the real top wall, so it must track the editor as it deepens:
`margin-top: max(var(--chrome-top), calc(var(--playlist-ui-bottom, 0px) + 10px))`.
`media_player.js` `_syncViewTopInset()` publishes `--playlist-ui-bottom` (the
playlist UI's live bottom, relative to `#main`) — on `#playlist-bar`
resize/`_initPlaylistBar` and from a `ResizeObserver` on the `.mp-queue-bar`
editor. When it changes, media_player calls `window.refitViewWindow`
(`mobile.js` `_scheduleRefit`, rAF-debounced) so `cy` / the wheel re-fit the
freshly-shortened window instead of being covered. The view can never rise above
the bar gap (the `max`).

**Scope note.** The docked player remains a transient overlay *inside* the view
(handled by the player-side contract above); the four walls are the playlist UI
(bar + editor), the two panels, and the floor.
