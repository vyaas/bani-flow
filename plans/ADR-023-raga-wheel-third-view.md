# ADR-023: Raga Wheel — The Third View

**Status:** Proposed
**Date:** 2026-04-12

---

## Context

### The two existing views

The application currently offers two views of the same underlying data, toggled by the
`Timeline` / `Graph` button in the header:

| View | What it shows | Governing shape |
|---|---|---|
| **Graph** | Guru-shishya lineage as a directed acyclic graph | Arbitrary tree/DAG — shape emerges from the data |
| **Timeline** | The same nodes laid out on a horizontal time axis | Linear — birth year drives x-position |

Both views share the same node set (musicians), the same edge set (guru→shishya), and
the same Cytoscape.js canvas. The toggle is a layout switch, not a view switch — the
underlying data model is identical in both.

### The structural gap

Neither view can answer the question a student or rasika asks first: *"What raga am I
listening to, and where does it live in the tradition?"*

The guru-shishya graph is organised by *person*. The timeline is organised by *time*.
Neither is organised by *raga*. Yet raga is the primary unit of musical experience in
Carnatic music. A rasika who hears Kharaharapriya wants to know:

- Which cakra? Which mela family?
- What are its janyas — the derived ragas that share its tonal universe?
- Which compositions live in this raga? Which musicians performed them?
- How does this raga relate to its neighbours on the melakarta wheel?

The Bani Flow panel (left sidebar) answers the last two questions partially — it shows
compositions and musicians for a searched raga. ADR-021 and ADR-022 enriched the data
model and the panel's navigability. But the Bani Flow panel is a *list*, not a *space*.
It cannot show the structural position of a raga within the 72-mela system. It cannot
show the neighbourhood of a mela — which cakra it belongs to, which five sibling melas
share that cakra.

### The reference image

The [`Melakarta.katapayadi.sankhya.72.png`](../carnatic/data/Melakarta.katapayadi.sankhya.72.png)
image shows the canonical representation of the 72-mela system: a circle divided into
12 cakra sectors, each containing 6 mela ragas arranged radially. The innermost rings
name the cakras; the outermost ring names the 72 melakartas. This is the shape the
tradition itself uses to teach the system. It is not an arbitrary visualisation — it is
the *grammar diagram* of Carnatic music.

The third view must honour this shape. The circle is not negotiable.

### Why this is a *view*, not a *panel*

The Bani Flow panel is a sidebar — it coexists with the graph canvas. The raga wheel
is a full-canvas view: it replaces the Cytoscape graph with a different spatial
representation. Like the timeline, it is a layout mode that occupies the entire canvas
area. Unlike the timeline, it does not use Cytoscape.js nodes — it is rendered as SVG
directly into the `#canvas-wrap` div, alongside the existing
[`#timeline-ruler`](../carnatic/render.py:1032) SVG overlay.

This distinction matters architecturally: the raga wheel is not a Cytoscape layout. It
is a separate SVG rendering that replaces the Cytoscape canvas when active.

---

## Forces in tension

1. **The circle is a given** — The melakarta wheel is not a design choice. It is the
   canonical representation of the 72-mela system, used in every textbook, every
   classroom, every guru's teaching. The third view must reproduce this shape
   faithfully. Deviating from it would confuse musicians and students who already know
   the wheel.

2. **Emanation hierarchy** — The user's specification is precise: melas on the
   periphery of the circle → janya nodes emanate outward from melas → compositions
   emanate from both mela and janya nodes → musicians emanate from compositions. This
   is a four-level radial tree rooted at the circle. The circle is always present; the
   outer layers appear on demand (click/hover to expand).

3. **Representational tension with the guru-shishya tree** — In the graph view, a
   musician is a node connected to other musicians by lineage edges. In the raga wheel,
   a musician is a leaf node connected to a composition node, which is connected to a
   raga node. The same musician appears in both views but in a completely different
   structural role. This is not a contradiction — it is the same person seen through
   two different lenses. The architecture must make this explicit.

