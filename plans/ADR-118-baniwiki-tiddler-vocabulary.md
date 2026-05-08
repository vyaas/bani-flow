# ADR-118: BaniWiki vocabulary — tiddler types, tag namespaces, field schema

**Status**: Proposed
**Date**: 2026-05-08
**Agents**: graph-architect (proposer), librarian + carnatic-coder (downstream consumers)
**Depends on**: ADR-095 (BaniWiki exploratory mapping), ADR-117 (Node.js deployment)
**Companion ADRs**: ADR-119 (mapper), ADR-120 (filter atlas), ADR-121 (phase-out)

---

## Context

ADR-095 sketched a high-level mapping (`musician → Musician/<id>`, `tags: era:<era>`, etc.) sufficient to *demonstrate* the projection. ADR-117 commits us to the Node.js deployment, in which each tiddler is a real file under `tiddlers/`. Real files force a real vocabulary: the title pattern, the tag namespace, the field schema, the JSON-vs-`.tid` choice — all become decisions that other code (the mapper, the filter atlas, the entry forms, the validators) builds against.

The user has stated the requirement directly: **"We need to establish a strong vocabulary of concepts now that we are making the connection to tiddlywiki."** A vocabulary is the contract between the data layer (Librarian's land) and the projection layer (BaniWiki's land). Without it, every script that reads tiddlers re-invents the conventions, drift sets in, and the round-trip breaks.

This ADR is the contract. It defines — exhaustively, not exemplarily — the tiddler shapes BaniWiki uses. It is the spec ADR-119 (the mapper) is bound by, the spec ADR-120 (the filter atlas) is bound by, and the spec ADR-121 (the phase-out) eventually freezes.

### Forces

| Force | Direction |
|---|---|
| **Filter ergonomics** | Tags and fields MUST be chosen so that the queries we already run (lineage, raga of composition, recordings of musician, mela of janya) become short, idiomatic TW5 filter strings. ADR-120 catalogues these; this ADR provides the substrate. |
| **Title stability** | Tiddler titles are URL fragments after ADR-117. Once published, they cannot change. Titles MUST encode the entity's permanent ID, not its label. The Librarian's "never rename a node ID" rule extends naturally. |
| **Round-trip determinism** | The mapper (ADR-119) must produce byte-identical tiddler files from byte-identical `data/**`. The vocabulary MUST be fully specified (no implicit choices) so the mapper has nothing to invent. |
| **Tag-namespace clarity** | TW5 tags are a flat string set. Ambiguity (`Tyagaraja` the composer vs. `Tyagaraja` the bani vs. `Tyagaraja` the place) corrupts filters silently. The vocabulary MUST use namespaced tag prefixes (`composer:`, `bani:`, `place:`) to keep the namespace unambiguous. |
| **Field-vs-JSON-text discipline** | A tiddler can carry data in `fields` (string-typed, filterable) or in its `text` body (free-form, untyped). The vocabulary MUST be explicit about which field goes where, and the JSON entity body should remain in `text` as a lossless backup. |
| **External readability** | Tiddler titles and tags appear in URLs, in the wiki sidebar, in search results. They MUST be readable. Snake_case IDs are acceptable in titles (they are stable and short); tags should use lowercase with `:` namespacing. |
| **No surgical schema changes downstream** | Per the user's constitutional constraint: this vocabulary is the *only* place schema-shape decisions are made for BaniWiki. The mapper (ADR-119) consumes this spec; it does not invent fields. |

---

## Pattern

**Christopher Alexander, Property 4, *Alternating Repetition*.** The vocabulary establishes alternating layers: type tag → namespace tag → field. Every tiddler exhibits the same rhythm (e.g. `Musician`, then `era:contemporary`, then `field bani: ariyakudi`). The repetition makes the corpus *legible at a glance* — open any tiddler, see the same shape.

**Property 8, *Echoes*.** The vocabulary echoes the existing `data/**` layout: `Musician/<id>` echoes `data/musicians/<id>.json`; `Raga/<id>` echoes `data/ragas/<id>.json`. A Librarian who knows the existing tree learns the BaniWiki tree in seconds because the structure rhymes.

**Pattern 35, *Household Mix*: a community with one kind of inhabitant is dead.** A vocabulary with only one tiddler type (`Entity`) is dead — every query degenerates to a free-text scan. This vocabulary names *eight* primary types (Musician, Raga, Composition, Recording, Concert, Lecdem, Tala, Mela) plus governance types (ADR, Doc, Atlas, System, Help). Each is a first-class citizen with its own filter target, its own tag namespace, its own typical fields.

