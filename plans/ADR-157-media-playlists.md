# ADR-157: Media Playlists

**Status**: Accepted
**Date**: 2026-06-09 (proposed); 2026-06-10 (accepted)
**Agents**: code-auditor (AUDIT-014) → graph-architect → carnatic-coder
**Depends on**: ADR-154 (MediaRef — uniform identity across providers), ADR-155 (control inversion — the `ended` event), ADR-156 (segments — playable spans). This is the **eventual target** of the roadmap; accept and implement last.

---

## Context (forces in tension)

A playlist is an ordered sequence of things-to-play that advances automatically. It is impossible today for the same reason chapters are: the uncontrolled iframe (AUDIT-014 F-04) exposes no `ended` event, so nothing can trigger "play the next item." ADR-155 provides that event; ADR-154 makes the items uniform (a playlist can mix a YouTube track, a Vimeo track, and a lecdem chapter because all are `MediaRef`s); ADR-156 makes a playlist *item* able to be a span, not just a whole video.

Forces:
- **Immersion**: the natural listening unit is often a sequence — all kritis in a raga, every recording of a composition across artists, the chapters of one lecdem, a curated "introduction to Tyagaraja." A single-item player fights this.
- **Two playlist origins**: *implicit* (derived from a query the user is already looking at — "everything in this panel") and *explicit* (a hand-curated, named, shareable sequence). They have very different persistence needs.
- **Don't over-build first**: a persistent, named, shareable playlist is a new graph entity with its own write surface, validation, and curation rules (ADR-085 territory). Shipping that before the simpler win is premature.
- **Provider reality**: uncontrollable providers (SoundCloud, Drive — ADR-155 §4) cannot auto-advance. A playlist must handle a non-controllable item gracefully (pause at it, surface a "continue" affordance) rather than stall.

## Pattern

**Strong Centres, staged.** Build the playlist as a centre in two passes: first an *ephemeral queue* (a client-side ordered list of `MediaRef`+span, no persistence) that proves the interaction; then, only if warranted, a *persistent playlist entity* with its own schema and write surface. Ship the centre before its monument.

## Decision

### Phase A (this ADR, implement now-ish) — Ephemeral client-side queue

- A **queue** is an in-memory ordered list of playable items: `{ mediaKey, start, end?, label, meta }`. Items reuse ADR-156 segment shape; whole-video items have `start: 0`, no `end`.
- Queues are **built from what the user is already exploring** — a "Play all" affordance on a panel/concert/raga track-list enqueues every track in view (the player already renders these lists in `media_player.js:287` and `bani_flow.js`).
- **Auto-advance** on ADR-155's `player.on('ended')` (or on crossing a segment's `end` for span items): pop next, set the player's source + `currentTime`, continue. A single player instance is reused; we do not spawn N windows.
- **Uncontrollable items** (SoundCloud/Drive, ADR-155 §4): the queue pauses on reaching one and shows a "continue when done" control; it never silently stalls.
- **No persistence, no schema change.** Queues live and die with the session. Permalinks MAY encode a short queue inline (bounded, like the ADR-151 trail cap) but a queue is not stored in data files.

### Phase B (future — separate ADR, do NOT build yet) — Persistent playlist entity

Deferred. When demand is proven, a named playlist becomes a first-class entity:
```jsonc
// SKETCH ONLY — not part of this ADR's accepted scope
{ "id": "intro_to_tyagaraja", "title": "An Introduction to Tyagaraja",
  "items": [ { "url": "...", "start": 0, "end": 412, "note": "..." }, … ],
  "sources": [ … ] }
```
This carries real cost — a new write verb in `write_cli.py`/`bani_add.py`, validation in `writer.py`, a curation workflow, and ADR-085 self-replicating-loop integration. A dedicated ADR will own it. **This ADR explicitly scopes that out** to avoid building a write surface before the interaction is validated.

## Consequences

**Positive**
- Delivers the roadmap's playlist target at low cost by reusing ADR-154/155/156 primitives — no new schema, no new write surface.
- Mixed-provider, mixed-span sequences "just work" because every item is a `MediaRef`/segment.
- Reusing one player instance keeps the existing window-management chrome intact.

**Negative / costs**
- Phase-A queues are not shareable beyond an inline permalink and not curatable — a deliberate limitation, revisited in Phase B.
- Auto-advance UX must handle uncontrollable items, partial buffering, and user interruption (manual track click mid-queue) without surprising the listener.
- Inline queue-in-permalink must respect a hard length cap (cf. ADR-151) to keep URLs sane.

## Implementation (after ADR-155 + ADR-156 landed)

1. **Coder**: a `Queue` controller in `media_player.js` (ordered list, current index, `next()/prev()`); a "Play all" affordance on existing track-lists; wire `player.on('ended')` → `next()`; handle uncontrollable-item pause.
2. **Coder**: optional bounded queue encoding in the permalink (`state.q`), with the `v:2` reader from ADR-154.
3. **Test Engineer**: auto-advance across providers; span-end advance; uncontrollable-item pause; manual-interrupt resets the queue cursor correctly.
4. **Defer Phase B** until the queue interaction is validated in use.

**Branch**: `adr/157-media-playlists` → PR.

---
[ADR: ADR-157, ADR-156, ADR-155, ADR-154]
[AGENTS: code-auditor, graph-architect]
