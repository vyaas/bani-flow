# ADR-057: Composer Panel — Compositions as the Listenable Surface

**Status**: Accepted
**Date**: 2026-04-21
**Agents**: graph-architect

## Context

Composers occupy a special place in Carnatic music. The Trinity — Tyagaraja, Muthuswami Dikshitar, Syama Sastri — and other foundational composers (Purandara Dasa, Annamacharya, Swati Tirunal, …) left no recordings; what remains is their **compositions**, transmitted through generations of performers.

Today, a composer with `musician_node_id` set appears as a node on the guru-shishya graph but, when clicked, opens an empty Musician panel. The Musician panel only knows how to list *recordings*; composers don't have any. Worse, after ADR-055 those nodes will be dimmed — the visual signal will say "dead end" when in fact a composer node is one of the *richest* exploration vectors in the graph.

We need a panel mode that surfaces a composer's compositions and lets the user reach recordings by other artists *of those compositions*.

## Forces

- **Composers are first-class centres**: especially the Trinity. Their click target is the compositions they authored, not the recordings they made.
- **Compositions lead to recordings**: each composition has zero or more recordings in `data/recordings/*.json`. The composer panel is a two-step path: composer → composition → recordings (by performer).
- **No new graph nodes required**: composers either already have musician nodes (typed as `composer`), or live only in `composers.json`. The latter is fine — chip clicks always work even without a graph node.
- **Reuse the Musician panel chrome**: do not build a third panel. Add a sub-mode.

## Pattern

**Strong Centres + Levels of Scale**: composer is a centre; its compositions are sub-centres; each composition's recordings are leaf centres. Three levels in one panel.

## Decision

### Panel sub-mode

The Musician panel gains a `subtype` distinguishing two modes:

| `subtype` | Header shows | Body lists |
|---|---|---|
| `performer` (default) | musician name + era + dates | recording rows (existing behaviour) |
| `composer` | composer name + era + dates + "Compositions (N)" | composition rows |

### Composition row layout

```
[ comp-chip ]   [ raga-chip ]                  [▶ recordings (N)]
```

Tapping the trailing button expands the row in place to reveal the existing recording-row template (one row per known recording, ordered by date). Each expanded recording row uses the play buttons defined in ADR-053 (dotted for concert-backed) and the chips defined in ADR-054/056.

### Entry points

A composer panel opens when:

1. The user clicks any **composer chip** anywhere in the UI. Composer chips appear:
   - In Bani Flow trail rows under the composition (existing `composer.name` link, restyled as `.composer-chip` with era tint).
   - In the Musician panel under each row's composition (new).
   - In the media-player chip strip beside `.mp-comp-chip`.

2. The user clicks a **composer node** on the guru-shishya graph **and** the node either:
   - Has `is_composer = true` and zero recordings (the trinity case), **or**
   - Is in the trinity allowlist regardless of recording count.

   Otherwise (e.g. a composer-performer like Patnam Subramania Iyer who has both compositions and recordings), the click opens the standard performer panel — but the header gains a "Compositions (N) →" link to switch to composer mode.

### Routing

```js
triggerBaniSearch({ kind: 'composer', id: composerId });
```

`bani_flow.js` (or a thin shim) routes this to a new `openComposerPanel(composerId)` in `media_player.js`. Existing `triggerBaniSearch({ kind: 'raga', id })` etc. are unchanged.

### Data needs

- Load `composers.json` in `data_loaders.py` (currently loaded for chip rendering already, just needs to be exposed on `window.composers`).
- Build `compositionsByComposer` index in `data_transforms.py`.
- Build `recordingsByComposition` index (likely already exists; verify).
- Materialise both on `window` for JS lookup.

## Consequences

- The Trinity nodes become listenable centres — clicking Tyagaraja yields his ~700 compositions, each a path into recordings by every artist who has performed it.
- The "no dead ends" principle (ADR-055) extends to composers: a composer with at least one composition is `is_listenable: true` even if they have no recordings.
- The `composer-chip` adds a fourth chip class; the design tokens from ADR-054/056 make this trivial.
- The graph-builder must distinguish composer-only nodes from performer-only nodes; the data already supports this via the `composer` instrument-type/role marker — verify.

## Implementation

1. Confirm `composers.json` loads in `data_loaders.py`; expose on `window.composers` via `html_generator.py`.
2. Build `compositionsByComposer` and (if missing) `recordingsByComposition` indexes; expose both.
3. Update `musician_is_listenable` (ADR-055) to consult `composer_has_composition`.
4. Add `.composer-chip` class in `base.html` (mirrors `.musician-chip` from ADR-054, era-tinted).
5. Implement `openComposerPanel(composerId)` in `media_player.js`. Render composition rows; wire expand-to-recordings.
6. Add composer chips in panel rows wherever a composition appears (`bani_flow.js`, `media_player.js`).
7. Update `graph_view.js` composer-node click handler: route to `openComposerPanel` per the rules above.
8. Render and verify: clicking Tyagaraja's node opens his compositions list; clicking a composition row expands recordings.
