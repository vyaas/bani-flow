# ADR-077: Lecdem as a First-Class Object — Schema and Validation

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → librarian → carnatic-coder
**Depends on**: ADR-070 (youtube performers schema), ADR-018 (concert-bracketed recording groups)
**Companion ADRs**: ADR-078 (render indexes), ADR-079 (chip identity), ADR-080 (musician panel), ADR-081 (bani-flow surfacing & discoverability), ADR-082 (entry CLI + forms)

---

## Context

### What a lecdem is

A **lecture-demonstration** (lecdem) is a Carnatic performance form in which a musician explicates the music: the structure of a raga, the architecture of a composition, the shape of a bani, the grammar of manodharma. Every reputed Carnatic musician gives lecdems; rasikas listen to them eagerly. They are the recorded counterpart of the oral transmission that the graph already represents through `guru → shishya` edges.

A lecdem is musically distinct from a recital:

| Recital | Lecdem |
|---|---|
| Renders compositions in a raga | Talks **about** ragas, compositions, musicians, or the tradition |
| Audience listens for the music | Audience listens for the explanation |
| Indexed by composition / raga / artist | Indexed by **subject** — the entities the lecturer discusses |

Lecdems are also **rare**. A musician with 200 concert tracks may have 3 lecdems. They are not bulk content; they are landmarks.

### Why they belong in the graph as their own kind

Lecdems are already youtube videos hosted by a single musician (the lecturer). Storing them as plain `youtube[]` entries would make them indistinguishable from recital tracks — they would land in the singles list, mis-tagged as performances of a composition they only *discuss*. The graph would silently lose the distinction the tradition itself draws.

A lecdem has two axes of meaning:

1. **The lecturer** — the musician hosting the entry. There is exactly one. This is the same axis as today's `youtube[]` host musician.
2. **The subjects** — the entities the lecdem is *about*. Zero or more musicians, ragas, and/or compositions. This is a new axis with no existing analogue in the schema.

A lecdem may have zero subjects (e.g., TM Krishna on *Manodharma*-as-such); it is then discoverable only through its lecturer. Most lecdems carry subjects, and those subjects are the discovery hooks for rasikas browsing a raga or composition.

### Forces

| Force | Direction |
|---|---|
| **Distinguishability** | A lecdem must never be mistaken for a recital — neither in storage, nor in render, nor in the player UI. |
| **Multi-axis subjects** | Subjects span three node types (musician, raga, composition). Single-id fields cannot express this. |
| **Sparse but everywhere** | Most musicians have 0 lecdems; some have several. The schema cost for the empty case must be zero (back-compat). |
| **Reuse the youtube container** | A lecdem *is* a youtube video hosted by a musician. Inventing a new top-level file (`lecdems/{id}.json`) duplicates plumbing already done for `youtube[]`. |
| **Validator strictness** | When the field is present it must be well-formed: `kind === "lecdem"`, every subject id resolvable, no silent drops. |
| **Discoverability invariant** | Subjects are *discovery hooks*, not search keys. The schema must support panel-side lookups without polluting the global search index (enforced in ADR-081). |

---

## Pattern

**Strong Centres extended with shared boundary** (Alexander, *The Nature of Order*, Book 1). The `youtube[]` entry is already a strong centre — a musician-anchored unit of audio. The lecdem extends that centre with one new field rather than building a parallel structure. The container does not change shape; only its contents grow a new axis.

**Levels of Scale**. A lecdem fits inside a *track* (youtube entry) the same way performers do (ADR-070). One container, many optional facets: `performers`, `kind`, `subjects`. Each facet is independently optional and validator-checked when present.

**Boundary as filter**. The single field `kind: "lecdem"` is the boundary. On one side, render and indexing treat the entry as a recital track (the existing path). On the other, the same code branches into the lecdem path. A future `kind: "raga_alapana"` or `kind: "tani_avartanam"` would slot into the same boundary without new schema concepts.

---

## Decision

### 1 — Schema: extend `youtube[]` with `kind` and `subjects`

A lecdem is a `youtube[]` entry on the lecturer's musician node, distinguished by an explicit `kind` discriminator. Two new optional fields are introduced; both are absent on every existing entry.

