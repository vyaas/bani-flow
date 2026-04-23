# ADR-082: Lecdem Entry — `write_cli` Verbs and `entry_forms.js` UX

**Status**: Proposed
**Date**: 2026-04-22
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-031 (data entry forms), ADR-071 (write_cli + entry-form UX for performers), ADR-077 (lecdem schema), ADR-078 (lecdem render indexes)

---

## Context

ADR-077 defines the lecdem schema. ADR-078 defines the indexes. Without an entry surface, neither matters: librarians cannot add lecdems, and the indexes stay empty. Two existing surfaces accept new YouTube data and must learn about lecdems:

1. **`carnatic/write_cli.py add-youtube`** — terminal verb, used during scripted ingestion.
2. **`carnatic/render/templates/entry_forms.js`** — in-browser data entry forms (ADR-031). Specifically, `addYoutubeBlock` constructs the YouTube subsection used by both the new-musician form and the existing-musician form (ADR-071 added performers; this ADR adds the lecdem facet).

The user's framing (scratch.md item 8):

> *"When adding a youtube video via a form, the user should be able to flag it as a lecdem and provide details of which ragas, compositions, and musicians it talks about. Note the plural: it should be possible to assign a number of these. All items should be dropdownable to avoid duplication errors. If the items don't exist they can be manually added by the user. All this should be finally bundled into a json file and parsed by our cli tools so we can inject them appropriately into our final html file."*

The "dropdownable" requirement is the contribution this ADR makes to data quality: every subject id must come from an existing entity, never from free text. Manual addition of a missing subject must be possible, but it must happen *as the explicit creation of a new entity* (a new raga form, etc.) — not as a free-text fallback inside the lecdem form. Free-text would silently re-introduce typos and orphan ids of the kind ADR-077's invariant D forbids.

### Forces

