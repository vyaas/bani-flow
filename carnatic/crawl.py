#!/usr/bin/env python3
"""
crawl.py — Wikipedia guru-shishya parampara crawler
Fetches infobox teacher/student fields + prose mentions from Wikipedia sources.
Respects cache. Updates musicians.json non-destructively.

Only sources with type=="wikipedia" are crawled; other source types are
user-supplied provenance and are preserved as-is.
"""

import json
import re
import time
import hashlib
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field, asdict

import requests
from bs4 import BeautifulSoup

# ── paths ──────────────────────────────────────────────────────────────────────
ROOT           = Path(__file__).parent
DATA_FILE      = ROOT / "data" / "musicians.json"   # legacy monolithic fallback
MUSICIANS_DIR  = ROOT / "data" / "musicians"        # preferred: split-file mode
CACHE_DIR      = ROOT / "data" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"User-Agent": "CarnaticLineageBot/1.0 (research; contact via github)"}
CRAWL_DELAY = 1.5  # seconds between requests — be a good citizen

# ── data model ─────────────────────────────────────────────────────────────────
@dataclass
class Edge:
    source: str
    target: str
    confidence: float
    source_url: str

    def key(self) -> str:
        return f"{self.source}→{self.target}"

# ── cache ──────────────────────────────────────────────────────────────────────
def cache_path(url: str) -> Path:
    slug = hashlib.md5(url.encode()).hexdigest()
    return CACHE_DIR / f"{slug}.html"

def fetch_page(url: str, force: bool = False) -> Optional[str]:
    cp = cache_path(url)
    if cp.exists() and not force:
        return cp.read_text(encoding="utf-8")
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        cp.write_text(resp.text, encoding="utf-8")
        time.sleep(CRAWL_DELAY)
        return resp.text
    except Exception as e:
        print(f"  [WARN] fetch failed for {url}: {e}")
        return None

# ── extraction ─────────────────────────────────────────────────────────────────
def slug_from_url(url: str) -> str:
    """Wikipedia URL → clean slug for matching against node ids."""
    name = url.rstrip("/").split("/")[-1]
    return name.replace("_", " ").lower()


def wikipedia_urls_for_node(node: dict) -> list[str]:
    """
    Return all Wikipedia URLs associated with a node.

    Supports both the new schema (sources array) and the legacy
    'wikipedia' string field for backward compatibility.
    """
    urls: list[str] = []
    # New schema: sources array
    for src in node.get("sources", []):
        if src.get("type") == "wikipedia" and src.get("url"):
            urls.append(src["url"])
    # Legacy fallback: bare 'wikipedia' string key
    if not urls:
        legacy = node.get("wikipedia")
        if legacy:
            urls.append(legacy)
    return urls

def extract_infobox_relations(soup: BeautifulSoup, page_url: str) -> list[Edge]:
    """Pull teacher/student rows from Wikipedia infobox."""
    edges: list[Edge] = []
    infobox = soup.find("table", class_=re.compile(r"infobox"))
    if not infobox:
        return edges

    for row in infobox.find_all("tr"):
        header = row.find("th")
        if not header:
            continue
        header_text = header.get_text(strip=True).lower()

        is_teacher = any(k in header_text for k in ["teacher", "guru", "trained"])
        is_student = any(k in header_text for k in ["student", "disciple", "shishya"])

        if not (is_teacher or is_student):
            continue

        td = row.find("td")
        if not td:
            continue

        for link in td.find_all("a", href=True):
            href = link["href"]
            if not href.startswith("/wiki/") or ":" in href:
                continue
            target_url = "https://en.wikipedia.org" + href
            target_slug = slug_from_url(target_url)
            page_slug = slug_from_url(page_url)

            if is_teacher:
                # link is the teacher, page subject is the student
                edges.append(Edge(
                    source=target_slug,
                    target=page_slug,
                    confidence=0.90,
                    source_url=page_url
                ))
            else:
                # link is the student, page subject is the teacher
                edges.append(Edge(
                    source=page_slug,
                    target=target_slug,
                    confidence=0.90,
                    source_url=page_url
                ))

    return edges

def extract_prose_relations(soup: BeautifulSoup, page_url: str) -> list[Edge]:
    """Scan prose for 'disciple of', 'trained under', 'student of' patterns."""
    edges: list[Edge] = []
    page_slug = slug_from_url(page_url)

    patterns = [
        r"disciple of",
        r"student of",
        r"trained under",
        r"learnt? (from|under)",
        r"taught by",
        r"guru (?:was|is)",
    ]
    combined = re.compile("|".join(patterns), re.IGNORECASE)

    for para in soup.find_all("p"):
        text = para.get_text()
        if not combined.search(text):
            continue
        for link in para.find_all("a", href=True):
            href = link["href"]
            if not href.startswith("/wiki/") or ":" in href:
                continue
            target_url = "https://en.wikipedia.org" + href
            target_slug = slug_from_url(target_url)
            if target_slug == page_slug:
                continue
            edges.append(Edge(
                source=target_slug,
                target=page_slug,
                confidence=0.70,  # prose is less reliable
                source_url=page_url
            ))

    return edges

