// ── Bani Flow ─────────────────────────────────────────────────────────────────

// Build a node-id → born-year map for fallback sort
const nodeBorn = {};
cy.nodes().forEach(n => { nodeBorn[n.id()] = n.data('born'); });

let activeBaniFilter = null; // { type: 'comp'|'raga', id: string }

function applyBaniFilter(type, id) {
  activeBaniFilter = { type, id };
  const matchedNodeIds = type === 'comp'
    ? (compositionToNodes[id] || [])
    : (ragaToNodes[id] || []);

  // Dim/highlight nodes
  cy.elements().addClass('faded');
  cy.elements().removeClass('highlighted bani-match');
  matchedNodeIds.forEach(nid => {
    const n = cy.getElementById(nid);
    n.removeClass('faded');
    n.addClass('bani-match');
  });

  // Highlight edges between matched nodes
  const matchedSet = new Set(matchedNodeIds);
  cy.edges().forEach(e => {
    if (matchedSet.has(e.data('source')) && matchedSet.has(e.data('target'))) {
      e.removeClass('faded');
      e.addClass('highlighted');
    }
  });

  // Build listening trail
  buildListeningTrail(type, id, matchedNodeIds);

  document.getElementById('trail-filter').style.display = 'block';
  document.getElementById('trail-filter').value = '';

  // Sync raga wheel if it is the active view
  if (typeof syncRagaWheelToFilter === 'function') {
    syncRagaWheelToFilter(type, id);
  }
}

