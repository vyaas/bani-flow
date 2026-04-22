# ADR-061: Tree-structured Bani Flow trail

**Status**: Accepted
**Date**: 2026-04-22
**Agents**: graph-architect
**Depends on**: ADR-015 (listening trail), ADR-018 (concert brackets), ADR-019 (co-performer rows), ADR-054 (era-coloured chips), ADR-059 (compositions section)

---

## Context

### The problem

The bani-flow trail is a **flat list** — one `<li>` per deduplicated performance row. When a raga filter is active the same composition chip repeats on adjacent rows (one per artist who rendered it). When a composition filter is active the same artist name repeats on adjacent rows (one per version). Both patterns bury structure in whitespace:

| Filter | Symptom |
|---|---|
| Kapi raga | 10 items; Semmangudi appears twice for Aravinda Padamalar, Ramnad Krishnan appears twice for Nadupai — composition chips repeat |
| Nadupai composition | Ramnad Krishnan appears twice — same artist, two versions |

### The user demand

> "When we find a composition in the bani-flow panel, it should be a clickable box that unfolds and shows all the musicians who've rendered it … Similar unfolding holds for different versions of a composition rendered by the same artist. For instance, the Ramnad Krishnan renditions of Nadupai must be folded … We're therefore trying to show the lists as a tree, instead of a flattened list."

### Scope

**Rendering layer only.** No data schema change, no write_cli change, no graph.json change. The `rows` array assembled inside `buildListeningTrail` already carries all necessary fields (`composition_id`, `nodeId`, `born`, version labels). Only `bani_flow.js` and the CSS in `base.html` change.

---

## Forces

| Force | Direction |
|---|---|
| **Structure visibility** | The musical hierarchy is real: a composition is a container for its renditions; an artist is a container for their versions. The flat list hides this structure entirely. |
| **Economy of space** | A raga with 10 renditions across 4 compositions collapses to 4 headers — dramatically shorter. |
| **Zero-surprise for solo entries** | A composition with only one rendition should not force an extra click. A single-child group is rendered open by default and omits the expand affordance. |
| **Minimal new UX concepts** | The expand/collapse affordance pattern already exists in the janyas toggle (▶ / ▼ chevron). Reuse it — no new interaction model. |
| **Tab-bar navigation links must stay alive** | Musician chip click → select node + open musician panel. Comp chip click → `triggerBaniSearch`. Raga chip click → `triggerBaniSearch`. ▶ play → concert or direct. ↗ → YouTube. All must work inside the new tree structure. |
| **Trail text filter** | The existing `#trail-filter` input does a client-side `display:none` on leaf items that don't match. In a tree view this needs to also expand the parent group if a leaf is matched, and re-hide the header when no leaves match. Implementation detail for the Coder, noted in the task. |

---

## Pattern

**Levels of Scale** (Alexander): A flat list has one level. A two-level tree (group header → member rows) matches the musical hierarchy — composition is a container for its renditions; musician is a container for their recorded versions. Each level is a Strong Centre in its own right.

**Boundaries as headings**: the group header is the visible boundary between "one composition's world" and the next. It is simultaneously a navigation affordance (click to filter) and a structural divider.

**Minimum surprise**: a group with one child is never collapsed; the tree structure appears only where there is plurality.

---

## Decision

### Grouping rules by filter type

| Filter `type` | Group by | Group header content | Leaf row content |
|---|---|---|---|
| `raga` | `composition_id` | comp chip (navigable) + composer chip; raga chip suppressed (subject is already the raga) | musician chip + co-performers + lifespan + version badge + ▶ + ↗; comp and raga chips suppressed |
| `comp` | `nodeId` (primary artist) | musician chip (era-tinted) + lifespan; comp and raga chips suppressed | version badge + ▶ + ↗ only; for single-version group: ▶ + ↗ inline in header, no child list |
| `perf`, `yt` | no grouping | unchanged flat list | unchanged |

Rows with `composition_id = null` (raga view) group into a single "Other recordings" bucket placed at the **bottom** of the list. Rows with `nodeId = null` (comp view) similarly group into a single "Unknown artist" bucket at the bottom.

### Default open/closed state

- **1-child group**: always rendered open; no chevron, no expand click.
- **≥2-child group**: starts collapsed (chevron `▶`); first group in the list starts open (chevron `▼`) to preview the pattern.
- Expand/collapse state is **not persisted** across filter navigations — each `buildListeningTrail` call starts fresh.

### Interaction contracts

| Trigger | Behaviour |
|---|---|
| Click **group header** (raga view, comp group) | Toggle expand/collapse. On expand: also fire `triggerBaniSearch('comp', comp.id)` so the composition becomes the subject header (dual-purpose — navigation + reveal). On collapse: only toggle, do not clear the composition subject. |
| Click **group header** (comp view, artist group) | Toggle expand/collapse only. Do not re-navigate — composition is already the subject. |
| Click **musician chip** inside leaf | Existing behaviour: select graph node, open musician panel. |
| Click **raga chip** inside leaf (raga view suppresses it — N/A here, but present in artist leaves for comp view) | Existing `triggerBaniSearch('raga', …)`. |
| Click **▶** button | Existing play logic from `buildTrailItem`, carried unchanged into leaf render. |
| Click **↗** link | Existing `buildYtLink` helper, carried unchanged. |

