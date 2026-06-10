// ── media player manager ──────────────────────────────────────────────────────
// ADR-154: the registry is keyed by media_key ("provider:provider_id"), not the
// bare YouTube vid. Instances carry { el, iframe, titleEl, media, mediaKey }.
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

// ── ADR-154: provider-agnostic media resolution + embed/share builders ─────────
// resolveMedia() normalises any legacy first-argument the player entry points
// still receive — a bare YouTube id, a "provider:provider_id" key, a full url,
// or an already-built MediaRef — into a MediaRef. This lets every existing call
// site keep passing a YouTube id string while the registry/DOM/permalink migrate
// to media_key underneath.
function resolveMedia(arg) {
  if (!arg) return null;
  if (typeof arg === 'object') return arg.provider ? arg : null;
  if (typeof arg === 'string') {
    if (/^https?:/.test(arg)) {
      const ref = (typeof parseMediaUrl === 'function') ? parseMediaUrl(arg) : null;
      if (ref) return ref;
    }
    // "provider:provider_id" — but not a url (handled above)
    const colon = arg.indexOf(':');
    if (colon > 0 && !/\s/.test(arg) && /^[a-z]+$/.test(arg.slice(0, colon))) {
      const provider = arg.slice(0, colon);
      const pid = arg.slice(colon + 1);
      return { provider, provider_id: pid, url: '', start: 0, controllable: provider !== 'soundcloud' && provider !== 'gdrive' };
    }
    // bare 11-char YouTube id (legacy default)
    return { provider: 'youtube', provider_id: arg, url: 'https://youtu.be/' + arg, start: 0, controllable: true };
  }
  return null;
}

// embedUrl(media, startSeconds) → iframe src for the given provider.
// NOTE: full control inversion (Plyr) arrives in ADR-155; this dispatch keeps
// each provider embeddable in the interim. YouTube behaviour is unchanged.
function embedUrl(media, startSeconds) {
  if (!media) return '';
  switch (media.provider) {
    case 'youtube':    return ytEmbedUrl(media.provider_id, startSeconds);
    case 'vimeo': {
      const t = (startSeconds && startSeconds > 0) ? `#t=${startSeconds}s` : '';
      return `https://player.vimeo.com/video/${media.provider_id}?autoplay=1${t}`;
    }
    case 'soundcloud': return `https://w.soundcloud.com/player/?url=${encodeURIComponent(media.url)}&auto_play=true`;
    case 'gdrive':     return `https://drive.google.com/file/d/${media.provider_id}/preview`;
    default:           return media.url || '';   // audio/video direct — ADR-155 replaces with <audio>/<video>
  }
}

// shareUrl(media, startSeconds) → canonical outbound link (copy / open-in-source).
function shareUrl(media, startSeconds) {
  if (!media) return '';
  switch (media.provider) {
    case 'youtube': return ytDirectUrl(media.provider_id, startSeconds);
    case 'vimeo': {
      const t = (startSeconds && startSeconds > 0) ? `#t=${startSeconds}s` : '';
      return `https://vimeo.com/${media.provider_id}${t}`;
    }
    default: return media.url || '';
  }
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

// Format a tala string for display: snake_case → Title Case with spaces
// e.g. 'khanda_chapu' → 'Khanda Chapu', 'adi' → 'Adi'
function formatTala(tala) {
  if (!tala) return '';
  return tala.split('_').map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}

// Show a brief non-obtrusive notice when the user copies a link to clipboard.
// ADR-151: optional msg param lets the share button show a different label.
let _copyToastTimer = null;
function showCopyLinkToast(msg) {
  const el = document.getElementById('mp-copy-toast');
  if (!el) return;
  el.textContent = msg || 'Link copied';
  el.classList.add('visible');
  clearTimeout(_copyToastTimer);
  _copyToastTimer = setTimeout(function() { el.classList.remove('visible'); }, 1500);
}

// ── ADR-151: encode current UI state as a URL fragment for sharing ───────────
// Reads the player instance (vid, currentOffset, meta), the left-panel trail
// (via window.getBaniTrail), and the right-panel musician node
// (via window.getCurrentPanelNode) and encodes them as a base64 JSON fragment.
function encodePermalink(instance) {
  try {
    const trail   = (typeof window.getBaniTrail === 'function')
      ? window.getBaniTrail() : { back: [] };
    const panelId = (typeof window.getCurrentPanelNode === 'function')
      ? window.getCurrentPanelNode() : null;
    // ADR-154: v:2 carries the provider-qualified media_key (`m`). v:1 readers
    // (permalink.js) still understand the legacy `vid` field, which we continue
    // to emit for YouTube media so freshly-copied links open in older builds.
    const state = { v: 2, m: instance.mediaKey || null };
    if (instance.media && instance.media.provider === 'youtube') state.vid = instance.media.provider_id;
    if (instance.currentOffset > 0) state.t = instance.currentOffset;
    const m = instance.meta || {};
    const meta = {};
    if (m.nodeId)        meta.nid = m.nodeId;
    if (m.ragaId)        meta.rid = m.ragaId;
    if (m.compositionId) meta.cid = m.compositionId;
    if (m.recId)         meta.rec = m.recId;
    if (Object.keys(meta).length) state.meta = meta;
    // ADR-151: encode back-stack + current subject as the full trail.
    // trail.back is the navigation history; trail.current is the subject
    // currently shown in the panel. Both are needed: replaying only the
    // back-stack leaves the panel on the last *previous* subject, not the
    // one the user was actually viewing when they hit Share.
    // Take the last 5 entries total to respect the ADR-151 max-5 constraint.
    const _trailEntries = (trail.back || [])
      .map(function(e) { return { tp: e.type, id: e.id }; });
    if (trail.current && trail.current.type && trail.current.id)
      _trailEntries.push({ tp: trail.current.type, id: trail.current.id });
    if (_trailEntries.length)
      state.trail = _trailEntries.slice(-5);
    if (panelId) state.panel = panelId;
    // btoa over UTF-8: encode JSON to percent-escaped bytes then to latin1
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return '#s=' + b64;
  } catch (err) {
    return null;
  }
}

// Returns { top, left } positioning the player flush-right (or left) of the
// open Wheel Detail Panel, relative to the given offsetParent element.
// Avoids placing the player over any open sidebar panel (#left-sidebar,
// #right-sidebar). Returns null when: WDP is not open, view is not raga, or
// neither side of the WDP has enough room.
function _wdpAdjacentPosition(offsetParentEl) {
  const panel = document.getElementById('wheel-detail-panel');
  if (!panel || !panel.classList.contains('wdp-open')) return null;
  if (typeof currentView !== 'undefined' && currentView !== 'raga') return null;
  const wdpRect = panel.getBoundingClientRect();
  if (!wdpRect.width) return null;
  const parentEl = offsetParentEl || document.getElementById('main');
  if (!parentEl) return null;
  const parentRect = parentEl.getBoundingClientRect();
  const PW = 480; // player width
  const GAP = 16;

  // Compute the safe horizontal zone (viewport x) that doesn't overlap open sidebars.
  // getBoundingClientRect() returns post-transform coords, so closed sidebars
  // (translated off-screen) return rects outside the visible area and are ignored.
  let safeLeft  = parentRect.left;  // viewport x: left edge of available zone
  let safeRight = parentRect.right; // viewport x: right edge of available zone
  const leftSb = document.getElementById('left-sidebar');
  if (leftSb) {
    const r = leftSb.getBoundingClientRect();
    if (r.right > safeLeft + 4) safeLeft = r.right;  // sidebar is visually open
  }
  const rightSb = document.getElementById('right-sidebar');
  if (rightSb) {
    const r = rightSb.getBoundingClientRect();
    if (r.left < safeRight - 4) safeRight = r.left;  // sidebar is visually open
  }

  // Prefer right of WDP; fall back to left; fall back to null (default spawn).
  let left;
  const rightClearance = safeRight - (wdpRect.right + GAP);
  const leftClearance  = (wdpRect.left - GAP) - safeLeft;
  if (rightClearance >= PW) {
    left = wdpRect.right + GAP - parentRect.left;
  } else if (leftClearance >= PW) {
    left = wdpRect.left - GAP - PW - parentRect.left;
  } else {
    return null;
  }

  // Align player top to WDP top, clamped inside parent bounds.
  const rawTop = wdpRect.top - parentRect.top;
  const parentH = parentEl.offsetHeight || (window.innerHeight - parentRect.top);
  const top = Math.max(0, Math.min(rawTop, parentH - 220));
  return { top: Math.round(top), left: Math.round(left) };
}

function nextSpawnPosition() {
  const offset = (spawnCount % 8) * 28;
  spawnCount += 1;
  const mainEl = document.getElementById('cy-wrap');
  const mw = mainEl ? mainEl.offsetWidth  : 800;
  const mh = mainEl ? mainEl.offsetHeight : 600;
  const pw = 480; // default player width
  const baseLeft = Math.max(0, Math.round((mw - pw) / 2));
  const baseTop  = Math.max(0, Math.round(mh * 0.15));
  return {
    top:  Math.min(baseTop  + offset, mh - 220),
    left: Math.min(baseLeft + offset, mw - pw),
  };
}

function bringToFront(player) {
  topZ += 1;
  player.el.style.zIndex = topZ;
}

function refreshPlayingIndicators() {
  document.querySelectorAll('[data-vid]').forEach(el => {
    const isPlaying = playerRegistry.has(el.dataset.vid);
    el.classList.toggle('playing', isPlaying);
    const btn = el.classList.contains('rec-play-btn') ? el : el.querySelector('.rec-play-btn');
    if (btn) {
      btn.dataset.origTitle = btn.dataset.origTitle || btn.title;
      btn.title = isPlaying ? 'Stop' : (btn.dataset.origTitle || 'Play');
    }
  });
}

function wireDrag(el, bar) {
  let dragging = false, ox = 0, oy = 0, bounds = null, rafPending = false;
  bar.addEventListener('mousedown', e => {
    dragging = true;
    bounds = el.parentElement.getBoundingClientRect();
    ox = e.clientX - el.offsetLeft;
    oy = e.clientY - el.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging || rafPending) return;
    rafPending = true;
    const cx = e.clientX, cy = e.clientY;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!dragging) return;
      el.style.left = Math.max(0, Math.min(cx - ox, bounds.width  - el.offsetWidth))  + 'px';
      el.style.top  = Math.max(0, Math.min(cy - oy, bounds.height - el.offsetHeight)) + 'px';
    });
  });
  document.addEventListener('mouseup', () => { dragging = false; bounds = null; });
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
  let resizing = false, startX = 0, startY = 0, startW = 0, startVideoH = 0,
      resizeVideoWrap = null, rafResizePending = false;
  handle.addEventListener('mousedown', e => {
    resizing = true;
    startX = e.clientX; startY = e.clientY;
    startW = el.offsetWidth;
    // Cache videoWrap reference and current video height once
    resizeVideoWrap = el.querySelector('.mp-video-wrap');
    startVideoH = resizeVideoWrap ? resizeVideoWrap.offsetHeight : Math.round(el.offsetWidth * 9 / 16);
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!resizing || rafResizePending) return;
    rafResizePending = true;
    const cx = e.clientX, cy = e.clientY;
    requestAnimationFrame(() => {
      rafResizePending = false;
      if (!resizing) return;
      // Width: resize the whole player
      el.style.width = Math.max(320, startW + cx - startX) + 'px';
      // Height: resize only the video wrap, not the container
      if (resizeVideoWrap) {
        // Switch from padding-top ratio trick to explicit pixel height
        resizeVideoWrap.style.paddingTop = '0';
        resizeVideoWrap.style.height = Math.max(160, startVideoH + cy - startY) + 'px';
      }
    });
  });
  document.addEventListener('mouseup', () => { resizing = false; resizeVideoWrap = null; });
}

