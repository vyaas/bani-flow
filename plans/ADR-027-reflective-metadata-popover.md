# ADR-027: Reflective Metadata Popover — Schema Inspection at the Node

**Status:** Proposed  
**Date:** 2026-04-13

---

## Context

### The problem the user named

Working sessions with this knowledge graph repeatedly begin with the same friction: an agent or human collaborator must resolve ambiguities — *which field name is canonical? what is the exact id of this musician? does this recording already exist? what is the confidence on this edge?* — before any productive work can begin. The current workflow requires switching between the browser view and CLI queries (`python3 carnatic/cli.py get-musician <id>`, `--json` flag, etc.) or reading raw JSON files. This is a context-switching tax paid on every session.

The user's proposal: a **double-click action** (or button) on any node or concept in the graph that opens a box displaying the **entire metadata object** for that element. The inspiration is TiddlyWiki, where every "tiddler" is simultaneously content and its own metadata, and the system is self-describing — a quine in the sense that the data model is always visible from within the tool itself.

### What "reflective" means here

A *reflective* system is one that can inspect and display its own structure at runtime. In TiddlyWiki this is achieved because the wiki is a single self-contained HTML file that stores both its data and its rendering logic — the data is always accessible to the rendering layer. Our system is already structured this way: [`carnatic/render/html_generator.py`](../carnatic/render/html_generator.py) injects all data as JavaScript globals (`elements`, `ragas`, `composers`, `compositions`, `recordings`, `musicianToPerformances`, etc.) into the single `graph.html` file. The data is already present in the browser at runtime. The graph is already, in the TiddlyWiki sense, a quine.

This means the overhead of adding reflective metadata display is **lower than it might appear**. No new data pipeline is needed. No server round-trips. No schema changes. The data is already there.

### The concept map context

The [`carnatic/drawings/concept_map.excalidraw`](../carnatic/drawings/concept_map.excalidraw) file shows the full entity model: Musician, Recording, Composition, Raga, and their relationships, with file references (`data/compositions.json`, `data/musicians.json`) annotated directly on the diagram. This map is the working document for architectural sessions. The user's request is essentially: *make the graph.html itself as self-describing as this concept map, so that the tool can answer its own structural questions.*

---

## Forces in tension

| Force | Description |
|---|---|
| **Immersion** | The rasika must not be interrupted by metadata machinery. The popover must be opt-in (double-click or explicit button), not triggered by normal navigation. |
| **Fidelity to the oral tradition** | The graph is a listening tool first. Metadata inspection is a scholar/agent tool. The two modes must not collide. |
| **Zero new data pipeline** | All data is already injected as JS globals by the render pipeline. Any solution that requires new server calls, new Python transforms, or new JSON fields is over-engineered. |
| **Copy-paste utility** | The user explicitly names copy-pasting into architecture documents as a use case. The popover must render the raw JSON object in a form that is immediately copy-pasteable — not a pretty-printed summary, but the actual schema-faithful object. |
| **Agent orientation** | Agents beginning a session need to resolve ambiguities quickly. A reflective popover that shows the exact field names and values of any node, edge, raga, or recording eliminates the need to run CLI queries for orientation. |
| **Scalability without fragmentation** | The same mechanism must work for all entity types: musician nodes, edges, ragas, compositions, recordings, performances. It must not require a separate implementation per entity type. |
| **Minimal DOM footprint** | The popover is a utility overlay. It must not compete with the media player, the sidebars, or the graph canvas for visual attention. |

---

## Pattern

### **The Map is the Territory** (Alexander, *The Nature of Order*, Book 2 — *The Process of Creating Life*)

Alexander describes living structure as self-similar across scales: the detail of a tile reflects the structure of the room; the room reflects the structure of the building. A reflective metadata popover is the graph's equivalent: the data that *generates* the visual node is also *visible within* the node on demand. The map contains a description of itself. This is not a gimmick — it is the condition under which the tool can be trusted. When the rasika or scholar can see the raw data behind any visual element, they can verify the tool's claims. Trust requires transparency.

### **Layers of Meaning** (Alexander, *A Pattern Language*, Pattern 197 — *Thick Walls*)

The node in the graph has two layers: the visual layer (colour, shape, label, position) and the data layer (id, born, died, era, instrument, bani, sources, youtube, edges). Currently only the visual layer is accessible from within the tool. The data layer is accessible only via CLI or file inspection. This ADR proposes making the data layer accessible from within the visual layer — a "thick wall" that contains both the surface and the substance.

### **Gradients** (Alexander, *A Pattern Language*, Pattern 9)