function buildListeningTrail(type, id, matchedNodeIds) {
  const trail = document.getElementById('listening-trail');
  const trailList = document.getElementById('trail-list');
  trailList.innerHTML = '';

  // ── Subject header (ADR-020) ──────────────────────────────────────────────
  const subjectHeader = document.getElementById('bani-subject-header');
  const subjectName   = document.getElementById('bani-subject-name');
  const subjectLink   = document.getElementById('bani-subject-link');
  const subjectSub    = document.getElementById('bani-subject-sub');

  subjectSub.innerHTML = '';
  subjectLink.style.display = 'none';
  subjectLink.href = '#';
  document.getElementById('bani-subject-aliases-row').style.display = 'none';
  document.getElementById('bani-subject-aliases-row').textContent = '';
  document.getElementById('bani-janyas-row').style.display = 'none';
  document.getElementById('bani-janyas-panel').style.display = 'none';
  document.getElementById('bani-janyas-list').innerHTML = '';
  document.getElementById('bani-janyas-filter').value = '';

  if (type === 'comp') {
    const comp     = compositions.find(c => c.id === id);
    const raga     = comp ? ragas.find(r => r.id === comp.raga_id) : null;
    const composer = comp ? composers.find(c => c.id === comp.composer_id) : null;

    // Row 1: composition title + source link
    subjectName.textContent = comp ? comp.title : id;
    const compSrc = comp && comp.sources && comp.sources[0];
    if (compSrc) {
      subjectLink.href = compSrc.url;
      subjectLink.style.display = 'inline';
    }

    // Row 2: raga (linked) · tala · composer (linked to graph node if available)
    const parts = [];

    if (raga) {
      const ragaSpan = document.createElement('span');
      // Raga name → in-app navigation: summon raga into Bani Flow + raga wheel
      const ragaBtn = document.createElement('span');
      ragaBtn.className = 'bani-sub-link';
      ragaBtn.style.cursor = 'pointer';
      ragaBtn.textContent = raga.name;
      ragaBtn.title = 'Explore ' + raga.name + ' in Bani Flow';
      ragaBtn.addEventListener('click', e => {
        e.stopPropagation();
        triggerBaniSearch('raga', raga.id);
      });
      ragaSpan.appendChild(ragaBtn);
      parts.push(ragaSpan);
    }

    if (comp && comp.tala) {
      const talaSpan = document.createElement('span');
      talaSpan.textContent = comp.tala.charAt(0).toUpperCase() + comp.tala.slice(1);
      parts.push(talaSpan);
    }

    if (composer) {
      const composerSpan = document.createElement('span');
      if (composer.musician_node_id) {
        const a = document.createElement('a');
        a.className = 'bani-sub-link';
        a.href = '#';
        a.textContent = composer.name;
        a.addEventListener('click', e => {
          e.preventDefault();
          const n = cy.getElementById(composer.musician_node_id);
          if (n && n.length) {
            cy.elements().removeClass('faded highlighted bani-match');
            selectNode(n);
          }
        });
        composerSpan.appendChild(a);
      } else {
        composerSpan.textContent = composer.name;
      }
      parts.push(composerSpan);
    }

    // Join with ' · ' separators
    parts.forEach((part, i) => {
      subjectSub.appendChild(part);
      if (i < parts.length - 1) {
        const sep = document.createElement('span');
        sep.textContent = ' \u00b7 ';
        sep.style.color = 'var(--gray)';
        subjectSub.appendChild(sep);
      }
    });

  } else {
    // ── Raga search (ADR-022) ───────────────────────────────────────────────────
    const raga = ragas.find(r => r.id === id);

    // Row 1: raga name + Wikipedia link + notes tooltip
    subjectName.textContent = raga ? raga.name : id;
    if (raga && raga.notes) {
      subjectName.title = raga.notes;          // hover tooltip
    } else {
      subjectName.title = '';
    }
    const ragaSrc = raga && raga.sources && raga.sources[0];
    if (ragaSrc) {
      subjectLink.href = ragaSrc.url;
      subjectLink.style.display = 'inline';
    }

    // Row 2 (#bani-subject-sub): structural position
    subjectSub.innerHTML = '';
    if (raga && raga.is_melakarta) {
      // Mela raga: show mela number and cakra
      const mela_num  = raga.melakarta;
      const cakra_num = raga.cakra;
      const cakra_name = CAKRA_NAMES[cakra_num] || String(cakra_num);
      if (mela_num && cakra_num) {
        const melaSpan = document.createElement('span');
        melaSpan.textContent = `Mela ${mela_num} \u00b7 Cakra ${cakra_num} \u2014 ${cakra_name}`;
        subjectSub.appendChild(melaSpan);
      }
    } else if (raga && raga.parent_raga) {
      // Janya raga: show parent mela as a clickable link
      const parentRaga = ragas.find(r => r.id === raga.parent_raga);
      const parentName = parentRaga ? parentRaga.name : raga.parent_raga;
      const janyaLabel = document.createElement('span');
      janyaLabel.textContent = 'Janya of ';
      janyaLabel.style.color = 'var(--fg3)';
      const parentLink = document.createElement('a');
      parentLink.className = 'bani-sub-link';
      parentLink.href = '#';
      parentLink.textContent = parentName;
      parentLink.addEventListener('click', e => {
        e.preventDefault();
        triggerBaniSearch('raga', raga.parent_raga);
      });
      janyaLabel.appendChild(parentLink);
      subjectSub.appendChild(janyaLabel);
    }
    // (if neither: sub-label is empty — graceful degradation)

    // Row 3 (#bani-subject-aliases-row): aliases
    const aliasesRow = document.getElementById('bani-subject-aliases-row');
    aliasesRow.textContent = '';
    aliasesRow.style.display = 'none';
    if (raga && raga.aliases && raga.aliases.length > 0) {
      aliasesRow.textContent = 'also: ' + raga.aliases.join(', ');
      aliasesRow.style.display = 'block';
    }

    // Row 4 (#bani-janyas-row): janyas filter + list (mela ragas only)
    const janyasRow    = document.getElementById('bani-janyas-row');
    const janyasPanel  = document.getElementById('bani-janyas-panel');
    const janyasList   = document.getElementById('bani-janyas-list');
    const janyasToggle = document.getElementById('bani-janyas-toggle');
    const janyasCount  = document.getElementById('bani-janyas-count');
    const janyasFilter = document.getElementById('bani-janyas-filter');
    janyasRow.style.display = 'none';
    janyasPanel.style.display = 'none';
    janyasList.innerHTML = '';
    janyasFilter.value = '';

    if (raga && raga.is_melakarta) {
      const janyas = ragas.filter(r => r.parent_raga === id);
      janyas.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      if (janyas.length > 0) {
        janyasCount.textContent = `(${janyas.length})`;
        janyasToggle.textContent = '\u25b6 Janyas';
        janyasRow.style.display = 'block';

        // Render filtered list of janya links
        function renderJanyaList(filter) {
          janyasList.innerHTML = '';
          const q = filter.trim().toLowerCase();
          const visible = q ? janyas.filter(j => (j.name || j.id).toLowerCase().includes(q)) : janyas;
          if (visible.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'bani-janyas-empty';
            empty.textContent = 'no match';
            janyasList.appendChild(empty);
          } else {
            visible.forEach(j => {
              const a = document.createElement('a');
              a.className = 'bani-janya-link';
              a.href = '#';
              a.textContent = j.name || j.id;
              a.addEventListener('click', e => {
                e.preventDefault();
                triggerBaniSearch('raga', j.id);
              });
              janyasList.appendChild(a);
            });
          }
        }

        renderJanyaList('');

        // Live filter on input
        janyasFilter.oninput = () => renderJanyaList(janyasFilter.value);

        // Toggle behaviour
        janyasToggle.onclick = () => {
          const open = janyasPanel.style.display !== 'none';
          janyasPanel.style.display = open ? 'none' : 'block';
          janyasToggle.textContent = open ? '\u25b6 Janyas' : '\u25bc Janyas';
          if (!open) {
            janyasFilter.value = '';
            renderJanyaList('');
            janyasFilter.focus();
          }
        };
      }
    }
  }

  subjectHeader.style.display = 'block';

  // ── 1. Collect raw rows ────────────────────────────────────────────────────

  // Legacy youtube[] entries from matched musician nodes
  const rawRows = [];
  matchedNodeIds.forEach(nid => {
    const n = cy.getElementById(nid);
    if (!n) return;
    const d = n.data();
    d.tracks.forEach(t => {
      const matches = type === 'comp'
        ? t.composition_id === id
        : (t.raga_id === id || (t.composition_id && (() => {
            const c = compositions.find(x => x.id === t.composition_id);
            return c && c.raga_id === id;
          })())) ;
      if (matches) {
        const vid = t.vid || '';
        const offset = t.offset_seconds || 0;
        rawRows.push({
          nodeId: nid, artistLabel: d.label, born: d.born,
          lifespan: d.lifespan, color: d.color, shape: d.shape,
          track: t, isStructured: false,
          perfKey: `${vid}::${offset}`,
          allPerformers: null,
        });
      }
    });
  });

  // Structured recordings
  const structuredPerfs = type === 'comp'
    ? (compositionToPerf[id] || [])
    : (ragaToPerf[id] || []);

  structuredPerfs.forEach(p => {
    const primaryPerformer = p.performers.find(pf => pf.role === 'vocal') || p.performers[0];
    let artistLabel, nodeId, born, pNode;
    if (primaryPerformer && primaryPerformer.musician_id) {
      pNode = cy.getElementById(primaryPerformer.musician_id);
      artistLabel = (pNode && pNode.data('label')) || primaryPerformer.unmatched_name || p.title;
      nodeId = primaryPerformer.musician_id;
      born   = pNode ? pNode.data('born') : null;
    } else {
      pNode = null;
      artistLabel = (primaryPerformer && primaryPerformer.unmatched_name) || p.title;
      nodeId = null;
      born   = null;
    }
    rawRows.push({
      nodeId,
      artistLabel,
      born,
      lifespan: pNode ? pNode.data('lifespan') : null,
      color:    pNode ? pNode.data('color')    : null,
      shape:    pNode ? pNode.data('shape')    : null,
      track: {
        vid:            p.video_id,
        label:          p.display_title,
        year:           p.date ? parseInt(p.date) : null,
        offset_seconds: p.offset_seconds,
        composition_id: p.composition_id,
        recording_id:   p.recording_id,
        short_title:    p.short_title,
        concert_title:  p.title,
        timestamp:      p.timestamp || '00:00',
        raga_id:        p.raga_id || null,
        tala:           p.tala || null,
      },
      isStructured: true,
      perfKey: `${p.recording_id}::${p.session_index}::${p.performance_index}`,
      allPerformers: p.performers,
    });
  });

  // ── 2. Deduplicate by perfKey ──────────────────────────────────────────────
  const perfMap = new Map(); // perfKey → merged row

  rawRows.forEach(row => {
    if (!perfMap.has(row.perfKey)) {
      perfMap.set(row.perfKey, { ...row, coPerformers: [] });
    } else {
      const existing = perfMap.get(row.perfKey);
      const alreadyPresent = existing.nodeId === row.nodeId ||
        existing.coPerformers.some(cp => cp.nodeId === row.nodeId);
      if (!alreadyPresent) {
        existing.coPerformers.push({
          nodeId:      row.nodeId,
          artistLabel: row.artistLabel,
          color:       row.color,
          shape:       row.shape,
        });
      }
    }
  });

  // Placeholder labels that should never appear in the UI
  const UNKNOWN_LABELS = new Set(['Unknown', 'Unidentified artiste', '?']);

  // For structured recordings: populate coPerformers from performers[] directly
  // (more reliable than relying on node-iteration order)
  perfMap.forEach(row => {
    if (row.isStructured && row.allPerformers) {
      row.coPerformers = [];
      row.allPerformers.forEach(pf => {
        if (pf.musician_id === row.nodeId) return; // skip primary
        const coNode = pf.musician_id ? cy.getElementById(pf.musician_id) : null;
        const coLabel = (coNode && coNode.length) ? coNode.data('label') : (pf.unmatched_name || null);
        if (!coLabel || UNKNOWN_LABELS.has(coLabel)) return; // skip unknown/placeholder names
        row.coPerformers.push({
          nodeId:      pf.musician_id || null,
          artistLabel: coLabel,
          color:       (coNode && coNode.length) ? coNode.data('color') : null,
          shape:       (coNode && coNode.length) ? coNode.data('shape') : null,
        });
      });
    }
  });

  // ── 3. Sort deduplicated rows ──────────────────────────────────────────────
  const rows = [...perfMap.values()].sort((a, b) => {
    const ay = a.track.year, by = b.track.year;
    if (ay !== by) {
      if (ay == null) return 1;
      if (by == null) return -1;
      return ay - by;
    }
    const ab = a.born, bb = b.born;
    if (ab !== bb) {
      if (ab == null) return 1;
      if (bb == null) return -1;
      return ab - bb;
    }
    return a.artistLabel.localeCompare(b.artistLabel);
  });

  // ── 4. Render one <li> per deduplicated row ────────────────────────────────
  rows.forEach(row => {
    trailList.appendChild(buildTrailItem(row, type, id));
  });

  trail.style.display = rows.length > 0 ? 'block' : 'none';
}

