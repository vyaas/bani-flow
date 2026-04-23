// ── Focus state for two-click node interaction ───────────────────────────────
let _focusedGraphNode = null;

// ── Static lookup tables ──────────────────────────────────────────────────────
const CAKRA_NAMES = {
  1: 'Indu', 2: 'Netra', 3: 'Agni', 4: 'Veda',
  5: 'Bana', 6: 'Rutu', 7: 'Rishi', 8: 'Vasu',
  9: 'Brahma', 10: 'Disi', 11: 'Rudra', 12: 'Aditya'
};

// ── Cytoscape init ────────────────────────────────────────────────────────────
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements:  elements,
  style: [
    {
      selector: 'node',
      style: {
        'background-color':   'data(color)',
        'shape':              'data(shape)',
        'width':              'data(size)',
        'height':             'data(size)',
        // ADR-074: canvas label is suppressed; labels are rendered as
        // real `.musician-chip` DOM elements in `#cy-labels` so they match
        // the sidebar chips exactly (era tint + left bar + instrument icon).
        'label':              '',
        'min-zoomed-font-size':   8,
        'border-width':       '2px',
        'border-color':       THEME.nodeDefault,
      }
    },
    // Non-ellipse shapes need a thicker border so their geometry reads clearly
    {
      selector: 'node[shape = "diamond"]',
      style: { 'border-width': '3px' }
    },
    {
      selector: 'node[shape = "rectangle"]',
      style: { 'border-width': '3px' }
    },
    {
      selector: 'node[shape = "triangle"]',
      style: { 'border-width': '3px' }
    },
    {
      selector: 'node[shape = "hexagon"]',
      style: { 'border-width': '3px' }
    },
    {
      selector: 'node.has-tracks',
      style: { 'border-color': THEME.nodeHasTracks, 'border-width': '2.5px' }
    },
    {
      selector: 'node.hovered',
      style: { 'border-color': THEME.nodeHovered, 'border-width': '3px' }
    },
    {
      selector: 'node:selected',
      style: {
        'border-color': THEME.nodeSelected, 'border-width': '3px',
      }
    },
    {
      selector: 'node.bani-match',
      style: { 'border-color': THEME.nodeBaniMatch, 'border-width': '3.5px' }
    },
    {
      selector: 'edge',
      style: {
        'curve-style':         'bezier',
        'target-arrow-shape':  'triangle',
        'target-arrow-color':  THEME.edgeArrow,
        'line-color':          THEME.edgeLine,
        'width':               'data(width)',
        'arrow-scale':         0.8,
        'opacity':             THEME.opacityEdge,
      }
    },
    {
      selector: 'edge.highlighted',
      style: {
        'line-color':         THEME.edgeHighlight,
        'target-arrow-color': THEME.edgeHighlight,
        'opacity':            1.0,
      }
    },
    { selector: '.faded',      style: { 'opacity': THEME.opacityFaded } },
    { selector: '.chip-faded', style: { 'opacity': THEME.opacityFaded } },
    // ADR-055: dim nodes that have no playable content (recordings or compositions)
    { selector: 'node[is_listenable = 0]', style: {
        'opacity': 0.25,
        'text-opacity': 1.0,
      }
    },
  ],
  layout: {
    name: 'cose', animate: true, animationDuration: 800,
    randomize: true, componentSpacing: 80,
    nodeRepulsion: () => 8000, nodeOverlap: 20,
    idealEdgeLength: () => 120, edgeElasticity: () => 100,
    gravity: 0.25, numIter: 1000,
    initialTemp: 200, coolingFactor: 0.95, minTemp: 1.0,
  },
});

cy.ready(() => {
  cy.nodes().forEach(n => {
    if (n.data('tracks').length > 0) n.addClass('has-tracks');
  });
  _initOverlayChips();
  applyZoomLabels();
  buildFilterDropdowns();
  // Default view is Mela-Janya — switch after cy is ready so showRagaWheel()
  // has valid SVG dimensions to draw into.
  requestAnimationFrame(() => switchView('raga'));
});

// ── ERA_COLOURS and INSTRUMENT_SHAPES mirrors (for chip injection) ─────────────
// ERA_COLOURS now sourced from THEME.era (ADR-028: single source of truth)
const ERA_COLOURS = THEME.era;
const INSTRUMENT_SHAPES = {
  vocal:         'ellipse',
  veena:         'diamond',
  violin:        'rectangle',
  flute:         'triangle',
  mridangam:     'hexagon',
  bharatanatyam: 'ellipse',
};

// ── Outline-only SVG shape icons ──────────────────────────────────────────────
// Instruments are encoded by shape, not colour. We render unfilled SVG outlines
// so the shape reads clearly without competing with era fill colours.
// stroke colour is drawn from the theme's muted foreground.
const SHAPE_STROKE = 'var(--fg-muted)';
const SHAPE_STROKE_W = 1.5;

