// ── media player manager ──────────────────────────────────────────────────────
// ADR-154: the registry is keyed by media_key ("provider:provider_id"), not the
// bare YouTube vid. Instances carry { el, iframe, titleEl, media, mediaKey }.
const playerRegistry = new Map();
let topZ = 800;            // shared z-counter for entry forms + patch cart (above the Playlist Bar)
let playerZ = 100;         // media players sit BELOW the Playlist Bar (z-index 750)
const PLAYER_Z_MAX = 700;
function _nextPlayerZ() { playerZ = Math.min(playerZ + 1, PLAYER_Z_MAX); return playerZ; }
let spawnCount = 0;
// ADR-175: user-set output volume (0..1), persisted across queue items so a
// track change never resets the level. The slider in the Playlist Bar / current
// row reads and writes this through _setPlayerVolume().
let _volumeLevel = 1;
// ADR-186: film-strip glyph for the video show/hide toggle (Playlist Bar +
// current queue row). `currentColor` keeps it on the theme's text colour.
const _MEDIA_TOGGLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="1.5"/><path d="M2.5 9h19M2.5 15h19"/><path d="M6 5v4M10 5v4M14 5v4M18 5v4M6 15v4M10 15v4M14 15v4M18 15v4"/></svg>';

// ── ADR-158: relative-seek gesture constants ──────────────────────────────────
// SEEK_STEP is the universal "skip" quantum (YouTube/NewPipe default). Tap-zone
// double-taps and arrow keys both move the playhead in multiples of it.
const SEEK_STEP     = 10;   // seconds per step
const DOUBLE_TAP_MS = 300;  // double-tap detection / single-tap play-toggle debounce
const ACCUM_MS      = 700;  // trailing window for additional taps/keys to accumulate

// ADR-158: the topmost open player — the document-level key handler seeks this one.
// Set by bringToFront() (every open/raise/mousedown across desktop + mobile paths).
let _activePlayer = null;

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

// ── ADR-151/170: encode current UI state as a URL fragment for sharing ───────
// Reads the player instance (vid, currentOffset, meta), the left-panel trail
// (via window.getBaniTrail), and the right-panel musician node
// (via window.getCurrentPanelNode) and encodes them into the URL fragment.
// ADR-170: the v:2 JSON state is unchanged; only the transport shrank. We
// deflate-raw + base64url into a `#z=` fragment (~half the length), falling
// back to the legacy plain-base64 `#s=` form when CompressionStream is absent.
// permalink.js reads both prefixes, so old links keep resolving.

// ADR-164: hard cap on inlined ephemeral-queue items. Persistent playlists
// (ADR-163) ride the permalink by id (`q.pl`) regardless of length — only
// nameless queues pay the inline cost. 20 items ≈ 2 KB of JSON, which the
// ADR-170 deflate pass squeezes to a few hundred bytes (repeated keys are
// nearly free); beyond that we truncate and say so, never silently.
const QUEUE_PERMALINK_CAP = 20;

// Compact per-item wire form: { m, s?, e?, r?, c?, n?, rec?, l? } — media_key
// plus only the fields the reader needs to rebuild a playable queue row.
// `tracks` (segment tracklists) are deliberately NOT inlined (too heavy); the
// restored item degrades to a plain span, same as the single-item restore.
function _encodeQueueItemForPermalink(it) {
  const k = (it && it.media) ? mediaKey(it.media) : null;
  if (!k) return null;
  const o = { m: k };
  if (it.startSeconds > 0) o.s = Math.round(it.startSeconds);
  const meta = it.meta || {};
  if (meta.end_seconds > 0) o.e = Math.round(meta.end_seconds);
  if (meta.ragaId) o.r = meta.ragaId;
  if (meta.compositionId) o.c = meta.compositionId;
  if (meta.nodeId) o.n = meta.nodeId;
  if (meta.recId) o.rec = meta.recId;
  // Label only when it carries information the chips can't (no composition).
  if (!o.c && typeof it.label === 'string' && it.label) o.l = it.label.slice(0, 80);
  return o;
}

// Returns { fragment, notice } — notice is set when the shared queue had to be
// truncated to fit the cap, so the share toast can surface it honestly.
async function encodePermalink(instance) {
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
    // ADR-164: encode the running queue as an optional `q` extension on v:2
    // (no version bump — old readers ignore unknown fields and degrade to the
    // single-item restore, which is exactly pre-ADR-164 behaviour). The
    // position offset stays in the top-level `t`; q carries only the sequence
    // + cursor. Persistent playlists share by id; ephemeral queues inline.
    let notice = null;
    if (window.MediaQueue && MediaQueue.active && MediaQueue.items.length) {
      if (MediaQueue.playlistId) {
        state.q = { pl: MediaQueue.playlistId, i: MediaQueue.index };
      } else {
        const all = MediaQueue.items.map(_encodeQueueItemForPermalink).filter(Boolean);
        if (all.length) {
          let start = 0;
          if (all.length > QUEUE_PERMALINK_CAP) {
            // Window the slice so the cursor item always survives: first N
            // when playing near the top, else the N ending at the cursor.
            start = Math.max(0, Math.min(MediaQueue.index - QUEUE_PERMALINK_CAP + 1,
                                         all.length - QUEUE_PERMALINK_CAP));
            notice = 'queue truncated to ' + QUEUE_PERMALINK_CAP + ' of ' + all.length + ' items';
          }
          const kept = all.slice(start, start + QUEUE_PERMALINK_CAP);
          state.q = { items: kept, i: Math.max(0, MediaQueue.index - start) };
        }
      }
    }
    const json = JSON.stringify(state);
    // ADR-170: compress with native deflate-raw, then base64url into `#z=`.
    if (typeof CompressionStream === 'function') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const stream = new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(cs);
        const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return { fragment: '#z=' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''), notice };
      } catch (e) { /* fall through to the legacy plain form */ }
    }
    // Legacy `#s=`: btoa over UTF-8 (percent-escaped bytes → latin1).
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return { fragment: '#s=' + b64, notice };
  } catch (err) {
    return null;
  }
}

// Initial spawn position before _dockPlayer() takes over. ADR-183: the content
// player is always re-docked beneath the playlist UI, so this only seeds the
// first paint (and the fallback when no playlist UI exists yet).
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
  player.el.style.zIndex = _nextPlayerZ();
  _activePlayer = player;   // ADR-158: keyboard seek targets the topmost player
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
      let left = Math.max(0, Math.min(cx - ox, bounds.width  - el.offsetWidth));
      let top  = Math.max(0, Math.min(cy - oy, bounds.height - el.offsetHeight));
      const clamped = _avoidUIOverlap(el, left, top);
      el.style.left = clamped.left + 'px';
      el.style.top  = clamped.top  + 'px';
      el._detached = true;   // ADR-175: independent of the playlist now
      _syncPlayerControls(el);
    });
  });
  document.addEventListener('mouseup', () => {
    if (dragging) _snapPlayerIfNearBar(el);
    _syncPlayerControls(el);
    dragging = false; bounds = null;
  });
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
    el._userResized = true;   // ADR-175: user chose a width; stop auto-matching
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
      // ADR-159: update the bar's identity rail to reflect the selected track
      updatePlayerRail(player, t.raga_id || null, t.composition_id || null, t.display_title || null, t.tala || null);
      refreshPlayingIndicators();
    });

    ul.appendChild(li);
  });

  return ul;
}

// ── buildPlayerBar — [▾] [chip rail] [copy][share][yt][≡?][✕] ──────────────
// ADR-159: the identity chips (musician · raga · comp · composer · tala) live
// in the bar as a live rail (buildPlayerRail), replacing the freeform title.
// The concert/source string is demoted to the bar tooltip; the .mp-title span
// survives only as a fallback when there are no chips (sruti drone, named bar).
function buildPlayerBar(media, artistName, concertTitle, trackLabel, hasTracks, meta) {
  meta = meta || {};
  const bar = document.createElement('div');
  bar.className = 'mp-bar';

  // ── Fold-cue (▾ visual hint that the bar collapses the player; non-interactive) ─
  // ADR-168: chips row ─ identity rail only (fold-cue moved to mp-bar-right).
  // On desktop mp-bar-chips-row gets flex:1, sitting beside mp-bar-right.
  // On mobile (.full-mobile) mp-bar is a column: mp-bar-right (fold-cue + buttons)
  // is the top row, mp-bar-chips-row (chips only) is the full-width bottom row.
  const chipsRow = document.createElement('div');
  chipsRow.className = 'mp-bar-chips-row';

  // ── ADR-159: live identity rail replaces the title (fills remaining space) ─
  const titleText = concertTitle || '';
  if (titleText) bar.title = titleText;   // concert/source string demoted to tooltip
  const rail = buildPlayerRail({
    nodeId:        meta.nodeId        || null,
    artistName:    artistName         || null,
    ragaId:        meta.ragaId        || null,
    compositionId: meta.compositionId || null,
    displayTitle:  trackLabel         || null,
    tala:          meta.tala          || null,
    subjects:      meta.subjects      || null,
  });
  if (rail) {
    chipsRow.appendChild(rail);
  } else if (titleText) {
    // No chips (sruti drone / named bar): fall back to the plain title.
    const titleSpan = document.createElement('span');
    titleSpan.className = 'mp-title';
    titleSpan.textContent = titleText;
    chipsRow.appendChild(titleSpan);
  }
  bar.appendChild(chipsRow);

  // ── Track list toggle + close (right-anchored) ────────────────────────────
  const rightGroup = document.createElement('span');
  rightGroup.className = 'mp-bar-right';

  // Promoted musician chip: visible only on mobile (CSS hides on desktop).
  // Placed between the fold-cue and action buttons so the top bar reads:
  // [▾] [Musician Name — full wrap] [copy][share][yt][≡?][✕]
  const promoChip = _buildMusicianChipForFooter(meta.nodeId || null, artistName || null);
  if (promoChip) {
    promoChip.classList.add('mp-musician-promo');
    rightGroup.appendChild(promoChip);
  }

  // ADR-139: clipboard copy button — copies ytDirectUrl(vid, currentOffset) to clipboard.
  // Click handler is wired in createPlayer() after the instance is constructed.
  const copyBtn = document.createElement('button');
  copyBtn.className = 'mp-copy-btn';
  copyBtn.title = 'Copy YouTube link';
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

  // ADR-175: the tracklist toggle (burger) is retired — the Playlist Bar's
  // editor now owns list navigation. The old ✕ slot becomes an explicit
  // minimize: collapse the video surface while the audio keeps playing.
  const minBtn = document.createElement('button');
  minBtn.className = 'mp-minimize';
  minBtn.title = 'Minimize';
  minBtn.setAttribute('aria-label', 'Minimize');
  minBtn.setAttribute('aria-pressed', 'false');
  minBtn.textContent = '\u2014';
  rightGroup.appendChild(minBtn);

  bar.appendChild(rightGroup);
  return bar;
}

// ── ADR-160: universal minimize ──────────────────────────────────────────────
// Toggle the `.minimized` state on a player root: the bar (with its live chip
// rail) stays; the video, tracklist, and resize handle are hidden via CSS; the
// media keeps playing (we never tear down the controller). Returns the new state.
// ADR-175: sync the minimize affordance (button; the old fold-cue may be absent).
function _syncMinimizeUi(el, minimized) {
  const label = minimized ? 'Restore' : 'Minimize';
  const cue = el.querySelector('.mp-fold-cue');
  if (cue) {
    cue.textContent = minimized ? '▴' : '▾';
    cue.title = label;
  }
  const btn = el.querySelector('.mp-minimize');
  if (btn) {
    btn.textContent = minimized ? '□' : '—';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', minimized ? 'true' : 'false');
  }
}

// ADR-175: the union rect (viewport coords) of the Playlist Bar and its editor.
// The player must always rest OUTSIDE this region so the editor can never hide
// the player's header, and the player can never occlude the playlist.
function _playlistUiRect() {
  const bar = document.getElementById('playlist-bar');
  if (!bar) return null;
  // ADR-185: an empty Playlist Bar is display:none; treat it as absent so the
  // dynamic top wall collapses and the view reclaims the band.
  if (bar.offsetWidth === 0 && bar.offsetHeight === 0) return null;
  const br = bar.getBoundingClientRect();
  const ed = bar.querySelector('.mp-queue-bar');
  let left = br.left, top = br.top, right = br.right, bottom = br.bottom;
  if (ed && ed.style.display !== 'none' && ed.offsetHeight > 0) {
    const er = ed.getBoundingClientRect();
    left = Math.min(left, er.left); top = Math.min(top, er.top);
    right = Math.max(right, er.right); bottom = Math.max(bottom, er.bottom);
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// ADR-176 (view window): the bottom of the playlist UI (bar + open editor) is
// the top wall of the centre view. Publish it as `--playlist-ui-bottom` so
// #canvas-wrap's margin-top tracks the editor as it deepens; the matching view
// re-fit is requested through window.refitViewWindow (mobile.js), which
// re-centres cy / the raga wheel after the new inset lands.
function _syncViewTopInset() {
  const ui = _playlistUiRect();
  const main = document.getElementById('main');
  const root = document.documentElement;
  let bottom = 0;
  if (ui && main) {
    bottom = Math.max(0, Math.round(ui.bottom - main.getBoundingClientRect().top));
  }
  root.style.setProperty('--playlist-ui-bottom', bottom + 'px');
}

// ADR-183 (fixed dock): the playlist editor deepens downward and the docked
// player sits directly beneath it, so an unbounded editor would push the video
// out of the viewport. Cap the editor's height to leave room for the full
// player (16:9 video + its controls strip) plus a bottom gap; `.mp-queue`
// already scrolls vertically, so extra rows reveal a scrollbar instead of
// shoving the video away. Desktop only — the mobile player is a full-screen
// sheet and is not docked under the editor.
function _clampPlaylistEditorHeight() {
  const bar = document.getElementById('playlist-bar');
  const ed = bar && bar.querySelector('.mp-queue-bar');
  if (!ed) return;
  if (window.innerWidth <= 768) { ed.style.maxHeight = ''; return; }
  const ui = _playlistUiRect();
  if (!ui) return;
  const main = document.getElementById('main');
  const bounds = main ? _columnBounds(main.getBoundingClientRect(), ui) : null;
  const colW = bounds ? Math.max(0, bounds.right - bounds.left) : ui.width;
  const playerW = Math.max(320, Math.round(Math.min(ui.width, colW)));
  const playerH = Math.round(playerW * 9 / 16) + 10;   // video + controls strip
  const bottomGap = 16;
  const avail = window.innerHeight - bar.getBoundingClientRect().bottom - playerH - bottomGap;
  ed.style.maxHeight = Math.max(120, Math.round(avail)) + 'px';
}

// ── ADR-176: the app-level non-overlap contract ────────────────────────────
// Four surfaces must never overlap one another: the left (bani-flow) sidebar,
// the right (musician) sidebar, the playlist UI (bar + open editor), and every
// floating media player. The first three are laid out by CSS; the player is
// the only free actor, so every player position funnels through
// _resolveNonOverlap(). The sidebars animate open/close with a transform, so a
// closed drawer (translated off-screen) reads as touching the viewport edge
// and is correctly excluded.

// Viewport-space rects of the sidebars that are actually on screen.
function _openSidebarRects() {
  const rects = [];
  ['left-sidebar', 'right-sidebar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;              // collapsed / display:none
    if (r.right <= 1 || r.left >= window.innerWidth - 1) return;  // off-screen (closed)
    rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  });
  return rects;
}

// Every app-level surface a player must stay clear of.
function _uiObstacleRects() {
  const rects = _openSidebarRects();
  const ui = _playlistUiRect();
  if (ui) rects.push({ left: ui.left, top: ui.top, right: ui.right, bottom: ui.bottom });
  return rects;
}

// Pure geometry: do two rects overlap? (margin enlarges `a` before testing.)
function _rectsOverlap(a, b, margin) {
  const m = margin || 0;
  return a.left < b.right + m && a.right > b.left - m &&
         a.top < b.bottom + m && a.bottom > b.top - m;
}

// ADR-176 (chrome band): a floating player observes the persistent Playlist
// Bar's left inset on BOTH sides. The left inset clears the view selector; the
// mirrored right inset protects the withdrawn musician panel (and its floating
// toggle) exactly like the bani-flow panel — the help button's narrower top-right
// inset is not enough once a tall player reaches the bottom toggle row. Pure:
// intersect the parent box with the playlist UI, then mirror the left inset.
function _columnBounds(parentRect, uiRect) {
  if (!parentRect) return null;
  let left = parentRect.left;
  let right = parentRect.right;
  if (uiRect) {
    left = Math.max(left, uiRect.left);
    right = Math.min(right, uiRect.right);
    const leftInset = Math.max(0, left - parentRect.left);
    right = Math.min(right, parentRect.right - leftInset);
  }
  return {
    left,
    top: parentRect.top,
    right: right > left ? right : parentRect.right,
    bottom: parentRect.bottom,
  };
}

// Viewport-space player band for the current layout (parent ∩ Playlist UI).
function _playerColumnBounds(parent) {
  const el = parent || document.getElementById('main');
  if (!el) return null;
  return _columnBounds(el.getBoundingClientRect(), _playlistUiRect());
}

// Pure geometry: nearest w×h position to (left, top) that avoids every obstacle
// and stays inside `bounds` (all viewport coords). Candidates are the proposal
// plus, for each obstacle, the four edges pushed just clear. Zero-overlap
// candidates win; among them the closest to the proposal. When none is feasible
// (a pathologically cramped viewport) the least-overlap candidate is returned
// so the constraint degrades gracefully instead of teleporting the player.
function _resolveNonOverlap(left, top, w, h, obstacles, bounds, margin) {
  const m = (margin == null) ? 6 : margin;
  const cands = [{ left, top }];
  obstacles.forEach(o => {
    // Both a comfortable gap and a flush (zero-gap) edge: when the player is
    // exactly as wide as the free column, only the flush edge fits.
    [0, m].forEach(gap => {
      cands.push({ left, top: o.bottom + gap });
      cands.push({ left, top: o.top - gap - h });
      cands.push({ left: o.right + gap, top });
      cands.push({ left: o.left - gap - w, top });
      cands.push({ left: o.right + gap, top: o.bottom + gap });
      cands.push({ left: o.left - gap - w, top: o.bottom + gap });
    });
  });
  const maxL = bounds.right - w, maxT = bounds.bottom - h;
  let best = null;
  cands.forEach(c => {
    const cl = Math.max(bounds.left, Math.min(c.left, maxL));
    const ct = Math.max(bounds.top,  Math.min(c.top,  maxT));
    const rect = { left: cl, top: ct, right: cl + w, bottom: ct + h };
    const inside = cl >= bounds.left - 0.5 && cl <= maxL + 0.5 &&
                   ct >= bounds.top  - 0.5 && ct <= maxT + 0.5;
    let area = 0;
    obstacles.forEach(o => {
      const ox = Math.min(rect.right, o.right) - Math.max(rect.left, o.left);
      const oy = Math.min(rect.bottom, o.bottom) - Math.max(rect.top, o.top);
      if (ox > 0 && oy > 0) area += ox * oy;
    });
    const dist = Math.abs(cl - left) + Math.abs(ct - top);
    const score = (area > 0.5 ? 1e12 : 0) + (inside ? 0 : 1e11) + area + dist;
    if (!best || score < best.score) best = { left: cl, top: ct, score };
  });
  return best ? { left: Math.round(best.left), top: Math.round(best.top) } : { left, top };
}

// Clamp a proposed parent-space position clear of every obstacle.
function _avoidUIOverlap(el, left, top) {
  const parent = el.offsetParent || document.getElementById('main');
  if (!parent) return { left, top };
  const obstacles = _uiObstacleRects();
  if (!obstacles.length) return { left, top };
  const pr = parent.getBoundingClientRect();
  const w = el.offsetWidth || 480, h = el.offsetHeight || 300;
  const bounds = _columnBounds(pr, _playlistUiRect()) || pr;
  const pos = _resolveNonOverlap(pr.left + left, pr.top + top, w, h, obstacles, bounds, 6);
  return { left: pos.left - pr.left, top: pos.top - pr.top };
}

// ADR-176: a player wider than the free column between the sidebars would spill
// under a panel. Cap it with max-width (auto-restored when the column widens)
// rather than overwriting the user's chosen width.
function _clampPlayerWidthToColumn(el) {
  const bounds = _playerColumnBounds(el.offsetParent || document.getElementById('main'));
  if (!bounds) return;
  const available = Math.max(0, bounds.right - bounds.left);
  if (available > 0 && el.offsetWidth > available) el.style.maxWidth = available + 'px';
  else el.style.maxWidth = '';
}

// ADR-175 / ADR-183: match a player's width to the Playlist UI width (bar /
// editor), so the two are flush at every screen size. The player is not
// resizable, so this is always the authoritative width (capped by
// _clampPlayerWidthToColumn for the free column between sidebars).
function _playerMatchWidth(el) {
  const ui = _playlistUiRect();
  if (!ui) return;
  el.style.width = Math.max(320, Math.round(ui.width)) + 'px';
}

// ADR-175 / ADR-183: the bare player's own minimize + close are ALWAYS shown —
// the video is permanently docked and on screen, so its top controls must stay
// reachable regardless of the editor row's own controls.
function _syncPlayerControls(el) {
  if (!el) return;
  const overlay = el.querySelector('.mp-player-controls');
  if (!overlay) return;
  overlay.style.display = 'flex';
}

// ADR-175: magnetically dock a player under the Playlist UI (bar + open editor).
// ADR-176: the dock target is the free column between the sidebars, and the
// final position clears every obstacle (sidebars + playlist UI). left/top are
// written relative to the player's offsetParent.
function _dockPlayer(el) {
  _clampPlaylistEditorHeight();
  _playerMatchWidth(el);
  _clampPlayerWidthToColumn(el);
  const ui = _playlistUiRect();
  const parent = el.offsetParent || document.getElementById('main');
  if (!ui || !parent) return;
  const pr = parent.getBoundingClientRect();
  const pw = el.offsetWidth  || 480;
  const ph = el.offsetHeight || 300;
  const margin = 8;
  // Preferred target: centred under the playlist UI, just below it.
  const left = ui.left + (ui.width - pw) / 2;
  const top  = ui.bottom + margin;
  const bounds = _columnBounds(pr, ui) || pr;
  const pos = _resolveNonOverlap(left, top, pw, ph, _uiObstacleRects(), bounds, margin);
  el.style.left = (pos.left - pr.left) + 'px';
  el.style.top  = (pos.top  - pr.top)  + 'px';
  el._detached = false;
  _syncPlayerControls(el);
}

// Drag release: if the player is dropped onto any app-level surface — or just
// below the Playlist UI — settle it back into a non-overlapping spot. A player
// dragged clear of everything is left where the user put it.
function _snapPlayerIfNearBar(el) {
  if (!el || el.style.display === 'none') return;
  const ui = _playlistUiRect();
  const er = el.getBoundingClientRect();
  const rect = { left: er.left, top: er.top, right: er.right, bottom: er.bottom };
  const blocked = _uiObstacleRects().some(o => _rectsOverlap(rect, o, 0));
  if (blocked) {
    const parent = el.offsetParent || document.getElementById('main');
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    _clampPlayerWidthToColumn(el);
    const bounds = _columnBounds(pr, ui) || pr;
    const pos = _resolveNonOverlap(er.left, er.top, el.offsetWidth, el.offsetHeight,
                                   _uiObstacleRects(), bounds, 6);
    el.style.left = (pos.left - pr.left) + 'px';
    el.style.top  = (pos.top  - pr.top)  + 'px';
    el._detached = true;
    _syncPlayerControls(el);
    return;
  }
  const near = ui && er.right > ui.left && er.left < ui.right &&
               Math.abs(er.top - ui.bottom) < 80;
  // Only content players dock under the playlist; standalone utility players
  // (sruti/tanpura) keep their own anchor placement.
  if (near && el.dataset.standalone !== '1') _dockPlayer(el);
}

// ADR-176: re-establish non-overlap after any layout change beneath the
// players. A content player attached to the playlist re-docks; a detached one
// is only nudged clear (its position is the user's choice). Standalone utility
// players (sruti/tanpura, `namedPlayerRegistry`) are also nudged but never
// re-docked — they keep their own anchor placement.
function _repositionPlayers() {
  if (window.innerWidth <= 768) return;   // floating geometry is desktop-only
  _clampPlaylistEditorHeight();
  const parent = document.getElementById('main');
  if (!parent) return;
  const pr = parent.getBoundingClientRect();
  const obstacles = _uiObstacleRects();
  const bounds = _columnBounds(pr, _playlistUiRect()) || pr;
  const settleClamped = el => {
    if (!el || !el.isConnected || el.style.display === 'none') return;
    _clampPlayerWidthToColumn(el);
    const pos = _resolveNonOverlap(pr.left + (el.offsetLeft || 0), pr.top + (el.offsetTop || 0),
                                   el.offsetWidth, el.offsetHeight, obstacles, bounds, 6);
    el.style.right = 'auto';
    el.style.left = (pos.left - pr.left) + 'px';
    el.style.top  = (pos.top  - pr.top)  + 'px';
    _syncPlayerControls(el);
  };
  playerRegistry.forEach(inst => {
    const el = inst && inst.el;
    if (!el || !el.isConnected || el.style.display === 'none') return;
    if (el._detached) settleClamped(el);
    else _dockPlayer(el);
  });
  namedPlayerRegistry.forEach(inst => settleClamped(inst && inst.el));
}

let _repositionRaf = 0;
function _scheduleReposition() {
  if (_repositionRaf) cancelAnimationFrame(_repositionRaf);
  _repositionRaf = requestAnimationFrame(() => { _repositionRaf = 0; _repositionPlayers(); });
}

// Watch the surfaces that move under the players: viewport, drawer open/close
// (class flip + transform settle), and playlist-bar resize.
function _installPlacementGuards() {
  window.addEventListener('resize', _scheduleReposition);
  ['left-sidebar', 'right-sidebar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(_scheduleReposition)
        .observe(el, { attributes: true, attributeFilter: ['class'] });
    }
    el.addEventListener('transitionend', e => {
      if (e.propertyName === 'transform') _scheduleReposition();
    });
  });
  if (typeof ResizeObserver !== 'undefined') {
    const bar = document.getElementById('playlist-bar');
    if (bar) new ResizeObserver(_scheduleReposition).observe(bar);
  }
  // ADR-176: the bar has no editor yet (created in _initPlaylistBar), but set
  // the initial top wall now so the first paint is already inset.
  _syncViewTopInset();
}
_installPlacementGuards();

