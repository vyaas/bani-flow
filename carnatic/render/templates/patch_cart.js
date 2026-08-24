// ── ADR-171: The Patch Cart — reviewable, editable staging surface ────────────
// Depends on: entry_forms.js (baniBundle, _patchMeta, addToBundle, createEntryWindow,
//             removeFromBundle, clearBundle, downloadBundle, patchOpCount),
//             graphData / playlists / window.talaData (injected by the render pipeline).
//
// The patch is a transcript of authored intent. Before ADR-171 the only view of it
// was an integer in a button label, and the only reversal was a positional
// baniBundle.<bucket>.pop(). This module gives the patch a face: every staged op as
// a readable line item, grouped in the order bani-add will apply them, each row
// editable and removable, with download as the deliberate confirm step.
//
// Cart removal is PATCH-scoped. ADR-085 §6 forbids a delete op — nothing here ever
// removes stored data, and the copy must never suggest that it does.

// ── Bucket order — mirrors bani_add.py:1093-1156 exactly ──────────────────────
// Not the order of baniBundle's literal, and not ADR-083 §1's prose (which
// predates the compositions-before-musicians correction). The dispatcher is
// authoritative; carnatic/tests/test_patch_cart_drift.py pins this.
const PATCH_BUCKET_ORDER = [
  'ragas', 'composers', 'compositions', 'musicians',
  'recordings', 'playlists', 'edges', 'talas',
];

const PATCH_BUCKET_NOUN = {
  ragas: 'raga', composers: 'composer', compositions: 'composition',
  musicians: 'musician', recordings: 'recording', playlists: 'playlist',
  edges: 'edge', talas: 'tala',
};

// ── Reopen registry — ADR-171 §5 ─────────────────────────────────────────────
// A descriptor is { form: <key>, args: [...] }; args are spread positionally so
// both calling conventions in entry_forms.js work — ({prefill}) and (id, opts).
const PATCH_REOPEN_FORMS = {
  musician:        function () { return buildMusicianForm.apply(null, arguments); },
  add_musician:    function () { return buildAddMusicianForm.apply(null, arguments); },
  raga:            function () { return buildRagaForm.apply(null, arguments); },
  composition:     function () { return buildCompositionForm.apply(null, arguments); },
  concert:         function () { return buildAddConcertForm.apply(null, arguments); },
  focused_youtube: function () { return buildFocusedYouTubeForm.apply(null, arguments); },
  focused_lecdem:  function () { return buildFocusedLecdemForm.apply(null, arguments); },
  segment:         function () { return buildSegmentForm.apply(null, arguments); },
};

// ── Label resolution ─────────────────────────────────────────────────────────
// An id alone is not legibility: a row reading `tm_krishna` has not told the
// author what they changed. Resolve through the injected data, fall back to the id.

function _pcFind(list, id) {
  if (!Array.isArray(list) || !id) return null;
  return list.find(x => x && x.id === id) || null;
}

function _pcLabel(bucket, id) {
  if (!id) return '(no id)';
  const gd = (typeof graphData !== 'undefined' && graphData) ? graphData : {};
  let hit = null;
  switch (bucket) {
    case 'musicians':
    case 'composers':
    case 'edges':
      hit = _pcFind(gd.nodes, id) || _pcFind(gd.composers, id);
      return (hit && hit.label) || id;
    case 'ragas':
      hit = _pcFind(gd.ragas, id);
      return (hit && (hit.name || hit.label)) || id;
    case 'compositions':
      hit = _pcFind(gd.compositions, id);
      return (hit && (hit.title || hit.label)) || id;
    case 'recordings':
      hit = _pcFind(gd.recordings, id);
      return (hit && (hit.title || hit.label)) || id;
    case 'playlists':
      hit = (typeof playlists !== 'undefined') ? _pcFind(playlists, id) : null;
      return (hit && (hit.title || hit.label)) || id;
    case 'talas':
      hit = (typeof window.talaData !== 'undefined') ? _pcFind(window.talaData, id) : null;
      return (hit && (hit.label || hit.name)) || id;
    default:
      return id;
  }
}

