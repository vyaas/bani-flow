# ADR-031: Data Entry Forms — In-Browser JSON Generator Interface

**Status:** Accepted
**Date:** 2026-04-15

---

## Context

### The problem of the blank JSON file

Bani Flow's data lives in a set of well-structured JSON files:
`musicians/{id}.json`, `musicians/_edges.json`, `ragas/{id}.json`,
`compositions/{id}.json`, and `recordings/{id}.json`.

The schema is documented in `carnatic/data/READYOU.md` and
`carnatic/data/recordings/READYOU.md`. The write path is documented in
`write_cli.py`. But for a human user — a rasika who wants to add their
favourite concert, a student who wants to add a musician they know — the
current workflow is:

1. Read the READYOU documentation
2. Understand the JSON schema
3. Open a text editor
4. Write a JSON file by hand, getting field names and enum values exactly right
5. Copy the file into the correct directory
6. Run `bani-render` from the command line

This is a five-step process that requires familiarity with JSON, the schema,
the CLI, and the directory layout. It is a barrier to contribution.

### The forces in tension

**Immersion vs. friction.** The rasika who wants to add a concert they love
should be able to do so without leaving the browser. The current workflow
breaks immersion completely — it requires a terminal, a text editor, and
knowledge of the schema.

**Fidelity to the oral tradition.** The tradition is transmitted through
sittings — concerts, lessons, lecture-demonstrations. The graph must make it
easy to add these. A concert recording is the most complex data object in the
system (sessions, performers, timestamped performances). If the entry form
cannot handle this complexity gracefully, the tradition's richest data type
remains inaccessible.

**Scalability without fragmentation.** As new entity types are added (lecture-
demonstrations, institutional affiliations, raga lineages), the form system
must absorb them without requiring a new UI paradigm each time. The form
architecture must be extensible.

**Queryability.** Every field in the form corresponds to a field that enables
a query. The form must make the relationship between field and query visible —
the user should understand *why* they are filling in `raga_id` (because it
enables "find all musicians who have performed this raga").

**No server.** Bani Flow is a zero-server, zero-database, zero-framework
application. The form system must operate entirely in the browser. It cannot
POST to an API. The output is a downloadable JSON file that the user then
places in the correct directory and re-renders.

---

## Pattern

**Christopher Alexander, *A Pattern Language*: Pattern 159 — Light on Two
Sides of Every Room.** Every room needs light from two directions so that
objects in it are not seen in silhouette. Applied here: every form field needs
two kinds of illumination — the *constraint* (what values are valid) and the
*purpose* (why this field matters to the graph). A field that shows only a
text box is a silhouette. A field that shows a dropdown of existing IDs *and*
a tooltip explaining what the field enables is fully lit.

**Alexander, *The Nature of Order*, Book 1: Strong Centres.** Each form is a
strong centre — a self-contained unit of interaction with a clear boundary
(the floating window), a clear purpose (generate one JSON file), and a clear
completion state (the "Download JSON" button becomes active). The footer bar
that launches forms is a weaker centre that points toward the stronger ones.

**Alexander, *A Pattern Language*: Pattern 190 — Ceiling Height Variety.**
Not all forms are the same depth. A musician form is shallow (8 fields). A
concert recording form is deep (sessions × performers × performances). The
architecture must allow forms to expand vertically without breaking the
surrounding layout — exactly as the media player does with its resize grip.

**Alexander, *A Pattern Language*: Pattern 205 — Structure Follows Social
Spaces.** The form system follows the social structure of the tradition: there
are musicians, there are ragas, there are compositions, there are concerts.
Each social category gets its own form. The footer bar makes this taxonomy
visible and navigable.

---

## Decision

### 1. Footer bar — the entry point

A persistent footer bar is added to `graph.html`, below the main layout and
above the browser chrome. It contains one button per entity type:

```
[ + Musician ]  [ + Raga ]  [ + Composition ]  [ + Recording ]
```

Each button opens a floating form window. The footer bar uses the same visual
language as the existing filter bar (`.filter-chip` style) but with a `+`
prefix and a distinct background colour to signal "write mode" vs. "read
mode".