function makeShapeSVG(shape, size) {
  const s = size || 12;
  const sw = SHAPE_STROKE_W;
  const h = s / 2;          // half-size
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width',  s);
  svg.setAttribute('height', s);
  svg.setAttribute('viewBox', `0 0 ${s} ${s}`);
  svg.style.overflow = 'visible';

  let el;
  if (shape === 'ellipse') {
    el = document.createElementNS(ns, 'ellipse');
    el.setAttribute('cx', h); el.setAttribute('cy', h);
    el.setAttribute('rx', h - sw / 2); el.setAttribute('ry', h - sw / 2);
  } else if (shape === 'rectangle') {
    el = document.createElementNS(ns, 'rect');
    el.setAttribute('x', sw / 2); el.setAttribute('y', sw / 2);
    el.setAttribute('width',  s - sw); el.setAttribute('height', s - sw);
  } else if (shape === 'diamond') {
    el = document.createElementNS(ns, 'polygon');
    el.setAttribute('points', `${h},${sw/2} ${s - sw/2},${h} ${h},${s - sw/2} ${sw/2},${h}`);
  } else if (shape === 'triangle') {
    el = document.createElementNS(ns, 'polygon');
    el.setAttribute('points', `${h},${sw/2} ${s - sw/2},${s - sw/2} ${sw/2},${s - sw/2}`);
  } else if (shape === 'hexagon') {
    // flat-top hexagon
    const r = h - sw / 2;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      pts.push(`${(h + r * Math.cos(a)).toFixed(2)},${(h + r * Math.sin(a)).toFixed(2)}`);
    }
    el = document.createElementNS(ns, 'polygon');
    el.setAttribute('points', pts.join(' '));
  } else {
    // fallback: circle
    el = document.createElementNS(ns, 'ellipse');
    el.setAttribute('cx', h); el.setAttribute('cy', h);
    el.setAttribute('rx', h - sw / 2); el.setAttribute('ry', h - sw / 2);
  }

  el.setAttribute('fill',         'none');
  el.setAttribute('stroke',       SHAPE_STROKE);
  el.setAttribute('stroke-width', sw);
  svg.appendChild(el);
  return svg;
}

// ADR-069: instrument badge element for musician chips
function makeInstrBadge(instrKey, size) {
  const shape = INSTRUMENT_SHAPES[instrKey] || 'ellipse';
  const badge = document.createElement('span');
  badge.className = 'chip-instr-icon';
  badge.setAttribute('aria-hidden', 'true');
  badge.appendChild(makeShapeSVG(shape, size || 13));
  return badge;
}

// ── chip filter state ─────────────────────────────────────────────────────────
const activeFilters = { era: new Set(), instrument: new Set() };

// ADR-068: build the two multi-select filter dropdowns
// ADR-081 §6b: only era and instrument filters exist here — no lecdem filter.
// Lecdems are a discovery experience, not a faceted filter. Adding a "lecdems"
// filter would make lecdems a lookup target, violating the discoverability
// invariant. See ADR-081 §6b for the authoritative rationale.
function buildFilterDropdowns() {
  const eraOrder = [
    'trinity', 'bridge', 'golden_age', 'disseminator', 'living_pillars', 'contemporary'
  ];
  const eraLabels = {
    trinity:        'Trinity',
    bridge:         'Bridge',
    golden_age:     'Golden Age',
    disseminator:   'Disseminators',
    living_pillars: 'Living Pillars',
    contemporary:   'Contemporary',
  };

  const eraList = document.getElementById('era-dropdown-list');
  eraOrder.forEach(era => {
    const li = document.createElement('li');
    li.className = 'filter-dropdown-item';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.key   = era;
    li.dataset.group = 'era';

    const dot = document.createElement('span');
    dot.className = 'chip-dot';
    dot.style.background = ERA_COLOURS[era] || 'var(--gray)';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = eraLabels[era] || era;

    const check = document.createElement('span');
    check.className = 'filter-checkmark';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '\u2713';

    li.appendChild(dot);
    li.appendChild(labelSpan);
    li.appendChild(check);
    li.addEventListener('click', () => toggleFilterItem(li));
    eraList.appendChild(li);
  });

  const instrOrder = ['vocal', 'veena', 'violin', 'flute', 'mridangam'];
  const instrLabels = {
    vocal:     'Vocal',
    veena:     'Veena',
    violin:    'Violin',
    flute:     'Flute',
    mridangam: 'Mridangam',
  };

  const instrList = document.getElementById('instr-dropdown-list');
  instrOrder.forEach(instr => {
    const li = document.createElement('li');
    li.className = 'filter-dropdown-item';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.key   = instr;
    li.dataset.group = 'instrument';

    const iconWrap = document.createElement('span');
    iconWrap.className = 'chip-icon';
    iconWrap.appendChild(makeShapeSVG(INSTRUMENT_SHAPES[instr] || 'ellipse', 12));

    const labelSpan = document.createElement('span');
    labelSpan.textContent = instrLabels[instr] || instr;

    const check = document.createElement('span');
    check.className = 'filter-checkmark';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '\u2713';

    li.appendChild(iconWrap);
    li.appendChild(labelSpan);
    li.appendChild(check);
    li.addEventListener('click', () => toggleFilterItem(li));
    instrList.appendChild(li);
  });

  // Close dropdowns on outside click/touch
  document.addEventListener('mousedown', _closeDropdownsOnOutsideClick);
  document.addEventListener('touchstart', _closeDropdownsOnOutsideClick, { passive: true });
}

