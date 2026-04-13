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
    // Re-apply the current Bani filter to the wheel (ADR-025 sync gap)
    if (typeof activeBaniFilter !== 'undefined' && activeBaniFilter &&
        typeof syncRagaWheelToFilter === 'function') {
      syncRagaWheelToFilter(activeBaniFilter.type, activeBaniFilter.id);
    }
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

// Extract a short display title from a YouTube label.
// Labels follow the pattern: "<piece> · <raga> - <artist>, <venue> <year>"
// We want just the piece name (before the first ' · ' or ' - ').
// Falls back to the full label truncated to 28 chars.
function _ytShortTitle(label) {
  if (!label) return '';
  // Try ' · ' separator first (most common in this dataset)
  const dotIdx = label.indexOf(' \u00b7 ');
  if (dotIdx > 0) return label.slice(0, dotIdx).trim();
  // Try ' - ' separator
  const dashIdx = label.indexOf(' - ');
  if (dashIdx > 0) return label.slice(0, dashIdx).trim();
  // Fallback: truncate
  return label.length > 28 ? label.slice(0, 27) + '\u2026' : label;
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
let _wheelMouseMove = null;
let _wheelMouseUp   = null;

// Pan/zoom state — module-level so it survives drawRagaWheel redraws
let _vx = 0, _vy = 0, _vscale = 1;
let _dragging = false, _dragStartX = 0, _dragStartY = 0, _dragVX = 0, _dragVY = 0;
let _dragMoved = false;

// Apply the current pan/zoom transform to the viewport group.
// Looks up #wheel-viewport by ID so it works after a full SVG rebuild.
function _applyTransform() {
  const vp = document.getElementById('wheel-viewport');
  if (vp) vp.setAttribute('transform', `translate(${_vx},${_vy}) scale(${_vscale})`);
}

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

  // ── compsByRaga: three sources ────────────────────────────────────────────
  // Source 1: compositions.json compositions[] — canonical compositions
  const compsByRaga = {};
  compositions.forEach(c => {
    if (!c.raga_id) return;
    if (!compsByRaga[c.raga_id]) compsByRaga[c.raga_id] = [];
    compsByRaga[c.raga_id].push(c);
  });

  // Source 2: structured recordings (sessions/performances) tagged with raga_id.
  // ragaToPerf is injected by render.py: {raga_id: [PerformanceRef, ...]}
  // Each PerformanceRef has: recording_id, video_id, title, short_title, date,
  //   display_title, composition_id, raga_id, type, performers[].
  // We deduplicate by composition_id (already in Source 1) or by recording+display_title.
  const _seenPerfIds = new Set();
  compositions.forEach(c => { if (c.id) _seenPerfIds.add(c.id); });
  Object.entries(ragaToPerf || {}).forEach(([ragaId, perfs]) => {
    perfs.forEach(perf => {
      // Skip if this performance's composition is already in compsByRaga from Source 1
      if (perf.composition_id && _seenPerfIds.has(perf.composition_id)) return;
      const syntheticId = perf.composition_id ||
        (perf.recording_id + '__' + (perf.display_title || perf.title || ''));
      if (_seenPerfIds.has(syntheticId)) return;
      _seenPerfIds.add(syntheticId);
      if (!compsByRaga[ragaId]) compsByRaga[ragaId] = [];
      const isRtp = (perf.type === 'rtp' || perf.type === 'alapana' || perf.type === 'tanam' ||
                     (perf.display_title && /ragam.tanam|alapana|rtp/i.test(perf.display_title)));
      compsByRaga[ragaId].push({
        id:          syntheticId,
        title:       perf.display_title || perf.title || ragaId,
        raga_id:     ragaId,
        _isPerf:     true,
        _isRtp:      isRtp,
        concert:     perf.short_title || perf.title || '',
        date:        perf.date || '',
        performers:  perf.performers || [],
      });
    });
  });

  // Source 3: musicians.json youtube[] entries tagged with raga_id only.
  // In the rendered elements array, youtube entries are stored as data.tracks[]
  // with fields: vid, label, composition_id, raga_id, year.
  // (no url field — use vid as the unique key)
  elements.forEach(el => {
    if (!el.data || el.data.source !== undefined) return;  // skip edges
    const nodeId = el.data.id;
    if (!nodeId) return;
    (el.data.tracks || []).forEach(tr => {
      const ragaId = tr.raga_id;
      if (!ragaId) return;
      // If it also has a composition_id already in Source 1, skip
      if (tr.composition_id && _seenPerfIds.has(tr.composition_id)) return;
      const syntheticId = 'yt__' + (tr.vid || '') + '__' + ragaId;
      if (_seenPerfIds.has(syntheticId)) return;
      _seenPerfIds.add(syntheticId);
      if (!compsByRaga[ragaId]) compsByRaga[ragaId] = [];
      compsByRaga[ragaId].push({
        id:         syntheticId,
        title:      _ytShortTitle(tr.label) || ragaId,  // short name for wheel node label
        _fullLabel: tr.label || '',                      // full label for tooltip
        raga_id:    ragaId,
        _isPerf:    true,
        _isRtp:     false,
        _ytVid:     tr.vid || '',
        _nodeId:    nodeId,
        year:       tr.year || null,
      });
    });
  });

  // ── rtpByRaga: structured recordings only (nested sessions/performances schema)
  // Kept as a separate lookup for the tooltip "Ragam-Tanam-Pallavi" badge.
  const rtpByRaga = {};
  recordings.forEach(rec => {
    (rec.sessions || []).forEach(session => {
      (session.performances || []).forEach(perf => {
        if (!perf.raga_id) return;
        const isRtp = (perf.type === 'rtp' || perf.type === 'alapana' || perf.type === 'tanam' ||
                       (perf.display_title && /ragam.tanam|alapana|rtp/i.test(perf.display_title)));
        if (!isRtp) return;
        if (!rtpByRaga[perf.raga_id]) rtpByRaga[perf.raga_id] = [];
        rtpByRaga[perf.raga_id].push({
          title:       perf.display_title || rec.title || 'RTP',
          concert:     rec.short_title || rec.title || rec.id,
          musician_id: (session.performers[0] || {}).musician_id || null,
          id:          rec.id + '__' + perf.performance_index,
        });
      });
    });
  });

  // Background click → collapse all, but NOT if the click was the end of a pan gesture
  const bg = svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
  bg.addEventListener('click', () => {
    if (_dragMoved) { _dragMoved = false; return; }
    _collapseAll(vp, melaByNum);
  });
  svg.appendChild(bg);

  // Viewport group — all wheel content goes inside this <g>
  const vp = svgEl('g', { id: 'wheel-viewport' });
  svg.appendChild(vp);
  _applyTransform();  // restore saved pan/zoom after SVG rebuild

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
    _dragMoved = false;
    _dragStartX = e.clientX; _dragStartY = e.clientY;
    _dragVX = _vx; _dragVY = _vy;
    svg.style.cursor = 'grabbing';
  });
  // Remove any stale handlers from a previous drawRagaWheel call
  if (_wheelMouseMove) window.removeEventListener('mousemove', _wheelMouseMove);
  if (_wheelMouseUp)   window.removeEventListener('mouseup',   _wheelMouseUp);

  _wheelMouseMove = (e) => {
    if (!_dragging) return;
    const dx = e.clientX - _dragStartX, dy = e.clientY - _dragStartY;
    if (!_dragMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) _dragMoved = true;
    _vx = _dragVX + dx;
    _vy = _dragVY + dy;
    _applyTransform();
  };
  _wheelMouseUp = () => {
    if (_dragging) { _dragging = false; svg.style.cursor = ''; }
  };
  window.addEventListener('mousemove', _wheelMouseMove);
  window.addEventListener('mouseup',   _wheelMouseUp);

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
          triggerBaniSearch('raga', raga.id);  // sync bani flow to this mela
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
  vp.querySelectorAll('.janya-node circle').forEach(c => c.setAttribute('opacity', '0.75'));
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

  // Always show the mela's own music (compositions + performances) directly at R_COMP.
  // compsByRaga already includes all three sources (compositions, recordings, youtube).
  const melaDirect = (compsByRaga[raga.id] || []).length;

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
          c.setAttribute('opacity', '0.35');   // dim all janyas first
        });
        if (_expandedJanya === janya.id) {
          // un-dim all on collapse
          vp.querySelectorAll('.janya-node circle').forEach(c => c.setAttribute('opacity', '0.75'));
          _expandedJanya = null;
          return;
        }
        jCircle.setAttribute('stroke', '#fabd2f');
        jCircle.setAttribute('stroke-width', 2.5);
        jCircle.setAttribute('opacity', '0.75');   // restore selected janya to full opacity
        _expandedJanya = janya.id;
        _expandedComp = null;
        _expandComps(vp, svg, janya, jAngle, jPos, cx, cy,
          R_COMP, R_MUSC, NR_JANYA, NR_COMP, NR_MUSC,
          compsByRaga, rtpByRaga, melaColor, minDim);
        triggerBaniSearch('raga', janya.id);
      });
      // Janya label goes into _labelLayer so it is always on top
      if (_labelLayer) {
        const jLbl = svgEl('text', {
          x: jPos.x, y: jPos.y + NR_JANYA + Math.max(3, minDim * 0.01),
          'text-anchor': 'middle', 'dominant-baseline': 'hanging',
          fill: '#d5c4a1', 'font-size': Math.max(7, minDim * 0.011) + 'px',
          'pointer-events': 'none', class: 'sat-label sat-label-janya'
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
      compsByRaga, rtpByRaga, melaColor, minDim, /*isMelaDirect=*/true);
  }
}

