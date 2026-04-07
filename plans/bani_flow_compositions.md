# Plan: Bani Flow — Compositions, Ragas, and Sonic Lineage

<!-- version: 1.1 — last updated 2026-04-07 -->

## The Core Insight

The current graph answers: *who taught whom?*
The new layer answers: *how did the sound travel?*

A bani is not just a lineage of names — it is a **sonic inheritance**. The same composition rendered by Semmangudi, then by Ramnad Krishnan, then by TM Krishna reveals how a raga's contours, gamakas, and sangatis mutate (or hold) across generations. That is the acoustic experience we want to make navigable.

The mechanism: **YouTube recordings tagged against both a composition and a raga**, cross-referenced to the musician node. Click a composition → see every artist who has rendered it, lit up on the lineage graph. Click a raga → same. Follow the bani by listening across generations.

---

## User Decisions (confirmed)

| Question | Answer |
|---|---|
| Seed compositions scope | Start with the **Pancharatna Kritis** (5 Tyagaraja compositions) |
| Sindhu Bhairavi vs Bhairavi | **Separate raga entries** — they are technically distinct ragas |
| Composers not in lineage graph | Appear as **non-interactive labels** in the listening trail (keeps us learning) |
| Listening trail sort order | **Recording year first**; fall back to musician `born` year when recording year is unavailable |

---

## What We Are Building

Five deliverables:

1. **[`carnatic/data/compositions.json`](carnatic/data/compositions.json)** — ground truth for ragas, composers, compositions
2. **Extended YouTube recording objects** in [`musicians.json`](carnatic/data/musicians.json) — each entry gains optional `composition_id`, `raga_id`, `year` fields
3. **[`render.py`](carnatic/render.py) extension** — loads `compositions.json`, builds lookup tables, injects into HTML
4. **Bani Flow panel in [`graph.html`](carnatic/graph.html)** — filter UI, chronological listening trail, highlight logic
5. **Rules-file updates** — [`carnatic/.clinerules`](carnatic/.clinerules), [`.roomodes`](/.roomodes), [`carnatic/data/READYOU.md`](carnatic/data/READYOU.md) — all three must know about `compositions.json` and Workflow D

---

## Data Model

### `compositions.json` — top-level structure

```json
{
  "ragas": [ ... ],
  "composers": [ ... ],
  "compositions": [ ... ]
}
```

Three arrays, cross-referenced by `id`. All IDs are `snake_case`, permanent once set.

---

### Raga object

```json
{
  "id": "sri",
  "name": "Sri",
  "aliases": [],
  "melakarta": null,
  "parent_raga": null,
  "wikipedia": "https://en.wikipedia.org/wiki/Sri_(raga)",
  "notes": "Janya of Kharaharapriya; associated with grandeur and devotion"
}
```

| field | type | notes |
|---|---|---|
| `id` | string | snake_case, permanent |
| `name` | string | canonical name |
| `aliases` | array of strings | alternate spellings / names |
| `melakarta` | int \| null | melakarta number (1–72) if applicable |
| `parent_raga` | string \| null | id of parent raga if janya |
| `wikipedia` | string \| null | Wikipedia URL |
| `notes` | string | free-text musicological note |

**Bhairavi and Sindhu Bhairavi are separate entries** — they are distinct ragas with different arohanam/avarohanam and different emotional registers.

---

### Composer object

```json
{
  "id": "tyagaraja",
  "name": "Tyagaraja",
  "musician_node_id": "tyagaraja",
  "born": 1767,
  "died": 1847,
  "wikipedia": "https://en.wikipedia.org/wiki/Tyagaraja"
}
```

| field | type | notes |
|---|---|---|
| `id` | string | snake_case, permanent |
| `name` | string | canonical name |
| `musician_node_id` | string \| null | links to a node in `musicians.json` if the composer is also in the lineage graph; `null` for composers who are not lineage nodes |
| `born` / `died` | int \| null | year only |
| `wikipedia` | string | Wikipedia URL |

The `musician_node_id` bridge is important: Tyagaraja, Dikshitar, and Shyama Shastri are both composers and lineage nodes. Composers like Papanasam Sivan or Gopalakrishna Bharati may be composers only.

---

