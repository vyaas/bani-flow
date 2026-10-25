# ADR-201 — Unified panel history; one nav pair in the top-right chrome

**Status**: Accepted (user directive 2026-10-24)
**Date**: 2026-10-24
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-066 / ADR-088 / ADR-148
(per-panel history), ADR-129 (floating chrome), ADR-174 (UI surface map),
ADR-184 (grand track search), ADR-198 (panel searches retired), ADR-199
(panel category counts retired).
**Supersedes**: ADR-198 D2 ("nav rides the chip row" in both panels);
ADR-066's `panelHistory` and ADR-148's `baniHistory` as separate stacks.
**Scope**: `carnatic/render/templates/base.html`,
`carnatic/render/templates/graph_view.js`,
`carnatic/render/templates/bani_flow.js`, `carnatic/render/UIMAP.md`
§1 / §2 / §6, `test_grand_search_editor.py`.

---

## Context

Both sidebars carried their own back/forward pair, pinned to the right edge of
the subject chip row:

```
[icon] [chip ………………………] [popup] [↗]   [←] [→]
```

- Bani-flow panel: `#bani-back-btn` / `#bani-fwd-btn` (ADR-148) over
  `baniHistory`.
- Musician panel: `#panel-back-btn` / `#panel-fwd-btn` (ADR-066/067) over
  `panelHistory`.

Each stack recorded only its own panel's subjects, and the two panels are
populated one at a time. The end result was two nearly identical histories and
two chip-row clusters that ate the most constrained horizontal space in the
panel — the subject-name line — competing with the chip, popup and wiki
affordances for room.

The floating top-right chrome (`#app-title-float`, ADR-129) already hosts the
global help button and is otherwise an empty cluster that floats over the
canvas. It is a free, always-visible home for app-level navigation.

## Decision

### D1 — One chronological history across both panels

A single `window.PanelNav` (defined in `graph_view.js`, which loads before
`bani_flow.js`) owns `back` / `forward` stacks of tagged items:

```
{kind:'bani', type, id}   — a Bani-flow subject
{kind:'node', id}         — a musician-panel subject
```

The funnels record their completed navigation:

- `triggerBaniSearch(type, id)` → `PanelNav.record({kind:'bani', …})` unless
  replaying from history.
- `selectNode(node)` → `PanelNav.record({kind:'node', id})` unless replaying
  from history.

`record()` pushes the previously-current item onto `back`, clears `forward`,
and de-dupes re-selection of the same item — preserving the ADR-066/148
"re-clicking the current subject does not pollute history" behaviour. The
stack cap is 8 (was 5 per panel) since it now spans both panels. Dispatch on
back/forward routes a bani item to `triggerBaniSearch(…, fromHistory:true)` and
a node to `selectNode(n, {fromHistory:true})`, falling back to
`_openMusicianPanelForTransit` for culled nodes.

### D2 — The pair moves to the top-right chrome, left of help

`#app-title-float` becomes `[←] [→] [?]`:

```html
<div id="app-title-float">
  <span class="panel-nav-group" role="group" aria-label="Panel history">…</span>
  <button id="help-btn" …>?</button>
</div>
```

The bani-specific ids `#bani-back-btn` / `#bani-fwd-btn` are retired; the
shared pair reuses `#panel-back-btn` / `#panel-fwd-btn` so the existing
bindings and the UIMAP/drift guard keep working. `panelBack()` /
`panelForward()` remain as named wrappers over `PanelNav`.

Both panel chip rows lose their nav cluster (`.panel-chip-actions`
disappears), leaving the chip, popup and wiki affordances alone on the line.
The add buttons stay as the leftmost control of each content-filter row — the
ADR-198 add placement is unchanged.

### D3 — `getBaniTrail` projects the bani slice

Permalink serialization (`window.getBaniTrail`, ADR-151) filters the unified
`back` stack for `kind:'bani'` entries and returns them in chronological order,
so private links keep replaying the bani journey. `getCurrentPanelNode` is
unchanged. Clearing the bani filter no longer wipes the whole history — only
the bani subject is reset, and the viewed item remains a valid back target.

## Consequences

- **Chips breathe.** The subject-name line is free of the nav cluster in both
  panels; the name, popup and wiki controls no longer compete with two square
  buttons.
- **One control, one mental model.** Back walks the actual sequence of items
  the user viewed — musician, raga, composition, musician — instead of two
  independent panel-local sequences.
- The top-right chrome is now an app-level cluster: history + help. New
  app-level icon buttons belong here, not in a panel header.
- Player/queue, wheel and search are untouched; the nav pair is chrome only.
- `test_grand_search_editor.py` is rewritten to pin the new contract: one nav
  pair in `#app-title-float` before `#help-btn`, no nav in either chip row, add
  leading each filter row. The UIMAP drift guard still finds `panelBack` /
  `panelForward` / `getBaniTrail` / `getCurrentPanelNode`.

## Alternatives considered

- **Keep two pairs, one per panel** — rejected: duplicates controls that are
  never simultaneously useful.
- **One pair per panel bound to an "active" panel** — rejected: still two
  DOM clusters and a hidden modal state, and it cannot express a unified
  ordering across a musician→raga→composition walk.
- **Keep nav in the panel headers and add a third pair to chrome** —
  rejected: three clusters for one job.
- **Overlay nav on the canvas** — rejected: it is app chrome, and the top-right
  cluster already exists for exactly this.
