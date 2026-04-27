# Workflow: Bulk Concert Recording Upload from Vaak JSON

Reference document for the #Librarian agent. Captures the workflow used during the first systematic bulk ingest from a Vaak-sourced playlist JSON (the Brinda & Muktha 1960s corpus, April 2026).

---

## Source Format

Vaak playlists are scraped as JSON arrays. Each item has this shape:

```json
{
  "index": 1,
  "id": "tHzdBspZJ9M",
  "url": "https://www.youtube.com/watch?v=tHzdBspZJ9M",
  "title": "T. Brinda & T. Muktha | AIR Madras 1964",
  "description": "...\nTracklist:\n00:00:00 - Raga\n00:01:30 - Raga - Composition - Tala - Composer\n...",
  "uploader": "Vaak",
  "duration": 4962,
  "upload_date": "20260414"
}
```

The `description` field contains the full timestamped tracklist as plain text. The `title` field identifies the artist(s), venue, and year. `duration` is in seconds.

---

## Phase 1 — Orientation

Before touching any data:

```bash
source .venv/bin/activate
python3 carnatic/cli.py stats        # snapshot: node/edge/recording counts
```

Filter the playlist JSON for target videos (by artist name in title or description). For Brinda/Muktha the filter was `T. Brinda` in the title field. Keep a list of the 7 (or N) target video IDs.

---

## Phase 2 — Extract Tracklists

For each target video, parse the `description` field for the tracklist block. Vaak's format is consistent:

```
Tracklist:
HH:MM:SS - Raga
HH:MM:SS - Raga - Composition Title - Tala - Composer
HH:MM:SS - Composition Title - Type - Raga - Tala - Composer
```

**Important parsing rules:**
- A line with only a raga name (no composition after it) = an **alapana** segment. Model as `composition_id: null`, `raga_id: <raga>`, `notes: "alapana"`.
- A line with `Tani Avarthanam` = percussion solo. Model as `type: "tani"`, no raga/composition.
- Type keywords (`Varnam`, `Padam`, `Javali`, `Tillana`, `Viruttam`, `Kriti`) appear in the position where raga would go in a short listing — read context carefully to disambiguate.
- `Mishra Chapu`, `Tisra Triputa`, etc. are talas in free-string form; use snake_case consistently: `misra_chapu`, `tisra_triputa`, `khanda_ekam`, `rupakam`, `adi`, `deshadi`, `jhampa`.

---

## Phase 3 — Gap Analysis (before any writes)

Build a master table: for each composition in each tracklist, record:
- Composition title
- Raga
- Tala
- Composer

Then verify each against the DB:

```bash
python3 carnatic/cli.py composition-exists "<title>"
python3 carnatic/cli.py raga-exists "<raga>"
python3 carnatic/cli.py musician-exists "<composer>"
```

Collect **all gaps** before writing anything. Group them into:
1. Missing ragas
2. Missing composers (= missing musicians, under the composer-as-musician paradigm)
3. Missing compositions
4. Missing performers (accompanists) — note: use `unmatched_name` pattern; don't block on this

**Present the gap table to the user for review** before proceeding. This is the confirmation gate — the user may correct raga attributions, confirm disputed composers, or flag pre-existing entries with different titles.

---

## Phase 4 — Fill Gaps (in order)

### 4a. Ragas

For each missing raga:

```bash
python3 carnatic/write_cli.py add-raga \
  --id <snake_case_id> \
  --label "<Display Name>" \
  --parent-raga <parent_id> \
  --source-url "<reference_url>"
```

If a raga is a melakarta (no parent), use `add-raga` without `--parent-raga`.

**Gotcha**: raga file names don't always match intuition. Always check:
```bash
ls carnatic/data/ragas/ | grep <partial>
```
`todi` → file is `thodi.json`; `sri` → `sriraga.json`; `brindavana saranga` → `brindavana_saranga.json`.

For ragas with no Wikipedia article (rare janyas), use the best available specialist source (e.g. drmradhakrishnan.com, guruguha.org).

### 4b. Composers as Musicians

Under the **composer-as-musician paradigm** (ADR pending as of April 2026):

1. Add as musician first:
```bash
python3 carnatic/write_cli.py add-musician \
  --id <id> --label "<Name>" \
  --instrument vocal --era medieval \
  --source-url "<wikipedia_or_reference_url>"
```

`--source-url` is **required**. If no source URL exists (e.g. Muddu Natesa), create the musician JSON file manually at `carnatic/data/musicians/<id>.json` with `"sources": []`, then proceed to step 2.

2. Register as composer:
```bash
python3 carnatic/write_cli.py add-composer \
  --id <composer_db_id> \
  --label "<Name>" \
  --musician-node-id <same_id>
```

