# ADR-188 — Play/Pause Toggle + Dedicated Stop

**Status**: Proposed → Accepted (user directive 2026-10-25)
**Date**: 2026-10-25
**Author**: pi (`surface` skill)
**Supersedes**: ADR-187 (separate play/resume + pause buttons).
**Depends on**: ADR-161 (`.mp-toggle-btn` primitive), ADR-175 (Playlist Bar /
parent-inherits rule), ADR-186 (row/bar operator parity, video toggle).
**Scope**: `carnatic/render/templates/base.html`, `media_player.js`,
UIMAP §5, `test_ui_surface_map_drift.py`.

---

## Context

ADR-187 gave the bar a play/resume button plus a pause-only button, and the row
a play/stop button (`■` when playing) plus a pause-only button. That produced
two awkward behaviours:

- The pause button was not a toggle: once paused, it stayed a pause button.
- The row's stop affordance was fused into its play button, so the same control
  flipped between `▶` and `■` — a play/stop toggle, which reads as a state
  control rather than a Stop.

## Decision

### D1 — One play/pause toggle

The transport's primary button is a **play/pause toggle**: `❚❚` while the
current item sounds, `▶` otherwise. Pressing it flips the glyph and toggles
playback.

- Bar: `#pb-play` (`.mp-toggle-btn`, `aria-pressed` while sounding) →
  `_pbPlayPauseCurrent`.
- Row: `mp-queue-play` (`.mp-toggle-btn`, `aria-pressed`) on every row — for
  the current item it toggles pause/resume; for any other row it plays that
  item. This restores the ADR-187 `mp-queue-pause`-as-toggle intent but keeps
  the conventional `play` identity.

### D2 — Stop is a dedicated, non-toggling button

`#pb-stop` stays the bar's Stop. The **current** row gains its own
`mp-queue-stop` (`■`), disabled when there is no mounted controller. It never
wears a play glyph, so "stop" is unambiguous and the play/pause toggle is never
confused with Stop. The row stop carries the bar's `.pb-btn` class (the editor
is a child of `#playlist-bar`), so both stops read identically; the retired
`.mp-queue-stop { background: var(--accent) }` accent-fill rule is gone.

`_pbSetPaused(bool)` remains the shared pause/resume primitive;
`_pbPlayPauseCurrent` is the toggle handler; `_pbStopCurrent` destroys the
controller (Winamp model: the queue survives).

### D3 — Parent-inherits parity

Both the toggle and the stop are part of the ADR-175 parent-inherits set: when
the editor folds, the bar shows the toggle next to `#pb-stop`; when it is open,
the current row shows `mp-queue-play` + `mp-queue-stop`.

## Consequences

- The pause affordance is gone as a separate button; its behaviour lives on the
  play/pause toggle.
- Non-current rows carry only the toggle (`▶`); the stop appears on the current
  row (and the bar).
- iframe pseudo-instances (ADR-155) remain uncontrollable: the toggle is a
  no-op for them.
- ADR-187's `_pbPlayCurrent` / `_pbPauseCurrent` / `_isCurrentActive` helpers and
  its `#pb-pause` / `mp-queue-pause` controls are removed.