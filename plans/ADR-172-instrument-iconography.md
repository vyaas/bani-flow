# ADR-172 — Instrument Iconography: Representative Glyphs Replace Geometric Shapes

**Status**: Accepted
**Date**: 2026-08-24
**Agents**: graph-architect (proposer) → carnatic-coder (implementer) → test-engineer (drift guard) → git-fiend
**Depends on**: ADR-028 (design-token single source of truth), ADR-069 (instrument badge in musician chips), ADR-074 (DOM label chips over canvas), ADR-079 (inline SVG sprite), ADR-114 (Hindustani instrument vocabulary), ADR-146 (add-musician form chips), ADR-169 (tanpura silhouette glyph)
**Supersedes**: the *shape vocabulary* named in ADR-069 §"circle = vocal, diamond = veena, square = violin, triangle = flute, barrel = mridangam". ADR-069's badge-in-chip placement decision is **retained**.

---

## Context

Instrument identity across Bani Flow is currently carried by **abstract geometry**.
A musician's canvas node is an ellipse, rectangle, diamond, triangle or hexagon;
their chip badge is an unfilled 1.5px outline of the same shape. The mapping was
declared in ADR-069 and has never been surfaced to the user — there is no legend,
no tooltip, no key. A diamond means veena only to someone who has read the ADR.

ADR-169 already demonstrated the better idiom inside this codebase: the sruti seed
button at the centre of the mela wheel is a **drawn tanpura silhouette**
(`base.html:5080`) — a pear-shaped gourd, tapered neck, four alternating tuning
pegs. No one needs a legend for it. The instrument vocabulary should work the same
way everywhere.

Exploration surfaced two structural problems that make the change larger than a
redraw, and which the change must fix if the result is to be maintainable.

### Problem 1 — There is no single source of truth, and the copies have drifted

The instrument→symbol table exists **twice**, with different contents:

| Site | Keys | Notes |
|---|---|---|
| `carnatic/render/theme.py:136` `INSTRUMENT_SHAPES` | 5 | `vocal, veena, violin, flute, mridangam` |
| `carnatic/render/templates/graph_view.js:328` `INSTRUMENT_SHAPES` | 13 | adds `bansuri, ghatam, khanjira, bharatanatyam, gottuvadyam, sitar, sarod, other` |

The consequence is a **live, visible inconsistency**. `graph_builder.py:30` resolves
a sitar player against the 5-key Python table, falls through to `"ellipse"`, and
bakes a circle into the node data. The same musician's chip badge resolves against
the 13-key JS table and renders a diamond. The canvas and the chip disagree about
the same musician, today, in production.

This is exactly the failure ADR-028 was written to prevent. Era colours were
consolidated into `THEME.era` under that ADR; `INSTRUMENT_SHAPES` was left behind
and the comment at `graph_view.js:325-327` records the omission without fixing it.

The instrument vocabulary is fragmented well beyond the shape table — **six
independent literals**, each maintained by hand:

| file:line | Length | Purpose |
|---|---|---|
| `carnatic/writer.py:75` `VALID_INSTRUMENTS` | 16 | validation authority (ADR-114) |
| `render/theme.py:136` | 5 | shape map (Python) |
| `templates/graph_view.js:328` | 13 | shape map (JS) |
| `templates/graph_view.js:468` | 5 | filter dropdown order + labels |
| `templates/entry_forms.js:1431` | 13 | add-musician chip selector + labels (ADR-146 D4) |
| `templates/entry_forms.js:6528` | 8 + 6 | add-musician-in-raga-form, grouped by tradition (ADR-115) |
| `templates/entry_forms.js:1133, 3088, 4303` | 8 each | assorted `<select>` option lists |

Adding one instrument today means touching up to eight files and hoping none was
missed. Nothing catches a miss.

### Problem 2 — Three coexisting icon idioms

