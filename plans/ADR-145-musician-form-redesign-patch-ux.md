# ADR-145 — Musician Form Redesign, Patch UX, and Panel-Title Hover Affordance

**Status**: Accepted  
**Date**: 2026-05-17  
**Accepted**: 2026-05-17  
**Author**: Graph Architect  
**Depends on**: ADR-031 (entry forms), ADR-083 (bundle as canonical write channel), ADR-085 §3 (loop closure), ADR-097 (patch deltas + edit forms), ADR-127 (chip vocabulary), ADR-142 (chip dblclick), ADR-143 (bundle as patch file), ADR-144 (section-header + row-block dblclick)  
**Amends**: ADR-097 §5 (birth/death removed from Add Musician form), ADR-083 §7 (bundle→patch in UI prose)

---

## Context

Four independent but coupled issues motivate this ADR. They are coupled because fixing any one of them
in isolation would produce a UI with internal inconsistencies. They are resolved together here.

### Issue 1 — Bundle is already a Patch; the label should say so

ADR-143 §Context last paragraph ratified the conceptual rename: _"the bundle is a patch file"_.
The button text was updated (`⬇ Patch (N ops)`). But the following surfaces still use "bundle":

- Section header label `BUNDLE` in `entry_forms.js` `_updateBundleBtn` artefacts
- Internal JS identifiers (`baniBundle`, `addToBundle`, `_updateBundleBtn`) — these are fine as
  internal names; the rule is that _user-visible text_ must say "patch"
- All forms use "Download JSON" / "Preview JSON" as the per-form footer buttons — these predate
  the bundle and still read as standalone-file actions rather than patch-staging actions
- The global download button says `⬇ Patch (N ops)` correctly — but is not reachable from
  _inside_ a form. A "Add to Patch" CTA inside each form is missing entirely

### Issue 2 — Add Musician form is too tall and mixes data tiers

The current form has seven named rows before the first section break (Display Name, ID, Born, Died,
Era, Instrument, Source URL). Born and Died are the least important fields — they are secondary
provenance data always available on the Wikipedia link the user has just entered in Source URL.
Removing them from the form reduces cognitive load and collapses the form by two rows.

Additionally, Traditions (Carnatic / Hindustani) should appear as two pickable toggle chips on the
same horizontal line — they are mutually exclusive and binary, not a text field.

### Issue 3 — Guru-Shishya edges are a scroll-heavy vertical stack

Each edge currently occupies its own `ef-repeat-block` with four labelled rows (Guru/Shishya,
Confidence, Source URL, Note). In the Add Musician form, each such block is ~96px tall. Two edges
fills the remaining visible window entirely. Users cannot see the full form at a glance.

The numbered-dropdown in the Musician panel header (see `panel_components.js`) already provides the
right aesthetic: a compact row of clickable chips, each representing one guru or shishya. That chip
row is the correct model for the form too. The Add Musician form should present:

- A **GURUS** chip row (initially empty, grows with each addition)
- A **SHISHYAS** chip row (same)
- An **"+ Add Guru"** / **"+ Add Shishya"** tag-button that opens a compact popover
  (not a new full block) for name, confidence, source URL, note

The alternative route flagged by the user — double-clicking a guru/shishya chip inside the
numbered-dropdown button in the Musician panel to open the edge editor — is in scope and should
be implemented at the same time. The popover used inside the Add Musician form **is** the same
popover opened by the panel chip double-click, parametrised by direction and prefill.

### Issue 4 — Panel-title chips have no visible hover affordance for their write action

ADR-144 Phase A implemented dashed-outline on `[data-chip-role="section-add"]:hover`. But the
`BANI FLOW` and `MUSICIAN` panel-title chips (`.chip-panel-title`) have their hover filter/outline
explicitly reset to `none`:

```css
.raga-chip.chip-panel-title:hover,
.comp-chip.chip-panel-title:hover,
.musician-chip.chip-panel-title:hover,
.lecdem-chip.chip-panel-title:hover {
  filter: none;
  outline: none;       ← this prevents any hover signal
}
```

The `BANI FLOW` chip is a `.bani-chip.chip-panel-title` — not in that rule — yet it also gets no
affordance because it has no `:hover` rule at all. Result: both panel-title chips do something
useful on double-click (confirmed by ADR-142 Phase δ) but show no cursor or glyph that says so.

The fix must:
- Show a `✎` (U+270E or `✎`) pseudo-element on hover, positioned as a 9–10px overlay in the
  top-right corner of the chip
- **Not change the chip's width or height** (the glyph overlays, it does not push text)
- Keep `cursor: default` when the chip is inert (not being hovered for dblclick action)
- Switch to `cursor: pointer` on `:hover` only

The same affordance applies to the Musician panel-title chip (`.musician-chip.chip-panel-title`)
because double-clicking it opens the Add Musician form (ADR-144 Phase A).

