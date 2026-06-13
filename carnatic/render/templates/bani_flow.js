// ── Bani Flow ─────────────────────────────────────────────────────────────────

// Build a node-id → born-year map for fallback sort (ADR-150: iterate elements[], not cy.nodes())
const nodeBorn = {};
elements.forEach(function(e) {
  if (!e.data.source && e.data.id) nodeBorn[e.data.id] = e.data.born;
});

/**
 * resolveNode(id) — ADR-150: canonical two-step musician data lookup.
 * Tries cy first (connected musicians with layout data),
 * falls back to elements[] (transit/isolated musicians).
 * Returns a unified object with a .data(key) method, or null if not found.
 */
function resolveNode(id) {
  if (!id) return null;
  const cyNode = cy.getElementById(id);
  if (cyNode && cyNode.length) return cyNode;
  const raw = elements.find(function(e) { return !e.data.source && e.data.id === id; });
  if (!raw) return null;
  return {
    length: 1,
    data: function(key) {
      if (key === undefined) return raw.data;
      return raw.data[key];
    },
    _raw: raw.data,
  };
}

// resolveYtLabel(vid) — ADR-150: find a track label by YouTube video id from elements[].
// Replaces two duplicate cy.nodes().forEach(...) yt-label lookup blocks (F-004).
function resolveYtLabel(vid) {
  for (var i = 0; i < elements.length; i++) {
    var e = elements[i];
    if (e.data.source) continue;
    var tracks = e.data.tracks || [];
    for (var j = 0; j < tracks.length; j++) {
      if (tracks[j].vid === vid) return tracks[j].label || '';
    }
  }
  return '';
}

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

// ── Bani Flow panel history (ADR-148) ────────────────────────────────────────
let _currentBaniSubject = { type: null, id: null };
const baniHistory = { back: [], forward: [] };
const BANI_HISTORY_MAX = 5;

function _updateBaniNavButtons() {
  const backBtn = document.getElementById('bani-back-btn');
  const fwdBtn  = document.getElementById('bani-fwd-btn');
  if (backBtn) backBtn.disabled = baniHistory.back.length === 0;
  if (fwdBtn)  fwdBtn.disabled  = baniHistory.forward.length === 0;
}

function baniBack() {
  if (!baniHistory.back.length) return;
  const target = baniHistory.back.pop();
  if (_currentBaniSubject.type) {
    baniHistory.forward.unshift({ type: _currentBaniSubject.type, id: _currentBaniSubject.id });
    if (baniHistory.forward.length > BANI_HISTORY_MAX) baniHistory.forward.pop();
  }
  triggerBaniSearch(target.type, target.id, true);
}

function baniForward() {
  if (!baniHistory.forward.length) return;
  const target = baniHistory.forward.shift();
  if (_currentBaniSubject.type) {
    baniHistory.back.push({ type: _currentBaniSubject.type, id: _currentBaniSubject.id });
    if (baniHistory.back.length > BANI_HISTORY_MAX) baniHistory.back.shift();
  }
  triggerBaniSearch(target.type, target.id, true);
}

(function() {
  const _baniBackBtn = document.getElementById('bani-back-btn');
  const _baniFwdBtn  = document.getElementById('bani-fwd-btn');
  if (_baniBackBtn) _baniBackBtn.addEventListener('click', baniBack);
  if (_baniFwdBtn)  _baniFwdBtn.addEventListener('click', baniForward);
})();

// ── ADR-151: expose bani trail for permalink serialization ───────────────────
window.getBaniTrail = function() {
  return {
    current: { type: _currentBaniSubject.type, id: _currentBaniSubject.id },
    back:    baniHistory.back.map(function(e) { return { type: e.type, id: e.id }; }),
  };
};

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
    // ADR-150: iterate elements[] so transit musicians with yt tracks are included
    elements.forEach(function(e) {
      if (e.data.source) return;
      var tracks = e.data.tracks || [];
      if (tracks.some(function(t) { return t.vid === ytVid; })) nodeSet.add(e.data.id);
    });
    matchedNodeIds = [...nodeSet];
  } else if (type === 'madhyama') {
    // id = '1' (śuddha, melas 1–36) or '2' (prati, melas 37–72)
    const mVal = parseInt(id, 10);
    const nodeSet = new Set();
    for (let M = 1; M <= 72; M++) {
      const hem = M <= 36 ? 1 : 2;
      if (hem === mVal) {
        Object.keys(ragaToNodes).forEach(rid => {
          const raga = ragas && ragas.find(r => r.id === rid);
          const mn = raga && raga.melakarta;
          if (mn === M) (ragaToNodes[rid] || []).forEach(nid => nodeSet.add(nid));
        });
      }
    }
    matchedNodeIds = [...nodeSet];
  } else if (type === 'cakra') {
    // id = cakra number 1–12
    const cVal = parseInt(id, 10);
    const nodeSet = new Set();
    for (let M = 1; M <= 72; M++) {
      const n2 = M <= 36 ? M : M - 36;
      const c = Math.floor((n2 - 1) / 6) + 1;
      const actualC = M <= 36 ? c : c + 6;
      if (actualC === cVal) {
        Object.keys(ragaToNodes).forEach(rid => {
          const raga = ragas && ragas.find(r => r.id === rid);
          const mn = raga && raga.melakarta;
          if (mn === M) (ragaToNodes[rid] || []).forEach(nid => nodeSet.add(nid));
        });
      }
    }
    matchedNodeIds = [...nodeSet];
  } else if (type === 'riga') {
    // id = rigaIdx (0–5) shared by 12 melas (both hemispheres)
    const rigaIdx = parseInt(id, 10);
    const nodeSet = new Set();
    for (let M = 1; M <= 72; M++) {
      const n2 = M <= 36 ? M : M - 36;
      if (Math.floor((n2 - 1) / 6) === rigaIdx) {
        Object.keys(ragaToNodes).forEach(rid => {
          const raga = ragas && ragas.find(r => r.id === rid);
          const mn = raga && raga.melakarta;
          if (mn === M) (ragaToNodes[rid] || []).forEach(nid => nodeSet.add(nid));
        });
      }
    }
    matchedNodeIds = [...nodeSet];
  } else if (type === 'dani') {
    // id = daniIdx (0–5); 2 melas: the cell's mela-number and hemispheric companion
    const daniIdx = parseInt(id, 10);
    const nodeSet = new Set();
    for (let M = 1; M <= 72; M++) {
      const n2 = M <= 36 ? M : M - 36;
      if ((n2 - 1) % 6 === daniIdx) {
        Object.keys(ragaToNodes).forEach(rid => {
          const raga = ragas && ragas.find(r => r.id === rid);
          const mn = raga && raga.melakarta;
          if (mn === M) (ragaToNodes[rid] || []).forEach(nid => nodeSet.add(nid));
        });
      }
    }
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
  document.getElementById('bani-info').style.display = '';
  buildListeningTrail(type, id, matchedNodeIds);

  const _tfRow = document.getElementById('trail-filter-row');
  if (_tfRow) _tfRow.style.display = 'flex';
  document.getElementById('trail-filter').value = '';

  // Sync raga wheel if it is the active view
  if (typeof syncRagaWheelToFilter === 'function') {
    syncRagaWheelToFilter(type, id);
  }
}