The composer DB id (in `_composers.json`) and the musician node id may differ for legacy composers — check `_composers.json` first. For Muthu Thandavar the composer id is `muthuthandavar`, but the musician node id is `muthu_thandavar`.

If a composer already exists with a `musician_node_id` set (e.g. `subbarama_dikshitar`), `add-composer` will skip without error — that is expected.

### 4c. Compositions

```bash
python3 carnatic/write_cli.py add-composition \
  --id <snake_case_id> \
  --label "<Title>" \
  --raga-id <raga_id> \
  --composer-id <composer_db_id> \
  --tala <tala> \
  --language <language>
```

**Always run `composition-exists` first** for any title that is common across multiple ragas (e.g. `janani_ninnuvina` exists as Reetigowla/Subbaraya Sastri — adding it as Kalyani/Subbarama Dikshitar would be wrong).

For compositions with unknown/disputed composer, use `--composer-id <id>` with the best available attribution and add a note.

---

## Phase 5 — Create Recording Files

Each recording file is a bare JSON object at `carnatic/data/recordings/<id>.json`.

**File naming**: `<venue_slug>_<year>_<artists>.json`
Examples: `music_academy_1962_brinda_muktha.json`, `air_madras_1964_brinda_muktha.json`

**Schema skeleton**:
```json
{
  "id": "music_academy_1962_brinda_muktha",
  "youtube_url": "https://www.youtube.com/watch?v=<id>",
  "title": "<Display Title>",
  "date": "YYYY-MM-DD",
  "venue": "<Venue Name>",
  "sessions": [
    {
      "session_id": "<recording_id>_s1",
      "performers": [
        { "musician_id": "t_brinda", "role": "vocal" },
        { "musician_id": null, "unmatched_name": "R. K. Venkatarama Sastri", "role": "violin" }
      ],
      "performances": [
        {
          "start_time": "00:01:30",
          "type": "kriti",
          "raga_id": "thodi",
          "composition_id": "nidhi_chala_sukhama",
          "tala": "adi",
          "notes": ""
        },
        {
          "start_time": "00:12:00",
          "type": "alapana",
          "raga_id": "bhairavi",
          "composition_id": null,
          "notes": "alapana"
        },
        {
          "start_time": "00:25:00",
          "type": "tani",
          "notes": "Tani Avarthanam"
        }
      ]
    }
  ]
}
```

**Unmatched performers**: any musician not in the DB gets `"musician_id": null` + `"unmatched_name": "<Name as in description>"`. Do not block a recording on missing accompanist nodes.

---

## Phase 6 — Render Gate and Validate

Always run in this order:

```bash
bani-render
python3 carnatic/cli.py validate
```

`bani-render` rebuilds `graph.json` and `graph.html` from source files. `cli.py` reads `graph.json` — so any query run before render will see stale data.

Validate errors from prior sessions are pre-existing; only investigate errors that reference files you created in this session.

---

## Phase 7 — Commit

Data-only bulk ingest → `main` branch is appropriate (no schema change, no new paradigm implemented).

```bash
git add carnatic/data/ carnatic/graph.html carnatic/.clinerules
git commit -m "data(recording): <short summary>

<one paragraph: what recordings, what prerequisite gaps were filled,
render result: N nodes / N edges / N recordings>
[AGENTS: librarian]

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
```

---

## Frequently Encountered Gotchas

| Situation | Resolution |
|---|---|
| `add-musician` fails: `--source-url` required | Create `carnatic/data/musicians/<id>.json` manually with `"sources": []` |
| Composition title exists under different raga | Different composition — use a disambiguating suffix in the ID (e.g. `aparadhamulanniyu` vs `aparadhamulanorva`) |
| Raga ID mismatch at write time | Run `ls carnatic/data/ragas/ | grep <partial>` before adding compositions |
| Composer already exists as musician+composer | `add-composer` skips with SKIP message — expected, not an error |
| Accompanist not in DB | Use `musician_id: null` + `unmatched_name`; do not block ingest |
| `cli.py` returns stale results | Run `bani-render` first; CLI reads `graph.json` (derived artifact) |
| Multiple concerts share the same compositions | One composition JSON is shared across all recordings — no duplication needed |

---

## Reuse Checklist for Future Vaak Uploads

- [ ] Filter playlist JSON for target artist(s) by title
- [ ] Extract all tracklists from `description` fields
- [ ] Run gap analysis against DB; present table to user for confirmation
- [ ] Get user signoff on: disputed composers, unrecognised compositions, rare ragas without Wikipedia
- [ ] Fill gaps in order: ragas → composers-as-musicians → compositions
- [ ] Create recording files
- [ ] `bani-render` → `cli.py validate`
- [ ] Append learning log to `carnatic/.clinerules`
- [ ] Commit and push
