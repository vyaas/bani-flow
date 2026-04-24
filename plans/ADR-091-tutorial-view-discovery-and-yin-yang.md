# ADR-091: Tutorial View-Discovery Section and Yin-Yang Cross-Panel Introduction

**Status**: Proposed
**Date**: 2026-04-23
**Agents**: graph-architect (proposes); carnatic-coder (implements)
**Depends on**: ADR-090 (self-erase prevention, schema_version 3), ADR-087 (two-section tutorial layout)

---

## Context

ADR-087 established the chip catalogue + cross-panel seeds two-section layout. ADR-090 tightens the content rules and introduces demo rows. After both, the tutorial teaches *chip vocabulary* and *cross-panel navigation* — but it does not teach the **two-view architecture** (Guru-Shishya / Mela-Janya) or the **complementary role each panel plays inside each view**.

### What the tutorial still does not teach

**The two views are the application's primary axes.** Switching from Guru-Shishya to Mela-Janya changes what the graph area shows (lineage vs. raga wheel), changes what the BF panel trail represents (a musician's recordings vs. a raga's recordings), and changes how the two panels relate to each other. A user who discovers this by accident has to reconstruct the model from scratch. A user who is told once, concisely, retains it.

**The Guru-Shishya view is unadvertised.** The application defaults to Mela-Janya (raga wheel) view. A new user on mobile never sees the guru-shishya graph unless they tap the Guru-Shishya button in the header. The tutorial never mentions it, never shows a way to navigate to it, and never explains what it contains. The parampara — the transmission lineage that is the project's raison d'être — is the least discovered feature.

**The search bar is the primary onramp for musicians.** In Guru-Shishya view, musicians can be reached by tapping nodes on the graph. In Mela-Janya view (the default), the graph is replaced by the raga wheel and a musician can only be reached by name-search. The tutorial currently teaches only cross-panel chips; it does not show the search bar as an entry point.

### The yin-yang design principle

ADR-087 established the cross-reference principle: each panel's seeds demonstrate what the **other** panel does. ADR-090 removes any catalogue chip that would self-erase. The logical completion of this principle is:

> The Musician panel tutorial is an **egress map to the left panel and the Guru-Shishya view**.  
> The Bani Flow panel tutorial is an **egress map to the right panel and the Mela-Janya wheel**.

Each tutorial teaches you how to leave it productively, not how to stay in it. The tutorial's purpose is to make you want to navigate somewhere — and to give you the vocabulary to do so.

---

## Forces

| Force | Tension |
|---|---|
| **View discovery** | The tutorial must name both views and give the user a way to switch without hunting for the header |
| **No prose walls** | The view introduction must be active (a widget you can tap), not a paragraph you must read |
| **Functional equivalence** | The view-switcher in the tutorial must behave identically to the header view-switcher |
| **Search bar guidance** | Mentioning the search bar must not duplicate the search bar itself (the bar is already visible above the panel) |
| **Yin-yang completeness** | Each panel's tutorial points outward to the other panel and to the view that best serves that panel's content |
| **Schema minimalism** | New fields must be optional, backward-compatible, and validated by cli.py |

---

## Pattern

**Levels of Scale.** The tutorial already has two strata (catalogue + seeds). This ADR adds a third stratum at the bottom: the **view discovery section**. Each stratum is at a different scale of engagement: the catalogue is a reference (slow read), the seeds are a call to action (tap-and-see), the view section is an orientation frame (where does this fit?). The three together form a complete first-encounter arc.

---

## Decision

### 1 — Third tutorial section: inline view-switcher

A third section is added below the cross-panel seeds, separated by a second `<hr class="pt-divider">`:

```
┌─────────────────────────────────────────────────┐
│  Explore both views:                             │  ← pt-view-label
│                                                  │
│  [Guru-Shishya]  [Mela-Janya]                    │  ← functional view-switcher
│                                                  │
│  Guru-Shishya: lineage graph — each node a       │  ← pt-view-note
│  musician, each edge a teaching relationship     │
│                                                  │
│  Mela-Janya: raga wheel — 72 melas,              │  ← pt-view-note
│  each with its janya ragas and compositions      │
└─────────────────────────────────────────────────┘
```

The `[Guru-Shishya]` / `[Mela-Janya]` buttons use the **same CSS classes** as the header view-selector buttons (`view-btn`), **without IDs** (to avoid collision with `#view-btn-graph` and `#view-btn-raga`). They call the same `switchView('graph')` and `switchView('raga')` onclick handlers. The active class (`active`) is managed by `switchView()` via `document.querySelectorAll('.view-btn')`, so the tutorial buttons update in sync with the header buttons at no extra cost.

The two `pt-view-note` lines are static text rendered as `<p class="pt-view-note">`. They are two sentences, never more. They name what the view contains — not what it does to the UI.

**Schema addition**: a new optional key per panel block, `view_section`, with two optional note strings:

```json
"view_section": {
  "label": "Explore both views:",
  "graph_note": "Guru-Shishya: lineage graph — each node a musician, each edge a teaching relationship",
  "raga_note": "Mela-Janya: raga wheel — 72 melas, each with its janya ragas and compositions"
}
```

If `view_section` is absent the section is omitted. Both panels include it by default.

### 2 — Cross-panel seeds: intro note (both panels)

A short `pt-intro-note` is prepended to the cross-panel seeds section, before the chips. It names the view that best demonstrates the cross-panel coupling being illustrated.

**Musician panel** intro note (seeds demonstrate BF trail / raga wheel):

