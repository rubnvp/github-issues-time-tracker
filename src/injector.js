// ─── Injector ─────────────────────────────────────────────────────────────────
// Builds and injects the timer widget into each GitHub Projects card.
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
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 8px 4px 8px;
      border-top: 1px solid var(--borderColor-muted, #e1e4e8);
      margin-top: 6px;
    `;

    const btn = document.createElement('button');
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      flex-shrink: 0;
      transition: transform 0.1s ease, opacity 0.1s ease;
    `;

    btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.15)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });

    const display = document.createElement('span');
    display.style.cssText = `
      font-size: 12px;
      font-family: monospace;
      font-weight: 500;
      min-width: 44px;
    `;

    function render() {
      const state = Storage.load(boardCardId);
      display.textContent = Timer.formatMs(Timer.getCurrentMs(state));

      if (state.running) {
        btn.textContent = '⏸';
        btn.title = 'Pause timer';
        btn.style.background = 'var(--bgColor-danger-emphasis, #d1242f)';
        btn.style.color = '#ffffff';
        display.style.color = 'var(--fgColor-danger, #d1242f)';
      } else {
        btn.textContent = '▶';
        btn.title = 'Start timer';
        btn.style.background = 'var(--bgColor-success-emphasis, #1a7f37)';
        btn.style.color = '#ffffff';
        display.style.color = 'var(--fgColor-muted, #636c76)';
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent opening the issue detail panel
      e.preventDefault();

      const state = Storage.load(boardCardId);

      if (state.running) {
        Storage.save(boardCardId, {
          ...state,
          totalMs: state.totalMs + (Date.now() - state.lastStart),
          lastStart: null,
          running: false,
        });
        Timer.stop(boardCardId);
      } else {
        Storage.save(boardCardId, {
          ...state,
          lastStart: Date.now(),
          running: true,
        });
        Timer.start(boardCardId);
      }

      render();
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(display);

    return { wrapper, render };
  },

  // ── Mount ──────────────────────────────────────────────────────────────────
  // Inserts the widget after ul[aria-label="Fields"].
  // Returns true if mounted, false if the fields list isn't ready yet.

  _mountWidget(card, boardCardId, wrapper, render) {
    const fieldsList = card.querySelector('ul[aria-label="Fields"]');
    if (!fieldsList) return false;

    fieldsList.insertAdjacentElement('afterend', wrapper);
    render();

    if (Storage.load(boardCardId).running) {
      Timer.start(boardCardId);
    }
    return true;
  },

  // ── Card injection ─────────────────────────────────────────────────────────

  injectCard(card) {
    if (card.querySelector('[data-time-tracker]')) return; // already injected

    const boardCardId = card.getAttribute('data-board-card-id');
    if (!boardCardId) return;

    // Store issueRef as metadata the first time we see this card
    const state = Storage.load(boardCardId);
    if (!state.issueRef) {
      const issueRef = this._extractIssueRef(card);
      if (issueRef) Storage.save(boardCardId, { ...state, issueRef });
    }

    const { wrapper, render } = this._buildWidget(boardCardId);

    // Try to mount immediately if the card content is already in the DOM
    if (this._mountWidget(card, boardCardId, wrapper, render)) return;

    // Card was added to the DOM but its internal content isn't rendered yet.
    // Wait for ul[aria-label="Fields"] to appear before mounting.
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
