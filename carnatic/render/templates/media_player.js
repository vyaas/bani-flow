// ── media player manager ──────────────────────────────────────────────────────
// Registry: vid (11-char YouTube ID) → player instance { el, iframe, titleEl, vid }
const playerRegistry = new Map();
let topZ = 800;
let spawnCount = 0;

function ytEmbedUrl(vid, startSeconds) {
  const t = (startSeconds && startSeconds > 0) ? `&start=${startSeconds}` : '';
  return `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0${t}`;
}

function ytDirectUrl(vid, startSeconds) {
  const t = (startSeconds && startSeconds > 0) ? `?t=${startSeconds}` : '';
  return `https://youtu.be/${vid}${t}`;
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function nextSpawnPosition() {
  const offset = (spawnCount % 8) * 28;
  spawnCount += 1;
  return { top: 18 + offset, left: 18 + offset };
}

function bringToFront(player) {
  topZ += 1;
  player.el.style.zIndex = topZ;
}

function refreshPlayingIndicators() {
  document.querySelectorAll('[data-vid]').forEach(el => {
    el.classList.toggle('playing', playerRegistry.has(el.dataset.vid));
  });
}

function wireDrag(el, bar) {
  let dragging = false, ox = 0, oy = 0;
  bar.addEventListener('mousedown', e => {
    dragging = true;
    ox = e.clientX - el.offsetLeft;
    oy = e.clientY - el.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const p = el.parentElement.getBoundingClientRect();
    el.style.left = Math.max(0, Math.min(e.clientX - ox, p.width  - el.offsetWidth))  + 'px';
    el.style.top  = Math.max(0, Math.min(e.clientY - oy, p.height - el.offsetHeight)) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}

function wireResize(el, handle) {
  // Corner resize: width on the container (rightward drag), video height on
  // the iframe wrapper (downward drag).
  //
  // We deliberately do NOT set a fixed height on the outer .media-player
  // container — it must remain height:auto so that the tracklist, footer, and
  // resize grip can expand freely when the track list is toggled open.
  // Instead we resize the .mp-video-wrap by overriding its padding-top (the
  // intrinsic-ratio trick) with an explicit pixel height on the iframe itself.
  //
  // Min width 320px: YouTube controls stay reachable.
  // Min video height 160px: iframe stays visible.
  let resizing = false, startX = 0, startY = 0, startW = 0, startVideoH = 0;
  handle.addEventListener('mousedown', e => {
    resizing = true;
    startX = e.clientX; startY = e.clientY;
    startW = el.offsetWidth;
    // Current rendered video height = container width × 9/16
    const videoWrap = el.querySelector('.mp-video-wrap');
    startVideoH = videoWrap ? videoWrap.offsetHeight : Math.round(el.offsetWidth * 9 / 16);
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    // Width: resize the whole player
    const newW = Math.max(320, startW + e.clientX - startX);
    el.style.width = newW + 'px';
    // Height: resize only the video wrap, not the container
    const newVideoH = Math.max(160, startVideoH + e.clientY - startY);
    const videoWrap = el.querySelector('.mp-video-wrap');
    if (videoWrap) {
      // Switch from padding-top ratio trick to explicit pixel height
      videoWrap.style.paddingTop = '0';
      videoWrap.style.height = newVideoH + 'px';
    }
  });
  document.addEventListener('mouseup', () => { resizing = false; });
}

// ── buildPlayerTrackList — build the <ul> of track items for the in-player selector ──
function buildPlayerTrackList(vid, tracks, instance) {
  const ul = document.createElement('ul');
  ul.className = 'mp-track-items';

  tracks.forEach(t => {
    const li = document.createElement('li');
    li.className = 'mp-track-item';
    li.dataset.offset = t.offset_seconds;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'mp-track-label';
    labelSpan.textContent = t.display_title;

    const metaSpan = document.createElement('span');
    metaSpan.className = 'mp-track-meta';
    const parts = [t.raga_name, t.tala].filter(Boolean);
    metaSpan.textContent = (parts.length ? parts.join(' \u00b7 ') + ' \u00b7 ' : '') + (t.timestamp || '00:00');

    li.appendChild(labelSpan);
    li.appendChild(metaSpan);

    li.addEventListener('click', () => {
      const player = playerRegistry.get(vid);
      if (!player) return;
      player.iframe.src = ytEmbedUrl(vid, t.offset_seconds > 0 ? t.offset_seconds : undefined);
      player.currentOffset = t.offset_seconds;
      // Update active indicator
      ul.querySelectorAll('.mp-track-item').forEach(el => el.classList.remove('mp-track-active'));
      li.classList.add('mp-track-active');
      // Update footer chips to reflect the newly selected track (ADR-066: pass displayTitle)
      updatePlayerFooter(player, t.raga_id || null, t.composition_id || null, t.display_title || null);
      refreshPlayingIndicators();
    });

    ul.appendChild(li);
  });

  return ul;
}

// ── buildPlayerBar — lean title bar: [artist chip] — [title] [≡] [✕] ────────
// meta = { nodeId } — nodeId drives the artist chip click
function buildPlayerBar(vid, artistName, concertTitle, trackLabel, hasTracks, meta) {
  meta = meta || {};
  const bar = document.createElement('div');
  bar.className = 'mp-bar';

  // ── Artist chip — same musician-chip class + era tinting as panels ────────
  if (artistName) {
    const eraId = (meta.nodeId && typeof cy !== 'undefined')
      ? (cy.getElementById(meta.nodeId).data('era') || null) : null;
    const tint = (typeof THEME !== 'undefined')
      ? THEME.eraTintCss(eraId)
      : { bg: 'transparent', border: 'var(--border-strong)' };
    const artistChip = document.createElement('span');
    artistChip.className = 'musician-chip';
    artistChip.style.setProperty('--chip-era-bg',     tint.bg);
    artistChip.style.setProperty('--chip-era-border', tint.border);
    artistChip.textContent = artistName;
    if (meta.nodeId) {
      artistChip.title = artistName + ' — Open Musician panel';
      artistChip.addEventListener('click', e => {
        e.stopPropagation();
        artistChip.classList.add('chip-tapped');
        setTimeout(() => artistChip.classList.remove('chip-tapped'), 200);
        const n = cy.getElementById(meta.nodeId);
        if (n && n.length) {
          if (typeof selectNode === 'function') selectNode(n);
          if (typeof window.setPanelState === 'function')
            setTimeout(() => window.setPanelState('MUSICIAN'), 50);
        }
      });
    } else {
      artistChip.style.cursor = 'default';
    }
    bar.appendChild(artistChip);
  }

  // ── Concert title only (plain text, fills remaining space) ────────────────
  // When a concertTitle is available, show it — it identifies the recording.
  // trackLabel (individual performance title) is omitted here: it is already
  // surfaced in the footer via the composition chip, avoiding redundancy.
  const titleText = concertTitle || '';
  if (titleText) {
    if (artistName) {
      const sep = document.createElement('span');
      sep.className = 'mp-bar-sep';
      sep.textContent = ' \u2014 ';
      bar.appendChild(sep);
    }
    const titleSpan = document.createElement('span');
    titleSpan.className = 'mp-title';
    titleSpan.textContent = titleText;
    bar.appendChild(titleSpan);
  }

  // ── Track list toggle + close (right-anchored) ────────────────────────────
  const rightGroup = document.createElement('span');
  rightGroup.className = 'mp-bar-right';

  if (hasTracks) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'mp-tracklist-toggle';
    toggleBtn.title = 'Track list';
    toggleBtn.textContent = '\u2261';
    rightGroup.appendChild(toggleBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'mp-close';
  closeBtn.title = 'Close';
  closeBtn.textContent = '\u2715';
  rightGroup.appendChild(closeBtn);

  bar.appendChild(rightGroup);
  return bar;
}

// ── buildPlayerFooter — musician + raga + comp + composer chips below the video ──
// ADR-066: chips use same classes as panels for visual parity.
// meta = { ragaId, compositionId, displayTitle } — all optional
// Note: musician name is already shown in the title bar; no musician chip here.
function buildPlayerFooter(meta) {
  if (!meta) return null;
  const { ragaId, compositionId, displayTitle } = meta;
  const hasAny = ragaId || compositionId || displayTitle;
  if (!hasAny) return null;

  const footer = document.createElement('div');
  footer.className = 'mp-footer';

  // ── Raga chip (same .raga-chip class as panels) ──────────────────────────
  if (ragaId) {
    const ragaObj = (typeof ragas !== 'undefined') ? ragas.find(r => r.id === ragaId) : null;
    const ragaName = ragaObj ? ragaObj.name : ragaId;
    const ragaChip = document.createElement('span');
    ragaChip.className = 'raga-chip';
    ragaChip.textContent = ragaName;
    ragaChip.title = 'Explore ' + ragaName + ' in Bani Flow';
    ragaChip.addEventListener('click', e => {
      e.stopPropagation();
      ragaChip.classList.add('chip-tapped');
      setTimeout(() => ragaChip.classList.remove('chip-tapped'), 200);
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('raga', ragaId);
    });
    footer.appendChild(ragaChip);
  }

  // ── Composition chip (same .comp-chip class as panels) ──────────────────
  if (compositionId) {
    const compObj = (typeof compositions !== 'undefined')
      ? compositions.find(c => c.id === compositionId) : null;
    const compName = compObj ? compObj.title : compositionId;
    const compChip = document.createElement('span');
    compChip.className = 'comp-chip';
    compChip.textContent = compName;
    compChip.title = 'Explore ' + compName + ' in Bani Flow';
    compChip.addEventListener('click', e => {
      e.stopPropagation();
      compChip.classList.add('chip-tapped');
      setTimeout(() => compChip.classList.remove('chip-tapped'), 200);
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', compositionId);
    });
    footer.appendChild(compChip);

    // ── Composer chip (reuse existing buildComposerChip) ──────────────────
    const composerChip = buildComposerChip(compositionId);
    if (composerChip) footer.appendChild(composerChip);

  } else if (displayTitle) {
    // ── Non-composition fallback label (small font, like rec-title in panels) ──
    const lbl = document.createElement('span');
    lbl.className = 'rec-title';
    lbl.style.fontSize = '0.68rem';
    lbl.textContent = displayTitle;
    footer.appendChild(lbl);
  }

  return footer;
}

// ── updatePlayerFooter — replace the footer in-place when a track is selected ─
// Called by buildPlayerTrackList on track click and on track swipe to keep chips in sync.
// ADR-066: displayTitle added; nodeId+artistName no longer needed (musician shown in bar).
function updatePlayerFooter(player, ragaId, compositionId, displayTitle) {
  const el = player.el;
  // Remove existing footer if present
  const existing = el.querySelector('.mp-footer');
  if (existing) existing.remove();
  // Build and insert new footer (before .mp-resize)
  const newFooter = buildPlayerFooter({ ragaId, compositionId, displayTitle: displayTitle || null });
  if (newFooter) {
    const resize = el.querySelector('.mp-resize');
    if (resize) {
      el.insertBefore(newFooter, resize);
    } else {
      el.appendChild(newFooter);
    }
  }
}

function createPlayer(vid, trackLabel, artistName, startSeconds, concertTitle, tracks, meta) {
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;

  const pos = nextSpawnPosition();
  const el = document.createElement('div');
  el.className = 'media-player';
  el.style.cssText = `top:${pos.top}px; left:${pos.left}px; z-index:${++topZ}; width:480px;`;

  const bar = buildPlayerBar(vid, artistName, concertTitle, trackLabel, hasTracks, meta || {});
  el.appendChild(bar);

  if (hasTracks) {
    const tracklistDiv = document.createElement('div');
    tracklistDiv.className = 'mp-tracklist';
    tracklistDiv.style.display = 'none';
    el.appendChild(tracklistDiv);
  }

  const videoWrap = document.createElement('div');
  videoWrap.className = 'mp-video-wrap';
  videoWrap.innerHTML = `<iframe class="mp-iframe"
    src="${ytEmbedUrl(vid, startSeconds)}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
    allowfullscreen></iframe>`;
  el.appendChild(videoWrap);

  // ── Footer: raga + comp + composer chips (ADR-066; musician shown in bar) ──
  const fullMeta = Object.assign({ artistName: artistName || null }, meta || {});
  const footer = buildPlayerFooter({ ragaId: (fullMeta.ragaId || null), compositionId: (fullMeta.compositionId || null), displayTitle: trackLabel || null });
  if (footer) el.appendChild(footer);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'mp-resize';
  resizeHandle.title = 'Drag to resize';
  el.appendChild(resizeHandle);

  const instance = {
    el,
    iframe:       el.querySelector('.mp-iframe'),
    titleEl:      el.querySelector('.mp-title'),
    tracklistEl:  el.querySelector('.mp-tracklist') || null,
    vid,
    currentOffset: startSeconds || 0,
    meta:         fullMeta,
  };

  el.querySelector('.mp-close').addEventListener('click', () => {
    instance.iframe.src = '';
    el.remove();
    playerRegistry.delete(vid);
    refreshPlayingIndicators();
  });

  // Wire track list toggle and populate track items
  if (hasTracks && instance.tracklistEl) {
    const trackUl = buildPlayerTrackList(vid, tracks, instance);
    instance.tracklistEl.appendChild(trackUl);

    const toggleBtn = el.querySelector('.mp-tracklist-toggle');
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = instance.tracklistEl.style.display !== 'none';
      instance.tracklistEl.style.display = isOpen ? 'none' : 'block';
      toggleBtn.classList.toggle('mp-tracklist-open', !isOpen);
      if (!isOpen) {
        // Mark the active track when opening
        trackUl.querySelectorAll('.mp-track-item').forEach(li => {
          li.classList.toggle('mp-track-active',
            parseInt(li.dataset.offset, 10) === instance.currentOffset);
        });
      }
    });
  }

  wireDrag(el, el.querySelector('.mp-bar'));
  wireResize(el, el.querySelector('.mp-resize'));
  el.addEventListener('mousedown', () => bringToFront(instance));

  document.getElementById('main').appendChild(el);
  bringToFront(instance);
  return instance;
}

// meta = { nodeId, ragaId, compositionId } — all optional; drives clickable chips in title bar
function openOrFocusPlayer(vid, trackLabel, artistName, startSeconds, concertTitle, tracks, meta) {
  // ADR-037: on mobile, delegate to singleton player
  if (_isMobilePlayer()) {
    _openMobilePlayer(vid, trackLabel, artistName, startSeconds, concertTitle, tracks, meta);
    return;
  }
  if (playerRegistry.has(vid)) {
    const existing = playerRegistry.get(vid);
    // Jump to new timestamp; title does NOT change — concert identity is stable
    existing.iframe.src = ytEmbedUrl(vid, startSeconds);
    existing.currentOffset = startSeconds || 0;
    // Update active indicator in track list if open
    if (existing.tracklistEl) {
      existing.tracklistEl.querySelectorAll('.mp-track-item').forEach(li => {
        li.classList.toggle('mp-track-active',
          parseInt(li.dataset.offset, 10) === existing.currentOffset);
      });
    }
    bringToFront(existing);
    refreshPlayingIndicators();
    return;
  }
  const p = createPlayer(vid, trackLabel, artistName, startSeconds, concertTitle, tracks, meta || {});
  playerRegistry.set(vid, p);
  refreshPlayingIndicators();
}

// ── toggleConcert — expand/collapse a concert bracket (ADR-018) ───────────────
function toggleConcert(headerEl) {
  const bracket = headerEl.closest('.concert-bracket');
  const list    = bracket.querySelector('.concert-perf-list');
  const isOpen  = bracket.classList.contains('expanded');
  if (isOpen) {
    bracket.classList.remove('expanded');
    list.style.display = 'none';
  } else {
    bracket.classList.add('expanded');
    list.style.display = 'block';
  }
}

// ── buildYtLink — external YouTube link icon always shown next to ▶ ─────────────
// Returns an <a class="yt-ext-link"> that opens the video (at offset if given) in a
// new tab — libredirect intercepts it transparently.
function buildYtLink(vid, offsetSeconds) {
  const secs = Math.floor(offsetSeconds || 0);
  const url  = 'https://www.youtube.com/watch?v=' + encodeURIComponent(vid)
             + (secs > 0 ? '&t=' + secs + 's' : '');
  const a = document.createElement('a');
  a.className = 'yt-ext-link';
  a.href      = url;
  a.target    = '_blank';
  a.rel       = 'noopener noreferrer';
  a.title     = 'Open on YouTube';
  a.textContent = '↗';
  a.addEventListener('click', e => e.stopPropagation());
  return a;
}

// ── buildComposerChip — composer chip for a given composition_id ────────────────
// Returns a .composer-chip <span> (navigable if musician_node_id is set) or null.
function buildComposerChip(compositionId) {
  if (!compositionId) return null;
  const comp = (typeof compositions !== 'undefined' ? compositions : []).find(
    c => c.id === compositionId
  );
  if (!comp || !comp.composer_id) return null;
  const composerObj = (typeof composers !== 'undefined' ? composers : []).find(
    c => c.id === comp.composer_id
  );
  if (!composerObj) return null;

  const chip = document.createElement('span');
  chip.className = 'composer-chip';
  chip.textContent = composerObj.name;

  const eraId = composerObj.musician_node_id
    ? (cy.getElementById(composerObj.musician_node_id).data('era') || null)
    : null;
  const tint = THEME.eraTintCss(eraId);
  chip.style.setProperty('--chip-era-bg', tint.bg);
  chip.style.setProperty('--chip-era-border', tint.border);

  if (composerObj.musician_node_id) {
    chip.title = composerObj.name + ' — Open Musician panel';
    chip.addEventListener('click', e => {
      e.stopPropagation();
      chip.classList.add('chip-tapped');
      setTimeout(() => chip.classList.remove('chip-tapped'), 200);
      const n = cy.getElementById(composerObj.musician_node_id);
      if (n && n.length) {
        selectNode(n);
        if (typeof window.setPanelState === 'function') {
          setTimeout(() => window.setPanelState('MUSICIAN'), 50);
        }
      }
    });
  } else {
    chip.style.cursor = 'default';
    chip.title = composerObj.name;
  }
  return chip;
}

// ── buildConcertBracket — build one concert bracket DOM element ───────────────
function buildConcertBracket(concert, nodeId, artistLabel) {
  // Collect all performers across all sessions, deduplicated, excluding self
  // Each entry: { key, label, musicianId } for era-tinted chips (ADR-054)
  const coPerformerMap = new Map();
  let totalPieces = 0;
  concert.sessions.forEach(session => {
    totalPieces += session.perfs.length;
    session.performers.forEach(pf => {
      if (pf.musician_id === nodeId) return;
      const key = pf.musician_id || ('_' + (pf.unmatched_name || '?'));
      if (coPerformerMap.has(key)) return;
      let label;
      if (pf.musician_id) {
        const node = cy.getElementById(pf.musician_id);
        label = (node && node.length > 0) ? (node.data('label') || pf.musician_id) : pf.musician_id;
      } else {
        label = pf.unmatched_name || '?';
      }
      coPerformerMap.set(key, { label, musicianId: pf.musician_id || null });
    });
  });

  const bracket = document.createElement('div');
  bracket.className = 'concert-bracket';
  bracket.dataset.recordingId = concert.recording_id;

  // ── header ────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'concert-header';
  header.setAttribute('onclick', 'toggleConcert(this)');

  const chevron = document.createElement('span');
  chevron.className = 'concert-chevron';

  const headerBody = document.createElement('div');
  headerBody.className = 'concert-header-body';

  const titleRow = document.createElement('div');
  titleRow.className = 'concert-title-row';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'concert-title';
  titleSpan.textContent = concert.short_title || concert.title;

  const dateSpan = document.createElement('span');
  dateSpan.className = 'concert-date';
  dateSpan.textContent = concert.date || '';

  titleRow.appendChild(titleSpan);
  titleRow.appendChild(dateSpan);

  // ADR-054: render each co-performer as an era-tinted musician chip
  const performersDiv = document.createElement('div');
  performersDiv.className = 'concert-performers';
  [...coPerformerMap.values()].forEach((pf, idx) => {
    if (idx > 0) performersDiv.appendChild(document.createTextNode(' '));
    const eraId = pf.musicianId
      ? (cy.getElementById(pf.musicianId).data('era') || null)
      : null;
    const tint = THEME.eraTintCss(eraId);
    const chip = document.createElement('span');
    chip.className = 'musician-chip chip-secondary';
    chip.style.setProperty('--chip-era-bg', tint.bg);
    chip.style.setProperty('--chip-era-border', tint.border);
    chip.textContent = pf.label;
    if (pf.musicianId) {
      chip.addEventListener('click', e => {
        e.stopPropagation();
        chip.classList.add('chip-tapped');
        setTimeout(() => chip.classList.remove('chip-tapped'), 200);
        const n = cy.getElementById(pf.musicianId);
        if (n && n.length) {
          selectNode(n);
          if (typeof window.setPanelState === 'function') {
            setTimeout(() => window.setPanelState('MUSICIAN'), 50);
          }
        }
      });
    }
    performersDiv.appendChild(chip);
  });

  const countDiv = document.createElement('div');
  countDiv.className = 'concert-count';
  countDiv.textContent = totalPieces + (totalPieces === 1 ? ' piece' : ' pieces');

  headerBody.appendChild(titleRow);
  if (coPerformerMap.size > 0) headerBody.appendChild(performersDiv);
  headerBody.appendChild(countDiv);

  header.appendChild(chevron);
  header.appendChild(headerBody);
  bracket.appendChild(header);

  // ── composition list ──────────────────────────────────────────────────────
  const perfList = document.createElement('ul');
  perfList.className = 'concert-perf-list';
  perfList.style.display = 'none';

  concert.sessions.forEach(session => {
    // Sort perfs within session by offset_seconds
    const sortedPerfs = session.perfs.slice().sort(
      (a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0)
    );
    sortedPerfs.forEach(p => {
      const li = document.createElement('li');
      li.className = 'concert-perf-item' + (playerRegistry.has(p.video_id) ? ' playing' : '');
      li.dataset.vid = p.video_id;
      // ADR-052: container is not a click target; navigation lives in embedded chips.

      // Row 1: composition chip (navigable) or plain title for non-composition entries
      const row1 = document.createElement('div');
      row1.className = 'rec-row1';
      if (p.composition_id) {
        const comp = compositions.find(c => c.id === p.composition_id);
        const compChip = document.createElement('span');
        compChip.className = 'comp-chip';
        compChip.textContent = comp ? comp.title : (p.display_title || '');
        compChip.title = (comp ? comp.title : (p.display_title || '')) + ' — Explore in Bani Flow';
        compChip.addEventListener('click', e => {
          e.stopPropagation();
          compChip.classList.add('chip-tapped');
          setTimeout(() => compChip.classList.remove('chip-tapped'), 200);
          triggerBaniSearch('comp', p.composition_id);
        });
        row1.appendChild(compChip);
      } else {
        const titleEl = document.createElement('span');
        titleEl.className = 'rec-title';
        const typeIcon = { interview: '🎤 ', lecture: '🎓 ', radio: '📻 ' }[p.type] || '';
        titleEl.textContent = typeIcon + (p.display_title || '');
        row1.appendChild(titleEl);
      }

      // ▶ button — ADR-053: concert entries use dashed border
      const playBtn = document.createElement('button');
      playBtn.className = 'rec-play-btn play-btn-concert';
      playBtn.title = concert.short_title || concert.title || 'Concert';
      playBtn.textContent = '▶';
      playBtn.addEventListener('click', e => {
        e.stopPropagation();
        // Assemble ordered track list across all sessions for the in-player selector
        const playerTracks = [];
        concert.sessions.forEach(sess => {
          const sortedSessPerfs = sess.perfs.slice().sort(
            (a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0)
          );
          sortedSessPerfs.forEach(sp => {
            const spRagaObj = sp.raga_id ? ragas.find(r => r.id === sp.raga_id) : null;
            playerTracks.push({
              offset_seconds: sp.offset_seconds || 0,
              display_title:  sp.display_title || '',
              raga_id:        sp.raga_id || null,
              raga_name:      spRagaObj ? spRagaObj.name : (sp.raga_id || ''),
              tala:           sp.tala || null,
              timestamp:      sp.timestamp || '00:00',
              composition_id: sp.composition_id || null,
            });
          });
        });
        playerTracks.sort((a, b) => a.offset_seconds - b.offset_seconds);

        openOrFocusPlayer(
          p.video_id,
          p.display_title,
          artistLabel,
          p.offset_seconds > 0 ? p.offset_seconds : undefined,
          concert.short_title || concert.title,
          playerTracks,
          { nodeId, ragaId: p.raga_id || null, compositionId: p.composition_id || null }
        );
      });
      row1.appendChild(playBtn);
      row1.appendChild(buildYtLink(p.video_id, p.offset_seconds || 0));

      // Row 2: raga chip + tala + timestamp link
      const row2 = document.createElement('div');
      row2.className = 'rec-row2';
      const metaSpan = document.createElement('span');
      metaSpan.className = 'rec-meta';
      const ragaObj = p.raga_id ? ragas.find(r => r.id === p.raga_id) : null;
      const talaPart = p.tala || '';
      if (ragaObj) {
        const ragaChip = document.createElement('span');
        ragaChip.className = 'raga-chip';
        ragaChip.textContent = ragaObj.name;
        ragaChip.title = 'Explore ' + ragaObj.name + ' in Bani Flow';
        ragaChip.addEventListener('click', e => {
          e.stopPropagation();
          ragaChip.classList.add('chip-tapped');
          setTimeout(() => ragaChip.classList.remove('chip-tapped'), 200);
          triggerBaniSearch('raga', p.raga_id);
        });
        metaSpan.appendChild(ragaChip);
        if (talaPart) {
          const talaSpan = document.createElement('span');
          talaSpan.textContent = talaPart;
          talaSpan.style.color = 'var(--fg-muted)';
          talaSpan.style.fontSize = '0.68rem';
          talaSpan.style.marginLeft = '6px';
          metaSpan.appendChild(talaSpan);
        }
      } else if (p.raga_id || talaPart) {
        metaSpan.textContent = [p.raga_id, talaPart].filter(Boolean).join(' · ');
      }
      const concertComposerChip = buildComposerChip(p.composition_id);
      if (concertComposerChip) metaSpan.appendChild(concertComposerChip);

      row2.appendChild(metaSpan);

      li.appendChild(row1);
      li.appendChild(row2);
      perfList.appendChild(li);
    });
  });

  bracket.appendChild(perfList);
  return bracket;
}

// ── ADR-064: Raga tree helpers ─────────────────────────────────────────────────

// buildCompNode — renders a <li class="tree-comp-node"> for one composition within a raga
// perfs: array of structured_perf entries sharing the same composition_id
function buildCompNode(compId, perfs, nodeId, artistLabel) {
  const compObj = compId
    ? ((typeof compositions !== 'undefined' ? compositions : []).find(c => c.id === compId) || null)
    : null;
  const composerObj = compObj && compObj.composer_id
    ? ((typeof composers !== 'undefined' ? composers : []).find(c => c.id === compObj.composer_id) || null)
    : null;

  // Sort perfs: earliest year first, nulls last
  const sortedPerfs = perfs.slice().sort((a, b) => {
    const ya = a.date ? parseInt(a.date) : Infinity;
    const yb = b.date ? parseInt(b.date) : Infinity;
    return ya - yb;
  });

  const li = document.createElement('li');
  li.className = 'tree-comp-node';

  // ── Header: comp chip + recording-count toggle ─────────────────────────
  const compHeader = document.createElement('div');
  compHeader.className = 'tree-comp-header';

  if (compObj) {
    const compChip = document.createElement('span');
    compChip.className = 'comp-chip';
    compChip.textContent = compObj.title || compId;
    compChip.title = (compObj.title || compId) + ' — Explore in Bani Flow';
    compChip.addEventListener('click', e => {
      e.stopPropagation();
      compChip.classList.add('chip-tapped');
      setTimeout(() => compChip.classList.remove('chip-tapped'), 200);
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', compId);
    });
    compHeader.appendChild(compChip);
  } else {
    const titleSpan = document.createElement('span');
    titleSpan.className = 'rec-title';
    titleSpan.textContent = (sortedPerfs[0] && sortedPerfs[0].display_title) || 'Unknown composition';
    compHeader.appendChild(titleSpan);
  }

  const recCount = sortedPerfs.length;

  if (recCount === 1) {
    // ── Single recording: inline year + play + link on the comp header row ─
    const p = sortedPerfs[0];
    const actsDiv = document.createElement('div');
    actsDiv.className = 'tree-comp-acts';
    if (p.date) {
      const yearSpan = document.createElement('span');
      yearSpan.className = 'rec-year';
      yearSpan.textContent = p.date.slice(0, 4);
      actsDiv.appendChild(yearSpan);
    }
    const playBtn = document.createElement('button');
    playBtn.className = 'rec-play-btn play-btn-concert';
    playBtn.setAttribute('data-vid', p.video_id);
    playBtn.title = p.short_title || p.title || 'Play';
    playBtn.textContent = '\u25B6';
    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      openOrFocusPlayer(
        p.video_id, p.display_title, artistLabel,
        p.offset_seconds > 0 ? p.offset_seconds : undefined,
        p.short_title || p.title, [],
        { nodeId, ragaId: p.raga_id || null, compositionId: p.composition_id || null }
      );
    });
    actsDiv.appendChild(playBtn);
    actsDiv.appendChild(buildYtLink(p.video_id, p.offset_seconds || 0));
    compHeader.appendChild(actsDiv);
  } else {
    // ── Multiple recordings: toggle button (starts expanded) ──────────────
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'tree-rec-toggle';
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.textContent = '\u25BC ' + recCount + ' recordings';
    compHeader.appendChild(toggleBtn);

    li.appendChild(compHeader);

    // Composer chip
    const composerChip = buildComposerChip(compId);
    if (composerChip) {
      const metaDiv = document.createElement('div');
      metaDiv.className = 'tree-comp-meta';
      metaDiv.appendChild(composerChip);
      li.appendChild(metaDiv);
    }

    // Recording rows — start visible
    const recUl = document.createElement('ul');
    recUl.className = 'tree-rec-list';
    recUl.hidden = false;

    sortedPerfs.forEach((p, idx) => {
      const recLi = document.createElement('li');
      recLi.className = 'tree-leaf';
      recLi.dataset.vid = p.video_id;
      if (playerRegistry.has(p.video_id)) recLi.classList.add('playing');

      const row = document.createElement('div');
      row.className = 'trail-row2';

      const chipsDiv = document.createElement('div');
      chipsDiv.className = 'trail-chips';
      const labelParts = ['v' + (idx + 1)];
      if (p.date) labelParts.push(p.date.slice(0, 4));
      if (p.short_title) labelParts.push(p.short_title);
      const verSpan = document.createElement('span');
      verSpan.className = 'rec-version-label';
      verSpan.textContent = labelParts.join(' \u00b7 ');
      chipsDiv.appendChild(verSpan);
      row.appendChild(chipsDiv);

      const actsDiv = document.createElement('div');
      actsDiv.className = 'trail-acts';
      const playBtn = document.createElement('button');
      playBtn.className = 'rec-play-btn play-btn-concert';
      playBtn.setAttribute('data-vid', p.video_id);
      playBtn.title = p.short_title || p.title || 'Play';
      playBtn.textContent = '\u25B6';
      playBtn.addEventListener('click', e => {
        e.stopPropagation();
        openOrFocusPlayer(
          p.video_id, p.display_title, artistLabel,
          p.offset_seconds > 0 ? p.offset_seconds : undefined,
          p.short_title || p.title, [],
          { nodeId, ragaId: p.raga_id || null, compositionId: p.composition_id || null }
        );
      });
      actsDiv.appendChild(playBtn);
      actsDiv.appendChild(buildYtLink(p.video_id, p.offset_seconds || 0));
      row.appendChild(actsDiv);

      recLi.appendChild(row);
      recUl.appendChild(recLi);
    });

    li.appendChild(recUl);

    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      recUl.hidden = isExpanded;
      toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
      toggleBtn.textContent = (isExpanded ? '\u25B6 ' : '\u25BC ') + recCount + ' recordings';
    });

    return li;
  }

  li.appendChild(compHeader);

  // Composer chip (single-recording path)
  const composerChip = buildComposerChip(compId);
  if (composerChip) {
    const metaDiv = document.createElement('div');
    metaDiv.className = 'tree-comp-meta';
    metaDiv.appendChild(composerChip);
    li.appendChild(metaDiv);
  }

  return li;
}

