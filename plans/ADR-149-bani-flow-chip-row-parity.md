# ADR-149 — BANI FLOW Chip Row Parity (numbered popup button, row simplification)

**Status**: Accepted  
**Date**: 2026-05-18  
**Agents**: graph-architect, carnatic-coder  
**Depends on**: ADR-020 (subject header), ADR-113 (HER ragas), ADR-148 (bani history)

---

## Context

The MUSICIAN panel chip row is: `[era-chip]  [⇅ N popup-btn]  [wiki-link]`

The BANI FLOW subject header has grown organically to four rows:
1. `[icon] [name-chip] [wiki-link]`
2. "Janya of [parent-chip]" / "Mela N · Cakra M" / "Thaat: X"
3. Aliases row (vestigial — never populated in current code)
4. Janyas toggle + filterable list (mela ragas only)
5. Hindustani / Carnatic equivalents row

The raga wheel and the popup button introduced in this ADR render rows 2–5 redundant. Removing
them gives the BANI FLOW panel a single-row header that matches the MUSICIAN panel in density and
shape, while preserving all navigational affordances in a compact dropdown.

---

## Forces

- **Visual parity**: both panels should feel like siblings. One chip + one popup button + one wiki
  link is the established pattern.
- **Simplification**: the mela/cakra/thaat row, aliases row, and janyas list are now accessible
  via the raga wheel. Keeping them duplicates information and adds visual noise.
- **Discoverability**: the popup button's count badge (like the musician panel's ⇅ N) immediately
  communicates how many related entities exist without requiring row expansion.
- **Reuse**: `.lineage-popup-btn`, `.lineage-popup` CSS classes and the popup
  show/hide/position pattern from `_setupLineagePopupBtn` / `_populatePopup` in graph_view.js
  are reused with no new CSS needed.

---

## Pattern

**Single chip row** (Alexander: _Levels of Scale_ — reduce header to its minimal informative
unit; move secondary content behind a discoverable affordance rather than expanding vertically).

---

## Decision

### HTML — `base.html`

**Add** inside `#bani-subject-name-row`, after `#bani-subject-name` and before
`#bani-header-affordances`:
```html
<button id="bani-subject-popup-btn" class="lineage-popup-btn"
        style="display:none" title=""></button>
```

**Add** immediately after the closing `</div>` of `#bani-subject-name-row`:
```html
<div id="bani-subject-popup" class="lineage-popup" style="display:none"></div>
```

**Remove** entirely:
- `<div id="bani-subject-sub"></div>`
- `<div id="bani-subject-aliases-row" ...></div>`
- `<div id="bani-janyas-row" ...>` (full block including janyas-panel, filter, list)
- `<div id="bani-her-row" ...></div>`

The `#bani-notes-row` is kept — it still surfaces musicological notes.

### Popup content by context

**Janya raga** (`raga.parent_raga` non-null, `tradition !== 'hindustani'`):
- Button: `◈ N` where N = (1 mela + sibling janya count excl. self) + HER count
- Popup section 1 — "Carnatic": mela chip (`.raga-chip`, navigates to mela) + all sibling
  janyas sorted A-Z as `.raga-chip` chips
- Popup section 2 — "Hindustani equivalents": `raga.hindustani_equivalents` as `.her-chip` chips

**Mela raga** (`raga.is_melakarta === true`):
- Button: `◈ N` where N = janyas count + HER count
- Popup section 1 — "Janyas": all janyas of this mela as `.raga-chip` chips, A-Z
- Popup section 2 — "Hindustani equivalents": `raga.hindustani_equivalents` as `.her-chip` chips

**HER raga** (`raga.tradition === 'hindustani'`):
- Button: `◈ N` where N = Carnatic equivalents count (ragas whose `hindustani_equivalents`
  includes this raga's id)
- Popup section — "Carnatic equivalents": matching ragas as `.raga-chip` chips

**Composition**:
- Button: `N` where N = distinct musician node count that have a track with this `composition_id`
  (computed by iterating `graphData.nodes` tracks at render time)
- Button title: `N musician(s) · raga name · composer name`
- Popup section: raga `.raga-chip` (navigates bani flow to raga) + tala text if present +
  composer `.composer-chip` (navigates to musician panel)

### JSON before/after (raga panel state after render)

**Before** — header occupies ~5 rows:
```
Row 1: [◈ Mohanam]  [↗ wiki]
Row 2: Janya of  [◈ Harikambhoji]
Row 3: (aliases — empty)
Row 4: ▶ ◈ Janyas (42)  [collapsible list...]
Row 5: Hindustani equivalents:  [↔ Bhupali]
```

**After** — header is one row:
```
Row 1: [◈ Mohanam]  [◈ 44]  [↗ wiki]
       → popup: Carnatic: [Harikambhoji] [Abhogi] [Bilahari] ...
                Hindustani equivalents: [↔ Bhupali]
```

### JavaScript — `bani_flow.js`

**Remove** from `buildListeningTrail` reset block: all `getElementById` calls for
`bani-subject-sub`, `bani-subject-aliases-row`, `bani-janyas-row`, `bani-janyas-panel`,
`bani-janyas-list`, `bani-janyas-filter`, `bani-her-row`, `bani-her-prefix`.

**Remove** from `clearBaniFilter`: same element references.

**Remove** from raga branch of `buildListeningTrail`:
- All of `subjectSub.innerHTML = ''` and the mela / janya-of / thaat subtree (~25 lines)
- The entire `#bani-janyas-row` section including `renderJanyaList` closure (~90 lines)
- The entire `#bani-her-row` section (~40 lines)

**Remove** from composition branch: the `parts` array + separator join loop (~55 lines) that
built the Raga · Tala · Composer subtitle row.

**Add** three new functions (placed before `triggerBaniSearch`):
```javascript
function _setupBaniSubjectPopupBtn(type, subject, ragas, composers) { ... }
function _buildRagaFamilyPopupContent(raga, ragas, popup) { ... }
function _buildCompPopupContent(comp, raga, composer, graphData, popup) { ... }
```

`_setupBaniSubjectPopupBtn` is called at the end of the raga and composition header setup
blocks, after the wiki link is wired up.

The popup show/position/outside-close logic follows the pattern in
`_setupLineagePopupBtn` at graph_view.js:1086–1118 exactly.

---

## Consequences

- BANI FLOW subject header reduced to one chip row (parity with MUSICIAN panel).
- Janya navigation preserved via popup chips; mela navigation preserved via popup chips.
- HER equivalents preserved via popup second section.
- Composition raga/composer navigation preserved via popup chips.
- The `#bani-subject-sub`, `#bani-subject-aliases-row`, `#bani-janyas-row`,
  `#bani-her-row` divs are removed from the DOM entirely — they are dead code.
- `bani-her-prefix` `[Hindustani]` tag is retained in `#bani-subject-name-row`
  (it sits before the name chip and identifies HER ragas at a glance).
- Notes row (`#bani-notes-row`) is unchanged.

---

## Implementation

Files touched:
- `carnatic/render/templates/base.html` — subject header at ~line 4655
- `carnatic/render/templates/bani_flow.js` — buildListeningTrail, clearBaniFilter, new popup fns
