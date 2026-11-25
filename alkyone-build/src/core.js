/* core.js - window.Alkyone runtime. Reference: FOUNDATION.md (this file is the implementation of CONTRACT section 4).
   No console output, no globals except window.Alkyone, passive listeners where possible. If a module throws, the page still reads. */
(function () {
  'use strict';

  var root = document.documentElement;
  var A = window.Alkyone = window.Alkyone || {};
  var noop = function () {};
  var hasOwn = Object.prototype.hasOwnProperty;

  /* ------------------------------------------------------------------------------------------ util */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var util = A.util = {
    clamp: clamp,
    lerp: lerp,
    mix: lerp,
    smoothstep: function (e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); },
    easeOutQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
    easeInOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    easeOutBack: function (t, s) { s = s === undefined ? 1.70158 : s; var c = s + 1; return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
    rng: mulberry32,
    /* frame-rate independent smoothing: value = damp(value, target, lambda, dtMs). lambda ~ 6 is calm, ~ 14 is snappy */
    damp: function (cur, target, lambda, dt) { return lerp(cur, target, 1 - Math.exp(-lambda * dt / 1000)); },
    remap: function (v, a, b, c, d) { return c + (d - c) * ((v - a) / (b - a)); },
    /* pixel ratio for canvases: capped, lower on low-power devices */
    dpr: function (max) { return Math.min(window.devicePixelRatio || 1, max || (A.lowPower ? 1.5 : 2)); }
  };
  function safe(fn, a, b) { if (typeof fn !== 'function') return; try { return fn(a, b); } catch (e) { return undefined; } }

  /* ------------------------------------------------------------------------------ reduced motion, low power */
  var mqReduce = null;
  try { mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { mqReduce = null; }
  A.reduced = !!(mqReduce && mqReduce.matches);
  root.setAttribute('data-motion', A.reduced ? 'reduced' : 'full');

  function detectLowPower() {
    try {
      var n = navigator, c = n.connection || n.mozConnection || n.webkitConnection;
      if (n.hardwareConcurrency && n.hardwareConcurrency <= 4) return true;
      if (n.deviceMemory && n.deviceMemory <= 4) return true;
      if (c && c.saveData) return true;
      if (window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 500) return true;
    } catch (e) { /* ignore */ }
    return false;
  }
  A.lowPower = detectLowPower();
  root.setAttribute('data-power', A.lowPower ? 'low' : 'normal');   /* CSS drops decorative blur on low-power devices */
  A.version = '1.0';
  A.ready = false;
  A.THREE = null;

  /* ------------------------------------------------------------------------------------- shared rAF loop */
  var rafList = [];      /* copy-on-write: never mutated while a frame iterates it */
  var rafId = 0, rafLast = 0;
  function rafFrame(t) {
    rafId = 0;
    if (document.hidden || !rafList.length) { rafLast = 0; return; }
    var dt = rafLast ? Math.min(t - rafLast, 100) : 16.7;
    rafLast = t;
    var list = rafList;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.dead) continue;
      var d = dt;
      if (s.interval) { s.acc += dt; if (s.acc < s.interval - 2) continue; d = s.acc; s.acc = 0; }
      try { s.fn(t, d); s.errs = 0; } catch (e) { if (++s.errs >= 3) { s.dead = true; rafList = rafList.filter(function (x) { return x !== s; }); } }
    }
    if (rafList.length && !document.hidden) rafId = requestAnimationFrame(rafFrame);
    else rafLast = 0;
  }
  function rafWake() { if (!rafId && rafList.length && !document.hidden) { rafLast = 0; rafId = requestAnimationFrame(rafFrame); } }
  /* Alkyone.raf(fn, {fps}) -> unsubscribe. fn(t_ms, dt_ms). Sleeps with no subscribers and while the tab is hidden. */
  A.raf = function (fn, opts) {
    if (typeof fn !== 'function') return noop;
    var fps = opts && opts.fps > 0 ? opts.fps : 0;
    var s = { fn: fn, interval: fps ? 1000 / fps : 0, acc: 0, errs: 0, dead: false };
    rafList = rafList.concat(s);
    rafWake();
    return function () { s.dead = true; rafList = rafList.filter(function (x) { return x !== s; }); };
  };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) rafWake(); }, { passive: true });

  /* ------------------------------------------------------------------------------------------ resize */
  var resizeSubs = [];
  A.onResize = function (fn) {
    if (typeof fn !== 'function') return noop;
    resizeSubs = resizeSubs.concat(fn);
    return function () { resizeSubs = resizeSubs.filter(function (f) { return f !== fn; }); };
  };

  /* --------------------------------------------------------------------------------------- announcer */
  var live = { polite: null, assertive: null, tp: 0, ta: 0 };
  function setupAnnouncer() {
    live.polite = document.getElementById('live-polite');
    live.assertive = document.getElementById('live-assertive');
    if (!live.polite) { live.polite = document.createElement('div'); live.polite.id = 'live-polite'; live.polite.className = 'sr-only'; live.polite.setAttribute('role', 'status'); live.polite.setAttribute('aria-live', 'polite'); live.polite.setAttribute('aria-atomic', 'true'); document.body.appendChild(live.polite); }
    if (!live.assertive) { live.assertive = document.createElement('div'); live.assertive.id = 'live-assertive'; live.assertive.className = 'sr-only'; live.assertive.setAttribute('role', 'alert'); live.assertive.setAttribute('aria-live', 'assertive'); live.assertive.setAttribute('aria-atomic', 'true'); document.body.appendChild(live.assertive); }
  }
  /* Alkyone.announce(msg, {assertive}) - the latest message wins; identical repeats are announced again. */
  A.announce = function (msg, o) {
    try {
      if (!live.polite) setupAnnouncer();
      var assertive = !!(o && o.assertive);
      var el = assertive ? live.assertive : live.polite;
      var key = assertive ? 'ta' : 'tp';
      clearTimeout(live[key]);
      el.textContent = '';
      live[key] = setTimeout(function () {
        el.textContent = String(msg == null ? '' : msg);
        live[key] = setTimeout(function () { el.textContent = ''; }, 8000);
      }, 60);
    } catch (e) { /* ignore */ }
  };

  /* ------------------------------------------------------------------------------------------ glossary */
  var terms = Object.create(null);
  var ALLOWED = { SUB: 1, SUP: 1, EM: 1, STRONG: 1, I: 1, B: 1, BR: 1 };
  function cleanHtml(html) {            /* the strings are ours, but a stray tag must never become markup */
    try {
      var t = document.createElement('template');
      t.innerHTML = String(html);
      (function walk(node) {
        var kids = Array.prototype.slice.call(node.childNodes);
        kids.forEach(function (k) {
          if (k.nodeType === 1) {
            walk(k);
            if (!ALLOWED[k.tagName]) { while (k.firstChild) node.insertBefore(k.firstChild, k); node.removeChild(k); }
            else Array.prototype.slice.call(k.attributes).forEach(function (a) { k.removeAttribute(a.name); });
          } else if (k.nodeType !== 3) node.removeChild(k);
        });
      })(t.content);
      return { html: t.innerHTML, text: (t.content.textContent || '').replace(/\s+/g, ' ').trim() };
    } catch (e) { return { html: '', text: '' }; }
  }
  /* Alkyone.defineTerm('key', 'text with <sub>2</sub>') - <button class="term" data-term="key"> binds automatically */
  A.defineTerm = function (key, html) { if (key) terms[key] = cleanHtml(html); };
  A.defineTerm('ble', 'Bluetooth Low Energy: the short-range wireless used by many wearables. It is designed to use very little battery.');
  A.defineTerm('imu', 'Inertial measurement unit: a tiny motion sensor, like the one that turns your phone screen sideways. It feels movement and tilt.');
  A.defineTerm('spo2', 'SpO<sub>2</sub> is the oxygen level in the blood, shown as a percentage. It is estimated by shining light through the skin.');
  A.defineTerm('optical', 'Optical means it uses light. Tiny lights shine on the skin and a sensor reads what comes back.');
  A.defineTerm('heartbeat', 'A tiny “I am still here” message the patch sends on a steady rhythm. If the messages stop, the ring knows something is wrong.');
  A.defineTerm('ece', 'Electrical and computer engineering: designing circuits, sensors and the software that runs on them.');
  A.defineTerm('fusion', 'Sensor fusion: combining readings from several sensors so they can cross-check each other.');
  A.defineTerm('ml', 'Machine learning: software that learns patterns from examples instead of following fixed rules.');
  A.defineTerm('baseline', 'What is typical for one particular baby, rather than for babies in general.');
  A.defineTerm('flex', 'A flexible circuit: electronics on a thin, bendable film instead of a rigid board, so it can follow the body’s curves.');
  A.defineTerm('ondevice', 'The sound is processed inside the patch itself. No audio is stored.');
  A.defineTerm('escalation', 'Passing an unanswered alert on to someone else.');
  A.defineTerm('maintenance', 'Spotting that the electronics are wearing down, such as a weak battery, poor skin contact or a fading signal, before they cause trouble.');
  A.defineTerm('staging', 'Splitting sleep into stages, such as lighter and deeper sleep.');

  /* ------------------------------------------------------------------------------------------ tooltips */
  var tipEl = null, tipBody = null;
  var tip = { cur: null, mode: null, at: 0, openT: 0, closeT: 0, lastClose: -1e4, kbd: false };
  function termFrom(t) { return t && t.closest ? t.closest('.term[data-term]') : null; }
  function themeOf(el) { var b = el.closest ? el.closest('[data-theme]') : null; return b && b.getAttribute('data-theme') === 'night' ? 'night' : 'mist'; }
  function placeTip(trigger) {
    var r = trigger.getBoundingClientRect();
    var vw = root.clientWidth, vh = window.innerHeight;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var M = 8, G = 10, topLimit = 56 + M;
    var cx = r.left + r.width / 2;
    var x = clamp(cx - w / 2, M, Math.max(M, vw - w - M));
    var above = r.top - topLimit, below = vh - r.bottom - M;
    var side = (above >= h + G || above >= below) ? 'top' : 'bottom';
    var y = side === 'top' ? r.top - h - G : r.bottom + G;
    y = clamp(y, M, Math.max(M, vh - h - M));
    var ax = clamp(cx - x, 20, Math.max(20, w - 20));
    tipEl.style.setProperty('--tip-x', Math.round(x) + 'px');
    tipEl.style.setProperty('--tip-y', Math.round(y) + 'px');
    tipEl.style.setProperty('--tip-ax', Math.round(ax) + 'px');
    tipEl.style.setProperty('--tip-oy', side === 'top' ? '100%' : '0%');
    tipEl.setAttribute('data-side', side);
  }
  function showTip(trigger, mode) {
    if (!tipEl) return;
    var key = trigger.getAttribute('data-term');
    var def = hasOwn.call(terms, key) ? terms[key] : null;
    if (!def || !def.html || !trigger.isConnected) return;
    clearTimeout(tip.openT); clearTimeout(tip.closeT);
    var switching = tip.cur && tip.cur !== trigger;
    if (switching) { tip.cur.removeAttribute('aria-describedby'); }
    var instant = switching || (performance.now() - tip.lastClose) < 380;
    tip.cur = trigger; tip.mode = mode; tip.at = performance.now();
    if (tipBody.getAttribute('data-key') !== key) { tipBody.innerHTML = def.html; tipBody.setAttribute('data-key', key); }
    tipEl.setAttribute('data-on', themeOf(trigger));
    if (instant) tipEl.setAttribute('data-instant', ''); else tipEl.removeAttribute('data-instant');
    placeTip(trigger);
    tipEl.setAttribute('data-open', '');
    tipEl.removeAttribute('aria-hidden');
    trigger.setAttribute('aria-describedby', tipEl.id || 'tip');
  }
  function hideTip() {
    clearTimeout(tip.openT); clearTimeout(tip.closeT);
    if (!tip.cur) return;
    tip.cur.removeAttribute('aria-describedby');
    tip.cur = null; tip.mode = null;
    tip.lastClose = performance.now();
    if (tipEl) { tipEl.removeAttribute('data-open'); tipEl.setAttribute('aria-hidden', 'true'); }
  }
  function scheduleClose(ms) { clearTimeout(tip.closeT); tip.closeT = setTimeout(hideTip, ms); }
  function setupTooltips() {
    tipEl = document.getElementById('tip');
    if (!tipEl) {
      tipEl = document.createElement('div'); tipEl.id = 'tip'; tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.setAttribute('aria-hidden', 'true');
      tipEl.innerHTML = '<div class="tip__body"></div><i class="tip__arrow"></i>'; document.body.appendChild(tipEl);
    }
    tipBody = tipEl.querySelector('.tip__body');
    var P = { passive: true };
    /* hover (mouse and pen only): a short delay, none when another bubble was just open */
    document.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'touch') return;
      var t = termFrom(e.target);
      if (t) {
        clearTimeout(tip.closeT);
        if (tip.cur === t) return;
        clearTimeout(tip.openT);
        var quick = tip.cur || (performance.now() - tip.lastClose) < 380;
        tip.openT = setTimeout(function () { showTip(t, 'hover'); }, quick ? 0 : 170);
      } else if (tipEl.contains(e.target)) clearTimeout(tip.closeT);
    }, P);
    document.addEventListener('pointerout', function (e) {
      if (e.pointerType === 'touch') return;
      var t = termFrom(e.target);
      var into = e.relatedTarget;
      if (t) {
        if (into && (t.contains(into) || tipEl.contains(into))) return;
        clearTimeout(tip.openT);
        if (tip.cur === t && tip.mode === 'hover') scheduleClose(150);
      } else if (tipEl.contains(e.target) && !(into && (tipEl.contains(into) || (tip.cur && tip.cur.contains(into))))) {
        if (tip.mode === 'hover') scheduleClose(150);
      }
    }, P);
    /* tap / click / Enter / Space: toggle a pinned bubble */
    document.addEventListener('click', function (e) {
      var t = termFrom(e.target);
      if (!t) return;
      if (tip.cur === t && tip.mode === 'pinned') { hideTip(); return; }
      clearTimeout(tip.openT);
      if (tip.cur === t) tip.mode = 'pinned'; else showTip(t, 'pinned');
      var def = terms[t.getAttribute('data-term')];
      if (def && def.text && tip.cur === t) A.announce(def.text);
    });
    /* keyboard focus */
    document.addEventListener('keydown', function (e) {
      tip.kbd = true;
      if (e.key === 'Escape' && tip.cur) hideTip();
    });
    document.addEventListener('pointerdown', function (e) {
      tip.kbd = false;
      if (tip.cur && !tipEl.contains(e.target) && !termFrom(e.target)) hideTip();
    }, P);
    document.addEventListener('focusin', function (e) {
      var t = termFrom(e.target);
      if (t && tip.kbd) showTip(t, 'focus');
    });
    document.addEventListener('focusout', function (e) {
      var t = termFrom(e.target);
      /* a pinned bubble survives a tap inside it (that blurs the term); keyboard focus moving away still closes it */
      if (t && tip.cur === t && (tip.mode === 'focus' || tip.kbd) && !(e.relatedTarget && tipEl.contains(e.relatedTarget))) hideTip();
    });
    /* scrolling or resizing moves the trigger: close (after a short grace so focus-scrolling does not close it) */
    window.addEventListener('scroll', function () {
      if (!tip.cur) return;
      if (performance.now() - tip.at < 260) { placeTip(tip.cur); return; }
      hideTip();
    }, { passive: true, capture: true });
    window.addEventListener('resize', hideTip, P);
    window.addEventListener('blur', hideTip, P);
    document.addEventListener('visibilitychange', function () { if (document.hidden) hideTip(); }, P);
  }

  /* -------------------------------------------------------------------------------------------- reveal */
  function splitWords(el) {
    if (el.__alkSplit) return;
    el.__alkSplit = true;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    var words = [];
    nodes.forEach(function (node) {
      if (!node.nodeValue.trim() || (node.parentNode.closest && node.parentNode.closest('button, svg'))) return;
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var w = document.createElement('span'), i = document.createElement('span');
        w.className = 'w'; i.className = 'w__i'; i.textContent = part;
        w.appendChild(i); frag.appendChild(w); words.push(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
    var lineTop = -1e6, line = -1, first = 0;
    words.forEach(function (w, idx) {
      var top = w.offsetTop;
      if (Math.abs(top - lineTop) > 4) { line++; lineTop = top; first = idx; }
      w.firstChild.style.setProperty('--wd', String(Math.round(line * 120 + (idx - first) * 24)));
    });
    el.__alkLines = line + 1;
  }
  function showReveal(el) {
    if (el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    var lines = el.getAttribute('data-reveal') === 'lines';
    var delay = (parseInt(el.getAttribute('data-reveal-delay'), 10) || 0) * 75;
    var total = lines ? 1100 + (el.__alkLines || 1) * 120 + 400 : 900 + delay;
    setTimeout(function () { el.classList.add('is-done'); }, total + 300);
  }
  var revealIO = null;
  function observeReveal(el) {
    if (el.__alkRev) return;
    el.__alkRev = true;
    if (el.getAttribute('data-reveal') === 'lines') { try { splitWords(el); } catch (e) { /* plain text stays */ } }
    if (revealIO) revealIO.observe(el); else showReveal(el);
  }
  function setupReveal() {
    if ('IntersectionObserver' in window) {
      revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { showReveal(en.target); revealIO.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), observeReveal);
  }
  /* Alkyone.reveal(el): register an element that was added after load */
  A.reveal = function (el) { if (el && el.nodeType === 1) { if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', ''); observeReveal(el); } };

  /* ----------------------------------------------------------------- scenes: scheduler, nav, rail */
  var ORDER = ['hero', 'loop', 'patch', 'ring', 'app', 'sleep', 'future', 'team'];
  var registry = Object.create(null);  /* id -> record */
  var blocks = [];                      /* every themed top-level block: scenes, footer, dev blocks */
  var blockOf = new Map();              /* element -> block */
  var visible = [];                     /* blocks currently intersecting the viewport */
  var pxSubs = 0, pxOff = null;         /* scenes with a progress() callback currently on screen */
  var navEl = null, progressEl = null, railEl = null, railLinks = [], themeMeta = null;
  var navTheme = '', lastIdx = -2, lastPP = -1, lastRail = -1, scrolled = null, endPos = null, railOn = true, railMQ = null;
  var queued = false, resizeT = 0;

  function makeCtx(rec) {
    var ctx = { id: rec.id, el: rec.el, p: 0, pass: 0 };
    Object.defineProperty(ctx, 'reduced', { get: function () { return A.reduced; }, enumerable: true });
    Object.defineProperty(ctx, 'lowPower', { get: function () { return A.lowPower; }, enumerable: true });
    return ctx;
  }
  /* Alkyone.section(id, { init, enter, leave, progress, resize, reducedChange }) -> ctx */
  A.section = function (id, def) {
    var rec = registry[id];
    if (!rec) rec = registry[id] = { id: id };
    rec.def = def || {};
    rec.el = document.getElementById(id);
    rec.ctx = makeCtx(rec);
    rec.block = rec.el ? blockOf.get(rec.el) || null : null;
    if (rec.block) { if (rec.block.near) startInit(rec); if (rec.block.visible && rec.ready) maybeEnter(rec); }
    return rec.ctx;
  };
  function startInit(rec) {
    if (rec.started || !rec.def) return;
    rec.started = true;
    var r;
    try { r = rec.def.init ? rec.def.init(rec.ctx) : undefined; } catch (e) { rec.dead = true; return; }
    if (r && typeof r.then === 'function') {
      r.then(function () { rec.ready = true; if (rec.block && rec.block.visible) maybeEnter(rec); }, function () { rec.dead = true; });
    } else { rec.ready = true; if (rec.block && rec.block.visible) maybeEnter(rec); }
  }
  function maybeEnter(rec) {
    if (!rec.ready || rec.dead || rec.entered) return;
    rec.entered = true;
    safe(rec.def.enter, rec.ctx);
    if (typeof rec.def.progress === 'function') { pxSubs++; if (pxSubs === 1) pxOff = A.raf(function () { tick(); }); }
    requestTick();
  }
  /* a scene that leaves (or has never been seen) gets its exact end value: 0 below the viewport, 1 above it, whatever the last frame saw */
  function settleP(b, p) {
    if (b.p === p) return;
    b.p = p;
    if (b.el.hasAttribute('data-p')) b.el.style.setProperty('--p', String(p));
    var rec = registry[b.id];
    if (rec && rec.ctx) { rec.ctx.p = p; rec.ctx.pass = p; if (rec.entered && typeof rec.def.progress === 'function') safe(rec.def.progress, p, rec.ctx); }
  }
  function maybeLeave(rec) {
    if (!rec.entered) return;
    rec.entered = false;
    safe(rec.def.leave, rec.ctx);
    if (typeof rec.def.progress === 'function') { pxSubs = Math.max(0, pxSubs - 1); if (pxSubs === 0 && pxOff) { pxOff(); pxOff = null; } }
  }

  function setNavTheme(theme) {
    if (theme === navTheme) return;
    navTheme = theme;
    root.setAttribute('data-nav', theme);
    if (themeMeta) themeMeta.setAttribute('content', theme === 'night' ? '#071723' : '#F6FAFB');
  }
  function setRailIndex(idx) {
    if (idx === lastIdx) return;
    lastIdx = idx;
    for (var i = 0; i < railLinks.length; i++) {
      var l = railLinks[i];
      if (i === idx) l.setAttribute('aria-current', 'location'); else l.removeAttribute('aria-current');
      l.classList.toggle('is-past', i < idx);
    }
  }
  var rectBuf = [];
  function tick() {
    queued = false;
    var vh = window.innerHeight || root.clientHeight;
    var y = window.pageYOffset || 0;
    var n = visible.length, i, b, r;
    for (i = 0; i < n; i++) rectBuf[i] = visible[i].el.getBoundingClientRect();     /* all reads first */
    var max = Math.max(0, root.scrollHeight - vh);
    var pp = max > 0 ? clamp(y / max, 0, 1) : 0;
    /* writes */
    var sc = y > 24;
    if (sc !== scrolled) { scrolled = sc; root.classList.toggle('is-scrolled', sc); }
    var end = pp > 0.5;
    if (end !== endPos) { endPos = end; if (end) root.setAttribute('data-pos', 'end'); else root.removeAttribute('data-pos'); }
    if (progressEl && Math.abs(pp - lastPP) > 0.0004) { lastPP = pp; progressEl.style.setProperty('--page-p', pp.toFixed(4)); }
    var probe = 28, mid = vh * 0.5, th = null, cur = -1, curF = 0, inFooter = false;
    for (i = 0; i < n; i++) {
      b = visible[i]; r = rectBuf[i];
      if (th === null && r.top <= probe && r.bottom > probe) th = b.theme === 'night' ? 'night' : 'mist';
      if (r.top <= mid && r.bottom > mid) {
        if (b.index >= 0) { cur = b.index; curF = clamp((mid - r.top) / Math.max(1, r.height), 0, 1); }
        else if (b.footer) inFooter = true;
      }
      if (b.scene) {
        var p = clamp((vh - r.top) / (vh + r.height), 0, 1);
        var pass = clamp(-r.top / Math.max(1, r.height), 0, 1);
        if (Math.abs(p - b.p) > 0.0004 || b.p < 0) { b.p = p; if (b.el.hasAttribute('data-p')) b.el.style.setProperty('--p', p.toFixed(4)); }   /* --p only where asked for: it inherits, so a write restyles the scene's subtree */
        var rec = registry[b.id];
        if (rec) {
          rec.ctx.p = p; rec.ctx.pass = pass;
          if (rec.entered && typeof rec.def.progress === 'function') safe(rec.def.progress, p, rec.ctx);
        }
      }
    }
    if (th) setNavTheme(th);
    if (inFooter && cur < 0) { cur = ORDER.length - 1; curF = 1; }
    setRailIndex(cur);
    if (railEl && railOn) {
      var rp = cur < 0 ? 0 : cur >= ORDER.length - 1 ? 1 : (cur + curF) / (ORDER.length - 1);
      if (Math.abs(rp - lastRail) > 0.001) { lastRail = rp; railEl.style.setProperty('--rail-p', rp.toFixed(4)); }
    }
    rectBuf.length = 0;
  }
  /* while a scene with progress() is on screen the shared loop ticks every frame, so events need not queue another */
  function requestTick() { if (!queued && !pxOff) { queued = true; requestAnimationFrame(tick); } }

  function setupScenes() {
    navEl = document.querySelector('.nav');
    progressEl = document.querySelector('.nav__progress');
    railEl = document.querySelector('.rail');
    themeMeta = document.querySelector('meta[name="theme-color"]');
    try {   /* the rail only exists on large screens: do not write its progress variable where it is display:none */
      railMQ = window.matchMedia('(min-width: 1100px) and (min-height: 480px)');
      railOn = railMQ.matches;
      var onRail = function () { railOn = railMQ.matches; lastRail = -1; requestTick(); };
      if (railMQ.addEventListener) railMQ.addEventListener('change', onRail); else if (railMQ.addListener) railMQ.addListener(onRail);
    } catch (e) { railOn = true; }
    railLinks = ORDER.map(function (id) { return document.querySelector('.rail__link[href="#' + id + '"]'); }).map(function (l) { return l || document.createElement('a'); });
    var els = document.querySelectorAll('main > [data-theme], footer[data-theme]');
    Array.prototype.forEach.call(els, function (el) {
      var isFooter = el.tagName === 'FOOTER';
      var b = { el: el, id: el.id || '', theme: el.getAttribute('data-theme'), footer: isFooter, scene: !isFooter, index: ORDER.indexOf(el.id), near: false, visible: false, p: -1 };
      blocks.push(b); blockOf.set(el, b);
      var rec = registry[b.id];
      if (rec) { rec.el = el; rec.block = b; if (rec.ctx) rec.ctx.el = el; }
    });
    if (!('IntersectionObserver' in window)) {   /* no observers: everything is "near" and "visible" once */
      blocks.forEach(function (b) { b.near = b.visible = true; visible.push(b); b.el.classList.add('is-visible'); var rec = registry[b.id]; if (rec) { startInit(rec); } });
      requestTick();
      return;
    }
    var nearIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var b = blockOf.get(en.target); if (!b) return;
        b.near = en.isIntersecting;
        if (b.scene && !b.visible) settleP(b, en.boundingClientRect.top > 0 ? 0 : 1);   /* parked above or below: exact end value */
        var rec = registry[b.id];
        if (b.near && rec) { rec.block = b; startInit(rec); }
      });
    }, { rootMargin: '100% 0px 100% 0px', threshold: 0 });
    var seeIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var b = blockOf.get(en.target); if (!b) return;
        var was = b.visible;
        b.visible = en.isIntersecting;
        if (!b.visible && b.scene) settleP(b, en.boundingClientRect.top > 0 ? 0 : 1);
        if (b.visible === was) return;
        var rec = registry[b.id];
        if (b.visible) {
          visible.push(b); b.el.classList.add('is-visible');
          if (rec) { rec.block = b; maybeEnter(rec); }
        } else {
          visible.splice(visible.indexOf(b), 1); b.el.classList.remove('is-visible');
          if (rec) maybeLeave(rec);
        }
        requestTick();
      });
    }, { rootMargin: '0px', threshold: 0 });
    blocks.forEach(function (b) { nearIO.observe(b.el); seeIO.observe(b.el); });
    window.addEventListener('scroll', requestTick, { passive: true });
    if ('ResizeObserver' in window) { try { new ResizeObserver(requestTick).observe(document.body); } catch (e) { /* ignore */ } }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestTick, noop);
    requestTick();
  }

  function coarse() { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }
  var lastW = window.innerWidth, lastH = window.innerHeight;
  function doResize() {
    requestTick();
    /* touch browsers resize the window by 50-120px when the address bar shows or hides: not a layout change, so scenes are not told */
    var w = window.innerWidth, h = window.innerHeight, urlBar = w === lastW && Math.abs(h - lastH) <= 160 && coarse();
    lastW = w; lastH = h;
    if (urlBar) return;
    Object.keys(registry).forEach(function (id) { var rec = registry[id]; if (rec.ready && !rec.dead) safe(rec.def.resize, rec.ctx); });
    resizeSubs.forEach(function (fn) { safe(fn); });
  }
  function onWindowResize() { clearTimeout(resizeT); resizeT = setTimeout(doResize, 140); }

  function onReducedChange() {
    A.reduced = !!(mqReduce && mqReduce.matches);
    root.setAttribute('data-motion', A.reduced ? 'reduced' : 'full');
    Object.keys(registry).forEach(function (id) { var rec = registry[id]; if (rec.ready && !rec.dead) safe(rec.def.reducedChange, A.reduced, rec.ctx); });
  }

  /* ------------------------------------------------------------------------------- three, webgl, haptics */
  var threeP = null;
  /* Alkyone.loadThree() -> Promise<THREE | null>. Memoised, 10 s budget over both CDNs, never rejects. */
  A.loadThree = function () {
    if (threeP) return threeP;
    threeP = new Promise(function (resolve) {
      var done = false, timer = 0;
      function finish(m) { if (done) return; done = true; clearTimeout(timer); if (m) A.THREE = m; resolve(m || null); }
      timer = setTimeout(function () { finish(null); }, 10000);
      var urls = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js', 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'];
      (function attempt(i) {
        if (done) return;
        if (i >= urls.length) { finish(null); return; }
        var p;
        try { p = import(urls[i]); } catch (e) { attempt(i + 1); return; }
        p.then(function (m) { if (m && m.WebGLRenderer) finish(m); else attempt(i + 1); }, function () { attempt(i + 1); });
      })(0);
    });
    return threeP;
  };
  var glCache = null;
  /* Alkyone.hasWebGL() -> boolean (cached). The probe context is released straight away. */
  A.hasWebGL = function () {
    if (glCache !== null) return glCache;
    glCache = false;
    var c = null;
    try {
      c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        glCache = true;
        var lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (e) { glCache = false; }
    if (c) { c.width = c.height = 1; }
    return glCache;
  };
  /* Alkyone.vibrate(pattern) -> boolean. Safe: no-op without support or before the first user gesture. */
  A.vibrate = function (pattern) {
    try {
      if (!navigator.vibrate) return false;
      var ua = navigator.userActivation;
      if (ua && !ua.hasBeenActive) return false;
      return !!navigator.vibrate(pattern);
    } catch (e) { return false; }
  };

  /* test hook (read-only snapshot) */
  A._debug = function () {
    return {
      registry: Object.keys(registry).map(function (id) { var r = registry[id]; return { id: id, started: !!r.started, ready: !!r.ready, entered: !!r.entered, dead: !!r.dead }; }),
      visible: visible.map(function (b) { return b.id || b.el.tagName; }),
      nav: navTheme, rail: lastIdx, raf: rafList.length, terms: Object.keys(terms), pxSubs: pxSubs
    };
  };

  /* ------------------------------------------------------------------------------------------- boot */
  function boot() {
    [setupAnnouncer, setupTooltips, setupReveal, setupScenes].forEach(function (fn) { try { fn(); } catch (e) { if (fn === setupReveal) root.classList.remove('js'); } });
    window.addEventListener('resize', onWindowResize, { passive: true });
    window.addEventListener('orientationchange', onWindowResize, { passive: true });
    if (mqReduce) { if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReducedChange); else if (mqReduce.addListener) mqReduce.addListener(onReducedChange); }
    A.ready = true;
  }
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  } catch (e) { root.classList.remove('js'); }
})();
