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

  function _previewWheel(type, id) {
    window._wheelPreviewNoPanel = true;
    if (typeof switchView === 'function' &&
        typeof currentView !== 'undefined' &&
        currentView !== 'raga') {
      switchView('raga');
    }
    setTimeout(function () {
      if (typeof syncRagaWheelToFilter === 'function') {
        syncRagaWheelToFilter(type, id);
      }
      setTimeout(function () {
        window._wheelPreviewNoPanel = false;
      }, 700);
    }, 70);
  }

  function _onComposition(id, opts) {
    if (opts && opts.previewOnly) {
      _previewWheel('comp', id);
      return;
    }
    if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', id);
  }

  function _onRaga(id, opts) {
    if (opts && opts.previewOnly) {
      _previewWheel('raga', id);
      return;
    }
    if (typeof triggerBaniSearch === 'function') triggerBaniSearch('raga', id);
  }

  function _orientToMusician(nodeId) {
    if (!nodeId) return;
    if (typeof switchView === 'function' &&
        typeof currentView !== 'undefined' &&
        currentView !== 'graph') {
      switchView('graph');
    }
    const n = (typeof cy !== 'undefined') ? cy.getElementById(nodeId) : null;
    if (!n || !n.length) return;
    setTimeout(function () {
      if (typeof orientToNode === 'function' &&
          typeof currentView !== 'undefined' && currentView === 'graph') {
        orientToNode(nodeId);
      } else if (typeof selectNode === 'function') {
        selectNode(n);
      }
      if (typeof window.setPanelState === 'function') {
        window.setPanelState('MUSICIAN');
      }
    }, 70);
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

  function _normalizeEffectText(text) {
    if (!text) return '';
    return String(text).replace(/^\s*(?:\u2192|->|\u00b7|\u2022)\s*/u, '').trim();
  }

  function _nonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
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
  function _catalogueChip(entry, opts) {
    const cls  = entry.css_class;
    const lbl  = entry.example_label;
    const kind = entry.example_kind;
    const id   = entry.example_id;
    const chip = _el('span', cls, lbl);
    chip.style.cursor = 'pointer';
    if (kind === 'raga') {
      chip.addEventListener('click', () => _onRaga(id, opts));
    } else if (kind === 'composition') {
      chip.addEventListener('click', () => _onComposition(id, opts));
    } else if (kind === 'musician') {
      chip.addEventListener('click', () => _onMusician(id));
    } else if (kind === 'lecdem_by' || kind === 'lecdem_about') {
      chip.addEventListener('click', () => _onMusician(id));
    }
    return chip;
  }

  function _lookupComposerNodeId(composerId) {
    if (!composerId) return null;
    if (typeof cy !== 'undefined') {
      const node = cy.getElementById(composerId);
      if (node && node.length) return composerId;
    }
    const composer = (typeof composers !== 'undefined')
      ? composers.find(c => c.id === composerId)
      : null;
    if (!composer || !composer.musician_node_id) return null;
    if (typeof cy !== 'undefined') {
      const cNode = cy.getElementById(composer.musician_node_id);
      if (!cNode || !cNode.length) return null;
    }
    return composer.musician_node_id;
  }

  function _chipLikeLabel(cls, text) {
    const el = _el('span', cls + ' pt-demo-static', text);
    el.style.cursor = 'default';
    return el;
  }

  function _renderDemoRow(slot, entry) {
    const demo = entry.demo_row || {};
    const type = demo.type;

    if (type === 'action_row') {
      const block = _el('div', 'pt-demo-block');
      const playLine = _el('div', 'pt-action-line');
      const playBtn = _el('button', 'tree-play-btn rec-play-btn play-btn-concert', '\u25b6');
      playBtn.type = 'button';
      playBtn.title = 'Play';
      playBtn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        if (typeof openPlayer === 'function' && demo.video_id) {
          openPlayer(demo.video_id, demo.play_label || 'Tutorial sample');
        }
      });
      playLine.appendChild(playBtn);
      playLine.appendChild(_el('span', 'pt-action-note', demo.play_note || 'play in the floating player'));
      block.appendChild(playLine);

      const linkLine = _el('div', 'pt-action-line');
      const ext = _el('a', 'tree-ext-link yt-ext-link', '\u2197');
      ext.href = demo.youtube_url || '#';
      ext.title = 'Open source';
      ext.addEventListener('click', function (evt) {
        evt.stopPropagation();
        if (!demo.youtube_url) evt.preventDefault();
      });
      linkLine.appendChild(ext);
      linkLine.appendChild(_el('span', 'pt-action-note', demo.link_note || 'open source in a new tab'));
      block.appendChild(linkLine);
      return block;
    }

    if (type === 'lecdem_row') {
      const block = _el('div', 'pt-demo-block');
      const row = _el('div', 'pt-demo-row pt-demo-row-lecdem');
      row.appendChild(_chipLikeLabel('lecdem-chip', demo.chip_label || '\u270e Lec-Dem'));

      const acts = _el('div', 'trail-acts pt-demo-acts');
      const playBtn = _el('button', 'tree-play-btn rec-play-btn play-btn-concert', '\u25b6');
      playBtn.type = 'button';
      playBtn.title = 'Play';
      playBtn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        if (typeof openPlayer === 'function' && demo.video_id) {
          openPlayer(demo.video_id, demo.play_label || demo.chip_label || 'Lecture-Demo');
        }
      });
      acts.appendChild(playBtn);

      const ext = _el('a', 'tree-ext-link yt-ext-link', '\u2197');
      ext.href = demo.youtube_url || '#';
      ext.title = 'Open source';
      ext.addEventListener('click', function (evt) {
        evt.stopPropagation();
        if (!demo.youtube_url) evt.preventDefault();
      });
      acts.appendChild(ext);
      row.appendChild(acts);

      block.appendChild(row);

      // Optional performer chips (same era-tint pattern as recording_row)
      const lecdPerformers = Array.isArray(demo.performers) ? demo.performers : [];
      if (lecdPerformers.length) {
        const pfRow = _el('div', 'pt-demo-tags pt-rec-performers');
        lecdPerformers.forEach(function (pf) {
          const nodes = (typeof graphData !== 'undefined' && graphData.nodes) || [];
          const node = nodes.find(function (n) { return n.id === pf.id; });
          const eraId = node ? (node.era || null) : null;
          const tint = (typeof THEME !== 'undefined') ? THEME.eraTintCss(eraId) : { bg: 'transparent', border: '#888' };
          const chip = document.createElement('span');
          chip.className = 'musician-chip chip-secondary';
          chip.style.setProperty('--chip-era-bg', tint.bg);
          chip.style.setProperty('--chip-era-border', tint.border);
          chip.textContent = pf.label || pf.id;
          chip.title = pf.label || pf.id;
          if (pf.id) {
            chip.style.cursor = 'pointer';
            chip.addEventListener('click', function (evt) {
              evt.stopPropagation();
              _onMusician(pf.id);
            });
          }
          pfRow.appendChild(chip);
        });
        block.appendChild(pfRow);
      }

      const tags = Array.isArray(demo.raga_tags) ? demo.raga_tags : [];
      if (tags.length) {
        const tagRow = _el('div', 'pt-demo-tags');
        tags.forEach(function (tag) {
          tagRow.appendChild(_catalogueChip({
            css_class: 'raga-chip',
            example_kind: 'raga',
            example_id: tag.id,
            example_label: tag.label || tag.id,
          }, { previewOnly: true }));
        });
        block.appendChild(tagRow);
      }

      return block;
    }

    if (type === 'recording_row') {
      // Full concert recording row: chip + era-tinted performer chips + ▶/↗
      const block = _el('div', 'pt-demo-block');
      const headerRow = _el('div', 'pt-demo-row pt-demo-row-lecdem');

      // Concert header chip (short title)
      headerRow.appendChild(_chipLikeLabel('lecdem-chip', demo.chip_label || '\u266a Recording'));

      // ▶ / ↗ buttons
      const acts = _el('div', 'trail-acts pt-demo-acts');
      const playBtn = _el('button', 'tree-play-btn rec-play-btn play-btn-concert', '\u25b6');
      playBtn.type = 'button';
      playBtn.title = 'Open concert with full track list';
      playBtn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        if (typeof openOrFocusPlayer !== 'function') return;
        // Assemble full track list from graphData.recordings
        const recordingId = demo.recording_id;
        const recordings = (typeof graphData !== 'undefined' && graphData.recordings) || [];
        const rec = recordings.find(function (r) { return r.id === recordingId; });
        if (!rec) { return; }
        const ragas_ = (typeof ragas !== 'undefined') ? ragas : [];
        const allTracks = [];
        (rec.sessions || []).forEach(function (sess) {
          (sess.performances || []).forEach(function (p) {
            const ragaObj = p.raga_id ? ragas_.find(function (r) { return r.id === p.raga_id; }) : null;
            allTracks.push({
              offset_seconds: p.offset_seconds || 0,
              display_title:  p.display_title || '',
              raga_id:        p.raga_id || null,
              raga_name:      ragaObj ? ragaObj.name : (p.raga_id || ''),
              tala:           p.tala || null,
              timestamp:      p.timestamp || '00:00',
              composition_id: p.composition_id || null,
            });
          });
        });
        allTracks.sort(function (a, b) { return (a.offset_seconds || 0) - (b.offset_seconds || 0); });
        openOrFocusPlayer(
          demo.video_id,
          demo.play_label || rec.title || demo.chip_label || 'Concert',
          demo.artist_label || '',
          0,
          rec.short_title || rec.title || '',
          allTracks.length ? allTracks : null,
          {}
        );
      });
      acts.appendChild(playBtn);

      const videoHost = demo.video_id ? 'https://www.youtube.com/watch?v=' + demo.video_id : '#';
      const ext = _el('a', 'tree-ext-link yt-ext-link', '\u2197');
      ext.href = demo.youtube_url || videoHost;
      ext.title = 'Open on YouTube';
      ext.addEventListener('click', function (evt) { evt.stopPropagation(); });
      acts.appendChild(ext);
      headerRow.appendChild(acts);
      block.appendChild(headerRow);

      // Era-tinted performer chips
      const performers = Array.isArray(demo.performers) ? demo.performers : [];
      if (performers.length) {
        const pfRow = _el('div', 'pt-demo-tags pt-rec-performers');
        performers.forEach(function (pf) {
          const nodes = (typeof graphData !== 'undefined' && graphData.nodes) || [];
          const node = nodes.find(function (n) { return n.id === pf.id; });
          const eraId = node ? (node.era || null) : null;
          const tint = (typeof THEME !== 'undefined') ? THEME.eraTintCss(eraId) : { bg: 'transparent', border: '#888' };
          const chip = document.createElement('span');
          chip.className = 'musician-chip chip-secondary';
          chip.style.setProperty('--chip-era-bg', tint.bg);
          chip.style.setProperty('--chip-era-border', tint.border);
          chip.textContent = pf.label || pf.id;
          chip.title = pf.label || pf.id;
          if (pf.id) {
            chip.style.cursor = 'pointer';
            chip.addEventListener('click', function (evt) {
              evt.stopPropagation();
              _onMusician(pf.id);
            });
          }
          pfRow.appendChild(chip);
        });
        block.appendChild(pfRow);
      }

      return block;
    }

    if (type === 'composition_row') {
      const row = _el('div', 'pt-demo-row pt-demo-row-composition');
      const previewOnly = slot === 'bani';
      row.appendChild(slot === 'musician'
        ? _catalogueChip({
            css_class: 'comp-chip',
            example_kind: 'composition',
            example_id: demo.comp_id,
            example_label: demo.comp_label || demo.comp_id,
          })
        : _catalogueChip({
            css_class: 'comp-chip',
            example_kind: 'composition',
            example_id: demo.comp_id,
            example_label: demo.comp_label || demo.comp_id,
          }, { previewOnly: previewOnly }));

      row.appendChild(slot === 'musician'
        ? _catalogueChip({
            css_class: 'raga-chip',
            example_kind: 'raga',
            example_id: demo.raga_id,
            example_label: demo.raga_label || demo.raga_id,
          })
        : _catalogueChip({
            css_class: 'raga-chip',
            example_kind: 'raga',
            example_id: demo.raga_id,
            example_label: demo.raga_label || demo.raga_id,
          }, { previewOnly: previewOnly }));

      if (demo.tala) {
        row.appendChild(_el('span', 'trail-tala pt-demo-tala', demo.tala));
      }

      if (demo.composer_label) {
        if (slot === 'bani') {
          const nodeId = _lookupComposerNodeId(demo.composer_id);
          if (nodeId) {
            row.appendChild(_catalogueChip({
              css_class: 'musician-chip',
              example_kind: 'musician',
              example_id: nodeId,
              example_label: demo.composer_label,
            }));
          } else {
            row.appendChild(_el('span', 'pt-demo-label', demo.composer_label));
          }
        } else {
          row.appendChild(_el('span', 'pt-demo-label', demo.composer_label));
        }
      }

      return row;
    }

    return _el('span', 'pt-demo-label', 'Invalid demo row');
  }

  // _seedChip: creates a clickable chip for the cross-panel seeds section.
  function _seedChip(item) {
    const kind = item.kind;
    let cls, onClick;
    if (kind === 'raga') {
      cls     = 'raga-chip';
      onClick = () => _onRaga(item.id, item.preview_only ? { previewOnly: true } : null);
    } else if (kind === 'composition') {
      cls     = 'comp-chip';
      onClick = () => _onComposition(item.id, item.preview_only ? { previewOnly: true } : null);
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

  function _renderInto(container, block, slot) {
    container.innerHTML = '';

    const schemaVersion = (typeof helpEmptyPanels !== 'undefined' && helpEmptyPanels)
      ? (helpEmptyPanels.schema_version || 1)
      : 1;
    if (schemaVersion > 3) {
      container.appendChild(_el('p', 'pt-upgrade',
        'Tutorial data schema (' + schemaVersion + ') is newer than this render. Please update.'));
      return;
    }

    container.appendChild(_el('div', 'pt-label', 'How to use this panel'));
    container.appendChild(_el('p', 'pt-panel-intro',
      'Tap any chip below to try it — each one navigates to a subject in this panel or ' +
      'its neighbour. To return to this guide at any time, tap ? in this panel’s header.'));

    // ── Section A: view discovery (ADR-091) ───────────────────────────────
    const viewSection = block.view_section || {};
    const hasViewSection = _nonEmptyString(viewSection.label) ||
      _nonEmptyString(viewSection.graph_note) ||
      _nonEmptyString(viewSection.raga_note);
    if (hasViewSection) {
      const section = _el('div', 'pt-view-section');
      if (viewSection.label) {
        section.appendChild(_el('div', 'pt-view-label', viewSection.label));
      }

      const switcher = _el('div', 'view-selector pt-view-switch');
      const graphBtn = _el('button', 'view-btn', 'Guru-Shishya');
      graphBtn.type = 'button';
      graphBtn.dataset.view = 'graph';
      graphBtn.addEventListener('click', function () {
        if (typeof switchView === 'function') switchView('graph');
      });

      const ragaBtn = _el('button', 'view-btn', 'Mela-Janya');
      ragaBtn.type = 'button';
      ragaBtn.dataset.view = 'raga';
      ragaBtn.addEventListener('click', function () {
        if (typeof switchView === 'function') switchView('raga');
      });

      const activeView = (typeof currentView !== 'undefined' && currentView === 'graph')
        ? 'graph'
        : 'raga';
      graphBtn.classList.toggle('active', activeView === 'graph');
      ragaBtn.classList.toggle('active', activeView === 'raga');

      switcher.appendChild(graphBtn);
      switcher.appendChild(ragaBtn);
      section.appendChild(switcher);

      if (viewSection.graph_note) {
        section.appendChild(_el('p', 'pt-view-note', viewSection.graph_note));
      }
      if (viewSection.raga_note) {
        section.appendChild(_el('p', 'pt-view-note', viewSection.raga_note));
      }
      container.appendChild(section);

      const hr0 = document.createElement('hr');
      hr0.className = 'pt-divider';
      container.appendChild(hr0);
    }

    // ── Section B: chip catalogue ─────────────────────────────────────────
    const catalogue = (block.chip_catalogue || []).slice();
    if (catalogue.length) {
      container.appendChild(_el('div', 'pt-catalogue-heading', 'The chip types in this panel — tap one to try it'));
      const catList = _el('div', 'pt-catalogue');
      const orderedCatalogue = catalogue.sort(function (a, b) {
        const aIsLecdem = (
          a.example_kind === 'lecdem_by' ||
          a.example_kind === 'lecdem_about' ||
          (a.example_kind === 'demo_row' && a.demo_row && a.demo_row.type === 'lecdem_row')
        );
        const bIsLecdem = (
          b.example_kind === 'lecdem_by' ||
          b.example_kind === 'lecdem_about' ||
          (b.example_kind === 'demo_row' && b.demo_row && b.demo_row.type === 'lecdem_row')
        );
        if (aIsLecdem === bIsLecdem) return 0;
        return aIsLecdem ? -1 : 1;
      });

      orderedCatalogue.forEach(function (entry) {
        const row = _el('div', 'pt-cat-row');
        if (entry.example_kind === 'demo_row' && entry.demo_row) {
          row.appendChild(_renderDemoRow(slot, entry));
        } else if (entry.example_kind === 'note') {
          // Inline explanatory note — no chip, just text
          row.appendChild(_el('div', 'pt-cat-note', entry.note_text || ''));
        } else if (entry.example_kind === 'action' || !entry.example_id) {
          // Non-clickable action label (▶, ↗)
          row.appendChild(_el('span', 'pt-action-label', entry.example_label));
        } else {
          row.appendChild(_catalogueChip(
            entry,
            (slot === 'bani' && (entry.example_kind === 'raga' || entry.example_kind === 'composition'))
              ? { previewOnly: true }
              : null
          ));
        }
        // Effect statement — view-sensitive or single
        if (entry.effect_graph && entry.effect_raga) {
          const eff = _el('span', 'pt-effect');
          const graphLine = _el('span', 'pt-effect-line');
          graphLine.appendChild(_el('span', 'pt-nowrap', '(Guru-Shishya)'));
          graphLine.appendChild(document.createTextNode(' \u00b7 ' + _normalizeEffectText(entry.effect_graph)));
          eff.appendChild(graphLine);

          const ragaLine = _el('span', 'pt-effect-line');
          ragaLine.appendChild(_el('span', 'pt-nowrap', '(Mela-Janya)'));
          ragaLine.appendChild(document.createTextNode(' \u00b7 ' + _normalizeEffectText(entry.effect_raga)));
          eff.appendChild(ragaLine);
          row.appendChild(eff);
        } else {
          const text = _normalizeEffectText(entry.effect || '');
          if (text) {
            row.appendChild(_el('span', 'pt-effect', '\u00b7 ' + text));
          }
        }
        catList.appendChild(row);
      });
      container.appendChild(catList);
    }

    // ── Divider ───────────────────────────────────────────────────────────
    const hr = document.createElement('hr');
    hr.className = 'pt-divider';
    container.appendChild(hr);

    // ── Section C: cross-panel seeds ──────────────────────────────────────
    const seeds = block.cross_panel_seeds || {};
    const seedItems = seeds.items || [];
    const hasSeeds = seedItems.length ||
      _nonEmptyString(seeds.prompt) ||
      _nonEmptyString(seeds.intro_note) ||
      _nonEmptyString(seeds.search_note) ||
      _nonEmptyString(seeds.closing_note);
    if (hasSeeds) {
      const cross = _el('div', 'pt-cross-seeds');
      if (seeds.intro_note) cross.appendChild(_el('p', 'pt-intro-note', seeds.intro_note));
      if (seeds.prompt) cross.appendChild(_el('div', 'pt-cross-prompt', seeds.prompt));
      if (seedItems.length) {
        const chips = _el('div', 'pt-chips');
        seedItems.forEach(function (item) {
          const wrap = _el('div', 'pt-seed-item');
          wrap.appendChild(_seedChip(item));
          if (item.note) {
            wrap.appendChild(_el('div', 'pt-seed-note', '(' + item.note + ')'));
          }
          chips.appendChild(wrap);
        });
        cross.appendChild(chips);
      }
      if (seeds.search_note) cross.appendChild(_el('p', 'pt-search-note', seeds.search_note));
      if (seeds.closing_note) cross.appendChild(_el('p', 'pt-closing-note', seeds.closing_note));
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
    _renderInto(container, block, slot);
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

  // ── Help-toggle (non-destructive overlay) ────────────────────────────────
  // Click the `?` button on a panel header → fills the panel with the help
  // deck without disturbing the existing panel state. Click again → restores
  // the panel exactly as it was. Lets users peek at help and return to flow.
  // Help fills only the scrollable area — the sticky zone above (subject
  // header, search input, trail/recordings filter) stays visible so users
  // keep their bearings while peeking at help.
  const SLOT_TO_CONTAINERS = {
    bani:     ['bani-scroll'],
    musician: ['right-scroll'],
  };
  const SLOT_TO_BTN_ID = {
    bani:     'bani-reset-btn',
    musician: 'musician-reset-btn',
  };
  const _helpState = { bani: null, musician: null };

  function _exitHelp(slot) {
    const state = _helpState[slot];
    if (!state) return;
    state.hidden.forEach(function (entry) {
      entry.el.style.display = entry.prevDisplay;
    });
    window.hidePanelTutorial(slot);
    _helpState[slot] = null;
    const btn = document.getElementById(SLOT_TO_BTN_ID[slot]);
    if (btn) btn.classList.remove('panel-help-active');
  }

  function _enterHelp(slot) {
    const tutorialId = SLOT_TO_CONTAINER_ID[slot];
    const containers = SLOT_TO_CONTAINERS[slot] || [];
    const hidden = [];
    containers.forEach(function (cid) {
      const root = document.getElementById(cid);
      if (!root) return;
      Array.prototype.forEach.call(root.children, function (el) {
        if (el.tagName === 'H3') return;          // keep the panel header
        if (el.id === tutorialId) return;         // never hide the deck itself
        const cs = window.getComputedStyle(el).display;
        if (cs === 'none') return;                // already hidden — leave alone
        hidden.push({ el: el, prevDisplay: el.style.display || '' });
        el.style.display = 'none';
      });
    });
    _helpState[slot] = { hidden: hidden };
    window.showPanelTutorial(slot);
    const btn = document.getElementById(SLOT_TO_BTN_ID[slot]);
    if (btn) btn.classList.add('panel-help-active');
  }

  window.togglePanelHelp = function (slot) {
    if (!SLOT_TO_CONTAINERS[slot]) return;
    if (_helpState[slot]) _exitHelp(slot);
    else                  _enterHelp(slot);
  };

  // Clean up help overlay before any code populates the panel with new
  // content (e.g. selectNode, applyBaniFilter). Called by callers that
  // already know they're about to write into the panel.
  window.dismissPanelHelp = function (slot) {
    if (_helpState[slot]) _exitHelp(slot);
  };

  // ── Initial paint: both panels are empty on first load ───────────────────
  document.addEventListener('DOMContentLoaded', () => {
    if (!helpEmptyPanels) return;
    window.showPanelTutorial('bani');
    window.showPanelTutorial('musician');
  });
})();
