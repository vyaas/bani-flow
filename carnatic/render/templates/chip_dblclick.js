// chip_dblclick.js — ADR-142 §1 Phase δ: double-click any chip → open its edit form.
//
// Phase A annotated every chip with data-entity-type and (where the construction
// site owned an id) data-entity-id. Phase δ binds the gesture.
//
// Why a time-based detector and not native `dblclick`:
//   Many chip click handlers (graph_view.js, bani_flow.js) call cytoscape
//   `node.emit('tap')` or `triggerBaniSearch(...)`, which rebuild the side
//   panels. The original chip element is removed from the DOM between the
//   first and second click, so the browser's native `dblclick` event — which
//   requires both clicks on the same surviving element — frequently never
//   fires. Instead we track click *times* per (entityType, entityId) and treat
//   two clicks on the same entity within DBL_CLICK_MS as the edit gesture.
//
// Design notes:
//   • Document-level capture-phase click listener. Capture lets us pre-empt
//     per-element handlers when the second click of a pair lands — we cancel
//     the second click's normal navigation and open the form instead.
//   • Match `[data-entity-type][data-entity-id]` only. Chips with type but no
//     id (preface chips, section-header chips) have no entity to open and are
//     silently ignored.
//   • Normalise 'composition' → 'comp' at the boundary — openEditForm's LABELS
//     map (ADR-104 Track A) predates the canonical vocabulary.
//   • The first click is left untouched so single-click navigation still works.

(function () {
  'use strict';

  const DBL_CLICK_MS = 400;

  // entity-type (Phase A vocabulary) → openEditForm key (entry_forms.js dispatcher)
  const ENTITY_TYPE_TO_FORM_KEY = {
    musician: 'musician',
    raga: 'raga',
    composition: 'comp',
    recording: 'recording',
    composer: 'composer',
    edge: 'edge',
  };

  let lastEntityKey = null;   // `${entityType}|${entityId}` of last click target
  let lastClickTime = 0;

  // ── ADR-142 Phase E: first-use discoverability hint ──────────────────────
  // Shows once, gated by localStorage. Dismissed by click, keydown, or 3.5s.
  function _showDblClickHint() {
    try { if (localStorage.getItem('baniDblClickHinted')) return; } catch (e) { return; }
    const hint = document.createElement('div');
    hint.className = 'dblclick-hint';
    hint.textContent = 'Double-click any chip to edit';
    document.body.appendChild(hint);

    function dismiss() {
      hint.classList.add('dh-fading');
      setTimeout(function () { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 370);
      document.removeEventListener('click', dismiss, true);
      document.removeEventListener('keydown', dismiss, true);
      try { localStorage.setItem('baniDblClickHinted', '1'); } catch (e) {}
    }

    setTimeout(dismiss, 3500);
    // Brief delay before wiring dismiss listeners so the current dblclick
    // gesture doesn't immediately trigger dismissal.
    setTimeout(function () {
      document.addEventListener('click', dismiss, true);
      document.addEventListener('keydown', dismiss, true);
    }, 200);
  }

  function handleChipClick(e) {
    const chip = e.target && e.target.closest
      ? e.target.closest('[data-entity-type][data-entity-id]')
      : null;
    if (!chip) {
      lastEntityKey = null;
      return;
    }
    const entityType = chip.dataset.entityType;
    const entityId = chip.dataset.entityId;
    if (!entityType || !entityId) return;
    const key = entityType + '|' + entityId;
    const now = Date.now();
    if (lastEntityKey === key && (now - lastClickTime) <= DBL_CLICK_MS) {
      // Second click on the same entity within the window → edit gesture.
      lastEntityKey = null;
      lastClickTime = 0;
      if (typeof openEditForm !== 'function') {
        console.warn('[ADR-142 δ] openEditForm not defined; chip dblclick ignored', { entityType, entityId });
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      const formKey = ENTITY_TYPE_TO_FORM_KEY[entityType] || entityType;
      openEditForm({ entityType: formKey, id: entityId });
      _showDblClickHint();  // ADR-142 Phase E: first-use hint
      return;
    }
    lastEntityKey = key;
    lastClickTime = now;
  }

  // Capture phase so we run before per-element click handlers.
  document.addEventListener('click', handleChipClick, true);
})();
