# ADR-202 — Panel add anchors the subject chip row

**Status**: Accepted (user directive 2026-10-24)
**Date**: 2026-10-24
**Author**: pi (`surface` skill)
**Depends on**: ADR-028 (theme tokens), ADR-128 (panel components), ADR-174
(UI surface map), ADR-178 (unified content filter), ADR-180 (ribbon rows),
ADR-198 (panel searches retired).
**Supersedes**: ADR-198 D2's "the add leads the content-filter row" clause;
the add-placement sentence in ADR-201 D2.
**Scope**: `carnatic/render/templates/base.html`, `carnatic/render/UIMAP.md`
§1 / §2, `test_grand_search_editor.py`.

---

## Context

ADR-198 removed the panel search bars and moved the add control (`#bani-add-btn`
/ `#panel-add-btn`) to the leftmost slot of each content-filter row, so the
filter input read as indented under the subject chip:

```
[icon] [chip ………………………] [popup] [↗]
[+]    [Filter content ………………………………] [▶] [+]
```

ADR-201 then moved the history pair out of the chip row into the top-right
chrome, freeing the chip row's right edge. The add is the only other control
that had been sharing the command rows, and leaving it on the filter row means
the filter row still leads with a non-filter control and the filter input
cannot use the full width.

## Decision

### D1 — The add moves to the chip row, right-justified

Each panel's add button becomes the last child of its subject chip row and its
right edge anchor, via `margin-left: auto`:

```
[icon] [chip ………………………] [popup] [↗]   [+]
[Filter content ……………………………………………] [▶] [+]
```

- Bani panel: `#bani-add-btn` moves into `#bani-subject-name-row`.
- Musician panel: `#panel-add-btn` moves into `#node-header-chip-row`.

`#node-header-chip-row` is already `width: 100%`, so `margin-left: auto`
right-justifies the add even for a short subject name. The subject chip/name
remains the row's horizontal-scroll surface; the add is pinned.

### D2 — The filter row becomes content-only

`#trail-filter-row` / `#rec-filter-row` keep only the filter input and the
play/enqueue pair. The filter input (`flex: 1`) now uses the full row width;
the empty-state `.panel-empty` rules still hide the filter and transport, and
the bani empty rule is narrowed to `> :not(.panel-add-btn)` so the add survives
on an empty panel.

The add keeps the `.panel-nav-btn` square primitive and the same
`openEntryForm(...)` handler; only its position changes. No JS changes.

## Consequences

- The chip row is the single control row: subject identity + affordances +
  add. It is flush-right and mirrors the top-right chrome's `[←][→][?]`
  pattern of app-level anchors.
- The filter row is unambiguous — every control in it acts on the panel's
  content, and the input gains the horizontal space the add used to occupy.
- The empty panel shows just the add, right-justified, exactly as it did when
  the add was leftmost on the filter row (ADR-198's "the add remains" contract
  is preserved).
- `test_grand_search_editor.py` pins the new geometry: nav in
  `#app-title-float` left of help, add as the last child of each chip row with
  `margin-left: auto`, and no add in either filter row.
- No data, schema, or player changes.

## Alternatives considered

- **Two-row chip + add group** — rejected: reintroduces a chrome row ADR-198
  removed.
- **Keep the add on the filter row but right-align it** — rejected: leaves the
  filter sharing its row with a non-filter control and wastes the row's left
  inset.
- **Make the add a floating overlay** — rejected: overlays the scroll content
  in a dense ribbon UI.
