---
name: AUDIT-019-trail-harvest-end-seconds-regression
description: The trail-level "Play all" / "Enqueue all" harvest still produces queue items without end_seconds for concert-segment rows, so enqueuing all renditions of a composition keeps playing past the segment boundary into the rest of the source concert.
metadata:
  type: project
---

# AUDIT-019: Trail harvest queue items missing `end_seconds` boundary

**Scope:** `carnatic/render/templates/bani_flow.js` — the three `registerQueueItem` thunks that feed `collectQueueItems` for the composition / raga / flat trail panels.

**Date:** 2026-06-24
**Reported by:** user (marubalka playlist test)
**Related:** [AUDIT-018](AUDIT-018-concert-track-queue-no-end-boundary.md), commit `4a3b84e` (`fix(render): complete end_seconds fix — raga/comp panel + button and mobile onTime`)

---

## Symptom

User opens the composition panel for `marubalka` (4 renditions: Ariyakudi, Semmangudi, TM Krishna, Vignesh Ishwar), clicks the trail-level ⊕ **Enqueue all**, and starts playback.

Expected: Ariyakudi's Marubalka segment plays, then advances to Semmangudi, then TM Krishna, then Vignesh Ishwar.

Actual: Ariyakudi's segment plays, then **the source video (Shanmukhananda 1963 concert) keeps playing** — the next perf in the same concert (`Endaro Mahanubhavulu`, `Pantuvarali alapana`, `Aparama Bhakti`, …) plays instead of advancing to the next queue item.

---

## Why the prior fix did not catch this

