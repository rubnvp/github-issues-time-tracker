// ─── Injector ─────────────────────────────────────────────────────────────────
// Builds and injects the timer widget into each GitHub Projects card.
//
// Visibility rules:
//   - No time recorded → button shown in idle style (grey, camouflaged)
//   - Time recorded, stopped → button in play style (green)
//   - Running → button in pause style (indigo)
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
  _cards: new WeakMap(),

  // ── Issue ref extraction ───────────────────────────────────────────────────

  _extractIssueRef(card) {
    const link = GitHubAdapter.getIssueLink(card);
    return link ? GitHubAdapter.parseIssueRef(link.href) : null;
  },

  // ── Widget builder ─────────────────────────────────────────────────────────

  _buildWidget(boardCardId, why) {
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

    const celebrateBtn = document.createElement('button');
    celebrateBtn.className = 'gitt-card-widget__celebrate-btn';
    celebrateBtn.title = 'Celebrate!';
    celebrateBtn.textContent = '🎉';
    celebrateBtn.style.display = 'none';

    celebrateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      Confetti.burst();
      Sounds.celebrate();
    });

    const actions = document.createElement('div');
    actions.className = 'gitt-card-widget__actions';
    if (why) actions.appendChild(why.editButton);
    actions.append(celebrateBtn, sessionsBtn);

    const popover = document.createElement('div');
    popover.id = popoverId;

    // Position popover near the button when it opens.
    // We capture the button's rect on click (guaranteed to be in the DOM and
    // visible at that moment) and apply it in a rAF after the popover opens,
    // avoiding the race where getBoundingClientRect() can return zeros inside
    // the toggle event (e.g. after a React re-render re-mounts the widget).
    sessionsBtn.addEventListener('click', () => {
      const rect = sessionsBtn.getBoundingClientRect();
      if (!rect.width && !rect.height) return; // safety: element not rendered
      const popoverWidth = 280;
      let left = rect.right - popoverWidth;
      if (left < 8) left = 8;
      requestAnimationFrame(() => {
        popover.style.top = `${rect.bottom + 6}px`;
        popover.style.left = `${left}px`;
      });
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
        celebrateBtn.style.display = '';
        renderPopover(state.sessions);
      } else {
        sessionsBtn.style.display = 'none';
        celebrateBtn.style.display = 'none';
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (Storage.isRunning(Storage.load(boardCardId))) {
        Timer.stop(boardCardId);
      } else {
        const suggestWhy = why && Storage.shouldSuggestWhy(boardCardId);
        Timer.start(boardCardId);
        if (suggestWhy) why.suggest();
        if (Settings.shouldOpenPip() && !PiP.isOpen()) PiP.open(boardCardId);
      }

      render();
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(display);
    wrapper.appendChild(actions);
    if (why) wrapper.appendChild(why.editor);

    Timer.registerRenderer(boardCardId, render);

    return { wrapper, render, dispose: () => popover.remove() };
  },

  _buildWhyNote(boardCardId) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-time-tracker-why', 'true');
    wrapper.className = 'gitt-card-why';

    const text = document.createElement('span');
    text.className = 'gitt-card-why__text';

    const icon = document.createElement('span');
    icon.className = 'gitt-card-why__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚓';
    wrapper.append(icon, text);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 160;
    input.className = 'gitt-card-why__input';
    input.placeholder = 'What makes this issue matter?';
    input.setAttribute('aria-label', 'Purpose anchor');

    const hint = document.createElement('span');
    hint.className = 'gitt-card-why__hint';
    const editor = document.createElement('div');
    editor.className = 'gitt-card-why__editor';
    editor.hidden = true;
    editor.append(input, hint);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'gitt-card-why__edit';

    let editing = false;
    let suggestion = false;

    function render() {
      const why = Storage.load(boardCardId).why || '';
      wrapper.dataset.hasWhy = String(Boolean(why));
      text.textContent = why;
      text.hidden = !why;
      editButton.textContent = why ? '✎' : '⚓';
      editButton.title = why ? 'Edit purpose anchor' : 'Add purpose anchor';
      editButton.setAttribute('aria-label', editButton.title);
      editButton.hidden = editing;
      editor.hidden = !editing;
      hint.textContent = suggestion
        ? 'Optional · Enter to save · Esc to dismiss'
        : 'Enter to save · Esc to cancel';
    }

    function beginEdit(isSuggestion = false) {
      editing = true;
      suggestion = isSuggestion;
      input.value = Storage.load(boardCardId).why || '';
      render();
      input.focus();
    }

    function finishEdit(save) {
      if (!editing) return;
      if (save) {
        Storage.saveWhy(boardCardId, input.value);
        PiP.refresh();
        FloatingBar.refresh();
      }
      editing = false;
      suggestion = false;
      render();
    }

    editor.addEventListener('pointerdown', (event) => event.stopPropagation());
    editor.addEventListener('mousedown', (event) => event.stopPropagation());
    editor.addEventListener('click', (event) => event.stopPropagation());
    editor.addEventListener('dragstart', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    editButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginEdit();
    });
    editButton.addEventListener('pointerdown', (event) => event.stopPropagation());
    editButton.addEventListener('mousedown', (event) => event.stopPropagation());
    editButton.addEventListener('dragstart', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finishEdit(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finishEdit(false);
      }
    });
    input.addEventListener('blur', () => finishEdit(true));

    render();
    return { wrapper, editor, render, editButton, suggest: () => beginEdit(true) };
  },

  // ── Mount ──────────────────────────────────────────────────────────────────

  _mountCardElements(card, boardCardId, wrapper, render, whyNote, renderWhy) {
    const fieldsList = GitHubAdapter.getFieldsAnchor(card);
    if (fieldsList && wrapper && !card.contains(wrapper)) {
      fieldsList.insertAdjacentElement('afterend', wrapper);
      render();
    }

    const titleElement = GitHubAdapter.getIssueTitleElement(card);
    if (titleElement && whyNote && !card.contains(whyNote)) {
      titleElement.insertAdjacentElement('beforebegin', whyNote);
      renderWhy();
    }

    if (wrapper && card.contains(wrapper) && Storage.isRunning(Storage.load(boardCardId))) {
      Timer.start(boardCardId, { silent: true });
    }
    return Boolean(wrapper && card.contains(wrapper));
  },

  // ── Card injection ─────────────────────────────────────────────────────────

  // Watch a card for two situations:
  //   1. The fields anchor didn't exist yet at injection time — retry mounting.
  //   2. The widget was removed by a React re-render — re-mount it.
  _watchCard(card, state) {
    const cardObserver = new MutationObserver(() => {
      if (GitHubAdapter.getCardId(card) !== state.boardCardId) {
        this.injectCard(card);
      } else if (!card.contains(state.wrapper) || !card.contains(state.whyNote)) {
        this._mountCardElements(card, state.boardCardId, state.wrapper, state.render, state.whyNote, state.renderWhy);
      }
    });

    cardObserver.observe(card, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-board-card-id'],
    });
    return cardObserver;
  },

  injectCard(card) {
    const boardCardId = GitHubAdapter.getCardId(card);
    const previous = this._cards.get(card);
    if (previous && previous.boardCardId !== boardCardId) {
      previous.observer.disconnect();
      previous.wrapper?.remove();
      previous.whyNote?.remove();
      previous.dispose();
      this._cards.delete(card);
    }
    if (!boardCardId) return;

    if (previous && previous.boardCardId === boardCardId) {
      this._mountCardElements(card, boardCardId, previous.wrapper, previous.render, previous.whyNote, previous.renderWhy);
      return;
    }

    const existingWidget = card.querySelector('[data-time-tracker]');
    const existingWhy = card.querySelector('[data-time-tracker-why]');
    if (existingWidget && existingWhy) return;

    const why = existingWhy ? null : this._buildWhyNote(boardCardId);
    const widget = existingWidget ? null : this._buildWidget(boardCardId, why);
    const wrapper = widget?.wrapper || existingWidget;
    const render = widget?.render || (() => {});
    const whyNote = why?.wrapper || existingWhy;
    const renderWhy = why?.render || (() => {});
    const state = {
      boardCardId, wrapper, render, whyNote, renderWhy,
      dispose: widget?.dispose || (() => {}),
    };
    this._cards.set(card, state);

    // Attempt initial mount (may fail if fields anchor not yet in DOM)
    this._mountCardElements(card, boardCardId, wrapper, render, whyNote, renderWhy);

    // Always watch the card so we can re-mount if the widget disappears
    state.observer = this._watchCard(card, state);
  },

  injectAllCards() {
    GitHubAdapter.getAllCards().forEach((card) => this.injectCard(card));
  },
};
