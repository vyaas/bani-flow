# ADR-101: Timestamped Segments for Concert Recordings and Lecdems

**Status**: Accepted  
**Date**: 2025-07-25  
**AGENTS**: librarian, carnatic-coder

---

## Context

Bani Flow stores two kinds of time-stamped musical content:

1. **Concert recordings** (`carnatic/data/recordings/<id>.json`) — sessions with
   `performances[]`, each having `performance_index`, `offset_seconds`, `composition_id`, etc.

2. **Lecture-demos (lecdems)** — YouTube entries on a musician node with
   `kind: "lecdem"` and a `subjects` object listing referenced ragas, compositions,
   musician IDs. Lecdems have no timestamp data; navigation inside them is impossible.

The gap: there is **no in-browser affordance to jump to a segment** inside a lecdem,
and there is **no write channel to add new performances to existing recordings**.
Both block the "listening-curation loop": watch → identify → annotate.

ADR-101 closes that loop by:
- Adding a `segments[]` array to lecdem youtube entries (same shape as recording performances).
- Adding writer verbs to append/patch recording performances and lecdem segments.
- Adding an in-browser "Add segment at current time" Edit-form affordance (Phase C).
- Rendering segments as a clickable timeline on the recording panel and lecdem rows (Phase D).

---

## Pattern

*Levels of Scale* — the listening experience gains a new level of granularity between
"whole video" and "whole concert": named, seekable segments. Each segment is a strong
centre with its own raga, composition, and timestamp identity.

---

## Decision

### §1 — Lecdem segment shape (new optional field on youtube lecdem entries)

```json
{
  "segment_index": 1,
  "timestamp": "00:23:14",
  "offset_seconds": 1394,
  "duration_seconds": null,
  "composition_id": "evari_mata",
  "raga_id": "kambhoji",
  "tala": "rupakam",
  "composer_id": "tyagaraja",
  "performer_ids": ["tm_krishna"],
  "display_title": "evari mātā",
  "kind": "kriti",
  "notes": null
}
```

- `timestamp` is **always derived** from `offset_seconds` by the writer (never set manually).
- At least one of `composition_id`, `raga_id`, `kind`, `notes`, `display_title` must be present.
- `offset_seconds` must be ≥ 0 and monotonically non-decreasing across segments.
- `segment_index` is 1-based, assigned by the writer.

### §2 — Recording performance schema (existing `performances[]` is unchanged)

No field renames. `performance_index` stays `performance_index`. The ADR adds write
verbs to append/patch performances; it does not change the on-disk schema.

### §3 — Writer verbs (Phase A + B)

**Phase A — lecdem segments:**
- `add_lecdem_segment(musicians_path, *, musician_id, vid, segment_dict, ...)` — appends to `youtube[vid].segments[]`
- `patch_lecdem_segment(musicians_path, *, musician_id, vid, segment_index, field, value, at_offset_seconds=None, ...)` — patches one field with optional drift check

**Phase B — recording performances:**
- `add_recording_performance(*, recording_id, session_index, performance_dict, ...)` — appends to `sessions[i].performances[]`
- `patch_recording_performance(*, recording_id, session_index, performance_index, field, value, at_offset_seconds=None, ...)` — patches one field with optional drift check

### §4 — Bundle dispatch (bani_add.py)

Musician `op: "append"`, `array: "youtube[<vid>].segments"` → `add_lecdem_segment()`
Musician `op: "patch"`, `field: "youtube[<vid>].segments[<i>].<field>"` → `patch_lecdem_segment()`
Recording `op: "append"`, `array: "sessions[<i>].performances"` → `add_recording_performance()`
Recording `op: "patch"`, `field: "sessions[<i>].performances[<j>].<field>"` → `patch_recording_performance()`

### §5 — In-browser segment form (Phase C)

`buildSegmentForm(target)` — a floating Edit-form window for adding a segment.
- `target`: `{ kind: "recording" | "lecdem", id, vid? }`
- Fields: offset_seconds (number input), composition, raga, tala, composer, kind, display_title, notes
- "Grab from active player" button calls `getCurrentPlayerTime(vid)` — returns `currentOffset`
  from playerRegistry (last-seeked position), with graceful fallback to manual entry.
- On submit: pushes `{op: "append", bucket: "recordings"|"musicians", ...}` into baniBundle.

### §6 — Renderer: clickable segment timeline (Phase D)

Recording panel: `sessions[].performances[]` rendered as clickable timeline rows.
Click calls `openOrFocusPlayer(vid, ..., offset_seconds)` to seek to that segment.

Lecdem row expanded view: `segments[]` rendered as timeline. Falls back to existing
`subjects` chip-row when `segments[]` is absent.

---

## Consequences

- Lecdem entries gain a `segments[]` array (optional; absent = backward compatible).
- Recording performances gain append/patch writer verbs.
- The Edit form gains a "Recording segment" entity type.
- Phase D renderer closes the loop: segments are clickable from the panel.

---

## Implementation

Phases: A (writer lecdem), B (writer recording), C (forms UI), D (renderer timeline).

Phase D renderer noted as "not in scope for acceptance" but implemented for loop closure.
