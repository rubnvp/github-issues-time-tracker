// ─── Confetti ─────────────────────────────────────────────────────────────────
// Full-screen celebration burst using Canvas API. No dependencies.

const Confetti = (() => {
  const DURATION_MS = 5000;
  const PARTICLE_COUNT = 120;
  const COLORS = [
    '#6366f1', '#a5b4fc', '#10b981', '#34d399',
    '#f59e0b', '#fcd34d', '#ec4899', '#f9a8d4',
    '#ffffff', '#c7d2fe',
  ];

  let canvas = null;
  let ctx = null;
  let particles = [];
  let rafId = null;
  let startTime = null;

  function _createParticle() {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 6;
    return {
      x: Math.random() * window.innerWidth,
      y: -10 - Math.random() * 20,
      vx: Math.cos(angle) * speed * 0.4 + (Math.random() - 0.5) * 3,
      vy: speed,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      width: 6 + Math.random() * 8,
      height: 4 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.25,
      gravity: 0.12 + Math.random() * 0.08,
      drag: 0.985,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.05 + Math.random() * 0.05,
      opacity: 1,
    };
  }

  function _setup() {
    canvas = document.createElement('canvas');
    canvas.style.cssText = [
      'position:fixed', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none',
      'z-index:2147483647',
    ].join(';');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  function _teardown() {
    if (rafId) cancelAnimationFrame(rafId);
    if (canvas) canvas.remove();
    canvas = null;
    ctx = null;
    particles = [];
    rafId = null;
    startTime = null;
  }

  function _tick(now) {
    if (!startTime) startTime = now;
    const elapsed = now - startTime;
    const progress = elapsed / DURATION_MS;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Emit new particles in bursts during first 2s
    if (elapsed < 2000 && Math.random() < 0.6) {
      for (let i = 0; i < 3; i++) particles.push(_createParticle());
    }

    particles = particles.filter((p) => p.opacity > 0.01 && p.y < canvas.height + 20);

    for (const p of particles) {
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.wobble += p.wobbleSpeed;

      // Fade out in the last 2s
      if (elapsed > DURATION_MS - 2000) {
        p.opacity = Math.max(0, p.opacity - 0.018);
      }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(
        -p.width / 2 + Math.sin(p.wobble) * 3,
        -p.height / 2,
        p.width,
        p.height
      );
      ctx.restore();
    }

    if (elapsed < DURATION_MS || particles.length > 0) {
      rafId = requestAnimationFrame(_tick);
    } else {
      _teardown();
    }
  }

  return {
    burst() {
      if (canvas) _teardown(); // cancel any existing burst
      _setup();
      // Seed initial particles immediately
      for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(_createParticle());
      rafId = requestAnimationFrame(_tick);
    },
  };
})();