function _toggleMinimized(el) {
  // ADR-175: a content player collapses INTO the playlist — the window hides,
  // audio continues, and the Playlist Bar is the persistent face. Standalone
  // utility players (sruti/tanpura) keep the ADR-160 strip minimize so they
  // remain restorable (they are not in the playlist).
  if (el.dataset.standalone !== '1') {
    const hidden = el.style.display === 'none';
    if (hidden) {
      el.style.display = '';
      el.classList.remove('minimized');
      _dockPlayer(el);
    } else {
      el.style.display = 'none';
      el.classList.add('minimized');
    }
    _syncMinimizeUi(el, !hidden);
    return !hidden;
  }
  const min = el.classList.toggle('minimized');
  if (min) {
    el._savedWidth = el.style.width;
    el.style.width = 'auto';
  } else if (el._savedWidth) {
    el.style.width = el._savedWidth;
    el._savedWidth = null;
  }
  _syncMinimizeUi(el, min);
  return min;
}

// Promote the bar's fold-cue (▾) into a real minimize toggle. Marked active so
// the CSS only shows the affordance where it is wired. stopPropagation on
// mousedown so clicking the cue never starts a window drag (the bar is the handle).
function _wireFoldCue(el) {
  const cue = el.querySelector('.mp-fold-cue');
  if (cue) {
    cue.classList.add('mp-fold-active');
    cue.title = 'Minimize';
    cue.addEventListener('mousedown', e => e.stopPropagation());
    cue.addEventListener('click', e => { e.stopPropagation(); _toggleMinimized(el); });
  }
  // ADR-175: explicit minimize button in the old ✕ slot (desktop).
  const btn = el.querySelector('.mp-minimize');
  if (btn) {
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => { e.stopPropagation(); _toggleMinimized(el); });
  }
}

// ── _buildMusicianChipForFooter — era-tinted musician chip with transit fallback ─
// Shared by buildPlayerRail and the rail's performer anchor.
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
    if (instrKey) chip.appendChild(makeInstrBadge(instrKey, 13, { composer: !!node.data('is_composer') }));
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

// ── buildPlayerRail — musician · raga · comp · composer chips in the bar ────
// ADR-159: relocated from the below-video footer into the header bar as the
// single live identity surface. ADR-066: chips use the same classes as panels
// for visual parity. meta = { nodeId, artistName, ragaId, compositionId,
// displayTitle, tala } — all optional. nodeId + artistName drive the performer
// chip, kept as a concert-stable left anchor; raga/comp/composer/tala follow
// and are swapped live by updatePlayerRail as the playhead crosses segments.
function buildPlayerRail(meta) {
  if (!meta) return null;
  const { nodeId, artistName, ragaId, compositionId, displayTitle, tala, subjects } = meta;
  const hasSubjects = subjects && (
    (subjects.raga_ids && subjects.raga_ids.length) ||
    (subjects.composition_ids && subjects.composition_ids.length) ||
    (subjects.musician_ids && subjects.musician_ids.length));
  const hasAny = nodeId || artistName || ragaId || compositionId || displayTitle || hasSubjects;
  if (!hasAny) return null;

  const rail = document.createElement('div');
  rail.className = 'mp-rail';

  // ── Performer chip (stable anchor, always first) ──────────────────────────
  if (nodeId || artistName) {
    const mChip = _buildMusicianChipForFooter(nodeId || null, artistName || null);
    if (mChip) { rail.appendChild(mChip); }
  }

  // ── Raga chip (same .raga-chip class as panels; tala is demoted to the end) ──
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
    rail.appendChild(ragaChip);
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
    rail.appendChild(compChip);

    // ── Composer chip (reuse existing buildComposerChip) ──────────────────
    const composerChip = buildComposerChip(compositionId);
    if (composerChip) rail.appendChild(composerChip);

  } else if (displayTitle) {
    // ── Non-composition fallback label — yt-label-chip style ──
    const lbl = document.createElement('span');
    lbl.className = 'yt-label-chip';
    lbl.textContent = displayTitle;
    rail.appendChild(lbl);
  }

  // ── ADR-159: lecdem subject cross-links populate the rail itself (and its
  // ▾N overflow) — no separate below-video footer. raga/comp/musician → chip. ──
  if (hasSubjects) {
    _buildSubjectChips(subjects).forEach(c => rail.appendChild(c));
  }

  // ── Tala — demoted to the very end, shown only if present (any rendition) ──
  if (tala) {
    const talaSpan = document.createElement('span');
    talaSpan.className = 'trail-tala mp-rail-tala';
    talaSpan.textContent = formatTala(tala);
    rail.appendChild(talaSpan);
  }

  // ── ADR-159: adaptive overflow — chips that don't fit the single line collapse
  // into a "▾ N" menu. The reflow pass (reflowRail) runs once the rail is laid
  // out and again whenever the bar is resized, via a ResizeObserver.
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'mp-rail-more';
  moreBtn.title = 'Show more chips';
  moreBtn.setAttribute('aria-expanded', 'false');
  moreBtn.style.display = 'none';
  const overflow = document.createElement('div');
  overflow.className = 'mp-rail-overflow';
  rail.appendChild(moreBtn);
  rail.appendChild(overflow);
  rail._overflowEl = overflow;   // referenced by reflowRail; popped to <body> while open
  moreBtn.addEventListener('click', e => {
    e.stopPropagation();
    _toggleRailOverflow(moreBtn, overflow);
  });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => reflowRail(rail));
    ro.observe(rail);
    rail._railObserver = ro;
  } else {
    requestAnimationFrame(() => reflowRail(rail));
  }

  return rail;
}

// ── reflowRail — adaptive overflow for the bar's identity rail (ADR-159 §5) ──
// Measures the single-line rail; any chips that don't fit are moved (in order)
// into the .mp-rail-overflow menu, and the "▾ N" toggle is shown. Idempotent:
// always pulls chips back inline first, then re-measures.
function reflowRail(rail) {
  if (!rail || !rail.isConnected) return;
  const moreBtn  = rail.querySelector(':scope > .mp-rail-more');
  const overflow = rail._overflowEl;
  if (!moreBtn || !overflow) return;
  // bring the menu back into the rail if it was popped out to <body> while open
  if (overflow.parentNode !== rail) rail.appendChild(overflow);
  // 1) reset: pull every overflowed chip back inline (before the button)
  while (overflow.firstChild) rail.insertBefore(overflow.firstChild, moreBtn);
  overflow.classList.remove('open');
  moreBtn.style.display = 'none';
  moreBtn.setAttribute('aria-expanded', 'false');
  const fits = () => rail.scrollWidth <= rail.clientWidth + 1;
  if (fits()) return;                       // everything fits — no menu needed
  // 2) reserve the button's width, then move trailing chips out until it fits
  moreBtn.style.display = '';
  const chips = Array.from(rail.children).filter(c => c !== moreBtn && c !== overflow);
  let i = chips.length - 1;
  while (i >= 0 && !fits()) {
    if (chips[i].dataset.anchor) { i--; continue; }        // never overflow priority chips
    overflow.insertBefore(chips[i], overflow.firstChild);   // preserve original order
    i--;
  }
  const n = overflow.children.length;
  if (n === 0) { moreBtn.style.display = 'none'; return; }
  moreBtn.textContent = '▾ ' + n;  // ▾ N
}

// ── _toggleRailOverflow — open/close the ▾ N menu ────────────────────────────
// While open, the menu is reparented to <body> and positioned with fixed
// viewport coords. This is essential on the minimized mobile strip: its
// ancestor (.media-player.mini) has a transform + overflow:hidden, which would
// otherwise make position:fixed resolve against — and be clipped by — that
// ancestor. On close it is tucked back into the rail so reflowRail can manage it.
function _tuckRailOverflow(overflow) {
  const rail = overflow._ownerRail;
  overflow.classList.remove('open');
  if (rail && overflow.parentNode !== rail) rail.appendChild(overflow);
}
function _toggleRailOverflow(moreBtn, overflow) {
  const rail = moreBtn.parentNode;
  const opening = !overflow.classList.contains('open');
  // Close (and tuck back) any other open menu first.
  document.querySelectorAll('.mp-rail-overflow.open').forEach(o => {
    o.classList.remove('open');
    _tuckRailOverflow(o);
  });
  if (!opening) {
    moreBtn.setAttribute('aria-expanded', 'false');
    _tuckRailOverflow(overflow);
    return;
  }
  // Pop out to <body> so a transformed / overflow-hidden ancestor can't clip it.
  overflow._ownerRail = rail;
  document.body.appendChild(overflow);
  const r = moreBtn.getBoundingClientRect();
  overflow.style.left = Math.round(r.left) + 'px';
  overflow.style.top  = Math.round(r.bottom + 4) + 'px';
  overflow.classList.add('open');
  moreBtn.setAttribute('aria-expanded', 'true');
  // Flip upward if the menu would spill off the bottom of the viewport — needed
  // for the mobile mini strip, which sits at the bottom edge.
  const menuH = overflow.offsetHeight;
  if (r.bottom + 4 + menuH > window.innerHeight) {
    overflow.style.top = Math.round(Math.max(4, r.top - menuH - 4)) + 'px';
  }
  // Keep the menu within the right edge too.
  const menuW = overflow.offsetWidth;
  if (r.left + menuW > window.innerWidth) {
    overflow.style.left = Math.round(Math.max(4, window.innerWidth - menuW - 4)) + 'px';
  }
  // Close on the next click outside the menu (capture phase so it runs first).
  setTimeout(() => {
    const onDoc = ev => {
      if (overflow.contains(ev.target) || ev.target === moreBtn) return;
      _tuckRailOverflow(overflow);
      moreBtn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onDoc, true);
    };
    document.addEventListener('click', onDoc, true);
  }, 0);
}

// ── updatePlayerRail — swap the bar's identity rail in-place ──────────────────
// ADR-159: replaces the chip rail in the header bar when a track is selected
// (buildPlayerTrackList click) or when the playhead crosses a segment boundary
// (_updateActiveSegment). Reads nodeId + artistName from player.meta so the
// performer anchor persists across track changes on both desktop and mobile.
function updatePlayerRail(player, ragaId, compositionId, displayTitle, tala) {
  const el = player.el;
  const bar = el.querySelector('.mp-bar');
  if (!bar) return;
  // Include performer meta so the performer chip persists across track changes
  const pmeta = player.meta || {};
  const newRail = buildPlayerRail({
    nodeId:        pmeta.nodeId    || null,
    artistName:    pmeta.artistName || null,
    ragaId,
    compositionId,
    displayTitle:  displayTitle || null,
    tala:          tala || null,
    subjects:      pmeta.subjects || null,   // ADR-159: lecdem subjects persist across segment updates
  });
  // Remove the existing rail (or the title fallback) from the bar, then insert
  // the new rail before the right-anchored button group so buttons stay pinned.
  const existing = bar.querySelector('.mp-rail') || bar.querySelector('.mp-title');
  if (existing) {
    if (existing._railObserver) existing._railObserver.disconnect();  // drop stale observer
    if (existing._overflowEl) existing._overflowEl.remove();          // drop popped-out menu
    existing.remove();
  }
  if (newRail) {
    // ADR-168: rail lives inside mp-bar-chips-row; fall back to old bar insert.
    const chipsRow = bar.querySelector('.mp-bar-chips-row');
    if (chipsRow) {
      chipsRow.appendChild(newRail);
    } else {
      const rightGroup = bar.querySelector('.mp-bar-right');
      if (rightGroup) bar.insertBefore(newRail, rightGroup);
      else            bar.appendChild(newRail);
    }
  }
}

// ── ADR-156: chapter markers on the controlled timeline ───────────────────────
// A track/segment carries offset_seconds + label fields; turn the list into Plyr
// marker points {time, label} so the progress bar shows seekable chapter dots.
function _markerLabel(t) {
  if (t.subject) return t.subject;            // ADR-156: per-chapter topic wins
  if (t.display_title) return t.display_title;
  if (t.composition_id && typeof compositions !== 'undefined') {
    const c = compositions.find(x => x.id === t.composition_id);
    if (c && c.title) return c.title;
  }
  if (t.raga_name) return t.raga_name;
  if (t.raga_id) return t.raga_id;
  return 'Segment';
}

function markerPointsFromTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  return tracks
    .filter(t => (t.offset_seconds || 0) > 0)   // a marker at 0 is just the start
    .map(t => ({
      time: t.offset_seconds,
      // Plyr renders the label as HTML in the tooltip — sanitise angle brackets.
      label: String(_markerLabel(t)).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    }))
    .sort((a, b) => a.time - b.time);
}

// ADR-156: map a lecdem ref's segments[] to the player's track shape, so a
// lecdem's chapters become in-player tracklist rows + timeline markers (the
// same treatment concert performances get).
function segmentsToTracks(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map(seg => {
    const ragaObj = (typeof ragas !== 'undefined' && seg.raga_id) ? ragas.find(r => r.id === seg.raga_id) : null;
    return {
      offset_seconds: seg.offset_seconds || 0,
      subject:        seg.subject || null,     // ADR-156: per-chapter topic
      display_title:  seg.display_title || seg.subject || seg.raga_id || seg.kind || '',
      raga_id:        seg.raga_id || null,
      raga_name:      ragaObj ? ragaObj.name : (seg.raga_id || ''),
      tala:           seg.tala || null,
      timestamp:      seg.timestamp || '00:00',
      composition_id: seg.composition_id || null,
    };
  });
}

// ADR-163 §5 / ADR-176 follow-up: the playhead boundary at which the current
// queue item gives way to the next playlist item. Prefers the item's explicit
// end_seconds (set by the enqueue/harvest thunks); falls back to the next
// chapter after the item's own start when the item carries a track list (the
// "play this track" path). Returns null for a whole-video item with no boundary.
function _queueItemBoundary(instance, item) {
  const m = item && item.meta;
  if (m && m.end_seconds != null) return m.end_seconds;
  const tracks = (instance && instance.tracks) || [];
  const start = item ? (item.startSeconds || 0) : 0;
  let next = null;
  for (const t of tracks) {
    const off = t.offset_seconds || 0;
    if (off > start && (next == null || off < next)) next = off;
  }
  return next;
}

// ADR-176 follow-up: should the current queue item give way to the next item at
// `sec`? The boundary is compulsory ONLY when another playlist item follows; the
// last item is allowed to run on into the rest of the concert. Kept as one
// named predicate so desktop + mobile onTime share it and tests can drive it.
function _shouldAdvanceQueue(instance, sec) {
  if (typeof MediaQueue === 'undefined' || !MediaQueue.isCurrent(instance.mediaKey)) return false;
  if (MediaQueue.index >= MediaQueue.items.length - 1) return false;
  const qi = MediaQueue.items[MediaQueue.index];
  const boundary = _queueItemBoundary(instance, qi);
  return boundary != null && sec >= boundary;
}

// ADR-156: live active-segment — given the current playhead, find the segment
// in progress and (when it changes) sync the footer chips + tracklist highlight.
// Assumes instance.tracks is sorted ascending by offset_seconds.
function _updateActiveSegment(instance, sec) {
  const tracks = instance.tracks;
  if (!tracks || tracks.length === 0) {
    if (typeof MediaQueue !== 'undefined' && MediaQueue.isCurrent(instance.mediaKey)) {
      MediaQueue.activeChapter = null;
    }
    return;
  }
  let active = tracks[0];
  for (let i = 0; i < tracks.length; i++) {
    if ((tracks[i].offset_seconds || 0) <= sec) active = tracks[i];
    else break;
  }
  if (instance._activeOffset === active.offset_seconds) return;   // unchanged
  instance._activeOffset = active.offset_seconds;
  // ADR-159: the header rail tracks the playhead — swap chips as the concert
  // moves from one segment (kriti) to the next.
  updatePlayerRail(instance, active.raga_id || null, active.composition_id || null,
                   active.subject || active.display_title || null, active.tala || null);
  if (instance.tracklistEl) {
    instance.tracklistEl.querySelectorAll('.mp-track-item').forEach(li => {
      li.classList.toggle('mp-track-active', parseInt(li.dataset.offset, 10) === active.offset_seconds);
    });
  }
  // ADR-176 follow-up: the Current Playlist must always tell us what is playing.
  // When this player is the queue's current item and the playhead has run past
  // the item's OWN offset into a later concert chapter (allowed when the item is
  // the last in the playlist, or when it carries the whole concert as chapters),
  // publish that chapter so the row + bar re-render with the sounding track.
  if (typeof MediaQueue !== 'undefined' && MediaQueue.isCurrent(instance.mediaKey)) {
    const qi = MediaQueue.items[MediaQueue.index];
    const ownStart = qi ? (qi.startSeconds || 0) : 0;
    // A stale timeupdate below the item's own start (just after a retarget seek)
    // must not paint a previous chapter — only publish once the playhead is in.
    MediaQueue.activeChapter = (qi && sec >= ownStart && (active.offset_seconds || 0) !== ownStart) ? active : null;
    if (typeof _refreshQueuePanels === 'function') _refreshQueuePanels();
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
function mountPlayer(videoWrap, media, startSeconds, markerPoints) {
  const src = (typeof embedSource === 'function') ? embedSource(media) : null;
  const usePlyr = !!(media && media.controllable && typeof Plyr !== 'undefined' && src);
  const points = Array.isArray(markerPoints) ? markerPoints : [];

  if (usePlyr) {
    // Plyr enhances a typed target element (its documented setup), NOT a bare
    // empty div: embeds use a <div data-plyr-provider data-plyr-embed-id>;
    // direct files use a real <audio>/<video> with a <source>.
    let target;
    if (media.provider === 'youtube' || media.provider === 'vimeo') {
      target = document.createElement('div');
      target.setAttribute('data-plyr-provider', media.provider);
      target.setAttribute('data-plyr-embed-id', media.provider_id);
    } else {
      target = document.createElement(media.provider === 'audio' ? 'audio' : 'video');
      target.setAttribute('controls', '');
      target.setAttribute('playsinline', '');
      const s = document.createElement('source');
      s.src = media.url;
      target.appendChild(s);
    }
    videoWrap.classList.add('mp-has-plyr');   // let Plyr own its 16:9 sizing
    videoWrap.appendChild(target);
    const isEmbed = (media.provider === 'youtube' || media.provider === 'vimeo');
    const player = new Plyr(target, {
      controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
      loadSprite: false,                  // sprite is inlined in the document (ADR-155 M1)
      ratio: '16:9',
      autoplay: true,
      // AUDIT-015 F-01: browsers only reliably permit autoplay while muted —
      // unmuted autoplay needs a fresh user gesture, which is lost across the
      // async iframe-ready boundary. Start muted so the speaker icon never
      // lies about a silently-muted stream, then unmute on the first `playing`
      // event below (unmuting an already-playing video is allowed without a
      // gesture). This removes the "click unmute twice" desync.
      muted: true,
      // AUDIT-015 F-02 + ADR-158: the tap-zone gesture layer (added on ready) owns
      // single-tap play/pause for every controllable provider, so Plyr's own
      // clickToPlay is disabled uniformly — both to dodge the cross-origin iframe
      // swallowing centre clicks (embeds) and to keep one tap code path (HTML5).
      clickToPlay: false,
      // ADR-158: we own all key seeking at the document level. Cross-origin
      // iframes capture focus, so Plyr's `focused` keyboard would never fire for
      // YouTube/Vimeo anyway; disabling both avoids a double-seek on HTML5.
      keyboard: { focused: false, global: false },
      youtube: { rel: 0, modestbranding: 1, iv_load_policy: 3 },
      vimeo: { byline: false, portrait: false, title: false },
      markers: { enabled: points.length > 0, points },   // ADR-156: chapter markers
    });
    // ADR-175: apply the user's persisted volume to every new player so the
    // level survives queue advances. Autoplay still starts muted (AUDIT-015).
    try { player.volume = _volumeLevel; } catch (e) {}
    if (startSeconds && startSeconds > 0) {
      player.once('ready', () => { try { player.currentTime = startSeconds; } catch (e) {} });
    }
    // AUDIT-015 F-01: as soon as playback actually starts, lift the autoplay
    // mute so the user hears sound on first open with no clicks. `once` so a
    // later deliberate mute by the user is never undone.
    player.once('playing', () => { try { player.muted = false; } catch (e) {} });

    // ── ADR-158: relative-seek primitive + accumulating session ───────────────
    // nudge() is the single Strong Centre both the tap layer and the keyboard
    // handler drive. seekStep() wraps it with the running overlay total and the
    // ACCUM_MS window, so N rapid inputs on a side read as one cumulative seek.
    function nudge(delta) {
      try {
        const dur = player.duration || 0;
        let next = (player.currentTime || 0) + delta;
        if (next < 0) next = 0;
        if (dur && next > dur) next = dur;
        player.currentTime = next;
        return next;
      } catch (e) { return null; }
    }
    let _seekSteps = 0, _seekTimer = null, _overlayEl = null;
    function _renderOverlay() {
      if (!_overlayEl) return;
      if (_seekSteps === 0) { _overlayEl.classList.remove('visible', 'seek-left', 'seek-right'); return; }
      const secs = Math.abs(_seekSteps) * SEEK_STEP;
      _overlayEl.textContent = _seekSteps < 0 ? ('« ' + secs + 's') : (secs + 's »');
      _overlayEl.classList.toggle('seek-left', _seekSteps < 0);
      _overlayEl.classList.toggle('seek-right', _seekSteps > 0);
      _overlayEl.classList.add('visible');
    }
    function seekStep(side) {
      const dir = side === 'left' ? -1 : 1;
      if (nudge(dir * SEEK_STEP) === null) return;   // not ready / clamped away
      _seekSteps += dir;
      _renderOverlay();
      clearTimeout(_seekTimer);
      _seekTimer = setTimeout(() => { _seekSteps = 0; _renderOverlay(); _seekTimer = null; }, ACCUM_MS);
    }

    // The gesture layer + overlay live on Plyr's video wrapper, which exists for
    // embeds and HTML5 video but NOT audio. Audio still seeks via keyboard
    // (seekStep → nudge); it just has no tap zones and no on-frame overlay.
    player.once('ready', () => {
      try {
        const wrap = player.elements && player.elements.wrapper;
        if (!wrap) return;
        if (!wrap.querySelector('.mp-seek-overlay')) {
          const ov = document.createElement('div');
          ov.className = 'mp-seek-overlay';
          ov.setAttribute('aria-live', 'polite');
          ov.setAttribute('aria-atomic', 'true');
          wrap.appendChild(ov);
          _overlayEl = ov;
        }
        if (!wrap.querySelector('.mp-click-catch')) {
          const catcher = document.createElement('div');
          catcher.className = 'mp-click-catch';
          wireTapGestures(catcher, wrap, player, seekStep);
          wrap.appendChild(catcher);
        }
      } catch (e) {}
    });

    return {
      kind: 'plyr',
      plyr: player,
      iframe: null,
      seek(sec) { try { player.currentTime = sec || 0; player.play(); } catch (e) {} },
      play()   { try { player.play(); } catch (e) {} },
      pause()  { try { player.pause(); } catch (e) {} },
      isPaused() { try { return !!player.paused; } catch (e) { return false; } },
      // ADR-175: output volume. getVolume reports the LEVEL (mute is a separate
      // Plyr control), so the transient autoplay-mute never reads as 0.
      getVolume() { try { return player.volume; } catch (e) { return null; } },
      setVolume(v) {
        const vol = Math.max(0, Math.min(1, Number(v)));
        if (!isFinite(vol)) return;
        try { player.volume = vol; if (vol > 0) player.muted = false; } catch (e) {}
      },
      nudge,                 // ADR-158: clamped relative seek (returns new time, or null)
      seekStep,              // ADR-158: +overlay accumulation; driven by tap + keyboard
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
    // ADR-155 §4: uncontrollable providers cannot be played/paused programmatically.
    play() {}, pause() {}, isPaused() { return false; },
    // ADR-158 / ADR-155 §4: uncontrollable providers can neither read nor write
    // currentTime — relative seek degrades to a no-op (no overlay, no affordance).
    nudge() { return null; },
    // ADR-175: iframe-backed providers expose no volume API — the slider is
    // disabled rather than lying about control.
    getVolume() { return null; },
    setVolume() {},
    seekStep() {},
    destroy() { iframe.src = ''; },
    onTime() {},
    onEnded() {},
  };
}

// ── ADR-158: tap-zone gesture layer ───────────────────────────────────────────
// Divides the video surface into rewind (left 0–40%), neutral (40–60%) and
// forward (right 60–100%) zones. A single tap toggles play/pause (after a short
// debounce that disambiguates it from a double-tap); a double-tap on a side
// begins a seek session, and every further same-side tap within the window adds
// another SEEK_STEP — so N rapid taps ⇒ (N−1) steps, matching YouTube/NewPipe.
function wireTapGestures(catcher, wrap, player, seekStep) {
  let pending = null, toggleTimer = null, sessionActive = false, sessionTimer = null;
  let revealArmed = false, revealTimer = null;
  const now = () => (window.performance && performance.now) ? performance.now() : Date.now();
  function endSession() { sessionActive = false; clearTimeout(sessionTimer); sessionTimer = null; }
  function armSession() { sessionActive = true; clearTimeout(sessionTimer); sessionTimer = setTimeout(endSession, ACCUM_MS); }
  // ADR-158 mobile follow-up: Plyr's controls bar has no hover affordance on
  // touch, and our transparent .mp-click-catch overlay swallows the taps Plyr
  // would otherwise use to reveal it. controlsHidden() reads Plyr's own
  // plyr--hide-controls class so a first touch tap can force the bar visible
  // via the public toggleControls() API without touching playback; a second
  // tap within the reveal window falls straight through to the toggle/seek
  // logic below.
  function controlsHidden() {
    const c = player.elements && player.elements.container;
    return !!(c && c.classList.contains('plyr--hide-controls'));
  }

  // Plyr has its own touchstart listener that reveals its controls, and that
  // touchstart bubbles up through our catcher (only pointerup calls
  // preventDefault) — so by the time 'pointerup' fires below, Plyr may have
  // already un-hidden the bar and a live controlsHidden() check would read
  // false even though the tap started on a hidden bar. Capture the true
  // pre-tap state at pointerdown, which always fires before touchstart.
  let hiddenAtDown = false;
  catcher.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') hiddenAtDown = controlsHidden();
  });

  catcher.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();   // suppress the synthetic click / double-tap zoom

    // Mobile-only: first tap while controls were hidden just reveals them —
    // it must not also toggle play/pause or count as a seek tap. Desktop
    // mouse clicks never hit this branch, so hover + click-to-toggle stay
    // untouched.
    if (e.pointerType !== 'mouse' && hiddenAtDown && !revealArmed) {
      try { player.toggleControls(true); } catch (err) {}
      revealArmed = true;
      clearTimeout(revealTimer);
      revealTimer = setTimeout(() => { revealArmed = false; }, DOUBLE_TAP_MS);
      return;
    }
    if (revealArmed) { clearTimeout(revealTimer); revealArmed = false; }

    const rect = wrap.getBoundingClientRect();
    const frac = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
    const side = frac < 0.4 ? 'left' : (frac > 0.6 ? 'right' : 'centre');
    const seekZone = side !== 'centre';

    // Already seeking: any further side-tap keeps accumulating, no re-arming tap needed.
    if (sessionActive) {
      if (seekZone) { seekStep(side); armSession(); }
      return;
    }
    // A second tap on the same side within the window arms the seek (its first step).
    if (pending && seekZone && pending.side === side && (now() - pending.t) < DOUBLE_TAP_MS) {
      clearTimeout(toggleTimer); toggleTimer = null; pending = null;
      seekStep(side); armSession();
      return;
    }
    // Otherwise this is a play/pause candidate — fire it once the double-tap window lapses.
    pending = { side, t: now() };
    clearTimeout(toggleTimer);
    toggleTimer = setTimeout(() => {
      try { player.togglePlay(); } catch (e) {}
      pending = null; toggleTimer = null;
    }, DOUBLE_TAP_MS);
  });

  // ADR-158: a double-tap on a seek zone is OUR gesture — stop it bubbling to
  // Plyr's container, whose native dblclick handler would otherwise also toggle
  // fullscreen. Maximize stays reachable via Plyr's bottom-right fullscreen button.
  catcher.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); });
}

// ── ADR-158: keyboard parity ──────────────────────────────────────────────────
// Owned at the document level because cross-origin YouTube/Vimeo iframes capture
// focus, so Plyr's own (disabled) keyboard would never receive these keys. Routes
// ←/→ through the SAME seekStep() as taps, so they share the overlay + accumulation.
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  // Never steal keys from a focused form field (entry/edit forms).
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (e.key === ' ') {
    const inst = _activePlayer;
    if (!inst || !inst.el || !inst.el.isConnected) return;
    const ctrl = inst.controller;
    if (!ctrl || ctrl.kind !== 'plyr' || !ctrl.plyr) return;
    ctrl.plyr.togglePlay();
    e.preventDefault();
    return;
  }

  const side = e.key === 'ArrowLeft' ? 'left' : (e.key === 'ArrowRight' ? 'right' : null);
  if (!side) return;
  const inst = _activePlayer;
  if (!inst || !inst.el || !inst.el.isConnected) return;
  const ctrl = inst.controller;
  if (!ctrl || ctrl.kind !== 'plyr' || typeof ctrl.seekStep !== 'function') return;
  ctrl.seekStep(side);
  e.preventDefault();
});

