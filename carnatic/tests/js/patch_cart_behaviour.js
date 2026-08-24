// patch_cart_behaviour.js — ADR-171 behavioural tests for the patch staging core.
//
// The drift guards in test_patch_cart_drift.py assert that the browser and the
// ingester agree about *shape*. This asserts the parts that actually carry the
// feature's weight and cannot be checked by grepping:
//
//   • replacing a staged op replaces in place — it does not append a second one
//   • the replacement lands at the index its predecessor held (order is contractual)
//   • removing a grouped row removes every op of that group
//   • op identity never reaches the downloaded artefact
//   • describeOp renders each of the inconsistent op shapes as a readable sentence
//
// Run: node carnatic/tests/js/patch_cart_behaviour.js
// Driven by test_patch_cart_behaviour.py so it rides the normal pytest run.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TEMPLATES = path.resolve(__dirname, '..', '..', 'render', 'templates');

// ── Minimal host stubs ───────────────────────────────────────────────────────
// Only what the patch core touches. Anything else absent is a signal that the
// core has grown a new dependency, which is worth failing on.

function fakeEl() {
  const el = {
    dataset: {}, style: {}, children: [], textContent: '', innerHTML: '',
    disabled: false, href: '', download: '',
    classList: { _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); } },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    click() { if (typeof this._onClick === 'function') this._onClick(); },
  };
  return el;
}

const downloads = [];
const store = new Map();

const sandbox = {
  console: console,
  JSON: JSON,
  Date: Date,
  Object: Object,
  Array: Array,
  Map: Map,
  Set: Set,
  Error: Error,
  MutationObserver: function () { return { observe() {}, disconnect() {} }; },
  setTimeout: setTimeout,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
  Blob: function (parts) { this.parts = parts; },
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} },
  topZ: 0,
  // Enough graph data to exercise id → label resolution.
  graphData: {
    nodes: [
      { id: 'tm_krishna', label: 'TM Krishna', youtube: [
        { url: 'https://youtu.be/abcd1234xyz', label: 'Endaro Mahanubhavulu · Sri · Adi' },
      ] },
      { id: 'ariyakudi', label: 'Ariyakudi Ramanuja Iyengar' },
      { id: 'semmangudi', label: 'Semmangudi Srinivasa Iyer' },
    ],
    ragas: [{ id: 'kharaharapriya', name: 'Kharaharapriya' }],
    compositions: [{ id: 'endaro_mahanubhavulu', title: 'Endaro Mahanubhavulu' }],
    recordings: [], composers: [], edges: [],
  },
  playlists: [],
};
sandbox.graphData.musicians = sandbox.graphData.nodes;

const btn = fakeEl();
sandbox.document = {
  readyState: 'complete',
  body: { contains: () => false, appendChild() {} },
  getElementById: id => (id === 'bundle-download-btn' ? btn : null),
  createElement: () => fakeEl(),
  addEventListener() {},
};
sandbox.window = sandbox;
sandbox.window.innerWidth = 1400;
sandbox.window.addEventListener = () => {};

// downloadJson is defined in entry_forms.js and ends in an <a>.click(); intercept
// at the Blob boundary so the real serialization path is what we inspect.
sandbox.Blob = function (parts) { downloads.push(parts.join('')); this.parts = parts; };

// ── Load the real templates, concatenated exactly as html_generator.py does ───
const src = [
  fs.readFileSync(path.join(TEMPLATES, 'entry_forms.js'), 'utf8'),
  fs.readFileSync(path.join(TEMPLATES, 'patch_cart.js'), 'utf8'),
  // Surface the script-scoped bindings the tests need.
  `globalThis.__t = {
     baniBundle, addToBundle, removeFromBundle, clearBundle, patchOpCount,
     describeOp, patchRows, downloadBundle, withPatchGroup,
     _patchStagingBegin, _patchStagingEnd, _patchMetaOf, _patchOpIdOf,
     _patchRestore, _patchPersist, PATCH_FILENAME,
   };`,
].join('\n');

const ctx = vm.createContext(sandbox);
vm.runInContext(src, ctx, { filename: 'bani-templates.js' });
const t = sandbox.__t;
const sandboxWindow = sandbox;

