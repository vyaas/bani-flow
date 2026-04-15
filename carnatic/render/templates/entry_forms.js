// ── ADR-031: Data Entry Forms — In-Browser JSON Generator ─────────────────────
// Depends on: graphData (injected by render pipeline), nextSpawnPosition(),
//             wireDrag(), topZ (from media_player.js)

// ── Utility functions ─────────────────────────────────────────────────────────

function toSnakeCase(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

function timestampToSeconds(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function extractVideoId(url) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function efInput(id, type, placeholder, value) {
  const el = document.createElement('input');
  el.type = type || 'text';
  el.className = 'ef-input';
  if (id) el.id = id;
  if (placeholder) el.placeholder = placeholder;
  if (value !== undefined && value !== null) el.value = value;
  return el;
}

function efSelect(id, options, includeNone) {
  const el = document.createElement('select');
  el.className = 'ef-select';
  if (id) el.id = id;
  if (includeNone !== false) {
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— none —';
    el.appendChild(none);
  }
  for (const opt of options) {
    const o = document.createElement('option');
    o.value   = (opt && opt.value !== undefined) ? opt.value : opt;
    o.textContent = (opt && opt.label !== undefined) ? opt.label : opt;
    el.appendChild(o);
  }
  return el;
}

function efRow(labelText, required, hint, inputEl, showIf) {
  const row = document.createElement('div');
  row.className = 'ef-row';
  if (showIf) row.dataset.showIf = showIf;

  const lbl = document.createElement('label');
  lbl.className = 'ef-label';
  lbl.textContent = labelText;
  if (required) {
    const star = document.createElement('span');
    star.className = 'ef-required';
    star.textContent = ' *';
    lbl.appendChild(star);
  }
  if (hint) {
    const h = document.createElement('span');
    h.className = 'ef-hint';
    h.textContent = hint;
    lbl.appendChild(h);
  }
  row.appendChild(lbl);
  row.appendChild(inputEl);
  return row;
}

function efSection(title) {
  const d = document.createElement('div');
  d.className = 'ef-section';
  d.textContent = title;
  return d;
}

function efAddBtn(label) {
  const b = document.createElement('button');
  b.className = 'ef-add-btn';
  b.type = 'button';
  b.textContent = label;
  return b;
}

// ── Composition → Raga/Composer auto-fill ────────────────────────────────────
// When a composition is selected, auto-populate the raga (and optionally
// composer) selects from graphData.compositions. Only fills if the target
// select is currently blank (— none —) so the user can still override.

function wireCompRagaAutofill(compSel, ragaSel, composerSel, formWin) {
  compSel.addEventListener('change', () => {
    const compId = compSel.value;
    if (!compId) return;
    const comp = (graphData.compositions || []).find(c => c.id === compId);
    if (!comp) return;

    if (ragaSel && comp.raga_id) {
      ragaSel.value = comp.raga_id;
    }
    if (composerSel && comp.composer_id) {
      composerSel.value = comp.composer_id;
    }
    if (formWin) formWin.dispatchEvent(new Event('change'));
  });
}

// ── ID auto-derivation row ────────────────────────────────────────────────────

function efIdRow(idInputId, sourceInputId, existingIds) {
  const wrap = document.createElement('div');
  wrap.className = 'ef-row';

  const lbl = document.createElement('label');
  lbl.className = 'ef-label';
  lbl.textContent = 'ID';
  const star = document.createElement('span');
  star.className = 'ef-required';
  star.textContent = ' *';
  lbl.appendChild(star);
  wrap.appendChild(lbl);

  const row = document.createElement('div');
  row.className = 'ef-id-row';

  const inp = efInput(idInputId, 'text', 'auto-derived');
  inp.readOnly = true;
  inp.className += ' ef-readonly';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'ef-id-edit-btn';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => {
    inp.readOnly = !inp.readOnly;
    inp.className = inp.readOnly ? 'ef-input ef-readonly' : 'ef-input';
    editBtn.textContent = inp.readOnly ? 'Edit' : 'Lock';
    inp.focus();
  });

  row.appendChild(inp);
  row.appendChild(editBtn);
  wrap.appendChild(row);

  const warn = document.createElement('div');
  warn.style.cssText = 'font-size:0.65rem;color:var(--accent-danger);margin-top:2px;display:none';
  warn.textContent = '⚠ This ID already exists in the graph.';
  wrap.appendChild(warn);

  function updateId() {
    if (!inp.readOnly) return;
    const src = document.getElementById(sourceInputId);
    if (!src) return;
    const derived = toSnakeCase(src.value);
    inp.value = derived;
    const dup = existingIds && existingIds.includes(derived);
    inp.classList.toggle('ef-error', dup);
    warn.style.display = dup ? '' : 'none';
  }

  wrap._updateId = updateId;
  wrap._idInput  = inp;
  wrap._idWarn   = warn;
  wrap._existingIds = existingIds;

  inp.addEventListener('input', () => {
    const dup = existingIds && existingIds.includes(inp.value);
    inp.classList.toggle('ef-error', dup);
    warn.style.display = dup ? '' : 'none';
  });

  return wrap;
}

// ── Source fields (url / label / type) ───────────────────────────────────────

function efSourceFields(prefix, defaults) {
  const d = defaults || {};
  const frag = document.createDocumentFragment();

  const urlInp = efInput(prefix + '_source_url', 'text', 'https://en.wikipedia.org/wiki/…');
  if (d.url) urlInp.value = d.url;
  frag.appendChild(efRow('Source URL', true, null, urlInp));

  const lblInp = efInput(prefix + '_source_label', 'text', 'Wikipedia');
  if (d.label) lblInp.value = d.label;
  frag.appendChild(efRow('Source Label', true, null, lblInp));

  const typeOpts = ['wikipedia', 'pdf', 'article', 'archive', 'other'];
  const typeSel = efSelect(prefix + '_source_type', typeOpts, false);
  if (d.type) typeSel.value = d.type;
  frag.appendChild(efRow('Source Type', true, null, typeSel));

  return frag;
}

// ── Entry window factory ──────────────────────────────────────────────────────

function createEntryWindow(title) {
  const win = document.createElement('div');
  win.className = 'entry-window';

  const pos = nextSpawnPosition();
  win.style.top    = pos.top  + 'px';
  win.style.left   = pos.left + 'px';
  topZ += 1;
  win.style.zIndex = topZ;

  const bar = document.createElement('div');
  bar.className = 'ew-bar';

  const titleEl = document.createElement('span');
  titleEl.className = 'ew-title';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ew-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => win.remove());

  bar.appendChild(titleEl);
  bar.appendChild(closeBtn);
  win.appendChild(bar);

  const body = document.createElement('div');
  body.className = 'ew-body';
  win.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'ew-footer';
  win.appendChild(footer);

  wireDrag(win, bar);

  win.addEventListener('mousedown', () => {
    topZ += 1;
    win.style.zIndex = topZ;
  });

  const container = document.getElementById('cy-wrap') || document.body;
  container.appendChild(win);

  return win;
}

