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
  let originalTitle = null;
  let activeIssueTitle = null;

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
    label.textContent = 'FOCUSING';

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

    const pipBtn = document.createElement('button');
    pipBtn.className = 'gitt-floating-bar__pip-btn';
    pipBtn.textContent = '⧉';
    pipBtn.title = 'Open Picture-in-Picture';
    pipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeBoardCardId) return;
      PiP.open(activeBoardCardId);
    });

    el.appendChild(dot);
    el.appendChild(info);
    el.appendChild(divider);
    el.appendChild(timeEl);
    el.appendChild(pipBtn);
    el.appendChild(pauseBtn);
    document.body.appendChild(el);
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  function tick() {
    if (!activeBoardCardId) return;
    const state = Storage.load(activeBoardCardId);
    const formatted = Timer.formatMs(Storage.currentSessionMs(state));
    timeEl.textContent = formatted;
    document.title = `${formatted} — ${activeIssueTitle}`;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    show(boardCardId) {
      if (!el) build();

      activeBoardCardId = boardCardId;

      const card = document.querySelector(`[data-board-card-id="${boardCardId}"]`);
      const titleNode = card && card.querySelector('h3 span');
      activeIssueTitle = titleNode ? titleNode.textContent : 'Issue';
      titleEl.textContent = activeIssueTitle;

      originalTitle = document.title;

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
      activeIssueTitle = null;
      if (originalTitle !== null) {
        document.title = originalTitle;
        originalTitle = null;
      }
    },
  };
})();
