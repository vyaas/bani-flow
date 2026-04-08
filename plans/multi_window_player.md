# ADR-004: Multi-Window Aural Immersion Player

**Status:** Proposed  
**Date:** 2026-04-08

---

## Context

The rasika's primary mode of engagement with this graph is *aural*. The graph is a listening guide. The current architecture provides a single floating YouTube player (`#media-player`) that is a singleton: one iframe, one title bar, one `currentVid` global. Clicking any track replaces whatever was playing.

This is architecturally correct for casual browsing — one click, one sound. But it is insufficient for the deeper modes of engagement this project exists to serve:

- **Comparative study** — hearing Semmangudi and GNB sing the same kriti back-to-back, or the same raga in two different banis, requires switching between two live windows without losing either.
- **Raga immersion** — a rasika may want to open five recordings of Todi across different eras and move between them freely, returning to each at will, without reloading.
- **Gamaka study** — a student wants to loop a 30-second passage in one window while reading the graph in another. The current player has no loop control; but even without it, the ability to *park* a video at a timestamp and return to it is essential.
- **Bani Flow listening trail** — the trail lists recordings chronologically across a lineage. The rasika should be able to open the 1965 Poonamallee recording *and* the 1967 Wesleyan recording simultaneously and compare Ramnad Krishnan's treatment of the same raga across two concerts.

The current singleton model forces a choice: hear this *or* hear that. The tradition itself does not work this way. A guru plays a phrase; the shishya plays it back; the guru plays it again. Comparison is the method of transmission. The graph must honour this.

**Forces in tension:**

1. **Immersion** — multiple simultaneous windows enable the rasika to inhabit a raga for hours without losing context.
2. **Simplicity** — spawning unlimited windows creates clutter and cognitive load. The pattern must be *intentional*, not accidental.
3. **No data-schema changes** — the recording data model (`video_id`, `offset_seconds`, `display_title`, `performers`) already carries everything needed. This is a pure UI/rendering change. The Librarian and the data pipeline are unaffected.
4. **No breaking changes to `render.py`'s Python layer** — the HTML template changes; the Python data-building functions do not.
5. **Browser origin constraint** — YouTube embeds require a real HTTP origin (already satisfied by `serve.py`). Multiple iframes on the same page are permitted; YouTube does not restrict the count.

---

## Pattern

**Strong Centres** (Alexander) — each player window is a complete, self-contained centre of musical life. It has its own title, its own iframe, its own drag handle, its own close button. It is not a slot in a list; it is a *place* where music lives.

**Levels of Scale** — the graph is the largest centre (the tradition). A lineage chain is a smaller centre. A musician node is smaller still. A single recording is the smallest centre. The player window must operate at the scale of the recording: it belongs to one video, one context, one moment in the tradition. Multiple windows are multiple centres at the same scale, coexisting.

**Boundaries** — each window has a clear boundary (title bar, border, close button). The boundary makes the centre legible. Without it, multiple windows become visual noise.

---

## Decision

### 1. Replace the singleton player with a **player manager** pattern

Instead of one `#media-player` div in the HTML, the system maintains a **registry of live player instances** in JavaScript. Each instance is a dynamically created DOM element — a self-contained floating window — with its own iframe, title bar, drag handle, resize grip, and close button.

**No HTML changes to the static template** — the `#media-player` div is removed from the static HTML. Players are created entirely in JavaScript via a factory function.

### 2. Player factory: `createPlayer(vid, label, artistName, startSeconds)`

```javascript
// Returns a player instance object:
{
  el:       <div>,   // the root DOM element
  iframe:   <iframe>,
  titleEl:  <span>,
  vid:      string,
  close:    function,
}
```

Each call to `createPlayer()` produces a new, independent floating window. The window is appended to `#main` (the same container as the current singleton). Position is staggered: each new window is offset by `(24px, 24px)` from the previous one, so windows cascade visibly rather than stacking invisibly.

### 3. Player registry: `playerRegistry`

```javascript
const playerRegistry = new Map(); // vid → player instance
```