```jsonc
// musician node, BEFORE (today)
{
  "id": "tm_krishna",
  "instrument": "vocal",
  "youtube": [
    {
      "url": "https://youtu.be/abcd1234",
      "label": "Endaro Mahanubhavulu · Sri · Adi - TM Krishna",
      "composition_id": "endaro_mahanubhavulu",
      "raga_id": "sri"
    }
  ]
}

// musician node, AFTER (with a lecdem entry alongside the recital)
{
  "id": "tm_krishna",
  "instrument": "vocal",
  "youtube": [
    {
      "url": "https://youtu.be/abcd1234",
      "label": "Endaro Mahanubhavulu · Sri · Adi - TM Krishna",
      "composition_id": "endaro_mahanubhavulu",
      "raga_id": "sri"
    },
    {
      "url": "https://youtu.be/lecdem9999",
      "label": "Lec-dem on Manodharma — TM Krishna",
      "kind": "lecdem",
      "subjects": {
        "raga_ids":        [],
        "composition_ids": [],
        "musician_ids":    []
      }
    },
    {
      "url": "https://youtu.be/lecdem8888",
      "label": "Lec-dem: The commonality of Surutti, Kedaragowla, Narayana Gowla — TM Krishna",
      "kind": "lecdem",
      "subjects": {
        "raga_ids":        ["surutti", "kedaragowla", "narayana_gowla"],
        "composition_ids": [],
        "musician_ids":    []
      }
    },
    {
      "url": "https://youtu.be/lecdem7777",
      "label": "Lec-dem on MD Ramanathan's bani — Aruna Sairam",
      "kind": "lecdem",
      "subjects": {
        "raga_ids":        [],
        "composition_ids": [],
        "musician_ids":    ["md_ramanathan"]
      }
    }
  ]
}
```

### 2 — Field reference

| field | type | required | notes |
|---|---|---|---|
| `kind` | `string` | — | Absent (or `"recital"` — the implicit default) means a recital track. `"lecdem"` declares a lecture-demonstration. Reserved for future kinds (`"tani"`, `"alapana_demo"`); validator currently accepts only `undefined`, `"recital"`, `"lecdem"`. |
| `subjects` | `object` | — when `kind: "lecdem"` | The three arrays below. The whole object MAY be omitted only when `kind` is also omitted; on a lecdem entry it MUST be present (even if all three arrays are empty — invariant C). |
| `subjects.raga_ids` | `string[]` | ✓ on lecdem | Each id MUST resolve to a raga in `ragas/`. Order is preserved and significant for display. Empty array is valid. |
| `subjects.composition_ids` | `string[]` | ✓ on lecdem | Each id MUST resolve to a composition in `compositions/`. Empty array is valid. |
| `subjects.musician_ids` | `string[]` | ✓ on lecdem | Each id MUST resolve to a musician node. Empty array is valid. The lecturer (the host node) is **never** auto-injected here — a lecdem is normally not "about" its own host. If a musician genuinely speaks about themselves, the librarian may include the host id explicitly. |

The lecturer is always the host musician node — the same `youtube[]` carrier as today. There is no separate `lecturer_id` field; the host *is* the lecturer.

The fields `composition_id`, `raga_id`, `year`, `version`, and `performers` (ADR-070) remain available on lecdem entries:

- `year` retains its meaning (date of the lecdem).
- `performers` may list co-presenters (e.g., a violinist who illustrates the raga during a vocal lecdem). Same shape as ADR-070; same host-inclusion invariant.
- `composition_id` and `raga_id` MUST be `null`/absent on lecdem entries. A lecdem does not *render* a composition or raga; it *discusses* them. The `subjects` arrays carry that discussion. The validator rejects co-presence to prevent the indexing ambiguity (recital path vs. lecdem path).

### 3 — Three invariants

#### Invariant A — host-implicit (back-compat with ADR-070)

If `kind` is absent, the entry is a recital track and behaves exactly as today. No render path changes for any existing data.

#### Invariant B — `kind: "lecdem"` requires `subjects`

If `kind === "lecdem"`, the `subjects` object MUST be present with all three arrays declared (any may be empty). Missing `subjects` on a lecdem is a validator error. This forces every lecdem to be self-describing about its discoverability surface.

#### Invariant C — empty subjects is legal (the "Manodharma" case)

```jsonc
{ "kind": "lecdem", "subjects": { "raga_ids": [], "composition_ids": [], "musician_ids": [] } }
```

