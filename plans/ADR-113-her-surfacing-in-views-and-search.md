# ADR-113: Surfacing Hindustani Equivalent Ragas in Search, Bani Flow Panel, and Mela View

**Status:** Accepted
**Date:** 2026-04-27

---

## Context

ADR-112 establishes Hindustani Equivalent Ragas (HERs) as first-class raga objects
with `tradition: "hindustani"`, linked from Carnatic ragas via
`hindustani_equivalents`. That ADR is dark-launched: the data model is in place
but no view surfaces it. This ADR turns on the view layer.

### What the rasika should see

Three concrete journeys must work end-to-end:

1. **Direct HER search.** The rasika types "Malkauns" into the Bani Flow search
   bar. Malkauns appears at the top of the results — not buried under Carnatic
   matches. The result chip is visually distinct (different colour) and labels
   itself with its Carnatic twin: *Malkauns · Hindustani · ↔ Hindolam*.

2. **Carnatic raga lookup → HER chip.** The rasika searches "Hindolam" or clicks
   it from anywhere in the graph. The Bani Flow panel opens for Hindolam and shows
   — alongside aliases, mela, cakra, janyas — a clearly-coloured HER chip:
   *↔ Malkauns (Hindustani)*. Clicking it re-anchors the panel on Malkauns.

3. **Mela view → janyas + their HERs.** The rasika opens Mela 20 (Natabhairavi)
   and sees its janyas. Each janya that has an HER shows the HER as a small
   secondary chip below or beside the janya chip. Hindolam shows Malkauns;
   Madhyamavati shows Madhumad Sarang; etc.

### What's missing in the view layer

The Bani Flow panel ([`carnatic/render/templates/`](../carnatic/render/templates/))
currently builds a raga subject header (ADR-020), an aliases row, and a
mela/cakra/janyas navigation row (ADR-022). None of these consume
`hindustani_equivalents`. The search ranker (the panel search bar, populated by
ADR-002 / ADR-007 work) currently filters only over Carnatic raga `name` /
`aliases` and does not weight `tradition: "hindustani"` results separately.

The Mela view (the layout that lists a melakarta's janyas, refined through
ADR-021 / ADR-022 / ADR-106) renders janya chips uniformly. It has no concept of
a "secondary chip" beneath a janya.

### Why this is its own ADR, separate from ADR-112

ADR-112 is a data-model commitment that survives any UI iteration. ADR-113 is a
view commitment that may need to evolve as the HER catalogue grows from 3 to 30
to 100. Splitting them lets ADR-113 be revisited without touching the schema.

---

## Forces in tension

1. **Visibility without dilution.** HER chips must be unmistakeably visible —
   different colour, labelled "Hindustani" — but not so loud that they overwhelm
   the Carnatic centre of the panel.

2. **Search transparency.** A rasika who searches "Malkauns" wants Malkauns
   first. A rasika who searches "Kharaharapriya" does not want a Hindustani
   distraction at the top. Search ranking must depend on the query, not on a
   global "show all" toggle.

3. **Symmetric chip parity.** The HER chip on a Carnatic raga's panel and the
   "Carnatic twin" chip on an HER's panel must look like mirror images of each
   other. A rasika should be able to ping-pong between Hindolam ↔ Malkauns
   without the affordance changing shape.

4. **Mela view scalability.** When a mela has many janyas (Kharaharapriya has
   20+), adding HER chips beneath some of them risks visual congestion. The
   secondary HER chip must be smaller and/or visually subordinate, never dominant.

5. **Single-click access.** Every HER chip is a navigation target. Clicking it
   anchors the panel on the HER, the same way clicking a janya anchors on the
   janya. No modal, no detour.

6. **Honour the boundary.** When a panel is anchored on an HER, the panel must
   make clear *this is Hindustani* — not just by colour but by an explicit label
   in the subject header. The rasika should never wonder which tradition they are
   looking at.

---

## Pattern

### **Boundaries** (Alexander, Pattern 13) and **Strong Centres** (Pattern 1)

The HER chip is a *boundary marker*. It signals "you are about to step into a
neighbouring tradition". Its distinct colour and explicit `Hindustani` label
make the boundary visible without preventing crossing.

### **Levels of Scale** (Pattern 5)

The Mela view already runs Cakra → Mela → Janya. The HER chip introduces a
fourth, *lateral* level: each Janya may have a sibling outside the Carnatic
hierarchy. Visually, the HER chip is smaller than the Janya chip — it sits at a
finer level of scale, signalling its lateral (not hierarchical) relationship.

