# ADR-081: Bani-Flow Lecdem Surfacing & the Discoverability Invariant

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-002 (dual search boxes), ADR-008 (era-instrument topbar filters), ADR-017 (phonetic search), ADR-022 (raga panel navigability), ADR-061 (tree-structured bani-flow trail), ADR-072 (search-subject prominence), ADR-078 (lecdem render indexes), ADR-079 (lecdem chip), ADR-080 (musician panel lecdem sections)

---

## Context

### The two surfaces lecdems must reach (and the one they must not)

ADR-080 wires lecdems into the **Musician panel** (right). Two of the three lecdem subject types — *raga* and *composition* — are surfaced in a different panel: the **Bani Flow panel** (left), which is the home of raga-anchored and composition-anchored exploration. A rasika who searches "Surutti" and lands on the Surutti trail must encounter any lecdem that discusses Surutti — that is the moment of discovery the user names in scratch.md item 5.

There is also a third surface lecdems must NOT reach: **the global search box and the topbar filter system**. Item 9 of scratch.md is unusually emphatic:

> *"Lecdems cannot be looked up, they can only be discovered! This is the fun of it actually: users stumble upon them when they are searching for ragas, composition, and/or musicians. We want to preserve the excitement of discovering these."*

This is a deliberate scarcity choice. A lecdem that appears in the global search dropdown becomes an item to fetch; a lecdem that appears only in panels you arrive at by other paths becomes a treasure you find. The schema (ADR-077) and indexes (ADR-078) are the same in both designs — the difference is purely in *which surfaces consume the indexes*. This ADR draws the boundary.

### Why the bani-flow panel is the right surface for raga/composition lecdems

The Bani Flow panel already presents a **trail** of musicians who have rendered the current subject (raga or composition). It is built around the question *"who has interpreted this?"* A lecdem extends this question into a parallel register: *"who has explained this?"* The two registers belong on the same panel because they share the subject; they belong in distinct strips because they answer different questions.

### Forces

| Force | Direction |
|---|---|
| **Discovery, not lookup** | Lecdems must appear *as a consequence of* navigating to a raga or composition, never as an autonomous search target. |
| **Not a topbar filter** | Era and instrument filters (ADR-008) operate on graph nodes. Adding a "Lecdems" filter would advertise lecdems as a thing you can opt into — exactly the lookup behaviour we are forbidding. |
| **Strip placement, not list interleaving** | A lecdem belongs near the trail but not within it. Mixing lecdem chips into the musician trail rows would conflate "rendered this" with "explained this" — two different relationships. |
| **Subject-anchored, not lecturer-anchored** | On the bani-flow panel, the subject is the raga/composition. Lecdem chips here surface the *lecturer* as the secondary attribution, mirroring ADR-080's "Lecdems about" pattern. |
| **Empty-state silence** | A raga with zero lecdems gets no strip at all (no "Lecdems (0)" header). Same rule as ADR-080. |
| **One strip per panel mode** | The bani-flow panel has two trail-driving subjects (raga and composition). Each gets its own lecdem strip when active. They are mutually exclusive; only one strip is ever visible. |

---

## Pattern

**Strong Centres of multiple registers** (Alexander, *The Nature of Order*). The trail subject (raga / composition) is the panel's strong centre. The trail of performers is one register orbiting that centre. The lecdem strip is a second register orbiting the same centre — equal in dignity, distinct in question.

**Boundary as Filter** (echoing ADR-077). The discoverability boundary lives at the search-and-filter layer: the indexes are public to panels but invisible to searches. One design decision, enforced in two places (search index, filter chip set).

**Light on Two Sides** (Pattern 159). The lecdem strip illuminates the subject from a second direction: the trail tells you *who plays it*; the strip tells you *who explains it*. Two lights, one room.

---

## Decision

### 1 — Lecdem strip in the Bani Flow panel

When the Bani Flow trail subject is a **raga** or a **composition**, a `<section class="lecdem-strip">` is rendered immediately below the subject header (`#bani-subject-name` per ADR-072) and **above** the existing trail tree (ADR-061). Placement above the trail signals that the strip is part of the subject's framing, not a footnote to it.

