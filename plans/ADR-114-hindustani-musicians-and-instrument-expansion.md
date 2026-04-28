# ADR-114: Hindustani Musicians and Instrument Vocabulary Expansion

**Status:** Accepted
**Date:** 2026-04-27

---

## Context

ADR-112 introduces Hindustani Equivalent Ragas. ADR-113 surfaces them in the
view layer. Both presuppose that the *musicians* who perform HER recordings can
be represented in the graph. Today, they cannot — at least not faithfully.

### What's missing in the musician model

The musician schema ([`carnatic/data/musicians/*.json`](../carnatic/data/musicians/))
uses a single `instrument` field that today resolves to one of nine values across
the catalogue:

```
bharatanatyam, flute, ghatam, gottuvadyam, khanjira,
mridangam, veena, violin, vocal
```

There is **no `sitar`**, **no `sarod`**, no `bansuri`, no `tabla`. There is also
no way to tag a musician as belonging to the Hindustani tradition — every
musician is implicitly Carnatic. This means:

- An HER recording of Malkauns by Nikhil Banerjee cannot be added without either
  fabricating a misleading `instrument: "veena"` or extending the vocabulary.
- A musician who performs in *both* traditions (e.g. Sriram Parasuram, who has
  done extensive Carnatic-Hindustani comparative lecdems — see
  [`carnatic/data/musicians/sriram_parasuram.json`](../carnatic/data/musicians/sriram_parasuram.json))
  has no way to declare dual-tradition fluency.
- The era/instrument top-bar filters (ADR-008) cannot offer a Hindustani filter
  because the data does not encode the distinction.

### Why this is its own ADR

ADR-112 deliberately scoped *raga* concerns and ADR-113 deliberately scoped
*view* concerns. The musician/instrument concern is its own axis: it touches a
different file (`musicians/*.json`), a different write command (`add-musician`),
a different validator branch, and a different filter surface (top-bar). Bundling
it into ADR-112 would have inflated the schema ADR; bundling it into ADR-113
would have entangled view work with data work. Splitting it lets each ADR be
implemented and reviewed independently.

---

## Forces in tension

1. **Vocabulary discipline.** The `instrument` field is currently a flat
   enumerated string with implicit Carnatic semantics. Expanding it
   carelessly (e.g. adding `"hindustani_vocal"` as a peer of `"vocal"`) would
   conflate *what the musician plays* with *which tradition they play in* and
   fragment the filter surface.

2. **Cross-tradition musicians are real.** Sriram Parasuram, Lalgudi
   Krishnan's collaborations, U Srinivas's mandolin work bordering both
   traditions — these are not edge cases. The schema must support a musician
   who is genuinely fluent in both.

3. **HER curation must not require deep Hindustani biographies.** The
   Librarian's job is to illuminate Carnatic ragas via HER, not to maintain a
   Hindustani Wikipedia clone. A Hindustani musician added solely to host an
   HER recording should require minimal metadata — a Wikipedia URL, the
   instrument, the tradition tag — without forcing guru-shishya lineage
   curation in a tradition we are not modelling structurally.

4. **Backward compatibility.** All existing musician files must continue to
   validate with no edits. Migration backfills `tradition` and any new optional
   fields with defaults.

5. **Filter surface clarity.** The era/instrument top bar (ADR-008) must remain
   readable. Adding 10 new instruments at once would clutter it. The top-bar
   filter exposes only instruments with at least one musician in the catalogue
   (data-driven), so there is no risk of empty buttons — but the visual
   density needs to be considered.

6. **Lineage edges remain Carnatic-first.** The graph view's guru-shishya edges
   are a Carnatic structural commitment (per CLAUDE.md and the project
   mission). Hindustani musicians may have their own gharana lineages, but this
   ADR does **not** model them as graph edges. They live in the musician's
   `notes` field as prose. A future ADR may revisit this if user demand
   warrants.

---

## Pattern

### **Boundaries** (Alexander, Pattern 13)

The `tradition` field on a musician is the same boundary marker as the
`tradition` field on a raga (ADR-112 §1). Together they form a consistent
boundary language across node types.

### **Strong Centres** (Pattern 1) and the *both/and* principle

A cross-tradition musician is not half-Carnatic and half-Hindustani. They are
a strong centre in both. The schema must let a musician declare *both*
traditions without implying either is primary. This is a *both/and* pattern:
a `traditions` array (plural), not a single `tradition` field.

---

## Decision

### 1. Expand the `instrument` vocabulary

Add the following instrument values to the accepted vocabulary. The validator
(per ADR-016) gains a permissive list; unknown instruments still warn but do
not error.