# ── graph merge ────────────────────────────────────────────────────────────────

def _atomic_write_json(path: Path, data: dict | list) -> None:
    """Write JSON atomically via temp file + os.replace."""
    import os, tempfile
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False
    ) as f:
        f.write(text)
        tmp = Path(f.name)
    os.replace(tmp, path)


def load_graph() -> dict:
    """
    Load musicians as {"nodes": [...], "edges": [...]}.
    Prefers the musicians/ directory; falls back to musicians.json.
    """
    if MUSICIANS_DIR.is_dir():
        nodes = []
        for f in sorted(MUSICIANS_DIR.glob("*.json")):
            if not f.name.startswith("_"):
                nodes.append(json.loads(f.read_text(encoding="utf-8")))
        edges_file = MUSICIANS_DIR / "_edges.json"
        edges = json.loads(edges_file.read_text(encoding="utf-8")) if edges_file.exists() else []
        return {"nodes": nodes, "edges": edges}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def save_graph(graph: dict) -> None:
    """
    Save musicians back to storage.
    Directory mode: writes each node to its own file + _edges.json.
    Legacy mode: rewrites the monolithic musicians.json.
    """
    if MUSICIANS_DIR.is_dir():
        for node in graph.get("nodes", []):
            _atomic_write_json(MUSICIANS_DIR / f"{node['id']}.json", node)
        _atomic_write_json(MUSICIANS_DIR / "_edges.json", graph.get("edges", []))
        print(f"  [SAVED] {MUSICIANS_DIR}/ ({len(graph.get('nodes', []))} nodes, {len(graph.get('edges', []))} edges)")
    else:
        _atomic_write_json(DATA_FILE, graph)
        print(f"  [SAVED] {DATA_FILE}")

def node_ids(graph: dict) -> set[str]:
    return {n["id"] for n in graph["nodes"]}

def name_to_id(name: str) -> str:
    """Normalise a display name or Wikipedia slug to our id format."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")

def match_slug_to_node(slug: str, graph: dict) -> Optional[str]:
    """Try to match a wikipedia slug to an existing node id."""
    nids = node_ids(graph)
    # direct id match
    candidate = name_to_id(slug)
    if candidate in nids:
        return candidate
    # label match
    slug_lower = slug.lower()
    for node in graph["nodes"]:
        if node["label"].lower() == slug_lower:
            return node["id"]
    return None

def merge_edges(graph: dict, new_edges: list[Edge]) -> int:
    """Add edges whose source+target both resolve to known nodes. Return count added."""
    existing_keys = {(e["source"], e["target"]) for e in graph["edges"]}
    added = 0
    for e in new_edges:
        src_id = match_slug_to_node(e.source, graph)
        tgt_id = match_slug_to_node(e.target, graph)
        if not src_id or not tgt_id:
            continue
        if src_id == tgt_id:
            continue
        key = (src_id, tgt_id)
        if key in existing_keys:
            continue
        graph["edges"].append({
            "source": src_id,
            "target": tgt_id,
            "confidence": e.confidence,
            "source_url": e.source_url
        })
        existing_keys.add(key)
        added += 1
        print(f"  [EDGE+] {src_id} → {tgt_id}  (conf={e.confidence:.2f})")
    return added

# ── main crawl loop ────────────────────────────────────────────────────────────
def crawl_node(node: dict, graph: dict, force: bool = False) -> int:
    """Crawl all Wikipedia sources for a node and merge discovered edges."""
    urls = wikipedia_urls_for_node(node)
    if not urls:
        return 0
    total_added = 0
    for url in urls:
        print(f"[CRAWL] {node['label']}  {url}")
        html = fetch_page(url, force=force)
        if not html:
            continue
        soup = BeautifulSoup(html, "html.parser")
        edges: list[Edge] = []
        edges += extract_infobox_relations(soup, url)
        edges += extract_prose_relations(soup, url)
        print(f"  found {len(edges)} candidate relations")
        total_added += merge_edges(graph, edges)
    return total_added

def main(force: bool = False) -> None:
    graph = load_graph()
    total_added = 0
    for node in graph["nodes"]:
        added = crawl_node(node, graph, force=force)
        total_added += added
    save_graph(graph)
    print(f"\n[DONE] {total_added} new edges added across {len(graph['nodes'])} nodes")

if __name__ == "__main__":
    import sys
    force_refetch = "--force" in sys.argv
    main(force=force_refetch)
