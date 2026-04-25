// ── ADR-031: Data Entry Forms — In-Browser JSON Generator ─────────────────────
// Depends on: graphData (injected by render pipeline), nextSpawnPosition(),
//             wireDrag(), topZ (from media_player.js)
//
// Bundle schema: ADR-083 (plans/ADR-083-bani-add-bundle-canonical-write-channel.md).
// addToBundle(type, obj) enforces the whitelist of six item types defined in §4 of
// that ADR and throws on any unknown type — silent drops are forbidden.

// ── Session bundle state ──────────────────────────────────────────────────────
// All entry forms can push their output into this shared bundle.
// One click on "Download Bundle" produces bani_add_bundle.json, which
// bani-add consumes to populate all data directories in one pass.

const baniBundle = {
  ragas:        [],
  composers:    [],
  musicians:    [],
  compositions: [],
  recordings:   [],
  edges:        [],
};

function addToBundle(type, obj) {
  if (!(type in baniBundle)) throw new Error(`addToBundle: unknown type '${type}'`);
  baniBundle[type].push(obj);
  _updateBundleBtn();
}

function _updateBundleBtn() {
  const btn = document.getElementById('bundle-download-btn');
  if (!btn) return;
  const total = Object.values(baniBundle).reduce((s, arr) => s + arr.length, 0);
  btn.textContent = `⬇ Bundle (${total} item${total === 1 ? '' : 's'})`;
  btn.disabled = total === 0;
  btn.classList.toggle('entry-btn-active', total > 0);
}

function downloadBundle() {
  const bundle = {
    schema_version: 2,
    generated_at:   new Date().toISOString(),
    items:          baniBundle,
  };
  downloadJson('bani_add_bundle.json', bundle);
}

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

// ── Combobox — searchable entity dropdown with inline "Add missing" ──────────
// Replaces efSelect for all entity fields (raga, composer, composition,
// musician) with a type-to-filter combobox.  A hidden <select> is kept in
// sync so positional querySelectorAll('select')[N] reads in generators still
// work.  The visible text filter input carries data-combobox-filter="true"
// so generators can skip it with querySelectorAll('input:not([data-combobox-filter])').
//
// id:      id for the hidden <select> (for named querySelector('#id') reads)
// options: [{value, label}]
// type:    'raga'|'composer'|'composition'|null  (null = no "Add" entry)
// formWin: parent window (fires change events for form validation)
//
// Returns a <div> with:
//   ._select     — hidden <select> (for backward compat)
//   ._options    — mutable options array
//   .getValue()  — currently selected value
//   .setValue(v, label) — programmatically set value + label
//   .addOption(value, label) — add a new option and auto-select it

function efCombobox(id, options, type, formWin) {
  const allOptions = [...options];

  const wrap = document.createElement('div');
  wrap.className = 'ef-combobox-wrap';

  // Hidden <select> — kept in sync; found by querySelectorAll('select')[N]
  const hiddenSel = document.createElement('select');
  hiddenSel.style.display = 'none';
  hiddenSel.className = 'ef-select';
  if (id) hiddenSel.id = id;

  function syncHiddenOpts() {
    hiddenSel.innerHTML = '';
    const none = document.createElement('option');
    none.value = ''; none.textContent = '— none —';
    hiddenSel.appendChild(none);
    for (const o of allOptions) {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.label;
      hiddenSel.appendChild(opt);
    }
  }
  syncHiddenOpts();
  wrap.appendChild(hiddenSel);

  // Visible text filter input — marked so generators skip it
  const textInp = document.createElement('input');
  textInp.type = 'text';
  textInp.className = 'ef-input ef-combobox-input';
  textInp.placeholder = 'Type to search…';
  textInp.setAttribute('data-combobox-filter', 'true');
  textInp.autocomplete = 'off';
  wrap.appendChild(textInp);

  // Dropdown: portalled to document.body with position:fixed to escape overflow clipping
  const dropdown = document.createElement('div');
  dropdown.className = 'ef-combobox-dropdown';
  dropdown.style.display = 'none';

  // Mini inline-creation form (lives in normal flow after the combobox row)
  const miniFormWrap = document.createElement('div');
  miniFormWrap.className = 'ef-combobox-mini-form';
  miniFormWrap.style.display = 'none';

  let selectedValue = '';
  let selectedLabel = '';
  let activeIdx     = -1;
  let miniFormOpen  = false;

  function positionDropdown() {
    const rect = textInp.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top     = (rect.bottom + 2) + 'px';
    dropdown.style.left    = rect.left + 'px';
    dropdown.style.width   = rect.width + 'px';
    dropdown.style.zIndex  = '9999';
  }

  function setActive(idx) {
    const items = dropdown.querySelectorAll('.search-result-item');
    items.forEach((el, i) => el.classList.toggle('active', i === idx));
    activeIdx = idx;
    if (idx >= 0 && items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
  }

  function openDropdown() {
    if (!dropdown.parentNode) document.body.appendChild(dropdown);
    positionDropdown();
    dropdown.style.display = 'block';
  }

  function closeDropdown() {
    dropdown.style.display = 'none';
    if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
    activeIdx = -1;
  }

  function renderDropdown(filter) {
    dropdown.innerHTML = '';
    activeIdx = -1;
    const q        = (filter || '').toLowerCase().trim();
    const filtered = q
      ? allOptions.filter(o => o.label.toLowerCase().includes(q))
      : allOptions;

    for (const o of filtered) {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.textContent = o.label;
      item.addEventListener('mousedown', e => { e.preventDefault(); selectItem(o.value, o.label); });
      dropdown.appendChild(item);
    }

    if (type) {
      const addItem = document.createElement('div');
      addItem.className = 'search-result-item ef-cb-add';
      addItem.textContent = '➕ Add ' + (q ? '"' + q + '"' : 'new') + ' ' + type;
      addItem.addEventListener('mousedown', e => {
        e.preventDefault();
        closeDropdown();
        openMiniForm(q);
      });
      dropdown.appendChild(addItem);
    }

    if (dropdown.children.length) openDropdown();
    else closeDropdown();
  }

  function selectItem(value, label) {
    selectedValue = value;
    selectedLabel = label;
    hiddenSel.value = value;
    textInp.value = label;
    closeDropdown();
    hiddenSel.dispatchEvent(new Event('change', { bubbles: true }));
    wrap.dispatchEvent(new Event('change'));
    if (formWin) formWin.dispatchEvent(new Event('change'));
  }

  function openMiniForm(prefill) {
    if (miniFormOpen) return;
    miniFormOpen = true;
    const row = wrap.closest('.ef-row') || wrap.parentNode;
    if (row && row.parentNode && !miniFormWrap.parentNode) {
      row.parentNode.insertBefore(miniFormWrap, row.nextSibling);
    }
    miniFormWrap.innerHTML = '';
    miniFormWrap.style.display = '';
    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:0.65rem;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;';
    heading.textContent = 'Add new ' + type;
    miniFormWrap.appendChild(heading);
    const onAdd = item => {
      closeMiniForm();
      if (item) wrap.addOption(item.id, item.name || item.title || item.label || item.id);
    };
    if      (type === 'raga')        buildRagaMiniForm(miniFormWrap, prefill, onAdd);
    else if (type === 'composer')    buildComposerMiniForm(miniFormWrap, prefill, onAdd);
    else if (type === 'composition') buildCompositionMiniForm(miniFormWrap, prefill, onAdd);
    else if (type === 'musician')    buildMusicianMiniForm(miniFormWrap, prefill, onAdd);
  }

  function closeMiniForm() {
    miniFormOpen = false;
    miniFormWrap.style.display = 'none';
    miniFormWrap.innerHTML = '';
    if (miniFormWrap.parentNode) miniFormWrap.parentNode.removeChild(miniFormWrap);
    if (formWin) formWin.dispatchEvent(new Event('input'));
  }

  textInp.addEventListener('focus', () => {
    renderDropdown(textInp.value);
    textInp.select();
  });

  textInp.addEventListener('input', () => {
    selectedValue = '';
    hiddenSel.value = '';
    renderDropdown(textInp.value);
    if (formWin) formWin.dispatchEvent(new Event('input'));
  });

  textInp.addEventListener('blur', () => {
    setTimeout(() => {
      closeDropdown();
      if (selectedLabel) {
        textInp.value = selectedLabel;
      } else {
        selectedValue = '';
        hiddenSel.value = '';
        textInp.value = '';
      }
    }, 150);
  });

  textInp.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.search-result-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdown.style.display === 'none') { renderDropdown(textInp.value); return; }
      setActive(Math.min(activeIdx + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < items.length) {
        items[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
      } else if (type) {
        closeDropdown();
        openMiniForm(textInp.value.trim());
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
      textInp.value = selectedLabel;
      textInp.blur();
    }
  });

  // Reposition on scroll so dropdown tracks the input in scrollable forms
  window.addEventListener('scroll', () => {
    if (dropdown.style.display !== 'none') positionDropdown();
  }, true);

  wrap.getValue = () => selectedValue;
  wrap.setValue = (v, label) => {
    const opt = allOptions.find(o => o.value === v);
    selectItem(v, label || (opt ? opt.label : v));
  };
  wrap.addOption = (value, label) => {
    if (allOptions.find(o => o.value === value)) { selectItem(value, label); return; }
    allOptions.push({ value, label });
    syncHiddenOpts();
    selectItem(value, label);
  };
  wrap.addEventListener = wrap.addEventListener.bind(wrap);
  wrap._select  = hiddenSel;
  wrap._options = allOptions;
  return wrap;
}

// ── Mini inline-creation forms (used by efCombobox "Add missing" option) ─────

function buildMusicianMiniForm(container, prefill, onAdd) {
  const labelInp = efInput(null, 'text', 'e.g. Sanjay Subrahmanyam', prefill || null);
  container.appendChild(efRow('Name', true, null, labelInp));

  const instrumentOpts = ['vocal', 'violin', 'mridangam', 'veena', 'flute', 'nadaswaram', 'ghatam', 'kanjira', 'morsing', 'other']
    .map(v => ({ value: v, label: v }));
  const instrumentSel = efSelect(null, instrumentOpts, false);
  instrumentSel.value = 'vocal';
  container.appendChild(efRow('Instrument', true, null, instrumentSel));

  const eraOpts = ['contemporary', 'classic', 'early'].map(v => ({ value: v, label: v }));
  const eraSel = efSelect(null, eraOpts, false);
  eraSel.value = 'contemporary';
  container.appendChild(efRow('Era', true, null, eraSel));

  const srcInp = efInput(null, 'text', 'https://en.wikipedia.org/wiki/…');
  container.appendChild(efRow('Wikipedia URL', true, null, srcInp));

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'ef-download-btn'; addBtn.style.flex = '1';
  addBtn.textContent = '+ Add musician to bundle';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button'; cancelBtn.className = 'ef-preview-btn';
  cancelBtn.textContent = 'Cancel';
  btnRow.appendChild(addBtn);
  btnRow.appendChild(cancelBtn);
  container.appendChild(btnRow);

  addBtn.addEventListener('click', () => {
    const labelVal = labelInp.value.trim();
    const srcUrl   = srcInp.value.trim();
    if (!labelVal || !srcUrl) return;
    const id = toSnakeCase(labelVal);
    addToBundle('musicians', {
      id, label: labelVal,
      instrument: instrumentSel.value,
      era: eraSel.value,
      sources: [{ url: srcUrl, label: 'Wikipedia', type: 'wikipedia' }],
    });
    onAdd({ id, label: labelVal });
  });
  cancelBtn.addEventListener('click', () => onAdd(null));
}