| New instrument | Tradition typically associated | Notes |
|---|---|---|
| `sitar` | Hindustani | Plucked string. |
| `sarod` | Hindustani | Plucked string. |
| `bansuri` | Hindustani | Bamboo flute. (Carnatic flute remains `flute`; the two are distinct enough instruments to warrant the split.) |
| `tabla` | Hindustani | Percussion. |
| `sarangi` | Hindustani | Bowed string. |
| `surbahar` | Hindustani | Bass sitar; rare but distinct. |

These six cover the headline Hindustani instruments. Vocal is **shared** —
`vocal` already exists and is used for both traditions; tradition is
distinguished by the new `traditions` field on the musician (§3), not by
forking `vocal` into `vocal_carnatic` / `vocal_hindustani`. This keeps the
filter surface clean (one `Vocal` button, with tradition as an orthogonal
filter when ADR-008's top bar gains a tradition control).

`mandolin` is **not** added to the Hindustani-leaning list — U Srinivas
established it as a Carnatic instrument, and the field stays as is. Future
musicians (Carnatic or Hindustani) using mandolin already validate.

### 2. Validator stance — permissive, with warning

The validator's existing instrument check warns on unknown values rather than
erroring (today's behaviour for non-enumerated instruments). The accepted
vocabulary is documented in
[`carnatic/data/READYOU.md`](../carnatic/data/READYOU.md) and consumed by the
top-bar filter (ADR-008) for label rendering. Adding new instruments to the
vocabulary requires:

- A README update by the Librarian or Architect.
- A label-rendering check: the top-bar filter should render the new instrument
  label with a sensible icon or fallback.

### 3. New `traditions` field on the musician schema

Add an optional `traditions` field, an array of strings drawn from
`["carnatic", "hindustani"]`. Default behaviour:

- Existing musicians: backfilled with `["carnatic"]` by the migration script.
- New Carnatic musicians: writer sets `["carnatic"]` automatically.
- New Hindustani musicians: writer sets `["hindustani"]` automatically (see §4).
- Cross-tradition musicians: the Librarian sets
  `["carnatic", "hindustani"]` explicitly.

```json
{
  "id": "nikhil_banerjee",
  "label": "Nikhil Banerjee",
  "traditions": ["hindustani"],
  "instrument": "sitar",
  "born": 1931,
  "died": 1986,
  "era": "modern",
  "bani": null,
  "sources": [
    {
      "url": "https://en.wikipedia.org/wiki/Nikhil_Banerjee",
      "label": "Wikipedia",
      "type": "wikipedia"
    }
  ],
  "youtube": [...]
}
```

The choice of `traditions` (plural) over `tradition` (singular) is deliberate:
it makes cross-tradition fluency a first-class state, not a special case. The
field is the musician-side mirror of ADR-112's raga `tradition` field, with the
extra dimension of multiplicity.

### 4. Writer command — `add-hindustani-musician`

A new write command in [`carnatic/write_cli.py`](../carnatic/write_cli.py):

```
add-hindustani-musician \
  --id <id> --label <label> --instrument <instr> --wiki-url <url> \
  [--born <year>] [--died <year>] [--era <era>] [--also-carnatic]
```

Behaviour:

- Creates `carnatic/data/musicians/<id>.json` with `traditions: ["hindustani"]`.
- If `--also-carnatic` is passed, sets `traditions: ["carnatic", "hindustani"]`.
- Sets `bani: null` (the Carnatic bani concept does not apply).
- Validates instrument against the expanded vocabulary; emits a warning (not
  error) for unknown instruments.
- Idempotent: refuses to overwrite an existing file unless `--force` is passed.

The existing `add-musician` command remains unchanged and continues to default
to `traditions: ["carnatic"]`.

### 5. Lineage edges — explicit non-decision

This ADR **does not model Hindustani gharana lineages as graph edges.** The
guru-shishya edge type remains a Carnatic structural commitment. Rationale:

- The Hindustani gharana system has different semantics (gharana-as-style vs
  Carnatic guru-as-individual), and modelling it as a peer of Carnatic
  guru-shishya would dilute the meaning of both.
- Bani Flow's mission is Carnatic immersion. Hindustani musicians appear in
  the graph to illuminate ragas, not to populate a parallel lineage tree.
- A future ADR may revisit this if the HER catalogue grows large enough that
  lineage-driven discovery within Hindustani becomes valuable.

For now, Hindustani lineage and gharana information lives in the musician's
`notes` field as plain prose — sourced from Wikipedia, not synthesised.

### 6. Top-bar filter behaviour (ADR-008 extension)

The era/instrument top bar (ADR-008) renders one button per instrument that
has at least one musician in the catalogue. With Hindustani musicians added,
sitar/sarod/etc. buttons will appear automatically.

**Tradition is NOT added as a top-bar filter in this ADR.** The visual budget
of the top bar is finite, and a tradition filter would change the conceptual
model of the bar (currently: facets of the musician set). If a tradition
filter becomes desirable after the HER catalogue grows, it earns its own ADR.
For now, a rasika who wants to see only Hindustani musicians can search by
instrument (sitar, sarod, etc.) — every Hindustani musician will have a
Hindustani-typical instrument tag (vocal being the one ambiguous case).

### 7. Graph view rendering of Hindustani musicians

In the main lineage graph view, Hindustani musicians appear as nodes with the
same shape as Carnatic musicians but **a cool-coloured border** matching the
HER chip palette from ADR-113 (`--her-chip-accent`). They are **not connected
by guru-shishya edges** to any Carnatic musician (per §5). They appear as
"floating" nodes in the lineage graph, anchored only by their HER recordings
(visible when a rasika clicks them and the Bani Flow panel opens).

This deliberate visual subordination communicates:

- They are part of the graph.
- They are not part of the Carnatic lineage spine.
- They become musically meaningful when navigated to from an HER chip.

In the timeline view, they are placed by birth year as for Carnatic musicians,
again with the cool-colour border.

---

## Consequences

### Positive

- The Librarian can add Nikhil Banerjee, Hariprasad Chaurasia, Vilayat Khan,
  etc. with a single command, without polluting the Carnatic lineage graph.
- Cross-tradition musicians (Sriram Parasuram and others) gain accurate
  representation via the `traditions` array.
- The instrument vocabulary expands cleanly: six new instruments, all with
  clear tradition associations, no breakage of existing data.
- The graph view honours the boundary visually (cool-coloured border) without
  needing a separate canvas or view mode.

### Negative / risks

- **Floating nodes in the graph.** Hindustani musicians without lineage edges
  may look orphaned. Mitigation: they are intentionally subordinate; their
  "home" is the HER chip on a Carnatic raga's panel, not the lineage spine.
  The cool-colour border signals this subordination. If user feedback finds
  the floating nodes confusing, a follow-up ADR can hide them from the main
  graph by default and surface them only via HER navigation.
- **Vocabulary scope creep.** Six new instruments today; Indian classical
  music has many more (rudra veena, jaltarang, esraj, etc.). The validator's
  warning-not-error stance handles this gracefully; new instruments can be
  added incrementally as needed without an ADR each time.
- **`traditions` array complexity.** A field with `[1, 2]` length feels
  trivial today but invites future tradition values (folk? ghazal? Western?).
  The Librarian must hold the line: `["carnatic", "hindustani"]` only, until
  a future ADR justifies an addition.

### Neutral

- The `add-hindustani-musician` command is structurally a thin wrapper around
  `add-musician` with one tradition default flipped. The Coder may implement
  it as a flag (`add-musician --tradition hindustani`) rather than a new
  command if that simplifies the CLI surface — equivalent semantically.

---

## Implementation

This ADR is doc-only. Implementation depends on ADR-112 being Accepted.
Sequence:

1. **Coder** (parallel to or after ADR-112 implementation):
   - Migration: backfill `traditions: ["carnatic"]` on every existing musician
     file. Idempotent.
   - Validator: accept `traditions` array; warn on unknown instruments
     (already warning today — verify); accept the six new instrument values
     in the vocabulary list.
   - Writer: add `add-hindustani-musician` (or `--tradition hindustani` flag
     on `add-musician`).
   - Render: apply cool-colour border to nodes with
     `traditions.includes("hindustani")` in both graph and timeline views.
   - README update: document new instruments and `traditions` field in
     [`carnatic/data/READYOU.md`](../carnatic/data/READYOU.md).
   - Tests: musician with `traditions: ["hindustani"]` validates; musician
     with `traditions: ["carnatic", "hindustani"]` validates; missing
     `traditions` field treated as `["carnatic"]` for backward compat.

2. **Librarian** (after Coder ships and ADR-112 seed pairs are in place):
   - Add 2–4 Hindustani musicians to host the seed HER recordings (e.g.
     Nikhil Banerjee for Malkauns, Hariprasad Chaurasia for Madhumad Sarang,
     a vocalist for Shudh Bhairavi).
   - Set `traditions: ["carnatic", "hindustani"]` on Sriram Parasuram (the
     only existing musician known to qualify; verify others case by case).

3. **Coder** (final):
   - Run `bani-render`, validate, manual smoke-test.

---

## Related ADRs

- ADR-008 — Era/instrument top-bar filters (extended by §6)
- ADR-016 — Writer validation (extended for `traditions` and instrument vocab)
- ADR-112 — HER schema (this ADR's prerequisite for HER recording targets)
- ADR-113 — HER surfacing (this ADR supplies the musician nodes those views
  link to)
- CLAUDE.md — Project mission (this ADR honours the Carnatic-first commitment
  in §5)