```
In Mela-Janya view, these open the raga wheel and recording trail — try switching the view first.
```

**Bani Flow panel** intro note (seeds demonstrate Musician panel loading):

```
In Guru-Shishya view, tap any musician node on the graph — or tap one of these:
```

This is a single sentence. It does not describe mechanics; it orients the user to the correct view before they tap.

**Schema addition**: `cross_panel_seeds.intro_note` (optional string). Rendered as `<p class="pt-intro-note">` above the chips row. Validated as a non-empty string if present; no ID resolution required.

### 3 — Search bar guidance (Bani Flow panel only)

The BF panel cross-panel seeds are musician chips. Below the chips, a static note:

```
Or search by raga or composition in the box above ↑
```

This tells the user that the search bar above the panel is the primary onramp for BF content, without duplicating it visually or making it a chip. The `↑` is directional text pointing to the search bar above.

**Schema addition**: `cross_panel_seeds.search_note` (optional string). Rendered as `<p class="pt-search-note">` below the chips row. Only used in `bani_flow_panel`.

### 4 — Musician panel: Guru-Shishya onramp note

The Musician panel cross-panel seeds (raga/composition chips) navigate the BF panel. But the musician panel is primarily the destination of the Guru-Shishya view: you tap a node on the lineage graph and this panel fills in. This relationship is not surfaced in the tutorial at all.

Below the cross-panel seeds chips (before the view section), a second `pt-intro-note` is appended:

```
In Guru-Shishya view, tap any musician on the lineage graph to load them here — or search by name above ↑
```

This is the only prose sentence in the tutorial that mentions the graph directly. It closes the loop: the musician panel teaches the user that the lineage graph is the primary entry point for musician selection.

**Schema addition**: `cross_panel_seeds.closing_note` (optional string). Rendered as `<p class="pt-closing-note">` below the chips and below any `search_note`. Validated as a non-empty string if present; no ID resolution required.

### 5 — Yin-yang summary: what each tutorial teaches

After ADR-090 + ADR-091, the structural content of each tutorial is:

| Section | Musician panel teaches | Bani Flow panel teaches |
|---|---|---|
| Chip catalogue | How raga/comp chips and action buttons work in this panel (all navigate away from this panel or are static demos) | How musician chips and action buttons work in this panel (musician chip navigates away; demos are static) |
| Cross-panel seeds | Three chips (Kharaharapriya mela / Thodi janya / Parulanna Matta comp) → demonstrate the BF trail and raga wheel | Three chips (Ramnad Krishnan / MS Subbulakshmi / TM Krishna) → demonstrate the Musician panel |
| Intro note | "In Mela-Janya view, these open the raga wheel…" | "In Guru-Shishya view, tap any musician node…" |
| Closing note | "In Guru-Shishya view, tap any musician on the lineage graph to load them here…" | "Or search by raga or composition in the box above ↑" |
| View section | [Guru-Shishya] [Mela-Janya] + two-line orientation | [Guru-Shishya] [Mela-Janya] + two-line orientation |

The Musician panel tutorial is an **egress map toward the raga wheel and BF trail** (left panel, Mela-Janya view) and also an **onramp note for the Guru-Shishya graph** (where musicians are the nodes).  
The Bani Flow panel tutorial is an **egress map toward the Musician panel** (right panel) and an **onramp note for the search bar** (primary BF entry in Mela-Janya view).

Each panel's tutorial emphasises the other panel's primary interaction surface. The yin-yang is explicit.

### 6 — Schema_version note

The `view_section`, `intro_note`, `closing_note`, and `search_note` fields are all additions at schema_version 3 (introduced by ADR-090's demo_row). `_renderInto` handles version 3 for all new fields. The `cli.py` schema version gate remains `> 3 → error`.

---

## Consequences

### Positive

- **The two-view architecture is taught on first encounter.** A user who reads either tutorial taps the view-switcher, sees the UI change, and immediately understands what `switchView` does. No hunting the header.
- **The Guru-Shishya view is no longer unadvertised.** The closing note in the Musician panel and the intro note in the BF panel both name the lineage graph by name and describe what it contains.
- **View-switcher in tutorial stays in sync with header.** Because `switchView()` applies `.active` to all `.view-btn` elements, the inline tutorial buttons update in sync with no extra code.
- **The tutorial is a complete orientation arc.** Catalogue (vocabulary) → seeds (live demonstration) → intro/closing notes (view context) → view section (architectural orientation). A user who reads from top to bottom knows the chip vocabulary, has seen both panels respond, understands which view surfaces which content, and knows how to navigate from any starting point.
- **No new CSS classes required for the view-switcher.** The existing `view-btn` class is shared. The tutorial inherits all future visual changes to the view-selector.

### Negative / cost

- **`pt-intro-note`, `pt-closing-note`, `pt-search-note`, `pt-view-label`, `pt-view-note` are new CSS classes** requiring styling. They are simple paragraph-level styles (small text, muted color, appropriate margin). One new CSS block (~20 lines).
- **The view section's two sentences must be kept accurate.** If the raga wheel changes (e.g. a `plans/ADR-NNN` removes it), the `raga_note` string in `empty_panels.json` must be updated. This is a content maintenance burden, not a structural one.
- **`view_section` in the tutorial and the header are not linked at the data level** — they share CSS classes and onclick handlers, but the tutorial's `view_section.label` text is curated in the JSON file. The Coder must ensure the tutorial's button labels match the header button labels if those ever change.