**Key invariant:** one player per `video_id`. If the rasika clicks a track whose `vid` is already open, the existing window is **brought to the front** (z-index raised) rather than spawning a duplicate. This prevents the accidental proliferation of identical windows.

The registry is keyed by `vid` (the 11-character YouTube video ID), not by node ID or track label. The same video may appear in multiple nodes (e.g. a duet credited to both performers); the registry ensures it is only ever open once.

### 4. `loadTrack()` becomes `openOrFocusPlayer()`

The current `loadTrack(vid, label, artistName, startSeconds)` function is replaced by:

```javascript
function openOrFocusPlayer(vid, label, artistName, startSeconds) {
  if (playerRegistry.has(vid)) {
    bringToFront(playerRegistry.get(vid));
    return;
  }
  const p = createPlayer(vid, label, artistName, startSeconds);
  playerRegistry.set(vid, p);
}
```

All existing call sites — node tap handler, `buildPerfPanel()`, Bani Flow trail — call `openOrFocusPlayer()` instead of `loadTrack()`. The call signature is identical; the change is transparent to callers.

### 5. Close behaviour

When a player's close button is clicked:
1. The player DOM element is removed from `#main`.
2. The entry is deleted from `playerRegistry`.
3. The iframe `src` is set to `''` before removal (stops audio immediately — critical for the multi-window case where the user may have forgotten a window is playing).

### 6. "Playing" state indicators

The current system marks sidebar track list items with class `playing` by comparing against `currentVid`. With multiple players, the concept of "the playing track" is replaced by "tracks that have an open player window."

```javascript
function refreshPlayingIndicators() {
  document.querySelectorAll('[data-vid]').forEach(el => {
    el.classList.toggle('playing', playerRegistry.has(el.dataset.vid));
  });
}
```

This function is called after every `openOrFocusPlayer()` and every player close. The visual indicator changes from "this is the one playing track" to "this track has an open window" — a meaningful distinction the rasika will understand immediately.

### 7. Z-index management

Players are stacked using a monotonically increasing z-index counter:

```javascript
let topZ = 800;
function bringToFront(player) {
  topZ += 1;
  player.el.style.zIndex = topZ;
}
```

Clicking anywhere on a player window (mousedown on the root element) calls `bringToFront()`. This gives natural window-manager behaviour without a full windowing system.

### 8. Cascade positioning

```javascript
let spawnCount = 0;
function nextSpawnPosition() {
  const offset = (spawnCount % 8) * 28; // wrap after 8 to avoid off-screen
  spawnCount += 1;
  return { top: 18 + offset, left: 18 + offset };
}
```

The modulo wrap (after 8 windows, `28 * 8 = 224px`) prevents windows from cascading off-screen on smaller displays. After 8 windows the cascade resets to near the origin — the rasika will see the overlap and manage their own layout.

### 9. No changes to data schema

The recording data model is unchanged:
- [`musicians.json`](carnatic/data/musicians.json) `youtube[]` arrays — unchanged
- [`recordings/`](carnatic/data/recordings/) structured concert files — unchanged
- [`compositions.json`](carnatic/data/compositions.json) — unchanged
- [`render.py`](carnatic/render.py) Python functions (`build_recording_lookups`, `build_composition_lookups`, `build_elements`) — unchanged

Only the JavaScript section of the HTML template (inside `render_html()`) changes.

---

## Before / After: Key Code Shapes

### Before — singleton HTML (static, in template)

```html
<!-- static in render_html() template -->
<div id="media-player">
  <div id="mp-bar">
    <span id="mp-title">—</span>
    <button id="mp-close">✕</button>
  </div>
  <div id="mp-video-wrap">
    <iframe id="mp-iframe" src="" allowfullscreen></iframe>
  </div>
  <div id="mp-tracks"></div>
  <div id="mp-resize"></div>
</div>
```

### After — no static player HTML; factory in JS

