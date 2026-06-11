# AUDIT-016: Playlist Panel Overlay Layout

**Status**: Findings ready — routing to Carnatic Coder for implementation
**Date**: 2026-06-11
**Auditor**: Code Auditor

---

## Scope

The playlist tracklist panel that appears when the hamburger (≡) button is clicked, on both desktop and mobile paths. The goal is to make the panel open as a floating overlay **above** the player rather than displacing the video or shrinking the available viewport.

---

## Problem Statement

### Desktop

The `.mp-tracklist` element lives inside the `.media-player` flex column. When it becomes visible (`display: block`), it occupies space in the normal document flow, pushing the player's bottom edge (and everything below) downward. The video height is not affected but the player footprint grows, displacing adjacent page content.

**Desired behaviour**: the playlist panel floats above the player as an overlay — `position: absolute; bottom: 100%` — without altering the player's height or displacing any surrounding content.

### Mobile

On mobile the `.media-player.full-mobile` is a `flex-direction: column` container with fixed height `calc(50vh - 56px)`. The tracklist gains `flex: 1` when `.mp-tracklist-open` is applied, causing it and `.mp-video-wrap` to split the available height — the video visibly shrinks to a sliver.

**Desired behaviour**: same as desktop — the playlist panel floats above the player (above the bottom sheet), without touching the video area.

---

## Findings

### F1 — Desktop tracklist is in-flow, not overlaid

**File**: `carnatic/graph.html`
**Lines**: ~2770–2800 (`.mp-tracklist` CSS block)

```css
/* CURRENT */
.mp-tracklist {
  max-height: 180px;
  overflow-y: auto;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-strong);
}
```

The element is a normal block child of the player's flex column. There is no `position: absolute` or `bottom: 100%` — it sits below the video in the flow. When it appears, the player box grows taller.

**Pattern**: Layout-via-flow instead of layout-via-overlay.

---

### F2 — Desktop toggle uses inline `display` style — fine as-is, but the containing block is wrong

**File**: `carnatic/render/templates/media_player.js`
**Lines**: 987–998

```javascript
const isOpen = instance.tracklistEl.style.display !== 'none';
instance.tracklistEl.style.display = isOpen ? 'none' : 'block';
```

The toggle logic itself is clean. The problem is that `.mp-tracklist` is a sibling of `.mp-video-wrap` inside the player flex column. Moving it to an overlay requires that the **containing player element** has `position: relative` (it already does, as a floating `position: absolute` window — verify) so that `position: absolute` on the tracklist is anchored to the player, not the viewport.

No JS change is needed for the overlay fix — only CSS.

---

### F3 — Mobile tracklist uses `flex: 1` which splits height with the video

**File**: `carnatic/graph.html`
**Lines**: ~4084–4090

```css
/* CURRENT */
.media-player.full-mobile .mp-tracklist { display: none; overflow-y: auto; }
.media-player.full-mobile .mp-tracklist.mp-tracklist-open {
  display: block;
  flex: 1;       /* ← this causes video to shrink */
}
```

When `.mp-tracklist-open` is added, the tracklist participates in the flex layout alongside `.mp-video-wrap` (which also has `flex: 1`). The two children split the container's `50vh` — the video shrinks to accommodate the playlist.

**Pattern**: Sibling flex children competing for fixed height instead of overlay.

---

### F4 — Mobile player container needs `position: relative` confirmed

**File**: `carnatic/graph.html`
**Lines**: ~4033–4060 (`.media-player.full-mobile` ruleset)

The full-mobile player uses `position: fixed` and is docked at the bottom of the viewport. Overlaying the tracklist *above* the player bottom-sheet requires `position: absolute; bottom: 100%` on the tracklist — this anchors it relative to the **nearest positioned ancestor**, which for a `position: fixed` element is the player itself. This works as intended: the tracklist will appear above the rounded top edge of the bottom-sheet.