// ── Tiny assertion harness ───────────────────────────────────────────────────
let failures = 0;
let ran = 0;

// Tests are registered, then run strictly in sequence: some are async, and a
// concurrent run would let one test's clearBundle() wipe another's state.
const suite = [];

function test(name, fn) { suite.push({ name: name, fn: fn }); }

async function run() {
  for (const { name, fn } of suite) {
    ran += 1;
    t.clearBundle();
    t._patchStagingEnd();
    downloads.length = 0;
    store.clear();
    try {
      const err = await fn();
      if (err) throw err;
      console.log('  ok   ' + name);
    } catch (e) {
      failures += 1;
      console.log('  FAIL ' + name);
      console.log('       ' + (e && e.message ? e.message : e));
    }
  }
}

function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((what || 'value') + ': expected ' + b + ', got ' + a);
}

function ok(cond, what) {
  if (!cond) throw new Error(what || 'expected truthy');
}

function includes(hay, needle, what) {
  if (String(hay).indexOf(needle) === -1) {
    throw new Error((what || 'string') + ': ' + JSON.stringify(String(hay))
      + ' does not contain ' + JSON.stringify(needle));
  }
}

// ── Staging ──────────────────────────────────────────────────────────────────

test('addToBundle appends and counts', () => {
  t.addToBundle('musicians', { id: 'a', label: 'A' });
  t.addToBundle('ragas', { id: 'r', name: 'R' });
  eq(t.patchOpCount(), 2, 'op count');
  eq(t.baniBundle.musicians.length, 1, 'musicians');
});

test('talas bucket exists (was throwing before ADR-171)', () => {
  t.addToBundle('talas', { id: 'adi', label: 'Adi' });
  eq(t.patchOpCount(), 1, 'op count');
});

test('unknown bucket still throws — silent drops are forbidden', () => {
  let threw = false;
  try { t.addToBundle('nonsense', { id: 'x' }); } catch (e) { threw = true; }
  ok(threw, 'addToBundle must reject unknown buckets');
});

// ── Replacement: the load-bearing claim ──────────────────────────────────────

test('editing a row replaces in place, it does not append', () => {
  t.addToBundle('musicians', { id: 'first', label: 'First' });
  t.addToBundle('musicians', { id: 'target', label: 'Old' });
  t.addToBundle('musicians', { id: 'last', label: 'Last' });
  const groupId = t._patchMetaOf(t.baniBundle.musicians[1]).groupId;

  t._patchStagingBegin(groupId);
  t.addToBundle('musicians', { id: 'target', label: 'New' });
  t._patchStagingEnd();

  eq(t.patchOpCount(), 3, 'count must be unchanged after an edit');
  eq(t.baniBundle.musicians.map(m => m.label), ['First', 'New', 'Last'],
     'replacement must land at its predecessor index');
});

test('replacing a group swaps every op of that group', () => {
  t.withPatchGroup(() => {
    t.addToBundle('musicians', { id: 'm1', label: 'M1' });
    t.addToBundle('edges', { source: 'g', target: 'm1' });
    t.addToBundle('edges', { source: 'g2', target: 'm1' });
  });
  eq(t.patchOpCount(), 3, 'staged');
  const groupId = t._patchMetaOf(t.baniBundle.musicians[0]).groupId;

  t._patchStagingBegin(groupId);
  t.withPatchGroup(() => {
    t.addToBundle('musicians', { id: 'm1', label: 'M1 revised' });
    t.addToBundle('edges', { source: 'g', target: 'm1' });
  });
  t._patchStagingEnd();

  eq(t.patchOpCount(), 2, 'the outgoing group is gone, not merely added to');
  eq(t.baniBundle.musicians[0].label, 'M1 revised', 'node replaced');
  eq(t.baniBundle.edges.length, 1, 'edges replaced');
});

