// ─── Settings ────────────────────────────────────────────────────────────────
// Shared extension preferences, available to the options page and content scripts.

const Settings = (() => {
  const DAYS = [
    { key: 'monday', label: 'Monday', dateIndex: 1 },
    { key: 'tuesday', label: 'Tuesday', dateIndex: 2 },
    { key: 'wednesday', label: 'Wednesday', dateIndex: 3 },
    { key: 'thursday', label: 'Thursday', dateIndex: 4 },
    { key: 'friday', label: 'Friday', dateIndex: 5 },
    { key: 'saturday', label: 'Saturday', dateIndex: 6 },
    { key: 'sunday', label: 'Sunday', dateIndex: 0 },
  ];

  let autoPipEnabled = false;
  let weeklySchedule = createEmptySchedule();

  function createEmptySchedule() {
    return Object.fromEntries(DAYS.map(({ key }) => [key, []]));
  }

  function normalizeSchedule(schedule) {
    return Object.fromEntries(DAYS.map(({ key }) => {
      const intervals = Array.isArray(schedule?.[key]) ? schedule[key] : [];
      return [key, intervals
        .filter(interval => typeof interval?.start === 'string' && typeof interval?.end === 'string')
        .map(({ start, end }) => ({ start, end }))];
    }));
  }

  function cloneSchedule(schedule) {
    return Object.fromEntries(DAYS.map(({ key }) => [
      key,
      schedule[key].map(interval => ({ ...interval })),
    ]));
  }

  function timeToSeconds(value) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 : null;
  }

  function validateWeeklySchedule(schedule) {
    for (const day of DAYS) {
      const intervals = Array.isArray(schedule?.[day.key]) ? schedule[day.key] : [];
      let previousEnd = -1;

      for (const interval of intervals) {
        if (!interval?.start || !interval?.end) {
          return `Set both start and end times for ${day.label}, or remove the empty interval.`;
        }

        const start = timeToSeconds(interval.start);
        const end = timeToSeconds(interval.end);
        if (start === null || end === null) return `Enter valid 24-hour times for ${day.label}.`;
        if (end <= start) return `Each ${day.label} interval must end after it starts.`;
        if (start < previousEnd) return `${day.label} intervals cannot overlap or be out of order.`;
        previousEnd = end;
      }
    }

    return null;
  }

  const ready = chrome.storage.local.get({
    autoPipEnabled: false,
    weeklySchedule: createEmptySchedule(),
  }).then((settings) => {
    autoPipEnabled = settings.autoPipEnabled === true;
    weeklySchedule = normalizeSchedule(settings.weeklySchedule);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.autoPipEnabled) autoPipEnabled = changes.autoPipEnabled.newValue === true;
    if (changes.weeklySchedule) weeklySchedule = normalizeSchedule(changes.weeklySchedule.newValue);
  });

  return {
    DAYS,
    ready,

    shouldOpenPip() {
      return autoPipEnabled;
    },

    getWeeklySchedule() {
      return cloneSchedule(weeklySchedule);
    },

    getScheduleTotals(schedule) {
      const dailyMinutes = {};
      for (const { key } of DAYS) {
        const intervals = schedule[key] || [];
        dailyMinutes[key] = validateWeeklySchedule({ [key]: intervals })
          ? null
          : intervals.reduce((total, { start, end }) =>
            total + (timeToSeconds(end) - timeToSeconds(start)) / 60, 0);
      }

      const totals = Object.values(dailyMinutes);
      return {
        dailyMinutes,
        weeklyMinutes: totals.includes(null) ? null : totals.reduce((total, minutes) => total + minutes, 0),
      };
    },

    getScheduleForDate(date = new Date()) {
      const day = DAYS.find(({ dateIndex }) => dateIndex === date.getDay());
      return weeklySchedule[day.key].map(interval => ({ ...interval }));
    },

    getDailyTimeline(date = new Date()) {
      const intervals = this.getScheduleForDate(date);
      if (intervals.length === 0) return null;

      const firstStart = timeToSeconds(intervals[0].start);
      const lastEnd = timeToSeconds(intervals.at(-1).end);
      const duration = lastEnd - firstStart;
      const nowSeconds = date.getHours() * 3600 + date.getMinutes() * 60 +
        date.getSeconds() + date.getMilliseconds() / 1000;

      return {
        position: Math.max(0, Math.min(1, (nowSeconds - firstStart) / duration)),
        segments: intervals.map(({ start, end }) => ({
          start: (timeToSeconds(start) - firstStart) / duration,
          end: (timeToSeconds(end) - firstStart) / duration,
          label: `${start} - ${end}`,
        })),
      };
    },

    getDailyProgress(date = new Date()) {
      const intervals = this.getScheduleForDate(date);
      if (intervals.length === 0) return null;

      const nowSeconds =
        date.getHours() * 3600 +
        date.getMinutes() * 60 +
        date.getSeconds() +
        date.getMilliseconds() / 1000;

      let totalSeconds = 0;
      let elapsedSeconds = 0;
      for (const { start, end } of intervals) {
        const startSeconds = timeToSeconds(start);
        const endSeconds = timeToSeconds(end);
        if (startSeconds === null || endSeconds === null) continue;
        if (endSeconds <= startSeconds) continue;

        totalSeconds += endSeconds - startSeconds;
        elapsedSeconds += Math.max(0, Math.min(nowSeconds, endSeconds) - startSeconds);
      }

      return totalSeconds === 0 ? null : Math.min(1, elapsedSeconds / totalSeconds);
    },

    validateWeeklySchedule,

    async setAutoPipEnabled(enabled) {
      await chrome.storage.local.set({ autoPipEnabled: enabled });
      autoPipEnabled = enabled;
    },

    async setWeeklySchedule(schedule) {
      const validationError = validateWeeklySchedule(schedule);
      if (validationError) throw new Error(validationError);

      const normalizedSchedule = normalizeSchedule(schedule);
      await chrome.storage.local.set({ weeklySchedule: normalizedSchedule });
      weeklySchedule = normalizedSchedule;
    },
  };
})();
