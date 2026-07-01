/*
  Hero: one continuous take of real match footage.

  A single live-action shot (© Xavier Caré / Wikimedia Commons / CC BY-SA 3.0,
  trimmed and graded): a player walks up to the ball, sets himself, sweeps a
  full pass with a deep follow-through, the ball exits frame and he settles —
  at which point the film fades into the existing ending (ambient photo
  backdrop, crest pop, rising headline). No cuts, no synthetic elements: the
  entire sequence is genuine filmed field hockey.

  - Replays every time the hero scrolls back into view (cooldown-guarded).
  - The reveal starts just before the clip ends, during the player's settle,
    so the handoff to the branding sequence feels continuous.
  - The fade in/out runs on requestAnimationFrame timestamps with pause
    semantics: leave the tab (or scroll away) mid-fade and it resumes where
    it stopped instead of stranding a half-faded frame.
  - Waits for the video to buffer before rolling; if it can't play (error or
    a very slow connection), the hero settles directly and tries the film
    again on the next scroll-return.
  - Respects prefers-reduced-motion (static hero via CSS) and works without
    JS (.no-js hides the film and shows the settled hero).
*/
(function () {
  document.documentElement.classList.remove('no-js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hero = document.querySelector('.hero');
  var canvas = document.getElementById('heroCanvas');
  var crest = document.getElementById('heroCrest');
  var film = document.getElementById('heroFilm'); // <video>

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

  // ---- the film (a real continuous video clip) ----
  var FADE_IN_MS = 240;   // film fades up from the page background
  var REVEAL_MS = 700;    // film fades out to the settled hero
  var REVEAL_AT = 5.25;   // start the reveal during the player's settle (clip is ~5.8s)

  // idle -> film -> reveal -> settled
  var phase = 'idle';
  var phaseStart = 0;
  var revealFired = false;
  var lastPlay = -Infinity;
  var COOLDOWN = 1200;

  var filmOK = !!film;
  var videoReady = false;
  var videoFailed = false;
  var pendingPlay = false;
  var watchdog = null;

  if (film) {
    film.muted = true; // belt-and-braces for programmatic autoplay
    if (film.readyState >= 3) videoReady = true;
    film.addEventListener('canplaythrough', function () {
      videoReady = true;
      if (pendingPlay) play();
    });
    // capture phase so <source> errors bubble here too
    film.addEventListener('error', function () {
      videoFailed = true;
      if (pendingPlay) play();
    }, true);
    film.addEventListener('timeupdate', function () {
      if (phase === 'film' && film.currentTime >= REVEAL_AT) beginReveal(performance.now());
    });
    // backstop in case timeupdate granularity skips REVEAL_AT
    film.addEventListener('ended', function () {
      if (phase === 'film') beginReveal(performance.now());
    });
  }

  // ---- confetti (part of the existing crest ending) ----
  var confetti = [];
  var CONFETTI_COLORS = ['#E11F2B', '#5FB8BE', '#ffffff', '#8fd8dc'];

  var running = true;
  var rafId = null;

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

  function fireReveal() {
    if (revealFired) return;
    revealFired = true;
    hero.classList.add('hero-anim');
    if (crest) crest.classList.add('crest-pop');
    var t = getCrestTarget();
    spawnConfetti(t.x, t.y, lowFi ? 14 : 26);
  }

  function beginReveal(now) {
    phase = 'reveal';
    phaseStart = now;
    fireReveal();
  }

  function settle() {
    phase = 'settled';
    if (film) {
      film.style.opacity = '0';
      film.pause();
    }
    fireReveal();
  }

  function renderFilm(now) {
    if (phase === 'idle' || phase === 'settled' || !film) return;
    var elapsed = now - phaseStart;

    if (phase === 'film') {
      // fade the film up from the page background, then let it run
      film.style.opacity = clamp01(elapsed / FADE_IN_MS).toFixed(3);
    } else if (phase === 'reveal') {
      var q = clamp01(elapsed / REVEAL_MS);
      // the clip keeps playing its last settling second underneath the fade
      film.style.opacity = (1 - easeInOutQuad(q)).toFixed(3);
      if (q >= 1) settle();
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
    // (shift the phase clock) so fades resume instead of skipping ahead.
    if (lastTs && ts - lastTs > 250 && (phase === 'film' || phase === 'reveal')) {
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

    // no film, or the video can't play -> settle straight into the branding
    if (!filmOK || videoFailed) {
      lastPlay = now;
      resetReveal();
      settle();
      return;
    }

    if (!videoReady) {
      // roll once the clip has buffered; if that takes too long, settle now
      // and let the next scroll-return try the film again
      pendingPlay = true;
      if (!watchdog) {
        watchdog = setTimeout(function () {
          watchdog = null;
          if (pendingPlay && !videoReady) {
            pendingPlay = false;
            resetReveal();
            settle();
          }
        }, 4000);
      }
      return;
    }
    pendingPlay = false;
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    lastPlay = now;

    resetReveal();

    phase = 'film';
    phaseStart = now;
    film.style.opacity = '0';
    try { film.currentTime = 0; } catch (e) { /* not seekable yet */ }
    var p = film.play();
    if (p && p.catch) {
      p.catch(function () {
        // autoplay refused or decode hiccup — settle rather than hang dark
        videoFailed = true;
        settle();
      });
    }

    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  function resetReveal() {
    hero.classList.remove('hero-anim');
    if (crest) crest.classList.remove('crest-pop');
    // force reflow so the CSS animations restart on next class add
    // eslint-disable-next-line no-unused-expressions
    void hero.offsetWidth;
    revealFired = false;
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

        // pause the clip while the hero is off-screen, resume where it left off
        if (film && phase === 'film') {
          if (!running && !film.paused) film.pause();
          if (running && film.paused) { var pr = film.play(); if (pr && pr.catch) pr.catch(function () {}); }
        }

        var visibleEnough = ratio >= 0.45;
        if (visibleEnough && !wasVisible) play();
        wasVisible = visibleEnough;
      });
    }, { threshold: [0, 0.45] });
    io.observe(hero);
  }
})();
