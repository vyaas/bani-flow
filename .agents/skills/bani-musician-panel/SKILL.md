---
name: bani-musician-panel
description: Change the Bani Flow musician/right panel — musician selection display, node header, lineage popup, recordings panel/list, filters, sections, rows, and interactions. Use whenever the prompt mentions the musician panel, right panel/sidebar, node panel, recordings panel, or a selected musician's content; not for graph-canvas layout, the bani-flow/left panel, wheel geometry, or standalone player chrome.
---

# 🎛️ Musician Panel — Right Panel Surgeon

Your domain is `#musician-panel` + `#recordings-panel` inside `#right-sidebar`.
Never edit `.json` data (→ bani-librarian), the Python pipeline
(→ bani-coder), or the derived `carnatic/graph.html`.

## Resolve before editing

Read **`carnatic/render/UIMAP.md` §2** for current DOM hooks, entry points,
state, CSS, ADRs, and connections. Add §6.1 when changing script dependencies,
§6.2 when the task crosses elements, and recipe R3 when adding a panel section.
Do not grep-thrash templates to rediscover facts already in the map.

**The panel is split across two modules — the primary gotcha:**

- `graph_view.js` owns selection and the header/lineage zone. Its funnel is
  `selectNode(node, {fromHistory, revealPanel})`, which calls
  `buildLineagePanel(nodeId)` and `buildRecordingsList(...)`.
- `media_player.js` owns the recordings body through `buildRecordingsList` and
  its raga/concert/composition/playlist/lecdem builders.

A musician-panel task commonly touches both. Other key contracts include
`window.clearMusicianPanel()`, `window.PanelNav`, and
`applyPanelContentFilter('musician', q)`.

## Hard rules

- **Theme is the single source of truth.** Use `theme.py` tokens, `THEME`, and
  `:root` vars; never hardcode hex or px in templates. `--right-panel-width` is
  data-derived (ADR-128 D7), not a CSS constant.
- **Respect script load order** (`UIMAP.md` §6.1), especially
  `panel_components.js` before `media_player.js`.
- Reuse `buildSection`, row/chip primitives, `PanelNav`, and queue registration
  rather than implementing local variants. Recording playback/enqueue behaviour
  must use the established player and `MediaQueue` APIs.
- Keep canvas behaviour with bani-graph-view and queue/chrome internals with
  bani-player; read `UIMAP.md` §6.2 and pair skills for cross-element work.

## Render gate (never skip)

```bash
if [ -d .venv ]; then source .venv/bin/activate; else source .bani-flow/bin/activate; fi
bani-render && python3 carnatic/cli.py validate
```

Confirm layout/interaction visually via `bani-serve`. Behaviour changes need
paired coverage from bani-tester. Keep `test_ui_surface_map_drift.py` green; if
an entry point or DOM hook changed, update `UIMAP.md` in the same commit.

Commit: `render(musician-panel): ...`; cite `[ADR: ADR-NNN]` when implementing
one.
