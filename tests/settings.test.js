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
    settings: vm.runInContext('Settings', context),
    notifyChanged(changes, areaName = 'local') {
      listeners.forEach(listener => listener(changes, areaName));
    },
  };
}

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
