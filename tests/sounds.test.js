import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/sounds.js', import.meta.url), 'utf8');

test('focus reminder resumes audio before scheduling tones and surfaces playback failures', async () => {
  const started = [];
  let audioContext;
  class AudioContext {
    constructor() {
      audioContext = this;
      this.state = 'suspended';
      this.currentTime = 10;
    }

    async resume() { this.state = 'running'; }

    createOscillator() {
      assert.equal(this.state, 'running');
      return {
        frequency: { setValueAtTime() {} },
        connect() {},
        start(time) { started.push(time); },
        stop() {},
      };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
  }
  const context = vm.createContext({ AudioContext });
  vm.runInContext(source, context);
  const sounds = vm.runInContext('Sounds', context);
  await sounds.remind();
  assert.ok(started.length > 0);
  assert.ok(started.every(time => time >= audioContext.currentTime));

  audioContext.state = 'suspended';
  audioContext.resume = async () => { throw new Error('Audio unavailable'); };
  await assert.rejects(sounds.remind(), /Audio unavailable/);
});
