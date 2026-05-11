# ADR-125: Lecdem Label Chip Prominence

**Status**: Accepted  
**Date**: 2026-05-11  
**Author**: Graph Architect

---

## Context

ADR-079 defined a purple visual identity for lecdems (`.lecdem-chip`, `--lecdem-bg/border/text/glyph`). That identity is applied correctly to **navigation chips** — the purple chips that link from the tutorial/search panel *to* a lecdem. However, the **title label within a lecdem row** — the text that names the lecdem recording — has never received this identity.

Currently:
- **Flat lecdem rows** (no segments): title uses `.yt-label-chip` — the same muted-gray chip used for generic YouTube recordings. `font-weight: normal`, `color: var(--fg-sub, #bbb)`.
- **Bracketed lecdem rows** (with segments): title uses `.concert-title` — concert styling, no lecdem palette.

Both of these appear identically in both rendering surfaces:
- The **Musician Panel** (`media_player.js`): "Lecdems by X" and "Lecdems about X" sections.
- The **Raga/Comp Panel** (`bani_flow.js`): `#bani-lecdem-strip`.

The effect is that a lecdem's title text looks indistinguishable from a routine recording label — dull, de-emphasized. The raga/comp/musician chips below it are rendered with saturated color, `font-weight: bold`. The lecdem title sits above them looking like metadata, when it should be the centrepiece.

---

## Pattern

**Strong Centres** (Christopher Alexander): a lecdem is not a background event. It is an act of transmission — a musician explaining their musical thinking on camera. It deserves a centre as strong as the raga and composition chips that surround it. The title should anchor the row, not disappear into it.

**Levels of Scale**: The existing chip hierarchy is:
1. Raga/composition/musician chips — colored, bold, first-class.
2. YouTube recording labels (`yt-label-chip`) — neutral gray, secondary.
3. Lecdem navigation chips (`.lecdem-chip`) — purple, bold, with icon.

Lecdem titles should sit at level 1, not level 2. The purple palette (already defined at level 3) is the correct vehicle — it just needs to be extended to the title label role within a row.

---

## Decision

Introduce a new CSS class `.lecdem-label-chip` for the **title label within a lecdem row**. It is a label variant of the lecdem identity:

**Before** (flat row label):
```js
labelSpan.className = 'yt-label-chip';
```

**After**:
```js
labelSpan.className = 'lecdem-label-chip';
```

**Before** (bracketed row title):
```js
titleSpan.className = 'concert-title';
```

**After**:
```js
titleSpan.className = 'concert-title lecdem-title';
```
(A modifier class so the bracket layout is preserved while the lecdem palette is overlaid.)

**CSS to add** (in `base.html`, near the existing `.lecdem-chip` block):

```css
/* ── ADR-125: Lecdem label chip — title label within a lecdem row ── */
/* Used for flat lecdem row titles (replaces yt-label-chip for lecdems) */
.lecdem-label-chip {
  display: inline-block;
  padding: var(--chip-padding-primary, 2px 8px);
  font-size: var(--chip-size-primary, 0.74rem);
  font-weight: 600;
  border: var(--chip-border-width, 1px) solid var(--lecdem-border);
  border-radius: var(--chip-border-radius, 4px);
  background: var(--lecdem-bg);
  color: var(--lecdem-text);
  white-space: normal;
  vertical-align: middle;
  line-height: 1.35;
  word-break: break-word;
  max-width: 100%;
  align-self: flex-start;
  margin-top: 5px;
}

/* ── ADR-125: Lecdem title modifier for bracketed lecdem headers ── */
/* Overlays the lecdem palette on the concert-title layout */
.concert-title.lecdem-title {
  color: var(--lecdem-text);
  font-weight: 600;
}
```

---

## Consequences

- Flat lecdem titles become visually prominent: purple-tinted background, bright lavender text, semibold — same visual weight as raga/comp chips.
- Bracketed lecdem headers gain the lecdem text color without disrupting concert-bracket layout.
- `.yt-label-chip` is no longer used in lecdem rows (it remains correct for plain YouTube recording labels).
- `.lecdem-chip` (navigation chip with icon) is unaffected — its role is linking *to* a lecdem from elsewhere.
- Both Musician Panel and Raga/Comp Panel benefit automatically because both call `_buildLecdemBracket`.
- No schema or data changes required.

---

## Implementation

**Carnatic Coder**:
1. Add `.lecdem-label-chip` and `.concert-title.lecdem-title` CSS rules to `carnatic/render/templates/base.html` in the ADR-079 lecdem block.
2. In `carnatic/render/templates/media_player.js`, in `_buildLecdemBracket`:
   - Flat row: change `labelSpan.className = 'yt-label-chip'` → `'lecdem-label-chip'`
   - Bracketed row: change `titleSpan.className = 'concert-title'` → `'concert-title lecdem-title'`
3. Run `bani-render` and verify visually.