No structural JS change needed, but the CSS containment must be verified (the panel must not bleed outside the player's visual boundary on narrow screens).

---

### F5 — Tracklist max-height cap (180px) is too small for concerts with many segments

**File**: `carnatic/graph.html`
**Line**: ~2787

```css
max-height: 180px;
```

This is only large enough for ~5–6 tracks. Concerts routinely have 8–15 segments. The overlay approach gives us room to increase this. Suggested: `max-height: min(320px, 60vh)` — generous on desktop, safe on small viewports.

**Pattern**: Arbitrary pixel cap that was set when the panel was in-flow (minimising disruption) — no longer relevant once the panel is an overlay.

---

## Recommendations

### R1 — Make the desktop tracklist an absolute overlay above the player

In `graph.html`, replace the desktop `.mp-tracklist` layout rules with:

```css
/* NEW */
.mp-tracklist {
  position: absolute;
  bottom: 100%;           /* floats above the player's top edge */
  left: 0;
  right: 0;
  z-index: 10;            /* above player contents, below modal overlays */
  max-height: min(320px, 60vh);
  overflow-y: auto;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-bottom: none;    /* butts flush against the player top edge */
  border-radius: 6px 6px 0 0;
}
```

The desktop `.media-player` is already `position: absolute` (a floating window) so it forms the containing block. No JS changes needed for desktop.

---

### R2 — Make the mobile tracklist an absolute overlay above the bottom sheet

In `graph.html`, replace the mobile `.mp-tracklist` rules with:

```css
/* NEW */
.media-player.full-mobile .mp-tracklist {
  display: none;
  position: absolute;
  bottom: 100%;           /* floats above the rounded top edge of the bottom sheet */
  left: 0;
  right: 0;
  z-index: 10;
  max-height: min(280px, 40vh);
  overflow-y: auto;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
}
.media-player.full-mobile .mp-tracklist.mp-tracklist-open {
  display: block;
  /* NO flex: 1 — overlay, not a flex child */
}
.media-player.full-mobile .mp-tracklist:empty { display: none !important; }
```

The `.media-player.full-mobile` uses `position: fixed` which forms a containing block for `position: absolute` children. The video is untouched.

---

### R3 — Remove the in-flow border-bottom from the tracklist

**File**: `graph.html`, current `.mp-tracklist` rule

The `border-bottom: 1px solid var(--border-strong)` was a divider between the tracklist and the controls below. With the overlay approach the tracklist sits above the player, so this divider is no longer meaningful. Use `border-radius` on the top edge instead (see R1/R2).

---

## Routing

| Finding | Recommended action | Routed to |
|---|---|---|
| F1, F3 | Replace `.mp-tracklist` CSS with `position: absolute; bottom: 100%` layout (R1, R2) | Carnatic Coder |
| F2 | No JS change needed — toggle logic is correct | — |
| F4 | Verify `position: fixed` containing-block behaviour on mobile after R2 | Carnatic Coder |
| F5 | Increase `max-height` to `min(320px, 60vh)` | Carnatic Coder |

---

## Files to Change

| File | Lines affected | Change |
|---|---|---|
| `carnatic/graph.html` | ~2770–2800 (`.mp-tracklist`) | Replace in-flow layout with `position: absolute; bottom: 100%` overlay |
| `carnatic/graph.html` | ~4084–4090 (`.media-player.full-mobile .mp-tracklist`) | Same overlay approach; remove `flex: 1` |
| `carnatic/render/templates/media_player.js` | 987–998 (desktop toggle) | No change required |
| `carnatic/render/templates/media_player.js` | 3244–3264 (mobile toggle) | No change required |

No data files, ADRs, or render pipeline changes are needed. This is a pure CSS fix.

---

## Open Questions

- Should the overlay close when the user clicks outside it (a "light-dismiss" behaviour)? Currently it only closes via the burger button. This is out of scope for this fix but worth noting as a follow-up.
- On desktop, should multiple players be able to show their tracklists simultaneously? Currently yes — each player's tracklist is scoped to its own `.media-player` containing block, so the overlay approach does not break this.
