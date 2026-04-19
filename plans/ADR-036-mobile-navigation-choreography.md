# ADR-036: Mobile Navigation Choreography — Panel States, Dismiss Affordances, and Exploration Flow

**Status:** Proposed
**Date:** 2026-04-18
**Supersedes:** Portions of ADR-034 §Bottom sheet, §Left drawer (refines their state
transitions; does not revoke their CSS layout decisions)

---

## Context

ADR-032 laid out a four-phase mobile strategy. Phase 0 (touch targets) and Phase 1
(responsive layout — left drawer, bottom sheet) have been implemented in `base.html`.
Real-device testing on a 390px Android viewport reveals **five navigation failures**
that the existing ADRs did not anticipate because they were designed before
on-device screenshots existed.

### Failure 1 — View selector competes with canvas

The header at ≤768px is a flex row:

```
[☰] [CARNATIC MUSIC EXPLORER] [Guru-Shishya | Mela-Janya]
```

The view selector buttons (`min-height: 44px; padding: 0 14px`) plus the title consume
nearly the full 390px width. This is functional but creates a problem downstream: the
view-selector's `inline-flex` container does not wrap, so on screens narrower than
~370px the buttons overflow. More critically, the two-word labels ("Guru-Shishya",
"Mela-Janya") consume horizontal space that could be reclaimed for the title or
eliminated entirely by using compact abbreviations or icons.

On first load (screenshot), the Guru-Shishya and Mela-Janya toggle bar is visually
dominant — its highlighted-tab styling draws the eye to the header right, away from
the graph content. For a rasika who opened the app to explore, the first impression
is "which tab am I in?" rather than "here is the lineage graph."

### Failure 2 — Era and instrument filter chips are blocked and unexplorable

Phase 0 implemented horizontal scrolling for the filter bar (`overflow-x: auto;
flex-wrap: nowrap`). On-device, this is technically working — the chips scroll — but
there is **no visual affordance** that more chips exist off-screen. The rightmost
visible chip is cut off mid-label with no fade, no scroll indicator, and no "more"
badge. The user sees "Living Pillars", "Contemporary", "|", "Vocal", and a partial
clip of the next chip. There is no reason to believe swiping will reveal more.

The filter bar is also trapped between the header and the canvas. On a 390px × 844px
viewport, the header (~56px) + filter bar (~52px) + bottom sheet peek (72px) leave
only ~664px for the canvas. These 52px of filter bar real estate are not earning their
vertical space if the user never discovers the scrollable chips.

### Failure 3 — Musician tab (bottom sheet) is totally occluded

ADR-034 defined three bottom sheet states: dismissed (`translateY(100%)`), peek
(`translateY(calc(100% - 72px))`), and expanded (`translateY(0)`). On-device, the
"peek" state shows a 72px strip at the very bottom of the screen. This strip contains
the sheet handle pill (4px × 36px, centered) and the panel title ("MUSICIAN ♫").

The problem: **72px at the bottom edge of a phone screen is invisible territory.**
It sits below the user's thumb rest position, below the browser's navigation bar, and
on many Android devices, behind the gesture pill. The user never notices it exists.
Even if they do, the 4px handle pill is not a recognizable interactive element — it
looks decorative. The "MUSICIAN ♫" text alone does not communicate "swipe up to see
recordings."

In the Mela-Janya view (screenshot 2), the bottom sheet peek is barely visible. The
user sees a vast dark canvas and a tiny "MUSICIAN ♫" label at the absolute bottom
edge. The information hierarchy says: "nothing is selected; there is nothing to do
here."

### Failure 4 — Left drawer (Bani Flow) has no dismiss affordance

The left drawer opens via the ☰ hamburger button. Once open, it overlays ~85% of the
canvas. ADR-034 specifies that the drawer closes via:
- Tap on the scrim (the dark overlay behind the drawer)
- Swipe the drawer to the left

On-device, neither affordance is discoverable:
- The **scrim** is `rgba(0,0,0,0.4)` — a 40% black overlay. On a dark-themed app with
  a `var(--bg-deep)` canvas, the scrim is nearly invisible. The user perceives the
  drawer as having "replaced" the canvas, not as "overlaying" it.
