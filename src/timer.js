// ─── Timer ────────────────────────────────────────────────────────────────────
// Handles time formatting, elapsed time calculation, and interval management.
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
    if (ms < 1000) return "0s";
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

  // Stops any currently active timer before starting the new one.
  start(boardCardId) {
    if (this._intervals.has(boardCardId)) return;

    // Stop whichever other timer is running and persist its elapsed time
    for (const [activeId] of this._intervals) {
      if (activeId === boardCardId) continue;
      const activeState = Storage.load(activeId);
      if (activeState.running) {
        Storage.save(activeId, {
          ...activeState,
          totalMs: activeState.totalMs + (Date.now() - activeState.lastStart),
          lastStart: null,
          running: false,
        });
      }
      this.stop(activeId);
    }

    const id = setInterval(() => {
      const el = document.querySelector(
        `[data-board-card-id="${boardCardId}"] [data-time-tracker] span`,
      );
      if (!el) {
        this.stop(boardCardId);
        return;
      }
      el.textContent = this.formatMs(this.getCurrentMs(Storage.load(boardCardId)));
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
    // Re-render the card so button reflects the stopped state
    const render = this._renderers.get(boardCardId);
    if (render) render();

    // Hide the floating bar only if no other timer is running
    if (this._intervals.size === 0) {
      FloatingBar.hide();
    }
  },
};
