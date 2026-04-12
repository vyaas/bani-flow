# ADR-017 — Phonetic Search and Transliteration Normalisation

**Status:** Proposed  
**Author:** Librarian (raised 2026-04-12)  
**Scope:** Search UX, composition/raga ID lookup, tracklist ingestion

---

## Context

During ingestion of the GNB AIR 1960 concert, the following spelling variants were encountered for the same musical entities:

| Tracklist spelling | Canonical ID | Canonical name |
|---|---|---|
| `Chakravaham` | `chakravakam` | Chakravakam |
| `Purvikalyani` | `poorvikalyani` | Poorvikalyani |
| `Ee Vasudha` | `ee_vasudha_sahana` | Ee Vasudha (Sahana) |
| `Yee Vasudha` | `yee_vasudha` | Yee Vasudha (Kanada) |

This is not an edge case. Carnatic music names are transliterated from Tamil, Telugu, Kannada, and Sanskrit into English with no single standard. The same raga appears as:

- **Thodi / Todi / Shubhapantuvarali** (already aliased)
- **Chakravakam / Chakravaham / Chakravaka**
- **Poorvikalyani / Purvikalyani / Poorvi Kalyani**
- **Sahana / Sahanaa**

The deeper problem is phonetic: Carnatic music has a rich tradition of phonetically precise notation (e.g. the Madras Music Academy's romanisation, or the ISO 15919 standard), but concert programmes, YouTube tracklists, and Wikipedia all use inconsistent romanisations. A rasika searching for `alai pAyudE kaNNA en manam migha alai pAyudE / un Ananda mOhana vEnugAnamadil` (using the capitalisation convention for long vowels and retroflex consonants) will not find it by typing `Alai Payude`.

---

## Problem statement

1. **Ingestion friction**: Every new tracklist requires manual spelling-variant resolution before `composition-exists` and `raga-exists` checks can succeed. This is error-prone and slow.
2. **Search UX**: The graph's search box does exact or substring matching. A user typing `Chakravaham` will not find `chakravakam`. A user typing `poorvi` will not find `Poorvikalyani` if they spell it `purvi`.
3. **ID permanence vs. alias flexibility**: IDs are permanent snake_case (correct). But the `aliases` field on ragas is currently a flat list with no phonetic normalisation — it helps humans reading JSON but does not power search.
4. **Composition titles**: Compositions have no `aliases` field at all. `Ee Vasudha` and `Yee Vasudha` are genuinely different compositions, but `Ee Vasudha` and `E Vasudha` are the same.

---

## Proposed decisions

### D1 — Aliases are mandatory for all ragas with known spelling variants
Every raga entry in `compositions.json` must carry an `aliases` array covering all attested English spellings found in concert programmes, Wikipedia, and karnatik.com. The Librarian is responsible for populating this on ingestion.

### D2 — Add `aliases` field to compositions
Extend the `compositions[]` schema with an optional `aliases` array (same semantics as raga aliases). This allows `composition-exists` to match on alternate spellings without creating duplicate IDs.

### D3 — Phonetic folding in CLI lookup
`cli.py` `raga-exists` and `composition-exists` should fold the query through a simple normalisation function before matching:
- Lowercase
- Strip diacritics (ā → a, ī → i, ū → u, ṭ → t, ṇ → n, ḷ → l, etc.)
- Collapse doubled vowels (aa → a, ee → e, oo → o)
- Strip spaces and hyphens

This would allow `raga-exists "Chakravaham"` to match `chakravakam` without requiring an alias entry.

### D4 — ISO 15919 / Madras Music Academy romanisation as a future `phonetic_id` field
For the long term, consider adding a `phonetic_id` field to ragas and compositions using a consistent romanisation scheme (e.g. `alai_pAyudE` using the capitalisation convention for long vowels). This would enable:
- Precise search by musicians who know the notation
- Deduplication of ingestion variants
- Cross-linking to notation databases (Karnatik.com uses this convention)

This is a schema change and requires a separate ADR when the Carnatic Coder implements it.

---

## Consequences

- **Librarian**: Must populate `aliases` on all new raga and composition entries. Retroactive audit of existing 88 ragas and 139 compositions for missing aliases is a future task.
- **Carnatic Coder**: Implement phonetic folding in `cli.py` lookup functions (D3). Extend `compositions[]` schema with `aliases` (D2). Both are non-breaking changes.
- **Graph Architect**: D4 (`phonetic_id`) requires a schema ADR before implementation.

---

## References

- GNB AIR 1960 tracklist ingestion (this session, 2026-04-12)
- Karnatik.com romanisation convention: capitalised vowels = long (A, I, U, E, O); capitalised consonants = retroflex (T, N, L, etc.)
- ISO 15919: *Transliteration of Devanagari and related Indic scripts into Latin characters* (2001)
- Madras Music Academy notation standard (used in published kriti collections)
