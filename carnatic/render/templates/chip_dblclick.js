// chip_dblclick.js — ADR-142 §1 Phase δ: double-click any chip to open its edit form.
//
// Phase A annotated every chip with data-entity-type and (where the construction
// site owned an id) data-entity-id. This module wires a single delegated dblclick
// listener at the document level that maps those attributes into the existing
// openEditForm({entityType, id}) dispatcher in entry_forms.js.
//
// Design notes:
//   • Delegation, not per-chip listeners. Chips are dynamically rebuilt on every
//     panel render; per-element listeners would leak. One document-level handler
//     survives all re-renders.
//   • Match `[data-entity-type][data-entity-id]` only. Chips without an id
//     (e.g. section-header chips that classify but don't identify) get no
//     gesture — there is nothing to open them to.
//   • Normalise 'composition' → 'comp'. openEditForm's LABELS map uses the
//     legacy 'comp' key (ADR-104 Track A); the data-entity-type vocabulary
//     uses the canonical 'composition'. Translate at the boundary, not in
//     the entity-type attribute itself.
//   • Stop the dblclick from propagating to cytoscape / wheel handlers. A
//     dblclick on a chip means "edit this entity", not "expand its neighborhood".
//   • Capture phase. Use capture so this handler runs before any per-element
//     dblclick (e.g. raga_wheel composition nodes), giving chip-level entity
//     gestures priority when both could match.

(function () {
  'use strict';

  // entity-type (Phase A vocabulary) → openEditForm key (entry_forms.js dispatcher)
  const ENTITY_TYPE_TO_FORM_KEY = {
    musician: 'musician',
    raga: 'raga',
    composition: 'comp',
    recording: 'recording',
    composer: 'composer',
    edge: 'edge',
  };

  function handleChipDblClick(e) {
    const chip = e.target && e.target.closest
      ? e.target.closest('[data-entity-type][data-entity-id]')
      : null;
    if (!chip) return;
    const entityType = chip.dataset.entityType;
    const entityId = chip.dataset.entityId;
    if (!entityType || !entityId) return;
    const formKey = ENTITY_TYPE_TO_FORM_KEY[entityType] || entityType;
    if (typeof openEditForm !== 'function') {
      console.warn('[ADR-142 δ] openEditForm not defined; chip dblclick ignored', { entityType, entityId });
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    openEditForm({ entityType: formKey, id: entityId });
  }

  // Wire on capture so chip-level entity gestures beat node-level handlers
  // (e.g. raga_wheel composition dblclick → triggerBaniSearch).
  document.addEventListener('dblclick', handleChipDblClick, true);
})();
