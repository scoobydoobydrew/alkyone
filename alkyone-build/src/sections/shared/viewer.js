/* ============================================================================
   Alkyone · viewer.js  - shared 3D viewer infrastructure (hero + patch)
   ----------------------------------------------------------------------------
   Alkyone.viewer.create({ container, THREE, backdrop, quality, maxDpr, ambientFps, beforeRender, onRender,
                           onLost, onRestored, onDpr })  ->  viewer | null
     A render manager around Alkyone.infant.scene: owns one WebGLRenderer + canvas inside `container`,
     renders ON DEMAND (only while the container is on screen AND something moves), caps and adapts the pixel
     ratio, keeps the canvas sized with a ResizeObserver, survives webgl context loss, disposes cleanly.
     It also holds a damped orbit camera (yaw / pitch / zoom around the active base frame), base frame
     tweening and blending, and projects the scene anchors to CSS pixels for hotspot buttons.

   Alkyone.viewer.attachControls(viewer|target, el, opts)
     Pointer drag, two-finger pinch, wheel (Ctrl/Cmd or while the element is focused and recently used) and
     keyboard on `el`. The page is never trapped: touch-action is pan-y and a plain wheel passes through.
     `target` may be any object with addOrbit(dAzDeg, dElDeg), scaleZoom(f), reset(), and optionally pitch: false.

   Both are plain functions: no globals except Alkyone.viewer, no console output.
   ========================================================================== */
