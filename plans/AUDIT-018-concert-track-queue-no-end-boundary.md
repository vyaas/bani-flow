---
name: AUDIT-018-concert-track-queue-no-end-boundary
description: Concert tracks enqueued via + button play the entire source video before advancing — end_seconds boundary is never set on queue items for concert performances.
metadata:
  type: project
---

# AUDIT-018: Concert track + queue: missing `end_seconds` boundary

**Scope:** `carnatic/render/templates/media_player.js` — the three `_*Thunk` closures
that power the `+` button on concert performance rows, and the queue-advance
cross-recording boundary check.

---

## Summary

When a user enqueues two tracks from the same concert recording (e.g. `bālē bālēndu
bhūṣaṇi` at 0 s and `bhajana parulakēla` at 1010 s from `poonamallee_1965`), the
queue never terminates the first track at 1010 s. The entire three-hour YouTube video
plays to completion before the queue advances to the second item.

Individual (non-concert) recordings are unaffected because they have their own
YouTube `video_id` — the queue advances when the video ends naturally.

---

## Root cause

The ADR-163 §5 boundary-advance mechanism (line 1280) is correct and fully
operational:

```js
// media_player.js:1275–1281
if (_qi && _qi.meta && _qi.meta.end_seconds != null && sec >= _qi.meta.end_seconds) {
  MediaQueue.advance();
}
```

The mechanism fires if `meta.end_seconds` is set on the current queue item.
**It is never set** for concert-performance queue items.

The three `_*Thunk` closures that feed the `+` button for concert rows all omit
`end_seconds` from `meta`:

### Finding 1 — `_concertPerfThunk` (concert bracket rows)

**File:** `media_player.js:2547–2551`

```js
const _concertPerfThunk = (() => { const _p = p; return () => ({
  media: _p.video_id, startSeconds: _p.offset_seconds || 0,
  label: _p.display_title || '', artistName: artistLabel,
  meta: { ragaId: _p.raga_id || null, compositionId: _p.composition_id || null, nodeId },
  //     ^^^ no end_seconds — queue item has no upper time boundary
}); })();
```

This path covers the concert bracket `buildConcertBracket()`.

### Finding 2 — `_singleRecThunk` (single-recording composition-tree rows)

**File:** `media_player.js:2676–2680`

```js
const _singleRecThunk = (() => { const _p = p; return () => ({
  media: _p.video_id, startSeconds: _p.offset_seconds || 0,
  label: _p.display_title || '', artistName: artistLabel,
  meta: { ragaId: _p.raga_id || null, compositionId: _p.composition_id || null, nodeId },
  //     ^^^ no end_seconds
}); })();
```

This path covers `buildCompNode()` when a composition has a single recording that
carries a `recording_id` (i.e. is part of a concert).

### Finding 3 — `_multiRecThunk` (multi-recording accordion rows)

**File:** `media_player.js:2752–2756`

```js
const _multiRecThunk = (() => { const _p = p; return () => ({
  media: _p.video_id, startSeconds: _p.offset_seconds || 0,
  label: _p.display_title || '', artistName: artistLabel,
  meta: { ragaId: _p.raga_id || null, compositionId: _p.composition_id || null, nodeId },
  //     ^^^ no end_seconds
}); })();
```

Same issue in the expanded accordion version rows.

---

## Why individual recordings are unaffected

A standalone recording (no `recording_id`, dedicated `video_id`) plays as a whole
video. When it ends, `controller.onEnded` fires at line 1286 and the queue advances
naturally. No `end_seconds` is needed because the video itself is the boundary.

A concert track shares its `video_id` with every other track in the same concert.
When `endedOf` fires it means the entire concert is over — three hours later for
Poonamallee 1965. Only `end_seconds` can stop the queue item early.

---

## What `end_seconds` should be

For a concert performance `p` with `offset_seconds = S`, the correct `end_seconds` is
the `offset_seconds` of the *next* performance in that concert (sorted ascending),
or `null` if `p` is the last track (the video ending naturally handles that case).

The data required to compute this is already present at thunk-construction time:
`_allTracks` (sorted, available inside `buildConcertBracket`) and the structured-perf
list available via `_buildConcertTracksFor` (used by the raga tree paths).

For lecdem segments the same logic applies — each segment has an `offset_seconds`
and the next segment's `offset_seconds` is the natural boundary. Findings 1–3 cover
the concert paths; lecdem should be audited separately once the concert fix is
verified.

---

## Recommendations

### R-1 — Compute `end_seconds` at thunk construction for all three concert thunks

For each of Findings 1–3, compute:

```js
const nextTrack = allSortedTracks.find(t => t.offset_seconds > _p.offset_seconds);
const endSec = nextTrack ? nextTrack.offset_seconds : null;
```

Then include `end_seconds: endSec` in `meta`. The `allSortedTracks` array is either:
- The `playerTracks` local already built in the play-button's click handler (Finding 1),
- The result of `_buildConcertTracksFor(p.recording_id, nodeId)` (Findings 2 & 3).

All three are available in the same closure scope as the thunk.

### R-2 — Consider a helper `_endSecondsFor(offsetSeconds, sortedTracks)`

A one-liner utility:
```js
function _endSecondsFor(offsetSeconds, sortedTracks) {
  const next = sortedTracks.find(t => (t.offset_seconds || 0) > offsetSeconds);
  return next ? next.offset_seconds : null;
}
```

Prevents the same ad-hoc computation being duplicated in three places. Not strictly
required for correctness, but eliminates repetition.

---

## Routing

| Finding | Route to | Action |
|---------|----------|--------|
| F-1, F-2, F-3 | 🎵 **Carnatic Coder** | Add `end_seconds` to `meta` in the three `_*Thunk` closures |
| R-2 (helper) | 🎵 **Carnatic Coder** | Optional — extract `_endSecondsFor` helper if Coder judges it worthwhile |
| Lecdem segment paths | 🔍 **Code Auditor** (follow-up) | Separate audit pass after concert fix is verified |

No schema changes are needed. This is a pure JavaScript bug in the render template.

---

## Evidence snippet — the functional `end_seconds` consumer (correct, untouched)

```js
// media_player.js:1275–1281  ← this works; the problem is upstream
controller.onTime(sec => {
  instance.currentOffset = sec;
  _updateActiveSegment(instance, sec);
  if (MediaQueue.isCurrent(instance.mediaKey)) {
    const _qi = MediaQueue.items[MediaQueue.index];
    if (_qi && _qi.meta && _qi.meta.end_seconds != null && sec >= _qi.meta.end_seconds) {
      MediaQueue.advance();
    }
  }
});
```

The boundary check is correct. It simply never has data to act on.

---

*Auditor: 🔍 Code Auditor | Date: 2026-06-17*
