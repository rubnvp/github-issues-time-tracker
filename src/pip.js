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
    body[data-timer-running="false"]:not([data-focus-reminder="true"]) {
      background: #2b3142;
    }
    .mascot {
      width: 34px;
      height: 34px;
      flex-shrink: 0;
    }
    .mascot svg { width: 100%; height: 100%; overflow: visible; }
    .mascot-body { fill: #a5a9ed; transition: fill .7s ease; }
    .mascot-face-awake, .mascot-face-rest, .mascot-laptop, .mascot-arms-working,
    .mascot-arms-rest { transition: opacity .65s ease; }
    .mascot-face-rest, .mascot-arms-rest { opacity: 0; }
    .mascot-character {
      transform-origin: 50px 85px;
      animation: mascot-breathe 5s ease-in-out infinite;
    }
    .mascot-leaf {
      transform-origin: 50px 18px;
      animation: mascot-leaf 5s ease-in-out infinite;
    }
    .mascot-arms-working {
      transform-origin: 50px 71px;
      animation: mascot-typing 2.8s ease-in-out infinite;
    }
    body[data-timer-running="false"] .mascot-body { fill: #9daac4; }
    body[data-timer-running="false"] .mascot-face-awake,
    body[data-timer-running="false"] .mascot-arms-working { opacity: 0; }
    body[data-timer-running="false"] .mascot-face-rest,
    body[data-timer-running="false"] .mascot-arms-rest { opacity: 1; }
    body[data-timer-running="false"] .mascot-laptop { opacity: .48; }
    .mascot[data-sound-reminder="true"] .mascot-face-awake { opacity: 1; }
    .mascot[data-sound-reminder="true"] .mascot-face-rest { opacity: 0; }
    .mascot[data-sound-reminder="true"] .mascot-leaf {
      animation: mascot-notice 1.6s ease-in-out;
    }
    body[data-focus-reminder="true"] {
      background: #67430d;
      animation: focus-reminder-background 2s ease-in-out infinite;
    }
    body[data-focus-reminder="true"] .mascot {
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
    .issue-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 0 1 25vw;
      min-width: 0;
    }
    .issue-info .title { flex: initial; }
    .why {
      overflow: hidden;
      color: #c4b5fd;
      font-size: 11px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .why[hidden] { display: none; }
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
    .focus-progress[data-pace="uncompared"] .focus-fill { background: #a7e4c9; }
    .focus-label {
      grid-column: 2;
      color: #cbd5e1;
    }
    .focus-progress[data-pace="ahead"] .focus-label { color: #34d399; }
    .focus-progress[data-pace="behind"] .focus-label { color: #fbbf24; }
    .focus-progress[data-pace="uncompared"] .focus-label { color: #a7e4c9; }
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
      .issue-info { flex-basis: 20vw; }
      .issue-info .title { font-size: 10px; }
      .why { font-size: 9px; }
    }
    @keyframes mascot-breathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.015, .985); }
    }
    @keyframes mascot-leaf {
      0%, 100% { transform: rotate(-3deg); }
      50% { transform: rotate(4deg); }
    }
    @keyframes mascot-typing {
      0%, 100% { transform: translateY(0); }
      20%, 60% { transform: translateY(-1.3px); }
      40%, 80% { transform: translateY(.5px); }
    }
    @keyframes mascot-notice {
      0%, 100% { transform: rotate(0); }
      20%, 60% { transform: rotate(-12deg); }
      40%, 80% { transform: rotate(12deg); }
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
      .mascot-character, .mascot-leaf, .mascot-arms-working,
      .mascot[data-sound-reminder="true"] .mascot-leaf,
      body[data-focus-reminder="true"], body[data-focus-reminder="true"] .mascot,
      body[data-focus-reminder="true"] .focus-label { animation: none; }
      body[data-timer-running="true"] .focus-fill::after { display: none; animation: none; }
      .progress-fill, .mascot-body, .mascot-face-awake, .mascot-face-rest,
      .mascot-laptop, .mascot-arms-working, .mascot-arms-rest { transition: none; }
    }
  `;

  let openRequestId = 0;

  function createMascot(doc) {
    const namespace = 'http://www.w3.org/2000/svg';
    function element(tag, attributes = {}, children = []) {
      const node = doc.createElementNS(namespace, tag);
      Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
      node.append(...children);
      return node;
    }
    const arms = () => [
      element('path', { d: 'M29 65 C24 68 26 75 35 76 L42 75 L40 70 L34 71Z' }),
      element('path', { d: 'M71 65 C76 68 74 75 65 76 L58 75 L60 70 L66 71Z' }),
    ];
    const svg = element('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' }, [
      element('g', { class: 'mascot-character' }, [
        element('g', { class: 'mascot-leaf' }, [
          element('path', { d: 'M50 24 C50 17 51 12 55 8', fill: 'none', stroke: '#80c9ab', 'stroke-width': '2.8', 'stroke-linecap': 'round' }),
          element('path', { d: 'M52 17 C44 17 42 13 42 8 C49 8 53 11 52 17Z', fill: '#80c9ab' }),
          element('path', { d: 'M53 13 C54 6 59 4 64 5 C63 11 59 14 53 13Z', fill: '#a2e3bf' }),
        ]),
        element('path', { class: 'mascot-body', d: 'M23 66 C21 43 31 23 50 23 C69 23 79 43 77 66 C76 80 66 88 50 88 C34 88 24 80 23 66Z' }),
        element('ellipse', { cx: '50', cy: '72', rx: '18', ry: '12', fill: '#dddfff', opacity: '.27' }),
        element('g', { class: 'mascot-face-awake', fill: '#303952' }, [
          element('ellipse', { cx: '42', cy: '52', rx: '2.4', ry: '3.1' }),
          element('ellipse', { cx: '58', cy: '52', rx: '2.4', ry: '3.1' }),
          element('path', { d: 'M47 58 Q50 60.5 53 58', fill: 'none', stroke: '#303952', 'stroke-width': '1.8', 'stroke-linecap': 'round' }),
        ]),
        element('g', { class: 'mascot-face-rest', fill: 'none', stroke: '#303952', 'stroke-width': '2', 'stroke-linecap': 'round' }, [
          element('path', { d: 'M39 52 Q42 55 45 52 M55 52 Q58 55 61 52 M47 59 Q50 61 53 59' }),
        ]),
        element('g', { class: 'mascot-arms-working', fill: '#858acb' }, arms()),
        element('g', { class: 'mascot-arms-rest', fill: '#858acb' }, arms()),
        element('g', { class: 'mascot-laptop' }, [
          element('path', { d: 'M34 65 Q33 63 36 63 H64 Q67 63 66 65 L64 78 H36Z', fill: '#465176', stroke: '#c1c8f2', 'stroke-width': '1.4' }),
          element('path', { d: 'M32 79 H68', stroke: '#c1c8f2', 'stroke-width': '2.5', 'stroke-linecap': 'round' }),
          element('circle', { cx: '50', cy: '71', r: '1.5', fill: '#a5a9ed' }),
        ]),
      ]),
    ]);
    const mascot = doc.createElement('div');
    mascot.className = 'mascot';
    mascot.appendChild(svg);
    return mascot;
  }

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
        height: 64,
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

      const mascot = createMascot(doc);
      mascot.setAttribute('data-sound-reminder', 'false');

      const timeEl = doc.createElement('span');
      timeEl.className = 'time';
      const issueInfo = doc.createElement('div');
      issueInfo.className = 'issue-info';
      const whyEl = doc.createElement('span');
      whyEl.className = 'why';
      whyEl.hidden = true;
      const titleEl = doc.createElement('span');
      titleEl.className = 'title';
      issueInfo.append(whyEl, titleEl);

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
      let soundGeneration = 0;
      let reactionTimeoutId = null;

      function clearSoundReaction() {
        soundGeneration += 1;
        if (reactionTimeoutId !== null) clearTimeout(reactionTimeoutId);
        reactionTimeoutId = null;
        mascot.setAttribute('data-sound-reminder', 'false');
      }

      function playSoundReminder() {
        const generation = ++soundGeneration;
        Sounds.remind().then(() => {
          if (pipWindow !== nextWindow || generation !== soundGeneration) return;
          if (reactionTimeoutId !== null) clearTimeout(reactionTimeoutId);
          mascot.setAttribute('data-sound-reminder', 'true');
          reactionTimeoutId = setTimeout(() => {
            reactionTimeoutId = null;
            mascot.setAttribute('data-sound-reminder', 'false');
          }, 1800);
        }).catch(error => console.error('Unable to play focus reminder', error));
      }

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

      doc.body.appendChild(mascot);
      doc.body.appendChild(timeEl);
      doc.body.appendChild(issueInfo);
      doc.body.appendChild(progressStack);
      doc.body.appendChild(pauseBtn);

      function updateFocus(now) {
        focusEl.hidden = !Settings.getFocusGoal().enabled;
        if (focusEl.hidden) return null;

        const focus = Settings.getFocusProgress(Storage.getDailyFocusMs(now), now);
        focusEl.hidden = focus === null;
        if (focusEl.hidden) return null;
        const percent = (focus.progress * 100).toFixed(2);
        focusFill.style.width = `${focus.progress * 100}%`;
        focusTrack.setAttribute('aria-valuenow', String(percent));
        let pace = 'No schedule';
        let state = 'neutral';
        let showPace = false;
        if (focus.differenceMs !== null) {
          const ahead = focus.differenceMs >= 0;
          showPace = ahead ? Settings.shouldShowAheadPace() : Settings.shouldShowBehindPace();
          state = showPace ? (ahead ? 'ahead' : 'behind') : 'uncompared';
          pace = null;
          if (showPace) {
            const difference = Math.abs(focus.differenceMs);
            const duration = difference < 60000 ? '<1m' : formatFocusDuration(difference);
            pace = difference < 1000 ? 'On pace' :
              `${ahead ? '+' : '-'}${duration} ${state}`;
          }
        }
        expectedMarker.hidden = !showPace;
        expectedMarker.style.left = `${(focus.expectedProgress ?? 0) * 100}%`;

        focusEl.setAttribute('data-pace', state);
        focusLabel.textContent = `${percent}%`;
        const detail = `Focus ${formatFocusDuration(focus.focusMs)} / ${formatFocusDuration(focus.goalMs)}` +
          (pace ? ` \u00b7 ${pace}` : '');
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
        doc.body.setAttribute('data-focus-reminder', String(remind && Settings.shouldShowFocusReminder()));
        mascot.title = running ? 'Focusing' :
          remind && Settings.shouldShowBehindPace() ? 'Paused - behind focus goal. Resume focus.' : 'Paused';
        if (remind && Settings.shouldPlayFocusReminder()) {
          const minutes = Settings.getFocusReminderIntervalMinutes();
          if (nextReminderAt === null || reminderIntervalMinutes !== minutes) {
            reminderIntervalMinutes = minutes;
            nextReminderAt = now.getTime() + minutes * 60000;
          } else if (now.getTime() >= nextReminderAt) {
            nextReminderAt = now.getTime() + minutes * 60000;
            playSoundReminder();
          }
        } else {
          nextReminderAt = null;
          clearSoundReaction();
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
        whyEl.textContent = state.why || '';
        whyEl.hidden = !state.why;
        pauseBtn.textContent = running ? '⏸\uFE0E' : '▶';
        pauseBtn.title = running ? 'Pause timer' : 'Resume timer';
        pauseBtn.setAttribute('aria-label', pauseBtn.title);
        updateProgress(new Date(), running);
      }

      const tickId = setInterval(updateDisplay, 1000);
      nextWindow.addEventListener('pagehide', () => {
        clearInterval(tickId);
        clearSoundReaction();
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
