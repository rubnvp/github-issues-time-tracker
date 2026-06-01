// ─── popup.js ─────────────────────────────────────────────────────────────────
// Queries the background for active timer state and renders the popup UI.

const stateIdle   = document.getElementById('state-idle');
const stateActive = document.getElementById('state-active');
const titleEl     = document.getElementById('popup-title');
const elapsedEl   = document.getElementById('popup-elapsed');
const stopBtn     = document.getElementById('popup-stop-btn');
const dailyList   = document.getElementById('daily-list');
const dailyLabel  = document.getElementById('daily-label');
const prevDayBtn  = document.getElementById('prev-day');
const nextDayBtn  = document.getElementById('next-day');

let tickId      = null;
let elapsedMs   = 0;
let dateOffset  = 0; // 0 = today, -1 = yesterday, …

// ── Formatting ────────────────────────────────────────────────────────────────

function formatMs(ms) {
  if (ms < 1000) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const seconds      = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes      = totalMinutes % 60;
  const hours        = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function dayLabel(offset) {
  if (offset === 0)  return 'Today';
  if (offset === -1) return 'Yesterday';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Active timer state ────────────────────────────────────────────────────────

function showIdle() {
  stateIdle.hidden   = false;
  stateActive.hidden = true;
  clearInterval(tickId);
}

function showActive(state) {
  stateIdle.hidden   = true;
  stateActive.hidden = false;

  titleEl.textContent = state.title;
  elapsedMs           = state.elapsedMs;
  elapsedEl.textContent = formatMs(elapsedMs);

  clearInterval(tickId);
  tickId = setInterval(() => {
    elapsedMs += 1000;
    elapsedEl.textContent = formatMs(elapsedMs);
  }, 1000);
}

// ── Daily history ─────────────────────────────────────────────────────────────

function renderHistory(groups) {
  dailyList.innerHTML = '';

  if (!groups || groups.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'popup__daily-empty';
    empty.textContent = 'No sessions';
    dailyList.appendChild(empty);
    return;
  }

  groups.forEach((group) => {
    // ── Issue header row ──────────────────────────────────────────────────────
    const headerLi = document.createElement('li');
    headerLi.className = 'popup__issue-header';

    const issueTitle = document.createElement('span');
    issueTitle.className = 'popup__issue-title';
    issueTitle.textContent = group.issueTitle;

    const issueTotal = document.createElement('span');
    issueTotal.className = 'popup__issue-total';
    issueTotal.textContent = formatMs(group.totalMs);

    headerLi.appendChild(issueTitle);
    headerLi.appendChild(issueTotal);
    dailyList.appendChild(headerLi);

    // ── Session rows (most recent first) ──────────────────────────────────────
    group.sessions.slice().reverse().forEach((s) => {
      const isOngoing = !s.end;
      const duration  = isOngoing ? formatMs(Date.now() - s.start) : formatMs(s.end - s.start);
      const range     = isOngoing
        ? `${formatTime(s.start)} – now`
        : `${formatTime(s.start)} – ${formatTime(s.end)}`;

      const li = document.createElement('li');
      li.className = 'popup__session-row';

      const rangeEl = document.createElement('span');
      rangeEl.className = 'popup__session-range' + (isOngoing ? ' popup__session-range--active' : '');
      rangeEl.textContent = range;

      const durationEl = document.createElement('span');
      durationEl.className = 'popup__session-duration';
      durationEl.textContent = duration;

      li.appendChild(rangeEl);
      li.appendChild(durationEl);
      dailyList.appendChild(li);
    });
  });
}

function loadHistory() {
  dailyLabel.textContent = dayLabel(dateOffset);
  // Disable next-day button when at today
  nextDayBtn.disabled = dateOffset >= 0;

  chrome.runtime.sendMessage(
    { type: 'GET_DAILY_SESSIONS', dateOffset },
    (groups) => {
      renderHistory(groups || []);
    }
  );
}

// ── Navigation ────────────────────────────────────────────────────────────────

prevDayBtn.addEventListener('click', () => {
  dateOffset -= 1;
  loadHistory();
});

nextDayBtn.addEventListener('click', () => {
  if (dateOffset >= 0) return;
  dateOffset += 1;
  loadHistory();
});

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
  if (state?.active) showActive(state);
  else showIdle();
});

loadHistory();

// ── Stop button ───────────────────────────────────────────────────────────────

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'POPUP_STOP' });
  showIdle();
});