```
┌─ Bani Flow Panel ─────────────────────────────┐
│ [ Subject chip: Surutti ]                     │  ← #bani-subject-name (ADR-072)
│                                               │
│ ╭ Lecdem strip ────────────────────────────╮  │  ← NEW (this ADR)
│ │ Lecdems on Surutti                       │  │
│ │   [lecdem chip] — TM Krishna             │  │
│ │   [lecdem chip] — Sanjay Subrahmanyan    │  │
│ ╰──────────────────────────────────────────╯  │
│                                               │
│ ── Trail ─────────────────────────────────    │  ← existing tree (ADR-061)
│ ▾ Composition: Endaro …                       │
│   • Artist A                                  │
│   • Artist B                                  │
│ ▾ Composition: …                              │
└───────────────────────────────────────────────┘
```

The strip is omitted entirely when:
- The trail subject is a **musician** (lecdems-about-musicians live in the Musician panel per ADR-080, not here).
- The active raga/composition has no entry in the relevant index (`lecdemsAboutRaga[id]` / `lecdemsAboutComposition[id]` is empty or absent).

### 2 — Strip header text

| Subject type | Header text |
|---|---|
| Raga | `Lecdems on {raga.name}` |
| Composition | `Lecdems on {composition.title}` |

The verb "on" was chosen over "about" because it reads as more natural-language for the raga/composition register ("a lecdem on Bhairavi") and reserves "about" for the musician register where it reads more naturally ("a lecdem about MD Ramanathan", per ADR-080).

### 3 — Row content

Each row is one lecdem, rendered identically to the "Lecdems about" rows in ADR-080 §4:

```html
<li class="lecdem-row">
  <span class="lecdem-chip" data-video-id="…">{ref.label}</span>
  <span class="lecdem-by">— {lecturer label}</span>
  <span class="lecdem-subjects">
    <!-- the OTHER subjects of this lecdem (excluding the current trail subject) -->
    <span class="raga-chip">…</span>
    <span class="comp-chip">…</span>
    <span class="musician-chip">…</span>
  </span>
</li>
```

The current trail subject is always omitted from the `.lecdem-subjects` strip — it is already the panel header. Showing it again would be visual noise.

### 4 — Sorting within the strip

Sorted alphabetically by lecturer label (matching the "Lecdems about" rule from ADR-080 §5). This makes scrolling predictable and gives lecturers their natural surface.

### 5 — Click behaviour

- Lecdem chip click: opens the media player on the lecdem (per ADR-079 §4).
- Lecturer name click: opens that musician's panel (and pushes panel history per ADR-067).
- Cross-link subject chip click: navigates to that subject's panel (and pushes panel history). Clicking another raga in a Surutti-strip lecdem row, for example, hops to Narayana Gowla.

### 6 — The discoverability invariant — what lecdems are NOT

This is the heart of the ADR. It draws three negative boundaries that a future agent might be tempted to violate.

#### 6a — Global search index excludes lecdems

The global search box (ADR-002) builds its result set from `nodes`, `ragas`, `compositions`, `composers`, and `recordings`. **Lecdems are never indexed for global search.** A user typing "lecdem" or "lec-dem" or part of a lecdem label gets zero results from the search box. The search box is for entities that are first-class *destinations*; a lecdem is a first-class *encounter*.

