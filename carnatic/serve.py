#!/usr/bin/env python3
"""
serve.py — Serve graph.html over localhost so YouTube embeds work.

YouTube blocks iframes from file:// (null origin).
Serving via http://localhost gives a real origin that YouTube accepts,
identical to how TiddlyWiki's local server works.

Usage:
    python3 serve.py          # serves on port 8765
    python3 serve.py 9000     # custom port
    gstree-serve              # installed entry-point (same as above)
"""

import http.server
import socketserver
import webbrowser
import sys
import os
from pathlib import Path

ROOT = Path(__file__).parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass  # silence request logs — keep terminal clean


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    os.chdir(ROOT)
    url = f"http://localhost:{port}/graph.html"
    print(f"  serving  {ROOT}/graph.html")
    print(f"  open     {url}")
    print(f"  stop     Ctrl+C\n")
    webbrowser.open(url)
    with socketserver.TCPServer(("", port), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped.")


if __name__ == "__main__":
    main()