// ── openEntryForm — public entry point ────────────────────────────────────────

function openEntryForm(type) {
  switch (type) {
    case 'musician':    buildMusicianForm();    break;
    case 'raga':        buildRagaForm();        break;
    case 'composition': buildCompositionForm(); break;
    case 'recording':   buildRecordingForm();   break;
    case 'youtube':     buildAddYoutubeForm();  break;
  }
}

// ── Musician form ─────────────────────────────────────────────────────────────

function buildMusicianForm() {
  const win = createEntryWindow('Add Musician');
  const body = win.querySelector('.ew-body');

  const existingIds = (graphData.nodes || []).map(n => n.id);

  // ── Section A: Node fields ────────────────────────────────────────────────
  body.appendChild(efSection('Node Fields'));

  const labelInp = efInput('ef_mus_label', 'text', 'e.g. Semmangudi Srinivasa Iyer', null);
  body.appendChild(efRow('Display Name', true, null, labelInp));

  const idRow = efIdRow('ef_mus_id', 'ef_mus_label', existingIds);
  body.appendChild(idRow);
  labelInp.addEventListener('input', idRow._updateId);

  const bornInp = efInput('ef_mus_born', 'number', 'e.g. 1908', null);
  bornInp.min = 1600; bornInp.max = 2030;
  body.appendChild(efRow('Born (year)', false, null, bornInp));

  const diedInp = efInput('ef_mus_died', 'number', 'leave blank if living', null);
  diedInp.min = 1600; diedInp.max = 2030;
  body.appendChild(efRow('Died (year)', false, null, diedInp));

  const eraOpts = ['trinity', 'bridge', 'golden_age', 'disseminator', 'living_pillars', 'contemporary'];
  const eraSel = efSelect('ef_mus_era', eraOpts, false);
  body.appendChild(efRow('Era', true, null, eraSel));

  const instrOpts = ['vocal', 'veena', 'violin', 'flute', 'mridangam', 'bharatanatyam', 'ghatam', 'other'];
  const instrSel = efSelect('ef_mus_instr', instrOpts, false);
  body.appendChild(efRow('Instrument', true, null, instrSel));

  const baniInp = efInput('ef_mus_bani', 'text', 'e.g. semmangudi', null);
  body.appendChild(efRow('Bani / Gharana', false, null, baniInp));

  body.appendChild(efSourceFields('ef_mus'));

  // ── Section B: YouTube entries ────────────────────────────────────────────
  body.appendChild(efSection('YouTube Entries'));

  const ytContainer = document.createElement('div');
  ytContainer.id = 'ef_mus_youtube';
  body.appendChild(ytContainer);

  const addYtBtn = efAddBtn('+ Add YouTube Entry');
  body.appendChild(addYtBtn);
  addYtBtn.addEventListener('click', () => addYoutubeBlock(ytContainer, win));

  // ── Section C: Guru-Shishya edges ─────────────────────────────────────────
  body.appendChild(efSection('Guru-Shishya Edges'));

  const edgesContainer = document.createElement('div');
  edgesContainer.id = 'ef_mus_edges';
  body.appendChild(edgesContainer);

  const addGuruBtn = efAddBtn('+ Add Guru (this musician is shishya of…)');
  body.appendChild(addGuruBtn);
  addGuruBtn.addEventListener('click', () => addEdgeBlock(edgesContainer, 'guru', win));

  const addShishyaBtn = efAddBtn('+ Add Shishya (this musician is guru of…)');
  body.appendChild(addShishyaBtn);
  addShishyaBtn.addEventListener('click', () => addEdgeBlock(edgesContainer, 'shishya', win));

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = win.querySelector('.ew-footer');
  const dlBtn = document.createElement('button');
  dlBtn.className = 'ef-download-btn';
  dlBtn.textContent = '⬇ Download JSON';
  dlBtn.disabled = true;

  const previewBtn = document.createElement('button');
  previewBtn.className = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(dlBtn);
  footer.appendChild(previewBtn);

  function validate() {
    const label   = labelInp.value.trim();
    const id      = idRow._idInput.value.trim();
    const era     = eraSel.value;
    const instr   = instrSel.value;
    const srcUrl  = win.querySelector('#ef_mus_source_url')   ? win.querySelector('#ef_mus_source_url').value.trim()   : '';
    const srcLbl  = win.querySelector('#ef_mus_source_label') ? win.querySelector('#ef_mus_source_label').value.trim() : '';
    const srcType = win.querySelector('#ef_mus_source_type')  ? win.querySelector('#ef_mus_source_type').value         : '';
    const dupId   = existingIds.includes(id);
    const ok = label && id && era && instr && srcUrl && srcLbl && srcType && !dupId;
    dlBtn.disabled = !ok;
    if (previewPre.style.display !== 'none') updatePreview();
  }

  function updatePreview() {
    try {
      const { nodeJson } = generateMusicianJson(win);
      previewPre.textContent = JSON.stringify(nodeJson, null, 2);
    } catch(e) { previewPre.textContent = '(incomplete)'; }
  }

  win.addEventListener('input', validate);
  win.addEventListener('change', validate);

  previewBtn.addEventListener('click', () => {
    const open = previewPre.style.display !== 'none';
    previewPre.style.display = open ? 'none' : 'block';
    previewBtn.textContent = open ? 'Preview JSON' : 'Hide Preview';
    if (!open) updatePreview();
  });

  dlBtn.addEventListener('click', () => {
    const { nodeJson, edgesJson } = generateMusicianJson(win);
    const id = nodeJson.id;
    downloadJson(id + '.json', nodeJson);
    if (edgesJson) {
      setTimeout(() => downloadJson('_edges.json', edgesJson), 300);
    }
    showMusicianSuccess(win, id, !!edgesJson);
  });

  return win;
}

// ── YouTube entry block ───────────────────────────────────────────────────────

