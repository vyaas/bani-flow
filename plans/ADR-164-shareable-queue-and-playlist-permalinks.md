# ADR-164: Shareable Queue & Playlist Permalinks

**Status**: Accepted (implemented 2026-10-17)
**Date**: 2026-06-12
**Agents**: graph-architect (proposed) → carnatic-coder → test-engineer
**Depends on**: ADR-151 (the permalink state model + `encodePermalink`), ADR-154 (`media_key` identity), ADR-157/162 (the ephemeral `MediaQueue` — which deferred this), ADR-163 (persistent playlist entity — the compact-reference case). **Raised by**: user, 2026-06-12, on noticing that "share" from inside a running queue yields a link to the single current item, not the sequence.

---

## Context (forces in tension)

`encodePermalink` (ADR-151) serialises three things into the URL hash: the listening **trail**, the **player** (media + offset), and the **panel** state. It does **not** serialise the `MediaQueue`. So sharing while a "Play all" sequence is running reproduces only the one item playing at share time — the *sequence*, which is the whole point of a playlist, is lost. ADR-157 (Implementation step 2) and ADR-162 (§5) both flagged a bounded `state.q` encoding as *optional* and left it unbuilt; this ADR is where that decision gets made deliberately rather than by omission.

The forces:
- **Shareability is the joy of a playlist.** A curated sequence that can't be sent to someone is half a feature. The permalink must be able to carry "this sequence, positioned here."
- **URL length is bounded.** ADR-151 already caps the trail to keep URLs sane. A queue of *N* items each carrying `media_key` + span + meta could blow the budget fast. Inlining is fine for a handful of items, ruinous for fifty.
- **Two queue origins, two encodings (the "hash-map magic").** An *ephemeral* queue (ADR-157/162) has no durable identity — it can only be inlined. A *persistent* playlist (ADR-163) **has an id** — so the permalink should carry just that id (a dozen bytes) plus the cursor, and the reader rehydrates the full sequence from the loaded `playlists/*.json`. Reference-by-id is the compact path; inline is the fallback. Picking the right one per origin is the core decision.
- **Forward/back compatibility.** ADR-154 introduced a versioned permalink reader (`v:2`). Adding queue state must bump/extend that contract so old links still resolve and new links degrade gracefully on old readers.

## Pattern

**Identity over payload.** When a thing has a durable name, share the name, not the thing. A persistent playlist rides the permalink as `{ playlist_id, cursor }`; only the nameless ephemeral queue pays the full inline cost, and then only within a hard cap.

## Decision (finalised on acceptance, 2026-10-17)

1. **Extend the ADR-151 permalink state with an optional `q` block — on v:2, no version bump.** The sketch called for a bumped version, but the compat force cuts the other way: old readers reject unknown versions outright (losing even the single-item restore), whereas an unknown *field* on v:2 is silently ignored and degrades to exactly pre-ADR-164 behaviour. So `q` rides v:2 as an extension; the reader still accepts only `v ∈ {1, 2}`.
   - **Persistent (ADR-163):** `q = { pl: "<playlist_id>", i: <index> }` — id + cursor. The offset is **not** duplicated into `q`: the top-level `t` already carries it (the sketch's `q.t` would have created two sources of truth).
   - **Ephemeral (ADR-157/162):** `q = { items: [{ m, s?, e?, r?, c?, n?, rec?, l? }…], i }` — media_key + span + chip meta, **hard-capped at `QUEUE_PERMALINK_CAP = 20`**. Beyond the cap the slice is *windowed* so the cursor item always survives (first 20 when playing near the top, else the 20 ending at the cursor), and the share toast surfaces the truncation ("queue truncated to 20 of N items") — never silent.
2. **`encodePermalink` includes the queue** when `MediaQueue.active`: the persistent form iff `MediaQueue.playlistId` is set, else the bounded inline form. `MediaQueue.playlistId` is set by `MediaQueue.start(items, i, { playlistId })` — playlist rows (ADR-163) pass it — and is **dropped by any queue edit** (`addItem`/`addItems`/`removeAt`/`move`/`clear`): a mutated queue no longer IS the playlist, so it inlines. `encodePermalink` now returns `{ fragment, notice }` so the share handlers (desktop + mobile) can surface truncation.
3. **The reader (permalink.js) rehydrates the queue**: persistent → `MediaQueue.start(_playlistToQueueItems(pl), i, { playlistId, seekSeconds: t })`; inline → `MediaQueue.start(decoded, i, { seekSeconds: t })`. The seek is a one-shot `_pendingSeek` consumed by the first `_open`, clamped to `max(t, item.startSeconds)` so a mid-span share never rewinds before the span start (ADR-156). A missing `playlist_id` degrades cleanly to the single-item restore (the top-level `m` + `t` path), with a console warning. Tracklists (`tracks`) are deliberately not inlined; restored items degrade to plain spans, same as the single-item restore.
4. **The "hash-map" efficiency question — resolved by measurement, not varints.** A 20-item inline queue is ~2 KB of JSON; the ADR-170 `#z=` deflate-raw transport squeezes it to a few hundred bytes because repeated keys (`"m"`, `"s"`, …) compress to nearly nothing. The real entropy is the media_keys themselves (~14 chars each), which no key-shortening scheme touches. So the wire format stays readable short-key JSON; delta-encoding/varints/interning were evaluated and rejected as complexity that saves ~nothing post-deflate. The cap, not the encoding, is the size control.

## Consequences

**Positive**
- Playlists (and ad-hoc queues) become shareable as URLs — the missing half of ADR-162/163.
- Persistent playlists cost ~an id in the URL regardless of length; only ephemeral queues are size-bounded.

**Negative / costs**
- A new reader branch in permalink.js (compat surface) — mitigated by extending v:2 rather than bumping, so old readers degrade gracefully.
- Inline ephemeral queues need a truncation policy with honest user feedback when a shared queue is too long to fit (windowed slice + toast notice).
- Couples the permalink layer to ADR-163's playlist resolution (`_playlistToQueueItems`).
- `MediaQueue.playlistId` is a claim about provenance that queue edits must invalidate — every mutator drops it.

## Implementation (done 2026-10-17, branch `adr/164-shareable-queue-permalinks`)

1. ✅ `q` block added to writer (`encodePermalink`, media_player.js) + reader (`restoreStateFromHash`, permalink.js) — as a v:2 extension, no version bump (see Decision 1).
2. ✅ `encodePermalink` emits the persistent-`pl` form when `MediaQueue.playlistId` is set, else the bounded inline form (cap 20, windowed slice, truncation notice via the new `{ fragment, notice }` return).
3. ✅ Reader rehydrates `MediaQueue` from `q` (`start(items, i, { playlistId, seekSeconds })`, one-shot `_pendingSeek` in `_open`); degrades on missing playlist id to the single-item restore.
4. ✅ Wire format decided against measured sizes: short-key JSON under the ADR-170 deflate transport; the cap, not the encoding, is the size control.
5. ⏳ **Test Engineer**: share-from-queue round-trips the sequence + cursor; persistent form survives playlist edits by id; oversized ephemeral queue truncates with a surfaced notice; old permalinks (no `q`) still resolve. (Smoke-verified in Node against the shipped templates during implementation; formal pytest mirror pending.)

**Branch**: `adr/164-shareable-queue-permalinks` → PR.

---
[ADR: ADR-164, ADR-151, ADR-154, ADR-157, ADR-162, ADR-163]
[AGENTS: graph-architect]
