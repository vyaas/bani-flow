"""Generic, stateless graph-to-CSV transformer.

This module has no I/O and no side effects. It operates purely on
in-memory data structures. Report scripts wrap it with specific
column definitions and file handling.

Usage pattern::

    from carnatic.reports.csv_export import ColumnSpec, graph_to_rows, rows_to_csv

    columns = [
        ColumnSpec("id", lambda node, graph: node["id"]),
        ColumnSpec("label", lambda node, graph: node.get("label", "")),
    ]
    rows = graph_to_rows(graph_dict, columns)
    csv_text = rows_to_csv(rows, [c.name for c in columns])
"""

import csv
import io
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ColumnSpec:
    """Specification for a single CSV column.

    Attributes:
        name: Column header name in the output CSV.
        extractor: Pure function (node_dict, full_graph_dict) -> cell_value_str.
                   Must not mutate its arguments.
    """

    name: str
    extractor: Callable[[dict, dict], str]


def graph_to_rows(graph: dict, columns: list[ColumnSpec]) -> list[dict]:
    """Transform graph nodes into a list of row dicts using the given columns.

    Args:
        graph: The full graph dict (e.g. graph.json['musicians']).
               Must contain a 'nodes' list.
        columns: Ordered list of ColumnSpec instances defining the output shape.

    Returns:
        List of dicts, one per node, keyed by column name.
    """
    nodes = graph.get("nodes", [])
    return [
        {col.name: col.extractor(node, graph) for col in columns}
        for node in nodes
    ]


def rows_to_csv(rows: list[dict], fieldnames: list[str]) -> str:
    """Serialise row dicts to a CSV string.

    Args:
        rows: List of dicts as returned by graph_to_rows.
        fieldnames: Column order for the CSV header.

    Returns:
        CSV text including header row, with CRLF line endings (RFC 4180).
    """
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()
