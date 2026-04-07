# READYOU.md — Instructions for the AI receiving this file

You have received two files:

- **`musicians.json`** — the canonical data file for a Carnatic classical music
  guru-shishya (teacher-student) lineage knowledge graph.
- **`compositions.json`** — the companion file for ragas, composers, and compositions,
  used to power the Bani Flow listening trail in the graph visualisation.
- **This file** — your operating instructions.

Read all three before doing anything. Then wait for the user's instruction.

The governing principle of this dataset is **significance over completeness**.
A musician belongs here if they materially shaped the sound, transmission, or
scholarship of the Carnatic tradition. Fringe or obscure figures are excluded
unless they are a necessary topological link between two significant nodes.

---

## musicians.json structure

The file has two top-level arrays: `nodes` and `edges`.

### Node fields

| field | type | meaning |
|---|---|---|
| `id` | string | Snake_case unique key. **Never rename once set.** |
| `label` | string | Display name as the musician is commonly known. |
| `wikipedia` | string | Canonical Wikipedia URL for this musician. |
| `born` | int \| null | Birth year only. `null` if unknown. |
| `died` | int \| null | Death year only. `null` if living or unknown. |
| `era` | enum | See Era vocabulary below. |
| `instrument` | enum | See Instrument vocabulary below. |
| `bani` | string | Stylistic school / lineage label. Free text. |
| `youtube` | array | List of extended recording objects. May be empty `[]`. |

### YouTube recording object (extended)

```json
{
  "url":            "https://youtu.be/XXXXXXXXXXX",
  "label":          "Composition · Raga · Tala — Artist, Event Year",
  "composition_id": "entharo_mahanubhavulu",
  "raga_id":        "sri",
  "year":           2019
}
```

The `composition_id`, `raga_id`, and `year` fields are **optional** but should be
set whenever identifiable from the title or metadata. They reference IDs in
`compositions.json`. The old `{url, label}` format remains valid for recordings
where raga/composition cannot be identified.

Any YouTube URL form is valid: `watch?v=`, `youtu.be/`, `embed/`. The 11-character
video ID is what matters.

### Edge fields

| field | type | meaning |
|---|---|---|
| `source` | node id | The **guru** (teacher). |
| `target` | node id | The **shishya** (student). |
| `confidence` | float 0–1 | How well-sourced is this relationship. |
| `source_url` | string | URL where this relationship is explicitly stated. |
| `note` | string | Optional qualifier on the nature of the relationship. |

### Era vocabulary

| value | meaning |
|---|---|
| `trinity` | The three 18th-century composer-saints (Tyagaraja, Dikshitar, Shyama Shastri). |
| `bridge` | 19th–early 20th century figures connecting the Trinity to the modern tradition. |
| `golden_age` | Architects of the modern concert format (~1890–1950). |
| `disseminator` | Mid-20th century figures who carried the tradition outward. |
| `living_pillars` | Active or recently deceased figures who defined contemporary practice. |
| `contemporary` | Active musicians defining the current era. |

### Instrument vocabulary

`vocal`, `veena`, `violin`, `flute`, `mridangam`, `bharatanatyam`

New values may be added freely — each gets a distinct visual shape in the graph.

### Confidence scale

| range | meaning |
|---|---|
| 0.95–1.0 | Explicitly stated in Wikipedia infobox or unambiguous prose. |
| 0.85–0.94 | Clearly implied; cross-confirmed across multiple pages. |
| 0.70–0.84 | Single prose source, or confirmed 2-hop lineage. |
| below 0.70 | Speculative — must carry a `note` explaining the uncertainty. |

---

## compositions.json structure

Three top-level arrays: `ragas`, `composers`, `compositions`. All IDs are
`snake_case` and **permanent once set**.

### Raga object

