// ── Two-view selector (ADR-030) ───────────────────────────────────────────────
// currentView: primary view — 'graph' (Guru-Shishya) | 'raga' (Mela-Janya)
// currentLayout: sub-mode within graph view — 'graph' | 'timeline'
//   declared in timeline_view.js (loaded before this file); do not re-declare here.
let currentView = 'graph'; // 'graph' | 'raga'

// Snapshot of graph-view node positions — saved whenever the user leaves the
// graph view so that returning to it restores the exact layout they had.
// Keyed by node id, value is {x, y} in Cytoscape graph-space.
// null means no snapshot yet (first load uses the cose layout).
let _savedGraphPositions = null;

// Save the current Cytoscape node positions into _savedGraphPositions.
// Called just before leaving the graph view (to raga).
function _saveGraphPositions() {
  _savedGraphPositions = {};
  cy.nodes().forEach(n => {
    const p = n.position();
    _savedGraphPositions[n.id()] = { x: p.x, y: p.y };
  });
}

// Restore node positions from _savedGraphPositions using a preset layout.
// Falls back to relayout() if no snapshot exists (first load).
function _restoreGraphPositions() {
  if (!_savedGraphPositions) {
    relayout();
    return;
  }
  const snap = _savedGraphPositions;
  cy.layout({
    name: 'preset',
    positions: node => snap[node.id()] || node.position(),
    animate: true,
    animationDuration: 400,
    fit: false,   // do NOT re-fit — preserve the user's zoom/pan
    padding: 0,
  }).run();
}

// ── _updateViewportToolbar: show/hide toolbar buttons based on view/layout ────
// | Button      | graph (graph) | graph (timeline) | raga                  |
// | btn-fit     | visible       | visible          | visible → wheelFit()  |
// | btn-relayout| visible       | visible          | hidden                |
// | btn-timeline| visible, off  | visible, active  | hidden                |
function _updateViewportToolbar(view, layout) {
  const btnRelayout = document.getElementById('btn-relayout');
  const btnTimeline = document.getElementById('btn-timeline');
  if (view === 'raga') {
    if (btnRelayout) btnRelayout.style.display = 'none';
    if (btnTimeline) btnTimeline.style.display = 'none';
  } else {
    if (btnRelayout) btnRelayout.style.display = '';
    if (btnTimeline) {
      btnTimeline.style.display = '';
      btnTimeline.classList.toggle('active', layout === 'timeline');
    }
  }
}

function switchView(name) {
  if (name === currentView) return;

  // ── Save positions before leaving graph view ──────────────────────────────
  if (currentView === 'graph') {
    _saveGraphPositions();
  }

  currentView = name;

  // Update primary view button states (only 'graph' and 'raga' buttons exist)
  ['graph', 'raga'].forEach(v => {
    const btn = document.getElementById('view-btn-' + v);
    if (btn) btn.classList.toggle('active', v === name);
  });

  _updateViewportToolbar(name, currentLayout);

  const filterBar = document.getElementById('filter-bar');
  const cyLabels  = document.getElementById('cy-labels');
  if (name === 'graph') {
    hideTimelineRuler();
    hideRagaWheel();
    document.getElementById('cy').style.display = '';
    if (cyLabels) cyLabels.style.display = '';
    if (filterBar) filterBar.style.display = 'flex';
    // Restore the sub-layout that was active when the user left
    if (currentLayout === 'timeline') {
      applyTimelineLayout();
    } else {
      currentLayout = 'graph';
      relayout();
    }
    if (typeof scheduleCyChipSync === 'function') scheduleCyChipSync();
  } else if (name === 'raga') {
    hideTimelineRuler();
    document.getElementById('cy').style.display = 'none';
    if (cyLabels) cyLabels.style.display = 'none';
    if (filterBar) filterBar.style.display = 'none';
    showRagaWheel(/* skipDraw when sync will redraw */ !!(typeof activeBaniFilter !== 'undefined' && activeBaniFilter));
    // Re-apply the current Bani filter to the wheel (ADR-025 sync gap)
    if (typeof activeBaniFilter !== 'undefined' && activeBaniFilter &&
        typeof syncRagaWheelToFilter === 'function') {
      syncRagaWheelToFilter(activeBaniFilter.type, activeBaniFilter.id);
    }
  }
}

// ── vpToggleTimeline: toggle timeline sub-layout within Guru-Shishya view ─────
function vpToggleTimeline() {
  if (currentView !== 'graph') return;
  if (currentLayout === 'timeline') {
    // Switch back to force-directed graph layout
    currentLayout = 'graph';
    hideTimelineRuler();
    relayout();
  } else {
    // Switch to timeline layout
    currentLayout = 'timeline';
    applyTimelineLayout();
  }
  _updateViewportToolbar(currentView, currentLayout);
}

// ── Viewport dispatcher functions (ADR-030) ───────────────────────────────────
// These are called by the #viewport-toolbar buttons and dispatch to the
// appropriate implementation depending on the active view.

function vpFit() {
  if (currentView === 'raga') {
    if (window.RagaWheel && typeof window.RagaWheel.fit === 'function') {
      window.RagaWheel.fit();
    } else {
      wheelFit();
    }
  } else {
    cy.fit();
  }
}

function vpRelayout() {
  if (currentView !== 'graph') return;
  relayout();
}

// ── Wheel viewport stub (ADR-030) ─────────────────────────────────────────────
// wheelFit: reset pan/zoom so the full wheel is centred and fits the SVG canvas.
function wheelFit() {
  if (window.RagaWheel && typeof window.RagaWheel.fit === 'function') {
    window.RagaWheel.fit();
    return;
  }
  window._wheelSetVx(0);
  window._wheelSetVy(0);
  window._wheelSetVscale(1);
  window._wheelApplyTransform();
}

// Backward-compatible wrapper (used by bani_flow.js and other callers)
function toggleLayout() {
  vpToggleTimeline();
}

// ── Raga Wheel — show / hide ───────────────────────────────────────────────────
function showRagaWheel(skipDraw) {
  const wheel = document.getElementById('raga-wheel');
  wheel.style.display = '';
  if (!skipDraw) drawRagaWheel();
}

function hideRagaWheel() {
  const wheel = document.getElementById('raga-wheel');
  wheel.style.display = 'none';
  wheel.innerHTML = '';
  // Abort SVG-level listeners so hidden wheel doesn't process stale events
  if (typeof _svgAbortFromOutside === 'function') _svgAbortFromOutside();
}

