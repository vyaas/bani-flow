# ADR-042: Graph-to-Drawer Coupling — Node Clicks Open Panels, View Affinity

**Status:** Proposed
**Date:** 2026-04-18
**Depends on:** ADR-025 (cross-panel coupling), ADR-041 (drawer toggle semantics)

---

## Context

ADR-025 established cross-panel coupling: clicking a composition in the right
panel navigates the left Bani Flow panel, and vice versa. But ADR-025 only
couples *panel-to-panel* interactions. The three canvas views (Guru-Shishya
graph, Mela-Janya raga wheel, Timeline) remain disconnected from the drawer
panels. The user clicks a node on the canvas, sees it highlight, but has no
visible path to the deeper information that lives inside the panels.

### Observed disconnection

1. **Guru-Shishya graph → Musician panel.** Clicking a musician node on the
   Guru-Shishya tree highlights the node and its edges. But the Musician drawer
   (right) does not open. The user must manually tap the Musician tab to discover
   that the panel has been populated with that musician's recordings. On mobile,
   where the panel is invisible by default, the user may never discover the
   connection at all.

2. **Raga Wheel → Bani Flow panel.** Clicking a raga or composition node on the
   Mela-Janya wheel expands sub-nodes (janyas, compositions) and highlights
   connections. But the Bani Flow drawer (left) does not open. The trail — which
   already contains all recordings for that raga — sits behind a closed drawer
   that the user does not know to open.

### Two natural affinities

The four interaction surfaces form two affinity pairs:

| Pair | Canvas view | Panel | Shared concern |
|---|---|---|---|
| **Musicians** | Guru-Shishya graph | Musician (right) | People: their lives, lineages, recordings |
| **Music** | Mela-Janya wheel | Bani Flow (left) | Sound: ragas, compositions, performances |

These affinities are the coupling we are missing. A click on the canvas should
not only update the canvas but also *reveal* the corresponding panel, inviting
the user to explore the deeper layer.

### The overlay dilemma

Clicking a raga node on the Mela-Janya wheel triggers two things: (a) the wheel
expands to show janya sub-nodes or compositions, and (b) under this ADR, the
Bani Flow drawer would slide open. The drawer overlays part of the canvas,
potentially obscuring the just-expanded sub-nodes.

This is a genuine tension. The user's intent is ambiguous: did they click to
explore the wheel's structure, or to see the trail? We cannot know. For now, we
accept the drawer opening as the default and rely on the toggle semantics from
ADR-041 — if the user wants the wheel unobstructed, a single tap on the Bani
Flow tab closes the drawer. Future work may introduce a subtle "peek" indicator
(e.g. a pulsing tab highlight or a badge count) instead of full drawer
expansion, but that is out of scope here.

### User statement

> "Clicking a node on the Guru-Shishya Tree should not only do the normal
> highlighting of connecting nodes and self, but it should also draw out the
> musician panel. Similarly clicking a raga/composition on the raga wheel
> should draw out the Bani Flow panel."

> "These actions are common to both desktop and mobile renderings."

---

## Forces in tension

| Force | Direction |
|---|---|
| **Discovery** | The user cannot explore what they cannot see. Automatically opening the relevant drawer surfaces the deeper layer right when curiosity peaks — at the moment of the click. |
| **Immersion** | Following a thread from a node on the canvas into its recordings, lineage, and related compositions is the rasika rabbit hole. This coupling is the connective tissue. |
| **Overlay cost** | On mobile, an open drawer covers ~85% of the canvas. The raga wheel expansion is invisible while the drawer is open. On desktop, sidebars are always visible and this tension does not arise. |
| **Predictability** | Every canvas click should have a consistent effect. "Click musician → Musician drawer opens" and "Click raga → Bani Flow opens" are simple rules the user can learn. |
| **ADR-025 prerequisite** | ADR-025's Change 0 (explicit play button) separates play from navigate. This ADR builds on that separation: a canvas click is always a navigate action, never a play action. |

---

## Pattern

**Levels of Scale** (Alexander, Pattern 26): The canvas view is the macro scale
(the whole graph, the whole wheel). The drawer panel is the micro scale
(individual recordings, specific lineage details). Clicking a macro element
should reveal its micro detail — this is how levels of scale reinforce each
other. Without this coupling, the scales are disconnected.

**Coupled centres** (Alexander, *The Nature of Order*, Book 1, ch. 5): Two
centres are coupled when the life of one intensifies the life of the other. The
Guru-Shishya graph intensifies the Musician panel by providing context (who are
the gurus?); the Musician panel intensifies the graph by providing content (what
did this musician record?). The coupling must be bidirectional and automatic —
not mediated by a manual search.

---

## Decision

### 1. Guru-Shishya node click → open Musician drawer (right)

