# ADR-137: Guru and Shishya Chips in the Musician Panel

**Status**: Proposed
**Date**: 2026-05-12
**Author**: Graph Architect
**Depends on**: ADR-127 (vocabulary chips everywhere), ADR-022 (raga panel navigability — the mela→janyas precedent), ADR-128 (symmetric panel base), ADR-126 (swara-first chromatic palette — chip era tinting)
**Related**: ADR-134 (connected-only Guru-Shishya view — these chips are the alternate access path for orphans), ADR-011 (left/right sidebar symmetry)

---

## Context

The Mela-Janya view's right-sidebar (raga/mela) panel exposes **navigable janya chips**: when a mela is selected, the panel renders all its janyas as small, era-tinted chips (`raga-chip`-style), each clickable to navigate to that janya's panel. This pattern (originating in ADR-022, generalised by ADR-127) gives the rasika a *direct in-panel traversal axis* without leaving the panel or hunting on the canvas.

The Musician panel has no equivalent. To traverse the guru-shishya axis from a musician panel, the user must:

1. Close the panel (or remember the musician)
2. Switch to the Guru-Shishya view (if not already there)
3. Find the connected neighbours visually
4. Click one to open its panel

This is four steps for what should be a single click. The traversal axis exists in the data (`guru-shishya` edges) but is not surfaced where the rasika is reading.

It also means that **once ADR-134 suppresses orphans from the lineage view**, a musician panel opened via the Mela-Janya view or the search bar is the *only* place from which an orphan's lineage can be inspected — provided we surface it. This ADR ensures we do.

### Forces

| Force | Direction |
|---|---|
| **Panel-as-traversal** | A panel is not a dead-end; it is a centre with edges. The mela panel already honours this. The musician panel must too. |
| **Pattern reuse** | The mela→janya chip aesthetic exists, is loved, and is consistent with the chip vocabulary (ADR-127). Reusing it saves design effort and reinforces the visual language. |
| **Era as colour** | Each chip carries the era tint of the chip's *target* musician, so a glance at the chip row tells the rasika which generation the gurus and shishyas belong to. |
| **Bidirectional axis** | A musician has two lineage relations: gurus (above) and shishyas (below). Both must be shown, clearly distinguished. |
| **Compactness** | The musician panel is already dense. Chips must be small, dense-packable, and not push other panel content below the fold. |
| **Truthfulness with sparse data** | If a musician has no recorded gurus or no recorded shishyas, the panel says so explicitly (an empty row with a single `add edge` affordance per the existing edit pattern, ADR-103/104) — it does not silently omit the section. |
| **Co-existence with the lineage view** | This ADR does not replace the canvas; it adds a second access path. Power users may prefer the canvas; in-panel readers get a comparable axis. |

---

## Pattern

**Christopher Alexander, *A Pattern Language*, Pattern 95 — *Building Complex*.** The musician panel is a small building. It needs doors on more than one side: one to its compositions (already there), one to its recordings (already there), one *up* its lineage (this ADR), one *down* its lineage (this ADR).

**The Nature of Order, Book 1, Property 4 — *Alternating Repetition*.** The chip row alternates: chip, chip, chip — the same shape, different era-tint, different name. Repetition makes the row read as *a set*; alternation (via tint) keeps each chip distinct.

**Property 9 — *Echoes*.** The musician panel's guru/shishya chips echo the mela panel's janya chips. The same gesture, the same affordance, on a parallel axis. The two panels feel like siblings.

---

## Decision

### D1. Two new sections in the Musician panel: "Gurus" and "Shishyas"

A musician panel gains two new sections, rendered between the existing biographical block and the recordings/compositions sections. Section order:

```
[ Header — name, instrument, era dot, edit button ]
[ Bio block — birth/death, bani, Wikipedia link ]
[ Gurus     ← NEW ]
[ Shishyas  ← NEW ]
[ Compositions (existing) ]
[ Recordings (existing)   ]
```

Gurus appear before shishyas because *transmission flows downward*: the rasika reads "this musician learned from X, then taught Y", which matches the natural temporal reading.

### D2. Chip rendering — reuse the janya-chip aesthetic

Each guru / shishya is rendered as a chip:

- **Class**: a new `lineage-chip`, defined to inherit from the same chip base as `raga-chip` (ADR-127, ADR-128). Same border-radius, padding, font, hover affordance.
- **Era tint**: the chip's `--chip-era-bg` and `--chip-era-border` are derived from the **target musician's era** (Trinity, Bridge, Golden Age, Disseminators, Living Pillars, Contemporary). The same era→colour mapping the canvas already uses.
- **Size**: smaller than the panel header chip — matches `raga-chip` size in the mela panel.
- **Label**: the musician's display name, truncated with ellipsis if it exceeds the chip's max-width.
- **Hover**: shows the musician's instrument and birth/death years as a tooltip (existing chip-tooltip pattern).
- **Click**: opens that musician's panel (the existing in-panel navigation handler, the same one that powers `composer-chip` clicks in `bani_flow.js`).