function buildListeningTrail(type, id, matchedNodeIds) {
  // ADR-086: subject loaded → dismiss empty-panel tutorial
  if (typeof window.dismissPanelHelp === 'function') window.dismissPanelHelp('bani');
  if (typeof window.hidePanelTutorial === 'function') window.hidePanelTutorial('bani');
  const trail = document.getElementById('listening-trail');
  const trailList = document.getElementById('trail-list');
  trailList.innerHTML = '';
  const _baniScroll = document.getElementById('bani-scroll');
  if (_baniScroll) _baniScroll.scrollTop = 0;

  // ── Subject header (ADR-020) ──────────────────────────────────────────────
  const subjectHeader = document.getElementById('bani-subject-header');
  const subjectName   = document.getElementById('bani-subject-name');
  const subjectLink   = document.getElementById('bani-subject-link');
  const subjectIcon   = document.getElementById('bani-subject-icon');
  const subjectSub    = document.getElementById('bani-subject-sub');

  subjectLink.style.display = 'none';
  subjectLink.href = '#';
  // ADR-128 D2: hide affordances row on reset
  const _baniAffordancesReset = document.getElementById('bani-header-affordances');
  if (_baniAffordancesReset) _baniAffordancesReset.style.display = 'none';
  // ADR-149: hide popup button and popup on reset
  const _popupBtnReset = document.getElementById('bani-subject-popup-btn');
  if (_popupBtnReset) _popupBtnReset.style.display = 'none';
  const _popupReset = document.getElementById('bani-subject-popup');
  if (_popupReset) { _popupReset.style.display = 'none'; _popupReset.innerHTML = ''; }
  // Hide [Hindustani] prefix (ADR-113)
  const _herPrefix = document.getElementById('bani-her-prefix');
  if (_herPrefix) _herPrefix.style.display = 'none';
  // Reset notes row (ADR-097 §7)
  const _notesRow = document.getElementById('bani-notes-row');
  if (_notesRow) { _notesRow.innerHTML = ''; _notesRow.style.display = 'none'; }
  // Reset inline meta chips row (HER/CER or raga+composer)
  if (subjectSub) { subjectSub.innerHTML = ''; subjectSub.style.display = 'none'; }

  // Reset subject name chip styling from previous call
  subjectName.className = '';
  subjectName.onclick = null;  // clear stale click handler from previous call
  // ADR-142: clear stale entity attributes so a previous raga/comp navigation
  // cannot bleed through to the next panel type (fixes comp→khamas confusion).
  delete subjectName.dataset.chipRole;
  delete subjectName.dataset.entityType;
  delete subjectName.dataset.entityId;
  subjectIcon.style.display = '';

  if (type === 'comp') {
    const comp     = compositions.find(c => c.id === id);
    const raga     = comp ? ragas.find(r => r.id === comp.raga_id) : null;
    const composer = comp ? composers.find(c => c.id === comp.composer_id) : null;

    // Row 1: composition title styled as a .comp-chip — visually matches trail + right sidebar
    subjectName.className = 'comp-chip';
    if (typeof applyChipRole === 'function') applyChipRole(subjectName, 'panel-title', 'composition', id);
    subjectIcon.style.display = 'none';  // chip ::before provides the icon
    subjectName.textContent = comp ? comp.title : id;
    const compSrc = comp && comp.sources && comp.sources[0];
    if (compSrc) {
      subjectLink.href = compSrc.url;
      subjectLink.style.display = 'inline';
    }
    // Notes section (ADR-097 §7)
    if (_notesRow && comp && Array.isArray(comp.notes) && comp.notes.length > 0) {
      const notesEl = buildNotesSection(comp.notes);
      if (notesEl) { _notesRow.appendChild(notesEl); _notesRow.style.display = ''; }
    }
    // ADR-149: popup button shows performer count (raga+composer now shown inline)
    _setupBaniSubjectPopupBtn('comp', id, { comp, raga, composer });
    // Single-click on comp title → sync raga wheel to this composition
    // AUDIT-012 C1: guard prevents redundant rebuild when already on this subject
    subjectName.onclick = function() {
      if (_currentBaniSubject.type === 'comp' && _currentBaniSubject.id === id) return;
      triggerBaniSearch('comp', id);
    };
    // Inline raga + composer chips below the composition title
    if (subjectSub) {
      if (raga) {
        const inlineRagaChip = document.createElement('span');
        inlineRagaChip.className = 'raga-chip';
        if (typeof applyChipRole === 'function') applyChipRole(inlineRagaChip, 'entity', 'raga', raga.id);
        inlineRagaChip.textContent = raga.name;
        inlineRagaChip.title = 'Explore ' + raga.name + ' in Bani Flow';
        inlineRagaChip.addEventListener('click', function(e) {
          e.stopPropagation();
          triggerBaniSearch('raga', raga.id);
        });
        subjectSub.appendChild(inlineRagaChip);
      }
      if (typeof buildComposerChip === 'function' && comp && comp.composer_id) {
        const inlineComposerChip = buildComposerChip(id);
        if (inlineComposerChip) subjectSub.appendChild(inlineComposerChip);
      }
      if (subjectSub.children.length > 0) subjectSub.style.display = 'flex';
    }

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
        if (typeof applyChipRole === 'function') applyChipRole(ragaBtn, 'entity', 'raga', perfRaga.id);
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
    ytLabel = resolveYtLabel(ytVid);
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
      if (typeof applyChipRole === 'function') applyChipRole(ytRagaBtn, 'entity', 'raga', ytRaga.id);
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
    // ADR-142 §1: panel-title chip for the Raga panel
    if (typeof applyChipRole === 'function') applyChipRole(subjectName, 'panel-title', 'raga', id);
    if (raga && raga.notes) {
      subjectName.title = raga.notes;          // hover tooltip
    } else {
      subjectName.title = '';
    }
    // ADR-113: [Hindustani] prefix tag for HER ragas
    const _herPrefixEl = document.getElementById('bani-her-prefix');
    if (_herPrefixEl) {
      _herPrefixEl.style.display = (raga && raga.tradition === 'hindustani') ? 'inline-flex' : 'none';
    }
    const ragaSrc = raga && raga.sources && raga.sources[0];
    if (ragaSrc) {
      subjectLink.href = ragaSrc.url;
      subjectLink.style.display = 'inline';
    }
    // Notes section (ADR-097 §7) — array-shaped notes only; string notes stay as tooltip
    if (_notesRow && raga && Array.isArray(raga.notes) && raga.notes.length > 0) {
      const notesEl = buildNotesSection(raga.notes);
      if (notesEl) { _notesRow.appendChild(notesEl); _notesRow.style.display = ''; }
    }
    // ADR-149: popup button shows mela family / HER equivalents
    _setupBaniSubjectPopupBtn('raga', id, { raga });
    // Single-click on raga title → sync raga wheel to this raga
    // AUDIT-012 C1: guard prevents redundant rebuild when already on this subject
    subjectName.onclick = function() {
      if (_currentBaniSubject.type === 'raga' && _currentBaniSubject.id === id) return;
      triggerBaniSearch('raga', id);
    };
    // Inline HER/CER chips below the raga title
    if (subjectSub) {
      const _allRagas = window._baniRagas || ragas;
      if (raga && raga.tradition === 'hindustani') {
        // Hindustani raga: show Carnatic equivalents (CER)
        const cerRagas = _allRagas.filter(r => r.hindustani_equivalents && r.hindustani_equivalents.includes(id));
        cerRagas.forEach(cr => {
          const chip = document.createElement('span');
          chip.className = 'raga-chip';
          chip.textContent = cr.name || cr.id;
          chip.title = 'Carnatic equivalent — explore in Bani Flow';
          chip.addEventListener('click', function(e) {
            e.stopPropagation();
            triggerBaniSearch('raga', cr.id);
          });
          subjectSub.appendChild(chip);
        });
      } else if (raga) {
        // Carnatic raga: show Hindustani equivalents (HER)
        const herEqs = raga.hindustani_equivalents || [];
        const herRagas = herEqs.map(hid => _allRagas.find(r => r.id === hid)).filter(Boolean);
        herRagas.forEach(hr => {
          const chip = document.createElement('span');
          chip.className = 'her-chip';
          chip.textContent = '\u2194\u00a0' + (hr.name || hr.id);
          chip.title = 'Hindustani equivalent — explore in Bani Flow';
          chip.addEventListener('click', function(e) {
            e.stopPropagation();
            triggerBaniSearch('raga', hr.id);
          });
          subjectSub.appendChild(chip);
        });
      }
      if (subjectSub.children.length > 0) subjectSub.style.display = 'flex';
    }
  }

  // ADR-128 D2: show affordances row (wiki link + edit button) when a subject is loaded
  const _baniAffordances = document.getElementById('bani-header-affordances');
  if (_baniAffordances) _baniAffordances.style.display = '';
  // ADR-163: render the PLAYLISTS section at the very top (above lecdems)
  _renderBaniFlowPlaylists(type, id);
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
      // ADR-138: transit/isolated nodes are culled from _cyElements; cy.getElementById()
      // returns an empty Collection (truthy!) for them — fall back to raw elements array
      // so musicians with no lineage edges still appear in raga/comp panels.
      let d;
      if (n && n.length) {
        d = n.data();
      } else {
        const rawEl = elements.find(function(e) { return !e.data.source && e.data.id === nid; });
        if (!rawEl) return;
        d = rawEl.data;
      }
      if (!d || !d.tracks) return;
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
            } else {
              // Host is also a transit node — fall back to raw elements
              const rawHost = elements.find(function(e) { return !e.data.source && e.data.id === t.host_id; });
              if (rawHost) { primaryNid = t.host_id; primaryD = rawHost.data; }
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
      pNode = resolveNode(primaryPerformer.musician_id);
      artistLabel = (pNode ? pNode.data('label') : null) || primaryPerformer.unmatched_name || p.title;
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
        const coNode = resolveNode(pf.musician_id);
        const coLabel = coNode ? coNode.data('label') : (pf.unmatched_name || null);
        if (!coLabel || UNKNOWN_LABELS.has(coLabel)) return; // skip unknown/placeholder names
        row.coPerformers.push({
          nodeId:      pf.musician_id || null,
          artistLabel: coLabel,
          color:       coNode ? coNode.data('color') : null,
          shape:       coNode ? coNode.data('shape') : null,
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
  // ADR-167: supersedes ADR-157's eager _qItems block and bottom play-all button.
  // Harvest is now lazy: collectQueueItems(#trail-list) at click time.
  if (type === 'raga') {
    buildTreeRaga(rows, trailList, multiVersionKeys, id);
  } else if (type === 'comp') {
    buildTreeComp(rows, trailList, multiVersionKeys);
  } else {
    rows.forEach(row => {
      trailList.appendChild(buildTrailItem(row, type, id, multiVersionKeys));
    });
  }

  trail.style.display = rows.length > 0 ? 'block' : 'none';
}

// ── ADR-163: PLAYLISTS at the top of the bani-flow panel ──────────────────────
// Rendered into its own container ABOVE #bani-lecdem-strip (mirroring the lecdem
// strip), so the user's playlist leads the panel — consistent with the musician
// panel where PLAYLISTS is unshifted to the top. Cleared and rebuilt each filter.
function _renderBaniFlowPlaylists(type, id) {
  const section = document.getElementById('bani-playlists');
  if (!section) return;
  section.innerHTML = '';
  section.style.display = 'none';
  let ids = null;
  if (type === 'raga' && typeof playlistsByRaga !== 'undefined') ids = playlistsByRaga[id];
  else if (type === 'comp' && typeof playlistsByComposition !== 'undefined') ids = playlistsByComposition[id];
  const sec = (typeof buildPlaylistsSection === 'function') ? buildPlaylistsSection(ids) : null;
  if (!sec) return;
  section.appendChild(sec);
  section.style.display = 'block';
}

// ── buildTrailItem: render one <li> for a deduplicated performance row ────────
function buildTrailItem(row, type, id, multiVersionKeys) {
  const li = document.createElement('li');
  li.dataset.vid = row.track.media_key;          // ADR-154: media_key, not bare vid
  li.className   = playerRegistry.has(row.track.media_key) ? 'playing' : '';
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
    if (typeof applyChipRole === 'function') applyChipRole(compChip, 'entity', 'composition', trailComp.id);
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
    if (typeof applyChipRole === 'function') applyChipRole(ragaChip, 'entity', 'raga', trailRagaId);
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
  trailPlayBtn.setAttribute('data-vid', row.track.media_key);
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
            subject:        sp.subject || null,   // ADR-156
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
        row.track.media || row.track.vid,   // ADR-154: pass the MediaRef
        row.track.label,
        row.artistLabel,
        row.track.offset_seconds || undefined,
        concertTitle,
        playerTracks,
        {
          nodeId:        row.nodeId || null,
          ragaId:        row.track.raga_id || null,
          compositionId: row.track.composition_id || null,
          recId:         row.track.recording_id || null,
        }
      );
    } else {
      openOrFocusPlayer(
        row.track.media || row.track.vid,   // ADR-154: pass the MediaRef
        row.track.label,
        row.artistLabel,
        undefined,
        undefined,
        undefined,
        {
          nodeId:        row.nodeId || null,
          ragaId:        row.track.raga_id || null,
          compositionId: row.track.composition_id || null,
          recId:         row.track.recording_id || null,
        }
      );
    }
  });
  const actsDiv = document.createElement('div');
  actsDiv.className = 'trail-acts';
  actsDiv.appendChild(trailPlayBtn);
  row2Div.appendChild(actsDiv);

  li.appendChild(headerDiv);
  li.appendChild(row2Div);
  // ADR-167: register thunk so filter-scoped harvest works on this flat trail row.
  if (row.track.media || row.track.vid) {
    const _r = row;
    if (typeof registerQueueItem === 'function') registerQueueItem(li, function() {
      return {
        media:        _r.track.media || _r.track.vid,
        startSeconds: _r.track.offset_seconds || 0,
        label:        _r.track.label || '',
        artistName:   _r.artistLabel || '',
        concertTitle: _r.track.short_title || _r.track.concert_title || '',
        tracks:       [],
        meta: {
          nodeId:        _r.nodeId || null,
          ragaId:        _r.track.raga_id || null,
          compositionId: _r.track.composition_id || null,
          recId:         _r.track.recording_id || null,
        },
      };
    });
  }
  return li;
}

