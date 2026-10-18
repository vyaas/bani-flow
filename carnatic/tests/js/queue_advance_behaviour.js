// queue_advance_behaviour.js — ADR-176 follow-up behavioural tests for the
// Current Playlist advancing between items that share one source video (every
// track of a concert), and for the row/bar tracking the sounding chapter.
//
// Run one scenario:  node carnatic/tests/js/queue_advance_behaviour.js <name>
// Run all:           node carnatic/tests/js/queue_advance_behaviour.js
// Driven by test_queue_advance.py so it rides the normal pytest run.
//
// Contract under test:
//   • a queue of same-video concert tracks reuses ONE player window (no
//     duplicate players left playing when advance fires);
//   • advance() retargets that window (seek + adopt tracks/meta) in place;
//   • a different video still opens a new window and tears down the old one;
//   • the end boundary is compulsory only when another playlist item follows —
//     the last item runs on into the rest of the concert;
//   • when a continuing item crosses into a later chapter, MediaQueue publishes
//     activeChapter so the row + bar name the track actually sounding.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const TEMPLATES = path.resolve(__dirname, '..', '..', 'render', 'templates');

function grab(src, startMarker, endMarker, file) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error(`anchor missing in ${file}: ${startMarker}`);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error(`end anchor missing in ${file}: ${endMarker}`);
  return src.slice(a, b);
}

const mpSrc = fs.readFileSync(path.join(TEMPLATES, 'media_player.js'), 'utf8');
const providersSrc = fs.readFileSync(path.join(TEMPLATES, 'media_providers.js'), 'utf8');

const SLICE_RESOLVE_MEDIA = grab(mpSrc, 'function resolveMedia(arg)', '// embedUrl(media', 'media_player.js');
const SLICE_QUEUE = grab(mpSrc, 'const MediaQueue = {', '// ── ADR-165: row registry', 'media_player.js');
const SLICE_SEGMENTS = grab(mpSrc, 'function _queueItemBoundary', '// ── ADR-155: mountPlayer', 'media_player.js');