// Resolve a youtube[<vid>] path segment to that entry's human label.
function _pcYoutubeEntryLabel(musicianId, vid) {
  const gd = (typeof graphData !== 'undefined' && graphData) ? graphData : {};
  const node = _pcFind(gd.nodes, musicianId);
  const list = (node && node.youtube) || [];
  const hit = list.find(e => e && typeof e.url === 'string' && e.url.indexOf(vid) !== -1);
  return (hit && hit.label) || vid;
}

function _pcTruncate(s, n) {
  s = String(s === null || s === undefined ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function _pcScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return v.length + (v.length === 1 ? ' item' : ' items');
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    return '{' + _pcTruncate(keys.join(', '), 48) + '}';
  }
  if (typeof v === 'string') return _pcTruncate(v, 72);
  return String(v);
}

// ── describeOp — ADR-171 §4 ──────────────────────────────────────────────────
// Op shapes are heterogeneous AND mutually inconsistent by history. Every known
// divergence is normalized here; the table of them is in ADR-171 §4.
//   • append addressing an array via `field:` instead of `array:` (hindustani_equivalents)
//   • annotate emitted flat as {op,id,text} as well as {op,id,note:{text}}
//   • patch carrying `fields:{}` (ADR-108) as well as legacy `field`/`value`
//   • the {op,value:{}} envelope, used by recordings and playlists alone
//   • path-addressed arrays: youtube[<vid>].segments, youtube[<vid>].subjects.<axis>
//   • edges keyed by (source,target) rather than id
//   • v1 musician items keyed by `type: 'new' | 'youtube_append'` with no `op`
//
// Returns { verb, entityId, title, detail, patchFields, unknown }.
// patchFields drives conflict detection (§8); `unknown` drives the raw-JSON row.
function describeOp(bucket, op) {
  const noun = PATCH_BUCKET_NOUN[bucket] || bucket;
  const fail = { verb: '?', entityId: null, title: 'unrecognised ' + noun + ' op',
                 detail: '', patchFields: [], unknown: true };
  if (!op || typeof op !== 'object') return fail;

  // v1 musician discriminator predates the `op` field entirely (ADR-083 §2c).
  let verb = op.op;
  if (!verb) verb = (op.type === 'youtube_append') ? 'append' : 'create';

  // The value-envelope is a create/upsert convention only. For append, `value` is
  // the appended element — unwrapping it there would mislabel the row.
  const body = ((verb === 'create' || verb === 'upsert') && op.value && typeof op.value === 'object')
    ? op.value : op;

  if (bucket === 'edges') return _pcDescribeEdge(verb, op);

  const entityId = op.id || op.musician_id || body.id || null;
  const who = _pcLabel(bucket, entityId);
  const arrow = ' → ';

  switch (verb) {
    case 'create':
    case 'upsert': {
      return {
        verb: verb, entityId: entityId,
        title: verb + ' ' + noun + arrow + (entityId || '(no id)'),
        detail: _pcCreateDetail(bucket, body),
        patchFields: ['*create*'], unknown: false,
      };
    }
    case 'patch': {
      // ADR-108 multi-field {fields:{}} and the legacy single {field,value}.
      const pairs = (op.fields && typeof op.fields === 'object')
        ? Object.keys(op.fields).map(k => [k, op.fields[k]])
        : (op.field !== undefined ? [[op.field, op.value]] : []);
      if (!pairs.length) return Object.assign({}, fail, { entityId: entityId });
      return {
        verb: 'patch', entityId: entityId,
        title: 'patch ' + noun + arrow + who,
        detail: pairs.map(kv => _pcFieldLabel(entityId, kv[0]) + ': ' + _pcScalar(kv[1])).join('  ·  '),
        patchFields: pairs.map(kv => kv[0]), unknown: false,
      };
    }
    case 'append': {
      // Three addressings in the wild:
      //   `array`  — the documented selector (ADR-097 §3)
      //   `field`  — the hindustani_equivalents divergence in entry_forms.js
      //   neither  — v1 `type: 'youtube_append'`, where the array is implied by
      //              the `youtube` key carrying the payload (ADR-083 §2c)
      const isV1Youtube = !op.array && !op.field && Array.isArray(op.youtube);
      const selector = op.array || op.field || (isV1Youtube ? 'youtube' : null);
      if (!selector) return Object.assign({}, fail, { entityId: entityId });
      const val = isV1Youtube ? op.youtube : op.value;
      const n = Array.isArray(val) ? val.length : 1;
      return {
        verb: 'append', entityId: entityId,
        title: 'append ' + _pcSelectorLabel(entityId, selector) + arrow + who,
        detail: (n > 1 ? n + ' entries · ' : '') + _pcAppendDetail(selector, val),
        patchFields: [], unknown: false,   // appends accumulate; they never collide
      };
    }
    case 'annotate': {
      // Two shapes in the wild: {note:{text,source_url}} and the flat {text,source_url}.
      const note = (op.note && typeof op.note === 'object') ? op.note : op;
      const text = note.text;
      if (!text) return Object.assign({}, fail, { entityId: entityId });
      return {
        verb: 'annotate', entityId: entityId,
        title: 'annotate ' + noun + arrow + who,
        detail: '“' + _pcTruncate(text, 90) + '”',
        patchFields: [], unknown: false,
      };
    }
    default:
      return Object.assign({}, fail, {
        entityId: entityId,
        title: 'unknown op ‘' + verb + '’ on ' + noun + arrow + (entityId || '?'),
      });
  }
}