// ── ADR-061: tree-structured trail helpers ────────────────────────────────────

// _buildPlayActsDiv: shared ▶ + ↗ .trail-acts div for both flat and tree leaves.
function _buildPlayActsDiv(row) {
  const isConcertEntry = !!(row.isStructured && row.track.recording_id);
  const concertTitle = row.track.short_title || row.track.concert_title || null;
  const playBtn = document.createElement('button');
  playBtn.className = isConcertEntry ? 'rec-play-btn play-btn-concert' : 'rec-play-btn play-btn-direct';
  playBtn.setAttribute('data-vid', row.track.media_key);
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
            subject:        sp.subject || null,   // ADR-156
            display_title:  sp.display_title || '',
            raga_id:        sp.raga_id || null,
            raga_name:      spRagaObj ? spRagaObj.name : (sp.raga_id || ''),
            tala:           sp.tala || null,
            timestamp:      sp.timestamp || '00:00',
            composition_id: sp.composition_id || null,
          };
        });
      openOrFocusPlayer(
        row.track.media || row.track.vid, row.track.label, row.artistLabel,
        row.track.offset_seconds || undefined,
        row.track.short_title || row.track.concert_title,
        playerTracks,
        { nodeId: row.nodeId || null, ragaId: row.track.raga_id || null, compositionId: row.track.composition_id || null, recId: row.track.recording_id || null }
      );
    } else {
      openOrFocusPlayer(
        row.track.media || row.track.vid, row.track.label, row.artistLabel,
        undefined, undefined, undefined,
        { nodeId: row.nodeId || null, ragaId: row.track.raga_id || null, compositionId: row.track.composition_id || null, recId: row.track.recording_id || null }
      );
    }
  });
  const actsDiv = document.createElement('div');
  actsDiv.className = 'trail-acts';
  actsDiv.appendChild(playBtn);
  const plusBtn = _buildPlusBtn(function() {
    return {
      media:        row.track.media || row.track.vid,
      startSeconds: row.track.offset_seconds || 0,
      label:        row.track.label || '',
      artistName:   row.artistLabel || '',
      concertTitle: row.track.short_title || row.track.concert_title || '',
      meta: {
        ragaId:        row.track.raga_id || null,
        compositionId: row.track.composition_id || null,
        nodeId:        row.nodeId || null,
        recId:         row.track.recording_id || null,
      },
    };
  });
  actsDiv.appendChild(plusBtn);
  return actsDiv;
}

