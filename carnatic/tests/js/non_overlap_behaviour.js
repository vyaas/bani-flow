// non_overlap_behaviour.js — ADR-176 behavioural tests for the app-level
// non-overlap contract, run through node against the SHIPPED template.
//
// The geometry core is pure: _rectsOverlap() and _resolveNonOverlap() take
// plain rects and return a position, with no DOM. This runner extracts those
// two functions verbatim from carnatic/render/templates/media_player.js and
// asserts the invariant the contract promises:
//
//   • a proposal clear of everything is returned unchanged (clamped in bounds)
//   • a proposal over an obstacle is pushed to a zero-overlap position
//   • with both sidebars + the playlist UI, the player lands in the free column
//   • no candidate => the least-overlap fallback never NaNs / throws
//
// Run one scenario:  node carnatic/tests/js/non_overlap_behaviour.js <name>
// Run all:           node carnatic/tests/js/non_overlap_behaviour.js
// Driven by test_non_overlap_geometry.py so it rides the normal pytest run.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const TEMPLATES = path.resolve(__dirname, '..', '..', 'render', 'templates');

function grab(src, startMarker, endMarker, file) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error(`anchor missing in ${file}: ${startMarker}`);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error(`end anchor missing in ${file}: ${endMarker}`);
  return src.slice(a, b);
}

const mpSrc = fs.readFileSync(path.join(TEMPLATES, 'media_player.js'), 'utf8');

// Pure geometry only: _rectsOverlap + _resolveNonOverlap. The end anchor is the
// comment introducing _avoidUIOverlap (the first DOM-aware function after them).
const SLICE = grab(
  mpSrc,
  'function _rectsOverlap(a, b, margin)',
  '// Clamp a proposed parent-space position clear of every obstacle.',
  'media_player.js',
);

const sandbox = { Math, JSON, Object, Array };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  "'use strict';\n" + SLICE + '\nglobalThis.__G = { _rectsOverlap, _resolveNonOverlap, _columnBounds };',
  sandbox,
  { filename: 'adr176_geometry.js' },
);
const G = sandbox.__G;

// ── Helpers ──────────────────────────────────────────────────────────────────
const VIEW = { left: 0, top: 0, right: 1440, bottom: 900 };

