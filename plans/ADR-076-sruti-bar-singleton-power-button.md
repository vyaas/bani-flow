# ADR-076: Sruti Bar — Singleton Power Button and Fixed-Width Widget

**Status:** Proposed  
**Date:** 2026-04-22

---

## Context

The Sruti Bar (ADR-029) embeds a strip of chromatic tanpura pitch buttons in the header.
A click on a pitch button opens a floating YouTube player via `openPlayer(videoId, title, 'sruti')`.
A second click on the same button, or a click on the power indicator (●), calls `deactivate()` in
`sruti_bar.js`, which removes the player, clears the active-button class, and extinguishes the
indicator.

**Bug — split ownership of close state.** The floating player window has a standard ✕ close
button (`.mp-close`) wired to `closePlayer('sruti')` inside `media_player.js`. `closePlayer`
removes the DOM element and clears `namedPlayerRegistry` — but it never calls `deactivate()` in
`sruti_bar.js`. The result is a permanent stale state after the user clicks ✕:

| Element | Expected | Actual |
|---|---|---|
| Pitch button | unlit (no `sruti-active`) | still pressed/lit |
| Power indicator ● | grey (`fg-muted`) | still green (`sruti-on`) |
| `namedPlayerRegistry` | empty | empty ✓ |
| Player DOM | removed | removed ✓ |

The sruti bar *looks* on while the drone *is* silent. Clicking the pitch button again opens a
second player instead of restoring an expected toggle-off, because `activeBtn` is already set and
the click takes the `if (activeBtn === btn) { deactivate(); }` branch — closing a player that no
longer exists, then returning without opening a new one. The interaction model is broken.

**Layout — fluid width causes jitter.** `#sruti-strip` uses `flex: 1` to occupy the remaining
space between `#header-left` and `.controls` in the three-column header grid. The width varies
with viewport size and the content of adjacent columns. When the view selector buttons have long
labels the sruti buttons shrink noticeably; at wide viewports they stretch beyond comfortable
touch/click width.

**Identity — the strip has no label.** Nothing in the current UI identifies the strip as a
"sruti" control. The power indicator (●) is a monochrome dot that doubles as a stop button; its
purpose is only revealed via its `title` tooltip. A new user has no visual affordance for what
the row of pitch letters does.

**Forces in tension:**

1. **Correct state vs. escape hatch** — providing a close button on the tanpura player window
   creates a second path to close the drone that bypasses sruti bar state. Either the two paths
   must be tightly coupled, or one path must be removed. Tight coupling spreads state mutation
   across two independent modules; removal is simpler and safer.
2. **Fixed layout vs. responsive flexibility** — a fixed-width sruti strip creates predictable
   alignment across viewport sizes but forces the header to absorb any remaining space in the
   central column. Given the header uses a three-column `260px | 1fr | 260px` grid, the 1fr
   column already adapts to the viewport; fixing the strip's max-width clips that flexibility
   gracefully without breaking anything.
3. **Winamp affordance vs. minimal chrome** — a "SRUTI" label and a power-button icon add visual
   weight but clarify function immediately. The tradeoff is worth it: the sruti bar is a
   permanent fixture above the graph and deserves a legible identity, especially for new visitors.
4. **Power button as sole toggle vs. re-click-to-toggle** — keeping pitch re-click as an
   additional toggle path is consistent with the existing ADR-029 interaction model and costs
   nothing. The power button and pitch re-click are both correct paths to deactivate. Two
   activation paths is one too many; but here the second path (pitch re-click) is natural
   instrument-like behaviour (you press the same note to stop it).

---

## Pattern

