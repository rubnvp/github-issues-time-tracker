// ─── FloatingBar ───────────────────────────────────────────────────────────────
// Top-center floating bar showing the active issue title and live timer.
// Visible only when a timer is running.
//
// Depends on: Storage, Timer

const FloatingBar = (() => {
  let el = null;
  let titleEl = null;
  let timeEl = null;
  let tickId = null;
  let activeBoardCardId = null;

  // ── Build DOM (once) ────────────────────────────────────────────────────────

  function build() {
    el = document.createElement('div');
    el.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      display: none;
      align-items: center;
      gap: 16px;
      padding: 10px 20px;
      border-radius: 10px;
      background: var(--bgColor-emphasis, #1f2328);
      color: var(--fgColor-onEmphasis, #ffffff);
      box-shadow: 0 4px 16px rgba(0,0,0,0.32);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: none;
      white-space: nowrap;
    `;

    // Red pulsing dot
    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #d1242f;
      flex-shrink: 0;
      animation: tt-pulse 1.4s ease-in-out infinite;
    `;

    // Inject keyframes once
    if (!document.getElementById('tt-keyframes')) {
      const style = document.createElement('style');
      style.id = 'tt-keyframes';
      style.textContent = `
        @keyframes tt-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.75); }
        }
      `;
      document.head.appendChild(style);
    }

    titleEl = document.createElement('span');
    titleEl.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    const separator = document.createElement('span');
    separator.textContent = '·';
    separator.style.cssText = `
      font-size: 14px;
      opacity: 0.5;
    `;

    timeEl = document.createElement('span');
    timeEl.style.cssText = `
      font-size: 15px;
      font-weight: 700;
      font-family: monospace;
      letter-spacing: 0.02em;
      color: #d1242f;
    `;

    el.appendChild(dot);
    el.appendChild(titleEl);
    el.appendChild(separator);
    el.appendChild(timeEl);
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

      // Get issue title from the card DOM
      const card = document.querySelector(`[data-board-card-id="${boardCardId}"]`);
      const titleNode = card && card.querySelector('h3 span');
      titleEl.textContent = titleNode ? titleNode.textContent : 'Issue';

      tick();
      el.style.display = 'flex';

      // Start tick independent of card interval
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
