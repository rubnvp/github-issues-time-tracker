// ─── Storage ──────────────────────────────────────────────────────────────────
// Persists and loads timer state via localStorage.
// Key format: "gitt:<boardCardId>"
//
// State shape:
// {
//   issueRef: "owner/repo/issues/123",  // informational, for future use
//   sessions: [
//     { start: 1748000000000, end: 1748003600000 },  // completed session
//     { start: 1748007200000, end: null },            // active session (end: null)
//   ]
// }
//
// Derived (never stored):
//   isRunning → sessions.at(-1)?.end === null
//   totalMs   → sum of all session durations

const Storage = {
  PREFIX: 'gitt:',

  _defaultState: (issueRef = null) => ({ issueRef, sessions: [] }),

  load(boardCardId) {
    const raw = localStorage.getItem(this.PREFIX + boardCardId);
    if (!raw) return this._defaultState();
    try {
      const parsed = JSON.parse(raw);
      // Migrate old format (totalMs/running/lastStart) to sessions[]
      if (!Array.isArray(parsed.sessions)) parsed.sessions = [];
      return parsed;
    } catch { return this._defaultState(); }
  },

  save(boardCardId, state) {
    localStorage.setItem(this.PREFIX + boardCardId, JSON.stringify(state));
  },

  // ── Derived helpers ────────────────────────────────────────────────────────

  isRunning(state) {
    return state.sessions.length > 0 &&
      state.sessions[state.sessions.length - 1].end === null;
  },

  // Total accumulated ms (including the active session if running)
  totalMs(state) {
    const now = Date.now();
    return state.sessions.reduce((acc, s) => {
      return acc + ((s.end ?? now) - s.start);
    }, 0);
  },

  // ── Session mutations ──────────────────────────────────────────────────────

  startSession(boardCardId) {
    const state = this.load(boardCardId);
    if (this.isRunning(state)) return state; // already running
    state.sessions.push({ start: Date.now(), end: null });
    this.save(boardCardId, state);
    return state;
  },

  stopSession(boardCardId) {
    const state = this.load(boardCardId);
    if (!this.isRunning(state)) return state; // not running
    state.sessions[state.sessions.length - 1].end = Date.now();
    this.save(boardCardId, state);
    return state;
  },
};
