"""
test_traversal.py — Known-good traversal assertions.

These tests encode specific facts about the graph that must remain true.
They serve as regression guards: if a data edit breaks a known relationship,
these tests will catch it.
"""

import pytest
from carnatic.graph_api import CarnaticGraph


# ── Musician traversal ─────────────────────────────────────────────────────────

def test_get_musician_tyagaraja(graph: CarnaticGraph) -> None:
    """get_musician returns the Trinity node for tyagaraja."""
    node = graph.get_musician("tyagaraja")
    assert node is not None
    assert node["id"] == "tyagaraja"
    assert node["era"] == "trinity"


def test_get_musician_nonexistent_returns_none(graph: CarnaticGraph) -> None:
    """get_musician returns None for an unknown id."""
    assert graph.get_musician("nonexistent_id_xyz") is None


def test_gurus_of_madurai_mani_iyer(graph: CarnaticGraph) -> None:
    """Madurai Mani Iyer's guru is Muthiah Bhagavatar."""
    gurus = graph.get_gurus_of("madurai_mani_iyer")
    guru_ids = {g["id"] for g in gurus}
    assert "muthiah_bhagavatar" in guru_ids, (
        f"Expected muthiah_bhagavatar in gurus of madurai_mani_iyer, got {guru_ids}"
    )


def test_shishyas_of_semmangudi(graph: CarnaticGraph) -> None:
    """Semmangudi's shishyas include TM Krishna and TN Krishnan."""
    shishyas = graph.get_shishyas_of("semmangudi_srinivasa_iyer")
    shishya_ids = {s["id"] for s in shishyas}
    assert "tm_krishna" in shishya_ids
    assert "tn_krishnan" in shishya_ids


def test_shishyas_of_lalgudi(graph: CarnaticGraph) -> None:
    """Lalgudi's shishyas include Bombay Jayashri, GJR Krishnan, Lalgudi Vijayalakshmi."""
    shishyas = graph.get_shishyas_of("lalgudi_jayaraman")
    shishya_ids = {s["id"] for s in shishyas}
    assert "bombay_jayashri" in shishya_ids
    assert "gjr_krishnan" in shishya_ids
    assert "lalgudi_vijayalakshmi" in shishya_ids


def test_lineage_chain_tm_krishna(graph: CarnaticGraph) -> None:
    """
    TM Krishna's lineage chain must pass through Semmangudi Srinivasa Iyer.
    """
    chain = graph.get_lineage_chain("tm_krishna", depth=10)
    chain_ids = [n["id"] for n in chain]
    assert "tm_krishna" in chain_ids
    assert "semmangudi_srinivasa_iyer" in chain_ids


def test_lineage_chain_starts_with_musician(graph: CarnaticGraph) -> None:
    """The first element of a lineage chain is always the queried musician."""
    chain = graph.get_lineage_chain("lalgudi_jayaraman")
    assert chain[0]["id"] == "lalgudi_jayaraman"


def test_get_musicians_by_era(graph: CarnaticGraph) -> None:
    """get_musicians_by_era returns only nodes with the matching era."""
    trinity = graph.get_musicians_by_era("trinity")
    assert len(trinity) >= 3
    for n in trinity:
        assert n["era"] == "trinity"


def test_get_musicians_by_instrument_violin(graph: CarnaticGraph) -> None:
    """get_musicians_by_instrument returns violin players including Lalgudi."""
    violinists = graph.get_musicians_by_instrument("violin")
    ids = {n["id"] for n in violinists}
    assert "lalgudi_jayaraman" in ids
    assert "tn_krishnan" in ids


def test_get_musicians_by_bani(graph: CarnaticGraph) -> None:
    """get_musicians_by_bani returns musicians with the given bani."""
    semmangudi_bani = graph.get_musicians_by_bani("semmangudi")
    ids = {n["id"] for n in semmangudi_bani}
    assert "semmangudi_srinivasa_iyer" in ids
    assert "tm_krishna" in ids
    assert "ramnad_krishnan" in ids


# ── Recording traversal ────────────────────────────────────────────────────────

def test_get_recording_jamshedpur(graph: CarnaticGraph) -> None:
    """get_recording returns the Jamshedpur 1961 concert."""
    rec = graph.get_recording("jamshedpur_1961_madurai_mani_iyer")
    assert rec is not None
    assert rec["id"] == "jamshedpur_1961_madurai_mani_iyer"
    assert rec["date"] == "1961"


def test_get_recording_nonexistent_returns_none(graph: CarnaticGraph) -> None:
    """get_recording returns None for an unknown id."""
    assert graph.get_recording("nonexistent_concert_xyz") is None


def test_recordings_for_lalgudi_includes_jamshedpur(graph: CarnaticGraph) -> None:
    """Lalgudi Jayaraman appears in the Jamshedpur 1961 concert."""
    recs = graph.get_recordings_for_musician("lalgudi_jayaraman")
    rec_ids = {r["id"] for r in recs}
    assert "jamshedpur_1961_madurai_mani_iyer" in rec_ids


