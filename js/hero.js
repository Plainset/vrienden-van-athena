/*
  Hero animation: "Into the game" — a full-screen, first-person POV sequence.

  You are the player: a photoreal dusk pitch fills the hero (generated still,
  assets/img/pov-pitch.jpg), your real stick (photo cutout) reaches into the
  frame from the bottom right. The stick dribbles the ball twice to the left
  (the camera pans with you), winds up, and rips a shot deep into the screen
  toward the goal on the horizon. Impact -> whiteout -> the club crest pops in
  over the real match-photo backdrop, headline and CTAs rise.

  - Replays every time the hero scrolls back into view (cooldown-guarded).
  - Everything is drawn into an offscreen scene canvas that gets composited
    with a single alpha, so the whole "game world" can fade out cleanly to
    reveal the photo backdrop underneath.
  - Respects prefers-reduced-motion (static final state via CSS) and scales
    down (dpr, particles) on small/low-power devices.
  - Progressive enhancement: without JS the static HTML/CSS shows the final
    state (crest, headline, photos) via .no-js.
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
  // Runs underneath the game scene; visible once the sequence settles.
  (function initHeroPhotos() {
    var photos = document.querySelectorAll('.hero-photo');
    if (photos.length < 2) return;
    var idx = 0;
    setInterval(function () {
      // throttled background tabs fire missed ticks in a burst, which would
      // interrupt every crossfade and strand all photos at opacity 0
      if (document.hidden) return;
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

  var dpr = lowFi ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  var dotCount = lowFi ? 14 : 32;

  var W = 0, H = 0;

  // Offscreen canvas: the whole POV world renders here, then gets blitted to
  // the main canvas with a single global alpha (clean fade to the photos).
  var scene = document.createElement('canvas');
  var sctx = scene.getContext('2d');

  // ---- assets ----
  var pendingPlay = false;
  function assetsReady() { return stickReady && pitchReady; }

  var stickImg = new Image();
  var stickReady = false;
  stickImg.onload = function () { stickReady = true; if (pendingPlay && assetsReady()) play(); };
  stickImg.onerror = function () { stickReady = true; if (pendingPlay && assetsReady()) play(); };
  stickImg.src = 'assets/img/hockey-stick.png';
  // Measured from the stick asset (667x900): grip position + shaft direction.
  var STICK_W = 667, STICK_H = 900;
  var GRIP = { x: 29, y: 11 };
  var SHAFT_ANGLE = 1.0517;
  var GRIP_TO_TIP_PX = 1006;
  var IMG_CORRECTION = -Math.PI / 2 - SHAFT_ANGLE;

  var pitchImg = new Image();
  var pitchReady = false;
  pitchImg.onload = function () { pitchReady = true; if (pendingPlay && assetsReady()) play(); };
  pitchImg.onerror = function () { pitchReady = true; if (pendingPlay && assetsReady()) play(); };
  pitchImg.src = 'assets/img/pov-pitch.jpg';
  // Measured on the pitch still: goal mouth center + floodlight heads,
  // as fractions of the image, so any crop/zoom keeps them anchored.
  var GOAL_F = { x: 0.500, y: 0.430 };
  var LIGHTS_F = [
    { x: 0.107, y: 0.105 }, { x: 0.243, y: 0.213 },
    { x: 0.744, y: 0.222 }, { x: 0.894, y: 0.095 }
  ];

  // ---- timeline ----
  // approach -> tap1 -> tap2 -> windup -> strike -> flight -> impact -> reveal -> settled
  var PHASES = ['approach', 'tap1', 'tap2', 'windup', 'strike', 'flight', 'impact', 'reveal'];
  var DUR = { approach: 700, tap1: 560, tap2: 560, windup: 400, strike: 170, flight: 640, impact: 260, reveal: 460 };

  var phase = 'idle';
  var phaseStart = 0;
  var sceneAlpha = 0;
  var whiteout = 0;
  var revealFired = false;
  var lastPlay = -Infinity;
  var COOLDOWN = 1200;

  // Ball rest points across the two dribbles, as screen fractions.
  var BALL_P = [
    { x: 0.60, y: 0.800 },
    { x: 0.47, y: 0.790 },
    { x: 0.355, y: 0.780 }
  ];
  var PAN_STEP = 0.05; // backdrop shifts right per leftward dribble (fraction of W)

  var BASE_ZOOM = 1.18; // cover overscan -> headroom for the pan

  var cam = { pan: 0, zoomPush: 0, shakeStart: -1e9, shakeAmp: 0 };
  var SHAKE_MS = 240;

  var tapped1 = false, tapped2 = false;

  // fx state
  var dust = [];
  var confetti = [];
  var dots = [];
  var tipTrail = [];
  var ballTrail = [];
  var speedAngles = [];
  var flightFrom = { x: 0, y: 0 };
  var flash = { t: -1e9, x: 0, y: 0, r: 0 };

  var CONFETTI_COLORS = ['#E11F2B', '#5FB8BE', '#ffffff', '#8fd8dc'];
  var DUST_COLORS = ['#eef3f5', '#c9d3d6', '#7d8a5e', '#9aa878'];

  var running = true;
  var rafId = null;

  function easeInQuad(x) { return x * x; }
  function easeOutQuad(x) { return 1 - (1 - x) * (1 - x); }
  function easeInOutQuad(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function resize() {
    var rect = hero.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.width = canvas.width;
    scene.height = canvas.height;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
  }

  function ballRadius() { return Math.max(14, Math.min(40, Math.min(H * 0.05, W * 0.075))); }
  function stickPivot() { return { x: W * 0.88, y: H * 1.30 }; }
  // On narrow screens a full windup would carry the stick entirely out of
  // frame; cap the sweep so the shaft stays visible at the edge.
  function windupRad() { return W < 700 ? 0.6 : 1.15; }

  function initDots() {
    dots = [];
    for (var i = 0; i < dotCount; i++) {
      dots.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1.2 + Math.random() * 2.4,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.04 - Math.random() * 0.1
      });
    }
  }

  // Maps the pitch image onto the screen (cover + zoom), shifted by camera
  // pan/bob/shake. Returns the draw transform, so image-fraction anchors
  // (goal, floodlights) can be projected to screen px.
  function coverTransform(bobY, shakeX, shakeY) {
    var pw = pitchImg.naturalWidth || 1600;
    var ph = pitchImg.naturalHeight || 893;
    var s = Math.max(W / pw, H / ph) * BASE_ZOOM * (1 + cam.zoomPush);
    var dx = (W - pw * s) / 2 + cam.pan * W + shakeX;
    var dy = (H - ph * s) / 2 + bobY + shakeY;
    return { s: s, dx: dx, dy: dy, pw: pw, ph: ph };
  }

  function projectF(cv, fx, fy) {
    return { x: cv.dx + fx * cv.pw * cv.s, y: cv.dy + fy * cv.ph * cv.s };
  }

  function shakeOffset(now) {
    var e = now - cam.shakeStart;
    if (e < 0 || e >= SHAKE_MS) return { x: 0, y: 0 };
    var decay = 1 - e / SHAKE_MS;
    return {
      x: (Math.random() - 0.5) * 2 * cam.shakeAmp * decay,
      y: (Math.random() - 0.5) * 2 * cam.shakeAmp * decay
    };
  }

  function drawBackdrop(cv, now) {
    if (pitchReady) {
      sctx.drawImage(pitchImg, cv.dx, cv.dy, cv.pw * cv.s, cv.ph * cv.s);
    } else {
      // Fallback while (or if) the still hasn't loaded: dusk gradient pitch.
      var horizon = cv.dy + 0.44 * cv.ph * cv.s;
      var sky = sctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#1a1f3d');
      sky.addColorStop(1, '#3d3357');
      sctx.fillStyle = sky;
      sctx.fillRect(0, 0, W, horizon);
      var turf = sctx.createLinearGradient(0, horizon, 0, H);
      turf.addColorStop(0, '#2c4a33');
      turf.addColorStop(1, '#16281b');
      sctx.fillStyle = turf;
      sctx.fillRect(0, horizon, W, H - horizon);
    }
    // Gentle floodlight "breathing" blooms keep the still alive.
    sctx.save();
    sctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < LIGHTS_F.length; i++) {
      var p = projectF(cv, LIGHTS_F[i].x, LIGHTS_F[i].y);
      var r = cv.pw * cv.s * 0.045;
      var a = 0.05 + 0.04 * Math.sin(now / 620 + i * 1.7);
      if (a <= 0) continue;
      var g = sctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(255,240,205,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,240,205,0)');
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      sctx.fill();
    }
    sctx.restore();
  }

  function drawBall(x, y, r) {
    sctx.save();
    sctx.beginPath();
    sctx.fillStyle = 'rgba(0,0,0,0.35)';
    sctx.ellipse(x, y + r * 0.85, r * 1.15, r * 0.32, 0, 0, Math.PI * 2);
    sctx.fill();
    sctx.restore();

    sctx.save();
    var grad = sctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#f0f3f4');
    grad.addColorStop(1, '#c3c9cd');
    sctx.beginPath();
    sctx.fillStyle = grad;
    sctx.shadowColor = 'rgba(0,0,0,0.4)';
    sctx.shadowBlur = r;
    sctx.shadowOffsetY = r * 0.3;
    sctx.arc(x, y, r, 0, Math.PI * 2);
    sctx.fill();
    sctx.restore();
  }

  // The stick always aims its blade at (bx, by), rotated by `offset` around
  // the off-screen grip pivot — so it tracks the ball wherever it rests.
  function drawStick(bx, by, offset, alpha, trailTip) {
    if (!stickReady) return;
    var pivot = stickPivot();
    var dx = bx - pivot.x;
    var dy = pivot.y - by;
    var aim = Math.atan2(dx, dy);
    var len = Math.sqrt(dx * dx + dy * dy) * 0.99;
    var imgScale = len / GRIP_TO_TIP_PX;

    if (trailTip) {
      var a = aim + offset;
      tipTrail.push({ x: pivot.x + Math.sin(a) * len, y: pivot.y - Math.cos(a) * len });
      if (tipTrail.length > 9) tipTrail.shift();
    }

    sctx.save();
    sctx.globalAlpha = alpha;
    sctx.shadowColor = 'rgba(0,0,0,0.5)';
    sctx.shadowBlur = 26;
    sctx.shadowOffsetX = 10;
    sctx.shadowOffsetY = 16;
    sctx.translate(pivot.x, pivot.y);
    sctx.rotate(aim + offset);
    sctx.rotate(IMG_CORRECTION);
    sctx.translate(-GRIP.x * imgScale, -GRIP.y * imgScale);
    sctx.drawImage(stickImg, 0, 0, STICK_W * imgScale, STICK_H * imgScale);
    sctx.restore();
  }

  function drawSwoosh() {
    if (tipTrail.length < 2) return;
    sctx.save();
    sctx.lineCap = 'round';
    for (var i = 1; i < tipTrail.length; i++) {
      var p0 = tipTrail[i - 1];
      var p1 = tipTrail[i];
      var frac = i / tipTrail.length;
      sctx.strokeStyle = 'rgba(255,255,255,' + (frac * 0.4).toFixed(3) + ')';
      sctx.lineWidth = 3 + frac * 14;
      sctx.beginPath();
      sctx.moveTo(p0.x, p0.y);
      sctx.lineTo(p1.x, p1.y);
      sctx.stroke();
    }
    sctx.restore();
  }

  function spawnDust(x, y, count) {
    for (var i = 0; i < count; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      var speed = 1.2 + Math.random() * 3.2;
      dust.push({
        x: x, y: y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        g: 0.13,
        life: 1,
        decay: 0.026 + Math.random() * 0.02,
        size: 1.5 + Math.random() * 2.6,
        color: DUST_COLORS[i % DUST_COLORS.length]
      });
    }
  }

  function drawDust() {
    sctx.save();
    for (var i = dust.length - 1; i >= 0; i--) {
      var d = dust[i];
      d.vy += d.g;
      d.x += d.vx;
      d.y += d.vy;
      d.life -= d.decay;
      if (d.life <= 0) { dust.splice(i, 1); continue; }
      sctx.globalAlpha = Math.max(0, d.life) * 0.75;
      sctx.beginPath();
      sctx.fillStyle = d.color;
      sctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      sctx.fill();
    }
    sctx.restore();
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
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFlash(now) {
    var e = now - flash.t;
    var durMs = 160;
    if (e < 0 || e >= durMs) return;
    var p = e / durMs;
    var r = flash.r * (0.5 + p);
    var a = (1 - p) * 0.9;
    sctx.save();
    sctx.globalCompositeOperation = 'lighter';
    var g = sctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, r);
    g.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(flash.x, flash.y, r, 0, Math.PI * 2);
    sctx.fill();
    sctx.restore();
  }

  function drawSpeedLines(p) {
    var a = (1 - p) * 0.22;
    if (a <= 0) return;
    sctx.save();
    sctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    sctx.lineWidth = 1.5;
    var cx = W / 2, cy = H * 0.45;
    var reach = Math.max(W, H);
    for (var i = 0; i < speedAngles.length; i++) {
      var ang = speedAngles[i];
      var inner = reach * (0.34 + 0.1 * ((i * 37) % 10) / 10);
      sctx.beginPath();
      sctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
      sctx.lineTo(cx + Math.cos(ang) * reach, cy + Math.sin(ang) * reach);
      sctx.stroke();
    }
    sctx.restore();
  }

  function ballPoint(i) {
    return { x: BALL_P[i].x * W, y: BALL_P[i].y * H };
  }

  function getCrestTarget() {
    if (!crest) return { x: W / 2, y: H * 0.4 };
    var cr = crest.getBoundingClientRect();
    var hr = hero.getBoundingClientRect();
    return { x: cr.left + cr.width / 2 - hr.left, y: cr.top + cr.height / 2 - hr.top };
  }

  function advancePhase(now) {
    var i = PHASES.indexOf(phase);
    if (i < 0) return;
    var elapsed = now - phaseStart;
    if (elapsed < DUR[phase]) return;
    if (phase === 'reveal') {
      phase = 'settled';
      return;
    }
    var next = PHASES[i + 1];
    phaseStart = now;
    if (next === 'flight') {
      // strike -> flight boundary IS ball contact
      var bp = ballPoint(2);
      flightFrom.x = bp.x;
      flightFrom.y = bp.y;
      flash.t = now; flash.x = bp.x; flash.y = bp.y; flash.r = ballRadius() * 4;
      spawnDust(bp.x, bp.y, lowFi ? 10 : 20);
      cam.shakeStart = now; cam.shakeAmp = 8;
      ballTrail = [];
    }
    if (next === 'impact') {
      var cv = coverTransform(0, 0, 0);
      var gp = projectF(cv, GOAL_F.x, GOAL_F.y);
      flash.t = now; flash.x = gp.x; flash.y = gp.y; flash.r = 40;
      cam.shakeStart = now; cam.shakeAmp = 10;
    }
    if (next === 'reveal' && !revealFired) {
      revealFired = true;
      hero.classList.add('hero-anim');
      if (crest) crest.classList.add('crest-pop');
      var t = getCrestTarget();
      spawnConfetti(t.x, t.y, lowFi ? 14 : 26);
    }
    phase = next;
  }

  // Small dribble-tap swing: quick pull back, snap through, recover.
  function tapOffset(p) {
    if (p < 0.35) return 0.14 * easeOutQuad(p / 0.35);
    if (p < 0.55) return 0.14 - 0.19 * easeInQuad((p - 0.35) / 0.2);
    return -0.05 + 0.05 * easeOutQuad((p - 0.55) / 0.45);
  }

  function renderScene(now) {
    var elapsed = now - phaseStart;
    var p = clamp01(elapsed / (DUR[phase] || 1));

    // camera: gentle handheld bob before the shot, still during flight
    var preFlight = (phase === 'approach' || phase === 'tap1' || phase === 'tap2' || phase === 'windup' || phase === 'strike');
    var bobY = Math.sin(now / 420) * (preFlight ? 3.2 : 1);

    // camera pan follows the two leftward dribbles
    if (phase === 'tap1') cam.pan = PAN_STEP * easeInOutQuad(clamp01((p - 0.5) / 0.5));
    else if (phase === 'tap2') cam.pan = PAN_STEP + PAN_STEP * easeInOutQuad(clamp01((p - 0.5) / 0.5));
    else if (phase === 'approach') cam.pan = 0;

    // push-in while the ball flies
    if (phase === 'flight') cam.zoomPush = 0.05 * easeInQuad(p);
    else if (phase === 'impact' || phase === 'reveal') cam.zoomPush = 0.05;
    else cam.zoomPush = 0;

    var sh = shakeOffset(now);
    var cv = coverTransform(bobY, sh.x, sh.y);

    sctx.clearRect(0, 0, W, H);
    drawBackdrop(cv, now);

    var r0 = ballRadius();
    var bx, by, q;

    if (phase === 'approach') {
      var b0 = ballPoint(0);
      drawStick(b0.x, b0.y, Math.sin(now / 300) * 0.02, 1, false);
      drawBall(b0.x, b0.y, r0); // ball in front of the blade (POV)
    } else if (phase === 'tap1' || phase === 'tap2') {
      var fromI = phase === 'tap1' ? 0 : 1;
      var a0 = ballPoint(fromI);
      var a1 = ballPoint(fromI + 1);
      if (p < 0.5) {
        bx = a0.x; by = a0.y;
      } else {
        q = (p - 0.5) / 0.5;
        bx = a0.x + (a1.x - a0.x) * easeOutQuad(q);
        by = a0.y + (a1.y - a0.y) * q - Math.sin(Math.PI * q) * H * 0.028;
      }
      if (phase === 'tap1' && !tapped1 && p >= 0.5) {
        tapped1 = true;
        spawnDust(a0.x, a0.y, lowFi ? 5 : 9);
        cam.shakeStart = now; cam.shakeAmp = 3;
      }
      if (phase === 'tap2' && !tapped2 && p >= 0.5) {
        tapped2 = true;
        spawnDust(a0.x, a0.y, lowFi ? 5 : 9);
        cam.shakeStart = now; cam.shakeAmp = 3;
      }
      // the stick swings at the ball's REST point, then tracks toward the new one
      var aimAt = p < 0.7 ? a0 : a1;
      drawStick(aimAt.x, aimAt.y, tapOffset(p), 1, false);
      drawBall(bx, by, r0);
    } else if (phase === 'windup') {
      var b2 = ballPoint(2);
      drawStick(b2.x, b2.y, windupRad() * easeInOutQuad(p), 1, true);
      drawSwoosh();
      drawBall(b2.x, b2.y, r0);
    } else if (phase === 'strike') {
      var b2s = ballPoint(2);
      drawStick(b2s.x, b2s.y, windupRad() * (1 - easeInQuad(p)), 1, true);
      drawSwoosh();
      drawBall(b2s.x, b2s.y, r0);
    } else if (phase === 'flight') {
      var gp = projectF(cv, GOAL_F.x, GOAL_F.y);
      var e = easeOutCubic(p);
      bx = flightFrom.x + (gp.x - flightFrom.x) * e;
      by = flightFrom.y + (gp.y - flightFrom.y) * e - Math.sin(Math.PI * p) * H * 0.09;
      var r = r0 + (2.5 - r0) * e;

      ballTrail.push({ x: bx, y: by, r: r });
      if (ballTrail.length > 14) ballTrail.shift();
      if (ballTrail.length > 1) {
        sctx.save();
        sctx.globalCompositeOperation = 'lighter';
        sctx.lineCap = 'round';
        for (var i = 1; i < ballTrail.length; i++) {
          var t0 = ballTrail[i - 1];
          var t1 = ballTrail[i];
          var frac = i / ballTrail.length;
          sctx.strokeStyle = 'rgba(255,255,255,' + (frac * 0.5).toFixed(3) + ')';
          sctx.lineWidth = Math.max(1.5, t1.r * (0.4 + frac * 1.1));
          sctx.beginPath();
          sctx.moveTo(t0.x, t0.y);
          sctx.lineTo(t1.x, t1.y);
          sctx.stroke();
        }
        sctx.restore();
      }

      drawSpeedLines(p);
      drawBall(bx, by, Math.max(2.5, r));

      // follow-through: stick sweeps past and fades
      var fo = -0.1 - 0.4 * easeOutQuad(clamp01(p / 0.5));
      var fa = Math.max(0, 1 - p / 0.55);
      if (fa > 0) drawStick(flightFrom.x, flightFrom.y, fo, fa, p < 0.3);
      if (tipTrail.length && p >= 0.3) tipTrail.shift();
      drawSwoosh();
    } else if (phase === 'impact' || phase === 'reveal') {
      // ball is in the net; a last flash lingers at the goal
      tipTrail.length = 0;
    }

    drawDust();
    drawFlash(now);
  }

  function frame(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    // layout may not be ready yet (or the hero may be collapsed) — retry
    if (W < 2 || H < 2) {
      resize();
      if (W < 2 || H < 2) return;
      initDots();
    }

    advancePhase(ts);
    var elapsed = ts - phaseStart;
    var p = clamp01(elapsed / (DUR[phase] || 1));

    // scene fade-in at start, fade-out during reveal
    if (phase === 'approach') sceneAlpha = clamp01(elapsed / 180);
    else if (phase === 'reveal') sceneAlpha = 1 - easeOutQuad(clamp01(p / 0.55));
    else if (phase === 'settled' || phase === 'idle') sceneAlpha = 0;
    else sceneAlpha = 1;

    // whiteout swells over impact, washes away over reveal
    if (phase === 'impact') whiteout = easeOutQuad(p) * 0.95;
    else if (phase === 'reveal') whiteout = 0.95 * (1 - easeInOutQuad(p));
    else whiteout = 0;

    ctx.clearRect(0, 0, W, H);

    if (sceneAlpha > 0) {
      renderScene(ts);
      ctx.save();
      ctx.globalAlpha = sceneAlpha;
      ctx.drawImage(scene, 0, 0, W, H);
      ctx.restore();
    }

    drawDots();
    drawConfetti();

    if (whiteout > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,' + whiteout.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function play() {
    var now = performance.now();
    if (now - lastPlay < COOLDOWN) return;
    if (phase !== 'idle' && phase !== 'settled') return;
    if (!assetsReady()) { pendingPlay = true; return; } // start once images arrive
    pendingPlay = false;
    lastPlay = now;

    hero.classList.remove('hero-anim');
    if (crest) crest.classList.remove('crest-pop');
    // force reflow so the CSS animations restart on next class add
    // eslint-disable-next-line no-unused-expressions
    void hero.offsetWidth;

    phase = 'approach';
    phaseStart = now;
    revealFired = false;
    tapped1 = false;
    tapped2 = false;
    cam.pan = 0;
    cam.zoomPush = 0;
    cam.shakeStart = -1e9;
    tipTrail = [];
    ballTrail = [];
    dust = [];
    speedAngles = [];
    var n = lowFi ? 7 : 12;
    for (var i = 0; i < n; i++) speedAngles.push(Math.random() * Math.PI * 2);

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
  }
})();
