# ADR-112: Hindustani Equivalent Ragas (HER) as First-Class Raga Citizens

**Status:** Proposed
**Date:** 2026-04-27

---

## Context

### The mission and the gap

Bani Flow exists to provide an aural experience of Carnatic music. Carnatic music is
*raga music* — but so is Hindustani music. The two traditions share a swara
vocabulary and, in many cases, the same set of swaras gives rise to ragas in both
systems. The remarkable thing is that those identical swara sets sound profoundly
different in performance:

- [`hindolam`](../carnatic/data/ragas/hindolam.json) and Malkauns share their five
  swaras (S G2 M1 D1 N2). Hindolam is a brisk, kriti-driven raga; Malkauns is a
  slow, vilambit unfolding of mood.
- [`madhyamavati`](../carnatic/data/ragas/madhyamavati.json) shares its swaras with
  Madhumad Sarang. Madhyamavati is dense with gamaka; Madhumad Sarang lets the
  swaras breathe.
- [`thodi`](../carnatic/data/ragas/thodi.json) shares its scale with Shudh Bhairavi.
  Same swaras; entirely different aesthetic.

A rasika immersed in Carnatic music who never hears these Hindustani counterparts is
denied a structural insight that the tradition itself rewards: *the swaras are not
the raga*. The raga is the gamaka, the chalan, the mood — the way the swaras are
inhabited. Hearing the Hindustani twin makes the Carnatic raga audible in a new way.

The Hindustani tradition also offers Carnatic rasikas three complementary lessons:

1. **De-emphasis of arohana / avarohana**. A raga is far more than its scale.
2. **Embrace of vilambit**. Carnatic music can suffer from *gamakization* — the
   swara is shaken before it is heard. Vilambit lets a swara sound.
3. **Mood as the centre**. Rasa is not an annotation; it is the organising principle.

These lessons are not abstract — they are audible the moment a rasika hears Malkauns
after Hindolam. The graph's job is to make the comparison one click away.

### What's missing in the data

Today the raga schema (per
[`carnatic/data/ragas/*.json`](../carnatic/data/ragas/)) records only the Carnatic
universe:

```json
{
  "id": "hindolam",
  "melakarta": null,
  "parent_raga": "natabhairavi",
  "is_melakarta": false,
  ...
}
```

There is **no link** from `hindolam` to its Hindustani twin Malkauns, no place to
store Malkauns as a raga object, and no way for the writer pipeline to ingest
recordings of Hindustani performances tagged to a Carnatic raga's "neighbourhood".

A rasika who searches the Bani Flow panel for Malkauns gets nothing. A rasika who
clicks Mela 20 (Natabhairavi) to see its janyas sees Hindolam but not Malkauns.

### Why this is a schema concern, not a UI concern

The view layer (covered in ADR-113) cannot surface what the data does not encode.
Before any chip can render in a different colour, before any search result can place
Malkauns alongside Hindolam, the data model must:

1. Recognise *Hindustani Equivalent Raga* (HER) as a first-class node type — stored
   in the same `ragas/` directory, traversable by the same CLI commands, validated
   by the same writer.
2. Encode the **equivalence edge** from a Carnatic raga to its HER (one-to-one or
   one-to-many; Malkauns is *the* twin of Hindolam, but a Carnatic raga may have
   more than one credible Hindustani analogue).
3. Distinguish HER objects from Carnatic raga objects so the view layer can colour
   them differently and the writer can apply different validation rules (HERs do
   not need a melakarta, do not have janyas in our graph, and almost never have
   compositions — see Recordings section below).

---

## Forces in tension

1. **Strong centres preserved.** A Carnatic raga remains the centre of a Carnatic
   rasika's experience. The HER is a *neighbouring centre*, not a replacement.
   It must be visually and structurally subordinate — clearly marked as Hindustani —
   while being directly traversable.

2. **Symmetry of the swara universe.** The HER and its Carnatic twin share swaras
   but not aesthetic. The schema must let us record this *without* implying that
   they are interchangeable. An HER is not a synonym; it is a sibling.

