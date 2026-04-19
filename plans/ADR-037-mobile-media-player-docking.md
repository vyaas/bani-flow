# ADR-037: Mobile Media Player Docking — Video as Bottom-Sheet Citizen

**Status:** Proposed
**Date:** 2026-04-18
**Depends on:** ADR-036 (panel state machine), ADR-034 (bottom sheet layout)

---

## Context

The media player (`.media-player`) is a draggable, resizable floating window on
desktop. It spawns at a cascaded position, holds a YouTube iframe (16:9), a title bar,
a close button, a resize grip, and a track list. On desktop, this works well — the
user can position the player anywhere on the canvas while keeping the sidebars visible.

On mobile, the player is `position: fixed; width: min(90vw, 400px); left: 50%;
transform: translateX(-50%); bottom: 8px`. ADR-034 added rules to lift it above the
bottom sheet: `body.sheet-peek .media-player { bottom: 80px }` and
`body.sheet-expanded .media-player { bottom: calc(50vh + 8px) }`.

### What breaks on mobile (observed in screenshots)

1. **Partial visibility with no escape:** The player's YouTube iframe fills most of
   its height. At `bottom: 8px` on a 390px screen, the title bar is at the viewport
   bottom edge, behind the Android gesture pill. The ✕ close button, the playlist
   toggle, and the drag handle are all invisible or inaccessible.

2. **Competing overlays:** When the Bani Flow drawer is open (screenshot 3), the
   player is behind the drawer content. Yet the audio continues playing. The user
   hears music but cannot see or control the player. There is no "now playing"
   indicator outside the player itself.

3. **Lift math is fragile:** The `body.sheet-expanded .media-player { bottom:
   calc(50vh + 8px) }` rule pushes the player above the sheet. But if ADR-036
   introduces a 56px bottom tab bar, the lift calculation must account for that too.
   Every new panel adds another `body.state .media-player { bottom: ... }` rule. This
   does not scale.

4. **No minimized state:** On desktop, the player can be small (320px wide) and
   tucked in a corner. On mobile, there is no "mini-player" — it's either fully
   visible (400px × 225px + title bar) or closed. Closing loses playback state. There
   is no way to "keep listening while exploring."

5. **Multiple players:** On desktop, `media_player.js` supports spawning multiple
   players (cascade offset). On mobile, multiple 90vw players stack and obscure
   everything. Mobile should enforce a single-player constraint.

---

## Forces in tension

| Force | Direction |
|---|---|
| **Immersion** | The rasika tapped a recording to *listen*. The player must be accessible at all times during playback, not hidden behind panels or clipped by viewport edges. Closing the player to explore more musicians kills the immersion. |
| **Canvas priority** | On a 390px screen, a 400px × 225px player leaves ~400px of canvas height — barely half the screen. When the user is exploring (not actively watching), the player should minimize to a compact strip. |
| **Coordination with panels** | The media player must participate in ADR-036's panel state machine, not fight it. Its position must be a function of the current panel state, not a set of ad-hoc `body.state` CSS rules. |
| **Single-file constraint** | All player logic lives in `media_player.js` (inlined into `graph.html`). No external dependencies. |
| **Track continuity** | The playlist/concert track list is a core feature. The mini-player must retain ability to switch tracks (ADR-026 track selector) without expanding to full size. |

---

## Pattern

**Persistent mini-player** (YouTube Music, Spotify, Apple Music): when a user starts
playback and navigates away, a compact (~56–64px) strip persists at the bottom of the
screen showing: track title, play/pause, and a progress indicator. Tapping the strip
expands to the full player. This pattern is universal in media apps because it solves
exactly this tension: keep listening while exploring.

**Docked vs. floating** (Material Design 3, "Sheets: bottom"): on mobile, a media
player is not a floating window — it is a docked element at a fixed screen position.
Its position is a function of the layout state, not of a drag handle.

---

## Decision

### 1. Two player modes on mobile: full and mini

At `≤768px`, the media player has two display modes:

| Mode | Height | Content | Position |
|---|---|---|---|
| **Mini** | 56px | Track title (truncated) + ▶/⏸ button + ✕ close | Docked above bottom tab bar (or above viewport bottom if no tab bar) |
| **Full** | 50vh | YouTube iframe (16:9) + title bar + track list (scrollable) | Bottom sheet expansion (replaces musician info temporarily) |

**Mini mode** is the default whenever a track is playing and the user is interacting
with any other part of the app (canvas, drawer, or the musician bottom sheet in peek
state).

