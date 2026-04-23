# Empty-panel tutorials (ADR-086)

This directory holds copy and seed examples that render in the **null state**
of the Bani Flow and Musician panels — the body of help text a first-time
visitor sees in the empty space where their selection has not yet appeared.

## Files

- **`empty_panels.json`** — single source of truth for both panels' tutorial
  cards. Schema sketched in [ADR-086](../../../plans/ADR-086-empty-panel-tutorials.md).

## Validation

Every `id` in this file (`subject_id`, `items[].id`, `recording_ref.musician_id`,
`recording_ref.raga_id`, `lecdem_ref.musician_id`) must resolve in `graph.json`.
`recording_ref` additionally requires that *some* performance exists matching
`(musician_id, raga_id, concert_hint substring)`. The check runs as part of
`python3 carnatic/cli.py validate` and is enforced in CI.

When you rename a node or restructure a recording, update this file in the same
PR — otherwise the validator fails loudly and the tutorial would silently
navigate to nothing.

## Editing guidelines

- **Keep `try_these` short** — the ADR caps each panel at six chips so the
  tutorial stays scannable. Prefer replacing rather than adding.
- **Use real, navigable seeds** — every chip must lead the user somewhere
  listenable. A chip that resolves to a node with no recordings is worse than
  no chip.
- **`recording_ref.concert_hint` is a substring** matched (case-insensitive)
  against `recording_id` *and* `title`. Keep it specific enough to be unique
  for the chosen `(musician_id, raga_id)` pair.
- **`lecdem_ref` is intentionally coarse** — it opens the host musician's
  panel; the lecdem strip (ADR-080/ADR-081) takes over from there. Do not
  hard-code a specific lecdem id.

## Render contract

The tutorial card is the panel's null state, not a banner. It is dismissed
atomically when a subject loads (`buildListeningTrail`, `selectNode`) and
restored when the subject is cleared (`clearBaniFilter`, canvas background tap).
Visual treatment uses existing design tokens (`--bg-deep`, `--fg-muted`,
`--border-soft`) — no new tokens introduced by ADR-086.
