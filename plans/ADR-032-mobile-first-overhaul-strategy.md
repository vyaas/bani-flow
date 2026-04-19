# ADR-032: Mobile-First Overhaul — Strategy, Principles, and Phase Map

**Status:** Proposed
**Date:** 2026-04-18

---

## Context

Bani Flow is a desktop-first application. It was designed around a spatial metaphor
that assumes a large persistent canvas flanked by fixed 260px sidepanels, hover-driven
tooltips, and cursor precision. On a phone (360–414px viewport, touch input only), the
application breaks across five axes simultaneously:

### Axis 1 — Layout overflow

The main layout is a three-column flexbox row:
`260px sidebar | flex:1 canvas | 260px sidebar`

On a 390px screen, two 260px sidebars leave **−130px** for the canvas. The sidebars
either overflow off-screen or collapse the canvas entirely.

### Axis 2 — Hover interaction is unavailable

Three critical UX flows depend on `mouseover`/`mouseenter` events:
- The node hover popover (name, lifespan, recording count)
- Raga wheel node tooltips
- CSS `:hover` states on buttons and chips

On touch devices, none of these fire. The user sees no feedback when approaching a
node, and must tap blind.

### Axis 3 — Double-click is unreliable on touch

`dblclick` fires inconsistently across mobile browsers and OS settings. The metadata
inspector — currently the only pathway to inspect raw node data — is therefore
inaccessible on mobile. This is resolved by ADR-033 (interaction model redesign).

### Axis 4 — Mela-Janya wheel is completely inoperable on touch

The SVG wheel uses `mousedown`/`mousemove`/`mouseup`/`wheel` for pan/zoom. No touch
events are handled. On mobile, the wheel cannot be panned or zoomed at all. This is
resolved by ADR-035.

### Axis 5 — Touch targets are undersized

Controls (`Fit`, `Reset`, filter chips, the view selector buttons) are designed for
cursor precision. At 5px × 15px or 24px × 24px, they are below the 44px minimum touch
target required by Apple HIG and Material guidelines.

---

## Forces in tension

| Force | Direction |
|---|---|
| **Immersion** | The rasika using Bani Flow on a phone during a concert must get to recordings in two taps. Every extra step is friction during a live musical moment. |
| **Fidelity to the oral tradition** | The depth of the graph — raga lineages, concert brackets, co-performer trails — must remain accessible, not hidden behind mobile simplifications. |
| **Scalability** | Future graph views (Tala wheel, Composer graph, ADR-023) must fit into the mobile layout pattern without requiring per-view mobile exceptions. |
| **Zero regressions** | The desktop experience is the primary use case for deep data exploration. Mobile must not degrade it. |
| **Build simplicity** | Bani Flow is a single self-contained HTML file rendered by a Python pipeline. Mobile support must be achievable in pure HTML/CSS/JS without adding build steps, frameworks, or runtime dependencies. |

---

## Guiding Principles

1. **Progressive enhancement, not a separate mobile site.** One `graph.html`. CSS
   breakpoints and feature detection select the appropriate layout and interaction model.

2. **CSS-first where possible.** Layout changes (sidebar collapse, font sizing, touch
   target enlargement) belong in CSS media queries. JS is reserved for behaviour that
   CSS cannot express (drawer state, pinch detection, breakpoint event dispatch).

3. **Bottom sheet, not modals.** On mobile, contextual information (musician info,
   recordings, edge data) lives in a bottom sheet drawer that coexists with the canvas.
   Modals that cover the graph destroy spatial context.

4. **Touch targets ≥ 44px.** All interactive elements at the mobile breakpoint must
   meet minimum touch target dimensions.

5. **Interaction parity, not interaction cloning.** Mobile users need the same
   *capabilities* (navigate lineage, find recordings, inspect ragas), not the same
   *gestures*. Hover → tap-with-info, dblclick → long-press, scroll-zoom → pinch-zoom.

---

## Decision: Four-Phase Implementation Plan

### Phase 0 — Foundation (CSS baseline)
**Blocks nothing. Deployable independently. No ADR required.**

Owner: Carnatic Coder

Tasks:
- Verify viewport meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">`
  (`maximum-scale=5` permits user pinch-zoom; `initial-scale=1` prevents the ~980px
  desktop simulation most mobile browsers default to.)
- Add `@media (max-width: 768px)` block with touch target enlargement:
  buttons, filter chips, view selector buttons → `min-height: 44px`
- Fix filter chip bar: `overflow-x: auto; flex-wrap: nowrap` at mobile breakpoint so
  chips scroll horizontally rather than wrapping or overflowing
- Confirm Cytoscape's built-in touch normalisation (`tap`, `dbltap`, `taphold`) is not
  blocked by any parent `touch-action` override

Acceptance criteria: On a 390px viewport, every button is tappable; chips scroll; the
page does not render at ~980px zoom.

---

### Phase 1 — Responsive Layout
**Depends on: Phase 0. Dependency: ADR-030 (View Selector Restructure) should be
implemented first to reduce header clutter before mobile restructuring.**

Owner: Graph Architect (ADR) → Carnatic Coder (implementation)