// buildTreeLeaf: one <li class="tree-leaf"> for a performance row inside a group.
// suppressArtist=true  → comp-view leaf (artist shown in group header; omit here)
// suppressArtist=false → raga-view leaf (artist shown here)
function buildTreeLeaf(row, multiVersionKeys, suppressArtist) {
  const li = document.createElement('li');
  li.className = 'tree-leaf';
  li.dataset.vid = row.track.media_key;                                  // ADR-154
  if (playerRegistry.has(row.track.media_key)) li.classList.add('playing');

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

  // ── Context label: shown at top of leaf, above the artist row ───────────
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
    labelDiv.className = 'yt-label-chip';
    labelDiv.textContent = labelText;
    li.appendChild(labelDiv);
  }

  // ── Co-performers: chevron-left accordion ─────────────────────────────────
  // Play button (trailingEl) always goes LAST in the header row — after the
  // co-performer chevron when present — so all play buttons share one column.
  const actsDiv = _buildPlayActsDiv(row);
  const cpChips = (row.coPerformers && row.coPerformers.length > 0)
    ? row.coPerformers.map(function(cp) { return buildArtistSpan(cp, false, 'raga', null); })
    : [];
  const accordion = buildRowAccordion({ headerEl: primaryDiv, bodyEls: cpChips, defaultCollapsed: true, trailingEl: actsDiv });
  accordion.classList.add('tree-leaf-coperformers-group');
  li.appendChild(accordion);

  // ── Dblclick to edit recording ─────────────────────────────────────────────
  const _vid        = row.track.vid;
  const _isConcert  = !!(row.isStructured && row.track.recording_id);
  const _recordingId = row.track.recording_id || null;
  if (_vid) {
    if (typeof markEditable === 'function') markEditable(li);
    li.addEventListener('dblclick', function(e) {
      if (e.target.closest('a, button, .raga-chip, .comp-chip, .musician-chip, .lecdem-chip')) return;
      e.stopPropagation();
      if (typeof openEditYoutubeForm === 'function') {
        openEditYoutubeForm(_vid, row.nodeId || null, {
          composition_id:  row.track.composition_id || null,
          raga_id:         row.track.raga_id        || null,
          year:            row.track.year           || null,
          label:           row.track.label          || '',
          tala:            row.track.tala           || null,
          is_concert_track: _isConcert || undefined,
        });
      }
    });
  }

  // ADR-167: register thunk so filter-scoped harvest works on this tree leaf.
  if (row.track.media || row.track.vid) {
    const _r = row;
    if (typeof registerQueueItem === 'function') registerQueueItem(li, function() {
      return {
        media:        _r.track.media || _r.track.vid,
        startSeconds: _r.track.offset_seconds || 0,
        label:        _r.track.label || '',
        artistName:   _r.artistLabel || '',
        concertTitle: _r.track.short_title || _r.track.concert_title || '',
        tracks:       [],
        meta: {
          nodeId:        _r.nodeId || null,
          ragaId:        _r.track.raga_id || null,
          compositionId: _r.track.composition_id || null,
          recId:         _r.track.recording_id || null,
        },
      };
    });
  }

  return li;
}

