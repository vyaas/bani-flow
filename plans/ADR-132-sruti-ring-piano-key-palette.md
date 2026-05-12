# ADR-132 — Sruti Ring: Piano-Key Colour Palette

**Status**: Accepted
**Date**: 2026-05-12
**Supersedes / refines**: ADR-131 (tanpura at wheel centre)

---

## Context

The sruti ring (innermost pie, 12 chromatic pitch sectors) was introduced in
ADR-131 using a full spectral HSL palette — each of the 12 pitches receives its
own hue derived from `(idx * 360) / 12`. This was a reasonable placeholder but
carries unintended meaning: the chromatic hues suggest equal musical distance
between all adjacent pitches and visually imply a "rainbow" encoding that has
no musical rationale in Carnatic practice. The ring should instead communicate
*which sectors are natural (shuddha) pitches and which are altered (vikrita)* —
a distinction already built into the piano-keyboard layout that users familiar
with any pitched instrument intuitively recognise.

---

## Pattern

**Levels of Scale** — the wheel's coloring scheme already uses a small
controlled palette. The sruti ring should not introduce its own visual language
(spectral hues) that competes with the outer rings. Piano-key black-and-white
is a shared music-theory convention that carries meaning without decoration.

**Strong Centres** — the tonic (Sa) is always a natural note (white key). The
piano-key palette ensures Sa reads as the brightest, most open sector at rest,
reinforcing its centrality.

---

## Decision

Replace the spectral HSL fills in `_srutiFill` with a two-class piano-key
palette. White-key sectors (natural notes) get a warm off-white fill with dark
text; black-key sectors (sharps) get a near-black fill with light text. The
active sector — regardless of key type — uses an amber-gold fill with dark text
as a clear "this is playing" signal, consistent with the warm Gruvbox accent
palette used elsewhere in the wheel.

### Natural / white-key indices (0-based)
`{0, 2, 4, 5, 7, 9, 11}` — C, D, E, F, G, A, B

### Altered / black-key indices (0-based)
`{1, 3, 6, 8, 10}` — C#, D#, F#, G#, A#

### Colour values

| State | Fill | Text |
|---|---|---|
| White key — inactive | `#eeebe0` (warm off-white) | `#1e1b14` (near-black) |
| Black key — inactive | `#1e1b14` (near-black) | `#c8c3b4` (warm light) |
| Any key — **active** | `#c89a18` (amber-gold) | `#1e1b14` (near-black) |

The active stroke (`THEME.fg`, `stroke-width: 1.5`) is retained unchanged.

### Before (current implementation)

```js
function _srutiFill(idx, active) {
  const hue = Math.round((idx * 360) / N_SRUTI);
  return active
    ? `hsl(${hue}, 82%, 58%)`
    : `hsl(${hue}, 42%, 32%)`;
}
```

Label fill (inactive): `THEME.fgDim || '#a89984'`  
Label fill (active): `THEME.bg`

### After

```js
const _SRUTI_WHITE_KEYS = new Set([0, 2, 4, 5, 7, 9, 11]);

function _srutiFill(idx, active) {
  if (active) return '#c89a18';                         // amber — "playing"
  return _SRUTI_WHITE_KEYS.has(idx) ? '#eeebe0' : '#1e1b14';
}

function _srutiTextFill(idx, active) {
  if (active) return '#1e1b14';                         // dark on amber
  return _SRUTI_WHITE_KEYS.has(idx) ? '#1e1b14' : '#c8c3b4';
}
```

All three call sites that set label `fill` (`_clearSrutiRing`, `_startSruti`
repaint loop, and the initial `tanpuraData.forEach`) must read from
`_srutiTextFill(i, false)` / `_srutiTextFill(idx, true)` instead of
`THEME.fgDim` / `THEME.bg`.

---

## Consequences

- The spectral rainbow is removed. The ring reads as a miniature piano
  keyboard arranged radially — a familiar encoding with zero learning cost.
- Sa (C, index 0) is always a white sector, the brightest at rest.
- The active amber glow is unambiguous against both white and black sectors.
- No data schema change. No new fields. Single-file code change in
  `carnatic/render/templates/raga_wheel.js`.
- `bani-render` must be run after the code change before testing in-browser.

---

## Implementation

| Task | Agent | File |
|---|---|---|
| Replace `_srutiFill`, add `_SRUTI_WHITE_KEYS` + `_srutiTextFill`, update all label-fill call sites | Carnatic Coder | `carnatic/render/templates/raga_wheel.js` |
| Run `bani-render` and verify visually | Carnatic Coder | — |