test('the staging token auto-releases after the submit that consumed it', () => {
  // showPatchSuccess leaves the form window open, so waiting for the window to
  // close would let its "Add another" button stage a second replacement.
  t.addToBundle('musicians', { id: 'a', label: 'A' });
  const g = t._patchMetaOf(t.baniBundle.musicians[0]).groupId;
  t._patchStagingBegin(g);
  t.addToBundle('musicians', { id: 'a', label: 'A revised' });
  eq(t.patchOpCount(), 1, 'the replacement itself must not append');
  ok(sandboxWindow._patchStagingTarget === g, 'token still held during the submit');
  return new Promise(resolve => setTimeout(() => {
    try {
      ok(!sandboxWindow._patchStagingTarget, 'token must be released on the next tick');
      t.addToBundle('musicians', { id: 'b', label: 'B' });
      eq(t.patchOpCount(), 2, 'a later submit must append, not replace again');
      resolve();
    } catch (e) { resolve(e); }
  }, 0));
});

test('a leaked staging token would be visible — end() clears it', () => {
  t.addToBundle('musicians', { id: 'a', label: 'A' });
  const g = t._patchMetaOf(t.baniBundle.musicians[0]).groupId;
  t._patchStagingBegin(g);
  t._patchStagingEnd();
  t.addToBundle('musicians', { id: 'b', label: 'B' });
  eq(t.patchOpCount(), 2, 'post-release staging must append, not replace');
});

// ── Removal ──────────────────────────────────────────────────────────────────

test('removing a grouped row removes all of its ops', () => {
  t.withPatchGroup(() => {
    t.addToBundle('musicians', { id: 'm', label: 'M' });
    t.addToBundle('edges', { source: 'g', target: 'm' });
  });
  t.addToBundle('ragas', { id: 'keep', name: 'Keep' });
  const g = t._patchMetaOf(t.baniBundle.musicians[0]).groupId;
  eq(t.removeFromBundle(g), 2, 'ops removed');
  eq(t.patchOpCount(), 1, 'unrelated ops survive');
  eq(t.baniBundle.ragas[0].id, 'keep', 'the survivor');
});

// ── Rows and grouping ────────────────────────────────────────────────────────

test('one submit of several ops renders as one row', () => {
  t.withPatchGroup(() => {
    t.addToBundle('musicians', { id: 'm', label: 'M' });
    t.addToBundle('edges', { source: 'g', target: 'm' });
    t.addToBundle('edges', { source: 'g2', target: 'm' });
  });
  const rows = t.patchRows();
  eq(rows.length, 1, 'row count');
  eq(rows[0].ops.length, 3, 'ops folded into the row');
});

test('rows are emitted in ingest order, not staging order', () => {
  t.addToBundle('edges', { source: 'a', target: 'b' });
  t.addToBundle('ragas', { id: 'r', name: 'R' });
  eq(t.patchRows().map(r => r.bucket), ['ragas', 'edges'], 'section order');
});

test('two patches to one field are both flagged as a conflict', () => {
  t.addToBundle('musicians', { op: 'patch', id: 'tm_krishna', field: 'born', value: 1976 });
  t.addToBundle('musicians', { op: 'patch', id: 'tm_krishna', field: 'born', value: 1977 });
  const rows = t.patchRows();
  eq(rows.length, 2, 'rows');
  ok(rows[0].conflict && rows[1].conflict, 'both rows must carry the warning');
});

test('two appends to one array are not a conflict — both apply', () => {
  const mk = url => ({ op: 'append', id: 'tm_krishna', array: 'youtube', value: { url: url } });
  t.addToBundle('musicians', mk('https://youtu.be/aaaaaaaaaaa'));
  t.addToBundle('musicians', mk('https://youtu.be/bbbbbbbbbbb'));
  const rows = t.patchRows();
  ok(!rows[0].conflict && !rows[1].conflict, 'appends accumulate; flagging them is noise');
});

// ── describeOp: every inconsistent shape must read as a sentence ─────────────

test('create resolves to a legible summary', () => {
  const d = t.describeOp('musicians', {
    id: 'akkarai_subbulakshmi', label: 'Akkarai Subbulakshmi',
    instrument: 'violin', era: 'contemporary', born: 1988,
  });
  ok(!d.unknown, 'must be classified');
  includes(d.title, 'create musician', 'title');
  includes(d.detail, 'Akkarai Subbulakshmi', 'detail');
  includes(d.detail, 'violin', 'detail');
});

