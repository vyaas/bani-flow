# ADR-128: Symmetric Panel Base — Shared Section, Header, and Subject-Group Components

**Status**: Proposed
**Date**: 2026-05-11
**Author**: Graph Architect

---

## Context

The left panel (Bani Flow — raga / composition entry) and the right panel (Musician — musician entry) are co-equal entry points (ADR-003, ADR-011). They are supposed to be locally symmetric. In practice they are not. Each panel has been extended independently, and small structural choices have diverged in ways that are now visible to the user as inconsistency:

1. **Section header treatment.** The right panel's `Lecdems` section has a collapse chevron, an item count, an `+` add button, and centred-or-flex-justified layout (`.lecdem-section-header`). The left panel's `Lecdems on X` strip has a left-justified prose label, no chevron, no count visible at first glance, no add button. Same conceptual section, two unrelated CSS paths.

2. **Subject-token row layout.** In the left-panel header, the subject (`Bhairavi`) sits next to its `+` (add edge?) chip with no spacing; the `Hindustani equivalents` add-chip is pushed all the way right with `justify-content: space-between`. The external-link button is small and tucked away rather than rendered as the prominent encircled affordance used on play/recording rows.

3. **Right-panel musician header.** The musician chip currently appears alone with the lifespan rendered loosely after it. The external-link button and edit button are inconsistently placed (sometimes inline, sometimes hidden in a menu). The user wants a predictable second-line affordance row: `[ born–died ]  [ ⌕ wiki ]  [ ✎ edit ]`.

4. **Empty sections occupy real estate.** Both panels render every section header eagerly even when the section is empty. The user has to scroll past `LECDEMS (0)` to reach `RECORDINGS BY RAGA (16)`. The empty section deserves to be demoted (not hidden — discoverability of the `+` add affordance matters), giving the populated sections more vertical room above the fold.

5. **Lecdem subject-chip lists are unbounded.** A single lecdem's subject list can include many ragas, compositions, and musicians. In the right panel they are currently rendered flat, taking many lines per row. The user wants them collapsed by default behind a chevron (using the same disclosure aesthetic as everywhere else).

The root cause of all five is that the two panels do not share a base. There is no `Section`, no `SectionHeader`, no `SubjectGroup`, no `MusicianHeaderRow` component. Each panel's renderer reinvents these shapes inline. Every cosmetic change made to one panel must be manually mirrored to the other — and historically has not been. The user's complaint is precise: *we keep making cosmetic changes in only one panel.*

---

## Pattern

**Symmetry** (Alexander Pattern 139). The two panels are equivalent centres. They must be locally symmetric in their structural framing. ADR-011 established this for width and search-bar framing; ADR-128 extends it to section, subject-group, and disclosure components.

**Roughness** + **Levels of Scale** (Patterns 251, 145). The base components must be rough enough to host both panels' specifics (left has trail rows, right has recording rows) without forcing one to mimic the other's content. Inheritance, not duplication: a base `Section` component that knows nothing about lecdems vs recordings vs concerts; a `SectionHeader` that knows nothing about whether its label is `Lecdems` or `Recordings by Raga`.

**Centres-Need-Boundaries** (Pattern 15 of A Pattern Language adapted): the disclosure chevron is the boundary of a sub-centre (the lecdem subjects). Without a boundary, the centre bleeds; with the chevron, the user sees `[lecdem title] [▶]` and can choose to enter.

---

## Decision

### D1. A panel renderer base in JS