// buildTreeRaga: raga-view trail — group rows by composition, one collapsible
// .tree-group per composition; leaves show artist + version badge + ▶ + ↗.
function buildTreeRaga(rows, trailList, multiVersionKeys, trailRagaId) {
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

  // Partition into named compositions vs. untagged bucket
  const compGroups  = sortedGroups.filter(function(g) { return g.cid !== 'no-comp'; });
  const otherGroups = sortedGroups.filter(function(g) { return g.cid === 'no-comp'; });

  function _renderGroup(group) {
    const isSingle = group.rows.length === 1;

    const li = document.createElement('li');
    li.className = 'tree-group';
    li.classList.add('tree-group-open');
    if (isSingle) li.classList.add('tree-group-single');

    // ── Group header — always open, no chevron, no toggle ─────────────────
    const header = document.createElement('div');
    header.className = 'tree-group-header';

    if (group.comp) {
      // Composition chip + composer chip stacked in tree-header-text
      const textDiv = document.createElement('div');
      textDiv.className = 'tree-header-text';
      const compChip = document.createElement('span');
      compChip.className = 'comp-chip';
      if (typeof applyChipRole === 'function') applyChipRole(compChip, 'entity', 'composition', group.cid);
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
    }
    // no-comp: section header already says "Other recordings (N)" — no label needed

    // Only append header for comp groups or multi-child no-comp groups
    if (group.comp || !isSingle) {
      li.appendChild(header);
    }

    // ── Children ──────────────────────────────────────────────────────────────
    const childrenUl = document.createElement('ul');
    childrenUl.className = 'tree-children';
    group.rows.forEach(function(row) {
      childrenUl.appendChild(buildTreeLeaf(row, multiVersionKeys, false));
    });
    li.appendChild(childrenUl);

    return li;
  }

  // ── Compositions section ──────────────────────────────────────────────────
  if (compGroups.length > 0) {
    // ADR-128 D3: buildSection for consistent header
    const compTypeChip = document.createElement('span');
    compTypeChip.className = 'comp-chip chip-section-hdr';
    compTypeChip.textContent = 'Compositions';
    // ADR-142 §1 / ADR-144: Compositions section-add chip (dblclick opens add-composition form)
    if (typeof applyChipRole === 'function') applyChipRole(compTypeChip, 'section-add', 'composition');
    compTypeChip.dataset.sectionAction = 'add-composition';
    const { sectionEl: compSec, bodyEl: compSecBody } = buildSection({
      headerChip: compTypeChip,
      count: compGroups.length,
      playable: true,
    });
    compGroups.forEach(function(g) { compSecBody.appendChild(_renderGroup(g)); });
    trailList.appendChild(compSec);
  }

  // ── Other recordings section — always shown (even when count=0) for dblclick-to-add ─
  {
    // ADR-128 D11: 'Recordings' neutral chip + ' (misc)' suffix — same chip as
    // the Musician panel uses, so the vocabulary is consistent across panels.
    const _miscChip = document.createElement('span');
    _miscChip.className = 'neutral-chip chip-section-hdr has-glyph neutral-chip-recordings';
    _miscChip.textContent = 'MISC';
    // ADR-144: MISC section-add chip (dblclick opens add-recording form pre-scoped to this raga)
    if (typeof applyChipRole === 'function') applyChipRole(_miscChip, 'section-add', 'recording');
    _miscChip.dataset.sectionAction = 'add-recording';
    _miscChip.dataset.subjectType   = 'raga';
    _miscChip.dataset.subjectId     = trailRagaId || '';
    const miscCount = otherGroups.length > 0 ? otherGroups[0].rows.length : 0;
    const { sectionEl: otherSec, bodyEl: otherSecBody } = buildSection({
      headerChip: _miscChip,
      headerSuffixText: '',
      count: miscCount,
      playable: true,
    });
    // Render rows directly into the section body — buildSection already
    // provides the collapsible header. _renderGroup would emit a redundant
    // empty-labelled inner fold on the no-comp group.
    otherGroups.forEach(function(g) {
      g.rows.forEach(function(row) {
        otherSecBody.appendChild(buildTreeLeaf(row, multiVersionKeys, false));
      });
    });
    trailList.appendChild(otherSec);
  }
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
    if (isSingle) li.classList.add('tree-group-single');

    // ── Group header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'tree-group-header';

    // Musician chip (era-tinted); no lifespan — era colour is the proxy
    header.appendChild(buildArtistSpan(group, true, 'comp', null));

    if (isSingle) {
      // Single-version: ▶ pushed to the right.
      // For rows with co-performers, the play button is passed as trailingEl so
      // it stays LAST (after the co-performer chevron) — keeping all play buttons
      // in one column regardless of whether a chevron is present.
      const actsDiv = _buildPlayActsDiv(group.rows[0]);
      const cpChips = (group.rows[0].coPerformers && group.rows[0].coPerformers.length > 0)
        ? group.rows[0].coPerformers.map(function(cp) { return buildArtistSpan(cp, false, 'comp', null); })
        : [];
      if (cpChips.length > 0) {
        const accordion = buildRowAccordion({ headerEl: header, bodyEls: cpChips, defaultCollapsed: true, trailingEl: actsDiv });
        accordion.classList.add('tree-leaf-coperformers-group');
        li.appendChild(accordion);
      } else {
        // No co-performers: phantom left chevron keeps play button aligned with rows that have one.
        const accordion = buildRowAccordion({ headerEl: header, bodyEls: [], defaultCollapsed: true, trailingEl: actsDiv });
        accordion.classList.add('tree-leaf-coperformers-group');
        li.appendChild(accordion);
      }
      // ADR-167: register single-version comp-view group li for harvest.
      const _r0 = group.rows[0];
      if ((_r0.track.media || _r0.track.vid) && typeof registerQueueItem === 'function') {
        registerQueueItem(li, (function(_r) { return function() {
          return {
            media:        _r.track.media || _r.track.vid,
            startSeconds: _r.track.offset_seconds || 0,
            label:        _r.track.label || '',
            artistName:   _r.artistLabel || '',
            concertTitle: _r.track.short_title || _r.track.concert_title || '',
            tracks:       [],
            meta: {
              nodeId:        _r.nodeId || null,
              ragaId:        _r.track.raga_id || null,
              compositionId: _r.track.composition_id || null,
              recId:         _r.track.recording_id || null,
            },
          };
        }; })(_r0));
      }
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
      li.appendChild(header);
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

  // ADR-150: resolve era/instrument via resolveNode (tries cy first, then elements[])
  const _node = resolveNode(artistRow.nodeId);
  const eraId = _node ? (_node.data('era') || null) : null;
  const tint = THEME.eraTintCss(eraId);
  span.style.setProperty('--chip-era-bg', tint.bg);
  span.style.setProperty('--chip-era-border', tint.border);

  // Primary performer → full-size chip; co-performer → secondary (smaller, italic)
  span.className = isPrimary ? 'musician-chip' : 'musician-chip chip-secondary';

  // ADR-069: instrument badge — resolve from node data (cy or raw elements)
  const instrKey = _node ? _node.data('instrument') : null;
  if (instrKey && typeof makeInstrBadge === 'function') {
    span.appendChild(makeInstrBadge(instrKey, isPrimary ? 13 : 11));
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
      } else if (typeof _openMusicianPanelForTransit === 'function') {
        // Isolated musician (no lineage edges) — open panel directly from elements array
        _openMusicianPanelForTransit(artistRow.nodeId);
      }
    }
  });

  return span;
}