- **Swipe to close** is a learned gesture, not a visible one. There is no ✕ button,
  no "close" label, no visible drag handle on the drawer's right edge.

Screenshot 3 shows the result: the Bani Flow panel is open with recordings visible,
a video is playing at the bottom, and the user has no visible path to dismiss the
drawer and return to the canvas. The only escape is the ☰ button (which toggles the
drawer), but that button is **behind the drawer** on many viewport widths because the
drawer is `min(85vw, 320px)` wide and the ☰ is at `left: 10px`.

### Failure 5 — Video player competes with everything

The media player (`.media-player`) is `position: fixed; bottom: 8px; left: 50%;
width: min(90vw, 400px)`. When the bottom sheet is in peek state, the player lifts to
`bottom: 80px`. When expanded, `bottom: calc(50vh + 8px)`.

On-device (screenshot 3), the video is partially visible at the bottom of the screen,
overlapping with the Bani Flow trail content. The player has a title bar and a ✕ close
button, but neither is fully visible — the YouTube iframe consumes most of the player's
height, and the controls are clipped by the viewport bottom edge.

The fundamental problem: **the media player is a free-floating overlay that nobody
coordinated into the panel state machine.** It doesn't know which panels are open,
doesn't respond to drawer state, and doesn't have a "minimized" mode that coexists
gracefully with the bottom sheet.

---

## Forces in tension

| Force | Direction |
|---|---|
| **Immersion** | The rasika at a concert taps a musician → sees recordings → taps play → hears the music. Every extra tap, every occluded panel, every mystery gesture breaks that three-tap flow. |
| **Exploration flow** | The user must be *led* from one context to the next: Bani trail → musician → recording → back to trail. Panels are not independent screens — they are stops on a journey. Dismissing one must naturally surface the next. |
| **Minimal chrome** | On a 390px screen, every pixel of persistent UI (header, filter bar, sheet peek) is a tax on the canvas. Chrome must justify its existence by being either essential navigation or actively informative. |
| **Discoverability** | Every interactive element must have a visible affordance. Invisible gestures (scrim tap, swipe to close) can be *shortcuts*, never *the only path*. |
| **Zero desktop regression** | All changes are additive, gated behind `@media (max-width: 768px)` or `matchMedia('(pointer: coarse)')`. |

---

## Pattern

**Choreographed transitions** (Material Design 3, "Coordinated motion"): when one panel
opens, other panels respond — they dismiss, resize, or relocate in a coordinated
animation. The user sees a single fluid motion, not independent elements fighting for
space.

**Navigation Rail → Bottom Navigation** (Material Design 3, "Navigation bar"): on
compact screens, primary view switching moves from the header to a bottom navigation
bar or a compact toggle. This frees the header for the page title and controls that
relate to the current view, not to view selection.

**Entry and exit points** (Norman, *The Design of Everyday Things*, ch. 4): every panel
that can be opened must have a visible affordance for closing it, located in the same
spatial region as the panel's content. Don't make the user hunt for the exit.

---

## Decision

### 1. Compact view selector: abbreviate or iconify at mobile breakpoint

**Problem:** "Guru-Shishya" (12 chars) and "Mela-Janya" (10 chars) are long labels
for a 390px header.

**Solution:** At ≤768px, abbreviate to **GS** and **MJ** with `aria-label` providing
the full names for accessibility. The button styling gains a tooltip-style full label
on tap-and-hold (CSS `::after` tooltip, not blocking).

```
Before (mobile header, ~300px used):
[☰] [CARNATIC MUSIC EXPLORER] [Guru-Shishya | Mela-Janya]

After (mobile header, ~200px used):
[☰] [CARNATIC MUSIC EXPLORER]             [GS | MJ]
```

CSS:
```css
@media (max-width: 768px) {
  .view-btn .view-label-full  { display: none; }
  .view-btn .view-label-short { display: inline; }
}
@media (min-width: 769px) {
  .view-btn .view-label-short { display: none; }
}
```

HTML:
```html
<button class="view-btn active" id="view-btn-graph" ...>
  <span class="view-label-full">Guru-Shishya</span>
  <span class="view-label-short">GS</span>
</button>
<button class="view-btn" id="view-btn-raga" ...>
  <span class="view-label-full">Mela-Janya</span>
  <span class="view-label-short">MJ</span>
</button>
```