// ── Raga Wheel — SVG rendering (ADR-023) ──────────────────────────────────────
(function() {

// Cakra colour palette — sourced from THEME.cakra (ADR-028: single source of truth)
const CAKRA_COLORS = THEME.cakra;

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Read chip design tokens from CSS custom properties once per call.
// Uses the solid border colour as SVG fill base (avoids color-mix() SVG attr issues).
// ADR-073: mela labels remain on the legacy dark pill; only janya + comp use chip tokens.
function _readChipTokens() {
  const cs = getComputedStyle(document.documentElement);
  return {
    ragaBorder: cs.getPropertyValue('--chip-raga-border').trim() || '#6ec6a8',
    compBorder: cs.getPropertyValue('--chip-comp-border').trim() || '#d79921',
    radius:     parseFloat(cs.getPropertyValue('--chip-border-radius')) || 4,
  };
}

// Append a text label with a background pill to `layer`.
// cx, cy: centre of the label. extraAttrs: additional SVG text attributes (e.g. class).
// clickHandler: optional fn(e) — when provided the pill background <rect> becomes a
//   pointer-events hit target (pointer-events: all) and the handler fires on click.
//   This makes the entire pill area tappable on mobile, not just the circle node.
//   class and data-* attrs are hoisted onto the wrapper <g> so querySelectorAll works.
// chipVariant (in extraAttrs): 'raga' | 'comp' — token-driven chip styling matching
//   the panel chips (ADR-073). Omit for the legacy dark pill.
// rotate (in extraAttrs): SVG rotate() arg string (e.g. '45, 100, 200') — applied to
//   the wrapper <g> as transform:rotate(...). Used by mela rim labels.
// wrapOpacity (in extraAttrs): envelope opacity applied to the wrapper <g>. Supports
//   dimming effects; multiplies with per-rect fill opacity.
// Returns the <text> element.
function _labelWithBg(layer, text, cx, cy, fontSize, extraAttrs, clickHandler) {
  const PAD_X = 3, PAD_Y = 1.5;
  const variant = extraAttrs && extraAttrs.chipVariant;
  const glyph = variant === 'raga' ? '\u25c8\u00a0' : variant === 'comp' ? '\u266a\u00a0' : '';
  const displayText = glyph + text;
  // Estimate text width from character count (monospace approximation).
  // Include glyph prefix in width calculation when chip variant is active.
  const charW = fontSize * 0.55;
  const tw = displayText.length * charW + PAD_X * 2;
  const th = fontSize + PAD_Y * 2;

  // Wrapper group: carries class/data-* attrs for querySelectorAll selectors.
  // The group itself is never a hit target (no fill/stroke geometry).
  const wrapAttrs = { 'pointer-events': 'none' };
  if (extraAttrs) {
    if (extraAttrs.class) wrapAttrs.class = extraAttrs.class;
    if (extraAttrs.rotate !== undefined) wrapAttrs.transform = 'rotate(' + extraAttrs.rotate + ')';
    if (extraAttrs.wrapOpacity !== undefined) wrapAttrs.opacity = extraAttrs.wrapOpacity;
    for (const [k, v] of Object.entries(extraAttrs)) {
      if (k.startsWith('data-')) wrapAttrs[k] = v;
    }
  }
  const wrap = svgEl('g', wrapAttrs);

  // Chip variant: dark substrate with token-coloured border and text (ADR-073).
  // Using THEME.bgDeep as fill keeps the chip legible over any cakra-sector colour.
  // Mela/janya/comp labels all use chipVariant now; legacy dark-only pill is unused.
  let fillColor = THEME.labelOutline, fillOpacity = 0.72;
  let strokeColor = 'none', strokeWidth = 0;
  let textColor = (extraAttrs && extraAttrs.fill) || THEME.fg;
  const chipRadius = variant ? _readChipTokens().radius : 2;
  if (variant === 'raga' || variant === 'comp') {
    const tok = _readChipTokens();
    const base = variant === 'raga' ? tok.ragaBorder : tok.compBorder;
    fillColor   = THEME.bgDeep;  // near-opaque dark bg — legible over any cakra colour
    fillOpacity = 0.92;
    strokeColor = base;
    strokeWidth = 1;
    textColor   = base;
  }

  // The rect is the actual hit target when a clickHandler is provided.
  // pointer-events: all makes it respond even when fill is semi-transparent.
  const rectAttrs = {
    x: cx - tw / 2, y: cy - th / 2,
    width: tw, height: th, rx: chipRadius, ry: chipRadius,
    fill: fillColor, opacity: fillOpacity,
    'pointer-events': clickHandler ? 'all' : 'none'
  };
  if (strokeWidth) {
    rectAttrs.stroke = strokeColor;
    rectAttrs['stroke-width'] = strokeWidth;
  }
  const rectEl = svgEl('rect', rectAttrs);
  if (clickHandler) {
    rectEl.style.cursor = 'pointer';
    rectEl.addEventListener('click', (e) => { e.stopPropagation(); clickHandler(e); });
  }
  wrap.appendChild(rectEl);

  // Build text attrs — strip class, data-*, chipVariant, rotate, wrapOpacity (handled above).
  const _SKIP = new Set(['class', 'chipVariant', 'rotate', 'wrapOpacity']);
  const textAttrs = {};
  if (extraAttrs) {
    for (const [k, v] of Object.entries(extraAttrs)) {
      if (!_SKIP.has(k) && !k.startsWith('data-')) textAttrs[k] = v;
    }
  }
  // Override fill with chip colour when variant is active.
  if (variant === 'raga' || variant === 'comp') textAttrs.fill = textColor;
  const t = svgEl('text', Object.assign({
    x: cx, y: cy,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'pointer-events': 'none'
  }, textAttrs));
  t.textContent = displayText;
  wrap.appendChild(t);

  layer.appendChild(wrap);
  return t;
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
  const svgH = svg.clientHeight || 600;
  // Always render in the bottom-left corner — far from the wheel centre where
  // nodes are tapped, so the caption never occludes the target element.
  const tx = PAD;
  const ty = svgH - th - PAD;
  const g = svgEl('g', { id: 'raga-wheel-tooltip', 'pointer-events': 'none' });
  g.appendChild(svgEl('rect', {
    x: tx, y: ty, width: tw, height: th, rx: 4, ry: 4,
    fill: THEME.labelOutline, stroke: THEME.edgeLine, 'stroke-width': 1, opacity: 0.95
  }));
  lines.forEach((line, i) => {
    const t = svgEl('text', {
      x: tx + PAD, y: ty + PAD + LINE_H * i + LINE_H * 0.75,
      fill: i === 0 ? THEME.fg : THEME.fgMuted,
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

// AbortController for SVG-level event listeners — aborted and re-created on
// each drawRagaWheel() call so stale handlers from previous draws don't
// accumulate on the persistent <svg> element.
let _svgListenerController = null;

// Pan/zoom state — inside the IIFE but exposed on window so orientRagaWheel
// (defined outside the IIFE) can read/write them for the pan animation.
let _dragging = false, _dragStartX = 0, _dragStartY = 0, _dragVX = 0, _dragVY = 0;
let _dragMoved = false;
let _gestureMode = null; // 'pan' | 'rotate' | 'pinch' | null
let _rotateStartAngle = 0, _rotateStartRotation = 0;

const RagaWheel = {
  _state: {
    panX: 0,
    panY: 0,
    scale: 1,
    rotation: 0,
  },
  _geometry: {
    cx: 0,
    cy: 0,
    rOuter: 0,
  },
  _clampScale(v) {
    return Math.min(4.0, Math.max(0.5, v));
  },
  _normaliseRotation(rad) {
    let r = rad;
    while (r > Math.PI) r -= Math.PI * 2;
    while (r < -Math.PI) r += Math.PI * 2;
    return r;
  },
  pan(dx, dy) {
    this._state.panX += dx;
    this._state.panY += dy;
    this._applyTransform();
  },
  zoom(factor, anchor) {
    if (!isFinite(factor) || factor <= 0) return;
    const oldScale = this._state.scale;
    const newScale = this._clampScale(oldScale * factor);
    if (Math.abs(newScale - oldScale) < 1e-6) return;
    const a = anchor || { x: this._geometry.cx, y: this._geometry.cy };
    const actualFactor = newScale / oldScale;
    this._state.panX = a.x - actualFactor * (a.x - this._state.panX);
    this._state.panY = a.y - actualFactor * (a.y - this._state.panY);
    this._state.scale = newScale;
    this._applyTransform();
  },
  rotate(dTheta, anchor) {
    if (!isFinite(dTheta)) return;
    // Off-centre anchors are reserved for future use.
    this._state.rotation = this._normaliseRotation(this._state.rotation + dTheta);
    this._applyTransform();
  },
  fit() {
    this._state.panX = 0;
    this._state.panY = 0;
    this._state.scale = 1;
    this._state.rotation = 0;
    this._applyTransform();
  },
  centreOn(targetX, targetY, targetScale) {
    _animateToTarget(targetX, targetY, targetScale);
  },
  alignLabelTo(angleRad) {
    this._state.rotation = this._normaliseRotation(-angleRad);
    this._applyTransform();
  },
  isRimDrag(svgX, svgY) {
    const dx = svgX - this._geometry.cx;
    const dy = svgY - this._geometry.cy;
    return Math.hypot(dx, dy) > this._geometry.rOuter;
  },
  _applyTransform() {
    const vp = document.getElementById('wheel-viewport');
    if (!vp) return;
    const s = this._state;
    const g = this._geometry;
    const deg = s.rotation * 180 / Math.PI;
    vp.setAttribute(
      'transform',
      `translate(${s.panX},${s.panY}) scale(${s.scale}) rotate(${deg} ${g.cx} ${g.cy})`
    );
  },
};
window.RagaWheel = RagaWheel;

// ── Pointer Events state (ADR-035) ────────────────────────────────────────────
// Multi-touch map: pointerId → {x, y}
const _activePointers = new Map();
let _pinchStartDist = null, _pinchStartScale = 1;
// Taphold (long-press) — fires openMetaInspector after 500ms on stationary touch
let _tapHoldTimer = null, _tapHoldTarget = null;
// Double-tap detection — fires wheelFit() when two taps hit SVG background within 300ms
let _lastTapTime = 0, _lastTapTarget = null;
// Guard: timestamp of the last synthetic click dispatched by _onPointerEnd.
// Used to suppress duplicate native click events that some browsers fire
// despite e.preventDefault() on pointerdown.
let _wheelLastSyntheticClick = 0;

function _startTapHoldTimer(e) {
  _tapHoldTarget = e.target;
  _tapHoldTimer = setTimeout(() => {
    if (!_tapHoldTarget) return;
    const el = _tapHoldTarget.closest('[data-id]') || _tapHoldTarget.closest('[data-mela]');
    if (!el) return;
    // Determine node type from containing group class
    const g = el.closest('.mela-node, .janya-node, .comp-node, .musc-node');
    if (!g) return;
    let nodeType, nodeId;
    if (g.classList.contains('mela-node')) {
      nodeType = 'mela';
      const n = parseInt(g.getAttribute('data-mela'));
      const melaId = g.getAttribute('data-id');
      // Re-use click handler's raga lookup via the DOM data-id attribute
      nodeId = melaId || null;
    } else if (g.classList.contains('janya-node')) {
      nodeType = 'janya'; nodeId = g.getAttribute('data-id');
    } else if (g.classList.contains('comp-node')) {
      nodeType = 'composition'; nodeId = g.getAttribute('data-id');
    } else if (g.classList.contains('musc-node')) {
      nodeType = null;  // musicians open via click, not inspector
    }
    if (nodeType && nodeId && typeof openMetaInspector === 'function') {
      openMetaInspector(nodeType, { id: nodeId });
    }
    _tapHoldTarget = null;
    _tapHoldTimer = null;
  }, 500);
}

function _cancelTapHoldTimer() {
  if (_tapHoldTimer) { clearTimeout(_tapHoldTimer); _tapHoldTimer = null; }
  _tapHoldTarget = null;
}

function _getPinchDistance() {
  const pts = [..._activePointers.values()];
  return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
}

function _toSvgPoint(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// Apply the current pan/zoom transform to the viewport group.
// Looks up #wheel-viewport by ID so it works after a full SVG rebuild.
function _applyTransform() {
  RagaWheel._applyTransform();
}

// Expose pan/zoom state and transform function on window so orientRagaWheel
// (outside this IIFE) can drive the pan animation.
window._wheelGetVx      = () => RagaWheel._state.panX;
window._wheelGetVy      = () => RagaWheel._state.panY;
window._wheelGetVscale  = () => RagaWheel._state.scale;
window._wheelSetVx      = (v) => { RagaWheel._state.panX = v; };
window._wheelSetVy      = (v) => { RagaWheel._state.panY = v; };
window._wheelSetVscale  = (v) => { RagaWheel._state.scale = v; };
window._wheelApplyTransform = () => _applyTransform();

// Expose abort helper so hideRagaWheel (outside IIFE) can clean up SVG listeners
window._svgAbortFromOutside = () => {
  if (_svgListenerController) { _svgListenerController.abort(); _svgListenerController = null; }
};

// Re-append _labelLayer so it is always the last (topmost) child of vp
function _bringLabelsToFront(vp) {
  if (_labelLayer && _labelLayer.parentNode === vp) vp.appendChild(_labelLayer);
}

window.drawRagaWheel = function() {
  const svg = document.getElementById('raga-wheel');
  svg.innerHTML = '';
  // Abort previous SVG-level listeners so they don't accumulate across redraws
  if (_svgListenerController) _svgListenerController.abort();
  _svgListenerController = new AbortController();
  const _signal = _svgListenerController.signal;
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
  const NR_JANYA = Math.max(3,  minDim * 0.008);
  const NR_COMP  = Math.max(3,  minDim * 0.008);
  const NR_MUSC  = Math.max(3,  minDim * 0.008);

  RagaWheel._geometry.cx = cx;
  RagaWheel._geometry.cy = cy;
  RagaWheel._geometry.rOuter = R_MUSC;

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
      // Skip non-composition performance types — only valid compositions appear in the wheel.
      // Alapanas, RTPs, tanam, and any display_title that looks like an improvisation are excluded.
      const isRtp = (perf.type === 'rtp' || perf.type === 'alapana' || perf.type === 'tanam' ||
                     (perf.display_title && /ragam.tanam|alapana|rtp/i.test(perf.display_title)));
      if (isRtp) return;

      // Skip if this performance's composition is already in compsByRaga from Source 1
      if (perf.composition_id && _seenPerfIds.has(perf.composition_id)) return;
      const syntheticId = perf.composition_id ||
        (perf.recording_id + '__' + (perf.display_title || perf.title || ''));
      if (_seenPerfIds.has(syntheticId)) return;
      _seenPerfIds.add(syntheticId);
      if (!compsByRaga[ragaId]) compsByRaga[ragaId] = [];
      compsByRaga[ragaId].push({
        id:            syntheticId,
        title:         perf.display_title || perf.title || ragaId,
        raga_id:       ragaId,
        _isPerf:       true,
        _isRtp:        false,
        _recording_id: perf.recording_id || null,
        _perf_index:   perf.performance_index != null ? perf.performance_index : null,
        concert:       perf.short_title || perf.title || '',
        date:          perf.date || '',
        performers:    perf.performers || [],
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
      // Only include tracks that are tied to a canonical composition.
      // Tracks without a composition_id are raga-level improvisations
      // (alapanas, RTPs, tanam) — exclude them from the wheel.
      if (!tr.composition_id) return;
      // Belt-and-suspenders: also exclude by label pattern
      if (tr.label && /ragam.tanam|alapana|\brtp\b/i.test(tr.label)) return;
      // If the composition is already in Source 1, skip
      if (_seenPerfIds.has(tr.composition_id)) return;
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

  // ── melasWithMusic: set of mela IDs whose subtree has at least one composition/recording ──
  // A mela is "live" if compsByRaga has entries for the mela itself OR for any of its janyas.
  const melasWithMusic = new Set();
  Object.keys(melaByNum).forEach(n => {
    const mela = melaByNum[n];
    if (!mela) return;
    if ((compsByRaga[mela.id] || []).length > 0) { melasWithMusic.add(mela.id); return; }
    const janyas = janyasByMela[mela.id] || [];
    if (janyas.some(j => (compsByRaga[j.id] || []).length > 0)) melasWithMusic.add(mela.id);
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

  // Background rect — transparent hit-target for pan/zoom gestures.
  // Single-click on empty space collapses the full-mobile player (exploration
  // intent) but otherwise does nothing to prevent accidental resets while
  // exploring.  Double-click still resets the viewport pan/zoom.
  const bg = svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
  bg.addEventListener('click', e => {
    if (e.target !== bg) return;
    if (typeof window._collapseMobilePlayer === 'function' &&
        document.querySelector('.media-player.full-mobile')) {
      window._collapseMobilePlayer();
    }
  });
  svg.appendChild(bg);

  // Viewport group — all wheel content goes inside this <g>
  const vp = svgEl('g', { id: 'wheel-viewport' });
  svg.appendChild(vp);
  _applyTransform();  // restore saved pan/zoom after SVG rebuild

  // Wheel zoom (mouse wheel) — clamped to sane limits so the user cannot
  // accidentally scroll the wheel completely out of view or into a pixel.
  // ZOOM_MIN/MAX define the hard floor/ceiling.  The per-event factor is kept
  // small (≤5% per tick) so trackpad momentum scrolling feels gradual rather
  // than snapping straight to a limit.
  const ZOOM_MIN = 0.5, ZOOM_MAX = 4.0;
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Normalise deltaY: trackpads send pixel-mode values (deltaMode=0) that
    // can be large; clamp the effective delta to ±1 "notch" worth of zoom.
    const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 50);
    const factor = Math.pow(1.05, -delta / 50);   // ≤5% per 50-pixel notch
    // Zoom toward cursor position
    const p = _toSvgPoint(svg, e.clientX, e.clientY);
    RagaWheel.zoom(factor, { x: p.x, y: p.y });
  }, { passive: false, signal: _signal });

  // Wheel pan/pinch-zoom — Pointer Events API (ADR-035)
  // Replaces mousedown/mousemove/mouseup to work on both desktop and touch.
  // The `wheel` event handler for scroll-zoom is retained for desktop (above).
  // Stale handlers are cleaned up via _svgListenerController.abort() at the
  // top of drawRagaWheel().

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    _activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (_activePointers.size === 1) {
      _dragging = true;
      _gestureMode = 'pan';
      _dragMoved = false;
      _dragStartX = e.clientX; _dragStartY = e.clientY;
      _dragVX = RagaWheel._state.panX; _dragVY = RagaWheel._state.panY;

      // Rim-drag rotation only starts from background (not chip elements).
      if (e.target === bg || e.target === svg) {
        const p = _toSvgPoint(svg, e.clientX, e.clientY);
        if (RagaWheel.isRimDrag(p.x, p.y)) {
          _gestureMode = 'rotate';
          _rotateStartAngle = Math.atan2(p.y - RagaWheel._geometry.cy, p.x - RagaWheel._geometry.cx);
          _rotateStartRotation = RagaWheel._state.rotation;
        }
      }

      if (e.pointerType !== 'mouse') _startTapHoldTimer(e);
      svg.style.cursor = 'grabbing';
    } else if (_activePointers.size === 2) {
      _gestureMode = 'pinch';
      _cancelTapHoldTimer();
      _dragMoved = true;  // suppress tap action when second finger lands
      _pinchStartDist = _getPinchDistance();
      _pinchStartScale = RagaWheel._state.scale;
    }
  }, { signal: _signal });

  svg.addEventListener('pointermove', (e) => {
    if (!_activePointers.has(e.pointerId)) return;
    _activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (_activePointers.size === 1 && _dragging && _gestureMode === 'pan') {
      const dx = e.clientX - _dragStartX, dy = e.clientY - _dragStartY;
      if (!_dragMoved && Math.hypot(dx, dy) > 5) {
        _dragMoved = true;
        _cancelTapHoldTimer();
      }
      RagaWheel._state.panX = _dragVX + dx;
      RagaWheel._state.panY = _dragVY + dy;
      _applyTransform();
    } else if (_activePointers.size === 1 && _dragging && _gestureMode === 'rotate') {
      const p = _toSvgPoint(svg, e.clientX, e.clientY);
      const currentAngle = Math.atan2(p.y - RagaWheel._geometry.cy, p.x - RagaWheel._geometry.cx);
      const delta = currentAngle - _rotateStartAngle;
      RagaWheel._state.rotation = RagaWheel._normaliseRotation(_rotateStartRotation + delta);
      if (!_dragMoved && Math.abs(delta) > (2 * Math.PI / 180)) {
        _dragMoved = true;
        _cancelTapHoldTimer();
      }
      _applyTransform();
    } else if (_activePointers.size === 2 && _pinchStartDist !== null) {
      const newDist = _getPinchDistance();
      const factor = newDist / _pinchStartDist;
      const ZOOM_MIN = 0.5, ZOOM_MAX = 4.0;
      const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, _pinchStartScale * factor));
      // Zoom toward midpoint of the two touch points
      const pts = [..._activePointers.values()];
      const rect = svg.getBoundingClientRect();
      const mx = (pts[0].x + pts[1].x) / 2 - rect.left;
      const my = (pts[0].y + pts[1].y) / 2 - rect.top;
      const oldScale = RagaWheel._state.scale;
      if (Math.abs(newScale - oldScale) >= 1e-6) {
        const actualFactor = newScale / oldScale;
        RagaWheel._state.panX = mx - actualFactor * (mx - RagaWheel._state.panX);
        RagaWheel._state.panY = my - actualFactor * (my - RagaWheel._state.panY);
        RagaWheel._state.scale = newScale;
        _applyTransform();
      }
    }
  }, { signal: _signal });

  function _onPointerEnd(e) {
    _activePointers.delete(e.pointerId);
    _cancelTapHoldTimer();
    if (_activePointers.size < 2) _pinchStartDist = null;

    // ── Pinch→pan handoff: re-anchor drag origin to the remaining finger ──
    // Without this, the single-finger pan path uses stale _dragStartX/Y and
    // _dragVX/Y from the original pointerdown (before the pinch changed
    // _vx/_vy), causing the viewport to jump back to its pre-pinch position.
    if (_activePointers.size === 1 && _dragging) {
      const remaining = [..._activePointers.values()][0];
      _dragStartX = remaining.x;
      _dragStartY = remaining.y;
      _dragVX = RagaWheel._state.panX;
      _dragVY = RagaWheel._state.panY;
      if (_gestureMode === 'pinch') _gestureMode = 'pan';
    }

    if (_activePointers.size === 0) {
      _dragging = false;
      _gestureMode = null;
      svg.style.cursor = '';

      // ADR-035 fix: e.preventDefault() on pointerdown suppresses native click
      // events (the spec says no compatibility mouse events shall fire).
      // setPointerCapture redirects pointerup to the SVG, so e.target is SVG,
      // not the element under the pointer.  Resolve the real target and
      // re-dispatch a synthetic click so mela/janya/comp handlers still fire.
      const realTarget = document.elementFromPoint(e.clientX, e.clientY);

      // Double-tap on SVG background → wheelFit() (mobile supplement to dblclick)
      if (!_dragMoved && realTarget && (realTarget === bg || realTarget === svg)) {
        const now = Date.now();
        if (now - _lastTapTime < 300 && _lastTapTarget === bg) {
          RagaWheel.fit();
          _lastTapTime = 0; _lastTapTarget = null;
          return;
        }
        _lastTapTime = now; _lastTapTarget = bg;
      }

      // Re-dispatch click on the real element under the pointer (tap, not drag)
      if (!_dragMoved && realTarget) {
        _wheelLastSyntheticClick = Date.now();
        realTarget.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true,
          clientX: e.clientX, clientY: e.clientY
        }));
      }
    }
  }
  svg.addEventListener('pointerup',     _onPointerEnd, { signal: _signal });
  svg.addEventListener('pointercancel', _onPointerEnd, { signal: _signal });

  // Block native click events that some browsers fire despite
  // e.preventDefault() on pointerdown.  Our synthetic clicks
  // have isTrusted=false; browser-generated ones have isTrusted=true.
  svg.addEventListener('click', (e) => {
    if (e.isTrusted && Date.now() - _wheelLastSyntheticClick < 300) {
      e.stopImmediatePropagation();
    }
  }, { capture: true, signal: _signal });  // capturing phase — runs before any bubble-phase handlers

  // Double-click on empty canvas → reset pan/zoom (desktop; guards: not a pan-end, not a node dblclick)
  svg.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (_dragMoved) { _dragMoved = false; return; }
    RagaWheel.fit();
  }, { signal: _signal });

  // Cakra sectors — appended to viewport group (vp) for pan/zoom
  for (let cakra = 1; cakra <= 12; cakra++) {
    const startDeg = (cakra - 1) * 30, endDeg = cakra * 30;
    const color = CAKRA_COLORS[cakra] || THEME.borderStrong;
    vp.appendChild(svgEl('path', {
      d: sectorPath(cx, cy, R_INNER, R_CAKRA, startDeg, endDeg),
      fill: color, opacity: 0.35, stroke: THEME.labelOutline, 'stroke-width': 1
    }));
    // Fix 6: cakra name only, rotated to follow the arc — flip on left half so text is never upside-down
    const midDeg = startDeg + 15;
    const lp = polar(cx, cy, (R_INNER + R_CAKRA) / 2, midDeg);
    // Right half (0–180°): rotate text so it reads clockwise; left half (180–360°): flip 180° to stay upright
    const cakraRotDeg = midDeg <= 180 ? midDeg - 90 : midDeg + 90;
    const nameLbl = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: THEME.fg, 'font-size': Math.max(8, minDim * 0.015) + 'px',
      'font-weight': 'bold', 'pointer-events': 'none',
      transform: `rotate(${cakraRotDeg}, ${lp.x}, ${lp.y})`
    });
    nameLbl.textContent = CAKRA_NAMES[cakra] || String(cakra);
    vp.appendChild(nameLbl);
  }

  vp.appendChild(svgEl('circle', {
    cx, cy, r: R_CAKRA, fill: 'none', stroke: THEME.edgeLine, 'stroke-width': 1
  }));

  // Fix 7: two-pass rendering — all circles first, then all labels on top
  // Pass 1: circles + interaction (no labels yet)
  const melaCirleGroups = [];
  for (let n = 1; n <= 72; n++) {
    const angleDeg = (n - 1) * 5;
    const pos = polar(cx, cy, R_MELA, angleDeg);
    const raga = melaByNum[n];
    const cakra = Math.ceil(n / 6);
    const color = CAKRA_COLORS[cakra] || THEME.borderStrong;

    const isLive = raga && melasWithMusic.has(raga.id);
    const origOpacity = isLive ? 1 : (raga ? 0.28 : 0.5);
    const g = svgEl('g', { class: 'mela-node', 'data-mela': n, 'data-id': raga ? raga.id : '' });
    const circle = svgEl('circle', {
      cx: pos.x, cy: pos.y, r: NR_MELA,
      fill: raga ? color : THEME.bgPanel,
      stroke: raga ? THEME.fg : THEME.edgeLine,
      'stroke-width': raga ? 1.5 : 1,
      opacity: origOpacity,
      cursor: isLive ? 'pointer' : 'default',
      'data-mela': n,
      'data-orig-opacity': origOpacity
    });
    g.appendChild(circle);
    // Invisible hit-target circle for touch accuracy (ADR-035 §7)
    const hitCircleMela = svgEl('circle', {
      cx: pos.x, cy: pos.y, r: NR_MELA + 8,
      fill: 'transparent', 'pointer-events': 'all', 'stroke': 'none'
    });
    g.appendChild(hitCircleMela);

    if (isLive) {
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
          circle.setAttribute('stroke', THEME.accentSelect);
          circle.setAttribute('stroke-width', 2.5);
          _expandedMela = raga.id;
          // Dim all other mela nodes so the selected one stands out
          vp.querySelectorAll('.mela-node circle[data-mela]').forEach(c => {
            const melaG = c.closest('.mela-node');
            const nodeId = melaG ? melaG.getAttribute('data-id') : '';
            if (nodeId !== raga.id) {
              c.setAttribute('opacity', '0.15');
            }
          });
          // Dim all other mela labels
          if (_labelLayer) {
            _labelLayer.querySelectorAll('.mela-label').forEach(lbl => {
              if (lbl.getAttribute('data-id') !== raga.id) {
                lbl.setAttribute('opacity', '0.12');
              }
            });
          }
          // Silently load bani-flow data (no panel pop-open).
          // Guard: prevent syncRagaWheelToFilter from redrawing the wheel.
          window._wheelSyncInProgress = true;
          if (typeof applyBaniFilter === 'function') applyBaniFilter('raga', raga.id);
          window._wheelSyncInProgress = false;
          // Auto-zoom to bring the expanded mela into focus
          _animateToTarget(pos.x, pos.y, 1.6);
        }
      });
      g.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (_dragMoved) return;
        if (typeof openMetaInspector === 'function') openMetaInspector('mela', raga);
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
    const isLiveLbl = raga && melasWithMusic.has(raga.id);
    const melaLblOpacity = isLiveLbl ? 1 : (raga ? 0.35 : 1);
    const melaFontSize = Math.max(7, minDim * 0.012);
    // All mela labels now use the raga chip style (ADR-073: melas are ragas).
    // rotate wraps the chip <g> so the rect+text rotate together around lp.
    // wrapOpacity provides the inactive-mela dimming envelope.
    // The rect click target replaces the prior pointer-events:all on <text>.
    _labelWithBg(_labelLayer, raga ? raga.name : String(n), lp.x, lp.y, melaFontSize, {
      'font-size': melaFontSize + 'px',
      class: 'mela-label',
      'data-orig-opacity': melaLblOpacity,
      'data-id': raga ? raga.id : '',
      wrapOpacity: melaLblOpacity,
      rotate: `${melaRotDeg}, ${lp.x}, ${lp.y}`,
      chipVariant: 'raga'
    }, isLiveLbl ? (e) => {
      const melaG = vp.querySelector(`.mela-node[data-id="${CSS.escape(raga.id)}"]`);
      if (melaG) melaG.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY
      }));
    } : null);
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
  vp.querySelectorAll('.mela-node circle[data-mela]').forEach(c => {
    const n = parseInt(c.getAttribute('data-mela'));
    const raga = melaByNum[n];
    c.setAttribute('stroke', raga ? THEME.fg : THEME.edgeLine);
    c.setAttribute('stroke-width', raga ? 1.5 : 1);
    // Restore original opacity (Bug fix: mela nodes stayed dimmed after comp collapse)
    const orig = c.getAttribute('data-orig-opacity');
    if (orig) c.setAttribute('opacity', orig);
  });
  // Restore mela label opacity
  if (_labelLayer) {
    _labelLayer.querySelectorAll('.mela-label').forEach(lbl => {
      const orig = lbl.getAttribute('data-orig-opacity');
      if (orig) lbl.setAttribute('opacity', orig);
    });
  }
  vp.querySelectorAll('.janya-node circle').forEach(c => c.setAttribute('opacity', '0.75'));
  _expandedMela = null; _expandedJanya = null; _expandedComp = null;
  hideWheelTooltip();
}

