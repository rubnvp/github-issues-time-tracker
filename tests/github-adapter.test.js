// ─── github-adapter.test.js ───────────────────────────────────────────────────
// Tests for GitHubAdapter selectors against a real HTML fixture.
//
// SETUP REQUIRED:
//   1. Open a GitHub Projects board in Chrome
//   2. Open DevTools → Elements tab
//   3. Right-click <body> → "Copy" → "Copy outerHTML"
//   4. Paste the content into: tests/fixtures/board.html
//   5. Run: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'board.html');

// ── Fixture check ─────────────────────────────────────────────────────────────

if (!existsSync(FIXTURE_PATH)) {
  console.error(`
┌─────────────────────────────────────────────────────────────┐
│                  MISSING FIXTURE FILE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  tests/fixtures/board.html not found.                       │
│                                                             │
│  To generate it:                                            │
│                                                             │
│  1. Open a GitHub Projects board in Chrome                  │
│  2. Open DevTools (F12) → Elements tab                      │
│  3. Right-click on <html> → Copy → Copy outerHTML           │
│  4. Paste into: tests/fixtures/board.html                   │
│  5. Run npm test again                                      │
│                                                             │
│  The file is git-ignored and must be generated locally.     │
└─────────────────────────────────────────────────────────────┘
`);
  process.exit(1);
}

// ── Load fixture ──────────────────────────────────────────────────────────────

const html = readFileSync(FIXTURE_PATH, 'utf-8');
const $ = cheerio.load(html);

// ── Helpers ───────────────────────────────────────────────────────────────────

// Mirrors GitHubAdapter methods using cheerio instead of the browser DOM
const Adapter = {
  getBoardContainer: () => $('[data-hpc="true"]').get(0) ?? null,
  getAllCards:       () => $('[data-board-card-id]').toArray(),
  getCardId:        (card) => $(card).attr('data-board-card-id'),
  getIssueLink:     (card) => $(card).find('a[href*="/issues/"]').get(0) ?? null,
  getIssueTitle:    (card) => $(card).find('h3 span').first().text().trim() || null,
  getFieldsAnchor:  (card) => $(card).find('ul[aria-label="Fields"]').get(0) ?? null,
};

// ── URL tests (no fixture needed) ─────────────────────────────────────────────

describe('GitHubAdapter — URL heuristics', () => {

  test('isIssueUrl: accepts valid issue URLs', () => {
    const valid = [
      'https://github.com/owner/repo/issues/1',
      'https://github.com/owner/repo/issues/999',
      '/owner/repo/issues/42',
    ];
    for (const url of valid) {
      assert.ok(/\/issues\/\d+/.test(url), `Expected "${url}" to match`);
    }
  });

  test('isIssueUrl: rejects non-issue URLs', () => {
    const invalid = [
      'https://github.com/owner/repo/pulls/1',
      'https://github.com/owner/repo',
      'https://github.com/owner/repo/issues',     // no number
      'https://github.com/owner/repo/issues/abc', // not a number
    ];
    for (const url of invalid) {
      assert.ok(!/\/issues\/\d+/.test(url), `Expected "${url}" NOT to match`);
    }
  });

  test('parseIssueRef: extracts owner/repo/issues/N from full URL', () => {
    const url = 'https://github.com/owner/repo/issues/42';
    const match = url.match(/github\.com\/(.+\/issues\/\d+)/);
    assert.ok(match, 'Expected a match');
    assert.equal(match[1], 'owner/repo/issues/42');
  });

  test('parseIssueRef: returns null for non-GitHub URLs', () => {
    const match = 'https://example.com/issues/1'.match(/github\.com\/(.+\/issues\/\d+)/);
    assert.equal(match, null);
  });

});

// ── DOM selector tests (require fixture) ──────────────────────────────────────

describe('GitHubAdapter — DOM selectors', () => {

  test('getBoardContainer: finds [data-hpc="true"] element', () => {
    const board = Adapter.getBoardContainer();
    assert.ok(board, 'Board container not found. GitHub may have changed the [data-hpc="true"] attribute.');
  });

  test('getAllCards: finds at least one [data-board-card-id] element', () => {
    const cards = Adapter.getAllCards();
    assert.ok(
      cards.length > 0,
      'No cards found. GitHub may have changed the [data-board-card-id] attribute on cards.'
    );
  });

  describe('per-card selectors (runs on first fully-loaded card)', () => {
    const cards = Adapter.getAllCards();
    // Some cards in the fixture may have no inner content if they weren't
    // fully rendered when the HTML was copied. Find the first one with a link.
    const card = cards.find((c) => Adapter.getIssueLink(c) !== null);

    test('getCardId: card has a non-empty data-board-card-id', () => {
      assert.ok(card, 'No card available to test.');
      const id = Adapter.getCardId(card);
      assert.ok(id && id.length > 0, 'Card ID is empty or missing.');
    });

    test('getIssueLink: finds <a href*="/issues/"> inside card', () => {
      assert.ok(card, 'No card available to test.');
      const link = Adapter.getIssueLink(card);
      assert.ok(
        link,
        'Issue link not found. GitHub may have changed the anchor structure inside cards.'
      );
      const href = $(link).attr('href');
      assert.ok(
        href?.includes('/issues/'),
        `Link href "${href}" does not contain "/issues/".`
      );
    });

    test('getIssueTitle: finds title text via h3 span', () => {
      assert.ok(card, 'No card available to test.');
      const title = Adapter.getIssueTitle(card);
      assert.ok(
        title && title.length > 0,
        'Issue title is empty. GitHub may have changed the title element from <h3><span> inside cards.'
      );
    });

    test('getFieldsAnchor: finds ul[aria-label="Fields"]', () => {
      assert.ok(card, 'No card available to test.');
      const fields = Adapter.getFieldsAnchor(card);
      assert.ok(
        fields,
        'Fields anchor not found. GitHub may have changed or removed the ul[aria-label="Fields"] element.'
      );
    });

  });

});
