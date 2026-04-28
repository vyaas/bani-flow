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
        setTimeout(() => inputEl.blur(), 0);  // deferred blur — escapes preventDefault scope so mobile keyboard actually dismisses
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
// ADR-081 §6a: lecdems are not searchable by label — they are never autonomous
// search targets. However, ragas and compositions tagged as subjects (or via
// segment-level raga_id) in a lecdem DO appear in the filter because they are
// the entry points through which the user discovers lecdems. A raga with only
// lecdem coverage (no direct recordings) still surfaces here and opens the
// bani-flow lecdem strip when selected.
//
// ADR-113: HER ragas (tradition:hindustani) are included in the search index
// alongside Carnatic ragas, interleaved by tier (no tradition segregation).
// Tiers: 0=exact name, 1=alias exact, 2=substring. Within a tier, sorted by name.
(function() {
  const input    = document.getElementById('bani-search-input');
  const dropdown = document.getElementById('bani-search-dropdown');

  // Tier constants
  const TIER_EXACT = 0, TIER_ALIAS = 1, TIER_SUBSTR = 2;

  function getItems(q) {
    const ql = q.toLowerCase();
    const results = [];

    // Compositions — no tier ranking, appear before ragas at top
    compositions.forEach(c => {
      const hasNode   = compositionToNodes[c.id]        && compositionToNodes[c.id].length > 0;
      const hasPerf   = compositionToPerf[c.id]         && compositionToPerf[c.id].length  > 0;
      const hasLecdem = lecdemsAboutComposition[c.id]   && lecdemsAboutComposition[c.id].length > 0;
      if ((hasNode || hasPerf || hasLecdem) && c.title.toLowerCase().includes(ql)) {
        results.push({ type: 'comp', id: c.id, tier: TIER_SUBSTR,
          primary: '\u266a ' + c.title, secondary: null });
      }
    });

    // Ragas (Carnatic + HER) — tiered ranking, interleaved by score
    ragas.forEach(r => {
      const hasNode      = ragaToNodes[r.id]      && ragaToNodes[r.id].length > 0;
      const hasPerf      = ragaToPerf[r.id]       && ragaToPerf[r.id].length  > 0;
      const hasLecdem    = lecdemsAboutRaga[r.id] && lecdemsAboutRaga[r.id].length > 0;
      const isMelakarta  = r.is_melakarta === true;
      const isHindustani = r.tradition === 'hindustani';
      const hasCoverage  = hasNode || hasPerf || hasLecdem;

      // HER ragas: always include if they match (they have no melakarta)
      // Carnatic ragas: melakartas always appear; janyas only when covered
      const eligible = isHindustani ? true : (isMelakarta || hasCoverage);
      if (!eligible) return;

      const nameLower = (r.name || '').toLowerCase();
      const aliases   = r.aliases || [];
      let tier = null;

      if (nameLower === ql) {
        tier = TIER_EXACT;
      } else if (aliases.some(a => a.toLowerCase() === ql)) {
        tier = TIER_ALIAS;
      } else if (nameLower.includes(ql) || aliases.some(a => a.toLowerCase().includes(ql))) {
        tier = TIER_SUBSTR;
      }

      if (tier === null) return;

      if (isHindustani) {
        // ADR-113: HER result — cool-chip styling + Carnatic twin in secondary
        const carnaticTwins = ragas
          .filter(cr => cr.hindustani_equivalents && cr.hindustani_equivalents.includes(r.id))
          .map(cr => cr.name || cr.id);
        results.push({
          type: 'raga', id: r.id, tier,
          primary: '\u2194 ' + r.name,
          primaryColor: 'var(--her-chip-accent, #8fb4d8)',
          secondary: carnaticTwins.length > 0 ? '\u2194 Carnatic: ' + carnaticTwins.join(', ') : 'Hindustani raga',
        });
      } else {
        const noCoverage = isMelakarta && !hasCoverage;
        results.push({
          type: 'raga', id: r.id, tier,
          primary: '\u25c8 ' + r.name,
          secondary: noCoverage ? 'Mela\u00a0' + r.melakarta + '\u00a0\u00b7 no recordings yet\u00a0\u2014 open to add a janya' : null,
        });
      }
    });

    // Sort: compositions first, then by tier ascending, then alphabetically within tier
    results.sort((a, b) => {
      if (a.type === 'comp' && b.type !== 'comp') return -1;
      if (a.type !== 'comp' && b.type === 'comp') return 1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.primary.localeCompare(b.primary);
    });
    return results.slice(0, 10);
  }

  makeDropdown(input, dropdown, getItems, item => {
    triggerBaniSearch(item.type, item.id);
  });
})();