**Full mode** activates when the user taps the mini-player strip. It slides up from
the bottom, occupying the same 50vh space as the musician bottom sheet. The musician
sheet is temporarily dismissed while the player is in full mode. Swiping the full
player down returns it to mini mode and restores the previous sheet state.

### 2. Mini-player strip layout

```
┌────────────────────────────────────────┐
│ ▶  Viruttam — Kulam Thar… · 45:08  ✕  │  56px, full-width
└────────────────────────────────────────┘
```

- Left: play/pause toggle (44px × 44px touch target)
- Centre: track label (ellipsis-truncated), tappable to expand to full mode
- Right edge: remaining time or total duration
- Far right: ✕ close (44px × 44px)
- Background: `var(--bg-panel)` with `border-top: 1px solid var(--border-strong)`
- A thin progress bar (2px) at the top edge shows playback position

### 3. Positioning: docked, not floating

On mobile, the player never floats. Its position is determined by the panel state:

```css
@media (max-width: 768px) {
  /* Mini-player: always visible above the bottom tab bar */
  .media-player.mini {
    position: fixed;
    bottom: calc(56px + env(safe-area-inset-bottom));  /* above tab bar */
    left: 0;
    right: 0;
    height: 56px;
    width: 100%;
    transform: none;
    border-radius: 0;
    z-index: 160;  /* above bottom sheet peek (150), below drawer (200) */
  }

  /* Full player: bottom sheet with iframe */
  .media-player.full-mobile {
    position: fixed;
    bottom: calc(56px + env(safe-area-inset-bottom));
    left: 0;
    right: 0;
    height: calc(50vh - 56px);
    width: 100%;
    transform: none;
    border-radius: 16px 16px 0 0;
    z-index: 160;
    overflow: hidden;
  }
}
```

The fragile `body.sheet-peek` / `body.sheet-expanded` positioning rules from ADR-034
are removed. The mini-player always sits above the tab bar. The full player always
occupies a fixed 50vh region above the tab bar.

### 4. State machine integration (ADR-036)

The media player integrates with ADR-036's `setPanelState()` as a parallel layer:

```
Panel states:       IDLE | PEEK | MUSICIAN | TRAIL
Media overlay:      NONE | MINI | FULL

Composition rules:
  MINI + any panel state     → mini-player visible above tab bar; panels unaffected
  FULL + PEEK                → sheet dismissed; full player takes its space
  FULL + MUSICIAN            → sheet dismissed; full player takes its space
  FULL + TRAIL               → drawer stays open; full player visible at bottom
  NONE + any panel state     → no player visible
```

When the user opens the full player, `setPanelState()` saves the current sheet state,
dismisses the sheet, and shows the full player. When the user minimizes the player
(swipe down or tap the handle), `setPanelState()` restores the saved sheet state.

### 5. Single-player constraint on mobile

On mobile, only one media player instance exists. If the user taps a new recording
while a track is playing, the existing player switches tracks (hot-swap) instead of
spawning a second player. The cascade spawn logic in `nextSpawnPosition()` is skipped
when `matchMedia('(max-width: 768px)').matches`.

### 6. Track switching in mini mode

The mini-player strip supports swipe-left / swipe-right to switch tracks within the
current concert bracket (ADR-026). A small dot indicator (·· ● ··) below the track
title shows the current position in the concert track list. This enables track
switching without entering full mode.

---

## Before / After

### Before (mobile media player)
```
┌────────────────────────────────────┐
│ [☰]  CARNATIC MUSIC    [GS | MJ]  │
├────────────────────────────────────┤
│                                    │
│          (canvas)                  │
│                                    │
│                                    │
│          ┌──────────────┐          │
│          │ ♫ Title  [✕] │          │  ← floating, clipped by viewport
│          │  [YouTube]   │          │
│          │              │          │
│          └──────────────┘          │
├────────────────────────────────────┤
│  ━━━  MUSICIAN ♫                   │  peek (may overlap player)
└────────────────────────────────────┘
```

### After (mini mode)
```
┌────────────────────────────────────┐
│ [☰]  CARNATIC MUSIC    [GS | MJ]  │
├────────────────────────────────────┤
│                                    │
│          (canvas)                  │  maximum canvas area
│                                    │
│                                    │
│                                    │
│                                    │
├────────────────────────────────────┤
│ ◆ Vina Dhanammal · 4▶          ↑  │  100px contextual peek
├────────────────────────────────────┤
│ ▶ Viruttam — Kulam Thar… 45:08 ✕  │  56px mini-player
├────────────────────────────────────┤
│    [♫ Musician]    [☰ Trail]       │  56px bottom tab bar
└────────────────────────────────────┘
```

