# ADR-090: Tutorial Self-Erase Prevention, Visual Tightening, and Representative Content Rows

**Status**: Proposed
**Date**: 2026-04-23
**Agents**: graph-architect (proposes); carnatic-coder (implements)
**Depends on**: ADR-087 (chip catalogue schema, `empty_panels.json` v2)
**Supersedes**: ADR-087 §Decision.1 (catalogue chip selection) and §Decision.2 (render contract visual detail) — the chip-catalogue + cross-panel-seeds two-section structure of ADR-087 is preserved; this ADR tightens the content rules and visual rendering within each section.

---

## Context

ADR-087 landed the chip catalogue layout. Post-implementation screenshots reveal four problems:

### Problem 1 — Self-erase: the catalogue's first chip destroys the tutorial

The `musician-chip "Ramnad Krishnan"` entry in the Musician panel's catalogue is clickable and navigates to Ramnad Krishnan **in the Musician panel itself**. The tutorial disappears, replaced by real content, before the user has finished reading it. The chip was intended to demonstrate what a musician-chip looks like, but doing so requires making it functional — and making it functional means tapping it erases the tutorial immediately.

The same applies to the Bani Flow panel catalogue: `raga-chip "Thodi"` and `comp-chip "Parulanna Matta"` both load content into the BF panel, erasing the BF tutorial on first tap.

**Invariant**: a catalogue chip in Panel X must never navigate to Panel X.

The corollary: the only chips safe in any catalogue are those that navigate to the **other** panel, open the floating player, or open an external URL. Everything else is a self-erase trap.

### Problem 2 — Effect text has no tight visual binding to its chip

Each `pt-cat-row` renders a chip on one line and an effect statement on the next. On a narrow panel, the chip sits alone and the effect text follows as a loose paragraph. A second chip below creates perceptual ambiguity: does the effect text belong to the chip above or the chip below?

The effect statement must read as a direct annotation of the chip, not a free-floating sentence.

### Problem 3 — Arrow symbols are ambiguous

Effect statements use `→` as a prefix bullet. The same symbol appears in the view-switcher, in navigation affordances, and potentially in text content. A first-time user cannot distinguish `→ opens the Bani Flow trail` (a description) from `→` as a UI element. The bullet character should not collide with the application's navigational vocabulary.

### Problem 4 — Chips demonstrate labels, not rows

The lecdem entry shows a chip (`✎ TM Krishna — Manodharma`) with an effect statement. But a lecdem is never surfaced in the application as a standalone chip navigated to from the catalogue — it appears as a **titled row** with ▶ and ↗ buttons above the recording trail. A user who reads the catalogue chip and then sees an actual lecdem row will not recognise the correspondence. The chip taught the wrong visual vocabulary.

Similarly, a composition in the Bani Flow trail does not appear as a bare `comp-chip` — it appears as a row: `[↓ Parulanna Matta]  [♦ Kapi]  Rupakam` (composition chip, raga chip, tala label). The single-chip representation is incomplete.

---

## Forces

| Force | Tension |
|---|---|
| **Self-erase invariant** | Every chip in the catalogue must navigate away from the host panel |
| **Visual vocabulary teaching** | The catalogue must show the actual shape of content rows, not bare chips |
| **Functional chips only** | A chip that looks clickable must behave as it does in real content — no dead decorative chips |
| **Narrow panel constraint** | Effect text must be anchored visually to its chip even at ≤280px panel width |
| **Arrow disambiguation** | No navigational symbol used as a prose bullet |
| **Self-consistency** | A `demo_row` showing a composition must suppress the chips that would self-erase in that panel's context |

---

## Pattern

**Strong Centres + Boundaries.**

Each catalogue row is a bounded visual unit (card treatment). The chip (or representative row) and its effect are enclosed together, not adjacent. The boundary makes clear which effect belongs to which chip regardless of viewport width. Demo rows are real content shapes, not abstractions.

---

## Decision

### 1 — Self-erase invariant: remove all host-panel chips from `chip_catalogue`

**Musician panel** (`musician_panel`): remove `example_kind: "musician"` entries with a clickable `example_id`. They navigate to the Musician panel, erasing the tutorial.