// ── buildTrailItem: render one <li> for a deduplicated performance row ────────
function buildTrailItem(row, type, id) {
  const li = document.createElement('li');
  li.dataset.vid = row.track.vid;
  li.className   = playerRegistry.has(row.track.vid) ? 'playing' : '';
  // Row click → cross-navigate to the composition or raga (ADR-025 Change 0)
  li.addEventListener('click', () => {
    if (row.isStructured && row.track.composition_id) {
      triggerBaniSearch('comp', row.track.composition_id);
    } else {
      triggerBaniSearch(type, id);
    }
  });

  // ── Row 1: primary artist + lifespan; then one row per co-performer ─────────
  const headerDiv = document.createElement('div');
  headerDiv.className = 'trail-header';

  // Primary artist row (artist name + lifespan on same line)
  const primaryRow = document.createElement('div');
  primaryRow.className = 'trail-header-primary';
  primaryRow.appendChild(buildArtistSpan(row, true, type, id));
  const lifespanSpan = document.createElement('span');
  lifespanSpan.className = 'trail-lifespan';
  lifespanSpan.textContent = row.lifespan || (row.track.year ? String(row.track.year) : '');
  primaryRow.appendChild(lifespanSpan);
  headerDiv.appendChild(primaryRow);

  // One row per co-performer (indented below primary)
  if (row.coPerformers && row.coPerformers.length > 0) {
    row.coPerformers.forEach(cp => {
      const coRow = document.createElement('div');
      coRow.className = 'trail-coperformer-row';
      coRow.appendChild(buildArtistSpan(cp, false, type, id));
      headerDiv.appendChild(coRow);
    });
  }

  // ── Row 2: composition title + timestamp link ──────────────────────────────
  let compTitle = row.track.label;
  if (!row.isStructured && row.track.composition_id) {
    const comp = compositions.find(c => c.id === row.track.composition_id);
    if (comp) compTitle = comp.title;
  }

  const labelSpan = document.createElement('span');
  labelSpan.className = 'trail-label';
  labelSpan.textContent = compTitle;

  const offsetSecs = row.isStructured ? row.track.offset_seconds : 0;
  const linkA = document.createElement('a');
  linkA.className = 'trail-link';
  linkA.href = ytDirectUrl(row.track.vid, offsetSecs || undefined);
  linkA.target = '_blank';
  linkA.textContent = (offsetSecs > 0)
    ? `${formatTimestamp(offsetSecs)} \u2197`
    : `00:00 \u2197`;
  linkA.title = offsetSecs > 0 ? 'Open in YouTube at this timestamp' : 'Open in YouTube';
  linkA.addEventListener('click', e => e.stopPropagation());

  const row2Div = document.createElement('div');
  row2Div.className = 'trail-row2';
  row2Div.appendChild(labelSpan);
  row2Div.appendChild(linkA);

  // ▶ button → play only
  const trailPlayBtn = document.createElement('button');
  trailPlayBtn.className = 'rec-play-btn';
  trailPlayBtn.title = row.isStructured
    ? `Play from ${row.track.offset_seconds ? row.track.offset_seconds + 's' : 'start'}`
    : 'Play';
  trailPlayBtn.textContent = '▶';
  trailPlayBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (row.isStructured && row.track.recording_id) {
      // Assemble full concert track list from musicianToPerformances
      const allPerfs = Object.values(musicianToPerformances).flat();
      const concertPerfs = allPerfs.filter(sp => sp.recording_id === row.track.recording_id);
      const playerTracks = concertPerfs
        .slice()
        .sort((a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0))
        .map(sp => {
          const spRagaObj = sp.raga_id ? ragas.find(r => r.id === sp.raga_id) : null;
          return {
            offset_seconds: sp.offset_seconds || 0,
            display_title:  sp.display_title || '',
            raga_id:        sp.raga_id || null,
            raga_name:      spRagaObj ? spRagaObj.name : (sp.raga_id || ''),
            tala:           sp.tala || null,
            timestamp:      sp.timestamp || '00:00',
          };
        });
      const concertTitle = row.track.short_title || row.track.concert_title;
      openOrFocusPlayer(
        row.track.vid,
        row.track.label,
        row.artistLabel,
        row.track.offset_seconds || undefined,
        concertTitle,
        playerTracks
      );
    } else {
      openOrFocusPlayer(row.track.vid, row.track.label, row.artistLabel, undefined);
    }
  });
  row2Div.appendChild(trailPlayBtn);

  li.appendChild(headerDiv);
  li.appendChild(row2Div);
  return li;
}

