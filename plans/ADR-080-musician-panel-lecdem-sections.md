# ADR-080: Musician Panel — "Lecdems by" and "Lecdems about" Sections

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-059 (musician panel compositions section), ADR-064 (musician panel raga→composition tree), ADR-067 (musician panel history navigation), ADR-078 (lecdem render indexes), ADR-079 (lecdem chip)

---

## Context

### Current panel anatomy

The Musician panel (right sidebar) renders, in order:

1. **Header** — node-chip with era colour, instrument badge, lifespan
2. **Concerts** — `nd.structured_perfs` grouped into concert brackets (ADR-018, ADR-064 raga→composition tree)
3. **Singles** — legacy `nd.tracks[]` (one-off recital tracks not part of a concert)
4. **Compositions** — works composed by this musician (ADR-057, ADR-059)

This ordering reflects ADR-059's principle: temporal immediacy first (concerts/singles — when the musician *performed*), then permanence (compositions — what they *left behind*).

### What lecdems add

A lecdem is neither a recital event nor a composition. It is a *teaching utterance* — a recorded act of explanation. It belongs in the musician panel for two reasons:

1. **Lecdems by this musician** are part of their authored output — sibling to compositions, but in the spoken/explanatory register rather than the composed register.
2. **Lecdems about this musician** are part of how the tradition speaks *of* them — a reception layer, distinct from anything the musician themselves authored. Today this layer has no surface in the panel at all; it lives only in the lecturers' nodes.

The user's framing (scratch.md item 4) is explicit: *"Lecdems-by are by the Musicians; Lecdems-about are about ragas, compositions, and musicians. So every Musician will not only have a section that shows the lecdems by them, but also about them."*

### Forces

| Force | Direction |
|---|---|
| **Distinct from compositions** | A lecdem is not a composition. The "Lecdems by" section must sit in its own slot, not be nested under Compositions. |
| **Two registers, two subsections** | "Lecdems by" (authorship register) and "Lecdems about" (reception register) are categorically different. Conflating them in one list erases the distinction the user named. |
| **Empty-state silence (ADR-055 spirit)** | If a musician has zero lecdems-by and zero lecdems-about, the section MUST be absent entirely — no "Lecdems (0)" header. A dead header pollutes the panel and weakens the "lecdems are rare" signal. |
| **One-sided presence is normal** | A lecturer with no lecdems about them (only by them), and a venerated subject with lecdems about them but none by them, are both legitimate states. Each subsection appears independently. |
| **Lecturer attribution is essential in "about"** | In "Lecdems about", the lecturer is part of the discovery payload — a rasika sees that *Aruna Sairam* lectures on MD Ramanathan, and may follow Aruna Sairam from there. The chip must therefore carry the lecturer name (per ADR-079 §6). |
| **Subject attribution is desirable in "by"** | In "Lecdems by", the subject(s) are the discovery payload — a user browsing TM Krishna sees a lecdem on three ragas and a separate lecdem on a single musician. Subject chips appear *adjacent to* the lecdem chip, not inside it. |
| **Non-blocking placement** | Lecdems are rare. The section should not push concerts/singles/compositions further down for the 90% of nodes that have none. Bottom-of-panel placement is natural. |

---

## Pattern

**Levels of Scale**. The panel's vertical axis is a hierarchy of registers: events (concerts, singles) → works (compositions) → reflection (lecdems). Each level deepens the relationship to the musician.

**Strong Centres of unequal frequency**. Concerts are dense, singles are common, compositions are scarcer, lecdems are rare. The panel's structure must *preserve* this gradient — not flatten it. A rare item gets a small, late slot; a dense item gets a primary slot near the top.

**Light on Two Sides** (Pattern 159). Each lecdem in the panel is illuminated from two directions: by the section header (which says *who lectured* and *to/about whom*) and by the row content (which says *what subjects* the lecdem covers). Neither alone is enough.

---

## Decision

### 1 — New panel ordering