**Convention before configuration.** The vocabulary is enforced by the mapper (ADR-119), not by TW5 itself. TW5 will happily store any tags and fields you give it. Discipline lives in our scripts.

---

## Decision

**This ADR defines the BaniWiki vocabulary in full.** It comprises four sections:

1. **Title patterns** (one per type)
2. **Tag namespaces** (the type tags + the namespaced classification tags)
3. **Field schema** (which scalars get lifted to TW5 fields per type)
4. **Body discipline** (JSON-in-text vs wikitext)

Where this ADR conflicts with ADR-095's illustrative mapping, **this ADR wins** (ADR-095 was exploratory; this is the spec).

### 1 — Title patterns

Tiddler titles are **case-sensitive** and use a forward slash to separate the type prefix from the entity ID. The entity ID is the existing snake_case identifier from `data/**` and is never altered.

| Source | Title pattern | Example |
|---|---|---|
| `data/musicians/<id>.json` | `Musician/<id>` | `Musician/ariyakudi_ramanuja_iyengar` |
| `data/ragas/<id>.json` (janya) | `Raga/<id>` | `Raga/kharaharapriya` |
| `data/ragas/<id>.json` (mela) | `Raga/<id>` (also tagged `Melakarta`) | `Raga/kharaharapriya` |
| `data/melakartas/<id>.json` (if separate) | `Mela/<id>` | `Mela/kharaharapriya` |
| `data/compositions/<id>.json` | `Composition/<id>` | `Composition/parulanna_matta` |
| `data/recordings/<id>.json` (single track) | `Recording/<id>` | `Recording/2018_arr_kharaharapriya` |
| `data/recordings/<id>.json` (concert bracket) | `Concert/<id>` containing many `Recording/<id>` | `Concert/2018_kalakshetra_january` |
| `data/lecdems/<id>.json` | `Lecdem/<id>` | `Lecdem/lakshmi_sreeram_kharaharapriya` |
| `data/talas/<id>.json` (if extracted) | `Tala/<id>` | `Tala/adi` |
| `plans/ADR-NNN-*.md` | `ADR/<NNN>` | `ADR/118` |
| `data/help/empty_panels/*.json` | `Help/EmptyPanel/<panel>` | `Help/EmptyPanel/musician` |
| `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `carnatic/.clinerules` | `Doc/<Slug>` | `Doc/Claude`, `Doc/Clinerules` |
| Filter atlas (ADR-120) | `Atlas/Filters` | (single tiddler) |
| Schema version, sentinels | `System/<name>` | `System/SchemaVersion` |

**Rules:**
- Titles never change once published. The Librarian's "never rename a node ID" rule (CLAUDE.md hard rules) extends here verbatim.
- The slash is a TW5-legal title character; TW5 displays it visually as a hierarchy in the sidebar.
- IDs remain snake_case for symmetry with `data/**`. Labels (the human-readable name) are stored as a field, not in the title.

### 2 — Tag namespaces

Every tiddler carries:
- Exactly **one type tag** (capital first letter) — `Musician`, `Raga`, `Composition`, `Recording`, `Concert`, `Lecdem`, `Tala`, `Mela`, `ADR`, `Doc`, `Atlas`, `Help`, `System`.
- Zero or more **namespaced classification tags** (lowercase, with a `:` separator). Namespaces are reserved; new namespaces require an ADR addendum.

**Reserved tag namespaces:**

| Namespace | Meaning | Applies to | Example values |
|---|---|---|---|
| `era:` | Period of activity | Musician | `era:trinity`, `era:post-trinity`, `era:modern`, `era:contemporary` |
| `instrument:` | Primary instrument | Musician | `instrument:vocal`, `instrument:violin`, `instrument:mridangam`, `instrument:flute`, `instrument:veena` |
| `bani:` | Bani / school | Musician | `bani:ariyakudi`, `bani:semmangudi`, `bani:musiri`, `bani:gnb` |
| `tradition:` | Carnatic / Hindustani / both | Musician, Raga | `tradition:carnatic`, `tradition:hindustani` |
| `composer:` | Composer of a composition | Composition, Recording, Lecdem | `composer:tyagaraja`, `composer:dikshitar` |
| `raga:` | Raga of a composition / recording | Composition, Recording, Lecdem | `raga:kharaharapriya` |
| `tala:` | Tala of a composition / recording | Composition, Recording | `tala:adi`, `tala:rupakam` |
| `mela:` | Parent mela (for janyas) | Raga | `mela:kharaharapriya` |
| `language:` | Composition language | Composition | `language:telugu`, `language:sanskrit`, `language:tamil` |
| `concert:` | Parent concert bracket | Recording | `concert:2018_kalakshetra_january` |
| `performer:` | Performer on a recording | Recording, Lecdem | `performer:ariyakudi_ramanuja_iyengar` |
| `guru:` | A guru of this musician | Musician | `guru:tyagaraja` |
| `disciple:` | A disciple of this musician (denormalised) | Musician | `disciple:gnb` |
| `panel:` | Which UI panel a help tiddler belongs to | Help | `panel:musician`, `panel:raga` |
| `status:` | ADR status | ADR | `status:proposed`, `status:accepted`, `status:superseded` |

**Anti-patterns this prevents:**
- A bare `Tyagaraja` tag could be a person, a bani, a place, a composition. With namespaces, `composer:tyagaraja` and `bani:tyagaraja` are unambiguous.
- A bare `kharaharapriya` could be a janya raga, a mela, or a recording subject. With namespaces, `raga:kharaharapriya` and `mela:kharaharapriya` are distinct.

### 3 — Field schema

TW5 fields are string-typed and filterable. Lifting a scalar from the JSON body into a field has one cost (duplication) and one benefit (cheap filtering). The rule: **lift any scalar that appears in queries**. Arrays and nested objects stay in the JSON body.

**`Musician/<id>` fields:**

| Field | Source | Type | Required |
|---|---|---|---|
| `id` | `id` | string | yes |
| `label` | `label` | string | yes |
| `born` | `born` | year-string | optional |
| `died` | `died` | year-string | optional |
| `era` | `era` | string | yes |
| `instrument` | `instrument` | string | yes |
| `bani` | `bani` | string | optional |
| `tradition` | `tradition` | string | yes (defaults to `carnatic`) |
| `wikipedia_url` | `wikipedia_url` | URL | yes (CLAUDE.md hard rule) |
| `youtube_count` | derived | integer-string | optional (cached for filters like `[field:youtube_count[>0]]`) |

The `guru_ids[]`, `disciple_ids[]`, `youtube[]`, `sources[]` arrays stay in the JSON body and are also reflected as `guru:` / `disciple:` / `performer:` tags so they are filterable.

**`Raga/<id>` fields:**

| Field | Source | Type | Required |
|---|---|---|---|
| `id` | `id` | string | yes |
| `label` | `label` | string | yes |
| `mela_id` | `mela_id` | string | yes if janya |
| `melakarta_number` | `melakarta_number` | integer-string | yes if mela |
| `cakra` | `cakra` | string | yes if mela |
| `tradition` | `tradition` | string | yes |
| `hindustani_equivalent` | `hindustani_equivalent_id` | string | optional (per ADR-112) |
| `wikipedia_url` | `wikipedia_url` | URL | yes |

**`Composition/<id>` fields:**

| Field | Source | Type | Required |
|---|---|---|---|
| `id` | `id` | string | yes |
| `label` | `label` | string | yes |
| `composer_id` | `composer_id` | string | yes |
| `raga_id` | `raga_id` | string | yes |
| `tala` | `tala` | string | yes |
| `language` | `language` | string | yes |

**`Recording/<id>` fields:**

| Field | Source | Type | Required |
|---|---|---|---|
| `id` | `id` | string | yes |
| `label` | `label` | string | yes |
| `composition_id` | composition referenced | string | yes when known |
| `raga_id` | raga referenced | string | yes when known |
| `concert_id` | parent concert (per ADR-018) | string | optional |
| `year` | year of recording | year-string | optional |
| `youtube_url` | URL | URL | yes |
| `start_seconds` | per ADR-101 | integer-string | optional |
| `end_seconds` | per ADR-101 | integer-string | optional |

**`Concert/<id>` fields:** `id`, `label`, `year`, `venue` (all optional except `id`, `label`).

**`Lecdem/<id>` fields:** `id`, `label`, `presenter_id`, `raga_id` or `composition_id` (subject), `youtube_url`, `start_seconds` / `end_seconds` (per ADR-101).

**`Tala/<id>` fields:** `id`, `label`, `aksharas` (integer-string), `structure` (free-form).

**`Mela/<id>` fields:** `id`, `label`, `melakarta_number`, `cakra`, `arohana`, `avarohana`, `wikipedia_url`.

**`ADR/<NNN>` fields:** `adr_number` (zero-padded), `date` (ISO), `status` (`proposed` / `accepted` / `superseded`), `supersedes` (space-separated ADR numbers), `superseded_by`.

**Universal fields** (all tiddlers): `created`, `modified`, `creator` (TW5 standard).

### 4 — Body discipline (JSON-in-text vs wikitext)

| Type | `type` field | `text` body |
|---|---|---|
| Musician | `application/json` | the full musician JSON object as it exists in `data/musicians/<id>.json` |
| Raga | `application/json` | the full raga JSON object |
| Composition | `application/json` | the full composition JSON object |
| Recording | `application/json` | the full recording JSON object (for that single recording) |
| Concert | `application/json` | the concert metadata + recording IDs |
| Lecdem | `application/json` | the full lecdem JSON object |
| Tala | `application/json` | the full tala JSON object |
| Mela | `application/json` | the full mela JSON object |
| ADR | `text/markdown` | the ADR body verbatim (TW5 markdown plugin renders it) |
| Doc | `text/markdown` | document body verbatim |
| Atlas | `text/vnd.tiddlywiki` | wikitext (the atlas is itself a TW table) |
| Help | `application/json` or `text/markdown` | per existing schema |
| System | varies | varies |

**The JSON-in-text discipline guarantees losslessness.** Every field lifted to TW5 fields is duplicated from the JSON body. The mapper's inverse (ADR-119) reads the JSON body, ignoring the lifted fields, so any drift between fields and body is detected by `baniwiki-validate`'s round-trip check (the body wins; lifted fields are an index, not a source).

### 5 — Examples (informative, not normative)

**`baniwiki/tiddlers/Musician/ariyakudi_ramanuja_iyengar.tid`** (illustrative; exact serialisation TBD by ADR-119):

```
title: Musician/ariyakudi_ramanuja_iyengar
tags: Musician era:post-trinity instrument:vocal bani:ariyakudi tradition:carnatic guru:ramnad_srinivasa_iyengar
type: application/json
id: ariyakudi_ramanuja_iyengar
label: Ariyakudi Ramanuja Iyengar
born: 1890
died: 1967
era: post-trinity
instrument: vocal
bani: ariyakudi
tradition: carnatic
wikipedia_url: https://en.wikipedia.org/wiki/Ariyakudi_Ramanuja_Iyengar
youtube_count: 42

{ "id": "ariyakudi_ramanuja_iyengar",
  "label": "Ariyakudi Ramanuja Iyengar",
  "born": 1890, "died": 1967,
  "era": "post-trinity",
  "instrument": "vocal",
  "bani": "ariyakudi",
  "tradition": "carnatic",
  "wikipedia_url": "https://en.wikipedia.org/wiki/Ariyakudi_Ramanuja_Iyengar",
  "guru_ids": ["ramnad_srinivasa_iyengar"],
  "youtube": [...]
}
```

**`baniwiki/tiddlers/Composition/parulanna_matta.tid`** (illustrative):

```
title: Composition/parulanna_matta
tags: Composition composer:tyagaraja raga:kharaharapriya tala:adi language:telugu
type: application/json
id: parulanna_matta
label: Parulanna Maata
composer_id: tyagaraja
raga_id: kharaharapriya
tala: adi
language: telugu

{ "id": "parulanna_matta", "label": "Parulanna Maata",
  "composer_id": "tyagaraja", "raga_id": "kharaharapriya",
  "tala": "adi", "language": "telugu" }
```

These illustrate the alternating-repetition pattern: title, then type tag, then namespaced classification tags, then lifted fields, then the canonical JSON body.

---

## Consequences

### Positive

- **Filter ergonomics become predictable.** Anyone who learns the namespaces can guess the filter for a query. `[tag[Musician]tag[bani:ariyakudi]]` is mechanical, not creative.
- **The vocabulary is the schema.** No `READYOU.md` drift; no implicit conventions. The mapper enforces this ADR; this ADR is the source.
- **Round-trip is straightforward.** The body is canonical. Lifted fields are derived. The mapper has nothing to guess.
- **The corpus is browseable.** TW5's sidebar groups by tag; opening `Musician` shows every musician; opening `bani:ariyakudi` shows every Ariyakudi-bani musician.
- **External URLs are stable.** `#:Musician/ariyakudi_ramanuja_iyengar` is a permanent address. No renames, ever.

### Negative / accepted tradeoffs

- **Tag set grows.** Each new bani, era, instrument, raga, composer is a tag. Acceptable: TW5 indexes tags efficiently; the sidebar paginates.
- **Field duplication.** Lifted fields duplicate JSON body data. This is intentional (the body is the source, fields are the index).
- **Initial vocabulary overhead.** Contributors must learn the namespaces. Mitigated by `Atlas/Filters` (ADR-120) showing every namespace in use.

### Risks (and mitigations)

- **Vocabulary drift.** A new contributor invents `bani-ariyakudi` (hyphen) instead of `bani:ariyakudi` (colon). *Mitigated* by validator (ADR-119): tags violating the namespace pattern are rejected.
- **Title collisions.** `Raga/kharaharapriya` and `Mela/kharaharapriya` share the suffix; the type prefix prevents collision but two `Raga/kharaharapriya` files would. Librarian's existing ID-uniqueness rule covers this.
- **Mapper-spec divergence.** Future evolution of the vocabulary requires an ADR addendum. *Mitigated* by treating this ADR as the single source of truth and forbidding ad-hoc field additions in the mapper.

---

## Implementation

### Phase 0 — Acceptance

1. **Architect** (this ADR): authored.
2. **Librarian + Coder review**: do the namespaces match how the data is actually queried today? Any missing classification surface (e.g. `region:` for South vs North; `style:` for kalpita vs manodharma)?
3. **User**: marks `Accepted` once review converges.

### Phase 1 — Bind to ADR-119

4. The mapper (ADR-119) is implemented strictly against this vocabulary. The mapper has a single VOCABULARY constant that mirrors §1–§3.
5. The validator inside the mapper rejects any tag without the type-tag-then-namespaced-tag pattern, any field outside this ADR's lifted set, and any title not matching §1.

### Phase 2 — Bind to ADR-120

6. The filter atlas (ADR-120) uses only namespaces defined here. New namespaces require an addendum to this ADR before they can appear in the atlas.

### Phase 3 — Living document

7. As the corpus grows and new classifications surface (e.g. `gharana:` for Hindustani musicians per ADR-114), this ADR receives addenda — never silent edits. Each addendum cites the new namespace and the migration script (Coder's responsibility) that backfills it.

---

## Open questions

1. **`composer_id` vs `composer:` tag — both?** Yes: the field for sorting/grouping; the tag for filter joins. Both are derived from the same JSON-body field.
2. **Should `youtube[]` per-musician become individual `Recording/` tiddlers?** ADR-095 §6 raised this. Per ADR-117's "as many tiddlers as possible" principle, **yes**: each YouTube entry on a musician becomes one `Recording/<derived_id>` tiddler. The mapper is responsible for ID derivation; the round-trip reconstitutes the `youtube[]` array on the musician's JSON body.
3. **Do we need a `Bani/<id>` tiddler type?** Probably yes: bani is a first-class concept in the tradition, deserves its own page. The tag `bani:ariyakudi` is supplemented by a tiddler `Bani/ariyakudi` whose body describes the bani, links to its founder, lists adherents (computed by filter). To be addressed in an addendum once the vocabulary stabilises.
4. **Concert vs Recording cardinality.** A concert contains many recordings; the `Concert/<id>` tiddler should list its `Recording/<id>` children — likely a derived list via filter (`[tag[Recording]tag[concert:<id>]]`) rather than a stored array.
5. **Lecdem subjects.** A lecdem is *about* a raga (or composition or technique). The subject is a tag (`raga:<id>` or `composition:<id>`). Multi-subject lecdems get multiple tags.
6. **System tiddler set.** The exact list of `System/` tiddlers (schema version, sentinel, build metadata) is small but needs naming. Deferred to ADR-119 implementation.

---

## Closing note

A vocabulary is not a luxury; it is the contract that lets two pieces of code agree on the shape of a third thing they both touch. ADR-117 chose the deployment shape; this ADR chooses the words.

> *"What we cannot name, we cannot filter."*
