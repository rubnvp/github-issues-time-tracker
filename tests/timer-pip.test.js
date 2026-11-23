import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const sources = await Promise.all(['settings', 'storage', 'pip', 'timer'].map(name =>
  readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8')));

class Element {
  constructor() {
    this.children = [];
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
  }

  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
}

async function createHarness(keepPipOpen = true, playReminder = () => Promise.resolve()) {
  let now = new Date(2026, 0, 5, 11).getTime();
  let nextInterval = 0;
  const intervals = new Map();
  const timeouts = new Map();
  const errors = [];
  const localData = new Map();
  const extensionData = {
    keepPipOpen,
    focusReminderVisualEnabled: true,
    focusGoal: { enabled: true, hours: 4 },
    weeklySchedule: {
      monday: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }],
    },
  };
  const windows = [];
  let reminders = 0;
  const pictureInPicture = {
    async requestWindow() {
      const listeners = new Map();
      const window = {
        closed: false,
        document: {
          body: new Element(), head: new Element(),
          createElement: () => new Element(), createElementNS: () => new Element(),
        },
        addEventListener(name, callback) { listeners.set(name, callback); },
        close() { this.closed = true; listeners.get('pagehide')?.(); },
      };
      windows.push(window);
      return window;
    },
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: Clock,
    window: { screen: { availWidth: 1440 }, documentPictureInPicture: pictureInPicture },
    documentPictureInPicture: pictureInPicture,
    document: {
      querySelector: selector => ({ issueTitle: selector.includes('second') ? 'Second issue' : 'First issue' }),
    },
    chrome: {
      storage: {
        local: {
          get: async defaults => ({ ...defaults, ...extensionData }),
          set: async values => Object.assign(extensionData, values),
        },
        onChanged: { addListener() {} },
      },
      runtime: { sendMessage() {}, onMessage: { addListener() {} } },
    },
    localStorage: {
      get length() { return localData.size; },
      key: index => [...localData.keys()][index],
      getItem: key => localData.get(key) ?? null,
      setItem: (key, value) => localData.set(key, value),
    },
    setInterval(callback) { intervals.set(++nextInterval, callback); return nextInterval; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback) { timeouts.set(++nextInterval, callback); return nextInterval; },
    clearTimeout(id) { timeouts.delete(id); },
    console: { error(...args) { errors.push(args); } },
    GitHubAdapter: { getIssueTitle: card => card.issueTitle },
    Injector: { _extractIssueRef: () => null },
    FloatingBar: { show() {}, hide() {} },
    Sounds: { play() {}, stop() {}, remind() { reminders += 1; return playReminder(); } },
  });
  sources.forEach(source => vm.runInContext(source, context));
  const settings = vm.runInContext('Settings', context);
  await settings.ready;

  return {
    timer: vm.runInContext('Timer', context),
    pip: vm.runInContext('PiP', context),
    storage: vm.runInContext('Storage', context),
    settings,
    windows,
    intervals,
    timeouts,
    errors,
    get reminders() { return reminders; },
    setTime(hour, minute = 0, second = 0) { now = new Date(2026, 0, 5, hour, minute, second).getTime(); },
    tick() { [...intervals.values()].forEach(callback => callback()); },
    finishTimeouts() {
      const callbacks = [...timeouts.values()];
      timeouts.clear();
      callbacks.forEach(callback => callback());
    },
  };
}

test('persistent PiP pauses without tracking focus, reminds only during work hours, and resumes', async () => {
  const h = await createHarness();
  let renders = 0;
  h.timer.registerRenderer('first', () => { renders += 1; });
  h.timer.start('first');
  await h.pip.open('first');
  const window = h.windows[0];
  const { body } = window.document;
  const button = body.children.find(el => el.className === 'pause-btn');
  const time = body.children.find(el => el.className === 'time');
  const mascot = body.children.find(el => el.className === 'mascot');
  const stack = body.children.find(el => el.className === 'progress-stack');
  const dayLabel = stack.children.find(el => el.className === 'progress').children[1];
  const click = () => button.listeners.get('click')();

  assert.equal(body.attributes.get('data-focus-reminder'), 'false');
  assert.equal(mascot.title, 'Focusing');
  assert.equal(mascot.children[0].attributes.get('aria-hidden'), 'true');
  assert.equal(dayLabel.textContent, '25.00%');
  h.setTime(11, 1);
  click();
  assert.equal(h.pip.isOpen(), true);
  assert.equal(h.timer._intervals.size, 0);
  assert.equal(body.attributes.get('data-timer-running'), 'false');
  assert.equal(mascot.title, 'Paused - behind focus goal. Resume focus.');
  assert.equal(time.textContent, 'Paused');
  assert.equal(button.title, 'Resume timer');
  assert.equal(body.attributes.get('data-focus-reminder'), 'true');
  assert.equal(dayLabel.textContent, '25.21%');
  assert.equal(h.storage.isRunning(h.storage.load('first')), false);

  h.setTime(11, 30);
  h.tick();
  assert.equal(h.storage.getDailyFocusMs(), 60000);
  assert.equal(dayLabel.textContent, '31.25%');
  assert.equal(body.attributes.get('data-focus-reminder'), 'true');

  h.setTime(12, 30);
  h.tick();
  assert.equal(body.attributes.get('data-focus-reminder'), 'false');
  assert.equal(dayLabel.textContent, '37.50%');
  h.setTime(13);
  h.tick();
  assert.equal(body.attributes.get('data-focus-reminder'), 'true');
  assert.equal(dayLabel.textContent, '37.50%');

  click();
  assert.equal(h.storage.isRunning(h.storage.load('first')), true);
  assert.equal(body.attributes.get('data-timer-running'), 'true');
  assert.equal(mascot.title, 'Focusing');
  assert.equal(body.attributes.get('data-focus-reminder'), 'false');
  assert.equal(button.title, 'Pause timer');
  assert.equal(time.textContent, '0s');
  assert.equal(renders, 3);
  assert.equal(h.windows.length, 1);
});