// ── buildNotesSection — render a notes[] array as a soft footnote block ──────
// ADR-097 §7: notes[] = [{text, source_url?, added_at?}]. If the entity has
// string `notes` (legacy raga schema) it is NOT handled here — that is surfaced
// as a tooltip in bani_flow.js. This helper is for the new array shape only.
// Returns a <div class="entity-notes-section"> or null when nothing to render.
function buildNotesSection(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return null;
  const wrap = document.createElement('div');
  wrap.className = 'entity-notes-section';

  const hdr = document.createElement('div');
  hdr.className   = 'notes-section-header';
  hdr.textContent = 'Notes';
  wrap.appendChild(hdr);

  const ul = document.createElement('ul');
  ul.className = 'notes-list';
  notes.forEach(n => {
    if (!n || !n.text) return;
    const li      = document.createElement('li');
    li.className  = 'notes-item';

    const textEl  = document.createElement('span');
    textEl.className  = 'notes-text';
    textEl.textContent = n.text;
    li.appendChild(textEl);

    if (n.source_url) {
      const link = document.createElement('a');
      link.href    = n.source_url;
      link.target  = '_blank';
      link.rel     = 'noopener noreferrer';
      link.className  = 'notes-source-link';
      link.textContent = '\u2197';
      link.title   = n.source_url;
      li.appendChild(link);
    }
    if (n.added_at) {
      const dt        = document.createElement('span');
      dt.className    = 'notes-date';
      dt.textContent  = n.added_at.slice(0, 10);
      li.appendChild(dt);
    }
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  return wrap;
}

// ── buildPlayerTrackList — build the <ul> of track items for the in-player selector ──
function buildPlayerTrackList(mediaKey, tracks, instance) {
  const ul = document.createElement('ul');
  ul.className = 'mp-track-items';

  tracks.forEach(t => {
    const li = document.createElement('li');
    li.className = 'mp-track-item';
    li.dataset.offset = t.offset_seconds;

    const _compCanonical = t.composition_id
      ? (() => { const c = (typeof compositions !== 'undefined' ? compositions : []).find(x => x.id === t.composition_id); return c ? c.title : null; })()
      : null;
    const _trackLabel = _compCanonical || t.display_title || t.composition_id || '';

    // ── Left group: comp-chip · raga-chip · tala ──
    const leftSpan = document.createElement('span');
    leftSpan.className = 'mp-track-left';

    if (t.composition_id) {
      const compChip = document.createElement('span');
      compChip.className = 'comp-chip';
      compChip.textContent = _trackLabel;
      compChip.title = _trackLabel;
      compChip.addEventListener('click', e => {
        e.stopPropagation();
        triggerBaniSearch('comp', t.composition_id);
      });
      leftSpan.appendChild(compChip);
    } else {
      const labelText = document.createElement('span');
      labelText.className = 'mp-track-label';
      labelText.textContent = _trackLabel;
      labelText.title = _trackLabel;
      leftSpan.appendChild(labelText);
    }

    if (t.raga_id && t.raga_name) {
      const ragaChip = document.createElement('span');
      ragaChip.className = 'raga-chip';
      ragaChip.textContent = t.raga_name;
      ragaChip.addEventListener('click', e => {
        e.stopPropagation();
        triggerBaniSearch('raga', t.raga_id);
      });
      leftSpan.appendChild(ragaChip);
    } else if (t.raga_name) {
      const ragaText = document.createElement('span');
      ragaText.className = 'mp-track-raga-text';
      ragaText.textContent = t.raga_name;
      leftSpan.appendChild(ragaText);
    }

    const talaPart = formatTala(t.tala);
    if (talaPart) {
      const talaSpan = document.createElement('span');
      talaSpan.className = 'mp-track-tala';
      talaSpan.textContent = talaPart;
      leftSpan.appendChild(talaSpan);
    }

    // ── Right group: play button · timestamp ──
    const rightSpan = document.createElement('span');
    rightSpan.className = 'mp-track-right';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'mp-track-play-btn';
    playBtn.textContent = '\u25b6';
    playBtn.title = 'Play this track';

    const tsSpan = document.createElement('span');
    tsSpan.className = 'mp-track-ts';
    tsSpan.textContent = t.timestamp || '00:00';

    rightSpan.appendChild(playBtn);
    rightSpan.appendChild(tsSpan);

    li.appendChild(leftSpan);
    li.appendChild(rightSpan);

    li.addEventListener('click', e => {
      if (e.target.closest('.raga-chip, .comp-chip')) return;
      const player = playerRegistry.get(mediaKey);
      if (!player) return;
      // ADR-155: seek via the controller (Plyr → currentTime, no reload). Mobile's
      // iframe pseudo-instance has no controller, so fall back to an iframe reload.
      if (player.controller) player.controller.seek(t.offset_seconds > 0 ? t.offset_seconds : 0);
      else player.iframe.src = embedUrl(player.media, t.offset_seconds > 0 ? t.offset_seconds : undefined);
      player.currentOffset = t.offset_seconds;
      // Update active indicator
      ul.querySelectorAll('.mp-track-item').forEach(el => el.classList.remove('mp-track-active'));
      li.classList.add('mp-track-active');
      // Update footer chips to reflect the newly selected track (ADR-066: pass displayTitle)
      updatePlayerFooter(player, t.raga_id || null, t.composition_id || null, t.display_title || null, t.tala || null);
      refreshPlayingIndicators();
    });

    ul.appendChild(li);
  });

  return ul;
}

// ── buildPlayerBar — [▾] [title] [copy] [≡?] [✕] ──────────────────────────
// Artist chip moves to the footer (buildPlayerFooter). meta.nodeId is still
// stored on the instance so updatePlayerFooter can include the musician chip.
function buildPlayerBar(media, artistName, concertTitle, trackLabel, hasTracks, meta) {
  meta = meta || {};
  const bar = document.createElement('div');
  bar.className = 'mp-bar';

  // ── Fold-cue (▾ visual hint that the bar collapses the player; non-interactive) ─
  const foldCue = document.createElement('span');
  foldCue.className = 'mp-fold-cue';
  foldCue.textContent = '\u25be'; // ▾ small downward-pointing triangle
  bar.appendChild(foldCue);

  // ── Title (fills remaining space) ─────────────────────────────────────────
  const titleText = concertTitle || '';
  if (titleText) {
    const titleSpan = document.createElement('span');
    titleSpan.className = 'mp-title';
    titleSpan.textContent = titleText;
    titleSpan.title = titleText;
    bar.appendChild(titleSpan);
  }

  // ── Track list toggle + close (right-anchored) ────────────────────────────
  const rightGroup = document.createElement('span');
  rightGroup.className = 'mp-bar-right';

  // ADR-139: clipboard copy button — copies ytDirectUrl(vid, currentOffset) to clipboard.
  // Click handler is wired in createPlayer() after the instance is constructed.
  const copyBtn = document.createElement('button');
  copyBtn.className = 'mp-copy-btn';
  copyBtn.title = 'Copy link to clipboard';
  copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8C6.9 5 6 5.9 6 7v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
  rightGroup.appendChild(copyBtn);

  // ADR-151: share button — encodes full UI state (trail + player + panel) as permalink.
  // Click handler is wired in createPlayer() / _openMobilePlayer().
  const shareBtn = document.createElement('button');
  shareBtn.className = 'mp-share-btn';
  shareBtn.title = 'Copy permalink';
  shareBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>';
  rightGroup.appendChild(shareBtn);

  // Watch on YouTube — native anchor so LibRedirect / privacy-redirect extensions intercept it.
  // Uses the youtu.be short URL (no timestamp; this is a gateway link to the source).
  const ytLink = document.createElement('a');
  ytLink.className = 'mp-yt-link';
  ytLink.href = shareUrl(media, 0);
  ytLink.target = '_blank';
  ytLink.rel = 'noopener noreferrer';
  ytLink.title = 'Watch on YouTube';
  ytLink.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M14 3v2h3.59l-9.3 9.29 1.42 1.42L19 6.41V10h2V3z"/><path d="M19 19H5V5h7V3H3v18h18v-9h-2z"/></svg>';
  rightGroup.appendChild(ytLink);

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

// ── _buildMusicianChipForFooter — era-tinted musician chip with transit fallback ─
// Shared by buildPlayerFooter and _buildLecdemSubjectFooter.
// nodeId may be null if only artistName is known (renders chip without navigation).
function _buildMusicianChipForFooter(nodeId, artistName) {
  if (!nodeId && !artistName) return null;
  // ADR-150: resolveNode tries cy first, falls back to elements[] for transit musicians
  const node = (nodeId && typeof resolveNode === 'function') ? resolveNode(nodeId)
    : ((nodeId && typeof cy !== 'undefined') ? cy.getElementById(nodeId) : null);
  const name = node ? (node.data('label') || artistName || nodeId) : (artistName || nodeId);
  if (!name) return null;
  const eraId = node ? (node.data('era') || null) : null;
  const tint  = (typeof THEME !== 'undefined')
    ? THEME.eraTintCss(eraId)
    : { bg: 'transparent', border: 'var(--border-strong)' };
  const chip = document.createElement('span');
  chip.className = 'musician-chip';
  chip.style.setProperty('--chip-era-bg',     tint.bg);
  chip.style.setProperty('--chip-era-border', tint.border);
  // ADR-142 §1: entity chip for the musician (player footer)
  if (typeof applyChipRole === 'function') applyChipRole(chip, 'entity', 'musician', nodeId);
  // ADR-069: instrument badge
  if (nodeId && typeof makeInstrBadge === 'function') {
    const instrKey = node ? node.data('instrument') : null;
    if (instrKey) chip.appendChild(makeInstrBadge(instrKey));
  }
  chip.appendChild(document.createTextNode(name));
  chip.title = name + ' — Open Musician panel';
  chip.addEventListener('click', e => {
    e.stopPropagation();
    chip.classList.add('chip-tapped');
    setTimeout(() => chip.classList.remove('chip-tapped'), 200);
    if (node && !node._raw) {
      // Real cy node — zoom/orient in graph view
      if (typeof orientToNode === 'function' && typeof currentView !== 'undefined' && currentView === 'graph') {
        orientToNode(nodeId);
      } else if (typeof selectNode === 'function') {
        selectNode(node);
      }
      if (typeof window.setPanelState === 'function') {
        setTimeout(() => window.setPanelState('MUSICIAN'), 50);
      }
    } else if (nodeId && typeof _openMusicianPanelForTransit === 'function') {
      // Isolated musician (no lineage edges) — open panel via transit path
      _openMusicianPanelForTransit(nodeId);
    }
  });
  return chip;
}

// ── buildPlayerFooter — musician + raga + comp + composer chips below the video ──
// ADR-066: chips use same classes as panels for visual parity.
// meta = { nodeId, artistName, ragaId, compositionId, displayTitle, tala } — all optional.
// nodeId + artistName drive the musician chip (prepended first).
function buildPlayerFooter(meta) {
  if (!meta) return null;
  const { nodeId, artistName, ragaId, compositionId, displayTitle, tala } = meta;
  const hasAny = nodeId || artistName || ragaId || compositionId || displayTitle;
  if (!hasAny) return null;

  const footer = document.createElement('div');
  footer.className = 'mp-footer';

  // ── Musician chip (always first) ──────────────────────────────────────────
  if (nodeId || artistName) {
    const mChip = _buildMusicianChipForFooter(nodeId || null, artistName || null);
    if (mChip) footer.appendChild(mChip);
  }

  // ── Raga chip + tala (same .raga-chip class as panels; tala stays inline) ────
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
    if (tala) {
      const ragaTalaDiv = document.createElement('div');
      ragaTalaDiv.className = 'rec-raga-tala';
      ragaTalaDiv.appendChild(ragaChip);
      const talaSpan = document.createElement('span');
      talaSpan.className = 'trail-tala';
      talaSpan.textContent = formatTala(tala);
      ragaTalaDiv.appendChild(talaSpan);
      footer.appendChild(ragaTalaDiv);
    } else {
      footer.appendChild(ragaChip);
    }
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
    // ── Non-composition fallback label — yt-label-chip style ──
    const lbl = document.createElement('span');
    lbl.className = 'yt-label-chip';
    lbl.textContent = displayTitle;
    footer.appendChild(lbl);
  }

  return footer;
}

// ── updatePlayerFooter — replace the footer in-place when a track is selected ─
// Called by buildPlayerTrackList on track click and on track swipe to keep chips in sync.
// Reads nodeId + artistName from player.meta so the musician chip persists on every
// track change on both desktop and mobile.
function updatePlayerFooter(player, ragaId, compositionId, displayTitle, tala) {
  const el = player.el;
  // Remove existing footer if present
  const existing = el.querySelector('.mp-footer');
  if (existing) existing.remove();
  // Include musician meta so musician chip persists across track changes
  const pmeta = player.meta || {};
  const newFooter = buildPlayerFooter({
    nodeId:        pmeta.nodeId    || null,
    artistName:    pmeta.artistName || null,
    ragaId,
    compositionId,
    displayTitle:  displayTitle || null,
    tala:          tala || null,
  });
  if (newFooter) {
    const resize = el.querySelector('.mp-resize');
    if (resize) {
      el.insertBefore(newFooter, resize);
    } else {
      el.appendChild(newFooter);
    }
  }
}

// ── ADR-155: mountPlayer — control inversion ──────────────────────────────────
// Mounts media into `videoWrap` and returns a uniform controller:
//   { kind, seek(sec), destroy(), onTime(cb), onEnded(cb), iframe?, plyr? }
// Controllable providers (youtube/vimeo/audio/video) get a Plyr instance whose
// API we drive directly — seek via currentTime (no iframe reload), live playhead
// via the timeupdate event, and the ended event for future playlists (ADR-157).
// Non-controllable providers (soundcloud/gdrive) and any environment lacking
// Plyr fall back to the pre-existing raw iframe (ADR-155 §4).
function mountPlayer(videoWrap, media, startSeconds) {
  const src = (typeof embedSource === 'function') ? embedSource(media) : null;
  const usePlyr = !!(media && media.controllable && typeof Plyr !== 'undefined' && src);

  if (usePlyr) {
    const target = document.createElement('div');
    videoWrap.appendChild(target);
    const player = new Plyr(target, {
      controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
      loadSprite: false,                  // sprite is inlined in the document (ADR-155 M1)
      ratio: '16:9',
      autoplay: true,
      keyboard: { focused: true, global: false },
      youtube: { rel: 0, modestbranding: 1, iv_load_policy: 3 },
      vimeo: { byline: false, portrait: false, title: false },
    });
    player.source = src;
    if (startSeconds && startSeconds > 0) {
      player.once('ready', () => { try { player.currentTime = startSeconds; } catch (e) {} });
    }
    return {
      kind: 'plyr',
      plyr: player,
      iframe: null,
      seek(sec) { try { player.currentTime = sec || 0; player.play(); } catch (e) {} },
      destroy() { try { player.destroy(); } catch (e) {} },
      onTime(cb) { player.on('timeupdate', () => cb(Math.floor(player.currentTime || 0))); },
      onEnded(cb) { player.on('ended', cb); },
    };
  }

  // Fallback: raw iframe (non-controllable provider, or Plyr unavailable).
  const iframe = document.createElement('iframe');
  iframe.className = 'mp-iframe';
  iframe.src = embedUrl(media, startSeconds);
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope';
  iframe.allowFullscreen = true;
  videoWrap.appendChild(iframe);
  return {
    kind: 'iframe',
    plyr: null,
    iframe,
    seek(sec) { iframe.src = embedUrl(media, sec > 0 ? sec : undefined); },
    destroy() { iframe.src = ''; },
    onTime() {},
    onEnded() {},
  };
}

function createPlayer(media, trackLabel, artistName, startSeconds, concertTitle, tracks, meta) {
  const mkey = mediaKey(media);          // ADR-154: provider-qualified registry key
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;

  const pos = nextSpawnPosition();
  const el = document.createElement('div');
  el.className = 'media-player';
  el.style.cssText = `top:${pos.top}px; left:${pos.left}px; z-index:${++topZ}; width:480px;`;

  const bar = buildPlayerBar(media, artistName, concertTitle, trackLabel, hasTracks, meta || {});
  el.appendChild(bar);

  if (hasTracks) {
    const tracklistDiv = document.createElement('div');
    tracklistDiv.className = 'mp-tracklist';
    tracklistDiv.style.display = 'none';
    el.appendChild(tracklistDiv);
  }

  const videoWrap = document.createElement('div');
  videoWrap.className = 'mp-video-wrap';
  el.appendChild(videoWrap);
  // ADR-155: mount Plyr (controllable) or fall back to a raw iframe.
  const controller = mountPlayer(videoWrap, media, startSeconds);

  // ── Footer: musician + raga + comp + composer chips ──────────────────────
  const fullMeta = Object.assign({ artistName: artistName || null }, meta || {});
  const footer = buildPlayerFooter({
    nodeId:        fullMeta.nodeId       || null,
    artistName:    fullMeta.artistName   || null,
    ragaId:        fullMeta.ragaId       || null,
    compositionId: fullMeta.compositionId || null,
    displayTitle:  trackLabel            || null,
    tala:          fullMeta.tala         || null,
  });
  if (footer) el.appendChild(footer);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'mp-resize';
  resizeHandle.title = 'Drag to resize';
  el.appendChild(resizeHandle);

  const instance = {
    el,
    controller,                  // ADR-155: uniform media controller (Plyr or iframe)
    iframe:       controller.iframe,   // null when Plyr-backed
    plyr:         controller.plyr,     // null when iframe-backed
    titleEl:      el.querySelector('.mp-title'),
    tracklistEl:  el.querySelector('.mp-tracklist') || null,
    media,                       // ADR-154: the MediaRef
    mediaKey:     mkey,          // ADR-154: registry key
    // ADR-154 transitional: keep `vid` for YouTube media so older permalink
    // readers and any lingering vid consumers continue to work.
    vid:          (media && media.provider === 'youtube') ? media.provider_id : null,
    currentOffset: startSeconds || 0,
    meta:         fullMeta,
  };

  // ADR-155: live playhead — currentOffset tracks real playback, so share/copy
  // and the permalink capture where the video actually is (fixes AUDIT-014 F-04).
  controller.onTime(sec => { instance.currentOffset = sec; });

  el.querySelector('.mp-close').addEventListener('click', () => {
    controller.destroy();
    el.remove();
    playerRegistry.delete(mkey);
    refreshPlayingIndicators();
  });

  // ADR-139: wire clipboard copy button
  const copyBtn = el.querySelector('.mp-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', e => {
      e.stopPropagation();
      const url = shareUrl(media, instance.currentOffset);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          copyBtn.classList.add('mp-copy-copied');
          setTimeout(() => copyBtn.classList.remove('mp-copy-copied'), 1500);
          showCopyLinkToast();
        });
      }
    });
  }

  // ADR-151: wire share button (permalink = trail + player + panel)
  const shareBtn = el.querySelector('.mp-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', e => {
      e.stopPropagation();
      const fragment = encodePermalink(instance);
      if (!fragment) return;
      window.location.hash = fragment;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(window.location.href).then(() => {
          shareBtn.classList.add('mp-share-copied');
          setTimeout(() => shareBtn.classList.remove('mp-share-copied'), 1500);
          showCopyLinkToast('Permalink copied!');
        });
      }
    });
  }

  // Watch on YouTube — refresh href with current offset just before the user clicks.
  const ytLinkEl = el.querySelector('.mp-yt-link');
  if (ytLinkEl) {
    ytLinkEl.addEventListener('mouseenter', () => {
      ytLinkEl.href = shareUrl(media, instance.currentOffset || 0);
    });
  }

  // Wire track list toggle and populate track items
  if (hasTracks && instance.tracklistEl) {
    const trackUl = buildPlayerTrackList(mkey, tracks, instance);
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
function openOrFocusPlayer(mediaArg, trackLabel, artistName, startSeconds, concertTitle, tracks, meta) {
  // ADR-154: normalise the first argument (legacy YouTube id string, "provider:id"
  // key, url, or a MediaRef) into a MediaRef, then key everything by media_key.
  const media = resolveMedia(mediaArg);
  if (!media) return;
  const mkey = mediaKey(media);
  // Toggle-close: if this media is already playing, close it — desktop + mobile.
  if (playerRegistry.has(mkey)) {
    const existing = playerRegistry.get(mkey);
    if (existing._isMobileSingleton) {
      _closeMobilePlayer();
    } else {
      existing.iframe.src = '';
      existing.el.remove();
      playerRegistry.delete(mkey);
      refreshPlayingIndicators();
    }
    return;
  }
  // ADR-037: on mobile, delegate to singleton player
  if (_isMobilePlayer()) {
    _openMobilePlayer(media, trackLabel, artistName, startSeconds, concertTitle, tracks, meta);
  } else {
    const p = createPlayer(media, trackLabel, artistName, startSeconds, concertTitle, tracks, meta || {});
    playerRegistry.set(mkey, p);
    refreshPlayingIndicators();
    // Position player next to the Wheel Detail Panel when a raga context is present.
    if (meta && meta.ragaId) {
      const wdpPanel = document.getElementById('wheel-detail-panel');
      const wdpAlreadyOpen = wdpPanel && wdpPanel.classList.contains('wdp-open') &&
                             (typeof currentView === 'undefined' || currentView === 'raga');
      if (wdpAlreadyOpen) {
        // Case A: WDP is already visible — reposition after one rAF so the player
        // has been laid out and has valid offsetParent/offsetWidth.
        requestAnimationFrame(() => {
          const pos = _wdpAdjacentPosition(p.el.offsetParent);
          if (pos) { p.el.style.left = pos.left + 'px'; p.el.style.top = pos.top + 'px'; }
        });
      } else {
        // Case B: WDP will open after wheel pan animation completes (wdp-settled fires).
        let settled = false;
        const fallbackTimer = setTimeout(() => {
          if (!settled) window.removeEventListener('wdp-settled', handler);
        }, 2500);
        function handler() {
          settled = true;
          clearTimeout(fallbackTimer);
          const pos = _wdpAdjacentPosition(p.el.offsetParent);
          if (pos) { p.el.style.left = pos.left + 'px'; p.el.style.top = pos.top + 'px'; }
        }
        window.addEventListener('wdp-settled', handler, { once: true });
      }
    }
  }
  if (meta && meta.ragaId && typeof window._openWdpForPlayback === 'function') {
    window._openWdpForPlayback(meta.ragaId, meta.compositionId || null);
  }
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

// buildYtLink removed — ADR-139: external link replaced by clipboard copy in media player bar.

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

  // ADR-142 §1: composer-chip is an entity chip for the musician
  if (typeof applyChipRole === 'function') {
    applyChipRole(chip, 'entity', 'musician', composerObj.musician_node_id || '');
  }

  // ADR-150: use resolveNode for era-tint so transit composers are also tinted
  const _compNode = composerObj.musician_node_id && typeof resolveNode === 'function'
    ? resolveNode(composerObj.musician_node_id) : null;
  const eraId = _compNode ? (_compNode.data('era') || null) : null;
  const tint = THEME.eraTintCss(eraId);
  chip.style.setProperty('--chip-era-bg', tint.bg);
  chip.style.setProperty('--chip-era-border', tint.border);

  if (composerObj.musician_node_id) {
    const n = (typeof cy !== 'undefined') ? cy.getElementById(composerObj.musician_node_id) : null;
    if (n && n.length) {
      chip.className += ' chip-navigable';
      chip.title = composerObj.name + ' — Open Musician panel';
      chip.addEventListener('click', e => {
        e.stopPropagation();
        chip.classList.add('chip-tapped');
        setTimeout(() => chip.classList.remove('chip-tapped'), 200);
        if (typeof orientToNode === 'function' && typeof currentView !== 'undefined' && currentView === 'graph') {
          orientToNode(composerObj.musician_node_id);
        } else if (typeof selectNode === 'function') {
          selectNode(n);
        }
        if (typeof window.setPanelState === 'function') {
          setTimeout(() => window.setPanelState('MUSICIAN'), 50);
        }
      });
    } else {
      // musician_node_id exists but composer has no lineage edges — open panel via transit path
      chip.className += ' chip-navigable';
      chip.title = composerObj.name + ' — Open Musician panel';
      chip.addEventListener('click', e => {
        e.stopPropagation();
        chip.classList.add('chip-tapped');
        setTimeout(() => chip.classList.remove('chip-tapped'), 200);
        if (typeof _openMusicianPanelForTransit === 'function') {
          _openMusicianPanelForTransit(composerObj.musician_node_id);
        }
      });
    }
  } else {
    chip.title = composerObj.name;
  }
  return chip;
}

// ── buildLecdemChip — chip for a lecture-demo recording (ADR-079) ─────────────
// ref is a LecdemRef (ADR-078): { video_id, label, subjects, lecturer_id, ... }
function buildLecdemChip(ref) {
  if (!ref || !ref.video_id) return null;
  const chip = document.createElement('span');
  chip.className = 'lecdem-chip';
  chip.textContent = ref.label || 'Lecture-Demo';
  chip.title = (ref.label || 'Lecture-Demo') + ' — Watch lecture-demo';
  chip.dataset.videoId = ref.video_id;
  // ADR-142 §1: lecdem chip is an entity chip for the recording
  if (typeof applyChipRole === 'function') applyChipRole(chip, 'entity', 'recording', ref.video_id);
  chip.addEventListener('click', e => {
    e.stopPropagation();
    chip.classList.add('chip-tapped');
    setTimeout(() => chip.classList.remove('chip-tapped'), 200);
    // Open media player on the lecdem video; pass lecturer meta so footer shows lecturer chip
    openOrFocusPlayer(ref.video_id, ref.label || 'Lecture-Demo', ref.lecturer_label || '', undefined, ref.label || 'Lecture-Demo', [], { nodeId: ref.lecturer_id || null });
    // Replace footer with a unified footer: lecturer chip + subject cross-link chips (ADR-079 §4)
    const instance = playerRegistry.get(ref.media_key);
    if (instance && ref.subjects) {
      const subFooter = _buildLecdemSubjectFooter(
        ref.subjects,
        { nodeId: ref.lecturer_id || null, artistName: ref.lecturer_label || null }
      );
      if (subFooter) {
        const existing = instance.el.querySelector('.mp-footer');
        if (existing) existing.remove();
        const resize = instance.el.querySelector('.mp-resize');
        if (resize) instance.el.insertBefore(subFooter, resize);
        else        instance.el.appendChild(subFooter);
      }
    }
  });
  return chip;
}

// Helper: footer with subject cross-link chips for a lecdem player (ADR-079 §4)
// lecturerMeta (optional): { nodeId, artistName } — prepended as first chip if provided.
// Each raga_id → .raga-chip, composition_id → .comp-chip, musician_id → .musician-chip.
// Returns null if lecturerMeta is absent AND all subject arrays are empty.
// Only the first PREVIEW_COUNT chips are shown by default; the rest are behind a
// fold/unfold toggle (▶ N more / ▼ less) to keep the footer compact on mobile.
function _buildLecdemSubjectFooter(subjects, lecturerMeta) {
  const PREVIEW_COUNT = 3;
  const ragaIds     = Array.isArray(subjects.raga_ids)        ? subjects.raga_ids        : [];
  const compIds     = Array.isArray(subjects.composition_ids) ? subjects.composition_ids : [];
  const musicianIds = Array.isArray(subjects.musician_ids)    ? subjects.musician_ids    : [];
  const hasLecturer = lecturerMeta && (lecturerMeta.nodeId || lecturerMeta.artistName);
  if (!ragaIds.length && !compIds.length && !musicianIds.length && !hasLecturer) return null;

  // ── Collect all chips into an array before deciding layout ────────────────
  const allChips = [];

  // Lecturer chip (first)
  if (hasLecturer) {
    const lecChip = _buildMusicianChipForFooter(lecturerMeta.nodeId || null, lecturerMeta.artistName || null);
    if (lecChip) allChips.push(lecChip);
  }

  ragaIds.forEach(ragaId => {
    const ragaObj  = (typeof ragas !== 'undefined') ? ragas.find(r => r.id === ragaId) : null;
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
    allChips.push(ragaChip);
  });

  compIds.forEach(compId => {
    const compObj  = (typeof compositions !== 'undefined') ? compositions.find(c => c.id === compId) : null;
    const compName = compObj ? compObj.title : compId;
    const compChip = document.createElement('span');
    compChip.className = 'comp-chip';
    compChip.textContent = compName;
    compChip.title = 'Explore ' + compName + ' in Bani Flow';
    compChip.addEventListener('click', e => {
      e.stopPropagation();
      compChip.classList.add('chip-tapped');
      setTimeout(() => compChip.classList.remove('chip-tapped'), 200);
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', compId);
    });
    allChips.push(compChip);
  });

  musicianIds.forEach(musicianId => {
    const node  = (typeof resolveNode === 'function') ? resolveNode(musicianId)
      : ((typeof cy !== 'undefined') ? cy.getElementById(musicianId) : null);
    const name  = node ? node.data('label') : musicianId;
    const eraId = node ? (node.data('era') || null) : null;
    const tint  = (typeof THEME !== 'undefined')
      ? THEME.eraTintCss(eraId)
      : { bg: 'transparent', border: 'var(--border-strong)' };
    const mchip = document.createElement('span');
    mchip.className = 'musician-chip';
    mchip.style.setProperty('--chip-era-bg',     tint.bg);
    mchip.style.setProperty('--chip-era-border', tint.border);
    mchip.textContent = name;
    mchip.title = name + ' — Open Musician panel';
    // ADR-142 §1: lecdem-subject musician chip is an entity chip
    if (typeof applyChipRole === 'function') applyChipRole(mchip, 'entity', 'musician', musicianId);
    mchip.addEventListener('click', e => {
      e.stopPropagation();
      mchip.classList.add('chip-tapped');
      setTimeout(() => mchip.classList.remove('chip-tapped'), 200);
      if (node && !node._raw) {
        // Real cy node — zoom/orient in graph view
        if (typeof orientToNode === 'function' && typeof currentView !== 'undefined' && currentView === 'graph') {
          orientToNode(musicianId);
        } else if (typeof selectNode === 'function') {
          selectNode(node);
        }
        if (typeof window.setPanelState === 'function') {
          setTimeout(() => window.setPanelState('MUSICIAN'), 50);
        }
      } else if (typeof _openMusicianPanelForTransit === 'function') {
        // Isolated musician (no lineage edges) — open panel via transit path
        _openMusicianPanelForTransit(musicianId);
      }
    });
    allChips.push(mchip);
  });

  if (!allChips.length) return null;

  // ── Build footer with preview + optional overflow ─────────────────────────
  const footer = document.createElement('div');
  footer.className = 'mp-footer';

  const previewChips  = allChips.slice(0, PREVIEW_COUNT);
  const overflowChips = allChips.slice(PREVIEW_COUNT);

  previewChips.forEach(c => footer.appendChild(c));

  if (overflowChips.length > 0) {
    const overflowEl = document.createElement('span');
    overflowEl.className = 'mp-footer-overflow';
    overflowEl.hidden = true;
    overflowChips.forEach(c => overflowEl.appendChild(c));

    const n = overflowChips.length;
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'mp-footer-toggle';
    toggleBtn.textContent = '\u25b6 ' + n + ' more';
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      overflowEl.hidden = !overflowEl.hidden;
      toggleBtn.textContent = overflowEl.hidden ? ('\u25b6 ' + n + ' more') : '\u25bc less';
    });

    footer.appendChild(toggleBtn);
    footer.appendChild(overflowEl);
  }

  return footer.hasChildNodes() ? footer : null;
}