function buildRagaMiniForm(container, prefill, onAdd) {
  const nameInp = efInput(null, 'text', 'e.g. Suddha Saveri', prefill || null);
  container.appendChild(efRow('Name', true, null, nameInp));

  const melaOpts = [
    { value: 'false', label: 'No — Janya raga' },
    { value: 'true',  label: 'Yes — Melakarta'  },
  ];
  const melaSel = efSelect(null, melaOpts, false);
  melaSel.value = 'false';
  container.appendChild(efRow('Is Melakarta?', true, null, melaSel));

  const parentOpts = (graphData.ragas || []).filter(r => r.is_melakarta)
    .map(r => ({ value: r.id, label: r.name || r.id }));
  const parentSel = efSelect(null, parentOpts, true);
  const parentRow = efRow('Parent Raga', false, 'mela only', parentSel);
  container.appendChild(parentRow);

  melaSel.addEventListener('change', () => {
    parentRow.style.display = melaSel.value === 'false' ? '' : 'none';
  });

  const srcInp = efInput(null, 'text', 'Wikipedia URL', null);
  container.appendChild(efRow('Source URL', false, null, srcInp));

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'ef-download-btn'; addBtn.style.flex = '1';
  addBtn.textContent = '+ Add raga to bundle';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button'; cancelBtn.className = 'ef-preview-btn';
  cancelBtn.textContent = 'Cancel';
  btnRow.appendChild(addBtn);
  btnRow.appendChild(cancelBtn);
  container.appendChild(btnRow);

  addBtn.addEventListener('click', () => {
    const name = nameInp.value.trim();
    if (!name) { nameInp.focus(); return; }
    const id    = toSnakeCase(name);
    const isMela = melaSel.value === 'true';
    const item = {
      id, name, aliases: [], melakarta: null,
      is_melakarta: isMela, cakra: null,
      parent_raga: !isMela && parentSel.value ? parentSel.value : null,
      sources: srcInp.value.trim()
        ? [{ url: srcInp.value.trim(), label: 'Wikipedia', type: 'wikipedia' }] : [],
      notes: null,
    };
    addToBundle('ragas', item);
    onAdd(item);
  });
  cancelBtn.addEventListener('click', () => onAdd(null));
}

function buildComposerMiniForm(container, prefill, onAdd) {
  const nameInp = efInput(null, 'text', 'e.g. Papanasam Sivan', prefill || null);
  container.appendChild(efRow('Name', true, null, nameInp));

  const eraOpts = ['trinity', 'bridge', 'golden_age', 'disseminator', 'living_pillars', 'contemporary'];
  const eraSel  = efSelect(null, eraOpts, true);
  container.appendChild(efRow('Era', false, null, eraSel));

  const srcInp = efInput(null, 'text', 'Wikipedia URL', null);
  container.appendChild(efRow('Source URL', false, null, srcInp));

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'ef-download-btn'; addBtn.style.flex = '1';
  addBtn.textContent = '+ Add composer to bundle';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button'; cancelBtn.className = 'ef-preview-btn';
  cancelBtn.textContent = 'Cancel';
  btnRow.appendChild(addBtn);
  btnRow.appendChild(cancelBtn);
  container.appendChild(btnRow);

  addBtn.addEventListener('click', () => {
    const name = nameInp.value.trim();
    if (!name) { nameInp.focus(); return; }
    const id = toSnakeCase(name);
    const item = {
      id, name, musician_node_id: null, born: null, died: null,
      sources: srcInp.value.trim()
        ? [{ url: srcInp.value.trim(), label: 'Wikipedia', type: 'wikipedia' }] : [],
    };
    if (eraSel.value) item.era = eraSel.value;
    addToBundle('composers', item);
    onAdd(item);
  });
  cancelBtn.addEventListener('click', () => onAdd(null));
}

function buildCompositionMiniForm(container, prefill, onAdd) {
  const titleInp = efInput(null, 'text', 'e.g. Nidhi Chala Sukhama', prefill || null);
  container.appendChild(efRow('Title', true, null, titleInp));

  const composerOpts = (graphData.composers || []).map(c => ({ value: c.id, label: c.name || c.id }));
  const composerSel  = efSelect(null, composerOpts, true);
  container.appendChild(efRow('Composer', true, null, composerSel));

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const ragaSel  = efSelect(null, ragaOpts, true);
  container.appendChild(efRow('Raga', true, null, ragaSel));

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
  const addBtn = document.createElement('button');
  addBtn.type = 'button'; addBtn.className = 'ef-download-btn'; addBtn.style.flex = '1';
  addBtn.textContent = '+ Add composition to bundle';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button'; cancelBtn.className = 'ef-preview-btn';
  cancelBtn.textContent = 'Cancel';
  btnRow.appendChild(addBtn);
  btnRow.appendChild(cancelBtn);
  container.appendChild(btnRow);

  addBtn.addEventListener('click', () => {
    const title = titleInp.value.trim();
    if (!title || !composerSel.value || !ragaSel.value) return;
    const id = toSnakeCase(title);
    addToBundle('compositions', { id, title, composer_id: composerSel.value,
      raga_id: ragaSel.value, sources: [], notes: null });
    onAdd({ id, title });
  });
  cancelBtn.addEventListener('click', () => onAdd(null));
}

// ── Composition → Raga/Composer auto-fill ────────────────────────────────────
// When a composition is selected, auto-populate the raga (and optionally
// composer) selects from graphData.compositions. Only fills if the target
// select is currently blank (— none —) so the user can still override.

