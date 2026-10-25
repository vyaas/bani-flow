# ADR-194 — The bottom placard + vertical operator rail on the video surface

**Status**: Accepted (user directive 2026-10-23)
**Date**: 2026-10-23
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-155 (Plyr), ADR-174 (UI surface
map), ADR-183 (fixed docked player; always-reachable minimize/close), ADR-184
(now-playing overlay, per-row operator set), ADR-186 (film-strip video toggle).
**Supersedes**: ADR-186's desktop top-row chip strip (the film-strip toggle
itself stays).
**Scope**: `carnatic/render/templates/media_player.js`,
`carnatic/render/templates/base.html`, `carnatic/render/UIMAP.md` §5,
`test_ui_surface_map_drift.py`.

---

## Context

Since ADR-184/ADR-186 the desktop content player paints the sounding track's
chips into `.mp-now-playing`, but on desktop that strip was a child of
`.mp-player-controls`, sharing the **top** row with the window's minimize and
close buttons. It read as window chrome, not as a title: a thin 0.74rem strip
in the top corner, far from the transport it describes.

The row's other affordances — play externally, copy YouTube link, copy
permalink — lived only in the Playlist editor row and the Playlist Bar, so the
video surface itself had no way to act on what it was playing.

The user directive:

> The overlay strip ought to be bigger — a YouTube-like title that shows on the
> player when we hover over the video, except these are large clickable chips.
> Bring them down to sit right above Plyr's lowest row of buttons. Bring in the
> other items from the playlist row (play externally, copy permalink, copy
> YouTube link) and place them vertically along the bottom-right edge. The chip
> row needs a semitransparent background so the chip fonts are readable
> regardless of the video.

## Decision

### D1 — The placard lives on the video frame, bottom-anchored

`.mp-now-playing` and the new `.mp-player-ops` are children of
`.mp-video-wrap` — **siblings of `.plyr`**, not descendants — so the Fullscreen
API continues to hide them when the video is maximized. Both are anchored to
the frame's bottom edge with `bottom: var(--mp-controls-h, 56px)`, i.e. just
above Plyr's own control row.

`_syncPlayerOverlayInset(el)` measures `.plyr .plyr__controls` and publishes its
height as `--mp-controls-h` on the player. It is called after mount, from
`_dockPlayer`, and from `_repositionPlayers`, so Plyr's responsive padding
changes (its bar is roughly twice as tall above the 480px breakpoint) never
leave the placard floating over the buttons. A zero measurement (minimized
player) is ignored so the last good value sticks.

### D2 — Large chips on a semitransparent scrim

The placard is a single scroll line of the same `.musician-chip` / `.raga-chip`
/ `.comp-chip` / `.composer-chip` / `.yt-label-chip` atoms used everywhere else,
scaled up (font and padding derived by `calc()` from `--chip-size-primary`).
The strip itself carries a theme-derived, semitransparent scrim
(`color-mix(in srgb, var(--bg-deep) 76%, transparent)`) with a `backdrop-filter`
blur and a hairline top rule, so chip text is legible over any frame. No raw
hex is introduced.

### D3 — The operator rail

`_buildPlayerOps(item)` returns the current row's operator set — **Play
externally** (`↗`, `_openMediaOnYouTube`), **Copy YouTube link** (`⧉`,
`_copyMediaLink`), **Copy permalink** (`#`, `_copyMediaPermalink`) — stacked
vertically at the bottom-right edge. `_syncNowPlayingOverlays()` rebuilds it on
every queue advance, so each button always acts on the sounding item. On
desktop the placard reserves the rail's column (`right: 56px`) so chips never
run under the buttons.

### D4 — Hover reveal, with a touch fallback

Under `@media (hover: hover) and (pointer: fine)` both surfaces are
`opacity: 0` and their children are `pointer-events: none` until the player is
`:hover` or `:focus-within`. Touch and coarse pointers keep them visible, so a
tap never has to guess where the controls are. `prefers-reduced-motion`
disables the fade. The window's own minimize/close stay in
`.mp-player-controls` at the top corners, always shown (ADR-183).

## Consequences

* The video surface now names what is playing and can act on it without a trip
  to the editor row — the "playlist row is king" operators gain a second,
  contextual home.
* `.mp-player-controls` is once again a two-button row (minimize · close);
  `_syncPlayerControls` is unchanged and its ADR-183 guard stays green.
* A new runtime CSS variable (`--mp-controls-h`) is the only geometry the
  placard trusts; if Plyr's control markup changes, `_syncPlayerOverlayInset`
  degrades to the static fallback rather than mis-positioning.
* UIMAP §5 and `test_ui_surface_map_drift.py` carry the new symbols
  (`_buildPlayerOps`, `_syncPlayerOverlayInset`, `mp-player-ops`).