4. **The zoo of categories** — The project already has: instrument, era, bani, cakra,
   mela, janya, composer, composition, musician. The raga wheel adds a new spatial
   dimension (radial position = cakra/mela identity) but must not add new data
   categories. All data needed for the wheel already exists in `compositions.json` and
   `musicians.json` after ADR-021 migration.

5. **Three-view discoverability** — The user must know that three views exist. The
   current `Timeline` / `Graph` toggle is a binary button. Adding a third view requires
   a UI affordance that communicates the three-way choice without cluttering the header.

6. **Scalability of the outer layers** — A mela like Kharaharapriya has 18+ janya
   ragas. Each janya may have dozens of compositions. Each composition may have dozens
   of musician performances. Rendering all of this simultaneously would produce an
   unreadable diagram. The outer layers (janyas, compositions, musicians) must be
   *on-demand* — collapsed by default, expanded by click.

7. **Immersion** — The rasika must be able to enter the wheel at any point: click a
   mela to see its janyas; click a janya to see its compositions; click a composition
   to see its musicians and trigger the Bani Flow trail in the left panel. The wheel
   is not a static diagram — it is a traversal surface.

---

## Pattern

### **Strong Centres** (Alexander, Pattern 1)

The melakarta circle is the strongest centre in Carnatic music theory. Each of the 12
cakra sectors is a strong centre. Each of the 72 mela ragas is a strong centre. The
wheel layout makes these centres spatially legible: position encodes identity. A rasika
who knows the wheel can navigate it by spatial memory — "Kharaharapriya is in the
upper-right quadrant, Cakra 4."

The outer layers (janyas, compositions, musicians) are weaker centres that derive their
identity from their parent mela. They are rendered as satellites of the mela node, not
as independent nodes in a flat space.

### **Levels of Scale** (Alexander, Pattern 5)

The wheel has four natural levels of scale:

```
Level 1: The circle itself — the 72-mela system as a whole
Level 2: Cakra sectors (12) — the Ri-Ga grouping principle
Level 3: Mela nodes (72) — the complete 7-note scales on the periphery
Level 4: Janya nodes — derived ragas, emanating outward from their parent mela
Level 5: Composition nodes — pieces in a raga, emanating from mela or janya
Level 6: Musician nodes — performers, emanating from compositions
```

Good structure at every level reinforces good structure at every other level. The
circle (Level 1) gives the cakras (Level 2) their spatial identity. The cakras give
the melas (Level 3) their neighbourhood. The melas give the janyas (Level 4) their
tonal parentage. The janyas give the compositions (Level 5) their raga context. The
compositions give the musicians (Level 6) their repertoire position.

### **Gradients** (Alexander, Pattern 9)

The radial gradient runs from the centre (abstract, structural) to the periphery
(concrete, performative). The innermost rings are theoretical (cakra names, mela
numbers). The outermost layers are experiential (musicians, recordings). A rasika
navigating inward moves from the specific (a musician they know) toward the structural
(the mela that governs the raga they heard). A student navigating outward moves from
the structural toward the repertoire.

### **Boundaries** (Alexander, Pattern 13)

The boundary between the three views is the view-selector control in the header. Each
view is a bounded world: the graph view is the lineage world; the timeline view is the
historical world; the raga wheel is the tonal world. The boundaries must be clear and
the transitions must be smooth — switching views should not lose the user's context
(the Bani Flow panel persists across all three views).

---

## Decision

### 1. Three-view selector — replacing the binary toggle

The current `<button id="btn-layout" onclick="toggleLayout()">Timeline</button>` is a
binary toggle between `graph` and `timeline`. It must be replaced by a three-way
selector.

#### Before (current HTML — binary toggle)

