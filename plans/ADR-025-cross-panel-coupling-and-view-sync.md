# ADR-025: Cross-Panel Coupling and View Synchronisation

**Status:** Proposed  
**Date:** 2026-04-12

---

## Context

The graph currently has three views (Graph, Timeline, Raga Wheel) and two panels
(left: Bani Flow; right: Musician/Recordings). Each view and panel was designed
independently. As a result, the user's exploration path is fragmented:

- Clicking a composition in the right panel opens a player but offers no way to
  explore *who else performed that composition* — the rasika rabbit hole.
- Clicking a raga name in the right panel does nothing navigable.
- Selecting a raga or composition in the left Bani Flow panel does not cause the
  Raga Wheel to reflect that selection — the wheel remains in its default state.
- Clicking a janya raga node in the Raga Wheel expands compositions but does not
  update the left panel.
- Clicking a musician node in the Raga Wheel calls
  `triggerBaniSearch('raga', comp.raga_id)` — the raga of the composition, not
  the musician — which is semantically inconsistent.

The result is that the three views feel like three separate applications sharing
a screen rather than one living structure. The rasika cannot follow a thread
from a recording to a lineage to a raga and back without manually re-entering
search terms.

### UX constraint (user-stated)

> "We need to restore an explicit play button for both panels to indicate to the
> user that clicking play will open a player, keeping all else fixed, but
> clicking other items can change items in other panels/views."

Currently, clicking a row in the right panel *is* the play action. If we
repurpose row clicks for cross-navigation, the play affordance must be made
explicit and visually distinct. This is a prerequisite for all four coupling
changes below.

---

## Forces in tension

| Force | Description |
|---|---|
| **Immersion** | The rasika must be able to follow a thread — composition → who else played it → raga → mela — without breaking flow. |
| **Clarity of affordance** | Every clickable element must communicate what it will do. A row that both plays and navigates is ambiguous. |
| **Fidelity to the oral tradition** | The Bani Flow panel is the primary instrument of lineage exploration. It must be the canonical destination for any cross-navigation. |
| **Scalability** | The coupling mechanism must not require changes to the data schema — only to the JS interaction layer. |
| **Mutual exclusion** | The existing mutual-exclusion contract between chip filters and Bani Flow must be preserved. |

---

## Pattern

**Levels of Scale** (Alexander, *A Pattern Language*, Pattern 26) — living
structure requires that each level of scale reinforces every other. The
recording (a single performance), the composition (a musical idea), the raga
(a tonal universe), and the lineage (a transmission chain) are four levels of
scale in this graph. Currently they are disconnected. This ADR creates the
connective tissue between them.

**Strong Centres** — the Bani Flow panel is the strongest centre in the left
sidebar: it is the place where the rasika's attention is focused when exploring
a composition or raga. All cross-navigation should converge on it, not scatter
across multiple UI elements.

**Boundaries** — the play action and the navigate action must be separated by a
clear boundary: a dedicated ▶ button. Without this boundary, the user cannot
predict what a click will do.

---

## Decision

### Change 0 — Explicit play button (prerequisite for all other changes)

**Scope:** [`media_player.js`](../carnatic/render/templates/media_player.js) ·
[`bani_flow.js`](../carnatic/render/templates/bani_flow.js) ·
[`base.html`](../carnatic/render/templates/base.html)

Every playable row in both panels gains a small ▶ play button. The row click
is freed for cross-navigation. The play button click calls
`openOrFocusPlayer()` and stops event propagation.

**Before (right panel — `buildConcertBracket`):**
```js
li.addEventListener('click', () =>
  openOrFocusPlayer(p.video_id, p.display_title, artistLabel,
                    p.offset_seconds > 0 ? p.offset_seconds : undefined));
```

**After:**
```js
// Row click → cross-navigate (composition or raga)
li.addEventListener('click', () => {
  if (p.composition_id) triggerBaniSearch('comp', p.composition_id);
  else if (p.raga_id)   triggerBaniSearch('raga', p.raga_id);
});

// ▶ button → play only
const playBtn = document.createElement('button');
playBtn.className = 'rec-play-btn';
playBtn.title = 'Play';
playBtn.textContent = '▶';
playBtn.addEventListener('click', e => {
  e.stopPropagation();
  openOrFocusPlayer(p.video_id, p.display_title, artistLabel,
                    p.offset_seconds > 0 ? p.offset_seconds : undefined);
});
row1.appendChild(playBtn);
```

