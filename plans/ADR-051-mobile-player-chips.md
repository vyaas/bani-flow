# ADR-051: Mobile Player Navigation Chips

**Status**: Proposed  
**Date**: 2026-04-19  
**Agents**: graph-architect

## Context

The desktop media player displays musician, raga, and composition chips in a footer below the video, giving the user three exploration vectors from the player. The mobile player does not create a footer on initial load — chips only appear after a track swipe (via `updatePlayerFooter`), and even then only raga and composition chips are shown (no musician chip).

Problem 5 in the scratch notes: "We thus lose a means to explore again. We need to include these chips for the mobile player as well as it affords yet another way to continue exploring."

### Current mobile player structure (full mode)

```
.media-player.full-mobile
  ├── .mp-mini-strip       (hidden in full mode)
  ├── .mp-full-handle      (drag-to-collapse pill)
  ├── .mp-bar              (title bar)
  ├── .mp-video-wrap       (iframe)
  ├── .mp-tracklist        (track list, scrollable)
  └── [.mp-footer]         (NOT created on initial load; inserted on track swipe)
```

### Gaps

1. **No footer on initial load**: `_loadIntoMobilePlayer()` never calls `buildPlayerFooter()`.
2. **No musician chip**: `buildPlayerFooter()` only renders raga and composition chips. There is no musician/artist chip to navigate back to the Musician panel.
3. **Chip tap should minimize player**: Per ADR-050, exploration clicks collapse the full player. Chip taps in the footer must also trigger this — they call `triggerBaniSearch()` which calls `setPanelState('TRAIL')`, so ADR-050's collapse logic handles this automatically.
4. **Touch target size**: Chips have no minimum height enforcement; 0.70rem text with inline flex can fall below the 44px touch target guideline on mobile.

## Forces

- **Exploration continuity**: The player is a gateway to raga, composition, and musician exploration. Chips must be available from the first moment the player opens.
- **Musician navigation**: The desktop player displays the artist name as a static label. On mobile, where space is at a premium, this should be a tappable chip that opens the Musician panel — matching the navigability of raga and composition chips.
- **Touch accessibility**: iOS/Android guidelines specify ≥44px touch targets for interactive elements.
- **ADR-050 synergy**: Tapping a chip triggers `triggerBaniSearch()` → `setPanelState('TRAIL')`. ADR-050 ensures the full player collapses when a panel opens. This means chip taps automatically collapse the player — no extra wiring needed.

## Pattern

**Strong Centres**: Each chip is a navigable centre — a single tap takes the user to that entity's exploration space. The player footer is a navigation hub with three outbound paths.

## Decision

### 1. Build footer on initial mobile load

In `_loadIntoMobilePlayer()`, after building the tracklist and before `showMiniPlayer()`:

```js
// Build footer with navigation chips (raga, composition, musician)
updatePlayerFooter(
  { el: mp.el },
  meta.ragaId || null,
  meta.compositionId || null
);
```

### 2. Add musician chip to buildPlayerFooter

Extend `buildPlayerFooter(meta)` to accept an optional `musicianId` / `musicianLabel`:

```js
if (meta.musicianId) {
  const musicianChip = document.createElement('span');
  musicianChip.className = 'mp-musician-chip';
  musicianChip.textContent = meta.musicianLabel || meta.musicianId;
  musicianChip.title = 'View ' + (meta.musicianLabel || meta.musicianId);
  musicianChip.addEventListener('click', e => {
    e.stopPropagation();
    const n = cy.getElementById(meta.musicianId);
    if (n && n.length) selectNode(n);
  });
  footer.appendChild(musicianChip);
}
```

### 3. CSS for musician chip and touch targets

```css
/* Musician chip — matches .mp-raga-chip style but with distinct colour */
.mp-musician-chip {
  display: inline-flex; align-items: center; gap: 2px;
  color: var(--fg-sub);
  font-size: 0.70rem;
  cursor: pointer;
  user-select: none;
  background: transparent;
  transition: color 0.12s;
  white-space: nowrap;
  min-height: 44px;          /* touch target */
  padding: 0 4px;
}
.mp-musician-chip::before { content: '♫'; font-size: 0.58rem; opacity: 0.7; }
.mp-musician-chip:hover { color: var(--fg); text-decoration: underline; }
.mp-musician-chip:active { color: var(--fg); text-decoration: underline; }

/* Enforce touch targets on existing player chips on mobile */
@media (max-width: 768px) {
  .mp-raga-chip,
  .mp-comp-chip,
  .mp-musician-chip {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
}
```

### 4. Musician chip → open Musician panel

The musician chip's click handler calls `selectNode(n)`, which populates the right panel and (via ADR-046) calls `setPanelState('MUSICIAN')`. ADR-050 will collapse the full player automatically. Chain completed.

## Consequences

- Mobile player shows raga, composition, and musician chips from the first moment it opens in full mode.
- Tapping any chip collapses the full player (via ADR-050) and opens the corresponding panel.
- All three chips meet the 44px touch target on mobile.
- Desktop is unaffected (desktop uses floating windows with the existing `buildPlayerFooter`, which will also gain the musician chip).
- The `meta` object passed through `openOrFocusPlayer()` already carries `nodeId` — this becomes the `musicianId` for the chip.

## Implementation

1. In `media_player.js` `buildPlayerFooter()`: add musician chip when `meta.musicianId` is present.
2. In `media_player.js` `_loadIntoMobilePlayer()`: call `updatePlayerFooter()` with raga, comp, and musician IDs after building the tracklist.
3. In `media_player.js` `_swipeMobileTrack()`: pass musician ID to `updatePlayerFooter()`.
4. In `base.html`: add `.mp-musician-chip` CSS and 44px `min-height` enforcement for all player chips on mobile.
5. Render and verify on mobile.
