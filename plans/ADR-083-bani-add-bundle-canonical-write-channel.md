# ADR-083: The `bani_add` Bundle as the Canonical Browser→Disk Write Channel

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder → librarian
**Depends on**: ADR-031 (data entry forms), ADR-070 (youtube performers), ADR-077 (lecdem schema), ADR-082 (lecdem entry CLI + forms)
**Companion ADRs**: ADR-084 (lecdem-aware bundle ingestion), ADR-085 (self-replicating curation loop)

---

## Context

The browser-side entry forms (ADR-031) have grown from per-entity downloads (one form ⇒ one file) into a **session bundle**: every form pushes its output into a shared `baniBundle` object, and a single `Download Bundle` button emits `bani_add_bundle.json`. The CLI ingester `carnatic/bani_add.py` consumes that file and dispatches each item to the appropriate `writer.*` verb, which writes the per-entity JSON files atomically. After that, `bani-render` rebuilds `graph.html` from the updated data.

This bundle is now the **only** path by which a rasika using the browser can contribute data without leaving immersion. It is also the path by which discovery sessions (ingesting a YouTube playlist, annotating a lecdem, capturing a concert bracket) accumulate work and commit it in one atomic step. As such, it is no longer a convenience — it is a **schema contract**, and it deserves the same status as the on-disk entity files.

Today the contract is implicit. `bani_add.py`'s docstring (lines 9–28) lists item types and rough field shapes; `entry_forms.js`'s comment block (lines 5–9) mentions the bundle in passing; ADR-031 predates the bundle by an iteration and never names it. Three classes of bug follow from the implicit contract:

1. **Browser emits items the ingester silently drops.** A future form could `addToBundle('lecdems', …)` (a key not in the ingester's whitelist) and the user would see "Bundle (1 item)" download successfully and a `bani-add` run report `Added 0`, with no error.
2. **Ingester accepts items the writer does not understand.** Today's lecdem entry (ADR-077) carries `kind: "lecdem"` and `subjects: {…}` on a `youtube[]` member. The bundle delivers it. `bani_add._process_musicians` calls `writer.add_youtube(…)` without forwarding either field. The lecdem disappears between bundle and disk. (This is the concrete blocker for ADR-077 / ADR-082; ADR-084 fixes it under this contract.)
3. **Schema drift between surfaces.** Three places encode the bundle shape: `entry_forms.js` (writes), `bani_add.py` (reads), the `WriteResult`-returning verbs in `writer.py` (validates). When any one drifts, the others silently disagree. The fix is not more code; it is naming a single source of truth.

### Forces

| Force | Direction |
|---|---|
| **One write contract, two surfaces** | The browser and the CLI are equal authors. Both must produce the same bundle shape; both must round-trip cleanly through `bani_add.py`. Neither may be a privileged path. |
| **Additive schema only** | Adding a new item type or a new field to an existing item must not break older bundles. Older bundles must still validate and ingest. New fields default to absent. |
| **Whitelisted item types** | The ingester rejects unknown top-level keys in `items`. Silent drop is forbidden — the user must be told "your bundle contains an item type the installed `bani-add` does not know about". |
| **Per-item processing isolation** | A failure on one item must not poison other items. The ingester reports `Added / Skipped / Errors` per item; a single bad recording does not roll back five good musicians. |
| **Schema versioning** | `schema_version` (currently `1`) gates ingestion. A bundle with `schema_version: 2` against a `bani_add.py` that knows only v1 must refuse with a clear message, not attempt partial ingestion. |
| **Lecdem first-class in the bundle** | ADR-077's `kind` + `subjects` fields flow through `youtube_append` and `new` musician items without special-casing. The bundle item shape is the same as the on-disk `youtube[]` shape minus the constraint that arrays be authored — the bundle is a list of *one* such entry per record. |
| **Governs all future write surfaces** | Any future write surface (a CLI playlist importer, a mobile share-target shim, a watchdog that ingests `~/Downloads/*.json`) must produce a bundle. No surface gets to write directly to the entity files. |

---

## Pattern

**Boundaries** (Alexander, *The Nature of Order*, Book 1, Property 7). The bundle is the boundary between two regions of the system: *authored intent* (what the rasika or librarian is trying to add) and *stored state* (the per-entity JSON files). A boundary is what makes both sides legible. Without it, every author talks directly to every storage file and the system has no skin.

**Strong Centres** (Property 1). Each item type (`ragas`, `composers`, `musicians`, `compositions`, `recordings`, `edges`) is a strong centre — a self-contained unit with its own validation rules, its own dispatch path, its own `WriteResult`. The bundle is the weaker outer centre that holds them.

**Levels of Scale** (Property 2). The bundle has three nested scales: the envelope (`schema_version`, `generated_at`, `items`), the item-type buckets (`items.musicians`, `items.recordings`, …), and the per-item objects. Each scale has exactly one responsibility. Future work (e.g., a `provenance` envelope field or a per-item `origin` field) must sit at the right scale or break the pattern.

---

## Decision

### 1 — The bundle envelope (canonical)

Every bundle MUST be a JSON object with exactly these top-level keys:

```jsonc
{
  "schema_version": 1,                   // integer; gates ingester compat
  "generated_at":   "<ISO-8601 UTC>",   // string; informational only
  "items": {                             // dispatch map; keys are whitelisted
    "ragas":        [ /* RagaItem        */ ],
    "composers":    [ /* ComposerItem    */ ],
    "musicians":    [ /* MusicianItem    */ ],
    "compositions": [ /* CompositionItem */ ],
    "recordings":   [ /* RecordingItem   */ ],
    "edges":        [ /* EdgeItem        */ ]
  }
}
```

Rules:

- **Whitelist enforced.** `items` MAY omit any of the six bucket keys (treated as empty). `items` MUST NOT contain any other top-level key. Unknown keys are an ingester-level error: `ERROR: bundle contains unknown item type 'X'. Known types: ragas, composers, musicians, compositions, recordings, edges.`
- **Order of processing is fixed.** Ragas → composers → musicians → compositions → recordings → edges. Rationale: later items reference ids established by earlier ones (a composition's `raga_id`, a recording's `performances[].musician_id`). The fixed order is part of the contract — the ingester does not topologically sort.
- **Per-item failure isolation.** Any single item that fails its writer's validation produces an error line in the report; processing continues with the next item. The ingester exits non-zero if and only if the cumulative error count > 0.

### 2 — Item shapes (authoritative reference)

The shape of each per-item object is **the same as the corresponding writer verb's keyword arguments**, plus a small, named envelope where needed. The writer is the source of truth for fields; the bundle MUST NOT introduce fields the writer does not consume.

#### 2a — `RagaItem`, `ComposerItem`, `CompositionItem`, `EdgeItem`

These already have stable shapes consumed by `_process_ragas`, `_process_composers`, `_process_compositions`, `_process_edges`. This ADR does not redefine them; it ratifies them. See `bani_add.py` (current implementation) and `writer.py` for the field list. Future field additions follow the additive-only rule (§3).

#### 2b — `RecordingItem`

A recording is written as-is to `data/recordings/{id}.json` after the validator confirms `id` is present. Its full shape is governed by `carnatic/data/recordings/READYOU.md` (concert sessions, performers, performances). The bundle layer adds no fields and removes none.

#### 2c — `MusicianItem` — two variants discriminated by `type`

```jsonc
// Variant A — "new"  (creates a musician node and optionally seeds its youtube[])
{
  "type":       "new",
  "id":         "akkarai_subbulakshmi",
  "label":      "Akkarai Subbulakshmi",
  "era":        "contemporary",
  "instrument": "violin",
  "born":       1988,
  "died":       null,
  "bani":       "Akkarai bani",
  "sources":    [ { "url": "https://en.wikipedia.org/wiki/Akkarai_Subbulakshmi",
                    "label": "Wikipedia", "type": "wikipedia" } ],
  "youtube":    [ /* YoutubeEntryItem, see §2d */ ]
}

// Variant B — "youtube_append"  (appends one or more youtube[] entries)
{
  "type":         "youtube_append",
  "musician_id":  "tm_krishna",
  "youtube":      [ /* YoutubeEntryItem, see §2d */ ]
}
```

The discriminator `type` is required. `type ∉ { "new", "youtube_append" }` is an ingester error. (Future variants — e.g. `"node_patch"` for editing an existing node's metadata — would extend this enum and bump `schema_version`.)

#### 2d — `YoutubeEntryItem` (the lecdem-aware shape)

A `YoutubeEntryItem` is **byte-equivalent to one element of an on-disk `node.youtube[]` array**. The bundle does not transform it; it carries it. This is the unification point this ADR makes explicit:

```jsonc
// Recital track (today's shape; no change)
{
  "url":            "https://youtu.be/abcd1234",
  "label":          "Endaro Mahanubhavulu · Sri · Adi - TM Krishna",
  "composition_id": "endaro_mahanubhavulu",
  "raga_id":        "sri",
  "year":           2018,
  "version":        "live",
  "tala":           "adi",
  "performers":     [ /* ADR-070 PerformerItem */ ]
}

// Lecdem entry (ADR-077 schema)
{
  "url":      "https://youtu.be/lecdem8888",
  "label":    "Lec-dem: commonality of Surutti, Kedaragowla, Narayana Gowla — TM Krishna",
  "kind":     "lecdem",
  "subjects": {
    "raga_ids":        ["surutti", "kedaragowla", "narayana_gowla"],
    "composition_ids": [],
    "musician_ids":    []
  },
  "year":     2018,
  "performers": [ /* optional, ADR-070 */ ]
}
```

**Constraint**: the ingester MUST forward every key it sees on a `YoutubeEntryItem` to `writer.add_youtube`. The writer is the validation choke point (ADR-016). The ingester is a transport, not a translator. This eliminates the silent-drop class of bugs by construction: if the writer accepts a field, the bundle delivers it; if the writer rejects a field, the user sees the rejection in the per-item error line.

(ADR-084 specifies the writer-side change that lets `kind` and `subjects` flow through.)

### 3 — Schema versioning rules

- `schema_version` is an integer. Today: `1`.
- An ingester at version `N` MUST refuse a bundle with `schema_version > N` immediately (no items processed). Error message: `ERROR: bundle is schema_version X, but this bani-add supports up to schema_version N. Upgrade carnatic/ to ingest.`
- An ingester at version `N` MUST accept a bundle with `schema_version < N` by applying any defined migrations in order. The migration set is empty today (only one version exists).
- Bumping `schema_version` is an ADR-level decision. Adding optional fields to existing item shapes does **not** require a bump — that is the additive-only rule. A bump is required for: removing a field, renaming a field, changing a field's type, adding a new item-type bucket, or changing the processing order.

### 4 — Front-end ⇄ ingester naming parity

The browser's `baniBundle` object (in `entry_forms.js`) MUST use the same six bucket keys as the ingester whitelist, and MUST emit `schema_version: 1`, `generated_at: <ISO>`, `items: baniBundle` exactly. There is no per-surface translation layer.

The form layer's `addToBundle(type, obj)` helper is constrained to the same whitelist as the ingester. A `addToBundle('lecdems', …)` call (a hypothetical bug) MUST fail loudly in the browser console — not silently no-op as the current implementation does. (Mechanism: throw on unknown `type`. The resulting fix is a small one-line change in `entry_forms.js`, captured in §6.)

### 5 — Lecdem flow through the bundle (worked example)

A rasika opens the entry form, enters a TM Krishna lecdem on three ragas, and clicks `Add to Bundle` then `Download Bundle`. The bundle delivered:

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-04-22T18:30:00Z",
  "items": {
    "ragas": [], "composers": [], "compositions": [], "recordings": [], "edges": [],
    "musicians": [
      {
        "type": "youtube_append",
        "musician_id": "tm_krishna",
        "youtube": [
          {
            "url": "https://youtu.be/lecdem8888",
            "label": "Lec-dem: commonality of Surutti, Kedaragowla, Narayana Gowla — TM Krishna",
            "kind": "lecdem",
            "subjects": {
              "raga_ids": ["surutti", "kedaragowla", "narayana_gowla"],
              "composition_ids": [],
              "musician_ids": []
            },
            "year": 2018
          }
        ]
      }
    ]
  }
}
```

`bani-add bundle.json` then:

1. Reads the file, validates `schema_version == 1`, validates `items` keys are whitelisted.
2. Walks `items.musicians`. For the `youtube_append` item, calls `writer.add_youtube(musicians_path, musician_id="tm_krishna", url=…, label=…, kind="lecdem", subjects={…}, year=2018)`.
3. The writer (per ADR-084) validates: every subject id resolves; `kind == "lecdem"` is in `YOUTUBE_KINDS`; `composition_id`/`raga_id` are absent. Writes the entry into `musicians/tm_krishna.json`'s `youtube[]` atomically.
4. Reports `[YT+] tm_krishna ← https://youtu.be/lecdem8888 (lecdem, 3 raga subjects)`.
5. The Coder runs `bani-render`. The four lecdem indexes (ADR-078) populate. The lecdem appears on TM Krishna's panel (ADR-080) and on the bani-flow strip for each of the three ragas (ADR-081).

The loop is closed: a bundle authored in the browser becomes a chip in the next render of the same browser, with no human touching a `.json` file.

### 6 — Hard-fail on unknown item types and `addToBundle` keys

- `bani_add.py` MUST iterate `bundle["items"].keys()` and reject any key not in the whitelist before processing begins. Today's behaviour silently ignores unknowns.
- `entry_forms.js`'s `addToBundle(type, obj)` MUST throw `Error("addToBundle: unknown type '<type>'")` on a non-whitelisted `type`. Today's `if (!baniBundle[type]) return;` becomes `if (!baniBundle[type]) throw new Error(…)`.

These two changes are the safety rails of the contract. Without them, the contract is a suggestion.

---

## Consequences

### Positive

- **One contract, three surfaces.** Browser, CLI ingester, and writer agree on the same field set for every item type. Adding a new field is a single decision applied uniformly.
- **Lecdems flow without special-case plumbing.** Once `writer.add_youtube` accepts `kind` and `subjects` (ADR-084), every existing path — `add-youtube` CLI, `bani_add.py` ingestion, `entry_forms.js` form download — supports lecdems with no per-surface code change beyond the toggle/flag.
- **Whitelist + hard-fail eliminates silent-drop bugs.** The two classes of bug enumerated in §Context (browser emits unknown / ingester silently drops) are made impossible by construction.
- **Schema versioning gives the system a future.** `schema_version` is the lever for shipping breaking changes safely. Until it changes, all bundles old and new round-trip.
- **Self-replication is now a stated invariant.** The bundle is the channel through which the system edits itself; ADR-085 elevates this to a governing principle.

### Negative / accepted tradeoffs

- **The bundle envelope is now load-bearing.** Future contributors must read this ADR before adding a write surface. Mitigated by linking it from `entry_forms.js`'s top comment and `bani_add.py`'s docstring.
- **Per-item failure isolation can mask cascade failures.** If a recording references a musician id added earlier in the same bundle, and the musician-add silently `SKIP`s as a duplicate but the recording's referenced id is wrong, the recording fails with a confusing message. Accepted: the alternative (transactional all-or-nothing) is harder to reason about and produces worse error reports.
- **`schema_version` is integer-only.** No semver. Two-axis evolution (bug-fix-only versus shape-change) is not expressible. Accepted for now; can be extended without breaking past bundles by treating an integer `1` as semver `1.0.0`.

### Risks

- **An ingester downgrade scenario** (newer browser writes a v2 bundle, older `bani-add` refuses) requires the rasika to update their installed `carnatic/` package. Mitigated by clear refusal message and `pip install -e . --upgrade` in the project README.
- **Hard-fail on unknown `addToBundle` keys** could break a future plugin/extension architecture that wants to add ad-hoc item types. Mitigated by the schema-version bump path: a plugin adds an item type via an ADR + `schema_version: 2`, not by sneaking a key past the whitelist.

---

## Implementation

This ADR is descriptive of the contract; the code changes that realise it are tracked under ADR-084 (writer + ingester for lecdems) and small surgical fixes here:

1. **`carnatic/bani_add.py`** (Coder)
   - Add a top-of-`main` whitelist check on `bundle["items"].keys()`.
   - Add a `schema_version > MAX_VERSION` refusal at the same point (`MAX_VERSION = 1`).
   - Update the module docstring to point to this ADR as the schema reference.

2. **`carnatic/render/templates/entry_forms.js`** (Coder)
   - Change `addToBundle`'s unknown-type branch from silent return to `throw`.
   - Update the file header comment to point to this ADR.

3. **Documentation** (Coder)
   - Add a `Bundle schema (v1)` section to `carnatic/.clinerules` referencing this ADR and §2's item shapes.
   - No changes to per-entity READYOU files (they remain the source of truth for field-level shapes; this ADR governs only the envelope and dispatch).

4. **Verification**
   - Existing bundles in `~/Downloads/bani_add_bundle.json` (and any sample fixtures) ingest unchanged.
   - A bundle with `schema_version: 99` is refused.
   - A bundle with `items.lecdems: [...]` is refused with a clear message naming the whitelist.
   - A browser-side `addToBundle('lecdems', x)` call throws in the console.
   - End-to-end: a lecdem authored via the form (per ADR-082), bundled, ingested via `bani-add`, rendered via `bani-render`, appears on the correct panels (per ADR-080, ADR-081). The full flow is the verification criterion for ADR-085.