3. **Recordings, not compositions.** Hindustani performance is overwhelmingly
   raga-anchored, not composition-anchored. A typical recording is a vilambit
   alaap-jor-jhala-gat, attributed to a musician in a raga, not to a composer
   writing a kriti. The schema must accept HER recordings without requiring a
   `composition_id`.

4. **Backward compatibility.** Existing Carnatic ragas, recordings, and CLI
   commands must continue to work unchanged. The HER feature is purely additive at
   the data layer.

5. **Validation parity.** The writer (ADR-016) must validate HER objects with the
   same rigour as Carnatic ragas: every HER node requires a Wikipedia URL, a
   verified ID, and a tradition tag.

6. **Loose coupling, tight tagging.** Many Carnatic ragas have no Hindustani twin
   we want to surface (yet). The HER link must be *optional* on the Carnatic side
   — a raga without an HER is fine.

---

## Pattern

### **Strong Centres** (Alexander, Pattern 1) and **Boundaries** (Pattern 13)

A Hindustani raga is its own *strong centre* in its own tradition. Within Bani
Flow's Carnatic-centric world, it is a centre on the boundary — a clearly marked
neighbouring world that the rasika can step into and step back from. The boundary
is encoded by the `tradition` field (see Decision §1) and made visible in the view
layer (ADR-113) by chip colour.

### **Connections to the World** (Pattern 18)

Bani Flow's mission is immersion in the Carnatic tradition. Immersion does not mean
isolation. The HER feature is an explicit "connection to the world" — the world of
Indian classical music outside Carnatic — that enriches the immersion rather than
diluting it.

### **Symmetry without conflation**

Equivalent ragas are siblings, not synonyms. The schema must encode the relationship
as an *edge* between two distinct objects, never as an alias of one into the other.

---

## Decision

### 1. New `tradition` field on every raga object

Add a required `tradition` field with two valid values: `"carnatic"` (default) and
`"hindustani"`.

| field | type | notes |
|---|---|---|
| `tradition` | string | `"carnatic"` (default for all existing ragas) or `"hindustani"`. Required for new ragas. The writer sets `"carnatic"` when absent on existing ragas during migration. |

This is the single load-bearing field that distinguishes a Carnatic raga from an
HER. All view colouring, search ranking, and validation branching keys off this
field.

### 2. New `hindustani_equivalents` field on Carnatic raga objects

Add an optional `hindustani_equivalents` array on Carnatic raga objects. Each entry
is the `id` of an HER object stored in `carnatic/data/ragas/`.

| field | type | notes |
|---|---|---|
| `hindustani_equivalents` | string[] | Array of HER raga IDs. Optional. Empty or absent if no HER is curated for this Carnatic raga. |

The relationship is **one-way at the schema level** (Carnatic raga → HER), but
**bidirectionally traversable at the CLI level** (see §5). The HER object does not
store a back-reference; the writer reconstructs both directions from the Carnatic
side. This avoids dual-write inconsistency and keeps the HER object small.

A Carnatic raga may declare more than one HER when more than one Hindustani raga is
a credible aural counterpart (rare but real — e.g. some Carnatic ragas map to two
related Hindustani ragas in different gharanas).

### 3. HER raga object schema

HER objects live in `carnatic/data/ragas/` alongside Carnatic ragas (same directory,
same file pattern). They use the same base schema with three differences:

```json
{
  "id": "malkauns",
  "name": "Malkauns",
  "aliases": ["Malkosh", "Malkoshi"],
  "tradition": "hindustani",
  "melakarta": null,
  "parent_raga": null,
  "is_melakarta": false,
  "thaat": "bhairavi",
  "carnatic_equivalents": ["hindolam"],
  "sources": [
    {
      "url": "https://en.wikipedia.org/wiki/Malkauns",
      "label": "Wikipedia",
      "type": "wikipedia"
    }
  ],
  "notes": "One of the oldest ragas of Hindustani music; pentatonic; same swaras as Hindolam (S g M d n S); typically rendered vilambit; deeply meditative; the Malkauns thaat is named after it."
}
```

