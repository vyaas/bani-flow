# ADR-197 — The operator set belongs to the playing row; queue rows carry no `+`

**Status**: Accepted (user directive 2026-10-25)
**Date**: 2026-10-25
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-174 (UI surface map), ADR-184
(grand search + per-row operator set), ADR-195 (Playlist Editor is a modal
form), ADR-196 (two-line row cap).
**Supersedes**: ADR-184's "every row owns its own operator set" clause and
ADR-196 D1's "enqueue" member of `.mp-queue-actions`.
**Scope**: `carnatic/render/templates/media_player.js`,
`carnatic/render/templates/base.html` (comment only),
`carnatic/render/UIMAP.md` §5, `test_grand_search_editor.py`.

---

## Context

ADR-184 gave **every** Playlist Editor row its own copy · permalink · watch
trio, and ADR-196 counted an enqueue `+` among a row's actions. On a phone that
is five operator glyphs on every idle row, crowding out the chips that actually
name the track — the row's purpose in the editor is *readability of the
playlist contents*.

The `+` is worse than redundant: a queue row **is** already a queue item, so its
"Add to queue" action adds the item to itself. The affordance only makes sense
on lists whose rows are *not yet* queued (bani-flow trail, recordings leaves,
grand search results, the player tracklist), where `_buildPlusBtn` stays.

## Decision

### D1 — Operators are current-row-only

`_renderQueuePanel` emits the `.mp-queue-op` trio (copy · permalink · watch →
`_copyMediaLink` / `_copyMediaPermalink` / `_openMediaOnYouTube`) inside an
`if (isCurrent)` guard. A non-playing row is **play · remove** only.

Nothing is lost: every one of those actions is already reachable for the
sounding item from the Playlist Bar (`#pb-copy` / `#pb-share` / `#pb-watch`,
ADR-195) and from the player's placard operator rail (`.mp-player-ops`,
ADR-194).

### D2 — No `+` on a queue row

The `_buildPlusBtn` call is removed from `_renderQueuePanel`. Enqueue-into-self
is retired. `_buildPlusBtn` / `_openPlusMenu` and their playlist-add paths are
untouched everywhere else — the lists whose rows are candidates, not members,
keep the affordance.

### D3 — The row keeps its two-line form

ADR-196's structure is unchanged: `.mp-queue-meta` (grip · pos · reorder ·
chips) and `.mp-queue-actions` (play · stop · operators-if-current ·
video-toggle · volume · remove) remain single non-wrapping groups. The change
only shrinks the action group, so the two-line ceiling now has slack — on a
phone a non-current row fits comfortably inline and the current row's action
line no longer competes with the chips.

## Consequences

- **Gains**: playlist contents read first on mobile; five glyphs per idle row
  collapse to two; the self-add confusion disappears; desktop rows get their
  width back for chips.
- **Costs**: acting on an idle track (copy/permalink/watch) now requires playing
  it first, or using the `+`-bearing list it came from. That is the intended
  trade: the editor is for reading and reordering the queue, not for acting on
  tracks that are not sounding.
- The bar and placard rail are unchanged; their operator sets were already
  current-item only.