```
1. Header
2. Concerts
3. Singles
4. Compositions
5. Lecdems            ← NEW (omitted if both subsections are empty)
   5a. Lecdems by {this musician}        — present iff lecdemsBy[node.id]?.length
   5b. Lecdems about {this musician}     — present iff lecdemsAboutMusician[node.id]?.length
```

The Lecdems section is structurally last because it is the rarest register. A musician with five concerts and three lecdems sees the concerts above the fold; the lecdems wait for a deliberate scroll.

### 2 — Section markup

The outer section reuses the existing `.comp-section` shell from ADR-059 (a header band + a body) so visual rhythm is consistent with Compositions:

```html
<section class="lecdem-section" data-section="lecdems">
  <div class="lecdem-section-header">Lecdems</div>

  <!-- 5a — present only if non-empty -->
  <div class="lecdem-subsection" data-subsection="by">
    <div class="lecdem-subsection-header">Lecdems by {label}</div>
    <ul class="lecdem-list">
      <li class="lecdem-row">
        <span class="lecdem-chip" data-video-id="…">Lec-dem on Manodharma</span>
        <!-- subject chips, only present when the lecdem has subjects -->
        <span class="lecdem-subjects">
          <span class="raga-chip">Surutti</span>
          <span class="raga-chip">Kedaragowla</span>
        </span>
      </li>
      …
    </ul>
  </div>

  <!-- 5b — present only if non-empty -->
  <div class="lecdem-subsection" data-subsection="about">
    <div class="lecdem-subsection-header">Lecdems about {label}</div>
    <ul class="lecdem-list">
      <li class="lecdem-row">
        <span class="lecdem-chip" data-video-id="…">Lec-dem on MDR's bani</span>
        <span class="lecdem-by">— Aruna Sairam</span>          <!-- lecturer attribution -->
      </li>
      …
    </ul>
  </div>
</section>
```

### 3 — Subsection visibility rules

| `lecdemsBy[node.id]` | `lecdemsAboutMusician[node.id]` | Section state |
|---|---|---|
| empty/absent | empty/absent | **Whole `<section>` omitted** (ADR-055 spirit; no dead headers) |
| non-empty | empty/absent | Section present; only "Lecdems by" subsection rendered |
| empty/absent | non-empty | Section present; only "Lecdems about" subsection rendered |
| non-empty | non-empty | Both subsections rendered, in the order above |

The outer "Lecdems" section header is rendered iff *either* subsection is rendered. When only one subsection is present, the section header is still useful as a register-anchor: it tells the user the entire lecdem layer for this musician fits in one subsection.

### 4 — Row-level rendering rules

Each row is a single lecdem, rendered as one `.lecdem-chip` (per ADR-079) plus contextual annotations:

**In "Lecdems by":**
- Primary: the lecdem chip (its label is the lecdem title).
- Adjacent (`.lecdem-subjects`): zero or more subject chips, in the order `raga_ids[]`, `composition_ids[]`, `musician_ids[]`. Each subject chip uses the entity's standard chip class (`.raga-chip` etc.) and triggers that entity's standard click action.
- A lecdem with empty `subjects` (the "Manodharma" case) renders as a bare lecdem chip with no `.lecdem-subjects` strip. This is the only place in the entire UI such a lecdem is visible.

**In "Lecdems about":**
- Primary: the lecdem chip.
- Adjacent (`.lecdem-by`): the lecturer attribution as plain text "— {lecturer label}". The lecturer's name is rendered as a clickable link (a small `.musician-chip` is *not* used here because that would create chip-on-chip visual noise; the inline attribution suffices and matches ADR-074's label-chip parity philosophy).
- Adjacent (`.lecdem-subjects`): the *other* subjects of the lecdem (i.e., subjects other than the current node) are rendered as cross-link chips, exactly as in "Lecdems by". Example: a lecdem about MD Ramanathan that also discusses Khambhoji renders the Khambhoji chip alongside.

### 5 — Sorting within each subsection

- Within "Lecdems by": sorted by `year` descending (most recent lecdem first), with year-less entries appended last in label-alphabetical order. Same convention as the singles list.
- Within "Lecdems about": sorted alphabetically by lecturer label. The expectation is that the same lecturer may have multiple lecdems about a subject; grouping by lecturer reads better than scattering by year.

