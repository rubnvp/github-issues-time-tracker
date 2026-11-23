import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/sounds.js', import.meta.url), 'utf8');

test('focus reminder resumes audio before scheduling tones and surfaces playback failures', async () => {
  const tones = [];
  const peaks = [];
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
      const tone = {
        frequency: { setValueAtTime(value) { tone.hz = value; } },
        connect() {},
        start(time) { tone.start = time; },
        stop(time) { tone.end = time; },
      };
      tones.push(tone);
      return tone;
    }

    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime(value) { peaks.push(value); },
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
  assert.equal(tones.length, 6);
  assert.ok(tones.every(tone => tone.start >= audioContext.currentTime));
  assert.ok(tones.every(tone => tone.type === 'triangle'));
  assert.ok(peaks.every(gain => gain >= 0.2 && gain <= 0.3));
  assert.notEqual(tones[0].hz, tones[1].hz);
  assert.deepEqual(tones.slice(0, 3).map(tone => tone.hz), tones.slice(3).map(tone => tone.hz));
  assert.ok(tones[3].start - tones[2].end >= 0.2);
  const duration = tones.at(-1).end - tones[0].start;
  assert.ok(duration >= 1.5 && duration <= 2);

  audioContext.state = 'suspended';
  audioContext.resume = async () => { throw new Error('Audio unavailable'); };
  await assert.rejects(sounds.remind(), /Audio unavailable/);
});
