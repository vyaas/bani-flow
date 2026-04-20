# ADR-050: Player Minimize on Exploration Clicks

**Status**: Proposed  
**Date**: 2026-04-19  
**Agents**: graph-architect

## Context

When the mobile media player is in full mode (`full-mobile`, covering 50vh), the user may click a panel tab (Bani Flow / Musician) at the bottom, or tap a node on the raga wheel or guru-shishya graph. Currently:

- Clicking a bottom tab opens the corresponding panel **but the full player stays open**, leaving only ~50% of the panel visible above the player.
- Tapping a graph node selects it and populates the right panel, but again the player blocks the view.

The principle: **the player should minimize and continue playing when the user explores**. Exploration is the primary activity; playback is background accompaniment.

## Forces

- **Exploration first**: Clicking a tab, a node, or a chip signals "I want to explore now." The player's visual footprint must yield to the exploration target.
- **Playback continuity**: Minimizing (not closing) preserves the audio stream. The iframe continues playing in the 56px mini strip.
- **No surprise interruptions**: The user shouldn't have to manually collapse the player before exploring. The UI should infer intent from the click target.

## Pattern

**Boundaries**: The player and the panels are competing for the same spatial boundary (bottom half). When the panel is activated, the player retreats to the strip (its dormant size) — and vice versa (ADR-049 already handles the reverse: play → player expands, panel retracts).

## Decision

### Trigger points for auto-collapse

| User action | Fires | Should collapse player |
|---|---|---|
| Tap Bani Flow tab | `setPanelState('TRAIL')` | Yes |
| Tap Musician tab | `setPanelState('MUSICIAN')` | Yes |
| Tap desktop drawer handle | `toggleLeftDrawer()` / `toggleRightDrawer()` | Yes |
| Tap graph node | `selectNode()` → `setPanelState('MUSICIAN')` | Yes |
| Tap raga wheel node | `triggerBaniSearch()` → `setPanelState('TRAIL')` | Yes |
| Tap raga/comp chip in expanded player | `triggerBaniSearch()` → `setPanelState('TRAIL')` | Yes |

All of these route through `setPanelState()`. The cleanest approach: **collapse the full player inside `setPanelState()` whenever the new state is not IDLE**.

### Change in mobile.js — `setPanelState()`

```js
function setPanelState(newState) {
  // ... existing guards ...

  // ADR-050: if mobile player is in full mode and we're opening a panel,
  // collapse to mini strip so the panel has room.
  if (newState !== 'IDLE' && typeof _collapseMobilePlayer === 'function') {
    const mp = document.querySelector('.media-player.full-mobile');
    if (mp) _collapseMobilePlayer();
  }

  // ... rest of existing setPanelState logic ...
}
```

### Expose `_collapseMobilePlayer`

Currently `_collapseMobilePlayer` is module-scoped inside `media_player.js`. Expose it as `window._collapseMobilePlayer` so `mobile.js` can call it.

### State flow

```
Player is full-mobile, user taps Bani Flow tab:
  → setPanelState('TRAIL')
  → detects .media-player.full-mobile exists
  → calls _collapseMobilePlayer()
    → player shrinks to 56px strip
    → _savedPanelState is overridden by the new TRAIL state
  → left drawer opens with full viewport height available
  → playback continues in mini strip
```

## Consequences

- Any exploration action (tab, node, chip, graph tap) collapses the full player.
- Playback continues uninterrupted in the mini strip.
- The user never has to manually collapse the player before exploring.
- Desktop is unaffected: `_collapseMobilePlayer` is a no-op when `_mobilePlayer` is null.
- `_savedPanelState` from the expand phase may be stale once the user has navigated elsewhere; this is acceptable because the new navigation represents a deliberate state change (the user is no longer in the context that spawned the player).

## Implementation

1. In `media_player.js`, expose: `window._collapseMobilePlayer = _collapseMobilePlayer;`
2. In `mobile.js` `setPanelState()`, at the top of the function body (after guards), add the collapse check.
3. Render and verify: full player → tap tab → player collapses, panel opens.
