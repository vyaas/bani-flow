// ── empty_tutorials.js (ADR-086) ─────────────────────────────────────────────
// Renders the null-state tutorial inside the Bani Flow and Musician panels.
// Data comes from helpEmptyPanels (injected by html_generator from
// data/help/empty_panels.json). When that file is absent the global is null
// and every function in this module degrades to a no-op.
//
// Public surface:
//   showPanelTutorial(slot)   — slot ∈ {'bani', 'musician'}
//   hidePanelTutorial(slot)
// Wired into bani_flow.js (clearBaniFilter / buildListeningTrail) and
// graph_view.js (background tap / selectNode).

(function () {
  const SLOT_TO_BLOCK = {
    bani:     'bani_flow_panel',
    musician: 'musician_panel',
  };
  const SLOT_TO_CONTAINER_ID = {
    bani:     'bani-tutorial',
    musician: 'musician-tutorial',
  };

  function _block(slot) {
    if (!helpEmptyPanels) return null;
    const key = SLOT_TO_BLOCK[slot];
    return key ? (helpEmptyPanels[key] || null) : null;
  }

  function _el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls)  e.className   = cls;
    if (text) e.textContent = text;
    return e;
  }

  // ── Click resolvers for try_these items ──────────────────────────────────
  // Each kind navigates the app the same way the user would by hand.

  function _onComposition(id) {
    if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', id);
  }

  function _onRaga(id) {
    if (typeof triggerBaniSearch === 'function') triggerBaniSearch('raga', id);
  }

  function _orientToMusician(nodeId) {
    if (!nodeId) return;
    const n = (typeof cy !== 'undefined') ? cy.getElementById(nodeId) : null;
    if (!n || !n.length) return;
    if (typeof orientToNode === 'function' &&
        typeof currentView !== 'undefined' && currentView === 'graph') {
      orientToNode(nodeId);
    } else if (typeof selectNode === 'function') {
      selectNode(n);
    }
    if (typeof window.setPanelState === 'function') {
      setTimeout(() => window.setPanelState('MUSICIAN'), 50);
    }
  }

  function _onMusician(id) {
    _orientToMusician(id);
  }

  function _onComposer(composerId) {
    // composers global is injected by html_generator
    const composer = (typeof composers !== 'undefined')
      ? composers.find(c => c.id === composerId)
      : null;
    if (composer && composer.musician_node_id) {
      _orientToMusician(composer.musician_node_id);
    }
  }

  // recording_ref: {musician_id, concert_hint, raga_id} → resolve to a single
  // performance and open it via triggerBaniSearch('perf', key).
  function _onRecordingRef(item) {
    const refs = (typeof musicianToPerformances !== 'undefined')
      ? (musicianToPerformances[item.musician_id] || [])
      : [];
    const hint = (item.concert_hint || '').toLowerCase();
    const match = refs.find(p =>
      p.raga_id === item.raga_id &&
      hint && (
        (p.recording_id || '').toLowerCase().indexOf(hint) >= 0 ||
        (p.title || '').toLowerCase().indexOf(hint) >= 0
      )
    );
    if (match) {
      const key = match.recording_id + '::' + match.performance_index;
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('perf', key);
    } else {
      // Soft fallback: open the musician panel so the user can find it manually
      _orientToMusician(item.musician_id);
    }
  }

  // lecdem_ref: open the musician panel for the named musician — the lecdem
  // strip (ADR-080/ADR-081) takes over from there.
  function _onLecdemRef(item) {
    _orientToMusician(item.musician_id);
  }

  function _itemChip(item) {
    const kind = item.kind;
    let chip;
    if (kind === 'composition') {
      chip = _el('span', 'comp-chip', item.label);
      chip.addEventListener('click', () => _onComposition(item.id));
    } else if (kind === 'raga') {
      chip = _el('span', 'raga-chip', item.label);
      chip.addEventListener('click', () => _onRaga(item.id));
    } else if (kind === 'musician') {
      chip = _el('span', 'musician-chip', item.label);
      chip.addEventListener('click', () => _onMusician(item.id));
    } else if (kind === 'composer') {
      chip = _el('span', 'composer-chip', item.label);
      chip.addEventListener('click', () => _onComposer(item.id));
    } else if (kind === 'recording_ref') {
      chip = _el('span', 'pt-chip pt-chip-recording', '\u25b6 ' + item.label);
      chip.addEventListener('click', () => _onRecordingRef(item));
    } else if (kind === 'lecdem_ref') {
      chip = _el('span', 'pt-chip pt-chip-lecdem', '\u270e ' + item.label);
      chip.addEventListener('click', () => _onLecdemRef(item));
    } else {
      chip = _el('span', 'pt-chip', item.label || kind);
    }
    chip.style.cursor = 'pointer';
    return chip;
  }

  function _groupNode(group) {
    const wrap = _el('div', 'pt-group');
    if (group.subject_label) {
      wrap.appendChild(_el('div', 'pt-group-title', group.subject_label));
    }
    if (group.blurb) {
      wrap.appendChild(_el('div', 'pt-group-blurb', group.blurb));
    }
    const items = group.items || [];
    if (items.length) {
      const chips = _el('div', 'pt-chips');
      items.forEach(it => chips.appendChild(_itemChip(it)));
      wrap.appendChild(chips);
    } else if (group.subject_kind && group.subject_id) {
      // Group without items — make the title itself the click target
      const chips = _el('div', 'pt-chips');
      chips.appendChild(_itemChip({
        kind:  group.subject_kind === 'composer' ? 'composer'
             : group.subject_kind === 'raga'     ? 'raga'
             : group.subject_kind === 'composition' ? 'composition'
             : 'musician',
        id:    group.subject_id,
        label: 'Open ' + (group.subject_label || group.subject_id),
      }));
      wrap.appendChild(chips);
    }
    return wrap;
  }

  function _renderInto(container, block) {
    container.innerHTML = '';
    container.appendChild(_el('div', 'pt-label', 'How to use this panel'));
    if (block.headline) {
      container.appendChild(_el('p', 'pt-headline', block.headline));
    }
    const mechanics = block.mechanics || [];
    if (mechanics.length) {
      const ul = _el('ul', 'pt-mechanics');
      mechanics.forEach(line => ul.appendChild(_el('li', null, line)));
      container.appendChild(ul);
    }
    const tt = block.try_these || null;
    if (tt && (tt.groups || []).length) {
      const tryWrap = _el('div', 'pt-try');
      if (tt.label) tryWrap.appendChild(_el('div', 'pt-try-label', tt.label));
      tt.groups.forEach(g => tryWrap.appendChild(_groupNode(g)));
      container.appendChild(tryWrap);
    }
  }

  function _ensureRendered(slot) {
    const id = SLOT_TO_CONTAINER_ID[slot];
    const container = id ? document.getElementById(id) : null;
    if (!container) return null;
    if (container.dataset.rendered === '1') return container;
    const block = _block(slot);
    if (!block) return container;  // leave empty; show/hide becomes a no-op
    _renderInto(container, block);
    container.dataset.rendered = '1';
    return container;
  }

  window.showPanelTutorial = function (slot) {
    const container = _ensureRendered(slot);
    if (!container) return;
    const block = _block(slot);
    if (!block) return;
    container.style.display = 'block';
  };

  window.hidePanelTutorial = function (slot) {
    const id = SLOT_TO_CONTAINER_ID[slot];
    const container = id ? document.getElementById(id) : null;
    if (container) container.style.display = 'none';
  };

  // ── Initial paint: both panels are empty on first load ───────────────────
  document.addEventListener('DOMContentLoaded', () => {
    if (!helpEmptyPanels) return;
    window.showPanelTutorial('bani');
    window.showPanelTutorial('musician');
  });
})();
