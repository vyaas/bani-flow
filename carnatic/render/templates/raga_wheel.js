// ── Three-view selector (ADR-023) ─────────────────────────────────────────────
let currentView = 'graph'; // 'graph' | 'timeline' | 'raga'

function switchView(name) {
  if (name === currentView) return;
  currentView = name;

  // Update segmented control button states
  ['graph', 'timeline', 'raga'].forEach(v => {
    document.getElementById('view-btn-' + v)
      .classList.toggle('active', v === name);
  });

  // Show/hide Cytoscape-specific controls
  const cyControls = ['btn-fit', 'btn-reset', 'btn-relayout', 'btn-labels'];
  cyControls.forEach(id => {
    document.getElementById(id).style.display = (name === 'raga') ? 'none' : '';
  });

  if (name === 'graph') {
    hideTimelineRuler();
    hideRagaWheel();
    document.getElementById('cy').style.display = '';
    currentLayout = 'graph';
    relayout();
  } else if (name === 'timeline') {
    hideRagaWheel();
    document.getElementById('cy').style.display = '';
    currentLayout = 'timeline';
    applyTimelineLayout();
  } else if (name === 'raga') {
    hideTimelineRuler();
    document.getElementById('cy').style.display = 'none';
    showRagaWheel();
  }
}

// Backward-compatible wrapper
function toggleLayout() {
  switchView(currentView === 'graph' ? 'timeline' : 'graph');
}

// ── Raga Wheel — show / hide ───────────────────────────────────────────────────
function showRagaWheel() {
  const wheel = document.getElementById('raga-wheel');
  wheel.style.display = '';
  drawRagaWheel();
}

function hideRagaWheel() {
  const wheel = document.getElementById('raga-wheel');
  wheel.style.display = 'none';
  wheel.innerHTML = '';
}

