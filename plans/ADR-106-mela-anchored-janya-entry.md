# ADR-106: Mela-Anchored Janya Entry and Always-Searchable Melakartas

**Status**: Accepted
**Date**: 2026-04-26
**Agents**: graph-architect (proposer), carnatic-coder (implementer)
**Depends on**: ADR-021 (melakarta first-class citizens), ADR-022 (raga panel navigability), ADR-023 (raga wheel third view), ADR-031 (data entry forms), ADR-085 (self-replicating curation loop), ADR-103 (co-located edit affordances)
**Related**: ADR-104, ADR-105, ADR-107

---

## Context

Ragas occupy a special position in the corpus. Unlike musicians (where a contributor's discretion is valuable) or compositions (where the composer is the structural anchor), **ragas are heavily constrained**: every janya raga has a parent melakarta, every melakarta has a known number and cakra. The 72-melakarta system is closed; the janya space is enormous but each janya's parent is a single fact, not a judgement.

This means raga editing should be:

- **Hard to do willy-nilly.** A contributor should not be able to add a raga without naming its parent melakarta.
- **Easy to do correctly.** When the parent is in focus, adding a janya should be one click.

The melakarta panel is the natural anchor. ADR-021 made melakartas first-class. ADR-023 gave them the raga wheel — a third view in which all 72 melakartas are visible. The melakarta panel already lists *Janyas (N)*. The natural placement of the affordance is the right edge of that header row, mirroring ADR-105's composer-mediated placement.

But there is a discovery problem the composer case does not have: **a contributor cannot navigate to a melakarta if the melakarta has no recordings or compositions in the corpus**. Today's bani-flow search filters out ragas that lack node/perf/lecdem coverage (`search.js` lines 130–145). A rasika who wants to add a janya to *Shubhapanthuvarālī* (mela 45) cannot find it in the search if no recording in *Shubhapanthuvarālī* exists yet — the very condition under which adding a janya is most needed.

The fix is asymmetric: **melakartas always appear in the bani-flow search, regardless of recording coverage.** Janyas continue to filter by coverage (their unfiltered cardinality is too high to scroll). The asymmetry is justified by the schema: melakartas are 72 fixed entities; janyas are open-ended.

The raga wheel's existing dim-when-empty rendering (ADR-023) is unrelated to this and is preserved — the wheel stays a coverage map; the search becomes an entry map.

### Forces

| Force | Direction |
|---|---|
| **Schema-as-UI (ADR-103 §4)** | The rule "every janya has a parent" is enforced by making the parent the only entry point. |
| **Discovery** | A contributor cannot anchor on a melakarta she cannot find. Search must surface every melakarta. |
| **Visual restraint** | Melakartas surfaced through search retain their visual identity (the diamond ◈ glyph, ADR-021); they do not pretend to have content they lack. |
| **Coverage map preserved (ADR-023)** | The raga wheel's dim-when-empty rule is a correctness signal for browsing, not for entry. It stays. |
| **Co-location (ADR-103 §1)** | The `+` for adding a janya sits on the melakarta panel, not on the search bar or a global launcher. |
| **Pre-targeting (ADR-103 §2)** | The form opens with `parent_raga = <melakarta_id>` and `mela = <number>` pre-filled and locked. |

---

## Pattern

**Property 14, *Gradients* (*The Nature of Order* Book 1).** Melakartas and janyas are not the same kind of object. Treating them identically in the search filter (both filtered by coverage) flattens a real gradient. ADR-106 restores the gradient: melakartas are always visible (because they are 72 fixed centres of the system); janyas are filtered (because they are an open set whose unfiltered listing would drown the search).

**Pattern 95, *A Pattern Language*: *Building Complex*.** A melakarta is the building; its janyas are the rooms. To add a room, you find the building first. ADR-106 makes the building always findable, even before any room is built inside it.

---

## Decision

### 1 — `+` chip on the "Janyas (N)" row of the melakarta panel

Where the bani-flow raga panel renders *Janyas (N)* — a row that exists today only on melakarta panels (ADR-021 / ADR-022) — the right edge of that header row gains a `+` chip:

```
KHARAHARAPRIYA · Mela 22 · Cakra 4 — Veda      ✎
also: Kara Haraprīya
▶ Janyas (17)                                                       +
```

(In the screenshot reference for this ADR, the chip sits just right of the existing collapsible triangle.)

**Janya raga panels do NOT receive this chip.** A janya is not a parent; it cannot host new ragas under it.

The chip uses the visual language of ADR-103 §6.

### 2 — Click behaviour

Clicking the `+` opens the existing **Add Raga** form (`buildRagaForm` in `entry_forms.js`) with:

- `parent_raga` pre-filled to the panel's melakarta id, rendered as a locked chip with a small `change` link.
- `mela` (the parent mela number) pre-filled to the same melakarta's mela number, rendered as a locked numeric display. Editing the parent through `change` updates this in lockstep.

All other raga fields (name, aliases, wikipedia URL, source URL) remain to be filled.

### 3 — Search filter change: melakartas are always surfaced

In `carnatic/render/templates/search.js`, the bani-flow search getItems function currently filters ragas by:

```js
if ((hasNode || hasPerf || hasLecdem) && r.name.toLowerCase().includes(ql)) {
  results.push({...});
}
```

This is amended to:

```js
const isMelakarta = (r.mela_number != null && r.id === r.parent_raga)
                    || r.is_melakarta === true;   // exact predicate is the data shape's call
if ((isMelakarta || hasNode || hasPerf || hasLecdem)
    && r.name.toLowerCase().includes(ql)) {
  results.push({...});
}
```

The exact `isMelakarta` predicate uses whatever field already encodes melakarta identity in the rendered raga objects (per ADR-021's first-class shape). The Coder confirms the field name from `data_loaders` at implementation time; the predicate is a one-line query, not a schema change.

### 4 — Surfacing: melakartas appear distinct in the dropdown

To prevent a contributor from confusing a content-less melakarta search hit with a janya that has content, the dropdown's secondary line for a melakarta with no coverage reads:

```
◈ Shubhapanthuvarali
   Mela 45 · no recordings yet — open to add a janya
```

For melakartas *with* coverage, the existing primary line is unchanged (no secondary, per current behaviour).

The exact secondary copy is a Coder choice; this ADR specifies that the melakarta with no coverage is **labelled as such** so the contributor knows the click opens the panel for janya-entry purposes.

### 5 — Raga wheel rendering is unchanged

The raga wheel (ADR-023) continues to dim mela ragas with no recordings/compositions/yt-links. The wheel is a coverage map; ADR-106 does not touch it. The discovery-via-search and visual-coverage-via-wheel become two complementary affordances:

- **Wheel** — *what is in the corpus*.
- **Search** — *what entry points exist*, including for things not yet in the corpus.

### 6 — What this ADR does NOT do

- **Does not allow adding a melakarta.** All 72 melakartas are seeded. A contributor who finds a missing melakarta is finding a data bug, not a contribution; this is a librarian-tier escape.
- **Does not allow adding a raga whose parent is itself another janya.** The existing raga schema (per ADR-021 / ADR-022) constrains parent-of-janya to a melakarta. The form's `parent_raga` combobox restricts to melakartas regardless.
- **Does not surface janyas without coverage in the search.** The asymmetry is intentional.
- **Does not modify the musician search or any other search surface.** Only the bani-flow search is amended.

---

## Consequences

### Positive

- **Janya entry becomes a one-click contribution from the melakarta panel.** The schema rule (every janya has a known parent) is enforced by the navigation path.
- **A rasika studying *Shubhapanthuvarālī* can seed it with its first janya** even before any recording in either raga exists. The corpus grows in the order the rasika's attention grows.
- **The 72 melakartas become entry waypoints, not just coverage centres.** The search becomes contribution-aware, not just consumption-aware.
- **The wheel and the search develop complementary roles.** This sharpens the existing distinction (ADR-023's wheel as map, search as text index).

### Negative / accepted tradeoffs

- **The bani-flow search dropdown grows by up to 72 entries** (the melakartas). Mitigated by the existing `slice(0, 10)` cap and by melakartas being a small fraction of the corpus's overall raga count.
- **A contributor might confuse a no-coverage melakarta hit with a content hit.** Mitigated by §4's secondary label.
- **Hard rule "no orphaned ragas" relies on the form's locked `parent_raga` chip not being defeated through the `change` affordance.** The `change` link unlocks the field but the field's combobox restricts to existing melakartas — the contributor cannot type a free-text parent. Hard rule preserved.

### Risks

- **The `isMelakarta` predicate must match the data shape.** Mitigated by Coder verifying the field name at implementation; this ADR does not lock a name.
- **Melakarta-with-no-coverage panels need to render usefully.** Today, ADR-022 made raga panels navigable; an empty melakarta panel (no janyas, no compositions, no recordings) currently looks bare. The empty-panel tutorial (ADR-086) is the right place to handle this; ADR-106 does not extend it but flags the case.

---

## Implementation

### Phase 1 — Search filter change

In `carnatic/render/templates/search.js`:

1. Identify the field that encodes melakarta identity on rendered raga objects (consult `carnatic/render/data_loaders.py` and `data_transforms.py`).
2. Amend the bani-flow search filter per §3.
3. Add the §4 secondary-label rendering for no-coverage melakarta hits.

### Phase 2 — `+` chip on the Janyas row

In the bani-flow raga panel renderer:

1. Where the *Janyas (N)* header is rendered, append a `+` chip element (only when the panel's raga is a melakarta).
2. The chip's click handler calls `openAddRagaForm({parentRagaId, mela})`.

### Phase 3 — `openAddRagaForm` helper

In `carnatic/render/templates/entry_forms.js`:

1. Add `openAddRagaForm({parentRagaId, mela})` that opens the existing Add Raga window with `parent_raga` and `mela` pre-set and locked per §2.
2. The form's submission path is unchanged — it calls `addToBundle('ragas', item)`.

### Verification

- `bani-render` succeeds; searching *"shubhapanthuvarali"* in the bani-flow search returns *◈ Shubhapanthuvarali* with the no-coverage secondary label.
- Selecting it opens the *Shubhapanthuvarālī* panel; the *Janyas (N)* row shows `+`.
- Clicking `+` opens Add Raga with parent and mela locked.
- Submitting produces a `ragas[]` create item with `parent_raga: "shubhapanthuvarali"` and `mela: 45`.
- After `bani-add` and `bani-render`, the new janya appears in the Janyas list and the count is `N+1`.

---

## Closing note

The 72 melakartas are the alphabet from which all ragas are spelled. ADR-106 makes that alphabet always reachable, so contributors can begin spelling new words even where the lexicon is empty.
