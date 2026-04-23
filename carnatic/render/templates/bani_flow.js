// ── Bani Flow ─────────────────────────────────────────────────────────────────

// Build a node-id → born-year map for fallback sort
const nodeBorn = {};
cy.nodes().forEach(n => { nodeBorn[n.id()] = n.data('born'); });

// Format a tala string for display: snake_case → Title Case with spaces
// e.g. 'khanda_chapu' → 'Khanda Chapu', 'adi' → 'Adi'
function formatTala(tala) {
  if (!tala) return '';
  return tala.split('_').map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}

// Show a brief non-obtrusive notice when a composer/musician is not on the graph
let _toastTimer = null;
function showGraphAbsentToast(name) {
  const el = document.getElementById('graph-absent-toast');
  if (!el) return;
  el.textContent = name + ' is not on the Guru-Shishya graph yet';
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.classList.remove('visible'); }, 3000);
}

let activeBaniFilter = null; // { type: 'comp'|'raga'|'perf'|'yt', id: string }

function applyBaniFilter(type, id) {
  activeBaniFilter = { type, id };

  let matchedNodeIds;
  if (type === 'comp') {
    matchedNodeIds = compositionToNodes[id] || [];
  } else if (type === 'raga') {
    matchedNodeIds = ragaToNodes[id] || [];
  } else if (type === 'perf') {
    // Single structured performance: collect musician node IDs from its performers[]
    const perfRefs = perfToPerf[id] || [];
    const nodeSet = new Set();
    perfRefs.forEach(ref => {
      (ref.performers || []).forEach(pf => {
        if (pf.musician_id) nodeSet.add(pf.musician_id);
      });
    });
    matchedNodeIds = [...nodeSet];
  } else if (type === 'yt') {
    // YouTube-only entry: id = "vid::ragaId" — find nodes that have this vid in tracks[]
    const [ytVid] = id.split('::');
    const nodeSet = new Set();
    cy.nodes().forEach(n => {
      const tracks = n.data('tracks') || [];
      if (tracks.some(t => t.vid === ytVid)) nodeSet.add(n.id());
    });
    matchedNodeIds = [...nodeSet];
  } else {
    matchedNodeIds = [];
  }

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
  const subjectIcon   = document.getElementById('bani-subject-icon');

  subjectSub.innerHTML = '';
  subjectLink.style.display = 'none';
  subjectLink.href = '#';
  document.getElementById('bani-subject-aliases-row').style.display = 'none';
  document.getElementById('bani-subject-aliases-row').textContent = '';
  document.getElementById('bani-janyas-row').style.display = 'none';
  document.getElementById('bani-janyas-panel').style.display = 'none';
  document.getElementById('bani-janyas-list').innerHTML = '';
  document.getElementById('bani-janyas-filter').value = '';

  // Reset subject name chip styling from previous call
  subjectName.className = '';
  subjectIcon.style.display = '';

  if (type === 'comp') {
    const comp     = compositions.find(c => c.id === id);
    const raga     = comp ? ragas.find(r => r.id === comp.raga_id) : null;
    const composer = comp ? composers.find(c => c.id === comp.composer_id) : null;

    // Row 1: composition title styled as a .comp-chip — visually matches trail + right sidebar
    subjectName.className = 'comp-chip';
    subjectIcon.style.display = 'none';  // chip ::before provides the icon
    subjectName.textContent = comp ? comp.title : id;
    const compSrc = comp && comp.sources && comp.sources[0];
    if (compSrc) {
      subjectLink.href = compSrc.url;
      subjectLink.style.display = 'inline';
    }

    // Row 2: raga (linked) · tala · composer (linked to graph node if available)
    const parts = [];

    if (raga) {
      // Raga name → in-app navigation: summon raga into Bani Flow + raga wheel
      // Rendered as a .raga-chip badge — uniform with all other raga occurrences
      const ragaBtn = document.createElement('span');
      ragaBtn.className = 'raga-chip';
      ragaBtn.textContent = raga.name;
      ragaBtn.title = 'Explore ' + raga.name + ' in Bani Flow';
      ragaBtn.addEventListener('click', e => {
        e.stopPropagation();
        triggerBaniSearch('raga', raga.id);
      });
      parts.push(ragaBtn);
    }

    if (comp && comp.tala) {
      const talaSpan = document.createElement('span');
      talaSpan.className = 'trail-tala';
      talaSpan.textContent = formatTala(comp.tala);
      parts.push(talaSpan);
    }

    if (composer) {
      const eraId = composer.musician_node_id
        ? (cy.getElementById(composer.musician_node_id).data('era') || null)
        : null;
      const tint = THEME.eraTintCss(eraId);
      const composerChip = document.createElement('span');
      composerChip.className = 'composer-chip';
      composerChip.textContent = composer.name;
      composerChip.style.setProperty('--chip-era-bg', tint.bg);
      composerChip.style.setProperty('--chip-era-border', tint.border);
      if (composer.musician_node_id) {
        const n = cy.getElementById(composer.musician_node_id);
        if (n && n.length) {
          composerChip.className += ' chip-navigable';
          composerChip.title = composer.name + ' — Open Musician panel';
          composerChip.addEventListener('click', e => {
            e.stopPropagation();
            composerChip.classList.add('chip-tapped');
            setTimeout(() => composerChip.classList.remove('chip-tapped'), 200);
            if (typeof orientToNode === 'function' && typeof currentView !== 'undefined' && currentView === 'graph') {
              orientToNode(composer.musician_node_id);
            } else {
              selectNode(n);
            }
            if (typeof window.setPanelState === 'function') {
              setTimeout(() => window.setPanelState('MUSICIAN'), 50);
            }
          });
        } else {
          // musician_node_id set but not yet on the graph
          composerChip.title = composer.name;
          composerChip.addEventListener('click', e => {
            e.stopPropagation();
            showGraphAbsentToast(composer.name);
          });
        }
      } else {
        composerChip.title = composer.name;
      }
      parts.push(composerChip);
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

  } else if (type === 'perf') {
    // ── Single structured performance (from raga wheel click) ──────────────────
    // id = "recording_id::performance_index"
    const perfRefs = perfToPerf[id] || [];
    const ref = perfRefs[0] || null;

    // Row 1: performance display title
    subjectName.textContent = ref ? (ref.display_title || ref.title || id) : id;
    subjectName.title = '';
    // Link to YouTube at the offset timestamp
    if (ref && ref.video_id) {
      const offsetSecs = ref.offset_seconds || 0;
      subjectLink.href = `https://www.youtube.com/watch?v=${ref.video_id}` +
        (offsetSecs > 0 ? `&t=${offsetSecs}s` : '');
      subjectLink.style.display = 'inline';
    }

    // Row 2: raga (linked) · tala · concert
    const perfParts = [];
    if (ref && ref.raga_id) {
      const perfRaga = ragas.find(r => r.id === ref.raga_id);
      if (perfRaga) {
        const ragaBtn = document.createElement('span');
        ragaBtn.className = 'raga-chip';
        ragaBtn.textContent = perfRaga.name;
        ragaBtn.title = 'Explore ' + perfRaga.name + ' in Bani Flow';
        ragaBtn.addEventListener('click', e => {
          e.stopPropagation();
          triggerBaniSearch('raga', perfRaga.id);
        });
        perfParts.push(ragaBtn);
      }
    }
    if (ref && ref.tala) {
      const talaSpan = document.createElement('span');
      talaSpan.className = 'trail-tala';
      talaSpan.textContent = formatTala(ref.tala);
      perfParts.push(talaSpan);
    }
    if (ref && ref.short_title) {
      const concertSpan = document.createElement('span');
      concertSpan.textContent = ref.short_title;
      concertSpan.style.color = 'var(--fg3)';
      perfParts.push(concertSpan);
    }
    perfParts.forEach((part, i) => {
      subjectSub.appendChild(part);
      if (i < perfParts.length - 1) {
        const sep = document.createElement('span');
        sep.textContent = ' \u00b7 ';
        sep.style.color = 'var(--gray)';
        subjectSub.appendChild(sep);
      }
    });

  } else if (type === 'yt') {
    // ── YouTube-only entry (from raga wheel click) ─────────────────────────────
    // id = "vid::ragaId"
    const [ytVid, ytRagaId] = id.split('::');
    // Find the track label from any node that has this vid
    let ytLabel = '', ytRagaName = '';
    cy.nodes().forEach(n => {
      if (ytLabel) return;
      const tracks = n.data('tracks') || [];
      const t = tracks.find(tr => tr.vid === ytVid);
      if (t) ytLabel = t.label || '';
    });
    const ytRaga = ytRagaId ? ragas.find(r => r.id === ytRagaId) : null;
    ytRagaName = ytRaga ? ytRaga.name : (ytRagaId || '');

    // Row 1: short track title (strip raga/artist suffix after ' · ' or ' - ')
    const ytShort = ytLabel
      ? (ytLabel.indexOf(' \u00b7 ') > 0 ? ytLabel.slice(0, ytLabel.indexOf(' \u00b7 ')).trim()
        : ytLabel.indexOf(' - ') > 0 ? ytLabel.slice(0, ytLabel.indexOf(' - ')).trim()
        : ytLabel)
      : id;
    subjectName.textContent = ytShort;
    subjectName.title = ytLabel;  // full label as tooltip
    subjectLink.href = `https://www.youtube.com/watch?v=${ytVid}`;
    subjectLink.style.display = 'inline';

    // Row 2: raga (linked) · YouTube recording
    const ytParts = [];
    if (ytRaga) {
      const ytRagaBtn = document.createElement('span');
      ytRagaBtn.className = 'raga-chip';
      ytRagaBtn.textContent = ytRaga.name;
      ytRagaBtn.title = 'Explore ' + ytRaga.name + ' in Bani Flow';
      ytRagaBtn.addEventListener('click', e => {
        e.stopPropagation();
        triggerBaniSearch('raga', ytRaga.id);
      });
      ytParts.push(ytRagaBtn);
    }
    const ytBadge = document.createElement('span');
    ytBadge.textContent = 'YouTube recording';
    ytBadge.style.color = 'var(--fg3)';
    ytParts.push(ytBadge);
    ytParts.forEach((part, i) => {
      subjectSub.appendChild(part);
      if (i < ytParts.length - 1) {
        const sep = document.createElement('span');
        sep.textContent = ' \u00b7 ';
        sep.style.color = 'var(--gray)';
        subjectSub.appendChild(sep);
      }
    });

  } else {
    // ── Raga search (ADR-022) ───────────────────────────────────────────────────
    const raga = ragas.find(r => r.id === id);

    // Row 1: raga name styled as a .raga-chip — visually matches trail + right sidebar
    subjectName.className = 'raga-chip';
    subjectIcon.style.display = 'none';  // chip ::before provides the ◈ icon
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
      // "Janya of" label
      const janyaOfText = document.createElement('span');
      janyaOfText.textContent = 'Janya of\u00a0';
      janyaOfText.style.color = 'var(--fg-muted)';
      subjectSub.appendChild(janyaOfText);
      // Parent raga as a .raga-chip — uniform with all other raga occurrences
      const parentLink = document.createElement('span');
      parentLink.className = 'raga-chip';
      parentLink.textContent = parentName;
      parentLink.title = 'Explore ' + parentName + ' in Bani Flow';
      parentLink.addEventListener('click', e => {
        e.stopPropagation();
        triggerBaniSearch('raga', raga.parent_raga);
      });
      subjectSub.appendChild(parentLink);
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
        // Toggle label styled like a raga category header: ◈ prefix signals "ragas inside"
        janyasToggle.textContent = '\u25b6\u00a0\u25c8 Janyas';
        janyasRow.style.display = 'block';

        // Render filtered list of janya links — each as a .raga-chip
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
              const chip = document.createElement('span');
              chip.className = 'raga-chip';
              chip.style.display = 'inline-flex';
              chip.style.margin = '2px 3px';
              chip.textContent = j.name || j.id;
              chip.title = 'Explore ' + (j.name || j.id) + ' in Bani Flow';
              chip.addEventListener('click', e => {
                e.stopPropagation();
                triggerBaniSearch('raga', j.id);
              });
              janyasList.appendChild(chip);
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
          janyasToggle.textContent = open ? '\u25b6\u00a0\u25c8 Janyas' : '\u25bc\u00a0\u25c8 Janyas';
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

  // ADR-081: render lecdem strip above the trail (raga/comp subjects only)
  _renderBaniFlowLecdemStrip(type, id);

  // ── 1. Collect raw rows ────────────────────────────────────────────────────

  // Legacy youtube[] entries from matched musician nodes.
  // Skipped for 'perf' type (structured recordings only).
  // For 'yt' type: id = "vid::ragaId" — match only the specific vid.
  const rawRows = [];
  if (type !== 'perf') {
    const ytVidFilter = type === 'yt' ? id.split('::')[0] : null;
    matchedNodeIds.forEach(nid => {
      const n = cy.getElementById(nid);
      if (!n) return;
      const d = n.data();
      d.tracks.forEach(t => {
        let matches;
        if (type === 'comp') {
          matches = t.composition_id === id;
        } else if (type === 'yt') {
          // Match only the specific YouTube video id
          matches = t.vid === ytVidFilter;
        } else {
          // 'raga': match by raga_id directly or via composition
          matches = t.raga_id === id || (t.composition_id && (() => {
            const c = compositions.find(x => x.id === t.composition_id);
            return c && c.raga_id === id;
          })());
        }
        if (matches) {
          const vid = t.vid || '';
          const offset = t.offset_seconds || 0;
          // ADR-070: when this track is cross-linked from a host (i.e. the
          // current node is an accompanist on someone else's recording), use
          // the host's identity for the primary row so the lead is never
          // displaced. The accompanist still surfaces via co-performer chips
          // built from allPerformers below.
          let primaryNid = nid;
          let primaryD   = d;
          if (t.host_id && t.host_id !== nid) {
            const hostNode = cy.getElementById(t.host_id);
            if (hostNode && hostNode.length) {
              primaryNid = t.host_id;
              primaryD   = hostNode.data();
            }
          }
          rawRows.push({
            nodeId: primaryNid, artistLabel: primaryD.label, born: primaryD.born,
            lifespan: primaryD.lifespan, color: primaryD.color, shape: primaryD.shape,
            track: t, isStructured: false,
            perfKey: `${vid}::${offset}`,
            // ADR-070: legacy youtube entries may carry performers[] for
            // accompanists; use it for co-performer chips just like
            // structured-recording rows.
            allPerformers: (t.performers && t.performers.length) ? t.performers : null,
          });
        }
      });
    });
  }

  // Structured recordings.
  // 'perf': use perfToPerf[id] — exactly the one PerformanceRef for this track.
  // 'yt':   no structured perfs — youtube-only entries have no session data.
  const structuredPerfs = type === 'comp'
    ? (compositionToPerf[id] || [])
    : type === 'perf'
      ? (perfToPerf[id] || [])
      : type === 'yt'
        ? []
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
        version:        p.version || null,
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
  // (more reliable than relying on node-iteration order).
  // ADR-070: legacy youtube entries with a performers[] array also opt in.
  perfMap.forEach(row => {
    if (row.allPerformers) {
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

  // ── 4. Assign ordinal version labels for nodeId::composition_id groups ─────
  // When the same musician has multiple recordings of the same composition,
  // each entry gets a version label. If `track.version` is set, use it verbatim.
  // Otherwise assign a 1-based ordinal: v1, v2, v3, … in trail order.
  const compVersionCount = new Map(); // "nodeId::composition_id" → count
  rows.forEach(row => {
    const cid = row.track.composition_id;
    if (!cid || !row.nodeId) return;
    const key = `${row.nodeId}::${cid}`;
    compVersionCount.set(key, (compVersionCount.get(key) || 0) + 1);
  });
  const multiVersionKeys = new Set(
    [...compVersionCount.entries()].filter(([, n]) => n > 1).map(([k]) => k)
  );

  // Assign ordinal counters per group (in sorted trail order)
  const compVersionOrdinal = new Map(); // "nodeId::composition_id" → next ordinal
  rows.forEach(row => {
    const cid = row.track.composition_id;
    if (!cid || !row.nodeId) return;
    const key = `${row.nodeId}::${cid}`;
    if (!multiVersionKeys.has(key)) return;
    const n = (compVersionOrdinal.get(key) || 0) + 1;
    compVersionOrdinal.set(key, n);
    // Attach resolved version label directly onto the track object for this row
    row.track._versionLabel = row.track.version || `v${n}`;
  });

  // ── 5. Render trail — tree for raga/comp, flat list for perf/yt ──────────
  if (type === 'raga') {
    buildTreeRaga(rows, trailList, multiVersionKeys);
  } else if (type === 'comp') {
    buildTreeComp(rows, trailList, multiVersionKeys);
  } else {
    rows.forEach(row => {
      trailList.appendChild(buildTrailItem(row, type, id, multiVersionKeys));
    });
  }

  trail.style.display = rows.length > 0 ? 'block' : 'none';
}

// ── buildTrailItem: render one <li> for a deduplicated performance row ────────
function buildTrailItem(row, type, id, multiVersionKeys) {
  const li = document.createElement('li');
  li.dataset.vid = row.track.vid;
  li.className   = playerRegistry.has(row.track.vid) ? 'playing' : '';
  // ADR-052: the container li is not a click target; navigation lives
  // exclusively in the embedded chips (.musician-chip, .comp-chip, .raga-chip).

  // ── Row 1: primary artist + lifespan; then one row per co-performer ─────────
  const headerDiv = document.createElement('div');
  headerDiv.className = 'trail-header';

  // Primary artist row (artist name + lifespan on same line)
  // In comp mode: era colouring already communicates the period; lifespan is redundant.
  const primaryRow = document.createElement('div');
  primaryRow.className = 'trail-header-primary';
  primaryRow.appendChild(buildArtistSpan(row, true, type, id));
  if (type !== 'comp') {
    const lifespanSpan = document.createElement('span');
    lifespanSpan.className = 'trail-lifespan';
    lifespanSpan.textContent = row.lifespan || (row.track.year ? String(row.track.year) : '');
    primaryRow.appendChild(lifespanSpan);
  }
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

  // ── Row 2: chips (raga + composition) + timestamp link ────────────────────
  // Resolve composition and raga for this trail entry.
  const trailComp = row.track.composition_id
    ? compositions.find(c => c.id === row.track.composition_id) || null
    : null;
  const trailRagaId = row.track.raga_id
    || (trailComp ? trailComp.raga_id : null)
    || null;
  const trailRaga = trailRagaId ? ragas.find(r => r.id === trailRagaId) || null : null;

  const row2Div = document.createElement('div');
  row2Div.className = 'trail-row2';
  const chipsDiv = document.createElement('div');
  chipsDiv.className = 'trail-chips';

  // Chip suppression rules — avoid redundancy and overflow:
  // • comp filter: subject header already names the composition + its raga →
  //   suppress both chips (every row is that comp; raga is in the header)
  // • raga filter: subject header names the raga →
  //   suppress raga chip; show comp chip for navigation
  // • perf / yt filter: show both chips (full context useful)
  const showCompChip = trailComp && type !== 'comp';
  const showRagaChip = trailRaga && type !== 'comp' && !(type === 'raga' && trailRagaId === id);

  // Composition chip — navigates to composition filter
  if (showCompChip) {
    const compChip = document.createElement('span');
    compChip.className = 'comp-chip';
    compChip.textContent = trailComp.title;
    compChip.title = 'Explore ' + trailComp.title + ' in Bani Flow';
    compChip.addEventListener('click', e => {
      e.stopPropagation();
      triggerBaniSearch('comp', trailComp.id);
    });
    chipsDiv.appendChild(compChip);
  }

  // Raga chip — navigates to raga filter
  if (showRagaChip) {
    const ragaChip = document.createElement('span');
    ragaChip.className = 'raga-chip';
    ragaChip.textContent = trailRaga.name;
    ragaChip.title = 'Explore ' + trailRaga.name + ' in Bani Flow';
    ragaChip.addEventListener('click', e => {
      e.stopPropagation();
      triggerBaniSearch('raga', trailRagaId);
    });
    chipsDiv.appendChild(ragaChip);
  }

  // Composer chip — shown in non-comp contexts (comp header already shows composer)
  const trailComposerChip = (type !== 'comp' && typeof buildComposerChip === 'function')
    ? buildComposerChip(row.track.composition_id)
    : null;
  if (trailComposerChip) chipsDiv.appendChild(trailComposerChip);

  // Fallback label — shown only when no chip at all is shown
  if (!showCompChip && !showRagaChip && !trailComposerChip) {
    let fallbackLabel = row.track.label;
    if (!row.isStructured && row.track.composition_id) {
      const comp = compositions.find(c => c.id === row.track.composition_id);
      if (comp) fallbackLabel = comp.title;
    }
    const labelSpan = document.createElement('span');
    labelSpan.className = 'trail-label';
    labelSpan.textContent = fallbackLabel;
    chipsDiv.appendChild(labelSpan);
  }

  // Version badge — shown only when this nodeId::composition_id has multiple entries.
  // _versionLabel is pre-computed in buildListeningTrail: explicit version string or v1/v2/…
  const versionKey = row.nodeId && row.track.composition_id
    ? `${row.nodeId}::${row.track.composition_id}`
    : null;
  const showVersion = versionKey && multiVersionKeys && multiVersionKeys.has(versionKey)
    && row.track._versionLabel;
  if (showVersion) {
    const versionBadge = document.createElement('span');
    versionBadge.className = 'trail-version';
    versionBadge.textContent = row.track._versionLabel;
    versionBadge.title = 'Version: ' + row.track._versionLabel;
    chipsDiv.appendChild(versionBadge);
  }

  row2Div.appendChild(chipsDiv);

  // ▶ button — ADR-053: dashed border for concert entries, solid for direct
  const isConcertEntry = !!(row.isStructured && row.track.recording_id);
  const trailPlayBtn = document.createElement('button');
  const concertTitle = row.track.short_title || row.track.concert_title || null;
  trailPlayBtn.className = isConcertEntry ? 'rec-play-btn play-btn-concert' : 'rec-play-btn play-btn-direct';
  trailPlayBtn.title = isConcertEntry && concertTitle ? `Part of: ${concertTitle}` : 'Play';
  trailPlayBtn.textContent = '▶';
  trailPlayBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (row.isStructured && row.track.recording_id) {
      // Assemble full concert track list from musicianToPerformances.
      // Deduplicate by session_index::performance_index — each ref is stored
      // once per performer, so flattening all musician lists multiplies entries
      // by the number of performers with a musician_id in that concert.
      const allPerfs = Object.values(musicianToPerformances).flat();
      const concertPerfsMap = new Map();
      allPerfs.forEach(sp => {
        if (sp.recording_id !== row.track.recording_id) return;
        const key = `${sp.session_index}::${sp.performance_index}`;
        if (!concertPerfsMap.has(key)) concertPerfsMap.set(key, sp);
      });
      const concertPerfs = [...concertPerfsMap.values()];
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
            composition_id: sp.composition_id || null,
          };
        });
      const concertTitle = row.track.short_title || row.track.concert_title;
      openOrFocusPlayer(
        row.track.vid,
        row.track.label,
        row.artistLabel,
        row.track.offset_seconds || undefined,
        concertTitle,
        playerTracks,
        {
          nodeId:        row.nodeId || null,
          ragaId:        row.track.raga_id || null,
          compositionId: row.track.composition_id || null,
        }
      );
    } else {
      openOrFocusPlayer(
        row.track.vid,
        row.track.label,
        row.artistLabel,
        undefined,
        undefined,
        undefined,
        {
          nodeId:        row.nodeId || null,
          ragaId:        row.track.raga_id || null,
          compositionId: row.track.composition_id || null,
        }
      );
    }
  });
  const actsDiv = document.createElement('div');
  actsDiv.className = 'trail-acts';
  actsDiv.appendChild(trailPlayBtn);
  actsDiv.appendChild(buildYtLink(row.track.vid, row.track.offset_seconds || 0));
  row2Div.appendChild(actsDiv);

  li.appendChild(headerDiv);
  li.appendChild(row2Div);
  return li;
}

