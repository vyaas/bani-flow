# ADR-119: BaniWiki bidirectional mapper — `data/**` ↔ `tiddlers/` as pure functions

**Status**: Proposed
**Date**: 2026-05-08
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-016 (writer validation), ADR-085 (self-replicating loop), ADR-095 (BaniWiki exploration), ADR-117 (Node deployment), ADR-118 (vocabulary)
**Companion ADRs**: ADR-120 (filter atlas), ADR-121 (phase-out)

---

## Context

ADR-117 fixes the deployment shape (one tiddler = one file). ADR-118 fixes the vocabulary (titles, tags, fields, body discipline). This ADR fixes the **mechanism** that translates between Bani Flow's existing per-entity JSON and the BaniWiki tiddler tree — and, equally important, the inverse mechanism that translates back.

The user has stated the constitutional constraint twice:

> *"Everything needs to be function based i.e. we don't want any surgical changes to schema: there must be scripts that map us back and forth between the two lands (ours and tiddlywiki). Eventually we phase our land out."*

This rules out three approaches that would otherwise be tempting:

1. **Hand-edit the tiddler tree.** Forbidden: drift from `data/**` becomes irrecoverable, the round-trip breaks silently, and the Librarian's commit discipline (per-entity, sourced, validated) is bypassed.
2. **Mutate `data/**` schema to match a TW-friendlier shape.** Forbidden: this is exactly the "surgical schema change" the user is rejecting. The mapper accommodates the existing schema; the schema does not bend to the mapper.
3. **Cache the tiddler tree as a side-effect of `bani-render`.** Forbidden: tiddlers are not a derived view of `graph.html`; they are a peer projection of `data/**`. Coupling them to the render pipeline conflates two unrelated outputs.

The mapper must therefore be:

- **Pure**: `forward(data) -> tiddlers` and `inverse(tiddlers) -> data` are functions, not procedures with state.
- **Total**: every entity in `data/**` produces exactly one tiddler set; every tiddler reconstructs exactly one entity.
- **Lossless**: `inverse(forward(data)) == data` byte-for-byte (modulo deterministic key order and whitespace normalisation).
- **Validated at the boundary**: the mapper is the single point where ADR-118's vocabulary is enforced. The TW5 server is not a validator; it accepts anything written to `tiddlers/`. So the mapper's writes must be self-consistent, and an inverse-then-forward round-trip must be the integrity test.
- **Independent of the render pipeline**: `bani-render` and `bani-wiki-build` produce two artefacts from the same source. Neither depends on the other.

### Forces

