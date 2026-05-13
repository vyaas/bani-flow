// ── ADR-136: Timeline Overhaul ────────────────────────────────────────────────
// D1-D3: Interpolated dating  D4: Hybrid log/linear axis
// D5: Navigable 50-year ruler  D6: Mobile vertical orientation

// ── D4: Hybrid axis constants ─────────────────────────────────────────────────
const TIMELINE_PIVOT        = 1775;   // log/linear split (Trinity birth window)
const TIMELINE_LOG_FRACTION = 0.15;   // pre-pivot log region = 15% of virtual span
const TIMELINE_VIRTUAL_SPAN = 5200;   // total virtual graph-space px
const GENERATION            = 20;     // one-generation offset for D2 interpolation
const INTERP_DEPTH_CAP      = 2;      // max recursion depth for D2

// ── D3: Era band median years (fallback for unanchored nodes) ─────────────────
const ERA_BAND_MEDIAN = {
  trinity:        1790,
  bridge:         1850,
  golden_age:     1910,
  disseminator:   1950,
  living_pillars: 1975,
  contemporary:   2000,
};

// Era lane centres — graph-space units along the non-time axis
const ERA_LANE_CENTRE = {
  trinity:        0,
  bridge:         220,
  golden_age:     440,
  disseminator:   660,
  living_pillars: 880,
  contemporary:   1100,
};
const LANE_STEP = 55;   // vertical spread step within a lane

let currentLayout = 'graph';

// Dynamic axis bounds — updated each time applyTimelineLayout() runs
let _axisYearMin = 1700;
let _axisYearMax = 2030;

// ── Orientation ───────────────────────────────────────────────────────────────
function _isPortrait() {
  return window.innerHeight > window.innerWidth;
}

// ── D4: Hybrid axis mapping ───────────────────────────────────────────────────
function _updateAxisBounds(years) {
  if (!years.length) return;
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  _axisYearMin = Math.floor(lo / 100) * 100;
  _axisYearMax = Math.ceil(hi / 10) * 10;
  // Always preserve a log region even when all nodes are post-pivot
  if (_axisYearMin >= TIMELINE_PIVOT) _axisYearMin = TIMELINE_PIVOT - 100;
}

function axisCoord(year) {
  const logSpan = TIMELINE_VIRTUAL_SPAN * TIMELINE_LOG_FRACTION;
  const linSpan = TIMELINE_VIRTUAL_SPAN * (1 - TIMELINE_LOG_FRACTION);
  if (year <= TIMELINE_PIVOT) {
    const offset    = TIMELINE_PIVOT - year;
    const maxOffset = TIMELINE_PIVOT - _axisYearMin;
    if (maxOffset <= 0) return 0;
    // Log compression: 1775 → logSpan, _axisYearMin → 0  (C⁰ at pivot)
    return logSpan * (1 - Math.log(offset + 1) / Math.log(maxOffset + 1));
  } else {
    const span = _axisYearMax - TIMELINE_PIVOT;
    if (span <= 0) return logSpan;
    return logSpan + ((year - TIMELINE_PIVOT) / span) * linSpan;
  }
}

// ── D1–D2: Placement year computation ────────────────────────────────────────
// Walk guru (incoming) or shishya (outgoing) neighbours up to `depth` hops,
// collecting sourced birth years.
function _collectNeighbourYears(node, direction, depth, visited) {
  if (depth <= 0 || visited.has(node.id())) return [];
  visited.add(node.id());
  const neighbours = direction === 'gurus'
    ? node.incomers('node')   // source of edge → this node  =  guru
    : node.outgoers('node');  // this node → target of edge  =  shishya
  const years = [];
  neighbours.forEach(n => {
    const b = n.data('born');
    if (b != null) {
      years.push(b);
    } else if (depth > 1) {
      years.push(..._collectNeighbourYears(n, direction, depth - 1, visited));
    }
  });
  return years;
}