**Bani Flow panel** (`bani_flow_panel`): remove `example_kind: "raga"` and `example_kind: "composition"` entries with a clickable `example_id`. They navigate the BF panel, erasing the tutorial.

After removal, both catalogues retain only:
- Cross-panel chips (raga/comp in Musician panel; musician in BF panel)
- Action items (▶, ↗)
- `demo_row` entries (see §3)

**`cli.py` hard error**: a catalogue entry whose `example_kind` and `example_id` combination would self-navigate the host panel. The check table:

| Panel key | Forbidden `example_kind` values with non-null `example_id` |
|---|---|
| `musician_panel` | `"musician"` |
| `bani_flow_panel` | `"raga"`, `"composition"` |

### 2 — Visual tightening: card rows, `·` bullet, no `→`

**CSS changes to `pt-cat-row`**:

- Each row becomes a card with `padding: 6px 8px`, `border-radius: 6px`, `background: var(--bg-card, rgba(255,255,255,0.04))`, `margin-bottom: 6px`.
- The chip and effect text are in a column (flex-direction: column).
- Effect text has `padding-top: 3px; padding-left: 2px; color: var(--fg-muted); font-size: 0.70rem`.

**Effect bullet**: replace `→` prefix with `·` (U+00B7 MIDDLE DOT). The middle dot is not used anywhere else in the application as a navigational symbol.

**View-sensitive effects** (`effect_graph` / `effect_raga`): prefix each line with the view label in parens: `(Guru-Shishya) ·` / `(Mela-Janya) ·` — not `⊙` / `◎` which are too abstract.

**Non-breaking inline phrases**: the `pt-effect` span produces `white-space: normal` text. Any inline phrase that must stay together (e.g. a view label) uses `<span class="pt-nowrap">…</span>` with `white-space: nowrap`. The Coder uses this for view label prefixes.

### 3 — `demo_row` entries: show real content shapes

A new optional field `demo_row` on a catalogue entry replaces or supplements the chip for entries where the real content shape is a multi-element row rather than a single chip.

**Schema addition** (schema_version bumps 2 → 3):

```json
{
  "css_class": null,
  "example_kind": "demo_row",
  "example_id": null,
  "example_label": null,
  "demo_row": {
    "type": "lecdem_row | composition_row",
    ...type-specific fields...
  },
  "effect": "· …"
}
```

**`demo_row.type: "lecdem_row"`** — shows what a lecdem strip row looks like:

```json
{
  "type": "lecdem_row",
  "title": "Manodharma Lec-Dem Promo — TM Krishna & Akkarai Subbulakshmi",
  "video_id": "KDPPDB0rG70",
  "youtube_url": "https://www.youtube.com/watch?v=KDPPDB0rG70"
}
```

Rendered as a `pt-demo-row` element:

```
┌──────────────────────────────────────────────────────────┐
│  Manodharma Lec-Dem Promo — TM Krishna & Akkarai…  [▶] [↗] │
└──────────────────────────────────────────────────────────┘
```

- Title: static truncated text (`pt-demo-title`, `text-overflow: ellipsis`).
- `▶` button: **functional** — calls the existing `openPlayer(video_id, title)` API. Uses `tree-play-btn` CSS class.
- `↗` button: **functional** — opens `youtube_url` in new tab. Uses `tree-ext-link` CSS class.
- The ▶ and ↗ use identical CSS classes to their live counterparts. A user who taps ▶ here learns exactly what ▶ does in a real lecdem row.

`demo_row.type: "composition_row"` — shows what a composition row in a trail looks like:

```json
{
  "type": "composition_row",
  "comp_id": "parulanna_matta",
  "comp_label": "Parulanna Matta",
  "raga_id": "kapi",
  "raga_label": "Kapi",
  "tala": "Rupakam",
  "composer_id": "dharmapuri_subbaraya_iyer",
  "composer_label": "Dharmapuri Subbaraya Iyer"
}
```

Rendered as a `pt-demo-row` element:

```
[↓ Parulanna Matta]  [♦ Kapi]  Rupakam
```