```html
<div class="controls">
  <button onclick="cy.fit()">Fit</button>
  <button onclick="cy.reset()">Reset</button>
  <button onclick="relayout()">Relayout</button>
  <button onclick="toggleLabels()">Labels</button>
  <button id="btn-layout" onclick="toggleLayout()">Timeline</button>
</div>
```

#### After (three-way view selector)

```html
<div class="controls">
  <button onclick="cy.fit()" id="btn-fit">Fit</button>
  <button onclick="cy.reset()" id="btn-reset">Reset</button>
  <button onclick="relayout()" id="btn-relayout">Relayout</button>
  <button onclick="toggleLabels()" id="btn-labels">Labels</button>
  <div class="view-selector" id="view-selector">
    <button class="view-btn active" id="view-btn-graph"
            onclick="switchView('graph')" title="Guru-shishya lineage graph">Graph</button>
    <button class="view-btn" id="view-btn-timeline"
            onclick="switchView('timeline')" title="Chronological timeline">Timeline</button>
    <button class="view-btn" id="view-btn-raga"
            onclick="switchView('raga')" title="Melakarta raga wheel">Ragas</button>
  </div>
</div>
```

The three buttons form a segmented control — only one is `active` at a time. The
`Fit`, `Reset`, `Relayout`, and `Labels` buttons are hidden (or disabled) when the
raga wheel view is active, since they operate on the Cytoscape canvas which is not
visible in that view.

#### CSS for the view selector

```css
/* ── Three-view selector (ADR-023) ── */
.view-selector {
  display: inline-flex;
  border: 1px solid var(--bg3);
  border-radius: 4px;
  overflow: hidden;
  margin-left: 8px;
}
.view-btn {
  background: var(--bg1);
  color: var(--fg2);
  border: none;
  border-right: 1px solid var(--bg3);
  padding: 4px 10px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.view-btn:last-child { border-right: none; }
.view-btn:hover { background: var(--bg2); color: var(--fg1); }
.view-btn.active {
  background: var(--bg3);
  color: var(--yellow);
  font-weight: bold;
}
```

#### `switchView(name)` function

The existing `toggleLayout()` function is replaced by `switchView(name)`:

```javascript
let currentView = 'graph'; // 'graph' | 'timeline' | 'raga'

function switchView(name) {
  if (name === currentView) return;
  currentView = name;

  // Update button states
  ['graph', 'timeline', 'raga'].forEach(v => {
    document.getElementById(`view-btn-${v}`)
      .classList.toggle('active', v === name);
  });

  // Show/hide Cytoscape-specific controls
  const cyControls = ['btn-fit','btn-reset','btn-relayout','btn-labels'];
  cyControls.forEach(id => {
    document.getElementById(id).style.display =
      (name === 'raga') ? 'none' : '';
  });

  // Activate the chosen view
  if (name === 'graph') {
    hideTimelineRuler();
    hideRagaWheel();
    document.getElementById('cy').style.display = '';
    relayout();
  } else if (name === 'timeline') {
    hideRagaWheel();
    document.getElementById('cy').style.display = '';
    applyTimelineLayout();
  } else if (name === 'raga') {
    hideTimelineRuler();
    document.getElementById('cy').style.display = 'none';
    showRagaWheel();
  }
}
```

The existing `toggleLayout()` function is retained as a thin wrapper for backward
compatibility but delegates to `switchView`:

```javascript
function toggleLayout() {
  switchView(currentView === 'graph' ? 'timeline' : 'graph');
}
```

---

### 2. Raga wheel canvas — SVG element

The raga wheel is rendered into a new `<svg id="raga-wheel">` element that sits
alongside the existing `#cy` div and `#timeline-ruler` SVG inside `#canvas-wrap`:

```html
<!-- ── canvas column: filter bar + graph ── -->
<div id="canvas-wrap">
  <div id="filter-bar">…</div>
  <div id="cy"></div>
  <svg id="timeline-ruler" style="display:none;…"></svg>
  <!-- Raga wheel (ADR-023) -->
  <svg id="raga-wheel" style="display:none;position:absolute;top:0;left:0;
       width:100%;height:100%;overflow:visible;z-index:60;"></svg>
</div>
```