Differences from Carnatic raga objects:

- `tradition: "hindustani"` (required)
- `melakarta`, `parent_raga`, `is_melakarta` are always `null` / `false` — the
  Hindustani system does not use the Melakarta classification. These fields are
  retained (not removed) so the schema stays uniform and the validator can apply a
  single rule set.
- New optional `thaat` field (string | null) — the Hindustani analogue of
  melakarta. Ten thaats (Bilawal, Kalyan, Khamaj, Bhairav, Bhairavi, Asavari, Todi,
  Purvi, Marwa, Kafi). Optional in this ADR; reserved for a future ADR to give
  thaats first-class structure if/when that becomes a curatorial priority.
- `carnatic_equivalents` — read-only convenience field populated by the writer
  (mirrors `hindustani_equivalents` from the Carnatic side). It is **derived**, not
  authored. The writer regenerates it on every render. This lets the view layer and
  CLI traverse from an HER back to its Carnatic twin without the Librarian having
  to maintain both sides.

### 4. HER recordings schema — composition-optional

The current YouTube schema requires a `composition_id` for `kind: "kriti"` and most
other kinds. For HER recordings, this is too strict. Add a new `kind: "raga_alap"`
(or accept any existing kind) and **relax the composition requirement when the
hosting raga is HER**.

```json
{
  "url": "https://youtu.be/...",
  "label": "Raga Malkauns — alap, jor, jhala (vilambit)",
  "kind": "raga_alap",
  "subjects": {
    "raga_ids": ["malkauns"],
    "composition_ids": [],
    "musician_ids": ["nikhil_banerjee"]
  }
}
```

The writer validation rule becomes:

> If the recording's primary `raga_id` resolves to a raga with
> `tradition == "hindustani"`, then `composition_ids` may be empty and `kind` may
> be one of `raga_alap`, `lecdem`, `concert`, `misc`.

This is a **boundary rule**: the relaxation applies only when the recording crosses
into the Hindustani neighbourhood. Carnatic recordings retain their existing
validation.

### 5. CLI traversal commands

Add three read-only commands to [`carnatic/cli.py`](../carnatic/cli.py):

| command | returns |
|---|---|
| `her-of <carnatic_raga_id>` | HER ids for the given Carnatic raga (empty if none) |
| `carnatic-twin-of <her_id>` | Carnatic raga ids that declare this HER |
| `her-list` | All HER raga ids in the database, with their Carnatic twins |

These mirror the existing `janyas-of` / `mela-of` traversal pattern from ADR-021.

### 6. Writer commands

Add to [`carnatic/write_cli.py`](../carnatic/write_cli.py):

| command | effect |
|---|---|
| `add-her --id <her_id> --name <name> --wiki-url <url> [--thaat <thaat>] [--aliases ...]` | Creates an HER raga object in `carnatic/data/ragas/<id>.json` with `tradition: "hindustani"`. |
| `link-her --carnatic-raga <car_id> --her <her_id>` | Adds `<her_id>` to the Carnatic raga's `hindustani_equivalents` array (idempotent). |
| `add-her-recording --musician-id <id> --url <url> --raga-id <her_id> --label <label> --kind raga_alap` | Adds an HER YouTube recording to a musician, bypassing the composition requirement. |

All three obey the writer's existing validation contract from ADR-016: Wikipedia URL
required, ID format enforced, no silent overwrites, idempotent.

### 7. Migration plan

1. **Backfill `tradition: "carnatic"` on every existing raga** in
   `carnatic/data/ragas/*.json`. One-shot script, owned by the Coder.
2. **Re-render** to refresh `graph.json` and `graph.html`.
3. **Validate** — `python3 carnatic/cli.py validate` must report 0 errors with the
   new `tradition` field present on every raga.
4. **Seed three HER pairs** (Librarian, separately): Malkauns ↔ Hindolam,
   Madhumad Sarang ↔ Madhyamavati, Shudh Bhairavi ↔ Thodi. These three are the
   canonical examples from the user's brief and become the test set for ADR-113's
   view work.