function wireCompRagaAutofill(compSel, ragaSel, composerSel, formWin) {
  const listenTarget = compSel._select || compSel;
  listenTarget.addEventListener('change', () => {
    const compId = compSel.getValue ? compSel.getValue() : compSel.value;
    if (!compId) return;
    const comp = (graphData.compositions || []).find(c => c.id === compId);
    if (!comp) return;

    if (ragaSel && comp.raga_id) {
      if (ragaSel.setValue) {
        const ro = (graphData.ragas || []).find(r => r.id === comp.raga_id);
        ragaSel.setValue(comp.raga_id, ro ? ro.name : comp.raga_id);
      } else { ragaSel.value = comp.raga_id; }
    }
    if (composerSel && comp.composer_id) {
      if (composerSel.setValue) {
        const co = (graphData.composers || []).find(c => c.id === comp.composer_id);
        composerSel.setValue(comp.composer_id, co ? co.name : comp.composer_id);
      } else { composerSel.value = comp.composer_id; }
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

// ── Source fields (url-only; label/type inferred from host) ─────────────────
// ADR-097 §4: contributors paste a URL; label and type are derived by
// inferSource() at submit time. The historical Source Label / Source Type
// rows have been removed — the URL host is sufficient signal, and the
// corpus's existing label vocabulary is the seed for the inference table.

const SOURCE_HOST_LABELS = [
  // [host-suffix-or-substring, label, type]
  ['wikipedia.org',         'Wikipedia',         'wikipedia'],
  ['wikisource.org',        'Wikisource',        'wikipedia'],
  ['karnatik.com',          'karnatik.com',      'article'],
  ['sangeethamshare.org',   'sangeethamshare',   'article'],
  ['archive.org',           'Internet Archive',  'archive'],
  ['sruti.com',             'Sruti',             'article'],
  ['carnaticheritage.in',   'Carnatic Heritage', 'article'],
  ['indiaartreview.com',    'India Art Review',  'article'],
  ['eambalam.com',          'eambalam',          'article'],
  ['rasikas.org',           'Rasikas.org',       'article'],
];

function inferSource(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return { url: '', label: '', type: 'other' };
  let host = '';
  try { host = new URL(trimmed).hostname.toLowerCase(); }
  catch (_e) { host = ''; }
  for (const [needle, label, type] of SOURCE_HOST_LABELS) {
    if (host.endsWith(needle) || host.includes(needle)) {
      return { url: trimmed, label, type };
    }
  }
  if (/\.pdf(\?|#|$)/i.test(trimmed)) {
    return { url: trimmed, label: 'PDF', type: 'pdf' };
  }
  return { url: trimmed, label: host || trimmed, type: 'other' };
}

function efSourceFields(prefix, defaults) {
  const d = defaults || {};
  const frag = document.createDocumentFragment();

  const urlInp = efInput(prefix + '_source_url', 'text', 'https://en.wikipedia.org/wiki/…');
  if (d.url) urlInp.value = d.url;
  frag.appendChild(efRow('Source URL', true, 'label and type inferred from host', urlInp));

  return frag;
}

// ── PATCH_METADATA — mirrors writer.py PATCHABLE_*_FIELDS (ADR-097 §6) ────────
// Drives buildEditForm(): field lists, value-input types, append selectors.
// MVP entities: musician, raga, edge, composition, composer.
const PATCH_METADATA = {
  musician: {
    bucket:          'musicians',
    label:           'Musician',
    pickLabel:       'Pick Musician',
    pickOpts:        () => (graphData.nodes || []).map(n => ({ value: n.id, label: n.label })),
    patchFields:     ['label', 'born', 'died', 'era', 'instrument', 'bani'],
    appendArrays:    ['youtube', 'sources'],
    supportsAnnotate: true,
    fieldMeta: {
      label:      { inputType: 'text',   placeholder: 'Display name' },
      born:       { inputType: 'number', placeholder: 'e.g. 1908',          min: 1600, max: 2030 },
      died:       { inputType: 'number', placeholder: 'leave blank if living', min: 1600, max: 2030 },
      era:        { inputType: 'select', opts: ['trinity','bridge','golden_age','disseminator','living_pillars','contemporary'] },
      instrument: { inputType: 'select', opts: ['vocal','veena','violin','flute','mridangam','bharatanatyam','ghatam','other'] },
      bani:       { inputType: 'text',   placeholder: 'e.g. Ariyakudi, Semmangudi' },
    },
  },
  raga: {
    bucket:          'ragas',
    label:           'Raga',
    pickLabel:       'Pick Raga',
    pickOpts:        () => (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id })),
    patchFields:     ['name', 'parent_raga', 'melakarta', 'is_melakarta', 'cakra', 'notes'],
    appendArrays:    ['aliases'],
    supportsAnnotate: true,
    fieldMeta: {
      name:         { inputType: 'text',     placeholder: 'Raga name' },
      parent_raga:  { inputType: 'combobox', optsGetter: () => (graphData.ragas || []).filter(r => r.is_melakarta).map(r => ({ value: r.id, label: r.name || r.id })) },
      melakarta:    { inputType: 'number',   placeholder: '1–72',  min: 1, max: 72 },
      is_melakarta: { inputType: 'select',   opts: [{ value: 'true', label: 'Yes — Melakarta' }, { value: 'false', label: 'No — Janya' }] },
      cakra:        { inputType: 'number',   placeholder: '1–12',  min: 1, max: 12 },
      notes:        { inputType: 'text',     placeholder: 'musicological note' },
    },
  },
  edge: {
    bucket:          'edges',
    label:           'Edge (Guru→Shishya)',
    pickLabel:       null,   // edges use source+target pair; no single-entity pick
    patchFields:     ['confidence', 'source_url', 'note'],
    appendArrays:    [],
    supportsAnnotate: false,
    fieldMeta: {
      confidence:  { inputType: 'number', placeholder: '0.0–1.0', min: 0, max: 1, step: 0.01 },
      source_url:  { inputType: 'text',   placeholder: 'https://…' },
      note:        { inputType: 'text',   placeholder: 'e.g. principal guru' },
    },
  },
  composition: {
    bucket:          'compositions',
    label:           'Composition',
    pickLabel:       'Pick Composition',
    pickOpts:        () => (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id })),
    patchFields:     ['title', 'tala', 'language'],
    appendArrays:    [],
    supportsAnnotate: true,
    fieldMeta: {
      title:    { inputType: 'text',   placeholder: 'Composition title' },
      tala:     { inputType: 'select', opts: ['adi','rupakam','misra_capu','khanda_capu','tisra_triputa','ata','dhruva','other'] },
      language: { inputType: 'select', opts: ['Telugu','Sanskrit','Tamil','Kannada','Malayalam','Other'] },
    },
  },
  composer: {
    bucket:          'composers',
    label:           'Composer',
    pickLabel:       'Pick Composer',
    pickOpts:        () => (graphData.composers || []).map(c => ({ value: c.id, label: c.name || c.id })),
    patchFields:     ['name', 'born', 'died'],
    appendArrays:    [],
    supportsAnnotate: true,
    fieldMeta: {
      name: { inputType: 'text',   placeholder: 'Composer name' },
      born: { inputType: 'number', placeholder: 'e.g. 1890', min: 1600, max: 2030 },
      died: { inputType: 'number', placeholder: 'e.g. 1950', min: 1600, max: 2030 },
    },
  },
};

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
    case 'musician_recordings': buildMusicianRecordingsForm(); break;
    case 'musician':            buildMusicianForm();           break;
    case 'raga':                buildRagaForm();               break;
    case 'composition':         buildCompositionForm();        break;
    case 'recording':           buildRecordingForm();          break;
    case 'composer':            buildComposerForm();           break;
    case 'edit':                buildEditForm();               break;
    // legacy alias — kept for backwards compat
    case 'youtube':             buildMusicianRecordingsForm(); break;
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

  // ADR-097 §5: Bani / Gharana removed from create form — bani is a
  // librarian-set property, not a contributor-asserted field at intake.

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
    const dupId   = existingIds.includes(id);
    const ok = label && id && era && instr && srcUrl && !dupId;
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

  // ── Lecdem toggle (ADR-082) ───────────────────────────────────────────────
  const lecdemLabel = document.createElement('label');
  lecdemLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.7rem;color:var(--fg-muted);margin-bottom:6px;cursor:pointer;';
  const lecdemCheck = document.createElement('input');
  lecdemCheck.type = 'checkbox';
  lecdemCheck.style.margin = '0';
  lecdemLabel.appendChild(lecdemCheck);
  lecdemLabel.appendChild(document.createTextNode('This is a lecture-demonstration'));
  block.appendChild(lecdemLabel);
  block._lecdemCheck = lecdemCheck;

  const urlInp = efInput(null, 'text', 'https://youtu.be/…');
  block.appendChild(efRow('YouTube URL', true, null, urlInp));

  const lblInp = efInput(null, 'text', 'e.g. nidhi chāla sukhama · Kalyāṇi · Ādi');
  block.appendChild(efRow('Label', true, null, lblInp));

  // ── Recital fields (hidden when lecdem ON) ────────────────────────────────
  const recitalFields = document.createElement('div');
  recitalFields.className = 'ef-recital-fields';

  const compOpts = (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id }));
  const compSel = efCombobox(null, compOpts, 'composition', formWin);
  recitalFields.appendChild(efRow('Composition', false, null, compSel));

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const ragaSel = efCombobox(null, ragaOpts, 'raga', formWin);
  recitalFields.appendChild(efRow('Raga', false, 'auto-filled from composition', ragaSel));

  // Auto-fill raga when composition is selected
  wireCompRagaAutofill(compSel, ragaSel, null, formWin);

  block.appendChild(recitalFields);
  block._compSel = compSel;
  block._ragaSel = ragaSel;

  const yearInp = efInput(null, 'number', 'e.g. 1965', null);
  yearInp.min = 1900; yearInp.max = 2030;
  block.appendChild(efRow('Year', false, null, yearInp));

  const versionInp = efInput(null, 'text', 'e.g. live, studio, 1965 version', null);
  block.appendChild(efRow('Version', false, null, versionInp));

  const talaInp = efInput(null, 'text', 'e.g. adi, rupakam, misra chapu', null);
  block.appendChild(efRow('Tala', false, null, talaInp));

  // ── Accompanists subsection (ADR-070 / ADR-071) ──────────────────────────
  const perfContainer = document.createElement('div');
  perfContainer.className = 'ef-performers-container';
  perfContainer.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px dashed var(--border-soft);';

  const perfHeading = document.createElement('div');
  perfHeading.style.cssText = 'font-size:0.7rem;font-weight:600;color:var(--fg-muted);margin-bottom:4px;';
  perfHeading.textContent = 'Accompanists';
  perfContainer.appendChild(perfHeading);

  const perfHint = document.createElement('div');
  perfHint.style.cssText = 'font-size:0.65rem;color:var(--fg-muted);margin-bottom:6px;';
  perfHint.textContent = 'Lead artist (this musician) is added automatically. Add accompanying violinists, mridangists, etc.';
  perfContainer.appendChild(perfHint);

  const perfRows = document.createElement('div');
  perfRows.className = 'ef-performers-rows';
  perfContainer.appendChild(perfRows);

  const addPerfBtn = efAddBtn('+ Add Accompanist');
  perfContainer.appendChild(addPerfBtn);
  addPerfBtn.addEventListener('click', () => addYoutubePerformerBlock(perfRows, formWin));

  block.appendChild(perfContainer);

  // ── Lecdem subject sections (ADR-082, hidden by default) ─────────────────
  const lecdemFields = document.createElement('div');
  lecdemFields.className = 'ef-lecdem-fields';
  lecdemFields.style.display = 'none';
  lecdemFields.style.marginTop = '8px';
  lecdemFields.style.paddingTop = '8px';
  lecdemFields.style.borderTop = '1px dashed var(--border-soft)';

  const subjectDefs = [
    {
      axis:     'raga_ids',
      label:    'Subjects — Ragas',
      addLabel: '+ Add Raga',
      opts:     () => (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id })),
    },
    {
      axis:     'composition_ids',
      label:    'Subjects — Compositions',
      addLabel: '+ Add Composition',
      opts:     () => (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id })),
    },
    {
      axis:     'musician_ids',
      label:    'Subjects — Musicians',
      addLabel: '+ Add Musician',
      opts:     () => (graphData.nodes || []).map(n => ({ value: n.id, label: n.label })),
    },
  ];

  subjectDefs.forEach(({ axis, label, addLabel, opts }) => {
    const section = document.createElement('div');
    section.className = 'ef-lecdem-section';
    section.dataset.axis = axis;
    section.style.marginBottom = '8px';

    const sHeader = document.createElement('div');
    sHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';

    const sLabel = document.createElement('span');
    sLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:var(--fg-muted);';
    sLabel.textContent = label;
    sHeader.appendChild(sLabel);

    const addBtn = efAddBtn(addLabel);
    sHeader.appendChild(addBtn);
    section.appendChild(sHeader);

    const rowsDiv = document.createElement('div');
    rowsDiv.className = 'ef-lecdem-rows';
    section.appendChild(rowsDiv);

    addBtn.addEventListener('click', () => addLecdemSubjectRow(rowsDiv, opts(), formWin));

    lecdemFields.appendChild(section);
  });

  const escapeHatch = document.createElement('div');
  escapeHatch.style.cssText = 'font-size:0.65rem;color:var(--fg-muted);margin-top:4px;';
  escapeHatch.textContent = 'Entity missing? Use ➕ in the composition / raga / musician forms to add it inline.';
  lecdemFields.appendChild(escapeHatch);

  block.appendChild(lecdemFields);
  block._lecdemFields = lecdemFields;

  // ── Toggle handler ────────────────────────────────────────────────────────
  lecdemCheck.addEventListener('change', () => {
    const on = lecdemCheck.checked;
    recitalFields.style.display = on ? 'none' : '';
    lecdemFields.style.display  = on ? ''     : 'none';
    if (!on) {
      lecdemFields.querySelectorAll('.ef-lecdem-row').forEach(r => r.remove());
    }
    formWin.dispatchEvent(new Event('input'));
  });

  container.appendChild(block);
  formWin.dispatchEvent(new Event('input'));
}

// ── Lecdem subject row (ADR-082) ─────────────────────────────────────────────

function addLecdemSubjectRow(rowsContainer, comboboxOpts, formWin) {
  const row = document.createElement('div');
  row.className = 'ef-lecdem-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px;';

  const sel = efCombobox(null, comboboxOpts, null, formWin);
  sel.style.flex = '1';
  row.appendChild(sel);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.style.cssText = 'background:transparent;border:1px solid var(--border-soft);color:var(--fg-muted);width:24px;height:24px;border-radius:3px;cursor:pointer;';
  removeBtn.addEventListener('click', () => {
    row.remove();
    if (formWin) formWin.dispatchEvent(new Event('input'));
  });
  row.appendChild(removeBtn);

  row._subjectCombobox = sel;
  rowsContainer.appendChild(row);
  if (formWin) formWin.dispatchEvent(new Event('input'));
}

// ── Collect lecdem subjects from a youtube block (ADR-082) ───────────────────

function collectLecdemSubjects(block) {
  const subjects = { raga_ids: [], composition_ids: [], musician_ids: [] };
  const lecdemFields = block._lecdemFields || block.querySelector('.ef-lecdem-fields');
  if (!lecdemFields) return subjects;
  lecdemFields.querySelectorAll('.ef-lecdem-section').forEach(section => {
    const axis = section.dataset.axis;
    if (!subjects[axis]) return;
    section.querySelectorAll('.ef-lecdem-row').forEach(row => {
      const val = row._subjectCombobox && row._subjectCombobox.getValue
        ? row._subjectCombobox.getValue()
        : '';
      if (val) subjects[axis].push(val);
    });
  });
  return subjects;
}

