# ADR-167: Bani Flow Filter-Scoped Play All & Enqueue — Trail, Strips, and the Span-Accurate Trail Queue

**Status**: Proposed
**Date**: 2026-06-12
**Agents**: graph-architect → carnatic-coder → test-engineer
**Depends on**: ADR-165 (harvest mechanism), ADR-166 (the affordance pair this ADR mirrors on the left panel), ADR-157 ("Play all" on the trail — **partially superseded**: its placement, eager precomputation, and whole-video dedup are replaced; its queue mechanics live on in ADR-162), ADR-081 (lecdem strip discoverability invariant), ADR-156 (spans), ADR-163 (PLAYLISTS section in Bani Flow, "Save as playlist").
**Series**: third of three — ADR-165 (mechanism) → ADR-166 (detail panels) → **ADR-167 (Bani Flow)**.

---

## Context (forces in tension)

The left panel is where the filter-as-playlist-generator idea is *most* powerful — a Bani Flow subject (a raga, a composition) already curates a cross-musician trail, and `#trail-filter` (`base.html:4870`, listener `graph_view.js:1440`) narrows it further. "Begada as rendered by violinists", "Sankari Neeve, 1960s only" — these are typed, not curated. But the left panel's current play-all predates the series and contradicts it three ways (`bani_flow.js:735–771`):

1. **Wrong place**: a `▶ Play all (N)` button appended at the *bottom* of the trail list — below the fold on any real trail, opposite of ADR-166's header placement, and its static `(N)` misreports under filtering.
2. **Wrong time**: `_qItems` is eagerly precomputed at render, so the button is **blind to `#trail-filter`** — it always plays the whole trail, filtered or not.
3. **Wrong dedup**: ADR-157 deduped by `media_key` alone — one concert appears once even when the trail shows three of its segments. Under the span model (ADR-156) that discards two of the three Begada renditions the user can see.

Meanwhile the Bani Flow PLAYLISTS section (ADR-163, `bani_flow.js:787–803`) and the lecdem strip (ADR-081) have no play-all at all. The user's directive is *every section in both panels*.

## Pattern

**Symmetry across the axis.** Both panels are subject views over playable rows with a filter above; ADR-166 fixed the vocabulary (header-level ▶/⊕, lazy harvest). This ADR completes the symmetry rather than inventing anything — the only genuinely new decision is span accuracy in the trail queue.

## Decision

### 1. Trail rows register thunks; the eager `_qItems` block is deleted

Each trail row (tree leaf in raga/comp mode, flat row in perf/yt mode) calls `window.registerQueueItem(rowEl, getItem)` (ADR-165) as it is built, with a thunk producing the same item shape ADR-157 built eagerly (`media:`, `label:`, `artistName:`, `startSeconds: track.offset_seconds`, `concertTitle:`, `meta:{nodeId, ragaId, compositionId, recId}`). The `_qSeen`/`_qItems` block and the bottom-of-list button (`bani_flow.js:738–771`) are **removed** — the harvest replaces them.

### 2. Span-accurate items — `end_seconds` from the segment's successor

Where a trail row is a **segment inside a structured recording** and the recording's segment list (already indexed — cf. `media_player.js:2086`) yields a successor segment, the thunk sets `meta.end_seconds` to the successor's `offset_seconds`. The ADR-163 §5 advance trigger then ends the span at the right moment instead of bleeding into the rest of the concert.

Dedup follows ADR-165's `mediaKey@startSeconds` key: three Begada segments of one concert are three queue items. **This is a deliberate behaviour change from ADR-157** — playing a raga's trail now plays each *rendition*, not each *video*. Whole-video rows (no segment context) keep `startSeconds` as-is with no `end_seconds`, exactly as before.

### 3. Header-level ▶/⊕ for every Bani Flow section

The ADR-166 actions pair, harvest scoped per section:

| Section | Harvest root | Notes |
|---|---|---|
| **Trail** | `#trail-list` | Pair lives in the trail's subject-header row, beside `#trail-filter` — the generator sits visually under the rule that scopes it. |
| **PLAYLISTS** (`#bani-playlists`) | its container | Rows' thunks return arrays (`_playlistToQueueItems`); harvest flattens (ADR-165 §2). |
| **LECDEM strip** (`#bani-lecdem-strip`) | the strip | See §4. |