### DOM structure

```html
<!-- ── raga view: group by composition ──────────────────────────── -->
<ul id="trail-list">

  <!-- ≥2-child group, first in list → starts open -->
  <li class="tree-group tree-group-open">
    <div class="tree-group-header">
      <span class="tree-chevron" aria-hidden="true"></span>
      <!-- comp chip doubles as navigation affordance -->
      <span class="comp-chip">Nadupai</span>
      <!-- composer chip if available -->
      <span class="composer-chip">Tyagaraja</span>
    </div>
    <ul class="tree-children">
      <li class="tree-leaf">
        <div class="trail-header">
          <div class="trail-header-primary">
            <span class="musician-chip">Ramnad Krishnan</span>
            <span class="trail-lifespan">1918–1973</span>
          </div>
          <!-- co-performers if any -->
        </div>
        <div class="trail-row2">
          <div class="trail-chips">
            <span class="trail-version">v1</span>
          </div>
          <div class="trail-acts">
            <button class="rec-play-btn play-btn-concert">▶</button>
            <a class="yt-ext-link">↗</a>
          </div>
        </div>
      </li>
      <li class="tree-leaf">
        <!-- Ramnad Krishnan v2 -->
      </li>
    </ul>
  </li>

  <!-- ≥2-child group, not first → starts closed -->
  <li class="tree-group">
    <div class="tree-group-header">
      <span class="tree-chevron" aria-hidden="true"></span>
      <span class="comp-chip">Aravinda Padamalar</span>
    </div>
    <!-- .tree-children hidden until expanded -->
    <ul class="tree-children" style="display:none">
      …
    </ul>
  </li>

  <!-- 1-child group → open, no chevron -->
  <li class="tree-group tree-group-open tree-group-single">
    <div class="tree-group-header">
      <span class="comp-chip">Parulanna Matta</span>
      <span class="composer-chip">Purandara Dasa</span>
    </div>
    <ul class="tree-children">
      <li class="tree-leaf">…</li>
    </ul>
  </li>

</ul>

<!-- ── comp view: group by artist ───────────────────────────────── -->
<ul id="trail-list">

  <!-- ≥2-version artist group, first in list → starts open -->
  <li class="tree-group tree-group-open">
    <div class="tree-group-header">
      <span class="tree-chevron" aria-hidden="true"></span>
      <span class="musician-chip">Ramnad Krishnan</span>
      <span class="trail-lifespan">1918–1973</span>
    </div>
    <ul class="tree-children">
      <li class="tree-leaf">
        <div class="trail-row2">
          <div class="trail-chips">
            <span class="trail-version">v1</span>
          </div>
          <div class="trail-acts">
            <button class="rec-play-btn">▶</button>
            <a class="yt-ext-link">↗</a>
          </div>
        </div>
      </li>
      <li class="tree-leaf">
        <!-- v2 -->
      </li>
    </ul>
  </li>

  <!-- 1-version artist → inline, no child list needed -->
  <li class="tree-group tree-group-open tree-group-single">
    <div class="tree-group-header">
      <span class="musician-chip">Semmangudi Srinivasa Iyer</span>
      <span class="trail-lifespan">1908–2003</span>
      <button class="rec-play-btn play-btn-concert">▶</button>
      <a class="yt-ext-link">↗</a>
    </div>
  </li>

</ul>
```

### CSS additions (to be added in `base.html` near the existing `#trail-list` block)

| Class / selector | Purpose |
|---|---|
| `.tree-group` | `<li>` that wraps a group. `cursor: default; padding: 0;` (padding moves to children). |
| `.tree-group-open > .tree-children` | `display: block;` (children visible). |
| `.tree-group:not(.tree-group-open) > .tree-children` | `display: none;` (children hidden). |
| `.tree-group-header` | `display: flex; align-items: center; gap: 6px; padding: 5px 0; border-bottom: 1px solid var(--border); cursor: pointer;` — for non-single groups. `.tree-group-single .tree-group-header { cursor: default; }` |
| `.tree-chevron::before` (on `.tree-group:not(.tree-group-open)`) | `content: '▶';` size 0.60rem, `var(--fg-muted)`. |
| `.tree-chevron::before` (on `.tree-group-open`) | `content: '▼';` |
| `.tree-group-single .tree-chevron` | `display: none;` |
| `.tree-children` | `list-style: none; padding: 0; margin: 0;` |
| `.tree-leaf` | `padding: 4px 0 4px 14px; border-bottom: 1px solid var(--border-faint, var(--border));` — indented relative to group header. `.tree-leaf:last-child { border-bottom: none; }` |