// ── _buildConcertTracksFor — ordered playerTracks for a named concert bracket ─
// Used by composition-tree and misc-leaf rows so the in-player track selector
// always shows the full setlist when a recording carries a recording_id.
function _buildConcertTracksFor(recordingId, nodeId) {
  if (!recordingId) return [];
  return (musicianToPerformances[nodeId] || [])
    .filter(sp => sp.recording_id === recordingId)
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
        const node = typeof resolveNode === 'function' ? resolveNode(pf.musician_id) : cy.getElementById(pf.musician_id);
        label = node ? (node.data('label') || pf.musician_id) : pf.musician_id;
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
  titleSpan.className = 'concert-title recording-chip';
  titleSpan.textContent = concert.short_title || concert.title;
  if (concert.title) titleSpan.title = concert.title;
  // 'panel-title' role enables the chip_dblclick.js dblclick-to-edit gesture
  // (single click still falls through to toggleConcert via the header onclick).
  if (concert.recording_id && typeof applyChipRole === 'function') {
    applyChipRole(titleSpan, 'panel-title', 'recording', concert.recording_id);
    titleSpan.dataset.musicianId = nodeId;  // passed to buildEditConcertForm via openEditForm
  }

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
    // ADR-150: use resolveNode for era/instrument to include transit co-performers
    const _pfNode = pf.musicianId && typeof resolveNode === 'function' ? resolveNode(pf.musicianId) : null;
    const eraId = _pfNode ? (_pfNode.data('era') || null) : null;
    const tint = THEME.eraTintCss(eraId);
    const chip = document.createElement('span');
    chip.className = 'musician-chip chip-secondary';
    chip.style.setProperty('--chip-era-bg', tint.bg);
    chip.style.setProperty('--chip-era-border', tint.border);
    // ADR-142 §1: co-performer chip is an entity chip for the musician
    if (typeof applyChipRole === 'function') applyChipRole(chip, 'entity', 'musician', pf.musicianId || '');
    // ADR-069: instrument badge
    if (pf.musicianId && typeof makeInstrBadge === 'function') {
      const instrKey = _pfNode ? _pfNode.data('instrument') : null;
      if (instrKey) chip.appendChild(makeInstrBadge(instrKey, 11));
    }
    chip.appendChild(document.createTextNode(pf.label));
    chip.title = pf.musicianId ? pf.label + ' — Open Musician panel' : pf.label;
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
        } else if (typeof _openMusicianPanelForTransit === 'function') {
          // Isolated musician (no lineage edges) — open panel via transit path
          _openMusicianPanelForTransit(pf.musicianId);
        }
      });
    }
    performersDiv.appendChild(chip);
  });

  const countDiv = document.createElement('div');
  countDiv.className = 'concert-count';
  countDiv.textContent = totalPieces + (totalPieces === 1 ? ' piece' : ' pieces');

  // ▶ play-from-beginning button — opens the first track of the concert at 00:00:00
  const _firstPerfVid = (() => {
    for (const sess of concert.sessions) {
      const sorted = sess.perfs.slice().sort((a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0));
      if (sorted.length) return sorted[0].video_id;
    }
    return null;
  })();
  if (_firstPerfVid) {
    const concertPlayBtn = document.createElement('button');
    concertPlayBtn.className = 'rec-play-btn play-btn-direct';
    concertPlayBtn.title = 'Play from beginning: ' + (concert.short_title || concert.title || 'Concert');
    concertPlayBtn.textContent = '\u25B6';
    concertPlayBtn.style.cssText = 'margin-left:auto;flex-shrink:0;';
    concertPlayBtn.addEventListener('click', e => {
      e.stopPropagation();
      const _allTracks = [];
      concert.sessions.forEach(sess => {
        sess.perfs.slice()
          .sort((a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0))
          .forEach(sp => {
            const spRagaObj = sp.raga_id ? ragas.find(r => r.id === sp.raga_id) : null;
            _allTracks.push({
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
      _allTracks.sort((a, b) => a.offset_seconds - b.offset_seconds);
      openOrFocusPlayer(_firstPerfVid, concert.short_title || concert.title, artistLabel, 0, concert.short_title || concert.title, _allTracks, { nodeId });
    });
    titleRow.appendChild(concertPlayBtn);
  }

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
      li.className = 'concert-perf-item' + (playerRegistry.has(p.media_key) ? ' playing' : '');
      li.dataset.vid = p.media_key;
      // ADR-052: container is not a click target; navigation lives in embedded chips.

      // ── Raga chip row (top, no tala — matches tree-comp-node aesthetic) ────
      const ragaObj = p.raga_id ? ragas.find(r => r.id === p.raga_id) : null;
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
        li.appendChild(ragaChip);
      } else if (!p.raga_id && p.raga_id !== undefined) {
        // no raga — nothing to show at top
      }

      // ── Composition chip + play button (tree-comp-header aesthetic) ─────────
      const compHeader = document.createElement('div');
      compHeader.className = 'tree-comp-header';
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
        compHeader.appendChild(compChip);
      } else {
        const titleEl = document.createElement('span');
        titleEl.className = 'yt-label-chip';
        const typeIcon = { interview: '🎤 ', lecture: '🎓 ', radio: '📻 ' }[p.type] || '';
        titleEl.textContent = typeIcon + (p.display_title || '');
        compHeader.appendChild(titleEl);
      }

      // ▶ button in tree-comp-acts (right-aligned, matches composition tree)
      const actsDiv = document.createElement('div');
      actsDiv.className = 'tree-comp-acts';
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
          { nodeId, ragaId: p.raga_id || null, compositionId: p.composition_id || null, tala: p.tala || null }
        );
      });
      actsDiv.appendChild(playBtn);
      compHeader.appendChild(actsDiv);

      // ── Wrap comp header + composer in indented block when raga is present ────
      const concertComposerChip = buildComposerChip(p.composition_id);
      const compBlock = document.createElement('div');
      if (ragaObj) compBlock.className = 'concert-comp-block';
      compBlock.appendChild(compHeader);
      if (concertComposerChip) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'tree-comp-meta';
        metaDiv.appendChild(concertComposerChip);
        compBlock.appendChild(metaDiv);
      }
      li.appendChild(compBlock);
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
    // ADR-144 Phase B: annotate comp chip with its entity id so chip_dblclick.js
    // finds it first (innermost) rather than falling through to the row-block li.
    if (typeof applyChipRole === 'function') applyChipRole(compChip, 'entity', 'composition', compId);
    compChip.addEventListener('click', e => {
      e.stopPropagation();
      compChip.classList.add('chip-tapped');
      setTimeout(() => compChip.classList.remove('chip-tapped'), 200);
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', compId);
    });
    compHeader.appendChild(compChip);
  } else {
    const titleSpan = document.createElement('span');
    titleSpan.className = 'yt-label-chip';
    titleSpan.textContent = (sortedPerfs[0] && sortedPerfs[0].display_title) || 'Unknown composition';
    titleSpan.title = (sortedPerfs[0] && sortedPerfs[0].display_title) || '';
    compHeader.appendChild(titleSpan);
  }

  // No left-chevron. Acts (play button / right-chevron) always on the right via tree-comp-acts.
  const recCount = sortedPerfs.length;

  if (recCount === 1) {
    // ── Single recording: inline year + play on the right ─────────────────
    const p = sortedPerfs[0];
    // ADR-144 Phase B: annotate li as row-block affordance.
    // Dblclick on the row (not on a chip) opens the recording edit form.
    if (p.video_id && typeof applyChipRole === 'function') {
      applyChipRole(li, 'row-block', 'recording', p.video_id);
    }
    // Dblclick wiring for this single-recording composition row
    if (p.video_id) {
      li.addEventListener('dblclick', function(e) {
        if (e.target.closest('a, button, .raga-chip, .comp-chip, .musician-chip')) return;
        e.stopPropagation();
        if (typeof openEditYoutubeForm === 'function') {
          openEditYoutubeForm(p.video_id, nodeId, {
            composition_id:  p.composition_id || null,
            raga_id:         p.raga_id        || null,
            year:            p.date ? parseInt(p.date, 10) : null,
            is_concert_track: !!p.recording_id || undefined,
          });
        }
      });
    }
    const actsDiv = document.createElement('div');
    actsDiv.className = 'tree-comp-acts';
    if (p.date) {
      const yearSpan = document.createElement('span');
      yearSpan.className = 'rec-year';
      yearSpan.textContent = p.date.slice(0, 4);
      actsDiv.appendChild(yearSpan);
    }
    const playBtn = document.createElement('button');
    playBtn.className = p.recording_id ? 'rec-play-btn play-btn-concert' : 'rec-play-btn play-btn-direct';
    playBtn.setAttribute('data-vid', p.media_key);
    playBtn.title = p.short_title || p.title || 'Play';
    playBtn.textContent = '\u25B6';
    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      openOrFocusPlayer(
        p.video_id, p.display_title, artistLabel,
        p.offset_seconds > 0 ? p.offset_seconds : undefined,
        p.short_title || p.title, _buildConcertTracksFor(p.recording_id, nodeId),
        { nodeId, ragaId: p.raga_id || null, compositionId: p.composition_id || null, tala: p.tala || null }
      );
    });
    actsDiv.appendChild(playBtn);
    compHeader.appendChild(actsDiv);
  } else {
    // ── Multiple recordings: right-chevron accordion (starts collapsed) ────
    const actsDiv = document.createElement('div');
    actsDiv.className = 'tree-comp-acts';

    const chevron = document.createElement('button');
    chevron.className = 'tree-comp-chevron';
    chevron.textContent = '\u25b6';  // ▶ collapsed by default
    chevron.title = 'Show recordings';
    actsDiv.appendChild(chevron);
    compHeader.appendChild(actsDiv);

    compHeader.style.cursor = 'pointer';
    li.appendChild(compHeader);

    // Composer chip
    const composerChip = buildComposerChip(compId);
    if (composerChip) {
      const metaDiv = document.createElement('div');
      metaDiv.className = 'tree-comp-meta';
      metaDiv.appendChild(composerChip);
      li.appendChild(metaDiv);
    }

    // Recording rows — start hidden (collapsed by default)
    const recUl = document.createElement('ul');
    recUl.className = 'tree-rec-list';
    recUl.hidden = true;

    sortedPerfs.forEach((p, idx) => {
      const recLi = document.createElement('li');
      recLi.className = 'tree-leaf';
      recLi.dataset.vid = p.media_key;
      if (playerRegistry.has(p.media_key)) recLi.classList.add('playing');

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

      const rowActsDiv = document.createElement('div');
      rowActsDiv.className = 'trail-acts';
      const playBtn = document.createElement('button');
      playBtn.className = p.recording_id ? 'rec-play-btn play-btn-concert' : 'rec-play-btn play-btn-direct';
      playBtn.setAttribute('data-vid', p.media_key);
      playBtn.title = p.short_title || p.title || 'Play';
      playBtn.textContent = '\u25B6';
      playBtn.addEventListener('click', e => {
        e.stopPropagation();
        openOrFocusPlayer(
          p.video_id, p.display_title, artistLabel,
          p.offset_seconds > 0 ? p.offset_seconds : undefined,
          p.short_title || p.title, _buildConcertTracksFor(p.recording_id, nodeId),
          { nodeId, ragaId: p.raga_id || null, compositionId: p.composition_id || null, tala: p.tala || null }
        );
      });
      rowActsDiv.appendChild(playBtn);
      row.appendChild(rowActsDiv);

      recLi.appendChild(row);

      // Dblclick to edit this recording version
      if (p.video_id) {
        recLi.addEventListener('dblclick', function(e) {
          if (e.target.closest('a, button, .raga-chip, .comp-chip, .musician-chip')) return;
          e.stopPropagation();
          if (typeof openEditYoutubeForm === 'function') {
            openEditYoutubeForm(p.video_id, nodeId, {
              composition_id:  p.composition_id || null,
              raga_id:         p.raga_id        || null,
              year:            p.date ? parseInt(p.date, 10) : null,
              is_concert_track: !!p.recording_id || undefined,
            });
          }
        });
      }

      recUl.appendChild(recLi);
    });

    li.appendChild(recUl);

    // Chevron button and full-row click both toggle the recording list.
    const _toggle = function () {
      recUl.hidden = !recUl.hidden;
      chevron.textContent = recUl.hidden ? '\u25b6' : '\u25bc';
      chevron.title = recUl.hidden ? 'Show recordings' : 'Hide recordings';
    };
    chevron.addEventListener('click', e => { e.stopPropagation(); _toggle(); });
    compHeader.addEventListener('click', function (e) {
      if (e.target.closest('a, button, .raga-chip, .comp-chip, .musician-chip, .lecdem-chip, .neutral-chip')) return;
      _toggle();
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

  // ── Header: raga chip only — always open, no chevron, no toggle.
  //    Matches .comp-raga-header aesthetic (no gray bg, no collapse).
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
    miscSpan.dataset.sectionAction = 'add-recording';
    miscSpan.dataset.musicianId = nodeId;
    if (typeof applyChipRole === 'function') applyChipRole(miscSpan, 'section-add', 'recording');
    header.appendChild(miscSpan);
  }

  li.appendChild(header);

  // ── Children ───────────────────────────────────────────────────────────
  const ul = document.createElement('ul');
  ul.className = 'tree-children';

  // Misc bucket (no raga) is always flat — no composition sub-grouping.
  // Each recording is shown on its own row with the recording's own label.
  if (!ragaId) {
    const flatPerfs = perfs.slice().sort((a, b) => {
      const ya = a.date ? parseInt(a.date) : Infinity;
      const yb = b.date ? parseInt(b.date) : Infinity;
      return ya - yb;
    });
    flatPerfs.forEach(p => {
      ul.appendChild(buildMiscLeaf(p, nodeId, artistLabel));
    });
    li.appendChild(ul);
    return li;
  }

  sortedComps.forEach(([compId, compPerfs]) => {
    ul.appendChild(buildCompNode(compId, compPerfs, nodeId, artistLabel));
  });
  if (nullCompPerfs.length > 0) {
    ul.appendChild(buildCompNode(null, nullCompPerfs, nodeId, artistLabel));
  }
  li.appendChild(ul);

  return li;
}

// buildMiscLeaf — one flat row in the Misc raga bucket.
// Misc has no composition tree; each recording is rendered standalone with its
// own label (display_title / short_title) shown in the de-emphasized
// `.tree-unmatched-title` style. If the recording has a known composition_id,
// the comp chip leads instead of a plain label.
function buildMiscLeaf(p, nodeId, artistLabel) {
  const li = document.createElement('li');
  li.className = 'tree-leaf tree-misc-leaf';
  li.dataset.vid = p.media_key;
  if (playerRegistry.has(p.media_key)) li.classList.add('playing');
  if (p.video_id && typeof applyChipRole === 'function')
    applyChipRole(li, 'row-block', 'recording', p.video_id);

  const row = document.createElement('div');
  row.className = 'trail-row2';

  const chipsDiv = document.createElement('div');
  chipsDiv.className = 'trail-chips';

  const compObj = p.composition_id
    ? ((typeof compositions !== 'undefined' ? compositions : []).find(c => c.id === p.composition_id) || null)
    : null;
  if (compObj) {
    const compChip = document.createElement('span');
    compChip.className = 'comp-chip';
    compChip.textContent = compObj.title || p.composition_id;
    compChip.title = (compObj.title || p.composition_id) + ' — Explore in Bani Flow';
    compChip.addEventListener('click', e => {
      e.stopPropagation();
      compChip.classList.add('chip-tapped');
      setTimeout(() => compChip.classList.remove('chip-tapped'), 200);
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', p.composition_id);
    });
    chipsDiv.appendChild(compChip);
  } else {
    const labelText = p.display_title || p.short_title || p.title || 'Untitled';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'yt-label-chip recording-chip';
    labelSpan.textContent = labelText;
    labelSpan.title = labelText;
    if (p.video_id && typeof applyChipRole === 'function')
      applyChipRole(labelSpan, 'entity', 'recording', p.video_id);
    chipsDiv.appendChild(labelSpan);
  }

  if (p.date) {
    const yearSpan = document.createElement('span');
    yearSpan.className = 'rec-year';
    yearSpan.textContent = p.date.slice(0, 4);
    chipsDiv.appendChild(yearSpan);
  }
  row.appendChild(chipsDiv);

  const actsDiv = document.createElement('div');
  actsDiv.className = 'trail-acts';
  const playBtn = document.createElement('button');
  playBtn.className = p.recording_id ? 'rec-play-btn play-btn-concert' : 'rec-play-btn play-btn-direct';
  playBtn.setAttribute('data-vid', p.media_key);
  playBtn.title = p.display_title || p.short_title || p.title || 'Play';
  playBtn.textContent = '\u25B6';
  playBtn.addEventListener('click', e => {
    e.stopPropagation();
    openOrFocusPlayer(
      p.video_id, p.display_title, artistLabel,
      p.offset_seconds > 0 ? p.offset_seconds : undefined,
      p.short_title || p.title, _buildConcertTracksFor(p.recording_id, nodeId),
      { nodeId, ragaId: null, compositionId: p.composition_id || null, tala: p.tala || null }
    );
  });
  actsDiv.appendChild(playBtn);
  row.appendChild(actsDiv);

  li.appendChild(row);

  // ── Dblclick to edit this YouTube recording ────────────────────────────────
  if (p.video_id) {
    li.addEventListener('dblclick', function(e) {
      if (e.target.closest('a, button, .raga-chip, .comp-chip, .musician-chip')) return;
      e.stopPropagation();
      if (typeof openEditYoutubeForm === 'function') {
        openEditYoutubeForm(p.video_id, nodeId, {
          composition_id:  p.composition_id || null,
          raga_id:         p.raga_id        || null,
          year:            p.date ? parseInt(p.date, 10) : null,
          label:           p.display_title  || p.short_title || '',
          is_concert_track: !!p.recording_id || undefined,
        });
      }
    });
  }

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

// ── _buildLecdemBracket — collapsible lecdem bracket (ADR-101) ────────────────
// Mirrors buildConcertBracket for lecture-demo entries.
// • No segments → returns a flat trail-row2 (label + ▶ + YT + ＋).
// • Has segments → returns a concert-bracket with collapsible segment list.
function _buildLecdemBracket(ref, nodeId, artistLabel) {
  const segments = (ref.segments && ref.segments.length > 0) ? ref.segments : null;

  // ── flat row (no segments) ──────────────────────────────────────────────────
  if (!segments) {
    const row = document.createElement('div');
    row.className = 'trail-row2';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'lecdem-label-chip recording-chip';
    labelSpan.textContent = ref.label || 'Lecture-Demo';
    labelSpan.title = (ref.label || 'Lecture-Demo') + ' — Watch lecture-demo · Double-click to edit';
    if (ref.video_id && typeof applyChipRole === 'function')
      applyChipRole(labelSpan, 'entity', 'recording', ref.video_id);
    // Double-click → Edit Lecdem form
    if (nodeId) {
      let _ldDblTap = 0;
      labelSpan.addEventListener('click', e => {
        e.stopPropagation();
        const now = Date.now();
        if (now - _ldDblTap < 400) {
          _ldDblTap = 0;
          if (typeof buildLecdemEditForm === 'function') buildLecdemEditForm(ref, nodeId);
        } else {
          _ldDblTap = now;
        }
      });
    }
    row.appendChild(labelSpan);

    const actsDiv = document.createElement('div');
    actsDiv.className = 'trail-acts';

    const playBtn = document.createElement('button');
    playBtn.className = 'rec-play-btn play-btn-direct';
    playBtn.setAttribute('data-vid', ref.media_key);
    playBtn.title = ref.label || 'Play';
    playBtn.textContent = '\u25B6';
    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      openOrFocusPlayer(ref.video_id, ref.label || 'Lecture-Demo', artistLabel, undefined, ref.label || 'Lecture-Demo', [], { nodeId });
      const instance = playerRegistry.get(ref.media_key);
      if (instance && ref.subjects) {
        const subFooter = _buildLecdemSubjectFooter(
          ref.subjects,
          { nodeId: nodeId || null, artistName: artistLabel || null }
        );
        if (subFooter) {
          const existing = instance.el.querySelector('.mp-footer');
          if (existing) existing.remove();
          const resize = instance.el.querySelector('.mp-resize');
          if (resize) instance.el.insertBefore(subFooter, resize);
          else        instance.el.appendChild(subFooter);
        }
      }
    });
    actsDiv.appendChild(playBtn);

    row.appendChild(actsDiv);
    return row;
  }

  // ── bracket (has segments) ──────────────────────────────────────────────────
  // Build allTracks for the in-player selector
  const allTracks = segments.map(seg => {
    const ragaObj = seg.raga_id ? ragas.find(r => r.id === seg.raga_id) : null;
    return {
      offset_seconds: seg.offset_seconds || 0,
      display_title:  seg.display_title || seg.raga_id || seg.kind || '',
      raga_id:        seg.raga_id || null,
      raga_name:      ragaObj ? ragaObj.name : (seg.raga_id || ''),
      tala:           seg.tala || null,
      timestamp:      seg.timestamp || '00:00',
      composition_id: seg.composition_id || null,
    };
  });

  const bracket = document.createElement('div');
  bracket.className = 'concert-bracket';

  // ── header ──────────────────────────────────────────────────────────────────
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
  titleSpan.className = 'concert-title lecdem-title recording-chip';
  titleSpan.textContent = ref.label || 'Lecture-Demo';
  titleSpan.title = (ref.label || 'Lecture-Demo') + ' — Double-click to edit';
  if (ref.video_id && typeof applyChipRole === 'function')
    applyChipRole(titleSpan, 'entity', 'recording', ref.video_id);
  // Double-click → Edit Lecdem form
  if (nodeId) {
    let _ldDblTap2 = 0;
    titleSpan.addEventListener('click', e => {
      e.stopPropagation();
      const now = Date.now();
      if (now - _ldDblTap2 < 400) {
        _ldDblTap2 = 0;
        if (typeof buildLecdemEditForm === 'function') buildLecdemEditForm(ref, nodeId);
      } else {
        _ldDblTap2 = now;
      }
    });
  }
  titleRow.appendChild(titleSpan);

  if (ref.year) {
    const yearSpan = document.createElement('span');
    yearSpan.className = 'concert-date';
    yearSpan.textContent = ref.year;
    titleRow.appendChild(yearSpan);
  }

  const countDiv = document.createElement('div');
  countDiv.className = 'concert-count';
  countDiv.textContent = segments.length + (segments.length === 1 ? ' segment' : ' segments');

  // ▶ play-from-beginning button — opens the lecdem video at 00:00:00
  const lecdemPlayBtn = document.createElement('button');
  lecdemPlayBtn.className = 'rec-play-btn play-btn-direct';
  lecdemPlayBtn.title = 'Play from beginning: ' + (ref.label || 'Lecture-Demo');
  lecdemPlayBtn.textContent = '\u25B6';
  lecdemPlayBtn.style.cssText = 'margin-left:auto;flex-shrink:0;';
  lecdemPlayBtn.addEventListener('click', e => {
    e.stopPropagation();
    openOrFocusPlayer(ref.video_id, ref.label || 'Lecture-Demo', artistLabel, 0, ref.label || 'Lecture-Demo', allTracks, { nodeId });
  });
  titleRow.appendChild(lecdemPlayBtn);

  headerBody.appendChild(titleRow);
  headerBody.appendChild(countDiv);

  header.appendChild(chevron);
  header.appendChild(headerBody);
  bracket.appendChild(header);

  // ── segment list ─────────────────────────────────────────────────────────────
  const segList = document.createElement('ul');
  segList.className = 'concert-perf-list';
  segList.style.display = 'none';

  segments.forEach(seg => {
    const li = document.createElement('li');
    li.className = 'concert-perf-item';
    li.dataset.vid = ref.media_key;

    const row1 = document.createElement('div');
    row1.className = 'rec-row1';

    const ragaObj = seg.raga_id ? ragas.find(r => r.id === seg.raga_id) : null;
    const segLabel = (ragaObj ? ragaObj.name : null) || seg.raga_id || seg.composition_id || '';

    // Row 1: subject chips only — raga then composition, no form-type labels
    if (ragaObj) {
      const ragaChip = document.createElement('span');
      ragaChip.className = 'raga-chip';
      ragaChip.textContent = ragaObj.name;
      ragaChip.title = 'Explore ' + ragaObj.name + ' in Bani Flow';
      ragaChip.addEventListener('click', e => {
        e.stopPropagation();
        ragaChip.classList.add('chip-tapped');
        setTimeout(() => ragaChip.classList.remove('chip-tapped'), 200);
        if (typeof triggerBaniSearch === 'function') triggerBaniSearch('raga', seg.raga_id);
      });
      row1.appendChild(ragaChip);
    } else if (seg.raga_id) {
      const ragaChip = document.createElement('span');
      ragaChip.className = 'raga-chip';
      ragaChip.textContent = seg.raga_id;
      row1.appendChild(ragaChip);
    }

    if (seg.composition_id) {
      const comp = (typeof compositions !== 'undefined' ? compositions : []).find(c => c.id === seg.composition_id);
      const compChip = document.createElement('span');
      compChip.className = 'comp-chip';
      compChip.textContent = comp ? comp.title : seg.composition_id;
      compChip.title = (comp ? comp.title : seg.composition_id) + ' — Explore in Bani Flow';
      compChip.addEventListener('click', e => {
        e.stopPropagation();
        compChip.classList.add('chip-tapped');
        setTimeout(() => compChip.classList.remove('chip-tapped'), 200);
        if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', seg.composition_id);
      });
      row1.appendChild(compChip);
    }

    const playBtn = document.createElement('button');
    playBtn.className = 'rec-play-btn play-btn-concert';
    playBtn.title = 'Play from ' + (seg.timestamp || '00:00');
    playBtn.textContent = '▶';
    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      openOrFocusPlayer(ref.video_id, segLabel, artistLabel, seg.offset_seconds, ref.label, allTracks, { nodeId });
      const instance = playerRegistry.get(ref.media_key);
      if (instance) {
        // Aggregate all subjects from every segment + top-level ref.subjects
        const mergedSubjects = {
          raga_ids: [...new Set([
            ...(ref.subjects && ref.subjects.raga_ids ? ref.subjects.raga_ids : []),
            ...segments.filter(s => s.raga_id).map(s => s.raga_id),
          ])],
          composition_ids: [...new Set([
            ...(ref.subjects && ref.subjects.composition_ids ? ref.subjects.composition_ids : []),
            ...segments.filter(s => s.composition_id).map(s => s.composition_id),
          ])],
          musician_ids: (ref.subjects && ref.subjects.musician_ids) ? ref.subjects.musician_ids : [],
        };
        const subFooter = _buildLecdemSubjectFooter(
          mergedSubjects,
          { nodeId: nodeId || null, artistName: artistLabel || null }
        );
        if (subFooter) {
          const existing = instance.el.querySelector('.mp-footer');
          if (existing) existing.remove();
          const resize = instance.el.querySelector('.mp-resize');
          if (resize) instance.el.insertBefore(subFooter, resize);
          else        instance.el.appendChild(subFooter);
        }
      }
    });
    row1.appendChild(playBtn);

    li.appendChild(row1);

    segList.appendChild(li);
  });

  bracket.appendChild(segList);
  return bracket;
}

