# ADR-101: Timestamped Segments for Concert Recordings and Lecdems — In-Loop, While Listening

**Status**: Proposed
**Date**: 2026-04-25
**Agents**: graph-architect (proposer), carnatic-coder (downstream implementer)
**Depends on**: ADR-016 (writer validation), ADR-077 (lecdem as first-class object), ADR-083 (bundle as canonical write channel), ADR-085 (self-replicating curation loop), ADR-097 (bundle deltas + unified Edit form), ADR-099 (bundle dependency resolution), ADR-100 (edit coverage matrix)
**Extends**: the recording schema (`carnatic/data/recordings/READYOU.md`) and ADR-077's lecdem `subjects` block

---

## Context

Concert recordings in `carnatic/data/recordings/` are already structured by *time*: `sessions[].performances[]` is an ordered list with `timestamp` (e.g. `"00:18:42"`) and `offset_seconds`, each performance carrying a `composition_id`, `raga_id`, `tala`, `composer_id`, optional `notes`. The schema is mature; the curation surface for it is not.

Today, populating this structure means hand-editing the recording's JSON file. There is no in-loop affordance to (a) play a recording in the embedded player, (b) hear the artist transition into a new piece at, say, 23:14, (c) pause, name the raga, the kṛti, the tala, and (d) commit that segment to the recording's JSON before the impression fades.

The same gap exists for lecdems. ADR-077 made a lecdem a `youtube[<vid>]` entry with `kind: "lecdem"` and a `subjects` block (`raga_ids`, `composition_ids`, `musician_ids`). But `subjects` is *un-timestamped*: a lecdem on Kambhoji that demonstrates Tyagaraja's *evari mata* at 12:30 and Dikshitar's *sri varalakshmi* at 24:50 has no shape in which those moments can be recorded. The rasika can append a composition_id to `subjects.composition_ids[]` (per ADR-100), losing the timing entirely; or she can hand-edit; or she can give up.

This is the case ADR-097 alluded to but did not solve (Phase D mentioned `notes[]` rendering, not timestamped segments). It is the highest-value case for the *listening* mode of curation — where the rasika's attention is on the music, not on the JSON, and the loop must be light enough not to interrupt the listening.

### Forces

