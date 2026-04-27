// ── ADR-034 + ADR-036 + ADR-039 + ADR-046: Navigation choreography ──────────
// Panel state machine with mutual exclusion, dual drawers (left=Trail,
// right=Musician), collapsible filter bar. All functions are exposed on
// window so graph_view.js callbacks can call them safely on both desktop
// and mobile. ADR-046: guards removed so desktop participates in the same
// state machine as mobile.
(function () {
  'use strict';

  // ── Panel State Machine ──────────────────────────────────────────────────
  // States: IDLE | MUSICIAN | TRAIL
  // ADR-039: PEEK state removed — right sidebar is now a drawer, not a sheet.
  // Mutual exclusion: TRAIL and MUSICIAN are never both active.
  // Pin flags: a pinned panel is never closed by setPanelState (desktop only).
  var panelState  = 'IDLE';
  var leftPinned  = false;
  var rightPinned = false;

  var sidebar        = document.getElementById('left-sidebar');
  var leftScrim      = document.getElementById('left-drawer-scrim');
  var rightSidebar   = document.getElementById('right-sidebar');
  var rightScrim     = document.getElementById('right-drawer-scrim');
  var tabMusician    = document.getElementById('tab-musician');
  var tabTrail       = document.getElementById('tab-trail');
  var desktopLeftHandle  = document.getElementById('desktop-left-handle');
  var desktopRightHandle = document.getElementById('desktop-right-handle');
  var dpbLeftToggle  = document.getElementById('dpb-left-toggle');
  var dpbLeftPin     = document.getElementById('dpb-left-pin');
  var dpbRightToggle = document.getElementById('dpb-right-toggle');
  var dpbRightPin    = document.getElementById('dpb-right-pin');

  // Update bottom-bar toggle active state to reflect open/close
  function _updateDesktopHandles(state) {
    if (dpbLeftToggle)  dpbLeftToggle.classList.toggle('dpb-active', state === 'TRAIL');
    if (dpbRightToggle) dpbRightToggle.classList.toggle('dpb-active', state === 'MUSICIAN');
    // Legacy floating handles (hidden via CSS but kept for backwards compat)
    if (desktopLeftHandle) {
      desktopLeftHandle.classList.toggle('handle-panel-open', state === 'TRAIL');
    }
    if (desktopRightHandle) {
      desktopRightHandle.classList.toggle('handle-panel-open', state === 'MUSICIAN');
    }
  }

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
    // ADR-046: guard removed — desktop now participates in the drawer state machine

    // ADR-039: map legacy PEEK state to MUSICIAN (backward compat for media_player.js save/restore)
    if (newState === 'PEEK') newState = 'MUSICIAN';

    // ADR-050: collapse full mobile player when user begins exploring a panel,
    // so the panel has the full viewport. Playback continues in mini strip.
    if (newState !== 'IDLE' && typeof window._collapseMobilePlayer === 'function') {
      const mp = document.querySelector('.media-player.full-mobile');
      if (mp) window._collapseMobilePlayer();
    }

    panelState = newState;

    // Close everything first — but respect pin locks
    if (!leftPinned)  _closeLeftDrawer();
    if (!rightPinned) _closeRightDrawer();

    // Open the requested panel
    if (newState === 'TRAIL') {
      _openLeftDrawer();
    } else if (newState === 'MUSICIAN') {
      _openRightDrawer();
    }

    _updateTabs(newState);
    _updateDesktopHandles(newState);

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

  // ADR-046: toggle right drawer (mirrors toggleLeftDrawer)
  function toggleRightDrawer() {
    if (panelState === 'MUSICIAN') {
      setPanelState('IDLE');
    } else {
      setPanelState('MUSICIAN');
    }
  }

  // ADR-039: peekBottomSheet now opens the right drawer (MUSICIAN) instead of PEEK
  function peekBottomSheet() {
    // ADR-046: guard removed — desktop now participates
    setPanelState('MUSICIAN');
  }

  function dismissBottomSheet() {
    // ADR-046: guard removed — desktop now participates
    setPanelState('IDLE');
  }

  // ADR-039: showBottomSheet maps both 'peek' and 'expanded' to MUSICIAN
  function showBottomSheet(state) {
    // ADR-046: guard removed — desktop now participates
    if (state === 'expanded' || state === 'peek') setPanelState('MUSICIAN');
    else setPanelState('IDLE');
  }

  // ── Filter badge (ADR-040: toggle removed, chips always visible) ─────────
  function updateFilterBadge() {
    var filterBadge = document.getElementById('filter-active-badge');
    if (!filterBadge) return;
    var activeCount = (typeof activeFilters !== 'undefined')
      ? (activeFilters.era.size + activeFilters.instrument.size)
      : 0;
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

  // Desktop handle tabs: toggle the corresponding drawer on both mobile and desktop
  function isDesktop() { return window.matchMedia('(min-width: 769px)').matches; }

  if (desktopLeftHandle) {
    desktopLeftHandle.addEventListener('click', function () {
      toggleLeftDrawer();
    });
  }
  if (desktopRightHandle) {
    desktopRightHandle.addEventListener('click', function () {
      toggleRightDrawer();
    });
  }

  // ADR-040: filter toggle removed — chips always visible

  // ── Pin state helpers (desktop only) ─────────────────────────────────
  // A pinned panel is brought into the CSS grid (position:static) and is never
  // closed by the mutual-exclusion state machine. Unpinning restores it as a
  // drawer. State is persisted per session via sessionStorage.

  var mainEl         = document.getElementById('main');

  function _applyPinState() {
    // ─ left sidebar ─────────────────────────────────────────────
    if (sidebar) sidebar.classList.toggle('panel-pinned', leftPinned);
    if (mainEl)  mainEl.classList.toggle('left-pinned', leftPinned);
    if (dpbLeftPin) {
      dpbLeftPin.classList.toggle('pin-active', leftPinned);
      dpbLeftPin.setAttribute('aria-pressed', String(leftPinned));
      dpbLeftPin.title = leftPinned ? 'Unpin panel' : 'Pin panel open';
    }
    // When pinned: hide the toggle (panel is always open, no point toggling)
    if (dpbLeftToggle) dpbLeftToggle.style.display = leftPinned ? 'none' : '';
    // If just pinned, ensure the drawer is open so it’s immediately visible
    if (leftPinned) _openLeftDrawer();

    // ─ right sidebar ──────────────────────────────────────────
    if (rightSidebar) rightSidebar.classList.toggle('panel-pinned', rightPinned);
    if (mainEl)       mainEl.classList.toggle('right-pinned', rightPinned);
    if (dpbRightPin) {
      dpbRightPin.classList.toggle('pin-active', rightPinned);
      dpbRightPin.setAttribute('aria-pressed', String(rightPinned));
      dpbRightPin.title = rightPinned ? 'Unpin panel' : 'Pin panel open';
    }
    if (dpbRightToggle) dpbRightToggle.style.display = rightPinned ? 'none' : '';
    if (rightPinned) _openRightDrawer();

    // Persist across sessions (localStorage survives tab close)
    try {
      localStorage.setItem('baniLeftPinned',  String(leftPinned));
      localStorage.setItem('baniRightPinned', String(rightPinned));
    } catch (e) { /* storage unavailable — ignore */ }

    // Cytoscape must recalculate canvas size after grid change
    if (typeof cy !== 'undefined') {
      setTimeout(function () { cy.resize(); }, 50);
    }
  }

  function toggleLeftPin() {
    leftPinned = !leftPinned;
    _applyPinState();
  }

  function toggleRightPin() {
    rightPinned = !rightPinned;
    _applyPinState();
  }

  // Restore pin state — localStorage persists across sessions.
  // Default on first desktop visit: left panel pinned, right panel unpinned.
  if (isDesktop()) {
    try {
      var _lp = localStorage.getItem('baniLeftPinned');
      var _rp = localStorage.getItem('baniRightPinned');
      leftPinned  = _lp !== null ? _lp  === 'true' : true;
      rightPinned = _rp !== null ? _rp === 'true' : false;
      _applyPinState();
    } catch (e) { /* storage unavailable — ignore */ }
  }

  _setupTabBar();

  // ── Public API ───────────────────────────────────────────────────────────
  window.toggleLeftDrawer   = toggleLeftDrawer;
  window.toggleRightDrawer  = toggleRightDrawer;
  window.toggleLeftPin      = toggleLeftPin;
  window.toggleRightPin     = toggleRightPin;
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
