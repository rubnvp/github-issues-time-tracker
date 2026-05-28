// ─── Sounds ───────────────────────────────────────────────────────────────────
// Generates UI sounds via Web Audio API — no audio files needed.

const Sounds = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  }

  function playTone(frequencies, duration = 0.08, gain = 0.15) {
    const ac = getCtx();
    const resume = ac.state === 'suspended' ? ac.resume() : Promise.resolve();
    resume.then(() => _scheduleTones(ac, frequencies, duration, gain));
  }

  function _scheduleTones(ac, frequencies, duration, gain) {
    const now = ac.currentTime;

    frequencies.forEach(({ freq, time }) => {
      const osc = ac.createOscillator();
      const env = ac.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      env.gain.setValueAtTime(0, now + time);
      env.gain.linearRampToValueAtTime(gain, now + time + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, now + time + duration);

      osc.connect(env);
      env.connect(ac.destination);

      osc.start(now + time);
      osc.stop(now + time + duration + 0.05);
    });
  }

  return {
    // Two ascending notes — signals "started"
    play() {
      playTone([
        { freq: 440, time: 0 },
        { freq: 660, time: 0.1 },
      ]);
    },

    // Two descending notes — signals "stopped"
    stop() {
      playTone([
        { freq: 660, time: 0 },
        { freq: 440, time: 0.1 },
      ]);
    },

    // Fanfare — signals issue completed 🎉
    celebrate() {
      // Chord stabs + ascending run: C4-E4-G4-C5-E5-G5
      const notes = [261.6, 329.6, 392, 523.3, 659.3, 784];
      playTone(
        notes.map((freq, i) => ({ freq, time: i * 0.1 })),
        0.35,
        0.22
      );
      // Second wave slightly delayed for fullness
      playTone(
        [523.3, 659.3, 784, 1046.5].map((freq, i) => ({ freq, time: 0.7 + i * 0.09 })),
        0.28,
        0.15
      );
    },
  };
})();
