// panel_components.js — ADR-128: Symmetric Panel Base
// Pure DOM constructors for panel headers, sections, and subject groups.
// No panel-specific knowledge — callers supply chips, callbacks, and counts.
// Loaded before media_player.js and bani_flow.js (html_generator.py order).

// ── buildPanelHeader ──────────────────────────────────────────────────────────
// Builds a 2-row header:
//   row 1 (.panel-header-row1): titleNode  (the chip supplied by caller)
//   row 2 (.panel-header-affordances): [subtitleContent] [↗ ext-link] [✎ edit]
//
//   titleNode        DOM element — the vocabulary chip (musician/raga/comp)
//   subtitleContent  string or DOM node (optional) — lifespan / parent-mela line
//   externalUrl      string (optional) — if present, renders encircled ↗ link
//   externalLabel    string (optional) — tooltip for ext link
//   onEdit           function (optional) — if present, renders encircled ✎ button
function buildPanelHeader({ titleNode, subtitleContent, externalUrl, externalLabel, onEdit } = {}) {
  const root = document.createElement('div');
  root.className = 'panel-header-root';

  // Row 1: title chip
  const row1 = document.createElement('div');
  row1.className = 'panel-header-row1';
  if (titleNode) row1.appendChild(titleNode);
  root.appendChild(row1);

  // Row 2: affordances (only rendered when at least one affordance is present)
  const row2 = document.createElement('div');
  row2.className = 'panel-header-affordances';

  if (subtitleContent) {
    const sub = document.createElement('span');
    sub.className = 'panel-header-subtitle';
    if (typeof subtitleContent === 'string') {
      sub.textContent = subtitleContent;
    } else {
      sub.appendChild(subtitleContent);
    }
    row2.appendChild(sub);
  }

  if (externalUrl) {
    const link = document.createElement('a');
    link.className = 'yt-ext-link panel-hdr-ext-link';
    link.href = externalUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = externalLabel || 'Open in new tab';
    // ADR-128 D13: SVG glyph for reliable centering.
    link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M14 3v2h3.59l-9.3 9.29 1.42 1.42L19 6.41V10h2V3z"/><path d="M19 19H5V5h7V3H3v18h18v-9h-2z"/></svg>';
    row2.appendChild(link);
  }

  if (typeof onEdit === 'function') {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'co-edit-chip panel-hdr-edit-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '\u270e'; // ✎
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      onEdit(e);
    });
    row2.appendChild(editBtn);
  }

  if (row2.children.length > 0) root.appendChild(row2);
  return root;
}

// ── buildSection ─────────────────────────────────────────────────────────────
// Builds a collapsible section with a standardised flex header row:
//   [▼ chevron]  [headerChip]  [headerSuffixText]  [(count)]  [+ add]
//
// Returns { sectionEl, bodyEl, headerEl }.
//
//   headerChip       DOM element (optional) — vocabulary chip at section-header scale
//   headerSuffixText string appended after the chip (optional)
//   count            integer (optional) — shown as "(N)" even when 0
//   onAdd            function (optional) — if provided, renders a + button
//   addTitle         string (optional) — tooltip for + button
//   defaultCollapsed boolean (default false)
function buildSection({ headerChip, headerSuffixText, count, onAdd, addTitle, defaultCollapsed = false } = {}) {
  const sectionEl = document.createElement('section');

  const headerEl = document.createElement('div');
  headerEl.className = 'rec-section-header-row';

  // Collapse chevron
  const chevron = document.createElement('button');
  chevron.type = 'button';
  chevron.className = 'section-collapse-btn';
  chevron.textContent = defaultCollapsed ? '\u25b6' : '\u25bc'; // ▶ or ▼
  chevron.title = 'Collapse / expand';
  headerEl.appendChild(chevron);

  // Label wrapper: chip + suffix text + (count)
  const labelWrap = document.createElement('span');
  labelWrap.className = 'rec-section-hdr-label-wrap';
  if (headerChip) labelWrap.appendChild(headerChip);
  if (headerSuffixText) labelWrap.appendChild(document.createTextNode(headerSuffixText));
  if (count != null) labelWrap.appendChild(document.createTextNode(' (' + count + ')'));
  headerEl.appendChild(labelWrap);

  // + add button (optional)
  if (typeof onAdd === 'function') {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'co-add-chip';
    addBtn.textContent = '+';
    addBtn.title = addTitle || 'Add';
    addBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      onAdd(e);
    });
    headerEl.appendChild(addBtn);
  }

  sectionEl.appendChild(headerEl);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'section-body';
  bodyEl.hidden = defaultCollapsed;

  chevron.addEventListener('click', function (e) {
    e.stopPropagation();
    bodyEl.hidden = !bodyEl.hidden;
    chevron.textContent = bodyEl.hidden ? '\u25b6' : '\u25bc';
  });

  // ADR-128 D9: entire header row toggles collapse — chevron is just an indicator.
  // Clicks originating from interactive children (chips, the + button, links) are ignored.
  headerEl.addEventListener('click', function (e) {
    if (e.target.closest('a, button, .raga-chip, .comp-chip, .musician-chip, .lecdem-chip, .neutral-chip')) return;
    bodyEl.hidden = !bodyEl.hidden;
    chevron.textContent = bodyEl.hidden ? '\u25b6' : '\u25bc';
  });

  sectionEl.appendChild(bodyEl);
  return { sectionEl, bodyEl, headerEl };
}

