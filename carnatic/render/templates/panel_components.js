// panel_components.js — ADR-128: Symmetric Panel Base
// Pure DOM constructors for panel headers, sections, and subject groups.
// No panel-specific knowledge — callers supply chips, callbacks, and counts.
// Loaded before media_player.js and bani_flow.js (html_generator.py order).

// ── buildPanelHeader ──────────────────────────────────────────────────────────
// Builds a 2-row header:
//   row 1 (.panel-header-row1): titleNode  (the chip supplied by caller)
//   row 2 (.panel-header-affordances): [subtitleContent] [↗ ext-link]
//
//   titleNode        DOM element — the vocabulary chip (musician/raga/comp)
//   subtitleContent  string or DOM node (optional) — lifespan / parent-mela line
//   externalUrl      string (optional) — if present, renders encircled ↗ link
//   externalLabel    string (optional) — tooltip for ext link
//
// Edit affordance: the titleNode chip itself carries data-chip-role="panel-title"
// and gains the ✎ pencil via CSS + chip_dblclick.js (ADR-153). No separate
// onEdit button is needed or rendered here.
function buildPanelHeader({ titleNode, subtitleContent, externalUrl, externalLabel } = {}) {
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
function buildSection({ headerChip, headerSuffixText, count, addTitle, defaultCollapsed = false } = {}) {
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
    if (e.target.closest('a, button, .raga-chip, .comp-chip, .musician-chip, .lecdem-chip, .neutral-chip, .lineage-chip')) return;
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

// ── buildRowAccordion ─────────────────────────────────────────────────────────
// Wraps a main-content row and a collapsible body using the "winning design":
//   [▶/▼ chevron] [headerEl — flex: 1]   ← entire row is the click affordance
//   [bodyEls...]                          ← hidden by default, wrapping flex below
//
// Returns the wrapper container element (a <div.row-accordion>).
//
//   headerEl         DOM element — the always-visible primary row content
//   bodyEls          array of DOM elements to show/hide
//   defaultCollapsed boolean (default true)
function buildRowAccordion({ headerEl, bodyEls = [], defaultCollapsed = true, chevronPosition = 'left', trailingEl = null } = {}) {
  const wrapEl = document.createElement('div');
  wrapEl.className = 'row-accordion';

  const headerRow = document.createElement('div');
  headerRow.className = 'row-accordion-header';

  const chevron = document.createElement('button');
  chevron.type = 'button';
  chevron.className = 'row-accordion-chevron';
  chevron.textContent = '\u25b6';
  // Left chevron: prepend before headerEl (aligns all rows with left-padding).
  // Right chevron: append after headerEl (artist name always at position 0).
  if (chevronPosition !== 'right') {
    headerRow.appendChild(chevron);
  }

  headerRow.appendChild(headerEl);
  wrapEl.appendChild(headerRow);

  const filteredEls = bodyEls.filter(Boolean);
  // When no body elements:
  // - left chevron: render phantom for spacing/alignment.
  // - right chevron: no chevron needed (no left-indent effect).
  if (filteredEls.length === 0) {
    if (chevronPosition !== 'right') {
      chevron.classList.add('row-accordion-chevron-phantom');
    }
    headerRow.style.cursor = 'default';
    if (trailingEl) headerRow.appendChild(trailingEl);
    return wrapEl;
  }

  // Right chevron: append after headerEl now that body is confirmed non-empty.
  if (chevronPosition === 'right') {
    headerRow.appendChild(chevron);
    // When a trailing play button is also present, the chip+chevron pair should
    // be left-anchored (natural width) with a spacer pushing the play button
    // to the right — so the chevron visually neighbours the chip, not the play btn.
    if (trailingEl) {
      headerRow.classList.add('has-trail-right');
      const spacer = document.createElement('span');
      spacer.className = 'row-accordion-spacer';
      headerRow.appendChild(spacer);
    }
  }

  // trailingEl (e.g. play button) always goes last — after the chevron.
  if (trailingEl) headerRow.appendChild(trailingEl);

  chevron.textContent = defaultCollapsed ? '\u25b6' : '\u25bc';
  chevron.title = 'Expand / collapse';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'row-accordion-body';
  if (chevronPosition === 'right') {
    bodyEl.style.paddingLeft = 'var(--hier-indent-step)';
  }
  bodyEl.hidden = defaultCollapsed;
  filteredEls.forEach(function (el) { bodyEl.appendChild(el); });
  wrapEl.appendChild(bodyEl);

  function _toggle() {
    bodyEl.hidden = !bodyEl.hidden;
    chevron.textContent = bodyEl.hidden ? '\u25b6' : '\u25bc';
  }

  // Chevron button has its own handler (stops propagation so header doesn't double-fire).
  chevron.addEventListener('click', function (e) {
    e.stopPropagation();
    _toggle();
  });

  // Entire header row also toggles collapse; interactive children stop propagation.
  headerRow.addEventListener('click', function (e) {
    if (e.target.closest('a, button, .raga-chip, .comp-chip, .musician-chip, .lecdem-chip, .neutral-chip')) return;
    _toggle();
  });

  return wrapEl;
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
    if (typeof applyChipRole === 'function') applyChipRole(c, 'entity', 'raga', ragaId);
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
    if (typeof applyChipRole === 'function') applyChipRole(c, 'entity', 'composition', compId);
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
    // ADR-150: resolveNode tries cy first, falls back to elements[] for transit musicians
    const mNode  = (typeof resolveNode === 'function') ? resolveNode(mid)
      : ((typeof cy !== 'undefined') ? cy.getElementById(mid) : null);
    const mLabel = mNode ? (mNode.data('label') || mid) : mid;
    const c = document.createElement('span');
    c.className = 'musician-chip';
    if (typeof applyChipRole === 'function') applyChipRole(c, 'entity', 'musician', mid);
    c.textContent = mLabel;
    c.title = 'Open ' + mLabel + '\u2019s panel';

    // Era-tint — same pattern as all other musician chips
    if (mNode && typeof THEME !== 'undefined' && THEME.eraTintCss) {
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
      if (mNode && !mNode._raw && typeof selectNode === 'function') {
        // Real cy node — select it in the graph
        selectNode(mNode);
        if (typeof window.setPanelState === 'function') {
          setTimeout(function () { window.setPanelState('MUSICIAN'); }, 50);
        }
      } else if (typeof _openMusicianPanelForTransit === 'function') {
        // Isolated musician (no lineage edges) — open panel directly from elements array
        _openMusicianPanelForTransit(mid);
      }
    });
    chips.push(c);
  });

  return chips;
}