### 6 — Click and history behaviour

- A click on a `.lecdem-chip` opens the media player on the lecdem (per ADR-079 §4).
- A click on a subject chip (a `.raga-chip` inside a lecdem row, etc.) follows that entity's standard click action — opens the corresponding panel and pushes onto panel history (ADR-067). The lecdem-chip click does NOT push panel history (the player opens; the panel state is unchanged).

### 7 — Empty-data behaviour at render time

The renderer checks `lecdemsBy[nodeId]?.length` and `lecdemsAboutMusician[nodeId]?.length` (both globals from ADR-078). If both falsy, the entire section is skipped. No empty `<section>` element is emitted to the DOM.

---

## Consequences

### Positive

- **Authorship and reception are visually separated**: a user sees at a glance that TM Krishna *gives* lecdems on Manodharma and that Aruna Sairam *gives lecdems about* him. Two distinct facts in two distinct slots.
- **The empty-state silence preserves the "lecdems are rare" signal**: 90% of musician panels have no Lecdems section at all. When the section appears, it earns the user's attention.
- **No layout disruption to the dense top of panel**: concerts/singles/compositions stay where they are. Lecdems are additive, not displacing.
- **Subject chips inside lecdem rows make the panel a discovery hub**: clicking a raga chip inside a lecdem row navigates to that raga's panel — exactly the cross-pollination ADR-081 also promises on the bani-flow side.

### Negative / accepted tradeoffs

- **A musician who is exclusively a lecturer with no concerts/singles/compositions** will have a panel that opens with the Lecdems section visible only after scroll (because the empty Concerts/Singles/Compositions sections also disappear under ADR-055 logic, the Lecdems section bubbles up). This is acceptable; such a node is rare and the panel still reads correctly.
- **Lecturer attribution as inline text, not a chip**, slightly understates the lecturer relative to the lecdem. Accepted: the lecdem is the row's primary subject; the lecturer is a secondary cue. Promoting the lecturer to a `.musician-chip` would crowd the row and dilute the lecdem chip's primacy.

### Risks

- **A lecturer with many lecdems-about themselves becomes a long list.** Mitigated by alphabetical-by-lecturer grouping (§5) so the user can scan by lecturer name. If a single subject accumulates >20 lecdems-about (unlikely in the Carnatic corpus), a future ADR can introduce per-lecturer collapse — out of scope here.

---

## Implementation

1. **`carnatic/render/templates/media_player.js`** (Coder)
   - In `buildRecordingsList(nd)` — after the Compositions section (existing section 3 from ADR-059) — emit the Lecdems section per §2–§3 above.
   - Read `lecdemsBy[nd.id]` and `lecdemsAboutMusician[nd.id]` (globals from ADR-078).
   - Sort per §5; render rows per §4; bind clicks per §6.

2. **`carnatic/render/templates/base.html`** (Coder)
   - Add CSS for `.lecdem-section`, `.lecdem-section-header`, `.lecdem-subsection`, `.lecdem-subsection-header`, `.lecdem-list`, `.lecdem-row`, `.lecdem-by`, `.lecdem-subjects`. Reuse `.comp-section`-family typography and spacing tokens (ADR-028).

3. **No data changes** (Librarian)
   - This ADR is render-only; the data layer is supplied by ADR-077.

4. **Verification**
   - Sandbox: a musician with one lecdem-by (subjects = two ragas) and zero lecdems-about → Lecdems section appears; only the "Lecdems by" subsection renders; row shows lecdem chip + two raga chips.
   - Sandbox: a musician with zero lecdems-by and one lecdem-about (lecturer = different musician) → Lecdems section appears; only the "Lecdems about" subsection renders; row shows lecdem chip + "— {lecturer label}" attribution.
   - Sandbox: a musician with zero of each → no Lecdems section in the DOM (verify via browser inspector).
   - Click a lecdem chip → media player opens with the lecdem. Click a subject raga chip in the row → raga panel opens and panel history is pushed.
