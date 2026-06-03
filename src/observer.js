// ─── Observer ─────────────────────────────────────────────────────────────────
// Watches the GitHub Projects board for new cards and triggers injection.
//
// Depends on: Injector, GitHubAdapter

const Observer = {
  _boardObserver: null,
  _reinjectionTimer: null,

  // Schedule a debounced re-injection of all cards.
  // Used when widgets are detected as removed to avoid batching multiple
  // mutations into redundant injectAllCards() calls.
  _scheduleReinjection() {
    if (this._reinjectionTimer) return;
    this._reinjectionTimer = setTimeout(() => {
      this._reinjectionTimer = null;
      Injector.injectAllCards();
    }, 100);
  },

  // Observe the board container for new cards being added (e.g. column scroll,
  // drag-and-drop, SPA navigation within the project).
  watchBoard(boardEl) {
    if (this._boardObserver) this._boardObserver.disconnect();

    this._boardObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Handle newly added nodes
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

        // Handle removed nodes: if a widget was removed (e.g. React re-render),
        // schedule a re-injection pass so the button comes back.
        for (const node of mutation.removedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (
            node.hasAttribute('data-time-tracker') ||
            node.querySelector?.('[data-time-tracker]')
          ) {
            this._scheduleReinjection();
            break; // one debounce per mutation batch is enough
          }
        }
      }
    });

    this._boardObserver.observe(boardEl, { childList: true, subtree: true });
  },
};
