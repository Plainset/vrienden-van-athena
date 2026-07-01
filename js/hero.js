/*
  Hero: "De wedstrijd in vier tellen" — a real-footage film edit.

  Four frames of real match photography (Robert Janssen Fotografie, AthenA's
  own men's team) play full-screen like a filmed title sequence: anticipation
  over the ball -> the carry -> the strike (turf spray frozen mid-air) -> the
  follow-through as the ball leaves frame. Hard cuts between frames, a slow
  push-in on each — restrained, documentary-style camera work. The film then
  fades into the existing ending: the ambient photo backdrop, the crest pop
  and the rising headline.

  Every pixel of the sequence is a real photograph of a real player — no
  rendered stick, no synthetic ball, no particle effects in the game action.

  - Replays every time the hero scrolls back into view (cooldown-guarded).
  - The whole film is driven by requestAnimationFrame timestamps (inline
    styles, no CSS-clock animations), so it never desyncs in throttled tabs.
  - Waits for all four frames to decode before playing; if any photo fails
    to load, the film is skipped and the hero settles directly.
  - Respects prefers-reduced-motion (static final state via CSS) and keeps
    working without JS (.no-js shows the settled hero).
*/
(function () {
  document.documentElement.classList.remove('no-js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hero = document.querySelector('.hero');
  var canvas = document.getElementById('heroCanvas');
  var crest = document.getElementById('heroCrest');
  var film = document.getElementById('heroFilm');

  if (!hero || !canvas) return;

  if (reduceMotion) {
    // Static hero only — crest/headline show via the reduced-motion CSS rules.
    return;
  }

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  // ---- crossfading real match-photo backdrop (Ken Burns loop) ----
  // Runs underneath the film; visible once the sequence settles.
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

  var W = 0, H = 0;

  // ---- the film ----
  // Each shot: which frame element, how long it holds, and the camera move
  // (scale + drift as fractions of the frame size). Cuts between shots are
  // hard cuts — like a real match edit.
  var frames = film ? film.querySelectorAll('.hero-frame') : [];
  var SHOTS = [
    // 1. Anticipation: two players coiled over their sticks. Slow push-in.
    { dur: 1300, s0: 1.03, s1: 1.08, x0: 0, x1: 0, ease: easeOutQuad },
    // 2. The carry: ball glued to the blade mid-run. Camera tracks the run.
    { dur: 1300, s0: 1.03, s1: 1.07, x0: 0.7, x1: -0.7, ease: easeOutQuad },
    // 3. The strike: blade through the ball, spray frozen. Push toward contact.
    { dur: 1400, s0: 1.04, s1: 1.11, x0: 0, x1: 0, ease: easeOutQuad },
    // 4. Follow-through, ball gone: the camera eases back out — release.
    { dur: 1100, s0: 1.09, s1: 1.02, x0: 0, x1: 0, ease: easeInOutQuad }
  ];
  var FADE_IN_MS = 240;   // film fades up from the dark page background
  var REVEAL_MS = 700;    // film fades out to the settled hero
  var filmOK = film && frames.length === SHOTS.length;

  // idle -> shot 0..3 -> reveal -> settled
  var phase = 'idle';
  var shotIdx = 0;
  var phaseStart = 0;
  var revealFired = false;
  var lastPlay = -Infinity;
  var COOLDOWN = 1200;

  // ---- assets: wait for every frame photo before rolling ----
  var pendingPlay = false;
  var framesToLoad = 0;
  var framesFailed = 0;
  (function watchFrames() {
    if (!filmOK) return;
    for (var i = 0; i < frames.length; i++) {
      var img = frames[i];
      if (img.complete && img.naturalWidth > 0) continue;
      if (img.complete) { framesFailed++; continue; }
      framesToLoad++;
      img.addEventListener('load', frameSettled);
      img.addEventListener('error', function () { framesFailed++; frameSettled(); });
    }
  })();
  function frameSettled() {
    framesToLoad--;
    if (pendingPlay && assetsReady()) play();
  }
  function assetsReady() { return !filmOK || framesToLoad <= 0; }

  // ---- confetti (part of the existing crest ending) ----
  var confetti = [];
  var CONFETTI_COLORS = ['#E11F2B', '#5FB8BE', '#ffffff', '#8fd8dc'];

  var running = true;
  var rafId = null;

  function easeOutQuad(x) { return 1 - (1 - x) * (1 - x); }
  function easeInOutQuad(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
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
  }

  function getCrestTarget() {
    if (!crest) return { x: W / 2, y: H * 0.4 };
    var cr = crest.getBoundingClientRect();
    var hr = hero.getBoundingClientRect();
    return { x: cr.left + cr.width / 2 - hr.left, y: cr.top + cr.height / 2 - hr.top };
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

  function setFrameTransform(el, shot, p) {
    var e = shot.ease(p);
    var s = shot.s0 + (shot.s1 - shot.s0) * e;
    var x = shot.x0 + (shot.x1 - shot.x0) * e;
    el.style.transform = 'translate3d(' + x.toFixed(3) + '%, 0, 0) scale(' + s.toFixed(4) + ')';
  }

  function showOnly(idx) {
    for (var i = 0; i < frames.length; i++) {
      frames[i].style.opacity = i === idx ? '1' : '0';
    }
  }

  function fireReveal(now) {
    if (revealFired) return;
    revealFired = true;
    hero.classList.add('hero-anim');
    if (crest) crest.classList.add('crest-pop');
    var t = getCrestTarget();
    spawnConfetti(t.x, t.y, lowFi ? 14 : 26);
  }

  function renderFilm(now) {
    if (phase === 'idle' || phase === 'settled') return;
    var elapsed = now - phaseStart;

    if (phase === 'shot') {
      var shot = SHOTS[shotIdx];
      if (elapsed >= shot.dur) {
        // hard cut to the next shot — or hand off to the reveal
        if (shotIdx < SHOTS.length - 1) {
          shotIdx++;
          phaseStart = now;
          showOnly(shotIdx);
          setFrameTransform(frames[shotIdx], SHOTS[shotIdx], 0);
        } else {
          phase = 'reveal';
          phaseStart = now;
          fireReveal(now);
        }
        return;
      }
      var p = clamp01(elapsed / shot.dur);
      setFrameTransform(frames[shotIdx], shot, p);
      // the film fades up from the dark page background on the first shot
      if (shotIdx === 0) {
        film.style.opacity = clamp01(elapsed / FADE_IN_MS).toFixed(3);
      }
    } else if (phase === 'reveal') {
      var q = clamp01(elapsed / REVEAL_MS);
      // last frame holds its settled pose while the film fades out
      film.style.opacity = (1 - easeInOutQuad(q)).toFixed(3);
      if (q >= 1) {
        phase = 'settled';
        film.style.opacity = '0';
      }
    }
  }

  var lastTs = 0;

  function frame(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    // layout may not be ready yet (or the hero may be collapsed) — retry
    if (W < 2 || H < 2) {
      resize();
      if (W < 2 || H < 2) return;
    }

    // rAF stops in hidden tabs / off-screen heroes; treat big gaps as a pause
    // (shift the phase clock) so the film resumes instead of skipping ahead
    // with a half-finished fade stranded on screen.
    if (lastTs && ts - lastTs > 250 && (phase === 'shot' || phase === 'reveal')) {
      phaseStart += ts - lastTs;
    }
    lastTs = ts;

    renderFilm(ts);

    ctx.clearRect(0, 0, W, H);
    drawConfetti();
  }

  function play() {
    var now = performance.now();
    if (now - lastPlay < COOLDOWN) return;
    if (phase !== 'idle' && phase !== 'settled') return;
    if (!assetsReady()) { pendingPlay = true; return; } // roll once the photos arrive
    pendingPlay = false;
    lastPlay = now;

    hero.classList.remove('hero-anim');
    if (crest) crest.classList.remove('crest-pop');
    // force reflow so the CSS animations restart on next class add
    // eslint-disable-next-line no-unused-expressions
    void hero.offsetWidth;
    revealFired = false;

    // any frame photo missing -> skip the film, settle immediately
    if (!filmOK || framesFailed > 0) {
      if (film) film.style.opacity = '0';
      phase = 'settled';
      fireReveal(now);
      return;
    }

    phase = 'shot';
    shotIdx = 0;
    phaseStart = now;
    film.style.opacity = '0';
    showOnly(0);
    setFrameTransform(frames[0], SHOTS[0], 0);

    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  resize();
  rafId = requestAnimationFrame(frame);

  window.addEventListener('resize', resize, { passive: true });

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
