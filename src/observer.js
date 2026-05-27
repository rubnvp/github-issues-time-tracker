// ─── Observer ─────────────────────────────────────────────────────────────────
// Watches the GitHub Projects board for new cards and triggers injection.
//
// Depends on: Injector, GitHubAdapter

const Observer = {
  _boardObserver: null,

  // Observe the board container for new cards being added (e.g. column scroll,
  // drag-and-drop, SPA navigation within the project).
  watchBoard(boardEl) {
    if (this._boardObserver) this._boardObserver.disconnect();

    this._boardObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          // Node itself is a card
          if (GitHubAdapter.getCardId(node)) {
            Injector.injectCard(node);
          } else {
            // Node contains cards (e.g. a column batch render)
            node.querySelectorAll('[data-board-card-id]')
              .forEach((card) => Injector.injectCard(card));
          }
        }
      }
    });

    this._boardObserver.observe(boardEl, { childList: true, subtree: true });
  },
};