The wheel SVG is `position:absolute` and fills the canvas area. It is hidden by
default (`display:none`) and shown only when `currentView === 'raga'`.

---

### 3. Wheel geometry — the fixed circle

The melakarta circle has a fixed geometry derived from the reference image:

```
Centre:          (cx, cy) = (50%, 50%) of the SVG viewport
Cakra ring:      inner radius r_cakra_inner, outer radius r_cakra_outer
Mela ring:       radius r_mela (nodes sit on this circle)
Janya ring:      radius r_janya (first expansion layer, on demand)
Composition ring: radius r_comp (second expansion layer, on demand)
Musician ring:   radius r_musician (third expansion layer, on demand)
```

The 72 mela nodes are placed at equal angular intervals around the circle:

```
θ_n = (n - 1) × (360° / 72)   for n = 1..72
```

The 12 cakra sectors are coloured arcs, each spanning 30° (6 melas × 5° per mela
gap). The sector colours follow the reference image's colour scheme:
- Cakras 1–6 (Madhyama 1, lower half): warm tones (amber, gold, green, teal)
- Cakras 7–12 (Madhyama 2, upper half): cool tones (blue, indigo, violet, rose)

The exact colour mapping is a rendering decision for the Carnatic Coder; the
architecture specifies only that cakra sectors must be visually distinct and that the
colour scheme must be consistent with the reference image.

---

### 4. Emanation layers — on-demand expansion

The outer layers (janyas, compositions, musicians) are not rendered by default. They
appear when the user clicks a mela node. This is the *on-demand expansion* pattern:

#### State machine for a mela node

```
State 0 (default):   Mela node visible on the circle. No outer layers.
State 1 (expanded):  Mela node highlighted. Janya nodes appear as satellites
                     at r_janya, connected to the mela by radial spokes.
State 2 (janya selected): One janya highlighted. Composition nodes appear
                     at r_comp, connected to the selected janya.
State 3 (comp selected):  One composition highlighted. Musician nodes appear
                     at r_musician, connected to the selected composition.
                     Clicking a musician node triggers the Bani Flow trail
                     in the left panel (same as clicking a musician in the
                     graph view).
```

Only one mela can be in State 1 at a time. Clicking a second mela collapses the first.
This prevents the wheel from becoming cluttered.

#### Interaction model

| User action | Effect |
|---|---|
| Click mela node | Expand to State 1: show janya satellites |
| Click mela node again | Collapse to State 0 |
| Click janya node | Expand to State 2: show composition satellites for this janya |
| Click composition node | Expand to State 3: show musician satellites; trigger Bani Flow |
| Click musician node | Trigger Bani Flow trail for this musician (same as graph view) |
| Click background | Collapse all expanded layers; return to State 0 |
| Hover mela node | Show tooltip: mela name, number, cakra, arohana/avarohana (from `notes`) |
| Hover janya node | Show tooltip: janya name, parent mela |
| Hover composition node | Show tooltip: composition title, composer, tala |
| Hover musician node | Show tooltip: musician name, era, instrument |

---

### 5. Data flow — what the wheel reads

The raga wheel reads from the same JavaScript data objects already injected by
[`render.py`](../carnatic/render.py) into `graph.html`:

| Data object | Used for |
|---|---|
| `ragas` | Mela nodes (filtered by `is_melakarta === true`); janya nodes (filtered by `parent_raga`) |
| `compositions` | Composition nodes (filtered by `raga_id`) |
| `elements` (Cytoscape nodes) | Musician nodes (filtered by `raga_id` via `ragaToNodes`) |
| `ragaToPerf` | Musician-to-raga association (which musicians performed in this raga) |
| `CAKRA_NAMES` | Cakra sector labels |