| Force | Direction |
|---|---|
| **Two equal surfaces** | CLI and in-browser form must reach feature parity for lecdem entry; neither may be the only path. |
| **Combobox-only subject pickers** | Every subject id is selected from an existing entity list. No free-text. ADR-077 invariant D depends on this at the entry boundary. |
| **Repeatable per axis** | Each subject axis (raga / composition / musician) accepts zero or more entries via an "+ Add" repeating row pattern (same pattern as ADR-031's edges section). |
| **Mode toggle, not a new form** | A lecdem is a flavour of YouTube entry, not a new form type. The lecdem facet is exposed via a single checkbox/toggle inside the existing YouTube block. |
| **Mode-driven field gating** | Toggling lecdem ON: (a) reveals the three subject sections, (b) hides `composition_id` and `raga_id` (the recital-track primary refs that ADR-077 forbids on lecdems), (c) keeps `year`, `version`, `performers` available. Toggling OFF: inverse. |
| **Diff-minimality** | A non-lecdem entry MUST serialise without `kind` or `subjects` keys (back-compat invariant from ADR-077). The form omits these keys when the toggle is off. |
| **Missing-entity escape hatch is structural** | If a subject entity does not yet exist, the user must add it through its own form (ADR-031 add-raga, add-composition, add-musician forms). The lecdem form surfaces this clearly via an "Entity not found? Add a new one" link that opens the relevant form in a new floating window. |
| **Validator-clean output** | The form's generated JSON must always pass `python3 carnatic/cli.py validate`. Any combination of toggled state + subject choices that would fail validation is prevented at the form level (button disabled, helper text visible). |

---

## Pattern

**Boundary as Filter** (continued from ADR-077). The form is the entry boundary. Combobox-only inputs and toggle-driven field gating prevent invalid states from crossing into storage.

**Light on Two Sides** (Pattern 159). Each subject row is illuminated by two facts: the entity's display name (in the combobox label) and its id (the JSON value). The combobox shows both; the form stores only the id.

**Strong Centres of unequal frequency** (recurring). Lecdem entry is rare — the form must not push lecdem fields into the foreground for the 95% of recital additions. The toggle is the smallest possible affordance that introduces the entire lecdem subsystem only when invoked.

---

## Decision

### 1 — `write_cli.py` changes

#### 1a — Extend `add-youtube` with `--lecdem` and three repeatable subject flags

```bash
python3 carnatic/write_cli.py add-youtube \
  --musician-id tm_krishna \
  --url https://youtu.be/lecdem8888 \
  --label "Lec-dem: commonality of Surutti, Kedaragowla, Narayana Gowla — TM Krishna" \
  --lecdem \
  --about-raga surutti \
  --about-raga kedaragowla \
  --about-raga narayana_gowla
```

Flags:

- `--lecdem` (boolean): sets `kind: "lecdem"` on the new entry.
- `--about-raga <raga_id>` (repeatable): appends to `subjects.raga_ids[]`.
- `--about-composition <composition_id>` (repeatable): appends to `subjects.composition_ids[]`.
- `--about-musician <musician_id>` (repeatable): appends to `subjects.musician_ids[]`.

Behaviour:

1. If `--lecdem` is **not** present, all `--about-*` flags are rejected with an error: lecdem subjects make sense only on lecdem entries.
2. If `--lecdem` is present:
   - `--composition-id` and `--raga-id` are rejected (ADR-077 invariant: lecdems carry `subjects`, not primary refs).
   - Every `--about-raga` id MUST resolve in `ragas/`; every `--about-composition` MUST resolve in `compositions/`; every `--about-musician` MUST resolve in `musicians/`. Unknown ids cause an error with a helpful "Did you mean …?" suggestion drawn from the existing fuzzy-match used by `musician-exists`.
   - The entry is written with `kind: "lecdem"` and `subjects: { raga_ids: [...], composition_ids: [...], musician_ids: [...] }` — all three arrays present even if empty (per ADR-077 invariant B).
3. If `--lecdem` is present with zero `--about-*` flags, the entry is written with `kind: "lecdem"` and three empty arrays (the "Manodharma" case — ADR-077 invariant C).

#### 1b — New verb `add-lecdem-subject` for incremental enrichment

```bash
python3 carnatic/write_cli.py add-lecdem-subject \
  --musician-id tm_krishna \
  --url https://youtu.be/lecdem8888 \
  --about-raga kedaragowla
```

Locates the lecdem entry by host + extracted video_id; appends the subject id to the relevant array (or skips with `[SKIP]` if already present). Errors out if the entry is not a lecdem (`kind !== "lecdem"`) or the subject id does not resolve.

This verb mirrors the `add-youtube-performer` precedent from ADR-071: a sharp tool for after-the-fact corrections without forcing a full re-add.

### 2 — `entry_forms.js` changes

#### 2a — The lecdem toggle inside `addYoutubeBlock`

A single checkbox is added to the top of every YouTube block (in both the new-musician and existing-musician forms):

```
┌─ YouTube Entry ───────────────────────────────×┐
│ ☐ This is a lecture-demonstration              │  ← NEW (the lecdem toggle)
│                                                │
│ URL:        [____________________]             │
│ Label:      [____________________]             │
│                                                │
│ ── recital fields (hidden when lecdem ON) ──   │
│ Composition:[combobox ▾]                       │
│ Raga:       [combobox ▾]                       │
│                                                │
│ ── shared fields (always visible) ───────────  │
│ Year:       [____]   Version: [______]         │
│ Performers: [+ Add performer]                  │  ← existing (ADR-071)
│                                                │
│ ── lecdem fields (visible only when lecdem ON)─│
│ Subjects — Ragas:        [+ Add raga]          │
│   • [raga combobox ▾] [×]                      │
│ Subjects — Compositions: [+ Add composition]   │
│   • [composition combobox ▾] [×]               │
│ Subjects — Musicians:    [+ Add musician]      │
│   • [musician combobox ▾] [×]                  │
│                                                │
│ ⓘ Entity missing? [Add a new raga →]            │
│   [Add a new composition →] [Add a new musician →] │
└────────────────────────────────────────────────┘
```

#### 2b — Toggle behaviour

When the checkbox is unchecked:
- Recital fields visible (`composition_id`, `raga_id` comboboxes).
- Subject sections hidden.
- Generated JSON: omits `kind` and `subjects` entirely (recital track, ADR-077 invariant A).

When the checkbox is checked:
- Recital fields hidden and their values cleared from the working state.
- Subject sections revealed; each subject section starts collapsed with no rows.
- Generated JSON: `kind: "lecdem"` plus `subjects: { raga_ids: [...], composition_ids: [...], musician_ids: [...] }` with arrays populated from the rows. Empty arrays are emitted as `[]`, not omitted.
- The "Entity missing? Add a new …" footer becomes visible.

#### 2c — Subject row pattern

Each subject section uses the same repeating-row UI as the edges section in ADR-031: a header with `[+ Add raga]` button, a list of rows, each row containing one combobox (`efCombobox` from ADR-071, fed by `graphData.ragas` / `graphData.compositions` / `graphData.nodes` for the three sections respectively) and a delete `[×]`.

The combobox is the *only* input: free-text typing into the field filters the dropdown but does not commit a free-text value. If the user types a label that has no exact match, the row's "valid" state remains false until they pick a result.

#### 2d — "Add a new entity" escape hatch

Each "Add a new …" link opens the corresponding entity form (Add Raga, Add Composition, Add Musician) in a new floating window per ADR-031's window pattern. The lecdem form remains open. After the user generates and downloads the new entity's JSON, they refresh the lecdem form's combobox source (a "Refresh entity list" affordance, or simply re-opening the section) to make the new entity selectable.

This deliberately makes adding a missing entity *more* work than typing free text would. The friction is the point — it ensures that subjects entering the graph are entities the librarian has consciously created.

#### 2e — Validation in the form

The Download button is disabled when:
- `--lecdem` is checked AND `composition_id` or `raga_id` is set (impossible if §2b clears them on toggle, but defensive).
- Any subject row has an empty combobox value.
- (Existing rules from ADR-031 / ADR-071 continue to apply.)

A lecdem with zero subject rows is valid (the "Manodharma" case); the Download button stays enabled.

#### 2f — Generated JSON shape

A lecdem entry with subjects:

```jsonc
{
  "url": "https://youtu.be/lecdem8888",
  "label": "Lec-dem: commonality of Surutti, Kedaragowla, Narayana Gowla — TM Krishna",
  "kind": "lecdem",
  "subjects": {
    "raga_ids":        ["surutti", "kedaragowla", "narayana_gowla"],
    "composition_ids": [],
    "musician_ids":    []
  },
  "year": 2018
}
```

A non-lecdem entry remains exactly as today (no `kind`, no `subjects`).

### 3 — Single-source vocabulary

The `kind` discriminator is consumed by both surfaces:

- **Python (CLI)**: `from carnatic.render.youtube_kinds import YOUTUBE_KINDS` (introduced in ADR-077). The `--lecdem` flag maps to `kind = "lecdem"`. Future `--tani` etc. flags follow the same pattern.
- **JS (form)**: `window.YOUTUBE_KINDS` (introduced in ADR-077). The toggle currently reads/writes `"lecdem"`; future toggles or a select control could expose more kinds without form-shape change.

### 4 — Combobox data sources (already loaded)

The forms already have access to `graphData.nodes`, `graphData.ragas`, `graphData.compositions` (ADR-031). No new globals are introduced for the subject pickers. The combobox utility (`efCombobox`, ADR-071) handles search/filter/selection.

---

## Consequences

### Positive

- **Two equal surfaces, identical semantics**: a lecdem entered via `write_cli` and a lecdem entered via the form produce byte-equivalent JSON.
- **Combobox-only inputs eliminate the typo failure mode**: ADR-077 invariant D is enforced at the entry boundary, not just at the validator. No lecdem can reach the JSON file with an unresolvable subject id.
- **Toggle-driven field gating prevents the recital/lecdem confusion**: a user cannot accidentally save a lecdem with `composition_id` populated; the field is invisible while the toggle is on.
- **The "Manodharma" case is first-class in the UX too**: the toggle plus zero subject rows is a complete and valid state. The user does not have to invent a workaround to express "this is about everything and nothing in particular".
- **Missing-entity escape hatch reinforces graph hygiene**: the friction of opening a new form to add a missing raga is small but deliberate; it ensures every subject the librarian references already exists as a fully sourced node.

### Negative / accepted tradeoffs

- **The YouTube block grows in vertical extent when the toggle is on**: three subject sections plus the missing-entity footer add ~150–200px of form. Acceptable — lecdems are rare entries; when the user is making one, the additional space is exactly what they want to see.
- **No bulk-import path for lecdems**: each lecdem must be added one at a time, either via CLI invocation or via one form submission. Acceptable for the expected volume (tens of lecdems across the corpus, not thousands).
- **The user must refresh the combobox after adding a new entity in a side window**: a small workflow seam. Could be eliminated with reactive data-store wiring in a future ADR; out of scope here.

### Risks

- **A librarian unaware of ADR-077 invariant D might interpret an "Did you mean …?" suggestion from the CLI as a soft warning** and accept a near-miss id. Mitigated by the CLI rejecting unresolved ids outright (no proceed-with-warning option).
- **The toggle position at the top of the YouTube block** could be missed by a librarian doing rapid recital ingestion. Mitigated by the checkbox being unchecked by default — the worst case is that they see fields they don't care about and move on. They never accidentally produce a lecdem.

---

## Implementation

1. **`carnatic/render/youtube_kinds.py`** and **`carnatic/render/templates/youtube_kinds.js`** (Coder)
   - Created by ADR-077 work; this ADR consumes them.

2. **`carnatic/write_cli.py`** (Coder)
   - Extend `add-youtube` argparse: add `--lecdem`, `--about-raga` (repeatable), `--about-composition` (repeatable), `--about-musician` (repeatable).
   - Implement the validation rules from §1a (mutual exclusion with `--composition-id`/`--raga-id`; resolvability of all subject ids; "Did you mean" suggestions on miss).
   - Add new verb `add-lecdem-subject` per §1b.
   - When writing, ensure `subjects` is always serialised with all three array keys present (even if empty) on lecdem entries.

3. **`carnatic/render/templates/entry_forms.js`** (Coder)
   - In `addYoutubeBlock`: prepend the lecdem toggle checkbox per §2a.
   - Wire show/hide gating per §2b (toggle handler clears recital field values when switching ON, clears subject rows when switching OFF).
   - Add three repeating-row subject sections per §2c, each backed by an `efCombobox`.
   - Add the "Add a new …" footer links per §2d, opening the existing add-raga / add-composition / add-musician forms in cascading floating windows.
   - Update the JSON-generation function to emit `kind: "lecdem"` + `subjects: {...}` only when the toggle is on, and to omit `composition_id` / `raga_id` from the emitted entry when the toggle is on.
   - Update the Download-button enable/disable logic per §2e.

4. **Documentation** (Coder)
   - Update `carnatic/data/musicians/READYOU.md` (where ADR-077 also documents the schema) with the new CLI invocation example.
   - Update `carnatic/.clinerules` "Write CLI Tools" section with the new flags and verb.

5. **Verification**
   - CLI: `add-youtube --lecdem --about-raga surutti --about-raga kedaragowla …` produces a lecdem entry that passes `validate`.
   - CLI: `add-youtube --lecdem --composition-id endaro_mahanubhavulu …` errors out with "—lecdem and —composition-id are mutually exclusive".
   - CLI: `add-youtube --about-raga surutti …` (without `--lecdem`) errors out with "—about-* requires —lecdem".
   - Form: toggling the lecdem checkbox shows/hides the correct field groups; previewed JSON updates accordingly.
   - Form: adding three raga subjects produces the expected JSON; downloading and dropping the file under `musicians/{id}.json`, then running `bani-render`, surfaces the lecdem in the right musician panel (per ADR-080) and on the bani-flow strip for each subject raga (per ADR-081).
   - Form: the Download button stays disabled while any subject row has an unselected combobox.
   - End-to-end: `python3 carnatic/cli.py validate` exits 0 after each of the above scenarios.
