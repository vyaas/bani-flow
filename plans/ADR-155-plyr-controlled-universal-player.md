# ADR-155: Plyr-Controlled Universal Player (Control Inversion)

**Status**: Proposed
**Date**: 2026-06-09
**Agents**: code-auditor (AUDIT-014) → graph-architect → carnatic-coder
**Depends on**: ADR-154 (MediaRef + provider registry). **Depended on by**: ADR-156, ADR-157.

---

## Context (forces in tension)

AUDIT-014 (F-04, F-05) established the central defect: **we render the player but do not control it.** The current player is a bare `<iframe>` showing YouTube's own controls. There is no JS API handle — a repo-wide grep finds no `enablejsapi`, `YT.Player`, `postMessage`, `getCurrentTime`, or `seekTo`. Two consequences follow:

- **"Seeking" is destruction**: jumping to a track reloads `iframe.src` with a new `&start=` (`media_player.js:371`). The stream restarts; buffering is lost; there is no smooth scrub.
- **State is a lie**: `currentOffset` is set only when a track row is clicked (`media_player.js:372`); it is never read from the playhead. "Share at current time" (`:682`) and the permalink `state.t` (`:57`) therefore capture the last *clicked* offset, not where playback actually is.

The roadmap explicitly asks to "control play and pause through our own buttons and not the ones inside the player," and to build "seek functionality and finer ways to tag data." Both require an API handle on the player. The forces:

- **Source-agnosticism**: arc 1 (ADR-154) lets us *identify* any provider; we now need one *control* contract that spans YouTube, Vimeo, and direct audio/video uniformly. Writing per-provider control code (YT IFrame API + Vimeo Player SDK + HTML5 `<video>`) by hand re-fragments what ADR-154 unified.
- **Build discipline**: the project has no runtime third-party JS dependency today; the render pipeline assembles templates. Introducing Plyr means deciding how it is vendored.
- **Provider reach vs. effort**: a hand-rolled multi-SDK abstraction is months of surface area; an off-the-shelf library that already normalises YouTube + Vimeo + HTML5 behind one API is the pragmatic centre.

## Pattern

**Levels of Scale + a single Strong Centre for control.** Instead of N provider-specific control surfaces nested awkwardly inside our chrome, one control abstraction (the Plyr instance) sits at the centre of every player, and our chrome speaks only to it. The provider differences live one level down, inside Plyr's source descriptor — exactly where ADR-154's boundary layer belongs.

## Decision

### 1. Adopt Plyr as the single control abstraction

Replace the raw `<iframe>` in `createPlayer` with a [Plyr](https://github.com/sampotts/plyr) instance. Plyr natively normalises **YouTube, Vimeo, and HTML5 audio/video** behind one API (`player.play()`, `player.pause()`, `player.currentTime`, `player.duration`, and events `ready` / `timeupdate` / `ended`). Our chrome buttons drive that API; YouTube's native control bar is suppressed (`controls: []` plus Plyr's own control set, or a fully custom control set wired to our buttons).

### 2. Control inversion — the concrete changes

| Today (uncontrolled) | After (controlled) |
|---|---|
| `iframe.src = ytEmbedUrl(vid, off)` to seek (`:371`) | `player.currentTime = off` (no reload, smooth seek) |
| `currentOffset` = last clicked track (`:372`) | `currentOffset` = live `player.currentTime`, updated on `timeupdate` |
| Native YT play/pause | our buttons → `player.togglePlay()` |
| No end-of-media signal | `player.on('ended', …)` — the hook ADR-157 needs |
| Share/permalink capture stale offset | capture true `currentTime` (fixes AUDIT-014 F-04) |

### 3. Provider → Plyr source descriptor (extends ADR-154)

ADR-154's `embed(ref)` method is finalised here: each provider maps its `MediaRef` to a Plyr source object.

```js
// media_providers.js — embed strategy per provider (JS mirror)
youtube:    ref => ({ type: 'video', sources: [{ src: ref.provider_id, provider: 'youtube' }] })
vimeo:      ref => ({ type: 'video', sources: [{ src: ref.provider_id, provider: 'vimeo'   }] })
audio:      ref => ({ type: 'audio', sources: [{ src: ref.url, type: 'audio/mpeg' }] })
video:      ref => ({ type: 'video', sources: [{ src: ref.url, type: 'video/mp4'  }] })
```

### 4. Providers Plyr does NOT natively drive — explicit boundary

Plyr does **not** natively control **SoundCloud** or **Google Drive** playback. This ADR does not pretend otherwise. The provider registry marks each provider with a `controllable` flag:

- `controllable: true` (youtube, vimeo, audio, video) → full Plyr control, seek, chapters (ADR-156), playlist auto-advance (ADR-157).
- `controllable: false` (soundcloud, gdrive) → rendered via their native embed inside our shell, with our transport buttons disabled/hidden and a small "opens in source player" affordance. They remain first-class for *identity, tagging, and linking* (ADR-154) but degrade gracefully on *control*.

SoundCloud-via-Widget-API and Drive-via-direct-file-URL are possible future upgrades to `controllable: true`; each would be its own small follow-on, not a blocker here.

### 5. Dependency vendoring

Plyr is **vendored into the render pipeline**, not pulled from a CDN at runtime, to keep `graph.html` self-contained and offline-capable (consistent with the project's single-artifact philosophy). The Coder decides the exact mechanism (inlined minified JS/CSS asset emitted by the render step); this ADR fixes only the *constraint*: no runtime third-party network dependency.

## Consequences

**Positive**
- One control API spans every controllable provider; our buttons finally drive playback (roadmap goal 2).
- Smooth seek (no reload), accurate share-at-time, and the `ended`/`timeupdate` events that unlock ADR-156 and ADR-157.
- Plyr's theming hooks let the controlled bar match the Gruvbox visual world.

**Negative / costs**
- First runtime third-party dependency. Mitigated by vendoring and Plyr's small, dependency-free footprint.
- A meaningful rewrite of `createPlayer` / `openOrFocusPlayer` and the seek/track-click path in `media_player.js`. The drag/resize/copy/share chrome is preserved; only the transport core changes.
- SoundCloud/Drive remain uncontrolled for now — a documented, intentional gap, not a regression (they are *new* providers, previously unrepresentable).

## Implementation (for Coder, after acceptance + ADR-154 landed)

1. Vendor Plyr JS+CSS as a render-pipeline asset; theme to Gruvbox tokens (ADR-028).
2. Rewrite `createPlayer` to instantiate Plyr from the provider's embed descriptor; keep the shell chrome.
3. Replace reload-as-seek with `player.currentTime`; wire `timeupdate` → live `currentOffset`; wire our buttons to `togglePlay`.
4. Gate transport UI on the provider's `controllable` flag; render native embed + affordance when false.
5. Update share/permalink to read live `currentTime`.
6. Test Engineer: controllable-vs-uncontrolled rendering per provider; seek updates `currentOffset`; `ended` fires; permalink captures live offset.

**Branch**: `adr/155-plyr-controlled-universal-player` → PR.

---
[ADR: ADR-155, ADR-154]
[AGENTS: code-auditor, graph-architect]