// ── ADR-061: tree-structured trail helpers ────────────────────────────────────

// _buildPlayActsDiv: shared ▶ + ↗ .trail-acts div for both flat and tree leaves.
function _buildPlayActsDiv(row) {
  const isConcertEntry = !!(row.isStructured && row.track.recording_id);
  const concertTitle = row.track.short_title || row.track.concert_title || null;
  const playBtn = document.createElement('button');
  playBtn.className = isConcertEntry ? 'rec-play-btn play-btn-concert' : 'rec-play-btn play-btn-direct';
  playBtn.title = isConcertEntry && concertTitle ? 'Part of: ' + concertTitle : 'Play';
  playBtn.textContent = '\u25b6';
  playBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (row.isStructured && row.track.recording_id) {
      const allPerfs = Object.values(musicianToPerformances).flat();
      const concertPerfsMap = new Map();
      allPerfs.forEach(function(sp) {
        if (sp.recording_id !== row.track.recording_id) return;
        const key = sp.session_index + '::' + sp.performance_index;
        if (!concertPerfsMap.has(key)) concertPerfsMap.set(key, sp);
      });
      const concertPerfs = [...concertPerfsMap.values()];
      const playerTracks = concertPerfs.slice()
        .sort(function(a, b) { return (a.offset_seconds || 0) - (b.offset_seconds || 0); })
        .map(function(sp) {
          const spRagaObj = sp.raga_id ? ragas.find(function(r) { return r.id === sp.raga_id; }) : null;
          return {
            offset_seconds: sp.offset_seconds || 0,
            display_title:  sp.display_title || '',
            raga_id:        sp.raga_id || null,
            raga_name:      spRagaObj ? spRagaObj.name : (sp.raga_id || ''),
            tala:           sp.tala || null,
            timestamp:      sp.timestamp || '00:00',
            composition_id: sp.composition_id || null,
          };
        });
      openOrFocusPlayer(
        row.track.vid, row.track.label, row.artistLabel,
        row.track.offset_seconds || undefined,
        row.track.short_title || row.track.concert_title,
        playerTracks,
        { nodeId: row.nodeId || null, ragaId: row.track.raga_id || null, compositionId: row.track.composition_id || null }
      );
    } else {
      openOrFocusPlayer(
        row.track.vid, row.track.label, row.artistLabel,
        undefined, undefined, undefined,
        { nodeId: row.nodeId || null, ragaId: row.track.raga_id || null, compositionId: row.track.composition_id || null }
      );
    }
  });
  const actsDiv = document.createElement('div');
  actsDiv.className = 'trail-acts';
  actsDiv.appendChild(playBtn);
  actsDiv.appendChild(buildYtLink(row.track.vid, row.track.offset_seconds || 0));
  return actsDiv;
}