All three compute lazily at click; `#trail-filter` already hides trail leaves, playlist rows, and strip chips via the inline-display channel (`graph_view.js:1440–1530`), so the harvest is filter-correct with zero new matching logic.

### 4. The lecdem strip plays, but stays undiscoverable

ADR-081's invariant says lecdems are a *discovery* experience — never a global-search facet. Playing the **currently visible** strip chips violates nothing: the user has already discovered them (they are on screen, possibly narrowed by `#trail-filter`). Strip chips therefore register thunks (whole-lecdem items, `startSeconds: 0`) and the strip gets the ▶/⊕ pair. The invariant continues to constrain *search exposure*, not *playability* — noted here so ADR-081 needs no amendment.

### 5. ADR-157 status update

ADR-157's trail play-all section is marked **superseded by ADR-167** (pointer added to its Status block on acceptance). Its `MediaQueue` foundations are untouched — they were already re-homed by ADR-162.

### Acceptance scenario (left-panel counterpart of ADR-166's)

1. Bani-search **Begada**. The trail shows every Begada rendition across musicians.
2. Type `violin` into `#trail-filter`; press the trail header's **▶** → the queue is exactly the visible violin renditions, span-accurate (each segment ends where the next begins), visual order.
3. Press **⊕** on the PLAYLISTS section → visible Begada playlists append.
4. Queue panel → **Save as playlist** → "Begada on the violin", generated from two filters and three clicks, lands in the bundle as an ADR-163 `op:"create"`.

## Consequences

**Positive**
- The left panel becomes the strongest playlist generator in the product: subject selection × text filter × per-section harvest, all composable into the ADR-163 save loop.
- Deletes ADR-157's eager precomputation (render-time work on every trail build for a button most sessions never press) in favour of click-time harvesting.
- Span-accurate trail playback fixes a real fidelity gap: filtered renditions inside long concerts now play as renditions.

**Negative / costs**
- A behaviour change for existing users of the trail play-all: per-rendition spans instead of one whole video per concert, and the button moves from list bottom to header. Both are strict improvements for the stated vision, but worth a line in the change log.
- `end_seconds` derivation depends on segment ordering data being present and sorted; where absent the item degrades gracefully to open-ended (pre-existing behaviour).
- The lecdem strip's ▶ plays whole lecdems (no chaptering in the harvest); chapter-level spans are possible later via the same thunk contract if wanted.

## Implementation (for Coder, after acceptance)

1. `bani_flow.js`: register thunks on trail leaves/rows as they are built (§1, §2 — derive `end_seconds` from the successor segment where available); delete the `_qItems` block and bottom button (`:735–771`); register thunks on PLAYLISTS rows and lecdem strip chips.
2. Add the ▶/⊕ pair to the trail subject-header row, the PLAYLISTS section header, and the strip header, scoped per §3, styled per ADR-161/166 (mobile ≥44px).
3. Update ADR-157's Status block with the supersession pointer (§5).
4. `.venv/bin/bani-render`; run the acceptance scenario manually.

**Test Engineer:**
5. Integration: `#trail-filter`-narrowed ▶ queues only visible rows; segment rows carry correct `end_seconds` (advance fires at successor offset — extend the ADR-163 §5 continuation test); whole-video rows unchanged.
6. Dedup: a trail showing three segments of one recording yields three queue items; the same recording reachable twice at the same offset yields one.
7. Strip ▶ plays only chips visible under the current filter; PLAYLISTS ⊕ flattens and appends.
8. Regression: removing ADR-157's block leaves no orphaned `trail-play-all` CSS/handlers.

**Branch**: `adr/165-filter-scoped-queue-harvest` (shared series branch) — PR covers 165–167 together.

---
[ADR: ADR-167, ADR-165, ADR-166, ADR-157, ADR-081, ADR-156, ADR-162, ADR-163]
[AGENTS: graph-architect]
