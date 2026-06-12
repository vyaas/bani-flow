# ADR-166: Section-Header Play All & Enqueue — the Filter as Playlist Generator (Detail Panels)

**Status**: Proposed
**Date**: 2026-06-12
**Agents**: graph-architect → carnatic-coder → test-engineer
**Depends on**: ADR-165 (`registerQueueItem` / `collectQueueItems` / `MediaQueue.addItems` — the mechanism this ADR surfaces), ADR-128 (`buildSection` — the header row that hosts the new buttons), ADR-161 (button vocabulary, 44px touch targets), ADR-162 (queue panel the results land in), ADR-163 ("Save as playlist" — the closing gesture of the loop this ADR opens).
**Series**: second of three — ADR-165 (mechanism) → **ADR-166 (detail panels)** → ADR-167 (Bani Flow).

---

## Context (forces in tension)

The headline scenario, verbatim from the user: *open Ramnad Krishnan's panel, type "begada" into the filter above the sections, press Play All on a section — and only the filtered content becomes the queue.* The filter input (`#rec-filter`, `base.html:4978`) already narrows every section bracket-, tree-, and lecdem-aware (`graph_view.js:1298`); ADR-165 makes that narrowed view harvestable. What is missing is the **affordance**: a per-section Play All, and its quieter sibling **Enqueue**, which appends the same harvest to the running queue instead of replacing it.

Why *per section*, and why *both* buttons:
- **Sections are the natural playlist granularity.** "All of this musician's CONCERTS in Begada" and "all RECORDINGS in Begada" are different intents; a single panel-level button would erase the distinction the section structure already draws.
- **Play All replaces; Enqueue composes.** Replacement makes the filter a playlist *generator*; appending makes it a playlist *builder* — filter "begada" under one musician, enqueue, filter "begada" under another, enqueue again, and the queue is now a cross-musician Begada programme assembled from successive filters. With the ADR-162 queue's "Save as playlist" (→ ADR-163 `op:"create"`), the full loop is: **filter → enqueue × N → save** — a persistent playlist authored without ever hand-picking a row.
- **Counts must not lie.** A static "(N)" on a button while the filter shows 3 of N rows would misreport what the button does. Live counts would require every filter listener to broadcast to every section — coupling rejected below.

## Pattern

**Levels of Scale.** The row already has play and `+` (ADR-163). The section header is the next level up: it gets the same two verbs — play (▶) and add (⊕) — operating on the *set* the section currently shows. Same vocabulary, one scale larger; nothing new to learn.

## Decision

### 1. `buildSection` grows an optional playable surface

`buildSection` (`panel_components.js:72`) accepts one new option:

```js
buildSection({ headerChip, headerSuffixText, count, defaultCollapsed, playable = false })
```

When `playable` is true, the header row gains a right-aligned actions span with two buttons, *after* the label wrap:

```
[▼]  [CHIP] (N)                       [▶] [⊕]
```

- **▶ Play All** — `title="Play all visible"`. On click: `const items = collectQueueItems(bodyEl); if (items.length) startMediaQueue(items, 0);`
- **⊕ Enqueue** — `title="Add visible to queue"`. On click: `MediaQueue.addItems(collectQueueItems(bodyEl))`.

Both compute the harvest **lazily at click time** — the buttons carry no count and subscribe to nothing. Whatever the filter shows at the moment of the click is what plays; the count question dissolves instead of being answered. (Rejected alternative: live per-button counts driven by the filter listeners — it couples every filter to every section header and re-walks the DOM per keystroke for purely decorative numbers. If wanted later, a `bani:filtered` CustomEvent dispatched by the two listeners is the clean hook; out of scope now.)

Empty harvest → no-op (no dead queue, no error). The existing header-click guard (`panel_components.js:109`) already ignores clicks on buttons, so collapse behaviour is untouched.

### 2. Scope of the harvest is the section body