```javascript
// No static #media-player div in the template.
// Players are created dynamically:

const playerRegistry = new Map(); // vid → { el, iframe, titleEl, vid }
let topZ = 800;
let spawnCount = 0;

function createPlayer(vid, label, artistName, startSeconds) {
  const pos = nextSpawnPosition();
  const el = document.createElement('div');
  el.className = 'media-player';
  el.style.cssText = `top:${pos.top}px; left:${pos.left}px; z-index:${++topZ};`;

  el.innerHTML = `
    <div class="mp-bar">
      <span class="mp-title">${artistName ? artistName + ' — ' : ''}${label}</span>
      <button class="mp-close" title="Close">✕</button>
    </div>
    <div class="mp-video-wrap">
      <iframe class="mp-iframe"
        src="${ytEmbedUrl(vid, startSeconds)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
        allowfullscreen></iframe>
    </div>
    <div class="mp-resize" title="Drag to resize"></div>
  `;

  // wire close
  el.querySelector('.mp-close').addEventListener('click', () => {
    el.querySelector('.mp-iframe').src = '';
    el.remove();
    playerRegistry.delete(vid);
    refreshPlayingIndicators();
  });

  // wire drag, resize, bring-to-front (same logic as current singleton)
  wireDrag(el, el.querySelector('.mp-bar'));
  wireResize(el, el.querySelector('.mp-resize'));
  el.addEventListener('mousedown', () => bringToFront({ el }));

  document.getElementById('main').appendChild(el);
  bringToFront({ el });
  return { el, iframe: el.querySelector('.mp-iframe'), titleEl: el.querySelector('.mp-title'), vid };
}
```

### Before — CSS (ID selectors, singleton)

```css
#media-player { position: absolute; ... display: none; }
#media-player.visible { display: flex; }
#mp-bar { ... }
#mp-title { ... }
#mp-close { ... }
#mp-video-wrap { ... }
#mp-iframe { ... }
#mp-tracks { ... }
#mp-resize { ... }
```

### After — CSS (class selectors, reusable)

```css
.media-player {
  position: absolute;
  width: 340px;
  background: var(--bg1);
  border: 1px solid var(--bg3);
  border-radius: 4px;
  box-shadow: 0 6px 28px rgba(0,0,0,0.65);
  display: flex;
  flex-direction: column;
  user-select: none;
}
.mp-bar { /* same as #mp-bar */ }
.mp-title { /* same as #mp-title */ }
.mp-close { /* same as #mp-close */ }
.mp-video-wrap { /* same as #mp-video-wrap */ }
.mp-iframe { /* same as #mp-iframe */ }
.mp-resize { /* same as #mp-resize */ }
/* No .mp-tracks — track list is removed from the player window (see §10) */
```

### 10. Track list removed from the player window

The current singleton player has an `#mp-tracks` div that lists all tracks for the currently selected node. With multiple windows, this concept breaks: each window belongs to one video, not one node. The track list in the player window is **removed**.

The sidebar track list (`#track-list`) and the Bani Flow trail (`#trail-list`) remain the primary navigation surfaces. They already show all tracks for a node or a raga/composition filter. The rasika clicks a track in the sidebar → a player window opens for that video. The sidebar is the controller; the player windows are the outputs.

This is a *simplification*, not a loss. The player window becomes what it should be: a pure playback surface. Navigation stays in the sidebar where it belongs.

---

## Consequences

### Queries this enables

| Query | Before | After |
|---|---|---|
| "Play Todi by Semmangudi and Todi by GNB side by side" | Impossible — second click kills first | Two windows, both live |
| "Open the 1965 Poonamallee concert at timestamp 2:15:49 while keeping the 1967 Wesleyan concert open" | Impossible | Two windows, independent |
| "Which tracks do I have open right now?" | One — `currentVid` | All — `playerRegistry` keys |
| "Bring back the Bhairavi window I opened earlier" | Gone — replaced | Still there — click brings to front |
| "Loop a gamaka passage" | Not supported (YouTube native loop only) | Not supported — but the window stays open; the rasika can use YouTube's native loop within the iframe |

### What this costs