| Force | Direction |
|---|---|
| **Single point of vocabulary enforcement** | The mapper is the only code that knows ADR-118. Every other piece of BaniWiki (the filter atlas, the entry forms, the validators inside the wiki) consumes tiddlers in their post-mapper shape. |
| **Stateless transforms** | `forward` and `inverse` take inputs in, return outputs out, no globals, no caches, no I/O outside the CLI boundary. (The Coder discipline, ADR-085 §4.) |
| **Round-trip is the integrity test** | There is no separate test suite that validates the vocabulary; the round-trip's success *is* the validation. If a tiddler the mapper produces cannot be inverse-mapped back to the original JSON, the mapper is wrong. |
| **Two-way authoring during exploration** | A contributor may author inside BaniWiki (creating new tiddler files) or inside `data/**` (the Librarian's existing flow). Either flow's output round-trips through the mapper. The mapper must therefore handle the inverse direction with the same rigour as the forward direction. |
| **Determinism** | The same `data/**` always produces the same `tiddlers/` (byte-identical). The same `tiddlers/` always produces the same `data/**`. This is what makes git diffs meaningful and CI-checkable. |
| **No coupling to the render pipeline** | `bani-render` continues to produce `graph.html` from `data/**`. The mapper produces `tiddlers/` from `data/**`. The two outputs are siblings, not parent/child. |
| **Single mapper, multiple write surfaces** | ADR-115 entry forms, ADR-083 bundle, future BaniWiki entry widgets all eventually flow through the same forward mapper. The forward function is the choke point that guarantees vocabulary compliance. |

---

## Pattern

**Christopher Alexander, Property 11, *Roughness*.** A pure-function mapper is naturally rough at the edges where it meets the file system. The mapper's *core* is a clean transform; its *edges* (CLI, file I/O) tolerate the messiness of the world. The pattern says: do not pretend the world is clean, but keep your interior clean. The mapper's interior — `forward` and `inverse` — is composed of tiny pure transforms (`musician_to_tiddler`, `tiddler_to_musician`, etc.). The exterior (`bani-wiki-build`, `bani-wiki-roundtrip`) handles the file system.

**Pattern 159, *Light on Two Sides of Every Room*.** A room with windows on only one side is dim. A mapper with only the forward direction is half-blind: it can populate BaniWiki but cannot accept contributions from it. The bidirectional mapper lights both sides — `data/**` can write to BaniWiki *and* BaniWiki can write to `data/**`. Authoring happens on whichever side the contributor prefers; the mapper makes the other side current.

**ADR-016 lives on.** ADR-016 named `writer.py` as the single source of truth for validation. The mapper inherits this principle: validation lives at the mapper boundary, not scattered across consumers. The forward mapper invokes existing `writer.py` validators; the inverse mapper invokes them again before writing back to `data/**`.

**Convergence with ADR-083.** ADR-083 named the bundle as the canonical write channel. The mapper is the bundle's TW-shaped sibling: a deterministic transform that produces a complete, validated artefact rather than a sequence of mutations. A bundle ingestion plus a forward map should produce the same `tiddlers/` whether you ingest then map, or map then ingest.

---

## Decision

**Implement BaniWiki's mapper as a pair of pure functions, packaged in `carnatic/baniwiki/`, exposed via console scripts, and integrated with the existing validators.** The mapper is the only code that knows ADR-118's vocabulary.

### 1 — Package layout

```
carnatic/baniwiki/
  __init__.py
  forward.py         # data/** -> tiddler dicts
  inverse.py         # tiddler dicts -> data/** entity dicts
  serialize.py       # tiddler dict <-> .tid file content (TW5 .tid format)
  filesystem.py      # file I/O boundary (read data/**, write tiddlers/, and inverse)
  validate.py        # vocabulary enforcement (ADR-118 spec as code)
  cli.py             # entry points
  vocabulary.py      # constants from ADR-118 lifted into Python (single source-of-truth import)
  tests/
    test_round_trip.py
    test_vocabulary.py
    test_serialize.py
```

**`vocabulary.py` is generated from ADR-118**, not hand-written. A small extractor reads the ADR's tables and emits the constants. This guarantees the spec and the code never drift. (If extraction is too brittle, the alternative is hand-maintained `vocabulary.py` with a doctest that fails CI when ADR-118 changes; the architect prefers the extractor.)

### 2 — Forward function

```
def forward(data: BaniData) -> List[Tiddler]:
    """Pure: data/** snapshot -> list of tiddler dicts."""
```

`BaniData` is the in-memory representation of `data/**` already used by `graph_builder.py` (load once at the boundary; pass into pure transforms).

`Tiddler` is a `TypedDict` matching ADR-118 §1–§4: `{title: str, tags: List[str], type: str, text: str, fields: Dict[str, str]}`.

`forward` is composed of one transform per entity type:

```
musician_to_tiddler(musician) -> Tiddler
raga_to_tiddler(raga) -> Tiddler
mela_to_tiddler(raga) -> Tiddler                # if mela
composition_to_tiddler(composition) -> Tiddler
recording_to_tiddler(recording) -> Tiddler
concert_to_tiddler(concert) -> Tiddler
lecdem_to_tiddler(lecdem) -> Tiddler
tala_to_tiddler(tala) -> Tiddler
adr_to_tiddler(adr_path) -> Tiddler
doc_to_tiddler(doc_path) -> Tiddler
youtube_entry_to_recording_tiddler(musician_id, entry, index) -> Tiddler
                                  # ADR-118 §6 OQ#2: each youtube[] entry becomes its own Recording
```

Each is a pure function. None reads the file system. None invokes the validator (validation runs over the *output* of `forward`, not inside each transform).

### 3 — Inverse function

```
def inverse(tiddlers: List[Tiddler]) -> BaniData:
    """Pure: list of tiddlers -> data/** snapshot."""
```

Symmetric one-per-type structure:

```
tiddler_to_musician(tiddler) -> Musician
tiddler_to_raga(tiddler) -> Raga
tiddler_to_composition(tiddler) -> Composition
tiddler_to_recording(tiddler) -> Recording                  # for top-level Recording tiddlers
tiddler_to_youtube_entry(tiddler) -> (musician_id, YouTubeEntry, index)
                                  # for Recording tiddlers derived from a musician's youtube[]
...
```

The inverse re-aggregates `youtube[]` entries onto their parent musician by reading the `performer:` tag (ADR-118 §2) and the `concert:` / `composer:` / `raga:` cross-tags. The aggregation is deterministic: index order from the tiddler's `youtube_index` field (a small reserved field per ADR-118 addendum to be added during implementation).

### 4 — The integrity test (the heart of this ADR)

```
def round_trip_check(data: BaniData) -> RoundTripReport:
    tiddlers = forward(data)
    reconstructed = inverse(tiddlers)
    return diff(data, reconstructed)
```

**Acceptance**: the diff is empty modulo (a) deterministic JSON key ordering (alphabetical by key), (b) whitespace normalisation (canonical 2-space indent), (c) trailing newline normalisation. Anything else is a mapper bug.

This check runs:
- in `carnatic/baniwiki/tests/test_round_trip.py` (CI gate),
- as the `bani-wiki-validate` CLI verb,
- in the GitHub Actions workflow as part of the deploy gate (ADR-117 §6).

**Round-trip success on the full corpus is the only acceptance signal for the mapper.** No partial-corpus tests are sufficient; we run it on every musician, every raga, every composition, every recording, every lecdem, every ADR.

### 5 — `.tid` serialisation

The `.tid` file format is TiddlyWiki's documented per-tiddler text format: a header block of `key: value` lines, a blank line, then the body. ASCII-clean, line-stable, git-friendly.

`serialize.py` provides `tiddler_to_tid(tiddler) -> str` and `tid_to_tiddler(text) -> tiddler`. Both are pure. Both are tested with golden files under `tests/golden/`.

JSON-bodied tiddlers store the JSON in the body verbatim (pretty-printed with deterministic key order). Markdown-bodied tiddlers store the markdown verbatim.

### 6 — CLI entry points

| Console script | Function |
|---|---|
| `bani-wiki-build` | (a) load `data/**`, (b) `forward`, (c) write `baniwiki/tiddlers/`, (d) invoke `tiddlywiki baniwiki/ --build index` for the single-file artefact |
| `bani-wiki-roundtrip` | (a) read `baniwiki/tiddlers/`, (b) `inverse`, (c) write `data/**` (or to a staging dir for diff inspection if `--dry-run`) |
| `bani-wiki-validate` | round-trip check; non-zero exit on diff. CI uses this. |
| `bani-wiki-diff` | human-readable diff of `forward(data)` vs current on-disk `tiddlers/` (debugging aid) |

`bani-wiki-serve` is from ADR-117; it does not invoke the mapper. It serves whatever is in `tiddlers/`.

### 7 — Validator integration

`carnatic/writer.py` already validates `data/**` writes (ADR-016). The mapper:

- Calls existing `writer.py` validators on the *input* of `forward` (assert `data/**` is valid before mapping).
- Defines new vocabulary validators in `validate.py` that run on the *output* of `forward` (assert tiddlers comply with ADR-118).
- Calls existing `writer.py` validators on the *output* of `inverse` (assert reconstructed `data/**` is valid before writing back).

A single failure at any of these three points is a hard error. The mapper is conservative: it never produces tiddlers that are invalid per ADR-118, nor `data/**` files that are invalid per `writer.py`.

### 8 — Two-way authoring protocol (during exploration)

While `data/**` remains canonical (until ADR-121 flips it):

- **Authoring on `data/**`** (the Librarian's existing flow): `add-musician`, `add-edge`, `add-youtube`, etc. → write `data/**` → `bani-wiki-build` regenerates `tiddlers/`.
- **Authoring on BaniWiki** (in-browser editor against the Node server): contributor saves a tiddler → file lands in `tiddlers/` → contributor runs `bani-wiki-roundtrip` → `data/**` is updated → contributor commits the *`data/**`* changes (the `tiddlers/` changes are gitignored during exploration per ADR-117 §1).

The discipline: **always commit the canonical side, regenerate the other.** During exploration, canonical is `data/**`; after ADR-121, canonical flips.

### 9 — Acceptance criteria

The mapper is **complete** when:

1. `bani-wiki-validate` exits 0 on the current corpus.
2. Adding any musician via `bani-add` and re-running `bani-wiki-build` produces exactly one new `tiddlers/Musician/<id>.tid` file plus zero or more `tiddlers/Recording/<derived_id>.tid` files (for `youtube[]` entries), with no other diffs.
3. Editing one musician's `label` field in the in-browser editor and running `bani-wiki-roundtrip` updates exactly that one musician's JSON file, with no other diffs.
4. The mapper has zero global state; `forward` and `inverse` are unit-testable in isolation.
5. CI runs `bani-wiki-validate` on every push and fails red if the round-trip is not lossless.

---

## Consequences

### Positive

- **Schema is never altered to please the projection.** The user's constitutional constraint is honoured: `data/**` schema is the input; the mapper bends to it.
- **Two write surfaces, one validator path.** Whether the contribution comes through `bani-add` (Librarian) or through the in-browser TW editor (BaniWiki), the same `writer.py` rules and the same ADR-118 vocabulary apply.
- **CI gates losslessness.** The round-trip check is the strongest possible test: if it passes on the full corpus, every entity is faithfully representable both ways.
- **The mapper is the only place vocabulary lives in code.** ADR-118 is the spec; `vocabulary.py` is the spec lifted; the mapper is the spec applied. No drift.
- **The render pipeline is untouched.** `bani-render` continues to do its job. The mapper is a sibling, not a successor.

### Negative / accepted tradeoffs

- **Two write paths during exploration.** Authoring on either side requires regenerating the other. Mitigated by `bani-wiki-build` and `bani-wiki-roundtrip` being one-command operations and by `git status` immediately surfacing what changed.
- **Round-trip overhead.** For 6,000 tiddlers, the round-trip is a few seconds. Acceptable for CI; not a hot-loop operation.
- **The vocabulary becomes load-bearing.** A change to ADR-118 ripples through the mapper. This is by design (single source of truth) but means ADR-118 changes are weighty.

### Risks (and mitigations)

- **Inverse-mapper edge cases.** A `Recording/<id>` tiddler that was in `data/**` as a top-level recording vs one that was an entry in a musician's `youtube[]` array: the inverse must distinguish them. *Mitigated* by storing a reserved `origin` field on the tiddler (`origin: youtube_array` vs `origin: top_level`) — added to the ADR-118 vocabulary as part of implementation.
- **Validator divergence.** `writer.py` and `validate.py` could drift. *Mitigated* by `validate.py` importing primitives from `writer.py` rather than re-implementing.
- **Performance regression as the corpus grows.** Profile early (acceptance criterion 5 surfaces it). At 50k+ tiddlers, may need streaming serialisation.
- **The TW5 server writes a tiddler that the inverse cannot reconstruct.** E.g. a contributor creates a tiddler with the wrong tag namespace. *Mitigated* by a server-side hook (TW5 supports `$:/config/...` validators) that rejects such writes; or by `bani-wiki-roundtrip --strict` failing fast.

---

## Implementation

### Phase 0 — Acceptance

1. **Architect** (this ADR): authored.
2. **Coder review**: confirm package layout, confirm `vocabulary.py` extraction strategy, confirm CI integration plan.
3. **User**: marks `Accepted`.

### Phase 1 — Skeleton (Coder)

4. Create `carnatic/baniwiki/` package with module skeletons and `vocabulary.py` populated from ADR-118 §1–§3.
5. Implement `serialize.py` with golden-file tests.
6. Implement one round-trip path end-to-end (musician only) and prove the integrity test passes for that one type.

### Phase 2 — Type-by-type forward and inverse (Coder)

7. Implement each `*_to_tiddler` and `tiddler_to_*` pair, type by type, with a round-trip test per type.
8. Special-case `youtube[]`-derived `Recording/` tiddlers (ADR-118 §6 OQ#2).
9. Cover ADRs and Doc tiddlers last (markdown body, simpler shape).

### Phase 3 — CLI integration (Coder)

10. Wire `bani-wiki-build`, `bani-wiki-roundtrip`, `bani-wiki-validate`, `bani-wiki-diff` in `pyproject.toml`.
11. Wire validator chain (`writer.py` → `validate.py` → `writer.py`) into `bani-wiki-build` and `bani-wiki-roundtrip`.

### Phase 4 — CI gate (Coder)

12. Add `bani-wiki-validate` to the GitHub Actions deploy workflow as a hard gate.
13. Add a workflow that on PR comments the round-trip diff for human inspection (helpful when a Librarian PR causes an unexpected mapper-detectable change).

### Phase 5 — Two-way authoring smoke test (Librarian + Coder)

14. Librarian adds one musician via `bani-add`; Coder re-runs `bani-wiki-build`; tiddler appears.
15. Librarian edits the same musician via in-browser TW editor; Coder runs `bani-wiki-roundtrip`; `data/musicians/<id>.json` updates with the edit, and `git diff` shows exactly the expected change.

---

## Open questions

1. **`vocabulary.py` extraction vs. hand-maintenance.** Architect prefers extraction from the ADR markdown; Coder may push back if the parsing is fragile. Decision deferred to Phase 1 review.
2. **Markdown rendering inside TW5.** The markdown plugin must be enabled in `tiddlywiki.info` (ADR-117 §1). Confirm it handles ADR markdown (tables, headings, code blocks) without modification. If not, fall back to wikitext conversion at mapper time.
3. **Tiddler creation/modification timestamps.** TW5 maintains `created` and `modified` automatically on save. The mapper should preserve these on round-trip; if absent in `data/**`, the mapper synthesises them from git history (slow) or from file mtime (fast but lossy on fresh checkouts). Coder choice.
4. **Concurrent in-browser writes during a `bani-wiki-build`.** Race condition: the build writes `tiddlers/` while the server is reading them. *Mitigation*: build to a staging dir, atomic rename. Or, simpler: stop the server during build. Decision deferred.
5. **Schema version sentinel.** A `System/SchemaVersion` tiddler whose `version` field tracks the mapper's expectation of `data/**`. The mapper refuses to roundtrip if the sentinel does not match. Where the version number lives in `data/**` (a top-level `data/SCHEMA_VERSION` file?) is open.
6. **Should `Atlas/Filters` be generated by the mapper or hand-maintained?** ADR-120 will decide; if generated, the mapper is its source.

---

## Closing note

The mapper is where the user's constitutional principle becomes code: **functions, not surgery**. ADR-118 names the words; this ADR names the verbs. Forward and inverse — the only two verbs the projection layer needs.

> *"The data is the crucial part. Everything else can be rebuilt — including, in time, the bridge to TiddlyWiki."*
