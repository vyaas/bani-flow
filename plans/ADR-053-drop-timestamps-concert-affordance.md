# ADR-053: Drop Track Timestamps; Signal Concert Origin via Play-Button Shape and Pressed-Row State

**Status**: Accepted
**Date**: 2026-04-21
**Agents**: graph-architect

## Context

Every recording row in both panels currently ends with a `MM:SS ↗` link that opens YouTube at the offset timestamp. Three problems:

1. **Bani Flow is not a media player.** The user listens through an embedded YouTube iframe; the timestamp link is redundant with the ▶ button.
2. **Variable-width timestamps create jagged right-edge alignment** of every row, hurting scannability of the artist list.
3. **The link conveys no useful musical information.** What *is* useful — "this track is part of a concert recording" vs "this is a standalone YouTube link" — is not signalled at all today.

We are optimising for a listening experience, not a track index. The unique combination *raga × composition × musician* is the unit of immersion. The timestamp is metadata about a video file; it does not deserve display real estate.

## Forces

- **Immersion > completeness**: drop information that does not aid the listening goal.
- **Preserve context**: the listener should still know when a track is anchored in a concert (because that opens the door to "what came next?" and the existing concert track-switcher).
- **Pressed-button affordance**: when a row is the currently playing track, the user must be able to identify it at a glance amid the list.
- **No new chrome**: reuse the existing sruti-bar pressed-button vocabulary.

## Pattern

**Levels of Scale + Strong Centres**: the playing row becomes the strongest centre in the panel. Other rows recede.

## Decision

### Remove the timestamp link from every row

In `bani_flow.js` (around lines 698–710) and `media_player.js` (around lines 575–585), drop the trailing `linkA` element entirely. Row 2 ends after the chips.

### Two play-button shapes

| Variant class | Border style | Used when |
|---|---|---|
| `.play-btn-direct` | solid | Row was built from a raw musician YouTube entry (no `recording_id`) |
| `.play-btn-concert` | dashed | Row's track has a truthy `recording_id` (it lives inside `data/recordings/*.json`) |

The dashed border is the standing visual cue that this track is "from a concert". A `title` attribute supplies the concert label on hover/long-press: `From: <concert.short_title> (YYYY)`.

```css
.play-btn-direct  { border: 1px solid var(--border); }
.play-btn-concert { border: 1px dashed var(--border-strong); }
.play-btn-concert:hover { border-color: var(--accent); }
```

### Pressed-row state for the currently playing track

When a row is the active track:

```css
li.rec-legacy.playing,
.concert-perf-row.playing {
  background: var(--bg-pressed);                     /* slightly darker bg */
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.35);      /* sruti-bar pressed feel */
  border-color: var(--accent);
}
```

The existing `playing` class is already toggled by `media_player.js` when a track loads; we are simply enriching its visual treatment.

### Sibling clearing

When a new track plays, the previous `.playing` row in the same list must lose the class. The current code already handles this for `.rec-legacy`; extend the loop to `.concert-perf-row` rows too.

## Consequences

- Right-edge alignment is uniform — rows form a clean vertical column ending in the play button.
- The user can scan a tracklist and instantly tell concert tracks from one-off uploads.
- The currently playing row reads as a pressed button — a strong, familiar affordance that connects the panel to the player.
- Slight loss: the user can no longer right-click to grab a deep-link with the offset timestamp baked in. This is acceptable because the iframe player itself exposes the offset on YouTube's UI.

## Implementation

1. Add CSS tokens and rules for `.play-btn-direct`, `.play-btn-concert`, `.playing` row in `base.html`.
2. Remove the timestamp link element from row builders in `bani_flow.js` and `media_player.js`.
3. At row-build time, choose the play-button class based on `truthy(row.recording_id || row.track.recording_id)`.
4. Set the `title` attribute when concert-backed.
5. Verify the `playing` class is correctly applied/cleared across both row types when tracks change.