### Composition object

```json
{
  "id": "entharo_mahanubhavulu",
  "title": "Entharo Mahanubhavulu",
  "composer_id": "tyagaraja",
  "raga_id": "sri",
  "tala": "adi",
  "language": "telugu",
  "wikipedia": "https://en.wikipedia.org/wiki/Endaro_Mahanubhavulu",
  "notes": "Pancharatna kriti; considered the crown jewel of the Tyagaraja corpus"
}
```

| field | type | notes |
|---|---|---|
| `id` | string | snake_case, permanent |
| `title` | string | canonical title |
| `composer_id` | string | references `composers[].id` |
| `raga_id` | string | references `ragas[].id` |
| `tala` | string | e.g. `adi`, `rupaka`, `misra_chapu` |
| `language` | string | `telugu`, `sanskrit`, `tamil`, `kannada` |
| `wikipedia` | string \| null | Wikipedia URL if article exists |
| `notes` | string | free-text musicological note |

---

### Extended YouTube recording object (in `musicians.json`)

**Existing format** (still valid — backward-compatible):
```json
{
  "url": "https://youtu.be/XXXXXXXXXXX",
  "label": "Raga name — context / year / event"
}
```

**Extended format** (new fields are all optional):
```json
{
  "url": "https://youtu.be/XXXXXXXXXXX",
  "label": "Entharo Mahanubhavulu · Sri · Adi — TM Krishna, Music Academy 2019",
  "composition_id": "entharo_mahanubhavulu",
  "raga_id": "sri",
  "year": 2019
}
```

| new field | type | notes |
|---|---|---|
| `composition_id` | string \| null | references `compositions[].id`; omit for alapana/RTP/unidentified |
| `raga_id` | string \| null | references `ragas[].id`; can be set without `composition_id` (e.g. an alapana) |
| `year` | int \| null | year of the recording; used for chronological sort in the listening trail |

**Sort priority in the listening trail**: `year` (recording year) → `born` (musician birth year) → label alphabetical. This matches the user's preference: actual historical sequence of the recording first, birth year as fallback when recording year is unknown.

---

## Seed Data — Pancharatna Kritis

The five Pancharatna Kritis of Tyagaraja are the mandatory seed. Every vocalist in the graph has rendered at least one. They span five ragas, giving immediate cross-raga coverage.

| composition_id | title | raga_id | tala |
|---|---|---|---|
| `jagadananda_karaka` | Jagadananda Karaka | `nata` | `adi` |
| `dudukugala` | Dudukugala | `gowla` | `adi` |
| `sadhinchane` | Sadhinchane | `arabhi` | `adi` |
| `kana_kana_ruchira` | Kana Kana Ruchira | `varali` | `adi` |
| `entharo_mahanubhavulu` | Entharo Mahanubhavulu | `sri` | `adi` |

Seed ragas needed: `nata`, `gowla`, `arabhi`, `varali`, `sri` — plus the most-recorded ragas for tagging existing recordings: `todi`, `bhairavi`, `sindhu_bhairavi`, `kalyani`, `shankarabharanam`, `kambhoji`, `begada`, `saveri`, `kedaram`, `natabhairavi`.

---

## Visualization Design

### New UI element: Bani Flow panel

A collapsible panel in the sidebar (below the existing Era/Instrument legends) with two searchable `<select>` dropdowns:

- **Filter by Composition** — lists only compositions that have ≥1 tagged recording in the dataset
- **Filter by Raga** — lists only ragas that have ≥1 tagged recording

When a composition or raga is selected:

1. All musician nodes **without** a matching recording are dimmed (`.faded`, opacity 0.12 — same as existing neighbourhood highlight)
2. All musician nodes **with** a matching recording get a distinct **teal border** (new CSS class `.bani-match`, color `#83a598`)
3. Lineage edges **between** matched nodes are highlighted (gold, same as `.highlighted`)
4. The sidebar shows a **chronological listening trail**: recordings sorted by `year` (then `born`), each row showing:
   - Artist name (clickable — selects that node in the graph)
   - Recording label
   - ▶ play button (loads into the floating media player)
   - Year badge (if `year` is set)
