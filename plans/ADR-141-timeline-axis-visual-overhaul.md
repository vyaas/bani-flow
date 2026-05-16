# ADR-141: Timeline View — Axis Visual Overhaul and Era-Lane Aspect Ratio

**Status**: Proposed  
**Date**: 2026-05-16  
**Agents**: graph-architect

---

## Context

The timeline view (ADR-136) maps the Guru-Shishya graph onto a hybrid log/linear
x-axis (birth year) with each era occupying a horizontal lane on the y-axis. The
layout is functional but presents three categories of visual problem that together
diminish the timeline's usefulness as an orientation surface.

### Problem 1: X-axis tick labels occluded by the toolbar

The ruler SVG (`#timeline-ruler`) occupies `position: absolute; top: 0; left: 0;
width: 100%; height: 100%` over the canvas. Year tick labels are placed at `y: 4`
with `dominant-baseline: hanging` — they hang from the very top edge of the SVG.

On mobile, `#layout-controls-float` (Timeline / Re-layout / Era / Instrument
buttons) is positioned at the top of the canvas with `top: 4px`. It directly
covers the tick labels. On desktop, the toolbar is now being moved to a fixed
centered position at `top: 10px` (Issue 1 of this session), which partially
alleviates the desktop occlusion but does not fix mobile.

Result: in both contexts the year scale — the primary navigation affordance of
the timeline — is partially or fully hidden by the toolbar.

### Problem 2: Axis labels are visually thin and low-contrast

Current CSS:

```css
#timeline-ruler .tick-label {
  font-size: 11px;           /* very small on desktop */
  fill: var(--fg-muted);
  font-family: monospace;
}
#timeline-ruler .tick-label.century {
  font-size: 14px;
  fill: var(--fg-sub);       /* slightly brighter but still muted */
}
```

Era lane labels (`— Trinity`, `— Bridge`, etc.) are plain SVG text with no
colour, shape, or symbolic correspondence to the era chip colours used everywhere
else in the UI. A new user cannot connect "— Golden Age" with the orange nodes
they see clustered in that lane.

### Problem 3: Contemporary era crowding — poor aspect ratio

`ERA_LANE_CENTRE` uses a uniform 220 px step:

```js
const ERA_LANE_CENTRE = {
  trinity:        0,
  bridge:         220,
  golden_age:     440,
  disseminator:   660,
  living_pillars: 880,
  contemporary:   1100,
};
const LANE_STEP = 55;   // vertical spread within a lane
```

Trinity has 3 musicians; Contemporary has roughly 30+. With uniform lane spacing,
the contemporary lane is as tall as the Trinity lane, but must accommodate 10×
the nodes within the same ± `LANE_STEP` vertical envelope. Nodes with similar
birth years (e.g., many musicians born 1970–1985) cannot spread out on the
x-axis (identical birth decade → identical x-coordinate) and collide in a dense
vertical stack.

This creates the perceptual problem the user describes as a "bad aspect ratio":
the x-axis is long (spanning 1700–2030) but the y-axis is cramped for contemporary
eras. Panning reveals the extent of the timeline but nodes still overlap visually.

---

## Pattern

**Levels of Scale** (Alexander): an axis is a boundary. A boundary that cannot
be read destroys the scale relationship it is meant to convey. The year ticks
must be legible at all viewports; the era labels must carry the same colour
identity as the nodes they annotate.

**Strong Centres** (Alexander): the Trinity, as the root of the Guru-Shishya
tree, must be a visually distinct centre in the timeline. The era lane system
should reinforce this: the Trinity lane is the anchor; each subsequent era
fan-spreads further in both x and y from that root.

---

## Decision

### D1: Move tick labels to the bottom of the ruler

**Rationale**: Year labels at the bottom are unreachable by the floating toolbar
(which occupies the top). The SVG height is trimmed so it does not extend into
the bottom chrome, ensuring labels are always visible.

#### Before

```js
// In drawRuler():
label.setAttribute('y', 4);
label.setAttribute('dominant-baseline', 'hanging');
```

```css
/* #timeline-ruler occupies full canvas height */
#timeline-ruler {
  position: absolute; top: 0; left: 0;
  width: 100%; height: 100%;
}
```

#### After

