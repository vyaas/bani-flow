# ADR-043: Player Reveal on Play — Inline Docking Between Panel and Tab Bar

**Status:** Proposed
**Date:** 2026-04-18
**Depends on:** ADR-037 (media player docking), ADR-041 (drawer toggle, tab bar z-index)

---

## Context

ADR-037 introduced a mobile mini-player: a 56px strip docked above the tab bar
that shows the current track, play/pause, and a progress indicator. The
mini-player appears when the user starts playback and persists as they navigate.

### What breaks (observed)

Clicking the ▶ play button on a recording (in either the Bani Flow or Musician
panel) starts audio/video playback, but **the player is not visible**. The user
hears music but sees no change in the UI. The player either spawns behind the
open drawer, floats at `bottom: 8px` behind the tab bar, or is simply off-screen.
There is no visual confirmation that "something is now playing."

This is especially acute when a drawer is open: the user taps ▶ inside the
Bani Flow panel, playback begins, but the player is behind the panel. The user
must close the drawer to find the player, which kills the browsing flow.

### User statement

> "Clicking the play button does not reveal the player that was just invoked:
> ideally this should visibly appear at the bottom, shrinking the bani-flow
> tab vertically: i.e. the player *inserts* itself between the Bani-Flow panel
> and the bottom-most panel."

---

## Forces in tension

| Force | Direction |
|---|---|
| **Feedback** | Every user action needs visible confirmation. Pressing ▶ must produce an immediate visual change — the player appearing — not just audio. |
| **Panel continuity** | The user is browsing recordings in a drawer. Starting playback should not close the drawer or disrupt the browsing context. The panel should shrink, not vanish. |
| **Vertical space** | On a 390px × 844px screen: header (~56px) + filter bar (~40px) + drawer content + mini-player (56px) + tab bar (56px). The drawer content absorbs the squeeze: it loses 56px of scroll height when the player appears. This is acceptable — recordings lists are scrollable. |
| **ADR-037 alignment** | ADR-037 already defines the mini-player strip (56px, docked above tab bar). This ADR extends that design by specifying *when* and *how* it appears relative to an open drawer, and requires that the drawer content reflows to accommodate it. |
| **Desktop parity** | On desktop, the player is a floating window. This ADR does not change desktop behaviour. The inline docking is mobile-only. |

---

## Pattern

**Immediate feedback** (Nielsen's Heuristic #1: Visibility of system status):
The system must keep users informed about what is going on through appropriate
feedback within reasonable time. Starting playback is a significant action; the
player's appearance is the feedback.

**Compression, not displacement** (Alexander, *The Nature of Order*, Book 2,
"Roughness"): When a new element enters a living structure, the existing
elements compress slightly to make room rather than being displaced entirely.
The drawer panel content compresses (loses 56px of scroll height) when the
mini-player inserts itself. Nothing is hidden or destroyed.

---

## Decision

### 1. Mini-player inserts between drawer content and tab bar

When playback starts (via any ▶ button), the mini-player strip (56px) appears
immediately above the tab bar and *inside* the visible stack, even when a
drawer is open:

```
┌──────────────────────────────────┐
│  Drawer panel content            │  ← shrinks by 56px
│  (scrollable recordings list)    │
│                                  │
├──────────────────────────────────┤
│  ♫ Now Playing: Kalyani — MMI  ▶│  56px mini-player (NEW)
├──────────────────────────────────┤
│  [☰ Bani Flow]   [♫ Musician]   │  56px tab bar
└──────────────────────────────────┘
```

The mini-player has `z-index: 205` — above the scrim (199), below the tab bar
(210 per ADR-041), and the same or slightly above drawer content (200). It is
`position: fixed; bottom: 56px` (sitting on top of the tab bar).

### 2. Drawer content area shrinks to accommodate

When the mini-player is visible, the drawer's scrollable content area loses
56px of bottom space. This is achieved by adding bottom padding or adjusting
the drawer's bottom offset:

```css
/* When player is active, drawers account for the mini-player */
body.player-active #left-sidebar,
body.player-active #right-sidebar {
  bottom: 112px;    /* 56px tab bar + 56px mini-player */
}
```

Without the player, drawers extend to `bottom: 56px` (above the tab bar only).
The transition is smooth — the drawer content scrolls to compensate, the
user's reading position is preserved within the scrollable area.

### 3. Mini-player appears with a slide-up animation

The player does not pop in — it slides up from behind the tab bar:

```css
.mini-player {
  position: fixed;
  bottom: 56px;
  left: 0;
  right: 0;
  height: 56px;
  z-index: 205;
  transform: translateY(100%);
  transition: transform 0.2s ease-out;
}
.mini-player.player-visible {
  transform: translateY(0);
}
```

When `openOrFocusPlayer()` is called, the `body.player-active` class and
`.player-visible` class are added simultaneously, causing the player to slide
up and the drawer to shrink in one coordinated animation.

### 4. Play button triggers immediate player reveal

The ▶ button's click handler (from ADR-025 Change 0) is extended:

```javascript
playBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openOrFocusPlayer(vid, title, artist, offset);
  // NEW: ensure mini-player is visible
  showMiniPlayer();   // adds .player-visible + body.player-active
});
```

If the player is already visible (previous track playing), `showMiniPlayer()`
is a no-op — the track simply changes within the existing strip.

### 5. Closing the player reclaims the space

When the user dismisses the mini-player (tap ✕ on the player strip, or
playback ends), the `body.player-active` class is removed. The drawer
content expands back to `bottom: 56px`. The mini-player slides down behind
the tab bar.

### 6. Desktop behaviour — unchanged

On desktop (≥769px), the media player remains a floating, draggable window
per existing behaviour. The mini-player strip, `body.player-active` class,
and drawer bottom adjustments are scoped to `@media (max-width: 768px)`.

---

## Consequences

| Consequence | Impact |
|---|---|
| Visible feedback on play | The user immediately sees and can control what's playing, even with a drawer open. Core UX win. |
| 56px vertical loss in drawer | Recordings lists lose one row of visible content. Acceptable: the list is scrollable and the player provides more value than the lost row. |
| z-index stack grows | Tab bar (210), mini-player (205), drawer (200), scrim (199). Four layers in a narrow band. Must be tested carefully. |
| ADR-037 refinement | This ADR refines ADR-037's mini-player positioning by specifying its interaction with open drawers. ADR-037's full-player expand (tap mini-player to see video) remains valid. |
| Three-element bottom stack | Tab bar + mini-player + drawer bottom edge. On very short viewports (<600px), this leaves limited drawer content. Acceptable: these viewports are rare. |

---

## Implementation

1. **Carnatic Coder**: In `media_player.js`, implement `showMiniPlayer()` that
   adds `body.player-active` and `.player-visible` classes.
2. **Carnatic Coder**: Add CSS for `.mini-player` positioning (fixed, bottom:
   56px, slide-up transition).
3. **Carnatic Coder**: Add CSS for `body.player-active` drawer bottom
   adjustment (bottom: 112px).
4. **Carnatic Coder**: In ADR-025's ▶ click handler, call `showMiniPlayer()`
   after `openOrFocusPlayer()`.
5. **Carnatic Coder**: Implement player dismiss: remove classes, slide down.
6. **Carnatic Coder**: Test sequence: open Bani Flow drawer → tap ▶ on a
   recording → mini-player slides up, drawer shrinks → close player →
   drawer expands. Repeat with Musician drawer.
7. **Carnatic Coder**: Run `bani-render`, verify on 390px viewport.
