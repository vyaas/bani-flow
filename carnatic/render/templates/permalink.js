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

  // ── decodePermalinkHash ───────────────────────────────────────────────────
  // Returns parsed state object or null on any error.
  function decodePermalinkHash(hash) {
    if (!hash || !hash.startsWith('#s=')) return null;
    try {
      // Reverse URL-safe base64: restore standard base64 chars, then re-pad.
      var b64 = hash.slice(3)
        .replace(/-/g, '+').replace(/_/g, '/');
      var pad = b64.length % 4;
      if (pad) b64 += '===='.slice(0, 4 - pad);
      // atob → percent-escape latin1 bytes → decodeURIComponent for UTF-8
      var json = decodeURIComponent(
        atob(b64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
      var state = JSON.parse(json);
      // ADR-154: v1 carried a YouTube `vid`; v2 carries a provider-qualified
      // media_key in `m` (and still emits `vid` for YouTube media). Accept both.
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
  function restoreStateFromHash() {
    var state = decodePermalinkHash(window.location.hash);
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

      // 3. Open the player with the restored state.
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