(function () {
  'use strict';
  var A = window.Alkyone = window.Alkyone || {};
  var V = A.viewer = A.viewer || {};
  V.instances = V.instances || [];

  var D2R = Math.PI / 180;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function damp(c, t, l, dt) { return c + (t - c) * (1 - Math.exp(-l * dt / 1000)); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
  function cloneFrame(THREE, f) {
    return { position: new THREE.Vector3().copy(f.position), target: new THREE.Vector3().copy(f.target), fov: f.fov };
  }

  /* ------------------------------------------------------------------------------------------ create */
  V.create = function (o) {
    o = o || {};
    var THREE = o.THREE, box = o.container;
    if (!THREE || !box || !A.infant || !A.infant.scene) return null;
    var tStart = performance.now();
    var renderer, S, canvas;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    try {
      renderer.setClearColor(0x000000, 0);
      S = A.infant.scene.create(THREE, { backdrop: o.backdrop || 'mist', quality: o.quality || (A.lowPower ? 'low' : 'high') });
    } catch (e2) {
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e3) { /* ignore */ }
      return null;
    }
    canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'viewer-canvas';
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:pan-y;outline:none;-webkit-tap-highlight-color:transparent';
    if (o.before && o.before.parentNode === box) box.insertBefore(canvas, o.before); else box.appendChild(canvas);

    var camera = S.camera;
    var Y = new THREE.Vector3(0, 1, 0);
    var tmpOff = new THREE.Vector3(), tmpRight = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpC = new THREE.Vector3();

    /* ---- state */
    var v = { S: S, THREE: THREE, renderer: renderer, canvas: canvas, camera: camera, container: box, instances: V.instances };
    var disposed = false, lost = false, visible = false, dirty = true, ambient = !!o.ambient, unsub = null;
    var ambientFps = o.ambientFps || 30;
    var time = o.time == null ? 0 : o.time;                 // seconds, the only input of S.setTime
    var width = 2, height = 2;
    var maxDpr = Math.min(window.devicePixelRatio || 1, o.maxDpr || (A.lowPower ? 1.25 : 2));
    var dpr = maxDpr, minDpr = Math.min(1, maxDpr);
    var lastRender = 0, slowFrames = 0, goodFrames = 0;
    var lim = { az: 70, el: 35, zmin: 0.6, zmax: 1.6 };
    if (o.limits) for (var k in o.limits) lim[k] = o.limits[k];

    /* ---- base frame: spec = a, or a blended toward b by t. Resize recomputes frames in place, so keep references. */
    var spec = { a: o.frame || S.frames.hero, b: null, t: 0 };
    var base = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 };
    function evalBase() {
      var a = spec.a, b = spec.b, t = spec.t;
      if (!b || t <= 0) { base.position.copy(a.position); base.target.copy(a.target); base.fov = a.fov; }
      else if (t >= 1) { base.position.copy(b.position); base.target.copy(b.target); base.fov = b.fov; }
      else {
        base.position.lerpVectors(a.position, b.position, t); base.target.lerpVectors(a.target, b.target, t);
        base.fov = a.fov + (b.fov - a.fov) * t;
      }
      return base;
    }
    var orb = { az: 0, el: 0, zoom: 1 }, goal = { az: 0, el: 0, zoom: 1 };
    var tween = null;                                       // {t0, dur, ease}
    var lambda = 10;

    function applyCamera() {
      evalBase();
      tmpOff.copy(base.position).sub(base.target);
      if (orb.az) tmpOff.applyAxisAngle(Y, orb.az * D2R);
      if (orb.el) {
        tmpRight.set(tmpOff.z, 0, -tmpOff.x);
        if (tmpRight.lengthSq() > 1e-8) { tmpRight.normalize(); tmpOff.applyAxisAngle(tmpRight, -orb.el * D2R); }
      }
      tmpOff.multiplyScalar(orb.zoom);
      camera.position.copy(base.target).add(tmpOff);
      camera.lookAt(base.target);
      if (camera.fov !== base.fov) { camera.fov = base.fov; camera.updateProjectionMatrix(); }
    }
    v.applyCamera = applyCamera;

    v.setBase = function (a, b, t) { spec = { a: a, b: b || null, t: t || 0 }; tween = null; v.invalidate(); };
    v.setBlend = function (t) { if (spec.b) { spec.t = clamp(t, 0, 1); v.invalidate(); } };
    /* ease from wherever the base is now to `frame` (an object returned by S.frames); ms <= 0 jumps */
    v.tweenTo = function (frame, ms, ease) {
      if (!frame) return;
      if (!(ms > 0)) { v.setBase(frame); return; }
      var snap = cloneFrame(THREE, evalBase());
      spec = { a: snap, b: frame, t: 0 };
      tween = { t0: performance.now(), dur: ms, ease: ease || easeInOut };
      v.invalidate();
    };
    v.setOrbit = function (az, el, zoom, immediate) {
      goal.az = clamp(az, -lim.az, lim.az); goal.el = clamp(el, -lim.el, lim.el); goal.zoom = clamp(zoom, lim.zmin, lim.zmax);
      if (immediate) { orb.az = goal.az; orb.el = goal.el; orb.zoom = goal.zoom; }
      v.invalidate();
    };
    v.addOrbit = function (daz, del) { v.setOrbit(goal.az + (daz || 0), goal.el + (del || 0), goal.zoom); };
    v.scaleZoom = function (f) { v.setOrbit(goal.az, goal.el, goal.zoom * f); };
    v.resetOrbit = function (immediate) { v.setOrbit(0, 0, 1, immediate); };
    v.orbit = function () { return { az: orb.az, el: orb.el, zoom: orb.zoom, goal: { az: goal.az, el: goal.el, zoom: goal.zoom } }; };
    v.baseFrame = function () { return evalBase(); };
    v.setTimeSeconds = function (s) { time = s; v.invalidate(); };
    v.setLambda = function (l) { lambda = l; };

    function moving() {
      return !!tween || Math.abs(goal.az - orb.az) > 0.02 || Math.abs(goal.el - orb.el) > 0.02 || Math.abs(goal.zoom - orb.zoom) > 0.0004;
    }

    /* ---- hotspot projection (CSS px inside the container) */
    var breath = S.root.children[0];
    v.project = function (id) {
      var an = S.anchors[id];
      if (!an || !breath) return { x: 0, y: 0, hidden: true, depth: 0 };
      S.root.updateWorldMatrix(true, true);
      tmpP.copy(an.position); breath.localToWorld(tmpP);
      tmpN.copy(an.normal).transformDirection(breath.matrixWorld);
      tmpC.copy(camera.position).sub(tmpP);
      var dist = tmpC.length();
      var facing = tmpC.normalize().dot(tmpN);
      tmpP.project(camera);
      return { x: (tmpP.x * 0.5 + 0.5) * width, y: (-tmpP.y * 0.5 + 0.5) * height, hidden: tmpP.z > 1, facing: facing, depth: dist };
    };
    /* screen-space size of the patch lid: px per scene unit at the patch (for ring / pin scaling) */
    v.pxPerUnit = function () {
      var an = S.anchors.optical; if (!an) return 1;
      tmpP.copy(an.position); breath.localToWorld(tmpP);
      var dist = camera.position.distanceTo(tmpP);
      return height / (2 * Math.tan(camera.fov * D2R / 2) * Math.max(0.05, dist));
    };

    /* ---- size / pixel ratio */
    function measure() {
      var w = box.clientWidth || 2, h = box.clientHeight || 2;
      width = Math.max(2, w); height = Math.max(2, h);
    }
    function applySize() {
      measure();
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      S.resize(width, height);
    }
    function setDpr(d) {
      d = clamp(d, minDpr, maxDpr);
      if (Math.abs(d - dpr) < 0.01) return false;
      dpr = d; applySize(); v.renderNow();
      if (o.onDpr) { try { o.onDpr(dpr, v); } catch (e) { /* ignore */ } }
      return true;
    }
    applySize();

    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () {
        if (disposed) return;
        var w = box.clientWidth || 2, h = box.clientHeight || 2;
        if (w === width && h === height) return;
        applySize();
        if (o.onResize) { try { o.onResize(v, width, height); } catch (e) { /* ignore */ } }
        v.renderNow();                       // setSize clears the canvas: draw in the same task so it never flashes empty
      });
      ro.observe(box);
    }

    /* ---- render */
    var costs = [], costSum = 0;
    var first = { done: false, ms: 0 };
    v.stats = { createMs: 0, firstRenderMs: 0, avgRenderMs: 0, renders: 0, dpr: dpr, maxDpr: maxDpr, slowDprDrops: 0 };
    v.renderNow = function () {
      if (disposed || lost) return false;
      var t0 = performance.now();
      var again = false;
      if (o.beforeRender) { try { again = !!o.beforeRender(v, 0, time); } catch (e) { /* ignore */ } }
      applyCamera();
      S.setTime(time);
      renderer.render(S.scene, camera);
      if (o.onRender) { try { o.onRender(v); } catch (e2) { /* ignore */ } }
      var ms = performance.now() - t0;
      costs.push(ms); costSum += ms; if (costs.length > 90) costSum -= costs.shift();
      v.stats.renders++; v.stats.avgRenderMs = costSum / costs.length; v.stats.dpr = dpr;
      if (!first.done) { first.done = true; first.ms = ms; v.stats.firstRenderMs = ms; }
      lastRender = performance.now();
      return again;
    };
    v.invalidate = function () { dirty = true; sync(); };

    function wants() { return !disposed && !lost && visible && (ambient || dirty || moving() || extraBusy); }
    var extraBusy = false;
    function sync() {
      if (wants()) { if (!unsub) { lastRender = 0; pend = 0; unsub = A.raf(tick); } }
      else if (unsub) { var u = unsub; unsub = null; u(); }
    }
    var errs = 0, pend = 0;
    function tick(t, dtRaw) {
      if (disposed || lost) { sync(); return; }
      try {
        pend += Math.min(dtRaw || 16, 100);
        var dt = Math.min(pend, 64);
        var busy = dirty;
        if (tween) {
          var k = clamp((performance.now() - tween.t0) / tween.dur, 0, 1);
          spec.t = tween.ease(k);
          if (k >= 1) { spec = { a: spec.b, b: null, t: 0 }; tween = null; }
          busy = true;
        }
        if (moving() || busy) {
          orb.az = damp(orb.az, goal.az, lambda, dt); orb.el = damp(orb.el, goal.el, lambda, dt); orb.zoom = damp(orb.zoom, goal.zoom, lambda, dt);
          if (Math.abs(goal.az - orb.az) < 0.02) orb.az = goal.az;
          if (Math.abs(goal.el - orb.el) < 0.02) orb.el = goal.el;
          if (Math.abs(goal.zoom - orb.zoom) < 0.0004) orb.zoom = goal.zoom;
        }
        var interacting = busy || moving() || extraBusy;
        if (!interacting && ambient) {
          // ambient-only animation is throttled: nothing here needs 60 fps
          if (lastRender && performance.now() - lastRender < 1000 / ambientFps - 3) return;
        }
        if (ambient) time += Math.min(pend, 100) / 1000;
        pend = 0;
        dirty = false;
        var before = lastRender;
        var again = false;
        if (o.beforeRender) { try { again = !!o.beforeRender(v, dt, time); } catch (e) { /* ignore */ } }
        extraBusy = again;
        var t0 = performance.now();
        applyCamera();
        S.setTime(time);
        renderer.render(S.scene, camera);
        if (o.onRender) { try { o.onRender(v); } catch (e2) { /* ignore */ } }
        var now = performance.now(), ms = now - t0;
        costs.push(ms); costSum += ms; if (costs.length > 90) costSum -= costs.shift();
        v.stats.renders++; v.stats.avgRenderMs = costSum / costs.length;
        lastRender = now;
        // adapt the pixel ratio downward when the cadence stays poor while we ARE rendering every frame
        if (before && (interacting || !ambient)) {
          var gap = now - before;
          if (gap > 32 && gap < 250) { slowFrames++; goodFrames = 0; } else if (gap <= 22) { goodFrames++; if (goodFrames > 20) slowFrames = Math.max(0, slowFrames - 1); }
          if (slowFrames >= 36 && dpr > minDpr + 0.01) { slowFrames = 0; v.stats.slowDprDrops++; setDpr(dpr - 0.25); }
        }
        errs = 0;
      } catch (err) {
        if (++errs > 3) { lost = true; if (o.onLost) { try { o.onLost(v, 'error'); } catch (e4) { /* ignore */ } } }
      }
      if (!wants()) sync();
    }

    v.setAmbient = function (on) { ambient = !!on; sync(); if (on) v.invalidate(); };
    v.setVisible = function (on) { visible = !!on; if (visible) dirty = true; sync(); };
    v.isVisible = function () { return visible; };
    v.isLost = function () { return lost; };
    v.size = function () { return { w: width, h: height }; };

    /* ---- visibility (the container itself, not the scene) */
    var io = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        v.setVisible(e.isIntersecting);
      }, { rootMargin: '60px 0px 60px 0px' });
      io.observe(box);
    } else { visible = true; }

    /* ---- context loss */
    var lostTimer = 0;
    function onLostEv(e) {
      e.preventDefault();
      lost = true; sync();
      if (o.onLost) { try { o.onLost(v, 'context'); } catch (x) { /* ignore */ } }
    }
    function onRestoredEv() {
      lost = false;
      try { applySize(); } catch (x) { /* ignore */ }
      dirty = true;
      v.renderNow();
      sync();
      if (o.onRestored) { try { o.onRestored(v); } catch (x2) { /* ignore */ } }
    }
    canvas.addEventListener('webglcontextlost', onLostEv, false);
    canvas.addEventListener('webglcontextrestored', onRestoredEv, false);
    v.simulateContextLoss = function (ms) {          // for tests
      var ext = renderer.getContext().getExtension('WEBGL_lose_context');
      if (!ext) return false;
      ext.loseContext();
      if (ms >= 0) lostTimer = setTimeout(function () { try { ext.restoreContext(); } catch (e) { /* ignore */ } }, ms);
      return true;
    };

    /* ---- dispose */
    v.dispose = function () {
      if (disposed) return;
      disposed = true; sync();
      clearTimeout(lostTimer);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      canvas.removeEventListener('webglcontextlost', onLostEv, false);
      canvas.removeEventListener('webglcontextrestored', onRestoredEv, false);
      try { S.dispose(); } catch (e) { /* ignore */ }
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e2) { /* ignore */ }
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      var i = V.instances.indexOf(v); if (i >= 0) V.instances.splice(i, 1);
    };

    v.stats.createMs = performance.now() - tStart;
    V.instances.push(v);
    return v;
  };

  /* ------------------------------------------------------------------------------------------ controls */
  /* Pointer, pinch, wheel and keyboard on `el`, driving `target` (a viewer, or any object with the same few methods). */
  V.attachControls = function (target, el, opts) {
    opts = opts || {};
    var pointers = {}, ids = [];
    var drag = null, pinch = null, lastInteract = 0, userFired = false;
    var vel = { az: 0, el: 0, t: 0 };
    var DEG_PER_PX = opts.degPerPx || 0.32;

    function user(kind) {
      lastInteract = performance.now();
      if (!userFired) { userFired = true; if (opts.onUser) { try { opts.onUser(kind); } catch (e) { /* ignore */ } } }
    }
    function active() {
      return document.activeElement === el && performance.now() - lastInteract < 5000;
    }
    function pitchOk() { return target.pitch !== false; }
    function isUi(e) { return !!(e.target && e.target.closest && e.target.closest('button, a, [data-no-drag]')); }

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isUi(e)) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY, type: e.pointerType };
      ids = Object.keys(pointers);
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      if (ids.length === 1) {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType, moved: false };
        vel.az = vel.el = 0; vel.t = performance.now();
        if (opts.onGrab) opts.onGrab(true);
      } else if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)) };
        drag = null;
        user('pinch');
      }
      if (e.pointerType === 'mouse') { try { el.focus({ preventScroll: true }); } catch (y) { /* ignore */ } }
      lastInteract = performance.now();
    }
    function onMove(e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      var px = p.x, py = p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pinch && ids.length >= 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
        var f = pinch.d / d;                     // fingers apart -> smaller multiplier -> closer
        pinch.d = d;
        target.scaleZoom(f);
        user('pinch');
        return;
      }
      if (drag && drag.id === e.pointerId) {
        var dx = e.clientX - px, dy = e.clientY - py;
        if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 4) return;
        drag.moved = true;
        var daz = -dx * DEG_PER_PX;
        var del = (drag.type !== 'touch' && pitchOk()) ? dy * DEG_PER_PX * 0.8 : 0;
        target.addOrbit(daz, del);
        var now = performance.now(), dt = Math.max(8, now - vel.t); vel.t = now;
        vel.az = vel.az * 0.6 + (daz / dt) * 0.4; vel.el = vel.el * 0.6 + (del / dt) * 0.4;
        user('drag');
        if (e.cancelable && drag.type !== 'touch') e.preventDefault();
      }
    }
    function onUp(e) {
      var wasDrag = drag && drag.id === e.pointerId && drag.moved;
      delete pointers[e.pointerId];
      ids = Object.keys(pointers);
      try { el.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      if (ids.length < 2) pinch = null;
      if (wasDrag && e.type === 'pointerup' && performance.now() - vel.t < 80 && target.addOrbit) {
        target.addOrbit(vel.az * 140, vel.el * 140);          // a little inertia, the orbit damping does the rest
      }
      if (drag && drag.id === e.pointerId) { drag = null; if (opts.onGrab) opts.onGrab(false); }
    }
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', function (e) { if (pointers[e.pointerId]) onUp(e); });

    function onWheel(e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl || active()) {
        e.preventDefault();
        var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;
        var dy = e.deltaY * unit;
        var k = ctrl ? 0.01 : 0.0016;
        target.scaleZoom(Math.exp(clamp(dy, -240, 240) * k));
        user('wheel');
      } else if (opts.onWheelBlocked) {
        opts.onWheelBlocked(e);
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false });

    var STEP = { az: 12, el: 8, zoom: 0.84 };
    function step(dir, big) {
      var m = big ? 2 : 1;
      switch (dir) {
        case 'left': target.addOrbit(STEP.az * m, 0); break;       // the model turns to the left
        case 'right': target.addOrbit(-STEP.az * m, 0); break;
        case 'up': if (pitchOk()) target.addOrbit(0, -STEP.el * m); break;   // the front moves up
        case 'down': if (pitchOk()) target.addOrbit(0, STEP.el * m); break;
        case 'in': target.scaleZoom(STEP.zoom); break;
        case 'out': target.scaleZoom(1 / STEP.zoom); break;
        default: return;
      }
      user('step');
    }
    function onKey(e) {
      if (e.target !== el || e.ctrlKey || e.metaKey || e.altKey) return;
      var key = e.key, dir = null;
      if (key === 'ArrowLeft') dir = 'left'; else if (key === 'ArrowRight') dir = 'right';
      else if (key === 'ArrowUp') dir = 'up'; else if (key === 'ArrowDown') dir = 'down';
      else if (key === '+' || key === '=' || key === 'Add') dir = 'in';
      else if (key === '-' || key === '_' || key === 'Subtract') dir = 'out';
      else if (key === '0') { e.preventDefault(); user('reset'); if (target.reset) target.reset(); return; }
      else if (key === 'Escape') { try { el.blur(); } catch (x) { /* ignore */ } return; }
      if (!dir) return;
      e.preventDefault();
      step(dir, e.shiftKey);
    }
    el.addEventListener('keydown', onKey);
    el.addEventListener('focus', function () { lastInteract = performance.now(); });

    return {
      step: step,
      user: user,
      isActive: active,
      detach: function () {
        el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp);
        el.removeEventListener('wheel', onWheel); el.removeEventListener('keydown', onKey);
      }
    };
  };

  V.ease = { inOut: easeInOut, outQuart: easeOutQuart };
})();
