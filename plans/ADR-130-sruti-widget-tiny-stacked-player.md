# ADR-130: Sruti — Collapsible Floating Widget + Tiny Stacked Player

**Status**: Proposed
**Date**: 2026-05-11
**Author**: Graph Architect
**Depends on**: ADR-029 (sruti bar — original), ADR-076 (sruti strip in header), ADR-129 (chrome retirement — removes the strip's housing)
**Related**: ADR-034/036 (mobile drawer + tab bar), the multi-window player architecture (`plans/multi_window_player.md`)

---

## Context

The sruti strip (ADR-076) lives in the top header today: a `SRUTI` label, twelve pitch buttons (`C C# D … B`), and a power button. It is the user's anchor for everything aural in the app — every raga, every recording is heard against this drone. It is also the single most-used control in the UI.

Two problems:

1. **Desktop**: the strip is permanently expanded. It consumes roughly the centre 360px of the header even when the user has chosen a tonic and no longer needs the picker. Once C is locked in, the twelve buttons are visual noise.
2. **Mobile**: the strip does not exist (`@media (max-width: 768px) { #sruti-strip { display: none; } }`). Mobile users have no way to engage the drone at all — a serious gap, because the drone is *more* important on mobile (users are often listening on the phone while practicing).

A third issue compounds both: when the drone is on, ADR-029's tanpura YouTube player opens at the same default size as the recording player (large, bottom-right). The user does not need to *see* the tanpura — only to control its volume and pause it. The size is wrong.

### Forces

| Force | Direction |
|---|---|
| **Always-reachable** | The drone control must never be more than one click away. Hiding it behind a menu fails this. |
| **Real-estate cost** | The expanded picker is justified only during pitch selection. After selection it should retract. |
| **Mobile parity** | Mobile must have the same control as desktop, in proportionally smaller space. ADR-129's removal of the desktop header bar makes this design uniform. |
| **State legibility** | The current tonic must be visible at a glance even when the picker is collapsed. Today the active button glows; collapsed, that signal is lost. |
| **Player size** | The tanpura player is a *control*, not content. It needs only volume + pause. The full YouTube player UI is overkill. |
| **Player stack ordering** | The recording/lecdem player stacks bottom-up over the bottom controls (existing behavior). The sruti player should stack the same way: above the bottom controls, but *thinner* and visually subordinate to the recording player. |
| **Movability** | A floating widget should be movable — the user's preferred screen position varies (especially on mobile in landscape vs portrait). |

---

## Pattern

**The Nature of Order, Book 1, Property 1 — *Levels of Scale*.** The drone is the largest centre in the app's audio hierarchy (it underpins every other sound). It deserves a centre at the smallest visual scale (a button) when at rest, and the largest interactive scale (an expanded picker) only at the moment of decision. Same centre, two scales.

**Property 6 — *Positive Space*.** A picker at full width permanently is *negative space* once the choice is made — it occupies the canvas without giving anything back. Collapsing it returns positive space to the wheel.

**Pattern 251 — *Different Chairs*.** The recording player is a generous chair: thumbnail, scrubber, title, controls. The sruti player is a side stool: pause + volume + dismiss. They should not be the same shape.

---

## Decision

### D1. The sruti widget — collapsed, expanded, and mini states

The sruti strip is replaced by `#sruti-widget`, a single floating element with three states:

```
mini       expanded                  off
─────      ─────────                  ───
[♪]        [SRUTI ⏻ C C# D D# E F F# G G# A A# B  ▼]   [♪]
```

| State | Trigger | Appearance |
|---|---|---|
| **off** | drone never engaged this session, or power-button → off | small button bearing a ♪ glyph and dim styling. ~36×36px (desktop), ~44×44px (mobile). Title attribute: `Sruti — pick tonic`. |
| **expanded** | click on `off` widget; or click `▼ →` collapse-arrow on a `mini` widget | the original 12-pitch picker reappears horizontally with the SRUTI label and power button on the left and a `▼` collapse arrow on the right. Tonic selection collapses to `mini`. |
| **mini** | a tonic is active | a single chip showing `[⏻ C]` (power button + active note glyph), accent-coloured. ~64×36px. Click reopens picker (expanded). Click on `⏻` toggles drone off (returns to `off`). |

State persists across reloads (localStorage key `sruti.state`).

### D2. Movability

The widget is **draggable** by its non-interactive surfaces (the SRUTI label in expanded mode, the chip body in mini). Position persists in localStorage. Default position:

- **Desktop**: top-centre (where ADR-076 placed it).
- **Mobile**: bottom-right, just above the sruti player stack and `#mobile-tab-bar`.

Dragging respects viewport bounds and snaps to within 8px of any edge. The drag handle is *not* the buttons themselves — clicking a pitch button selects, dragging the label moves.

### D3. The tiny stacked player

When the drone engages, `openPlayer(videoId, ..., 'sruti')` (existing call in `sruti_bar.js`) routes to a **tiny player profile** instead of the default profile.

The tiny profile:

```
┌───────────────────────────────┐
│  [⏸] [────●────] [🔊] [✕]      │   ← single row, ~28px tall, ~220px wide
└───────────────────────────────┘
```

- No video thumbnail (the YouTube `<iframe>` is positioned `0×0` and `visibility: hidden`; only the audio plays).
- Controls are HTML overlays driven by the YT IFrame API (existing `playerId === 'sruti'` branch in `media_player.js`).
- The `[✕]` close button is the same as the power-off action.

### D4. Stack ordering

Bottom-anchored players stack upward. Current behaviour: the recording/lecdem player sits at `bottom: 0` (above the bottom-bar, which ADR-129 removes) and stacks against `#desktop-panel-bar`. After ADR-129, the recording player anchors to `bottom: 8px` directly.

The sruti tiny player **stacks above** the recording player:

```
viewport bottom
├─ [floating bottom toggles row]                  ← ADR-129 D2
├─ [recording / lecdem player]                    ← existing, full size
├─ [sruti tiny player]                            ← NEW, thinner, narrower
└─ [sruti widget — mini chip or expanded strip]   ← if anchored bottom
```

Each layer is independently dismissible. The sruti tiny player is visually subordinate (smaller, less saturated frame) so the recording player remains the dominant audio surface in the user's visual hierarchy.

### D5. Mobile

The widget exists on mobile for the first time. Default position bottom-right. Default state `off`. When tapped, it expands into a **vertical** picker (4 columns × 3 rows of pitch chips) rather than the desktop horizontal strip — twelve buttons in a single row are too narrow to tap on a phone. After tonic selection, it collapses to the same `mini` chip as desktop.

The mobile sruti tiny player stacks above `#mobile-tab-bar` using the same upward-stack rule.

The CSS rule `@media (max-width: 768px) { #sruti-strip { display: none; } }` is removed (the strip itself no longer exists; the widget renders on all viewports).

### D6. Power-off semantics

Power-off (⏻ click while drone is on, or `[✕]` on the tiny player) does three things atomically:
1. Closes the YouTube `'sruti'` player (existing `closePlayer('sruti')`).
2. Returns the widget to the `off` state.
3. Preserves the *last selected tonic* in localStorage so re-engagement is one click (the chip remembers `C` and re-activates `C` on the next ⏻).

---

## Consequences

### Wins
- Sruti is reachable on mobile for the first time.
- Sruti widget consumes ~64×36px when at rest instead of ~360×52px — roughly 91% reduction in screen footprint at rest.
- Tanpura player no longer occupies the area a recording player would otherwise use, no longer competes visually with content the user actually wants to see.
- Movability gives the user agency over where the control lives — important when the wheel or graph extends into the default position.
- One model (collapse-on-selection, expand-on-click) works identically on desktop and mobile.

### Costs
- New stateful widget code path. The Coder must implement state persistence (`sruti.state`, `sruti.position`, `sruti.tonic`) and the drag handler.
- The tiny player is a second player profile — the existing `media_player.js` must learn it. It is not a separate player class; it is a CSS variant + a hidden-iframe arrangement.
- Mobile vertical picker is a new layout (4×3 grid). Existing `sruti_bar.js` builds a horizontal row; it now builds a grid whose direction is set by viewport.

### Risks
- **Drag vs click ambiguity**: the user might drag when they meant to click. Mitigation: only the SRUTI label / chip body initiates drag; pitch buttons are click-only. A 5px movement threshold before drag begins.
- **Tiny player audio without visual feedback**: hiding the iframe means the user has no proof the tanpura is loading other than the spinner state on `[⏸]`. The play/pause button must reflect the YT state machine accurately.
- **Stacking on small viewports**: bottom-anchored widget + tiny player + mobile-tab-bar + recording player is four layers. On a short landscape phone screen this could exceed available height. Rule: when total stack height > 50% viewport height, the sruti tiny player collapses to a 28×28px speaker-only icon with mute toggle (final fallback).
- **localStorage state drift**: a user opening the app on a new device gets `off`. Acceptable.

---

## Implementation (Coder's hand)

This ADR is design-only. The Coder will:

1. Replace `#sruti-strip` markup in `base.html` with a single `#sruti-widget` element supporting all three states via class flags (`.sruti-off`, `.sruti-mini`, `.sruti-expanded`).
2. Rewrite `sruti_bar.js` to render the appropriate state and respond to clicks. Add drag handling on the label/chip body. Persist state to localStorage.
3. Add a new player-profile branch in `media_player.js` for `playerId === 'sruti'` that yields the tiny stacked layout (single row, hidden iframe). Stack the player above the recording player using `bottom: calc(...)` driven by the recording-player's measured height (or a fixed `--player-stack-gap` token).
4. Remove the `@media (max-width: 768px) { #sruti-strip { display: none; } }` rule. Add the mobile vertical-grid layout under the same media query.
5. Verify all four state transitions on both desktop and mobile: off→expanded→mini→expanded→off, and the power-off short-circuit from any active state.
6. Run `bani-render`, smoke-test on a mobile-sized viewport and a desktop viewport.

ADR-129 ships in parallel — the chrome retirement removes the housing this widget previously inhabited.

---
