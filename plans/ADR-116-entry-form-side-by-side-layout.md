# ADR-116: Entry Form Side-by-Side (Grid) Layout

**Status**: Accepted
**Date**: 2026-05-07
**Authors**: graph-architect

---

## Context

All entry forms (Add Musician, Add Raga, Add Composition, Add Recording, Edit Entity, Add YouTube, Add Lecdem, and their nested mini-forms) stack each field as a full-width input below a small uppercase label. On the 460 px entry-window desktop width, a 12-field form occupies roughly 480 px of scrollable height — more than half a viewport — forcing the user to scroll before seeing action buttons.

The visual problem compounds when repeating blocks are present (e.g. the Musician form has up to N YouTube entries each containing ~6 fields). The user must scroll past many full-width empty inputs whose state (filled vs. empty) is hard to scan at a glance.

The form system is architected around a single `efRow()` DOM factory and a single `.ef-row` CSS class, both defined in `entry_forms.js` and `base.html` respectively. This makes a layout change extremely low-risk: **one CSS rule change propagates to every form in the system simultaneously**.

---

## Pattern

*Levels of Scale / Strong Centres* (Christopher Alexander): a form's labels and inputs are paired centres. Aligning them side-by-side creates stronger horizontal rhythm and makes the "filled vs. empty" state legible at a glance without scrolling. The left column (labels) acts as a stable anchor; the right column (inputs) is where attention travels.

---

## Decision

Replace the flex-column `.ef-row` with a two-column CSS Grid. A `--ef-label-width` CSS custom property acts as the single knob that controls label column width across every form.

### Before

```css
.ef-row {
  display: flex; flex-direction: column; gap: 3px;
  margin-bottom: 10px;
}
.ef-label {
  font-size: 0.68rem; color: var(--fg-sub);
  text-transform: uppercase; letter-spacing: 0.08em;
}
.ef-label .ef-hint {
  font-size: 0.62rem; color: var(--fg-muted);
  text-transform: none; letter-spacing: 0; margin-left: 4px;
  font-style: italic;
}
```

### After

```css
:root {
  --ef-label-width: 120px;   /* ground-truth label column width for all entry forms */
}

.ef-row {
  display: grid;
  grid-template-columns: var(--ef-label-width) 1fr;
  align-items: start;
  gap: 0 8px;
  margin-bottom: 6px;
}
.ef-label {
  font-size: 0.68rem; color: var(--fg-sub);
  text-transform: uppercase; letter-spacing: 0.08em;
  padding-top: 6px;            /* align label baseline with input top edge */
  line-height: 1.3;
}
.ef-label .ef-hint {
  display: block;              /* drops hint onto its own line in the label column */
  font-size: 0.62rem; color: var(--fg-muted);
  text-transform: none; letter-spacing: 0; margin-top: 2px;
  font-style: italic;
}
```

Modifier class for full-width fields (when needed by future forms):

```css
.ef-row--full {
  grid-template-columns: 1fr;
}
```

---

## Consequences

**Positive**:
- All 11+ entry forms gain side-by-side layout with zero per-form code changes.
- Form height drops by ~50% per field (label no longer takes a full row).
- "Filled vs. empty" state becomes scannable down the right column.
- `--ef-label-width` is a single CSS token to tune label width globally.
- `.efRow()` JS function signature is unchanged; no calling-code updates needed.

**Negative / trade-offs**:
- On the minimum entry-window width (380 px): 120 px label + 8 px gap + 252 px input = exactly 380 px. Tighter but still functional. If the window is ever narrowed further, a media-query guard may be needed.
- `.ef-section` chip headers and `.ef-add-btn` elements span the full grid width (they are not `.ef-row` children so are unaffected — they sit as direct children of `.ew-body`).
- Hint text now lives below the label in the left column rather than inline with the label. This is cleaner (hint does not stretch the label row) but reduces hint prominence.

---

## Implementation

**Files touched**:
- `carnatic/render/templates/base.html` — CSS only (`:root` token + `.ef-row`, `.ef-label`, `.ef-hint` rules)
- `carnatic/render/templates/entry_forms.js` — add `.ef-row--full` modifier support to `efRow()` (optional 6th `opts` param) if any caller needs it

**Steps**:
1. Add `--ef-label-width: 120px` to the `:root` design-token block in `base.html`.
2. Replace `.ef-row` flex-column with CSS Grid as specified above.
3. Update `.ef-label` (add `padding-top: 6px; line-height: 1.3`).
4. Update `.ef-label .ef-hint` (`display: block; margin-top: 2px`, remove inline margin).
5. Add `.ef-row--full` modifier rule.
6. Run `bani-render` and open each form in the browser to verify.

**Verification checklist**:
- [ ] Add Musician form: all fields side-by-side
- [ ] Add Raga form: all fields side-by-side; Melakarta conditional fields still show/hide correctly
- [ ] Add Composition form: Raga combobox aligns correctly in right column
- [ ] Add Recording form: top-level fields + nested Session/Performer/Performance fields all side-by-side
- [ ] Edit Entity form: patchable fields side-by-side
- [ ] Focused YouTube / Lecdem forms: side-by-side
- [ ] `.ef-id-row` (already flex) still renders correctly as input-column child
- [ ] Combobox portalled dropdown aligns with its trigger input
- [ ] No horizontal overflow at 380 px window width

[AGENTS: graph-architect, carnatic-coder]