| Idiom | Example | Colouring |
|---|---|---|
| Programmatic `createElementNS`, outline-only | `makeShapeSVG` (`graph_view.js:351-399`) | `stroke: var(--fg-muted)` hardcoded |
| Inline `<symbol>` + `<use href="#id">` | `icon-tanpura`, `icon-lecdem` (`base.html:5075-5100`) | `fill` set on the `<use>` |
| CSS `mask-image` with inline `data:` URI | lecdem / mic / disc / doc chips (`base.html:2268, 2290-2299`) | `background: currentColor` |

The third idiom exists because of a discovered constraint, recorded verbatim at
`base.html:2258-2261`: CSS `mask: url("#icon-lecdem")` **cannot resolve an SVG
`<symbol>`** — the icon rendered invisible. A `<use href="#id">` *inside* inline
SVG does resolve correctly, proven in production at `raga_wheel.js:1846`. Any new
icon plumbing must respect this: `<use>` for DOM/SVG contexts, data URI wherever
CSS or a canvas library consumes the image.

### Forces

| Force | Direction |
|---|---|
| A glyph must be recognisable at 11px (secondary chip) | toward bold single silhouettes, away from interior detail |
| The same glyph must also read at ~26–58px (canvas node) | toward one artwork per instrument, scaled — not two size variants |
| Cytoscape cannot consume `<use href="#id">` for `background-image` | toward a data URI for the canvas, `<use>` for the DOM |
| Path data duplicated per consumer will drift, as the shape table already did | toward exactly one copy of every path in the built artifact |
| The repo's existing convention is manual mirrors with `SYNC REQUIRED` comments (`theme.py`/`theme.js`, `roles.py`/`roles.js`) | *against* generation — but bulky SVG path data is the worst possible mirror candidate |
| The data layer (`writer.py`) must not depend on the render layer | against folding `VALID_INSTRUMENTS` into the icon registry |
| 15 `makeInstrBadge` call-sites exist across 5 template files | toward preserving that function's signature as the seam |
| 53 of 217 musicians have `instrument: null` | toward an explicit neutral fallback glyph, not a broken reference |

---

## Pattern

