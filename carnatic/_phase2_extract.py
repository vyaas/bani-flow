#!/usr/bin/env python3
"""
_phase2_extract.py — One-shot extractor for Phase 2 of the render-refactor plan.

Reads carnatic/render/html_generator.py, extracts the embedded f-string content,
unescapes {{ → { and }} → }, then splits into template files under
carnatic/render/templates/.

Also rewrites carnatic/render/html_generator.py as a ~80-line assembler that
loads those template files and injects Python-generated JS data.

Run from project root:
    python3 carnatic/_phase2_extract.py [--dry-run]
"""
import re
import sys
from pathlib import Path

DRY_RUN = "--dry-run" in sys.argv

ROOT      = Path(__file__).parent          # carnatic/
HG_FILE   = ROOT / "render" / "html_generator.py"
TMPL_DIR  = ROOT / "render" / "templates"

# ── 1. Read source ─────────────────────────────────────────────────────────────
src_lines = HG_FILE.read_text(encoding="utf-8").splitlines(keepends=True)
print(f"[READ] {HG_FILE}  ({len(src_lines)} lines)")

# ── 2. Locate the f-string boundaries ─────────────────────────────────────────
# The f-string starts with:  return f"""<!DOCTYPE html>
# and ends with the closing: """
fstring_start = None
fstring_end   = None

for i, line in enumerate(src_lines):
    if fstring_start is None and line.strip().startswith('return f"""'):
        fstring_start = i + 1   # line AFTER the return f""" line (0-based)
    if fstring_start is not None and i > fstring_start and line.strip() == '"""':
        fstring_end = i         # the closing """ line (exclusive)
        break

if fstring_start is None or fstring_end is None:
    print("[ERROR] Could not locate f-string boundaries in html_generator.py")
    sys.exit(1)

# The first line of the f-string content is the `return f"""<!DOCTYPE html>` line itself
# We want everything from the `<!DOCTYPE html>` part onward.
# The return line is: `    return f"""<!DOCTYPE html>\n`
# So fstring_start-1 is that line; we take from the `<!DOCTYPE` part.
return_line = src_lines[fstring_start - 1]
first_content = return_line[return_line.index('"""') + 3:]  # after the opening """

raw_lines = [first_content] + src_lines[fstring_start:fstring_end]
raw_content = "".join(raw_lines)

print(f"[EXTRACT] f-string content: {len(raw_lines)} lines")

# ── 3. Unescape {{ → { and }} → } ─────────────────────────────────────────────
# After unescaping, all CSS/JS braces become single-brace.
# The Python variable interpolations (e.g. {elements_json}) were already
# single-brace in the f-string, so they survive as template placeholders.
unescaped = raw_content.replace("{{", "\x00LBRACE\x00").replace("}}", "\x00RBRACE\x00")
unescaped = unescaped.replace("\x00LBRACE\x00", "{").replace("\x00RBRACE\x00", "}")

unescaped_lines = unescaped.splitlines(keepends=True)
print(f"[UNESCAPE] {len(unescaped_lines)} lines after unescaping")

# ── 4. Identify split points in the unescaped content ─────────────────────────
# We need to find the line numbers (0-based in unescaped_lines) for:
#   - <script> tag  → end of base.html, start of data injection block
#   - end of data injection block → start of graph_view.js
#   - media player comment → start of media_player.js
#   - selectNode comment → continuation of graph_view.js (appended)
#   - timeline layout comment → start of timeline_view.js
#   - three-view selector comment → start of raga_wheel.js
#   - bani flow comment → start of bani_flow.js
#   - shared dropdown comment → start of search.js
#   - </script> → end of search.js

def find_line(pattern, start=0):
    """Return 0-based index of first line matching pattern, starting from `start`."""
    rx = re.compile(pattern)
    for i in range(start, len(unescaped_lines)):
        if rx.search(unescaped_lines[i]):
            return i
    raise ValueError(f"Pattern not found: {pattern!r}")

script_open_idx      = find_line(r"^<script>")
data_end_idx         = find_line(r"^// ── Static lookup tables", script_open_idx)
graph_view_start_idx = data_end_idx   # CAKRA_NAMES + cytoscape init
media_player_idx     = find_line(r"^// ── media player manager", graph_view_start_idx)
select_node_idx      = find_line(r"^// ── selectNode", media_player_idx)
timeline_idx         = find_line(r"^// ── timeline layout", select_node_idx)
raga_wheel_idx       = find_line(r"^// ── Three-view selector", timeline_idx)
bani_flow_idx        = find_line(r"^// ── Bani Flow", raga_wheel_idx)
search_idx           = find_line(r"^// ── shared dropdown helper", bani_flow_idx)
script_close_idx     = find_line(r"^</script>", search_idx)