test('kept PiP follows a different issue and its controls act on the new timer', async () => {
  const h = await createHarness();
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.start('second');

  const { body } = h.windows[0].document;
  assert.equal(body.children.find(el => el.className === 'title').textContent, 'Second issue');
  const click = body.children.find(el => el.className === 'pause-btn').listeners.get('click');
  click();
  assert.equal(h.storage.isRunning(h.storage.load('second')), false);
  click();
  assert.equal(h.storage.isRunning(h.storage.load('second')), true);
  assert.equal(h.storage.isRunning(h.storage.load('first')), false);
  assert.equal(h.windows.length, 1);
});

test('focus percentage uses two decimals across goals and freezes when paused', async () => {
  const h = await createHarness();
  h.timer.start('first');
  await h.pip.open('first');
  const stack = h.windows[0].document.body.children.find(el => el.className === 'progress-stack');
  const [track, label] = stack.children.find(el => el.className === 'focus-progress').children;

  assert.equal(label.textContent, '0.00%');
  h.setTime(11, 0, 1);
  h.tick();
  assert.equal(label.textContent, '0.01%');
  assert.equal(track.attributes.get('aria-valuenow'), '0.01');
  h.setTime(11, 0, 2);
  h.tick();
  assert.equal(label.textContent, '0.01%');
  h.setTime(11, 0, 3);
  h.tick();
  assert.equal(label.textContent, '0.02%');
  h.timer.stop('first');
  h.setTime(11, 1);
  h.tick();
  assert.equal(label.textContent, '0.02%');

  await h.settings.setFocusGoal({ enabled: true, hours: 48 });
  h.tick();
  assert.equal(label.textContent, '0.00%');
  h.timer.start('first');
  h.setTime(11, 1, 1);
  h.tick();
  assert.equal(label.textContent, '0.00%');
  await h.settings.setFocusGoal({ enabled: true, hours: 1 });
  h.tick();
  assert.equal(label.textContent, '0.11%');
});

test('visual reminder can be disabled independently of the optional sound', async () => {
  const h = await createHarness();
  await h.settings.setFocusReminderVisualEnabled(false);
  await h.settings.setFocusReminderSoundEnabled(true);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  const body = h.windows[0].document.body;
  assert.equal(body.attributes.get('data-focus-reminder'), 'false');
  h.setTime(11, 1);
  h.tick();
  assert.equal(h.reminders, 1);
  await h.settings.setFocusReminderVisualEnabled(true);
  h.tick();
  assert.equal(body.attributes.get('data-focus-reminder'), 'true');
});

test('mascot reacts briefly to each sound independently of the visual reminder', async () => {
  const h = await createHarness();
  await h.settings.setFocusReminderVisualEnabled(false);
  await h.settings.setFocusReminderSoundEnabled(true);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  const mascot = h.windows[0].document.body.children.find(el => el.className === 'mascot');
  assert.equal(mascot.attributes.get('data-sound-reminder'), 'false');

  h.setTime(11, 1);
  h.tick();
  await Promise.resolve();
  assert.equal(h.reminders, 1);
  assert.equal(mascot.attributes.get('data-sound-reminder'), 'true');
  h.tick();
  assert.equal(mascot.attributes.get('data-sound-reminder'), 'true');
  h.finishTimeouts();
  assert.equal(mascot.attributes.get('data-sound-reminder'), 'false');

  h.setTime(11, 2);
  h.tick();
  await Promise.resolve();
  assert.equal(mascot.attributes.get('data-sound-reminder'), 'true');
  h.timer.start('first');
  assert.equal(mascot.attributes.get('data-sound-reminder'), 'false');
  assert.equal(h.timeouts.size, 0);
});

