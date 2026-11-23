import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/options.js', import.meta.url), 'utf8');

async function createOptions(comparisonEnabled) {
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
  let enabled = comparisonEnabled;
  let failSave = false;
  let onChanged;
  const Settings = {
    DAYS: [],
    ready: Promise.resolve(),
    shouldOpenPip: () => false,
    shouldKeepPipOpen: () => false,
    shouldCompareFocusPace: () => enabled,
    shouldShowFocusReminder: () => true,
    shouldPlayFocusReminder: () => true,
    getFocusReminderIntervalMinutes: () => 1,
    getFocusGoal: () => ({ enabled: true, hours: 4 }),
    getWeeklySchedule: () => ({}),
    getScheduleTotals: () => ({ dailyMinutes: {}, weeklyMinutes: 0 }),
    async setFocusPaceComparisonEnabled(value) {
      if (failSave) throw new Error('storage error');
      enabled = value;
    },
  };
  const chrome = { storage: { onChanged: { addListener(listener) { onChanged = listener; } } } };
  vm.runInNewContext(source, { document, Settings, chrome, console: { error() {} } });
  await new Promise(resolve => setImmediate(resolve));
  return {
    get: id => elements.get(id),
    failSave() { failSave = true; },
    externalChange(value) {
      enabled = value;
      onChanged({ focusPaceComparisonEnabled: { newValue: value } }, 'local');
    },
  };
}

test('pace controls reflect saved and external changes without changing reminder choices', async () => {
  const options = await createOptions(false);
  const comparison = options.get('focus-pace-comparison');
  const reminders = options.get('focus-reminder-controls');
  const notice = options.get('focus-reminders-disabled');
  assert.equal(comparison.checked, false);
  assert.equal(reminders.disabled, true);
  assert.equal(notice.hidden, false);
  assert.equal(options.get('focus-reminder-visual').checked, true);
  assert.equal(options.get('focus-reminder-sound').checked, true);

  comparison.checked = true;
  await comparison.listeners.change();
  assert.equal(reminders.disabled, false);
  assert.equal(notice.hidden, true);
  options.externalChange(false);
  assert.equal(comparison.checked, false);
  assert.equal(reminders.disabled, true);
  assert.equal(options.get('focus-reminder-sound').checked, true);

  options.failSave();
  comparison.checked = true;
  await comparison.listeners.change();
  assert.equal(comparison.checked, false);
  assert.equal(reminders.disabled, true);
  assert.equal(options.get('save-status').textContent, 'Unable to save focus pace setting.');
});
