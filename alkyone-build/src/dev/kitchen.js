/* kitchen.js - dev only: fills the specimen read-outs, draws the faceted demo shape, and exercises the runtime API. */
(function () {
  var A = window.Alkyone;
  var kt = window.__kt = { events: [], counts: {} };
  function note(name) { kt.counts[name] = (kt.counts[name] || 0) + 1; if (kt.events.length < 400) kt.events.push(name); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---- 1. specimen read-outs (live: they follow the viewport) */
  function specs() {
    $$('[data-spec]').forEach(function (m) {
      var el = $(m.getAttribute('data-spec'));
      if (!el) return;
      var cs = getComputedStyle(el);
      var fam = cs.fontFamily.split(',')[0].replace(/["']/g, '');
      var ls = cs.letterSpacing === 'normal' ? '0' : parseFloat(cs.letterSpacing).toFixed(2) + 'px';
      m.textContent = fam + ' ' + cs.fontWeight + ' · ' + parseFloat(cs.fontSize).toFixed(1) + 'px / ' + (cs.lineHeight === 'normal' ? 'normal' : parseFloat(cs.lineHeight).toFixed(1) + 'px') + ' · tracking ' + ls;
    });
  }
  specs();
  if (A) A.onResize(specs);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(specs);

  /* ---- 2. a faceted demo solid (the page's visual language): flat-shaded triangles in the blue/teal ramp + one warm point.
          An icosahedron, projected by hand: 20 polygons, back faces hidden, Lambert shading mapped onto token colors. */
  var NS = 'http://www.w3.org/2000/svg';
  var PHI = (1 + Math.sqrt(5)) / 2;
  var V = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
  var F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  var RAMP = ['--night-600', '--blue-600', '--teal-800', '--teal-700', '--blue-500', '--teal-600', '--blue-400', '--teal-500', '--teal-400', '--teal-300'];
  var LIGHT = (function () { var l = [-0.45, 0.75, 0.62], n = Math.sqrt(l[0] * l[0] + l[1] * l[1] + l[2] * l[2]); return [l[0] / n, l[1] / n, l[2] / n]; })();
  var SCALE = 92 / Math.sqrt(1 + PHI * PHI);

  function rot(v, yaw, pitch) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y = v[1];
    return [x, y * cp - z * sp, y * sp + z * cp];
  }
  function build(stage) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-200 -150 400 300'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.setAttribute('class', 'layer');   /* rewritten per frame: own layer */
    var polys = F.map(function () { var p = document.createElementNS(NS, 'polygon'); p.style.strokeWidth = '0.7'; p.style.strokeLinejoin = 'round'; svg.appendChild(p); return p; });
    var pulse = document.createElementNS(NS, 'circle'); pulse.setAttribute('r', 11); pulse.setAttribute('class', 'kt-pulse'); svg.appendChild(pulse);
    var dot = document.createElementNS(NS, 'circle'); dot.setAttribute('r', 6.5); dot.style.fill = 'var(--warm)'; svg.appendChild(dot);
    stage.insertBefore(svg, stage.firstChild);
    stage.__kt = { polys: polys, pulse: pulse, dot: dot };
    return stage.__kt;
  }
  function render(stage, yaw) {
    var s = stage.__kt || build(stage), pitch = -0.52, best = -1, bx = 0, by = 0;
    var P = V.map(function (v) { return rot(v, yaw, pitch); });
    F.forEach(function (f, i) {
      var a = P[f[0]], b = P[f[1]], c = P[f[2]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      var poly = s.polys[i];
      if (nz <= 0.02) { if (poly.__on !== false) { poly.__on = false; poly.style.display = 'none'; } return; }
      if (poly.__on !== true) { poly.__on = true; poly.style.display = ''; }
      var lam = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      var tint = 'var(' + RAMP[Math.min(RAMP.length - 1, Math.round(Math.pow(lam, 0.8) * (RAMP.length - 1)))] + ')';
      poly.setAttribute('points', [a, b, c].map(function (q) { return (q[0] * SCALE).toFixed(1) + ',' + (-q[1] * SCALE).toFixed(1); }).join(' '));
      if (poly.__t !== tint) { poly.__t = tint; poly.style.fill = tint; poly.style.stroke = tint; }
      if (nz > best) { best = nz; bx = (a[0] + b[0] + c[0]) / 3 * SCALE; by = -(a[1] + b[1] + c[1]) / 3 * SCALE; }
    });
    s.dot.setAttribute('cx', bx.toFixed(1)); s.dot.setAttribute('cy', by.toFixed(1));
    s.pulse.setAttribute('cx', bx.toFixed(1)); s.pulse.setAttribute('cy', by.toFixed(1));
  }
  var stages = $$('[data-kt-stage]');
  stages.forEach(function (st, i) { render(st, 0.42 + i * 0.5); });

  /* ---- 3. runtime monitor (only while the components block is on screen) */
  var mon = $('#kt-mon'), off = null;
  function put(k, v) { var e = mon && $('[data-mon="' + k + '"]', mon); if (e && e.textContent !== String(v)) e.textContent = String(v); }
  function update() {
    var d = A._debug();
    put('reduced', A.reduced); put('lowPower', A.lowPower); put('nav', document.documentElement.getAttribute('data-nav') || '-');
    put('rail', d.rail < 0 ? 'none' : d.rail); put('visible', d.visible.join(', '));
    put('p', getComputedStyle($('#kitchen-ui')).getPropertyValue('--p') || '-');
  }
  if (A) {
    A.section('kitchen-ui', {
      init: function () { note('ui:init'); },
      enter: function () { note('ui:enter'); update(); off = A.raf(update, { fps: 4 }); },
      leave: function () { note('ui:leave'); if (off) { off(); off = null; } }
    });
    /* a scene that records every lifecycle call (the foundation tests read window.__kt); its solid turns with the scene's progress */
    A.section('kitchen-night', {
      init: function (ctx) { note('night:init'); kt.night = { id: ctx.id, hasEl: !!ctx.el }; },
      enter: function () { note('night:enter'); put('night', 'entered'); },
      leave: function () { note('night:leave'); put('night', 'left'); },
      progress: function (p, ctx) {
        kt.night.p = p; kt.night.pass = ctx.pass; kt.night.frames = (kt.night.frames || 0) + 1; note('night:progress'); put('night', 'p ' + p.toFixed(2));
        var st = ctx.el.querySelector('[data-kt-stage]'); if (st) render(st, 0.9 + p * 3.1);
      },
      resize: function () { note('night:resize'); },
      reducedChange: function (r) { note('night:reduced:' + r); }
    });
    /* an async init: a pending promise must delay enter */
    A.section('kitchen-teal', {
      init: function () { note('teal:init'); return new Promise(function (res) { setTimeout(function () { note('teal:init-done'); res(); }, 400); }); },
      enter: function () { note('teal:enter'); },
      leave: function () { note('teal:leave'); }
    });
    var n = 0;
    var btn = $('#kt-announce'); if (btn) btn.addEventListener('click', function () { A.announce('Kitchen announcement ' + (++n)); });
    var t = $('#kt-three'), out = $('#kt-three-out');
    if (t) t.addEventListener('click', function () { out.textContent = 'loading…'; A.loadThree().then(function (T) { out.textContent = T ? 'three r' + T.REVISION + ' loaded' : 'null - SVG fallback'; }); });
  }
})();
