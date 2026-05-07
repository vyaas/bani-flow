// ── ADR-031: Data Entry Forms — In-Browser JSON Generator ─────────────────────
// Depends on: graphData (injected by render pipeline), nextSpawnPosition(),
//             wireDrag(), topZ (from media_player.js)
//
// Bundle schema: ADR-083 (plans/ADR-083-bani-add-bundle-canonical-write-channel.md).
// addToBundle(type, obj) enforces the whitelist of six item types defined in §4 of
// that ADR and throws on any unknown type — silent drops are forbidden.
//
// ── ADR-103 §3 / ADR-100: global edit bar deprecation ────────────────────────
// The footer bar (#footer-bar in base.html) is a deprecated fallback. Its buttons
// have been demoted to secondary-chip dimensions (.entry-btn-deprecated).
// Co-located triggers on entity panels (ADR-104..107) are the preferred entry
// points going forward. The bar is removable when ADR-100's coverage matrix is
// fully green. Do not add new button types here; add co-located triggers instead.

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

// Normalize text for diacritic-insensitive search: lowercase + NFD + strip combining marks.
// Allows typing "ragavardhini" to match "Rāgavardhini", etc.
function normText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

function efCombobox(id, options, type, formWin, opts) {
  const freeText = opts && opts.freeText;
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
  textInp.style.paddingRight = '22px';
  wrap.appendChild(textInp);

  // Clear (×) button — revealed when a value is selected
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.textContent = '×';
  clearBtn.title = 'Clear selection';
  clearBtn.style.cssText = 'display:none;position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--fg-muted);cursor:pointer;font-size:1rem;line-height:1;padding:0 3px;';
  clearBtn.addEventListener('mouseover', () => { clearBtn.style.color = 'var(--fg)'; });
  clearBtn.addEventListener('mouseout',  () => { clearBtn.style.color = 'var(--fg-muted)'; });
  wrap.appendChild(clearBtn);

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
    const nq       = normText(q);
    const filtered = q
      ? allOptions.filter(o =>
          normText(o.label).includes(nq) ||
          o.value.toLowerCase().includes(nq) ||
          (o.searchTerms && normText(o.searchTerms).includes(nq))
        )
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
    clearBtn.style.display = value ? '' : 'none';
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
      if (item) {
        wrap.addOption(item.id, item.name || item.title || item.label || item.id);
        // Notify the host form that a new entity was just created (not just selected)
        // so e.g. buildSegmentForm can auto-stage when time is already set.
        if (formWin) formWin.dispatchEvent(new CustomEvent('efNewEntity', { detail: { type, item } }));
      }
    };
    if      (type === 'raga')        buildRagaMiniForm(miniFormWrap, prefill, onAdd);
    else if (type === 'composer')    buildComposerMiniForm(miniFormWrap, prefill, onAdd);
    else if (type === 'composition') buildCompositionMiniForm(miniFormWrap, prefill, onAdd);
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
    selectedLabel = '';   // clear label too so blur doesn't falsely restore a stale selection
    hiddenSel.value = '';
    clearBtn.style.display = 'none';
    renderDropdown(textInp.value);
    if (formWin) formWin.dispatchEvent(new Event('input'));
  });

  textInp.addEventListener('blur', () => {
    setTimeout(() => {
      closeDropdown();
      if (selectedLabel) {
        textInp.value = selectedLabel;
      } else if (freeText && textInp.value.trim()) {
        // Free-text mode: accept the typed value as both value and label
        const typedVal = textInp.value.trim();
        selectedValue = typedVal;
        selectedLabel = typedVal;
        hiddenSel.value = typedVal;
        clearBtn.style.display = typedVal ? '' : 'none';
        if (formWin) formWin.dispatchEvent(new Event('change'));
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
      } else if (freeText && textInp.value.trim()) {
        // Free-text mode: accept typed value directly
        const typedVal = textInp.value.trim();
        selectItem(typedVal, typedVal);
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

  clearBtn.addEventListener('click', () => {
    selectedValue = '';
    selectedLabel = '';
    hiddenSel.value = '';
    textInp.value = '';
    clearBtn.style.display = 'none';
    hiddenSel.dispatchEvent(new Event('change', { bubbles: true }));
    wrap.dispatchEvent(new Event('change'));
    if (formWin) formWin.dispatchEvent(new Event('change'));
    textInp.focus();
  });

  wrap.getValue = () => selectedValue;
  wrap.getLabel = () => selectedLabel;
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

// ── Solidify-on-select: when a combobox value is chosen, replace the input
// with a chip showing the selected label and a × to clear it. ─────────────────
function attachSolidifyBehavior(wrap, formWin) {
  wrap.addEventListener('change', function() {
    const val = wrap.getValue();
    // Value cleared — remove any existing chip, restore input
    if (!val) {
      const existingChip = wrap._solidChip;
      if (existingChip && existingChip.parentNode) {
        existingChip.parentNode.removeChild(existingChip);
      }
      wrap._solidChip = null;
      wrap.style.display = '';
      return;
    }
    // Value selected — remove any stale chip, then show new chip
    const existingChip = wrap._solidChip;
    if (existingChip && existingChip.parentNode) {
      existingChip.parentNode.removeChild(existingChip);
    }
    wrap._solidChip = null;
    const lbl = wrap.getLabel ? wrap.getLabel() : val;
    const chip = document.createElement('span');
    chip.className = 'ef-solidified-chip';
    const chipText = document.createTextNode(lbl);
    chip.appendChild(chipText);
    const clearX = document.createElement('button');
    clearX.type = 'button';
    clearX.className = 'ef-chip-clear';
    clearX.textContent = '×';
    clearX.setAttribute('aria-label', 'Clear ' + lbl);
    clearX.addEventListener('click', function() {
      if (chip.parentNode) chip.parentNode.removeChild(chip);
      wrap._solidChip = null;
      wrap.style.display = '';
      const cb = wrap.querySelector('button[title="Clear selection"]');
      if (cb) cb.click();
      if (formWin) formWin.dispatchEvent(new Event('input'));
    });
    chip.appendChild(clearX);
    wrap._solidChip = chip;
    if (wrap.parentNode) wrap.parentNode.insertBefore(chip, wrap.nextSibling);
    wrap.style.display = 'none';
    if (formWin) formWin.dispatchEvent(new Event('input'));
  });
}

// ── Mini inline-creation forms (used by efCombobox "Add missing" option) ─────

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
    // Mirror into graphData so composition lookups (wireCompRagaAutofill) resolve labels
    graphData.ragas = graphData.ragas || [];
    if (!graphData.ragas.find(r => r.id === id)) graphData.ragas.push(item);
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

  const musOpts = (graphData.musicians || []).map(m => ({ value: m.id, label: m.label || m.id }));
  const musSel  = efCombobox(null, musOpts, null, null);
  container.appendChild(efRow('Musician node', false, 'links to guru-shishya graph', musSel));

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
    const musNodeId = musSel.getValue() || null;
    const item = {
      id, name, musician_node_id: musNodeId, born: null, died: null,
      sources: srcInp.value.trim()
        ? [{ url: srcInp.value.trim(), label: 'Wikipedia', type: 'wikipedia' }] : [],
    };
    if (eraSel.value) item.era = eraSel.value;
    // Mirror into graphData so composition lookups (wireCompRagaAutofill) resolve labels
    graphData.composers = graphData.composers || [];
    if (!graphData.composers.find(c => c.id === id)) graphData.composers.push(item);
    addToBundle('composers', item);
    onAdd(item);
  });
  cancelBtn.addEventListener('click', () => onAdd(null));
}

function buildCompositionMiniForm(container, prefill, onAdd) {
  const titleInp = efInput(null, 'text', 'e.g. Nidhi Chala Sukhama', prefill || null);
  container.appendChild(efRow('Title', true, null, titleInp));

  // efCombobox (not efSelect) so the rasika can add a missing composer or raga inline.
  // bani_add.py processes ragas → composers → compositions in that order, so a raga
  // staged here will always exist before the composition that references it.
  const composerOpts = (graphData.composers || []).map(c => ({ value: c.id, label: c.name || c.id }));
  const composerSel  = efCombobox(null, composerOpts, 'composer', null);
  container.appendChild(efRow('Composer', true, null, composerSel));

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const ragaSel  = efCombobox(null, ragaOpts, 'raga', null);
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
    const composerId = composerSel.getValue();
    const ragaId     = ragaSel.getValue();
    if (!title || !composerId || !ragaId) return;
    const id = toSnakeCase(title);
    const compItem = { id, title, composer_id: composerId, raga_id: ragaId, sources: [], notes: null };
    // Mirror into graphData so wireCompRagaAutofill can auto-fill raga/composer
    // in the parent segment form immediately after this composition is selected.
    graphData.compositions = graphData.compositions || [];
    if (!graphData.compositions.find(c => c.id === id)) graphData.compositions.push(compItem);
    addToBundle('compositions', compItem);
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
  // Lecdem subject edit — patches subjects arrays on a lecdem youtube[] entry.
  // Uses add_lecdem_subject ops (one per added id) staged into the musicians bucket.
  // NOTE: writer.py does not support bulk-replace of subjects via patch op; the
  // individual add_lecdem_subject writer method (ADR-084 §4) is the correct path.
  // Each staged item uses op:'append', type:'lecdem_subject' consumed by bani_add.
  lecdem: {
    bucket:          'musicians',
    label:           'Lecdem',
    pickLabel:       'Pick Musician',
    pickOpts:        () => (graphData.musicians || []).map(m => ({ value: m.id, label: m.label || m.id })),
    patchFields:     [],
    appendArrays:    [],
    supportsAnnotate: false,
    fieldMeta:       {},
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

function openEntryForm(type, target) {
  switch (type) {
    case 'musician_recordings': buildMusicianRecordingsForm(); break;
    case 'musician':            buildMusicianForm();           break;
    case 'raga':                buildRagaForm();               break;
    case 'composition':         buildCompositionForm();        break;
    case 'recording':           buildRecordingForm();          break;
    case 'composer':            buildComposerForm();           break;
    case 'edit':                buildEditForm();               break;
    case 'segment':             buildSegmentForm(target || {}); break;
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

  // ── PRIMARY FIELDS ────────────────────────────────────────────────────────
  const urlInp = efInput(null, 'text', 'https://youtu.be/…');
  block.appendChild(efRow('YouTube URL', true, null, urlInp));

  const compOpts = (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id }));
  const compSel = efCombobox(null, compOpts, 'composition', formWin);
  const compRow = efRow('Composition', false, null, compSel);
  block.appendChild(compRow);
  attachSolidifyBehavior(compSel, formWin);

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const ragaSel = efCombobox(null, ragaOpts, 'raga', formWin);
  const ragaRow = efRow('Raga', false, 'auto-filled from composition', ragaSel);
  block.appendChild(ragaRow);
  attachSolidifyBehavior(ragaSel, formWin);

  // ADR-115: [Hindustani] tag in raga row (hidden until HER raga selected)
  const herTag = document.createElement('span');
  herTag.className = 'her-chip her-chip--secondary';
  herTag.style.cssText = 'display:none;margin-left:6px;font-size:0.62rem;';
  herTag.textContent = '[Hindustani]';
  ragaRow.appendChild(herTag);

  // Auto-fill raga when composition is selected
  wireCompRagaAutofill(compSel, ragaSel, null, formWin);
  block._compSel = compSel;
  block._ragaSel = ragaSel;

  // ── Tala ──────────────────────────────────────────────────────────────────
  const talaOpts = (window.talaData || []).map(t => ({
    value: t.id, label: t.label, searchTerms: t.searchTerms || '',
  }));
  const talaSel = efCombobox(null, talaOpts, null, formWin, { freeText: true });
  const talaRow = efRow('Tala', false, null, talaSel);
  block.appendChild(talaRow);
  attachSolidifyBehavior(talaSel, formWin);
  block._talaSel = talaSel;

  // ADR-115: HER kind row — shown when a Hindustani raga is selected
  const herKindOpts = [
    { value: 'raga_alap', label: 'Raga Alap (default for HER)' },
    { value: 'lecdem',    label: 'Lec-dem' },
    { value: 'concert',   label: 'Concert' },
    { value: 'misc',      label: 'Misc' },
  ];
  const herKindSel = efSelect(null, herKindOpts, false);
  herKindSel.value = 'raga_alap';
  const herKindRow = efRow('Kind', false, 'HER recording type', herKindSel);
  herKindRow.style.display = 'none';
  block.appendChild(herKindRow);
  block._herKindSel = herKindSel;
  block._herKindRow = herKindRow;

  // ADR-115: "show composition" expander link for HER mode
  const compExpander = document.createElement('button');
  compExpander.type = 'button';
  compExpander.className = 'ef-add-btn';
  compExpander.style.cssText = 'display:none;font-size:0.64rem;padding:2px 8px;width:auto;opacity:0.7;';
  compExpander.textContent = '+ add composition (rare for HER)';
  compExpander.addEventListener('click', () => {
    compRow.style.display = '';
    compExpander.style.display = 'none';
  });
  block.insertBefore(compExpander, compRow.nextSibling);

  // ADR-115: HER mode handler — fires when raga selection changes
  ragaSel.addEventListener('change', () => {
    const ragaId = ragaSel.getValue ? ragaSel.getValue() : '';
    const selectedRaga = ragaId ? (graphData.ragas || []).find(r => r.id === ragaId) : null;
    const isHer = !!(selectedRaga && selectedRaga.tradition === 'hindustani');
    block._herMode = isHer;
    herTag.style.display  = isHer ? '' : 'none';
    herKindRow.style.display = isHer ? '' : 'none';
    talaRow.style.display = isHer ? 'none' : '';
    if (isHer) {
      compRow.style.display = 'none';
      compExpander.style.display = '';
    } else {
      compRow.style.display = '';
      compExpander.style.display = 'none';
    }
    if (formWin) formWin.dispatchEvent(new Event('input'));
  });

  // ── Secondary fields (separated from primary) ─────────────────────────────
  const groupSep = document.createElement('hr');
  groupSep.className = 'ef-group-sep';
  block.appendChild(groupSep);

  const yearInp = efInput(null, 'number', 'e.g. 1965', null);
  yearInp.min = 1900; yearInp.max = 2030;
  block.appendChild(efRow('Year', false, null, yearInp));

  const versionInp = efInput(null, 'text', 'e.g. live, studio, 1965 version', null);
  block.appendChild(efRow('Version', false, null, versionInp));

  const lblInp = efInput(null, 'text', 'auto-generated if empty: composition · raga · tala', null);
  block.appendChild(efRow('Label', false, 'optional — auto-generated from composition · raga · tala', lblInp));

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
  const musSel = efCombobox(null, musOpts, null, formWin);
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

function addEdgeBlock(container, direction, formWin, prefillData = null) {
  const block = document.createElement('div');
  block.className = 'ef-repeat-block';
  block.dataset.direction = direction;
  if (prefillData) {
    block.dataset.prefilled = 'true';
    block.style.opacity = '0.65';
  }

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ef-repeat-remove';
  removeBtn.textContent = '×';
  if (prefillData) {
    // Prefilled blocks are read-only display — hide the remove button
    removeBtn.style.display = 'none';
  } else {
    removeBtn.addEventListener('click', () => {
      block.remove();
      formWin.dispatchEvent(new Event('input'));
    });
  }
  block.appendChild(removeBtn);

  const dirLabel = direction === 'guru'
    ? 'Guru (this musician is shishya of)'
    : 'Shishya (this musician is guru of)';

  const nodeOpts = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
  const nodeSel = efCombobox(null, nodeOpts, null, formWin);
  block.appendChild(efRow(dirLabel, true, null, nodeSel));

  const confInp = efInput(null, 'number', '0.90', '0.90');
  confInp.min = '0'; confInp.max = '1'; confInp.step = '0.01';
  block.appendChild(efRow('Confidence', true, '0.0–1.0', confInp));

  const srcInp = efInput(null, 'text', 'https://…');
  block.appendChild(efRow('Source URL', true, null, srcInp));

  const noteInp = efInput(null, 'text', 'e.g. principal guru');
  block.appendChild(efRow('Note', false, null, noteInp));

  container.appendChild(block);

  if (prefillData) {
    // Set values after block is in DOM so combobox layout is stable
    if (nodeSel && typeof nodeSel.setValue === 'function') {
      nodeSel.setValue(prefillData.otherId, prefillData.otherLabel || prefillData.otherId);
    }
    if (prefillData.confidence != null) confInp.value = prefillData.confidence;
    if (prefillData.source_url)        srcInp.value  = prefillData.source_url;
    if (prefillData.note)              noteInp.value = prefillData.note;
    // Disable all inputs so user can't accidentally edit prefilled edges
    [confInp, srcInp, noteInp].forEach(el => { el.disabled = true; el.style.opacity = '0.65'; });
  } else {
    formWin.dispatchEvent(new Event('input'));
  }
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

  // ADR-115: Tradition segmented control — first field in the form
  let _tradition = 'carnatic';
  const tradRow = document.createElement('div');
  tradRow.className = 'ef-row';
  const tradLabel = document.createElement('span');
  tradLabel.className = 'ef-label';
  tradLabel.textContent = 'Tradition';
  const tradControl = document.createElement('div');
  tradControl.id = 'raga-tradition-control';
  tradControl.className = 'segmented-control';
  const _carnaticBtn = document.createElement('button');
  _carnaticBtn.type = 'button'; _carnaticBtn.className = 'seg-btn active';
  _carnaticBtn.dataset.value = 'carnatic'; _carnaticBtn.textContent = 'Carnatic';
  const _hindustaniBtn = document.createElement('button');
  _hindustaniBtn.type = 'button'; _hindustaniBtn.className = 'seg-btn';
  _hindustaniBtn.dataset.value = 'hindustani'; _hindustaniBtn.textContent = 'Hindustani';
  tradControl.appendChild(_carnaticBtn); tradControl.appendChild(_hindustaniBtn);
  tradRow.appendChild(tradLabel); tradRow.appendChild(tradControl);
  body.appendChild(tradRow);

  const nameInp = efInput('ef_raga_name', 'text', 'e.g. Arabhi', null);
  body.appendChild(efRow('Name', true, null, nameInp));

  const idRow = efIdRow('ef_raga_id', 'ef_raga_name', existingIds);
  body.appendChild(idRow);
  nameInp.addEventListener('input', idRow._updateId);

  const aliasInp = efInput('ef_raga_aliases', 'text', 'Arabi, Aravi (comma-separated)', null);
  body.appendChild(efRow('Aliases', false, 'comma-separated', aliasInp));

  // ADR-115: Hindustani-only — thaat dropdown (hidden by default)
  const thaatOpts = [
    { value: '',         label: '— select thaat —' },
    { value: 'bilawal',  label: 'Bilawal' },
    { value: 'kalyan',   label: 'Kalyan' },
    { value: 'khamaj',   label: 'Khamaj' },
    { value: 'bhairav',  label: 'Bhairav' },
    { value: 'bhairavi', label: 'Bhairavi' },
    { value: 'asavari',  label: 'Asavari' },
    { value: 'todi',     label: 'Todi' },
    { value: 'purvi',    label: 'Purvi' },
    { value: 'marwa',    label: 'Marwa' },
    { value: 'kafi',     label: 'Kafi' },
    { value: 'unknown',  label: 'Unknown / not assigned' },
  ];
  const thaatSel = efSelect('ef_raga_thaat', thaatOpts, false);
  const thaatRow = efRow('Thaat', false, 'Hindustani parent scale', thaatSel);
  thaatRow.style.display = 'none';
  body.appendChild(thaatRow);

  // ADR-115: Hindustani-only — Carnatic equivalent back-link (typeahead, optional)
  const _carnaticRagaOpts = (graphData.ragas || [])
    .filter(r => !r.tradition || r.tradition === 'carnatic')
    .map(r => ({ value: r.id, label: r.name || r.id }));
  const carnEqSel = efCombobox('ef_raga_carnatic_equiv', _carnaticRagaOpts, null, win);
  const carnEqRow = efRow('Carnatic Equivalent', false, 'links this HER to a Carnatic raga (optional)', carnEqSel);
  carnEqRow.style.display = 'none';
  body.appendChild(carnEqRow);

  const melaOpts = [
    { value: 'false', label: 'No — Janya raga' },
    { value: 'true',  label: 'Yes — Melakarta' },
  ];
  const melaSel = efSelect('ef_raga_is_mela', melaOpts, false);
  melaSel.value = 'false';
  const melaSelRow = efRow('Is Melakarta?', true, null, melaSel);
  body.appendChild(melaSelRow);

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

  // Wire Carnatic-only conditional display (melakarta ↔ janya)
  melaSel.addEventListener('change', () => {
    if (_tradition !== 'carnatic') return;
    const isMela = melaSel.value === 'true';
    melaNumRow.classList.toggle('ef-visible', isMela);
    cakraRow.classList.toggle('ef-visible', isMela);
    parentRow.classList.toggle('ef-visible', !isMela);
  });

  // ADR-115: Show/hide field sets based on tradition selection
  function _applyRagaTraditionDisplay() {
    const isCarnatic = _tradition === 'carnatic';
    melaSelRow.style.display = isCarnatic ? '' : 'none';
    melaNumRow.style.display = isCarnatic ? '' : 'none';
    cakraRow.style.display   = isCarnatic ? '' : 'none';
    parentRow.style.display  = isCarnatic ? '' : 'none';
    thaatRow.style.display   = isCarnatic ? 'none' : '';
    carnEqRow.style.display  = isCarnatic ? 'none' : '';
    // Re-apply class-based mela/janya visibility within Carnatic state
    if (isCarnatic) {
      const isMela = melaSel.value === 'true';
      melaNumRow.classList.toggle('ef-visible', isMela);
      cakraRow.classList.toggle('ef-visible', isMela);
      parentRow.classList.toggle('ef-visible', !isMela);
    }
  }

  [_carnaticBtn, _hindustaniBtn].forEach(btn => {
    btn.addEventListener('click', () => {
      _tradition = btn.dataset.value;
      _carnaticBtn.classList.toggle('active', _tradition === 'carnatic');
      _hindustaniBtn.classList.toggle('active', _tradition === 'hindustani');
      _applyRagaTraditionDisplay();
      win.dispatchEvent(new Event('input'));
    });
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
    // ADR-115: dual-emission for HER creation — emit create + append back-link atomically
    const carnEqVal = win.querySelector('#ef_raga_carnatic_equiv')
      ? win.querySelector('#ef_raga_carnatic_equiv').value
      : '';
    if (obj.tradition === 'hindustani' && carnEqVal) {
      addToBundle('ragas', obj);
      addToBundle('ragas', { op: 'append', id: carnEqVal, field: 'hindustani_equivalents', value: obj.id });
    } else {
      addToBundle('ragas', obj);
    }
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
  // ADR-115: tradition, thaat, carnatic_equivalents
  const tradControl = win.querySelector('#raga-tradition-control');
  const tradition = tradControl
    ? (tradControl.querySelector('.seg-btn.active') ? tradControl.querySelector('.seg-btn.active').dataset.value : 'carnatic')
    : 'carnatic';
  const thaat   = win.querySelector('#ef_raga_thaat')         ? win.querySelector('#ef_raga_thaat').value || null       : null;
  const carnEq  = win.querySelector('#ef_raga_carnatic_equiv') ? win.querySelector('#ef_raga_carnatic_equiv').value      : '';
  // ADR-097 §4: source label/type inferred from URL host.

  const aliasArr = aliases
    ? aliases.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (tradition === 'hindustani') {
    return {
      id,
      name,
      tradition:            'hindustani',
      aliases:              aliasArr,
      melakarta:            null,
      is_melakarta:         false,
      cakra:                null,
      parent_raga:          null,
      thaat:                thaat,
      carnatic_equivalents: [],
      sources: [inferSource(srcUrl)],
      notes: notes || null,
    };
  }

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

  const talaOpts = (window.talaData || []).map(t => ({ value: t.id, label: t.label, searchTerms: t.searchTerms || '' }));
  const talaSel = efCombobox('ef_comp_tala', talaOpts, null, win, { freeText: true });
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
  const nodeSel = efCombobox(null, nodeOpts, null, formWin);
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

  const talaOpts = (window.talaData || []).map(t => ({ value: t.id, label: t.label, searchTerms: t.searchTerms || '' }));
  const talaSel = efCombobox(null, talaOpts, null, formWin, { freeText: true });
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

// ── Combined Musician/YouTube form (internal — ADR-108 transition) ───────────
// Preserved as _buildCombinedMusicianYouTubeForm for the YouTube-entry path.
// The public buildMusicianRecordingsForm() shim now delegates to buildAddMusicianForm().
// buildAddYouTubeToMusicianForm() wraps this function for co-located YouTube entry.

function _buildCombinedMusicianYouTubeForm() {
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

// ── buildSegmentForm — ADR-101 §C: Add segment ───────────────────────────────
// Opens a floating form to append a timestamped segment to a recording session
// or a lecdem youtube entry.
//
// target: { kind: "recording" | "lecdem", id: string, vid?: string,
//           session_index?: number }

function buildSegmentForm(target) {
  const kind         = target.kind || 'recording';
  const entityId     = target.id   || '';
  const vid          = target.vid  || '';
  const sessionIndex = target.session_index || 1;

  const title = kind === 'lecdem'
    ? 'Add Lecdem Segment'
    : 'Add Recording Segment';
  const win  = createEntryWindow(title);
  const body = win.querySelector('.ew-body');
  const foot = win.querySelector('.ew-footer');

  // Make window tall enough to show all fields without scrolling
  win.style.width    = '480px';
  win.style.minHeight = '520px';

  // ── Target info (subtitle, no section header) ─────────────────────────────
  const idDisp = document.createElement('div');
  idDisp.style.cssText = 'font-size:0.70rem;color:var(--fg-muted);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border);';
  idDisp.textContent = kind === 'lecdem'
    ? `Musician: ${entityId}  ·  Video: ${vid}`
    : `Recording: ${entityId}  ·  Session: ${sessionIndex}`;
  body.appendChild(idDisp);

  // ── Timestamp: H / M / S ─────────────────────────────────────────────────
  const hmsWrap = document.createElement('div');
  hmsWrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;';

  function makeHmsInput(placeholder, max) {
    const inp = document.createElement('input');
    inp.type        = 'number';
    inp.placeholder = placeholder;
    inp.min         = '0';
    inp.max         = String(max);
    inp.className   = 'ef-input';
    inp.style.cssText = 'width:64px;text-align:center;';
    return inp;
  }

  const hInp = makeHmsInput('HH', 99);
  const mInp = makeHmsInput('MM', 59);
  const sInp = makeHmsInput('SS', 59);

  function labelEl(txt) {
    const s = document.createElement('span');
    s.textContent = txt;
    s.style.cssText = 'font-size:0.72rem;color:var(--fg-muted);';
    return s;
  }

  hmsWrap.appendChild(hInp);
  hmsWrap.appendChild(labelEl('h'));
  hmsWrap.appendChild(mInp);
  hmsWrap.appendChild(labelEl('m'));
  hmsWrap.appendChild(sInp);
  hmsWrap.appendChild(labelEl('s'));
  body.appendChild(efRow('Time', true, null, hmsWrap));

  // ── Segment details (no section header — fields shown directly) ───────────
  const compOpts = () => (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id }));
  const ragaOpts = () => (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const compOsrOpts = () => (graphData.composers || []).map(c => ({ value: c.id, label: c.name || c.id }));

  const cbComp     = efCombobox('seg_comp',     compOpts(),     'composition', win);
  const cbRaga     = efCombobox('seg_raga',     ragaOpts(),     'raga',        win);
  const cbComposer = efCombobox('seg_composer', compOsrOpts(), 'composer',    win);

  // Freeform tala input with datalist suggestions — allows any tala, not just the presets.
  const talaListId = 'seg_tala_list_' + Math.random().toString(36).slice(2);
  const talaList = document.createElement('datalist');
  talaList.id = talaListId;
  [
    'ādi','rūpakam','miśra cāpu','khaṇḍa cāpu','tiśra tripuṭa','āṭa','dhruva',
    'adi','rupakam','misra_capu','khanda_capu','tisra_triputa','ata','dhruva',
  ].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    talaList.appendChild(opt);
  });
  document.body.appendChild(talaList);
  const talaSel = document.createElement('input');
  talaSel.type = 'text';
  talaSel.id   = 'seg_tala';
  talaSel.className   = 'ef-input';
  talaSel.placeholder = 'e.g. ādi, rūpakam, or free-type';
  talaSel.setAttribute('list', talaListId);
  talaSel.addEventListener('input', () => win.dispatchEvent(new Event('input')));
  // expose .value API matching efSelect so build/validate code needs no changes
  Object.defineProperty(talaSel, 'getValue', { value: () => talaSel.value.trim() });

  const kindOpts = [
    { value: 'kriti', label: 'Kriti' },
    { value: 'varnam', label: 'Varnam' },
    { value: 'padam', label: 'Padam' },
    { value: 'javali', label: 'Jāvaḷi' },
    { value: 'tillana', label: 'Tillāna' },
    { value: 'alapana', label: 'Ālāpana' },
    { value: 'tanam', label: 'Tānam' },
    { value: 'niraval', label: 'Nirval' },
    { value: 'kalpanaswaram', label: 'Kalpanāswaram' },
    { value: 'tani', label: 'Tani āvartana' },
    { value: 'other', label: 'Other' },
  ];
  const kindSel = efSelect('seg_kind', kindOpts, true);

  const displayTitleInp = document.createElement('input');
  displayTitleInp.type        = 'text';
  displayTitleInp.placeholder = 'e.g. evari mātā (optional)';
  displayTitleInp.className   = 'ef-input';

  const notesInp = document.createElement('input');
  notesInp.type        = 'text';
  notesInp.placeholder = 'optional notes';
  notesInp.className   = 'ef-input';

  // Fallbacks: capture IDs from new entities / auto-fill so typing into combobox
  // after creation doesn't lose them (efCombobox clears selectedValue on any keystroke).
  let _pinnedCompId = null;
  let _pinnedRagaId = null;
  let _pinnedComposerId = null;

  // Auto-fill raga and composer when a known composition is selected
  wireCompRagaAutofill(cbComp, cbRaga, cbComposer, win);

  // When a NEW composition is created via the mini form, pin its ID and pulse the stage button.
  win.addEventListener('efNewEntity', e => {
    if (!e.detail) return;
    if (e.detail.type === 'composition') {
      _pinnedCompId = e.detail.item.id;
      stageBtn.scrollIntoView({ block: 'nearest' });
      stageBtn.style.transition = 'box-shadow 0.15s';
      stageBtn.style.boxShadow = '0 0 0 3px var(--accent)';
      setTimeout(() => { stageBtn.style.boxShadow = ''; }, 1200);
    } else if (e.detail.type === 'raga') {
      _pinnedRagaId = e.detail.item.id;
    } else if (e.detail.type === 'composer') {
      _pinnedComposerId = e.detail.item.id;
    }
  });

  // Also pin when a value is selected / auto-filled (covers existing-entity auto-fill).
  // When the × button explicitly clears a field (fires change with empty value), also
  // clear the pin so we don't resurrect the old ID.
  cbComp._select.addEventListener('change', () => {
    const v = cbComp.getValue();
    _pinnedCompId = v || null;
  });
  cbRaga._select.addEventListener('change', () => {
    const v = cbRaga.getValue();
    _pinnedRagaId = v || null;
  });
  cbComposer._select.addEventListener('change', () => {
    const v = cbComposer.getValue();
    _pinnedComposerId = v || null;
  });

  body.appendChild(efRow('Composition', false, null, cbComp));
  body.appendChild(efRow('Raga',        false, 'auto-filled from composition', cbRaga));
  body.appendChild(efRow('Tala',        false, null, talaSel));
  body.appendChild(efRow('Composer',    false, 'auto-filled from composition', cbComposer));
  body.appendChild(efRow('Kind',        false, null, kindSel));
  body.appendChild(efRow('Display title', false, null, displayTitleInp));
  body.appendChild(efRow('Notes',       false, null, notesInp));

  // ── Footer: Stage + Download ─────────────────────────────────────────────
  const stageBtn = document.createElement('button');
  stageBtn.className = 'ef-download-btn';
  stageBtn.textContent = '+ Stage segment';
  stageBtn.disabled = true;

  foot.appendChild(stageBtn);

  function buildSegmentObj() {
    const h = parseInt(hInp.value, 10) || 0;
    const m = parseInt(mInp.value, 10) || 0;
    const s = parseInt(sInp.value, 10) || 0;
    const offset = h * 3600 + m * 60 + s;
    if (offset < 0) return null;
    // require at least one time field to be set (not all blank)
    if (hInp.value === '' && mInp.value === '' && sInp.value === '') return null;
    const seg = { offset_seconds: offset };
    const comp = cbComp.getValue() || _pinnedCompId;
    if (comp) seg.composition_id = comp;
    const raga = cbRaga.getValue() || _pinnedRagaId;
    if (raga) seg.raga_id = raga;
    const tala = talaSel.value;
    if (tala) seg.tala = tala;
    const composer = cbComposer.getValue() || _pinnedComposerId;
    if (composer) seg.composer_id = composer;
    const kind = kindSel.value;
    if (kind) seg.kind = kind;
    const dt = displayTitleInp.value.trim();
    if (dt) seg.display_title = dt;
    const notes = notesInp.value.trim();
    if (notes) seg.notes = notes;
    return seg;
  }

  function validate() {
    const seg = buildSegmentObj();
    const meaningful = seg && (
      seg.composition_id || seg.raga_id || seg.kind || seg.notes || seg.display_title
    );
    stageBtn.disabled = !meaningful;
  }

  win.addEventListener('input', validate);
  win.addEventListener('change', validate);

  stageBtn.addEventListener('click', () => {
    const seg = buildSegmentObj();
    if (!seg) return;
    if (kind === 'lecdem') {
      addToBundle('musicians', {
        op:    'append',
        id:    entityId,
        array: `youtube[${vid}].segments`,
        value: seg,
      });
    } else {
      addToBundle('recordings', {
        op:    'append',
        id:    entityId,
        array: `sessions[${sessionIndex}].performances`,
        value: seg,
      });
    }
    const badge = document.createElement('div');
    badge.style.cssText = 'font-size:0.68rem;color:var(--accent);margin-top:6px;';
    const compIdForBadge = cbComp.getValue() || _pinnedCompId;
    const compLabel = compIdForBadge
      ? ((graphData.compositions || []).find(c => c.id === compIdForBadge) || {}).title || compIdForBadge
      : null;
    badge.textContent = `✓ Segment staged (offset ${seg.offset_seconds}s${compLabel ? ' · ' + compLabel : ''}). Download bundle to apply.`;
    foot.appendChild(badge);
    stageBtn.disabled = true;

    // "+ Add another segment" — resets time + all fields, keeps the window open
    const addAnotherBtn = document.createElement('button');
    addAnotherBtn.className = 'ef-download-btn';
    addAnotherBtn.style.marginTop = '6px';
    addAnotherBtn.textContent = '+ Add another segment';
    addAnotherBtn.addEventListener('click', () => {
      // Reset time
      hInp.value = ''; mInp.value = ''; sInp.value = '';
      // Reset comboboxes — setValue('', '') resets both hidden select and text input
      [cbComp, cbRaga, cbComposer].forEach(cb => {
        if (cb.setValue) {
          cb.setValue('', '');
          // also hide the × button by firing a change
          cb.dispatchEvent(new Event('change'));
        }
      });
      // Reset pinned fallback IDs for the next segment
      _pinnedCompId = null;
      _pinnedRagaId = null;
      _pinnedComposerId = null;
      // Reset selects
      talaSel.value = '';
      kindSel.value = '';
      displayTitleInp.value = '';
      notesInp.value = '';
      // Remove this button and the badge so the footer stays clean
      addAnotherBtn.remove();
      badge.remove();
      stageBtn.disabled = true;
      validate();
      hInp.focus();
    });
    foot.appendChild(addAnotherBtn);
  });

  // Clean up the datalist when the form closes
  const closeBtnSeg = win.querySelector('.ew-close');
  if (closeBtnSeg) {
    closeBtnSeg.addEventListener('click', () => { talaList.remove(); }, { once: true });
  }

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

// ── buildLecdemSubjectEditForm — floating form to add subjects to a lecdem ────
// Opens a window pre-filled with current subjects. Each added id is staged as an
// { op:'append', type:'add_lecdem_subject' } item into the musicians bundle.
//
// NOTE: writer.py supports individual subject addition via add_lecdem_subject
// (ADR-084 §4). Bulk-replace via a generic patch path is not yet supported.
// TODO: add patch_lecdem_subjects to writer.py if bulk-replace is needed.
//
// ref      — LecdemRef ({ video_id, label, subjects, lecturer_id })
// nodeId   — the musician node id that hosts the lecdem youtube[] entry
function buildLecdemSubjectEditForm(ref, nodeId) {
  if (!ref || !ref.video_id) return;
  const win = createEntryWindow('Edit Lecdem Subjects — ' + (ref.label || ref.video_id));
  const body = win.querySelector('.ew-body');
  const foot = win.querySelector('.ew-footer');

  const subjects = ref.subjects || { raga_ids: [], composition_ids: [], musician_ids: [] };
  const vid = ref.video_id;

  // ── Build per-axis option lists ───────────────────────────────────────────
  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const compOpts = (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id }));
  const musOpts  = (graphData.musicians || []).map(m => ({ value: m.id, label: m.label || m.id }));

  // Merged list; composite value = "axis::id" to prevent cross-axis collisions
  const allOpts = [
    ...ragaOpts.map(o => ({ value: `raga_ids::${o.value}`,        label: `${o.label} (Raga)` })),
    ...compOpts.map(o => ({ value: `composition_ids::${o.value}`,  label: `${o.label} (Comp)` })),
    ...musOpts.map(o  => ({ value: `musician_ids::${o.value}`,     label: `${o.label} (Musician)` })),
  ];

  // staged: compositeKey → { axis, id, chipClass, label }
  const staged = new Map();
  const originalKeys = new Set();

  function _stageEntry(axis, id, chipClass, optList) {
    const key = `${axis}::${id}`;
    const opt = optList.find(o => o.value === id);
    staged.set(key, { axis, id, chipClass, label: opt ? opt.label : id });
  }

  (subjects.raga_ids        || []).forEach(id => { _stageEntry('raga_ids',        id, 'raga-chip',     ragaOpts); originalKeys.add(`raga_ids::${id}`); });
  (subjects.composition_ids || []).forEach(id => { _stageEntry('composition_ids', id, 'comp-chip',     compOpts); originalKeys.add(`composition_ids::${id}`); });
  (subjects.musician_ids    || []).forEach(id => { _stageEntry('musician_ids',    id, 'musician-chip', musOpts);  originalKeys.add(`musician_ids::${id}`); });

  // ── Chips area ────────────────────────────────────────────────────────────
  const chipsWrap = document.createElement('div');
  chipsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;min-height:24px;';
  body.appendChild(chipsWrap);

  function redrawChips() {
    chipsWrap.innerHTML = '';
    if (staged.size === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = 'opacity:0.4;font-size:0.75rem;';
      empty.textContent = '(none)';
      chipsWrap.appendChild(empty);
      return;
    }
    staged.forEach(({ axis, id, chipClass, label }, key) => {
      const chip = document.createElement('span');
      chip.className = chipClass;
      chip.style.cssText = 'cursor:pointer;';
      chip.textContent = label + ' ×';
      chip.title = 'Remove ' + label;
      chip.addEventListener('click', () => { staged.delete(key); redrawChips(); });
      chipsWrap.appendChild(chip);
    });
  }
  redrawChips();

  // ── Single combobox + Add button ──────────────────────────────────────────
  const combo = efCombobox(null, allOpts, null, win);
  body.appendChild(efRow('Add subject', false, null, combo));

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'ef-add-btn';
  addBtn.textContent = '+ Add';
  addBtn.style.cssText = 'margin-top:4px;';
  addBtn.addEventListener('click', () => {
    const compositeVal = combo.getValue ? combo.getValue() : '';
    if (!compositeVal || staged.has(compositeVal)) return;
    const sep   = compositeVal.indexOf('::');
    if (sep < 0) return;
    const axis  = compositeVal.slice(0, sep);
    const id    = compositeVal.slice(sep + 2);
    const chipClassMap = { raga_ids: 'raga-chip', composition_ids: 'comp-chip', musician_ids: 'musician-chip' };
    const optListMap   = { raga_ids: ragaOpts, composition_ids: compOpts, musician_ids: musOpts };
    const opt = (optListMap[axis] || []).find(o => o.value === id);
    staged.set(compositeVal, { axis, id, chipClass: chipClassMap[axis] || 'raga-chip', label: opt ? opt.label : id });
    redrawChips();
    if (combo.setValue) combo.setValue('');
  });
  body.appendChild(addBtn);

  // ── Single Stage → bundle button ──────────────────────────────────────────
  const stageBtn = document.createElement('button');
  stageBtn.type = 'button';
  stageBtn.className = 'ef-add-btn';
  stageBtn.style.cssText = 'margin-top:6px;margin-left:6px;';
  stageBtn.textContent = '↪ Stage additions → bundle';
  stageBtn.addEventListener('click', () => {
    let count = 0;
    staged.forEach(({ axis, id }, key) => {
      if (!originalKeys.has(key)) {
        addToBundle('musicians', {
          op:    'append',
          id:    nodeId,
          array: `youtube[${vid}].subjects.${axis}`,
          value: id,
        });
        count++;
      }
    });
    if (count > 0) {
      stageBtn.textContent = `✓ Staged ${count} addition${count > 1 ? 's' : ''}!`;
      setTimeout(() => { stageBtn.textContent = '↪ Stage additions → bundle'; }, 1800);
    } else {
      stageBtn.textContent = '(no new items)';
      setTimeout(() => { stageBtn.textContent = '↪ Stage additions → bundle'; }, 1200);
    }
  });
  body.appendChild(stageBtn);

  const closeBtn2 = document.createElement('button');
  closeBtn2.className = 'ef-preview-btn';
  closeBtn2.textContent = 'Close';
  closeBtn2.addEventListener('click', () => win.remove());
  foot.appendChild(closeBtn2);
}

// ── buildLecdemEditForm — unified edit form: subjects + time segments ─────────
// Pre-fills with existing ref data.  New subjects and new segments are staged
// as append operations into the bundle.  Does not support deleting existing
// subjects (writer.py add_lecdem_subject is append-only by design).
//
// ref    — LecdemRef ({ video_id, label, year, subjects, segments })
// nodeId — the musician node id that hosts this lecdem
function buildLecdemEditForm(ref, nodeId) {
  if (!ref || !ref.video_id) return;
  const vid = ref.video_id;
  const win = createEntryWindow('Edit Lecdem — ' + (ref.label || vid));
  const body = win.querySelector('.ew-body');
  const foot = win.querySelector('.ew-footer');

  // ── URL (read-only — video_id is the stable key) ──────────────────────────
  const urlInp = efInput(null, 'text', '');
  urlInp.value = 'https://www.youtube.com/watch?v=' + vid;
  urlInp.readOnly = true;
  urlInp.style.cssText = (urlInp.style.cssText || '') + ';opacity:0.6;cursor:default;';
  body.appendChild(efRow('YouTube URL', false, 'read-only', urlInp));

  // ── Subjects ──────────────────────────────────────────────────────────────
  const subjectSep = document.createElement('hr');
  subjectSep.className = 'ef-group-sep';
  body.appendChild(subjectSep);

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const compOpts = (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id }));
  const musOpts  = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
  const allSubjectOpts = [
    ...ragaOpts.map(o => ({ value: `raga_ids::${o.value}`,        label: `${o.label} (Raga)` })),
    ...compOpts.map(o => ({ value: `composition_ids::${o.value}`,  label: `${o.label} (Comp)` })),
    ...musOpts.map(o  => ({ value: `musician_ids::${o.value}`,     label: `${o.label} (Musician)` })),
  ];
  const chipClassMap = { raga_ids: 'raga-chip', composition_ids: 'comp-chip', musician_ids: 'musician-chip' };
  const optListMap   = { raga_ids: ragaOpts, composition_ids: compOpts, musician_ids: musOpts };

  const staged = new Map();
  const originalKeys = new Set();

  const existingSubjects = ref.subjects || { raga_ids: [], composition_ids: [], musician_ids: [] };
  (existingSubjects.raga_ids        || []).forEach(id => {
    const key = `raga_ids::${id}`;
    const opt = ragaOpts.find(o => o.value === id);
    staged.set(key, { axis: 'raga_ids', id, label: opt ? opt.label : id });
    originalKeys.add(key);
  });
  (existingSubjects.composition_ids || []).forEach(id => {
    const key = `composition_ids::${id}`;
    const opt = compOpts.find(o => o.value === id);
    staged.set(key, { axis: 'composition_ids', id, label: opt ? opt.label : id });
    originalKeys.add(key);
  });
  (existingSubjects.musician_ids    || []).forEach(id => {
    const key = `musician_ids::${id}`;
    const opt = musOpts.find(o => o.value === id);
    staged.set(key, { axis: 'musician_ids', id, label: opt ? opt.label : id });
    originalKeys.add(key);
  });

  const subjectsHeading = document.createElement('div');
  subjectsHeading.style.cssText = 'font-size:0.68rem;color:var(--fg-sub);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;';
  subjectsHeading.textContent = 'Subjects';
  body.appendChild(subjectsHeading);

  const chipsWrap = document.createElement('div');
  chipsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;min-height:22px;';
  body.appendChild(chipsWrap);

  function redrawSubjectChips() {
    chipsWrap.innerHTML = '';
    if (staged.size === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = 'opacity:0.4;font-size:0.75rem;';
      empty.textContent = '(none)';
      chipsWrap.appendChild(empty);
      return;
    }
    staged.forEach(({ axis, id, label }, key) => {
      const chip = document.createElement('span');
      chip.className = (chipClassMap[axis] || 'raga-chip');
      const isOriginal = originalKeys.has(key);
      chip.style.cssText = isOriginal ? 'opacity:0.6;' : 'cursor:pointer;';
      chip.textContent = label + (isOriginal ? '' : ' ×');
      chip.title = isOriginal ? label + ' (existing)' : 'Remove ' + label;
      if (!isOriginal) {
        chip.addEventListener('click', () => { staged.delete(key); redrawSubjectChips(); });
      }
      chipsWrap.appendChild(chip);
    });
  }
  redrawSubjectChips();

  const subjectCombo = efCombobox(null, allSubjectOpts, null, win);
  body.appendChild(efRow('Add subject', false, null, subjectCombo));

  const addSubjectBtn = efAddBtn('+ Add');
  addSubjectBtn.style.marginTop = '4px';
  addSubjectBtn.addEventListener('click', () => {
    const compositeVal = subjectCombo.getValue ? subjectCombo.getValue() : '';
    if (!compositeVal || staged.has(compositeVal)) return;
    const sep  = compositeVal.indexOf('::');
    if (sep < 0) return;
    const axis = compositeVal.slice(0, sep);
    const id   = compositeVal.slice(sep + 2);
    const opt  = (optListMap[axis] || []).find(o => o.value === id);
    staged.set(compositeVal, { axis, id, label: opt ? opt.label : id });
    redrawSubjectChips();
    if (subjectCombo.setValue) subjectCombo.setValue('');
  });
  body.appendChild(addSubjectBtn);

  // ── Time segments ─────────────────────────────────────────────────────────
  const segmentSep = document.createElement('hr');
  segmentSep.className = 'ef-group-sep';
  body.appendChild(segmentSep);

  const addSegBtn = efAddBtn('+ Add time segment');
  addSegBtn.style.marginBottom = '6px';
  body.appendChild(addSegBtn);

  const segRows = document.createElement('div');
  segRows.className = 'ef-lecdem-seg-rows';
  body.appendChild(segRows);

  function addSegCard(prefill) {
    const card = document.createElement('div');
    card.className = 'ef-seg-card';
    card.style.cssText = 'border:1px solid var(--border-soft);border-radius:4px;padding:8px 10px;margin-bottom:8px;background:var(--bg-input);';

    function makeNum(ph, maxVal) {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = String(maxVal);
      inp.placeholder = ph; inp.className = 'ef-input';
      inp.style.cssText = 'width:56px;text-align:center;';
      return inp;
    }
    function segLbl(t) {
      const s = document.createElement('span');
      s.textContent = t;
      s.style.cssText = 'font-size:0.72rem;color:var(--fg-muted);';
      return s;
    }
    const hInp = makeNum('HH', 99);
    const mInp = makeNum('MM', 59);
    const sInp = makeNum('SS', 59);

    if (prefill) {
      const total = prefill.offset_seconds || 0;
      hInp.value = Math.floor(total / 3600);
      mInp.value = Math.floor((total % 3600) / 60);
      sInp.value = total % 60;
    }

    const remBtn = document.createElement('button');
    remBtn.type = 'button'; remBtn.title = 'Remove segment';
    remBtn.style.cssText = 'margin-left:auto;flex-shrink:0;background:none;border:none;color:var(--fg-muted);cursor:pointer;font-size:1rem;padding:0 4px;line-height:1;';
    remBtn.textContent = '×';
    remBtn.addEventListener('mouseover', () => { remBtn.style.color = 'var(--accent-danger)'; });
    remBtn.addEventListener('mouseout',  () => { remBtn.style.color = 'var(--fg-muted)'; });
    remBtn.addEventListener('click', () => card.remove());

    const timeRow = document.createElement('div');
    timeRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px;';
    timeRow.appendChild(hInp); timeRow.appendChild(segLbl('h'));
    timeRow.appendChild(mInp); timeRow.appendChild(segLbl('m'));
    timeRow.appendChild(sInp); timeRow.appendChild(segLbl('s'));
    timeRow.appendChild(remBtn);
    card.appendChild(timeRow);

    // Subject tags for this segment
    const segStaged = new Map();
    const segChipsWrap = document.createElement('div');
    segChipsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;min-height:20px;margin-bottom:6px;';
    function redrawSegChips() {
      segChipsWrap.innerHTML = '';
      if (segStaged.size === 0) {
        const em = document.createElement('span');
        em.style.cssText = 'opacity:0.4;font-size:0.72rem;';
        em.textContent = '(none)';
        segChipsWrap.appendChild(em);
        return;
      }
      segStaged.forEach(({ axis, id, label }, key) => {
        const chip = document.createElement('span');
        chip.className = chipClassMap[axis] || 'raga-chip';
        chip.style.cssText = 'cursor:pointer;font-size:0.72rem;';
        chip.textContent = label + ' ×';
        chip.addEventListener('click', () => { segStaged.delete(key); redrawSegChips(); });
        segChipsWrap.appendChild(chip);
      });
    }

    if (prefill) {
      if (prefill.raga_id) {
        const opt = ragaOpts.find(o => o.value === prefill.raga_id);
        segStaged.set('raga_ids::' + prefill.raga_id, { axis: 'raga_ids', id: prefill.raga_id, label: opt ? opt.label : prefill.raga_id });
      }
      if (prefill.composition_id) {
        const opt = compOpts.find(o => o.value === prefill.composition_id);
        segStaged.set('composition_ids::' + prefill.composition_id, { axis: 'composition_ids', id: prefill.composition_id, label: opt ? opt.label : prefill.composition_id });
      }
    }
    redrawSegChips();
    card.appendChild(segChipsWrap);

    const segSubjCombo = efCombobox(null, allSubjectOpts, null, win);
    segSubjCombo.style.flex = '1';
    const segTagBtn = document.createElement('button');
    segTagBtn.type = 'button'; segTagBtn.textContent = '+ Tag';
    segTagBtn.className = 'ef-add-btn';
    segTagBtn.addEventListener('click', () => {
      const compositeVal = segSubjCombo.getValue ? segSubjCombo.getValue() : '';
      if (!compositeVal || segStaged.has(compositeVal)) return;
      const sep = compositeVal.indexOf('::');
      if (sep < 0) return;
      const axis = compositeVal.slice(0, sep);
      const id   = compositeVal.slice(sep + 2);
      const opt  = (optListMap[axis] || []).find(o => o.value === id);
      segStaged.set(compositeVal, { axis, id, label: opt ? opt.label : id });
      redrawSegChips();
      if (segSubjCombo.setValue) segSubjCombo.setValue('');
    });
    card.appendChild(efRow('Add tag', false, null, segSubjCombo));
    card.appendChild(segTagBtn);

    // Tala + Kind
    const talaInp = document.createElement('input');
    talaInp.type = 'text'; talaInp.className = 'ef-input';
    talaInp.placeholder = 'tala (e.g. ādi)';
    talaInp.style.flex = '1';
    if (prefill && prefill.tala) talaInp.value = prefill.tala;
    const kindSel = document.createElement('select');
    kindSel.className = 'ef-select'; kindSel.style.flex = '1';
    [
      ['', '— kind —'], ['kriti', 'Kriti'], ['varnam', 'Varnam'],
      ['padam', 'Padam'], ['javali', 'Jāvaḷi'], ['tillana', 'Tillāna'],
      ['alapana', 'Ālāpana'], ['tanam', 'Tānam'], ['niraval', 'Nirval'],
      ['kalpanaswaram', 'Kalpanāswaram'], ['tani', 'Tani āvartana'],
      ['other', 'Other'],
    ].forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = l;
      kindSel.appendChild(opt);
    });
    if (prefill && prefill.kind) kindSel.value = prefill.kind;
    const tkRow = document.createElement('div');
    tkRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px;';
    tkRow.appendChild(talaInp); tkRow.appendChild(kindSel);
    card.appendChild(tkRow);

    const notesInp = document.createElement('input');
    notesInp.type = 'text'; notesInp.className = 'ef-input';
    notesInp.placeholder = 'notes (optional)';
    if (prefill && prefill.notes) notesInp.value = prefill.notes;
    card.appendChild(notesInp);

    card._hInp   = hInp;
    card._mInp   = mInp;
    card._sInp   = sInp;
    card._staged = segStaged;
    card._tala   = talaInp;
    card._kind   = kindSel;
    card._notes  = notesInp;

    segRows.appendChild(card);
    hInp.focus();
  }

  // Pre-fill existing segments as display cards
  (ref.segments || []).forEach(seg => addSegCard(seg));

  addSegBtn.addEventListener('click', () => addSegCard(null));

  // ── Secondary fields ──────────────────────────────────────────────────────
  const secondarySep = document.createElement('hr');
  secondarySep.className = 'ef-group-sep';
  body.appendChild(secondarySep);

  const yearInp = efInput(null, 'number', 'e.g. 1965', null);
  yearInp.min = 1900; yearInp.max = 2030;
  if (ref.year) yearInp.value = ref.year;
  body.appendChild(efRow('Year', false, null, yearInp));

  const lblInp = efInput(null, 'text', 'label', null);
  if (ref.label) lblInp.value = ref.label;
  body.appendChild(efRow('Label', false, 'optional', lblInp));

  // ── Footer ────────────────────────────────────────────────────────────────
  function collectNewSegments() {
    const segs = [];
    segRows.querySelectorAll('.ef-seg-card').forEach(card => {
      const h = parseInt(card._hInp.value, 10) || 0;
      const m = parseInt(card._mInp.value, 10) || 0;
      const s = parseInt(card._sInp.value, 10) || 0;
      if (card._hInp.value === '' && card._mInp.value === '' && card._sInp.value === '') return;
      const offset = h * 3600 + m * 60 + s;
      const seg = { offset_seconds: offset };
      card._staged.forEach(({ axis, id }) => {
        if (axis === 'raga_ids')             seg.raga_id = id;
        else if (axis === 'composition_ids') seg.composition_id = id;
        else if (axis === 'musician_ids')    seg.musician_id = id;
      });
      const tala = card._tala.value.trim();
      if (tala) seg.tala = tala;
      const kind = card._kind.value;
      if (kind) seg.kind = kind;
      const notes = card._notes.value.trim();
      if (notes) seg.notes = notes;
      segs.push(seg);
    });
    return segs;
  }

  const stageBtn = document.createElement('button');
  stageBtn.type = 'button';
  stageBtn.className = 'ef-download-btn';
  stageBtn.textContent = '↪ Stage changes → bundle';
  stageBtn.addEventListener('click', () => {
    let count = 0;
    // Stage new subjects (skip originals)
    staged.forEach(({ axis, id }, key) => {
      if (!originalKeys.has(key)) {
        addToBundle('musicians', {
          op:    'append',
          id:    nodeId,
          array: `youtube[${vid}].subjects.${axis}`,
          value: id,
        });
        count++;
      }
    });
    // Stage all segments in the form as new appends
    const segs = collectNewSegments();
    segs.forEach(seg => {
      addToBundle('musicians', {
        op:    'append',
        id:    nodeId,
        array: `youtube[${vid}].segments`,
        value: seg,
      });
      count++;
    });
    if (count > 0) {
      stageBtn.textContent = `✓ Staged ${count} item${count > 1 ? 's' : ''}!`;
      setTimeout(() => { stageBtn.textContent = '↪ Stage changes → bundle'; }, 1800);
    } else {
      stageBtn.textContent = '(no new items)';
      setTimeout(() => { stageBtn.textContent = '↪ Stage changes → bundle'; }, 1200);
    }
  });
  foot.appendChild(stageBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ef-preview-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => win.remove());
  foot.appendChild(closeBtn);
}

