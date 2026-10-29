// queue_permalink_behaviour.js — ADR-164 behavioural tests for shareable queue
// & playlist permalinks, run through node against the SHIPPED templates.
//
// Presence checks (test_queue_permalink.py) assert the wiring exists in
// graph.html; this runner exercises the semantics that carry the feature's
// weight, extracted verbatim from carnatic/render/templates/*.js:
//
//   • share-from-queue round-trips the sequence + cursor (persistent + inline)
//   • the persistent form is reference-by-id: playlist edits after sharing
//     resolve to the CURRENT playlist content
//   • an oversized ephemeral queue truncates with a surfaced notice, windowed
//     so the cursor item always survives
//   • any queue edit drops the playlist reference (a mutated queue inlines)
//   • a missing playlist id degrades to the single-item restore
//   • old permalinks (no q block) still resolve; q rides BOTH transports
//   • q extends v:2 — no version bump (old readers degrade, not reject)
//
// Run one scenario:  node carnatic/tests/js/queue_permalink_behaviour.js <name>
// Run all:           node carnatic/tests/js/queue_permalink_behaviour.js
// Driven by test_queue_permalink.py so it rides the normal pytest run.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const assert = require('assert');

const TEMPLATES = path.resolve(__dirname, '..', '..', 'render', 'templates');

// ── Slice extraction ─────────────────────────────────────────────────────────
// Pull the units under test out of the templates by stable comment anchors.
// A moved/renamed anchor fails loudly here — that is the drift alarm.
function grab(src, startMarker, endMarker, file) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error(`anchor missing in ${file}: ${startMarker}`);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error(`end anchor missing in ${file}: ${endMarker}`);
  return src.slice(a, b);
}

const mpSrc = fs.readFileSync(path.join(TEMPLATES, 'media_player.js'), 'utf8');
const plSrc = fs.readFileSync(path.join(TEMPLATES, 'permalink.js'), 'utf8');
const providersSrc = fs.readFileSync(path.join(TEMPLATES, 'media_providers.js'), 'utf8');

const SLICE_RESOLVE_MEDIA = grab(mpSrc, 'function resolveMedia(arg)', '// embedUrl(media', 'media_player.js');
const SLICE_ENCODE = grab(mpSrc, 'const QUEUE_PERMALINK_CAP', 'function nextSpawnPosition()', 'media_player.js');
const SLICE_QUEUE = grab(mpSrc, 'const MediaQueue = {', '// ── ADR-165: row registry', 'media_player.js');
const SLICE_PL_ITEMS = grab(mpSrc, 'function _playlistToQueueItems', 'function buildPlaylistRow', 'media_player.js');
const SLICE_READER = grab(plSrc, 'function _bytesFromB64url', '  // Expose for unit testing.', 'permalink.js');

// ── Sandbox ──────────────────────────────────────────────────────────────────
// Only what the units touch. A new undeclared dependency fails here, which is
// worth failing on.
const sandbox = {
  console, JSON, Object, Array, Math, Promise, Set, Map, Uint8Array,
  TextEncoder, TextDecoder, Blob, Response,
  CompressionStream, DecompressionStream,
  URLSearchParams, URL,
  btoa, atob, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  unescape, escape,
  // permalink restore picks the mobile player-first landing via matchMedia.
  matchMedia: () => ({ matches: false }),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const HARNESS = `
'use strict';
var window = globalThis;             // window.X assignments land on the global
var location = { hash: '' };

// ── Host stubs ─────────────────────────────────────────────────────────────
var playerRegistry = new Map();
var __opened = [];                   // every openOrFocusPlayer call, in order
function openOrFocusPlayer(media, label, artistName, startSeconds, concertTitle, tracks, meta) {
  __opened.push({ media, label, artistName, startSeconds, concertTitle, tracks, meta });
  return null;
}
function _refreshQueuePanels() {}
function refreshPlayingIndicators() {}
function triggerBaniSearch() {}
function _openMusicianPanelForTransit() {}
function selectNode() {}

// ── Unit under test: real provider registry (IIFE assigns window.mediaKey…) ──
${providersSrc}

// ── Units under test: player + queue + permalink slices ─────────────────────
${SLICE_RESOLVE_MEDIA}
${SLICE_ENCODE}
${SLICE_QUEUE}
${SLICE_PL_ITEMS}
${SLICE_READER}

globalThis.__T = {
  MediaQueue, encodePermalink, decodePermalinkHash, restoreStateFromHash,
  _playlistToQueueItems, resolveMedia, QUEUE_PERMALINK_CAP,
};
`;
vm.runInContext(HARNESS, sandbox, { filename: 'adr164_harness.js' });

const T = sandbox.__T;
const MediaQueue = T.MediaQueue;

// ── Fixtures ─────────────────────────────────────────────────────────────────
const PLAYLIST = {
  id: 'gleaming_edges_of_begada',
  title: 'Gleaming Edges of Begada',
  items: [
    { media_key: 'youtube:AU_UlJRBCyk', recording_id: 'asoka_hotel_egmore',
      composition_id: 'shankari_neeve', raga_id: 'begada',
      musician_ids: ['ramnad_krishnan'], start_seconds: 237 },
    { media_key: 'youtube:XYZ12345678', start_seconds: 0, end_seconds: 641, note: 'second' },
  ],
};

function resetHost() {
  sandbox.__opened = [];
  sandbox.playlists = JSON.parse(JSON.stringify([PLAYLIST]));
  sandbox.location = { hash: '' };
  MediaQueue.clear();
}

function mkInstance(mediaKeyStr, offset, meta) {
  const [provider, provider_id] = mediaKeyStr.split(':');
  return { mediaKey: mediaKeyStr, media: { provider, provider_id }, currentOffset: offset || 0, meta: meta || {} };
}

function mkInlineItems(n) {
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push({
      media: T.resolveMedia('youtube:inline' + String(i).padStart(5, '0')),
      label: '',
      startSeconds: i * 10,
      meta: { ragaId: 'begada', end_seconds: i * 10 + 500 },
    });
  }
  return items;
}