// Animate the wheel viewport to centre on (targetX, targetY) at the given scale.
// Used by click handlers to "land" on a node after exploding it.
function _animateToTarget(targetX, targetY, targetScale) {
  const svg = document.getElementById('raga-wheel');
  if (!svg) return;
  const W = svg.clientWidth  || svg.parentElement.clientWidth  || 800;
  const H = svg.clientHeight || svg.parentElement.clientHeight || 600;
  const targetVX = W / 2 - targetScale * targetX;
  const targetVY = H / 2 - targetScale * targetY;

  const startVX = RagaWheel._state.panX;
  const startVY = RagaWheel._state.panY;
  const startScale = RagaWheel._state.scale;
  const DURATION = 400;
  const startTime = performance.now();

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / DURATION);
    const e = easeInOutCubic(t);
    RagaWheel._state.panX = startVX + (targetVX - startVX) * e;
    RagaWheel._state.panY = startVY + (targetVY - startVY) * e;
    RagaWheel._state.scale = startScale + (targetScale - startScale) * e;
    _applyTransform();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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
      fill: THEME.borderStrong, 'font-size': '11px', 'pointer-events': 'none'
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

      const janyaConnLine = svgEl('line', {
        x1: melaPos.x, y1: melaPos.y, x2: jPos.x, y2: jPos.y,
        stroke: melaColor, 'stroke-width': 1, opacity: 0.5, 'pointer-events': 'none'
      });
      g.appendChild(janyaConnLine);

      const jCircle = svgEl('circle', {
        cx: jPos.x, cy: jPos.y, r: NR_JANYA,
        fill: melaColor, opacity: 0.75, stroke: THEME.fg, 'stroke-width': 1, cursor: 'pointer'
      });
      const jg = svgEl('g', { class: 'janya-node', 'data-id': janya.id });
      jg.style.cursor = 'pointer';
      jg._connLine = janyaConnLine;  // stash for retrieval by comp click handler
      jg.appendChild(jCircle);
      // Invisible hit-target circle for touch accuracy (ADR-035 §7)
      jg.appendChild(svgEl('circle', {
        cx: jPos.x, cy: jPos.y, r: NR_JANYA + 8,
        fill: 'transparent', 'pointer-events': 'all', stroke: 'none'
      }));

      jg.addEventListener('mouseenter', () => {
        const lines = [janya.name, 'Janya of ' + raga.name];
        if (janya.notes) lines.push(janya.notes.slice(0, 60) + (janya.notes.length > 60 ? '\u2026' : ''));
        showWheelTooltip(svg, jPos.x, jPos.y, lines);
      });
      jg.addEventListener('mouseleave', hideWheelTooltip);
      jg.addEventListener('click', (e) => {
        e.stopPropagation();
        vp.querySelectorAll('.comp-group, .musc-group').forEach(el => el.remove());
        // Remove comp and musician labels only — preserve janya labels (.sat-label-janya)
        if (_labelLayer) _labelLayer.querySelectorAll('.sat-label:not(.sat-label-janya)').forEach(el => el.remove());
        vp.querySelectorAll('.janya-node circle').forEach(c => {
          c.setAttribute('stroke', THEME.fg); c.setAttribute('stroke-width', 1);
          c.setAttribute('opacity', '0.35');   // dim all janyas first
        });
        // Dim all janya connector lines
        vp.querySelectorAll('.janya-group line').forEach(l => {
          l.setAttribute('opacity', '0.1');
        });
        // Dim all janya labels
        if (_labelLayer) {
          _labelLayer.querySelectorAll('.sat-label-janya').forEach(el => {
            el.setAttribute('opacity', '0.2');
          });
        }
        if (_expandedJanya === janya.id) {
          // un-dim all on collapse
          vp.querySelectorAll('.janya-node circle').forEach(c => c.setAttribute('opacity', '0.75'));
          vp.querySelectorAll('.janya-group line').forEach(l => l.setAttribute('opacity', '0.5'));
          if (_labelLayer) {
            _labelLayer.querySelectorAll('.sat-label-janya').forEach(el => {
              el.setAttribute('opacity', '1');
            });
          }
          _expandedJanya = null;
          return;
        }
        jCircle.setAttribute('stroke', THEME.accentSelect);
        jCircle.setAttribute('stroke-width', 2.5);
        jCircle.setAttribute('opacity', '0.75');   // restore selected janya to full opacity
        // Restore selected janya's connector line and labels
        if (jg._connLine) jg._connLine.setAttribute('opacity', '0.5');
        if (_labelLayer) {
          _labelLayer.querySelectorAll('.sat-label-janya').forEach(el => {
            if (el.getAttribute('data-janya-id') === janya.id) {
              el.setAttribute('opacity', '1');
            }
          });
        }
        _expandedJanya = janya.id;
        _expandedComp = null;
        _expandComps(vp, svg, janya, jAngle, jPos, cx, cy,
          R_COMP, R_MUSC, NR_JANYA, NR_COMP, NR_MUSC,
          compsByRaga, rtpByRaga, melaColor, minDim);
        // Silently load bani-flow data (no panel pop-open).
        // Guard: prevent syncRagaWheelToFilter from redrawing the wheel.
        window._wheelSyncInProgress = true;
        if (typeof applyBaniFilter === 'function') applyBaniFilter('raga', janya.id);
        window._wheelSyncInProgress = false;
        // Auto-zoom to bring the expanded janya into focus
        _animateToTarget(jPos.x, jPos.y, 2.0);
      });
      jg.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (_dragMoved) return;
        if (typeof openMetaInspector === 'function') openMetaInspector('janya', janya);
      });
      // Janya label goes into _labelLayer so it is always on top.
      // Passing a clickHandler makes the pill a pointer target — improves touch accuracy.
      if (_labelLayer) {
        const jFontSize = Math.max(7, minDim * 0.011);
        _labelWithBg(_labelLayer, janya.name, jPos.x, jPos.y, jFontSize, {
          fill: THEME.fgSub, 'font-size': jFontSize + 'px',
          class: 'sat-label sat-label-janya', 'data-janya-id': janya.id,
          chipVariant: 'raga'
        }, (e) => {
          jg.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY
          }));
        });
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
      fill: THEME.borderStrong, 'font-size': '11px', 'pointer-events': 'none'
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

    const connLine = svgEl('line', {
      x1: jPos.x, y1: jPos.y, x2: cPos.x, y2: cPos.y,
      stroke: parentColor, 'stroke-width': 1, opacity: 0.4, 'pointer-events': 'none'
    });
    g.appendChild(connLine);

    // RTP nodes are diamond-shaped (rotated square) in a distinct colour
    const isRtp = item._isRtp;
    const cCircle = svgEl('circle', {
      cx: cPos.x, cy: cPos.y, r: NR_COMP,
      fill: isRtp ? THEME.nodeHasTracks : THEME.accent,
      opacity: 0.85, stroke: THEME.fg, 'stroke-width': 1, cursor: 'pointer'
    });
    const cg = svgEl('g', { class: 'comp-node', 'data-id': item.id || '' });
    cg.appendChild(cCircle);
    // Label goes into _labelLayer so it is always rendered on top of all circles.
    // Passing a clickHandler makes the pill a pointer target — improves touch accuracy.
    if (_labelLayer) {
      const cFontSize = Math.max(6, minDim * 0.010);
      _labelWithBg(_labelLayer, item.title || '', cPos.x, cPos.y, cFontSize, {
        fill: THEME.fgSub, 'font-size': cFontSize + 'px',
        class: 'sat-label sat-label-comp', 'data-comp-id': item.id || '',
        chipVariant: 'comp'
      }, (e) => {
        cg.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY
        }));
      });
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
    cg.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (_dragMoved) return;
      if (typeof openMetaInspector === 'function') openMetaInspector('composition', item);
    });
    cg.addEventListener('click', (e) => {
      e.stopPropagation();
      vp.querySelectorAll('.musc-group').forEach(el => el.remove());
      if (_labelLayer) _labelLayer.querySelectorAll('.sat-label-musc').forEach(el => el.remove());
      vp.querySelectorAll('.comp-node circle').forEach(c => {
        c.setAttribute('stroke', THEME.fg); c.setAttribute('stroke-width', 1);
        c.setAttribute('opacity', '0.35');   // dim all comp nodes first
      });
      // Dim all connector lines (mela→janya and janya→comp)
      vp.querySelectorAll('.janya-group line, .comp-group line').forEach(l => {
        l.setAttribute('opacity', '0.08');
      });
      if (_expandedComp === item.id) {
        // Second click on already-selected comp → open the bani-flow panel.
        if (typeof hideClickNudge === 'function') hideClickNudge();
        window._wheelSyncInProgress    = true;
        window._wheelOriginatedTrigger = true;
        if (!item._isPerf) {
          triggerBaniSearch('comp', item.id);
        } else if (item._recording_id && item._perf_index != null) {
          triggerBaniSearch('perf', item._recording_id + '::' + item._perf_index);
        } else if (item._ytVid) {
          triggerBaniSearch('yt', item._ytVid + '::' + (item.raga_id || janya.id));
        } else {
          triggerBaniSearch('raga', item.raga_id || janya.id);
        }
        window._wheelSyncInProgress    = false;
        window._wheelOriginatedTrigger = false;
        return;
      }
      // Dim all mela nodes except the currently expanded one so the path lights up
      vp.querySelectorAll('.mela-node circle[data-mela]').forEach(c => {
        const melaId = c.closest('.mela-node') && c.closest('.mela-node').getAttribute('data-id');
        c.setAttribute('opacity', melaId === _expandedMela ? '1' : '0.2');
      });
      // Dim all janya nodes except the parent of this comp (janya.id).
      // For mela-direct comps, janya IS the mela — dim all janya nodes.
      let parentJanyaConnLine = null;
      vp.querySelectorAll('.janya-node').forEach(jn => {
        const jid = jn.getAttribute('data-id');
        const jCircle = jn.querySelector('circle');
        if (jid === janya.id) {
          if (jCircle) jCircle.setAttribute('opacity', '0.75');
          parentJanyaConnLine = jn._connLine || null;
        } else {
          if (jCircle) jCircle.setAttribute('opacity', '0.15');
        }
      });
      // Dim non-parent janya labels; keep parent janya label visible
      if (_labelLayer) {
        _labelLayer.querySelectorAll('.sat-label-janya').forEach(el => {
          el.setAttribute('opacity', el.getAttribute('data-janya-id') === janya.id ? '1' : '0.12');
        });
      }
      // Restore the mela→janya connector line for the parent janya
      if (parentJanyaConnLine) parentJanyaConnLine.setAttribute('opacity', '0.5');
      // Dim all comp labels, then restore the selected one
      if (_labelLayer) {
        _labelLayer.querySelectorAll('.sat-label-comp').forEach(el => {
          el.setAttribute('opacity', '0.15');
        });
        _labelLayer.querySelectorAll('.sat-label-comp[data-comp-id="' + CSS.escape(item.id || '') + '"]').forEach(el => {
          el.setAttribute('opacity', '1');
        });
      }
      cCircle.setAttribute('stroke', THEME.accentSelect);
      cCircle.setAttribute('stroke-width', 2.5);
      cCircle.setAttribute('opacity', '0.85');   // restore selected comp to full opacity
      connLine.setAttribute('opacity', '0.8');   // highlight the line leading to this comp
      _expandedComp = item.id;
      if (typeof showClickNudge === 'function') showClickNudge('tap again \u00B7 open bani flow');
      // Silently load bani-flow data (no panel pop-open on first click).
      // Guard: prevent syncRagaWheelToFilter from redrawing the wheel.
      window._wheelSyncInProgress = true;
      if (typeof applyBaniFilter === 'function') {
        // Resolve the filter type/id for this comp item
        if (!item._isPerf) {
          applyBaniFilter('comp', item.id);
        } else if (item._recording_id && item._perf_index != null) {
          applyBaniFilter('perf', item._recording_id + '::' + item._perf_index);
        } else if (item._ytVid) {
          applyBaniFilter('yt', item._ytVid + '::' + (item.raga_id || janya.id));
        } else {
          applyBaniFilter('raga', item.raga_id || janya.id);
        }
      }
      window._wheelSyncInProgress = false;
      // Auto-zoom to bring the selected composition into focus
      _animateToTarget(cPos.x, cPos.y, 2.5);
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
      fill: THEME.borderStrong, 'font-size': '11px', 'pointer-events': 'none'
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
      fill: mData.color || THEME.accentMatch, opacity: 0.85,
      stroke: THEME.fg, 'stroke-width': 1, cursor: 'pointer'
    });
    const mg = svgEl('g', { class: 'musc-node', 'data-id': mid });
    mg.appendChild(mCircle);
    // Label goes into _labelLayer so it is always rendered on top of all circles.
    // Passing a clickHandler makes the pill a pointer target — improves touch accuracy.
    if (_labelLayer) {
      const mFontSize = Math.max(6, minDim * 0.010);
      _labelWithBg(_labelLayer, mName, mPos.x, mPos.y, mFontSize, {
        fill: THEME.fgSub, 'font-size': mFontSize + 'px',
        class: 'sat-label sat-label-musc'
      }, (e) => {
        mg.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY
        }));
      });
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