def test_recordings_for_lalgudi_includes_music_academy_1965(graph: CarnaticGraph) -> None:
    """Lalgudi Jayaraman appears in the Music Academy 1965 concert."""
    recs = graph.get_recordings_for_musician("lalgudi_jayaraman")
    rec_ids = {r["id"] for r in recs}
    assert "music_academy_1965_lalgudi" in rec_ids


def test_performances_for_madurai_mani_iyer(graph: CarnaticGraph) -> None:
    """Madurai Mani Iyer has performances in the Jamshedpur 1961 concert."""
    perfs = graph.get_performances_for_musician("madurai_mani_iyer")
    assert len(perfs) > 0
    recording_ids = {p["recording_id"] for p in perfs}
    assert "jamshedpur_1961_madurai_mani_iyer" in recording_ids


def test_recordings_for_composition_maakelara(graph: CarnaticGraph) -> None:
    """Makelara Vicharamu appears in the Jamshedpur 1961 concert."""
    recs = graph.get_recordings_for_composition("maakelara_vicaaramu")
    rec_ids = {r["id"] for r in recs}
    assert "jamshedpur_1961_madurai_mani_iyer" in rec_ids


def test_recordings_for_raga_ravichandrika(graph: CarnaticGraph) -> None:
    """Ravichandrika raga appears in the Jamshedpur 1961 concert."""
    recs = graph.get_recordings_for_raga("ravichandrika")
    rec_ids = {r["id"] for r in recs}
    assert "jamshedpur_1961_madurai_mani_iyer" in rec_ids


# ── Composition traversal ──────────────────────────────────────────────────────

def test_get_composition_maakelara(graph: CarnaticGraph) -> None:
    """get_composition returns the Makelara Vicharamu composition."""
    comp = graph.get_composition("maakelara_vicaaramu")
    assert comp is not None
    assert comp["raga_id"] == "ravichandrika"
    assert comp["composer_id"] == "tyagaraja"


def test_get_raga_ravichandrika(graph: CarnaticGraph) -> None:
    """get_raga returns the Ravichandrika raga."""
    raga = graph.get_raga("ravichandrika")
    assert raga is not None
    assert raga["id"] == "ravichandrika"


def test_get_composer_tyagaraja(graph: CarnaticGraph) -> None:
    """get_composer returns the Tyagaraja musician node (ADR-110: composer IS the musician)."""
    composer = graph.get_composer("tyagaraja")
    assert composer is not None
    assert composer["id"] == "tyagaraja"


def test_get_compositions_by_raga_surutti(graph: CarnaticGraph) -> None:
    """get_compositions_by_raga returns Surutti compositions including Gitarthamu."""
    comps = graph.get_compositions_by_raga("surutti")
    comp_ids = {c["id"] for c in comps}
    assert "gitarthamu" in comp_ids


def test_get_compositions_by_composer_tyagaraja(graph: CarnaticGraph) -> None:
    """get_compositions_by_composer returns Tyagaraja's compositions."""
    comps = graph.get_compositions_by_composer("tyagaraja")
    assert len(comps) >= 5  # at least the Pancharatna kritis
    comp_ids = {c["id"] for c in comps}
    assert "jagadananda_karaka" in comp_ids
    assert "entharo_mahanubhavulu" in comp_ids


def test_musicians_who_performed_maakelara(graph: CarnaticGraph) -> None:
    """
    get_musicians_who_performed returns musicians who performed Makelara Vicharamu.
    Madurai Mani Iyer must be in the list (from Jamshedpur 1961 recording).
    """
    musicians = graph.get_musicians_who_performed("maakelara_vicaaramu")
    ids = {m["id"] for m in musicians}
    assert "madurai_mani_iyer" in ids


def test_musicians_who_performed_raga_ravichandrika(graph: CarnaticGraph) -> None:
    """
    get_musicians_who_performed_raga returns musicians who performed in Ravichandrika.
    Madurai Mani Iyer must be in the list.
    """
    musicians = graph.get_musicians_who_performed_raga("ravichandrika")
    ids = {m["id"] for m in musicians}
    assert "madurai_mani_iyer" in ids


# ── Concert programme ──────────────────────────────────────────────────────────

def test_concert_programme_jamshedpur(graph: CarnaticGraph) -> None:
    """get_concert_programme returns a structured programme for Jamshedpur 1961."""
    prog = graph.get_concert_programme("jamshedpur_1961_madurai_mani_iyer")
    assert prog is not None
    assert "recording" in prog
    assert "sessions" in prog
    assert len(prog["sessions"]) == 1
    session = prog["sessions"][0]
    assert len(session["performances"]) > 0
    # Check that composition resolution works
    perf_5 = next(
        (p for p in session["performances"] if p["performance_index"] == 5), None
    )
    assert perf_5 is not None
    assert perf_5["composition"] is not None
    assert perf_5["composition"]["id"] == "maakelara_vicaaramu"
    assert perf_5["raga"] is not None
    assert perf_5["raga"]["id"] == "ravichandrika"


def test_concert_programme_nonexistent_returns_none(graph: CarnaticGraph) -> None:
    """get_concert_programme returns None for an unknown recording id."""
    assert graph.get_concert_programme("nonexistent_concert_xyz") is None