5. If the composition has a known composer who is **not** a lineage node, the composer appears as a non-interactive label at the top of the trail (e.g. "Composed by Tyagaraja · Sri · Adi")
6. Clicking background or "Clear" resets the filter

### Interaction flow

```
User selects composition "Entharo Mahanubhavulu"
        │
        ▼
JS queries: which musician nodes have a youtube entry
with composition_id == "entharo_mahanubhavulu"?
        │
        ▼
Matched nodes: [semmangudi, ramnad_krishnan, tm_krishna, ...]
        │
        ├─► Dim all non-matching nodes + edges (.faded)
        ├─► Highlight matching nodes (teal border .bani-match)
        ├─► Highlight edges between matching nodes (gold .highlighted)
        └─► Sidebar listening trail (sorted by year, then born):
              ┌─────────────────────────────────────────────┐
              │ Composed by Tyagaraja · Sri · Adi           │
              │ ─────────────────────────────────────────── │
              │ 1966  Semmangudi  ▶  Music Academy 1966     │
              │ 1967  Ramnad Krishnan  ▶  Wesleyan 1967     │
              │ 2019  TM Krishna  ▶  Music Academy 2019     │
              └─────────────────────────────────────────────┘
```

### Raga filter — broader net

A raga filter catches both:
- Compositions in that raga (tagged via `composition_id` → `raga_id`)
- Standalone alapana/RTP recordings tagged directly with `raga_id` (no `composition_id`)

This is essential: an RTP has no fixed composition. Tagging it with just `raga_id` is correct and sufficient.

---

## `render.py` Changes

[`render.py`](carnatic/render.py) currently reads only `musicians.json`. Extensions needed:

1. Load `compositions.json` if it exists (graceful fallback: empty `{ragas:[], composers:[], compositions:[]}` if absent — the graph still works)
2. Build two lookup dicts:
   - `composition_to_nodes`: `{composition_id: [node_id, ...]}`
   - `raga_to_nodes`: `{raga_id: [node_id, ...]}`
   These are injected into the HTML as JS constants alongside `elements`
3. Inject `ragas`, `composers`, `compositions` arrays as JS constants for the dropdown population
4. The Bani Flow dropdowns are populated client-side from these constants, filtered to only show entries that appear in the lookup dicts (i.e. have at least one tagged recording)

---

## Rules-File Updates

This is the critical new requirement. All three rules files must be updated to know about `compositions.json` and Workflow D.

### [`carnatic/.clinerules`](carnatic/.clinerules) — changes needed

1. **Project layout** section: add `data/compositions.json` entry
2. **Session startup** section: add "Read `data/compositions.json` before doing anything composition/raga-related"
3. **Core workflow** section: add step for tagging recordings with `composition_id`/`raga_id`
4. **Adding YouTube recordings** section: extend with composition/raga tagging logic
5. **Data model quick reference**: add extended youtube recording fields (`composition_id`, `raga_id`, `year`) and compositions.json schema summary
6. **New section: Adding compositions/ragas**: rules for when to add to `compositions.json`

### [`.roomodes`](/.roomodes) — changes needed

The Librarian's `roleDefinition` and `customInstructions` currently reference only `musicians.json`. Updates:

1. **`roleDefinition`**: expand domain to include `carnatic/data/compositions.json`; add `[COMP+]`, `[RAGA+]`, `[YOUTUBE~]` to the change log vocabulary
2. **`customInstructions`**: 
   - Session startup: also read `compositions.json`
   - Add full schema for `compositions.json` (ragas, composers, compositions objects)
   - Add extended youtube recording object schema (`composition_id`, `raga_id`, `year`)
   - Add **Workflow D — Tagging recordings with composition and raga**
   - Add **Workflow E — Adding compositions and ragas to compositions.json**
   - Update hard constraints to include `compositions.json` rules

### [`carnatic/data/READYOU.md`](carnatic/data/READYOU.md) — changes needed

This file travels with the data for non-Roo AI sessions (e.g. Claude.ai, ChatGPT). Updates:

1. **Preamble**: update to mention both `musicians.json` and `compositions.json`
2. **Schema reference**: add `compositions.json` schema (ragas, composers, compositions); add extended youtube recording fields
3. **Workflow D — Tagging recordings**: step-by-step for adding `composition_id`/`raga_id`/`year` to existing youtube entries
4. **Workflow E — Adding to compositions.json**: when and how to add new ragas, composers, compositions
5. **Output contract**: add `[COMP+]`, `[RAGA+]`, `[YOUTUBE~]` to the change log prefix vocabulary
6. **Hard constraints**: add prohibitions specific to `compositions.json` (no raga without Wikipedia URL or explicit musicological source; no composition without a verified `composer_id` and `raga_id`)

---

## File Layout After Implementation

```
carnatic/
  data/
    musicians.json        ← extended: youtube entries gain optional composition_id, raga_id, year
    compositions.json     ← NEW: ragas[], composers[], compositions[]
    READYOU.md            ← updated: Workflow D + E, extended schema
  render.py               ← extended: loads compositions.json, injects lookup tables + arrays
  graph.html              ← extended: Bani Flow panel, filter logic, listening trail
  .clinerules             ← updated: compositions.json layout, Workflow D rules
.roomodes                 ← updated: Librarian domain expanded, Workflow D + E in customInstructions
```

---

## Implementation Order

Each step is independently deployable. Steps 1–2 are pure data work (no code). Step 3 is a small Python change. Step 4 is the main frontend work. Step 5 is rules/docs.

### Step 1 — Create `compositions.json` with seed data
- Pancharatna Kritis (5 compositions)
- ~15 most-recorded ragas (Todi, Bhairavi, Sindhu Bhairavi, Kalyani, Shankarabharanam, Kambhoji, Begada, Saveri, Kedaram, Natabhairavi, Nata, Gowla, Arabhi, Varali, Sri)
- Trinity as composers (all three already in `musicians.json` → `musician_node_id` set)

### Step 2 — Retroactively tag existing recordings in `musicians.json`
- Scan all existing `youtube[]` entries; where the `label` text identifies a raga or composition, add `raga_id` and/or `composition_id`
- Add `year` where the label contains a year
- Most current labels are rich enough: "Music Academy, Madras · December Season 1966" → `year: 1966`

### Step 3 — Extend `render.py`
- Load `compositions.json` (with graceful fallback)
- Build `composition_to_nodes` and `raga_to_nodes` lookup dicts
- Inject `ragas`, `composers`, `compositions`, `compositionToNodes`, `ragaToNodes` as JS constants

### Step 4 — Bani Flow panel in `graph.html`
- New sidebar section: two `<select>` dropdowns (Composition, Raga)
- Filter logic: dim/highlight nodes and edges
- Chronological listening trail with composer non-interactive label at top
- New CSS class `.bani-match` (teal border `#83a598`)
- "Clear filter" button

### Step 5 — Update rules files
- [`carnatic/.clinerules`](carnatic/.clinerules): layout, workflow, data model
- [`.roomodes`](/.roomodes): Librarian roleDefinition + customInstructions
- [`carnatic/data/READYOU.md`](carnatic/data/READYOU.md): Workflow D + E, schema, output contract

---

## What This Does NOT Do (yet)

- **Raga detail pages** — browsable arohanam/avarohanam, characteristic phrases, related ragas. The `notes` field is a placeholder.
- **Composition detail pages** — lyrics, translations, musicological analysis.
- **Automatic YouTube metadata fetching** — still requires human annotation. The AI agent parses titles; it does not call the YouTube API.
- **Audio analysis** — comparing gamakas across renditions. Far future.
- **Multiple ragas per recording** — an RTP may modulate through several ragas. For now, tag the primary/announced raga only.

---

## Change Log Prefix Vocabulary (extended)

| prefix | meaning |
|---|---|
| `[NODE+]` | new musician node added |
| `[EDGE+]` | new lineage edge added |
| `[EDGE-]` | lineage edge removed |
| `[EDGE~]` | lineage edge modified |
| `[YOUTUBE+]` | new recording appended to a node |
| `[YOUTUBE~]` | existing recording tagged with composition_id / raga_id / year |
| `[COMP+]` | new composition added to compositions.json |
| `[RAGA+]` | new raga added to compositions.json |
| `[COMPOSER+]` | new composer added to compositions.json |
| `[FLAG]` | unresolved item requiring user decision |
