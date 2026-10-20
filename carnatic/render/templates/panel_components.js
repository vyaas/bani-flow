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
// Builds a section with a standardised flex header row:
//   [headerChip] [count] [?]  ·······  [▶ +]
//
// ADR-180: the collapse chevron is retired — sections render their body in
// full, and the label wrap is the horizontal-scroll surface. The `defaultCollapsed`
// argument is accepted for backward compatibility but ignored.
//
// ADR-181: the count + `?` are tiny gray meta chips grouped with the category
// label on the LEFT; the transport pair (play / enqueue) alone owns the right
// column. Enumeration therefore never competes with the transport controls.
//
// Returns { sectionEl, bodyEl, headerEl }.
//
//   headerChip       DOM element (optional) — vocabulary chip at section-header scale
//   headerSuffixText string appended after the chip (optional)
//   count            integer (optional) — gray meta chip after the chip
//   onAdd            function (optional) — if provided, renders a + button
//   addTitle         string (optional) — tooltip for + button
//   helpKind         string (optional) — help-card key (e.g. 'lecdems', 'concerts')
//   helpSlot         string (optional) — panel slot ('bani' | 'musician') owning the card
// ADR-177: helpKind + helpSlot render a `?` button beside the section chip that
// opens the dedicated category help card (replaces the retired panel-help overlay).
// ADR-166: when playable is true, the header gains ▶ (Play all visible) and
// ⊕ (Add visible to queue) buttons. Both harvest lazily at click time via
// collectQueueItems(bodyEl) — no count is shown, no filter coupling required.
function buildSection({ headerChip, headerSuffixText, count, addTitle, defaultCollapsed = false, playable = false, helpKind = null, helpSlot = null } = {}) {
  const sectionEl = document.createElement('section');

  const headerEl = document.createElement('div');
  headerEl.className = 'rec-section-header-row';

  // Label wrapper: chip + suffix text + (count)
  const labelWrap = document.createElement('span');
  labelWrap.className = 'rec-section-hdr-label-wrap';
  if (headerChip) labelWrap.appendChild(headerChip);
  if (headerSuffixText) labelWrap.appendChild(document.createTextNode(headerSuffixText));

  // ADR-181: enumeration is a tiny gray meta chip (the .trail-version recipe)
  // grouped with the category chip, not a right-column badge.
  if (count != null) {
    const countEl = document.createElement('span');
    countEl.className = 'section-hdr-count';
    countEl.textContent = String(count);
    countEl.title = count + (count === 1 ? ' item' : ' items');
    labelWrap.appendChild(countEl);
  }

  // ADR-177: category help trigger — sits beside the section chip so every
  // category carries its own "what is this?" affordance. Opens the dialog card
  // rendered from helpEmptyPanels (empty_tutorials.js).
  // ADR-181: the `?` is the same gray meta chip as the count — help and
  // enumeration share one visual family, apart from the transport pair.
  if (helpKind && helpSlot) {
    const helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = 'section-help-btn';
    helpBtn.textContent = '?';
    helpBtn.title = 'What is this section?';
    helpBtn.setAttribute('aria-label', 'Help — what is this section');
    helpBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof window.openCategoryHelp === 'function') {
        window.openCategoryHelp(helpSlot, helpKind);
      }
    });
    labelWrap.appendChild(helpBtn);
  }

  // Transport column — play-all / enqueue-all only.
  headerEl.appendChild(labelWrap);
  const actsRight = document.createElement('span');
  actsRight.className = 'section-hdr-right';
  headerEl.appendChild(actsRight);

  sectionEl.appendChild(headerEl);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'section-body';
  bodyEl.hidden = false;

  // ADR-166: play-all / enqueue pair — created after bodyEl so handlers can close over it.
  if (playable) {
    const acts = document.createElement('span');
    acts.className = 'section-play-acts';
    const playAllBtn = document.createElement('button');
    playAllBtn.type = 'button';
    playAllBtn.className = 'section-play-btn';
    playAllBtn.title = 'Play all visible';
    playAllBtn.textContent = '\u25b6';
    playAllBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof collectQueueItems !== 'function') return;
      const items = collectQueueItems(bodyEl);
      if (items.length && typeof startMediaQueue === 'function') startMediaQueue(items, 0);
    });
    const enqueueBtn = document.createElement('button');
    enqueueBtn.type = 'button';
    enqueueBtn.className = 'section-enqueue-btn';
    enqueueBtn.title = 'Add visible to queue';
    enqueueBtn.setAttribute('aria-label', 'Add visible to queue');
    enqueueBtn.textContent = '+';
    enqueueBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof collectQueueItems !== 'function' || typeof MediaQueue === 'undefined') return;
      MediaQueue.addItems(collectQueueItems(bodyEl));
    });
    acts.appendChild(playAllBtn);
    acts.appendChild(enqueueBtn);
    actsRight.appendChild(acts);
  }

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
// ADR-180: the accordion is retired. The body is now an inline detail strip on
// the same single scrollable line as the header:
//   [headerEl] [bodyEls...] [trailingEl]
// The whole `.row-accordion-header` is one fixed-height, non-wrapping flex line;
// callers keep the name for compatibility, but there is no chevron and no fold.
//
// Returns the wrapper container element (a <div.row-accordion>).
//
//   headerEl         DOM element — the primary row content
//   bodyEls          array of DOM elements placed inline after the header
//   defaultCollapsed boolean (ignored — kept for call-site compatibility)
//   chevronPosition  string (ignored — kept for call-site compatibility)
//   trailingEl       DOM element pinned last (e.g. the play/enqueue acts column)
function buildRowAccordion({ headerEl, bodyEls = [], defaultCollapsed = true, chevronPosition = 'left', trailingEl = null } = {}) {
  const wrapEl = document.createElement('div');
  wrapEl.className = 'row-accordion';

  const headerRow = document.createElement('div');
  headerRow.className = 'row-accordion-header';
  headerRow.style.cursor = 'default';

  // ADR-180: identity + inline detail share one horizontal-scroll surface;
  // trailingEl (the action column) stays pinned outside it.
  const scroll = document.createElement('div');
  scroll.className = 'row-accordion-scroll';
  scroll.appendChild(headerEl);
  bodyEls.filter(Boolean).forEach(function (el) { scroll.appendChild(el); });
  headerRow.appendChild(scroll);

  if (trailingEl) headerRow.appendChild(trailingEl);

  wrapEl.appendChild(headerRow);
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
    // ADR-172: instrument glyph, matching every other musician chip.
    const _mInstr = (mNode && mNode.data) ? (mNode.data('instrument') || null) : null;
    if (_mInstr && typeof makeInstrBadge === 'function') {
      c.insertBefore(makeInstrBadge(_mInstr, 13,
                                    { composer: !!mNode.data('is_composer') }), c.firstChild);
    }
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

// Roles whose chips open an edit/add form on double-click. These earn the
// ✎ pencil affordance automatically (see markEditable + base.html [data-editable]).
const _EDITABLE_ROLES = { 'panel-title': 1, 'section-add': 1, 'row-block': 1 };

// markEditable — the single source of truth for the ✎ pencil indication.
// Call this on ANY element that is double-click editable. base.html paints the
// pencil (exterior top-right symbol, no reflow) solely off [data-editable], so
// the hover indication can never drift from the actual edit gesture: wherever an
// edit handler is wired, mark the same element here. Elements reachable via an
// editable data-chip-role are marked automatically by applyChipRole below; the
// imperative handlers (recording rows, lecdem about/by titles in media_player.js
// and bani_flow.js) call markEditable directly at the wiring site.
function markEditable(el) {
  if (el && el.dataset) el.dataset.editable = '';
  return el;
}

// applyChipRole — set the ADR-142 §1 attributes on a chip.
// Safe to call multiple times; later calls overwrite earlier ones.
//   chip        HTMLElement (required)
//   role        one of 'panel-title' | 'section-add' | 'row-block' | 'entity' (required)
//   entityType  one of the entity-type strings above (required for entity / section-add)
//   entityId    string (entity-role only); falsy values are omitted
// An editable role (panel-title / section-add / row-block) also marks the chip
// data-editable so it earns the pencil — keeping indication and gesture in lockstep.
function applyChipRole(chip, role, entityType, entityId) {
  if (!chip || !chip.dataset) return chip;
  if (role) chip.dataset.chipRole = role;
  if (entityType) chip.dataset.entityType = entityType;
  if (entityId) chip.dataset.entityId = entityId;
  if (role && _EDITABLE_ROLES[role]) chip.dataset.editable = '';
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

// ── Unified content filter (ADR-178) ─────────────────────────────────────────
// One engine powers both panel filter bars — the musician panel (#rec-filter)
// and the Bani-flow panel (#trail-filter), now both labelled "Filter content…".
//
// Matching is textContent-based: *every* label inside a row counts — chips,
// lecdem segment names, subject cross-links, years, version badges, misc
// recording titles, playlist track chips, notes — so broadening the panel
// vocabulary needs no new selector per label type.
//
// Zone contract:
//   root      — container queried for rows + groups
//   rows      — atomic content rows; visible iff their own text matches, or an
//               ancestor group's header matched
//   groups[]  — { sel, header, expand?, collapseOnClear? }; a group is visible
//               iff its header matched or a descendant row is visible. `expand`
//               is a class added on visibility (tree groups are open by
//               default; .concert-bracket uses it to unroll its perf list).
//   noMatch   — optional sentinel class created/toggled inside root
//   rootBase  — optional f(root) returning the root's resting display
//
// Visibility-channel invariant (ADR-165 §3): exclusions are expressed ONLY via
// inline style.display; collapse/fold keeps owning the `hidden` attribute.
const CONTENT_FILTER_ZONES = {
  musician: [
    {
      root: '#recordings-list',
      noMatch: 'rec-no-match',
      rows: [
        'li.lecdem-row',            // lecdems (flat + segmented brackets)
        'li.concert-perf-item',     // concert + lecdem segment rows
        'li.tree-comp-node',        // raga-tree composition nodes
        'li.tree-misc-leaf',        // raga-tree Misc recordings
        'li.comp-raga-item',        // Compositions-by-raga rows
        'li.rec-legacy',            // legacy flat recordings (kept for safety)
        'section[data-section="playlists"] .row-accordion',
        'li.notes-item',
      ],
      groups: [
        { sel: ':scope > section', header: ':scope > .rec-section-header-row' },
        { sel: '.lecdem-subsection', header: ':scope > .lecdem-subsection-header' },
        { sel: '.concert-bracket', header: ':scope > .concert-header', expand: 'expanded', collapseOnClear: true },
        { sel: 'li.tree-group', header: ':scope > .tree-group-header', expand: 'tree-group-open' },
        { sel: 'li.comp-raga-group', header: ':scope > .comp-raga-header' },
        { sel: '.entity-notes-section', header: ':scope > .notes-section-header' },
      ],
    },
  ],
  bani: [
    {
      root: '#trail-list',
      noMatch: 'trail-no-match',
      rows: [
        'li.tree-leaf',                              // raga/comp tree leaves
        ':scope > li:not(.trail-no-match)',          // perf/yt flat items
        'section[data-section="playlists"] .row-accordion',
      ],
      groups: [
        { sel: ':scope > section', header: ':scope > .rec-section-header-row' },
        { sel: 'li.tree-group', header: ':scope > .tree-group-header', expand: 'tree-group-open' },
      ],
    },
    {
      // Lecdem strip (ADR-081) — outside #trail-list but in the same filter's ambit.
      root: '#bani-lecdem-strip',
      rows: ['li.lecdem-row', 'li.concert-perf-item'],
      groups: [
        { sel: ':scope > section', header: ':scope > .rec-section-header-row' },
        { sel: '.concert-bracket', header: ':scope > .concert-header', expand: 'expanded', collapseOnClear: true },
      ],
      rootBase: function(root) { return root.querySelector('li.lecdem-row') ? '' : 'none'; },
    },
    {
      root: '#bani-playlists',
      rows: ['section[data-section="playlists"] .row-accordion'],
      groups: [
        { sel: 'section[data-section="playlists"]', header: ':scope > .rec-section-header-row' },
      ],
    },
  ],
};

// _contentFilterText — the one matcher: the full rendered text of an element,
// case-folded. textContent reaches every chip/label descendant by construction.
function _contentFilterText(el) {
  return (el && el.textContent ? el.textContent : '').toLowerCase();
}

// _contentFilterShow — inline display is the filter's exclusive refusal channel.
// Priority `important` is required: the ADR-180 ribbon rules set
// `display:flex !important` on several row containers (notably
// `li.concert-perf-item`), and a plain inline `none` loses to an
// author-stylesheet `!important`, leaving filtered-out rows visible. An inline
// `!important` declaration outranks any author-stylesheet `!important`, so the
// exclusion wins while `el.style.display` (read by the ADR-165 harvest ancestor
// walk) still reports `none`.
function _contentFilterShow(el, visible) {
  if (visible) {
    el.style.removeProperty('display');
  } else {
    el.style.setProperty('display', 'none', 'important');
  }
}

// _contentFilterSetSentinel — create/toggle the "no match" row inside root.
function _contentFilterSetSentinel(root, className, show) {
  if (!className) return;
  let sentinel = null;
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    if (child.classList && child.classList.contains(className)) { sentinel = child; break; }
  }
  if (!sentinel) {
    if (!show) return;
    sentinel = document.createElement('li');
    sentinel.className = className;
    sentinel.style.cssText = 'color:var(--gray);font-style:italic;cursor:default;padding:5px 0;';
    sentinel.textContent = 'no match';
    root.appendChild(sentinel);
  }
  sentinel.style.display = show ? 'flex' : 'none';
}

function _contentFilterZone(zone, q) {
  const root = document.querySelector(zone.root);
  if (!root) return false;
  const rowSel   = zone.rows.join(', ');
  const rowEls   = Array.prototype.slice.call(root.querySelectorAll(rowSel));
  const groupEls = [];
  zone.groups.forEach(function(g) {
    Array.prototype.slice.call(root.querySelectorAll(g.sel)).forEach(function(el) {
      groupEls.push({ el: el, cfg: g });
    });
  });

  let any = rowEls.length > 0 || groupEls.length > 0;

  if (!q) {
    rowEls.forEach(function(r) { _contentFilterShow(r, true); });
    groupEls.forEach(function(g) {
      _contentFilterShow(g.el, true);
      if (g.cfg.expand && g.cfg.collapseOnClear) g.el.classList.remove(g.cfg.expand);
    });
  } else {
    any = false;

    // 1. A matching group header reveals the whole group: typing a raga name
    //    shows all its compositions; typing "Lecdems" shows the whole section.
    const forced = new Set();
    groupEls.forEach(function(g) {
      if (!g.cfg.header) return;
      const header = g.el.querySelector(g.cfg.header);
      if (header && _contentFilterText(header).indexOf(q) !== -1) {
        Array.prototype.slice.call(g.el.querySelectorAll(rowSel)).forEach(function(r) { forced.add(r); });
      }
    });

    // 2. Rows — own text match, or forced by an ancestor header.
    rowEls.forEach(function(r) {
      const visible = forced.has(r) || _contentFilterText(r).indexOf(q) !== -1;
      _contentFilterShow(r, visible);
      if (visible) any = true;
    });

    // 3. Groups — header match or any descendant row still visible.
    groupEls.forEach(function(g) {
      let visible = false;
      if (g.cfg.header) {
        const header = g.el.querySelector(g.cfg.header);
        if (header && _contentFilterText(header).indexOf(q) !== -1) visible = true;
      }
      if (!visible) {
        const inner = g.el.querySelectorAll(rowSel);
        for (let i = 0; i < inner.length; i++) {
          if (inner[i].style.display !== 'none') { visible = true; break; }
        }
      }
      _contentFilterShow(g.el, visible);
      if (visible) {
        any = true;
        if (g.cfg.expand) g.el.classList.add(g.cfg.expand);
      }
    });
  }

  if (zone.rootBase) root.style.display = any ? zone.rootBase(root) : 'none';
  _contentFilterSetSentinel(root, zone.noMatch, !any && !!q);
  return any;
}

// applyPanelContentFilter(panelKey, rawQuery) — the shared entry point.
function applyPanelContentFilter(panelKey, rawQuery) {
  const zones = CONTENT_FILTER_ZONES[panelKey];
  if (!zones) return;
  const q = (rawQuery || '').toLowerCase().trim();
  zones.forEach(function(zone) { _contentFilterZone(zone, q); });
}
window.applyPanelContentFilter = applyPanelContentFilter;
