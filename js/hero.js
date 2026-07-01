/*
  Hero animation: "Slap-shot reveal"
  - A hockey stick whips in and strikes a ball; the ball rockets across the
    hero and "hits" the crest, which pops in with a bouncy overshoot and a
    burst of confetti. Headline/sub/CTAs rise right after.
  - Ambient backdrop: slow diagonal turf-mow stripes + drifting hockey-ball
    flecks, running continuously (lightweight, always-on).
  - The whole strike sequence REPLAYS every time the hero scrolls back into
    view (with a short cooldown so it doesn't retrigger on tiny scroll jitter).
  - Respects prefers-reduced-motion and scales down on small/low-power devices.
  - Progressive enhancement: without this script the static HTML/CSS already
    shows the final state (full crest, headline, no motion) via .no-js.
*/
(function () {
  document.documentElement.classList.remove('no-js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hero = document.querySelector('.hero');
  var canvas = document.getElementById('heroCanvas');
  var crest = document.getElementById('heroCrest');

  if (!hero || !canvas) return;

  if (reduceMotion) {
    // Static hero only — crest/headline show via the reduced-motion CSS rules.
    return;
  }

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var isSmall = window.innerWidth < 768;
  var isLowPower = (navigator.hardwareConcurrency || 8) <= 4;
  var lowFi = isSmall || isLowPower;

  var dotCount = lowFi ? 20 : 55;
  var dpr = lowFi ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  var W = 0, H = 0;
  var dots = [];
  var confetti = [];
  var running = true;
  var rafId = null;
  var t0 = null;

  var CONFETTI_COLORS = ['#E11F2B', '#5FB8BE', '#ffffff', '#8fd8dc'];

  // ---- sequence state ----
  var phase = 'idle'; // idle -> swing -> flight -> settled
  var phaseStart = 0;
  var pivot = { x: 0, y: 0 };
  var target = { x: 0, y: 0 };
  var stickLen = 0;
  var ballPos = { x: 0, y: 0 };
  var ballTrail = [];
  var lastPlay = -Infinity;
  var COOLDOWN = 1000;

  var RAISED_ANGLE = -1.05;   // radians, stick raised behind
  var STRIKE_ANGLE = 0.42;    // radians, stick through the ball
  var SWING_MS = 220;
  var FLIGHT_MS = 340;

  function easeInQuad(x) { return x * x; }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

  function resize() {
    var rect = hero.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    pivot.x = W * 0.84;
    pivot.y = H * 0.88;
    stickLen = Math.max(90, Math.min(150, W * 0.13));
  }

  function initDots() {
    dots = [];
    for (var i = 0; i < dotCount; i++) {
      dots.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1.3 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.1,
        vy: -0.05 - Math.random() * 0.12,
        seam: Math.random() < 0.35
      });
    }
  }

  function getTarget() {
    if (!crest) return { x: W / 2, y: H * 0.4 };
    var cr = crest.getBoundingClientRect();
    var hr = hero.getBoundingClientRect();
    return { x: cr.left + cr.width / 2 - hr.left, y: cr.top + cr.height / 2 - hr.top };
  }

  function drawTurf(t) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.35);
    ctx.translate(-W, -H);
    var band = 70;
    var shift = (t * 0.01) % (band * 2);
    ctx.fillStyle = 'rgba(95,184,190,0.035)';
    for (var x = -band * 2 + shift; x < W * 2.5; x += band * 2) {
      ctx.fillRect(x, 0, band, H * 2.5);
    }
    ctx.restore();
  }

  function drawDots(t) {
    ctx.save();
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.x += d.vx;
      d.y += d.vy;
      if (d.y < -10) { d.y = H + 10; d.x = Math.random() * W; }
      if (d.x < -10) d.x = W + 10;
      if (d.x > W + 10) d.x = -10;

      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      if (d.seam) {
        ctx.strokeStyle = 'rgba(7,28,107,0.35)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(d.x - d.r, d.y);
        ctx.lineTo(d.x + d.r, d.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function stickAngleForPhase(elapsed) {
    if (phase === 'swing') {
      var p = Math.min(1, elapsed / SWING_MS);
      return RAISED_ANGLE + (STRIKE_ANGLE - RAISED_ANGLE) * easeInQuad(p);
    }
    return STRIKE_ANGLE;
  }

  function drawStick(angle) {
    var alpha = 1;
    if (phase === 'flight') {
      alpha = Math.max(0, 1 - (performance.now() - phaseStart) / (FLIGHT_MS * 0.6));
    } else if (phase === 'settled' || phase === 'idle') {
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(angle);

    // shaft
    ctx.strokeStyle = '#e7e9ea';
    ctx.lineWidth = Math.max(5, stickLen * 0.055);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -stickLen);
    ctx.stroke();

    // blade (hooked toe)
    ctx.strokeStyle = '#E11F2B';
    ctx.lineWidth = Math.max(6, stickLen * 0.07);
    ctx.beginPath();
    ctx.moveTo(0, -stickLen);
    ctx.quadraticCurveTo(stickLen * 0.16, -stickLen * 1.02, stickLen * 0.22, -stickLen * 0.9);
    ctx.stroke();

    ctx.restore();
  }

  function spawnConfetti(x, y, count) {
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var speed = 1.4 + Math.random() * 3.2;
      confetti.push({
        x: x, y: y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 1,
        g: 0.09,
        life: 1,
        decay: 0.014 + Math.random() * 0.012,
        size: 2 + Math.random() * 3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot: Math.random() * Math.PI
      });
    }
  }

  function drawConfetti() {
    ctx.save();
    for (var i = confetti.length - 1; i >= 0; i--) {
      var c = confetti[i];
      c.vy += c.g;
      c.x += c.vx;
      c.y += c.vy;
      c.life -= c.decay;
      c.rot += 0.12;
      if (c.life <= 0) { confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBall(elapsed) {
    if (phase === 'flight') {
      var p = Math.min(1, elapsed / FLIGHT_MS);
      var e = easeOutCubic(p);
      var startX = pivot.x + Math.sin(STRIKE_ANGLE) * stickLen * 0.2;
      var startY = pivot.y - Math.cos(STRIKE_ANGLE) * stickLen * 0.2;
      var x = startX + (target.x - startX) * e;
      var arc = Math.sin(p * Math.PI) * -H * 0.06;
      var y = startY + (target.y - startY) * e + arc;
      ballPos.x = x; ballPos.y = y;

      ballTrail.push({ x: x, y: y });
      if (ballTrail.length > 10) ballTrail.shift();

      ctx.save();
      for (var i = 0; i < ballTrail.length; i++) {
        var tpos = ballTrail[i];
        ctx.globalAlpha = (i / ballTrail.length) * 0.35;
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.arc(tpos.x, tpos.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(7,28,107,0.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0.3, 2.6);
      ctx.stroke();
      ctx.restore();

      if (p >= 1) {
        phase = 'settled';
        spawnConfetti(target.x, target.y, lowFi ? 14 : 26);
        hero.classList.add('hero-anim');
        if (crest) crest.classList.add('crest-pop');
        ballTrail = [];
      }
    }
  }

  function tickSequence(now) {
    var elapsed = now - phaseStart;
    if (phase === 'swing' && elapsed >= SWING_MS) {
      phase = 'flight';
      phaseStart = now;
      spawnConfetti(
        pivot.x + Math.sin(STRIKE_ANGLE) * stickLen * 0.2,
        pivot.y - Math.cos(STRIKE_ANGLE) * stickLen * 0.2,
        lowFi ? 5 : 9
      );
      elapsed = 0;
    }
    var angle = stickAngleForPhase(elapsed);
    drawStick(angle);
    drawBall(elapsed);
  }

  function frame(ts) {
    if (!running) return;
    if (!t0) t0 = ts;
    var t = ts - t0;

    ctx.clearRect(0, 0, W, H);
    drawTurf(t);
    drawDots(t);
    if (phase === 'swing' || phase === 'flight') tickSequence(ts);
    drawConfetti();

    rafId = requestAnimationFrame(frame);
  }

  function play() {
    var now = performance.now();
    if (now - lastPlay < COOLDOWN) return;
    if (phase === 'swing' || phase === 'flight') return;
    lastPlay = now;

    hero.classList.remove('hero-anim');
    if (crest) crest.classList.remove('crest-pop');
    // force reflow so the CSS animations restart on next class add
    // eslint-disable-next-line no-unused-expressions
    void hero.offsetWidth;

    target = getTarget();
    phase = 'swing';
    phaseStart = performance.now();

    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  resize();
  initDots();
  rafId = requestAnimationFrame(frame);

  window.addEventListener('resize', function () {
    resize();
    initDots();
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    var wasVisible = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var ratio = entry.intersectionRatio;
        running = ratio > 0;
        if (running && !rafId) rafId = requestAnimationFrame(frame);
        if (!running && rafId) { cancelAnimationFrame(rafId); rafId = null; }

        var visibleEnough = ratio >= 0.45;
        if (visibleEnough && !wasVisible) play();
        wasVisible = visibleEnough;
      });
    }, { threshold: [0, 0.45] });
    io.observe(hero);
  } else {
    play();
  }
})();