const sandbox = {
  console, JSON, Object, Array, Math, Promise, Set, Map, Uint8Array,
  TextEncoder, TextDecoder,
  parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const HARNESS = `
'use strict';
var window = globalThis;

// ── Host stubs ─────────────────────────────────────────────────────────────
var playerRegistry = new Map();
var __opened = [];
function openOrFocusPlayer(media, label, artistName, startSeconds, concertTitle, tracks, meta) {
  const mk = mediaKey(media);
  const inst = {
    mediaKey: mk, media, _isMobileSingleton: false,
    el: { style: {}, remove() { this._removed = true; } },
    controller: { _seeked: null, seek(sec) { this._seeked = sec; }, destroy() { this._destroyed = true; } },
    currentOffset: startSeconds || 0,
    tracks: (Array.isArray(tracks) ? tracks.slice() : []),
    meta: Object.assign({ artistName: artistName || null }, meta || {}),
  };
  playerRegistry.set(mk, inst);
  __opened.push({ media, label, artistName, startSeconds, concertTitle, tracks, meta });
  return inst;
}
function _refreshQueuePanels() {}
function refreshPlayingIndicators() {}
function updatePlayerRail() {}
function embedUrl(media, sec) { return 'embed:' + media.provider_id + '@' + (sec || 0); }

// ── Unit under test: real provider registry ────────────────────────────────
${providersSrc}

// ── Units under test: player resolution + queue + segment helpers ───────────
${SLICE_RESOLVE_MEDIA}
${SLICE_QUEUE}
${SLICE_SEGMENTS}

globalThis.__T = { MediaQueue, mediaKey, resolveMedia, _queueItemBoundary, _shouldAdvanceQueue, _updateActiveSegment };
`;
vm.runInContext(HARNESS, sandbox, { filename: 'adr176_advance_harness.js' });

const T = sandbox.__T;
const MediaQueue = T.MediaQueue;

function resetHost() {
  sandbox.__opened = [];
  sandbox.playerRegistry.clear();
  MediaQueue.clear();
}

function opened() { return sandbox.__opened; }
function instFor(mk) { return sandbox.playerRegistry.get(mk); }

// ── Scenarios ────────────────────────────────────────────────────────────────
const scenarios = {

  'same-video-advance-retargets-one-window'() {
    resetHost();
    const V = 'youtube:CONCERT0001';
    MediaQueue.start([
      { media: V, label: 'A', startSeconds: 100, meta: { end_seconds: 500 } },
      { media: V, label: 'B', startSeconds: 500, meta: { end_seconds: 900 } },
      { media: V, label: 'C', startSeconds: 900, meta: { end_seconds: null } },
    ], 0);
    assert.strictEqual(opened().length, 1, 'one window mounted for the whole same-video queue');
    const inst = instFor(V);
    assert.ok(inst, 'player registered under the shared media key');
    assert.strictEqual(inst.currentOffset, 100, 'starts at the first track offset');

    MediaQueue.advance();
    assert.strictEqual(MediaQueue.index, 1, 'cursor moved to the next playlist item');
    assert.strictEqual(opened().length, 1, 'advance retargets — no second player window');
    assert.strictEqual(inst.controller._seeked, 500, 'existing controller seeked to the next track');
    assert.strictEqual(inst.currentOffset, 500, 'instance offset tracks the seek');
    assert.strictEqual(MediaQueue.currentKey, V, 'current key stays the shared video');

    MediaQueue.advance();
    assert.strictEqual(MediaQueue.index, 2, 'cursor moved again');
    assert.strictEqual(opened().length, 1, 'still one window after the second advance');
    assert.strictEqual(inst.controller._seeked, 900, 'seeked to the third track');
    assert.strictEqual(MediaQueue.activeChapter, null, 'no chapter override while within the item start');
  },

  'different-video-advance-opens-and-destroys'() {
    resetHost();
    MediaQueue.start([
      { media: 'youtube:CONCERT0001', startSeconds: 0, meta: { end_seconds: 10 } },
      { media: 'youtube:CONCERT0002', startSeconds: 0, meta: { end_seconds: null } },
    ], 0);
    assert.strictEqual(opened().length, 1);
    const old = instFor('youtube:CONCERT0001');
    MediaQueue.advance();
    assert.strictEqual(opened().length, 2, 'a different video still opens a new window');
    assert.strictEqual(MediaQueue.currentKey, 'youtube:CONCERT0002', 'cursor follows the new media');
    assert.ok(old.controller._destroyed, 'previous controller destroyed');
    assert.ok(old.el._removed, 'previous window removed');
  },

  'boundary-compulsory-only-when-not-last'() {
    resetHost();
    const V = 'youtube:CONCERT0001';
    MediaQueue.start([
      { media: V, startSeconds: 100, meta: { end_seconds: 500 } },
      { media: V, startSeconds: 500, meta: { end_seconds: 900 } },
    ], 0);
    const inst = instFor(V);
    assert.strictEqual(T._shouldAdvanceQueue(inst, 499), false, 'before the boundary → no advance');
    assert.strictEqual(T._shouldAdvanceQueue(inst, 500), true, 'at the boundary, another item follows → advance');

    MediaQueue.advance();   // now on the LAST item
    assert.strictEqual(MediaQueue.index, 1);
    assert.strictEqual(MediaQueue.items.length, 2);
    assert.strictEqual(T._shouldAdvanceQueue(inst, 900), false,
      'LAST item never auto-advances at its boundary — it runs on into the concert');
    assert.strictEqual(T._shouldAdvanceQueue(inst, 100000), false, 'still no advance deep into the video');
  },

  'boundary-derives-from-chapters-when-end-seconds-absent'() {
    resetHost();
    const V = 'youtube:CONCERT0001';
    MediaQueue.start([
      { media: V, startSeconds: 100, tracks: [
        { offset_seconds: 100, composition_id: 'compA' },
        { offset_seconds: 400, composition_id: 'compB' },
        { offset_seconds: 800, composition_id: 'compC' },
      ], meta: {} },
      { media: 'youtube:OTHER000001', startSeconds: 0, meta: {} },
    ], 0);
    const inst = instFor(V);
    assert.strictEqual(T._queueItemBoundary(inst, MediaQueue.items[0]), 400,
      'derives the next chapter offset when end_seconds is absent');
    assert.strictEqual(T._shouldAdvanceQueue(inst, 400), true,
      'derived chapter boundary drives a compulsory advance when not last');
    assert.strictEqual(T._shouldAdvanceQueue(inst, 399), false);
  },

  'continuing-item-publishes-active-chapter'() {
    resetHost();
    const V = 'youtube:CONCERT0001';
    MediaQueue.start([
      { media: V, startSeconds: 100, label: 'first', tracks: [
        { offset_seconds: 100, composition_id: 'compA', display_title: 'First' },
        { offset_seconds: 400, composition_id: 'compB', display_title: 'Second' },
      ], meta: { compositionId: 'compA' } },
    ], 0);   // single item == last: allowed to run on
    const inst = instFor(V);

    T._updateActiveSegment(inst, 150);
    assert.strictEqual(MediaQueue.activeChapter, null,
      'at the item own start the row keeps the item identity (no override)');

    T._updateActiveSegment(inst, 450);
    assert.ok(MediaQueue.activeChapter, 'crossing into a later chapter publishes an override');
    assert.strictEqual(MediaQueue.activeChapter.composition_id, 'compB',
      'override is the chapter actually sounding');
    assert.strictEqual(inst._activeOffset, 400, 'active-segment cursor advanced');
  },
};

// ── Dispatch ─────────────────────────────────────────────────────────────────
const only = process.argv[2];
const names = only ? [only] : Object.keys(scenarios);
for (const name of names) {
  if (!scenarios[name]) { console.error('unknown scenario: ' + name); process.exit(2); }
  scenarios[name]();
  console.log('PASS ' + name);
}