test('failed or stale sound reminders do not trigger a mascot reaction', async () => {
  let settle;
  const h = await createHarness(true, () => new Promise((resolve, reject) => {
    settle = { resolve, reject };
  }));
  await h.settings.setFocusReminderSoundEnabled(true);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  const mascot = h.windows[0].document.body.children.find(el => el.className === 'mascot');
  h.setTime(11, 1);
  h.tick();
  settle.reject(new Error('Audio unavailable'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mascot.attributes.get('data-sound-reminder'), 'false');
  assert.equal(h.errors.length, 1);

  h.setTime(11, 2);
  h.tick();
  h.pip.close();
  settle.resolve();
  await Promise.resolve();
  assert.equal(mascot.attributes.get('data-sound-reminder'), 'false');
  assert.equal(h.timeouts.size, 0);
});

test('disabling both indicators and reminders leaves progress visible', async () => {
  const h = await createHarness();
  await h.settings.setFocusPaceAheadEnabled(false);
  await h.settings.setFocusPaceBehindEnabled(false);
  await h.settings.setFocusReminderVisualEnabled(false);
  await h.settings.setFocusReminderSoundEnabled(false);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  const body = h.windows[0].document.body;
  const stack = body.children.find(el => el.className === 'progress-stack');
  const day = stack.children.find(el => el.className === 'progress');
  const focus = stack.children.find(el => el.className === 'focus-progress');
  const [track, label] = focus.children;
  h.setTime(11, 0, 30);
  h.tick();
  assert.equal(day.hidden, false);
  assert.equal(day.children[1].textContent, '25.10%');
  assert.equal(focus.hidden, false);
  assert.equal(label.textContent, '0.00%');
  assert.equal(focus.attributes.get('data-pace'), 'uncompared');
  assert.equal(track.children[1].hidden, true);
  assert.equal(body.attributes.get('data-focus-reminder'), 'false');
  assert.equal(focus.title, 'Focus 0m / 4h');
  assert.equal(track.attributes.get('aria-valuetext'), '0.00% of focus goal. Focus 0m / 4h');
  h.setTime(11, 5);
  h.tick();
  assert.equal(h.reminders, 0);

  h.timer.start('first');
  h.tick();
  assert.equal(body.attributes.get('data-timer-running'), 'true');
  assert.equal(focus.attributes.get('data-pace'), 'uncompared');
  h.timer.stop('first');
  h.tick();
  assert.equal(body.attributes.get('data-timer-running'), 'false');

});

test('pace indicators can be hidden independently without disabling reminders', async () => {
  const h = await createHarness();
  await h.settings.setFocusReminderSoundEnabled(true);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  const body = h.windows[0].document.body;
  const mascot = body.children.find(el => el.className === 'mascot');
  const stack = body.children.find(el => el.className === 'progress-stack');
  const focus = stack.children.find(el => el.className === 'focus-progress');
  const [track] = focus.children;
  const marker = track.children[1];

  await h.settings.setFocusPaceBehindEnabled(false);
  h.tick();
  assert.equal(focus.attributes.get('data-pace'), 'uncompared');
  assert.equal(marker.hidden, true);
  assert.equal(focus.title, 'Focus 0m / 4h');
  assert.equal(track.attributes.get('aria-valuetext'), '0.00% of focus goal. Focus 0m / 4h');
  assert.equal(mascot.title, 'Paused');
  assert.equal(body.attributes.get('data-focus-reminder'), 'true');
  await h.settings.setFocusReminderVisualEnabled(false);
  h.tick();
  assert.equal(body.attributes.get('data-focus-reminder'), 'false');
  assert.equal(focus.attributes.get('data-pace'), 'uncompared');
  h.setTime(11, 1);
  h.tick();
  assert.equal(h.reminders, 1);

  await h.settings.setFocusPaceBehindEnabled(true);
  h.tick();
  assert.equal(focus.attributes.get('data-pace'), 'behind');
  assert.equal(marker.hidden, false);
  assert.match(focus.title, /behind/);
  await h.settings.setFocusPaceAheadEnabled(false);
  h.tick();
  assert.equal(focus.attributes.get('data-pace'), 'behind');
  await h.settings.setFocusGoal({ enabled: true, hours: 1 });
  h.timer.start('first');
  h.setTime(12, 0);
  h.tick();
  h.timer.stop('first');
  assert.equal(focus.attributes.get('data-pace'), 'uncompared');
  assert.equal(marker.hidden, true);
  assert.doesNotMatch(focus.title, /ahead|On pace/);
  await h.settings.setFocusPaceAheadEnabled(true);
  h.tick();
  assert.equal(focus.attributes.get('data-pace'), 'ahead');
  assert.equal(marker.hidden, false);
  assert.match(focus.title, /ahead/);
});

test('on-pace indicator follows the on-track-or-ahead setting', async () => {
  const h = await createHarness();
  h.setTime(9);
  await h.settings.setFocusPaceAheadEnabled(false);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  const stack = h.windows[0].document.body.children.find(el => el.className === 'progress-stack');
  const focus = stack.children.find(el => el.className === 'focus-progress');
  assert.equal(focus.attributes.get('data-pace'), 'uncompared');
  assert.equal(focus.children[0].children[1].hidden, true);
  await h.settings.setFocusPaceAheadEnabled(true);
  h.tick();
  assert.equal(focus.attributes.get('data-pace'), 'ahead');
  assert.match(focus.title, /On pace/);
});

test('pause still closes PiP by default, and disabling persistence closes a paused PiP', async () => {
  const h = await createHarness(false);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  assert.equal(h.pip.isOpen(), false);
  assert.equal(h.windows[0].closed, true);
  assert.equal(h.intervals.size, 0);

  await h.settings.setKeepPipOpen(true);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  assert.equal(h.pip.isOpen(), true);
  await h.settings.setKeepPipOpen(false);
  h.tick();
  assert.equal(h.pip.isOpen(), false);
  assert.equal(h.intervals.size, 0);
});

test('optional sound reminders wait five minutes, repeat without bursts, and reset over breaks', async () => {
  const h = await createHarness();
  await h.settings.setFocusReminderIntervalMinutes(5);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  h.setTime(11, 30);
  h.tick();
  assert.equal(h.reminders, 0);

  await h.settings.setFocusReminderSoundEnabled(true);
  h.tick();
  h.setTime(11, 34, 59);
  h.tick();
  assert.equal(h.reminders, 0);
  h.setTime(11, 35);
  h.tick();
  assert.equal(h.reminders, 1);
  h.setTime(11, 40);
  h.tick();
  assert.equal(h.reminders, 2);

  h.setTime(11, 55);
  h.tick();
  h.tick();
  assert.equal(h.reminders, 3);
  h.timer.start('first');
  h.setTime(11, 56);
  h.tick();
  h.timer.stop('first');

  h.setTime(12, 30);
  h.tick();
  assert.equal(h.reminders, 3);
  h.setTime(13);
  h.tick();
  h.setTime(13, 4, 59);
  h.tick();
  assert.equal(h.reminders, 3);
  h.setTime(13, 5);
  h.tick();
  assert.equal(h.reminders, 4);

  await h.settings.setFocusReminderSoundEnabled(false);
  h.tick();
  h.setTime(13, 15);
  h.tick();
  assert.equal(h.reminders, 4);
});

test('sound reminders default to one minute and restart the wait when their interval changes', async () => {
  const h = await createHarness();
  await h.settings.setFocusReminderSoundEnabled(true);
  h.timer.start('first');
  await h.pip.open('first');
  h.timer.stop('first');
  h.setTime(11, 0, 59);
  h.tick();
  assert.equal(h.reminders, 0);
  h.setTime(11, 1);
  h.tick();
  assert.equal(h.reminders, 1);
  h.setTime(11, 2);
  h.tick();
  assert.equal(h.reminders, 2);

  await h.settings.setFocusReminderIntervalMinutes(3);
  h.tick();
  h.setTime(11, 4, 59);
  h.tick();
  assert.equal(h.reminders, 2);
  h.setTime(11, 5);
  h.tick();
  assert.equal(h.reminders, 3);

  await h.settings.setFocusReminderIntervalMinutes(2);
  h.tick();
  h.setTime(11, 6, 59);
  h.tick();
  assert.equal(h.reminders, 3);
  h.setTime(11, 7);
  h.tick();
  assert.equal(h.reminders, 4);
});

test('no reminder is raised when ahead, with the goal disabled, or after closing PiP', async () => {
  const h = await createHarness();
  await h.settings.setFocusReminderSoundEnabled(true);
  h.timer.start('first');
  await h.pip.open('first');
  h.setTime(11, 1);
  h.timer.stop('first');
  await h.settings.setFocusGoal({ enabled: true, hours: 0.01 });
  h.tick();
  h.setTime(11, 10);
  h.tick();
  const body = h.windows[0].document.body;
  assert.equal(body.attributes.get('data-focus-reminder'), 'false');
  assert.equal(h.reminders, 0);

  await h.settings.setFocusGoal({ enabled: false, hours: 4 });
  h.tick();
  h.setTime(11, 20);
  h.tick();
  assert.equal(body.attributes.get('data-focus-reminder'), 'false');
  assert.equal(h.reminders, 0);
  h.pip.close();
  assert.equal(h.intervals.size, 0);
});
