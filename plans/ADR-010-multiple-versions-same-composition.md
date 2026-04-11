# ADR-010: Multiple Versions of the Same Composition

**Status:** Proposed  
**Date:** 2026-04-11

---

## Context

### The immediate error

Madurai Mani Iyer's performance of *maakElaraa vicāramu* (Ravichandrika, Deshadi) exists in two
places simultaneously:

1. **[`musicians.json`](../carnatic/data/musicians.json:120)** — `youtube[0]` on the
   `madurai_mani_iyer` node:
   ```json
   {
     "url": "https://youtu.be/3h_ltCBmNbs",
     "label": "maakElaraa vicāramu · Ravichandrika · Deshadi - Madurai Mani Iyer",
     "composition_id": "maakelara_vicaaramu",
     "raga_id": "ravichandrika"
   }
   ```

2. **[`jamshedpur_1961_madurai_mani_iyer.json`](../carnatic/data/recordings/jamshedpur_1961_madurai_mani_iyer.json:94)** — `performance_index: 5` in the structured concert:
   ```json
   {
     "composition_id": "maakelara_vicaaramu",
     "raga_id": "ravichandrika",
     "tala": "deshadi",
     "display_title": "Makelara Vicharamu"
   }
   ```

These are **two different recordings** of the same composition by the same musician — one a
standalone YouTube clip, one a timestamped performance within the Jamshedpur 1961 concert. The
current schema has no mechanism to distinguish them; the `composition_id` key is the same in both,
so any lookup by `composition_id` will return both, but the two entries live in different data
structures with no cross-reference.

### The general problem

As the graph grows, every significant composition will accumulate multiple recordings:
- The same musician at different stages of their career (TM Krishna's two Gitarthamu entries
  already demonstrate this: `youtube[1]` labelled "younger" and `youtube[2]` labelled "older")
- The same musician in different contexts: concert, AIR session, lecture-demonstration, informal
  sitting
- Different musicians in the same lineage performing the same composition (the Bani Flow trail
  depends on exactly this)

The current schema handles this silently — multiple entries with the same `composition_id` are
simply listed in order. But there is no field that says *why* there are multiple versions, *which
context* each belongs to, or *how they relate* to each other. The rasika following the Bani Flow
trail cannot tell whether they are hearing the same musician twice or two different musicians.

### The forces in tension

| Force | Pull |
|---|---|
| **Immersion** | The rasika must be able to follow a composition across musicians and contexts without confusion. Multiple versions of the same piece are a *feature*, not a bug — they reveal how a composition lives differently in different hands. |
| **Fidelity to the oral tradition** | A concert performance, an AIR session, a lecture-demonstration, and a classroom teaching are all legitimate transmission contexts. The schema must not privilege the concert stage. |
| **Scalability without fragmentation** | The [`unified_recordings_architecture.md`](unified_recordings_architecture.md) plan already proposes moving all recordings out of `musicians.json` into `recordings/`. This ADR must not contradict that direction. |
| **Queryability** | "Show me all recordings of *maakElaraa vicāramu*" must return a clean, ordered list. "Show me Madurai Mani Iyer's two versions" must also work. |
| **Simplicity of the data model** | Adding a `version` or `context` field to every recording entry is low-cost. Adding a new top-level object type (e.g. a `version_group`) is high-cost and should be avoided unless the simpler approach fails. |

---

## Pattern

**Levels of Scale** (Alexander, *A Pattern Language*, Pattern 26) — living structure requires
differentiation at every level. A composition is a centre. A performance of that composition is a
smaller centre nested within it. A version label is the boundary that makes each performance
legible as a distinct centre rather than a duplicate.

The pattern resolution: **add a `version` field to the performance object** (in structured
recordings) and to the `youtube` entry (in `musicians.json`, until the unified migration is
complete). The `version` field is free text, terse, and human-readable. It does not need to be
an enum — the tradition is too varied for a closed vocabulary. It is optional; its absence means
"the only known version" or "version not distinguished."

---

## Decision

### Option A — `version` field on the performance/youtube entry (recommended)