function createPlayer(media, trackLabel, artistName, startSeconds, concertTitle, tracks, meta) {
  const mkey = mediaKey(media);          // ADR-154: provider-qualified registry key
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;

  const pos = nextSpawnPosition();
  const el = document.createElement('div');
  el.className = 'media-player';
  el.style.cssText = `top:${pos.top}px; left:${pos.left}px; z-index:${_nextPlayerZ()}; width:480px;`;

  // ADR-175 / ADR-183: content players are BARE and FIXED — the video surface
  // only. Identity lives in the Playlist editor row; the window is docked under
  // the playlist UI and is neither draggable nor resizable. Show/hide is driven
  // by the row's collapse control; the bare player keeps its own minimize/close.
  el.classList.add('bare');

  const videoWrap = document.createElement('div');
  videoWrap.className = 'mp-video-wrap';
  el.appendChild(videoWrap);
  // ADR-155: connect the player to the DOM BEFORE mounting Plyr — the YouTube
  // IFrame API needs the target element attached to initialise.
  document.getElementById('main').appendChild(el);
  const controller = mountPlayer(videoWrap, media, startSeconds, markerPointsFromTracks(tracks));
  // ADR-184 / ADR-186: now-playing chip strip. Built here but appended into the
  // player's own control row below (between minimize and close), so the track
  // chips and the window controls share one line. It is no longer a descendant
  // of .mp-video-wrap, but still outside the Fullscreen element (.plyr), so the
  // Fullscreen API continues to hide it automatically.
  const nowPlaying = document.createElement('div');
  nowPlaying.className = 'mp-now-playing';

  const fullMeta = Object.assign({ artistName: artistName || null }, meta || {});

  // ADR-175 / ADR-183: the bare player's own minimize + close — always shown
  // (see _syncPlayerControls), since the video is permanently docked on screen.
  const controls = document.createElement('div');
  controls.className = 'mp-player-controls';
  const minBtn = document.createElement('button');
  minBtn.type = 'button'; minBtn.className = 'mp-player-min';
  minBtn.title = 'Minimize'; minBtn.setAttribute('aria-label', 'Minimize');
  minBtn.textContent = '\u2014';
  minBtn.addEventListener('mousedown', e => e.stopPropagation());
  // ADR-186: keep the row/bar film-strip toggle in step with the video's own
  // minimize button.
  minBtn.addEventListener('click', e => { e.stopPropagation(); _toggleMinimized(el); _refreshQueuePanels(); });
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button'; closeBtn.className = 'mp-player-close';
  closeBtn.title = 'Close player'; closeBtn.setAttribute('aria-label', 'Close player');
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('mousedown', e => e.stopPropagation());
  closeBtn.addEventListener('click', e => { e.stopPropagation(); _pbStopCurrent(); });
  controls.appendChild(minBtn);
  controls.appendChild(nowPlaying);
  controls.appendChild(closeBtn);
  el.appendChild(controls);
  _syncPlayerControls(el);

  const instance = {
    el,
    controller,                  // ADR-155: uniform media controller (Plyr or iframe)
    iframe:       controller.iframe,   // null when Plyr-backed
    plyr:         controller.plyr,     // null when iframe-backed
    titleEl:      null,   // ADR-175: content players are bare (no header)
    tracklistEl:  null,
    media,                       // ADR-154: the MediaRef
    mediaKey:     mkey,          // ADR-154: registry key
    // ADR-154 transitional: keep `vid` for YouTube media so older permalink
    // readers and any lingering vid consumers continue to work.
    vid:          (media && media.provider === 'youtube') ? media.provider_id : null,
    currentOffset: startSeconds || 0,
    // ADR-156: tracks sorted ascending so live active-segment detection is a
    // simple forward scan.
    tracks:       (Array.isArray(tracks) ? tracks.slice() : []).sort((a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0)),
    meta:         fullMeta,
  };

  // ADR-155: live playhead — currentOffset tracks real playback, so share/copy
  // and the permalink capture where the video actually is (fixes AUDIT-014 F-04).
  // ADR-156: also advance the active-segment footer/highlight as playback crosses
  // chapter boundaries.
  controller.onTime(sec => {
    instance.currentOffset = sec;
    // ADR-163 §5 / ADR-176 follow-up: cross-recording continuation — advance the
    // playlist the moment the playhead crosses this item's span boundary, but only
    // when another playlist item follows. Do this BEFORE the active-segment update
    // so a compulsory advance never briefly paints the next chapter on the old row.
    if (_shouldAdvanceQueue(instance, sec)) {
      MediaQueue.advance();
      return;
    }
    _updateActiveSegment(instance, sec);
  });
  // ADR-157: auto-advance the queue when this item ends (if it's the queue's current).
  controller.onEnded(() => { if (MediaQueue.isCurrent(instance.mediaKey)) MediaQueue.advance(); });

  // ADR-175 / ADR-183: no header chrome, no per-player queue UI, no fold-cue,
  // and no drag/resize grips — copy/share/watch live on the Playlist Bar and
  // the window is locked to its docked position beneath the playlist UI.
  el.addEventListener('mousedown', () => bringToFront(instance));

  bringToFront(instance);
  _dockPlayer(el);   // ADR-175: rest beneath the Playlist UI, width-matched
  return instance;
}

// meta = { nodeId, ragaId, compositionId } — all optional; drives clickable chips in title bar
function openOrFocusPlayer(mediaArg, trackLabel, artistName, startSeconds, concertTitle, tracks, meta) {
  // ADR-154: normalise the first argument (legacy YouTube id string, "provider:id"
  // key, url, or a MediaRef) into a MediaRef, then key everything by media_key.
  const media = resolveMedia(mediaArg);
  if (!media) return;
  const mkey = mediaKey(media);
  // ADR-175 Phase 2: content play is the playlist's job. Every non-primitive,
  // non-utility call enters the Current Playlist and is played from there (the
  // Winamp contract). `isQueueItem` marks the playlist's own window-open (so
  // Playlist._open never recurses); `meta.standalone` exempts utility players.
  // Named players (sruti/tanpura) never reach this on desktop, and call
  // _openMobilePlayer directly on mobile.
  if (!(meta && (meta.isQueueItem || meta.standalone))) {
    MediaQueue.playContent({
      media,
      label:         trackLabel || '',
      artistName:    artistName || '',
      startSeconds:  startSeconds || 0,
      concertTitle:  concertTitle || '',
      tracks:        tracks || [],
      meta:          meta || {},
    });
    return;
  }
  // ADR-037: on mobile, delegate to singleton player
  if (_isMobilePlayer()) {
    _openMobilePlayer(media, trackLabel, artistName, startSeconds, concertTitle, tracks, meta);
  } else {
    const p = createPlayer(media, trackLabel, artistName, startSeconds, concertTitle, tracks, meta || {});
    playerRegistry.set(mkey, p);
    refreshPlayingIndicators();
    // ADR-183: the player is locked to the playlist UI. A raga context still
    // opens the Wheel Detail Panel below, but the video no longer jumps beside
    // it — it stays magnetically docked beneath the playlist editor.
  }
  if (meta && meta.ragaId && !meta.isQueueItem && typeof window._openWdpForPlayback === 'function') {
    window._openWdpForPlayback(meta.ragaId, meta.compositionId || null);
  }
}

// ── ADR-157: ephemeral media queue (Phase A) ──────────────────────────────────
// A client-side, in-memory playlist of distinct media. Auto-advances when the
// current item's `ended` event fires (controllable providers only). One player
// window is reused: on advance the previous desktop window is removed (mobile
// reuses its singleton automatically). No persistence, no schema (the persistent
// playlist entity is Phase B, a future ADR).
const MediaQueue = {
  items: [],          // [{ media, label, artistName, startSeconds, concertTitle, tracks, meta }]
  index: -1,
  active: false,
  currentKey: null,
  panelOpen: false,   // ADR-162: whether the "Up Next" panel shows by default
  // ADR-164: when the queue was started from a saved playlist (ADR-163), its id
  // rides here so encodePermalink can share the compact reference form
  // (`q.pl`) instead of inlining items. Any queue edit (add/remove/move) drops
  // the id — the mutated queue no longer IS the playlist, so it inlines.
  playlistId: null,
  _pendingSeek: null, // one-shot startSeconds override for the next _open (permalink restore)
  // ADR-176 follow-up: the chapter currently sounding, when the current item's
  // source video has run past the item's own start into a later concert track.
  // A transient display override — never written back into the item's meta.
  activeChapter: null,

  // Queue items arrive with `media` as a raw video_id string (the row thunks store
  // `_p.video_id`). mediaKey() only works on a resolved MediaRef, so an un-resolved
  // item yields a null key — which silently breaks currentKey, the _switchTo
  // teardown, and isCurrent (the window is never reused, players accumulate).
  // Normalise media to a MediaRef on entry so every mediaKey() call downstream is valid.
  _normalize(it) {
    if (!it || !it.media) return null;
    const m = (typeof resolveMedia === 'function') ? resolveMedia(it.media) : it.media;
    if (!m || !m.provider) return null;
    return (m === it.media) ? it : Object.assign({}, it, { media: m });
  },

  // opts: { playlistId } — ADR-164 share-by-reference; { seekSeconds } —
  // permalink restore lands mid-item (applied once, to the first _open only).
  start(items, startIndex, opts) {
    const newItems = (Array.isArray(items) ? items : []).map(it => this._normalize(it)).filter(Boolean);
    this.playlistId = (opts && opts.playlistId) || null;
    this._pendingSeek = (opts && opts.seekSeconds > 0) ? opts.seekSeconds : null;
    // If the queue is already playing this exact playlist, switch tracks in-place
    // rather than tearing down and re-creating the player window.
    if (this.active && newItems.length === this.items.length &&
        newItems.every((it, j) => mediaKey(it.media) === mediaKey(this.items[j].media))) {
      this._switchTo(Math.max(0, Math.min(startIndex || 0, newItems.length - 1)));
      _refreshQueuePanels();
      return;
    }
    // Reuse the player the user is already looking at rather than spawning a
    // second window (ADR-157: one window is reused). Adopt its position and tear
    // it down before opening the queue head — this is the start()-time analogue of
    // _switchTo's adopt-and-drop. On mobile the singleton reuses itself inside
    // _openMobilePlayer, so _incumbentKey() returns null and there is nothing to drop.
    let pos = null;
    if (newItems.length) {
      const incKey = this._incumbentKey();
      const inc = incKey ? playerRegistry.get(incKey) : null;
      if (inc && inc.el && !inc._isMobileSingleton) {
        pos = { top: inc.el.style.top, left: inc.el.style.left, width: inc.el.style.width };
        if (inc.controller) inc.controller.destroy();
        inc.el.remove();
        playerRegistry.delete(incKey);
        refreshPlayingIndicators();
      }
    }
    this.items = newItems;
    this.index = Math.max(0, Math.min(startIndex || 0, this.items.length - 1));
    this.active = this.items.length > 0;
    this.activeChapter = null;
    // ADR-162: Play all reveals the queue panel on desktop. On mobile the bar
    // stays minimized by default — the full-width editor must not cover a panel.
    this.panelOpen = this.active &&
      !(typeof _isMobilePlayer === 'function' && _isMobilePlayer());
    if (this.active) this._open(pos);
    _refreshQueuePanels();
  },

  // The desktop player the user is currently looking at, whose window start()
  // should reuse instead of spawning a new one: the queue's current player when
  // switching between queues, else the topmost open standalone player. Mobile
  // singletons are excluded (they reuse themselves), so this returns null on
  // mobile and start() falls back to default positioning.
  _incumbentKey() {
    if (this.active && this.currentKey && playerRegistry.has(this.currentKey)) {
      const cur = playerRegistry.get(this.currentKey);
      if (cur && !cur._isMobileSingleton) return this.currentKey;
    }
    let topKey = null, topZi = -Infinity;
    playerRegistry.forEach((inst, key) => {
      if (!inst || inst._isMobileSingleton || !inst.el) return;
      const zi = parseInt(inst.el.style.zIndex, 10) || 0;
      if (zi >= topZi) { topZi = zi; topKey = key; }
    });
    return topKey;
  },

  // True when `mkey` is the queue's current item — guards auto-advance so a
  // stray `ended` from a non-queue player can't drive the queue.
  isCurrent(mkey) { return this.active && !!mkey && mkey === this.currentKey; },

  _open(pos) {
    const it = this.items[this.index];
    if (!it || !it.media) { this.active = false; return; }
    // ADR-164: a permalink restore seeks mid-item; never rewind before a
    // span's own start (ADR-156), and consume the override so later _opens
    // (advance/jump) start items at their natural offsets.
    let ss = it.startSeconds;
    if (this._pendingSeek != null) {
      ss = Math.max(this._pendingSeek, it.startSeconds || 0);
      this._pendingSeek = null;
    }
    this.activeChapter = null;
    const mkey = mediaKey(it.media);
    // ADR-176 follow-up: every track of a concert shares one source video, so a
    // queue can hold several items with the same media_key. If that video is
    // already mounted as the current player, retarget it in place — seek to the
    // new item's offset and adopt its chapters/meta — instead of opening a second
    // window for the same video (which left the first one playing and broke the
    // compulsory advance to the next playlist item).
    const mounted = (this.currentKey === mkey) ? playerRegistry.get(mkey) : null;
    if (mounted && mounted.controller && mounted.el && !mounted._isMobileSingleton) {
      this._retarget(mounted, it, ss);
    } else {
      openOrFocusPlayer(it.media, it.label, it.artistName, ss,
                        it.concertTitle, it.tracks || [], Object.assign({}, it.meta || {}, { isQueueItem: true }));
      this.currentKey = mkey;
      if (pos) {
        const inst = playerRegistry.get(mkey);
        if (inst && inst.el && !inst._isMobileSingleton) {
          inst.el.style.top = pos.top; inst.el.style.left = pos.left;
          if (pos.width) inst.el.style.width = pos.width;
        }
      }
    }
  },

  // ADR-176 follow-up: point an already-mounted player at a new queue item that
  // shares its media (a concert-track boundary). Seeks the existing controller
  // and adopts the item's track list + meta so the active-segment rail and the
  // playlist row stay truthful. No new window is created.
  _retarget(inst, item, ss) {
    this.currentKey = mediaKey(item.media);
    inst.currentOffset = ss || 0;
    if (inst.controller && typeof inst.controller.seek === 'function') {
      inst.controller.seek(ss || 0);
    } else if (inst.iframe && typeof embedUrl === 'function') {
      inst.iframe.src = embedUrl(item.media, ss || 0);
    }
    inst.tracks = (Array.isArray(item.tracks) ? item.tracks.slice() : [])
      .sort((a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0));
    inst.meta = Object.assign({ artistName: item.artistName || null }, item.meta || {});
    inst._activeOffset = null;
    _updateActiveSegment(inst, ss || 0);
  },

  // ADR-162: switch to a given index, reusing one desktop window (drop the prev).
  _switchTo(newIndex) {
    if (newIndex < 0 || newIndex >= this.items.length) return;
    const prevKey = this.currentKey;
    const prevInst = prevKey ? playerRegistry.get(prevKey) : null;
    const pos = (prevInst && prevInst.el && !prevInst._isMobileSingleton)
      ? { top: prevInst.el.style.top, left: prevInst.el.style.left, width: prevInst.el.style.width }
      : null;
    this.index = newIndex;
    this._open(pos);
    if (prevInst && !prevInst._isMobileSingleton && prevKey !== this.currentKey && playerRegistry.has(prevKey)) {
      if (prevInst.controller) prevInst.controller.destroy();
      if (prevInst.el) prevInst.el.remove();
      playerRegistry.delete(prevKey);
      refreshPlayingIndicators();
    }
    _refreshQueuePanels();
  },

  advance() {
    if (!this.active) return;
    if (this.index >= this.items.length - 1) {
      this.active = false; this.currentKey = null; this.activeChapter = null; _refreshQueuePanels(); return;
    }
    this._switchTo(this.index + 1);
  },

  // ADR-162: explicit transport + editing.
  next()     { this.advance(); },
  previous() { if (this.active && this.index > 0) this._switchTo(this.index - 1); },
  jumpTo(i)  { if (this.active && i !== this.index) this._switchTo(i); },

  removeAt(i) {
    if (i < 0 || i >= this.items.length) return;
    this.playlistId = null;   // ADR-164: edited queue no longer mirrors the playlist
    if (i === this.index) {
      // Removing the current item: drop it and play whatever now sits here
      // (the next item), or stop cleanly if it was the last (never stall).
      const prevKey = this.currentKey;
      const prevInst = prevKey ? playerRegistry.get(prevKey) : null;
      this.items.splice(i, 1);
      if (this.items.length === 0) {
        if (prevInst && !prevInst._isMobileSingleton && prevInst.el) {
          if (prevInst.controller) prevInst.controller.destroy();
          prevInst.el.remove(); playerRegistry.delete(prevKey); refreshPlayingIndicators();
        }
        this.clear(); _refreshQueuePanels(); return;
      }
      if (this.index >= this.items.length) this.index = this.items.length - 1;
      const pos = (prevInst && prevInst.el && !prevInst._isMobileSingleton)
        ? { top: prevInst.el.style.top, left: prevInst.el.style.left, width: prevInst.el.style.width } : null;
      this._open(pos);
      if (prevInst && !prevInst._isMobileSingleton && prevKey !== this.currentKey && playerRegistry.has(prevKey)) {
        if (prevInst.controller) prevInst.controller.destroy();
        if (prevInst.el) prevInst.el.remove();
        playerRegistry.delete(prevKey); refreshPlayingIndicators();
      }
    } else {
      this.items.splice(i, 1);
      if (i < this.index) this.index--;
    }
    _refreshQueuePanels();
  },

  move(from, to) {
    if (from < 0 || from >= this.items.length || to < 0 || to >= this.items.length || from === to) return;
    this.playlistId = null;   // ADR-164: reordered queue no longer mirrors the playlist
    const [it] = this.items.splice(from, 1);
    this.items.splice(to, 0, it);
    // Keep `index` pointing at the still-current item after the reorder.
    if (this.currentKey) {
      const ni = this.items.findIndex(x => mediaKey(x.media) === this.currentKey);
      if (ni >= 0) this.index = ni;
    }
    _refreshQueuePanels();
  },

  setPanelOpen(open) { this.panelOpen = !!open; },

  // ADR-163 §3: add a single item to the queue without replacing it.
  addItem(item) {
    const it = this._normalize(item);
    if (!it) return;
    if (!this.active) { this.start([it], 0); return; }
    this.playlistId = null;   // ADR-164: edited queue no longer mirrors the playlist
    this.items.push(it);
    _refreshQueuePanels();
  },

  // ADR-165 §4: append an entire harvest to the queue with a single panel refresh.
  addItems(items) {
    const valid = (items || []).map(it => this._normalize(it)).filter(Boolean);
    if (!valid.length) return;
    if (!this.active) { this.start(valid, 0); return; }
    this.playlistId = null;   // ADR-164: edited queue no longer mirrors the playlist
    this.items.push(...valid);
    _refreshQueuePanels();
  },

  // ── ADR-175: Playlist (Current Playlist) public entry points ──────────────
  // playContent — the Winamp contract. Play a single item by making it part of
  // the Current Playlist: if it already lives there, jump to it (no duplicate);
  // otherwise append it and play.
  playContent(item) {
    const it = this._normalize(item);
    if (!it) return;
    if (!this.active) { this.start([it], 0); return; }
    const mk = mediaKey(it.media);
    const ss = it.startSeconds || 0;
    const i = this.items.findIndex(x => x.media && mediaKey(x.media) === mk && (x.startSeconds || 0) === ss);
    if (i >= 0) {
      // Already in the playlist: restore it (if minimised) or jump to it.
      if (i === this.index && typeof _pbExpandPlayer === 'function') _pbExpandPlayer();
      else this.jumpTo(i);
      return;
    }
    this.playlistId = null;   // ADR-164: edited queue no longer mirrors the playlist
    this.items.push(it);
    this._switchTo(this.items.length - 1);
  },

  // playItems — seed/replace the playlist and play index i (play-all, saved list).
  playItems(items, startIndex, opts) { this.start(items, startIndex, opts); },

  // playSaved — load a persistent playlist (ADR-163) into the Current Playlist.
  playSaved(playlistId) {
    const pl = (typeof playlists !== 'undefined' && Array.isArray(playlists))
      ? playlists.find(p => p.id === playlistId) : null;
    if (!pl) return;
    const items = _playlistToQueueItems(pl);
    if (!items.length) return;
    this.start(items, 0, { playlistId: pl.id });
  },

  clear() { this.items = []; this.index = -1; this.active = false; this.currentKey = null; this.panelOpen = false; this.playlistId = null; this._pendingSeek = null; this.activeChapter = null; },
};
window.MediaQueue = MediaQueue;
window.Playlist = MediaQueue;   // ADR-175: the Current Playlist (alias — one model)
window.startMediaQueue = function(items, startIndex, opts) { MediaQueue.start(items, startIndex, opts); };

// ── ADR-165: row registry + harvest primitive ─────────────────────────────────
// Visibility-channel invariant (§3): filters express exclusion EXCLUSIVELY via
// inline style.display = 'none'. Collapse/fold expresses folding EXCLUSIVELY via
// the `hidden` attribute (or a class that does not touch inline display). No
// template code may use one channel for the other's purpose — harvest semantics
// depend on this separation being respected.
const _queueItemThunks = new WeakMap();  // rowEl → getItem

function registerQueueItem(rowEl, getItem) {
  rowEl.classList.add('q-row');
  _queueItemThunks.set(rowEl, getItem);
}
window.registerQueueItem = registerQueueItem;   // bani_flow.js registers trail rows

