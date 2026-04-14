#!/usr/bin/env python3
"""
writer.py — Atomic write operations for musicians/ and compositions.json (ADR-015).

CarnaticWriter provides stateless write methods. Each method:
  1. Reads the source file(s).
  2. Validates inputs against current state (reading source files directly —
     never graph.json, which is a derived artefact; see ADR-016).
  3. Applies the transformation.
  4. Writes atomically (temp file + os.replace).
  5. Returns a WriteResult(ok, skipped, message, log_prefix).

No method mutates instance state. All methods are safe to call sequentially;
each call holds the file for the duration of its read-transform-write cycle only.

Musicians storage — two modes (auto-detected by musicians_path argument):
  • Directory mode (preferred): musicians_path is carnatic/data/musicians/
      - Each node lives in musicians/{id}.json (bare object, no wrapper)
      - Edges live in musicians/_edges.json (bare array)
  • Legacy mode (fallback): musicians_path is carnatic/data/musicians.json
      - Single monolithic file with {"nodes": [...], "edges": [...]}

Usage (as a library):
    from pathlib import Path
    from carnatic.writer import CarnaticWriter

    w = CarnaticWriter()
    result = w.add_musician(
        Path("carnatic/data/musicians"),   # directory mode
        id="abhishek_raghuram",
        label="Abhishek Raghuram",
        era="contemporary",
        instrument="vocal",
        source_url="https://en.wikipedia.org/wiki/Abhishek_Raghuram",
        source_label="Wikipedia",
        source_type="wikipedia",
        born=1984,
    )
    print(result.message)
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


# ── path bootstrap (for direct script invocation) ──────────────────────────────
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))


# ── constants ──────────────────────────────────────────────────────────────────

VALID_ERAS = {
    "trinity",
    "bridge",
    "golden_age",
    "disseminator",
    "living_pillars",
    "contemporary",
}

VALID_SOURCE_TYPES = {"wikipedia", "pdf", "article", "archive", "other"}

PATCHABLE_MUSICIAN_FIELDS = {"label", "born", "died", "era", "instrument", "bani"}
PATCHABLE_EDGE_FIELDS = {"confidence", "source_url", "note"}
PATCHABLE_RAGA_FIELDS = {"name", "parent_raga", "melakarta", "is_melakarta", "cakra", "notes"}


# ── WriteResult ────────────────────────────────────────────────────────────────

@dataclass
class WriteResult:
    """
    Result of a CarnaticWriter operation.

    ok:         True = file was written (new data added or field patched).
    skipped:    True = duplicate detected; no write performed (not an error).
    message:    Human-readable output line (printed by write_cli.py).
    log_prefix: e.g. "[NODE+]", "[EDGE-]", "SKIP (duplicate)", "ERROR".
    """
    ok:         bool
    skipped:    bool
    message:    str
    log_prefix: str

    @property
    def exit_ok(self) -> bool:
        """True if the caller should exit 0 (written or skipped duplicate)."""
        return self.ok or self.skipped


def _ok(prefix: str, msg: str) -> WriteResult:
    return WriteResult(ok=True, skipped=False, message=f"{prefix}  {msg}", log_prefix=prefix)


def _skip(msg: str) -> WriteResult:
    return WriteResult(ok=False, skipped=True,
                       message=f"SKIP (duplicate)  {msg}", log_prefix="SKIP (duplicate)")


def _err(msg: str) -> WriteResult:
    return WriteResult(ok=False, skipped=False,
                       message=f"ERROR  {msg}", log_prefix="ERROR")


# ── atomic write helper ────────────────────────────────────────────────────────

def _atomic_write(path: Path, data: dict | list) -> None:
    """Write JSON atomically: temp file in same directory, then os.replace."""
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    dir_ = path.parent
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=dir_,
        suffix=".tmp", delete=False
    ) as f:
        f.write(text)
        tmp = Path(f.name)
    os.replace(tmp, path)  # atomic on POSIX; near-atomic on Windows


# ── YouTube video ID extractor ─────────────────────────────────────────────────

def _yt_video_id(url: str) -> str | None:
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


# ── musicians storage helpers ──────────────────────────────────────────────────

def _is_dir_mode(musicians_path: Path) -> bool:
    """Return True if musicians_path is a directory (split-file mode)."""
    return musicians_path.is_dir()


def _node_file(musicians_dir: Path, node_id: str) -> Path:
    """Return the path for a single musician node file."""
    return musicians_dir / f"{node_id}.json"


def _edges_file(musicians_dir: Path) -> Path:
    """Return the path for the edges file."""
    return musicians_dir / "_edges.json"


def _load_all_nodes(musicians_path: Path) -> list[dict]:
    """
    Load all musician nodes from either directory mode or legacy monolithic file.
    Returns a flat list of node dicts.
    """
    if _is_dir_mode(musicians_path):
        nodes = []
        for f in sorted(musicians_path.glob("*.json")):
            if not f.name.startswith("_"):
                nodes.append(json.loads(f.read_text(encoding="utf-8")))
        return nodes
    data = json.loads(musicians_path.read_text(encoding="utf-8"))
    return data.get("nodes", [])


def _load_edges(musicians_path: Path) -> list[dict]:
    """
    Load all edges from either directory mode or legacy monolithic file.
    Returns a flat list of edge dicts.
    """
    if _is_dir_mode(musicians_path):
        ef = _edges_file(musicians_path)
        if ef.exists():
            return json.loads(ef.read_text(encoding="utf-8"))
        return []
    data = json.loads(musicians_path.read_text(encoding="utf-8"))
    return data.get("edges", [])


def _write_node(musicians_path: Path, node: dict) -> None:
    """
    Write a single musician node.
    Directory mode: writes musicians/{id}.json.
    Legacy mode: rewrites the entire monolithic file.
    """
    if _is_dir_mode(musicians_path):
        _atomic_write(_node_file(musicians_path, node["id"]), node)
    else:
        data = json.loads(musicians_path.read_text(encoding="utf-8"))
        nodes: list[dict] = data.get("nodes", [])
        for i, n in enumerate(nodes):
            if n["id"] == node["id"]:
                nodes[i] = node
                break
        else:
            nodes.append(node)
        data["nodes"] = nodes
        _atomic_write(musicians_path, data)


def _append_node(musicians_path: Path, node: dict) -> None:
    """
    Append a new musician node.
    Directory mode: writes musicians/{id}.json (new file).
    Legacy mode: rewrites the entire monolithic file.
    """
    if _is_dir_mode(musicians_path):
        _atomic_write(_node_file(musicians_path, node["id"]), node)
    else:
        data = json.loads(musicians_path.read_text(encoding="utf-8"))
        nodes: list[dict] = data.get("nodes", [])
        nodes.append(node)
        data["nodes"] = nodes
        _atomic_write(musicians_path, data)


def _write_edges(musicians_path: Path, edges: list[dict]) -> None:
    """
    Write the full edges list.
    Directory mode: writes musicians/_edges.json.
    Legacy mode: rewrites the entire monolithic file.
    """
    if _is_dir_mode(musicians_path):
        _atomic_write(_edges_file(musicians_path), edges)
    else:
        data = json.loads(musicians_path.read_text(encoding="utf-8"))
        data["edges"] = edges
        _atomic_write(musicians_path, data)


# ── default paths ──────────────────────────────────────────────────────────────

def _default_musicians_path() -> Path:
    """Return the preferred musicians directory, falling back to monolithic file."""
    d = Path(__file__).parent / "data" / "musicians"
    if d.is_dir():
        return d
    return Path(__file__).parent / "data" / "musicians.json"


def _default_compositions_path() -> Path:
    return Path(__file__).parent / "data" / "compositions.json"


def _default_graph_path() -> Path:
    return Path(__file__).parent / "data" / "graph.json"


# ── CarnaticWriter ─────────────────────────────────────────────────────────────

class CarnaticWriter:
    """
    Stateless writer for musicians/ (or musicians.json) and compositions.json.

    Each method:
      1. Reads the source file(s).
      2. Validates inputs against current state by reading source files
         directly (musicians/ / compositions.json). graph.json is a
         derived artefact and is never read here — see ADR-016.
      3. Applies the transformation.
      4. Writes atomically (temp file + rename).
      5. Returns a WriteResult(ok, skipped, message, log_prefix).

    No method mutates instance state. All methods are safe to call
    sequentially (each call holds the file for the duration of its
    read-transform-write cycle only).

    musicians_path may be:
      • A directory (carnatic/data/musicians/) — preferred split-file mode.
      • A .json file (carnatic/data/musicians.json) — legacy monolithic mode.
    """

    # ── Group 1: Musician graph writes ────────────────────────────────────────

    def add_musician(
        self,
        musicians_path: Path,
        *,
        id: str,
        label: str,
        era: str,
        instrument: str,
        source_url: str,
        source_label: str,
        source_type: str,
        born: int | None = None,
        died: int | None = None,
        bani: str | None = None,
        graph_path: Path | None = None,
    ) -> WriteResult:
        """Add a new musician node."""
        # Validate era
        if era not in VALID_ERAS:
            return _err(
                f"--era \"{era}\" is not a valid era value\n"
                f"       Valid values: {', '.join(sorted(VALID_ERAS))}"
            )
        # Validate source_type
        if source_type not in VALID_SOURCE_TYPES:
            return _err(
                f"--source-type \"{source_type}\" is not a valid source type\n"
                f"       Valid values: {', '.join(sorted(VALID_SOURCE_TYPES))}"
            )

        nodes = _load_all_nodes(musicians_path)

        # Duplicate check
        existing_ids = {n["id"] for n in nodes}
        if id in existing_ids:
            return _skip(f"{id} already exists")

        node: dict[str, Any] = {
            "id":         id,
            "label":      label,
            "sources":    [{"url": source_url, "label": source_label, "type": source_type}],
            "born":       born,
            "died":       died,
            "era":        era,
            "instrument": instrument,
            "bani":       bani,
            "youtube":    [],
        }
        _append_node(musicians_path, node)

        born_str = str(born) if born is not None else "null"
        return _ok("[NODE+]", f"added: {id} — {label} (born {born_str}, {era}, {instrument})")

    def add_edge(
        self,
        musicians_path: Path,
        *,
        source: str,
        target: str,
        confidence: float,
        source_url: str,
        note: str | None = None,
        graph_path: Path | None = None,
    ) -> WriteResult:
        """Add a guru-shishya edge."""
        # Self-loop check
        if source == target:
            return _err(f"source and target must be different (got \"{source}\" for both)")

        # Confidence range
        if not (0.0 <= confidence <= 1.0):
            return _err(f"--confidence {confidence} is out of range [0.0, 1.0]")

        # Low-confidence requires note
        if confidence < 0.70 and not note:
            return _err(
                f"--note is required when --confidence < 0.70 (got {confidence})"
            )

        nodes = _load_all_nodes(musicians_path)
        edges = _load_edges(musicians_path)

        known_ids = {n["id"] for n in nodes}

        if source not in known_ids:
            return _err(f"source \"{source}\" does not exist in nodes[]")
        if target not in known_ids:
            return _err(f"target \"{target}\" does not exist in nodes[]")

        # Duplicate edge check
        for e in edges:
            if e["source"] == source and e["target"] == target:
                return _skip(f"edge {source} → {target} already exists")

        edge: dict[str, Any] = {
            "source":     source,
            "target":     target,
            "confidence": confidence,
            "source_url": source_url,
        }
        if note:
            edge["note"] = note

        edges.append(edge)
        _write_edges(musicians_path, edges)

        return _ok("[EDGE+]", f"added: {source} → {target} (confidence {confidence})")

    def add_youtube(
        self,
        musicians_path: Path,
        *,
        musician_id: str,
        url: str,
        label: str,
        composition_id: str | None = None,
        raga_id: str | None = None,
        year: int | None = None,
        version: str | None = None,
        compositions_path: Path | None = None,
    ) -> WriteResult:
        """Append a YouTube recording entry to a musician node's youtube[] array."""
        video_id = _yt_video_id(url)
        if not video_id:
            return _err(f"could not extract 11-char video ID from URL: {url}")

        # Load all nodes for validation; in dir mode we'll write only the one file
        nodes = _load_all_nodes(musicians_path)

        # Validate musician_id
        known_musician_ids = {n["id"] for n in nodes}
        if musician_id not in known_musician_ids:
            return _err(f"musician_id \"{musician_id}\" does not exist in nodes[]")

        # Validate composition_id / raga_id directly from compositions.json (ADR-016)
        if composition_id is not None or raga_id is not None:
            comp_path = compositions_path or _default_compositions_path()
            comp_data = json.loads(comp_path.read_text(encoding="utf-8"))
            if composition_id is not None:
                known_comp_ids = {c["id"] for c in comp_data.get("compositions", [])}
                if composition_id not in known_comp_ids:
                    return _err(
                        f"--composition-id \"{composition_id}\" does not exist in compositions.json\n"
                        f"       Run add-composition before referencing it here."
                    )
            if raga_id is not None:
                known_raga_ids = {r["id"] for r in comp_data.get("ragas", [])}
                if raga_id not in known_raga_ids:
                    return _err(
                        f"--raga-id \"{raga_id}\" does not exist in compositions.json\n"
                        f"       Run add-raga before referencing it here."
                    )

        # Find the node
        node = next((n for n in nodes if n["id"] == musician_id), None)
        if node is None:
            return _err(f"musician_id \"{musician_id}\" not found in musicians")

        # Duplicate detection: check video_id across this node's youtube[]
        for yt in node.get("youtube", []):
            existing_vid = _yt_video_id(yt.get("url", ""))
            if existing_vid == video_id:
                return _skip(f"video_id {video_id} already in {musician_id}.youtube[]")

        entry: dict[str, Any] = {"url": url, "label": label}
        if composition_id is not None:
            entry["composition_id"] = composition_id
        if raga_id is not None:
            entry["raga_id"] = raga_id
        if year is not None:
            entry["year"] = year
        if version is not None:
            entry["version"] = version

        if "youtube" not in node:
            node["youtube"] = []
        node["youtube"].append(entry)

        # Write only the affected node file (dir mode) or the whole file (legacy)
        _write_node(musicians_path, node)

        detail_parts = [f"video_id: {video_id}"]
        if raga_id:
            detail_parts.append(f"raga: {raga_id}")
        if composition_id:
            detail_parts.append(f"composition: {composition_id}")
        detail = "  " + "  ".join(detail_parts)

        return _ok(
            "[YOUTUBE+]",
            f"appended to {musician_id}: \"{label}\"\n{detail}"
        )

    def add_source(
        self,
        musicians_path: Path,
        *,
        musician_id: str,
        url: str,
        label: str,
        type: str,
        graph_path: Path | None = None,
    ) -> WriteResult:
        """Append a source object to an existing musician node's sources[] array."""
        if type not in VALID_SOURCE_TYPES:
            return _err(
                f"--type \"{type}\" is not a valid source type\n"
                f"       Valid values: {', '.join(sorted(VALID_SOURCE_TYPES))}"
            )

        nodes = _load_all_nodes(musicians_path)

        node = next((n for n in nodes if n["id"] == musician_id), None)
        if node is None:
            return _err(f"musician_id \"{musician_id}\" does not exist in nodes[]")

        # Duplicate URL check
        for src in node.get("sources", []):
            if src.get("url") == url:
                return _skip(f"url \"{url}\" already in {musician_id}.sources[]")

        if "sources" not in node:
            node["sources"] = []
        node["sources"].append({"url": url, "label": label, "type": type})

        _write_node(musicians_path, node)
        return _ok("[SOURCE+]", f"{musician_id} — \"{label}\" ({type})")

    def remove_edge(
        self,
        musicians_path: Path,
        *,
        source: str,
        target: str,
        graph_path: Path | None = None,
    ) -> WriteResult:
        """Remove a guru-shishya edge."""
        edges = _load_edges(musicians_path)

        new_edges = [e for e in edges if not (e["source"] == source and e["target"] == target)]
        if len(new_edges) == len(edges):
            return _err(f"edge {source} → {target} does not exist in edges[]")

        _write_edges(musicians_path, new_edges)
        return _ok("[EDGE-]", f"removed: {source} → {target}")

    def patch_musician(
        self,
        musicians_path: Path,
        *,
        musician_id: str,
        field: str,
        value: Any,
        graph_path: Path | None = None,
    ) -> WriteResult:
        """Update a single scalar field on an existing musician node."""
        if field == "id":
            return _err("id is immutable — cannot be patched")
        if field not in PATCHABLE_MUSICIAN_FIELDS:
            return _err(
                f"field \"{field}\" is not patchable\n"
                f"       Permitted fields: {', '.join(sorted(PATCHABLE_MUSICIAN_FIELDS))}"
            )

        # Coerce value for typed fields
        coerced: Any = value
        if field == "era":
            if value not in VALID_ERAS:
                return _err(
                    f"era \"{value}\" is not a valid era value\n"
                    f"       Valid values: {', '.join(sorted(VALID_ERAS))}"
                )
        elif field in ("born", "died"):
            if value in (None, "null", ""):
                coerced = None
            else:
                try:
                    coerced = int(value)
                except (ValueError, TypeError):
                    return _err(f"field \"{field}\" must be an integer or \"null\", got \"{value}\"")

        nodes = _load_all_nodes(musicians_path)

        node = next((n for n in nodes if n["id"] == musician_id), None)
        if node is None:
            return _err(f"musician_id \"{musician_id}\" does not exist in nodes[]")

        old_value = node.get(field)
        node[field] = coerced

        _write_node(musicians_path, node)
        return _ok("[NODE~]", f"patched: {musician_id}  {field}: {old_value!r} → {coerced!r}")

    def patch_edge(
        self,
        musicians_path: Path,
        *,
        source: str,
        target: str,
        field: str,
        value: Any,
        graph_path: Path | None = None,
    ) -> WriteResult:
        """Update a single field on an existing edge."""
        if field not in PATCHABLE_EDGE_FIELDS:
            return _err(
                f"field \"{field}\" is not patchable on an edge\n"
                f"       Permitted fields: {', '.join(sorted(PATCHABLE_EDGE_FIELDS))}"
            )

        coerced: Any = value
        if field == "confidence":
            try:
                coerced = float(value)
            except (ValueError, TypeError):
                return _err(f"confidence must be a float, got \"{value}\"")
            if not (0.0 <= coerced <= 1.0):
                return _err(f"confidence {coerced} is out of range [0.0, 1.0]")

        edges = _load_edges(musicians_path)

        edge = next((e for e in edges if e["source"] == source and e["target"] == target), None)
        if edge is None:
            return _err(f"edge {source} → {target} does not exist in edges[]")

        old_value = edge.get(field)
        edge[field] = coerced

        _write_edges(musicians_path, edges)
        return _ok("[EDGE~]", f"patched: {source} → {target}  {field}: {old_value!r} → {coerced!r}")

    # ── Group 2: Composition data writes ──────────────────────────────────────

    def add_raga(
        self,
        compositions_path: Path,
        *,
        id: str,
        name: str,
        source_url: str,
        source_label: str,
        source_type: str,
        aliases: list[str] | None = None,
        melakarta: int | None = None,
        parent_raga: str | None = None,
        notes: str | None = None,
        graph_path: Path | None = None,
    ) -> WriteResult:
        """Add a new raga to compositions.json."""
        if source_type not in VALID_SOURCE_TYPES:
            return _err(
                f"--source-type \"{source_type}\" is not a valid source type\n"
                f"       Valid values: {', '.join(sorted(VALID_SOURCE_TYPES))}"
            )
        if melakarta is not None and not (1 <= melakarta <= 72):
            return _err(f"--melakarta {melakarta} is out of range [1, 72]")

        data = json.loads(compositions_path.read_text(encoding="utf-8"))
        ragas: list[dict] = data.get("ragas", [])

        existing_ids = {r["id"] for r in ragas}
        if id in existing_ids:
            return _skip(f"{id} already exists in ragas[]")

        # Validate parent_raga if given
        if parent_raga is not None and parent_raga not in existing_ids:
            return _err(f"--parent-raga \"{parent_raga}\" does not exist in ragas[]")

        raga: dict[str, Any] = {
            "id":          id,
            "name":        name,
            "aliases":     aliases or [],
            "melakarta":   melakarta,
            "parent_raga": parent_raga,
            "sources":     [{"url": source_url, "label": source_label, "type": source_type}],
        }
        if notes is not None:
            raga["notes"] = notes

        ragas.append(raga)
        data["ragas"] = ragas
        _atomic_write(compositions_path, data)

        return _ok(
            "[RAGA+]",
            f"added: {id} — \"{name}\"  melakarta: {melakarta}  parent_raga: {parent_raga}"
        )

    def add_composer(
        self,
        compositions_path: Path,
        *,
        id: str,
        name: str,
        source_url: str,
        source_label: str,
        source_type: str,
        musician_node_id: str | None = None,
        born: int | None = None,
        died: int | None = None,
        musicians_path: Path | None = None,
    ) -> WriteResult:
        """Add a new composer to compositions.json."""
        if source_type not in VALID_SOURCE_TYPES:
            return _err(
                f"--source-type \"{source_type}\" is not a valid source type\n"
                f"       Valid values: {', '.join(sorted(VALID_SOURCE_TYPES))}"
            )

        # Validate musician_node_id directly from musicians/ (ADR-016)
        if musician_node_id is not None:
            m_path = musicians_path or _default_musicians_path()
            known_ids = {n["id"] for n in _load_all_nodes(m_path)}
            if musician_node_id not in known_ids:
                return _err(
                    f"--musician-node-id \"{musician_node_id}\" does not exist in musicians"
                )

        data = json.loads(compositions_path.read_text(encoding="utf-8"))
        composers: list[dict] = data.get("composers", [])

        existing_ids = {c["id"] for c in composers}
        if id in existing_ids:
            return _skip(f"{id} already exists in composers[]")

        composer: dict[str, Any] = {
            "id":               id,
            "name":             name,
            "musician_node_id": musician_node_id,
            "born":             born,
            "died":             died,
            "sources":          [{"url": source_url, "label": source_label, "type": source_type}],
        }

        composers.append(composer)
        data["composers"] = composers
        _atomic_write(compositions_path, data)

        return _ok("[COMPOSER+]", f"added: {id} — \"{name}\"  musician_node_id: {musician_node_id}")

    def add_composition(
        self,
        compositions_path: Path,
        *,
        id: str,
        title: str,
        composer_id: str,
        raga_id: str,
        tala: str | None = None,
        language: str | None = None,
        source_url: str | None = None,
        source_label: str | None = None,
        source_type: str | None = None,
        notes: str | None = None,
        graph_path: Path | None = None,
    ) -> WriteResult:
        """Add a new composition to compositions.json."""
        if source_type is not None and source_type not in VALID_SOURCE_TYPES:
            return _err(
                f"--source-type \"{source_type}\" is not a valid source type\n"
                f"       Valid values: {', '.join(sorted(VALID_SOURCE_TYPES))}"
            )

        data = json.loads(compositions_path.read_text(encoding="utf-8"))
        compositions: list[dict] = data.get("compositions", [])
        composers: list[dict] = data.get("composers", [])
        ragas: list[dict] = data.get("ragas", [])

        existing_ids = {c["id"] for c in compositions}
        if id in existing_ids:
            return _skip(f"{id} already exists in compositions[]")

        known_composer_ids = {c["id"] for c in composers}
        if composer_id not in known_composer_ids:
            return _err(f"--composer-id \"{composer_id}\" does not exist in composers[]")

        known_raga_ids = {r["id"] for r in ragas}
        if raga_id not in known_raga_ids:
            return _err(f"--raga-id \"{raga_id}\" does not exist in ragas[]")

        composition: dict[str, Any] = {
            "id":          id,
            "title":       title,
            "composer_id": composer_id,
            "raga_id":     raga_id,
        }
        if tala is not None:
            composition["tala"] = tala
        if language is not None:
            composition["language"] = language
        if source_url is not None:
            sources_entry: dict[str, Any] = {"url": source_url}
            if source_label is not None:
                sources_entry["label"] = source_label
            if source_type is not None:
                sources_entry["type"] = source_type
            composition["sources"] = [sources_entry]
        if notes is not None:
            composition["notes"] = notes

        compositions.append(composition)
        data["compositions"] = compositions
        _atomic_write(compositions_path, data)

        return _ok(
            "[COMP+]",
            f"added: {id} — \"{title}\"  raga: {raga_id}  composer: {composer_id}"
        )

    def patch_raga(
        self,
        compositions_path: Path,
        *,
        raga_id: str,
        field: str,
        value: Any,
        graph_path: Path | None = None,
    ) -> WriteResult:
        """
        Update a single field on an existing raga object in compositions.json.

        Permitted fields: name, parent_raga, melakarta, is_melakarta, cakra, notes
        id and sources are immutable via this command.

        Validations:
          - raga_id must exist in ragas[]
          - field must be in PATCHABLE_RAGA_FIELDS
          - if field == parent_raga: value must be an existing raga id or "null"
          - if field == is_melakarta: value must be "true" or "false"
          - if field == cakra or melakarta: value must be an integer string (or "null")
        """
        if field == "id":
            return _err("id is immutable — cannot be patched")
        if field == "sources":
            return _err("sources is immutable via patch-raga — use add-source instead")
        if field not in PATCHABLE_RAGA_FIELDS:
            return _err(
                f"field \"{field}\" is not patchable on a raga\n"
                f"       Permitted fields: {', '.join(sorted(PATCHABLE_RAGA_FIELDS))}"
            )

        data = json.loads(compositions_path.read_text(encoding="utf-8"))
        ragas: list[dict] = data.get("ragas", [])
        existing_ids = {r["id"] for r in ragas}

        if raga_id not in existing_ids:
            return _err(f"raga_id \"{raga_id}\" does not exist in ragas[]")

        # Coerce value for typed fields
        coerced: Any = value

        if field == "parent_raga":
            if value in (None, "null", ""):
                coerced = None
            else:
                if value not in existing_ids:
                    return _err(
                        f"parent_raga \"{value}\" does not exist in ragas[]\n"
                        f"       Add the parent raga first before setting this reference."
                    )

        elif field == "is_melakarta":
            if str(value).lower() in ("true", "1", "yes"):
                coerced = True
            elif str(value).lower() in ("false", "0", "no"):
                coerced = False
            else:
                return _err(
                    f"is_melakarta must be \"true\" or \"false\", got \"{value}\""
                )

        elif field == "cakra":
            if value in (None, "null", ""):
                coerced = None
            else:
                try:
                    coerced = int(value)
                except (ValueError, TypeError):
                    return _err(f"cakra must be an integer (1–12) or \"null\", got \"{value}\"")
                if not (1 <= coerced <= 12):
                    return _err(f"cakra {coerced} is out of range [1, 12]")

        elif field == "melakarta":
            if value in (None, "null", ""):
                coerced = None
            else:
                try:
                    coerced = int(value)
                except (ValueError, TypeError):
                    return _err(f"melakarta must be an integer (1–72) or \"null\", got \"{value}\"")
                if not (1 <= coerced <= 72):
                    return _err(f"melakarta {coerced} is out of range [1, 72]")

        # Apply patch
        raga = next(r for r in ragas if r["id"] == raga_id)
        old_value = raga.get(field)
        raga[field] = coerced

        data["ragas"] = ragas
        _atomic_write(compositions_path, data)

        return _ok("[RAGA~]", f"patched: {raga_id}  {field}: {old_value!r} → {coerced!r}")
