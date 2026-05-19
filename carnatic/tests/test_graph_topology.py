"""
test_graph_topology.py — Structural invariants of the musician graph.

Validates: no self-loops, no duplicate edges, no isolated nodes
(every node has at least one edge or one recording appearance).
"""

import pytest
from carnatic.graph_api import CarnaticGraph
from carnatic.writer import VALID_INSTRUMENTS


def test_no_self_loops(graph: CarnaticGraph) -> None:
    """No edge should have source == target."""
    for edge in graph.get_all_edges():
        assert edge["source"] != edge["target"], (
            f"Self-loop detected on node '{edge['source']}'"
        )


def test_no_duplicate_edges(graph: CarnaticGraph) -> None:
    """No (source, target) pair should appear more than once."""
    seen: set[tuple[str, str]] = set()
    for edge in graph.get_all_edges():
        pair = (edge["source"], edge["target"])
        assert pair not in seen, (
            f"Duplicate edge: {pair[0]} → {pair[1]}"
        )
        seen.add(pair)


def test_edge_confidence_in_range(graph: CarnaticGraph) -> None:
    """Every edge confidence must be in [0.0, 1.0]."""
    for edge in graph.get_all_edges():
        conf = edge.get("confidence", 1.0)
        assert 0.0 <= conf <= 1.0, (
            f"Edge {edge['source']} → {edge['target']}: confidence {conf} out of range"
        )


# Known isolates: nodes with no edges, no recordings, and no youtube[] entries.
# These are data quality gaps to be resolved by the Librarian.
# Adding a new id here is a deliberate editorial decision — not a test fix.
_KNOWN_ISOLATES: frozenset[str] = frozenset({
    "muthuswami_dikshitar",  # Trinity composer-node; no guru-shishya edges yet
    "a_kanyakumari",         # Violinist; no edges or recordings yet
    # ADR-114 §5: Hindustani musicians intentionally have no guru-shishya edges.
    # They are isolated until HER recordings are added via add-her-recording.
    "nikhil_banerjee",       # Sitar; Hindustani; no recordings yet
    "hariprasad_chaurasia",  # Bansuri; Hindustani; no recordings yet
    "ajoy_chakrabarty",      # Vocal; Hindustani; no recordings yet
    # ── Performer data gaps: known musicians with no youtube/recordings added yet
    "kumaresh_rajagopalan",  # Violin; contemporary; prominent performer — Librarian to add recordings
    "rs_jayalakshmi",        # Veena; living_pillars era — Librarian to add recordings
    # ── Composition gaps: poet-saints whose works are Carnatic repertoire but
    #    no compositions referencing them have been added yet
    "thayumanavar",          # Tamil saint-poet 1705; kirtanams in repertoire — Librarian to add compositions
    "basava",                # Lingayat saint 1131; vachanas sung in concerts — Librarian to add compositions
    "perumal_murugan",       # Tamil poet b.1966; poems set to music — Librarian to add compositions or verify significance
    # ── Thin nodes: no birth year, no recordings, significance unverified
    "madurai_srinivasa_iyengar",       # Vocal; golden_age; no birth year — Librarian to verify and add data
    "t_kesavulu",                      # Violin; golden_age; no birth year — Librarian to verify and add data
    "dv_gundappa",                     # Kannada poet/philosopher; not a musician per se — Librarian to verify significance
    # ── Unresolved open questions (see carnatic/.clinerules)
    "nagapatnam_veeraswamy_pillai",    # Vocal; bridge era; no Wikipedia article found — review for removal
    "tarangampadi_panchanada_iyer",    # No era/instrument/born; completely sparse — review for removal
})


def test_no_completely_isolated_nodes(graph: CarnaticGraph) -> None:
    """
    Every musician node must appear in at least one of:
      - a guru-shishya edge (source or target)
      - a structured recording (primary_musician_ids)
      - a legacy youtube[] entry on their own node
      - a composition's composer_id (ADR-110: composers are musicians)

    Pure isolates (none of the above) are a data quality signal.
    Nodes that only have youtube[] entries are considered connected during
    the migration period (youtube[] → recordings/ migration is in progress
    per unified_recordings_architecture.md).

    Known isolates are listed in _KNOWN_ISOLATES above. Any node that is
    isolated but NOT in that list will cause this test to fail — that is
    the intended behaviour (new isolates must be explicitly acknowledged).
    """
    # Build sets of nodes that appear in edges
    edge_nodes: set[str] = set()
    for edge in graph.get_all_edges():
        edge_nodes.add(edge["source"])
        edge_nodes.add(edge["target"])

    # Build set of nodes that appear in structured recordings
    recording_nodes: set[str] = set()
    for ref in graph.get_all_recording_refs():
        for mid in ref.get("primary_musician_ids", []):
            recording_nodes.add(mid)

    # Build set of nodes that have at least one youtube[] entry (legacy schema)
    youtube_nodes: set[str] = set()
    for node in graph.get_all_musicians():
        if node.get("youtube"):
            youtube_nodes.add(node["id"])

    # ADR-110: composers are musicians; a composer_id reference on any composition
    # counts as a valid connection — these nodes are not isolated.
    composer_nodes: set[str] = set()
    for comp in graph.get_all_compositions():
        cid = comp.get("composer_id")
        if cid:
            composer_nodes.add(cid)

    connected = edge_nodes | recording_nodes | youtube_nodes | composer_nodes

    unexpected_isolates = [
        node["id"]
        for node in graph.get_all_musicians()
        if node["id"] not in connected and node["id"] not in _KNOWN_ISOLATES
    ]
    assert not unexpected_isolates, (
        f"New isolated nodes detected (no edges, no recordings, no youtube[], no composer_id): "
        f"{unexpected_isolates}\n"
        f"If intentional, add them to _KNOWN_ISOLATES in test_graph_topology.py."
    )

    # Also assert that the known isolates are still actually isolated
    # (so we notice when they get connected and can remove them from the list)
    still_isolated = [mid for mid in _KNOWN_ISOLATES if mid not in connected]
    if len(still_isolated) < len(_KNOWN_ISOLATES):
        newly_connected = sorted(_KNOWN_ISOLATES - set(still_isolated))
        pytest.warns(
            UserWarning,
            match=".*",
        ) if False else None  # placeholder; emit via print for now
        print(
            f"\n[INFO] These nodes are no longer isolated and can be removed "
            f"from _KNOWN_ISOLATES: {newly_connected}"
        )


def test_all_eras_are_known(graph: CarnaticGraph) -> None:
    """Every musician node must use a recognised era value (null allowed for historical composers, ADR-110)."""
    known_eras = {
        None, "trinity", "bridge", "golden_age", "disseminator",
        "living_pillars", "contemporary",
    }
    for node in graph.get_all_musicians():
        era = node.get("era")
        assert era in known_eras, (
            f"Musician '{node['id']}': unknown era '{era}'"
        )


def test_all_instruments_are_known(graph: CarnaticGraph) -> None:
    """Every musician node must use a recognised instrument value (null allowed for composers, ADR-110).
    ADR-114 expanded the vocabulary — uses VALID_INSTRUMENTS from writer.py as the source of truth.
    """
    known_instruments = VALID_INSTRUMENTS | {None}
    for node in graph.get_all_musicians():
        instr = node.get("instrument")
        assert instr in known_instruments, (
            f"Musician '{node['id']}': unknown instrument '{instr}'"
        )