```js
// In drawRuler():
const RULER_BOTTOM_RESERVE = 6;    // px above the SVG's bottom edge
label.setAttribute('y', H - RULER_BOTTOM_RESERVE);
label.setAttribute('dominant-baseline', 'auto');   // text sits above the y coord
```

```css
/* Trim SVG so it does not extend into the bottom chrome zone */
#timeline-ruler {
  position: absolute; top: 0; left: 0;
  width: 100%;
  height: calc(100% - var(--chrome-bottom, 64px));
}
```

The tick `<line>` spans `y1: 0` to `y2: H` (full trimmed height). Labels sit at
`y: H - 6`. Era lane labels (on the left y-axis) remain at their
`graphYtoPx(eraCoord)` positions — no change to that logic.

---

### D2: Era lane labels with era-chip colour identity

**Rationale**: The left-margin era labels should visually correspond to the era
chip colours (`ERA_COLOURS`) that the musician nodes carry. This closes the
perceptual gap between the coloured discs and the plain-text lane markers.

#### Before

```js
// In drawRuler():
text.setAttribute('class', 'era-label');
text.textContent = '— ' + (eraDisplayNames[era] || era);
```

```css
#timeline-ruler .era-label {
  font-size: 10px;
  fill: var(--fg-muted);
  /* no era colour */
}
```

#### After

```js
// In drawRuler(): pass era colour as an inline attribute
text.setAttribute('class', 'era-label');
text.setAttribute('fill', ERA_COLOURS[era] || 'var(--fg-muted)');
text.textContent = eraDisplayNames[era] || era;   // drop the '— ' prefix

// Add a faint horizontal lane band behind the era's nodes
const band = document.createElementNS(svgNS, 'rect');
band.setAttribute('x', 0);
band.setAttribute('y', ly - LANE_STEP);
band.setAttribute('width', W);
band.setAttribute('height', LANE_STEP * 2);
band.setAttribute('fill', ERA_COLOURS[era] || 'transparent');
band.setAttribute('opacity', '0.04');
band.setAttribute('class', 'era-band');
ruler.insertBefore(band, ruler.firstChild);   // behind all other elements
```

```css
#timeline-ruler .era-label {
  font-size: 11px;
  font-weight: 600;
  /* fill set inline per era — see JS above */
}
```

**Note**: `ERA_COLOURS` is defined in `graph_view.js`. The Coder must ensure
`ERA_COLOURS` is accessible in `timeline_view.js`'s scope (it already is, as
both scripts share the same `<script>` concatenation context in `graph.html`).

---

### D3: Year label visual prominence

**Rationale**: Century years (1800, 1900, 2000) are the primary temporal
landmarks in Carnatic music history. They deserve typographic emphasis and a
colour accent that distinguishes them from inter-century ticks.

#### Before

```css
#timeline-ruler .tick-label         { font-size: 11px; fill: var(--fg-muted); }
#timeline-ruler .tick-label.century { font-size: 14px; fill: var(--fg-sub);   }

/* Desktop breakpoint */
#timeline-ruler .tick-label         { font-size: 16px; }
#timeline-ruler .tick-label.century { font-size: 18px; }
```

#### After

```css
#timeline-ruler .tick-label {
  font-size: 13px;
  fill: var(--fg-sub);
}
#timeline-ruler .tick-label.century {
  font-size: 16px;
  fill: var(--accent, #d79921);   /* warm gold — the same accent used for chip borders */
  font-weight: 600;
}

/* Desktop breakpoint */
#timeline-ruler .tick-label         { font-size: 16px; }
#timeline-ruler .tick-label.century { font-size: 20px; }
```

The `.century` class applies to century years in the log (pre-pivot) region and
to any tick year divisible by 100 in the linear region. No change to the tick
classification logic.

---

### D4: Contemporary era — graduated lane spacing

**Rationale**: Dense eras need proportionally more vertical space. A uniform
220 px lane step allocates the same canvas height to the 3-musician Trinity lane
as to the 30+ musician Contemporary lane. The fix is to graduate the lane
centres so later eras receive more vertical space — without changing the x-axis
logic or `TIMELINE_VIRTUAL_SPAN`.

`LANE_STEP` is also increased from 55 px to 75 px so co-born musicians within
a lane have more vertical spread before their chips overlap.

#### Before

