# ADR-154: Source-Agnostic Media Provider Abstraction

**Status**: Proposed
**Date**: 2026-06-09
**Agents**: code-auditor (AUDIT-014) → graph-architect → carnatic-coder
**Supersedes**: nothing. Generalises the implicit YouTube-only contract assumed across the player stack.

> This ADR is the **keystone of the player-generalisation roadmap**. It defines the identity and parsing layer that ADR-155 (Plyr control), ADR-156 (chapters), and ADR-157 (playlists) all build on. Accept this first; the others depend on it.

---

## Roadmap framing

The embedded player must evolve along three arcs:

1. **Many sources, not one** — ingest and render YouTube, Vimeo, SoundCloud, Google Drive, and direct audio/video, each parsed and embedded by its own strategy. *(this ADR)*
2. **We control the player** — replace YouTube's native controls with [Plyr](https://github.com/sampotts/plyr) so play/pause/seek run through our own surface, enabling live-playhead share and finer tagging. *(ADR-155)*
3. **Structured time and sequence** — timestamped chapters with subjects (ADR-156) and playlists (ADR-157), both of which are only possible once we control the player (arc 2) and can address any source uniformly (arc 1).

Arc 1 is the foundation: it gives every media item a **provider-qualified identity** and a **per-provider parse/embed strategy**, replacing the 11-char YouTube `vid` that AUDIT-014 found welded into the registry, the DOM, the permalink, and the graph node-id scheme.

---

## Context (forces in tension)

- **Fidelity to the oral tradition**: recordings of this music live wherever an archivist put them — All India Radio rips on YouTube, sabha uploads on Vimeo, private collectors' files on Google Drive, audio-only restorations on SoundCloud. A YouTube-only player erases the rest of the archive. *Significance must not be gated by hosting accident.*
- **Queryability**: today a non-YouTube URL is silently dropped at `graph_builder.py:54` (`if vid:`). The model cannot even *represent* a Vimeo track, so it cannot be queried, tagged, or linked.
- **Scalability of the model**: each new provider should cost one small, isolated strategy object — not edits scattered across `data_loaders.py`, `graph_builder.py`, `media_player.js`, `bani_flow.js`, and `entry_forms.js`.
- **Continuity**: `vid` appears in live permalinks (`#s=…` encodes `state.vid`) and in graph node ids (`"vid::ragaId"`). Any new identity scheme must degrade gracefully for old links and old ids.
- **Data stability**: the source of truth already stores a **`url` string**, not a `vid`. We must keep it that way — provider and id are *derived*, never hand-authored.

## Pattern

**Strong Centres + Boundaries** (Alexander). A piece of media is a *strong centre* — it deserves a stable, first-class identity (`MediaRef`) independent of who hosts it. The set of providers is a *boundary layer*: a thin, uniform membrane through which any URL passes to become a `MediaRef`, and through which a `MediaRef` becomes something embeddable. The centre is provider-agnostic; the boundary absorbs all provider-specific knowledge.

## Decision

### 1. `MediaRef` — the provider-qualified identity

Introduce a derived value object computed at render time from a stored `url`:

```jsonc
// derived — NOT stored in data files
{
  "provider":    "youtube",        // registry key: youtube | vimeo | soundcloud | gdrive | audio | video
  "provider_id": "_rj8fHJiSLA",    // provider-native id (or full path for file providers)
  "url":         "https://youtu.be/_rj8fHJiSLA",
  "start":       0                 // seconds, parsed from url fragment if present
}
```

The **media key** that replaces bare `vid` is `"${provider}:${provider_id}"` — e.g. `youtube:_rj8fHJiSLA`, `vimeo:824804225`. This is what the player registry is keyed by, what DOM elements carry (`data-media-key`), and what graph node ids embed.

### 2. Provider registry (one strategy per provider)

A provider is a small object implementing three methods. The **Python side** owns parse (render pipeline); the **JS side** owns embed (browser). The two registries are mirrors, like `youtube_kinds.py` ⇄ `youtube_kinds.js`.

