// ─── Injector ─────────────────────────────────────────────────────────────────
// Builds and injects the timer widget into each GitHub Projects card.
//
// Depends on: Storage, Timer

const Injector = {

  // ── Issue ID extraction ────────────────────────────────────────────────────
  // Returns "owner/repo/issues/123" from the issue link inside the card.
  // Falls back to data-board-card-id if no issue link is found.

  _extractIssueId(card) {
    const link = card.querySelector('a[href*="/issues/"]');
    if (link) {
      const match = link.getAttribute('href').match(/github\.com\/(.+\/issues\/\d+)/);
      if (match) return match[1];
    }
    return card.getAttribute('data-board-card-id');
  },

  // ── Widget builder ─────────────────────────────────────────────────────────

  _buildWidget(issueId, boardCardId) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-time-tracker', 'true');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px 2px 8px;
      border-top: 1px solid var(--borderColor-muted, #e1e4e8);
      margin-top: 4px;
    `;

    const btn = document.createElement('button');
    btn.style.cssText = `
      background: none;
      border: 1px solid var(--borderColor-default, #d0d7de);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      padding: 2px 6px;
      line-height: 1.4;
    `;

    const display = document.createElement('span');
    display.style.cssText = `
      font-size: 11px;
      font-family: monospace;
      color: var(--fgColor-muted, #636c76);
      min-width: 40px;
    `;

    function render() {
      const state = Storage.load(issueId);
      display.textContent = Timer.formatMs(Timer.getCurrentMs(state));
      btn.textContent = state.running ? '⏸' : '▶';
      btn.title = state.running ? 'Pause timer' : 'Start timer';
      btn.style.color = state.running
        ? 'var(--fgColor-danger, #d1242f)'
        : 'var(--fgColor-default, #1f2328)';
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent opening the issue detail panel
      e.preventDefault();

      const state = Storage.load(issueId);

      if (state.running) {
        Storage.save(issueId, {
          totalMs: state.totalMs + (Date.now() - state.lastStart),
          lastStart: null,
          running: false,
        });
        Timer.stop(issueId);
      } else {
        Storage.save(issueId, {
          totalMs: state.totalMs,
          lastStart: Date.now(),
          running: true,
        });
        Timer.start(issueId, boardCardId);
      }

      render();
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(display);

    return { wrapper, render };
  },

  // ── Card injection ─────────────────────────────────────────────────────────

  injectCard(card) {
    if (card.querySelector('[data-time-tracker]')) return; // already injected

    const boardCardId = card.getAttribute('data-board-card-id');
    if (!boardCardId) return;

    const issueId = this._extractIssueId(card);
    const { wrapper, render } = this._buildWidget(issueId, boardCardId);

    // Insert right after <ul aria-label="Fields">
    const fieldsList = card.querySelector('ul[aria-label="Fields"]');
    if (fieldsList) {
      fieldsList.insertAdjacentElement('afterend', wrapper);
    } else {
      const container = card.querySelector('.card-internal-content-module__Box__wLqy7');
      (container || card).appendChild(wrapper);
    }

    render();

    // Resume interval if timer was already running before page reload
    if (Storage.load(issueId).running) {
      Timer.start(issueId, boardCardId);
    }
  },

  injectAllCards() {
    document.querySelectorAll('[data-board-card-id]').forEach(
      (card) => this.injectCard(card)
    );
  },
};
