# ADR-131 — Tanpura at the Centre of the Raga Wheel

**Status**: Accepted — *partially superseded by ADR-169*
**Date**: 2026-05-11
**Supersedes / refines**: ADR-130 (sruti widget), ADR-129 (chrome retirement)

> **Note (2026-06-13):** the "R3" refinement of this ADR turned the centre into a
> *permanent radial pie* of 12 pitch sectors. That permanent-pie / radial-wedge
> layout is **superseded by ADR-169**, which collapses the centre to a single
> tanpura *seed* button and shows the 12 pitches only as a modal overlay picker.
> The core thesis of this ADR — *the tanpura is the seed/centre of the wheel* —
> is retained and reinforced by ADR-169.

---

## Context

ADR-130 introduced a sruti widget that was first floated in the chrome region,
then re-anchored to the viewport centre. While the viewport-centre placement
was already a strong improvement — it sat where the raga wheel sits — it still
treated the tanpura as an *external* control overlaid on top of the wheel.

The user observed that this misses a deeper truth: **the tanpura is not a
control; it is the seed of the wheel**. The 72-mela wheel encodes every
permutation of swaras under a fixed Sa–Pa–Sa drone. The drone is what makes
those swaras *be* swaras. They emerge from it. To draw the wheel and place the
drone outside it is to invert the relationship the wheel exists to express.

The raga wheel's innermost ring (R\_MADHYAMA disk) is currently the
M₁/M₂ hemisphere split — already the symbolic root of the mela system. The
tanpura belongs *at the geometric centre of that disk*, where Sa actually
lives, becoming the **0th ring** from which every outer ring radiates.

The visual isomorphism this creates is the entire premise of the application:
**every swara on the wheel is a wave that emerges from the drone at the
centre.** Pan, zoom, and rotate the wheel — the tanpura moves with it,
because it *is* part of it.

---

## Pattern

