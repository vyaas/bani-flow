# ADR-064: Musician Panel Raga→Composition Tree for Artist View

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect
**Depends on**: ADR-061 (tree-structured bani-flow trail), ADR-059 (musician panel compositions section), ADR-054 (era-coloured chips), ADR-063 (uniform chip appearance)

---

## Context

### The structural symmetry

ADR-061 restructured the **Bani Flow panel** (left): when a raga or composition filter is active, the trail groups entries in a two-level tree — composition → artists (raga view) or artist → versions (comp view). This dramatically reduces repetition and makes the musical structure legible.

The **Musician panel** (right) contains its own flat recording list. When a musician node is selected, the panel shows that artist's recorded performances. The list is currently grouped only by *concert bracket* (recording_id) — not by musical content. A recording of Raga Bhairavi appears adjacent to a recording of Raga Kalyani with no structural separation. The raga is rendered as a plain chip on each row.

### The user statement

> "When searching by artist, we are interested in tracking the raga they've rendered first and then the composition. We should thus take a cue from the Bani Flow ADR-061 and apply the same principle here: we should have a tree structure where ragas are unfolded to reveal compositions rendered. This demonstrates an interesting and worthwhile symmetry in the treelike exploration of the data: unfolding the raga also re-emphasizes it as an important concept."

### The symmetry

| Panel | Filter context | Tree structure |
|---|---|---|
| **Bani Flow** (left) | Raga active | Composition header → artist leaves |
| **Bani Flow** (left) | Composition active | Artist header → version leaves |
| **Musician panel** (right) | Artist selected | **Raga header → composition leaves** |

The Bani Flow tree unfolds from a fixed filter (raga or composition is the known entity). The Musician panel tree unfolds from a fixed artist (the musician is the known entity). In both cases, the tree reveals the structure that the flat list buries.

### Scope

**Rendering layer only.** No data schema change. The structured perfs already carry `raga_id`, `composition_id`, and `concert_bracket` fields. Only `media_player.js` (the recording list builder) and the CSS in `base.html` change. The `.tree-group`, `.tree-group-header`, `.tree-children`, `.tree-leaf`, `.tree-chevron` CSS classes introduced by ADR-061 are **reused** — no new CSS concepts.

### What is a "recording" in this context?

The musician panel has two record sources:

1. **`nd.structured_perfs`** (primary): individual performance entries linked to composition IDs, raga IDs, concert/recording IDs, and year metadata.
2. **`nd.tracks[]`** (legacy): raw YouTube links with minimal metadata. Some have raga/composition fields resolved; many do not.

This ADR applies the raga→composition tree **only to `nd.structured_perfs`**. Legacy tracks remain a flat list below the tree, in a section labelled "Other recordings" — consistent with ADR-061's `null`-comp bucket pattern.

---

## Forces

| Force | Direction |
|---|---|
| **Structural legibility** | An artist who rendered Raga Todi in five compositions across a career has that fact buried in a chronological list. A raga header with five child compositions makes it immediately visible: "Todi: 5 compositions". |
| **Raga as primary axis** | The user's statement makes the priority explicit: raga first, then composition. This reflects the Carnatic tradition — the raga is the canvas; the composition is a vehicle for the raga. |
| **Symmetry with Bani Flow** | ADR-061's tree teaches the user the expand/collapse pattern. The same pattern in the musician panel requires no new learning. |
| **Reuse of ADR-061 CSS** | The tree classes are already defined. The coder adds no new CSS concepts — only wires up new JS grouping logic. |
| **Concert brackets survive** | A concert bracket (two or more tracks from the same concert) is a grouping at a *different* level — it is a *recording event*, not a musical category. Concert brackets are preserved as leaf-level associations: a composition leaf shows its concert bracket metadata (year, venue notes if present) as sub-labels. |
| **Recordings are their own special case** | As the user noted, recordings (YouTube links, full concert brackets) are the special cases that do *not* further sub-divide. A recording leaf is a terminal node. |
| **Single-composition raga** | An artist who recorded only one composition in a raga should see that raga group open by default with no chevron — the same "minimum surprise" rule from ADR-061. |

---

## Pattern

**Levels of Scale** (Alexander): The full recording list → raga groups → composition leaves is a three-level hierarchy. But from the user's perspective it is a two-level interaction: you expand a raga to see its compositions. Each level is a Strong Centre.

**Inversion of Bani Flow**: In Bani Flow (left panel), the *composition* is the group header and the *artist* is the leaf. In the Musician panel (right panel), the *raga* is the group header and the *composition* is the leaf. This inversion is musically meaningful: the two panels ask complementary questions.

| Panel | Asks | Shows |
|---|---|---|
| Bani Flow (left) | Who recorded this raga/composition? | Artists, grouped under compositions |
| Musician (right) | What did this artist record? | Compositions, grouped under ragas |