The search index build (in `carnatic/render/data_transforms.py`'s search-index function and the `entry_forms.js` combobox sources) MUST NOT walk `youtube[]` entries with `kind === "lecdem"` for either the global search or any combobox in the entry forms (ADR-082 forms separately gate on `kind`).

The phonetic-search transliteration layer (ADR-017) inherits this exclusion automatically — it operates on the same index.

#### 6b — Topbar filter system excludes lecdems

The topbar filter chips (ADR-008) include era, instrument, and other faceted filters on graph nodes. **No "Lecdems" filter chip exists.** No filter dropdown lets the user "show only musicians who give lecdems" or "show only ragas with lecdems". The graph canvas has no awareness of lecdems at all (per ADR-079 §5).

#### 6c — No deep-link to a single lecdem

The application does not produce or consume URLs of the form `?lecdem=<video_id>`. A lecdem can only be *encountered* by navigating to its lecturer (Musician panel), to a subject musician (ADR-080 "Lecdems about"), or to a subject raga/composition (this ADR's strip). Sharing the encounter requires sharing the *subject* URL.

This last point is the most aggressive negative boundary. Without it, a determined user could bookmark a lecdem and turn the encounter into a lookup. Maintaining the invariant means the only first-class URL is the URL of the *subject*; the lecdem is always one click downstream.

### 7 — Mobile behaviour

The bottom drawer on mobile (ADR-034) hosts the Bani Flow panel. The lecdem strip appears in the same position relative to the subject header — above the trail tree — and folds into the drawer's natural scroll. No mobile-specific affordance is required; the strip uses the same `.lecdem-row` geometry as desktop. If the drawer is in its half-height state, the strip is visible iff the subject header is visible (above-the-fold rule from ADR-037 carries over).

---

## Consequences

### Positive

- **Discovery happens at the moment of subject inquiry**: a rasika navigating to Surutti finds the lecdem on it without having asked to look. The "stumble upon" experience the user named is preserved.
- **The encounter ladder is uniform**: lecdems appear in three places (musician-by, musician-about, subject-strip), each surfaced by navigating to the relevant subject. No global affordance shortcuts the navigation.
- **The bani-flow trail is unmodified**: existing performers/compositions tree (ADR-061) is untouched. The strip is purely additive.
- **The discoverability invariant is testable**: §6a–§6c are concrete prohibitions that can be checked by inspecting the search-index builder, the filter-chip set, and the URL parser. A regression that re-introduces lecdems into search would fail a simple grep test.

### Negative / accepted tradeoffs

- **No way to enumerate "all lecdems in the corpus"**: a curator who wants to QA lecdem coverage cannot do so from the UI. They must use the CLI (a future `python3 carnatic/cli.py list-lecdems` command would be appropriate, but it lives outside the user-facing application). Accepted in service of the discoverability principle.
- **Lecturer search yields no lecdem results**: typing "TM Krishna" in the search box returns the musician node but never their lecdems. A user must click through to TM Krishna's panel to see them. This is the design.
- **A composition with many lecdems shifts the trail downward**: on a verbose subject, the strip can push the first trail row below the fold. Mitigated by the "lecdems are rare" tradition (most subjects have 0–2). If a subject ever accumulates >5 lecdems, an ADR-future collapse-to-N affordance can be introduced.

### Risks

- **A future contributor adds lecdems to the search index in good faith** (it would feel like a usability improvement). Mitigated by:
  1. A code comment at the search-index build site referencing this ADR.
  2. The negative test (§Implementation step 5) that fails if a lecdem entry leaks into the search index.
- **The topbar filter UI tempts a "lecdems only" toggle in a future redesign.** Mitigated by the same code-comment + test pattern at the filter-chip definition.

---

## Implementation

1. **`carnatic/render/templates/bani_flow.js`** (Coder)
   - In the trail-rendering function — after the subject header is set and before the trail tree is built — emit the lecdem strip per §1–§3, gated on:
     - subject type ∈ {raga, composition}
     - `lecdemsAboutRaga[subjectId]?.length` or `lecdemsAboutComposition[subjectId]?.length`
   - Reuse `.lecdem-row` / `.lecdem-chip` / `.lecdem-by` / `.lecdem-subjects` CSS from ADR-079, ADR-080.

2. **`carnatic/render/data_transforms.py`** — search index (Coder)
   - In the function that builds the global search index (and any combobox source feeding `entry_forms.js` searchable lists), add the `if entry.get("kind") == "lecdem": continue` guard.
   - Add a comment at the call site referencing ADR-081 §6a.

3. **`carnatic/render/templates/topbar.js`** (Coder)
   - **No change.** Verify that no existing code path adds a "lecdem" filter chip; add a one-line comment near the filter-chip array referencing ADR-081 §6b.

4. **`carnatic/render/templates/base.html`** (Coder)
   - Add CSS for `.lecdem-strip` (the section wrapper) reusing `.lecdem-row` and family from ADR-080.

5. **Verification**
   - Sandbox: add a lecdem with `subjects.raga_ids = ["surutti"]`. Render. Navigate Bani Flow to Surutti → strip appears above trail with one row. Navigate to a raga with no lecdems → no strip in DOM.
   - Type "lec" / part of the lecdem label / lecturer name into the global search → confirm zero lecdem-derived results.
   - Inspect topbar filter chips → confirm no "lecdem" chip exists.
   - Click the lecdem chip → media player opens. Click another raga subject in the strip row → bani-flow trail switches subject and pushes history.
   - Mobile: open the bottom drawer on a raga with lecdems → strip appears above the trail.
