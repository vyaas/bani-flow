"""One-shot script: render PWA icons from the favicon SVG.

Usage (from repo root, venv active):
    python3 carnatic/generate_pwa_icons.py

Outputs:
    assets/icons/icon-192.png
    assets/icons/icon-512.png

Requires cairosvg (dev-only):
    pip install cairosvg
"""

import os
import sys
import cairosvg

# Import the canonical favicon SVG generator so icons stay in sync with the
# in-app favicon design.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from carnatic.render.html_generator import _generate_favicon_svg

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

svg_bytes = _generate_favicon_svg().encode()

for size in (192, 512):
    out_path = os.path.join(OUT_DIR, f"icon-{size}.png")
    cairosvg.svg2png(bytestring=svg_bytes, write_to=out_path, output_width=size, output_height=size)
    print(f"  wrote {out_path}")

print("Done.")
