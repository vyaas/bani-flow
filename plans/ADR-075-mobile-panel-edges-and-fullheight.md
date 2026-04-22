# ADR-075: Mobile Panel Edges — Rounded Top, Full Height, Hard Bottom Stop

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect
**Depends on**: ADR-034 (mobile drawer layout), ADR-039 (right-sidebar drawer), ADR-042 (tab-bar offsets), ADR-062 (desktop grid)
**Related**: ADR-038 (Trail tab as mobile entry point), ADR-051 (full-mobile player)

---

## Context

### What the user sees on mobile today

[`base.html`](../carnatic/render/templates/base.html) (`@media (max-width: 768px)` block, around lines 2233–2284) positions both side panels as:

```css
#left-sidebar, #right-sidebar {
  position: fixed;
  top:    var(--header-h, 52px);                     /* sits BELOW the header */
  bottom: calc(56px + env(safe-area-inset-bottom));  /* sits ABOVE the tab bar */
  width:  min(85vw, 320px);
  border-radius: 0;                                   /* sharp top + bottom */
  /* no border-bottom; content fades into tab-bar boundary */
}
```

This produces three visible problems on a phone (cf. screenshot, Ramnad Krishnan musician panel, 16:27):

1. **Sharp top corners**. The panel meets the header along a hard 90° edge. The visual language elsewhere in the app — chips, popovers, the full-mobile player (`border-radius: 16px 16px 0 0`) — uses gentle radii. The panel feels architecturally inconsistent with the rest of the touch surface.

2. **Wasted vertical real estate**. On a ~720 px tall mobile viewport, the panel gets ≈ 720 − 52 (header) − 56 (tab bar) − safe-area = ~600 px of usable height. The header bar carries **no controls the user needs while filtering / browsing within a panel** — search, filters, view selector are all suppressed on mobile (`header h1 { display: none; }`, `.stats { display: none }`, `#sruti-strip { display: none; }`). Surrendering 52 px to a near-empty header is a tax with no return.

3. **The bottom edge is ambiguous**. The panel's scroll container ends at `bottom: calc(56px + safe-area)` — but with no `border-bottom`, no shadow, no rounding, and the same `var(--bg-panel)` colour as the surrounding chrome, **the user cannot tell whether content is being clipped or scrolling behind the tab bar**. The tab bar (z-index 210) genuinely sits *above* the panel (z-index 200), so the user's instinct ("text is hiding behind those buttons") is half-correct — geometrically clipped, perceptually bleeding.

### What "flush" means here

The user's wording — "the bottom edge of the panels must be clearly visible and must sit flush against the bottom buttons" — sets two requirements at once:

- **Flush**: no visible gap between the panel's bottom edge and the top edge of the tab bar. Today this is already true geometrically (panel ends at exactly the tab-bar's top), but **visually** it reads as bleed because nothing terminates the panel.
- **Clearly visible**: the termination must be a hard, named edge — a border the eye can latch onto — so that the user understands "the panel stops here; the tab bar starts there; nothing is behind it."

These are two design forces resolved by the same instrument: a **visible terminating border** on the panel's bottom that abuts the tab bar's top.

---

## Forces

| Force | Direction |
|---|---|
| **Mobile real estate is precious** | Reclaim the 52 px of header for panel content during active panel use. The header carries nothing the user needs while inside a panel. |
| **The user can always exit** | Tab bar (`#mobile-tab-bar`, z-index 210) remains visible and tappable at all times. A second tap on the active panel's tab closes the drawer. The header reappears the moment the panel closes. This is reversible. |
| **Visual termination > geometric termination** | The panel must *look* like it stops, not just stop. Borders, radii, and shadow do this work. |
| **Symmetry across panels** | Both `#left-sidebar` (Bani Flow) and `#right-sidebar` (Musician) must behave identically. Asymmetry would punish the user for choosing one panel over the other. |
| **Don't break the full-mobile player** | When the player expands to `full-mobile`, it sits at `bottom: calc(56px + safe-area)` with `height: calc(50vh - 56px)`. The player has its own rounded-top edge (`16px 16px 0 0`). Panels and player are mutually exclusive surfaces (opening one collapses the other per [`mobile.js:71-76`](../carnatic/render/templates/mobile.js)), so they don't need to coexist visually — but the panel's full-height behaviour must not break the rule that the tab bar always wins z-index. |
| **Safe-area top** | iPhones with notches need `env(safe-area-inset-top, 0px)` honoured at the new `top: 0` boundary, otherwise the panel header tucks under the notch. |
| **Tokens, not magic numbers** | The corner radius must use an existing radius token (or extend [`theme.py`](../carnatic/render/theme.py) `radius` family if needed). Border colour uses `var(--border-strong)`. |
| **Desktop is unaffected** | All changes live inside the `@media (max-width: 768px)` block. The desktop grid layout (ADR-062) sees no changes. |

