# ADR-063: Uniform First-Class Chip Appearance

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect
**Depends on**: ADR-054 (era-coloured musician chips), ADR-056 (equal chip prominence)
**Partially supersedes**: ADR-056 §chip CSS (raga-chip base style)

---

## Context

### The visual disparity

Four entity types occupy the panels as navigation chips: musician, raga, composition, composer. All are first-class citizens of the knowledge graph. All trigger a view change on click. But their visual appearance is radically unequal:

| Chip type | Border | Background | Legibility |
|---|---|---|---|
| `.musician-chip` | solid left-bar, era colour | era-tint translucent fill | High — coloured box, clear affordance |
| `.comp-chip` | 1 px solid amber pill | transparent | Medium — visible pill, but faint amber |
| `.composer-chip` | 1 px dashed (era colour) | era-tint fill | Medium — dashed reads as secondary |
| `.raga-chip` | **none** | **transparent** | **Low — plain text with a ◈ glyph prefix** |

The raga chip is effectively invisible as a chip. It reads as a caption, not an interactive element. A user seeing it for the first time has no affordance signal that clicking a raga name will repopulate the panel. Compositions suffer similarly: the amber pill is present but low-contrast against the dark background, and the pill radius gives it a tag-like appearance rather than a button-like one.

### The user statement

> "A large part of the problem is the fact that ragas dont have a text box, making them appear nearly invisible. Their chip should get a text box and they should be rendered as brightly as the musician. We should use the same aesthetic. Even the compositions appear hard to read because of poor contrast: we should adopt a nearly uniform appearance for these items as they are all first class citizens and should indicate to the user that there is always a click action that causes a view change and a panel repopulation."

### Existing intent

ADR-056 correctly established that compositions and ragas should be *equally sized* — same `--chip-size-primary` font size, same padding tokens. It stopped short of prescribing a common visual geometry (border, background). This ADR extends ADR-056's intent from size parity to full visual parity.

---

## Forces

| Force | Direction |
|---|---|
| **Affordance uniformity** | If every clickable entity chip looks like a chip (bordered box with background tint), the user learns one affordance and applies it to all four entity types. |
| **Semantic differentiation** | Chips of different types still need to be distinguishable. They should share geometry but use distinct colour tokens — era tints for musicians/composers (already established), a dedicated raga colour, a composition colour. The ◈/♩/♯ prefix glyphs remain as type icons. |
| **Era-colour coherence** | Musician chips use era colours (ADR-054). Composer chips share the musician's era colour because the composer is a musician node. Raga chips reference the mela parent's colour slice from the raga wheel — this would be ideal but is complex. A single accent-level token for ragas is sufficient for v1. |
| **Contrast on dark background** | The current comp-chip amber border is barely legible at `var(--accent-sub)`. A filled or semi-filled background (even 8–12% opacity) dramatically improves contrast. |
| **Recordings are exempt** | Concert bracket headers and legacy track rows render composition/raga chips and a title label in sequence. The visual language of recordings is already distinct (grey bracket lines, indented rows). Chips inside recordings follow the same chip CSS but are rendered in a different context. No separate treatment needed. |
| **Token-driven** | Never hard-code colour values in chip CSS. Use design tokens so a future colour theme swap updates all chips. |

---

## Pattern

**Strong Centres** (Alexander): a chip that looks like a button is a strong centre — it has presence, boundary, and identity. The raga chip in its current form has none of these. Giving it a border and background makes it a real island of affordance.

**Levels of Scale**: colour distinguishes entity type (raga vs composition vs musician), but all chips share the *same scale* of padding, border-radius, and border weight. Scale encodes hierarchy (same for all); colour encodes type.

**Minimum difference principle**: chips differ *only* in colour. Not in shape, not in font weight, not in padding. One axis of variation → easily learned.

---

## Decision

### 1. New design tokens (`:root` in `base.html`)

```css
:root {
  /* Raga chip tokens */
  --chip-raga-border:  var(--accent-match, #6ec6a8);   /* teal/green accent */
  --chip-raga-bg:      color-mix(in srgb, var(--chip-raga-border) 12%, transparent);

  /* Composition chip tokens */
  --chip-comp-border:  var(--accent-sub, #c8a84b);     /* amber — unchanged hue */
  --chip-comp-bg:      color-mix(in srgb, var(--chip-comp-border) 10%, transparent);

  /* Shared geometry tokens */
  --chip-border-radius: 4px;   /* was 10px pill for comp, 3px for musician; unify to 4px */
  --chip-border-width:  1px;
}
```

`color-mix(in srgb, … 12%, transparent)` requires CSS Color Level 5 — supported in all current engines (Chrome 111+, Firefox 113+, Safari 16.4+). Fallback: a hard-coded `rgba()` value can be used in the `:root` block as a comment for older browser notes.

### 2. Unified chip base rule

Add a new shared rule that applies to all four primary chip types:

```css
/* ── Shared chip geometry (all four first-class entity types) ── */
.musician-chip,
.raga-chip,
.comp-chip,
.composer-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: var(--chip-padding-primary, 2px 8px);
  border-radius: var(--chip-border-radius, 4px);
  border-width: var(--chip-border-width, 1px);
  border-style: solid;
  font-size: var(--chip-size-primary, 0.78rem);
  font-weight: bold;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
```

