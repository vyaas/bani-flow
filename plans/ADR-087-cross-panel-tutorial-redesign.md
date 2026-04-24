# ADR-087: Cross-Panel Tutorial Redesign — Chip Catalogue as the Only README

**Status**: Accepted
**Date**: 2026-04-23
**Agents**: graph-architect (proposes); carnatic-coder (implements rendering + data shape); librarian (curates seed chips once schema lands)
**Depends on**: ADR-086 (tutorial schema, render contract, `empty_panels.json`), ADR-028 (design tokens), ADR-056 (chip prominence), ADR-067 (Musician panel history), ADR-079 (lecdem chip)
**Supersedes**: ADR-086 §Decision.1 (storage schema content) and §Decision.3 (render contract) — the validation and dismissal rules of ADR-086 are preserved; this ADR replaces the content shape and render contract.

---

## Context

ADR-086 established the tutorial as the panel's null state, provided `empty_panels.json`, and specified the render contract. After the initial implementation, three structural weaknesses emerged.

### Weakness 1 — Each panel's tutorial teaches only one direction

The Musician panel's seed examples (Tyagaraja compositions, Ramnad Krishnan recordings, TM Krishna lecdems) all produce visible changes in the **Musician panel itself**. A user who taps them sees the Musician panel populate — correct, but it teaches nothing about the Bani Flow panel.

Conversely, the Bani Flow panel's seed examples (Thodi, Parulanna Matta) both load the **Bani Flow panel itself**. A user who taps them sees the trail populate — correct, but they never discover that the `.musician-chip` entries in that trail open the Musician panel.

The bidirectional coupling between the two panels is the deepest UX affordance of the application, and neither tutorial teaches it.

### Weakness 2 — No cross-pollination

A first-time visitor to the Musician panel sees chips about TM Krishna. They do not see a Thodi-chip in the Musician panel, and so they do not see the Bani Flow panel light up in response. The system's two most powerful interactions (musician → BF trail; BF trail musician → Musician panel) are both invisible in the first paint.

### Weakness 3 — Prose mechanics, not chips

The tutorial's `mechanics` list describes actions in prose. A user who reads "tap a raga chip to see its recording trail" has learned a sentence, not a gesture. They then need to independently locate a raga chip. The tutorial *shows* nothing.

The principle should be: **the tutorial teaches by doing**, not by describing. If the visual vocabulary is a chip, the tutorial's teaching unit is a chip — rendered identically to how it appears in loaded content, accompanied by a single line of effect.

### The cross-reference principle

Correct assignment of examples:

| Panel | Seeds that belong here | Seeds that do NOT belong here |
|---|---|---|
| Musician panel | `.comp-chip` and `.raga-chip` → these open the **Bani Flow panel** | `.musician-chip` → opens this panel itself (not cross-referencing) |
| Bani Flow panel | `.musician-chip` → opens the **Musician panel** | `.raga-chip`, `.comp-chip` → open this panel itself |

"Try these" seeds are proof that the **other** panel responds. The seeds are not demos of the panel you are already standing in.

### What remains missing from a cross-reference-only tutorial

A user who taps through the cross-reference seeds learns that panels respond to each other. But they have not learned what the **full set of chip types** in each panel is, or what each one does. A chip catalogue answers this: a compact glossary of every interactive element that appears in this panel, rendered as real chips, each with a one-line effect statement.

---

## Forces

| Force | Tension |
|---|---|
| **Cross-panel teaching** | Each tutorial's seed examples must only trigger the OTHER panel, not itself |
| **Visual vocabulary** | Teaching must use the same chip CSS classes as real content — no special "tutorial chip" styling |
| **Both views** | Effect statements must cover both Guru-Shishya and Mela-Janya views when they differ |
| **No elaborate prose** | The chip IS the description; one-line effect statements, no blurbs, no paragraphs |
| **Self-eviction** | Tutorial disappears the moment the panel loads real content — it is still the null state |
| **Chip catalogue completeness** | Every chip type that appears in a panel must appear in its catalogue — no silently undocumented elements |
| **No bit-rot** | Every example ID in the catalogue must be validated by `cli.py validate` |