**No new data injection is required.** The wheel is a new *rendering* of existing
data, not a new data source. This is the key architectural constraint: the wheel must
be implementable without any changes to `render.py`'s Python data-building code.

#### Mela node data shape (already in `ragas` array after ADR-021)

```json
{
  "id": "kharaharapriya",
  "name": "Kharaharapriya",
  "melakarta": 22,
  "is_melakarta": true,
  "cakra": 4,
  "parent_raga": null,
  "notes": "22nd melakarta; Cakra 4 (Veda); arohana S R2 G2 M1 P D2 N2 S; …",
  "aliases": ["Kara Harapriya"],
  "sources": [{ "url": "…", "label": "Wikipedia", "type": "wikipedia" }]
}
```

#### Janya node data shape (already in `ragas` array after ADR-021)

```json
{
  "id": "abheri",
  "name": "Abheri",
  "is_melakarta": false,
  "parent_raga": "natabhairavi",
  "notes": "Janya of Natabhairavi; evokes karuna and bhakti; …"
}
```

#### Composition node data shape (already in `compositions` array)

```json
{
  "id": "karunai_seivai",
  "title": "Karunai Seivai",
  "raga_id": "abheri",
  "composer_id": "papanasam_sivan",
  "tala": "adi"
}
```

#### Musician node data shape (from `ragaToNodes[raga_id]` → Cytoscape node data)

```javascript
// ragaToNodes['abheri'] → ['ramnad_krishnan', 'semmangudi_srinivasa_iyer', …]
// Each id resolves to a Cytoscape node with data: { label, born, died, era, instrument }
```

---

### 6. Bani Flow integration — the bridge between views

The raga wheel is not a standalone view. It is a *traversal surface* that feeds the
Bani Flow panel. When the user clicks a composition node in the wheel:

1. `triggerBaniSearch('comp', composition_id)` is called (the helper defined in
   ADR-022, Decision §7).
2. The Bani Flow panel updates to show the listening trail for that composition.
3. The left panel's subject header shows the composition name and raga.
4. The graph nodes matching that composition are highlighted — even though the
   Cytoscape canvas is hidden, the highlight state is maintained so that switching
   back to the graph view shows the correct highlight.

When the user clicks a musician node in the wheel:

1. The Bani Flow panel updates to show that musician's recordings.
2. The right panel's musician info panel updates (same as clicking a node in the
   graph view).

This bidirectional integration means the raga wheel is not a dead end — it is an
entry point into the same traversal space as the graph and timeline views.

---

### 7. Representational tension — musician in two roles

In the **graph view**, a musician is a *lineage node*: their identity is defined by
who taught them and who they taught. The edges are guru→shishya.

In the **raga wheel**, a musician is a *performance node*: their identity is defined
by what ragas they performed and what compositions they played. The edges are
composition→musician.

This is not a contradiction. It is the same person seen through two different lenses:

- The graph view answers: *"Who is this musician in the tradition?"*
- The raga wheel answers: *"What did this musician play, and in what tonal universe?"*

The architecture resolves this tension by making the musician node a *bridge* between
the two views. Clicking a musician node in the raga wheel:
1. Highlights that musician's node in the Cytoscape graph (even if the graph is hidden)
2. Updates the right panel's musician info (same as clicking in the graph view)
3. Shows their recordings in the Bani Flow trail

The musician is the same strong centre in both views. The edges change; the centre
does not.

---

### 8. Before / after JSON shape — no schema change

The raga wheel requires **no schema changes**. All data it needs is already present
after ADR-021 migration:

| Field | Source | Status |
|---|---|---|
| `raga.is_melakarta` | ADR-021 | Required — must be populated for all 72 melas |
| `raga.melakarta` | existing | Required |
| `raga.cakra` | ADR-021 | Required — must be populated for all 72 melas |
| `raga.parent_raga` | ADR-021 (repaired) | Required for janya layer |
| `raga.notes` | existing | Used for hover tooltips |
| `composition.raga_id` | existing | Used to associate compositions with ragas |
| `ragaToNodes[raga_id]` | existing (render.py) | Used to associate musicians with ragas |

