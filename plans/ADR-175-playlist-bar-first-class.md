# ADR-175 — The Playlist Bar: Playlist as a Persistent First-Class Citizen

**Status:** Accepted (user approval 2026-10-17; Phase 1 implementation on `adr/175-playlist-bar`)
**Implementation note (Phase 2):** the mobile `.mp-mini-strip` is retired (minimize now hides the sheet; the top bar is the persistent face), content players no longer carry a `✕` (minimize-only; utility players sruti/tanpura keep an explicit Stop), the bar gains `#pb-stop`, the controller gains `play()/pause()/isPaused()`, and all content play routes through `Playlist.playContent`/`playItems`/`playSaved` (content `openOrFocusPlayer` calls are intercepted; `isQueueItem`/`meta.standalone` exempt). Built on `adr/175-playlist-bar`. Follow-up: an explicit `.mp-minimize` button now occupies the old ✕ slot (true strip minimize — the inline width is cleared so it actually shrinks; audio continues), and the section-6 burger / tracklist toggle (`.mp-tracklist-toggle`) is retired — the Playlist Bar editor owns list navigation. The redundant fold-cue (▾) is removed; content players now collapse **into the playlist** (window hides, audio continues) and magnetically dock **under** the Playlist Bar (`_dockPlayer`; side-docked when there is no room below, re-snapped on drag release). z-order keeps the bar above players (players ≤700, bar 750, modals 1000+) so nothing occludes it.
**Date:** 2026-10-17
**Author:** pi (survey + proposal) · implementation via `coder` / `surface` / `tester` skills after acceptance
**Depends on:** ADR-157/162 (the ephemeral `MediaQueue` + the "Up Next" panel), ADR-163 (persistent saved playlists), ADR-164 (queue permalinks / source-playlist id), ADR-160 (universal minimize — the proof audio survives a hidden video wrap), ADR-043 (mobile singleton + mini strip), ADR-161 (toggle primitive, upward/downward transient surfaces), ADR-128 (panel components), ADR-028 (theme single source), ADR-129 (floating chrome + safe zones).
**Constitutional note (ADR-085):** this changes a *paradigm* — playback stops being owned by the player window and becomes owned by a persistent list. Per project rules it needs PR review before merge to `main`, not the surgical fast-path.

---

## Context (forces in tension)

The playlist already exists twice, and neither face is permanent:

1. **The session queue** — `MediaQueue` (`media_player.js`), a real working editable playlist (ADR-157/162) whose only face is the `.mp-queue` **"Up Next"** panel. That panel is a *child of a player window* (`_addQueueUI` inserts it before `.mp-video-wrap`), so it appears **only while** `MediaQueue.active && MediaQueue.panelOpen` **and** a queue-owned player window is open. Close the player and the queue vanishes from the screen even though `MediaQueue` still holds the items.
2. **Saved playlists** — `playlists/*.json` (ADR-163), durable entities surfaced as `PLAYLISTS` sections inside the left/right panels. They can *load into* the session queue (`_playlistToQueueItems` + `startMediaQueue(..., {playlistId})`), but they are not the thing that is playing.

At the same time, **"play" does not go through the playlist**. Recording rows, concert brackets, track leaves and section play-acts mostly call `openOrFocusPlayer(...)` directly (a standalone player); only `play-all`/`enqueue` and saved-playlist rows call `startMediaQueue(...)`. `openOrFocusPlayer` has a narrow bridge (if `MediaQueue.active` and the media is already queued, jump to it), but the model is still *player-first*: a play spawns a player, and the queue is a side-effect some actions populate.

So today the user cannot:
- see *what* is queued once the player is closed,
- edit/reorder/remove/queue without first opening a player and clicking the "Up Next" toggle,
- trust "play" to mean "add this to the playlist and play it" (the Winamp contract).

**Forces in tension:**

| Force | Tension |
|---|---|
| **Always-on legibility** (the ask) | The playlist must be visible/editable with the player open *or closed*. |
| **Winamp centrality** (the ask) | The playlist is the centre; the player is a surface that serves it. |
| **Immersion** (ADR-001) | Top chrome is precious, especially on a 375 px phone; the bar must not fight the view selector / help / canvas. |
| **One model, not two** | `MediaQueue` and saved playlists must not become competing "playlists". |
| **Don't fork chrome** (ADR-160) | Mobile already has a persistent *bottom* `.mp-mini-strip`; the new top bar must absorb it, not sit beside it. |
| **Player is permanent chrome** (the ask) | The player must never be occluded by the Bani-flow / Musician drawers, and must not be closeable — only minimizable. |
| **Video vs. playback** (ADR-160) | Audio already survives hiding the video wrap; the playlist must outlive the player window. |
| **Reversibility** | This is a paradigm shift; it must land in verifiable phases, not one big-bang. |