```json
{
  "id":          "sri",
  "name":        "Sri",
  "aliases":     [],
  "melakarta":   null,
  "parent_raga": null,
  "wikipedia":   "https://en.wikipedia.org/wiki/Sri_(raga)",
  "notes":       "Janya of Kharaharapriya; associated with grandeur and devotion"
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

**Bhairavi and Sindhu Bhairavi are separate entries** — they are distinct ragas
with different arohanam/avarohanam and different emotional registers.

### Composer object

```json
{
  "id":               "tyagaraja",
  "name":             "Tyagaraja",
  "musician_node_id": "tyagaraja",
  "born":             1767,
  "died":             1847,
  "wikipedia":        "https://en.wikipedia.org/wiki/Tyagaraja"
}
```

| field | type | notes |
|---|---|---|
| `id` | string | snake_case, permanent |
| `name` | string | canonical name |
| `musician_node_id` | string \| null | links to a node in `musicians.json` if the composer is also a lineage node; `null` otherwise |
| `born` / `died` | int \| null | year only |
| `wikipedia` | string | Wikipedia URL |

### Composition object

```json
{
  "id":          "entharo_mahanubhavulu",
  "title":       "Entharo Mahanubhavulu",
  "composer_id": "tyagaraja",
  "raga_id":     "sri",
  "tala":        "adi",
  "language":    "telugu",
  "wikipedia":   "https://en.wikipedia.org/wiki/Endaro_Mahanubhavulu",
  "notes":       "Pancharatna kriti; considered the crown jewel of the Tyagaraja corpus"
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

## Workflow A — Adding YouTube recordings

Use this workflow when the user provides YouTube links with title/metadata.

**Step 1 — Parse artist names.**
Extract every performer name from the video title.

**Step 2 — Match to existing nodes.**
Compare against all `label` fields. Handle variants (initials, short names,
spelling differences). If ambiguous, flag and ask.

**Step 3 — Extract the video ID.**
Pull the 11-character video ID from the URL.

**Step 4 — Construct the label.**
`"Composition · Raga · Tala — Artist, Event Year"` or similar concise form.

**Step 5 — Check for duplicates.**
Skip if the same video ID already exists in the node's `youtube` array.

**Step 6 — Tag composition, raga, year.**
Identify `composition_id` and `raga_id` from the title. Cross-reference
`compositions.json`. If the raga or composition is not yet there, add it
(Workflow E) before appending the recording.
Extract `year` from the label if present (e.g. "Music Academy 1966" → `year: 1966`).

**Step 7 — Append.**
Add the extended `{url, label, composition_id, raga_id, year}` object to the
`youtube` array of each matched node.

**Step 8 — Handle unmatched artists.**
Flag explicitly in the change log. Do not silently drop. Do not create new nodes
without the user's instruction.

---

## Workflow B — Wikipedia parsing

**Step 1** — Extract lineage from infobox `teacher`/`students` and prose patterns.
**Step 2** — Check for name-variant collisions before creating any new node.
**Step 3** — Assess significance (Sangeetha Kalanidhi, trains existing node, necessary topological link).
**Step 4** — Assess relationship type; use `note` to qualify (`"first guru"`, `"principal guru"`, etc.).
**Step 5** — Do not infer edges from shared `bani`.
**Step 6** — Propose and apply changes with change log.

---

## Workflow C — Verbal corrections

Apply the change exactly as instructed. Log it with the appropriate prefix.
Return the full updated JSON.

---

## Workflow D — Tagging recordings with composition and raga

Use this workflow when adding `composition_id`, `raga_id`, or `year` to existing
youtube entries that currently only have `url` and `label`.

**Step 1** — Identify the recording's composition from the label text.

**Step 2** — Look up the composition in `compositions.json`. If not present,
add it (Workflow E) first.

**Step 3** — Look up the raga in `compositions.json`. If not present, add it
(Workflow E) first.

**Step 4** — Extract the year from the label if present.

**Step 5** — Apply `[YOUTUBE~]` patch: add `composition_id`, `raga_id`, and/or
`year` to the existing entry. Do not change `url` or `label`.

**Step 6** — After all patches, remind the user to run `python3 carnatic/render.py`
to rebuild the lookup tables and regenerate `graph.html`.

**Sort priority in the listening trail:** `year` (recording year) →
`born` (musician birth year) → label alphabetical.

---

## Workflow E — Adding to compositions.json

**Adding a raga:**
- Require a Wikipedia URL. No Wikipedia page = no raga entry.
- Set `melakarta` if it is a melakarta raga; set `parent_raga` if it is a janya.
- Write a concise musicological `notes` field.
- Log as `[RAGA+]`.

**Adding a composer:**
- Set `musician_node_id` to the matching node id in `musicians.json` if the
  composer is a lineage node; `null` otherwise.
- Log as `[COMPOSER+]`.

**Adding a composition:**
- Require a verified `composer_id` (must exist in `composers[]`) and `raga_id`
  (must exist in `ragas[]`).
- Set `tala`, `language`, and `wikipedia` where known.
- Log as `[COMP+]`.

---

## Output contract

Every response that modifies data must follow this format:

**1. Change log** — before the JSON, list every change:

```
[NODE+]      added: abhishek_raghuram — Abhishek Raghuram (born 1984, contemporary, vocal)
[EDGE+]      added: gnb → ml_vasanthakumari (confidence 0.95)
[EDGE-]      removed: semmangudi_srinivasa_iyer → ramnad_krishnan
[EDGE~]      modified: vina_dhanammal → t_viswanathan — added note field
[YOUTUBE+]   appended to abhishek_raghuram: "Natabhairavi · Adi"
[YOUTUBE~]   tagged: semmangudi_srinivasa_iyer youtube[0] — year: 1966
[COMP+]      added: entharo_mahanubhavulu — Sri · Adi · Tyagaraja
[RAGA+]      added: sri — janya of Kharaharapriya
[COMPOSER+]  added: tyagaraja — musician_node_id: tyagaraja
[FLAG]       could not match artist "T. Ranganathan" to any existing node — skipped
```

**2. Full JSON** — return the complete, valid file content in a fenced code block.
Not a diff. Not a snippet. The entire file.

The user will copy this output and save it as the new file.

---

## Hard constraints — never do these

- **Never rename an existing `id` field** in either file. IDs are permanent keys.
- **Never create a musician node without a `wikipedia` URL.**
- **Never create a raga without a Wikipedia URL or explicit musicological source.**
- **Never create a composition without a verified `composer_id` and `raga_id`.**
- **Never infer an edge from shared `bani` alone.** Stylistic similarity is not lineage evidence.
- **Never silently drop an unmatched YouTube link.** Always flag it.
- **Never return partial JSON.** Always return the complete file.
- **Never add speculative edges without a `note` field** when `confidence` is below 0.70.