This reclaims ~100px of header width for the title and avoids the "which tab am I in?"
visual dominance.

---

### 2. Filter bar: collapsible with a "funnel" toggle

**Problem:** The filter bar consumes 52px of vertical space permanently, even when the
user is not filtering. Horizontal scroll is invisible.

**Solution:** At ≤768px, the filter bar collapses to a single row toggle:

```
Collapsed (default):
[🔽 Filters (2 active)]           ← single 44px row; shows active count

Expanded (tap to toggle):
[🔼 Filters (2 active)]
[● Living Pillars] [● Contemporary] [● Modern] | [○ Vocal] [○ Veena] ...
```

The collapsed state is a 44px button that shows "Filters" plus a badge indicating
how many filters are active. Tapping it slides the full chip bar down (CSS
`max-height` transition). The chips remain horizontally scrollable when expanded.

This saves 52px of vertical space when filters are not in use — space that goes
directly to the canvas.

**Scroll affordance:** When the chip bar is expanded and overflows horizontally, a
subtle gradient fade (`linear-gradient(to right, transparent 90%, var(--bg-panel))`)
at the right edge signals that more chips exist. This replaces the current hard clip.

---

### 3. Bottom sheet: active peek with contextual prompt

**Problem:** The 72px peek is invisible at the bottom edge.

**Solution A — Higher peek with contextual label:**

Increase peek height from 72px to **100px** and include a contextual prompt that
reflects the current state:

| Graph state | Peek label |
|---|---|
| No node selected | "Tap a musician to explore ↑" |
| Node selected | "**Vina Dhanammal** — 4 recordings ↑" |
| Edge selected | "**Semmangudi → SSI** — guru–shishya ↑" |

The ↑ arrow and bold musician name communicate "there is content here; swipe up."
The 100px height clears the Android gesture pill on most devices.

**Solution B — Tab bar at bottom (coordinated with bottom sheet):**

Replace the peek strip with a persistent **bottom tab bar** (56px) that switches
between two tabs:

```
┌───────────────────────────────────────┐
│  [♫ Musician]        [☰ Trail]        │  ← 56px bottom tab bar
└───────────────────────────────────────┘
```

- **♫ Musician** tab: Opens the bottom sheet with musician info + recordings (current
  right sidebar content).
- **☰ Trail** tab: Opens the left drawer (Bani Flow trail + search).

Tapping the active tab dismisses its panel (toggle behaviour). This eliminates the
hamburger button problem (Failure 4) and the occluded peek problem (Failure 3) in one
move: both panels are accessible from a single persistent bottom bar.

The bottom tab bar is always visible (56px). The bottom sheet slides up *above* the
tab bar when active. The left drawer slides in from the left as before, but the ☰ Trail
tab is its primary trigger instead of the hamburger button.

**Recommendation:** Solution B is preferred. It follows the established mobile pattern
(YouTube Music, Spotify, most Material apps) where a bottom bar is the primary
navigation surface. It solves Failures 3 and 4 simultaneously. The hamburger button
can remain in the header as a secondary trigger, but the bottom tab bar is the primary
affordance.

---

### 4. Left drawer: visible close button + enhanced scrim

**Problem:** No visible way to close the left drawer.

**Solution (if Solution 3A is chosen):**

Add a visible ✕ button inside the drawer, top-right corner:

```html
<button id="drawer-close-btn" aria-label="Close drawer">&times;</button>
```

```css
@media (max-width: 768px) {
  #drawer-close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 201;
    min-width: 44px;
    min-height: 44px;
    font-size: 1.4rem;
    background: none;
    border: 1px solid var(--border-strong);
    color: var(--fg-sub);
    border-radius: 50%;
  }
}
@media (min-width: 769px) {
  #drawer-close-btn { display: none; }
}
```

Additionally, increase scrim opacity from `rgba(0,0,0,0.4)` to `rgba(0,0,0,0.55)` to
make it more visually distinct from the dark canvas background.

**Solution (if Solution 3B is chosen):**

The left drawer's primary trigger is the ☰ Trail bottom tab. The tab toggles the
drawer: tap to open, tap again to close. The ✕ button is still added as a secondary
close affordance inside the drawer. The scrim is still enhanced.

