# ADR-184 — Grand Track Search, the Thin Editor Bar, and the Now-Playing Overlay

**Status**: Proposed → Accepted (user directive 2026-10-22)
**Date**: 2026-10-22
**Author**: pi (`surface` skill)
**Depends on**: ADR-175 (persistent Playlist Bar / bare content players /
`_dockPlayer`), ADR-176 (non-overlap / `_playlistUiRect` / view window inset),
ADR-183 (fixed docked player), ADR-162 (visible queue), ADR-164 (queue
permalinks), ADR-179/180/181 (ribbon rows, shared action column, transport pair).
**Scope**: `carnatic/render/templates/media_player.js`, `search.js`,
`base.html` (search bar + editor bar + player overlay CSS), UIMAP §5,
`test_ui_surface_map_drift.py`, `test_playlist_bar_layout.py`,
`test_fixed_dock_player.py`, `test_view_window_layout.py`,
`test_mobile_surface_layout.py`.

---

## Context

The ADR-175 Playlist Bar is the single face of the Current Playlist: transport,
a now-playing summary, a count, the per-item operator set (copy · permalink ·
watch · volume), and `#pb-editor-toggle`, which drops the `.mp-queue-bar`
editor down from the bar. Six rough edges remained (user directive):

1. **The per-row minimize chevron is redundant.** The current editor row
   carries a `.mp-queue-collapse` chevron to show/hide the video, but the bare
   video already owns a permanent minimize button (`.mp-player-min`). The
   chevron costs horizontal room in an already crowded row.
2. **The volume thumb is too large.** The range thumb is disproportionately
   large next to the 68×16px track.
3. **Operators are current-only.** Copy/permalink/watch render only on the
   currently-playing row; every other row reserves phantom slots. Every track
   should be shareable from its own row.
4. **The "Up Next" head is dead weight.** `.mp-queue-head` (title + prev/next
   duplicate transport + "Save queue as playlist") serves no purpose now that
   the bar owns transport and tracks are added individually.
5. **No grand entry point.** There is no single search box that spans the whole
   knowledge graph and returns *playable tracks*. Panel searches are scoped
   (a musician, a raga) and entity-level; a veteran must navigate to a panel
   before they can find a track.
6. **"What is playing" is only visible in the editor.** If the editor is folded
   (or the video is the only thing on screen), the sounding identity is not on
   the video itself.

## Decision

### D1 — Remove the per-row chevron (item 1)

`_renderQueuePanel()` no longer emits `.mp-queue-collapse` or its phantom.
`_isCurrentPlayerCollapsed()` / `_toggleCurrentPlayerCollapse()` are deleted;
the video's own `.mp-player-min` (always shown, ADR-183) and the editor bar's
`#pb-editor-toggle` (collapse the *editor*, not the video) are the only
show/hide affordances.

### D2 — Right-size the volume thumb (item 2)

`#pb-volume` and `.mp-queue-vol` get an explicit `appearance:none` track + thumb
via `theme`-token colors (`--border-strong` track, `--accent` thumb, 3px track,
10px thumb). The circle shrinks to the bar's scale.

### D3 — Every row owns the operator set (item 3)

`_renderQueuePanel()` renders copy · permalink · watch on *every* row (no
`isCurrent` gate, no phantom). Volume stays the current row's last operator (it
controls the live player) and is inherited by the editor bar when the editor is
folded (the ADR-175 parent-inherits rule, unchanged).

### D4 — Retire the "Up Next" head (item 4)

`buildQueuePanel()` emits only the `.mp-queue-items` list. The `.mp-queue-head`,
its prev/next transport, and the "Save queue as playlist" `⊕` are removed; the
editor is the list alone. Saving a whole queue as a playlist is retired —
playlists are built one track at a time via the per-item `+` menu.

### D5 — The grand search bar replaces the top chrome bar (item 5)

A new `#search-bar` takes the old `#playlist-bar` top slot. It hosts
`#track-search-input` and `#track-search-dropdown`. Its index is the flat set of
**performances** (`Object.values(perfToPerf)`), one row per track. Each row's
search blob concatenates: musician labels **and ids** (all performers,
unmatched names, the composer), raga name + id + aliases (inferred from the
composition when the performance omits it), composition title + id, recording
title/short_title/venue/date, and the segment's display_title/subject/tala.
Query tokens are matched as **AND-ed substrings** (normalised, diacritic-stripped),
so `tm krishna` → all his tracks, `… surutti` narrows to that raga,
`muthuswami dikshitar` → that composer's tracks. Results are ranked by token
match then date then concert order, and rendered into a scrollable dropdown.
Every row carries the shared chip strip (`_buildQueueRowChips`) plus a **play**
button (`MediaQueue.playContent`) and an **enqueue** `+`
(`MediaQueue.addItem`). This is the new grand entry point; the panel searches
remain unchanged and scoped.

### D6 — The editor moves to its own thin bar; now-playing lives on the video (item 6)

`#playlist-bar` keeps its id, transport, summary, count and operator set, but
moves **below** `#search-bar` and keeps `#pb-editor-toggle` as its leftmost
control. The editor still drops down from it. Default state is **expanded** on
desktop (`MediaQueue.panelOpen` already defaults true there); mobile keeps it
folded so the full-width editor never covers a panel. A `.mp-now-playing`
overlay is appended to `.mp-video-wrap` (a **sibling** of `.plyr`, so the
Fullscreen API hides it automatically when the video is maximized) and shows the
sounding chips via the same `_buildQueueRowChips(item, activeChapter)` atom.
It is refreshed from `_refreshQueuePanels()` (the single mutation funnel) and
therefore tracks queue advances and ADR-176 `activeChapter` changes.

## Layout consequences

- Desktop: `#search-bar` at `top:12px`, `#playlist-bar` at `top:56px`; both
  clamped to the canvas column between the sidebars. Base `--chrome-top` rises
  from 50px to ~96px so the fixed bars never overdraw an open panel.
- Mobile: `#search-bar` at `top:52px`, `#playlist-bar` at `top:112px`;
  `--chrome-top` rises to ~176px so drawers, canvas and wheel start below both
  bands.
- `_playlistUiRect()` / `_dockPlayer()` / `_clampPlaylistEditorHeight()` are
  unchanged: they already key off `#playlist-bar` + `.mp-queue-bar`, which now
  simply sit lower. The docked player is still flush under the editor.
- The search dropdown sits above players (z ≤ 700) and below modals (1000+).

## Consequences

- One search box reaches every track; the operator/transport surfaces shrink to
  the rows that need them.
- The video names what is playing even with the editor folded.
- The editor is a plain list; "save queue" is gone (playlists are per-track).
- Dead code removed: `_isCurrentPlayerCollapsed`,
  `_toggleCurrentPlayerCollapse`, `.mp-queue-collapse*`, `.mp-queue-head`,
  `.mp-queue-save`.

## Alternatives rejected

- **Keep the top bar and overlay search on top of it.** Two overlapping fixed
  bars fight for the same slot; splitting them keeps each a single job.
- **Put now-playing in the editor bar only.** Fails the brief: the editor can be
  folded, and the video is the one surface that is always present while playing.
- **Index entity rows, not tracks.** The brief asks for playable results;
  entity rows would need a second drill-down.
- **Prefix-only matching.** `tm krishna` needs punctuation-insensitive AND
  substring matching across both label and id.
