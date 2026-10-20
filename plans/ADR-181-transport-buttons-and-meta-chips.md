# ADR-181: Transport Buttons + Left-aligned Meta Chips

**Status**: Accepted
**Date**: 2026-10-20
**Agents**: surface (UI surgeon) → tester
**Depends on**: ADR-028 (theme tokens), ADR-053/065 (play rings), ADR-128
(panel components), ADR-163/165 (the `+` thunk + harvest), ADR-177 (category
help dialog), ADR-179 (shared action column), ADR-180 (ribbon rows).

---

## Context (forces in tension)

The panel section header was `[CHIP] [?] ······ [(N) ▶ ⊕]`: the count and the
transport pair shared the right-hand column. Row action groups were play-only
in several places (flat Bani trail rows, the misc recordings leaf, the concert
and lecture-demo *headers*, and every lecdem segment), so whole concerts and
whole lecdems could be played but not enqueued. The enqueue glyph was `⊕`
(plus-in-a-circle) and, for rows, a bordered circle — visually a sibling of the
play circle, which made the two hard to tell apart at 24px.

The user's directive: modernise the play/enqueue controls (in the spirit of
Clementine / Symfonium); make the intent of each unmistakable; **retire the
per-concert item count**; move enumeration and help away from the transport
pair and group them, as tiny gray chips, with the category label; and ensure
**every playable item carries an enqueue button** — entire concerts and
lecture-demos included.

## Decision

### 1. Two unmistakable transport atoms

- **Play** and **enqueue** are a matched pair of **bare, rounded-square icon
  buttons** — no circle, no border. Both share the same geometry and hover:
  transparent background, `border-radius: 6px`, `--fg-sub` glyph, and a
  `--bg-hover` wash with an `--accent` glyph on hover. Play glyph `▶` (aqua
  `--accent-sub` when the item is part of a concert, neutral otherwise — the
  old dashed/solid ring retired), enqueue glyph `+` at `1.05rem`. Applies to
  `.rec-play-btn`, `.section-play-btn`, `.mp-queue-play`, `.mp-plus-btn`,
  `.section-enqueue-btn`.
- The row `.mp-plus-btn` keeps opening the playlist/queue menu (ADR-163) so
  playlist authoring survives.

### 2. Meta chips sit with the label, never with the transport

`buildSection` renders `[CHIP] [N] [?] ······ [▶ +]`. The count and the `?`
are tiny gray chips — the `.trail-version` recipe (`background: var(--bg-active)`,
`color: var(--bg-panel)`, 3px radius) — inside
`.rec-section-hdr-label-wrap`, i.e. flush with the category chip. They no
longer claim a right-hand slot, so `.section-hdr-right` is always exactly two
slots (play + enqueue) and the shared action vertical is unchanged. The
compositions-per-raga count (`.rec-group-count`) and the playlist count
(`.mp-playlist-count`) adopt the same chip; the latter loses its
`margin-left:auto` and sits beside the playlist title.

### 3. Per-concert enumeration retired

`buildConcertBracket` and `_buildLecdemBracket` no longer render a
`.concert-count`. A concert is one unit of attention; its item count was noise.
(`--row-act-strip-3` is removed with the last three-slot consumer.)

### 4. Every playable item is enqueueable

New `+` affordances: whole concert header, whole lecdem header, flat lecdem
row, lecdem segment, misc recordings leaf, flat Bani trail row, and the whole
playlist header. All route through the existing canonical queue-item builders
(`_buildRowQueueItem` in Bani Flow; the section `registerQueueItem` thunks in
the musician panel) so the `+` menu and the filter-scoped harvest cannot
disagree (ADR-165 §3).

### 5. The filter-row transport pair aligns with the sections

`#rec-play-acts` / `#trail-play-acts` live inside `#node-info` / `#bani-info`,
which carry 14px horizontal padding that the section rows below do not. The
pair therefore sat 14px left of the `.section-hdr-right` column. A
`margin-right: -14px` on the two filter-row groups pulls them onto the same
right edge, so play/enqueue form one continuous vertical from the filter row
through every section header and row.

## Consequences

- The `(N) ▶ ⊕` right column and its three-slot reservation are gone; the
  right action column is two slots everywhere (rows and section headers).
- `--row-act-strip-3` is deleted.
- Help and enumeration are visually one family, distinct from transport.
- Play and enqueue read as a matched bare icon pair (▶ / +), visually distinct
  from the circle-less meta chips.
- The filter row and every section header share one play/enqueue vertical.
- Whole concerts / lecdems can now enter the queue from their own headers.

## Out of scope

The in-player track list (`.mp-track-play-btn`) and the tutorial-deck demo
rows keep their demonstration play buttons; they are navigation/illustration
inside a single item, not panel queue units.