---

## Forces

| Force | Direction |
|---|---|
| **Loop closure (ADR-085 §3)** | Every read surface implies a write surface. Panel-title chips are read surfaces — their write surface (dblclick → add form) must be discoverable. |
| **Patch as the conceptual model (ADR-143)** | All user-facing text in forms must use "patch"; internal JS names are exempt. |
| **Form concision** | The Add Musician form should fit on one screen without scrolling for the common case (name + era + instrument + wikipedia link, no edges). Born/died are secondary; removing them achieves this. |
| **Guru/shishya as a chip collection** | The panel already renders gurus/shishyas as chips (numbered-dropdown). The form should match the read model: chips in, chips out. |
| **Edge detail (confidence, source, note) is infrequently changed** | Hiding it behind a popover keeps the happy path (pick a name) one click, while still making the detail fields reachable. |
| **Double-click on guru/shishya panel chip** | The panel's chip row is a read surface for edges. Making it double-clickable to open the edge popover (edit mode) is the loop closure for edges. |
| **Aesthetic consistency** | The edit form must look identical to the add form, with fields pre-filled. An edit form that differs visually from the add form creates a two-vocabulary problem. |
| **No born/died in the form** | Born and died are not required for graph correctness. They are secondary metadata set by the Librarian later, not by the contributor at intake. Removing them from the form is correct — they remain in the schema and can be set via patch. |
| **Traditions as toggle chips** | Carnatic / Hindustani are not text; they are binary tokens. Toggle chips on one line reduce vertical space and make the selection self-evident. |

---

## Pattern

**Strong Centres + Levels of Scale** (Alexander).
The form window is a Strong Centre. Every row inside it must justify its vertical space by carrying
information that cannot be inferred, defaulted, or deferred. Born/died fail this test — they are
on Wikipedia, and contributors cannot reliably source them independently. Removing them strengthens
the form's centre: every remaining row is essential.

The guru/shishya section uses a **collection chip row** — the same pattern the Musician panel
already uses for the same data. This is _Levels of Scale_: the form-level representation of a
guru/shishya set is a chip row, just as the panel-level representation is. Same shape, same
interaction.

---

## Decision

### D1 — Patch terminology in all user-visible text

**Before**:
- Form footer buttons: "⬇ Download JSON" / "Preview JSON"  
- Section label: "Bundle" (when visible)

**After**:
- Primary CTA inside each form: **"+ Add to Patch"** (enabled when form is valid)  
- Secondary action: **"Preview JSON"** (unchanged — it previews what would be staged)  
- Per-form download (standalone file) is removed; the only download path is via the global
  `⬇ Patch (N ops)` button in the toolbar (ADR-083 §7)
- The global toolbar button text stays `⬇ Patch (N ops)` (already correct)

### D2 — Add Musician form: remove born/died, add traditions, compact era row

**Before** (seven rows before YouTube section):
```
Display Name *
ID *            [Edit]
Born (year)
Died (year)
Era *           [dropdown]
Instrument *    [dropdown]
Source URL *
```

**After** (five rows):
```
Display Name *              [↗ external link button — appears after source URL is filled]
ID *                        [Edit]
Era *           [dropdown]   (traditions: [Carnatic] [Hindustani] chips on same line)
Instrument *    [dropdown]
Source URL *
```

- Born and Died fields are **removed** from the Add Musician form. They remain in the schema and
  can be set via a Librarian patch; they are not asked at intake.
- The external link `↗` button (opens source URL in a new tab) appears inline after the display
  name once source URL is filled, **on the same row as Display Name**. It replaces the separate
  "open Wikipedia" affordance that was below the ID row.
- Tradition chips (Carnatic / Hindustani) appear on the same horizontal line as the Era dropdown,
  as mutually exclusive toggle chips. Default: Carnatic selected.
- The ID row stays; its auto-derive-from-label behaviour is unchanged.

### D3 — Guru-Shishya section: chip collection with detail popover

**Before**: each guru or shishya is a full `ef-repeat-block` (~96px, four labelled inputs).

**After**:

```
GURU-SHISHYA EDGES
─────────────────────────────────────────────
GURUS          [empty chip row]  [+ Add Guru]
SHISHYAS       [empty chip row]  [+ Add Shishya]
```

- **Chip row**: each added guru/shishya appears as a small removable chip (name label + `×` remove)
- **"+ Add Guru"** / **"+ Add Shishya"** opens a compact inline popover (not a new block) with:
  - Musician picker (combobox)
  - Confidence (0–1, default 0.90) — initially collapsed, labelled "details ▸"
  - Source URL — in same collapsible section
  - Note — in same collapsible section
  - Confirm button → chips the musician into the row; closes popover
- Double-clicking a chip in the chip row re-opens the popover pre-filled with that edge's detail