// ── buildRecordingsList — concert-bracketed + legacy flat (ADR-018) ───────────
function buildRecordingsList(nodeId, nodeData) {
  const recPanel  = document.getElementById('recordings-panel');
  const recList   = document.getElementById('recordings-list');
  const recFilter = document.getElementById('rec-filter');
  recList.innerHTML = '';

  // ADR-150: resolveNode falls back to elements[] for transit musicians; avoids
  // cy.getElementById().data() crash when nodeId is not in cy (F-011).
  const nd = nodeData || (typeof resolveNode === 'function' ? (resolveNode(nodeId)?._raw) : null) || {};
  const legacyTracks    = nd.tracks || [];
  const structuredPerfs = musicianToPerformances[nodeId] || [];
  const artistLabel     = nd.label || '';
  const lecdemsBy_      = (typeof lecdemsBy !== 'undefined' ? lecdemsBy[nodeId] : null) || [];
  const lecdemsAbout_   = (typeof lecdemsAboutMusician !== 'undefined' ? lecdemsAboutMusician[nodeId] : null) || [];

  // Keep Lecdems at the top of the musician panel while preserving all
  // existing section ordering below it. Header always rendered (per Concerts/
  // Compositions pattern) so the section is always visible as an anchor.
  // ADR-128 D3+D4: use buildSection; collect for empty-section demotion.
  const _sections = [];  // { sectionEl, count } — populated first, then empty
  {
    const lecdemCount = lecdemsBy_.length + lecdemsAbout_.length;
    const lsHdrChip = document.createElement('span');
    lsHdrChip.className = 'lecdem-chip chip-section-hdr';
    lsHdrChip.textContent = 'Lecdems';
    // ADR-144 Phase A: dblclick LECDEMS header → add-lecdem form pre-scoped to this musician
    if (typeof applyChipRole === 'function') applyChipRole(lsHdrChip, 'section-add', 'recording');
    lsHdrChip.dataset.sectionAction = 'add-lecdem';
    lsHdrChip.dataset.musicianId   = nodeId;
    const { sectionEl: lsSection, bodyEl: lsBody } = buildSection({
      headerChip: lsHdrChip,
      count: lecdemCount,
    });
    lsSection.classList.add('lecdem-section');
    lsSection.dataset.section = 'lecdems';

    // Lecdems by this musician
    if (lecdemsBy_.length > 0) {
      const sortedBy = lecdemsBy_.slice().sort((a, b) => {
        if (a.year != null && b.year != null) return b.year - a.year;
        if (a.year != null) return -1;
        if (b.year != null) return 1;
        return (a.label || '').localeCompare(b.label || '');
      });

      const bySubsec = document.createElement('div');
      bySubsec.className = 'lecdem-subsection';
      bySubsec.dataset.subsection = 'by';

      const byHdr = document.createElement('div');
      byHdr.className = 'lecdem-subsection-header';
      // ADR-128 D9: subsection label simplified to just "By" (chip is on parent section header)
      byHdr.appendChild(document.createTextNode('By'));
      bySubsec.appendChild(byHdr);

      const byList = document.createElement('ul');
      byList.className = 'lecdem-list';

      sortedBy.forEach(ref => {
        const li = document.createElement('li');
        li.className = 'lecdem-row';

        const subjectChips = _buildLecdemSubjectChips(ref.subjects, nodeId);
        const hasSegments = !!(ref.segments && ref.segments.length > 0);
        const bracketEl = _buildLecdemBracket(ref, nodeId, artistLabel);
        if (hasSegments) {
          // Concert bracket — has its own internal chevron; render directly.
          li.appendChild(bracketEl);
          if (subjectChips && subjectChips.length > 0) {
            const subjectsDiv = document.createElement('div');
            subjectsDiv.className = 'lecdem-subjects-inline';
            subjectChips.forEach(function (el) { subjectsDiv.appendChild(el); });
            li.appendChild(subjectsDiv);
          }
        } else {
          // Flat row: always wrap in row-accordion so the left chevron is
          // consistent across all rows. Empty bodyEls → phantom chevron for alignment.
          li.appendChild(buildRowAccordion({ headerEl: bracketEl, bodyEls: subjectChips || [], defaultCollapsed: true }));
        }
        byList.appendChild(li);
      });

      bySubsec.appendChild(byList);
      lsBody.appendChild(bySubsec);
    }

    // Lecdems about this musician
    if (lecdemsAbout_.length > 0) {
      const sortedAbout = lecdemsAbout_.slice().sort((a, b) =>
        (a.lecturer_label || '').localeCompare(b.lecturer_label || '')
      );

      const aboutSubsec = document.createElement('div');
      aboutSubsec.className = 'lecdem-subsection';
      aboutSubsec.dataset.subsection = 'about';

      const aboutHdr = document.createElement('div');
      aboutHdr.className = 'lecdem-subsection-header';
      // ADR-128 D9: subsection label simplified to just "About"
      aboutHdr.appendChild(document.createTextNode('About'));
      aboutSubsec.appendChild(aboutHdr);

      const aboutList = document.createElement('ul');
      aboutList.className = 'lecdem-list';

      sortedAbout.forEach(ref => {
        const li = document.createElement('li');
        li.className = 'lecdem-row';

        const lecturerChip = _buildLecturerChip(ref.lecturer_id, ref.lecturer_label);
        const subjectChips = _buildLecdemSubjectChips(ref.subjects, nodeId) || [];
        const hasSegments = !!(ref.segments && ref.segments.length > 0);
        // Pass the lecturer's identity so the player footer shows the lecturer chip first,
        // not the subject musician (nodeId here is the about-subject, not the lecturer).
        const bracketEl = _buildLecdemBracket(ref, ref.lecturer_id || nodeId, ref.lecturer_label || artistLabel);
        const bodyEls = [lecturerChip, ...subjectChips].filter(Boolean);
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
        aboutList.appendChild(li);
      });

      aboutSubsec.appendChild(aboutList);
      lsBody.appendChild(aboutSubsec);
    }

    _sections.push({ sectionEl: lsSection, count: lecdemCount });
  }

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

  // ADR-107: CONCERTS section header always rendered (even when empty) so the
  // + chip is always visible and invites first-concert entry.
  // ADR-128 D3: use buildSection; D5 note: Concerts not a first-class vocab chip yet.
  // ADR-128 D8 + D10: 'Concerts' promoted to neutral chip with microphone glyph.
  const _concertsChip = document.createElement('span');
  _concertsChip.className = 'neutral-chip chip-section-hdr has-glyph neutral-chip-concerts';
  _concertsChip.textContent = 'CONCERTS';
  // ADR-144 Phase A: dblclick CONCERTS header → add-concert form pre-scoped to this musician
  if (typeof applyChipRole === 'function') applyChipRole(_concertsChip, 'section-add', 'recording');
  _concertsChip.dataset.sectionAction = 'add-concert';
  _concertsChip.dataset.musicianId   = nodeId;
  const { sectionEl: concertSection, bodyEl: concertBody } = buildSection({
    headerChip: _concertsChip,
    count: concerts.length,
  });
  concertSection.dataset.section = 'concerts';
  concerts.forEach(concert => {
    const bracket = buildConcertBracket(concert, nodeId, artistLabel);
    concertBody.appendChild(bracket);
  });
  _sections.push({ sectionEl: concertSection, count: concerts.length });

  // ── 2. Raga tree — structured perfs + normalized legacy, all grouped by raga ──
  // Deduplicate: legacy entries whose video_id is already in structured_perfs are skipped.
  const structuredKeys = new Set(structuredPerfs.map(p => p.media_key));
  const normalizedLegacy = legacyTracks
    .filter(t => !structuredKeys.has(t.media_key))
    .map(t => ({
      video_id:       t.vid,
      media:          t.media,         // ADR-154
      media_key:      t.media_key,     // ADR-154
      display_title:  t.label || '',
      date:           t.year ? String(t.year) : null,
      short_title:    null,
      title:          null,
      raga_id:        t.raga_id || null,
      composition_id: t.composition_id || null,
      offset_seconds: 0,
    }));
  const allPerfs = [...structuredPerfs, ...normalizedLegacy];
  // Header always rendered so all sections are visible for every musician.
  // ADR-128 D3: use buildSection. Composite headerChip preserves "Recordings by Raga" reading order.
  // ADR-128 D8 + D10: 'Recordings' promoted to neutral chip with gramophone glyph.
  const _ragaHdrLabel = document.createElement('span');
  const _recordingsChip = document.createElement('span');
  _recordingsChip.className = 'neutral-chip chip-section-hdr has-glyph neutral-chip-recordings';
  _recordingsChip.textContent = 'RECORDINGS';
  // ADR-144 Phase A: dblclick RECORDINGS header → add-recording form pre-scoped to this musician
  if (typeof applyChipRole === 'function') applyChipRole(_recordingsChip, 'section-add', 'recording');
  _recordingsChip.dataset.sectionAction = 'add-recording';
  _recordingsChip.dataset.musicianId   = nodeId;
  _ragaHdrLabel.appendChild(_recordingsChip);
  const { sectionEl: ragaSection, bodyEl: ragaBody } = buildSection({
    headerChip: _ragaHdrLabel,
    count: allPerfs.length,
  });
  ragaSection.dataset.section = 'raga-recordings';
  if (allPerfs.length > 0) {
    ragaBody.appendChild(buildRagaTree(allPerfs, nodeId, artistLabel));
  }
  _sections.push({ sectionEl: ragaSection, count: allPerfs.length });

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

  // ── 4 (ADR-109). Compositions by this musician ─────────────────────────────
  // + chip always visible regardless of whether a composer record is linked.
  // Passes { composerId } when found, { musicianId } otherwise — openAddCompositionForm
  // handles the auto-create companion composer record path (ADR-109 §2).
  // ADR-128 D3: use buildSection.
  {
    const compAddTitle = composerForNode
      ? 'Add a composition by ' + (composerForNode.name || composerForNode.id)
      : 'Add a composition by this musician';
    // ADR-128 D12: 'Compositions' uses the .comp-chip section header (orange,
    // uppercase) — same chip the Bani Flow panel uses, so the vocabulary
    // matches across panels.
    const _compsChip = document.createElement('span');
    _compsChip.className = 'comp-chip chip-section-hdr';
    _compsChip.textContent = 'Compositions';
    // ADR-144: Compositions section-add chip — dblclick opens add-composition form pre-scoped to this musician
    if (typeof applyChipRole === 'function') applyChipRole(_compsChip, 'section-add', 'composition');
    _compsChip.dataset.sectionAction = 'add-composition';
    _compsChip.dataset.musicianId   = nodeId;
    const { sectionEl: compSection, bodyEl: compBody } = buildSection({
      headerChip: _compsChip,
      count: composerComps.length,
    });
    compSection.classList.add('comp-section');

    if (composerComps.length > 0) {
      const compList = document.createElement('ul');
      compList.className = 'comp-section-list';

      // ── Group compositions by raga (raga-first tree) ──────────────────────
      const ragaList = typeof ragas !== 'undefined' ? ragas : [];
      const byRaga = {};
      const ragaOrder = [];
      composerComps.forEach(comp => {
        const key = comp.raga_id || '__no_raga__';
        if (!byRaga[key]) { byRaga[key] = []; ragaOrder.push(key); }
        byRaga[key].push(comp);
      });
      // Sort raga groups alphabetically by raga name
      ragaOrder.sort((a, b) => {
        if (a === '__no_raga__') return 1;
        if (b === '__no_raga__') return -1;
        const ra = ragaList.find(r => r.id === a);
        const rb = ragaList.find(r => r.id === b);
        return (ra ? ra.name : a).localeCompare(rb ? rb.name : b);
      });

      ragaOrder.forEach(ragaId => {
        const compsInRaga = byRaga[ragaId]
          .slice()
          .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

        const groupLi = document.createElement('li');
        groupLi.className = 'comp-raga-group';

        // Raga header row
        const groupHeader = document.createElement('div');
        groupHeader.className = 'comp-raga-header';

        if (ragaId !== '__no_raga__') {
          const ragaObj = ragaList.find(r => r.id === ragaId);
          if (ragaObj) {
            const ragaChip = document.createElement('span');
            ragaChip.className = 'raga-chip';
            ragaChip.textContent = ragaObj.name;
            ragaChip.title = 'Explore ' + ragaObj.name + ' in Bani Flow';
            ragaChip.addEventListener('click', e => {
              e.stopPropagation();
              ragaChip.classList.add('chip-tapped');
              setTimeout(() => ragaChip.classList.remove('chip-tapped'), 200);
              triggerBaniSearch('raga', ragaId);
            });
            groupHeader.appendChild(ragaChip);
          }
        } else {
          const unknownLabel = document.createElement('span');
          unknownLabel.className = 'comp-raga-unknown';
          unknownLabel.textContent = 'Unknown raga';
          groupHeader.appendChild(unknownLabel);
        }

        const countBadge = document.createElement('span');
        countBadge.className = 'rec-group-count';
        countBadge.textContent = `(${compsInRaga.length})`;
        groupHeader.appendChild(countBadge);
        groupLi.appendChild(groupHeader);

        // Composition items indented under raga
        const childList = document.createElement('ul');
        childList.className = 'comp-raga-children';

        compsInRaga.forEach(comp => {
          const li = document.createElement('li');
          li.className = 'comp-raga-item';

          const compChip = document.createElement('span');
          compChip.className = 'comp-chip';
          compChip.textContent = comp.title || comp.id;
          compChip.title = (comp.title || comp.id) + ' \u2014 Explore in Bani Flow';
          compChip.addEventListener('click', e => {
            e.stopPropagation();
            compChip.classList.add('chip-tapped');
            setTimeout(() => compChip.classList.remove('chip-tapped'), 200);
            triggerBaniSearch('comp', comp.id);
          });
          li.appendChild(compChip);
          childList.appendChild(li);
        });

        groupLi.appendChild(childList);
        compList.appendChild(groupLi);
      });

      compBody.appendChild(compList);
    }

    _sections.push({ sectionEl: compSection, count: composerComps.length });
  }

  // ── 5. ADR-128 D4: Empty-section demotion ────────────────────────────────
  // Stable partition: sections with count > 0 come first (natural order),
  // sections with count === 0 come last (natural order). Sort before append.
  const _populated = _sections.filter(s => s.count > 0);
  const _empty     = _sections.filter(s => s.count === 0);
  [..._populated, ..._empty].forEach(s => recList.appendChild(s.sectionEl));

  // ── 6. Show/hide panel ────────────────────────────────────────────────────
  // ADR-107: always show the panel when a node is selected — even with no
  // recordings — so the Concerts + chip is always reachable.
  const hasContent = concerts.length > 0 || legacyTracks.length > 0 || composerComps.length > 0
    || lecdemsBy_.length > 0 || lecdemsAbout_.length > 0
    || !!nodeId;  // always true when called from selectNode
  recPanel.style.display  = hasContent ? 'block' : 'none';
  recFilter.style.display = hasContent ? 'block' : 'none';

  // ── 7. Notes section (ADR-097 §7) ────────────────────────────────────────
  // If the musician node carries a notes[] array, append it as a soft
  // footnote below the rest of the recordings panel content.
  const nodeNotes = nd.notes;
  if (Array.isArray(nodeNotes) && nodeNotes.length > 0) {
    const notesEl = buildNotesSection(nodeNotes);
    if (notesEl) recList.appendChild(notesEl);
  }
}