**Levels of Scale** (Alexander #129) — *"a balanced range of sizes, each level
related to the next by a roughly constant ratio."* The same instrument glyph must
hold its identity across three scales an order of magnitude apart: an 11px
co-performer chip badge, a 13px primary chip badge, and a 26–58px canvas node
overlay. A silhouette designed only for the largest scale becomes a smudge at the
smallest; one designed only for the smallest looks impoverished at the largest.
The resolution is a **single artwork per instrument, drawn for the hardest case
(11px) and permitted to scale up** — one level of scale governing all three,
rather than a family of size-specific variants that would need to agree.

**Strong Centre** (Alexander #98) supports the registry decision. Today the
instrument vocabulary has no centre: six literals of equal standing, none
authoritative, two already disagreeing. `instruments.py` becomes the centre that
every surface radiates from, and the drift guard is the boundary that holds it.

---

## Decision

### 1 — `carnatic/render/instruments.py` becomes the registry

A new render-layer module is the single source of truth for instrument
**presentation**: display label, sort order, tradition, filter eligibility, and
drawn glyph.

```python
INSTRUMENTS: dict[str, dict] = {
    "vocal": {
        "label":     "Vocal",
        "order":     10,
        "tradition": "carnatic",
        "filter":    True,
        "svg":       "<path d='...'/><circle .../>",   # inner markup only
    },
    ...
}
FALLBACK_KEY = "unknown"
```

`svg` holds **only the inner markup** of a `viewBox="0 0 24 24"` symbol, and its
shapes carry **no `fill` attribute** — the `icon-tanpura` convention verbatim
(`base.html:5083-5084`: *"Shapes carry no fill attribute so they inherit the fill
colour set on the referencing `<use>` element"*). Each entry is preceded by a short
prose comment describing the silhouette, matching the commenting density of
`base.html:5081-5099`.

`order` is explicit and sparse (10, 20, 30 …) so an instrument can be inserted
between two others without renumbering the file.

### 2 — Three emitters, so no path data is ever mirrored

| Function | Emits | Consumed by |
|---|---|---|
| `sprite_symbols()` | `<symbol id="icon-instr-<key>" viewBox="0 0 24 24">…</symbol>` per key | injected into base.html's existing ADR-079 sprite |
| `js_registry()` | `const INSTRUMENTS = {vocal:{label,order,tradition,filter}, …};` | every JS surface |
| `icon_data_uri(key, colour)` | `data:image/svg+xml;utf8,<svg …>…</svg>` | cytoscape `background-image` |

`js_registry()` **deliberately omits `svg`.** JS constructs icons as
`<svg viewBox="0 0 24 24"><use href="#icon-instr-<key>"/></svg>`, resolving against
the injected sprite. Path data therefore appears exactly **once** in the built
`graph.html` — in the sprite — plus once per node as a canvas data URI, which is
generated from the same source at build time. There is no hand-maintained copy
anywhere, which is the specific failure mode of `INSTRUMENT_SHAPES` this ADR exists
to close.

This is a deliberate departure from the `theme.py`/`theme.js` and
`roles.py`/`roles.js` `SYNC REQUIRED` convention. Those mirror short scalar lists
where a human can eyeball a diff. Bezier path data is the opposite: long, opaque,
and impossible to review by eye. Generation is warranted here and nowhere else in
the theme layer.

### 3 — Build wiring (`html_generator.py`, `base.html`)

- Delete `from .graph_builder import INSTRUMENT_SHAPES` (`html_generator.py:16`) —
  imported, never referenced. Dead since it was written.
- Add `<!-- INJECT_INSTRUMENT_SPRITE -->` **inside** the existing sprite `<svg>`
  in `base.html` — after the `icon-tanpura` symbol, before `</svg>` — and replace
  it with `sprite_symbols()` using the established `base.replace(...)` idiom
  (`html_generator.py:373-414`).
- Inject `js_registry()` as its own script fragment **immediately after
  `theme_js`** in the script block (`html_generator.py:425`). Ordering is
  load-bearing: `graph_view.js` consumes `INSTRUMENTS` at module scope, exactly as
  it already consumes `THEME.era` at line 327.

### 4 — Canvas nodes: uniform circles with a centred glyph overlay

Geometry stops encoding instrument. Every musician node becomes a circle filled
with its era colour, with the instrument glyph overlaid centred.

`graph_builder.py`:
- `shape = INSTRUMENT_SHAPES.get(instr, "ellipse")` (line 30) becomes
  `icon = icon_data_uri(instr, TOKENS["bgDeep"])`.
- In the node `data` dict (line 105), `"shape": shape` becomes `"icon": icon`.

Glyph colour is `TOKENS["bgDeep"]` (`#1d2021`, gruvbox hard dark). All six era
fills are mid-tone (yellow, orange, blue, aqua, purple, green), so a near-black
glyph holds contrast against every one of them without a per-era special case.

`graph_view.js` base `node` style (lines 170-186):

```js
'shape':                    'ellipse',
'background-color':         'data(color)',
'background-image':         'data(icon)',
'background-fit':           'none',
'background-width':         '58%',
'background-height':        '58%',
'background-image-opacity': 0.85,
'background-clip':          'none',
```

- **Delete lines 188-202.** The four `node[shape = "diamond"|"rectangle"|"triangle"|"hexagon"] { border-width: 3px }`
  rules exist solely to compensate for non-circular geometry (*"Non-ellipse shapes
  need a thicker border so their geometry reads clearly"*). With uniform circles
  they are dead. Border stays 2px everywhere.
- The border-**colour** state layers are untouched: `.has-tracks`, `.hovered`,
  `:selected`, `.bani-match`, `node[is_hindustani = 1]` (lines 203-229). Instrument
  and provenance were always orthogonal channels and remain so.

**This mechanism is proven before the glyphs are drawn.** `background-image` on
cytoscape nodes is a code path this project has not used, so the implementation
sequences it first: wire the registry with a *single* placeholder glyph, run
`bani-render`, and confirm on the live canvas that the image appears, centres,
scales with node size, survives zoom to `minZoom`, and does not fight the
`border-color` state layers. Only once that holds do the remaining thirteen glyphs
get drawn. If cytoscape will not cooperate, the fallback is §Alternatives' third
option — uniform circles with no overlay, leaning on the ADR-074 chip badge — and
that is a one-style-block retreat rather than fourteen wasted drawings.

Note that ADR-074 already suppresses the canvas label (`'label': ''`) in favour of
real `.musician-chip` DOM elements in `#cy-labels`. Those chips carry their own
badge via `makeInstrBadge`. After this ADR the node glyph and the chip badge are
generated from the same registry entry, so the sitar disagreement in Problem 1 is
structurally impossible rather than merely fixed.

### 5 — `makeShapeSVG` retires; `makeInstrBadge` is the preserved seam

`graph_view.js`:
- Delete the `INSTRUMENT_SHAPES` literal (328-342) and `makeShapeSVG` (344-399),
  including the now-unused `SHAPE_STROKE` and `SHAPE_STROKE_W`.
- Add `makeInstrIconSVG(instrKey, size)` returning
  `<svg viewBox="0 0 24 24"><use href="#icon-instr-<key>"/></svg>`, resolving to
  `#icon-instr-unknown` for a null, absent or unregistered key.
- **`makeInstrBadge(instrKey, size)` keeps its exact signature** (401-409). It is
  the seam. All 15 call-sites therefore need **zero changes**:
  `graph_view.js:694, 1005, 1163, 1264`; `bani_flow.js:1416`;
  `media_player.js:636, 2407`; `entry_forms.js:1456, 1709, 3924, 5556, 6948, 7148, 7405`.

CSS (`base.html`):
- Add `.chip-instr-icon svg use { fill: var(--fg-muted); }`. The existing
  `opacity: 0.75` and the 13px / 11px sizing (245-251) carry over unchanged.
- **Change line 3831** — `.ef-instr-chip--active .chip-instr-icon svg *` must go
  from `stroke: currentColor` to `fill: currentColor`. The glyphs are filled now,
  not stroked; without this the active add-musician chip stops recolouring its icon.
- Delete `.trail-shape-icon` (1675-1681) — already dead, zero JS references.
- `#node-shape-icon` (`base.html:5283`, CSS 516-521) is already permanently hidden
  by `graph_view.js:1171-1173` under ADR-069. Left as-is; removing it is a separate
  cleanup.

### 6 — The remaining five literals derive from the registry

| Site | After |
|---|---|
| `theme.py:136` | deleted; the re-export drops out of `graph_builder.py:10` |
| `graph_view.js:468-475` | derived from `INSTRUMENTS`, filtered on `filter === true`, sorted by `order` |
| `entry_forms.js:1431-1446` | derived, sorted by `order` |
| `entry_forms.js:6528-6530` | derived, grouped by `tradition` |
| `entry_forms.js:1133, 3088, 4303` | derived |

`writer.py:75 VALID_INSTRUMENTS` is **deliberately left alone.** It is the
data-layer vocabulary authority; importing `carnatic.render.instruments` into
`carnatic/writer.py` would invert the dependency and make the writer unusable
without the render layer. The relationship is enforced by test instead (§Verification).

**Behaviour change, called out for approval:** setting `filter: True` on all 13
instruments present in the data expands the artist filter dropdown from 5 entries
to 13. The 13 musicians playing bharatanatyam (3), sitar (2), khanjira (2),
gottuvadyam (2), sarod (1), ghatam (1), bansuri (1) and `other` (1) become
reachable by filter for the first time. If the dropdown should stay at 5, flip
`filter` to `False` on the eight additions — one line each.

### 7 — Glyph inventory

Fourteen glyphs: the 13 instrument values present in the data, plus a neutral
fallback for the 53 musicians with `instrument: null`.

| Key | Count in data | Silhouette |
|---|---|---|
| `vocal` | 141 | head in profile with radiating sound arcs |
| `violin` | 28 | body with waist, f-hole, neck, scroll |
| `mridangam` | 22 | horizontal barrel, two heads, lacing |
| `veena` | 9 | long fretted neck, resonator gourd, yali head |
| `flute` | 4 | horizontal tube, finger holes |
| `bharatanatyam` | 3 | dancer in araimandi |
| `sitar` | 2 | long neck, gourd body, upper tumba |
| `khanjira` | 2 | frame drum, jingle slot |
| `gottuvadyam` | 2 | veena silhouette — *distinct glyph deferred, Open Q1* |
| `sarod` | 1 | fretless fish-shaped body, metal fingerboard plate |
| `ghatam` | 1 | wide-bellied clay pot, narrow mouth |
| `bansuri` | 1 | flute silhouette — *distinct glyph deferred, Open Q1* |
| `other` | 1 | generic round-bodied plucked lute |
| `tabla` | 0 | squat bayan + narrow dayan, syahi punched |
| `sarangi` | 0 | boxy waisted body, stubby neck, bow across |
| `surbahar` | 0 | broad gourd, long fretted neck, no tumba |
| `unknown` | 53 (null) | hollow neutral ring |

`tabla`, `sarangi` and `surbahar` have no musicians and were originally scoped
out (§8). They were pulled in during implementation — see *Implementation notes*.

`vocal` must **not** be a microphone — the mic glyph is already assigned to the
"Concerts" neutral chip (`base.html:2290`). Reusing it would collide.

**Two pairs are deliberately left visually identical for now.** `bansuri` reuses
the `flute` silhouette and `gottuvadyam` reuses the `veena` silhouette. Drawing a
differentiator that actually survives 11px is real design work for two instruments
with one and two musicians respectively, and it is not worth blocking the other
twelve glyphs on. They keep **separate registry keys** — so the data model, the
filter and the labels already distinguish them, and closing the gap later is an
edit to two `svg` values in one file with no call-site churn. Tracked as Open Q1.

### 8 — Out of scope

- ~~**`writer.py` vocabulary.** `tabla`, `sarangi`, `surbahar` have zero musicians,
  so no glyphs.~~ **Reversed during implementation** — see *Implementation notes* 1.
  `viola` remains out: it is a *performer role*, not a musician instrument.
- **Badge-less chip surfaces.** Twelve-plus sites render `.musician-chip` with era
  tint and no badge. Four user-facing ones are in scope —
  `panel_components.js:340` (co-performer / related musician),
  `media_player.js:2275` (lecdem subject), `media_player.js:3892`
  (`_buildLecturerChip`), `graph_view.js:1833` ("Transmitted via" transit popover).
  The `empty_tutorials.js` demo chips (7 sites) and the `entry_forms.js:5436-5480,
  5586, 7181` bundle-staging chip maps are synthetic or transient and stay as they are.
- **Distinct `bansuri` and `gottuvadyam` silhouettes.** Deferred; they alias
  `flute` and `veena` respectively. See §7 and Open Q1.
- **`roles.py` vocabulary hygiene.** See Open questions.
- **A user-facing legend.** Representative glyphs are meant to remove the need for
  one. If usage shows otherwise, that is a separate ADR.
- **Light theme / era-fill contrast beyond gruvbox hard dark.** Single theme today.

---

## Consequences

**Gained**

- Instrument is *readable* rather than *decoded*. No legend, no ADR lookup.
- One file to add or redraw an instrument: `instruments.py`. Down from up to eight.
- The canvas-vs-chip disagreement for sitar/sarod/ghatam/khanjira/bharatanatyam/
  gottuvadyam/bansuri/other is structurally eliminated, not patched — both consumers
  read the same registry entry.
- Path data exists once in the built artifact. Drift is not merely discouraged, it
  is unrepresentable.
- Three icon idioms reduce to two with a documented rule for choosing between them.
- Eight instruments become filterable for the first time (13 musicians).
- `graph_view.js` loses ~60 lines (`makeShapeSVG` + the table + four border rules).
- The 53 null-instrument musicians get an intentional glyph instead of a silent
  fallback to "circle = vocal", which was actively misleading.

**Costs**

- **Fourteen hand-drawn SVG silhouettes.** This is the bulk of the work and the
  main risk. Legibility at 11px is not guaranteed by construction and must be
  verified by eye at all three scales.
- Departs from the repo's `SYNC REQUIRED` manual-mirror convention. Justified in
  §2, but it is now the only generated cross-language constant and someone will
  eventually wonder why `theme.py` is not generated too.
- A build-time coupling: `graph_builder` now embeds one data URI per musician node
  (217 nodes). Payload cost is a few KB after the glyphs repeat — acceptable
  against a ~950KB `graph.json`, but it is not zero.
- Node geometry is freed up as a visual channel and immediately unused. A future
  ADR wanting to encode something else in node shape gains an opportunity; a user
  who had learned the shapes loses their mental model.
- `background-image` on cytoscape nodes is a code path this project has not used
  before. Behaviour at extreme zoom-out is unverified until rendered.

**Reversibility**

High. The registry keeps `order`/`label`/`tradition`/`filter` regardless; reverting
the *visual* decision means restoring `makeShapeSVG` and the `shape` node field
while keeping the consolidation. The two halves of this ADR — consolidation and
redraw — are independently revertible, and consolidation is the durable half.

---

## Verification

**Drift guard** — `carnatic/tests/test_instrument_registry_drift.py`, modelled on
`test_edit_form_spec_drift.py` (ADR-143 §4): regex-scrape the JS templates, compare
against the Python constant.

1. Every `INSTRUMENTS` key is in `writer.VALID_INSTRUMENTS`, except the presentation-only
   `unknown`.
2. Every distinct `instrument` value present in `carnatic/data/musicians/*.json` has
   a registry entry. Catches a future `add-musician --instrument tabla` shipping
   without a glyph.
3. Every registry key emits exactly one `<symbol id="icon-instr-…">` from
   `sprite_symbols()`, and no `svg` body contains a `fill=` attribute (the
   inherit-colour invariant).
4. `entry_forms.js` and `graph_view.js` contain **no** hardcoded instrument-name
   array literal — proves the derivation in §6 actually happened rather than being
   added alongside the old list.
5. `graph_view.js` contains no `node[shape = ` selector and no `makeShapeSVG`
   identifier.
6. `icon_data_uri` output is URI-safe: no raw `#`, `<`, `>` or newline that would
   break the cytoscape `background-image` value.

**Build + render gate**

```bash
source .venv/bin/activate
python3 carnatic/cli.py validate
python3 -m pytest carnatic/tests/ -q
bani-render
grep -c 'icon-instr-' carnatic/graph.html
python3 carnatic/serve.py
```

**Manual gate (load-bearing — the glyphs are hand-drawn)**

1. Canvas: every node a circle in its era colour with a legible centred glyph.
   Zoom to `minZoom` — glyph still reads, not a smudge. A sitar player's node glyph
   now matches their chip badge (today it does not).
2. Filter dropdown: 13 entries with glyphs; selection filters; count badge updates.
3. Chips at both sizes — Bani Flow trail primary (13px) and co-performer (11px),
   player footer and co-performer, lineage guru/shishya, panel titles. Every glyph
   legible at 11px. `bansuri`/`flute` and `gottuvadyam`/`veena` are *expected* to
   look identical (§7) — that is the deferral, not a bug.
4. Add-Musician form: all 13 glyphs; clicking a chip recolours its glyph — this is
   the `stroke:` → `fill:` fix at `base.html:3831`.
5. A musician with `instrument: null` shows the neutral ring, not a broken `<use>`.
6. Mela-wheel centre tanpura unchanged.

---

## Alternatives considered

- **Keep node geometry, change only chips and dropdown.** Cheapest. *Rejected:* the
  canvas is the primary surface of the guru-shishya view and would keep exactly the
  confusing vocabulary this ADR exists to remove.
- **Uniform circles with no glyph overlay, relying on the ADR-074 DOM chip label.**
  Nearly free — the chips already carry badges. *Rejected:* chip labels hide below
  `min-zoomed-font-size`, so instrument would vanish at precisely the zoom level
  where the graph is read as a whole.
- **Keep outline/stroke rendering for the new glyphs.** Consistent with today's
  chips. *Rejected:* a 1.5px outline of a violin at 12px is noise. The `icon-tanpura`
  precedent is filled, and filled silhouettes are what survive §Pattern's smallest scale.
- **Fold `VALID_INSTRUMENTS` into `instruments.py` for one true list.** Tempting.
  *Rejected:* inverts the data→render dependency; `writer.py` must stay usable
  without the render layer. A test enforces the subset relation instead.
- **Manual `instruments.py` / `instruments.js` mirror, per house convention.**
  *Rejected:* bezier path data is unreviewable in a diff, and the very table this
  ADR is fixing is a manual mirror that drifted. Repeating the mechanism would
  repeat the bug.
- **External `.svg` asset files under `assets/`.** Conventional. *Rejected:* the
  render target is a **single self-contained `graph.html`**; external assets would
  need inlining at build time anyway, which is what the registry already does, minus
  a directory of files to keep in step with a Python table.
- **Icon font.** *Rejected:* a build dependency and a licence question for what is
  fourteen shapes.

---

## Implementation

### 🏛️ Graph Architect
| # | Task | File |
|---|---|---|
| 1 | This ADR | `plans/ADR-172-instrument-iconography.md` |

### 🎵 Carnatic Coder
| # | Task | File |
|---|---|---|
| 1 | Registry + 14 glyphs + three emitters | `carnatic/render/instruments.py` **(new)** |
| 2 | Delete `INSTRUMENT_SHAPES` | `carnatic/render/theme.py` |
| 3 | `icon` data URI replaces `shape` in node data | `carnatic/render/graph_builder.py` |
| 4 | Drop dead import; inject sprite + JS registry | `carnatic/render/html_generator.py` |
| 5 | Sprite marker; `.chip-instr-icon svg use` fill; 3831 `stroke`→`fill`; drop `.trail-shape-icon` | `carnatic/render/templates/base.html` |
| 6 | Cytoscape style; drop table + `makeShapeSVG`; add `makeInstrIconSVG`; dropdown from registry | `carnatic/render/templates/graph_view.js` |
| 7 | Four instrument lists → registry | `carnatic/render/templates/entry_forms.js` |
| 8 | Add missing badges (4 sites) | `panel_components.js`, `media_player.js`, `graph_view.js` |
| 9 | `bani-render` + manual gate | — |

### 🧪 Test Engineer
| # | Task | File |
|---|---|---|
| 1 | Six drift assertions | `carnatic/tests/test_instrument_registry_drift.py` **(new)** |

### 🔱 Git Fiend
| # | Task |
|---|---|
| 1 | Branch `adr/172-instrument-iconography`, one commit per agent boundary, open PR |

---

## Implementation notes (as landed)

Five things surfaced during implementation that the ADR above did not anticipate.
Recorded here rather than silently absorbed.

1. **`tabla`, `sarangi` and `surbahar` needed glyphs after all.** §8 scoped them
   out on the grounds that no musician plays them. But §6 derives the three
   add-musician `<select>` option lists from the registry, and
   `entry_forms.js:6528` offered exactly those three (ADR-115). Deriving from a
   registry that omitted them would have **silently removed them from the
   add-musician form** — a functional regression for a librarian adding the first
   tabla player. They were drawn. The registry now covers
   `writer.VALID_INSTRUMENTS` exactly (16 addable + the `unknown` fallback = 17),
   which also upgrades the drift guard from a subset check to a **bidirectional
   equality** — strictly stronger than what §Verification asked for.

2. **`editFormSpec.instrument.opts` had to become a thunk.** `editFormSpec` is an
   object literal evaluated at *module scope*, and `instrumentKeys()` lives in
   `graph_view.js`. The ADR-171 patch-cart test harness
   (`carnatic/tests/js/patch_cart_behaviour.js`) loads `entry_forms.js` and
   `patch_cart.js` into a Node VM **without** `graph_view.js`, so the direct call
   threw `ReferenceError: instrumentKeys is not defined` and took the whole suite
   down. Fixed by making `opts` accept a function, resolved at render time in the
   single consumer (`entry_forms.js`, the `fm.opts` map). Every *other*
   cross-file instrument call is inside a deferred function, which is why the
   existing `typeof makeInstrBadge === 'function'` guards were sufficient there.
   The lazy form is the better design regardless: it removes a load-order
   coupling rather than working around one.

3. **`carnatic/data/musicians/` is not homogeneous.** It holds `_edges.json` — a
   JSON *array* of lineage edges — beside the 271 per-musician objects. Any glob
   over that directory must skip `_`-prefixed files or `.get()` will raise.

4. **The drift guard cannot regex-distinguish instruments from performer roles.**
   `['vocal', 'violin', 'mridangam']` is a legitimate role list
   (`entry_forms.js:2201, 3605, 6090, 6380`), not a drifted instrument list — the
   two vocabularies overlap almost entirely. The test exempts lines matching
   `/role|performer/i` and documents why. This is the cost of leaving Open Q2
   open; unifying the vocabularies would let the guard tighten.

5. **The cytoscape values in §4 held.** `background-width/height: 58%`,
   `background-image-opacity: 0.85`, `background-fit: none`,
   `background-clip: none` were first guesses and were kept — glyphs read
   correctly against all six era fills and stay legible down to `minZoom`.
   Closes Open Q5. Separately, glyph ink-coverage was measured to catch optical
   imbalance: `flute`/`bansuri` were the outlier at 10.7% against `ghatam`'s
   42%, so the tube was thickened to 13.3%. A thin tube is honestly light; going
   heavier read as a plank.

---

## Open questions

1. **`bansuri` and `gottuvadyam` have no distinct silhouette.** They alias `flute`
   and `veena` (§7). Deliberate deferral, not an oversight — but until it is closed,
   the canvas and chips cannot distinguish a bansuri player from a flautist, which
   is a small violation of this ADR's own premise that a glyph should be readable
   rather than decoded. Three musicians affected. Closing it is an edit to two `svg`
   values in `instruments.py`.
2. **`roles.py` vocabulary hygiene.** `carnatic/render/roles.py:19` spells it
   `kanjira` while musician data uses `khanjira`, and the module carries both
   `tanpura` and `tampura`. Performer roles and musician instruments are near-identical
   vocabularies maintained separately, bridged ad hoc by `_inferPerformerRole`
   (`entry_forms.js:6102-6110`). Should roles derive from the instrument registry?
   Separate ADR; record the finding in `carnatic/LEARNINGS.md` meanwhile.
3. **Resolved — the filter dropdown grows from 5 to 13 entries.** Approved
   2026-08-24. Eight instruments and 13 musicians become filterable for the first
   time. Reversible per-entry via the `filter` flag.
4. **Does the `icon-tanpura` glyph belong in the registry?** Tanpura is a performer
   role, not a musician `instrument` value, so no musician would use it — but the
   artwork is already drawn in the house style and would be the fifteenth symbol in
   the same sprite. Leaving it in `base.html` keeps ADR-169 self-contained; moving
   it centralises the glyph vocabulary. Proposed: leave it, revisit under Q2.
5. **Resolved — the cytoscape overlay values held as first guessed.** See
   *Implementation notes* 5. `58%` / `0.85` / `fit:none` / `clip:none` landed
   unchanged.

[ADR: ADR-172, ADR-169, ADR-146, ADR-143, ADR-114, ADR-115, ADR-079, ADR-074, ADR-069, ADR-028]
[AGENTS: graph-architect]
