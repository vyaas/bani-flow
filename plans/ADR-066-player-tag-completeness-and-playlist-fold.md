# ADR-066: Media Player Tag Completeness and Concert Playlist Fold-First

**Status**: Accepted  
**Date**: 2026-04-22  
**Agents**: graph-architect → carnatic-coder

---

## Context

Three distinct gaps degrade the media player experience today:

### Gap 1 — Incomplete tags

The player footer currently shows a raga chip and a composition chip only when both
`ragaId` and `compositionId` are present in `meta`. This misses:

- **Musician chip**: The artist name appears in the title bar as plain text (non-navigable). The
  footer has no musician chip, so there is no one-tap path back to the Musician panel from the
  player — the primary exploration gateway is severed.
- **Composer chip**: `buildComposerChip()` already exists and is used in concert-bracket rows, but
  it is never called from `buildPlayerFooter()`.
- **Non-composition fallback label**: When `compositionId` is null (most legacy tracks, interviews,
  misc recordings) the footer is suppressed entirely. The user sees no context about what is
  playing. The panel renders a `rec-title` label for non-composition items; the player has no
  equivalent.
- **Footer suppressed on mobile initial load when track has no raga/comp**: `buildPlayerFooter`
  returns `null` when both `ragaId` and `compositionId` are null, so no exploration path is
  available at all.

### Gap 2 — Chip visual divergence from panels

The player footer uses `.mp-raga-chip` and `.mp-comp-chip`, which were written to *mirror* the
panel chips (`.raga-chip`, `.comp-chip`) but are separate CSS classes with subtle size/weight
differences. The user wants "very tight coupling" — the player is yet another exploration surface
and its chips should be indistinguishable from panel chips.

### Gap 3 — Mobile concert tracklist always visible

The CSS rule `.media-player.full-mobile .mp-tracklist { display: block; flex: 1; }` forces the
tracklist to always occupy half the player height on mobile. The toggle button (hamburger `≡`) in
the title bar exists in the DOM but **its click event is never wired in the mobile path** —
`createPlayer()` wires it but `_openMobilePlayer()` uses a different code path with no equivalent
wiring. The result: the tracklist is permanently visible and the hamburger does nothing on mobile.

On desktop the tracklist already starts hidden (JS sets `display: none` on `tracklistDiv`) and
the toggle is wired; no desktop change is needed for this gap.

---

## Forces

- **Exploration continuity**: Every chip in every panel is a door. The player must offer the same
  doors — musician, raga, composition, composer — regardless of whether the recording has all four.
- **Vertical space on mobile**: At `height: calc(50vh - 56px)` the player has ~270 px of usable
  space after the bar and handle. A permanently-open tracklist cuts the video to ~135 px. A
  fold-first playlist restores the full 270 px to the video and lets users pull the list only when
  they want it.
- **One source of style**: Using the same chip CSS classes in the player as in the panels means
  future panel chip tweaks propagate to the player automatically — no sync debt.
- **Meta propagation**: The update path (`updatePlayerFooter` called from track-swipe and
  tracklist-click) currently only receives `ragaId` and `compositionId`; it discards `nodeId`,
  `artistName`, and `displayTitle`. The musician chip and fallback label require these at every
  update.

---

## Pattern

**Strong Centres + Levels of Scale**: Every playing state is a navigable centre. The footer is a
compact hub of outgoing edges — musician, composer, raga, composition. Each tap takes the user
one level deeper without leaving the exploration context. Fold-first on the tracklist keeps the
video the dominant centre; the list is secondary detail.

---

## Decision

### 1. Extend `buildPlayerFooter(meta)` signature

Before (fields):
```
meta = { ragaId, compositionId }
```

After (fields, all optional):
```
meta = {
  ragaId,        // → raga-chip (navigates to raga in Bani Flow)
  compositionId, // → comp-chip (navigates to composition in Bani Flow)
  nodeId,        // → musician-chip (navigates to musician panel)
  artistName,    // label for musician chip
  displayTitle,  // fallback label when compositionId is null
}
```

### 2. Chip classes in footer → switch to canonical panel chip classes

| Before | After |
|--------|-------|
| `.mp-raga-chip` | `.raga-chip` |
| `.mp-comp-chip` | `.comp-chip` |
| _(none)_ | `.musician-chip` (era-tinted, same as panels) |
| _(none)_ | `.composer-chip` (dashed border, same as panels) |
| _(none)_ | `<span class="rec-title">displayTitle</span>` (when no compositionId) |

The old `.mp-raga-chip` and `.mp-comp-chip` CSS rules remain in `base.html` as dead letter for
safety (they are not removed; they simply stop being applied).

### 3. Footer always built when `nodeId` or `displayTitle` is present

Remove the early-return guard `if (!ragaId && !compositionId) return null`. Replace with:

```js
const hasAny = ragaId || compositionId || nodeId || displayTitle;
if (!hasAny) return null;
```

### 4. Musician chip in footer