Introduce a single module `panel_components.js` (Coder's call on filename) that exports the following pure constructors. They take data + callbacks and return DOM elements. They have no panel-specific knowledge.

```
buildPanelHeader({ titleNode, lifespanText, externalUrl, onEdit })
  // Used by BOTH panels' top header. titleNode is a chip element supplied
  // by the caller (a .musician-chip, .raga-chip, or .comp-chip). The
  // function appends the lifespan/years line and the affordance row.
  //   line 1: titleNode
  //   line 2: [lifespanText] [encircled external-link icon] [encircled edit icon]
  // The encircled-icon affordance is the same as the play / external-link
  // icons on recording rows (existing class .icon-btn-circled, ADR-019/020
  // play-button family).

buildSection({ headerChip, headerSuffixText, count, onAdd, defaultCollapsed })
  // Returns { sectionEl, bodyEl, headerEl }.
  // header layout (flex row, baseline-aligned):
  //   [▼ chevron]  [headerChip]  [headerSuffixText]  [(count)]  [+ add]
  // chevron toggles bodyEl.hidden; (count) shows even when 0; the +-add
  // button calls onAdd(); the section is the SOLE owner of collapse state.

buildSubjectGroup({ chips, defaultCollapsed = true, summaryText })
  // Returns a collapsible group of subject chips. Default collapsed.
  // Header is: [▶ chevron] [summaryText] (e.g. "5 subjects").
  // Expanded body wraps `chips` (DOM nodes the caller supplies).
  // Used inside lecdem-row and any future row that has many subject chips.
```

Both `media_player.js` (right panel) and `bani_flow.js` (left panel) **must** route through these constructors for their headers, sections, and subject groupings. No exceptions. Inline construction of section headers in either panel is a regression and must be removed.

### D2. Panel header (item 3)

The right panel's musician header becomes:

```
┌────────────────────────────────────────┐
│  ◆ Vina Dhanammal                      │   ← .musician-chip (chip-panel-row, level: instance)
│  1867–1938   ⌖  ↗ wiki   ✎ edit         │   ← .panel-header-affordances row
└────────────────────────────────────────┘
```

The left panel's subject header (raga or composition) becomes structurally identical:

```
┌────────────────────────────────────────┐
│  ◆ Bhairavi                  + edge   │   ← .raga-chip (chip-panel-row) with co-located + button
│  Janya of Natabhairavi                 │   ← lifespan-equivalent: parent-mela / janaka prose
│  ↗ wiki    ✎ edit                       │   ← .panel-header-affordances row
└────────────────────────────────────────┘
```

The `+` (add edge / add HER / add composition) **must** sit immediately adjacent to the subject chip on its line (row 1), not be flushed to the far right. The `+` for `Hindustani equivalents:` (row 3 or below) similarly sits adjacent to its label, never `justify-content: space-between` flushed.

The external-link button is rendered with the **encircled icon-btn class already used for play/external-link on recording rows** (`.icon-btn-circled` or whatever the existing class is; Coder identifies it during implementation). This makes it visually prominent and consistent with the recording row affordance the user already recognises (item 2 + item 3).

### D3. Section component (item 1)

Every section in either panel — `Lecdems`, `Recordings by Raga`, `Compositions`, `Concerts`, `Hindustani Equivalents`, `Lecdems on X`, etc. — uses `buildSection`. This guarantees:

- Collapse chevron present in both panels.
- Item count present in both panels.
- `+` add button present in both panels (when an `onAdd` callback is supplied).
- Header is a flex row with consistent baseline alignment.

For the left panel's `Lecdems on X` strip specifically: it currently has none of these. After this ADR, it has all of them. The strip's existing prose-only header (`Lecdems on Bhairavi (3)`) is replaced by the standard `buildSection` header rendered with the `Lecdems` chip per ADR-127.

### D4. Empty-section demotion (item 5)

`buildSection` accepts a parameter `count`. The panel renderer (left or right) collects all sections, renders them via `buildSection`, then performs a **stable partition** before appending to the DOM: sections with `count > 0` come first (in their natural order), sections with `count === 0` come last (in their natural order). The empty sections are still rendered — their `+` button matters for discoverability — but they never displace a populated section above the fold.

The demotion is a **single sort step in the panel renderer**, not a CSS hack. It happens before `appendChild`. Collapsing/expanding by the user does not re-sort.

### D5. Subject-group collapse default (item 7)

Lecdem subject chips currently render flat. `_buildLecdemSubjectChips` (right panel) and `_buildBaniFlowLecdemSubjectChips` (left panel) — note: these two functions also duplicate logic and should converge — both wrap their output in `buildSubjectGroup({ chips, defaultCollapsed: true, summaryText: '<N> subjects' })`. The chevron uses the same glyph (`▶` collapsed / `▼` expanded) as `buildSection`.

The lecturer chip and the lecdem play/external-link bracket are **outside** the subject group — they remain always visible. Only the `raga + comp + co-musician` cross-link list is collapsed.

### D6. The two `*LecdemSubjectChips` functions converge

`_buildLecdemSubjectChips(subjects, excludeMusicianId)` (right panel) and `_buildBaniFlowLecdemSubjectChips(subjects, excludeType, excludeId)` (left panel) build the same chip list with different exclusion rules. Coder collapses them into one:

```
buildLecdemSubjectChips(subjects, { excludeMusicianId, excludeRagaId, excludeCompId })
```

Both panels call it. The convergence eliminates the most common drift surface between the two panels.

---

## Consequences

**Gains**:
- Item 1 resolved: lecdem section identical in both panels.
- Item 2 + 3 resolved: panel header is a predictable two-line affordance row in both panels; encircled external-link consistent with recording rows.
- Item 5 resolved: empty sections demoted, populated sections always above the fold.
- Item 7 resolved: long subject lists collapsed by default.
- All future cosmetic changes to a section, subject group, or panel header touch *one* component, not two. The "we keep changing only one panel" anti-pattern is structurally prevented.

**Losses / risks**:
- The introduction of `panel_components.js` is a non-trivial refactor. Coder must port the existing inline constructions in both panels to call the new constructors. Risk: regressions in event binding, CSS class naming, focus management, scroll restoration. Mitigation: do it section-by-section, render and visually verify after each port; ADR-013 (single-source-of-truth traversal layer) precedent shows this kind of refactor is tractable here.
- The collapse-default for lecdem subject chips changes the visible information density. Risk: users who expected to see all subjects at a glance now must click. Mitigation: summary text shows the count (`5 subjects`) so the magnitude is visible without expanding.
- The empty-section demotion is a sort step that may surprise scripts/tests that assert section order. Audit and update.

**Depends on**:
- ADR-127 (vocabulary chips) — `buildSection` consumes a `headerChip` element produced per ADR-127's chip-at-section-header-scale.

**Supersedes**:
- None directly. Extends ADR-011 (sidebar symmetry) by adding component-level symmetry on top of the existing width / search-wrap symmetry.

---

## Implementation

Coder's order of operations:

1. Land ADR-127 first (vocabulary chips). `buildSection` cannot be implemented cleanly without the chip-at-section-header-scale modifier in place.
2. Create `panel_components.js` with the three constructors (`buildPanelHeader`, `buildSection`, `buildSubjectGroup`) and the converged `buildLecdemSubjectChips`. Add CSS for `.panel-header-affordances`, `.section-collapse-chevron` (rename existing `.section-collapse-btn` if needed for consistency), `.subject-group`, `.subject-group-summary`, `.icon-btn-circled` (if not already present — verify by inspecting the recording-row play/external-link buttons).
3. Port the right panel's musician header to `buildPanelHeader`.
4. Port the right panel's `Lecdems`, `Concerts`, `Compositions`, `Recordings by Raga` sections to `buildSection`.
5. Port the right panel's lecdem subject chips to `buildSubjectGroup`.
6. Port the left panel's subject (raga / comp) header to `buildPanelHeader`.
7. Port the left panel's `Lecdems on X` strip and `Hindustani Equivalents` block to `buildSection`.
8. Port the left panel's lecdem subject chips to `buildSubjectGroup`.
9. Implement empty-section demotion in both panels' renderers.
10. Run `bani-render`. Visually verify both panels at 320 / 768 / 1440 viewport widths. Verify collapse state, count badges, `+` add affordances, encircled external-link buttons.
11. Spot-check that no inline section-header construction remains in either panel (`grep -n "section-header" carnatic/render/templates/{bani_flow.js,media_player.js}` — every match should now be inside or adjacent to a `buildSection` call).

Librarian: no work — presentational only.

---

## Open Questions

- Should `buildPanelHeader`'s lifespan slot accept arbitrary prose (so the left panel can use it for `Janya of Natabhairavi` / parent-mela line), or should there be a separate `subtitleText` parameter? Provisional: a single `subtitleText` parameter that the panel fills with whatever it wants. Coder may refine.
- Should the empty-section demotion be configurable per panel (e.g. always keep `Concerts` last regardless of population)? Defer; revisit if a real case appears.
- Where do `panel_components.js` files live in the render template tree, and does the inlining order in `html_generator.py` need to be updated so they load before `bani_flow.js` / `media_player.js`? Coder's call.
- Is there value in exposing these constructors on `window.PanelComponents` for the help deck and entry forms to reuse, or are they panel-only? Defer.
