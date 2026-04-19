# ADR-045: Onboarding Affordances — Full View Labels, Tanpura Label, Help Dialog

**Status**: Accepted  
**Date**: 2026-04-19  
**Agent**: graph-architect

---

## Context

Three usability gaps exist that leave first-time visitors disoriented:

1. **Mobile view toggle shows only "GS" / "MJ"** — abbreviations that are opaque without prior context. A user who has never heard of *Guru-Shishya parampara* or *Mela-Janya raga system* has no way to discover what the two views represent just from the toggle.

2. **The E-Tanpura pitch buttons have no label on desktop** — a row of musical note names (C, C#, D …) appears in the header strip without any surrounding caption. Users who know what a tanpura is will understand; everyone else sees an unexplained bank of buttons.

3. **No project-level orientation exists in the app** — there is a detailed README and `.clinerules`, but nothing surfaced *inside* the live site. Visitors who land directly on the GitHub Pages deployment have no onboarding path.

---

## Pattern

*Levels of Scale* (Alexander): orientation cues must exist at every scale of experience — app-level (help dialog), view-level (toggle label), widget-level (tanpura caption). Each level should answer the question: "what does this thing do?"

---

## Decision

### 1 — Full view labels on mobile

**Before** (currently, mobile CSS):
```css
@media (max-width: 768px) {
  .view-label-full  { display: none; }
  .view-label-short { display: inline; }
}
```

**After**: remove those two overrides so `.view-label-full` stays visible on mobile. The toggle buttons already contain full text (`Guru-Shishya`, `Mela-Janya`) wrapped in `.view-label-full` spans. No HTML change required.

If button width on mobile is a concern, the `view-btn` padding can be reduced from `5px 11px` to `5px 9px` inside the mobile media query.

---

### 2 — E-Tanpura label on desktop

Add a non-interactive `<span>` caption immediately before `#sruti-power` inside `#sruti-strip`:

```html
<!-- before -->
<div id="sruti-strip">
  <span id="sruti-power" …>●</span>
  <div id="sruti-buttons"></div>
</div>

<!-- after -->
<div id="sruti-strip">
  <span id="sruti-label" class="sruti-label">E-Tanpura</span>
  <span id="sruti-power" …>●</span>
  <div id="sruti-buttons"></div>
</div>
```

Style `.sruti-label` as a dim, uppercase, small-caps caption; `flex-shrink: 0`; hidden on mobile (where `#sruti-strip` itself is `display:none`).

---

### 3 — Help dialog

**HTML additions**:

A `?` icon button is added to the right side of `<header>`, inside `.controls`, before the `.view-selector`. On click it opens `#help-dialog`, a fixed centered overlay styled identical to `#meta-inspector` (same background, border, box-shadow, close button pattern).

```html
<!-- button in controls -->
<button id="help-btn" class="help-btn" title="About this project" aria-label="Help">?</button>

<!-- overlay (hidden by default) -->
<div id="help-dialog" style="display:none" aria-modal="true" role="dialog">
  <div id="hd-bar">
    <span id="hd-title">About Bani Flow</span>
    <button id="hd-close" title="Close">✕</button>
  </div>
  <div id="hd-body">
    …content…
  </div>
</div>
```

**Dialog content** (prose rendered as styled HTML, not raw markdown):

```
ABOUT
Bani Flow is a knowledge graph of Carnatic guru-shishya (teacher-student) lineages.
It maps how musical tradition — ragas, compositions, performance style — passes between
generations of musicians. Explore how different musicians have rendered the same ragas
and compositions to hear the living variety within a single lineage.

─────────────────────────────

GURU-SHISHYA VIEW  [chip: Guru-Shishya]
A graph of musicians as nodes. Directed edges flow from guru → shishya.
Click a node once to preview; click again to open the Musician panel.
Use the era and instrument filter chips at the top to narrow the graph.

─────────────────────────────

MELA-JANYA VIEW  [chip: Mela-Janya]
A wheel of the 72 melakarta ragas with janya ragas branching outward.
Click a raga once to preview; click again to open the Bani Flow panel,
which lists all recordings on that raga. Use the [◈ raga-chip] links to
navigate across ragas.

─────────────────────────────

MUSICIAN PANEL
Shows the repertoire of the selected musician — concert recordings grouped
by performance, each with a [♩ composition-chip] and [◈ raga-chip].
Click any recording's ▶ button to open the YouTube player.

─────────────────────────────

E-TANPURA
The row of note buttons (●) in the header plays a tanpura drone for that
sruti (tonic pitch). Use it as a reference pitch while listening.
Click the lit button again, or the ● power indicator, to stop.

─────────────────────────────

BANI FLOW PANEL (left sidebar)
Search for a raga or composition to see all musicians who have recorded it,
sorted by recency. Each entry links directly to a recording. This is the
core exploration surface: compare how Semmangudi, Ariyakudi, and their
students all render the same Thodi or Bhairavi.
```

The dialog uses existing CSS variables; chips that appear in the content are rendered as real `.raga-chip` / `.comp-chip` / `.filter-chip` spans so they look identical to the live site.

**Backdrop**: a `#help-scrim` div (same pattern as `#left-drawer-scrim`) covers the viewport behind the dialog; clicking the scrim closes the dialog.

---

## Consequences

- **No data changes** — purely rendering layer.
- **No new JS files** — dialog open/close logic is ≈ 20 lines, inline in base.html or added to an appropriate existing template.
- **Mobile impact**: the `?` button is visible in the header on both desktop and mobile (the controls strip does not disappear on mobile). The dialog is `position:fixed` so it centres correctly on both form factors. No new media query needed.
- **`.view-label-short` spans remain in the DOM** for forward compatibility but are never shown — they can be removed in a future cleanup ADR.

---

## Implementation (Carnatic Coder)

1. **base.html** — CSS + HTML:
   - Remove the two `.view-label-full { display:none }` / `.view-label-short { display:inline }` overrides inside `@media (max-width: 768px)`.
   - Reduce `view-btn` padding in the mobile query to `5px 9px`.
   - Add `.sruti-label` style (dim, uppercase, small-caps, `flex-shrink:0`, `font-size:0.65rem`).
   - Add `#sruti-label` span in `#sruti-strip`.
   - Add `.help-btn` style (round, accent border, `font-size:0.82rem`, `font-weight:bold`).
   - Add `#help-dialog`, `#hd-bar`, `#hd-title`, `#hd-close`, `#hd-body` styles (mirror `#meta-inspector` with wider `max-width:600px`, readable prose `font-family:var(--font-ui)`).
   - Add `#help-scrim` style (same as `#left-drawer-scrim`).
   - Insert `#help-btn` into `.controls` before `#view-selector`.
   - Insert `#help-dialog` overlay and `#help-scrim` into `<body>` before `</body>`.
   - Add inline `<script>` for help open/close (≈ 20 lines).

2. After changes: run `bani-render` and verify in browser at `localhost:8765/graph.html`.