- **Strong Centre** (Alexander #98): every coherent visual field has a centre
  to which all other forces refer. The raga wheel has had a structural centre
  (the M₁/M₂ disk) but no *acoustic* centre. The tanpura is the acoustic
  centre that gives the structural centre meaning.
- **The Void** (Alexander #106): the still point that the active field
  surrounds. The drone is literally the unchanging tone the swaras swirl
  around — the closed (off/playing) tanpura button is a small still point;
  the expanded picker is the moment the void speaks.
- **Levels of Scale** (Alexander #129): the wheel ring widths already step
  down toward the centre (M_MELA → R\_DANI → R\_RIGA → R\_CAKRA → R\_MADHYAMA).
  The tanpura is the next level of scale inward — a button about 0.55 ×
  R\_MADHYAMA so it nests cleanly inside the disk without overlapping the
  M₁/M₂ hemispheres' interior labels.

---

## Decision

Move the sruti widget DOM out of the page-level `<body>` and **mount it inside
`#wheel-viewport`** (the transformed SVG group inside `#raga-wheel`) as a
`<foreignObject>` element positioned at `(cx, cy)`.

### Behaviour

1. **Pan / zoom**: the widget co-transforms with the wheel automatically (it
   inherits the same SVG transform stack).
2. **Rotation**: the widget **counter-rotates** so the tanpura icon and
   pitch labels stay upright regardless of wheel rotation. The wheel rotates
   under it; the centre stays orientation-stable, like a compass needle.
3. **Sizing**: closed-state button diameter is `0.55 × R_MADHYAMA`; playing
   variant is `0.7 × R_MADHYAMA`. Expanded picker spans symmetrically out to
   roughly `R_DANI` (so it does not occlude the outermost mela labels).
4. **Layout (radial, not linear)** — Refinement 2026-05-11: the expanded
   picker is a **ring**, not a bar. The 12 pitch buttons sit on a perimeter
   around the centre tanpura icon. This preserves the circular symmetry of
   the wheel itself; the pitches become the wheel's *innermost named ring*,
   one step inside the M₁/M₂ disk. A linear pitch bar would have read as
   chrome overlaid on the wheel; a pitch ring reads as part of the wheel.
4. **Z-order**: the widget sits *above* every wheel ring (highest in the
   `vp` group's child order), so pitches and tanpura icon are never clipped
   by ring strokes.
5. **State machine**: unchanged from ADR-130 (off → expanded → playing).
   The standalone power button is **removed** in the radial layout: the
   centre tanpura icon serves as both the open trigger (when closed) and
   the close trigger (when expanded), and clicking the active pitch
   deactivates the drone. One element, three meanings, no redundancy.
6. **Visibility**: only in raga-wheel view. In Guru-Shishya graph view the
   tanpura widget is hidden (the wheel does not exist there). A future ADR
   can revisit Guru-Shishya placement if needed; for now the absence is
   meaningful — the drone is wheel-native.

### DOM (before)

```html
<body>
  <div id="sruti-widget" class="sruti-off">
    <button class="sruti-widget-offbtn">…</button>
    <div class="sruti-expanded-body">…</div>
  </div>
  <svg id="raga-wheel">
    <g id="wheel-viewport"> … rings … </g>
  </svg>
</body>
```

### DOM (after)

```html
<body>
  <svg id="raga-wheel">
    <g id="wheel-viewport">
      … rings (madhyama, cakra, ri-ga, da-ni, mela) …
      <foreignObject id="sruti-foreign" x="…" y="…" width="…" height="…">
        <div xmlns="http://www.w3.org/1999/xhtml"
             id="sruti-widget" class="sruti-off">
          <button class="sruti-widget-offbtn">…</button>
          <div class="sruti-expanded-body">…</div>
        </div>
      </foreignObject>
    </g>
  </svg>
</body>
```

The widget element keeps the same HTML class structure so the existing CSS
and `sruti_bar.js` state machine continue to function unchanged. Only its
*mounting point* changes.

### Geometry

In `raga_wheel.js`, after the M₁/M₂ disk is rendered:

```js
const R_TANPURA      = R_MADHYAMA * 0.55;   // closed-state button radius
const TANPURA_BOX    = R_MADHYAMA * 1.6;    // foreignObject side length
                                            //   when expanded picker spans
                                            //   to ~R_DANI it sets max-width
```

The `<foreignObject>` is placed at
`x = cx - TANPURA_BOX/2, y = cy - TANPURA_BOX/2`,
with `width = height = TANPURA_BOX`. It is the **last** child of `vp` so it
paints over the rings.

Counter-rotation is applied via an inline `transform: rotate(-Θ°)` on
`#sruti-widget` itself (where Θ is the current `RagaWheel._state.rotation`),
updated by the same `_applyTransform()` function that updates the `vp`
transform string.

---

## Consequences

### Gains

- **Symbolic correctness**: the drone *is* the wheel's centre, not a
  control overlaid on it. This is the strongest visual statement the app
  can make about Carnatic music's grounding in the tanpura.
- **Spatial coherence**: pinch-to-zoom magnifies the tanpura along with the
  wheel rings; pan moves them together; rotation keeps the tanpura upright
  while the modal hemisphere swings around it. Every interaction reinforces
  the relationship.
- **Chrome reduction**: removes the last viewport-fixed UI surface.
  Combined with ADR-129, the entire UI is now wheel-native.
- **Discoverability**: a user staring at the wheel cannot miss the centre.
  Previous designs hid the sruti behind a chrome ribbon or a corner button;
  this puts it on the path of every gaze.

### Costs

- **Browser quirks with `<foreignObject>`**: event bubbling, focus, and CSS
  inheritance are well-supported in modern Chromium/Firefox/Safari, but
  legacy mobile WebViews can be unreliable. We accept this — the project's
  baseline is current evergreen browsers.
- **Counter-rotation math**: must stay in sync with the wheel's own
  rotation each transform tick. Implementation must update both in a single
  `_applyTransform()` to avoid visual jitter.
- **Expanded picker may overflow the wheel** on tiny viewports if
  `R_MADHYAMA` becomes very small. Mitigation: clamp the expanded picker's
  internal `min-width` so pitch buttons never become unreadable; allow
  horizontal overflow into the cakra ring zone only when necessary
  (cosmetic, not functional).
- **Guru-Shishya view loses the widget**. We accept this as deliberate; the
  drone is meaningful only when the modal field (the wheel) is visible.

### Reversibility

The widget's HTML and CSS are unchanged. To revert, move `#sruti-widget`
back to its previous body-level position and remove the
`<foreignObject>` wrapper. State machine and event handlers are untouched.

---

## Implementation

1. **`raga_wheel.js`**:
   - In the wheel render function, after the madhyama disk, append a
     `<foreignObject id="sruti-foreign">` to `vp` containing the
     `#sruti-widget` HTML (moved here from `base.html`).
   - Compute and apply `R_TANPURA` and `TANPURA_BOX` based on `R_MADHYAMA`.
   - In `_applyTransform()`, in addition to setting the `vp` transform,
     set `#sruti-widget.style.transform = rotate(${-RagaWheel._state.rotation}deg)`.
2. **`base.html`**:
   - Remove the body-level `#sruti-widget` HTML (it is now constructed
     dynamically inside the wheel SVG).
   - Keep the `#sruti-widget` CSS (selectors continue to apply inside
     foreignObject).
   - Add CSS for `#sruti-foreign` and the counter-rotation hook.
3. **`sruti_bar.js`**:
   - Defer initialisation until `#sruti-widget` exists in the DOM (it is
     now created by the wheel render, not the page-load HTML). Use a
     `MutationObserver` on `#raga-wheel` *or* expose a hook
     `RagaWheel.onReady(cb)` that fires once the widget is mounted.
4. **View switching**:
   - When user switches to Guru-Shishya view, the wheel SVG is detached;
     the widget goes with it (no separate teardown needed).
   - When switching back, the widget is re-rendered with its last state
     restored from `localStorage`.

[ADR: ADR-131, ADR-130, ADR-129, ADR-123]
[AGENTS: graph-architect]