// ── _buildLecdemSubjectChips — subject cross-links for a lecdem row (ADR-080) ──
// ADR-128 D6: delegates to the converged buildLecdemSubjectChips in panel_components.js.
// Backward-compat wrapper: returns null (not []) when empty, matching old call sites.
function _buildLecdemSubjectChips(subjects, excludeId) {
  const chips = buildLecdemSubjectChips(subjects, { excludeMusicianId: excludeId });
  return chips.length > 0 ? chips : null;
}

// ── _buildLecturerChip — render a lecdem lecturer as an era-tinted musician chip ──
// Lecturers in lecdems are first-class musicians; render them with the same
// .musician-chip affordance used everywhere else so they navigate to the
// lecturer's musician panel on click. Returns null if id/label missing.
function _buildLecturerChip(lecturerId, lecturerLabel) {
  if (!lecturerId || !lecturerLabel) return null;
  const chip = document.createElement('span');
  chip.className = 'musician-chip';
  chip.textContent = lecturerLabel;
  chip.title = 'Open ' + lecturerLabel + "'s panel";

  // ADR-150: use resolveNode for era-tint so transit lecturers also get tinted
  const _lNodeData = (typeof resolveNode === 'function') ? resolveNode(lecturerId)
    : ((typeof cy !== 'undefined') ? cy.getElementById(lecturerId) : null);
  if (_lNodeData && typeof THEME !== 'undefined' && THEME.eraTintCss) {
    const eraId = _lNodeData.data('era') || null;
    const tint  = THEME.eraTintCss(eraId);
    chip.style.setProperty('--chip-era-bg',     tint.bg);
    chip.style.setProperty('--chip-era-border', tint.border);
  }

  chip.addEventListener('click', e => {
    e.stopPropagation();
    chip.classList.add('chip-tapped');
    setTimeout(() => chip.classList.remove('chip-tapped'), 200);
    // Zoom+center in the guru-shishya (graph) view, then populate the panel
    if (typeof orientToNode === 'function' && typeof currentView !== 'undefined' && currentView === 'graph') {
      orientToNode(lecturerId);
    }
    const lNode = (typeof cy !== 'undefined') ? cy.getElementById(lecturerId) : null;
    if (lNode && lNode.length && typeof selectNode === 'function') {
      selectNode(lNode);
      if (typeof window.setPanelState === 'function') {
        setTimeout(() => window.setPanelState('MUSICIAN'), 50);
      }
    } else if (typeof _openMusicianPanelForTransit === 'function') {
      // Isolated musician (no lineage edges) — open panel via transit path
      _openMusicianPanelForTransit(lecturerId);
    }
  });
  return chip;
}

