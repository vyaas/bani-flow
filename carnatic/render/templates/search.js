// ── shared dropdown helper ────────────────────────────────────────────────────
function makeDropdown(inputEl, dropdownEl, getItems, onSelect) {
  let activeIdx = -1;

  function renderItems(items) {
    dropdownEl.innerHTML = '';
    activeIdx = -1;
    if (items.length === 0) {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.style.color = 'var(--gray)';
      div.textContent = 'no match';
      dropdownEl.appendChild(div);
      dropdownEl.style.display = 'block';
      return;
    }
    items.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      // primary line
      const primary = document.createElement('div');
      primary.textContent = item.primary;
      if (item.primaryColor) primary.style.color = item.primaryColor;
      div.appendChild(primary);
      // secondary line
      if (item.secondary) {
        const sec = document.createElement('div');
        sec.className = 'search-result-secondary';
        sec.textContent = item.secondary;
        div.appendChild(sec);
      }
      div.addEventListener('mousedown', e => {
        e.preventDefault(); // prevent blur before click
        onSelect(item);
        inputEl.value = '';
        dropdownEl.style.display = 'none';
      });
      div.addEventListener('mouseover', () => setActive(i));
      dropdownEl.appendChild(div);
    });
    dropdownEl.style.display = 'block';
  }

  function setActive(idx) {
    const items = dropdownEl.querySelectorAll('.search-result-item');
    items.forEach((el, i) => el.classList.toggle('active', i === idx));
    activeIdx = idx;
  }

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim();
    if (!q) { dropdownEl.style.display = 'none'; return; }
    renderItems(getItems(q));
  });

  inputEl.addEventListener('keydown', e => {
    const items = dropdownEl.querySelectorAll('.search-result-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIdx + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && activeIdx < items.length) {
        items[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
      }
    } else if (e.key === 'Escape') {
      inputEl.value = '';
      dropdownEl.style.display = 'none';
    }
  });

  inputEl.addEventListener('blur', () => {
    setTimeout(() => { dropdownEl.style.display = 'none'; }, 150);
  });
}

// ── musician search ───────────────────────────────────────────────────────────
(function() {
  const input    = document.getElementById('musician-search-input');
  const dropdown = document.getElementById('musician-search-dropdown');

  function getItems(q) {
    const ql = q.toLowerCase();
    const results = [];
    cy.nodes().forEach(n => {
      const d = n.data();
      if (d.label.toLowerCase().includes(ql)) {
        results.push({
          id:           d.id,
          primary:      d.label,
          primaryColor: d.color,
          secondary:    [d.lifespan, d.era_label, d.instrument, d.bani]
                          .filter(Boolean).join(' \u00b7 '),
        });
      }
    });
    results.sort((a, b) => a.primary.localeCompare(b.primary));
    return results.slice(0, 8);
  }

  makeDropdown(input, dropdown, getItems, item => {
    const node = cy.getElementById(item.id);
    if (!node || !node.length) return;
    selectNode(node);
  });
})();

// ── bani flow search ──────────────────────────────────────────────────────────
(function() {
  const input    = document.getElementById('bani-search-input');
  const dropdown = document.getElementById('bani-search-dropdown');

  function getItems(q) {
    const ql = q.toLowerCase();
    const results = [];

    // Compositions first
    compositions.forEach(c => {
      const hasNode = compositionToNodes[c.id] && compositionToNodes[c.id].length > 0;
      const hasPerf = compositionToPerf[c.id]  && compositionToPerf[c.id].length  > 0;
      if ((hasNode || hasPerf) && c.title.toLowerCase().includes(ql)) {
        results.push({ type: 'comp', id: c.id, primary: '\u266a ' + c.title, secondary: null });
      }
    });

    // Ragas second
    ragas.forEach(r => {
      const hasNode = ragaToNodes[r.id] && ragaToNodes[r.id].length > 0;
      const hasPerf = ragaToPerf[r.id]  && ragaToPerf[r.id].length  > 0;
      if ((hasNode || hasPerf) && r.name.toLowerCase().includes(ql)) {
        results.push({ type: 'raga', id: r.id, primary: '\u25c8 ' + r.name, secondary: null });
      }
    });

    results.sort((a, b) => a.primary.localeCompare(b.primary));
    return results.slice(0, 10);
  }

  makeDropdown(input, dropdown, getItems, item => {
    triggerBaniSearch(item.type, item.id);
  });
})();