### **Symmetric Mirrored Affordances**

The Carnatic→HER and HER→Carnatic transitions must be mirror images. Same chip
shape, same icon (a bidirectional arrow `↔`), same click-to-anchor behaviour.
This is the principle that lets a rasika move between the two traditions
fluently.

---

## Decision

### 1. Visual language — colour and chip shape

| element | Carnatic raga | HER (Hindustani) |
|---|---|---|
| Chip background | existing raga chip colour (yellow-ish) | distinct cool colour — proposed `--her-chip-bg: #5a7da3` (muted slate-blue) |
| Chip text | existing raga text colour | white or near-white for contrast |
| Border / accent | none | thin border in `--her-chip-accent: #8fb4d8` |
| Icon prefix | none | `↔` (U+2194 left-right arrow) signalling bidirectional equivalence |
| Tradition label | implicit (Carnatic is the default) | explicit `Hindustani` label inside or beneath the chip |

The exact CSS values are negotiable during Coder implementation; the *contract*
this ADR fixes is: **HER chips use a cool colour family (blue/slate) that
visually contrasts with the warm Carnatic palette, and they carry an explicit
`Hindustani` label**.

### 2. Bani Flow panel — Carnatic raga view

When the panel is anchored on a Carnatic raga that has
`hindustani_equivalents.length > 0`, render an additional row beneath the
existing mela/cakra/janyas row:

```
[ Hindolam · Mela 20 · Cakra 4 ]
also: Hindola, Hindholam
Mela: Natabhairavi   Cakra: Veda
Janyas: (none — Hindolam is itself a janya)

Hindustani equivalents:
  ↔ [ Malkauns ]   ← cool-colour chip, click to re-anchor
```

The "Hindustani equivalents" label is rendered in the same muted cool colour as
the chip, signalling the boundary without shouting. If a Carnatic raga has more
than one HER, all are rendered as siblings in this row.

### 3. Bani Flow panel — HER view

When the panel is anchored on an HER (the rasika clicked an HER chip, or
searched directly for it), the subject header is rendered with:

- Raga name in the same prominent style as a Carnatic raga
- A *prefix tag*: `[Hindustani]` rendered in the cool HER colour, immediately
  before the name
- Wikipedia link icon as for any raga
- Sub-row replaces "Mela / Cakra / Janyas" with: **Thaat:** *Bhairavi* (if
  known) and **Carnatic equivalents:** chip(s) in the warm Carnatic palette,
  pointing back to Hindolam / etc.
- Aliases row works as for any raga
- Recordings list (see §5) lists HER recordings curated for this raga

The panel for an HER is structurally the *mirror* of the panel for a Carnatic
raga. Anything missing on one side (e.g. mela for HER, thaat for Carnatic) is
simply omitted.

### 4. Mela view — janyas with HER secondary chips

When the Mela view (ADR-021 / ADR-022) renders a mela's janyas, each janya chip
that has at least one HER shows a smaller secondary chip beneath (or to the
right of) it:

```
[ Hindolam ]
   ↔ Malkauns        ← smaller, cool-colour, clickable
[ Reetigowla ]
[ Abheri ]
[ Madhyamavati ]
   ↔ Madhumad Sarang
...
```

The secondary chip is roughly 70–80 % of the janya chip's size, sits visually
attached to its parent janya, and clicks anchor the Bani Flow panel on the HER
(per §3). Janyas without an HER render as today.

### 5. HER recordings — display

HER recordings (from ADR-112 §4, with `composition_ids: []` and
`kind: "raga_alap"` permitted) render in the Bani Flow panel under an HER chip
as a flat list of YouTube cards, each labelled with:

- Musician name
- Recording label (e.g. "Raga Malkauns — alap, jor, jhala")
- Duration (if available)
- A small `[Hindustani]` tag in the HER cool colour

They are **not grouped by composition** (because there is none). They are
**not grouped by concert** in this ADR — concert grouping (ADR-018) remains
Carnatic-only for now. A future ADR may extend concert grouping to Hindustani if
the catalogue warrants it.

### 6. Search ranking — HER awareness

The Bani Flow panel search bar (and any other raga search surface) ranks
results by:

1. **Exact match on raga name (any tradition)** — top.
2. **Exact match on alias (any tradition)** — second.
3. **Phonetic match on raga name (any tradition)** — third (per ADR-017).
4. **Substring match** — fourth.

Within each tier, **Carnatic and Hindustani results are interleaved by score,
not segregated.** A search for "Malkauns" returns Malkauns at rank 1; a search
for "Kharaharapriya" returns Kharaharapriya at rank 1 with no HER intrusion at
the top.