Add an optional `version` field to:

1. The **performance object** in `recordings/*.json`
2. The **youtube entry** in `musicians.json` (legacy, until unified migration)

**Before (current state — two entries, no disambiguation):**

```json
// musicians.json — youtube entry
{
  "url": "https://youtu.be/3h_ltCBmNbs",
  "label": "maakElaraa vicāramu · Ravichandrika · Deshadi - Madurai Mani Iyer",
  "composition_id": "maakelara_vicaaramu",
  "raga_id": "ravichandrika"
}

// jamshedpur_1961_madurai_mani_iyer.json — performance object
{
  "performance_index": 5,
  "timestamp": "00:33:34",
  "offset_seconds": 2014,
  "composition_id": "maakelara_vicaaramu",
  "raga_id": "ravichandrika",
  "tala": "deshadi",
  "composer_id": "tyagaraja",
  "display_title": "Makelara Vicharamu",
  "notes": null
}
```

**After (with `version` field):**

```json
// musicians.json — youtube entry (standalone clip)
{
  "url": "https://youtu.be/3h_ltCBmNbs",
  "label": "maakElaraa vicāramu · Ravichandrika · Deshadi - Madurai Mani Iyer",
  "composition_id": "maakelara_vicaaramu",
  "raga_id": "ravichandrika",
  "version": "standalone clip"
}

// jamshedpur_1961_madurai_mani_iyer.json — performance object (concert)
{
  "performance_index": 5,
  "timestamp": "00:33:34",
  "offset_seconds": 2014,
  "composition_id": "maakelara_vicaaramu",
  "raga_id": "ravichandrika",
  "tala": "deshadi",
  "composer_id": "tyagaraja",
  "display_title": "Makelara Vicharamu",
  "notes": null,
  "version": "Jamshedpur 1961"
}
```

**Vocabulary guidance (not an enum — examples only):**

