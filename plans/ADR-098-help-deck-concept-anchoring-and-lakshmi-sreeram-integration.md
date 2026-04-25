# ADR-098: Help Deck as Living Curriculum — Concept Anchoring and Lakshmi Sreeram Integration

**Status:** Proposed
**Date:** 2026-04-25
**Agents:** graph-architect → librarian, carnatic-coder

---

## Context

The help panels (ADR-086/087/091) introduced `empty_panels.json`: a data-driven tutorial that appears when a panel has no subject loaded. The first generation (shipped ADR-091) established the structural grammar: chip catalogue → divider → cross-panel seeds → view-section. Language and content were upgraded in the session of 2026-04-25 to feature the Dhanammal lineage, the TM Krishna Manodharma series, and a deliberate yin-yang structure between the two panels.

Three forces remain unresolved after that session:

**Force 1 — Concept walls.** Every panel now uses the correct vocabulary of the tradition — *gamaka*, *alapana*, *manodharma*, *rakti*, *bani*, *kriti* — but each term sits in plain text with no audible or readable anchor. A newcomer who doesn't know what *gamaka* is has nowhere to go; a curious reader who wants to go deeper has no links. Wikipedia URLs exist for nearly every term; Lakshmi Sreeram's 71-lecture NPTEL series covers every foundational concept as a listenable lecture.

**Force 2 — Wasted curriculum.** `lakshmi_sreeram.json` holds 71 lecture entries with empty `subjects`. Each lecture is a direct demonstration of a concept the help deck names. This is an unused table of contents. The deck talks *about* gamakas; Sreeram's lectures *are* gamakas explained. The subjects field is the indexing layer that bridges the two.

**Force 3 — Passive filter bar.** The search / filter bar above each panel is mute during the tutorial state: it accepts input but does nothing. This is a missed teaching moment. The same bar is the primary tool for navigating loaded content — filtering recordings by raga, compositions by name, lecdems by subject. If the tutorial state taught this behaviour by *reacting to input*, the user would arrive at loaded content already knowing the tool.

---

## Pattern

### **Gradients** (Alexander, Pattern 9)

The help deck should function as a gradient: from orientation → concept → anchor → immersion. Right now the deck peaks at "orientation" and drops into nothing. Adding concept anchors (ext_links), listenable anchors (Lakshmi Sreeram chips), and a reactive filter bar completes the gradient.

### **Deep Interlock and Ambiguity** (Alexander, Pattern 16)

Lakshmi Sreeram's lectures and the performance recordings are not parallel tracks — a Gamaka I lecture is directly about the gamakas you hear in a Ramnad Krishnan concert. The deck should make this interlock structural: when the Bani Flow panel shows a gamaka chip, it should link directly to the lecture that explains it.

### **Levels of Scale** (Alexander, Pattern 5)

Three grain sizes of anchoring are needed: (1) inline Wikipedia links for terminology (smallest — expands one term), (2) Lakshmi Sreeram lecture chips for concepts (medium — covers a topic in 20 minutes), (3) TM Krishna Manodharma series for improvisation (largest — the full graduate curriculum on performance practice). The deck currently has only grain 3.

---

## Decision

### A. `ext_links` array on `chip_catalogue` entries (new optional field)

Each chip catalogue entry may carry an `ext_links` array:

```json
{
  "css_class": "raga-chip",
  "example_kind": "raga",
  "example_id": "begada",
  "example_label": "Begada",
  "effect": "Begada is a rakti raga — a mode of deep emotional saturation...",
  "ext_links": [
    { "label": "Wikipedia · Begada", "url": "https://en.wikipedia.org/wiki/Begada" },
    { "label": "Gamaka I (Sreeram)", "url": "https://www.youtube.com/watch?v=nBAez2kdElo" }
  ]
}
```

The renderer appends a `div.pt-ext-links` below the effect span containing small `↗ label` anchor elements (target `_blank`, `rel="noopener noreferrer"`). The validator checks:
- `ext_links` is an array when present
- Each entry has `label` (non-empty string) and `url` (must begin with `https://`)
- YouTube URLs are permitted; so are Wikipedia, archive.org, and other HTTPS sources

`schema_version` stays at 3 — these are additive optional fields; existing empty_panels.json files without `ext_links` are untouched.

**Coder owns:** 3 lines of renderer change in `_renderItemRow` in `empty_tutorials.js`; 6 lines validator change in `cli.py`.

### B. Tutorial filter interactivity (new Coder feature, no schema change)

When the panel tutorial is visible and the user types in the search bar:
- The chip catalogue filters in-place: rows whose `effect`, chip label, `note_text`, or any `ext_links[].label` contains the query string (case-insensitive) remain visible; others are hidden.
- The cross-panel seeds section does not filter (it is the navigation bar, not search results).
- When the tutorial is dismissed (because a subject is loaded), all rows reset to visible.

This teaches two things simultaneously: (1) the filter bar works, (2) the concepts you care about have anchors in this panel.

Implementation notes for Coder:
- The `oninput` handler on the search bar needs a `IF tutorial is showing` branch before the existing subject-loaded filter logic.
- Use `[data-tutorial-row]` attribute on each chip catalogue row at render time so the filter handler has a clean selector without coupling to CSS class names.
- Debounce at 120ms, same as the existing recording filter.

**Coder owns:** ~20 lines in `empty_tutorials.js` (`_renderInto` renders `data-tutorial-row`, `data-tutorial-text`); ~10 lines in the panel's existing search-bar `oninput` handler.

