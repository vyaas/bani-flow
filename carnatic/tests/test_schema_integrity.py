"""
test_schema_integrity.py — Referential integrity across all data files.

Validates that every foreign-key reference in every recording file
resolves to a known entity in graph.json.
"""

import pytest
from carnatic.graph_api import CarnaticGraph


def test_all_recording_musician_ids_exist(graph: CarnaticGraph) -> None:
    """Every musician_id in every recording must exist in graph.musicians."""
    known_ids = {n["id"] for n in graph.get_all_musicians()}
    for rec in graph.get_all_recordings():
        for session in rec.get("sessions", []):
            for performer in session.get("performers", []):
                mid = performer.get("musician_id")
                if mid is not None:
                    assert mid in known_ids, (
                        f"Recording '{rec['id']}': musician_id '{mid}' not in graph.musicians"
                    )


def test_all_performance_composition_ids_exist(graph: CarnaticGraph) -> None:
    """Every composition_id in every performance must exist in compositions."""
    known_ids = {c["id"] for c in graph.get_all_compositions()}
    for rec in graph.get_all_recordings():
        for session in rec.get("sessions", []):
            for perf in session.get("performances", []):
                cid = perf.get("composition_id")
                if cid is not None:
                    assert cid in known_ids, (
                        f"Recording '{rec['id']}' perf {perf['performance_index']}: "
                        f"composition_id '{cid}' not in compositions"
                    )


def test_all_performance_raga_ids_exist(graph: CarnaticGraph) -> None:
    """Every raga_id in every performance must exist in ragas."""
    known_ids = {r["id"] for r in graph.get_all_ragas()}
    for rec in graph.get_all_recordings():
        for session in rec.get("sessions", []):
            for perf in session.get("performances", []):
                rid = perf.get("raga_id")
                if rid is not None:
                    assert rid in known_ids, (
                        f"Recording '{rec['id']}' perf {perf['performance_index']}: "
                        f"raga_id '{rid}' not in ragas"
                    )


def test_all_performance_composer_ids_exist(graph: CarnaticGraph) -> None:
    """Every composer_id in every performance must exist in musicians (ADR-110)."""
    known_ids = {m["id"] for m in graph.get_all_musicians()}
    for rec in graph.get_all_recordings():
        for session in rec.get("sessions", []):
            for perf in session.get("performances", []):
                cid = perf.get("composer_id")
                if cid is not None:
                    assert cid in known_ids, (
                        f"Recording '{rec['id']}' perf {perf['performance_index']}: "
                        f"composer_id '{cid}' not in musicians"
                    )


def test_all_composition_raga_ids_exist(graph: CarnaticGraph) -> None:
    """Every raga_id on a composition must exist in ragas (null is allowed)."""
    known_ids = {r["id"] for r in graph.get_all_ragas()}
    for comp in graph.get_all_compositions():
        rid = comp.get("raga_id")
        if rid is not None:
            assert rid in known_ids, (
                f"Composition '{comp['id']}': raga_id '{rid}' not in ragas"
            )


def test_all_composition_composer_ids_exist(graph: CarnaticGraph) -> None:
    """Every composer_id on a composition must exist in musicians (ADR-110; null is allowed)."""
    known_ids = {m["id"] for m in graph.get_all_musicians()}
    for comp in graph.get_all_compositions():
        cid = comp.get("composer_id")
        if cid is not None:
            assert cid in known_ids, (
                f"Composition '{comp['id']}': composer_id '{cid}' not in musicians"
            )


def test_all_edge_source_ids_exist(graph: CarnaticGraph) -> None:
    """Every edge source must be a known musician node."""
    known_ids = {n["id"] for n in graph.get_all_musicians()}
    for edge in graph.get_all_edges():
        assert edge["source"] in known_ids, (
            f"Edge source '{edge['source']}' not in musician nodes"
        )


def test_all_edge_target_ids_exist(graph: CarnaticGraph) -> None:
    """Every edge target must be a known musician node."""
    known_ids = {n["id"] for n in graph.get_all_musicians()}
    for edge in graph.get_all_edges():
        assert edge["target"] in known_ids, (
            f"Edge target '{edge['target']}' not in musician nodes"
        )


def test_recording_refs_match_loaded_recordings(graph: CarnaticGraph) -> None:
    """Every recording_ref id must correspond to a loadable recording file."""
    for ref in graph.get_all_recording_refs():
        rec = graph.get_recording(ref["id"])
        assert rec is not None, (
            f"recording_ref '{ref['id']}' points to a file that could not be loaded"
        )
        assert rec["id"] == ref["id"], (
            f"recording_ref id '{ref['id']}' does not match file id '{rec['id']}'"
        )


def test_all_musician_nodes_have_required_fields(graph: CarnaticGraph) -> None:
    """Every musician node must have id and label; era and instrument are optional (ADR-110)."""
    required = ("id", "label")
    for node in graph.get_all_musicians():
        for field in required:
            assert field in node and node[field], (
                f"Musician node '{node.get('id', '?')}' missing required field '{field}'"
            )


def test_all_recordings_have_required_fields(graph: CarnaticGraph) -> None:
    """Every recording must have id, title, sessions."""
    for rec in graph.get_all_recordings():
        assert "id" in rec and rec["id"], f"Recording missing 'id': {rec}"
        assert "title" in rec and rec["title"], f"Recording '{rec['id']}' missing 'title'"
        assert "sessions" in rec, f"Recording '{rec['id']}' missing 'sessions'"
