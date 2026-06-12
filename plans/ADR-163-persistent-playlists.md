# ADR-163: Persistent Playlists — Entity, Add Gesture & PLAYLISTS Panel Sections

**Status**: Accepted
**Date**: 2026-06-12 (proposed + accepted)
**Implementation note**: built in three verifiable slices — (1) data + write surface (playlists/ schema, writer.py methods, bani_add _process_playlists, entry_forms baniBundle key) — verified by running an op:create patch through bani-add; (2) render + PLAYLISTS panel sections (load + back-index + buildSection); (3) capture UI (the `+` affordance / queue "Save as playlist") + cross-recording continuation via end_seconds.
**Agents**: graph-architect → librarian + carnatic-coder (parallel) → test-engineer
**Depends on**: ADR-157 Phase B (this *is* Phase B), ADR-162 (the queue panel this playlist opens into), ADR-154 (MediaRef / `media_key` — playlist item identity across providers), ADR-156 (segment spans — a playlist item can be a span inside a recording), ADR-085 (self-replicating curation loop — playlists join it as a first-class entity), **ADR-083 (the `bani_add_patch.json` bundle envelope — a saved playlist is just a bundle item), ADR-097 (delta ops `create`/`patch`/`append`/`annotate` — playlist saves and edits reuse these verbatim)**, ADR-128 (`buildSection` panel pattern reused for the PLAYLISTS section). **Constitutional note:** introduces a new graph entity + a new `bani-add` item type; per ADR-085 this requires a PR and review before merge to `main`.

---

## Context (forces in tension)

ADR-157 split playlists into two passes and deferred the second: a **persistent, named, shareable playlist** as a first-class graph entity. ADR-162 will have validated the *interaction* (a visible, editable queue). This ADR pays for the *monument*: turning an ephemeral session queue into a saved object that lives in the data, is curated like any other entity, and surfaces in the panels wherever its contents are relevant.

The user's full ask:
- A **playlist object** that can be saved.
- A **way to add** any track to a playlist — and a clear, powerful indication that the affordance exists (the `+` decision below).
- Saved playlists **rendered as a "PLAYLISTS" section in both panels**, appearing wherever the panel's subject is found in a playlist. Example: a playlist "Great Begada" containing Voleti's *Sankari Neeve* must appear under **Voleti**'s musician panel, under **Begada**, and under **Sankari Neeve** — because each is a participant in that playlist.
- **Cross-recording continuation**: a playlist item pointing into a concert segment plays that span, and when the span (or the source video) ends, the playlist advances to its *next* item — even though the source recording continues past that point. This is the true test that the playlist is a real sequence and not just a set of links into videos.

