# ADR-169 — Tanpura Seed Button & Modal Pitch Picker

**Status**: Accepted
**Date**: 2026-06-13
**Supersedes / refines**: ADR-131 (tanpura at wheel centre — *the permanent-pie "R3" radial layout only*), ADR-130 (sruti widget state machine)
**Retains**: ADR-132 (piano-key colour palette — kept verbatim), ADR-129 (chrome retirement), ADR-124 (zoom/pan retirement)

---

## Context

Since ADR-131's "R3" refinement, the centre of the raga wheel is a **permanent
pie of 12 chromatic pitch sectors** (C … B), each a wedge running from radius 0
out to `R_SRUTI = 0.55 × R_MADHYAMA`, coloured by ADR-132's piano-key palette.
Clicking a sector starts that tonic's tanpura drone; clicking it again stops it.

Two problems have surfaced from real use.

### Problem 1 — the radial pie is read as a swara legend (the popular misunderstanding)

The wheel's entire structure is **radial**: 72 melas arranged outward through
the cakra / ri-ga / da-ni / mela rings. The sruti pie places **12 chromatic
sectors in that same radial field**, and 12 sectors visually rhyme with the 12
cakras of the ring just outside them. The near-inevitable misreading is that the
pitch wedge **"C"** names the swaras lying along that radial line — i.e. that the
chromatic centre is a *key/legend* for the melas radiating past it. It is not:
the tanpura tonic is the acoustic ground for the *entire* wheel simultaneously;
no pitch wedge "belongs to" the melas behind it. The radial embedding actively
teaches a falsehood, and many users adopt it.

The misunderstanding is a direct artefact of two design choices:

1. The pitches are **permanently embedded** in the wheel's radial field at rest.
2. They are drawn as **wedges** that share the wheel's sector geometry.

Remove the permanence and the wedge geometry, and the false correspondence has
nothing to attach to.

### Problem 2 — the centre keys are unpressable on mobile

ADR-124 retired pinch-zoom. The sruti pie therefore renders at a fixed small
radius (`0.55 × R_MADHYAMA`) with **no way to magnify it**. Each of the 12
sectors subtends a 30° slice of an already-small disk; on a phone the targets
fall well below a comfortable touch size, and users report repeated misfires
selecting the wrong tonic — or being unable to hit one at all.

### The shape of the fix the user has asked for

Replace the permanent pie with a **single central button** — a stylised SVG
*tanpura*, the "seed" of the wheel. Pressing it **explodes** the 12 pitch keys
outward as a **modal overlay that dims everything else**; pressing any key starts
that drone and the keys **swallow back** into the seed. Because a collapsed seed
would otherwise *hide* whether a drone is playing, the seed must **carry the
playing state** (which tonic, that it is live). A second press **re-explodes**
the keys with the live tonic marked; pressing **that** key again stops the drone.

This simultaneously fixes both problems: at rest there is no radial pitch field
to misread (Problem 1), and the exploded keys are full-size touch targets
floating over a dimmed wheel rather than 30° splinters of a tiny disk (Problem 2).

### Forces in tension

1. **Symbolic truth vs. hidden state.** Collapsing to a single seed is the
   strongest possible statement that *all* notes derive from one drone — but a
   bare icon hides whether sound is playing. The seed must therefore be a *state
   mirror*, not just a launcher.
2. **Immersion vs. modality.** The wheel is meant for exploration *while the
   drone plays*. Dimming the whole field is right **while choosing** a pitch, but
   wrong while merely *listening and exploring*. Dimming must bind to the
   **expanded (picker-open) state**, not to "drone playing".
3. **On-metaphor explosion vs. reintroducing the misreading.** Exploding the
   keys back into a *ring* honours "notes emanate from the seed", but a ring
   risks re-suggesting radial correspondence. The dimmed backdrop + discrete
   pill/disc buttons (not wedges) + the wheel structure fading away resolve this:
   when the keys are visible there is no visible wheel field for them to "key".