// buildRagaGroupItem — renders a <li class="tree-group"> for one raga
function buildRagaGroupItem(ragaId, ragaObj, perfs, nodeId, artistLabel) {
  // Group perfs by composition_id
  const compMap = new Map();
  const nullCompPerfs = [];
  perfs.forEach(p => {
    if (!p.composition_id) { nullCompPerfs.push(p); return; }
    if (!compMap.has(p.composition_id)) compMap.set(p.composition_id, []);
    compMap.get(p.composition_id).push(p);
  });

  // Sort compositions by earliest year (asc), nulls last
  const sortedComps = [...compMap.entries()].sort((a, b) => {
    const yearA = Math.min(...a[1].map(p => p.date ? parseInt(p.date) : Infinity));
    const yearB = Math.min(...b[1].map(p => p.date ? parseInt(p.date) : Infinity));
    if (!isFinite(yearA) && !isFinite(yearB)) return 0;
    if (!isFinite(yearA)) return 1;
    if (!isFinite(yearB)) return -1;
    return yearA - yearB;
  });

  const li = document.createElement('li');
  li.className = 'tree-group tree-group-open';

  // ── Header: raga chip only — no chevron, no count ──────────────────────
  const header = document.createElement('div');
  header.className = 'tree-group-header';

  if (ragaId && ragaObj) {
    const ragaChip = document.createElement('span');
    ragaChip.className = 'raga-chip';
    ragaChip.textContent = ragaObj.name;
    ragaChip.title = 'Explore ' + ragaObj.name + ' in Bani Flow';
    ragaChip.addEventListener('click', e => {
      e.stopPropagation();
      ragaChip.classList.add('chip-tapped');
      setTimeout(() => ragaChip.classList.remove('chip-tapped'), 200);
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('raga', ragaId);
    });
    header.appendChild(ragaChip);
  } else {
    const miscSpan = document.createElement('span');
    miscSpan.className = 'rec-group-label rec-unknown';
    miscSpan.textContent = 'Misc';
    header.appendChild(miscSpan);
  }

  li.appendChild(header);

  // ── Children ───────────────────────────────────────────────────────────
  const ul = document.createElement('ul');
  ul.className = 'tree-children';
  sortedComps.forEach(([compId, compPerfs]) => {
    ul.appendChild(buildCompNode(compId, compPerfs, nodeId, artistLabel));
  });
  if (nullCompPerfs.length > 0) {
    ul.appendChild(buildCompNode(null, nullCompPerfs, nodeId, artistLabel));
  }
  li.appendChild(ul);

  return li;
}