function addYoutubeBlock(container, formWin) {
  const block = document.createElement('div');
  block.className = 'ef-repeat-block ef-youtube-block';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ef-repeat-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    block.remove();
    formWin.dispatchEvent(new Event('input'));
  });
  block.appendChild(removeBtn);

  const urlInp = efInput(null, 'text', 'https://youtu.be/…');
  block.appendChild(efRow('YouTube URL', true, null, urlInp));

  const lblInp = efInput(null, 'text', 'e.g. nidhi chāla sukhama · Kalyāṇi · Ādi');
  block.appendChild(efRow('Label', true, null, lblInp));

  const compOpts = (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id }));
  const compSel = efSelect(null, compOpts, true);
  block.appendChild(efRow('Composition', false, null, compSel));

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const ragaSel = efSelect(null, ragaOpts, true);
  block.appendChild(efRow('Raga', false, 'auto-filled from composition', ragaSel));

  // Auto-fill raga when composition is selected
  wireCompRagaAutofill(compSel, ragaSel, null, formWin);

  const yearInp = efInput(null, 'number', 'e.g. 1965', null);
  yearInp.min = 1900; yearInp.max = 2030;
  block.appendChild(efRow('Year', false, null, yearInp));

  const versionInp = efInput(null, 'text', 'e.g. live, studio, 1965 version', null);
  block.appendChild(efRow('Version', false, null, versionInp));

  container.appendChild(block);
  formWin.dispatchEvent(new Event('input'));
}

// ── Edge block (repeating) ────────────────────────────────────────────────────

function addEdgeBlock(container, direction, formWin) {
  const block = document.createElement('div');
  block.className = 'ef-repeat-block';
  block.dataset.direction = direction;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ef-repeat-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    block.remove();
    formWin.dispatchEvent(new Event('input'));
  });
  block.appendChild(removeBtn);

  const dirLabel = direction === 'guru'
    ? 'Guru (this musician is shishya of)'
    : 'Shishya (this musician is guru of)';

  const nodeOpts = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
  const nodeSel = efSelect(null, nodeOpts, true);
  block.appendChild(efRow(dirLabel, true, null, nodeSel));

  const confInp = efInput(null, 'number', '0.90', '0.90');
  confInp.min = '0'; confInp.max = '1'; confInp.step = '0.01';
  block.appendChild(efRow('Confidence', true, '0.0–1.0', confInp));

  const srcInp = efInput(null, 'text', 'https://…');
  block.appendChild(efRow('Source URL', true, null, srcInp));

  const noteInp = efInput(null, 'text', 'e.g. principal guru');
  block.appendChild(efRow('Note', false, null, noteInp));

  container.appendChild(block);
  formWin.dispatchEvent(new Event('input'));
}

// ── generateMusicianJson ──────────────────────────────────────────────────────

function generateMusicianJson(win) {
  const id      = win.querySelector('#ef_mus_id')           ? win.querySelector('#ef_mus_id').value.trim()           : '';
  const label   = win.querySelector('#ef_mus_label')        ? win.querySelector('#ef_mus_label').value.trim()        : '';
  const born    = win.querySelector('#ef_mus_born')         ? win.querySelector('#ef_mus_born').value                : '';
  const died    = win.querySelector('#ef_mus_died')         ? win.querySelector('#ef_mus_died').value                : '';
  const era     = win.querySelector('#ef_mus_era')          ? win.querySelector('#ef_mus_era').value                 : '';
  const instr   = win.querySelector('#ef_mus_instr')        ? win.querySelector('#ef_mus_instr').value               : '';
  const bani    = win.querySelector('#ef_mus_bani')         ? win.querySelector('#ef_mus_bani').value.trim()         : '';
  const srcUrl  = win.querySelector('#ef_mus_source_url')   ? win.querySelector('#ef_mus_source_url').value.trim()   : '';
  const srcLbl  = win.querySelector('#ef_mus_source_label') ? win.querySelector('#ef_mus_source_label').value.trim() : '';
  const srcType = win.querySelector('#ef_mus_source_type')  ? win.querySelector('#ef_mus_source_type').value         : '';

  // YouTube entries
  const youtube = [];
  win.querySelectorAll('.ef-youtube-block').forEach(block => {
    const inputs  = block.querySelectorAll('input');
    const selects = block.querySelectorAll('select');
    const url     = inputs[0] ? inputs[0].value.trim() : '';
    const lbl     = inputs[1] ? inputs[1].value.trim() : '';
    const compId  = selects[0] ? selects[0].value : '';
    const ragaId  = selects[1] ? selects[1].value : '';
    const year    = inputs[2]  ? inputs[2].value  : '';
    const version = inputs[3]  ? inputs[3].value.trim() : '';
    if (!url) return;
    const entry = { url, label: lbl };
    if (compId)  entry.composition_id = compId;
    if (ragaId)  entry.raga_id        = ragaId;
    if (year)    entry.year           = parseInt(year, 10);
    if (version) entry.version        = version;
    youtube.push(entry);
  });

  const nodeJson = {
    id,
    label,
    sources: [{ url: srcUrl, label: srcLbl, type: srcType }],
    born:  born  ? parseInt(born,  10) : null,
    died:  died  ? parseInt(died,  10) : null,
    era,
    instrument: instr,
    bani: bani || null,
    youtube,
  };

  // Edges
  const newEdges = [];
  win.querySelectorAll('#ef_mus_edges .ef-repeat-block').forEach(block => {
    const direction = block.dataset.direction;
    const selects   = block.querySelectorAll('select');
    const inputs    = block.querySelectorAll('input');
    const otherId   = selects[0] ? selects[0].value : '';
    const conf      = inputs[0]  ? parseFloat(inputs[0].value) : 0.90;
    const edgeSrc   = inputs[1]  ? inputs[1].value.trim()      : '';
    const note      = inputs[2]  ? inputs[2].value.trim()      : '';
    if (!otherId) return;
    const source = direction === 'guru' ? otherId : id;
    const target = direction === 'guru' ? id      : otherId;
    newEdges.push({ source, target, confidence: conf, source_url: edgeSrc, note: note || null });
  });

  const edgesJson = newEdges.length > 0
    ? [...(graphData.edges || []), ...newEdges]
    : null;

  return { nodeJson, edgesJson };
}

// ── showMusicianSuccess ───────────────────────────────────────────────────────