**CSS class:** `.footer-bar` — a flex row, `height: 36px`, `background:
var(--bg-panel)`, `border-top: 2px solid var(--border-strong)`.

**Button style:** `.entry-btn` — same border-radius and font-size as
`.filter-chip`, but with `color: var(--accent)` and a `+` glyph prefix.

### 2. Floating form windows — the strong centres

Each form opens in a floating window that reuses the drag-and-resize
infrastructure already established by `media_player.js`. The window has:

- A **title bar** (draggable): "Add Musician", "Add Raga", etc.
- A **close button** (×) top-right
- A **form body** (scrollable): fields described below
- A **footer**: `[ Download JSON ]` button (disabled until required fields are
  filled) + a `[ Preview JSON ]` toggle that shows the generated JSON in a
  `<pre>` block

The window is positioned at a cascading offset (same `nextSpawnPosition()`
logic as the media player) so multiple forms can be open simultaneously.

**CSS class:** `.entry-window` — same `.media-player` structure:
`position: absolute`, `z-index: 900+`, `min-width: 380px`, `max-width: 560px`,
`background: var(--bg-panel)`, `border: 1px solid var(--border-strong)`,
`border-radius: 6px`, `box-shadow: 0 4px 24px rgba(0,0,0,0.5)`.

### 3. Form field types

Four field types cover all schema fields:

| Type | HTML element | Use case |
|---|---|---|
| `text` | `<input type="text">` | Free-text fields: `label`, `title`, `notes`, `venue` |
| `number` | `<input type="number">` | Year fields: `born`, `died`, `year`, `confidence` |
| `select` | `<select>` populated from `graphData` | ID reference fields: `musician_id`, `raga_id`, `composer_id`, `composition_id` |
| `enum` | `<select>` with hardcoded options | Vocabulary fields: `era`, `instrument`, `source.type`, `tala`, `role` |

All `select` fields that reference existing IDs are populated at form-open
time from the in-memory `graphData` object (already present in `graph.html`).
This means the dropdowns always reflect the current state of the graph — no
network call, no stale cache.

**Null option:** Every `select` field includes a `— none —` option that maps
to `null` in the generated JSON. Required fields disable the Download button
if `— none —` is selected.

### 4. Form specifications — per entity type

#### 4a. Add Musician

Generates: `carnatic/data/musicians/{id}.json`