// ── Named-player API (ADR-029: Sruti Bar) ─────────────────────────────────────
// A secondary registry keyed by a string playerId (e.g. 'sruti').
// Allows sruti_bar.js to open/close a singleton drone player without
// interfering with the vid-keyed concert player registry.
const namedPlayerRegistry = new Map();

/**
 * getCurrentPlayerTime(vid) → number | null   (ADR-101 §C)
 *
 * Returns the last-seeked offset_seconds for the player with the given vid,
 * or null if no player is active for that vid. This is the currentOffset
 * recorded when the user last clicked a track — it is an approximation of
 * the playback position, not the live YouTube playback time (which would
 * require the YouTube IFrame API).
 *
 * Usage: const t = getCurrentPlayerTime('dQw4w9WgXcQ');
 *        if (t !== null) offsetInput.value = t;
 *        else offsetInput.placeholder = 'Enter offset manually';
 */
function getCurrentPlayerTime(vid) {
  // ADR-154: accept a legacy vid, a media_key, or a MediaRef; key by media_key.
  const inst = playerRegistry.get(mediaKey(resolveMedia(vid)));
  return inst ? (inst.currentOffset || 0) : null;
}

/**
 * _buildSegTimeline(ref) → <ul.seg-timeline>   (ADR-101 §D)
 *
 * Builds a clickable timestamp timeline for a lecdem ref that has segments.
 * Each button seeks the video player to that segment's offset.
 */