The HER chip in search results carries the same cool colour and `↔ <Carnatic
twin>` label as elsewhere. Hovering the result reveals the Carnatic twin name as
a tooltip; clicking anchors the panel on the HER.

**No global "hide Hindustani" toggle.** The boundary is a feature, not a
distraction. Users who don't want HER results simply don't search for them.

### 7. Tutorial and help-deck integration

A single help-deck card (per ADR-098 / ADR-102) introduces HERs:

> **Hindustani Equivalent Ragas.** Some Carnatic ragas share their swaras with
> a Hindustani counterpart that sounds entirely different. Look for the cool
> blue chip with `↔` — click it to hear the same swaras inhabited by another
> tradition.

Card copy is owned by the Architect; visual implementation owned by the Coder.

---

## Consequences

### Positive

- The HER feature becomes legible to a rasika in three clicks: search Hindolam →
  see HER chip → click Malkauns → hear the difference.
- The cool-colour palette establishes a visual grammar for "neighbouring
  tradition" that can be reused for any future cross-tradition feature
  (e.g. Western art-music equivalents, ragas in folk traditions) without
  re-inventing the language.
- Search remains a single bar with a single ranking model — no UI complexity
  for the user, no mode switch.
- The Mela view's secondary HER chips make the equivalence discoverable for
  rasikas who weren't searching for it — a serendipity affordance.

### Negative / risks

- **Visual congestion in the Mela view.** Melas with many HER-tagged janyas
  may feel busy. Mitigation: the secondary chip is small; if the catalogue
  grows past ~50 HERs and Mela views become cluttered, a follow-up ADR can
  introduce a Mela-view filter ("hide HER siblings").
- **Search ranking edge cases.** If a Hindustani raga shares a name fragment
  with a Carnatic raga (e.g. "Bhairavi" exists in both traditions), tier-1 exact
  matches will return both, and the rasika must distinguish them by the chip
  colour. This is a feature: it surfaces a real ambiguity in the swara universe
  rather than hiding it.
- **Colour contrast accessibility.** The cool chip colour must meet WCAG AA
  contrast against its background and against text. Coder must verify during
  implementation.

### Neutral

- Help-deck card adds one more concept to the tutorial. Acceptable scope cost.

---

## Implementation

This ADR is doc-only. Implementation depends on ADR-112 being Accepted and
implemented. Sequence:

1. **Coder** (after ADR-112 implementation lands):
   - Define CSS variables `--her-chip-bg`, `--her-chip-accent`, `--her-chip-text`.
     Verify WCAG AA contrast.
   - Extend the Bani Flow panel raga branch
     ([`carnatic/render/templates/`](../carnatic/render/templates/)) to:
     - Render the "Hindustani equivalents" row when
       `raga.hindustani_equivalents.length > 0`.
     - Render the HER subject header variant (with `[Hindustani]` prefix tag
       and `Carnatic equivalents` chip row) when the anchored raga has
       `tradition == "hindustani"`.
   - Extend the Mela view to render secondary HER chips beneath janyas.
   - Extend the search ranker to include `tradition: "hindustani"` ragas with
     the ranking rules in §6.
   - Add the help-deck card text supplied by the Architect.

2. **Coder** (verification):
   - Run `bani-render`.
   - Manual smoke-test the three journeys in §Context.
   - Verify keyboard navigation works for HER chips (focus ring visible in cool
     colour).

3. **Librarian** (after view layer ships):
   - Tag any additional HER pairs the Architect / user prioritise.
   - Curate seed HER recordings via `add-her-recording` (musicians from ADR-114).

UI work is testable once the three seed pairs (Malkauns/Hindolam,
Madhumad Sarang/Madhyamavati, Shudh Bhairavi/Thodi) from ADR-112 are present.

---

## Related ADRs

- ADR-002, ADR-007 — Search bar architecture (HER ranking extends these)
- ADR-017 — Phonetic search (auto-extends to HER aliases)
- ADR-018 — Concert-bracketed recording groups (intentionally NOT extended to HER)
- ADR-020 — Raga subject header (extended for HER prefix tag)
- ADR-021 — Melakarta first-class citizens (Mela view is the host for §4)
- ADR-022 — Raga panel navigability (extended for §2 HER row)
- ADR-098 — Help-deck (HER card lives here)
- ADR-112 — HER schema (this ADR's prerequisite)
- ADR-114 — HER musicians and instrument expansion (parallel)