| Context | Example `version` value |
|---|---|
| Named concert | `"Music Academy 1966"`, `"Jamshedpur 1961"` |
| AIR session | `"AIR Madras, 1960s"` |
| Standalone clip (source unknown) | `"standalone clip"` |
| Lecture-demonstration | `"lecture-demo, Wesleyan 1967"` |
| Classroom / teaching | `"classroom teaching"` |
| Career stage | `"younger"`, `"older"` (as already used in TM Krishna's Gitarthamu entries) |
| Informal sitting | `"informal, private recording"` |

The `version` field is **not** a replacement for `notes`. `notes` carries musicological
commentary (e.g. "neraval on 'kalinil silambu' is one of the celebrated moments"). `version`
carries only the context identifier needed to distinguish this recording from others of the same
composition.

### Option B — One recording file per YouTube link (the "recording-style file" approach)

The user raised this option: every YouTube link produces a `recordings/*.json` file. This is
exactly what [`unified_recordings_architecture.md`](unified_recordings_architecture.md) proposes
as Phase 2 of the migration.

**Assessment:** This is the *correct long-term architecture*, but it is a migration task, not a
schema fix. It does not resolve the immediate disambiguation problem — even after migration, two
recording files for the same composition by the same musician still need a `version` field to be
distinguishable in the UI. Option B and Option A are **not mutually exclusive**; Option A is the
minimal fix needed now, Option B is the structural migration that should follow.

**File count concern:** The user noted "every youtube link would produce a file — this isn't all
that bad per se." Agreed. At the current scale (~40 youtube entries across all musicians), this
produces ~40 small files. The `recordings/` directory already has 6 files; 46 is not a burden.
The naming convention in `unified_recordings_architecture.md` handles collisions:
`{musician_id}_{composition_id}_{disambiguator}.json`.

### Option C — `version_group` object (rejected)

A new top-level object in `compositions.json` that groups all recordings of a composition. This
is over-engineering at the current scale. The lookup tables built by
[`render.py`](../carnatic/render.py) already group by `composition_id` — that is the version
group. No new object type is needed.

---

## Consequences

### What this enables

- **Bani Flow trail** can display version labels alongside each recording, so the rasika knows
  whether they are hearing the same musician in a concert vs. a standalone clip.
- **Multiple versions by the same musician** are now first-class: TM Krishna's two Gitarthamu
  entries (`"younger"` / `"older"`) already use this pattern informally in the `label` field;
  `version` makes it explicit and queryable.
- **Cross-context comparison** becomes possible: "Show me all concert versions of
  *maakElaraa vicāramu*" vs. "Show me all standalone clips."
- **The unified migration** (Option B) is unblocked: when `musicians.json` youtube entries are
  migrated to `recordings/` files, the `version` field migrates with them.

### What this forecloses

- Nothing is foreclosed. The `version` field is optional and additive. Existing entries without
  it remain valid.

### Queries that become possible

| Query | How |
|---|---|
| All recordings of *maakElaraa vicāramu* | `composition_to_performances["maakelara_vicaaramu"]` — already works; `version` enriches the display |
| Madurai Mani Iyer's two versions of *maakElaraa vicāramu* | Filter `musician_to_performances["madurai_mani_iyer"]` by `composition_id == "maakelara_vicaaramu"` |
| All concert versions of a composition | Filter by `version` containing a year or venue name |
| All standalone clips | Filter by `version == "standalone clip"` |

### Schema change summary

**[`carnatic/data/recordings/READYOU.md`](../carnatic/data/recordings/READYOU.md) — Performance object table:**

Add one row:

| `version` | string \| null | Optional. Distinguishes this recording from other versions of the same composition. Free text: `"Jamshedpur 1961"`, `"standalone clip"`, `"AIR Madras 1960s"`, `"younger"`. Omit if only one version exists. |

**[`carnatic/data/READYOU.md`](../carnatic/data/READYOU.md) — YouTube recording object table:**

Add one row:

| `version` | string \| null | Optional. Same vocabulary as the performance object `version` field. |

---

## Implementation

### Immediate (Librarian)

1. Add `"version": "standalone clip"` to the `madurai_mani_iyer` youtube entry in
   [`musicians.json`](../carnatic/data/musicians.json:120).
2. Add `"version": "Jamshedpur 1961"` to `performance_index: 5` in
   [`jamshedpur_1961_madurai_mani_iyer.json`](../carnatic/data/recordings/jamshedpur_1961_madurai_mani_iyer.json:94).
3. Retroactively add `version` to TM Krishna's two Gitarthamu entries (already labelled
   "younger" / "older" in the `label` field — extract to `version`).

### Schema documentation (Librarian)

4. Add `version` field to the performance object table in
   [`carnatic/data/recordings/READYOU.md`](../carnatic/data/recordings/READYOU.md).
5. Add `version` field to the youtube entry table in
   [`carnatic/data/READYOU.md`](../carnatic/data/READYOU.md).

### Render pipeline (Carnatic Coder — deferred)

6. When the Bani Flow trail displays multiple recordings of the same composition by the same
   musician, show the `version` label as a subtitle beneath the track label. This is a UI
   enhancement; the data change is sufficient for correctness without it.

### Unified migration (Carnatic Coder — deferred, see `unified_recordings_architecture.md`)

7. When `musicians.json` youtube entries are migrated to `recordings/` files, the `version`
   field migrates as a top-level field on the recording object (not on the performance object,
   since a single-performance recording file *is* the version).

---

## Relationship to `unified_recordings_architecture.md`

This ADR is **complementary**, not competing. The unified architecture plan proposes moving all
youtube entries out of `musicians.json` into `recordings/` files. That migration is Phase 2 of a
larger plan and requires a migration script. This ADR fixes the immediate disambiguation problem
with a one-field addition that costs nothing and survives the migration intact.

The correct sequencing is:

1. **Now:** Add `version` field (this ADR) — fixes the Madurai Mani Iyer error immediately.
2. **Later:** Execute the unified migration — moves youtube entries to `recordings/` files,
   carrying `version` with them.
3. **After migration:** The `version` field on the recording file's top-level object (or on the
   single performance within it) serves the same disambiguation purpose.

The `version` field is the **stable identifier** that survives both the current schema and the
post-migration schema.