function _pcDescribeEdge(verb, op) {
  const src = op.source, tgt = op.target;
  if (!src || !tgt) {
    return { verb: verb, entityId: null, title: 'unrecognised edge op',
             detail: '', patchFields: [], unknown: true };
  }
  const pair = _pcLabel('musicians', src) + ' → ' + _pcLabel('musicians', tgt);
  const entityId = src + '→' + tgt;
  if (verb === 'patch') {
    const pairs = (op.fields && typeof op.fields === 'object')
      ? Object.keys(op.fields).map(k => [k, op.fields[k]])
      : (op.field !== undefined ? [[op.field, op.value]] : []);
    return {
      verb: 'patch', entityId: entityId,
      title: 'patch edge → ' + pair,
      detail: pairs.map(kv => kv[0] + ': ' + _pcScalar(kv[1])).join('  ·  '),
      patchFields: pairs.map(kv => kv[0]), unknown: false,
    };
  }
  const bits = [];
  if (op.confidence !== undefined) bits.push('confidence: ' + op.confidence);
  if (op.note) bits.push(_pcTruncate(op.note, 60));
  return {
    verb: 'create', entityId: entityId,
    title: 'create edge → ' + pair,
    detail: bits.join('  ·  '), patchFields: ['*create*'], unknown: false,
  };
}

// A create row should read as the thing being created, not as a field dump.
function _pcCreateDetail(bucket, body) {
  const bits = [];
  const push = v => { if (v !== undefined && v !== null && v !== '') bits.push(v); };
  switch (bucket) {
    case 'musicians':
    case 'composers':
      push(body.label); push(body.instrument); push(body.era);
      push(body.born ? String(body.born) : null);
      if (Array.isArray(body.youtube) && body.youtube.length) {
        bits.push(body.youtube.length + ' youtube');
      }
      break;
    case 'ragas':
      push(body.name || body.label);
      push(body.melakarta ? 'mela ' + body.melakarta : null);
      push(body.is_melakarta ? 'melakarta' : null);
      push(body.tradition);
      break;
    case 'compositions':
      push(body.title); push(body.raga_id); push(body.tala); push(body.composer_id);
      break;
    case 'recordings':
      push(body.title); push(body.date || body.year); push(body.venue);
      if (Array.isArray(body.sessions)) bits.push(body.sessions.length + ' sessions');
      if (Array.isArray(body.segments)) bits.push(body.segments.length + ' segments');
      break;
    case 'playlists':
      push(body.title);
      if (Array.isArray(body.items)) bits.push(body.items.length + ' items');
      break;
    case 'talas':
      push(body.label);
      break;
    default:
      push(body.label || body.title || body.name);
  }
  return bits.filter(Boolean).map(String).join('  ·  ');
}

// youtube[<vid>].segments → "segment (on <entry label>)"
function _pcSelectorLabel(entityId, selector) {
  const m = /^youtube\[([A-Za-z0-9_-]{11})\]\.(.+)$/.exec(selector);
  if (m) {
    const leaf = m[2].replace(/^subjects\./, '');
    return leaf + ' on “' + _pcTruncate(_pcYoutubeEntryLabel(entityId, m[1]), 44) + '”';
  }
  const s = /^sessions\[(\d+)\]\.(.+)$/.exec(selector);
  if (s) return s[2] + ' (session ' + s[1] + ')';
  return selector;
}

