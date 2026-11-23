// ─── PiP ──────────────────────────────────────────────────────────────────────
// Manages the Document Picture-in-Picture window.
// Shows the issue timer and the current scheduled-day progress when configured.
//
// IMPORTANT: open() must be called from a user gesture (e.g. a button click).

const PiP = (() => {
  let pipWindow = null;
  let activeBoardCardId = null;
  let refreshWindow = null;

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
    body[data-timer-running="false"] .dot {
      background: #64748b;
      box-shadow: none;
      animation: none;
    }
    body[data-focus-reminder="true"] {
      background: #67430d;
      animation: focus-reminder-background 2s ease-in-out infinite;
    }
    body[data-focus-reminder="true"] .dot {
      background: #fbbf24;
      box-shadow: 0 0 8px 2px rgba(251, 191, 36, 0.4);
      animation: focus-reminder 2s ease-in-out infinite;
    }
    body[data-focus-reminder="true"] .focus-label {
      animation: focus-reminder 2s ease-in-out infinite;
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
    .progress-stack {
      display: grid;
      grid-template-columns: minmax(20px, 1fr) auto;
      align-items: center;
      gap: 5px 8px;
      flex: 1;
      min-width: 40px;
    }
    .progress, .focus-progress {
      display: contents;
    }
    .progress[hidden], .focus-progress[hidden] { display: none; }
    .progress-track {
      grid-column: 1;
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
      justify-self: end;
      width: 7ch;
      color: rgba(255, 255, 255, 0.7);
      font: 11px monospace;
      text-align: right;
      flex-shrink: 0;
    }
    .focus-track { height: 5px; }
    .focus-fill {
      position: relative;
      overflow: hidden;
      background: #94a3b8;
    }
    .focus-progress[data-pace="ahead"] .focus-fill { background: #34d399; }
    .focus-progress[data-pace="behind"] .focus-fill { background: #fbbf24; }
    .focus-label {
      grid-column: 2;
      color: #cbd5e1;
    }
    .focus-progress[data-pace="ahead"] .focus-label { color: #34d399; }
    .focus-progress[data-pace="behind"] .focus-label { color: #fbbf24; }
    body[data-timer-running="true"] .focus-progress .focus-fill { background: #34d399; }
    body[data-timer-running="true"] .focus-progress .focus-label { color: #34d399; }
    body[data-timer-running="true"] .focus-fill::after {
      content: '';
      position: absolute;
      inset: 0;
      background-image: linear-gradient(#bbf7d0 0 0), linear-gradient(#bbf7d0 0 0);
      background-repeat: no-repeat;
      background-size: 60% 100%;
      animation: focus-charge 3s ease infinite;
      pointer-events: none;
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
    @keyframes focus-reminder {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    @keyframes focus-reminder-background {
      0%, 100% { background-color: #1a1f2e; }
      50% { background-color: #78520e; }
    }
    @keyframes focus-charge {
      0% { background-position: -150% 0, -150% 0; }
      66% { background-position: 250% 0, -150% 0; }
      100% { background-position: 250% 0, 250% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .dot, body[data-focus-reminder="true"], body[data-focus-reminder="true"] .dot,
      body[data-focus-reminder="true"] .focus-label { animation: none; }
      body[data-timer-running="true"] .focus-fill::after { display: none; animation: none; }
      .progress-fill { transition: none; }
    }
  `;

  let openRequestId = 0;

  function formatFocusDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (!hours) return `${minutes}m`;
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  }

  return {
    async open(boardCardId) {
      if (!('documentPictureInPicture' in window)) return;

      const requestId = ++openRequestId;
      const previousWindow = pipWindow;
      pipWindow = null;
      refreshWindow = null;
      activeBoardCardId = boardCardId;
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
      const doc = nextWindow.document;

      const style = doc.createElement('style');
      style.textContent = CSS;
      doc.head.appendChild(style);

      const dot = doc.createElement('div');
      dot.className = 'dot';

      const timeEl = doc.createElement('span');
      timeEl.className = 'time';
      const titleEl = doc.createElement('span');
      titleEl.className = 'title';

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
      let nextReminderAt = null;
      let reminderIntervalMinutes = null;

      const progressLabel = doc.createElement('span');
      progressLabel.className = 'progress-label';
      progressEl.append(progressTrack, progressLabel);

      const focusEl = doc.createElement('div');
      focusEl.className = 'focus-progress';
      focusEl.hidden = true;

      const focusTrack = doc.createElement('div');
      focusTrack.className = 'progress-track focus-track';
      focusTrack.setAttribute('role', 'progressbar');
      focusTrack.setAttribute('aria-label', 'Daily focus goal progress');
      focusTrack.setAttribute('aria-valuemin', '0');
      focusTrack.setAttribute('aria-valuemax', '100');

      const focusFill = doc.createElement('div');
      focusFill.className = 'progress-fill focus-fill';
      const expectedMarker = doc.createElement('div');
      expectedMarker.className = 'progress-marker';
      focusTrack.append(focusFill, expectedMarker);

      const focusLabel = doc.createElement('span');
      focusLabel.className = 'progress-label focus-label';
      focusEl.append(focusTrack, focusLabel);

      const progressStack = doc.createElement('div');
      progressStack.className = 'progress-stack';
      progressStack.append(progressEl, focusEl);

      const pauseBtn = doc.createElement('button');
      pauseBtn.className = 'pause-btn';
      pauseBtn.textContent = '⏸\uFE0E';
      pauseBtn.title = 'Pause timer';
      pauseBtn.addEventListener('click', () => {
        if (!activeBoardCardId) return;
        if (Storage.isRunning(Storage.load(activeBoardCardId))) Timer.stop(activeBoardCardId);
        else Timer.start(activeBoardCardId);
      });

      doc.body.appendChild(dot);
      doc.body.appendChild(timeEl);
      doc.body.appendChild(titleEl);
      doc.body.appendChild(progressStack);
      doc.body.appendChild(pauseBtn);

      function updateFocus(now) {
        focusEl.hidden = !Settings.getFocusGoal().enabled;
        if (focusEl.hidden) return null;

        const focus = Settings.getFocusProgress(Storage.getDailyFocusMs(now), now);
        const percent = (focus.progress * 100).toFixed(2);
        focusFill.style.width = `${focus.progress * 100}%`;
        focusTrack.setAttribute('aria-valuenow', String(percent));
        expectedMarker.hidden = focus.expectedProgress === null;
        expectedMarker.style.left = `${(focus.expectedProgress ?? 0) * 100}%`;

        let pace = 'No schedule';
        let state = 'neutral';
        if (focus.differenceMs !== null) {
          state = focus.differenceMs >= 0 ? 'ahead' : 'behind';
          const difference = Math.abs(focus.differenceMs);
          const duration = difference < 60000 ? '<1m' : formatFocusDuration(difference);
          pace = difference < 1000 ? 'On pace' :
            `${focus.differenceMs >= 0 ? '+' : '-'}${duration} ${state}`;
        }

        focusEl.setAttribute('data-pace', state);
        focusLabel.textContent = `${percent}%`;
        const detail =
          `Focus ${formatFocusDuration(focus.focusMs)} / ${formatFocusDuration(focus.goalMs)} \u00b7 ${pace}`;
        focusEl.title = detail;
        focusTrack.title = detail;
        focusLabel.title = detail;
        focusTrack.setAttribute('aria-valuetext', `${percent}% of focus goal. ${detail}`);
        return focus;
      }

      function updateProgress(now, running) {
        const focus = updateFocus(now);
        const remind = !running && focus !== null && focus.differenceMs !== null &&
          focus.differenceMs < 0 && Settings.isWorkTime(now);
        doc.body.setAttribute('data-focus-reminder', String(remind));
        dot.title = running ? 'Focusing' : remind ? 'Paused - behind focus goal. Resume focus.' : 'Paused';
        if (remind && Settings.shouldPlayFocusReminder()) {
          const minutes = Settings.getFocusReminderIntervalMinutes();
          if (nextReminderAt === null || reminderIntervalMinutes !== minutes) {
            reminderIntervalMinutes = minutes;
            nextReminderAt = now.getTime() + minutes * 60000;
          } else if (now.getTime() >= nextReminderAt) {
            nextReminderAt = now.getTime() + minutes * 60000;
            Sounds.remind().catch(error => console.error('Unable to play focus reminder', error));
          }
        } else {
          nextReminderAt = null;
        }
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

        const percent = (progress * 100).toFixed(2);
        progressTrack.setAttribute('aria-valuenow', String(percent));
        progressTrack.setAttribute('aria-valuetext', `${percent}% of scheduled work hours elapsed`);
        progressLabel.textContent = `${percent}%`;
      }

      function updateDisplay() {
        if (pipWindow !== nextWindow) return;
        const state = Storage.load(activeBoardCardId);
        const running = Storage.isRunning(state);
        if (!running && !Settings.shouldKeepPipOpen()) {
          PiP.close();
          return;
        }

        doc.body.setAttribute('data-timer-running', String(running));
        timeEl.textContent = running ? Timer.formatMs(Storage.currentSessionMs(state)) : 'Paused';
        const card = document.querySelector(`[data-board-card-id="${activeBoardCardId}"]`);
        titleEl.textContent = state.issueTitle || (card ? GitHubAdapter.getIssueTitle(card) : 'Issue');
        pauseBtn.textContent = running ? '⏸\uFE0E' : '▶';
        pauseBtn.title = running ? 'Pause timer' : 'Resume timer';
        pauseBtn.setAttribute('aria-label', pauseBtn.title);
        updateProgress(new Date(), running);
      }

      const tickId = setInterval(updateDisplay, 1000);
      nextWindow.addEventListener('pagehide', () => {
        clearInterval(tickId);
        if (pipWindow === nextWindow) {
          pipWindow = null;
          activeBoardCardId = null;
          refreshWindow = null;
        }
      });
      refreshWindow = updateDisplay;
      updateDisplay();
    },

    setTimer(boardCardId) {
      activeBoardCardId = boardCardId;
      this.refresh();
    },

    refresh() {
      if (refreshWindow) refreshWindow();
    },

    close() {
      openRequestId += 1;
      const currentWindow = pipWindow;
      pipWindow = null;
      activeBoardCardId = null;
      refreshWindow = null;
      if (currentWindow) currentWindow.close();
    },

    isOpen() {
      return !!pipWindow;
    },
  };
})();