function _closeDropdownsOnOutsideClick(e) {
  ['era', 'instr'].forEach(prefix => {
    const wrap = document.getElementById(prefix + '-dropdown-wrap');
    const list = document.getElementById(prefix + '-dropdown-list');
    const btn  = document.getElementById(prefix + '-dropdown-btn');
    if (wrap && !wrap.contains(e.target) && list && !list.hidden) {
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function toggleFilterDropdown(group) {
  const prefix = group === 'era' ? 'era' : 'instr';
  const otherP = group === 'era' ? 'instr' : 'era';
  const list   = document.getElementById(prefix + '-dropdown-list');
  const btn    = document.getElementById(prefix + '-dropdown-btn');
  const otherL = document.getElementById(otherP + '-dropdown-list');
  const otherB = document.getElementById(otherP + '-dropdown-btn');
  // Close the other dropdown first
  if (otherL && !otherL.hidden) {
    otherL.hidden = true;
    otherB.setAttribute('aria-expanded', 'false');
  }
  const nowOpen = list.hidden;
  list.hidden = !nowOpen;
  btn.setAttribute('aria-expanded', String(nowOpen));
}

function toggleFilterItem(item) {
  const group = item.dataset.group;
  const key   = item.dataset.key;
  if (activeFilters[group].has(key)) {
    activeFilters[group].delete(key);
    item.setAttribute('aria-selected', 'false');
  } else {
    activeFilters[group].add(key);
    item.setAttribute('aria-selected', 'true');
  }
  _updateFilterBtnLabels();
  applyChipFilters();
}

function _updateFilterBtnLabels() {
  const eraCount   = activeFilters.era.size;
  const instrCount = activeFilters.instrument.size;
  const eraCountEl   = document.getElementById('era-filter-count');
  const instrCountEl = document.getElementById('instr-filter-count');
  const eraBtn       = document.getElementById('era-dropdown-btn');
  const instrBtn     = document.getElementById('instr-dropdown-btn');
  if (eraCountEl)   eraCountEl.textContent   = eraCount   > 0 ? '(' + eraCount   + ')' : '';
  if (instrCountEl) instrCountEl.textContent = instrCount > 0 ? '(' + instrCount + ')' : '';
  if (eraBtn)   eraBtn.classList.toggle('filter-active',   eraCount   > 0);
  if (instrBtn) instrBtn.classList.toggle('filter-active', instrCount > 0);
}

function applyChipFilters() {
  // Mutual exclusion: clear Bani Flow filter when chip filter activates
  const eraActive   = activeFilters.era;
  const instrActive = activeFilters.instrument;
  const anyActive   = eraActive.size > 0 || instrActive.size > 0;

  if (anyActive && activeBaniFilter) {
    clearBaniFilter();
  }

  const clearBtn = document.getElementById('filter-clear-all');
  if (!anyActive) {
    cy.elements().removeClass('chip-faded');
    if (clearBtn) clearBtn.hidden = true;
    setScopeLabels(false);
    return;
  }

  cy.nodes().forEach(node => {
    const d = node.data();
    const eraMatch   = eraActive.size   === 0 || eraActive.has(d.era);
    const instrMatch = instrActive.size === 0 || instrActive.has(d.instrument);
    const passes = eraMatch && instrMatch;
    if (passes) {
      node.removeClass('chip-faded');
    } else {
      node.addClass('chip-faded');
    }
  });

  cy.edges().forEach(edge => {
    const srcFaded = edge.source().hasClass('chip-faded');
    const tgtFaded = edge.target().hasClass('chip-faded');
    if (srcFaded && tgtFaded) {
      edge.addClass('chip-faded');
    } else {
      edge.removeClass('chip-faded');
    }
  });

  if (clearBtn) clearBtn.hidden = false;
  setScopeLabels(true);
}

function clearAllChipFilters() {
  activeFilters.era.clear();
  activeFilters.instrument.clear();
  document.querySelectorAll('.filter-dropdown-item[aria-selected="true"]')
    .forEach(i => i.setAttribute('aria-selected', 'false'));
  cy.elements().removeClass('chip-faded');
  const clearBtn = document.getElementById('filter-clear-all');
  if (clearBtn) clearBtn.hidden = true;
  _updateFilterBtnLabels();
  setScopeLabels(false);
}

function setScopeLabels(visible) {
  const display = visible ? 'block' : 'none';
  document.getElementById('musician-scope-label').style.display = display;
  document.getElementById('bani-scope-label').style.display     = display;
}

// ── ADR-074: DOM-overlay musician chip labels ───────────────────────────────
// Each cy node has a sibling `.musician-chip` element in `#cy-labels`. Chips
// are pixel-identical to the right-sidebar chips (same CSS class). Sync is
// rAF-coalesced and driven by viewport (pan / zoom) and node-position events.

const _cyChipMap = new Map();   // nodeId -> HTMLElement
let   _cyChipSyncQueued = false;

function _buildOverlayChip(node) {
  const d = node.data();
  const tint = THEME.eraTintCss(d.era || null);
  const chip = document.createElement('span');
  chip.className = 'musician-chip cy-overlay-chip';
  chip.style.setProperty('--chip-era-bg', tint.bg);
  chip.style.setProperty('--chip-era-border', tint.border);
  if (d.instrument) chip.appendChild(makeInstrBadge(d.instrument));
  chip.appendChild(document.createTextNode(d.label));
  chip.title = d.label + (d.lifespan ? ' · ' + d.lifespan : '');
  chip.dataset.nodeId = node.id();
  // Forward chip clicks to the underlying cy node so the chip behaves
  // exactly like tapping the disc (focus + open panel).
  chip.addEventListener('click', evt => {
    evt.stopPropagation();
    const n = cy.getElementById(chip.dataset.nodeId);
    if (n && n.length) n.emit('tap');
  });
  // Keep mouse hover in sync with the canvas hover state.
  chip.addEventListener('mouseenter', () => {
    const n = cy.getElementById(chip.dataset.nodeId);
    if (n && n.length) n.emit('mouseover');
  });
  chip.addEventListener('mouseleave', () => {
    const n = cy.getElementById(chip.dataset.nodeId);
    if (n && n.length) n.emit('mouseout');
  });
  return chip;
}

function _initOverlayChips() {
  const host = document.getElementById('cy-labels');
  if (!host) return;
  host.innerHTML = '';
  _cyChipMap.clear();
  cy.nodes().forEach(n => {
    const chip = _buildOverlayChip(n);
    host.appendChild(chip);
    _cyChipMap.set(n.id(), chip);
  });
}

function _syncOverlayChipPositions() {
  _cyChipSyncQueued = false;
  if (_cyChipMap.size === 0) return;
  // Skip work when the cy canvas is hidden (raga-wheel view).
  const cyEl = document.getElementById('cy');
  if (cyEl && cyEl.style.display === 'none') return;
  // Scale chips with the viewport zoom so they keep a fixed visual ratio to
  // the node disc (which Cytoscape draws in graph-space). Clamp to keep the
  // text legible at extreme zooms — tier-based hiding handles density.
  const z      = cy.zoom();
  const scale  = Math.max(0.45, Math.min(1.4, z));
  cy.nodes().forEach(n => {
    const chip = _cyChipMap.get(n.id());
    if (!chip) return;
    // Faded state mirrors cy's `.faded` class (set by selectNode etc).
    chip.classList.toggle('chip-faded', n.hasClass('faded'));
    if (chip.classList.contains('chip-hidden')) return;
    const p = n.renderedPosition();
    const h = n.renderedHeight();
    // Anchor: top-centre of chip just below the disc. CSS transform-origin
    // is 50% 0%, so scaling does not drift the chip away from the disc.
    const x = Math.round(p.x);
    const y = Math.round(p.y + h / 2 + 4);
    chip.style.transform =
      `translate(${x}px, ${y}px) translate(-50%, 0) scale(${scale})`;
  });
}

function scheduleCyChipSync() {
  if (_cyChipSyncQueued) return;
  _cyChipSyncQueued = true;
  requestAnimationFrame(_syncOverlayChipPositions);
}

// ── zoom-tiered labels (word-cloud / cartographic style) ──────────────────────
// Tier-based show/hide of overlay chips. Mirrors the original canvas-label
// thresholds so the perceived label density is unchanged.
function applyZoomLabels() {
  const z = cy.zoom();
  cy.nodes().forEach(n => {
    const chip = _cyChipMap.get(n.id());
    if (!chip) return;
    const tier = n.data('label_tier');
    const show = n.selected() ||
                 tier === 0 ||
                 (tier === 1 && z >= 0.35) ||
                 (tier === 2 && z >= 0.60);
    chip.classList.toggle('chip-hidden', !show);
  });
  scheduleCyChipSync();
}
cy.on('zoom', applyZoomLabels);
cy.on('pan',  scheduleCyChipSync);
cy.on('position', 'node', scheduleCyChipSync);
cy.on('add remove', 'node', () => { _initOverlayChips(); applyZoomLabels(); });

// Mirror cy hover state onto the overlay chip (canvas-originated hovers).
cy.on('mouseover', 'node', evt => {
  const chip = _cyChipMap.get(evt.target.id());
  if (chip) chip.classList.add('chip-hovered');
});
cy.on('mouseout', 'node', evt => {
  const chip = _cyChipMap.get(evt.target.id());
  if (chip) chip.classList.remove('chip-hovered');
});

// Mirror cy selection state onto the overlay chip.
cy.on('select', 'node', evt => {
  const chip = _cyChipMap.get(evt.target.id());
  if (chip) {
    chip.classList.add('chip-selected');
    chip.classList.remove('chip-hidden');
  }
});
cy.on('unselect', 'node', evt => {
  const chip = _cyChipMap.get(evt.target.id());
  if (chip) chip.classList.remove('chip-selected');
});


// ── hover popover ─────────────────────────────────────────────────────────────
const popover = document.getElementById('hover-popover');
cy.on('mouseover', 'node', evt => {
  const d = evt.target.data();
  document.getElementById('hp-name').textContent = d.label;
  const rec = d.tracks.length > 0
    ? ` · ${d.tracks.length} recording${d.tracks.length > 1 ? 's' : ''}`
    : '';
  document.getElementById('hp-sub').textContent =
    [d.lifespan, d.era_label, d.instrument].filter(Boolean).join(' · ') + rec;
  popover.style.display = 'block';
  evt.target.addClass('hovered');
});
cy.on('mouseout', 'node', evt => {
  popover.style.display = 'none';
  evt.target.removeClass('hovered');
});
cy.on('mousemove', 'node', evt => {
  const x = evt.originalEvent.clientX, y = evt.originalEvent.clientY;
  const pw = popover.offsetWidth  || 200;
  const ph = popover.offsetHeight || 60;
  popover.style.left = (x + 16 + pw > window.innerWidth  ? x - pw - 10 : x + 16) + 'px';
  popover.style.top  = (y + 16 + ph > window.innerHeight ? y - ph - 10 : y + 16) + 'px';
});

// ── Panel history (ADR-066) ──────────────────────────────────────────────────
let _currentPanelNodeId = null;
const panelHistory = { back: [], forward: [] };
const PANEL_HISTORY_MAX = 5;

function _updatePanelNavButtons() {
  const backBtn = document.getElementById('panel-back-btn');
  const fwdBtn  = document.getElementById('panel-fwd-btn');
  if (backBtn) backBtn.disabled = panelHistory.back.length === 0;
  if (fwdBtn)  fwdBtn.disabled  = panelHistory.forward.length === 0;
}

function panelBack() {
  if (!panelHistory.back.length) return;
  const targetId = panelHistory.back.pop();
  if (_currentPanelNodeId) {
    panelHistory.forward.unshift(_currentPanelNodeId);
    if (panelHistory.forward.length > PANEL_HISTORY_MAX) panelHistory.forward.pop();
  }
  const n = cy.getElementById(targetId);
  if (n && n.length) selectNode(n, { fromHistory: true });
}

function panelForward() {
  if (!panelHistory.forward.length) return;
  const targetId = panelHistory.forward.shift();
  if (_currentPanelNodeId) {
    panelHistory.back.push(_currentPanelNodeId);
    if (panelHistory.back.length > PANEL_HISTORY_MAX) panelHistory.back.shift();
  }
  const n = cy.getElementById(targetId);
  if (n && n.length) selectNode(n, { fromHistory: true });
}

document.getElementById('panel-back-btn').addEventListener('click', panelBack);
document.getElementById('panel-fwd-btn').addEventListener('click', panelForward);

// ── selectNode — shared selection logic (sidebar + graph highlight) ───────────
function selectNode(node, { fromHistory = false, revealPanel = true } = {}) {
  const d = node.data();
  if (!fromHistory) {
    if (_currentPanelNodeId && _currentPanelNodeId !== node.id()) {
      panelHistory.back.push(_currentPanelNodeId);
      if (panelHistory.back.length > PANEL_HISTORY_MAX) panelHistory.back.shift();
      panelHistory.forward = [];
    }
  }
  _currentPanelNodeId = node.id();
  _updatePanelNavButtons();

  // Collapsed single-line header — build an era-tinted musician-chip
  const nameEl = document.getElementById('node-name');
  nameEl.innerHTML = '';
  const tint = THEME.eraTintCss(d.era || null);
  const nameChip = document.createElement('span');
  nameChip.className = 'musician-chip';
  nameChip.style.setProperty('--chip-era-bg', tint.bg);
  nameChip.style.setProperty('--chip-era-border', tint.border);
  if (d.instrument) nameChip.appendChild(makeInstrBadge(d.instrument));
  nameChip.appendChild(document.createTextNode(d.label));
  nameChip.title = 'Pan to ' + d.label + ' on graph (' + (d.instrument || '') + ')';
  nameChip.onclick = () => orientToNode(node.id());
  nameEl.appendChild(nameChip);

  document.getElementById('node-lifespan').textContent = d.lifespan || '';

  // ADR-069: instrument badge is now inside the name chip — hide the standalone
  // shape icon to avoid the redundant double-circle next to the name.
  const shapeIcon = document.getElementById('node-shape-icon');
  shapeIcon.style.display = 'none';

  const wikiLink   = document.getElementById('node-wiki-link');
  const primarySrc = d.sources && d.sources.length > 0 ? d.sources[0] : null;
  if (primarySrc) {
    wikiLink.href         = primarySrc.url;
    wikiLink.title        = primarySrc.label;
    wikiLink.style.display = 'inline';
  } else {
    wikiLink.style.display = 'none';
  }

  document.getElementById('node-info').style.display = 'block';
  document.getElementById('edge-info').style.display = 'none';

  // Clear filter and rebuild unified recordings list
  const recFilter = document.getElementById('rec-filter');
  recFilter.value = '';
  recFilter.dispatchEvent(new Event('input'));

  buildRecordingsList(d.id, d);

  cy.elements().addClass('faded');
  node.removeClass('faded');
  node.connectedEdges().removeClass('faded').addClass('highlighted');
  node.connectedEdges().connectedNodes().removeClass('faded');

  // ADR-046: open right drawer on any screen width when a node is selected.
  // Mobile first-tap suppresses reveal — panel is pre-populated, surfaced on
  // the second tap (see node-tap handler below).
  if (revealPanel && typeof window.setPanelState === 'function') {
    window.setPanelState('MUSICIAN');
  }
}

// ── orientToNode — pan + zoom to a node, populate right sidebar ──────────────
// Fits the closed neighbourhood (node + direct connections) into view,
// flashes the node border, and populates the Musician panel — symmetric
// with raga/composition chips which populate the Bani Flow panel.
function orientToNode(nodeId) {
  const n = cy.getElementById(nodeId);
  if (!n || !n.length) return;
  // Fit to the node's closed neighbourhood (node + all direct connections)
  // so the viewer sees the node in context, not just a lone circle.
  const neighbourhood = n.closedNeighborhood();
  cy.animate({
    fit: { eles: neighbourhood, padding: 80 },
    duration: 500,
    easing: 'ease-in-out-cubic',
  });
  // Populate the Musician panel (right sidebar) — same as clicking the node
  selectNode(n);
  // Flash the node border briefly to draw the eye
  n.addClass('bani-match');
  setTimeout(() => n.removeClass('bani-match'), 1400);
}

// ── rec-filter event listener — bracket-aware (ADR-018) + raga-tree-aware (ADR-064) ──
document.getElementById('rec-filter').addEventListener('input', function() {
  const q       = this.value.toLowerCase().trim();
  const recList = document.getElementById('recordings-list');
  let anyVisible = false;

  // ── concert brackets ──────────────────────────────────────────────────────
  recList.querySelectorAll('.concert-bracket').forEach(bracket => {
    const items = bracket.querySelectorAll('.concert-perf-item');
    let bracketHasMatch = false;

    items.forEach(li => {
      if (!q) {
        li.style.display = 'flex';
        bracketHasMatch = true;
        return;
      }
      const titleText    = (li.querySelector('.rec-title')  || {}).textContent || '';
      const compChipText = (li.querySelector('.comp-chip')  || {}).textContent || '';
      const ragaChipText = (li.querySelector('.raga-chip')  || {}).textContent || '';
      const metaText     = (li.querySelector('.rec-meta')   || {}).textContent || '';
      const matches   = [titleText, compChipText, ragaChipText, metaText]
                        .some(t => t.toLowerCase().includes(q));
      li.style.display = matches ? 'flex' : 'none';
      if (matches) bracketHasMatch = true;
    });

    if (!q) {
      // Reset: collapse all brackets
      bracket.style.display = 'block';
      bracket.classList.remove('expanded');
      bracket.querySelector('.concert-perf-list').style.display = 'none';
      anyVisible = true;
    } else if (bracketHasMatch) {
      bracket.style.display = 'block';
      bracket.classList.add('expanded');
      bracket.querySelector('.concert-perf-list').style.display = 'block';
      anyVisible = true;
    } else {
      bracket.style.display = 'none';
    }
  });

  // ── raga tree groups (ADR-064) ────────────────────────────────────────────
  recList.querySelectorAll('li.tree-group').forEach(group => {
    const compNodes = group.querySelectorAll('.tree-comp-node');
    // ADR-070: also match the raga chip in the group header so users who
    // type a raga name (e.g. "sahana") find the compositions inside that
    // raga even though the leaf nodes themselves only show comp titles.
    const headerText = (group.querySelector('.tree-group-header') || {}).textContent || '';
    const headerMatches = !!q && headerText.toLowerCase().includes(q);
    let groupHasMatch = false;

    compNodes.forEach(node => {
      if (!q || headerMatches) {
        node.style.display = '';
        groupHasMatch = true;
        return;
      }
      const compText  = (node.querySelector('.comp-chip')     || {}).textContent || '';
      const titleText = (node.querySelector('.rec-title')     || {}).textContent || '';
      const composerText = (node.querySelector('.composer-label') || {}).textContent || '';
      // Also search inside recording leaves (year / concert title)
      const recText   = node.querySelector('.tree-rec-list')
        ? node.querySelector('.tree-rec-list').textContent : '';
      const matches = [compText, titleText, composerText, recText]
        .some(t => t.toLowerCase().includes(q));
      node.style.display = matches ? '' : 'none';
      if (matches) groupHasMatch = true;
    });

    if (!q) {
      group.style.display = '';
      group.classList.add('tree-group-open');
      anyVisible = true;
    } else if (groupHasMatch || headerMatches) {
      group.style.display = '';
      group.classList.add('tree-group-open');
      anyVisible = true;
    } else {
      group.style.display = 'none';
    }
  });

  // ── legacy flat items (ADR-064: now folded into raga tree; kept for safety) ─
  recList.querySelectorAll('li.rec-legacy').forEach(li => {
    if (!q) { li.style.display = 'flex'; anyVisible = true; return; }
    const titleText    = (li.querySelector('.rec-title')  || {}).textContent || '';
    const compChipText = (li.querySelector('.comp-chip')  || {}).textContent || '';
    const ragaChipText = (li.querySelector('.raga-chip')  || {}).textContent || '';
    const matches   = [titleText, compChipText, ragaChipText]
                      .some(t => t.toLowerCase().includes(q));
    li.style.display = matches ? 'flex' : 'none';
    if (matches) anyVisible = true;
  });

  // ── no-match sentinel ─────────────────────────────────────────────────────
  let noMatch = recList.querySelector('.rec-no-match');
  if (!anyVisible && q) {
    if (!noMatch) {
      noMatch = document.createElement('li');
      noMatch.className = 'rec-no-match';
      noMatch.style.cssText = 'color:var(--gray);font-style:italic;cursor:default;padding:5px 0;';
      noMatch.textContent = 'no match';
      recList.appendChild(noMatch);
    }
    noMatch.style.display = 'flex';
  } else if (noMatch) {
    noMatch.style.display = 'none';
  }
});

// ── trail-filter event listener ───────────────────────────────────────────────
document.getElementById('trail-filter').addEventListener('input', function() {
  const q         = this.value.toLowerCase().trim();
  const trailList = document.getElementById('trail-list');
  let anyVisible  = false;

  // ── Tree view (raga / comp): filter leaves, show/collapse parent groups ──
  const treeGroups = trailList.querySelectorAll('li.tree-group');
  if (treeGroups.length > 0) {
    treeGroups.forEach(function(group) {
      if (!q) {
        group.style.display = '';
        anyVisible = true;
        return;
      }
      // Text to match against: the group header chips + all leaf content
      const headerComp  = (group.querySelector(':scope > .tree-group-header .comp-chip')     || {}).textContent || '';
      const headerMusc  = (group.querySelector(':scope > .tree-group-header .musician-chip') || {}).textContent || '';
      const headerLabel = (group.querySelector(':scope > .tree-group-header .trail-label')   || {}).textContent || '';
      const leaves = group.querySelectorAll('li.tree-leaf');
      let groupMatches = false;

      leaves.forEach(function(leaf) {
        const primaryText  = (leaf.querySelector('.musician-chip') || {}).textContent || '';
        const coTexts      = [...leaf.querySelectorAll('.trail-artist-co')].map(function(el) { return el.textContent; }).join(' ');
        const labelText    = (leaf.querySelector('.trail-label')    || {}).textContent || '';
        const leafMatch = [primaryText, coTexts, headerComp, headerMusc, headerLabel, labelText]
          .some(function(t) { return t.toLowerCase().includes(q); });
        leaf.style.display = leafMatch ? '' : 'none';
        if (leafMatch) groupMatches = true;
      });

      // Header itself matches (e.g. typed composition title) → show all leaves
      const headerMatch = [headerComp, headerMusc, headerLabel]
        .some(function(t) { return t.toLowerCase().includes(q); });
      if (headerMatch) {
        leaves.forEach(function(leaf) { leaf.style.display = ''; });
        groupMatches = true;
      }

      group.style.display = groupMatches ? '' : 'none';
      if (groupMatches) {
        // Auto-expand groups that have matching leaves
        group.classList.add('tree-group-open');
        anyVisible = true;
      }
    });

    let noMatch = trailList.querySelector('.trail-no-match');
    if (!anyVisible && q) {
      if (!noMatch) {
        noMatch = document.createElement('li');
        noMatch.className = 'trail-no-match';
        noMatch.style.cssText = 'color:var(--gray);font-style:italic;cursor:default;padding:5px 0;';
        noMatch.textContent = 'no match';
        trailList.appendChild(noMatch);
      }
      noMatch.style.display = 'flex';
    } else if (noMatch) {
      noMatch.style.display = 'none';
    }
    return;
  }

  // ── Flat list (perf / yt): original logic ────────────────────────────────
  const items = trailList.querySelectorAll('li:not(.trail-no-match)');
  items.forEach(function(li) {
    if (!q) { li.style.display = 'flex'; anyVisible = true; return; }
    const primaryText  = (li.querySelector('.trail-artist-primary') || {}).textContent || '';
    const coTexts      = [...li.querySelectorAll('.trail-artist-co')].map(function(el) { return el.textContent; }).join(' ');
    const compChipText = (li.querySelector('.comp-chip')  || {}).textContent || '';
    const ragaChipText = (li.querySelector('.raga-chip')  || {}).textContent || '';
    const labelText    = (li.querySelector('.trail-label') || {}).textContent || '';
    const matches      = [primaryText, coTexts, compChipText, ragaChipText, labelText]
      .some(function(t) { return t.toLowerCase().includes(q); });
    li.style.display = matches ? 'flex' : 'none';
    if (matches) anyVisible = true;
  });

  let noMatch = trailList.querySelector('.trail-no-match');
  if (!anyVisible && q) {
    if (!noMatch) {
      noMatch = document.createElement('li');
      noMatch.className = 'trail-no-match';
      noMatch.style.cssText = 'color:var(--gray);font-style:italic;cursor:default;padding:5px 0;';
      noMatch.textContent = 'no match';
      trailList.appendChild(noMatch);
    }
    noMatch.style.display = 'flex';
  } else if (noMatch) {
    noMatch.style.display = 'none';
  }
});

// ── node tap (two-click: first = focus, second = open panel) ──────────────────
function focusNode(node) {
  _focusedGraphNode = node.id();
  cy.elements().addClass('faded');
  node.removeClass('faded');
  node.connectedEdges().removeClass('faded').addClass('highlighted');
  node.connectedEdges().connectedNodes().removeClass('faded');
  // Zoom + centre on the node's closed neighbourhood (mirrors raga wheel)
  const neighbourhood = node.closedNeighborhood();
  cy.animate({
    fit: { eles: neighbourhood, padding: 80 },
    duration: 500,
    easing: 'ease-in-out-cubic',
  });
}

cy.on('tap', 'node', evt => {
  const node = evt.target;

  if (isMobileViewport()) {
    // Mobile: two-tap UX preserved (ADR-044 nudge still shown).
    // First tap focuses + pre-populates the Musician panel silently;
    // second tap reveals it. The panel content is therefore ready the
    // instant the drawer slides in (no perceived lag).
    // Gate on viewport width (not pointer:coarse) so touchscreen laptops
    // running the desktop layout still get the single-tap UX.
    if (_focusedGraphNode === node.id()) {
      if (typeof hideClickNudge === 'function') hideClickNudge();
      if (typeof window.setPanelState === 'function') {
        window.setPanelState('MUSICIAN');
      }
    } else {
      focusNode(node);
      selectNode(node, { revealPanel: false });
      if (typeof showClickNudge === 'function')
        showClickNudge('tap again \u00B7 open musician details');
    }
  } else {
    // Desktop: single-tap focus + open panel immediately (ADR-058)
    focusNode(node);
    selectNode(node);
  }
});

// ── ADR-033: dbltap branches on input modality ──────────────────────────────
// Desktop: dbltap → metadata inspector (ADR-027, no regression)
// Mobile:  dbltap → fit viewport to node (double-tap = zoom, universal pattern)
cy.on('dbltap', 'node', evt => {
  if (isTouchDevice()) {
    cy.animate({ fit: { eles: evt.target, padding: 80 }, duration: 300 });
  } else {
    openMetaInspector('node', evt.target.data());
  }
});

cy.on('dbltap', 'edge', evt => {
  openMetaInspector('edge', evt.target.data());
});

// ── ADR-033: taphold → metadata inspector (mobile expert gesture) ─────────────
cy.on('taphold', 'node', evt => {
  openMetaInspector('node', evt.target.data());
});

cy.on('taphold', 'edge', evt => {
  openMetaInspector('edge', evt.target.data());
});

// ── ADR-027: reflective metadata inspector ────────────────────────────────────
// ADR-033: isTouchDevice guard — true on phones/tablets (pointer: coarse)
function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches;
}

// Mobile-layout viewport (matches the breakpoint used by mobile.js / media_player).
// Used for layout-driven UX choices (e.g. two-tap node reveal) that should
// follow the sidebar layout, not the pointer modality.
function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function openMetaInspector(type, dataObj) {
  const inspector = document.getElementById('meta-inspector');
  document.getElementById('mi-title').textContent =
    type + ' · ' + (dataObj.id || '');
  document.getElementById('mi-pre').textContent =
    JSON.stringify(dataObj, null, 2);
  inspector.style.display = 'flex';
}

document.getElementById('mi-close').addEventListener('click', () => {
  document.getElementById('meta-inspector').style.display = 'none';
});

document.getElementById('mi-copy').addEventListener('click', () => {
  const text = document.getElementById('mi-pre').textContent;
  navigator.clipboard.writeText(text).catch(() => {
    // fallback for environments without clipboard API
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
});

// ── edge tap (focus only — metadata via double-click / ADR-027) ───────────────
cy.on('tap', 'edge', evt => {
  _focusedGraphNode = null;
  cy.elements().addClass('faded');
  evt.target.removeClass('faded').addClass('highlighted');
  evt.target.source().removeClass('faded');
  evt.target.target().removeClass('faded');
});

// ── background tap ────────────────────────────────────────────────────────────
cy.on('tap', evt => {
  if (evt.target !== cy) return;
  _focusedGraphNode = null;
  cy.elements().removeClass('faded highlighted');
  document.getElementById('node-name').textContent          = '—'; // clear chip
  document.getElementById('node-lifespan').textContent      = '';
  document.getElementById('node-wiki-link').style.display   = 'none';
  document.getElementById('rec-filter').style.display       = 'none';
  document.getElementById('rec-filter').value               = '';
  document.getElementById('node-info').style.display        = 'block';
  document.getElementById('recordings-panel').style.display = 'none';
  document.getElementById('edge-info').style.display        = 'none';
  // NEW: clear chip filters on background tap
  clearAllChipFilters();
  applyZoomLabels();
  // ADR-034: dismiss bottom sheet on mobile when canvas background is tapped
  if (typeof dismissBottomSheet === 'function') dismissBottomSheet();
  // Collapse full-mobile player on canvas tap — exploration intent (mirrors sheet behaviour)
  if (typeof window._collapseMobilePlayer === 'function' &&
      document.querySelector('.media-player.full-mobile')) {
    window._collapseMobilePlayer();
  }
});

// ── controls ──────────────────────────────────────────────────────────────────
function relayout() {
  if (currentLayout === 'timeline') { applyTimelineLayout(); return; }
  cy.layout({
    name: 'cose', animate: true, animationDuration: 600, randomize: false,
    nodeRepulsion: () => 8000, idealEdgeLength: () => 120,
    gravity: 0.25, numIter: 500,
  }).run();
}

// ── Auto-relayout on browser resize ───────────────────────────────────────────
(function () {
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      cy.resize();
      if (currentView === 'graph') relayout();
    }, 400);
  });
})();

