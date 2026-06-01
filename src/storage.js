// ─── Storage ──────────────────────────────────────────────────────────────────
// Persists and loads timer state via localStorage.
// Key format: "gitt:<boardCardId>"
//
// State shape:
// {
//   issueRef:   "owner/repo/issues/123",  // informational, for future use
//   issueTitle: "Fix login redirect",     // human-readable title, for popup history
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

  _defaultState: (issueRef = null) => ({ issueRef, issueTitle: null, sessions: [] }),

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

  // Ms elapsed in the current active session only (0 if not running)
  currentSessionMs(state) {
    if (!this.isRunning(state)) return 0;
    return Date.now() - state.sessions[state.sessions.length - 1].start;
  },

  // ── Session mutations ──────────────────────────────────────────────────────

  startSession(boardCardId, issueTitle = null) {
    const state = this.load(boardCardId);
    if (this.isRunning(state)) return state; // already running
    if (issueTitle) state.issueTitle = issueTitle;
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

  // ── Daily history ──────────────────────────────────────────────────────────
  // Returns all sessions that started on the given day, grouped by issue.
  // dateOffset: 0 = today, -1 = yesterday, etc.
  //
  // Returns:
  // [
  //   {
  //     boardCardId, issueTitle, issueRef,
  //     totalMs,
  //     sessions: [{ start, end }, ...]  ← only sessions for that day, asc order
  //   },
  //   ...
  // ]
  // Groups are ordered by the most recent session start desc.
  getDailySessions(dateOffset = 0) {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dateOffset);
    const dayStart = target.getTime();
    const dayEnd   = dayStart + 86400000;

    const groups = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(this.PREFIX)) continue;

      const boardCardId = key.slice(this.PREFIX.length);
      let state;
      try { state = JSON.parse(localStorage.getItem(key)); } catch { continue; }
      if (!state || !Array.isArray(state.sessions)) continue;

      const daySessions = state.sessions.filter(s => s.start >= dayStart && s.start < dayEnd);
      if (daySessions.length === 0) continue;

      const totalMs = daySessions.reduce((acc, s) => {
        return acc + ((s.end ?? Date.now()) - s.start);
      }, 0);

      const lastStart = Math.max(...daySessions.map(s => s.start));

      groups.push({
        boardCardId,
        issueTitle: state.issueTitle || state.issueRef || boardCardId,
        issueRef:   state.issueRef   || null,
        totalMs,
        lastStart,
        sessions: daySessions,
      });
    }

    // Most recently worked on first
    groups.sort((a, b) => b.lastStart - a.lastStart);

    return groups;
  },
};
