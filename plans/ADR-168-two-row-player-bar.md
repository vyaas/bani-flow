# ADR-168: Two-Row Player Bar on Mobile

**Status:** Proposed
**Date:** 2026-06-13
**Agents:** graph-architect

---

## Context

The `.mp-bar` is currently a single-row flex container:

```
[▾ fold-cue] [──────── chip rail ────────] [copy][share][yt][≡?][✕]
```

On desktop this is tolerable: the player window is resizable, so the user can
widen it until all chips fit. The overflow menu (`▾ N`) handles any remaining
overflow gracefully.

On mobile (`.full-mobile`), the bar is pinned to full screen width — typically
375–430 px. The action buttons alone consume ~220 px at their 44 px touch
targets (copy + share + yt + tracklist + close = 5 × 44 px). The fold-cue adds
another 44 px. That leaves ≤120 px for the chip rail on a narrow phone — barely
enough for one chip, let alone the musician + raga + composition triptych that
ADR-159 prescribes.

The current commit `b7ab494` addressed overflow by sending extra chips to a
`▾ N` menu, but this still results in truncated chips visible in the header —
the user sees an incomplete identity picture at a glance, which violates the
immersion principle.

**Forces in tension:**

| Force | Tension |
|---|---|
| Immersion (ADR-001) | All identity chips (musician, raga, composition) visible without a tap |
| Touch ergonomics (ADR-161) | Action buttons need 44 px touch targets |
| Screen real estate on mobile | 375–430 px total width |
| Drag affordance on desktop | The bar is the drag handle; we must not break that |
| Minimize affordance (ADR-160) | Fold-cue is wired to minimize; it must remain accessible |

---

## Pattern

**Layers of Scale** (Alexander): rather than cramming every element onto one
horizontal band, stack two horizontal bands — one for identity (who/what is
playing) and one for action (what you can do). This mirrors how print layout
separates a headline from its action bar.

---

## Decision

### Two-row bar: chips row + actions row

Restructure `buildPlayerBar()` so the bar contains **two inner rows** rather
than one flat list of children:

```
.mp-bar  (flex column; drag handle is the entire bar)
  ├── .mp-bar-chips-row   (flex row: fold-cue · chip rail)
  └── .mp-bar-right       (flex row: copy · share · yt · [≡?] · [✕])
```

**Desktop behaviour (unchanged):**

`.mp-bar` stays as a flex row — `mp-bar-chips-row` gets `flex: 1 1 0` (fills
remaining space) and `mp-bar-right` gets `flex-shrink: 0`. The two rows sit
side-by-side exactly as today. No visual change on desktop.

**Mobile behaviour (`.full-mobile`):**

`.mp-bar` switches to `flex-direction: column`. `mp-bar-chips-row` becomes full
width (100 %) and `mp-bar-right` becomes its own full-width row, buttons
right-aligned (`justify-content: flex-end`).

The fold-cue stays in `mp-bar-chips-row` as the left-most element — it remains
the minimize affordance for the chips row tap zone (consistent with ADR-160/161
which wires it as an explicit touch target on mobile).

### Before / After (mobile)

**Before:**
```
┌─────────────────────────────────────────────┐
│ ▾  [T.N. Krishnan] [▾ 2]  [copy][share][▶︎][≡][✕] │
└─────────────────────────────────────────────┘
   ← 375 px → chips truncated, buttons squeezed
```

**After:**
```
┌─────────────────────────────────────────────┐
│ ▾  [T.N. Krishnan]  [Bhairavi]  [Varnam]    │  ← chip row
├─────────────────────────────────────────────┤
│                     [copy][share][yt][≡][✕] │  ← action row
└─────────────────────────────────────────────┘
```

All five action buttons at 44 px each fit comfortably in row 2 (220 px on a
375 px bar with 16 px horizontal padding). The chip row has the full 375 px for
identity chips — the overflow menu is no longer needed on mobile (the
`reflowRail` logic can be disabled under `.full-mobile`).

---

## Implementation

### 1 — JS change (Carnatic Coder owns `.js`)

In `buildPlayerBar()` in `media_player.js`:

a. Create a new wrapper div:
   ```js
   const chipsRow = document.createElement('div');
   chipsRow.className = 'mp-bar-chips-row';
   chipsRow.appendChild(foldCue);
   if (rail) chipsRow.appendChild(rail);
   else if (titleSpan) chipsRow.appendChild(titleSpan);
   bar.appendChild(chipsRow);
   ```
b. Append `mp-bar-right` afterwards (unchanged).

The `mp-bar` DOM therefore becomes `[mp-bar-chips-row] [mp-bar-right]` — two
children instead of three or more.

Any code that queries `.mp-bar > .mp-fold-cue` or `.mp-bar > .mp-rail` must be
updated to `.mp-bar-chips-row > .mp-fold-cue` (etc.). Search for:
- `bar.querySelector('.mp-fold-cue')`
- `bar.querySelector('.mp-rail')`
- `el.querySelector('.mp-bar .mp-fold-cue')`

### 2 — CSS change (Carnatic Coder owns `.html`)

In `base.html`, in the shared (non-mobile) block, add:

```css
.mp-bar-chips-row {
  display: flex; align-items: center; gap: 5px;
  flex: 1; min-width: 0;           /* fills bar on desktop */
  overflow: hidden;                 /* same clip rule as old .mp-rail */
}
```

Remove `flex: 1; overflow: hidden` from `.mp-bar` (they move to
`.mp-bar-chips-row`). Keep `display: flex; align-items: center; gap: 5px;` on
`.mp-bar` for the desktop side-by-side layout.

In the mobile block (inside `@media (max-width: ...)` or the `.full-mobile`
selector block):

```css
.media-player.full-mobile .mp-bar {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}
.media-player.full-mobile .mp-bar-chips-row {
  flex: unset;
  width: 100%;
  padding: 4px 8px;
}
.media-player.full-mobile .mp-bar-right {
  justify-content: flex-end;
  padding: 2px 4px;
  border-top: 1px solid var(--border-strong);
}
```

### 3 — Overflow menu on mobile (optional clean-up)

With a full-width chip row, `reflowRail()` may no longer need to demote chips
into the `▾ N` overflow menu on `.full-mobile`. The Coder may suppress
`reflowRail` calls for full-mobile players, or leave it as a graceful fallback
for very long chip names.

### 4 — Drag handle

The `wireDrag()` call uses `.mp-bar` as the drag target on desktop. The
two-row layout adds no new drag-handle complexity — `.mp-bar` remains the
handle, and `mp-bar-chips-row` and `mp-bar-right` are its children. On mobile
the player is not draggable (it's a bottom sheet), so no change needed.

---

## Consequences

**Positive:**
- All identity chips (musician · raga · comp) visible without overflow menu on
  mobile — immersion principle satisfied.
- Action buttons get their full 44 px touch targets on a dedicated row without
  crowding.
- Desktop layout is completely unchanged.
- No new data-model or schema implications — purely a layout change.

**Negative / risks:**
- The `bar.querySelector('.mp-fold-cue')` calls (there are several) must be
  updated; failing to update them is a silent bug (the fold-cue won't be found
  and minimize will break).
- Bar height increases by ~32–36 px on mobile (an extra row). This reduces the
  video area by the same amount. Given the current `50vh - 56px` height budget
  this is acceptable; if it proves too tight the Coder should reduce chip-row
  padding.
- The drag affordance visual cue (cursor: grab) on mobile is moot since the bar
  is not draggable there, but the CSS should remain correct (`pointer-events:
  none` on the `.full-mobile .mp-bar` may be needed if the tap-to-minimize
  handler conflicts with child button taps).

---

## Open questions

1. Should the chips row also be the tap-to-minimize surface on mobile, or should
   we demote minimize to an explicit chevron button and make the chip row
   non-interactive as a drag zone? (Current: fold-cue is the explicit affordance
   per ADR-161 — no change needed.)
2. Should we suppress `reflowRail` entirely on mobile, or keep it as a safety
   net for very long names? (Recommendation: keep it; long tala names can still
   overflow a 375 px row.)

---

*Implements layout fix identified in session 2026-06-13. Routes to Carnatic
Coder for `.js` + `.html` changes; no data or schema changes required.*
