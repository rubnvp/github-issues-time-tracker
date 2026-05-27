// ─── Injector ─────────────────────────────────────────────────────────────────
// Builds and injects the timer widget into each GitHub Projects card.
//
// Visibility rules:
//   - No time recorded → button shown in idle style (grey, camouflaged)
//   - Time recorded, stopped → button in play style (green)
//   - Running → button in pause style (red)
//
// Depends on: Storage, Timer, GitHubAdapter

function _formatDate(ts) {
  const d = new Date(ts);
  const day = d.getDate();
  const month = d.toLocaleString('default', { month: 'short' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${hh}:${mm}`;
}

const Injector = {

  // ── Issue ref extraction ───────────────────────────────────────────────────

  _extractIssueRef(card) {
    const link = GitHubAdapter.getIssueLink(card);
    return link ? GitHubAdapter.parseIssueRef(link.href) : null;
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

    // ── Sessions popover ──────────────────────────────────────────────────────
    const popoverId = `gitt-sessions-${boardCardId}`;

    const sessionsBtn = document.createElement('button');
    sessionsBtn.className = 'gitt-card-widget__sessions-btn';
    sessionsBtn.setAttribute('popovertarget', popoverId);
    sessionsBtn.title = 'View sessions';
    sessionsBtn.textContent = '☰';

    const popover = document.createElement('div');
    popover.id = popoverId;

    // Position popover near the button when it opens
    popover.addEventListener('toggle', (e) => {
      if (e.newState !== 'open') return;
      const rect = sessionsBtn.getBoundingClientRect();
      const popoverWidth = 280;
      let left = rect.right - popoverWidth;
      if (left < 8) left = 8;
      popover.style.top = `${rect.bottom + 6}px`;
      popover.style.left = `${left}px`;
    });
    popover.setAttribute('popover', '');
    popover.className = 'gitt-sessions-popover';
    document.body.appendChild(popover);

    function renderPopover(sessions) {
      popover.innerHTML = '';
      const title = document.createElement('p');
      title.className = 'gitt-sessions-popover__title';
      title.textContent = 'Sessions';
      popover.appendChild(title);

      const list = document.createElement('ul');
      list.className = 'gitt-sessions-popover__list';

      sessions.slice().reverse().forEach((s) => {
        const start = _formatDate(s.start);
        const isOngoing = !s.end;
        const end = isOngoing ? 'ongoing' : _formatDate(s.end);
        const duration = isOngoing ? '' : Timer.formatMs(s.end - s.start);

        const li = document.createElement('li');
        li.className = 'gitt-sessions-popover__item';
        li.innerHTML =
          `<span class="gitt-sessions-popover__range">${start} — ${end}</span>` +
          (duration ? `<span class="gitt-sessions-popover__duration">${duration}</span>` : '');
        list.appendChild(li);
      });

      popover.appendChild(list);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    function render() {
      const state = Storage.load(boardCardId);
      const ms = Storage.totalMs(state);
      const running = Storage.isRunning(state);
      const hasTime = ms > 0;

      display.textContent = hasTime ? Timer.formatMs(ms) : '';

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

      if (hasTime) {
        sessionsBtn.style.display = '';
        renderPopover(state.sessions);
      } else {
        sessionsBtn.style.display = 'none';
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
    wrapper.appendChild(sessionsBtn);

    Timer.registerRenderer(boardCardId, render);

    return { wrapper, render };
  },

  // ── Mount ──────────────────────────────────────────────────────────────────

  _mountWidget(card, boardCardId, wrapper, render) {
    const fieldsList = GitHubAdapter.getFieldsAnchor(card);
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

    const boardCardId = GitHubAdapter.getCardId(card);
    if (!boardCardId) return;

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
    GitHubAdapter.getAllCards().forEach((card) => this.injectCard(card));
  },
};
