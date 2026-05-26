# ADR-153: Canonical Editable-Chip Taxonomy

**Status**: Proposed  
**Date**: 2026-05-26  
**Author**: Graph Architect  
**Context**: AUDIT-012 Finding 3 — pencil hover affordance is broader than the dblclick-to-edit surface

---

## Context

The UI exposes an edit affordance — a `✎` pencil pseudo-element shown on hover — for chips that can be double-clicked to open an edit form. As of AUDIT-012, the scope of the hover CSS and the scope of the dblclick handler are **inconsistent**:

### Current state (Before)

**CSS pencil hover** (`base.html` lines ~1906–1992):

```css
/* Left sidebar: correctly scoped to panel-title only */
#left-sidebar [data-chip-role="panel-title"][data-entity-type][data-entity-id]:hover::after {
  content: '✎'; ...
}

/* Right sidebar: all chip roles get the pencil — over-broad */
#right-sidebar [data-chip-role][data-entity-type][data-entity-id]:hover::after {
  content: '✎'; ...
}
```

**Dblclick handler** (`chip_dblclick.js` lines 147–152):

```javascript
if (chipRole !== 'panel-title') {
  // Still track for single-click nav — but do not enter edit mode.
  lastEntityKey = entityType + '|' + entityId;
  lastClickTime = Date.now();
  return;           // ← edit form is NEVER opened
}
```

**Result**: Entity chips (`data-chip-role="entity"`) in the right sidebar — musician lineage chips, trail row chips visible in the Wheel Detail Panel — show `✎` on hover, but double-clicking them navigates rather than opening an edit form. The pencil is a **false affordance** for those chips.

Additionally, `buildPanelHeader` in `panel_components.js` has an `onEdit` parameter mentioned in the docstring, but the implementation never renders an edit button — an incomplete unification point.

### Forces in tension

1. **Fidelity**: The `✎` should only appear where dblclick actually works. Every pixel of false affordance erodes trust.
2. **Discoverability**: The more chips show `✎`, the more users learn the gesture — but only if the gesture actually fires.
3. **Scope of editing**: Some `entity`-role chips (e.g., a musician chip in their own lineage list in the right sidebar) are plausible edit targets. Others (trail rows for musicians in a raga bani flow) are not — the musician is incidental context, not the subject.
4. **Implementation cost**: Extending the dblclick handler to cover `entity`-role chips requires deciding which panels and which entity types are editable in that context. Getting this wrong creates unexpected form-opens.

---

## Pattern

**Principle of Honest Affordance** (from Alexander's "each level of scale should be self-similar"): a visual signal should precisely predict the interaction it enables. An affordance that fires some of the time is worse than no affordance — it teaches users to distrust the UI.

The correct pattern is: **one role → one behaviour**. `panel-title` always opens an edit form on dblclick. `entity` never does. If a chip in a new context warrants dblclick-edit, introduce it as `panel-title` (if it is the subject of its panel) or define a new distinguished role.

---

## Decision

### Chosen direction: **narrow the CSS to match the handler** (not extend the handler)

Do NOT extend the dblclick handler to cover `entity`-role chips. Instead, restrict the CSS pencil hover to only `panel-title` chips across all panels, matching the existing `chip_dblclick.js` behaviour exactly.

**Rationale**: Entity chips in trail rows and lineage lists serve navigation. Opening an edit form from a navigation chip requires the form to know where to "return" after close, which introduces cross-panel state coupling we do not want. The correct place to edit a musician encountered in a trail row is to navigate to that musician's panel (single-click) and then double-click their `panel-title` chip.

### After (target state)

**CSS**:
```css
/* All panels: only panel-title chips get the pencil — matches dblclick handler exactly */
[data-chip-role="panel-title"][data-entity-type][data-entity-id]:hover::after {
  content: '✎';
  /* ... same styling as current ... */
}
```

**Dblclick handler**: unchanged — `panel-title` only, as today.

**`buildPanelHeader`**: the `onEdit` parameter should be removed from the docstring if it is not implemented, or implemented if the panel header is a natural edit entry-point. For panels that already have a `panel-title` chip (musician panel, bani panel), the `panel-title` chip IS the edit entry-point and no separate button is needed.

### Excluded from this ADR

- Introducing a new `editable-entity` chip role. This is over-engineered for the current use-cases and deferred until there is a concrete panel where entity-chip-level editing is genuinely needed.
- Adding edit affordance to `section-header` chips. These already have their own dblclick action (add, not edit) via `chip_dblclick.js` `_handleSectionAdd`. No change needed.

---

## Consequences

- Right-sidebar entity chips (musician lineage rows, WDP trail entries) lose the `✎` hover. These chips navigate on click; the pencil was always incorrect for them.
- The CSS becomes simpler: one rule for the pencil applies to all panels uniformly.
- `buildPanelHeader` docstring is cleaned up to remove the unimplemented `onEdit` stub reference.
- No behaviour change in the dblclick handler — existing panel-title chips (bani panel raga/comp subject, musician panel header chip, WDP panel-title chip) continue to open edit forms as expected.

---

## Implementation

**Assigned to**: Carnatic Coder

**Tasks**:

1. **`base.html`** — replace the two separate pencil hover rules (one for `#left-sidebar`, one for `#right-sidebar`) with a single unified rule scoped to `[data-chip-role="panel-title"]` only:

   ```css
   /* Before — two rules, second over-broad */
   #left-sidebar  [data-chip-role="panel-title"][data-entity-type][data-entity-id]:hover::after { ... }
   #right-sidebar [data-chip-role][data-entity-type][data-entity-id]:hover::after { ... }

   /* After — one rule, correctly scoped */
   [data-chip-role="panel-title"][data-entity-type][data-entity-id]:hover::after { ... }
   ```

   Verify that the `cursor: pointer` and dashed-outline hover rules follow the same narrowing.

2. **`panel_components.js`** — remove the `onEdit` parameter reference from the `buildPanelHeader` docstring (or implement it — Coder's call based on whether any caller needs it).

3. **`chip_dblclick.js`** — no changes required.

4. Run `bani-render` and confirm graph.html renders without errors.
