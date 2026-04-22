# ADR-060: Panel Handle Redesign — Horizontal Text, Larger Click Target

**Status**: Accepted
**Date**: 2026-04-21
**Agents**: graph-architect
**Supersedes**: ADR-046 §3 (handle tab dimensions and text direction)
**Depends on**: ADR-046 (desktop drawer panels)

---

## Context

### The current handle design

ADR-046 introduced two persistent edge-tab buttons for desktop:

```css
.desktop-drawer-handle {
  width: 28px;
  height: 100px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 0.65rem;
}
```

The buttons sit at the left and right viewport edges, centred vertically. The label text reads top-to-bottom (rotated 90°), requiring the user to tilt their head to read it. At 28×100px they are small relative to typical button targets.

### The user statement

> "We also find that the Bani Flow and Musician 'handles' … is too small proportional to the screen size: even the buttons on the phone are larger to facilitate finding and clicking them. We should make these bigger, and more prominent. We should also not have to make the user tilt their heads to read the panel text: make the handle large and make the text horizontal and readable: in desktop mode this is certainly possible. In mobile, this is already handled well with the buttons."

The request is **desktop-only** (≥769px). Mobile bottom tab bar (`#mobile-tab-bar`) is unchanged and already uses horizontal text.

### Available space

The handles are at the far left and right edges of the viewport. There is no competing element at these edges. On a typical 1280px desktop, making each handle 80px wide × 48px tall costs nothing — the canvas behind it is always visible and clickable outside the handle region.

---

## Forces

| Force | Direction |
|---|---|
| **Touch-target ergonomics** | Apple HIG recommends 44×44pt minimum. The current 28px width is below this even on a mouse-driven desktop — muscle memory from mobile UX still influences expectations. |
| **Legibility** | Rotated text requires a cognitive rotation step. Horizontal text is read without effort. On a wide desktop layout, horizontal text fits comfortably in a wider tab. |
| **Visual prominence** | The handles are the user's primary invitation to explore the panels. They should look like buttons, not decorative edge trim. |
| **Positioning coherence** | When a panel is open, the handle slides to sit at the panel's outer edge. A wider handle at the panel's edge serves as a visual "close" indicator — closing is just clicking the same visible button. |
| **Mobile unchanged** | The mobile tab bar is already designed correctly (large, horizontal, 44px min-height). The fix is desktop-only. |

---

## Pattern

**Strong Centres** (Alexander): A button that is hard to see or awkward to read is a weak centre. Making the handle the right size and orientation strengthens it as an island of affordance — the user knows precisely what it is and how to use it.

**Boundaries as physical edges** (ADR-046): The handle is the literal edge between the canvas and the panel world. A thicker, clearer edge communicates the boundary more completely.

---

## Decision

### 1. Handle dimensions — desktop only (≥769px)

```css
/* Replaces the ADR-046 dimensions */
.desktop-drawer-handle {
  width: 80px;           /* was 28px */
  height: 48px;          /* was 100px */
  writing-mode: horizontal-tb;   /* was vertical-rl — text is now horizontal */
  text-orientation: mixed;       /* no-op when horizontal, leave for clarity */
  font-size: 0.72rem;    /* was 0.65rem — slightly larger for comfort */
  letter-spacing: 0.06em;
  flex-direction: row;   /* icon + text side by side */
  gap: 4px;
  padding: 0 10px;       /* horizontal padding for breathing room */
}
```

### 2. Vertical positioning

The handles remain vertically centred:

```css
.desktop-drawer-handle {
  top: 50%;
  transform: translateY(-50%);
}
```

No change to vertical position logic.

### 3. Slide positions when panel is open

The existing `left: 280px` / `right: 280px` for `.handle-panel-open` remain correct — the handle slides to sit at the panel's outer edge regardless of its new width, because `left`/`right` refers to the panel edge position, not the handle's own width.

However, because the handle is now 80px wide, the `left: 280px` position means the handle's right edge is at 360px when the left panel is open. This is intentional — the handle overlaps the panel edge to serve as a visible close button anchored to the panel.

### 4. Icon + label layout

Each handle includes an icon (`&#9776;` for Bani Flow, `&#9835;` for Musician) and the label. With horizontal text, these can sit side-by-side in one line:

```html
<!-- Bani Flow handle -->
<button id="desktop-left-handle" …>&#9776; Bani Flow</button>

<!-- Musician handle -->
<button id="desktop-right-handle" …>Musician &#9835;</button>
```

No DOM change needed — the current text content already has this layout. The `writing-mode` change makes it render horizontally.

### 5. Border radius adjustment

With a wider, shorter handle, the border-radius should remain at 4px for non-open state and transition to suit the wider shape:

```css
.desktop-handle-left  { border-radius: 0 6px 6px 0; }   /* left edge tab */
.desktop-handle-right { border-radius: 6px 0 0 6px; }   /* right edge tab */
```

Slight increase from 4px to 6px to suit the larger element. Open-state radii are mirrored.

### 6. Mobile unaffected

All changes are scoped to `@media (min-width: 769px)`. The mobile tab bar (`#mobile-tab-bar`) and its styles are unchanged.

---

## Consequences

- **Handles are immediately legible**: the label reads left-to-right at a comfortable size.
- **Handles meet touch-target ergonomics**: 80×48px is well above the 44×44 minimum.
- **Visual weight increases**: the handles are now recognisable as buttons, not edge trim. This increases discoverability of the panels.
- **No functional change**: toggle semantics, z-ordering, panel state transitions, and mobile behaviour are all unchanged.
- **Transition timing unchanged**: `.transition: left 0.22s ease` / `right 0.22s ease` still applies when panel opens/closes.

---

## Implementation

**Agent**: Carnatic Coder
**File**: `carnatic/render/templates/base.html`

1. Locate the `@media (min-width: 769px)` block for `.desktop-drawer-handle` (currently around line 1704).
2. Update `width`, `height`, `writing-mode`, `text-orientation`, `font-size`, `flex-direction`, `gap`, and `padding` per the Decision §1 values above.
3. Update `border-radius` for `.desktop-handle-left` and `.desktop-handle-right` to 6px per §5.
4. Run `bani-render`, open `graph.html` on desktop.
5. Verify: handles are readable without head-tilt, and clickable with a comfortable pointer target.
6. Open each panel and verify the handles slide correctly to the panel edge and remain legible.
