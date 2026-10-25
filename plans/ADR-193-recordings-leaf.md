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
   **pair row** of real chips: the composition chip (`.comp-chip`, amber) and
   its composer chip (`.composer-chip`, era-tinted, `buildComposerChip`) side
   by side. The pair is one clickable entity that explodes the recordings leaf;
   the composer chip keeps its own navigable behaviour.
3. **Recordings panel** (`#wheel-rec-panel`, new) — the terminal leaf. It is
   the Bani-flow trail for the selected subject, re-represented verbatim:
   `buildRecordingsTrail(type, id)` runs the *same* row pipeline as
   `buildListeningTrail` (`_collectTrailRows`) and renders it into a detached
   `<ul class="trail-list">`, so the musician chips, co-performer chips, scroll
   surfaces and play/enqueue controls are byte-for-byte the panel's own rows.
   The subject resolves through `_wdpBaniTargetFor` (canonical composition,
   single performance, or YouTube-only entry).

Positioning follows the ADR-192 anchor rule, extended one hop: the recordings
card pins the composition panel's outward edge, vertically centred on the
selected pair row and clamped to the view window. Direction is inherited from
the composition card's side of the raga panel, so the chain always fans away
from the wheel.

**Layout — the row scrolls, not the panel.** Composition and composer are peer
chips of equal height and font size, each sized to its own text; the pair row is
the horizontal scroll surface, so a long pair scrolls inside its row rather than
truncating or growing the card. The leaf inherits this and the whole ADR-180
ribbon grammar by adding `#wheel-rec-panel` to the sidebar-scoped
`:is(#left-sidebar, #right-sidebar, …)` rules: each musician is one fixed-height
row whose chips scroll sideways while the ▶/enqueue column stays pinned and
visible. Panel `.wdp-body`s set `overflow-x: hidden` so they never take the
scrollbar themselves.

**Sizing:** the composition card widens to `268px` so the pair can sit side by
side; the raga card stays `228px` and the recordings card is `244px`. All three
remain desktop-only — on ≤768px a raga tap draws the Bani-flow drawer, whose
trail already carries compositions and recordings. After the leaf opens,
`_panChainIntoView()` nudges the wheel pan (220 ms) just enough to bring the
whole open chain inside the visible window between the two sidebars, so the leaf
is never stranded under a drawer.

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
- The leaf introduces no bespoke row markup: it inherits the Bani-flow panel's
  look and feel by construction. `_collectTrailRows` is the single source of
  truth for the panel's rows, so the wheel and the sidebar cannot drift.
- Chips stay the functional vocabulary: composition, composer, musician and
  raga labels are always chips. There is no separate "Open in Bani Flow"
  affordance — the composition chip in the leaf header navigates to the
  subject's Bani-flow panel, and musician chips open the Musician panel.
- Playback enters the media queue through the normal `openOrFocusPlayer` path,
  so compositions played from the leaf obey the Current Playlist contract.