// ── ADR-103 §2: locked-chip helpers for pre-targeted co-located triggers ─────
// Replaces the combobox's editable input with a read-only chip + "change" link.
// The "change" link restores the input for manual re-selection.
function _lockComboboxField(wrap, label) {
  const textInp  = wrap.querySelector('.ef-combobox-input');
  const clearBtn = wrap.querySelector('button[title="Clear selection"]');
  if (!textInp) return;
  textInp.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
  const chip = document.createElement('span');
  chip.className = 'ef-locked-chip';
  chip.textContent = label;
  const changeLink = document.createElement('button');
  changeLink.type = 'button';
  changeLink.className = 'ef-change-link';
  changeLink.textContent = 'change';
  changeLink.title = 'Pick a different value';
  changeLink.addEventListener('click', function() {
    chip.remove();
    changeLink.remove();
    textInp.style.display = '';
    textInp.focus();
  });
  wrap.appendChild(chip);
  wrap.appendChild(changeLink);
}

// ADR-105 / ADR-109: Pre-targeted Add Composition form.
// Called from the + chip on a Compositions section header.
// Accepts { composerId } (composer record exists) OR { musicianId }
// (musician has no composer record yet — musician-as-composer mode).
function openAddCompositionForm({ composerId, musicianId } = {}) {
  // If composerId not given but musicianId is, resolve via linked composer record.
  let resolvedComposerId = composerId;
  let _musicianNode = null;
  if (!resolvedComposerId && musicianId) {
    const linkedComposer = (graphData.composers || []).find(c => c.musician_node_id === musicianId);
    if (linkedComposer) {
      resolvedComposerId = linkedComposer.id;
    } else {
      // musician-as-composer mode — no linked composer record yet
      _musicianNode = (graphData.nodes || []).find(n => n.id === musicianId);
    }
  }

  if (resolvedComposerId) {
    // Standard path — composer record exists, lock the composer field.
    const win = buildCompositionForm();
    const hiddenSel = win.querySelector('#ef_comp_composer');
    if (!hiddenSel) return;
    const wrap = hiddenSel.parentElement;
    if (!wrap || typeof wrap.setValue !== 'function') return;
    const composerObj = (graphData.composers || []).find(c => c.id === resolvedComposerId);
    const composerLabel = composerObj ? (composerObj.name || resolvedComposerId) : resolvedComposerId;
    wrap.setValue(resolvedComposerId, composerLabel);
    _lockComboboxField(wrap, composerLabel);
    return;
  }

  if (_musicianNode) {
    // ADR-109 §2–3: musician-as-composer mode.
    // Opens composition form, locks composer field with a notice.
    // On bundle submit, emits both a companion composers create item and
    // the compositions create item.
    const win = buildCompositionForm();
    const hiddenSel = win.querySelector('#ef_comp_composer');
    if (!hiddenSel) return;
    const wrap = hiddenSel.parentElement;
    if (!wrap || typeof wrap.setValue !== 'function') return;
    const companionId    = _musicianNode.id;
    const companionLabel = _musicianNode.label || _musicianNode.id;
    wrap.setValue(companionId, companionLabel);
    _lockComboboxField(wrap, companionLabel + ' (composer record auto-created)');

    // Replace original bundle button to prevent double-submit.
    const footer = win.querySelector('.ew-footer');
    const origBundleBtn = footer ? footer.querySelector('.ef-download-btn') : null;
    if (origBundleBtn) {
      const newBundleBtn = document.createElement('button');
      newBundleBtn.type = 'button';
      newBundleBtn.className = origBundleBtn.className;
      newBundleBtn.textContent = origBundleBtn.textContent;
      newBundleBtn.disabled = true;
      origBundleBtn.parentNode.replaceChild(newBundleBtn, origBundleBtn);

      // Notice shown above the button
      const notice = document.createElement('p');
      notice.style.cssText = 'font-size:0.68rem;color:var(--fg-muted);margin:6px 0 2px;';
      notice.textContent = '\u2139\ufe0f A companion composer record for \u201c'
        + companionLabel + '\u201d will be added to the bundle automatically.';
      footer.insertBefore(notice, newBundleBtn);

      // Keep button disabled state in sync with form validity.
      const existingCompIds = (graphData.compositions || []).map(c => c.id);
      function syncValidation() {
        const title  = win.querySelector('#ef_comp_title') ? win.querySelector('#ef_comp_title').value.trim() : '';
        const compId = win.querySelector('#ef_comp_id')    ? win.querySelector('#ef_comp_id').value.trim()    : '';
        const ragaId = win.querySelector('#ef_comp_raga')  ? win.querySelector('#ef_comp_raga').value          : '';
        const dupId  = existingCompIds.includes(compId);
        newBundleBtn.disabled = !(title && compId && ragaId && !dupId);
      }
      win.addEventListener('input',  syncValidation);
      win.addEventListener('change', syncValidation);
      syncValidation();

      newBundleBtn.addEventListener('click', () => {
        const compObj = generateCompositionJson(win);
        // 1. Companion composer record (ADR-109 §3)
        addToBundle('composers', {
          op:               'create',
          id:               companionId,
          name:             companionLabel,
          musician_node_id: _musicianNode.id,
          born:             _musicianNode.born || null,
          died:             _musicianNode.died || null,
          sources:          [],
        });
        // 2. Composition
        addToBundle('compositions', compObj);

        // Success screen
        const body = win.querySelector('.ew-body');
        body.innerHTML = '';
        const msg = document.createElement('div');
        msg.className = 'ef-success';
        msg.innerHTML = '<strong>\u2713 Two items added to bundle:</strong>'
          + '<ul style="margin:6px 0;padding-left:1.2em;font-size:0.72rem;">'
          + '<li>Composer record: <code>' + companionId + '</code></li>'
          + '<li>Composition: <code>' + compObj.id + '</code></li>'
          + '</ul>'
          + '<p style="margin:4px 0 0;font-size:0.72rem;color:var(--fg-sub);">Download \u2B07 Bundle to apply.</p>';
        body.appendChild(msg);
        const footer2 = win.querySelector('.ew-footer');
        footer2.innerHTML = '';
        const closeBtn = document.createElement('button');
        closeBtn.className   = 'ef-preview-btn';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', () => win.remove());
        footer2.appendChild(closeBtn);
      });
    }
    return;
  }

  // Fallback: no pre-targeting — open plain form.
  buildCompositionForm();
}

