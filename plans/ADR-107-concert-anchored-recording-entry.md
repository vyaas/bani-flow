# ADR-107: Concert-Anchored Recording Entry from the Musician Panel

**Status**: Accepted
**Date**: 2026-04-26
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-018 (concert-bracketed recording groups), ADR-019 (co-performer bracketed trail entries), ADR-026 (concert-anchored player), ADR-031 (data entry forms), ADR-085 (self-replicating curation loop), ADR-103 (co-located edit affordances)
**Related**: ADR-104, ADR-105, ADR-106

---

## Context

The musician panel today renders a *CONCERTS* section listing concert recordings the musician participated in (e.g., *NCPA 2022 — 5 pieces — Akkarai Subbulakshmi*). Each existing concert exposes a `+` to add a track within it (per ADR-018 / ADR-101 — the segment-level edit affordances are co-located).

What is missing is the **outer** affordance: a way to add an *entirely new concert* in which this musician participated. Today, to add a new concert recording, the contributor opens the global launcher (deprecated, ADR-103), picks Recording, and re-selects the musician as a performer.

The natural placement, mirroring ADRs 105 and 106, is **the right edge of the *CONCERTS* section header**: a `+` chip whose meaning in context is *add a new concert by/featuring this musician*.

### Forces

| Force | Direction |
|---|---|
| **Co-location (ADR-103 §1)** | The trigger sits on the section header it acts on. |
| **Pre-targeting (ADR-103 §2)** | The Add Recording form opens with the musician already attached as a performer. |
| **Performer role inference** | The musician's primary instrument (per `musicians.json`) is a high-confidence default for the performer role. The contributor confirms or changes. |
| **Single dispatch** | The Add Recording form (ADR-031, the merged musician+recordings form variant) is unchanged; only its launch surface multiplies. |
| **Schema rule preserved** | A recording must have at least one performer with a known `musician_id`. The pre-targeting satisfies this rule by construction. |

---

## Pattern

**Property 1, *Strong Centres*.** The musician panel is a strong centre. The *CONCERTS* section is a sub-centre within it. The `+` makes the sub-centre actionable without disturbing its parent centre's identity.

**Pattern 30, *A Pattern Language*: *Activity Nodes*.** Activity collects around the places where it is structurally easy. Concert-recording entry is structurally easy from the musician panel: the performer is already identified by context. ADR-107 turns that structural ease into a UI affordance.

---

## Decision

### 1 — `+` chip on the *CONCERTS* section header of the musician panel

Where the musician panel renders the *CONCERTS* section header (whether the section is empty, has one concert, or has many), the right edge of the header gains a `+` chip:

```
CONCERTS                                                            +
▶ NCPA 2022                                                          +
    Akkarai Subbulakshmi
    5 pieces
```

The outer `+` (this ADR) adds a new concert. The inner `+` per concert (already shipped via ADR-018 / ADR-101) adds a track within an existing concert. The two affordances do not collide because they sit on different rows; both are inline-right-edge chips.

The chip uses the visual language of ADR-103 §6.

### 2 — Click behaviour

Clicking the `+` opens the existing **Add Recording** form (the dedicated recording form, *not* the merged musician+recordings form, since the musician already exists) with:

- A new performer row pre-added containing `musician_id = <panel's musician id>` and `role = <musician's primary instrument from musicians.json>`.
- The performer row's `musician_id` chip is locked (with a `change` link). The role is editable (instruments per concert can vary; e.g., a vocalist who also plays violin in some concerts).
- All other fields (concert label, date, venue, sessions, additional performers, source URL) remain to be filled.

The contributor adds further performers through the form's existing *+ Add Performer* affordance — co-performers are not pre-filled because the musician panel does not know them.

### 3 — What this ADR does NOT do

- **Does not change the recording schema.** The recording file format (per ADR-018, `data/recordings/<id>.json`) is unchanged.
- **Does not couple to lecdem entry.** Lecdems are added via the existing *+ Add YouTube* on the musician panel (which already allows `kind: "lecdem"` selection). ADR-107 is concert recordings only.
- **Does not auto-create sessions or performances.** The contributor adds sessions and performances within the form per current behaviour. The pre-targeting only sets the first performer.
- **Does not pre-fill the concert label, date, or venue.** These are concert-specific facts the musician panel cannot know.

---

## Consequences

### Positive

- **Adding a concert recording from a musician's panel becomes one click + form-fill**, not launcher-pick + musician-search + form-fill.
- **The performer-by-construction rule** (a recording always has at least one identified performer) is enforced structurally — the contributor cannot submit a performer-less recording from this entry path.
- **Symmetry with ADRs 105 and 106.** Three different parent → child relationships (composer → composition, melakarta → janya, musician → recording) all share the same affordance pattern. The UI gains a consistent grammar.

### Negative / accepted tradeoffs

- **A contributor adding a recording featuring multiple known musicians can launch from any of their panels** — the choice is arbitrary. Accepted: the resulting recording is identical regardless; the choice of launch panel does not encode anything about primary performer.
- **Role inference defaults can be wrong** for musicians with multiple instruments. Mitigated by the role field remaining editable.

### Risks

- **A recording added through this path with only the launcher-musician as performer** is structurally valid but rare in practice. Contributors who forget to add co-performers produce sparse recording entries. Mitigated by the form's *+ Add Performer* being prominently placed (existing behaviour) and by §3's note that co-performers are *not* pre-filled (so their absence is visible at form-time, not just after submit).

---

## Implementation

### Phase 1 — Render the chip on the musician panel

In the musician panel renderer:

1. When rendering the *CONCERTS* section header, append a `+` chip element. (Render the chip even when the section is empty — the empty case is the highest-leverage case for entry.)
2. The chip's click handler calls `openAddRecordingForm({musicianId, role: <inferred-from-instrument>})`.

### Phase 2 — `openAddRecordingForm` helper

In `carnatic/render/templates/entry_forms.js`:

1. Add `openAddRecordingForm({musicianId, role})` that opens the existing Add Recording window.
2. After the window's performer list initialises, prepend a performer row with `musician_id` locked to `musicianId` and `role` set to the inferred default. Render the locked chip with a `change` link per ADR-103 §2.
3. The form's submission path is unchanged — it produces a `recordings[]` create item per ADR-097 §3 (`op` defaults to `"create"`).

### Verification

- `bani-render` succeeds; the TM Krishna panel shows `+` to the right of *CONCERTS*.
- Clicking `+` opens Add Recording with TM Krishna pre-attached as a performer (role = vocal, inferred from his primary instrument).
- The contributor adds a concert label, date, venue, additional performers, sessions/performances, source URL.
- Submitting produces a `recordings[]` create item whose `sessions[].performances[]` performer list includes TM Krishna.
- After `bani-add` and `bani-render`, the new concert appears in the *CONCERTS* section.

---

## Closing note

A musician's concerts are an inventory she keeps. ADR-107 makes adding to that inventory the same gesture as adding a track to one of its entries — one chip, one row, one form. The page she is reading is the page she is writing.