- **Complexity in `render_html()`** — the JavaScript section grows by ~80 lines. The Python section is unchanged.
- **Migration of call sites** — `loadTrack()` is called in three places in the current template: the node tap handler, `buildPerfPanel()`, and the Bani Flow trail. All three must be updated to `openOrFocusPlayer()`. This is a mechanical find-and-replace; no logic changes.
- **CSS selector migration** — ID selectors (`#media-player`, `#mp-bar`, etc.) become class selectors (`.media-player`, `.mp-bar`, etc.). The visual result is identical.
- **`#mp-tracks` removal** — the per-node track list inside the player window is removed. The sidebar track list (`#track-list`) is the replacement. This is a net simplification.
- **No migration of data files** — zero.

### How this serves the rasika's immersion

The rasika can now inhabit a raga. They open Bhairavi by Semmangudi. They open Bhairavi by GNB. They open Bhairavi by MS Subbulakshmi. Three windows, three eras, one raga. They move between them freely. The graph remains navigable beneath all three. This is the aural-oral tradition made interactive: the rasika is the student, the recordings are the gurus, and the graph is the parampara that connects them.

### What the Carnatic Coder must implement

1. Remove the static `#media-player` HTML block from the `render_html()` template string in [`render.py`](carnatic/render.py).
2. Convert all `#mp-*` CSS ID rules to `.mp-*` class rules.
3. Replace the singleton JS block (lines ~888–968 in [`render.py`](carnatic/render.py)) with the player manager pattern described above: `playerRegistry`, `createPlayer()`, `openOrFocusPlayer()`, `bringToFront()`, `nextSpawnPosition()`, `refreshPlayingIndicators()`, `wireDrag()`, `wireResize()`.
4. Update the three `loadTrack()` call sites to `openOrFocusPlayer()`.
5. Remove `buildPlayerTracks()` and the `#mp-tracks` div.
6. Update `refreshPlayingIndicators()` to replace the `currentVid`-based `playing` class logic.
7. Run `python3 carnatic/render.py` and verify in `serve.py` that multiple windows open, stack, drag, resize, and close independently.

### What the Librarian must populate

Nothing. This ADR requires no data changes.

---

## Alternatives considered

### A. Tabs within a single player window

A single player with a tab bar — each tab holds one video. Rejected because:
- Tabs hide content; the rasika cannot see two videos simultaneously.
- The tab metaphor is a browser convention, not a music-listening convention.
- It does not serve the comparative study use case.

### B. Picture-in-picture (PiP) via the YouTube iframe API

YouTube's iframe API supports PiP on some browsers. Rejected because:
- Requires the YouTube iframe API (`enablejsapi=1`), which changes the embed URL and requires `postMessage` coordination.
- PiP is browser-controlled, not application-controlled — the rasika cannot position or resize it.
- PiP exits when the user navigates away from the tab.
- Adds a significant JavaScript dependency for a feature that is better served by the simpler factory pattern.

### C. Opening YouTube in new browser tabs

The current `perf-link` anchor already does this (the `↗` link in the Concert Performances panel). Rejected as the *primary* multi-window mechanism because:
- New tabs break the graph context entirely — the rasika leaves the application.
- The graph is no longer navigable while the video plays.
- The `↗` link is retained as a *secondary* escape hatch for rasikas who want full YouTube controls.

### D. Unlimited windows with no registry

Allow any number of windows, including duplicates of the same video. Rejected because:
- Duplicate windows of the same video are never useful — they play the same audio twice, creating phase interference.
- The registry's "bring to front" behaviour is strictly better than spawning a duplicate.
- The registry is a trivial `Map`; the cost is negligible.

### E. Persist window state across node selections

When the rasika clicks a different node, keep all open player windows alive (current proposal) *and* also remember their positions across page reloads using `localStorage`. Deferred (not rejected):
- `localStorage` persistence is a useful future enhancement.
- It is orthogonal to this ADR — the factory pattern enables it trivially later.
- Not implementing it now keeps this ADR focused.
