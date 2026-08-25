# ADR-173 — The Scholar's Cap, and Normalised Glyph Geometry

**Status**: Accepted
**Date**: 2026-08-24
**Agents**: graph-architect (proposer) → carnatic-coder (implementer) → test-engineer (drift guard) → git-fiend
**Depends on**: ADR-110 (composer flag on musician nodes), ADR-128 D10 (mortarboard glyph on the lecdem chip), ADR-172 (instrument iconography registry)
**Amends**: ADR-172 §4 (cytoscape overlay geometry) — the decision stands, its implementation was defective

---

## Context

Two problems, one shared root.

### Problem 1 — Node glyphs were mis-framed, and it was not a zoom problem

ADR-172 shipped instrument glyphs onto canvas nodes as a cytoscape
`background-image`. In use they read as *"not centered, and all variably zoomed
in, some not fitting their node size and some barely visible."* The natural
reading is that scaling a raster-ish overlay across a live zoom range is simply
hard. It is not what happened. Two independent defects compounded:

**(a) The emitted SVG declared no intrinsic size.** `icon_data_uri()` produced
`<svg xmlns=… viewBox='0 0 24 24' fill='…'>`. An SVG carrying only a `viewBox`
has *no intrinsic dimensions*, so a browser substitutes the CSS default
replaced-element size — **300×150**, a 2:1 box. Cytoscape loads the data URI as
an `Image` and scales *that letterbox*, not the glyph. The glyph therefore sat
inside a wrongly-proportioned canvas, off-centre and smaller than intended, and
`background-fit: none` with independent `background-width`/`height` percentages
made the error inconsistent between glyphs.

**(b) Hand-drawn coordinates do not frame consistently.** Measured ink spans
across the 17 glyphs ran from **16.8 to 21.2** units of the 24-unit box, and the
*shape* of that ink varied far more — `violin` is 10.0 wide × 21.1 tall,
`ghatam` 17.8 × 19.3, `flute` 20.9 × 14.5. A fixed percentage box therefore
rendered a narrow violin as a sliver beside a full-width ghatam. This is the
"barely visible" complaint, and no amount of overlay tuning fixes it, because
the inconsistency is baked into the artwork's coordinates.

Defect (a) is a bug against ADR-172 §4 as written. Defect (b) is a gap: ADR-172
never said how glyphs should be *framed*, only how they should be *drawn*.

### Problem 2 — Composing is scholarly, and instrument does not capture it

The registry keys a musician's glyph off `instrument` alone. But in Carnatic
music **composing is a scholarly act that cuts across instrument**: all
vocalists compose, and so do violinists, veena players and flautists. Anyone
can be a composer. Nothing in the iconography conveyed that, so the single most
significant thing about a Tyagaraja or a Muthiah Bhagavathar — that they left a
body of work — was invisible next to a performer of the same instrument.

The data already exists: ADR-110 puts `is_composer` on every musician node,
defined as *their id appears as `composer_id` on ≥1 composition*. 95 of 270
nodes qualify. And the artwork already exists: ADR-128 D10 drew a **mortarboard**
for the lecdem chip, so "scholarly" already has a mark in this design system.

### Forces

| Force | Direction |
|---|---|
| One glyph must hold at 11px, 13px and 26–58px | toward a single artwork, normalised — not size variants |
| Framing consistency cannot depend on drawing discipline | toward computing the fit from measured ink at emit time |
| A composite instrument+cap glyph shrinks the instrument | toward a composite only where there is room for it |
| Composer is orthogonal to instrument (any instrument can compose) | against a per-instrument "composer" glyph; toward an additive mark |
| 15 `makeInstrBadge` call-sites exist across 5 template files | toward extending the seam, not changing its arity |
| The mortarboard already means "scholarly" here (lecdem chip) | toward reuse, against inventing a second scholarly mark |
| An instrument *picker* shows an instrument, not a person | against blanket application of the cap wherever a badge appears |

---

## Pattern