---

## Pattern

**Levels of Scale + Strong Centres.**

Two spatial strata in each tutorial card:

1. **Chip catalogue** (top): a compact reference of every chip type in this panel. It answers "what are these things?" At this level the chips reference real entities from the corpus, so the catalogue is immediately usable as a navigation aid, not just a label.

2. **Cross-panel seeds** (bottom): 2–4 chips that, when tapped, visibly change the OTHER panel. Labelled explicitly: "Tap these — watch the other panel respond:". This is the tutorial's live demonstration.

The **boundary** between stratum 1 and stratum 2 is a section divider, not prose. Stratum 1 teaches the vocabulary; stratum 2 demonstrates the coupling.

---

## Decision

### 1 — Revised `empty_panels.json` schema

The schema gains a new key per panel block: `chip_catalogue`. The `try_these` structure is restructured: `groups` is replaced by `cross_panel_seeds` (an array of chips, each with a `panel_target` field making the invariant explicit in the data). The `blurb` field is removed.

```json
{
  "schema_version": 2,
  "musician_panel": {
    "chip_catalogue": [
      {
        "css_class": "musician-chip",
        "example_id": "ramnad_krishnan",
        "example_kind": "musician",
        "example_label": "Ramnad Krishnan",
        "effect": "→ opens that musician in this panel (back ← → forward to navigate)"
      },
      {
        "css_class": "raga-chip",
        "example_id": "thodi",
        "example_kind": "raga",
        "example_label": "Thodi",
        "effect": "→ opens the Bani Flow trail for that raga (left panel)"
      },
      {
        "css_class": "comp-chip",
        "example_id": "parulanna_matta",
        "example_kind": "composition",
        "example_label": "Parulanna Matta",
        "effect": "→ opens the Bani Flow trail for that composition (left panel)"
      },
      {
        "css_class": "tree-play-btn",
        "example_id": null,
        "example_kind": "action",
        "example_label": "▶",
        "effect": "→ opens the floating YouTube player on that track"
      },
      {
        "css_class": "tree-ext-link",
        "example_id": null,
        "example_kind": "action",
        "example_label": "↗",
        "effect": "→ opens the source page (YouTube / Wikipedia) in a new tab"
      },
      {
        "css_class": "lecdem-chip",
        "example_id": "tm_krishna",
        "example_kind": "lecdem_by",
        "example_label": "✎ TM Krishna — Manodharma",
        "effect": "→ opens the lecdem in the floating player"
      }
    ],
    "cross_panel_seeds": {
      "prompt": "Tap these — watch the Bani Flow panel respond:",
      "panel_target": "bani",
      "items": [
        { "kind": "raga",        "id": "thodi",           "label": "Thodi"           },
        { "kind": "raga",        "id": "bhairavi",        "label": "Bhairavi"        },
        { "kind": "composition", "id": "parulanna_matta", "label": "Parulanna Matta" },
        { "kind": "composition", "id": "ninnada",         "label": "Ninnada Nela"    }
      ]
    }
  },
  "bani_flow_panel": {
    "chip_catalogue": [
      {
        "css_class": "raga-chip",
        "example_id": "thodi",
        "example_kind": "raga",
        "example_label": "Thodi",
        "effect_graph": "→ loads this panel's recording trail for that raga",
        "effect_raga":  "→ also selects the raga on the wheel; recording trail loads here"
      },
      {
        "css_class": "comp-chip",
        "example_id": "parulanna_matta",
        "example_kind": "composition",
        "example_label": "Parulanna Matta",
        "effect": "→ loads this panel's recording trail for that composition"
      },
      {
        "css_class": "musician-chip",
        "example_id": "ramnad_krishnan",
        "example_kind": "musician",
        "example_label": "Ramnad Krishnan",
        "effect": "→ opens that musician in the Musician panel (right panel)"
      },
      {
        "css_class": "tree-play-btn",
        "example_id": null,
        "example_kind": "action",
        "example_label": "▶",
        "effect": "→ opens the floating YouTube player on that track"
      },
      {
        "css_class": "tree-ext-link",
        "example_id": null,
        "example_kind": "action",
        "example_label": "↗",
        "effect": "→ opens the source page (YouTube / Wikipedia) in a new tab"
      },
      {
        "css_class": "lecdem-chip",
        "example_id": "tm_krishna",
        "example_kind": "lecdem_about",
        "example_label": "✎ TM Krishna on Thodi",
        "effect": "→ opens the lecdem in the floating player (appears above the trail when one exists)"
      }
    ],
    "cross_panel_seeds": {
      "prompt": "Tap these — watch the Musician panel respond:",
      "panel_target": "musician",
      "items": [
        { "kind": "musician", "id": "ramnad_krishnan", "label": "Ramnad Krishnan" },
        { "kind": "musician", "id": "ms_subbulakshmi", "label": "MS Subbulakshmi" },
        { "kind": "musician", "id": "tm_krishna",      "label": "TM Krishna"      }
      ]
    }
  }
}
```