// ── ADR-107: Pre-targeted Add Recording form (concert-anchored entry) ─────────
// Opens the Add Concert Recording form with the musician pre-attached as a
// performer and their primary instrument inferred as the default role.
// Called from the + chip on a musician panel's CONCERTS section header.
function openAddRecordingForm({ musicianId, role } = {}) {
  const win = buildRecordingForm();
  if (!musicianId) return;
  const sessionsContainer = win.querySelector('#ef_rec_sessions');
  if (!sessionsContainer) return;
  addSessionBlock(sessionsContainer, win);
  const sessionBlock = sessionsContainer.querySelector('.ef-session-block');
  if (!sessionBlock) return;
  const performersContainer = sessionBlock.querySelector('.ef-performers-container');
  if (!performersContainer) return;
  addPerformerBlock(performersContainer, win);
  const performerBlock = performersContainer.querySelector('.ef-performer-block');
  if (!performerBlock) return;
  const musWrap = performerBlock.querySelector('.ef-combobox-wrap');
  if (!musWrap || typeof musWrap.setValue !== 'function') return;
  const nodeObj = (graphData.nodes || []).find(n => n.id === musicianId);
  const musLabel = nodeObj ? (nodeObj.label || musicianId) : musicianId;
  musWrap.setValue(musicianId, musLabel);
  _lockComboboxField(musWrap, musLabel);
  // Pre-fill role from musician's primary instrument (editable — ADR-107 §2)
  const inferredRole = role || _inferPerformerRole(nodeObj ? (nodeObj.instrument || '') : '');
  const selects = performerBlock.querySelectorAll('select');
  if (selects[1]) selects[1].value = inferredRole;
}