---

### 5. Panel state machine: mutual exclusion and coordinated transitions

**Problem:** Panels compete for attention and space without coordination.

**Solution:** Define a panel state machine with mutual exclusion rules:

```
States:
  IDLE        — no panels open; canvas at full size
  TRAIL       — left drawer open; bottom sheet dismissed
  MUSICIAN    — bottom sheet expanded; left drawer closed
  PEEK        — bottom sheet in peek state; left drawer closed
  PLAYING     — media player visible; may coexist with PEEK or IDLE

Transitions:
  IDLE → PEEK         : user taps a node
  PEEK → MUSICIAN     : user swipes up / taps the peek strip / taps ♫ tab
  MUSICIAN → PEEK     : user swipes down from expanded sheet
  PEEK → IDLE         : user swipes down from peek / taps background / taps ♫ tab
  IDLE → TRAIL        : user taps ☰ Trail tab / hamburger
  TRAIL → IDLE        : user taps ☰ Trail tab / ✕ / scrim
  MUSICIAN → TRAIL    : user taps ☰ Trail tab → MUSICIAN dismissed, TRAIL opens
  TRAIL → MUSICIAN    : user taps ♫ Musician tab → TRAIL dismissed, MUSICIAN opens

Mutual exclusion:
  TRAIL and MUSICIAN are never both open simultaneously.
  PLAYING coexists with any state; the media player repositions based on
  the active panel state (see ADR-037).
```

This state machine is implemented as a single JS function `setPanelState(newState)`
that coordinates all panel transitions. Individual panel open/close functions
(`toggleLeftDrawer`, `showBottomSheet`, etc.) are replaced by calls to
`setPanelState()`.

---

### 6. Exploration flow: tap-to-navigate breadcrumb hints

**Problem:** The user doesn't know where to go next. The graph is dense; the panels
are disconnected.

**Solution:** When the bottom sheet is in peek state after a node selection, the peek
strip shows a **breadcrumb hint** that invites the next exploration step:

```
┌─────────────────────────────────────────┐
│  ◆ Vina Dhanammal (1867–1938) · 4▶ ↑   │  ← peek: "4▶" = 4 recordings
└─────────────────────────────────────────┘
```

When the user expands the sheet and taps a recording, the media player opens and the
sheet transitions to peek. The peek now shows:

```
┌─────────────────────────────────────────────┐
│  ♫ Now: Viruttam (Pasuram) — Kulam Tharum ↑ │  ← peek: currently playing
└─────────────────────────────────────────────┘
```