function placementYear(node) {
  // D1: sourced birth year wins
  const born = node.data('born');
  if (born != null) return born;

  // D2: interpolate from lineage edges
  const gYears = _collectNeighbourYears(node, 'gurus',    INTERP_DEPTH_CAP, new Set());
  const sYears = _collectNeighbourYears(node, 'shishyas', INTERP_DEPTH_CAP, new Set());

  if (gYears.length > 0 && sYears.length > 0) {
    const gMax = Math.max(...gYears);
    const sMin = Math.min(...sYears);
    // mean(gMax+GENERATION, sMin-GENERATION) = (gMax + sMin) / 2, clamped to [gMax, sMin]
    const mid = (gMax + sMin) / 2;
    return Math.max(gMax, Math.min(sMin, mid));
  }
  if (gYears.length > 0) return Math.max(...gYears) + GENERATION;
  if (sYears.length > 0) return Math.min(...sYears) - GENERATION;

  // D3: era band median, or null → node omitted from timeline
  const era = node.data('era') || 'contemporary';
  return ERA_BAND_MEDIAN[era] ?? null;
}

// ── Apply timeline layout ─────────────────────────────────────────────────────
function applyTimelineLayout() {
  const portrait = _isPortrait();

  // Pre-compute all placement years (one pass — avoid repeating graph walks)
  const pyCache = new Map();
  cy.nodes().forEach(n => pyCache.set(n.id(), placementYear(n)));

  const placedYears = [...pyCache.values()].filter(y => y != null);
  _updateAxisBounds(placedYears);

  // Group nodes by era
  const laneNodes = {};
  cy.nodes().forEach(n => {
    const era = n.data('era') || 'contemporary';
    if (!laneNodes[era]) laneNodes[era] = [];
    laneNodes[era].push(n);
  });

  const positions = {};
  Object.entries(laneNodes).forEach(([era, nodes]) => {
    const laneC = ERA_LANE_CENTRE[era] !== undefined ? ERA_LANE_CENTRE[era] : 1100;
    // Sort by placement year (nulls last)
    nodes.sort((a, b) => {
      const ya = pyCache.get(a.id()), yb = pyCache.get(b.id());
      if (ya == null && yb == null) return 0;
      if (ya == null) return 1;
      if (yb == null) return -1;
      return ya - yb;
    });
    nodes.forEach((n, i) => {
      const py = pyCache.get(n.id());
      if (py == null) {
        // D3 omit: push far off-canvas (node remains accessible via search)
        positions[n.id()] = { x: -9999, y: -9999 };
        return;
      }
      const coord  = axisCoord(py);
      const half   = Math.floor(i / 2) + 1;
      const offset = (i % 2 === 0 ? 1 : -1) * half * LANE_STEP;
      if (portrait) {
        // Vertical (D6): time flows top→bottom on Y, era lanes on X
        positions[n.id()] = { x: laneC + offset, y: coord };
      } else {
        // Horizontal: time on X, era lanes on Y
        positions[n.id()] = { x: coord, y: laneC + offset };
      }
    });
  });

  const layout = cy.layout({
    name:             'preset',
    positions:        node => positions[node.id()] || { x: -9999, y: -9999 },
    animate:          true,
    animationDuration: 700,
    fit:              true,
    padding:          60,
  });
  layout.one('layoutstop', () => showTimelineRuler());
  layout.run();
}

// ── D5: Ruler — 50-year ticks (linear), century ticks (log), navigable ────────
const ruler = document.getElementById('timeline-ruler');

function graphXtoPx(gx) { return gx * cy.zoom() + cy.pan().x; }
function graphYtoPx(gy) { return gy * cy.zoom() + cy.pan().y; }

// Fit camera to musicians within ±halfWindow years of `year`; flash if empty
function _rulerFitEra(year, halfWindow, labelEl) {
  const nodes = cy.nodes().filter(n => {
    const py = placementYear(n);
    return py != null && Math.abs(py - year) <= halfWindow;
  });
  if (nodes.length === 0) {
    if (labelEl) {
      labelEl.classList.add('tick-flash');
      setTimeout(() => labelEl.classList.remove('tick-flash'), 600);
    }
    return;
  }
  cy.fit(nodes, 80);
}