function _inferPerformerRole(instrument) {
  const ROLE_OPTIONS = ['vocal', 'violin', 'veena', 'flute', 'mridangam', 'ghatam', 'tampura'];
  const instr = (instrument || '').toLowerCase().trim();
  return ROLE_OPTIONS.find(r => instr.includes(r)) || 'vocal';
}

// ADR-104 Track A stub / ADR-108 rewire.
// Musician type is now handled by openEditMusicianForm (ADR-108).
// Other entity types retain the coming-soon stub until their edit forms ship.
function openEditForm({ entityType, id } = {}) {
  if (entityType === 'musician' && id) {
    openEditMusicianForm(id);
    return;
  }
  const LABELS = { musician: 'Musician', raga: 'Raga', comp: 'Composition', composer: 'Composer' };
  const typeLabel = LABELS[entityType] || 'Entity';
  const win = createEntryWindow('Edit ' + typeLabel);
  const body = win.querySelector('.ew-body');
  const msg = document.createElement('p');
  msg.style.cssText = 'margin:12px 0; font-size:0.82rem; color:var(--fg-muted); line-height:1.5;';
  msg.innerHTML = '<strong style="color:var(--fg)">Edit form coming with ADR-097\u00a0Phase\u00a0C.</strong><br>'
    + 'Use the + chips on each panel to add new entries in the meantime.';
  body.appendChild(msg);
  return win;
}
// Called from the + chip on the Janyas panel header.
function openAddRagaForm({ parentRagaId, mela } = {}) {
  const win = buildRagaForm();
  // ADR-115: Lock tradition to Carnatic when adding from a mela panel
  // (HERs cannot be janyas of melakartas)
  const _tradHindBtn = win.querySelector('#raga-tradition-control [data-value="hindustani"]');
  if (_tradHindBtn) {
    _tradHindBtn.disabled = true;
    _tradHindBtn.title = 'Janyas of melakartas are always Carnatic. To add a Hindustani raga, start from a Carnatic raga\u2019s panel.';
    _tradHindBtn.style.opacity = '0.45';
  }
  if (!parentRagaId) return;
  // Lock "Is Melakarta?" to "No — Janya raga" (non-editable when adding under a mela)
  const melaSel = win.querySelector('#ef_raga_is_mela');
  if (melaSel) {
    melaSel.value = 'false';
    melaSel.dispatchEvent(new Event('change'));
    melaSel.disabled = true;
    melaSel.style.opacity = '0.6';
  }
  // Pre-fill + lock the parent_raga combobox
  const parentSelect = win.querySelector('#ef_raga_parent');
  if (parentSelect) {
    const wrap = parentSelect.closest('.ef-combobox-wrap') || parentSelect.parentElement;
    if (wrap && typeof wrap.setValue === 'function') {
      const parentRaga = (graphData.ragas || []).find(r => r.id === parentRagaId);
      const parentLabel = parentRaga ? (parentRaga.name || parentRagaId) : parentRagaId;
      wrap.setValue(parentRagaId, parentLabel);
      _lockComboboxField(wrap, parentLabel);
    }
  }
}

