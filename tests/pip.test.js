import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const pipSource = await readFile(new URL('../src/pip.js', import.meta.url), 'utf8');

class FakeElement {
  constructor() {
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.attributes = new Map();
    this.classList = { toggle() {} };
  }

  appendChild(child) {
    this.children.push(child);
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

class FakePipWindow {
  constructor() {
    this.closed = false;
    this.listeners = new Map();
    this.document = {
      head: new FakeElement(),
      body: new FakeElement(),
      createElement: () => new FakeElement(),
    };
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  close() {
    this.closed = true;
  }

  dispatch(name) {
    this.listeners.get(name)?.();
  }
}

test('closing an older PiP window cannot clear the current window reference', async () => {
  const requests = [];
  const documentPictureInPicture = {
    requestWindow() {
      return new Promise(resolve => requests.push(resolve));
    },
  };
  const context = vm.createContext({
    window: { screen: { availWidth: 1440 }, documentPictureInPicture },
    documentPictureInPicture,
    document: { querySelector: () => null },
    Timer: { formatMs: () => '0s', stop() {} },
    Storage: { currentSessionMs: () => 0, load: () => ({}) },
    GitHubAdapter: { getIssueTitle: () => 'Issue' },
    Settings: { getDailyProgress: () => null, getFocusGoal: () => ({ enabled: false }) },
    setInterval: () => 1,
    clearInterval() {},
  });
  vm.runInContext(pipSource, context);
  const pip = vm.runInContext('PiP', context);

  const firstWindow = new FakePipWindow();
  const firstOpen = pip.open('first');
  requests[0](firstWindow);
  await firstOpen;
  assert.equal(pip.isOpen(), true);

  const secondWindow = new FakePipWindow();
  const secondOpen = pip.open('second');
  assert.equal(firstWindow.closed, true);
  requests[1](secondWindow);
  await secondOpen;

  firstWindow.dispatch('pagehide');
  assert.equal(pip.isOpen(), true);

  pip.close();
  assert.equal(secondWindow.closed, true);
  assert.equal(pip.isOpen(), false);
});

test('PiP displays work segments and moves the time marker through breaks without filling them', async () => {
  const pipWindow = new FakePipWindow();
  const documentPictureInPicture = { requestWindow: async () => pipWindow };
  let tick;
  let position = 3.25 / 8;
  const context = vm.createContext({
    window: { screen: { availWidth: 1440 }, documentPictureInPicture },
    documentPictureInPicture,
    document: { querySelector: () => null },
    Timer: { formatMs: () => '0s', stop() {} },
    Storage: { currentSessionMs: () => 0, load: () => ({}) },
    Settings: {
      getFocusGoal: () => ({ enabled: false }),
      getDailyProgress: () => 3 / 7,
      getDailyTimeline: () => ({
        position,
        segments: [
          { start: 0, end: 3 / 8, label: '09:00 - 12:00' },
          { start: 4 / 8, end: 1, label: '13:00 - 17:00' },
        ],
      }),
    },
    setInterval(callback) { tick = callback; return 1; },
    clearInterval() {},
  });
  vm.runInContext(pipSource, context);
  await vm.runInContext('PiP.open("issue")', context);

  const stack = pipWindow.document.body.children.find(el => el.className === 'progress-stack');
  const progress = stack.children.find(el => el.className === 'progress');
  const [track, label] = progress.children;
  const [morning, afternoon, marker] = track.children;
  assert.equal(morning.style.width, '37.5%');
  assert.equal(afternoon.style.left, '50%');
  assert.equal(afternoon.style.width, '50%');
  assert.equal(morning.children[0].style.width, '100%');
  assert.equal(afternoon.children[0].style.width, '0%');
  assert.equal(marker.style.left, '40.625%');
  assert.equal(label.textContent, '43%');

  position = 3.75 / 8;
  tick();
  assert.equal(marker.style.left, '46.875%');
  assert.equal(label.textContent, '43%');
  assert.equal(track.attributes.get('aria-valuenow'), '43');
  assert.equal(afternoon.children[0].style.width, '0%');

  position = 6 / 8;
  tick();
  assert.equal(afternoon.children[0].style.width, '50%');
});

test('focus progress updates pace, honors disabling, and works without a work schedule', async () => {
  const pipWindow = new FakePipWindow();
  const documentPictureInPicture = { requestWindow: async () => pipWindow };
  let tick;
  let enabled = false;
  let focusMs = 5400000;
  let expectedProgress = 0.5;
  let reads = 0;
  const context = vm.createContext({
    window: { screen: { availWidth: 1440 }, documentPictureInPicture },
    documentPictureInPicture,
    document: { querySelector: () => null },
    Timer: { formatMs: () => '0s', stop() {} },
    Storage: {
      currentSessionMs: () => 0,
      load: () => ({}),
      getDailyFocusMs() { reads += 1; return focusMs; },
    },
    Settings: {
      getDailyProgress: () => null,
      getFocusGoal: () => ({ enabled, hours: 4 }),
      getFocusProgress: (ms) => ({
        focusMs: ms,
        goalMs: 14400000,
        progress: Math.min(1, ms / 14400000),
        expectedProgress,
        differenceMs: expectedProgress === null ? null : ms - 14400000 * expectedProgress,
      }),
    },
    setInterval(callback) { tick = callback; return 1; },
    clearInterval() {},
  });
  vm.runInContext(pipSource, context);
  await vm.runInContext('PiP.open("issue")', context);

  const stack = pipWindow.document.body.children.find(el => el.className === 'progress-stack');
  const focusRow = stack.children.find(el => el.className === 'focus-progress');
  const [track, label] = focusRow.children;
  const [fill, marker] = track.children;
  assert.equal(focusRow.hidden, true);
  assert.equal(reads, 0);

  enabled = true;
  tick();
  assert.equal(focusRow.hidden, false);
  assert.equal(fill.style.width, '37.5%');
  assert.equal(marker.style.left, '50%');
  assert.equal(focusRow.attributes.get('data-pace'), 'behind');
  assert.equal(label.textContent, 'Focus 1h 30m / 4h \u00b7 -30m behind');

  focusMs = 9000000;
  tick();
  assert.equal(focusRow.attributes.get('data-pace'), 'ahead');
  assert.match(label.textContent, /\+30m ahead/);

  focusMs = 18000000;
  tick();
  assert.equal(fill.style.width, '100%');
  assert.match(label.textContent, /Focus 5h \/ 4h/);

  expectedProgress = null;
  tick();
  assert.equal(marker.hidden, true);
  assert.equal(focusRow.attributes.get('data-pace'), 'neutral');
  assert.match(label.textContent, /No schedule/);

  enabled = false;
  tick();
  assert.equal(focusRow.hidden, true);
});