function _pcAppendDetail(selector, val) {
  const one = Array.isArray(val) ? val[0] : val;
  if (one === null || one === undefined) return '';
  if (typeof one !== 'object') return _pcScalar(one);
  if (one.label) return '“' + _pcTruncate(one.label, 72) + '”';
  if (one.url) return _pcTruncate(one.url, 72);
  if (one.musician_id) return one.musician_id + (one.role ? ' · ' + one.role : '');
  if (one.title) return '“' + _pcTruncate(one.title, 72) + '”';
  if (one.at || one.at_offset_seconds !== undefined) {
    return String(one.at || one.at_offset_seconds) + (one.composition_id ? ' · ' + one.composition_id : '');
  }
  return _pcScalar(one);
}

// youtube[<vid>].label reads better as the entry it targets than as a raw path.
function _pcFieldLabel(entityId, field) {
  const m = /^youtube\[([A-Za-z0-9_-]{11})\]\.(.+)$/.exec(String(field));
  if (!m) return field;
  return m[2] + ' on “' + _pcTruncate(_pcYoutubeEntryLabel(entityId, m[1]), 36) + '”';
}

// ── Rows: one authored act, not one op ───────────────────────────────────────
// Ops sharing a groupId were emitted by a single submit (musician node + its guru
// edges; raga dual-emission). Presenting them as separate rows would misreport the
// author's intent and make correct removal their problem.
function patchRows() {
  const rows = [];
  const byGroup = new Map();
  PATCH_BUCKET_ORDER.forEach(bucket => {
    const arr = baniBundle[bucket] || [];
    arr.forEach((op, index) => {
      const meta = (typeof _patchMetaOf === 'function') ? _patchMetaOf(op) : null;
      const groupId = (meta && meta.groupId) || null;
      const desc = describeOp(bucket, op);
      if (groupId && byGroup.has(groupId)) {
        const row = byGroup.get(groupId);
        row.ops.push({ bucket: bucket, index: index, op: op, desc: desc });
        // A group's row is titled by its first op; extra buckets are summarised.
        if (row.extraBuckets.indexOf(bucket) === -1 && bucket !== row.bucket) {
          row.extraBuckets.push(bucket);
        }
        return;
      }
      const row = {
        groupId: groupId, bucket: bucket, meta: meta, desc: desc,
        ops: [{ bucket: bucket, index: index, op: op, desc: desc }],
        extraBuckets: [],
      };
      if (groupId) byGroup.set(groupId, row);
      rows.push(row);
    });
  });
  _pcMarkConflicts(rows);
  return rows;
}

// ── Conflict detection — ADR-171 §8, advisory only ───────────────────────────
// Only `patch` and `create` can collide. Two appends both apply, so flagging them
// would be noise. bani-add applies patches in order and last wins; a duplicate
// create is SKIPped by the writer. The cart reports, it does not resolve.
function _pcMarkConflicts(rows) {
  const seen = new Map();
  rows.forEach(row => {
    row.ops.forEach(entry => {
      const d = entry.desc;
      if (!d.entityId || !d.patchFields.length) return;
      d.patchFields.forEach(f => {
        const key = entry.bucket + '|' + d.entityId + '|' + f;
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key).push(row);
      });
    });
  });
  seen.forEach((group, key) => {
    if (group.length < 2) return;
    const field = key.split('|').pop();
    group.forEach(row => {
      row.conflict = (field === '*create*')
        ? 'duplicate create — the writer will skip all but the first'
        : 'also patched by another op — last one wins';
    });
  });
}

// ── Persistence — ADR-171 §9 ─────────────────────────────────────────────────
// meta is stored SEPARATELY, keyed by (bucket, index), precisely because
// _patchOpId is non-enumerable and cannot survive serialization (§1). On restore
// the arrays are walked, fresh opIds minted, and meta re-attached positionally.

const _PATCH_LS_KEY = 'baniPatch.v1';
const _PATCH_LS_VERSION = 1;
let _patchRestoredAt = null;
let _patchDownloaded = false;