4. **Touch size vs. centre real estate.** Full-size touch targets cannot fit
   inside `R_SRUTI`. Because the picker is now an **overlay** (not embedded), the
   keys are freed from the centre disk and may occupy a generous ring out to
   ~`R_CAKRA` over the dimmed wheel.
5. **One control, several meanings vs. discoverability.** The seed is
   open-trigger, close-trigger, and now-playing indicator. Conflating *stop* into
   it too would overload it; stopping is therefore reserved for re-pressing the
   **live key**, keeping the seed a pure expand/collapse + status element.

---

## Pattern

- **Strong Centre** (Alexander #98) and **The Void** (#106): ADR-131 already
  argued the drone is the wheel's acoustic centre. This ADR makes the centre a
  *still point* literally — a single seed at rest — and lets "the void speak"
  only when touched (the keys bloom out, the field recedes). The resting wheel
  regains a quiet centre instead of a busy 12-wedge dial.
- **Levels of Scale** (#129): the seed is the innermost, smallest scale; the
  exploded ring is a transient larger-scale event that supersedes the wheel
  momentarily. The two never compete because they are never both fully present.
- **Light / Shadow as figure-ground** (the dimming scrim): backgrounding the
  wheel turns the 12 keys into unambiguous *figure*. Figure-ground separation —
  not a relabelled ring — is what dissolves the false radial correspondence.
- **Reversible Toggle as Instrument Affordance** (carried from ADR-076): you
  press a note to sound it and press the *same* note to silence it — the key, not
  a separate power button, is the stop control.

---

## Decision

Replace the permanent sruti pie with a two-layer design:

- a **seed button** rendered at the wheel centre (in-SVG, wheel-native), and
- a **modal pitch-picker overlay** (app-level, dims everything) that blooms the
  12 keys on demand.

ADR-132's piano-key palette is carried over **unchanged** for the key fills and
the active-amber state; only the *container* of the keys changes.

### 1. The seed button (resting + collapsed states)

A single circular button at `(cx, cy)`, rendered as the **last** child of the
wheel viewport group so it paints over the rings. It contains a stylised inline
SVG **tanpura** glyph (see §6). Diameter `≈ 0.55 × R_MADHYAMA`, with a hard
minimum so it is always a comfortable touch target (see §5).

The seed has exactly two visual variants:

| Variant | When | Appearance |
|---|---|---|
| **Idle** | no drone playing | tanpura glyph in `THEME.fg` on a calm panel fill; gentle resting ring |
| **Playing** | drone live, picker closed | tanpura glyph **amber** (ADR-132 `#c89a18`), a small **tonic badge** showing the live note (e.g. `G`), and a slow pulse / animated-string shimmer conveying "sounding" |

The **Playing** variant is the resolution of force #1: a collapsed seed never
hides that audio is live, and always shows *which* tonic.

### 2. The pitch-picker overlay (expanded state)

An **app-level overlay** (`#sruti-overlay`, sibling of the view containers, above
`#raga-wheel`'s `z-index:60`) holding:

- a **scrim** that dims the entire interface (wheel, chrome, panels) — this is
  the "dim everything else when active" behaviour, bound to *expanded* state;
- **12 key buttons** arranged on a **ring** centred on the seed's screen
  position, blooming outward to a radius of roughly `R_CAKRA` (well outside
  `R_SRUTI` — the keys are no longer confined to the centre disk);
- the seed glyph remaining visible at the ring's centre as the collapse trigger.

Each key is a **discrete disc/pill** (not a wedge) bearing its note label, filled
per ADR-132 (white-key cream / black-key dark; active = amber). Discs + scrim +
faded wheel = no radial field to misread (force #3).

**Bloom animation:** keys translate/scale outward from the seed centre on open
and back into it on close (the "explode" / "swallow back" the user described). A
`prefers-reduced-motion` fallback cross-fades without travel.

### 3. State machine (authoritative)

Four states. The seed is a pure **expand/collapse toggle + status mirror**;
**stop** lives only on the live key.

```
                 tap seed
   COLLAPSED_IDLE ─────────────▶ EXPANDED_IDLE
        ▲                              │
        │ tap seed / tap scrim         │ tap key K
        │ (cancel, nothing playing)    ▼
        └──────────────────────  (start drone K)
                                       │
                                       ▼
                              COLLAPSED_PLAYING ◀────────────────┐
                                  │     ▲                        │
                          tap seed│     │ tap seed / tap scrim   │
                           (re-   │     │ (collapse, keep        │
                            open) ▼     │  playing)              │
                              EXPANDED_PLAYING ───────────────────┘
                                  │            tap a *different* key K2
                                  │            (switch drone → K2, collapse)
                                  │
                                  │ tap the *live* key K
                                  ▼
                            COLLAPSED_IDLE   (drone stops)
```

| # | From | Action | To | Side effects |
|---|---|---|---|---|
| 1 | COLLAPSED_IDLE | tap seed | EXPANDED_IDLE | bloom keys; raise scrim (dim all); no key marked |
| 2 | EXPANDED_IDLE | tap key K | COLLAPSED_PLAYING | start drone K; swallow keys; drop scrim; seed → Playing(K) |
| 3 | EXPANDED_IDLE | tap seed **or** scrim | COLLAPSED_IDLE | swallow keys; drop scrim (cancel) |
| 4 | COLLAPSED_PLAYING | tap seed | EXPANDED_PLAYING | bloom keys; raise scrim; **live key K highlighted amber** |
| 5 | EXPANDED_PLAYING | tap live key K | COLLAPSED_IDLE | **stop drone**; swallow keys; drop scrim; seed → Idle |
| 6 | EXPANDED_PLAYING | tap other key K2 | COLLAPSED_PLAYING | switch drone K→K2; swallow keys; drop scrim; seed → Playing(K2) |
| 7 | EXPANDED_PLAYING | tap seed **or** scrim | COLLAPSED_PLAYING | swallow keys; drop scrim (keep playing) |

Invariants the Tester must assert:
- The scrim is raised **iff** state ∈ {EXPANDED_IDLE, EXPANDED_PLAYING}.
- A drone is sounding **iff** state ∈ {COLLAPSED_PLAYING, EXPANDED_PLAYING};
  in both, the seed/overlay shows the *same* live tonic.
- At most one key is amber at any time, and only in EXPANDED_PLAYING.
- `Escape` is equivalent to "tap scrim" (transitions 3 / 7).

### 4. Dimming semantics (force #2 resolved)

Dimming is bound to **expanded**, not to **playing**. While a drone plays and the
picker is closed (COLLAPSED_PLAYING) the wheel is at **full brightness and fully
interactive** — the user explores melas with the drone underneath. The scrim
appears only for the brief modal moment of choosing/closing. This is the literal
reading of "all tanpura *operations* should dim everything else when active":
*operating the picker* dims; *listening* does not.

### 5. Mobile / touch sizing (Problem 2 resolved)

- Seed diameter: `clamp(44px, 0.55 × R_MADHYAMA, …)` — never below a 44px touch
  target regardless of viewport.
- Key discs: minimum 40–44px diameter, laid on a ring whose radius is chosen so
  no two neighbours' hit-areas overlap; because the keys live on the **overlay**,
  the ring may extend over the (dimmed) cakra ring zone — it is not clipped to
  `R_SRUTI`.
- On very small viewports where a single 12-disc ring would crowd, the Coder may
  fan the keys onto **two concentric arcs** (naturals on the outer/brighter arc,
  accidentals inner) — still non-linear, still on-metaphor, never a wedge pie.

### 6. The tanpura glyph (new asset, not a data/schema change)

Add a stylised inline-SVG **tanpura** idealisation to the shared `<symbol>` defs
block (`base.html:4848`) as `<symbol id="icon-tanpura">`: a long-necked gourd
body with four strings — an unmistakable, minimal silhouette in the Gruvbox line
weight used by the other masked icons. The seed `<use>`s it. This is a static
presentation asset; **no `tanpura.json` change, no new field, no schema change.**

### DOM (after)

```html
<!-- wheel-native seed: last child of the viewport group, paints over rings -->
<g id="wheel-viewport">
  … rings …
  <g id="sruti-seed" data-ring="sruti-seed" tabindex="0" role="button"
     aria-label="Tanpura — open pitch picker">
    <circle …/><use href="#icon-tanpura"/>
    <text class="sruti-seed-badge">G</text>   <!-- shown only when playing -->
  </g>
</g>

<!-- app-level modal picker, hidden by default -->
<div id="sruti-overlay" class="sruti-collapsed" aria-hidden="true">
  <div class="sruti-scrim"></div>
  <div class="sruti-ring">
    <!-- 12 .sruti-key discs injected from tanpuraData; ADR-132 palette -->
  </div>
</div>
```

The 12 keys are still built from `tanpuraData` (unchanged). `RagaWheel._sruti`
state grows from `{ activeIdx }` to `{ activeIdx, expanded }`; the existing
`localStorage('sruti.tonic')` persistence and the `openPlayer(id, note+' tanpura',
'sruti')` / `closePlayer('sruti')` integration are **unchanged**.

---

## Consequences

### Gains

- **The misunderstanding is structurally impossible at rest.** There is no
  radial pitch field to misread — only a single seed. When the keys *are* shown,
  the wheel is dimmed away, so there is still nothing for them to falsely "key".
- **Mobile sruti becomes usable.** Full-size discs on a generous overlay ring
  replace 30° splinters of a tiny, un-zoomable disk.
- **State is never hidden.** The Playing seed carries the live tonic; collapsing
  the picker never loses track of what is sounding.
- **Listening stays immersive.** Dimming binds to *operating* the picker, not to
  *playing*, so exploration with a live drone is unobstructed.
- **The "seed" metaphor is strengthened, not weakened** — notes literally bloom
  from, and return to, the drone.

### Costs / accepted trade-offs

- **One more interaction step to start a drone** (tap seed → tap key) versus the
  old one-tap pie. Accepted: the pie's one-tap convenience was the very thing
  teaching the falsehood, and two large taps beat one missed small tap on mobile.
- **A modal moment** interrupts the wheel while choosing. Bounded to the picker;
  closes on key-pick, seed, scrim, or `Escape`.
- **New animation surface** (bloom/swallow) to maintain; mitigated by a
  `prefers-reduced-motion` cross-fade fallback.
- **`<foreignObject>` co-rotation concerns from ADR-131 are moot** — pan/zoom/
  rotate were retired by ADR-124, so the overlay can be plain app-level HTML.

### Reversibility

The keys still derive from `tanpuraData`; the player API is untouched. Reverting
means re-rendering the 12 sectors as the old pie and deleting `#sruti-overlay` +
`#sruti-seed`. No data migration either way.

---

## Alternatives considered

- **Exploded keys as a horizontal piano strip.** Maximally unambiguous (a piano
  is plainly a separate instrument, not a wheel radial) — but it abandons the
  "notes emanate from the seed" metaphor the wheel is built on and reads as
  re-introduced chrome. Rejected: the dimmed backdrop already breaks the radial
  misreading without sacrificing the metaphor.
- **Keep the pie, add pinch-zoom back for mobile.** Rejected: directly conflicts
  with ADR-124, and zoom does nothing for Problem 1 (the misreading).
- **Keep the pie, relabel/annotate it to explain it is not a legend.** Rejected:
  fighting a structural false-affordance with a caption never wins.
- **Fold "stop" into the seed (seed = stop when playing).** Rejected: overloads
  the seed to four meanings and removes the natural instrument affordance of
  pressing a note to silence it (ADR-076 lineage).

---

## Implementation

No schema change, no Librarian work, no `tanpura.json` change. UI/render only.
This spans `raga_wheel.js` + `base.html` (CSS + symbol defs) and touches the
sruti state object, so it leaves the surgical fast-path: the Coder should branch
`adr/169-tanpura-seed-button` and open a PR.

### 🎵 Carnatic Coder

| # | Task | File |
|---|---|---|
| 1 | Add `<symbol id="icon-tanpura">` (long-necked gourd + 4 strings) to the shared SVG defs | `base.html` (~`:4848`) |
| 2 | Delete the permanent sruti-pie render block (sectors + labels, ADR-131 R3) from the wheel render | `raga_wheel.js` (~`:1517–1654`) |
| 3 | Render `#sruti-seed` as the last child of `vp` at `(cx,cy)`: Idle vs Playing variants, tonic badge, pulse-on-playing; size `clamp(44px, 0.55×R_MADHYAMA, …)` | `raga_wheel.js` |
| 4 | Add `#sruti-overlay` (scrim + `.sruti-ring` of 12 `.sruti-key` discs from `tanpuraData`); bloom/swallow animation + `prefers-reduced-motion` fallback | `base.html` (markup + CSS), `raga_wheel.js` (key build + positioning) |
| 5 | Implement the §3 state machine on `RagaWheel._sruti = {activeIdx, expanded}`; wire seed/key/scrim/`Escape` handlers; keep `openPlayer(…, 'sruti')` / `closePlayer('sruti')` + `localStorage('sruti.tonic')` | `raga_wheel.js` |
| 6 | **Reuse ADR-132 palette verbatim** for key fills + active amber (`_srutiFill` / `_srutiTextFill` for discs); do not reintroduce spectral hues | `raga_wheel.js` |
| 7 | Hide `#sruti-overlay` and `#sruti-seed` outside raga-wheel view; restore last state from `localStorage` on re-entry (per ADR-131 §4) | `raga_wheel.js` |
| 8 | `bani-render`, then verify in-browser on desktop **and** a narrow (≤480px) viewport | — |

### 🧪 Test Engineer

Cover the §3 transition table and invariants:

1. **T1** COLLAPSED_IDLE + tap seed → keys bloom, scrim raised, no key amber.
2. **T2** EXPANDED_IDLE + tap key → drone starts, keys swallow, scrim drops,
   seed shows Playing + correct tonic badge.
3. **T3** EXPANDED_IDLE + tap scrim (and separately + `Escape`) → collapses,
   nothing playing.
4. **T4** COLLAPSED_PLAYING + tap seed → re-bloom with the **live** key amber.
5. **T5** EXPANDED_PLAYING + tap live key → drone stops, seed → Idle.
6. **T6** EXPANDED_PLAYING + tap a different key → drone switches, seed badge
   updates to the new tonic, collapses.
7. **T7** EXPANDED_PLAYING + tap seed/scrim → collapses but **keeps playing**.
8. **INV-scrim** scrim visible ⇔ `expanded === true`.
9. **INV-audio** drone sounding ⇔ `activeIdx !== null`; badge tonic matches
   the active key in every state.
10. **INV-amber** at most one amber key, only while EXPANDED_PLAYING.
11. **Touch** seed and key hit-areas ≥ 44px / ≥ 40px at a 360px-wide viewport.
12. **Persistence** reload restores the live tonic (COLLAPSED_PLAYING), not the
    expanded state.

Where DOM-state assertions need it, the Coder should expose the current state
(e.g. a `data-sruti-state` attribute on `#sruti-overlay`) so tests read state
without reaching into private closures.

---

## Open questions

1. **Two-arc fallback threshold** (§5): at what viewport width does a single
   12-disc ring become too crowded and split into two arcs? Coder to determine
   empirically; record the breakpoint in `LEARNINGS.md`.
2. **Badge vs. ring-label** for the live tonic on the Playing seed: a small
   corner badge (`G`) or the note centred under the glyph? Cosmetic; Coder's call.
3. **Scrim opacity / colour token**: reuse an existing dim token if one exists
   (e.g. a panel-backdrop) rather than minting a new one outside a design-token
   ADR (per ADR-028 / ADR-076 precedent).

[ADR: ADR-169, ADR-131, ADR-132, ADR-130, ADR-124]
[AGENTS: graph-architect]
