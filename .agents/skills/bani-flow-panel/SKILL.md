---
name: bani-flow-panel
description: Change the Bani Flow left panel and listening trail — its layout, styling, subject chips, filters, trail rows, playlists, lecdem strip, and interactions. Use whenever the prompt mentions bani flow, the left panel/sidebar, trail panel, listening trail, or bani subject/filter behaviour; not for the musician/right panel, graph canvas, raga wheel, or media-player chrome.
---

# 🎛️ Bani-flow Panel — Left Panel Surgeon

Your domain is the Bani-flow panel: DOM root `#bani-flow-panel` inside
`#left-sidebar`, primarily `carnatic/render/templates/bani_flow.js`, with
`panel_components.js`, `empty_tutorials.js`, and `mobile.js` when their panel
contracts are involved. Never edit `.json` data (→ bani-librarian), the Python
pipeline (→ bani-coder), or the derived `carnatic/graph.html`.

## Resolve before editing

Read **`carnatic/render/UIMAP.md` §1** for current DOM hooks, entry points,
state, CSS, ADRs, and connections. Add §6.1 when changing script dependencies,
§6.2 when the task crosses elements, and recipe R3 when adding a panel section.
Do not grep-thrash templates to rediscover facts already in the map.

Core entry points:

- `applyBaniFilter(type, id)` — the funnel for every raga, composition,
  performance, or YouTube subject.
- `clearBaniFilter(opts)` / `triggerBaniSearch(type, id, fromHistory)` —
  reset and search-driven entry.
- `buildListeningTrail(...)` and its tree/row builders — trail rendering.
- `applyPanelContentFilter('bani', q)` — shared content filtering.

## Hard rules

- **Theme is the single source of truth.** Use `theme.py` tokens, `THEME`, and
  `:root` vars; never hardcode hex or px in templates. `--left-panel-width` is
  data-derived (ADR-128 D7), not a CSS constant.
- **Respect script load order** (`UIMAP.md` §6.1). Code using another module's
  globals must load after that module.
- **Preserve the filter bus.** `activeBaniFilter` connects this panel to the
  wheel. Mutate it through established APIs and call the paired refresh such as
  `syncRagaWheelToFilter`; do not create a parallel subject state.
- Reuse `buildSection`, row/chip primitives, `PanelNav`, and queue registration
  rather than implementing local variants. Pair with the owning element skill
  for wheel, musician-panel, or player changes.

## Render gate (never skip)

```bash
if [ -d .venv ]; then source .venv/bin/activate; else source .bani-flow/bin/activate; fi
bani-render && python3 carnatic/cli.py validate
```

Confirm layout/interaction visually via `bani-serve`. Behaviour changes need
paired coverage from bani-tester. Keep `test_ui_surface_map_drift.py` green; if
an entry point or DOM hook changed, update `UIMAP.md` in the same commit.

Commit: `render(bani-panel): ...`; cite `[ADR: ADR-NNN]` when implementing one.