print(f"[SPLIT POINTS]")
print(f"  <script>              line {script_open_idx}")
print(f"  data block end        line {data_end_idx}")
print(f"  media_player start    line {media_player_idx}")
print(f"  selectNode (gv cont.) line {select_node_idx}")
print(f"  timeline start        line {timeline_idx}")
print(f"  raga_wheel start      line {raga_wheel_idx}")
print(f"  bani_flow start       line {bani_flow_idx}")
print(f"  search start          line {search_idx}")
print(f"  </script>             line {script_close_idx}")

# ── 5. Slice template segments ─────────────────────────────────────────────────

def join_lines(lines):
    return "".join(lines)

# base.html: from <!DOCTYPE html> up to (not including) <script>
# Replace the <script> line with <!-- INJECT_SCRIPTS --> and close </body></html>
base_html_lines = unescaped_lines[:script_open_idx]
# The last few lines after </div> closing tags should be:
#   </div>
#   </div>
# Then we add the inject placeholder and close tags
base_html = join_lines(base_html_lines).rstrip("\n")
base_html += "\n<!-- INJECT_SCRIPTS -->\n</body>\n</html>\n"

# Data injection block: lines from <script>+1 up to data_end_idx (exclusive)
# These stay in html_generator.py — we just note the variable names used
data_block_lines = unescaped_lines[script_open_idx + 1 : data_end_idx]
data_block = join_lines(data_block_lines)
print(f"\n[DATA BLOCK] ({len(data_block_lines)} lines) — stays in html_generator.py:")
for ln in data_block_lines:
    print("  " + ln, end="")

# graph_view.js: lines from data_end_idx up to (not including) media_player_idx
# PLUS lines from select_node_idx up to (not including) timeline_idx
graph_view_part1 = join_lines(unescaped_lines[data_end_idx:media_player_idx])
graph_view_part2 = join_lines(unescaped_lines[select_node_idx:timeline_idx])
graph_view_js = graph_view_part1 + graph_view_part2

# media_player.js: lines from media_player_idx up to (not including) select_node_idx
media_player_js = join_lines(unescaped_lines[media_player_idx:select_node_idx])

# timeline_view.js: lines from timeline_idx up to (not including) raga_wheel_idx
timeline_view_js = join_lines(unescaped_lines[timeline_idx:raga_wheel_idx])

# raga_wheel.js: lines from raga_wheel_idx up to (not including) bani_flow_idx
raga_wheel_js = join_lines(unescaped_lines[raga_wheel_idx:bani_flow_idx])

# bani_flow.js: lines from bani_flow_idx up to (not including) search_idx
bani_flow_js = join_lines(unescaped_lines[bani_flow_idx:search_idx])

# search.js: lines from search_idx up to (not including) </script>
search_js = join_lines(unescaped_lines[search_idx:script_close_idx])

# ── 6. Write template files ────────────────────────────────────────────────────
templates = {
    "base.html":        base_html,
    "graph_view.js":    graph_view_js,
    "media_player.js":  media_player_js,
    "timeline_view.js": timeline_view_js,
    "raga_wheel.js":    raga_wheel_js,
    "bani_flow.js":     bani_flow_js,
    "search.js":        search_js,
}

if not DRY_RUN:
    TMPL_DIR.mkdir(exist_ok=True)

for name, content in templates.items():
    line_count = content.count("\n")
    print(f"\n[TEMPLATE] {name}  ({line_count} lines)")
    if DRY_RUN:
        print(f"  [DRY-RUN] would write {TMPL_DIR / name}")
    else:
        (TMPL_DIR / name).write_text(content, encoding="utf-8")
        print(f"  [WRITE] {TMPL_DIR / name}")

# ── 7. Rewrite html_generator.py ──────────────────────────────────────────────
# Identify the exact variable names used in the data block
# by scanning data_block_lines for {var_name} patterns
placeholder_vars = re.findall(r"\{(\w+)\}", data_block)
print(f"\n[PLACEHOLDERS] found in data block: {placeholder_vars}")

