# ADR-164: Shareable Queue & Playlist Permalinks

**Status**: Proposed
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

## Decision (sketch — to be finalised on acceptance)

1. **Extend the ADR-151 permalink state** with an optional `q` block, read by a bumped permalink version:
   - **Persistent (ADR-163):** `q = { pl: "<playlist_id>", i: <index>, t: <offset_seconds> }` — id + cursor + position. Compact and stable; the reader resolves items from the loaded playlist.
   - **Ephemeral (ADR-157/162):** `q = { items: [<media_key | short-span ref>…], i, t }` — inlined, **hard-capped** (cf. ADR-151's trail cap; drop/curtail beyond the cap and surface that the shared queue was truncated, never silently).
2. **`encodePermalink` includes the queue** when `MediaQueue.active`: prefer the persistent form if the running queue came from a saved playlist; else the bounded inline form.
3. **The reader (permalink → state)** rehydrates the queue: persistent → `MediaQueue.start(resolvePlaylist(pl).items, i)` seeked to `t`; inline → `MediaQueue.start(decoded, i)`. Degrade cleanly if a referenced `playlist_id` no longer exists (fall back to opening the single item at the cursor).
4. **The "hash-map" efficiency question** the user raised — finding the most compact encoding — is the open design work: candidates include delta-encoding consecutive segments of one recording, a provider-prefixed varint for `media_key`, and interning repeated ids. To be evaluated with real queue sizes before fixing the wire format.

## Consequences

**Positive**
- Playlists (and ad-hoc queues) become shareable as URLs — the missing half of ADR-162/163.
- Persistent playlists cost ~an id in the URL regardless of length; only ephemeral queues are size-bounded.

**Negative / costs**
- A new permalink version + reader branch (compat surface).
- Inline ephemeral queues need a truncation policy with honest user feedback when a shared queue is too long to fit.
- Couples the permalink layer to ADR-163's playlist resolution.

## Implementation (after acceptance; sequence after ADR-163 lands)

1. Bump the ADR-151/154 permalink version; add the `q` block to writer + reader.
2. `encodePermalink`: emit persistent-`pl` form when the queue is a saved playlist, else bounded inline.
3. Reader: rehydrate `MediaQueue` from `q`; degrade on missing playlist id.
4. Decide the compact inline wire format against measured queue sizes (the "magic").
5. **Test Engineer**: share-from-queue round-trips the sequence + cursor; persistent form survives playlist edits by id; oversized ephemeral queue truncates with a surfaced notice; old permalinks (no `q`) still resolve.

**Branch**: `adr/164-shareable-queue-permalinks` → PR.

---
[ADR: ADR-164, ADR-151, ADR-154, ADR-157, ADR-162, ADR-163]
[AGENTS: graph-architect]