function _patchPersist() {
  try {
    if (patchOpCount() === 0) { localStorage.removeItem(_PATCH_LS_KEY); return; }
    const meta = [];
    Object.keys(baniBundle).forEach(bucket => {
      baniBundle[bucket].forEach((op, index) => {
        const m = _patchMetaOf(op);
        if (!m) return;
        meta.push({
          bucket: bucket, index: index, groupId: m.groupId || null,
          label: m.label || null, reopen: m.reopen || null,
        });
      });
    });
    localStorage.setItem(_PATCH_LS_KEY, JSON.stringify({
      version: _PATCH_LS_VERSION,
      saved_at: new Date().toISOString(),
      items: baniBundle,
      meta: meta,
    }));
  } catch (e) { /* quota or private mode — losing the autosave is not fatal */ }
}

function _patchRestore() {
  let raw = null;
  try { raw = localStorage.getItem(_PATCH_LS_KEY); } catch (e) { return 0; }
  if (!raw) return 0;
  let saved = null;
  try { saved = JSON.parse(raw); } catch (e) { _patchDiscardSaved(); return 0; }
  // Never partially parse a version we do not recognise.
  if (!saved || saved.version !== _PATCH_LS_VERSION || !saved.items) {
    _patchDiscardSaved();
    return 0;
  }
  let restored = 0;
  Object.keys(baniBundle).forEach(bucket => {
    const arr = saved.items[bucket];
    if (Array.isArray(arr)) { baniBundle[bucket] = arr; restored += arr.length; }
  });
  // Re-attach meta positionally, then mint identity for everything.
  const metaAt = new Map();
  (saved.meta || []).forEach(m => { metaAt.set(m.bucket + '|' + m.index, m); });
  const groupRemap = new Map();
  Object.keys(baniBundle).forEach(bucket => {
    baniBundle[bucket].forEach((op, index) => {
      const m = metaAt.get(bucket + '|' + index);
      let groupId = null;
      if (m && m.groupId) {
        if (!groupRemap.has(m.groupId)) groupRemap.set(m.groupId, _patchGroupBegin());
        groupId = groupRemap.get(m.groupId);
      } else {
        groupId = _patchGroupBegin();
      }
      _patchTagOp(op, bucket, groupId, m ? { label: m.label, reopen: m.reopen } : null);
    });
  });
  _patchGroupEnd();
  _patchRestoredAt = saved.saved_at || null;
  _updateBundleBtn();
  return restored;
}

function _patchDiscardSaved() {
  try { localStorage.removeItem(_PATCH_LS_KEY); } catch (e) {}
}

function _patchMarkDownloaded() {
  _patchDownloaded = true;
  _patchCartRefresh();
}

// ── Restore notice ───────────────────────────────────────────────────────────
// Staged ops are never silently resurrected: a stale patch quietly restored and
// then downloaded into a later session is a worse failure than losing it.
function _patchShowRestoreNotice(count) {
  if (window.innerWidth < 768) return;   // patch surface is desktop-only
  const bar = document.createElement('div');
  bar.className = 'pc-notice';
  bar.id = 'pc-restore-notice';

  const txt = document.createElement('span');
  const when = _patchRestoredAt ? new Date(_patchRestoredAt).toLocaleString() : 'an earlier session';
  txt.textContent = 'Restored ' + count + ' staged op' + (count === 1 ? '' : 's') + ' from ' + when;
  bar.appendChild(txt);

  const review = document.createElement('button');
  review.className = 'pc-notice-btn';
  review.textContent = 'Review';
  review.addEventListener('click', () => { bar.remove(); openPatchCart(); });
  bar.appendChild(review);

  const discard = document.createElement('button');
  discard.className = 'pc-notice-btn';
  discard.textContent = 'Discard';
  discard.addEventListener('click', () => { bar.remove(); clearBundle(); });
  bar.appendChild(discard);

  const dismiss = document.createElement('button');
  dismiss.className = 'pc-notice-btn pc-notice-dismiss';
  dismiss.title = 'Keep the ops, hide this notice';
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => bar.remove());
  bar.appendChild(dismiss);

  document.body.appendChild(bar);
}

// ── The cart window — ADR-171 §7 ─────────────────────────────────────────────

let _patchCartWin = null;

