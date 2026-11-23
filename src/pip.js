// ─── PiP ──────────────────────────────────────────────────────────────────────
// Manages the Document Picture-in-Picture window.
// Shows the issue timer and the current scheduled-day progress when configured.
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
      gap: 12px;
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
      background: #6366f1;
      flex-shrink: 0;
      box-shadow: 0 0 8px 2px rgba(99, 102, 241, 0.6);
      animation: pulse 4.5s ease-in-out infinite;
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
      flex: 0 1 25vw;
      min-width: 0;
    }
    .progress {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 40px;
    }
    .progress[hidden] { display: none; }
    .progress-track {
      position: relative;
      height: 8px;
      flex: 1;
      min-width: 20px;
      overflow: hidden;
      border-radius: 999px;
      background: #0e1320;
    }
    .progress-segment {
      position: absolute;
      top: 0;
      height: 100%;
      overflow: hidden;
      background: #454878;
    }
    .progress-fill {
      width: 0;
      height: 100%;
      background: #818cf8;
      transition: width 0.3s ease;
    }
    .progress-marker {
      position: absolute;
      top: 0;
      height: 100%;
      width: 2px;
      background: #ffffff;
      transform: translateX(-50%);
      pointer-events: none;
    }
    .progress-label {
      width: 4ch;
      color: rgba(255, 255, 255, 0.7);
      font: 11px monospace;
      text-align: right;
      flex-shrink: 0;
    }
    .pause-btn {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: none;
      background: #6366f1;
      color: #ffffff;
      font-size: 10px;
      cursor: pointer;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.1s ease;
    }
    .pause-btn:hover { background: #4f46e5; }
    @media (max-width: 480px) {
      .title { display: none; }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 8px 2px rgba(99,102,241,0.6); }
      50%       { opacity: 0.7; transform: scale(0.8); box-shadow: 0 0 4px 1px rgba(99,102,241,0.3); }
    }
  `;

  let openRequestId = 0;

  return {
    async open(boardCardId) {
      if (!('documentPictureInPicture' in window)) return;

      const requestId = ++openRequestId;
      const previousWindow = pipWindow;
      pipWindow = null;
      activeBoardCardId = null;
      if (previousWindow) previousWindow.close();

      const nextWindow = await documentPictureInPicture.requestWindow({
        width: Math.max(window.screen.availWidth, 240),
        height: 52,
        disallowReturnToOpener: true,
      });

      if (requestId !== openRequestId) {
        nextWindow.close();
        return;
      }

      pipWindow = nextWindow;
      activeBoardCardId = boardCardId;
      const doc = nextWindow.document;

      const style = doc.createElement('style');
      style.textContent = CSS;
      doc.head.appendChild(style);

      const dot = doc.createElement('div');
      dot.className = 'dot';

      const timeEl = doc.createElement('span');
      timeEl.className = 'time';
      timeEl.textContent = Timer.formatMs(Storage.currentSessionMs(Storage.load(boardCardId)));

      const card = document.querySelector(`[data-board-card-id="${boardCardId}"]`);
      const titleEl = doc.createElement('span');
      titleEl.className = 'title';
      titleEl.textContent = card ? GitHubAdapter.getIssueTitle(card) : 'Issue';

      const progressEl = doc.createElement('div');
      progressEl.className = 'progress';
      progressEl.hidden = true;

      const progressTrack = doc.createElement('div');
      progressTrack.className = 'progress-track';
      progressTrack.setAttribute('role', 'progressbar');
      progressTrack.setAttribute('aria-label', 'Daily work schedule progress');
      progressTrack.setAttribute('aria-valuemin', '0');
      progressTrack.setAttribute('aria-valuemax', '100');

      const progressMarker = doc.createElement('div');
      progressMarker.className = 'progress-marker';
      progressTrack.appendChild(progressMarker);
      progressTrack.title = 'Work hours are colored; breaks are dark. White marker: current time.';
      let segmentKey = null;
      let segmentElements = [];

      const progressLabel = doc.createElement('span');
      progressLabel.className = 'progress-label';
      progressEl.append(progressTrack, progressLabel);

      const pauseBtn = doc.createElement('button');
      pauseBtn.className = 'pause-btn';
      pauseBtn.textContent = '⏸\uFE0E';
      pauseBtn.title = 'Pause timer';
      pauseBtn.addEventListener('click', () => Timer.stop(boardCardId));

      doc.body.appendChild(dot);
      doc.body.appendChild(timeEl);
      doc.body.appendChild(titleEl);
      doc.body.appendChild(progressEl);
      doc.body.appendChild(pauseBtn);

      function updateProgress() {
        const now = new Date();
        const progress = Settings.getDailyProgress(now);
        progressEl.hidden = progress === null;
        if (progress === null) return;

        const timeline = Settings.getDailyTimeline(now);
        const nextSegmentKey = JSON.stringify(timeline.segments);
        if (segmentKey !== nextSegmentKey) {
          segmentKey = nextSegmentKey;
          segmentElements = timeline.segments.map((segment) => {
            const element = doc.createElement('div');
            element.className = 'progress-segment';
            element.style.left = `${segment.start * 100}%`;
            element.style.width = `${(segment.end - segment.start) * 100}%`;
            element.title = segment.label;

            const fill = doc.createElement('div');
            fill.className = 'progress-fill';
            element.appendChild(fill);
            return { element, fill };
          });
          progressTrack.replaceChildren(...segmentElements.map(({ element }) => element), progressMarker);
        }

        timeline.segments.forEach((segment, index) => {
          const fraction = Math.max(0, Math.min(1,
            (timeline.position - segment.start) / (segment.end - segment.start)));
          segmentElements[index].fill.style.width = `${fraction * 100}%`;
        });
        progressMarker.style.left = `${timeline.position * 100}%`;

        const percent = Math.round(progress * 100);
        progressTrack.setAttribute('aria-valuenow', String(percent));
        progressTrack.setAttribute('aria-valuetext', `${percent}% of scheduled work hours elapsed`);
        progressLabel.textContent = `${percent}%`;
      }

      updateProgress();

      const tickId = setInterval(() => {
        if (pipWindow !== nextWindow || activeBoardCardId !== boardCardId) return;
        timeEl.textContent = Timer.formatMs(Storage.currentSessionMs(Storage.load(activeBoardCardId)));
        updateProgress();
      }, 1000);

      nextWindow.addEventListener('pagehide', () => {
        clearInterval(tickId);
        if (pipWindow === nextWindow) {
          pipWindow = null;
          activeBoardCardId = null;
        }
      });
    },

    close() {
      openRequestId += 1;
      const currentWindow = pipWindow;
      pipWindow = null;
      activeBoardCardId = null;
      if (currentWindow) currentWindow.close();
    },

    isOpen() {
      return !!pipWindow;
    },
  };
})();
