// ── Focus state for two-click node interaction ───────────────────────────────
let _focusedGraphNode = null;

// ── Static lookup tables ──────────────────────────────────────────────────────
const CAKRA_NAMES = {
  1: 'Indu', 2: 'Netra', 3: 'Agni', 4: 'Veda',
  5: 'Bana', 6: 'Rutu', 7: 'Rishi', 8: 'Vasu',
  9: 'Brahma', 10: 'Disi', 11: 'Rudra', 12: 'Aditya'
};

// ── ADR-134: connected-set predicate — nodes incident to ≥1 guru-shishya edge ─
// A node is included iff it is incident to at least one edge.
// Computed once before Cytoscape is initialised; retained for use by filters.
const _connectedNodeIds = (function () {
  const ids = new Set();
  elements.forEach(function (el) {
    if (el.data.source) {
      ids.add(el.data.source);
      ids.add(el.data.target);
    }
  });
  return ids;
}());

// ── ADR-138 D1: content-bearing set ──────────────────────────────────────────
// A musician is content-bearing iff:
//   · is_listenable == 1  (tracks, concerts, lecdem host, or is a composer)
//   · OR appears as a lecdem subject in lecdemsAboutMusician (ADR-078)
// Computed once; exposed as window._contentBearingIds for ADR-137 panel dimming.
function _computeContentBearingSet() {
  const ids = new Set();
  elements.forEach(function (el) {
    if (el.data.source === undefined && el.data.is_listenable === 1) {
      ids.add(el.data.id);
    }
  });
  // has_lecdem_about is not included in is_listenable — add separately.
  if (typeof lecdemsAboutMusician !== 'undefined') {
    Object.keys(lecdemsAboutMusician).forEach(function (mid) {
      const refs = lecdemsAboutMusician[mid];
      if (refs && refs.length > 0) ids.add(mid);
    });
  }
  return ids;
}
const _contentBearingIds = _computeContentBearingSet();
// Expose for ADR-137 panel-chip dimming (musician_panel.js).
window._contentBearingIds = _contentBearingIds;

// ── ADR-138 D3: collapse contentless transit nodes into transitive edges ──────
// For each path (a, t₁…tₖ, b) where a, b are content-bearing and all tᵢ are
// transit (connected but not content-bearing) nodes, produce a synthetic edge
// a→b annotated with transit ids and labels.
function _computeTransitiveEdges() {
  // Build directed adjacency: nodeId → [neighborId, ...]
  const adj = new Map();
  // Track direct CB→CB pairs so we never emit a redundant transitive edge.
  const primaryPairs = new Set();
  elements.forEach(function (el) {
    if (el.data.source === undefined) return;
    const s = el.data.source, t = el.data.target;
    if (!adj.has(s)) adj.set(s, []);
    adj.get(s).push(t);
    if (_contentBearingIds.has(s) && _contentBearingIds.has(t)) {
      primaryPairs.add(s + '::' + t);
    }
  });
  // Label lookup for tooltip names.
  const labelById = new Map();
  elements.forEach(function (el) {
    if (el.data.source === undefined) {
      labelById.set(el.data.id, el.data.label || el.data.id);
    }
  });
  // BFS from each content-bearing node through transit nodes to content-bearing successors.
  const seenPairs = new Set();
  const result = [];
  _contentBearingIds.forEach(function (srcId) {
    if (!_connectedNodeIds.has(srcId)) return;
    const queue = [];
    const visited = new Set();
    (adj.get(srcId) || []).forEach(function (nbr) {
      if (!_contentBearingIds.has(nbr) && _connectedNodeIds.has(nbr) && !visited.has(nbr)) {
        visited.add(nbr);
        queue.push({ id: nbr, transit: [nbr] });
      }
    });
    while (queue.length > 0) {
      const item = queue.shift();
      (adj.get(item.id) || []).forEach(function (nxt) {
        if (_contentBearingIds.has(nxt) && _connectedNodeIds.has(nxt)) {
          const pairKey = srcId + '::' + nxt;
          if (!seenPairs.has(pairKey) && !primaryPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            result.push({ data: {
              id:           'transit::' + pairKey,
              source:       srcId,
              target:       nxt,
              kind:         'transitive',
              transit:      item.transit.slice(),
              transit_names: item.transit.map(function (tid) { return labelById.get(tid) || tid; }),
              width:        1.5,
              confidence:   0,
              source_url:   '',
              note:         '',
            }});
          }
        } else if (!_contentBearingIds.has(nxt) && _connectedNodeIds.has(nxt) && !visited.has(nxt)) {
          visited.add(nxt);
          queue.push({ id: nxt, transit: item.transit.concat(nxt) });
        }
      });
    }
  });
  return result;
}
const _transitiveEdges = _computeTransitiveEdges();

// ── ADR-138 D2: visible element set ──────────────────────────────────────────
// Nodes:          connected AND content-bearing.
// Primary edges:  both endpoints content-bearing + connected.
// Transitive edges: derived synthetic arcs for collapsed transit chains.

// A node is "visibly connected" only if it is an endpoint of at least one edge
// that survives the filter (both endpoints content-bearing) or a transitive edge.
// Using raw _connectedNodeIds here is insufficient: a node can have edges in the
// data whose only counterparts are non-content-bearing transit nodes — those edges
// are dropped, leaving the node stranded with no visible connections.
const _visiblyConnectedIds = (function () {
  const ids = new Set();
  elements.forEach(function (el) {
    if (el.data.source === undefined) return;
    const s = el.data.source, t = el.data.target;
    if (_contentBearingIds.has(s) && _contentBearingIds.has(t) &&
        _connectedNodeIds.has(s) && _connectedNodeIds.has(t)) {
      ids.add(s);
      ids.add(t);
    }
  });
  _transitiveEdges.forEach(function (el) {
    ids.add(el.data.source);
    ids.add(el.data.target);
  });
  return ids;
}());

