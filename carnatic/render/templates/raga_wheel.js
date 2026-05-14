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
// | Button      | graph (graph)    | graph (timeline)    | raga   |
// | btn-relayout| 'Re-layout', on  | 'Fit', on           | hidden |
// | btn-timeline| visible, off     | visible, active     | hidden |
function _updateViewportToolbar(view, layout) {
  const btnRelayout = document.getElementById('btn-relayout');
  const btnTimeline = document.getElementById('btn-timeline');
  if (view === 'raga') {
    if (btnRelayout) btnRelayout.style.display = 'none';
    if (btnTimeline) btnTimeline.style.display = 'none';
  } else {
    if (btnRelayout) {
      btnRelayout.style.display = '';
      btnRelayout.disabled = false;
      // Repurpose the button when timeline is active: act as Fit instead.
      // Use innerHTML to preserve the icon <i> element.
      if (layout === 'timeline') {
        btnRelayout.innerHTML = '<i class="vp-icon">&#10021;</i> Fit';
        btnRelayout.title = 'Fit all nodes into view';
      } else {
        btnRelayout.innerHTML = '<i class="vp-icon">&#10227;</i> Re-layout';
        btnRelayout.title = 'Re-run force-directed layout';
      }
    }
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

  // Keep every view button in sync (header + inline tutorial buttons).
  document.querySelectorAll('.view-btn').forEach(btn => {
    const explicit = btn.dataset ? btn.dataset.view : null;
    const legacy = (btn.id && btn.id.indexOf('view-btn-') === 0)
      ? btn.id.slice('view-btn-'.length)
      : null;
    const view = explicit || legacy;
    if (view === 'graph' || view === 'raga') {
      btn.classList.toggle('active', view === name);
    }
  });

  _updateViewportToolbar(name, currentLayout);

  const layoutControls = document.getElementById('layout-controls-float');
  const cyLabels  = document.getElementById('cy-labels');
  if (name === 'graph') {
    hideTimelineRuler();
    hideRagaWheel();
    if (typeof window._closeWheelDetailPanel === 'function') window._closeWheelDetailPanel();
    document.getElementById('cy').style.display = '';
    if (cyLabels) cyLabels.style.display = '';
    if (layoutControls) layoutControls.style.display = '';
    if (typeof cy !== 'undefined' && cy) cy.resize();
    // Restore the sub-layout that was active when the user left
    if (currentLayout === 'timeline') {
      applyTimelineLayout();
    } else {
      currentLayout = 'graph';
      _restoreGraphPositions();
    }
    if (typeof cy !== 'undefined' && cy) {
      requestAnimationFrame(() => cy.resize());
    }
    if (typeof scheduleCyChipSync === 'function') scheduleCyChipSync();
  } else if (name === 'raga') {
    hideTimelineRuler();
    document.getElementById('cy').style.display = 'none';
    if (cyLabels) cyLabels.style.display = 'none';
    if (layoutControls) layoutControls.style.display = 'none';
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
  // When timeline is active the button is repurposed as Fit.
  if (currentLayout === 'timeline') { cy.fit(undefined, 60); return; }
  relayout();
}

// ── Wheel viewport stub (ADR-030) ─────────────────────────────────────────────
// wheelFit: reset pan/zoom so the full wheel is centred and fits the SVG canvas.
function wheelFit() {
  if (window.RagaWheel && typeof window.RagaWheel.fit === 'function') {
    window.RagaWheel.fit();
  } else {
    if (typeof window.clearWheelLightUp === 'function') window.clearWheelLightUp();
  }
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

// ADR-126: cakra ring is retired as a colour surface — always returns bgPanel.
// Shim retained so call-site change is minimal and future ADRs can re-introduce cakra colour.
function getCakraColor(_n) { return THEME.bgPanel; }

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

function _readChipSpacingK() {
  const cs = getComputedStyle(document.documentElement);
  const v = parseFloat(cs.getPropertyValue('--wheel-chip-spacing-k'));
  return Number.isFinite(v) && v > 0 ? v : 1.15;
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

function polarRad(cx, cy, r, angleRad) {
  const rad = angleRad - Math.PI / 2;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ADR-093: deterministic ring/fan solver based on minimum arc-length spacing.
function solveRingLayout(opts) {
  if (!opts || !opts.n || opts.n < 1) return { radius: 0, spread: 0, angles: [] };
  const padX = opts.fontSize * 0.6;
  const chipWidth = Math.max(1, opts.maxLabelChars || 1) * opts.fontSize * 0.55 + padX * 2;
  const sMin = opts.k * chipWidth;

  if (opts.closedRim) {
    const rRequired = opts.n * sMin / (2 * Math.PI);
    const radius = Math.max(opts.closedRim.rBaseline, rRequired);
    const angles = Array.from({ length: opts.n }, (_, i) => i * 2 * Math.PI / opts.n);
    return { radius, spread: 2 * Math.PI, angles };
  }

  if (opts.openFan) {
    const { anchorAngle, maxSpread, rBaseline } = opts.openFan;
    const spreadAtBaseline = opts.n === 1 ? 0 : ((opts.n - 1) * sMin) / Math.max(1e-6, rBaseline);
    let spread, radius;
    if (spreadAtBaseline <= maxSpread) {
      spread = spreadAtBaseline;
      radius = rBaseline;
    } else {
      spread = maxSpread;
      radius = opts.n === 1 ? rBaseline : ((opts.n - 1) * sMin) / Math.max(1e-6, maxSpread);
    }
    const angles = opts.n === 1
      ? [anchorAngle]
      : Array.from({ length: opts.n }, (_, i) =>
          anchorAngle - spread / 2 + (spread / (opts.n - 1)) * i
        );
    return { radius, spread, angles };
  }

  throw new Error('solveRingLayout: must specify closedRim or openFan');
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
let _wdpData = null;     // Option B: panel data cache (set in drawRagaWheel)
let _wdpMelaNum = null;  // ADR-140: melakarta number of the currently open WDP (null = closed)
let _wdpCorner  = null;  // ADR-140: anchor corner of current WDP ('tl'|'tr'|'bl'|'br')

// ── Wheel Detail Panel (Option B, ADR-096) ─────────────────────────────────
// Shows mela→janya→comp as a scrollable HTML overlay panel, replacing SVG
// satellite fans. The wheel stays fully at overview scale; detail is beside it.

function _closeWheelDetailPanel() {
  _wdpMelaNum = null;
  _wdpCorner  = null;
  const panel = document.getElementById('wheel-detail-panel');
  if (panel) {
    panel.classList.remove('wdp-open');
    panel.innerHTML = '';
    panel.style.left            = '';
    panel.style.top             = '';
    panel.style.transform       = '';
    panel.style.transformOrigin = '';
  }
}
window._closeWheelDetailPanel = _closeWheelDetailPanel;

// ADR-140 §Corner: reposition the WDP so the correct corner is anchored just
// outside the mela arc outer edge. The anchor corner is chosen by visual
// quadrant so the panel always fans AWAY from the wheel centre:
//   [  0°,  90°] top-right  -> bottom-left  (panel extends upper-right)
//   [ 90°, 180°] bot-right  -> top-left     (panel extends lower-right)
//   [180°, 270°] bot-left   -> top-right    (panel extends lower-left)
//   [270°, 360°] top-left   -> bottom-right (panel extends upper-left)
// 0° = 12-o'clock, clockwise. Called every _applyTransform() frame.
function _positionWdpAtMela(melaNum) {
  const panel = document.getElementById('wheel-detail-panel');
  if (!panel || !panel.classList.contains('wdp-open')) return;
  const g = RagaWheel._geometry;
  if (!g.cx || !g.rMela) return;
  const s = RagaWheel._state;

  // SVG local: anchor just past the outer tip of the mela chip so the chip
  // itself remains visible and clickable. rMelaHead[melaNum] is the outer-tip
  // radius stored during drawRagaWheel; fall back to rMela+12 if unavailable.
  const rHead = (g.rMelaHead && g.rMelaHead[melaNum]) ? g.rMelaHead[melaNum] + 8 : g.rMela + 12;
  const thetaDeg = (melaNum - 0.5) * 5;
  const thetaRad = (thetaDeg - 90) * Math.PI / 180;
  const lx = g.cx + rHead * Math.cos(thetaRad);
  const ly = g.cy + rHead * Math.sin(thetaRad);

  // Apply viewport transform: rotate -> scale -> translate.
  const rot = s.rotation;
  const dx = lx - g.cx, dy = ly - g.cy;
  const rx = Math.cos(rot) * dx - Math.sin(rot) * dy + g.cx;
  const ry = Math.sin(rot) * dx + Math.cos(rot) * dy + g.cy;
  const screenX = rx * s.scale + s.panX;
  const screenY = ry * s.scale + s.panY;

  // Compute visual angle (0 = 12-o'clock, CW) accounting for wheel rotation.
  // Pick the corner that touches the mela so the panel fans outward.
  const visualAngleRad = Math.atan2(ry - g.cy, rx - g.cx);
  const visualAngleDeg = (((visualAngleRad + Math.PI / 2) * 180 / Math.PI) + 360) % 360;
  let corner;
  if      (visualAngleDeg <  90) corner = 'bl';  // top-right  -> bottom-left anchor
  else if (visualAngleDeg < 180) corner = 'tl';  // bot-right  -> top-left anchor
  else if (visualAngleDeg < 270) corner = 'tr';  // bot-left   -> top-right anchor
  else                           corner = 'br';  // top-left   -> bottom-right anchor
  _wdpCorner = corner;

  // Place left/top so the chosen corner sits at (screenX, screenY).
  // transform-origin must match so scale() expands from that same corner.
  const W = panel.offsetWidth  || 0;
  const H = panel.offsetHeight || 0;
  let L, T;
  switch (corner) {
    case 'tl': L = screenX;     T = screenY;     break;
    case 'tr': L = screenX - W; T = screenY;     break;
    case 'bl': L = screenX;     T = screenY - H; break;
    case 'br': L = screenX - W; T = screenY - H; break;
  }
  const ORIGINS = { tl: '0 0', tr: '100% 0', bl: '0 100%', br: '100% 100%' };
  panel.style.left            = L + 'px';
  panel.style.top             = T + 'px';
  panel.style.transform       = 'scale(' + s.scale + ')';
  panel.style.transformOrigin = ORIGINS[corner];
}

// ADR-140: Smoothly pan the wheel so the mela arc centre lands at the middle
// of the viewport. Zoom is preserved. Uses the _animRafId slot so any
// in-flight animation is cancelled before starting a new one.
function _animateWheelToMela(melaNum, durationMs) {
  const g = RagaWheel._geometry;
  if (!g.cx || !g.rMela) return;
  const svg = document.getElementById('raga-wheel');
  if (!svg) return;
  const W = svg.clientWidth  || svg.parentElement.clientWidth  || 800;
  const H = svg.clientHeight || svg.parentElement.clientHeight || 600;
  const s = RagaWheel._state;
  // SVG local: midpoint along the mela chip (halfway between arc edge and chip tip).
  // Centring on the midpoint keeps both the chip and the WDP in view.
  const rMid = (g.rMelaHead && g.rMelaHead[melaNum])
    ? (g.rMela + g.rMelaHead[melaNum]) / 2
    : g.rMela;
  const thetaDeg = (melaNum - 0.5) * 5;
  const thetaRad = (thetaDeg - 90) * Math.PI / 180;
  const lx = g.cx + rMid * Math.cos(thetaRad);
  const ly = g.cy + rMid * Math.sin(thetaRad);
  // Apply rotation only (scale/translate folded into the pan target formula)
  const rot = s.rotation;
  const dx = lx - g.cx, dy = ly - g.cy;
  const rx = Math.cos(rot) * dx - Math.sin(rot) * dy + g.cx;
  const ry = Math.sin(rot) * dx + Math.cos(rot) * dy + g.cy;
  // Compute target pan to centre the WDP panel (not just the anchor point).
  // Half-panel offsets shift the anchor so the panel's visual centre lands at
  // the viewport centre. cornerOffsets derived from the same quadrant rule as
  // _positionWdpAtMela:
  //   bl (top-right)   : panel extends right+up   -> anchor must go left+down
  //   tl (bot-right)   : panel extends right+down -> anchor must go left+up
  //   tr (bot-left)    : panel extends left+down  -> anchor must go right+up
  //   br (top-left)    : panel extends left+up    -> anchor must go right+down
  const targetScale = s.scale;
  let targetPanX = W / 2 - rx * targetScale;
  let targetPanY = H / 2 - ry * targetScale;
  const panel = document.getElementById('wheel-detail-panel');
  if (panel && panel.classList.contains('wdp-open')) {
    const PW = (panel.offsetWidth  || 0) * targetScale;
    const PH = (panel.offsetHeight || 0) * targetScale;
    // Determine corner from visual angle (same formula as _positionWdpAtMela).
    const vAngRad = Math.atan2(ry - g.cy, rx - g.cx);
    const vAngDeg = (((vAngRad + Math.PI / 2) * 180 / Math.PI) + 360) % 360;
    let cX, cY;  // signed offset: positive moves anchor rightward / downward
    if      (vAngDeg <  90) { cX = -PW / 2; cY =  PH / 2; }  // bl
    else if (vAngDeg < 180) { cX = -PW / 2; cY = -PH / 2; }  // tl
    else if (vAngDeg < 270) { cX =  PW / 2; cY = -PH / 2; }  // tr
    else                    { cX =  PW / 2; cY =  PH / 2; }  // br
    targetPanX += cX;
    targetPanY += cY;
  }
  if (Math.abs(targetPanX - s.panX) < 1 && Math.abs(targetPanY - s.panY) < 1) return;
  if (_animRafId) { cancelAnimationFrame(_animRafId); _animRafId = null; }
  const startPanX = s.panX, startPanY = s.panY;
  const startTime = performance.now();
  const ms = durationMs || 500;
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }
  function step(now) {
    const t = Math.min((now - startTime) / ms, 1);
    const e = easeInOutCubic(t);
    s.panX = startPanX + (targetPanX - startPanX) * e;
    s.panY = startPanY + (targetPanY - startPanY) * e;
    RagaWheel._applyTransform();
    if (t < 1) { _animRafId = requestAnimationFrame(step); }
    else { _animRafId = null; }
  }
  _animRafId = requestAnimationFrame(step);
}

function _openWheelDetailPanel(raga) {
  if (!_wdpData || !raga) return;
  const { janyasByMela, compsByRaga, melaByNum } = _wdpData;
  const panel = document.getElementById('wheel-detail-panel');
  if (!panel) return;
  panel.innerHTML = '';

  // Header: mela name + cakra label + close button
  const cakra = raga.melakarta ? Math.ceil(raga.melakarta / 6) : null;
  const header = document.createElement('div');
  header.className = 'wdp-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'wdp-title';
  const nameChip = document.createElement('span');
  nameChip.className = 'wdp-chip wdp-raga';
  nameChip.textContent = '\u25c8 ' + raga.name;
  nameChip.title = 'Open ' + raga.name + ' in BaniFlow panel';
  nameChip.addEventListener('click', (e) => {
    e.stopPropagation();
    window._wheelOriginatedTrigger = true;
    if (typeof triggerBaniSearch === 'function') triggerBaniSearch('raga', raga.id);
    window._wheelOriginatedTrigger = false;
    if (window.matchMedia('(max-width: 768px)').matches) {
      _closeWheelDetailPanel();
    }
  });
  titleEl.appendChild(nameChip);
  if (cakra) {
    const sub = document.createElement('span');
    sub.className = 'wdp-subtitle';
    sub.textContent = 'Mela ' + raga.melakarta + ' \u00b7 ' + (CAKRA_NAMES[cakra] || 'Cakra ' + cakra);
    titleEl.appendChild(sub);
  }
  header.appendChild(titleEl);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'wdp-close'; closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _closeWheelDetailPanel();
    const svg = document.getElementById('raga-wheel');
    if (svg && _wdpData) {
      const vp = svg.querySelector('#wheel-viewport');
      if (vp) _collapseAll(vp, _wdpData.melaByNum);
    }
  });
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Direct mela compositions (no janya intermediary)
  const melaDirect = compsByRaga[raga.id] || [];
  if (melaDirect.length > 0) {
    const lbl = document.createElement('div');
    lbl.className = 'wdp-section-label';
    lbl.textContent = melaDirect.length + ' composition' + (melaDirect.length > 1 ? 's' : '') + ' (mela direct)';
    panel.appendChild(lbl);
    _wdpRenderComps(panel, melaDirect, raga.id, null);
  }

  // Janyas — sorted alphabetically
  const janyas = (janyasByMela[raga.id] || []).slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (janyas.length > 0) {
    const lbl = document.createElement('div');
    lbl.className = 'wdp-section-label';
    lbl.textContent = janyas.length + ' janya raga' + (janyas.length > 1 ? 's' : '');
    panel.appendChild(lbl);
    const janyaList = document.createElement('div');
    janyaList.className = 'wdp-chips'; janyaList.id = 'wdp-janya-list';
    janyas.forEach(janya => {
      const comps = compsByRaga[janya.id] || [];
      const chip = document.createElement('div');
      chip.className = 'wdp-chip wdp-raga'; chip.dataset.id = janya.id;
      chip.textContent = '\u25c8 ' + janya.name;
      if (comps.length) {
        const cnt = document.createElement('span');
        cnt.className = 'wdp-chip-count'; cnt.textContent = comps.length;
        chip.appendChild(cnt);
      }
      chip.addEventListener('click', (e) => { e.stopPropagation(); _wdpSelectJanya(janya, chip); });
      janyaList.appendChild(chip);
    });
    panel.appendChild(janyaList);
  }

  if (janyas.length === 0 && melaDirect.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'wdp-empty';
    empty.textContent = 'No compositions or janyas recorded';
    panel.appendChild(empty);
  }

  panel.classList.add('wdp-open');
  // ADR-140: anchor WDP to the mela that opened it and pan the wheel to centre it.
  _wdpMelaNum = raga.melakarta || null;
  if (_wdpMelaNum !== null) {
    _positionWdpAtMela(_wdpMelaNum);   // immediate placement (no animation flash)
    // Defer by one rAF so the browser lays out the panel (offsetWidth/Height
    // is 0 synchronously on the first paint) before we compute the centring offset.
    const _wdpMelaAtOpen = _wdpMelaNum;
    requestAnimationFrame(() => { _animateWheelToMela(_wdpMelaAtOpen, 500); });
  }
  // Ghost-click guard: record the time the panel opens so that comp chip
  // click handlers can ignore native ghost clicks that land on the freshly
  // rendered WDP (mobile browsers fire a delayed isTrusted click at the
  // original touch coordinates after pointerup, which now points at the WDP).
  window._wdpOpenTime = Date.now();
}

// suppressFilter=true: visual-only selection — do NOT override the active bani filter.
// Used by _triggerMelaExpand when syncing the wheel to a composition search result;
// the bani filter was already set to 'comp' and must not be clobbered by 'raga'.
// activeCompId: if set, the matching comp chip gets wdp-active at render time.
function _wdpSelectJanya(janya, chipEl, suppressFilter, activeCompId) {
  if (!_wdpData) return;
  const { compsByRaga } = _wdpData;
  const panel = document.getElementById('wheel-detail-panel');
  if (!panel) return;

  // Toggle: clicking the active janya collapses its comp list (only on user-initiated clicks)
  const wasSelected = !suppressFilter && chipEl && chipEl.classList.contains('wdp-selected');
  panel.querySelectorAll('.wdp-chip.wdp-raga').forEach(c => c.classList.remove('wdp-selected'));
  panel.querySelectorAll('.wdp-comp-group').forEach(el => el.remove());
  panel.querySelectorAll('.wdp-chip.wdp-comp.wdp-active').forEach(c => c.classList.remove('wdp-active'));
  if (wasSelected) return;

  if (chipEl) chipEl.classList.add('wdp-selected');
  const items = compsByRaga[janya.id] || [];
  // Pass activeCompId so the matching chip is marked wdp-active synchronously during render.
  if (items.length > 0 && chipEl) _wdpRenderComps(panel, items, janya.id, chipEl, activeCompId || null);

  // Load bani-flow trail for this janya — only when user clicks, not during programmatic sync.
  // suppressFilter=true means the caller (syncRagaWheelToFilter) already set the bani filter
  // to a specific composition; overwriting it with the parent raga would lose that context.
  if (!suppressFilter) {
    window._wheelSyncInProgress = true;
    if (typeof applyBaniFilter === 'function') applyBaniFilter('raga', janya.id);
    window._wheelSyncInProgress = false;
    // On mobile, open the bani-flow panel after loading the trail so the rasika
    // sees the trail slide in alongside the still-open box (box → panel cascade).
    if (window.matchMedia('(max-width: 768px)').matches && typeof window.setPanelState === 'function') {
      setTimeout(function () { window.setPanelState('TRAIL'); }, 50);
    }
  }
}

// activeCompId: if non-null and matches item.id, the chip gets wdp-active at render time.
function _wdpRenderComps(panel, items, ragaId, afterChip, activeCompId) {
  const group = document.createElement('div');
  group.className = 'wdp-comp-group';
  items.forEach(item => {
    const chip = document.createElement('div');
    chip.className = 'wdp-chip wdp-comp';
    chip.dataset.id = item.id || '';
    if (activeCompId && item.id && item.id === activeCompId) chip.classList.add('wdp-active');
    chip.textContent = '\u266a ' + (item.title || item.id || '');
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      // Ghost-click guard: ignore native ghost clicks that arrive within 300 ms of
      // the panel opening (mobile browsers can fire a delayed isTrusted click at
      // the original touch coordinates, which now points at this freshly rendered chip).
      if (Date.now() - (window._wdpOpenTime || 0) < 300) return;
      // Mark this chip active immediately — wdp-active cannot be set via the normal
      // syncRagaWheelToFilter path because _wheelSyncInProgress=true blocks it.
      const panel = document.getElementById('wheel-detail-panel');
      if (panel) {
        panel.querySelectorAll('.wdp-chip.wdp-comp.wdp-active').forEach(c => c.classList.remove('wdp-active'));
      }
      chip.classList.add('wdp-active');
      window._wheelSyncInProgress = true;
      window._wheelOriginatedTrigger = true;
      if (!item._isPerf) {
        if (typeof triggerBaniSearch === 'function') triggerBaniSearch('comp', item.id);
      } else if (item._recording_id && item._perf_index != null) {
        if (typeof triggerBaniSearch === 'function') triggerBaniSearch('perf', item._recording_id + '::' + item._perf_index);
      } else if (item._ytVid) {
        if (typeof triggerBaniSearch === 'function') triggerBaniSearch('yt', item._ytVid + '::' + ragaId);
      } else {
        if (typeof triggerBaniSearch === 'function') triggerBaniSearch('raga', ragaId);
      }
      window._wheelSyncInProgress = false;
      window._wheelOriginatedTrigger = false;
      // On mobile, close the box so the bani-flow panel (which triggerBaniSearch
      // opens 50ms later) is the sole focus (box → panel cascade).
      if (window.matchMedia('(max-width: 768px)').matches) {
        window._closeWheelDetailPanel();
      }
    });
    group.appendChild(chip);
  });
  if (afterChip) {
    afterChip.insertAdjacentElement('afterend', group);
  } else {
    panel.appendChild(group);
  }
}
// AbortController for SVG-level event listeners — aborted and re-created on
// each drawRagaWheel() call so stale handlers from previous draws don't
// accumulate on the persistent <svg> element.
let _svgListenerController = null;

// ── ADR-124: Light-up state ───────────────────────────────────────────────────
// ID of the currently lit mela raga (for toggle-off).
let _litMelaId = null;

// ── ADR-124: JS katapayadi formula (mirrors melakarta_math.py) ──────────────
// Upper-triangular (ri,ga) / (da,ni) pair enumeration — shared axis for both.
const _PAIRS = [[1,1],[1,2],[1,3],[2,2],[2,3],[3,3]];

function _melaToTuple(M) {
  const madhyama = M <= 36 ? 1 : 2;
  const n = madhyama === 1 ? M : M - 36;           // 1..36 within hemisphere
  const cakraIdx    = Math.floor((n - 1) / 6);      // 0..5
  const posInCakra  = (n - 1) % 6;                  // 0..5
  return {
    madhyama,
    ri: _PAIRS[cakraIdx][0],   ga: _PAIRS[cakraIdx][1],
    da: _PAIRS[posInCakra][0], ni: _PAIRS[posInCakra][1],
    cakra: madhyama === 1 ? cakraIdx + 1 : cakraIdx + 7, // 1..12 on the wheel
  };
}

// ── ADR-124: Light-up core functions ─────────────────────────────────────────
function _lightUpSpineForMela(M) {
  const svg = document.getElementById('raga-wheel');
  if (!svg) return;
  const t = _melaToTuple(M);

  // Dim all ring cells to near-zero — exclude sruti pie (independent of bani filter)
  svg.querySelectorAll('[data-ring]:not([data-ring="sruti"]):not([data-ring="sruti-label"])').forEach(el => {
    el.setAttribute('opacity', '0.08');
  });
  // Dim mela arc slots — scale origOp proportionally so live/empty hierarchy is preserved
  const SLOT_DIM = 0.35;
  svg.querySelectorAll('.mela-node path[data-mela]').forEach(el => {
    const mStr = el.getAttribute('data-mela');
    const hasRaga = el.closest('.mela-node') && el.closest('.mela-node').getAttribute('data-id');
    const isLit = parseInt(mStr) === M;
    const origOp = parseFloat(el.getAttribute('data-orig-opacity')) || 0;
    el.setAttribute('opacity', isLit ? '0.95' : String(origOp * SLOT_DIM));
    el.setAttribute('stroke', hasRaga ? THEME.fg : THEME.edgeLine);
    el.setAttribute('stroke-width', hasRaga ? '0.75' : '0.5');
  });
  // Dim mela labels — scale origOp proportionally; grayscale already set on empty chips
  const LBL_DIM = 0.35;
  if (_labelLayer) {
    _labelLayer.querySelectorAll('.mela-label').forEach(lbl => {
      const origOp = parseFloat(lbl.getAttribute('data-orig-opacity')) || 0;
      lbl.setAttribute('opacity', String(origOp * LBL_DIM));
      // Don’t touch style.filter — empty chips already have grayscale(1) from initial render
    });
  }

  // Light the 5 spine cells with themed accent
  const madEl = svg.querySelector(`[data-ring="madhyama"][data-madhyama="${t.madhyama}"]`);
  if (madEl) madEl.setAttribute('opacity', t.madhyama === 1 ? '0.85' : '0.50');

  const cakraEl = svg.querySelector(`[data-ring="cakra"][data-cakra="${t.cakra}"]`);
  if (cakraEl) cakraEl.setAttribute('opacity', '0.92');

  const rigaEl = svg.querySelector(`[data-ring="riga"][data-cakra="${t.cakra}"]`);
  if (rigaEl) rigaEl.setAttribute('opacity', '0.82');

  const daniEl = svg.querySelector(`[data-ring="dani"][data-mela="${M}"]`);
  if (daniEl) daniEl.setAttribute('opacity', '0.90');

  // Mela slot — accent stroke to make it pop
  const melaSlot = svg.querySelector(`.mela-node[data-mela="${M}"] path[data-mela]`);
  if (melaSlot) {
    melaSlot.setAttribute('stroke', THEME.accentSelect);
    melaSlot.setAttribute('stroke-width', '2');
  }
  // Lit mela label: full opacity, clear any grayscale
  if (_labelLayer) {
    const melaG = svg.querySelector(`.mela-node[data-mela="${M}"]`);
    const melaId = melaG ? melaG.getAttribute('data-id') : '';
    if (melaId) {
      const lbl = _labelLayer.querySelector(`.mela-label[data-id="${CSS.escape(melaId)}"]`);
      if (lbl) { lbl.setAttribute('opacity', '1'); lbl.style.filter = ''; }
    }
  }
}

// strokeHint: optional hex colour for lit+live mela slot strokes (ADR-126 swara cell clicks).
// If omitted, falls back to THEME.accentSelect (used for non-swara light-up paths).
function _lightUpMelas(melaNumbers, strokeHint) {
  const litSet = new Set(melaNumbers.map(String));
  const svg = document.getElementById('raga-wheel');
  if (!svg) return;

  // Dim all ring cells — exclude sruti pie (independent of bani filter)
  svg.querySelectorAll('[data-ring]:not([data-ring="sruti"]):not([data-ring="sruti-label"])').forEach(el => el.setAttribute('opacity', '0.08'));

  // Light up spine cells (madhyama, cakra, ri-ga, da-ni) for every lit mela
  for (const M of melaNumbers) {
    const t = _melaToTuple(M);
    if (!t) continue;
    // Madhyama half
    const madEl = svg.querySelector(`[data-ring="madhyama"][data-madhyama="${t.madhyama}"]`);
    if (madEl) {
      const orig = parseFloat(madEl.getAttribute('data-orig-opacity')) || 0.80;
      madEl.setAttribute('opacity', Math.min(1, orig + 0.15));
    }
    // Cakra wedge
    const actualCakra = M <= 36 ? Math.floor((M - 1) / 6) + 1 : Math.floor((M - 37) / 6) + 7;
    const cakraEl = svg.querySelector(`[data-ring="cakra"][data-cakra="${actualCakra}"]`);
    if (cakraEl) {
      const orig = parseFloat(cakraEl.getAttribute('data-orig-opacity')) || 0.82;
      cakraEl.setAttribute('opacity', Math.min(1, orig + 0.12));
    }
    // Ri-ga arc (keyed by cakra number on the element)
    const rigaEl = svg.querySelector(`[data-ring="riga"][data-cakra="${actualCakra}"]`);
    if (rigaEl) {
      const orig = parseFloat(rigaEl.getAttribute('data-orig-opacity')) || 0.62;
      rigaEl.setAttribute('opacity', Math.min(1, orig + 0.30));
    }
    // Da-ni cell (keyed by mela number)
    const daniEl = svg.querySelector(`[data-ring="dani"][data-mela="${M}"]`);
    if (daniEl) {
      const orig = parseFloat(daniEl.getAttribute('data-orig-opacity')) || 0.50;
      daniEl.setAttribute('opacity', Math.min(1, orig + 0.45));
    }
  }

  // Mela arc slots — even within the lit set, empty melas stay muted (no contributions)
  const SLOT_DIM = 0.35;
  svg.querySelectorAll('.mela-node path[data-mela]').forEach(el => {
    const m = el.getAttribute('data-mela');
    const lit = litSet.has(m);
    const hasRaga = el.closest('.mela-node') && el.closest('.mela-node').getAttribute('data-id');
    const origOp = parseFloat(el.getAttribute('data-orig-opacity')) || 0;
    const isLive = origOp >= 0.5;  // live slot orig=0.90, non-live orig=0.30, empty orig=0.20
    let op;
    if (lit && isLive)       op = '0.95';                 // lit + live: full bright
    else if (lit && !isLive) op = String(origOp);          // lit + empty: keep original muted opacity
    else                     op = String(origOp * SLOT_DIM); // unlit: scale down
    el.setAttribute('opacity', op);
    el.setAttribute('stroke', (lit && isLive) ? (strokeHint || THEME.accentSelect) : THEME.borderStrong);
    el.setAttribute('stroke-width', (lit && isLive) ? '2' : '0.5');
  });

  // Mela labels — same rule: empty stays muted even when lit
  const LBL_DIM = 0.35;
  if (_labelLayer) {
    _labelLayer.querySelectorAll('.mela-label').forEach(lbl => {
      const melaG = document.querySelector(`.mela-node[data-id="${CSS.escape(lbl.getAttribute('data-id') || '')}"]`);
      const m = melaG ? melaG.getAttribute('data-mela') : null;
      const origOp = parseFloat(lbl.getAttribute('data-orig-opacity')) || 0;
      const isLive = origOp >= 0.5;  // live label orig=1, non-live orig=0.28
      const lit = m && litSet.has(m);
      if (lit && isLive) {
        lbl.setAttribute('opacity', '1');
        lbl.style.filter = '';
      } else if (lit && !isLive) {
        // Lit but empty — keep the muted "no contributions" look
        lbl.setAttribute('opacity', String(origOp));
        // grayscale stays (already on wrapper from initial render)
      } else {
        // Unlit — scale down further
        lbl.setAttribute('opacity', String(origOp * LBL_DIM));
      }
    });
  }
}

function _clearWheelLightUp() {
  const svg = document.getElementById('raga-wheel');
  if (!svg) return;

  // Restore ring cells — exclude sruti pie (manages its own active/inactive state)
  svg.querySelectorAll('[data-ring]:not([data-ring="sruti"]):not([data-ring="sruti-label"])').forEach(el => {
    const orig = el.getAttribute('data-orig-opacity');
    if (orig) el.setAttribute('opacity', orig);
  });
  // Restore mela arc slots — ADR-126: all slots use neutral borderStrong hairline
  svg.querySelectorAll('.mela-node path[data-mela]').forEach(el => {
    const orig = el.getAttribute('data-orig-opacity');
    if (orig) el.setAttribute('opacity', orig);
    el.setAttribute('stroke', THEME.borderStrong);
    el.setAttribute('stroke-width', '0.5');
  });
  // Restore mela labels
  if (_labelLayer) {
    _labelLayer.querySelectorAll('.mela-label').forEach(lbl => {
      const orig = lbl.getAttribute('data-orig-opacity');
      if (orig) lbl.setAttribute('opacity', orig);
      // Re-apply grayscale for non-live chips (orig < 1 means no contributions)
      lbl.style.filter = parseFloat(orig) < 1 ? 'grayscale(1)' : '';
    });
  }
  _litMelaId = null;
}

// Expose on window for syncRagaWheelToFilter and external callers
window.lightUpSpine = function(ragaId) {
  if (!ragaId) { _clearWheelLightUp(); return; }
  const raga = ragas.find(r => r.id === ragaId);
  if (!raga) return;
  // Climb to parent mela for janya ragas
  const melaRaga = raga.is_melakarta ? raga :
    (raga.parent_raga ? ragas.find(r2 => r2.id === raga.parent_raga) : null);
  if (!melaRaga || !melaRaga.melakarta) return;
  // Toggle: second click on same mela clears
  if (_litMelaId === melaRaga.id) { _clearWheelLightUp(); return; }
  _litMelaId = melaRaga.id;
  _lightUpSpineForMela(melaRaga.melakarta);
};
window.clearWheelLightUp = _clearWheelLightUp;
// Keep RagaWheel stub so vpFit() and external callers don't throw.
window.RagaWheel = { fit: function() { _clearWheelLightUp(); } };

// Expose abort helper so hideRagaWheel (outside IIFE) can clean up SVG listeners
let _wheelMouseMove = null;
let _wheelMouseUp   = null;
let _animRafId = null;  // current _animateToTarget rAF handle (cancelled on new call)

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
    this._state.rotation = this._normaliseRotation(this._state.rotation + dTheta);
    this._applyTransform();
  },
  fit() {
    this._state.panX = 0;
    this._state.panY = 0;
    this._state.scale = 1;
    this._state.rotation = 0;
    this._applyTransform();
    _clearWheelLightUp();
  },
  centreOn(targetX, targetY, targetScale) { /* zoom-to-mela retired (ADR-124) */ },
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
    // ADR-140: reposition the WDP to stay anchored to its mela on every frame
    if (_wdpMelaNum !== null) _positionWdpAtMela(_wdpMelaNum);
  },
};
window.RagaWheel = RagaWheel;