function _buildSegTimeline(ref) {
  const ul = document.createElement('ul');
  ul.className = 'seg-timeline';
  ref.segments.forEach(seg => {
    const ts = seg.timestamp || (() => {
      const s = seg.offset_seconds || 0;
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      return h > 0
        ? h + ':' + String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0')
        : m + ':' + String(ss).padStart(2,'0');
    })();

    const segLabel = seg.display_title
      || (seg.composition_id && seg.raga_id ? seg.composition_id + ' (' + seg.raga_id + ')' : null)
      || seg.raga_id
      || seg.composition_id
      || seg.kind
      || 'Segment';

    const li = document.createElement('li');
    li.className = 'seg-timeline-item';

    const btn = document.createElement('button');
    btn.className = 'seg-timeline-btn';
    btn.title = 'Play from ' + ts;
    btn.innerHTML = '<span class="seg-ts">' + ts + '</span>'
      + '<span class="seg-label">' + segLabel + '</span>';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openOrFocusPlayer(ref.video_id, segLabel, '', seg.offset_seconds, ref.label || 'Lecture-Demo', [], {});
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
  return ul;
}

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

  // On mobile, route all named players (including sruti/tanpura) through the
  // mobile singleton bottom-sheet player — one video at a time (ADR-037).
  if (_isMobilePlayer()) {
    _getMobilePlayer()._currentPlayerId = playerId || null;
    _openMobilePlayer(videoId, title, '', undefined, undefined, [], {});
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
  const namedBar = buildPlayerBar(resolveMedia(videoId), '', title, title, false, {});
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

  // Named player: sruti drone has a minimize toggle (ADR-131 R3) alongside a
  // close button. The minimize toggle collapses the player to a bright title-bar
  // strip. The close button stops the drone and resets the tonic ring.
  if (playerId === 'sruti') {
    el.classList.add('sruti-player');
    const minBtn = el.querySelector('.mp-close');
    if (minBtn) {
      minBtn.textContent = '\u2212';   // − (minus sign) = minimize
      minBtn.title = 'Minimize';
      minBtn.setAttribute('aria-label', 'Minimize sruti player');
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const minimized = el.classList.toggle('sruti-minimized');
        minBtn.textContent = minimized ? '\u2922' : '\u2212';   // ⤢ restore | − minimize
        minBtn.title       = minimized ? 'Restore' : 'Minimize';
        minBtn.setAttribute('aria-label',
          minimized ? 'Restore sruti player' : 'Minimize sruti player');
      });
    }
    // Close button: stops drone and resets the tonic ring on the raga wheel
    const srutiCloseBtn = document.createElement('button');
    srutiCloseBtn.className = 'mp-sruti-close';
    srutiCloseBtn.textContent = '\u2715';   // ✕
    srutiCloseBtn.title = 'Stop tanpura';
    srutiCloseBtn.setAttribute('aria-label', 'Stop tanpura drone');
    srutiCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof RagaWheel !== 'undefined' && typeof RagaWheel._clearSrutiRing === 'function') {
        RagaWheel._clearSrutiRing();
      }
      closePlayer('sruti');
    });
    const barRight = el.querySelector('.mp-bar-right');
    if (barRight) barRight.appendChild(srutiCloseBtn);
  } else {
    el.querySelector('.mp-close').addEventListener('click', () => {
      closePlayer(playerId);
    });
  }

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
  // On mobile, named players run through the singleton — close that instead.
  if (_isMobilePlayer() && _mobilePlayer) {
    _closeMobilePlayer();
    return;
  }
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

  const expandBtn = document.createElement('button');
  expandBtn.className = 'mp-mini-expand';
  expandBtn.title = 'Expand player';
  expandBtn.setAttribute('aria-label', 'Expand player');
  expandBtn.textContent = '\u25B2';   // ▲ upward triangle = expand
  strip.appendChild(expandBtn);

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
    miniExpand: expandBtn,
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

  // Mini expand chevron (▲) — explicit expand affordance at left of strip
  mp.miniExpand.addEventListener('click', e => {
    e.stopPropagation();
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
    if (dy > 20) _collapseMobilePlayer(false);
  }, { passive: true });
  mp.handle.addEventListener('click', () => _collapseMobilePlayer(false));

  // Full mode bar: tap anywhere on the bar to collapse (except dedicated buttons)
  mp.bar.addEventListener('click', e => {
    const isBtn = e.target.closest('.mp-close, .mp-tracklist-toggle, .mp-copy-btn');
    if (isBtn) return;
    _collapseMobilePlayer(false);
  });

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

