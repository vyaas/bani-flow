# ADR-129: Chrome Retirement — Floating, Self-Contained Controls

**Status**: Proposed
**Date**: 2026-05-11
**Author**: Graph Architect
**Depends on**: ADR-111 (bottom-bar retirement — first half of the move; this ADR completes it), ADR-076 (sruti strip), ADR-045 (header-left title + help), ADR-128 (symmetric panel base — width tokens reused)
**Related**: ADR-130 (sruti widget + stacked tiny player — the sruti-specific half of this move), ADR-034/036/039/041/046 (drawer + handle + tab-bar machinery this ADR re-uses)

---

## Context

The app currently frames the canvas with two persistent horizontal bars:

- **Top `<header>`** (`bg-panel`, 2px `border-bottom`, ~52px tall) hosts three things: the title `Carnatic Music Explorer` + help `?`, the sruti strip (`SRUTI` label, 12 pitch buttons, power button), and the view selector (`Guru-Shishya / Mela-Janya`).
- **Bottom `#desktop-panel-bar`** (`bg-panel`, 2px `border-top`, 44px tall) hosts a left section (`☰ Bani Flow` toggle + 📌 pin), a centred `⬇ Bundle (N items)` button, and a right section (📌 pin + `Musician ♫` toggle).

Both bars are *frames around a canvas whose entire reason for existing is to be panned and zoomed.* The raga wheel (ADR-123, ADR-124) and the guru-shishya graph (ADR-013) are exploratory surfaces. Every pixel of frame is a pixel of exploration that the user does not get. The browser already supplies its own chrome (tab bar, address bar, OS bars); we add two more horizontal bands of our own. The cumulative effect is *cagey*.

ADR-111 retired the bar of edit buttons because each panel had absorbed its own create affordances. That logic generalises: every control on the top and bottom bars is either (a) already a self-sufficient widget that does not need a backing surface, or (b) a paired toggle/pin that can be collapsed into a single stateful button.

### Forces

| Force | Direction |
|---|---|
| **Real estate for exploration** | The wheel + graph deserve maximum unbroken canvas. Two bars at 52px + 44px = ~96px of vertical loss on a 900px viewport (~11%). |
| **Visual restraint** | The browser itself is full of bars. Adding more reads as cagey, lo-fi, dashboard-y — wrong tone for a tradition-immersion app. |
| **Discoverability** | Removing the bars must not hide the controls. Each control must read as an obvious affordance even when it floats over canvas. |
| **State legibility** | A pin toggle on a bar reads as `unpinned (dim) → pinned (bright)`. When floating, the same legibility must hold without the bar's contrast backing. |
| **Bundle-as-loop-exit** | ADR-085 makes the bundle download the user's only loop exit. It must remain reachable and must shout when it has contents. |
| **Symmetry** | The left and right panel toggles must remain co-equal centres (ADR-011, ADR-128). One floating button on each side. |
| **Consistency of paradigm** | Today the user sees *two* controls per panel (toggle + pin). That is two interactions for one decision (open this and keep it open). One control with two click states is simpler, and matches how single-shot toggles already work elsewhere in the app. |

---

## Pattern

**Christopher Alexander, *A Pattern Language*, Pattern 159 — *Light on Two Sides of Every Room*.** The canvas needs light from all four sides; the bars are walls that block it on top and bottom. Floating controls are columns, not walls — they hold up the function without sealing in the room.

**The Nature of Order, Book 1, Property 4 — *Alternating Repetition*.** A control is not a strip of controls; it is a discrete centre. Two pin buttons + two toggle buttons + a bundle button + a sruti strip + a view selector + a title is *seven centres pretending to be one strip*. Returning each to its own boundary recovers the alternation.