// buildTreeLeaf: one <li class="tree-leaf"> for a performance row inside a group.
// suppressArtist=true  → comp-view leaf (artist shown in group header; omit here)
// suppressArtist=false → raga-view leaf (artist shown here)
function buildTreeLeaf(row, multiVersionKeys, suppressArtist) {
  const li = document.createElement('li');
  li.className = 'tree-leaf';
  li.dataset.vid = row.track.vid;
  if (playerRegistry.has(row.track.vid)) li.classList.add('playing');

  // ── Primary row: [artist chip?] [version badge?] [▶+↗ right] ─────────────
  // Labels (long text) are on their own sub-row below — not inline here.
  const primaryDiv = document.createElement('div');
  primaryDiv.className = 'tree-leaf-primary';

  if (!suppressArtist) {
    primaryDiv.appendChild(buildArtistSpan(row, true, 'raga', null));
  }

  // Version badge stays inline — it's short
  const versionKey = row.nodeId && row.track.composition_id
    ? row.nodeId + '::' + row.track.composition_id : null;
  const showVersion = versionKey && multiVersionKeys && multiVersionKeys.has(versionKey)
    && row.track._versionLabel;
  if (showVersion) {
    const versionBadge = document.createElement('span');
    versionBadge.className = 'trail-version';
    versionBadge.textContent = row.track._versionLabel;
    versionBadge.title = 'Version: ' + row.track._versionLabel;
    primaryDiv.appendChild(versionBadge);
  }

  // ▶ + ↗ on the same line as the artist chip, pushed to far right
  const actsDiv = _buildPlayActsDiv(row);
  actsDiv.style.marginLeft = 'auto';
  actsDiv.style.flexShrink = '0';
  primaryDiv.appendChild(actsDiv);

  li.appendChild(primaryDiv);

  // ── Context label: own sub-row, de-emphasised ─────────────────────────────
  let labelText = '';
  if (!suppressArtist && !row.track.composition_id && row.track.label) {
    labelText = row.track.label;
  } else if (suppressArtist) {
    labelText = row.track.year
      ? String(row.track.year)
      : (row.track.short_title || row.track.concert_title || row.track.label || '');
  }
  if (labelText) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'tree-leaf-label';
    labelDiv.textContent = labelText;
    li.appendChild(labelDiv);
  }

  // ── Co-performers: tag cloud below (no commas) ────────────────────────────
  if (row.coPerformers && row.coPerformers.length > 0) {
    const coDiv = document.createElement('div');
    coDiv.className = 'tree-leaf-coperformers';
    row.coPerformers.forEach(function(cp) {
      coDiv.appendChild(buildArtistSpan(cp, false, 'raga', null));
    });
    li.appendChild(coDiv);
  }

  return li;
}

