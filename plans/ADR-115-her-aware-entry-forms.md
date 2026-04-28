# ADR-115: HER-Aware Entry Forms — Tradition-Switched Add Raga, Add Recording, and Add Musician

**Status**: Accepted
**Date**: 2026-04-27
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-031 (data entry forms), ADR-082 (lecdem entry CLI and forms), ADR-085 (self-replicating curation loop), ADR-097 (bundle deltas and unified Edit form), ADR-103 (co-located edit affordances), ADR-105 (composer-mediated composition entry), ADR-106 (mela-anchored janya entry), ADR-107 (concert-anchored recording entry), ADR-112 (HER schema), ADR-114 (HER musicians and instrument expansion)
**Related**: ADR-113 (HER surfacing in views and search)

---

## Context

ADR-112 establishes Hindustani Equivalent Ragas (HERs) as raga objects with
`tradition: "hindustani"`. ADR-114 establishes Hindustani musicians with
`traditions: ["hindustani"]` (or both). ADR-113 surfaces both in the view layer.
None of those ADRs touch the **entry forms** through which the
`graph.html → bundle → bani-add → writer` loop (ADR-085) actually accepts new
data from a contributor.

### The current Add Raga form is Carnatic-only by structure

The Add Raga form (descended from ADR-031, refined by ADR-097's unified Edit form
and pre-targeted by ADR-106 from the melakarta panel) is built around the
Melakarta system as a load-bearing assumption:

- The form requires a `parent_raga` (melakarta) selection — locked when opened
  via ADR-106's mela-anchored `+` chip.
- The form requires a `melakarta` integer (1–72) for the raga's parent number.
- The form has fields for *arohana* / *avarohana* (Carnatic-style scale
  notation).
- The form has no `tradition` toggle, no `thaat` field, and no opt-out for
  janya/mela.

