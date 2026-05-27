// ─── background.js ────────────────────────────────────────────────────────────
// Service worker. Manages the extension action badge and active timer state.
//
// Messages received from content scripts:
//   { type: 'TIMER_START', boardCardId, title, tabId }  → starts badge tick
//   { type: 'TIMER_STOP' }                              → clears badge + state
//
// Messages received from popup:
//   { type: 'GET_STATE' }        → returns { active, title, elapsedMs, tabId }
//   { type: 'POPUP_STOP' }       → forwards stop to the content script tab

let tickInterval = null;
let activeTimer = null; // { boardCardId, title, tabId, startTime }

function formatBadge(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}h`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${totalSeconds}s`;
}

function startBadge() {
  chrome.action.setBadgeBackgroundColor({ color: '#d1242f' });
  chrome.action.setBadgeText({ text: '0s' });

  clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    if (!activeTimer) return;
    const elapsed = Date.now() - activeTimer.startTime;
    chrome.action.setBadgeText({ text: formatBadge(elapsed) });
  }, 10000);
}

function stopBadge() {
  clearInterval(tickInterval);
  tickInterval = null;
  chrome.action.setBadgeText({ text: '' });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TIMER_START') {
    activeTimer = {
      boardCardId: message.boardCardId,
      title: message.title,
      tabId: sender.tab?.id,
      startTime: Date.now(),
    };
    startBadge();
  }

  else if (message.type === 'TIMER_STOP') {
    activeTimer = null;
    stopBadge();
  }

  else if (message.type === 'GET_STATE') {
    if (!activeTimer) {
      sendResponse({ active: false });
    } else {
      sendResponse({
        active: true,
        title: activeTimer.title,
        elapsedMs: Date.now() - activeTimer.startTime,
        tabId: activeTimer.tabId,
        boardCardId: activeTimer.boardCardId,
      });
    }
    return true; // keep channel open for async sendResponse
  }

  else if (message.type === 'POPUP_STOP') {
    if (activeTimer) {
      chrome.tabs.sendMessage(activeTimer.tabId, {
        type: 'STOP_TIMER',
        boardCardId: activeTimer.boardCardId,
      });
    }
  }
});