// ADR-115: Opens Add Raga form in Hindustani state with carnatic_equivalents pre-filled.
// Called from the + button on a Carnatic raga panel's HER row.
function openAddRagaFormHER(carnaticRagaId) {
  const win = buildRagaForm();
  // Switch tradition to Hindustani
  const _hindBtn = win.querySelector('#raga-tradition-control [data-value="hindustani"]');
  if (_hindBtn) _hindBtn.click();
  // Pre-fill + lock carnatic equivalent back-link
  if (carnaticRagaId) {
    const carnEqHidden = win.querySelector('#ef_raga_carnatic_equiv');
    if (carnEqHidden) {
      const wrap = carnEqHidden.closest('.ef-combobox-wrap') || carnEqHidden.parentElement;
      if (wrap && typeof wrap.setValue === 'function') {
        const cr = (graphData.ragas || []).find(r => r.id === carnaticRagaId);
        const label = cr ? (cr.name || carnaticRagaId) : carnaticRagaId;
        wrap.setValue(carnaticRagaId, label);
        _lockComboboxField(wrap, label);
      }
    }
  }
}

// ADR-115: Opens Add Raga form in Carnatic state.
// Called from the + button on a HER panel's Carnatic equivalents row.
function openAddRagaFormCarnatic() {
  buildRagaForm();
  // Default state is already Carnatic — no locking needed.
}