// ── Check for empty lecdem subject rows (ADR-082) ─────────────────────────────
// Returns true if the block is a lecdem and has any subject row with no
// value selected — an invalid state that should disable Download.

function hasEmptyLecdemSubjectRow(block) {
  if (!block._lecdemCheck || !block._lecdemCheck.checked) return false;
  let empty = false;
  block.querySelectorAll('.ef-lecdem-row').forEach(row => {
    const val = row._subjectCombobox && row._subjectCombobox.getValue
      ? row._subjectCombobox.getValue()
      : '';
    if (!val) empty = true;
  });
  return empty;
}

// ── Performer entry block (ADR-070 / ADR-071) ────────────────────────────────
// NB: distinct from `addPerformerBlock` (concert-recording form). Hoisted
// function declarations with the same name shadow each other; keep these
// names disjoint so the YouTube-block accompanist UI is not overwritten.

function addYoutubePerformerBlock(container, formWin) {
  const row = document.createElement('div');
  row.className = 'ef-performer-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px;';

  const musOpts = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
  const musSel = efCombobox(null, musOpts, 'musician', formWin);
  musSel.style.flex = '2';
  row.appendChild(musSel);

  const roleOpts = (window.PERFORMER_ROLES || ['vocal', 'violin', 'mridangam'])
    .map(r => ({ value: r, label: r }));
  const roleSel = efCombobox(null, roleOpts, null, formWin);
  roleSel.style.flex = '1';
  row.appendChild(roleSel);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.style.cssText = 'background:transparent;border:1px solid var(--border-soft);color:var(--fg-muted);width:24px;height:24px;border-radius:3px;cursor:pointer;';
  removeBtn.addEventListener('click', () => {
    row.remove();
    formWin.dispatchEvent(new Event('input'));
  });
  row.appendChild(removeBtn);

  // Mark for collection
  row._musSel  = musSel;
  row._roleSel = roleSel;

  container.appendChild(row);
  formWin.dispatchEvent(new Event('input'));
}

// ── Helper: collect performers from a youtube block, auto-injecting host ─────

function collectYoutubePerformers(block, hostId, hostInstrument) {
  const rows = block.querySelectorAll('.ef-performers-rows .ef-performer-row');
  if (rows.length === 0) return null;
  const out = [];
  const seen = new Set();
  rows.forEach(r => {
    const mid  = r._musSel  && r._musSel.getValue  ? r._musSel.getValue()  : '';
    const role = r._roleSel && r._roleSel.getValue ? r._roleSel.getValue() : '';
    if (!mid || !role) return;
    if (seen.has(mid)) return;
    seen.add(mid);
    out.push({ musician_id: mid, role: role });
  });
  if (out.length === 0) return null;
  // Auto-inject host if missing (ADR-070 invariant B)
  if (hostId && !seen.has(hostId)) {
    out.unshift({ musician_id: hostId, role: hostInstrument || 'vocal' });
  }
  return out;
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
  const nodeSel = efCombobox(null, nodeOpts, 'musician', formWin);
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
  const srcUrl  = win.querySelector('#ef_mus_source_url')   ? win.querySelector('#ef_mus_source_url').value.trim()   : '';
  const inferred = inferSource(srcUrl);
  // ADR-097 §5: bani removed from create form. The field stays in the schema
  // (set later via patch by a librarian) but is not asked at intake.
  const bani    = '';

  // YouTube entries
  const youtube = [];
  win.querySelectorAll('.ef-youtube-block').forEach(block => {
    const inputs   = block.querySelectorAll(':scope > .ef-row input:not([data-combobox-filter])');
    const url      = inputs[0] ? inputs[0].value.trim() : '';
    const lbl      = inputs[1] ? inputs[1].value.trim() : '';
    const year     = inputs[2] ? inputs[2].value        : '';
    const version  = inputs[3] ? inputs[3].value.trim() : '';
    const tala     = inputs[4] ? inputs[4].value.trim() : '';
    const isLecdem = block._lecdemCheck && block._lecdemCheck.checked;
    const compId   = (!isLecdem && block._compSel) ? block._compSel.getValue() : '';
    const ragaId   = (!isLecdem && block._ragaSel) ? block._ragaSel.getValue() : '';
    if (!url) return;
    const entry = { url, label: lbl };
    if (compId)  entry.composition_id = compId;
    if (ragaId)  entry.raga_id        = ragaId;
    if (year)    entry.year           = parseInt(year, 10);
    if (version) entry.version        = version;
    if (tala)    entry.tala           = tala;
    // ADR-070: optional performers[] (host auto-injected when any accompanist present)
    const performers = collectYoutubePerformers(block, id, instr);
    if (performers) entry.performers = performers;
    // ADR-082: lecdem entry
    if (isLecdem) {
      entry.kind     = 'lecdem';
      entry.subjects = collectLecdemSubjects(block);
    }
    youtube.push(entry);
  });

  const nodeJson = {
    id,
    label,
    sources: [inferred],
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
    const inputs    = block.querySelectorAll('input:not([data-combobox-filter])');
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
  // Only melakarta ragas can be parents — filter to is_melakarta=true entries.
  const ragaOpts = (graphData.ragas || []).filter(r => r.is_melakarta).map(r => ({ value: r.id, label: r.name || r.id }));
  const parentSel = efCombobox('ef_raga_parent', ragaOpts, null, win);
  const parentRow = efRow('Parent Raga', false, 'mela ragas only', parentSel, 'not_melakarta');
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
  const bundleBtn = document.createElement('button');
  bundleBtn.className = 'ef-download-btn';
  bundleBtn.textContent = '+ Add to Bundle';
  bundleBtn.disabled = true;

  const dlBtn = document.createElement('button');
  dlBtn.className = 'ef-preview-btn';
  dlBtn.textContent = '⬇ Standalone JSON';
  dlBtn.disabled = true;

  const previewBtn = document.createElement('button');
  previewBtn.className = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(bundleBtn);
  footer.appendChild(dlBtn);
  footer.appendChild(previewBtn);

  function validate() {
    const name    = nameInp.value.trim();
    const id      = idRow._idInput.value.trim();
    const srcUrl  = win.querySelector('#ef_raga_source_url')   ? win.querySelector('#ef_raga_source_url').value.trim()   : '';
    const dupId   = existingIds.includes(id);
    const ok = name && id && srcUrl && !dupId;
    bundleBtn.disabled = !ok;
    dlBtn.disabled     = !ok;
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

  bundleBtn.addEventListener('click', () => {
    const obj = generateRagaJson(win);
    addToBundle('ragas', obj);
    showGenericSuccess(win, obj.id, 'bundle');
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
  // ADR-097 §4: source label/type inferred from URL host.

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
    sources: [inferSource(srcUrl)],
    notes: notes || null,
  };
}

// ── Inline add-new helper ─────────────────────────────────────────────────────
// Renders a "+ Add missing [raga|composer]" expandable sub-form below a select.
// When submitted, pushes the new item to the bundle and refreshes the dropdown.
//
// type:        'raga' | 'composer'
// selectEl:    the <select> element to refresh and auto-select after adding
// formWin:     the parent entry window (to fire input events for validation)
// onAdd(item): optional callback receiving the newly created item object

function createInlineAddSection(containerEl, type, selectEl, formWin, onAdd) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:4px;margin-bottom:8px;';

  // Toggle link
  const toggle = document.createElement('button');
  toggle.type      = 'button';
  toggle.className = 'ef-add-btn';
  toggle.style.cssText = 'font-size:0.66rem;padding:2px 8px;opacity:0.75;';
  toggle.textContent = `+ Add missing ${type}`;
  wrap.appendChild(toggle);

  // Collapsed sub-form container
  const subForm = document.createElement('div');
  subForm.style.cssText = 'display:none;margin-top:6px;padding:8px;background:var(--bg-input);border-radius:4px;border:1px solid var(--border);';
  wrap.appendChild(subForm);

  let isOpen = false;
  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    subForm.style.display  = isOpen ? '' : 'none';
    toggle.textContent = isOpen ? `\u2212 Cancel` : `+ Add missing ${type}`;
  });

  // Build sub-form fields
  if (type === 'raga') {
    const nameInp = efInput(null, 'text', 'Raga name, e.g. Suddha Saveri', null);
    subForm.appendChild(efRow('Name', true, null, nameInp));

    const melaOpts = [
      { value: 'false', label: 'No \u2014 Janya raga' },
      { value: 'true',  label: 'Yes \u2014 Melakarta' },
    ];
    const melaSel = efSelect(null, melaOpts, false);
    melaSel.value = 'false';
    subForm.appendChild(efRow('Is Melakarta?', true, null, melaSel));

    const parentOpts = (graphData.ragas || []).filter(r => r.is_melakarta)
      .map(r => ({ value: r.id, label: r.name || r.id }));
    const parentSel = efSelect(null, parentOpts, true);
    const parentRow = efRow('Parent Raga', false, 'mela only', parentSel);
    subForm.appendChild(parentRow);

    melaSel.addEventListener('change', () => {
      parentRow.style.display = melaSel.value === 'false' ? '' : 'none';
    });

    const srcInp = efInput(null, 'text', 'Wikipedia URL', null);
    subForm.appendChild(efRow('Source URL', false, null, srcInp));

    const addBtn = document.createElement('button');
    addBtn.type      = 'button';
    addBtn.className = 'ef-download-btn';
    addBtn.style.marginTop = '6px';
    addBtn.textContent = '+ Add raga to bundle';
    subForm.appendChild(addBtn);

    addBtn.addEventListener('click', () => {
      const name = nameInp.value.trim();
      if (!name) { nameInp.focus(); return; }
      const id = toSnakeCase(name);
      const isMela = melaSel.value === 'true';
      const item = {
        id, name,
        aliases:      [],
        melakarta:    null,
        is_melakarta: isMela,
        cakra:        null,
        parent_raga:  !isMela && parentSel.value ? parentSel.value : null,
        sources:      srcInp.value.trim() ? [{ url: srcInp.value.trim(), label: 'Wikipedia', type: 'wikipedia' }] : [],
        notes:        null,
      };
      addToBundle('ragas', item);

      // Refresh the parent select with new option and auto-select it
      const newOpt = document.createElement('option');
      newOpt.value       = id;
      newOpt.textContent = name;
      selectEl.appendChild(newOpt);
      selectEl.value = id;
      selectEl.dispatchEvent(new Event('change'));
      formWin.dispatchEvent(new Event('change'));

      // Collapse sub-form
      subForm.style.display = 'none';
      toggle.textContent    = `+ Add missing ${type}`;
      isOpen = false;

      if (onAdd) onAdd(item);
    });

  } else if (type === 'composer') {
    const nameInp = efInput(null, 'text', 'Composer name, e.g. Papanasam Sivan', null);
    subForm.appendChild(efRow('Name', true, null, nameInp));

    const eraOpts = ['trinity', 'bridge', 'golden_age', 'disseminator', 'living_pillars', 'contemporary'];
    const eraSel  = efSelect(null, eraOpts, true);
    subForm.appendChild(efRow('Era', false, null, eraSel));

    const srcInp = efInput(null, 'text', 'Wikipedia URL', null);
    subForm.appendChild(efRow('Source URL', false, null, srcInp));

    const addBtn = document.createElement('button');
    addBtn.type      = 'button';
    addBtn.className = 'ef-download-btn';
    addBtn.style.marginTop = '6px';
    addBtn.textContent = '+ Add composer to bundle';
    subForm.appendChild(addBtn);

    addBtn.addEventListener('click', () => {
      const name = nameInp.value.trim();
      if (!name) { nameInp.focus(); return; }
      const id = toSnakeCase(name);
      const item = {
        id, name,
        musician_node_id: null,
        born:    null,
        died:    null,
        sources: srcInp.value.trim() ? [{ url: srcInp.value.trim(), label: 'Wikipedia', type: 'wikipedia' }] : [],
      };
      if (eraSel.value) item.era = eraSel.value;
      addToBundle('composers', item);

      const newOpt = document.createElement('option');
      newOpt.value       = id;
      newOpt.textContent = name;
      selectEl.appendChild(newOpt);
      selectEl.value = id;
      selectEl.dispatchEvent(new Event('change'));
      formWin.dispatchEvent(new Event('change'));

      subForm.style.display = 'none';
      toggle.textContent    = `+ Add missing ${type}`;
      isOpen = false;

      if (onAdd) onAdd(item);
    });
  }

  containerEl.appendChild(wrap);
}