// buildTreeRaga: raga-view trail — group rows by composition, one collapsible
// .tree-group per composition; leaves show artist + version badge + ▶ + ↗.
function buildTreeRaga(rows, trailList, multiVersionKeys) {
  // Group by composition_id (null → 'no-comp' sentinel)
  const groups = new Map();
  rows.forEach(function(row) {
    const cid = row.track.composition_id || 'no-comp';
    if (!groups.has(cid)) {
      const comp = cid !== 'no-comp' ? (compositions.find(function(c) { return c.id === cid; }) || null) : null;
      groups.set(cid, { comp: comp, cid: cid, rows: [] });
    }
    groups.get(cid).rows.push(row);
  });

  // Sort by earliest born/year in group; null-comp bucket last
  const sortedGroups = [...groups.values()].sort(function(a, b) {
    if (a.cid === 'no-comp') return 1;
    if (b.cid === 'no-comp') return -1;
    const aBorn = Math.min.apply(null, a.rows.map(function(r) { return r.born || r.track.year || 9999; }));
    const bBorn = Math.min.apply(null, b.rows.map(function(r) { return r.born || r.track.year || 9999; }));
    return aBorn - bBorn;
  });

  sortedGroups.forEach(function(group, idx) {
    const isSingle = group.rows.length === 1;

    const li = document.createElement('li');
    li.className = 'tree-group';
    // Open all groups by default — discoverability over chrome economy.
    // Users can still toggle to collapse via the chevron.
    li.classList.add('tree-group-open');
    if (isSingle) li.classList.add('tree-group-single');

    // ── Group header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'tree-group-header';

    if (group.comp) {
      // Comp title + composer chip stacked vertically; each navigates independently
      const textDiv = document.createElement('div');
      textDiv.className = 'tree-header-text';
      const compChip = document.createElement('span');
      compChip.className = 'comp-chip';
      compChip.textContent = group.comp.title;
      compChip.title = 'Explore ' + group.comp.title + ' in Bani Flow';
      compChip.addEventListener('click', function(e) {
        e.stopPropagation();
        triggerBaniSearch('comp', group.cid);
      });
      textDiv.appendChild(compChip);
      if (typeof buildComposerChip === 'function') {
        const cc = buildComposerChip(group.cid);
        if (cc) textDiv.appendChild(cc);
      }
      header.appendChild(textDiv);
    } else {
      const label = document.createElement('span');
      label.className = 'trail-label';
      label.textContent = 'Other recordings';
      header.appendChild(label);
    }

    // For multi-child groups the whole header bar is the toggle target.
    // Chip clicks (comp chip, composer chip) already stopPropagation independently.
    if (!isSingle) {
      const chevron = document.createElement('span');
      chevron.className = 'tree-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      header.appendChild(chevron);
      header.style.cursor = 'pointer';
      header.addEventListener('click', function() {
        li.classList.toggle('tree-group-open');
      });
    }

    li.appendChild(header);

    // ── Children ──────────────────────────────────────────────────────────────
    const childrenUl = document.createElement('ul');
    childrenUl.className = 'tree-children';
    group.rows.forEach(function(row) {
      childrenUl.appendChild(buildTreeLeaf(row, multiVersionKeys, false));
    });
    li.appendChild(childrenUl);

    trailList.appendChild(li);
  });
}

