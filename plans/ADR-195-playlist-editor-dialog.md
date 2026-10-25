# ADR-195 — The Playlist Editor is a modal form; the bar becomes passive

**Status**: Accepted (user directive 2026-10-24)
**Date**: 2026-10-24
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-045 (help dialog), ADR-162 (visible
queue), ADR-174 (UI surface map), ADR-175 (persistent Playlist Bar), ADR-183
(fixed docked player), ADR-184 (thin editor bar, per-row operator set), ADR-185
(ephemeral bar), ADR-189 (playlist info dialog).
**Supersedes**: ADR-175's bar-docked `.mp-queue-bar` popdown and the ADR-184
`#pb-editor-toggle` chevron; the "parent-inherits" operator rule (ADR-175) is
retired — the bar always owns the current item's operators.
**Scope**: `carnatic/render/templates/media_player.js`,
`carnatic/render/templates/base.html`, `carnatic/render/templates/mobile.js`,
`carnatic/render/UIMAP.md` §5/§6.4, `test_ui_surface_map_drift.py`,
`test_playlist_bar_layout.py`, `test_fixed_dock_player.py`,
`test_mobile_surface_layout.py`.

---

## Context

Since ADR-175 the Current Playlist is edited through `.mp-queue-bar`, a panel
re-parented into `#playlist-bar` that drops downward from the thin editor bar.
It is a list of rows, each row carrying its own chip strip (horizontal scroll)
plus a dense operator set (play · stop · copy · permalink · watch · video ·
volume · enqueue · remove). Two consequences accumulated:

1. **Real estate.** The popdown competes with the docked video for the same
   vertical band, so ADR-183 had to cap its height (`_clampPlaylistEditorHeight`)
   and push the player down (`_dockPlayer` rests under the *union* of bar +
   editor). The list could never use the full viewport.
2. **Mobile readability.** The popdown inherits the full-width bar, so on a
   phone the operator buttons consume the row and the chip text is compressed
   to illegibility. The ADR-175 fold (`setPanelState` → `setPanelOpen(false)`)
   existed only to keep that popdown from covering a panel.

The brief (user directive):

> Overhaul the playlist editor. Retire the popdown of scrollable track rows and
> move the whole content to a **playlist editing form** that opens like the
> other dialogs. Rows become **draggable** so the list is easy to reorder, with
> the action buttons alongside the chips. The form can breathe, and it closes
> out of the way when done. Retire every chevron from the main Playlist Bar:
> the count renders as `x / y` (current item / total) and is itself the control
> that opens the editor.

This is the surface move from "a panel you toggle" to "a document you open,
edit, and dismiss" — passive bar, modal document.

## Decision

### D1 — The editor is a modal, not a popdown

The editor content is the same `.mp-queue` list, but `buildQueuePanel()` wraps
it as `div.mp-queue.playlist-editor` with **no positioning** and hosts it in the
shared help dialog (`window.openHelpDialog('Playlist', panel)`). Scrim, Escape,
the ✕ and the focus trap come free from ADR-045; the list scrolls inside
`#hd-body`. `MediaQueue.panelOpen` remains the open/closed flag, but it now
mirrors the dialog, not a CSS display.

`_openPlaylistEditor()` / `_closePlaylistEditor()` / `_togglePlaylistEditor()`
are the entry points. The dialog's inline script dispatches
`helpdialogopened` / `helpdialogclosed` CustomEvents with the active card node,
so `media_player.js` can close `panelOpen` when the user dismisses the editor by
Escape, scrim or ✕. The listener ignores a `helpdialogclosed` whose last card
was *not* the editor (a category help card closing must not touch the queue).

### D2 — The Playlist Bar loses its chevron

`#pb-editor-toggle` is removed. `#pb-count` becomes a `<button class="pb-btn">`
showing the current position and total (`x / y`); clicking it toggles the
editor, and `aria-pressed` mirrors `panelOpen`. The bar is otherwise unchanged:
summary chips, transport, inherited operators. Because the editor no longer
shares the bar's band, the ADR-175 "parent-inherits" rule is retired — the bar
**always** shows the current item's operators when the queue is non-empty
(`showOps = has`), regardless of editor state.

`MediaQueue.start()` no longer auto-opens the editor (`panelOpen` is left
untouched on a start; it only flips when the user opens or dismisses the form).
The bar remains ephemeral (ADR-185): hidden while the queue is empty.

### D3 — Rows are draggable, and the form breathes

Inside the dialog a row is a rounded card: a CSS-drawn grip (`.mp-queue-grip`),
a position badge (`.mp-queue-pos`), a **wrapping** chip cluster
(`#hd-body .mp-queue-chips` overrides the bar's single-line scroll to
`flex-wrap: wrap`), then the operator rail. Native HTML5 drag-and-drop
(`dragstart` / `dragover` / `drop` / `dragend`) reorders via the existing
`MediaQueue.move(from, to)`, which recomputes `index` from `currentKey` so the
sounding track keeps playing. Drop targets paint an accent edge
(`.mp-queue-drop-before/-after`). The `.mp-queue-reorder` ▴/▾ buttons stay as
the keyboard/precision path (and the only reorder path on touch, where HTML5
drag is unavailable). `MediaQueue.move()` is untouched.

### D4 — Layout arithmetic simplifies

`_playlistUiRect()` returns the bar's rect alone — the editor no longer unions
into it, so the bar-to-docked-player geometry is static. `_clampPlaylistEditorHeight()`
is deleted (and its calls from `_dockPlayer` / `_repositionPlayers` /
`_renderPlaylistBar`); a modal needs no dock reservation. `_syncViewTopInset()`
and the `--playlist-ui-bottom` wall stay (the bar can still appear/disappear).
The ADR-175 mobile fold in `setPanelState` is deleted: a modal sits above the
drawers, so there is nothing to fold.

### D5 — Design language

The theme is the single source of truth (ADR-028); the form introduces no hex.
It reuses the existing row-operator atoms (`.mp-queue-play`, `.mp-queue-op`,
`.mp-queue-remove`, `.mp-queue-vol`) and the `--chip-size-*` / `--border*` /
`--accent` tokens. The only new surfaces are `.playlist-editor`, `.pe-head`,
`.mp-queue-grip`, `.mp-queue-pos`, and the drag-edge shadows — spacing and a
hairline frame, in the app's quiet card register. Chips wrap because the form
has the width; the bar keeps its one-line scroll (ADR-179/ADR-184).

## Consequences

- **Gains**: full real-estate list; draggable reorder; readable mobile editor;
  a bar that is a true passive display + transport; fewer layout branches
  (no editor union, no height clamp, no mobile fold).
- **Retires**: `#pb-editor-toggle`, `.mp-queue-bar`, `_clampPlaylistEditorHeight`,
  the mobile fold, the parent-inherits operator rule, and the auto-open on
  `start()`.
- **Naming**: UIMAP §5 and the drift test are updated in the same commit.
