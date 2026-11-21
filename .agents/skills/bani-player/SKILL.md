---
name: bani-player
description: Change the Bani Flow media player and playback surface — desktop/mobile player chrome, now playing, queue, playlist bar/editor, tracklist, docked video, transport, media links, and grand track search. Use whenever the prompt mentions the player, mini player, now playing, queue, playlist, Up Next, playback controls, or MediaQueue; not for graph/wheel rendering or ordinary musician/bani panel layout.
---

# 🎛️ Media Player — Playback Surgeon

Your domain is dynamically created `.media-player` instances, the playlist
bar/editor, queue, and related playback UI, primarily
`carnatic/render/templates/media_player.js` (plus `search.js` for grand track
search). Never edit `.json` data (→ bani-librarian), the Python pipeline
(→ bani-coder), or the derived `carnatic/graph.html`.

## Resolve before editing

Read **`carnatic/render/UIMAP.md` §5** for current DOM hooks, entry points,
state, CSS, ADRs, and connections. Add §6.1 when changing script dependencies,
§6.2 for cross-element queue integration, §6.4 for viewport refits, and recipe
R1 for player controls or queue operations. Do not grep-thrash templates to
rediscover map facts.

Core entry points:

- `openOrFocusPlayer` / `openPlayer` / `closePlayer` — player lifecycle.
- `buildPlayerBar` — desktop/player-bar chrome; `_openMobilePlayer` — the mobile
  path that must receive equivalent chrome changes.
- `window.MediaQueue` — the single queue model, including `playContent` and
  `addItem`; `_refreshQueuePanels()` refreshes its projections.
- `registerQueueItem` — registration from trails, recordings, search, and other
  not-yet-queued lists.
- `_dockPlayer`, `_resolveNonOverlap`, `_repositionPlayers`, and
  `_syncViewTopInset()` — docking, non-overlap, and view-window contracts.

## Hard rules

- **Theme is the single source of truth.** Use `theme.py` tokens, `THEME`, and
  `:root` vars; never hardcode hex or px in templates.
- **Respect script load order** (`UIMAP.md` §6.1). `panel_components.js` loads
  before `media_player.js`; the wheel consumes player globals later.
- **Both player paths.** Player chrome changes go in `buildPlayerBar` AND the
  mobile path (`_openMobilePlayer`) where applicable; preserve the distinct
  bare-content-player and utility-player contracts.
- **`MediaQueue` is the only queue model.** Keep MediaRefs normalized, recompute
  `index` from `currentKey` after reordering so the current track keeps playing,
  and call `_refreshQueuePanels()`. Do not create parallel queue state.
- Preserve playlist/editor, docking, z-order, non-overlap, and mobile sheet
  invariants. Pair with the owning panel/wheel skill for changes outside player
  internals.

## Render gate (never skip)

```bash
if [ -d .venv ]; then source .venv/bin/activate; else source .bani-flow/bin/activate; fi
bani-render && python3 carnatic/cli.py validate
```

Confirm layout/interaction visually via `bani-serve`. Behaviour changes need
paired coverage from bani-tester, including queue invariant tests where
relevant. Keep `test_ui_surface_map_drift.py` green; if an entry point or DOM
hook changed, update `UIMAP.md` in the same commit.

Commit: `render(player): ...`; cite `[ADR: ADR-NNN]` when implementing one.