// buildTreeComp: comp-view trail — group rows by primary artist, one collapsible
// .tree-group per artist; multi-version artists have version leaves; single-version
// artists have inline ▶ + ↗ in header (no child list).
function buildTreeComp(rows, trailList, multiVersionKeys) {
  // Group by nodeId (null → 'no-node' sentinel)
  const groups = new Map();
  rows.forEach(function(row) {
    const key = row.nodeId || 'no-node';
    if (!groups.has(key)) {
      groups.set(key, {
        nodeId:      row.nodeId,
        artistLabel: row.artistLabel,
        born:        row.born,
        lifespan:    row.lifespan,
        color:       row.color,
        shape:       row.shape,
        rows:        [],
      });
    }
    groups.get(key).rows.push(row);
  });

  // Sort by born; no-node last
  const sortedGroups = [...groups.values()].sort(function(a, b) {
    if (!a.nodeId) return 1;
    if (!b.nodeId) return -1;
    const ab = a.born, bb = b.born;
    if (ab !== bb) {
      if (ab == null) return 1;
      if (bb == null) return -1;
      return ab - bb;
    }
    return a.artistLabel.localeCompare(b.artistLabel);
  });

  sortedGroups.forEach(function(group, idx) {
    const isSingle = group.rows.length === 1;

    const li = document.createElement('li');
    li.className = 'tree-group';
    // Open all groups by default — discoverability over chrome economy.
    // Users can still toggle to collapse via the chevron.
    li.classList.add('tree-group-open');
    if (isSingle) li.classList.add('tree-group-single');

    // ── Group header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'tree-group-header';

    // Musician chip (era-tinted); no lifespan — era colour is the proxy
    header.appendChild(buildArtistSpan(group, true, 'comp', null));

    if (isSingle) {
      // Single-version: inline ▶ + ↗ pushed to the right
      const actsDiv = _buildPlayActsDiv(group.rows[0]);
      actsDiv.style.marginLeft = 'auto';
      header.appendChild(actsDiv);
    } else {
      // Multi-version: whole header bar toggles; artist chip stopPropagation handles its own click
      const chevron = document.createElement('span');
      chevron.className = 'tree-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      header.appendChild(chevron);
      header.style.cursor = 'pointer';
      header.addEventListener('click', function() {
        li.classList.toggle('tree-group-open');
      });
    }

    li.appendChild(header);

    // ADR-070: when a single-version row carries accompanists, render them
    // directly under the header (multi-version path renders them per-leaf).
    if (isSingle && group.rows[0].coPerformers && group.rows[0].coPerformers.length > 0) {
      const coDiv = document.createElement('div');
      coDiv.className = 'tree-leaf-coperformers';
      group.rows[0].coPerformers.forEach(function(cp) {
        coDiv.appendChild(buildArtistSpan(cp, false, 'comp', null));
      });
      li.appendChild(coDiv);
    }

    // ── Children (multi-version only) ─────────────────────────────────────────
    if (!isSingle) {
      const childrenUl = document.createElement('ul');
      childrenUl.className = 'tree-children';
      group.rows.forEach(function(row) {
        childrenUl.appendChild(buildTreeLeaf(row, multiVersionKeys, true));
      });
      li.appendChild(childrenUl);
    }

    trailList.appendChild(li);
  });
}