A contributor opening this form for Malkauns has to either lie (assign a
melakarta number that doesn't apply), invent a janya parent, or abandon the
form. None of these is acceptable. The form's structure literally cannot
accept an HER.

### The current Add Recording form requires a composition

The Add Recording form (ADR-031, refined by ADR-097 and ADR-107's
concert-anchored `+`) requires each performance entry to carry a
`composition_id`. ADR-112 §4 relaxed the *validator* to accept empty
`composition_ids` when the host raga is HER — but the form's validation runs
client-side before the bundle is even built. Without a parallel form
relaxation, the writer's relaxation never gets exercised.

### The current Add Musician form has no traditions array

The Add Musician form (ADR-031, ADR-097) has a single `instrument` dropdown
populated from the Carnatic-only vocabulary. There is no `traditions`
multi-select, no Hindustani instrument options (sitar, sarod, etc.), and no
way to declare a musician as belonging to both traditions.

### Why this is its own ADR

ADR-112/113/114 already split the work cleanly along schema / view / musician
axes. The entry-form changes touch a fourth axis (the contributor write
surface) and a different code path (`entry_forms.js`, the bundle builder per
ADR-097, the form HTML templates). Bundling form changes into ADR-112 would
have inflated a schema ADR with UI mechanics; into ADR-113 would have
entangled view rendering with form logic. Splitting it out follows the same
discipline that produced ADR-103/104/105/106/107 from the larger "co-located
edit affordances" theme.

This ADR also serves as the **contributor-facing test of the schema**: if a
form cannot capture a valid HER without contortion, the schema is wrong. The
form review is the schema review's last line of defence before merge.

---

## Forces in tension

1. **Schema-as-UI (ADR-103 §4).** The rule "Carnatic ragas have a melakarta;
   HERs do not" must be enforced by the form's *shape*, not by validation
   error messages after the fact. A contributor adding an HER should never
   see a melakarta field at all.

2. **Single Add Raga entry point.** ADR-106 makes the melakarta panel the
   only place to add a janya. This is a structural commitment. An HER is
   not a janya — its entry point cannot be the melakarta panel. A new entry
   point is required, and it must be equally well-anchored.

3. **Form proliferation must be resisted.** The application already has Add
   Musician, Add Composer, Add Composition, Add Raga, Add Recording, Add
   Lecdem (ADR-082). Adding Add HER, Add HER Recording, Add Hindustani
   Musician as three separate forms triples the surface area. A unified
   Add Raga form with a `tradition` toggle that *re-shapes* the form is
   preferable — fewer forms, more schema-driven branching.

4. **Pre-targeting must work both ways.** A contributor on a Carnatic raga's
   panel who wants to declare an HER link should be able to click a
   co-located `+` and have the form open with the Carnatic raga's id
   pre-filled as the back-reference. Symmetrically, a contributor on an
   HER's panel should be able to add a Carnatic equivalent without
   retyping.

5. **No silent fallback.** The form must never default a Carnatic raga's
   tradition to "hindustani" or vice versa. The tradition toggle is
   explicit and required. If the contributor opens Add Raga from the
   melakarta panel `+`, tradition is locked to "carnatic" (HERs cannot be
   janyas of melakartas). If opened from a different anchor (see §4
   below), tradition is unlocked but defaults to "carnatic".

6. **Bundle compatibility.** The form must emit ADR-097-compliant bundle
   items (`op: create`, `op: append`, etc.) with the correct shape for
   HER objects and HER recordings. The bundle's whitelist (ADR-083) must
   be extended to recognise HER-shaped items, or the existing `ragas`
   bucket must accept them transparently.

---

## Pattern

### **Property 4, *Alternating Repetition*** (*The Nature of Order* Book 1)

Carnatic and Hindustani are not opposed; they are alternating instances of
the same underlying form (raga music). The Add Raga form should *visibly
alternate* its shape based on the tradition toggle — not hide one tradition
behind a separate form. The toggle reveals the alternation rather than
suppressing it.

### **Pattern 95, *Building Complex*** (*A Pattern Language*)

ADR-106 used this pattern to make melakartas the building and janyas the
rooms. For HERs the building is the *Carnatic raga*: an HER is a doorway
opening from the Carnatic raga onto a neighbouring building. The natural
co-located `+` for adding an HER is on the Carnatic raga's panel — at the
"Hindustani equivalents" row introduced by ADR-113 §2.

### **Schema-as-UI as form-shape-discipline**

ADR-103 §4 named schema-as-UI as a co-location principle for *where* an
affordance lives. ADR-115 extends it to the *shape* of the form: the form's
visible fields are a literal projection of the entity's schema. A raga with
no melakarta has no melakarta field. This is the form-level analogue of the
panel-level rule that ADR-113 §3 applied to HER subject headers.

---

## Decision

### 1 — Add Raga form gains a tradition toggle as its first field

The Add Raga form's first field (above name, above all else) becomes a
**tradition toggle** with two states: **Carnatic** (default) and
**Hindustani**. The toggle is a segmented control, not a dropdown, so the
choice is visible at a glance.

The toggle's state controls which fields render below it. Switching the
toggle re-shapes the form in place; no page reload, no separate form.

#### Carnatic state (default — preserves today's form)

| Field | Required | Notes |
|---|---|---|
| Raga name | yes | unchanged |
| Aliases | optional | unchanged |
| `is_melakarta` | yes (toggle) | unchanged |
| `melakarta` (number) | yes if melakarta, otherwise janya's parent number | unchanged; locked when opened via ADR-106 mela `+` |
| `parent_raga` | yes if not melakarta | unchanged; locked when opened via ADR-106 |
| `cakra` | yes if melakarta | unchanged |
| Notes (arohana / avarohana / character) | optional | unchanged |
| Sources (Wikipedia URL required) | yes | unchanged |

#### Hindustani state (new)

| Field | Required | Notes |
|---|---|---|
| Raga name | yes | same as Carnatic |
| Aliases | optional | same |
| `thaat` | optional | new dropdown: Bilawal / Kalyan / Khamaj / Bhairav / Bhairavi / Asavari / Todi / Purvi / Marwa / Kafi / *unknown* (default) |
| `carnatic_equivalents` (back-link) | conditional — see §3 | one or more Carnatic raga ids selected from a typeahead; pre-filled and locked when opened from a Carnatic raga panel's `+` |
| Notes (chalan / mood / vilambit notes) | optional | free text; the *arohana / avarohana* field is **suppressed** because the Hindustani tradition de-emphasises scales (per the user's framing in `hindustani_equivalent_ragas.md`) |
| Sources (Wikipedia URL required) | yes | same as Carnatic |

Fields explicitly **not present** in the Hindustani state:

- `is_melakarta` — Hindustani has no Melakarta.
- `melakarta` (number) — same.
- `parent_raga` — same.
- `cakra` — same.
- `arohana` / `avarohana` — intentionally suppressed; the Hindustani tradition
  is raga-as-chalan, not raga-as-scale.

### 2 — Bundle-side: HER objects ride the existing `ragas` bucket

The HER object schema (ADR-112 §3) is a *uniform extension* of the raga
schema (same directory, same base shape, additional fields). The bundle
emits HER `op: create` items in the existing `ragas` bucket. ADR-083's
whitelist requires no expansion — only the field whitelist within
`ragas` items grows by `tradition`, `thaat`, `carnatic_equivalents` (the
last is reconstructed by the writer from Carnatic-side
`hindustani_equivalents`, but the form may emit it as a hint for early
preview rendering before render gates the truth).

The **writer is the single validation site** (ADR-084): the form may emit
optimistic shapes; the writer normalises them. Specifically:

- If the form emits an HER `op: create` with `carnatic_equivalents: [carID]`,
  the writer also emits an `op: append` to the named Carnatic raga's
  `hindustani_equivalents`. This is **one form action, two bundle items** —
  the Coder enforces this in the bundle builder, not in two separate forms.
- The reverse is also true: a `link-her` operation from a Carnatic raga's
  panel emits `op: append` on the Carnatic side and the writer regenerates
  `carnatic_equivalents` on the HER side at render time.

### 3 — Co-located `+` placements

Three co-located entry points, mirroring ADR-105/106/107's placement
discipline:

| Anchor panel | `+` location | Opens | Pre-targeting |
|---|---|---|---|
| **Carnatic raga panel** | Right edge of "Hindustani equivalents (N)" row (introduced by ADR-113 §2). If the row is empty, render it with `(0)` and a `+` so the affordance is discoverable. | Add Raga form, Hindustani state | `carnatic_equivalents` pre-filled with the current Carnatic raga's id, locked (with a "change" link to escape, per ADR-103 §2) |
| **HER panel** | Right edge of "Carnatic equivalents (N)" row (introduced by ADR-113 §3). Same `(0)` rule. | Add Raga form, Carnatic state | `parent_raga` typeahead opens with no pre-selection (the contributor must declare which Carnatic raga is the equivalent); `is_melakarta` defaults to false |
| **Mela panel "Janyas (N)" row** (existing ADR-106 `+`) | unchanged | Add Raga form, Carnatic state, tradition toggle **locked** to Carnatic | unchanged |

The melakarta `+` locking the toggle to Carnatic encodes the schema rule
*HERs cannot be janyas of melakartas* into the form's shape. A contributor
who tries to add an HER from a melakarta panel cannot — and the affordance
to switch tradition is the locked toggle itself, communicating *why* they
cannot rather than failing silently.

### 4 — Add Recording form gains an HER branch

When a contributor adds a recording (via ADR-107's concert-anchored `+` or
the unified Edit form), the per-performance row currently requires:
`composition_id`, `raga_id`, `tala`, `kind` (defaulting to `kriti`).

The form gains conditional logic:

- When the contributor selects a `raga_id` whose record has
  `tradition: "hindustani"`:
  - `composition_id` field collapses (not removed; collapsed with a small
    "+ add composition (rare for HER)" expander for the unusual case where a
    Hindustani composition is being recorded).
  - `tala` field collapses similarly.
  - `kind` defaults to `raga_alap` and the dropdown reorders to put HER-
    typical kinds first: `raga_alap`, `lecdem`, `concert`, `misc`, then the
    Carnatic kinds.
  - A small `[Hindustani]` tag in the `--her-chip-bg` colour appears next to
    the raga selection, mirroring the panel chip styling from ADR-113 §1.

The contributor sees the form *re-shape* the moment they select an HER
raga, just as the Add Raga form re-shapes on the tradition toggle.

### 5 — Add Musician form gains a traditions multi-select and broader instrument list

The Add Musician form (today: single `instrument` dropdown, no tradition)
gains:

- A **traditions** segmented multi-select with two chips:
  **Carnatic** (default selected) and **Hindustani** (default unselected).
  Both can be selected simultaneously to declare cross-tradition fluency
  (per ADR-114 §3's `traditions: ["carnatic", "hindustani"]` case).
- The **instrument** dropdown is extended with the six new values from
  ADR-114 §1 (sitar, sarod, bansuri, tabla, sarangi, surbahar). When
  Hindustani is selected, the dropdown reorders to surface Hindustani-
  typical instruments first; `vocal` remains in its alphabetical position
  as a shared instrument.
- The **bani** field collapses to optional and is hidden when the
  traditions selection is `["hindustani"]` only (Hindustani musicians
  belong to gharanas, not banis; ADR-114 §5 keeps gharanas out of the
  graph, but the form must not present a Carnatic-specific field as
  required).

The form does not gain a "gharana" field even for Hindustani musicians —
ADR-114 §5's explicit non-decision (no Hindustani lineage in the schema)
must be honoured by the form, not subverted by it. Gharana information goes
into the **notes** field as prose, with a small grey hint
"(if Hindustani: gharana / lineage notes go here as prose)".

### 6 — Empty-state hints in the panel tutorials (ADR-086, ADR-098, ADR-102)

The empty-state Bani Flow panel (ADR-086) currently lists seed examples
(Tyagaraja kritis, Ramnad Krishnan recordings, etc.). Two new seed-row
types are added:

- A **HER demo row** showing `↔ Malkauns ↔ Hindolam` — clicking it loads
  Malkauns into the panel, demonstrating the cool-colour boundary chip.
- A **HER mechanics bullet** in the Bani Flow panel's mechanics list:
  "Cool blue chip with `↔` is a Hindustani equivalent — same swaras,
  different aesthetic."

These changes are part of the help-deck content (ADR-098 / ADR-102) and
must be added to `data/help/empty_panels.json` with the same validation
discipline as existing seeds (per ADR-086).

### 7 — Validation parity

The form's client-side validation must mirror the writer's (ADR-016 / ADR-084)
exactly. Specifically:

- HER raga: Wikipedia URL required (same as Carnatic).
- HER raga: at least one `carnatic_equivalents` entry required if opened
  from a non-Carnatic-raga anchor (i.e. HERs cannot be added in isolation
  — they must immediately link to at least one Carnatic raga to honour
  ADR-112's "no orphan HERs" Librarian rule).
- HER recording: `raga_id` required, `composition_id` optional only when
  the raga is HER (form re-checks tradition at submit).
- Hindustani musician: `traditions` array must contain at least one of
  `carnatic` / `hindustani`; instrument required from the expanded
  vocabulary; bani optional.

---

## Consequences

### Positive

- The form's *shape* is the schema's shape. A contributor who has never read
  ADR-112 cannot accidentally produce a malformed HER object — the form
  doesn't expose the malformed shapes.
- One Add Raga form covers both traditions via a visible toggle, preventing
  form proliferation while honouring the schema's branching.
- Co-located `+` placements (§3) make HER linking discoverable from both
  sides without forcing the contributor to navigate to a separate "HER
  manager" page.
- The Add Recording form's HER branch (§4) is the contributor-facing
  realisation of ADR-112 §4's composition-optional relaxation; without the
  form change, the writer's relaxation is unreachable from the loop.
- Empty-state seeds (§6) bootstrap discoverability — a new contributor
  encounters HER as a first-class concept on first paint.

### Negative / risks

- **Form-shape mutation feels jarring on slow devices.** Re-shaping the
  Add Raga form when the toggle flips costs a DOM reflow. Mitigation: the
  Coder uses CSS `display: none` on the inactive fields rather than
  destroying / re-creating them, so toggling is cheap.
- **Bundle dual-emission complexity.** A single form action emitting two
  bundle items (HER `create` + Carnatic raga `append`) requires the bundle
  builder to handle the pair atomically. The Coder must add a focused test
  for the case where the second item fails validation — the first must not
  be partially applied.
- **Toggle locked-to-Carnatic on melakarta `+` may confuse first-time
  contributors.** Mitigation: a small tooltip on the locked toggle:
  "Janyas of melakartas are always Carnatic. To add a Hindustani raga,
  start from a Carnatic raga's panel."
- **Dropdown reordering by tradition** (§4 kinds, §5 instruments) is a
  small affordance that may feel inconsistent. The Coder may choose
  alphabetical-with-grouping (Hindustani group first when Hindustani is
  selected) over true reordering — equivalent UX, simpler code.

### Neutral

- The traditions multi-select on Add Musician introduces a new control type
  (segmented multi-select) not yet used elsewhere in the forms. The Coder
  may implement it as two independent toggle chips instead — equivalent
  semantics, simpler implementation.
- The HER demo row in the empty-state tutorial is one more entry in
  `empty_panels.json` and one more validated `id` reference — small
  curation cost, owned by the Librarian per ADR-086.

---

## Implementation

This ADR is doc-only. Implementation depends on ADR-112 being Accepted
and the schema-side migration landing. Sequence:

1. **Coder** (after ADR-112 + ADR-114 implementation):
   - Add the tradition segmented control to the Add Raga form.
   - Implement field show/hide based on toggle state (CSS-toggled, not
     destructive).
   - Add the three new co-located `+` placements (§3) on the Carnatic
     raga panel, the HER panel, and confirm the existing melakarta `+`
     locks the toggle.
   - Extend the bundle builder to emit dual items for `create HER + append
     to Carnatic` from a single form submit.
   - Extend the Add Recording form with the HER branch (§4) — collapse
     composition/tala fields, default `kind: "raga_alap"`, render the
     `[Hindustani]` tag.
   - Extend the Add Musician form with the traditions multi-select and
     the six new instrument values; collapse `bani` for Hindustani-only
     musicians.
   - Run `bani-render`. Smoke-test all three forms in the seeded HER state
     (Malkauns / Madhumad Sarang / Shudh Bhairavi from ADR-112's seed plan).
   - Add unit tests: form emits correct bundle shape for each tradition;
     dual-emission rolls back atomically on writer rejection.

2. **Librarian** (after Coder ships):
   - Update `empty_panels.json` (per ADR-086 §6) with the HER demo row
     and the new mechanics bullet.
   - Use the new forms to add the seed HER pairs end-to-end as the
     contributor would, to verify the full loop (graph.html → bundle →
     bani-add → writer → entity files → render → graph.html).

3. **Coder** (final):
   - Confirm `python3 carnatic/cli.py validate` passes with HER nodes,
     HER recordings, and at least one cross-tradition musician present.
   - Document the new form behaviours in
     [`carnatic/data/READYOU.md`](../carnatic/data/READYOU.md).

---

## Related ADRs

- ADR-031 — Data entry forms (the host this ADR extends)
- ADR-082 — Lecdem entry CLI and forms (precedent for kind-conditional form behaviour)
- ADR-085 — Self-replicating curation loop (the loop this ADR keeps closed for HER)
- ADR-097 — Bundle deltas and unified Edit form (the bundle ops emitted by the new form branches)
- ADR-103 — Co-located edit affordances (the placement discipline this ADR follows)
- ADR-105 — Composer-mediated composition entry (parallel pattern: hard parent → only entry point on parent)
- ADR-106 — Mela-anchored janya entry (sibling pattern: Carnatic-only path stays Carnatic-only)
- ADR-107 — Concert-anchored recording entry (host for §4 HER recording branch)
- ADR-112 — HER schema (this ADR's prerequisite)
- ADR-113 — HER surfacing in views and search (defines the panel rows where §3's `+` chips live)
- ADR-114 — HER musicians and instrument expansion (this ADR's prerequisite for §5)
