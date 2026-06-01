// ─── popup.js ─────────────────────────────────────────────────────────────────
// Declarative popup UI built with preact + htm (no build step, no unsafe-eval).
// htm uses tagged template literals — parsed natively by the JS engine.

const { h, render, Fragment }         = preact;
const { useState, useEffect, useRef } = preactHooks;
const html                            = htm.bind(h);

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatMs(ms) {
  if (ms < 1000) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const seconds      = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes      = totalMinutes % 60;
  const hours        = Math.floor(totalMinutes / 60);

  if (hours > 0)   return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTime(ts) {
  const d  = new Date(ts);
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

function sessionRange(session) {
  return session.end
    ? `${formatTime(session.start)} – ${formatTime(session.end)}`
    : `${formatTime(session.start)} – now`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SessionRow({ session }) {
  const isOngoing = !session.end;
  const duration  = formatMs(isOngoing ? Date.now() - session.start : session.end - session.start);

  return html`
    <li class="popup__session-row">
      <span class=${'popup__session-range' + (isOngoing ? ' popup__session-range--active' : '')}>
        ${sessionRange(session)}
      </span>
      <span class="popup__session-duration">${duration}</span>
    </li>
  `;
}

function IssueGroup({ group }) {
  return html`
    <${Fragment}>
      <li class="popup__issue-header">
        <span class="popup__issue-title">${group.issueTitle}</span>
        <span class="popup__issue-total">${formatMs(group.totalMs)}</span>
      </li>
      ${[...group.sessions].reverse().map(s => html`<${SessionRow} key=${s.start} session=${s} />`)}
    </${Fragment}>
  `;
}

function DailyHistory({ groups, dayTotal, dateOffset, onPrev, onNext }) {
  return html`
    <div class="popup__history">
      <div class="popup__history-header">
        <button class="popup__nav-btn" onClick=${onPrev}>‹</button>
        <div class="popup__daily-meta">
          <span>${dayLabel(dateOffset)}</span>
          <span>${dayTotal}</span>
        </div>
        <button class="popup__nav-btn" disabled=${dateOffset >= 0} onClick=${onNext}>›</button>
      </div>
      <ul class="popup__daily-list">
        ${groups.length === 0
          ? html`<li class="popup__daily-empty">No sessions</li>`
          : groups.map(g => html`<${IssueGroup} key=${g.issueTitle} group=${g} />`)
        }
      </ul>
    </div>
  `;
}

// ── Root component ────────────────────────────────────────────────────────────

function App() {
  const [active,     setActive]     = useState(false);
  const [title,      setTitle]      = useState('');
  const [elapsedMs,  setElapsedMs]  = useState(0);
  const [dateOffset, setDateOffset] = useState(0);
  const [groups,     setGroups]     = useState([]);
  const [dayTotal,   setDayTotal]   = useState('');

  const tickRef = useRef(null);

  function startTick(initialMs) {
    clearInterval(tickRef.current);
    let ms = initialMs;
    tickRef.current = setInterval(() => { ms += 1000; setElapsedMs(ms); }, 1000);
  }

  function loadHistory(offset) {
    chrome.runtime.sendMessage({ type: 'GET_DAILY_SESSIONS', dateOffset: offset }, (gs) => {
      const list  = gs || [];
      const total = list.reduce((acc, g) => acc + g.totalMs, 0);
      setGroups(list);
      setDayTotal(total > 0 ? formatMs(total) : '');
    });
  }

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      if (state?.active) {
        setActive(true);
        setTitle(state.title);
        setElapsedMs(state.elapsedMs);
        startTick(state.elapsedMs);
      }
    });
    loadHistory(0);
    return () => clearInterval(tickRef.current);
  }, []);

  function stop() {
    chrome.runtime.sendMessage({ type: 'POPUP_STOP' });
    setActive(false);
    clearInterval(tickRef.current);
  }

  function prevDay() {
    const next = dateOffset - 1;
    setDateOffset(next);
    loadHistory(next);
  }

  function nextDay() {
    if (dateOffset >= 0) return;
    const next = dateOffset + 1;
    setDateOffset(next);
    loadHistory(next);
  }

  return html`
    <${Fragment}>
      <div class="popup__row" hidden=${active}>
        <span class="popup__dot popup__dot--idle"></span>
        <span class="popup__empty">No timer running</span>
      </div>

      <div class="popup__row" hidden=${!active}>
        <span class="popup__dot"></span>
        <span class="popup__title">${title}</span>
        <span class="popup__divider"></span>
        <span class="popup__elapsed">${formatMs(elapsedMs)}</span>
        <button class="popup__stop-btn" onClick=${stop}>⏹</button>
      </div>

      <${DailyHistory}
        groups=${groups}
        dayTotal=${dayTotal}
        dateOffset=${dateOffset}
        onPrev=${prevDay}
        onNext=${nextDay}
      />
    </${Fragment}>
  `;
}

render(html`<${App} />`, document.getElementById('app'));
