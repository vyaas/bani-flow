# ADR-049: Player Auto-Expand with Panel Retract and Raga Wheel Orient

**Status**: Proposed  
**Date**: 2026-04-19  
**Agents**: graph-architect

## Context

On mobile, when the user taps ▶ on a recording, the media player opens as a 56px mini strip at the bottom. The user must then tap the strip to expand it. This adds an unnecessary step: the intent is clearly "play this recording" — the player should appear in its full, interactive state immediately.

Additionally, the panel that originated the play action (Musician or Bani Flow) stays open, competing for the small mobile viewport. Screen real estate must be reclaimed by retracting the originating panel.

Finally, when a recording has an associated raga and the raga wheel is the active view, the wheel should orient to that raga — centring the mela and expanding the janya. This gives the user a spatial anchor in Mela-Janya space for further exploration.

## Forces

- **Immediate immersion**: Tapping play = "I want to listen". The player should be ready instantly— not hidden in a 56px sliver.
- **Real estate**: On a ≤768px screen, the panel + expanded player cannot coexist usefully. The panel must retract.
- **Spatial context**: Centring the raga wheel on the current raga provides an exploration vector without any extra user action.
- **State restoration**: When the player is collapsed later, the previous panel state should restore (already implemented by `_savedPanelState`).

## Pattern

**Levels of Scale**: The player is a full-viewport experience on mobile. When it activates, it becomes the primary centre; the panel drops to background.

## Decision

### Current flow
```
tap ▶ → showMiniPlayer() (56px strip) → user taps strip → _expandMobilePlayer()
```

### New flow
```
tap ▶ → showMiniPlayer() → immediately _expandMobilePlayer() → orientRagaWheel(ragaId)
```

### Changes in media_player.js

In `openOrFocusPlayer()` (the entry point for all play actions), after calling `_loadIntoMobilePlayer()`:

```js
// Auto-expand: skip mini strip, go straight to full player
setTimeout(function () { _expandMobilePlayer(); }, 60);
```

The 60ms delay lets the DOM paint the mini strip (required for the CSS transition to `full-mobile` to work).

In `_expandMobilePlayer()`, after `setPanelState('IDLE')`, add raga wheel orientation:

```js
// Orient raga wheel to the current raga if the wheel is the active view
if (mp.currentRagaId && typeof orientRagaWheel === 'function') {
  orientRagaWheel(mp.currentRagaId);
}
```

This requires tracking `currentRagaId` on the mobile player object, which should be set when `_loadIntoMobilePlayer()` receives the `meta` argument.

### State diagram

```
MUSICIAN panel open, user taps ▶
  → _savedPanelState = 'MUSICIAN'
  → setPanelState('IDLE')        // panel retracts
  → player expands to full-mobile (50vh)
  → orientRagaWheel(ragaId)      // if raga wheel is active view

User drags handle down to collapse:
  → _collapseMobilePlayer()
  → setPanelState('MUSICIAN')    // panel restores (existing behavior)
```

## Consequences

- One less tap to reach the full player experience.
- Panel retracts automatically — no need for the user to dismiss it manually.
- Raga wheel provides spatial grounding if active. If the graph view is active instead, this is a no-op.
- The existing `_savedPanelState` mechanism handles restoration — no new state management needed.
- Desktop is unaffected: `_isMobilePlayer()` guard ensures this path only fires on mobile.

## Implementation

1. In `media_player.js`, in the mobile branch of `openOrFocusPlayer()`, add `setTimeout(() => _expandMobilePlayer(), 60)` after `_loadIntoMobilePlayer()`.
2. Track `ragaId` on `_mobilePlayer` when loading a track.
3. In `_expandMobilePlayer()`, call `orientRagaWheel(ragaId)` if available.
4. Render and verify: tap ▶ → player goes directly to full, panel retracts.