`collectQueueItems(bodyEl)` — each section plays only its own visible rows, in visual order. The ADR-165 channel invariant guarantees that `#rec-filter`'s inline-display hiding is honoured and that a *collapsed* (but unfiltered) section still plays in full from its header buttons.

### 3. Roll-out — every section in the detail panels

`playable: true` for every section whose rows register queue items (ADR-165 §1):

| Panel | Sections |
|---|---|
| Musician | CONCERTS, RECORDINGS, LECDEMS, PLAYLISTS |
| Raga | performances/compositions tree section, PLAYLISTS |
| Composition | performances, PLAYLISTS |

PLAYLISTS rows return arrays from their thunks (`_playlistToQueueItems`); the harvest flattens (ADR-165 §2), so ▶ on a PLAYLISTS section plays the *concatenation of the visible playlists* — filter "begada", press ▶, and every Begada-matching playlist plays end to end.

Sections with zero registered rows simply omit `playable` (no dead buttons).

### 4. Styling & ergonomics

ADR-161 vocabulary: compact icon buttons on desktop, ≥44px touch targets on mobile. The ⊕ glyph here means "add these to the queue" while the queue panel's own ⊕ means "save queue as playlist" (ADR-162 head) — same *add* family, different scales; if user testing shows confusion, the queue-head button is the one to relabel (it has a text-affordance home), not this one. Buttons inherit the section-header hover/focus treatment; no new colours.

### Acceptance scenario (the user's, verbatim)

1. Open **Ramnad Krishnan**'s panel. Type `begada` into the filter above the sections.
2. Press **▶** on RECORDINGS → the queue is exactly the Begada-matching recording rows, top-to-bottom, playing, with the Up-Next panel open (ADR-162).
3. Clear the filter, type `sankarabharanam`, press **⊕** on CONCERTS → those spans append after the Begada items.
4. Press the queue's **Save as playlist** → an ADR-163 `op:"create"` bundle item containing the combined sequence.

## Consequences

**Positive**
- The filter becomes a first-class playlist generator with two buttons and zero new filter logic; the powerful loop (filter → ▶/⊕ → save) is composed entirely of shipped machinery (ADR-162 + 163) plus ADR-165's harvest.
- Per-section granularity matches musical intent; Enqueue makes cross-musician, cross-raga programme building a fold of simple gestures.
- Lazy harvesting keeps the feature O(0) until clicked and immune to filter/section coupling.

**Negative / costs**
- Two more icons in every section header — header density rises; mitigated by ADR-161 sizing and by omitting the pair on empty sections.
- No visible count means the user discovers the harvest size only in the queue panel; acceptable because the panel opens on play (ADR-162) and shows it immediately.
- ⊕ now appears at two scales (section: enqueue; queue head: save as playlist) — flagged above with the designated resolution path.

## Implementation (for Coder, after acceptance)

1. Extend `buildSection` (`panel_components.js`) with `playable` + the actions span and the two click handlers (harvest lazily; guard empty).
2. Pass `playable: true` at the §3 call sites in `media_player.js` (musician/raga/composition panel section builders, including `buildPlaylistsSection` at `:3153`); confirm each section's rows register thunks per ADR-165 step 2.
3. CSS in `base.html`: header actions span (right-aligned, `margin-left: auto`), desktop compact / mobile ≥44px per ADR-161.
4. `.venv/bin/bani-render`; run the acceptance scenario manually.

**Test Engineer:**
5. Integration (rendered `graph.html`): filtered Play All queues only visible rows, in visual order; Enqueue appends without disturbing the current item; empty-harvest click is a no-op; collapsed-but-unfiltered section plays in full.
6. PLAYLISTS section ▶ flattens multiple visible playlists in order.
7. Header buttons do not trigger section collapse (guard at `panel_components.js:109`).

**Branch**: `adr/165-filter-scoped-queue-harvest` (shared series branch) — UI surface on the ADR-165 mechanism; PR covers 165–167 together.

---
[ADR: ADR-166, ADR-165, ADR-128, ADR-161, ADR-162, ADR-163]
[AGENTS: graph-architect]