The interaction gradient is:
```
hover       → popover: name, lifespan, era, instrument (already implemented)
single-click → sidebar: full node info + recordings (already implemented)
double-click → metadata inspector: raw JSON object, copy button
```

Each level reveals more. The double-click is the deepest level — it is not for casual browsing but for deliberate inspection. The gradient ensures that the metadata inspector does not intrude on normal use.

---

## Overhead analysis — what it actually costs

This is the core of the user's question. The answer is: **the overhead is small, and it is entirely in the rendering layer**.

### What is already present (zero cost)

The following data is already injected as JS globals in every `graph.html`:

| Global | Contents | Relevant for |
|---|---|---|
| `elements` | All Cytoscape node and edge data objects | Musician nodes, edges |
| `ragas` | All raga objects from `compositions.json` | Raga panel |
| `composers` | All composer objects | Composition panel |
| `compositions` | All composition objects | Bani Flow |
| `recordings` | All structured concert recording objects | Concert brackets |
| `musicianToPerformances` | `{musician_id: [PerformanceRef]}` | Right sidebar |
| `compositionToPerf` | `{composition_id: [PerformanceRef]}` | Bani Flow trail |
| `ragaToPerf` | `{raga_id: [PerformanceRef]}` | Raga panel |

Every entity the user might want to inspect is already in the browser's memory. The reflective popover is a **read-only view** of data that is already there.

### What must be added (the actual overhead)

**1. A single DOM element: the metadata inspector overlay**

One `<div id="meta-inspector">` added to [`carnatic/render/templates/base.html`](../carnatic/render/templates/base.html). It contains:
- A title bar (entity type + id)
- A `<pre>` element for the JSON display
- A "Copy JSON" button
- A close button

Estimated HTML: ~15 lines. Estimated CSS: ~30 lines.

**2. A single JS function: `openMetaInspector(entityType, entityId)`**

This function:
1. Looks up the entity in the appropriate JS global (e.g. `elements.find(e => e.data.id === entityId)` for nodes)
2. Calls `JSON.stringify(obj, null, 2)` on the result
3. Sets the `<pre>` content
4. Shows the overlay

Estimated JS: ~40 lines. No new data structures. No new render-time computation.

**3. A new event binding: `cy.on('dbltap', 'node', ...)`**

Currently `dbltap` on a node opens Wikipedia (`window.open(url, '_blank')`). This must be reassigned to open the metadata inspector instead. Wikipedia can be moved to the existing `node-wiki-link` `↗` button in the right sidebar (already present) or to a keyboard modifier (Shift+click).

This is the **one breaking change**: the existing double-click-to-Wikipedia behaviour is displaced. This is a deliberate trade-off — see Consequences below.

**4. Edge inspection**

Edges currently show a summary in the right sidebar on single-click. Double-click on an edge (currently unbound) can open the metadata inspector for the edge object. No conflict.

**5. Raga / composition / recording inspection**

The Bani Flow panel and Raga Wheel do not use Cytoscape events. Inspection of ragas, compositions, and recordings requires a separate trigger — a small `{ }` icon button added to the subject header in the Bani Flow panel and to the concert bracket header. This is optional scope and can be deferred.

### What it does NOT require

- No new Python code
- No new JSON fields
- No new render-time transforms
- No server round-trips
- No schema changes to `musicians.json`, `compositions.json`, or any recording file
- No changes to `write_cli.py` or `cli.py`
- No changes to `graph_builder.py` or `data_loaders.py`

---

## Decision

### Proposed schema change

**None.** This ADR proposes no data schema change. The metadata inspector is a pure rendering-layer feature.

### Proposed interaction model

```
GRAPH VIEW
  double-click node    → open MetaInspector(type='node', id=node.id)
  double-click edge    → open MetaInspector(type='edge', id=edge.id)
  [previously: double-click node → window.open(wikipedia)]
  [wikipedia access: via ↗ link in right sidebar node-info panel — already present]

BANI FLOW PANEL (optional, deferred)
  { } button on subject header → open MetaInspector(type='raga'|'composition', id=subject.id)

CONCERT BRACKET (optional, deferred)
  { } button on bracket header → open MetaInspector(type='recording', id=recording.id)
```

### Proposed overlay shape

```
┌──────────────────────────────────────────────────────────────┐
│  node · ramnad_krishnan                              [✕] [⎘]  │  ← title bar
├──────────────────────────────────────────────────────────────┤
│  {                                                            │
│    "id": "ramnad_krishnan",                                   │
│    "label": "Ramnad Krishnan",                                │
│    "era": "disseminator",                                     │
│    "instrument": "vocal",                                     │
│    "born": 1918,                                              │
│    "died": 1973,                                              │
│    "bani": "semmangudi",                                      │
│    "sources": [...],                                          │
│    "youtube": [...],                                          │
│    "tracks": [...],                                           │
│    "degree": 4,                                               │
│    "color": "#689d6a",                                        │
│    "shape": "ellipse",                                        │
│    ...                                                        │
│  }                                                            │
└──────────────────────────────────────────────────────────────┘
```