---

## Pattern

**Strong Centre with a persistent boundary.** `MediaQueue` is already a strong centre (ADR-162 called it exactly that). Its weakness is that its only boundary — the "Up Next" panel — was *welded to a player window*. This ADR moves the boundary up to the **application chrome**: a persistent **Playlist Bar** that always shows the centre's state and always offers its editor, independent of any player window. The player (video + within-recording tracklist) becomes a *surface the bar opens*, not the thing that owns the list.

Naming settles the "two playlists" confusion:

- **Current Playlist (CP)** — the live, editable list that is playing; backed by `MediaQueue`, exposed as `window.Playlist` (alias, so no global forks).
- **Saved Playlist (SP)** — the durable named entity (`playlists/*.json`, ADR-163). Loading an SP copies its items into the CP; the CP is what the bar always shows.

This mirrors Winamp precisely: the playlist window is always open; saved `.m3u` files load into it.

---

## Decision

### 1. Elevate the model, do not duplicate it

`MediaQueue` remains the single implementation of the Current Playlist. It gains a public alias `window.Playlist` and a single content-play entry point:

```
Playlist.playContent(item, opts)      // append-or-focus this item, then play it
Playlist.playItems(items, i, opts)    // replace/seed the CP and play index i (existing start())
Playlist.playSaved(playlistId)          // load an SP into the CP
```

No second queue object, no second global. `MediaQueue`'s invariants (ADR-162/164) are preserved verbatim: `currentKey` is the source of truth for the cursor, any edit drops `playlistId`.

### 2. A persistent **Playlist Bar** (both regimes)

A new app-level chrome element `#playlist-bar`, a sibling of the floating chrome (before `#main`), **always present**:

```
#playlist-bar
  ├── #pb-transport   [⏮ prev] [▶/⏸ play-pause] [⏭ next] [■ stop]
  ├── #pb-summary     now-playing identity chips (ADR-159 vocabulary) + #pb-count (e.g. 3 / 12)
  ├── #pb-editor-toggle  (≡ playlist)  — opens the CP editor   [.mp-toggle-btn, aria-pressed]
  └── #pb-expand      (^ open player)  — opens/focuses the video surface
```

