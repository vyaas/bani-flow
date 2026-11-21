---
name: bani-wheel
description: Change the Bani Flow mela-janya/raga wheel — wheel SVG geometry, mela/melakarta/chakra sectors, labels, expansion, detail/composition/recording cards, wheel sync, and app view switching. Use whenever the prompt mentions the wheel, raga/mela/melakarta/mela-janya/chakra view, WDP, wheel annotations, or switchView; not for ordinary panel lists, graph-canvas internals, or player chrome.
---

# 🎛️ Mela-janya View — Raga Wheel Surgeon

Your domain is `#raga-wheel` and its detail cards, primarily
`carnatic/render/templates/raga_wheel.js`. This module also owns app-level view
switching. Never edit `.json` data (→ bani-librarian), the Python pipeline
(→ bani-coder), or the derived `carnatic/graph.html`.

## Resolve before editing

Read **`carnatic/render/UIMAP.md` §4** for current DOM hooks, entry points,
state, CSS, ADRs, and connections. Add §6.1 when changing script dependencies,
§6.2 for filter/panel/player synchronization, and recipe R2 for peripheral
annotations. Do not grep-thrash templates to rediscover map facts.

Core entry points:

- `window.drawRagaWheel()` — full redraw and `_wdpData` computation.
- `polar`, `polarRad`, `sectorPath`, `solveRingLayout` — the geometry core;
  reuse these instead of hand-rolling wheel math.
- `_labelWithBg` / `_bringLabelsToFront` — labels and annotations.
- `_expandMela` → `_expandComps` → `_expandMusicians`, plus `_collapseAll` —
  the expansion chain.
- `_openWheelDetailPanel`, `_openCompPanel`, `_openRecPanel`, and their close /
  positioning functions — the telescoping card chain.
- `syncRagaWheelToFilter` / `syncWheelFromBaniSubject` / `orientRagaWheel` —
  bani-filter synchronization; `window.refitRagaWheel()` preserves open state.
- `switchView('graph'|'raga')`, `showRagaWheel`, `hideRagaWheel` — app view
  switching lives here even when the destination is the graph.

## Hard rules

- **Theme is the single source of truth.** Use `THEME`, `getCakraColor`, and
  `_readChipTokens()` / `_readChipSpacingK()`; never hardcode hex or px.
- **Respect script load order** (`UIMAP.md` §6.1): the wheel consumes player and
  graph/timeline globals and loads before `bani_flow.js`.
- **Preserve the filter bus.** Read/write bani subject state only through the
  established `activeBaniFilter` and sync APIs; call the paired refresh.
- Reuse `_wdpData` and geometry/label helpers. Keep desktop card chaining and
  mobile fallback behaviour distinct, and preserve pan/zoom via
  `_applyTransform()` and state-preserving refits.

## Render gate (never skip)

```bash
if [ -d .venv ]; then source .venv/bin/activate; else source .bani-flow/bin/activate; fi
bani-render && python3 carnatic/cli.py validate
```

Confirm layout/interaction visually via `bani-serve`. Behaviour changes need
paired coverage from bani-tester. Keep `test_ui_surface_map_drift.py` green; if
an entry point or DOM hook changed, update `UIMAP.md` in the same commit.

Commit: `render(wheel): ...`; cite `[ADR: ADR-NNN]` when implementing one.