The `[⎘]` button copies the full JSON to the clipboard. The overlay is positioned at the centre of the viewport (not anchored to the node) so it does not obscure the graph.

### Before / after JSON shape

No JSON shape changes. The data displayed is the existing Cytoscape element data object, which is already the full node data as built by [`carnatic/render/graph_builder.py:build_elements()`](../carnatic/render/graph_builder.py:59).

#### Before (double-click node)

```javascript
cy.on('dbltap', 'node', evt => {
  const url = evt.target.data('url');
  if (url) window.open(url, '_blank');
});
```

#### After (double-click node)

```javascript
cy.on('dbltap', 'node', evt => {
  openMetaInspector('node', evt.target.data());
});

cy.on('dbltap', 'edge', evt => {
  openMetaInspector('edge', evt.target.data());
});

function openMetaInspector(type, dataObj) {
  const inspector = document.getElementById('meta-inspector');
  document.getElementById('mi-title').textContent =
    type + ' · ' + (dataObj.id || '');
  document.getElementById('mi-pre').textContent =
    JSON.stringify(dataObj, null, 2);
  inspector.style.display = 'flex';
}
```

#### New DOM element (in `base.html`)

```html
<div id="meta-inspector" style="display:none">
  <div id="mi-bar">
    <span id="mi-title"></span>
    <button id="mi-copy" title="Copy JSON to clipboard">⎘</button>
    <button id="mi-close" title="Close">✕</button>
  </div>
  <pre id="mi-pre"></pre>
</div>
```

#### New CSS (in `base.html`)

```css
#meta-inspector {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 520px; max-height: 70vh;
  background: var(--bg1);
  border: 1px solid var(--yellow);
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  display: flex; flex-direction: column;
  z-index: 1000;
  font-family: 'Courier New', monospace;
}
#mi-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px;
  background: var(--bg2); border-radius: 4px 4px 0 0;
  border-bottom: 1px solid var(--bg3);
  flex-shrink: 0;
}
#mi-title {
  flex: 1; font-size: 0.78rem; color: var(--yellow);
  font-weight: bold; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
#mi-copy, #mi-close {
  background: none; border: none; color: var(--gray);
  font-size: 1rem; cursor: pointer; padding: 0 3px; line-height: 1;
}
#mi-copy:hover { color: var(--aqua); }
#mi-close:hover { color: var(--red); }
#mi-pre {
  flex: 1; overflow-y: auto;
  padding: 12px 14px;
  font-size: 0.72rem; color: var(--fg2);
  line-height: 1.5; white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
```

---

## Consequences

### What this enables

| Scenario | Before | After |
|---|---|---|
| "What is the exact `id` of this musician?" | Run `python3 carnatic/cli.py get-musician <label>` | Double-click node → see `"id": "ramnad_krishnan"` |
| "What is the confidence on this edge?" | Run `python3 carnatic/cli.py get-musician <id> --json` and parse | Double-click edge → see `"confidence": 0.95` |
| "Does this node have a `bani` field set?" | Read `musicians.json` or run CLI | Double-click node → see `"bani": "semmangudi"` or `"bani": ""` |
| "What sources does this node have?" | CLI `--json` flag | Double-click → see full `sources` array |
| "I need to paste this node's data into an ADR" | CLI + copy terminal output | Double-click → click ⎘ → paste |
| "What `raga_id` does this composition use?" | `python3 carnatic/cli.py get-composition <id>` | (deferred) `{ }` button on Bani Flow subject header |
| Agent session startup: resolve ambiguities | Multiple CLI queries | Double-click any node → full object visible |

### What this forecloses

**Double-click-to-Wikipedia is displaced.** This is the only breaking change. The Wikipedia link is already accessible via the `↗` button in the right sidebar's node-info panel (element `#node-wiki-link`), which is shown whenever a node is selected. The double-click gesture is more valuable as a metadata inspector than as a Wikipedia shortcut, because:
1. The `↗` link is already one click away after a single-click selection.
2. The metadata inspector has no other natural trigger in the Cytoscape event model.
3. The use case (agent/scholar orientation) is more frequent than the use case (opening Wikipedia in a new tab).

If the double-click-to-Wikipedia behaviour is considered essential, it can be preserved as a keyboard modifier: `Shift+double-click` opens Wikipedia; plain double-click opens the inspector.

