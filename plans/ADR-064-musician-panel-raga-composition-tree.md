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
| **Concert brackets survive** | A concert bracket (two or more tracks from the same concert) is a grouping at a *different* level — it is a *recording event*, not a musical category. Concert brackets are preserved in the **existing concert-bracket section** at the top of the panel, and also appear as folded recording rows within the raga tree. |
| **Recordings are their own special case** | Recordings (YouTube links, full concert brackets) are the special cases that do *not* further sub-divide. A recording row is a terminal node. They start **folded** inside each composition leaf — the user must click to expand. |
| **Dual listing** | A performance with both a `raga_id` and a `recording_id` appears in *two* places: once in the existing concert-bracket section (as it does today), and once in the raga tree under its raga. This explicit redundancy is accepted by design: each axis (concert event vs. musical category) is a valid primary slice. |
| **Composer as paired sub-label** | The composer of a composition is always known from `composition.composer_id`. Rather than showing it as a chip on the same row as the composition, the composer name is rendered as a further-indented sub-label directly below the composition chip. This guides the eye down the tree: raga → composition → composer. The pair — composition name + composer — is a single semantic unit and is always rendered together. |
| **Single-composition raga** | An artist who recorded only one composition in a raga should see that raga group open by default. |
| **Raga-composition subtree is always open** | When an artist node is selected the entire raga tree starts expanded: all raga groups open, all composition+composer pairs visible. Only the recording rows within a composition start folded. Users see the complete musical vocabulary immediately and drill into recordings on demand. |

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

The musician panel is divided into three sections, top to bottom:

1. **Concert recordings section** (existing, unchanged) — `structured_perfs` items grouped by `recording_id` / concert bracket, rendered exactly as today.
2. **Raga tree section** (new) — the same `structured_perfs` items re-organised into the raga→composition→composer+recordings tree described below. Items that also appear in section 1 are listed here again; dual listing is intentional.
3. **Other recordings section** (existing, unchanged) — `tracks[]` legacy items, flat list.

| Source | Section | Group by | Group header | Node content | Recording rows |
|---|---|---|---|---|---|
| `structured_perfs` | Concert recordings (1) | `recording_id` (concert bracket) | bracket label + year | unchanged | unchanged |
| `structured_perfs` | Raga tree (2) | `raga_id` | raga chip (navigable → `triggerBaniSearch('raga', …)`); artist chip suppressed | comp chip (navigable → `triggerBaniSearch('comp', …)`) + composer name sub-label | ▶ + ↗; **start folded**; raga chip suppressed |
| `tracks[]` (legacy) | Other recordings (3) | (no grouping) | — | unchanged flat `rec-legacy` rows | unchanged |

In the raga tree, `raga_id = null` rows group into a single "Unknown raga" bucket at the **bottom** of that section, above the legacy-tracks section.

### 2. Default open/closed state

The raga-composition subtree starts **fully expanded**. All raga groups are open and all composition+composer pairs are immediately visible when the artist node is selected. Only the recording rows nested inside each composition start **folded** — the user expands a composition to see its individual recordings.

Rules:
- **Every raga group**: starts open (`tree-group-open`); chevron shows `▼`.
- **Single-composition raga**: rendered open; no chevron (`.tree-group-single`).
- **Composition nodes**: always visible within an open raga group — no collapse/expand on the composition level itself.
- **Composer sub-label**: always visible below its composition chip; never hidden.
- **Recording rows within a composition** (`tree-rec-list`): start collapsed; toggled by a `▶ N recordings` button on the composition row.
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

The `.tree-group`, `.tree-group-open`, `.tree-group-single`, `.tree-group-header`, `.tree-chevron`, `.tree-children`, `.tree-leaf` CSS classes from ADR-061 are reused for the raga-group level. Two new structural classes are introduced for the composition+composer sub-level: `.tree-comp-node` (the composition block) and `.tree-comp-meta` (the composer sub-label row). Recording rows within a composition use a new `.tree-rec-list` + `.tree-rec-toggle` pair.

