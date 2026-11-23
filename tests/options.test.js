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
  const savedSchedules = [];
  let renderedSchedule;
  let pendingScheduleSave;
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
    getFocusReminderIntervalMinutes: () => 2,
    getFocusGoal: () => ({ enabled: true, hours: 4 }),
    getWeeklySchedule: () => ({}),
    getScheduleTotals: () => ({ dailyMinutes: {}, weeklyMinutes: 0 }),
    validateWeeklySchedule(schedule) {
      return schedule.monday?.some(interval => !interval.start || !interval.end)
        ? 'Set both start and end times for Monday.'
        : null;
    },
    async setWeeklySchedule(schedule) {
      if (failSave) throw new Error('storage error');
      if (pendingScheduleSave) {
        const pending = pendingScheduleSave;
        pendingScheduleSave = null;
        await pending;
      }
      savedSchedules.push(structuredClone(schedule));
    },
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
  const context = vm.createContext({ document, Settings, chrome, console: { error() {} } });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {
    get: id => elements.get(id),
    savedSchedules,
    get renderedSchedule() { return renderedSchedule; },
    setSchedule(schedule) {
      Settings.DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        .map(key => ({ key }));
      context.readScheduleFromForm = () => structuredClone(schedule);
      context.renderSchedule = value => { renderedSchedule = value; };
      context.updateScheduleTotals = () => {};
    },
    deferNextScheduleSave() {
      let release;
      pendingScheduleSave = new Promise(resolve => { release = resolve; });
      return release;
    },
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

test('copies Monday intervals to every other day and allows independent edits', async () => {
  const options = await createOptions();
  const monday = [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }];
  options.setSchedule({ monday, tuesday: [{ start: '10:00', end: '11:00' }], sunday: [] });
  await options.get('copy-schedule').listeners.click();

  const schedule = options.savedSchedules[0];
  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
    assert.deepEqual(schedule[day], monday);
  }
  options.renderedSchedule.tuesday[0].start = '08:00';
  assert.equal(options.renderedSchedule.monday[0].start, '09:00');
  assert.equal(options.renderedSchedule.wednesday[0].start, '09:00');
  assert.match(options.get('save-status').textContent, /copied.*saved/i);
});

test('does not replace other days when Monday is invalid or saving fails', async () => {
  const options = await createOptions();
  options.setSchedule({ monday: [{ start: '', end: '17:00' }], tuesday: [{ start: '10:00', end: '11:00' }] });
  await options.get('copy-schedule').listeners.click();
  assert.equal(options.savedSchedules.length, 0);
  assert.equal(options.renderedSchedule, undefined);
  assert.match(options.get('save-status').textContent, /Monday/);

  options.setSchedule({ monday: [{ start: '09:00', end: '17:00' }], tuesday: [{ start: '10:00', end: '11:00' }] });
  options.failSave();
  await options.get('copy-schedule').listeners.click();
  assert.equal(options.savedSchedules.length, 0);
  assert.equal(options.renderedSchedule, undefined);
  assert.match(options.get('save-status').textContent, /Unable to save/);
  assert.equal(options.get('copy-schedule').disabled, false);
});

test('copy is saved after an earlier in-flight schedule edit', async () => {
  const options = await createOptions();
  options.setSchedule({
    monday: [{ start: '09:00', end: '17:00' }],
    tuesday: [{ start: '10:00', end: '11:00' }],
  });
  const release = options.deferNextScheduleSave();
  options.get('weekly-schedule').listeners.change();
  const copying = options.get('copy-schedule').listeners.click();
  await Promise.resolve();
  assert.equal(options.savedSchedules.length, 0);
  release();
  await copying;
  assert.equal(options.savedSchedules.length, 2);
  assert.equal(options.savedSchedules[0].tuesday[0].start, '10:00');
  assert.equal(options.savedSchedules[1].tuesday[0].start, '09:00');
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
