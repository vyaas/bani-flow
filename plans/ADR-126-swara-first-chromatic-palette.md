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

**Composition is performed by the eye, not by the renderer**: a mela is a chord of five swaras. We refuse to pre-blend that chord into a single muddy fill. Instead, the five contributing swara cells are shown at full saturation along a radial spine; the user's mind composes them into a perceived raga-colour. Pre-mixing in linear RGB destroys vibrancy and contrast — the very qualities that make a raga feel alive. The wheel paints the ingredients; the listener tastes the dish.

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

### B. Where colour lives, and where it deliberately does not

Colour lives **only on the swara cells** (R₃ ri-ga ring and R₄ da-ni ring) and on the centre disk halves. The cakra ring (R₂) and the mela ring (R₅) stay *chromatically neutral* by design — they hold the structural scaffold and the legible labels, while the swara cells carry the meaning.

**Rejected alternative**: a previous draft of this ADR proposed mixing swara hex codes (`mix(R, G)` for cakra wedges, `mix(R, G, M, D, N)` for mela slots). This is wrong. Linear-RGB mixing of saturated gruvbox primitives produces muddy mid-tones — olives, browns, ochres — which (a) destroy the vibrancy that makes ragas feel alive, (b) reduce contrast against the mela number and name text on the outer ring, and (c) collapse the perceptual distance between adjacent melas. The mind's eye does the blending far better than `(r₁+r₂)/2`. We give it the ingredients, separately, and let it compose.

| Ring                        | Treatment                                                                 |
|-----------------------------|---------------------------------------------------------------------------|
| Centre disk halves (R₁)     | `swara.M1` (right half), `swara.M2` (left half) — direct, full saturation |
| Cakra wedge (R₂)            | **Neutral**: `THEME.bgPanel` fill, `THEME.borderStrong` stroke; cakra name in `THEME.fg`. The 12 wedges are distinguished by **angular position + label**, not hue. |
| Ri-ga arc (R₃)              | **Vertical split**: inner half = `swara['R'+ri]`, outer half = `swara['G'+ga]` — the two ingredients shown side-by-side, full saturation |
| Da-ni cell (R₄)             | **Vertical split**: inner half = `swara['D'+da]`, outer half = `swara['N'+ni]` — same treatment |
| Mela slot (R₅) fill         | **Neutral**: `THEME.bgDeep` fill, hairline `THEME.borderStrong` stroke. Optional: a faint live/dim brightness modulation per ADR-123 (recordings present vs absent). |
| Mela number text            | `THEME.fg` (high-contrast warm-cream against neutral slot — maximum legibility) |
| Mela label text (R₆)        | `THEME.fg` (unchanged from current)                                       |

The *split* on R₃ and R₄ is the core didactic move: each cell **literally shows its two ingredients** as adjacent half-swatches. R₁G₂ is then visibly different from R₁G₃ (the inner half is identical red, the outer half changes from greenBright to yellowBright). The subscript text remains, now redundantly reinforced by colour. **All swara colour stays at full saturation** — no muting, no tinting. Vibrancy is preserved exactly where the user needs to read it.

### C. The cakra ring is retired as a colour surface

`THEME.cakra` (the 12-hue primitive block) is deleted from the token set. The cakra ring becomes a neutral structural band, distinguished by:

- **Angular position** (each wedge spans a fixed 30°)
- **Cakra name labels** (Indu, Netra, Agni, Veda, Bāṇa, Rutu, Ṛṣi, Vasu, Brahma, Disi, Rudra, Aditya — already rendered per ADR-123)
- **A subtle 1px hairline** between adjacent wedges (`THEME.border`)

This is the deliberate trade. We give up 12 arbitrary loud hues that meant nothing musically, and gain a clean canvas that lets the swara-cell rings *inside* read as the dominant chromatic surface. The mind's eye, looking at a cakra wedge, sees the swara cells nested inside it — that is where the cakra's identity actually lives.