function overlapArea(a, b) {
  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function placed(pos, w, h) {
  return { left: pos.left, top: pos.top, right: pos.left + w, bottom: pos.top + h };
}

function totalOverlap(pos, w, h, obstacles) {
  const r = placed(pos, w, h);
  return obstacles.reduce((sum, o) => sum + overlapArea(r, o), 0);
}

function inside(pos, w, h, bounds) {
  return pos.left >= bounds.left - 1 && pos.top >= bounds.top - 1 &&
         pos.left + w <= bounds.right + 1 && pos.top + h <= bounds.bottom + 1;
}

const LEFT_SB  = { left: 0,   top: 50, right: 280, bottom: 836 };
const RIGHT_SB = { left: 1160, top: 50, right: 1440, bottom: 836 };
const UI       = { left: 280, top: 12, right: 1160, bottom: 360 };
const ALL      = [LEFT_SB, RIGHT_SB, UI];

// ── Scenarios ────────────────────────────────────────────────────────────────
const scenarios = {

  // No obstacles: the proposal survives (clamped inside the viewport).
  'clear-proposal-untouched'() {
    const p = G._resolveNonOverlap(600, 500, 480, 300, [], VIEW, 6);
    assert.strictEqual(p.left, 600);
    assert.strictEqual(p.top, 500);
  },

  // Proposal off the right/bottom edge: clamped back inside bounds.
  'proposal-clamped-to-bounds'() {
    const p = G._resolveNonOverlap(2000, 2000, 480, 300, [], VIEW, 6);
    assert.strictEqual(p.left, VIEW.right - 480);
    assert.strictEqual(p.top, VIEW.bottom - 300);
  },

  // A single obstacle over the proposal: pushed clear, zero overlap.
  'single-obstacle-pushed-clear'() {
    const obs = [{ left: 500, top: 400, right: 900, bottom: 600 }];
    const p = G._resolveNonOverlap(600, 450, 480, 300, obs, VIEW, 6);
    assert.strictEqual(totalOverlap(p, 480, 300, obs), 0, 'still overlaps obstacle');
    assert.ok(inside(p, 480, 300, VIEW), 'escaped the viewport');
  },

  // Both sidebars + the playlist UI, player exactly as wide as the free column:
  // it must land flush in the column (x >= left sidebar, x + w <= right) below
  // the UI, with zero overlap. This is the reported "panel withdrew and the
  // player was occluded" case.
  'free-column-between-sidebars-and-ui'() {
    const w = RIGHT_SB.left - LEFT_SB.right;   // column width, 880
    const p = G._resolveNonOverlap(LEFT_SB.right + (w - w) / 2, UI.bottom + 8,
                                   w, 320, ALL, VIEW, 8);
    assert.strictEqual(totalOverlap(p, w, 320, ALL), 0, 'overlaps a surface');
    const r = placed(p, w, 320);
    assert.ok(r.left >= LEFT_SB.right, 'spills under the left sidebar');
    assert.ok(r.right <= RIGHT_SB.left, 'spills under the right sidebar');
    assert.ok(r.top >= UI.bottom, 'overlaps the playlist UI');
    assert.ok(inside(p, w, 320, VIEW), 'escaped the viewport');
  },

  // The reported bug: a wide player docked before a panel was withdrawn — the
  // solver must still find a zero-overlap spot once a sidebar/editor appears.
  'wide-player-clear-of-open-sidebar'() {
    const obs = [LEFT_SB, UI];
    const p = G._resolveNonOverlap(720, 372, 900, 320, obs, VIEW, 8);
    assert.strictEqual(totalOverlap(p, 900, 320, obs), 0, 'wide player overlaps');
    assert.ok(inside(p, 900, 320, VIEW), 'escaped the viewport');
  },

  // ADR-176 chrome band: when both panels are withdrawn the Playlist Bar still
  // starts at its 220px gutter, leaving the floating panel toggles underneath.
  // The player mirrors that inset on the right so it can never reach the
  // musician toggle — never drift to x=0 or hug the 56px help-button edge.
  'withdrawn-panels-keep-player-out-of-gutter'() {
    const ui = { left: 220, top: 12, right: 1344, bottom: 43 };
    const bounds = G._columnBounds(VIEW, ui);
    assert.strictEqual(bounds.left, 220, 'column must start at the bar gutter');
    assert.strictEqual(bounds.right, VIEW.right - 220,
                       'right gutter must mirror the left toggle width');
    const w = bounds.right - bounds.left;
    const p = G._resolveNonOverlap(0, 92, w, 320, [ui], bounds, 8);
    assert.strictEqual(p.left, 220, 'player escaped into the left gutter');
    assert.strictEqual(totalOverlap(p, w, 320, [ui]), 0, 'overlaps the bar');
    assert.ok(inside(p, w, 320, bounds), 'escaped the symmetric chrome band');
  },

  // An open right sidebar still wins when it is wider than the left inset, but
  // the mirrored left inset caps the band when only the right panel is open.
  'column-bounds-keep-open-sidebar-clear'() {
    const ui = { left: 220, top: 12, right: 1036, bottom: 43 };  // right panel open
    const b = G._columnBounds(VIEW, ui);
    assert.strictEqual(b.left, 220);
    assert.strictEqual(b.right, 1036, 'must not spill under the open right panel');
  },

  // The bar can never push the band outside its parent, and a degenerate bar
  // (right <= left) falls back to the parent's right edge.
  'column-bounds-are-parent-intersected'() {
    const parent = { left: 40, top: 0, right: 900, bottom: 800 };
    const ui = { left: 10, top: 12, right: 1000, bottom: 43 };
    const b = G._columnBounds(parent, ui);
    assert.strictEqual(b.left, 40);
    assert.strictEqual(b.right, 900);
    const degenerate = G._columnBounds(parent, { left: 950, right: 400 });
    assert.strictEqual(degenerate.right, 900);
  },

  // Pathologically cramped: an obstacle covers the viewport. Degrade to the
  // least-overlap candidate without throwing or producing NaN.
  'cramped-degrades-not-crashes'() {
    const obs = [{ left: 0, top: 0, right: VIEW.right, bottom: VIEW.bottom - 40 }];
    const p = G._resolveNonOverlap(600, 400, 480, 300, obs, VIEW, 6);
    assert.ok(Number.isFinite(p.left) && Number.isFinite(p.top), 'non-finite position');
    assert.ok(inside(p, 480, 300, VIEW), 'escaped the viewport');
  },

  // _rectsOverlap: margin semantics.
  'rects-overlap-margin'() {
    const a = { left: 0, top: 0, right: 100, bottom: 100 };
    const b = { left: 90, top: 90, right: 200, bottom: 200 };
    assert.strictEqual(G._rectsOverlap(a, b, 0), true);
    const c = { left: 106, top: 0, right: 200, bottom: 100 };
    assert.strictEqual(G._rectsOverlap(a, c, 0), false);
    assert.strictEqual(G._rectsOverlap(a, c, 8), true);  // within the margin
  },
};

// ── Dispatch ─────────────────────────────────────────────────────────────────
const name = process.argv[2];
if (!name) {
  let failed = 0;
  Object.keys(scenarios).forEach(k => {
    try { scenarios[k](); console.log('ok   ' + k); }
    catch (e) { failed++; console.log('FAIL ' + k + '\n  ' + (e && e.message)); }
  });
  console.log(failed ? `\n${failed} scenario(s) failed` : '\nall scenarios passed');
  process.exit(failed ? 1 : 0);
} else {
  if (!scenarios[name]) { console.error('unknown scenario: ' + name); process.exit(2); }
  scenarios[name]();
  console.log('ok ' + name);
}
