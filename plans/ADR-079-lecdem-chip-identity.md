# ADR-079: Lecdem Chip — Distinct Visual Identity for a First-Class Object

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-028 (design tokens single source of truth), ADR-054 (era-coloured musician chips), ADR-056 (equal chip prominence), ADR-063 (uniform chip appearance), ADR-074 (guru-shishya label chip parity), ADR-077 (lecdem schema)

---

## Context

The graph already gives every first-class entity its own chip class:

| Entity | Class | Visual cue |
|---|---|---|
| Raga | `.raga-chip` | Purple-leaning fill |
| Composition | `.comp-chip` | Composition palette |
| Composer | `.composer-chip` | Composer palette |
| Musician | `.musician-chip` | Era-coloured (ADR-054), instrument badge (ADR-069) |
| Concert | `.concert-chip` (within recordings) | Neutral; bracket-aware |

These chips are the user's primary navigation atoms. A user looks at a chip and immediately knows what *kind* of thing it is. ADR-056 (equal chip prominence) and ADR-063 (uniform chip appearance) constrain chips to a shared geometry; ADR-028 puts the colours and sizes behind design tokens.

Lecdems are introduced (ADR-077) as a first-class object alongside these. Per scratch.md item 7: *"Lecdems should not be treated as general misc objects: they are separate and should be treated as first class citizens in our system."* Without their own chip class, a lecdem would render either as an undecorated link or — worse — as a recital-track chip indistinguishable from a singles entry. Either choice silently demotes the lecdem to a second-class status that contradicts both the schema (ADR-077) and the tradition.

### Forces

