# AUDIT-014: Embedded Player — Source Coupling & Control Surface

**Date**: 2026-06-09
**Auditor**: 🔍 Code Auditor
**Scope**: The full media-player stack — `carnatic/render/templates/media_player.js` (3182 lines), its render-pipeline feeders (`data_loaders.py`, `graph_builder.py`, `data_transforms.py`), and every consumer of the `vid` key (`bani_flow.js`, `entry_forms.js`, `panel_components.js`).
**Trigger**: Roadmap request to (1) accept media from non-YouTube providers (Vimeo, SoundCloud, Google Drive, …), (2) override the YouTube native control bar with [Plyr](https://github.com/sampotts/plyr) for source-agnostic, programmatic control (play/pause/seek), and (3) enable timestamped chapter tagging and, eventually, playlists.

This report observes and routes. It writes no code and proposes no schema — schema-level findings go to the **🏛️ Graph Architect** (ADR candidates); code-level findings go to the **🎵 Carnatic Coder** (refactor tasks, *after* the ADRs are accepted).

---

## 1 — Executive summary

The player is **structurally welded to YouTube at three layers**: the **identity layer** (an 11-char YouTube video ID, `vid`, is the universal primary key), the **URL layer** (a YouTube-only regex is the sole URL parser, and embed URLs are hardcoded to `youtube.com/embed`), and the **control layer** (a bare `<iframe>` with no JS API — "seeking" is a full `src` reload). None of the three roadmap goals is reachable without breaking that weld.

The good news: the source of truth is clean. Recordings and `youtube[]` entries store a **`url` string**; `vid` is a *derived* render-time value, not stored data. So generalisation is overwhelmingly a **code + render-pipeline** problem, not a data-migration problem. The data model needs only additive schema (provider tagging is derivable; chapters and playlists are genuinely new).

---

## 2 — Findings

### F-01 · `vid` is the universal, YouTube-only primary key
**Files**: `media_player.js:2-3`, `:50-83` (permalink), `bani_flow.js:131-138, 391-393, 547-580, 1710` (node-id scheme)
**Pattern**: Provider-locked identity — a vendor-specific token used as a domain primary key
**Evidence**:
```js
// media_player.js:2-3
// Registry: vid (11-char YouTube ID) → player instance { el, iframe, titleEl, vid }
const playerRegistry = new Map();
```
```js
// bani_flow.js:1710 — YouTube-only graph node id scheme
//   - 'yt':   "vid::ragaId"
```
The `vid` flows everywhere: the registry is keyed by it; DOM elements carry `data-vid`; YouTube-only graph nodes are identified as `"${vid}::${ragaId}"`; the shareable permalink encodes `state.vid` (`media_player.js:56`). There is no provider dimension anywhere in this key. A Vimeo or SoundCloud item has no representable identity in the current model.
**Impact**: Blocks roadmap goal 1 at the root. Every keyed lookup, DOM hook, and permalink assumes a single namespace of 11-char YouTube IDs.

### F-02 · URL → id derivation is a single YouTube-only regex; non-matching URLs are silently dropped
**Files**: `data_loaders.py:12-14`, `graph_builder.py:54-58, 140-141`
**Pattern**: Closed parser on an open-world input + silent drop
**Evidence**:
```python
# data_loaders.py:12-14
def yt_video_id(url: str) -> "str | None":
    """Extract an 11-character YouTube video ID from any YouTube URL form."""
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
```
```python
# graph_builder.py:54-55
vid = yt_video_id(t.get("url", ""))
if vid:                          # ← non-YouTube urls fall through; track is dropped
    ...
```
A `vimeo.com/…` or `soundcloud.com/…` URL returns `None` and the track is silently omitted from the graph — exactly the Librarian anti-pattern called out in `.clinerules` ("never silently drop an unmatched link"), here enforced by the *code*, not the curator.
**Impact**: Blocks goal 1. There is one parser and it speaks only YouTube.

### F-03 · Embed/share URL construction is hardcoded to YouTube
**File**: `media_player.js:7-15`
**Pattern**: Hardcoded provider endpoint, no dispatch
**Evidence**:
```js
function ytEmbedUrl(vid, startSeconds) {
  const t = (startSeconds && startSeconds > 0) ? `&start=${startSeconds}` : '';
  return `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0${t}`;
}
function ytDirectUrl(vid, startSeconds) { return `https://youtu.be/${vid}${...}`; }
```
Called at `media_player.js:371` (track-click seek), `:637-640` (initial iframe), `:682, :715` (copy/share). Every embed path assumes the YouTube embed contract (`?autoplay&rel=0&start=`). There is no per-provider embed strategy.
**Impact**: Blocks goal 1. Even with a generalised id, the player would still build a YouTube URL.

### F-04 · No player JS API — "seek" is a full iframe reload; `currentOffset` is not the live playhead
**Files**: `media_player.js:367-379` (track seek), `:635-640` (iframe), `:372` vs `:682, :2488-2499`
**Pattern**: Reload-as-seek; manually-tracked state that diverges from reality
**Evidence**:
```js
// media_player.js:371-372 — "seeking" to a track = destroy + recreate the stream
player.iframe.src = ytEmbedUrl(vid, t.offset_seconds > 0 ? t.offset_seconds : undefined);
player.currentOffset = t.offset_seconds;
```
A repo-wide grep confirms **zero** use of `enablejsapi`, `YT.Player`, `onYouTubeIframeAPIReady`, `postMessage`, `getCurrentTime`, or `seekTo`. `currentOffset` is set only when the user *clicks a track row* (`:372`); it is never read back from the actual playhead. So the "share at current time" feature (`:682, :715`) and the permalink `state.t` (`:57`) capture the last *clicked* offset, not where the video actually is. Pausing, scrubbing the native YouTube bar, or letting it play past a track boundary leaves `currentOffset` stale.
**Impact**: Blocks goals 2 and 3 entirely. Without an API handle, our own buttons cannot drive play/pause/seek, chapter markers cannot seek, and playlists cannot auto-advance (no `ended` event). This is the central technical reason the roadmap requires Plyr (or the raw YT IFrame API): **we render the player but do not control it.**

### F-05 · Native YouTube controls; our chrome cannot reach them
**Files**: `media_player.js:390-461` (player bar), `:617-748` (createPlayer)
**Pattern**: Two disjoint control surfaces — vendor's inside the frame, ours around it
**Evidence**: `createPlayer` builds a draggable/resizable shell with close/copy/share/tracklist chrome (`:390-461`), but the actual transport controls are YouTube's own, rendered inside the opaque iframe. Our chrome and the video's controls share no state.
**Impact**: Blocks goal 2's explicit ask ("control play and pause through our own buttons and not the ones inside the player").

### F-06 · Timestamp/segment data exists but only as reload targets; no chapter-with-subject model
**Files**: recordings schema `performances[].timestamp/offset_seconds` (`data/recordings/READYOU.md`), `media_player.js:287-388` (track list), `youtube_kinds.py` (`lecdem` kind)
**Pattern**: Latent capability with no control to express it
**Evidence**: Recordings already carry per-performance `offset_seconds`, and `youtube[]` lecdem entries (ADR-077/078) carry segments. But the UI can only *jump* to them via `src` reload (F-04), and there is **no schema field for a chapter's "subject/topic"** — the roadmap's "lecdem chapters with subjects." Lecdem segment tagging is partial and cannot be surfaced as on-timeline markers because there is no timeline we control.
**Impact**: Schema gap for goal 2's finer-tagging ambition. Routed to Architect.

### F-07 · `sources[].type` is an overloaded enum, unfit as a provider discriminator
**Files**: `writer.py:74` (`VALID_SOURCE_TYPES`), recordings data
**Pattern**: One field, two meanings (see AUDIT-005)
**Evidence**: A scan of recording `"type"` values returns a mix of *segment* types (`kriti` ×79, `alapana` ×58, `tani` ×24, `varnam` …) and *source* kinds (`youtube` ×8, `archive`, `pdf`, `other` ×45). The field cannot be repurposed as a clean provider discriminator; provider identity must be derived from the URL, not from this field.
**Impact**: Confirms that provider detection belongs in a URL-parsing layer (F-02), not in existing data fields.

---

## 3 — Recommendations (summary)

1. Introduce a **provider abstraction**: a registry where each provider owns `match(url)` / `parse(url)` / `embed(ref)`, and replace the bare `vid` key with a provider-qualified media key. *(schema → Architect)*
2. Generalise the render pipeline parser: `yt_video_id` → a `parse_media_url` that returns `{provider, id, start}` or flags an unmatched URL instead of dropping it. *(code → Coder, under the ADR)*
3. Adopt **Plyr** and invert control: wrap each player in a Plyr instance, drive play/pause/seek via its API, make `currentOffset` the live `currentTime`, and replace reload-as-seek. *(schema decision + code → Architect then Coder)*
4. Add a **chapter/segment-with-subject** schema, surfaced as seekable markers on the controlled timeline. *(schema → Architect)*
5. Define a **playlist** model (start ephemeral/client-side; persistent entity later) enabled by the `ended` event the controlled player exposes. *(schema → Architect)*

---

## 4 — Routing

| Finding | Concern | Routed to | Becomes |
|---|---|---|---|
| F-01, F-02, F-03 | Provider abstraction, media-key identity, URL parsing | 🏛️ Graph Architect | **ADR-154** (Source-Agnostic Media Providers) |
| F-04, F-05 | Control inversion, Plyr adoption, live playhead | 🏛️ Graph Architect | **ADR-155** (Plyr-Controlled Universal Player) |
| F-06 | Chapter/segment-with-subject schema | 🏛️ Graph Architect | **ADR-156** (Timestamped Segments & Chapters) |
| roadmap goal 3 | Playlist model | 🏛️ Graph Architect | **ADR-157** (Media Playlists) |
| all implementation | Pipeline + JS refactor | 🎵 Carnatic Coder | follow-on, after ADRs accepted |

No source file was modified in this audit.
