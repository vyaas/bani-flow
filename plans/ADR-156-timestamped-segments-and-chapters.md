# ADR-156: Timestamped Segments and Chapter Markers (with Subjects)

**Status**: Accepted (revised 2026-06-10 — see Revision)
**Date**: 2026-06-09 (proposed); 2026-06-10 (accepted); 2026-06-10 (revised)
**Agents**: code-auditor (AUDIT-014) → graph-architect → carnatic-coder
**Depends on**: ADR-154 (MediaRef), ADR-155 (control inversion — seekable timeline). **Related**: ADR-077/078 (lecdem kinds + segment indexes), ADR-018/026 (concert brackets, track selector).

---

## Revision (2026-06-10) — descope the structural rename; deliver additively

Implementation review against the *actual* schema and writer changed the plan. The
original Decision §1/§4 proposed renaming recordings' `performances[]` → `segments[]`
and `offset_seconds` → `start`. That is **descoped**, because:

- **It is a rename of established structure, not an additive migration.** Renaming a
  stored key across all 53 `recordings/*.json` files plus every reader
  (`data_transforms`, the player, tests) and the writer internals is high-risk and
  conflicts with the project's "never rename established identifiers/structure"
  principle. The original text mislabelled it "additive".
- **The unification already exists where it matters.** The writer already presents a
  single segment facade over both lecdem `youtube[].segments[]` and recording
  `sessions[].performances[]` (`_validate_segment_dict`, `PATCHABLE_SEGMENT_FIELDS`,
  ADR-101/143), and the two shapes are already aligned (`offset_seconds`,
  `composition_id`, `raga_id`, `tala`, `display_title`, `composer_id`).
- **The span end already has a field.** `duration_seconds` is an existing patchable
  segment field; `end = offset_seconds + duration_seconds`. No new `end` field.

**What ships instead (additive — no rename, no data migration):**

1. A new optional free-text **`subject`** field on a segment / performance — the
   per-chapter topic ("Gamaka in Kalyani"). Existing files simply omit it.
2. `kind` becomes valid on recording performances too (parity with lecdem segments;
   optional, defaults to "performance").
3. `offset_seconds` remains the segment start; `duration_seconds` remains the span.

**`subject` (singular) vs `subjects` (plural) — keep them distinct.** The entry-level
`youtube[].subjects` is the ADR-078 *aggregate* index `{raga_ids, composition_ids,
musician_ids}` for a whole lecdem. The new `subject` is a *per-segment* free-text topic
string. Different field, different level, different type. The writer validates the
aggregate `subjects` strictly (ids must resolve); `subject` is free text (type-checked
only).

The sections below are retained for historical context; where they say "rename
`performances[]` to `segments[]`" read "add `subject` to the existing
performance/segment object". Markers/active-segment (Decision §3) shipped in M1/M2a.

---

## Context (forces in tension)

Once the player is controllable (ADR-155), the playhead becomes addressable: we can seek to any second and draw markers on a timeline we own. The roadmap names two structured-time ambitions:

1. **Timestamped recordings** — concert tracks already carry `performances[].timestamp` / `offset_seconds` (recordings schema), but today the UI can only *reload* to them (AUDIT-014 F-06), not seek, and cannot render them as on-timeline markers.
2. **Lecdem chapters with subjects** — a lecture-demonstration is a sequence of *topics* ("what is gamaka", "vivadi melas", a sung illustration of Kalyani). ADR-077 gives lecdems a `kind`; ADR-078 indexes their segments by raga/composition. But there is **no field for a chapter's subject/topic** and no notion of a chapter as a navigable, labelled span of time.

Forces:
- **Two kinds of time-anchored data already exist** (concert performances vs lecdem segments) with *different shapes*. Inventing a third parallel structure would fragment the model further.
- **Immersion**: a listener exploring a 90-minute lecdem should see its intellectual structure — chapter titles with subjects — as seekable markers, the way a listener of a concert sees its tracks.
- **Curation cost**: subjects must be cheap to author and must reuse existing vocabulary (ragas, compositions, free-text topic) rather than a new closed taxonomy.
- **Derivation, not duplication**: a chapter's *position* is data; its raga/composition *links* should reuse existing id references, not re-state titles.

## Pattern

**Levels of Scale.** A media item decomposes into *segments*; a segment is a labelled span `[start, end)` with a subject. Concert tracks and lecdem chapters are the *same centre at two scales of formality* — unify them under one `segments[]` model with a `kind` discriminator rather than maintaining parallel structures.