// buildRagaTree — renders all raga groups from a structured_perfs array
// Returns a DocumentFragment to append to the list.
function buildRagaTree(perfs, nodeId, artistLabel) {
  const ragaMap = new Map();
  const nullRagaPerfs = [];

  perfs.forEach(p => {
    if (!p.raga_id) { nullRagaPerfs.push(p); return; }
    if (!ragaMap.has(p.raga_id)) {
      const ragaObj = (typeof ragas !== 'undefined' ? ragas : []).find(r => r.id === p.raga_id) || null;
      ragaMap.set(p.raga_id, { ragaObj, perfs: [] });
    }
    ragaMap.get(p.raga_id).perfs.push(p);
  });

  // Sort raga groups: most recordings first; alphabetical tie-break
  const sortedRagas = [...ragaMap.entries()].sort((a, b) => {
    const countDiff = b[1].perfs.length - a[1].perfs.length;
    if (countDiff !== 0) return countDiff;
    const nameA = (a[1].ragaObj ? a[1].ragaObj.name : a[0]).toLowerCase();
    const nameB = (b[1].ragaObj ? b[1].ragaObj.name : b[0]).toLowerCase();
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });

  const fragment = document.createDocumentFragment();
  sortedRagas.forEach(([ragaId, { ragaObj, perfs: ragaPerfs }]) => {
    fragment.appendChild(buildRagaGroupItem(ragaId, ragaObj, ragaPerfs, nodeId, artistLabel));
  });
  if (nullRagaPerfs.length > 0) {
    fragment.appendChild(buildRagaGroupItem(null, null, nullRagaPerfs, nodeId, artistLabel));
  }
  return fragment;
}

