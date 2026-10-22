# ADR-187 — Separate Play/Resume and Pause Controls

**Status**: Superseded by ADR-188 (2026-10-25) — the split play/pause pair was
replaced by a single play/pause toggle plus a dedicated stop.
**Date**: 2026-10-25
**Author**: pi (`surface` skill)
**Depends on**: ADR-161 (`.mp-toggle-btn` primitive), ADR-175 (Playlist Bar /
parent-inherits rule), ADR-186 (row/bar operator parity, video toggle).
**Scope**: `carnatic/render/templates/base.html`, `media_player.js`,
UIMAP §5, `test_ui_surface_map_drift.py`.

---

## Context

The Playlist Bar carried a single `#pb-play` button that doubled as a
play/pause toggle (icon `▶` when paused, `❚❚` when playing). The queue row's
`mp-queue-play` is a different control — a play/stop per item — so the row had
no pause affordance at all: the only way to pause was the bar's toggle, and
`❚❚` there both *is* the pause and *reports* the playing state.

## Decision

Split the bar transport into an explicit **play/resume** button and a
**pause** button, and mirror the pair in the current queue row.

### D1 — `#pb-play` is play/resume only

`#pb-play` always renders `▶` and calls `_pbPlayCurrent()` (resume, or restart
the current item when stopped). It is no longer an `.mp-toggle-btn` and no
longer carries `aria-pressed` — the playing state is no longer encoded on the
play button.

### D2 — `#pb-pause` is the explicit pause

A new `#pb-pause` button (`❚❚`) calls `_pbPauseCurrent()` and is disabled unless
the current controller is actually playing. Both live in `#pb-transport` and are
part of the parent-inherits operator set: the bar shows them when the editor is
folded, the current row shows them when it is open.

### D3 — The row carries the same pair

The current row's `mp-queue-play` (play/stop, unchanged) is joined by an
`mp-queue-pause` operator (`❚❚`), disabled unless the current item is playing.
Pause is intentionally distinct from the row's stop: stop destroys the
controller and loses the position, pause keeps the window and the playhead.

### D4 — Shared primitives

`_pbSetPaused(bool)` drives the controller (Plyr or iframe-uniform) and is the
single pause/resume primitive. `_pbPlayCurrent` / `_pbPauseCurrent` wrap it;
`_pbPlayPauseCurrent` (the old toggle) is retained for the row's resume path.
`_isCurrentPlaying()` is the shared "is the sound actually rolling?" predicate
used to enable/disable the pause controls.

## Consequences

- The bar and row read as the same transport: `▶` play/resume + `❚❚` pause,
  `■` stop.
- `#pb-play`'s `aria-pressed` / dynamic `❚❚` state is gone; any styling or test
  that keyed on it must be revised.
- Paused state is visible on `#pb-pause` (enabled only while playing) rather
  than inferred from the play glyph.
- iframe pseudo-instances remain uncontrollable; `_pbSetPaused` no-ops for
  them (ADR-155), so the pause control stays disabled.