// _expandComps: show all music tagged to this raga — compositions, structured
// recording performances, and youtube-only entries (Sources 1–3 from compsByRaga).
// isMelaDirect: true when called for a mela's own compositions (no janya intermediary).
function _expandComps(vp, svg, janya, jAngle, jPos, cx, cy,
    R_COMP, R_MUSC, NR_JANYA, NR_COMP, NR_MUSC,
    compsByRaga, rtpByRaga, parentColor, minDim, isMelaDirect) {
  // compsByRaga already contains all three sources; rtpByRaga is kept for
  // the tooltip badge only — no need to merge again here.
  const items = compsByRaga[janya.id] || [];

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
      // For _isPerf items, show the full label as the tooltip header if available
      const lines = [(item._isPerf && item._fullLabel) ? item._fullLabel : (item.title || '')];
      if (isRtp) {
        lines.push('Ragam-Tanam-Pallavi');
        if (item.concert) lines.push('Concert: ' + item.concert);
        if (item.date) lines.push(item.date);
      } else if (item._isPerf) {
        // Structured recording performance or youtube-only entry
        if (item.concert) lines.push('Concert: ' + item.concert);
        if (item.date) lines.push(item.date);
        if (item.year) lines.push(String(item.year));
        if (item._ytVid) lines.push('YouTube recording');
        if (item.performers && item.performers.length) {
          lines.push(item.performers.map(p => p.musician_id || p).join(', '));
        }
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
        c.setAttribute('opacity', '0.35');   // dim all comp nodes first
      });
      if (_expandedComp === item.id) {
        // un-dim all on collapse
        vp.querySelectorAll('.comp-node circle').forEach(c => c.setAttribute('opacity', '0.85'));
        // Restore mela nodes to full opacity
        vp.querySelectorAll('.mela-node circle').forEach(c => c.setAttribute('opacity', '1'));
        // Restore all janya nodes and their labels
        vp.querySelectorAll('.janya-node').forEach(jn => jn.style.removeProperty('display'));
        vp.querySelectorAll('.janya-node circle').forEach(c => {
          c.setAttribute('stroke', '#ebdbb2'); c.setAttribute('stroke-width', 1);
          c.setAttribute('opacity', '0.75');
        });
        if (_labelLayer) _labelLayer.querySelectorAll('.sat-label-janya').forEach(el => el.style.removeProperty('display'));
        _expandedComp = null;
        return;
      }
      // Dim all mela nodes except the currently expanded one so the path lights up
      vp.querySelectorAll('.mela-node circle').forEach(c => {
        const melaId = c.closest('.mela-node') && c.closest('.mela-node').getAttribute('data-id');
        c.setAttribute('opacity', melaId === _expandedMela ? '1' : '0.2');
      });
      // Hide all janya nodes except the parent of this comp (janya.id).
      // For mela-direct comps, janya IS the mela — hide all janya nodes.
      vp.querySelectorAll('.janya-node').forEach(jn => {
        const jid = jn.getAttribute('data-id');
        jn.style.display = (jid === janya.id) ? '' : 'none';
      });
      // Hide janya labels for all but the parent janya
      if (_labelLayer) {
        // sat-label-janya elements don't carry a data-id; they are ordered the same
        // as the janya nodes. Use positional matching via the janya-node data-id.
        // Simpler: hide all janya labels when a comp is selected — the selected
        // janya node itself is still visible as a circle.
        _labelLayer.querySelectorAll('.sat-label-janya').forEach(el => { el.style.display = 'none'; });
      }
      cCircle.setAttribute('stroke', '#fabd2f');
      cCircle.setAttribute('stroke-width', 2.5);
      cCircle.setAttribute('opacity', '0.85');   // restore selected comp to full opacity
      _expandedComp = item.id;
      // Sync bani flow — guard _wheelSyncInProgress so syncRagaWheelToFilter
      // does not trigger a full drawRagaWheel() redraw that would undo the dimming.
      window._wheelSyncInProgress = true;
      if (!item._isPerf) {
        triggerBaniSearch('comp', item.id);
      } else {
        triggerBaniSearch('raga', item.raga_id || janya.id);
      }
      window._wheelSyncInProgress = false;
      // Do not expand musicians in the raga wheel — the wheel is a navigation
      // aid only. Musician detail lives in the graph view (triggered via bani sync).
    });
    g.appendChild(cg);
  });
  vp.appendChild(g);
  _bringLabelsToFront(vp);
}