ADR: [ADR-034](ADR-034-responsive-layout-bottom-drawer.md)

Summary: At ≤768px, the three-column layout collapses into a full-screen canvas. The
left sidebar becomes a slide-in drawer (swipe right or hamburger icon). The right
sidebar becomes a bottom sheet drawer with three states: dismissed, peek (musician name
visible), expanded (50vh). This is the canonical mobile pattern for "tap on item → get
details" (Google Maps, Apple Maps).

---

### Phase 2 — Interaction Model
**Depends on: Phase 1. Parallelisable with Phase 3.**

Owner: Graph Architect (ADR) → Carnatic Coder (implementation)

ADR: [ADR-033](ADR-033-touch-interaction-model.md)

Summary: Resolves the open question of what every tap, double-tap, and long-press does
in both the Guru-Shishya (Cytoscape) and Mela-Janya (SVG) views. Also clarifies the
desktop interaction model, which has unresolved ambiguity around double-click purpose
(discussed in ADR-033 Context).

---

### Phase 3 — Mela-Janya Wheel Touch Support
**Depends on: Phase 1. Parallelisable with Phase 2.**

Owner: Graph Architect (ADR) → Carnatic Coder (implementation)

ADR: [ADR-035](ADR-035-raga-wheel-touch-support.md)

Summary: Replace mouse-only pan/zoom event handlers with the Pointer Events API, which
unifies mouse and touch. Add pinch-zoom via two-pointer distance delta. Add long-press
(taphold) via timeout that clears on pointermove. Expand SVG node hit targets for touch.

---

### Phase 4 — Progressive Enhancement (Future)
**Depends on: Phases 1–3 complete and stable.**

Not blocked by an ADR today. Topics to plan when Phase 3 ships:
- **PWA manifest**: `manifest.json` + `<link rel="manifest">` makes the app installable
  and removes browser chrome, recovering ~80px of screen height on mobile.
- **Search-first mobile entry**: On first load on mobile, show a prominent search box
  before the graph, since a dense graph is hard to explore on a small screen.
- **Offline support**: Service worker caches `graph.html`. The app works without network
  (no API calls; all data is inline). This is a small win for concert-hall use.
- **FAB (floating action button)**: Bundle `+ Musician` / `⬇ Bundle` / `Entry Forms`
  (ADR-031) behind a single FAB to reduce header clutter on mobile.

---

## Phase dependency diagram

```
Phase 0 (Foundation)
    │
    ▼
Phase 1 (Layout — ADR-034)        ← also depends on ADR-030
    │
    ├──────────────────────────────┐
    ▼                              ▼
Phase 2 (Interaction — ADR-033)  Phase 3 (Wheel Touch — ADR-035)
    │                              │
    └──────────────┬───────────────┘
                   ▼
           Phase 4 (PWA / Future)
```

---

## Delegation map

| Phase | ADR | Approves | Implements | Renders |
|---|---|---|---|---|
| 0: Foundation | — | — | Carnatic Coder | Carnatic Coder |
| 1: Layout | ADR-034 | User | Carnatic Coder | Carnatic Coder |
| 2: Interaction | ADR-033 | User | Carnatic Coder | Carnatic Coder |
| 3: Wheel touch | ADR-035 | User | Carnatic Coder | Carnatic Coder |
| 4: PWA | TBD | User | Carnatic Coder | Carnatic Coder |

Graph Architect writes ADRs. User approves. Carnatic Coder implements and renders.
Librarian has no involvement in any mobile phase.

---

## Consequences

- ADR-030 (View Selector Restructure) is a soft prerequisite for Phase 1. It is not
  a hard blocker, but implementing ADR-030 first reduces the number of header CSS
  changes that Phase 1 must coordinate.
- The `graph.html` build artifact grows slightly (additional CSS media query block,
  mobile drawer JS ~100 lines). No new files; no new build dependencies.
- Desktop layout and interaction are **unmodified** by Phases 1–3. All mobile changes
  are gated behind `@media (max-width: 768px)` or `if (isTouchDevice())` guards.
- The GitHub Pages deployment workflow (`deploy-pages.yml`) requires no changes. It
  already runs `bani-render` and deploys the single `graph.html` output.

---

## Open questions (to resolve in sub-ADRs)

1. **ADR-033**: What does double-tap do in the Guru-Shishya graph on mobile — fit to
   node, or should it open the metadata inspector (same as desktop dblclick)? The
   proposal is fit-to-node; long-press opens the inspector.

2. **ADR-034**: Should the left sidebar (Bani Flow trail) be accessible via swipe-right
   from the canvas edge, or via a visible hamburger/button in the header? Both can
   coexist, but the button is the safer commitment.

3. **ADR-035**: Touch hit target expansion — should this be applied universally (all
   screen sizes) or only at the mobile breakpoint? Larger hit targets are generally
   better for usability, but may create visual weight on desktop if the invisible
   hit area is large.

4. **Phase 4**: Is a PWA manifest appropriate for Bani Flow given that `graph.html` is
   a rendered build artifact (it changes on every `bani-render`)? A service worker's
   cache strategy must account for this.