// ── buildArtistSpan: render a clickable era-tinted musician chip (ADR-054) ─────
function buildArtistSpan(artistRow, isPrimary, type, id) {
  const span = document.createElement('span');

  // Derive era from the Cytoscape node data; fall back to null (neutral tint).
  const eraId = artistRow.nodeId
    ? (cy.getElementById(artistRow.nodeId).data('era') || null)
    : null;
  const tint = THEME.eraTintCss(eraId);
  span.style.setProperty('--chip-era-bg', tint.bg);
  span.style.setProperty('--chip-era-border', tint.border);

  // Primary performer → full-size chip; co-performer → secondary (smaller, italic)
  span.className = isPrimary ? 'musician-chip' : 'musician-chip chip-secondary';

  // ADR-069: instrument badge — resolve from Cytoscape node data when available
  if (artistRow.nodeId) {
    const instrKey = cy.getElementById(artistRow.nodeId).data('instrument');
    if (instrKey && typeof makeInstrBadge === 'function') {
      span.appendChild(makeInstrBadge(instrKey, isPrimary ? 13 : 11));
    }
  }

  span.appendChild(document.createTextNode(artistRow.artistLabel));

  span.addEventListener('click', e => {
    e.stopPropagation();
    // ADR-052: brief tap-flash feedback
    span.classList.add('chip-tapped');
    setTimeout(() => span.classList.remove('chip-tapped'), 200);
    if (artistRow.nodeId) {
      const n = cy.getElementById(artistRow.nodeId);
      if (n && n.length) {
        // Zoom + centre on the musician in graph view; fall back to highlight-only when wheel is active
        if (typeof orientToNode === 'function' && typeof currentView !== 'undefined' && currentView === 'graph') {
          orientToNode(artistRow.nodeId);
        } else {
          selectNode(n);
        }
        if (typeof window.setPanelState === 'function') {
          setTimeout(function () { window.setPanelState('MUSICIAN'); }, 50);
        }
      }
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
  const _bfStrip = document.getElementById('bani-lecdem-strip');
  if (_bfStrip) { _bfStrip.style.display = 'none'; _bfStrip.innerHTML = ''; }
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
 * Programmatically trigger a Bani Flow search for a raga, composition,
 * single structured performance, or YouTube-only recording.
 * Equivalent to the user selecting an item from the bani-search-dropdown.
 * @param {'raga'|'comp'|'perf'|'yt'} type
 * @param {string} id
 *   - 'raga': raga id
 *   - 'comp': composition id
 *   - 'perf': "recording_id::performance_index"
 *   - 'yt':   "vid::ragaId"
 */
function triggerBaniSearch(type, id) {
  const searchInput = document.getElementById('bani-search-input');
  if (type === 'perf') {
    // Single structured performance — label from perfToPerf lookup
    const perfRefs = perfToPerf[id] || [];
    const ref = perfRefs[0] || null;
    if (searchInput && ref) {
      searchInput.value = '\u25b6 ' + (ref.display_title || ref.title || id);
    }
  } else if (type === 'yt') {
    // YouTube-only entry — derive short title from track label
    const ytVid = id.split('::')[0];
    let ytLabel = '';
    cy.nodes().forEach(n => {
      if (ytLabel) return;
      const tracks = n.data('tracks') || [];
      const t = tracks.find(tr => tr.vid === ytVid);
      if (t) ytLabel = t.label || '';
    });
    const ytShort = ytLabel
      ? (ytLabel.indexOf(' \u00b7 ') > 0 ? ytLabel.slice(0, ytLabel.indexOf(' \u00b7 ')).trim()
        : ytLabel.indexOf(' - ') > 0 ? ytLabel.slice(0, ytLabel.indexOf(' - ')).trim()
        : ytLabel)
      : id;
    if (searchInput) searchInput.value = '\u25b6 ' + ytShort;
  } else {
    const entity = type === 'raga'
      ? ragas.find(r => r.id === id)
      : compositions.find(c => c.id === id);
    if (searchInput && entity) {
      const label = entity.name || entity.title || id;
      const prefix = type === 'raga' ? '\u25c8 ' : '\u266a ';
      searchInput.value = prefix + label;
    }
  }
  applyBaniFilter(type, id);

  // ADR-042: open the Bani Flow (left) drawer on mobile so the user sees
  // the trail that was just populated.  Mutual exclusion is handled inside
  // setPanelState — the right drawer closes automatically.
  //
  // Deferred by 50 ms: on mobile, browsers fire a native (isTrusted) click
  // event after pointerup even when pointerdown called preventDefault().  If
  // we open the drawer synchronously the scrim becomes visible before that
  // native click is dispatched, so the click lands on the scrim and
  // immediately closes the panel with setPanelState('IDLE').
  // The 50 ms delay lets the native click resolve against the pre-open DOM.
  // ADR-046: open Bani Flow (left) drawer on all screen widths
  if (typeof window.setPanelState === 'function') {
    setTimeout(function () { window.setPanelState('TRAIL'); }, 50);
  }

  // When a raga or composition is selected from the bani-flow or musician
  // panels, orient the raga wheel — expand the mela and animate the viewport
  // to centre on it (only if the raga wheel is the active view).
  //
  // Guard: _wheelOriginatedTrigger is set true only when triggerBaniSearch is
  // called from a comp/janya/mela click *inside* the raga wheel itself.
  // In that case we must NOT call orientRagaWheel — the wheel already knows
  // where it is, and re-entering would trigger a full drawRagaWheel() redraw
  // that undoes the expansion the user just triggered.
  if ((type === 'raga' || type === 'comp') &&
      typeof orientRagaWheel === 'function' &&
      !window._wheelOriginatedTrigger) {
    orientRagaWheel(type, id);
  }
}

// ── ADR-081: Lecdem strip for the Bani Flow panel ────────────────────────────
// Populates #bani-lecdem-strip with lecdems whose subjects include the current
// raga or composition. Hidden (empty-state silence) when no lecdems exist or
// when the subject is a musician / perf / yt entry.
//
// Discoverability invariant (ADR-081 §6): lecdems reach the user only through
// this strip and the musician panel (ADR-080) — never through global search or
// topbar filters.
function _renderBaniFlowLecdemStrip(type, id) {
  const section = document.getElementById('bani-lecdem-strip');
  if (!section) return;
  section.innerHTML = '';
  section.style.display = 'none';

  // §1: only raga and composition subjects get a strip
  if (type !== 'raga' && type !== 'comp') return;

  const refs = type === 'raga'
    ? ((typeof lecdemsAboutRaga        !== 'undefined' && lecdemsAboutRaga[id])        || [])
    : ((typeof lecdemsAboutComposition !== 'undefined' && lecdemsAboutComposition[id]) || []);

  if (!refs || refs.length === 0) return;

  // §4: sorted alphabetically by lecturer label
  const sorted = refs.slice().sort(function(a, b) {
    return (a.lecturer_label || '').localeCompare(b.lecturer_label || '');
  });

  // §2: header text — "Lecdems on {subject name}"
  let subjectName;
  if (type === 'raga') {
    const raga = ragas.find(function(r) { return r.id === id; });
    subjectName = raga ? raga.name : id;
  } else {
    const comp = compositions.find(function(c) { return c.id === id; });
    subjectName = comp ? comp.title : id;
  }
  const hdr = document.createElement('div');
  hdr.className = 'lecdem-section-header';
  hdr.textContent = 'Lecdems on ' + subjectName;
  section.appendChild(hdr);

  // §3: one row per lecdem ref
  const list = document.createElement('ul');
  list.className = 'lecdem-list';

  sorted.forEach(function(ref) {
    const li = document.createElement('li');
    li.className = 'lecdem-row';

    // Lecdem chip — opens the media player (ADR-079)
    const chip = (typeof buildLecdemChip === 'function') ? buildLecdemChip(ref) : null;
    if (chip) li.appendChild(chip);

    // §5: lecturer attribution — clickable → opens musician panel + pushes history
    if (ref.lecturer_label) {
      const bySpan = document.createElement('span');
      bySpan.className = 'lecdem-by';
      bySpan.textContent = '\u2014 ' + ref.lecturer_label;
      bySpan.title = 'Open ' + ref.lecturer_label + '\u2019s panel';
      bySpan.addEventListener('click', function(e) {
        e.stopPropagation();
        if (ref.lecturer_id) {
          const node = cy.getElementById(ref.lecturer_id);
          if (node && node.length && typeof selectNode === 'function') {
            selectNode(node);
            if (typeof window.setPanelState === 'function') {
              setTimeout(function() { window.setPanelState('MUSICIAN'); }, 50);
            }
          }
        }
      });
      li.appendChild(bySpan);
    }

    // Other subject chips — all subjects except the current trail subject (ADR-081 §3)
    const subjectChips = _buildBaniFlowLecdemSubjectChips(ref.subjects, type, id);
    if (subjectChips.length > 0) {
      const wrap = document.createElement('span');
      wrap.className = 'lecdem-subjects';
      subjectChips.forEach(function(c) { wrap.appendChild(c); });
      li.appendChild(wrap);
    }

    list.appendChild(li);
  });

  section.appendChild(list);
  section.style.display = 'block';
}

// Build subject cross-link chips for a strip row, excluding the current trail
// subject (excludeType + excludeId). Returns an array of chip elements.
// §5: clicking a raga/comp chip navigates to that subject in Bani Flow;
//     clicking a musician chip opens the target's musician panel.
function _buildBaniFlowLecdemSubjectChips(subjects, excludeType, excludeId) {
  if (!subjects) return [];
  const chips = [];
  const ragaIds     = Array.isArray(subjects.raga_ids)        ? subjects.raga_ids        : [];
  const compIds     = Array.isArray(subjects.composition_ids) ? subjects.composition_ids : [];
  const musicianIds = Array.isArray(subjects.musician_ids)    ? subjects.musician_ids    : [];

  ragaIds.forEach(function(ragaId) {
    if (excludeType === 'raga' && ragaId === excludeId) return;
    const ragaObj  = ragas.find(function(r) { return r.id === ragaId; });
    const ragaName = ragaObj ? ragaObj.name : ragaId;
    const c = document.createElement('span');
    c.className = 'raga-chip';
    c.textContent = ragaName;
    c.title = 'Explore ' + ragaName + ' in Bani Flow';
    c.addEventListener('click', function(e) {
      e.stopPropagation();
      c.classList.add('chip-tapped');
      setTimeout(function() { c.classList.remove('chip-tapped'); }, 200);
      triggerBaniSearch('raga', ragaId);
    });
    chips.push(c);
  });

  compIds.forEach(function(compId) {
    if (excludeType === 'comp' && compId === excludeId) return;
    const compObj  = compositions.find(function(x) { return x.id === compId; });
    const compName = compObj ? compObj.title : compId;
    const c = document.createElement('span');
    c.className = 'comp-chip';
    c.textContent = compName;
    c.title = 'Explore ' + compName + ' in Bani Flow';
    c.addEventListener('click', function(e) {
      e.stopPropagation();
      c.classList.add('chip-tapped');
      setTimeout(function() { c.classList.remove('chip-tapped'); }, 200);
      triggerBaniSearch('comp', compId);
    });
    chips.push(c);
  });

  musicianIds.forEach(function(mid) {
    const mNode  = cy.getElementById(mid);
    const mLabel = (mNode && mNode.length) ? (mNode.data('label') || mid) : mid;
    const c = document.createElement('span');
    c.className = 'musician-chip';
    c.textContent = mLabel;
    c.title = 'Open ' + mLabel + '\u2019s panel';
    c.addEventListener('click', function(e) {
      e.stopPropagation();
      c.classList.add('chip-tapped');
      setTimeout(function() { c.classList.remove('chip-tapped'); }, 200);
      if (mNode && mNode.length && typeof selectNode === 'function') {
        selectNode(mNode);
        if (typeof window.setPanelState === 'function') {
          setTimeout(function() { window.setPanelState('MUSICIAN'); }, 50);
        }
      }
    });
    chips.push(c);
  });

  return chips;
}