// ── Raga Wheel — SVG rendering (ADR-023) ──────────────────────────────────────
(function() {

// Cakra colour palette (warm→cool, 12 sectors, Gruvbox-inspired)
const CAKRA_COLORS = {
  1:  '#d79921', 2:  '#98971a', 3:  '#689d6a', 4:  '#458588',
  5:  '#076678', 6:  '#427b58', 7:  '#79740e', 8:  '#b57614',
  9:  '#af3a03', 10: '#9d0006', 11: '#8f3f71', 12: '#b16286',
};

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function sectorPath(cx, cy, r1, r2, startDeg, endDeg) {
  const s1 = polar(cx, cy, r1, startDeg), e1 = polar(cx, cy, r1, endDeg);
  const s2 = polar(cx, cy, r2, startDeg), e2 = polar(cx, cy, r2, endDeg);
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return [
    `M ${s1.x} ${s1.y}`,
    `A ${r1} ${r1} 0 ${large} 1 ${e1.x} ${e1.y}`,
    `L ${e2.x} ${e2.y}`,
    `A ${r2} ${r2} 0 ${large} 0 ${s2.x} ${s2.y}`,
    'Z'
  ].join(' ');
}

function abbrev(name, maxLen) {
  if (!name) return '';
  if (name.length <= maxLen) return name;
  const parts = name.match(/[A-Z][a-z]*/g);
  if (parts && parts.length >= 2) return parts.map(p => p[0]).join('');
  return name.slice(0, maxLen - 1) + '\u2026';
}

let _tooltipGroup = null;
function showWheelTooltip(svg, x, y, lines) {
  hideWheelTooltip();
  const PAD = 8, LINE_H = 16;
  const maxLen = Math.max(...lines.map(l => l.length));
  const tw = maxLen * 6.5 + PAD * 2;
  const th = lines.length * LINE_H + PAD * 2;
  const svgW = svg.clientWidth || 800, svgH = svg.clientHeight || 600;
  let tx = x + 12, ty = y - th / 2;
  if (tx + tw > svgW - 4) tx = x - tw - 12;
  if (ty < 4) ty = 4;
  if (ty + th > svgH - 4) ty = svgH - th - 4;
  const g = svgEl('g', { id: 'raga-wheel-tooltip' });
  g.appendChild(svgEl('rect', {
    x: tx, y: ty, width: tw, height: th, rx: 4, ry: 4,
    fill: '#1d2021', stroke: '#504945', 'stroke-width': 1, opacity: 0.95
  }));
  lines.forEach((line, i) => {
    const t = svgEl('text', {
      x: tx + PAD, y: ty + PAD + LINE_H * i + LINE_H * 0.75,
      fill: i === 0 ? '#ebdbb2' : '#a89984',
      'font-size': i === 0 ? '12px' : '11px', 'font-family': 'inherit',
    });
    t.textContent = line;
    g.appendChild(t);
  });
  svg.appendChild(g);
  _tooltipGroup = g;
}
function hideWheelTooltip() {
  if (_tooltipGroup) { _tooltipGroup.remove(); _tooltipGroup = null; }
}

let _expandedMela = null, _expandedJanya = null, _expandedComp = null;
let _labelLayer = null;  // top-most <g> in vp — all text labels go here

// Re-append _labelLayer so it is always the last (topmost) child of vp
function _bringLabelsToFront(vp) {
  if (_labelLayer && _labelLayer.parentNode === vp) vp.appendChild(_labelLayer);
}

window.drawRagaWheel = function() {
  const svg = document.getElementById('raga-wheel');
  svg.innerHTML = '';
  _expandedMela = null; _expandedJanya = null; _expandedComp = null;

  const W = svg.clientWidth  || svg.parentElement.clientWidth  || 800;
  const H = svg.clientHeight || svg.parentElement.clientHeight || 600;
  const cx = W / 2, cy = H / 2;
  const minDim = Math.min(W, H);

  const R_INNER = minDim * 0.08;
  const R_CAKRA = minDim * 0.155;
  const R_MELA  = minDim * 0.38;
  const R_JANYA = minDim * 0.56;
  const R_COMP  = minDim * 0.72;
  const R_MUSC  = minDim * 0.88;
  const NR_MELA  = Math.max(4,  minDim * 0.013);
  const NR_JANYA = Math.max(4,  minDim * 0.014);
  const NR_COMP  = Math.max(4,  minDim * 0.013);
  const NR_MUSC  = Math.max(4,  minDim * 0.013);

  // Build lookups
  const melaByNum = {};
  ragas.filter(r => r.is_melakarta).forEach(r => { if (r.melakarta) melaByNum[r.melakarta] = r; });
  const janyasByMela = {};
  ragas.filter(r => !r.is_melakarta && r.parent_raga).forEach(r => {
    if (!janyasByMela[r.parent_raga]) janyasByMela[r.parent_raga] = [];
    janyasByMela[r.parent_raga].push(r);
  });
  const compsByRaga = {};
  compositions.forEach(c => {
    if (!c.raga_id) return;
    if (!compsByRaga[c.raga_id]) compsByRaga[c.raga_id] = [];
    compsByRaga[c.raga_id].push(c);
  });
  // Fix 5: build RTP lookup: raga_id → [recording objects that are RTP/alapana]
  const rtpByRaga = {};
  recordings.forEach(rec => {
    (rec.tracks || []).forEach(tr => {
      if (!tr.raga_id) return;
      const isRtp = (tr.type === 'rtp' || tr.type === 'alapana' ||
                     (tr.title && /ragam.tanam|alapana|rtp/i.test(tr.title)));
      if (!isRtp) return;
      if (!rtpByRaga[tr.raga_id]) rtpByRaga[tr.raga_id] = [];
      rtpByRaga[tr.raga_id].push({ title: tr.title, concert: rec.concert || rec.id,
                                     musician_id: tr.primary_performer || null,
                                     id: tr.id || (rec.id + '_' + tr.title) });
    });
  });

  // Fix 4: pan/zoom state
  let _vx = 0, _vy = 0, _vscale = 1;
  let _dragging = false, _dragStartX = 0, _dragStartY = 0, _dragVX = 0, _dragVY = 0;

  // Background click → collapse all
  const bg = svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
  bg.addEventListener('click', () => _collapseAll(svg, melaByNum));
  svg.appendChild(bg);

  // Fix 4: viewport group — all wheel content goes inside this <g>
  const vp = svgEl('g', { id: 'wheel-viewport' });
  svg.appendChild(vp);

  function _applyTransform() {
    vp.setAttribute('transform', `translate(${_vx},${_vy}) scale(${_vscale})`);
  }

  // Wheel zoom (mouse wheel)
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    // Zoom toward cursor position
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    _vx = mx - factor * (mx - _vx);
    _vy = my - factor * (my - _vy);
    _vscale *= factor;
    _applyTransform();
  }, { passive: false });

  // Wheel pan (drag)
  svg.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    _dragging = true;
    _dragStartX = e.clientX; _dragStartY = e.clientY;
    _dragVX = _vx; _dragVY = _vy;
    svg.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!_dragging) return;
    _vx = _dragVX + (e.clientX - _dragStartX);
    _vy = _dragVY + (e.clientY - _dragStartY);
    _applyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (_dragging) { _dragging = false; svg.style.cursor = ''; }
  });

  // Double-click to reset pan/zoom
  svg.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    _vx = 0; _vy = 0; _vscale = 1;
    _applyTransform();
  });

  // Cakra sectors — appended to viewport group (vp) for pan/zoom
  for (let cakra = 1; cakra <= 12; cakra++) {
    const startDeg = (cakra - 1) * 30, endDeg = cakra * 30;
    const color = CAKRA_COLORS[cakra] || '#665c54';
    vp.appendChild(svgEl('path', {
      d: sectorPath(cx, cy, R_INNER, R_CAKRA, startDeg, endDeg),
      fill: color, opacity: 0.35, stroke: '#1d2021', 'stroke-width': 1
    }));
    // Fix 6: cakra name only, rotated to follow the arc — flip on left half so text is never upside-down
    const midDeg = startDeg + 15;
    const lp = polar(cx, cy, (R_INNER + R_CAKRA) / 2, midDeg);
    // Right half (0–180°): rotate text so it reads clockwise; left half (180–360°): flip 180° to stay upright
    const cakraRotDeg = midDeg <= 180 ? midDeg - 90 : midDeg + 90;
    const nameLbl = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: '#ebdbb2', 'font-size': Math.max(8, minDim * 0.015) + 'px',
      'font-weight': 'bold', 'pointer-events': 'none',
      transform: `rotate(${cakraRotDeg}, ${lp.x}, ${lp.y})`
    });
    nameLbl.textContent = CAKRA_NAMES[cakra] || String(cakra);
    vp.appendChild(nameLbl);
  }

  vp.appendChild(svgEl('circle', {
    cx, cy, r: R_CAKRA, fill: 'none', stroke: '#504945', 'stroke-width': 1
  }));

  // Fix 7: two-pass rendering — all circles first, then all labels on top
  // Pass 1: circles + interaction (no labels yet)
  const melaCirleGroups = [];
  for (let n = 1; n <= 72; n++) {
    const angleDeg = (n - 1) * 5;
    const pos = polar(cx, cy, R_MELA, angleDeg);
    const raga = melaByNum[n];
    const cakra = Math.ceil(n / 6);
    const color = CAKRA_COLORS[cakra] || '#665c54';

    const g = svgEl('g', { class: 'mela-node', 'data-mela': n, 'data-id': raga ? raga.id : '' });
    const circle = svgEl('circle', {
      cx: pos.x, cy: pos.y, r: NR_MELA,
      fill: raga ? color : '#3c3836',
      stroke: raga ? '#ebdbb2' : '#504945',
      'stroke-width': raga ? 1.5 : 1,
      opacity: raga ? 1 : 0.5,
      cursor: raga ? 'pointer' : 'default',
      'data-mela': n
    });
    g.appendChild(circle);

    if (raga) {
      g.style.cursor = 'pointer';
      g.addEventListener('mouseenter', () => {
        const lines = [raga.name,
          'Mela ' + n + ' \u00b7 Cakra ' + cakra + ' (' + (CAKRA_NAMES[cakra] || '') + ')'];
        if (raga.notes) {
          const am = raga.notes.match(/arohana[:\s]+([^;]+)/i);
          if (am) lines.push('\u2191 ' + am[1].trim());
          const vm = raga.notes.match(/avarohana[:\s]+([^;]+)/i);
          if (vm) lines.push('\u2193 ' + vm[1].trim());
        }
        const jc = (janyasByMela[raga.id] || []).length;
        if (jc) lines.push(jc + ' janya raga' + (jc > 1 ? 's' : ''));
        showWheelTooltip(svg, pos.x, pos.y, lines);
      });
      g.addEventListener('mouseleave', hideWheelTooltip);
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_expandedMela === raga.id) {
          _collapseAll(vp, melaByNum);
        } else {
          _collapseAll(vp, melaByNum);
          _expandMela(vp, svg, raga, angleDeg, cx, cy,
            R_MELA, R_JANYA, R_COMP, R_MUSC,
            NR_MELA, NR_JANYA, NR_COMP, NR_MUSC,
            janyasByMela, compsByRaga, rtpByRaga, color, minDim);
          circle.setAttribute('stroke', '#fabd2f');
          circle.setAttribute('stroke-width', 2.5);
          _expandedMela = raga.id;
        }
      });
    }
    vp.appendChild(g);
    melaCirleGroups.push({ n, angleDeg, raga });
  }

  // Pass 2: labels — in the module-level _labelLayer so they are always topmost
  _labelLayer = svgEl('g', { id: 'wheel-label-layer', 'pointer-events': 'none' });
  melaCirleGroups.forEach(({ n, angleDeg, raga }) => {
    const labelR = R_MELA + NR_MELA + Math.max(5, minDim * 0.014);
    const lp = polar(cx, cy, labelR, angleDeg);
    const normAngle = ((angleDeg % 360) + 360) % 360;
    let melaRotDeg, anchor;
    if (normAngle === 0)        { melaRotDeg = 0;             anchor = 'middle'; }
    else if (normAngle === 180) { melaRotDeg = 0;             anchor = 'middle'; }
    else if (normAngle < 180)   { melaRotDeg = angleDeg - 90; anchor = 'start';  }
    else                        { melaRotDeg = angleDeg + 90; anchor = 'end';    }
    const lbl = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': anchor, 'dominant-baseline': 'middle',
      fill: raga ? '#ebdbb2' : '#665c54',
      'font-size': Math.max(7, minDim * 0.012) + 'px',
      transform: `rotate(${melaRotDeg}, ${lp.x}, ${lp.y})`
    });
    lbl.textContent = raga ? raga.name : String(n);
    _labelLayer.appendChild(lbl);
  });
  vp.appendChild(_labelLayer);
};

