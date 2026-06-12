# Playlists — data schema (ADR-163)

Each `playlists/{id}.json` is one **user-authored** playlist: an ordered, named
sequence of playable items that can span recordings, providers, and spans. This
is the first entity that is *not* sourced/curated like musicians/ragas/etc — it
is a point of view, not a fact — so it carries `kind: "user"` and is **exempt
from the Wikipedia/source-URL gate** (`sources` may be empty).

Playlists ride the standard `bani-add` patch loop (ADR-083/085): a saved
playlist is just another bundle item under the `playlists` key, applied via the
ADR-097 ops `create` / `patch` / `append`.

## File shape

```jsonc
{
  "id": "great_begada",                 // snake_case, permanent (never renamed)
  "title": "Great Begada",
  "description": "A walk through memorable Begada renditions.",
  "kind": "user",                       // distinguishes user-authored from curated
  "sources": [],                        // MAY be empty for kind:"user"
  "items": [
    {
      "media_key": "youtube:AU_UlJRBCyk",   // ADR-154 MediaRef identity (required)
      "start_seconds": 237,                 // ADR-156 span start (0 = whole video)
      "end_seconds": 641,                   // optional; span end → advance trigger
      "recording_id": "asoka_hotel_egmore", // optional: which recording the span lives in
      "composition_id": "shankari_neeve",   // optional back-reference targets…
      "raga_id": "begada",                  // …that power the PLAYLISTS panel sections
      "musician_ids": ["ramnad_krishnan"],
      "note": "Ramnad Krishnan"
    }
  ]
}
```

## Rules

- **`id`** snake_case and permanent; **`title`** required.
- **`items[]`**: each item requires a `media_key`; `start_seconds` defaults to 0.
  All other fields are optional. The `composition_id` / `raga_id` / `musician_ids`
  are denormalised back-reference targets — they decide which panels' PLAYLISTS
  sections the playlist appears in (render-time back-index). They can be derived
  from the recording's segment metadata at author time, so the user rarely types them.
- Validation (in `writer.py`) is **structural + referential only** — no source gate.
- Items reuse ADR-154 `media_key` + ADR-156 spans, so a playlist freely mixes whole
  videos, concert spans, and lecdem chapters.

## Bundle ops (ADR-097)

- `op:"create"` — a whole new playlist (the shape above).
- `op:"append"` `array:"items"` — add one item: `{ "op":"append", "id":"great_begada", "array":"items", "value": { "media_key": "...", ... } }`.
- `op:"patch"` — edit a scalar field (`title` / `description` / `sources`).

Authored in-browser via the `+` affordance / "Save as playlist" (ADR-163), which
deposits these ops into `baniBundle.playlists`; the unchanged "⬇ Patch" download
serialises them; `bani-add` applies them here.