```js
if (nodeId) {
  const eraId = cy.getElementById(nodeId).data('era') || null;
  const tint  = THEME.eraTintCss(eraId);
  const chip  = document.createElement('span');
  chip.className = 'musician-chip';
  chip.style.setProperty('--chip-era-bg',     tint.bg);
  chip.style.setProperty('--chip-era-border', tint.border);
  chip.textContent = artistName || nodeId;
  chip.title = (artistName || nodeId) + ' — Open Musician panel';
  chip.addEventListener('click', e => {
    e.stopPropagation();
    chip.classList.add('chip-tapped');
    setTimeout(() => chip.classList.remove('chip-tapped'), 200);
    const n = cy.getElementById(nodeId);
    if (n && n.length) {
      selectNode(n);
      if (typeof window.setPanelState === 'function')
        setTimeout(() => window.setPanelState('MUSICIAN'), 50);
    }
  });
  footer.appendChild(chip);
}
```

### 5. Composer chip in footer (after comp-chip)

```js
const composerChip = buildComposerChip(compositionId);
if (composerChip) footer.appendChild(composerChip);
```

### 6. Non-composition fallback label

```js
if (!compositionId && displayTitle) {
  const lbl = document.createElement('span');
  lbl.className = 'rec-title';
  lbl.style.fontSize = '0.68rem';
  lbl.textContent = displayTitle;
  footer.appendChild(lbl);
}
```

### 7. Propagate full meta through `updatePlayerFooter`

Change signature:
```js
// Before
function updatePlayerFooter(player, ragaId, compositionId)

// After — merges player.meta with per-track overrides
function updatePlayerFooter(player, ragaId, compositionId, displayTitle)
```

Inside: pull `nodeId` and `artistName` from `player.meta` (already stored there). Pass
`displayTitle` from the track. Call `buildPlayerFooter` with assembled meta.

All three call sites must be updated:
- `buildPlayerTrackList` track click: pass `t.display_title`
- `_openMobilePlayer` initial load: pass `_initTrack.display_title`
- `_swipeMobileTrack`: pass `track.display_title`, and wrap `{ el: mp.el, meta: mp.meta }` so
  `player.meta` is available

### 8. Mobile tracklist: fold-first + wire toggle

**CSS change in `base.html`** — change the full-mobile tracklist rule:

```css
/* Before */
.media-player.full-mobile .mp-tracklist {
  display: block;
  flex: 1; overflow-y: auto;
}

/* After — hidden by default; JS adds .mp-tracklist-open to show it */
.media-player.full-mobile .mp-tracklist {
  display: none;
  max-height: 45%;
  overflow-y: auto;
  flex-shrink: 0;
}
.media-player.full-mobile .mp-tracklist.mp-tracklist-open {
  display: block;
}
```

`mp-video-wrap` retains `flex: 1` so it fills all available space when the tracklist is hidden,
and compresses naturally when the tracklist is open.

**JS change in `_openMobilePlayer`** — wire the tracklist toggle button:

```js
// After populating tracklistDiv, wire the toggle button in mp.bar
const mobileToggleBtn = mp.bar.querySelector('.mp-tracklist-toggle');
if (mobileToggleBtn && mp.tracks.length > 0) {
  mobileToggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = mp.tracklistDiv.classList.contains('mp-tracklist-open');
    mp.tracklistDiv.classList.toggle('mp-tracklist-open', !isOpen);
    mobileToggleBtn.classList.toggle('mp-tracklist-open', !isOpen);
    if (!isOpen) {
      // Mark active track when opening
      mp.tracklistDiv.querySelectorAll('.mp-track-item').forEach((li, idx) => {
        li.classList.toggle('mp-track-active', idx === mp.trackIndex);
      });
    }
  });
}
```

---

## Consequences

- **Footer always shows musician chip** when `nodeId` is in meta — this is the case for all
  concert and raga-tree play paths. Named players (sruti bar) don't pass `nodeId` so the chip
  won't appear there.
- **Composer chip** appears only when the composition has a linked `composer_id` in the data.
- **Non-composition label**: interviews, lectures, misc recordings now show their `display_title`
  in small font in the footer, providing context even when no raga/comp is tagged.
- **Legacy format gap**: The root cause of missing composition chips for legacy tracks is a
  data-coverage issue (many legacy `nd.tracks` items lack `composition_id`), not a code bug.
  This ADR does not retroactively fix the data; it provides the fallback `displayTitle` label
  as the visual mitigation. Data coverage is a separate Librarian task.
- **Mobile concert tracklist**: starts hidden; hamburger button now works; video fills full player
  height until user requests the list.
- **CSS debt eliminated**: `.mp-raga-chip` and `.mp-comp-chip` in `base.html` are dead letter
  after this change. They can be removed in a dedicated cleanup pass.
- **No breaking change**: The footer-build call that creates named players passes no `nodeId`, so
  those players retain their current (no-chip) footer behaviour.

---

## Implementation checklist (Carnatic Coder)

- [ ] `media_player.js` — extend `buildPlayerFooter(meta)` with musician, composer, label
- [ ] `media_player.js` — switch `.mp-raga-chip` → `.raga-chip`, `.mp-comp-chip` → `.comp-chip`
- [ ] `media_player.js` — update `updatePlayerFooter` signature + three call sites
- [ ] `media_player.js` — wire tracklist toggle in `_openMobilePlayer`
- [ ] `base.html` — change `.media-player.full-mobile .mp-tracklist` CSS
- [ ] `base.html` — add `.media-player.full-mobile .mp-tracklist.mp-tracklist-open` rule
- [ ] `bani-render` — rebuild `graph.html`
- [ ] Verify on desktop and mobile (toggle, chips, non-comp label)

[AGENTS: graph-architect]
