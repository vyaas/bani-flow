"""
carnatic/render/__init__.py — Public API for the render package.

The `main` symbol is the entry point for the `bani-render` CLI command
(see pyproject.toml [project.scripts]).  It is imported lazily from _main
to avoid circular imports: _main uses absolute imports of sibling modules,
which would re-trigger __init__ if they were relative.
"""
from .data_loaders import load_compositions, load_recordings, yt_video_id, timestamp_to_seconds
from .data_transforms import build_recording_lookups, build_composition_lookups
from .graph_builder import build_elements
from .html_generator import render_html
from .sync import sync_graph_json


def main() -> None:
    """Thin shim so pyproject.toml entry point `carnatic.render:main` works."""
    from carnatic.render._main import main as _main
    _main()


__all__ = [
    "load_compositions",
    "load_recordings",
    "yt_video_id",
    "timestamp_to_seconds",
    "build_recording_lookups",
    "build_composition_lookups",
    "build_elements",
    "render_html",
    "sync_graph_json",
    "main",
]
