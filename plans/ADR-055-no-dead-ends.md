# ADR-055: No Dead Ends — Hide Empty Musicians in Panels, Dim Them on the Graph

**Status**: Accepted
**Date**: 2026-04-21
**Agents**: graph-architect

## Context

A click anywhere in the UI must lead to either a recording, a navigable centre, or a meaningful exploration vector. Today, two failure modes exist:

1. The Bani Flow trail and the Musician panel co-performer lists include musicians with **zero** recordings. Clicking them opens a panel that reads "no recordings". A dead end.
2. The guru-shishya graph paints every musician node identically, regardless of whether they have a single recording. The user has no way to know which nodes will be silent on click.

This breaks the listening contract. The raga wheel already solves the analogous problem: ragas with no recordings render at low opacity (`raga_wheel.js` line 759, `isLive` flag). The musician graph should follow.

## Forces

- **No dead ends**: clicks must lead to listenable content.
- **Visible guidance for the librarian**: dimming (not hiding) graph nodes lets the librarian see which musicians need recordings curated. Hiding would erase that signal.
- **Composer exemption**: composers without recordings are *not* dead ends — they have compositions (see ADR-057). The "no dead ends" predicate must consult both data sets.
- **Performance**: the predicate is computed once at render time; no per-click cost.

## Pattern

**Strong Centres + Boundaries**: a centre that cannot fulfil its role on activation must be visually demoted, not erased.

## Decision

### Two predicates, one canonical place

In the render pipeline (`data_transforms.py`):

```python
def musician_has_recording(musician_id, recordings_index) -> bool: ...
def composer_has_composition(composer_id, compositions_index) -> bool: ...

def musician_is_listenable(musician_id, recordings_index, compositions_index, composers_index) -> bool:
    if musician_has_recording(musician_id, recordings_index): return True
    composer_id = composers_index.get_by_musician(musician_id)
    if composer_id and composer_has_composition(composer_id, compositions_index): return True
    return False
```

The unified `musician_is_listenable` predicate is the single source of truth for both the panel filter and the graph dim.

### Panel filtering

In `bani_flow.js` and the Musician-panel co-performer list in `media_player.js`, before rendering a musician row, check `window.musiciansListenable.has(musicianId)`. Skip if false.

### Graph dimming

In `graph_builder.py`, attach `data.is_listenable: bool` to every musician node. In `graph_view.js` Cytoscape stylesheet:

```js
{
  selector: 'node[is_listenable = 0]',
  style: {
    'opacity': 0.25,
    'text-opacity': 1.0   // label stays at full opacity
  }
}
```

The split between body opacity and `text-opacity` preserves the librarian's ability to read the label (and thus identify who needs filling).

### Materialised set on `window`

Renderer injects:

```js
window.musiciansListenable = new Set([...]);
```

JS lookups become O(1) with no per-click recomputation.

## Consequences

- Every musician chip in either panel is a live click target.
- The graph telegraphs "filling needed here" via opacity gradient, naturally guiding curation.
- Changing a recording (adding or removing) requires a re-render to update the dimming — already required by the render gate, so no new burden.
- Composers with compositions but no recordings remain visible on the graph and clickable in panels — they route to the composer panel (ADR-057).

## Implementation

1. Implement `musician_is_listenable` in `data_transforms.py`; build the listenable set during render.
2. Inject `window.musiciansListenable` in `html_generator.py`.
3. Add `data.is_listenable` to musician elements in `graph_builder.py`.
4. Add the Cytoscape selector in `graph_view.js`.
5. Filter co-performer and trail-row rendering in `bani_flow.js` and `media_player.js`.
6. Re-render and verify: a known musician with zero recordings is hidden from panels and dimmed on the graph; their label is still legible.