### D4 — Double-click on guru/shishya chips in the Musician panel's numbered-dropdown

The numbered-dropdown button (the `1↑ 2↓` button in the Musician panel header) renders guru and
shishya chips. These chips are currently single-click only (navigate to that musician).

**After**: double-clicking a guru/shishya chip in the dropdown opens the **edge detail popover**
(same popover as D3) pre-filled with the existing edge's data (confidence, source_url, note),
with all fields editable, and an **"Update in Patch"** CTA that stages a `patch` op for the edge.

This is loop closure for edges: the read surface (chip in dropdown) implies the write surface
(edge popover).

### D5 — Panel-title hover affordance (pencil glyph)

**Before**: `.raga-chip.chip-panel-title:hover { filter: none; outline: none; }`  
**After**:
- Remove the `outline: none` / `filter: none` reset for panel-title chips (or scope it
  to non-hover state)  
- Add a CSS `::after` pseudo-element: `content: "✎"`, positioned `absolute` at top-right corner
  of the chip, font-size ~9px, opacity 0 normally, opacity 1 on `:hover`  
- Switch `cursor` to `pointer` on hover  
- The chip's own width and padding are **not changed** — the glyph is positioned outside the flow
  using `position: absolute` with the chip having `position: relative`  

This applies to:
- `.bani-chip.chip-panel-title:hover` (BANI FLOW chip)
- `.musician-chip.chip-panel-title:hover` (MUSICIAN chip)

### D6 — Edit Musician form aesthetics match Add Musician form

The Edit Musician form (opened by double-clicking a musician chip, ADR-142) already uses
`buildEditForm(entityType, entityId, prefill)` from `edit_form_spec.js`. This ADR requires:
- Same compact layout as D2 (no born/died rows)
- Traditions chips on same line as Era (D2)
- Guru-shishya chip collection (D3), pre-populated from existing edge data, non-destructive
  (user can add new edges; existing edges are shown as un-removable reference chips)
- Same "Add to Patch" primary CTA

---

## Consequences

### Positive
- Add Musician form fits on one screen for the common case
- Guru/shishya collection is visually consistent with the panel read model
- Patch terminology is consistent across all write surfaces
- Panel-title chips signal their affordance without visual clutter
- Born/died removal reduces data-entry mistakes (contributors often guess birth years)

### Negative / Risks
- Born/died values can no longer be set at musician-create time; they require a follow-up
  Librarian patch. This is acceptable: Librarians are the authoritative source for birth/death
  years (Wikipedia scrape), not contributors.
- The compact edge chip row loses the "direction label" (Guru / Shishya of) that was visible in
  the old block. Mitigation: the two rows are labelled `GURUS` and `SHISHYAS` at section level.
- Removing the standalone Download JSON button means contributors cannot download a single-entity
  JSON for manual editing. This is intentional: the patch file is the output, not a standalone
  entity file. Librarians who need raw JSON use the CLI (`python3 carnatic/cli.py get-musician`).

---

## Implementation

**Scope**: `carnatic/render/templates/entry_forms.js`, `carnatic/render/templates/base.html`  
**No data file changes required.**  
**No schema changes required** (born/died remain in schema; the form just no longer asks for them).

Phases:

**Phase A — Hover affordance (CSS only, base.html)**
- Remove `outline: none; filter: none;` from the `.chip-panel-title:hover` rule
- Add `::after` pencil glyph rule for `.bani-chip.chip-panel-title` and `.musician-chip.chip-panel-title`
- Change cursor to `pointer` on hover

**Phase B — Patch terminology (entry_forms.js)**
- Replace "⬇ Download JSON" button with "⬇ Add to Patch" as primary CTA
- Wire "Add to Patch" to call `addToBundle('musicians', nodeJson)` (internal name unchanged)
- Remove the per-form download path; the global toolbar patch button is the only download

**Phase C — Add Musician form layout (entry_forms.js)**
- Remove born/died rows
- Add traditions chips (Carnatic/Hindustani) on same line as Era dropdown
- Move external link `↗` button to same row as Display Name (appears when source URL filled)

**Phase D — Guru-shishya chip collection (entry_forms.js)**
- Replace `addEdgeBlock` with a chip-row section per direction
- Implement `openEdgePopover(direction, prefill, onConfirm)` — creates an inline popover
- Wire chip double-click to re-open the popover pre-filled
- Wire the Add Musician form's "+ Add Guru / + Add Shishya" to call `openEdgePopover`

**Phase E — Panel guru/shishya chip double-click (panel_components.js)**
- Identify guru/shishya chips inside the numbered-dropdown button render
- Wire dblclick (or the time-based detector from `chip_dblclick.js`) to open edge popover
  pre-filled from `graphData.edges`

[AGENTS: graph-architect]