// All queue items currently filter-visible inside rootEl, in document order,
// deduplicated by media identity + span start.
function collectQueueItems(rootEl) {
  const seen = new Set(), out = [];
  rootEl.querySelectorAll('.q-row').forEach(row => {
    // Filter channel only: inline display:none on the row or any ancestor below
    // rootEl excludes it. The `hidden` attribute (collapse) does not.
    for (let el = row; el && el !== rootEl; el = el.parentElement) {
      if (el.style && el.style.display === 'none') return;
    }
    const thunk = _queueItemThunks.get(row);
    if (!thunk) return;
    [].concat(thunk() || []).forEach(item => {
      if (!item || !item.media) return;
      const mk = typeof mediaKey === 'function' ? mediaKey(item.media) : item.media;
      const k = mk + '@' + (item.startSeconds || 0);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(item);
    });
  });
  return out;
}
window.collectQueueItems = collectQueueItems;

// ── ADR-163 §3: + affordance — add any item to a playlist via the patch loop ──
// _buildPlusBtn(getItem) → <button class="mp-plus-btn"> that opens a popover menu.
// getItem() is called lazily on click and must return:
//   { media, startSeconds?, meta: { ragaId, compositionId, nodeId, end_seconds? }, label?, artistName? }
function _buildPlusBtn(getItem) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mp-plus-btn';
  btn.title = 'Add to queue';
  btn.setAttribute('aria-label', 'Add to queue');
  btn.textContent = '+';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    // Mobile: no editing features — + always means "add to queue" directly.
    if (_isMobilePlayer()) {
      const item = getItem();
      if (!item || !item.media) return;
      const resolvedMedia = (typeof resolveMedia === 'function') ? resolveMedia(item.media) : item.media;
      if (!resolvedMedia) return;
      MediaQueue.addItem({
        media: resolvedMedia, label: item.label || '', artistName: item.artistName || '',
        startSeconds: item.startSeconds || 0, concertTitle: item.concertTitle || '',
        tracks: item.tracks || [], meta: item.meta || {},
      });
      btn.textContent = '✓'; setTimeout(() => { btn.textContent = '+'; }, 1000);
      return;
    }
    _openPlusMenu(btn, getItem);
  });
  return btn;
}

function _openPlusMenu(anchor, getItem) {
  document.querySelectorAll('.mp-plus-menu').forEach(m => m.remove());
  const item = getItem();
  if (!item || !item.media) return;
  const resolvedMedia = (typeof resolveMedia === 'function') ? resolveMedia(item.media) : item.media;
  if (!resolvedMedia) return;

  const menu = document.createElement('div');
  menu.className = 'mp-plus-menu';

  function _buildOp(resolvedMedia, item) {
    const mk = (typeof mediaKey === 'function') ? mediaKey(resolvedMedia) : null;
    if (!mk) return null;
    const it = { media_key: mk };
    if (item.startSeconds) it.start_seconds = item.startSeconds;
    const m = item.meta || {};
    if (m.end_seconds) it.end_seconds = m.end_seconds;
    if (m.ragaId) it.raga_id = m.ragaId;
    if (m.compositionId) it.composition_id = m.compositionId;
    if (m.nodeId) it.musician_ids = [m.nodeId];
    if (item.label) it.note = item.label;
    return it;
  }

  // Order (top → bottom in DOM = furthest → closest to the + button when menu
  // opens above, which is the common case):
  //   1. “New playlist…”          — furthest, deliberate action
  //   2. “Add to playlist” search — middle, filtered list
  //   3. “Add to queue”           — closest, most immediate action

  // “New playlist…” → op:create
  const newPl = document.createElement('button');
  newPl.type = 'button'; newPl.className = 'mp-plus-menu-item mp-plus-menu-new';
  newPl.textContent = 'New playlist…';
  newPl.addEventListener('click', e => {
    e.stopPropagation(); menu.remove();
    const title = window.prompt('New playlist name:');
    if (!title) return;
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('pl_' + Date.now());
    const it = _buildOp(resolvedMedia, item);
    if (!it) return;
    const op = { op: 'create', id, title, description: '', items: [it], kind: 'user', sources: [] };
    if (typeof window.addToBundle === 'function') {
      window.addToBundle('playlists', op);
      anchor.textContent = '✓'; setTimeout(() => { anchor.textContent = '+'; }, 1500);
    }
  });
  menu.appendChild(newPl);

  // Existing playlists → searchable filter + scrollable list
  const knownPlaylists = (typeof playlists !== 'undefined' && Array.isArray(playlists)) ? playlists : [];
  if (knownPlaylists.length) {
    const divider = document.createElement('div');
    divider.className = 'mp-plus-menu-divider';
    divider.textContent = 'Add to playlist';
    menu.appendChild(divider);

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'mp-plus-menu-search';
    search.placeholder = 'Filter…';
    search.autocomplete = 'off';
    menu.appendChild(search);

    const list = document.createElement('div');
    list.className = 'mp-plus-menu-list';
    menu.appendChild(list);

    function _renderList(q) {
      list.innerHTML = '';
      const term = q.trim().toLowerCase();
      const matched = term
        ? knownPlaylists.filter(pl => (pl.title || pl.id).toLowerCase().includes(term))
        : knownPlaylists;
      if (!matched.length) {
        const empty = document.createElement('div');
        empty.className = 'mp-plus-menu-empty';
        empty.textContent = term ? 'No matches' : 'No playlists yet';
        list.appendChild(empty);
        return;
      }
      matched.forEach(pl => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'mp-plus-menu-item';
        btn.textContent = pl.title || pl.id;
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const it = _buildOp(resolvedMedia, item);
          if (!it) { menu.remove(); return; }
          const op = { op: 'append', id: pl.id, array: 'items', value: it };
          if (typeof window.addToBundle === 'function') window.addToBundle('playlists', op);
          btn.textContent = '✓ Added to “' + (pl.title || pl.id) + '”';
          btn.disabled = true;
          setTimeout(() => menu.remove(), 1000);
        });
        list.appendChild(btn);
      });
    }
    _renderList('');
    search.addEventListener('input', () => _renderList(search.value));
    // Prevent outside-click listener from firing on search keystrokes
    search.addEventListener('click', e => e.stopPropagation());
  }

  // “Add to session queue” — closest to the + button, most immediate action
  const qDivider = document.createElement('div');
  qDivider.className = 'mp-plus-menu-divider';
  menu.appendChild(qDivider);
  const addQ = document.createElement('button');
  addQ.type = 'button'; addQ.className = 'mp-plus-menu-item';
  addQ.textContent = 'Add to queue';
  addQ.addEventListener('click', e => {
    e.stopPropagation(); menu.remove();
    MediaQueue.addItem({
      media: resolvedMedia, label: item.label || '', artistName: item.artistName || '',
      startSeconds: item.startSeconds || 0, concertTitle: item.concertTitle || '',
      tracks: item.tracks || [], meta: item.meta || {},
    });
  });
  menu.appendChild(addQ);

  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const menuH = menu.offsetHeight || 160;
  if (r.top > menuH + 8) {
    menu.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    menu.style.top = 'auto';
  } else {
    menu.style.top = (r.bottom + 4) + 'px';
  }
  menu.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';

  // Focus the search input (if present) so the user can type immediately
  const searchEl = menu.querySelector('.mp-plus-menu-search');
  if (searchEl) setTimeout(() => searchEl.focus(), 40);

  const close = ev => {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close, true); }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}

// ── ADR-162: the "Up Next" queue panel — makes MediaQueue visible & editable ──
// A bar-summoned, upward-opening panel (like the tracklist) listing the queue's
// items with a now-playing highlight, per-row reorder/remove, row-click to jump,
// and prev/next transport. Two-way bound: every control mutates MediaQueue, and
// MediaQueue mutations call _refreshQueuePanels() to re-render every open panel.
function _buildQueueRowChips(item, activeChapter) {
  const base = item.meta || {};
  // ADR-176 follow-up: when the current item's video has advanced into a later
  // concert chapter, that chapter's identity replaces the item's own chips so the
  // row/bar always name the sounding track. Scoped per render — never stored on
  // the item, so saved playlists keep their original identity.
  const act = activeChapter || null;
  const m = act
    ? { nodeId: base.nodeId, ragaId: act.raga_id || null, compositionId: act.composition_id || null }
    : base;
  const label = act ? (act.subject || act.display_title || item.label) : item.label;
  const frag = document.createDocumentFragment();
  const perf = _buildMusicianChipForFooter(m.nodeId || null, item.artistName || null);
  if (perf) frag.appendChild(perf);
  const subj = (typeof _buildSubjectChips === 'function')
    ? _buildSubjectChips({
        raga_ids:        m.ragaId ? [m.ragaId] : [],
        composition_ids: m.compositionId ? [m.compositionId] : [],
        musician_ids:    [],
      })
    : [];
  subj.forEach(c => frag.appendChild(c));
  if (!m.compositionId && !subj.length && label) {
    const lbl = document.createElement('span');
    lbl.className = 'yt-label-chip';
    lbl.textContent = label;
    frag.appendChild(lbl);
  }
  return frag;
}

function _renderQueuePanel(panel) {
  const ul = panel.querySelector('.mp-queue-items');
  if (!ul) return;
  ul.innerHTML = '';
  MediaQueue.items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'mp-queue-item' + (i === MediaQueue.index ? ' mp-queue-current' : '');
    li.dataset.i = i;

    const isCurrent = (i === MediaQueue.index);
    const isCurrentPlaying = isCurrent && _isCurrentPlaying();

    // ADR-184: the per-row minimize chevron is retired. The bare video owns a
    // permanent minimize button, and the editor bar owns the editor fold — the
    // chevron only cost width in an already crowded row.

    const reorder = document.createElement('span');
    reorder.className = 'mp-queue-reorder';
    const up = document.createElement('button');
    up.type = 'button'; up.className = 'mp-queue-up'; up.title = 'Move up'; up.textContent = '▴';
    up.disabled = (i === 0);
    up.addEventListener('click', e => { e.stopPropagation(); MediaQueue.move(i, i - 1); });
    const down = document.createElement('button');
    down.type = 'button'; down.className = 'mp-queue-down'; down.title = 'Move down'; down.textContent = '▾';
    down.disabled = (i === MediaQueue.items.length - 1);
    down.addEventListener('click', e => { e.stopPropagation(); MediaQueue.move(i, i + 1); });
    reorder.appendChild(up); reorder.appendChild(down);
    li.appendChild(reorder);

    const chips = document.createElement('span');
    chips.className = 'mp-queue-chips';
    chips.appendChild(_buildQueueRowChips(item, isCurrent ? MediaQueue.activeChapter : null));
    li.appendChild(chips);

    // ADR-188: the row's primary transport is a PLAY/PAUSE toggle — while the
    // item sounds it shows ❚❚ and pauses; otherwise ▶ and plays/resumes. Stop
    // is a separate, dedicated button below so it never wears a play glyph.
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'mp-queue-play mp-toggle-btn';
    playBtn.title = isCurrentPlaying ? 'Pause' : (isCurrent ? 'Resume' : 'Play');
    playBtn.setAttribute('aria-label', playBtn.title);
    playBtn.setAttribute('aria-pressed', isCurrentPlaying ? 'true' : 'false');
    playBtn.textContent = isCurrentPlaying ? '\u275a\u275a' : '\u25b6';   // ❚❚ / ▶
    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (isCurrent) _pbPlayPauseCurrent();
      else MediaQueue.jumpTo(i);
    });
    li.appendChild(playBtn);
    // ADR-188: stop is its own control for the current item (stop ≠ pause — it
    // tears the controller down). It is always ■, never a play/stop toggle.
    if (isCurrent) {
      const stopBtn = document.createElement('button');
      stopBtn.type = 'button';
      stopBtn.className = 'mp-queue-op mp-queue-stop';
      stopBtn.title = 'Stop'; stopBtn.setAttribute('aria-label', 'Stop');
      stopBtn.textContent = '\u25a0';   // ■
      stopBtn.disabled = !_currentPlayerInst();
      stopBtn.addEventListener('click', e => { e.stopPropagation(); _pbStopCurrent(); });
      li.appendChild(stopBtn);
    }

    // ADR-184: every row owns the operator set — copy · permalink · watch act
    // on THIS row's track, not the currently-playing one. The volume slider
    // stays the current item's last operator (it controls the live player) and
    // is inherited by the editor bar when the editor folds (ADR-175).
    const mkOp = (cls, title, glyph, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mp-queue-op ' + cls;
      b.title = title; b.setAttribute('aria-label', title); b.textContent = glyph;
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      return b;
    };
    li.appendChild(mkOp('mp-queue-copy',  'Copy YouTube link', '\u29c9', () => _copyMediaLink(item)));
    li.appendChild(mkOp('mp-queue-share', 'Copy permalink',    '#',      () => _copyMediaPermalink(item)));
    li.appendChild(mkOp('mp-queue-watch', 'Watch on YouTube',  '\u2197', () => _openMediaOnYouTube(item)));
    // ADR-186: the current row owns the film-strip video toggle (the Playlist
    // Bar inherits it when the editor folds). Restores a minimized docked video.
    if (isCurrent) {
      const vt = document.createElement('button');
      vt.type = 'button';
      vt.className = 'mp-queue-op mp-video-toggle mp-toggle-btn';
      vt.innerHTML = _MEDIA_TOGGLE_SVG;
      const shown = _videoVisible();
      vt.disabled = !_currentPlayerInst();
      vt.title = shown ? 'Hide video' : 'Show video';
      vt.setAttribute('aria-label', vt.title);
      vt.setAttribute('aria-pressed', shown ? 'true' : 'false');
      vt.addEventListener('click', e => { e.stopPropagation(); _toggleVideoVisibility(); });
      li.appendChild(vt);
    }
    if (isCurrent) {
      const vol = document.createElement('input');
      vol.type = 'range'; vol.className = 'mp-queue-vol';
      vol.min = '0'; vol.max = '100'; vol.step = '1'; vol.value = '100';
      vol.title = 'Volume'; vol.setAttribute('aria-label', 'Volume');
      vol.addEventListener('input', e => { e.stopPropagation(); _setPlayerVolume(vol.value / 100); });
      vol.addEventListener('click', e => e.stopPropagation());
      li.appendChild(vol);
    }

    // + affordance — secondary: add to playlist or session queue
    const qplus = _buildPlusBtn((() => {
      const _item = item;
      return () => ({
        media: _item.media, startSeconds: _item.startSeconds || 0,
        concertTitle: _item.concertTitle || '', label: _item.label || '',
        artistName: _item.artistName || '', meta: _item.meta || {},
      });
    })());
    li.appendChild(qplus);

    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'mp-queue-remove';
    rm.title = 'Remove from queue'; rm.setAttribute('aria-label', 'Remove from queue');
    rm.textContent = '✕';
    rm.addEventListener('click', e => { e.stopPropagation(); MediaQueue.removeAt(i); });
    li.appendChild(rm);

    // Row body (outside chips/buttons) jumps to this item.
    li.addEventListener('click', () => MediaQueue.jumpTo(i));
    ul.appendChild(li);
  });
  _syncVolumeControls();
}

function buildQueuePanel() {
  // ADR-184: the "Up Next" head is retired. Its title, prev/next transport
  // (the bar owns transport) and "Save queue as playlist" (playlists are built
  // one track at a time) served no purpose. The editor is the list alone.
  const panel = document.createElement('div');
  panel.className = 'mp-queue';
  panel.style.display = 'none';
  const ul = document.createElement('ul');
  ul.className = 'mp-queue-items';
  panel.appendChild(ul);
  _renderQueuePanel(panel);
  return panel;
}

// ADR-184: paint the sounding track's chips onto every mounted player's video
// overlay. Read-only; refreshed from _refreshQueuePanels so queue advances and
// ADR-176 activeChapter changes both land. The overlay is a sibling of .plyr,
// so the Fullscreen API hides it when the video is maximized.
function _syncNowPlayingOverlays() {
  const item = (MediaQueue.active && MediaQueue.index >= 0)
    ? MediaQueue.items[MediaQueue.index] : null;
  playerRegistry.forEach(inst => {
    const el = inst && inst.el;
    if (!el) return;
    const ov = el.querySelector('.mp-now-playing');
    if (!ov) return;
    const isCurrent = !!(item && MediaQueue.currentKey && inst.mediaKey === MediaQueue.currentKey);
    ov.innerHTML = '';
    if (!isCurrent) { ov.style.display = 'none'; return; }
    ov.appendChild(_buildQueueRowChips(item, MediaQueue.activeChapter));
    ov.style.display = 'flex';
  });
}

// Re-render every open queue panel and sync toggle state/visibility. Called by
// MediaQueue on any mutation (start/advance/jump/remove/move/clear).
function _refreshQueuePanels() {
  // ADR-175: the queue editor is app-level (re-parented to #playlist-bar), so
  // there is no per-player toggle/panel to install here any more. The current
  // player stays queue-free (ADR-162 carve-out); the bar is the single face.
  const show = MediaQueue.active && MediaQueue.panelOpen;
  document.querySelectorAll('.mp-queue').forEach(p => {
    _renderQueuePanel(p);
    p.style.display = show ? 'block' : 'none';
    p.classList.toggle('mp-queue-shown', show);   // hook for the mobile sheet-grow (:has)
    if (show) {
      // ADR-161 §3: open above the bar; flip below only if no room above.
      p.classList.remove('mp-queue-down');
      if (p.getBoundingClientRect().top < 4) p.classList.add('mp-queue-down');
    }
  });
  // ADR-175: the app-level Playlist Bar mirrors every MediaQueue mutation.
  _renderPlaylistBar();
  // ADR-184: keep the video's now-playing overlay truthful.
  _syncNowPlayingOverlays();
  // Keep the current player docked under the (possibly just-changed) playlist
  // UI — expanding the editor must push the player down, never cover its header.
  const _cur = MediaQueue.currentKey ? playerRegistry.get(MediaQueue.currentKey) : null;
  if (_cur && _cur.el && !_cur._isMobileSingleton && _cur.el.style.display !== 'none') {
    if (!_cur.el._detached) _dockPlayer(_cur.el);
    _syncPlayerControls(_cur.el);
  }
  // ADR-176: also sweep detached players clear of the editor after a resize.
  _scheduleReposition();
}

// ── ADR-175: persistent Playlist Bar (app-level chrome) ───────────────────────
// The bar is the Current Playlist's always-on face: a pure *view + control* over
// MediaQueue (Phase 1: play routing is unchanged). The editor is the same
// ADR-162 .mp-queue surface, re-parented to #playlist-bar as .mp-queue-bar so it
// drops DOWN from the bar and is reachable with the player open or closed.
// ADR-188: the bar's transport is a single play/pause toggle plus a dedicated
// stop. `_pbSetPaused` is the shared pause/resume primitive; the toggle handler
// is `_pbPlayPauseCurrent`.
function _pbSetPaused(paused) {
  const inst = _currentPlayerInst();
  if (!inst || !inst.controller) return false;
  const c = inst.controller;
  if (typeof c.isPaused === 'function' && typeof c.play === 'function' && typeof c.pause === 'function') {
    if (paused && !c.isPaused()) c.pause();
    else if (!paused && c.isPaused()) c.play();
    return true;
  }
  if (c.kind === 'plyr' && c.plyr) {
    try {
      if (paused && !c.plyr.paused) c.plyr.pause();
      else if (!paused && c.plyr.paused) c.plyr.play();
    } catch (e) {}
    return true;
  }
  // iframe pseudo-instances are not controllable (ADR-155) — no-op.
  return false;
}