function drawRuler() {
  if (currentLayout !== 'timeline') return;
  ruler.innerHTML = '';

  const svgNS   = 'http://www.w3.org/2000/svg';
  const portrait = _isPortrait();
  const W       = ruler.clientWidth  || window.innerWidth;
  const H       = ruler.clientHeight || window.innerHeight;

  // Build tick list ───────────────────────────────────────────────────────────
  // Linear region: every 50 years from first multiple of 50 ≥ TIMELINE_PIVOT
  const ticks = [];
  const linStart = Math.ceil(TIMELINE_PIVOT / 50) * 50;
  for (let y = linStart; y <= _axisYearMax; y += 50) {
    ticks.push({ year: y, isLog: false, halfWindow: 25 });
  }
  // Log region: every century from _axisYearMin up to (not including) TIMELINE_PIVOT
  const logCentStart = Math.ceil(_axisYearMin / 100) * 100;
  for (let y = logCentStart; y < TIMELINE_PIVOT; y += 100) {
    ticks.push({ year: y, isLog: true, halfWindow: 50 });
  }

  const eraDisplayNames = {
    trinity: 'Trinity', bridge: 'Bridge', golden_age: 'Golden Age',
    disseminator: 'Disseminators', living_pillars: 'Living Pillars',
    contemporary: 'Contemporary',
  };

  ticks.forEach(({ year, isLog, halfWindow }) => {
    const coord = axisCoord(year);
    let sx, sy;
    if (portrait) {
      sy = graphYtoPx(coord);
      if (sy < -20 || sy > H + 20) return;
    } else {
      sx = graphXtoPx(coord);
      if (sx < -20 || sx > W + 20) return;
    }

    // (a) Faint full-span grid line
    const line = document.createElementNS(svgNS, 'line');
    if (portrait) {
      line.setAttribute('x1', 0);  line.setAttribute('x2', W);
      line.setAttribute('y1', sy); line.setAttribute('y2', sy);
    } else {
      line.setAttribute('x1', sx); line.setAttribute('x2', sx);
      line.setAttribute('y1', 0);  line.setAttribute('y2', H);
    }
    line.setAttribute('class', 'tick-line' + (isLog ? ' century' : ''));
    ruler.appendChild(line);

    // (b) Tick label
    const label = document.createElementNS(svgNS, 'text');
    if (portrait) {
      label.setAttribute('x', 6);
      label.setAttribute('y', sy - 3);
      label.setAttribute('text-anchor', 'start');
      label.setAttribute('dominant-baseline', 'auto');
    } else {
      label.setAttribute('x', sx);
      label.setAttribute('y', 4);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'hanging');
    }
    label.setAttribute('class', 'tick-label' + (isLog ? ' century' : ''));
    label.textContent = String(year);
    ruler.appendChild(label);

    // (c) Invisible 24-px click target
    const hit = document.createElementNS(svgNS, 'rect');
    if (portrait) {
      hit.setAttribute('x', 0);         hit.setAttribute('y', sy - 12);
      hit.setAttribute('width',  W);    hit.setAttribute('height', 24);
    } else {
      hit.setAttribute('x', sx - 12);   hit.setAttribute('y', 0);
      hit.setAttribute('width',  24);   hit.setAttribute('height', H);
    }
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('class', 'tick-click-target');
    hit.style.pointerEvents = 'all';
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', () => _rulerFitEra(year, halfWindow, label));
    ruler.appendChild(hit);
  });

  // Era lane labels on the appropriate margin
  Object.entries(ERA_LANE_CENTRE).forEach(([era, laneC]) => {
    const text = document.createElementNS(svgNS, 'text');
    if (portrait) {
      const lx = graphXtoPx(laneC);
      text.setAttribute('x', lx);
      text.setAttribute('y', 14);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'hanging');
    } else {
      const ly = graphYtoPx(laneC);
      text.setAttribute('x', 6);
      text.setAttribute('y', ly);
      text.setAttribute('text-anchor', 'start');
      text.setAttribute('dominant-baseline', 'middle');
    }
    text.setAttribute('class', 'era-label');
    text.textContent = '— ' + (eraDisplayNames[era] || era);
    ruler.appendChild(text);
  });
}

function showTimelineRuler() {
  ruler.style.display = 'block';
  drawRuler();
}

function hideTimelineRuler() {
  ruler.style.display = 'none';
  ruler.innerHTML = '';
}

cy.on('pan zoom', () => {
  if (currentLayout === 'timeline') drawRuler();
});

