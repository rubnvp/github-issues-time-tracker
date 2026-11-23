import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/background.js', import.meta.url), 'utf8');

test('new installs start with pace comparison and visual reminders disabled; updates keep settings', async () => {
  let onInstalled;
  const writes = [];
  const chrome = {
    runtime: {
      onInstalled: { addListener(listener) { onInstalled = listener; } },
      onMessage: { addListener() {} },
    },
    storage: { local: { async set(values) { writes.push({ ...values }); } } },
  };
  vm.runInNewContext(source, { chrome });
  onInstalled({ reason: 'update' });
  assert.equal(writes.length, 0);
  onInstalled({ reason: 'install' });
  assert.deepEqual(writes, [{ focusReminderVisualEnabled: false, focusPaceComparisonEnabled: false }]);
});
