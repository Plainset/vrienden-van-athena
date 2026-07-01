/*
  Hero animation: "Address, strike, reveal"
  - POV beat: your own (real, photographed) hockey stick rests near a ball,
    a brief "here's your gear" hold with a subtle handheld sway.
  - Backswing + strike: the stick whips back and through, the ball rockets
    across the hero and "hits" the crest, which pops in with a bouncy
    overshoot and a confetti burst. Headline/sub/CTAs rise right after.
  - Ambient backdrop: slow diagonal turf-mow stripes + drifting hockey-ball
    flecks, running continuously (lightweight, always-on).
  - The whole sequence REPLAYS every time the hero scrolls back into view
    (with a short cooldown so it doesn't retrigger on tiny scroll jitter).
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

  // ---- crossfading real match-photo backdrop (Ken Burns loop) ----
  (function initHeroPhotos() {
    var photos = document.querySelectorAll('.hero-photo');
    if (photos.length < 2) return;
    var idx = 0;
    setInterval(function () {
      var current = photos[idx];
      idx = (idx + 1) % photos.length;
      var next = photos[idx];
      current.classList.remove('is-active');
      void next.offsetWidth; // reflow so the Ken Burns animation restarts each cycle
      next.classList.add('is-active');
    }, 4500);
  })();

  var isSmall = window.innerWidth < 768;
  var isLowPower = (navigator.hardwareConcurrency || 8) <= 4;
  var lowFi = isSmall || isLowPower;

  var dotCount = lowFi ? 20 : 55;
  var dpr = lowFi ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  var W = 0, H = 0;
  var dots = [];
  var confetti = [];
  var dust = [];
  var tipTrail = [];
  var running = true;
  var rafId = null;
  var t0 = null;

  var CONFETTI_COLORS = ['#E11F2B', '#5FB8BE', '#ffffff', '#8fd8dc'];
  var DUST_COLORS = ['#dfe3e6', '#b9c0c4', '#6f7a52', '#8a9468'];

  // ---- real hockey stick image ----
  var stickImg = new Image();
  var stickReady = false;
  stickImg.onload = function () { stickReady = true; };
  stickImg.src = 'assets/img/hockey-stick.png';
  // Measured from the source asset (667x900): grip tip + shaft direction,
  // used to align the photo so it points "up" from the pivot before rotation.
  var STICK_W = 667, STICK_H = 900;
  var GRIP = { x: 29, y: 11 };
  var SHAFT_ANGLE = 1.0517; // radians, atan2(dy,dx) of grip->blade direction in the photo
  var GRIP_TO_TIP_PX = 1006; // pixel distance grip -> blade tip in the photo
  var IMG_CORRECTION = -Math.PI / 2 - SHAFT_ANGLE;

  // ---- sequence state ----
  var phase = 'address'; // address -> backswing -> strike -> flight -> settled
  var phaseStart = 0;
  var pivot = { x: 0, y: 0 };
  var target = { x: 0, y: 0 };
  var stickLen = 0;
  var stickDrawLen = 0;
  var ballTrail = [];
  var lastPlay = -Infinity;
  var COOLDOWN = 1000;

  var ADDRESS_ANGLE = 0.30;
  var RAISED_ANGLE = -1.05;
  var STRIKE_ANGLE = 0.42;
  var ADDRESS_MS = 650;
  var BACKSWING_MS = 130;
  var STRIKE_MS = 150;
  var FLIGHT_MS = 340;
  var BALL_R = lowFi ? 12 : 16;
  var shakeStart = -Infinity;
  var SHAKE_MS = 200;

  function easeInOutQuad(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
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

    pivot.x = W * 0.76;
    pivot.y = H * 1.03;
    stickLen = Math.max(220, Math.min(460, W * 0.34));
    stickDrawLen = stickLen * 1.85;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
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

  function drawDots() {
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
    if (phase === 'address') {
      // subtle handheld sway around the resting/address angle
      return ADDRESS_ANGLE + Math.sin(elapsed / 260) * 0.025;
    }
    if (phase === 'backswing') {
      var p1 = Math.min(1, elapsed / BACKSWING_MS);
      return ADDRESS_ANGLE + (RAISED_ANGLE - ADDRESS_ANGLE) * easeInOutQuad(p1);
    }
    if (phase === 'strike') {
      var p2 = Math.min(1, elapsed / STRIKE_MS);
      return RAISED_ANGLE + (STRIKE_ANGLE - RAISED_ANGLE) * easeInQuad(p2);
    }
    return STRIKE_ANGLE;
  }

  function contactPoint(angle, factor) {
    return {
      x: pivot.x + Math.sin(angle) * stickLen * factor,
      y: pivot.y - Math.cos(angle) * stickLen * factor
    };
  }

  function drawStickImage(angle) {
    if (!stickReady) return;
    var alpha = 1;
    if (phase === 'flight') {
      alpha = Math.max(0, 1 - (performance.now() - phaseStart) / (FLIGHT_MS * 0.6));
    } else if (phase === 'settled') {
      return;
    }
    var imgScale = stickDrawLen / GRIP_TO_TIP_PX;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetX = 7;
    ctx.shadowOffsetY = 12;
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(angle);
    ctx.rotate(IMG_CORRECTION);
    ctx.translate(-GRIP.x * imgScale, -GRIP.y * imgScale);
    ctx.drawImage(stickImg, 0, 0, STICK_W * imgScale, STICK_H * imgScale);
    ctx.restore();
  }

  function drawSwoosh() {
    if (tipTrail.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (var i = 1; i < tipTrail.length; i++) {
      var p0 = tipTrail[i - 1];
      var p1 = tipTrail[i];
      var frac = i / tipTrail.length;
      ctx.strokeStyle = 'rgba(255,255,255,' + (frac * 0.45).toFixed(3) + ')';
      ctx.lineWidth = 2 + frac * 10;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBallAt(x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.ellipse(x, y + r * 0.85, r * 1.1, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    var grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#f1f3f4');
    grad.addColorStop(1, '#c7ccd0');
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = r * 1.1;
    ctx.shadowOffsetY = r * 0.35;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(7,28,107,0.3)';
    ctx.lineWidth = Math.max(0.8, r * 0.07);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.96, 0.35, 2.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.96, 3.45, 5.3);
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

  function spawnDust(x, y, count) {
    for (var i = 0; i < count; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.0;
      var speed = 1.1 + Math.random() * 2.8;
      dust.push({
        x: x, y: y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        g: 0.13,
        life: 1,
        decay: 0.028 + Math.random() * 0.02,
        size: 1.4 + Math.random() * 2.4,
        color: DUST_COLORS[i % DUST_COLORS.length]
      });
    }
  }

  function drawDust() {
    ctx.save();
    for (var i = dust.length - 1; i >= 0; i--) {
      var d = dust[i];
      d.vy += d.g;
      d.x += d.vx;
      d.y += d.vy;
      d.life -= d.decay;
      if (d.life <= 0) { dust.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, d.life) * 0.75;
      ctx.beginPath();
      ctx.fillStyle = d.color;
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFlightBall(elapsed) {
    var p = Math.min(1, elapsed / FLIGHT_MS);
    var e = easeOutCubic(p);
    var start = contactPoint(STRIKE_ANGLE, 0.92);
    var x = start.x + (target.x - start.x) * e;
    var arc = Math.sin(p * Math.PI) * -H * 0.06;
    var y = start.y + (target.y - start.y) * e + arc;
    var r = BALL_R * (1 - p * 0.55); // shrinks slightly as it "travels away" toward the crest

    ballTrail.push({ x: x, y: y, r: r });
    if (ballTrail.length > 10) ballTrail.shift();

    ctx.save();
    for (var i = 0; i < ballTrail.length; i++) {
      var tpos = ballTrail[i];
      ctx.globalAlpha = (i / ballTrail.length) * 0.4;
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(tpos.x, tpos.y, tpos.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawBallAt(x, y, r);

    if (p >= 1) {
      phase = 'settled';
      spawnConfetti(target.x, target.y, lowFi ? 14 : 26);
      hero.classList.add('hero-anim');
      if (crest) crest.classList.add('crest-pop');
      ballTrail = [];
    }
  }

  function tickSequence(now) {
    var elapsed = now - phaseStart;

    if (phase === 'address' && elapsed >= ADDRESS_MS) {
      phase = 'backswing'; phaseStart = now; elapsed = 0;
    } else if (phase === 'backswing' && elapsed >= BACKSWING_MS) {
      phase = 'strike'; phaseStart = now; elapsed = 0;
    } else if (phase === 'strike' && elapsed >= STRIKE_MS) {
      phase = 'flight'; phaseStart = now; elapsed = 0;
      var cp = contactPoint(STRIKE_ANGLE, 0.92);
      spawnDust(cp.x, cp.y, lowFi ? 8 : 16);
      shakeStart = now;
    }

    var angle = stickAngleForPhase(elapsed);

    if (phase === 'backswing' || phase === 'strike') {
      var tip = contactPoint(angle, 1.0);
      tipTrail.push({ x: tip.x, y: tip.y });
      if (tipTrail.length > 8) tipTrail.shift();
    } else if (tipTrail.length) {
      tipTrail.length = 0;
    }
    drawSwoosh();
    drawStickImage(angle);

    if (phase === 'address' || phase === 'backswing' || phase === 'strike') {
      var restBall = contactPoint(STRIKE_ANGLE, 0.92);
      drawBallAt(restBall.x, restBall.y, BALL_R);
    } else if (phase === 'flight') {
      drawFlightBall(elapsed);
    }
  }

  function frame(ts) {
    if (!running) return;
    if (!t0) t0 = ts;
    var t = ts - t0;

    ctx.clearRect(0, 0, W, H);

    var shakeElapsed = ts - shakeStart;
    var shaking = shakeElapsed >= 0 && shakeElapsed < SHAKE_MS;
    var shakeX = 0, shakeY = 0;
    if (shaking) {
      var decay = 1 - shakeElapsed / SHAKE_MS;
      shakeX = (Math.random() - 0.5) * 7 * decay;
      shakeY = (Math.random() - 0.5) * 7 * decay;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawTurf(t);
    drawDots();
    if (phase !== 'settled') tickSequence(ts);
    drawDust();
    drawConfetti();
    ctx.restore();

    rafId = requestAnimationFrame(frame);
  }

  function play() {
    var now = performance.now();
    if (now - lastPlay < COOLDOWN) return;
    if (phase !== 'idle' && phase !== 'settled') return;
    lastPlay = now;

    hero.classList.remove('hero-anim');
    if (crest) crest.classList.remove('crest-pop');
    // force reflow so the CSS animations restart on next class add
    // eslint-disable-next-line no-unused-expressions
    void hero.offsetWidth;

    target = getTarget();
    phase = 'address';
    phaseStart = performance.now();
    tipTrail.length = 0;
    shakeStart = -Infinity;

    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  resize();
  initDots();
  rafId = requestAnimationFrame(frame);
  lastPlay = -Infinity;
  phaseStart = performance.now();

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
  }
})();