This creates a **narrative thread**: tap musician → see recordings (peek → expand) →
play recording (sheet retreats to peek, showing what's playing) → tap another
musician → follow the lineage. The panels guide the exploration rather than blocking
it.

---

## Before / After (mobile navigation)

### Before (current implementation)
```
┌────────────────────────────────────┐
│ [☰]  CARNATIC MUSIC  [GS | MJ]    │  header
├────────────────────────────────────┤
│ [●LP] [●Cont] | [○Vocal] [○ ···  │  filter bar (always visible)
├────────────────────────────────────┤
│                                    │
│          (canvas)                  │  graph or wheel
│                                    │
│                                    │
│                                    │
│                                    │
├────────────────────────────────────┤
│    ━━━  MUSICIAN ♫                 │  72px peek (invisible)
└────────────────────────────────────┘
  Media player: floating, uncoordinated
  Left drawer: no visible close
  Panels: independent, uncoordinated
```

### After (proposed)
```
┌────────────────────────────────────┐
│ [☰]  CARNATIC MUSIC    [GS | MJ]  │  header (compact labels)
├────────────────────────────────────┤
│ [🔽 Filters (2 active)]           │  collapsed filter toggle (44px)
├────────────────────────────────────┤
│                                    │
│          (canvas)                  │  graph or wheel — maximum height
│                                    │
│                                    │
│                                    │
│                                    │
├────────────────────────────────────┤
│ ◆ Vina Dhanammal · 4▶          ↑  │  100px contextual peek
├────────────────────────────────────┤
│    [♫ Musician]    [☰ Trail]       │  56px bottom tab bar
└────────────────────────────────────┘
  Media player: docks above tab bar (see ADR-037)
  Left drawer: ✕ close button + enhanced scrim
  Panels: state machine with mutual exclusion
```

---

## Consequences

- **Canvas height gain:** Collapsible filter bar saves ~52px. The canvas is now
  `viewport - 56px (header) - 44px (filter toggle) - 100px (peek) - 56px (tab bar) =
  viewport - 256px`. On a 844px viewport, that is **588px** of canvas (vs. current
  ~544px with the filter bar expanded and 72px peek).

- **Two new persistent UI elements:** The bottom tab bar (56px) and the collapsed
  filter toggle replace two existing elements (always-visible filter bar and invisible
  peek strip). Net vertical space change: +52 (filter saved) − 56 (tab bar) − 28
  (taller peek) = **−32px** in the worst case (when peek is visible). When no node
  is selected, peek is dismissed and the canvas gains +24px net.

- **ADR-034 amendments:** The bottom sheet CSS from ADR-034 is preserved. The peek
  height changes from 72px to 100px. The sheet's `bottom` position accounts for the
  56px tab bar. The hamburger button remains but is demoted to a secondary trigger.

- **ADR-033 no impact:** The touch interaction model (tap/dbltap/taphold) is orthogonal
  to this ADR. No changes to gesture semantics.

- **Desktop is unmodified.** The bottom tab bar, collapsed filter toggle, drawer close
  button, and compact view labels are all gated behind `@media (max-width: 768px)`.

---

## Implementation

| Step | Owner | Description |
|---|---|---|
| 1 | Carnatic Coder | Add `<span class="view-label-full">` / `<span class="view-label-short">` to view buttons; add mobile CSS to swap them |
| 2 | Carnatic Coder | Implement collapsible filter bar toggle (`#filter-toggle-btn`); `max-height` transition on `#filter-bar` |
| 3 | Carnatic Coder | Add bottom tab bar HTML (`#mobile-tab-bar`); wire to `setPanelState()` |
| 4 | Carnatic Coder | Implement `setPanelState()` state machine in `mobile.js`; replace individual toggle functions |
| 5 | Carnatic Coder | Add `#drawer-close-btn` to left sidebar; enhance scrim opacity |
| 6 | Carnatic Coder | Increase peek height to 100px; add contextual peek label logic |
| 7 | Carnatic Coder | Add scroll fade gradient on filter bar overflow |
| 8 | Carnatic Coder | `bani-render` + verify on 390px Chrome DevTools emulator |

All steps are Carnatic Coder scope. No Librarian or data changes involved.

---

## Open questions

1. **Bottom tab bar vs. enhanced peek only:** Solution 3B (bottom tab bar) is
   recommended but adds 56px of persistent chrome. Is the navigation clarity worth the
   vertical space? An alternative: keep the hamburger for the left drawer, but enhance
   the peek strip to 100px with contextual labels (Solution 3A) — this avoids the tab
   bar entirely.

2. **Filter bar collapse — default state:** Should the filter bar start collapsed on
   mobile (user must tap to reveal chips), or start expanded on first load and collapse
   after the first interaction? Starting collapsed is cleaner; starting expanded
   teaches the user that filters exist.

3. **View selector: abbreviate to GS/MJ vs. icons:** GS/MJ is recognizable to repeat
   users but opaque to first-time visitors. An alternative: use a small lineage-tree
   icon (🌿) for Guru-Shishya and a wheel icon (☸) for Mela-Janya, with text visible
   on tap-and-hold or in a tooltip.

4. **Bottom tab bar position relative to browser chrome:** On iOS Safari, the bottom
   toolbar (~44px) and the home indicator (~34px) overlap the viewport bottom. The
   tab bar needs `padding-bottom: env(safe-area-inset-bottom)` to clear the home
   indicator, but this adds height. Should the tab bar use
   `calc(56px + env(safe-area-inset-bottom))`?

5. **Peek contextual label — editable by Librarian?** The peek label shows musician
   name, lifespan, and recording count. These come from `graph.json` data at render
   time. No Librarian involvement is needed at runtime, but the label format could be
   configurable (e.g., template string in the render config). Defer for now?
