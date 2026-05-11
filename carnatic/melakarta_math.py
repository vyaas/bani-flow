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


# ---------------------------------------------------------------------------
# ADR-123 ring-index helpers
# These are used by both the Python pre-render geometric correctness check
# and (via the injected graphData) the JS katapayadi wheel renderer.
# All functions accept a mela number M (1..72) or the direct pair values,
# and return 0-based indices into the visual ring structure.
# ---------------------------------------------------------------------------

def mela_to_cakra_wedge_index(M: int) -> int:
    """Return the cakra wedge index (0..11) for mela M (1..72).

    Cakras 0..5 are in the śuddha madhyama hemisphere (melas 1–36);
    cakras 6..11 are in the prati madhyama hemisphere (melas 37–72).
    Each cakra spans 6 consecutive melas.
    """
    if not (1 <= M <= 72):
        raise ValueError(f"Melakarta number must be 1..72, got {M!r}")
    madhyama = 1 if M <= 36 else 2
    n = M if madhyama == 1 else M - 36         # 1..36 within hemisphere
    cakra_within_hemisphere = (n - 1) // 6    # 0..5
    return cakra_within_hemisphere if madhyama == 1 else cakra_within_hemisphere + 6


def riga_pair_index(ri: int, ga: int) -> int:
    """Return the (ri, ga) pair index (0..5) for the given swara values.

    The index follows the upper-triangular enumeration order:
    (1,1)→0, (1,2)→1, (1,3)→2, (2,2)→3, (2,3)→4, (3,3)→5.
    """
    if (ri, ga) not in _PAIR_INDEX:
        raise ValueError(f"Invalid or non-upper-triangular (ri, ga) pair: ({ri}, {ga})")
    return _PAIR_INDEX[(ri, ga)]


def dani_pair_index(da: int, ni: int) -> int:
    """Return the (da, ni) pair index (0..5) for the given swara values.

    Same upper-triangular enumeration as riga_pair_index.
    """
    if (da, ni) not in _PAIR_INDEX:
        raise ValueError(f"Invalid or non-upper-triangular (da, ni) pair: ({da}, {ni})")
    return _PAIR_INDEX[(da, ni)]


def cakra_to_riga(cakra_wedge_index: int) -> int:
    """Return the (ri, ga) pair index (0..5) expected for a given cakra wedge (0..11).

    Within each madhyama hemisphere, the 6 cakras cycle through (ri, ga) pairs 0..5.
    Cakra 0 and 6 both map to pair 0; cakra 1 and 7 both map to pair 1; etc.
    """
    if not (0 <= cakra_wedge_index <= 11):
        raise ValueError(f"cakra_wedge_index must be 0..11, got {cakra_wedge_index!r}")
    return cakra_wedge_index % 6


def cakra_position(M: int) -> int:
    """Return the position-within-cakra index (0..5) for mela M.

    This equals the (da, ni) pair index for the mela. Position 0 in any cakra
    is the mela with the smallest da-ni pair, position 5 is the largest.
    """
    if not (1 <= M <= 72):
        raise ValueError(f"Melakarta number must be 1..72, got {M!r}")
    n = M if M <= 36 else M - 36              # 1..36 within hemisphere
    return (n - 1) % 6


def assert_geometric_correctness() -> None:
    """Verify radial alignment of decoding rings for all 72 melas.

    Raises AssertionError (with the offending mela number) if any mela's
    slot does not align radially with the (ri-ga, da-ni) cells implied by
    its swara tuple. Call this before rendering the katapayadi wheel.
    """
    for M in range(1, 73):
        t = katapayadi_from_mela(M)
        wedge   = mela_to_cakra_wedge_index(M)
        riga    = riga_pair_index(t["ri"], t["ga"])
        dani    = dani_pair_index(t["da"], t["ni"])
        pos     = cakra_position(M)

        assert cakra_to_riga(wedge) == riga, (
            f"Mela {M}: cakra wedge {wedge} implies ri-ga index "
            f"{cakra_to_riga(wedge)}, but tuple gives {riga}"
        )
        assert pos == dani, (
            f"Mela {M}: position-within-cakra {pos} != da-ni index {dani}"
        )