// ── buildRecordingsList — concert-bracketed + legacy flat (ADR-018) ───────────
function buildRecordingsList(nodeId, nodeData) {
  const recPanel  = document.getElementById('recordings-panel');
  const recList   = document.getElementById('recordings-list');
  const recFilter = document.getElementById('rec-filter');
  recList.innerHTML = '';

  const nd = nodeData || cy.getElementById(nodeId).data();
  const legacyTracks    = nd.tracks || [];
  const structuredPerfs = musicianToPerformances[nodeId] || [];
  const artistLabel     = nd.label || '';

  // ── 1. Group structured perfs by recording_id → session_index ────────────
  const concertMap = new Map();
  structuredPerfs.forEach(p => {
    if (!concertMap.has(p.recording_id)) {
      concertMap.set(p.recording_id, {
        recording_id: p.recording_id,
        title:        p.title,
        short_title:  p.short_title,
        date:         p.date,
        year:         p.date ? parseInt(p.date) : null,
        sessions:     new Map(),
      });
    }
    const concert = concertMap.get(p.recording_id);
    if (!concert.sessions.has(p.session_index)) {
      concert.sessions.set(p.session_index, {
        session_index: p.session_index,
        performers:    p.performers || [],
        perfs:         [],
      });
    }
    concert.sessions.get(p.session_index).perfs.push(p);
  });

  // Sort concerts chronologically (nulls last)
  const concerts = [...concertMap.values()].sort((a, b) => {
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    return a.year - b.year;
  });

  // Flatten sessions map to sorted array
  concerts.forEach(c => {
    c.sessions = [...c.sessions.values()].sort(
      (a, b) => a.session_index - b.session_index
    );
  });

  concerts.forEach(concert => {
    const bracket = buildConcertBracket(concert, nodeId, artistLabel);
    recList.appendChild(bracket);
  });

  // ── 2. Raga tree — structured perfs + normalized legacy, all grouped by raga ──
  // Deduplicate: legacy entries whose video_id is already in structured_perfs are skipped.
  const structuredVideoIds = new Set(structuredPerfs.map(p => p.video_id));
  const normalizedLegacy = legacyTracks
    .filter(t => !structuredVideoIds.has(t.vid))
    .map(t => ({
      video_id:       t.vid,
      display_title:  t.label || '',
      date:           t.year ? String(t.year) : null,
      short_title:    null,
      title:          null,
      raga_id:        t.raga_id || null,
      composition_id: t.composition_id || null,
      offset_seconds: 0,
    }));
  const allPerfs = [...structuredPerfs, ...normalizedLegacy];
  if (allPerfs.length > 0) {
    const ragaHeader = document.createElement('div');
    ragaHeader.className = 'rec-section-header';
    ragaHeader.textContent = 'By raga';
    recList.appendChild(ragaHeader);
    recList.appendChild(buildRagaTree(allPerfs, nodeId, artistLabel));
  }

  // ── 4. Compositions by this musician (ADR-057) ───────────────────────────
  // Find any composer whose musician_node_id matches this nodeId.
  // List their compositions grouped under a collapsible header, each with
  // a comp-chip (navigable) + raga-chip + composer name.
  const composerForNode = (typeof composers !== 'undefined' ? composers : []).find(
    c => c.musician_node_id === nodeId
  );
  const composerComps = composerForNode
    ? (typeof compositions !== 'undefined' ? compositions : []).filter(
        c => c.composer_id === composerForNode.id
      )
    : [];

  if (composerComps.length > 0) {
    const compSection = document.createElement('div');
    compSection.className = 'comp-section';

    const compHeader = document.createElement('div');
    compHeader.className = 'comp-section-header';
    compHeader.textContent = `Compositions (${composerComps.length})`;
    compSection.appendChild(compHeader);

    const compList = document.createElement('ul');
    compList.className = 'comp-section-list';

    composerComps
      .slice()
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      .forEach(comp => {
        const li = document.createElement('li');
        li.className = 'comp-section-item';

        // Row 1: composition chip
        const compChip = document.createElement('span');
        compChip.className = 'comp-chip';
        compChip.textContent = comp.title || comp.id;
        compChip.title = comp.title + ' — Explore in Bani Flow';
        compChip.addEventListener('click', e => {
          e.stopPropagation();
          compChip.classList.add('chip-tapped');
          setTimeout(() => compChip.classList.remove('chip-tapped'), 200);
          triggerBaniSearch('comp', comp.id);
        });
        li.appendChild(compChip);

        // Row 2: raga chip indented below
        if (comp.raga_id) {
          const ragaObj = (typeof ragas !== 'undefined' ? ragas : []).find(r => r.id === comp.raga_id);
          if (ragaObj) {
            const ragaRow = document.createElement('div');
            ragaRow.className = 'comp-section-raga';
            const ragaChip = document.createElement('span');
            ragaChip.className = 'raga-chip';
            ragaChip.textContent = ragaObj.name;
            ragaChip.title = 'Explore ' + ragaObj.name + ' in Bani Flow';
            ragaChip.addEventListener('click', e => {
              e.stopPropagation();
              ragaChip.classList.add('chip-tapped');
              setTimeout(() => ragaChip.classList.remove('chip-tapped'), 200);
              triggerBaniSearch('raga', comp.raga_id);
            });
            ragaRow.appendChild(ragaChip);
            li.appendChild(ragaRow);
          }
        }

        compList.appendChild(li);
      });

    compSection.appendChild(compList);
    recList.appendChild(compSection);
  }

  // ── 4. Show/hide panel ────────────────────────────────────────────────────
  const hasContent = concerts.length > 0 || legacyTracks.length > 0 || composerComps.length > 0;
  recPanel.style.display  = hasContent ? 'block' : 'none';
  recFilter.style.display = hasContent ? 'block' : 'none';
}