test('patch resolves the id to a human label', () => {
  const d = t.describeOp('musicians', { op: 'patch', id: 'tm_krishna', field: 'born', value: 1976 });
  includes(d.title, 'TM Krishna', 'ids alone are not legibility');
  includes(d.detail, 'born: 1976', 'detail');
  eq(d.patchFields, ['born'], 'conflict key');
});

test('ADR-108 multi-field patch lists every field', () => {
  const d = t.describeOp('musicians', {
    op: 'patch', id: 'tm_krishna', fields: { born: 1976, instrument: 'vocal' },
  });
  includes(d.detail, 'born: 1976', 'detail');
  includes(d.detail, 'instrument: vocal', 'detail');
  eq(d.patchFields.sort(), ['born', 'instrument'], 'conflict keys');
});

test('edges are keyed by (source, target), not id', () => {
  const d = t.describeOp('edges', {
    op: 'patch', source: 'ariyakudi', target: 'semmangudi', field: 'confidence', value: 0.95,
  });
  ok(!d.unknown, 'must be classified');
  includes(d.title, 'Ariyakudi Ramanuja Iyengar', 'source label');
  includes(d.title, 'Semmangudi Srinivasa Iyer', 'target label');
});

test('append via `array` is classified', () => {
  const d = t.describeOp('musicians', {
    op: 'append', id: 'tm_krishna', array: 'youtube',
    value: { url: 'https://youtu.be/x', label: 'Some Kriti' },
  });
  ok(!d.unknown, 'must be classified');
  includes(d.title, 'append youtube', 'title');
  includes(d.detail, 'Some Kriti', 'detail');
});

test('append via `field` (the hindustani_equivalents divergence) is classified', () => {
  const d = t.describeOp('ragas', {
    op: 'append', id: 'kharaharapriya', field: 'hindustani_equivalents', value: 'kafi',
  });
  ok(!d.unknown, 'the field/array divergence must not fall through');
  includes(d.title, 'hindustani_equivalents', 'title');
});

test('a path-addressed append names the entry it targets', () => {
  const d = t.describeOp('musicians', {
    op: 'append', id: 'tm_krishna', array: 'youtube[abcd1234xyz].segments',
    value: { offset_seconds: 120, composition_id: 'endaro_mahanubhavulu' },
  });
  ok(!d.unknown, 'must be classified');
  includes(d.title, 'segments', 'title');
  includes(d.title, 'Endaro Mahanubhavulu · Sri · Adi', 'the vid must resolve to its label');
});

test('an array-valued append reports how many entries it carries', () => {
  const d = t.describeOp('musicians', {
    op: 'append', id: 'tm_krishna', array: 'youtube',
    value: [{ url: 'a', label: 'One' }, { url: 'b', label: 'Two' }, { url: 'c', label: 'Three' }],
  });
  includes(d.detail, '3 entries', 'detail');
});

test('both annotate shapes are normalized', () => {
  const nested = t.describeOp('ragas', {
    op: 'annotate', id: 'kharaharapriya', note: { text: 'Mela 22.' },
  });
  const flat = t.describeOp('ragas', { op: 'annotate', id: 'kharaharapriya', text: 'Mela 22.' });
  ok(!nested.unknown && !flat.unknown, 'both shapes must classify');
  includes(nested.detail, 'Mela 22.', 'nested');
  includes(flat.detail, 'Mela 22.', 'flat');
});

test('the recording value-envelope is unwrapped', () => {
  const d = t.describeOp('recordings', {
    op: 'upsert', value: { id: 'jamshedpur_1961', title: 'Jamshedpur 1961', venue: 'Town Hall' },
  });
  ok(!d.unknown, 'must be classified');
  eq(d.entityId, 'jamshedpur_1961', 'id comes from inside the envelope');
  includes(d.detail, 'Jamshedpur 1961', 'detail');
});