const _cyElements = elements.filter(function (el) {
  if (el.data.source !== undefined) {
    // Primary edge: keep only when both endpoints are visible.
    return _contentBearingIds.has(el.data.source) &&
           _contentBearingIds.has(el.data.target) &&
           _connectedNodeIds.has(el.data.source) &&
           _connectedNodeIds.has(el.data.target);
  }
  // Node: must have at least one visible edge (primary or transitive).
  return _visiblyConnectedIds.has(el.data.id) && _contentBearingIds.has(el.data.id);
}).concat(_transitiveEdges);

// ── Cytoscape init ────────────────────────────────────────────────────────────
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements:  _cyElements,
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
    // ADR-114: Hindustani musician nodes get a cool-colour (slate-blue) border
    // Note: Cytoscape does not support CSS var() in style maps — use literal value.
    {
      selector: 'node[is_hindustani = 1]',
      style: {
        'border-color': '#8fb4d8',
        'border-width': '3px',
        'border-style': 'dashed',
      }
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
        'z-index':             0,
      }
    },
    // ADR-138 D4: transitive edge — bulged bezier, thinner stroke, same colour.
    // The perpendicular bulge (30px mid-control-point) is the sole visual signal
    // that this connection passes through ≥1 contentless transit musician.
    {
      selector: 'edge[kind = "transitive"]',
      style: {
        'curve-style':             'unbundled-bezier',
        'control-point-distances': 30,
        'control-point-weights':   0.5,
        'target-arrow-shape':      'triangle',
        'target-arrow-color':      THEME.edgeArrow,
        'line-color':              THEME.edgeLine,
        'width':                   'data(width)',
        'arrow-scale':             0.7,
        'opacity':                 THEME.opacityEdge,
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
    // Edges are invisible by default; override the generic .faded/.chip-faded rules
    // (element+class specificity beats class-only, so these always win)
    { selector: 'edge.faded',      style: { 'opacity': 0 } },
    { selector: 'edge.chip-faded', style: { 'opacity': 0 } },
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

  // ADR-134 D4: create lineage empty-state overlay for filter combinations
  // that yield zero visible connected nodes.
  (function () {
    const wrap = document.getElementById('cy-wrap');
    if (!wrap) return;
    const msg = document.createElement('div');
    msg.id = 'cy-lineage-empty-msg';
    msg.setAttribute('aria-live', 'polite');
    msg.style.cssText = [
      'display:none', 'position:absolute', 'top:50%', 'left:50%',
      'transform:translate(-50%,-50%)', 'text-align:center',
      'color:var(--fg-sub)', 'padding:1.5rem', 'pointer-events:none',
      'max-width:320px', 'font-size:0.85rem', 'line-height:1.5',
    ].join(';');
    msg.textContent = (typeof window.LINEAGE_FILTER_EMPTY_TEXT === 'string')
      ? window.LINEAGE_FILTER_EMPTY_TEXT
      : 'No musicians match these filters. Musicians without recordings or compositions are not shown on this canvas \u2014 find them by name in the search bar, or see all lineages in the Mela-Janya view.';
    wrap.appendChild(msg);
  }());
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

// The three roots of the Guru-Shishya tree — shown by default with no filters.
const TRINITY_IDS = new Set(['tyagaraja', 'muthuswami_dikshitar', 'shyama_shastri']);

// True when no era/instrument filters are active (unfiltered default view).
function _isDefaultView() {
  return activeFilters.era.size === 0 && activeFilters.instrument.size === 0;
}

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

  // Per-group clear item — shown only when that group has active selections
  ['era', 'instr'].forEach(prefix => {
    const list  = document.getElementById(prefix + '-dropdown-list');
    const group = prefix === 'era' ? 'era' : 'instrument';
    const sep   = document.createElement('li');
    sep.className = 'filter-dropdown-item filter-dropdown-clear';
    sep.id = prefix + '-clear-item';
    sep.setAttribute('role', 'option');
    sep.setAttribute('hidden', '');
    sep.textContent = '\u00d7 Clear';
    sep.addEventListener('click', () => clearGroupFilter(group));
    list.appendChild(sep);
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
  applyZoomLabels();
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
  const eraClearItem   = document.getElementById('era-clear-item');
  const instrClearItem = document.getElementById('instr-clear-item');
  if (eraClearItem)   eraClearItem.hidden   = eraCount   === 0;
  if (instrClearItem) instrClearItem.hidden = instrCount === 0;
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

  // ADR-134 D4: show empty-state hint when the filter yields no visible nodes.
  const anyVisible = cy.nodes().some(n => !n.hasClass('chip-faded'));
  _setLineageEmptyMsg(!anyVisible);
}

function clearGroupFilter(group) {
  activeFilters[group].clear();
  const prefix = group === 'era' ? 'era' : 'instr';
  const list = document.getElementById(prefix + '-dropdown-list');
  const btn  = document.getElementById(prefix + '-dropdown-btn');
  if (list) {
    list.querySelectorAll('.filter-dropdown-item[aria-selected="true"]')
        .forEach(i => i.setAttribute('aria-selected', 'false'));
    list.hidden = true;
  }
  if (btn) btn.setAttribute('aria-expanded', 'false');
  _updateFilterBtnLabels();
  applyChipFilters();
  applyZoomLabels();
}

function clearAllChipFilters() {
  activeFilters.era.clear();
  activeFilters.instrument.clear();
  document.querySelectorAll('.filter-dropdown-item[aria-selected="true"]')
    .forEach(i => i.setAttribute('aria-selected', 'false'));
  cy.elements().removeClass('chip-faded');
  _updateFilterBtnLabels();
  setScopeLabels(false);
  _setLineageEmptyMsg(false);
  applyZoomLabels();
}

// ADR-134 D4: toggle the lineage-empty overlay on the cy canvas.
function _setLineageEmptyMsg(show) {
  const msg = document.getElementById('cy-lineage-empty-msg');
  if (msg) msg.style.display = show ? 'block' : 'none';
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
  if (TRINITY_IDS.has(node.id()) || node.id() === 'vina_dhanammal') chip.classList.add('chip-trinity');
  chip.style.setProperty('--chip-era-bg', tint.bg);
  chip.style.setProperty('--chip-era-border', tint.border);
  // ADR-114: visually distinguish Hindustani musician chips with cool-colour border
  if (d.is_hindustani) {
    chip.classList.add('hindustani-musician');
    chip.style.setProperty('--chip-era-border', 'var(--her-chip-accent, #8fb4d8)');
  }
  if (d.instrument) chip.appendChild(makeInstrBadge(d.instrument));
  chip.appendChild(document.createTextNode(d.label));
  chip.title = d.label + (d.lifespan ? ' · ' + d.lifespan : '');
  chip.dataset.nodeId = node.id();
  // ADR-142 §1: canvas overlay chip is an entity chip for the musician
  if (typeof applyChipRole === 'function') applyChipRole(chip, 'entity', 'musician', node.id());
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
  const defaultView = _isDefaultView();

  // Use _currentPanelNodeId (set by ALL selectNode paths: canvas tap, chip click,
  // history nav, search) rather than cy ':selected' (only set by canvas taps).
  const focusedId = defaultView ? _currentPanelNodeId : null;
  const neighborIds = new Set();
  if (focusedId) {
    const focused = cy.getElementById(focusedId);
    if (focused && focused.length) {
      focused.neighborhood().nodes().forEach(nb => neighborIds.add(nb.id()));
    }
  }

  cy.nodes().forEach(n => {
    const chip = _cyChipMap.get(n.id());
    if (!chip) return;
    const tier       = n.data('label_tier');
    const selected   = n.selected();
    const isTrinity  = TRINITY_IDS.has(n.id());
    const isAnchor   = isTrinity || n.id() === 'vina_dhanammal';
    const isFocused  = n.id() === focusedId;
    const isNeighbor = neighborIds.has(n.id());

    // Default (no filters): show Trinity + Vina Dhanammal, the focused node, and its direct neighbors.
    // Filtered / zoomed: use tier-based zoom thresholds.
    const show = defaultView
      ? (isAnchor || isFocused || isNeighbor)
      : (selected ||
         tier === 0 ||
         (tier === 1 && z >= 0.35) ||
         (tier === 2 && z >= 0.60));
    chip.classList.toggle('chip-hidden', !show);

    // Default view only: dim every node that is not an anchor (Trinity or Vina Dhanammal),
    // not focused, and not a direct neighbor of the focused node.
    // In filter mode, applyChipFilters() owns chip-faded — don't clobber it.
    if (defaultView) {
      n.toggleClass('chip-faded', !isAnchor && !isFocused && !isNeighbor);
    }
  });

  // Edges: dim all in default view, but un-dim edges connected to the focused node.
  if (defaultView) {
    cy.edges().addClass('chip-faded');
    if (focusedId) {
      cy.getElementById(focusedId).connectedEdges().removeClass('chip-faded');
    }
  }
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
  // Un-dim the selected node in default view.
  applyZoomLabels();
});
cy.on('unselect', 'node', evt => {
  const chip = _cyChipMap.get(evt.target.id());
  if (chip) chip.classList.remove('chip-selected');
  // Re-run label visibility: in default view a deselected non-Trinity node
  // should be hidden again.
  applyZoomLabels();
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

// ── ADR-138 D4: hover tooltip for transitive (bulged) edges ──────────────────
// Shows the names of all collapsed transit musicians on hover.
cy.on('mouseover', 'edge[kind = "transitive"]', function (evt) {
  const d = evt.target.data();
  const names = (d.transit_names || []).join(', ');
  document.getElementById('hp-name').textContent = 'via ' + (names || 'intermediate musician');
  document.getElementById('hp-sub').textContent = 'Transmitted lineage \u2014 click for details';
  popover.style.display = 'block';
});
cy.on('mouseout', 'edge[kind = "transitive"]', function () {
  popover.style.display = 'none';
});
cy.on('mousemove', 'edge[kind = "transitive"]', function (evt) {
  const x = evt.originalEvent.clientX, y = evt.originalEvent.clientY;
  const pw = popover.offsetWidth  || 200;
  const ph = popover.offsetHeight || 60;
  popover.style.left = (x + 16 + pw > window.innerWidth  ? x - pw - 10 : x + 16) + 'px';
  popover.style.top  = (y + 16 + ph > window.innerHeight ? y - ph - 10 : y + 16) + 'px';
});

// ── Hover tooltip for direct (non-transitive) guru-shishya edges ──────────────
cy.on('mouseover', 'edge[kind != "transitive"]', function (evt) {
  const e = evt.target;
  const shishya = e.target().data('label') || '';
  const guru    = e.source().data('label') || '';
  document.getElementById('hp-name').textContent = shishya + ' is shishya of ' + guru;
  document.getElementById('hp-sub').textContent  = 'Guru\u2013shishya relationship';
  popover.style.display = 'block';
});
cy.on('mouseout', 'edge[kind != "transitive"]', function () {
  popover.style.display = 'none';
});
cy.on('mousemove', 'edge[kind != "transitive"]', function (evt) {
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

// ── ADR-137: Lineage traversal helpers ───────────────────────────────────────
// Pure functions over the raw `elements` array (includes transit musicians).

// Returns array of musician data objects who taught nodeId (gurus).
function gurusOf(nodeId) {
  var guruIds = [];
  elements.forEach(function (el) {
    if (el.data.source !== undefined && el.data.target === nodeId) {
      guruIds.push(el.data.source);
    }
  });
  return guruIds.map(function (id) {
    var node = elements.find(function (e) { return e.data.source === undefined && e.data.id === id; });
    return node ? node.data : null;
  }).filter(Boolean);
}

// Returns array of musician data objects taught by nodeId (shishyas).
function shishyasOf(nodeId) {
  var shishyaIds = [];
  elements.forEach(function (el) {
    if (el.data.source !== undefined && el.data.source === nodeId) {
      shishyaIds.push(el.data.target);
    }
  });
  return shishyaIds.map(function (id) {
    var node = elements.find(function (e) { return e.data.source === undefined && e.data.id === id; });
    return node ? node.data : null;
  }).filter(Boolean);
}

// Builds a single era-tinted lineage chip for musician data `d`.
// Dims chips for musicians with no content (recordings/lecdems) per ADR-137/138.
function _makeLineageChip(d) {
  var tint = THEME.eraTintCss(d.era || null);
  var chip = document.createElement('span');
  chip.className = 'lineage-chip';
  chip.style.setProperty('--chip-era-bg', tint.bg);
  chip.style.setProperty('--chip-era-border', tint.border);
  if (d.is_hindustani) {
    chip.classList.add('hindustani-musician');
    chip.style.setProperty('--chip-era-border', 'var(--her-chip-accent, #8fb4d8)');
  }
  // Dim if not content-bearing (no recordings / lecdems)
  var isContentBearing = window._contentBearingIds && window._contentBearingIds.has(d.id);
  if (!isContentBearing) chip.classList.add('chip-dimmed');

  if (d.instrument && typeof makeInstrBadge === 'function') {
    chip.appendChild(makeInstrBadge(d.instrument));
  }
  chip.appendChild(document.createTextNode(d.label || d.id));
  chip.title = (d.label || d.id) +
               (d.instrument ? ' \u00b7 ' + d.instrument : '') +
               (d.lifespan   ? ' \u00b7 ' + d.lifespan   : '') +
               (!isContentBearing ? ' \u00b7 no recordings' : '');

  chip.addEventListener('click', function (e) {
    e.stopPropagation();
    // Close the popup when navigating to another musician
    var pop = document.getElementById('lineage-popup');
    if (pop) pop.style.display = 'none';
    chip.classList.add('chip-tapped');
    setTimeout(function () { chip.classList.remove('chip-tapped'); }, 200);
    var n = cy.getElementById(d.id);
    if (n && n.length) {
      if (typeof orientToNode === 'function' &&
          typeof currentView !== 'undefined' && currentView === 'graph') {
        orientToNode(d.id);
      } else {
        selectNode(n);
      }
    } else {
      _openMusicianPanelForTransit(d.id);
    }
    if (typeof window.setPanelState === 'function') {
      setTimeout(function () { window.setPanelState('MUSICIAN'); }, 50);
    }
  });
  return chip;
}

// ── ADR-137: Lineage popup system ─────────────────────────────────────────────
// Replaces the full panel sections with a compact ⇅ N button in the header
// chip row. Clicking opens a floating popup with Gurus and Shishyas chip rows.
(function () {
  var _pop = document.getElementById('lineage-popup');
  if (!_pop) return;

  // Sort musicians: gurus oldest first, shishyas youngest first.
  function _sorted(musicians, role) {
    return musicians.slice().sort(function (a, b) {
      var hasA = a.born != null, hasB = b.born != null;
      if (hasA && hasB) return role === 'guru' ? a.born - b.born : b.born - a.born;
      if (hasA) return -1;
      if (hasB) return 1;
      return (a.label || '').localeCompare(b.label || '');
    });
  }

  function _populatePopup(gurus, shishyas) {
    _pop.innerHTML = '';

    function addSection(glyph, label, musicians, role) {
      var hdr = document.createElement('div');
      hdr.className = 'lineage-pop-hdr';
      hdr.textContent = glyph + '\u00a0' + label + ' (' + musicians.length + ')';
      _pop.appendChild(hdr);

      var sorted = _sorted(musicians, role);
      var row = document.createElement('div');
      row.className = 'lineage-chip-row';
      if (sorted.length === 0) {
        var none = document.createElement('span');
        none.className = 'lineage-none-label';
        none.textContent = 'None recorded';
        row.appendChild(none);
      } else {
        sorted.forEach(function (d) { row.appendChild(_makeLineageChip(d)); });
      }
      _pop.appendChild(row);
    }

    addSection('\u2191', 'Gurus',    gurus,    'guru');    // ↑
    var sep = document.createElement('hr');
    sep.className = 'lineage-pop-sep';
    _pop.appendChild(sep);
    addSection('\u2193', 'Shishyas', shishyas, 'shishya'); // ↓
  }

  // Close on outside click (capture phase, same as transit popover pattern).
  document.addEventListener('click', function (e) {
    var btn = document.getElementById('lineage-popup-btn');
    if (!_pop.contains(e.target) && e.target !== btn) {
      _pop.style.display = 'none';
    }
  }, true);

  // Exposed: update button label + attach click handler for current musician.
  window._setupLineagePopupBtn = function (nodeId) {
    var btn = document.getElementById('lineage-popup-btn');
    if (!btn) return;
    var gurus    = gurusOf(nodeId);
    var shishyas = shishyasOf(nodeId);
    var total = gurus.length + shishyas.length;
    if (total === 0) {
      btn.style.display = 'none';
      _pop.style.display = 'none';
      return;
    }
    btn.textContent = '\u21c5\u00a0' + total; // ⇅ N
    btn.title = gurus.length + ' guru' + (gurus.length !== 1 ? 's' : '') +
                ', ' + shishyas.length + ' shishya' + (shishyas.length !== 1 ? 's' : '');
    btn.style.display = 'inline-flex';
    btn.onclick = function (e) {
      e.stopPropagation();
      if (_pop.style.display !== 'none') { _pop.style.display = 'none'; return; }
      _populatePopup(gurus, shishyas);
      // Position below the button, aligned to its left edge, within viewport.
      _pop.style.display = 'block';
      var rect = btn.getBoundingClientRect();
      var pw = _pop.offsetWidth  || 200;
      var ph = _pop.offsetHeight || 100;
      var left = rect.left;
      var top  = rect.bottom + 5;
      if (left + pw > window.innerWidth)  left = window.innerWidth  - pw - 8;
      if (top  + ph > window.innerHeight) top  = rect.top - ph - 5;
      _pop.style.left = Math.max(4, left) + 'px';
      _pop.style.top  = Math.max(4, top)  + 'px';
    };
  };
}());

// Populates #lineage-panel with Gurus and Shishyas sections for nodeId.
function buildLineagePanel(nodeId) {
  if (typeof window._setupLineagePopupBtn === 'function') {
    window._setupLineagePopupBtn(nodeId);
  }
}

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
  // ADR-114: cool-colour border on panel chip for Hindustani musicians
  if (d.is_hindustani) {
    nameChip.classList.add('hindustani-musician');
    nameChip.style.setProperty('--chip-era-border', 'var(--her-chip-accent, #8fb4d8)');
  }
  if (d.instrument) nameChip.appendChild(makeInstrBadge(d.instrument));
  nameChip.appendChild(document.createTextNode(d.label));
  nameChip.title = 'Pan to ' + d.label + ' on graph (' + (d.instrument || '') + ')';
  nameChip.onclick = () => orientToNode(node.id());
  // ADR-142 §1: panel-title chip for the Musician panel
  if (typeof applyChipRole === 'function') applyChipRole(nameChip, 'panel-title', 'musician', node.id());
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
  // ADR-128 D2: show affordances row (lifespan + wiki) whenever a node is selected
  const _nodeAffordances = document.getElementById('node-header-affordances');
  if (_nodeAffordances) _nodeAffordances.style.display = '';
  // ADR-086: subject loaded → dismiss empty-panel tutorial
  if (typeof window.dismissPanelHelp === 'function') window.dismissPanelHelp('musician');
  if (typeof window.hidePanelTutorial === 'function') window.hidePanelTutorial('musician');

  // Clear filter and rebuild unified recordings list
  const recFilter = document.getElementById('rec-filter');
  recFilter.value = '';
  recFilter.dispatchEvent(new Event('input'));

  buildRecordingsList(d.id, d);
  const _rightScroll = document.getElementById('right-scroll');
  if (_rightScroll) _rightScroll.scrollTop = 0;
  // ADR-137: populate Gurus / Shishyas lineage sections
  buildLineagePanel(d.id);

  cy.elements().addClass('faded');
  node.removeClass('faded');
  node.connectedEdges().removeClass('faded').addClass('highlighted');
  node.connectedEdges().connectedNodes().removeClass('faded');
  // Sync chip-faded / label visibility for ALL entry paths (canvas tap, chip
  // click, history nav, search). _currentPanelNodeId is already set above.
  applyZoomLabels();

  // ADR-046: open right drawer on any screen width when a node is selected.
  // Mobile first-tap suppresses reveal — panel is pre-populated, surfaced on
  // the second tap (see node-tap handler below).
  if (revealPanel && typeof window.setPanelState === 'function') {
    window.setPanelState('MUSICIAN');
  }

  // ADR-142 §1 Phase A: tag any chip in the freshly-rebuilt Musician panel
  // that didn't get an explicit applyChipRole at its construction site.
  // Behaviour-neutral; the dispatcher (Phase B) reads these attributes.
  if (typeof tagUntaggedChips === 'function') {
    tagUntaggedChips(document.body);
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

// ── ADR-138 D4: open musician panel for a transit (culled) node ───────────────
// Transit musicians are not in the Cytoscape graph so selectNode() can't be
// used directly. This helper populates the right-sidebar panel from the raw
// elements array instead. It mirrors the panel-population logic in selectNode
// without the cy graph-highlight side-effects.
function _openMusicianPanelForTransit(transitId) {
  const el = elements.find(function (e) { return !e.data.source && e.data.id === transitId; });
  if (!el) return;
  const d = el.data;

  _currentPanelNodeId = transitId;
  _updatePanelNavButtons();

  const nameEl = document.getElementById('node-name');
  nameEl.innerHTML = '';
  const tint = THEME.eraTintCss(d.era || null);
  const nameChip = document.createElement('span');
  nameChip.className = 'musician-chip';
  nameChip.style.setProperty('--chip-era-bg', tint.bg);
  nameChip.style.setProperty('--chip-era-border', tint.border);
  if (d.instrument && typeof makeInstrBadge === 'function') {
    nameChip.appendChild(makeInstrBadge(d.instrument));
  }
  nameChip.appendChild(document.createTextNode(d.label || transitId));
  nameEl.appendChild(nameChip);
  if (typeof applyChipRole === 'function') applyChipRole(nameChip, 'panel-title', 'musician', transitId);

  document.getElementById('node-lifespan').textContent = d.lifespan || '';

  const wikiLink = document.getElementById('node-wiki-link');
  const primarySrc = d.sources && d.sources.length > 0 ? d.sources[0] : null;
  if (primarySrc) {
    wikiLink.href          = primarySrc.url;
    wikiLink.title         = primarySrc.label;
    wikiLink.style.display = 'inline';
  } else {
    wikiLink.style.display = 'none';
  }

  document.getElementById('node-info').style.display = 'block';
  document.getElementById('edge-info').style.display = 'none';
  const _affordances = document.getElementById('node-header-affordances');
  if (_affordances) _affordances.style.display = '';
  if (typeof window.dismissPanelHelp === 'function') window.dismissPanelHelp('musician');
  if (typeof window.hidePanelTutorial === 'function') window.hidePanelTutorial('musician');

  const recFilter = document.getElementById('rec-filter');
  recFilter.value = '';
  recFilter.dispatchEvent(new Event('input'));

  buildRecordingsList(transitId, d);
  const _rightScrollT = document.getElementById('right-scroll');
  if (_rightScrollT) _rightScrollT.scrollTop = 0;
  // ADR-137: populate Gurus / Shishyas lineage sections
  buildLineagePanel(transitId);

  if (typeof window.setPanelState === 'function') window.setPanelState('MUSICIAN');
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
      const titleText        = (li.querySelector('.yt-label-chip')  || {}).textContent || '';
      const compChipText     = (li.querySelector('.comp-chip')     || {}).textContent || '';
      const ragaChipText     = (li.querySelector('.raga-chip')     || {}).textContent || '';
      const metaText         = (li.querySelector('.rec-meta')      || {}).textContent || '';
      const composerChipText = (li.querySelector('.composer-chip') || {}).textContent || '';
      const matches   = [titleText, compChipText, ragaChipText, metaText, composerChipText]
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
      const titleText = (node.querySelector('.yt-label-chip')  || {}).textContent || '';
      const composerText = (node.querySelector('.composer-chip') || {}).textContent || '';
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
    const titleText        = (li.querySelector('.yt-label-chip')  || {}).textContent || '';
    const compChipText     = (li.querySelector('.comp-chip')     || {}).textContent || '';
    const ragaChipText     = (li.querySelector('.raga-chip')     || {}).textContent || '';
    const composerChipText = (li.querySelector('.composer-chip') || {}).textContent || '';
    const matches   = [titleText, compChipText, ragaChipText, composerChipText]
                      .some(t => t.toLowerCase().includes(q));
    li.style.display = matches ? 'flex' : 'none';
    if (matches) anyVisible = true;
  });

  // ── lecdem sections (ADR-080) ─────────────────────────────────────────────
  recList.querySelectorAll('.lecdem-section').forEach(section => {
    let sectionHasMatch = false;

    section.querySelectorAll('.lecdem-subsection').forEach(subsec => {
      let subsecHasMatch = false;

      subsec.querySelectorAll('li.lecdem-row').forEach(li => {
        if (!q) {
          li.style.display = '';
          subsecHasMatch = true;
          return;
        }
        const labelText    = (li.querySelector('.yt-label-chip')   || {}).textContent || '';
        const subjectsText = (li.querySelector('.lecdem-subjects')  || {}).textContent || '';
        const matches = [labelText, subjectsText].some(t => t.toLowerCase().includes(q));
        li.style.display = matches ? '' : 'none';
        if (matches) subsecHasMatch = true;
      });

      subsec.style.display = (!q || subsecHasMatch) ? '' : 'none';
      if (!q || subsecHasMatch) sectionHasMatch = true;
    });

    section.style.display = (!q || sectionHasMatch) ? '' : 'none';
    if (!q || sectionHasMatch) anyVisible = true;
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

  // ── Lecdem strip (ADR-081): narrow chips within the strip, do not expose
  // lecdems to global search (discoverability invariant §6a is preserved). ───
  // Runs unconditionally — the strip is separate from #trail-list and must
  // respond regardless of whether the trail is in tree or flat mode.
  const lecdemStrip = document.getElementById('bani-lecdem-strip');
  if (lecdemStrip) {
    if (!q) {
      lecdemStrip.querySelectorAll('.lecdem-chip').forEach(function(chip) {
        chip.style.display = '';
      });
      if (lecdemStrip.querySelectorAll('.lecdem-chip').length > 0) {
        lecdemStrip.style.display = '';
      }
    } else {
      let stripHasMatch = false;
      lecdemStrip.querySelectorAll('.lecdem-chip').forEach(function(chip) {
        const matches = chip.textContent.toLowerCase().includes(q);
        chip.style.display = matches ? '' : 'none';
        if (matches) stripHasMatch = true;
      });
      lecdemStrip.style.display = stripHasMatch ? '' : 'none';
    }
  }

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
      const headerComp     = (group.querySelector(':scope > .tree-group-header .comp-chip')      || {}).textContent || '';
      const headerMusc     = (group.querySelector(':scope > .tree-group-header .musician-chip')  || {}).textContent || '';
      const headerLabel    = (group.querySelector(':scope > .tree-group-header .trail-label')    || {}).textContent || '';
      const headerComposer = (group.querySelector(':scope > .tree-group-header .composer-chip')  || {}).textContent || '';
      const leaves = group.querySelectorAll('li.tree-leaf');
      let groupMatches = false;

      leaves.forEach(function(leaf) {
        const primaryText  = (leaf.querySelector('.musician-chip') || {}).textContent || '';
        const coTexts      = [...leaf.querySelectorAll('.trail-artist-co')].map(function(el) { return el.textContent; }).join(' ');
        const labelText    = (leaf.querySelector('.trail-label')    || {}).textContent || '';
        const leafMatch = [primaryText, coTexts, headerComp, headerMusc, headerLabel, headerComposer, labelText]
          .some(function(t) { return t.toLowerCase().includes(q); });
        leaf.style.display = leafMatch ? '' : 'none';
        if (leafMatch) groupMatches = true;
      });

      // Header itself matches (e.g. typed composition title or composer name) → show all leaves
      const headerMatch = [headerComp, headerMusc, headerLabel, headerComposer]
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
    const primaryText      = (li.querySelector('.trail-artist-primary') || {}).textContent || '';
    const coTexts          = [...li.querySelectorAll('.trail-artist-co')].map(function(el) { return el.textContent; }).join(' ');
    const compChipText     = (li.querySelector('.comp-chip')      || {}).textContent || '';
    const ragaChipText     = (li.querySelector('.raga-chip')      || {}).textContent || '';
    const composerChipText = (li.querySelector('.composer-chip')  || {}).textContent || '';
    const labelText        = (li.querySelector('.trail-label')    || {}).textContent || '';
    const matches          = [primaryText, coTexts, compChipText, ragaChipText, composerChipText, labelText]
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

// ── ADR-138 D4: transitive edge tap — show transit-musician chip popover ──────
// Creates a floating popover near the click point listing each collapsed transit
// musician as a chip. Each chip opens that musician's panel via
// _openMusicianPanelForTransit (transit nodes are not in the cy graph).
(function () {
  // Build the popover element once; reuse on subsequent taps.
  const _transitPop = document.createElement('div');
  _transitPop.id = 'transit-edge-popover';
  _transitPop.style.cssText = [
    'display:none', 'position:fixed', 'z-index:9999',
    'background:var(--bg-panel,#1e1e1e)', 'border:1px solid var(--border-strong,#444)',
    'border-radius:6px', 'padding:0.5rem 0.75rem', 'max-width:260px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.4)', 'font-size:0.8rem',
  ].join(';');
  document.body.appendChild(_transitPop);

  // Close on outside click.
  document.addEventListener('click', function (e) {
    if (!_transitPop.contains(e.target)) _transitPop.style.display = 'none';
  }, true);

  cy.on('tap', 'edge[kind = "transitive"]', function (evt) {
    const d = evt.target.data();
    const transitIds    = d.transit      || [];
    const transitNames  = d.transit_names || transitIds;
    _transitPop.innerHTML = '';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:0.7rem;color:var(--fg-sub,#888);margin-bottom:0.35rem;';
    hdr.textContent = 'Transmitted via';
    _transitPop.appendChild(hdr);

    transitIds.forEach(function (tid, i) {
      const name  = transitNames[i] || tid;
      // Look up era for tinting.
      const rawEl = elements.find(function (e) { return !e.data.source && e.data.id === tid; });
      const eraId = rawEl ? (rawEl.data.era || null) : null;
      const tint  = THEME.eraTintCss(eraId);
      const chip  = document.createElement('span');
      chip.className = 'musician-chip chip-navigable';
      chip.style.setProperty('--chip-era-bg',     tint.bg);
      chip.style.setProperty('--chip-era-border', tint.border);
      chip.textContent = name;
      chip.title = name + ' \u2014 Open Musician panel';
      chip.style.display = 'inline-block';
      chip.style.margin  = '2px 2px 2px 0';
      chip.style.cursor  = 'pointer';
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        _transitPop.style.display = 'none';
        _openMusicianPanelForTransit(tid);
      });
      _transitPop.appendChild(chip);
    });

    // Position near the click point, staying within viewport.
    const oe = evt.originalEvent;
    const px = oe.clientX, py = oe.clientY;
    _transitPop.style.display = 'block';
    const pw = _transitPop.offsetWidth  || 200;
    const ph = _transitPop.offsetHeight || 80;
    _transitPop.style.left = (px + 12 + pw > window.innerWidth  ? px - pw - 8  : px + 12) + 'px';
    _transitPop.style.top  = (py + 12 + ph > window.innerHeight ? py - ph - 8  : py + 12) + 'px';
  });
}());

// ── background tap ────────────────────────────────────────────────────────────
cy.on('tap', evt => {
  if (evt.target !== cy) return;
  // If the full-mobile player is open, this tap means the user wants to keep exploring —
  // collapse the player only, leave graph/panel state untouched.
  if (typeof window._collapseMobilePlayer === 'function' &&
      document.querySelector('.media-player.full-mobile')) {
    window._collapseMobilePlayer(false);
    return;
  }
  _focusedGraphNode = null;
  _currentPanelNodeId = null;   // clear focus so applyZoomLabels re-dims everything
  cy.elements().removeClass('faded highlighted');
  document.getElementById('node-name').textContent          = '—'; // clear chip
  document.getElementById('node-lifespan').textContent      = '';
  document.getElementById('node-wiki-link').style.display   = 'none';
  const _nodeAffordancesBgTap = document.getElementById('node-header-affordances');
  if (_nodeAffordancesBgTap) _nodeAffordancesBgTap.style.display = 'none';
  document.getElementById('rec-filter').style.display       = 'none';
  document.getElementById('rec-filter').value               = '';
  document.getElementById('node-info').style.display        = 'block';
  var _lgBgTap = document.getElementById('lineage-popup-btn');
  if (_lgBgTap) { _lgBgTap.style.display = 'none'; _lgBgTap.onclick = null; }
  var _lgPopBgTap = document.getElementById('lineage-popup');
  if (_lgPopBgTap) _lgPopBgTap.style.display = 'none';
  document.getElementById('recordings-panel').style.display = 'none';
  document.getElementById('edge-info').style.display        = 'none';
  // ADR-086: subject cleared → restore empty-panel tutorial
  if (typeof window.showPanelTutorial === 'function') window.showPanelTutorial('musician');
  // Note: era/instrument dropdown filters are intentionally NOT cleared on background tap —
  // they are a persistent selection the user must clear explicitly via the Clear button.
  applyZoomLabels();
  // ADR-034: dismiss bottom sheet on mobile when canvas background is tapped
  if (typeof dismissBottomSheet === 'function') dismissBottomSheet();
});

// ── Panel reset — exposed for the reset button in #musician-panel h3 ─────────
window.clearMusicianPanel = function () {
  _focusedGraphNode = null;
  _currentPanelNodeId = null;   // clear focus so applyZoomLabels re-dims everything
  cy.elements().removeClass('faded highlighted');
  document.getElementById('node-name').textContent          = '—';
  document.getElementById('node-lifespan').textContent      = '';
  document.getElementById('node-wiki-link').style.display   = 'none';
  const _nodeAffordancesReset = document.getElementById('node-header-affordances');
  if (_nodeAffordancesReset) _nodeAffordancesReset.style.display = 'none';
  document.getElementById('rec-filter').style.display       = 'none';
  document.getElementById('rec-filter').value               = '';
  document.getElementById('node-info').style.display        = 'block';
  var _lgReset = document.getElementById('lineage-popup-btn');
  if (_lgReset) { _lgReset.style.display = 'none'; _lgReset.onclick = null; }
  var _lgPopReset = document.getElementById('lineage-popup');
  if (_lgPopReset) _lgPopReset.style.display = 'none';
  document.getElementById('recordings-panel').style.display = 'none';
  document.getElementById('edge-info').style.display        = 'none';
  if (typeof window.showPanelTutorial === 'function') window.showPanelTutorial('musician');
  if (typeof clearAllChipFilters === 'function') clearAllChipFilters();
  if (typeof applyZoomLabels === 'function') applyZoomLabels();
};

// ── Trinity triangle layout ───────────────────────────────────────────────────
// Places the three Trinity composers at equilateral triangle vertices, locks
// them, then re-runs cose so all other nodes cluster around the anchors.
// Radius is computed from the current container size so the triangle fills the
// viewport; after the layout settles, cy.fit() is called to maximise real estate.
// Vertex angles (y-axis points DOWN in Cytoscape, so −π/2 = top)
const _TRINITY_VERTS = {
  tyagaraja:           -Math.PI / 2,                  // top
  muthuswami_dikshitar: -Math.PI / 2 + (2 * Math.PI / 3), // bottom-right
  shyama_shastri:       -Math.PI / 2 + (4 * Math.PI / 3), // bottom-left
};

function applyTrinityTriangleLayout() {
  cy.nodes().unlock();

  const R  = 550;   // triangle circumradius
  const cx = 0, cy_ = 0;

  const CENTRE_ID  = 'vina_dhanammal';
  const _anchorIds = new Set([...TRINITY_IDS, CENTRE_ID]);

  // ── Fixed anchor positions ────────────────────────────────────────────────
  const anchorPos = {};
  TRINITY_IDS.forEach(id => {
    const a = _TRINITY_VERTS[id];
    anchorPos[id] = { x: cx + R * Math.cos(a), y: cy_ + R * Math.sin(a) };
    cy.getElementById(id).position(anchorPos[id]).lock();
  });
  const cp = cy.getElementById(CENTRE_ID);
  if (cp.length) {
    anchorPos[CENTRE_ID] = { x: cx, y: cy_ };
    cp.position({ x: cx, y: cy_ }).lock();
  }

  // ── BFS ordering so students land near their guru ─────────────────────────
  const ordered = [];
  const bfsVisited = new Set(_anchorIds);
  const bfsQ = [...TRINITY_IDS];
  while (bfsQ.length) {
    const id = bfsQ.shift();
    cy.getElementById(id).connectedEdges().connectedNodes().forEach(nb => {
      const nid = nb.id();
      if (!bfsVisited.has(nid)) {
        bfsVisited.add(nid);
        ordered.push(nid);
        bfsQ.push(nid);
      }
    });
  }
  cy.nodes().forEach(n => { if (!bfsVisited.has(n.id())) ordered.push(n.id()); });

  // ── Poisson disc sampling within the circumscribed circle ────────────────
  // Each node tries MAX_TRIES random positions and picks the first that is
  // at least MIN_DIST from every already-placed node.  This guarantees spacing
  // without any physics.  Fallback: golden-angle spiral from centre.
  const MIN_DIST  = 44;   // min gap between any two nodes (graph units)
  const MAX_TRIES = 60;
  const placed    = Object.values(anchorPos);  // collision check includes anchors
  const positions = { ...anchorPos };

  ordered.forEach(nid => {
    let pos = null;
    for (let t = 0; t < MAX_TRIES; t++) {
      const a  = Math.random() * 2 * Math.PI;
      const r  = R * Math.sqrt(Math.random());   // uniform-area distribution
      const px = cx + r * Math.cos(a);
      const py = cy_ + r * Math.sin(a);
      let ok = true;
      for (const p of placed) {
        const dx = px - p.x, dy = py - p.y;
        if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) { ok = false; break; }
      }
      if (ok) { pos = { x: px, y: py }; break; }
    }
    if (!pos) {
      // Fallback: golden-angle spiral — guaranteed non-overlapping for large n
      const i  = placed.length;
      const r  = MIN_DIST * Math.sqrt(i);
      const a  = i * (137.508 * Math.PI / 180);
      pos = { x: cx + r * Math.cos(a), y: cy_ + r * Math.sin(a) };
    }
    positions[nid] = pos;
    placed.push(pos);
  });

  // ── Preset layout — no physics, pure position assignment ─────────────────
  cy.style().selector('edge[kind = "transitive"]')
    .style({ 'control-point-distances': 30 }).update();

  cy.layout({
    name: 'preset',
    positions: node => positions[node.id()] || { x: cx, y: cy_ },
    animate: true,
    animationDuration: 800,
    fit: true,
    padding: 60,
  }).on('layoutstop', () => {
    cy.fit(undefined, 60);
    if (typeof applyZoomLabels === 'function') applyZoomLabels();
  }).run();
}


// ── controls ──────────────────────────────────────────────────────────────────
function relayout() {
  if (currentLayout === 'timeline') { applyTimelineLayout(); return; }
  // Trinity is the base graph state — always re-run the trinity layout.
  currentLayout = 'trinity';
  applyTrinityTriangleLayout();
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

