# ADR-177 — Category Help Cards in a Shared Dialog

**Status**: Accepted (user directive)
**Date**: 2026-10-19
**Author**: pi (`surface` skill)
**Depends on**: ADR-086 (empty-panel tutorials / `empty_tutorials.js`),
ADR-045 (help dialog), ADR-066 (panel header nav), ADR-128 (`buildSection`),
ADR-147 (schema-5 worked-example deck).
**Scope**: `carnatic/render/templates/{base.html,panel_components.js,bani_flow.js,media_player.js,empty_tutorials.js,graph_view.js}`, UIMAP §1, §2, §6.5–6.6.

---

## Context

Help for the two side panels was delivered by an **non-destructive overlay**:
a panel-wide `?` button (`#bani-reset-btn` / `#musician-reset-btn`) called
`togglePanelHelp(slot)`, which hid the panel's scroll-zone children and showed
the entire schema-5 tutorial deck (ADR-147) in their place. The same deck was
also the empty-panel tutorial (ADR-086). The result was a **giant help panel**
that took over one whole sidebar and required a second click to dismiss — poor
for a browsing experience, and impossible to scope to a single category.

The curated help content in `data/help/empty_panels.json` is already organised
by **category** — one `section` per category (`lecdems`, `compositions`,
`misc`, `concerts`, `recordings`, `compositions_empty`), each with a
`section_gloss` and annotated worked-example rows. The overlay exposed all of it
at once; nothing let a user ask "what is *this* section?".

## Decision

Help is delivered as **one card per category inside a pop-up dialog**. The
panel-wide help buttons and the `togglePanelHelp` overlay are retired.

1. **Trigger.** `buildSection` (ADR-128, the shared section constructor) takes
   two new options, `helpKind` and `helpSlot`. When both are set it renders a
   small `?` button (`.section-help-btn`) beside the section chip. The `(N)`
   count moves out of the label wrap into a right-hand `.section-hdr-right`
   group as `(N) ▶ ⊕`, so the `?` stays flush against the category chip. Every
   live section call site passes its category key:
   - Bani Flow — Lecdems, Compositions, Misc.
   - Musician — Lecdems, Concerts, Recordings by raga, Compositions.

2. **Content.** `window.openCategoryHelp(slot, kind)` (empty_tutorials.js)
   borrows the pre-rendered `.pt-v5-section--<kind>` node from the hidden
   tutorial deck — the same curated worked example the overlay showed — and
   moves it into the shared dialog. **Moving, not cloning**, keeps every chip's
   click handler live inside the card. The node is returned to its deck slot on
   close (`window._onHelpDialogClosed`). The deck is wrapped in
   `.panel-tutorial.help-card` so the `.pt-*` styles (scoped to
   `.panel-tutorial`) still apply in the dialog.

3. **Dialog.** The existing `#help-dialog` / `#help-scrim` chrome is
   generalised. Its inline script captures the preface's child nodes and exposes
   `window.openHelpDialog(title, node)` / `window.closeHelpDialog()`. The
   floating `#help-btn` ("About this project") restores that preface; a category
   card swaps in a node and title, and closing restores the deck node.

4. **Landing page.** `_bootHelloWorld` no longer enters the overlay. It keeps
   loading the demo subjects — **reetigowla** in Bani Flow (left) and
   **Ramnad Krishnan** in the Musician panel (right) — which is now the visible
   opening state. Both tutorial decks are still rendered (hidden) on boot so the
   cards have a source.

5. **Retired.** `#bani-reset-btn`, `#musician-reset-btn`,
   `.panel-nav-btn.panel-help-active`, `togglePanelHelp`, `_enterHelp`,
   `_exitHelp`, `_ensureDemoSubjectLoaded`, and the `dismissPanelHelp` calls in
   `bani_flow.js` / `graph_view.js` are deleted.

## Consequences

- Help is discoverable *in situ* and scoped: one question, one card, one close.
- Chip interactivity inside a card is preserved because the node is moved.
- The ADR-086 **empty-state tutorial** (shown when a panel has no subject) is
  left intact for now: it still renders the full deck. Retiring it is a
  follow-up if the "no giant help panel" rule is meant to apply to the empty
  state as well.
- `helpEmptyPanels.intro_ribbon`, `header_annotations`, and `closing_note` have
  no trigger yet (the panel-level button that framed them is gone). They remain
  in the data awaiting a future "panel intro" card.
- If `data/help/empty_panels.json` is absent (`helpEmptyPanels === null`) the
  feature degrades to a no-op: no `?` buttons, no cards.

## Files

- `render/templates/panel_components.js` — `buildSection` `helpKind`/`helpSlot`
  and `.section-help-btn`.
- `render/templates/empty_tutorials.js` — `openCategoryHelp`,
  `_onHelpDialogClosed`, boot sequence.
- `render/templates/base.html` — dialog generalisation, `.section-help-btn`
  CSS, help-button removal.
- `render/templates/bani_flow.js`, `render/templates/media_player.js` — section
  call sites.
- `render/templates/graph_view.js` — `dismissPanelHelp` call removal.
- `render/UIMAP.md` — §1, §2, §6.5–6.6.