---

## Pattern

**Strong Centre at the panel scale**: a panel is a focussed reading surface. Its boundaries should be unambiguous — top rounded into the dark canvas, bottom hard-terminated against the navigation bar. A bounded, well-formed centre invites sustained attention; an undefined edge invites confusion.

**Levels of Scale (corner radius)**: chips ≈ 4 px, panel ≈ 14 px, full-mobile player = 16 px. The panel's rounded top reads as "one scale up from a chip, one scale below the most prominent overlay (the player)" — a natural place in the visual hierarchy.

**Reversible coverage** (Alexander, *Pattern 130 — Entrance Room*): when a surface temporarily occludes a higher-level surface (the header here), the path back must be obvious. The tab bar staying on top, with the active panel's tab visibly active, is the entrance back out.

---

## Decision

### 1. Panels span full height on mobile

Inside `@media (max-width: 768px)`, change both sidebars:

```css
#left-sidebar, #right-sidebar {
  /* was: top: var(--header-h, 52px); */
  top: env(safe-area-inset-top, 0px);
  z-index: 220;                  /* was 200 — must rise above header (z-index ~100) */
  /* bottom unchanged: stops above the tab bar */
}
```

The panel now spans from the top safe-area inset down to the tab bar. The header (`<header>`) is still in the DOM, still painted, but the panel covers it. The tab bar (`z-index: 210`) remains uncovered because the panel does not extend below `bottom`.

**Why z-index 220, not 215?** The desktop drawer handles use 201 ([`base.html:2080`](../carnatic/render/templates/base.html)); the player on mobile uses 205. Bumping the panel above the header (which is in normal flow at z-index ≈ auto) requires only a small lift, but jumping past the tab bar is forbidden — the tab bar's 210 must remain on top. 220 is comfortably above the header and any drawer scrim (199), and below the tab bar's 210 if we re-rank: **the tab bar must be raised to 230** to preserve the invariant "tab bar is always on top." Update both:

```css
#mobile-tab-bar { z-index: 230; }   /* was 210 */
#left-sidebar, #right-sidebar { z-index: 220; }   /* was 200 */
```

The drawer scrim stays at 199 (below the panel) and the mobile player stays at 205 (already below 220, so panels cover the player just like the user expects when they swipe a panel open over a mini strip — and the existing `_collapseMobilePlayer()` call in [`mobile.js:71-76`](../carnatic/render/templates/mobile.js) collapses the full player anyway).

### 2. Rounded top corners

```css
#left-sidebar, #right-sidebar {
  border-radius: 14px 14px 0 0;
}
```

`14px` is chosen to sit one step below the full-mobile player's `16px` (which is the dominant overlay). It reads as visibly rounded against the dark canvas (`var(--bg-deep)`) without becoming bubble-like.

The dark canvas behind the panel — exposed through the rounded corner — provides the visual frame that says "this surface floats above another." No additional shadow needed; the existing `box-shadow: 4px 0 16px rgba(0,0,0,0.3)` (left) and `-4px 0 16px rgba(0,0,0,0.3)` (right) already cast outward.

### 3. Hard bottom termination

```css
#left-sidebar, #right-sidebar {
  border-bottom: 2px solid var(--border-strong);
}
```

Two pixels of `--border-strong` against the tab bar's top edge gives the eye a clear "the panel ends here" line. Combined with the tab bar's own top-edge styling (it already has its own border / shadow against the canvas), the seam reads as two distinct, abutting surfaces — not as one continuous strip with text fading away.

To prevent scrolled content from visually crowding the bottom border, also add:

```css
#left-sidebar, #right-sidebar {
  scroll-padding-bottom: 8px;   /* keyboard-driven scroll lands slightly above edge */
}
#left-sidebar > *:last-child,
#right-sidebar > *:last-child {
  margin-bottom: 8px;            /* breathing room before the hard stop */
}
```

### 4. Honour notches and lift body chrome

When the panel opens on mobile, it covers the header — but the search input *inside* the panel must not tuck under an iPhone notch. The panel's existing internal padding starts at the panel's `top` boundary. Since `top` is now `env(safe-area-inset-top, 0px)`, devices with notches will offset the panel correctly; devices without notches see the panel start at `y=0`.

No JS changes are required for the cover-header behaviour: drawer open/close already toggles `.drawer-open`, which transforms `translateX`. Because the panel's own positioning shifts to `top: 0`, the header simply sits behind it when the drawer is open, and re-appears when `translateX(-100%)` (or `translateX(100%)` for right) hides the panel.

