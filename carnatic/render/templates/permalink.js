// ── ADR-151: permalink restoration ───────────────────────────────────────────
// Runs at page load (after all scripts and data are initialised).
// If window.location.hash starts with '#s=', decodes the base64 JSON payload
// and replays the navigation journey: left-panel trail → right-panel musician
// → player. The permalink IS the program: it describes the computation that
// produced the view, not just a snapshot of it.
//
// Depends on (all globals in the same <script> block):
//   triggerBaniSearch(type, id, fromHistory)  — bani_flow.js
//   selectNode(node)                          — graph_view.js
//   _openMusicianPanelForTransit(id)          — graph_view.js
//   openOrFocusPlayer(vid, ...)               — media_player.js
//   cy                                        — graph_view.js (Cytoscape instance)

(function() {
  'use strict';

  // ── b64url → Uint8Array ───────────────────────────────────────────────────
  function _bytesFromB64url(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    var pad = b64.length % 4;
    if (pad) b64 += '===='.slice(0, 4 - pad);
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // ── decodePermalinkHash ───────────────────────────────────────────────────
  // Returns parsed state object or null on any error. Async because the `#z=`
  // (ADR-170) path inflates via the stream-based DecompressionStream API.
  async function decodePermalinkHash(hash) {
    if (!hash) return null;
    try {
      var json;
      if (hash.startsWith('#z=')) {
        // ADR-170: base64url → deflate-raw bytes → inflate → JSON.
        var ds = new DecompressionStream('deflate-raw');
        var stream = new Blob([_bytesFromB64url(hash.slice(3))]).stream().pipeThrough(ds);
        json = await new Response(stream).text();
      } else if (hash.startsWith('#s=')) {
        // Legacy: URL-safe base64 → percent-escape latin1 → UTF-8 JSON.
        var bytes = _bytesFromB64url(hash.slice(3));
        var pct = '';
        for (var i = 0; i < bytes.length; i++) {
          pct += '%' + ('00' + bytes[i].toString(16)).slice(-2);
        }
        json = decodeURIComponent(pct);
      } else {
        return null;
      }
      var state = JSON.parse(json);
      // ADR-154: v1 carried a YouTube `vid`; v2 carries a provider-qualified
      // media_key in `m` (and still emits `vid` for YouTube media). Accept both.
      // ADR-164: the queue rides v2 as an optional `q` extension — no version
      // bump, so old readers ignore it and degrade to the single-item restore.
      if (state.v !== 1 && state.v !== 2) {
        console.warn('[permalink] unsupported schema version:', state.v);
        return null;
      }
      if (!state.m && !state.vid) {
        console.warn('[permalink] missing required field: m / vid');
        return null;
      }
      return state;
    } catch (err) {
      console.warn('[permalink] failed to decode hash:', err);
      return null;
    }
  }

  // ── restoreStateFromHash ─────────────────────────────────────────────────
  // Decodes and replays the permalink. Called once on page load.
  async function restoreStateFromHash() {
    var state = await decodePermalinkHash(window.location.hash);
    if (!state) return;

    try {
      // 1. Replay the left-panel (Bani Flow) trail, oldest entry first.
      //    fromHistory=true preserves the forward stack (no invalidation).
      if (state.trail && state.trail.length) {
        for (var i = 0; i < state.trail.length; i++) {
          var entry = state.trail[i];
          if (entry.tp && entry.id) {
            try { triggerBaniSearch(entry.tp, entry.id, true); }
            catch (e) { console.warn('[permalink] trail entry skipped:', entry, e); }
          }
        }
      }

      // 2. Open the right-panel musician (if present).
      if (state.panel) {
        try {
          // Try cy graph first (main musicians); fall back to transit panel.
          var n = (typeof cy !== 'undefined') ? cy.getElementById(state.panel) : null;
          if (n && n.length) {
            selectNode(n);
          } else {
            _openMusicianPanelForTransit(state.panel);
          }
        } catch (e) {
          console.warn('[permalink] panel open skipped:', state.panel, e);
        }
      }

      // 3. ADR-164: rehydrate the queue from the optional `q` block.
      //    Persistent form (`q.pl`) resolves the ADR-163 playlist by id and
      //    rebuilds items from the loaded data; inline form (`q.items`)
      //    rebuilds the (possibly truncated) ephemeral queue. Either way the
      //    cursor (`q.i`) is clamped and the top-level `t` seeks mid-item.
      //    Any failure falls through to the single-item restore below.
      var queueRestored = false;
      if (state.q && window.MediaQueue) {
        try {
          if (state.q.pl) {
            var pl = (typeof playlists !== 'undefined' && typeof _playlistToQueueItems === 'function')
              ? playlists.find(function(p) { return p.id === state.q.pl; }) : null;
            if (pl) {
              var plItems = _playlistToQueueItems(pl);
              if (plItems.length) {
                var pi = Math.max(0, Math.min(state.q.i || 0, plItems.length - 1));
                MediaQueue.start(plItems, pi, { playlistId: pl.id, seekSeconds: state.t || 0 });
                queueRestored = true;
              }
            } else {
              // Deleted/unknown playlist: degrade to the single current item.
              console.warn('[permalink] playlist not found, sharing single item:', state.q.pl);
            }
          } else if (Array.isArray(state.q.items)) {
            var qItems = state.q.items.map(function(qi) {
              if (!qi || !qi.m) return null;
              return {
                media:        qi.m,          // media_key — MediaQueue._normalize resolves it
                label:        qi.l || qi.c || '',
                artistName:   '',
                startSeconds: qi.s || 0,
                concertTitle: '',
                tracks:       [],            // tracklists are not inlined (ADR-164)
                meta: {
                  nodeId:        qi.n   || null,
                  ragaId:        qi.r   || null,
                  compositionId: qi.c   || null,
                  recId:         qi.rec || null,
                  end_seconds:   qi.e   || null,
                },
              };
            }).filter(Boolean);
            if (qItems.length) {
              var qi2 = Math.max(0, Math.min(state.q.i || 0, qItems.length - 1));
              MediaQueue.start(qItems, qi2, { seekSeconds: state.t || 0 });
              queueRestored = true;
            }
          }
        } catch (e) {
          console.warn('[permalink] queue restore skipped:', e);
        }
      }

      // 4. Open the player with the restored state — skipped when the queue
      //    restore already opened it (the queue head IS the current item).
      if (queueRestored) return;
      var meta = state.meta || {};
      // ADR-154: prefer the media_key (v2); fall back to the bare vid (v1).
      // openOrFocusPlayer.resolveMedia() accepts a media_key, vid, or url.
      openOrFocusPlayer(
        state.m || state.vid,
        meta.cid || null,          // trackLabel: composition title if known
        meta.nid || null,          // artistName: node id used as display fallback
        state.t   || undefined,    // startSeconds
        null,                      // concertTitle: not stored in v1 (irrelevant to restoration)
        undefined,                 // tracks: single-track restore; full tracklist not encoded
        {
          nodeId:        meta.nid || null,
          ragaId:        meta.rid || null,
          compositionId: meta.cid || null,
          recId:         meta.rec || null,
        }
      );
    } catch (err) {
      console.warn('[permalink] restoration failed:', err);
    }
  }

  // Expose for unit testing.
  window._decodePermalinkHash    = decodePermalinkHash;
  window._restoreStateFromHash   = restoreStateFromHash;

  // ── Run on page load ─────────────────────────────────────────────────────
  // All scripts are in a single synchronous <script> block. By the time this
  // file executes, graphData, cy, openOrFocusPlayer, triggerBaniSearch, and
  // _openMusicianPanelForTransit are all defined. However, Cytoscape's layout
  // animation runs asynchronously — cy.getElementById() still works because
  // nodes are in the graph even before positions are calculated.
  restoreStateFromHash();

})();
