# AUDIT-006: WDP and Bani-Flow Panel Scroll Anchoring

**Status**: Open  
**Date**: 2026-05-20  
**Scope**: Scroll behaviour in the Wheel Detail Panel (WDP) and the Bani-Flow trail panel when a raga or composition chip is clicked or a new filter is applied.  
**Requested by**: User (scrollbar UX complaints — two specific issues)  
**Routing**: All findings → 🎵 Carnatic Coder (code-level implementation, no schema change needed)

---

## Scope

Two scrollable regions were examined:

| Region | Element | Scroll container |
|---|---|---|
| Wheel Detail Panel (WDP) | `#wheel-detail-panel > .wdp-body` | `.wdp-body` (`overflow-y: auto`) |
| Bani-Flow trail panel | `#bani-scroll` | `#bani-scroll` (`overflow-y: auto`) |

The following JS template files were read in full:

- [`carnatic/render/templates/raga_wheel.js`](../carnatic/render/templates/raga_wheel.js)
- [`carnatic/render/templates/bani_flow.js`](../carnatic/render/templates/bani_flow.js)

---

## Findings

### F1 — `block: 'nearest'` in `_wdpSelectJanya` puts janya chip at the bottom, not the top

**File**: [carnatic/render/templates/raga_wheel.js](../carnatic/render/templates/raga_wheel.js#L685-L688)  
**Lines**: 685–688  
**Pattern**: Wrong `scrollIntoView` alignment value

```js
  if (chipEl) {
    chipEl.classList.add('wdp-selected');
    chipEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });  // ← WRONG
  }
```

`block: 'nearest'` scrolls the **minimum** distance to make the element visible — if the janya chip is deep in a long list, it ends up at the **bottom** edge of `.wdp-body`'s viewport. The user then sees the janya chip with its composition children hidden below the fold, and the mela context (chips above) is lost.

`block: 'start'` would scroll `.wdp-body` so the janya chip sits at the **top** of the visible area, giving the user a clear read of all compositions beneath it.

This function is called in two paths:
- **Direct click** on a janya chip in the WDP → `_wdpSelectJanya(janya, chip)` (line 629)
- **Programmatic sync** from `_triggerMelaExpand` via `setTimeout(..., 50)` → `_wdpSelectJanya(janya, chipEl, true, targetCompId)` (line 2507–2512)

Both paths hit the same `scrollIntoView` at line 687.

---

### F2 — `block: 'nearest'` in `_triggerMelaExpand` (mela-direct comp chip) has the same defect

**File**: [carnatic/render/templates/raga_wheel.js](../carnatic/render/templates/raga_wheel.js#L2508-L2514)  
**Lines**: 2508–2514  
**Pattern**: Wrong `scrollIntoView` alignment value (duplicate of F1, different branch)

```js
      const activeChip = panel.querySelector('.wdp-chip.wdp-comp[data-id="' + CSS.escape(targetCompId) + '"]');
      if (activeChip) {
        activeChip.classList.add('wdp-active');
        activeChip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });  // ← WRONG
      }
```

This branch handles **mela-direct** compositions (those with no janya intermediary). When a user searches a composition that lives directly under a mela, the WDP opens and this code runs — leaving the comp chip at the bottom of the WDP body when it should be at the top.

---

### F3 — Comp chip click in WDP triggers no WDP scroll at all

**File**: [carnatic/render/templates/raga_wheel.js](../carnatic/render/templates/raga_wheel.js#L720-L749)  
**Lines**: 720–749  
**Pattern**: Missing scroll-to-parent affordance

```js
    chip.addEventListener('click', (e) => {
      // ...
      chip.classList.add('wdp-active');
      window._wheelSyncInProgress = true;
      window._wheelOriginatedTrigger = true;
      if (!item._isPerf) {
        if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', item.id);
      }
      // ... other cases
      window._wheelSyncInProgress = false;
      window._wheelOriginatedTrigger = false;
    });
```

When the user clicks a **composition chip** inside the WDP, the bani-flow panel is populated (scroll reset ✓ — see F4 below) but **the WDP itself does not scroll at all**. The parent janya chip (the "raga" anchor) may be off-screen above the fold. The user sees the `wdp-active` composition chip but not the raga it belongs to.

The DOM structure of `#wdp-janya-list` is a flat interleaving: each janya chip is immediately followed by its `.wdp-comp-group` (inserted via `afterChip.insertAdjacentElement('afterend', group)`). So the parent janya chip is always the **previous sibling** of the comp chip's `.wdp-comp-group` container:

```
#wdp-janya-list
  div.wdp-chip.wdp-raga[data-id="janyaId"]   ← parent janya
  div.wdp-comp-group
    div.wdp-chip.wdp-comp                      ← clicked comp chip
  div.wdp-chip.wdp-raga[data-id="..."]
  ...
```

For **mela-direct** comp chips (no janya intermediary, appended directly to `wdp-body` via the `panel.appendChild(group)` branch), the section label above is the natural anchor. Scrolling the comp chip itself to `block: 'start'` would show the section label just above it.

---

### F4 — Bani-Flow scroll reset is already in place (no action needed)

**File**: [carnatic/render/templates/bani_flow.js](../carnatic/render/templates/bani_flow.js#L237-L238)  
**Lines**: 237–238  
**Pattern**: Reset is present and correct

```js
  const _baniScroll = document.getElementById('bani-scroll');
  if (_baniScroll) _baniScroll.scrollTop = 0;
```

`buildListeningTrail` resets `#bani-scroll` to the top synchronously before adding new content (lecdem strip + trail rows). All paths that populate the bani-flow panel — including chip clicks in the trail, mela clicks on the wheel, and janya chip clicks in the WDP — ultimately invoke `buildListeningTrail` (either via `applyBaniFilter` or `triggerBaniSearch`). **No change needed here.** The bani-flow scroll reset is correctly implemented.

---

## Recommendations

### R1 — Change `block: 'nearest'` to `block: 'start'` at line 687 in `raga_wheel.js`

**Addresses**: F1

```js
// BEFORE
chipEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

// AFTER
chipEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
```

This single-character change makes the janya chip appear at the **top** of the WDP body whenever it is selected — whether by direct user click or by programmatic sync from a search/filter.

---

### R2 — Change `block: 'nearest'` to `block: 'start'` at line 2511 in `raga_wheel.js`

**Addresses**: F2

```js
// BEFORE
activeChip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

// AFTER
activeChip.scrollIntoView({ block: 'start', behavior: 'smooth' });
```

Keeps behaviour consistent between janya and mela-direct composition chips.

---

### R3 — Add scroll-to-parent-janya in the `_wdpRenderComps` comp chip click handler

**Addresses**: F3

After `chip.classList.add('wdp-active')` (line 730) and *before* `window._wheelSyncInProgress = true`, add a scroll call that targets the parent janya chip:

```js
// Scroll the parent janya chip (prev sibling of this chip's .wdp-comp-group)
// to the top so the raga anchor is always visible above its compositions.
const compGroup = chip.closest('.wdp-comp-group');
if (compGroup) {
  // Janya chip: immediate prev sibling of the comp group in #wdp-janya-list
  const janyaChip = compGroup.previousElementSibling;
  if (janyaChip && janyaChip.classList.contains('wdp-raga')) {
    janyaChip.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
} else {
  // Mela-direct composition: scroll the chip itself to the top
  chip.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
```

This ensures that clicking any composition chip always brings the associated raga label to the top of the WDP body — consistent with the janya-chip click behaviour fixed by R1.

---

## Routing

All three recommendations are **code-level changes** in a single JS template file:

| Recommendation | File | Lines affected | Agent |
|---|---|---|---|
| R1 | `carnatic/render/templates/raga_wheel.js` | 687 | 🎵 Carnatic Coder |
| R2 | `carnatic/render/templates/raga_wheel.js` | 2511 | 🎵 Carnatic Coder |
| R3 | `carnatic/render/templates/raga_wheel.js` | 730–731 (insert) | 🎵 Carnatic Coder |

No schema changes, no ADR required. Estimated blast radius: one template file, three localised edits.

After implementation, the Coder must run `bani-render` and verify:
1. Clicking a janya chip in the WDP scrolls it to the top of the WDP body.
2. Clicking a composition chip in the WDP scrolls the parent janya chip (or the comp chip itself, for mela-direct) to the top.
3. Both behaviours hold when triggered from a search (programmatic sync via `syncRagaWheelToFilter`).
4. The bani-flow panel scroll resets to show the lecdem strip first — already working, confirm it hasn't regressed.