// ── Composer form ─────────────────────────────────────────────────────────────

function buildComposerForm() {
  const win  = createEntryWindow('Add Composer');
  const body = win.querySelector('.ew-body');

  const existingIds = (graphData.composers || []).map(c => c.id);

  body.appendChild(efSection('Composer Fields'));

  const nameInp = efInput('ef_cmp_name', 'text', 'e.g. Papanasam Sivan', null);
  body.appendChild(efRow('Name', true, null, nameInp));

  const idRow = efIdRow('ef_cmp_id', 'ef_cmp_name', existingIds);
  body.appendChild(idRow);
  nameInp.addEventListener('input', idRow._updateId);

  const eraOpts = ['trinity', 'bridge', 'golden_age', 'disseminator', 'living_pillars', 'contemporary'];
  const eraSel  = efSelect('ef_cmp_era', eraOpts, true);
  body.appendChild(efRow('Era', false, null, eraSel));

  const instrOpts = ['vocal', 'veena', 'violin', 'flute', 'mridangam', 'bharatanatyam', 'ghatam', 'other'];
  const instrSel  = efSelect('ef_cmp_instr', instrOpts, true);
  body.appendChild(efRow('Instrument', false, 'optional', instrSel));

  const bornInp = efInput('ef_cmp_born', 'number', 'e.g. 1890', null);
  bornInp.min = 1600; bornInp.max = 2030;
  body.appendChild(efRow('Born (year)', false, null, bornInp));

  const diedInp = efInput('ef_cmp_died', 'number', 'leave blank if living', null);
  diedInp.min = 1600; diedInp.max = 2030;
  body.appendChild(efRow('Died (year)', false, null, diedInp));

  body.appendChild(efSourceFields('ef_cmp'));

  const footer    = win.querySelector('.ew-footer');
  const bundleBtn = document.createElement('button');
  bundleBtn.className  = 'ef-download-btn';
  bundleBtn.textContent = '+ Add to Bundle';
  bundleBtn.disabled   = true;

  const dlBtn = document.createElement('button');
  dlBtn.className  = 'ef-preview-btn';
  dlBtn.textContent = '\u2b07 Standalone JSON';
  dlBtn.disabled   = true;

  const previewBtn = document.createElement('button');
  previewBtn.className  = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(bundleBtn);
  footer.appendChild(dlBtn);
  footer.appendChild(previewBtn);

  function buildJson() {
    const id      = idRow._idInput.value.trim();
    const name    = nameInp.value.trim();
    const born    = bornInp.value;
    const died    = diedInp.value;
    const srcUrl  = win.querySelector('#ef_cmp_source_url')   ? win.querySelector('#ef_cmp_source_url').value.trim()   : '';
    // ADR-097 §4: source label/type inferred from URL host.
    return {
      id, name,
      musician_node_id: null,
      born:    born ? parseInt(born, 10) : null,
      died:    died ? parseInt(died, 10) : null,
      sources: srcUrl ? [inferSource(srcUrl)] : [],
    };
  }

  function validate() {
    const name   = nameInp.value.trim();
    const id     = idRow._idInput.value.trim();
    const srcUrl = win.querySelector('#ef_cmp_source_url') ? win.querySelector('#ef_cmp_source_url').value.trim() : '';
    const dupId  = existingIds.includes(id);
    const ok = !!(name && id && srcUrl && !dupId);
    bundleBtn.disabled = !ok;
    dlBtn.disabled     = !ok;
    if (previewPre.style.display !== 'none') {
      try { previewPre.textContent = JSON.stringify(buildJson(), null, 2); }
      catch(e) { previewPre.textContent = '(incomplete)'; }
    }
  }

  win.addEventListener('input',  validate);
  win.addEventListener('change', validate);

  previewBtn.addEventListener('click', () => {
    const open = previewPre.style.display !== 'none';
    previewPre.style.display  = open ? 'none' : 'block';
    previewBtn.textContent    = open ? 'Preview JSON' : 'Hide Preview';
    if (!open) { try { previewPre.textContent = JSON.stringify(buildJson(), null, 2); } catch(e) {} }
  });

  bundleBtn.addEventListener('click', () => {
    const obj = buildJson();
    addToBundle('composers', obj);
    showGenericSuccess(win, obj.id, 'bundle');
  });

  dlBtn.addEventListener('click', () => {
    const obj = buildJson();
    downloadJson(obj.id + '.json', obj);
    showGenericSuccess(win, obj.id + '.json', 'carnatic/data/compositions/');
  });

  return win;
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
  const composerSel = efCombobox('ef_comp_composer', composerOpts, 'composer', win);
  body.appendChild(efRow('Composer', true, null, composerSel));

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const ragaSel = efCombobox('ef_comp_raga', ragaOpts, 'raga', win);
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
  const bundleBtn2 = document.createElement('button');
  bundleBtn2.className = 'ef-download-btn';
  bundleBtn2.textContent = '+ Add to Bundle';
  bundleBtn2.disabled = true;

  const dlBtn = document.createElement('button');
  dlBtn.className = 'ef-preview-btn';
  dlBtn.textContent = '⬇ Standalone JSON';
  dlBtn.disabled = true;

  const previewBtn = document.createElement('button');
  previewBtn.className = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(bundleBtn2);
  footer.appendChild(dlBtn);
  footer.appendChild(previewBtn);

  function validate() {
    const title      = titleInp.value.trim();
    const id         = idRow._idInput.value.trim();
    const composerId = composerSel.getValue();
    const ragaId     = ragaSel.getValue();
    const dupId      = existingIds.includes(id);
    const ok = title && id && composerId && ragaId && !dupId;
    bundleBtn2.disabled = !ok;
    dlBtn.disabled      = !ok;
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

  bundleBtn2.addEventListener('click', () => {
    const obj = generateCompositionJson(win);
    addToBundle('compositions', obj);
    showGenericSuccess(win, obj.id, 'bundle');
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
  // ADR-097 §4: source label/type inferred from URL host.

  return {
    id,
    title,
    composer_id: composerId || null,
    raga_id:     ragaId     || null,
    tala:        tala       || null,
    language:    lang       || null,
    sources:     srcUrl ? [inferSource(srcUrl)] : [],
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

  // ADR-097 §4: source label/type inferred from URL host (YouTube here).

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
    const dupId  = existingIds.includes(id);
    const ok = title && id && url && !dupId;
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
  const nodeSel = efCombobox(null, nodeOpts, 'musician', formWin);
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
  const compSel = efCombobox(null, compOpts, 'composition', formWin);
  block.appendChild(efRow('Composition', false, null, compSel));

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const ragaSel = efCombobox(null, ragaOpts, 'raga', formWin);
  block.appendChild(efRow('Raga', false, 'auto-filled from composition', ragaSel));

  const talaOpts = ['adi', 'rupakam', 'misra_capu', 'khanda_capu', 'tisra_triputa', 'ata', 'dhruva', 'other'];
  const talaSel = efSelect(null, talaOpts, true);
  block.appendChild(efRow('Tala', false, null, talaSel));

  const composerOpts = (graphData.composers || []).map(c => ({ value: c.id, label: c.name || c.id }));
  const composerSel = efCombobox(null, composerOpts, 'composer', formWin);
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
  // ADR-097 §4: source label/type inferred from URL host (YouTube here).

  const videoId = extractVideoId(url);

  // Sessions
  const sessions = [];
  let sessionIdx = 1;

  win.querySelectorAll('.ef-session-block').forEach(sBlock => {
    // Performers
    const performers = [];
    sBlock.querySelectorAll('.ef-performer-block').forEach(pBlock => {
      const selects   = pBlock.querySelectorAll('select');
      const inputs    = pBlock.querySelectorAll('input:not([data-combobox-filter])');
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
      const inputs    = pfBlock.querySelectorAll('input:not([data-combobox-filter])');
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
    sources:     url ? [inferSource(url)] : [],
    sessions,
  };
}

// ── Generic post-download success panel ───────────────────────────────────────

function showGenericSuccess(win, filename, directory) {
  const body = win.querySelector('.ew-body');
  body.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'ef-success';

  if (directory === 'bundle') {
    msg.innerHTML = `
      <strong>\u2713 Added <code>${filename}</code> to bundle</strong>
      <p style="margin:8px 0 0;font-size:0.72rem;color:var(--fg-sub);">
        When done, click <strong>\u2B07 Bundle</strong> in the footer to download
        <code>bani_add_bundle.json</code>, then run:
      </p>
      <pre style="margin:6px 0;font-size:0.72rem;">bani-add bani_add_bundle.json\nbani-render</pre>
    `;
  } else {
    msg.innerHTML = `
      <strong>\u2713 Downloaded <code>${filename}</code></strong>
      <ol>
        <li>Copy <code>${filename}</code> to <code>${directory}</code></li>
        <li>Run: <code>bani-render</code></li>
        <li>Refresh <code>graph.html</code></li>
      </ol>
    `;
  }
  body.appendChild(msg);

  const footer = win.querySelector('.ew-footer');
  footer.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ef-preview-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => win.remove());
  footer.appendChild(closeBtn);
}

// ── Add/Edit Musician Recordings form ────────────────────────────────────────
// Merged replacement for the old separate "Add Musician" + "Add YouTube" forms.
// Toggle between "New Musician" and "Existing Musician" modes at the top.

function buildMusicianRecordingsForm() {
  const win = createEntryWindow('Add / Edit Musician Recordings');
  const body = win.querySelector('.ew-body');

  // ── Mode toggle ───────────────────────────────────────────────────────────
  const modeBar = document.createElement('div');
  modeBar.style.cssText = 'display:flex;gap:6px;margin-bottom:12px;';

  const newBtn      = document.createElement('button');
  newBtn.type       = 'button';
  newBtn.className  = 'ef-add-btn';
  newBtn.textContent = '● New Musician';
  newBtn.style.cssText = 'flex:1;font-weight:600;background:var(--accent);color:var(--bg-panel);border-color:var(--accent);';

  const existingBtn      = document.createElement('button');
  existingBtn.type       = 'button';
  existingBtn.className  = 'ef-add-btn';
  existingBtn.textContent = '○ Existing Musician';
  existingBtn.style.flex  = '1';

  modeBar.appendChild(newBtn);
  modeBar.appendChild(existingBtn);
  body.appendChild(modeBar);

  // ── Section: New musician fields ──────────────────────────────────────────
  const newSection = document.createElement('div');
  newSection.id = 'efmr_new_section';

  const existingIds = (graphData.nodes || []).map(n => n.id);

  newSection.appendChild(efSection('Musician'));

  const labelInp = efInput('efmr_label', 'text', 'e.g. Semmangudi Srinivasa Iyer', null);
  newSection.appendChild(efRow('Display Name', true, null, labelInp));

  const idRow = efIdRow('efmr_id', 'efmr_label', existingIds);
  newSection.appendChild(idRow);
  labelInp.addEventListener('input', idRow._updateId);

  const bornInp = efInput('efmr_born', 'number', 'e.g. 1908', null);
  bornInp.min = 1600; bornInp.max = 2030;
  newSection.appendChild(efRow('Born (year)', false, null, bornInp));

  const diedInp = efInput('efmr_died', 'number', 'leave blank if living', null);
  diedInp.min = 1600; diedInp.max = 2030;
  newSection.appendChild(efRow('Died (year)', false, null, diedInp));

  const eraOpts  = ['trinity', 'bridge', 'golden_age', 'disseminator', 'living_pillars', 'contemporary'];
  const eraSel   = efSelect('efmr_era', eraOpts, false);
  newSection.appendChild(efRow('Era', true, null, eraSel));

  const instrOpts = ['vocal', 'veena', 'violin', 'flute', 'mridangam', 'bharatanatyam', 'ghatam', 'other'];
  const instrSel  = efSelect('efmr_instr', instrOpts, false);
  newSection.appendChild(efRow('Instrument', true, null, instrSel));

  // ADR-097 §5: Bani / Gharana removed from create form. The field stays in
  // the schema (set later via patch by a librarian) but is not asked at intake.

  newSection.appendChild(efSourceFields('efmr'));

  // Edges
  newSection.appendChild(efSection('Guru-Shishya Edges'));
  const edgesContainer = document.createElement('div');
  edgesContainer.id = 'efmr_edges';
  newSection.appendChild(edgesContainer);
  const addGuruBtn = efAddBtn('+ Add Guru (this musician is shishya of…)');
  newSection.appendChild(addGuruBtn);
  addGuruBtn.addEventListener('click', () => addEdgeBlock(edgesContainer, 'guru', win));
  const addShishyaBtn = efAddBtn('+ Add Shishya (this musician is guru of…)');
  newSection.appendChild(addShishyaBtn);
  addShishyaBtn.addEventListener('click', () => addEdgeBlock(edgesContainer, 'shishya', win));

  body.appendChild(newSection);

  // ── Section: Existing musician picker ────────────────────────────────────
  const existSection = document.createElement('div');
  existSection.id    = 'efmr_exist_section';
  existSection.style.display = 'none';

  existSection.appendChild(efSection('Select Musician'));

  const nodeOpts    = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
  const musicianSel = efCombobox('efmr_existing_musician', nodeOpts, null, win);
  existSection.appendChild(efRow('Musician', true, null, musicianSel));

  const infoDiv = document.createElement('div');
  infoDiv.style.cssText = 'font-size:0.68rem;color:var(--fg-muted);margin-bottom:8px;';
  existSection.appendChild(infoDiv);

  musicianSel.addEventListener('change', () => {
    const node = (graphData.nodes || []).find(n => n.id === musicianSel.getValue());
    if (node) {
      const count = (node.youtube || []).length;
      infoDiv.textContent = `Currently has ${count} YouTube entr${count === 1 ? 'y' : 'ies'}.`;
    } else {
      infoDiv.textContent = '';
    }
    win.dispatchEvent(new Event('input'));
  });

  body.appendChild(existSection);

  // ── Shared: YouTube entries section ───────────────────────────────────────
  body.appendChild(efSection('YouTube Entries'));

  const ytContainer = document.createElement('div');
  ytContainer.id = 'efmr_youtube';
  body.appendChild(ytContainer);

  const addYtBtn = efAddBtn('+ Add YouTube Entry');
  body.appendChild(addYtBtn);
  addYtBtn.addEventListener('click', () => addYoutubeBlock(ytContainer, win));

  // ── Mode toggle wiring ────────────────────────────────────────────────────
  let mode = 'new';

  function switchMode(m) {
    mode = m;
    if (m === 'new') {
      newSection.style.display = '';
      existSection.style.display = 'none';
      newBtn.style.cssText      = 'flex:1;font-weight:600;background:var(--accent);color:var(--bg-panel);border-color:var(--accent);';
      existingBtn.style.cssText = 'flex:1;';
    } else {
      newSection.style.display = 'none';
      existSection.style.display = '';
      existingBtn.style.cssText = 'flex:1;font-weight:600;background:var(--accent);color:var(--bg-panel);border-color:var(--accent);';
      newBtn.style.cssText      = 'flex:1;';
    }
    win.dispatchEvent(new Event('input'));
  }

  newBtn.addEventListener('click',      () => switchMode('new'));
  existingBtn.addEventListener('click', () => switchMode('existing'));

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = win.querySelector('.ew-footer');

  const bundleBtn = document.createElement('button');
  bundleBtn.className  = 'ef-download-btn';
  bundleBtn.textContent = '+ Add to Bundle';
  bundleBtn.disabled   = true;

  const dlBtn = document.createElement('button');
  dlBtn.className  = 'ef-preview-btn';
  dlBtn.textContent = '⬇ Standalone JSON';
  dlBtn.disabled   = true;

  const previewBtn = document.createElement('button');
  previewBtn.className  = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(bundleBtn);
  footer.appendChild(dlBtn);
  footer.appendChild(previewBtn);

  // ── JSON builders ─────────────────────────────────────────────────────────

  function collectYoutube() {
    const entries = [];
    // Resolve host context for performer auto-injection (ADR-070)
    const hostId = (mode === 'existing' && musicianSel && musicianSel.getValue) ? musicianSel.getValue() : (idRow && idRow._idInput ? idRow._idInput.value.trim() : '');
    const hostNode = (graphData.nodes || []).find(n => n.id === hostId);
    const hostInstrument = hostNode ? hostNode.instrument : (instrSel ? instrSel.value : 'vocal');
    win.querySelectorAll('#efmr_youtube .ef-youtube-block').forEach(block => {
      const inputs   = block.querySelectorAll(':scope > .ef-row input:not([data-combobox-filter])');
      const url      = inputs[0]  ? inputs[0].value.trim()  : '';
      const lbl      = inputs[1]  ? inputs[1].value.trim()  : '';
      const year     = inputs[2]  ? inputs[2].value         : '';
      const version  = inputs[3]  ? inputs[3].value.trim()  : '';
      const tala     = inputs[4]  ? inputs[4].value.trim()  : '';
      const isLecdem = block._lecdemCheck && block._lecdemCheck.checked;
      const compId   = (!isLecdem && block._compSel) ? block._compSel.getValue() : '';
      const ragaId   = (!isLecdem && block._ragaSel) ? block._ragaSel.getValue() : '';
      if (!url) return;
      const entry = { url, label: lbl };
      if (compId)  entry.composition_id = compId;
      if (ragaId)  entry.raga_id        = ragaId;
      if (year)    entry.year           = parseInt(year, 10);
      if (version) entry.version        = version;
      if (tala)    entry.tala           = tala;
      const performers = collectYoutubePerformers(block, hostId, hostInstrument);
      if (performers) entry.performers = performers;
      // ADR-082: lecdem entry
      if (isLecdem) {
        entry.kind     = 'lecdem';
        entry.subjects = collectLecdemSubjects(block);
      }
      entries.push(entry);
    });
    return entries;
  }

  function collectEdges(musId) {
    const edges = [];
    win.querySelectorAll('#efmr_edges .ef-repeat-block').forEach(block => {
      const direction = block.dataset.direction;
      const selects   = block.querySelectorAll('select');
      const inputs    = block.querySelectorAll('input:not([data-combobox-filter])');
      const otherId   = selects[0] ? selects[0].value      : '';
      const conf      = inputs[0]  ? parseFloat(inputs[0].value) : 0.90;
      const edgeSrc   = inputs[1]  ? inputs[1].value.trim() : '';
      const note      = inputs[2]  ? inputs[2].value.trim() : '';
      if (!otherId) return;
      const source = direction === 'guru' ? otherId : musId;
      const target = direction === 'guru' ? musId   : otherId;
      edges.push({ source, target, confidence: conf, source_url: edgeSrc, note: note || null });
    });
    return edges;
  }

  function buildBundleItem() {
    if (mode === 'new') {
      const id      = idRow._idInput.value.trim();
      const label   = labelInp.value.trim();
      const born    = bornInp.value;
      const died    = diedInp.value;
      const era     = eraSel.value;
      const instr   = instrSel.value;
      const srcUrl  = win.querySelector('#efmr_source_url')   ? win.querySelector('#efmr_source_url').value.trim()   : '';
      // ADR-097 §4/§5: source label/type inferred; bani not collected at intake.
      return {
        type:    'new',
        id, label,
        sources: [inferSource(srcUrl)],
        born:    born  ? parseInt(born,  10) : null,
        died:    died  ? parseInt(died,  10) : null,
        era, instrument: instr,
        bani: null,
        youtube: collectYoutube(),
        _edges:  collectEdges(id),   // stored separately, not in musician node
      };
    } else {
      const musician_id = musicianSel.getValue();
      return { type: 'youtube_append', musician_id, youtube: collectYoutube() };
    }
  }

  function buildStandaloneMusician() {
    if (mode === 'existing') {
      const node = (graphData.nodes || []).find(n => n.id === musicianSel.getValue());
      if (!node) return null;
      const existingYoutube = (node.youtube || []).map(t => {
        if (t.url) return t;
        if (t.vid) {
          const norm = { url: 'https://youtu.be/' + t.vid, label: t.label || '' };
          if (t.composition_id) norm.composition_id = t.composition_id;
          if (t.raga_id)        norm.raga_id        = t.raga_id;
          if (t.year)           norm.year           = t.year;
          if (t.version)        norm.version        = t.version;
          if (t.tala)           norm.tala           = t.tala;
          return norm;
        }
        return t;
      });
      return {
        id:         node.id,
        label:      node.label,
        sources:    node.sources    || [],
        born:       node.born       || null,
        died:       node.died       || null,
        era:        node.era        || '',
        instrument: node.instrument || '',
        bani:       node.bani       || null,
        youtube:    [...existingYoutube, ...collectYoutube()],
      };
    }
    // new mode
    const id      = idRow._idInput.value.trim();
    const label   = labelInp.value.trim();
    const srcUrl  = win.querySelector('#efmr_source_url')   ? win.querySelector('#efmr_source_url').value.trim()   : '';
    // ADR-097 §4/§5: source label/type inferred; bani not collected at intake.
    return {
      id, label,
      sources:    [inferSource(srcUrl)],
      born:       bornInp.value  ? parseInt(bornInp.value,  10) : null,
      died:       diedInp.value  ? parseInt(diedInp.value,  10) : null,
      era:        eraSel.value,
      instrument: instrSel.value,
      bani:       null,
      youtube:    collectYoutube(),
    };
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validate() {
    let ok = false;
    if (mode === 'new') {
      const label   = labelInp.value.trim();
      const id      = idRow._idInput.value.trim();
      const era     = eraSel.value;
      const instr   = instrSel.value;
      const srcUrl  = win.querySelector('#efmr_source_url')   ? win.querySelector('#efmr_source_url').value.trim()   : '';
      const dupId   = existingIds.includes(id);
      ok = !!(label && id && era && instr && srcUrl && !dupId);
    } else {
      let lecdemInvalid = false;
      win.querySelectorAll('#efmr_youtube .ef-youtube-block').forEach(b => {
        if (hasEmptyLecdemSubjectRow(b)) lecdemInvalid = true;
      });
      ok = !!(musicianSel.getValue() && win.querySelectorAll('#efmr_youtube .ef-youtube-block').length > 0 && !lecdemInvalid);
    }
    bundleBtn.disabled = !ok;
    dlBtn.disabled     = !ok;
    if (previewPre.style.display !== 'none') updatePreview();
  }

  function updatePreview() {
    try {
      previewPre.textContent = JSON.stringify(buildStandaloneMusician(), null, 2);
    } catch(e) { previewPre.textContent = '(incomplete)'; }
  }

  win.addEventListener('input',  validate);
  win.addEventListener('change', validate);

  previewBtn.addEventListener('click', () => {
    const open = previewPre.style.display !== 'none';
    previewPre.style.display  = open ? 'none' : 'block';
    previewBtn.textContent    = open ? 'Preview JSON' : 'Hide Preview';
    if (!open) updatePreview();
  });

  bundleBtn.addEventListener('click', () => {
    const item = buildBundleItem();
    // Edges for new musicians are stored separately in bundle.items.edges
    if (item._edges && item._edges.length > 0) {
      item._edges.forEach(e => addToBundle('edges', e));
    }
    delete item._edges;
    addToBundle('musicians', item);
    showBundleSuccess(win, mode === 'new' ? item.id : item.musician_id, mode);
  });

  dlBtn.addEventListener('click', () => {
    const obj = buildStandaloneMusician();
    if (!obj) return;
    downloadJson(obj.id + '.json', obj);
    if (mode === 'new') {
      const edges = collectEdges(obj.id);
      if (edges.length > 0) {
        const allEdges = [...(graphData.edges || []), ...edges];
        setTimeout(() => downloadJson('_edges.json', allEdges), 300);
      }
    }
  });

  return win;
}

function showBundleSuccess(win, id, mode) {
  const body = win.querySelector('.ew-body');
  body.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'ef-success';
  const desc = mode === 'new'
    ? `New musician <code>${id}</code>`
    : `YouTube entries for <code>${id}</code>`;
  msg.innerHTML = `
    <strong>\u2713 Added to bundle: ${desc}</strong>
    <p style="margin:8px 0 0;font-size:0.72rem;color:var(--fg-sub);">
      When done adding items, click <strong>\u2B07 Bundle</strong> in the footer to download
      <code>bani_add_bundle.json</code>, then run:
    </p>
    <pre style="margin:6px 0;font-size:0.72rem;">bani-add bani_add_bundle.json\nbani-render</pre>
  `;
  body.appendChild(msg);

  const footer = win.querySelector('.ew-footer');
  footer.innerHTML = '';

  const addMoreBtn = document.createElement('button');
  addMoreBtn.className  = 'ef-preview-btn';
  addMoreBtn.textContent = 'Add another musician';
  addMoreBtn.addEventListener('click', () => {
    win.remove();
    buildMusicianRecordingsForm();
  });

  const closeBtn = document.createElement('button');
  closeBtn.className  = 'ef-preview-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => win.remove());

  footer.appendChild(addMoreBtn);
  footer.appendChild(closeBtn);
}

// ── Add YouTube to Existing Musician form (legacy — kept for internal use) ────

function buildAddYoutubeForm() {
  const win = createEntryWindow('Add YouTube to Musician');
  const body = win.querySelector('.ew-body');

  body.appendChild(efSection('Select Musician'));

  const nodeOpts = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
  const musicianSel = efCombobox('ef_yt_musician', nodeOpts, null, win);
  body.appendChild(efRow('Musician', true, null, musicianSel));

  // Info row — shows selected musician's current YouTube count
  const infoDiv = document.createElement('div');
  infoDiv.style.cssText = 'font-size:0.68rem;color:var(--fg-muted);margin-bottom:8px;';
  body.appendChild(infoDiv);

  musicianSel.addEventListener('change', () => {
    const node = (graphData.nodes || []).find(n => n.id === musicianSel.getValue());
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
    const node = (graphData.nodes || []).find(n => n.id === musicianSel.getValue());
    if (!node) return null;

    // Collect new YouTube entries from the form
    const newEntries = [];
    const hostId = node.id;
    const hostInstrument = node.instrument || 'vocal';
    win.querySelectorAll('.ef-youtube-block').forEach(block => {
      const inputs   = block.querySelectorAll(':scope > .ef-row input:not([data-combobox-filter])');
      const url      = inputs[0]  ? inputs[0].value.trim()  : '';
      const lbl      = inputs[1]  ? inputs[1].value.trim()  : '';
      const year     = inputs[2]  ? inputs[2].value         : '';
      const version  = inputs[3]  ? inputs[3].value.trim()  : '';
      const tala     = inputs[4]  ? inputs[4].value.trim()  : '';
      const isLecdem = block._lecdemCheck && block._lecdemCheck.checked;
      const compId   = (!isLecdem && block._compSel) ? block._compSel.getValue() : '';
      const ragaId   = (!isLecdem && block._ragaSel) ? block._ragaSel.getValue() : '';
      if (!url) return;
      const entry = { url, label: lbl };
      if (compId)  entry.composition_id = compId;
      if (ragaId)  entry.raga_id        = ragaId;
      if (year)    entry.year           = parseInt(year, 10);
      if (version) entry.version        = version;
      if (tala)    entry.tala           = tala;
      const performers = collectYoutubePerformers(block, hostId, hostInstrument);
      if (performers) entry.performers = performers;
      // ADR-082: lecdem entry
      if (isLecdem) {
        entry.kind     = 'lecdem';
        entry.subjects = collectLecdemSubjects(block);
      }
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
        if (t.tala)           norm.tala           = t.tala;
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
    const musId    = musicianSel.getValue();
    const hasEntry = win.querySelectorAll('.ef-youtube-block').length > 0;
    // At least one entry with a URL
    let hasUrl = false;
    win.querySelectorAll('.ef-youtube-block').forEach(block => {
      const urlInp = block.querySelector(':scope > .ef-row input:not([data-combobox-filter])');
      if (urlInp && urlInp.value.trim()) hasUrl = true;
    });
    let lecdemInvalid = false;
    win.querySelectorAll('.ef-youtube-block').forEach(b => {
      if (hasEmptyLecdemSubjectRow(b)) lecdemInvalid = true;
    });
    dlBtn.disabled = !(musId && hasEntry && hasUrl && !lecdemInvalid);
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

// ── buildEditForm — ADR-097 §6: Unified Edit form (dispatch surface) ───────
// Lets contributors patch a single field, append to an array, or annotate
// any first-class entity without leaving the in-browser loop.
// MVP entities: musician, raga, edge, composition, composer.
// Each "Stage" button pushes a delta item (op: 'patch'|'append'|'annotate')
// into the shared baniBundle; download emits schema_version 2.

function buildEditForm() {
  const win  = createEntryWindow('Edit Entity');
  const body = win.querySelector('.ew-body');
  const foot = win.querySelector('.ew-footer');

  // ── Entity type selector ─────────────────────────────────────────────────
  body.appendChild(efSection('Entity Type'));

  const typeKeys = Object.keys(PATCH_METADATA);
  const typeSel  = efSelect('ef_edit_type', typeKeys.map(k => ({
    value: k,
    label: PATCH_METADATA[k].label,
  })), false);
  typeSel.value = 'musician';
  body.appendChild(efRow('Type', true, null, typeSel));

  // ── Entity picker — dynamic per type ────────────────────────────────────
  const pickerWrap     = document.createElement('div');
  pickerWrap.id        = 'ef_edit_picker_wrap';
  body.appendChild(pickerWrap);

  const edgePickerWrap = document.createElement('div');
  edgePickerWrap.id    = 'ef_edit_edge_picker';
  body.appendChild(edgePickerWrap);

  // ── Operations area — rebuilt when type changes ──────────────────────────
  const opsWrap = document.createElement('div');
  opsWrap.id    = 'ef_edit_ops';
  body.appendChild(opsWrap);

  const stageCount = document.createElement('div');
  stageCount.id = 'ef_edit_stage_count';
  stageCount.style.cssText = 'font-size:0.68rem;color:var(--accent);margin-top:8px;min-height:1em;';
  body.appendChild(stageCount);

  function updateStageCount() {
    const total = Object.values(baniBundle).reduce(
      (s, arr) => s + arr.filter(i => i.op && i.op !== 'create').length, 0
    );
    stageCount.textContent = total > 0
      ? `${total} delta item${total === 1 ? '' : 's'} staged in bundle`
      : '';
  }

  // Current picker comboboxes — set by rebuildPicker()
  let cbPicker     = null;   // used for all non-edge types
  let cbEdgeSrc    = null;   // edge source
  let cbEdgeTgt    = null;   // edge target

  function rebuildPicker() {
    const typeKey = typeSel.value;
    const meta    = PATCH_METADATA[typeKey];
    pickerWrap.innerHTML    = '';
    edgePickerWrap.innerHTML = '';

    if (typeKey === 'edge') {
      pickerWrap.style.display    = 'none';
      edgePickerWrap.style.display = '';
      const nodeOpts  = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
      cbEdgeSrc = efCombobox('ef_edit_edge_source', nodeOpts, null, win);
      cbEdgeTgt = efCombobox('ef_edit_edge_target', nodeOpts, null, win);
      edgePickerWrap.appendChild(efRow('Source (Guru)',    true, null, cbEdgeSrc));
      edgePickerWrap.appendChild(efRow('Target (Shishya)', true, null, cbEdgeTgt));
      cbPicker = null;
    } else {
      pickerWrap.style.display    = '';
      edgePickerWrap.style.display = 'none';
      const pickOpts = meta.pickOpts ? meta.pickOpts() : [];
      cbPicker = efCombobox('ef_edit_pick', pickOpts, null, win);
      pickerWrap.appendChild(efRow(meta.pickLabel || 'Pick entity', true, null, cbPicker));
      cbEdgeSrc = null;
      cbEdgeTgt = null;
    }
  }

  // Helper: build value input appropriate for a field's type metadata
  function buildValueInput(fieldKey, meta) {
    const fm = (meta.fieldMeta && meta.fieldMeta[fieldKey]) || { inputType: 'text' };
    if (fm.inputType === 'select') {
      const opts = (fm.opts || []).map(o => (typeof o === 'string') ? { value: o, label: o } : o);
      return efSelect('ef_edit_value', opts, true);
    }
    if (fm.inputType === 'combobox') {
      const opts = fm.optsGetter ? fm.optsGetter() : [];
      return efCombobox('ef_edit_value', opts, null, win);
    }
    const inp = efInput('ef_edit_value', fm.inputType || 'text', fm.placeholder || '', null);
    if (fm.min  !== undefined) inp.min  = fm.min;
    if (fm.max  !== undefined) inp.max  = fm.max;
    if (fm.step !== undefined) inp.step = fm.step;
    return inp;
  }

  function buildOpsArea() {
    opsWrap.innerHTML = '';
    const typeKey = typeSel.value;
    const meta    = PATCH_METADATA[typeKey];

    // ── PATCH FIELD ────────────────────────────────────────────────────────
    {
      const sec = document.createElement('div');
      sec.className = 'ef-section';
      sec.style.marginTop = '12px';
      sec.textContent = 'Patch Field';
      opsWrap.appendChild(sec);

      const fieldSel = efSelect('ef_edit_patch_field',
        meta.patchFields.map(f => ({ value: f, label: f })), true);
      opsWrap.appendChild(efRow('Field', true, null, fieldSel));

      const valueWrap  = document.createElement('div');
      opsWrap.appendChild(valueWrap);

      function rebuildValueWrap() {
        valueWrap.innerHTML  = '';
        valueWrap._inp = null;
        const field = fieldSel.value;
        if (!field) return;
        const inp = buildValueInput(field, meta);
        valueWrap.appendChild(efRow('New Value', true, null, inp));
        valueWrap._inp = inp;
      }
      fieldSel.addEventListener('change', rebuildValueWrap);
      rebuildValueWrap();

      const patchBtn = document.createElement('button');
      patchBtn.type      = 'button';
      patchBtn.className = 'ef-add-btn';
      patchBtn.style.cssText = 'margin-top:6px;';
      patchBtn.textContent   = '+ Stage patch \u2192 bundle';
      patchBtn.addEventListener('click', () => {
        const field = fieldSel.value;
        if (!field) { fieldSel.focus(); return; }
        const inp = valueWrap._inp;
        if (!inp) return;
        const raw = (inp.getValue ? inp.getValue() : inp.value);
        if (raw === null || raw === '' || raw === undefined) return;

        const fm = (meta.fieldMeta && meta.fieldMeta[field]) || {};
        let value = raw;
        if (fm.inputType === 'number') {
          value = parseFloat(raw);
          if (isNaN(value)) return;
        }

        let item;
        if (typeKey === 'edge') {
          const src = cbEdgeSrc ? cbEdgeSrc.getValue() : '';
          const tgt = cbEdgeTgt ? cbEdgeTgt.getValue() : '';
          if (!src || !tgt) return;
          item = { op: 'patch', source: src, target: tgt, field, value };
        } else {
          const entityId = cbPicker ? cbPicker.getValue() : '';
          if (!entityId) return;
          item = { op: 'patch', id: entityId, field, value };
        }
        addToBundle(meta.bucket, item);
        updateStageCount();
        patchBtn.textContent = '\u2713 Staged!';
        setTimeout(() => { patchBtn.textContent = '+ Stage patch \u2192 bundle'; }, 1400);
      });
      opsWrap.appendChild(patchBtn);
    }

    // ── APPEND TO ARRAY ────────────────────────────────────────────────────
    if (meta.appendArrays && meta.appendArrays.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'ef-section';
      sec.style.marginTop = '12px';
      sec.textContent = 'Append to Array';
      opsWrap.appendChild(sec);

      const arraySel = efSelect('ef_edit_array',
        meta.appendArrays.map(a => ({ value: a, label: a })), true);
      opsWrap.appendChild(efRow('Array', true, null, arraySel));

      const elemWrap = document.createElement('div');
      opsWrap.appendChild(elemWrap);

      function rebuildElemWrap() {
        elemWrap.innerHTML = '';
        elemWrap._isYoutube = false;
        const arr = arraySel.value;
        if (!arr) return;

        if (arr === 'youtube') {
          // Reuse existing youtube block UI — host-id injection handles performers
          const hint = document.createElement('div');
          hint.style.cssText = 'font-size:0.67rem;color:var(--fg-muted);margin:4px 0;';
          hint.textContent = 'Fill in the entry below, then click Stage.';
          elemWrap.appendChild(hint);
          addYoutubeBlock(elemWrap, win);
          elemWrap._isYoutube = true;
        } else if (arr === 'sources') {
          const u = efInput('ef_edit_ap_srcurl', 'text', 'https://en.wikipedia.org/wiki/\u2026');
          elemWrap.appendChild(efRow('Source URL', true, null, u));
        } else if (arr === 'aliases') {
          const a = efInput('ef_edit_ap_alias', 'text', 'one alias at a time');
          elemWrap.appendChild(efRow('Alias', true, 'one per click', a));
        }
      }
      arraySel.addEventListener('change', rebuildElemWrap);
      rebuildElemWrap();

      const appendBtn = document.createElement('button');
      appendBtn.type      = 'button';
      appendBtn.className = 'ef-add-btn';
      appendBtn.style.cssText = 'margin-top:6px;';
      appendBtn.textContent   = '+ Stage append \u2192 bundle';
      appendBtn.addEventListener('click', () => {
        const arr      = arraySel.value;
        if (!arr) { arraySel.focus(); return; }
        const entityId = cbPicker ? cbPicker.getValue() : '';
        if (!entityId) return;

        if (elemWrap._isYoutube) {
          const block   = elemWrap.querySelector('.ef-youtube-block');
          if (!block) return;
          const inputs  = block.querySelectorAll(':scope > .ef-row input:not([data-combobox-filter])');
          const url     = inputs[0] ? inputs[0].value.trim() : '';
          const lbl     = inputs[1] ? inputs[1].value.trim() : '';
          const year    = inputs[2] ? inputs[2].value        : '';
          const version = inputs[3] ? inputs[3].value.trim() : '';
          const tala    = inputs[4] ? inputs[4].value.trim() : '';
          const isLecdem = block._lecdemCheck && block._lecdemCheck.checked;
          const compId  = (!isLecdem && block._compSel) ? block._compSel.getValue() : '';
          const ragaId  = (!isLecdem && block._ragaSel) ? block._ragaSel.getValue() : '';
          if (!url) return;
          const entry = { url, label: lbl };
          if (compId)  entry.composition_id = compId;
          if (ragaId)  entry.raga_id        = ragaId;
          if (year)    entry.year           = parseInt(year, 10);
          if (version) entry.version        = version;
          if (tala)    entry.tala           = tala;
          const node = (graphData.nodes || []).find(n => n.id === entityId);
          const perfs = collectYoutubePerformers(block, entityId, node ? node.instrument : '');
          if (perfs) entry.performers = perfs;
          if (isLecdem) { entry.kind = 'lecdem'; entry.subjects = collectLecdemSubjects(block); }
          addToBundle('musicians', { op: 'append', id: entityId, array: 'youtube', value: entry });
        } else if (arr === 'sources') {
          const u = elemWrap.querySelector('#ef_edit_ap_srcurl');
          if (!u || !u.value.trim()) return;
          addToBundle(meta.bucket, { op: 'append', id: entityId, array: 'sources', value: inferSource(u.value.trim()) });
        } else if (arr === 'aliases') {
          const a = elemWrap.querySelector('#ef_edit_ap_alias');
          if (!a || !a.value.trim()) return;
          addToBundle(meta.bucket, { op: 'append', id: entityId, array: 'aliases', value: a.value.trim() });
          a.value = '';
        }
        updateStageCount();
        appendBtn.textContent = '\u2713 Staged!';
        setTimeout(() => { appendBtn.textContent = '+ Stage append \u2192 bundle'; }, 1400);
      });
      opsWrap.appendChild(appendBtn);
    }

    // ── ADD NOTE ──────────────────────────────────────────────────────────
    if (meta.supportsAnnotate) {
      const sec = document.createElement('div');
      sec.className = 'ef-section';
      sec.style.marginTop = '12px';
      sec.textContent = 'Add Note';
      opsWrap.appendChild(sec);

      const ta = document.createElement('textarea');
      ta.className   = 'ef-input';
      ta.rows        = 3;
      ta.placeholder = 'Free-form note about this entity\u2026';
      ta.style.resize = 'vertical';
      opsWrap.appendChild(efRow('Note Text', true, null, ta));

      const noteSrcInp = efInput('ef_edit_note_src', 'text', 'https://\u2026 (optional)');
      opsWrap.appendChild(efRow('Source URL', false, null, noteSrcInp));

      const noteBtn = document.createElement('button');
      noteBtn.type      = 'button';
      noteBtn.className = 'ef-add-btn';
      noteBtn.style.cssText = 'margin-top:6px;';
      noteBtn.textContent   = '+ Stage note \u2192 bundle';
      noteBtn.addEventListener('click', () => {
        const text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        const entityId = cbPicker ? cbPicker.getValue() : '';
        if (!entityId) return;
        const note = { text };
        const srcUrl = noteSrcInp.value.trim();
        if (srcUrl) note.source_url = srcUrl;
        addToBundle(meta.bucket, { op: 'annotate', id: entityId, note });
        updateStageCount();
        ta.value = '';
        noteSrcInp.value = '';
        noteBtn.textContent = '\u2713 Staged!';
        setTimeout(() => { noteBtn.textContent = '+ Stage note \u2192 bundle'; }, 1400);
      });
      opsWrap.appendChild(noteBtn);
    }
  }

  function rebuildForm() {
    rebuildPicker();
    buildOpsArea();
  }

  typeSel.addEventListener('change', rebuildForm);
  rebuildForm();

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ef-preview-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => win.remove());
  foot.appendChild(closeBtn);

  win._updateStageCount = updateStageCount;
  return win;
}