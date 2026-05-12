# ADR-127: Vocabulary Chips as Universal Section Tokens

**Status**: Proposed
**Date**: 2026-05-11
**Author**: Graph Architect

---

## Context

The system has four base nouns that constitute its operating vocabulary:

| Token | Visual identity (existing) |
|---|---|
| **Musician** | `.musician-chip` — era-tinted, diamond glyph, bold |
| **Raga** | `.raga-chip` — saturated teal, bold |
| **Composition** | `.comp-chip` — saturated amber/gold, bold |
| **Lecdem** | `.lecdem-chip` — purple, bold (ADR-079, ADR-125) |

Each of these classes already exists and is applied wherever the corresponding *navigable entity* appears inline: in trail rows, recording rows, lecdem subjects, the help-deck "What is Bani Flow" intro, etc. The chips are the system's first-class affordance — colored, bold, clickable, recognisable across surfaces.

But the **same nouns also appear as plain prose** in many places where they refer to the *concept* rather than a specific instance:

- Section headers: `Recordings by Raga`, `Lecdems by X`, `Lecdems on Y`, `Compositions (15)`, `Lecdems (3)`.
- Panel titles: `MUSICIAN`, `BANI FLOW ♫`.
- Empty-state hints, sub-section labels, tooltips.

In these places the noun is rendered as ordinary text — typically smaller and dimmer than the colored chips that follow it. The screenshot the user submitted shows `RECORDINGS BY RAGA` as a subdued grey caps label, sitting *below* the much louder `Ananda Bhairavi` chip. The hierarchy is inverted: the type label is quieter than its instance.

Two separate problems flow from this:

1. **Inverted hierarchy.** A section header should be at least as legible as the chips it contains. Right now the chips dominate their own headers.
2. **Inconsistent vocabulary.** The same word (`Raga`) is sometimes a colored chip (when it labels a navigable raga node) and sometimes ordinary text (when it labels a *kind* of thing). The user has to learn that these are the same concept rendered two ways.

There is also a related cosmetic issue: the panel titles `BANI FLOW ♫` and `MUSICIAN ♫` carry a treble-clef / quaver glyph (`&#9835;` = ♫). This glyph is a Western staff-notation convention. Carnatic music is an aural-oral tradition that does not use staff notation; the glyph is the wrong cultural register. ADR-011 §Asymmetry-2 introduced these glyphs as a symmetry fix. ADR-127 supersedes that aspect of ADR-011 — the glyphs were the wrong vehicle for symmetry. The right vehicle is the vocabulary chip itself.

---

## Pattern

**Strong Centres** (Alexander Pattern 124). The four vocabulary nouns are *centres* of the system. Every place they are spoken should reinforce them — never weaken them. A section header that whispers `Recordings by Raga` while the chip below it shouts `Ananda Bhairavi` weakens the centre at the moment of greatest pedagogical opportunity.

**Levels of Scale** (Alexander Pattern 145). The chip identity already operates at one scale (the inline navigable token, ~0.74rem). The same identity should operate at a larger scale (the section header, ~0.95rem) and at the largest scale (the panel title, ~1.1rem). The visual language is a single language with three magnitudes — not three different languages.

**Roughness** (Alexander Pattern 251). The vocabulary chip's identity is robust; it tolerates being rendered at the panel-title scale, the section-header scale, and the inline scale without losing meaning. We use the same chip everywhere and let scale (not ornamentation) carry hierarchy.

---

## Decision

### D1. Vocabulary chip is a single CSS identity rendered at three scales

Introduce a size modifier system for the existing chip classes. The base class carries the colour/glyph/weight identity. A modifier sets the scale.

```
.musician-chip                      /* base — inline scale, ~0.74rem */
.musician-chip.chip-section-hdr     /* section-header scale, ~0.95rem, no underline on hover */
.musician-chip.chip-panel-title     /* panel-title scale, ~1.1rem, letter-spaced, non-clickable */
```

The same modifier set applies to `.raga-chip`, `.comp-chip`, `.lecdem-chip`. The modifiers are content-agnostic: they only set font-size, padding, letter-spacing, and disable the click affordance for the title scale.

### D2. Section headers contain a chip, not a word

**Before** (current):
```html
<div class="rec-section-header-row">
  <span>Recordings by Raga (16)</span>
</div>
```

**After**:
```html
<div class="rec-section-header-row">
  <span>Recordings by </span>
  <span class="raga-chip chip-section-hdr">Raga</span>
  <span class="rec-section-count"> (16)</span>
</div>
```

Same treatment for:

| Header text (before) | Composition (after) |
|---|---|
| `Lecdems on Bhairavi (3)` | `Lecdems` (chip) `on Bhairavi (3)` |
| `Lecdems by X` | `Lecdems` (chip) `by` (musician chip `X`) |
| `Lecdems about X` | `Lecdems` (chip) `about` (musician chip `X`) |
| `Recordings by Raga (16)` | `Recordings by` (raga chip `Raga`) `(16)` |
| `Compositions (15)` | (comp chip `Compositions`) `(15)` |
| `Concerts (1)` | (concert chip `Concerts`) `(1)` — see D5 below |

The chip in a section header is **non-navigable** — it is a type label, not an instance. Modifier `.chip-section-hdr` removes the click handler binding (Coder's responsibility) and the hover underline.

### D3. Panel titles use the chip at the title scale

**Before**:
```html
<h2 id="left-panel-title">BANI FLOW &#9835;</h2>
<h2 id="right-panel-title">MUSICIAN</h2>
```

**After**:
```html
<h2 id="left-panel-title"><span class="bani-chip chip-panel-title">BANI FLOW</span></h2>
<h2 id="right-panel-title"><span class="musician-chip chip-panel-title">MUSICIAN</span></h2>
```

The `♫` / `&#9835;` glyph is **removed** from both panel titles. The chip identity is the semantic marker; no Western-notation glyph is needed. ADR-011 §Asymmetry-2 is superseded with respect to glyph choice (the *symmetry* commitment of ADR-011 stands; the *mechanism* changes from glyphs to chips).

For BANI FLOW the panel title uses a new composite `.bani-chip` class — a single chip whose background blends the raga teal and composition gold (CSS `linear-gradient`, ~45°), border tinted to the midpoint, text colour chosen for legibility against the gradient. The composite acknowledges that the left panel is the joint raga + composition entry; neither sub-vocabulary alone is faithful to its scope. The composite is **only** used at `chip-panel-title` scale — it is not a navigable instance chip and never appears inline.

### D4. Help deck adopts the same vocabulary chips

The "What is Bani Flow" help-deck card already uses inline chips for vocabulary words (per the user's reference). This ADR ratifies that as the canonical pattern: any prose anywhere in the UI that names one of the four vocabulary nouns *as a concept* renders that noun as a chip. Coder's audit task: grep the templates for the literal words `Musician`, `Raga`, `Composition`, `Lecdem` and convert each occurrence to the appropriate chip, except where the word is already part of a chip's text (e.g. `.raga-chip` containing `Bhairavi` — the chip *is* the raga, no inner label needed) or where it appears in a form input placeholder.

### D5. Concert and Recording are *not* vocabulary chips (yet)

`Concerts` and `Recordings` are sub-categories of the lecdem/recording space, not first-class vocabulary nouns. They get the section-header scale treatment (font-size lift, contrast lift) but not a coloured chip palette. If future ADRs promote them to first-class status, they get their own palettes via amendment.

### D6. Self-reference suppression

When a section header would render a chip whose entity *is* the panel's own subject, the chip is **suppressed** in favour of the type chip alone — the sub-header drops the redundant musician/raga/composition reference entirely.

Examples:
- On Vina Dhanammal's musician panel: the `Lecdems by` sub-header renders as `[lecdem chip]Lecdems by` — not `[lecdem chip]Lecdems by [musician chip]Vina Dhanammal`. The panel's own header already names her.
- On Bhairavi's raga panel: `Lecdems on` renders without a trailing `[raga chip]Bhairavi`.
- On a composition panel: `Recordings of` renders without a trailing comp chip naming the composition.

The principle: **consistency is a means, not the end.** Repeating the panel's subject in every sub-header dilutes the chip vocabulary by overuse and visually clutters the section row. Suppression keeps the chip language pungent and the panel's subject anchored at its header where it belongs.

The cross-panel cases (e.g. left-panel Bhairavi raga showing `[lecdem chip]Lecdems on Bhairavi (3)`) **retain** the trailing chip — there the subject reference is informational because the user arrived from a different surface.

### D7. Vocabulary registry — extensibility for future nouns

The chip system is structurally open. New vocabulary nouns will arrive — Tala is the obvious near-term candidate (currently rendered as plain text in recording rows), and the system already hints at Mela, Bani, and Era as latent candidates.

To future-proof:

1. **Single registry**: chip definitions live in one place (`base.html` chip block), one CSS pattern per noun. No vocabulary chip is allowed to be defined ad-hoc inside `media_player.js` / `bani_flow.js` / a help-deck card.
2. **Modifier orthogonality**: the three scale modifiers (`chip-section-hdr`, `chip-panel-title`, and the implicit inline base) are **noun-agnostic**. Adding a new noun requires defining only its base palette + glyph; the three scales come for free via the modifier rules. Coder must keep the modifier CSS authored as patterns that apply to the chip *family*, not enumerated per-noun, to the extent the existing chip-class structure permits.
3. **Glyph slot**: each chip has a `::before` glyph slot. The current four use ♫ (musician), ◆ (raga), ♪ (comp — pending), ⊕ (lecdem — pending). A future noun supplies its own. The glyph is the only piece of identity that does not derive from CSS variables.
4. **No structural commitments to "exactly four"**: Coder must not write code that assumes the vocabulary set is closed. Section-header construction in `panel_components.js` (per ADR-128) takes a `headerChip` *element*, not a noun *enum* — a future noun's chip is accepted without changing the constructor signature.
5. **Tala specifically (forecast, not commitment)**: when Tala is promoted to first-class (separate ADR), it adopts a fifth palette — provisional working name `.tala-chip`, candidate hue green/sage to occupy a colour-wheel position distinct from the existing four. ADR-127 does not pre-commit the palette; it commits only that the addition will not require restructuring the chip system.

---

## Consequences

**Gains**:
- Section headers are at least as prominent as the chips they contain (item 6 in user request resolved).
- The four vocabulary nouns are visually consistent everywhere they appear (item 4 + item 6).
- The Western-notation glyph is retired (item 4).
- The pedagogical surface (help deck) and the operational surface (panels) speak the same visual language.

**Losses / risks**:
- Section headers become wider — the chip padding adds horizontal space. Risk: header rows wrap on narrow panels. Mitigation: chip-section-hdr uses tight padding (4px 8px) and the existing `.rec-section-header-row` is already a flex row that allows wrap.
- Coder must touch every section header in `media_player.js` and `bani_flow.js`. This is mechanical but tedious.
- The non-navigable variant of the chip is a new contract — Coder must not bind click handlers on `.chip-section-hdr` / `.chip-panel-title`. Linter / convention only.

**Supersedes**:
- ADR-011 §Asymmetry-2 (panel-title glyph mechanism). The symmetry commitment of ADR-011 stands; the glyph mechanism is replaced by the chip-at-title-scale mechanism.

---

## Implementation

Coder owns:

1. Add modifier CSS in `base.html` next to each chip's existing block (`.musician-chip`, `.raga-chip`, `.comp-chip`, `.lecdem-chip`):
   ```css
   .raga-chip.chip-section-hdr { font-size: 0.95rem; padding: 4px 10px; letter-spacing: 0.02em; cursor: default; }
   .raga-chip.chip-section-hdr:hover { text-decoration: none; }
   .raga-chip.chip-panel-title { font-size: 1.1rem; padding: 6px 14px; letter-spacing: 0.06em; cursor: default; text-transform: uppercase; }
   ```
   (and parallel rules for the other three classes). Author the modifier rules so adding a fifth chip family later (per D7) requires only the new base palette plus opt-in to the same modifier patterns.
2. Add `.bani-chip` (composite, panel-title-only per D3) — a new class whose background is a `linear-gradient` blending the raga and comp palettes, with the `chip-panel-title` modifier applied at the BANI FLOW title.
3. Replace section-header text constructions in `media_player.js` and `bani_flow.js` per the table in D2, applying D6 self-reference suppression: when the would-be trailing chip's id equals the panel's current subject id, render only the type chip + preposition.
4. Replace the panel title HTML in `base.html` per D3. Remove the `&#9835;` entity.
5. Audit the help deck and any tooltips/empty-states for occurrences of the four vocabulary words; convert per D4.
6. Run `bani-render` and visually inspect both panels at three viewport widths (320 / 768 / 1440).

Librarian: no work — this is presentational only; no data-shape changes.

---

## Open Questions

*(All three opening questions resolved 2026-05-11 by user direction; see D3 composite, D6 self-reference suppression, D7 extensibility.)*

- The `.bani-chip` gradient angle, hue stops, and text-colour contrast are Coder's call during implementation — the only commitment in D3 is "composite of raga + comp palettes".
- D7 leaves the Tala palette unspecified; a future ADR (when Tala is promoted) will fix it.
- Should D6's self-reference suppression apply to the panel-header `+` button's tooltip text too (currently `Add lecdem recording for Vina Dhanammal`)? Cosmetic; defer.
