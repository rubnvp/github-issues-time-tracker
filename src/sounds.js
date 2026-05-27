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
  };
})();