**Singleton gateway** (from the "lock" pattern in interactive UI design): objects with global
audio effect should have exactly one authoritative control point. The tanpura drone is a session-
scoped singleton — one pitch, one player, one on/off state. Exposing a second dismissal path
(the player's ✕ button) that bypasses the singleton's state machine violates this principle.
The fix is not to add a callback — it is to remove the second path.

**Named widget identity** (Winamp, Reason, classic audio UIs): fixed-function hardware-style
panels carry a permanent label so users can orient at a glance. The sequencer module says
"SEQ-32"; the tanpura strip should say "SRUTI". The label is not decoration; it is the
affordance that tells the user what the row of letters does before they click.

**Power button as state mirror** (LED indicator pattern): the on/off state of a device should
be legible at a glance from a dedicated indicator. The current ● dot indicator *is* this
pattern, but it competes visually with the pitch buttons and is easy to miss. Making it a
prominent ⏻ power-button symbol — larger, positioned as a labeled endpoint of the widget —
turns the state indicator into an unambiguous control affordance.

---

## Decision

### 1. Remove the ✕ close button from the sruti tanpura player window

In `openPlayer(videoId, title, playerId)` inside `media_player.js`, after building the player
bar via `buildPlayerBar`, if `playerId === 'sruti'`, remove the `.mp-close` button from the DOM
before the element is appended. Do not wire a close-click listener for the sruti player.

The power button in the sruti strip is now the **sole mechanism** for closing the tanpura player.
Deactivation can also happen by re-clicking the active pitch button (existing behaviour, unchanged).

**Why remove rather than add a callback?** Adding a callback from `media_player.js` into
`sruti_bar.js` creates a cross-module dependency: media_player.js would need to know about
sruti state. Removing the close button eliminates the problem entirely.

### 2. Replace the ● indicator with a ⏻ power button

Replace the `&#9679;` bullet character (●) in `#sruti-power` with the Unicode power symbol
`&#9211;` (the ⏻ circle-with-line glyph, U+23FB: POWER SYMBOL). Increase the button's
visual weight: larger font-size, rounded border visible at all times (not just on-hover).

The button retains its existing `click → deactivate()` behaviour unchanged.

**On state** (`sruti-on` class): accent-green fill, depressed bevel — visually "powered on".
**Off state** (no class): muted border, grey icon — visually "standby".

### 3. Add a "SRUTI" label to the left of the pitch buttons

Prepend a `<span id="sruti-label">SRUTI</span>` inside `#sruti-strip`, before `#sruti-buttons`.
The label is uppercase, monospace, small caps, non-interactive. It visually anchors the widget
identity, inspired by Winamp module headers and classic hardware rackmount labels.

### 4. Give `#sruti-strip` a fixed maximum width

Change `flex: 1; min-width: 0` on `#sruti-strip` to:
- `flex: 0 0 auto; width: fit-content; max-width: 400px`

This prevents the strip from stretching across the full centre column at wide viewports while
still allowing it to shrink gracefully if the viewport is narrow.

The strip is already hidden on mobile (`display: none` at ≤768px); no mobile changes needed.

---

## HTML Before / After

### Before (`base.html`, `#sruti-strip`)

```html
<!-- ── Sruti Strip (ADR-029): equispaced tanpura pitch buttons ── -->
<div id="sruti-strip">
  <div id="sruti-buttons"></div>
  <span id="sruti-power" class="sruti-power" title="Tanpura — click to stop">&#9679;</span>
</div>
```

### After

```html
<!-- ── Sruti Strip (ADR-076): labeled widget with power button ── -->
<div id="sruti-strip">
  <span id="sruti-label" class="sruti-label">SRUTI</span>
  <div id="sruti-buttons"></div>
  <button id="sruti-power" class="sruti-power" title="Tanpura on/off" aria-label="Sruti power">&#9211;</button>
</div>
```

Key changes:
- `<span>` indicator → `<button>` (keyboard accessible, correct semantics)
- `&#9679;` bullet → `&#9211;` power symbol (⏻)
- Added `<span id="sruti-label">` before the buttons

---

## CSS Before / After

### Before (`#sruti-strip`, `#sruti-buttons`, `.sruti-power`)

```css
#sruti-strip {
  display: flex; align-items: center; gap: 0;
  flex: 1; justify-content: center; min-width: 0;
}
.sruti-power {
  font-size: 1.2rem; color: var(--fg-muted);
  cursor: pointer; flex-shrink: 0; margin-left: 8px;
  padding: 2px 6px; border-radius: 4px;
  transition: color 0.15s; user-select: none; line-height: 1;
}
.sruti-power.sruti-on  { color: var(--accent-sub); }
.sruti-power:hover     { color: var(--accent-danger); }
```

### After

```css
/* Fixed-width widget — no longer fills the centre column */
#sruti-strip {
  display: flex; align-items: center; gap: 4px;
  flex: 0 0 auto; width: fit-content; max-width: 420px;
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 2px 6px;
}
/* "SRUTI" rackmount label */
.sruti-label {
  font-size: 0.6rem; font-family: var(--font-mono, monospace);
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--fg-sub); white-space: nowrap; user-select: none;
  padding-right: 4px;
  border-right: 1px solid var(--border-strong);
  flex-shrink: 0;
}
/* Power button — sole on/off control */
.sruti-power {
  font-size: 1rem; background: none;
  border: 1px solid var(--border-strong);
  color: var(--fg-muted); cursor: pointer;
  flex-shrink: 0; margin-left: 4px;
  padding: 2px 5px; border-radius: 4px;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  user-select: none; line-height: 1;
}
.sruti-power.sruti-on  {
  color: var(--accent-sub);
  border-color: var(--accent-sub);
  background: rgba(var(--accent-sub-rgb, 142,192,124), 0.12);
}
.sruti-power:hover     { color: var(--accent-danger); border-color: var(--accent-danger); }
```

---

## `media_player.js` Change

In `openPlayer`, after building the player bar for a named (`playerId`) player, remove the
close button if `playerId === 'sruti'`:

```js
// Named player: sruti drone has no close button — power switch is in the sruti bar
if (playerId === 'sruti') {
  const closeEl = el.querySelector('.mp-close');
  if (closeEl) closeEl.remove();
  // Do not wire a close-click listener for sruti
} else {
  el.querySelector('.mp-close').addEventListener('click', () => {
    closePlayer(playerId);
  });
}
```

The existing close-click listener wiring in `openPlayer` (for non-sruti named players) is
unchanged. The `closePlayer` function itself is unchanged.

---

## `sruti_bar.js` Change

None required. The `deactivate()` function, the power-indicator click listener, and the
pitch-button toggle logic are all correct. The bug was entirely in the second close path
(player ✕ → `closePlayer`) bypassing `deactivate()`. With that path removed, `sruti_bar.js`
becomes the sole controller of sruti state, which is what it was designed to be.

---

## Consequences

**Positive:**
- Visual and audio state are always in sync. Green indicator ↔ drone playing.
- No cross-module state dependency introduced. `media_player.js` and `sruti_bar.js` stay
  independent except for the existing `openPlayer`/`closePlayer` API.
- The sruti strip has a visible identity; new users immediately understand its purpose.
- Fixed-width layout stops the strip from stretching over non-sruti content in the header.
- The power button is semantically correct (`<button>`) and keyboard-accessible.

**Negative / accepted tradeoffs:**
- Users cannot drag the tanpura player away and dismiss it via the player window. Any user who
  expects a close button on every media window will need to find the power button. This is
  intentional: the tanpura is the ground of the session, not a one-off window.
- The sruti player is now more "always there" — users cannot minimise or re-position it
  independently of the pitch buttons. This is consistent with the ADR-029 design intent
  (drone is the ground, not a recording).

---

## Implementation

**Carnatic Coder** owns all changes below. No Librarian changes. No schema changes.

1. **`carnatic/render/templates/base.html`**
   - Replace `#sruti-strip` HTML (power indicator → button, add SRUTI label).
   - Replace CSS for `#sruti-strip`, `.sruti-label`, `.sruti-power` per After blocks above.

2. **`carnatic/render/templates/media_player.js`**
   - In `openPlayer`, after building the bar for a named player: conditionally remove
     `.mp-close` and skip the close-click listener when `playerId === 'sruti'`.

3. **`carnatic/render/templates/sruti_bar.js`**
   - No logic changes needed.
   - Update the comment at the top to reference ADR-076 alongside ADR-029.

4. **Run `bani-render`** to rebuild `carnatic/graph.html`.

5. **Validate**: open in browser, play a pitch, click ✕ … there is no ✕. Toggle via power
   button: player closes, button unlit, indicator grey. Re-click pitch: player reopens,
   button lit, indicator green.

6. **Commit**: `render(toolchain): sruti bar power-button singleton control (ADR-076)`

---

## Open Questions

- Should the sruti player also be dismissed when the user switches to a different view
  (Graph → Timeline → Raga Wheel)? Current ADR-029 intent says the drone persists across
  views. Leaving this behaviour unchanged here; may revisit in a later ADR if desired.
- The `--accent-sub-rgb` CSS variable may not exist in the current token set; the Coder should
  use a fallback (`rgba(142,192,124,0.12)` hard-coded) if it is absent rather than adding a
  new token outside a design-token ADR.