The same pattern applies to:
- Legacy flat items in `buildRecordingsList` (right panel)
- Trail items in `buildTrailItem` (left panel)

**CSS addition to `base.html`:**
```css
.rec-play-btn {
  flex-shrink: 0;
  background: none;
  border: 1px solid var(--bg3);
  color: var(--aqua);
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 2px;
  cursor: pointer;
  line-height: 1;
}
.rec-play-btn:hover {
  background: var(--bg2);
  border-color: var(--aqua);
  color: var(--fg);
}
```

---

### Change 1 — Right panel composition click → left panel Bani Flow

**Scope:** [`media_player.js`](../carnatic/render/templates/media_player.js)

When the user clicks a composition row in the right panel (inside a concert
bracket or as a legacy flat item), the left panel's Bani Flow panel is updated
to show all musicians who have performed that composition, and the graph
highlights those nodes.

This is the "rasika rabbit hole": from a single performance, the user can
immediately see the full lineage of performers of that composition.

**Mechanism:** Row click calls `triggerBaniSearch('comp', p.composition_id)` if
`p.composition_id` is set; falls back to `triggerBaniSearch('raga', p.raga_id)`
if only `p.raga_id` is set; does nothing if neither is set (e.g. tani avartanam).

**Before (right panel row click):**
```js
// clicking the row opens the player
li.addEventListener('click', () =>
  openOrFocusPlayer(p.video_id, p.display_title, artistLabel, ...));
```

**After (right panel row click):**
```js
// clicking the row cross-navigates; ▶ button plays (Change 0)
li.addEventListener('click', () => {
  if (p.composition_id)      triggerBaniSearch('comp', p.composition_id);
  else if (p.raga_id)        triggerBaniSearch('raga', p.raga_id);
  // else: no-op (tani, unknown)
});
```

**Legacy flat items** (`rec-legacy`) follow the same pattern, using
`t.composition_id` / `t.raga_id` from the track object.

---

### Change 2 — Right panel raga click → left panel Bani Flow

**Scope:** [`media_player.js`](../carnatic/render/templates/media_player.js)

The raga name displayed in `rec-meta` (row 2 of each concert-perf-item and
legacy item) becomes a clickable link that calls
`triggerBaniSearch('raga', p.raga_id)`.

This is distinct from Change 1: Change 1 navigates to the *composition*; Change
2 navigates to the *raga*. The user can choose the level of granularity.

**Before (raga display in `buildConcertBracket`):**
```js
const ragaName = ragaObj ? ragaObj.name : (p.raga_id || '');
metaSpan.textContent = [ragaName, talaPart].filter(Boolean).join(' · ');
```

**After:**
```js
// Raga name becomes a clickable span
if (ragaObj && p.raga_id) {
  const ragaLink = document.createElement('span');
  ragaLink.className = 'rec-raga-link';
  ragaLink.textContent = ragaObj.name;
  ragaLink.title = 'Explore raga in Bani Flow';
  ragaLink.addEventListener('click', e => {
    e.stopPropagation();
    triggerBaniSearch('raga', p.raga_id);
  });
  metaSpan.appendChild(ragaLink);
  if (talaPart) {
    metaSpan.appendChild(document.createTextNode(' · ' + talaPart));
  }
} else {
  metaSpan.textContent = [ragaName, talaPart].filter(Boolean).join(' · ');
}
```

**CSS addition:**
```css
.rec-raga-link {
  color: var(--teal);
  cursor: pointer;
  text-decoration: none;
}
.rec-raga-link:hover { text-decoration: underline; }
```

---

### Change 3 — Left panel Bani Flow filter → Raga Wheel exploded view

