# ADR-065: Circular Play and Link Buttons

**Status**: Accepted
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-025 (explicit play button), ADR-053 (concert-vs-direct variants)

---

## Context

### The problem

The current `.rec-play-btn` (▶) and `.yt-ext-link` (↗) sit beside every recording entry in the Bani Flow trail, concert brackets, and musician panel. Their shape is a narrow horizontal pill — `padding: 1px 5px; border-radius: 6px` — so small that Gruvbox typography and a single glyph are doing all the affordance work. The aspect ratio is roughly 2:1 wide. They feel like edit-mode affordances, not something worth clicking.

```css
/* before */
.rec-play-btn {
  background: none;
  border: 1px solid var(--border-strong);
  color: var(--accent-sub);
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1;
}
```

```css
/* before */
.yt-ext-link {
  color: var(--fg-muted);
  font-size: 0.62rem;
  text-decoration: none;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.6;
  white-space: nowrap;
}
```

### The aspiration

A lesson from Winamp and every good media widget: the play button should be a **circle**. It has a clear role (launch music), a clear affordance (it is the one round thing in a list of rectangular text chips), and it should feel satisfying to tap/click. The external YouTube link should be its circular sibling — same diameter, same dignity, same tactile quality.

Crucially: this is *not* a visual refresh. It is an **accessibility and pointing-device affordance** change. The current buttons have hit targets of approximately 20 × 12 px — well below the 44 × 44 px WCAG touch target recommendation, and dangerously small on mobile. Making them circular at 28 px diameter (with 44 px logical touch targets via min-width/min-height or padding) resolves the accessibility deficit and, as a side effect, makes them beautiful.

### Scope

**Rendering layer only — CSS and minor icon text changes in `base.html`.** No JS, no data, no new HTML classes. The `.rec-play-btn` and `.yt-ext-link` elements are already rendered by `media_player.js` and `bani_flow.js`; only their visual treatment changes.

---

## Forces

| Force | Direction |
|---|---|
| Accessibility | Hit targets must reach ≥ 44 × 44 px on mobile (WCAG 2.5.5) |
| Affordance | Shape should telegraph "play" — circles are universally understood as play controls |
| Joy | Clicking should feel good — pressed state, micro-depth, satisfying colour shift |
| Sidebar density | Recording lists are dense; buttons must not visually overpower the text metadata |
| Consistency | Both play (▶) and link (↗) should feel like a matched pair |
| Variants | Concert (dashed border) and direct (solid border) visual distinction must survive |
| Playing state | Currently-playing row highlights button in `var(--accent)` — must still work |

---

## Pattern

**Alexander #15: Level of Scale** — within a dense list of small chips and abbreviated text, a circle of deliberate size creates a strong centre. The glyph inside the circle operates at one level of scale; the circle itself operates at the next. Text items are not circles; the button is the only circle; it is found immediately.

**Winamp principle** — the transport controls in a media player have no text labels. They are icons inside fixed-size circular or square buttons. The shape *is* the label. That's what we want.

---

## Decision

### Geometry

Both `.rec-play-btn` and `.yt-ext-link` become **circles of 28 px diameter** (CSS `width`/`height`). They are `display: inline-flex; align-items: center; justify-content: center` so the glyph is optically centred. `border-radius: 50%` enforces the circle. Padding is removed — explicit dimensions handle the space.

```css
/* after */
.rec-play-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  background: none;
  color: var(--accent-sub);
  font-size: 0.72rem;
  cursor: pointer;
  line-height: 1;
  transition: background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.rec-play-btn:hover {
  background: var(--bg-input);
  border-color: var(--accent-sub);
  color: var(--fg);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-sub) 25%, transparent);
}
.rec-play-btn:active {
  background: var(--bg-pressed);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.45);
  transform: scale(0.93);
}
```

```css
/* after */
.yt-ext-link {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 50%;
  border: 1.5px solid var(--border-muted, var(--border-strong));
  color: var(--fg-muted);
  font-size: 0.70rem;
  text-decoration: none;
  white-space: nowrap;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.yt-ext-link:hover {
  color: var(--fg);
  background: var(--bg-active);
  border-color: var(--fg-muted);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--fg-muted) 20%, transparent);
}
.yt-ext-link:active {
  background: var(--bg-pressed);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.45);
  transform: scale(0.93);
}
```

### Variants survive

Concert (dashed) and direct (solid) differentiation continues to live through `border-style`. The circle shape means the dashed border is clearly visible as a ring of dashes around the triangle — which happens to be a strong visual mnemonic for "concert" (multiple tracks) vs "direct" (single video).

```css
/* concert variant — dashed ring */
.rec-play-btn.play-btn-concert {
  border: 1.5px dashed var(--accent-sub);
  color: var(--accent-sub);
}
.rec-play-btn.play-btn-concert:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-input);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}
/* direct variant — solid ring */
.rec-play-btn.play-btn-direct {
  border: 1.5px solid var(--border-strong);
}
```

### Playing state

The "currently playing" row already upgrades `.rec-play-btn` to `color: var(--accent); border-color: var(--accent)`. With the circular shape this renders as a glowing amber ring — a clear playing indicator.

### Mobile touch targets

28 px is below 44 px. The element itself stays visually 28 px, but a 44 px logical touch target is achieved via `min-width: 44px; min-height: 44px` on the `.trail-acts` container **or**, preferably, on the buttons themselves using a pseudo-element trick that expands the hit area without expanding the visual. Because both buttons live inside `.trail-acts { display: flex; align-items: center; gap: 4px }`, the cleanest solution is to apply `min-width: 44px; min-height: 44px` directly to each button, letting the extra space extend the clickable area without affecting layout. Alternatively, a `::after` pseudo-element with `position: absolute; inset: -8px` expands the hit area invisibly. Either approach is acceptable; the implementation chooses whichever is cleaner for the layout.

---

## Consequences

### Positive

- Circular buttons are unmistakably "play" controls — the affordance is strongly telegraphed
- Accessible touch targets on mobile (≥ 44 × 44 px)
- The `:active` scale-down animation gives physical feedback ("the button clicked")
- Concert vs direct differentiation is visually richer (dashed ring vs solid ring)
- Playing state (amber glowing ring) is now a clear, beautiful indicator

### Negative / Risks

- The 28 px circular icon is slightly taller than the current 14–16 px pill; recording rows will expand by ~10–12 px. Given the dense information already in each row, this is acceptable.
- `.trail-acts` contains only `{▶, ↗}`. Both grow together, so the pair remains balanced.

---

## Implementation

**Only `carnatic/render/templates/base.html` changes.** Target rules:

1. `.rec-play-btn` — replace geometry, add flex centering, border-radius 50%, transitions, `:active` scale
2. `.yt-ext-link` — replace geometry, add flex centering, border-radius 50%, border, transitions, `:active` scale
3. `.rec-play-btn.play-btn-concert` — keep dashed border, adjust to 1.5px
4. `.rec-play-btn.play-btn-direct` — keep solid border, adjust to 1.5px

After editing the template, run `bani-render` and confirm visually.