function showMusicianSuccess(win, id, hasEdges) {
  const body = win.querySelector('.ew-body');
  body.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'ef-success';

  if (hasEdges) {
    msg.innerHTML = `
      <strong>✓ Downloaded <code>${id}.json</code> and <code>_edges.json</code></strong>
      <ol>
        <li>Copy <code>${id}.json</code> to <code>carnatic/data/musicians/</code></li>
        <li>Replace <code>carnatic/data/musicians/_edges.json</code> with the downloaded file</li>
        <li>Run: <code>bani-render</code></li>
        <li>Refresh <code>graph.html</code></li>
      </ol>
      <div class="ef-warn">⚠ Downloading <code>_edges.json</code> will replace the existing file.
      If you have added other edges in this session without re-rendering, download and merge manually.</div>
    `;
  } else {
    msg.innerHTML = `
      <strong>✓ Downloaded <code>${id}.json</code></strong>
      <ol>
        <li>Copy <code>${id}.json</code> to <code>carnatic/data/musicians/</code></li>
        <li>Run: <code>bani-render</code></li>
        <li>Refresh <code>graph.html</code></li>
      </ol>
    `;
  }
  body.appendChild(msg);

  const footer = win.querySelector('.ew-footer');
  footer.innerHTML = '';

  const againBtn = document.createElement('button');
  againBtn.className = 'ef-preview-btn';
  againBtn.textContent = 'Download again';
  againBtn.addEventListener('click', () => {
    const { nodeJson, edgesJson } = generateMusicianJson(win);
    downloadJson(id + '.json', nodeJson);
    if (edgesJson) setTimeout(() => downloadJson('_edges.json', edgesJson), 300);
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ef-preview-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => win.remove());

  footer.appendChild(againBtn);
  footer.appendChild(closeBtn);
}

// ── Raga form ─────────────────────────────────────────────────────────────────

function buildRagaForm() {
  const win = createEntryWindow('Add Raga');
  const body = win.querySelector('.ew-body');

  const existingIds = (graphData.ragas || []).map(r => r.id);

  body.appendChild(efSection('Raga Fields'));

  const nameInp = efInput('ef_raga_name', 'text', 'e.g. Arabhi', null);
  body.appendChild(efRow('Name', true, null, nameInp));

  const idRow = efIdRow('ef_raga_id', 'ef_raga_name', existingIds);
  body.appendChild(idRow);
  nameInp.addEventListener('input', idRow._updateId);

  const aliasInp = efInput('ef_raga_aliases', 'text', 'Arabi, Aravi (comma-separated)', null);
  body.appendChild(efRow('Aliases', false, 'comma-separated', aliasInp));

  const melaOpts = [
    { value: 'false', label: 'No — Janya raga' },
    { value: 'true',  label: 'Yes — Melakarta' },
  ];
  const melaSel = efSelect('ef_raga_is_mela', melaOpts, false);
  melaSel.value = 'false';
  body.appendChild(efRow('Is Melakarta?', true, null, melaSel));

  // Conditional: melakarta number + cakra (shown only when is_melakarta = true)
  const melaNumInp = efInput('ef_raga_melakarta', 'number', '1–72', null);
  melaNumInp.min = 1; melaNumInp.max = 72;
  const melaNumRow = efRow('Melakarta Number', false, null, melaNumInp, 'is_melakarta');
  body.appendChild(melaNumRow);

  const cakraInp = efInput('ef_raga_cakra', 'number', '1–12', null);
  cakraInp.min = 1; cakraInp.max = 12;
  const cakraRow = efRow('Cakra', false, null, cakraInp, 'is_melakarta');
  body.appendChild(cakraRow);

  // Conditional: parent_raga (shown only when is_melakarta = false)
  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const parentSel = efSelect('ef_raga_parent', ragaOpts, true);
  const parentRow = efRow('Parent Raga', false, null, parentSel, 'not_melakarta');
  parentRow.classList.add('ef-visible'); // default: janya
  body.appendChild(parentRow);

  // Wire conditional display
  melaSel.addEventListener('change', () => {
    const isMela = melaSel.value === 'true';
    melaNumRow.classList.toggle('ef-visible', isMela);
    cakraRow.classList.toggle('ef-visible', isMela);
    parentRow.classList.toggle('ef-visible', !isMela);
  });

  const notesInp = efInput('ef_raga_notes', 'text', 'Musicological note…', null);
  body.appendChild(efRow('Notes', false, null, notesInp));

  body.appendChild(efSourceFields('ef_raga'));

  // Footer
  const footer = win.querySelector('.ew-footer');
  const dlBtn = document.createElement('button');
  dlBtn.className = 'ef-download-btn';
  dlBtn.textContent = '⬇ Download JSON';
  dlBtn.disabled = true;

  const previewBtn = document.createElement('button');
  previewBtn.className = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(dlBtn);
  footer.appendChild(previewBtn);

  function validate() {
    const name    = nameInp.value.trim();
    const id      = idRow._idInput.value.trim();
    const srcUrl  = win.querySelector('#ef_raga_source_url')   ? win.querySelector('#ef_raga_source_url').value.trim()   : '';
    const srcLbl  = win.querySelector('#ef_raga_source_label') ? win.querySelector('#ef_raga_source_label').value.trim() : '';
    const srcType = win.querySelector('#ef_raga_source_type')  ? win.querySelector('#ef_raga_source_type').value         : '';
    const dupId   = existingIds.includes(id);
    const ok = name && id && srcUrl && srcLbl && srcType && !dupId;
    dlBtn.disabled = !ok;
    if (previewPre.style.display !== 'none') updatePreview();
  }

  function updatePreview() {
    try {
      previewPre.textContent = JSON.stringify(generateRagaJson(win), null, 2);
    } catch(e) { previewPre.textContent = '(incomplete)'; }
  }

  win.addEventListener('input', validate);
  win.addEventListener('change', validate);

  previewBtn.addEventListener('click', () => {
    const open = previewPre.style.display !== 'none';
    previewPre.style.display = open ? 'none' : 'block';
    previewBtn.textContent = open ? 'Preview JSON' : 'Hide Preview';
    if (!open) updatePreview();
  });

  dlBtn.addEventListener('click', () => {
    const obj = generateRagaJson(win);
    downloadJson(obj.id + '.json', obj);
    showGenericSuccess(win, obj.id + '.json', 'carnatic/data/ragas/');
  });

  return win;
}

function generateRagaJson(win) {
  const id      = win.querySelector('#ef_raga_id')           ? win.querySelector('#ef_raga_id').value.trim()           : '';
  const name    = win.querySelector('#ef_raga_name')         ? win.querySelector('#ef_raga_name').value.trim()         : '';
  const aliases = win.querySelector('#ef_raga_aliases')      ? win.querySelector('#ef_raga_aliases').value             : '';
  const isMela  = win.querySelector('#ef_raga_is_mela')      ? win.querySelector('#ef_raga_is_mela').value === 'true'  : false;
  const melaNum = win.querySelector('#ef_raga_melakarta')    ? win.querySelector('#ef_raga_melakarta').value           : '';
  const cakra   = win.querySelector('#ef_raga_cakra')        ? win.querySelector('#ef_raga_cakra').value               : '';
  const parent  = win.querySelector('#ef_raga_parent')       ? win.querySelector('#ef_raga_parent').value              : '';
  const notes   = win.querySelector('#ef_raga_notes')        ? win.querySelector('#ef_raga_notes').value.trim()        : '';
  const srcUrl  = win.querySelector('#ef_raga_source_url')   ? win.querySelector('#ef_raga_source_url').value.trim()   : '';
  const srcLbl  = win.querySelector('#ef_raga_source_label') ? win.querySelector('#ef_raga_source_label').value.trim() : '';
  const srcType = win.querySelector('#ef_raga_source_type')  ? win.querySelector('#ef_raga_source_type').value         : '';

  const aliasArr = aliases
    ? aliases.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return {
    id,
    name,
    aliases: aliasArr,
    melakarta:    isMela && melaNum ? parseInt(melaNum, 10) : null,
    is_melakarta: isMela,
    cakra:        isMela && cakra   ? parseInt(cakra,   10) : null,
    parent_raga:  !isMela && parent ? parent : null,
    sources: [{ url: srcUrl, label: srcLbl, type: srcType }],
    notes: notes || null,
  };
}

// ── Composition form ──────────────────────────────────────────────────────────

function buildCompositionForm() {
  const win = createEntryWindow('Add Composition');
  const body = win.querySelector('.ew-body');

  const existingIds = (graphData.compositions || []).map(c => c.id);

  body.appendChild(efSection('Composition Fields'));

  const titleInp = efInput('ef_comp_title', 'text', 'e.g. Nidhi Chala Sukhama', null);
  body.appendChild(efRow('Title', true, null, titleInp));

  const idRow = efIdRow('ef_comp_id', 'ef_comp_title', existingIds);
  body.appendChild(idRow);
  titleInp.addEventListener('input', idRow._updateId);

  const composerOpts = (graphData.composers || []).map(c => ({ value: c.id, label: c.name || c.id }));
  const composerSel = efSelect('ef_comp_composer', composerOpts, true);
  body.appendChild(efRow('Composer', true, null, composerSel));

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const ragaSel = efSelect('ef_comp_raga', ragaOpts, true);
  body.appendChild(efRow('Raga', true, null, ragaSel));

  const talaOpts = ['adi', 'rupakam', 'misra_capu', 'khanda_capu', 'tisra_triputa', 'ata', 'dhruva', 'other'];
  const talaSel = efSelect('ef_comp_tala', talaOpts, true);
  body.appendChild(efRow('Tala', false, null, talaSel));

  const langOpts = ['Telugu', 'Sanskrit', 'Tamil', 'Kannada', 'Malayalam', 'Other'];
  const langSel = efSelect('ef_comp_lang', langOpts, true);
  body.appendChild(efRow('Language', false, null, langSel));

  const notesInp = efInput('ef_comp_notes', 'text', 'Musicological note…', null);
  body.appendChild(efRow('Notes', false, null, notesInp));

  body.appendChild(efSourceFields('ef_comp'));

  // Footer
  const footer = win.querySelector('.ew-footer');
  const dlBtn = document.createElement('button');
  dlBtn.className = 'ef-download-btn';
  dlBtn.textContent = '⬇ Download JSON';
  dlBtn.disabled = true;

  const previewBtn = document.createElement('button');
  previewBtn.className = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(dlBtn);
  footer.appendChild(previewBtn);

  function validate() {
    const title      = titleInp.value.trim();
    const id         = idRow._idInput.value.trim();
    const composerId = composerSel.value;
    const ragaId     = ragaSel.value;
    const dupId      = existingIds.includes(id);
    const ok = title && id && composerId && ragaId && !dupId;
    dlBtn.disabled = !ok;
    if (previewPre.style.display !== 'none') updatePreview();
  }

  function updatePreview() {
    try {
      previewPre.textContent = JSON.stringify(generateCompositionJson(win), null, 2);
    } catch(e) { previewPre.textContent = '(incomplete)'; }
  }

  win.addEventListener('input', validate);
  win.addEventListener('change', validate);

  previewBtn.addEventListener('click', () => {
    const open = previewPre.style.display !== 'none';
    previewPre.style.display = open ? 'none' : 'block';
    previewBtn.textContent = open ? 'Preview JSON' : 'Hide Preview';
    if (!open) updatePreview();
  });

  dlBtn.addEventListener('click', () => {
    const obj = generateCompositionJson(win);
    downloadJson(obj.id + '.json', obj);
    showGenericSuccess(win, obj.id + '.json', 'carnatic/data/compositions/');
  });

  return win;
}

function generateCompositionJson(win) {
  const id         = win.querySelector('#ef_comp_id')           ? win.querySelector('#ef_comp_id').value.trim()           : '';
  const title      = win.querySelector('#ef_comp_title')        ? win.querySelector('#ef_comp_title').value.trim()        : '';
  const composerId = win.querySelector('#ef_comp_composer')     ? win.querySelector('#ef_comp_composer').value            : '';
  const ragaId     = win.querySelector('#ef_comp_raga')         ? win.querySelector('#ef_comp_raga').value                : '';
  const tala       = win.querySelector('#ef_comp_tala')         ? win.querySelector('#ef_comp_tala').value                : '';
  const lang       = win.querySelector('#ef_comp_lang')         ? win.querySelector('#ef_comp_lang').value                : '';
  const notes      = win.querySelector('#ef_comp_notes')        ? win.querySelector('#ef_comp_notes').value.trim()        : '';
  const srcUrl     = win.querySelector('#ef_comp_source_url')   ? win.querySelector('#ef_comp_source_url').value.trim()   : '';
  const srcLbl     = win.querySelector('#ef_comp_source_label') ? win.querySelector('#ef_comp_source_label').value.trim() : '';
  const srcType    = win.querySelector('#ef_comp_source_type')  ? win.querySelector('#ef_comp_source_type').value         : '';

  return {
    id,
    title,
    composer_id: composerId || null,
    raga_id:     ragaId     || null,
    tala:        tala       || null,
    language:    lang       || null,
    sources:     srcUrl ? [{ url: srcUrl, label: srcLbl, type: srcType }] : [],
    notes:       notes  || null,
  };
}

// ── Recording form ────────────────────────────────────────────────────────────

function buildRecordingForm() {
  const win = createEntryWindow('Add Concert Recording');
  const body = win.querySelector('.ew-body');

  const existingIds = (graphData.recordings || []).map(r => r.id);

  body.appendChild(efSection('Top-Level Fields'));

  const titleInp = efInput('ef_rec_title', 'text', 'e.g. Srinivasa Farms Concert, Poonamallee 1965', null);
  body.appendChild(efRow('Title', true, null, titleInp));

  const idRow = efIdRow('ef_rec_id', 'ef_rec_title', existingIds);
  body.appendChild(idRow);
  titleInp.addEventListener('input', idRow._updateId);

  const shortTitleInp = efInput('ef_rec_short_title', 'text', 'e.g. Poonamallee 1965', null);
  body.appendChild(efRow('Short Title', false, null, shortTitleInp));

  // YouTube URL — this IS the primary source
  const urlInp = efInput('ef_rec_url', 'text', 'https://youtu.be/…', null);
  body.appendChild(efRow('YouTube URL', true, 'this is also the source URL', urlInp));

  const dateInp = efInput('ef_rec_date', 'text', '1965-01 or 1967 or 1960s', null);
  body.appendChild(efRow('Date', false, 'ISO 8601 partial', dateInp));

  const venueInp = efInput('ef_rec_venue', 'text', 'e.g. Srinivasa Farms, Poonamallee', null);
  body.appendChild(efRow('Venue', false, null, venueInp));

  const occasionInp = efInput('ef_rec_occasion', 'text', 'e.g. Sangita Kalanidhi award celebration', null);
  body.appendChild(efRow('Occasion', false, null, occasionInp));

  // Source label — type is always 'other' for YouTube
  const srcLblInp = efInput('ef_rec_source_label', 'text', 'YouTube', 'YouTube');
  body.appendChild(efRow('Source Label', true, null, srcLblInp));

  // Sessions
  body.appendChild(efSection('Sessions'));

  const sessionsContainer = document.createElement('div');
  sessionsContainer.id = 'ef_rec_sessions';
  body.appendChild(sessionsContainer);

  const addSessionBtn = efAddBtn('+ Add Session');
  body.appendChild(addSessionBtn);
  addSessionBtn.addEventListener('click', () => addSessionBlock(sessionsContainer, win));

  // Footer
  const footer = win.querySelector('.ew-footer');
  const dlBtn = document.createElement('button');
  dlBtn.className = 'ef-download-btn';
  dlBtn.textContent = '⬇ Download JSON';
  dlBtn.disabled = true;

  const previewBtn = document.createElement('button');
  previewBtn.className = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(dlBtn);
  footer.appendChild(previewBtn);

  function validate() {
    const title  = titleInp.value.trim();
    const id     = idRow._idInput.value.trim();
    const url    = urlInp.value.trim();
    const srcLbl = srcLblInp.value.trim();
    const dupId  = existingIds.includes(id);
    const ok = title && id && url && srcLbl && !dupId;
    dlBtn.disabled = !ok;
    if (previewPre.style.display !== 'none') updatePreview();
  }

  function updatePreview() {
    try {
      previewPre.textContent = JSON.stringify(generateRecordingJson(win), null, 2);
    } catch(e) { previewPre.textContent = '(incomplete)'; }
  }

  win.addEventListener('input', validate);
  win.addEventListener('change', validate);

  previewBtn.addEventListener('click', () => {
    const open = previewPre.style.display !== 'none';
    previewPre.style.display = open ? 'none' : 'block';
    previewBtn.textContent = open ? 'Preview JSON' : 'Hide Preview';
    if (!open) updatePreview();
  });

  dlBtn.addEventListener('click', () => {
    const obj = generateRecordingJson(win);
    downloadJson(obj.id + '.json', obj);
    showGenericSuccess(win, obj.id + '.json', 'carnatic/data/recordings/');
  });

  return win;
}

// ── Session block ─────────────────────────────────────────────────────────────

function addSessionBlock(container, formWin) {
  const sessionIndex = container.querySelectorAll('.ef-session-block').length + 1;

  const block = document.createElement('div');
  block.className = 'ef-repeat-block ef-session-block';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ef-repeat-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    block.remove();
    formWin.dispatchEvent(new Event('input'));
  });
  block.appendChild(removeBtn);

  const sessionLabel = document.createElement('div');
  sessionLabel.style.cssText = 'font-size:0.70rem;color:var(--fg-sub);font-weight:bold;margin-bottom:8px;';
  sessionLabel.textContent = `Session ${sessionIndex}`;
  block.appendChild(sessionLabel);

  // Performers sub-section
  const perfLabel = document.createElement('div');
  perfLabel.style.cssText = 'font-size:0.65rem;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;';
  perfLabel.textContent = 'Performers';
  block.appendChild(perfLabel);

  const performersContainer = document.createElement('div');
  performersContainer.className = 'ef-performers-container';
  block.appendChild(performersContainer);

  const addPerformerBtn = efAddBtn('+ Add Performer');
  block.appendChild(addPerformerBtn);
  addPerformerBtn.addEventListener('click', () => addPerformerBlock(performersContainer, formWin));

  // Performances sub-section
  const perfmLabel = document.createElement('div');
  perfmLabel.style.cssText = 'font-size:0.65rem;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.08em;margin:10px 0 6px;';
  perfmLabel.textContent = 'Performances';
  block.appendChild(perfmLabel);

  const performancesContainer = document.createElement('div');
  performancesContainer.className = 'ef-performances-container';
  block.appendChild(performancesContainer);

  const addPerfBtn = efAddBtn('+ Add Performance');
  block.appendChild(addPerfBtn);
  addPerfBtn.addEventListener('click', () => addPerformanceBlock(performancesContainer, formWin));

  container.appendChild(block);
  formWin.dispatchEvent(new Event('input'));
}

