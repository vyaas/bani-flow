// ── ADR-034: Responsive layout — left drawer + bottom sheet ─────────────────
// All functions are exposed on window so graph_view.js callbacks can call them
// safely on both desktop (no-ops) and mobile.
(function () {
  'use strict';

  var leftDrawerOpen = false;

  // ── Left Drawer ─────────────────────────────────────────────────────────────

  function toggleLeftDrawer() {
    leftDrawerOpen = !leftDrawerOpen;
    var sidebar = document.getElementById('left-sidebar');
    var scrim   = document.getElementById('left-drawer-scrim');
    if (sidebar) sidebar.classList.toggle('drawer-open', leftDrawerOpen);
    if (scrim)   scrim.classList.toggle('scrim-visible', leftDrawerOpen);
    // Cytoscape caches container dimensions; resize after the CSS transition starts
    if (typeof cy !== 'undefined') {
      setTimeout(function () { cy.resize(); }, 30);
    }
  }

  // ── Bottom Sheet ─────────────────────────────────────────────────────────────
  // Three states: 'dismissed' | 'peek' | 'expanded'

  var sheetState = 'dismissed';

  function _applySheetState(state) {
    sheetState = state;
    var sheet = document.getElementById('right-sidebar');
    if (!sheet) return;
    sheet.classList.remove('peek', 'expanded');
    document.body.classList.remove('sheet-peek', 'sheet-expanded');
    if (state === 'peek') {
      sheet.classList.add('peek');
      document.body.classList.add('sheet-peek');
    } else if (state === 'expanded') {
      sheet.classList.add('expanded');
      document.body.classList.add('sheet-expanded');
    }
  }

  function peekBottomSheet() {
    if (window.innerWidth > 768) return;
    _applySheetState('peek');
  }

  function dismissBottomSheet() {
    if (window.innerWidth > 768) return;
    _applySheetState('dismissed');
  }

  function showBottomSheet(state) {
    if (window.innerWidth > 768) return;
    _applySheetState(state);
  }

  // ── Sheet handle touch interactions ─────────────────────────────────────────
  // Tap on handle: cycles peek → expanded.
  // Swipe up  (dy < −20): expands.
  // Swipe down (dy >  20): expanded → peek, peek → dismissed.

  var touchStartY = null;

  function _setupSheetHandle() {
    var handle = document.getElementById('sheet-handle');
    if (!handle) return;

    handle.addEventListener('touchstart', function (e) {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    handle.addEventListener('touchend', function (e) {
      if (touchStartY === null) return;
      var dy = e.changedTouches[0].clientY - touchStartY;
      touchStartY = null;
      if (Math.abs(dy) < 10) {
        // Tap — cycle states
        if (sheetState === 'peek')     _applySheetState('expanded');
        else if (sheetState === 'expanded') _applySheetState('peek');
      } else if (dy < -20) {
        _applySheetState('expanded');
      } else if (dy > 20) {
        if (sheetState === 'expanded') _applySheetState('peek');
        else                           _applySheetState('dismissed');
      }
    }, { passive: true });
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────
  // Scripts run just before </body>; DOM is fully parsed at this point.

  var hamburger = document.getElementById('hamburger-btn');
  if (hamburger) hamburger.addEventListener('click', toggleLeftDrawer);

  var scrim = document.getElementById('left-drawer-scrim');
  if (scrim) scrim.addEventListener('click', toggleLeftDrawer);

  _setupSheetHandle();

  // ── Public API ───────────────────────────────────────────────────────────────
  window.toggleLeftDrawer   = toggleLeftDrawer;
  window.peekBottomSheet    = peekBottomSheet;
  window.dismissBottomSheet = dismissBottomSheet;
  window.showBottomSheet    = showBottomSheet;

}());