**Property 8 — *Deep Interlock and Ambiguity* (continuing ADR-111's reading).** The bottom bar's `[toggle] [pin]` pair forced two clicks to express one intent ("show this and keep it"). Collapsing the pair into a single tri-state button (`closed → open-transient → open-pinned → closed`) interlocks the intent with the affordance.

---

## Decision

### D1. Retire the `<header>` element

The `<header>` element with its `bg-panel` background and 2px border is removed from the DOM entirely. Its three children become independently positioned floating widgets layered above the canvas (`position: absolute`, `z-index` chosen to clear the cy-labels overlay at z=40 but to sit below the meta-inspector and entry-form modals).

| Was | Becomes |
|---|---|
| `<header>#header-left` (title + `?`) | A floating cluster `#app-title-float` anchored top-left, no backing fill. The title `CARNATIC MUSIC EXPLORER` keeps its accent colour and uppercase letterspacing. The `?` button keeps its existing circle treatment. No bar. |
| `<header>#sruti-strip` | Replaced wholesale by ADR-130's `#sruti-widget` (a draggable, collapsible floating widget). |
| `<header>.controls .view-selector` | A floating cluster `#view-selector-float` anchored top-right, no backing fill. The two pill-buttons keep their existing styling and active state. |

Only the chrome surrounding these elements is removed. **No control loses functionality**, no event handler is rewired in this ADR (`switchView()`, `openHelp()`, etc. continue to work). The Coder is responsible for ensuring the floating clusters do not collide with the panel pin gutters when both panels are pinned open at the maximum width.

> Hit-testing note: the floating clusters must be the only thing in their bounding box that captures pointer events. The transparent space between the title chip and the `?` button must pass clicks through to the canvas. In practice this means each interactive element gets `pointer-events: auto` while its floating wrapper is `pointer-events: none`.

### D2. Retire the `#desktop-panel-bar` strip; collapse toggle + pin into one button

The `#desktop-panel-bar` element with its `bg-panel` fill and 2px `border-top` is removed from the DOM. Its three sections become three independent floating elements at the bottom of the viewport.

The left and right sections each currently contain *two* buttons: `[toggle] [pin]`. They collapse into **one tri-state button per side**:

```
state          appearance                       click action
─────────────  ───────────────────────────────  ────────────────
closed         dim, bordered, no accent         → open-pinned
open-pinned    bright, accent-coloured          → closed
```

(Only two states are needed once we acknowledge that "open-transient" — open until next outside-click — is what every panel-open click already does today *unless* the user also clicks the pin. Folding the pin into the toggle removes that step. A click on the button always pins; a second click closes. The drawer-handle / scrim mechanism (ADR-046, ADR-034) is unchanged for hover-driven previews.)

| Was | Becomes |
|---|---|
| `#dpb-left-toggle` (`☰ Bani Flow`) + `#dpb-left-pin` (📌) | One floating button `#left-panel-toggle` anchored bottom-left. Glyph: `☰`. Label: `BANI FLOW`. State legible via accent colour and a thin solid border when pinned. |
| `#dpb-right-toggle` (`Musician ♫`) + `#dpb-right-pin` (📌) | One floating button `#right-panel-toggle` anchored bottom-right. **Glyph changes from `♫` (melody sign) to `☰` (burger)** for symmetry with the left toggle — both panels are entry surfaces; the asymmetric glyph implied a difference of kind that no longer exists post-ADR-128. Label: `MUSICIAN`. |
| `#bundle-download-btn` (`⬇ Bundle (N items)`) | A floating button `#bundle-float` anchored bottom-centre. **Two visual states**, not three: `dim` when count is 0, **`bright`** (accent-coloured background, full opacity, subtle pulse on transition from 0→1) when count ≥ 1. The `disabled` attribute is retained so it remains unclickable when empty. |

> **Bundle-as-signal** (ADR-085): bright-when-ready is the user's only confirmation that their session has produced a contribution. The transition 0→1 should be immediately legible without the user moving their eyes.

### D3. Stacking order and reflow

With both bars removed, `#main` becomes the body's full vertical extent (`height: 100vh`). The canvas (`#cy`) and the raga-wheel SVG fill the available space minus only the panel widths (when pinned). The floating widgets (`#app-title-float`, `#sruti-widget`, `#view-selector-float`, `#left-panel-toggle`, `#bundle-float`, `#right-panel-toggle`) sit at the corners and edges, each in its own stacking context.

Z-order, top to bottom (highest to lowest):
1. Modals (entry forms, meta-inspector) — unchanged.
2. Panels (when open) — unchanged.
3. Sruti widget (ADR-130) and its tiny stacked player.
4. Floating chrome clusters (`#app-title-float`, `#view-selector-float`, three bottom toggles).
5. Cytoscape DOM-overlay chips (`#cy-labels`, currently z=40).
6. Cytoscape canvas (`#cy`).
7. Raga-wheel SVG (currently z=60 — unchanged).

The floating cluster z-index is bumped to 70+ to clear the wheel.

### D4. Mobile parity

Mobile retains its `#mobile-tab-bar` (ADR-036) — that bar is *the* navigation surface on small screens and is not chrome. The header changes carry over: the title floats top-left at smaller font; the view-selector remains accessible via the existing logic. The sruti strip's mobile behaviour is the subject of ADR-130 (it does not exist on mobile today; ADR-130 introduces it as a button-sized widget).

The bottom-bar paradigm change (toggle + pin → one button) does not apply to mobile because mobile already has only the tab-bar buttons (no pin). The bundle button needs a mobile-visible position; ADR-130 places it adjacent to the sruti widget anchor.

### D5. Drawer handles

The hover-edge `desktop-drawer-handle` elements (ADR-046) are *not* removed. They remain the discovery affordance for users who hover the screen edge. They were already styled to read as floating tabs, not bar-bound chrome — they are consistent with this ADR's direction.

---

## Consequences

### Wins
- ~96px of vertical canvas reclaimed at common viewport heights — roughly 11% more wheel.
- The app stops reading as a dashboard. The canvas becomes the primary surface; controls become satellites.
- One click instead of two to "open and keep open" a panel.
- Bundle-button visibility tracks contribution state directly — no scanning needed.
- Both panel toggles use the same glyph and same paradigm, reinforcing ADR-011 / ADR-128 symmetry.

### Costs
- Floating controls on a busy canvas can be visually noisier than bars. The Coder must tune contrast / shadow so the controls read against the wheel's bright sectors and the graph's edges, without backing fills. Existing chip styling (border + subtle bg) is the starting point.
- Removing the toggle/pin distinction loses one degree of freedom: there is no longer a way to "peek" at a panel without committing to keeping it open. This is acceptable because the drawer-handle hover-preview (ADR-046) already serves that role.
- The view-selector floating top-right may collide with the right-panel toggle (also bottom-right? — no, top vs bottom; safe) and with the right-panel pin gutter when the panel is open. Placement must back off when the right panel is open: the Coder shifts `#view-selector-float` left by `var(--right-panel-width)` while the panel is open.
- Glyph change `♫ → ☰` on the right toggle: users habituated to the melody sign will need one moment to relearn. Tooltip text remains `Open / close Musician panel`.

### Risks
- **Discoverability of the help `?`**: today it is bar-anchored and visually obvious. As a floating button it must keep enough contrast to be findable. Recommended treatment: keep the existing circular help-button style (filled circle, accent border).
- **Bundle button discoverability when bright**: a bright-accent button floating bottom-centre over the canvas could distract from the wheel during exploration. Mitigation: only the *transition* 0→1 pulses; steady state is bright but small. Steady state opacity ≤ 0.95.
- **Touch hit-targets**: each floating control must remain ≥ 40×40px for touch. The bottom three buttons in particular — currently 32px tall — must grow.

---

## Implementation (Coder's hand)

This ADR is design-only. The Coder will:

1. Delete the `<header>` element and `#desktop-panel-bar` element from `base.html`.
2. Add three new floating wrappers: `#app-title-float`, `#view-selector-float`, and the three bottom toggles (`#left-panel-toggle`, `#bundle-float`, `#right-panel-toggle`).
3. Move event handlers (`switchView`, `togglePanelHelp`, `downloadBundle`, drawer toggles) onto the new buttons. The pin functions (`toggleLeftPin`, `toggleRightPin`) collapse into the same handler as the toggle: open-and-pin on first click, close on second.
4. Update CSS: remove `header { ... }`, remove `#desktop-panel-bar { ... }` and `.dpb-*` rules. Add positioning rules for each floating cluster. Honour panel-width tokens for placement.
5. Update `mobile.js` and the mobile `@media` blocks to handle the floating placements at small widths.
6. Verify the bundle-button bright-state pulse works with `bundleCount` updates.
7. Run `bani-render` and visually verify with both panels closed, both pinned, and one of each.

ADR-130 ships in parallel and replaces the sruti strip; the two ADRs land together.

---
