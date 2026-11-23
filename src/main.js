// ─── main.js ──────────────────────────────────────────────────────────────────
// Entry point. Orchestrates startup and wires together all modules.
//
// Load order (defined in manifest.json):
//   Storage → GitHubAdapter → FloatingBar → Timer → Injector → Observer → main
//
// GitHub Projects is a SPA — the board container may not exist on initial load.
// Strategy:
//   1. Board already in DOM → inject all visible cards + start targeted observer
//   2. Board not ready yet → watch document.body until it appears, then switch

function init() {
  const board = GitHubAdapter.getBoardContainer();

  if (board) {
    Injector.injectAllCards();
    Observer.watchBoard(board);
    startHeartbeat();
    return;
  }

  // Board not ready yet — watch document.body until it appears
  const rootObserver = new MutationObserver(() => {
    const board = GitHubAdapter.getBoardContainer();
    if (board) {
      rootObserver.disconnect();
      Injector.injectAllCards();
      Observer.watchBoard(board);
      startHeartbeat();
    }
  });

  rootObserver.observe(document.body, { childList: true, subtree: true });
}

// Safety-net heartbeat: re-inject any cards that lost their widget due to
// React re-renders not caught by the MutationObservers. injectCard() is
// idempotent (guarded by [data-time-tracker]), so this is safe to run often.
function startHeartbeat() {
  setInterval(() => Injector.injectAllCards(), 3000);
}

Settings.ready
  .then(init)
  .catch((error) => console.error('Unable to load extension settings', error));

// ── Respond to popup requests for daily session history ───────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_DAILY_SESSIONS') {
    sendResponse(Storage.getDailySessions(message.dateOffset ?? 0));
    return true;
  }
});
