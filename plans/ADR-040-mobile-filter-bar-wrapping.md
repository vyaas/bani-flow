# ADR-040: Mobile Filter Bar — Always Visible, Wrapping Chips

**Status:** Proposed
**Date:** 2026-04-18
**Depends on:** ADR-008 (era/instrument topbar filters), ADR-036 (collapsible filter bar)

---

## Context

ADR-008 introduced era and instrument filter chips in a horizontal `#filter-bar`
below the header. On desktop, the chips sit in a single row that comfortably fits
era chips (Luminators, Living Pillars, Contemporary) plus a separator plus instrument
chips (Vocal, Veena, Violin, etc.) plus a "✕ Show all" clear button.

ADR-036 made this filter bar **collapsible** on mobile: a `#filter-toggle-btn`
("▼ Filters") must be tapped to reveal the bar, and the bar uses `max-height: 0` /
`max-height: 200px` to animate open. Additionally, each `.filter-group` has
`flex-wrap: nowrap; flex-shrink: 0`.

### What breaks on mobile (observed in screenshot)

**All filter chips are occluded.** The screenshot at 390px width shows partial chip
text — "minators" (clipped from "Luminators"), "Living Pillars", "Contemporary",
then a separator, then "Vocal", "Veena" — but the row extends beyond the viewport
edge. The chips do **not** wrap. The `flex-wrap: nowrap` rule on `.filter-group`
forces all chips into a single horizontal line that overflows.

Even when the user taps the filter toggle to expand the bar, the chips remain in a
non-wrapping row that bleeds off-screen. **The Guru-Shishya view is not filterable
on mobile** because the user cannot see or reach all the chips.

This is a direct contradiction of ADR-008's intent: the filters exist to let users
focus on specific eras or instruments. If half the chips are invisible, the feature
is broken.

---

## Forces in tension

| Force | Direction |
|---|---|
| **Full filterability** | Every filter chip must be visible and tappable on any screen width. No chip should be clipped or require horizontal scrolling. |
| **Vertical compactness** | Wrapping chips across 2–3 rows consumes 88–132px of vertical space. On a 844px viewport, this is 10–16% of the screen. |
| **Discoverability** | If filters are always collapsed behind a toggle, users may never discover them. An always-visible bar with wrapping chips is more discoverable. |
| **Simplicity** | Removing the collapsible toggle (ADR-036 §filter-toggle-btn) and showing the filter bar permanently eliminates a state to manage. |

---

## Pattern

**Chip wrapping** (Material Design 3, "Chips: filter"): Filter chips wrap to
multiple rows when horizontal space is insufficient. Each chip maintains its
minimum touch target (44px height). The container uses `flex-wrap: wrap` with a
small gap.

**Always-visible filters** (YouTube Music genre filters, Spotify library filters):
Content-filtering chips are not hidden behind a toggle — they are a persistent
horizontal strip that wraps as needed. The user sees all available filters at a
glance.

---

## Decision

### 1. Remove the collapsible filter toggle on mobile

Delete the `#filter-toggle-btn` from the mobile layout. The `#filter-bar` is
**always visible** below the header on mobile — same as on desktop. This removes
the `max-height: 0` animation, the `filters-visible` class toggle, and the
`toggleFilterBar()` state in `mobile.js`.

### 2. Enable chip wrapping

Change `.filter-group` inside the mobile media query from `flex-wrap: nowrap` to
`flex-wrap: wrap`:

```css
@media (max-width: 768px) {
  #filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
    padding: 6px 10px 8px;
    max-height: none;          /* remove collapsible constraint */
    overflow: visible;         /* no hidden overflow */
  }
  .filter-group {
    flex-wrap: wrap;
    flex-shrink: 1;            /* allow shrinking */
    gap: 4px 6px;
  }
  .filter-separator {
    width: 100%;              /* force instrument group to next line */
    height: 0;
    border-top: 1px solid var(--border-strong);
    margin: 2px 0;
  }
}
```

The `.filter-separator` becomes a full-width line break, pushing the instrument
group to a second row. This gives the layout:

```
┌────────────────────────────────────┐
│ [Luminators] [Living Pillars]      │  row 1: era chips
│ [Contemporary]                     │
│ ─────────────────────────────────  │  separator
│ ○ [Vocal] ○ [Veena] ○ [Violin]    │  row 2: instrument chips
│ ○ [Flute] ○ [Mridangam]  [✕ All]  │
└────────────────────────────────────┘
```

### 3. Compact chip sizing for mobile

Reduce chip padding and font size slightly on mobile to fit more per row:

```css
@media (max-width: 768px) {
  .filter-chip {
    padding: 4px 10px;
    font-size: 0.72rem;
    min-height: 32px;         /* still above WCAG 24px minimum */
    line-height: 1.2;
  }
}
```

At 390px with 10px side padding, a row has ~370px usable width. Each chip at
`0.72rem` with `10px` padding is approximately 90–120px wide. Three chips per
row fit comfortably; four may require wrapping to the next line.

### 4. Desktop is unchanged

On desktop (≥769px), `#filter-bar` remains a single non-wrapping row. The
`#filter-toggle-btn` is already `display: none` on desktop. No changes to desktop
layout.

---

## Before / After

### Before (mobile filters)
```
Header:     [☰] CARNATIC MUSIC    [GS|MJ]
Toggle:     [▼ Filters]
                 ↓ tap to expand
Chips:      [Lumin…][Living Pillars][Contemporary] | [Vocal][Vee — clipped →
```

### After (mobile filters)
```
Header:     CARNATIC MUSIC EXPLORER  [GS|MJ]
Chips:      [Luminators] [Living Pillars]
            [Contemporary]
            ────────────────────────
            ○ [Vocal] ○ [Veena] ○ [Violin]
            ○ [Flute] ○ [Mridangam] [✕ All]
Canvas:     (immediately below, full width)
```

---

## Vertical space budget (updated)

With ADR-038 (no hamburger), ADR-039 (no bottom sheet), and this ADR:

| Element | Height |
|---|---|
| Header | 56px |
| Filter bar (2 rows, era + instruments) | ~80px |
| Canvas | variable |
| Mini-player (when playing, ADR-037) | 56px |
| Tab bar | 56px |
| **Total chrome** | **248px** (playing) / **192px** (not playing) |
| **Canvas on 844px viewport** | **596px** (playing) / **652px** (not playing) |

This is an improvement over ADR-036's budget (312px chrome when playing) because:
- The hamburger row is gone (saved ~0px — it was in the header)
- The filter toggle button is gone (saved ~44px)
- The bottom sheet peek (100px) is gone (saved ~100px)
- The filter bar wrapping adds ~36px (one extra row vs. single row)

Net savings: ~108px of chrome eliminated.

---

## Consequences

- **All chips visible.** Every era and instrument filter is reachable on mobile.
  The Guru-Shishya view is fully filterable.

- **No toggle state to manage.** `toggleFilterBar()`, `filtersVisible`, and
  `#filter-toggle-btn` are removed from `mobile.js`. One fewer piece of UI state.

- **Two-row filter bar costs ~80px.** This is acceptable given the space saved
  by removing the bottom sheet peek and the toggle button.

- **Separator becomes a row break.** On mobile, the `.filter-separator` changes
  from a vertical bar to a horizontal line. This is a CSS-only change with no JS.

- **`updateFilterBadge()` can be simplified.** Without a collapsed filter bar,
  the badge count is less important (the user can see which chips are active).
  The function can remain for accessibility but is no longer the primary signal.

---

## Implementation

| Step | Owner | Description |
|---|---|---|
| 1 | Carnatic Coder | Remove `#filter-toggle-btn` display and wiring in mobile query |
| 2 | Carnatic Coder | Set `#filter-bar` to `flex-wrap: wrap; max-height: none; overflow: visible` at ≤768px |
| 3 | Carnatic Coder | Set `.filter-group` to `flex-wrap: wrap; flex-shrink: 1` at ≤768px |
| 4 | Carnatic Coder | Style `.filter-separator` as full-width horizontal rule at ≤768px |
| 5 | Carnatic Coder | Reduce `.filter-chip` padding/font for compact mobile sizing |
| 6 | Carnatic Coder | Remove `toggleFilterBar()` and `filtersVisible` from `mobile.js` (keep `updateFilterBadge()`) |
| 7 | Carnatic Coder | `bani-render` + test in Chrome DevTools at 390px and 320px widths |

All steps are Carnatic Coder scope.

---

## Open questions

1. **Horizontal scroll as alternative.** An alternative to wrapping is a
   horizontally scrollable chip strip (like Netflix categories). This avoids
   vertical space cost but hides chips behind a scroll gesture. The wrapping
   approach is preferred because all chips are visible at once — no hidden
   state. If the number of chips grows beyond ~12, reconsider horizontal
   scroll with a scroll indicator.

2. **Active filter persistence indicator.** When chips wrap to 2–3 rows, the
   user scrolls down and the filter bar scrolls off-screen. Should there be a
   persistent "N filters active" indicator (e.g., in the header or tab bar)?
   Low priority — the filter bar is near the top and easily scrolled back to.
