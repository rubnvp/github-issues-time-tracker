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

  // ── Styles (injected once) ──────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('tt-styles')) return;
    const style = document.createElement('style');
    style.id = 'tt-styles';
    style.textContent = `
      @keyframes tt-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.5; transform: scale(0.7); }
      }
      @keyframes tt-slidein {
        from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      #tt-floating-bar {
        animation: tt-slidein 0.2s ease;
      }
      #tt-floating-bar .tt-pause-btn:hover {
        transform: scale(1.15);
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build DOM (once) ────────────────────────────────────────────────────────

  function build() {
    injectStyles();

    el = document.createElement('div');
    el.id = 'tt-floating-bar';
    el.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      display: none;
      align-items: center;
      gap: 14px;
      padding: 12px 16px 12px 20px;
      border-radius: 14px;
      background: #1a1f2e;
      color: #ffffff;
      box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      white-space: nowrap;
      pointer-events: auto;
    `;

    // ── Left: pulsing dot + issue info ──────────────────────────────────────

    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #d1242f;
      flex-shrink: 0;
      animation: tt-pulse 1.4s ease-in-out infinite;
    `;

    const info = document.createElement('div');
    info.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 2px;
    `;

    const label = document.createElement('span');
    label.textContent = 'TRACKING';
    label.style.cssText = `
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #d1242f;
      line-height: 1;
    `;

    titleEl = document.createElement('span');
    titleEl.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      max-width: 380px;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
      color: #ffffff;
    `;

    info.appendChild(label);
    info.appendChild(titleEl);

    // ── Divider ─────────────────────────────────────────────────────────────

    const divider = document.createElement('span');
    divider.style.cssText = `
      width: 1px;
      height: 28px;
      background: rgba(255,255,255,0.12);
      flex-shrink: 0;
    `;

    // ── Timer display ────────────────────────────────────────────────────────

    timeEl = document.createElement('span');
    timeEl.style.cssText = `
      font-size: 20px;
      font-weight: 700;
      font-family: monospace;
      letter-spacing: 0.04em;
      color: #ffffff;
      min-width: 60px;
      text-align: right;
    `;

    // ── Pause button ─────────────────────────────────────────────────────────

    pauseBtn = document.createElement('button');
    pauseBtn.textContent = '⏸\uFE0E';
    pauseBtn.title = 'Pause timer';
    pauseBtn.className = 'tt-pause-btn';
    pauseBtn.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: none;
      background: var(--bgColor-danger-emphasis, #d1242f);
      color: #ffffff;
      font-size: 15px;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 0.1s ease;
    `;

    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeBoardCardId) return;

      const state = Storage.load(activeBoardCardId);
      if (!state.running) return;

      Storage.save(activeBoardCardId, {
        ...state,
        totalMs: state.totalMs + (Date.now() - state.lastStart),
        lastStart: null,
        running: false,
      });
      Timer.stop(activeBoardCardId);
      // Timer.stop calls FloatingBar.hide via Timer internals
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
    timeEl.textContent = Timer.formatMs(Timer.getCurrentMs(state));
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
