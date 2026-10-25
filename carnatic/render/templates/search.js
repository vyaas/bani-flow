// Normalize text for diacritic-insensitive search: lowercase + NFD + strip combining marks.
function normText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── ADR-184: grand track search ───────────────────────────────────────────────
// The top search bar is the entry point for all of bani-flow: one flat index of
// performances (one row per track). A query is split into tokens and every token
// must be a substring of the row's blob (musician labels AND ids, composer, raga
// name/id/aliases, composition title/id, recording title/venue/date, segment
// display_title/subject/tala). So "tm krishna" lists all his tracks, then
// "… surutti" narrows to that raga, and "muthuswami dikshitar" to that composer.
// Each row renders the shared chip strip plus play + enqueue.
(function() {
  const input    = document.getElementById('track-search-input');
  const dropdown = document.getElementById('track-search-dropdown');
  if (!input || !dropdown) return;

  let _index = null;
  let _activeIdx = -1;
  let _items = [];
  let _lastQuery = '';

  // Resolve a musician/composer id to its display label (cy first, then elements).
  function _labelFor(id) {
    if (!id) return '';
    if (typeof resolveNode === 'function') {
      const n = resolveNode(id);
      if (n) return n.data('label') || '';
    }
    return String(id).replace(/_/g, ' ');
  }

  // The ordered chapter list of a recording (for queue-advance boundaries).
  function _recTracks(recId) {
    if (typeof recordings === 'undefined' || !recId) return [];
    const rec = recordings.find(r => r.id === recId);
    if (!rec) return [];
    const out = [];
    (rec.sessions || []).forEach(s => (s.performances || []).forEach(p => {
      out.push({
        offset_seconds: p.offset_seconds || 0,
        display_title:  p.display_title || '',
        raga_id:        p.raga_id || null,
        composition_id: p.composition_id || null,
        tala:           p.tala || null,
      });
    }));
    return out.sort((a, b) => a.offset_seconds - b.offset_seconds);
  }

  // Pick the lead (melodic) performer — the one shown as the row's musician chip.
  const LEAD_ROLES = ['vocal', 'veena', 'violin', 'flute', 'mandolin',
                      'nadaswaram', 'saxophone', 'gottuvadyam', 'chitraveena'];
  function _leadPerformer(ref) {
    const ps = ref.performers || [];
    return ps.find(p => p.musician_id && LEAD_ROLES.indexOf(p.role) >= 0) || ps[0] || null;
  }

  // Normalise a raw string to a space-joined word form: dots fuse initials
  // (T.M. → tm, M.L. → ml) and ids split on underscores. Matching is word-PREFIX,
  // so "tm" matches T.M. Krishna but never the "tm" inside "atma".
  function _normPhrase(s) {
    return normText(String(s)).replace(/\./g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function _normWords(s) {
    const t = _normPhrase(s);
    return t ? t.split(' ') : [];
  }
  // Build the matching surface for a set of raw strings: a de-duplicated word
  // list (for AND token matching) and a phrase list (for whole-name boosting).
  function _makeMatch(rawParts) {
    const words = new Set(), phrases = new Set();
    rawParts.forEach(p => {
      if (p === null || p === undefined || p === '') return;
      const ph = _normPhrase(p);
      if (!ph) return;
      phrases.add(ph);
      ph.split(' ').forEach(w => { if (w) words.add(w); });
    });
    return { words: Array.from(words), phrases: Array.from(phrases) };
  }

  // A recording performance → MediaQueue item (same shape the panels enqueue).
  function _itemFromPerf(ref, tracks) {
    const lead = _leadPerformer(ref);
    const comp = ref.composition_id
      ? compositions.find(c => c.id === ref.composition_id) : null;
    const ragaId = ref.raga_id || (comp && comp.raga_id) || null;
    const label = ref.display_title || ref.subject
      || (comp && comp.title) || ref.title || '';
    return {
      media: ref.media,
      startSeconds: ref.offset_seconds || 0,
      concertTitle: ref.title || '',
      label,
      artistName: lead ? _labelFor(lead.musician_id) : '',
      tracks: tracks || [],
      meta: {
        nodeId: (lead && lead.musician_id) || null,
        ragaId,
        compositionId: ref.composition_id || null,
        recId: ref.recording_id,
        end_seconds: null,
      },
    };
  }

  // A musician.youtube[] track → MediaQueue item; `hostId` is the lead musician.
  function _itemFromTrack(t, hostId, comp, ragaId, hostLabel) {
    return {
      media: t.media,
      startSeconds: 0,
      concertTitle: '',
      label: t.label || t.composition_id || '',
      artistName: hostLabel || '',
      tracks: [],
      meta: {
        nodeId: hostId || null,
        ragaId: ragaId || null,
        compositionId: t.composition_id || null,
        recId: null,
        end_seconds: null,
      },
    };
  }

  function _entryFromPerf(ref) {
    const tracks = _recTracks(ref.recording_id);
    const parts = [ref.display_title, ref.subject, ref.title, ref.short_title,
                   ref.tala, ref.date];
    (ref.performers || []).forEach(p => {
      if (p.musician_id) parts.push(p.musician_id, _labelFor(p.musician_id));
      if (p.unmatched_name) parts.push(p.unmatched_name);
    });
    const comp = ref.composition_id
      ? compositions.find(c => c.id === ref.composition_id) : null;
    const composerId = ref.composer_id || (comp && comp.composer_id);
    if (composerId) parts.push(composerId, _labelFor(composerId));
    const ragaId = ref.raga_id || (comp && comp.raga_id);
    const raga = ragaId ? ragas.find(r => r.id === ragaId) : null;
    if (raga) { parts.push(raga.name, raga.id); (raga.aliases || []).forEach(a => parts.push(a)); }
    if (comp) parts.push(comp.title, comp.id);
    const m = _makeMatch(parts);
    return {
      words: m.words, phrases: m.phrases,
      sortDate: ref.date || '', sortTitle: ref.title || '', sortOffset: ref.offset_seconds || 0,
      item: _itemFromPerf(ref, tracks),
    };
  }

  function _entryFromTrack(t, hostId) {
    const hostLabel = _labelFor(hostId);
    const parts = [t.label, t.year, t.version, t.tala, hostId, hostLabel];
    (t.performers || []).forEach(p => {
      if (p.musician_id) parts.push(p.musician_id, _labelFor(p.musician_id));
      if (p.unmatched_name) parts.push(p.unmatched_name);
    });
    const comp = t.composition_id
      ? compositions.find(c => c.id === t.composition_id) : null;
    const composerId = comp && comp.composer_id;
    if (composerId) parts.push(composerId, _labelFor(composerId));
    const ragaId = t.raga_id || (comp && comp.raga_id);
    const raga = ragaId ? ragas.find(r => r.id === ragaId) : null;
    if (raga) { parts.push(raga.name, raga.id); (raga.aliases || []).forEach(a => parts.push(a)); }
    if (comp) parts.push(comp.title, comp.id);
    const m = _makeMatch(parts);
    return {
      words: m.words, phrases: m.phrases,
      sortDate: t.year ? String(t.year) : '', sortTitle: t.label || '', sortOffset: 0,
      item: _itemFromTrack(t, hostId, comp, ragaId, hostLabel),
    };
  }

  function _getIndex() {
    if (_index) return _index;
    const entries = [];
    // 1) Recorded concerts (recordings/*.json), one entry per performance.
    if (typeof perfToPerf !== 'undefined') {
      Object.keys(perfToPerf).forEach(k => {
        const ref = perfToPerf[k] && perfToPerf[k][0];
        if (ref) entries.push(_entryFromPerf(ref));
      });
    }
    // 2) musician.youtube[] recital tracks. A track with performers[] is
    //    cross-linked onto each accompanist's node; keep the HOST's own entry
    //    (no `host_id`) and drop the synthesized duplicates by media_key.
    if (typeof elements !== 'undefined') {
      const trackMap = new Map();
      elements.forEach(el => {
        const d = el.data || el;
        if (!d || d.source || !d.id) return;
        (d.tracks || []).forEach(t => {
          if (!t || !t.media) return;
          const mk = t.media_key || (typeof mediaKey === 'function' ? mediaKey(t.media) : null);
          if (!mk) return;
          const existing = trackMap.get(mk);
          if (!existing || (existing.t.host_id && !t.host_id)) {
            trackMap.set(mk, { t, hostId: t.host_id || d.id });
          }
        });
      });
      trackMap.forEach(({ t, hostId }) => entries.push(_entryFromTrack(t, hostId)));
    }
    _index = entries;
    return _index;
  }

  function _search(q) {
    const tokens = _normWords(q);
    if (!tokens.length) return [];
    const qp = tokens.join(' ');
    const idx = _getIndex();
    const matches = [];
    for (let i = 0; i < idx.length; i++) {
      const entry = idx[i];
      let ok = true;
      for (let j = 0; j < tokens.length; j++) {
        const t = tokens[j];
        let hit = false;
        for (let w = 0; w < entry.words.length; w++) {
          if (entry.words[w].startsWith(t)) { hit = true; break; }
        }
        if (!hit) { ok = false; break; }
      }
      if (!ok) continue;
      let boost = 0;
      for (let p = 0; p < entry.phrases.length; p++) {
        if (entry.phrases[p].startsWith(qp)) { boost = 1; break; }
      }
      matches.push({ entry, boost });
    }
    // Whole-name matches win: "tm krishna" lists only T.M. Krishna tracks,
    // never a T.M. accompanist + an unrelated Krishnan. Multi-entity queries
    // (reetigowla tyagaraja) have no single matching name, so they stay broad.
    if (matches.some(m => m.boost)) {
      for (let i = matches.length - 1; i >= 0; i--) if (!matches[i].boost) matches.splice(i, 1);
    }
    matches.sort((a, b) => {
      if (a.boost !== b.boost) return b.boost - a.boost;
      const da = a.entry.sortDate, db = b.entry.sortDate;
      if (da !== db) return da < db ? -1 : 1;
      const ta = a.entry.sortTitle, tb = b.entry.sortTitle;
      if (ta !== tb) return ta.localeCompare(tb);
      return a.entry.sortOffset - b.entry.sortOffset;
    });
    return matches.slice(0, 80).map(m => m.entry.item);
  }

  function _setActive(i) {
    _activeIdx = i;
    const rows = dropdown.querySelectorAll('.track-result');
    rows.forEach((el, j) => el.classList.toggle('active', j === i));
    if (rows[i]) rows[i].scrollIntoView({ block: 'nearest' });
  }

  function _open() {
    dropdown.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
  }
  function _close() {
    dropdown.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    _activeIdx = -1;
  }

  // ADR-184: the result list is an ephemeral overlay. `_dismiss` hides it and
  // drops focus (mobile keyboard down) but KEEPS the query, so re-focusing the
  // field recalls the same results. Play clears outright (below); enqueue and
  // chip follow-through only dismiss.
  function _dismiss() {
    _close();
    input.blur();
  }

  function _render(q) {
    _lastQuery = q;
    _items = _search(q);
    dropdown.innerHTML = '';
    _activeIdx = -1;
    if (!_items.length) {
      const none = document.createElement('div');
      none.className = 'track-result track-result-empty';
      none.textContent = 'No tracks match';
      dropdown.appendChild(none);
      _open();
      return;
    }
    _items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'track-result';
      row.setAttribute('role', 'option');

      const chips = document.createElement('div');
      chips.className = 'track-result-chips';
      chips.appendChild(_buildQueueRowChips(item, null));
      row.appendChild(chips);

      const play = document.createElement('button');
      play.type = 'button'; play.className = 'track-result-play';
      play.title = 'Play'; play.setAttribute('aria-label', 'Play');
      play.textContent = '\u25b6';
      play.addEventListener('mousedown', e => e.preventDefault());
      play.addEventListener('click', e => {
        e.stopPropagation();
        MediaQueue.playContent(item);
        input.value = '';
        _close();
        input.blur();
      });
      row.appendChild(play);

      const enq = document.createElement('button');
      enq.type = 'button'; enq.className = 'track-result-enqueue';
      enq.title = 'Add to queue'; enq.setAttribute('aria-label', 'Add to queue');
      enq.textContent = '+';
      enq.addEventListener('mousedown', e => e.preventDefault());
      enq.addEventListener('click', e => {
        e.stopPropagation();
        MediaQueue.addItem(item);
        _dismiss();
      });
      row.appendChild(enq);

      row.addEventListener('mousedown', e => e.preventDefault());
      row.addEventListener('click', e => {
        if (e.target.closest('.track-result-play, .track-result-enqueue, .raga-chip, .comp-chip, .musician-chip, .composer-chip, .yt-label-chip')) return;
        MediaQueue.playContent(item);
        input.value = '';
        _close();
        input.blur();
      });
      dropdown.appendChild(row);
    });
    _open();
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { _close(); return; }
    _render(q);
  });

  // Recall: once dismissed, re-focusing or clicking the field restores the
  // same results (the query is preserved by _dismiss). Play clears the field,
  // so it does not return.
  function _reopen() {
    const q = input.value.trim();
    if (!q || dropdown.style.display !== 'none') return;
    if (q === _lastQuery) _open(); else _render(q);
  }
  input.addEventListener('focus', _reopen);
  input.addEventListener('click', _reopen);

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_activeIdx < _items.length - 1) _setActive(_activeIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_activeIdx > 0) _setActive(_activeIdx - 1);
    } else if (e.key === 'Enter') {
      if (_activeIdx >= 0 && _activeIdx < _items.length) {
        e.preventDefault();
        MediaQueue.playContent(_items[_activeIdx]);
        input.value = '';
        _close();
        input.blur();
      }
    } else if (e.key === 'Escape') {
      input.value = '';
      _close();
      input.blur();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { if (dropdown.style.display !== 'none') _close(); }, 150);
  });

  // Any press outside the search field dismisses the list. Capture phase, so
  // it still fires when the pressed element calls preventDefault() on mousedown
  // to hold focus — chips across the app do exactly that, which would otherwise
  // leave the overlay stuck open over the revealed panel.
  document.addEventListener('mousedown', e => {
    if (dropdown.style.display === 'none') return;
    if (e.target.closest('#search-bar')) return;
    _close();
  }, true);

  // A result chip navigates away from search and stops propagation, so the
  // row's own handler never sees it. Capture on the dropdown runs first and
  // dismisses the list before the chip opens its panel — the revealed panel,
  // wheel or graph is never occluded by a stale result list.
  dropdown.addEventListener('click', e => {
    if (e.target.closest('.raga-chip, .comp-chip, .musician-chip, .composer-chip, .yt-label-chip')) {
      _dismiss();
    }
  }, true);
})();

// ── ADR-190: search-field clear affordance ───────────────────────────────────
// The grand search shell carries a ✕ that CSS reveals only while the field
// holds text. Delegated so the search module's own input listener still runs —
// clearing dispatches a real `input` event, so the dropdown closes exactly as
// if the user had backspaced.
document.addEventListener('click', e => {
  const btn = e.target.closest('.search-clear');
  if (!btn) return;
  const field = btn.closest('.search-field');
  const input = field && field.querySelector('.search-input');
  if (!input) return;
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
});
