/*
  Two self-playing hockey scenes, driven by time clocks (progress 0..1).

  1. Home hero (#home): one oversized field-hockey ball bounces and rolls
     across the full-screen stage, then the crest ending settles — the crest
     pops, the headline rises and the match-photo backdrop fades in. Plays on
     load and replays whenever the hero scrolls back into view.

  2. Playbook band (#speelwijze, lower down): a coach's tactics board that
     draws itself — the pitch lines, player dots and dashed attack arrows
     appear and the ball follows the move into the goal with a flash. Plays
     when the band scrolls into view and stays on the finished diagram.

  Both run through one small "scene" player (a rAF clock with pause-gap
  handling for hidden tabs / off-screen, plus an IntersectionObserver that
  starts/replays the scene). All boards/balls are generated at runtime so the
  geometry fits any viewport; only transforms, opacities and stroke offsets
  are touched per frame. Without JS or with reduced motion the settled hero
  shows and the playbook band is hidden via CSS.
*/
(function () {
  document.documentElement.classList.remove('no-js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return; // static hero via CSS; playbook band hidden via CSS

  // hero (home) elements
  var hero = document.querySelector('.hero');
  var heroCanvas = document.getElementById('heroCanvas');
  var crest = document.getElementById('heroCrest');
  var ballHost = document.getElementById('heroBall');
  var heroPhotos = document.getElementById('heroPhotos');
  var cue = document.querySelector('.scroll-cue');

  // playbook (lower band) elements
  var playStage = document.getElementById('playbookStage');
  var playBoardHost = document.getElementById('playbookBoard');
  var playCanvas = document.getElementById('playbookCanvas');

  var lowFi = window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;

  /* ---- crossfading real match-photo backdrop (Ken Burns loop) ----
     Runs underneath the hero; the wrapper opacity is gated by the hero scene,
     so it only shows once the sequence settles. */
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
  var uid = 0;
  function el(name, attrs, parent) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ---------------- confetti (per scene) ---------------- */

  var CONFETTI_COLORS = ['#E11F2B', '#5FB8BE', '#ffffff', '#8fd8dc'];

  function spawnConfetti(arr, x, y, count) {
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var speed = 1.4 + Math.random() * 3.2;
      arr.push({
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

  function drawConfetti(ctx, arr) {
    for (var i = arr.length - 1; i >= 0; i--) {
      var c = arr[i];
      c.vy += c.g;
      c.x += c.vx;
      c.y += c.vy;
      c.life -= c.decay;
      c.rot += 0.12;
      if (c.life <= 0) { arr.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
      ctx.restore();
    }
  }

  /* ---------------- timeline (board sub-phases, in board progress) ---------------- */

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
    goalTick: 0.592
  };
  // the board's whole draw-and-score plays across board progress [0, BOARD_SPAN]
  var BOARD_SPAN = 0.66;

  /* ---------------- the tactics board (runtime-generated SVG) ---------------- */

  function buildBoard(host, W, H) {
    host.innerHTML = '';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' });
    host.appendChild(svg);
    var defs = el('defs', {}, svg);

    // turf: deep petrol wash with faint mowing bands
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

    return {
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

  // Render the board at board-progress gp (0..BOARD_SPAN). The diagram ball
  // scores and STAYS (no fade-out to a break-out ball); goal confetti fires
  // once on the forward crossing of the goal.
  function renderBoard(b, gp, scene) {
    // pitch draws itself
    drawScrub(b.outline, seg(gp, TL.outline[0], TL.outline[1]));
    drawScrub(b.center, seg(gp, TL.center[0], TL.center[1]));
    drawScrub(b.l23, seg(gp, TL.l23[0], TL.l23[1]));
    drawScrub(b.dArc, seg(gp, TL.dArc[0], TL.dArc[1]));
    b.dotArc.setAttribute('opacity', (0.9 * seg(gp, TL.dotArc[0], TL.dotArc[1])).toFixed(3));
    b.spot.setAttribute('r', Math.max(0, b.rSpot * easeOutBack(seg(gp, TL.spot[0], TL.spot[1]))));
    b.gGoal.setAttribute('opacity', seg(gp, TL.goal[0], TL.goal[1]).toFixed(3));

    // net shake on the goal
    var tf = seg(gp, TL.flash[0], TL.flash[1]);
    var shake = tf > 0 && tf < 1 ? Math.sin(tf * Math.PI * 7) * 4 * (1 - tf) : 0;
    b.gGoal.setAttribute('transform', 'translate(' + shake.toFixed(2) + ',0)');

    // players pop in, then live through the move
    var carryT = seg(gp, TL.ball2[0], TL.ball2[1]);
    for (var key in b.dots) {
      var dot = b.dots[key];
      var win = TL.dots[key];
      var popT = seg(gp, win[0], win[1]);
      var pos = { x: dot.base.x, y: dot.base.y };

      if (key === 'a7') {
        if (carryT >= 1) pos = b.pBend;
        else if (carryT > 0) pos = pathPoint(b.arrow2, carryT);
      } else if (key === 'a9') {
        var runT = easeInOut(seg(gp, TL.run9[0], TL.run9[1]));
        pos = { x: lerp(dot.base.x, b.a9end.x, runT), y: lerp(dot.base.y, b.a9end.y, runT) };
      } else if (key === 'd1') {
        pos = { x: dot.base.x + b.w * 0.05 * easeInOut(seg(gp, TL.d1shift[0], TL.d1shift[1])), y: dot.base.y };
      } else if (key === 'd2') {
        var cl = 0.35 * easeInOut(seg(gp, TL.d2close[0], TL.d2close[1]));
        pos = { x: lerp(dot.base.x, b.pRec.x, cl), y: lerp(dot.base.y, b.pRec.y, cl) };
      } else if (key === 'gk') {
        pos = { x: dot.base.x + b.gw * 0.35 * easeOut(seg(gp, TL.dive[0], TL.dive[1])), y: dot.base.y };
      }

      var s = popT <= 0 ? 0.01 : easeOutBack(popT);
      dot.el.setAttribute('transform', 'translate(' + pos.x.toFixed(1) + ',' + pos.y.toFixed(1) + ') scale(' + s.toFixed(3) + ')');
      dot.el.setAttribute('opacity', Math.min(1, popT * 2.5).toFixed(3));
    }

    // arrows trace the move
    arrowScrub(b.arrow1, seg(gp, TL.arrow1[0], TL.arrow1[1]));
    arrowScrub(b.arrow2, seg(gp, TL.arrow2[0], TL.arrow2[1]));
    arrowScrub(b.arrow3, seg(gp, TL.arrow3[0], TL.arrow3[1]));

    // shot streak
    var ts = seg(gp, TL.streak[0], TL.streak[1]);
    b.streak.setAttribute('opacity', ts > 0 && ts < 1 ? (0.55 * Math.sin(ts * Math.PI)).toFixed(3) : '0');

    // the diagram ball follows the move, then fires into the goal and stays
    var bp;
    if (gp < TL.ball1[0]) bp = b.pA;
    else if (gp < TL.ball1[1]) bp = pathPoint(b.arrow1, seg(gp, TL.ball1[0], TL.ball1[1]));
    else if (gp < TL.ball2[0]) bp = b.pB;
    else if (gp < TL.ball2[1]) bp = pathPoint(b.arrow2, seg(gp, TL.ball2[0], TL.ball2[1]));
    else if (gp < TL.ball3[0]) bp = b.pBend;
    else if (gp < TL.ball3[1]) bp = pathPoint(b.arrow3, seg(gp, TL.ball3[0], TL.ball3[1]));
    else if (gp < TL.shot[0]) bp = b.pRec;
    else {
      var sh = easeIn(seg(gp, TL.shot[0], TL.shot[1]));
      bp = { x: lerp(b.pRec.x, b.shotTarget.x, sh), y: lerp(b.pRec.y, b.shotTarget.y, sh) };
    }
    b.ball.setAttribute('cx', bp.x.toFixed(1));
    b.ball.setAttribute('cy', bp.y.toFixed(1));
    b.ball.setAttribute('opacity', seg(gp, TL.ballIn[0], TL.ballIn[1]).toFixed(3));

    // goal flash + rings
    b.flash.setAttribute('opacity', tf > 0 && tf < 1 ? Math.sin(Math.min(tf * 1.4, 1) * Math.PI).toFixed(3) : '0');
    var tr1 = easeOut(tf);
    b.ring1.setAttribute('r', Math.max(0, b.gw * 0.4 + (b.ringMax - b.gw * 0.4) * tr1));
    b.ring1.setAttribute('opacity', tf > 0 && tf < 1 ? (0.5 * (1 - tf)).toFixed(3) : '0');
    var tf2 = seg(gp, TL.flash[0] + 0.015, TL.flash[1] + 0.02);
    var tr2 = easeOut(tf2);
    b.ring2.setAttribute('r', Math.max(0, b.gw * 0.4 + (b.ringMax - b.gw * 0.4) * tr2));
    b.ring2.setAttribute('opacity', tf2 > 0 && tf2 < 1 ? (0.4 * (1 - tf2)).toFixed(3) : '0');

    // confetti tick when the shot lands (only on the forward crossing)
    if (scene.prevGp >= 0 && scene.prevGp < TL.goalTick && gp >= TL.goalTick) {
      spawnConfetti(scene.confetti, b.flashPt.x, b.flashPt.y, lowFi ? 10 : 18);
    }
    scene.prevGp = gp;
  }

  /* ---------------- the break-out ball (home hero, DOM) ---------------- */

  function buildBall(host, W, H) {
    host.innerHTML = '';
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

    host.appendChild(shadow);
    host.appendChild(ballEl);

    return {
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

  // Render the big ball at traversal u (0..1 = off-screen left to off-screen right).
  function renderBall(big, host, u, W, H) {
    if (u <= 0 || u >= 1) { host.style.opacity = '0'; return; }
    host.style.opacity = '1';

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

  /* ---------------- generic time-driven scene player ---------------- */

  var REPLAY_COOLDOWN = 1200; // guard against re-trigger jitter

  function makeScene(cfg) {
    var host = cfg.el, canvas = cfg.canvas;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var dpr = lowFi ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var scene = { W: 0, H: 0, ctx: ctx, confetti: [], prevGp: -1, big: null, board: null };

    var p = 0, lastApplied = -1, playing = false;
    var startTime = 0, lastPlay = -Infinity, lastTs = 0;
    var running = true, rafId = null;

    function resize() {
      var r = host.getBoundingClientRect();
      W = r.width; H = r.height;
      scene.W = W; scene.H = H;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function build() { cfg.build(scene, W, H); }

    function startPlay(now) {
      if (now - lastPlay < REPLAY_COOLDOWN) return;
      lastPlay = now;
      if (cfg.onReset) cfg.onReset(scene);
      scene.prevGp = -1;
      p = 0; startTime = now; lastTs = 0;
      playing = true; lastApplied = -1;
      if (!rafId) rafId = requestAnimationFrame(frame);
    }

    function frame(ts) {
      if (!running) { rafId = null; return; }

      // layout may not have been ready at init — retry, then (re)build geometry
      if (W < 2 || H < 2) {
        resize();
        if (W < 2 || H < 2) { rafId = requestAnimationFrame(frame); return; }
        build();
        lastApplied = -1;
        if (playing) { startTime = ts; lastTs = 0; } // start the clock once we can draw
      }

      // rAF pauses in hidden tabs / off-screen; treat a big gap as a pause
      // (shift the clock) so playback resumes instead of jumping ahead.
      if (playing && lastTs && ts - lastTs > 250) startTime += ts - lastTs;
      lastTs = ts;

      if (playing) {
        var elapsed = ts - startTime;
        p = clamp01(elapsed / cfg.duration);
        if (elapsed >= cfg.duration) { p = 1; playing = false; }
      }

      if (p !== lastApplied) { cfg.apply(scene, p); lastApplied = p; }

      ctx.clearRect(0, 0, W, H);
      if (scene.confetti.length) drawConfetti(ctx, scene.confetti);

      // keep ticking while something is moving; otherwise idle until the next replay
      if (playing || scene.confetti.length) rafId = requestAnimationFrame(frame);
      else rafId = null;
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      resize();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resizeTimer = null;
        if (W < 2 || H < 2) return;
        // geometry depends on the viewport — rebuild and re-render the current frame
        build();
        lastApplied = -1;
        if (!rafId && running) rafId = requestAnimationFrame(frame);
      }, 150);
    }, { passive: true });

    resize();
    if (W >= 2 && H >= 2) { build(); cfg.apply(scene, 0); }

    if ('IntersectionObserver' in window) {
      var wasVisible = false;
      var thr = cfg.threshold || 0.45;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var ratio = entry.intersectionRatio;
          running = ratio > 0;
          // resume a paused loop (e.g. returning mid-confetti); replay handled below
          if (running && !rafId && (playing || scene.confetti.length)) rafId = requestAnimationFrame(frame);
          var vis = ratio >= thr;
          if (vis && !wasVisible) startPlay(performance.now());
          wasVisible = vis;
        });
      }, { threshold: [0, thr] });
      io.observe(host);
    } else {
      startPlay(performance.now());
    }
  }

  /* ---------------- scene 1: home hero (ball + crest reveal) ---------------- */

  // ball bounce keeps its previous pace; the settle follows it
  var BALL_MS = 1528, SETTLE_MS = 845;
  var HERO_MS = BALL_MS + SETTLE_MS;
  var BALL_FRAC = BALL_MS / HERO_MS;      // ball phase as a fraction of the hero clock
  var HERO_REVEAL = 0.60;                 // crest begins as the ball nears the exit
  var HERO_RESET = 0.45;
  var HERO_PHOTO = [0.55, 0.74];          // match-photo backdrop fades in with the reveal
  var HERO_CUE = [0.80, 0.96];            // scroll cue appears once settled

  var heroRevealFired = false;

  function heroCrestTarget(scene) {
    if (!crest) return { x: scene.W / 2, y: scene.H * 0.4 };
    var cr = crest.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    return { x: cr.left + cr.width / 2 - hr.left, y: cr.top + cr.height / 2 - hr.top };
  }

  function heroFireReveal(scene) {
    if (heroRevealFired) return;
    heroRevealFired = true;
    hero.classList.add('hero-anim');
    if (crest) crest.classList.add('crest-pop');
    var t = heroCrestTarget(scene);
    spawnConfetti(scene.confetti, t.x, t.y, lowFi ? 14 : 26);
  }

  function heroResetReveal() {
    if (!heroRevealFired) return;
    heroRevealFired = false;
    hero.classList.remove('hero-anim');
    if (crest) crest.classList.remove('crest-pop');
    void hero.offsetWidth; // reflow so the CSS animations restart on the next reveal
  }

  function heroApply(scene, hp) {
    var u = clamp01(hp / BALL_FRAC);
    if (scene.big) renderBall(scene.big, ballHost, u, scene.W, scene.H);
    if (heroPhotos) heroPhotos.style.opacity = seg(hp, HERO_PHOTO[0], HERO_PHOTO[1]).toFixed(3);
    if (cue) cue.style.opacity = seg(hp, HERO_CUE[0], HERO_CUE[1]).toFixed(3);
    if (hp >= HERO_REVEAL) heroFireReveal(scene);
    else if (hp < HERO_RESET) heroResetReveal();
  }

  if (hero && heroCanvas && ballHost) {
    makeScene({
      el: hero, canvas: heroCanvas, duration: HERO_MS, threshold: 0.45,
      build: function (scene, W, H) { scene.big = buildBall(ballHost, W, H); },
      onReset: function () { heroResetReveal(); },
      apply: heroApply
    });
  }

  /* ---------------- scene 2: playbook band (tactics board) ---------------- */

  var BOARD_MS = 2600; // draws quickly, matching the previous strategy pace

  if (playStage && playCanvas && playBoardHost) {
    makeScene({
      el: playStage, canvas: playCanvas, duration: BOARD_MS, threshold: 0.35,
      build: function (scene, W, H) { scene.board = buildBoard(playBoardHost, W, H); },
      apply: function (scene, bp) { if (scene.board) renderBoard(scene.board, bp * BOARD_SPAN, scene); }
    });
  }
})();
