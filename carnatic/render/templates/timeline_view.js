// ── timeline layout ───────────────────────────────────────────────────────────
const TIMELINE_X_MIN  = 1750;
const TIMELINE_X_MAX  = 2010;
const TIMELINE_WIDTH  = 5200;   // virtual graph-space px
const TIMELINE_UNKNOWN_X = TIMELINE_WIDTH + 400;

// Era lane Y centres (graph-space px). Trinity at top, Contemporary at bottom.
const ERA_LANE_Y = {
  trinity:        0,
  bridge:         220,
  golden_age:     440,
  disseminator:   660,
  living_pillars: 880,
  contemporary:   1100,
};
const LANE_STEP = 55;    // fixed vertical step between nodes in the same lane

let currentLayout = 'graph';

function bornToX(born) {
  if (born == null) return TIMELINE_UNKNOWN_X;
  return ((born - TIMELINE_X_MIN) / (TIMELINE_X_MAX - TIMELINE_X_MIN)) * TIMELINE_WIDTH;
}

function applyTimelineLayout() {
  // Group nodes by era, sort each group by born year, assign Y offsets
  const laneNodes = {};
  cy.nodes().forEach(n => {
    const era = n.data('era') || 'contemporary';
    if (!laneNodes[era]) laneNodes[era] = [];
    laneNodes[era].push(n);
  });

  const positions = {};
  Object.entries(laneNodes).forEach(([era, nodes]) => {
    const laneY = ERA_LANE_Y[era] !== undefined ? ERA_LANE_Y[era] : 1100;
    // Sort by born year (nulls last)
    nodes.sort((a, b) => {
      const ba = a.data('born'), bb = b.data('born');
      if (ba == null && bb == null) return 0;
      if (ba == null) return 1;
      if (bb == null) return -1;
      return ba - bb;
    });
    // Spread nodes vertically within lane to avoid stacking.
    // Alternate above/below lane centre with a fixed step so nodes never overlap
    // regardless of how many share the same birth year.
    nodes.forEach((n, i) => {
      const born = n.data('born');
      const x = bornToX(born);
      const half = Math.floor(i / 2) + 1;
      const offset = (i % 2 === 0 ? 1 : -1) * half * LANE_STEP;
      positions[n.id()] = { x, y: laneY + offset };
    });
  });

  const layout = cy.layout({
    name: 'preset',
    positions: node => positions[node.id()] || { x: TIMELINE_UNKNOWN_X, y: 600 },
    animate: true,
    animationDuration: 700,
    fit: true,
    padding: 60,
  });
  layout.one('layoutstop', () => showTimelineRuler());
  layout.run();
}

// ── decade ruler ──────────────────────────────────────────────────────────────
const ruler = document.getElementById('timeline-ruler');

function graphXtoPx(gx) {
  // Convert graph-space X to screen-space X using Cytoscape's pan/zoom
  return gx * cy.zoom() + cy.pan().x;
}

function graphYtoPx(gy) {
  return gy * cy.zoom() + cy.pan().y;
}

function drawRuler() {
  if (currentLayout !== 'timeline') return;
  ruler.innerHTML = '';

  const svgNS = 'http://www.w3.org/2000/svg';
  const h = ruler.clientHeight || window.innerHeight;

  // Decade ticks from 1750 to 2010
  for (let year = TIMELINE_X_MIN; year <= TIMELINE_X_MAX; year += 10) {
    const sx = graphXtoPx(bornToX(year));
    const isCentury = (year % 100 === 0);
    const tickH = isCentury ? 18 : 10;

    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', sx); line.setAttribute('x2', sx);
    line.setAttribute('y1', 0);  line.setAttribute('y2', h);
    line.setAttribute('class', 'tick-line' + (isCentury ? ' century' : ''));
    ruler.appendChild(line);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', sx);
    label.setAttribute('y', 4);
    label.setAttribute('class', 'tick-label' + (isCentury ? ' century' : ''));
    label.textContent = year;
    ruler.appendChild(label);
  }

  // Era lane labels on the left margin
  Object.entries(ERA_LANE_Y).forEach(([era, gy]) => {
    const sy = graphYtoPx(gy);
    const eraLabel = {
      trinity: 'Trinity', bridge: 'Bridge', golden_age: 'Golden Age',
      disseminator: 'Disseminators', living_pillars: 'Living Pillars',
      contemporary: 'Contemporary',
    }[era] || era;
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', 6);
    text.setAttribute('y', sy);
    text.setAttribute('class', 'era-label');
    text.textContent = '— ' + eraLabel;
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

