# ADR-161: Bold Toggle-State Buttons & Upward-Opening Surfaces

**Status**: Proposed
**Date**: 2026-06-12
**Agents**: graph-architect → carnatic-coder → test-engineer
**Depends on**: ADR-159 (the bar layout these buttons live in). **Related**: ADR-051 (mobile player chips), ADR-158 (the video surface owns tap-seek — these chrome buttons must stay outside that surface).

---

## Context (forces in tension)

The header button group (`buildPlayerBar`, `media_player.js:488–531`) is a row of small icon buttons: copy, share, watch-on-YouTube, tracklist-toggle (`≡`), close. Two problems:

- **The buttons are small, faint, and stateless.** They are tuned for a desktop pointer, not a thumb. The tracklist toggle is the only stateful one and its "open" state (`.mp-tracklist-open`, `base.html:2641–2642`) is a barely-perceptible tint. A user cannot tell at a glance whether the tracklist is currently showing; a toggle that doesn't *look* toggled is a toggle the user re-presses to check.
- **The tracklist opens downward, over the video.** `.mp-tracklist { top: 30px }` (`base.html:2646–2648`) overlays the list *below the bar and on top of the video frame* — so consulting the tracklist hides the very thing you are watching. This is backwards: the list is a navigation aid for the video, and it occludes the video to do its job.

This ADR is the chrome counterpart to ADR-159's content work: once the bar carries live chips, the *controls* on that bar must be equally legible and mobile-honest, and the surfaces they open must not fight the video.

## Pattern

**Boundaries that declare their state.** A control that opens something is a boundary between two states (open/closed); it must *show* which side it is on. And a surface summoned by a control should open into empty space, not over the content it serves. Both are the same principle: chrome should clarify, never occlude.

## Decision

### 1. Bigger, bolder, mobile-honest buttons

- Minimum touch target **44×44 px** (WCAG 2.5.5 / Apple HIG) for every bar button, on touch viewports; desktop may render tighter but never below comfortable. Use padding to grow the hit area without bloating the icon.
- Higher-contrast icon strokes/fills against the bar; clear hover/active/focus states (keyboard focus ring included — these are real `<button>`s already).
- Consistent sizing across copy / share / yt / tracklist / close so the group reads as one control cluster.

### 2. Stateful buttons declare pressedness

Any button that toggles a surface (tracklist now; the queue panel in ADR-162; a future playlist drawer) is a **toggle button** with explicit, unmistakable state:
- `aria-pressed="true|false"` on the button (accessibility + semantics).
- A *strong* depressed visual when active — inset/filled treatment, not a faint tint — clearly distinct from the resting state. The current `.mp-tracklist-open` tint is upgraded to this.
- Returning to closed visibly "pops back out."

This is a reusable `.mp-toggle-btn[aria-pressed]` style, so ADR-162's queue toggle and any later drawer inherit identical state semantics rather than each inventing its own.

### 3. Surfaces open upward, never over the video

The tracklist (and ADR-162's queue panel, and any bar-summoned drawer) re-anchors to open **above the bar**, growing upward into empty space, so the video is never occluded. Concretely:
- Replace `top: 30px` (below-bar overlay on the video) with a bottom-anchored panel that expands upward from the bar (`bottom: 100%` relative to the bar, or equivalent), or pushes the player's own top edge up.
- The video frame stays fully visible while the list is open. On a floating desktop window this means the panel extends above the window's current top; on mobile it expands the strip upward from the bar.
- Scroll, max-height, and the existing scrollbar styling (`base.html:3031–3078`) are preserved; only the anchor direction changes.

### 4. Scope boundary with ADR-158

These are **chrome** buttons on the bar — they live *outside* the video surface, so they never collide with ADR-158's tap-zone/double-tap-seek gestures (which own the video frame only). This ADR touches the bar's controls and the surfaces they summon; it does not touch in-video gestures.

## Consequences

**Positive**
- Controls become thumb-usable and self-explanatory; a glance tells you whether the tracklist/queue is open.
- The video is never hidden by its own navigation aid — consulting the tracklist no longer means losing the picture.
- One reusable toggle-button primitive (`aria-pressed` + depressed style) that ADR-162's queue and any future drawer reuse, preventing per-surface drift.

**Negative / costs**
- Upward-opening surfaces can collide with the top of the viewport for a player already near the top edge; the Coder needs a clamp/flip fallback (open downward only if there is genuinely no room above, and then still not over the video where avoidable).
- Larger touch targets consume bar width already contested by the ADR-159 chip rail; §1 sizing and ADR-159 §5 overflow must be tuned together.

## Implementation (for Coder, after acceptance)

1. Introduce `.mp-toggle-btn[aria-pressed]` with resting + strongly-depressed states; apply to the tracklist toggle; set `aria-pressed` in the toggle handler (`media_player.js:1110–1123`) instead of the weak `.mp-tracklist-open` tint.
2. Grow all bar buttons to ≥44px touch targets on touch viewports; unify sizing/contrast/focus.
3. Re-anchor `.mp-tracklist` to open **upward** (replace `top:30px`; anchor to `bottom:100%` of the bar or push the window top up); keep max-height/scroll/scrollbar styling. Add a clamp so it never opens off the top of the viewport (flip only as a last resort).
4. Verify the chip rail (ADR-159 §5) and the enlarged buttons coexist without crowding.
5. Run `.venv/bin/bani-render`.
6. **Test Engineer**: toggle button reflects `aria-pressed` and the depressed visual matches state; tracklist opens above the bar with the video fully visible; near-top-of-viewport players clamp/flip correctly; touch targets meet 44px; keyboard focus and `aria-pressed` are announced.

**Branch**: `adr/161-toggle-buttons-upward-surfaces` → PR.

---
[ADR: ADR-161, ADR-159, ADR-051, ADR-158]
[AGENTS: graph-architect]
