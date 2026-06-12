# ADR-160: Universal Minimize with a Persistent Chip Rail

**Status**: Accepted
**Date**: 2026-06-12 (proposed + accepted)
**Implementation note**: shipped in two passes, both landed — (1) desktop universal minimize via the fold-cue + sruti unification (its redundant minimize button removed) + active-strip; (2) the mobile `.mp-mini-strip` now carries the same `buildPlayerRail` (chips + `▾N` overflow that flips upward off the bottom edge), and the inert mobile fold-cue is hidden. Mobile keeps its own bottom-sheet mechanism (a different form factor from desktop's in-place `.minimized`) but carries the same rail, so §4's user-facing goal is met without merging the two mechanisms.
**Agents**: graph-architect → carnatic-coder → test-engineer
**Depends on**: ADR-159 (the bar must already carry the live chip rail — that is what makes a minimized strip worth keeping open), ADR-131 (the sruti minimize affordance this generalises). **Related**: ADR-037 (mobile singleton player).

---

## Context (forces in tension)

Today only the **sruti drone** player can minimize: `.media-player.sruti-player.sruti-minimized` collapses to its bar and keeps the drone sounding (`base.html:1149–1198`). The `▾` fold-cue on every other player is a *visual hint with no behaviour* — `mp-fold-cue` is explicitly "non-interactive" (`media_player.js:472–476`). So a recital or concert player is all-or-nothing: it occupies its full footprint or it is closed.

On mobile especially this is wrong. A listener wants to:
- start a concert,
- shrink the player to a thin strip so the graph/panels are usable,
- **keep seeing what is playing** and keep the discovery portals (the chips) one tap away,
- and keep the audio running.

The sruti player already proves every piece of this is possible — minimize-to-bar, audio continues, bright active border. The only reason it is sruti-only is that, until ADR-159, the bar carried nothing worth keeping visible (just a label). Once the bar carries the **live chip rail**, a minimized strip becomes a genuinely useful object: *what is playing* + *where to go next*, in one thin always-on line, while the music continues.

The forces: **immersion while minimized** (the music shouldn't stop to reclaim screen space), **discovery stays open** (chips persist in the strip), and **don't fork the chrome** (one minimize behaviour for all players, not a sruti special-case plus a separate concert special-case).

## Pattern

**Strong Centre that survives compression.** The chip rail (ADR-159) is the centre of the player's meaning. Minimizing should compress everything *around* the centre — the video, the resize handle — while preserving the centre and the audio. The minimized strip is not a degraded player; it is the player reduced to its essence: identity + transport, still live.

## Decision

### 1. Promote the fold-cue to a real toggle, for every player

`mp-fold-cue` (`▾`) becomes interactive on all players, not just sruti. Clicking it toggles a `minimized` class on the player root. `▾` (will collapse) ↔ `▴` (will expand). The existing sruti minimize keeps working; it becomes a *special case of the general behaviour* rather than its own code path.

### 2. Minimized = bar only, audio continues

Generalise the sruti CSS (`base.html:1149–1198`) from `.sruti-minimized` to a provider-agnostic `.media-player.minimized`:
- `.mp-video-wrap`, `.mp-resize`, and any open tracklist/queue surface are hidden (`display: none`).
- The **bar — including the ADR-159 chip rail — stays visible.** This is the whole point: the minimized strip shows the live chips.
- The media keeps playing. For controllable providers (ADR-155) this is automatic — we hide the wrap, we do not tear down the player. Video providers keep audio; the picture is simply not shown while minimized.
- The chip rail stays **live** while minimized: `_updateActiveSegment` (ADR-156/159) keeps swapping segment chips, so a minimized concert strip still tracks Kānaḍa → Surutti.

### 3. Active-strip affordance, reused from sruti

The bright accent border that marks an active sruti strip (`base.html:1183–1185`) generalises to any minimized-but-playing player, so a thin strip reads as "this is live, not a leftover." Keep it subtle for non-drone players (a drone is *only* a strip; a paused concert strip need not shout).

### 4. Interaction with the mobile singleton (ADR-037)

On mobile there is one player (`_isMobilePlayer`, singleton). Minimize there is the dominant use case: collapse the singleton to a bottom strip showing live chips while the user explores. The minimized strip must not occlude the bottom navigation; coordinate placement with the existing `.full-mobile` / `.mini` rules (`base.html:3891–3966`). The existing `.media-player.mini` mobile state already hides bar/tracklist/footer (`:3891–3894`) — reconcile it with the new universal `.minimized` so there is **one** minimized concept on mobile, not two.

### 5. State, not geometry

Minimize is a **state toggle**, independent of drag/resize geometry. Expanding restores the prior size/position (the window manager already preserves left/top/size across operations — cf. MediaQueue advance, `:1234–1236`). Minimizing does not destroy the player or its queue cursor.

## Consequences

**Positive**
- Every player gains the sruti player's best trick: shrink to a live strip, keep playing, keep discovery open — the headline mobile win.
- One minimize behaviour for all providers; the sruti special-case dissolves into the general one.
- Builds directly on ADR-159's rail — the strip is useful precisely because the bar now carries live chips.

**Negative / costs**
- Hiding a video element while keeping audio differs subtly per provider; the Coder must confirm controllable providers (YouTube/Vimeo embeds, HTML5) keep audio when the wrap is `display:none` and don't auto-pause. This is the main risk and needs a per-provider check.
- Mobile must unify `.mini` and the new `.minimized` or risk two competing collapsed states.
- A minimized *paused* player and a minimized *playing* player should read differently (§3) — a small but real visual-state matrix.

## Implementation (for Coder, after acceptance)

1. Wire `mp-fold-cue` click → toggle `.minimized` on the player root, for all players; swap `▾`/`▴`. Keep the sruti toggle working through the same handler.
2. Generalise the sruti minimize CSS to `.media-player.minimized` (hide video-wrap, resize, open surfaces; keep bar + rail). Keep the active-border treatment, toned for non-drone.
3. Verify per provider that audio continues when `.mp-video-wrap` is hidden (do **not** clear `iframe.src` or destroy the controller on minimize).
4. Confirm `_updateActiveSegment` still fires and updates the rail while minimized.
5. Reconcile mobile `.mini` (`base.html:3891–3894`) with universal `.minimized`; one collapsed concept on mobile; ensure the strip doesn't cover bottom nav.
6. Run `.venv/bin/bani-render`.
7. **Test Engineer**: minimize a concert → bar+chips stay, video hidden, audio continues; segment crossing still swaps chips while minimized; expand restores prior size/position; sruti minimize still works through the unified path; mobile shows exactly one collapsed state; minimized paused vs. playing are visually distinguishable.

**Branch**: `adr/160-universal-minimize-chip-rail` → PR.

---
[ADR: ADR-160, ADR-159, ADR-131, ADR-037]
[AGENTS: graph-architect]