function lastOpen() {
  // Every scenario's restore is the LAST open — setup starts open first.
  return sandbox.__opened[sandbox.__opened.length - 1];
}

function zFragment(state) {
  return '#z=' + Buffer.from(zlib.deflateRawSync(Buffer.from(JSON.stringify(state), 'utf8')))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sFragment(state) {
  // Legacy `#s=`: btoa over percent-escaped UTF-8 bytes.
  const b64 = Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
  return '#s=' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Scenarios ────────────────────────────────────────────────────────────────
const scenarios = {

  async 'persistent-roundtrip'() {
    resetHost();
    MediaQueue.start(T._playlistToQueueItems(sandbox.playlists[0]), 1, { playlistId: PLAYLIST.id });
    assert.strictEqual(MediaQueue.playlistId, PLAYLIST.id, 'queue started from a playlist carries its id');

    const res = await T.encodePermalink(mkInstance('youtube:XYZ12345678', 312, { ragaId: 'begada' }));
    assert.ok(res && res.fragment.startsWith('#z='), 'compressed fragment emitted');
    const st = await T.decodePermalinkHash(res.fragment);
    assert.deepStrictEqual(st.q, { pl: PLAYLIST.id, i: 1 }, 'persistent form is id + cursor');
    assert.strictEqual(st.v, 2, 'q extends v:2 — no version bump');
    assert.strictEqual(st.t, 312, 'offset stays top-level (not duplicated into q)');

    sandbox.location = { hash: res.fragment };
    await T.restoreStateFromHash();
    assert.ok(MediaQueue.active, 'queue rehydrated');
    assert.strictEqual(MediaQueue.items.length, 2, 'full sequence restored, not the single item');
    assert.strictEqual(MediaQueue.index, 1, 'cursor restored');
    assert.strictEqual(MediaQueue.playlistId, PLAYLIST.id, 'restored queue keeps the playlist identity');
    assert.strictEqual(lastOpen().startSeconds, 312, 'seek lands mid-item');
  },

  async 'persistent-survives-playlist-edit'() {
    resetHost();
    MediaQueue.start(T._playlistToQueueItems(sandbox.playlists[0]), 0, { playlistId: PLAYLIST.id });
    const res = await T.encodePermalink(mkInstance('youtube:AU_UlJRBCyk', 400));

    // The playlist gains an item AFTER the link was shared.
    sandbox.playlists[0].items.push({ media_key: 'youtube:NEWITEM9999', start_seconds: 10 });
    sandbox.location = { hash: res.fragment };
    await T.restoreStateFromHash();
    assert.strictEqual(MediaQueue.items.length, 3,
      'reference-by-id resolves the CURRENT playlist content, not a frozen copy');
  },

  async 'inline-roundtrip'() {
    resetHost();
    MediaQueue.start(mkInlineItems(5), 2);
    assert.strictEqual(MediaQueue.playlistId, null, 'ephemeral queue has no playlist identity');

    const res = await T.encodePermalink(mkInstance('youtube:inline00002', 0));
    const st = await T.decodePermalinkHash(res.fragment);
    assert.ok(Array.isArray(st.q.items), 'ephemeral queue inlines');
    assert.strictEqual(st.q.items.length, 5);
    assert.strictEqual(st.q.i, 2);
    assert.strictEqual(st.q.items[0].m, 'youtube:inline00000', 'media_key rides as m');
    assert.strictEqual(st.q.items[0].s, undefined, 'start omitted when 0 (compact form)');
    assert.strictEqual(st.q.items[1].s, 10, 'start encoded when > 0');
    assert.strictEqual(st.q.items[1].e, 510, 'span end encoded');
    assert.strictEqual(st.q.items[1].r, 'begada', 'raga chip meta encoded');

    sandbox.location = { hash: res.fragment };
    await T.restoreStateFromHash();
    assert.strictEqual(MediaQueue.items.length, 5, 'inline sequence rehydrated');
    assert.strictEqual(MediaQueue.index, 2, 'inline cursor restored');
    assert.strictEqual(MediaQueue.playlistId, null, 'inline restore claims no playlist');
    assert.strictEqual(MediaQueue.items[1].meta.end_seconds, 510, 'span end survives the round-trip');
  },

  async 'truncation-windows-and-notices'() {
    resetHost();
    MediaQueue.start(mkInlineItems(25), 22);
    const res = await T.encodePermalink(mkInstance('youtube:inline00022', 0));
    assert.ok(res.notice && /truncated/.test(res.notice),
      'oversized share surfaces a truncation notice, never silent: ' + res.notice);
    const st = await T.decodePermalinkHash(res.fragment);
    assert.strictEqual(st.q.items.length, T.QUEUE_PERMALINK_CAP, 'hard-capped');
    assert.strictEqual(st.q.items[st.q.i].m, 'youtube:inline00022',
      'windowed slice: the cursor item always survives');

    // Cursor near the top → the first N are kept and the cursor is unshifted.
    resetHost();
    MediaQueue.start(mkInlineItems(25), 3);
    const res2 = await T.encodePermalink(mkInstance('youtube:inline00003', 0));
    const st2 = await T.decodePermalinkHash(res2.fragment);
    assert.strictEqual(st2.q.items[0].m, 'youtube:inline00000', 'top-cursor keeps the head of the queue');
    assert.strictEqual(st2.q.i, 3, 'top-cursor index unshifted');
    assert.ok(res2.notice, 'truncation noticed either way');
  },

  async 'queue-edit-drops-playlist-reference'() {
    for (const edit of ['removeAt', 'move', 'addItem', 'addItems']) {
      resetHost();
      MediaQueue.start(T._playlistToQueueItems(sandbox.playlists[0]), 1, { playlistId: PLAYLIST.id });
      assert.strictEqual(MediaQueue.playlistId, PLAYLIST.id);
      if (edit === 'removeAt') MediaQueue.removeAt(0);
      else if (edit === 'move') MediaQueue.move(0, 1);
      else if (edit === 'addItem') MediaQueue.addItem({ media: 'youtube:ADDED000001' });
      else MediaQueue.addItems([{ media: 'youtube:ADDED000002' }]);
      assert.strictEqual(MediaQueue.playlistId, null,
        `${edit}: a mutated queue no longer IS the playlist — it must inline`);
      const res = await T.encodePermalink(mkInstance('youtube:XYZ12345678', 0));
      const st = await T.decodePermalinkHash(res.fragment);
      assert.ok(!st.q || !st.q.pl, `${edit}: share never claims the playlist after an edit`);
    }
  },

  async 'missing-playlist-degrades-to-single-item'() {
    resetHost();
    sandbox.location = { hash: zFragment({ v: 2, m: 'youtube:AU_UlJRBCyk', t: 99, q: { pl: 'deleted_playlist', i: 0 } }) };
    await T.restoreStateFromHash();
    assert.ok(!MediaQueue.active, 'unknown playlist starts no queue');
    assert.strictEqual(sandbox.__opened.length, 1, 'falls back to the single-item restore');
    assert.strictEqual(lastOpen().startSeconds, 99, 'single item opens at the cursor');
  },

  async 'old-link-without-q-resolves'() {
    resetHost();
    sandbox.location = { hash: zFragment({ v: 2, m: 'youtube:AU_UlJRBCyk', t: 237 }) };
    await T.restoreStateFromHash();
    assert.ok(!MediaQueue.active, 'pre-ADR-164 link starts no queue');
    assert.strictEqual(sandbox.__opened.length, 1);
    assert.strictEqual(lastOpen().startSeconds, 237, 'old links resolve exactly as before');
  },

  async 'q-rides-legacy-s-transport-too'() {
    resetHost();
    const state = { v: 2, m: 'youtube:inline00001', q: { items: [
      { m: 'youtube:inline00000', s: 5 }, { m: 'youtube:inline00001', s: 15 },
    ], i: 1 } };
    sandbox.location = { hash: sFragment(state) };
    await T.restoreStateFromHash();
    assert.ok(MediaQueue.active, 'q decodes from the legacy #s= transport as well');
    assert.strictEqual(MediaQueue.items.length, 2);
    assert.strictEqual(MediaQueue.index, 1);
    assert.strictEqual(lastOpen().startSeconds, 15, 'item natural start used when no t');
  },

  async 'single-item-share-emits-no-q'() {
    resetHost();   // no queue started — a plain single-item player share
    const res = await T.encodePermalink(mkInstance('youtube:AU_UlJRBCyk', 42));
    const st = await T.decodePermalinkHash(res.fragment);
    assert.ok(!('q' in st), 'no active queue → no q block (single-item share unchanged)');
  },
};

// ── Dispatch ─────────────────────────────────────────────────────────────────
(async () => {
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(scenarios);
  for (const name of names) {
    if (!scenarios[name]) { console.error('unknown scenario: ' + name); process.exit(2); }
    await scenarios[name]();
    console.log('PASS ' + name);
  }
})().catch(e => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
