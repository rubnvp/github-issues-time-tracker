// ─── main.js ──────────────────────────────────────────────────────────────────
// Entry point. Orchestrates startup and wires together all modules.
//
// Load order (defined in manifest.json):
//   Storage → Timer → Injector → Observer → main
//
// GitHub Projects is a SPA — the board container may not exist on initial load.
// Strategy:
//   1. Board already in DOM → inject all visible cards + start targeted observer
//   2. Board not ready yet → watch document.body until it appears, then switch

const BOARD_SELECTOR = '[data-hpc="true"]';

function init() {
  const board = document.querySelector(BOARD_SELECTOR);

  if (board) {
    Injector.injectAllCards();
    Observer.watchBoard(board);
    return;
  }

  // Board not ready yet — watch document.body until it appears
  const rootObserver = new MutationObserver(() => {
    const board = document.querySelector(BOARD_SELECTOR);
    if (board) {
      rootObserver.disconnect();
      Injector.injectAllCards();
      Observer.watchBoard(board);
    }
  });

  rootObserver.observe(document.body, { childList: true, subtree: true });
}

init();