- **Desktop:** fixed top-centre, in the floating-chrome row between `#view-selector-float` (top-left) and `#app-title-float` (top-right). It stretches only as far as its content; `pointer-events` follow the ADR-129 floating-cluster rule so gaps still click through to the canvas. Transient surfaces it opens drop **downward** from the bar (mirror of ADR-161's upward player surfaces).
- **Mobile:** the bar is **also top-centre**, not bottom. A single top row cannot hold the view selector, help, transport and 44 px targets on a 375 px viewport, so mobile top chrome becomes **two bands**: band 1 keeps the existing view selector (left) + title/help (right); band 2 is the full-width Playlist Bar. The bottom `.mp-mini-strip` (ADR-043/160) is **retired** — the bar absorbs its job (persistent now-playing + expand affordance). The tab-bar offsets and the old `body.mobile-mini-player` lift rules are recomputed for the extra top band.

When the CP is empty the bar stays (it is the constant anchor) in a **muted empty state** ("Playlist empty"); it never disappears while the CP has items, regardless of whether a player window is open. This is the literal reading of "accessible at all times."

### 3. The playlist editor is app-level, not a player child

The current `.mp-queue` ("Up Next") panel is **relocated** from the player window to `#playlist-bar` (as `#playlist-editor`, keeping `.mp-queue` internals so `_renderQueuePanel` is unchanged). Consequences:

- The editor renders whenever the CP is non-empty and `editorOpen` is true — **with or without a player window**.
- The player bar's `.mp-queue-toggle` is **retired** (the bar owns the editor toggle now). The player keeps its `.mp-tracklist-toggle` (that is *within-recording* navigation, a distinct concern).
- `_addQueueUI` in `createPlayer` / `_openMobilePlayer` shrinks to nothing (or becomes an assertion); `_refreshQueuePanels` is re-pointed at the app-level editor + the bar's summary/transport state.

### 4. The player is minimizable, never closeable; transport is the playlist's

The bar's prev / play-pause / next / **stop** operate on the CP and on the CP's **current player instance** (`playerRegistry.get(MediaQueue.currentKey)`), not on a window.

- **Play / pause / stop replace close.** The player's `✕` **close button is retired** (removed from `buildPlayerBar` and the mobile path). A player is no longer a thing you close; it is a thing you **minimize** (ADR-160) — minimize hides the video wrap and keeps the controller alive, audio continues. **Stop (■)** on the bar is the only way to tear down playback; it destroys the current controller but **preserves `MediaQueue.items`**, so the list survives and any item can be re-played. This is the concrete meaning of *player at the service of the playlist*.
- **Play/pause is new:** `MediaQueue` has no pause API today. The bar calls the current controller (`controller.play()/pause()`, ADR-155) and must work for mobile's iframe pseudo-instance too. The play/pause button uses `.mp-toggle-btn[aria-pressed]` (ADR-161).
- **Persistence & layering contract (the player is never occluded).** The bar and the player surface sit **above the drawers and their scrims**, so opening Bani Flow or Musician never covers them. Current z-order: drawer scrims `199`, drawers `200`, mobile player `205`, `#mobile-tab-bar` `230`; the bar takes a layer above all of these on mobile (e.g. `#playlist-bar { z-index: 240 }`) and the player surface follows suit. The expanded player keeps its mobile sheet form but is layered above the drawers; on desktop the bar sits in the ADR-129 floating-cluster layer. The old `body.mobile-mini-player` lift rules are replaced by a single bar-height reservation so no panel/player overlap returns.

### 5. All content "play" routes through the playlist (Winamp contract)

Introduce one entry for content playback and make the existing content call sites use it:

- `openOrFocusPlayer(...)` is **demoted to the player-surface primitive** — what `Playlist._open` and utility players call. It does not by itself define a user-facing "play".
- Recording rows, concert brackets, track leaves, raga/comp play-acts, playlist rows, and the `+` menu's "Add to queue" all call `Playlist.playContent(...)` (append-and-play) or `Playlist.playItems(...)` (play-all/seed).
- **Exempt:** utility players that are not content — the wheel **sruti drone** and **tanpura** (ADR-131/169). They keep using `openPlayer` directly and never enter the CP. This preserves the ADR-162 "standalone players stay queue-free" carve-out.

To keep the migration mechanical and reviewable, `playContent` semantics are: *if the item already exists in the CP, jump to it (no duplicate); else append it and play*. This matches the existing `openOrFocusPlayer` bridge and makes single-track plays feel immediate while still building the list.

### 6. Saved playlists load *into* the bar, edits detach

`Playlist.playSaved(id)` sets `MediaQueue.playlistId = id` (ADR-164). While `playlistId` is set the bar summary shows the SP title and a subtle "saved" affordance; the first structural edit (add/remove/move) clears `playlistId` exactly as today, so the CP is an honest working copy and permalinks stay correct (share-by-reference until edited).

### 7. Permalink & persistence (reuse, do not reinvent)

The `q` block of the ADR-164 permalink already restores the queue (`{pl,i}` or `{items,i}`) and the seek. The bar adds only **view state** (`editorOpen`) which is *not* permalinked (transient UI, like a dropdown). No schema change, no new write path.

### 8. Empty / zero-item behaviour

- CP empty → bar muted, transport disabled, editor toggle disabled, summary "Playlist empty".
- Removing the last item stops cleanly (ADR-162 behaviour preserved).
- Loading a permalink with a one-item ephemeral queue still works exactly as today.

---

## Phasing (land in independently revertable slices)

**Phase 1 — Always-visible bar (the "first order of business").**
Mount `#playlist-bar` top-centre in both regimes; render summary + transport + count from the CP; open the *existing* editor as an app-level surface; retire the bottom mobile mini strip. **Play routing unchanged** — existing standalone plays still work. This alone delivers "view/access the playlist at all times."

**Phase 2 — Player at the service of the playlist.**
Decouple playback from the player window: retire the `✕` close (minimize only), add the play/pause/stop controls, and route content play through `Playlist.playContent`/`playItems`. Retire the player's queue toggle and `_addQueueUI`.

**Phase 3 — Look & feel** (a separate ADR, per the user's sequencing): the winamp-flavoured visual language of the bar + editor + player relationship.

Each phase gates on `bani-render` + `cli.py validate` + the new tests (§Implementation) + an updated `UIMAP.md` §5 and green `test_ui_surface_map_drift.py`.

---

## Consequences

**Positive**
- The playlist is legible and editable with the player open or closed — the user's core ask.
- One model (`MediaQueue`/`Playlist`), one persistent surface, one install point; the existing ADR-162 editor and ADR-163 saved playlists are reused, not replaced.
- "Play" gains a single, predictable meaning (Winamp contract) instead of a per-call-site choice.
- Audio/playback survive minimizing the video surface (ADR-160 already proves the mechanism), so "the player serves the list" is real, not cosmetic.
- Mobile loses a concept (the bottom mini strip) and gains the same top-centre bar + editor as desktop, rather than accumulating chrome.

**Negative / costs**
- This is a **paradigm shift** touching `media_player.js` broadly, the top-chrome CSS, `mobile.js` drawer/strip offsets, and ~50 call sites for play routing. It needs PR review (ADR-085), not a fast-path commit.
- **Playback decoupling is the hard part:** play/pause must work across Plyr and the mobile iframe pseudo-instance, and minimize-vs-stop must not leak controllers (the ADR-160 per-provider audio check applies again).
- **Removing the close button is a behaviour change users must relearn:** the player chrome cannot be dismissed outright; minimizing hides the video, and Stop (which halts playback) is the only teardown. This is intentional (Winamp model) but must be discoverable.
- Two persistent top-chrome concerns (bar + view selector) now compete for the top row on desktop; on mobile this forces a two-band top chrome, so `--chrome-top`, tab-bar offsets and drawer lift rules must be recomputed.
- The bar's transient editor drops *downward* while the player's tracklist opens *upward* — the mutual-exclusion rule (ADR-161/162) now spans two different layers and must be stated once.

**Alternatives considered**
- *Keep the editor in the player, but make the player permanent* — rejected: the player becomes permanent chrome in disguise, and a video-first layout would dominate a list-first task. The bar is the right home for the constant.
- *Make the bar a second, independent "playlist" surface* — rejected: forks the model; `MediaQueue` and saved playlists would drift.
- *Put the whole editor in the top bar* — rejected: editing (reorder/remove) needs vertical room; a dropdown/drawer is the right transient form.
- *Ship Phase 2 and Phase 3 in one go* — rejected: the user explicitly sequenced look-and-feel after the centralisation, and the paradigm shift needs to be verifiable on its own.

---

## Implementation (for Coder + Surface + Tester, after acceptance)

**Surface (bar + CSS + mobile)**
1. Add `#playlist-bar` to `base.html` as app chrome: transport (`#pb-transport`, `#pb-play`, `#pb-prev`, `#pb-next`, `#pb-stop`), summary (`#pb-summary`, `#pb-count`), `#pb-editor-toggle`, `#pb-expand`.
2. Desktop: fixed top-centre between the two floating clusters; transient drop-down editor; `pointer-events` follow ADR-129. Mobile: a second full-width top band (band 1 keeps view selector + title/help); retire the bottom `.mp-mini-strip`; recompute `--chrome-top`, tab-bar offsets and the `body.mobile-mini-player` lift rules; set `#playlist-bar`/player z-index above drawers and scrims (§4).
3. All colours/spacing/typography from `theme.py` `TOKENS`; no hardcoded hex/px (ADR-028). Use `.mp-toggle-btn[aria-pressed]` for editor/play state (ADR-161).
4. Relocate `.mp-queue` → `#playlist-editor` as a child of `#playlist-bar`; keep internals for `_renderQueuePanel`.

**Coder (model + lifecycle)**
5. Add `window.Playlist` alias and `Playlist.playContent` / `playItems` / `playSaved`; keep `MediaQueue` method bodies.
6. Re-point `_refreshQueuePanels` to the app-level editor + bar; reduce/remove `_addQueueUI`; retire the player's `.mp-queue-toggle`; keep the tracklist toggle.
7. Add a play/pause API on the controller/instance (works for Plyr and the mobile iframe) and wire `#pb-play`; wire `#pb-prev`/`#pb-next` to `previous()`/`next()`; wire `#pb-stop` to destroy the current controller while preserving `MediaQueue.items`.
8. Remove the `✕` close button from `buildPlayerBar` and the mobile path; the fold-cue minimize (ADR-160) is the only way to hide the player surface.
9. Phase 2: route content play call sites (bani_flow, graph_view, panel_components, media_player recording rows) through `Playlist.playContent`/`playItems`; leave sruti drone + tanpura on `openPlayer`.
10. Update `UIMAP.md` §5 (and §6.2 sync graph) in the same commit; `test_ui_surface_map_drift.py` must stay green.

**Tester**
11. Bar renders in both regimes; empty state correct; summary/count track `MediaQueue` mutations (start/advance/jump/remove/move/clear).
12. Editor opens and is editable **with the player closed**; reorder/remove/jump invariants from ADR-162 still hold; last-item removal stops cleanly.
13. Transport: play/pause works desktop + mobile; next/prev move the CP and the video surface follows; there is **no close button** — minimize keeps audio + list; explicit Stop clears playback but not the list.
14. Saved-playlist load sets `playlistId`, bar shows the title, first edit drops it; ADR-164 permalink round-trips with the bar visible after restore.
15. `Playlist.playContent` de-dupes an already-queued item (jump, don't duplicate); single-track play still feels immediate; sruti/tanpura never enter the CP.
16. Mobile: the bar is top-centre (two-band top chrome); the bottom mini strip is gone; opening Bani Flow or Musician never occludes the bar or the player surface; `test_ui_surface_map_drift.py` green.

**Branch:** `adr/175-playlist-bar` → **PR required** (ADR-085: paradigm shift).

---
[ADR: ADR-175, ADR-157, ADR-162, ADR-163, ADR-164, ADR-160, ADR-043, ADR-161, ADR-128, ADR-028, ADR-129]