```js
const ERA_LANE_CENTRE = {
  trinity:        0,
  bridge:         220,
  golden_age:     440,
  disseminator:   660,
  living_pillars: 880,
  contemporary:   1100,
};
const LANE_STEP = 55;
```

#### After

```js
// Graduated spacing: denser eras receive more vertical room.
// Total span grows from 1100 to 1750 px (graph-space units), which
// affects cy.fit() zoom — the Coder should verify fit() pads appropriately.
const ERA_LANE_CENTRE = {
  trinity:        0,
  bridge:         280,
  golden_age:     600,
  disseminator:   950,
  living_pillars: 1300,
  contemporary:   1750,
};
const LANE_STEP = 75;
```

**Spacing rationale (approximate musician counts)**:
| Era | Approx. nodes | Gap from previous |
|---|---|---|
| Trinity | 3 | — (anchor at 0) |
| Bridge | ~6 | +280 |
| Golden Age | ~18 | +320 |
| Disseminator | ~22 | +350 |
| Living Pillars | ~22 | +350 |
| Contemporary | ~35 | +450 |

The gaps scale roughly with node count, giving each era proportional vertical
territory.

**Consequences on `ERA_BAND_MEDIAN`**: The median-year fallback (`D3` of ADR-136)
is independent of `ERA_LANE_CENTRE` — it governs x-position only. No change
needed to `ERA_BAND_MEDIAN`.

---

## Consequences

### Positive
- Tick labels always visible: toolbar occupies the top, labels occupy the
  bottom, chrome-bottom gap prevents bottom-chrome occlusion.
- Era lanes visually connected to the node colour system: a user can identify
  "this orange band is the Golden Age" without reading the label.
- Century years legible as temporal landmarks.
- Contemporary and Living Pillars eras have enough vertical room to spread
  co-born musicians without overlap.

### Risks / mitigations
- **`cy.fit()` viewport**: Increasing `ERA_LANE_CENTRE` contemporary from 1100
  to 1750 expands the total graph-space height. `cy.fit()` will zoom out further
  on initial render. The Coder must verify that `applyTimelineLayout()` passes
  a generous padding argument to `cy.fit()` (currently `cy.fit(nodes, 80)` in
  `_rulerFitEra` — the initial fit call should use `cy.fit(cy.nodes(), 50)`).
- **Era band `<rect>` z-order**: Bands must be inserted before all other SVG
  elements so they don't occlude tick lines or labels. `ruler.insertBefore(band,
  ruler.firstChild)` ensures this as long as `ruler.innerHTML = ''` is called at
  the start of `drawRuler()` (already done).
- **ERA_COLOURS scope**: `timeline_view.js` uses `ERA_COLOURS` from
  `graph_view.js`. In the current single-file concatenation (`bani-render` inlines
  all templates), this is safe. If templates are ever separated into independent
  modules, `ERA_COLOURS` must be exported.
- **Mobile ruler height**: `calc(100% - var(--chrome-bottom, 64px))` shrinks the
  ruler SVG by `--chrome-bottom` (64 px). Era lane labels at `graphYtoPx(...)` are
  derived from the cytoscape viewport, not the SVG bounds, so they may extend into
  the trimmed region for very dense layouts. The Coder should clip the SVG with
  `overflow: hidden` (already set: `overflow: visible` must be changed to
  `overflow: hidden` on the timeline ruler to respect the trim).

---

## Implementation

Owned by **Carnatic Coder** after this ADR reaches Accepted status.

Files to change:

| File | Change |
|---|---|
| `carnatic/render/templates/base.html` | D1 CSS: trim ruler height; D3 CSS: tick-label font sizes and accent colour |
| `carnatic/render/templates/timeline_view.js` | D1 JS: tick label `y` position; D2 JS: era band rects and coloured labels; D4 JS: `ERA_LANE_CENTRE` and `LANE_STEP` |

No changes to data files, `graph_builder.py`, or any render Python. No new schema
fields. `bani-render` must be run after the JS/CSS changes to regenerate
`graph.html`.

The Coder should implement D1 first (highest user impact), then D2, D3, D4 in
order. Each D can be committed independently.

---

## Learning log

- 2026-05-16: Graduated ERA_LANE_CENTRE spacing (proportional to node count per era) resolves contemporary crowding without touching the x-axis logic or TIMELINE_VIRTUAL_SPAN.