A single shim `getCakraColor(n)` is retained for migration purposes but always returns `THEME.bgPanel`. Call sites in [raga_wheel.js](carnatic/render/templates/raga_wheel.js) (lines ~191, 1361, 1499) migrate to call this shim; they will not need to change again if a future ADR re-introduces cakra-level chromatic encoding.

### D. Light-up interaction (ADR-124) becomes the chromatic moment

This is where the design pays off. In overview state the wheel is restrained: vibrant swara cells nested inside neutral cakra wedges and a neutral outer mela ring. **The light-up gesture is what releases the colour**.

- Click a mela → its swara spine lights up. The five contributing swara cells (the matching M-half, the matching R-arc-half, G-arc-half, D-cell-half, N-cell-half) hold their colour at full opacity; everything else desaturates. The user sees a chromatic spine: red + greenBright + yellow + blue + purpleBright laid out radially. **The mind's eye blends them** into a single perceived colour for the mela — far richer than any RGB average.
- Click a swara cell → all melas containing that swara light up. The lit mela slots (currently neutral) gain a thin coloured stroke matching the clicked swara — a hint, not a fill. The cells themselves stay at full chroma.
- Hover (desktop) → preview-tint with the same logic at lower opacity.

Vibrancy and contrast are preserved on the outer ring at all times, including during light-up: the mela numbers and labels never sit on a muddy mixed fill, only on neutral or on a thin coloured stroke.

### E. Accessibility

- The hue/brightness axes are perceptually orthogonal — colour-blind users still get brightness as a discriminator within a family, and family-wedge angular position is unchanged.
- Subscript text on every cell is preserved (the current text labels remain — colour is *additive*, not *replacing*).
- `<title>` SVG elements (ADR-124 §G) gain the swara colour name in their text ("R₁ — śuddha rishabha — red") for screen readers.
- A monochrome theme override (`THEME.swaraMono`) is a future option, not in scope here.

### F. Backwards compatibility

- `THEME.cakra` (the 12-hue primitive block) is removed. The single shim `getCakraColor(n)` returns `THEME.bgPanel` for all `n`; the 3 call sites in [raga_wheel.js](carnatic/render/templates/raga_wheel.js) (lines ~191, 1361, 1499) migrate to call it.
- No data-file changes. No schema changes. The katapayadi tuple in `melakarta_new.json` (ADR-122) is the only input the renderer needs.
- The rest of the app (graph view, sidebars, era colours, node borders) is untouched. `THEME.era`, `THEME.accent*`, `THEME.node*` are unchanged.
- No `mix()` helper is introduced. There is no spectral-blending step anywhere in the render pipeline.

---

## Consequences

**Positive**

- The wheel teaches what a swara *is* through colour, not just position. The R/G/D/N families become chromatic neighbourhoods at a glance.
- R₁G₂ and R₁G₃ become visually distinct without the user reading the subscript — this was the user's stated requirement.
- Vibrancy is concentrated where it earns its keep — on the swara cells themselves — and is not diluted by mid-tone mixes that would drag every adjacent surface toward mud.
- The mela ring (numbers + names) sits on a neutral background at maximum legibility. No risk that the outer ring becomes hard to read because of an arbitrary cakra hue or a muddy 5-swara average.
- The light-up spine (ADR-124) becomes the chromatic event of the wheel: a quiet overview state explodes into a coloured radial trace on click. The mind's eye composes the chord; we do not pre-blend it for them.
- Etymology repaid: a wheel about *rañj* now actually colours its swaras at full saturation.
- Single source of truth: `THEME.swara` is 12 hex codes; nothing is derived, nothing is mixed.

**Negative**

- Existing screenshots, screencasts, and ADR-123 first-render visuals go stale. Re-record after implementation.
- The cakra ring loses its 12-hue identity. Anyone who had begun memorising the old palette (cakra 5 = greenBright, cakra 8 = blue, etc.) loses that mapping. Cakra wedges are now identified by name labels and angular position only. This is intended — the old hue mapping was musically meaningless — but it is a discoverable change.
- Overview state is visually quieter than before. First-render review must confirm the wheel still feels alive (the swara cells should carry that load) and not under-saturated. If the swara cells alone do not generate enough chromatic presence, brighten the centre disk halves (M₁/M₂) as a secondary chromatic anchor.
- One palette decision (the choice of N3 hex) is deferred to first-render review; document the choice in `.clinerules` once made.