Context-aware chip rendering:
- In `musician_panel` context: `comp-chip` and `raga-chip` are **functional** (they navigate the BF panel — safe). Composer is **static text** (`pt-demo-label`): it would be a `musician-chip` navigating the Musician panel, erasing the tutorial.
- In `bani_flow_panel` context: `comp-chip` and `raga-chip` are **static text** (they navigate the BF panel — self-erase). Composer `musician-chip` is **functional** if composer has a `musician_id` in the graph; otherwise static text.

The `_renderInto` function receives the panel slot (`'musician'` or `'bani'`) and uses it to gate chip functionality.

### 4 — Raga wheel chip examples in `musician_panel` cross_panel_seeds

The Musician panel's cross-panel seeds currently demonstrate BF trail loading (Thodi, Bhairavi, Parulanna Matta, Ninnada Nela). The raga wheel has three navigational concepts: melakarta (the outer ring), janya (a satellite), and composition (the innermost layer). The seeds should include one of each to demonstrate the full wheel.

Replace the current four seeds with three that map cleanly onto the three wheel concepts:

```json
"cross_panel_seeds": {
  "prompt": "Tap these — watch the Bani Flow panel (and wheel in Mela-Janya view) respond:",
  "panel_target": "bani",
  "items": [
    { "kind": "raga",        "id": "kharaharapriya", "label": "Kharaharapriya", "note": "melakarta" },
    { "kind": "raga",        "id": "thodi",          "label": "Thodi",          "note": "janya"     },
    { "kind": "composition", "id": "parulanna_matta", "label": "Parulanna Matta", "note": "composition" }
  ]
}
```

The optional `note` field (string, no validation) is rendered as a subdued parenthetical `(melakarta)` / `(janya)` / `(composition)` beneath each seed chip. This teaches the three wheel tiers without prose.

The `kharaharapriya` raga is in the graph (id: `kharaharapriya`, is_melakarta: true). `thodi` is a janya of Shankarabharanam (mela 29). `parulanna_matta` is in the graph.

### 5 — Revised `empty_panels.json` schema_version 3

The full revised `musician_panel.chip_catalogue` (schema_version 3):

```json
[
  {
    "css_class": "raga-chip",
    "example_kind": "raga",
    "example_id": "thodi",
    "example_label": "Thodi",
    "effect": "· opens the Bani Flow trail for that raga (left panel)"
  },
  {
    "css_class": "comp-chip",
    "example_kind": "demo_row",
    "example_id": null,
    "example_label": null,
    "demo_row": {
      "type": "composition_row",
      "comp_id": "parulanna_matta",
      "comp_label": "Parulanna Matta",
      "raga_id": "kapi",
      "raga_label": "Kapi",
      "tala": "Rupakam",
      "composer_id": "dharmapuri_subbaraya_iyer",
      "composer_label": "Dharmapuri Subbaraya Iyer"
    },
    "effect": "· composition rows carry raga and tala; clicking the raga opens its Bani Flow trail"
  },
  {
    "css_class": "tree-play-btn",
    "example_kind": "action",
    "example_id": null,
    "example_label": "▶",
    "effect": "· opens the floating YouTube player on that track"
  },
  {
    "css_class": "tree-ext-link",
    "example_kind": "action",
    "example_id": null,
    "example_label": "↗",
    "effect": "· opens the source page (YouTube / Wikipedia) in a new tab"
  },
  {
    "css_class": "lecdem-chip",
    "example_kind": "demo_row",
    "example_id": null,
    "example_label": null,
    "demo_row": {
      "type": "lecdem_row",
      "title": "Manodharma Lec-Dem Promo — TM Krishna & Akkarai Subbulakshmi",
      "video_id": "KDPPDB0rG70",
      "youtube_url": "https://www.youtube.com/watch?v=KDPPDB0rG70"
    },
    "effect": "· lecdem rows appear above the trail when a subject has lecture-demonstrations"
  }
]
```

The full revised `bani_flow_panel.chip_catalogue`:

