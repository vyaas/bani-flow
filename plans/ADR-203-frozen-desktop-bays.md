# ADR-203 — Frozen desktop bays: both panels always open, framed central view

**Status**: Accepted (user directive 2026-10-24)
**Date**: 2026-10-24
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-128 (panel components / derived
widths), ADR-129 (floating chrome + safe zones), ADR-174 (UI surface map),
ADR-176 (inset view window / non-overlap contract), ADR-200 (mobile chrome line).
**Supersedes**: the desktop half of ADR-046 / ADR-129 D2 — the pin/unpin drawer
model and its floating bottom toggles. The mobile drawer/state machine is
unchanged.
**Scope**: `carnatic/render/templates/base.html`,
`carnatic/render/templates/mobile.js`, `carnatic/render/UIMAP.md` §1 / §2 / §3 /
§6.4, `test_view_window_layout.py`, `test_mobile_surface_layout.py`.

---

## Context

Desktop was a hybrid of two navigation models. The left panel was an absolute
overlay whose footprint the canvas reserved with `margin-left`; the right panel
was a grid column only while `.right-pinned`. Both panels defaulted to pinned,
but the user could unpin either with the floating bottom toggles
(`#left-panel-toggle`, `#right-panel-toggle`, ADR-129 D2) and collapse it back
to a drawer. The panels were also inset top **and bottom** by `--chrome-top` /
`--chrome-bottom`, leaving a 64px band at the bottom that existed only to clear
those toggles and the patch button.

The model produced three costs: a layout that could change shape under the user,
a central canvas that had no explicit frame (its boundary was a pair of 2px
panel borders, open at the top and bottom), and a bottom band that the panels
could not use.

## Decision

### D1 — The desktop layout is frozen

On `min-width: 769px` `#main` is a fixed three-column grid:

```
grid-template-columns: var(--left-panel-width) 1fr var(--right-panel-width);
```

Both sidebars are permanent, in-flow, static grid bays. The pin/drawer split is
retired: `.panel-pinned` / `.drawer-open` / `.right-pinned` no longer change the
desktop geometry (the classes remain, inert, for the mobile state machine).
`mobile.js` forces `leftPinned = rightPinned = true` on desktop, ignoring any
stale stored pin value, so a previously-closed panel cannot stay hidden.

### D2 — The Bani Flow / Musician toggles are desktop-retired

`#left-panel-toggle` and `#right-panel-toggle` are `display: none` on desktop.
The controls stay in the DOM (the mobile tab bar `#mobile-tab-bar` is the mobile
panel switcher and is untouched; the legacy edge handles
`.desktop-drawer-handle` remain hidden). Only the patch button
(`#bundle-download-btn`) remains floating on the desktop bottom band.

### D3 — Panels fill the vacated bottom band

The sidebars run from `--chrome-top` to the bottom of the frame
(`margin-bottom: 0`); `--chrome-bottom` no longer reserves a panel floor and now
only positions the floating patch/edit hint. The central bay likewise runs to the
viewport bottom.

### D4 — The central view is an explicit frame

`#canvas-wrap` gains a four-sided border
(`var(--frame-border-width) solid var(--border-strong)`) and rounded corners
(`--frame-radius`), and the sidebars drop their inner `border-*` so the frame's
left/right edges are the single boundary line. The central view reads as one
rectangular window between the two wings. ADR-176 is preserved in full: the top
wall stays `max(var(--chrome-top), calc(var(--playlist-ui-bottom) + 10px))`, so a
live Playlist Bar still pushes the view (and `#layout-controls-float`) down, and
the fixed docked player still observes both sidebars via `_openSidebarRects()`.

## Consequences

- **Stable layout.** The desktop never re-flows when panels are used; the view
  window's four walls are fixed at load.
- **More vertical room.** Both panels and the view claim the former toggle band.
- **Unambiguous frame.** The central window is bordered on all four sides rather
  than open at the top and bottom.
- **No overlap change.** The sidebars are always on screen, so
  `_openSidebarRects()` always reports both as obstacles — the player's
  non-overlap solver already handles the permanently-open case.
- **Mobile untouched.** Every ADR-203 rule lives inside `@media (min-width: 769px)`;
  the mobile drawers, scrims, tab bar, and chrome line behave exactly as before.
- **Retired surface, not retired DOM.** The toggles stay in the markup, so the
  ADR-174 drift guard (which checks their ids) is unaffected.