// ── Performer block ───────────────────────────────────────────────────────────

function addPerformerBlock(container, formWin) {
  const block = document.createElement('div');
  block.className = 'ef-repeat-block ef-performer-block';
  block.style.background = 'var(--bg-panel)';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ef-repeat-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    block.remove();
    formWin.dispatchEvent(new Event('input'));
  });
  block.appendChild(removeBtn);

  const nodeOpts = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
  const nodeSel = efSelect(null, nodeOpts, true);
  block.appendChild(efRow('Musician', false, 'leave blank if unmatched', nodeSel));

  const unmatchedInp = efInput(null, 'text', 'Raw name from source (if no musician ID)');
  block.appendChild(efRow('Unmatched Name', false, null, unmatchedInp));

  const roleOpts = ['vocal', 'violin', 'veena', 'flute', 'mridangam', 'ghatam', 'tampura', 'other'];
  const roleSel = efSelect(null, roleOpts, false);
  block.appendChild(efRow('Role', true, null, roleSel));

  container.appendChild(block);
  formWin.dispatchEvent(new Event('input'));
}

// ── Performance block ─────────────────────────────────────────────────────────

function addPerformanceBlock(container, formWin) {
  const block = document.createElement('div');
  block.className = 'ef-repeat-block ef-performance-block';
  block.style.background = 'var(--bg-panel)';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ef-repeat-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    block.remove();
    formWin.dispatchEvent(new Event('input'));
  });
  block.appendChild(removeBtn);

  const tsInp = efInput(null, 'text', 'MM:SS or HH:MM:SS');
  block.appendChild(efRow('Timestamp', true, null, tsInp));

  const offsetInp = efInput(null, 'number', 'auto-computed', null);
  offsetInp.min = 0;
  block.appendChild(efRow('Offset (seconds)', true, 'auto-computed from timestamp', offsetInp));

  // Auto-compute offset on blur
  tsInp.addEventListener('blur', () => {
    if (tsInp.value.trim()) {
      offsetInp.value = timestampToSeconds(tsInp.value.trim());
      formWin.dispatchEvent(new Event('input'));
    }
  });

  const displayTitleInp = efInput(null, 'text', 'e.g. jagadānandakāraka');
  block.appendChild(efRow('Display Title', true, null, displayTitleInp));

  const compOpts = (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id }));
  const compSel = efSelect(null, compOpts, true);
  block.appendChild(efRow('Composition', false, null, compSel));

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const ragaSel = efSelect(null, ragaOpts, true);
  block.appendChild(efRow('Raga', false, 'auto-filled from composition', ragaSel));

  const talaOpts = ['adi', 'rupakam', 'misra_capu', 'khanda_capu', 'tisra_triputa', 'ata', 'dhruva', 'other'];
  const talaSel = efSelect(null, talaOpts, true);
  block.appendChild(efRow('Tala', false, null, talaSel));

  const composerOpts = (graphData.composers || []).map(c => ({ value: c.id, label: c.name || c.id }));
  const composerSel = efSelect(null, composerOpts, true);
  block.appendChild(efRow('Composer', false, 'auto-filled from composition', composerSel));

  // Auto-fill raga + composer when composition is selected
  wireCompRagaAutofill(compSel, ragaSel, composerSel, formWin);

  const notesInp = efInput(null, 'text', 'e.g. padam, javali, varnam');
  block.appendChild(efRow('Notes', false, null, notesInp));

  const typeOpts = [
    { value: '',     label: '— none —' },
    { value: 'tani', label: 'tani (percussion solo)' },
  ];
  const typeSel = efSelect(null, typeOpts, false);
  block.appendChild(efRow('Type', false, null, typeSel));

  container.appendChild(block);
  formWin.dispatchEvent(new Event('input'));
}