```html
<!-- ── Section 1: Concert recordings (existing, unchanged) ── -->
<div class="rec-section-header">Concert recordings</div>
<ul id="concert-list">
  <!-- existing concert-bracket/rec-legacy items, untouched -->
</ul>

<!-- ── Section 2: Raga tree (new) ── -->
<div class="rec-section-header">By raga</div>
<ul id="rec-list" class="tree-structured">

  <!-- Raga group — starts open, chevron ▼ -->
  <li class="tree-group tree-group-open">
    <div class="tree-group-header">
      <span class="tree-chevron" aria-hidden="true"></span>
      <span class="raga-chip">Begada</span>
      <span class="rec-group-count">2</span>   <!-- "2 compositions" -->
    </div>
    <ul class="tree-children">

      <!-- Composition node — always visible; no collapse at this level -->
      <li class="tree-comp-node">
        <div class="tree-comp-header">
          <span class="comp-chip">Shankari Nive</span>   <!-- click → triggerBaniSearch('comp', …) -->
          <button class="tree-rec-toggle" aria-expanded="false">▶ 1 recording</button>
        </div>
        <!-- Composer sub-label — always visible, indented -->
        <div class="tree-comp-meta">
          <span class="composer-label">Subbaraya Sastri</span>
        </div>
        <!-- Recording rows — start collapsed -->
        <ul class="tree-rec-list" hidden>
          <li class="tree-leaf">
            <div class="trail-row2">
              <div class="trail-chips">
                <span class="rec-year">1965</span>
                <span class="rec-bracket-label">Poonamalee</span>
              </div>
              <div class="trail-acts">
                <button class="rec-play-btn">▶</button>
                <a class="yt-ext-link">↗</a>
              </div>
            </div>
          </li>
        </ul>
      </li>

      <!-- Second composition in same raga -->
      <li class="tree-comp-node">
        <div class="tree-comp-header">
          <span class="comp-chip">Tulasamma</span>
          <button class="tree-rec-toggle" aria-expanded="false">▶ 2 recordings</button>
        </div>
        <div class="tree-comp-meta">
          <span class="composer-label">Tyagaraja</span>
        </div>
        <ul class="tree-rec-list" hidden>
          <li class="tree-leaf"><!-- recording row --></li>
          <li class="tree-leaf"><!-- recording row --></li>
        </ul>
      </li>

    </ul>
  </li><!-- end Begada group -->

  <!-- Single-composition raga — open, no chevron -->
  <li class="tree-group tree-group-open tree-group-single">
    <div class="tree-group-header">
      <span class="tree-chevron" aria-hidden="true"></span>
      <!-- chevron hidden by .tree-group-single .tree-chevron { display:none } -->
      <span class="raga-chip">Kalyani</span>
    </div>
    <ul class="tree-children">
      <li class="tree-comp-node">
        <div class="tree-comp-header">
          <span class="comp-chip">Ninnaseva</span>
          <button class="tree-rec-toggle" aria-expanded="false">▶ 1 recording</button>
        </div>
        <div class="tree-comp-meta">
          <span class="composer-label">Tyagaraja</span>
        </div>
        <ul class="tree-rec-list" hidden>
          <li class="tree-leaf"><!-- recording row --></li>
        </ul>
      </li>
    </ul>
  </li>

  <!-- Unknown raga bucket — bottom of raga tree -->
  <li class="tree-group tree-group-open tree-group-single">
    <div class="tree-group-header">
      <span class="rec-group-label rec-unknown">Unknown raga</span>
    </div>
    <ul class="tree-children">
      <!-- tree-comp-node rows for perfs with raga_id = null -->
    </ul>
  </li>

</ul>

<!-- ── Section 3: Other recordings (legacy, unchanged) ── -->
<div class="rec-section-header">Other recordings</div>
<ul id="legacy-list">
  <!-- existing rec-legacy items -->
</ul>
```

**New CSS classes introduced** (added to `base.html`):

| Class | Role |
|---|---|
| `.tree-comp-node` | Block-level wrapper for one composition within a raga group |
| `.tree-comp-header` | Row containing comp chip + recording-toggle button |
| `.tree-comp-meta` | Sub-row for composer name, indented relative to `.tree-comp-header` |
| `.tree-rec-toggle` | Button that shows/hides `.tree-rec-list`; updates `aria-expanded` |
| `.tree-rec-list` | `<ul>` of individual recording rows; hidden by default via `[hidden]` attribute |

### 6. Concert bracket within the raga tree

Each composition node shows a `▶ N recording(s)` toggle button. Clicking it sets `aria-expanded="true"` on the button and removes `hidden` from `.tree-rec-list`, revealing individual recording rows. Each row shows year + concert-bracket label (if any) + ▶ play + ↗ link. No further sub-expansion; recording rows are terminal.

When a single composition has multiple recordings (e.g., the same kriti performed at two different concerts), each recording is a separate `.tree-leaf` row inside the `.tree-rec-list`. The toggle count label updates to match: "▶ 2 recordings".

### 7. Filter integration

The existing `#rec-filter` text input in the musician panel filters recording rows. Extend the filter logic (as in ADR-061 §Implementation step 5) so that:
- If any leaf under a raga group matches → reveal that raga group (add `tree-group-open`) and show matched leaves.
- If no leaves match → hide the entire raga group.

---

## Consequences

