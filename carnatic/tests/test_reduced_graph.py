"""
test_reduced_graph.py — projection + diff for the librarian collaboration format.
"""

from __future__ import annotations

from carnatic.reduced_graph import (
    EdgeAdd,
    EdgePatch,
    MusicianAdd,
    MusicianPatch,
    SourceAdd,
    build_reduced,
    diff_reduced,
    project_edge,
    project_musician,
)


def _node(**overrides):
    base = {
        "id": "test_id",
        "label": "Test Musician",
        "sources": [{"url": "https://en.wikipedia.org/wiki/Test", "label": "Wikipedia", "type": "wikipedia"}],
        "born": 1900,
        "died": 1970,
        "era": "golden_age",
        "instrument": "vocal",
        "bani": "test_bani",
        "youtube": [{"url": "https://youtu.be/x", "label": "should be stripped"}],
    }
    base.update(overrides)
    return base


def _edge(**overrides):
    base = {
        "source": "guru_id",
        "target": "shishya_id",
        "confidence": 0.9,
        "source_url": "https://en.wikipedia.org/wiki/Test",
    }
    base.update(overrides)
    return base


# ── Projection ────────────────────────────────────────────────────────────────

def test_project_musician_strips_youtube():
    out = project_musician(_node())
    assert "youtube" not in out
    assert set(out.keys()) == {"id", "label", "sources", "born", "died", "era", "instrument", "bani"}


def test_project_edge_omits_note_when_absent():
    assert "note" not in project_edge(_edge())


def test_project_edge_keeps_note_when_present():
    assert project_edge(_edge(note="hello"))["note"] == "hello"


# ── Round-trip identity ───────────────────────────────────────────────────────

def test_roundtrip_identity_yields_empty_diff():
    nodes = [_node(id="a"), _node(id="b", label="B")]
    edges = [_edge(source="a", target="b")]
    doc = build_reduced(nodes, edges, generated_at="2026-04-27T00:00:00+00:00")
    diff = diff_reduced(doc, doc)
    assert diff.is_empty()
    assert diff.warnings == []


# ── Patch detection ───────────────────────────────────────────────────────────

def test_scalar_patch_detected():
    nodes = [_node(id="a", bani="old")]
    base = build_reduced(nodes, [], generated_at="t")
    edited = build_reduced([_node(id="a", bani="new")], [], generated_at="t")
    diff = diff_reduced(base, edited)
    assert len(diff.musician_patches) == 1
    p = diff.musician_patches[0]
    assert p == MusicianPatch(musician_id="a", field="bani", old="old", new="new")


def test_null_to_value_patch_detected():
    base = build_reduced([_node(id="a", died=None)], [], generated_at="t")
    edited = build_reduced([_node(id="a", died=1985)], [], generated_at="t")
    diff = diff_reduced(base, edited)
    assert any(p.field == "died" and p.new == 1985 for p in diff.musician_patches)


# ── Additions ─────────────────────────────────────────────────────────────────

def test_new_musician_detected():
    base = build_reduced([_node(id="a")], [], generated_at="t")
    edited = build_reduced([_node(id="a"), _node(id="b")], [], generated_at="t")
    diff = diff_reduced(base, edited)
    assert len(diff.musician_adds) == 1
    assert diff.musician_adds[0].musician["id"] == "b"
    assert diff.musician_patches == []


def test_new_source_on_existing_musician():
    base = build_reduced([_node(id="a")], [], generated_at="t")
    edited_node = _node(id="a")
    edited_node["sources"] = list(edited_node["sources"]) + [
        {"url": "https://example.com/article", "label": "Article", "type": "article"},
    ]
    edited = build_reduced([edited_node], [], generated_at="t")
    diff = diff_reduced(base, edited)
    assert len(diff.source_adds) == 1
    assert diff.source_adds[0].source["url"] == "https://example.com/article"


def test_new_edge_detected():
    nodes = [_node(id="a"), _node(id="b")]
    base = build_reduced(nodes, [], generated_at="t")
    edited = build_reduced(nodes, [_edge(source="a", target="b")], generated_at="t")
    diff = diff_reduced(base, edited)
    assert len(diff.edge_adds) == 1
    assert diff.edge_adds[0].edge["source"] == "a"


def test_edge_patch_detected():
    nodes = [_node(id="a"), _node(id="b")]
    base = build_reduced(nodes, [_edge(source="a", target="b", confidence=0.9)], generated_at="t")
    edited = build_reduced(nodes, [_edge(source="a", target="b", confidence=0.95)], generated_at="t")
    diff = diff_reduced(base, edited)
    assert len(diff.edge_patches) == 1
    ep = diff.edge_patches[0]
    assert ep == EdgePatch(source="a", target="b", field="confidence", old=0.9, new=0.95)


# ── Tolerance for unknown fields and removals ─────────────────────────────────

def test_unknown_extra_field_warns_not_errors():
    base = build_reduced([_node(id="a")], [], generated_at="t")
    edited_doc = build_reduced([_node(id="a")], [], generated_at="t")
    edited_doc["musicians"][0]["TODO"] = "ask the family for birth year"
    diff = diff_reduced(base, edited_doc)
    assert diff.musician_patches == []
    assert any("TODO" in w for w in diff.warnings)


def test_missing_musician_warns_not_deletes():
    base = build_reduced([_node(id="a"), _node(id="b")], [], generated_at="t")
    edited = build_reduced([_node(id="a")], [], generated_at="t")
    diff = diff_reduced(base, edited)
    assert diff.musician_patches == []
    assert diff.musician_adds == []
    assert any("absent" in w for w in diff.warnings)


def test_missing_source_warns_not_removes():
    n = _node(id="a")
    n["sources"] = [
        {"url": "u1", "label": "L1", "type": "wikipedia"},
        {"url": "u2", "label": "L2", "type": "article"},
    ]
    base = build_reduced([n], [], generated_at="t")
    n_trimmed = _node(id="a")
    n_trimmed["sources"] = [{"url": "u1", "label": "L1", "type": "wikipedia"}]
    edited = build_reduced([n_trimmed], [], generated_at="t")
    diff = diff_reduced(base, edited)
    assert diff.source_adds == []
    assert any("source" in w and "absent" in w for w in diff.warnings)


# ── Sort determinism ──────────────────────────────────────────────────────────

def test_musicians_and_edges_sorted_in_output():
    nodes = [_node(id="b"), _node(id="a")]
    edges = [_edge(source="b", target="a"), _edge(source="a", target="b")]
    doc = build_reduced(nodes, edges, generated_at="t")
    assert [m["id"] for m in doc["musicians"]] == ["a", "b"]
    assert [(e["source"], e["target"]) for e in doc["edges"]] == [("a", "b"), ("b", "a")]


# ── Sanity: all add/patch dataclasses constructable ───────────────────────────

def test_dataclasses_constructable():
    MusicianAdd(musician={"id": "x"})
    SourceAdd(musician_id="x", source={"url": "u", "label": "l", "type": "wikipedia"})
    EdgeAdd(edge={"source": "a", "target": "b"})