// vp = viewport <g> for pan/zoom; svg = root SVG for tooltip sizing
function _collapseAll(vp, melaByNum) {
  vp.querySelectorAll('.janya-group, .comp-group, .musc-group').forEach(g => g.remove());
  // Also clear satellite labels from the shared label layer
  if (_labelLayer) {
    _labelLayer.querySelectorAll('.sat-label').forEach(el => el.remove());
  }
  vp.querySelectorAll('.mela-node circle').forEach(c => {
    const n = parseInt(c.getAttribute('data-mela'));
    const cakra = Math.ceil(n / 6);
    const raga = melaByNum[n];
    c.setAttribute('stroke', raga ? '#ebdbb2' : '#504945');
    c.setAttribute('stroke-width', raga ? 1.5 : 1);
  });
  _expandedMela = null; _expandedJanya = null; _expandedComp = null;
  hideWheelTooltip();
}

function _expandMela(vp, svg, raga, melaAngle, cx, cy,
    R_MELA, R_JANYA, R_COMP, R_MUSC,
    NR_MELA, NR_JANYA, NR_COMP, NR_MUSC,
    janyasByMela, compsByRaga, rtpByRaga, melaColor, minDim) {
  const janyas = janyasByMela[raga.id] || [];
  const melaPos = polar(cx, cy, R_MELA, melaAngle);
  const g = svgEl('g', { class: 'janya-group', 'data-parent': raga.id });

  // Fix 8: always show the mela's own compositions/RTPs directly at R_COMP.
  // They appear at melaAngle (straight out from the mela node).
  // Janya satellites (if any) are spread around melaAngle at R_JANYA.
  const melaDirect = (compsByRaga[raga.id] || []).length + (rtpByRaga[raga.id] || []).length;

  if (janyas.length === 0 && melaDirect === 0) {
    // Nothing to show at all
    const lp = polar(cx, cy, R_JANYA, melaAngle);
    const t = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: '#665c54', 'font-size': '11px', 'pointer-events': 'none'
    });
    t.textContent = 'no janyas or compositions';
    g.appendChild(t);
    vp.appendChild(g);
    return;
  }

  // Draw janya satellites (if any)
  if (janyas.length > 0) {
    const SPREAD = Math.min(50, janyas.length * 8);
    janyas.forEach((janya, i) => {
      const offset = janyas.length === 1 ? 0 : -SPREAD / 2 + (SPREAD / (janyas.length - 1)) * i;
      const jAngle = melaAngle + offset;
      const jPos = polar(cx, cy, R_JANYA, jAngle);

      g.appendChild(svgEl('line', {
        x1: melaPos.x, y1: melaPos.y, x2: jPos.x, y2: jPos.y,
        stroke: melaColor, 'stroke-width': 1, opacity: 0.5, 'pointer-events': 'none'
      }));

      const jCircle = svgEl('circle', {
        cx: jPos.x, cy: jPos.y, r: NR_JANYA,
        fill: melaColor, opacity: 0.75, stroke: '#ebdbb2', 'stroke-width': 1, cursor: 'pointer'
      });
      const jg = svgEl('g', { class: 'janya-node', 'data-id': janya.id });
      jg.appendChild(jCircle);

      jg.addEventListener('mouseenter', () => {
        const lines = [janya.name, 'Janya of ' + raga.name];
        if (janya.notes) lines.push(janya.notes.slice(0, 60) + (janya.notes.length > 60 ? '\u2026' : ''));
        showWheelTooltip(svg, jPos.x, jPos.y, lines);
      });
      jg.addEventListener('mouseleave', hideWheelTooltip);
      jg.addEventListener('click', (e) => {
        e.stopPropagation();
        vp.querySelectorAll('.comp-group, .musc-group').forEach(el => el.remove());
        if (_labelLayer) _labelLayer.querySelectorAll('.sat-label').forEach(el => el.remove());
        vp.querySelectorAll('.janya-node circle').forEach(c => {
          c.setAttribute('stroke', '#ebdbb2'); c.setAttribute('stroke-width', 1);
        });
        if (_expandedJanya === janya.id) { _expandedJanya = null; return; }
        jCircle.setAttribute('stroke', '#fabd2f');
        jCircle.setAttribute('stroke-width', 2.5);
        _expandedJanya = janya.id;
        _expandedComp = null;
        _expandComps(vp, svg, janya, jAngle, jPos, cx, cy,
          R_COMP, R_MUSC, NR_JANYA, NR_COMP, NR_MUSC,
          compsByRaga, rtpByRaga, melaColor, minDim);
      });
      // Janya label goes into _labelLayer so it is always on top
      if (_labelLayer) {
        const jLbl = svgEl('text', {
          x: jPos.x, y: jPos.y + NR_JANYA + Math.max(3, minDim * 0.01),
          'text-anchor': 'middle', 'dominant-baseline': 'hanging',
          fill: '#d5c4a1', 'font-size': Math.max(7, minDim * 0.011) + 'px',
          'pointer-events': 'none', class: 'sat-label'
        });
        jLbl.textContent = janya.name;
        _labelLayer.appendChild(jLbl);
      }
      g.appendChild(jg);
    });
  }

  vp.appendChild(g);
  _bringLabelsToFront(vp);

  // Fix 8: also show the mela's own compositions/RTPs directly (no janya intermediary).
  if (melaDirect > 0) {
    _expandComps(vp, svg, raga, melaAngle, melaPos, cx, cy,
      R_COMP, R_MUSC, NR_MELA, NR_COMP, NR_MUSC,
      compsByRaga, rtpByRaga, melaColor, minDim);
  }
}