// ── ADR-142 §1: chip-role taxonomy ────────────────────────────────────────────
// Every chip in the system carries three data attributes so the double-click
// dispatcher (Phase B+, not yet wired) can route to the correct add/edit form
// without per-chip onclick configuration.
//
//   data-chip-role    ∈ {'panel-title', 'section-header', 'entity'}
//   data-entity-type  ∈ {'musician', 'raga', 'composition', 'recording', 'edge'}
//   data-entity-id    stable id of the entity (entity-role chips only)
//
// Phase A scope (this file): set the attributes only. No behaviour change.
//
// CSS-class → entity-type map for the defensive defaulter.
const _CHIP_CLASS_TO_ENTITY_TYPE = {
  'musician-chip': 'musician',
  'composer-chip': 'musician',   // composer is a musician
  'lineage-chip':  'musician',   // lineage chips render musicians (gurus / shishyas)
  'raga-chip':     'raga',
  'comp-chip':     'composition',
  'lecdem-chip':   'recording',
  'recording-chip':'recording',  // future class for promoted concert/lecdem/misc titles
};

// applyChipRole — set the ADR-142 §1 attributes on a chip.
// Safe to call multiple times; later calls overwrite earlier ones.
//   chip        HTMLElement (required)
//   role        one of 'panel-title' | 'section-header' | 'entity' (required)
//   entityType  one of the entity-type strings above (required for entity / section-header)
//   entityId    string (entity-role only); falsy values are omitted
function applyChipRole(chip, role, entityType, entityId) {
  if (!chip || !chip.dataset) return chip;
  if (role) chip.dataset.chipRole = role;
  if (entityType) chip.dataset.entityType = entityType;
  if (entityId) chip.dataset.entityId = entityId;
  return chip;
}

// tagUntaggedChips — defensive defaulter (ADR-142 Phase A safety net).
// Walks rootEl's subtree and, for any chip element missing data-chip-role,
// sets role='entity' and infers data-entity-type from the chip's CSS class.
// Does NOT set data-entity-id (id requires construction-time context).
// Construction sites that own the id should call applyChipRole explicitly.
function tagUntaggedChips(rootEl) {
  if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
  const selector = Object.keys(_CHIP_CLASS_TO_ENTITY_TYPE)
    .map(function (cls) { return '.' + cls; })
    .join(', ');
  const chips = rootEl.querySelectorAll(selector);
  for (let i = 0; i < chips.length; i++) {
    const chip = chips[i];
    if (chip.dataset.chipRole) continue;  // already tagged explicitly
    chip.dataset.chipRole = 'entity';
    if (chip.dataset.entityType) continue;
    for (const cls in _CHIP_CLASS_TO_ENTITY_TYPE) {
      if (chip.classList.contains(cls)) {
        chip.dataset.entityType = _CHIP_CLASS_TO_ENTITY_TYPE[cls];
        break;
      }
    }
  }
}