**Dependency:** The raga wheel's mela ring is only fully populated after the Librarian
completes ADR-021 Phases 3–5 (all 72 melas in `ragas[]` with `is_melakarta: true` and
`cakra` set). Before that migration is complete, the wheel renders only the melas that
are already in `ragas[]` (currently 13). The wheel must degrade gracefully: missing
mela positions are shown as empty slots on the circle, labelled with their melakarta
number.

---

### 9. View persistence across navigation

When the user switches from the raga wheel back to the graph view:
- The Cytoscape graph restores its previous layout (graph or timeline, whichever was
  last active before switching to the raga wheel).
- Any Bani Flow highlight state (matched nodes, trail) is preserved.
- The expanded mela state in the wheel is reset (collapsed) when the wheel is hidden.

This is the *Boundaries* pattern: each view is a bounded world, but the shared state
(Bani Flow trail, musician selection) crosses the boundary.

---

### 10. Three-view discoverability — user communication

The segmented `Graph | Timeline | Ragas` control in the header communicates the
three-way choice at a glance. The active view is highlighted in yellow (consistent
with the existing `btn-layout.active` style). The button labels are:

- **Graph** — the lineage graph (current default)
- **Timeline** — the chronological layout (current "Timeline" button)
- **Ragas** — the melakarta wheel (new)

The label "Ragas" is chosen over "Wheel" or "Mela" because it is the most immediately
legible to a non-specialist. A rasika who does not know the word "melakarta" will
understand "Ragas" as "the view organised by raga".

---

## Consequences

### Queries this enables

| Rasika query | Before | After |
|---|---|---|
| "Show me all ragas in Cakra 4" | Not possible in UI | Cakra 4 sector highlighted in wheel |
| "What are the janyas of Kharaharapriya?" | ADR-022 dropdown in Bani Flow panel | Click Kharaharapriya in wheel → janya satellites appear |
| "Which compositions are in Abheri?" | Bani Flow search | Click Abheri satellite → composition satellites appear |
| "Who performed Abheri?" | Bani Flow search | Click Abheri → compositions → musicians |
| "Where does Todi sit in the mela system?" | Not visible in UI | Todi node at position 8 on the wheel, Cakra 2 sector |
| "What are the neighbours of Kharaharapriya on the wheel?" | Not possible | Melas 21 (Keeravani) and 23 (Gowrimanohari) are adjacent on the circle |
| "I know three views exist — how do I switch?" | Binary toggle, no hint of third view | `Graph | Timeline | Ragas` segmented control |

### What this enables beyond the current data

- **Spatial raga memory** — The wheel gives the rasika a spatial map of the tonal
  universe. After a few sessions, they will remember that Kharaharapriya is "at 2
  o'clock" and Todi is "at 8 o'clock". This is how musicians actually think about the
  mela system — spatially, not numerically.

- **Cakra as a discovery surface** — Clicking a cakra sector (rather than a specific
  mela) could expand all 6 melas in that cakra simultaneously. This is a future
  extension; the architecture supports it because cakra sectors are first-class SVG
  elements.

- **Cross-view highlight coherence** — Because the wheel reads from the same
  `ragaToNodes` and `compositionToNodes` maps as the graph view, a composition
  selected in the wheel highlights the same nodes in the graph. The two views are
  coherent representations of the same underlying graph.

- **Entry point for new users** — The raga wheel is the most visually legible entry
  point for a rasika who does not know the guru-shishya lineage. They can start from
  a raga they know, find compositions, find musicians, and then switch to the graph
  view to explore the lineage. The wheel is the *door*; the graph is the *house*.

### What this forecloses

