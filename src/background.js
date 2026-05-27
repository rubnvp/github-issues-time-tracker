// ─── background.js ────────────────────────────────────────────────────────────
// Service worker. Manages the extension action badge.
//
// Messages received from content scripts:
//   { type: 'BADGE_START' }         → red badge, starts ticking
//   { type: 'BADGE_STOP' }          → clears badge

let tickInterval = null;
let startTime = null;

function formatBadge(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${totalSeconds}s`;
}

function startBadge() {
  startTime = Date.now();

  chrome.action.setBadgeBackgroundColor({ color: '#d1242f' });
  chrome.action.setBadgeText({ text: '0s' });

  clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    chrome.action.setBadgeText({ text: formatBadge(elapsed) });
  }, 10000); // update every 10s — badge space is limited
}

function stopBadge() {
  clearInterval(tickInterval);
  tickInterval = null;
  startTime = null;
  chrome.action.setBadgeText({ text: '' });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BADGE_START') startBadge();
  else if (message.type === 'BADGE_STOP') stopBadge();
});