When the user clicks (or taps) a musician node on the Guru-Shishya graph:

1. The existing behaviour is preserved: the node highlights, connected edges
   glow, neighbouring nodes are emphasised.
2. **New:** The Musician drawer (right panel) opens automatically with that
   musician's data populated. On mobile, this uses `openRightDrawer()` from
   ADR-039/041. On desktop, the right sidebar is already visible; the panel
   content updates in place (existing behaviour).
3. The Bani Flow drawer (left) closes if open (mutual exclusion per ADR-039).

```javascript
// In the Cytoscape node-click handler (Guru-Shishya view):
cy.on('tap', 'node', function(evt) {
  const node = evt.target;
  // ...existing highlight logic...

  // Populate and open musician panel
  populateMusicianPanel(node.id());

  // Mobile: open right drawer
  if (isMobile()) {
    closeLeftDrawer();
    openRightDrawer();
  }
});
```

### 2. Mela-Janya raga/composition click → open Bani Flow drawer (left)

When the user clicks a raga node or composition node on the Mela-Janya wheel:

1. The existing behaviour is preserved: sub-nodes expand, connections
   highlight.
2. **New:** The Bani Flow drawer (left panel) opens automatically with that
   raga's or composition's trail populated via `triggerBaniSearch()`. On mobile,
   this uses `openLeftDrawer()`. On desktop, the left sidebar updates in place.
3. The Musician drawer (right) closes if open (mutual exclusion).

```javascript
// In the Raga Wheel click handler:
ragaNode.on('click', function(ragaId) {
  // ...existing expansion logic...

  // Populate and open Bani Flow panel
  triggerBaniSearch('raga', ragaId);

  // Mobile: open left drawer
  if (isMobile()) {
    closeRightDrawer();
    openLeftDrawer();
  }
});

compositionNode.on('click', function(compId) {
  // ...existing expansion logic...

  triggerBaniSearch('comp', compId);

  if (isMobile()) {
    closeRightDrawer();
    openLeftDrawer();
  }
});
```

### 3. Desktop behaviour — panel content updates, no drawer animation

On desktop (≥769px), both sidebars are permanently visible. The coupling effect
is limited to populating the correct panel's content. No drawer open/close
animation occurs. This is already partially implemented for some code paths;
this ADR makes it universal for all canvas click events.

### 4. Active tab highlight follows the coupling

When a canvas click opens a drawer, the corresponding tab gains the
`.tab-active` class (per ADR-041 §3). This gives the user a visual signal:
"the Musician tab lit up because you clicked a musician node."

### 5. The overlay dilemma — accepted trade-off

On mobile, when a raga click on the Mela-Janya wheel opens the Bani Flow
drawer, the expanded sub-nodes on the wheel are obscured. We accept this
trade-off for now:

- The user can close the drawer with a single tap on the Bani Flow tab
  (ADR-041 toggle semantics).
- The sub-node expansion state is preserved; closing the drawer reveals it.
- On desktop, this tension does not exist (sidebar does not overlay the canvas).

**Future exploration (out of scope):** A "peek" mode where the tab pulses or
shows a badge ("3 recordings") without fully opening the drawer, letting the
user choose when to switch focus. This would resolve the tension elegantly but
requires a new interaction pattern not yet designed.

---

## Consequences

| Consequence | Impact |
|---|---|
| Every canvas click opens a drawer on mobile | The user sees deeper content immediately. If they prefer the canvas, one tap closes the drawer. Net positive for discovery. |
| Mutual exclusion is enforced on every click | Opening one drawer always closes the other. This is consistent with ADR-039 but means the user cannot have both panels visible simultaneously on mobile (by design). |
| Overlay on raga wheel expansion | A known imperfection. Accepted as trade-off; mitigated by toggle dismiss. |
| Desktop is unaffected in layout | Only panel content population changes. No visual disruption. |
| Dependency on ADR-025 Change 0 | The play button separation is a prerequisite. Without it, canvas clicks would ambiguously trigger both navigation and playback. |

---

## Implementation

1. **Carnatic Coder**: In the Guru-Shishya `cy.on('tap', 'node', ...)` handler,
   add `openRightDrawer()` call (mobile) after `populateMusicianPanel()`.
2. **Carnatic Coder**: In the Mela-Janya raga/composition click handlers, add
   `triggerBaniSearch()` + `openLeftDrawer()` calls (mobile).
3. **Carnatic Coder**: Ensure mutual exclusion: opening either drawer closes the
   other.
4. **Carnatic Coder**: Apply `.tab-active` class to the corresponding tab on
   programmatic drawer open.
5. **Carnatic Coder**: Test on 390px viewport: click musician node → right drawer
   opens; close via tab tap; click raga node → left drawer opens; close via tab.
6. **Carnatic Coder**: Run `bani-render`, verify.