new_hg = '''\
"""
carnatic/render/html_generator.py — Assembles final graph.html from templates.

render_html() loads template files from carnatic/render/templates/ and injects
Python-generated JS data (elements, compositions, recordings, lookups).
Phase 2 of the render-refactor plan.
"""
import json
from pathlib import Path
from .graph_builder import ERA_COLORS, INSTRUMENT_SHAPES

TEMPLATES_DIR = Path(__file__).parent / "templates"


def _load(name: str) -> str:
    return (TEMPLATES_DIR / name).read_text(encoding="utf-8")


def render_html(
    elements: list[dict],
    graph: dict,
    comp_data: dict,
    composition_to_nodes: dict,
    raga_to_nodes: dict,
    recordings_data: dict,
    musician_to_performances: dict,
    composition_to_performances: dict,
    raga_to_performances: dict,
) -> str:
    node_count = len(graph["nodes"])
    edge_count = len(graph["edges"])

    # ── Python-generated JS data block ────────────────────────────────────────
    # These constants are injected directly into the <script> block so that
    # the template JS files can reference them as globals.
    elements_json            = json.dumps(elements, indent=2, ensure_ascii=False)
    ragas_json               = json.dumps(comp_data.get("ragas", []), indent=2, ensure_ascii=False)
    composers_json           = json.dumps(comp_data.get("composers", []), indent=2, ensure_ascii=False)
    compositions_json        = json.dumps(comp_data.get("compositions", []), indent=2, ensure_ascii=False)
    comp_to_nodes_json       = json.dumps(composition_to_nodes, indent=2, ensure_ascii=False)
    raga_to_nodes_json       = json.dumps(raga_to_nodes, indent=2, ensure_ascii=False)
    recordings_json          = json.dumps(recordings_data.get("recordings", []), indent=2, ensure_ascii=False)
    musician_to_perf_json    = json.dumps(musician_to_performances, indent=2, ensure_ascii=False)
    composition_to_perf_json = json.dumps(composition_to_performances, indent=2, ensure_ascii=False)
    raga_to_perf_json        = json.dumps(raga_to_performances, indent=2, ensure_ascii=False)

    data_js = (
        f"const elements = {elements_json};\\n"
        f"\\n"
        f"// ── Compositions data (injected by render.py) ──────────────────────────────\\n"
        f"const ragas        = {ragas_json};\\n"
        f"const composers    = {composers_json};\\n"
        f"const compositions = {compositions_json};\\n"
        f"const compositionToNodes = {comp_to_nodes_json};\\n"
        f"const ragaToNodes        = {raga_to_nodes_json};\\n"
        f"\\n"
        f"// ── Recordings data (injected by render.py) ─────────────────────────────────\\n"
        f"const recordings             = {recordings_json};\\n"
        f"const musicianToPerformances = {musician_to_perf_json};\\n"
        f"const compositionToPerf      = {composition_to_perf_json};\\n"
        f"const ragaToPerf             = {raga_to_perf_json};\\n"
    )

    # ── Load templates ────────────────────────────────────────────────────────
    base         = _load("base.html")
    graph_view   = _load("graph_view.js")
    media_player = _load("media_player.js")
    timeline     = _load("timeline_view.js")
    raga_wheel   = _load("raga_wheel.js")
    bani_flow    = _load("bani_flow.js")
    search       = _load("search.js")

    # ── Substitute placeholders in base.html ──────────────────────────────────
    base = base.replace("{node_count}", str(node_count))
    base = base.replace("{edge_count}", str(edge_count))

    # ── Assemble <script> block ───────────────────────────────────────────────
    script_block = "\\n".join([
        "<script>",
        data_js,
        graph_view,
        media_player,
        timeline,
        raga_wheel,
        bani_flow,
        search,
        "</script>",
    ])

    # ── Inject script block into base.html ────────────────────────────────────
    html = base.replace("<!-- INJECT_SCRIPTS -->", script_block)
    return html
'''

if DRY_RUN:
    print(f"\n[DRY-RUN] would rewrite {HG_FILE} ({new_hg.count(chr(10))} lines)")
else:
    HG_FILE.write_text(new_hg, encoding="utf-8")
    print(f"\n[WRITE] {HG_FILE}  ({new_hg.count(chr(10))} lines)")

print("\n[DONE] Phase 2 extraction complete.")
print("Next: python3 carnatic/render.py")
