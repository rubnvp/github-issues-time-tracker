// ─── Injector ─────────────────────────────────────────────────────────────────
// Builds and injects the timer widget into each GitHub Projects card.
//
// Visibility rules:
//   - No time recorded → button shown in idle style (grey, camouflaged)
//   - Time recorded, stopped → button in play style (green)
//   - Running → button in pause style (red)
//
// Depends on: Storage, Timer

const Injector = {

  // ── Issue ref extraction ───────────────────────────────────────────────────
  // Returns "owner/repo/issues/123" from the issue link inside the card.
  // Stored as metadata inside the state object — not used as a key.

  _extractIssueRef(card) {
    const link = card.querySelector('a[href*="/issues/"]');
    if (link) {
      const match = link.getAttribute('href').match(/github\.com\/(.+\/issues\/\d+)/);
      if (match) return match[1];
    }
    return null;
  },

  // ── Widget builder ─────────────────────────────────────────────────────────

  _buildWidget(boardCardId) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-time-tracker', 'true');
    wrapper.className = 'gitt-card-widget';

    const btn = document.createElement('button');
    btn.className = 'gitt-card-widget__btn';

    const display = document.createElement('span');
    display.className = 'gitt-card-widget__display';

    function render() {
      const state = Storage.load(boardCardId);
      const ms = Storage.totalMs(state);
      const running = Storage.isRunning(state);
      const hasTime = ms > 0;

      display.textContent = Timer.formatMs(ms);

      if (running) {
        btn.textContent = '⏸\uFE0E';
        btn.title = 'Pause timer';
        btn.className = 'gitt-card-widget__btn gitt-card-widget__btn--pause';
        display.className = 'gitt-card-widget__display gitt-card-widget__display--running';
      } else if (hasTime) {
        btn.textContent = '▶';
        btn.title = 'Start timer';
        btn.className = 'gitt-card-widget__btn gitt-card-widget__btn--play';
        display.className = 'gitt-card-widget__display gitt-card-widget__display--stopped';
      } else {
        btn.textContent = '▶';
        btn.title = 'Start timer';
        btn.className = 'gitt-card-widget__btn gitt-card-widget__btn--idle';
        display.className = 'gitt-card-widget__display gitt-card-widget__display--stopped';
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (Storage.isRunning(Storage.load(boardCardId))) {
        Timer.stop(boardCardId);
      } else {
        Timer.start(boardCardId);
      }

      render();
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(display);

    Timer.registerRenderer(boardCardId, render);

    return { wrapper, render };
  },

  // ── Mount ──────────────────────────────────────────────────────────────────

  _mountWidget(card, boardCardId, wrapper, render) {
    const fieldsList = card.querySelector('ul[aria-label="Fields"]');
    if (!fieldsList) return false;

    fieldsList.insertAdjacentElement('afterend', wrapper);
    render();

    if (Storage.isRunning(Storage.load(boardCardId))) {
      Timer.start(boardCardId);
    }
    return true;
  },

  // ── Card injection ─────────────────────────────────────────────────────────

  injectCard(card) {
    if (card.querySelector('[data-time-tracker]')) return;

    const boardCardId = card.getAttribute('data-board-card-id');
    if (!boardCardId) return;

    const state = Storage.load(boardCardId);
    if (!state.issueRef) {
      const issueRef = this._extractIssueRef(card);
      if (issueRef) Storage.save(boardCardId, { ...state, issueRef });
    }

    const { wrapper, render } = this._buildWidget(boardCardId);

    if (this._mountWidget(card, boardCardId, wrapper, render)) return;

    const cardObserver = new MutationObserver(() => {
      if (card.querySelector('[data-time-tracker]')) {
        cardObserver.disconnect();
        return;
      }
      if (this._mountWidget(card, boardCardId, wrapper, render)) {
        cardObserver.disconnect();
      }
    });

    cardObserver.observe(card, { childList: true, subtree: true });
  },

  injectAllCards() {
    document.querySelectorAll('[data-board-card-id]').forEach(
      (card) => this.injectCard(card)
    );
  },
};
