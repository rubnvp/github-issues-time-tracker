// ─── Storage helpers ────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'time_tracker_';

function loadState(cardId) {
  const raw = localStorage.getItem(STORAGE_PREFIX + cardId);
  if (!raw) return { totalMs: 0, lastStart: null, running: false };
  try { return JSON.parse(raw); } catch { return { totalMs: 0, lastStart: null, running: false }; }
}

function saveState(cardId, state) {
  localStorage.setItem(STORAGE_PREFIX + cardId, JSON.stringify(state));
}

// ─── Time formatting ────────────────────────────────────────────────────────

function formatMs(ms) {
  if (ms < 1000) return '0m 0s';
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ─── Active timers registry (cardId → intervalId) ───────────────────────────

const activeIntervals = new Map();

function getCurrentMs(state) {
  if (!state.running || !state.lastStart) return state.totalMs;
  return state.totalMs + (Date.now() - state.lastStart);
}

// ─── Issue ID extraction ─────────────────────────────────────────────────────
// Extracts "owner/repo/issues/123" from the issue link inside the card.
// Falls back to the board card id if no issue link is found.

function extractIssueId(card) {
  const link = card.querySelector('a[href*="/issues/"]');
  if (link) {
    // href = "https://github.com/owner/repo/issues/123"
    // → issueId = "owner/repo/issues/123"
    const match = link.getAttribute('href').match(/github\.com\/(.+\/issues\/\d+)/);
    if (match) return match[1];
  }
  // Fallback: use the board card id
  return card.getAttribute('data-board-card-id');
}

// ─── Button injection ───────────────────────────────────────────────────────

function injectCard(card) {
  if (card.querySelector('[data-time-tracker]')) return; // already injected

  const boardCardId = card.getAttribute('data-board-card-id');
  if (!boardCardId) return;

  // issueId is used for storage; boardCardId is used for DOM queries
  const issueId = extractIssueId(card);

  const state = loadState(issueId);

  // Build the tracker widget
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
    color: var(--fgColor-default, #1f2328);
  `;

  const display = document.createElement('span');
  display.style.cssText = `
    font-size: 11px;
    font-family: monospace;
    color: var(--fgColor-muted, #636c76);
    min-width: 40px;
  `;

  function render() {
    const current = loadState(issueId);
    const ms = getCurrentMs(current);
    display.textContent = formatMs(ms);
    btn.textContent = current.running ? '⏸' : '▶';
    btn.title = current.running ? 'Pause timer' : 'Start timer';
    btn.style.color = current.running
      ? 'var(--fgColor-danger, #d1242f)'
      : 'var(--fgColor-default, #1f2328)';
  }

  function startInterval() {
    if (activeIntervals.has(issueId)) return;
    const id = setInterval(() => {
      // Use boardCardId for DOM lookup (stable within the page lifetime)
      const el = document.querySelector(`[data-board-card-id="${boardCardId}"] [data-time-tracker] span`);
      if (!el) {
        clearInterval(id);
        activeIntervals.delete(issueId);
        return;
      }
      const s = loadState(issueId);
      el.textContent = formatMs(getCurrentMs(s));
    }, 1000);
    activeIntervals.set(issueId, id);
  }

  function stopInterval() {
    const id = activeIntervals.get(issueId);
    if (id !== undefined) {
      clearInterval(id);
      activeIntervals.delete(issueId);
    }
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // don't open the issue detail panel
    e.preventDefault();

    const current = loadState(issueId);

    if (current.running) {
      // Pause
      const elapsed = Date.now() - current.lastStart;
      saveState(issueId, {
        totalMs: current.totalMs + elapsed,
        lastStart: null,
        running: false,
      });
      stopInterval();
    } else {
      // Start
      saveState(issueId, {
        totalMs: current.totalMs,
        lastStart: Date.now(),
        running: true,
      });
      startInterval();
    }

    render();
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(display);

  // Insert right after the <ul aria-label="Fields"> element
  const fieldsList = card.querySelector('ul[aria-label="Fields"]');
  if (fieldsList) {
    fieldsList.insertAdjacentElement('afterend', wrapper);
  } else {
    // Fallback: bottom of the inner content container
    const container = card.querySelector('.card-internal-content-module__Box__wLqy7');
    if (container) {
      container.appendChild(wrapper);
    } else {
      card.appendChild(wrapper);
    }
  }

  render();

  // If it was running when the page loaded (e.g. after refresh), resume the interval
  if (state.running) {
    startInterval();
  }
}

// ─── Scan & inject all visible cards ────────────────────────────────────────

function injectAllCards() {
  document.querySelectorAll('[data-board-card-id]').forEach(injectCard);
}

// ─── MutationObserver ────────────────────────────────────────────────────────

let boardObserver = null;

function observeBoard(boardEl) {
  if (boardObserver) boardObserver.disconnect();

  boardObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        // The added node might itself be a card, or contain cards
        if (node.hasAttribute('data-board-card-id')) {
          injectCard(node);
        } else {
          node.querySelectorAll('[data-board-card-id]').forEach(injectCard);
        }
      }
    }
  });

  boardObserver.observe(boardEl, { childList: true, subtree: true });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
// GitHub Projects is a SPA. The board container may not exist on initial load.
// We observe document.body until the board appears, then switch to a targeted observer.

function bootstrap() {
  const board = document.querySelector('[data-hpc="true"]');
  if (board) {
    injectAllCards();
    observeBoard(board);
    return;
  }

  // Board not ready yet — watch document.body until it appears
  const rootObserver = new MutationObserver(() => {
    const board = document.querySelector('[data-hpc="true"]');
    if (board) {
      rootObserver.disconnect();
      injectAllCards();
      observeBoard(board);
    }
  });

  rootObserver.observe(document.body, { childList: true, subtree: true });
}

bootstrap();
