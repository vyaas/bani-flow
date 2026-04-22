# ADR-072: Search-Subject Prominence & Hierarchical Indentation

**Status:** Accepted
**Date:** 2026-04-22

---

## Context

In the current sidebars (see `screenshots/`), two visual-cue problems make
the panels harder to read than they should be:

1. **The search subject is visually small and asymmetric.** When the user
   searches "Kalyani", the chip rendered in the left subject header
   (`#bani-subject-name.raga-chip`) is `0.85rem`. When the user clicks
   "Ramnad Krishnan" in the right header, the chip rendered inside
   `#node-header` (`.musician-chip`) inherits the body chip token
   `--chip-size-primary: 0.74rem`. The two are not the same size, and
   neither is large enough to read at a glance — the user has to squint
   to confirm what they just searched for.

2. **The hierarchy in both trees is ambiguous.** On the left, a trail
   row stacks Composition → Composer → Lead Musician → Accompanists, but
   `.tree-leaf` uses only `padding-left: 12px` and `.tree-leaf-coperformers`
   has no indent of its own. Composer and Composition end up nearly
   flush. On the right, `.comp-raga-children` indents only `8px` and
   `.comp-raga-item` adds `6px` more, with version rows hanging off the
   composition row. Three to four logical levels share roughly the same
   horizontal position.

These are not data problems. They are visual-cue problems and belong to
the rendering layer.

## Pattern

**Strong Centres + Levels of Scale (Alexander).** The searched entity is
the strong centre of the panel — the largest, most prominent element.
Each descendant level (composer under composition, leaf under group,
accompanist under leaf) must be obviously subordinate to its parent
through a visible step in horizontal position and a guide rail.

The same scale must apply to both sidebars — symmetry is the cue that
tells the user "these are the same kind of thing".

## Decision

### Tokens (single source of truth)

Add to the `:root` block of `carnatic/render/templates/base.html`:

```css
--subject-size:       1.05rem;   /* search-subject chip font-size */
--subject-padding:    4px 10px;  /* search-subject chip padding   */
--hier-indent-step:   14px;      /* one indent level (desktop)    */
```

In the existing `@media (max-width:768px)` block override:

```css
--subject-size:       1.0rem;
--hier-indent-step:   10px;
```

### Search-subject prominence

Both subject headers render at `var(--subject-size)` /
`var(--subject-padding)`:

- Left: `#bani-subject-name.raga-chip` and `#bani-subject-name.comp-chip`.
- Right: `#node-header .musician-chip` and `#node-header .composer-chip`
  (latter for symmetry when a composer node is selected).

`#node-lifespan` bumps to `0.78rem` so it stays legible next to the
larger chip. The `↗` Wikipedia link styling is unchanged.

### Indentation contract (identical on both sides)

| Level | Left (Bani Flow trail) | Right (Musician recordings) | Indent              |
|-------|------------------------|-----------------------------|---------------------|
| 0     | Composition (group)    | Raga (group)                | 0                   |
| 1     | Composer chip          | Composition                 | 1× `--hier-indent-step` |
| 2     | Lead musician (leaf)   | Composer chip (kept inline) | 2× `--hier-indent-step` |
| 3     | Co-performers          | Versions (v1, v2…)          | 3× `--hier-indent-step` |

Each indented level keeps `border-left: 2px solid var(--border)` as a
guide rail.

The right-side composer chip remains inline with the composition title
(no DOM change) — its visual position is governed by the composition
row's level-1 indent.

## Consequences

- **Pure CSS change.** No DOM restructuring, no JS changes, no chip
  colours or glyphs touched. Edits are confined to
  `carnatic/render/templates/base.html`.
- **Single tuning point.** All three tokens live in `:root`. Future
  adjustments are one-line edits.
- **Mobile preserved.** The mobile override keeps indents narrow enough
  for the 320 px drawer.
- **Long names may ellipsize.** A `1.05rem` subject chip for very long
  musician names (e.g. "Madurai Mani Iyer") may push the lifespan
  slightly. Coder may nudge `--subject-size` ±0.05rem if overflow
  appears in practice.
- **No data, no schema.** This ADR does not require validation, render
  pipeline changes, or data migrations.

## Implementation

CSS-only edits in `carnatic/render/templates/base.html`:

1. Add the three tokens in the `:root` block (near `--chip-size-primary`).
2. Override `#bani-subject-name.raga-chip` and `#bani-subject-name.comp-chip`
   with the subject tokens.
3. Add a new rule `#node-header .musician-chip, #node-header .composer-chip`
   with the subject tokens.
4. Bump `#node-lifespan` to `0.78rem`.
5. Add `padding-left: var(--hier-indent-step)` to the composer chip
   inside `.tree-header-text` (left, level 1).
6. Change `#trail-list li.tree-leaf` to `padding-left:
   calc(var(--hier-indent-step) * 2)` (left, level 2).
7. Add `padding-left: var(--hier-indent-step); border-left: 2px solid
   var(--border)` to `.tree-leaf-coperformers` (left, level 3).
8. Change `.comp-raga-children` and `.comp-raga-item` to use
   `var(--hier-indent-step)` (right, level 1).
9. Indent the version row container at level 3 — selector to be
   identified during implementation around `media_player.js:1157`.
10. In the mobile media query, override `--subject-size` and
    `--hier-indent-step` on `:root`.
11. Run `bani-render`; verify visually against `screenshots/`.

## Out of scope

- Chip colours, chip glyphs, search-bar position (covered by ADR-007 /
  ADR-020).
- Sidebar widths.
- Right-side composer chip moved to its own row (would be a follow-up
  ADR if the inline placement proves confusing).
- Font family changes.
