// ─── background.js ────────────────────────────────────────────────────────────
// Service worker. Manages the extension action badge and active timer state.
//
// Messages received from content scripts:
//   { type: 'TIMER_START', boardCardId, title, tabId }  → starts badge tick
//   { type: 'TIMER_STOP' }                              → clears badge + state
//
// Messages received from popup:
//   { type: 'GET_STATE' }                      → returns { active, title, elapsedMs, tabId }
//   { type: 'POPUP_STOP' }                     → forwards stop to the content script tab
//   { type: 'GET_DAILY_SESSIONS', dateOffset } → forwards to content script, returns groups

let tickInterval = null;
let activeTimer = null;  // { boardCardId, title, tabId, startTime }
let lastKnownTabId = null; // last tab that sent us any content-script message

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  chrome.storage.local.set({ focusReminderVisualEnabled: false })
    .catch(error => console.error('Unable to initialize reminder settings', error));
});

function formatBadge(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}h`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${totalSeconds}s`;
}

function startBadge() {
  chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
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
  // Track the last tab that had our content script active
  if (sender.tab?.id) lastKnownTabId = sender.tab.id;

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

  else if (message.type === 'GET_DAILY_SESSIONS') {
    // Forward to a tab that has our content script loaded.
    // Priority: active timer tab → last known tab → all github.com tabs (try each).
    const dateOffset = message.dateOffset ?? 0;

    const tryTab = (tabId, onFail) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'GET_DAILY_SESSIONS', dateOffset },
        (groups) => {
          if (chrome.runtime.lastError || groups === undefined) {
            onFail();
          } else {
            sendResponse(groups || []);
          }
        }
      );
    };

    const tryTabList = (tabIds) => {
      if (tabIds.length === 0) { sendResponse([]); return; }
      const [first, ...rest] = tabIds;
      tryTab(first, () => tryTabList(rest));
    };

    // Build candidate list (deduplicated, preferred first)
    chrome.tabs.query({ url: 'https://github.com/*' }, (tabs) => {
      const allTabIds = tabs.map(t => t.id);
      const preferred = [activeTimer?.tabId, lastKnownTabId].filter(Boolean);
      const ordered = [
        ...preferred,
        ...allTabIds.filter(id => !preferred.includes(id)),
      ];
      tryTabList([...new Set(ordered)]);
    });

    return true; // async
  }
});