The HER feature is **dark** (no UI surface) until the migration completes and the
seed pairs are in place. ADR-113 then turns on the view layer.

---

## Consequences

### Positive

- A rasika can search "Malkauns" and find it; the graph honours the Hindustani
  tradition as a sibling, not an outsider.
- The structural insight *the swaras are not the raga* becomes audibly
  demonstrable — one click moves a rasika from Hindolam to Malkauns.
- The schema is uniform: HERs are ragas, stored in the same directory, validated
  by the same writer, traversed by analogous CLI commands. No parallel data tier.
- Composition-optional recordings open the door to lecdems and live concerts that
  do not fit the kriti mould — a small win for Carnatic recordings as well (some
  lecdems and ragam-tanam-pallavi recordings already strain the kriti-centric
  schema).

### Negative / risks

- **Curatorial scope creep.** Hindustani music is vast. Bani Flow must resist
  becoming a Hindustani database. The Librarian's hard rule: *an HER is added only
  to illuminate a Carnatic raga.* No HER is added without a `hindustani_equivalents`
  link from at least one Carnatic raga. ADR-113 will surface the rule in the
  writer.
- **Spelling and transliteration variance.** Hindustani ragas have multiple
  romanisations (Malkauns / Malkosh / Malkoshi). The `aliases[]` array absorbs
  this; phonetic search (ADR-017) extends to HERs automatically.
- **Thaat as a sleeping field.** This ADR records `thaat` but does not promote it
  to a first-class structural citizen the way ADR-021 did for melakarta. If/when
  the HER catalogue grows past ~20 entries, a follow-up ADR may want to make
  thaats traversable. Recording the field now means we don't have to migrate later.
- **Validator branching.** Composition-optional recordings introduce a conditional
  validation rule. The writer's complexity rises by one branch; the Coder must
  add a focused test (HER recording with empty `composition_ids` passes; Carnatic
  recording with empty `composition_ids` still fails for a kriti).

### Neutral

- The `carnatic_equivalents` derived field on HER objects costs one regeneration
  pass per render. Negligible.

---

## Implementation

This ADR is doc-only. Implementation requires:

1. **Coder** (after ADR Accepted):
   - Migration script: backfill `tradition: "carnatic"` on every existing raga
     file. Idempotent.
   - Validator update: enforce `tradition` field present, accept the new HER
     branch for recordings.
   - CLI commands: `her-of`, `carnatic-twin-of`, `her-list`.
   - Writer commands: `add-her`, `link-her`, `add-her-recording`.
   - Render pipeline: populate the derived `carnatic_equivalents` field on HER
     objects from Carnatic-side declarations.
   - Tests: unit tests for the validator's HER branch and for the bidirectional
     traversal.

2. **Librarian** (after Coder merges):
   - Create `malkauns.json`, `madhumad_sarang.json`, `shudh_bhairavi.json` via
     `add-her`.
   - Link them to `hindolam`, `madhyamavati`, `thodi` via `link-her`.
   - Source one or two seed Hindustani recordings per HER via
     `add-her-recording` (the musician nodes for the chosen artists are covered
     in ADR-114).

3. **Coder** (final):
   - Run `bani-render`.
   - Confirm validate passes with HER nodes present.

UI work is **out of scope** for this ADR — covered in ADR-113.

Musician and instrument expansion (sitar, sarod, vocal-Hindustani) is **out of
scope** — covered in ADR-114.

---

## Related ADRs

- ADR-016 — Writer validation as source of truth (HER validation extends this)
- ADR-017 — Phonetic search & transliteration (HER aliases benefit automatically)
- ADR-021 — Melakarta first-class citizens (HER follows the same first-class pattern)
- ADR-022 — Raga panel navigability (ADR-113 extends this with HER chips)
- ADR-023 — Raga wheel third view (ADR-113 extends this with HER placement)
- ADR-113 — HER surfacing in views and search (proposed alongside this ADR)
- ADR-114 — HER musicians and instrument vocabulary expansion (proposed alongside)
