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
  let resizing = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', e => {
    resizing = true; startY = e.clientY; startH = el.offsetHeight;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    el.style.height = Math.max(180, startH + e.clientY - startY) + 'px';
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

  // ── Artist chip ────────────────────────────────────────────────────────────
  if (artistName) {
    const artistChip = document.createElement('span');
    artistChip.className = 'mp-artist-chip';
    artistChip.textContent = artistName;
    if (meta.nodeId) {
      artistChip.title = 'Pan to ' + artistName + ' on graph';
      artistChip.addEventListener('click', e => {
        e.stopPropagation();
        if (typeof orientToNode === 'function') orientToNode(meta.nodeId);
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

// ── buildPlayerFooter — raga + composition chips below the video ──────────────
// Only rendered when at least one of ragaId / compositionId is present.
// meta = { ragaId, compositionId } — both optional
function buildPlayerFooter(meta) {
  if (!meta) return null;
  const { ragaId, compositionId } = meta;
  if (!ragaId && !compositionId) return null;

  const footer = document.createElement('div');
  footer.className = 'mp-footer';

  if (ragaId) {
    const ragaObj = (typeof ragas !== 'undefined') ? ragas.find(r => r.id === ragaId) : null;
    const ragaName = ragaObj ? ragaObj.name : ragaId;
    const ragaChip = document.createElement('span');
    ragaChip.className = 'mp-raga-chip';
    ragaChip.textContent = ragaName;
    ragaChip.title = 'Explore ' + ragaName + ' in Bani Flow';
    ragaChip.addEventListener('click', e => {
      e.stopPropagation();
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('raga', ragaId);
    });
    footer.appendChild(ragaChip);
  }

  if (compositionId) {
    const compObj = (typeof compositions !== 'undefined')
      ? compositions.find(c => c.id === compositionId) : null;
    const compName = compObj ? compObj.title : compositionId;
    const compChip = document.createElement('span');
    compChip.className = 'mp-comp-chip';
    compChip.textContent = compName;
    compChip.title = 'Explore ' + compName + ' in Bani Flow';
    compChip.addEventListener('click', e => {
      e.stopPropagation();
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', compositionId);
    });
    footer.appendChild(compChip);
  }

  return footer;
}

function createPlayer(vid, trackLabel, artistName, startSeconds, concertTitle, tracks, meta) {
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;

  const pos = nextSpawnPosition();
  const el = document.createElement('div');
  el.className = 'media-player';
  el.style.cssText = `top:${pos.top}px; left:${pos.left}px; z-index:${++topZ};`;

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

  // ── Footer: raga + composition chips (below video, above resize grip) ──────
  const footer = buildPlayerFooter(meta || {});
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

// ── buildConcertBracket — build one concert bracket DOM element ───────────────
function buildConcertBracket(concert, nodeId, artistLabel) {
  // Collect all performers across all sessions, deduplicated, excluding self
  const coPerformerMap = new Map();
  let totalPieces = 0;
  concert.sessions.forEach(session => {
    totalPieces += session.perfs.length;
    session.performers.forEach(pf => {
      if (pf.musician_id === nodeId) return;
      const key   = pf.musician_id || ('_' + (pf.unmatched_name || '?'));
      if (coPerformerMap.has(key)) return;
      let label;
      if (pf.musician_id) {
        const node = cy.getElementById(pf.musician_id);
        label = (node && node.length > 0) ? (node.data('label') || pf.musician_id) : pf.musician_id;
      } else {
        label = pf.unmatched_name || '?';
      }
      coPerformerMap.set(key, label);
    });
  });
  const coPerformers = [...coPerformerMap.values()].join(', ');

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

  const performersDiv = document.createElement('div');
  performersDiv.className = 'concert-performers';
  performersDiv.textContent = coPerformers;

  const countDiv = document.createElement('div');
  countDiv.className = 'concert-count';
  countDiv.textContent = totalPieces + (totalPieces === 1 ? ' piece' : ' pieces');

  headerBody.appendChild(titleRow);
  if (coPerformers) headerBody.appendChild(performersDiv);
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
      // Row click → cross-navigate (composition or raga)
      li.addEventListener('click', () => {
        if (p.composition_id) triggerBaniSearch('comp', p.composition_id);
        else if (p.raga_id)   triggerBaniSearch('raga', p.raga_id);
      });

      // Row 1: composition title
      const row1 = document.createElement('div');
      row1.className = 'rec-row1';
      const titleEl = document.createElement('span');
      titleEl.className = 'rec-title';
      if (p.composition_id) {
        const comp = compositions.find(c => c.id === p.composition_id);
        titleEl.textContent = comp ? comp.title : (p.display_title || '');
      } else {
        const typeIcon = { interview: '🎤 ', lecture: '🎓 ', radio: '📻 ' }[p.type] || '';
        titleEl.textContent = typeIcon + (p.display_title || '');
      }
      row1.appendChild(titleEl);

      // ▶ button → play only
      const playBtn = document.createElement('button');
      playBtn.className = 'rec-play-btn';
      playBtn.title = 'Play';
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

      // Row 2: raga · tala + timestamp link
      const row2 = document.createElement('div');
      row2.className = 'rec-row2';
      const metaSpan = document.createElement('span');
      metaSpan.className = 'rec-meta';
      const ragaObj = p.raga_id ? ragas.find(r => r.id === p.raga_id) : null;
      const ragaName = ragaObj ? ragaObj.name : (p.raga_id || '');
      const talaPart = p.tala || '';
      if (ragaObj && p.raga_id) {
        const ragaLink = document.createElement('span');
        ragaLink.className = 'rec-raga-link';
        ragaLink.textContent = ragaObj.name;
        ragaLink.title = 'Explore raga in Bani Flow';
        ragaLink.addEventListener('click', e => {
          e.stopPropagation();
          triggerBaniSearch('raga', p.raga_id);
        });
        metaSpan.appendChild(ragaLink);
        if (talaPart) {
          metaSpan.appendChild(document.createTextNode(' · ' + talaPart));
        }
      } else {
        metaSpan.textContent = [ragaName, talaPart].filter(Boolean).join(' · ');
      }

      const linkA = document.createElement('a');
      linkA.className = 'rec-link';
      linkA.href      = ytDirectUrl(p.video_id, p.offset_seconds > 0 ? p.offset_seconds : undefined);
      linkA.target    = '_blank';
      linkA.textContent = (p.offset_seconds > 0
        ? formatTimestamp(p.offset_seconds)
        : '00:00') + ' \u2197';
      linkA.title = 'Open in YouTube at this timestamp';
      linkA.addEventListener('click', e => e.stopPropagation());

      row2.appendChild(metaSpan);
      row2.appendChild(linkA);

      li.appendChild(row1);
      li.appendChild(row2);
      perfList.appendChild(li);
    });
  });

  bracket.appendChild(perfList);
  return bracket;
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

  // ── 2. Legacy tracks as flat items (sorted by year) ───────────────────────
  const sortedLegacy = legacyTracks.slice().sort((a, b) => {
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    return a.year - b.year;
  });

  sortedLegacy.forEach(t => {
    const li = document.createElement('li');
    li.className = 'rec-legacy' + (playerRegistry.has(t.vid) ? ' playing' : '');
    li.dataset.vid = t.vid;
    // Row click → cross-navigate
    li.addEventListener('click', () => {
      if (t.composition_id) triggerBaniSearch('comp', t.composition_id);
      else if (t.raga_id)   triggerBaniSearch('raga', t.raga_id);
    });

    const row1 = document.createElement('div');
    row1.className = 'rec-row1';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'rec-title';
    const typeIcon = { interview: '🎤 ', lecture: '🎓 ', radio: '📻 ' }[t.type] || '';
    titleSpan.textContent = typeIcon + (t.label || '');
    const yearSpan = document.createElement('span');
    yearSpan.className = 'rec-year';
    yearSpan.textContent = t.year ? String(t.year) : '';
    row1.appendChild(titleSpan);
    row1.appendChild(yearSpan);

    // ▶ button → play only
    const playBtn = document.createElement('button');
    playBtn.className = 'rec-play-btn';
    playBtn.title = 'Play';
    playBtn.textContent = '▶';
    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      openOrFocusPlayer(t.vid, t.label, artistLabel, undefined, undefined, undefined,
        { nodeId, ragaId: t.raga_id || null, compositionId: t.composition_id || null });
    });
    row1.appendChild(playBtn);

    const row2 = document.createElement('div');
    row2.className = 'rec-row2';
    const metaSpan = document.createElement('span');
    metaSpan.className = 'rec-meta';
    if (t.raga_id) {
      const ragaObj = ragas.find(r => r.id === t.raga_id);
      if (ragaObj) {
        const ragaLink = document.createElement('span');
        ragaLink.className = 'rec-raga-link';
        ragaLink.textContent = ragaObj.name;
        ragaLink.title = 'Explore raga in Bani Flow';
        ragaLink.addEventListener('click', e => {
          e.stopPropagation();
          triggerBaniSearch('raga', t.raga_id);
        });
        metaSpan.appendChild(ragaLink);
      } else {
        metaSpan.textContent = t.raga_id;
      }
    }
    const linkA = document.createElement('a');
    linkA.className = 'rec-link';
    linkA.href      = ytDirectUrl(t.vid, undefined);
    linkA.target    = '_blank';
    linkA.textContent = '00:00 \u2197';
    linkA.title = 'Open in YouTube';
    linkA.addEventListener('click', e => e.stopPropagation());
    row2.appendChild(metaSpan);
    row2.appendChild(linkA);

    li.appendChild(row1);
    li.appendChild(row2);
    recList.appendChild(li);
  });

  // ── 3. Show/hide panel ────────────────────────────────────────────────────
  const hasContent = concerts.length > 0 || legacyTracks.length > 0;
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
  const playerWidth = 340;
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