// Fix 5: _expandComps now includes RTP recordings alongside compositions
function _expandComps(vp, svg, janya, jAngle, jPos, cx, cy,
    R_COMP, R_MUSC, NR_JANYA, NR_COMP, NR_MUSC,
    compsByRaga, rtpByRaga, parentColor, minDim) {
  const comps = compsByRaga[janya.id] || [];
  // Build unified item list: compositions + RTP recordings for this janya
  const rtps = (rtpByRaga[janya.id] || []).map(r => ({
    ...r, _isRtp: true, title: r.title || 'RTP'
  }));
  const items = [...comps.map(c => ({ ...c, _isRtp: false })), ...rtps];

  const g = svgEl('g', { class: 'comp-group', 'data-parent': janya.id });

  if (items.length === 0) {
    const lp = polar(cx, cy, R_COMP, jAngle);
    const t = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: '#665c54', 'font-size': '11px', 'pointer-events': 'none'
    });
    t.textContent = 'no compositions';
    g.appendChild(t);
    vp.appendChild(g);
    return;
  }

  const SPREAD = Math.min(40, items.length * 7);
  items.forEach((item, i) => {
    const offset = items.length === 1 ? 0 : -SPREAD / 2 + (SPREAD / (items.length - 1)) * i;
    const cAngle = jAngle + offset;
    const cPos = polar(cx, cy, R_COMP, cAngle);

    g.appendChild(svgEl('line', {
      x1: jPos.x, y1: jPos.y, x2: cPos.x, y2: cPos.y,
      stroke: parentColor, 'stroke-width': 1, opacity: 0.4, 'pointer-events': 'none'
    }));

    // RTP nodes are diamond-shaped (rotated square) in a distinct colour
    const isRtp = item._isRtp;
    const cCircle = svgEl('circle', {
      cx: cPos.x, cy: cPos.y, r: NR_COMP,
      fill: isRtp ? '#689d6a' : '#d79921',
      opacity: 0.85, stroke: '#ebdbb2', 'stroke-width': 1, cursor: 'pointer'
    });
    const cg = svgEl('g', { class: 'comp-node', 'data-id': item.id || '' });
    cg.appendChild(cCircle);
    // Label goes into _labelLayer so it is always rendered on top of all circles
    if (_labelLayer) {
      const cLbl = svgEl('text', {
        x: cPos.x, y: cPos.y + NR_COMP + Math.max(2, minDim * 0.008),
        'text-anchor': 'middle', 'dominant-baseline': 'hanging',
        fill: '#d5c4a1', 'font-size': Math.max(6, minDim * 0.010) + 'px',
        'pointer-events': 'none', class: 'sat-label'
      });
      cLbl.textContent = item.title || '';
      _labelLayer.appendChild(cLbl);
    }

    cg.addEventListener('mouseenter', () => {
      const lines = [item.title || ''];
      if (isRtp) {
        lines.push('Ragam-Tanam-Pallavi');
        if (item.concert) lines.push('Concert: ' + item.concert);
      } else {
        if (item.composer_id) {
          const composer = composers.find(c => c.id === item.composer_id);
          if (composer) lines.push('Composer: ' + composer.name);
        }
        if (item.tala) lines.push('Tala: ' + item.tala);
      }
      showWheelTooltip(svg, cPos.x, cPos.y, lines);
    });
    cg.addEventListener('mouseleave', hideWheelTooltip);
    cg.addEventListener('click', (e) => {
      e.stopPropagation();
      vp.querySelectorAll('.musc-group').forEach(el => el.remove());
      if (_labelLayer) _labelLayer.querySelectorAll('.sat-label-musc').forEach(el => el.remove());
      vp.querySelectorAll('.comp-node circle').forEach(c => {
        c.setAttribute('stroke', '#ebdbb2'); c.setAttribute('stroke-width', 1);
      });
      if (_expandedComp === item.id) { _expandedComp = null; return; }
      cCircle.setAttribute('stroke', '#fabd2f');
      cCircle.setAttribute('stroke-width', 2.5);
      _expandedComp = item.id;
      if (!isRtp) triggerBaniSearch('comp', item.id);
      _expandMusicians(vp, svg, item, cAngle, cPos, cx, cy,
        R_MUSC, NR_COMP, NR_MUSC, parentColor, minDim);
    });
    g.appendChild(cg);
  });
  vp.appendChild(g);
  _bringLabelsToFront(vp);
}

