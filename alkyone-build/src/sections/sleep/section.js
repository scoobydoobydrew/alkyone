(function () {
  'use strict';
  var A = window.Alkyone;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var N = 540, START = 21 * 60 + 30;               /* 9:30 pm, 540 one-minute steps, to 6:30 am */
  var LABEL = { back: 'On back', side: 'On side', tummy: 'On tummy' };

  /* ---- the simulated night: seeded, deterministic, invented for this demo ---- */
  function mulberry(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function makeNight() {
    var r = mulberry(20240611), a = new Array(N + 1), p = 0, t = 0, pose = 'back', cls = new Array(N + 1);
    function wrapAbs(x) { x = ((x % 360) + 360) % 360; return x > 180 ? 360 - x : x; }
    while (t <= N) {
      var hold = 24 + Math.floor(r() * 66), i;
      for (i = 0; i < hold && t <= N; i++, t++) a[t] = p * 90 + (r() - .5) * 5 + Math.sin(t / 9) * 1.5;
      var m = ((p % 4) + 4) % 4, next;
      if (m === 0 || m === 2) next = p + (r() < .5 ? 1 : -1);
      else next = (r() < .72) ? p + (m === 1 ? -1 : 1) : p + (m === 1 ? 1 : -1);
      var dur = 3 + Math.floor(r() * 4);
      for (i = 1; i <= dur && t <= N; i++, t++) { var f = i / (dur + 1), e = .5 - .5 * Math.cos(Math.PI * f); a[t] = (p + (next - p) * e) * 90 + (r() - .5) * 4; }
      p = next;
    }
    for (var k = 0; k <= N; k++) {
      var w = wrapAbs(a[k]);
      if (pose === 'back' && w > 51) pose = 'side';
      else if (pose === 'side') { if (w < 39) pose = 'back'; else if (w > 141) pose = 'tummy'; }
      else if (pose === 'tummy' && w < 129) pose = 'side';
      cls[k] = pose;
    }
    return { a: a, cls: cls };
  }
  function clock(m) { var tot = START + Math.round(m), h = Math.floor(tot / 60) % 24, mm = tot % 60, ap = h >= 12 ? 'pm' : 'am', h12 = h % 12 || 12; return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap; }

  window.Alkyone.section('sleep', {
    init: function (ctx) {
      var root = ctx.el;
      var $ = function (s) { return root.querySelector(s); };
      var plate = $('.sleep-plate'), stage = $('.sleep-stage'), cv = $('.sleep-canvas'), c2 = cv.getContext('2d');
      var range = $('#sleep-range'), playBtn = $('#sleep-play'), playTxt = $('.sleep-play__text'), timeEl = $('#sleep-time'), poseEl = $('#sleep-pose-label'), angEl = $('#sleep-angle');
      var track = $('#sleep-track'), ribbon = $('#sleep-ribbon'), dial = $('.sleep-dial'), arrow = $('.sleep-dial__arrow'), ticks = $('.sleep-ticks');
      var night = makeNight();
      var minute = +range.value, shown = night.a[Math.round(minute)], playing = false, unsubAnim = null, unsubPlay = null, W = 0, H = 0, DPR = 1, lastPose = '', stepAcc = 0;

      /* ribbon: one rect per run of the same posture, drawn at real pixel size so the patterns stay square */
      function drawRibbon() {
        var w = Math.max(10, ribbon.clientWidth), h = Math.max(10, ribbon.clientHeight);
        ribbon.setAttribute('viewBox', '0 0 ' + w + ' ' + h); ribbon.textContent = '';
        var s = 0;
        for (var k = 1; k <= N + 1; k++) {
          if (k === N + 1 || night.cls[k] !== night.cls[s]) {
            var x0 = s / N * w, x1 = Math.min(N, k) / N * w;
            var r = document.createElementNS(SVGNS, 'rect');
            r.setAttribute('x', x0.toFixed(2)); r.setAttribute('y', 0); r.setAttribute('width', Math.max(0, x1 - x0).toFixed(2)); r.setAttribute('height', h);
            r.setAttribute('fill', 'url(#sleep-pat-' + night.cls[s] + ')'); ribbon.appendChild(r);
            if (s > 0) { var l = document.createElementNS(SVGNS, 'line'); l.setAttribute('class', 'sleep-ribbon__cut'); l.setAttribute('x1', x0.toFixed(2)); l.setAttribute('x2', x0.toFixed(2)); l.setAttribute('y1', 0); l.setAttribute('y2', h); ribbon.appendChild(l); }
            s = k;
          }
        }
        var f = document.createElementNS(SVGNS, 'rect'); f.setAttribute('class', 'sleep-ribbon__frame'); f.setAttribute('x', .5); f.setAttribute('y', .5); f.setAttribute('width', w - 1); f.setAttribute('height', h - 1); f.setAttribute('rx', 9); ribbon.appendChild(f);
      }
      if (ticks && !ticks.children.length) [150, 330].forEach(function (m) { var i = document.createElement('i'); i.style.setProperty('--x', (m / N).toFixed(4)); ticks.appendChild(i); });

      /* the figure: a small low-poly baby lying on a mattress, drawn with a tiny 3D projection on a 2D canvas.
         It rolls as one piece about its long axis; the patch sits on the chest. Nothing else moves. */
      var D2R = Math.PI / 180;
      function tube(spine, rx, rz, o) {
        o = o || {}; var Ns = o.N || 8, rings = [], faces = [], verts = [];
        for (var i = 0; i < spine.length; i++) {
          var a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)], t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          var tl = Math.hypot(t[0], t[1], t[2]) || 1; t = [t[0] / tl, t[1] / tl, t[2] / tl];
          var up = Math.abs(t[1]) > .9 ? [1, 0, 0] : [0, 1, 0];
          var s = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]], sl = Math.hypot(s[0], s[1], s[2]) || 1; s = [s[0] / sl, s[1] / sl, s[2] / sl];
          var n = [t[1] * s[2] - t[2] * s[1], t[2] * s[0] - t[0] * s[2], t[0] * s[1] - t[1] * s[0]];
          var ring = [];
          for (var k = 0; k < Ns; k++) {
            var th = (k / Ns) * Math.PI * 2 + (o.off || 0), c = Math.cos(th), sn = Math.sin(th), e = o.e || 2.4;
            var px = Math.sign(c) * Math.pow(Math.abs(c), 2 / e), pz = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
            verts.push([spine[i][0] + s[0] * rx[i] * px + n[0] * rz[i] * pz, spine[i][1] + s[1] * rx[i] * px + n[1] * rz[i] * pz, spine[i][2] + s[2] * rx[i] * px + n[2] * rz[i] * pz]);
            ring.push(verts.length - 1);
          }
          rings.push(ring);
        }
        for (i = 0; i < spine.length - 1; i++) for (k = 0; k < Ns; k++) { var k2 = (k + 1) % Ns; faces.push([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]]); }
        [0, spine.length - 1].forEach(function (end) {          /* rounded caps as a single point */
          var tip = spine[end], dir = end === 0 ? spine[0].map(function (v, q) { return v - spine[1][q]; }) : spine[end].map(function (v, q) { return v - spine[end - 1][q]; });
          var dl = Math.hypot(dir[0], dir[1], dir[2]) || 1; var r0 = Math.max(rx[end], rz[end]) * .8;
          verts.push([tip[0] + dir[0] / dl * r0, tip[1] + dir[1] / dl * r0, tip[2] + dir[2] / dl * r0]); var pi = verts.length - 1;
          for (var q = 0; q < Ns; q++) faces.push(end === 0 ? [rings[0][(q + 1) % Ns], rings[0][q], pi] : [rings[end][q], rings[end][(q + 1) % Ns], pi]);
        });
        return { verts: verts, faces: faces };
      }
      function ball(c, r, lat, lon) {
        var verts = [], faces = [], i, j;
        for (i = 0; i <= lat; i++) for (j = 0; j < lon; j++) { var ph = i / lat * Math.PI, th = j / lon * Math.PI * 2; verts.push([c[0] + r[0] * Math.cos(ph), c[1] + r[1] * Math.sin(ph) * Math.cos(th), c[2] + r[2] * Math.sin(ph) * Math.sin(th)]); }
        for (i = 0; i < lat; i++) for (j = 0; j < lon; j++) { var j2 = (j + 1) % lon; faces.push([i * lon + j, i * lon + j2, (i + 1) * lon + j2, (i + 1) * lon + j]); }
        return { verts: verts, faces: faces };
      }
      /* the baby: x runs from head (negative) to feet, y is up when lying on the back, z is sideways */
      var parts = [];
      function addPart(m, tone) { parts.push({ m: m, tone: tone }); }
      addPart(tube([[-9, 0, 0], [-4, .6, 0], [2, .3, 0], [8, 0, 0], [12, -.3, 0]], [10.5, 11.5, 10.5, 9, 7.5], [8.4, 9.6, 9, 7.6, 6.2], { N: 12, off: 0, e: 2.6 }), 'body');
      addPart(ball([-17.5, 1.2, 0], [8.4, 8.4, 8.4], 6, 12), 'head');
      addPart(ball([-17.5, 9.6, 0], [1.5, 1.4, 1.4], 3, 6), 'nose');
      [-1, 1].forEach(function (sd) {
        addPart(tube([[-6.5, 1, sd * 8.6], [-2, .2, sd * 12.6], [4.5, -.2, sd * 12.4]], [2.6, 2.4, 2.1], [2.6, 2.4, 2.1], { N: 6 }), 'limb');
        addPart(tube([[10.5, -.2, sd * 3.8], [16, .8, sd * 8.5], [21.5, 1.2, sd * 9.5]], [3.4, 3, 2.5], [3.4, 3, 2.5], { N: 6 }), 'limb');
      });
      var patch = []; for (var pi = 0; pi < 10; pi++) { var pa = pi / 10 * Math.PI * 2; patch.push([-4.5 + Math.cos(pa) * 3.6, 10.1, Math.sin(pa) * 2.4]); }
      var bodyVerts = []; parts.forEach(function (p) { p.m.verts.forEach(function (v) { bodyVerts.push(v); }); });
      var TONES = { body: [[26, 92, 104], [104, 188, 182]], head: [[112, 142, 168], [228, 240, 247]], limb: [[104, 138, 164], [212, 230, 242]], nose: [[150, 176, 196], [232, 242, 248]] };
      var LIGHT = (function () { var l = [-.38, .82, .42], n = Math.hypot(l[0], l[1], l[2]); return [l[0] / n, l[1] / n, l[2] / n]; })();
      var YAW = -30 * D2R, PIT = 36 * D2R, cyw = Math.cos(YAW), syw = Math.sin(YAW), cpt = Math.cos(PIT), spt = Math.sin(PIT);
      function view(p) {          /* world (x right, y up, z toward the viewer) -> screen-ish [x, y(up), depth] */
        var x = p[0] * cyw + p[2] * syw, z = -p[0] * syw + p[2] * cyw, y = p[1];
        return [x, y * cpt - z * spt, y * spt + z * cpt];
      }
      var MAT = { x: 34, z: 23, t: 5 };
      var fit = { s: 1, ox: 0, oy: 0 };
      function refit() {
        var xs = [], ys = [];
        [[-MAT.x, 0, -MAT.z], [MAT.x, 0, -MAT.z], [MAT.x, 0, MAT.z], [-MAT.x, 0, MAT.z], [-MAT.x, -MAT.t, MAT.z], [MAT.x, -MAT.t, MAT.z], [-26, 12, 0], [24, 10, 0], [-17, 25, 0]].forEach(function (p) { var v = view(p); xs.push(v[0]); ys.push(v[1]); });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        var narrow = W < 520;
        fit.s = Math.min(W * (narrow ? .92 : .8) / (x1 - x0), H * (narrow ? .8 : .84) / (y1 - y0));
        fit.ox = W * (narrow ? .5 : .47) - (x0 + x1) / 2 * fit.s; fit.oy = H * (narrow ? .53 : .56) + (y0 + y1) / 2 * fit.s;
      }
      function sx(v) { return v[0] * fit.s + fit.ox; }
      function sy(v) { return fit.oy - v[1] * fit.s; }
      function shade(n, tone) { var d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2], k = clamp01(.28 + .72 * (d * .5 + .5)), a = TONES[tone][0], b = TONES[tone][1]; return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k) + ')'; }
      function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
      function size() {
        DPR = Math.min(A.lowPower ? 1.5 : 2, window.devicePixelRatio || 1); W = stage.clientWidth; H = stage.clientHeight;
        cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR)); refit();
      }
      function draw() {
        if (!W || !H) return;
        var g = c2; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
        var th = shown * D2R, ct = Math.cos(th), st = Math.sin(th);
        function roll(p) { return [p[0], p[1] * ct - p[2] * st, p[1] * st + p[2] * ct]; }
        /* lift the rolled body so its lowest point rests on the mattress */
        var lift = 1e9; bodyVerts.forEach(function (v) { var y = v[1] * ct - v[2] * st; if (y < lift) lift = y; }); lift = -lift;
        function place(p) { var r = roll(p); r[1] += lift; return r; }
        /* mattress: top and front edges */
        var corners = [[-MAT.x, 0, -MAT.z], [MAT.x, 0, -MAT.z], [MAT.x, 0, MAT.z], [-MAT.x, 0, MAT.z]].map(view);
        function quad(vs, fill, stroke) { g.beginPath(); vs.forEach(function (v, i) { if (i) g.lineTo(sx(v), sy(v)); else g.moveTo(sx(v), sy(v)); }); g.closePath(); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); } }
        quad([[-MAT.x, 0, MAT.z], [MAT.x, 0, MAT.z], [MAT.x, -MAT.t, MAT.z], [-MAT.x, -MAT.t, MAT.z]].map(view), 'rgba(120,160,186,.26)', null);
        quad([[MAT.x, 0, MAT.z], [MAT.x, 0, -MAT.z], [MAT.x, -MAT.t, -MAT.z], [MAT.x, -MAT.t, MAT.z]].map(view), 'rgba(90,130,158,.3)', null);
        quad(corners, 'rgba(176,206,224,.20)', 'rgba(190,215,228,.45)');
        /* a soft shadow where the baby lies */
        var sh = []; for (var i = 0; i < 28; i++) { var a = i / 28 * Math.PI * 2; sh.push(view([Math.cos(a) * 25 - 1, 0, Math.sin(a) * 11])); }
        quad(sh, 'rgba(2,10,16,.32)', null);
        /* the baby's faces, back to front */
        var list = [];
        parts.forEach(function (pt) {
          var V = pt.m.verts.map(function (v) { var w = place(v); return { w: w, s: view(w) }; });
          pt.m.faces.forEach(function (f) {
            var A0 = V[f[0]], B0 = V[f[1]], C0 = V[f[2]];
            var u = [B0.w[0] - A0.w[0], B0.w[1] - A0.w[1], B0.w[2] - A0.w[2]], w2 = [C0.w[0] - A0.w[0], C0.w[1] - A0.w[1], C0.w[2] - A0.w[2]];
            var n = [u[1] * w2[2] - u[2] * w2[1], u[2] * w2[0] - u[0] * w2[2], u[0] * w2[1] - u[1] * w2[0]], nl = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
            var us = [B0.s[0] - A0.s[0], B0.s[1] - A0.s[1]], vs = [C0.s[0] - A0.s[0], C0.s[1] - A0.s[1]];
            if (us[0] * vs[1] - us[1] * vs[0] >= 0) return;               /* faces turned away from the viewer */
            var z = 0; f.forEach(function (ix) { z += V[ix].s[2]; });
            list.push({ z: z / f.length, pts: f.map(function (ix) { return V[ix].s; }), fill: shade(n, pt.tone) });
          });
        });
        list.sort(function (p, q) { return p.z - q.z; });
        list.forEach(function (f) { g.beginPath(); f.pts.forEach(function (v, k) { if (k) g.lineTo(sx(v), sy(v)); else g.moveTo(sx(v), sy(v)); }); g.closePath(); g.fillStyle = f.fill; g.strokeStyle = f.fill; g.lineWidth = .7; g.fill(); g.stroke(); });
        /* the patch on the chest: solid when it faces the viewer, a dashed outline when it is turned away or pressed down */
        var pw = patch.map(function (p) { return place(p); }), ps = pw.map(view);
        var nrm = roll([0, 1, 0]), nv = view([nrm[0], nrm[1], nrm[2]]), nv0 = view([0, 0, 0]), facing = (nv[2] - nv0[2]) > .05;
        var pcx = 0, pcy = 0; ps.forEach(function (v) { pcx += sx(v); pcy += sy(v); }); pcx /= ps.length; pcy /= ps.length;
        if (facing) { var gl = g.createRadialGradient(pcx, pcy, 0, pcx, pcy, fit.s * 9); gl.addColorStop(0, 'rgba(246,169,95,.5)'); gl.addColorStop(1, 'rgba(246,169,95,0)'); g.fillStyle = gl; g.fillRect(pcx - fit.s * 9, pcy - fit.s * 9, fit.s * 18, fit.s * 18); }
        g.beginPath(); ps.forEach(function (v, k) { if (k) g.lineTo(sx(v), sy(v)); else g.moveTo(sx(v), sy(v)); }); g.closePath();
        if (facing) { g.fillStyle = '#F6A95F'; g.fill(); g.strokeStyle = 'rgba(255,238,215,.95)'; g.lineWidth = 1.4; g.stroke(); }
        else { g.setLineDash([3, 3]); g.strokeStyle = 'rgba(246,169,95,.85)'; g.lineWidth = 1.4; g.stroke(); g.setLineDash([]); }
      }

      /* ---- state ---- */
      function pose(m) { return night.cls[Math.max(0, Math.min(N, Math.round(m)))]; }
      function setMinute(m, commit) {
        minute = Math.max(0, Math.min(N, m));
        range.value = String(Math.round(minute));
        var f = minute / N; track.style.setProperty('--sleep-f', f.toFixed(4));
        var ps = pose(minute), tgt = night.a[Math.round(minute)];
        timeEl.textContent = clock(minute); poseEl.textContent = LABEL[ps]; dial.setAttribute('data-pose', ps);
        range.setAttribute('aria-valuetext', clock(minute) + ', ' + LABEL[ps].toLowerCase());
        if (commit && A.announce && ps !== lastPose) A.announce(clock(minute) + ', ' + LABEL[ps].toLowerCase());
        lastPose = ps;
        if (A.reduced) { shown = tgt; paint(tgt); draw(); } else { startAnim(); }
      }
      function paint(v) {
        var w = ((v % 360) + 360) % 360; if (w > 180) w -= 360;
        arrow.setAttribute('transform', 'rotate(' + (v).toFixed(1) + ' 60 60)'); angEl.textContent = String(Math.round(Math.abs(w)));
      }
      function startAnim() {
        if (unsubAnim) return;
        unsubAnim = A.raf(function (t, dt) {
          var tgt = night.a[Math.round(minute)], d = tgt - shown;
          shown += d * (1 - Math.exp(-(dt || 16) / 110));
          if (Math.abs(d) < .15) { shown = tgt; unsubAnim(); unsubAnim = null; }
          paint(shown); draw();
        });
      }
      function setPlaying(on) {
        if (on === playing) return; playing = on;
        playBtn.setAttribute('data-state', on ? 'playing' : 'paused'); playTxt.textContent = on ? 'Pause' : 'Play';
        playBtn.setAttribute('aria-label', on ? 'Pause the simulated night' : 'Play the simulated night');
        if (unsubPlay) { unsubPlay(); unsubPlay = null; }
        if (on) {
          if (minute >= N) setMinute(0);
          stepAcc = 0;
          unsubPlay = A.raf(function (t, dt) {
            stepAcc += (dt || 16);
            if (A.reduced) { if (stepAcc >= 1000) { stepAcc = 0; setMinute(Math.min(N, minute + 20)); if (minute >= N) setPlaying(false); } return; }
            setMinute(Math.min(N, minute + (dt || 16) / 1000 * 20));
            if (minute >= N) setPlaying(false);
          });
        }
      }
      playBtn.addEventListener('click', function () { setPlaying(!playing); });
      range.addEventListener('input', function () { setPlaying(false); setMinute(+range.value); });
      range.addEventListener('change', function () { setMinute(+range.value, true); });

      var onSize = function () { size(); drawRibbon(); draw(); };
      if (A.onResize) A.onResize(onSize);
      size(); drawRibbon(); setMinute(minute); shown = night.a[Math.round(minute)]; paint(shown); draw();
      plate.classList.add('is-ready');
      api = { pause: function () { setPlaying(false); }, resize: onSize, redraw: function () { shown = night.a[Math.round(minute)]; paint(shown); draw(); } };
    },
    leave: function () { if (api) api.pause(); },
    resize: function () { if (api) api.resize(); },
    reducedChange: function () { if (api) api.redraw(); }
  });
  var api = null;
})();