// ── buildSubjectGroup ─────────────────────────────────────────────────────────
// Builds a collapsible group of subject chips. Collapsed by default.
//   [▶/▼] [summaryText]   — always-visible summary button
//   [chip chip chip...]   — body, collapsed by default
//
// Returns the group container element (a <span.subject-group>).
//
//   chips           array of DOM elements
//   defaultCollapsed boolean (default true)
//   summaryText     string  (e.g. "5 subjects")
function buildSubjectGroup({ chips = [], defaultCollapsed = true, summaryText = '' } = {}) {
  const groupEl = document.createElement('span');
  groupEl.className = 'subject-group';

  const summaryBtn = document.createElement('button');
  summaryBtn.type = 'button';
  summaryBtn.className = 'subject-group-summary';
  summaryBtn.textContent = (defaultCollapsed ? '\u25b6 ' : '\u25bc ') + summaryText;
  groupEl.appendChild(summaryBtn);

  const bodyEl = document.createElement('span');
  bodyEl.className = 'subject-group-body';
  bodyEl.hidden = defaultCollapsed;
  chips.forEach(function (c) { if (c) bodyEl.appendChild(c); });
  groupEl.appendChild(bodyEl);

  summaryBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    bodyEl.hidden = !bodyEl.hidden;
    summaryBtn.textContent = (bodyEl.hidden ? '\u25b6 ' : '\u25bc ') + summaryText;
  });

  return groupEl;
}

// ── buildLecdemSubjectChips ───────────────────────────────────────────────────
// Converges _buildLecdemSubjectChips (media_player.js, ADR-080) and
// _buildBaniFlowLecdemSubjectChips (bani_flow.js) into one function.
// Returns an array of chip DOM elements for all subjects, excluding specified IDs.
//
//   subjects         { raga_ids: [], composition_ids: [], musician_ids: [] }
//   excludeMusicianId string (optional)
//   excludeRagaId     string (optional)
//   excludeCompId     string (optional)
function buildLecdemSubjectChips(subjects, { excludeMusicianId, excludeRagaId, excludeCompId } = {}) {
  if (!subjects) return [];
  const chips = [];
  const ragaList = typeof ragas !== 'undefined' ? ragas : [];
  const compList = typeof compositions !== 'undefined' ? compositions : [];

  const ragaIds     = Array.isArray(subjects.raga_ids)        ? subjects.raga_ids        : [];
  const compIds     = Array.isArray(subjects.composition_ids) ? subjects.composition_ids : [];
  const musicianIds = Array.isArray(subjects.musician_ids)    ? subjects.musician_ids    : [];

  ragaIds.forEach(function (ragaId) {
    if (ragaId === excludeRagaId) return;
    const ragaObj  = ragaList.find(function (r) { return r.id === ragaId; });
    const ragaName = ragaObj ? ragaObj.name : ragaId;
    const c = document.createElement('span');
    c.className = 'raga-chip';
    c.textContent = ragaName;
    c.title = 'Explore ' + ragaName + ' in Bani Flow';
    c.addEventListener('click', function (e) {
      e.stopPropagation();
      c.classList.add('chip-tapped');
      setTimeout(function () { c.classList.remove('chip-tapped'); }, 200);
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('raga', ragaId);
    });
    chips.push(c);
  });

  compIds.forEach(function (compId) {
    if (compId === excludeCompId) return;
    const compObj  = compList.find(function (x) { return x.id === compId; });
    const compName = compObj ? compObj.title : compId;
    const c = document.createElement('span');
    c.className = 'comp-chip';
    c.textContent = compName;
    c.title = 'Explore ' + compName + ' in Bani Flow';
    c.addEventListener('click', function (e) {
      e.stopPropagation();
      c.classList.add('chip-tapped');
      setTimeout(function () { c.classList.remove('chip-tapped'); }, 200);
      if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', compId);
    });
    chips.push(c);
  });

  musicianIds.forEach(function (mid) {
    if (mid === excludeMusicianId) return;
    const mNode  = (typeof cy !== 'undefined') ? cy.getElementById(mid) : null;
    const mLabel = (mNode && mNode.length) ? (mNode.data('label') || mid) : mid;
    const c = document.createElement('span');
    c.className = 'musician-chip';
    c.textContent = mLabel;
    c.title = 'Open ' + mLabel + '\u2019s panel';

    // Era-tint — same pattern as all other musician chips
    if (mNode && mNode.length && typeof THEME !== 'undefined' && THEME.eraTintCss) {
      const tint = THEME.eraTintCss(mNode.data('era') || null);
      c.style.setProperty('--chip-era-bg',     tint.bg);
      c.style.setProperty('--chip-era-border', tint.border);
    }

    c.addEventListener('click', function (e) {
      e.stopPropagation();
      c.classList.add('chip-tapped');
      setTimeout(function () { c.classList.remove('chip-tapped'); }, 200);
      if (typeof orientToNode === 'function' && typeof currentView !== 'undefined' && currentView === 'graph') {
        orientToNode(mid);
      }
      if (mNode && mNode.length && typeof selectNode === 'function') {
        selectNode(mNode);
        if (typeof window.setPanelState === 'function') {
          setTimeout(function () { window.setPanelState('MUSICIAN'); }, 50);
        }
      } else if (typeof showGraphAbsentToast === 'function') {
        showGraphAbsentToast(mLabel);
      }
    });
    chips.push(c);
  });

  return chips;
}
