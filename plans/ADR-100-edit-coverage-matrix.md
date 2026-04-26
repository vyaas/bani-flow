# ADR-100: Edit Coverage Matrix

**Status**: Implemented — Track B shipped (ADR-108 musician add/edit, ADR-109 musician-as-composer, ADR-111 bottom bar retired)
**Date**: 2026-04-26
**Agents**: graph-architect (maintainer)
**Depends on**: ADR-085 (curation loop), ADR-097 (unified Edit form), ADR-103 (co-located edit affordances)
**Constituents**: ADR-104, ADR-105, ADR-106, ADR-107, ADR-082 (lecdems, shipped), ADR-101 (timestamped segments, shipped), ADR-108 (musician add/edit), ADR-109 (musician-as-composer composition entry), ADR-111 (bottom bar retirement)

---

## Purpose

This ADR is the living matrix of *which entity types have which edit affordances and where they live*. ADR-103 deprecates the global edit bar; the bar's eventual removal is gated on every cell in the matrix below being green via a co-located trigger.

This file is updated by the Architect every time a new edit affordance ships or a new entity type is added.

---

## Matrix

| Entity type | Create (co-located trigger) | Edit fields (co-located trigger) | Append arrays (co-located trigger) | Notes (co-located trigger) | Global bar (deprecated fallback) |
|---|---|---|---|---|---|
| **Musician** | ✓ ADR-108 (`+` on musician panel header) | ✓ ADR-108 (`✎` chip rewired, `buildAddMusicianForm`) | pending ADR-097 Phase C | pending ADR-097 Phase C | removed (ADR-111) |
| **Raga (janya)** | ✓ ADR-106 (`+` on melakarta panel) | ✓ ADR-104 (`✎` stub, Track A) | pending ADR-097 Phase C | pending ADR-097 Phase C | removed (ADR-111) |
| **Raga (melakarta)** | seeded; not user-creatable | ✓ ADR-104 (`✎` stub, Track A) | pending ADR-097 Phase C | pending ADR-097 Phase C | removed (ADR-111) |
| **Composition** | ✓ ADR-105 (`+` on composer panel); ✓ ADR-109 (`+` on musician panel, auto-creates companion composer) | ✓ ADR-104 (`✎` stub, Track A) | pending ADR-097 Phase C | pending ADR-097 Phase C | removed (ADR-111) |
| **Composer** | ✓ ADR-109 (auto-created companion record via musician-as-composer path) | ✓ ADR-104 (`✎` stub, Track A) | pending ADR-097 Phase C | pending ADR-097 Phase C | removed (ADR-111) |
| **Recording (concert)** | ✓ ADR-107 (`+` on musician panel) | (file-shaped, not field-patched) | ADR-101 (segment add on recording panel) | ADR-104-style (via Edit form, future) | removed (ADR-111) |
| **Lecdem (youtube entry)** | ADR-082 (`+` on musician panel) | ADR-082 (segment add inline) | ADR-082 (segment add inline) | ADR-082 (via Edit form, future) | removed (ADR-111) |
| **Edge (guru-shishya)** | ADR-031 (musician form sub-section) | ADR-104 (via Edit form, when picker supports edges) | — | — | removed (ADR-111) |

\* Musician and composer create paths are intentionally contributor-discretion (Wikipedia URL required, significance check). ADR-108 adds the musician `+` chip; ADR-109 adds the auto-create companion composer path from a musician panel. The global bar has been fully retired (ADR-111).

---

## Removal gate for the global edit bar

**Gate cleared.** ADR-111 removed the bottom bar in Track B. All entity types now have at least one co-located create path. The removal gate conditions were met:

1. Every entity type has at least one create path via a co-located trigger (musician via ADR-108; composer via ADR-109).
2. ADR-104 header `✎` has shipped for all field-patchable entity types.
3. `#bundle-download-btn` relocated to `#header` (ADR-111).

The global bar is gone. Future append/notes affordances (ADR-097 Phase C) will be added as co-located chips.

---

## Maintenance

When a new ADR adds or changes an edit affordance:

1. Add or update the relevant cell in the matrix.
2. Cite the new ADR in the *Constituents* line.
3. Update the *Status* line if the matrix changes character (e.g., from "Proposed" to "Accepted" once all of ADRs 104–107 are accepted; to "Implemented" once they ship).

This ADR is intentionally short. Its job is to be a referenceable index, not a narrative.
