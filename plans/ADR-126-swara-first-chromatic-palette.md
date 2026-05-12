# ADR-126: Swara-First Chromatic Palette for the Raga Wheel

**Status**: Proposed
**Date**: 2026-05-11
**Branch (proposed)**: `feat/126-swara-chromatics`
**Depends on**: ADR-122 (katapayadi swara→mela mapping), ADR-123 (katapayadi-structured raga wheel), ADR-028 (design-token single source of truth)
**Refines** (does not supersede): ADR-123 (visual encoding section only — angular geometry and click affordances are unchanged)
**Enables**: future ADRs on raga-family chord/mood colour, on hover-preview spectral hints, on user-selectable palettes

---

## Context

The current raga wheel paints colour at the *wrong levels*:

- The **cakra ring** (R₂) is painted with 12 unrelated bright gruvbox hues (`yellowBright, orangeBright, redBright, purpleBright, …`) drawn from `THEME.cakra` in [theme.js](carnatic/render/templates/theme.js#L138-L143). The mapping is decorative — adjacency in the palette has no relationship to adjacency in the underlying swara structure.
- The **ri-ga arcs** (R₃) and **da-ni cells** (R₄) are colour-flat (a muted green and a muted peach respectively, per [ADR-123](plans/ADR-123-katapayadi-structured-raga-wheel.md) §"Visual encoding"). They carry **only text** — `R₁G₁`, `R₁G₂`, `D₂N₃`, etc. The user must read the subscripts to distinguish a śuddha rishabha cell from a ṣaṭśruti rishabha cell.
- The **mela slot** (R₅) inherits the parent cakra's loud hue.

This is the inverse of what the wheel is *for*. Three forces collide:

1. **The swaras are the atoms of the system.** A mela is not its name, not its number, not its cakra — it is the tuple `(madhyama, ri, ga, da, ni)` (ADR-122). Everything outside this tuple is a label for the tuple. Yet the tuple cells are the only rings without colour.
2. **Adjacent variants are musically distinct, not gradient.** R₁G₂ (śuddha rishabha + sādhāraṇa gandhara) and R₁G₃ (śuddha rishabha + antara gandhara) are different ragas, with different affective weight. The current palette does not communicate this — both arcs are the same green.
3. **Etymology.** *Rāga* derives from *rañj*, "to colour, to dye." A wheel meant to teach rāga that gives no colour to its swaras misses the constitutive metaphor of the form. The accessibility win (colour as a redundant channel alongside the subscript text) is a side-effect of getting the etymology right.

The cakra palette was chosen before the decoding rings existed (the wheel was a single ring in [ADR-023](plans/ADR-023-raga-wheel-as-third-view.md)). It was never re-examined when the decoding rings were added in ADR-123. This ADR re-examines it.

---

## Pattern

**Strong Centres / Levels of Scale**: in ADR-123, the *geometric* centres of the wheel are the swara cells — cakra wedge, ri-ga arc, da-ni cell. Colour must reinforce that hierarchy, not contradict it. Whatever hue lives at the outer rings should be *derived from* the inner swara hues, not invented independently.

**Spectral mixing as visible composition**: a mela is a chord of five swaras. The cakra is a chord of two swaras (a `(ri, ga)` pair). If colour mixes the way swaras combine, the user *sees* the composition: a cakra wedge looks like the average of its R-arc and G-arc; a mela slot looks like the average of all five of its swara cells. The wheel becomes a chromatic spectrograph of the system.

**Boundaries**: hue carries the swara *family* (R, G, D, N — chromatic neighbourhood); brightness carries the *variant index* (1, 2, 3 — pitch within the family). These are orthogonal axes, both perceptible at a glance, both mappable to the existing gruvbox primitives without adding new colours.

---

## Decision

### A. Swara primitive palette (the source of all wheel colour)

Each of the 12 swara variants is assigned exactly one gruvbox primitive. The mapping is:

- **Hue axis**: family — R is red/orange (warm-grounding), G is yellow/green (mid-warm), D is aqua/blue (mid-cool), N is purple (high-cool). This walks the gruvbox spectrum once, in pitch order.
- **Brightness axis**: variant index — v1 (śuddha) is the dark gruvbox tone, v3 (highest) is the bright gruvbox tone. v2 sits between.

Add the following block to `THEME.swara` in [theme.js](carnatic/render/templates/theme.js#L138-L143) (and mirror in `theme.py` per ADR-028):

```js
// ── Level 2: Swara colours (raga wheel decoding rings) ───────────────────
// Hue = family (R/G/D/N walks gruvbox warm→cool); brightness = variant.
// All other wheel colours derive from these via spectral mixing.
S.swara = {
  // Rishabha (red/orange family)
  R1: P.red,            // #cc241d  śuddha
  R2: P.orange,         // #d65d0e  catuśruti
  R3: P.orangeBright,   // #fe8019  ṣaṭśruti

  // Gandhara (yellow/green family)
  G1: P.green,          // #98971a  śuddha
  G2: P.greenBright,    // #b8bb26  sādhāraṇa
  G3: P.yellowBright,   // #fabd2f  antara

  // Madhyama (the centre disk only — two values, not three)
  M1: P.yellow,         // #d79921  śuddha (warm)
  M2: P.aqua,           // #689d6a  prati  (cool)

  // Dhaivata (aqua/blue family)
  D1: P.aquaBright,     // #8ec07c  śuddha
  D2: P.blue,           // #458588  catuśruti
  D3: P.blueBright,     // #83a598  ṣaṭśruti

  // Nishada (purple family)
  N1: P.purple,         // #b16286  śuddha
  N2: P.purpleBright,   // #d3869b  kaiśika
  N3: P.fg2,            // #bdae93  kākalī (warm-pale, tops the spectrum)
};
```

(Exact gruvbox primitives are illustrative — final values picked at first-render review for perceptual evenness. `N3` uses a warm-pale to close the loop without re-using `R1`'s red, so the chromatic walk reads as a gradient and not a wraparound.)

### B. Derivation rules (where the rest of the wheel's colour comes from)

All other ring colours are computed at render time from `THEME.swara` via `mix(...)`. No further hand-tuning.

Define one helper in `theme.js`:

```js
// mix(['#aabbcc', '#ddeeff', ...], weights?) → '#rrggbb'
// Linear-RGB average of arbitrary hex colours; equal weights if omitted.
function mix(hexes, weights) { /* … */ }
```

Then every other wheel colour is derived:

| Ring                        | Derivation                                                            |
|-----------------------------|-----------------------------------------------------------------------|
| Centre disk halves (R₁)     | `swara.M1` (right half), `swara.M2` (left half) — direct, no mix      |
| Cakra wedge (R₂)            | `mix([swara['R'+ri], swara['G'+ga]])` for the wedge's `(ri, ga)`      |
| Ri-ga arc (R₃)              | Vertical split: inner half = `swara['R'+ri]`, outer half = `swara['G'+ga]` (the two ingredients shown side-by-side)                                  |
| Da-ni cell (R₄)             | Vertical split: inner half = `swara['D'+da]`, outer half = `swara['N'+ni]`                                                                            |
| Mela slot (R₅) fill         | `mix([R, G, M, D, N])` at low saturation (the slot is the chord)      |
| Mela number text colour     | High-contrast neutral (`THEME.fg`) on top of the mixed slot fill      |
| Mela label text colour      | `THEME.fg` (unchanged from current)                                   |

The *split* on R₃ and R₄ is the core didactic move: each cell **literally shows its two ingredients** as adjacent half-swatches. R₁G₂ is then visibly different from R₁G₃ (the inner half is identical red, the outer half changes from greenBright to yellowBright). The subscript text remains, now redundantly reinforced by colour.

### C. The cakra ring is now derivable

A consequence of (B): `THEME.cakra` becomes a *derived* token, not a primitive. The cakra ring is repainted from the (ri, ga) pair of each cakra:

```
Cakra 1, 7  : (R₁, G₁) → mix(red, green)         = warm olive
Cakra 2, 8  : (R₁, G₂) → mix(red, greenBright)   = lighter olive
Cakra 3, 9  : (R₁, G₃) → mix(red, yellowBright)  = warm amber
Cakra 4, 10 : (R₂, G₂) → mix(orange, greenBright)= lime-orange
Cakra 5, 11 : (R₂, G₃) → mix(orange, yellowBright)= honey
Cakra 6, 12 : (R₃, G₃) → mix(orangeBright, yellowBright) = bright honey-orange
```

Cakras 1 & 7 share a colour (both are `(R₁, G₁)`). Their position on the wheel — right hemisphere vs left hemisphere — encodes the madhyama, which is *also* shown by the centre disk and by the cakra-name label. This is correct, not redundant: the cakra is fundamentally a `(ri, ga)` bucket, and its colour says so. The hemisphere reveals itself by where the eye is looking.

`THEME.cakra` is removed from the primitive token block; any code that reads it migrates to read `THEME.swara` and call `mix(...)` (or read a derived `THEME.cakraDerived[1..12]` table that the theme module computes once at module load).

### D. Light-up interaction (ADR-124) inherits this for free

When a mela is clicked and its swara spine lights up (per ADR-124 §A), the lit cells are *already* coloured by their own swara. The "spine" effect becomes visibly chromatic: you see a coloured trail from the centre to the mela slot, and the trail's colours *are* the formula. The mela slot's mixed fill is the chord of those exact colours, made saturated/opaque on light-up; the rest of the wheel desaturates as today.

The reverse direction (clicking a swara cell to light up its melas, ADR-124 §B) also gains: the lit melas share a chromatic family, because they share a swara. A user who clicks the `R₁` portion of any ri-ga arc sees all 18 melas with śuddha rishabha glow in a red-tinged set.

### E. Accessibility

- The hue/brightness axes are perceptually orthogonal — colour-blind users still get brightness as a discriminator within a family, and family-wedge angular position is unchanged.
- Subscript text on every cell is preserved (the current text labels remain — colour is *additive*, not *replacing*).
- `<title>` SVG elements (ADR-124 §G) gain the swara colour name in their text ("R₁ — śuddha rishabha — red") for screen readers.
- A monochrome theme override (`THEME.swaraMono`) is a future option, not in scope here.

### F. Backwards compatibility

- `THEME.cakra` is removed; one shim function (`getCakraColor(n)`) reads `THEME.swara` + `melakarta_math` to return the derived colour. Call sites in [raga_wheel.js](carnatic/render/templates/raga_wheel.js) (lines ~191, 1361, 1499) migrate to call this shim.
- No data-file changes. No schema changes. The katapayadi tuple in `melakarta_new.json` (ADR-122) is the only input the renderer needs.
- The rest of the app (graph view, sidebars, era colours, node borders) is untouched. `THEME.era`, `THEME.accent*`, `THEME.node*` are unchanged.

---

## Consequences

**Positive**

- The wheel teaches what a swara *is* through colour, not just position. The R/G/D/N families become chromatic neighbourhoods at a glance.
- R₁G₂ and R₁G₃ become visually distinct without the user reading the subscript — this was the user's stated requirement.
- Cakra colour stops being arbitrary. A user who internalises the swara palette can name a cakra's `(ri, ga)` from its colour alone.
- Mela slots become visibly *composed* — the chord of five swaras is rendered as the mix of five colours, so similar melas (e.g. melas sharing four of five swaras) appear visibly close in the colour space.
- The light-up spine (ADR-124) becomes chromatic, not just bright/dim — strengthens the "swara formula made visible" effect.
- Etymology repaid: a wheel about *rañj* now actually colours its swaras.
- Single source of truth: `THEME.swara` is 12 hex codes; everything else is derivation. ADR-028 stays clean.

**Negative**

- Existing screenshots, screencasts, and ADR-123 first-render visuals go stale. Re-record after implementation.
- The cakra ring becomes lower-contrast (derived olives/honeys instead of full-saturation gruvbox brights). This is the cost of correctness — overall wheel saturation moves from "loud" to "structured." First-render review must check the cakra ring still reads as 6 distinguishable wedges per hemisphere.
- The mela slot's mixed fill at low saturation must remain distinguishable from neighbours; if two adjacent melas mix to nearly the same colour, brightness modulation (live vs dim from ADR-123) becomes the only discriminator at the slot level. Acceptable: the *label* and *number* still discriminate.
- One palette decision (the choice of N3 hex) is deferred to first-render review; document the choice in `.clinerules` once made.

**Neutral**

- Performance: `mix()` is called once per render for `12 cakras + 6 ri-ga arcs + 6 da-ni cells + 72 mela slots = 96 colour computations`. Negligible.
- Theming: a future light-mode or alternate palette can override `THEME.swara` and inherit the derivations for free. This ADR makes the palette *configurable* in a way the current loud-cakra design is not.

---

## Implementation (delegated; not done in this ADR)

Sequenced work after ADR-126 is **Accepted**:

1. **Coder** — add `THEME.swara` token block and `mix()` helper to [theme.js](carnatic/render/templates/theme.js); mirror in `theme.py`.
2. **Coder** — add `getCakraColor(n)`, `getRigaColor(ri, ga)`, `getDaniColor(da, ni)`, `getMelaColor(katapayadi)` shims that read `THEME.swara` and call `mix()`.
3. **Coder** — replace the three `CAKRA_COLORS[cakra]` call sites in [raga_wheel.js](carnatic/render/templates/raga_wheel.js) (~lines 191, 1361, 1499) with `getCakraColor(n)`.
4. **Coder** — repaint R₃ (ri-ga arcs) and R₄ (da-ni cells) using vertical-split rendering — each cell becomes two adjacent half-swatches, inner = first ingredient, outer = second, with the existing subscript text rendered on top.
5. **Coder** — repaint R₅ (mela slots) using `getMelaColor(...)` at the agreed low saturation; verify mela number text remains legible.
6. **Coder** — remove `THEME.cakra` primitive; grep the codebase for any remaining `THEME.cakra` references and migrate.
7. **Coder** — `bani-render`; visual-diff against the current wheel screenshot; verify (a) the 6 cakras per hemisphere are distinguishable, (b) R₁G₂ reads as visibly different from R₁G₃, (c) the centre disk M₁/M₂ split is still strong, (d) ADR-124 light-up spine reads chromatically.
8. **Coder** — append a learning-log entry to `.clinerules` recording the final N3 hex choice and any perceptual surprises from first-render review.
9. **Git Fiend** — branch `feat/126-swara-chromatics`, commit, push, open PR (visual change + `theme.js` token surface change → branch warranted, not main).

---

## Open questions (logged for `.clinerules`)

- Final hex for `N3` (the top of the chromatic walk): `fg2 #bdae93` is a placeholder; alternatives are a desaturated pink or a pale gold. Resolve at first-render review against the gruvbox spectrum's perceptual evenness.
- Should the *mela slot* fill be the 5-swara mix (as proposed), or should it use the (da, ni) blend only (since cakra+ri-ga already encodes (madhyama, ri, ga) by position)? The 5-swara mix is more honest but may produce muddy adjacents; pick at first-render review.
- Vertical split on R₃/R₄ cells: inner-vs-outer, or angularly-leading vs trailing? Inner-vs-outer reads as "first ingredient deeper in the swara hierarchy" which is the more teachable framing; confirm visually.
- Janya raga colouring: today, janya satellite chips inherit their parent mela's cakra colour. Should they instead inherit the parent mela's *mixed* slot colour (chord of the parent's 5 swaras)? Defer until janya-level swara overrides land (open question from ADR-122).