**Key schema contracts**:

- `chip_catalogue[*].example_id` must resolve in `graph.json` (or be `null` for `example_kind: "action"` items that have no entity ID). Validated by `cli.py validate`.
- `cross_panel_seeds.panel_target` must NOT equal the panel block's own key. A `musician_panel` block with `panel_target: "musician"` is a hard schema error.
- `cross_panel_seeds.items[*].kind` must be `"raga"` or `"composition"` for the musician panel, and `"musician"` for the bani flow panel. Any other kind in a cross-panel seed is a schema error — it would target the wrong panel.
- `schema_version` bumps from 1 → 2. The render pipeline must reject version > 2 with an upgrade hint.

### 2 — Render contract (revised from ADR-086 §3)

The tutorial card renders two sections:

**Section A: Chip catalogue**

```
┌─ panel-tutorial ─────────────────────────────────────────┐
│ How to use this panel                                     │  ← pt-label
│                                                           │
│ Every chip type in this panel                             │  ← pt-catalogue-heading
│                                                           │
│  [Ramnad Krishnan]  → opens that musician in this panel  │  ← .musician-chip  .pt-effect
│  [Thodi]            → opens the Bani Flow trail (left)   │  ← .raga-chip      .pt-effect
│  [Parulanna Matta]  → opens the Bani Flow trail (left)   │  ← .comp-chip      .pt-effect
│  [▶]               → opens the floating YouTube player   │  ← .tree-play-btn  .pt-effect
│  [↗]               → opens the source page in a new tab  │  ← .tree-ext-link  .pt-effect
│  [✎ TM Krishna…]   → opens the lecdem in the player      │  ← .lecdem-chip    .pt-effect
│                                                           │
├────────────────────────────────────────────────────────── │
│ Tap these — watch the Bani Flow panel respond:            │  ← pt-cross-prompt
│                                                           │
│  [Thodi]  [Bhairavi]  [Parulanna Matta]  [Ninnada Nela]  │  ← .raga-chip / .comp-chip
└───────────────────────────────────────────────────────────┘
```

**Chip rendering invariant**: every chip in both sections uses the **exact same CSS class** as that chip class uses in loaded content. A `.raga-chip` in the tutorial is visually indistinguishable from a `.raga-chip` in a live recording row. The user learns the visual vocabulary by reading the tutorial — no translation needed.

**Action items** (`example_kind: "action"`, `example_id: null`) render as unstyled button-like spans with the action label (▶, ↗) and their effect line. They are not clickable in the catalogue (they are labels, not triggers).

**Effect statement rendering**:
- If `effect_graph` and `effect_raga` both exist (view-sensitive): render one effect line per view, each prefixed with a small view label (`⊙ Graph:` / `◎ Ragas:`).
- If only `effect` exists: render a single line, no view prefix.

**Section divider**: a `<hr class="pt-divider">` visually separates the catalogue from the cross-panel seeds.

