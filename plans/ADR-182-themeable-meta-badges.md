# ADR-182: High-contrast, Themeable Meta Badges

**Status**: Accepted
**Date**: 2026-10-20
**Agents**: surface (UI surgeon) → tester
**Depends on**: ADR-028 (design-token single source of truth), ADR-181
(transport buttons + left-aligned meta chips).

---

## Context

ADR-181 introduced gray meta chips for section enumeration, category help, the
per-raga composition count and the playlist count, and reused the existing
`.trail-version` recipe for the recording-version badge. That recipe paired
`--bg-active` (gray) with `--bg-panel` (near-black) as the *text* colour. At
0.58rem the near-black-on-gray pairing is only ~2.5:1 — below WCAG AA — and the
digits (`9`, `13`, `?`) were hard to read.

The tokens were also hard-wired to generic `--bg-*`/`--fg-*` scales, so a future
theme (a stated later scope) could not restyle the badge surface without also
moving unrelated backgrounds.

## Decision

### 1. Dedicated meta-badge tokens

`theme.py` / `theme.js` gain three semantic tokens, exposed as CSS vars:

| token | CSS var | value | role |
|---|---|---|---|
| `chipMetaBg` | `--chip-meta-bg` | `bg2` `#504945` | neutral gray badge surface |
| `chipMetaFg` | `--chip-meta-fg` | `fg` `#ebdbb2` | high-contrast badge text |
| `chipMetaBorder` | `--chip-meta-border` | `bg3` `#665c54` | subtle chip frame |

The bright foreground is deliberate: `#ebdbb2` on `#504945` is **6.43:1**
(WCAG AA for normal text, near AAA), legible at 0.58rem.

A future theme switches only these three tokens; the badge surface is decoupled
from the generic background/foreground scale.

### 2. One badge family

`.section-hdr-count`, `.section-help-btn`, `.mp-playlist-count`,
`.rec-group-count` and `.trail-version` all consume the same three tokens and
share the chip frame (`1px` border, `3px` radius). The `.trail-version` badge
(recording versions — "v1"/"v2") moves from 2px/no-border to this recipe so the
version label reads like the enumeration/help chips.

The muted-text overrides on `.rec-group-count` (`#recordings-list …`,
`.comp-raga-header …`) are reduced to spacing only, so they can no longer
out-specify the badge's foreground. The freeform `.rec-version-label` text
(multi-recording rows) is raised from `--fg-muted` to `--fg-sub`.

## Consequences

- Enumeration, help and version badges are legible (6.43:1) and visually one
  family with the vocabulary chips.
- Badge styling is themeable in isolation via `--chip-meta-*`.
- A future theme ADR only needs to re-map the three tokens; no template edit.

## Out of scope

The broader theme system (palette switching, light theme, persistence) remains
future work; this ADR only carves out the badge surface so it is ready for it.