| Force | Direction |
|---|---|
| **Listening is the primary mode of curation** | A loop that requires looking away from the player to hand-author a JSON segment is a loop the rasika abandons. The interaction must be: pause → click → name → resume. Three or four clicks, no typing of timestamps. |
| **Timestamps must come from the player** | The active YouTube embed knows its current time. The Edit form must read it. Asking the rasika to type `"00:23:14"` is the friction this ADR exists to remove. |
| **Recordings and lecdems share a shape** | Both are time-indexed; both have segments; both segments name (raga, composition, tala, performers, note). Today the recording schema has `performances[]` and the lecdem schema has the un-timestamped `subjects` blob. The natural unification is: lecdems gain a `segments[]` array of the same shape as `performances[]`, and the un-timestamped `subjects` blob is a *derived view* (or remains for back-compat). |
| **Cascading creates (ADR-099)** | A segment naming a new raga or new composition triggers the inline `+ Add new …` cascade. The rasika spots a new raga at 17:22, types its name, the bundle gets a `create raga` item and a segment-append item that references it, ADR-099's two-pass ingest handles the order. |
| **Append-only at the segment level (ADR-085 §6)** | New segments are appended; existing segments are patchable per the ADR-100 matrix (timestamp, composition_id, raga_id, tala, notes); segments are not deleted in-loop. |
| **A segment is a recording-bucket item, not a musician-bucket item** | For *concert recordings*, the bundle bucket is `recordings`, not `musicians`. For *lecdems*, the bucket remains `musicians` (lecdem segments live inside the musician's `youtube[<vid>]` entry, where lecdems already live per ADR-077). The two surfaces share the segment *shape* but differ in their selector path. |
| **Timestamp normalisation is total** | `offset_seconds` is the source of truth (integer); `timestamp` is the human-readable derivative (`"HH:MM:SS"`). The Edit form fills both from the player; the writer recomputes one from the other on patch. Contributors never have to keep them in sync by hand. |
| **Render reads segments back** | The rendered recording panel and the rendered lecdem chip must surface segments — clickable to seek the embedded player to the offset. Without this, the loop does not close (ADR-085 §1). |

---

## Pattern

**Property 5 — *Alternating Repetition*.** A recording is a sequence of segments; each segment is a (time, raga, composition, tala) tuple. The rendered surface is the same alternation: header → segment chip → segment chip → header → … The Edit-while-listening loop is also alternation: pause → name → resume → pause → name → resume. Three layers of the same shape.

**Property 9 — *Deep Interlock and Ambiguity*.** A segment is the interlock between a *recording* (a timed event) and a *raga* (a timeless musical entity). The interlock is what makes the corpus queryable in both directions: "every recording that includes Kambhoji" and "every raga TM Krishna sang in 1965 at Poonamallee" become symmetrical queries over the same edge.

**ADR-077 is now completed.** ADR-077 made the lecdem first-class but left its body un-timestamped. This ADR closes that gap by giving the lecdem the same `segments[]` shape that recordings already have. The two surfaces converge — which is what ADR-085 §3 (read implies write) demands of any read surface that already implies time.

---

## Decision

### 1 — The segment shape (one shape, two homes)

```jsonc
{
  "segment_index":     1,                 // 1-based, contiguous within the array
  "timestamp":         "00:23:14",        // HH:MM:SS, derived from offset_seconds
  "offset_seconds":    1394,              // source of truth
  "duration_seconds":  null,              // optional; null until next-segment offset is known or end-of-recording
  "composition_id":    "evari_mata",      // optional
  "raga_id":           "kambhoji",        // optional
  "tala":              "rupakam",         // optional
  "composer_id":       "tyagaraja",       // optional
  "performer_ids":     ["tm_krishna"],    // optional; defaults to recording-level performers if absent
  "display_title":     "evari mātā",      // optional; auto-derived from composition if absent
  "kind":              "kriti"            // optional, free-text: "alapana", "kriti", "tani", "viruttam", "lecdem-illustration"
  "notes":             null               // optional, free-text
}
```

**At least one of** `composition_id`, `raga_id`, `kind`, `notes` must be present — a segment with only a timestamp is not informative enough to record. The writer enforces this minimum.

### 2 — Where segments live

**Concert recordings (`carnatic/data/recordings/<id>.json`)**: existing `sessions[].performances[]` *is* the segments array, renamed conceptually but not on disk. This ADR introduces no field rename; instead, the writer's verbs treat `sessions[<session_index>].performances[]` as the segment array, and the Edit form labels the operation "Add segment" while the bundle item names the path explicitly:

```jsonc
{ "op": "append",
  "bucket": "recordings",
  "id":     "poonamallee_1965",
  "array":  "sessions[1].performances",
  "value":  { /* segment shape per §1, with field name `performance_index` for `segment_index` */ } }
```

The on-disk field name remains `performance_index` for back-compat. The Edit form refers to it as "segment" in the UI.

**Lecdems (a `youtube[<vid>]` entry with `kind: "lecdem"`)**: this ADR adds a new optional field `segments[]` to the YouTube entry shape. Path:

```jsonc
{ "op": "append",
  "bucket": "musicians",
  "id":     "tm_krishna",
  "array":  "youtube[PdIy9531_fM].segments",
  "value":  { /* segment shape per §1 */ } }
```

The lecdem's existing `subjects.{raga,composition,musician}_ids[]` blob remains valid and continues to ingest. Going forward, the renderer derives the `subjects` blob from `segments[]` if present; falls back to the explicit `subjects` blob if `segments[]` is empty or absent. This means existing lecdem entries continue to render unchanged, and segment-authored lecdems get richer surfacing automatically.

### 3 — Patching an existing segment

Per ADR-100's nested-path pattern:

```jsonc
{ "op": "patch",
  "bucket": "recordings",
  "id":     "poonamallee_1965",
  "field":  "sessions[1].performances[3].raga_id",
  "value":  "todi" }

{ "op": "patch",
  "bucket": "musicians",
  "id":     "tm_krishna",
  "field":  "youtube[PdIy9531_fM].segments[5].composition_id",
  "value":  "evari_mata" }
```

The element selector for segments is the 1-based index because segments are *intrinsically* ordered by `offset_seconds` and have no other natural key. The writer enforces: index resolution happens against the *current* on-disk segment array (so a contributor who patches `segments[5]` while another contributor in a parallel session has just appended a new segment at offset 8 minutes — re-numbering the array — needs ADR-099's per-item error path to surface the mismatch. This is the one place the ADR-097 prohibition on index selectors had to bend; mitigation is below.)

**Mitigation for index drift**: the writer's `patch_segment` accepts an optional `at_offset_seconds` field on the patch item. If present, the writer cross-checks that `segments[index].offset_seconds == at_offset_seconds`; if not, the item errors with `segment at index <i> has offset <a>; patch expected offset <b>; bundle is stale, re-author from current state`. The Edit form fills this field automatically from the segment the contributor selected. Hand-authored bundles can omit it and accept the index-drift risk.

### 4 — The "Add segment" affordance: pause → click → name → stage

The Edit form gains a new entity-type row: **Recording segment** (which dispatches by sub-type to a recording's `performances[]` or a lecdem's `segments[]` based on what the contributor opened the form against).

**Trigger surfaces**:
1. From a rendered recording panel: a button "Add segment at current time" appears next to the embedded YouTube player. Clicking it reads the player's `getCurrentTime()`, opens the Edit form pre-filled with `offset_seconds` and `timestamp`, and focuses the raga combobox.
2. From a rendered lecdem chip's expanded view: same button, same flow, but the bundle item targets the lecdem's musician + vid path.
3. From the unified Edit form opened cold: entity-type dropdown gains "Recording segment"; on selection, a recording or lecdem picker appears, then (after pick) a "Use current time" button that reads the player if a player is currently active for that recording, else a manual `MM:SS` input.

**Pre-filled form**:
```
┌─ Add segment ─────────────────────────────────────────┐
│ Recording: Poonamallee 1965 (TM Krishna)              │
│ At time:   00:23:14    [↻ refresh from player]        │
│ Raga:      [combobox over graphData ▾]  + Add new     │
│ Composition: [combobox ▾]               + Add new     │
│ Tala:      [combobox: adi/rupakam/.. ▾]               │
│ Kind:      [alapana | kriti | tani | viruttam | …]    │
│ Performer(s): [auto: recording-level | override]      │
│ Notes:     [textarea]                                 │
│ [+ Stage segment → bundle]                            │
└────────────────────────────────────────────────────────┘
```

The "+ Add new raga" / "+ Add new composition" buttons open the inline create-form per ADR-099 §4. Cascade is automatic: the bundle ends up with a `create raga`, optionally a `create composition`, and the `append segments` item; ADR-099's two-pass ingest handles the order.

### 5 — The renderer surfaces segments back

A recording panel renders its segments as a vertical timeline:

```
00:00:00  • Jagadānanda Kāraka       (Nāṭa, ādi)        Tyāgarāja
00:18:42  • Sarasa Sāma Dāna         (Kāpinārāyaṇī, ādi) Tyāgarāja
00:34:10  • Telisi Rāma              (Pūrṇacandrikā, ādi) Tyāgarāja
00:52:55  • Tani āvartanam           ‹unspecified›
01:08:30  • Bhāgyada Lakṣmī          (Madhyamāvati)
```

Each row is clickable; clicking seeks the embedded player to `offset_seconds`. This makes the segments *navigable* from the panel — closing the read↔write loop ADR-085 §1 demands. A lecdem chip's expanded view does the same thing for `segments[]` (and falls back to the existing un-timestamped `subjects` chip-row if `segments[]` is empty).

The renderer is not in scope for this ADR's *acceptance* — but it is in scope for the loop's *closure*. A Coder follow-up implements §5 as soon as §1–§4 ship.

### 6 — Existing recordings already have `performances[]`; nothing migrates

Concert recordings already have richly populated `performances[]` arrays. This ADR does not migrate, rename, or re-shape anything on disk. It introduces:
- a new optional `segments[]` field on lecdem-shaped YouTube entries;
- new bundle-item paths (`sessions[<i>].performances` for recordings, `youtube[<vid>].segments` for lecdems);
- new Edit-form affordances per §4;
- a new entry to the ADR-100 patch matrix for `recordings.sessions[<i>].performances[<j>].*` and `musicians.youtube[<vid>].segments[<j>].*`.

Old data continues to ingest and render unchanged.

### 7 — Bucket assignment for the `recordings` bucket

The `recordings` bucket in the bundle (ADR-083 §1) currently holds `op: "create"` items only — full-recording creates. ADR-097 §3 marked it `patch: —` and `append: —`. This ADR re-opens both:
- `recordings.patch`: outer fields (per ADR-100 §1) and inner segment fields (per §3 above).
- `recordings.append`: `sessions[<i>].performances` (the segment append per §2) and the previously-deferred `sources` array (per ADR-100 deferral).

The ADR-097 §3 matrix is updated: the `recordings` row now reads `create ✓ | patch ✓ | append ✓ | annotate ✓`. ADR-100 §2's `recordings` row, previously "deferred to ADR-101", is hereby filled in.

---

## Consequences

### Positive

- **The listening-curation loop closes.** A rasika can listen, pause, name, resume — and the bundle accumulates her observations as she hears them. This is the use case the project was started for.
- **Lecdems become time-aware.** A lecdem on Kambhoji becomes a queryable index of *which compositions illustrate which moments of the demonstration* — turning a 90-minute video into a navigable artefact.
- **The recording schema and the lecdem schema converge.** Both expose `segments[]` semantics; the renderer can share the same component; queries like "every Kambhoji moment in the corpus, lecdem or concert" become uniform.
- **Cascading creates compound the value.** Spotting a new raga in a lecdem creates the raga node, the segment, and the cross-references in one bundle. The graph grows by listening.
- **Render-side seek-from-segment makes the panel itself a study tool**, not just a read-only artefact.

### Negative / accepted tradeoffs

- **Index-based selectors for segment patches re-introduce the drift risk** ADR-097 §3 warned against. Mitigated by the optional `at_offset_seconds` cross-check (§3) and by the rarity of concurrent-edit scenarios in single-rasika workflows. A future ADR may introduce stable segment ids if drift becomes a real problem.
- **Two homes for the same shape** (`performances[]` in recordings, `segments[]` in lecdem YouTube entries) is one redundancy more than ideal. Accepted because renaming `performances[]` would touch every recording file and break every existing query/render that knows the name. The mismatch is a UI-layer concern, not a data-layer one.
- **The "current time from player" affordance depends on the YouTube IFrame API** being already loaded on the panel. It is, per the existing player infrastructure, but the Edit form must defensively handle the case where no player is active (manual time input fallback).
- **Segment validation gets thicker.** The writer must accept the segment shape, validate referential integrity for `composition_id`/`raga_id`/`composer_id`/`performer_ids[]`, validate `offset_seconds` is non-negative and monotonically greater than the previous segment's, derive `timestamp` from `offset_seconds`. All standard, but a non-trivial code increment.

### Risks

- **A segment created at time T can have its T re-computed later** if the rasika wants to nudge it. This is a `patch segments[<i>].offset_seconds` operation; the writer must re-derive `timestamp` and re-validate monotonicity. Standard.
- **Segments authored by listening can drift from authoritative sources** (e.g. a published cue-sheet says 00:18:40, the rasika hears 00:18:42). Acceptable: the bundle's `at_offset_seconds` cross-check is for staleness, not for canonicality. The corpus can absorb 2-second disagreements.
- **The existing `subjects` blob on lecdems becomes a derivable view** that may eventually deprecate. This ADR does not deprecate it; the renderer derives-or-falls-back. A future ADR may formalise the migration.

---

## Implementation

### Phase A — Lecdem `segments[]` schema + writer verbs

Carnatic Coder, in `carnatic/writer.py`:

1. Add `add_lecdem_segment(musician_id, vid, segment_dict)` — appends to `youtube[<vid>].segments[]`, creating the array if absent.
2. Add `patch_lecdem_segment(musician_id, vid, segment_index, field, value, at_offset_seconds=None)` — with the staleness cross-check.
3. Validate: `vid` exists on musician; entry has `kind == "lecdem"`; segment has at least one of (composition_id, raga_id, kind, notes); referential integrity for ids; offset is non-negative integer.
4. Mirror in `bani_add.py`: `op == "append"` with `array == "youtube[<vid>].segments"` dispatches here.

### Phase B — Recording `performances[]` patch verbs

5. Add `patch_recording_performance(recording_id, session_index, performance_index, field, value, at_offset_seconds=None)`.
6. Add `add_recording_performance(recording_id, session_index, performance_dict)`.
7. Mirror in `bani_add.py`: `op == "append"` with `array == "sessions[<i>].performances"` and `op == "patch"` with `field == "sessions[<i>].performances[<j>].*"`.

### Phase C — Edit form: "Add segment at current time"

Carnatic Coder, in `carnatic/render/templates/entry_forms.js` and `media_player.js`:

8. Expose a `getCurrentPlayerTime(vid_or_recording_id) → number | null` function from the player module.
9. Add `buildSegmentForm(target)` per §4's wireframe. `target` is `{ kind: "recording" | "lecdem", id, vid? }`.
10. Wire the "Add segment at current time" button on the recording panel and the expanded lecdem chip.
11. Add the "Recording segment" entity-type to the unified Edit form's dropdown.

### Phase D — Renderer: segments as a clickable timeline

12. In the recording panel renderer (`bani_flow.js` or wherever the recording panel is built), render `sessions[].performances[]` as a clickable timeline; clicks call `player.seekTo(offset_seconds)`.
13. In the lecdem chip's expanded view, render `segments[]` as the same timeline component; fall back to the existing `subjects` chip-row when `segments[]` is empty.

### Verification

- **Phase A**: a hand-authored bundle with one `append youtube[<vid>].segments` ingests; the lecdem JSON gains a `segments[]` array with the new entry; render shows the new segment row.
- **Phase B**: a `patch sessions[1].performances[3].raga_id` bundle ingests cleanly; the recording's panel shows the corrected raga.
- **Phase C**: open the recording panel, play to 00:23:14, click "Add segment", select a raga and composition, stage and download bundle, ingest, render — the new segment appears in the timeline at the correct offset.
- **Phase D**: clicking a segment row in the rendered panel seeks the embedded player to the segment's `offset_seconds`.

The end-to-end test is the listening loop: open a recording, hear a transition, click, name, resume, listen, click, name, resume, download bundle, run `bani-add`, run `bani-render`, reload the panel, see the segments. The latency from *hearing* to *rendered-back* is one bundle round-trip.

This ADR is what makes Bani Flow a *listening tool* and not just a reading tool. The loop ADR-085 §1 promised — *the rasika builds the corpus by engaging with it* — is closed at the level where the music actually plays.
