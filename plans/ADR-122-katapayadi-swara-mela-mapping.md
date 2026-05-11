# ADR-122: Katapayadi Swara → Mela Mapping Table & Validation Harness

**Status**: Accepted
**Date**: 2026-05-10
**Branch**: `feature/122-katapayadi-backfill`
**Depends on**: ADR-021 (melakarta first-class citizens)
**Enables**: ADR-123 (katapayadi-structured raga wheel), ADR-124 (light-up interaction)

---

## Context

The current `melakarta_new.json` (and the synced `graph.json`) records each of the 72 melakarta as a node with `melakarta` (number 1–72), `cakra` (1–12), and an `arohana` string buried in free-prose `notes`:

```
"notes": "1th melakarta; Cakra 1 (Indu); arohana: S R₁ G₁ M₁ P D₁ N₁ Ṡ"
```

Three forces collide:

1. **The katapayadi wheel is generative.** A mela's identity is *exactly* the tuple `(madhyama, ri, ga, da, ni)` — five binary/ternary choices that index uniquely into the 72-cell space (2 × 6 × 6 = 72, where the 6 is the upper-triangular ri-ga or da-ni pair count). The arohana string is a *display* of this tuple, not a substitute for it.
2. **The wheel UI cannot light up swaras it does not have.** ADR-123 proposes a wheel where clicking a raga illuminates its swara cells across four rings. That requires the tuple as structured data on every mela node — not as a substring of `notes`.
3. **The current data is not validated against the canonical wheel.** We have 59 of 72 melakarta entries; arohana strings are hand-written; nothing checks that mela 19 (`jhamkaradhvani`) actually has `(suddha, ri₁, ga₃, da₁, ni₁)` per the katapayadi formula. A wheel built on unverified data will *silently misteach* the relationship between names and swaras — the opposite of the goal.

Before any wheel rendering work, the data must exist, be complete (all 72), and be provably correct against the canonical formula.

---

## Pattern

**Strong Centres / Levels of Scale**: the swara tuple is the strong centre of every melakarta node. Everything else (name, cakra, arohana string, janyas, recordings) is a face of that centre. Promoting the tuple from prose to a structured field makes the centre legible to code and to the user simultaneously.

**Boundaries**: a validation harness is the boundary that separates "data we can render" from "data we cannot trust". The wheel work in ADR-123 must not begin until the boundary is crossed for all 72 entries.

---

## Decision

### Schema addition (per melakarta entry)

Add a `katapayadi` object to every node where `is_melakarta: true`:

**Before**:
```json
{
  "id": "kanakangi",
  "melakarta": 1,
  "cakra": 1,
  "is_melakarta": true,
  "notes": "1th melakarta; Cakra 1 (Indu); arohana: S R₁ G₁ M₁ P D₁ N₁ Ṡ"
}
```

**After**:
```json
{
  "id": "kanakangi",
  "melakarta": 1,
  "cakra": 1,
  "is_melakarta": true,
  "katapayadi": {
    "madhyama": 1,
    "ri": 1,
    "ga": 1,
    "da": 1,
    "ni": 1
  },
  "notes": "1th melakarta; Cakra 1 (Indu); arohana: S R₁ G₁ M₁ P D₁ N₁ Ṡ"
}
```

Field semantics (each value is the variant index, matching the subscripts in the reference image):

| Field      | Domain  | Meaning                                                     |
|------------|---------|-------------------------------------------------------------|
| `madhyama` | `1, 2`  | 1 = śuddha (M₁, melas 1–36), 2 = prati (M₂, melas 37–72)    |
| `ri`       | `1,2,3` | rishabha variant (R₁ śuddha, R₂ catuśruti, R₃ ṣaṭśruti)     |
| `ga`       | `1,2,3` | gandhara variant (G₁ śuddha, G₂ sādhāraṇa, G₃ antara)       |
| `da`       | `1,2,3` | dhaivata variant (D₁ śuddha, D₂ catuśruti, D₃ ṣaṭśruti)     |
| `ni`       | `1,2,3` | nishada variant (N₁ śuddha, N₂ kaiśika, N₃ kākalī)          |

Constraints (enforced by validation): `ga ≥ ri`, `ni ≥ da`, and `pa` is implicit (always present). Sa is implicit (always present).