Commit `4a3b84e` (AUDIT-018 follow-up) added the `end_seconds` derivation only to the **plus-button thunk** inside [`_buildPlayActsDiv`](../carnatic/render/templates/bani_flow.js#L1049-L1062). That covers the case where the user adds tracks **one at a time** by clicking each row's ⊕ button.

But the harvest path is different. ADR-167's trail-level ⊕ button calls `MediaQueue.addItems(collectQueueItems(trailList))`, which walks every `.q-row` in `#trail-list` and invokes the row's **`registerQueueItem` thunk** — not the plus-button thunk. ADR-165 §3 explicitly intends "same thunk feeds the + menu and the harvest" but `bani_flow.js` has them diverged: the harvest thunks were written without `end_seconds`.

Inside `media_player.js` the equivalent thunks (`_concertPerfThunk`, `_singleRecThunk`, `_multiRecThunk` — see [media_player.js#L2563-L2581](../carnatic/render/templates/media_player.js#L2563-L2581), [media_player.js#L2690-L2705](../carnatic/render/templates/media_player.js#L2690-L2705), [media_player.js#L2765-L2780](../carnatic/render/templates/media_player.js#L2765-L2780)) correctly derive `end_seconds`. The defect is contained to `bani_flow.js`.

---

## Findings

### F-01 — `buildTrailItem` registerQueueItem thunk omits `end_seconds`

- **File:** [bani_flow.js#L972-L989](../carnatic/render/templates/bani_flow.js#L972-L989)
- **Pattern:** missing-field-on-divergent-clone-of-fixed-helper
- **Evidence:**

```js
// ADR-167: register thunk so filter-scoped harvest works on this flat trail row.
if (row.track.media || row.track.vid) {
  const _r = row;
  if (typeof registerQueueItem === 'function') registerQueueItem(li, function() {
    return {
      media:        _r.track.media || _r.track.vid,
      startSeconds: _r.track.offset_seconds || 0,
      ...
      meta: {
        nodeId:        _r.nodeId || null,
        ragaId:        _r.track.raga_id || null,
        compositionId: _r.track.composition_id || null,
        recId:         _r.track.recording_id || null,
        // ← end_seconds NEVER computed for structured rows
      },
    };
  });
}
```

Triggered for every flat trail row (raga / perf / yt subject panels). A flat trail of two concert tracks from the same recording will play the entire source video before advancing.

### F-02 — `buildTreeLeaf` registerQueueItem thunk omits `end_seconds`

- **File:** [bani_flow.js#L1158-L1180](../carnatic/render/templates/bani_flow.js#L1158-L1180)
- **Pattern:** same as F-01
- **Evidence:**

```js
// ADR-167: register thunk so filter-scoped harvest works on this tree leaf.
if (row.track.media || row.track.vid) {
  const _r = row;
  if (typeof registerQueueItem === 'function') registerQueueItem(li, function() {
    return {
      media:        _r.track.media || _r.track.vid,
      startSeconds: _r.track.offset_seconds || 0,
      ...
      meta: {
        nodeId:        _r.nodeId || null,
        ragaId:        _r.track.raga_id || null,
        compositionId: _r.track.composition_id || null,
        recId:         _r.track.recording_id || null,
        // ← end_seconds NEVER computed
      },
    };
  });
}
```

This is the per-version leaf in `buildTreeRaga` (raga panel tree). Affects any raga panel where two versions of a composition come from segments of the same concert.

### F-03 — `buildTreeComp` single-version group registerQueueItem thunk omits `end_seconds`

- **File:** [bani_flow.js#L1376-L1394](../carnatic/render/templates/bani_flow.js#L1376-L1394)
- **Pattern:** same as F-01
- **This is the exact code path the user hit with marubalka.**
- **Evidence:**

```js
// ADR-167: register single-version comp-view group li for harvest.
const _r0 = group.rows[0];
if ((_r0.track.media || _r0.track.vid) && typeof registerQueueItem === 'function') {
  registerQueueItem(li, (function(_r) { return function() {
    return {
      media:        _r.track.media || _r.track.vid,
      startSeconds: _r.track.offset_seconds || 0,
      ...
      meta: {
        nodeId:        _r.nodeId || null,
        ragaId:        _r.track.raga_id || null,
        compositionId: _r.track.composition_id || null,
        recId:         _r.track.recording_id || null,
        // ← end_seconds NEVER computed
      },
    };
  }; })(_r0));
}
```

Walkthrough for marubalka:
- Group 1 (Ariyakudi): `isSingle=true` → registers thunk on the group `li`. `_r0.isStructured=true`, `_r0.track.recording_id='shanmukhananda_1963_ariyakudi'`, `_r0.track.offset_seconds=<marubalka offset in that concert>`. **No `end_seconds`.**
- Group 2 (Semmangudi): same shape → same defect.
- Group 3 (TM Krishna): standalone musician YouTube entry → `recording_id=null` → `end_seconds` should remain null (whole video). Currently correct *by accident*.
- Group 4 (Vignesh Ishwar): same as Group 3 → correct *by accident*.

When the Ariyakudi item starts at its offset, no boundary is set. The `controller.onTime` guard in `media_player.js` requires `_qi.meta.end_seconds != null` — null means "no boundary, play to natural ended". The YouTube `ended` event only fires when the whole 3-hour concert finishes, so the queue stalls on Ariyakudi.

### F-04 — Same logic duplicated four times (one fixed, three unfixed)

- **Files:**
  - [bani_flow.js#L1050-L1057](../carnatic/render/templates/bani_flow.js#L1050-L1057) — `_buildPlayActsDiv` plus-thunk (fixed in `4a3b84e`)
  - [bani_flow.js#L972-L989](../carnatic/render/templates/bani_flow.js#L972-L989) — F-01
  - [bani_flow.js#L1158-L1180](../carnatic/render/templates/bani_flow.js#L1158-L1180) — F-02
  - [bani_flow.js#L1376-L1394](../carnatic/render/templates/bani_flow.js#L1376-L1394) — F-03
- **Pattern:** copy-paste of the same five-line `musicianToPerformances` scan + missed-rename / missed-update on the other three copies
- **Evidence:** The fixed copy is

```js
var endSec = null;
if (row.isStructured && row.track.recording_id) {
  var allForRec = Object.values(musicianToPerformances).flat()
    .filter(function(sp) { return sp.recording_id === row.track.recording_id; })
    .sort(function(a, b) { return (a.offset_seconds || 0) - (b.offset_seconds || 0); });
  var nextPerf = allForRec.find(function(sp) { return (sp.offset_seconds || 0) > (row.track.offset_seconds || 0); });
  endSec = nextPerf ? nextPerf.offset_seconds : null;
}
```

The same five lines belong in F-01/F-02/F-03 but were never added. This is exactly the kind of SICP violation the audit pass exists to catch: an unnamed abstraction repeated four times, with the rope long enough to strangle three sites.

A directly analogous duplication exists in `media_player.js` (`_concertPerfThunk`, `_singleRecThunk`, `_multiRecThunk` all derive `end_seconds` via tiny inline scans of `_concertAllTracks` or `_buildConcertTracksFor`) but in `media_player.js` the duplication is correct everywhere; in `bani_flow.js` three of four copies are wrong. The smell is the same — three lifetimes of opportunity for divergence.

### F-05 — ADR-165 §3 invariant ("same thunk feeds the + menu and the harvest") is violated

- **Pattern:** documented invariant silently broken
- **Evidence:** ADR-165 §3 states the harvest and the `+` menu must use the same thunk so they cannot disagree. In `bani_flow.js`, every row in the trail uses two separate closures:
  - the plus-button thunk inside `_buildPlayActsDiv` (now correct after `4a3b84e`)
  - the `registerQueueItem` thunk in the row builder (still incorrect — F-01/F-02/F-03)

`media_player.js` honours the invariant: `_concertPerfThunk` is *literally* passed to both `_buildPlusBtn(_concertPerfThunk)` and `registerQueueItem(li, _concertPerfThunk)` (see media_player.js#L2580-L2582). `bani_flow.js` does not.

---

## Recommendations

### R-01 — Extract a single `_deriveRowEndSec(row)` helper

Hoist the five-line scan to one place at the top of the trail-builder section in `bani_flow.js`:

```js
// ADR-163 §5: segment boundary for queue-item end_seconds.
// Returns null for standalone (whole-video) rows; the next perf offset in the
// same recording for concert-segment rows.
function _deriveRowEndSec(row) {
  if (!(row.isStructured && row.track.recording_id)) return null;
  const all = Object.values(musicianToPerformances).flat()
    .filter(sp => sp.recording_id === row.track.recording_id)
    .sort((a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0));
  const next = all.find(sp => (sp.offset_seconds || 0) > (row.track.offset_seconds || 0));
  return next ? next.offset_seconds : null;
}
```

Call it from all four sites:
- `_buildPlayActsDiv` plus-thunk — replace the inline block (cleanup, not a behaviour change).
- `buildTrailItem` registerQueueItem thunk — add `end_seconds: _deriveRowEndSec(_r)` to `meta`.
- `buildTreeLeaf` registerQueueItem thunk — same.
- `buildTreeComp` single-version registerQueueItem thunk — same (parameter is `_r0`).

This restores ADR-165 §3 by making the two thunks compute identical `end_seconds` from a single named function.

### R-02 — Cache the per-recording sorted offset list

Each call to `_deriveRowEndSec` flattens `musicianToPerformances` and filters by `recording_id`. For a panel of N rows touching M distinct recordings, this is O(N · |all_perfs|). Build a `Map<recording_id, sortedOffsets[]>` once per trail render and reuse it. Optional — only matters if the trail grows >100 rows. Defer to coder's judgment.

### R-03 — Stop registering two separate thunks per row

The deeper fix that R-01 enables: stop building two closures per row. Build the queue-item once, pass the same reference to `_buildPlusBtn(thunk)` and `registerQueueItem(li, thunk)`. The plus-menu and harvest then cannot disagree by construction. This mirrors `media_player.js`'s `_concertPerfThunk` pattern and is the ADR-165 §3 intent.

### R-04 — Add a regression test

After R-01 lands, AUDIT-018's test (if it exists) should be extended — or a sibling added — that:
1. Seeds two concert-segment rows from different concerts (e.g. marubalka by Ariyakudi from Shanmukhananda 1963 + by Semmangudi from Music Academy 1966).
2. Renders the comp panel for `marubalka`.
3. Calls `collectQueueItems(trailList)` directly.
4. Asserts both items have `meta.end_seconds != null` and equal to the offset of the next performance in their respective source recordings.

---

## Routing

| Finding | Owner | Reason |
|---|---|---|
| F-01, F-02, F-03 | 🎵 Carnatic Coder | Three near-identical one-line fixes in `bani_flow.js` (the registerQueueItem thunks). Use R-01's helper. |
| F-04 | 🎵 Carnatic Coder | DRY cleanup — extract `_deriveRowEndSec` and call from all four sites (one is already correct; the cleanup just reduces it from four copies to one). |
| F-05 | 🎵 Carnatic Coder | Implements R-03 — single thunk per row, passed to both `_buildPlusBtn` and `registerQueueItem`. This is the structural fix that prevents the same regression from recurring. |
| R-04 | 🧪 Test Engineer | Regression test after coder lands the fix. |

No schema implication — no ADR required.

---

## Render gate

After the fix lands, the coder must run `bani-render` and `bani-serve`, then manually verify with the marubalka playlist test described in the symptom above. Ariyakudi → Semmangudi → TM Krishna → Vignesh Ishwar should auto-advance with no other Shanmukhananda 1963 / Music Academy 1966 tracks slipping in between.
