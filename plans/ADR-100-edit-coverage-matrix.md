# ADR-100: Edit Coverage Matrix

**Status**: Proposed (index)
**Date**: 2026-04-26
**Agents**: graph-architect (maintainer)
**Depends on**: ADR-085 (curation loop), ADR-097 (unified Edit form), ADR-103 (co-located edit affordances)
**Constituents**: ADR-104, ADR-105, ADR-106, ADR-107, ADR-082 (lecdems, shipped), ADR-101 (timestamped segments, shipped)

---

## Purpose

This ADR is the living matrix of *which entity types have which edit affordances and where they live*. ADR-103 deprecates the global edit bar; the bar's eventual removal is gated on every cell in the matrix below being green via a co-located trigger.

This file is updated by the Architect every time a new edit affordance ships or a new entity type is added.

---

## Matrix

| Entity type | Create (co-located trigger) | Edit fields (co-located trigger) | Append arrays (co-located trigger) | Notes (co-located trigger) | Global bar (deprecated fallback) |
|---|---|---|---|---|---|
| **Musician** | global launcher only* | ADR-104 (`✎` on header) | ADR-104 (via Edit form) | ADR-104 (via Edit form) | ✓ |
| **Raga (janya)** | ADR-106 (`+` on melakarta panel) | ADR-104 (`✎` on header) | ADR-104 (via Edit form) | ADR-104 (via Edit form) | ✓ |
| **Raga (melakarta)** | seeded; not user-creatable | ADR-104 (`✎` on header) | ADR-104 (via Edit form) | ADR-104 (via Edit form) | ✓ |
| **Composition** | ADR-105 (`+` on composer panel) | ADR-104 (`✎` on header) | ADR-104 (via Edit form) | ADR-104 (via Edit form) | ✓ |
| **Composer** | global launcher only* | ADR-104 (`✎` on header) | ADR-104 (via Edit form) | ADR-104 (via Edit form) | ✓ |
| **Recording (concert)** | ADR-107 (`+` on musician panel) | (file-shaped, not field-patched) | ADR-101 (segment add on recording panel) | ADR-104-style (via Edit form, future) | ✓ |
| **Lecdem (youtube entry)** | ADR-082 (`+` on musician panel) | ADR-082 (segment add inline) | ADR-082 (segment add inline) | ADR-082 (via Edit form, future) | ✓ |
| **Edge (guru-shishya)** | ADR-031 (musician form sub-section) | ADR-104 (via Edit form, when picker supports edges) | — | — | ✓ |

\* Musicians and composers do not yet have a parent-mediated entry path because their hard rule (Wikipedia URL required, significance check) is contributor-discretion, not parent-of relationship. The global launcher remains their entry surface for now. A future ADR may add `+` triggers from search-empty states or a "missing musician" tutorial.

---

## Removal gate for the global edit bar

The global launcher (the bottom edit bar, ADR-103 §3) is removable when:

1. Every entity type has at least one create path that is **not** the global bar — OR — the entity type is one of the two exceptions (musician, composer) above with explicit ADR justification.
2. ADR-104 (header `✎`) has shipped for all four field-patchable entity types.
3. A fresh-clone smoke test confirms an end-to-end loop run for each entity type using only co-located triggers.

The removal itself is a future ADR. Until then, the bar persists in its demoted form.

---

## Maintenance

When a new ADR adds or changes an edit affordance:

1. Add or update the relevant cell in the matrix.
2. Cite the new ADR in the *Constituents* line.
3. Update the *Status* line if the matrix changes character (e.g., from "Proposed" to "Accepted" once all of ADRs 104–107 are accepted; to "Implemented" once they ship).

This ADR is intentionally short. Its job is to be a referenceable index, not a narrative.