### D3. Section layout

Each section is rendered as:

```
┌──────────────────────────────────────────────┐
│ Gurus                                        │  ← section label
│ [chip] [chip] [chip] [chip]                  │  ← chip row, wraps as needed
└──────────────────────────────────────────────┘
```

- Section label uses the existing panel-section heading style.
- Chips wrap naturally (flex-wrap).
- A chip row with no entries renders the section with the placeholder text **"None recorded"** plus the existing edit-affordance pencil (per ADR-103/104) that opens the entry-form pre-targeted at the guru-shishya edges section for this musician. This makes the empty state a *productive* affordance, not a dead-end.
- A chip row with many entries (heuristic: > 12) collapses behind a `Show all (N)` toggle to protect panel density. The first 12 are shown by era-recency (most-recent era first) — i.e., a young musician's gurus are usually fewer than their shishyas; this heuristic biases visibility toward the larger axis.

### D4. Sort order within a section

Within Gurus and within Shishyas, chips are sorted by **the target musician's `y(node)` from ADR-136** (interpolated birth year), oldest first within Gurus (so the chronologically earliest guru reads first), youngest first within Shishyas (so the most recent disciples read first). This puts the *primary* lineage chronology in the natural reading order for each section.

If `y(node)` is unavailable (the rare case where neither birth nor lineage interpolation yields a year), chips fall back to alphabetical order at the end of the section.

### D5. Co-performer / concert edges out of scope

Only `type: "guru-shishya"` edges seed these sections. Concert-bracket co-performers (ADR-018, ADR-019) belong in the recordings section where they already live, not here. This keeps the section's grammar pure: *Gurus = those who taught this musician; Shishyas = those this musician taught.*

### D6. Composes with view-switching

Clicking a chip opens the target musician's panel and **does not switch views**. If the user is in Mela-Janya, they remain in Mela-Janya. If they are in Guru-Shishya, the canvas selection follows the panel (existing behaviour). The chip is panel-navigation, not view-navigation.

A small canvas-pin icon (`🔍`) on the chip's right edge — optional, follow the existing pattern from the composer chip — explicitly *focuses the canvas* on that musician (centring + selection) in addition to opening the panel. This is the explicit "take me to the canvas" affordance for users who want it.

---

## Consequences

- **Positive**: The musician panel becomes a complete unit of guru-shishya traversal. Two-axis navigation (lineage + repertoire) now works without leaving the panel.
- **Positive**: Orphans suppressed from the lineage view (ADR-134) remain fully reachable via the panel — the suppression no longer costs the rasika anything.
- **Positive**: The visual language is reinforced: chips are the universal navigable atom, here as in the mela panel.
- **Positive**: Empty-state edit affordance (D3) creates a low-friction path from "I notice this musician's lineage is missing" to "I am adding it now" — a curation-loop tightening with no extra forms work.
- **Negative**: The panel grows two sections taller. Mitigated by D3's collapse-after-12 rule and by the natural compactness of chips.
- **Negative**: Two sources of truth for "who taught whom" exist visually (canvas + panel). Acceptable: they read the same data, and the canvas remains the spatial overview while the panel is the focused list.
- **Neutral**: No schema change. No new fields. No new edge types.

---

## Implementation

This is a **musician-panel template addition** plus a small CSS extension — assignable to the Carnatic Coder once Accepted.

| File | Change |
|---|---|
| `carnatic/render/templates/musician_panel.js` (or wherever `renderMusicianPanel` lives) | Add `renderGurusSection(musician, graphData)` and `renderShishyasSection(musician, graphData)`, slotted per D1. Use the existing edge-traversal helpers (`gurusOf`, `shishyasOf` — already exist in JS analogs of `cli.py gurus-of` / `shishyas-of`); if they do not exist, the Coder writes them as small pure functions over `graphData`. |
| `carnatic/render/templates/base.html` (CSS) | Add `.lineage-chip` rule set inheriting from the chip base; reuse `--chip-era-bg` / `--chip-era-border` token machinery; section label style reused from existing panel sections. |
| `carnatic/render/templates/musician_panel.js` | Wire chip click → existing `openMusicianPanel(id)`; wire optional `🔍` icon → existing canvas-focus helper. |

**No data files change. No render-pipeline schema changes. No CLI changes.**

**Verification after `bani-render`**:
- Open any musician panel: Gurus and Shishyas sections appear, populated with era-tinted chips.
- Click a chip: target musician's panel opens; current view is preserved.
- Open a musician with no recorded gurus: section says "None recorded" with an edit pencil.
- Open an orphan suppressed by ADR-134: the panel shows their lineage chips (if any) — the panel is now the canonical path to their relations.
- Mela panel's janya chips and musician panel's lineage chips are visually a family (same size, same chip aesthetic, different domain).

---

## Status history

- 2026-05-12: **Proposed** by Graph Architect.
