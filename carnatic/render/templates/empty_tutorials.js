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

  // ── Era-tint helper: applies --chip-era-bg / --chip-era-border by musician id ──
  // Looks up the musician in graphData.nodes, derives era, calls THEME.eraTintCss.
  function _applyEraTint(chip, musicianId) {
    const nodes = (typeof graphData !== 'undefined' && graphData.nodes) || [];
    const node  = nodes.find(function (n) { return n.id === musicianId; });
    const eraId = node ? (node.era || null) : null;
    const tint  = (typeof THEME !== 'undefined')
      ? THEME.eraTintCss(eraId)
      : { bg: 'transparent', border: 'var(--border-strong)' };
    chip.style.setProperty('--chip-era-bg',     tint.bg);
    chip.style.setProperty('--chip-era-border', tint.border);
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
    // Help-panel chips are non-interactive — clicking does nothing.
  }

  function _onRaga(id, opts) {
    // Help-panel chips are non-interactive — clicking does nothing.
  }

  function _orientToMusician(nodeId) {
    if (!nodeId) return;
    if (typeof switchView === 'function' &&
        typeof currentView !== 'undefined' &&
        currentView !== 'graph') {
      switchView('graph');
    }
    // Poll for the graph view to become active before orienting — switchView is
    // async and Cytoscape needs a beat to lay out before fit() can centre the
    // node. Without this, clicks during a view transition fall through to a
    // bare selectNode() which updates the panel but leaves the viewport stuck
    // wherever it was, parking the chosen node in a corner.
    var attempts = 0;
    (function tick() {
      const ready = (typeof currentView !== 'undefined' && currentView === 'graph') ||
                    attempts >= 12;
      attempts += 1;
      if (!ready) { setTimeout(tick, 50); return; }
      const n = (typeof cy !== 'undefined') ? cy.getElementById(nodeId) : null;
      if (!n || !n.length) return;
      if (typeof orientToNode === 'function' &&
          typeof currentView !== 'undefined' && currentView === 'graph') {
        orientToNode(nodeId);
      } else {
        if (typeof selectNode === 'function') selectNode(n);
        // Belt and braces: even if orientToNode wasn't reached, force a
        // centred fit so the node is unmistakably in the middle.
        if (typeof cy !== 'undefined' && cy.animate) {
          try {
            cy.animate({ fit: { eles: n.closedNeighborhood(), padding: 80 }, duration: 350 });
          } catch (_) {}
        }
      }
      if (typeof window.setPanelState === 'function') {
        window.setPanelState('MUSICIAN');
      }
    })();
  }

  function _onMusician(id) {
    // Help-panel chips are non-interactive — clicking does nothing.
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
      if (id) _applyEraTint(chip, id);
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
    return _el('span', cls, text);
  }

  // _renderEffectParts: builds an inline pt-effect span from a structured parts array.
  // Each part is one of:
  //   {type:'text',        text:'...'}
  //   {type:'musician_play', artist_id, artist_label, chip_class, video_id, play_label}
  //   {type:'raga_chip',   raga_id, raga_label}
  function _renderEffectParts(parts) {
    const span = _el('span', 'pt-effect pt-effect--inline');
    span.appendChild(document.createTextNode('\u00b7 '));
    (parts || []).forEach(function (part) {
      if (part.type === 'text') {
        span.appendChild(document.createTextNode(part.text));
      } else if (part.type === 'musician_play') {
        const chip = _el('span', part.chip_class || 'musician-chip', part.artist_label || '');
        if (part.artist_id) {
          chip.style.cursor = 'pointer';
          _applyEraTint(chip, part.artist_id);
          chip.addEventListener('click', function (evt) {
            evt.stopPropagation();
            _onMusician(part.artist_id);
          });
        }
        span.appendChild(chip);
        if (part.video_id) {
          const btn = _el('button', 'tree-play-btn rec-play-btn play-btn-concert', '\u25b6');
          btn.type  = 'button';
          btn.title = 'Play';
          btn.addEventListener('click', function (evt) {
            evt.stopPropagation();
            if (typeof openPlayer === 'function') {
              openPlayer(part.video_id, part.play_label || part.artist_label || '');
            }
          });
          span.appendChild(btn);
        }
      } else if (part.type === 'raga_chip') {
        const chip = _el('span', 'raga-chip', part.raga_label || part.raga_id || '');
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', function (evt) {
          evt.stopPropagation();
          _onRaga(part.raga_id, {});
        });
        span.appendChild(chip);
      }
    });
    return span;
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
      const ext = _el('a', 'tree-ext-link yt-ext-link');
      ext.innerHTML = '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M14 3v2h3.59l-9.3 9.29 1.42 1.42L19 6.41V10h2V3z\"/><path d=\"M19 19H5V5h7V3H3v18h18v-9h-2z\"/></svg>';
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
      row.appendChild(_chipLikeLabel('lecdem-label-chip', demo.chip_label || '\u270e Lec-Dem'));

      const acts = _el('div', 'trail-acts pt-demo-acts');
      const playBtn = _el('button', 'tree-play-btn rec-play-btn play-btn-concert', '\u25b6');
      playBtn.type = 'button';
      playBtn.title = 'Play';
      playBtn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        if (typeof openOrFocusPlayer !== 'function' || !demo.video_id) return;
        const _perfs = Array.isArray(demo.performers) ? demo.performers : [];
        const _first = _perfs[0] || null;
        const _artistName = _first ? (_first.label || '') : '';
        const _nodeId = _first ? (_first.id || null) : null;
        openOrFocusPlayer(
          demo.video_id,
          demo.play_label || demo.chip_label || 'Lecture-Demo',
          _artistName,
          undefined,
          undefined,
          [],
          _nodeId ? { nodeId: _nodeId } : {}
        );
      });
      acts.appendChild(playBtn);

      const ext = _el('a', 'tree-ext-link yt-ext-link');
      ext.innerHTML = '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M14 3v2h3.59l-9.3 9.29 1.42 1.42L19 6.41V10h2V3z\"/><path d=\"M19 19H5V5h7V3H3v18h18v-9h-2z\"/></svg>';
      ext.href = demo.youtube_url || '#';
      ext.title = 'Open source';
      ext.addEventListener('click', function (evt) {
        evt.stopPropagation();
        if (!demo.youtube_url) evt.preventDefault();
      });
      acts.appendChild(ext);
      row.appendChild(acts);

      block.appendChild(row);

      // Performer chips (clickable musician chips)
      const lecdPerformers = Array.isArray(demo.performers) ? demo.performers : [];
      if (lecdPerformers.length) {
        const pfRow = _el('div', 'pt-demo-tags pt-rec-performers');
        lecdPerformers.forEach(function (pf) {
          const nodes = (typeof graphData !== 'undefined' && graphData.nodes) || [];
          const node = nodes.find(function (n) { return n.id === pf.id; });
          const eraId = node ? (node.era || null) : null;
          const tint = (typeof THEME !== 'undefined') ? THEME.eraTintCss(eraId) : { bg: 'transparent', border: '#888' };
          const chip = document.createElement('span');
          chip.className = 'musician-chip';
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
      headerRow.appendChild(_chipLikeLabel('yt-label-chip', demo.chip_label || '\u266a Recording'));

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
        const _mainPerf = Array.isArray(demo.performers) ? (demo.performers[0] || null) : null;
        const _mainNodeId = _mainPerf ? (_mainPerf.id || null) : null;
        openOrFocusPlayer(
          demo.video_id,
          demo.play_label || rec.title || demo.chip_label || 'Concert',
          demo.artist_label || (_mainPerf ? _mainPerf.label : '') || '',
          0,
          rec.short_title || rec.title || '',
          allTracks.length ? allTracks : null,
          _mainNodeId ? { nodeId: _mainNodeId } : {}
        );
      });
      acts.appendChild(playBtn);

      const videoHost = demo.video_id ? 'https://www.youtube.com/watch?v=' + demo.video_id : '#';
      const ext = _el('a', 'tree-ext-link yt-ext-link');
      ext.innerHTML = '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M14 3v2h3.59l-9.3 9.29 1.42 1.42L19 6.41V10h2V3z\"/><path d=\"M19 19H5V5h7V3H3v18h18v-9h-2z\"/></svg>';
      ext.href = demo.youtube_url || videoHost;
      ext.title = 'Open on YouTube';
      ext.addEventListener('click', function (evt) { evt.stopPropagation(); });
      acts.appendChild(ext);
      headerRow.appendChild(acts);
      block.appendChild(headerRow);

      // Performer chips (clickable musician chips)
      const performers = Array.isArray(demo.performers) ? demo.performers : [];
      if (performers.length) {
        const pfRow = _el('div', 'pt-demo-tags pt-rec-performers');
        performers.forEach(function (pf) {
          const nodes = (typeof graphData !== 'undefined' && graphData.nodes) || [];
          const node = nodes.find(function (n) { return n.id === pf.id; });
          const eraId = node ? (node.era || null) : null;
          const tint = (typeof THEME !== 'undefined') ? THEME.eraTintCss(eraId) : { bg: 'transparent', border: '#888' };
          const chip = document.createElement('span');
          chip.className = 'musician-chip';
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
      }

      return row;
    }

    // ADR-115: her_row — shows a Carnatic raga chip ↔ HER chip pair
    if (type === 'her_row') {
      const block = _el('div', 'pt-demo-block');
      const row = _el('div', 'pt-demo-row');
      if (demo.carnatic_raga_id) {
        const carnChip = _el('span', 'raga-chip', demo.carnatic_label || demo.carnatic_raga_id);
        carnChip.style.cursor = 'pointer';
        carnChip.title = 'Explore Carnatic raga: ' + (demo.carnatic_label || demo.carnatic_raga_id);
        carnChip.addEventListener('click', function (evt) {
          evt.stopPropagation();
          _onRaga(demo.carnatic_raga_id, {});
        });
        row.appendChild(carnChip);
      }
      if (demo.her_id) {
        const sep = _el('span', 'her-label', '\u00a0\u2194\u00a0');
        row.appendChild(sep);
        const herChip = _el('span', 'her-chip', '\u2194\u00a0' + (demo.her_label || demo.her_id));
        herChip.style.cursor = 'pointer';
        herChip.title = 'Explore Hindustani equivalent: ' + (demo.her_label || demo.her_id);
        herChip.addEventListener('click', function (evt) {
          evt.stopPropagation();
          _onRaga(demo.her_id, {});
        });
        row.appendChild(herChip);
      }
      block.appendChild(row);
      return block;
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
    if (kind === 'musician' && item.id) _applyEraTint(chip, item.id);
    if (onClick) chip.addEventListener('click', onClick);
    return chip;
  }

  // ── ADR-102: Colophon renderer ────────────────────────────────────────────
  // Renders vision → curation_loop → contribute → listening_ethic → author
  // beneath the per-panel tutorial. Draws from helpEmptyPanels.colophon
  // (shared across both panels). No-ops when colophon is absent or empty.
  // Not affected by tutorial-filter interactivity (institutional content).

  const _GITHUB_SVG = '<svg class="pt-github-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

  function _renderExtLinks(links) {
    if (!Array.isArray(links) || !links.length) return null;
    const div = _el('div', 'pt-colophon-links');
    links.forEach(function (lnk) {
      if (!lnk.url || !lnk.label) return;
      const a = document.createElement('a');
      a.className = 'pt-colophon-link';
      a.href = lnk.url;
      a.textContent = lnk.label;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      div.appendChild(a);
    });
    return div.children.length ? div : null;
  }

  // ── ADR-147: schema_version 5 — worked-example renderer ─────────────────
  // Renders each panel as a section-by-section worked example with interleaved
  // annotations. Delegates to production builders wherever possible so chips
  // and brackets are visually indistinguishable from the live panels:
  //   · _buildLecdemBracket / _buildLecturerChip / buildRowAccordion (lecdems)
  //   · buildConcertBracket (musician-panel concerts)
  //   · openOrFocusPlayer (every play button — full header/footer/playlist)
  // Annotations support inline-chip tokens:
  //   {raga:id}, {musician:id}, {comp:id}, {composer:id}, {era:eraId}, {her:cid|hid}
  function _renderIntoV5(container, block, slot) {
    const subjectId = (block.subject || {}).id;
    const nodes     = (typeof graphData !== 'undefined' && graphData.nodes) || [];
    const subjectNode = nodes.find(function (n) { return n.id === subjectId; });
    const subjectLabel = subjectNode ? subjectNode.label : subjectId;

    // ── chip factories (reuse production CSS classes) ──────────────────────
    function _musicianChipV5(musicianId, label, opts) {
      opts = opts || {};
      const node = nodes.find(function (n) { return n.id === musicianId; });
      const cls  = opts.composer ? 'musician-chip musician-chip--composer' : 'musician-chip';
      const chip = _el('span', cls, label || (node ? node.label : musicianId));
      _applyEraTint(chip, musicianId);
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', function (e) {
        e.stopPropagation(); _onMusician(musicianId);
      });
      return chip;
    }
    function _ragaChipV5(ragaId, label) {
      const r = (typeof ragas !== 'undefined' ? ragas : []).find(function (r) { return r.id === ragaId; });
      const chip = _el('span', 'raga-chip', label || (r ? (r.name || ragaId) : ragaId));
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', function (e) {
        e.stopPropagation(); _onRaga(ragaId, {});
      });
      return chip;
    }
    function _compChipV5(compId, label) {
      const c = (typeof compositions !== 'undefined' ? compositions : []).find(function (c) { return c.id === compId; });
      const chip = _el('span', 'comp-chip', label || (c ? (c.title || compId) : compId));
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', function (e) {
        e.stopPropagation(); _onComposition(compId, {});
      });
      return chip;
    }
    function _eraChipV5(eraId) {
      const labelMap = {
        trinity: 'Trinity', bridge: 'Bridge', golden_age: 'Golden Age',
        disseminator: 'Disseminator', living_pillars: 'Living Pillars', contemporary: 'Contemporary',
      };
      const chip = _el('span', 'pt-era-chip', labelMap[eraId] || eraId);
      const tint = (typeof THEME !== 'undefined')
        ? THEME.eraTintCss(eraId)
        : { bg: 'transparent', border: 'var(--border-strong)' };
      chip.style.setProperty('--chip-era-bg',     tint.bg);
      chip.style.setProperty('--chip-era-border', tint.border);
      return chip;
    }
    function _herStripV5(carnaticId, hindustaniId) {
      const wrap = _el('span', 'pt-her-strip');
      wrap.appendChild(_ragaChipV5(carnaticId));
      wrap.appendChild(_el('span', 'pt-her-arrow', '\u2194'));
      wrap.appendChild(_ragaChipV5(hindustaniId));
      return wrap;
    }

    // ── annotation token parser: text with inline {kind:id} chips ─────────
    // Returns a <span> with mixed text/chip children. Used for every block of
    // prose so that every raga / musician / composition / era / HER mention
    // is a live, clickable chip — never plain text.
    const TOKEN_RE = /\{(raga|musician|comp|composer|era|her|view):([^}]+)\}/g;
    function _renderAnnotationInto(text, parent) {
      if (!text) return;
      var last = 0, m;
      TOKEN_RE.lastIndex = 0;
      while ((m = TOKEN_RE.exec(text)) !== null) {
        if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
        const kind = m[1], id = m[2];
        if      (kind === 'raga')     parent.appendChild(_ragaChipV5(id));
        else if (kind === 'comp')     parent.appendChild(_compChipV5(id));
        else if (kind === 'musician') parent.appendChild(_musicianChipV5(id));
        else if (kind === 'composer') parent.appendChild(_musicianChipV5(id, null, { composer: true }));
        else if (kind === 'era')      parent.appendChild(_eraChipV5(id));
        else if (kind === 'view') {
          // Inline reference to a view tab — matches active .view-btn visually.
          const viewLabels = { mela_janya: 'Mela-Janya', guru_shishya: 'Guru-Shishya' };
          parent.appendChild(_el('span', 'pt-inline-view-btn', viewLabels[id] || id));
          if (id === 'guru_shishya') parent.appendChild(document.createTextNode(' tree'));
        } else if (kind === 'her') {
          const parts = id.split('|');
          parent.appendChild(_herStripV5(parts[0], parts[1]));
        } else {
          parent.appendChild(document.createTextNode(m[0]));
        }
        last = TOKEN_RE.lastIndex;
      }
      if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    }
    function _ann(text, extraCls) {
      const d = _el('div', 'pt-annotation' + (extraCls ? ' ' + extraCls : ''));
      _renderAnnotationInto(text, d);
      return d;
    }

    // ── section header (uppercase chip with section glyph) ────────────────
    // Use the same chip classes as the production panels (bani_flow.js line
    // 1282 for compositions, line 1625 for lecdems, media_player.js line 2146
    // for concerts/recordings) so the colour matches the live panels exactly.
    function _sectionHdr(label, sectionKind) {
      if (sectionKind === 'compositions' || sectionKind === 'compositions_empty') {
        return _el('span', 'comp-chip chip-section-hdr', label);
      }
      if (sectionKind === 'lecdems') {
        return _el('span', 'lecdem-chip chip-section-hdr', label);
      }
      const glyphMap = {
        misc:       'neutral-chip-recordings',
        concerts:   'neutral-chip-concerts',
        recordings: 'neutral-chip-recordings',
      };
      const modifier = glyphMap[sectionKind] || 'neutral-chip-recordings';
      return _el('span', 'neutral-chip chip-section-hdr has-glyph ' + modifier, label);
    }

    // ── concert builder: assemble a concert object from musicianToPerformances ──
    // Mirrors the structure consumed by the production buildConcertBracket().
    function _buildConcertForSubject(recordingId) {
      if (typeof musicianToPerformances === 'undefined') return null;
      const matches = (musicianToPerformances[subjectId] || [])
        .filter(function (p) { return p.recording_id === recordingId; });
      if (!matches.length) return null;
      const sessionsMap = new Map();
      matches.forEach(function (p) {
        const si = p.session_index || 0;
        if (!sessionsMap.has(si)) {
          sessionsMap.set(si, { session_index: si, performers: p.performers || [], perfs: [] });
        }
        sessionsMap.get(si).perfs.push(p);
      });
      const p0 = matches[0];
      return {
        recording_id: p0.recording_id,
        title:        p0.title || '',
        short_title:  p0.short_title || p0.title || recordingId,
        date:         p0.date || '',
        sessions:     Array.from(sessionsMap.values()).sort(function (a, b) {
          return (a.session_index || 0) - (b.session_index || 0);
        }),
      };
    }

    // ── play button delegating to production openOrFocusPlayer ─────────────
    // perfLike: any object with video_id, display_title, offset_seconds,
    // optional recording_id (→ playlist), short_title (→ concert header),
    // optional performers[] (→ overrides subjectId as the nodeId).
    // ADR-147: button class and playlist assembly match buildTrailItem exactly —
    // dashed border for concert entries, full flat-map playlist identical to
    // the production bani_flow.js click handler.
    function _playFromPerf(perfLike, fallbackArtist) {
      const isConcert = !!(perfLike.recording_id);
      const btn = _el('button', 'rec-play-btn ' + (isConcert ? 'play-btn-concert' : 'play-btn-direct'), '\u25b6');
      btn.type = 'button';
      btn.title = isConcert
        ? ('Part of: ' + (perfLike.short_title || perfLike.concert_title || ''))
        : 'Play';
      btn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        if (typeof openOrFocusPlayer !== 'function') return;
        const perfNodeId = (perfLike.performers && perfLike.performers[0] &&
                            perfLike.performers[0].musician_id)
          ? perfLike.performers[0].musician_id
          : subjectId;
        const recId = perfLike.recording_id || null;
        // Production-identical flat approach: flatten all musicians' performances,
        // deduplicate by session_index::performance_index, sort by offset_seconds.
        // Matches the buildTrailItem click handler in bani_flow.js exactly.
        const tracks = [];
        if (recId && typeof musicianToPerformances !== 'undefined') {
          const allPerfs = Object.values(musicianToPerformances).flat();
          const seenKeys = {};
          allPerfs.forEach(function (sp) {
            if (sp.recording_id !== recId) return;
            const k = (sp.session_index || 0) + '::' + (sp.performance_index || 0);
            if (seenKeys[k]) return;
            seenKeys[k] = true;
            const rObj = (sp.raga_id && typeof ragas !== 'undefined')
              ? ragas.find(function (r) { return r.id === sp.raga_id; }) : null;
            tracks.push({
              offset_seconds: sp.offset_seconds  || 0,
              display_title:  sp.display_title   || '',
              raga_id:        sp.raga_id         || null,
              raga_name:      rObj ? rObj.name   : (sp.raga_id || ''),
              tala:           sp.tala            || null,
              timestamp:      sp.timestamp       || '00:00',
              composition_id: sp.composition_id  || null,
            });
          });
          tracks.sort(function (a, b) { return (a.offset_seconds || 0) - (b.offset_seconds || 0); });
        }
        const concertTitle = perfLike.short_title || perfLike.concert_title || '';
        const meta = {
          nodeId:        perfNodeId,
          ragaId:        perfLike.raga_id || null,
          compositionId: perfLike.composition_id || null,
        };
        openOrFocusPlayer(
          perfLike.video_id,
          perfLike.display_title || perfLike.label || '',
          fallbackArtist || subjectLabel,
          perfLike.offset_seconds || 0,
          concertTitle,
          tracks,
          meta
        );
      });
      return btn;
    }

    // Convert a compositionToPerf / musicianToPerformances entry into the
    // row format expected by the production buildTrailItem function.
    // This lets composition_tree and recording_tree delegate rendering
    // entirely to the production function — same buttons, same playlist
    // logic, same chips — without any custom divergent code.
    function _perfToRow(perf) {
      var performers = perf.performers || [];
      var primary = null;
      for (var i = 0; i < performers.length; i++) {
        if (performers[i].role === 'vocal') { primary = performers[i]; break; }
      }
      if (!primary) primary = performers[0] || null;
      var nodeId = (primary && primary.musician_id) || null;
      var pNode  = (nodeId && typeof cy !== 'undefined') ? cy.getElementById(nodeId) : null;
      var pExists = pNode && pNode.length > 0;
      var artistLabel = pExists
        ? (pNode.data('label') || nodeId)
        : ((primary && primary.unmatched_name) || nodeId || perf.title || '');
      return {
        nodeId:      nodeId,
        artistLabel: artistLabel,
        lifespan:    pExists ? pNode.data('lifespan') : null,
        track: {
          vid:            perf.video_id        || '',
          label:          perf.display_title   || '',
          year:           perf.date ? parseInt(perf.date) : null,
          offset_seconds: perf.offset_seconds  || 0,
          composition_id: perf.composition_id  || null,
          recording_id:   perf.recording_id    || null,
          short_title:    perf.short_title     || '',
          concert_title:  perf.title           || '',
          timestamp:      perf.timestamp       || '00:00',
          raga_id:        perf.raga_id         || null,
          tala:           perf.tala            || null,
          version:        perf.version         || null,
        },
        isStructured:  !!(perf.recording_id),
        perfKey:       (perf.recording_id      || '') + '::' +
                       (perf.session_index     || 0)  + '::' +
                       (perf.performance_index || 0),
        allPerformers: performers,
      };
    }

    // ── intro ribbon ───────────────────────────────────────────────────────
    if (helpEmptyPanels && helpEmptyPanels.intro_ribbon) {
      container.appendChild(_el('div', 'pt-intro-ribbon', helpEmptyPanels.intro_ribbon));
    }

    // ── header annotations (with chip tokens) ──────────────────────────────
    (block.header_annotations || []).forEach(function (ann) {
      const strip = _ann(ann.text);
      strip.dataset.position = ann.position || '';
      container.appendChild(strip);
    });

    // ── sections ───────────────────────────────────────────────────────────
    (block.sections || []).forEach(function (section) {
      const sk = section.kind;
      const sectionDiv = _el('div', 'pt-v5-section pt-v5-section--' + sk);
      const hdrLabel = ({
        lecdems:            'LECDEMS',
        compositions:       'COMPOSITIONS',
        misc:               'MISC',
        concerts:           'CONCERTS',
        recordings:         'RECORDINGS',
        compositions_empty: 'COMPOSITIONS',
      })[sk] || sk.toUpperCase();
      const hdrRow = _el('div', 'pt-v5-section-hdr');
      hdrRow.appendChild(_sectionHdr(hdrLabel, sk));
      if (sk === 'compositions_empty') hdrRow.appendChild(document.createTextNode(' (0)'));
      sectionDiv.appendChild(hdrRow);

      if (section.section_gloss) sectionDiv.appendChild(_ann(section.section_gloss));

      if (sk === 'compositions_empty') {
        // ADR-147 polish v3: trinity_chips array removed — the three names are
        // now woven into section_gloss as inline {musician:...} chips so they
        // sit in narrative prose, not in a separate redundant chip row.
        if (section.trinity_chips && section.trinity_chips.length) {
          const trinityDiv = _el('div', 'pt-v5-trinity-chips');
          section.trinity_chips.forEach(function (chip) {
            trinityDiv.appendChild(_musicianChipV5(chip.id, chip.label));
          });
          sectionDiv.appendChild(trinityDiv);
        }
      } else {
        (section.rows || []).forEach(function (row) {
          const rowDiv = _el('div', 'pt-v5-row');
          const rk   = row.row_kind;
          const refs = row.data_refs || {};

          if (rk === 'lecdem') {
            // Delegate to production _buildLecdemBracket. Find the matching
            // ref in the appropriate index (about-raga for bani panel,
            // about-musician for musician panel) so the bracket carries all
            // tags, segments, and subject chips just like the live panel.
            const lecturerId    = refs.lecdem_musician_id;
            const lecturerLabel = (function () {
              const n = nodes.find(function (n) { return n.id === lecturerId; });
              return n ? n.label : lecturerId;
            })();
            var ref = null;
            const aboutRaga      = (typeof lecdemsAboutRaga !== 'undefined' ? lecdemsAboutRaga : {})[subjectId] || [];
            const aboutMusician  = (typeof lecdemsAboutMusician !== 'undefined' ? lecdemsAboutMusician : {})[subjectId] || [];
            const byLecturer     = (typeof lecdemsBy !== 'undefined' ? lecdemsBy : {})[lecturerId] || [];
            const pools = [aboutRaga, aboutMusician, byLecturer];
            for (var i = 0; i < pools.length && !ref; i++) {
              ref = pools[i].find(function (r) { return r.video_id === refs.lecdem_video_id; });
            }
            if (ref && typeof _buildLecdemBracket === 'function') {
              const bracket = _buildLecdemBracket(ref, lecturerId, lecturerLabel);
              if (bracket) rowDiv.appendChild(bracket);
            } else {
              // graceful fallback: chip + label + production play button
              const line = _el('div', 'pt-v5-lecdem-line');
              line.appendChild(_musicianChipV5(lecturerId));
              if (refs.lecdem_label) line.appendChild(_el('span', 'pt-v5-lecdem-label', '\u00a0' + refs.lecdem_label));
              line.appendChild(_playFromPerf({
                video_id:      refs.lecdem_video_id,
                display_title: refs.lecdem_label,
                offset_seconds: 0,
              }, lecturerLabel));
              rowDiv.appendChild(line);
            }

          } else if (rk === 'composition_tree') {
            // composition chip + composer chip + per-musician version rows.
            // Leaves delegate to buildTreeLeaf (production renderer) wrapped
            // in a .tree-rec-list so indentation and dashed rail CSS apply.
            const compLine = _el('div', 'pt-v5-comp-line');
            compLine.appendChild(_compChipV5(refs.composition_id));
            if (refs.composer_id) compLine.appendChild(_musicianChipV5(refs.composer_id, null, { composer: true }));
            rowDiv.appendChild(compLine);
            const treeList = document.createElement('ul');
            treeList.className = 'tree-rec-list';
            const seen = {};
            // Tier 1: session recordings from compositionToPerf index.
            const perfs = (typeof compositionToPerf !== 'undefined')
              ? (compositionToPerf[refs.composition_id] || []) : [];
            perfs.forEach(function (perf) {
              if (!perf.video_id) return;
              const row = _perfToRow(perf);
              if (!row.nodeId || seen[row.perfKey]) return;
              seen[row.perfKey] = true;
              if (typeof buildTreeLeaf === 'function') {
                treeList.appendChild(buildTreeLeaf(row, null, false));
              } else {
                const li = document.createElement('li');
                li.appendChild(_musicianChipV5(row.nodeId));
                li.appendChild(_playFromPerf(perf, row.artistLabel));
                treeList.appendChild(li);
              }
            });
            // Tier 3: youtube[] entries on musician nodes for this composition —
            // these are standalone links not folded into session files, so they
            // don't appear in compositionToPerf. Mirrors buildListeningTrail's
            // first pass in bani_flow.js.
            if (typeof graphData !== 'undefined') {
              (graphData.nodes || []).forEach(function (node) {
                (node.youtube || []).forEach(function (yt) {
                  if (!yt.vid || yt.composition_id !== refs.composition_id) return;
                  const ytKey = (node.id || '') + '::yt::' + yt.vid;
                  if (seen[ytKey]) return;
                  seen[ytKey] = true;
                  const ytPerf = {
                    // unmatched_name carries the display label for musicians
                    // that have no lineage edges and are thus absent from cy.
                    performers:        [{ musician_id: node.id, unmatched_name: node.label || node.id }],
                    video_id:          yt.vid,
                    display_title:     yt.label || '',
                    short_title:       '',
                    title:             '',
                    date:              yt.year ? String(yt.year) : '',
                    session_index:     null,
                    performance_index: null,
                    offset_seconds:    0,
                    recording_id:      null,
                    raga_id:           yt.raga_id  || null,
                    composition_id:    yt.composition_id || null,
                    tala:              yt.tala     || null,
                    version:           yt.version  || null,
                    timestamp:         '00:00',
                  };
                  const ytRow = _perfToRow(ytPerf);
                  if (!ytRow.nodeId) return;
                  if (typeof buildTreeLeaf === 'function') {
                    treeList.appendChild(buildTreeLeaf(ytRow, null, false));
                  } else {
                    const li = document.createElement('li');
                    li.appendChild(_musicianChipV5(ytRow.nodeId));
                    li.appendChild(_playFromPerf(ytPerf, ytRow.artistLabel));
                    treeList.appendChild(li);
                  }
                });
              });
            }
            rowDiv.appendChild(treeList);

          } else if (rk === 'misc_entry') {
            const miscLine = _el('div', 'pt-v5-misc-line');
            miscLine.appendChild(_musicianChipV5(refs.misc_musician_id));
            if (refs.misc_raga_id)  miscLine.appendChild(_ragaChipV5(refs.misc_raga_id));
            if (refs.misc_label)    miscLine.appendChild(_el('span', 'pt-v5-misc-label', refs.misc_label));
            if (refs.video_id) {
              const artistNode = nodes.find(function (n) { return n.id === refs.misc_musician_id; });
              miscLine.appendChild(_playFromPerf({
                video_id:       refs.video_id,
                display_title:  refs.misc_label || '',
                offset_seconds: refs.offset_seconds || 0,
                recording_id:   refs.recording_id || null,
                raga_id:        refs.misc_raga_id || null,
              }, artistNode ? artistNode.label : ''));
            }
            rowDiv.appendChild(miscLine);

          } else if (rk === 'concert') {
            // Delegate to production buildConcertBracket so the row is
            // pixel-identical to the live musician panel.
            const concert = _buildConcertForSubject(refs.recording_id);
            if (concert && typeof buildConcertBracket === 'function') {
              const bracket = buildConcertBracket(concert, subjectId, subjectLabel);
              if (bracket) rowDiv.appendChild(bracket);
            } else {
              // graceful fallback
              const line = _el('div', 'pt-v5-concert-line');
              line.appendChild(_el('span', 'pt-v5-concert-title',
                '\u266a\u00a0' + (concert ? concert.short_title : refs.recording_id)));
              rowDiv.appendChild(line);
            }

          } else if (rk === 'recording_tree') {
            const ragaLine = _el('div', 'pt-v5-raga-line');
            ragaLine.appendChild(_ragaChipV5(refs.raga_id));
            rowDiv.appendChild(ragaLine);
            // Comp chip + play button on the same row (image-4 style).
            // The play button is pushed to the right with margin-left:auto.
            const compLine2 = _el('div', 'pt-v5-comp-line');
            compLine2.appendChild(_compChipV5(refs.composition_id));
            // Composer chip on a second indented line (dashed, like production).
            const composerLine = refs.composer_id
              ? _el('div', 'pt-v5-comp-line')
              : null;
            if (composerLine) {
              composerLine.style.marginLeft = 'var(--hier-indent-step, 16px)';
              composerLine.appendChild(_musicianChipV5(refs.composer_id, null, { composer: true }));
            }
            if (subjectId && typeof musicianToPerformances !== 'undefined') {
              var matching = (musicianToPerformances[subjectId] || []).filter(function (p) {
                return p.raga_id === refs.raga_id && p.composition_id === refs.composition_id;
              });
              // youtube[] fallback for perfs not in session files.
              if (!matching.length && typeof graphData !== 'undefined') {
                const node = (graphData.nodes || []).find(function (n) { return n.id === subjectId; });
                const ytList = (node && node.youtube) || [];
                matching = ytList
                  .filter(function (yt) {
                    return yt.raga_id === refs.raga_id && yt.composition_id === refs.composition_id;
                  })
                  .map(function (yt) {
                    return {
                      video_id:       yt.vid || '',
                      display_title:  yt.label || '',
                      short_title:    yt.label || '',
                      raga_id:        yt.raga_id || null,
                      composition_id: yt.composition_id || null,
                      offset_seconds: 0,
                      recording_id:   null,
                      performers:     [{ musician_id: subjectId }],
                    };
                  })
                  .filter(function (p) { return p.video_id; });
              }
              // Single play button for the first available perf — matches the
              // production raga-panel style (image 4) where each composition
              // row has one ▶ at the far right, not a sub-list of versions.
              const firstPerf = matching.find(function (p) { return p.video_id; });
              if (firstPerf) {
                const btn = _playFromPerf(firstPerf, subjectLabel);
                btn.style.marginLeft = 'auto';
                compLine2.appendChild(btn);
              }
            }
            rowDiv.appendChild(compLine2);
            if (composerLine) rowDiv.appendChild(composerLine);
          }

          sectionDiv.appendChild(rowDiv);
          if (row.annotation) {
            sectionDiv.appendChild(_ann(row.annotation, 'pt-annotation--row'));
          }
        });
      }
      container.appendChild(sectionDiv);
    });

    // ── closing note (chip-stacked above text, no excess gray) ─────────────
    const cn = block.closing_note || {};
    if (cn.text) {
      const cnDiv = _el('div', 'pt-v5-closing-note');
      const body = _el('div', 'pt-v5-closing-text');
      // Favicon as inline icon before the text — reads the document's injected
      // <link rel="icon"> href so it stays in sync with the render pipeline.
      const _faviconEl = document.querySelector('link[rel="icon"]');
      if (_faviconEl && _faviconEl.href) {
        const iconImg = document.createElement('img');
        iconImg.className = 'pt-v5-closing-icon';
        iconImg.src = _faviconEl.href;
        iconImg.alt = '';
        iconImg.setAttribute('aria-hidden', 'true');
        body.appendChild(iconImg);
      }
      _renderAnnotationInto(cn.text, body);
      cnDiv.appendChild(body);
      container.appendChild(cnDiv);
    }
  }

  function _renderInto(container, block, slot) {
    container.innerHTML = '';

    const schemaVersion = (typeof helpEmptyPanels !== 'undefined' && helpEmptyPanels)
      ? (helpEmptyPanels.schema_version || 1)
      : 1;
    if (schemaVersion > 5) {
      container.appendChild(_el('p', 'pt-upgrade',
        'Tutorial data schema (' + schemaVersion + ') is newer than this render. Please update.'));
      return;
    } else if (schemaVersion === 5) {
      _renderIntoV5(container, block, slot);
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

      switcher.appendChild(ragaBtn);
      switcher.appendChild(graphBtn);
      section.appendChild(switcher);

      if (viewSection.graph_note) {
        section.appendChild(_el('p', 'pt-view-note', viewSection.graph_note));
      }
      if (viewSection.raga_note) {
        const composers = Array.isArray(viewSection.raga_note_composers)
          ? viewSection.raga_note_composers : [];
        if (composers.length) {
          const noteDiv = _el('div', 'pt-view-note');
          noteDiv.appendChild(document.createTextNode(viewSection.raga_note + ' — '));
          composers.forEach(function (c, i) {
            if (i > 0) noteDiv.appendChild(document.createTextNode(', '));
            const nodeId = _lookupComposerNodeId(c.id);
            if (nodeId) {
              const chip = _el('span', 'musician-chip', c.label || c.id);
              _applyEraTint(chip, nodeId);
              chip.style.cursor = 'pointer';
              chip.addEventListener('click', function () { _onMusician(nodeId); });
              noteDiv.appendChild(chip);
            } else {
              noteDiv.appendChild(document.createTextNode(c.label || c.id));
            }
          });
          if (viewSection.raga_note_suffix) {
            noteDiv.appendChild(document.createTextNode(' — ' + viewSection.raga_note_suffix));
          }
          section.appendChild(noteDiv);
        } else {
          section.appendChild(_el('p', 'pt-view-note', viewSection.raga_note));
        }
      }
      if (viewSection.wheel_note) {
        section.appendChild(_el('p', 'pt-view-note pt-wheel-note', viewSection.wheel_note));
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
        // Effect statement — effect_parts (inline chips) > view-sensitive > plain
        if (entry.effect_parts && entry.effect_parts.length) {
          row.appendChild(_renderEffectParts(entry.effect_parts));
        } else if (entry.effect_graph && entry.effect_raga) {
          const eff = _el('span', 'pt-effect');
          const ragaLine = _el('span', 'pt-effect-line');
          ragaLine.appendChild(_el('span', 'pt-nowrap', '(Mela-Janya)'));
          ragaLine.appendChild(document.createTextNode(' \u00b7 ' + _normalizeEffectText(entry.effect_raga)));
          eff.appendChild(ragaLine);

          const graphLine = _el('span', 'pt-effect-line');
          graphLine.appendChild(_el('span', 'pt-nowrap', '(Guru-Shishya)'));
          graphLine.appendChild(document.createTextNode(' \u00b7 ' + _normalizeEffectText(entry.effect_graph)));
          eff.appendChild(graphLine);
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

  function _ensureDemoSubjectLoaded(slot) {
    // ADR-147 polish v3: when the user opens help on an empty panel, first
    // populate the panel with the tutorial's demo subject so the live header
    // (raga chip + janya row + HER strip + filter, or musician chip + filter)
    // sits ABOVE the deck. Pointer-text annotations finally have something to
    // point at, and the deck becomes a guided tour over real, populated UI
    // rather than a free-floating brochure.
    const block = _block(slot);
    const subject = block && block.subject;
    if (!subject || !subject.id) return;
    if (slot === 'bani') {
      // Only auto-load if no subject is already pinned in the bani panel.
      // #listening-trail is display:none until a subject is loaded, so its
      // computed display is the most reliable empty-state signal.
      const trail = document.getElementById('listening-trail');
      const cs = trail ? window.getComputedStyle(trail).display : 'none';
      if (cs !== 'none') return;
      if (typeof triggerBaniSearch === 'function') {
        try { triggerBaniSearch(subject.kind || 'raga', subject.id); } catch (_) {}
      }
    } else if (slot === 'musician') {
      // Empty state: #node-name shows the em-dash placeholder (—, U+2014).
      // Don't rely on #node-info display because CSS keeps it visible even
      // before a node is selected; the placeholder text is the truth.
      const nameEl = document.getElementById('node-name');
      const txt = nameEl ? (nameEl.textContent || '').trim() : '';
      const empty = !txt || txt === '—' || txt === '-';
      if (!empty) return;
      _orientToMusician(subject.id);
    }
  }

  function _enterHelp(slot) {
    _ensureDemoSubjectLoaded(slot);
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

  // ── Wire preface chips: era tint + background navigation ─────────────────
  // Preface chips are static HTML with data-preface-* attributes set at render
  // time. This function applies era tints and wires click handlers so that
  // clicking a chip triggers the corresponding panel action in the background
  // without closing the help dialog.
  function _tintPrefaceChips() {
    const hdBody = document.getElementById('hd-body');
    if (!hdBody) return;
    const nodes = (typeof graphData !== 'undefined' && graphData.nodes) || [];

    // ── Helper: brief visual tap feedback ──────────────────────────────────
    function _flash(chip) {
      chip.classList.add('chip-tapped');
      setTimeout(function () { chip.classList.remove('chip-tapped'); }, 220);
    }

    // ── Musician chips ──────────────────────────────────────────────────────
    hdBody.querySelectorAll('[data-preface-label]').forEach(function (chip) {
      const label = chip.dataset.prefaceLabel || '';
      const node = nodes.find(function (n) {
        return n.label && n.label.toLowerCase() === label.toLowerCase();
      });
      const eraId = node ? (node.era || null) : null;
      const tint = (typeof THEME !== 'undefined')
        ? THEME.eraTintCss(eraId)
        : { bg: 'transparent', border: 'var(--border-strong)' };
      chip.style.setProperty('--chip-era-bg', tint.bg);
      chip.style.setProperty('--chip-era-border', tint.border);
      if (node && typeof cy !== 'undefined' && typeof selectNode === 'function') {
        const cyNode = cy.getElementById(node.id);
        if (cyNode && cyNode.length) {
          chip.addEventListener('click', function (e) {
            e.stopPropagation();
            _flash(chip);
            selectNode(cyNode);
          });
        }
      }
    });

    // ── Raga chips ──────────────────────────────────────────────────────────
    const ragaList = (typeof ragas !== 'undefined') ? ragas : [];
    hdBody.querySelectorAll('[data-preface-raga]').forEach(function (chip) {
      const label = chip.dataset.prefaceRaga || '';
      const raga = ragaList.find(function (r) {
        return (r.name || '').toLowerCase() === label.toLowerCase();
      });
      if (raga && typeof triggerBaniSearch === 'function') {
        chip.addEventListener('click', function (e) {
          e.stopPropagation();
          _flash(chip);
          triggerBaniSearch('raga', raga.id);
        });
      }
    });

    // ── Composition chips ───────────────────────────────────────────────────
    const compList = (typeof compositions !== 'undefined') ? compositions : [];
    hdBody.querySelectorAll('[data-preface-comp]').forEach(function (chip) {
      const label = chip.dataset.prefaceComp || '';
      const comp = compList.find(function (c) {
        return (c.title || c.name || '').toLowerCase() === label.toLowerCase();
      });
      if (comp && typeof triggerBaniSearch === 'function') {
        chip.addEventListener('click', function (e) {
          e.stopPropagation();
          _flash(chip);
          triggerBaniSearch('comp', comp.id);
        });
      }
    });
  }

  // ── Initial paint: "hello world" state ───────────────────────────────────
  // ADR-147 polish v4 (user request): the page should open with both
  // tutorial subjects already populating their panels AND both help decks
  // visible — a guided home screen rather than two blank panels.
  //
  // Sequence (order matters):
  //   1. Render and show tutorials so dataset.rendered=1 (cheap, sync).
  //   2. Wait for cy to be ready (poll for cy + cy.nodes().length>0); raga
  //      arrays (ragas, compositions) are inlined as globals at render time
  //      so they're always available, but cy backs both selectNode (right
  //      panel) and parts of applyBaniFilter (trail list rendering).
  //   3. Load the bani subject via triggerBaniSearch — populates the
  //      sticky-zone subject header + janya row + trail filter, fills the
  //      scroll-zone listening trail.
  //   4. Load the musician subject via selectNode — populates the
  //      sticky-zone musician chip + wiki link, fills the scroll-zone
  //      recordings panel. selectNode auto-dismisses any active help
  //      overlay, which is why we open help AFTER, not before.
  //   5. Enter help on both panels. _enterHelp hides the scroll-zone
  //      children (trail, recordings list) and shows the tutorial deck on
  //      top, while the sticky-zone subject headers stay visible above the
  //      deck. _ensureDemoSubjectLoaded inside _enterHelp is now idempotent
  //      against this case — its empty-state checks see the populated panel
  //      and skip the re-load.
  function _bootHelloWorld() {
    if (!helpEmptyPanels) return;
    // ADR-151: if a permalink hash is present, restoreStateFromHash() has
    // already populated both panels synchronously. Proceeding would overwrite
    // the restored state with the demo subjects and show the help decks on top.
    if (window.location.hash && window.location.hash.startsWith('#s=')) return;
    // Bani subject (reetigowla by default — kind='raga')
    const baniBlock = helpEmptyPanels.bani_flow_panel || null;
    const baniSubject = baniBlock && baniBlock.subject;
    if (baniSubject && baniSubject.id && typeof triggerBaniSearch === 'function') {
      try { triggerBaniSearch(baniSubject.kind || 'raga', baniSubject.id); } catch (_) {}
    }
    // Musician subject (ramnad_krishnan by default). Use selectNode
    // directly rather than _orientToMusician — the latter forces a
    // switchView('graph'), but the default boot view is the raga wheel
    // and we don't want to override the user's first impression of the
    // canvas. selectNode populates the right sidebar regardless of view.
    const muBlock = helpEmptyPanels.musician_panel || null;
    const muSubject = muBlock && muBlock.subject;
    if (muSubject && muSubject.id && typeof cy !== 'undefined' &&
        typeof selectNode === 'function') {
      const n = cy.getElementById(muSubject.id);
      if (n && n.length) {
        try { selectNode(n); } catch (_) {}
      }
    }
    // Now show the help decks on top. selectNode + applyBaniFilter both
    // call dismissPanelHelp internally, so any prior help state was
    // already cleared; entering fresh is safe.
    if (!_helpState.bani)     _enterHelp('bani');
    if (!_helpState.musician) _enterHelp('musician');
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!helpEmptyPanels) return;
    _tintPrefaceChips();
    // Pre-render both tutorial DOMs so the deck containers exist before
    // _enterHelp tries to flip them visible. _ensureRendered is idempotent.
    _ensureRendered('bani');
    _ensureRendered('musician');
    // Poll for cy + node count > 0 before booting the hello-world state.
    // cy is constructed at module load time but populates asynchronously
    // (layout + ready callbacks). Most pages hit ready within ~100 ms.
    var attempts = 0;
    (function tick() {
      // ADR-151: stop polling immediately if a permalink is active.
      if (window.location.hash && window.location.hash.startsWith('#s=')) return;
      const cyReady = (typeof cy !== 'undefined') && cy.nodes && cy.nodes().length > 0;
      if (cyReady || attempts >= 100) {  // ≈5 s cap
        _bootHelloWorld();
        return;
      }
      attempts += 1;
      setTimeout(tick, 50);
    })();
  });
})();

// ── ADR-134 D4 / ADR-138: lineage-empty hint text ────────────────────────────
// Shown on the cy canvas when an era/instrument filter combination yields
// zero visible nodes within the content-bearing connected (guru-shishya) set.
// Consumed by graph_view.js cy.ready() via the LINEAGE_FILTER_EMPTY_TEXT global.
const LINEAGE_FILTER_EMPTY_TEXT =
  'No musicians match these filters. Musicians without recordings or compositions ' +
  'are not shown on this canvas \u2014 find them by name in the search bar, ' +
  'or see all lineages in the Mela-Janya view.';