---

## Decision

### 1. Grouping rules

| Source | Group by | Group header content | Leaf content |
|---|---|---|---|
| `structured_perfs` | `raga_id` | raga chip (navigable → `triggerBaniSearch('raga', …)` + janya label if applicable); artist chip suppressed (already the subject) | comp chip (navigable → `triggerBaniSearch('comp', …)`) + year + concert bracket label + ▶ + ↗; raga chip suppressed |
| `tracks[]` (legacy) | (no grouping) | — | Unchanged flat `rec-legacy` list under "Other recordings" section header |

Rows with `raga_id = null` group into a single "Unknown raga" bucket at the **bottom** of the structured section, above the legacy-tracks section.

### 2. Default open/closed state

Identical rules to ADR-061:
- **1-composition raga**: always rendered open; no chevron.
- **≥2-composition raga**: starts collapsed (`▶`); **first** group in the list starts open (`▼`) to preview the pattern.
- State is **not persisted** across musician navigations — each `buildRecordingsList()` call starts fresh.

### 3. Interaction contracts

| Trigger | Behaviour |
|---|---|
| Click **raga group header** | Toggle expand/collapse. On expand: also fire `triggerBaniSearch('raga', raga.id)` so the Bani Flow panel populates with that raga's full trail — this reveals who else recorded it. On collapse: toggle only, do not clear the Bani Flow filter. |
| Click **comp chip** inside leaf | Fire `triggerBaniSearch('comp', comp.id)` — Bani Flow populates with all artists who recorded this composition. |
| Click **▶** button | Existing play logic from concert bracket / legacy track renderer, carried unchanged. |
| Click **↗** link | Existing `buildYtLink` helper, unchanged. |

**Cross-panel coupling note**: clicking a raga header on the right causes the **left** panel to repopulate. This is an intentional cross-panel coupling: the user selected an artist → sees their ragas → expands a raga → Bani Flow reveals the broader tradition for that raga. This is the symmetry the user asked for in the request.

### 4. Sort order for raga groups

Sort raga groups by **total recording count** (descending) — the raga with the most recordings appears first. This surfaces the artist's primary raga affiliations immediately. Tie-break: alphabetical by raga name.

Within a raga group, sort compositions by **earliest year** (ascending, nulls last).

### 5. DOM structure

The `.tree-group`, `.tree-group-header`, `.tree-children`, `.tree-leaf`, `.tree-chevron` CSS classes from ADR-061 are reused verbatim. No new class names are introduced.

```html
<!-- Musician panel recording list — structured perfs section -->
<ul id="rec-list" class="tree-structured">

  <!-- Raga group with ≥2 compositions, first → starts open -->
  <li class="tree-group tree-group-open">
    <div class="tree-group-header">
      <span class="tree-chevron" aria-hidden="true"></span>
      <span class="raga-chip">Bhairavi</span>
      <span class="rec-group-count">3</span>   <!-- "3 compositions" -->
    </div>
    <ul class="tree-children">
      <li class="tree-leaf">
        <div class="trail-row2">
          <div class="trail-chips">
            <span class="comp-chip">Viriboni</span>
            <span class="rec-year">1969</span>
            <!-- concert label if bracketed -->
          </div>
          <div class="trail-acts">
            <button class="rec-play-btn">▶</button>
            <a class="yt-ext-link">↗</a>
          </div>
        </div>
      </li>
      <!-- … more composition leaves … -->
    </ul>
  </li>

  <!-- Single-composition raga → open, no chevron -->
  <li class="tree-group tree-group-open tree-group-single">
    <div class="tree-group-header">
      <span class="tree-chevron" aria-hidden="true"></span>
      <!-- chevron hidden by .tree-group-single .tree-chevron { display:none } -->
      <span class="raga-chip">Kalyani</span>
    </div>
    <ul class="tree-children">
      <li class="tree-leaf"> <!-- one composition row --> </li>
    </ul>
  </li>

  <!-- Unknown raga bucket — bottom -->
  <li class="tree-group tree-group-open tree-group-single">
    <div class="tree-group-header">
      <span class="rec-group-label rec-unknown">Unknown raga</span>
    </div>
    <ul class="tree-children">
      <!-- rows without raga_id -->
    </ul>
  </li>

</ul>

<!-- Legacy tracks section (flat, unchanged) -->
<div class="rec-section-header">Other recordings</div>
<ul id="legacy-list">
  <!-- existing rec-legacy items -->
</ul>
```

### 6. Concert bracket within a leaf

When a composition leaf corresponds to multiple concert tracks (an existing `.concert-bracket`), the leaf content can show a secondary bracket indicator:

