// ─── PiP ──────────────────────────────────────────────────────────────────────
// Manages the Document Picture-in-Picture window.
// Shows a minimal always-on-top pulsing red dot — nothing else.
//
// IMPORTANT: open() must be called from a user gesture (e.g. a button click).

const PiP = (() => {
  let pipWindow = null;
  let activeBoardCardId = null;

  const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1a1f2e;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    .dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #d1242f;
      flex-shrink: 0;
      box-shadow: 0 0 8px 2px rgba(209, 36, 47, 0.6);
      animation: pulse 1.4s ease-in-out infinite;
    }
    .time {
      font-family: monospace;
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.03em;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 8px 2px rgba(209,36,47,0.6); }
      50%       { opacity: 0.7; transform: scale(0.8); box-shadow: 0 0 4px 1px rgba(209,36,47,0.3); }
    }
  `;

  return {
    async open(boardCardId) {
      if (!('documentPictureInPicture' in window)) return;
      if (pipWindow) pipWindow.close();

      activeBoardCardId = boardCardId;

      pipWindow = await documentPictureInPicture.requestWindow({
        width: 240,
        height: 52,
        disallowReturnToOpener: true,
      });

      const style = pipWindow.document.createElement('style');
      style.textContent = CSS;
      pipWindow.document.head.appendChild(style);

      const dot = pipWindow.document.createElement('div');
      dot.className = 'dot';
      pipWindow.document.body.appendChild(dot);

      const timeEl = pipWindow.document.createElement('span');
      timeEl.className = 'time';
      timeEl.textContent = Timer.formatMs(Storage.totalMs(Storage.load(activeBoardCardId)));
      pipWindow.document.body.appendChild(timeEl);

      const tickId = setInterval(() => {
        if (!activeBoardCardId) return;
        timeEl.textContent = Timer.formatMs(Storage.totalMs(Storage.load(activeBoardCardId)));
      }, 1000);

      pipWindow.addEventListener('pagehide', () => {
        clearInterval(tickId);
        pipWindow = null;
        activeBoardCardId = null;
      });
    },

    close() {
      if (pipWindow) { pipWindow.close(); pipWindow = null; }
    },

    isOpen() {
      return !!pipWindow;
    },
  };
})();
