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
        'label':              'data(label)',
        'font-family':            THEME.fontMono,
        'font-size':              'data(font_size)',
        'font-weight':            'data(font_weight)',
        'color':                  THEME.labelColor,
        'text-valign':            'bottom',
        'text-halign':            'center',
        'text-margin-y':          '8px',
        'text-wrap':              'wrap',
        'text-max-width':         '100px',
        'text-outline-color':     THEME.labelOutline,
        'text-outline-width':     '2px',
        'min-zoomed-font-size':   8,
        'text-background-color':  THEME.labelOutline,
        'text-background-opacity': THEME.labelBgOpacity,
        'text-background-padding': '3px',
        'text-background-shape':  'roundrectangle',
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
        'label': 'data(label)',
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
  applyZoomLabels();
  buildFilterChips();
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

// ── chip filter state ─────────────────────────────────────────────────────────
const activeFilters = { era: new Set(), instrument: new Set() };

function buildFilterChips() {
  const eraGroup   = document.getElementById('era-filter-group');
  const instrGroup = document.getElementById('instr-filter-group');

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
  eraOrder.forEach(era => {
    const chip = document.createElement('span');
    chip.className   = 'filter-chip';
    chip.dataset.key = era;
    chip.dataset.group = 'era';

    const dot = document.createElement('span');
    dot.className = 'chip-dot ellipse';
    dot.style.background = ERA_COLOURS[era] || 'var(--gray)';

    const label = document.createElement('span');
    label.textContent = eraLabels[era] || era;

    chip.appendChild(dot);
    chip.appendChild(label);
    chip.addEventListener('click', () => toggleFilterChip(chip));
    eraGroup.appendChild(chip);
  });

  const instrOrder = ['vocal', 'veena', 'violin', 'flute', 'mridangam'];
  const instrLabels = {
    vocal:     'Vocal',
    veena:     'Veena',
    violin:    'Violin',
    flute:     'Flute',
    mridangam: 'Mridangam',
  };
  instrOrder.forEach(instr => {
    const chip = document.createElement('span');
    chip.className   = 'filter-chip';
    chip.dataset.key = instr;
    chip.dataset.group = 'instrument';

    // Outline-only SVG icon — shape is the signal, no fill colour
    const iconWrap = document.createElement('span');
    iconWrap.className = 'chip-icon';
    iconWrap.appendChild(makeShapeSVG(INSTRUMENT_SHAPES[instr] || 'ellipse', 12));

    const label = document.createElement('span');
    label.textContent = instrLabels[instr] || instr;

    chip.appendChild(iconWrap);
    chip.appendChild(label);
    chip.addEventListener('click', () => toggleFilterChip(chip));
    instrGroup.appendChild(chip);
  });
}

function toggleFilterChip(chip) {
  const group = chip.dataset.group;
  const key   = chip.dataset.key;
  if (activeFilters[group].has(key)) {
    activeFilters[group].delete(key);
    chip.classList.remove('active');
  } else {
    activeFilters[group].add(key);
    chip.classList.add('active');
  }
  applyChipFilters();
}