// ── generateRecordingJson ─────────────────────────────────────────────────────

function generateRecordingJson(win) {
  const id         = win.querySelector('#ef_rec_id')           ? win.querySelector('#ef_rec_id').value.trim()           : '';
  const title      = win.querySelector('#ef_rec_title')        ? win.querySelector('#ef_rec_title').value.trim()        : '';
  const shortTitle = win.querySelector('#ef_rec_short_title')  ? win.querySelector('#ef_rec_short_title').value.trim()  : '';
  const url        = win.querySelector('#ef_rec_url')          ? win.querySelector('#ef_rec_url').value.trim()          : '';
  const date       = win.querySelector('#ef_rec_date')         ? win.querySelector('#ef_rec_date').value.trim()         : '';
  const venue      = win.querySelector('#ef_rec_venue')        ? win.querySelector('#ef_rec_venue').value.trim()        : '';
  const occasion   = win.querySelector('#ef_rec_occasion')     ? win.querySelector('#ef_rec_occasion').value.trim()     : '';
  const srcLbl     = win.querySelector('#ef_rec_source_label') ? win.querySelector('#ef_rec_source_label').value.trim() : 'YouTube';

  const videoId = extractVideoId(url);

  // Sessions
  const sessions = [];
  let sessionIdx = 1;

  win.querySelectorAll('.ef-session-block').forEach(sBlock => {
    // Performers
    const performers = [];
    sBlock.querySelectorAll('.ef-performer-block').forEach(pBlock => {
      const selects   = pBlock.querySelectorAll('select');
      const inputs    = pBlock.querySelectorAll('input');
      const musId     = selects[0] ? selects[0].value : '';
      const unmatched = inputs[0]  ? inputs[0].value.trim() : '';
      const role      = selects[1] ? selects[1].value : '';
      const entry = { musician_id: musId || null, role };
      if (!musId && unmatched) entry.unmatched_name = unmatched;
      performers.push(entry);
    });

    // Performances
    const performances = [];
    let perfIdx = 1;
    sBlock.querySelectorAll('.ef-performance-block').forEach(pfBlock => {
      const inputs    = pfBlock.querySelectorAll('input');
      const selects   = pfBlock.querySelectorAll('select');
      const ts        = inputs[0] ? inputs[0].value.trim()       : '';
      const offset    = inputs[1] ? parseInt(inputs[1].value, 10) : 0;
      const dispTitle = inputs[2] ? inputs[2].value.trim()        : '';
      const compId    = selects[0] ? selects[0].value : '';
      const ragaId    = selects[1] ? selects[1].value : '';
      const tala      = selects[2] ? selects[2].value : '';
      const composerId = selects[3] ? selects[3].value : '';
      const notes     = inputs[3]  ? inputs[3].value.trim() : '';
      const type      = selects[4] ? selects[4].value : '';

      performances.push({
        performance_index: perfIdx++,
        timestamp:         ts       || '00:00',
        offset_seconds:    isNaN(offset) ? 0 : offset,
        composition_id:    compId    || null,
        raga_id:           ragaId    || null,
        tala:              tala      || null,
        composer_id:       composerId || null,
        display_title:     dispTitle  || null,
        notes:             notes      || null,
        type:              type       || null,
      });
    });

    sessions.push({
      session_index: sessionIdx++,
      performers,
      performances,
    });
  });

  return {
    id,
    video_id:    videoId,
    url,
    title,
    short_title: shortTitle || null,
    date:        date       || null,
    venue:       venue      || null,
    occasion:    occasion   || null,
    sources:     url ? [{ url, label: srcLbl, type: 'other' }] : [],
    sessions,
  };
}

