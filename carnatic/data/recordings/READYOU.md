# READYOU.md — carnatic/data/recordings/

## What this directory is

Each file here is a **single structured concert recording** — one JSON file per recording event. This replaces the old monolithic `recordings.json`.

`render.py` compiles all `*.json` files in this directory (sorted alphabetically by filename) into the in-memory recordings array before rendering `graph.html`. Files whose names start with `_` are skipped (reserved for index/metadata files).

---

## File naming convention

```
{id}.json
```

The filename **must equal** the `id` field inside the file. Use `snake_case`. Once set, the `id` is permanent — it is referenced by the render pipeline and may appear in external links.

---

## Schema — bare recording object

Each file contains a single JSON object (no `{"recordings": [...]}` wrapper):

```json
{
  "id": "poonamallee_1965",
  "video_id": "_rj8fHJiSLA",
  "url": "https://youtu.be/_rj8fHJiSLA",
  "title": "Srinivasa Farms Concert, Poonamallee 1965",
  "date": "1965-01",
  "venue": "Srinivasa Farms, Poonamallee, outskirts of Madras",
  "occasion": "Celebration of the conferment of the Sangita Kalanidhi award...",
  "sources": [
    {
      "url": "https://youtu.be/_rj8fHJiSLA",
      "label": "YouTube",
      "type": "other"
    }
  ],
  "sessions": [
    {
      "session_index": 1,
      "performers": [
        { "musician_id": "ramnad_krishnan", "role": "vocal" },
        { "musician_id": "tn_krishnan", "role": "violin" },
        { "musician_id": null, "role": "violin", "unmatched_name": "V. Tyagarajan" }
      ],
      "performances": [
        {
          "performance_index": 1,
          "timestamp": "00:00:00",
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

---

## Field reference

### Top-level fields

| field | type | notes |
|---|---|---|
| `id` | string | snake_case, permanent, must match filename |
| `video_id` | string | 11-character YouTube video ID |
| `url` | string | Full YouTube URL |
| `title` | string | Human-readable title for the recording event |
| `date` | string | ISO 8601 date or partial date: `"1965-01"`, `"1967"`, `"1960s"` |
| `venue` | string | Physical location of the concert |
| `occasion` | string | Context: award celebration, festival, AIR session, etc. |
| `sources` | array | Source objects (same schema as musicians.json sources) |
| `sessions` | array | One or more session objects (see below) |

### Session object

A session is a continuous performance block by a fixed set of performers. A multi-artist concert (like Poonamallee 1965) has multiple sessions.

| field | type | notes |
|---|---|---|
| `session_index` | int | 1-based, sequential within the recording |
| `performers` | array | Performer objects (see below) |
| `performances` | array | Performance objects (see below) |

### Performer object

| field | type | notes |
|---|---|---|
| `musician_id` | string \| null | References `id` in `musicians.json`. `null` if unmatched. |
| `role` | string | `vocal`, `violin`, `veena`, `flute`, `mridangam`, `ghatam`, `tampura`, etc. |
| `unmatched_name` | string | Only present when `musician_id` is `null`. Raw name from source. |

### Performance object

| field | type | notes |
|---|---|---|
| `performance_index` | int | 1-based, sequential within the session |
| `timestamp` | string | `"MM:SS"` or `"HH:MM:SS"` — position in the video |
| `offset_seconds` | int | Same position as integer seconds (used for YouTube `?t=` links) |
| `composition_id` | string \| null | References `id` in `compositions.json`. `null` if unidentified. |
| `raga_id` | string \| null | References `ragas[].id` in `compositions.json`. |
| `tala` | string \| null | e.g. `"adi"`, `"rupakam"`, `"misra_capu"` |
| `composer_id` | string \| null | References `composers[].id` in `compositions.json`. |
| `display_title` | string | Title shown in the UI. Use transliterated form when available. |
| `notes` | string \| null | Free text: `"padam"`, `"javali"`, `"varnam"`, `"2 kalai"`, etc. |
| `type` | string | Only set for non-composition items: `"tani"` for percussion solos. |

---

## Workflow — adding a new recording

1. **Create a new file** `carnatic/data/recordings/{id}.json`.
2. Set `id` to match the filename (without `.json`).
3. Fill in all top-level fields. `venue` and `occasion` may be `null` if unknown.
4. For each performer: set `musician_id` if the musician exists in `musicians.json`; otherwise set `musician_id: null` and `unmatched_name: "Raw Name From Source"`.
5. For each performance: set `composition_id`, `raga_id`, `composer_id` if the composition exists in `compositions.json`; otherwise set to `null` and add a `notes` field explaining what is known.
6. Run `python3 carnatic/render.py` to rebuild `graph.html`.
7. Log the change as `[RECORDING+] {id} — {title}`.

## Workflow — editing an existing recording

1. **Edit only the one file** `carnatic/data/recordings/{id}.json`.
2. Do not touch any other recording file.
3. Run `python3 carnatic/render.py` to rebuild `graph.html`.
4. Log the change as `[RECORDING~]`, `[PERF~]`, etc.

---

## Change log prefixes

| prefix | meaning |
|---|---|
| `[RECORDING+]` | new recording file created |
| `[RECORDING~]` | existing recording file modified |
| `[SESSION+]` | new session added to a recording |
| `[PERF+]` | new performance added to a session |
| `[PERF~]` | existing performance corrected |
| `[FLAG]` | unmatched musician name — `musician_id` set to `null` |

---

## Hard constraints

- **Never wrap the object** in `{"recordings": [...]}`. Each file is a bare object.
- **Never rename an `id`** once set. It is a permanent key.
- **Never set `musician_id`** to a value that does not exist in `musicians.json`.
- **Never set `composition_id`** to a value that does not exist in `compositions.json`.
- **Never silently drop an unmatched performer.** Use `musician_id: null` + `unmatched_name`.
- **After any change**, run `python3 carnatic/render.py`.
