import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const settingsSource = await readFile(new URL('../src/settings.js', import.meta.url), 'utf8');

function createSettings(initialData = {}) {
  const data = structuredClone(initialData);
  const listeners = [];
  const chrome = {
    storage: {
      local: {
        async get(defaults) {
          return { ...structuredClone(defaults), ...structuredClone(data) };
        },
        async set(values) {
          const changes = {};
          for (const [key, newValue] of Object.entries(values)) {
            changes[key] = { oldValue: data[key], newValue: structuredClone(newValue) };
            data[key] = structuredClone(newValue);
          }
          listeners.forEach(listener => listener(changes, 'local'));
        },
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    },
  };
  const context = vm.createContext({ chrome });
  vm.runInContext(settingsSource, context);

  return {
    data,
    settings: vm.runInContext('Settings', context),
    notifyChanged(changes, areaName = 'local') {
      listeners.forEach(listener => listener(changes, areaName));
    },
  };
}

test('focus goal defaults to two hours without overwriting a saved goal', async () => {
  const fresh = createSettings();
  await fresh.settings.ready;
  assert.equal(fresh.settings.getFocusGoal().hours, 2);
  assert.equal(fresh.settings.getFocusGoal().enabled, false);

  const existing = createSettings({ focusGoal: { enabled: true, hours: 4 } });
  await existing.settings.ready;
  assert.equal(existing.settings.getFocusGoal().hours, 4);
  existing.notifyChanged({ focusGoal: { newValue: undefined } });
  assert.equal(existing.settings.getFocusGoal().hours, 2);
});

test('daily progress counts scheduled time and pauses during schedule gaps', async () => {
  const { settings } = createSettings();
  await settings.ready;
  await settings.setWeeklySchedule({
    monday: [
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
  });

  assert.equal(settings.getDailyProgress(new Date(2026, 0, 5, 8, 0)), 0);
  assert.equal(settings.getDailyProgress(new Date(2026, 0, 5, 10, 30)), 1.5 / 7);
  assert.equal(settings.getDailyProgress(new Date(2026, 0, 5, 12, 30)), 3 / 7);
  assert.equal(settings.getDailyProgress(new Date(2026, 0, 5, 18, 0)), 1);
  assert.equal(settings.getDailyProgress(new Date(2026, 0, 6, 10, 0)), null);
});

test('daily progress follows schedule changes from another extension page', async () => {
  const { settings, notifyChanged } = createSettings();
  await settings.ready;
  notifyChanged({
    weeklySchedule: {
      newValue: {
        monday: [{ start: '10:00', end: '12:00' }],
      },
    },
  });

  assert.equal(settings.getDailyProgress(new Date(2026, 0, 5, 11, 0)), 0.5);
});

test('work intervals must be valid, ordered, and stay within the same day', async () => {
  const { settings } = createSettings();
  await settings.ready;

  assert.equal(settings.validateWeeklySchedule({
    monday: [
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
  }), null);
  assert.match(settings.validateWeeklySchedule({
    monday: [
      { start: '09:00', end: '12:00' },
      { start: '11:00', end: '17:00' },
    ],
  }), /cannot overlap/);
  assert.match(settings.validateWeeklySchedule({
    monday: [{ start: '22:00', end: '02:00' }],
  }), /must end after it starts/);
});

test('schedule totals sum daily intervals and the week without counting gaps', async () => {
  const { settings } = createSettings();
  await settings.ready;
  const { dailyMinutes, weeklyMinutes } = settings.getScheduleTotals({
    monday: [
      { start: '09:00', end: '12:30' },
      { start: '14:00', end: '17:15' },
    ],
    tuesday: [{ start: '08:00', end: '16:00' }],
  });

  assert.equal(dailyMinutes.monday, 405);
  assert.equal(dailyMinutes.tuesday, 480);
  assert.equal(dailyMinutes.sunday, 0);
  assert.equal(weeklyMinutes, 885);
});

test('schedule totals flag invalid days rather than showing misleading totals', async () => {
  const { settings } = createSettings();
  await settings.ready;

  for (const intervals of [
    [{ start: '', end: '12:00' }],
    [{ start: '17:00', end: '09:00' }],
    [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '13:00' }],
  ]) {
    const totals = settings.getScheduleTotals({
      monday: intervals,
      tuesday: [{ start: '09:00', end: '10:00' }],
    });
    assert.equal(totals.dailyMinutes.monday, null);
    assert.equal(totals.dailyMinutes.tuesday, 60);
    assert.equal(totals.weeklyMinutes, null);
  }
});

test('daily timeline preserves proportional work intervals and gaps while work progress pauses', async () => {
  const { settings } = createSettings();
  await settings.ready;
  await settings.setWeeklySchedule({
    monday: [
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
  });

  const firstBreakTime = new Date(2026, 0, 5, 12, 15);
  const secondBreakTime = new Date(2026, 0, 5, 12, 45);
  const timeline = settings.getDailyTimeline(firstBreakTime);
  assert.deepEqual(JSON.parse(JSON.stringify(timeline.segments)), [
    { start: 0, end: 3 / 8, label: '09:00 - 12:00' },
    { start: 4 / 8, end: 1, label: '13:00 - 17:00' },
  ]);
  assert.equal(timeline.position, 3.25 / 8);
  assert.equal(settings.getDailyTimeline(secondBreakTime).position, 3.75 / 8);
  assert.equal(settings.getDailyProgress(firstBreakTime), 3 / 7);
  assert.equal(settings.getDailyProgress(secondBreakTime), 3 / 7);
  assert.equal(settings.getDailyTimeline(new Date(2026, 0, 5, 8, 0)).position, 0);
  assert.equal(settings.getDailyTimeline(new Date(2026, 0, 5, 18, 0)).position, 1);
  assert.equal(settings.getDailyTimeline(new Date(2026, 0, 6, 12, 0)), null);
});

test('focus goal compares all daily focus against workday pace and freezes expected focus in gaps', async () => {
  const { settings } = createSettings();
  await settings.ready;
  assert.equal(settings.getFocusProgress(0), null);
  await settings.setFocusGoal({ enabled: true, hours: 4 });
  await settings.setWeeklySchedule({
    monday: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }],
  });

  const now = new Date(2026, 0, 5, 13, 30);
  const behind = settings.getFocusProgress(1.5 * 3600000, now);
  assert.equal(behind.progress, 0.375);
  assert.equal(behind.expectedProgress, 0.5);
  assert.equal(behind.differenceMs, -1800000);
  assert.equal(settings.getFocusProgress(2 * 3600000, now).differenceMs, 0);
  assert.equal(settings.getFocusProgress(2.5 * 3600000, now).differenceMs, 1800000);
  assert.equal(settings.getFocusProgress(0, new Date(2026, 0, 5, 13, 45)).expectedProgress, 0.5);
  assert.equal(settings.getFocusProgress(0, new Date(2026, 0, 5, 8)).expectedProgress, 0);
  assert.equal(settings.getFocusProgress(0, new Date(2026, 0, 5, 19)).expectedProgress, 1);
  const exceeded = settings.getFocusProgress(5 * 3600000, new Date(2026, 0, 5, 19));
  assert.equal(exceeded.progress, 1);
  assert.equal(exceeded.focusMs, 5 * 3600000);
  assert.equal(exceeded.differenceMs, 3600000);
  const unscheduled = settings.getFocusProgress(3600000, new Date(2026, 0, 6, 12));
  assert.equal(unscheduled.progress, 0.25);
  assert.equal(unscheduled.expectedProgress, null);
  assert.equal(unscheduled.differenceMs, null);
});

test('focus goal persists fractional hours, reacts to settings changes, and rejects invalid goals', async () => {
  const { settings, notifyChanged } = createSettings({
    focusGoal: { enabled: true, hours: 4 },
  });
  await settings.ready;
  assert.equal(settings.getFocusGoal().hours, 4);
  await settings.setFocusGoal({ enabled: true, hours: 3.5 });
  assert.equal(settings.getFocusProgress(3600000).goalMs, 3.5 * 3600000);
  for (const hours of [0, -1, NaN, Infinity]) {
    await assert.rejects(settings.setFocusGoal({ enabled: true, hours }), /positive number/);
  }
  notifyChanged({ focusGoal: { newValue: { enabled: false, hours: 3.5 } } });
  assert.equal(settings.getFocusProgress(3600000), null);
});

test('pace comparison can be disabled without changing the focus goal or workday progress', async () => {
  const { settings, data, notifyChanged } = createSettings({
    focusGoal: { enabled: true, hours: 4 },
    weeklySchedule: { monday: [{ start: '09:00', end: '17:00' }] },
  });
  await settings.ready;
  const now = new Date(2026, 0, 5, 11);
  assert.equal(settings.shouldCompareFocusPace(), true);
  assert.equal(settings.getFocusProgress(0, now).differenceMs, -3600000);
  await settings.setFocusPaceComparisonEnabled(false);
  assert.equal(data.focusPaceComparisonEnabled, false);
  const focus = settings.getFocusProgress(3600000, now);
  assert.equal(focus.progress, 0.25);
  assert.equal(focus.comparisonEnabled, false);
  assert.equal(focus.expectedProgress, null);
  assert.equal(focus.differenceMs, null);
  assert.equal(settings.getDailyProgress(now), 0.25);
  assert.equal(settings.getDailyTimeline(now).position, 0.25);
  notifyChanged({ focusPaceComparisonEnabled: { newValue: true } });
  assert.equal(settings.getFocusProgress(0, now).differenceMs, -3600000);
});

test('work-time reminders exclude breaks, workday end, and unscheduled days', async () => {
  const { settings } = createSettings();
  await settings.ready;
  await settings.setWeeklySchedule({
    monday: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
  });

  assert.equal(settings.isWorkTime(new Date(2026, 0, 5, 8, 59, 59)), false);
  assert.equal(settings.isWorkTime(new Date(2026, 0, 5, 9)), true);
  assert.equal(settings.isWorkTime(new Date(2026, 0, 5, 11, 59, 59)), true);
  assert.equal(settings.isWorkTime(new Date(2026, 0, 5, 12)), false);
  assert.equal(settings.isWorkTime(new Date(2026, 0, 5, 13)), true);
  assert.equal(settings.isWorkTime(new Date(2026, 0, 5, 17)), false);
  assert.equal(settings.isWorkTime(new Date(2026, 0, 6, 10)), false);
});

test('previously inactive features use their saved settings regardless of the old usage level', async () => {
  for (const usageProfile of ['basic', 'support', 'tracking']) {
    const { settings, data, notifyChanged } = createSettings({
      usageProfile,
      focusGoal: { enabled: true, hours: 4 },
      focusReminderSoundEnabled: true,
      weeklySchedule: { monday: [{ start: '09:00', end: '17:00' }] },
    });
    await settings.ready;
    const now = new Date(2026, 0, 5, 11);
    assert.equal(settings.getDailyProgress(now), 0.25);
    assert.equal(settings.getFocusProgress(0, now).differenceMs, -3600000);
    assert.equal(settings.isWorkTime(now), true);
    assert.equal(settings.shouldPlayFocusReminder(), true);
    notifyChanged({ usageProfile: { newValue: 'basic' } });
    assert.equal(settings.getDailyProgress(now), 0.25);
    assert.equal(data.weeklySchedule.monday[0].start, '09:00');
    assert.equal(data.focusGoal.hours, 4);
  }
});

test('reminder interval persists, follows live changes, and rejects invalid minutes', async () => {
  const { settings, data, notifyChanged } = createSettings({ focusReminderIntervalMinutes: 3 });
  await settings.ready;
  assert.equal(settings.getFocusReminderIntervalMinutes(), 3);
  await settings.setFocusReminderIntervalMinutes(2);
  assert.equal(data.focusReminderIntervalMinutes, 2);
  for (const minutes of [0, -1, 1.5, NaN, Infinity, '2', Number.MAX_VALUE]) {
    await assert.rejects(settings.setFocusReminderIntervalMinutes(minutes), /whole number/);
  }
  assert.equal(data.focusReminderIntervalMinutes, 2);
  notifyChanged({ focusReminderIntervalMinutes: { newValue: 4 } });
  assert.equal(settings.getFocusReminderIntervalMinutes(), 4);
  notifyChanged({ focusReminderIntervalMinutes: { newValue: undefined } });
  assert.equal(settings.getFocusReminderIntervalMinutes(), 1);
});