function _expandMusicians(vp, svg, comp, cAngle, cPos, cx, cyCY,
    R_MUSC, NR_COMP, NR_MUSC, parentColor, minDim, fallbackRagaId) {
  // For canonical compositions: look up by composition id.
  // For synthetic perf/youtube items (_isPerf): look up by raga id via ragaToNodes,
  // or use the performers[] array embedded in the item itself.
  let muscIds;
  if (!comp._isPerf) {
    muscIds = compositionToNodes[comp.id] || [];
  } else {
    const ragaId = comp.raga_id || fallbackRagaId;
    // Start from ragaToNodes (covers both youtube and recording sources)
    const fromRaga = ragaToNodes[ragaId] || [];
    // Also include any performers[] embedded directly in the item
    const fromPerf = (comp.performers || [])
      .map(p => p.musician_id || p)
      .filter(Boolean);
    // Merge, deduplicate
    const seen = new Set(fromRaga);
    muscIds = [...fromRaga];
    fromPerf.forEach(mid => { if (!seen.has(mid)) { seen.add(mid); muscIds.push(mid); } });
    // If item has a single _nodeId (youtube source), include it too
    if (comp._nodeId && !seen.has(comp._nodeId)) muscIds.push(comp._nodeId);
  }
  const g = svgEl('g', { class: 'musc-group', 'data-parent': comp.id });

  if (muscIds.length === 0) {
    const lp = polar(cx, cyCY, R_MUSC, cAngle);
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
    const mPos = polar(cx, cyCY, R_MUSC, mAngle);
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
        switchView('graph');
        cy.elements().removeClass('faded highlighted bani-match');
        selectNode(node);
      }
    });
    g.appendChild(mg);
  });
  vp.appendChild(g);
  _bringLabelsToFront(vp);
}

  // Expose _triggerMelaExpand at window level so syncRagaWheelToFilter (outside IIFE) can call it
  window._triggerMelaExpand = function(melaNum, targetRagaId, targetCompId) {
    window._wheelSyncInProgress = true;   // prevent syncRagaWheelToFilter re-entry

    // Find the mela node <g> by data-mela attribute and dispatch a click
    const melaG = document.querySelector(
      `#wheel-viewport .mela-node[data-mela="${melaNum}"]`
    );
    if (melaG) melaG.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // If targetRagaId is a janya, also expand it
    if (targetRagaId) {
      // Use setTimeout to allow the mela expansion to render first
      setTimeout(() => {
        const janyaG = document.querySelector(
          `#wheel-viewport .janya-node[data-id="${targetRagaId}"]`
        );
        if (janyaG) janyaG.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        // If a specific composition should also be highlighted, click it after janya expands
        if (targetCompId) {
          setTimeout(() => {
            const compG = document.querySelector(
              `#wheel-viewport .comp-node[data-id="${targetCompId}"]`
            );
            if (compG) compG.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            window._wheelSyncInProgress = false;   // re-enable after comp click settles
          }, 50);
        } else {
          window._wheelSyncInProgress = false;   // re-enable after janya click settles
        }
      }, 50);
    } else if (targetCompId) {
      // Mela-direct composition (no janya intermediary) — click comp after mela expands
      setTimeout(() => {
        const compG = document.querySelector(
          `#wheel-viewport .comp-node[data-id="${targetCompId}"]`
        );
        if (compG) compG.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        window._wheelSyncInProgress = false;
      }, 50);
    } else {
      window._wheelSyncInProgress = false;
    }
  };

})(); // end raga-wheel IIFE

/**
 * Programmatically expand the raga wheel to show the given raga or
 * the raga of the given composition. No-op if the raga view is not active.
 * @param {'raga'|'comp'} type
 * @param {string} id
 */
function syncRagaWheelToFilter(type, id) {
  if (currentView !== 'raga') return;
  if (window._wheelSyncInProgress) return;   // guard against re-entrant calls from within the wheel

  let ragaId = id;
  if (type === 'comp') {
    const comp = compositions.find(c => c.id === id);
    if (!comp || !comp.raga_id) return;
    ragaId = comp.raga_id;
  }

  const raga = ragas.find(r => r.id === ragaId);
  if (!raga) return;

  // Resolve to the melakarta: if janya, climb to parent_raga
  const melaId = raga.is_melakarta ? raga.id : raga.parent_raga;
  if (!melaId) return;

  const melaRaga = ragas.find(r => r.id === melaId);
  if (!melaRaga || !melaRaga.melakarta) return;

  // Redraw the wheel and expand the resolved mela (and optionally a specific composition)
  drawRagaWheel();
  const targetCompId = (type === 'comp') ? id : null;
  window._triggerMelaExpand(melaRaga.melakarta, raga.is_melakarta ? null : ragaId, targetCompId);
}

