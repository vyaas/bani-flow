# ADR-200 — Mobile chrome line: drawers ride the search bar and cover the Playlist Bar

**Status**: Accepted (user directive 2026-10-24)
**Date**: 2026-10-24
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-129 (floating chrome + safe zones),
ADR-174 (UI surface map), ADR-175 (persistent Playlist Bar), ADR-176
(non-overlap contract), ADR-184 (grand track search), ADR-185 (ephemeral bar).
**Supersedes**: ADR-175 §4's "the bar sits above the drawers and their scrims"
clause **for the mobile Playlist Bar only**. The player-surface layering clause
is unchanged.
**Scope**: `carnatic/render/templates/base.html`, `carnatic/render/UIMAP.md`
§5 / §6.4, `test_mobile_surface_layout.py`, `test_grand_search_editor.py`,
`test_view_window_layout.py`.

---

## Context

On mobile the top chrome is three stacked bands:

| band | top | height | bottom |
|---|---|---|---|
| view selector + help | 0 | 52 | 52 |
| grand search `#search-bar` | 52 | 32 | 84 |
| Playlist Bar `#playlist-bar` (ephemeral) | 112 | 54 | 166 |

`--chrome-top` was a static `176px`: the two drawers and the canvas all started
below the bar band. That produced two problems:

1. **Empty queue.** `#playlist-bar` is `display:none` (ADR-185), but the panels
   still started at 176px, leaving a ~92px dead strip between the search bar's
   bottom edge (84px) and the panel's top edge (176px).
2. **Live queue.** The bar sat at 112px — a 28px gap under the search bar — and
   the panels started *below* it at 176px, so the bar floated over the panel's
   top edge rather than being covered by it.

ADR-175 had deliberately layered the bar above the drawers so it was never
occluded. That guarantee is unnecessary on a ~375px phone: the drawers are the
primary navigation surface and there is no room to keep a second full-width
band permanently above them.

## Decision

### D1 — The search bar's bottom edge is the mobile chrome line

Mobile `--chrome-top` becomes `calc(52px + var(--search-height) + 8px)`
(≈ 92px) — the line the Playlist Bar and both drawers share, 8px under the
search bar. `--search-height` is the ADR-190 token, so the line tracks the
field if the token changes.

### D2 — The Playlist Bar sits directly under the search bar

Mobile `#playlist-bar { top: var(--chrome-top) }`, replacing the fixed `112px`.
The bar now reads as the search bar's attached band instead of a floating
second band.

### D3 — Drawers are layered above the mobile bar

Mobile `#playlist-bar` drops to `z-index: 210`: below the drawers (`220`), above
the mobile player (`205`) and the drawer scrim (`199`). An open drawer therefore
covers the bar, relegating it to the panel's background. `#search-bar` (`751`)
and its dropdown stay above everything, so search remains usable while a drawer
is open. On desktop the bar keeps its `750` layer and its clamp to the canvas
column — there the panels flank it and never overlap it.

### D4 — The canvas still never runs under the bar

Mobile `#main` padding-top becomes
`max(var(--chrome-top), calc(var(--playlist-ui-bottom) + 8px))`, mirroring the
desktop `#canvas-wrap` top wall (ADR-176). The canvas is pushed clear of the bar
when the queue is live and reclaims the strip when it is empty. `_playlistUiRect`
and the non-overlap solver are unchanged, so a docked player still avoids the
bar band.

## Consequences

- **Empty queue:** panel top is 8px under the search bar; the dead strip is gone.
- **Live queue:** the bar is 8px under the search bar; an open drawer covers it
  (the uncovered sliver to the right of a 320px drawer stays above the scrim,
  as the bar already did before this ADR).
- **Canvas/view:** still clears the bar; no new overlap.
- **Contract:** ADR-175's "nothing occludes the bar" now holds on desktop only.
  The bar stays above the mobile player and the scrim, so the drawer — not the
  scrim — is what covers it.