function clearBaniFilter() {
  activeBaniFilter = null;
  cy.elements().removeClass('faded highlighted bani-match');
  document.getElementById('bani-search-input').value = '';
  document.getElementById('bani-info').style.display = 'none';
  document.getElementById('trail-filter').value = '';
  const _clearTfRow = document.getElementById('trail-filter-row');
  if (_clearTfRow) _clearTfRow.style.display = 'none';
  document.getElementById('listening-trail').style.display = 'none';
  const _bfStrip = document.getElementById('bani-lecdem-strip');
  if (_bfStrip) { _bfStrip.style.display = 'none'; _bfStrip.innerHTML = ''; }
  // ADR-149: hide popup button and popup
  const _bfPopupBtn = document.getElementById('bani-subject-popup-btn');
  if (_bfPopupBtn) _bfPopupBtn.style.display = 'none';
  const _bfPopup = document.getElementById('bani-subject-popup');
  if (_bfPopup) { _bfPopup.style.display = 'none'; _bfPopup.innerHTML = ''; }
  const _clearHerPrefix = document.getElementById('bani-her-prefix');
  if (_clearHerPrefix) _clearHerPrefix.style.display = 'none';
  // ADR-148: reset navigation history
  baniHistory.back = [];
  baniHistory.forward = [];
  _currentBaniSubject = { type: null, id: null };
  _updateBaniNavButtons();
  applyZoomLabels();
  // ADR-086: subject cleared → restore empty-panel tutorial
  if (typeof window.showPanelTutorial === 'function') window.showPanelTutorial('bani');
  // Mutual exclusion: clear chip filters when Bani Flow filter clears
  clearAllChipFilters();
}

// ── ADR-149: Bani subject popup button ───────────────────────────────────────
// Shared popup for raga family (janya/mela/HER context) and composition metadata.
// Reuses .lineage-popup-btn + .lineage-popup CSS and the popup positioning pattern
// from _setupLineagePopupBtn / _populatePopup in graph_view.js:1086–1118.

const _baniSubjectPop = document.getElementById('bani-subject-popup');

// Outside-click dismissal (shared across both popup uses)
document.addEventListener('click', function(e) {
  const btn = document.getElementById('bani-subject-popup-btn');
  if (_baniSubjectPop && _baniSubjectPop.style.display !== 'none') {
    if (!_baniSubjectPop.contains(e.target) && e.target !== btn) {
      _baniSubjectPop.style.display = 'none';
    }
  }
});

/**
 * Build popup content for a raga: mela family chips (section 1) + HER chips (section 2).
 * @param {string} ragaId
 * @param {object} raga  — raga data object
 * @param {Array}  allRagas
 */
function _buildRagaFamilyPopupContent(ragaId, raga, allRagas) {
  _baniSubjectPop.innerHTML = '';

  function makeChip(r, cls) {
    const chip = document.createElement('span');
    chip.className = cls;
    chip.textContent = r.name || r.id;
    chip.addEventListener('click', function(e) {
      e.stopPropagation();
      _baniSubjectPop.style.display = 'none';
      triggerBaniSearch('raga', r.id);
    });
    return chip;
  }

  if (raga && raga.tradition === 'hindustani') {
    // HER raga: show Carnatic equivalents
    const carnaticEqs = allRagas.filter(r => r.hindustani_equivalents && r.hindustani_equivalents.includes(ragaId));
    const hdr = document.createElement('div');
    hdr.className = 'lineage-pop-hdr';
    hdr.textContent = 'Carnatic equivalents (' + carnaticEqs.length + ')';
    _baniSubjectPop.appendChild(hdr);
    const row = document.createElement('div');
    row.className = 'lineage-chip-row';
    if (carnaticEqs.length === 0) {
      const none = document.createElement('span');
      none.style.color = 'var(--fg3)';
      none.style.fontSize = '0.82em';
      none.textContent = 'None recorded';
      row.appendChild(none);
    } else {
      carnaticEqs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      carnaticEqs.forEach(r => row.appendChild(makeChip(r, 'raga-chip')));
    }
    _baniSubjectPop.appendChild(row);
    return;
  }

  // Determine the mela and sibling janyas
  let melaRaga = null;
  let janyas    = [];

  if (raga && raga.is_melakarta) {
    melaRaga = raga;
    janyas   = allRagas.filter(r => r.parent_raga === ragaId);
  } else if (raga && raga.parent_raga) {
    melaRaga = allRagas.find(r => r.id === raga.parent_raga) || null;
    janyas   = allRagas.filter(r => r.parent_raga === raga.parent_raga && r.id !== ragaId);
  }

  janyas.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Section 1: Carnatic (mela chip if janya, then siblings/janyas)
  const carnaticItems = [];
  if (melaRaga && !raga.is_melakarta) carnaticItems.push({ r: melaRaga, cls: 'raga-chip' });
  janyas.forEach(j => carnaticItems.push({ r: j, cls: 'raga-chip' }));

  const hdr1 = document.createElement('div');
  hdr1.className = 'lineage-pop-hdr';
  hdr1.textContent = (raga && raga.is_melakarta ? 'Janyas' : 'Mela family') +
                     ' (' + carnaticItems.length + ')';
  _baniSubjectPop.appendChild(hdr1);
  const row1 = document.createElement('div');
  row1.className = 'lineage-chip-row';
  if (carnaticItems.length === 0) {
    const none = document.createElement('span');
    none.style.color = 'var(--fg3)';
    none.style.fontSize = '0.82em';
    none.textContent = 'None recorded';
    row1.appendChild(none);
  } else {
    carnaticItems.forEach(item => row1.appendChild(makeChip(item.r, item.cls)));
  }
  _baniSubjectPop.appendChild(row1);

  // Section 2: Hindustani equivalents (current raga's own HER)
  const herEqs = (raga && raga.hindustani_equivalents) ? raga.hindustani_equivalents : [];
  const herRagas = herEqs.map(hid => allRagas.find(r => r.id === hid)).filter(Boolean);

  const sep = document.createElement('hr');
  sep.className = 'lineage-pop-sep';
  _baniSubjectPop.appendChild(sep);

  const hdr2 = document.createElement('div');
  hdr2.className = 'lineage-pop-hdr';
  hdr2.textContent = 'Hindustani equivalents (' + herRagas.length + ')';
  _baniSubjectPop.appendChild(hdr2);
  const row2 = document.createElement('div');
  row2.className = 'lineage-chip-row';
  if (herRagas.length === 0) {
    const none = document.createElement('span');
    none.style.color = 'var(--fg3)';
    none.style.fontSize = '0.82em';
    none.textContent = 'None recorded';
    row2.appendChild(none);
  } else {
    herRagas.forEach(hr => {
      const chip = document.createElement('span');
      chip.className = 'her-chip';
      chip.dataset.ragaId = hr.id;
      chip.textContent = '\u2194\u00a0' + (hr.name || hr.id);
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        _baniSubjectPop.style.display = 'none';
        triggerBaniSearch('raga', hr.id);
      });
      row2.appendChild(chip);
    });
  }
  _baniSubjectPop.appendChild(row2);
}

/**
 * Build popup content for a composition: raga chip + tala text + composer chip.
 * @param {object} comp
 * @param {object|null} raga
 * @param {object|null} composer
 */
