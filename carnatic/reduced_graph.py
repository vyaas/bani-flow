"""
reduced_graph.py — Pure projection + diff for the librarian collaboration format.

The "reduced graph" is a single hand-editable JSON document that contains only
the artist-metadata fields collaborators need (no recordings, no youtube, no
compositions). It round-trips through `bani-export-reduced` (write) and
`bani-import-reduced` (read + diff + apply).

This module is I/O-free. The export and import scripts handle file reads,
file writes, and CarnaticWriter calls. All schema enforcement and diffing
live here so they can be unit-tested in isolation.

Schema contract (also documented in carnatic/data/READYOU.md):

    {
      "schema_version": 1,
      "generated_at":   "<ISO-8601 UTC>",
      "generator":      "bani-flow reduced-graph export",
      "instructions":   "<editing rules embedded for collaborators>",
      "musicians": [
        {
          "id":         "<immutable_key>",
          "label":      "<display name>",
          "sources":    [{"url": "...", "label": "...", "type": "wikipedia|pdf|article|archive|other"}, ...],
          "born":       <int|null>,
          "died":       <int|null>,
          "era":        "<one of VALID_ERAS>|null",
          "instrument": "<string|null>",
          "bani":       "<string|null>"
        },
        ...
      ],
      "edges": [
        {
          "source":     "<guru_id>",
          "target":     "<shishya_id>",
          "confidence": <0.0..1.0>,
          "source_url": "...",
          "note":       "<optional curator note>"
        },
        ...
      ]
    }

Unknown extra keys (top-level, on a musician, or on an edge) are tolerated on
import — collaborators may scribble TODOs inline. Removals are never applied;
missing rows produce warnings only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SCHEMA_VERSION = 1

# Tracked fields the import diff classifies as patchable.
# These mirror writer.PATCHABLE_MUSICIAN_FIELDS / PATCHABLE_EDGE_FIELDS but
# are duplicated here intentionally — this module must not import from
# writer.py so the projection schema stays the single source of truth for
# what collaborators see.
MUSICIAN_SCALAR_FIELDS: tuple[str, ...] = (
    "label", "born", "died", "era", "instrument", "bani",
)
EDGE_SCALAR_FIELDS: tuple[str, ...] = (
    "confidence", "source_url", "note",
)

DEFAULT_INSTRUCTIONS = (
    "Editing rules:\n"
    "  1. Never change a musician 'id' — it is the immutable key.\n"
    "  2. To add a new musician: append an object to 'musicians' with at least "
    "'id', 'label', and one entry in 'sources' (Wikipedia URL preferred).\n"
    "  3. To correct existing data: edit fields in place. Set numeric fields "
    "to null if unknown.\n"
    "  4. To add a guru→shishya relation: append to 'edges' with 'source' "
    "(guru id), 'target' (shishya id), 'confidence' (0.0–1.0), and 'source_url'. "
    "Add a 'note' if confidence < 0.70.\n"
    "  5. Do not delete musicians or edges — removals are ignored on import.\n"
    "  6. 'youtube', 'recordings', and 'compositions' are deliberately out of "
    "scope here. This file is artist metadata only."
)


# ── Projection ────────────────────────────────────────────────────────────────

def project_musician(node: dict[str, Any]) -> dict[str, Any]:
    """Project a full musician node onto the reduced schema (ordered keys)."""
    return {
        "id":         node["id"],
        "label":      node.get("label"),
        "sources":    [_project_source(s) for s in node.get("sources", [])],
        "born":       node.get("born"),
        "died":       node.get("died"),
        "era":        node.get("era"),
        "instrument": node.get("instrument"),
        "bani":       node.get("bani"),
    }


def _project_source(src: dict[str, Any]) -> dict[str, Any]:
    return {
        "url":   src.get("url"),
        "label": src.get("label"),
        "type":  src.get("type"),
    }


def project_edge(edge: dict[str, Any]) -> dict[str, Any]:
    """Project a full edge onto the reduced schema. 'note' included only if present."""
    out: dict[str, Any] = {
        "source":     edge["source"],
        "target":     edge["target"],
        "confidence": edge.get("confidence"),
        "source_url": edge.get("source_url"),
    }
    if edge.get("note"):
        out["note"] = edge["note"]
    return out


def build_reduced(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    *,
    generated_at: str,
    instructions: str = DEFAULT_INSTRUCTIONS,
) -> dict[str, Any]:
    """Build the full reduced-graph document from raw nodes + edges."""
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at":   generated_at,
        "generator":      "bani-flow reduced-graph export",
        "instructions":   instructions,
        "musicians": sorted(
            (project_musician(n) for n in nodes),
            key=lambda m: m["id"],
        ),
        "edges": sorted(
            (project_edge(e) for e in edges),
            key=lambda e: (e["source"], e["target"]),
        ),
    }


# ── Diff ──────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class MusicianAdd:
    musician: dict[str, Any]   # full reduced-musician dict (incl. sources[])


@dataclass(frozen=True)
class MusicianPatch:
    musician_id: str
    field: str
    old: Any
    new: Any


@dataclass(frozen=True)
class SourceAdd:
    musician_id: str
    source: dict[str, Any]   # {url, label, type}


@dataclass(frozen=True)
class EdgeAdd:
    edge: dict[str, Any]   # full reduced-edge dict


@dataclass(frozen=True)
class EdgePatch:
    source: str
    target: str
    field: str
    old: Any
    new: Any


@dataclass
class ReducedDiff:
    musician_adds:   list[MusicianAdd]   = field(default_factory=list)
    musician_patches: list[MusicianPatch] = field(default_factory=list)
    source_adds:     list[SourceAdd]     = field(default_factory=list)
    edge_adds:       list[EdgeAdd]       = field(default_factory=list)
    edge_patches:    list[EdgePatch]     = field(default_factory=list)
    warnings:        list[str]           = field(default_factory=list)

    def is_empty(self) -> bool:
        return not (
            self.musician_adds
            or self.musician_patches
            or self.source_adds
            or self.edge_adds
            or self.edge_patches
        )

    def total_changes(self) -> int:
        return (
            len(self.musician_adds)
            + len(self.musician_patches)
            + len(self.source_adds)
            + len(self.edge_adds)
            + len(self.edge_patches)
        )


def diff_reduced(
    baseline: dict[str, Any],
    edited:   dict[str, Any],
) -> ReducedDiff:
    """
    Compute a structured diff: what mutations would turn `baseline` into `edited`?

    Both inputs are expected to be reduced-graph documents (as produced by
    build_reduced). Removals are reported as warnings, never as deletions.
    Unknown extra keys on a musician/edge are tolerated (warned).
    """
    diff = ReducedDiff()

    base_musicians = {m["id"]: m for m in baseline.get("musicians", [])}
    edit_musicians = {m["id"]: m for m in edited.get("musicians", [])}

    for mid, em in edit_musicians.items():
        if mid not in base_musicians:
            diff.musician_adds.append(MusicianAdd(musician=em))
            continue
        bm = base_musicians[mid]
        # Scalar field patches
        for f in MUSICIAN_SCALAR_FIELDS:
            if em.get(f) != bm.get(f):
                diff.musician_patches.append(
                    MusicianPatch(musician_id=mid, field=f, old=bm.get(f), new=em.get(f))
                )
        # Source additions (by url) — additive only
        base_urls = {s.get("url") for s in bm.get("sources", [])}
        edit_urls = {s.get("url") for s in em.get("sources", [])}
        for src in em.get("sources", []):
            if src.get("url") not in base_urls:
                diff.source_adds.append(SourceAdd(musician_id=mid, source=src))
        removed_urls = base_urls - edit_urls
        if removed_urls:
            diff.warnings.append(
                f"musician {mid!r}: {len(removed_urls)} source(s) absent from edited file "
                f"({sorted(u for u in removed_urls if u)!r}); kept (no removal API)"
            )
        # Unknown extra keys on the musician
        extra = set(em.keys()) - {"id", "label", "sources", "born", "died", "era", "instrument", "bani"}
        if extra:
            diff.warnings.append(
                f"musician {mid!r}: ignoring unknown field(s) {sorted(extra)!r}"
            )

    missing_musicians = set(base_musicians) - set(edit_musicians)
    if missing_musicians:
        diff.warnings.append(
            f"{len(missing_musicians)} musician(s) absent from edited file "
            f"(first few: {sorted(missing_musicians)[:5]!r}); kept (deletions are not applied)"
        )

    # Edges keyed by (source, target)
    base_edges = {(e["source"], e["target"]): e for e in baseline.get("edges", [])}
    edit_edges = {(e["source"], e["target"]): e for e in edited.get("edges", [])}

    for key, ee in edit_edges.items():
        if key not in base_edges:
            diff.edge_adds.append(EdgeAdd(edge=ee))
            continue
        be = base_edges[key]
        for f in EDGE_SCALAR_FIELDS:
            if ee.get(f) != be.get(f):
                diff.edge_patches.append(
                    EdgePatch(source=key[0], target=key[1], field=f, old=be.get(f), new=ee.get(f))
                )
        extra = set(ee.keys()) - {"source", "target", "confidence", "source_url", "note"}
        if extra:
            diff.warnings.append(
                f"edge {key[0]}→{key[1]}: ignoring unknown field(s) {sorted(extra)!r}"
            )

    missing_edges = set(base_edges) - set(edit_edges)
    if missing_edges:
        diff.warnings.append(
            f"{len(missing_edges)} edge(s) absent from edited file "
            f"(first few: {sorted(missing_edges)[:5]!r}); kept (deletions are not applied)"
        )

    return diff