### C. `chip_heading` on chip_catalogue entries (new optional field)

A `chip_heading` string renders as a `div.pt-cat-section-head` immediately before the chip row. It acts as a visual section divider within the chip catalogue, allowing grouped chips (e.g., the three Manodharma lectures) to carry a shared label without requiring a separate `note` entry:

```json
{
  "chip_heading": "Manodharma I — Three Lectures on Improvisation",
  "example_kind": "demo_row",
  "demo_row": { "type": "lecdem_row", ... }
}
```

Only the **first** chip in a series carries `chip_heading`; subsequent chips in the group have no heading. The validator accepts any non-empty string.

**Coder owns:** 4 lines in `_renderInto`. No validator change needed (field is optional).

### D. Lakshmi Sreeram subject tagging — Librarian workflow (schema pre-exists)

The `subjects` field in `lakshmi_sreeram.json` youtube entries is already schema-valid but empty. Priority tagging order for the Librarian:

| Lecture | Suggested `raga_ids` / `composition_ids` |
|---|---|
| Gamaka I–IV | `raga_ids: ["thodi", "begada", "kalyani"]` (to be verified by watching) |
| Understanding Raga I–III | `raga_ids: ["kharaharapriya", "thodi"]` |
| Mela system / 72 melas / Katapayadi | None needed — leave empty, "discoverable via lecturer" state |
| Tyagaraja and His Many Moods I–II | `musician_ids: ["tyagaraja"]` |
| The Romance of Padam and Javali | No specific ids — lecdem is about form |
| Improvisation: Alapana, Lec 59 | No specific ids |

The Librarian does NOT need to watch all 71 lectures before shipping — the empty-subjects "discoverable via lecturer" state is a first-class invariant (ADR-077). Tags are enrichment, not a gate.

**Librarian owns:** Patch `lakshmi_sreeram.json` subjects fields using `write_cli.py` or `apply_diff`.

### E. `filter_hint` field on panel blocks (new optional field)

A `filter_hint` string is shown as the search bar's placeholder text while the tutorial is visible:

```json
{
  "musician_panel": {
    "filter_hint": "type to filter — try 'concert', 'alapana', or a raga name",
    ...
  }
}
```

When the tutorial is dismissed, the search bar reverts to its default placeholder.

**Coder owns:** 2 lines in `showPanelTutorial` to push the hint into the input placeholder; 2 lines in `_exitHelp` to restore it.

---

## Implementation plan

Phase A — Librarian (no Coder dependency):
1. Replace single Manodharma II Alapana chip in `musician_panel.chip_catalogue` with three chips for Manodharma I Part One/Two/Three. These are `lecdem_row` entries using the existing `Va7kZP434LE`, `iaZJSah3NyE`, `6jMvw76Zprw` video IDs already in `tm_krishna.json`.
2. Replace Seetha Rajan chip in `bani_flow_panel.chip_catalogue` with two Lakshmi Sreeram chips: "Gamaka I" and "Understanding Raga — Part I".
3. Replace the Manodharma II Alapana chip in `bani_flow_panel.chip_catalogue` with a single Lakshmi Sreeram chip (as above is sufficient; the Manodharma teaching belongs in the *musician* panel, not the modal/raga panel).
4. Add Tyagaraja as a fourth musician seed in `bani_flow_panel.cross_panel_seeds`.
5. Update `view_section.raga_note` in both panels to lead with composers, not mela arithmetic.
6. Add `search_note` and `closing_note` language that explicitly invites use of the filter bar.

Phase B — Coder (implements B, C, E from schema decisions above, no data file changes):
1. `ext_links` renderer + validator
2. Tutorial filter interactivity (`data-tutorial-row`, `oninput` branch)
3. `chip_heading` renderer
4. `filter_hint` push/restore hooks

Phase C — Librarian (after Phase B validator lands):
1. Add `ext_links` to existing chip_catalogue entries: Wikipedia for *gamaka*, *alapana*, *manodharma*, *bani*, *rakti*, *mela*, *kriti*.
2. Add `ext_links` for Lakshmi Sreeram lecture anchors on concept chips.
3. Add `filter_hint` fields to both panel blocks.

Phase D — Librarian (ongoing):
1. Tag `lakshmi_sreeram.json` lecdem subjects per the table in Decision D, verified by watching.

---

## Consequences

**Positive:**
- Every term the deck uses becomes audible or readable within one tap.
- Lakshmi Sreeram's 71-lecture curriculum becomes structurally indexed, not just a flat list.
- The filter bar teaches itself through the tutorial state — the user arrives at loaded content already knowing the tool.
- `chip_heading` lets the three-part Manodharma series read as a trilogy, not as three random chips.

**Negative / Trade-offs:**
- Phase B requires Coder work before Phase C ext_links can be deployed. The deck ships Phase A immediately and Phase C waits.
- Subject tagging (Phase D) is open-ended and best done lecture by lecture after the main schema work lands.
- `filter_hint` may conflict with mobile keyboards that already pre-fill the search bar; Coder should test on 390px.

---

## Supersedes / Related

- Extends ADR-086 (empty panel as panel README)
- Extends ADR-087 (cross-panel yin-yang structure)
- Extends ADR-091 (tutorial content validation)
- Extends ADR-077 (lecdem subjects empty-state invariant)
- Informs Phase D subject tagging which feeds ADR-077 discovery surfaces