The Musician form has two sections: **Node fields** (the musician's own data)
and **Guru-Shishya edges** (relationships to add to `_edges.json`).

**Section A — Node fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `text` | ✓ | Auto-derived from `label` (snake_case); user can override. Shown read-only with edit toggle. |
| `label` | `text` | ✓ | Display name |
| `born` | `number` | — | Year only |
| `died` | `number` | — | Year only; placeholder "leave blank if living" |
| `era` | `enum` | ✓ | `trinity` · `bridge` · `golden_age` · `disseminator` · `living_pillars` · `contemporary` |
| `instrument` | `enum` | ✓ | `vocal` · `veena` · `violin` · `flute` · `mridangam` · `bharatanatyam` · `ghatam` · `other` |
| `bani` | `text` | — | Free text |
| `source.url` | `text` | ✓ | Primary source URL (Wikipedia preferred) |
| `source.label` | `text` | ✓ | e.g. "Wikipedia" |
| `source.type` | `enum` | ✓ | `wikipedia` · `pdf` · `article` · `archive` · `other` |

**Section B — Guru-Shishya edges** (repeating; `[ + Add Guru ]` and
`[ + Add Shishya ]` buttons):

Each edge entry has:

| Field | Type | Required | Notes |
|---|---|---|---|
| `direction` | `enum` (implicit) | ✓ | "This musician is the **shishya** of:" (guru select) or "This musician is the **guru** of:" (shishya select) |
| `other_musician_id` | `select` | ✓ | Populated from `graphData.nodes`; the other end of the edge |
| `confidence` | `number` | ✓ | Float 0.0–1.0; default `0.90` |
| `source_url` | `text` | ✓ | URL where this relationship is explicitly stated |
| `note` | `text` | — | Qualifier: `"first guru"`, `"principal guru"`, `"gurukula training, N years"` |

The edge section generates **two output files**: the musician node JSON *and*
a patch to `_edges.json`. Because the form cannot modify `_edges.json` in
place, it generates the **complete updated `_edges.json` array** with the new
edges appended.

**Download produces two files** (downloaded sequentially):
1. `{id}.json` — the new musician node
2. `_edges.json` — the complete updated edges array

A warning is shown if edges are added:
> ⚠ Downloading `_edges.json` will replace the existing file. If you have
> added other edges in this session without re-rendering, download and merge
> manually.

**Generated JSON shape — musician node:**

```json
{
  "id": "example_musician",
  "label": "Example Musician",
  "sources": [
    {
      "url": "https://en.wikipedia.org/wiki/Example_Musician",
      "label": "Wikipedia",
      "type": "wikipedia"
    }
  ],
  "born": 1940,
  "died": null,
  "era": "golden_age",
  "instrument": "vocal",
  "bani": null,
  "youtube": []
}
```

**Generated JSON shape — `_edges.json` (complete updated array):**

```json
[
  { "source": "semmangudi_srinivasa_iyer", "target": "kv_narayanaswamy", "confidence": 0.97, "source_url": "https://...", "note": null },
  { ... existing edges ... },
  {
    "source": "semmangudi_srinivasa_iyer",
    "target": "example_musician",
    "confidence": 0.90,
    "source_url": "https://en.wikipedia.org/wiki/Example_Musician",
    "note": "principal guru"
  }
]
```

**Destination:**
- `carnatic/data/musicians/{id}.json` (new file)
- `carnatic/data/musicians/_edges.json` (replace existing, only if edges were added)

**Post-download instruction** (shown in the window after download):
> Copy `{id}.json` to `carnatic/data/musicians/`.
> If you downloaded `_edges.json`, replace `carnatic/data/musicians/_edges.json`.
> Then run `bani-render` to rebuild the graph.

---

#### 4b. Add YouTube Recording to Musician

This is a sub-form, accessible from the "Add Musician" form via an
"+ Add YouTube entry" button, and also as a standalone form from the footer
bar (under the `[ + Musician ]` button as a secondary action). It generates
the *complete updated musician JSON* with the new YouTube entry appended.

| Field | Type | Required | Notes |
|---|---|---|---|
| `musician_id` | `select` | ✓ | Populated from `graphData.nodes` |
| `url` | `text` | ✓ | YouTube URL (any form: `youtu.be/`, `watch?v=`, `embed/`) |
| `label` | `text` | ✓ | Track label shown in sidebar |
| `composition_id` | `select` | — | Populated from `graphData.compositions` |
| `raga_id` | `select` | — | Populated from `graphData.ragas` |
| `year` | `number` | — | Year of recording |
| `version` | `text` | — | Distinguishes multiple versions of same composition |

**Generated JSON shape** (complete updated musician file):

```json
{
  "id": "bombay_jayashri",
  "label": "Bombay Jayashri",
  "sources": [ "..." ],
  "born": 1964,
  "died": null,
  "era": "contemporary",
  "instrument": "vocal",
  "bani": "lalgudi",
  "youtube": [
    {
      "url": "https://youtu.be/YAbWJYP_BWo",
      "label": "entō prēmatōnu · Bahudari · Adi - Bombay Jayashri",
      "composition_id": "ento_prematonu",
      "raga_id": "bahudari"
    },
    {
      "url": "https://youtu.be/NEWVIDEOID",
      "label": "New Recording Label",
      "composition_id": "some_composition",
      "raga_id": "kalyani",
      "year": 2023
    }
  ]
}
```

**Destination:** `carnatic/data/musicians/{musician_id}.json` (replace existing)

---

#### 4c. Add Raga

Generates: `carnatic/data/ragas/{id}.json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `text` | ✓ | Auto-derived from `name`; user can override |
| `name` | `text` | ✓ | Canonical name |
| `aliases` | `text` | — | Comma-separated; split into array on generate |
| `is_melakarta` | `enum` | ✓ | `true` · `false` |
| `melakarta` | `number` | — | 1–72; shown only if `is_melakarta = true` |
| `cakra` | `number` | — | 1–12; shown only if `is_melakarta = true` |
| `parent_raga` | `select` | — | Populated from `graphData.ragas`; shown only if `is_melakarta = false` |
| `source.url` | `text` | ✓ | |
| `source.label` | `text` | ✓ | |
| `source.type` | `enum` | ✓ | |
| `notes` | `text` | — | Free-text musicological note |

**Conditional display:** `melakarta` and `cakra` fields appear only when
`is_melakarta = true`. `parent_raga` appears only when `is_melakarta = false`.
This is implemented via `data-show-if` attributes on field rows, toggled by
the `is_melakarta` select's `change` event.

**Generated JSON shape:**

```json
{
  "id": "arabhi",
  "name": "Arabhi",
  "aliases": ["Arabi"],
  "melakarta": null,
  "is_melakarta": false,
  "cakra": null,
  "parent_raga": "shankarabharanam",
  "sources": [
    {
      "url": "https://en.wikipedia.org/wiki/Arabhi",
      "label": "Wikipedia",
      "type": "wikipedia"
    }
  ],
  "notes": "Janya of Dheerashankarabharanam (29th melakarta)"
}
```

**Destination:** `carnatic/data/ragas/{id}.json`

---

#### 4d. Add Composition

Generates: `carnatic/data/compositions/{id}.json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `text` | ✓ | Auto-derived from `title` |
| `title` | `text` | ✓ | Canonical title |
| `composer_id` | `select` | ✓ | Populated from `graphData.composers` |
| `raga_id` | `select` | ✓ | Populated from `graphData.ragas` |
| `tala` | `enum` | — | `adi` · `rupakam` · `misra_capu` · `khanda_capu` · `tisra_triputa` · `ata` · `dhruva` · `other` |
| `language` | `enum` | — | `Telugu` · `Sanskrit` · `Tamil` · `Kannada` · `Malayalam` · `Other` |
| `source.url` | `text` | — | |
| `source.label` | `text` | — | |
| `source.type` | `enum` | — | |
| `notes` | `text` | — | Free-text musicological note |

**Generated JSON shape:**

```json
{
  "id": "abhimana",
  "title": "Abhimana",
  "composer_id": "patnam_subramanya_iyer",
  "raga_id": "begada",
  "tala": "adi",
  "language": "Telugu",
  "sources": [
    {
      "url": "https://www.karnatik.com/c2765.shtml",
      "label": "Karnatik.com",
      "type": "article"
    }
  ],
  "notes": null
}
```

**Destination:** `carnatic/data/compositions/{id}.json`

---

#### 4e. Add Concert Recording

This is the most complex form. It generates a complete
`carnatic/data/recordings/{id}.json` file.

**Structure:** The form has three tiers, matching the recording schema:

```
Top-level fields (id, title, url, date, venue, occasion, source)
  └── Sessions (repeating group)
        ├── Performers (repeating sub-group)
        └── Performances (repeating sub-group, with timestamp fields)
```

**Top-level fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `text` | ✓ | Auto-derived from `title`; user can override |
| `title` | `text` | ✓ | Human-readable title |
| `short_title` | `text` | — | Abbreviated title for compact display |
| `url` | `text` | ✓ | YouTube URL |
| `date` | `text` | — | ISO 8601 partial: `"1965-01"`, `"1967"`, `"1960s"` |
| `venue` | `text` | — | Physical location |
| `occasion` | `text` | — | Context: award, festival, AIR session |
| `source.url` | `text` | ✓ | Defaults to the YouTube URL |
| `source.label` | `text` | ✓ | Defaults to "YouTube" |
| `source.type` | `enum` | ✓ | Defaults to `other` |

**Session block** (repeating; `[ + Add Session ]` button):

Each session block contains:

*Performers sub-block* (repeating; `[ + Add Performer ]` button):

| Field | Type | Required | Notes |
|---|---|---|---|
| `musician_id` | `select` | — | Populated from `graphData.nodes`; may be `null` |
| `unmatched_name` | `text` | — | Shown only when `musician_id = null`; raw name from source |
| `role` | `enum` | ✓ | `vocal` · `violin` · `veena` · `flute` · `mridangam` · `ghatam` · `tampura` · `other` |

*Performances sub-block* (repeating; `[ + Add Performance ]` button):

| Field | Type | Required | Notes |
|---|---|---|---|
| `timestamp` | `text` | ✓ | `MM:SS` or `HH:MM:SS` |
| `offset_seconds` | `number` | ✓ | Auto-computed from `timestamp` on blur; user can override |
| `composition_id` | `select` | — | Populated from `graphData.compositions` |
| `raga_id` | `select` | — | Populated from `graphData.ragas` |
| `tala` | `enum` | — | Same vocabulary as composition form |
| `composer_id` | `select` | — | Populated from `graphData.composers` |
| `display_title` | `text` | ✓ | Title shown in UI (transliterated form preferred) |
| `notes` | `text` | — | `"padam"`, `"javali"`, `"varnam"`, etc. |
| `type` | `enum` | — | `"tani"` for percussion solos; blank otherwise |

**Timestamp → offset_seconds auto-computation:**

When the user fills in `timestamp` and tabs away, the form parses the string
(`HH:MM:SS` or `MM:SS`) and populates `offset_seconds` automatically. The
user can override. This removes the most error-prone manual step in concert
data entry.

```javascript
function timestampToSeconds(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}
```

**Generated JSON shape** (abbreviated):

```json
{
  "id": "poonamallee_1965",
  "video_id": "_rj8fHJiSLA",
  "url": "https://youtu.be/_rj8fHJiSLA",
  "title": "Srinivasa Farms Concert, Poonamallee 1965",
  "short_title": "Poonamallee 1965",
  "date": "1965-01",
  "venue": "Srinivasa Farms, Poonamallee, outskirts of Madras",
  "occasion": "Celebration of the conferment of the Sangita Kalanidhi award...",
  "sources": [
    { "url": "https://youtu.be/_rj8fHJiSLA", "label": "YouTube", "type": "other" }
  ],
  "sessions": [
    {
      "session_index": 1,
      "performers": [
        { "musician_id": "ramnad_krishnan", "role": "vocal" },
        { "musician_id": null, "role": "violin", "unmatched_name": "V. Tyagarajan" }
      ],
      "performances": [
        {
          "performance_index": 1,
          "timestamp": "00:00",
          "offset_seconds": 0,
          "composition_id": "jagadananda_karaka",
          "raga_id": "nata",
          "tala": "adi",
          "composer_id": "tyagaraja",
          "display_title": "jagadānandakāraka",
          "notes": null
        }
      ]
    }
  ]
}
```

**video_id extraction:** The form extracts the 11-character YouTube video ID
from the URL field automatically:

```javascript
function extractVideoId(url) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
```

**Destination:** `carnatic/data/recordings/{id}.json`

---

### 5. ID auto-derivation

All forms that require an `id` field auto-derive it from the primary name
field using the same snake_case transformation used by `write_cli.py`:

```javascript
function toSnakeCase(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .replace(/[^a-z0-9\s_]/g, '')      // strip non-alphanumeric
    .trim()
    .replace(/\s+/g, '_');
}
```

The derived ID is shown in a read-only field with an "Edit" toggle. The user
can override it. The field turns red if the derived ID already exists in
`graphData` (duplicate detection).

### 6. Duplicate detection

Before enabling the Download button, the form checks:

- **Musician:** `graphData.nodes.some(n => n.id === derivedId)`
- **Raga:** `graphData.ragas.some(r => r.id === derivedId)`
- **Composition:** `graphData.compositions.some(c => c.id === derivedId)`
- **Recording:** `graphData.recordings.some(r => r.id === derivedId)`
- **YouTube URL:** `graphData.nodes.some(n => n.youtube?.some(y => y.url === url))`
- **Edge:** `graphData.edges.some(e => e.source === src && e.target === tgt)`

If a duplicate is detected, the Download button is replaced with a warning:
> ⚠ This ID already exists in the graph. Change the ID or edit the existing
> file directly.

### 7. JSON preview

A `[ Preview JSON ]` toggle at the bottom of each form shows the generated
JSON in a `<pre>` block with syntax highlighting (using the existing
`var(--accent)` colour for keys). This lets the user verify the output before
downloading.

The preview updates live as fields are filled in.

### 8. Download mechanism

```javascript
function downloadJson(filename, obj) {
  const blob = new Blob(
    [JSON.stringify(obj, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
```

The filename is `{id}.json` for all entity types. For the Musician form with
edges, a second download of `_edges.json` is triggered immediately after the
first.

### 9. Post-download instruction panel

After the Download button is clicked, the form body is replaced with a
confirmation panel:

```
✓ Downloaded {filename}

Next steps:
1. Copy this file to carnatic/data/{directory}/
2. Run: bani-render
3. Refresh graph.html

[ Download again ]  [ Close ]
```

The directory is specific to the entity type:
- Musician → `carnatic/data/musicians/`
- Raga → `carnatic/data/ragas/`
- Composition → `carnatic/data/compositions/`
- Recording → `carnatic/data/recordings/`

For the Musician form with edges, the instruction reads:
```
✓ Downloaded {id}.json and _edges.json

Next steps:
1. Copy {id}.json to carnatic/data/musicians/
2. Replace carnatic/data/musicians/_edges.json with the downloaded file
3. Run: bani-render
4. Refresh graph.html
```

### 10. Data access — `graphData` contract

The forms depend on `graphData` being available as a global JavaScript object
in `graph.html`. The current render pipeline already injects this object. The
forms require the following keys:

| Key | Type | Source |
|---|---|---|
| `graphData.nodes` | `Array<{id, label, youtube}>` | `musicians/` |
| `graphData.edges` | `Array<{source, target, confidence, source_url, note}>` | `musicians/_edges.json` |
| `graphData.ragas` | `Array<{id, name}>` | `ragas/` |
| `graphData.compositions` | `Array<{id, title}>` | `compositions/` |
| `graphData.composers` | `Array<{id, name}>` | `compositions/_composers.json` |
| `graphData.recordings` | `Array<{id, title}>` | `recordings/` |

If any of these keys is absent (e.g. `graphData.composers` or
`graphData.recordings` are not currently injected), the Carnatic Coder must
add them to the render pipeline before implementing the forms.

---

## Consequences

### What this enables

- **Any user** can add a musician, raga, composition, or concert recording
  without knowing JSON syntax, the schema, or the CLI.
- **Guru-shishya edges** can be proposed at the same time as a new musician
  node — the two most common co-occurring writes are handled in a single form.
- **Dropdown fields** populated from `graphData` prevent referential integrity
  errors at the point of entry — the user cannot type a `raga_id` that does
  not exist.
- **Timestamp auto-computation** removes the most error-prone step in concert
  data entry.
- **Duplicate detection** prevents the most common data quality error.
- **The JSON preview** makes the schema visible and educational — the user
  learns the data model by filling in the form.
- **The post-download instruction** closes the loop: the user knows exactly
  what to do with the file.

### What this forecloses

- **Inline editing of existing files** — the forms generate new files or
  complete replacements. They do not support surgical edits (e.g. correcting
  a single field in an existing musician file). That remains a CLI or direct-
  edit operation. This is acceptable: the forms are for *addition*, not
  *correction*.
- **Composer entry** — adding composers (`_composers.json`) is excluded from
  this ADR. Composers are few in number (~50), change rarely, and require
  musicological judgment about the `musician_node_id` link. A future ADR may
  add a composer form when the need arises.
- **Batch entry** — the forms handle one entity at a time. Bulk import (e.g.
  a full concert setlist from a text file) is out of scope.
- **`_edges.json` merge safety** — the Musician form downloads the complete
  updated `_edges.json`. If the user has added edges in a previous session
  without re-rendering, the in-memory `graphData.edges` will be stale and the
  downloaded file will not include those edges. The warning panel addresses
  this, but does not solve it programmatically.

### Queries enabled

| Query | Enabled by |
|---|---|
| "Which musicians have performed Kalyani?" | `raga_id` in YouTube entries and performances |
| "What did Ramnad Krishnan perform at Poonamallee 1965?" | Concert recording with timestamped performances |
| "Who are the contemporary vocalists?" | `era` + `instrument` in musician form |
| "Which compositions are in Arabhi?" | `raga_id` in composition form |
| "Who composed Abhimana?" | `composer_id` in composition form |
| "Who did Semmangudi teach?" | `_edges.json` guru-shishya edges added via Musician form |
| "Who performed at the Poonamallee 1965 concert?" | `sessions[].performers` in Recording form |

---

## Implementation

**Agent:** Carnatic Coder

**Files to create/modify:**

| File | Change |
|---|---|
| `carnatic/render/templates/base.html` | Add `.footer-bar` HTML + CSS; add `.entry-window` CSS (reuse `.media-player` structure) |
| `carnatic/render/templates/entry_forms.js` | New file: all form logic — field rendering, ID derivation, duplicate detection, JSON generation, download |
| `carnatic/render/html_generator.py` | Inject `entry_forms.js` into `graph.html`; ensure `graphData.composers`, `graphData.edges`, and `graphData.recordings` are injected |
| `carnatic/render/data_loaders.py` | Expose composers array, edges array, and recordings index to the render pipeline if not already present |

**Implementation order:**

1. Confirm `graphData.composers`, `graphData.edges`, and `graphData.recordings`
   are injected by the render pipeline (prerequisite — without these, the
   dropdowns cannot be populated and edge duplicate-detection cannot work).
2. Add `.footer-bar` HTML and CSS to `base.html`.
3. Implement `entry_forms.js` with the Musician form first (simplest schema,
   but includes the edge sub-section which exercises the two-file download
   pattern).
4. Add Raga form (conditional field display exercises the `data-show-if`
   pattern).
5. Add Composition form.
6. Add Concert Recording form last (most complex — sessions × performers ×
   performances, timestamp auto-computation).
7. Wire the footer bar buttons to open the correct form.
8. Test all forms against the existing data files to confirm generated JSON
   matches the schema exactly.

**Validation test:** After implementation, generate a musician JSON using the
form, place it in `carnatic/data/musicians/`, run `bani-render`, and confirm
the new node appears in the graph with correct era colour, instrument shape,
and (if a YouTube entry was added) green border. Generate a concert recording
JSON, place it in `carnatic/data/recordings/`, run `bani-render`, and confirm
the recording appears in the Bani Flow trail with correct timestamps.

---

## Schema changes

This ADR introduces **no changes to the data schema**. The forms generate JSON
that conforms exactly to the existing schemas documented in
`carnatic/data/READYOU.md` and `carnatic/data/recordings/READYOU.md`.

The only schema-adjacent change is the requirement that `graphData.composers`,
`graphData.edges`, and `graphData.recordings` be injected into `graph.html`
by the render pipeline. These are derived from existing data files — no new
data fields are introduced.

---

## Open questions

1. **Edge form for existing musicians (future ADR):** The current Musician
   form adds edges only when creating a *new* musician. Adding an edge between
   two *existing* musicians (e.g. a newly discovered guru-shishya relationship)
   still requires the CLI or direct JSON edit. A future ADR may add a
   standalone "Add Edge" form — but this requires the musicological judgment
   UI (confidence slider, source URL, note field) to be designed carefully so
   it does not encourage speculative edge creation.

2. **`_edges.json` merge safety:** The Musician form downloads the complete
   updated `_edges.json`. If the user has added edges in a previous session
   without re-rendering, the in-memory `graphData.edges` will be stale and the
   downloaded file will not include those edges. A future improvement could
   detect this condition (by comparing `graphData.edges.length` against a
   stored baseline) and warn the user more precisely.

3. **Lecture-demonstration and lesson forms (future ADR):** The oral tradition
   is transmitted through sittings — not just concerts. A future ADR should
   design forms for lesson records and lecture-demonstrations, which have a
   different schema from concert recordings (no `sessions`, but a `topics`
   array and a `guru_id` / `shishya_id` pair). This ADR deliberately excludes
   them to keep scope manageable.