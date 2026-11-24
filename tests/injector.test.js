import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/injector.js', import.meta.url), 'utf8');

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
  }

  append(...children) { this.children.push(...children); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() { this.focused = true; }
}

function createHarness(initialWhy) {
  const state = { why: initialWhy, sessions: [] };
  const context = vm.createContext({
    document: { createElement: () => new Element() },
    Storage: {
      load: () => ({ ...state }),
      saveWhy: (_id, value) => { state.why = value.trim() || null; },
    },
    PiP: { refresh() {} },
    FloatingBar: { refresh() {} },
  });
  vm.runInContext(source, context);
  return {
    state,
    build: () => vm.runInContext('Injector._buildWhyNote("card")', context),
  };
}

test('purpose anchor text stays above the issue while its editor is separate', () => {
  const h = createHarness('Help users recover access');
  const anchor = h.build();
  const [icon, text] = anchor.wrapper.children;

  assert.equal(anchor.editButton.textContent, '✎');
  assert.equal(icon.textContent, '⚓');
  assert.equal(icon.attributes.get('aria-hidden'), 'true');
  assert.equal(text.textContent, 'Help users recover access');
  assert.equal(anchor.wrapper.children.includes(anchor.editor), false);
  assert.equal(anchor.editor.hidden, true);
});

test('empty purpose anchor uses the anchor icon as its add action', () => {
  const anchor = createHarness(null).build();
  assert.equal(anchor.editButton.textContent, '⚓');
  assert.equal(anchor.editButton.title, 'Add purpose anchor');
  assert.equal(anchor.editor.children[0].placeholder, 'What makes this issue matter?');
});

test('purpose anchor editor opens below the controls and saves or removes the note', () => {
  const h = createHarness('Existing purpose');
  const anchor = h.build();
  const input = anchor.editor.children[0];
  const click = anchor.editButton.listeners.get('click');
  click({ preventDefault() {}, stopPropagation() {} });

  assert.equal(anchor.editor.hidden, false);
  assert.equal(input.focused, true);
  input.value = 'Help users finish setup';
  input.listeners.get('keydown')({
    key: 'Enter',
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(h.state.why, 'Help users finish setup');

  click({ preventDefault() {}, stopPropagation() {} });
  input.value = '';
  input.listeners.get('keydown')({
    key: 'Enter',
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(h.state.why, null);
});

function createCardHarness() {
  const observers = [];
  const card = {
    id: 'first',
    nodes: [],
    fieldsReady: false,
    titleReady: true,
    contains(node) { return this.nodes.includes(node); },
    querySelector(selector) {
      return this.nodes.find((node) => node.selector === selector) || null;
    },
  };
  const node = (selector) => ({
    selector,
    remove() { card.nodes = card.nodes.filter((item) => item !== this); },
  });
  const anchor = {
    insertAdjacentElement(_position, element) {
      element.remove();
      card.nodes.push(element);
    },
  };
  const context = vm.createContext({
    GitHubAdapter: {
      getCardId: (element) => element.id,
      getFieldsAnchor: () => card.fieldsReady ? anchor : null,
      getIssueTitleElement: () => card.titleReady ? anchor : null,
    },
    Storage: { load: () => ({}), isRunning: () => false },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  });
  vm.runInContext(source, context);
  const injector = vm.runInContext('Injector', context);
  const widgets = [];
  injector._buildWidget = (id) => {
    const widget = {
      id,
      wrapper: node('[data-time-tracker]'),
      render() {},
      dispose() { widget.disposed = true; },
    };
    widgets.push(widget);
    return widget;
  };
  injector._buildWhyNote = () => ({
    wrapper: node('[data-time-tracker-why]'),
    render() {},
  });
  return { card, injector, observers, widgets };
}

test('repeated injection before fields load mounts only one widget', () => {
  const { card, injector, observers, widgets } = createCardHarness();
  injector.injectCard(card);
  injector.injectCard(card);
  injector.injectCard(card);
  assert.equal(widgets.length, 1);
  assert.equal(observers.length, 1);

  card.fieldsReady = true;
  observers[0].callback();
  assert.equal(card.nodes.filter((item) => item.selector === '[data-time-tracker]').length, 1);
});

test('reinjection before the card observer reuses the removed widget', () => {
  const { card, injector, observers, widgets } = createCardHarness();
  card.fieldsReady = true;
  injector.injectCard(card);
  widgets[0].wrapper.remove();

  injector.injectCard(card);
  observers[0].callback();

  assert.equal(widgets.length, 1);
  assert.equal(card.nodes.filter((item) => item.selector === '[data-time-tracker]').length, 1);
  assert.equal(card.nodes.includes(widgets[0].wrapper), true);
});

test('a recycled card replaces its controls when its issue changes', () => {
  const { card, injector, observers, widgets } = createCardHarness();
  card.fieldsReady = true;
  injector.injectCard(card);
  card.id = 'second';
  observers[0].callback();

  assert.equal(observers[0].disconnected, true);
  assert.equal(widgets[0].disposed, true);
  assert.equal(widgets[1].id, 'second');
  assert.equal(card.nodes.includes(widgets[0].wrapper), false);
  assert.equal(card.nodes.filter((item) => item.selector === '[data-time-tracker]').length, 1);
});