## Decision

### 1. Unify time-anchored data under a `segments[]` model

Introduce a single segment shape, used both by concert recordings (where it already half-exists as `performances[]`) and by lecdem entries (where chapters are new). The segment is the seekable unit.

```jsonc
// a segment within a recording session OR a youtube[] lecdem entry
{
  "start": 0,                 // seconds — replaces/aligns with offset_seconds
  "end":   412,               // seconds — optional; defaults to next segment.start
  "kind":  "performance",     // performance | chapter | topic | tani | announcement
  "subject": "Gamaka in Kalyani",   // NEW — free-text topic; the lecdem "subject"
  "display_title": "Kalyani — alapana",
  "raga_id":        "kalyani",       // reuse existing id refs (nullable)
  "composition_id": null,
  "composer_id":    null,
  "tala":           null,
  "notes":          null
}
```

**Migration of existing data is additive and mechanical**: `performances[].timestamp/offset_seconds` map to `segments[].start`; `performance_index` ordering is preserved; `kind` defaults to `performance`; `subject` is null for existing concert tracks. The Librarian backfills `subject` only for lecdems, over time. No id renames (per Librarian hard rule).

### 2. `subject` is the lecdem's first-class topic field

`subject` is free text (a topic phrase). It is intentionally *not* a closed enum — lecdem topics are open-world ("history of the Tanjore quartet", "difference between Begada and Sahana"). Where a topic *is* a raga or composition, the curator also sets `raga_id` / `composition_id` so the chapter participates in graph navigation; `subject` carries the human framing.

### 3. Markers on the controlled timeline

With ADR-155's Plyr handle, render each segment as a marker on the progress bar. Clicking a marker (or a chapter-list row) calls `player.currentTime = segment.start` — a true seek, not a reload (replacing `media_player.js:367-379`). The currently-playing segment is derived live from `timeupdate` vs each `[start, end)` span, so the footer chips (ADR-066) and active-track highlight update automatically as playback crosses boundaries — something impossible under the old reload model.

### 4. Schema before / after

**Before** — concert track (recordings `performances[]`):
```jsonc
{ "performance_index": 1, "timestamp": "00:00:00", "offset_seconds": 0,
  "composition_id": "jagadananda_karaka", "raga_id": "nata", "display_title": "…" }
```
**After** — same data as a segment, plus the new capability for lecdems:
```jsonc
{ "start": 0, "kind": "performance", "subject": null,
  "composition_id": "jagadananda_karaka", "raga_id": "nata", "display_title": "…" }
// and now, newly expressible:
{ "start": 730, "end": 1180, "kind": "chapter",
  "subject": "Vivadi melas — theory and illustration", "raga_id": "varali",
  "display_title": "Vivadi II" }
```

## Consequences

**Positive**
- One model for all time-anchored data; concert tracks and lecdem chapters stop being separate code paths (simplifies the player track-list builder).
- Lecdems gain navigable intellectual structure; the subject field makes the ADR-078 segment indexes richer (topics become searchable, not just raga/composition tags).
- Live segment-tracking fixes the stale-footer problem inherent to reload-seek.

**Negative / costs**
- A data migration of `performances[]` → `segments[]` across all recording files (mechanical, scripted by the Coder, executed as data by the Librarian — never hand-edited).
- `end` is optional and inferred; overlapping or out-of-order segments need validation in `writer.py`.
- Touches the recordings schema doc (`recordings/READYOU.md`) and the lecdem ingest path — coordinate with ADR-077/078 owners.

## Implementation (after ADR-155 landed)

1. **Architect→Coder**: write a migration transform (`performances[] → segments[]`) and a validation rule (sorted, non-overlapping, `start < end`).
2. **Librarian**: run the migration as a data operation; backfill `subject` for existing lecdems where known.
3. **Coder**: render markers on the Plyr timeline; replace track-click reload with `currentTime` seek; derive active segment from `timeupdate`; update `recordings/READYOU.md`.
4. **Test Engineer**: segment-ordering validation; active-segment derivation across boundaries; lecdem chapter rendering with subjects.

**Branch**: `adr/156-timestamped-segments-and-chapters` → PR (schema change — recordings shape).

---
[ADR: ADR-156, ADR-155, ADR-154]
[AGENTS: code-auditor, graph-architect]