Forces:
- **A new write surface is expensive** (ADR-085): a new entity means a new directory, a new write verb in `write_cli.py`/`bani_add.py`, validation in `writer.py`, render-pipeline loading, and curation discipline. This must be deliberate, not incidental.
- **Provenance vs. user data.** Every other entity in this graph is *sourced, curated, musicologically significant* (Librarian's domain). A playlist is the first **user-authored** object — "Great Begada" is a point of view, not a sourced fact. The schema and curation rules must acknowledge this rather than force a Wikipedia URL onto a personal mixtape.
- **The add gesture must not collide.** Double-click is already taken twice — ADR-142 (dblclick-a-chip-to-edit) and ADR-158 (double-tap-the-video-to-seek). A third double-click meaning would be ambiguous and context-dependent. **Decision (confirmed with the user): an explicit `+` affordance**, not an overloaded gesture.
- **Bidirectional discovery is the payoff.** A playlist is only worth the cost if it makes the graph *more* navigable — hence the requirement that a playlist back-references into every participant's panel.
- **One write surface, not a new one.** The project already has a curation loop the team trusts: in-browser forms accumulate ops in `baniBundle`, "⬇ Patch" downloads `bani_add_patch.json` (ADR-083 envelope), and `bani-add` ingests it through `writer.py` (ADR-085). Inventing a *separate* "save playlist" mechanism would fork that loop and create a second, untrusted write path. A saved playlist must be **just another bundle item** — `op:"create"` for a new playlist, `op:"append"` to add a track — flowing through the exact same download-patch → `bani-add` pipeline as a musician or a recording. This is a hard constraint, not a preference (user directive, 2026-06-12).

## Pattern

**Strong Centre with many Boundaries.** A playlist is a new centre. Its boundaries are: the data file (persistence), the write verb (curation), the `+` affordance (capture), the queue panel (playback — reused from ADR-162), and the PLAYLISTS panel sections (discovery). The centre is authored once; it radiates into every panel whose subject it touches.

## Decision

### 1. The playlist entity

A new entity directory `carnatic/data/playlists/*.json`, one file per playlist, mirroring `recordings/`:

```jsonc
{
  "id": "great_begada",                       // snake_case, permanent (Librarian rule)
  "title": "Great Begada",
  "description": "A walk through memorable Begada renditions.",
  "items": [
    {
      "media_key": "youtube:abc123",          // ADR-154 MediaRef identity
      "start_seconds": 372,                    // ADR-156 span start (0 for whole-video)
      "end_seconds": 641,                      // optional; span end → advance trigger
      "recording_id": "some_concert_1972",     // optional: which recording this span lives in
      "composition_id": "sankari_neeve",       // optional back-reference targets…
      "raga_id": "begada",                     // …that power the PLAYLISTS panel sections
      "musician_ids": ["voleti_venkateswarlu"],
      "note": "Voleti, 1972"
    }
  ],
  "sources": [],                               // may be empty — see §2
  "kind": "user"                               // distinguishes user-authored from curated
}
```

Items reuse ADR-154 `media_key` and ADR-156 span fields, so a single playlist freely mixes whole videos, spans inside concert recordings, and lecdem chapters. The optional `composition_id` / `raga_id` / `musician_ids` per item are **denormalised back-reference targets** — they are what §4 indexes to decide which panels a playlist appears in. (They can be derived from the recording's segment metadata at author time, so the user rarely types them.)

### 2. User-authored ≠ curated — relax the sourcing rule, fence the namespace

Playlists carry `kind: "user"` and are **exempt from the Wikipedia/source requirement** that governs musician/raga/composition nodes — a personal sequence is a point of view, not a sourced claim. To keep this from eroding the Librarian's provenance discipline elsewhere:
- Playlists live in their own directory and their own `kind`, never mixed into the sourced entities.
- `id` permanence still holds (ADR-085 / Librarian rule): a playlist id, once published, is not renamed.
- Validation (`writer.py`) checks referential integrity only: every `media_key` resolves, every referenced `recording_id`/`composition_id`/`raga_id`/`musician_id` exists. No source-URL gate.

### 3. The add gesture — explicit `+`, never an overloaded double-click

Every play control (in panels, brackets, tracklists, and the ADR-162 queue rows) gains a small **adjacent `+` affordance**: "add this to a playlist." The play button keeps doing exactly what it does today (open/play); the `+` is a separate, discoverable target. This:
- avoids the ADR-142 (chip dblclick-edit) and ADR-158 (video double-tap-seek) collisions entirely,
- is touch-friendly and visible (the user asked for a *powerful indication* the affordance exists — an always-visible `+` is more discoverable than any hidden gesture),
- reuses the existing play-button plumbing without overloading its semantics.

Tapping `+` opens a small menu whose choices map **directly onto bundle ops** (§6), so the affordance *is* the patch loop, not a sidecar to it:

| Menu choice | Effect |
|---|---|
| **Add to session queue** | Ephemeral only — pushes onto the ADR-162 `MediaQueue`. No bundle item. |
| **Add to playlist "X"** | Emits `addToBundle('playlists', { op:"append", id:"X", array:"items", value:{…item…} })`. |
| **Save queue / new playlist…** | Emits `addToBundle('playlists', { op:"create", id, title, items:[…] })` — typically from the ADR-162 queue panel's "Save as playlist" action, turning the current session queue into a `create` op. |

Adding a track therefore drops an op into the *same* `baniBundle` every form uses; the existing "⬇ Patch (N ops)" button downloads it; `bani-add` applies it. The `+` is a **menu trigger**, styled with the ADR-161 button vocabulary. (Rejected alternative: overloading double-click — documented in §Consequences as the collision we avoided.)

### 4. PLAYLISTS sections in both panels — bidirectional back-reference

At render time the pipeline builds a **playlist back-index** in `graph.json` (alongside the existing `ragaToNodes`, `compositionToNodes`, `musicianToPerformances` maps): for each playlist item, register the playlist under each of its participant ids:

```
playlistsByMusician[musician_id]   → [playlist_id, …]
playlistsByRaga[raga_id]           → [playlist_id, …]
playlistsByComposition[comp_id]    → [playlist_id, …]
```

Then a new **"PLAYLISTS" section** (built with the ADR-128 `buildSection` pattern, like CONCERTS / RECORDINGS) is rendered in:
- the **musician panel** — every playlist that includes any item by this musician,
- the **raga panel** — every playlist with an item in this raga,
- the **composition panel** — every playlist containing this composition.

So "Great Begada" appears under Voleti, under Begada, and under *Sankari Neeve* — automatically, from the one playlist file, with no per-panel authoring. Each PLAYLISTS row shows the playlist title + a "Play" that hands the playlist to the ADR-162 queue panel (a saved playlist *opens into* the same Up-Next surface), and the `+`/edit affordances per ADR-142's entity-chip conventions if we make the playlist itself an editable chip (optional, future).

### 5. Cross-recording continuation — the true test

A playlist drives the ADR-162 queue. When the current item is a **span inside a recording** (`end_seconds` set), advance is triggered by **either** the ADR-156 span-end crossing **or** the ADR-155 `ended` event, whichever comes first:
- span-end while the video continues → advance to the **playlist's** next item (which may be a different recording, a different provider, or a standalone track), *not* the recording's next segment. The source video keeps existing; the playlist simply leaves it.
- This is precisely the behaviour ADR-157 Phase A's `MediaQueue.advance()` (`media_player.js:1229–1247`) already models for whole items; here it must additionally honour `end_seconds` as an advance trigger. ADR-162 already adds span/`jumpTo` handling, so this is an incremental extension, not new machinery.

The acceptance test is exactly the user's stated one: a playlist whose first item is a 5-minute span inside a 2-hour concert must, at the 5-minute mark, jump to item two — proving the playlist is the controlling sequence, not the recording.

### 6. Write surface — playlists are a new *item type* on the existing patch loop, not a new mechanism

A playlist is the **seventh entity in `baniBundle`**, and it rides the loop the team already trusts (ADR-083/085). There is no bespoke "save playlist" path. The integration is the same six hook-points every prior entity used:

1. **Entry side (`entry_forms.js`):** add `playlists: []` to the `baniBundle` accumulator (it currently holds ragas/composers/musicians/compositions/recordings/edges). The §3 `+` menu and the ADR-162 queue panel's "Save as playlist" call `addToBundle('playlists', op)`. `downloadBundle()` is **unchanged** — it already serialises whatever is in `baniBundle` into `bani_add_patch.json`. A saved playlist appears in the very same "⬇ Patch (N ops)" download as any musician or recording the user added in that session.

2. **Bundle envelope (ADR-083):** no schema bump. `bani-add` rejects only *unknown* item-type keys, so once `playlists` is whitelisted (below) it is valid at the current `schema_version: 2` — adding a key is additive.

3. **Ops (ADR-097), reused verbatim:**
   - `op:"create"` — a whole new playlist (id, title, description, items[], `kind:"user"`, `sources:[]`).
   - `op:"append"` — add one item: `{ "id":"great_begada", "array":"items", "value": { media_key, start_seconds, end_seconds?, … } }`.
   - `op:"patch"` — edit a scalar field (title, description, reorder via a future field).
   - `op:"annotate"` — append a note.

4. **`bani-add` dispatch (`bani_add.py`):** add `"playlists"` to `KNOWN_ITEM_TYPES`; add a `_process_playlists()` processor (mirroring `_process_ragas`/`_process_recordings`) that dispatches the four ops to writer methods; slot it into the fixed processing order **after** ragas/compositions/musicians/recordings, so every `media_key`/`composition_id`/`raga_id`/`musician_id` an item references already exists and referential validation can run.

5. **`writer.py` (sole validation site, ADR-016):** add `PATCHABLE_PLAYLIST_FIELDS`, the dir-mode storage helpers (`_playlist_file` / `_load_all_playlists` / `_write_playlist` / `_append_playlist`, atomic `os.replace`), and `add_playlist` / `patch_playlist` / `append_to_playlist_items`. Validation is **referential-integrity only** per §2 (every reference resolves; `kind:"user"` exempts the source-URL gate); `id` immutable; duplicate-id → skip, exactly like every other entity.

6. **Render side:** the pipeline (`data_loaders.py` → `graph_builder.py` → `html_generator.py`) loads `playlists/*.json` and emits the §4 back-index; `bani-render` paints the PLAYLISTS sections.

The loop closes exactly as ADR-085 specifies, with **no new write surface to secure** — the same download-patch → `bani-add` → `writer` → `bani-render` path, one new item type bolted into its six known sockets. This removes the "browser-save is risky, stage it later" caveat from earlier drafts: saving a playlist is mechanically identical to adding a recording, which already works end-to-end.

## Consequences

**Positive**
- Delivers the roadmap's terminal goal: durable, shareable, curated sequences that span recordings and providers.
- Bidirectional discovery — one playlist file radiates into every participant's panel — makes the graph materially more navigable, justifying the write-surface cost.
- Reuses ADR-162's queue panel for playback, ADR-128's `buildSection` for display, **and the ADR-083/085 patch loop for persistence**: the playlist is new *data*, not new *interaction* and not a new *write mechanism*. Saving a playlist is mechanically identical to adding a recording.
- The explicit `+` sidesteps the double-click collision cleanly and is more discoverable than any gesture.
- No new write surface to secure: one new item type in the six known sockets of an audited loop, so the ADR-085 review burden is "is this entity sound?", not "is this save path safe?"

**Negative / costs**
- Still the **largest** of the five ADRs — a new entity, directory, render-pipeline loading, back-index, and two new panel sections — touching Librarian, Coder, and the render pipeline, and per ADR-085 needing PR review before `main`. But the *scary* part (a bespoke browser-save) is gone: it's the existing download-patch flow with one more item type.
- **First user-authored entity** breaks the "everything is sourced" invariant; §2 fences it (`kind:"user"`, own directory, referential-only validation), but it is a genuine widening of what the graph holds, and the Librarian must agree to the carve-out.
- Back-index inflates `graph.json`; bounded by playlist count, which is small initially.
- The save round-trip is **not instant**: like every other contribution, a saved playlist is a downloaded patch the user (or a maintainer) runs through `bani-add`, then re-renders — it does not appear in the panels until the loop completes. This is the accepted, consistent cost of the trusted single-write-path; an in-place optimistic preview is explicitly out of scope.

## Implementation (for Librarian + Coder, after acceptance)

**Architect (now):** this ADR. On acceptance, update Status → Accepted before implementation.

**Librarian:**
1. Define `playlists/*.json` schema in a new `carnatic/data/playlists/READYOU.md` (mirror `recordings/READYOU.md`), documenting the `kind:"user"` source carve-out (§2) and the bundle ops (§6.3).
2. Author one or two seed playlists by hand-writing a `bani_add_patch.json` with `op:"create"` items and running it through `bani-add` (e.g. "Great Begada") — proving the loop before any UI exists.

**Coder — write side (§6), the patch loop:**
3. `writer.py`: add `PATCHABLE_PLAYLIST_FIELDS`, dir-mode storage helpers (atomic), and `add_playlist` / `patch_playlist` / `append_to_playlist_items`, with referential-integrity-only validation (§2 — no source gate; id immutable; dup-id → skip).
4. `bani_add.py`: whitelist `"playlists"` in `KNOWN_ITEM_TYPES`; add `_process_playlists()` dispatching create/patch/append/annotate to the writer; slot it into the processing order after recordings (§6.4).
5. `entry_forms.js`: add `playlists: []` to `baniBundle`; `downloadBundle()` needs no change. (No `schema_version` bump — §6.2.)

**Coder — read/render side:**
6. Load `playlists/*.json` in the render pipeline (`data_loaders.py` → `graph_builder.py` → `html_generator.py`); emit the `playlistsByMusician/Raga/Composition` back-index in `graph.json` (§4).
7. Render the PLAYLISTS `buildSection` in musician, raga, and composition panels from the back-index (§4); each row plays into the ADR-162 queue panel.

**Coder — capture & playback UI:**
8. Add the `+` affordance (§3) beside play controls; wire its menu choices to the three `addToBundle('playlists', …)` ops (queue-only emits no op); add the ADR-162 queue panel's "Save as playlist" → `op:"create"`. Style per ADR-161.
9. Extend the ADR-162 queue/`MediaQueue` advance to treat `end_seconds` as an advance trigger for span items (§5) — cross-recording continuation.
10. Run `.venv/bin/bani-render`; `python3 carnatic/cli.py validate`.

**Test Engineer:**
11. `bani-add` applies a `playlists` `op:"create"` and `op:"append"` patch into `playlists/*.json`; rejects dangling `media_key`/reference; accepts empty `sources` for `kind:"user"`; rejects an unknown item-type key but accepts `playlists` at `schema_version: 2`.
12. The `+` menu and "Save as playlist" deposit the correct ops into `baniBundle`, and the existing "⬇ Patch" download contains them alongside any other session ops.
13. A playlist with a Voleti/Begada/*Sankari Neeve* item appears in all three panels' PLAYLISTS sections (post-render).
14. **Cross-recording continuation**: a span item with `end_seconds` advances to the playlist's next item at span end while the source video continues (the headline test).
15. Mixed-provider playlist advances across YouTube/Vimeo/lecdem items; uncontrollable-item pause honoured (ADR-157).
16. `+` adds without collision with chip dblclick-edit (ADR-142) or video double-tap-seek (ADR-158).

**Branch**: `adr/163-persistent-playlists` → **PR required** (new entity + new `bani-add` item type, ADR-085).

---
[ADR: ADR-163, ADR-157, ADR-162, ADR-154, ADR-156, ADR-085, ADR-083, ADR-097, ADR-128, ADR-142, ADR-158]
[AGENTS: graph-architect]
