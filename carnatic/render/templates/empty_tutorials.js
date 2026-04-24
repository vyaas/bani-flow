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

  // ── Chip factories (ADR-087) ─────────────────────────────────────────────

  // _catalogueChip: creates a clickable chip for the catalogue section.
  // Never called for action items (example_kind === 'action' / example_id null).
  function _catalogueChip(entry) {
    const cls  = entry.css_class;
    const lbl  = entry.example_label;
    const kind = entry.example_kind;
    const id   = entry.example_id;
    const chip = _el('span', cls, lbl);
    chip.style.cursor = 'pointer';
    if (kind === 'raga') {
      chip.addEventListener('click', () => _onRaga(id));
    } else if (kind === 'composition') {
      chip.addEventListener('click', () => _onComposition(id));
    } else if (kind === 'musician') {
      chip.addEventListener('click', () => _onMusician(id));
    } else if (kind === 'lecdem_by' || kind === 'lecdem_about') {
      chip.addEventListener('click', () => _onMusician(id));
    }
    return chip;
  }

  // _seedChip: creates a clickable chip for the cross-panel seeds section.
  function _seedChip(item) {
    const kind = item.kind;
    let cls, onClick;
    if (kind === 'raga') {
      cls     = 'raga-chip';
      onClick = () => _onRaga(item.id);
    } else if (kind === 'composition') {
      cls     = 'comp-chip';
      onClick = () => _onComposition(item.id);
    } else if (kind === 'musician') {
      cls     = 'musician-chip';
      onClick = () => _onMusician(item.id);
    } else {
      cls     = 'pt-chip';
      onClick = null;
    }
    const chip = _el('span', cls, item.label || kind);
    chip.style.cursor = 'pointer';
    if (onClick) chip.addEventListener('click', onClick);
    return chip;
  }

  function _renderInto(container, block) {
    container.innerHTML = '';

    const schemaVersion = (typeof helpEmptyPanels !== 'undefined' && helpEmptyPanels)
      ? (helpEmptyPanels.schema_version || 1)
      : 1;
    if (schemaVersion > 2) {
      container.appendChild(_el('p', 'pt-upgrade',
        'Tutorial data schema (' + schemaVersion + ') is newer than this render. Please update.'));
      return;
    }

    container.appendChild(_el('div', 'pt-label', 'How to use this panel'));

    // ── Section A: chip catalogue ─────────────────────────────────────────
    const catalogue = block.chip_catalogue || [];
    if (catalogue.length) {
      container.appendChild(_el('div', 'pt-catalogue-heading', 'Every chip type in this panel'));
      const catList = _el('div', 'pt-catalogue');
      catalogue.forEach(function (entry) {
        const row = _el('div', 'pt-cat-row');
        if (entry.example_kind === 'action' || !entry.example_id) {
          // Non-clickable action label (▶, ↗)
          row.appendChild(_el('span', 'pt-action-label', entry.example_label));
        } else {
          row.appendChild(_catalogueChip(entry));
        }
        // Effect statement — view-sensitive or single
        if (entry.effect_graph && entry.effect_raga) {
          const eff = _el('span', 'pt-effect');
          eff.appendChild(_el('span', 'pt-effect-line', '\u2299 Graph: ' + entry.effect_graph));
          eff.appendChild(_el('span', 'pt-effect-line', '\u25ce Ragas: ' + entry.effect_raga));
          row.appendChild(eff);
        } else {
          row.appendChild(_el('span', 'pt-effect', entry.effect || ''));
        }
        catList.appendChild(row);
      });
      container.appendChild(catList);
    }

    // ── Divider ───────────────────────────────────────────────────────────
    const hr = document.createElement('hr');
    hr.className = 'pt-divider';
    container.appendChild(hr);

    // ── Section B: cross-panel seeds ──────────────────────────────────────
    const seeds = block.cross_panel_seeds || {};
    const seedItems = seeds.items || [];
    if (seedItems.length) {
      const cross = _el('div', 'pt-cross-seeds');
      if (seeds.prompt) cross.appendChild(_el('div', 'pt-cross-prompt', seeds.prompt));
      const chips = _el('div', 'pt-chips');
      seedItems.forEach(function (item) { chips.appendChild(_seedChip(item)); });
      cross.appendChild(chips);
      container.appendChild(cross);
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