```python
# carnatic/render/media_providers.py  (Coder — under this ADR)
# Each provider: id, match(url)->bool, parse(url)->{provider, provider_id, start} | None
PROVIDERS = (YouTubeProvider, VimeoProvider, SoundCloudProvider, GDriveProvider, FileProvider)

def parse_media_url(url: str) -> "dict | None":
    """Replaces yt_video_id. Returns a MediaRef dict, or None if no provider matches."""
    for p in PROVIDERS:
        if p.match(url):
            return p.parse(url)
    return None     # caller logs an unmatched url — never silently drops (cf. AUDIT-014 F-02)
```

```js
// carnatic/render/templates/media_providers.js  (Coder — under this ADR; mirror)
// Each provider also declares embed(ref) → a descriptor the player layer consumes.
// (The concrete embed contract is finalised in ADR-155, which targets Plyr.)
```

Provider set for the first cut: **youtube, vimeo, soundcloud, gdrive, audio (direct file), video (direct file)**. Adding a provider later = appending one strategy object to both mirrors. No other file changes.

### 3. Schema before / after

The **data files do not change** — `url` remains the only stored locator. What changes is the *derived graph artifact* the render pipeline emits.

**Before** (`graph_builder.py` track object):
```jsonc
{ "vid": "_rj8fHJiSLA", "label": "Jagadananda Karaka", "raga_id": "nata" }
```
**After**:
```jsonc
{
  "media":  { "provider": "youtube", "provider_id": "_rj8fHJiSLA",
              "url": "https://youtu.be/_rj8fHJiSLA", "start": 0 },
  "label":  "Jagadananda Karaka",
  "raga_id": "nata"
}
```
A back-compat `vid` field MAY be emitted alongside `media` during the transition (equal to `provider_id` when provider is youtube, else absent) so existing consumers keep working until the Coder migrates them.

### 4. Node-id and permalink continuity

- **Graph node ids**: `"vid::ragaId"` → `"mediaKey::ragaId"` (e.g. `youtube:_rj8fHJiSLA::nata`). A read-time shim treats a bare 11-char left segment as `youtube:<that>` so old ids resolve.
- **Permalinks**: bump `state.v` to `2`; add `state.m = mediaKey`. A `v:1` permalink (with `state.vid`) is read as `youtube:<vid>`. No live link breaks.

## Consequences

**Positive**
- Any current or future provider is representable, queryable, and linkable. Vimeo/SoundCloud/Drive recordings stop being silently dropped.
- Provider knowledge is quarantined in one registry pair; the rest of the stack speaks `MediaRef`.
- Unmatched URLs become a *logged* curation signal, not a silent void (fixes AUDIT-014 F-02).

**Negative / costs**
- Touches the identity spine: every `vid` reader (`media_player.js`, `bani_flow.js`, `entry_forms.js`) must move to `mediaKey`/`media`. Large but mechanical; the back-compat `vid` shim lets it land incrementally.
- Permalink versioning and the node-id shim are permanent compatibility debt we accept deliberately.
- Provider embed differences (esp. SoundCloud, which Plyr does not natively drive) surface in ADR-155, not here — this ADR only fixes *identity and parsing*.

## Implementation (for Librarian + Coder, after acceptance)

**Librarian**: no data change required — `url` is already stored. Optionally audit existing `youtube[]`/`sources[]` for non-YouTube URLs that were being dropped and confirm they now ingest. Never hand-author `provider`/`provider_id`.

**Carnatic Coder**:
1. Add `carnatic/render/media_providers.py` with the provider registry and `parse_media_url`. Keep `yt_video_id` as a thin shim that calls it (delete once callers migrate).
2. Add the JS mirror `templates/media_providers.js` (parse for client-side entry forms + the embed descriptor stub finalised in ADR-155).
3. Update `graph_builder.py` / `data_transforms.py` to emit `media` objects (+ transitional `vid`).
4. Migrate `media_player.js` registry + DOM hooks from `vid` to `mediaKey`; migrate `bani_flow.js` node-id scheme with the youtube shim.
5. Bump permalink to `v:2` with the `v:1` read-compat path.
6. Test Engineer: provider parse table tests (one row per provider incl. malformed/unmatched), node-id shim tests, permalink v1→v2 round-trip.

**Branch**: `adr/154-source-agnostic-media-providers` → PR (new identity scheme; schema-adjacent; review before main).

---
*Depends on: nothing. Depended on by: ADR-155, ADR-156, ADR-157.*

[ADR: ADR-154]
[AGENTS: code-auditor, graph-architect]
