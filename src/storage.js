// ─── Storage ──────────────────────────────────────────────────────────────────
// Persists and loads timer state via localStorage.
// Key format: "time_tracker_owner/repo/issues/123"

const Storage = {
  PREFIX: 'time_tracker_',

  load(issueId) {
    const raw = localStorage.getItem(this.PREFIX + issueId);
    if (!raw) return { totalMs: 0, lastStart: null, running: false };
    try { return JSON.parse(raw); } catch { return { totalMs: 0, lastStart: null, running: false }; }
  },

  save(issueId, state) {
    localStorage.setItem(this.PREFIX + issueId, JSON.stringify(state));
  },
};