// ── buildArtistSpan: render a clickable artist name with shape icon ────────────
function buildArtistSpan(artistRow, isPrimary, type, id) {
  const span = document.createElement('span');
  span.className = isPrimary
    ? 'trail-artist trail-artist-primary'
    : 'trail-artist trail-artist-co';

  if (artistRow.color || artistRow.shape) {
    const icon = document.createElement('span');
    icon.className = `trail-shape-icon ${artistRow.shape || 'ellipse'}`;
    if ((artistRow.shape || 'ellipse') === 'triangle') {
      icon.style.borderBottomColor = artistRow.color || 'var(--gray)';
    } else {
      icon.style.background = artistRow.color || 'var(--gray)';
    }
    span.appendChild(icon);
  }

  span.appendChild(document.createTextNode(artistRow.artistLabel));

  // Always stop propagation so clicking any artist name never opens the player.
  // Only call selectNode when the artist has a graph node.
  span.addEventListener('click', e => {
    e.stopPropagation();
    if (artistRow.nodeId) {
      cy.elements().removeClass('faded highlighted bani-match');
      applyBaniFilter(type, id);
      const n = cy.getElementById(artistRow.nodeId);
      if (n && n.length) selectNode(n);
    }
  });

  return span;
}

function clearBaniFilter() {
  activeBaniFilter = null;
  cy.elements().removeClass('faded highlighted bani-match');
  document.getElementById('bani-search-input').value = '';
  document.getElementById('trail-filter').style.display = 'none';
  document.getElementById('trail-filter').value = '';
  document.getElementById('listening-trail').style.display = 'none';
  document.getElementById('bani-subject-header').style.display = 'none';
  document.getElementById('bani-subject-aliases-row').style.display = 'none';
  document.getElementById('bani-subject-aliases-row').textContent = '';
  document.getElementById('bani-janyas-row').style.display = 'none';
  document.getElementById('bani-janyas-panel').style.display = 'none';
  document.getElementById('bani-janyas-list').innerHTML = '';
  document.getElementById('bani-janyas-filter').value = '';
  applyZoomLabels();
  // Mutual exclusion: clear chip filters when Bani Flow filter clears
  clearAllChipFilters();
}

/**
 * Programmatically trigger a Bani Flow search for a raga or composition.
 * Equivalent to the user selecting an item from the bani-search-dropdown.
 * @param {'raga'|'comp'} type
 * @param {string} id  — raga id or composition id
 */
function triggerBaniSearch(type, id) {
  const matchedNodeIds = type === 'comp'
    ? (compositionToNodes[id] || [])
    : (ragaToNodes[id] || []);
  const entity = type === 'raga'
    ? ragas.find(r => r.id === id)
    : compositions.find(c => c.id === id);
  const searchInput = document.getElementById('bani-search-input');
  if (searchInput && entity) {
    const label = entity.name || entity.title || id;
    const prefix = type === 'raga' ? '\u25c8 ' : '\u266a ';
    searchInput.value = prefix + label;
  }
  applyBaniFilter(type, id);
}

