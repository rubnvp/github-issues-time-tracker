// ─── Timer ────────────────────────────────────────────────────────────────────
// Handles time formatting, interval management, and single-timer enforcement.
//
// Depends on: Storage, FloatingBar

const Timer = {
  // boardCardId → intervalId
  _intervals: new Map(),

  // boardCardId → render() callback (registered by Injector)
  _renderers: new Map(),

  registerRenderer(boardCardId, renderFn) {
    this._renderers.set(boardCardId, renderFn);
  },

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

  // ── Interval management ─────────────────────────────────────────────────────

  // Stops any currently active timer before starting the new one.
  start(boardCardId) {
    if (this._intervals.has(boardCardId)) return;

    // Stop any other running timer first
    for (const [activeId] of this._intervals) {
      if (activeId !== boardCardId) this.stop(activeId);
    }

    Storage.startSession(boardCardId);

    const id = setInterval(() => {
      const el = document.querySelector(
        `[data-board-card-id="${boardCardId}"] [data-time-tracker] span`
      );
      if (!el) {
        this.stop(boardCardId);
        return;
      }
      el.textContent = this.formatMs(Storage.totalMs(Storage.load(boardCardId)));
    }, 1000);

    this._intervals.set(boardCardId, id);
    FloatingBar.show(boardCardId);
  },

  stop(boardCardId) {
    const id = this._intervals.get(boardCardId);
    if (id !== undefined) {
      clearInterval(id);
      this._intervals.delete(boardCardId);
    }

    Storage.stopSession(boardCardId);

    const render = this._renderers.get(boardCardId);
    if (render) render();

    if (this._intervals.size === 0) FloatingBar.hide();
  },
};