// ── ADR-108: Add / Edit Musician form (entity fields + edges, no YouTube) ─────
// Create mode (prefill=null): generates { type:'new', id, label, ... } bundle item.
// Edit mode (prefill=nodeObj): pre-fills fields, generates { op:'patch', id, fields:{} }.
// Called by openAddMusicianForm() and openEditMusicianForm(nodeId).
function buildAddMusicianForm({ prefill = null } = {}) {
  const isEdit = !!prefill;
  const win = createEntryWindow(isEdit ? 'Edit Musician' : 'Add Musician');
  const body = win.querySelector('.ew-body');

  const existingIds = (graphData.nodes || []).map(n => n.id);

  // ── Node fields ───────────────────────────────────────────────────────────
  body.appendChild(efSection('Musician'));

  const labelInp = efInput('ef_adm_label', 'text', 'e.g. Semmangudi Srinivasa Iyer', null);
  body.appendChild(efRow('Display Name', true, null, labelInp));

  const idRow = efIdRow('ef_adm_id', 'ef_adm_label', existingIds);
  body.appendChild(idRow);
  if (!isEdit) {
    labelInp.addEventListener('input', idRow._updateId);
  }

  const bornInp = efInput('ef_adm_born', 'number', 'e.g. 1908', null);
  bornInp.min = 1600; bornInp.max = 2030;
  body.appendChild(efRow('Born (year)', false, null, bornInp));

  const diedInp = efInput('ef_adm_died', 'number', 'leave blank if living', null);
  diedInp.min = 1600; diedInp.max = 2030;
  body.appendChild(efRow('Died (year)', false, null, diedInp));

  const eraOpts  = ['trinity', 'bridge', 'golden_age', 'disseminator', 'living_pillars', 'contemporary'];
  const eraSel   = efSelect('ef_adm_era', eraOpts, false);
  body.appendChild(efRow('Era', true, null, eraSel));

  // ADR-115: All instruments (Carnatic + 6 new Hindustani instruments)
  const _instrCarnaticOpts  = ['vocal', 'veena', 'violin', 'flute', 'mridangam', 'bharatanatyam', 'ghatam', 'other'];
  const _instrHindustaniOpts = ['sitar', 'sarod', 'bansuri', 'tabla', 'sarangi', 'surbahar'];
  const instrOpts = [..._instrCarnaticOpts.slice(0, 1), ..._instrHindustaniOpts, ..._instrCarnaticOpts.slice(1)];
  const instrSel  = efSelect('ef_adm_instr', instrOpts, false);
  body.appendChild(efRow('Instrument', true, null, instrSel));

  // ADR-115: Traditions chips (independent toggles — both can be active simultaneously)
  body.appendChild(efSection('Traditions'));
  const tradChipsDiv = document.createElement('div');
  tradChipsDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
  const carnaticChip = document.createElement('button');
  carnaticChip.type = 'button'; carnaticChip.className = 'tradition-chip active';
  carnaticChip.dataset.value = 'carnatic'; carnaticChip.textContent = 'Carnatic';
  const hindustaniChip = document.createElement('button');
  hindustaniChip.type = 'button'; hindustaniChip.className = 'tradition-chip';
  hindustaniChip.dataset.value = 'hindustani'; hindustaniChip.textContent = 'Hindustani';
  tradChipsDiv.appendChild(carnaticChip); tradChipsDiv.appendChild(hindustaniChip);
  body.appendChild(tradChipsDiv);

  // Grey hint shown only when Hindustani-only tradition selected (no gharana field per ADR-114 §5)
  const gharanaHint = document.createElement('p');
  gharanaHint.style.cssText = 'font-size:0.66rem;color:var(--fg-muted);margin:0 0 8px;display:none;';
  gharanaHint.textContent = '(if Hindustani: gharana / lineage notes go in the Notes field as prose)';
  body.appendChild(gharanaHint);

  [carnaticChip, hindustaniChip].forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      // Update instrument list ordering when Hindustani is active
      const hindActive = hindustaniChip.classList.contains('active');
      const carnActive = carnaticChip.classList.contains('active');
      // Show gharana hint when Hindustani-only
      gharanaHint.style.display = (hindActive && !carnActive) ? '' : 'none';
      win.dispatchEvent(new Event('input'));
    });
  });

  // ADR-097 §5: bani not collected at intake — set later via patch by librarian.
  body.appendChild(efSourceFields('ef_adm'));

  // ── Guru-Shishya Edges ────────────────────────────────────────────────────
  body.appendChild(efSection('Guru-Shishya Edges'));
  const edgesContainer = document.createElement('div');
  edgesContainer.id = 'ef_adm_edges';
  body.appendChild(edgesContainer);

  const addGuruBtn = efAddBtn('+ Add Guru (this musician is shishya of\u2026)');
  body.appendChild(addGuruBtn);
  addGuruBtn.addEventListener('click', () => addEdgeBlock(edgesContainer, 'guru', win));

  const addShishyaBtn = efAddBtn('+ Add Shishya (this musician is guru of\u2026)');
  body.appendChild(addShishyaBtn);
  addShishyaBtn.addEventListener('click', () => addEdgeBlock(edgesContainer, 'shishya', win));

  // ── Pre-fill in edit mode ─────────────────────────────────────────────────
  if (isEdit) {
    labelInp.value = prefill.label || '';
    const idInput = idRow._idInput;
    if (idInput) {
      idInput.value    = prefill.id;
      idInput.readOnly = true;
      idInput.style.opacity = '0.6';
      // Hide the "Edit" unlock button — node IDs are permanent (CLAUDE.md)
      const editBtn = idRow.querySelector('.ef-id-edit-btn');
      if (editBtn) editBtn.style.display = 'none';
    }
    if (prefill.born)       bornInp.value  = prefill.born;
    if (prefill.died)       diedInp.value  = prefill.died;
    if (prefill.era)        eraSel.value   = prefill.era;
    if (prefill.instrument) instrSel.value = prefill.instrument;
    // Pre-fill first source URL
    const srcUrlInp = win.querySelector('#ef_adm_source_url');
    if (srcUrlInp && prefill.sources && prefill.sources.length > 0) {
      const first = prefill.sources[0];
      srcUrlInp.value = (typeof first === 'string') ? first : (first.url || '');
    }
    // Pre-fill existing edges as read-only display rows
    const existingEdges = (graphData.edges || []).filter(
      e => e.source === prefill.id || e.target === prefill.id
    );
    existingEdges.forEach(e => {
      const direction  = e.target === prefill.id ? 'guru' : 'shishya';
      const otherId    = direction === 'guru' ? e.source : e.target;
      const otherNode  = (graphData.nodes || []).find(n => n.id === otherId);
      const otherLabel = otherNode ? otherNode.label : otherId;
      addEdgeBlock(edgesContainer, direction, win, {
        otherId, otherLabel,
        confidence: e.confidence,
        source_url: e.source_url,
        note:       e.note,
      });
    });
    // Edit-mode note
    const editNote = document.createElement('p');
    editNote.style.cssText = 'font-size:0.68rem;color:var(--fg-muted);margin:4px 0 8px;';
    editNote.textContent = 'Only changed fields are included in the patch bundle item.';
    body.appendChild(editNote);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = win.querySelector('.ew-footer');

  const bundleBtn = document.createElement('button');
  bundleBtn.className  = 'ef-download-btn';
  bundleBtn.textContent = '+ Add to Bundle';
  bundleBtn.disabled   = true;

  const previewBtn = document.createElement('button');
  previewBtn.className  = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  footer.appendChild(bundleBtn);
  footer.appendChild(previewBtn);

  // ── Helpers ───────────────────────────────────────────
  function collectEdges(musId) {
    const edges = [];
    win.querySelectorAll('#ef_adm_edges .ef-repeat-block:not([data-prefilled])').forEach(block => {
      const direction = block.dataset.direction;
      const selects   = block.querySelectorAll('select');
      const inputs    = block.querySelectorAll('input:not([data-combobox-filter])');
      const otherId   = selects[0] ? selects[0].value          : '';
      const conf      = inputs[0]  ? parseFloat(inputs[0].value) : 0.90;
      const edgeSrc   = inputs[1]  ? inputs[1].value.trim()    : '';
      const note      = inputs[2]  ? inputs[2].value.trim()    : '';
      if (!otherId) return;
      const source = direction === 'guru' ? otherId : musId;
      const target = direction === 'guru' ? musId   : otherId;
      edges.push({ source, target, confidence: conf, source_url: edgeSrc, note: note || null });
    });
    return edges;
  }

  function getCurrentValues() {
    return {
      label: labelInp.value.trim(),
      born:  bornInp.value ? parseInt(bornInp.value, 10) : null,
      died:  diedInp.value ? parseInt(diedInp.value, 10) : null,
      era:   eraSel.value,
      instr: instrSel.value,
    };
  }

  function buildBundleItem() {
    const id = idRow._idInput ? idRow._idInput.value.trim() : '';
    const v  = getCurrentValues();
    const srcUrl = win.querySelector('#ef_adm_source_url') ? win.querySelector('#ef_adm_source_url').value.trim() : '';
    // ADR-115: collect traditions from chips
    const traditions = [];
    if (carnaticChip.classList.contains('active'))   traditions.push('carnatic');
    if (hindustaniChip.classList.contains('active')) traditions.push('hindustani');
    if (traditions.length === 0) traditions.push('carnatic'); // default

    if (isEdit) {
      // op: patch — only fields that changed from prefill values
      const fields = {};
      if (v.label !== (prefill.label || ''))              fields.label      = v.label;
      if (v.born  !== (prefill.born  || null))            fields.born       = v.born;
      if (v.died  !== (prefill.died  || null))            fields.died       = v.died;
      if (v.era   !== (prefill.era   || ''))              fields.era        = v.era;
      if (v.instr !== (prefill.instrument || ''))         fields.instrument = v.instr;
      const _edges = collectEdges(prefill.id);
      return { op: 'patch', id: prefill.id, fields, _edges };
    }

    return {
      type:       'new',
      id,
      label:      v.label,
      sources:    [inferSource(srcUrl)],
      born:       v.born,
      died:       v.died,
      era:        v.era,
      instrument: v.instr,
      traditions,
      bani:       null,
      youtube:    [],
      _edges:     collectEdges(id),
    };
  }

  function countChangedFields() {
    const v = getCurrentValues();
    let n = 0;
    if (v.label !== (prefill.label || ''))          n++;
    if (v.born  !== (prefill.born  || null))        n++;
    if (v.died  !== (prefill.died  || null))        n++;
    if (v.era   !== (prefill.era   || ''))          n++;
    if (v.instr !== (prefill.instrument || ''))     n++;
    // Count new (non-prefilled) edge rows that have a musician selected
    win.querySelectorAll('#ef_adm_edges .ef-repeat-block:not([data-prefilled])').forEach(block => {
      const sel = block.querySelectorAll('select')[0];
      if (sel && sel.value) n++;
    });
    return n;
  }

  function validate() {
    let ok = false;
    if (isEdit) {
      ok = countChangedFields() > 0;
    } else {
      const { label, era, instr } = getCurrentValues();
      const id     = idRow._idInput ? idRow._idInput.value.trim() : '';
      const srcUrl = win.querySelector('#ef_adm_source_url') ? win.querySelector('#ef_adm_source_url').value.trim() : '';
      const dupId  = existingIds.includes(id);
      ok = !!(label && id && era && instr && srcUrl && !dupId);
    }
    bundleBtn.disabled = !ok;
    if (previewPre.style.display !== 'none') updatePreview();
  }

  function updatePreview() {
    try {
      const item = buildBundleItem();
      previewPre.textContent = JSON.stringify(item, null, 2);
    } catch(e) { previewPre.textContent = '(incomplete)'; }
  }

  win.addEventListener('input',  validate);
  win.addEventListener('change', validate);

  previewBtn.addEventListener('click', () => {
    const open = previewPre.style.display !== 'none';
    previewPre.style.display = open ? 'none' : 'block';
    previewBtn.textContent   = open ? 'Preview JSON' : 'Hide Preview';
    if (!open) updatePreview();
  });

  bundleBtn.addEventListener('click', () => {
    const item     = buildBundleItem();
    const newEdges = item._edges || [];
    delete item._edges;

    // Always route new edges to bundle.items.edges (works for both new and edit)
    newEdges.forEach(e => addToBundle('edges', e));

    const musId = item.id || (isEdit ? prefill.id : '');
    // For edit mode: only add musician patch item if scalar fields actually changed
    if (!isEdit || Object.keys(item.fields || {}).length > 0) {
      addToBundle('musicians', item);
    }

    // Success screen
    const body2 = win.querySelector('.ew-body');
    body2.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'ef-success';
    const editSummary = isEdit
      ? (newEdges.length > 0 && Object.keys(item.fields || {}).length === 0
          ? `${newEdges.length} edge${newEdges.length > 1 ? 's' : ''} queued for <code>${prefill.id}</code>`
          : `Patch queued for <code>${prefill.id}</code>`)
      : null;
    msg.innerHTML = isEdit
      ? `<strong>\u2713 Added to bundle: ${editSummary}</strong>`
        + `<p style="margin:8px 0 0;font-size:0.72rem;color:var(--fg-sub);">Download \u2B07 Bundle to apply the changes.</p>`
      : `<strong>\u2713 Added to bundle: <code>${musId}</code></strong>`
        + `<p style="margin:8px 0 0;font-size:0.72rem;color:var(--fg-sub);">Download \u2B07 Bundle when done adding items.</p>`;
    body2.appendChild(msg);

    const footer2 = win.querySelector('.ew-footer');
    footer2.innerHTML = '';
    if (!isEdit) {
      const addMoreBtn = document.createElement('button');
      addMoreBtn.className  = 'ef-preview-btn';
      addMoreBtn.textContent = 'Add another musician';
      addMoreBtn.addEventListener('click', () => { win.remove(); buildAddMusicianForm(); });
      footer2.appendChild(addMoreBtn);
    }
    const closeBtn = document.createElement('button');
    closeBtn.className  = 'ef-preview-btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => win.remove());
    footer2.appendChild(closeBtn);
  });

  validate();
  return win;
}

// ── ADR-108: Recordings-only form (YouTube-entry path, musician pre-targetable) ─
// Switches the combined form to "Existing Musician" mode and optionally
// pre-selects musicianId. Used by the + chip on panel YouTube section
// and by the deprecated global bar until ADR-111 removes it.
function buildAddYouTubeToMusicianForm(musicianId) {
  const win = _buildCombinedMusicianYouTubeForm();
  // Switch to "Existing Musician" mode (second .ef-add-btn = existingBtn)
  const modeBtns = win.querySelectorAll('.ef-add-btn');
  if (modeBtns[1]) modeBtns[1].click();
  // Pre-select musician if provided
  if (musicianId) {
    const hiddenInp = win.querySelector('#efmr_existing_musician');
    if (hiddenInp) {
      const wrap = hiddenInp.parentElement;
      if (wrap && typeof wrap.setValue === 'function') {
        const node = (graphData.nodes || []).find(n => n.id === musicianId);
        if (node) {
          wrap.setValue(musicianId, node.label || musicianId);
          wrap.dispatchEvent(new Event('change'));
          win.dispatchEvent(new Event('input'));
        }
      }
    }
  }
  return win;
}

// ADR-108 transition shim: buildMusicianRecordingsForm → buildAddMusicianForm.
// Existing call-sites (openEntryForm('musician_recordings'), showBundleSuccess)
// are preserved. The "Musician / Recordings" global bar button still calls this
// until ADR-111 removes it.
function buildMusicianRecordingsForm() { return buildAddMusicianForm(); }

// ── ADR-108: Co-located entry points for musician panel ───────────────────────

// Called from the + chip on the MUSICIAN ♫ panel header.
function openAddMusicianForm() {
  buildAddMusicianForm();
}

// ── Focused YouTube entry form ─────────────────────────────────────────────────
// Called from the + chip on the "By Raga" section header. Opens a clean modal
// pre-locked to a specific musician — no musician-selection step, no new-musician
// baggage. Reuses addYoutubeBlock() for field composition with full dropdowns,
// composition→raga auto-fill, year, tala, and accompanists.

