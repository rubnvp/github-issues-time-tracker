// ─── FloatingBar ───────────────────────────────────────────────────────────────
// Top-center floating bar showing the active issue title and live timer.
// Visible only when a timer is running.
//
// Depends on: Storage, Timer

const FloatingBar = (() => {
  let el = null;
  let titleEl = null;
  let timeEl = null;
  let pauseBtn = null;
  let tickId = null;
  let activeBoardCardId = null;

  // ── Build DOM (once) ────────────────────────────────────────────────────────

  function build() {
    el = document.createElement('div');
    el.className = 'gitt-floating-bar';

    const dot = document.createElement('span');
    dot.className = 'gitt-floating-bar__dot';

    const info = document.createElement('div');
    info.className = 'gitt-floating-bar__info';

    const label = document.createElement('span');
    label.className = 'gitt-floating-bar__label';
    label.textContent = 'TRACKING';

    titleEl = document.createElement('span');
    titleEl.className = 'gitt-floating-bar__title';

    info.appendChild(label);
    info.appendChild(titleEl);

    const divider = document.createElement('span');
    divider.className = 'gitt-floating-bar__divider';

    timeEl = document.createElement('span');
    timeEl.className = 'gitt-floating-bar__time';

    pauseBtn = document.createElement('button');
    pauseBtn.className = 'gitt-floating-bar__pause-btn';
    pauseBtn.textContent = '⏸\uFE0E';
    pauseBtn.title = 'Pause timer';

    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeBoardCardId) return;
      if (!Storage.isRunning(Storage.load(activeBoardCardId))) return;
      Timer.stop(activeBoardCardId);
    });

    el.appendChild(dot);
    el.appendChild(info);
    el.appendChild(divider);
    el.appendChild(timeEl);
    el.appendChild(pauseBtn);
    document.body.appendChild(el);
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  function tick() {
    if (!activeBoardCardId) return;
    const state = Storage.load(activeBoardCardId);
    timeEl.textContent = Timer.formatMs(Storage.totalMs(state));
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    show(boardCardId) {
      if (!el) build();

      activeBoardCardId = boardCardId;

      const card = document.querySelector(`[data-board-card-id="${boardCardId}"]`);
      const titleNode = card && card.querySelector('h3 span');
      titleEl.textContent = titleNode ? titleNode.textContent : 'Issue';

      tick();
      el.style.display = 'flex';

      clearInterval(tickId);
      tickId = setInterval(tick, 1000);
    },

    hide() {
      if (!el) return;
      el.style.display = 'none';
      clearInterval(tickId);
      tickId = null;
      activeBoardCardId = null;
    },
  };
})();
