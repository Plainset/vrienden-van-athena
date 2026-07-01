/*
  Hero animation: "Crest ignition + turf-line sweep"
  - Canvas: drifting particle field + a single sweep beam on load + slow turf-line parallax after.
  - SVG crest: CSS mask-wipe reveal (triggered by adding .crest-reveal), synced to the sweep.
  - Respects prefers-reduced-motion and scales down on small/low-power devices.
  - Progressive enhancement: without this script the static HTML/CSS already shows the
    final state (full crest, headline, no motion) via the .no-js class set below.
*/
(function () {
  document.documentElement.classList.remove('no-js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hero = document.querySelector('.hero');
  var canvas = document.getElementById('heroCanvas');
  var crest = document.getElementById('heroCrest');

  if (!hero || !canvas) return;

  // Trigger the CSS-driven crest/headline reveal (works even if canvas setup fails below).
  requestAnimationFrame(function () {
    hero.classList.add('hero-anim');
    if (crest) crest.classList.add('crest-reveal');
  });

  if (reduceMotion) {
    // Static hero only — no canvas animation at all.
    return;
  }

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var isSmall = window.innerWidth < 768;
  var isLowPower = (navigator.hardwareConcurrency || 8) <= 4;
  var lowFi = isSmall || isLowPower;

  var particleCount = lowFi ? 26 : 70;
  var dpr = lowFi ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  var W = 0, H = 0;
  var particles = [];
  var turfLines = [];
  var sweepProgress = -0.25; // 0..1.25 across the intro sweep
  var startTime = null;
  var running = true;
  var rafId = null;

  var palette = ['rgba(95,184,190,0.85)', 'rgba(225,31,43,0.55)', 'rgba(255,255,255,0.5)'];

  function resize() {
    var rect = hero.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function initParticles() {
    particles = [];
    for (var i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1 + Math.random() * 2,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.05 - Math.random() * 0.14,
        color: palette[i % palette.length],
        drift: Math.random() * Math.PI * 2
      });
    }
    turfLines = [];
    var lineCount = lowFi ? 2 : 3;
    for (var j = 0; j < lineCount; j++) {
      turfLines.push({
        y: H * (0.55 + j * 0.14),
        offset: Math.random() * 200,
        speed: 0.06 + j * 0.02
      });
    }
  }

  function drawTurfLines(t) {
    ctx.save();
    ctx.strokeStyle = 'rgba(95,184,190,0.08)';
    ctx.lineWidth = 1;
    for (var i = 0; i < turfLines.length; i++) {
      var line = turfLines[i];
      var y = line.y;
      var shift = (t * line.speed + line.offset) % 60;
      ctx.beginPath();
      for (var x = -60 + shift; x < W + 60; x += 60) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 30, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSweep() {
    if (sweepProgress > 1.15) return;
    var x = W * sweepProgress;
    var grad = ctx.createLinearGradient(x - 100, 0, x + 100, 0);
    grad.addColorStop(0, 'rgba(95,184,190,0)');
    grad.addColorStop(0.46, 'rgba(95,184,190,0.12)');
    grad.addColorStop(0.5, 'rgba(190,238,240,0.6)');
    grad.addColorStop(0.54, 'rgba(95,184,190,0.12)');
    grad.addColorStop(1, 'rgba(95,184,190,0)');
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(x - 100, 0, 200, H);
    ctx.restore();
  }

  function drawParticles(dt) {
    ctx.save();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx + Math.sin(p.drift) * 0.05;
      p.y += p.vy;
      p.drift += 0.004;

      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;

      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.7;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function frame(ts) {
    if (!running) return;
    if (!startTime) startTime = ts;
    var t = ts - startTime;
    var dt = 16;

    ctx.clearRect(0, 0, W, H);
    drawTurfLines(t);
    drawParticles(dt);

    if (sweepProgress <= 1.15) {
      drawSweep();
      sweepProgress += 0.012;
    }

    rafId = requestAnimationFrame(frame);
  }

  resize();
  initParticles();
  rafId = requestAnimationFrame(frame);

  window.addEventListener('resize', function () {
    resize();
    initParticles();
  }, { passive: true });

  // Pause the loop when the hero scrolls off-screen to save battery/CPU.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        running = entry.isIntersecting;
        if (running && !rafId) rafId = requestAnimationFrame(frame);
        if (!running && rafId) { cancelAnimationFrame(rafId); rafId = null; }
      });
    }, { threshold: 0.05 });
    io.observe(hero);
  }
})();
