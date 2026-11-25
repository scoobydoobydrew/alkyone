(function () {
  'use strict';
  var A = window.Alkyone;
  var PX = .533, PY = .505;                 /* where the patch sits on the photo, as fractions of the picture */
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var easeIO = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeO = function (t) { return 1 - Math.pow(1 - t, 3); };

  window.Alkyone.section('hero', {
    init: function (ctx) {
      var root = ctx.el;
      var $ = function (s) { return root.querySelector(s); };
      var pin = $('#hero-pin'), stage = $('#hero-stage'), photo = $('#hero-photo'), wrap = $('#hero-imgwrap'), copy = $('#hero-copy'), foot = $('#hero-foot');
      var zoom = $('#hero-zoom'), lens = $('#hero-lens'), kicker = $('.hero-zoom__kicker'), cap = $('.hero-zoom__cap'), card = $('#hero-card'), svg = $('#hero-circuit');
      var mark = $('.hero-mark__pad'), stack = $('#hero-stack'), ring = $('#hero-ring'), dots = [].slice.call(root.querySelectorAll('#hero-dots span')), dotFill = $('#hero-dots-fill');
      var steps = [].map.call(root.querySelectorAll('#hero-steps li'), function (li) {
        return { part: li.getAttribute('data-part'), title: li.getAttribute('data-title'), text: li.querySelector('p').textContent.trim(), exp: !!li.getAttribute('data-exp') };
      });
      var parts = [].slice.call(svg.querySelectorAll('.hc-part')), mks = [].slice.call(svg.querySelectorAll('.hc-mk'));
      var M = null, on = false, lastQ = -1;
      /* where the highlight ring sits for each step, in the drawing's own units: centre x, centre y, radius */
      var SPOT = [[147, 207, 108], [290, 210, 62], [290, 210, 90], [339, 296, 96], [442, 208, 62], [550, 210, 138]];
      var N = steps.length, items = steps.map(function (s, i) {
        var d = document.createElement('div'); d.className = 'hero-card__item';
        d.innerHTML = '<p class="hero-card__n">' + (i + 1) + ' of ' + N + '</p><h3 class="hero-card__t"></h3><p class="hero-card__p"></p>' + (s.exp ? '<span class="exp-tag hero-card__tag">Exploratory</span>' : '');
        d.querySelector('h3').textContent = s.title; d.querySelector('.hero-card__p').textContent = s.text;
        stack.appendChild(d); return d;
      });
      var lerp = function (a, b, t) { return a + (b - a) * t; };

      function measure() {
        var save = [photo.style.transform, lens.style.transform];
        photo.style.transform = 'none'; lens.style.transform = 'none';
        var pr = pin.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        var wl = wrap.offsetLeft - wrap.offsetWidth / 2, wt = wrap.offsetTop, ww = wrap.offsetWidth, wh = wrap.offsetHeight;
        var px = wl + PX * ww, py = wt + PY * wh, sx = sr.left - pr.left, sy = sr.top - pr.top;
        var lw = lens.offsetWidth, lc = { x: pr.width / 2, y: lens.offsetTop + lens.offsetHeight / 2 };
        var w0 = Math.max(10, mark.offsetWidth || 30);
        var S = clamp((.17 * lw) / w0, 3, 5.5);
        var k0 = clamp((w0 * S) / (.62 * lw), .18, .6);
        M = { px: px, py: py, sx: sx, sy: sy, P0: { x: sx + px, y: sy + py }, C: lc, S: S, k0: k0 };
        photo.style.transform = save[0]; lens.style.transform = save[1];
      }

      function update() {
        if (!on || !M) return;
        var r = root.getBoundingClientRect(), total = Math.max(1, root.offsetHeight - window.innerHeight);
        var q = clamp(-r.top / total, 0, 1);
        if (Math.abs(q - lastQ) < .0004) return; lastQ = q;
        /* 1. the photo zooms toward the patch */
        var e = easeIO(clamp(q / .32)), s = 1 + (M.S - 1) * e;
        var cx = M.P0.x + (M.C.x - M.P0.x) * e, cy = M.P0.y + (M.C.y - M.P0.y) * e;
        photo.style.transform = 'translate3d(' + (cx - M.sx - s * M.px).toFixed(1) + 'px,' + (cy - M.sy - s * M.py).toFixed(1) + 'px,0) scale(' + s.toFixed(3) + ')';
        var po = 1 - smooth(.24, .4, q); photo.style.opacity = po.toFixed(3); photo.style.visibility = po < .01 ? 'hidden' : '';
        /* copy and foot step aside */
        var co = 1 - smooth(0, .16, q); copy.style.opacity = co.toFixed(3); copy.style.transform = 'translate3d(0,' + (-28 * (1 - co)).toFixed(1) + 'px,0)'; copy.style.visibility = co < .01 ? 'hidden' : '';
        var fo = 1 - smooth(0, .1, q); foot.style.opacity = fo.toFixed(3); foot.style.visibility = fo < .01 ? 'hidden' : '';
        stage.querySelector('.hero-caption').style.opacity = (1 - smooth(0, .12, q)).toFixed(3);
        /* 2. the flexible circuit arrives and grows to fill the plate */
        var zo = smooth(.24, .38, q);
        zoom.style.opacity = zo > .005 ? '1' : '0'; zoom.style.visibility = zo > .005 ? 'visible' : 'hidden';
        var k = M.k0 + (1 - M.k0) * easeO(smooth(.24, .52, q));
        lens.style.opacity = zo.toFixed(3); lens.style.transform = 'scale(' + k.toFixed(3) + ')';
        var to = smooth(.44, .54, q); kicker.style.opacity = to.toFixed(3); cap.style.opacity = to.toFixed(3);
        /* 3. the six cards, scrubbed by scroll. Position p runs 0..N over the card phase; between two steps the old card
              slides up and fades while the new one slides in over it, and the ring glides from one part to the next. */
        var cardIn = smooth(.5, .56, q), f = clamp((q - .54) / .4);
        var a = clamp(f * N - .5, 0, N - 1), i0 = Math.min(N - 2, Math.floor(a)), t = smooth(.25, .75, a - i0), pos = i0 + t;
        card.style.opacity = cardIn.toFixed(3); card.style.visibility = cardIn < .01 ? 'hidden' : '';
        var mv = A.reduced ? 0 : 22;
        items.forEach(function (it, i) {
          var o = 0, y = 0;
          if (i === i0) { o = 1 - smooth(.05, .65, t); y = -mv * smooth(0, 1, t); }
          else if (i === i0 + 1) { o = smooth(.35, .95, t); y = mv * (1 - smooth(0, 1, t)); }
          it.style.opacity = o.toFixed(3); it.style.visibility = o < .01 ? 'hidden' : 'visible'; it.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
        });
        var w = function (i) { return i === i0 ? 1 - t : i === i0 + 1 ? t : 0; };
        var dim = smooth(.5, .58, q), part = function (el, k, lo) { el.style.opacity = (1 - dim * (1 - (lo + (1 - lo) * w(k)))).toFixed(3); };
        parts.forEach(function (g) { part(g, +g.getAttribute('data-part') - 1, .3); });
        mks.forEach(function (g) { part(g, +g.getAttribute('data-for') - 1, .42); });
        var c0 = SPOT[i0], c1 = SPOT[i0 + 1], rs = lerp(c0[2], c1[2], t) / 100;
        ring.style.opacity = dim.toFixed(3);
        ring.style.transform = 'translate(' + lerp(c0[0], c1[0], t).toFixed(1) + 'px,' + lerp(c0[1], c1[1], t).toFixed(1) + 'px) scale(' + rs.toFixed(3) + ')';
        dotFill.style.transform = 'scaleX(' + (pos / (N - 1)).toFixed(4) + ')';
        dots.forEach(function (d, i) { d.style.opacity = (.3 + .7 * clamp(pos - i + 1, 0, 1)).toFixed(3); d.style.transform = 'scale(' + (.8 + .45 * w(i)).toFixed(3) + ')'; });
      }

      function pinOn() {
        if (on) return; on = true; root.classList.add('is-pinned'); lastQ = -1; measure(); update();
      }
      function pinOff() {
        on = false; root.classList.remove('is-pinned');
        [photo, lens, copy, foot, zoom, card, kicker, cap, ring, dotFill].forEach(function (n) { n.style.cssText = ''; });
        var c = stage.querySelector('.hero-caption'); if (c) c.style.cssText = '';
        items.concat(parts, mks, dots).forEach(function (n) { n.style.cssText = ''; });
      }
      function sync() { if (A.reduced) pinOff(); else pinOn(); }

      api = { sync: sync, update: update, remeasure: function () { if (!on) return; var q = lastQ; lastQ = -1; measure(); update(); } };
      sync();
      if (A.onResize) A.onResize(function () { api.remeasure(); });
      /* the image may arrive after the first measurement */
      var img = $('#hero-img'); if (img && !img.complete) img.addEventListener('load', function () { api.remeasure(); }, { once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { api.remeasure(); });
    },
    progress: function () { if (api) api.update(); },
    resize: function () { if (api) api.remeasure(); },
    reducedChange: function () { if (api) api.sync(); }
  });
  var api = null;
})();