function _expandMusicians(vp, svg, comp, cAngle, cPos, cx, cy,
    R_MUSC, NR_COMP, NR_MUSC, parentColor, minDim) {
  const muscIds = compositionToNodes[comp.id] || [];
  const g = svgEl('g', { class: 'musc-group', 'data-parent': comp.id });

  if (muscIds.length === 0) {
    const lp = polar(cx, cy, R_MUSC, cAngle);
    const t = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: '#665c54', 'font-size': '11px', 'pointer-events': 'none'
    });
    t.textContent = 'no musicians';
    g.appendChild(t);
    vp.appendChild(g);
    return;
  }

  const SPREAD = Math.min(35, muscIds.length * 6);
  muscIds.forEach((mid, i) => {
    const offset = muscIds.length === 1 ? 0 : -SPREAD / 2 + (SPREAD / (muscIds.length - 1)) * i;
    const mAngle = cAngle + offset;
    const mPos = polar(cx, cy, R_MUSC, mAngle);
    const node = cy.getElementById(mid);
    const mData = node && node.length ? node.data() : {};
    const mName = mData.label || mid;

    g.appendChild(svgEl('line', {
      x1: cPos.x, y1: cPos.y, x2: mPos.x, y2: mPos.y,
      stroke: parentColor, 'stroke-width': 1, opacity: 0.35, 'pointer-events': 'none'
    }));

    const mCircle = svgEl('circle', {
      cx: mPos.x, cy: mPos.y, r: NR_MUSC,
      fill: mData.color || '#83a598', opacity: 0.85,
      stroke: '#ebdbb2', 'stroke-width': 1, cursor: 'pointer'
    });
    const mg = svgEl('g', { class: 'musc-node', 'data-id': mid });
    mg.appendChild(mCircle);
    // Label goes into _labelLayer so it is always rendered on top of all circles
    if (_labelLayer) {
      const mLbl = svgEl('text', {
        x: mPos.x, y: mPos.y + NR_MUSC + Math.max(2, minDim * 0.008),
        'text-anchor': 'middle', 'dominant-baseline': 'hanging',
        fill: '#d5c4a1', 'font-size': Math.max(6, minDim * 0.010) + 'px',
        'pointer-events': 'none', class: 'sat-label sat-label-musc'
      });
      mLbl.textContent = mName;
      _labelLayer.appendChild(mLbl);
    }

    mg.addEventListener('mouseenter', () => {
      const lines = [mName];
      if (mData.era) lines.push('Era: ' + mData.era);
      if (mData.instrument) lines.push('Instrument: ' + mData.instrument);
      showWheelTooltip(svg, mPos.x, mPos.y, lines);
    });
    mg.addEventListener('mouseleave', hideWheelTooltip);
    mg.addEventListener('click', (e) => {
      e.stopPropagation();
      if (node && node.length) {
        cy.elements().removeClass('highlighted bani-match');
        node.addClass('bani-match');
        triggerBaniSearch('raga', comp.raga_id || '');
      }
      if (typeof showMusicianInfo === 'function') showMusicianInfo(node);
    });
    g.appendChild(mg);
  });
  vp.appendChild(g);
  _bringLabelsToFront(vp);
}

})(); // end raga-wheel IIFE

