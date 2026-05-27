// ─── Storage ──────────────────────────────────────────────────────────────────
// Persists and loads timer state via localStorage.
// Key format: "time_tracker_<boardCardId>"
//
// State shape:
// {
//   issueRef: "owner/repo/issues/123",  // informational, for future use
//   totalMs: 0,
//   lastStart: null,
//   running: false,
// }

const Storage = {
  PREFIX: 'time_tracker_',

  _defaultState: (issueRef) => ({ issueRef, totalMs: 0, lastStart: null, running: false }),

  load(boardCardId) {
    const raw = localStorage.getItem(this.PREFIX + boardCardId);
    if (!raw) return this._defaultState(null);
    try { return JSON.parse(raw); } catch { return this._defaultState(null); }
  },

  save(boardCardId, state) {
    localStorage.setItem(this.PREFIX + boardCardId, JSON.stringify(state));
  },
};
