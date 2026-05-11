"""
melakarta_math.py — Katapayadi formula for the 72-melakarta system.

Single source of truth for the swara-tuple ↔ mela-number mapping.
All functions are pure / stateless.

Exported:
    katapayadi_from_mela(M: int) -> dict   -- mela number → swara tuple
    mela_for_tuple(madhyama, ri, ga, da, ni) -> int  -- swara tuple → mela number

Tuple field semantics
─────────────────────
  madhyama  1 = śuddha (M₁, melas 1–36)   2 = prati (M₂, melas 37–72)
  ri        1 = R₁ śuddha                  2 = R₂ catuśruti    3 = R₃ ṣaṭśruti
  ga        1 = G₁ śuddha                  2 = G₂ sādhāraṇa    3 = G₃ antara
  da        1 = D₁ śuddha                  2 = D₂ catuśruti    3 = D₃ ṣaṭśruti
  ni        1 = N₁ śuddha                  2 = N₂ kaiśika      3 = N₃ kākalī

Constraints enforced by formula (not by caller):
  ga >= ri  (upper-triangular ri-ga pair)
  ni >= da  (upper-triangular da-ni pair)
  pa is always present in melakarta (not stored)
  sa is always present in melakarta (not stored)
"""

from __future__ import annotations

# Upper-triangular pairs (i, j) with 1 ≤ i ≤ j ≤ 3, in enumeration order.
# Index 0..5 maps to (ri, ga) pairs for each cakra-slot, and (da, ni) pairs
# for each position-within-cakra slot.  The same 6-element sequence is reused
# for both axes.
_PAIRS: list[tuple[int, int]] = [
    (1, 1),  # index 0
    (1, 2),  # index 1
    (1, 3),  # index 2
    (2, 2),  # index 3
    (2, 3),  # index 4
    (3, 3),  # index 5
]

# Reverse map: (ri, ga) or (da, ni) → index 0..5
_PAIR_INDEX: dict[tuple[int, int], int] = {p: i for i, p in enumerate(_PAIRS)}


def katapayadi_from_mela(M: int) -> dict[str, int]:
    """Return the canonical swara tuple for melakarta number *M* (1..72).

    Raises ValueError for M outside 1..72.
    """
    if not (1 <= M <= 72):
        raise ValueError(f"Melakarta number must be 1..72, got {M!r}")

    madhyama = 1 if M <= 36 else 2
    n = M if madhyama == 1 else M - 36        # 1..36 within hemisphere

    cakra_idx     = (n - 1) // 6              # 0..5: selects ri-ga pair
    pos_in_cakra  = (n - 1) %  6              # 0..5: selects da-ni pair

    ri, ga = _PAIRS[cakra_idx]
    da, ni = _PAIRS[pos_in_cakra]

    return {"madhyama": madhyama, "ri": ri, "ga": ga, "da": da, "ni": ni}


def mela_for_tuple(
    madhyama: int,
    ri: int,
    ga: int,
    da: int,
    ni: int,
) -> int:
    """Return the melakarta number (1..72) for the given swara tuple.

    Raises ValueError if the tuple is outside its defined domain or violates
    the ga ≥ ri / ni ≥ da constraints.
    """
    if madhyama not in (1, 2):
        raise ValueError(f"madhyama must be 1 or 2, got {madhyama!r}")
    for name, val in (("ri", ri), ("ga", ga), ("da", da), ("ni", ni)):
        if val not in (1, 2, 3):
            raise ValueError(f"{name} must be 1, 2, or 3, got {val!r}")
    if ga < ri:
        raise ValueError(f"ga ({ga}) must be ≥ ri ({ri})")
    if ni < da:
        raise ValueError(f"ni ({ni}) must be ≥ da ({da})")

    cakra_idx    = _PAIR_INDEX[(ri, ga)]
    pos_in_cakra = _PAIR_INDEX[(da, ni)]

    n = cakra_idx * 6 + pos_in_cakra + 1      # 1..36 within hemisphere
    return n if madhyama == 1 else n + 36
