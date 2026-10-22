// playlist_context_behaviour.js — ADR-189 behavioural tests for the
// context-scoped playlist row, run through node against the SHIPPED template.
//
// The runner extracts the real units (_playlistItemsForContext,
// _playlistToQueueItems, _playlistEntries) from media_player.js, so these tests
// fail when the shipped code changes semantics — not when a Python mirror
// drifts.
//
// Run one scenario:  node carnatic/tests/js/playlist_context_behaviour.js <name>
// Run all:           node carnatic/tests/js/playlist_context_behaviour.js
// Driven by test_playlist_context_scoping.py so it rides the normal pytest run.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const TEMPLATES = path.resolve(__dirname, '..', '..', 'render', 'templates');
const mpSrc = fs.readFileSync(path.join(TEMPLATES, 'media_player.js'), 'utf8');

// Pull the units under test out of the template by stable comment anchors.
function grab(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error(`anchor missing: ${startMarker}`);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error(`end anchor missing: ${endMarker}`);
  return src.slice(a, b);
}

const SLICE = grab(mpSrc, 'function _playlistToQueueItems', 'function buildPlaylistRow');

const sandbox = {
  console, JSON, Object, Array, Math, Set, Map, Boolean, String, Number, RegExp, Error,
};
sandbox.globalThis = sandbox;
// resolveMedia is the one host dependency of the slice; return a truthy media
// ref for every item so nothing is dropped for reasons unrelated to filtering.
sandbox.resolveMedia = key => (key ? { media_key: key } : null);
vm.createContext(sandbox);
vm.runInContext(SLICE, sandbox, { filename: 'playlist_slice.js' });

const {
  _playlistItemsForContext, _playlistToQueueItems, _playlistEntries,
} = sandbox;

// A cross-raga playlist: the exact shape that motivated ADR-189.
const PL = {
  id: 'hindustani_ragas',
  title: 'Hindustani Ragas',
  items: [
    { media_key: 'youtube:a', raga_id: 'malkauns',   musician_ids: ['venkatesh_kumar'] },
    { media_key: 'youtube:b', raga_id: 'jog',        musician_ids: ['malladi_suri_babu'] },
    { media_key: 'youtube:c', raga_id: 'darbari',    musician_ids: ['ali_akbar_khan'] },
    { media_key: 'youtube:d', raga_id: 'bhimpalasi', musician_ids: ['kishori_amonkar'] },
    { media_key: 'youtube:e', raga_id: 'darbari',    musician_ids: ['kishori_amonkar'] },
    { media_key: 'youtube:f', composition_id: 'x',   raga_id: 'jog', musician_ids: ['ali_akbar_khan'] },
  ],
};

const SCENARIOS = {
  // A raga panel shows only that raga's tracks.
  'raga-filters': () => {
    const out = _playlistItemsForContext(PL, { type: 'raga', id: 'darbari' });
    assert.deepStrictEqual(out.map(i => i.media_key), ['youtube:c', 'youtube:e']);
  },
  // A musician panel shows only that musician's tracks.
  'musician-filters': () => {
    const out = _playlistItemsForContext(PL, { type: 'musician', id: 'kishori_amonkar' });
    assert.deepStrictEqual(out.map(i => i.media_key), ['youtube:d', 'youtube:e']);
  },
  // A composition panel shows only that composition's tracks.
  'comp-filters': () => {
    const out = _playlistItemsForContext(PL, { type: 'comp', id: 'x' });
    assert.deepStrictEqual(out.map(i => i.media_key), ['youtube:f']);
  },
  // No context → the whole playlist.
  'no-context-returns-all': () => {
    assert.strictEqual(_playlistItemsForContext(PL, null).length, 6);
    assert.strictEqual(_playlistItemsForContext(PL, {}).length, 6);
  },
  // A subject the playlist does not touch → no rows.
  'unknown-subject-returns-empty': () => {
    assert.strictEqual(_playlistItemsForContext(PL, { type: 'raga', id: 'nope' }).length, 0);
  },
  // The queue built from the filtered list carries exactly those items, in order.
  'queue-items-follow-filter': () => {
    const items = _playlistItemsForContext(PL, { type: 'raga', id: 'darbari' });
    const q = _playlistToQueueItems(PL, items);
    assert.deepStrictEqual(q.map(x => x.media.media_key), ['youtube:c', 'youtube:e']);
  },
  // The {it, qi} pair keeps the rendered index aligned with the queue index.
  'entries-keep-index-aligned': () => {
    const items = _playlistItemsForContext(PL, { type: 'raga', id: 'darbari' });
    const entries = _playlistEntries(PL, items);
    assert.deepStrictEqual(entries.map(e => e.qi.media.media_key), ['youtube:c', 'youtube:e']);
    assert.strictEqual(entries[1].it.media_key, 'youtube:e');
  },
};

function main() {
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(SCENARIOS);
  for (const name of names) {
    if (!SCENARIOS[name]) throw new Error(`unknown scenario: ${name}`);
    SCENARIOS[name]();
    console.log(`ok ${name}`);
  }
}

main();