- **Cytoscape.js for the wheel** — The wheel is rendered as SVG, not as a Cytoscape
  layout. This means Cytoscape's pan/zoom, node selection, and edge rendering are not
  available in the wheel view. The wheel has its own interaction model (click to
  expand, hover for tooltip). This is the correct choice: the wheel's geometry is
  fixed (the circle does not change shape with the data), and Cytoscape's force-
  directed layouts would destroy the fixed circular structure.

- **Simultaneous multi-mela expansion** — Only one mela can be expanded at a time.
  Expanding multiple melas simultaneously would produce overlapping janya satellites
  and an unreadable diagram. A future ADR may add a "compare two melas" mode, but
  the default is single-mela expansion.

- **Janya ragas without a `parent_raga`** — Janya ragas that have `parent_raga: null`
  (i.e. ragas not yet repaired by ADR-021 Phase 5) will not appear in the wheel's
  janya layer. They are not lost — they remain accessible via the Bani Flow panel.
  The wheel's janya layer is a *subset* of all janya ragas: only those with a
  confirmed `parent_raga` link.

### Interaction with ADR-021 (melakarta first-class citizens)

ADR-023 is the primary *visual consumer* of ADR-021's data. The wheel's mela ring
requires all 72 melas to be in `ragas[]` with `is_melakarta: true` and `cakra` set.
Until the Librarian completes ADR-021, the wheel renders a partial circle. The
graceful degradation (empty slots for missing melas) is a visible signal that the
migration is in progress.

### Interaction with ADR-022 (raga panel navigability)

ADR-022 added `triggerBaniSearch(type, id)` as a reusable primitive. ADR-023 uses
this function to bridge the wheel and the Bani Flow panel. The two ADRs are
complementary: ADR-022 makes the Bani Flow panel navigable from within; ADR-023 makes
it navigable from the wheel.

### Interaction with ADR-013 (traversal layer)

ADR-013 proposed `CarnaticGraph.get_musicians_who_performed_raga(raga_id)` as a
traversal method. The raga wheel's musician layer uses the equivalent client-side
lookup (`ragaToNodes[raga_id]`). When ADR-013's `graph_api.py` is fully implemented,
the wheel's data could be pre-computed server-side and injected as a richer data
structure. For now, the wheel uses the existing client-side lookups.

---

## Implementation

**Agent:** Carnatic Coder
**Files:** [`carnatic/render.py`](../carnatic/render.py)

### Step 1: Replace binary toggle with three-way view selector

In the HTML template, replace the `<button id="btn-layout">` with the
`<div class="view-selector">` segmented control (Decision §1). Add the CSS rules for
`.view-selector`, `.view-btn`, and `.view-btn.active`.

Add `id` attributes to the existing `Fit`, `Reset`, `Relayout`, and `Labels` buttons
so they can be hidden when the raga wheel is active.

### Step 2: Add `<svg id="raga-wheel">` to `#canvas-wrap`

After the `#timeline-ruler` SVG element, add the `#raga-wheel` SVG element
(Decision §2). It is hidden by default.

### Step 3: Implement `switchView(name)` and update `toggleLayout()`

Replace `toggleLayout()` with `switchView(name)` (Decision §1). Retain `toggleLayout`
as a backward-compatible wrapper. Add `showRagaWheel()` and `hideRagaWheel()` stubs
(empty functions initially — the wheel rendering is added in Step 4).

### Step 4: Implement `drawRagaWheel()`

Write the SVG rendering function. The implementation order:

1. **Fixed circle geometry** — Compute `cx`, `cy`, `r_mela` from the SVG viewport
   dimensions. Place 72 mela nodes at equal angular intervals. Draw 12 cakra sector
   arcs as `<path>` elements with distinct fill colours. Draw inner ring labels
   (cakra names and numbers).

2. **Mela node rendering** — For each mela in `ragas.filter(r => r.is_melakarta)`,
   draw a `<circle>` at the computed position. Label with the mela name (abbreviated
   if necessary). Colour by cakra. Attach click and hover handlers.