function _openMobilePlayer(mediaArg, trackLabel, artistName, startSeconds, concertTitle, tracks, meta) {
  const mp = _getMobilePlayer();

  // ADR-154: normalise to a MediaRef and key by media_key.
  const media = resolveMedia(mediaArg);
  if (!media) return;
  const mkey = mediaKey(media);

  // Stop any previous playback
  if (mp.iframe) mp.iframe.src = '';

  mp.media = media;
  mp.mediaKey = mkey;
  mp.vid = (media.provider === 'youtube') ? media.provider_id : null;
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
  const fullBar = buildPlayerBar(media, artistName, concertTitle || trackLabel, trackLabel,
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

  // ── Wire clipboard copy button on mobile path ────────────────────────────
  // buildPlayerBar() creates a fresh .mp-copy-btn but _openMobilePlayer() only
  // re-wires .mp-close, .mp-minimize, .mp-tracklist-toggle. Clone to drop any
  // stale listeners (same pattern as tracklist toggle above), then wire.
  const mobileCopyBtn = mp.bar.querySelector('.mp-copy-btn');
  if (mobileCopyBtn) {
    const freshCopy = mobileCopyBtn.cloneNode(true);
    mobileCopyBtn.parentNode.replaceChild(freshCopy, mobileCopyBtn);
    freshCopy.addEventListener('click', e => {
      e.stopPropagation();
      const url = shareUrl(mp.media, mp.currentOffset || 0);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          freshCopy.classList.add('mp-copy-copied');
          setTimeout(() => freshCopy.classList.remove('mp-copy-copied'), 1500);
          showCopyLinkToast();
        });
      }
    });
  }

  // ADR-151: wire share button on mobile path (same clone pattern as copy btn)
  const mobileShareBtn = mp.bar.querySelector('.mp-share-btn');
  if (mobileShareBtn) {
    const freshShare = mobileShareBtn.cloneNode(true);
    mobileShareBtn.parentNode.replaceChild(freshShare, mobileShareBtn);
    freshShare.addEventListener('click', e => {
      e.stopPropagation();
      const fragment = encodePermalink(mp);
      if (!fragment) return;
      window.location.hash = fragment;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(window.location.href).then(() => {
          freshShare.classList.add('mp-share-copied');
          setTimeout(() => freshShare.classList.remove('mp-share-copied'), 1500);
          showCopyLinkToast('Permalink copied!');
        });
      }
    });
  }

  // Watch on YouTube — refresh href with current offset just before the user clicks.
  const mobileYtLink = mp.bar.querySelector('.mp-yt-link');
  if (mobileYtLink) {
    mobileYtLink.addEventListener('touchstart', () => {
      mobileYtLink.href = shareUrl(mp.media, mp.currentOffset || 0);
    }, { passive: true });
    mobileYtLink.addEventListener('mouseenter', () => {
      mobileYtLink.href = shareUrl(mp.media, mp.currentOffset || 0);
    });
  }

  // ── Build iframe ────────────────────────────────────────────────────────
  mp.videoWrap.innerHTML = '';
  mp.videoWrap.style.paddingTop = '56.25%';
  mp.videoWrap.style.height = '';
  const iframe = document.createElement('iframe');
  iframe.className = 'mp-iframe';
  iframe.src = embedUrl(media, startSeconds);
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope';
  iframe.allowFullscreen = true;
  mp.videoWrap.appendChild(iframe);
  mp.iframe = iframe;

  // ── Build tracklist ─────────────────────────────────────────────────────
  mp.tracklistDiv.innerHTML = '';
  if (mp.tracks.length > 0) {
    const pseudoInstance = {
      el: mp.el, iframe: mp.iframe, tracklistEl: mp.tracklistDiv,
      media, mediaKey: mkey, vid: mp.vid, currentOffset: startSeconds || 0,
      meta: mp.meta,
    };
    const trackUl = buildPlayerTrackList(mkey, mp.tracks, pseudoInstance);
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
    _initTrack ? (_initTrack.display_title || null) : (trackLabel || null),
    _initTrack ? (_initTrack.tala || null) : ((mp.meta && mp.meta.tala) || null)
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
  playerRegistry.set(mkey, {
    el: mp.el, iframe: mp.iframe, titleEl: mp.bar.querySelector('.mp-title'),
    tracklistEl: mp.tracklistDiv, media, mediaKey: mkey, vid: mp.vid,
    _isMobileSingleton: true,
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

  mp.el.classList.remove('mini');
  mp.el.classList.add('full-mobile');
  // ADR-042: full player covers lower half; mini strip gone, restore normal offset
  document.body.classList.remove('mobile-mini-player');
  if (typeof cy !== 'undefined') setTimeout(function () { cy.resize(); }, 40);
}

function _collapseMobilePlayer(restoreState) {
  if (!_mobilePlayer) return;
  if (restoreState === undefined) restoreState = true;
  const mp = _mobilePlayer;

  mp.el.classList.remove('full-mobile');
  mp.el.classList.add('mini');
  // ADR-043: restore mini strip visibility + drawer offset
  showMiniPlayer();

  // Restore saved panel state only when called programmatically (restoreState=true).
  // All user-initiated fold gestures (minimize button, handle tap/swipe, bar tap)
  // pass false — the user expects to land on the underlying view, not have a panel reopen.
  if (restoreState && mp._savedPanelState && typeof window.setPanelState === 'function') {
    window.setPanelState(mp._savedPanelState);
    mp._savedPanelState = null;
  }
}
// ADR-050: expose for mobile.js setPanelState to call on exploration
window._collapseMobilePlayer = _collapseMobilePlayer;

function _closeMobilePlayer() {
  if (!_mobilePlayer) return;
  const mp = _mobilePlayer;

  // If the active player was the sruti drone, reset the tonic ring.
  if (mp._currentPlayerId === 'sruti' &&
      typeof RagaWheel !== 'undefined' &&
      typeof RagaWheel._clearSrutiRing === 'function') {
    RagaWheel._clearSrutiRing();
  }
  mp._currentPlayerId = null;

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
    mp.iframe.src = embedUrl(mp.media,
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
    track.display_title || null,
    track.tala || null
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

