# ADR-204 — The Playlist Bar is a video show/hide toggle

**Status**: Accepted (user directive 2026-10-25)
**Date**: 2026-10-25
**Author**: pi (`surface` skill)
**Depends on**: ADR-175 (persistent Playlist Bar), ADR-183 (fixed docked
player), ADR-186 (film-strip video toggle), ADR-194 (player chrome language).
**Scope**: `carnatic/render/templates/base.html`,
`carnatic/render/templates/media_player.js`, `carnatic/render/UIMAP.md` §5,
`test_playlist_bar_layout.py`, `test_ui_surface_map_drift.py`.

---

## Context

ADR-186 gave the docked video a film-strip toggle in the Playlist Bar and the
current queue row. Minimizing leaves the bar as the persistent face, which is
correct, but the only way back is the small `#pb-video-toggle` button. To get
the video out of the way the user often just wants to press the bar itself;
finding a 14px glyph to restore it is unnecessary friction.

## Decision

### D1 — The desktop bar surface is the toggle

`_initPlaylistBar()` installs a delegated click listener on `#playlist-bar`.
`_onPlaylistBarClick()` calls the existing `_toggleVideoVisibility()` primitive
when the press did not land on a control. This deliberately reuses ADR-186's
single show/hide path, so bar clicks, the film-strip button, the queue-row
toggle and the player's own minimize control cannot disagree.

A press is a control press when `_isPlaylistBarControl()` finds any of:

```
button, input, select, textarea, a, [role="button"], [class*="chip"]
```

That covers the transport, count/editor, copy/permalink/watch, volume slider,
the film-strip button, and every navigable chip in `#pb-summary`. Gaps between
controls — the bar padding, `#pb-summary` background and the transport flex gap
— remain the toggle surface.

### D2 — Desktop only; accessible activation stays explicit

The handler returns early on `_isMobilePlayer()`. Mobile already has a
bottom-sheet expand/collapse pair, and the bar sits on the chrome line where a
whole-band toggle would compete with scrolling. The bar gets `cursor: pointer`
to signal the non-control surface, but the keyboard/AT path remains the
existing `#pb-video-toggle` button (`aria-pressed` = video shown). The bar is
not given `role="button"`: it contains many controls, and turning the container
into a button would make their semantics invalid.

## Consequences

- A single press anywhere on the desktop bar's non-control area hides or
  restores the docked video; the same press restores it.
- No new queue state, no new persistence: the bar remains a pure view/control
  over `MediaQueue` and `_toggleMinimized`.
- Because the handler is delegated, the bar's summary can be re-rendered on
  every queue advance without rewiring the toggle.
- Interactive elements keep their existing behaviour; a chip press still
  navigates rather than hiding the video.