function _buildCompPopupContent(comp, raga, composer) {
  _baniSubjectPop.innerHTML = '';

  if (raga) {
    const hdr = document.createElement('div');
    hdr.className = 'lineage-pop-hdr';
    hdr.textContent = 'Raga';
    _baniSubjectPop.appendChild(hdr);
    const row = document.createElement('div');
    row.className = 'lineage-chip-row';
    const ragaChip = document.createElement('span');
    ragaChip.className = 'raga-chip';
    ragaChip.textContent = raga.name;
    ragaChip.addEventListener('click', function(e) {
      e.stopPropagation();
      _baniSubjectPop.style.display = 'none';
      triggerBaniSearch('raga', raga.id);
    });
    row.appendChild(ragaChip);
    if (comp && comp.tala) {
      const talaSpan = document.createElement('span');
      talaSpan.className = 'trail-tala';
      talaSpan.textContent = formatTala(comp.tala);
      row.appendChild(talaSpan);
    }
    _baniSubjectPop.appendChild(row);
  }

  if (composer) {
    const sep = document.createElement('hr');
    sep.className = 'lineage-pop-sep';
    _baniSubjectPop.appendChild(sep);
    const hdr2 = document.createElement('div');
    hdr2.className = 'lineage-pop-hdr';
    hdr2.textContent = 'Composer';
    _baniSubjectPop.appendChild(hdr2);
    const row2 = document.createElement('div');
    row2.className = 'lineage-chip-row';

    const eraId = composer.musician_node_id
      ? ((graphData.nodes || []).find(n => n.id === composer.musician_node_id) || {}).era || null
      : null;
    const tint = THEME.eraTintCss(eraId);
    const composerChip = document.createElement('span');
    composerChip.className = 'composer-chip chip-navigable';
    composerChip.textContent = composer.name;
    composerChip.style.setProperty('--chip-era-bg', tint.bg);
    composerChip.style.setProperty('--chip-era-border', tint.border);
    composerChip.title = composer.name + ' — Open Musician panel';
    composerChip.addEventListener('click', function(e) {
      e.stopPropagation();
      _baniSubjectPop.style.display = 'none';
      composerChip.classList.add('chip-tapped');
      setTimeout(() => composerChip.classList.remove('chip-tapped'), 200);
      if (composer.musician_node_id) {
        const n = cy.getElementById(composer.musician_node_id);
        if (n && n.length) {
          if (typeof orientToNode === 'function' && typeof currentView !== 'undefined' && currentView === 'graph') {
            orientToNode(composer.musician_node_id);
          } else {
            selectNode(n);
          }
          if (typeof window.setPanelState === 'function') {
            setTimeout(() => window.setPanelState('MUSICIAN'), 50);
          }
        } else if (typeof _openMusicianPanelForTransit === 'function') {
          _openMusicianPanelForTransit(composer.musician_node_id);
        }
      }
    });
    row2.appendChild(composerChip);
    _baniSubjectPop.appendChild(row2);
  }
}

/**
 * Wire up #bani-subject-popup-btn for the current raga or composition subject.
 * @param {'raga'|'comp'} type
 * @param {string} id
 * @param {object} ctx  — { raga } or { comp, raga, composer }
 */
function _setupBaniSubjectPopupBtn(type, id, ctx) {
  const btn = document.getElementById('bani-subject-popup-btn');
  if (!btn) return;

  // Reset stale per-type styles before each call (e.g. comp sets pointerEvents: none)
  btn.style.cursor        = '';
  btn.style.pointerEvents = '';
  btn.onclick             = null;

  let count = 0;
  let title = '';

  if (type === 'raga') {
    const raga     = ctx.raga;
    const allRagas = window._baniRagas || ragas;

    if (raga && raga.tradition === 'hindustani') {
      const ceqs = allRagas.filter(r => r.hindustani_equivalents && r.hindustani_equivalents.includes(id));
      count = ceqs.length;
      title = count + ' Carnatic equivalent' + (count !== 1 ? 's' : '');
    } else if (raga && raga.is_melakarta) {
      const janyaCount = allRagas.filter(r => r.parent_raga === id).length;
      const herCount   = (raga.hindustani_equivalents || []).length;
      count = janyaCount + herCount;
      title = janyaCount + ' janya' + (janyaCount !== 1 ? 's' : '') +
              (herCount > 0 ? ', ' + herCount + ' Hindustani equivalent' + (herCount !== 1 ? 's' : '') : '');
    } else if (raga && raga.parent_raga) {
      const melaCount    = 1;
      const siblingCount = allRagas.filter(r => r.parent_raga === raga.parent_raga && r.id !== id).length;
      const herCount     = (raga.hindustani_equivalents || []).length;
      count = melaCount + siblingCount + herCount;
      title = '1 mela, ' + siblingCount + ' sibling' + (siblingCount !== 1 ? 's' : '') +
              (herCount > 0 ? ', ' + herCount + ' Hindustani equivalent' + (herCount !== 1 ? 's' : '') : '');
    } else {
      // Standalone raga with no mela relationship — show HER only
      const herCount = (raga && raga.hindustani_equivalents ? raga.hindustani_equivalents : []).length;
      count = herCount;
      title = herCount + ' Hindustani equivalent' + (herCount !== 1 ? 's' : '');
    }

    btn.textContent = '\u25c8\u00a0' + count;  // ◈ N
    btn.title = title;
    btn.onclick = function(e) {
      e.stopPropagation();
      if (_baniSubjectPop.style.display !== 'none') { _baniSubjectPop.style.display = 'none'; return; }
      _buildRagaFamilyPopupContent(id, raga, allRagas);
      _positionBaniPopup(btn);
    };

  } else if (type === 'comp') {
    const { comp, raga, composer } = ctx;
    // Count = distinct legacy flat-track vids + structured PerformanceRefs.
    // Do NOT use cy (the lineage graph) — recording data is independent of it.
    // elements[] covers all musician nodes including those with no lineage edges.
    const legacyVids = new Set();
    elements.forEach(function(el) {
      if (el.data.source) return; // skip edge elements
      (el.data.tracks || []).forEach(function(t) {
        if (t.composition_id === id && t.vid) legacyVids.add(t.vid);
      });
    });
    const structPerfs = (typeof compositionToPerf !== 'undefined' ? compositionToPerf[id] : null) || [];
    count = legacyVids.size + structPerfs.length;
    const ragaName     = raga ? raga.name : '';
    const composerName = composer ? composer.name : '';
    title = count + ' musician' + (count !== 1 ? 's' : '') +
            (ragaName ? ' \u00b7 ' + ragaName : '') +
            (composerName ? ' \u00b7 ' + composerName : '');

    btn.textContent = count;
    btn.title = title;
    // Raga and composer are now shown inline below the subject chip — no popup needed.
    btn.onclick = null;
    btn.style.cursor = 'default';
    btn.style.pointerEvents = 'none';
  }

  btn.style.display = count > 0 ? 'inline-flex' : 'none';
}

