// ─── PiP ──────────────────────────────────────────────────────────────────────
// Manages the Document Picture-in-Picture window.
// Responsive: shows dot + timer always; title appears when width allows it.
//
// IMPORTANT: open() must be called from a user gesture (e.g. a button click).

const PiP = (() => {
  let pipWindow = null;
  let activeBoardCardId = null;

  // Width threshold above which the issue title becomes visible
  const TITLE_MIN_WIDTH = 360;

  const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1a1f2e;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 0 16px;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
      flex-shrink: 0;
    }
    .title {
      font-size: 12px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.55);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      display: none;
    }
    .title--visible {
      display: block;
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

      const doc = pipWindow.document;

      const style = doc.createElement('style');
      style.textContent = CSS;
      doc.head.appendChild(style);

      const dot = doc.createElement('div');
      dot.className = 'dot';

      const timeEl = doc.createElement('span');
      timeEl.className = 'time';
      timeEl.textContent = Timer.formatMs(Storage.totalMs(Storage.load(boardCardId)));

      const card = document.querySelector(`[data-board-card-id="${boardCardId}"]`);
      const titleEl = doc.createElement('span');
      titleEl.className = 'title';
      titleEl.textContent = card ? GitHubAdapter.getIssueTitle(card) : 'Issue';

      doc.body.appendChild(dot);
      doc.body.appendChild(timeEl);
      doc.body.appendChild(titleEl);

      // Show/hide title based on window width
      function updateLayout() {
        const wide = pipWindow.innerWidth >= TITLE_MIN_WIDTH;
        titleEl.classList.toggle('title--visible', wide);
      }
      updateLayout();
      pipWindow.addEventListener('resize', updateLayout);

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
      activeBoardCardId = null;
    },

    isOpen() {
      return !!pipWindow;
    },
  };
})();