3. **Graceful degradation for missing melas** — For melakarta numbers 1–72 that have
   no corresponding raga object in `ragas[]`, draw an empty placeholder circle
   labelled with the melakarta number only.

4. **Janya satellite rendering** — On mela click, compute janya positions as evenly
   spaced points on an arc at `r_janya`, centred on the mela's angular position.
   Draw `<line>` spokes from the mela to each janya. Draw janya `<circle>` nodes.
   Attach click and hover handlers.

5. **Composition satellite rendering** — On janya (or mela) click, compute composition
   positions at `r_comp`. Draw spokes and `<circle>` nodes. Attach handlers.

6. **Musician satellite rendering** — On composition click, compute musician positions
   at `r_musician`. Draw spokes and `<circle>` nodes. Clicking a musician node calls
   `triggerBaniSearch` and updates the right panel.

7. **Tooltip rendering** — Use a `<g id="raga-wheel-tooltip">` group containing a
   `<rect>` background and `<text>` elements. Position it near the hovered node.
   Show/hide on `mouseenter`/`mouseleave`.

8. **Collapse logic** — On background click, remove all janya/composition/musician
   satellite groups. Reset the previously expanded mela to its default style.

### Step 5: `showRagaWheel()` and `hideRagaWheel()`

```javascript
function showRagaWheel() {
  document.getElementById('raga-wheel').style.display = '';
  drawRagaWheel();
}

function hideRagaWheel() {
  const wheel = document.getElementById('raga-wheel');
  wheel.style.display = 'none';
  wheel.innerHTML = '';   // clear all rendered content; redraw fresh on next show
}
```

### Step 6: Regenerate and verify

```bash
python3 carnatic/render.py
python3 carnatic/serve.py
```

**Verification checklist:**

- [ ] Header shows `Graph | Timeline | Ragas` segmented control
- [ ] Active view button is highlighted in yellow
- [ ] Clicking `Ragas` hides the Cytoscape canvas and shows the SVG wheel
- [ ] Clicking `Graph` or `Timeline` hides the wheel and restores the Cytoscape canvas
- [ ] `Fit`, `Reset`, `Relayout`, `Labels` buttons are hidden when `Ragas` is active
- [ ] The wheel shows a circle with 12 cakra sectors, each a distinct colour
- [ ] All melas present in `ragas[]` with `is_melakarta: true` appear as nodes on the circle
- [ ] Missing melas (not yet in `ragas[]`) appear as numbered placeholder circles
- [ ] Clicking a mela node expands janya satellites (if any janyas have `parent_raga` set)
- [ ] Clicking a second mela collapses the first
- [ ] Clicking a janya node expands composition satellites (if any compositions have `raga_id` set)
- [ ] Clicking a composition node expands musician satellites and triggers Bani Flow trail
- [ ] Clicking a musician node updates the right panel and Bani Flow trail
- [ ] Clicking the background collapses all expanded layers
- [ ] Hover tooltips appear on mela, janya, composition, and musician nodes
- [ ] Switching from `Ragas` back to `Graph` restores the previous graph layout
- [ ] Bani Flow trail state is preserved across view switches

---

## Verification checklist (architectural)

- [ ] No new data fields added to `musicians.json`, `compositions.json`, or any
      recording file — the wheel reads only existing fields
- [ ] No new Python code in `render.py`'s data-building section — the wheel is
      purely a JavaScript/SVG rendering change
- [ ] `switchView('graph')` produces identical behaviour to the old `toggleLayout()`
      when switching from timeline to graph
- [ ] `switchView('timeline')` produces identical behaviour to the old `toggleLayout()`
      when switching from graph to timeline
- [ ] The `toggleLayout()` function still works (backward compatibility for any
      external callers)
- [ ] ADR-021 data dependency is documented: the wheel degrades gracefully when fewer
      than 72 melas are in `ragas[]`
- [ ] ADR-022 `triggerBaniSearch` is used (not duplicated) for composition and
      musician click handlers in the wheel