function _pbPlayPauseCurrent() {
  if (!MediaQueue.active || !MediaQueue.items.length) return;
  const inst = _currentPlayerInst();
  if (!inst || !inst.controller) {
    // Stopped: restart the current item through the playlist, then re-render the
    // row/bar so the toggle shows the new sounding state.
    MediaQueue._open(null);
    _refreshQueuePanels();
    return;
  }
  const c = inst.controller;
  let paused = false;
  if (typeof c.isPaused === 'function') paused = !!c.isPaused();
  else if (c.kind === 'plyr' && c.plyr) paused = !!c.plyr.paused;
  _pbSetPaused(!paused);
  _refreshQueuePanels();
}

// ADR-175: Stop tears down the current controller but KEEPS MediaQueue.items,
// so the list survives and any item can be re-played (the Winamp model).
function _pbStopCurrent() {
  const key = MediaQueue.currentKey;
  if (!key) return;
  const inst = playerRegistry.get(key);
  if (inst) {
    if (inst.controller) inst.controller.destroy();
    if (inst._isMobileSingleton) {
      if (_mobilePlayer) {
        _mobilePlayer.el.style.display = 'none';
        _mobilePlayer.controller = null;
      }
    } else if (inst.el) {
      inst.el.remove();
    }
    playerRegistry.delete(key);
  }
  MediaQueue.currentKey = null;   // list survives; nothing plays
  MediaQueue.activeChapter = null;   // ADR-176: no sounding chapter when stopped
  refreshPlayingIndicators();
  _refreshQueuePanels();
}

function _pbExpandPlayer() {
  if (_isMobilePlayer()) {
    const mp = _mobilePlayer;
    if (mp && mp.controller) { mp.el.style.display = ''; _expandMobilePlayer(); }
    return;
  }
  const inst = MediaQueue.currentKey ? playerRegistry.get(MediaQueue.currentKey) : null;
  if (inst && inst.el) {
    if (inst.el.classList.contains('minimized')) _toggleMinimized(inst.el);
    bringToFront(inst);
    _dockPlayer(inst.el);
  }
}

// ── ADR-186: film-strip video toggle ─────────────────────────────────────────
// The video's own minimize button hides the docked window entirely, leaving no
// way back. This toggle is the always-reachable affordance: it lives in the
// current playlist row and the Playlist Bar next to the play/copy/share/watch
// operators. Pressed (`aria-pressed="true"`) means the video is shown.
function _currentPlayerInst() {
  const key = MediaQueue.currentKey;
  return key ? playerRegistry.get(key) : null;
}

function _videoVisible() {
  const inst = _currentPlayerInst();
  if (!inst || !inst.el) return false;
  return inst.el.style.display !== 'none';
}

function _isCurrentPlaying() {
  const inst = _currentPlayerInst();
  if (!inst || !inst.controller) return false;
  const c = inst.controller;
  if (typeof c.isPaused === 'function') return !c.isPaused();
  if (c.kind === 'plyr' && c.plyr) return !c.plyr.paused;
  return false;
}

function _toggleVideoVisibility() {
  const inst = _currentPlayerInst();
  if (!inst || !inst.el) return;
  if (inst._isMobileSingleton) {
    if (inst.el.style.display === 'none') _pbExpandPlayer();
    else _collapseMobilePlayer(false);
  } else {
    _toggleMinimized(inst.el);
  }
  _refreshQueuePanels();
}

// ADR-175: the current item's copy/share/watch actions now live on the Playlist
// Bar, since the content player is bare.
function _pbCurrentItem() { return MediaQueue.active ? MediaQueue.items[MediaQueue.index] : null; }
function _pbCurrentTarget() {
  const key = MediaQueue.currentKey;
  const inst = key ? playerRegistry.get(key) : null;
  if (inst) return inst;
  const item = _pbCurrentItem();
  if (!item) return null;
  return { media: item.media, mediaKey: mediaKey(item.media),
           currentOffset: item.startSeconds || 0, meta: item.meta || {} };
}
// ADR-175: the single volume primitive. Sets the current player's output level,
// persists it for future queue items, and mirrors every slider (bar + current
// row) so the two faces never disagree. Unsupported (iframe) players disable the
// sliders rather than silently no-op.
function _setPlayerVolume(v) {
  const vol = Math.max(0, Math.min(1, Number(v)));
  if (!isFinite(vol)) return;
  _volumeLevel = vol;
  const t = _pbCurrentTarget();
  if (t && t.controller && typeof t.controller.setVolume === 'function') {
    t.controller.setVolume(vol);
  }
  _syncVolumeControls();
}

// Reflect the current level on every volume slider and disable them when the
// current controller exposes no volume API. Safe to call after any render.
function _syncVolumeControls() {
  const t = _pbCurrentTarget();
  const ctrl = t && t.controller;
  const supported = !!(ctrl && typeof ctrl.getVolume === 'function' && ctrl.getVolume() != null);
  const level = supported ? ctrl.getVolume() : _volumeLevel;
  const pct = Math.round(Math.max(0, Math.min(1, level)) * 100) + '';
  document.querySelectorAll('#pb-volume, .mp-queue-vol').forEach(sl => {
    sl.value = pct;
    sl.disabled = !supported;
  });
}

function _pbCopyLink() {
  const t = _pbCurrentTarget();
  if (!t) return;
  const url = shareUrl(t.media, t.currentOffset || 0);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => showCopyLinkToast());
  }
}
async function _pbShareLink() {
  const t = _pbCurrentTarget();
  if (!t) return;
  const res = await encodePermalink(t);
  if (!res || !res.fragment) return;
  window.location.hash = res.fragment;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(window.location.href).then(() => {
      showCopyLinkToast(res.notice ? 'Permalink copied! (' + res.notice + ')' : 'Permalink copied!');
    });
  }
}
function _pbWatchOnYouTube() {
  const item = _pbCurrentItem();
  if (!item) return;
  window.open(shareUrl(item.media, 0), '_blank', 'noopener');
}

// ── ADR-184: per-row operator variants ──────────────────────────────────────
// Every playlist row is shareable, not just the current one. These act on an
// arbitrary queue item (the row's own track) instead of the live current item.
function _copyMediaLink(item) {
  if (!item || !item.media) return;
  const url = shareUrl(item.media, item.startSeconds || 0);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => showCopyLinkToast());
  }
}
async function _copyMediaPermalink(item) {
  if (!item || !item.media) return;
  const target = {
    media: item.media,
    mediaKey: mediaKey(item.media),
    currentOffset: item.startSeconds || 0,
    meta: item.meta || {},
  };
  const res = await encodePermalink(target);
  if (!res || !res.fragment) return;
  window.location.hash = res.fragment;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(window.location.href).then(() => {
      showCopyLinkToast(res.notice ? 'Permalink copied! (' + res.notice + ')' : 'Permalink copied!');
    });
  }
}
function _openMediaOnYouTube(item) {
  if (!item || !item.media) return;
  window.open(shareUrl(item.media, 0), '_blank', 'noopener');
}

function _renderPlaylistBar() {
  const bar = document.getElementById('playlist-bar');
  if (!bar) return;
  const has = MediaQueue.active && MediaQueue.items.length > 0;
  bar.classList.toggle('pb-empty', !has);

  const summary = bar.querySelector('#pb-summary');
  const count = bar.querySelector('#pb-count');
  const prev = bar.querySelector('#pb-prev');
  const next = bar.querySelector('#pb-next');
  const stop = bar.querySelector('#pb-stop');
  const play = bar.querySelector('#pb-play');
  const editorBtn = bar.querySelector('#pb-editor-toggle');
  const copyBtn = bar.querySelector('#pb-copy');
  const shareBtn = bar.querySelector('#pb-share');
  const watchBtn = bar.querySelector('#pb-watch');
  const videoBtn = bar.querySelector('#pb-video-toggle');
  const volume = bar.querySelector('#pb-volume');

  if (summary) {
    summary.innerHTML = '';
    const item = has ? MediaQueue.items[MediaQueue.index] : null;
    if (item) summary.appendChild(_buildQueueRowChips(item, MediaQueue.activeChapter));
    else {
      const hint = document.createElement('span');
      hint.className = 'pb-empty-hint';
      hint.textContent = 'Playlist empty';
      summary.appendChild(hint);
    }
  }
  if (count) count.textContent = has ? (MediaQueue.index + 1) + ' / ' + MediaQueue.items.length : '';
  if (prev) prev.disabled = !has || MediaQueue.index <= 0;
  if (next) next.disabled = !has || MediaQueue.index >= MediaQueue.items.length - 1;
  if (stop) stop.disabled = !has || !MediaQueue.currentKey;
  if (copyBtn) copyBtn.disabled = !has;
  if (shareBtn) shareBtn.disabled = !has;
  if (watchBtn) watchBtn.disabled = !has;
  if (videoBtn) {
    videoBtn.disabled = !has || !_currentPlayerInst();
    const shown = _videoVisible();
    videoBtn.title = shown ? 'Hide video' : 'Show video';
    videoBtn.setAttribute('aria-label', videoBtn.title);
    videoBtn.setAttribute('aria-pressed', shown ? 'true' : 'false');
  }
  // ADR-175 parent-inherits rule: while the editor is open the current ROW owns
  // the operator set; the bar shows it only when the row is not visible.
  const editorOpen = has && MediaQueue.panelOpen;
  const showOps = has && !editorOpen;
  [play, stop, copyBtn, shareBtn, watchBtn, videoBtn, volume].forEach(el => {
    if (el) el.style.display = showOps ? '' : 'none';
  });
  _syncVolumeControls();
  if (editorBtn) {
    editorBtn.disabled = !has;
    editorBtn.setAttribute('aria-pressed', editorOpen ? 'true' : 'false');
    editorBtn.textContent = editorOpen ? '\u25bc' : '\u25b6';   // same chevron as panels
  }
  if (play) {
    // ADR-188: play is a play/pause toggle — ❚❚ while the current item sounds,
    // ▶ otherwise. Pressing it flips to the other glyph.
    const playing = _isCurrentPlaying();
    play.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';   // ❚❚ / ▶
    play.setAttribute('aria-pressed', playing ? 'true' : 'false');
    play.title = playing ? 'Pause' : 'Play / resume';
    play.setAttribute('aria-label', play.title);
    play.disabled = !has;
  }
  _clampPlaylistEditorHeight();
  // ADR-185: the bar's own visibility drives the view's top wall (the editor
  // ResizeObserver only fires when the editor box changes, not when the bar
  // appears/disappears), so publish the inset and re-fit here too.
  _syncViewTopInset();
  if (typeof window.refitViewWindow === 'function') window.refitViewWindow();
}

function _initPlaylistBar() {
  const bar = document.getElementById('playlist-bar');
  if (!bar || bar.dataset.pbReady) return;
  bar.dataset.pbReady = '1';
  const prev = bar.querySelector('#pb-prev');
  const next = bar.querySelector('#pb-next');
  const stop = bar.querySelector('#pb-stop');
  const play = bar.querySelector('#pb-play');
  const editorBtn = bar.querySelector('#pb-editor-toggle');
  const copyBtn = bar.querySelector('#pb-copy');
  const shareBtn = bar.querySelector('#pb-share');
  const watchBtn = bar.querySelector('#pb-watch');
  const videoBtn = bar.querySelector('#pb-video-toggle');
  const volume = bar.querySelector('#pb-volume');
  if (prev) prev.addEventListener('click', () => MediaQueue.previous());
  if (next) next.addEventListener('click', () => MediaQueue.next());
  if (stop) stop.addEventListener('click', _pbStopCurrent);
  if (play) play.addEventListener('click', _pbPlayPauseCurrent);
  if (copyBtn) copyBtn.addEventListener('click', _pbCopyLink);
  if (shareBtn) shareBtn.addEventListener('click', _pbShareLink);
  if (watchBtn) watchBtn.addEventListener('click', _pbWatchOnYouTube);
  if (videoBtn) videoBtn.addEventListener('click', _toggleVideoVisibility);
  if (volume) volume.addEventListener('input', () => _setPlayerVolume(volume.value / 100));
  if (editorBtn) editorBtn.addEventListener('click', () => {
    MediaQueue.setPanelOpen(!MediaQueue.panelOpen);
    _refreshQueuePanels();
  });
  // The ADR-162 editor, re-parented to the bar (drops downward).
  const editor = buildQueuePanel();
  editor.classList.add('mp-queue-bar');
  bar.appendChild(editor);
  // ADR-176: as the editor deepens its bottom is the view's top wall — track
  // the editor's box and re-fit the centre view whenever it changes.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (typeof window.refitViewWindow === 'function') window.refitViewWindow();
      else _syncViewTopInset();
    }).observe(editor);
  }
  // Full refresh so a permalink-restored queue (which may have run before this
  // init) is rendered into the bar + editor.
  _refreshQueuePanels();
  _syncViewTopInset();
}
window._initPlaylistBar = _initPlaylistBar;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initPlaylistBar);
else _initPlaylistBar();

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
    // ADR-159: lecturer + subject cross-links ride in the header rail (and its
    // ▾N overflow) — pass subjects in meta instead of building a below-video footer.
    openOrFocusPlayer(ref.video_id, ref.label || 'Lecture-Demo', ref.lecturer_label || '', undefined, ref.label || 'Lecture-Demo', segmentsToTracks(ref.segments || []), { nodeId: ref.lecturer_id || null, subjects: ref.subjects || null });
  });
  return chip;
}