function buildFocusedYouTubeForm(musicianId) {
  const node = (graphData.nodes || []).find(n => n.id === musicianId);
  const label = node ? (node.label || musicianId) : musicianId;

  const win  = createEntryWindow('Add YouTube Recordings');
  const body = win.querySelector('.ew-body');

  // ── Musician identity row (read-only) ──────────────────────────────────────
  const musRow = document.createElement('div');
  musRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);';
  const musLabel = document.createElement('span');
  musLabel.style.cssText = 'font-size:0.72rem;font-weight:600;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.06em;flex-shrink:0;';
  musLabel.textContent = 'Musician';
  const musChip = document.createElement('span');
  musChip.className = 'musician-chip';
  if (node) {
    const tint = (typeof THEME !== 'undefined') ? THEME.eraTintCss(node.era || null) : { bg: '', border: '' };
    musChip.style.setProperty('--chip-era-bg', tint.bg);
    musChip.style.setProperty('--chip-era-border', tint.border);
    if (node.instrument && typeof makeInstrBadge === 'function') {
      musChip.appendChild(makeInstrBadge(node.instrument));
    }
    musChip.appendChild(document.createTextNode(label));
  } else {
    musChip.textContent = label;
  }
  musRow.appendChild(musLabel);
  musRow.appendChild(musChip);
  body.appendChild(musRow);

  // ── YouTube entries ────────────────────────────────────────────────────────
  body.appendChild(efSection('YouTube Entries'));
  const ytContainer = document.createElement('div');
  ytContainer.id = 'efy_youtube';
  body.appendChild(ytContainer);

  // Auto-open the first block so the user can start typing immediately.
  addYoutubeBlock(ytContainer, win);

  const addAnotherBtn = efAddBtn('+ Add another video');
  addAnotherBtn.addEventListener('click', () => addYoutubeBlock(ytContainer, win));
  body.appendChild(addAnotherBtn);

  // ── Footer ─────────────────────────────────────────────────────────────────
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

  // ── JSON builder ───────────────────────────────────────────────────────────
  function collectYoutube() {
    const entries = [];
    const hostNode_ = (graphData.nodes || []).find(n => n.id === musicianId);
    const hostInstrument = hostNode_ ? hostNode_.instrument : 'vocal';
    win.querySelectorAll('#efy_youtube .ef-youtube-block').forEach(block => {
      const inputs   = block.querySelectorAll(':scope > .ef-row input:not([data-combobox-filter])');
      const url      = inputs[0] ? inputs[0].value.trim() : '';
      const year     = inputs[1] ? inputs[1].value        : '';
      const version  = inputs[2] ? inputs[2].value.trim() : '';
      let   lbl      = inputs[3] ? inputs[3].value.trim() : '';
      const compId   = block._compSel ? block._compSel.getValue() : '';
      const ragaId   = block._ragaSel ? block._ragaSel.getValue() : '';
      const tala     = block._talaSel ? block._talaSel.getValue() : '';
      if (!url) return;
      // Auto-generate label if empty
      if (!lbl) {
        const parts = [
          block._compSel ? block._compSel.getLabel() : '',
          block._ragaSel ? block._ragaSel.getLabel() : '',
          tala,
        ].filter(Boolean);
        lbl = parts.join(' · ');
      }
      const entry = { url, label: lbl };
      if (compId)  entry.composition_id = compId;
      if (ragaId)  entry.raga_id        = ragaId;
      if (year)    entry.year           = parseInt(year, 10);
      if (version) entry.version        = version;
      if (tala)    entry.tala           = tala;
      // ADR-115: HER mode — emit kind from the HER kind selector
      if (block._herMode && block._herKindSel) {
        entry.kind = block._herKindSel.value || 'raga_alap';
      }
      const performers = (typeof collectYoutubePerformers === 'function')
        ? collectYoutubePerformers(block, musicianId, hostInstrument)
        : null;
      if (performers) entry.performers = performers;
      entries.push(entry);
    });
    return entries;
  }

  function buildBundleItem() {
    return { type: 'youtube_append', musician_id: musicianId, youtube: collectYoutube() };
  }

  function updateButtons() {
    const hasEntries = win.querySelectorAll('#efy_youtube .ef-youtube-block').length > 0;
    bundleBtn.disabled = !hasEntries;
    dlBtn.disabled     = !hasEntries;
  }

  win.addEventListener('input', updateButtons);

  previewBtn.addEventListener('click', () => {
    previewPre.textContent = JSON.stringify(buildBundleItem(), null, 2);
  });

  dlBtn.addEventListener('click', () => {
    const data = buildBundleItem();
    if (!data.youtube.length) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'youtube_' + musicianId + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  bundleBtn.addEventListener('click', () => {
    const data = buildBundleItem();
    if (!data.youtube.length) return;
    if (typeof addToBundle === 'function') {
      addToBundle('musicians', { op: 'append', id: musicianId, array: 'youtube', value: data.youtube });
      bundleBtn.disabled = true;
      bundleBtn.textContent = '✓ Added';
      setTimeout(() => { bundleBtn.disabled = false; bundleBtn.textContent = '+ Add to Bundle'; }, 2000);
    }
  });

  return win;
}

// Called from the + chip on the "By Raga" section header in the musician panel.
function openAddYouTubeToMusicianForm(musicianId) {
  buildFocusedYouTubeForm(musicianId);
}

// ── Focused Lecdem Form ───────────────────────────────────────────────────────

function buildFocusedLecdemForm(musicianId) {
  const win = createEntryWindow('Add Lecdem Recording');
  const body = win.querySelector('.ew-body');
  const node = (graphData.nodes || []).find(n => n.id === musicianId);

  // ── Musician read-only chip ───────────────────────────────────────────────
  const musicianChip = document.createElement('span');
  musicianChip.className = 'musician-chip';
  musicianChip.style.cssText = 'cursor:default;align-self:flex-start;';
  musicianChip.textContent = node ? node.label : musicianId;
  body.appendChild(efRow('Musician', false, null, musicianChip));

  // ── URL (required) ────────────────────────────────────────────────────────
  const urlInp = efInput(null, 'text', 'https://youtu.be/…');
  body.appendChild(efRow('YouTube URL', true, null, urlInp));

  // ── Subjects — single merged combobox (matches Edit Lecdem Subjects style) ─
  const subjectSep = document.createElement('hr');
  subjectSep.className = 'ef-group-sep';
  body.appendChild(subjectSep);

  const ragaOpts = (graphData.ragas || []).map(r => ({ value: r.id, label: r.name || r.id }));
  const compOpts = (graphData.compositions || []).map(c => ({ value: c.id, label: c.title || c.id }));
  const musOpts  = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
  const allSubjectOpts = [
    ...ragaOpts.map(o => ({ value: `raga_ids::${o.value}`,         label: `${o.label} (Raga)` })),
    ...compOpts.map(o => ({ value: `composition_ids::${o.value}`,   label: `${o.label} (Comp)` })),
    ...musOpts.map(o  => ({ value: `musician_ids::${o.value}`,      label: `${o.label} (Musician)` })),
  ];

  const chipClassMap = { raga_ids: 'raga-chip', composition_ids: 'comp-chip', musician_ids: 'musician-chip' };
  const staged = new Map(); // compositeKey → { axis, id, label }

  const subjectsHeading = document.createElement('div');
  subjectsHeading.style.cssText = 'font-size:0.68rem;color:var(--fg-sub);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;';
  subjectsHeading.textContent = 'Subjects';
  body.appendChild(subjectsHeading);

  const chipsWrap = document.createElement('div');
  chipsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;min-height:22px;';
  body.appendChild(chipsWrap);

  function redrawSubjectChips() {
    chipsWrap.innerHTML = '';
    if (staged.size === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = 'opacity:0.4;font-size:0.75rem;';
      empty.textContent = '(none)';
      chipsWrap.appendChild(empty);
      return;
    }
    staged.forEach(({ axis, id, label }, key) => {
      const chip = document.createElement('span');
      chip.className = chipClassMap[axis] || 'raga-chip';
      chip.style.cssText = 'cursor:pointer;';
      chip.textContent = label + ' ×';
      chip.title = 'Remove ' + label;
      chip.addEventListener('click', () => { staged.delete(key); redrawSubjectChips(); });
      chipsWrap.appendChild(chip);
    });
  }
  redrawSubjectChips();

  const subjectCombo = efCombobox(null, allSubjectOpts, null, win);
  body.appendChild(efRow('Add subject', false, null, subjectCombo));

  const addSubjectBtn = efAddBtn('+ Add');
  addSubjectBtn.style.marginTop = '4px';
  addSubjectBtn.addEventListener('click', () => {
    const compositeVal = subjectCombo.getValue ? subjectCombo.getValue() : '';
    if (!compositeVal || staged.has(compositeVal)) return;
    const sep  = compositeVal.indexOf('::');
    if (sep < 0) return;
    const axis = compositeVal.slice(0, sep);
    const id   = compositeVal.slice(sep + 2);
    const optListMap = { raga_ids: ragaOpts, composition_ids: compOpts, musician_ids: musOpts };
    const opt = (optListMap[axis] || []).find(o => o.value === id);
    staged.set(compositeVal, { axis, id, label: opt ? opt.label : id });
    redrawSubjectChips();
    if (subjectCombo.setValue) subjectCombo.setValue('');
  });
  body.appendChild(addSubjectBtn);

  // ── Time segments ─────────────────────────────────────────────────────────
  const segmentSep = document.createElement('hr');
  segmentSep.className = 'ef-group-sep';
  body.appendChild(segmentSep);

  const addSegBtn = efAddBtn('+ Add time segment');
  addSegBtn.style.marginBottom = '6px';
  body.appendChild(addSegBtn);

  const segRows = document.createElement('div');
  segRows.className = 'ef-lecdem-seg-rows';
  body.appendChild(segRows);

  addSegBtn.addEventListener('click', () => {
    const card = document.createElement('div');
    card.className = 'ef-seg-card';
    card.style.cssText = 'border:1px solid var(--border-soft);border-radius:4px;padding:8px 10px;margin-bottom:8px;background:var(--bg-input);';

    // ── Time: HH / MM / SS ─────────────────────────────────────────────────
    function makeNum(ph, maxVal) {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = String(maxVal);
      inp.placeholder = ph; inp.className = 'ef-input';
      inp.style.cssText = 'width:56px;text-align:center;';
      return inp;
    }
    function segLbl(t) {
      const s = document.createElement('span');
      s.textContent = t;
      s.style.cssText = 'font-size:0.72rem;color:var(--fg-muted);';
      return s;
    }
    const hInp = makeNum('HH', 99);
    const mInp = makeNum('MM', 59);
    const sInp = makeNum('SS', 59);

    const remBtn = document.createElement('button');
    remBtn.type = 'button'; remBtn.title = 'Remove segment';
    remBtn.style.cssText = 'margin-left:auto;flex-shrink:0;background:none;border:none;color:var(--fg-muted);cursor:pointer;font-size:1rem;padding:0 4px;line-height:1;';
    remBtn.textContent = '×';
    remBtn.addEventListener('mouseover', () => { remBtn.style.color = 'var(--accent-danger)'; });
    remBtn.addEventListener('mouseout',  () => { remBtn.style.color = 'var(--fg-muted)'; });
    remBtn.addEventListener('click', () => card.remove());

    const timeRow = document.createElement('div');
    timeRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px;';
    timeRow.appendChild(hInp); timeRow.appendChild(segLbl('h'));
    timeRow.appendChild(mInp); timeRow.appendChild(segLbl('m'));
    timeRow.appendChild(sInp); timeRow.appendChild(segLbl('s'));
    timeRow.appendChild(remBtn);
    card.appendChild(timeRow);

    // ── Subjects: reuse allSubjectOpts / ragaOpts / compOpts / musOpts / chipClassMap ─
    const segStaged = new Map();
    const segChipsWrap = document.createElement('div');
    segChipsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;min-height:20px;margin-bottom:6px;';
    function redrawSegChips() {
      segChipsWrap.innerHTML = '';
      if (segStaged.size === 0) {
        const em = document.createElement('span');
        em.style.cssText = 'opacity:0.4;font-size:0.72rem;';
        em.textContent = '(none)';
        segChipsWrap.appendChild(em);
        return;
      }
      segStaged.forEach(({ axis, id, label }, key) => {
        const chip = document.createElement('span');
        chip.className = chipClassMap[axis] || 'raga-chip';
        chip.style.cssText = 'cursor:pointer;font-size:0.72rem;';
        chip.textContent = label + ' ×';
        chip.addEventListener('click', () => { segStaged.delete(key); redrawSegChips(); });
        segChipsWrap.appendChild(chip);
      });
    }
    redrawSegChips();
    card.appendChild(segChipsWrap);

    const segSubjCombo = efCombobox(null, allSubjectOpts, null, win);
    segSubjCombo.style.flex = '1';
    const segTagBtn = document.createElement('button');
    segTagBtn.type = 'button'; segTagBtn.textContent = '+ Tag';
    segTagBtn.className = 'ef-add-btn';
    segTagBtn.addEventListener('click', () => {
      const compositeVal = segSubjCombo.getValue ? segSubjCombo.getValue() : '';
      if (!compositeVal || segStaged.has(compositeVal)) return;
      const sep = compositeVal.indexOf('::');
      if (sep < 0) return;
      const axis = compositeVal.slice(0, sep);
      const id   = compositeVal.slice(sep + 2);
      const optListMap = { raga_ids: ragaOpts, composition_ids: compOpts, musician_ids: musOpts };
      const opt = (optListMap[axis] || []).find(o => o.value === id);
      segStaged.set(compositeVal, { axis, id, label: opt ? opt.label : id });
      redrawSegChips();
      if (segSubjCombo.setValue) segSubjCombo.setValue('');
    });
    card.appendChild(efRow('Add tag', false, null, segSubjCombo));
    card.appendChild(segTagBtn);

    // ── Tala + Kind ────────────────────────────────────────────────────────
    const talaInp = document.createElement('input');
    talaInp.type = 'text'; talaInp.className = 'ef-input';
    talaInp.placeholder = 'tala (e.g. ādi)';
    talaInp.style.flex = '1';
    const kindSel = document.createElement('select');
    kindSel.className = 'ef-select'; kindSel.style.flex = '1';
    [
      ['', '— kind —'], ['kriti', 'Kriti'], ['varnam', 'Varnam'],
      ['padam', 'Padam'], ['javali', 'Jāvaḷi'], ['tillana', 'Tillāna'],
      ['alapana', 'Ālāpana'], ['tanam', 'Tānam'], ['niraval', 'Nirval'],
      ['kalpanaswaram', 'Kalpanāswaram'], ['tani', 'Tani āvartana'],
      ['other', 'Other'],
    ].forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = l;
      kindSel.appendChild(opt);
    });
    const tkRow = document.createElement('div');
    tkRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px;';
    tkRow.appendChild(talaInp); tkRow.appendChild(kindSel);
    card.appendChild(tkRow);

    // ── Notes ──────────────────────────────────────────────────────────────
    const notesInp = document.createElement('input');
    notesInp.type = 'text'; notesInp.className = 'ef-input';
    notesInp.placeholder = 'notes (optional)';
    card.appendChild(notesInp);

    // Stash references for collectSegments()
    card._hInp   = hInp;
    card._mInp   = mInp;
    card._sInp   = sInp;
    card._staged = segStaged;
    card._tala   = talaInp;
    card._kind   = kindSel;
    card._notes  = notesInp;

    segRows.appendChild(card);
    hInp.focus();
  });

  // ── Secondary fields ──────────────────────────────────────────────────────
  const secondarySep = document.createElement('hr');
  secondarySep.className = 'ef-group-sep';
  body.appendChild(secondarySep);

  const yearInp = efInput(null, 'number', 'e.g. 1965', null);
  yearInp.min = 1900; yearInp.max = 2030;
  body.appendChild(efRow('Year', false, null, yearInp));

  const lblInp = efInput(null, 'text', 'auto-generated from raga subjects if empty', null);
  body.appendChild(efRow('Label', false, 'optional', lblInp));

  // ── Accompanists ──────────────────────────────────────────────────────────
  const perfContainer = document.createElement('div');
  perfContainer.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px dashed var(--border-soft);';
  const perfHeading = document.createElement('div');
  perfHeading.style.cssText = 'font-size:0.7rem;font-weight:600;color:var(--fg-muted);margin-bottom:4px;';
  perfHeading.textContent = 'Accompanists';
  perfContainer.appendChild(perfHeading);
  const perfRows = document.createElement('div');
  perfRows.className = 'ef-performers-rows';
  perfContainer.appendChild(perfRows);
  const addPerfBtn = efAddBtn('+ Add Accompanist');
  perfContainer.appendChild(addPerfBtn);
  addPerfBtn.addEventListener('click', () => addYoutubePerformerBlock(perfRows, win));
  body.appendChild(perfContainer);

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = win.querySelector('.ew-footer');

  const previewBtn = document.createElement('button');
  previewBtn.className = 'ef-preview-btn';
  previewBtn.textContent = 'Preview JSON';

  const dlBtn = document.createElement('button');
  dlBtn.className = 'ef-preview-btn';
  dlBtn.textContent = '⬇ Standalone JSON';

  const bundleBtn = document.createElement('button');
  bundleBtn.className = 'ef-download-btn';
  bundleBtn.textContent = '+ Add to Bundle';

  footer.appendChild(previewBtn);
  footer.appendChild(dlBtn);
  footer.appendChild(bundleBtn);

  const previewPre = document.createElement('pre');
  previewPre.className = 'ef-preview-pre';
  body.appendChild(previewPre);

  // ── Data collection ───────────────────────────────────────────────────────
  function collectSegments() {
    const segs = [];
    segRows.querySelectorAll('.ef-seg-card').forEach(card => {
      const h = parseInt(card._hInp.value, 10) || 0;
      const m = parseInt(card._mInp.value, 10) || 0;
      const s = parseInt(card._sInp.value, 10) || 0;
      if (card._hInp.value === '' && card._mInp.value === '' && card._sInp.value === '') return;
      const offset = h * 3600 + m * 60 + s;
      const seg = { offset_seconds: offset };
      card._staged.forEach(({ axis, id }) => {
        if (axis === 'raga_ids')             seg.raga_id = id;
        else if (axis === 'composition_ids') seg.composition_id = id;
        else if (axis === 'musician_ids')    seg.musician_id = id;
      });
      const tala = card._tala.value.trim();
      if (tala) seg.tala = tala;
      const kind = card._kind.value;
      if (kind) seg.kind = kind;
      const notes = card._notes.value.trim();
      if (notes) seg.notes = notes;
      segs.push(seg);
    });
    return segs;
  }

  function collectLecdem() {
    const url = urlInp.value.trim();
    const year = yearInp.value;
    let lbl = lblInp.value.trim();
    if (!lbl) {
      const ragaLabels = [];
      staged.forEach(({ axis, label }) => { if (axis === 'raga_ids') ragaLabels.push(label); });
      lbl = ragaLabels.join(' · ');
    }
    const subjects = { raga_ids: [], composition_ids: [], musician_ids: [] };
    staged.forEach(({ axis, id }) => { subjects[axis].push(id); });
    const hostNode_ = (graphData.nodes || []).find(n => n.id === musicianId);
    const hostInstrument = hostNode_ ? hostNode_.instrument : 'vocal';
    const performers = (typeof collectYoutubePerformers === 'function')
      ? collectYoutubePerformers({ querySelector: s => perfRows.querySelector(s), querySelectorAll: s => perfRows.querySelectorAll(s) }, musicianId, hostInstrument)
      : null;
    const entry = { url, label: lbl, kind: 'lecdem', subjects };
    if (year) entry.year = parseInt(year, 10);
    const segs = collectSegments();
    if (segs.length) entry.segments = segs;
    if (performers) entry.performers = performers;
    return entry;
  }

  function buildItem() {
    return { type: 'lecdem_append', musician_id: musicianId, lecdem: collectLecdem() };
  }

  previewBtn.addEventListener('click', () => {
    previewPre.style.display = '';
    previewPre.textContent = JSON.stringify(buildItem(), null, 2);
  });

  dlBtn.addEventListener('click', () => {
    const data = buildItem();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lecdem_${musicianId}_${Date.now()}.json`;
    a.click();
  });

  bundleBtn.addEventListener('click', () => {
    const data = buildItem();
    if (!data.lecdem.url) { alert('YouTube URL is required.'); return; }
    if (typeof addToBundle === 'function') {
      addToBundle(data);
    } else {
      window._pendingBundle = window._pendingBundle || [];
      window._pendingBundle.push(data);
    }
    alert('Added to bundle.');
  });
}


// Called from the + chip on the "Lecdems" section header in the musician panel.
function openAddLecdemToMusicianForm(musicianId) {
  buildFocusedLecdemForm(musicianId);
}

// Called from the ✎ chip beside the selected musician's name.
// Pre-fills the Add Musician form with current node data and switches to patch mode.
function openEditMusicianForm(nodeId) {
  const node = (graphData.nodes || []).find(n => n.id === nodeId);
  if (!node) {
    // Fallback: open empty add form if node not found
    buildAddMusicianForm();
    return;
  }
  buildAddMusicianForm({ prefill: node });
}

// ── Add YouTube Recording for a specific Composition ─────────────────────────
// Called from the + button next to the composition chip at the top of Bani Flow.
// Composition and raga are pre-filled and locked. User enters musician + URL(s).

function openAddYouTubeFormForComposition({ compositionId, ragaId, compositionTitle, ragaLabel } = {}) {
  const win  = createEntryWindow('Add Recording — ' + (compositionTitle || compositionId || ''));
  const body = win.querySelector('.ew-body');

  // ── Locked identity: composition + raga ───────────────────────────────────
  const idRow = document.createElement('div');
  idRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);';
  if (compositionTitle) {
    const compChip = document.createElement('span');
    compChip.className = 'comp-chip';
    compChip.style.cursor = 'default';
    compChip.textContent = compositionTitle;
    idRow.appendChild(compChip);
  }
  if (ragaLabel) {
    const ragaChip = document.createElement('span');
    ragaChip.className = 'raga-chip';
    ragaChip.style.cursor = 'default';
    ragaChip.textContent = ragaLabel;
    idRow.appendChild(ragaChip);
  }
  body.appendChild(idRow);

  // ── YouTube entries (each block has its own musician field) ──────────────
  body.appendChild(efSection('YouTube Entries'));
  const ytContainer = document.createElement('div');
  ytContainer.id = 'efy_youtube';
  body.appendChild(ytContainer);

  function addBlockAndLock() {
    addYoutubeBlock(ytContainer, win);
    const block = ytContainer.lastElementChild;
    // Prepend per-block musician field (after the × remove button)
    const musOpts = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
    const leadMusSel = efCombobox(null, musOpts, null, win);
    const musRow = efRow('Musician', true, 'the lead performer', leadMusSel);
    block.insertBefore(musRow, block.firstElementChild.nextElementSibling);
    block._leadMusicianSel = leadMusSel;
    // Set composition first — wireCompRagaAutofill will auto-fill the raga
    if (compositionId && block._compSel) {
      block._compSel.setValue(compositionId, compositionTitle || compositionId);
    }
    // Set raga only if not already filled by autofill
    if (ragaId && block._ragaSel && !block._ragaSel.getValue()) {
      block._ragaSel.setValue(ragaId, ragaLabel || ragaId);
    }
  }
  addBlockAndLock();

  const addAnotherBtn = efAddBtn('+ Add another video');
  addAnotherBtn.addEventListener('click', addBlockAndLock);
  body.appendChild(addAnotherBtn);

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

  // ── JSON builder — groups entries by musician ─────────────────────────────
  function collectYoutube() {
    const byMusician = new Map(); // musicianId → entries[]
    win.querySelectorAll('#efy_youtube .ef-youtube-block').forEach(block => {
      const musicianId = block._leadMusicianSel ? block._leadMusicianSel.getValue() : '';
      const hostNode_ = (graphData.nodes || []).find(n => n.id === musicianId);
      const hostInstrument = hostNode_ ? hostNode_.instrument : 'vocal';
      const inputs   = block.querySelectorAll(':scope > .ef-row input:not([data-combobox-filter])');
      const url      = inputs[0] ? inputs[0].value.trim() : '';
      const year     = inputs[1] ? inputs[1].value        : '';
      const version  = inputs[2] ? inputs[2].value.trim() : '';
      let   lbl      = inputs[3] ? inputs[3].value.trim() : '';
      const cId      = block._compSel ? block._compSel.getValue() : (compositionId || '');
      const rId      = block._ragaSel ? block._ragaSel.getValue() : (ragaId || '');
      const tala     = block._talaSel ? block._talaSel.getValue() : '';
      if (!url) return;
      if (!lbl) {
        const parts = [
          block._compSel ? block._compSel.getLabel() : (compositionTitle || ''),
          block._ragaSel ? block._ragaSel.getLabel() : (ragaLabel || ''),
          tala,
        ].filter(Boolean);
        lbl = parts.join(' · ');
      }
      const entry = { url, label: lbl };
      if (cId)     entry.composition_id = cId;
      if (rId)     entry.raga_id        = rId;
      if (year)    entry.year           = parseInt(year, 10);
      if (version) entry.version        = version;
      if (tala)    entry.tala           = tala;
      if (block._herMode && block._herKindSel) entry.kind = block._herKindSel.value || 'raga_alap';
      const performers = (typeof collectYoutubePerformers === 'function')
        ? collectYoutubePerformers(block, musicianId, hostInstrument)
        : null;
      if (performers) entry.performers = performers;
      if (!byMusician.has(musicianId)) byMusician.set(musicianId, []);
      byMusician.get(musicianId).push(entry);
    });
    return byMusician;
  }

  function bundleItems() {
    const items = [];
    collectYoutube().forEach((entries, musicianId) => {
      if (musicianId && entries.length) items.push({ type: 'youtube_append', musician_id: musicianId, youtube: entries });
    });
    return items;
  }

  function updateButtons() {
    const hasReady = Array.from(win.querySelectorAll('#efy_youtube .ef-youtube-block')).some(b => {
      const musId = b._leadMusicianSel ? b._leadMusicianSel.getValue() : '';
      const urlInps = b.querySelectorAll(':scope > .ef-row input:not([data-combobox-filter])');
      return musId && urlInps[0] && urlInps[0].value.trim();
    });
    bundleBtn.disabled = !hasReady;
    dlBtn.disabled     = !hasReady;
  }
  win.addEventListener('input', updateButtons);
  win.addEventListener('change', updateButtons);

  previewBtn.addEventListener('click', () => {
    const items = bundleItems();
    previewPre.textContent = JSON.stringify(items.length === 1 ? items[0] : items, null, 2);
  });

  dlBtn.addEventListener('click', () => {
    const items = bundleItems();
    if (!items.length) return;
    const data = items.length === 1 ? items[0] : items;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'youtube_' + (compositionId || 'recording') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  bundleBtn.addEventListener('click', () => {
    const items = bundleItems();
    if (!items.length) return;
    if (typeof addToBundle === 'function') {
      items.forEach(item => addToBundle('musicians', { op: 'append', id: item.musician_id, array: 'youtube', value: item.youtube }));
      bundleBtn.textContent = '✓ Added';
      bundleBtn.disabled = true;
      setTimeout(() => { bundleBtn.disabled = false; bundleBtn.textContent = '+ Add to Bundle'; }, 2000);
    }
  });

  return win;
}

// ── Add YouTube Recording for a specific Raga ─────────────────────────────────
// Called from the + button next to the raga chip at the top of Bani Flow.
// Raga is pre-filled and locked. User enters musician, URL(s), and optionally composition.

function openAddYouTubeFormForRaga({ ragaId, ragaLabel } = {}) {
  const win  = createEntryWindow('Add Recording — ' + (ragaLabel || ragaId || ''));
  const body = win.querySelector('.ew-body');

  // ── Locked identity: raga ─────────────────────────────────────────────────
  const idRow = document.createElement('div');
  idRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);';
  if (ragaLabel || ragaId) {
    const ragaChip = document.createElement('span');
    ragaChip.className = 'raga-chip';
    ragaChip.style.cursor = 'default';
    ragaChip.textContent = ragaLabel || ragaId;
    idRow.appendChild(ragaChip);
  }
  body.appendChild(idRow);

  // ── YouTube entries (each block has its own musician field) ──────────────
  body.appendChild(efSection('YouTube Entries'));
  const ytContainer = document.createElement('div');
  ytContainer.id = 'efy_youtube';
  body.appendChild(ytContainer);

  function addBlockAndLock() {
    addYoutubeBlock(ytContainer, win);
    const block = ytContainer.lastElementChild;
    // Prepend per-block musician field (after the × remove button)
    const musOpts = (graphData.nodes || []).map(n => ({ value: n.id, label: n.label }));
    const leadMusSel = efCombobox(null, musOpts, null, win);
    const musRow = efRow('Musician', true, 'the lead performer', leadMusSel);
    block.insertBefore(musRow, block.firstElementChild.nextElementSibling);
    block._leadMusicianSel = leadMusSel;
    if (ragaId && block._ragaSel) {
      block._ragaSel.setValue(ragaId, ragaLabel || ragaId);
    }
  }
  addBlockAndLock();

  const addAnotherBtn = efAddBtn('+ Add another video');
  addAnotherBtn.addEventListener('click', addBlockAndLock);
  body.appendChild(addAnotherBtn);

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

  // ── JSON builder — groups entries by musician ─────────────────────────────
  function collectYoutube() {
    const byMusician = new Map(); // musicianId → entries[]
    win.querySelectorAll('#efy_youtube .ef-youtube-block').forEach(block => {
      const musicianId = block._leadMusicianSel ? block._leadMusicianSel.getValue() : '';
      const hostNode_ = (graphData.nodes || []).find(n => n.id === musicianId);
      const hostInstrument = hostNode_ ? hostNode_.instrument : 'vocal';
      const inputs   = block.querySelectorAll(':scope > .ef-row input:not([data-combobox-filter])');
      const url      = inputs[0] ? inputs[0].value.trim() : '';
      const year     = inputs[1] ? inputs[1].value        : '';
      const version  = inputs[2] ? inputs[2].value.trim() : '';
      let   lbl      = inputs[3] ? inputs[3].value.trim() : '';
      const cId      = block._compSel ? block._compSel.getValue() : '';
      const rId      = block._ragaSel ? block._ragaSel.getValue() : (ragaId || '');
      const tala     = block._talaSel ? block._talaSel.getValue() : '';
      if (!url) return;
      if (!lbl) {
        const parts = [
          block._compSel ? block._compSel.getLabel() : '',
          block._ragaSel ? block._ragaSel.getLabel() : (ragaLabel || ''),
          tala,
        ].filter(Boolean);
        lbl = parts.join(' · ');
      }
      const entry = { url, label: lbl };
      if (cId)     entry.composition_id = cId;
      if (rId)     entry.raga_id        = rId;
      if (year)    entry.year           = parseInt(year, 10);
      if (version) entry.version        = version;
      if (tala)    entry.tala           = tala;
      if (block._herMode && block._herKindSel) entry.kind = block._herKindSel.value || 'raga_alap';
      const performers = (typeof collectYoutubePerformers === 'function')
        ? collectYoutubePerformers(block, musicianId, hostInstrument)
        : null;
      if (performers) entry.performers = performers;
      if (!byMusician.has(musicianId)) byMusician.set(musicianId, []);
      byMusician.get(musicianId).push(entry);
    });
    return byMusician;
  }

  function bundleItems() {
    const items = [];
    collectYoutube().forEach((entries, musicianId) => {
      if (musicianId && entries.length) items.push({ type: 'youtube_append', musician_id: musicianId, youtube: entries });
    });
    return items;
  }

  function updateButtons() {
    const hasReady = Array.from(win.querySelectorAll('#efy_youtube .ef-youtube-block')).some(b => {
      const musId = b._leadMusicianSel ? b._leadMusicianSel.getValue() : '';
      const urlInps = b.querySelectorAll(':scope > .ef-row input:not([data-combobox-filter])');
      return musId && urlInps[0] && urlInps[0].value.trim();
    });
    bundleBtn.disabled = !hasReady;
    dlBtn.disabled     = !hasReady;
  }
  win.addEventListener('input', updateButtons);
  win.addEventListener('change', updateButtons);

  previewBtn.addEventListener('click', () => {
    const items = bundleItems();
    previewPre.textContent = JSON.stringify(items.length === 1 ? items[0] : items, null, 2);
  });

  dlBtn.addEventListener('click', () => {
    const items = bundleItems();
    if (!items.length) return;
    const data = items.length === 1 ? items[0] : items;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'youtube_' + (ragaId || 'recording') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  bundleBtn.addEventListener('click', () => {
    const items = bundleItems();
    if (!items.length) return;
    if (typeof addToBundle === 'function') {
      items.forEach(item => addToBundle('musicians', { op: 'append', id: item.musician_id, array: 'youtube', value: item.youtube }));
      bundleBtn.textContent = '✓ Added';
      bundleBtn.disabled = true;
      setTimeout(() => { bundleBtn.disabled = false; bundleBtn.textContent = '+ Add to Bundle'; }, 2000);
    }
  });

  return win;
}