### Derivation formula (the validation core)

Given a melakarta number `M` (1..72), the tuple is uniquely determined:

```python
def katapayadi_from_mela(M: int) -> dict:
    assert 1 <= M <= 72
    madhyama = 1 if M <= 36 else 2
    n = M if madhyama == 1 else M - 36     # 1..36 within hemisphere
    cakra_idx = (n - 1) // 6               # 0..5: 6 ri-ga pairs
    pos_in_cakra = (n - 1) % 6             # 0..5: 6 da-ni pairs

    # Upper-triangular index → (i, j) with i ≤ j, i,j in 1..3
    pairs = [(1,1), (1,2), (1,3), (2,2), (2,3), (3,3)]
    ri, ga = pairs[cakra_idx]
    da, ni = pairs[pos_in_cakra]
    return {"madhyama": madhyama, "ri": ri, "ga": ga, "da": da, "ni": ni}
```

This formula is the **single source of truth** for the tuple. Hand-curated values must equal `katapayadi_from_mela(M)` for every mela.

### Validation harness

A new check inside `python3 carnatic/cli.py validate` (Coder implements; Librarian runs):

1. Every `is_melakarta: true` node has a `katapayadi` object with all five integer fields in their declared domains.
2. `ga ≥ ri` and `ni ≥ da` for every mela.
3. The tuple equals `katapayadi_from_mela(node.melakarta)`.
4. The implied arohana derived from the tuple matches the parsed arohana in `notes` (substring or normalised equality).
5. All 72 melakarta numbers are present (catches the current 59/72 gap).

Validation must fail loudly if any mela disagrees with the canonical formula. The wheel will read this data verbatim; a silent disagreement here means the user is shown a wrong swara when they click a raga.

### Reverse index (derived, not stored)

A render-time helper inverts the formula:

```python
def mela_for_tuple(madhyama, ri, ga, da, ni) -> int   # → 1..72
```

Used by the wheel to answer "which mela owns this (ri-ga, da-ni) cell on this hemisphere?" — needed for ADR-124 click-on-cell behavior. Derived, never stored.

---

## Consequences

**Positive**

- The wheel becomes possible (ADR-123 unblocked).
- Janya ragas can later carry their own swara tuple (already have `parent_raga`, but variant-level overrides — e.g. anya swaras — would extend this same shape).
- A user-facing query "show all melas with antara gandhara (G₃)" becomes a one-line filter.
- The 13 missing melakarta entries (currently 59/72) are forced into the curation queue by validation.

**Negative**

- Schema bump: every consumer of `melakarta_new.json` and `graph.json` that introspects `notes` for swara info must migrate to `katapayadi`. We control all consumers, so impact is local.
- The arohana prose in `notes` becomes redundant for melas. Keep it for now (human readability); revisit in a follow-up.

**Neutral**

- `pa` is not stored because it is always present in melakarta. If a future ADR introduces janyas that omit pa (audava/ṣaḍava on pa), they will need a different schema; melakarta themselves do not.

---

## Implementation (delegated; not done in this ADR)

Sequenced work after ADR-122 is Accepted:

1. **Coder** — implement `katapayadi_from_mela` and `mela_for_tuple` in a new `carnatic/melakarta_math.py`; add the validation rules to `carnatic/cli.py validate`.
2. **Coder** — write a one-shot `carnatic/backfill_katapayadi.py` that reads each melakarta entry, computes the tuple from its `melakarta` number, and writes via `write_cli` (NOT a hand-edit). Idempotent.
3. **Librarian** — run the backfill, then `cli.py validate`, then add the missing 13 melakarta entries (each with `katapayadi` from the formula).
4. **Coder** — `bani-render`; confirm `graph.json` carries the new field.
5. **Git Fiend** — branch `data/backfill-katapayadi-tuples`, commit, push.

Only after step 5 does ADR-123 implementation begin.

---

## Open questions (logged for `.clinerules`)

- Do janya ragas inherit `katapayadi` from their parent_raga, or carry their own (potentially differing) swara set? Defer until ADR-123 reveals whether the wheel needs janya-level swara highlighting.
- Pratimadhyama tuple stores `madhyama: 2` but the M variant is implicit. If we ever introduce a hypothetical "third madhyama" (we won't), the field is ready.
