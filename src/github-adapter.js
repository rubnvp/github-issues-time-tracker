// ─── GitHubAdapter ────────────────────────────────────────────────────────────
// Single source of truth for all GitHub DOM selectors.
// When GitHub changes its markup, only this file needs updating.
//
// Rule: no other file may contain a raw CSS selector or href pattern.

const GitHubAdapter = {

  // ── URL heuristics ─────────────────────────────────────────────────────────

  isIssueUrl(url) {
    return /\/issues\/\d+/.test(url);
  },

  parseIssueRef(url) {
    const match = url.match(/github\.com\/(.+\/issues\/\d+)/);
    return match ? match[1] : null;
  },

  // ── Board ──────────────────────────────────────────────────────────────────

  getBoardContainer() {
    return document.querySelector('[data-hpc="true"]');
  },

  // ── Cards ──────────────────────────────────────────────────────────────────

  getAllCards() {
    return document.querySelectorAll('[data-board-card-id]');
  },

  getCardId(card) {
    return card.getAttribute('data-board-card-id');
  },

  // ── Card internals ─────────────────────────────────────────────────────────

  getIssueLink(card) {
    return card.querySelector('a[href*="/issues/"]');
  },

  getIssueTitle(card) {
    return card.querySelector('h3 span')?.textContent?.trim() ?? 'Issue';
  },

  getFieldsAnchor(card) {
    return card.querySelector('ul[aria-label="Fields"]');
  },
};
