# AUDIT-015: Plyr Playback — Autoplay-Mute Desync & Click-to-Pause Failure

**Date**: 2026-06-10
**Auditor**: 🔍 Code Auditor
**Scope**: The Plyr mount/control path — `carnatic/render/templates/media_player.js` (`mountPlayer`, lines 759–823; its two callers `createPlayer:851` and `_openMobilePlayer:3289`) and the bundled Plyr asset (`carnatic/render/vendor/plyr/plyr.css`, `plyr.min.js`). The relevant player CSS lives in `carnatic/render/templates/base.html:1076–1083`.
**Trigger**: Two reproducible playback bugs reported against the live player:
1. **Mute desync** — audio frequently plays silently on open even though Plyr's speaker icon shows *unmuted*; it takes two clicks of the mute/unmute control to hear sound. Intermittent — sometimes sound is correct on first open.
2. **Click-to-pause failure** — clicking the centre of the video does not pause it, yet pausing via the control-bar button surfaces a large central button, implying the centre *should* be interactive. Misleading affordance.

This report observes and routes. It writes no code and proposes no schema. Both findings are **implementation-level** and route to the **🎵 Carnatic Coder**, with regression coverage from the **🧪 Test Engineer**. No ADR is required — the fixes are localised to `mountPlayer`, which is the single chokepoint feeding both desktop and mobile player paths.

---

## 1 — Executive summary

Both bugs originate in one ~45-line function, `mountPlayer` (`media_player.js:759–823`), at the single `new Plyr(...)` instantiation (`:783`). There is exactly one Plyr config in the codebase; both the desktop (`createPlayer:851`) and mobile (`_openMobilePlayer:3289`) windows route through it, so a single corrected mount fixes both surfaces.

- **F-01 (mute):** `autoplay: true` is set with no `muted` declaration. The browser autoplay policy silently forces the underlying YouTube/HTML5 element to start **muted** (muted autoplay is always permitted; unmuted is not, absent a fresh user gesture). Plyr's mute UI reflects its *own* config (`muted=false`), not the player's real muted state, so the icon lies. The first click syncs the icon to reality; the second — a genuine fresh gesture — actually unmutes. Intermittency tracks the browser's per-origin Media Engagement Index.
- **F-02 (pause):** `clickToPlay` defaults to `true` but is unreliable for cross-origin YouTube embeds — the iframe captures the pointer event before Plyr's container handler sees it. The `play-large` control surfaces a central button whenever the player is paused/stopped, creating the false impression that the video body is a click target.

---

## 2 — Findings

### F-01 · Autoplay forces a silent-but-"unmuted" state; Plyr's mute UI desyncs from the real player

**File**: `media_player.js:783–795`
**Pattern**: Asynchronous autoplay across a lost user-gesture boundary + UI state divorced from engine state
**Evidence**:
```js
// media_player.js:783-792
const player = new Plyr(target, {
  controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
  loadSprite: false,
  ratio: '16:9',
  autoplay: true,          // ← no `muted` declared; intent is "play with sound"
  keyboard: { focused: true, global: false },
  youtube: { rel: 0, modestbranding: 1, iv_load_policy: 3 },
  vimeo: { byline: false, portrait: false, title: false },
  markers: { enabled: points.length > 0, points },
});
```
The player element initialises **asynchronously** (YouTube IFrame API / HTML5 metadata load). `openOrFocusPlayer` is invoked from a user click, but by the time Plyr fires `ready` and issues `play()`, the browser no longer attributes the playback to a fresh user activation. Per browser autoplay policy, **muted** autoplay is always allowed but **unmuted** autoplay requires recent activation; YouTube resolves the conflict by starting muted rather than failing. Plyr's mute button renders from its own `muted` config (`false`), so the speaker shows unmuted while audio is silent — the desync the user sees. The first mute click sets Plyr `muted=true` (icon now matches reality); the second unmutes, and because that click is a fresh gesture it sticks — hence the double-click. The intermittency is the Media Engagement Index: on a session/origin with accrued engagement, unmuted autoplay is permitted and the first open is correct.

A repo grep confirms **no** `muted`, no `playing`-event unmute handler, and no `clickToPlay` anywhere in `media_player.js` — `autoplay: true` is the only playback directive.