// ── Named-player API (ADR-029: Sruti Bar) ─────────────────────────────────────
// A secondary registry keyed by a string playerId (e.g. 'sruti').
// Allows sruti_bar.js to open/close a singleton drone player without
// interfering with the vid-keyed concert player registry.
const namedPlayerRegistry = new Map();

/**
 * openPlayer(videoId, title, playerId)
 *
 * Opens a floating YouTube player for the given videoId.
 * - If playerId is provided, the player is tracked in namedPlayerRegistry
 *   under that key. A pre-existing player with the same playerId is closed
 *   first (singleton behaviour). The player spawns at a fixed top-right
 *   position rather than the default stacked offset.
 * - If playerId is omitted, falls through to openOrFocusPlayer() (legacy
 *   concert player behaviour, keyed by vid).
 */
function openPlayer(videoId, title, playerId) {
  if (!playerId) {
    // Legacy path: delegate to existing concert player logic
    openOrFocusPlayer(videoId, title, '', undefined, undefined, []);
    return;
  }

  // Close any existing player with this playerId
  closePlayer(playerId);

  const el = document.createElement('div');
  el.className = 'media-player';

  // Fixed position: top-right of the canvas, below the sruti bar + header
  const main = document.getElementById('main');
  const mainRect = main ? main.getBoundingClientRect() : { width: window.innerWidth };
  const playerWidth = 480;
  const rightMargin = 18;
  const topMargin   = 18;
  el.style.cssText = `top:${topMargin}px; right:${rightMargin}px; left:auto; z-index:${++topZ};`;
  // Override absolute positioning to use right-anchored placement
  el.style.position = 'absolute';
  el.style.right    = rightMargin + 'px';
  el.style.top      = topMargin + 'px';
  el.style.left     = 'auto';
  el.style.width    = playerWidth + 'px';

  // Build bar via DOM (no innerHTML) — consistent with createPlayer
  const namedBar = buildPlayerBar(videoId, '', title, title, false, {});
  el.appendChild(namedBar);

  const namedVideoWrap = document.createElement('div');
  namedVideoWrap.className = 'mp-video-wrap';
  namedVideoWrap.innerHTML = `<iframe class="mp-iframe"
    src="${ytEmbedUrl(videoId)}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
    allowfullscreen></iframe>`;
  el.appendChild(namedVideoWrap);

  const namedResize = document.createElement('div');
  namedResize.className = 'mp-resize';
  namedResize.title = 'Drag to resize';
  el.appendChild(namedResize);

  const instance = {
    el,
    iframe:  el.querySelector('.mp-iframe'),
    titleEl: el.querySelector('.mp-title'),
    vid:     videoId,
    playerId,
  };

  el.querySelector('.mp-close').addEventListener('click', () => {
    closePlayer(playerId);
  });

  wireDrag(el, el.querySelector('.mp-bar'));
  wireResize(el, el.querySelector('.mp-resize'));
  el.addEventListener('mousedown', () => bringToFront(instance));

  if (main) main.appendChild(el);
  bringToFront(instance);
  namedPlayerRegistry.set(playerId, instance);
}