// ── Pointer Events state (ADR-035) ────────────────────────────────────────────
// Multi-touch map: pointerId → {x, y}
const _activePointers = new Map();
let _pinchStartDist = null, _pinchStartScale = 1;
// Taphold (long-press) — fires openMetaInspector after 500ms on stationary touch
let _tapHoldTimer = null, _tapHoldTarget = null;
// Double-tap detection
let _lastTapTime = 0, _lastTapTarget = null;
// Guard: timestamp of the last synthetic click dispatched by _onPointerEnd.
let _wheelLastSyntheticClick = 0;

function _startTapHoldTimer(e) {
  _tapHoldTarget = e.target;
  _tapHoldTimer = setTimeout(() => {
    if (!_tapHoldTarget) return;
    const el = _tapHoldTarget.closest('[data-id]') || _tapHoldTarget.closest('[data-mela]');
    if (!el) return;
    const g = el.closest('.mela-node, .janya-node, .comp-node, .musc-node');
    if (!g) return;
    let nodeType, nodeId;
    if (g.classList.contains('mela-node')) {
      nodeType = 'mela'; nodeId = g.getAttribute('data-id') || null;
    } else if (g.classList.contains('janya-node')) {
      nodeType = 'janya'; nodeId = g.getAttribute('data-id');
    } else if (g.classList.contains('comp-node')) {
      nodeType = 'composition'; nodeId = g.getAttribute('data-id');
    }
    if (nodeType && nodeId && typeof openMetaInspector === 'function') {
      openMetaInspector(nodeType, { id: nodeId });
    }
    _tapHoldTarget = null; _tapHoldTimer = null;
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
function _applyTransform() {
  RagaWheel._applyTransform();
}

// Expose pan/zoom state and transform function on window so orientRagaWheel
// (outside this IIFE) can drive animations.
window._wheelGetVx      = () => RagaWheel._state.panX;
window._wheelGetVy      = () => RagaWheel._state.panY;
window._wheelGetVscale  = () => RagaWheel._state.scale;
window._wheelSetVx      = (v) => { RagaWheel._state.panX = v; };
window._wheelSetVy      = (v) => { RagaWheel._state.panY = v; };
window._wheelSetVscale  = (v) => { RagaWheel._state.scale = v; };
window._wheelApplyTransform = () => _applyTransform();

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

  // ADR-123: Katapayadi decoding ring radii
  const R_MADHYAMA = minDim * 0.10;   // centre disk outer edge (madhyama split)
  const R_CAKRA    = minDim * 0.18;   // cakra wedge ring outer edge (12 wedges, 30°)
  const R_RIGA     = minDim * 0.26;   // ri-ga arc ring outer edge (12 arcs)
  const R_DANI     = minDim * 0.34;   // da-ni cell ring outer edge (72 cells, 5°)
  const R_MELA     = minDim * 0.42;   // mela arc slot ring outer edge
  // Gap between the outer edge of the mela arc ring and the inner edge of the name chip.
  // Increase MELA_LABEL_GAP to add breathing room; decrease toward 0 for tight pack.
  const MELA_LABEL_GAP = minDim * 0.005;
  const R_JANYA    = minDim * 0.62;   // janya satellite chips
  const R_COMP     = minDim * 0.78;   // composition satellite chips
  const R_MUSC     = minDim * 0.92;   // musician chips
  const NR_MELA    = Math.max(6,  minDim * 0.018);  // kept for _expandMela compat
  const NR_JANYA   = Math.max(5,  minDim * 0.013);
  const NR_COMP    = Math.max(5,  minDim * 0.013);
  const NR_MUSC    = Math.max(4,  minDim * 0.010);

  // Build lookups
  const melaByNum = {};
  ragas.filter(r => r.is_melakarta).forEach(r => { if (r.melakarta) melaByNum[r.melakarta] = r; });
  const janyasByMela = {};
  ragas.filter(r => !r.is_melakarta && r.parent_raga).forEach(r => {
    if (!janyasByMela[r.parent_raga]) janyasByMela[r.parent_raga] = [];
    janyasByMela[r.parent_raga].push(r);
  });

  const melaFontSize = Math.max(10, minDim * 0.022);
  // ADR-123: 72 evenly-spaced angles (5° each) for the mela arc ring.
  // Mela n occupies arc (n-1)*5° → n*5°, centred at (n-0.5)*5°.
  // melaAngles[i] is the CENTRE angle of mela i+1's slot (used for janya fan anchoring).
  const melaAngles = Array.from({ length: 72 }, (_, i) => (i + 0.5) * 2 * Math.PI / 72);

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

  // Option B: cache data for the detail panel and clear any stale panel from previous draw
  _wdpData = { janyasByMela, compsByRaga, melaByNum };
  _closeWheelDetailPanel();

  // Background rect — click on empty space collapses mobile player or clears light-up.
  const bg = svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
  bg.addEventListener('click', e => {
    if (e.target !== bg) return;
    _clearWheelLightUp();
    if (typeof window._collapseMobilePlayer === 'function' &&
        document.querySelector('.media-player.full-mobile')) {
      window._collapseMobilePlayer();
    }
  });
  svg.appendChild(bg);

  // Viewport group — all wheel content goes inside this <g>
  const vp = svgEl('g', { id: 'wheel-viewport' });
  svg.appendChild(vp);
  // Restore saved pan/zoom and record geometry for gesture handlers
  RagaWheel._geometry.cx = cx;
  RagaWheel._geometry.cy = cy;
  RagaWheel._geometry.rOuter = R_MUSC;
  RagaWheel._geometry.rMela  = R_MELA;  // ADR-140: needed by _positionWdpAtMela
  _applyTransform();

  // ESC key clears light-up — registered once per draw via AbortController
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _clearWheelLightUp();
  }, { signal: _signal });

  // ── Pan/zoom gesture handlers (wheel scroll, pointer drag, pinch) ─────────
  const ZOOM_MIN = 0.5, ZOOM_MAX = 4.0;
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 50);
    const factor = Math.pow(1.05, -delta / 50);
    const p = _toSvgPoint(svg, e.clientX, e.clientY);
    RagaWheel.zoom(factor, { x: p.x, y: p.y });
  }, { passive: false, signal: _signal });

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
      if (e.pointerType !== 'mouse' && (e.target === bg || e.target === svg)) {
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
      _dragMoved = true;
      _pinchStartDist = _getPinchDistance();
      _pinchStartScale = RagaWheel._state.scale;
    }
  }, { signal: _signal });

  svg.addEventListener('pointermove', (e) => {
    if (!_activePointers.has(e.pointerId)) return;
    _activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_activePointers.size === 1 && _dragging && _gestureMode === 'pan') {
      const dx = e.clientX - _dragStartX, dy = e.clientY - _dragStartY;
      if (!_dragMoved && Math.hypot(dx, dy) > 5) { _dragMoved = true; _cancelTapHoldTimer(); }
      RagaWheel._state.panX = _dragVX + dx;
      RagaWheel._state.panY = _dragVY + dy;
      _applyTransform();
    } else if (_activePointers.size === 1 && _dragging && _gestureMode === 'rotate') {
      const p = _toSvgPoint(svg, e.clientX, e.clientY);
      const currentAngle = Math.atan2(p.y - RagaWheel._geometry.cy, p.x - RagaWheel._geometry.cx);
      const delta = currentAngle - _rotateStartAngle;
      RagaWheel._state.rotation = RagaWheel._normaliseRotation(_rotateStartRotation + delta);
      if (!_dragMoved && Math.abs(delta) > (2 * Math.PI / 180)) { _dragMoved = true; _cancelTapHoldTimer(); }
      _applyTransform();
    } else if (_activePointers.size === 2 && _pinchStartDist !== null) {
      const newDist = _getPinchDistance();
      const factor = newDist / _pinchStartDist;
      const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, _pinchStartScale * factor));
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
    if (_activePointers.size === 1 && _dragging) {
      const remaining = [..._activePointers.values()][0];
      _dragStartX = remaining.x; _dragStartY = remaining.y;
      _dragVX = RagaWheel._state.panX; _dragVY = RagaWheel._state.panY;
      if (_gestureMode === 'pinch') _gestureMode = 'pan';
    }
    if (_activePointers.size === 0) {
      _dragging = false; _gestureMode = null; svg.style.cursor = '';
      const realTarget = document.elementFromPoint(e.clientX, e.clientY);
      if (!_dragMoved && realTarget && (realTarget === bg || realTarget === svg)) {
        const now = Date.now();
        if (now - _lastTapTime < 300 && _lastTapTarget === bg) {
          RagaWheel.fit();
          _lastTapTime = 0; _lastTapTarget = null;
          return;
        }
        _lastTapTime = now; _lastTapTarget = bg;
      }
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

  svg.addEventListener('click', (e) => {
    if (e.isTrusted && Date.now() - _wheelLastSyntheticClick < 300) {
      e.stopImmediatePropagation();
    }
  }, { capture: true, signal: _signal });

  svg.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (_dragMoved) { _dragMoved = false; return; }
    RagaWheel.fit();
  }, { signal: _signal });

  // ── ADR-123 / ADR-124: Katapayadi decoding rings (interactive) ───────────
  // Ri-ga and da-ni pair subscript labels (upper-triangular enumeration order)
  const _RIGA_LABELS = ['R\u2081G\u2081','R\u2081G\u2082','R\u2081G\u2083','R\u2082G\u2082','R\u2082G\u2083','R\u2083G\u2083'];
  const _DANI_LABELS = ['D\u2081N\u2081','D\u2081N\u2082','D\u2081N\u2083','D\u2082N\u2082','D\u2082N\u2083','D\u2083N\u2083'];
  // Left-half reversed labels: anti-flip rotation (midDeg+90) inverts reading direction,
  // so swap the inner/outer swara in the label to match the colored bands.
  const _RIGA_LABELS_REV = ['G\u2081R\u2081','G\u2082R\u2081','G\u2083R\u2081','G\u2082R\u2082','G\u2083R\u2082','G\u2083R\u2083'];
  const _DANI_LABELS_REV = ['N\u2081D\u2081','N\u2082D\u2081','N\u2083D\u2081','N\u2082D\u2082','N\u2083D\u2082','N\u2083D\u2083'];

  // Ring 0 — Madhyama centre annulus: right half = śuddha (M₁, melas 1–36), left = prati (M₂, melas 37–72)
  // ADR-126: M₁ = THEME.swara.M1 (yellow #d79921, warm), M₂ = THEME.swara.M2 (aqua #689d6a, cool).
  // ADR-131 R3: inner radius is now R_SRUTI (not 0) — the sruti pie occupies the very centre.
  const R_SRUTI = R_MADHYAMA * 0.55;
  [[0, 180, 1, 0.80, 'śuddha madhyama (M₁) — melas 1–36',   THEME.swara.M1],
   [180, 360, 2, 0.40, 'prati madhyama (M₂) — melas 37–72', THEME.swara.M2]].forEach(([startD, endD, madhyama, baseOpacity, titleText, madColor]) => {
    const madPath = svgEl('path', {
      d: sectorPath(cx, cy, R_SRUTI, R_MADHYAMA, startD, endD),
      fill: madColor, opacity: baseOpacity, stroke: 'none',
      'pointer-events': 'all', cursor: 'pointer',
      'data-ring': 'madhyama', 'data-madhyama': madhyama,
      'data-orig-opacity': baseOpacity, tabindex: '0',
    });
    const titleEl = svgEl('title', {});
    titleEl.textContent = titleText;
    madPath.appendChild(titleEl);
    madPath.addEventListener('click', (e) => {
      e.stopPropagation();
      const melaIds = [];
      for (let M = 1; M <= 72; M++) { if ((M <= 36 ? 1 : 2) === madhyama) melaIds.push(M); }
      _lightUpMelas(melaIds);
      if (typeof applyBaniFilter === 'function') applyBaniFilter('madhyama', String(madhyama));
      _litMelaId = null;
    });
    vp.appendChild(madPath);
  });
  // Hemisphere labels (M₁ / M₂) at 3-o'clock / 9-o'clock inside the annulus.
  // ADR-131 R3: pushed outward so they sit in the annulus, not the sruti pie.
  const madFontSize = Math.max(9, minDim * 0.018);
  const madLabelR = (R_SRUTI + R_MADHYAMA) / 2;
  [['M\u2081', 90], ['M\u2082', 270]].forEach(([lbl, deg]) => {
    const lp = polar(cx, cy, madLabelR, deg);
    const t = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: THEME.bg, 'font-size': madFontSize + 'px', 'font-weight': 'bold',
      'pointer-events': 'none'
    });
    t.textContent = lbl;
    vp.appendChild(t);
  });

  // ── ADR-131 R3 — Sruti pie: 12 pitch sectors at the very centre ────────────
  // The drone is the wheel's acoustic root. Click a sector to start that
  // tonic's tanpura; click it again (or the active sector) to stop. No floating
  // chrome, no states beyond active/inactive — the pie is permanent.
  if (typeof tanpuraData !== 'undefined' && Array.isArray(tanpuraData) && tanpuraData.length > 0) {
    const N_SRUTI = tanpuraData.length;        // 12
    const SECT_DEG = 360 / N_SRUTI;
    const lblFontSize = Math.max(7, minDim * 0.012);
    const lblR = R_SRUTI * 0.82;               // pushed toward edge — more arc width at larger radius

    // ADR-132: piano-key palette mapped to Gruvbox Hard Dark primitives.
    // White keys (natural notes) → fg #ebdbb2 (warm cream); text: bg_h #1d2021
    // Black keys (altered notes) → bg1 #3c3836 (warm panel dark); text: fg2 #bdae93
    // Active (any key)           → yellow #d79921 (Gruvbox accent); text: bg_h #1d2021
    const _SRUTI_WHITE_KEYS = new Set([0, 2, 4, 5, 7, 9, 11]); // C D E F G A B
    function _srutiFill(idx, active) {
      if (active) return '#d79921';                              // Gruvbox yellow — playing
      return _SRUTI_WHITE_KEYS.has(idx) ? '#ebdbb2' : '#3c3836';
    }
    function _srutiTextFill(idx, active) {
      if (active) return '#1d2021';                              // bg_h on yellow
      return _SRUTI_WHITE_KEYS.has(idx) ? '#1d2021' : '#bdae93';
    }

    // RagaWheel._sruti = persistent state across redraws + view switches.
    if (!RagaWheel._sruti) RagaWheel._sruti = { activeIdx: null };
    const _activeIdx = RagaWheel._sruti.activeIdx;

    // Exposed on RagaWheel so the media player's close button can reset the ring
    // without re-entering closePlayer (which would loop back here).
    RagaWheel._clearSrutiRing = function() {
      RagaWheel._sruti.activeIdx = null;
      try { localStorage.removeItem('sruti.tonic'); } catch (e) { /* ignore */ }
      vp.querySelectorAll('path[data-ring="sruti"]').forEach((p) => {
        const i = parseInt(p.getAttribute('data-sruti-idx'), 10);
        p.setAttribute('fill', _srutiFill(i, false));
        p.removeAttribute('stroke');
      });
      // Also repaint labels
      vp.querySelectorAll('text[data-ring="sruti-label"]').forEach((t) => {
        const i = parseInt(t.getAttribute('data-sruti-idx'), 10);
        t.setAttribute('fill', _srutiTextFill(i, false));
        t.setAttribute('font-weight', 'normal');
      });
    };

    function _stopSruti() {
      RagaWheel._clearSrutiRing();
      if (typeof closePlayer === 'function') closePlayer('sruti');
    }

    function _startSruti(idx, entry, sectorPathEl) {
      RagaWheel._sruti.activeIdx = idx;
      try { localStorage.setItem('sruti.tonic', entry.note); } catch (e) { /* ignore */ }
      // Repaint: all inactive first, then mark this one
      vp.querySelectorAll('path[data-ring="sruti"]').forEach((p) => {
        const i = parseInt(p.getAttribute('data-sruti-idx'), 10);
        p.setAttribute('fill', _srutiFill(i, false));
        p.removeAttribute('stroke');
      });
      vp.querySelectorAll('text[data-ring="sruti-label"]').forEach((t) => {
        const i = parseInt(t.getAttribute('data-sruti-idx'), 10);
        t.setAttribute('fill', _srutiTextFill(i, false));
        t.setAttribute('font-weight', 'normal');
      });
      sectorPathEl.setAttribute('fill', _srutiFill(idx, true));
      sectorPathEl.setAttribute('stroke', THEME.fg || '#ebdbb2');
      sectorPathEl.setAttribute('stroke-width', '1.5');
      // Update active label to dark-on-amber text
      vp.querySelectorAll(`text[data-ring="sruti-label"][data-sruti-idx="${idx}"]`).forEach((t) => {
        t.setAttribute('fill', _srutiTextFill(idx, true));
        t.setAttribute('font-weight', 'bold');
      });
      if (typeof openPlayer === 'function') {
        openPlayer(entry.id, entry.note + ' tanpura', 'sruti');
      }
    }

    tanpuraData.forEach((entry, idx) => {
      const startD = idx * SECT_DEG;
      const endD   = startD + SECT_DEG;
      const isActive = (idx === _activeIdx);
      const sect = svgEl('path', {
        d: sectorPath(cx, cy, 0, R_SRUTI, startD, endD),
        fill: _srutiFill(idx, isActive),
        'pointer-events': 'all', cursor: 'pointer',
        'data-ring': 'sruti', 'data-sruti-idx': String(idx),
        tabindex: '0',
      });
      if (isActive) {
        sect.setAttribute('stroke', THEME.fg || '#ebdbb2');
        sect.setAttribute('stroke-width', '1.5');
      }
      const sectTitle = svgEl('title', {});
      sectTitle.textContent = entry.note + ' — tanpura drone';
      sect.appendChild(sectTitle);
      sect.addEventListener('click', (e) => {
        e.stopPropagation();
        if (RagaWheel._sruti.activeIdx === idx) {
          _stopSruti();
        } else {
          _startSruti(idx, entry, sect);
        }
      });
      vp.appendChild(sect);

      // Tiny pitch label at sector mid-angle
      const midDeg = startD + SECT_DEG / 2;
      const lp = polar(cx, cy, lblR, midDeg);
      const lbl = svgEl('text', {
        x: lp.x, y: lp.y,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: _srutiTextFill(idx, isActive),
        'font-size': lblFontSize + 'px',
        'font-weight': isActive ? 'bold' : 'normal',
        'pointer-events': 'none',
        'data-ring': 'sruti-label',
        'data-sruti-idx': String(idx),
      });
      // Render accidentals (e.g. "C#") with the letter at full size and the
      // "#" as a smaller superscript tspan to keep the label inside its slice.
      if (entry.note.includes('#')) {
        const letter = svgEl('tspan', {});
        letter.textContent = entry.note.replace('#', '');
        const sharp = svgEl('tspan', {
          'font-size': Math.round(lblFontSize * 0.62) + 'px',
          'dy': '-0.38em',
          'dx': '0.06em',
        });
        sharp.textContent = '#';
        lbl.appendChild(letter);
        lbl.appendChild(sharp);
      } else {
        lbl.textContent = entry.note;
      }
      vp.appendChild(lbl);
    });
  }

  // Ring 1 — Cakra wedge ring (R_MADHYAMA → R_CAKRA): 12 wedges, 30° each
  // ADR-126: cakra ring is now a neutral structural band — bgPanel fill, THEME.border hairline.
  // Wedges are distinguished by angular position and cakra name label only.
  for (let cakra = 1; cakra <= 12; cakra++) {
    const startDeg = (cakra - 1) * 30, endDeg = cakra * 30;
    const cakraPath = svgEl('path', {
      d: sectorPath(cx, cy, R_MADHYAMA, R_CAKRA, startDeg, endDeg),
      fill: getCakraColor(cakra), opacity: 0.82, stroke: THEME.border, 'stroke-width': 1,
      'pointer-events': 'all', cursor: 'pointer',
      'data-ring': 'cakra', 'data-cakra': cakra, 'data-orig-opacity': 0.82, tabindex: '0',
    });
    const cakraTitle = svgEl('title', {});
    const cakraMelaStart = cakra <= 6 ? (cakra - 1) * 6 + 1 : (cakra - 7) * 6 + 37;
    const cakraName = CAKRA_NAMES[cakra <= 6 ? cakra : cakra - 6] || String(cakra);
    cakraTitle.textContent = `Cakra ${cakra} — ${cakraName} — melas ${cakraMelaStart}–${cakraMelaStart + 5}`;
    cakraPath.appendChild(cakraTitle);
    cakraPath.addEventListener('click', (e) => {
      e.stopPropagation();
      const melaIds = [];
      for (let M = 1; M <= 72; M++) {
        const n = M <= 36 ? M : M - 36;
        const c = Math.floor((n - 1) / 6) + 1; // 1..6 within hemisphere
        const actualC = M <= 36 ? c : c + 6;
        if (actualC === cakra) melaIds.push(M);
      }
      _lightUpMelas(melaIds);
      if (typeof applyBaniFilter === 'function') applyBaniFilter('cakra', String(cakra));
      _litMelaId = null;
    });
    vp.appendChild(cakraPath);
    const midDeg = startDeg + 15;
    const lp = polar(cx, cy, (R_MADHYAMA + R_CAKRA) / 2, midDeg);
    const cakraRotDeg = midDeg <= 180 ? midDeg - 90 : midDeg + 90;
    const nameLbl = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: THEME.fg, 'font-size': Math.max(8, minDim * 0.017) + 'px',
      'font-weight': 'bold', 'pointer-events': 'none',
      transform: `rotate(${cakraRotDeg}, ${lp.x}, ${lp.y})`
    });
    nameLbl.textContent = CAKRA_NAMES[cakra] || String(cakra);
    vp.appendChild(nameLbl);
  }

  // Ring 2 — Ri-ga arc ring (R_CAKRA → R_RIGA): 12 arcs, one per cakra wedge
  // ADR-126: vertical split — inner half = R swara colour, outer half = G swara colour.
  // Each half rendered at full saturation; group opacity controls overall brightness.
  const rigaFontSize = Math.max(10, minDim * 0.020);
  for (let cakra = 1; cakra <= 12; cakra++) {
    const startDeg = (cakra - 1) * 30, endDeg = cakra * 30;
    const rigaIdx = (cakra - 1) % 6;  // 0..5, repeats identically in each hemisphere
    const ri = _PAIRS[rigaIdx][0], ga = _PAIRS[rigaIdx][1];
    const rigaMid = (R_CAKRA + R_RIGA) / 2;
    // Group carries data-ring for light-up selectors; pointer-events on hit target inside
    const rigaG = svgEl('g', {
      'data-ring': 'riga', 'data-cakra': cakra, 'data-orig-opacity': 0.62, opacity: 0.62,
      'pointer-events': 'none',
    });
    const rigaTitle = svgEl('title', {});
    rigaTitle.textContent = `${_RIGA_LABELS[rigaIdx]} (R${ri}G${ga}) — 12 melas (both hemispheres)`;
    rigaG.appendChild(rigaTitle);
    // Inner half: R swara colour
    rigaG.appendChild(svgEl('path', {
      d: sectorPath(cx, cy, R_CAKRA, rigaMid, startDeg, endDeg),
      fill: THEME.swara['R' + ri], stroke: THEME.labelOutline, 'stroke-width': 0.25,
      'pointer-events': 'none',
    }));
    // Outer half: G swara colour
    rigaG.appendChild(svgEl('path', {
      d: sectorPath(cx, cy, rigaMid, R_RIGA, startDeg, endDeg),
      fill: THEME.swara['G' + ga], stroke: THEME.labelOutline, 'stroke-width': 0.25,
      'pointer-events': 'none',
    }));
    // Transparent hit target (full radial extent) for pointer events
    const rigaHit = svgEl('path', {
      d: sectorPath(cx, cy, R_CAKRA, R_RIGA, startDeg, endDeg),
      fill: 'transparent', stroke: 'none',
      'pointer-events': 'all', cursor: 'pointer', tabindex: '0',
    });
    rigaHit.addEventListener('click', (e) => {
      e.stopPropagation();
      const melaIds = [];
      for (let M = 1; M <= 72; M++) {
        const n2 = M <= 36 ? M : M - 36;
        if (Math.floor((n2 - 1) / 6) === rigaIdx) melaIds.push(M);
      }
      const outerSwaraColor = THEME.swara['G' + ga];
      _lightUpMelas(melaIds, outerSwaraColor);
      if (typeof applyBaniFilter === 'function') applyBaniFilter('riga', String(rigaIdx));
      _litMelaId = null;
    });
    rigaG.appendChild(rigaHit);
    vp.appendChild(rigaG);
    const midDeg = startDeg + 15;
    const lp = polar(cx, cy, (R_CAKRA + R_RIGA) / 2, midDeg);
    const rotDeg = midDeg <= 180 ? midDeg - 90 : midDeg + 90;
    const rlbl = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: THEME.fg, 'font-size': rigaFontSize + 'px',
      'font-weight': 'bold', 'pointer-events': 'none',
      transform: `rotate(${rotDeg}, ${lp.x}, ${lp.y})`
    });
    rlbl.textContent = midDeg <= 180 ? _RIGA_LABELS[rigaIdx] : _RIGA_LABELS_REV[rigaIdx];
    vp.appendChild(rlbl);
  }

  // Ring 3 — Da-ni cell ring (R_RIGA → R_DANI): 72 cells, 5° each (6 per cakra wedge)
  // ADR-126: vertical split — inner half = D swara colour, outer half = N swara colour.
  // Each half rendered at full saturation; group opacity controls overall brightness.
  const daniFontSize = Math.max(8, minDim * 0.015);
  for (let n = 1; n <= 72; n++) {
    const startDeg = (n - 1) * 5, endDeg = n * 5;
    const daniIdx = (n - 1) % 6;
    const da = _PAIRS[daniIdx][0], ni = _PAIRS[daniIdx][1];
    const daniMid = (R_RIGA + R_DANI) / 2;
    const companionM = n <= 36 ? n + 36 : n - 36;
    // Group carries data-ring for light-up selectors
    const daniG = svgEl('g', {
      'data-ring': 'dani', 'data-mela': n, 'data-orig-opacity': 0.50, opacity: 0.50,
      'pointer-events': 'none',
    });
    const daniTitle = svgEl('title', {});
    daniTitle.textContent = `${_DANI_LABELS[daniIdx]} (D${da}N${ni}) — melas ${n} & ${companionM}`;
    daniG.appendChild(daniTitle);
    // Inner half: D swara colour
    daniG.appendChild(svgEl('path', {
      d: sectorPath(cx, cy, R_RIGA, daniMid, startDeg, endDeg),
      fill: THEME.swara['D' + da], stroke: THEME.labelOutline, 'stroke-width': 0.25,
      'pointer-events': 'none',
    }));
    // Outer half: N swara colour
    daniG.appendChild(svgEl('path', {
      d: sectorPath(cx, cy, daniMid, R_DANI, startDeg, endDeg),
      fill: THEME.swara['N' + ni], stroke: THEME.labelOutline, 'stroke-width': 0.25,
      'pointer-events': 'none',
    }));
    // Transparent hit target for pointer events
    const daniHit = svgEl('path', {
      d: sectorPath(cx, cy, R_RIGA, R_DANI, startDeg, endDeg),
      fill: 'transparent', stroke: 'none',
      'pointer-events': 'all', cursor: 'pointer', tabindex: '0',
    });
    daniHit.addEventListener('click', (e) => {
      e.stopPropagation();
      const companionM2 = n <= 36 ? n + 36 : n - 36;
      const outerSwaraColor = THEME.swara['N' + ni];
      _lightUpMelas([n, companionM2], outerSwaraColor);
      if (typeof applyBaniFilter === 'function') applyBaniFilter('dani', String(daniIdx));
      _litMelaId = null;
    });
    daniG.appendChild(daniHit);
    vp.appendChild(daniG);
    // Show da-ni subscript only when the cell arc is wide enough to be legible
    const arcLen = R_DANI * 5 * Math.PI / 180;
    if (arcLen >= 7) {
      const midDeg = startDeg + 2.5;
      const lp = polar(cx, cy, (R_RIGA + R_DANI) / 2, midDeg);
      const rotDeg = midDeg <= 180 ? midDeg - 90 : midDeg + 90;
      const dlbl = svgEl('text', {
        x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: THEME.fg, 'font-size': daniFontSize + 'px',
        'font-weight': 'bold', 'pointer-events': 'none',
        transform: `rotate(${rotDeg}, ${lp.x}, ${lp.y})`
      });
      dlbl.textContent = midDeg <= 180 ? _DANI_LABELS[daniIdx] : _DANI_LABELS_REV[daniIdx];
      vp.appendChild(dlbl);
    }
  }

  // Vertical hemisphere dividing line (top \u2192 bottom through centre)
  vp.appendChild(svgEl('line', {
    x1: cx, y1: cy - R_MELA, x2: cx, y2: cy + R_MELA,
    stroke: THEME.fg, 'stroke-width': 1, opacity: 0.35, 'pointer-events': 'none'
  }));

  // ── ADR-123: Mela ring (R_DANI \u2192 R_MELA) \u2014 72 arc slots, 5\u00b0 each ────────────────
  // Two-pass rendering: all arc slots first, then all labels on top (labels in _labelLayer).
  const melaCirleGroups = [];
  for (let n = 1; n <= 72; n++) {
    const startDeg = (n - 1) * 5;
    const endDeg   = n * 5;
    const angleRad = melaAngles[n - 1];    // centre angle of this slot
    const pos      = polar(cx, cy, (R_DANI + R_MELA) / 2, startDeg + 2.5);  // visual centre
    const raga  = melaByNum[n];
    const cakra = Math.ceil(n / 6); // used for cakra name in tooltip

    const isLive = raga && melasWithMusic.has(raga.id);
    const origOpacity = isLive ? 0.90 : (raga ? 0.30 : 0.20);

    const g = svgEl('g', { class: 'mela-node', 'data-mela': n, 'data-id': raga ? raga.id : '' });

    // Arc sector — ADR-126: neutral bgDeep fill, borderStrong hairline; live/dim by opacity only
    const slotPath = svgEl('path', {
      d: sectorPath(cx, cy, R_DANI, R_MELA, startDeg, endDeg),
      fill: THEME.bgDeep,
      stroke: THEME.borderStrong,
      'stroke-width': 0.5,
      opacity: origOpacity,
      'data-mela': n,
      'data-orig-opacity': origOpacity
    });
    g.appendChild(slotPath);

    // Mela number inside the slot — ADR-126: THEME.fg (cream on neutral bgDeep)
    if (raga) {
      const numFontSize = Math.max(7, minDim * 0.012);
      const midDeg = startDeg + 2.5;
      const numPos = polar(cx, cy, (R_DANI + R_MELA) * 0.5, midDeg);
      const numRotDeg = midDeg <= 180 ? midDeg - 90 : midDeg + 90;
      const numLbl = svgEl('text', {
        x: numPos.x, y: numPos.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: THEME.fg, 'font-size': numFontSize + 'px', 'font-weight': 'bold',
        'pointer-events': 'none', opacity: isLive ? 1 : 0.5,
        transform: `rotate(${numRotDeg}, ${numPos.x}, ${numPos.y})`
      });
      numLbl.textContent = String(n);
      g.appendChild(numLbl);
    }

    // Transparent hit-target arc (slightly wider for touch accuracy)
    const hitPath = svgEl('path', {
      d: sectorPath(cx, cy, R_DANI, R_MELA + minDim * 0.03, startDeg, endDeg),
      fill: 'transparent', 'pointer-events': 'all', stroke: 'none'
    });
    g.appendChild(hitPath);

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
          // On mobile, dismiss the bani-flow panel before opening the box so
          // the rasika only sees one thing at a time (wheel tap \u2192 box \u2192 panel cascade).
          if (window.matchMedia('(max-width: 768px)').matches && typeof window.setPanelState === 'function') {
            window.setPanelState('IDLE');
          }
          // Option B: show mela\u2192janya\u2192comp in the detail panel instead of SVG fans
          _openWheelDetailPanel(raga);
          slotPath.setAttribute('stroke', THEME.accentSelect);
          slotPath.setAttribute('stroke-width', 2);
          _expandedMela = raga.id;
          if (typeof window.lightUpSpine === 'function') window.lightUpSpine(raga.id);
          // Dim all other mela arc slots so the selected one stands out
          vp.querySelectorAll('.mela-node path[data-mela]').forEach(c => {
            const melaG = c.closest('.mela-node');
            const nodeId = melaG ? melaG.getAttribute('data-id') : '';
            if (nodeId !== raga.id) {
              c.setAttribute('opacity', '0.10');
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
          if (!window._wheelPreviewNoPanel && typeof applyBaniFilter === 'function') {
            applyBaniFilter('raga', raga.id);
          }
          window._wheelSyncInProgress = false;
        }
      });
      g.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (_dragMoved) return;
        if (typeof openMetaInspector === 'function') openMetaInspector('mela', raga);
      });
    }
    vp.appendChild(g);
    melaCirleGroups.push({ n, angleRad, raga });
  }

  // Pass 2: mela name labels in the module-level _labelLayer (always topmost)
  _labelLayer = svgEl('g', { id: 'wheel-label-layer', 'pointer-events': 'none' });
  melaCirleGroups.forEach(({ n, angleRad, raga }) => {
    const angleDeg = angleRad * 180 / Math.PI;
    // Anchor inner edge of chip at R_MELA + MELA_LABEL_GAP (thin parametric band).
    // _labelWithBg centres the chip at its anchor point; shifting by +tw/2 radially puts the
    // inner edge at exactly (R_MELA + MELA_LABEL_GAP). _PAD_X/_GLYPH must match _labelWithBg.
    const _PAD_X = 3, _GLYPH = '\u25c8\u00a0'; // raga chip glyph (2 chars)
    const _dispText = _GLYPH + (raga ? raga.name : String(n));
    const _tw = _dispText.length * melaFontSize * 0.55 + _PAD_X * 2;
    const lp = polarRad(cx, cy, R_MELA + MELA_LABEL_GAP + _tw / 2, angleRad);
    // ADR-140: store the outer-tip radius of each mela chip so _positionWdpAtMela
    // can anchor the WDP just past the chip head (clear of the mela label).
    if (!RagaWheel._geometry.rMelaHead) RagaWheel._geometry.rMelaHead = {};
    RagaWheel._geometry.rMelaHead[n] = R_MELA + MELA_LABEL_GAP + _tw;
    const normAngle = ((angleDeg % 360) + 360) % 360;
    let melaRotDeg, anchor;
    if (Math.abs(normAngle - 0) < 1e-6)        { melaRotDeg = -90;           anchor = 'middle'; }
    else if (Math.abs(normAngle - 180) < 1e-6) { melaRotDeg = 90;            anchor = 'middle'; }
    else if (normAngle < 180)   { melaRotDeg = angleDeg - 90; anchor = 'start';  }
    else                        { melaRotDeg = angleDeg + 90; anchor = 'end';    }
    const isLiveLbl = raga && melasWithMusic.has(raga.id);
    // Non-live: dim to 0.28 AND desaturate so the bright chip border colour doesn't
    // compensate perceptually for the low opacity (ADR-124: "no contributions" signal).
    const melaLblOpacity = isLiveLbl ? 1 : 0.28;
    const lbl = _labelWithBg(_labelLayer, raga ? raga.name : String(n), lp.x, lp.y, melaFontSize, {
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
    // Desaturate non-live chip so the coloured border/text doesn't read as "active"
    if (!isLiveLbl) {
      const wrapG = lbl.parentElement;
      if (wrapG) wrapG.style.filter = 'grayscale(1)';
    }
  });
  vp.appendChild(_labelLayer);
};

// vp = viewport <g> for pan/zoom; svg = root SVG for tooltip sizing
function _collapseAll(vp, melaByNum) {
  _closeWheelDetailPanel();
  vp.querySelectorAll('.janya-group, .comp-group, .musc-group').forEach(g => g.remove());
  // Also clear satellite labels from the shared label layer
  if (_labelLayer) {
    _labelLayer.querySelectorAll('.sat-label').forEach(el => el.remove());
  }
  vp.querySelectorAll('.mela-node path[data-mela]').forEach(c => {
    const n = parseInt(c.getAttribute('data-mela'));
    const raga = melaByNum[n];
    c.setAttribute('stroke', raga ? THEME.fg : THEME.edgeLine);
    c.setAttribute('stroke-width', raga ? 0.75 : 0.5);
    // Restore original opacity (Bug fix: mela nodes stayed dimmed after comp collapse)
    const orig = c.getAttribute('data-orig-opacity');
    if (orig) c.setAttribute('opacity', orig);
  });
  // Restore mela label opacity
  if (_labelLayer) {
    _labelLayer.querySelectorAll('.mela-label').forEach(lbl => {
      const orig = lbl.getAttribute('data-orig-opacity');
      if (orig) lbl.setAttribute('opacity', orig);
      lbl.style.filter = parseFloat(orig) < 1 ? 'grayscale(1)' : '';
    });
  }
  vp.querySelectorAll('.janya-node circle').forEach(c => c.setAttribute('opacity', '0.75'));
  _expandedMela = null; _expandedJanya = null; _expandedComp = null;
  hideWheelTooltip();
}

function _expandMela(vp, svg, raga, melaAngle, cx, cy,
    R_MELA, R_JANYA, R_COMP, R_MUSC,
    NR_MELA, NR_JANYA, NR_COMP, NR_MUSC,
    janyasByMela, compsByRaga, rtpByRaga, melaColor, minDim) {
  const janyas = janyasByMela[raga.id] || [];
  const melaPos = polarRad(cx, cy, R_MELA, melaAngle);
  const g = svgEl('g', { class: 'janya-group', 'data-parent': raga.id });

  // Always show the mela's own music (compositions + performances) directly at R_COMP.
  // compsByRaga already includes all three sources (compositions, recordings, youtube).
  const melaDirect = (compsByRaga[raga.id] || []).length;

  if (janyas.length === 0 && melaDirect === 0) {
    // Nothing to show at all
    const lp = polarRad(cx, cy, R_JANYA, melaAngle);
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
    // ADR-093: solve fan geometry using actual chip widths for tangential arc spacing.
    // maxSpread=0.9π is a wide ceiling so spreadAtBaseline drives layout for typical
    // node counts (radius stays at rBaseline); only degenerate large fans inflate it.
    const jFontSize = Math.max(10, minDim * 0.020);
    const jMaxChars = janyas.reduce((m, j) => Math.max(m, (j.name || '').length), 1);
    const janyaLayout = solveRingLayout({
      n: janyas.length,
      fontSize: jFontSize,
      maxLabelChars: jMaxChars,
      k: _readChipSpacingK(),
      openFan: {
        anchorAngle: melaAngle,
        maxSpread: Math.PI * 0.9,
        rBaseline: R_JANYA
      }
    });
    janyas.forEach((janya, i) => {
      const jAngle = janyaLayout.angles[i];
      const jPos = polarRad(cx, cy, janyaLayout.radius, jAngle);

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
        if (!window._wheelPreviewNoPanel && typeof applyBaniFilter === 'function') {
          applyBaniFilter('raga', janya.id);
        }
        window._wheelSyncInProgress = false;
      });
      jg.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (_dragMoved) return;
        if (typeof openMetaInspector === 'function') openMetaInspector('janya', janya);
      });
      // Janya label goes into _labelLayer so it is always on top.
      // Passing a clickHandler makes the pill a pointer target — improves touch accuracy.
      if (_labelLayer) {
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
    const lp = polarRad(cx, cy, R_COMP, jAngle);
    const t = svgEl('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: THEME.borderStrong, 'font-size': '11px', 'pointer-events': 'none'
    });
    t.textContent = 'no compositions';
    g.appendChild(t);
    vp.appendChild(g);
    return;
  }

  // ADR-093: composition fan — actual chip widths for tangential spacing, wide ceiling.
  const cFontSize = Math.max(9, minDim * 0.018);
  const cMaxChars = items.reduce((m, item) => Math.max(m, (item.title || '').length), 1);
  const compLayout = solveRingLayout({
    n: items.length,
    fontSize: cFontSize,
    maxLabelChars: cMaxChars,
    k: _readChipSpacingK(),
    openFan: {
      anchorAngle: jAngle,
      maxSpread: Math.PI * 0.9,
      rBaseline: R_COMP
    }
  });
  items.forEach((item, i) => {
    const cAngle = compLayout.angles[i];
    const cPos = polarRad(cx, cy, compLayout.radius, cAngle);

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
        if (window._wheelPreviewNoPanel) {
          return;
        }
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
      if (!window._wheelPreviewNoPanel && typeof showClickNudge === 'function') {
        showClickNudge('tap again \u00B7 open bani flow');
      }
      // Silently load bani-flow data (no panel pop-open on first click).
      // Guard: prevent syncRagaWheelToFilter from redrawing the wheel.
      window._wheelSyncInProgress = true;
      if (!window._wheelPreviewNoPanel && typeof applyBaniFilter === 'function') {
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

  // Expose _triggerMelaExpand at window level so syncRagaWheelToFilter (outside IIFE) can call it.
  // Option B: opens the detail panel for the given mela and pre-selects the janya/comp.
  window._triggerMelaExpand = function(melaNum, targetRagaId, targetCompId) {
    window._wheelSyncInProgress = true;
    const raga = _wdpData && _wdpData.melaByNum[melaNum];
    if (!raga) { window._wheelSyncInProgress = false; return; }

    // Highlight the mela node on the wheel ring.
    // _wheelPreviewNoPanel suppresses the applyBaniFilter('raga', melaId) call inside the
    // mela click handler — we must not overwrite the bani filter that the search already set.
    const melaG = document.querySelector(`#wheel-viewport .mela-node[data-mela="${melaNum}"]`);
    window._wheelPreviewNoPanel = true;
    if (melaG) melaG.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else _openWheelDetailPanel(raga);
    window._wheelPreviewNoPanel = false;

    // Pre-select the target janya in the panel — visual only (suppressFilter=true so the
    // bani filter already set by the caller is not overridden by the parent raga).
    if (targetRagaId && _wdpData) {
      setTimeout(() => {
        const janya = (_wdpData.janyasByMela[raga.id] || []).find(j => j.id === targetRagaId);
        if (janya) {
          const chipEl = document.querySelector(
            `#wdp-janya-list .wdp-chip.wdp-raga[data-id="${CSS.escape(targetRagaId)}"]`
          );
          // Pass targetCompId so the matching comp chip is marked wdp-active during render.
          _wdpSelectJanya(janya, chipEl, true, targetCompId || null);
        }
        setTimeout(() => { window._wheelSyncInProgress = false; }, 50);
      }, 50);
    } else if (targetCompId && _wdpData) {
      // Mela-direct composition (no janya intermediary) —
      // re-render the mela-direct comp list with wdp-active applied at render time.
      setTimeout(() => {
        const melaRagaObj = _wdpData.melaByNum[melaNum];
        if (melaRagaObj && _wdpData.compsByRaga[melaRagaObj.id]) {
          const panel = document.getElementById('wheel-detail-panel');
          if (panel) {
            panel.querySelectorAll('.wdp-comp-group').forEach(el => el.remove());
            _wdpRenderComps(panel, _wdpData.compsByRaga[melaRagaObj.id], melaRagaObj.id, null, targetCompId);
          }
        }
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
  if (typeof window.lightUpSpine === 'function') window.lightUpSpine(melaRaga.id);
}

function orientRagaWheel(type, id) {
  if (currentView !== 'raga') return;
  let ragaId = id;
  if (type === 'comp') {
    const comp = compositions.find(c => c.id === id);
    if (!comp || !comp.raga_id) return;
    ragaId = comp.raga_id;
  }
  if (typeof window.lightUpSpine === 'function') window.lightUpSpine(ragaId);
}