function applyChipFilters() {
  // Mutual exclusion: clear Bani Flow filter when chip filter activates
  const eraActive   = activeFilters.era;
  const instrActive = activeFilters.instrument;
  const anyActive   = eraActive.size > 0 || instrActive.size > 0;

  if (anyActive && activeBaniFilter) {
    clearBaniFilter();
  }

  if (!anyActive) {
    cy.elements().removeClass('chip-faded');
    document.getElementById('filter-clear-all').style.visibility = 'hidden';
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

  document.getElementById('filter-clear-all').style.visibility = 'visible';
  setScopeLabels(true);
}

function clearAllChipFilters() {
  activeFilters.era.clear();
  activeFilters.instrument.clear();
  document.querySelectorAll('.filter-chip.active').forEach(c => c.classList.remove('active'));
  cy.elements().removeClass('chip-faded');
  document.getElementById('filter-clear-all').style.visibility = 'hidden';
  setScopeLabels(false);
}

function setScopeLabels(visible) {
  const display = visible ? 'block' : 'none';
  document.getElementById('musician-scope-label').style.display = display;
  document.getElementById('bani-scope-label').style.display     = display;
}

// ── zoom-tiered labels (word-cloud / cartographic style) ──────────────────────
// Font sizes are graph-space values — Cytoscape's viewport zoom scales them
// naturally. min-zoomed-font-size (set in style) hides labels that become
// too small on screen. We only control tier-based visibility here.
function applyZoomLabels() {
  const z = cy.zoom();
  cy.nodes().forEach(n => {
    if (n.selected()) return;
    const tier = n.data('label_tier');
    // Tier-0 (Trinity/Bridge): always visible
    // Tier-1 (Golden Age/Disseminator): show from z≥0.35
    // Tier-2 (Living Pillars/Contemporary): show from z≥0.60
    const show = tier === 0 ||
                 (tier === 1 && z >= 0.35) ||
                 (tier === 2 && z >= 0.60);
    n.style('label', show ? n.data('label') : '');
  });
}
cy.on('zoom', applyZoomLabels);

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

// ── selectNode — shared selection logic (sidebar + graph highlight) ───────────
function selectNode(node) {
  const d = node.data();

  // Collapsed single-line header
  const nameEl = document.getElementById('node-name');
  nameEl.textContent = d.label;
  nameEl.title = 'Pan to ' + d.label + ' on graph';
  nameEl.style.cursor = 'pointer';
  // Clicking the name re-centres the view on this node
  nameEl.onclick = () => orientToNode(node.id());

  document.getElementById('node-lifespan').textContent = d.lifespan || '';

  const shapeIcon = document.getElementById('node-shape-icon');
  shapeIcon.className = 'node-shape-icon';
  shapeIcon.innerHTML = '';
  shapeIcon.appendChild(makeShapeSVG(d.shape || 'ellipse', 12));

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

// ── rec-filter event listener — bracket-aware (ADR-018) ──────────────────────
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

  // ── legacy flat items ─────────────────────────────────────────────────────
  recList.querySelectorAll('li.rec-legacy').forEach(li => {
    if (!q) { li.style.display = 'flex'; anyVisible = true; return; }
    const titleText    = (li.querySelector('.rec-title')  || {}).textContent || '';
    const compChipText = (li.querySelector('.comp-chip')  || {}).textContent || '';
    const ragaChipText = (li.querySelector('.raga-chip')  || {}).textContent || '';
    const metaText     = (li.querySelector('.rec-meta')   || {}).textContent || '';
    const matches   = [titleText, compChipText, ragaChipText, metaText]
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
  const items     = trailList.querySelectorAll('li:not(.trail-no-match)');
  let anyVisible  = false;

  items.forEach(li => {
    if (!q) { li.style.display = 'flex'; anyVisible = true; return; }
    // Match primary artist name
    const primaryText = (li.querySelector('.trail-artist-primary') || {}).textContent || '';
    // Match co-performer names (ADR-019)
    const coTexts = [...li.querySelectorAll('.trail-artist-co')]
      .map(el => el.textContent).join(' ');
    // Match composition chip, raga chip, or fallback label
    const compChipText = (li.querySelector('.comp-chip')  || {}).textContent || '';
    const ragaChipText = (li.querySelector('.raga-chip')  || {}).textContent || '';
    const labelText    = (li.querySelector('.trail-label') || {}).textContent || '';
    const matches    = [primaryText, coTexts, compChipText, ragaChipText, labelText]
      .some(t => t.toLowerCase().includes(q));
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

// ── node tap ──────────────────────────────────────────────────────────────────
cy.on('tap', 'node', evt => {
  selectNode(evt.target);
});

cy.on('dbltap', 'node', evt => {
  openMetaInspector('node', evt.target.data());
});

cy.on('dbltap', 'edge', evt => {
  openMetaInspector('edge', evt.target.data());
});

// ── ADR-027: reflective metadata inspector ────────────────────────────────────
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

// ── edge tap ──────────────────────────────────────────────────────────────────
cy.on('tap', 'edge', evt => {
  const d    = evt.target.data();
  const srcL = cy.getElementById(d.source).data('label') || d.source;
  const tgtL = cy.getElementById(d.target).data('label') || d.target;

  document.getElementById('edge-guru').textContent    = srcL;
  document.getElementById('edge-shishya').textContent = tgtL;
  document.getElementById('edge-note').textContent    = d.note || '';
  document.getElementById('edge-conf').textContent    =
    'confidence: ' + (d.confidence * 100).toFixed(0) + '%';
  const srcA = document.getElementById('edge-src');
  srcA.href = d.source_url;
  srcA.style.display = d.source_url ? 'inline-block' : 'none';

  document.getElementById('node-info').style.display        = 'none';
  document.getElementById('recordings-panel').style.display = 'none';
  document.getElementById('edge-info').style.display        = 'block';

  cy.elements().addClass('faded');
  evt.target.removeClass('faded').addClass('highlighted');
  evt.target.source().removeClass('faded');
  evt.target.target().removeClass('faded');
});

// ── background tap ────────────────────────────────────────────────────────────
cy.on('tap', evt => {
  if (evt.target !== cy) return;
  cy.elements().removeClass('faded highlighted');
  document.getElementById('node-name').textContent          = '—';
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