**Scope:** [`bani_flow.js`](../carnatic/render/templates/bani_flow.js) ·
[`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js)

When the user selects a raga or composition in the Bani Flow panel (left), and
the current view is `'raga'`, the Raga Wheel should automatically expand to
show that raga's position in the melakarta hierarchy.

When the current view is *not* `'raga'`, no wheel action is taken (the wheel
is not visible).

**Mechanism:** `applyBaniFilter(type, id)` in `bani_flow.js` gains a call to a
new function `syncRagaWheelToFilter(type, id)` at its end.

**New function in `raga_wheel.js`:**
```js
/**
 * Programmatically expand the raga wheel to show the given raga or
 * the raga of the given composition. No-op if the raga view is not active.
 * @param {'raga'|'comp'} type
 * @param {string} id
 */
function syncRagaWheelToFilter(type, id) {
  if (currentView !== 'raga') return;

  let ragaId = id;
  if (type === 'comp') {
    const comp = compositions.find(c => c.id === id);
    if (!comp || !comp.raga_id) return;
    ragaId = comp.raga_id;
  }

  const raga = ragas.find(r => r.id === ragaId);
  if (!raga) return;

  // Resolve to the melakarta: if janya, climb to parent_raga
  const melaId = raga.is_melakarta ? raga.id : raga.parent_raga;
  if (!melaId) return;

  const melaRaga = ragas.find(r => r.id === melaId);
  if (!melaRaga || !melaRaga.melakarta) return;

  // Redraw the wheel and expand the resolved mela
  drawRagaWheel();
  _triggerMelaExpand(melaRaga.melakarta, ragaId);
}
```

**New helper in `raga_wheel.js` — `_triggerMelaExpand(melaNum, targetRagaId)`:**

This function simulates a click on the mela node for `melaNum`, then (if
`targetRagaId` is a janya) simulates a click on the janya node. It reuses the
existing `_expandMela` and `_expandComps` internal functions.

```js
function _triggerMelaExpand(melaNum, targetRagaId) {
  // Find the mela node <g> by data-mela attribute and dispatch a click
  const melaG = document.querySelector(
    `#raga-wheel .mela-node[data-mela="${melaNum}"]`
  );
  if (melaG) melaG.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  // If targetRagaId is a janya, also expand it
  if (targetRagaId) {
    const janyaG = document.querySelector(
      `#raga-wheel .janya-node[data-id="${targetRagaId}"]`
    );
    if (janyaG) janyaG.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
}
```

**Addition to `applyBaniFilter` in `bani_flow.js`:**
```js
function applyBaniFilter(type, id) {
  // ... existing code ...
  buildListeningTrail(type, id, matchedNodeIds);
  document.getElementById('trail-filter').style.display = 'block';
  document.getElementById('trail-filter').value = '';

  // NEW: sync raga wheel if it is the active view
  if (typeof syncRagaWheelToFilter === 'function') {
    syncRagaWheelToFilter(type, id);
  }
}
```

---

### Change 4 — Raga Wheel raga/composition click → left panel Bani Flow

**Scope:** [`raga_wheel.js`](../carnatic/render/templates/raga_wheel.js)

Currently:
- Clicking a **composition node** in the wheel calls `triggerBaniSearch('comp', item.id)` ✓
- Clicking a **musician node** in the wheel calls `triggerBaniSearch('raga', comp.raga_id)` ✗ (should navigate to the musician in the graph)
- Clicking a **janya node** in the wheel expands compositions but does **not** call `triggerBaniSearch` ✗

**Corrections:**

**Janya node click** — after expanding compositions, also trigger a raga search:
```js
// In _expandMela, janya node click handler — ADD after _expandComps call:
triggerBaniSearch('raga', janya.id);
```

**Musician node click** — replace the current `triggerBaniSearch('raga', comp.raga_id)` with
`selectNode(node)` (navigate to the musician in the graph) and switch to graph
view if not already there. The raga search is already triggered by the
composition node click that preceded it.

```js
// In _expandMusicians, musician node click handler — REPLACE:
// OLD:
if (node && node.length) {
  cy.elements().removeClass('highlighted bani-match');
  node.addClass('bani-match');
  triggerBaniSearch('raga', comp.raga_id || '');
}
if (typeof showMusicianInfo === 'function') showMusicianInfo(node);

// NEW:
if (node && node.length) {
  switchView('graph');          // bring graph into view
  cy.elements().removeClass('faded highlighted bani-match');
  selectNode(node);             // highlight + populate right panel
}
```

---

## Interaction model after all four changes

```
RIGHT PANEL (Musician)
  concert-perf-item row click  → triggerBaniSearch('comp', composition_id)
                                  OR triggerBaniSearch('raga', raga_id)
  raga name click (rec-meta)   → triggerBaniSearch('raga', raga_id)
  ▶ play button click          → openOrFocusPlayer(...)   [no cross-nav]

LEFT PANEL (Bani Flow)
  composition/raga selected    → applyBaniFilter(type, id)
                                  + syncRagaWheelToFilter(type, id)  [if raga view active]
  trail item row click         → triggerBaniSearch('comp'|'raga', id)  [same as before]
  ▶ play button click          → openOrFocusPlayer(...)   [no cross-nav]

RAGA WHEEL (centre canvas)
  mela node click              → _expandMela(...)          [no bani search]
  janya node click             → _expandComps(...)
                                  + triggerBaniSearch('raga', janya.id)
  composition node click       → triggerBaniSearch('comp', item.id)  [already exists]
  musician node click          → switchView('graph') + selectNode(node)
```

---

## Consequences

### Enables
- The rasika rabbit hole: from any performance in the right panel, one click
  reaches all other performers of that composition in the left panel.
- Raga-level exploration from the right panel without leaving the current view.
- The Raga Wheel becomes a navigation instrument, not just a visualisation: a
  janya click populates the Bani Flow trail with all performances in that raga.
- The Bani Flow panel drives the Raga Wheel when the raga view is active,
  creating a bidirectional coupling between the two most musically rich panels.
- Musician nodes in the Raga Wheel now correctly navigate to the musician in
  the graph, completing the mela → janya → composition → musician → graph path.

### Forecloses
- The current behaviour where clicking a row in the right panel immediately
  opens a player. Users who relied on this muscle memory will need to learn the
  ▶ button. This is a deliberate trade-off: clarity of affordance over
  convenience of the current single-click-to-play.

### Queries now possible
- "Who else has performed Surutti?" — click any Surutti performance in the
  right panel → left panel shows all performers.
- "Where does Surutti sit in the melakarta system?" — click the raga name in
  the right panel → left panel shows Surutti (janya of Harikambhoji, Mela 28,
  Cakra 5 Bana) → switch to Raga view → wheel auto-expands to Mela 28,
  janya Surutti.
- "What compositions are in Harikambhoji?" — click the mela in the wheel →
  janya list expands → click Surutti → left panel shows all Surutti
  compositions and performers.
- "Show me Ramnad Krishnan's lineage after hearing his Surutti" — click
  Ramnad Krishnan in the Raga Wheel musician ring → graph view opens with
  Ramnad Krishnan selected and his lineage highlighted.

---

## Implementation

**Agent:** Carnatic Coder  
**Files to modify:**

| File | Changes |
|---|---|
| [`carnatic/render/templates/media_player.js`](../carnatic/render/templates/media_player.js) | Change 0 (▶ button in `buildConcertBracket` + `buildRecordingsList`); Change 1 (row click → `triggerBaniSearch`); Change 2 (raga link in `rec-meta`) |
| [`carnatic/render/templates/bani_flow.js`](../carnatic/render/templates/bani_flow.js) | Change 0 (▶ button in `buildTrailItem`); Change 3 (call `syncRagaWheelToFilter` at end of `applyBaniFilter`) |
| [`carnatic/render/templates/raga_wheel.js`](../carnatic/render/templates/raga_wheel.js) | Change 3 (`syncRagaWheelToFilter` + `_triggerMelaExpand` functions); Change 4 (janya click → `triggerBaniSearch`; musician click → `switchView` + `selectNode`) |
| [`carnatic/render/templates/base.html`](../carnatic/render/templates/base.html) | CSS for `.rec-play-btn` and `.rec-raga-link` |

**Suggested implementation order:**
1. Change 0 (▶ button) — prerequisite; must land first.
2. Change 1 (right panel composition → left panel).
3. Change 2 (right panel raga link → left panel).
4. Change 4 (raga wheel → left panel / graph corrections).
5. Change 3 (left panel → raga wheel sync) — last, because it depends on
   `syncRagaWheelToFilter` being defined in `raga_wheel.js` before
   `bani_flow.js` calls it. The concatenation order in `html_generator.py`
   already places `raga_wheel.js` before `bani_flow.js`, so no pipeline change
   is needed.

**No schema changes required.** All four changes are pure JS interaction-layer
modifications. The data model (`musicians.json`, `compositions.json`,
`recordings/*.json`, `graph.json`) is unchanged.

---

## ADR references

| ADR | Relationship |
|---|---|
| ADR-003 | Bani Flow left sidebar — establishes `triggerBaniSearch` as the canonical entry point |
| ADR-018 | Concert-bracketed recording groups — defines the right panel DOM structure this ADR modifies |
| ADR-019 | Co-performer bracketed trail entries — defines `buildTrailItem` which gains a ▶ button |
| ADR-020 | Raga/composition header parity — defines the subject header this ADR feeds |
| ADR-022 | Raga panel navigability — defines janya links; Change 4 extends this pattern to the wheel |
| ADR-023 | Raga wheel third view — defines `switchView`, `drawRagaWheel`, `_expandMela`; Change 3 extends these |
