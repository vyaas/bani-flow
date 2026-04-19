// ── ADR-034 + ADR-036 + ADR-039: Mobile navigation choreography ────────────
// Panel state machine with mutual exclusion, dual drawers (left=Trail,
// right=Musician), collapsible filter bar. All functions are exposed on
// window so graph_view.js callbacks can call them safely on both desktop
// and mobile.
(function () {
  'use strict';

  // ── Panel State Machine ──────────────────────────────────────────────────
  // States: IDLE | MUSICIAN | TRAIL
  // ADR-039: PEEK state removed — right sidebar is now a drawer, not a sheet.
  // Mutual exclusion: TRAIL and MUSICIAN are never both active.
  var panelState = 'IDLE';

  var sidebar        = document.getElementById('left-sidebar');
  var leftScrim      = document.getElementById('left-drawer-scrim');
  var rightSidebar   = document.getElementById('right-sidebar');
  var rightScrim     = document.getElementById('right-drawer-scrim');
  var tabMusician    = document.getElementById('tab-musician');
  var tabTrail       = document.getElementById('tab-trail');

  function _openLeftDrawer() {
    if (sidebar)   sidebar.classList.add('drawer-open');
    if (leftScrim) leftScrim.classList.add('scrim-visible');
  }

  function _closeLeftDrawer() {
    if (sidebar)   sidebar.classList.remove('drawer-open');
    if (leftScrim) leftScrim.classList.remove('scrim-visible');
  }

  function _openRightDrawer() {
    if (rightSidebar) rightSidebar.classList.add('drawer-open');
    if (rightScrim)   rightScrim.classList.add('scrim-visible');
  }

  function _closeRightDrawer() {
    if (rightSidebar) rightSidebar.classList.remove('drawer-open');
    if (rightScrim)   rightScrim.classList.remove('scrim-visible');
  }

  function _updateTabs(state) {
    // ADR-041: tab-active class replaces generic .active for toggle highlight
    if (tabMusician) tabMusician.classList.toggle('tab-active', state === 'MUSICIAN');
    if (tabTrail)    tabTrail.classList.toggle('tab-active', state === 'TRAIL');
  }

  function setPanelState(newState) {
    if (window.innerWidth > 768) return;

    // ADR-039: map legacy PEEK state to MUSICIAN (backward compat for media_player.js save/restore)
    if (newState === 'PEEK') newState = 'MUSICIAN';

    panelState = newState;

    // Close everything first
    _closeLeftDrawer();
    _closeRightDrawer();

    // Open the requested panel
    if (newState === 'TRAIL') {
      _openLeftDrawer();
    } else if (newState === 'MUSICIAN') {
      _openRightDrawer();
    }

    _updateTabs(newState);

    // Cytoscape caches container dimensions; nudge after transition starts
    if (typeof cy !== 'undefined') {
      setTimeout(function () { cy.resize(); }, 30);
    }
  }

  // ── Backward-compatible public API ───────────────────────────────────────
  // These are called by graph_view.js and other scripts.

  function toggleLeftDrawer() {
    if (panelState === 'TRAIL') {
      setPanelState('IDLE');
    } else {
      setPanelState('TRAIL');
    }
  }

  // ADR-039: peekBottomSheet now opens the right drawer (MUSICIAN) instead of PEEK
  function peekBottomSheet() {
    if (window.innerWidth > 768) return;
    setPanelState('MUSICIAN');
  }

  function dismissBottomSheet() {
    if (window.innerWidth > 768) return;
    setPanelState('IDLE');
  }

  // ADR-039: showBottomSheet maps both 'peek' and 'expanded' to MUSICIAN
  function showBottomSheet(state) {
    if (window.innerWidth > 768) return;
    if (state === 'expanded' || state === 'peek') setPanelState('MUSICIAN');
    else setPanelState('IDLE');
  }

  // ── Filter badge (ADR-040: toggle removed, chips always visible) ─────────
  function updateFilterBadge() {
    var filterBadge = document.getElementById('filter-active-badge');
    if (!filterBadge) return;
    var activeCount = document.querySelectorAll('.filter-chip.active').length;
    filterBadge.textContent = activeCount > 0 ? '(' + activeCount + ' active)' : '';
  }

  // ── Bottom tab bar (ADR-036 + ADR-039) ────────────────────────────────────
  function _setupTabBar() {
    if (tabMusician) {
      tabMusician.addEventListener('click', function (e) {
        e.stopPropagation(); // ADR-038: isolate from canvas
        if (panelState === 'MUSICIAN') {
          setPanelState('IDLE');
        } else {
          setPanelState('MUSICIAN');
        }
      });
    }
    if (tabTrail) {
      tabTrail.addEventListener('click', function (e) {
        e.stopPropagation(); // ADR-038: isolate from canvas
        if (panelState === 'TRAIL') {
          setPanelState('IDLE');
        } else {
          setPanelState('TRAIL');
        }
      });
    }
  }

  // ADR-041: drawer close buttons removed — tab bar toggle + scrim dismiss

  // ── Event wiring ─────────────────────────────────────────────────────────
  // ADR-038: hamburger removed — Trail tab is sole mobile entry point

  if (leftScrim) leftScrim.addEventListener('click', function () { setPanelState('IDLE'); });

  // ADR-039: right drawer scrim closes musician panel
  if (rightScrim) rightScrim.addEventListener('click', function () { setPanelState('IDLE'); });

  // ADR-040: filter toggle removed — chips always visible

  _setupTabBar();

  // ── Public API ───────────────────────────────────────────────────────────
  window.toggleLeftDrawer   = toggleLeftDrawer;
  window.peekBottomSheet    = peekBottomSheet;
  window.dismissBottomSheet = dismissBottomSheet;
  window.showBottomSheet    = showBottomSheet;
  window.setPanelState      = setPanelState;
  window.updatePeekLabel    = function () {};  // ADR-039: no-op, peek label removed
  window.updateFilterBadge  = updateFilterBadge;

  // ADR-037: expose current panel state for media player save/restore
  Object.defineProperty(window, '_currentPanelState', {
    get: function () { return panelState; }
  });

}());
