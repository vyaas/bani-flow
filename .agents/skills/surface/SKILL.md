---
name: surface
description: Manipulate the Bani Flow UI surface — the five graphical elements (bani-flow panel, musician panel, guru-shishya view, mela-janya wheel, media player/queue), their layout, styling, and interaction logic. Use when the prompt speaks in UI vocabulary ("add a button to the player", "annotate the wheel", "change the musician panel") rather than pipeline or data terms.
---

# 🎛️ Surface — UI Surgeon

Your domain is the presentation layer: `carnatic/render/templates/**`
(`base.html` + all `.js`), `render/theme.py`, `render/instruments.py`.
You never edit `.json` data (→ librarian) or the Python pipeline
(`html_generator.py` orchestration excepted with coder) — and you never touch
`carnatic/graph.html`, the derived artefact.

## The five elements (resolution table — resolve BEFORE editing)

| User says | Canonical element | DOM root | Module |
|---|---|---|---|
| bani flow, left panel, trail | Bani-flow panel | `#bani-flow-panel` | `bani_flow.js` — funnel: `applyBaniFilter` |
| musician panel, right panel | Musician panel | `#musician-panel` + `#recordings-panel` | **split:** `graph_view.js` (`selectNode`) + `media_player.js` (`buildRecordingsList`) |
| graph view, lineage, canvas | Guru-shishya view | `#cy` | `graph_view.js` + `timeline_view.js` |
| wheel, mela, melakarta, chakra | Mela-janya view | `#raga-wheel` | `raga_wheel.js` — `drawRagaWheel`; **also owns `switchView`** |
| player, now playing, queue, playlist | Media player | dynamic `.media-player` | `media_player.js` — `openOrFocusPlayer`, `window.MediaQueue` |

Depth lives in **`carnatic/render/UIMAP.md`** (ADR-174): read only the one
element section your task touches, plus §6.2 (sync graph) if the task crosses
elements. Entry points, state globals, CSS hooks, ADRs, and task recipes are
there — do not grep-thrash the templates to rediscover them.

## Hard rules

- **Vocabulary first.** Resolve the prompt to element → DOM id → entry
  points via the table + UIMAP before any edit.
- **Theme is the single source of truth.** Colors, spacing, typography come
  from `theme.py` (`THEME` global / `:root` vars — ADR-028). Never hardcode
  hex or px in templates. Panel widths are data-derived (ADR-128 D7).
- **Respect the load-order contract** (`html_generator.py`; UIMAP §6.1). New
  template code that needs another module's globals must load after it.
- **Shared state is deliberate.** `activeBaniFilter` is the bus between the
  bani panel and the wheel; `MediaQueue` is the single queue model. Mutate
  them only through their established APIs and call the paired refresh
  (`_refreshQueuePanels`, `syncRagaWheelToFilter`, …).
- **Both player paths.** Player chrome changes go in `buildPlayerBar` AND the
  mobile path (`_openMobilePlayer`); queue changes respect the `MediaQueue`
  invariants (normalised MediaRef; recompute `index` from `currentKey`).

## Render gate (never skip)

```bash
source .venv/bin/activate && bani-render && python3 carnatic/cli.py validate
```

Then confirm the change visually via `bani-serve` when layout/interaction is
affected. If behaviour changed, expect a paired `test(suite)` commit from the
tester skill — the drift guard `test_ui_surface_map_drift.py` must stay green;
a red drift test means update `UIMAP.md` in the same commit.

Commit: `render(<element>): ...` where element is `bani-panel` |
`musician-panel` | `graph-view` | `wheel` | `player` | `theme`; cite
`[ADR: ADR-NNN]` when implementing one.
