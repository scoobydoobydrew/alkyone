/* patch: a 3D viewer of the patch with five hotspots. The inline SVG drawing is the first view and the no-WebGL view
   (same five hotspots, zoom only); the 3D scene cross-fades over it once it has drawn a frame.
   Selecting a part (a dot on the figure, or a row in the list) opens the detail card, eases the camera to that part and draws a warm ring. */
(function () {
  'use strict';
  var A = window.Alkyone;
  if (!A || !A.section) return;

  var IDS = ['optical', 'temp', 'imu', 'mic', 'wear'];
  /* part centres and ring radii on the 800 x 1000 patch drawing, as fractions (from gen/patch-hotspots.json) */
  var HOT = {
    optical: { x: 0.3125, y: 0.488, rx: 0.1388, ry: 0.111 },
    temp:    { x: 0.5075, y: 0.599, rx: 0.0675, ry: 0.054 },
    imu:     { x: 0.695,  y: 0.488, rx: 0.1275, ry: 0.093 },
    mic:     { x: 0.5075, y: 0.371, rx: 0.0675, ry: 0.054 },
    wear:    { x: 0.5,    y: 0.68,  rx: 0.3,    ry: 0.054 }
  };
  var IDLE = 'Nothing selected yet. Tap a dot on the patch, or pick a part from the list.';
  var MS_MOVE = 900, ZMAX = 3.4, EDGE = 12;               // a dot closer than EDGE px to the figure's border is hidden, not cut in half
  var restZoom = 1;                                      // a little closer on a small figure, so the five dots have room

  var el = null, stage = null, fig = null, svgWrap = null, tools = null, card = null;
  var hot = {}, item = {};
  var st = { id: null, mode: 'svg', owns: false, p: 0 };       // owns: the visitor has taken the camera (drag, zoom, a chosen part)
  var sv = { k: 1, tx: 0, ty: 0, w: 0, h: 0, s: 1, ox: 0, oy: 0 };
  var hl = { id: null, cur: 0, target: 0 };
  var v = null, THREE = null, booting = false, noGL = false, visible = false;
  var releaseTimer = 0, fadeTimer = 0, restoreTimer = 0, lastT = -1, ctl = null;

  function clamp(a, lo, hi) { return a < lo ? lo : a > hi ? hi : a; }
  function dolly(p) { var x = clamp((p - 0.2) / 0.35, 0, 1); return x * x * (3 - 2 * x); }   // chest -> patch while the scene crosses the middle

  /* ------------------------------------------------------------------------------- list, card, selection */
  function setCard() {
    var it = st.id ? item[st.id] : null, n, h, t, p;
    card.textContent = '';
    if (!it) {
      card.classList.add('is-idle');
      p = document.createElement('p'); p.className = 'patch-card__idle'; p.textContent = IDLE;
      card.appendChild(p);
      return;
    }
    card.classList.remove('is-idle');
    n = document.createElement('span'); n.className = 'patch-card__n'; n.setAttribute('aria-hidden', 'true'); n.textContent = it.n;
    h = document.createElement('h3'); h.className = 'patch-card__t'; h.innerHTML = it.titleHtml;
    t = document.createElement('p'); t.className = 'patch-card__p'; t.innerHTML = it.textHtml;
    card.appendChild(n); card.appendChild(h); card.appendChild(t);
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';     // let the card ease in again
  }

  function syncUi() {
    for (var i = 0; i < IDS.length; i++) {
      var id = IDS[i], on = st.id === id ? 'true' : 'false';
      if (item[id]) item[id].btn.setAttribute('aria-pressed', on);
      if (hot[id]) hot[id].el.setAttribute('aria-pressed', on);
    }
  }

  function select(id) {
    if (id === st.id) id = null;                          // the same part again puts it away
    st.id = id;
    syncUi(); setCard();
    if (st.mode === 'gl' && v) glSelect(id); else svgSelect(id);
  }

  function resetView() {
    st.owns = true;
    if (st.id) { select(st.id); return; }                 // clears the selection and sends the camera home
    if (st.mode === 'gl' && v) {
      v.setOrbit(0, 0, restZoom, A.reduced);
      v.tweenTo(v.S.frames.patch, A.reduced ? 0 : MS_MOVE);
    } else { sv.k = 1; sv.tx = sv.ty = 0; svgApply(A.reduced ? 0 : 600); }
  }


  /* ------------------------------------------------------------------------------- the dots
     Each dot sits on its part. Where parts are close (small figure, wide view) the dots are pushed apart until they clear each other,
     and a hairline leader keeps the link to the real part. raw[id] = {x, y, away} in px inside the figure. */
  var vis = [], raw = {};
  function layoutDots(raw, w) {
    var i, j, it, a, b, dx, dy, d, push, ux, uy, moved, r, ox, oy, od, minD = w < 480 ? 37 : 40;
    vis.length = 0;
    for (i = 0; i < IDS.length; i++) { r = raw[IDS[i]]; r.px = r.x; r.py = r.y; if (!r.away) vis.push(r); }
    for (it = 0; it < 40; it++) {
      moved = false;
      for (i = 0; i < vis.length; i++) for (j = i + 1; j < vis.length; j++) {
        a = vis[i]; b = vis[j]; dx = b.px - a.px; dy = b.py - a.py; d = Math.sqrt(dx * dx + dy * dy);
        if (d >= minD) continue;
        if (d < 0.01) { dx = Math.cos(i * 2.4 + j); dy = Math.sin(i * 2.4 + j); d = 1; }
        push = (minD - d) / 2 + 0.01; ux = dx / d; uy = dy / d;
        a.px -= ux * push; a.py -= uy * push; b.px += ux * push; b.py += uy * push; moved = true;
      }
      if (!moved) break;
    }
    for (i = 0; i < IDS.length; i++) {
      var id = IDS[i], hb = hot[id];
      r = raw[id]; ox = r.x - r.px; oy = r.y - r.py; od = Math.sqrt(ox * ox + oy * oy);
      if (od > 54) { r.px = r.x - ox * 54 / od; r.py = r.y - oy * 54 / od; ox = r.x - r.px; oy = r.y - r.py; od = 54; }
      var px = Math.round(r.px * 10) / 10, py = Math.round(r.py * 10) / 10;
      if (px !== hb.x || py !== hb.y) {
        hb.x = px; hb.y = py;
        hb.el.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)';
        var lead = od > 9;
        if (lead) {
          hb.el.style.setProperty('--ll', od.toFixed(1) + 'px'); hb.el.style.setProperty('--la', Math.atan2(oy, ox).toFixed(3) + 'rad');
          hb.el.style.setProperty('--ax', ox.toFixed(1) + 'px'); hb.el.style.setProperty('--ay', oy.toFixed(1) + 'px');
        } else { hb.el.style.setProperty('--ax', '0px'); hb.el.style.setProperty('--ay', '0px'); }
        if (lead !== hb.lead) { hb.lead = lead; hb.el.classList.toggle('has-lead', lead); }
      }
      if (r.away !== hb.away) { hb.away = r.away; hb.el.classList.toggle('is-away', r.away); }
      var left = px > w * 0.52;
      if (left !== hb.left) { hb.left = left; hb.el.classList.toggle('is-left', left); }
    }
  }

  /* ------------------------------------------------------------------------------- 3D */
  function glSelect(id) {
    var F = v.S.frames, ms = A.reduced ? 0 : MS_MOVE;
    st.owns = true;
    v.setOrbit(0, 0, id ? 1 : restZoom, A.reduced);
    v.tweenTo(id ? F.component[id] : F.patch, ms);
    if (id) { hl.id = id; hl.cur = A.reduced ? 1 : 0; hl.target = 1; } else { hl.target = 0; if (A.reduced) hl.cur = 0; }
    v.invalidate();
  }

  function beforeRender(vw, dt) {                         // the warm ring grows in and out, and asks for frames while it does
    var again = false;
    if (hl.id) {
      if (dt > 0) hl.cur += (hl.target - hl.cur) * (1 - Math.exp(-dt * 7 / 1000));
      if (Math.abs(hl.target - hl.cur) < 0.004) hl.cur = hl.target; else again = true;
      vw.S.setHighlight(hl.id, hl.cur);
      if (hl.target === 0 && hl.cur === 0) { vw.S.setHighlight(null, 0); hl.id = null; }
    }
    return again;
  }

  /* the dots follow the 3D parts; a dot hides when its part faces away from the camera */
  function placeGl(vw) {
    var z = vw.size();
    for (var i = 0; i < IDS.length; i++) {
      var id = IDS[i], p = vw.project(id), r = raw[id];
      r.x = p.x; r.y = p.y;
      r.away = !!(p.hidden || p.facing < 0.1 || p.x < EDGE || p.y < EDGE || p.x > z.w - EDGE || p.y > z.h - EDGE);
    }
    layoutDots(raw, z.w);
  }

  function toGl() {
    st.mode = 'gl'; stage.setAttribute('data-mode', 'gl');
    clearTimeout(fadeTimer);
    fig.classList.remove('is-lost'); fig.classList.add('is-3d');
    fadeTimer = setTimeout(function () { fig.classList.add('is-3d-done'); }, A.reduced ? 60 : 1000);
    if (v) placeGl(v);
  }
  function toSvg() {
    clearTimeout(fadeTimer);
    st.mode = 'svg'; stage.setAttribute('data-mode', 'svg');
    fig.classList.add('is-lost'); fig.classList.remove('is-3d', 'is-3d-done');
    for (var i = 0; i < IDS.length; i++) { hot[IDS[i]].x = hot[IDS[i]].y = -1; }
    if (st.id) svgSelect(st.id, true); else { sv.k = 1; sv.tx = sv.ty = 0; svgApply(0); }
  }

  function glCreate() {
    if (v || !THREE || !fig) return;
    var vw = A.viewer.create({
      container: fig, THREE: THREE, backdrop: 'night', quality: A.lowPower ? 'low' : 'high',
      ambient: !A.reduced, ambientFps: A.lowPower ? 20 : 30, time: A.reduced ? 0.42 : 0, limits: { zmin: 0.45 },
      beforeRender: beforeRender, onRender: placeGl,
      onLost: function () { toSvg(); },
      onRestored: function () {
        clearTimeout(restoreTimer);
        restoreTimer = setTimeout(function () { if (v && !v.isLost()) toGl(); }, 60);
      }
    });
    if (!vw) { noGL = true; return; }
    v = vw;
    try {
      var F = vw.S.frames;
      if (A.reduced) vw.setLambda(40);
      restZoom = vw.size().w < 340 ? 0.54 : vw.size().w < 480 ? 0.64 : 1;
      vw.setOrbit(0, 0, st.id ? 1 : restZoom, true);
      if (st.id) { vw.setBase(F.component[st.id]); hl.id = st.id; hl.cur = 1; hl.target = 1; }
      else if (st.owns || A.reduced) vw.setBase(F.patch);
      else vw.setBase(F.chest, F.patch, dolly(st.p));
      vw.setVisible(visible || vw.isVisible());
      vw.renderNow();                                     // ONE frame before the cross-fade, so it never fades in empty
      toGl();
    } catch (e) { glDestroy(); noGL = true; }
  }

  function glDestroy() {
    clearTimeout(restoreTimer);
    if (v) { try { v.dispose(); } catch (e) { /* ignore */ } v = null; }
    hl.id = null; hl.cur = hl.target = 0;
    if (fig && st.mode === 'gl') toSvg();
  }

  /* The scene is built when the browser is idle and the hero has had its turn (this scene is only a screen below it on a phone),
     or at once when the visitor gets here first (see enter). */
  function later(fn) {
    setTimeout(function () {
      if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 2000 }); else setTimeout(fn, 100);
    }, Math.max(0, 1400 - performance.now()));
  }
  function boot() {
    if (v || booting || noGL || !fig) return;
    if (!A.hasWebGL()) { noGL = true; return; }
    if (THREE) { glCreate(); return; }
    booting = true;
    A.loadThree().then(function (m) {
      booting = false;
      if (!m) { noGL = true; return; }
      THREE = m;
      later(function () { if (!v && !noGL) glCreate(); });
    }, function () { booting = false; noGL = true; });
  }

  /* ------------------------------------------------------------------------------- the flat drawing (no WebGL, or until the 3D arrives) */
  function svgMetrics() {
    sv.w = stage.clientWidth || 1; sv.h = stage.clientHeight || 1;
    sv.s = Math.min(sv.w / 800, sv.h / 1000);
    sv.ox = (sv.w - 800 * sv.s) / 2; sv.oy = (sv.h - 1000 * sv.s) / 2;
  }
  function svgPt(id) {
    var H = HOT[id];
    return { x: sv.ox + H.x * 800 * sv.s, y: sv.oy + H.y * 1000 * sv.s, rx: H.rx * 800 * sv.s, ry: H.ry * 1000 * sv.s };
  }
  function svgClamp() { sv.tx = clamp(sv.tx, sv.w * (1 - sv.k), 0); sv.ty = clamp(sv.ty, sv.h * (1 - sv.k), 0); }
  function svgApply(ms) {
    if (st.mode !== 'svg') return;
    stage.style.setProperty('--patch-ease', (ms || 0) + 'ms');
    svgWrap.style.transform = 'translate3d(' + sv.tx.toFixed(2) + 'px,' + sv.ty.toFixed(2) + 'px,0) scale(' + sv.k.toFixed(4) + ')';
    for (var i = 0; i < IDS.length; i++) {
      var id = IDS[i], p = svgPt(id), r = raw[id];
      r.x = p.x * sv.k + sv.tx; r.y = p.y * sv.k + sv.ty;
      r.away = r.x < EDGE || r.y < EDGE || r.x > sv.w - EDGE || r.y > sv.h - EDGE;
    }
    layoutDots(raw, sv.w);
  }
  function svgSelect(id, instant) {
    svgMetrics();
    if (id) {
      var p = svgPt(id), r = Math.max(p.rx, p.ry);
      var k = clamp(0.3 * Math.min(sv.w, sv.h) / r, 1, ZMAX);       // the part's ring ends up about 60% of the figure
      sv.k = k; sv.tx = sv.w / 2 - k * p.x; sv.ty = sv.h / 2 - k * p.y; svgClamp();
      hot[id].el.style.setProperty('--rw', (2 * p.rx * k).toFixed(1) + 'px');
      hot[id].el.style.setProperty('--rh', (2 * p.ry * k).toFixed(1) + 'px');
    } else { sv.k = 1; sv.tx = sv.ty = 0; }
    svgApply(instant || A.reduced ? 0 : 750);
  }
  function svgZoom(f) {
    svgMetrics();
    var k2 = clamp(sv.k / f, 1, ZMAX), r = k2 / sv.k, cx = sv.w / 2, cy = sv.h / 2;
    sv.tx = cx - (cx - sv.tx) * r; sv.ty = cy - (cy - sv.ty) * r; sv.k = k2; svgClamp();
    svgApply(A.reduced ? 0 : 160);
  }
  function svgPan(daz, del) {
    if (sv.k <= 1.001) return;
    sv.tx -= daz * 3.1; sv.ty -= del * 3.1 / 0.8; svgClamp();
    svgApply(60);
  }

  /* ------------------------------------------------------------------------------- wiring */
  function wire() {
    var i, id, b, nodes;
    nodes = el.querySelectorAll('.patch-hot');
    for (i = 0; i < nodes.length; i++) { id = nodes[i].getAttribute('data-id'); hot[id] = { el: nodes[i], x: -1, y: -1, away: false, left: false, lead: false }; raw[id] = { x: 0, y: 0, px: 0, py: 0, away: false }; }
    nodes = el.querySelectorAll('.patch-item');
    for (i = 0; i < nodes.length; i++) {
      b = nodes[i]; id = b.getAttribute('data-id');
      var tt = b.querySelector('.patch-item__t').cloneNode(true);
      var slot = tt.querySelector('[data-term-slot]');
      if (slot) {                                         // the glossary term for SpO2 lives in the card heading
        var tb = document.createElement('button');
        tb.type = 'button'; tb.className = 'term'; tb.setAttribute('data-term', slot.getAttribute('data-term-slot')); tb.innerHTML = slot.innerHTML;
        slot.parentNode.replaceChild(tb, slot);
      }
      item[id] = { btn: b, n: b.querySelector('.patch-item__n').textContent, titleHtml: tt.innerHTML, textHtml: b.parentNode.querySelector('.patch-item__text').innerHTML };
      (function (pid) { b.addEventListener('click', function () { select(pid); }); })(id);
    }
    for (id in hot) if (hot.hasOwnProperty(id)) (function (pid) { hot[pid].el.addEventListener('click', function () { select(pid); }); })(id);

    tools.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'reset') resetView(); else if (ctl) ctl.step(act);
    });

    var target = {
      get pitch() { return st.mode === 'gl'; },
      addOrbit: function (a, b2) { if (st.mode === 'gl' && v) v.addOrbit(a, b2); else svgPan(a, b2); },
      scaleZoom: function (f) { if (st.mode === 'gl' && v) v.scaleZoom(f); else svgZoom(f); },
      reset: resetView
    };
    ctl = A.viewer.attachControls(target, stage, { onUser: function () { st.owns = true; } });
  }
  window.Alkyone.section('patch', {
    init: function (ctx) {
      el = ctx.el;
      stage = el.querySelector('.patch-stage'); fig = el.querySelector('.patch-fig');
      svgWrap = el.querySelector('.patch-svgwrap'); tools = el.querySelector('.patch-tools'); card = el.querySelector('.patch-card');
      if (!stage || !fig || !svgWrap || !tools || !card) return;
      try {
        wire();
        el.classList.add('is-enhanced');
        stage.setAttribute('data-mode', 'svg');
        svgMetrics(); svgApply(0);
        stage.classList.add('is-ready');
        setCard();
        if (typeof ResizeObserver !== 'undefined') {
          new ResizeObserver(function () { if (st.mode === 'svg') { svgMetrics(); if (st.id) svgSelect(st.id, true); else svgApply(0); } }).observe(stage);
        }
      } catch (e) { return; }
      boot();
    },
    enter: function () {
      visible = true;
      clearTimeout(releaseTimer);
      if (!v && THREE && !noGL) setTimeout(function () { if (!v && visible) glCreate(); }, 60);
      else if (v) v.invalidate();
    },
    leave: function () {
      visible = false;
      clearTimeout(releaseTimer);                          // give the WebGL context back while far away (the page keeps at most two); rebuilt on return
      releaseTimer = setTimeout(function () { if (!visible) glDestroy(); }, 4000);
    },
    progress: function (p) {
      st.p = p;
      if (!v || st.mode !== 'gl' || st.owns || A.reduced) return;
      var t = dolly(p);
      if (Math.abs(t - lastT) > 0.003) { lastT = t; v.setBlend(t); }
    },
    resize: function () { if (stage && st.mode === 'svg') { svgMetrics(); if (st.id) svgSelect(st.id, true); else svgApply(0); } },
    reducedChange: function (isReduced) {
      if (!v) return;
      v.setLambda(isReduced ? 40 : 10);
      v.setTimeSeconds(isReduced ? 0.42 : 0);
      v.setAmbient(!isReduced);
      v.renderNow();
    }
  });
})();