### Positive
- The musician panel immediately reveals the artist's complete raga vocabulary — all ragas open, all compositions visible — without requiring the user to expand anything.
- The composer sub-label guides the eye in a natural reading order: raga → composition → who wrote it. The pair (composition + composer) is a single semantic unit presented as a two-line stanza in the tree.
- Clicking a raga header cross-links to Bani Flow, making the panels feel like two views of the same graph.
- The dual listing (concert section + raga tree) is additive: users who parse by concert event or by chronology continue to use the existing concert section; users who want the musical structure use the raga tree.
- Legacy tracks remain in a separate section, unchanged.

### Negative / Trade-offs
- **Dual listing adds length**: an artist with 60 structured_perfs will have those items in the concert section *and* in the raga tree. The panel can become long. Scroll is the correct affordance; no pagination needed.
- `buildRecordingsList()` grows three helper functions: `buildRagaTree()`, `buildCompNode()`, and one for the recording toggle. Complexity increases but is bounded.
- The cross-panel coupling (raga header expand → Bani Flow repopulate) is a side effect of clicking the raga group. A subtle visual cue on the Bani Flow panel header may be warranted; this is a v2 concern.
- An artist with many compositions per raga (e.g., Tyagaraja kritis) will have a long `.tree-children` list. The three-level tree makes the most sense here — users can fold individual recording rows to reduce height.

### Out of scope
- Nesting beyond raga → composition → recording (three visual indent levels is the maximum)
- Raga wheel sync on raga-group expand (future ADR)
- Sorting by raga by year of first recording (can be a user preference later)
- Persisting expand/collapse state of recording rows across navigations

---

## Implementation

**Carnatic Coder owns**: `carnatic/render/templates/media_player.js`, `carnatic/render/templates/base.html` (CSS additions).

**Workflow C** (toolchain feature):

1. **`base.html` CSS**:
   - Confirm `.tree-group`, `.tree-group-open`, `.tree-group-single`, `.tree-group-header`, `.tree-chevron`, `.tree-children`, `.tree-leaf` from ADR-061 are present.
   - Add `.tree-comp-node`, `.tree-comp-header`, `.tree-comp-meta`, `.tree-rec-toggle`, `.tree-rec-list` with appropriate indent spacing. `.tree-comp-meta` should be visually subordinate to `.tree-comp-header` (smaller font or muted colour).

2. **`media_player.js` — `buildRagaTree(perfs, listEl)`**:
   - Group `perfs` by `raga_id`; collect `null`-raga rows into a tail bucket.
   - Sort groups by recording count descending, then alphabetically.
   - All groups start `tree-group-open`; single-comp groups also get `tree-group-single`.
   - Chevron click: toggle `tree-group-open`; if opening, fire `triggerBaniSearch('raga', raga.id)`.
   - Children: each unique `composition_id` within the raga group → `buildCompNode(comps, perfs)`.

3. **`media_player.js` — `buildCompNode(comp, perfs)`**:
   - Renders a `<li class="tree-comp-node">`.
   - `.tree-comp-header`: comp chip (click → `triggerBaniSearch('comp', comp.id)`) + `▶ N recording(s)` toggle button.
   - `.tree-comp-meta`: composer name (looked up from `graphData.compositions[comp.id].composer_id`).
   - `.tree-rec-list` (`hidden` by default): one `<li class="tree-leaf">` per recording row in `perfs` for this composition. Each leaf shows: year + bracket label (if any) + ▶ play + ↗ link.
   - Toggle button click: flip `hidden` on `.tree-rec-list`, flip `aria-expanded`.

4. **`media_player.js` — `buildRecordingsList()`**:
   - Render section 1 (concert bracket section) as today.
   - If `nd.structured_perfs` is non-empty: render "By raga" section header + call `buildRagaTree()`.
   - Then render "Other recordings" section for `nd.tracks` (unchanged).
   - If no `structured_perfs`, fall through to existing flat list (no regression).

5. **Filter integration**: after `#rec-filter` `oninput`, walk `.tree-group` elements: for each, check whether any `.tree-comp-node` inside contains text matching the query. Matching comp nodes remain visible; non-matching comp nodes are hidden. If no comp nodes match in a raga group, hide the entire group. Revealing a group also sets `tree-group-open`.

6. **Run `bani-render`. Test**:
   - Select Ramnad Krishnan: raga tree appears fully open; all compositions visible; no recording rows shown initially.
   - Click `▶ N recording(s)` on a composition: recording rows expand.
   - Expand a raga group header (click chevron to close, then re-open): Bani Flow repopulates.
   - Click a comp chip: Bani Flow repopulates with that composition's trail.
   - Type in `#rec-filter`: raga groups and comp nodes filter correctly.
   - Select a node with only legacy tracks: falls back to flat list unchanged.
   - Concert section above the raga tree still shows all structured_perfs in bracket form.