```html
<li class="tree-leaf">
  <div class="trail-chips">
    <span class="comp-chip">Viriboni</span>
    <span class="rec-year">1969</span>
    <span class="rec-bracket-count">2 concerts</span>
  </div>
  <div class="trail-acts">
    <!-- ▶ plays the first concert track; ↗ links to it -->
    <button class="rec-play-btn rec-play-btn-concert">▶</button>
    <a class="yt-ext-link">↗</a>
  </div>
</li>
```

The expand-to-concert-tracks affordance (existing `.concert-perf-list` toggle) is preserved inside the leaf as before. The leaf is the container; the concert bracket is the nested third level (always on demand, not pre-expanded). This is acceptable as a third level because it is a *recording-level* detail, not a musical-hierarchy level.

### 7. Filter integration

The existing `#rec-filter` text input in the musician panel filters recording rows. Extend the filter logic (as in ADR-061 §Implementation step 5) so that:
- If any leaf under a raga group matches → reveal that raga group (add `tree-group-open`) and show matched leaves.
- If no leaves match → hide the entire raga group.

---

## Consequences

### Positive
- The musician panel now expresses the artist's raga vocabulary at a glance: each raga is a group header, the count of compositions underneath it is immediately visible.
- Clicking a raga header cross-links to Bani Flow, making the panels feel like two views of the same graph rather than two independent lists.
- The ADR-061 CSS reuse means zero new class names — the Coder implements only new JS grouping logic.
- Legacy tracks remain separate and unchanged, preserving the librarian's work on unstructured data.

### Negative / Trade-offs
- `buildRecordingsList()` in `media_player.js` grows two helper functions: `buildRagaTree()` and `buildRagaLeaf()`. Complexity increases but is bounded (two private helpers).
- The cross-panel coupling (raga expand → Bani Flow repopulate) is a side effect of clicking the header. This is intentional by design but should have a subtle visual cue (e.g., the Bani Flow panel's header briefly highlights) so the user understands what happened. Implementation note for the Coder — may be out of scope for v1.
- An artist with many ragas (e.g., Ramnad Krishnan, who recorded across 30+ ragas) will have a long raga group list. This is acceptable — it is the same length as the current flat list, but better organised. Scroll is the correct affordance here; no pagination needed.

### Out of scope
- Nesting beyond raga → composition → concert bracket (three levels is already the maximum)
- Raga wheel sync on raga-group expand (would be nice; a future ADR can add it)
- Sorting by raga by year of first recording (can be a user preference later)

---

## Implementation

**Carnatic Coder owns**: `carnatic/render/templates/media_player.js`, `carnatic/render/templates/base.html` (CSS additions only — reuses ADR-061 tree classes).

**Workflow C** (toolchain feature):

1. **`base.html` CSS**: Confirm `.tree-group`, `.tree-group-open`, `.tree-group-single`, `.tree-group-header`, `.tree-chevron`, `.tree-children`, `.tree-leaf` from ADR-061 are present. If not yet implemented, add them now. No additional classes needed for this ADR.
2. **`media_player.js` — `buildRagaTree(perfs, listEl)`**:
   - Group `perfs` by `raga_id`; collect `null`-raga rows into a tail bucket.
   - Sort groups by recording count descending, then alphabetically.
   - For each group: render a `.tree-group` `<li>` with a raga chip header.
   - Chevron click: toggle `tree-group-open`; if opening, fire `triggerBaniSearch('raga', raga.id)`.
   - Children `<ul class="tree-children">`: each perf → `buildRagaLeaf(perf)`.
   - First group + `tree-group-open`; single-child groups + `tree-group-single`.
3. **`media_player.js` — `buildRagaLeaf(perf)`**:
   - Renders a `<li class="tree-leaf">`.
   - Shows: comp chip (click → `triggerBaniSearch('comp', comp.id)`) + year + any concert bracket indicator + ▶ + ↗.
   - Reuses existing play-button and yt-link helpers from `buildConcertItem` / `buildLegacyItem`.
4. **`media_player.js` — `buildRecordingsList()`**:
   - Branch on whether the node has `structured_perfs`: if yes, call `buildRagaTree()`; then `buildLegacyList()` for `nd.tracks`.
   - If no structured_perfs, fall through to existing flat list (no regression for nodes with only legacy tracks).
5. **Filter integration**: after `#rec-filter` `oninput`, walk `.tree-group` elements: reveal groups with matching leaves; hide groups with no match.
6. Run `bani-render`. Test:
   - Select Ramnad Krishnan: raga groups appear, first group open.
   - Expand Bhairavi group: Bani Flow left panel repopulates with Bhairavi trail.
   - Click a comp chip: Bani Flow repopulates with that composition's trail.
   - Type in `#rec-filter`: raga groups expand/collapse correctly.
   - Select a node with only legacy tracks: falls back to flat list unchanged.
