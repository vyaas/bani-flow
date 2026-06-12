# ADR-162: The Queue Made Visible & Editable

**Status**: Accepted
**Date**: 2026-06-12 (proposed + accepted)
**Implementation note**: shipped desktop-first, then mobile (the queue toggle/panel added to both player paths, like the tracklist). Reorder via up/down controls rather than drag (touch-robust; drag is a possible later enhancement).
**Agents**: graph-architect → carnatic-coder → test-engineer
**Depends on**: ADR-157 (the ephemeral `MediaQueue` this gives a face to), ADR-161 (the upward-opening surface + toggle-button primitive it reuses), ADR-159 (chip rail vocabulary). **Completes**: ADR-157 Phase A.

---

## Context (forces in tension)

ADR-157 Phase A shipped an ephemeral queue: `MediaQueue` is a real, working, auto-advancing in-memory playlist (`media_player.js:1196–1252`). But it is **invisible**. "Play all" starts it; from then on the user has no window into it:

- They cannot see *what* is queued, *how many* items, or *which one is current*.
- They cannot reorder, remove, or skip to an item.
- "Play all" is therefore a leap of faith — the user, as you put it, "has no idea what Play all means," because nothing shows the queue it created.

A queue that cannot be inspected or edited is a queue the user cannot trust. ADR-157 deliberately built the *mechanism* first and deferred the *surface*; this ADR is that surface. It is still **ephemeral — no schema, no persistence** (that is ADR-163). This ADR's entire job is to make the existing `MediaQueue` legible and editable in the session.

The forces: **legibility** (you must see the queue you started), **control** (reorder/remove/skip without restarting), and **restraint** (do not smuggle in persistence — that is a separate, schema-bearing decision).

## Pattern

**Make the invisible visible.** `MediaQueue` is a strong centre with no boundary the user can see or touch. Give it one: a panel, packaged with the player, that *is* the queue — every mutation to the panel is a mutation to `MediaQueue`, and `MediaQueue`'s auto-advance is reflected back into the panel. Model, not mirror: one queue, two-way bound.

## Decision

### 1. An "Up Next" panel, packaged with the player

A new bar-summoned surface — the **queue panel** ("Up Next") — opens via a toggle button in the bar, using ADR-161's `.mp-toggle-btn[aria-pressed]` and ADR-161's **upward-opening** anchor (never over the video). It sits alongside the existing tracklist toggle (the tracklist navigates *within one recording*; the queue spans *across items* — related but distinct, so two toggles, clearly labelled).

The panel renders `MediaQueue.items` as an ordered list, each row showing:
- position / now-playing indicator (the current item highlighted, mirroring `MediaQueue.index` / `currentKey`, `:1204–1217`),
- the item's identity as **chips** (performer · raga · composition — same chip vocabulary as ADR-159, so the queue reads like the rest of the app),
- a **remove** control, and a **drag handle** for reorder.

### 2. "Play all" becomes legible

When "Play all" fires `MediaQueue.start(...)`, it now also **opens the queue panel** (or flashes it) so the user immediately sees the sequence they created, with item count and current position. "Play all" stops being a black box: it visibly fills a list.

### 3. Two-way binding between panel and `MediaQueue`

- **Panel → queue**: remove deletes from `MediaQueue.items` (adjusting `index` if the removed item precedes the current one); drag-reorder reorders `items` (preserving the current item's identity, not its numeric index); click-a-row jumps (`MediaQueue` seeks to that index and opens it — extend `MediaQueue` with a `jumpTo(i)` beside the existing `advance()`).
- **Queue → panel**: when `MediaQueue` auto-advances on `ended` (`:1049`, guarded by `isCurrent`), the panel's highlight moves to the new current item without a rebuild flicker. The panel subscribes to advance, rather than polling.
- Removing the **current** item: advance to the next (or stop cleanly if it was the last), consistent with ADR-157's "never silently stall."

### 4. Skip / previous transport

With the queue visible, expose **next** and **previous** transport (skip current, go back one) — `MediaQueue` already has the items and index; this is `advance()` plus a `previous()`. These can live in the queue panel header or the bar. Honour ADR-157's uncontrollable-item rule (pause + "continue" affordance) when skipping into a non-controllable item.

### 5. Explicitly still ephemeral

No `playlists/*.json`, no write verb, no `graph.json` change. The queue lives and dies with the session exactly as ADR-157 Phase A specified. The **inline permalink encoding** of a bounded queue (ADR-157 Implementation step 2, `state.q`) MAY be wired here so a session queue is shareable as a URL — but that is the *only* persistence, and it is bounded (cf. ADR-151 cap). Anything beyond that is ADR-163.

## Consequences

**Positive**
- "Play all" becomes trustworthy: the user sees, trusts, and steers the sequence.
- Reorder/remove/skip/jump turn a fire-and-forget queue into a controllable one — with zero new schema.
- The queue panel is the **visual and interaction prototype** for ADR-163's persistent playlists: when persistence lands, a playlist *opens into this same panel*. We validate the interaction before we pay for the write surface (exactly ADR-157's staging intent).

**Negative / costs**
- Two-way binding between a DOM list and `MediaQueue` introduces index-bookkeeping bugs (remove-before-current, reorder-across-current, remove-the-current) — the §3 rules must be precise and well-tested.
- Two bar toggles (tracklist + queue) risk confusion; labelling and the ADR-161 pressed-state must make "within this recording" vs. "across items" obvious.
- Drag-reorder on touch is fiddly; needs a real drag handle, not whole-row drag (whole-row is the jump affordance).

## Implementation (for Coder, after acceptance)

1. Extend `MediaQueue` with `jumpTo(i)`, `previous()`, and an advance-subscription hook (callback or event) so the panel can react without polling (`media_player.js:1196–1252`).
2. Build the "Up Next" panel: chip rows (ADR-159 vocabulary), now-playing highlight, remove control, drag handle; open via an ADR-161 toggle button with `aria-pressed`, anchored **upward** (ADR-161 §3).
3. Wire two-way binding (§3): panel mutations → `MediaQueue` with correct index adjustment; `MediaQueue` advance → panel highlight.
4. Make "Play all" open/flash the panel (§2). Add next/previous transport (§4) honouring the uncontrollable-item pause.
5. (Optional) wire the bounded `state.q` permalink encoding from ADR-157 step 2.
6. Run `.venv/bin/bani-render`.
7. **Test Engineer**: Play all opens a panel matching the started items; remove-before-current keeps the right item playing; reorder-across-current preserves the current item; remove-current advances (or stops if last); click-row jumps; auto-advance moves the highlight without rebuild flicker; skip-into-uncontrollable pauses with a continue affordance; no `playlists/*.json` or `graph.json` queue persistence appears.

**Branch**: `adr/162-visible-editable-queue` → PR.

---
[ADR: ADR-162, ADR-157, ADR-161, ADR-159, ADR-151]
[AGENTS: graph-architect]
