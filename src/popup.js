// ─── popup.js ─────────────────────────────────────────────────────────────────
// Queries the background for active timer state and renders the popup UI.

const stateIdle   = document.getElementById('state-idle');
const stateActive = document.getElementById('state-active');
const titleEl     = document.getElementById('popup-title');
const elapsedEl   = document.getElementById('popup-elapsed');
const stopBtn     = document.getElementById('popup-stop-btn');

let tickId = null;
let elapsedMs = 0;

function formatMs(ms) {
  if (ms < 1000) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function showIdle() {
  stateIdle.hidden = false;
  stateActive.hidden = true;
  clearInterval(tickId);
}

function showActive(state) {
  stateIdle.hidden = true;
  stateActive.hidden = false;

  titleEl.textContent = state.title;
  elapsedMs = state.elapsedMs;
  elapsedEl.textContent = formatMs(elapsedMs);

  clearInterval(tickId);
  tickId = setInterval(() => {
    elapsedMs += 1000;
    elapsedEl.textContent = formatMs(elapsedMs);
  }, 1000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
  if (state?.active) showActive(state);
  else showIdle();
});

// ── Stop button ───────────────────────────────────────────────────────────────

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'POPUP_STOP' });
  showIdle();
});