**Neutral**

- Performance: no per-render colour computations beyond the existing palette lookup.
- Theming: a future light-mode or alternate palette can override `THEME.swara` directly; the cakra and mela rings need no theming work because they read existing semantic neutrals.

---

## Implementation (delegated; not done in this ADR)

Sequenced work after ADR-126 is **Accepted**:

1. **Coder** — add `THEME.swara` token block (12 hex codes) to [theme.js](carnatic/render/templates/theme.js); mirror in `theme.py`. **No `mix()` helper.**
2. **Coder** — remove `THEME.cakra` primitive; replace the three `CAKRA_COLORS[cakra]` call sites in [raga_wheel.js](carnatic/render/templates/raga_wheel.js) (~lines 191, 1361, 1499) with a single `getCakraColor(n)` shim that returns `THEME.bgPanel`.
3. **Coder** — repaint R₃ (ri-ga arcs) and R₄ (da-ni cells) using vertical-split rendering — each cell becomes two adjacent half-swatches at full saturation, inner = first ingredient (R or D), outer = second (G or N), with the existing subscript text rendered on top in `THEME.fg`.
4. **Coder** — repaint R₅ (mela slots) with `THEME.bgDeep` fill and a hairline `THEME.borderStrong` stroke; mela number in `THEME.fg`. Preserve any existing live-vs-dim brightness modulation on the slot only.
5. **Coder** — repaint R₂ (cakra wedges) with `THEME.bgPanel` fill and a 1px `THEME.border` hairline between adjacent wedges; cakra name labels stay in `THEME.fg`.
6. **Coder** — repaint R₁ (centre disk halves) with `THEME.swara.M1` (right) and `THEME.swara.M2` (left), full saturation.
7. **Coder** — extend the ADR-124 light-up handlers so that lit melas in reverse-direction selection (clicking a swara cell) gain a thin coloured stroke matching the clicked swara, while the slot fill itself stays neutral.
8. **Coder** — `bani-render`; visual-diff against the current wheel screenshot; verify (a) the swara cells read at full chroma, (b) R₁G₂ is visibly different from R₁G₃, (c) the mela number ring is highly legible against neutral, (d) the cakra wedges are still distinguishable by label and angular position alone, (e) ADR-124 light-up spine reads as five distinct coloured cells.
9. **Coder** — append a learning-log entry to `.clinerules` recording the final N3 hex choice and any perceptual surprises from first-render review.
10. **Git Fiend** — branch `feat/126-swara-chromatics`, commit, push, open PR (visual change + `theme.js` token surface change → branch warranted, not main).

---

## Open questions (logged for `.clinerules`)

- Final hex for `N3` (the top of the chromatic walk): `fg2 #bdae93` is a placeholder; alternatives are a desaturated pink or a pale gold. Resolve at first-render review against the gruvbox spectrum's perceptual evenness.
- Vertical split on R₃/R₄ cells: inner-vs-outer, or angularly-leading vs trailing? Inner-vs-outer reads as "first ingredient deeper in the swara hierarchy" which is the more teachable framing; confirm visually.
- Janya raga colouring: today, janya satellite chips inherit their parent mela's cakra colour. With the cakra ring now neutral, what colour should janya chips take? Options: (a) inherit `THEME.bgPanel` like the parent cakra (quietly neutral), (b) inherit the parent mela's M-half colour (warm or cool by hemisphere), (c) inherit a single representative swara of the parent mela. Resolve at first-render review.
- Does the overview-state wheel feel under-saturated once the loud cakra hues are gone? If so, consider brightening the M₁/M₂ centre disk or widening the swara cells radially as a compensating chromatic anchor. Decide at first-render review.
