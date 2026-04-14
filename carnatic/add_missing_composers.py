#!/usr/bin/env python3
"""
add_missing_composers.py — append three missing composers to _composers.json.

Composers to add:
  - koteeswara_iyer   (Harikesanallur Koteeswara Iyer, 1870–1936)
  - andal             (Andal / Āṇṭāḷ, Tamil Vaishnava saint-poet)
  - arunachala_kavi   (Arunachala Kavi, 18th century, Ramanatakam)

Usage:
    python3 carnatic/add_missing_composers.py [--dry-run]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPOSERS_FILE = ROOT / "carnatic" / "data" / "compositions" / "_composers.json"

NEW_COMPOSERS = [
    {
        "id": "koteeswara_iyer",
        "name": "Harikesanallur Koteeswara Iyer",
        "musician_node_id": None,
        "born": 1870,
        "died": 1936,
        "sources": [
            {
                "url": "https://en.wikipedia.org/wiki/Harikesanallur_Koteeswara_Iyer",
                "label": "Wikipedia",
                "type": "wikipedia",
            }
        ],
    },
    {
        "id": "andal",
        "name": "Andal",
        "musician_node_id": None,
        "born": None,
        "died": None,
        "sources": [
            {
                "url": "https://en.wikipedia.org/wiki/Andal",
                "label": "Wikipedia",
                "type": "wikipedia",
            }
        ],
    },
    {
        "id": "arunachala_kavi",
        "name": "Arunachala Kavi",
        "musician_node_id": None,
        "born": None,
        "died": None,
        "sources": [
            {
                "url": "https://en.wikipedia.org/wiki/Arunachala_Kavi",
                "label": "Wikipedia",
                "type": "wikipedia",
            }
        ],
    },
]

dry_run = "--dry-run" in sys.argv

composers = json.loads(COMPOSERS_FILE.read_text(encoding="utf-8"))
existing_ids = {c["id"] for c in composers}

added = []
for c in NEW_COMPOSERS:
    if c["id"] in existing_ids:
        print(f"SKIP (duplicate)  {c['id']}")
    else:
        composers.append(c)
        added.append(c["id"])
        print(f"[COMPOSER+]  {c['id']}  \"{c['name']}\"")

if not added:
    print("Nothing to add.")
    sys.exit(0)

if dry_run:
    print(f"\n--dry-run: {len(added)} composer(s) would be added. File not written.")
    sys.exit(0)

COMPOSERS_FILE.write_text(
    json.dumps(composers, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)
print(f"\nWrote {COMPOSERS_FILE} ({len(composers)} composers total).")
