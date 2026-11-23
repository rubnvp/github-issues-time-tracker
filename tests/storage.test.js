import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/storage.js', import.meta.url), 'utf8');

function createStorage(entries) {
  const data = new Map(Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)]));
  const context = vm.createContext({
    localStorage: {
      get length() { return data.size; },
      key: index => [...data.keys()][index],
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
    },
  });
  vm.runInContext(source, context);
  return vm.runInContext('Storage', context);
}

test('daily focus sums all issues, including outside work hours and sessions crossing midnight', () => {
  const timestamp = (day, hour, minute = 0) => new Date(2026, 0, day, hour, minute).getTime();
  const storage = createStorage({
    'gitt:first': { sessions: [
      { start: timestamp(4, 23), end: timestamp(5, 1) },
      { start: timestamp(5, 7), end: timestamp(5, 8) },
    ] },
    'gitt:second': { sessions: [{ start: timestamp(5, 14), end: null }] },
    'gitt:old': { sessions: [{ start: timestamp(4, 9), end: timestamp(4, 10) }] },
    'gitt:future': { sessions: [{ start: timestamp(6, 9), end: timestamp(6, 10) }] },
    unrelated: { sessions: [{ start: timestamp(5, 10), end: timestamp(5, 12) }] },
  });

  assert.equal(storage.getDailyFocusMs(new Date(timestamp(5, 14, 30))), 2.5 * 3600000);
  assert.equal(storage.getDailyFocusMs(new Date(timestamp(5, 14, 31))), 2.5 * 3600000 + 60000);
});

test('daily focus resets at local midnight even while a session continues', () => {
  const storage = createStorage({
    'gitt:ongoing': { sessions: [
      { start: new Date(2026, 0, 5, 23).getTime(), end: null },
    ] },
  });

  assert.equal(storage.getDailyFocusMs(new Date(2026, 0, 6, 0)), 0);
  assert.equal(storage.getDailyFocusMs(new Date(2026, 0, 6, 0, 30)), 1800000);
});

test('invalid timer state is not silently replaced with empty sessions', () => {
  const storage = createStorage({ 'gitt:issue': { totalMs: 1000 } });
  assert.throws(() => storage.load('issue'), /Invalid timer state/);
});

test('personal why is stored with timer state without changing its sessions', () => {
  const storage = createStorage({
    'gitt:issue': {
      issueRef: 'owner/repo/issues/12',
      sessions: [{ start: 100, end: 200 }],
    },
  });

  storage.saveWhy('issue', '  Help users recover access  ');
  assert.equal(storage.load('issue').why, 'Help users recover access');
  assert.equal(storage.load('issue').sessions.length, 1);
  storage.saveWhy('issue', '');
  assert.equal(storage.load('issue').why, null);
});

test('first-start why suggestion is one-time and only for cards without session history', () => {
  const storage = createStorage({
    'gitt:worked': { sessions: [{ start: 100, end: 200 }] },
    'gitt:has-why': { sessions: [], why: 'Help users', whyPrompted: false },
    'gitt:already-prompted': { sessions: [], whyPrompted: true },
  });

  assert.equal(storage.shouldSuggestWhy('new'), true);
  assert.equal(storage.shouldSuggestWhy('new'), false);
  assert.equal(storage.shouldSuggestWhy('worked'), false);
  assert.equal(storage.shouldSuggestWhy('has-why'), false);
  assert.equal(storage.shouldSuggestWhy('already-prompted'), false);
});

test('daily history includes the personal why for each issue group', () => {
  const storage = createStorage({
    'gitt:issue': {
      issueTitle: 'Improve keyboard navigation',
      why: 'Make the board usable without a mouse',
      sessions: [{ start: Date.now(), end: null }],
    },
  });

  const [group] = storage.getDailySessions();
  assert.equal(group.issueTitle, 'Improve keyboard navigation');
  assert.equal(group.why, 'Make the board usable without a mouse');
});
