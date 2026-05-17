// chip_dblclick.js — ADR-142 §1 Phase δ: double-click any chip → open its edit form.
//                    ADR-144 Phase A: section-header dblclick → open add form.
//                    ADR-144 Phase B: row-block dblclick → open recording edit form.
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
//   • Match `[data-entity-type][data-entity-id]` only for entity-chip edits.
//     Chips with data-chip-role="section-add" are handled by handleSectionAdd.
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

  // ADR-144 Phase A: section-action → openEntryForm type + options factory
  const SECTION_ACTION_TO_ENTRY = {
    'add-musician':  function ()           { return { type: 'musician',             opts: null }; },
    'add-lecdem':    function (musicianId) { return { type: 'musician_recordings',  opts: { nodeId: musicianId, kind: 'lecdem'  } }; },
    'add-concert':   function (musicianId) { return { type: 'musician_recordings',  opts: { nodeId: musicianId, kind: 'concert' } }; },
    'add-recording': function (musicianId) { return { type: 'musician_recordings',  opts: { nodeId: musicianId, kind: 'direct'  } }; },
    'add-bani-flow': function ()           { return { type: 'bani-flow-picker',     opts: null }; },
  };

  let lastEntityKey = null;   // `${entityType}|${entityId}` OR `section-add|<action>|<musicianId>` of last click target
  let lastClickTime = 0;

  // ── ADR-142 Phase E: first-use discoverability hint ──────────────────────
  // Shows once, gated by localStorage. Dismissed by click, keydown, or 3.5s.
  function _showDblClickHint() {
    try { if (localStorage.getItem('baniDblClickHinted')) return; } catch (e) { return; }
    const hint = document.createElement('div');
    hint.className = 'dblclick-hint';
    hint.textContent = 'Double-click any chip to edit; double-click section labels to add';
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

  // ── ADR-144 Phase A: section-add handler ────────────────────────────────
  // Returns true if a section-add chip was matched and handled (or tracked for dblclick).
  function _handleSectionAdd(e) {
    const chip = e.target && e.target.closest
      ? e.target.closest('[data-chip-role="section-add"]')
      : null;
    if (!chip) return false;

    const action     = chip.dataset.sectionAction || '';
    const musicianId = chip.dataset.musicianId    || '';
    if (!action) return false;

    const key = 'section-add|' + action + '|' + musicianId;
    const now = Date.now();

    if (lastEntityKey === key && (now - lastClickTime) <= DBL_CLICK_MS) {
      // Second click → open the add form.
      lastEntityKey = null;
      lastClickTime = 0;

      const factory = SECTION_ACTION_TO_ENTRY[action];
      if (!factory) {
        console.warn('[ADR-144] unknown section-action:', action);
        return true;
      }
      const { type, opts } = factory(musicianId || undefined);

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

      if (typeof openEntryForm === 'function') {
        openEntryForm(type, opts);
      } else {
        console.warn('[ADR-144] openEntryForm not defined; section-add dblclick ignored', { action, musicianId });
      }
      _showDblClickHint();
      return true;
    }

    lastEntityKey = key;
    lastClickTime = now;
    return true;  // consumed (first click of pair)
  }

  function handleChipClick(e) {
    // ADR-144: section-add chips take priority — check before entity chips.
    if (_handleSectionAdd(e)) return;

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