/**
 * orientRagaWheel(type, id)
 *
 * Only acts when the raga wheel is the active view.  Does NOT switch views.
 * Waits for syncRagaWheelToFilter (called by applyBaniFilter just before this)
 * to finish its expand sequence, then animates the viewport to centre on the
 * mela that contains the raga (or the raga of the composition) at zoom 1.8.
 *
 * @param {'raga'|'comp'} type
 * @param {string}        id    — raga id or composition id
 */
function orientRagaWheel(type, id) {
  // Only act when the raga wheel is visible
  if (currentView !== 'raga') return;

  // Resolve composition → raga_id
  let ragaId = id;
  let compId = null;
  if (type === 'comp') {
    const comp = compositions.find(c => c.id === id);
    if (!comp || !comp.raga_id) return;
    ragaId = comp.raga_id;
    compId = id;
  }

  const raga = ragas.find(r => r.id === ragaId);
  if (!raga) return;

  const melaId = raga.is_melakarta ? raga.id : raga.parent_raga;
  if (!melaId) return;
  const melaRaga = ragas.find(r => r.id === melaId);
  if (!melaRaga || !melaRaga.melakarta) return;

  // syncRagaWheelToFilter (called by applyBaniFilter just before us) has already
  // called drawRagaWheel() + _triggerMelaExpand, which sets _wheelSyncInProgress=true
  // and clears it after ~50ms.  We poll until it clears, then pan/zoom.
  function waitAndPan() {
    if (window._wheelSyncInProgress) {
      setTimeout(waitAndPan, 20);
      return;
    }

    const svg = document.getElementById('raga-wheel');
    if (!svg) return;
    const W = svg.clientWidth  || svg.parentElement.clientWidth  || 800;
    const H = svg.clientHeight || svg.parentElement.clientHeight || 600;
    const minDim = Math.min(W, H);
    const melaAngle = (melaRaga.melakarta - 1) * 5;
    const rad = (melaAngle - 90) * Math.PI / 180;

    // For a composition: pan to the composition node (at R_COMP radius) so it
    // is centred in view.  For a raga: pan to the mela node (at R_MELA).
    let targetX, targetY, TARGET_SCALE;
    if (compId) {
      // Try to find the rendered comp node and use its actual SVG position.
      // The comp node is at R_COMP along the mela angle (spread may shift it
      // slightly, but the mela angle is a good approximation for centering).
      const R_COMP = minDim * 0.72;
      targetX = W / 2 + R_COMP * Math.cos(rad);
      targetY = H / 2 + R_COMP * Math.sin(rad);
      TARGET_SCALE = 2.2;   // zoom in a bit more so the comp node is clearly visible

      // Prefer the actual rendered position of the selected comp node if available
      const compEl = document.querySelector(
        `#wheel-viewport .comp-node[data-id="${CSS.escape(compId)}"] circle`
      );
      if (compEl) {
        const cx = parseFloat(compEl.getAttribute('cx'));
        const cy = parseFloat(compEl.getAttribute('cy'));
        if (!isNaN(cx) && !isNaN(cy)) { targetX = cx; targetY = cy; }
      }
    } else {
      const R_MELA = minDim * 0.38;
      targetX = W / 2 + R_MELA * Math.cos(rad);
      targetY = H / 2 + R_MELA * Math.sin(rad);
      TARGET_SCALE = 1.8;
    }

    const targetVX = W / 2 - TARGET_SCALE * targetX;
    const targetVY = H / 2 - TARGET_SCALE * targetY;

    const startVX = window._wheelGetVx(), startVY = window._wheelGetVy(),
          startScale = window._wheelGetVscale();
    const DURATION = 500;
    const startTime = performance.now();

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / DURATION);
      const e = easeInOutCubic(t);
      window._wheelSetVx(startVX    + (targetVX    - startVX)    * e);
      window._wheelSetVy(startVY    + (targetVY    - startVY)    * e);
      window._wheelSetVscale(startScale + (TARGET_SCALE - startScale) * e);
      window._wheelApplyTransform();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  waitAndPan();
}

