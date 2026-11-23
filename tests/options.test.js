import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/options.js', import.meta.url), 'utf8');

async function createOptions() {
  const elements = new Map();
  function element() {
    return {
      checked: false, disabled: false, hidden: false, value: '', textContent: '',
      listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; },
      appendChild() {},
      replaceChildren() {},
    };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
  };
  let ahead = true;
  let behind = true;
  let failSave = false;
  let onChanged;
  const Settings = {
    DAYS: [],
    ready: Promise.resolve(),
    shouldOpenPip: () => false,
    shouldKeepPipOpen: () => false,
    shouldShowAheadPace: () => ahead,
    shouldShowBehindPace: () => behind,
    shouldShowFocusReminder: () => true,
    shouldPlayFocusReminder: () => true,
    getFocusReminderIntervalMinutes: () => 1,
    getFocusGoal: () => ({ enabled: true, hours: 4 }),
    getWeeklySchedule: () => ({}),
    getScheduleTotals: () => ({ dailyMinutes: {}, weeklyMinutes: 0 }),
    async setFocusPaceAheadEnabled(value) {
      if (failSave) throw new Error('storage error');
      ahead = value;
    },
    async setFocusPaceBehindEnabled(value) {
      if (failSave) throw new Error('storage error');
      behind = value;
    },
  };
  const chrome = { storage: { onChanged: { addListener(listener) { onChanged = listener; } } } };
  vm.runInNewContext(source, { document, Settings, chrome, console: { error() {} } });
  await new Promise(resolve => setImmediate(resolve));
  return {
    get: id => elements.get(id),
    failSave() { failSave = true; },
    externalBehindChange(value) {
      behind = value;
      onChanged({ focusPaceBehindEnabled: { newValue: value } }, 'local');
    },
  };
}

test('settings sections show only their own controls without changing preferences', async () => {
  const options = await createOptions();
  const ids = ['pip-section', 'focus-goal-section', 'work-schedule-section',
    'focus-comparison-section', 'focus-reminders-section'];
  const visibility = () => ids.map(id => !options.get(id).hidden);
  assert.deepEqual(visibility(), [true, false, false, false, false]);
  const choose = value => options.get('settings-section').listeners.change({ target: { value } });
  choose('workday');
  assert.deepEqual(visibility(), [false, true, true, false, false]);
  choose('pace');
  assert.deepEqual(visibility(), [false, false, false, true, true]);
  assert.equal(options.get('focus-pace-ahead').checked, true);
  assert.equal(options.get('focus-pace-behind').checked, true);
  assert.equal(options.get('focus-reminder-sound').checked, true);
  choose('general');
  assert.deepEqual(visibility(), [true, false, false, false, false]);
});

test('pace indicator choices are independent, saved, and restored on failure', async () => {
  const options = await createOptions();
  const ahead = options.get('focus-pace-ahead');
  const behind = options.get('focus-pace-behind');
  assert.equal(ahead.checked, true);
  assert.equal(behind.checked, true);
  ahead.checked = false;
  await ahead.listeners.change();
  assert.equal(ahead.checked, false);
  assert.equal(behind.checked, true);
  options.externalBehindChange(false);
  assert.equal(behind.checked, false);
  assert.equal(ahead.checked, false);
  assert.equal(behind.checked, false);
  options.failSave();
  behind.checked = true;
  await behind.listeners.change();
  assert.equal(behind.checked, false);
  assert.equal(options.get('save-status').textContent, 'Unable to save pace indicator setting.');
});
