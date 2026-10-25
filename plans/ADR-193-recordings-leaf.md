# ADR-193 — Composition is the branch: composer pair + recordings leaf

**Status**: Accepted (user directive 2026-10-22)
**Date**: 2026-10-22
**Author**: pi (`surface` skill)
**Depends on**: ADR-096 (Option B WDP), ADR-140 (corner-anchored WDP), ADR-174
(UI surface map), ADR-176 (inset view window), ADR-192 (telescoping raga →
composition panels).
**Scope**: `carnatic/render/templates/raga_wheel.js`, `media_player.js`
(`buildComposerChip` optional override), `base.html` (child-card CSS + fourth
DOM node), `carnatic/render/UIMAP.md` §4, `test_ui_surface_map_drift.py`.

---

## Context

ADR-192 telescopes the mela-janya view into a two-card chain: a **raga panel**
(mela + its janyas) and a **composition panel** (that raga's compositions),
opened per raga chip. The composition card was a terminal leaf — a flat list of
`♪ title` chips whose only action was to hand the composition to the Bani-flow
panel.

The user directive: *"the composition leaf becomes yet another branch point: the
panel should contain the composition and the composer side-by-side; clicking the
row opens the true leaf panel — the recordings."* The mental model is a
knowledge graph: a raga owns compositions, a composition is *composed by* a
composer, and a composition is *realised in* recordings. The Bani-flow panel
keeps the richer catalogue (lecdems, rāga-level improvisations, misc), but the
wheel should render the composition as the standout unit whose true leaves are
its recordings.

## Decision

Grow the telescoping chain to **three cards**:

1. **Raga panel** (`#wheel-detail-panel`) — unchanged (ADR-192).
2. **Composition panel** (`#wheel-comp-panel`) — each composition is now a
   **pair row**: the composition title on the left, its composer chip on the
   right, side by side. The composer chip keeps its navigable behaviour
   (`buildComposerChip`); clicking the composition half selects the row and
   opens the recordings leaf.
3. **Recordings panel** (`#wheel-rec-panel`, new) — the terminal leaf. Lists
   every PerformanceRef indexed for the selected composition
   (`compositionToPerf`, `perfToPerf`, or a YouTube-only synthetic ref), each
   row playable through `openOrFocusPlayer`. When no structured recordings are
   indexed it offers an "Open in Bani Flow" link, which is the richer surface.

Positioning follows the ADR-192 anchor rule, extended one hop: the recordings
card pins the composition panel's outward edge, vertically centred on the
selected pair row and clamped to the view window. Direction is inherited from
the composition card's side of the raga panel, so the chain always fans away
from the wheel.

**Layering / sizing:** the composition card widens to `268px` so the title and
composer chip can genuinely sit side by side; the raga card stays `228px` and
the recordings card is `244px`. All three remain desktop-only — on ≤768px a raga
tap draws the Bani-flow drawer, whose trail already carries compositions and
recordings. After the leaf opens, `_panChainIntoView()` nudges the wheel pan
(220 ms) just enough to bring the whole open chain inside the visible window
between the two sidebars, so the leaf is never stranded under a drawer.

Closing the chain cascades: closing the raga panel (or the composition panel)
also closes the recordings card. `_openCompPanel` auto-opens the recordings card
when a permalink target composition (`activeCompId`) is present, so
sync/permalink restore lands on the same three-card view.

## Consequences

- The wheel now expresses three KG relations locally without leaving the view:
  raga → composition, composition → composer, composition → recording. Depth is
  still entered one selection at a time and no card resizes its parent.
- Three simultaneous cards can exceed narrow desktop viewports. This is the
  same trade-off ADR-192 accepted for two; the cards are independently
  scrollable, the child cards clamp to the view window, and `_panChainIntoView`
  re-centres the chain so the leaf stays visible next to (not under) a drawer.
- The composer chip reuses the shared `buildComposerChip`, so composer
  navigation (musician panel, era tint) is identical to every other surface.
- Clicking a composition row no longer re-homes the Bani-flow subject. The
  Bani-flow panel is reached deliberately from the recordings card's
  "Open in Bani Flow" affordance; the wheel chain stays stable while browsing.
- Playback enters the media queue through the normal `openOrFocusPlayer` path,
  so compositions played from the leaf obey the Current Playlist contract.