### 5. Mini-player coexistence

The existing `body.mobile-mini-player` rule lifts panels by 56 px:

```css
body.mobile-mini-player #left-sidebar,
body.mobile-mini-player #right-sidebar {
  bottom: calc(112px + env(safe-area-inset-bottom, 0px));
}
```

This rule is preserved exactly as-is. The new `top: env(safe-area-inset-top, 0px)` does not interact with it.

---

## Consequences

### Positive

- **More content per scroll** on mobile — ≈52 px per panel reclaimed for entries (one extra recording row visible without scrolling, on a typical 720 px viewport).
- **Unambiguous panel edges**: the rounded top reads as "this surface floats over the canvas"; the hard bottom border reads as "this surface ends here, the tab bar begins there."
- **Visual coherence with the full-mobile player**: same rounded-top idiom, one step below in radius scale.
- **The tab bar remains the constant anchor**: it stays on top of every other surface, always tappable, always the way out.

### Negative / Trade-offs

- **The header is occluded during active panel use.** Search-from-header, filter chips, view selector are all unreachable until the panel closes. *Mitigation*: on mobile these are already de-prioritised (filter bar collapses, view selector compacts). The trade — full-height search inside the panel vs. always-visible page chrome — favours the panel for the use case the user explicitly named: "we want to maximize real estate for a given search."
- **Two z-index values change** (`#mobile-tab-bar` and the two sidebars). Anything else that previously assumed the panel was at z-index 200 must be checked. The known overlapping surfaces — drawer scrims (199), mini player (205), full-mobile player (205), desktop drawer handles (201, irrelevant on mobile) — remain correctly ordered after the lift.
- **The rounded top corners introduce a small dark wedge** at top-left (left panel) and top-right (right panel) when the drawer is open. This is the intended "floating above canvas" affordance, but on very narrow viewports (≤320 px) where the panel is `min(85vw, 320px)`, the visible canvas strip on the *opposite* side becomes the user's tap-out target. This is already the case today (scrim catches taps); the rounded corner just makes the layered nature more obvious.

### Out of scope

- **Closing on tap-outside-panel** is unchanged; the existing scrim handles it.
- **Animation of the corner radius on open/close** — defer; the existing 250 ms `translateX` transition is already smooth and doesn't need radius animation.
- **Desktop changes** — none. The grid layout in ADR-062 is untouched.
- **Panel header / sticky search bar** — the search input sits at the top of the panel content. Whether to make it `position: sticky` so it stays visible during scroll is a separate concern; this ADR only addresses the panel container's edges and height.

---

## Implementation

**Carnatic Coder owns** all changes in [`carnatic/render/templates/base.html`](../carnatic/render/templates/base.html), inside the existing `@media (max-width: 768px)` block(s):

1. **Panels span full height** — change `top:` from `var(--header-h, 52px)` to `env(safe-area-inset-top, 0px)` for both `#left-sidebar` and `#right-sidebar`.
2. **Z-index lift** — set `#left-sidebar` and `#right-sidebar` to `z-index: 220`. Set `#mobile-tab-bar` to `z-index: 230`.
3. **Rounded top corners** — add `border-radius: 14px 14px 0 0` to both panels (mobile only).
4. **Hard bottom termination** — add `border-bottom: 2px solid var(--border-strong)` to both panels (mobile only).
5. **Bottom breathing room** — add `scroll-padding-bottom: 8px` on the panel and `margin-bottom: 8px` on the last-child inside each panel (mobile only).

**Verification** (on a real phone or Chrome DevTools mobile emulation at ≤768 px):

1. Open Bani Flow panel from the tab bar. Confirm:
   - Panel covers the header bar entirely.
   - Top-left corner is visibly rounded (~14 px) showing the dark canvas behind.
   - Bottom edge has a clear horizontal border immediately above the tab bar.
   - Scrolling the panel: the last entry stops cleanly at the bottom border with a small gap; nothing fades or clips behind the tab bar.
2. Repeat for Musician panel — symmetry across both sides.
3. Tap the active panel's tab again — drawer closes, header reappears.
4. With a track playing in the mini player: open a panel — confirm panel sits above the mini player (player remains tappable below the panel's bottom border + tab bar stack), and the panel's `bottom` is correctly raised by the existing `body.mobile-mini-player` rule.
5. On desktop (≥769 px), confirm the grid layout is completely unchanged.

**No data changes. No JS changes. No render-pipeline changes.** This is a pure CSS edit inside the existing mobile media-query block.
