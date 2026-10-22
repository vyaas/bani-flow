# ADR-189 — Context-Scoped Playlist Rows + the Playlist Info Dialog

**Status**: Proposed → Accepted (user directive 2026-10-21)
**Date**: 2026-10-21
**Author**: pi (`surface` skill)
**Depends on**: ADR-163 (persistent playlists + PLAYLISTS panel sections),
ADR-164 (share-by-reference queue permalinks), ADR-177 (shared help dialog),
ADR-179 / ADR-180 / ADR-181 (single-line row ribbons + aligned action columns),
ADR-128 (buildSection / panel components).
**Scope**: `carnatic/render/templates/media_player.js`,
`carnatic/render/templates/bani_flow.js`, `carnatic/render/templates/base.html`,
UIMAP §1 / §2 / §5, `carnatic/tests/`.

---

## Context

The PLAYLISTS section appears in every panel whose subject a playlist touches,
but each row renders **every** item of the playlist regardless of that subject.
A playlist that spans eight ragas (*Hindustani Ragas*) therefore shows all eight
tracks under a **Darbari** search, forcing the user to sift Malkauns, Jog,
Charukeshi… for the one relevant row. The row's name also renders as an
accent-bordered pill that reads like a `.comp-chip`, and its tracks sit at the
same indent as the name, so the parent/child relationship is ambiguous.

## Decision

### D1 — A playlist row is scoped to the panel's subject

`buildPlaylistsSection(ids, context)` passes `{type, id}` down to
`buildPlaylistRow(pl, context)`, which shows only the items whose denormalised
back-reference matches the subject: `raga_id === id` for a raga panel,
`composition_id === id` for a composition panel, `id ∈ musician_ids` for a
musician panel. The count badge reads `shown/total` when filtered, the row ▶
plays the shown subset, and the `+` still enqueues the whole playlist.

The section-level "play all visible" harvest is kept truthful by retiring the
playlist-wrapper `registerQueueItem` — the per-track `.q-row`s are the harvest
units, so a context-hidden track is never reached.

### D2 — ⓘ opens the full playlist

An info button (`ⓘ`, `.mp-playlist-info-btn`) sits beside the name and opens the
shared help dialog (`window.openHelpDialog`) with a `.playlist-info-card`:
description, track count, a **Play all** ▶ and enqueue-all `+`, and every item
as a track ribbon. The dialog inherits the scrim / Escape / close affordances.
Play-all tags the queue with `{playlistId}` (ADR-164 share-by-reference); a
context-scoped row plays **inline** instead, because a subset cursor would not
align with the full playlist on permalink restore.

### D3 — The name reads as a concert title

`.playlist-chip` drops the accent border/pill and adopts `.concert-title`'s
quiet bold `--fg-sub`, so playlists are never confused with composition chips.

### D4 — Tracks indent under the name

`.mp-playlist-track` gains `padding-left: var(--hier-indent-step)`, placing the
tracks one hierarchy step below the playlist name.

## Consequences

- A raga / composition / musician panel shows only the relevant playlist tracks;
  the full sequence is one click away behind ⓘ.
- Share-by-reference is preserved when the row shows the whole playlist; a
  context subset inlines so the permalink cursor stays truthful.
- `collectQueueItems` over a PLAYLISTS body returns only the visible tracks.
- The playlist name loses its accent colour; the count and ⓘ carry the
  "this is a playlist" cue.