```json
[
  {
    "css_class": "musician-chip",
    "example_kind": "musician",
    "example_id": "ramnad_krishnan",
    "example_label": "Ramnad Krishnan",
    "effect": "· opens that musician in the Musician panel (right panel)"
  },
  {
    "css_class": "comp-chip",
    "example_kind": "demo_row",
    "example_id": null,
    "example_label": null,
    "demo_row": {
      "type": "composition_row",
      "comp_id": "parulanna_matta",
      "comp_label": "Parulanna Matta",
      "raga_id": "kapi",
      "raga_label": "Kapi",
      "tala": "Rupakam",
      "composer_id": "dharmapuri_subbaraya_iyer",
      "composer_label": "Dharmapuri Subbaraya Iyer"
    },
    "effect": "· composition rows show raga, tala, and composer; clicking the composer opens them in the Musician panel"
  },
  {
    "css_class": "tree-play-btn",
    "example_kind": "action",
    "example_id": null,
    "example_label": "▶",
    "effect": "· opens the floating YouTube player on that track"
  },
  {
    "css_class": "tree-ext-link",
    "example_kind": "action",
    "example_id": null,
    "example_label": "↗",
    "effect": "· opens the source page (YouTube / Wikipedia) in a new tab"
  },
  {
    "css_class": "lecdem-chip",
    "example_kind": "demo_row",
    "example_id": null,
    "example_label": null,
    "demo_row": {
      "type": "lecdem_row",
      "title": "Manodharma Lec-Dem Promo — TM Krishna & Akkarai Subbulakshmi",
      "video_id": "KDPPDB0rG70",
      "youtube_url": "https://www.youtube.com/watch?v=KDPPDB0rG70"
    },
    "effect": "· lecdem rows appear above the trail when a subject has lecture-demonstrations"
  }
]
```

Note: the `bani_flow_panel` no longer contains raga-chip or comp-chip as standalone catalogue entries. The composition row demo shows the row shape; within it, the `comp-chip` and `raga-chip` render as static labels (no click) while the `composer` renders as a functional `musician-chip` (opens Musician panel — safe).

### 6 — `cli.py` validation additions

Beyond the existing self-erase hard error (§1):

- `demo_row.type` must be `"lecdem_row"` or `"composition_row"` — any other value is an error.
- `demo_row.type: "lecdem_row"`: `video_id` must be an 11-character alphanumeric string; `youtube_url` must be a valid YouTube URL containing the same `video_id`.
- `demo_row.type: "composition_row"`: `comp_id` must exist in `compositions`; `raga_id` must exist in `ragas`; `composer_id` (if present) must exist in the graph as a musician or composer.
- `cross_panel_seeds.items[*].note` is optional and unchecked (free text).

---

## Consequences

### Positive

- **Tutorial can no longer self-erase via its own catalogue chips.** A user reading either tutorial is not at risk of accidentally erasing it by tapping a catalogue chip they are curious about (except via the cross-panel seeds in an adjacent panel — handled by ADR-089 history navigation).
- **Demo rows teach visual vocabulary by showing real content shapes.** A user who reads the lecdem demo row immediately recognises lecdem rows in the live panel because they look identical.
- **Arrow ambiguity eliminated.** `·` as the effect bullet does not collide with the application's directional arrow vocabulary.
- **Raga wheel is introduced structurally.** The three cross-panel seeds (melakarta / janya / composition) map onto the three wheel layers, giving the user a conceptual scaffold before they open the wheel.
- **Composition demo rows are context-aware.** The same `demo_row` data fragment renders differently in the Musician panel (raga/comp clickable, composer static) vs. the BF panel (raga/comp static, composer clickable), correctly enforcing the self-erase invariant in both contexts without needing two separate data objects.

### Negative / cost

- **`_renderInto` becomes context-aware.** It must receive the panel slot (`'musician'` | `'bani'`) and thread it into `_catalogueChip` and `_renderDemoRow`. This touches the `_ensureRendered` → `_renderInto` call chain.
- **Demo rows must be kept in sync with real row CSS.** If `tree-play-btn` or `tree-ext-link` CSS changes, the demo rows inherit those changes automatically (same class). If the lecdem row HTML structure changes, `_renderDemoRow` must be updated alongside.
- **`composer_id` to `musician_id` lookup required at render time** for functional composer chips in the BF panel composition demo row. The Coder must resolve `dharmapuri_subbaraya_iyer` → musician node via the `composers` global injected by `html_generator`.