function openPatchCart() {
  if (_patchCartWin && document.body.contains(_patchCartWin)) {
    topZ += 1;
    _patchCartWin.style.zIndex = topZ;
    _patchCartRender();
    return _patchCartWin;
  }
  const win = createEntryWindow('Patch');   // returns null below 768px
  if (!win) return null;
  win.classList.add('patch-cart');
  _patchCartWin = win;
  const closeBtn = win.querySelector('.ew-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { _patchCartWin = null; });
  _patchCartRender();
  return win;
}

// Called by _updateBundleBtn() on every mutation. The body is rebuilt wholesale —
// incremental DOM patching against a reordering list is not worth the bug surface.
function _patchCartRefresh() {
  if (_patchCartWin && document.body.contains(_patchCartWin)) _patchCartRender();
}

function _patchCartRender() {
  const win = _patchCartWin;
  if (!win) return;
  const rows = patchRows();
  const total = patchOpCount();

  const title = win.querySelector('.ew-title');
  if (title) title.textContent = 'Patch — ' + total + ' op' + (total === 1 ? '' : 's');

  const body = win.querySelector('.ew-body');
  body.innerHTML = '';

  if (_patchDownloaded && total > 0) {
    const banner = document.createElement('div');
    banner.className = 'pc-banner';
    banner.innerHTML = 'Downloaded. Apply with <code>bani-add ' + PATCH_FILENAME
      + '</code>, then <code>bani-render</code>. The staged ops are kept until you clear them '
      + '— <code>bani-add</code> may still fail.';
    body.appendChild(banner);
  }

  if (!total) {
    const empty = document.createElement('p');
    empty.className = 'pc-empty';
    empty.textContent = 'Nothing staged yet. Edits made through the entry forms collect here.';
    body.appendChild(empty);
  }

  PATCH_BUCKET_ORDER.forEach(bucket => {
    const bucketRows = rows.filter(r => r.bucket === bucket);
    if (!bucketRows.length) return;
    const opCount = bucketRows.reduce((s, r) => s + r.ops.length, 0);

    const sec = document.createElement('div');
    sec.className = 'pc-section';
    const head = document.createElement('div');
    head.className = 'pc-section-head';
    head.textContent = bucket + ' (' + opCount + ')';
    sec.appendChild(head);
    bucketRows.forEach(row => sec.appendChild(_pcBuildRow(row)));
    body.appendChild(sec);
  });

  _pcBuildFooter(win, total);
}

function _pcBuildRow(row) {
  const el = document.createElement('div');
  el.className = 'pc-row';
  if (row.desc.unknown) el.classList.add('pc-row-unknown');

  const main = document.createElement('div');
  main.className = 'pc-row-main';

  const title = document.createElement('span');
  title.className = 'pc-row-title';
  title.textContent = row.desc.title;
  main.appendChild(title);

  if (row.ops.length > 1) {
    const badge = document.createElement('span');
    badge.className = 'pc-badge pc-badge-group';
    // Name the other buckets inline rather than only in a tooltip: a group row
    // sits in one section but its ops are counted there too, so a reader needs to
    // see that some of them belong elsewhere.
    const extra = row.extraBuckets.length ? ' +' + row.extraBuckets.join('/') : '';
    badge.textContent = '⚭' + row.ops.length + extra;
    badge.title = 'One submit staged ' + row.ops.length + ' ops'
      + (row.extraBuckets.length ? ', including ' + row.extraBuckets.join(' and ') : '')
      + '. Editing or removing this row acts on all of them.';
    main.appendChild(badge);
  }

  if (row.conflict) {
    const warn = document.createElement('span');
    warn.className = 'pc-badge pc-badge-conflict';
    warn.textContent = '⚠';
    warn.title = row.conflict;
    main.appendChild(warn);
  }

  const spacer = document.createElement('span');
  spacer.className = 'pc-row-spacer';
  main.appendChild(spacer);

  const editBtn = document.createElement('button');
  editBtn.className = 'pc-row-btn';
  editBtn.type = 'button';
  editBtn.textContent = '✎';
  const reopen = row.meta && row.meta.reopen;
  editBtn.title = reopen ? 'Edit — reopens the form that staged this'
                         : 'Edit the staged JSON';
  editBtn.addEventListener('click', () => _pcEditRow(row, el));
  main.appendChild(editBtn);

  const rmBtn = document.createElement('button');
  rmBtn.className = 'pc-row-btn pc-row-btn-remove';
  rmBtn.type = 'button';
  rmBtn.textContent = '✕';
  // ADR-085 §6: this removes a staged intention, never stored data.
  rmBtn.title = row.ops.length > 1
    ? 'Remove all ' + row.ops.length + ' ops of this row from the patch'
    : 'Remove from patch';
  rmBtn.addEventListener('click', () => _pcRemoveRow(row));
  main.appendChild(rmBtn);

  el.appendChild(main);

  const detailText = row.desc.detail || (row.meta && row.meta.label) || '';
  if (detailText) {
    const detail = document.createElement('div');
    detail.className = 'pc-row-detail';
    detail.textContent = detailText;
    el.appendChild(detail);
  }

  if (row.conflict) {
    const cw = document.createElement('div');
    cw.className = 'pc-row-conflict';
    cw.textContent = row.conflict;
    el.appendChild(cw);
  }

  // An op describeOp cannot classify shows its JSON rather than an empty row —
  // reporting absence where there is content would be worse than the status quo.
  if (row.desc.unknown) {
    const pre = document.createElement('pre');
    pre.className = 'ef-preview-pre pc-row-json';
    try { pre.textContent = JSON.stringify(row.ops[0].op, null, 2); }
    catch (e) { pre.textContent = String(row.ops[0].op); }
    el.appendChild(pre);
  }

  return el;
}

function _pcRemoveRow(row) {
  if (row.groupId) { removeFromBundle(row.groupId); return; }
  // No identity (a frozen op) — fall back to removing by position.
  const entry = row.ops[0];
  const arr = baniBundle[entry.bucket];
  const at = arr.indexOf(entry.op);
  if (at !== -1) arr.splice(at, 1);
  _patchPersist();
  _updateBundleBtn();
}

// ── Editing a row — ADR-171 §5 ───────────────────────────────────────────────

function _pcEditRow(row, rowEl) {
  const reopen = row.meta && row.meta.reopen;
  if (reopen && row.groupId && PATCH_REOPEN_FORMS[reopen.form]) {
    _pcReopenForm(row.groupId, reopen);
    return;
  }
  _pcEditJson(row, rowEl);
}

function _pcReopenForm(groupId, reopen) {
  _patchStagingBegin(groupId);
  let win = null;
  try {
    win = PATCH_REOPEN_FORMS[reopen.form].apply(null, reopen.args || []);
  } catch (e) {
    _patchStagingEnd();
    throw e;
  }
  if (!win) { _patchStagingEnd(); return; }

  // The token must not outlive the form: a leak would silently turn the next
  // staged op anywhere in the app into a replacement.
  const release = () => {
    if (window._patchStagingTarget === groupId) _patchStagingEnd();
  };
  const closeBtn = win.querySelector ? win.querySelector('.ew-close') : null;
  if (closeBtn) closeBtn.addEventListener('click', release);
  const obs = new MutationObserver(() => {
    if (!document.body.contains(win)) { release(); obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

// Universal fallback — total coverage from day one, so descriptor rollout is an
// enhancement rather than a precondition (ADR-171 §5).
function _pcEditJson(row, rowEl) {
  if (rowEl.querySelector('.pc-json-editor')) return;
  const entry = row.ops[0];

  const wrap = document.createElement('div');
  wrap.className = 'pc-json-editor';

  if (row.ops.length > 1) {
    const note = document.createElement('div');
    note.className = 'pc-json-note';
    note.textContent = 'This row staged ' + row.ops.length
      + ' ops; only the first is editable here. Remove and re-stage to change the rest.';
    wrap.appendChild(note);
  }

  const ta = document.createElement('textarea');
  ta.className = 'pc-json-input';
  ta.spellcheck = false;
  try { ta.value = JSON.stringify(entry.op, null, 2); }
  catch (e) { ta.value = String(entry.op); }
  wrap.appendChild(ta);

  const msg = document.createElement('div');
  msg.className = 'pc-json-msg';
  wrap.appendChild(msg);

  const bar = document.createElement('div');
  bar.className = 'pc-json-bar';

  const save = document.createElement('button');
  save.className = 'ef-download-btn';
  save.type = 'button';
  save.textContent = 'Save op';

  const cancel = document.createElement('button');
  cancel.className = 'ef-preview-btn';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => wrap.remove());

  const validate = () => {
    let parsed = null;
    try { parsed = JSON.parse(ta.value); }
    catch (e) {
      msg.textContent = 'Invalid JSON: ' + e.message;
      msg.className = 'pc-json-msg pc-json-msg-bad';
      save.disabled = true;
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      msg.textContent = 'An op must be a JSON object.';
      msg.className = 'pc-json-msg pc-json-msg-bad';
      save.disabled = true;
      return null;
    }
    const verb = parsed.op;
    const known = ['create', 'upsert', 'patch', 'append', 'annotate'];
    if (verb !== undefined && known.indexOf(verb) === -1) {
      msg.textContent = 'Unknown op ‘' + verb + '’. Known: ' + known.join(', ') + '.';
      msg.className = 'pc-json-msg pc-json-msg-bad';
      save.disabled = true;
      return null;
    }
    const d = describeOp(entry.bucket, parsed);
    msg.textContent = d.unknown ? '⚠ Parses, but the shape is unrecognised.' : '✓ ' + d.title;
    msg.className = 'pc-json-msg' + (d.unknown ? ' pc-json-msg-warn' : ' pc-json-msg-ok');
    save.disabled = false;
    return parsed;
  };

  save.addEventListener('click', () => {
    const parsed = validate();
    if (!parsed) return;
    // Replace in place — bucket-internal order is contractual (ADR-143).
    const arr = baniBundle[entry.bucket];
    const at = arr.indexOf(entry.op);
    const meta = row.meta ? { label: row.meta.label, reopen: row.meta.reopen } : null;
    _patchTagOp(parsed, entry.bucket, row.groupId || _patchGroupBegin(), meta);
    _patchGroupEnd();
    if (at === -1) arr.push(parsed); else arr.splice(at, 1, parsed);
    const oldId = _patchOpIdOf(entry.op);
    if (oldId) _patchMeta.delete(oldId);
    _patchPersist();
    _updateBundleBtn();
  });

  ta.addEventListener('input', validate);
  bar.appendChild(save);
  bar.appendChild(cancel);
  wrap.appendChild(bar);
  rowEl.appendChild(wrap);
  validate();
  ta.focus();
}

// ── Footer ───────────────────────────────────────────────────────────────────

function _pcBuildFooter(win, total) {
  const footer = win.querySelector('.ew-footer');
  footer.innerHTML = '';

  const dl = document.createElement('button');
  dl.className = 'ef-download-btn';
  dl.type = 'button';
  dl.textContent = '⬇ Download patch';
  dl.disabled = total === 0;
  dl.addEventListener('click', () => downloadBundle());
  footer.appendChild(dl);

  const clear = document.createElement('button');
  clear.className = 'ef-preview-btn';
  clear.type = 'button';
  clear.textContent = 'Clear all';
  clear.disabled = total === 0;
  clear.title = 'Discard every staged op. Does not touch stored data.';
  clear.addEventListener('click', () => {
    if (clear.dataset.armed !== '1') {
      clear.dataset.armed = '1';
      clear.textContent = 'Clear ' + total + ' ops?';
      setTimeout(() => {
        if (!clear.isConnected) return;
        clear.dataset.armed = '';
        clear.textContent = 'Clear all';
      }, 3000);
      return;
    }
    clearBundle();
    _patchDownloaded = false;
    _patchDiscardSaved();
  });
  footer.appendChild(clear);

  const spacer = document.createElement('span');
  spacer.className = 'pc-row-spacer';
  footer.appendChild(spacer);

  const close = document.createElement('button');
  close.className = 'ef-preview-btn';
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => { win.remove(); _patchCartWin = null; });
  footer.appendChild(close);

  const hint = document.createElement('div');
  hint.className = 'pc-footer-hint';
  hint.innerHTML = 'Then run <code>bani-add ' + PATCH_FILENAME + '</code> and <code>bani-render</code>.';
  footer.appendChild(hint);
}

// ── Boot ─────────────────────────────────────────────────────────────────────

(function _patchCartInit() {
  const restored = _patchRestore();
  if (restored > 0) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => _patchShowRestoreNotice(restored));
    } else {
      _patchShowRestoreNotice(restored);
    }
  }
  window.addEventListener('beforeunload', e => {
    if (patchOpCount() === 0 || _patchDownloaded) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_patchCartWin) return;
    if (!document.body.contains(_patchCartWin)) { _patchCartWin = null; return; }
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
    _patchCartWin.remove();
    _patchCartWin = null;
  });
})();

window.openPatchCart = openPatchCart;
window.describeOp = describeOp;
window.patchRows = patchRows;
