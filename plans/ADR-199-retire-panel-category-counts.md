# ADR-199: Retire Panel Category Counts; Disable Empty Transports

**Status**: Accepted
**Date**: 2026-10-24
**Agents**: surface (UI surgeon)
**Depends on**: ADR-128 (panel components), ADR-166 (section transport pair),
ADR-177 (category help dialog), ADR-178 (content filter), ADR-181 (meta chips),
ADR-182 (themeable badges), ADR-189 (context-scoped playlist rows).

---

## Context

Since ADR-181, panel section headers rendered `[CHIP] [N] [?] ······ [▶ +]`,
and two nested surfaces (`.mp-playlist-count`, `.rec-group-count`) carried the
same enumeration. The count answers a question the panels no longer ask: the
number of items in a category is not the listening decision, and it competes
with the category label and its help affordance for scarce horizontal space.

Separately, every playable section built its ▶ / + pair unconditionally. An
empty category (CONCERTS, RECORDINGS, LECDEMS, COMPOSITIONS, MISC) therefore
showed live transport buttons whose click silently harvested zero items.

User directive: remove the enumeration of panel categories; leave only the
help button beside the category; and dim the play/enqueue pair when a category
contains zero items.

## Decision

1. `.section-hdr-count` is retired from `buildSection`. The `count` argument
   remains — it seeds the transport's empty state and feeds the existing
   populated/empty section ordering — but it is never rendered.
2. The nested enumerations `.mp-playlist-count` (playlist rows) and
   `.rec-group-count` (compositions-per-raga groups) are retired too. Playlist
   rows keep their ⓘ help/info affordance; the per-raga composition groups keep
   only the raga chip and the composition rows.
3. `buildSection` disables both transport buttons when `count <= 0`. Playlist
   rows disable ▶ when no context-matching tracks survive and disable `+` when
   the playlist itself is empty.
4. `syncSectionTransportStates(root)` re-derives each section's transport state
   from `collectQueueItems(bodyEl)` and is called after
   `applyPanelContentFilter`; a section whose filter-visible harvest is empty is
   dimmed even if its unfiltered count is nonzero. The click handlers keep the
   same lazy harvest, so button state and action semantics cannot diverge.
5. Disabled buttons use a single CSS rule (`opacity: 0.35`, no hover fill) shared
   by `.section-play-btn`, `.section-enqueue-btn`, `.rec-play-btn`, and
   `.mp-plus-btn`.

This supersedes the enumeration half of ADR-181 §2 and the count-badge half of
ADR-182; the meta-chip recipe remains for `.section-help-btn` and
`.trail-version`.

## Consequences

- Category headers read `[CHIP] [?] ······ [▶ +]`; labels reclaim the width.
- Empty categories are visibly inert, not silently inert.
- Filtering to zero matches dims that section's transport pair without hiding
  the category header or its help.
- Playlist and raga-group rows lose their count chips; playlist track identity
  remains available through ⓘ or the row list itself.