is valid. Such a lecdem is discoverable **only** through its lecturer (it appears in the host's "Lecdems by" section per ADR-080 and nowhere else). This is the schema-level expression of scratch.md item 6.

#### Invariant D — id resolvability (no silent drops)

Every id in any `subjects.*_ids` array MUST resolve to a node in the corresponding entity table at validation time. Unmatched ids are a validator error — never silently dropped. (Contrast with `performers[].unmatched_name` from ADR-070: subjects do not have an unmatched-name escape hatch, because a subject id failing to resolve indicates the librarian has not yet added the referenced entity. The fix is to add the entity, not to embed a typed-out string.)

### 4 — `kind` vocabulary (controlled, single-source)

For now, `kind ∈ { undefined, "recital", "lecdem" }`. The vocabulary lives in the same single-source location as `PERFORMER_ROLES` (ADR-071):

- **Python**: `carnatic/render/youtube_kinds.py` exporting `YOUTUBE_KINDS: tuple[str, ...]`.
- **JS**: `carnatic/render/templates/youtube_kinds.js` exporting `window.YOUTUBE_KINDS`.

The bare default `undefined` (field absent) is treated as `"recital"` everywhere downstream. Storage prefers omission to keep diffs minimal on the long tail of existing recital tracks.

---

## Consequences

### Positive

- **Lecdems become first-class without a new file type**: storage cost is zero for the empty case; the schema cost is two optional fields on the existing `youtube[]` shape.
- **Multi-axis subjects fall out naturally**: rasikas browsing any of three node types (musician, raga, composition) get the discovery hooks they need (wired in ADR-080 and ADR-081).
- **Validation can guarantee the discoverability invariant**: by rejecting unresolved subject ids and requiring `subjects` on every lecdem, we ensure the indexes built in ADR-078 are dense and trustworthy.
- **The "lecdem about nothing" case (item 6 of scratch.md) has a clean schema expression**: an empty `subjects` is a legal, named state — not a missing field.

### Negative / accepted tradeoffs

- **Two facets sharing one container**: `youtube[]` now carries both recital tracks and lecdems, distinguished only by `kind`. Render code must branch on `kind` (one extra check per entry). Accepted in exchange for not duplicating the `youtube[]` plumbing.
- **`composition_id`/`raga_id` exclusion on lecdem entries** is asymmetric with recital entries; this is enforced by the validator and surfaced in the entry form (ADR-082) so librarians do not encode primary subjects in the wrong field.
- **Subject ids must exist before the lecdem can be added.** A librarian curating a lecdem on a not-yet-added raga must add the raga first. This is consistent with the existing rule for compositions (ADR-014) and is a feature, not a bug — it forces the prerequisite entities into the graph.

### Risks

- **Collision with future ADR for non-youtube lecdem media** (e.g., audio-only archives, PDF transcripts). This ADR scopes itself to youtube-hosted lecdems. A future container can adopt the same `kind`/`subjects` vocabulary; the field shapes are designed to be portable.
- **`subjects` keys overlap with id namespaces of other entities.** Mitigated by the fact that the keys (`raga_ids`, `composition_ids`, `musician_ids`) name the *type* of the referent, not the referent itself. Renames to a node id propagate as for any cross-reference (standard ID-stability rule, ADR-015).

---

## Implementation

Implementation is sequenced under ADR-082 (entry surfaces) and ADR-078 (render indexes). This ADR is schema-only.

1. **Vocabulary modules** (Coder)
   - `carnatic/render/youtube_kinds.py` — `YOUTUBE_KINDS = ("recital", "lecdem")`.
   - `carnatic/render/templates/youtube_kinds.js` — mirror as `window.YOUTUBE_KINDS`.

2. **Validator** (Coder, in `carnatic/cli.py validate`)
   - Walk every `node.youtube[]`. If `kind` present, must be in `YOUTUBE_KINDS`.
   - If `kind === "lecdem"`:
     - `subjects` MUST be present, MUST have all three array keys.
     - Every id in `subjects.raga_ids` MUST resolve in `ragas/`.
     - Every id in `subjects.composition_ids` MUST resolve in `compositions/`.
     - Every id in `subjects.musician_ids` MUST resolve in `musicians/`.
     - `composition_id` and `raga_id` MUST be absent or `null`.

3. **Schema docs** (Coder)
   - `carnatic/data/musicians/READYOU.md` — document `kind` and `subjects` with the three worked examples above (raga subjects, musician subject, empty subjects).
   - Cross-reference ADR-070 for the shared youtube-entry shape.

4. **Verification**
   - `python3 carnatic/cli.py validate` exits 0 on existing data (no entries carry `kind` yet).
   - Add one test fixture lecdem to a sandbox musician; validator passes; remove `subjects` → validator fails; add an unresolvable raga id → validator fails; revert before commit.

5. **Downstream**
   - ADR-078 reads these fields to build the by/about indexes.
   - ADR-082 wires the write CLI and entry forms to produce only validator-clean lecdem entries.