Corroborated upstream: Plyr [#1112](https://github.com/sampotts/plyr/issues/1112) (mute-on-autoplay-then-unmute), [#2213](https://github.com/sampotts/plyr/issues/2213), [#1431](https://github.com/sampotts/plyr/issues/1431) ("unmuting failed because the user didn't interact with the document").

**Impact**: Primary reported bug. The defect is not "audio is muted" (that is the browser working as designed) but "**Plyr's mute UI does not reflect the actual muted state**," which is what forces the second click and breaks the user's mental model.

### F-02 · `clickToPlay` is unreliable for YouTube embeds; `play-large` makes the dead centre look clickable

**Files**: `media_player.js:784` (controls include `play-large`; no `clickToPlay` override → defaults `true`), `vendor/plyr/plyr.css` (`.plyr__video-embed`, `.plyr__poster`)
**Pattern**: Closed cross-origin surface intercepting a click handler bound on an outer container + a paused-state overlay implying interactivity that does not exist
**Evidence**:
```js
// media_player.js:784 — play-large present, clickToPlay left at its default (true)
controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
```
```css
/* vendor/plyr/plyr.css — paused/stopped state reveals the poster+play-large overlay */
.plyr__poster{...opacity:0;position:absolute;...z-index:1}
.plyr__poster-enabled .plyr__poster{opacity:1}
.plyr__poster-enabled:not(.plyr--stopped) .plyr__poster{display:none}
```
For HTML5 `<video>`, Plyr's `clickToPlay` toggles play/pause on a click of the video container. For a **YouTube** embed the iframe is cross-origin and intercepts the pointer event before it reaches Plyr's container listener, so the centre click is swallowed. Pausing via the control-bar `play` button puts Plyr into the paused state, which reveals the `play-large`/poster overlay centrally — making the body *look* like a toggle target it is not. Corroborated upstream: Plyr [#1321](https://github.com/sampotts/plyr/issues/1321), [#2079](https://github.com/sampotts/plyr/issues/2079).

**Impact**: Secondary reported bug, plus a misleading affordance. Behaviour is inconsistent across providers: direct `<audio>`/`<video>` (`media_player.js:773–780`) honour click-to-pause; YouTube/Vimeo embeds do not.

### F-03 (contributory) · The `seek` controller method assumes unmuted playback should resume — interacts with F-01

**File**: `media_player.js:800`
**Pattern**: Implicit replay of the autoplay assumption
**Evidence**:
```js
seek(sec) { try { player.currentTime = sec || 0; player.play(); } catch (e) {} },
```
Track-row clicks and chapter seeks call `seek()`, which re-issues `player.play()`. Because these *are* fresh user gestures, audio often becomes correct *after* a seek — which can mask F-01 during testing and contribute to the "sometimes it just works" perception. Noted so the Tester does not mistake a post-seek correct state for a fixed autoplay path.

---

## 3 — Recommendations (summary)

Both fixes are localised to `mountPlayer` (`media_player.js:759–823`). Re-render with `.venv/bin/bani-render` after the change so `carnatic/graph.html` picks it up.

1. **F-01 — make Plyr's mute UI track reality (kill the double-click).** Set `muted: true` in the Plyr config so autoplay is *always* permitted with no silent desync, then attempt `player.muted = false` on the first `playing` event. If the browser rejects the unmute (no gesture), the UI now *correctly* shows muted, so a **single** click unmutes — the icon never lies again. This is the canonical Plyr workaround (issue #1112). The invariant to satisfy: *the speaker icon must always reflect the actual engine muted state on open.* *(code → Coder)*
2. **F-02 — restore click-to-pause for embeds via an overlay (chosen direction).** Add a transparent click-catcher `<div>` inside `.mp-video-wrap`, layered **above** the iframe but **below** Plyr's control bar (`pointer-events: auto`, appropriate `z-index`), whose handler calls `player.togglePlay()`. This makes the central click work for YouTube/Vimeo without obscuring the control bar, and must not interfere with the already-working HTML5 `<video>`/`<audio>` click-to-pause. *(code → Coder)*
3. **Verify the live-playhead and auto-advance paths still fire** after the mount change — `controller.onTime` (`:893`) and `controller.onEnded` (`:895`, ADR-157 queue) hang off the same Plyr instance and must remain wired. *(test → Tester)*

---

## 4 — Routing

| Finding | Concern | Routed to | Becomes |
|---|---|---|---|
| F-01 | Autoplay-mute desync; mute-on-autoplay + unmute-on-`playing` | 🎵 Carnatic Coder | `mountPlayer` config + `playing` handler |
| F-02 | Click-to-pause for embeds; transparent overlay → `togglePlay()` | 🎵 Carnatic Coder | `mountPlayer` DOM + listener |
| F-03 | Seek re-issues play; masks F-01 during testing | 🧪 Test Engineer | test guidance (don't test autoplay via a post-seek state) |
| F-01, F-02 | Regression coverage — desktop + mobile, YouTube + HTML5, mute-UI-reflects-engine, centre-click toggles, onTime/onEnded still fire | 🧪 Test Engineer | `carnatic/tests/` (unit where mockable + manual matrix) |

No source file was modified in this audit.