### 3. Per-type colour overrides

```css
/* Musician chip — era colours applied by JS (--chip-era-border, --chip-era-bg) */
.musician-chip {
  border-color: var(--chip-era-border);
  background: var(--chip-era-bg);
  color: var(--fg);
  border-left-width: 3px;  /* left-bar accent preserved */
}

/* Raga chip — previously borderless; now solid teal */
.raga-chip {
  border-color: var(--chip-raga-border);
  background: var(--chip-raga-bg);
  color: var(--chip-raga-border);
  /* ◈ prefix glyph retained */
}
.raga-chip::before {
  content: '◈';
  font-size: 0.62rem;
  color: var(--chip-raga-border);
  opacity: 0.8;
}

/* Composition chip — amber border + fill */
.comp-chip {
  border-color: var(--chip-comp-border);
  background: var(--chip-comp-bg);
  color: var(--chip-comp-border);
  border-radius: var(--chip-border-radius);   /* replaces the 10px pill */
  /* ♩ prefix glyph retained */
}
.comp-chip::before {
  content: '♩';
  font-size: 0.62rem;
  color: var(--chip-comp-border);
}

/* Composer chip — era colours + dashed border (secondary role) */
.composer-chip {
  border-color: var(--chip-era-border);
  background: var(--chip-era-bg);
  color: var(--fg);
  border-style: dashed;      /* dashed retained: distinguishes COMPOSER from PERFORMER */
  /* ♯ prefix glyph retained */
}
.composer-chip::before {
  content: '♯';
  font-size: 0.62rem;
  color: var(--chip-era-border);
}
```

**Note on composer dashed border**: the composer chip retains its dashed border. This is the *only* remaining stylistic difference — it signals "composer of the work" (historical role) vs "performer of the work" (musician chip). The dashed/solid axis carries real semantic meaning; preserving it is correct.

### 4. Hover state (all four types)

```css
.musician-chip:hover,
.raga-chip:hover,
.comp-chip:hover,
.composer-chip:hover {
  filter: brightness(1.15);
  outline: 1px solid currentColor;
  outline-offset: 1px;
}
```

A single rule for all four. No type-specific hover styling.

### 5. Secondary chip (unresolved fallback — ADR-056 `.chip-secondary`)

The `.chip-secondary` modifier (for unmatched track titles) remains unchanged:

```css
.chip-secondary {
  font-size: var(--chip-size-secondary, 0.66rem) !important;
  padding: var(--chip-padding-secondary, 1px 6px) !important;
  opacity: 0.7;
  font-style: italic;
}
```

### 6. Player bar chips

The media player bar chips (`.mp-comp-chip`, `.mp-raga-chip`, `.mp-musician-chip`) should inherit the same tokens. Update those selectors to use `--chip-raga-border`, `--chip-comp-border`, and `--chip-era-*` variables respectively — no hard-coded colours.

---

## Consequences

### Positive
- Raga chips are now as visually prominent as musician chips. The user can scan a panel and immediately identify every interactive entity.
- Composition chips gain a filled background — legibility on dark panels significantly improved.
- All four types share geometry: users learn one visual language, not four.
- The ◈ / ♩ / ♯ glyphs remain as semantic type markers — the chips are differentiated by both glyph and colour, never colour alone (accessible).
- Tree-group headers (ADR-061, ADR-064) benefit immediately: the group header chip is now prominent enough to serve as its own navigable element.

### Negative / Trade-offs
- The raga chip changing from transparent to filled will be visually striking in context — test against the dark panel background and the bani-flow header section to ensure the teal does not clash with the existing accent palette.
- `color-mix()` requires a CSS Color Level 5 polyfill for Edge ≤ 110 and Firefox ≤ 112. Add a hard-coded `rgba()` fallback token in `:root` as a comment.
- Composition border-radius changing from pill (10 px) to 4 px changes the established comp-chip shape. Cross-check ADR-027's popover references and any screenshots used as onboarding assets.

### Out of scope
- Tala chips (not yet defined)
- Mela parent chips in the raga wheel (those are SVG text, not HTML chips)
- Concert bracket headers (own CSS context, not raw chips)

---

## Implementation

**Carnatic Coder owns**: `carnatic/render/templates/base.html`.

**Workflow C** (toolchain feature):

1. Add `--chip-raga-border`, `--chip-raga-bg`, `--chip-comp-bg`, `--chip-border-radius`, `--chip-border-width` to `:root` in `base.html`.
2. Replace the existing `.raga-chip`, `.comp-chip`, `.musician-chip`, `.composer-chip` CSS blocks with the rules in §2–§4.
3. Update `.mp-comp-chip`, `.mp-raga-chip`, `.mp-musician-chip` in the media player CSS to consume the same tokens.
4. Run `bani-render`.
5. Visually verify in browser: select Ramnad Krishnan → bani-flow trail shows raga chips with teal bordered boxes; comp chips show amber filled boxes.
6. Check `.chip-secondary` fallback rows remain smaller and italic — ADR-056's librarian feedback signal.