### After (full mode — tap mini-player to expand)
```
┌────────────────────────────────────┐
│ [☰]  CARNATIC MUSIC    [GS | MJ]  │
├────────────────────────────────────┤
│                                    │
│          (canvas)                  │
│                                    │
├────────────────────────────────────┤
│  ━━━ (drag handle)                 │
│  ♫ Viruttam — Kulam Tharum         │
│  ┌────────────────────────────┐    │
│  │       [YouTube iframe]     │    │  50vh full player
│  └────────────────────────────┘    │
│  ► Next: Parulanna Matta           │
│  ► Kapi — Ni Mattume               │
├────────────────────────────────────┤
│    [♫ Musician]    [☰ Trail]       │  56px bottom tab bar
└────────────────────────────────────┘
```

---

## Consequences

- **Desktop is unmodified.** The floating, draggable, multi-instance player behaviour
  is preserved. All mobile changes are gated behind `@media (max-width: 768px)`.

- **media_player.js changes:** The `spawnPlayer()` function gains a mobile branch that
  reuses a singleton `.media-player` element instead of creating new instances. The
  `initDrag()` and `initResize()` functions are skipped on mobile (the player is
  docked, not draggable).

- **ADR-034 cleanup:** The `body.sheet-peek .media-player` and
  `body.sheet-expanded .media-player` CSS rules are removed, replaced by the
  docked positioning in this ADR.

- **Vertical space budget (with ADR-036 bottom tab bar):**
  - Header: 56px
  - Filter toggle: 44px
  - Canvas: variable
  - Peek: 100px
  - Mini-player: 56px (only when playing)
  - Tab bar: 56px
  - Total chrome: 312px (when playing) / 256px (when not playing)
  - Canvas on 844px viewport: 532px (playing) / 588px (not playing)
  - This is acceptable: 532px is more than 60% of viewport height.

- **ADR-036 dependency:** This ADR requires the `setPanelState()` state machine. If
  ADR-036 is rejected, the docked positioning still works but the panel coordination
  rules degrade to the current ad-hoc `body.state` CSS rules.

---

## Implementation

| Step | Owner | Description |
|---|---|---|
| 1 | Carnatic Coder | Add `.mini` and `.full-mobile` CSS classes with docked positioning |
| 2 | Carnatic Coder | Implement `miniPlayerStrip()` layout: play/pause, title, close, progress bar |
| 3 | Carnatic Coder | Modify `spawnPlayer()` to enforce singleton on mobile; skip drag/resize init |
| 4 | Carnatic Coder | Wire mini → full expansion (tap) and full → mini (swipe down) transitions |
| 5 | Carnatic Coder | Integrate with ADR-036 `setPanelState()`: save/restore sheet state on full expand |
| 6 | Carnatic Coder | Add swipe-left/right track switching on mini-player strip |
| 7 | Carnatic Coder | Remove `body.sheet-peek` / `body.sheet-expanded` media player rules from ADR-034 CSS |
| 8 | Carnatic Coder | `bani-render` + test in Chrome DevTools 390px emulator with simultaneous playback + panel |

All steps are Carnatic Coder scope.

---

## Open questions

1. **Mini-player vs. no player when nothing is playing:** Should the 56px mini-player
   strip be visible at all times (with a "No track playing" placeholder), or should it
   only appear when playback starts? Recommendation: only appear on playback — this
   avoids wasting 56px on an empty strip.

2. **Full mode height:** 50vh is proposed. On a short viewport (667px iPhone SE), 50vh
   is 333px. The YouTube iframe at 16:9 in a 390px-wide container is 219px tall. That
   leaves 114px for the title bar and track list — tight but workable. Should we use
   `max(50vh, 340px)` instead?

3. **Picture-in-Picture (PiP):** Modern browsers support PiP for YouTube iframes. In
   mini mode, the user cannot *see* the video. Should the mini-player trigger PiP
   automatically? This is a browser API question, not a layout question, but it
   affects the UX design. Defer to Phase 4?

4. **Audio-only recordings:** Some YouTube entries are audio-only (no video footage).
   For these, the full player's iframe shows a static image. Should the full player
   skip the iframe entirely for audio-only and show a larger track list instead?
   This is a data question (we'd need an `audio_only` flag on recordings). Defer.
