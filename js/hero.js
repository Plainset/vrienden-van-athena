/*
  Hero: a self-playing "living tactics board".

  On load the sequence plays itself over ~4.9s, driven by a time clock
  (progress 0..1) whose phases are paced separately — the strategy build-up
  is quick, the big ball's bounce keeps its slower, readable pace. It replays
  whenever the hero scrolls back into view.

    Act 1 — the coach's board: the pitch draws itself line by line, player
            dots pop in, dashed arrows trace an attack and the ball follows
            them into the goal (flash, net shake, a confetti tick).
    Act 2 — the ball breaks out of the diagram: one oversized ball bounces
            and rolls across the full screen while the board fades away.
    Act 3 — the existing ending: the crossfading match photos return and the
            crest pops with the headline rising over them.

  The board SVG is generated at runtime so the pitch geometry fits any
  viewport. Progress is advanced in a single rAF loop and only transforms,
  opacities and stroke-dashoffsets are touched per frame; the loop pauses
  cleanly in hidden tabs / off-screen and idles once the ending settles.
  Without JS or with reduced motion the settled hero shows immediately.
*/
(function () {
  document.documentElement.classList.remove('no-js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hero = document.querySelector('.hero');
  var canvas = document.getElementById('heroCanvas');
  var crest = document.getElementById('heroCrest');
  var boardHost = document.getElementById('heroBoard');
  var ballHost = document.getElementById('heroBall');
  var cue = document.querySelector('.scroll-cue');

  if (!hero || !canvas || !boardHost || !ballHost) return;

  if (reduceMotion) {
    // Static hero only — the board hides via CSS and the crest/headline show
    // through the reduced-motion CSS rules.
    return;
  }

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  /* ---- crossfading real match-photo backdrop (Ken Burns loop) ----
     Runs underneath the board; visible once the sequence settles. */
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

  var lowFi = window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
  var dpr = lowFi ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  var W = 0, H = 0;

  /* ---------------- helpers ---------------- */

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // progress of p through the window [a, b]
  function seg(p, a, b) { return clamp01((p - a) / (b - a)); }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function easeIn(x) { return x * x * x; }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function easeOutBack(x) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ---------------- timeline (all in scroll progress p) ---------------- */

  var TL = {
    outline: [0.02, 0.13], center: [0.05, 0.12], l23: [0.08, 0.15],
    dArc: [0.10, 0.17], dotArc: [0.13, 0.18], spot: [0.155, 0.19], goal: [0.15, 0.20],
    dots: { a8: [0.18, 0.23], d2: [0.195, 0.245], a7: [0.21, 0.26], d1: [0.225, 0.275], a9: [0.24, 0.29], gk: [0.255, 0.305] },
    ballIn: [0.21, 0.25],
    arrow1: [0.25, 0.33], ball1: [0.27, 0.35],
    arrow2: [0.36, 0.45], ball2: [0.38, 0.47],
    arrow3: [0.48, 0.545], ball3: [0.50, 0.56], run9: [0.48, 0.55],
    shot: [0.570, 0.588], streak: [0.570, 0.615],
    d1shift: [0.30, 0.40], d2close: [0.50, 0.58], dive: [0.575, 0.605],
    flash: [0.588, 0.66],
    ballOut: [0.60, 0.64],
    playFade: [0.63, 0.71],
    big: [0.635, 0.87],
    bgFade: [0.82, 0.905],
    cue: [0.90, 0.97],
    goalTick: 0.592,
    reveal: 0.868, reset: 0.78
  };

  /* ---------------- the tactics board (runtime-generated SVG) ---------------- */

  var board = null;
  var uid = 0;

  function buildBoard() {
    boardHost.innerHTML = '';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' });
    boardHost.appendChild(svg);
    var defs = el('defs', {}, svg);

    // turf: deep petrol wash with faint mowing bands, sits over the photos
    var bgId = 'hbBg' + (++uid);
    var grad = el('radialGradient', { id: bgId, cx: '50%', cy: '38%', r: '85%' }, defs);
    el('stop', { offset: '0', 'stop-color': '#10404a' }, grad);
    el('stop', { offset: '0.6', 'stop-color': '#0b3038' }, grad);
    el('stop', { offset: '1', 'stop-color': '#061f25' }, grad);
    var gTurf = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#' + bgId + ')' }, gTurf);
    var bandH = H / 9;
    for (var i = 0; i < 9; i += 2) {
      el('rect', { x: 0, y: i * bandH, width: W, height: bandH, fill: 'rgba(255,255,255,.023)' }, gTurf);
    }

    // pitch geometry: a half pitch, goal at the top, center line at the bottom
    var d = H * 0.62, w = d * 1.2;
    if (w > W * 0.92) { w = W * 0.92; d = w / 1.2; }
    var x0 = (W - w) / 2;
    var y0 = Math.max(H * 0.12, (H - d) * 0.40);
    var cx = x0 + w / 2;
    var lineW = Math.max(1.6, Math.min(2.6, w * 0.0038));
    var LINE = 'rgba(255,255,255,.85)';

    function P(u, v) { return { x: x0 + u * w, y: y0 + v * d }; }

    var gPlay = el('g', {}, svg);
    var gPitch = el('g', { fill: 'none', stroke: LINE, 'stroke-width': lineW, 'stroke-linecap': 'round' }, gPlay);

    function scrubPath(dAttr, attrs, parent) {
      var p = el('path', Object.assign({ d: dAttr }, attrs || {}), parent || gPitch);
      var L = p.getTotalLength();
      p.style.strokeDasharray = L;
      p.style.strokeDashoffset = L;
      p.setAttribute('opacity', '0');
      return { el: p, L: L };
    }

    // sidelines + backline as one U-shaped stroke, center line across the bottom
    var outline = scrubPath('M' + x0 + ',' + (y0 + d) + ' L' + x0 + ',' + y0 + ' L' + (x0 + w) + ',' + y0 + ' L' + (x0 + w) + ',' + (y0 + d));
    var center = scrubPath('M' + x0 + ',' + (y0 + d) + ' L' + (x0 + w) + ',' + (y0 + d));
    var y23 = y0 + d * 0.52;
    var l23 = scrubPath('M' + x0 + ',' + y23 + ' L' + (x0 + w) + ',' + y23);
    // the shooting circle ("D") and its dotted 5m twin — the field-hockey signature
    var rD = d * 0.34;
    var dArc = scrubPath('M' + (cx - rD) + ',' + y0 + ' A' + rD + ' ' + rD + ' 0 0 0 ' + (cx + rD) + ',' + y0);
    var rD2 = rD + d * 0.10;
    var dotArc = el('path', {
      d: 'M' + (cx - rD2) + ',' + y0 + ' A' + rD2 + ' ' + rD2 + ' 0 0 0 ' + (cx + rD2) + ',' + y0,
      fill: 'none', stroke: LINE, 'stroke-width': lineW,
      'stroke-linecap': 'round', 'stroke-dasharray': '0.5 ' + (lineW * 5), opacity: 0
    }, gPitch);
    var spot = el('circle', { cx: cx, cy: y0 + d * 0.15, r: 0, fill: LINE, stroke: 'none' }, gPitch);

    // goal + net behind the backline
    var gw = Math.max(w * 0.14, 56);
    var gd = Math.min(d * 0.08, gw * 0.42);
    var gGoal = el('g', { opacity: 0 }, gPlay);
    var net = el('g', { stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1 }, gGoal);
    for (var nx = 1; nx < 6; nx++) {
      el('line', { x1: cx - gw / 2 + (gw / 6) * nx, y1: y0 - gd, x2: cx - gw / 2 + (gw / 6) * nx, y2: y0 }, net);
    }
    for (var ny = 1; ny < 3; ny++) {
      el('line', { x1: cx - gw / 2, y1: y0 - gd + (gd / 3) * ny, x2: cx + gw / 2, y2: y0 - gd + (gd / 3) * ny }, net);
    }
    el('rect', { x: cx - gw / 2, y: y0 - gd, width: gw, height: gd, fill: 'none', stroke: LINE, 'stroke-width': lineW * 1.3 }, gGoal);

    // the move
    var pA = P(0.24, 0.80), pB = P(0.80, 0.58), pBend = P(0.64, 0.285), pRec = P(0.485, 0.205);
    var shotTarget = { x: cx - gw * 0.16, y: y0 - gd * 0.30 };

    var gArrows = el('g', {}, gPlay);

    function makeArrow(dAttr, dash, color) {
      var id = 'hbA' + (++uid);
      var mask = el('mask', { id: id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
      var mpath = el('path', { d: dAttr, fill: 'none', stroke: '#fff', 'stroke-width': lineW * 6, 'stroke-linecap': 'round' }, mask);
      el('path', {
        d: dAttr, fill: 'none', stroke: color, 'stroke-width': lineW * 1.2,
        'stroke-linecap': 'round', 'stroke-dasharray': dash, mask: 'url(#' + id + ')'
      }, gArrows);
      var head = el('path', {
        d: 'M0,' + (-lineW * 2.8) + ' L' + (lineW * 7) + ',0 L0,' + (lineW * 2.8) + ' Z',
        fill: color, opacity: 0
      }, gArrows);
      var L = mpath.getTotalLength();
      mpath.style.strokeDasharray = L;
      mpath.style.strokeDashoffset = L;
      return { mpath: mpath, head: head, L: L };
    }

    var PASS = 'rgba(255,255,255,.92)';
    var CARRY = '#8fd8dc';
    var arrow1 = makeArrow('M' + pA.x + ',' + pA.y + ' Q' + P(0.56, 0.88).x + ',' + P(0.56, 0.88).y + ' ' + pB.x + ',' + pB.y, (lineW * 4) + ' ' + (lineW * 3), PASS);
    var arrow2 = makeArrow('M' + pB.x + ',' + pB.y + ' C' + P(0.86, 0.44).x + ',' + P(0.86, 0.44).y + ' ' + P(0.76, 0.34).x + ',' + P(0.76, 0.34).y + ' ' + pBend.x + ',' + pBend.y, '0.5 ' + (lineW * 3.4), CARRY);
    var arrow3 = makeArrow('M' + pBend.x + ',' + pBend.y + ' Q' + P(0.55, 0.24).x + ',' + P(0.55, 0.24).y + ' ' + pRec.x + ',' + pRec.y, (lineW * 4) + ' ' + (lineW * 3), PASS);

    // shot streak: a bright line that flashes while the ball fires goalward
    var streak = el('line', { x1: pRec.x, y1: pRec.y, x2: shotTarget.x, y2: shotTarget.y, stroke: '#fff', 'stroke-width': lineW * 1.4, 'stroke-linecap': 'round', opacity: 0 }, gPlay);

    // players
    var rDot = Math.max(11, Math.min(16, w * 0.030));
    var gDots = el('g', {}, gPlay);

    function makeDot(kind, num) {
      var g = el('g', { opacity: 0 }, gDots);
      if (kind === 'att') {
        el('circle', { r: rDot, fill: '#E11F2B', stroke: 'rgba(255,255,255,.9)', 'stroke-width': 2 }, g);
        var t = el('text', {
          'text-anchor': 'middle', dy: '0.36em', fill: '#fff',
          'font-family': "-apple-system,'SF Pro Display','Segoe UI',sans-serif",
          'font-weight': '700', 'font-size': rDot * 1.05
        }, g);
        t.textContent = num;
      } else if (kind === 'def') {
        el('circle', { r: rDot * 0.92, fill: 'rgba(95,184,190,.16)', stroke: '#5FB8BE', 'stroke-width': 2 }, g);
      } else { // keeper
        el('circle', { r: rDot * 1.05, fill: '#5FB8BE', stroke: 'rgba(255,255,255,.9)', 'stroke-width': 2 }, g);
      }
      return g;
    }

    var dots = {
      a8: { el: makeDot('att', '8'), base: pA },
      a7: { el: makeDot('att', '7'), base: pB },
      a9: { el: makeDot('att', '9'), base: P(0.32, 0.42) },
      d1: { el: makeDot('def'), base: P(0.58, 0.47) },
      d2: { el: makeDot('def'), base: P(0.40, 0.32) },
      gk: { el: makeDot('gk'), base: { x: cx, y: y0 + d * 0.035 } }
    };

    // the diagram ball
    var rB = Math.max(5.5, rDot * 0.42);
    var ball = el('circle', { r: rB, fill: '#fff', stroke: 'rgba(10,20,24,.35)', 'stroke-width': 1.2, opacity: 0 }, gPlay);

    // goal flash + expanding rings
    var flashId = 'hbF' + (++uid);
    var fgrad = el('radialGradient', { id: flashId }, defs);
    el('stop', { offset: '0', 'stop-color': 'rgba(255,255,255,.95)' }, fgrad);
    el('stop', { offset: '0.45', 'stop-color': 'rgba(180,235,240,.55)' }, fgrad);
    el('stop', { offset: '1', 'stop-color': 'rgba(95,184,190,0)' }, fgrad);
    var flashPt = { x: cx, y: y0 - gd * 0.2 };
    var flash = el('circle', { cx: flashPt.x, cy: flashPt.y, r: gw * 1.5, fill: 'url(#' + flashId + ')', opacity: 0 }, gPlay);
    var ring1 = el('circle', { cx: flashPt.x, cy: flashPt.y, r: 0, fill: 'none', stroke: 'rgba(255,255,255,.8)', 'stroke-width': 2, opacity: 0 }, gPlay);
    var ring2 = el('circle', { cx: flashPt.x, cy: flashPt.y, r: 0, fill: 'none', stroke: 'rgba(143,216,220,.7)', 'stroke-width': 2, opacity: 0 }, gPlay);

    board = {
      svg: svg, gPlay: gPlay, gGoal: gGoal,
      outline: outline, center: center, l23: l23, dArc: dArc,
      dotArc: dotArc, spot: spot, rSpot: lineW * 2.2,
      arrow1: arrow1, arrow2: arrow2, arrow3: arrow3, streak: streak,
      dots: dots, rDot: rDot, ball: ball,
      flash: flash, ring1: ring1, ring2: ring2, flashPt: flashPt,
      pA: pA, pB: pB, pBend: pBend, pRec: pRec, shotTarget: shotTarget,
      a9end: P(0.455, 0.225), gw: gw, w: w, ringMax: Math.max(W, H) * 0.35
    };
  }

  function drawScrub(sp, t) {
    if (t <= 0) { sp.el.setAttribute('opacity', '0'); sp.el.style.strokeDashoffset = sp.L; return; }
    sp.el.setAttribute('opacity', '1');
    sp.el.style.strokeDashoffset = sp.L * (1 - easeInOut(t));
  }

  function arrowScrub(A, t) {
    var tt = easeOut(clamp01(t));
    A.mpath.style.strokeDashoffset = A.L * (1 - tt);
    if (t <= 0.02) { A.head.setAttribute('opacity', '0'); return; }
    var lp = A.L * tt;
    var pt = A.mpath.getPointAtLength(lp);
    var pb = A.mpath.getPointAtLength(Math.max(0, lp - 6));
    var ang = Math.atan2(pt.y - pb.y, pt.x - pb.x) * 180 / Math.PI;
    A.head.setAttribute('transform', 'translate(' + pt.x + ',' + pt.y + ') rotate(' + ang + ')');
    A.head.setAttribute('opacity', '1');
  }

  function pathPoint(A, t) { return A.mpath.getPointAtLength(A.L * easeInOut(clamp01(t))); }

  /* ---------------- the break-out ball (act 2, DOM) ---------------- */

  var big = null;

  function buildBall() {
    ballHost.innerHTML = '';
    var R = Math.max(40, Math.min(90, H * 0.085));
    var shW = R * 2.9, shH = R * 0.62;

    var shadow = document.createElement('div');
    shadow.className = 'hb-shadow';
    shadow.style.width = shW + 'px';
    shadow.style.height = shH + 'px';
    shadow.style.background = 'radial-gradient(closest-side, rgba(4,10,12,.55), rgba(4,10,12,0))';

    var ballEl = document.createElement('div');
    ballEl.className = 'hb-ball';
    ballEl.style.width = (R * 2) + 'px';
    ballEl.style.height = (R * 2) + 'px';

    // a dimpled white field-hockey ball; the dimple group spins for the roll
    var dimples = '';
    for (var row = 0; row < 7; row++) {
      for (var col = 0; col < 7; col++) {
        var dx = 11 + col * 13 + (row % 2 ? 6.5 : 0);
        var dy = 11 + row * 13;
        dimples += '<circle cx="' + dx + '" cy="' + dy + '" r="2.4" fill="rgba(31,41,46,.07)"/>';
      }
    }
    ballEl.innerHTML =
      '<div class="hb-squash"><svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><radialGradient id="hbBall' + (++uid) + '" cx="36%" cy="30%" r="78%">' +
      '<stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#eef2f3"/>' +
      '<stop offset="0.82" stop-color="#d3dbde"/><stop offset="1" stop-color="#aeb9be"/></radialGradient>' +
      '<clipPath id="hbClip' + uid + '"><circle cx="50" cy="50" r="47.5"/></clipPath></defs>' +
      '<circle cx="50" cy="50" r="47.5" fill="url(#hbBall' + uid + ')"/>' +
      '<g class="hb-spin" clip-path="url(#hbClip' + uid + ')">' + dimples +
      '<circle cx="32" cy="38" r="3.4" fill="rgba(31,41,46,.14)"/>' +
      '<circle cx="62" cy="66" r="3.4" fill="rgba(31,41,46,.13)"/>' +
      '<circle cx="70" cy="28" r="3" fill="rgba(31,41,46,.12)"/>' +
      '</g>' +
      '<circle cx="50" cy="50" r="47.5" fill="none" stroke="rgba(10,20,24,.22)" stroke-width="1.4"/>' +
      '</svg></div>';

    ballHost.appendChild(shadow);
    ballHost.appendChild(ballEl);

    big = {
      R: R, shW: shW, shH: shH,
      ballEl: ballEl,
      squashEl: ballEl.firstChild,
      spinEl: ballEl.querySelector('.hb-spin'),
      shadowEl: shadow,
      groundY: H * 0.83,
      hops: [
        { a: 0, b: 0.34, h: H * 0.36 },
        { a: 0.34, b: 0.60, h: H * 0.17 },
        { a: 0.60, b: 0.78, h: H * 0.075 },
        { a: 0.78, b: 0.90, h: H * 0.028 },
        { a: 0.90, b: 1.01, h: 0 }
      ]
    };
  }

  function bigBall(p) {
    var u = seg(p, TL.big[0], TL.big[1]);
    if (u <= 0 || u >= 1) { ballHost.style.opacity = '0'; return; }
    ballHost.style.opacity = '1';

    var R = big.R;
    var x = lerp(-2.4 * R, W + 2.4 * R, u);

    var hgt = 0, hopH = 0;
    for (var i = 0; i < big.hops.length; i++) {
      var hop = big.hops[i];
      if (u >= hop.a && u < hop.b) {
        var s = (u - hop.a) / (hop.b - hop.a);
        hgt = hop.h * 4 * s * (1 - s);
        hopH = hop.h;
        break;
      }
    }
    var y = big.groundY - R - hgt;

    // squash on ground contact, scaled to how hard the hop lands
    var sq = 0;
    if (hopH > 0 && hgt < R * 0.6) {
      sq = (1 - hgt / (R * 0.6)) * 0.16 * Math.min(1, hopH / (H * 0.2));
    }

    var rot = (x / R) * 57.2958 * 0.9;
    big.ballEl.style.transform = 'translate3d(' + (x - R) + 'px,' + (y - R) + 'px,0)';
    big.squashEl.style.transform = 'scale(' + (1 + sq * 0.55) + ',' + (1 - sq) + ')';
    big.spinEl.setAttribute('transform', 'rotate(' + rot + ' 50 50)');

    var nh = clamp01(hgt / (H * 0.36));
    big.shadowEl.style.transform = 'translate3d(' + (x - big.shW / 2) + 'px,' + (big.groundY - big.shH * 0.45) + 'px,0) scale(' + (1 - 0.45 * nh) + ')';
    big.shadowEl.style.opacity = (0.9 * (1 - 0.75 * nh)).toFixed(3);
  }

  /* ---------------- confetti (goal tick + crest ending) ---------------- */

  var confetti = [];
  var CONFETTI_COLORS = ['#E11F2B', '#5FB8BE', '#ffffff', '#8fd8dc'];

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
  }

  function getCrestTarget() {
    if (!crest) return { x: W / 2, y: H * 0.4 };
    var cr = crest.getBoundingClientRect();
    var hr = hero.getBoundingClientRect();
    return { x: cr.left + cr.width / 2 - hr.left, y: cr.top + cr.height / 2 - hr.top };
  }

  /* ---------------- ending reveal (existing crest sequence) ---------------- */

  var revealFired = false;

  function fireReveal() {
    if (revealFired) return;
    revealFired = true;
    hero.classList.add('hero-anim');
    if (crest) crest.classList.add('crest-pop');
    var t = getCrestTarget();
    spawnConfetti(t.x, t.y, lowFi ? 14 : 26);
  }

  function resetReveal() {
    if (!revealFired) return;
    revealFired = false;
    hero.classList.remove('hero-anim');
    if (crest) crest.classList.remove('crest-pop');
    // force reflow so the CSS animations restart on the next reveal
    // eslint-disable-next-line no-unused-expressions
    void hero.offsetWidth;
  }

  /* ---------------- the master scrub ---------------- */

  var prevP = -1;
  var lastGoalBurst = -Infinity;

  function apply(p) {
    if (!board || !big) return;
    var b = board;

    if (cue) cue.style.opacity = seg(p, TL.cue[0], TL.cue[1]).toFixed(3);

    // act fades
    b.gPlay.setAttribute('opacity', (1 - seg(p, TL.playFade[0], TL.playFade[1])).toFixed(3));
    boardHost.style.opacity = (1 - seg(p, TL.bgFade[0], TL.bgFade[1])).toFixed(3);

    // pitch draws itself
    drawScrub(b.outline, seg(p, TL.outline[0], TL.outline[1]));
    drawScrub(b.center, seg(p, TL.center[0], TL.center[1]));
    drawScrub(b.l23, seg(p, TL.l23[0], TL.l23[1]));
    drawScrub(b.dArc, seg(p, TL.dArc[0], TL.dArc[1]));
    b.dotArc.setAttribute('opacity', (0.9 * seg(p, TL.dotArc[0], TL.dotArc[1])).toFixed(3));
    b.spot.setAttribute('r', Math.max(0, b.rSpot * easeOutBack(seg(p, TL.spot[0], TL.spot[1]))));
    b.gGoal.setAttribute('opacity', seg(p, TL.goal[0], TL.goal[1]).toFixed(3));

    // net shake on the goal
    var tf = seg(p, TL.flash[0], TL.flash[1]);
    var shake = tf > 0 && tf < 1 ? Math.sin(tf * Math.PI * 7) * 4 * (1 - tf) : 0;
    b.gGoal.setAttribute('transform', 'translate(' + shake.toFixed(2) + ',0)');

    // players pop in, then live through the move
    var carryT = seg(p, TL.ball2[0], TL.ball2[1]);
    for (var key in b.dots) {
      var dot = b.dots[key];
      var win = TL.dots[key];
      var popT = seg(p, win[0], win[1]);
      var pos = { x: dot.base.x, y: dot.base.y };

      if (key === 'a7') {
        if (carryT >= 1) pos = b.pBend;
        else if (carryT > 0) pos = pathPoint(b.arrow2, carryT);
      } else if (key === 'a9') {
        var runT = easeInOut(seg(p, TL.run9[0], TL.run9[1]));
        pos = { x: lerp(dot.base.x, b.a9end.x, runT), y: lerp(dot.base.y, b.a9end.y, runT) };
      } else if (key === 'd1') {
        pos = { x: dot.base.x + b.w * 0.05 * easeInOut(seg(p, TL.d1shift[0], TL.d1shift[1])), y: dot.base.y };
      } else if (key === 'd2') {
        var cl = 0.35 * easeInOut(seg(p, TL.d2close[0], TL.d2close[1]));
        pos = { x: lerp(dot.base.x, b.pRec.x, cl), y: lerp(dot.base.y, b.pRec.y, cl) };
      } else if (key === 'gk') {
        pos = { x: dot.base.x + b.gw * 0.35 * easeOut(seg(p, TL.dive[0], TL.dive[1])), y: dot.base.y };
      }

      var s = popT <= 0 ? 0.01 : easeOutBack(popT);
      dot.el.setAttribute('transform', 'translate(' + pos.x.toFixed(1) + ',' + pos.y.toFixed(1) + ') scale(' + s.toFixed(3) + ')');
      dot.el.setAttribute('opacity', Math.min(1, popT * 2.5).toFixed(3));
    }

    // arrows trace the move
    arrowScrub(b.arrow1, seg(p, TL.arrow1[0], TL.arrow1[1]));
    arrowScrub(b.arrow2, seg(p, TL.arrow2[0], TL.arrow2[1]));
    arrowScrub(b.arrow3, seg(p, TL.arrow3[0], TL.arrow3[1]));

    // shot streak
    var ts = seg(p, TL.streak[0], TL.streak[1]);
    b.streak.setAttribute('opacity', ts > 0 && ts < 1 ? (0.55 * Math.sin(ts * Math.PI)).toFixed(3) : '0');

    // the diagram ball follows the move, then fires into the goal
    var bp;
    if (p < TL.ball1[0]) bp = b.pA;
    else if (p < TL.ball1[1]) bp = pathPoint(b.arrow1, seg(p, TL.ball1[0], TL.ball1[1]));
    else if (p < TL.ball2[0]) bp = b.pB;
    else if (p < TL.ball2[1]) bp = pathPoint(b.arrow2, seg(p, TL.ball2[0], TL.ball2[1]));
    else if (p < TL.ball3[0]) bp = b.pBend;
    else if (p < TL.ball3[1]) bp = pathPoint(b.arrow3, seg(p, TL.ball3[0], TL.ball3[1]));
    else if (p < TL.shot[0]) bp = b.pRec;
    else {
      var sh = easeIn(seg(p, TL.shot[0], TL.shot[1]));
      bp = { x: lerp(b.pRec.x, b.shotTarget.x, sh), y: lerp(b.pRec.y, b.shotTarget.y, sh) };
    }
    b.ball.setAttribute('cx', bp.x.toFixed(1));
    b.ball.setAttribute('cy', bp.y.toFixed(1));
    b.ball.setAttribute('opacity', (seg(p, TL.ballIn[0], TL.ballIn[1]) * (1 - seg(p, TL.ballOut[0], TL.ballOut[1]))).toFixed(3));

    // goal flash + rings
    b.flash.setAttribute('opacity', tf > 0 && tf < 1 ? Math.sin(Math.min(tf * 1.4, 1) * Math.PI).toFixed(3) : '0');
    var tr1 = easeOut(tf);
    b.ring1.setAttribute('r', Math.max(0, b.gw * 0.4 + (b.ringMax - b.gw * 0.4) * tr1));
    b.ring1.setAttribute('opacity', tf > 0 && tf < 1 ? (0.5 * (1 - tf)).toFixed(3) : '0');
    var tf2 = seg(p, TL.flash[0] + 0.015, TL.flash[1] + 0.02);
    var tr2 = easeOut(tf2);
    b.ring2.setAttribute('r', Math.max(0, b.gw * 0.4 + (b.ringMax - b.gw * 0.4) * tr2));
    b.ring2.setAttribute('opacity', tf2 > 0 && tf2 < 1 ? (0.4 * (1 - tf2)).toFixed(3) : '0');

    // confetti tick when the shot lands (only when scrolling forward)
    if (prevP >= 0 && prevP < TL.goalTick && p >= TL.goalTick) {
      var now = performance.now();
      if (now - lastGoalBurst > 900) {
        lastGoalBurst = now;
        spawnConfetti(b.flashPt.x, b.flashPt.y, lowFi ? 10 : 18);
      }
    }

    // act 2: the ball breaks out and crosses the screen
    bigBall(p);

    // act 3: the existing crest ending (with hysteresis so it can replay)
    if (p >= TL.reveal) fireReveal();
    else if (p < TL.reset) resetReveal();

    prevP = p;
  }

  /* ---------------- playback engine (time-driven) ---------------- */

  // The sequence plays on a time clock split into phases so each can be paced
  // on its own: the strategy build-up (board drawing, passing move, shot) is
  // quick, while the big ball's bounce keeps its original, more readable pace.
  // Boundaries are in progress (p); BALL_MS / SETTLE_MS match the previous
  // 6.5s-linear timing, so only the strategy got faster.
  var SEG_BALL_START = 0.635;  // p where the board hands off to the big ball
  var SEG_BALL_END = 0.87;     // p where the big ball finishes / the reveal begins
  var STRAT_MS = 2500;         // strategy build-up, ms (sped up from ~4130)
  var BALL_MS = 1528;          // big ball bounce, ms (unchanged pace)
  var SETTLE_MS = 845;         // crest/photo settle, ms (unchanged pace)
  var DURATION = STRAT_MS + BALL_MS + SETTLE_MS;
  var REPLAY_COOLDOWN = 1200;  // guard against re-trigger jitter near the top

  // piecewise time -> progress: each phase advances p across its own p-range
  // over its own real-time budget, so the ball's on-screen speed is preserved.
  function progressFor(t) {
    if (t <= 0) return 0;
    if (t < STRAT_MS) return (t / STRAT_MS) * SEG_BALL_START;
    t -= STRAT_MS;
    if (t < BALL_MS) return SEG_BALL_START + (t / BALL_MS) * (SEG_BALL_END - SEG_BALL_START);
    t -= BALL_MS;
    if (t < SETTLE_MS) return SEG_BALL_END + (t / SETTLE_MS) * (1 - SEG_BALL_END);
    return 1;
  }

  var p = 0, lastApplied = -1;
  var playing = false;
  var startTime = 0, lastPlay = -Infinity, lastTs = 0;
  var running = true, rafId = null;

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

  function startPlay(now) {
    if (now - lastPlay < REPLAY_COOLDOWN) return;
    lastPlay = now;
    resetReveal();
    prevP = -1;
    p = 0;
    startTime = now;
    lastTs = 0;      // don't count the idle gap before playback as a pause
    playing = true;
    lastApplied = -1;
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  function frame(ts) {
    if (!running) { rafId = null; return; }

    // layout may not have been ready at init — retry, then (re)build geometry
    if (W < 2 || H < 2) {
      resize();
      if (W < 2 || H < 2) { rafId = requestAnimationFrame(frame); return; }
      buildBoard();
      buildBall();
      lastApplied = -1;
      if (playing) { startTime = ts; lastTs = 0; } // start the clock once we can draw
    }

    // rAF pauses in hidden tabs / off-screen heroes; treat a big gap as a pause
    // (shift the clock) so playback resumes instead of jumping ahead.
    if (playing && lastTs && ts - lastTs > 250) startTime += ts - lastTs;
    lastTs = ts;

    if (playing) {
      var elapsed = ts - startTime;
      p = progressFor(elapsed);
      if (elapsed >= DURATION) { p = 1; playing = false; }
    }

    if (p !== lastApplied) {
      apply(p);
      lastApplied = p;
    }

    ctx.clearRect(0, 0, W, H);
    if (confetti.length) drawConfetti();

    // keep ticking while something is moving; otherwise idle until the next replay
    if (playing || confetti.length) rafId = requestAnimationFrame(frame);
    else rafId = null;
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    resize();
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeTimer = null;
      if (W < 2 || H < 2) return;
      // pitch geometry depends on the viewport — rebuild and re-render the current frame
      buildBoard();
      buildBall();
      lastApplied = -1;
      if (!rafId && running) rafId = requestAnimationFrame(frame);
    }, 150);
  }, { passive: true });

  resize();
  if (W >= 2 && H >= 2) { buildBoard(); buildBall(); apply(0); }

  if ('IntersectionObserver' in window) {
    var wasVisibleEnough = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var ratio = entry.intersectionRatio;
        running = ratio > 0;
        // resume a paused loop (e.g. returning mid-confetti); replay is handled below
        if (running && !rafId && (playing || confetti.length)) rafId = requestAnimationFrame(frame);
        var vis = ratio >= 0.45;
        if (vis && !wasVisibleEnough) startPlay(performance.now());
        wasVisibleEnough = vis;
      });
    }, { threshold: [0, 0.45] });
    io.observe(hero);
  } else {
    startPlay(performance.now());
  }
})();
