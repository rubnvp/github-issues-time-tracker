// ─── Timer ────────────────────────────────────────────────────────────────────
// Handles time formatting, elapsed time calculation, and interval management.
//
// Depends on: Storage

const Timer = {
  // issueId → intervalId
  _intervals: new Map(),

  // ── Formatting ──────────────────────────────────────────────────────────────

  formatMs(ms) {
    if (ms < 1000) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  },

  // ── Elapsed ─────────────────────────────────────────────────────────────────

  getCurrentMs(state) {
    if (!state.running || !state.lastStart) return state.totalMs;
    return state.totalMs + (Date.now() - state.lastStart);
  },

  // ── Interval management ─────────────────────────────────────────────────────
  // boardCardId is used only for DOM lookup during the tick — it is stable
  // within the page lifetime while issueId is the canonical identifier.

  start(issueId, boardCardId) {
    if (this._intervals.has(issueId)) return;

    const id = setInterval(() => {
      const el = document.querySelector(
        `[data-board-card-id="${boardCardId}"] [data-time-tracker] span`
      );
      if (!el) {
        this.stop(issueId);
        return;
      }
      el.textContent = this.formatMs(this.getCurrentMs(Storage.load(issueId)));
    }, 1000);

    this._intervals.set(issueId, id);
  },

  stop(issueId) {
    const id = this._intervals.get(issueId);
    if (id !== undefined) {
      clearInterval(id);
      this._intervals.delete(issueId);
    }
  },
};