function _positionBaniPopup(btn) {
  // popup is position:fixed — viewport-relative coords, matching MUSICIAN popup pattern.
  _baniSubjectPop.style.display = 'block';
  var rect = btn.getBoundingClientRect();
  var pw   = _baniSubjectPop.offsetWidth  || 200;
  var ph   = _baniSubjectPop.offsetHeight || 100;
  var left = rect.left;
  var top  = rect.bottom + 5;
  if (left + pw > window.innerWidth)  left = window.innerWidth  - pw - 8;
  if (top  + ph > window.innerHeight) top  = rect.top - ph - 5;
  _baniSubjectPop.style.left = Math.max(4, left) + 'px';
  _baniSubjectPop.style.top  = Math.max(4, top)  + 'px';
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
function triggerBaniSearch(type, id, fromHistory = false) {
  // ADR-148: push current subject to history before navigating.
  // Guard: skip if navigating to the same subject (e.g. clicking the panel-title chip).
  if (!fromHistory && _currentBaniSubject.type &&
      !(_currentBaniSubject.type === type && _currentBaniSubject.id === id)) {
    baniHistory.back.push({ type: _currentBaniSubject.type, id: _currentBaniSubject.id });
    if (baniHistory.back.length > BANI_HISTORY_MAX) baniHistory.back.shift();
    baniHistory.forward = [];
  }
  _currentBaniSubject = { type, id };
  _updateBaniNavButtons();

  // The search input is a pure input widget — the current subject is shown
  // in #bani-subject-name (populated by applyBaniFilter below). Writing a
  // label back here would overwrite whatever the user typed and make every
  // chip click pollute the search bar. See AUDIT-002.
  applyBaniFilter(type, id);

  // Canonical cross-view wheel sync bridge.
  // When raga view is active, applyBaniFilter already executed immediate wheel
  // sync; when it is not, stage this subject for first-entry restoration.
  if (typeof syncWheelFromBaniSubject === 'function') {
    syncWheelFromBaniSubject(type, id);
  }

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

  // ADR-142 §1 Phase A: tag any chip in the freshly-rebuilt panel that didn't
  // get an explicit applyChipRole at its construction site. Behaviour-neutral
  // metadata only; the dispatcher (Phase B) reads these attributes.
  if (typeof tagUntaggedChips === 'function') {
    tagUntaggedChips(document.body);
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
  const hdrChip = document.createElement('span');
  hdrChip.className = 'lecdem-chip chip-section-hdr';
  hdrChip.textContent = 'Lecdems';
  // ADR-142 §1 / ADR-144: Lecdems section-add chip (dblclick opens add-lecdem form, pre-scoped to current subject)
  if (typeof applyChipRole === 'function') applyChipRole(hdrChip, 'section-add', 'recording');
  hdrChip.dataset.sectionAction = 'add-lecdem';
  hdrChip.dataset.subjectType   = type;  // 'raga' | 'comp'
  hdrChip.dataset.subjectId     = id;
  // ADR-128 D3+D11: buildSection. ADR-167: playable:true so the strip gets ▶/⊕.
  const { sectionEl: lecdemSectionWrap, bodyEl: lecdemListBody } = buildSection({
    headerChip: hdrChip,
    count: refs.length,
    playable: true,
  });
  section.appendChild(lecdemSectionWrap);

  // §3: one row per lecdem ref
  const list = document.createElement('ul');
  list.className = 'lecdem-list';

  sorted.forEach(function(ref) {
    const li = document.createElement('li');
    li.className = 'lecdem-row';

    // §5: concert-brackets (with segments) are self-contained accordions — do NOT
    // wrap them in buildRowAccordion. Only flat trail-row2 items use the row-accordion.
    const hasSegments = !!(ref.segments && ref.segments.length > 0);
    const bracketEl = (typeof _buildLecdemBracket === 'function')
      ? _buildLecdemBracket(ref, ref.lecturer_id || '', '')
      : null;
    const lecturerChip = (typeof _buildLecturerChip === 'function')
      ? _buildLecturerChip(ref.lecturer_id, ref.lecturer_label)
      : null;
    const subjectChips = _buildBaniFlowLecdemSubjectChips(ref.subjects, type, id);
    const bodyEls = [lecturerChip, ...subjectChips].filter(Boolean);
    if (bracketEl) {
      if (hasSegments) {
        // Concert bracket — has its own internal chevron; render directly.
        // bodyEls (lecturer + subjects) are injected into the collapsible
        // concert-perf-list so they are hidden until the user expands the bracket.
        if (bodyEls.length > 0) {
          const segList = bracketEl.querySelector('.concert-perf-list');
          if (segList) {
            const preambleLi = document.createElement('li');
            preambleLi.className = 'concert-perf-item lecdem-preamble';
            const preambleChips = document.createElement('div');
            preambleChips.className = 'lecdem-subjects-inline';
            bodyEls.forEach(function (el) { preambleChips.appendChild(el); });
            preambleLi.appendChild(preambleChips);
            segList.insertBefore(preambleLi, segList.firstChild);
          }
        }
        li.appendChild(bracketEl);
      } else {
        // Flat row: always wrap in row-accordion. Empty bodyEls → phantom chevron.
        li.appendChild(buildRowAccordion({ headerEl: bracketEl, bodyEls: bodyEls, defaultCollapsed: true }));
      }
    }
    // ADR-167 §4: register whole-lecdem item for filter-scoped harvest.
    // Key on resolved media (ADR-154), not the YouTube-only video_id — non-YouTube
    // lecdems carry an empty video_id and would otherwise be dropped from the harvest.
    if ((ref.media || ref.media_key) && typeof registerQueueItem === 'function') {
      registerQueueItem(li, (function(_r) { return function() {
        return {
          media: _r.media || _r.media_key, startSeconds: 0,
          label: _r.label || 'Lecture-Demo',
          artistName: _r.lecturer_label || '',
          meta: { nodeId: _r.lecturer_id || null },
        };
      }; })(ref));
    }

    list.appendChild(li);
  });

  lecdemListBody.appendChild(list);
  section.style.display = 'block';
}

// Build subject cross-link chips for a strip row, excluding the current trail
// subject (excludeType + excludeId). Returns an array of chip elements.
// ADR-128 D6: delegates to converged buildLecdemSubjectChips in panel_components.js.
function _buildBaniFlowLecdemSubjectChips(subjects, excludeType, excludeId) {
  return buildLecdemSubjectChips(subjects, {
    excludeRagaId:     excludeType === 'raga'     ? excludeId : undefined,
    excludeCompId:     excludeType === 'comp'     ? excludeId : undefined,
    excludeMusicianId: excludeType === 'musician' ? excludeId : undefined,
  });
}

// ── ADR-167: wire static trail ▶/⊕ buttons (fired once after DOM ready) ──────
document.addEventListener('DOMContentLoaded', function() {
  const trailList = document.getElementById('trail-list');
  const playAllBtn = document.getElementById('trail-play-all-btn');
  const enqueueBtn = document.getElementById('trail-enqueue-btn');
  if (playAllBtn && trailList) {
    playAllBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (typeof collectQueueItems !== 'function') return;
      const items = collectQueueItems(trailList);
      if (items.length && typeof startMediaQueue === 'function') startMediaQueue(items, 0);
    });
  }
  if (enqueueBtn && trailList) {
    enqueueBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (typeof collectQueueItems !== 'function' || typeof MediaQueue === 'undefined') return;
      MediaQueue.addItems(collectQueueItems(trailList));
    });
  }
});

