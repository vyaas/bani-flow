# ADR-133: Mela-Janya as the Primary View — Reorder the View Selector

**Status**: Accepted
**Date**: 2026-05-12
**Author**: Graph Architect
**Depends on**: ADR-129 (chrome retirement, floating view selector), ADR-102 (help deck — names the two views as "the two organs")
**Related**: ADR-123/124 (raga-wheel as default), ADR-013 (guru-shishya graph), ADR-134 (connected-only graph — companion change to this surface)

---

## Context

The view selector renders two pill-buttons in the order **`Guru-Shishya | Mela-Janya`** (left → right). The empty-state tutorial (`empty_tutorials.js` lines 745–759) and the help-deck spread (ADR-102 §"the two organs") follow the same order. The default landing view, however, has been **Mela-Janya** since `graph_view.js` was changed to call `requestAnimationFrame(() => switchView('raga'))` on boot.

The order is therefore inverted from the actual entry point. A new visitor sees the raga wheel but the selector's *first* affordance points back to a view they have not yet seen. Worse, the order quietly asserts that the human lineage is the primary axis — when the project's stated stance (ADR-102) is that **the music is the centre and the musicians are its carriers**.

### Forces

| Force | Direction |
|---|---|
| **Primacy reads left-to-right** | In a two-pill toggle, the left pill is read as "the default, the home". The default is currently Mela-Janya; the left pill must match. |
| **Music-first stance** | ADR-102 frames the rasika's encounter as *with the sound first, the lineage second*. The order of the toggle is the most visible sentence the app speaks about its own priorities. |
| **Help-text consistency** | The help deck enumerates the views in the same order as the selector. Re-ordering one without the other re-introduces the ambiguity we are trying to remove. |
| **Muscle memory** | Existing users who reach for the right pill to switch to Mela-Janya will, after this change, reach for the left. This is a small, one-time adjustment and is the cost of the correction. |
| **No data-model implication** | The token names `'graph'` / `'raga'` in `switchView()` are unchanged. This is a presentation reorder. |

---

## Pattern

**Christopher Alexander, *A Pattern Language*, Pattern 130 — *Entrance Room*.** The entrance is the threshold the visitor crosses *first*. It must announce what kind of building this is. Putting the secondary view at the entrance misnames the building.

**The Nature of Order, Book 1, Property 7 — *Positive Space*.** The default view is positive (filled-in, present); the alternative is the negative (the door you can step through). Positive space sits on the left of the reading axis in left-to-right scripts.

---

## Decision

### D1. Reorder the view-selector pills

In `empty_tutorials.js` (lines 745–759), the Mela-Janya button (`ragaBtn`) is appended to `switcher` **before** the Guru-Shishya button (`graphBtn`). The token vocabulary is unchanged: `switchView('raga')` still selects the wheel; `switchView('graph')` still selects the graph.

| Was | Becomes |
|---|---|
| `[ Guru-Shishya ] [ Mela-Janya ]` | `[ Mela-Janya ] [ Guru-Shishya ]` |

### D2. Reorder the help-deck enumeration

Wherever the help deck (ADR-102) or any tutorial overlay names the two views in sequence, **Mela-Janya is named first**. Concretely:

- The "two organs" paragraph (ADR-102 §View Spread) is rewritten to lead with Mela-Janya:

  > *"The two views — Mela-Janya and Guru-Shishya — are the two organs through which a rasika holds the tradition: the modal world and the human lineage. Switch between them. The same raga sounds different when you hear it in three different lineages; the same musician sounds different when you hear them inside their bani."*

- Empty-state tutorial lines that pair the two views (`empty_tutorials.js` ~lines 854–859) order Mela-Janya first.

### D3. Default view affirmed in code

`graph_view.js` already boots with `switchView('raga')`. This ADR ratifies that as the canonical default and forbids re-introducing `switchView('graph')` as the boot call without superseding this ADR.

---

## Consequences

- **Positive**: The three surfaces (selector, help deck, boot order) tell a single story. A new visitor lands on the raga wheel and sees the first pill is the view they are already on — the second pill is the door.
- **Positive**: The music-first stance becomes legible without a single line of explanatory copy.
- **Negative (small)**: Existing users have one cycle of mis-clicks. Acceptable.
- **Neutral**: No change to data, edges, or query semantics. No render-pipeline impact.

---

## Implementation

This is a **two-file presentation change** — assignable to the Carnatic Coder once Accepted.

| File | Change |
|---|---|
| `carnatic/render/templates/empty_tutorials.js` | Swap append order around lines 745–759; swap the `(Guru-Shishya)` / `(Mela-Janya)` parenthetical lines around 854–859. |
| `carnatic/render/templates/help_deck.js` (or wherever the "two organs" paragraph lives) | Rewrite the paragraph per D2; swap any other `Guru-Shishya … Mela-Janya` enumerations to lead with Mela-Janya. |

No JSON data changes. No schema changes. No new tokens.

**Verification**: After `bani-render`, load `graph.html`, confirm `[ Mela-Janya ] [ Guru-Shishya ]` order in the floating selector; open help deck and confirm the same order in prose.

---

## Status history

- 2026-05-12: **Proposed** by Graph Architect.
- 2026-05-12: **Accepted** — implementation assigned to Carnatic Coder.