### What this does NOT foreclose

- The existing hover popover (name, lifespan, era, instrument) is unchanged.
- The existing single-click sidebar (full node info + recordings) is unchanged.
- The existing edge single-click (confidence, note, source URL) is unchanged.
- The media player is unchanged.
- All data schema files are unchanged.
- The render pipeline is unchanged.

### Complexity assessment

The user asked directly: *what overhead would we have to pay?*

**Rendering layer only.** The total change is:
- ~15 lines of HTML (one new `<div>`)
- ~40 lines of CSS (one new overlay style block)
- ~30 lines of JS (one new function + two event rebindings)
- One breaking change to the `dbltap` event handler

**No Python changes. No data changes. No new dependencies.**

The system is already a quine in the TiddlyWiki sense: all data is embedded in the single `graph.html` file at render time. The reflective popover is simply a window into data that is already present. The overhead is proportional to the size of the UI addition, not to any new data infrastructure.

---

## Implementation

**Agent:** Carnatic Coder  
**Files to modify:**

| File | Changes |
|---|---|
| [`carnatic/render/templates/base.html`](../carnatic/render/templates/base.html) | Add `#meta-inspector` DOM element; add CSS block |
| [`carnatic/render/templates/graph_view.js`](../carnatic/render/templates/graph_view.js) | Rebind `cy.on('dbltap', 'node', ...)` to `openMetaInspector`; add `cy.on('dbltap', 'edge', ...)`; add `openMetaInspector()` function; wire `#mi-copy` and `#mi-close` buttons |

**No Python changes. No data schema changes.**

**Suggested implementation order:**

1. Add `#meta-inspector` HTML to `base.html` (before `<!-- INJECT_SCRIPTS -->`).
2. Add CSS for `#meta-inspector` to `base.html` `<style>` block.
3. Replace `cy.on('dbltap', 'node', ...)` in `graph_view.js`.
4. Add `cy.on('dbltap', 'edge', ...)` in `graph_view.js`.
5. Add `openMetaInspector()` function in `graph_view.js`.
6. Wire `#mi-copy` (clipboard) and `#mi-close` (hide) in `graph_view.js`.

**Verification:**

```bash
# Regenerate graph.html
source .venv/bin/activate
gstree-render

# Open in browser
gstree-serve

# Test 1: Double-click any musician node
#   → MetaInspector opens with full node data object
#   → id, label, era, instrument, born, died, bani, sources, tracks all visible

# Test 2: Double-click any edge
#   → MetaInspector opens with edge data: source, target, confidence, note, source_url

# Test 3: Click ⎘ button
#   → JSON copied to clipboard; paste into a text editor to verify

# Test 4: Click ✕ button
#   → Inspector closes; graph is fully interactive again

# Test 5: Single-click a node (existing behaviour)
#   → Right sidebar updates as before; inspector does NOT open

# Test 6: Hover a node (existing behaviour)
#   → Hover popover appears as before; inspector does NOT open

# Test 7: Wikipedia access
#   → Single-click a node → ↗ link appears in right sidebar → click it → Wikipedia opens
#   → (Double-click no longer opens Wikipedia)
```

---

## Deferred scope (not in this ADR)

The following extensions are architecturally coherent but are deferred to avoid scope creep:

1. **Raga / composition inspector** — `{ }` button on the Bani Flow subject header, opening `openMetaInspector('raga', ragaObj)` or `openMetaInspector('composition', compObj)`.
2. **Recording inspector** — `{ }` button on the concert bracket header, opening `openMetaInspector('recording', recordingObj)`.
3. **Syntax highlighting** — the `<pre>` block could use a lightweight JSON syntax highlighter (e.g. colour keys in yellow, strings in aqua, numbers in orange) to match the Gruvbox palette. This is cosmetic and deferred.
4. **Shift+double-click-to-Wikipedia** — if the Wikipedia shortcut is missed, a keyboard modifier can restore it without conflicting with the inspector.
5. **Inspector as copy-paste source for ADRs** — the user mentioned this use case. A future enhancement could add a "Copy as Markdown table" button that formats the object as a markdown field reference table, ready to paste into an ADR.

---

## ADR references

| ADR | Relationship |
|---|---|
| ADR-013 | Single source of truth traversal layer — the JS globals that the inspector reads are the same globals that power all traversal queries |
| ADR-024 | Render refactor — established the template injection architecture that makes the data available as JS globals |
| ADR-025 | Cross-panel coupling — established the `dbltap` event as the Wikipedia trigger; this ADR reassigns it |
| ADR-026 | Concert-anchored player — the player instance data (`playerRegistry`) could also be exposed via the inspector in a future extension |