// ── Generic post-download success panel ───────────────────────────────────────

function showGenericSuccess(win, filename, directory) {
  const body = win.querySelector('.ew-body');
  body.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'ef-success';
  msg.innerHTML = `
    <strong>✓ Downloaded <code>${filename}</code></strong>
    <ol>
      <li>Copy <code>${filename}</code> to <code>${directory}</code></li>
      <li>Run: <code>bani-render</code></li>
      <li>Refresh <code>graph.html</code></li>
    </ol>
  `;
  body.appendChild(msg);

  const footer = win.querySelector('.ew-footer');
  footer.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ef-preview-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => win.remove());
  footer.appendChild(closeBtn);
}

// ── Add YouTube to Existing Musician form ─────────────────────────────────────

function buildAddYoutubeForm() {
  const win = createEntryWindow('Add YouTube to Musician');
  const body = win.querySelector('.ew-body');

  body.appendChild(efSection('Select Musician'));

  const nodeOpts = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
  const musicianSel = efSelect('ef_yt_musician', nodeOpts, true);
  body.appendChild(efRow('Musician', true, null, musicianSel));

  // Info row — shows selected musician's current YouTube count
  const infoDiv = document.createElement('div');
  infoDiv.style.cssText = 'font-size:0.68rem;color:var(--fg-muted);margin-bottom:8px;';
  body.appendChild(infoDiv);

  musicianSel.addEventListener('change', () => {
    const node = (graphData.nodes || []).find(n => n.id === musicianSel.value);
    if (node) {
      const count = (node.youtube || []).length;
      infoDiv.textContent = `Currently has ${count} YouTube entr${count === 1 ? 'y' : 'ies'}.`;
    } else {
      infoDiv.textContent = '';
    }
    win.dispatchEvent(new Event('input'));
  });

  body.appendChild(efSection('New YouTube Entries'));

  const ytContainer = document.createElement('div');
  ytContainer.id = 'ef_yt_entries';
  body.appendChild(ytContainer);

  const addYtBtn = efAddBtn('+ Add YouTube Entry');
  body.appendChild(addYtBtn);
  addYtBtn.addEventListener('click', () => addYoutubeBlock(ytContainer, win));

  // Footer
  const footer = win.querySelector('.ew-footer');
  const dlBtn = document.createElement('button');
  dlBtn.className = 'ef-download-btn';
  dlBtn.textContent = '⬇ Download Updated JSON';
  dlBtn.disabled = true;

  const previewBtn = document.createElement('button');
  previewBtn.className = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(dlBtn);
  footer.appendChild(previewBtn);

  function buildUpdatedMusician() {
    const node = (graphData.nodes || []).find(n => n.id === musicianSel.value);
    if (!node) return null;

    // Collect new YouTube entries from the form
    const newEntries = [];
    win.querySelectorAll('.ef-youtube-block').forEach(block => {
      const inputs  = block.querySelectorAll('input');
      const selects = block.querySelectorAll('select');
      const url     = inputs[0]  ? inputs[0].value.trim()  : '';
      const lbl     = inputs[1]  ? inputs[1].value.trim()  : '';
      const compId  = selects[0] ? selects[0].value        : '';
      const ragaId  = selects[1] ? selects[1].value        : '';
      const year    = inputs[2]  ? inputs[2].value         : '';
      const version = inputs[3]  ? inputs[3].value.trim()  : '';
      if (!url) return;
      const entry = { url, label: lbl };
      if (compId)  entry.composition_id = compId;
      if (ragaId)  entry.raga_id        = ragaId;
      if (year)    entry.year           = parseInt(year, 10);
      if (version) entry.version        = version;
      newEntries.push(entry);
    });

    // Normalise existing tracks: render pipeline converts url→vid; convert back to url format.
    const existingYoutube = (node.youtube || []).map(t => {
      if (t.url) return t;                          // already url format
      if (t.vid) {
        const norm = { url: 'https://youtu.be/' + t.vid, label: t.label || '' };
        if (t.composition_id) norm.composition_id = t.composition_id;
        if (t.raga_id)        norm.raga_id        = t.raga_id;
        if (t.year)           norm.year           = t.year;
        if (t.version)        norm.version        = t.version;
        return norm;
      }
      return t;
    });

    // Reconstruct full musician JSON from graphData.nodes (which carries all fields)
    return {
      id:         node.id,
      label:      node.label,
      sources:    node.sources    || [],
      born:       node.born       || null,
      died:       node.died       || null,
      era:        node.era        || '',
      instrument: node.instrument || '',
      bani:       node.bani       || null,
      youtube:    [...existingYoutube, ...newEntries],
    };
  }

  function validate() {
    const musId    = musicianSel.value;
    const hasEntry = win.querySelectorAll('.ef-youtube-block').length > 0;
    // At least one entry with a URL
    let hasUrl = false;
    win.querySelectorAll('.ef-youtube-block input').forEach((inp, i) => {
      if (i % 4 === 0 && inp.value.trim()) hasUrl = true; // first input in each block = URL
    });
    dlBtn.disabled = !(musId && hasEntry && hasUrl);
    if (previewPre.style.display !== 'none') updatePreview();
  }

  function updatePreview() {
    try {
      const obj = buildUpdatedMusician();
      previewPre.textContent = obj ? JSON.stringify(obj, null, 2) : '(select a musician first)';
    } catch(e) { previewPre.textContent = '(incomplete)'; }
  }

  win.addEventListener('input', validate);
  win.addEventListener('change', validate);

  previewBtn.addEventListener('click', () => {
    const open = previewPre.style.display !== 'none';
    previewPre.style.display = open ? 'none' : 'block';
    previewBtn.textContent = open ? 'Preview JSON' : 'Hide Preview';
    if (!open) updatePreview();
  });

  dlBtn.addEventListener('click', () => {
    const obj = buildUpdatedMusician();
    if (!obj) return;
    downloadJson(obj.id + '.json', obj);
    showGenericSuccess(win, obj.id + '.json', 'carnatic/data/musicians/');
  });

  return win;
}