**Cross-panel seeds section**: a prompt label + a flex row of chips. Chips in this section use the same CSS class as the chip kind they represent (`.raga-chip`, `.comp-chip`, `.musician-chip`). These chips ARE clickable and navigate the other panel on click.

**View-coupling**: the catalogue is shown in both views unchanged — its effect statements contain the view-sensitive notes already (via `effect_graph`/`effect_raga`). No view-based hiding.

**Dismissal invariant** (preserved from ADR-086): the tutorial card disappears atomically when a subject is loaded. It never coexists with real content.

### 3 — Validation additions to `cli.py`

Beyond ADR-086's existing ID resolution checks:

- **Cross-panel target invariant**: every `cross_panel_seeds.panel_target` is validated against the block's key. A `musician_panel.cross_panel_seeds.panel_target == "musician"` exits with error.
- **Kind-target agreement**: in `musician_panel.cross_panel_seeds`, every `item.kind` must be `"raga"` or `"composition"` (never `"musician"`). In `bani_flow_panel.cross_panel_seeds`, every `item.kind` must be `"musician"` (never `"raga"` or `"composition"`). The rule: a seed item's kind must NOT be the primary entity type of the panel it belongs to.
- **Action items exempt from ID resolution**: `example_kind == "action"` items with `example_id == null` are explicitly skipped in the ID resolution check.
- **Schema version gate**: `schema_version > 2` exits with an upgrade hint.

### 4 — What this does NOT change

- The tutorial is still the panel's **null state** — shown when no subject is loaded, hidden when one is.
- The tutorial is still rendered once and cached in `data-rendered="1"` (ADR-086 §3).
- The `helpEmptyPanels` global injection pattern (ADR-086), the `showPanelTutorial` / `hidePanelTutorial` API, and the `empty_tutorials.js` module structure are all preserved. Only the data shape and `_renderInto` render function change.
- Validation on `subject_id`, `musician_id`, `raga_id` in `try_these` items (ADR-086 §2) is replaced by the catalogue and seed-item validations above; the behaviour is the same, the field names change.

---

## Consequences

### Positive

- **Cross-panel coupling becomes the first thing a user learns.** The Musician panel's tutorial is populated from the first glance with chips that visibly move the Bani Flow panel; the Bani Flow panel's tutorial is populated with chips that visibly move the Musician panel. The application's deepest affordance is demonstrated before the user has done anything.
- **The chip is the tutorial.** A user who taps a `.raga-chip` in the catalogue and watches the Bani Flow panel respond has learned the chip's behaviour without reading about it. The medium and the message are the same.
- **Effect statements cover both views.** A rasika switching from Guru-Shishya to Mela-Janya no longer has to rediscover what the chips do in the new view — the catalogue already told them.
- **No prose barrier.** The catalogue is scannable in 5 seconds. No wall of text to dismiss.
- **Visual vocabulary is pre-taught.** When real `.raga-chip` elements appear in the loaded BF trail, the user has already seen that exact chip in the tutorial catalogue. There is no gap between "tutorial chip" and "live chip".

### Negative / cost

- **`empty_panels.json` schema_version bump** requires the render pipeline and Coder to handle the migration. `bani_add.py` does not consume this file, so the bundle schema is unaffected.
- **Seed set is asymmetric**: musician panel cross-seeds are raga/comp chips; BF panel cross-seeds are musician chips. A first-time user in the Musician panel tutorial will NOT see examples of the Musician panel loaded with real data — they see the loaded musician panel only by tapping a musician node directly. This is intentional: the cross-reference seeds are not demos of the panel they live in.
- **Catalogue chips are navigable**: tapping a `.raga-chip` in the catalogue section correctly loads the BF panel (because it uses the same click handler). This means the catalogue doubles as a quick-start navigator. This is a feature, but it means the tutorial can be "used up" by the catalogue — a user who taps a catalogue chip has loaded the panel and dismissed the tutorial. Acceptable; ADR-089 makes the tutorial re-accessible via back-navigation.
