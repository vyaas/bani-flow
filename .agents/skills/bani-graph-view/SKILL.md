---
name: bani-graph-view
description: Change the Bani Flow guru-shishya graph view — the Cytoscape canvas, lineage graph, trinity/timeline layouts, canvas filters, node/edge styling, overlay labels, camera, and graph interactions. Use whenever the prompt mentions graph view, guru-shishya graph/canvas, lineage graph, Cytoscape, timeline layout, node labels, relayout, or canvas filtering; not for musician-panel recordings, wheel rendering, or player chrome.
---

# 🎛️ Guru-shishya View — Graph Canvas Surgeon

Your domain is the graph canvas at `#cy`, primarily
`carnatic/render/templates/graph_view.js` and `timeline_view.js`, plus the
presentation registries that style it. Never edit `.json` data
(→ bani-librarian), Python pipeline orchestration (→ bani-coder), or the derived
`carnatic/graph.html`.

## Resolve before editing

Read **`carnatic/render/UIMAP.md` §3** for current DOM hooks, entry points,
state, CSS, ADRs, and connections. Add §6.1 when changing script dependencies,
§6.2 when selection or view switching crosses elements, and §6.4 for viewport
insets/refits. Do not grep-thrash templates to rediscover map facts.

Core entry points:

- `const cy = cytoscape({...})` — canvas initialization and node/edge styling.
- `selectNode(node)` — canvas selection funnel into the musician panel.
- `orientToNode(nodeId)` / `focusNode(node)` — camera control.
- `applyTrinityTriangleLayout()` / `applyTimelineLayout()` / `relayout()` —
  layouts; `currentLayout` is shared with the view switcher.
- `buildFilterDropdowns()` / `applyChipFilters()` / `clearAllChipFilters()` —
  canvas filters.
- `scheduleCyChipSync()` / `_syncOverlayChipPositions()` / `applyZoomLabels()`
  — overlay labels.

## Hard rules

- **Theme is the single source of truth.** Use `theme.py`/`THEME` tokens and
  existing registries. Canvas era colors, node sizes, and instrument shapes
  live in `graph_builder.py`; coordinate Python changes with bani-coder rather
  than duplicating them in JS.
- **Respect script load order** (`UIMAP.md` §6.1). `timeline_view.js` and
  `raga_wheel.js` consume graph/player globals in a deliberate sequence.
- `switchView` belongs to `raga_wheel.js`, not this module. Preserve its
  re-entry resize/layout contract and the `activeBaniFilter` dimming behaviour.
- Node selection populates the musician panel through `selectNode`; pair with
  bani-musician-panel for panel content and bani-wheel for view-switcher work.

## Render gate (never skip)

```bash
if [ -d .venv ]; then source .venv/bin/activate; else source .bani-flow/bin/activate; fi
bani-render && python3 carnatic/cli.py validate
```

Confirm layout/interaction visually via `bani-serve`. Behaviour changes need
paired coverage from bani-tester. Keep `test_ui_surface_map_drift.py` green; if
an entry point or DOM hook changed, update `UIMAP.md` in the same commit.

Commit: `render(graph-view): ...`; cite `[ADR: ADR-NNN]` when implementing one.