/**
 * closePlayer(playerId)
 *
 * Closes and removes the named player. Stops the iframe src to halt audio.
 * No-op if no player with that playerId exists.
 */
function closePlayer(playerId) {
  if (!namedPlayerRegistry.has(playerId)) return;
  const instance = namedPlayerRegistry.get(playerId);
  instance.iframe.src = '';   // stop audio immediately
  instance.el.remove();
  namedPlayerRegistry.delete(playerId);
}

// ── ADR-037: Mobile singleton media player ────────────────────────────────────
// On screens ≤768px, a single docked player replaces the desktop floating
// multi-window model. Two modes: mini (56px strip above tab bar) and
// full (50vh bottom sheet with iframe + tracklist).

const _isMobilePlayer = () => window.matchMedia('(max-width: 768px)').matches;

let _mobilePlayer = null;  // singleton instance

function _createMobilePlayer() {
  const el = document.createElement('div');
  el.className = 'media-player mini';

  // ── Mini strip ──────────────────────────────────────────────────────────
  const strip = document.createElement('div');
  strip.className = 'mp-mini-strip';

  const progress = document.createElement('div');
  progress.className = 'mp-mini-progress';
  const progressBar = document.createElement('div');
  progressBar.className = 'mp-mini-progress-bar';
  progress.appendChild(progressBar);
  strip.appendChild(progress);

  const playBtn = document.createElement('button');
  playBtn.className = 'mp-mini-play';
  playBtn.textContent = '\u25B6';
  strip.appendChild(playBtn);

  const info = document.createElement('div');
  info.className = 'mp-mini-info';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'mp-mini-title';
  info.appendChild(titleSpan);
  strip.appendChild(info);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'mp-mini-close';
  closeBtn.textContent = '\u2715';
  strip.appendChild(closeBtn);

  el.appendChild(strip);

  // ── Full-mode handle ────────────────────────────────────────────────────
  const handle = document.createElement('div');
  handle.className = 'mp-full-handle';
  const pill = document.createElement('span');
  pill.className = 'mp-full-handle-pill';
  handle.appendChild(pill);
  el.appendChild(handle);

  // ── Full-mode bar (will be populated per track) ─────────────────────────
  const bar = document.createElement('div');
  bar.className = 'mp-bar';
  el.appendChild(bar);

  // ── Video wrap ──────────────────────────────────────────────────────────
  const videoWrap = document.createElement('div');
  videoWrap.className = 'mp-video-wrap';
  el.appendChild(videoWrap);

  // ── Tracklist ───────────────────────────────────────────────────────────
  const tracklistDiv = document.createElement('div');
  tracklistDiv.className = 'mp-tracklist';
  el.appendChild(tracklistDiv);

  // Append to body (fixed positioning, not inside #main)
  document.body.appendChild(el);

  const mp = {
    el, strip, bar, videoWrap, tracklistDiv, handle,
    miniTitle: titleSpan,
    miniPlay: playBtn,
    miniClose: closeBtn,
    progressBar,
    iframe: null,
    vid: null,
    tracks: [],
    trackIndex: 0,
    artistName: '',
    concertTitle: '',
    meta: {},
    _savedPanelState: null,
  };

  _wireMobilePlayerEvents(mp);
  return mp;
}

