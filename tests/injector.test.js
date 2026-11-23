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