// ── _buildSubjectChips — cross-link chips for a recording's subjects (ADR-079/159) ──
// subjects: { raga_ids[], composition_ids[], musician_ids[] }. Returns an array of
// navigable chips (raga → .raga-chip, comp → .comp-chip, musician → .musician-chip),
// consumed by buildPlayerRail so lecdem subjects populate the header rail (and its
// ▾N overflow) rather than a separate below-video footer. Returns [] when empty.
function _buildSubjectChips(subjects) {
  if (!subjects) return [];
  const ragaIds     = Array.isArray(subjects.raga_ids)        ? subjects.raga_ids        : [];
  const compIds     = Array.isArray(subjects.composition_ids) ? subjects.composition_ids : [];
  const musicianIds = Array.isArray(subjects.musician_ids)    ? subjects.musician_ids    : [];
  const allChips = [];

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
    // ADR-172: instrument glyph on the lecdem-subject chip.
    const _sInstr = (node && node.data) ? (node.data('instrument') || null) : null;
    if (_sInstr && typeof makeInstrBadge === 'function') {
      mchip.insertBefore(makeInstrBadge(_sInstr, 13, { composer: !!node.data('is_composer') }), mchip.firstChild);
    }
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

  return allChips;
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
  concert.sessions.forEach(session => {
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
  // ADR-180: no fold chevron — the track list is always shown below.
  const header = document.createElement('div');
  header.className = 'concert-header';

  const headerBody = document.createElement('div');
  headerBody.className = 'concert-header-body';

  const titleRow = document.createElement('div');
  titleRow.className = 'concert-title-row';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'concert-title recording-chip';
  titleSpan.textContent = concert.short_title || concert.title;
  if (concert.title) titleSpan.title = concert.title;
  // 'panel-title' role enables the chip_dblclick.js dblclick-to-edit gesture.
  // ADR-180: the header is no longer a fold toggle, so a single click is inert.
  if (concert.recording_id && typeof applyChipRole === 'function') {
    applyChipRole(titleSpan, 'panel-title', 'recording', concert.recording_id);
    titleSpan.dataset.musicianId = nodeId;  // passed to buildEditConcertForm via openEditForm
  }

  const dateSpan = document.createElement('span');
  dateSpan.className = 'concert-date';
  dateSpan.textContent = concert.date || '';

  titleRow.appendChild(titleSpan);
  titleRow.appendChild(dateSpan);

  // ADR-180: title + date own the row's h-scroll; count + acts stay pinned.
  const titleMain = document.createElement('div');
  titleMain.className = 'concert-title-main';
  while (titleRow.firstChild) titleMain.appendChild(titleRow.firstChild);
  titleRow.appendChild(titleMain);

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
      if (instrKey) chip.appendChild(makeInstrBadge(instrKey, 11,
                                                   { composer: !!_pfNode.data('is_composer') }));
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

  // ▶ play-from-beginning + whole-concert enqueue. Both read the same ordered
  // track list, so the two can never disagree (ADR-181).
  const _firstPerfVid = (() => {
    for (const sess of concert.sessions) {
      const sorted = sess.perfs.slice().sort((a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0));
      if (sorted.length) return sorted[0].video_id;
    }
    return null;
  })();
  const _concertHeaderTracks = [];
  concert.sessions.forEach(sess => {
    sess.perfs.slice()
      .sort((a, b) => (a.offset_seconds || 0) - (b.offset_seconds || 0))
      .forEach(sp => {
        const spRagaObj = sp.raga_id ? ragas.find(r => r.id === sp.raga_id) : null;
        _concertHeaderTracks.push({
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
  _concertHeaderTracks.sort((a, b) => a.offset_seconds - b.offset_seconds);
  const hdrActs = document.createElement('span');
  hdrActs.className = 'trail-acts';
  if (_firstPerfVid) {
    const concertPlayBtn = document.createElement('button');
    concertPlayBtn.className = 'rec-play-btn play-btn-direct';
    concertPlayBtn.title = 'Play from beginning: ' + (concert.short_title || concert.title || 'Concert');
    concertPlayBtn.textContent = '\u25B6';
    concertPlayBtn.addEventListener('click', e => {
      e.stopPropagation();
      openOrFocusPlayer(_firstPerfVid, concert.short_title || concert.title, artistLabel, 0, concert.short_title || concert.title, _concertHeaderTracks, { nodeId });
    });
    hdrActs.appendChild(concertPlayBtn);
    // ADR-181: the whole concert is enqueueable from its header.
    hdrActs.appendChild(_buildPlusBtn(() => ({
      media: _firstPerfVid, startSeconds: 0,
      label: concert.short_title || concert.title || '', artistName: artistLabel,
      concertTitle: concert.short_title || concert.title || '',
      tracks: _concertHeaderTracks,
      meta: { nodeId, recId: concert.recording_id || null },
    })));
  }

  titleRow.appendChild(hdrActs);
  headerBody.appendChild(titleRow);
  // ADR-180: co-performers ride the same ribbon line as the title, not below it.
  if (coPerformerMap.size > 0) titleMain.appendChild(performersDiv);

  header.appendChild(headerBody);
  bracket.appendChild(header);

  // ── composition list ──────────────────────────────────────────────────────
  const perfList = document.createElement('ul');
  perfList.className = 'concert-perf-list';
  // ADR-165 §3: collapsed-by-default is a CSS concern of .concert-perf-list;
  // no inline display (the filter channel) so the harvest can see folded rows.

  // Pre-compute flat sorted track list so thunks can derive end_seconds for ADR-163 §5.
  const _concertAllTracks = [];
  concert.sessions.forEach(sess => {
    sess.perfs.forEach(sp => { _concertAllTracks.push({ offset_seconds: sp.offset_seconds || 0 }); });
  });
  _concertAllTracks.sort((a, b) => a.offset_seconds - b.offset_seconds);
  // ADR-176 follow-up: the chapter list every queued row from this bracket
  // carries, so a last-in-playlist item can keep the row/bar truthful while the
  // video runs past its own start into a later concert track.
  const _concertPlayerTracks = _buildConcertTracksFor(concert.recording_id, nodeId);

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
      // ADR-180: the raga + composition identity chips share one scroll surface;
      // the acts column is appended to the li afterwards and stays pinned.
      const perfMain = document.createElement('div');
      perfMain.className = 'concert-perf-main';

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
        perfMain.appendChild(ragaChip);
      } else if (!p.raga_id && p.raga_id !== undefined) {
        // no raga — nothing to show at top
      }

      // ── Composition chip + play button (ADR-180 ribbon) ──────────────────
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
        perfMain.appendChild(compChip);
      } else {
        const titleEl = document.createElement('span');
        titleEl.className = 'yt-label-chip';
        const typeIcon = { interview: '🎤 ', lecture: '🎓 ', radio: '📻 ' }[p.type] || '';
        titleEl.textContent = typeIcon + (p.display_title || '');
        perfMain.appendChild(titleEl);
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
      // ADR-163 §3: + affordance on concert bracket performance rows
      // ADR-165: same thunk feeds the + menu and the harvest.
      const _concertPerfThunk = (() => {
        const _p = p;
        const _nextTrack = _concertAllTracks.find(t => t.offset_seconds > (_p.offset_seconds || 0));
        const _endSec = _nextTrack ? _nextTrack.offset_seconds : null;
        return () => ({
          media: _p.video_id, startSeconds: _p.offset_seconds || 0,
          label: _p.display_title || '', artistName: artistLabel,
          tracks: _concertPlayerTracks,
          meta: { ragaId: _p.raga_id || null, compositionId: _p.composition_id || null, nodeId, end_seconds: _endSec },
        });
      })();
      actsDiv.appendChild(_buildPlusBtn(_concertPerfThunk));
      registerQueueItem(li, _concertPerfThunk);

      // ── ADR-180 ribbon: [raga + comp + composer] … [acts] ────────────────
      const concertComposerChip = buildComposerChip(p.composition_id);
      if (concertComposerChip) perfMain.appendChild(concertComposerChip);
      li.appendChild(perfMain);
      li.appendChild(actsDiv);
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

  // ADR-180: the composer is inlined on the composition's single ribbon line
  // (it used to stack below in .tree-comp-meta, making the row two lines tall).
  const composerChip = buildComposerChip(compId);
  if (composerChip) compHeader.appendChild(composerChip);

  // ADR-180: the identity chips own the row's horizontal scroll; the acts
  // column is appended to compHeader afterwards and stays pinned right.
  const compMain = document.createElement('div');
  compMain.className = 'tree-comp-main';
  while (compHeader.firstChild) compMain.appendChild(compHeader.firstChild);
  compHeader.appendChild(compMain);

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
    // ADR-163 §3: + affordance on single-recording standalone rows
    // ADR-165: same thunk feeds the + menu and the harvest.
    const _singleRecThunk = (() => {
      const _p = p;
      const _tracks = _p.recording_id ? _buildConcertTracksFor(_p.recording_id, nodeId) : [];
      const _next = _tracks.find(t => t.offset_seconds > (_p.offset_seconds || 0));
      const _endSec = _next ? _next.offset_seconds : null;
      return () => ({
        media: _p.video_id, startSeconds: _p.offset_seconds || 0,
        label: _p.display_title || '', artistName: artistLabel,
        tracks: _tracks,
        meta: { ragaId: _p.raga_id || null, compositionId: _p.composition_id || null, nodeId, end_seconds: _endSec },
      });
    })();
    actsDiv.appendChild(_buildPlusBtn(_singleRecThunk));
    registerQueueItem(li, _singleRecThunk);
    compHeader.appendChild(actsDiv);
  } else {
    // ── Multiple recordings: ADR-180 — no fold; versions render inline-below ──
    const actsDiv = document.createElement('div');
    actsDiv.className = 'tree-comp-acts';
    compHeader.appendChild(actsDiv);

    li.appendChild(compHeader);

    // Recording rows — always visible (the fold chevron is retired).
    const recUl = document.createElement('ul');
    recUl.className = 'tree-rec-list';

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
      // ADR-163 §3: + affordance on multi-recording version rows
      // ADR-165: same thunk feeds the + menu and the harvest.
      const _multiRecThunk = (() => {
        const _p = p;
        const _tracks = _p.recording_id ? _buildConcertTracksFor(_p.recording_id, nodeId) : [];
        const _next = _tracks.find(t => t.offset_seconds > (_p.offset_seconds || 0));
        const _endSec = _next ? _next.offset_seconds : null;
        return () => ({
          media: _p.video_id, startSeconds: _p.offset_seconds || 0,
          label: _p.display_title || '', artistName: artistLabel,
          tracks: _tracks,
          meta: { ragaId: _p.raga_id || null, compositionId: _p.composition_id || null, nodeId, end_seconds: _endSec },
        });
      })();
      rowActsDiv.appendChild(_buildPlusBtn(_multiRecThunk));
      registerQueueItem(recLi, _multiRecThunk);
      row.appendChild(rowActsDiv);

      recLi.appendChild(row);

      // Dblclick to edit this recording version
      if (p.video_id) {
        if (typeof markEditable === 'function') markEditable(recLi);
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

    return li;
  }

  li.appendChild(compHeader);
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
  // ADR-181: misc recordings carry the same enqueue `+` as every other row.
  const _miscThunk = (() => {
    const _p = p;
    const _tracks = _p.recording_id ? _buildConcertTracksFor(_p.recording_id, nodeId) : [];
    const _next = _tracks.find(t => t.offset_seconds > (_p.offset_seconds || 0));
    const _endSec = _next ? _next.offset_seconds : null;
    return () => ({
      media: _p.video_id, startSeconds: _p.offset_seconds || 0,
      label: _p.display_title || _p.short_title || _p.title || '', artistName: artistLabel,
      tracks: _tracks,
      meta: { ragaId: null, compositionId: _p.composition_id || null, nodeId, end_seconds: _endSec },
    });
  })();
  actsDiv.appendChild(_buildPlusBtn(_miscThunk));
  registerQueueItem(li, _miscThunk);
  row.appendChild(actsDiv);

  li.appendChild(row);

  // ── Dblclick to edit this YouTube recording ────────────────────────────────
  if (p.video_id) {
    if (typeof markEditable === 'function') markEditable(li);
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
      if (typeof markEditable === 'function') markEditable(labelSpan);
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
    const chips = document.createElement('div');
    chips.className = 'trail-chips';
    chips.appendChild(labelSpan);
    row.appendChild(chips);

    const actsDiv = document.createElement('div');
    actsDiv.className = 'trail-acts';

    const playBtn = document.createElement('button');
    playBtn.className = 'rec-play-btn play-btn-direct';
    playBtn.setAttribute('data-vid', ref.media_key);
    playBtn.title = ref.label || 'Play';
    playBtn.textContent = '\u25B6';
    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      // ADR-159: subjects ride in the header rail (+ ▾N overflow), not a footer.
      openOrFocusPlayer(ref.video_id, ref.label || 'Lecture-Demo', artistLabel, undefined, ref.label || 'Lecture-Demo', segmentsToTracks(ref.segments || []), { nodeId, subjects: ref.subjects || null });
    });
    actsDiv.appendChild(playBtn);
    // ADR-181: a flat lecdem is enqueueable as a whole.
    actsDiv.appendChild(_buildPlusBtn(() => ({
      media: ref.media || ref.media_key || ref.video_id, startSeconds: 0,
      label: ref.label || 'Lecture-Demo', artistName: artistLabel || '',
      concertTitle: ref.label || 'Lecture-Demo',
      tracks: segmentsToTracks(ref.segments || []),
      meta: { nodeId: nodeId || null, subjects: ref.subjects || null },
    })));

    row.appendChild(actsDiv);
    return row;
  }

  // ── bracket (has segments) ──────────────────────────────────────────────────
  // Build allTracks for the in-player selector (ADR-156: shared helper)
  const allTracks = segmentsToTracks(segments);

  const bracket = document.createElement('div');
  bracket.className = 'concert-bracket';

  // ── header ──────────────────────────────────────────────────────────────────
  // ADR-180: no fold chevron — the segment list is always shown below.
  const header = document.createElement('div');
  header.className = 'concert-header';

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
    if (typeof markEditable === 'function') markEditable(titleSpan);
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

  // ▶ play-from-beginning button — opens the lecdem video at 00:00:00
  const lecdemPlayBtn = document.createElement('button');
  lecdemPlayBtn.className = 'rec-play-btn play-btn-direct';
  lecdemPlayBtn.title = 'Play from beginning: ' + (ref.label || 'Lecture-Demo');
  lecdemPlayBtn.textContent = '\u25B6';
  lecdemPlayBtn.addEventListener('click', e => {
    e.stopPropagation();
    openOrFocusPlayer(ref.video_id, ref.label || 'Lecture-Demo', artistLabel, 0, ref.label || 'Lecture-Demo', allTracks, { nodeId });
  });
  const lecdemActs = document.createElement('span');
  lecdemActs.className = 'trail-acts';
  lecdemActs.appendChild(lecdemPlayBtn);
  // ADR-181: the whole lecture-demo is enqueueable from its header.
  lecdemActs.appendChild(_buildPlusBtn(() => ({
    media: ref.media || ref.media_key || ref.video_id, startSeconds: 0,
    label: ref.label || 'Lecture-Demo', artistName: artistLabel || '',
    concertTitle: ref.label || 'Lecture-Demo',
    tracks: allTracks,
    meta: { nodeId, subjects: ref.subjects || null },
  })));
  titleRow.appendChild(lecdemActs);

  headerBody.appendChild(titleRow);

  header.appendChild(headerBody);
  bracket.appendChild(header);

  // ── segment list ─────────────────────────────────────────────────────────────
  const segList = document.createElement('ul');
  segList.className = 'concert-perf-list';
  // ADR-165 §3: collapsed-by-default via CSS, not inline display (filter channel).

  segments.forEach(seg => {
    const li = document.createElement('li');
    li.className = 'concert-perf-item';
    li.dataset.vid = ref.media_key;

    // ADR-180: identity chips own the row's h-scroll; segActs is a pinned sibling.
    const segMain = document.createElement('div');
    segMain.className = 'concert-perf-main';

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
      segMain.appendChild(ragaChip);
    } else if (seg.raga_id) {
      const ragaChip = document.createElement('span');
      ragaChip.className = 'raga-chip';
      ragaChip.textContent = seg.raga_id;
      segMain.appendChild(ragaChip);
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
      segMain.appendChild(compChip);
    }

    const playBtn = document.createElement('button');
    playBtn.className = 'rec-play-btn play-btn-concert';
    playBtn.title = 'Play from ' + (seg.timestamp || '00:00');
    playBtn.textContent = '▶';
    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      // ADR-159: aggregate every segment's subjects + top-level ref.subjects and
      // pass them in meta so they populate the header rail (and its ▾N overflow).
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
      openOrFocusPlayer(ref.video_id, segLabel, artistLabel, seg.offset_seconds, ref.label, allTracks, { nodeId, subjects: mergedSubjects });
    });
    const segActs = document.createElement('span');
    segActs.className = 'trail-acts';
    segActs.appendChild(playBtn);
    // ADR-181: every lecdem segment is individually enqueueable.
    const _segNext = allTracks.find(t => t.offset_seconds > (seg.offset_seconds || 0));
    segActs.appendChild(_buildPlusBtn(() => ({
      media: ref.media || ref.media_key || ref.video_id, startSeconds: seg.offset_seconds || 0,
      label: segLabel, artistName: artistLabel || '',
      concertTitle: ref.label || 'Lecture-Demo',
      tracks: allTracks,
      meta: { nodeId, subjects: ref.subjects || null, end_seconds: _segNext ? _segNext.offset_seconds : null },
    })));

    li.appendChild(segMain);
    li.appendChild(segActs);

    segList.appendChild(li);
  });

  bracket.appendChild(segList);
  return bracket;
}

// ── ADR-163: PLAYLISTS section helpers (shared by all panels) ────────────────
// A saved playlist appears in the PLAYLISTS section of every panel whose subject
// it touches (musician / raga / composition), resolved from the render-time
// back-index. A row plays the whole playlist into the ADR-162 queue.
function _playlistToQueueItems(pl) {
  return (pl.items || []).map(it => {
    const media = (typeof resolveMedia === 'function') ? resolveMedia(it.media_key) : null;
    if (!media) return null;
    return {
      media,
      label:        it.note || it.composition_id || pl.title || '',
      artistName:   '',
      startSeconds: it.start_seconds || 0,
      concertTitle: pl.title || '',
      tracks:       [],
      meta: {
        nodeId:        (it.musician_ids && it.musician_ids[0]) || null,
        ragaId:        it.raga_id || null,
        compositionId: it.composition_id || null,
        recId:         it.recording_id || null,
        end_seconds:   it.end_seconds || null,   // ADR-163 slice 3: cross-recording advance
      },
    };
  }).filter(Boolean);
}

function buildPlaylistRow(pl) {
  const items = pl.items || [];
  const queueItems = _playlistToQueueItems(pl);

  // Header: name chip (hugs its text) + track count. The header wrapper stretches
  // (row-accordion gives it flex:1), so the play button pins to the right.
  const headerEl = document.createElement('div');
  headerEl.className = 'mp-playlist-hdr';
  const chip = document.createElement('span');
  chip.className = 'playlist-chip';
  chip.textContent = pl.title || pl.id;
  chip.title = pl.description || pl.title || pl.id;
  headerEl.appendChild(chip);
  const count = document.createElement('span');
  count.className = 'mp-playlist-count';
  count.textContent = String(items.length);
  count.title = items.length + ' track' + (items.length === 1 ? '' : 's');
  headerEl.appendChild(count);

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'rec-play-btn play-btn-direct';
  play.title = 'Play "' + (pl.title || pl.id) + '"';
  play.textContent = '▶';
  play.addEventListener('click', e => {
    e.stopPropagation();
    // ADR-164: tag the queue with its source playlist so Share encodes the
    // compact reference form (`q.pl`) rather than inlining every item.
    if (queueItems.length && typeof startMediaQueue === 'function') startMediaQueue(queueItems, 0, { playlistId: pl.id });
  });
  // Wrap in .trail-acts — the row-accordion header gives non-chevron children
  // flex:1, which would stretch a bare play button into an ellipse; .trail-acts
  // is exempted (flex:none), keeping it a circle (same pattern as concert rows).
  const playActs = document.createElement('span');
  playActs.className = 'trail-acts';
  playActs.appendChild(play);
  // ADR-181: the whole playlist is enqueueable, not just its tracks.
  const enq = document.createElement('button');
  enq.type = 'button';
  enq.className = 'mp-plus-btn';
  enq.title = 'Add playlist to queue';
  enq.setAttribute('aria-label', 'Add playlist to queue');
  enq.textContent = '+';
  enq.addEventListener('click', e => {
    e.stopPropagation();
    if (queueItems.length && typeof MediaQueue !== 'undefined' && MediaQueue.addItems) {
      MediaQueue.addItems(queueItems);
    }
  });
  playActs.appendChild(enq);

  // Children: one tree-leaf per track — chips + play-from-here (queue at index i).
  const bodyEls = items.map((it, i) => {
    const trow = document.createElement('div');
    trow.className = 'mp-playlist-track';
    // Chips live in their own flex-wrap container: a single line by default that
    // grows downward to as many lines as the tags need, while the ▶ stays pinned.
    const chipsWrap = document.createElement('span');
    chipsWrap.className = 'mp-playlist-track-chips';
    const perf = _buildMusicianChipForFooter((it.musician_ids && it.musician_ids[0]) || null, null);
    if (perf) chipsWrap.appendChild(perf);
    if (typeof _buildSubjectChips === 'function') {
      _buildSubjectChips({
        raga_ids:        it.raga_id ? [it.raga_id] : [],
        composition_ids: it.composition_id ? [it.composition_id] : [],
        musician_ids:    [],
      }).forEach(c => chipsWrap.appendChild(c));
    }
    if (!it.composition_id && it.note) {
      const lbl = document.createElement('span');
      lbl.className = 'yt-label-chip';
      lbl.textContent = it.note;
      chipsWrap.appendChild(lbl);
    }
    trow.appendChild(chipsWrap);
    const tplay = document.createElement('button');
    tplay.type = 'button';
    tplay.className = 'rec-play-btn play-btn-concert';
    tplay.title = 'Play from here';
    tplay.textContent = '▶';
    tplay.addEventListener('click', e => {
      e.stopPropagation();
      if (queueItems.length && typeof startMediaQueue === 'function') startMediaQueue(queueItems, i, { playlistId: pl.id });
    });
    // ADR-163 §3: + affordance on each playlist track row
    // ADR-165: same thunk feeds the + menu and the harvest.
    const itCopy = it;
    const qiCopy = queueItems[i];
    const _trackThunk = () => ({
      media: qiCopy && qiCopy.media,
      startSeconds: itCopy.start_seconds || 0,
      meta: {
        ragaId: itCopy.raga_id || null, compositionId: itCopy.composition_id || null,
        nodeId: (itCopy.musician_ids && itCopy.musician_ids[0]) || null,
        end_seconds: itCopy.end_seconds || null,
      },
      label: itCopy.note || itCopy.composition_id || '',
    });
    const tplus = _buildPlusBtn(_trackThunk);
    registerQueueItem(trow, _trackThunk);
    const tacts = document.createElement('span');
    tacts.className = 'trail-acts';
    tacts.appendChild(tplay);
    tacts.appendChild(tplus);
    trow.appendChild(tacts);
    return trow;
  });

  // ADR-180: the playlist header is one ribbon; every track is its own ribbon
  // below it (no fold). ADR-165: register the playlist row with an array thunk so
  // harvest on a PLAYLISTS section body returns the concatenation of its items.
  const wrap = document.createElement('div');
  wrap.className = 'row-accordion mp-playlist-row';
  const headerRow = document.createElement('div');
  headerRow.className = 'row-accordion-header';
  const hscroll = document.createElement('div');
  hscroll.className = 'row-accordion-scroll';
  hscroll.appendChild(headerEl);
  headerRow.appendChild(hscroll);
  headerRow.appendChild(playActs);
  wrap.appendChild(headerRow);
  bodyEls.forEach(function (t) { wrap.appendChild(t); });
  registerQueueItem(wrap, () => queueItems);
  return wrap;
}

// Returns a PLAYLISTS buildSection for the given playlist ids, or null if none.
function buildPlaylistsSection(playlistIds) {
  if (!Array.isArray(playlistIds) || !playlistIds.length) return null;
  if (typeof playlists === 'undefined' || typeof buildSection !== 'function') return null;
  const pls = playlistIds.map(id => playlists.find(p => p.id === id)).filter(Boolean);
  if (!pls.length) return null;
  const chip = document.createElement('span');
  // Match every other section header (CONCERTS / RECORDINGS / LECDEMS): the
  // chip-section-hdr scale (0.85rem), not the smaller bare neutral-chip.
  chip.className = 'neutral-chip chip-section-hdr';
  chip.textContent = 'PLAYLISTS';
  const { sectionEl, bodyEl } = buildSection({ headerChip: chip, count: pls.length, defaultCollapsed: false, playable: true });
  sectionEl.dataset.section = 'playlists';
  pls.forEach(pl => bodyEl.appendChild(buildPlaylistRow(pl)));
  return sectionEl;
}

// ── buildRecordingsList — concert-bracketed + legacy flat (ADR-018) ───────────
function buildRecordingsList(nodeId, nodeData) {
  const recPanel  = document.getElementById('recordings-panel');
  const recList   = document.getElementById('recordings-list');
  const recFilterRow = document.getElementById('rec-filter-row');
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
      playable: true,
      helpKind: 'lecdems',
      helpSlot: 'musician',
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
          // Flat row: inline subject chips into the single ribbon line.
          const flatChips = bracketEl.querySelector('.trail-chips');
          if (flatChips) (subjectChips || []).forEach(function (el) { flatChips.appendChild(el); });
          li.appendChild(bracketEl);
        }
        // ADR-165: register whole-lecdem item; harvest picks it up per filter visibility.
        // Key on the resolved media (ADR-154), not the YouTube-only video_id — non-YouTube
        // lecdems carry an empty video_id and would otherwise be dropped from the harvest.
        if (ref.media || ref.media_key) registerQueueItem(li, (() => { const _r = ref; return () => ({
          media: _r.media || _r.media_key, startSeconds: 0,
          label: _r.label || 'Lecture-Demo', artistName: artistLabel,
          meta: { nodeId },
        }); })());
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
          // Flat row: inline lecturer + subject chips into the single ribbon line.
          const flatChips = bracketEl.querySelector('.trail-chips');
          if (flatChips) bodyEls.forEach(function (el) { flatChips.appendChild(el); });
          li.appendChild(bracketEl);
        }
        // ADR-165: register whole-lecdem item; harvest picks it up per filter visibility.
        // Key on the resolved media (ADR-154), not the YouTube-only video_id.
        if (ref.media || ref.media_key) registerQueueItem(li, (() => { const _r = ref; return () => ({
          media: _r.media || _r.media_key, startSeconds: 0,
          label: _r.label || 'Lecture-Demo',
          artistName: _r.lecturer_label || artistLabel,
          meta: { nodeId: _r.lecturer_id || nodeId },
        }); })());
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
    playable: true,
    helpKind: 'concerts',
    helpSlot: 'musician',
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
    playable: true,
    helpKind: 'recordings',
    helpSlot: 'musician',
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
      helpKind: 'compositions_empty',
      helpSlot: 'musician',
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
        countBadge.textContent = String(compsInRaga.length);
        countBadge.title = compsInRaga.length + (compsInRaga.length === 1 ? ' composition' : ' compositions');
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

  // ── ADR-163: PLAYLISTS section (playlists this musician appears in) ──────────
  // Promoted to the TOP — a playlist is the user's own re-organisation of the
  // music, the highest abstraction in the panel. unshift so it leads the
  // populated sections (the count>0 partition preserves insertion order).
  const _plSection = buildPlaylistsSection(
    (typeof playlistsByMusician !== 'undefined' ? playlistsByMusician[nodeId] : null)
  );
  if (_plSection) _sections.unshift({ sectionEl: _plSection, count: 1 });

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
  recPanel.style.display     = hasContent ? 'block' : 'none';
  recFilterRow.style.display = hasContent ? 'flex'  : 'none';

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
  // ADR-172: instrument glyph on the lecturer chip.
  const _lInstr = (_lNodeData && _lNodeData.data) ? (_lNodeData.data('instrument') || null) : null;
  if (_lInstr && typeof makeInstrBadge === 'function') {
    chip.insertBefore(makeInstrBadge(_lInstr, 13,
                                     { composer: !!_lNodeData.data('is_composer') }), chip.firstChild);
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
      openOrFocusPlayer(ref.video_id, segLabel, '', seg.offset_seconds, ref.label || 'Lecture-Demo', segmentsToTracks(ref.segments || []), {});
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
function openPlayer(videoId, title, playerId, anchorRect) {
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

  const main = document.getElementById('main');
  const mainRect = main ? main.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  const playerWidth = 480;
  const playerHeight = 320;
  const gap = 8;

  el.style.position = 'absolute';
  el.style.width    = playerWidth + 'px';
  el.style.zIndex   = _nextPlayerZ();

  if (anchorRect) {
    // Open below the anchor; flip left if it overflows right edge, flip up if it overflows bottom
    let left = anchorRect.left - mainRect.left;
    let top  = anchorRect.bottom - mainRect.top + gap;

    if (left + playerWidth > mainRect.width - gap) {
      left = Math.max(gap, mainRect.width - playerWidth - gap);
    }
    if (left < gap) left = gap;

    if (top + playerHeight > mainRect.height - gap) {
      top = Math.max(gap, anchorRect.top - mainRect.top - playerHeight - gap);
    }

    el.style.left  = left + 'px';
    el.style.top   = top  + 'px';
    el.style.right = 'auto';
  } else {
    // Fallback: top-right corner
    el.style.right = '18px';
    el.style.top   = '18px';
    el.style.left  = 'auto';
  }

  // Build bar via DOM (no innerHTML) — consistent with createPlayer
  const namedBar = buildPlayerBar(resolveMedia(videoId), '', title, title, false, {});
  // ADR-175: content players lost their ✕ (minimize-only). Utility players
  // (sruti drone / tanpura) still need an explicit Stop, so re-add one here.
  const namedClose = document.createElement('button');
  namedClose.className = 'mp-close';
  namedClose.title = 'Stop';
  namedClose.setAttribute('aria-label', 'Stop');
  namedClose.textContent = '\u2715';
  const namedRight = namedBar.querySelector('.mp-bar-right');
  if (namedRight) namedRight.appendChild(namedClose);
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
  el.dataset.standalone = '1';   // ADR-175: utility player — keep strip minimize

  // Named player: the sruti drone minimizes via the universal fold-cue (ADR-160),
  // so it no longer needs a dedicated minimize button. Its single ✕ close button
  // stops the drone and resets the tonic ring on the raga wheel.
  if (playerId === 'sruti') {
    el.classList.add('sruti-player');
    const closeBtn = el.querySelector('.mp-close');
    if (closeBtn) {
      closeBtn.title = 'Stop tanpura';
      closeBtn.setAttribute('aria-label', 'Stop tanpura drone');
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof RagaWheel !== 'undefined' && typeof RagaWheel._clearSrutiRing === 'function') {
          RagaWheel._clearSrutiRing();
        }
        closePlayer('sruti');
      });
    }
  } else {
    el.querySelector('.mp-close').addEventListener('click', () => {
      closePlayer(playerId);
    });
  }

  _wireFoldCue(el);   // ADR-160: fold-cue minimizes the player (rail stays, audio continues)
  wireDrag(el, el.querySelector('.mp-bar'));
  wireResize(el, el.querySelector('.mp-resize'));
  el.addEventListener('mousedown', () => bringToFront(instance));

  if (main) main.appendChild(el);
  bringToFront(instance);
  namedPlayerRegistry.set(playerId, instance);
  _scheduleReposition();   // ADR-176: settle the utility player clear of every surface
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

  // ADR-161: leftmost chevron \u2014 the explicit expand affordance (the chip rail
  // now fills the strip, so there's no blank area left to tap). Replaces the old
  // \u25B6 button, which misleadingly implied "play" when it only expanded.
  const expandBtn = document.createElement('button');
  expandBtn.className = 'mp-mini-expand';
  expandBtn.title = 'Expand player';
  expandBtn.setAttribute('aria-label', 'Expand player');
  expandBtn.textContent = '\u25B4';   // \u25B4 upward chevron = expand
  strip.appendChild(expandBtn);

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
    el, strip, bar, videoWrap, tracklistDiv, tracklistEl: tracklistDiv, handle,
    miniTitle: titleSpan,
    miniExpand: expandBtn,
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
  // Tap a blank part of the mini strip → expand. Chips stopPropagation (they
  // navigate instead); the close button and the ▾N overflow menu are excluded.
  mp.strip.addEventListener('click', e => {
    if (e.target === mp.miniClose || mp.miniClose.contains(e.target)) return;
    if (e.target.closest('.mp-rail-more, .mp-rail-overflow')) return;
    _expandMobilePlayer();
  });

  // Leftmost expand chevron (▴) — explicit expand affordance
  mp.miniExpand.addEventListener('click', e => {
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

  // Stop any previous playback (ADR-155: destroy prior controller/Plyr)
  if (mp.controller) { mp.controller.destroy(); mp.controller = null; }
  else if (mp.iframe) mp.iframe.src = '';

  mp.media = media;
  mp.mediaKey = mkey;
  mp.vid = (media.provider === 'youtube') ? media.provider_id : null;
  mp.tracks = (Array.isArray(tracks) && tracks.length > 0) ? tracks : [];
  mp.trackIndex = 0;
  mp.artistName = artistName || '';
  mp.concertTitle = concertTitle || '';
  // ADR-066/159: store artistName in meta so updatePlayerRail can build the performer chip
  mp.meta = Object.assign({ artistName: artistName || null }, meta || {});
  mp.currentRagaId = (meta && meta.ragaId) || null;  // ADR-049

  // Find the track index matching startSeconds
  if (mp.tracks.length > 0 && startSeconds > 0) {
    const idx = mp.tracks.findIndex(t => t.offset_seconds === startSeconds);
    if (idx >= 0) mp.trackIndex = idx;
  }

  // ADR-160 pass 2: the mini strip shows the live chip rail (not a text title)
  const currentTrack = mp.tracks[mp.trackIndex];
  const displayTitle = currentTrack ? currentTrack.display_title : trackLabel;
  _updateMobileMiniRail(mp,
    currentTrack ? (currentTrack.raga_id || null)        : ((meta && meta.ragaId) || null),
    currentTrack ? (currentTrack.composition_id || null) : ((meta && meta.compositionId) || null),
    displayTitle || concertTitle || null,
    currentTrack ? (currentTrack.tala || null)           : ((meta && meta.tala) || null));

  // ── Build full-mode bar (utility players only) ──────────────────────────
  // ADR-175: content players are BARE — identity lives in the Playlist editor
  // row; show/hide is driven by that row. Utility players keep their bar.
  const isContent = !!(meta && meta.isQueueItem);
  mp.el.classList.toggle('bare', isContent);
  mp.bar.innerHTML = '';
  if (!isContent) {
    const fullBar = buildPlayerBar(media, artistName, concertTitle || trackLabel, trackLabel,
                                   mp.tracks.length > 0, meta || {});
    while (fullBar.firstChild) mp.bar.appendChild(fullBar.firstChild);
  }

  // Re-wire close button inside full bar
  const barClose = mp.bar.querySelector('.mp-close');
  if (barClose) {
    barClose.addEventListener('click', e => {
      e.stopPropagation();
      _closeMobilePlayer();
    });
  }

  // ADR-161: leftmost fold-cue (▾) minimizes the full mobile player back to the
  // mini strip — the chip rail fills the bar, leaving no blank area to tap, so an
  // explicit chevron is the minimize affordance (mirrors desktop's fold-cue).
  const barFoldCue = mp.bar.querySelector('.mp-fold-cue');
  if (barFoldCue) {
    barFoldCue.classList.add('mp-fold-active');
    barFoldCue.textContent = '▾';
    barFoldCue.title = 'Minimize';
    barFoldCue.addEventListener('click', e => {
      e.stopPropagation();
      _collapseMobilePlayer(false);
    });
  }

  // ADR-175: the queue editor is app-level now; the mobile bar no longer carries
  // an "Up Next" toggle/panel.

  // ADR-175: the ≡ tracklist toggle is retired (the Playlist Bar editor owns
  // list navigation); instead wire the explicit minimize button (old ✕ slot)
  // to the mobile collapse.
  const mobileMinBtn = mp.bar.querySelector('.mp-minimize');
  if (mobileMinBtn) {
    mobileMinBtn.addEventListener('click', e => {
      e.stopPropagation();
      _collapseMobilePlayer(false);
    });
  }

  // ── Wire clipboard copy button on mobile path ────────────────────────────
  // buildPlayerBar() creates a fresh .mp-copy-btn but _openMobilePlayer() only
  // re-wires .mp-close, .mp-minimize, .mp-copy-btn. Clone to drop any stale
  // listeners (same pattern as the minimize button above), then wire.
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
    freshShare.addEventListener('click', async e => {
      e.stopPropagation();
      const res = await encodePermalink(mp);
      if (!res || !res.fragment) return;
      window.location.hash = res.fragment;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(window.location.href).then(() => {
          freshShare.classList.add('mp-share-copied');
          setTimeout(() => freshShare.classList.remove('mp-share-copied'), 1500);
          // ADR-164: surface queue truncation honestly, never silently.
          showCopyLinkToast(res.notice ? 'Permalink copied! (' + res.notice + ')' : 'Permalink copied!');
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

  // ── Mount media (ADR-155: Plyr via mountPlayer; iframe fallback inside) ───
  mp.videoWrap.innerHTML = '';
  mp.videoWrap.classList.remove('mp-has-plyr');   // mountPlayer re-adds it for Plyr
  mp.videoWrap.style.paddingTop = '56.25%';
  mp.videoWrap.style.height = '';
  const controller = mountPlayer(mp.videoWrap, media, startSeconds, markerPointsFromTracks(mp.tracks));
  mp.controller = controller;
  mp.iframe = controller.iframe;   // null when Plyr-backed
  // ADR-184: now-playing chip overlay on the mobile video surface too.
  const mpNowPlaying = document.createElement('div');
  mpNowPlaying.className = 'mp-now-playing';
  mp.videoWrap.appendChild(mpNowPlaying);
  // Live playhead so share/copy capture the real position (AUDIT-014 F-04).
  // Also advance the header rail and mini-strip when the playhead crosses a
  // segment boundary (mirrors the desktop createPlayer path).
  controller.onTime(sec => {
    mp.currentOffset = sec;
    // ADR-163 §5 / ADR-176 follow-up: same boundary predicate as desktop
    // createPlayer — advance before painting the next chapter.
    if (_shouldAdvanceQueue(mp, sec)) {
      MediaQueue.advance();
      return;
    }
    const prevOffset = mp._activeOffset;
    _updateActiveSegment(mp, sec);
    if (mp._activeOffset !== prevOffset) {
      const active = mp.tracks.find(t => t.offset_seconds === mp._activeOffset);
      if (active) {
        _updateMobileMiniRail(mp, active.raga_id || null, active.composition_id || null,
                              active.subject || active.display_title || null, active.tala || null);
        const newIdx = mp.tracks.indexOf(active);
        if (newIdx >= 0) mp.trackIndex = newIdx;
        _updateMiniDots(mp);
      }
    }
  });
  // ADR-157: auto-advance the queue when this item ends.
  controller.onEnded(() => { if (MediaQueue.isCurrent(mp.mediaKey)) MediaQueue.advance(); });

  // ── Build tracklist ─────────────────────────────────────────────────────
  mp.tracklistDiv.innerHTML = '';
  if (mp.tracks.length > 0) {
    const pseudoInstance = {
      el: mp.el, controller, iframe: mp.iframe, tracklistEl: mp.tracklistDiv,
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
  updatePlayerRail(
    { el: mp.el, meta: mp.meta },
    _initTrack ? (_initTrack.raga_id || null) : (mp.currentRagaId || null),
    _initTrack ? (_initTrack.composition_id || null) : ((mp.meta && mp.meta.compositionId) || null),
    _initTrack ? (_initTrack.display_title || null) : (trackLabel || null),
    _initTrack ? (_initTrack.tala || null) : ((mp.meta && mp.meta.tala) || null)
  );

  // ADR-175: no bottom mini strip — open straight to the full sheet; the top
  // Playlist Bar is the persistent face.
  mp.el.classList.remove('mini');

  // Register in playerRegistry (unregister any previous mobile entry first)
  for (const [key, val] of playerRegistry) {
    if (val._isMobileSingleton) { playerRegistry.delete(key); break; }
  }
  playerRegistry.set(mkey, {
    el: mp.el, controller, iframe: mp.iframe, plyr: controller.plyr,
    titleEl: mp.bar.querySelector('.mp-title'),
    tracklistEl: mp.tracklistDiv, media, mediaKey: mkey, vid: mp.vid,
    _isMobileSingleton: true,
  });
  refreshPlayingIndicators();
  mp.el.style.display = '';
  _expandMobilePlayer();
}

function _expandMobilePlayer() {
  if (!_mobilePlayer) return;
  const mp = _mobilePlayer;
  mp.el.style.display = '';   // ADR-175: reveal the sheet hidden by minimize
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

  // ADR-175: no bottom mini strip — hide the player surface; the top Playlist
  // Bar is the persistent face (and can re-expand it).
  mp.el.classList.remove('full-mobile');
  mp.el.classList.add('mini');
  mp.el.style.display = 'none';
  document.body.classList.remove('mobile-mini-player');

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
  // _currentPlayerId is nulled FIRST to break the call loop:
  //   _closeMobilePlayer → _clearSrutiRing → _srutiStop → closePlayer('sruti')
  //   → _closeMobilePlayer again. Without the early null the second entry also
  //   sees 'sruti' and recurses into _clearSrutiRing, causing a stack overflow
  //   that aborts before mp.el.style.display='none' runs (indicator clears,
  //   player stays visible).
  const _wasSruti = mp._currentPlayerId === 'sruti';
  mp._currentPlayerId = null;
  if (_wasSruti &&
      typeof RagaWheel !== 'undefined' &&
      typeof RagaWheel._clearSrutiRing === 'function') {
    RagaWheel._clearSrutiRing();
  }

  if (mp.controller) { mp.controller.destroy(); mp.controller = null; }
  else if (mp.iframe) mp.iframe.src = '';
  mp.iframe = null;
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

  // Seek to the new track (ADR-155: controller → Plyr currentTime, no reload)
  if (mp.controller) {
    mp.controller.seek(track.offset_seconds > 0 ? track.offset_seconds : 0);
  } else if (mp.iframe) {
    mp.iframe.src = embedUrl(mp.media,
      track.offset_seconds > 0 ? track.offset_seconds : undefined);
  }

  // ADR-160 pass 2: keep the mini-strip chip rail in sync with the active track
  _updateMobileMiniRail(mp, track.raga_id || null, track.composition_id || null,
                        track.display_title || null, track.tala || null);

  // Update dot indicators
  _updateMiniDots(mp);

  // Update tracklist active indicator
  mp.tracklistDiv.querySelectorAll('.mp-track-item').forEach((li, idx) => {
    li.classList.toggle('mp-track-active', idx === newIndex);
  });

  // ADR-159: update the bar's identity rail in full mode (include meta + displayTitle)
  updatePlayerRail(
    { el: mp.el, meta: mp.meta },
    track.raga_id || null,
    track.composition_id || null,
    track.display_title || null,
    track.tala || null
  );
}

// ── ADR-160 pass 2: mobile mini-strip identity rail ──────────────────────────
// The collapsed mobile strip shows the same live chip rail as the full bar, so
// discovery stays open (and what's playing stays visible) while minimized.
// Built into .mp-mini-info above the track dots; overflowing chips collapse into
// the rail's ▾N menu (which flips upward off the bottom strip, see
// _toggleRailOverflow). Reuses buildPlayerRail + pmeta exactly like the bar.
function _updateMobileMiniRail(mp, ragaId, compId, displayTitle, tala) {
  const info = mp.strip && mp.strip.querySelector('.mp-mini-info');
  if (!info) return;
  const old = info.querySelector('.mp-rail');
  if (old) {
    if (old._railObserver) old._railObserver.disconnect();
    if (old._overflowEl) old._overflowEl.remove();   // drop popped-out menu
    old.remove();
  }
  const pmeta = mp.meta || {};
  const rail = buildPlayerRail({
    nodeId:        pmeta.nodeId    || null,
    artistName:    pmeta.artistName || null,
    ragaId:        ragaId || null,
    compositionId: compId || null,
    displayTitle:  displayTitle || null,
    tala:          tala || null,
    subjects:      pmeta.subjects || null,
  });
  if (rail) info.insertBefore(rail, info.firstChild);   // rail above the track dots
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

