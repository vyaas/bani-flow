// sruti_bar.js — Sruti Bar (ADR-029)
// Singleton tanpura drone. One pitch at a time.
// Power indicator (●) shows on/off state.
// Depends on: tanpuraData (injected by render pipeline), openPlayer/closePlayer (media_player.js).

(function () {
  const container = document.getElementById('sruti-buttons');
  const indicator = document.getElementById('sruti-power');
  if (!container || typeof tanpuraData === 'undefined' || tanpuraData.length === 0) return;

  let activeBtn = null;   // currently lit button

  function deactivate() {
    if (activeBtn) { activeBtn.classList.remove('sruti-active'); activeBtn = null; }
    if (indicator) indicator.classList.remove('sruti-on');
    closePlayer('sruti');  // defined in media_player.js
  }

  // Power indicator click = toggle off
  if (indicator) indicator.addEventListener('click', deactivate);

  tanpuraData.forEach(function (entry) {
    const btn = document.createElement('button');
    btn.className = 'sruti-btn' + (entry.note.includes('#') ? ' sharp' : '');
    btn.textContent = entry.note;
    btn.title = entry.note + ' tanpura';

    btn.addEventListener('click', function () {
      // Clicking the active pitch = toggle off
      if (activeBtn === btn) { deactivate(); return; }

      // Switch to new pitch: close old player, open new one
      deactivate();
      btn.classList.add('sruti-active');
      activeBtn = btn;
      if (indicator) indicator.classList.add('sruti-on');

      // openPlayer(videoId, title, playerId) — singleton 'sruti' player
      openPlayer(entry.id, entry.note + ' tanpura', 'sruti');
    });

    container.appendChild(btn);
  });
})();