**Levels of Scale** (Alexander #129) again, but the lesson inverts ADR-172's.
ADR-172 assumed one artwork could serve every scale if drawn carefully. It can
serve every scale — but only if the *framing* is computed rather than drawn, and
only if **composition is scale-dependent**. The instrument+cap composite is
right at node scale and wrong at chip scale, where it starves the instrument of
pixels. So the same semantic ("this musician composes") takes two forms: a
composite glyph on the canvas, and two sibling marks in a chip. One meaning, two
renderings, chosen by available scale.

**Deep Interlock and Ambiguity** (Alexander #194) describes the cap itself. It
does not replace or partition the instrument vocabulary — it sits *above* it, so
`vocal` and `vocal+cap` remain visibly the same instrument while carrying an
extra claim. An orthogonal fact gets an orthogonal mark rather than a new key.

---

## Decision

### 1 — Every glyph carries its measured ink box

Each registry entry gains a `box` field: the glyph's ink bounding box as
`(x0, y0, x1, y1)` in the 24×24 canvas, measured by rasterisation.

```python
"violin": {
    "label": "Violin", "order": 20, ...,
    "box": (7.0, 1.5, 17.0, 22.6),
    "svg": "...",
},
```

Storing the box rather than computing it at render time keeps the runtime
dependency-free and the value reviewable. A glyph edit that forgets to update
its box is caught by test, not discovered visually (§Verification).

### 2 — Framing is computed, not drawn

`_fit(box, tx, ty, tw, th)` emits an SVG transform mapping an ink box into a
target rect, **scaled on its longest side** so aspect is preserved, and centred:

```python
scale = min(tw, th) / max(x1 - x0, y1 - y0)
```

`glyph_markup(key, composer=False)` wraps the artwork in that transform. Targets
in the 24×24 canvas:

| Target | Rect | Purpose |
|---|---|---|
| `_PLAIN_TARGET` | `(1.6, 1.6, 20.8, 20.8)` | 87% of the box, centred |
| `_COMPOSER_CAP` | `(7.2, 1.2, 9.6, 6.8)` | cap across the top |
| `_COMPOSER_INSTR` | `(2.2, 8.2, 19.6, 14.2)` | instrument below the cap |

Longest-side normalisation is the standard icon convention and the right one
here: normalising on ink *area* instead would inflate thin glyphs grotesquely
(`flute` would have to grow ~4× to match `ghatam`'s coverage).

The composer pair deliberately spans the **same vertical band as a plain glyph**
(1.2–22.4 against 1.6–22.4). An earlier edge-to-edge composite made composer
nodes read ~9% larger than their neighbours and crowded the node's border ring.

### 3 — `icon_data_uri` declares an intrinsic size

```python
"<svg xmlns='…' width='24' height='24' viewBox='0 0 24 24' fill='{colour}'>"
```

`width`/`height` are load-bearing, not decorative — see Problem 1(a). This is
the single-line root-cause fix for the off-centre, inconsistently-zoomed icons.

### 4 — Cytoscape switches to `contain`

Because the glyph now arrives as a correctly-sized, pre-normalised square,
fitting is deterministic and needs no per-glyph nudging:

```js
'background-fit':           'contain',
'background-width':         '66%',
'background-height':        '66%',
'background-position-x':    '50%',
'background-position-y':    '50%',
'background-image-opacity': 0.9,
'background-clip':          'none',
```

`contain` replaces `none` because it preserves aspect by contract rather than by
the two percentages happening to agree.

### 5 — The scholar's cap marks any musician with ≥1 composition

The mortarboard from ADR-128 D10 is lifted into `instruments.py` as
`MORTARBOARD_SVG`, so one copy serves the lecdem chip's meaning and this one.
It is worn by any musician whose node carries `is_composer` (ADR-110) —
**independent of instrument**, which is the whole point.

### 6 — Composite on canvas, sibling marks in chips

| Surface | Scale | Treatment |
|---|---|---|
| Canvas node | 26–58px | **Composite** — cap above a shrunk instrument, baked into the node's `icon` data URI |
| Chip badge | 11–13px | **Two siblings** — full-size instrument glyph + a separate `.chip-scholar-cap`, wrapped in `.chip-instr-group` |

The split is empirical, not aesthetic: rasterising the composite at 13px showed
the instrument shrink to ~68% of an already-marginal glyph while the cap became
a smudge. Chips keep the instrument at full size and pay a few pixels of width
instead. Consequently the sprite emits the 17 instruments plus **one standalone
cap** — composite composer symbols are never emitted, because no DOM consumer
wants them.

### 7 — The badge seam widens rather than changes

`makeInstrBadge(instrKey, size)` keeps its meaning; a third argument is added:

```js
makeInstrBadge(instr, 13, { composer: !!d.is_composer })   // caller has the flag
makeInstrBadge(instr, 13, { musicianId: 'tyagaraja' })     // look it up
```

`isComposerId(id)` resolves through the existing `resolveNode`/`cy` path. Every
existing two-argument call therefore still works, and the 13 musician-chip
call-sites were updated to pass the flag they already had in hand.

### 8 — Out of scope

- **The instrument picker stays capless.** `entry_forms.js`'s add-musician chip
  row depicts an instrument, not a person, so it remains a two-argument call.
  Asserted by test, because it is exactly the kind of thing a future sweep
  "helpfully" unifies.
- **Composition *count*.** The cap is binary: ≥1 composition. Grading it (a
  richer cap for 50+ compositions) would encode prolificacy, a different claim.
- **Lecdem/lecturer scholarliness.** The lecdem chip keeps its own mortarboard
  via CSS mask. Unifying the two mortarboard consumers onto the sprite is
  blocked by the ADR-128 D10 finding that CSS `mask` cannot resolve a `<symbol>`.
- **`bansuri`/`gottuvadyam` distinct silhouettes.** Still deferred (ADR-172 Q1).

---

## Consequences

**Gained**

- Node glyphs are centred and uniformly framed by construction. The narrow
  glyphs (`violin`, `sitar`, `sarod`, `other`, `surbahar`) are no longer slivers.
- The framing rule is a computation over measured data, so it cannot drift as
  glyphs are added or redrawn — and a stale `box` is a test failure.
- Composing is legible at a glance across 95 of 270 musicians, independent of
  instrument, which is the fact the domain actually cares about.
- The mortarboard has one definition serving two meanings that were always the
  same meaning.
- `makeInstrBadge`'s existing call contract is untouched.

**Costs**

- A second source of truth per glyph. `box` must agree with `svg`; they are kept
  honest by a rasterising test, which means that guard needs `cairosvg` +
  `Pillow` to run and **skips silently without them** (see Verification).
- Composer nodes render their instrument ~68% the size of a plain node's. The
  cap costs the instrument pixels; at node scale it is affordable, and that is
  precisely why chips do it differently.
- Two treatments for one semantic is a genuine inconsistency. Justified by
  scale, but someone will reasonably ask why.
- Chips carrying a cap are a few pixels wider, which tightens dense chip rows.
- `is_composer` is a *rendering* input now, so a curation change (adding a
  composition) silently changes a node's icon. Correct, but newly load-bearing.

**Reversibility**

High and separable. The geometry fix (§1–4) and the cap (§5–7) are independent:
reverting the cap leaves normalisation intact, and vice versa. The geometry fix
is the one worth keeping regardless — it is a bug fix.

---

## Verification

**Drift guard** — extends `carnatic/tests/test_instrument_registry_drift.py`:

1. `box` is present, well-formed, and inside the 24×24 canvas for every entry.
2. **`box` agrees with reality** — each glyph is rasterised and its alpha bbox
   compared against the stored value (0.5-unit tolerance). This is the guard that
   makes the stored box safe. It uses `pytest.importorskip`, so it **skips** when
   `cairosvg`/`Pillow` are missing — which is the case for the system `pytest`,
   since those live in the `.bani-flow` venv while `pytest` does not. Verified
   manually with the venv interpreter: 17/17 within tolerance. Installing
   `pytest` into `.bani-flow` would un-skip it.
3. Every `icon_data_uri` output declares `width='24' height='24'`, in both plain
   and composer form — the Problem 1(a) regression guard.
4. `glyph_markup` wraps plain glyphs in exactly one fitting transform, and
   composer glyphs in exactly two, and the two differ.
5. The mortarboard follows the no-`fill`/no-`stroke` glyph convention.
6. The sprite emits one symbol per instrument **plus** the cap, and **no**
   composite composer symbols.
7. `makeInstrBadge` still accepts `(instrKey, size, opts)` and honours both the
   explicit-flag and id-lookup forms; `makeScholarCap` and `isComposerId` exist.
8. The add-musician instrument picker remains a two-argument call.

**Manual gate (performed)**

- Rasterised all 17 glyphs at 11 / 13 / 26 / 44px; measured optical centring
  (all within 0.9/24 units) and ink coverage.
- Compared the two candidate cap layouts — cap-on-top against corner-badge — at
  13 / 30 / 52px. The corner badge collided with instrument necks and read as a
  blob; cap-on-top won on every glyph.
- Decoded node `icon` data URIs straight out of the built `graph.html` and
  rendered them on their real era-colour fills, composer against plain.
- Drove headless Chromium over the live guru-shishya canvas: composer nodes wear
  the cap, plain nodes do not, framing is uniform, and the panel chip for
  Harikesanallur Muthiah Bhagavathar shows instrument + cap.
- Confirmed chips at both badge sizes, and `isComposerId('tyagaraja') === true`.

---

## Alternatives considered

- **Tune the overlay percentages and move on.** The first instinct, and it would
  have failed: with a 300×150 intrinsic box no percentage is right, because the
  error differs per glyph. *Rejected* once the intrinsic-size cause was found.
- **Redraw all 17 glyphs to frame consistently by hand.** *Rejected* — it makes
  correctness depend on drawing discipline forever, and the next glyph breaks it.
- **Compute ink boxes at render time instead of storing them.** Cleaner in
  principle, no second source of truth. *Rejected*: it makes `cairosvg` and
  `Pillow` hard runtime dependencies of `bani-render` for a value that changes
  only when a glyph is edited. Stored value + rasterising test gets the safety
  without the dependency.
- **Normalise on ink area rather than longest side.** Would equalise perceived
  weight. *Rejected* — thin glyphs would have to grow absurdly (`flute` ~4×) and
  would overflow their nodes.
- **A separate "composer" instrument key.** *Rejected outright*: it would force a
  false choice between someone's instrument and their composing, when the domain
  fact is that these are orthogonal. This is the mistake the ADR exists to avoid.
- **Colour or border to mark composers.** *Rejected* — node fill already encodes
  era and border already encodes listenability/selection/tradition. Both channels
  are spoken for; iconography was the free one.
- **A composite glyph everywhere, including chips.** Consistent, one code path.
  *Rejected* on the rasterised evidence at 11–13px.
- **Cap as a corner badge instead of a hat.** *Rejected* on the same evidence —
  it overlapped necks and gourds and read as damage rather than an accolade.

---

## Implementation

### 🎵 Carnatic Coder
| # | Task | File |
|---|---|---|
| 1 | `box` per entry; `_fit`, `glyph_markup`, mortarboard; `width`/`height` on the data URI; cap symbol in the sprite | `carnatic/render/instruments.py` |
| 2 | Pass `composer=is_composer` into `icon_data_uri` | `carnatic/render/graph_builder.py` |
| 3 | `background-fit: contain` + explicit position; `makeScholarCap`, `isComposerId`, third badge argument | `carnatic/render/templates/graph_view.js` |
| 4 | `.chip-instr-group` / `.chip-scholar-cap` | `carnatic/render/templates/base.html` |
| 5 | Pass the composer flag at the 13 musician-chip call-sites; leave the picker alone | `graph_view.js`, `bani_flow.js`, `media_player.js`, `panel_components.js`, `entry_forms.js` |

### 🧪 Test Engineer
| # | Task | File |
|---|---|---|
| 1 | Eight new guard groups (§Verification) | `carnatic/tests/test_instrument_registry_drift.py` |

---

## Open questions

1. **The `box`-accuracy guard skips in the default environment.** `cairosvg` and
   `Pillow` are in `.bani-flow`; `pytest` is not. Until `pytest` is installed
   into the venv, the single guard protecting the stored boxes is inert on a
   normal `pytest carnatic/tests/` run. Worth fixing at the environment level
   rather than by weakening the test.
2. **Should the lecdem chip's mortarboard move onto the sprite?** There are now
   two copies of the same artwork with the same meaning — one CSS-mask data URI
   in `base.html`, one `<symbol>` from `instruments.py`. ADR-128 D10 blocks the
   obvious unification (CSS `mask` cannot resolve a `<symbol>`), but emitting the
   mask's data URI *from* `MORTARBOARD_SVG` would collapse them to one source.
3. **Does the cap belong in the artist filter dropdown as a facet?** "Show me
   only composers" is a plausible query and `is_composer` already exists. It is a
   different axis from instrument, so it would need its own control — deliberately
   not added here.
4. **`background-width: 66%` is now the only tuned constant left.** It looked
   right against all six era fills at every zoom, but it is a single number
   governing every glyph; a future glyph with unusual ink could want its own.

[ADR: ADR-173, ADR-172, ADR-169, ADR-128, ADR-110, ADR-079, ADR-069, ADR-028]
[AGENTS: graph-architect]