| Force | Direction |
|---|---|
| **First-class signalling** | A user must recognise a lecdem chip in under a second, the way they recognise a raga chip today. |
| **Geometric parity (ADR-056, ADR-063)** | Lecdem chips must share the same height, padding, border-radius, and font scale as other chips. They cannot be visually "louder" — that would violate equal prominence. |
| **Token-only colour (ADR-028)** | The lecdem palette must live in `:root` as design tokens, not as ad-hoc colours in JS or component CSS. |
| **Glyph-as-cue, not glyph-as-noise** | A small lectern/microphone glyph distinguishes lecdems without requiring an unfamiliar colour. The glyph is the primary cue; colour is secondary. |
| **Click semantics inherit from youtube tracks** | A lecdem chip click MUST play the lecdem in the media player exactly as a recital track chip does. Lecdems are watched/listened to; the player is the destination. |
| **Subject revelation on activation** | When a lecdem chip is clicked, the player title reveals the *subjects* of the lecdem as cross-link chips (per ADR-026's player-title affordances). This turns a lecdem into a hub for further discovery. |
| **No graph canvas presence** | Lecdems are not nodes on the cytoscape canvas. They never need a graph-style rendering. The chip is a panel-only artefact. |

---

## Pattern

**Strong Centres + Identity through small variations** (Alexander, *The Nature of Order*). Each chip is a strong centre; the chip *family* is unified by geometry; identity within the family comes from controlled variations — colour, glyph, badge. The lecdem chip is one more variation in the same family, not a new family.

**Levels of Scale (ADR-056)**. The chip is the unit; the section is a row of units; the panel is a stack of sections. The lecdem chip occupies the unit level — it must compose into existing rows and sections without altering their layout.

---

## Decision

### 1 — Design tokens (added to `:root` in `base.html` per ADR-028)

```css
/* Lecdem chip palette — single source of truth */
--lecdem-bg:       #2a2233;            /* deep aubergine; sits between musician and composition */
--lecdem-border:   #6f5a8a;            /* muted violet edge */
--lecdem-text:     #e8def3;            /* warm off-white */
--lecdem-glyph:    #c9b6e0;            /* glyph fill, slightly stronger than text */
--lecdem-hover-bg: #352a40;            /* +1 brightness step on hover */
```

Token names follow the existing `--<entity>-bg/border/text` pattern (cf. `--composer-bg`, `--raga-bg`). The palette is deliberately distinct from raga, composition, and musician palettes but shares the family's saturation curve; it does not "shout".

### 2 — `.lecdem-chip` CSS class

```css
.lecdem-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: var(--chip-padding);            /* shared token (ADR-063) */
  height: var(--chip-height);              /* shared token (ADR-063) */
  font-size: var(--chip-size-primary);     /* shared token (ADR-028)  */
  border-radius: var(--chip-radius);       /* shared token (ADR-063) */

  background: var(--lecdem-bg);
  color:      var(--lecdem-text);
  border: 1px solid var(--lecdem-border);
  cursor: pointer;
  transition: background-color 120ms ease;
}

.lecdem-chip:hover { background: var(--lecdem-hover-bg); }

.lecdem-chip::before {
  content: "";
  display: inline-block;
  width: 12px;
  height: 12px;
  background: var(--lecdem-glyph);
  -webkit-mask: url("#icon-lecdem") center / contain no-repeat;
          mask: url("#icon-lecdem") center / contain no-repeat;
}
```

Geometry is identical to `.raga-chip` / `.comp-chip` / `.musician-chip` — no padding tweaks, no border-radius surprises. The only differences are colour tokens and the `::before` glyph.

### 3 — The lecdem glyph

A single inline SVG symbol is added to `base.html` once:

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="icon-lecdem" viewBox="0 0 24 24">
    <!-- stylised lectern with sound waves: a desk silhouette + two arc lines above -->
    <path d="M4 19h16v2H4zm2-2 6-12 6 12H6z" />
    <path d="M9 4 a4 4 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </symbol>
</svg>
```

Visually: a small lectern with two concentric arcs above it suggesting a voice projecting outward. Distinct from any existing glyph in the project (instrument badges use musical symbols; this uses a teaching/projection symbol). Inline so the chip never makes a network request for an icon.

### 4 — Click behaviour

A `.lecdem-chip` is bound (in `media_player.js` chip click handler) to the same code path as a recital-track chip:

1. Resolve the `LecdemRef` via the chip's `data-video-id` attribute.
2. Open the media player on `ref.url`.
3. Set the player title to `ref.label` (reusing the player-title affordances of ADR-026).
4. **Render the subjects of the lecdem as cross-link chips inside the player title strip**: each `subjects.raga_ids[]` becomes a `.raga-chip`; each `subjects.composition_ids[]` becomes a `.comp-chip`; each `subjects.musician_ids[]` becomes a `.musician-chip`. Clicking any of them performs that entity's standard click action (open panel, populate trail, etc.).

This is the "discovery hub" behaviour. A user who stumbles on a lecdem about three ragas can hop straight to any of those ragas from the player.

### 5 — Where lecdem chips appear

Lecdem chips appear **only** in three contexts (full layout described in ADR-080 and ADR-081):

1. **Musician panel — "Lecdems by" section** (ADR-080).
2. **Musician panel — "Lecdems about this musician" section** (ADR-080).
3. **Bani-flow panel — lecdem strip under a raga or composition trail subject** (ADR-081).

Lecdem chips MUST NOT appear in:

- The graph canvas (lecdems are not graph nodes).
- The global search dropdown (ADR-081 discoverability invariant).
- The topbar filter chips (ADR-081 — lecdems are not a filter category).
- The recital-tracks list inside the musician panel ("Singles" section). A lecdem is never a single.

### 6 — Chip label conventions

The chip's visible text is `ref.label` truncated to fit (existing `.chip-label` truncation rules apply). On hover, the full label appears as a `title` attribute. The lecturer's name is NOT appended to the chip text inside a "Lecdems by" section (the section header already names the lecturer); it IS appended inside a "Lecdems about" section and inside bani-flow lecdem strips, where the lecturer is part of the discovery payload.

---

## Consequences

### Positive

- **A lecdem is recognisable at a glance**: the lectern glyph plus the violet palette make it impossible to confuse with a raga, composition, or musician chip.
- **Geometric parity preserves panel rhythm**: rows that mix lecdem chips with other chips remain visually flat — no jarring height shifts.
- **Token-only colour means dark/light theming is free**: a future theme adjusts `--lecdem-bg` etc. in one place.
- **Click semantics are inherited from existing chips**: no new event taxonomy. The renderer just adds the subject-chips strip in the player title.

### Negative / accepted tradeoffs

- **One more glyph in the SVG sprite**: trivially small (a single `<symbol>`). The sprite is already inline.
- **Five new design tokens**: bounded, well-named, follow existing patterns.
- **Lecdem chips never appear on the graph canvas**: a user who only looks at the canvas will never see a lecdem unless they open a panel. This is intentional (item 9 of scratch.md — discovery, not lookup) and reinforced by ADR-081.

### Risks

- **Glyph confusion with future "lesson recording" entity**: a future schema for private guru→shishya lessons could plausibly want a similar projection-from-a-source glyph. Mitigated by naming the symbol `icon-lecdem` (specific) rather than `icon-talk` (generic). A lesson would get its own `icon-lesson`.
- **Colour collision with composer chips**: composer chips (added in ADR-057 era) sit in a similar warm palette family. Mitigated by the lectern glyph as the primary cue; colour is secondary. A side-by-side preview must be performed during implementation.

---

## Implementation

1. **`carnatic/render/templates/base.html`** (Coder)
   - Add the five `--lecdem-*` tokens to `:root`.
   - Add the `<symbol id="icon-lecdem">` to the inline SVG sprite block.
   - Add the `.lecdem-chip` class definition (and `:hover`, `::before`).

2. **Chip-rendering helpers** (Coder)
   - Add a `renderLecdemChip(ref) → HTMLElement` helper alongside the existing `renderRagaChip`, `renderCompChip`, `renderMusicianChip` family. The helper accepts a `LecdemRef` (ADR-078), sets `data-video-id`, attaches the click handler.
   - Click handler: opens the media player on `ref.url`; renders subjects as cross-link chips in the player title strip per §4 above.

3. **No data changes** (Librarian)
   - This ADR is render-only. No JSON file is touched.

4. **Verification**
   - Render a sandbox musician with one lecdem (added per ADR-077 + ADR-082); open the musician panel; confirm the lecdem chip renders with the lectern glyph and the violet palette; confirm row geometry matches adjacent chip rows.
   - Click the chip; confirm the media player opens, the title shows the lecdem label, and the subjects appear as clickable cross-link chips of the correct entity type.
   - Confirm no `.lecdem-chip` appears in the global search dropdown, on the canvas, or in the topbar.
