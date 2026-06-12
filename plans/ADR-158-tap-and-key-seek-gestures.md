# ADR-158: Tap-Zone & Keyboard Seek Gestures

**Status**: Accepted
**Date**: 2026-06-12 (proposed + accepted)
**Agents**: graph-architect → carnatic-coder
**Depends on**: ADR-155 (Plyr control inversion — the controller handle this builds on), ADR-156 (chapter markers share the progress surface). **Related**: AUDIT-015 (F-02 click-catcher that this gesture layer subsumes).

---

## Context (forces in tension)

ADR-155 gave us a real control handle on the player (`player.currentTime`, no reload). The roadmap's next ask is "finer ways to seek." Today the only seek affordances are the Plyr progress bar (precise but fiddly on mobile) and clicking a track row (jumps to a tagged offset). There is no quick relative seek — no "back ten seconds, I missed that phrase," which in a Carnatic listening context (re-hearing a sangati, a gamaka, a line of sāhitya) is the single most common motion.

The forces:

- **A known idiom already lives in the user's hands.** YouTube, NewPipe, and FreeTube all converge on the same gesture: double-tap the left/right side of the frame to seek a fixed step, and *every further tap in quick succession adds another step* (3 taps back ≈ 20s, 4 taps forward ≈ 30s). YouTube ships this with a configurable 5–60s step (default 10s). Inventing our own gesture would fight muscle memory; adopting the standard is free fluency. ([androidpolice](https://www.androidpolice.com/2017/02/06/youtube-officially-enables-double-tap-gesture-to-jump-10-seconds-forward-or-backward/), [howtogeek](https://www.howtogeek.com/751238/how-to-change-youtubes-double-tap-skip-time/), [NewPipe #4264](https://github.com/TeamNewPipe/NewPipe/issues/4264))
- **Touch and key must be one behaviour, not two.** The user asked that arrow keys trigger "the same" action as taps. That means a *single* seek model with two input adapters, not two parallel implementations that drift.
- **Cross-origin iframes eat focus and clicks.** AUDIT-015 F-02 already established that the YouTube/Vimeo iframe swallows centre clicks, which is why we overlay a transparent `.mp-click-catch`. The same boundary means Plyr's built-in `keyboard: { focused: true }` will *never* fire for embeds — once the user clicks into the video, focus is inside the cross-origin iframe and key events never reach our document's Plyr handler. Any keyboard seek must be owned at the document level, not delegated to Plyr.
- **Not every provider can be driven.** ADR-155 §4 split providers into `controllable` (youtube/vimeo/audio/video) and not (soundcloud/gdrive). Relative seek needs to read and write `currentTime`; the uncontrolled providers can do neither. The gesture must degrade cleanly, not throw.

## Pattern

**One Strong Centre, two Boundaries.** The seek *intent* — "move the playhead by ±N steps" — is a single centre expressed once as a `nudge(delta)` method on the ADR-155 controller. Two thin input boundaries translate raw events into that intent: a **tap-zone layer** over the video surface (touch/mouse) and a **document key handler** (keyboard). Neither boundary knows how seeking works; the centre neither knows nor cares whether the nudge came from a thumb or an arrow key. This is the same control-inversion shape ADR-155 set: chrome speaks to the controller, the controller speaks to the provider.

## Decision

### 1. Adopt the YouTube/NewPipe tap-accumulation model verbatim

The video surface is divided into a **rewind zone** (left), a **neutral centre**, and a **forward zone** (right). Recommended split: left 0–40%, centre 40–60%, right 60–100% (centre band prevents accidental seeks and preserves a clean play/pause target — tune to feel).

Gesture semantics, matching the prevailing standard:

- A **single tap** anywhere toggles play/pause (preserves today's `.mp-click-catch` behaviour).
- A **double tap** on a side seeks one `SEEK_STEP` in that direction.
- **Each additional tap on the same side, within the accumulation window, adds another `SEEK_STEP`** and resets the window. So *N* rapid taps on a side ⇒ *(N − 1) × SEEK_STEP* of seek in that direction — identical to YouTube (3 taps = 2 steps).

The "(N − 1)" falls out naturally from disambiguation (§3): the first tap is the play/pause candidate; the second tap is what *arms* the seek and commits the first step.

### 2. The single seek primitive — extend the ADR-155 controller

Add one method to the controller object returned by `mountPlayer` (`media_player.js:830`):

```js
// nudge: relative seek by delta seconds, clamped to the media bounds.
// Returns the new absolute time so the input layer can render the overlay.
nudge(delta) {
  const dur = player.duration || 0;
  const next = Math.max(0, Math.min((player.currentTime || 0) + delta, dur || Infinity));
  player.currentTime = next;
  return next;
}
```

For the **iframe fallback** (uncontrolled providers, or Plyr absent), `nudge` is a no-op returning `null`. The input layers read `controller.kind === 'plyr'` (or a `canNudge` flag) and **do not arm seek gestures for uncontrolled providers** — no overlay, no false affordance (ADR-155 §4 degrade contract). Single-tap play/pause is also already unavailable there, so this is consistent.

### 3. Tap-zone layer (touch + mouse) — subsumes the F-02 catcher

The existing transparent `.mp-click-catch` (added on `ready` for embeds, `media_player.js:818–829`) grows from a play/pause catcher into a **gesture layer** spanning the video surface, kept at the same z-index (above the iframe/poster, below `play-large` and the control bar, so Plyr's own controls stay reachable). For HTML5 audio/video — which keep Plyr's native `clickToPlay` today — the same gesture layer is attached so both paths share one code path; native `clickToPlay` is disabled in favour of the layer's own single-tap toggle to avoid double-firing.

Disambiguation (single vs. double vs. accumulating), the crux of "degree based on taps per unit time":

1. On a tap, record `{ side, t }`. If no prior tap is pending, start a `DOUBLE_TAP_MS` timer; when it elapses with no second tap, fire **togglePlay** (this debounce is the cost — play/pause gains ~`DOUBLE_TAP_MS` latency; this is the accepted standard trade-off).
2. If a second tap on the **same side** lands before the timer elapses, cancel the play toggle, `nudge(±SEEK_STEP)`, show the overlay, and enter *accumulating* state with an `ACCUM_MS` window.
3. While accumulating, each further same-side tap `nudge`s another `±SEEK_STEP` and resets `ACCUM_MS`. A tap on the opposite side reverses direction (fresh accumulation). The window lapsing commits and clears.

Implementation notes for the Coder: use pointer events; set `touch-action: manipulation` (or `preventDefault`) on the layer to suppress the browser's native double-tap-to-zoom; the layer must not block panel drag (title bar) or the resize handle, which live outside the video surface.

### 4. Visual + audible feedback overlay

A transient overlay centred on the active side shows the running total, e.g. `« 20s` / `20s »`, in the Gruvbox palette, fading after the accumulation window. Reuse the existing toast idiom (`#mp-copy-toast`, `base.html:2518`) and its `aria-live="polite"` treatment so the seek amount is announced to screen readers. The overlay is the *only* new DOM; it carries no controls.

### 5. Keyboard parity — owned at the document level

Because cross-origin iframes capture focus, Plyr's built-in keyboard seek is unreliable for our dominant providers. Therefore:

- Set Plyr `keyboard: { focused: false, global: false }` — we own all key seeking, so there is no double-seek.
- A single **document-level** `keydown` handler targets the **topmost player** (the project already tracks stacking via `topZ` / `bringToFront`, `media_player.js:1003`). `ArrowLeft` ⇒ `nudge(−SEEK_STEP)`, `ArrowRight` ⇒ `nudge(+SEEK_STEP)`, routed through the **same** seek-and-overlay code as §3 so rapid key-repeats accumulate and surface the same overlay.
- **Guards**: ignore the keys when focus is in an `input`, `textarea`, or `contenteditable` (the entry/edit forms), and when no controllable player is open. `preventDefault` only when a player consumes the key, so page scroll is unaffected otherwise.
- **Optional, non-binding**: the YouTube key set `J` (−step), `L` (+step), `K` (play/pause) and `←/→` may both be wired; the request only requires arrows, so `J/K/L` is a free-if-cheap nicety, not a requirement.

### 6. Named constants (single source, future-configurable)

| Constant | Recommended default | Rationale |
|---|---|---|
| `SEEK_STEP` | `10` (seconds) | YouTube default; the universal "skip" quantum |
| `DOUBLE_TAP_MS` | `300` | double-tap detection / play-toggle debounce |
| `ACCUM_MS` | `700` | trailing window for additional taps to accumulate |

These are constants, not yet a settings surface. YouTube exposes 5–60s; a future ADR may promote `SEEK_STEP` to a user preference (and persist it in the permalink state, ADR-151). Out of scope here — this ADR fixes the *behaviour and its single seek primitive*, not a preferences UI.

## Consequences

**Positive**
- The most common listening motion — re-hear that phrase — becomes a thumb-flick or an arrow tap, in the exact idiom users already know from YouTube/NewPipe/FreeTube.
- One seek primitive (`nudge`) and one seek-and-overlay routine serve both touch and keyboard; they cannot drift.
- Builds purely on ADR-155's handle; no new dependency, no schema change, no data change.

**Negative / costs**
- Single-tap play/pause gains a ~`DOUBLE_TAP_MS` debounce latency — inherent to double-tap disambiguation and matching every player that ships this gesture.
- Uncontrolled providers (soundcloud/gdrive) get no relative seek — a documented degrade, consistent with ADR-155 §4, not a regression.
- Owning keyboard at the document level means one more global handler; mitigated by the topmost-player targeting and the input-focus guards.

## Implementation (for Coder, after acceptance)

1. Add `nudge(delta)` to both controller returns in `mountPlayer` (Plyr path clamps to `duration`; iframe path is a `null` no-op). `media_player.js:830` / `:848`.
2. Generalise `.mp-click-catch` into the zone gesture layer (§3) for both embed and HTML5 paths; disable Plyr `clickToPlay` and let the layer own single-tap toggle. Add `touch-action: manipulation`.
3. Add the seek overlay element + CSS in the toast idiom (`base.html` near `:2518`); wire it through one `applySeek(side, totalSteps)` routine.
4. Set Plyr `keyboard: { focused: false, global: false }`; add the document `keydown` handler targeting the topmost player, routed through `applySeek`, with input-focus and no-controllable-player guards.
5. Define `SEEK_STEP` / `DOUBLE_TAP_MS` / `ACCUM_MS` as named constants at the top of the module.
6. **Test Engineer**: (N − 1)×step accumulation for N taps each side; opposite-side reversal; single tap still toggles play after the debounce; arrow keys produce identical seeks + overlay; no seek/overlay for uncontrolled providers; keys ignored while a form field is focused.

**Branch**: `adr/158-tap-and-key-seek-gestures` → PR.

---
[ADR: ADR-158, ADR-155, ADR-156]
[AGENTS: graph-architect]
