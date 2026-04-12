#!/usr/bin/env python3
"""
extract_melakarta_wikipedia.py — ADR-021 Step 1

Fetches https://en.wikipedia.org/wiki/Melakarta, parses the 72-row table,
reconciles against existing ragas[] in compositions.json, and emits:

  carnatic/data/melakarta_patch.json  — patches for existing Mela ragas
  carnatic/data/melakarta_new.json    — new Mela raga objects (not yet in ragas[])

Usage:
    python3 carnatic/playlists/extract_melakarta_wikipedia.py [--force]

    --force   Re-fetch Wikipedia even if cached.

Output summary:
    N patches, M new objects, K spelling mismatches, J flags
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

# ── path bootstrap ─────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT.parent))

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError as e:
    print(f"ERROR: missing dependency — {e}")
    print("Install with: pip install requests beautifulsoup4")
    sys.exit(1)

# ── paths ──────────────────────────────────────────────────────────────────────
CACHE_DIR        = ROOT / "data" / "cache"
COMPOSITIONS_PATH = ROOT / "data" / "compositions.json"
PATCH_OUT        = ROOT / "data" / "melakarta_patch.json"
NEW_OUT          = ROOT / "data" / "melakarta_new.json"

CACHE_DIR.mkdir(parents=True, exist_ok=True)

MELAKARTA_URL = "https://en.wikipedia.org/wiki/Melakarta"
HEADERS = {"User-Agent": "CarnaticLineageBot/1.0 (research; contact via github)"}
CRAWL_DELAY = 1.5

# ── cakra table (canonical) ────────────────────────────────────────────────────
# Maps melakarta number → cakra number
def _mela_to_cakra(n: int) -> int:
    """Return cakra number (1–12) for melakarta number (1–72)."""
    return ((n - 1) // 6) + 1

CAKRA_NAMES = {
    1:  "Indu",
    2:  "Netra",
    3:  "Agni",
    4:  "Veda",
    5:  "Bana",
    6:  "Rutu",
    7:  "Rishi",
    8:  "Vasu",
    9:  "Brahma",
    10: "Disi",
    11: "Rudra",
    12: "Aditya",
}

# ── cache helpers ──────────────────────────────────────────────────────────────

def _cache_path(url: str) -> Path:
    slug = hashlib.md5(url.encode()).hexdigest()
    return CACHE_DIR / f"{slug}.html"


def _fetch(url: str, force: bool = False) -> Optional[str]:
    cp = _cache_path(url)
    if cp.exists() and not force:
        print(f"[CACHE] {url}")
        return cp.read_text(encoding="utf-8")
    print(f"[FETCH] {url}")
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        cp.write_text(resp.text, encoding="utf-8")
        time.sleep(CRAWL_DELAY)
        return resp.text
    except Exception as exc:
        print(f"[WARN] fetch failed: {exc}")
        return None


# ── name → id normalisation ────────────────────────────────────────────────────

# Diacritic → ASCII transliteration table for Carnatic raga names.
# Covers the Unicode characters that appear in the Wikipedia Melakarta table.
_DIACRITIC_MAP = str.maketrans({
    # Vowels with macron / dot
    "ā": "a", "Ā": "a",
    "ī": "i", "Ī": "i",
    "ū": "u", "Ū": "u",
    "ē": "e", "Ē": "e",
    "ō": "o", "Ō": "o",
    # Retroflex consonants
    "ṭ": "t", "Ṭ": "t",
    "ḍ": "d", "Ḍ": "d",
    "ṇ": "n", "Ṇ": "n",
    "ḷ": "l", "Ḷ": "l",
    "ḻ": "l", "Ḻ": "l",
    "ṟ": "r", "Ṟ": "r",
    # Palatal / sibilant
    "ś": "s", "Ś": "s",
    "ṣ": "s", "Ṣ": "s",
    "ñ": "n", "Ñ": "n",
    # Aspirated / nasal
    "ṁ": "m", "Ṁ": "m",
    "ṃ": "m", "Ṃ": "m",
    "ṅ": "n", "Ṅ": "n",
    "ḥ": "h", "Ḥ": "h",
    # Dotted s / z
    "ẓ": "z",
    # Superscript dot above (ṡ used for high Sa in scale notation — skip)
    "Ṡ": "",  "ṡ": "",
    # Common ligatures / special chars
    "\u1e43": "m",  # ṃ (already above, belt-and-suspenders)
})


def _to_id(name: str) -> str:
    """Convert a Wikipedia raga name (possibly with diacritics) to snake_case id."""
    # 1. Transliterate known diacritics to ASCII equivalents
    s = name.translate(_DIACRITIC_MAP)
    # 2. Lower-case
    s = s.lower()
    # 3. Replace any remaining non-alphanumeric runs with underscore
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


# ── Wikipedia table parser ─────────────────────────────────────────────────────

def _parse_melakarta_table(html: str) -> list[dict]:
    """
    Parse the Melakarta Wikipedia page and return a list of dicts:
      {number, name, cakra, arohana, avarohana}

    The Wikipedia Melakarta page uses a two-column grid layout:
      - Row 0: title (colspan=6)
      - Row 1: "Shuddha Madhyama" | "Prati Madhyama" (colspan=3 each)
      - Row 2: No. | Raga | Scale | No. | Raga | Scale  (column headers)
      - Row 3: "1. Indu Chakra" | "7. Rishi Chakra"  (cakra header, 2 cells)
      - Rows 4–9: 6 cells each — [No, Raga, Scale, No, Raga, Scale]
      - Row 10: "2. Netra Chakra" | "8. Vasu Chakra"
      - ... and so on for 12 cakra pairs

    Each data row encodes TWO melakartas (left column = Melas 1–36,
    right column = Melas 37–72).
    The Scale column contains the arohana (ascending scale).
    """
    soup = BeautifulSoup(html, "html.parser")
    rows_data: list[dict] = []

    # Find the melakarta wikitable — it has "Mēḷakartā" or "Melakarta" in its first cell
    tables = soup.find_all("table", class_=re.compile(r"wikitable"))
    target_table = None
    for table in tables:
        first_cell = table.find(["td", "th"])
        if first_cell and re.search(r"[Mm][eē][lḷ]akart", first_cell.get_text()):
            target_table = table
            break

    if target_table is None:
        # Fallback: use the first wikitable
        if tables:
            target_table = tables[0]
        else:
            return rows_data

    rows = target_table.find_all("tr")

    def _clean(text: str) -> str:
        """Strip footnote markers and normalise whitespace."""
        text = re.sub(r"\[\d+\]", "", text)
        return re.sub(r"\s+", " ", text).strip()

    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) != 6:
            continue  # skip header rows, cakra-header rows, title rows

        # Left entry: cells[0]=No, cells[1]=Name, cells[2]=Scale
        # Right entry: cells[3]=No, cells[4]=Name, cells[5]=Scale
        for offset in (0, 3):
            num_str  = _clean(cells[offset].get_text(" ", strip=True))
            name_str = _clean(cells[offset + 1].get_text(" ", strip=True))
            scale_str = _clean(cells[offset + 2].get_text(" ", strip=True))

            num_match = re.search(r"\d+", num_str)
            if not num_match:
                continue
            num = int(num_match.group())
            if not (1 <= num <= 72):
                continue
            if not name_str:
                continue

            cakra = _mela_to_cakra(num)
            rows_data.append({
                "number":    num,
                "name":      name_str,
                "cakra":     cakra,
                "arohana":   scale_str,
                "avarohana": "",  # Wikipedia table only shows arohana
            })

    # Sort by melakarta number
    rows_data.sort(key=lambda r: r["number"])
    return rows_data


# ── reconciliation ─────────────────────────────────────────────────────────────

def _build_mela_lookup(ragas: list[dict]) -> dict[int, dict]:
    """Build {melakarta_number: raga_object} for all ragas with melakarta != null."""
    lookup: dict[int, dict] = {}
    for r in ragas:
        m = r.get("melakarta")
        if m is not None:
            lookup[int(m)] = r
    return lookup


def _normalise_name(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def _reconcile(
    wiki_rows: list[dict],
    mela_lookup: dict[int, dict],
) -> tuple[list[dict], list[dict], list[str], list[str]]:
    """
    Returns:
      patches       — list of patch records for existing ragas
      new_objects   — list of new raga objects
      mismatches    — list of SPELLING MISMATCH warning strings
      flags         — list of FLAG strings
    """
    patches: list[dict] = []
    new_objects: list[dict] = []
    mismatches: list[str] = []
    flags: list[str] = []

    for row in wiki_rows:
        num      = row["number"]
        wiki_name = row["name"]
        cakra    = row["cakra"]
        cakra_name = CAKRA_NAMES.get(cakra, str(cakra))
        arohana  = row["arohana"]
        avarohana = row["avarohana"]

        existing = mela_lookup.get(num)

        if existing:
            # Patch record for existing raga
            existing_name = existing.get("name", "")
            if _normalise_name(existing_name) != _normalise_name(wiki_name):
                mismatches.append(
                    f"SPELLING MISMATCH: existing='{existing_name}' "
                    f"wikipedia='{wiki_name}' id='{existing['id']}' melakarta={num}"
                )
            patches.append({
                "op":     "patch",
                "id":     existing["id"],
                "fields": {
                    "is_melakarta": True,
                    "cakra":        cakra,
                },
                "wikipedia_name": wiki_name,
                "melakarta":      num,
                "cakra_name":     cakra_name,
            })
        else:
            # New raga object
            raga_id = _to_id(wiki_name)
            notes_parts = [
                f"{num}th melakarta; Cakra {cakra} ({cakra_name})",
            ]
            if arohana:
                notes_parts.append(f"arohana: {arohana}")
            if avarohana:
                notes_parts.append(f"avarohana: {avarohana}")
            notes = "; ".join(notes_parts)

            new_objects.append({
                "id":           raga_id,
                "name":         wiki_name,
                "aliases":      [],
                "melakarta":    num,
                "is_melakarta": True,
                "cakra":        cakra,
                "parent_raga":  None,
                "sources": [
                    {
                        "url":   MELAKARTA_URL,
                        "label": "Wikipedia — Melakarta",
                        "type":  "wikipedia",
                    }
                ],
                "notes": notes,
            })

    return patches, new_objects, mismatches, flags


def _check_integrity_gaps(ragas: list[dict], flags: list[str]) -> None:
    """Check for known referential integrity gaps and append to flags."""
    raga_ids = {r["id"] for r in ragas}

    # tanarupi gap
    if "tanarupi" not in raga_ids:
        # Check if anything references it
        refs = [r["id"] for r in ragas if r.get("parent_raga") == "tanarupi"]
        if refs:
            flags.append(
                f"INTEGRITY GAP: {', '.join(refs)} have parent_raga='tanarupi' "
                f"but 'tanarupi' is not in ragas[] — must be added before patching varali.parent_raga"
            )
        else:
            flags.append(
                "INTEGRITY GAP: 'tanarupi' (Mela 6) not in ragas[] — "
                "punnagavarali.parent_raga='tanarupi' will be a dangling reference"
            )

    # karnataka_kapi — parent unspecified
    kk = next((r for r in ragas if r["id"] == "karnataka_kapi"), None)
    if kk and not kk.get("parent_raga"):
        flags.append(
            "FLAG [LIBRARIAN]: karnataka_kapi.parent_raga is null — "
            "notes say 'Janya raga distinct from Kapi' but parent Mela is unspecified; research needed"
        )

    # purvi — parent unspecified
    purvi = next((r for r in ragas if r["id"] == "purvi"), None)
    if purvi and not purvi.get("parent_raga"):
        flags.append(
            "FLAG [LIBRARIAN]: purvi.parent_raga is null — "
            "notes say 'Corresponds to Hindustani Purvi'; likely Kamavardhini (51); verify before patching"
        )

    # yaman_kalyan — bhashanga, parent uncertain
    yk = next((r for r in ragas if r["id"] == "yaman_kalyan"), None)
    if yk and not yk.get("parent_raga"):
        flags.append(
            "FLAG [LIBRARIAN]: yaman_kalyan.parent_raga is null — "
            "notes say 'Related to Carnatic Kalyani'; bhashanga raga; verify primary parent before patching"
        )


# ── atomic write ───────────────────────────────────────────────────────────────

def _write_json(path: Path, data: object) -> None:
    import os, tempfile
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent,
        suffix=".tmp", delete=False
    ) as f:
        f.write(text)
        tmp = Path(f.name)
    os.replace(tmp, path)


# ── main ───────────────────────────────────────────────────────────────────────

def main(force: bool = False) -> None:
    # 1. Fetch Wikipedia
    html = _fetch(MELAKARTA_URL, force=force)
    if not html:
        print("ERROR: could not fetch Melakarta Wikipedia page")
        sys.exit(1)

    # 2. Parse table
    wiki_rows = _parse_melakarta_table(html)
    if len(wiki_rows) < 60:
        print(f"WARNING: only parsed {len(wiki_rows)} rows — expected 72. "
              f"Wikipedia page structure may have changed.")
    else:
        print(f"[PARSE] {len(wiki_rows)} melakarta rows extracted from Wikipedia table")

    # 3. Load compositions.json
    comp_data = json.loads(COMPOSITIONS_PATH.read_text(encoding="utf-8"))
    ragas: list[dict] = comp_data.get("ragas", [])
    mela_lookup = _build_mela_lookup(ragas)
    print(f"[DATA]  {len(ragas)} ragas in compositions.json; "
          f"{len(mela_lookup)} have melakarta numbers")

    # 4. Reconcile
    patches, new_objects, mismatches, flags = _reconcile(wiki_rows, mela_lookup)

    # 5. Integrity gap checks
    _check_integrity_gaps(ragas, flags)

    # 6. Print warnings
    for m in mismatches:
        print(m)
    for f in flags:
        print(f)

    # 7. Write output files
    _write_json(PATCH_OUT, patches)
    _write_json(NEW_OUT, new_objects)

    print(f"\n[SUMMARY] {len(patches)} patches, {len(new_objects)} new objects, "
          f"{len(mismatches)} spelling mismatches, {len(flags)} flags")
    print(f"[OUTPUT]  {PATCH_OUT}")
    print(f"[OUTPUT]  {NEW_OUT}")

    # 8. Print patch summary table
    if patches:
        print("\nPatches (existing ragas to enrich):")
        for p in patches:
            cakra_name = p.get("cakra_name", "")
            print(f"  {p['id']:<30} melakarta={p['melakarta']:<3} "
                  f"cakra={p['fields']['cakra']} ({cakra_name})")

    if new_objects:
        print(f"\nNew objects (first 10 of {len(new_objects)}):")
        for obj in new_objects[:10]:
            print(f"  {obj['id']:<30} melakarta={obj['melakarta']:<3} "
                  f"cakra={obj['cakra']} ({CAKRA_NAMES.get(obj['cakra'], '?')})")
        if len(new_objects) > 10:
            print(f"  ... and {len(new_objects) - 10} more")


if __name__ == "__main__":
    force = "--force" in sys.argv
    main(force=force)