function _getMobilePlayer() {
  if (!_mobilePlayer) _mobilePlayer = _createMobilePlayer();
  return _mobilePlayer;
}

// ── ADR-043: Player reveal on play ────────────────────────────────────────────
// showMiniPlayer() slides the mini-player strip into view and lifts drawers/canvas.
// hideMiniPlayer() reverses: slides it down and restores normal bottom offset.
// Both are idempotent — safe to call when already in the target state.

function showMiniPlayer() {
  const mp = _getMobilePlayer();
  mp.el.style.display = '';
  // Force layout so the initial translateY(100%) is computed before animating
  void mp.el.offsetHeight;
  mp.el.classList.add('player-visible');
  document.body.classList.add('mobile-mini-player');
  if (typeof cy !== 'undefined') setTimeout(function () { cy.resize(); }, 40);
}

function hideMiniPlayer() {
  if (!_mobilePlayer) return;
  const mp = _mobilePlayer;
  mp.el.classList.remove('player-visible');
  document.body.classList.remove('mobile-mini-player');
  if (typeof cy !== 'undefined') setTimeout(function () { cy.resize(); }, 40);
}

function _wireMobilePlayerEvents(mp) {
  // Tap mini strip info area → expand to full
  mp.strip.addEventListener('click', e => {
    if (e.target === mp.miniClose || e.target === mp.miniPlay ||
        mp.miniClose.contains(e.target) || mp.miniPlay.contains(e.target)) return;
    _expandMobilePlayer();
  });

  // Mini play button → expand (YouTube iframe API isn't loaded, so user
  // controls playback in full mode directly)
  mp.miniPlay.addEventListener('click', e => {
    e.stopPropagation();
    _expandMobilePlayer();
  });

  // Mini close
  mp.miniClose.addEventListener('click', e => {
    e.stopPropagation();
    _closeMobilePlayer();
  });

  // Full mode handle: swipe down → collapse; tap → collapse
  let handleTouchY = null;
  mp.handle.addEventListener('touchstart', e => {
    handleTouchY = e.touches[0].clientY;
  }, { passive: true });
  mp.handle.addEventListener('touchend', e => {
    if (handleTouchY === null) return;
    const dy = e.changedTouches[0].clientY - handleTouchY;
    handleTouchY = null;
    if (dy > 20) _collapseMobilePlayer();
  }, { passive: true });
  mp.handle.addEventListener('click', () => _collapseMobilePlayer());

  // Mini strip: swipe left/right → track switching
  let stripTouchX = null;
  mp.strip.addEventListener('touchstart', e => {
    stripTouchX = e.touches[0].clientX;
  }, { passive: true });
  mp.strip.addEventListener('touchend', e => {
    if (stripTouchX === null) return;
    const dx = e.changedTouches[0].clientX - stripTouchX;
    stripTouchX = null;
    if (Math.abs(dx) < 40) return;
    _swipeMobileTrack(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function _openMobilePlayer(vid, trackLabel, artistName, startSeconds, concertTitle, tracks, meta) {
  const mp = _getMobilePlayer();

  // Stop any previous playback
  if (mp.iframe) mp.iframe.src = '';

  mp.vid = vid;
  mp.tracks = (Array.isArray(tracks) && tracks.length > 0) ? tracks : [];
  mp.trackIndex = 0;
  mp.artistName = artistName || '';
  mp.concertTitle = concertTitle || '';
  // ADR-066: store artistName in meta so updatePlayerFooter can build musician chip
  mp.meta = Object.assign({ artistName: artistName || null }, meta || {});
  mp.currentRagaId = (meta && meta.ragaId) || null;  // ADR-049

  // Find the track index matching startSeconds
  if (mp.tracks.length > 0 && startSeconds > 0) {
    const idx = mp.tracks.findIndex(t => t.offset_seconds === startSeconds);
    if (idx >= 0) mp.trackIndex = idx;
  }

  // Update mini strip title
  const currentTrack = mp.tracks[mp.trackIndex];
  const displayTitle = currentTrack ? currentTrack.display_title : trackLabel;
  mp.miniTitle.textContent = (artistName ? artistName + ' \u2014 ' : '') +
                             (displayTitle || concertTitle || '');

  // ── Build full-mode bar ─────────────────────────────────────────────────
  mp.bar.innerHTML = '';
  const fullBar = buildPlayerBar(vid, artistName, concertTitle, trackLabel,
                                 mp.tracks.length > 0, meta || {});
  while (fullBar.firstChild) mp.bar.appendChild(fullBar.firstChild);

  // Re-wire close button inside full bar
  const barClose = mp.bar.querySelector('.mp-close');
  if (barClose) {
    barClose.addEventListener('click', e => {
      e.stopPropagation();
      _closeMobilePlayer();
    });
  }

  // ── ADR-066: wire tracklist toggle button (was unwired on mobile path) ───
  // Tracklist starts hidden (fold-first); hamburger reveals it.
  mp.tracklistDiv.classList.remove('mp-tracklist-open');
  const mobileToggleBtn = mp.bar.querySelector('.mp-tracklist-toggle');
  if (mobileToggleBtn && mp.tracks.length > 0) {
    // Remove any previous listener by cloning the button node
    const freshToggle = mobileToggleBtn.cloneNode(true);
    mobileToggleBtn.parentNode.replaceChild(freshToggle, mobileToggleBtn);
    freshToggle.classList.remove('mp-tracklist-open');
    freshToggle.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = mp.tracklistDiv.classList.contains('mp-tracklist-open');
      mp.tracklistDiv.classList.toggle('mp-tracklist-open', !isOpen);
      freshToggle.classList.toggle('mp-tracklist-open', !isOpen);
      if (!isOpen) {
        mp.tracklistDiv.querySelectorAll('.mp-track-item').forEach((li, idx) => {
          li.classList.toggle('mp-track-active', idx === mp.trackIndex);
        });
      }
    });
  }

  // ── Build iframe ────────────────────────────────────────────────────────
  mp.videoWrap.innerHTML = '';
  mp.videoWrap.style.paddingTop = '56.25%';
  mp.videoWrap.style.height = '';
  const iframe = document.createElement('iframe');
  iframe.className = 'mp-iframe';
  iframe.src = ytEmbedUrl(vid, startSeconds);
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope';
  iframe.allowFullscreen = true;
  mp.videoWrap.appendChild(iframe);
  mp.iframe = iframe;

  // ── Build tracklist ─────────────────────────────────────────────────────
  mp.tracklistDiv.innerHTML = '';
  if (mp.tracks.length > 0) {
    const pseudoInstance = {
      el: mp.el, iframe: mp.iframe, tracklistEl: mp.tracklistDiv,
      vid, currentOffset: startSeconds || 0,
      meta: mp.meta,
    };
    const trackUl = buildPlayerTrackList(vid, mp.tracks, pseudoInstance);
    mp.tracklistDiv.appendChild(trackUl);
    trackUl.querySelectorAll('.mp-track-item').forEach((li, idx) => {
      li.classList.toggle('mp-track-active', idx === mp.trackIndex);
    });
  }

  // ── Dot indicators ──────────────────────────────────────────────────────
  _updateMiniDots(mp);

  // ── ADR-066: Build footer chips on initial mobile load ──────────────────
  // Passes full meta (musician, raga, comp, displayTitle) so all chips show.
  // When tracks=[] (single-recording from raga tree), _initTrack is null so we
  // fall back to mp.meta for both ragaId and compositionId.
  const _initTrack = mp.tracks[mp.trackIndex] || null;
  updatePlayerFooter(
    { el: mp.el, meta: mp.meta },
    _initTrack ? (_initTrack.raga_id || null) : (mp.currentRagaId || null),
    _initTrack ? (_initTrack.composition_id || null) : ((mp.meta && mp.meta.compositionId) || null),
    _initTrack ? (_initTrack.display_title || null) : (trackLabel || null)
  );

  // Show player in mini mode
  mp.el.classList.remove('full-mobile');
  mp.el.classList.add('mini');
  // ADR-043: slide mini-player into view + lift drawers/canvas
  showMiniPlayer();
  // ADR-049: auto-expand to full player; skip the mini strip
  setTimeout(function () { _expandMobilePlayer(); }, 60);

  // Register in playerRegistry (unregister any previous mobile entry first)
  for (const [key, val] of playerRegistry) {
    if (val._isMobileSingleton) { playerRegistry.delete(key); break; }
  }
  playerRegistry.set(vid, {
    el: mp.el, iframe: mp.iframe, titleEl: mp.bar.querySelector('.mp-title'),
    tracklistEl: mp.tracklistDiv, vid, _isMobileSingleton: true,
  });
  refreshPlayingIndicators();
}

function _expandMobilePlayer() {
  if (!_mobilePlayer) return;
  const mp = _mobilePlayer;

  // Save current panel state and dismiss sheet (ADR-036 integration)
  if (typeof window._currentPanelState !== 'undefined') {
    mp._savedPanelState = window._currentPanelState;
  }
  if (typeof window.setPanelState === 'function') {
    window.setPanelState('IDLE');
  }
  // ADR-049: expand mela+janya then pan/zoom to the raga if the wheel is the active view.
  // syncRagaWheelToFilter triggers the mela expand (sets _wheelSyncInProgress=true);
  // orientRagaWheel polls until clear, then animates the viewport.
  if (mp.currentRagaId) {
    if (typeof syncRagaWheelToFilter === 'function') {
      syncRagaWheelToFilter('raga', mp.currentRagaId);
    }
    if (typeof orientRagaWheel === 'function') {
      orientRagaWheel('raga', mp.currentRagaId);
    }
  }

  mp.el.classList.remove('mini');
  mp.el.classList.add('full-mobile');
  // ADR-042: full player covers lower half; mini strip gone, restore normal offset
  document.body.classList.remove('mobile-mini-player');
  if (typeof cy !== 'undefined') setTimeout(function () { cy.resize(); }, 40);
}

function _collapseMobilePlayer() {
  if (!_mobilePlayer) return;
  const mp = _mobilePlayer;

  mp.el.classList.remove('full-mobile');
  mp.el.classList.add('mini');
  // ADR-043: restore mini strip visibility + drawer offset
  showMiniPlayer();

  // Restore saved panel state
  if (mp._savedPanelState && typeof window.setPanelState === 'function') {
    window.setPanelState(mp._savedPanelState);
    mp._savedPanelState = null;
  }
}
// ADR-050: expose for mobile.js setPanelState to call on exploration
window._collapseMobilePlayer = _collapseMobilePlayer;

function _closeMobilePlayer() {
  if (!_mobilePlayer) return;
  const mp = _mobilePlayer;

  if (mp.iframe) mp.iframe.src = '';
  mp.vid = null;
  // ADR-043: hide player + restore normal bottom offset
  mp.el.classList.remove('full-mobile');
  mp.el.style.display = 'none';
  hideMiniPlayer();

  // Unregister from playerRegistry
  for (const [key, val] of playerRegistry) {
    if (val._isMobileSingleton) { playerRegistry.delete(key); break; }
  }
  refreshPlayingIndicators();

  // Restore panel state if we were in full mode
  if (mp._savedPanelState && typeof window.setPanelState === 'function') {
    window.setPanelState(mp._savedPanelState);
    mp._savedPanelState = null;
  }
}

function _swipeMobileTrack(direction) {
  if (!_mobilePlayer || !_mobilePlayer.tracks.length) return;
  const mp = _mobilePlayer;
  const newIndex = mp.trackIndex + direction;
  if (newIndex < 0 || newIndex >= mp.tracks.length) return;

  mp.trackIndex = newIndex;
  const track = mp.tracks[newIndex];

  // Update iframe to new timestamp
  if (mp.iframe) {
    mp.iframe.src = ytEmbedUrl(mp.vid,
      track.offset_seconds > 0 ? track.offset_seconds : undefined);
  }

  // Update mini title
  mp.miniTitle.textContent = (mp.artistName ? mp.artistName + ' \u2014 ' : '') +
                             (track.display_title || '');

  // Update dot indicators
  _updateMiniDots(mp);

  // Update tracklist active indicator
  mp.tracklistDiv.querySelectorAll('.mp-track-item').forEach((li, idx) => {
    li.classList.toggle('mp-track-active', idx === newIndex);
  });

  // Update footer chips in full mode (ADR-066: include meta + displayTitle)
  updatePlayerFooter(
    { el: mp.el, meta: mp.meta },
    track.raga_id || null,
    track.composition_id || null,
    track.display_title || null
  );
}

function _updateMiniDots(mp) {
  const existing = mp.strip.querySelector('.mp-mini-dots');
  if (existing) existing.remove();

  if (mp.tracks.length <= 1) return;

  const dots = document.createElement('span');
  dots.className = 'mp-mini-dots';

  const total = mp.tracks.length;
  const current = mp.trackIndex;
  let start = Math.max(0, current - 2);
  let end = Math.min(total, start + 5);
  if (end - start < 5) start = Math.max(0, end - 5);

  for (let i = start; i < end; i++) {
    const dot = document.createElement('span');
    dot.className = i === current ? 'mp-dot mp-dot-active' : 'mp-dot';
    dots.appendChild(dot);
  }

  mp.strip.querySelector('.mp-mini-info').appendChild(dots);
}