Border hierarchy: group header gets the full `var(--border)` bottom line; leaf rows get a fainter variant (`var(--border-faint)`) — reinforcing the two levels visually.

---

## Consequences

### Positive
- Panel is dramatically shorter for raga views with many renditions.
- Musical structure (composition → artists → versions) is immediately visible.
- Composition chips and artist names appear once per group, eliminating repetition.
- Expand/collapse reuses the existing chevron pattern (janyas toggle) — no unfamiliar UX.

### Negative / Trade-offs
- `buildListeningTrail` grows two helper functions (`buildTreeRaga`, `buildTreeComp`).
- The `#trail-filter` text input needs to auto-expand groups on match — add a `matchTrailFilter()` step that shows matched leaves and their parent groups and hides all others. This is a second pass over the DOM after the filter input fires. **This is part of this ADR's implementation.**
- `perf` and `yt` type views remain flat lists — they are single-item scenarios and the tree adds no value there.
- Playing a leaf item should still highlight the containing `<li>` as `playing` — the `.playing` class should move to the `.tree-group` when the active vid matches any leaf inside it. The Coder must scan group children when updating play state.

### Out of scope
- Musician panel (right sidebar) — unchanged.
- Raga wheel — unchanged.
- Nesting beyond 2 levels — deliberately excluded.

---

## Implementation

**Carnatic Coder owns**: `carnatic/render/templates/bani_flow.js`, `carnatic/render/templates/base.html`.

**Librarian**: no changes.

**Workflow C** (new toolchain feature):

1. **CSS** (`base.html`): add `.tree-group`, `.tree-group-open`, `.tree-group-single`, `.tree-group-header`, `.tree-chevron`, `.tree-children`, `.tree-leaf` near the `#trail-list` block. Adjust `#trail-list li` so its padding / border rules do not conflict with tree-group children.

2. **`buildTreeRaga(rows, trailList, multiVersionKeys)`** (`bani_flow.js`):
   - Group `rows` by `composition_id`; collect `null`-comp rows into a tail bucket.
   - Sort groups: each group's sort key = earliest `born` (fallback: `year`) among its rows. Null-comp bucket always last.
   - Render a `.tree-group` `<li>` per group.
   - Group header: chevron span + comp chip (with `triggerBaniSearch('comp', …)` on expand) + optional composer chip. Co-performer rows omitted from header.
   - Children `<ul class="tree-children">`: each row → `buildTreeLeaf(row, multiVersionKeys, { comp: true, raga: true, composer: true })`.
   - After appending: if index === 0 and children ≥ 2, add `tree-group-open`; if children === 1, add `tree-group-open tree-group-single`; else leave closed.
   - Chevron click handler: toggles `tree-group-open`; if opening, fires `triggerBaniSearch('comp', comp.id)`.

3. **`buildTreeComp(rows, trailList, multiVersionKeys)`** (`bani_flow.js`):
   - Group `rows` by `nodeId`; collect `null`-node rows into tail bucket.
   - Sort groups by `born` of primary artist.
   - For each group:
     - If 1 row: render `.tree-group tree-group-open tree-group-single` — header contains musician chip + lifespan + ▶ + ↗ inline; no child ul.
     - If ≥2 rows: render `.tree-group` (first open) — header contains chevron + musician chip + lifespan; children ul with version leaves. Each leaf: `buildTreeLeaf(row, multiVersionKeys, { comp: true, raga: true, composer: true, artist: true })`.

4. **`buildTreeLeaf(row, multiVersionKeys, suppressions)`** (`bani_flow.js`):
   - Renders a `<li class="tree-leaf">`. Reuses the play-button and yt-link logic from `buildTrailItem`. Accepts `suppressions` to skip chips that are already shown in the group header.
   - Always shows: version badge (when applicable), ▶, ↗.
   - Artist leaf (raga view): shows musician chip + co-performers + lifespan. Composer/comp/raga chips suppressed.
   - Version leaf (comp view): no artist chip. Version badge + ▶ + ↗ only.

5. **Trail filter integration**: after the `oninput` handler shows/hides leaf items, walk the `.tree-group` elements: if any `.tree-leaf` inside is visible, add `tree-group-open`; if none visible, remove `tree-group-open` and hide the group entirely.

6. **Playing state**: `playerRegistry` changes that add/remove the `.playing` class on trail items must be updated to scan `.tree-group` children. If a playing vid is in a leaf, mark the containing `.tree-group` as `.playing` too (applies the accent colour to the header chip).

7. **Branch `buildListeningTrail`** after step 4:
   ```js
   if (type === 'raga') {
     buildTreeRaga(rows, trailList, multiVersionKeys);
   } else if (type === 'comp') {
     buildTreeComp(rows, trailList, multiVersionKeys);
   } else {
     rows.forEach(row => trailList.appendChild(buildTrailItem(row, type, id, multiVersionKeys)));
   }
   ```

8. Run `bani-render` and test raga view + comp view in browser. Confirm: groups expand/collapse; comp-click in raga header updates subject; single-child groups open without chevron; filter expands matched groups.
