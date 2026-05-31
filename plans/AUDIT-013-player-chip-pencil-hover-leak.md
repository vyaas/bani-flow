# AUDIT-013: Player Chip Pencil-Hover Affordance Leak

**Status**: Findings complete — routed to Carnatic Coder  
**Date**: 2026-05-31  
**Auditor**: Code Auditor

---

## Scope

`carnatic/render/templates/base.html` (CSS) and `carnatic/render/templates/media_player.js` — the edit-gesture pencil affordance (✎ on hover) as it leaks into the floating media player (`.media-player`).

---

## Findings

### F-001 — Base pencil rule covers all entity chips, including player chips

**File**: `carnatic/render/templates/base.html`  
**Lines**: ~1893–1902  
**Pattern**: Overly broad CSS selector — no container scope

```css
[data-chip-role][data-entity-type][data-entity-id]:hover {
  box-shadow: inset 0 0 0 1px var(--fg-muted, currentColor);
}
[data-chip-role][data-entity-type][data-entity-id]:hover::after {
  content: " ✎";
  font-size: 0.85em;
  opacity: 0.55;
  margin-left: 2px;
  pointer-events: none;
}
```

This selector is document-wide. It matches any chip anywhere in the DOM that carries `data-chip-role`, `data-entity-type`, and `data-entity-id`. The media player is a sibling of the sidebars inside `#main`, so its chips are fully exposed to this rule.

---

### F-002 — Musician chip in player footer carries entity role

**File**: `carnatic/render/templates/media_player.js`  
**Line**: 479  
**Pattern**: `applyChipRole(chip, 'entity', 'musician', nodeId)` — navigation chip, not editable

The musician chip built by `_buildMusicianChipForFooter` is navigation-only (single-click opens the Musician panel). It is never dblclick-editable. Yet because it carries `data-chip-role="entity"`, `data-entity-type="musician"`, and `data-entity-id`, F-001 applies and shows a pencil on hover.

---

### F-003 — Composer chip in player footer carries entity role

**File**: `carnatic/render/templates/media_player.js`  
**Lines**: 838–839  
**Pattern**: `applyChipRole(chip, 'entity', 'musician', composerObj.musician_node_id)` — navigation only

Same as F-002. The composer chip is navigation-only; it opens the composer's musician panel. The pencil misleads users into expecting edit access.

---

### F-004 — Co-performer chips in concert bracket carry entity role

**File**: `carnatic/render/templates/media_player.js`  
**Line**: 1147  
**Pattern**: `applyChipRole(chip, 'entity', 'musician', pf.musicianId)` — navigation only

Co-performer chips displayed beneath a concert title are navigation-only. Same leak applies.

---

### F-005 — Panel-title concert chip also leaks pencil inside the player

**File**: `carnatic/render/templates/media_player.js`  
**Line**: 1122  
**Pattern**: `applyChipRole(titleSpan, 'panel-title', 'recording', concert.recording_id)`

The concert title chip carries `data-chip-role="panel-title"`, which triggers the stricter ADR-153 pencil rule (lines ~1906–1932): `position: relative`, the absolute `✎` pseudo-element, and the dashed outline on hover. This chip lives inside `.media-player`, not inside a sidebar panel — the user's intent is that **only panel chips are editable**. The player is not a panel.

---

### F-006 — Suppression rules are sidebar-scoped only; player is unguarded

**File**: `carnatic/render/templates/base.html`  
**Lines**: ~1967–1993  
**Pattern**: Suppression rules use `#left-sidebar` and `#right-sidebar` prefixes; `.media-player` has no equivalent suppression

Existing suppression rules for navigation-only chips are correctly scoped to the sidebar containers. The media player — living in `#main` outside both sidebars — has no corresponding suppression, leaving all entity and panel-title chips inside `.media-player` exposed to the pencil affordance.

---

## Recommendations

Add a CSS suppression block scoped to `.media-player` that overrides both the base entity-chip pencil rule (F-001) and the panel-title pencil rule (F-005):

```css
/* Media player: chips are navigation-only — suppress all edit-gesture affordances */
.media-player [data-chip-role][data-entity-type][data-entity-id]:hover {
  box-shadow: none;
}
.media-player [data-chip-role][data-entity-type][data-entity-id]:hover::after {
  content: none;
}
.media-player [data-chip-role="panel-title"][data-entity-type][data-entity-id]:hover {
  outline: none;
}
.media-player [data-chip-role="panel-title"][data-entity-type][data-entity-id]::after {
  display: none;
}
```

Place this block immediately after the existing `#left-sidebar` lecdem recording pencil rules (after the `#left-sidebar [data-chip-role="entity"]...` block), before the `.dblclick-hint` block.

No JavaScript changes are required. The `chip_dblclick.js` handler already correctly skips non-`panel-title` chips; the bug is purely presentational (CSS affordance not matching actual capability).

---

## Routing

| Finding | Severity | Route |
|---------|----------|-------|
| F-001 through F-006 | UX / affordance mismatch | **Carnatic Coder** — pure CSS fix in `base.html` |

No schema changes. No ADR required (this is a CSS scope correction, not a design decision).

---

*Learning log entry appended to `carnatic/.clinerules`.*