test('an append value is NOT mistaken for an envelope', () => {
  const d = t.describeOp('playlists', {
    op: 'append', id: 'morning', array: 'items', value: { title: 'A track' },
  });
  eq(d.verb, 'append', 'verb');
  eq(d.entityId, 'morning', 'the entity is the playlist, not the appended item');
});

test('the v1 musician discriminator still classifies', () => {
  const d = t.describeOp('musicians', {
    type: 'youtube_append', musician_id: 'tm_krishna', youtube: [{ url: 'x' }],
  });
  eq(d.verb, 'append', 'v1 items have no op field');
  eq(d.entityId, 'tm_krishna', 'v1 items key on musician_id');
});

test('an unrecognised shape degrades legibly rather than blank', () => {
  const d = t.describeOp('musicians', { op: 'teleport', id: 'tm_krishna' });
  ok(d.unknown, 'must be marked unknown so the row shows its JSON');
  includes(d.title, 'teleport', 'the offending op must be named');
});

// ── The artefact ─────────────────────────────────────────────────────────────

test('the downloaded artefact carries no cart bookkeeping', () => {
  t.withPatchGroup(() => {
    t.addToBundle('musicians', { id: 'm', label: 'M' }, {
      label: 'M', reopen: { form: 'musician', args: [{ prefill: { id: 'm' } }] },
    });
    t.addToBundle('edges', { source: 'g', target: 'm' });
  });
  t.downloadBundle();
  eq(downloads.length, 1, 'one download');
  const raw = downloads[0];
  ok(raw.indexOf('_patch') === -1, 'no _patch* key may reach the file: ' + raw);
  const parsed = JSON.parse(raw);
  eq(Object.keys(parsed).sort(), ['generated_at', 'items', 'schema_version'], 'envelope');
  eq(parsed.schema_version, 2, 'schema_version');
  eq(parsed.items.musicians[0], { id: 'm', label: 'M' }, 'op is byte-clean');
});

test('op identity survives a round-trip through persistence', () => {
  t.withPatchGroup(() => {
    t.addToBundle('musicians', { id: 'm', label: 'M' }, {
      reopen: { form: 'musician', args: [{ prefill: { id: 'm' } }] },
    });
    t.addToBundle('edges', { source: 'g', target: 'm' });
  });
  t.addToBundle('ragas', { id: 'r', name: 'R' });
  ok(store.has('baniPatch.v1'), 'autosave must have written');

  // Simulate a reload: drop in-memory state, restore from storage.
  t.baniBundle.musicians.length = 0;
  t.baniBundle.edges.length = 0;
  t.baniBundle.ragas.length = 0;
  const restored = t._patchRestore();

  eq(restored, 3, 'ops restored');
  const rows = t.patchRows();
  eq(rows.length, 2, 'grouping must survive the round-trip');
  const grouped = rows.filter(r => r.ops.length > 1);
  eq(grouped.length, 1, 'the node+edge row is still one row');
  ok(grouped[0].meta && grouped[0].meta.reopen, 'the reopen descriptor must survive too');
  eq(grouped[0].meta.reopen.form, 'musician', 'descriptor form');
});

test('a persisted patch is discarded on version mismatch, never half-parsed', () => {
  store.set('baniPatch.v1', JSON.stringify({
    version: 99, items: { musicians: [{ id: 'ghost' }] },
  }));
  eq(t._patchRestore(), 0, 'nothing restored');
  eq(t.patchOpCount(), 0, 'and nothing leaked in');
  ok(!store.has('baniPatch.v1'), 'the unreadable entry is cleared');
});

test('clearing the patch empties storage too', () => {
  t.addToBundle('musicians', { id: 'm', label: 'M' });
  ok(store.has('baniPatch.v1'), 'saved');
  t.clearBundle();
  eq(t.patchOpCount(), 0, 'emptied');
  ok(!store.has('baniPatch.v1'), 'storage must not keep a phantom patch');
});

// ── Summary ──────────────────────────────────────────────────────────────────

run().then(() => {
  console.log('\n' + (failures ? 'FAILED' : 'passed') + ': ' + (ran - failures) + '/' + ran);
  process.exit(failures ? 1 : 0);
});
